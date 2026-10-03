/**
 * Unicode 码点工具
 * 把一段文本逐字符拆开，看清它的真实构成——
 * 排查「看着一样的字为什么比对不相等」「粘贴进来的文本为什么多出字符」这类问题时最有用。
 */

/** 零宽与不可见字符表 */
const INVISIBLE = {
  0x200b: '零宽空格',
  0x200c: '零宽不连字',
  0x200d: '零宽连字',
  0x200e: '从左至右标记',
  0x200f: '从右至左标记',
  0x202a: '双向文本嵌入开始',
  0x202b: '从右至左嵌入',
  0x202c: '双向文本嵌入结束',
  0x202d: '从左至右覆盖',
  0x202e: '从右至左覆盖（可能被用来伪装文件名）',
  0x2060: '词连接符',
  0xfeff: '字节顺序标记 BOM',
  0x00a0: '不换行空格',
  0x3000: '全角空格',
  0x2028: '行分隔符',
  0x2029: '段分隔符',
  0xad: '软连字符',
}

function classify(cp) {
  if (cp === 0x20) return '空格'
  if (cp < 0x20 || cp === 0x7f) return '控制符'
  if (INVISIBLE[cp]) return INVISIBLE[cp]
  if (cp < 0x80) return 'ASCII'
  if (cp >= 0x3040 && cp <= 0x30ff) return '日文假名'
  if (cp >= 0x3400 && cp <= 0x4dbf) return '汉字扩展 A'
  if (cp >= 0x4e00 && cp <= 0x9fff) return '汉字'
  if (cp >= 0xf900 && cp <= 0xfaff) return '兼容汉字'
  if (cp >= 0xff00 && cp <= 0xffef) return '全角字符'
  if (cp >= 0x1f300 && cp <= 0x1faff) return 'Emoji'
  if (cp >= 0x2600 && cp <= 0x27bf) return '符号（含 Emoji）'
  if (cp >= 0x3000 && cp <= 0x303f) return '中文标点'
  if (cp >= 0x2000 && cp <= 0x206f) return '通用标点'
  if (cp >= 0x0300 && cp <= 0x036f) return '组合附加符号'
  return '其他'
}

function utf8Bytes(cp) {
  if (cp < 0x80) return [cp]
  if (cp < 0x800) return [0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)]
  if (cp < 0x10000) return [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)]
  return [
    0xf0 | (cp >> 18),
    0x80 | ((cp >> 12) & 0x3f),
    0x80 | ((cp >> 6) & 0x3f),
    0x80 | (cp & 0x3f),
  ]
}

const hex = (n, pad) => n.toString(16).toUpperCase().padStart(pad, '0')

/**
 * 可疑判据（analyze 的 suspect 与 summarize 的 suspects 共用一把尺，P2 修复）。
 * 界面卡标题是「可疑不可见字符」，说明讲「零宽空格、双向控制符这类肉眼看不见…
 * 伪装文件名和域名」——换行与制表是文本的正常结构，多行粘贴每次报警纯属噪声，
 * 所以 0x0A/0x09 不算可疑；其余控制符（\r、\x01…）和不可见表照旧算。
 */
function isSuspectCp(cp) {
  if (INVISIBLE[cp]) return true
  if (cp < 0x20 && cp !== 0x0a && cp !== 0x09) return true
  return false
}

/**
 * 百分号编码的单码点口径（analyze 的 urlEncoded 与 escapeAll('url') 共用一把尺，P2 修复）。
 * 以 encodeURIComponent（Web 标准）为准：unreserved 字符 A-Za-z0-9-_.~ 不编码，
 * 其余按 UTF-8 字节写 %XX。以前 analyze 逐字节全编码，'A' 给出 %41，
 * 和转义卡的 escapeAll 对不上。
 */
function urlEncodeCp(ch, cp) {
  if (/[A-Za-z0-9\-_.~]/.test(ch)) return ch
  return utf8Bytes(cp).map((b) => '%' + hex(b, 2)).join('')
}

/** 逐字符分析 */
export function analyze(text) {
  const s = String(text)
  if (!s) throw new Error('请输入要分析的文本')
  const chars = [...s]
  if (chars.length > 500) {
    return { list: analyzeChars(chars.slice(0, 500)), total: chars.length, truncated: true }
  }
  return { list: analyzeChars(chars), total: chars.length, truncated: false }
}

