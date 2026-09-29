/**
 * 语义化版本（SemVer 2.0.0）解析、比较、递增与范围判定
 * ------------------------------------------------------------
 * 规范取自 semver.org 的 BNF 与 npm node-semver 的范围语法说明，实现全部手写。
 * 纯函数：不碰 uni、不碰 DOM、不引第三方包。
 *
 * 支持的范围写法：^ ~ >= <= > < = || 空格隐含「且」
 *                1.2.3 - 2.3.4 连字符区间、x / X / * 通配段、缺段按 0 补
 * 预发布规则按 node-semver：带标签的版本默认不被范围接受，
 * 除非同一「且」组里有比较符自身带着相同核心（主.次.修订）的预发布标签。
 */

const DIGITS = '0|[1-9]\\d*'
const PRE_ID = '(?:0|[1-9]\\d*|\\d*[a-zA-Z-][\\da-zA-Z-]*)'
const BUILD_ID = '(?:[0-9a-zA-Z-]+)'

const STRICT = new RegExp(
  '^(v|V)?(' + DIGITS + ')\\.(' + DIGITS + ')\\.(' + DIGITS + ')' +
    '(?:-(' + PRE_ID + '(?:\\.' + PRE_ID + ')*))?' +
    '(?:\\+(' + BUILD_ID + '(?:\\.' + BUILD_ID + ')*))?$'
)

/** 范围里的版本段：允许残缺（1、1.2、1.x、*） */
const PARTIAL = new RegExp(
  '^(v|V)?(\\d+|x|X|\\*)' +
    '(?:\\.(\\d+|x|X|\\*))?' +
    '(?:\\.(\\d+|x|X|\\*))?' +
    '(?:-(' + PRE_ID + '(?:\\.' + PRE_ID + ')*|[^\\s+]*))?' +
    '(?:\\+(' + BUILD_ID + '(?:\\.' + BUILD_ID + ')*))?$'
)

function err(msg) {
  return new Error(msg)
}

const isX = (s) => !s || s === 'x' || s === 'X' || s === '*'

/* ---------------- 解析 ---------------- */

/**
 * 严格解析一个版本号
 * @param {string} input 1.2.3 / v1.2.3 / 1.2.3-beta.2+build.7
 * @param {object} [opts] { loose:false } loose=true 时允许 1 / 1.2 / 1.x
 * @returns {{major,minor,patch,pre:string[],preIds:Array,build:string[],version,core,raw,partial}}
 */
export function parseVersion(input, opts) {
  const o = opts || {}
  const raw = String(input == null ? '' : input).trim()
  if (!raw) throw err('版本号是空的，例如 1.2.3 或 2.0.0-rc.1')
  if (raw.length > 200) throw err('版本号过长（' + raw.length + ' 字符），是不是把整段文本粘进来了')
  if (/\s/.test(raw)) throw err('版本号里不能有空格：「' + raw + '」')
  const m = STRICT.exec(raw)
  if (m) return make(m[2], m[3], m[4], m[5], m[6], raw, false)
  if (o.loose) {
    const p = PARTIAL.exec(raw)
    if (p && !isX(p[2])) return make(p[2], isX(p[3]) ? '0' : p[3], isX(p[4]) ? '0' : p[4], isX(p[3]) ? '' : p[5], p[6], raw, isX(p[3]) || isX(p[4]))
  }
  throw err(hintFor(raw))
}

function hintFor(raw) {
  if (/^\d+$/.test(raw)) return '「' + raw + '」只有一段数字，SemVer 要求主.次.修订三段（要接受这种写法请勾选「宽松解析」）'
  if (new RegExp('^(v|V)?\\d+\\.\\d+$').test(raw)) return '「' + raw + '」少了修订号，规范写法是 ' + raw.replace(/^v/i, '') + '.0'
  if (/[Xx*]/.test(raw)) return '「' + raw + '」带通配段，只能出现在范围表达式里，不能当具体版本号'
  if (/_/.test(raw)) return '「' + raw + '」里有下划线：预发布标识只许字母、数字和短横'
  if (/^0\d/.test(raw) || /\.0\d/.test(raw)) return '「' + raw + '」的数字段有前导零（01、02…），SemVer 不接受'
  return '「' + raw + '」不是合法版本号，规范写法是 主.次.修订，例如 1.4.2、2.0.0-rc.1+build.5'
}

