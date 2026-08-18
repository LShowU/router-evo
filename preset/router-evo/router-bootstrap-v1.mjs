/**
 * router-bootstrap: task-aware reasoning-mode router with a continuous
 * react鈫攕pec axis.
 *
 * Reads the session's first user message, classifies the task into a
 * continuous mode in [0,1] (0 = spec plan-first, 1 = react doer), and on the
 * first model request injects the matching persona and first-turn core tool
 * set. After the first durable tool/call the full preset catalog is exposed
 * and nothing is touched again; the mode derives from durable session events,
 * so resume/reload keeps it.
 *
 * The agent can read and tune its own routing through `dev_router_status` and
 * `dev_router_mode` (self-optimization loop) 鈥?mode accepts band names
 * (spec/spec-lean/balanced/react-lean/react), 0-100 numbers, or 0.0-1.0.
 *
 * Zero external imports on purpose: relative preset rows resolve bare
 * specifiers from the user home, where `@deepseek-ai/*` is not installed.
 * The router tools therefore inline a minimal schema compiler instead of
 * importing `defineTool` from `@deepseek-ai/dsh-tools`.
 */

import {
  applyPersona, bandFor, bandOf, coreFor, parseMode, personaFor, sessionMode, testinessFor, clamp01,
  isComplexTask,
} from './router-core.mjs'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'router-bootstrap'

/** Prompt assembly, the tools registry, and the LLM route must exist. */
export const inject = ['systemPrompt', 'tools', 'llm']

/** Extract plain text from a durable user/message event without assuming one shape. */
function extractText(data) {
  if (typeof data?.text === 'string') return data.text
  if (typeof data?.content === 'string') return data.content
  if (!Array.isArray(data?.content)) return ''
  return data.content
    .filter((part) => part && (part.type === 'text' || typeof part.text === 'string'))
    .map((part) => typeof part.text === 'string' ? part.text : '')
    .join('\n')
}

/** Minimal spec 鈫?JSON Schema compiler (subset of defineTool's work). */
function toJsonSchema(spec) {
  const properties = {}
  const required = []
  for (const [key, meta] of Object.entries(spec || {})) {
    const prop = { type: meta.type }
    if (Array.isArray(meta.enum)) prop.enum = meta.enum
    if (meta.description) prop.description = meta.description
    properties[key] = prop
    if (meta.required) required.push(key)
  }
  return { type: 'object', properties, required, additionalProperties: false }
}

