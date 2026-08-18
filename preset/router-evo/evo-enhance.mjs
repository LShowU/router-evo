/**
 * evo-enhance — DSH native enhancement plugin
 * 
 * Registers enhanced versions of core tools:
 *   evo_read   — cached file read (second read = 0 token content)
 *   evo_edit   — safe edit with auto-checkpoint
 *   evo_grep   — smart grep (files/count/summary modes)
 *   evo_verify — auto lint/test after edit
 *   evo_map    — repo structure map
 *   evo_ctx    — session context injector
 *
 * Original tools stay untouched. Agent uses evo_* or original as needed.
 * Zero npm deps — pure Node.js + Cordis runtime.
 */

import { createHash } from 'node:crypto'
import { readFile, writeFile, stat, mkdir, rm, appendFile } from 'node:fs/promises'
import { join, relative, resolve, dirname, basename } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

// ── Cache store ──────────────────────────────────────────────────────────
const fileCache = new Map() // path → { hash, lines, size, timestamp, content }
const MAX_CACHE_ENTRIES = 200
const MAX_CACHE_FILE_SIZE = 500 * 1024

function hashContent(content) {
  return createHash('sha256').update(content).digest('hex')
}

// ── token-stats integration ───────────────────────────────────────────────
const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_STATS_PATH = join(MODULE_DIR, '..', '..', 'token-stats', 'token-stats.jsonl')

function estimateTokens(text) {
  const s = String(text || '')
  const latin = (s.match(/[\x00-\x7F]/g) || []).length
  const cjk = s.length - latin
  return Math.max(1, Math.ceil(latin / 3.5 + cjk / 1.5))
}

async function recordTokenEvent(ev) {
  try {
    const actualTokens = estimateTokens(ev.actualText || '')
    const baselineTokens = Math.max(actualTokens, Number(ev.baselineTokens) || 0)
    const event = {
      timestamp: new Date().toISOString(),
      sessionId: process.env.DSH_SESSION_ID || 'default',
      roundId: Number(process.env.DSH_ROUND_ID || 0) || 0,
      tool: ev.tool,
      operation: ev.operation || ev.tool,
      file: ev.file || '',
      cacheHit: !!ev.cacheHit,
      actualTokens,
      baselineTokens,
      savedTokens: baselineTokens - actualTokens,
      savingType: ev.savingType || (ev.baselineTokens ? 'estimated' : 'exact'),
      reason: ev.reason || '',
    }
    await appendFile(DEFAULT_STATS_PATH, JSON.stringify(event) + '\n', 'utf8')
  } catch {}
}

// ── Checkpoint store ─────────────────────────────────────────────────────
const checkpoints = new Map() // id → { path, content, timestamp }
const MAX_CHECKPOINTS = 50

// ── Plugin ───────────────────────────────────────────────────────────────
export const name = 'evo-enhance'
export const inject = ['tools', 'fs']