function make(major, minor, patch, preRaw, buildRaw, raw, partial) {
  const pre = preRaw ? String(preRaw).split('.').filter((x) => x !== '') : []
  const build = buildRaw ? String(buildRaw).split('.').filter((x) => x !== '') : []
  if (preRaw !== undefined && preRaw !== null && String(preRaw) !== '' && !preValid(pre)) {
    throw err('预发布标识「' + preRaw + '」不合法：段内只许字母数字短横，纯数字段不许有前导零')
  }
  if (buildRaw && !/^[0-9a-zA-Z-]+(\.[0-9a-zA-Z-]+)*$/.test(String(buildRaw))) {
    throw err('构建元数据「' + buildRaw + '」不合法')
  }
  const M = Number(major)
  const N = Number(minor)
  const P = Number(patch)
  if (!isFinite(M) || !isFinite(N) || !isFinite(P)) throw err('版本号数字太大，算不了')
  return {
    major: M,
    minor: N,
    patch: P,
    pre,
    preIds: pre.map(preIdent),
    build,
    raw,
    core: M + '.' + N + '.' + P,
    version: M + '.' + N + '.' + P + (pre.length ? '-' + pre.join('.') : '') + (build.length ? '+' + build.join('.') : ''),
    partial: !!partial,
  }
}

function preValid(ids) {
  return ids.every((s) => /^\d+$/.test(s) ? /^(0|[1-9]\d*)$/.test(s) : /^\d*[a-zA-Z-][\da-zA-Z-]*$/.test(s))
}

/** 预发布标识：数字段按数值比、字母段按 ASCII 比；数字恒小于字母 */
function preIdent(id) {
  const numeric = /^\d+$/.test(id)
  return { id, numeric, key: numeric ? id.replace(/^0+(?=\d)/, '') : id }
}

/** 批量解析时用的不抛错版本 */
export function tryParse(input) {
  try {
    return parseVersion(input, { loose: true })
  } catch (e) {
    return null
  }
}

/** 从一段杂文里抓第一个版本号：'node v18.17.0 (arm64)' → 18.17.0 */
export function coerce(text) {
  const m = /\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?/.exec(String(text == null ? '' : text))
  if (!m) return null
  try {
    return parseVersion(m[0], { loose: true })
  } catch (e) {
    return null
  }
}

/* ---------------- 比较 ---------------- */

function cmpNumStr(a, b) {
  // 都是规范化的十进制整数字符串：先比长度再比字典序，等价于比数值（不受 2^53 限制）
  const x = String(a)
  const y = String(b)
  if (x.length !== y.length) return x.length < y.length ? -1 : 1
  return x < y ? -1 : x > y ? 1 : 0
}

function cmpPreIdent(a, b) {
  const x = preIdent(a)
  const y = preIdent(b)
  if (x.numeric && y.numeric) return cmpNumStr(x.key, y.key)
  if (x.numeric) return -1
  if (y.numeric) return 1
  return x.key < y.key ? -1 : x.key > y.key ? 1 : 0
}

function cmpPre(a, b) {
  if (!a.length && !b.length) return 0
  if (!a.length) return 1
  if (!b.length) return -1
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] === undefined) return -1
    if (b[i] === undefined) return 1
    const c = cmpPreIdent(a[i], b[i])
    if (c) return c
  }
  return 0
}

/**
 * 比较两个版本：a<b → -1，a>b → 1，相等 → 0（构建元数据按规范不参与比较）
 * @param {string|object} a
 * @param {string|object} b
 * @param {object} [opts] { loose:true }
 */
export function compare(a, b, opts) {
  const o = opts || { loose: true }
  const x = isParsed(a) ? a : parseVersion(a, o)
  const y = isParsed(b) ? b : parseVersion(b, o)
  if (x.major !== y.major) return x.major < y.major ? -1 : 1
  if (x.minor !== y.minor) return x.minor < y.minor ? -1 : 1
  if (x.patch !== y.patch) return x.patch < y.patch ? -1 : 1
  return cmpPre(x.pre, y.pre)
}

function isParsed(v) {
  return !!v && typeof v === 'object' && typeof v.major === 'number'
}

export function eq(a, b) {
  return compare(a, b) === 0
}

/**
 * 排序一组版本
 * @param {string|Array} list 空格/换行/逗号分隔，或数组
 * @param {boolean} [desc] 降序
 */
