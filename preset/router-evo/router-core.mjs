/**
 * router-core: reasoning-mode routing logic (zero dependencies).
 *
 * BEHAVIORAL REALITY (measured, 21-point 脳 n=2 on v4-pro): model behavior
 * along the react鈫攕pec axis collapses into THREE stable regions, not a
 * continuum 鈥?spec [0, 0.15], a transition band [0.2, 0.45] (unstable mix,
 * avoid), and react [0.5, 1.0] (11 mode values behave identically). The
 * numeric interface therefore maps onto three behavior bands; "continuous"
 * tuning is an illusion at the model layer.
 *
 * FOURTH MODE 鈥?weak (internal routing): P8/P11 show a weak-persona domain
 * where the model routes itself from the task (discrimination up to +5.0).
 * The optimal weak persona is model-specific (P11, n=3):
 *   - pro:   spec sentence + few-shot routing instruction (w6, +5.00)
 *   - flash: neutral + explicit "classify then act" instruction (w7, +5.67)
 *   - spec-sentence weak personas ANTI-route on flash (planGreen > 0).
 *
 *   mode 0    鈫?pure spec  鈥?plan-first, collective, read-first tools
 *   mode 0.3  鈫?mixed      鈥?transition band (trap; only explicit opt-in)
 *   mode 1    鈫?pure react 鈥?doer, produce-verify-fix, test-suppressed
 *   mode W    鈫?weak       鈥?internal routing (model decides per task)
 *
 * `mode` is stored as a number in [0, 1] or the string 'weak'; band mapping
 * quantizes to the four modes.
 */

export const MODE_SPEC = 0
export const MODE_MIXED = 0.3
export const MODE_REACT = 1
export const MODE_WEAK = 'weak'

const SPEC_PERSONA = 'You are a helpful software engineer assistant.'

const MIXED_PERSONA =
  'You are a helpful software engineer assistant.\n'
  + 'Work directly: prefer writing or editing code over describing plans. '
  + 'Verify your changes by reading and running them.'

const REACT_PERSONA =
  'You are a hands-on software engineer who delivers working output fast.\n'
  + 'Work directly: write or edit code, then verify it by reading and running. '
  + 'Keep the loop tight 鈥?produce, verify, fix 鈥?and do not build test '
  + 'harnesses, scaffolding, or ceremony the user did not ask for. '
  + 'Finish with a usable deliverable and a short summary.'

/** Weak (internal-routing) personas 鈥?model-specific optimum (P11/P24).
 *  pro:   spec sentence + classify instruction (w6c, +4.67, P24) 鈥?the
 *         few-shot variants and the recall/converge anchors HURT Pro
 *         (P24: suite-full 83% < naked 87.5% vs +guide 100%)
 *  flash: neutral + classify + recall/converge/anti-runaway anchors
 *         (w7, +5.67, P11; anchors lift single-task completion to 100%, P23)
 */
const WEAK_PRO =
  'You are a helpful software engineer assistant.\n'
  + 'Before acting, decide the task type (build or fix) and adopt the matching '
  + 'style: build 鈫?hands-on production; fix 鈫?inspect-and-plan.'

const WEAK_FLASH =
  'You are a helpful assistant.\n'
  + 'Before acting, decide the task type (build or fix) and adopt the matching '
  + 'style: build 鈫?hands-on production; fix 鈫?inspect-and-plan.\n'
  + 'Before acting, briefly review what you have already done in this session and continue from where you left off; do not repeat completed steps. Do not run environment checks (echo, whoami, uname, node --version, date) or exhaustive grep/glob scans.\n'
  + 'Think deeply first, then produce.'

/** Complexity heuristic: long or architecturally-worded tasks are COMPLEX.
 *  Simple tasks get fast-convergence guidance; complex tasks get deep
 *  exploration guidance (depth-adaptive, v19). */
const COMPLEX_RE = /(閲嶆瀯|鏋舵瀯|鍏ㄩ潰|璇︾粏|璁捐|绯荤粺|浼樺寲|鍒嗘瀽|survey|overview|architecture|refactor|comprehensive|detailed|design|system|optimize|analyze)/i

export function isComplexTask(text) {
  return typeof text === 'string' && (text.length > 120 || COMPLEX_RE.test(text))
}

/** True when the routed model id is a Flash-family model. */
export function isFlashModel(modelId) {
  return typeof modelId === 'string' && /flash/i.test(modelId)
}

/** Quantize a mode to one of the four measured behavior bands. */
export function bandOf(mode) {
  if (mode === 'weak') return 'weak'
  const m = clamp01(mode)
  if (m < 0.2) return 'spec' // measured stable spec region (0..0.15)
  if (m < 0.5) return 'transition' // measured unstable band 鈥?avoid
  return 'react' // measured stable react region (0.5..1 behave alike)
}

/** Persona for a mode; weak picks the model-specific internal-routing text. */
export function personaFor(mode, modelId) {
  switch (bandOf(mode)) {
    case 'spec': return SPEC_PERSONA
    case 'transition': return MIXED_PERSONA
    case 'weak': return isFlashModel(modelId) ? WEAK_FLASH : WEAK_PRO
    default: return REACT_PERSONA
  }
}