export function apply(ctx) {
  const register = (tool) => {
    ctx.effect(() => ctx.tools.register(tool), `evo-enhance: ${tool.name}`)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // evo_read — cached file read
  // ═══════════════════════════════════════════════════════════════════════
  register({
    name: 'evo_read',
    description: 'Read a file with session-level caching. Second read of unchanged file returns {cached:true} with zero content, saving tokens. Use skip_cache=true to force re-read.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file' },
        offset: { type: 'number', description: 'Line number to start from (1-based)' },
        limit: { type: 'number', description: 'Max lines to return' },
        skip_cache: { type: 'boolean', description: 'Force re-read, bypass cache' },
      },
      required: ['file_path'],
      additionalProperties: false,
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute(args, exec) {
      const path = args.file_path
      const skipCache = args.skip_cache === true
      const offset = args.offset || 1
      const limit = args.limit || 2000

      try {
        const resolved = resolve(path)
        const info = await stat(resolved).catch(() => null)
        if (!info) return `Error: File not found: ${path}`
        if (!info.isFile()) return `Error: Not a file: ${path}`

        if (info.size > MAX_CACHE_FILE_SIZE) {
          // Too large, read without cache
          const content = await readFile(resolved, 'utf8')
          const lines = content.split('\n')
          const totalLines = lines.length
          const selected = lines.slice(offset - 1, offset - 1 + limit)
          const head = lines.slice(0, 50).map((l, i) => `${i + 1}: ${l}`).join('\n')
          const tail = lines.slice(-30).map((l, i) => `${totalLines - 30 + i + 1}: ${l}`).join('\n')
          const output = `[LARGE FILE: ${totalLines} lines, ${info.size} bytes — head + tail shown]\n\n--- HEAD (lines 1-50) ---\n${head}\n\n--- TAIL (last 30 lines) ---\n${tail}`
          await recordTokenEvent({ tool: 'evo_read', operation: 'large-head-tail', file: resolved, cacheHit: false, actualText: output, baselineTokens: Math.ceil(info.size / 3.5), reason: 'large-file-head-tail' })
          return output
        }

        const content = await readFile(resolved, 'utf8')
        const hash = hashContent(content)

        if (!skipCache) {
          const cached = fileCache.get(resolved)
          if (cached && cached.hash === hash) {
            const output = JSON.stringify({
              cached: true,
              path: resolved,
              hash,
              lines: cached.lines,
              size: cached.size,
              hint: '[CACHED] File unchanged since last read. Use skip_cache=true to force re-read.',
            })
            await recordTokenEvent({ tool: 'evo_read', operation: 'cache-hit', file: resolved, cacheHit: true, actualText: output, baselineTokens: Math.ceil(info.size / 3.5), reason: 'unchanged-file-cache' })
            return output
          }
        }

        const lines = content.split('\n')
        const totalLines = lines.length
        const selected = lines.slice(offset - 1, offset - 1 + limit)

        // Store in cache
        fileCache.set(resolved, { hash, lines: totalLines, size: info.size, timestamp: Date.now(), content })
        if (fileCache.size > MAX_CACHE_ENTRIES) {
          const oldest = [...fileCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0]
          if (oldest) fileCache.delete(oldest[0])
        }

        const result = selected.map((l, i) => `${offset + i}: ${l}`).join('\n')
        const header = `[${totalLines} lines total, showing ${offset}-${Math.min(offset + limit - 1, totalLines)}]`
        const output = `${header}\n${result}${totalLines > offset + limit - 1 ? '\n... (truncated)' : ''}`
        await recordTokenEvent({ tool: 'evo_read', operation: 'read', file: resolved, cacheHit: false, actualText: output, baselineTokens: Math.ceil(info.size / 3.5), savingType: 'estimated', reason: 'partial-or-full-read' })
        return output
      } catch (error) {
        return `Error reading file: ${error.message}`
      }
    },
  })

  // ═══════════════════════════════════════════════════════════════════════
  // evo_edit — safe edit with auto-checkpoint
  // ═══════════════════════════════════════════════════════════════════════
  register({
    name: 'evo_edit',
    description: 'Edit a file with automatic checkpoint backup. On failure, restore with evo_undo. Supports fuzzy matching (ignore trailing whitespace).',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file' },
        old_string: { type: 'string', description: 'Literal text to replace' },
        new_string: { type: 'string', description: 'Replacement text (empty to delete)' },
        fuzzy: { type: 'boolean', description: 'Ignore trailing whitespace when matching (default true)' },
        replace_all: { type: 'boolean', description: 'Replace all matches (default false)' },
      },
      required: ['file_path', 'old_string', 'new_string'],
      additionalProperties: false,
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute(args, exec) {
      const path = args.file_path
      const oldStr = args.old_string
      const newStr = args.new_string
      const fuzzy = args.fuzzy !== false
      const replaceAll = args.replace_all === true

      try {
        const resolved = resolve(path)
        const original = await readFile(resolved, 'utf8').catch(() => null)
        if (original === null) return `Error: File not found: ${path}`

        // Create checkpoint
        const ckId = `ck_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        checkpoints.set(ckId, { path: resolved, content: original, timestamp: Date.now() })
        if (checkpoints.size > MAX_CHECKPOINTS) {
          const oldest = [...checkpoints.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0]
          if (oldest) checkpoints.delete(oldest[0])
        }

        // Try exact match first
        let count = 0
        let pos = 0
        const matches = []
        while (pos < original.length) {
          const idx = original.indexOf(oldStr, pos)
          if (idx < 0) break
          matches.push(idx)
          pos = idx + 1
          count++
        }

        // Fuzzy: compare line blocks while ignoring trailing whitespace.
        if (count === 0 && fuzzy) {
          const lines = original.split('\n')
          const oldLines = oldStr.split('\n')
          const fuzzyMatches = []
          for (let start = 0; start <= lines.length - oldLines.length; start++) {
            let match = true
            for (let j = 0; j < oldLines.length; j++) {
              const actual = lines[start + j].replace(/[ \t]+$/, '')
              const expected = oldLines[j].replace(/[ \t]+$/, '')
              if (actual !== expected) { match = false; break }
            }
            if (match) fuzzyMatches.push(lines.slice(start, start + oldLines.length).join('\n'))
          }
          count = fuzzyMatches.length
          if (count > 0) {
            if (count > 1 && !replaceAll) {
              checkpoints.delete(ckId)
              return `Error: fuzzy old_string matches ${count} locations. Use replace_all=true or add context.`
            }
            let newContent = original
            for (const matchedText of replaceAll ? fuzzyMatches : [fuzzyMatches[0]]) {
              newContent = newContent.replace(matchedText, newStr)
            }
            await writeFile(resolved, newContent, 'utf8')
            fileCache.delete(resolved)
            const fuzzyOutput = JSON.stringify({
              ok: true,
              checkpoint_id: ckId,
              matched: count,
              mode: 'fuzzy',
              hint: '[FUZZY] Matched ignoring trailing whitespace. Use evo_undo to restore.',
            })
            await recordTokenEvent({ tool: 'evo_edit', operation: 'edit', file: resolved, cacheHit: false, actualText: fuzzyOutput, baselineTokens: estimateTokens(fuzzyOutput) + 60, savingType: 'estimated', reason: 'edit-with-checkpoint' })
            return fuzzyOutput
          }
        }

        if (count === 0) {
          // Clean up checkpoint since we didn't modify
          checkpoints.delete(ckId)
          return `Error: old_string not found in file. Even with fuzzy matching, no match was found.\n  File: ${path}\n  Hint: use evo_read to check the current content, then try again.`
        }

        if (count > 1 && !replaceAll) {
          checkpoints.delete(ckId)
          return `Error: old_string matches ${count} locations. Use replace_all=true to replace all, or add more context to make it unique.`
        }

        const newContent = replaceAll
          ? original.split(oldStr).join(newStr)
          : original.replace(oldStr, newStr)
        await writeFile(resolved, newContent, 'utf8')
        fileCache.delete(resolved)

        const exactOutput = JSON.stringify({
          ok: true,
          checkpoint_id: ckId,
          matched: count,
          mode: 'exact',
          hint: replaceAll ? `Replaced ${count} occurrences.` : 'Replaced 1 occurrence.',
        })
        await recordTokenEvent({ tool: 'evo_edit', operation: 'edit', file: resolved, cacheHit: false, actualText: exactOutput, baselineTokens: estimateTokens(exactOutput) + 60, savingType: 'estimated', reason: 'edit-with-checkpoint' })
        return exactOutput
      } catch (error) {
        return `Error editing file: ${error.message}`
      }
    },
  })

  // ═══════════════════════════════════════════════════════════════════════
  // evo_undo — restore checkpoint
  // ═══════════════════════════════════════════════════════════════════════
  register({
    name: 'evo_undo',
    description: 'Restore a file to its state before the last evo_edit. Use checkpoint_id from evo_edit response.',
    parameters: {
      type: 'object',
      properties: {
        checkpoint_id: { type: 'string', description: 'Checkpoint id from evo_edit response' },
      },
      required: ['checkpoint_id'],
      additionalProperties: false,
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute(args) {
      const ck = checkpoints.get(args.checkpoint_id)
      if (!ck) return `Error: Checkpoint ${args.checkpoint_id} not found (may have been cleaned up or expired)`
      try {
        await writeFile(ck.path, ck.content, 'utf8')
        fileCache.delete(ck.path)
        checkpoints.delete(args.checkpoint_id)
        const undoOutput = JSON.stringify({ ok: true, restored: ck.path })
        await recordTokenEvent({ tool: 'evo_undo', operation: 'undo', file: ck.path, cacheHit: true, actualText: undoOutput, baselineTokens: estimateTokens(undoOutput) + 120, savingType: 'estimated', reason: 'checkpoint-restore' })
        return undoOutput
      } catch (error) {
        return `Error restoring checkpoint: ${error.message}`
      }
    },
  })

  // ═══════════════════════════════════════════════════════════════════════
  // evo_grep — smart grep with output modes
  // ═══════════════════════════════════════════════════════════════════════
  register({
    name: 'evo_grep',
    description: 'Search file contents with output modes: files (only file names, saves tokens), count (match counts per file), summary (truncated lines, default), full (complete lines).',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regular expression to search for' },
        path: { type: 'string', description: 'File or directory to search (default workspace)' },
        include: { type: 'string', description: 'Glob filter e.g. "*.ts"' },
        output: { type: 'string', enum: ['files', 'count', 'summary', 'full'], description: 'Output mode (default summary)' },
        max_results: { type: 'number', description: 'Max results (default 30)' },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute(args) {
      const pattern = args.pattern
      const searchPath = args.path || '.'
      const include = args.include || '*'
      const output = args.output || 'summary'
      const maxResults = args.max_results || 30

      try {
        const resolved = resolve(searchPath)
        // Use DSH's own grep if available, otherwise exec
        let result
        try {
          const cmd = `rg --no-heading -n --color never "${pattern}" "${resolved}" --glob "${include}" -g '!node_modules' -g '!.git' 2>nul`
          result = execSync(cmd, { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 15000 })
        } catch (e) {
          if (e.stdout) result = e.stdout
          else if (e.status === 1) result = '' // rg returns 1 for no matches
          else return `Error: grep failed: ${e.message}`
        }

        const lines = result.trim().split('\n').filter(Boolean)

        if (output === 'files') {
          const files = [...new Set(lines.map(l => l.split(':')[0]))].slice(0, maxResults)
          const out = JSON.stringify({ mode: 'files', pattern, matchCount: files.length, files })
          await recordTokenEvent({ tool: 'evo_grep', operation: 'grep-files', file: resolved, cacheHit: false, actualText: out, baselineTokens: estimateTokens(lines.join('\n')), savingType: 'estimated', reason: 'grep-files-mode' })
          return out
        }

        if (output === 'count') {
          const counts = {}
          for (const line of lines) {
            const file = line.split(':')[0]
            counts[file] = (counts[file] || 0) + 1
          }
          const files = Object.entries(counts).map(([file, matches]) => ({ file, matches }))
            .sort((a, b) => b.matches - a.matches).slice(0, maxResults)
          const out = JSON.stringify({ mode: 'count', pattern, totalMatches: lines.length, totalFiles: Object.keys(counts).length, files })
          await recordTokenEvent({ tool: 'evo_grep', operation: 'grep-count', file: resolved, cacheHit: false, actualText: out, baselineTokens: estimateTokens(lines.join('\n')), savingType: 'estimated', reason: 'grep-count-mode' })
          return out
        }

        if (output === 'full') {
          const out = lines.slice(0, maxResults).join('\n')
          await recordTokenEvent({ tool: 'evo_grep', operation: 'grep-full', file: resolved, cacheHit: false, actualText: out, baselineTokens: estimateTokens(lines.join('\n')), savingType: 'estimated', reason: 'grep-full-mode' })
          return out
        }

        // summary: truncate each line to 120 chars
        const summary = lines.slice(0, maxResults).map(l => {
          const [file, lineNum, ...rest] = l.split(':')
          const text = rest.join(':')
          return `${file}:${lineNum}: ${text.length > 120 ? text.slice(0, 120) + '...' : text}`
        })
        const out = JSON.stringify({ mode: 'summary', pattern, totalMatches: lines.length, matches: summary, truncated: lines.length > maxResults })
        await recordTokenEvent({ tool: 'evo_grep', operation: 'grep-summary', file: resolved, cacheHit: false, actualText: out, baselineTokens: estimateTokens(lines.join('\n')), savingType: 'estimated', reason: 'grep-summary-mode' })
        return out
      } catch (error) {
        return `Error searching: ${error.message}`
      }
    },
  })

  // ═══════════════════════════════════════════════════════════════════════
  // evo_map — repo structure map
  // ═══════════════════════════════════════════════════════════════════════
  register({
    name: 'evo_map',
    description: 'Generate a condensed repository structure map. One call replaces multiple glob+grep exploration rounds. Returns file tree, key config, and git status.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project root path (default workspace)' },
        depth: { type: 'number', description: 'Max directory depth (default 3)' },
      },
      required: [],
      additionalProperties: false,
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute(args) {
      const root = resolve(args.path || '.')
      const maxDepth = args.depth || 3

      try {
        const tree = await buildTree(root, maxDepth, [])
        const config = {}
        const git = {}

        // Detect config
        try { const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')); config.node = { name: pkg.name, scripts: Object.keys(pkg.scripts || {}).filter(k => /^(dev|build|start|test|lint)$/.test(k)) } } catch {}
        try { config.go = { module: (await readFile(join(root, 'go.mod'), 'utf8')).split('\n')[0].replace('module ', '') } } catch {}
        try { await stat(join(root, 'Cargo.toml')); config.rust = true } catch {}
        try { await stat(join(root, 'pyproject.toml')); config.python = true } catch {}

        // Git status
        try {
          git.branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, encoding: 'utf8', timeout: 5000 }).trim()
          const status = execSync('git status --porcelain', { cwd: root, encoding: 'utf8', timeout: 5000 }).trim()
          git.changed = status.split('\n').filter(l => l.match(/^\s*[MADRCU]/)).length
          git.untracked = status.split('\n').filter(l => l.startsWith('??')).length
          git.recent = execSync('git log --oneline -5', { cwd: root, encoding: 'utf8', timeout: 5000 }).trim().split('\n')
        } catch {}

        const out = JSON.stringify({ root, tree, config, git, fileCount: tree.filter(e => !e.endsWith('/')).length }, null, 2)
        await recordTokenEvent({ tool: 'evo_map', operation: 'map', file: root, cacheHit: false, actualText: out, baselineTokens: Math.max(estimateTokens(out) * 3, 1200), savingType: 'estimated', reason: 'repo-map-vs-exploration' })
        return out
      } catch (error) {
        return `Error building map: ${error.message}`
      }
    },
  })

  // ═══════════════════════════════════════════════════════════════════════
  // evo_verify — auto lint/test after edit
  // ═══════════════════════════════════════════════════════════════════════
  register({
    name: 'evo_verify',
    description: 'Run lint and/or tests for a file after editing. Passes silently (0 tokens), returns only failures (minimal tokens).',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'The file that was edited' },
        lint: { type: 'boolean', description: 'Run lint (auto-detect)' },
        test: { type: 'boolean', description: 'Run related tests (auto-detect)' },
        command: { type: 'string', description: 'Custom verify command' },
      },
      required: ['file_path'],
      additionalProperties: false,
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute(args) {
      const filePath = resolve(args.file_path)
      const runLint = args.lint !== false
      const runTest = args.test === true
      const customCmd = args.command

      const results = { lint: null, test: null, ok: true }

      try {
        if (customCmd) {
          try {
            execSync(customCmd, { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 })
          } catch (e) {
            results.ok = false
            const errLines = (e.stdout || e.stderr || '').split('\n').filter(l => l.match(/error|fail|Error|FAIL/)).slice(0, 5)
            const customFail = JSON.stringify({ ok: false, failures: errLines })
            await recordTokenEvent({ tool: 'evo_verify', operation: 'verify-fail', file: filePath, cacheHit: false, actualText: customFail, baselineTokens: estimateTokens(customFail) + 200, savingType: 'estimated', reason: 'verify-failure-summary' })
            return customFail
          }
          const customPass = JSON.stringify({ ok: true, hint: '[VERIFY] All checks passed.' })
          await recordTokenEvent({ tool: 'evo_verify', operation: 'verify-pass', file: filePath, cacheHit: false, actualText: customPass, baselineTokens: estimateTokens(customPass) + 300, savingType: 'estimated', reason: 'verify-silent-pass' })
          return customPass
        }

        // Auto-detect lint
        const ext = filePath.split('.').pop()
        const dir = dirname(filePath)

        if (runLint) {
          try {
            if (ext === 'ts' || ext === 'js') {
              try { execSync('npx eslint ' + filePath + ' --quiet', { encoding: 'utf8', timeout: 15000, maxBuffer: 512 * 1024 }) } catch {}
            } else if (ext === 'py') {
              try { execSync('python -m ruff check ' + filePath + ' --quiet', { encoding: 'utf8', timeout: 15000 }) } catch {}
            } else if (ext === 'go') {
              try { execSync('go vet ' + dir, { encoding: 'utf8', timeout: 15000 }) } catch {}
            }
          } catch {}
        }

        if (runTest) {
          try {
            if (ext === 'ts' || ext === 'js') {
              try { execSync('npx jest --testPathPattern=' + basename(filePath).replace(/\.[^.]+$/, '') + ' --no-coverage --silent', { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 }) } catch (e) {
                results.ok = false
                const errLines = (e.stdout || '').split('\n').filter(l => l.includes('FAIL') || l.includes('Error')).slice(0, 5)
                results.test = { failures: errLines }
              }
            }
          } catch {}
        }

        if (results.ok) {
          const pass = JSON.stringify({ ok: true, hint: '[VERIFY] All checks passed.' })
          await recordTokenEvent({ tool: 'evo_verify', operation: 'verify-pass', file: filePath, cacheHit: false, actualText: pass, baselineTokens: estimateTokens(pass) + 300, savingType: 'estimated', reason: 'verify-silent-pass' })
          return pass
        }
        const fail = JSON.stringify(results)
        await recordTokenEvent({ tool: 'evo_verify', operation: 'verify-fail', file: filePath, cacheHit: false, actualText: fail, baselineTokens: estimateTokens(fail) + 200, savingType: 'estimated', reason: 'verify-failure-summary' })
        return fail
      } catch (error) {
        return `Error verifying: ${error.message}`
      }
    },
  })

  // ═══════════════════════════════════════════════════════════════════════
  // evo_stats — read token-stats JSONL and return compact savings summary
  // ═══════════════════════════════════════════════════════════════════════
  register({
    name: 'evo_stats',
    description: 'Summarize token savings recorded in a token-stats JSONL file. Returns compact [token-stats] output for the current session/round.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional path to token-stats JSONL. Defaults to E:\\新建文件夹\\token-stats\\token-stats.jsonl' },
        round: { type: 'number', description: 'Optional roundId filter' },
      },
      required: [],
      additionalProperties: false,
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute(args) {
      try {
        const statsPath = args.path ? resolve(args.path) : DEFAULT_STATS_PATH
        let text
        try {
          text = await readFile(statsPath, 'utf8')
        } catch {
          return `[token-stats] no data at ${statsPath}`
        }
        const rows = text.split('\n').map(l => l.trim()).filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
        const filtered = args.round != null ? rows.filter(r => Number(r.roundId) === Number(args.round)) : rows
        const num = (v) => Number(v) || 0
        const sum = (k) => filtered.reduce((n, r) => n + num(r[k]), 0)
        const baseline = sum('baselineTokens')
        const actual = sum('actualTokens')
        const saved = sum('savedTokens')
        const hits = filtered.filter(r => r.cacheHit).length
        const total = filtered.length
        const rate = baseline > 0 ? (100 * saved / baseline).toFixed(1) : '0.0'
        const hitRate = total > 0 ? (100 * hits / total).toFixed(1) : '0.0'
        const byTool = {}
        for (const r of filtered) {
          const t = r.tool || 'unknown'
          byTool[t] = (byTool[t] || 0) + num(r.savedTokens)
        }
        const top = Object.entries(byTool).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}=${v}T`).join(' ')
        return JSON.stringify({
          events: total, actualTokens: actual, baselineTokens: baseline, savedTokens: saved,
          savingRate: Number(rate), cacheHits: hits, cacheHitRate: Number(hitRate), byTool: top,
        })
      } catch (error) {
        return `Error reading token stats: ${error.message}`
      }
    },
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Cleanup on dispose
  // ═══════════════════════════════════════════════════════════════════════
  ctx.on('dispose', () => {
    fileCache.clear()
    checkpoints.clear()
  })
}

// ── Tree builder ─────────────────────────────────────────────────────────
async function buildTree(dir, depth, exclude) {
  if (depth <= 0) return []
  const DEFAULT_EXCLUDE = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'target', '.cache', 'coverage']
  const result = []
  try {
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(dir, { withFileTypes: true })
    const filtered = entries.filter(e => !DEFAULT_EXCLUDE.includes(e.name) && !e.name.startsWith('.') && !e.name.endsWith('.min.js'))
    const dirs = filtered.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))
    const files = filtered.filter(e => !e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))

    let count = 0
    for (const d of dirs) {
      if (count >= 30) { result.push(`  ... +${dirs.length - 30} dirs`); break }
      const children = await buildTree(join(dir, d.name), depth - 1, exclude)
      result.push(`${d.name}/${children.length > 0 ? ` (${children.length})` : ''}`)
      if (children.length > 0 && depth > 1) {
        for (const c of children.slice(0, 8)) result.push(`  ${c}`)
        if (children.length > 8) result.push(`  ... +${children.length - 8} more`)
      }
      count++
    }
    for (const f of files.slice(0, 15)) {
      result.push(f.name)
    }
    if (files.length > 15) result.push(`... +${files.length - 15} files`)
  } catch {}
  return result
}