export function sortVersions(list, desc) {
  const items = Array.isArray(list) ? list : String(list == null ? '' : list).split(/[\s,，、;；]+/)
  const ok = []
  const rejected = []
  for (const raw of items) {
    const t = String(raw).trim()
    if (!t) continue
    const v = tryParse(t)
    if (v) ok.push({ input: t, v })
    else rejected.push(t)
  }
  ok.sort((p, q) => (desc ? compare(q.v, p.v) : compare(p.v, q.v)))
  const dedup = []
  for (const x of ok) if (!dedup.length || dedup[dedup.length - 1].v.version !== x.v.version) dedup.push(x)
  return {
    sorted: ok.map((x) => x.v.version),
    unique: dedup.map((x) => x.v.version),
    rows: ok.map((x, i) => ({
      rank: i + 1,
      input: x.input,
      version: x.v.version,
      core: x.v.core,
      pre: x.v.pre.join('.') || '',
      dup: i > 0 && ok[i - 1].v.version === x.v.version,
    })),
    rejected,
    max: ok.length ? ok[ok.length - 1].v.version : '',
    min: ok.length ? ok[0].v.version : '',
    count: ok.length,
  }
}

/* ---------------- 递增 ---------------- */

export const RELEASE_TYPES = [
  { key: 'major', name: 'major', note: '不兼容改动：主版本 +1，次/修订归零' },
  { key: 'minor', name: 'minor', note: '向后兼容加功能：次版本 +1，修订归零' },
  { key: 'patch', name: 'patch', note: '向后兼容修 bug：修订 +1（当前带预发布时只去掉标签）' },
  { key: 'premajor', name: 'premajor', note: '开新主版本的预发布：1.2.3 → 2.0.0-0' },
  { key: 'preminor', name: 'preminor', note: '开新次版本的预发布：1.2.3 → 1.3.0-0' },
  { key: 'prepatch', name: 'prepatch', note: '在新修订上开预发布：1.2.3 → 1.2.4-0' },
  { key: 'prerelease', name: 'prerelease', note: '只推进预发布序号：1.2.3-beta.2 → 1.2.3-beta.3' },
]

/**
 * 递增版本号（档位语义与 npm 的 semver.inc 一致）
 * @param {string} input 当前版本
 * @param {string} type RELEASE_TYPES 之一
 * @param {string} [id] 预发布前缀（beta / rc）；不给就用 0 起步
 */