export function apply(ctx, config) {
  const overrides = new Map() // session id -> explicit mode (number 0..1)
  const agents = new Map() // session id -> Agent (live handle, in-process only)
  const firstUserText = new Map() // session id -> first REAL user message text
  const firstAssemblySeen = new Set() // only the first model request is token-lean

  // 鈹€鈹€ 璺敱妯″紡锛坴0.2.0 鍛藉悕锛岀敤鎴峰畾涔夛級鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  // standard锛堥粯璁わ紝鏂帮級: RL 鎺ュ彛杩樺師鈥斺€旈杞彧鏈?RL 璁粌鍙?+ shell/str_replace_editor锛?
  //   妯″瀷"鎯充竴娈点€佸仛涓€娈?锛堝疄娴?25 姝?/ 24 宸ュ叿璋冪敤 / 浜у嚭鏂囦欢锛夈€?
  // spec锛堟棫锛? 娣卞害鎬濊€冧紭鍏堚€斺€斿垎绫?persona锛坵7/REACT/SPEC锛? 淇濈暀鍏ㄩ儴 sections锛?
  //   妯″瀷棣栬疆闀挎€濈淮閾撅紙101K 鎺ㄧ悊 0 琛屽姩鏄叾鐗瑰緛锛屼笉鏄己闄凤級銆?
  const routerMode = config.routerMode === 'spec' ? 'spec' : 'standard'
  const RL_PERSONA = 'You are a helpful software engineer assistant.'

  /** Spec mode keeps the original read-first surface. */
  function legacyCore(mode) {
    switch (bandOf(mode)) {
      case 'spec': return ['read', 'edit', 'glob', 'grep']
      default: return ['read', 'write', 'edit']
    }
  }

  /** Return only the smallest useful first-turn tool surface. */
  function leanFirstCore(text, available) {
    const value = String(text || '').toLowerCase()
    const command = /杩愯|鎵ц|鍛戒护|powershell|pwsh|shell|terminal|npm |pnpm |yarn |git |娴嬭瘯|缂栬瘧|鍚姩/.test(value)
    const code = /浠ｇ爜|鏂囦欢|鑴氭湰|椤圭洰|浠撳簱|浠ｇ爜|淇敼|缂栬緫|淇|bug|error|鎶ラ敊|閲嶆瀯|瀹炵幇|鍐欎竴涓獆娣诲姞|鍒犻櫎|readme|typescript|javascript|python|go |rust/.test(value)
    const core = new Set()
    if (command) {
      if (available.has('pwsh')) core.add('pwsh')
      else if (available.has('bash')) core.add('bash')
    } else if (code && available.has('str_replace_editor')) {
      core.add('str_replace_editor')
    }
    return core
  }

  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    const agent = context.agent
    if (agent === undefined) return assembled
    const session = agent.session
    agents.set(session.id, agent)

    // issue #3 fix: the first assembly happens before the first user/message
    // event lands in session.events, so sessionMode() saw an empty transcript
    // and injected the WEAK band on the path-committing first request. Use the
    // live text captured by the session/event listener (or inbox pending) so
    // the first request carries the REAL classification.
    const mode = overrides.get(session.id) ?? firstUserText.get(session.id) ?? sessionMode(session)
    const modelId = agent.options?.model

    // Token trimming is first-request-only. Every later request gets the full
    // original assembly, even when the first turn was plain chat with no tool.
    if (firstAssemblySeen.has(session.id)) return assembled
    firstAssemblySeen.add(session.id)

    // 鈹€鈹€ 妯″紡鍒嗘淳 鈹€鈹€
    // standard锛圧L 鎺ュ彛杩樺師锛? 棣栬疆 system = 鍙湁 RL 璁粌鍙ワ紱韬唤/Web 瀹氫綅/宸ュ叿寮曞/
    // 瑙勫垯 sections 鍏ㄩ儴绉婚櫎锛坢inimal 鐨?complete:true 璇箟锛屽疄娴?46 瀛楃 system 鈫?
    // 25 姝ヨ凯浠ｅ伐浣滄祦锛夈€?
    // spec锛堟繁搴︽€濊€冧紭鍏堬級: 鍒嗙被 persona + 淇濈暀鍏ㄩ儴 sections锛堥杞秴闀挎€濈淮閾炬槸鐗瑰緛锛夈€?
    let sections
    let core
    let persona
    if (routerMode === 'standard') {
      persona = RL_PERSONA
      // No plan section on the first request: it is large and causes avoidable
      // reasoning/tool overhead. Full sections return after the first tool call.
      sections = [{ name: 'router-persona', text: persona, order: 0 }]
      core = new Set()
    } else {
      persona = personaFor(mode, modelId)
      sections = applyPersona(assembled.sections, persona)
      core = new Set(legacyCore(mode))
    }

    if (session.events.some((event) => event.type === 'tool/call')) {
      return { ...assembled, sections, contexts: [] } // promoted: full catalog
    }

    const available = new Set(assembled.tools.map((tool) => tool.name))
    if (routerMode === 'standard') {
      // The first assembly can happen before the user/message event is durable.
      // Fall back to the proven shell+editor surface rather than risking a
      // tool-less code turn. Once text is available, narrow it further.
      core = firstUserText.has(session.id)
        ? leanFirstCore(firstUserText.get(session.id), available)
        : new Set(['str_replace_editor'])
    }
    const shell = available.has('pwsh') ? 'pwsh' : available.has('bash') ? 'bash' : null
    if (!firstUserText.has(session.id) && shell !== null) core.add(shell)

    return {
      ...assembled,
      sections,
      contexts: [],
      tools: assembled.tools.filter((tool) => core.has(tool.name)),
    }
  })

  // Capture the first real user message for classification only. Do not append
  // synthetic inbox messages: they add tokens and can race with real turns.
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'user/message') return
    const data = event.data ?? {}
    if (data.source?.kind !== 'user') return
    const text = extractText(data).trim()
    if (text && !firstUserText.has(session.id)) firstUserText.set(session.id, text)
  })

  // 鈹€鈹€ router visibility & tuning (agent self-optimization) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  const registerTool = (tool) => {
    ctx.effect(() => ctx.tools.register({
      ...tool,
      parameters: toJsonSchema(tool.parameters),
      // output.schema is already a plain JSON Schema; keep it as-is
    }))
  }

  const modeSpec = {
    mode: {
      type: 'string',
      required: true,
      description: 'band name (spec / weak / mixed / react), a 0-100 number, a 0.0-1.0 number, or auto to clear the override',
    },
  }

  function fmtMode(mode) {
    return typeof mode === 'string' ? mode : mode.toFixed(2)
  }

  registerTool({
    name: 'dev_router_status',
    description: 'Show this session\'s reasoning-mode routing: mode, band, persona, first-turn core tools, test-suppression, and whether an override is active.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    execute() {
      const session = currentSession()
      if (session === undefined) return 'no agent session'
      const mode = overrides.get(session.id) ?? sessionMode(session)
      const modelId = currentAgent()?.options?.model
      return [
        `router-mode=${routerMode} (standard=RL鎺ュ彛杩樺師 / spec=娣卞害鎬濊€冧紭鍏?`,
        `mode=${fmtMode(mode)} (band=${bandFor(mode)})`,
        `persona=${personaFor(mode, modelId).replace(/\n/g, ' / ')}`,
        `core=[${coreFor(mode).join(', ')}]`,
        `testiness=${testinessFor(mode)}`,
        `override=${overrides.has(session.id) ? 'yes' : 'no'}`,
      ].join('\n')
    },
  })

  registerTool({
    name: 'dev_router_mode',
    description: 'Set this session\'s reasoning mode: spec (plan-first) / weak (internal routing, model decides per task) / mixed (transition, trap) / react (doer). Accepts band names, 0-100, or 0.0-1.0; use auto to return to task classification. The next request applies it.',
    parameters: modeSpec,
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    execute(args) {
      const parsed = parseMode(args.mode)
      if (parsed === null) return `invalid mode "${args.mode}": use spec/weak/mixed/react, 0-100, 0.0-1.0, or auto`
      const session = currentSession()
      if (session === undefined) return 'no agent session'
      if (parsed === 'auto') overrides.delete(session.id)
      else overrides.set(session.id, parsed === 'weak' ? 'weak' : clamp01(parsed))
      const current = overrides.get(session.id) ?? sessionMode(session)
      return `mode=${fmtMode(current)} (band=${bandFor(current)}) 鈥?next request applies`
    },
  })

  // 鈹€鈹€ mode-isolated subagent: run a task in a DIFFERENT reasoning mode,
  //    without touching this session's trajectory (P6 showed tail persona
  //    is ineffective; DSH's native subagent inherits this persona, so the
  //    only working isolation is a fresh LLM call with its own system). 鈹€鈹€
  registerTool({
    name: 'dev_mode_subagent',
    description: 'Run one task in a DIFFERENT reasoning mode than this session, in a fresh isolated context (own system prompt). The current session trajectory is untouched. Mode: spec (plan-first) / weak (internal routing) / react (doer) / balanced. Returns the subagent\'s answer text.',
    parameters: {
      mode: { type: 'string', required: true, description: 'spec / weak / react / balanced (or 0-100)' },
      task: { type: 'string', required: true, description: 'the task to hand to the mode-isolated subagent' },
      maxTokens: { type: 'number', description: 'output cap (default 1024)' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      const parsed = parseMode(args.mode)
      if (parsed === null || parsed === 'auto') return `invalid mode "${args.mode}"`
      const session = currentSession()
      const agent = session === undefined ? undefined : [...agents.values()].find((a) => a.session === session)
      if (agent === undefined || agent.options === undefined) return 'no agent route available'
      const { provider, model } = agent.options
      if (!provider || !model) return 'agent route missing provider/model'

      const persona = personaFor(parsed, model)
      const maxTokens = Number(args.maxTokens || 1024)
      let text = ''
      let reasoningChars = 0
      try {
        const stream = ctx.llm.stream({
          provider,
          model,
          system: persona,
          messages: [{ role: 'user', content: [{ type: 'text', text: String(args.task) }] }],
          maxTokens,
        })
        for await (const chunk of stream) {
          if (chunk.type === 'text-delta') text += chunk.text
          else if (chunk.type === 'reasoning-delta') reasoningChars += chunk.text.length
        }
      } catch (error) {
        return `subagent error: ${error && error.message ? error.message : String(error)}`
      }
      const head = text.slice(0, 3000)
      return `[mode-subagent ${bandFor(parsed)} | reasoning ${reasoningChars} chars]\n${head}${text.length > 3000 ? '\n鈥?truncated)' : ''}`
    },
  })

  function currentSession() {
    const agent = ctx.get('agent')
    if (agent !== undefined && agent.session !== undefined) return agent.session
    const last = [...agents.values()].at(-1)
    return last?.session
  }

  function currentAgent() {
    const session = currentSession()
    return session === undefined ? undefined : [...agents.values()].find((a) => a.session === session)
  }
}