function analyzeChars(chars) {
  return chars.map((ch, i) => {
    const cp = ch.codePointAt(0)
    const bytes = utf8Bytes(cp)
    // 按 UTF-16 码元逐个列出：emoji 这类非 BMP 字符会占两个码元（代理对）
    const utf16 = []
    for (let k = 0; k < ch.length; k++) utf16.push('U+' + hex(ch.charCodeAt(k), 4))
    return {
      index: i + 1,
      char: ch,
      visible: cp < 0x20 || cp === 0x7f || !!INVISIBLE[cp] ? '·' : ch,
      codePoint: cp,
      hex: 'U+' + hex(cp, cp > 0xffff ? 5 : 4),
      dec: cp,
      bytes: bytes.map((b) => hex(b, 2)).join(' '),
      byteCount: bytes.length,
      utf16,
      utf16Units: ch.length,
      kind: classify(cp),
      entity: '&#' + cp + ';',
      jsEscape: cp > 0xffff
        ? '\\u{' + cp.toString(16) + '}'
        : '\\u' + hex(cp, 4),
      urlEncoded: urlEncodeCp(ch, cp),
      suspect: isSuspectCp(cp),
      suspectNote: INVISIBLE[cp] || (isSuspectCp(cp) ? '控制字符，粘进代码里会出问题' : ''),
    }
  })
}

/** 整体概况 */
export function summarize(text) {
  const s = String(text)
  if (!s) return null
  const chars = [...s]
  const kinds = {}
  let suspects = 0
  let maxBytes = 0
  let emoji = 0
  chars.forEach((ch) => {
    const cp = ch.codePointAt(0)
    const k = classify(cp)
    kinds[k] = (kinds[k] || 0) + 1
    if (isSuspectCp(cp)) suspects++
    if (cp >= 0x1f300 && cp <= 0x1faff) emoji++
    maxBytes = Math.max(maxBytes, utf8Bytes(cp).length)
  })
  return {
    chars: chars.length,
    utf16Units: s.length,
    utf8Bytes: utf8ByteLength(s),
    kinds,
    suspects,
    emoji,
    maxBytes,
    hasSurrogatePair: s.length !== chars.length,
  }
}

/** UTF-8 总字节数 */
function utf8ByteLength(s) {
  let n = 0
  for (const ch of s) n += utf8Bytes(ch.codePointAt(0)).length
  return n
}

/** 转义成各种形式 */
export function escapeAll(text, style) {
  const s = String(text)
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0)
    if (style === 'unicode') {
      out += cp < 0x80 ? ch : cp > 0xffff ? '\\u{' + cp.toString(16) + '}' : '\\u' + hex(cp, 4)
    } else if (style === 'html') {
      out += cp < 0x80 ? ch : '&#' + cp + ';'
    } else if (style === 'url') {
      out += urlEncodeCp(ch, cp)
    } else {
      out += ch
    }
  }
  return out
}

/**
 * 从码点数字还原文本
 * 进制判断规则（按用户最可能的意思来）：
 *   1. 带 U+ 或 0x 前缀的，一律十六进制；
 *   2. 其余整体看：**只要有一个 token 里出现了 a-f 字母，就全部按十六进制**；
 *   3. 全是数字时按十进制。
 * 这样 "4E2D 6587" 会解成「中文」（整体含字母，按十六进制），
 * 而 "20013 25991" 也解成「中文」（全是数字，按十进制）——两种常见写法都对。
 */
export function fromCodePoints(input) {
  const parts = String(input || '')
    .split(/[\s,，、]+/)
    .filter(Boolean)
  if (!parts.length) throw new Error('请输入码点，例如 4E2D 6587 或 U+4E2D')

  const stripped = parts.map((p) => p.replace(/^(U\+|0x)/i, ''))
  stripped.forEach((c, i) => {
    if (!/^[0-9a-fA-F]+$/.test(c)) throw new Error('「' + parts[i] + '」不是合法的码点')
  })
  const anyLetter = stripped.some((c) => /[a-fA-F]/.test(c))

  const out = []
  parts.forEach((p, i) => {
    const explicit = /^(U\+|0x)/i.test(p)
    const clean = stripped[i]
    const decimal = !explicit && !anyLetter && /^[0-9]+$/.test(clean)
    const n = decimal ? Number(clean) : parseInt(clean, 16)
    if (!isFinite(n) || n < 0 || n > 0x10ffff) throw new Error('「' + p + '」不是合法的码点')
    out.push(String.fromCodePoint(n))
  })
  return out.join('')
}

export const SUSPICIOUS_LIST = Object.keys(INVISIBLE).map((k) => ({
  code: 'U+' + hex(Number(k), 4),
  name: INVISIBLE[k],
}))