/** First-turn core tools (shell added dynamically by the plugin).
 *  v0.2.0: the weak (internal-routing) band gets the RL-shape surface 鈥?
 *  shell + str_replace_editor 鈥?per the interface-restoration measurement
 *  (100% action at 18鈥?9K reasoning chars vs ~25% / 73鈥?01K on the
 *  read/write/edit surface, official API, 2026-08-15). */
export function coreFor(mode) {
  switch (bandOf(mode)) {
    case 'spec': return ['read', 'edit', 'glob', 'grep'] // read-first
    case 'transition': return ['read', 'edit', 'write', 'glob', 'grep'] // union
    case 'weak': return ['str_replace_editor'] // RL shape: shell + editor
    default: return ['read', 'write', 'edit'] // write-first
  }
}

/** Human-readable band name for a mode value. */
export function bandFor(mode) {
  const b = bandOf(mode)
  return b === 'transition' ? 'mixed' : b
}

/** Test-suppression strength for a mode (informational). */
/** Test-suppression strength for a mode (informational). */
export function testinessFor(mode) {
  switch (bandOf(mode)) {
    case 'react': return 'suppressed'
    case 'spec': return 'normal'
    default: return 'light'
  }
}

const REACT_RE = /(寮€鍙憒鍒涘缓|鍐欎竴涓獆鐢熸垚|浠庨浂|鍋氫竴涓獆娓告垙|缃戦〉|缃戠珯|鏋勫缓|鏂伴」鐩畖鎼缓|瀹炵幇|鍋氬嚭|涓婄嚎|钀藉湴|鑴氭湰|宸ュ叿|搴旂敤|build|create|develop|generate|implement|make a|new project)/gi
const SPEC_RE = /(淇|淇竴涓媩璋冭瘯|閲嶆瀯|缁存姢|鎺掓煡|鎶ラ敊|鍑洪敊|宕╂簝|浼樺寲|瀹℃煡|review|fix|debug|refactor|maintain|repair|broken|break|涓轰粈涔坾寮傚父|鏁呴殰|杩佺Щ|鍗囩骇|鍏煎)/gi

function countHits(regex, text) {
  return [...text.matchAll(regex)].length
}

/**
 * Classify a task text into a mode. Clear keyword evidence picks a stable
 * band (1 react / 0 spec); AMBIGUOUS or unmatched text returns 'weak' 鈥?
 * the internal-routing mode, where the model decides per task (P11 optimum).
 */
export function classifyTask(text) {
  const react = countHits(REACT_RE, text)
  const spec = countHits(SPEC_RE, text)
  if (react > spec) return 1
  if (spec > react) return 0
  return 'weak'
}

/** Per-session mode derived from durable events (resume-safe). */
export function sessionMode(session) {
  const events = session.events
  const userMsg = events.find((e) => e.type === 'user/message')
  return classifyTask(extractText(userMsg?.data))
}

export function extractText(data) {
  if (!data) return ''
  // 闃插尽鎬цВ鍖咃細鎻掍欢/宸ュ叿鐢熸垚鐨?user/message 鍋舵湁 `data.message` 宓屽褰㈢姸
  // 锛堝娉ㄥ叆鍣?startIngest 鐨?seed锛夛紝鐩存帴璇?data.content 浼氬緱鍒扮┖涓?鈫?
  // 鏋勫缓/淇浠诲姟琚鍒?weak锛坮outer-standard issue #1锛夈€?
  const payload = data && typeof data.message === 'object' && data.message !== null ? data.message : data
  const content = Array.isArray(payload.content) ? payload.content : []
  return content.map((c) => (typeof c === 'string' ? c : (c.text ?? ''))).join(' ')
}

export function clamp01(v) {
  return Math.min(1, Math.max(0, Number(v) || 0))
}

/**
 * Replace only the persona section of an assembled section list, keeping
 * everything else 鈥?the plan-mode section above all, which is toggled per
 * plan state and carries the plan-boundary instructions.
 */
export function applyPersona(sections, personaText) {
  const rest = (sections || []).filter(
    (section) => section.name !== 'persona' && !/persona/i.test(section.name),
  )
  return [...rest, { name: 'router-persona', text: personaText, order: 0 }]
}

/** Parse a user/agent-supplied mode token: number 0-100, 0.0-1.0, or a band name. */
export function parseMode(token) {
  if (token === undefined || token === null) return null
  const t = String(token).trim().toLowerCase()
  if (t === 'auto') return 'auto'
  if (t === 'weak' || t === 'router') return 'weak'
  if (t === 'spec' || t === 'spec-lean') return 0
  if (t === 'balanced' || t === 'mixed') return 0.3 // transition-band center
  if (t === 'react' || t === 'react-lean') return 1
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  if (t.includes('.')) return clamp01(n)
  return clamp01(n / 100)
}