export function inc(input, type, id) {
  const v = parseVersion(input)
  const t = String(type || '').toLowerCase()
  const preId = id == null ? '' : String(id).trim()
  if (preId && !/^[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*$/.test(preId)) {
    throw err('预发布前缀「' + preId + '」只能用字母、数字和短横')
  }
  if (!RELEASE_TYPES.some((x) => x.key === t)) {
    throw err('未知的递增类型：' + type + '（可选 ' + RELEASE_TYPES.map((x) => x.key).join(' / ') + '）')
  }
  let M = v.major
  let N = v.minor
  let P = v.patch
  let pre = []
  const startPre = () => (preId ? [preId, '0'] : ['0'])
  switch (t) {
    case 'major':
      // 已经是 2.0.0-x 这种「本就在升主版本」的写法，只是转正，不再 +1
      if (N !== 0 || P !== 0 || !v.pre.length) M++
      N = 0
      P = 0
      break
    case 'minor':
      if (P !== 0 || !v.pre.length) N++
      P = 0
      break
    case 'patch':
      if (!v.pre.length) P++
      break
    case 'premajor':
      M++
      N = 0
      P = 0
      pre = startPre()
      break
    case 'preminor':
      N++
      P = 0
      pre = startPre()
      break
    case 'prepatch':
      P++
      pre = startPre()
      break
    default: // prerelease
      if (v.pre.length) pre = bumpPreIds(v.pre, preId)
      else {
        P++
        pre = startPre()
      }
  }
  return M + '.' + N + '.' + P + (pre.length ? '-' + pre.join('.') : '')
}

/** 预发布序列推进：末段是数字就 +1，否则补 .0；换前缀则重新从 0 起 */
function bumpPreIds(pre, preId) {
  const cur = pre.slice()
  if (preId && cur[0] !== preId) return [preId, '0']
  if (preId && cur[0] === preId && cur.length === 1) return [preId, '0']
  const last = cur[cur.length - 1]
  if (/^\d+$/.test(last)) {
    cur[cur.length - 1] = String(BigIntSafeAdd(last))
    return cur
  }
  return cur.concat(['0'])
}

function BigIntSafeAdd(s) {
  // 手写 +1，避开对 BigInt 的硬依赖（10^20 这种也能加）
  let carry = 1
  const digits = String(s).split('').reverse()
  for (let i = 0; i < digits.length && carry; i++) {
    const d = Number(digits[i]) + carry
    digits[i] = String(d % 10)
    carry = d >= 10 ? 1 : 0
  }
  if (carry) digits.push('1')
  return digits.reverse().join('')
}

/** 两个版本差在哪一档 */
export function diff(a, b) {
  const x = parseVersion(a)
  const y = parseVersion(b)
  const c = compare(x, y)
  if (x.core === y.core && cmpPre(x.pre, y.pre) === 0) {
    return { type: 'same', name: '按规范等价', direction: 0, note: '构建元数据不参与比较' }
  }
  if (x.major !== y.major) return { type: 'major', name: '主版本不同', direction: c }
  if (x.minor !== y.minor) return { type: 'minor', name: '次版本不同', direction: c }
  if (x.patch !== y.patch) return { type: 'patch', name: '修订不同', direction: c }
  return { type: 'prerelease', name: '仅预发布标签不同', direction: c }
}

/**
 * 升级风险提示：把 diff 翻成「能不能直接升」
 * @returns {Array<{level:'danger'|'warn'|'ok',t:string,d:string}>}
 */
export function breakingChanges(from, to) {
  const a = parseVersion(from)
  const b = parseVersion(to)
  const out = []
  const add = (level, t, d) => out.push({ level, t, d })
  if (compare(a, b) === 0 && a.core === b.core) {
    add('ok', '按规范等价', a.core + ' 上带标签的两条写法（如 +build.1 与 +build.2）视为同一版本，不构成升级。')
    return out
  }
  if (compare(a, b) > 0) {
    add('danger', '这是降级', a.version + ' → ' + b.version + '：旧版本会重新出现，先确认是不是写反了。')
  }
  if (a.major !== b.major && a.major !== 0 && b.major !== 0) {
    add('danger', '主版本 +1：预期有破坏性变更', '规范里主版本递增意味着删了旧接口或改了行为。升级前读 CHANGELOG 与迁移说明，并检查还有谁在锁旧大版本。')
  }
  if (a.major === b.major && a.major > 0 && a.minor !== b.minor) {
    add('ok', '次版本 +1：向后兼容的新增', '只允许加功能、加字段、修 bug；不该删 API、不该改已有行为。')
  }
  if (a.major === b.major && a.minor === b.minor && a.patch !== b.patch) {
    add('ok', '修订 +1：只修 bug', '行为保持兼容。')
  }
  if (a.major === 0 || b.major === 0) {
    add('warn', '0.x：次版本也算破坏性', '主版本为 0 时公共接口视为不稳定，0.1.0 → 0.2.0 允许不兼容。包管理器据此收紧范围：^0.2.3 只到 <0.3.0，^0.0.3 只到 <0.0.4。')
  }
  if (a.pre.length || b.pre.length) {
    add(
      'warn',
      '涉及预发布版本',
      a.pre.length && !b.pre.length
        ? '从预发布转正：不带标签的默认范围不会自动升到预发布，转正后才会被装上。'
        : '带标签的版本默认不被范围接受，必须显式写出或让比较符带上同核心的预发布标签。'
    )
  }
  if (a.build.length || b.build.length) {
    add('ok', '构建元数据不参与比较', '「+」后面那段只是附加信息（commit、构建号），规范明确它不影响先后顺序。')
  }
  return out
}

/* ---------------- 范围 ---------------- */

/**
 * 一个「段」→ 版本 + 哪些段是通配/缺失
 * @returns {{v:object, majorFixed:boolean, minorFixed:boolean, patchFixed:boolean, text:string}}
 */
function readPartial(raw) {
  const s = String(raw || '').trim()
  const m = PARTIAL.exec(s)
  if (!m) throw err('「' + s + '」不是版本号，也不是 1 / 1.2 / 1.x / * 这类通配写法')
  const majorFixed = !isX(m[2])
  const minorFixed = majorFixed && !isX(m[3])
  const patchFixed = minorFixed && !isX(m[4])
  if (!majorFixed) return { v: make('0', '0', '0', '', '', '0', true), majorFixed: false, minorFixed: false, patchFixed: false, text: s, allAny: true }
  const pre = minorFixed ? m[5] : ''
  const v = make(m[2], minorFixed ? m[3] : '0', patchFixed ? m[4] : '0', pre || '', m[6], s, !patchFixed)
  return { v, majorFixed, minorFixed, patchFixed, text: s, allAny: false }
}

function C(op, v, why) {
  return { op, v, text: (op || '=') + v.version, why: why || '' }
}

/** ^a.b.c —— 允许「不越过下一个不兼容档位」 */
function caretOf(raw) {
  const p = readPartial(raw)
  const v = p.v
  let hi
  let why
  if (!p.majorFixed) return [{ op: '', v: null, text: '任意版本（^* 与 * 等价）', why: '' }]
  if (v.major > 0) {
    hi = [v.major + 1, 0, 0]
    why = '主版本锁死：允许次版本与修订增长'
  } else if (p.minorFixed && v.minor > 0) {
    hi = [0, v.minor + 1, 0]
    why = '0.x 阶段次版本就是「主版本」，锁到 <0.' + (v.minor + 1) + '.0'
  } else if (p.minorFixed && p.patchFixed) {
    hi = [0, 0, v.patch + 1]
    why = '^0.0.3 只允许 0.0.3 本身——0.0.z 的修订号也被当作不兼容边界'
  } else if (p.minorFixed) {
    hi = [0, 1, 0]
    why = '^0.0（或 ^0.0.x）→ >=0.0.0 <0.1.0'
  } else {
    hi = [1, 0, 0]
    why = '^0（或 ^0.x）→ >=0.0.0 <1.0.0'
  }
  const hiV = make(String(hi[0]), String(hi[1]), String(hi[2]), '', '', hi.join('.'), false)
  return [C('>=', v, p.patchFixed ? '' : '缺失/通配的段按 0 补'), C('<', hiV, why)]
}

/** ~a.b.c —— 只放开最右边的给出段 */
function tildeOf(raw) {
  const p = readPartial(raw)
  const v = p.v
  if (!p.majorFixed) return [{ op: '', v: null, text: '任意版本（~* 与 * 等价）', why: '' }]
  const hi = p.minorFixed ? [v.major, v.minor + 1, 0] : [v.major + 1, 0, 0]
  const hiV = make(String(hi[0]), String(hi[1]), String(hi[2]), '', '', hi.join('.'), false)
  const why = p.minorFixed ? '锁住次版本，只放开修订号' : '没给次版本 → 退化成「锁主版本」'
  return [C('>=', v, p.patchFixed ? '' : '缺失/通配的段按 0 补'), C('<', hiV, why)]
}

/** x / X / * 通配范围 */
function wildcardOf(raw) {
  const p = readPartial(raw)
  if (!p.majorFixed) return [{ op: '', v: null, text: '任意版本（* 等价于 >=0.0.0，但不含预发布版本）', why: '' }]
  if (p.patchFixed) {
    if (p.v.pre.length) return [C('=', p.v, '完整版本带预发布标签：精确相等')]
    return [C('=', p.v, '单独写完整三段就是精确匹配')]
  }
  const hi = p.minorFixed ? [p.v.major, p.v.minor + 1, 0] : [p.v.major + 1, 0, 0]
  const hiV = make(String(hi[0]), String(hi[1]), String(hi[2]), '', '', hi.join('.'), false)
  return [C('>=', p.v, '缺失段按 0 补'), C('<', hiV, p.minorFixed ? '1.2.x → 放开 1.2 的所有修订' : '1.x → 放开 1 的所有次版本')]
}

/** 带比较符的比较段：>=1.2、<2、=1.2.x */
function opOf(op, raw) {
  const p = readPartial(raw)
  if (!p.majorFixed) {
    if (op === '<' || op === '<=') return [{ op: '', v: null, text: '空范围（' + op + ' 一个通配段，什么都不匹配）', why: '', empty: true }]
    return [{ op: '', v: null, text: '任意版本（' + op + ' 作用在 * 上）', why: '' }]
  }
  if (op === '=' && !p.patchFixed) return wildcardOf(raw)
  return [C(op, p.v, p.patchFixed ? '' : '缺失或通配的段按 0 补齐后再比较')]
}

/** 把 || 之内的一段展开成「且」组 */
function expandSet(part) {
  const s = String(part).trim()
  if (!s || s === '*' || s === 'x' || s === 'X') {
    return [{ op: '', v: null, text: '任意版本（* 等价于 >=0.0.0，但不含预发布版本）', why: '' }]
  }
  const hy = s.match(/^(\S+)\s+-\s+(\S+)$/)
  if (hy) {
    const lo = readPartial(hy[1])
    const hi = readPartial(hy[2])
    const out = [C('>=', lo.v, '连字符区间下界（含）')]
    if (hi.patchFixed) out.push(C('<=', hi.v, '上界给到完整三段 → 含该版本'))
    else {
      const nx = hi.minorFixed ? [hi.v.major, hi.v.minor + 1, 0] : [hi.v.major + 1, 0, 0]
      const nxV = make(String(nx[0]), String(nx[1]), String(nx[2]), '', '', nx.join('.'), false)
      out.push(C('<', nxV, '上界是残缺写法 → 不含，改成下一个排他边界'))
    }
    return out
  }
  const out = []
  for (const tok of s.split(/\s+/)) {
    if (!tok) continue
    if (tok[0] === '^') out.push(...caretOf(tok.slice(1)))
    else if (tok.slice(0, 2) === '~>') out.push(...tildeOf(tok.slice(2)))
    else if (tok[0] === '~') out.push(...tildeOf(tok.slice(1)))
    else {
      const om = /^(>=|<=|>|<|=)(.*)$/.exec(tok)
      if (om) {
        if (!om[2]) throw err('「' + tok + '」只有比较符，后面缺版本号')
        out.push(...opOf(om[1], om[2]))
      } else out.push(...wildcardOf(tok))
    }
  }
  if (!out.length) throw err('「' + s + '」里没有可解析的比较符')
  return out
}

/**
 * 解析范围表达式
 * @param {string} input ^1.2.3 || >=2.0.0 <3
 * @returns {{raw:string, sets:Array<object>, text:string, empty:boolean}}
 */
export function parseRange(input) {
  const raw = String(input == null ? '' : input).trim()
  if (raw.length > 300) throw err('范围表达式过长（' + raw.length + ' 字符）')
  const sets = raw.split('||').map((part, i) => {
    const comparators = expandSet(part)
    return {
      index: i + 1,
      raw: part.trim(),
      comparators,
      bounds: boundsOf(comparators),
      text: comparators.map((c) => c.text).join('  且  '),
      any: comparators.length === 1 && !comparators[0].v,
      empty: comparators.some((c) => c.empty),
    }
  })
  return { raw, sets, text: sets.map((s) => s.text).join('   或   '), empty: sets.every((s) => s.empty) }
}

function boundsOf(comparators) {
  let min = null
  let minInc = true
  let max = null
  let maxInc = true
  for (const c of comparators) {
    if (!c.v) continue
    if (c.op === '>' || c.op === '>=') {
      if (!min || compare(c.v, min) > 0) {
        min = c.v
        minInc = c.op === '>='
      }
    } else if (c.op === '<' || c.op === '<=') {
      if (!max || compare(c.v, max) < 0) {
        max = c.v
        maxInc = c.op === '<='
      }
    }
  }
  return {
    min: min ? min.version : '',
    minInclusive: minInc,
    max: max ? max.version : '',
    maxInclusive: maxInc,
    span:
      (min ? (minInc ? '[' : '(') + min.version : '(-∞') +
      ' , ' +
      (max ? max.version + (maxInc ? ']' : ')') : '+∞)'),
  }
}

function testOne(v, c) {
  if (!c.v) return !c.empty
  const cmp = compare(v, c.v)
  if (c.op === '>') return cmp > 0
  if (c.op === '>=') return cmp >= 0
  if (c.op === '<') return cmp < 0
  if (c.op === '<=') return cmp <= 0
  return cmp === 0
}

/**
 * 判定版本是否满足范围
 * @param {string} version
 * @param {string|object} range parseRange 的返回值或字符串
 */
export function satisfies(version, range) {
  const v = parseVersion(version)
  const r = typeof range === 'string' || !range ? parseRange(range) : range
  for (const set of r.sets) {
    const direct = directMatch(v, set)
    if (direct === true) return true
    if (direct === null) continue // 比较符全中但被预发布规则挡下
  }
  return false
}

/** true 命中 / false 比较符不命中 / null 只差预发布规则 */
function directMatch(v, set) {
  for (const c of set.comparators) {
    if (!testOne(v, c)) return false
  }
  if (v.pre.length) {
    const allowed = set.comparators.some((c) => c.v && c.v.pre.length && c.v.major === v.major && c.v.minor === v.minor && c.v.patch === v.patch)
    if (!allowed) return null
  }
  return true
}

/**
 * 逐项解释「为什么满足 / 为什么不满足」
 * @returns {{ok:boolean, version:string, range:string, groups:Array, reason:string, blockedPre:boolean}}
 */
export function explainSatisfies(version, range) {
  const v = parseVersion(version)
  const r = parseRange(range)
  let blockedPre = false
  const groups = r.sets.map((set) => {
    let passAll = true
    const items = set.comparators.map((c) => {
      const pass = testOne(v, c)
      if (!pass) passAll = false
      return {
        text: c.text,
        why: c.why || '',
        pass,
        rel: c.v ? (compare(v, c.v) < 0 ? '<' : compare(v, c.v) > 0 ? '>' : '=') : '—',
      }
    })
    let preOk = true
    if (v.pre.length) {
      preOk = set.comparators.some((c) => c.v && c.v.pre.length && c.v.major === v.major && c.v.minor === v.minor && c.v.patch === v.patch)
      if (!preOk && passAll) blockedPre = true
    }
    return { index: set.index, raw: set.raw, items, bounds: set.bounds, passAll, preOk, hit: passAll && preOk }
  })
  const ok = groups.some((g) => g.hit)
  let reason
  if (ok) reason = '命中范围'
  else if (blockedPre) reason = '比较符本身都成立，但该版本带预发布标签：默认范围不接受预发布，除非某个比较符自己写了同一核心（' + v.core + '）的预发布'
  else reason = '没有任何一组（|| 分隔的一档）比较符全部成立'
  return { ok, version: v.version, range: r.raw, groups, reason, blockedPre, note: '范围只看主/次/修订与预发布顺序，「+」后面的构建元数据不参与判定。' }
}

/* ---------------- 页面文案 ---------------- */

export const SEMVER_SAMPLES = [
  { name: 'caret 最常用', version: '1.4.2', range: '^1.4.0' },
  { name: 'tilde', version: '1.4.2', range: '~1.4.0' },
  { name: '区间与或', version: '2.0.0-rc.1', range: '>=1.2.0 <2.0.0 || ^3.0.0' },
  { name: '连字符区间', version: '1.5.0', range: '1.2.0 - 2.3.0' },
  { name: '通配段', version: '1.2.9', range: '1.2.x' },
  { name: '0.x 陷阱', version: '0.4.0', range: '^0.3.1' },
  { name: '预发布放行', version: '1.0.0-alpha.2', range: '>=1.0.0-alpha.1 <1.0.0' },
  { name: '预发布被挡', version: '2.0.0-beta.1', range: '^2.0.0' },
]

export const SEMVER_NOTES = [
  {
    t: '三段各管什么',
    d: '主版本（MAJOR）：不兼容的删改。次版本（MINOR）：向后兼容地加功能。修订号（PATCH）：向后兼容地修 bug。加了功能却只升修订号，是范围判定失灵的头号原因。',
  },
  {
    t: '^ 与 ~ 的区别',
    d: '^1.2.3 = >=1.2.3 <2.0.0，放开次版本与修订；~1.2.3 = >=1.2.3 <1.3.0，只放开修订。主版本为 0 时 caret 收紧得很：^0.2.3 → <0.3.0，^0.0.3 → <0.0.4。',
  },
  {
    t: '预发布为什么不自动升',
    d: '1.2.3-alpha 按规范小于 1.2.3，但带标签的版本默认不被范围接受，必须某个比较符自己写着同一核心的预发布。所以 dist-tag「latest」永远不会是预发布版本。',
  },
  {
    t: '构建元数据被忽略',
    d: '+build.1735 这类附加信息按规范不参与先后比较：1.0.0+a 与 1.0.0+b 视为相等。要真正区分构建，把它写进预发布段或另存字段。',
  },
  {
    t: '1.0.0 的意义',
    d: '规范第 5 条：公共接口稳定后就该发布 1.0.0。一直停在 0.x 会让所有依赖方自行把范围锁死，反而更难升级。',
  },
]
