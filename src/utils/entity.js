/**
 * HTML 实体编码与解码
 */

/** 常用命名实体（HTML4 + 常见 HTML5） */
export const NAMED_ENTITIES = [
  ['&', 'amp'], ['<', 'lt'], ['>', 'gt'], ['"', 'quot'], ["'", 'apos'],
  ['\u00a0', 'nbsp'], ['\u00a9', 'copy'], ['\u00ae', 'reg'], ['\u2122', 'trade'],
  ['\u00b0', 'deg'], ['\u00b1', 'plusmn'], ['\u00d7', 'times'], ['\u00f7', 'divide'],
  ['\u00b5', 'micro'], ['\u00b6', 'para'], ['\u00a7', 'sect'], ['\u00b7', 'middot'],
  ['\u2014', 'mdash'], ['\u2013', 'ndash'], ['\u2026', 'hellip'], ['\u2018', 'lsquo'],
  ['\u2019', 'rsquo'], ['\u201c', 'ldquo'], ['\u201d', 'rdquo'], ['\u00ab', 'laquo'],
  ['\u00bb', 'raquo'], ['\u2039', 'lsaquo'], ['\u203a', 'rsaquo'],
  ['\u2190', 'larr'], ['\u2191', 'uarr'], ['\u2192', 'rarr'], ['\u2193', 'darr'],
  ['\u2194', 'harr'], ['\u21d0', 'lArr'], ['\u21d2', 'rArr'],
  ['\u2212', 'minus'], ['\u221e', 'infin'], ['\u2248', 'asymp'], ['\u2260', 'ne'],
  ['\u2264', 'le'], ['\u2265', 'ge'], ['\u221a', 'radic'], ['\u2211', 'sum'],
  ['\u220f', 'prod'], ['\u222b', 'int'], ['\u2202', 'part'], ['\u2206', 'Delta'],
  ['\u03b1', 'alpha'], ['\u03b2', 'beta'], ['\u03b3', 'gamma'], ['\u03b4', 'delta'],
  ['\u03b5', 'epsilon'], ['\u03b8', 'theta'], ['\u03bb', 'lambda'], ['\u03bc', 'mu'],
  ['\u03c0', 'pi'], ['\u03c3', 'sigma'], ['\u03c6', 'phi'], ['\u03c9', 'omega'],
  ['\u2660', 'spades'], ['\u2663', 'clubs'], ['\u2665', 'hearts'], ['\u2666', 'diams'],
  ['\u2605', 'starf'], ['\u2606', 'star'], ['\u2713', 'check'], ['\u2717', 'cross'],
  ['\u20ac', 'euro'], ['\u00a3', 'pound'], ['\u00a5', 'yen'], ['\u00a2', 'cent'],
  ['\u00bd', 'frac12'], ['\u00bc', 'frac14'], ['\u00be', 'frac34'],
  ['\u2022', 'bull'], ['\u2032', 'prime'], ['\u2033', 'Prime'], ['\u2217', 'lowast'],
]

const NAME_MAP = (() => {
  const m = {}
  NAMED_ENTITIES.forEach(([ch, name]) => {
    m[name] = ch
  })
  // 补充常见别名
  m.apos = "'"
  m.AMP = '&'
  m.LT = '<'
  m.GT = '>'
  m.QUOT = '"'
  return m
})()

const CHAR_TO_NAME = (() => {
  const m = {}
  NAMED_ENTITIES.forEach(([ch, name]) => {
    if (m[ch] === undefined) m[ch] = name
  })
  return m
})()

/**
 * 编码
 *
 * 三种 scope 的分界线只看「非 ASCII 怎么办」——五个必须转义的字符（& < > 以及
 * quotes 打开时的两个引号）在任何 scope 下都转，ASCII 其余字符在任何 scope 下都原样：
 *   basic   非 ASCII 原样保留（界面「只转义 5 个」那档，中文/é/© 都不动）
 *   named   有命名实体的用名字（© → &copy;），没有的退回十进制数字
 *   numeric 非 ASCII 一律十进制数字（中 → &#20013;）
 *
 * @param {string} str
 * @param {object} [opt] { scope: 'basic' | 'named' | 'numeric', quotes: boolean }
 * @returns {string}
 * @throws {Error} scope 写错时抛中文错，不静默退回 numeric
 */
export function encodeEntities(str, opt) {
  const o = Object.assign({ scope: 'basic', quotes: true }, opt || {})
  if (o.scope === undefined || o.scope === null) o.scope = 'basic'
  if (o.scope !== 'basic' && o.scope !== 'named' && o.scope !== 'numeric') {
    throw new Error('未知的转义范围：' + JSON.stringify(o.scope) + '（可选 basic / named / numeric）')
  }
  const s = String(str)
  let out = ''

  for (const ch of s) {
    const cp = ch.codePointAt(0)

    if (ch === '&') {
      out += '&amp;'
      continue
    }
    if (ch === '<') {
      out += '&lt;'
      continue
    }
    if (ch === '>') {
      out += '&gt;'
      continue
    }
    if (o.quotes && ch === '"') {
      out += '&quot;'
      continue
    }
    if (o.quotes && ch === "'") {
      out += '&#39;'
      continue
    }

    // 到这里剩下的 ASCII 只是普通正文，三种 scope 都原样
    if (cp < 128) {
      out += ch
      continue
    }
    if (o.scope === 'basic') {
      out += ch
      continue
    }
    if (o.scope === 'named' && CHAR_TO_NAME[ch]) {
      out += '&' + CHAR_TO_NAME[ch] + ';'
      continue
    }
    out += '&#' + cp + ';'
  }
  return out
}

/** 解码：支持命名实体、十进制、十六进制 */
export function decodeEntities(str) {
  return String(str).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);?/g, (whole, body) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X'
      const n = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10)
      if (!isFinite(n) || n < 0 || n > 0x10ffff) return whole
      try {
        return String.fromCodePoint(n)
      } catch (e) {
        return whole
      }
    }
    if (NAME_MAP[body] !== undefined) return NAME_MAP[body]
    return whole
  })
}

/** 去掉 HTML 标签，拿到纯文本 */
export function stripTags(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** 统计文本里有多少个实体引用 */
export function countEntities(str) {
  const m = String(str).match(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g)
  return m ? m.length : 0
}

export const NEED_ESCAPE = [
  { ch: '&', entity: '&amp;', note: '最优先转义，否则后面的实体会被二次解析' },
  { ch: '<', entity: '&lt;', note: '不转义会被当成标签开始' },
  { ch: '>', entity: '&gt;', note: '严格说非必需，但转义更安全' },
  { ch: '"', entity: '&quot;', note: '放在属性值里必须转义' },
  { ch: "'", entity: '&#39;', note: '单引号包裹的属性值里必须转义' },
]
