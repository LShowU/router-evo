/** Task-aware reasoning-mode routing with UTF-8 Chinese classification. */
export const MODE_SPEC = 0
export const MODE_MIXED = 0.3
export const MODE_REACT = 1
export const MODE_WEAK = 'weak'

const SPEC_PERSONA = 'You are a helpful software engineer assistant.'
const MIXED_PERSONA = `${SPEC_PERSONA}\nWork directly: prefer writing or editing code over describing plans. Verify your changes by reading and running them.`
const REACT_PERSONA = 'You are a hands-on software engineer who delivers working output fast.\nWork directly: write or edit code, then verify it by reading and running. Keep the loop tight: produce, verify, fix. Finish with a usable deliverable and a short summary.'
const WEAK_PRO = `${SPEC_PERSONA}\nBefore acting, decide the task type (build or fix) and adopt the matching style: build -> hands-on production; fix -> inspect-and-plan.`
const WEAK_FLASH = `You are a helpful assistant.\nBefore acting, decide the task type (build or fix) and adopt the matching style: build -> hands-on production; fix -> inspect-and-plan. Do not repeat completed steps or run environment checks without need.`

const COMPLEX_RE = /(重构|架构|全面|详细|设计|系统|优化|分析|survey|overview|architecture|refactor|comprehensive|detailed|design|system|optimize|analyze)/i
const REACT_RE = /(开发|创建|写一个|生成|从零|做一个|游戏|网页|网站|构建|新项目|搭建|实现|做出|上线|落地|脚本|工具|应用|build|create|develop|generate|implement|make a|new project)/gi
const SPEC_RE = /(修复|修一下|调试|重构|维护|排查|报错|出错|崩溃|优化|审查|review|fix|debug|refactor|maintain|repair|broken|break|为什么|异常|故障|迁移|升级|兼容)/gi

export function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0))
}

export function isComplexTask(text) {
  return typeof text === 'string' && (text.length > 120 || COMPLEX_RE.test(text))
}

export function isFlashModel(modelId) {
  return typeof modelId === 'string' && /flash/i.test(modelId)
}

export function bandOf(mode) {
  if (mode === MODE_WEAK) return 'weak'
  const value = clamp01(mode)
  if (value < 0.2) return 'spec'
  if (value < 0.5) return 'transition'
  return 'react'
}

export function bandFor(mode) {
  const band = bandOf(mode)
  return band === 'transition' ? 'mixed' : band
}

export function personaFor(mode, modelId) {
  switch (bandOf(mode)) {
    case 'spec': return SPEC_PERSONA
    case 'transition': return MIXED_PERSONA
    case 'weak': return isFlashModel(modelId) ? WEAK_FLASH : WEAK_PRO
    default: return REACT_PERSONA
  }
}

export function coreFor(mode) {
  switch (bandOf(mode)) {
    case 'spec': return ['read', 'edit', 'glob', 'grep']
    case 'transition': return ['read', 'edit', 'write', 'glob', 'grep']
    case 'weak': return ['str_replace_editor']
    default: return ['read', 'write', 'edit']
  }
}

export function testinessFor(mode) {
  switch (bandOf(mode)) {
    case 'react': return 'suppressed'
    case 'spec': return 'normal'
    default: return 'light'
  }
}

function countHits(regex, text) {
  regex.lastIndex = 0
  return [...String(text || '').matchAll(regex)].length
}

export function classifyTask(text) {
  const react = countHits(REACT_RE, text)
  const spec = countHits(SPEC_RE, text)
  if (react > spec) return MODE_REACT
  if (spec > react) return MODE_SPEC
  return MODE_WEAK
}

export function extractText(data) {
  if (!data) return ''
  const payload = data.message && typeof data.message === 'object' ? data.message : data
  if (typeof payload.text === 'string') return payload.text
  if (typeof payload.content === 'string') return payload.content
  if (!Array.isArray(payload.content)) return ''
  return payload.content.map(part => typeof part === 'string' ? part : (part?.text || '')).join(' ')
}

export function sessionMode(session) {
  const event = session?.events?.find(item => item.type === 'user/message')
  return classifyTask(extractText(event?.data))
}

export function applyPersona(sections, personaText) {
  const rest = (sections || []).filter(section => section.name !== 'persona' && !/persona/i.test(section.name))
  return [...rest, { name: 'router-persona', text: personaText, order: 0 }]
}

export function parseMode(token) {
  if (token === undefined || token === null) return null
  const value = String(token).trim().toLowerCase()
  if (value === 'auto') return 'auto'
  if (value === 'weak' || value === 'router') return MODE_WEAK
  if (value === 'spec' || value === 'spec-lean') return MODE_SPEC
  if (value === 'balanced' || value === 'mixed') return MODE_MIXED
  if (value === 'react' || value === 'react-lean') return MODE_REACT
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return value.includes('.') ? clamp01(number) : clamp01(number / 100)
}
