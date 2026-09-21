/**
 * 古典密码与字符编码
 * 凯撒 / ROT13 / ROT47 / 栅栏 / A1Z26 / Atbash / 培根 / 摩斯
 * 这些都不算加密，只是字符变换——请勿用于保护真实机密。
 */

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const a = 'abcdefghijklmnopqrstuvwxyz'

/* ---------------- 凯撒 ---------------- */

export function caesar(text, shift, decode) {
  const n = ((Number(shift) % 26) + 26) % 26
  const s = decode ? (26 - n) % 26 : n
  return String(text).replace(/[a-zA-Z]/g, (ch) => {
    const upper = ch >= 'A' && ch <= 'Z'
    const idx = upper ? ch.charCodeAt(0) - 65 : ch.charCodeAt(0) - 97
    const shifted = (idx + s) % 26
    return String.fromCharCode((upper ? 65 : 97) + shifted)
  })
}

/** 凯撒暴力枚举 26 种位移 */
export function caesarBrute(text) {
  const out = []
  for (let i = 0; i < 26; i++) out.push({ shift: i, text: caesar(text, i, true) })
  return out
}

export const rot13 = (text) => caesar(text, 13, false)

/** ROT47：可打印 ASCII（33~126）位移 47 */
export function rot47(text) {
  return String(text).replace(/[!-~]/g, (ch) => String.fromCharCode(33 + ((ch.charCodeAt(0) - 33 + 47) % 94)))
}

/* ---------------- 栅栏 ---------------- */

export function railEncrypt(text, rails) {
  const n = Math.max(2, Math.min(50, Number(rails) || 2))
  const s = String(text)
  if (!s) return ''
  const rows = Array.from({ length: n }, () => [])
  let r = 0
  let dir = 1
  for (const ch of s) {
    rows[r].push(ch)
    if (r === 0) dir = 1
    else if (r === n - 1) dir = -1
    r += dir
  }
  return rows.map((x) => x.join('')).join('')
}

export function railDecrypt(text, rails) {
  const n = Math.max(2, Math.min(50, Number(rails) || 2))
  const s = String(text)
  if (!s) return ''
  // 先算出每行有多少字符
  const order = []
  let r = 0
  let dir = 1
  for (let i = 0; i < s.length; i++) {
    order.push(r)
    if (r === 0) dir = 1
    else if (r === n - 1) dir = -1
    r += dir
  }
  const counts = new Array(n).fill(0)
  order.forEach((x) => counts[x]++)
  const rows = []
  let pos = 0
  for (let i = 0; i < n; i++) {
    rows.push(s.slice(pos, pos + counts[i]).split(''))
    pos += counts[i]
  }
  return order.map((x) => rows[x].shift()).join('')
}

/* ---------------- A1Z26 ---------------- */

export function a1z26Encode(text) {
  return [...String(text).toLowerCase()]
    .map((ch) => {
      const i = a.indexOf(ch)
      return i < 0 ? (ch === ' ' ? '/' : ch) : String(i + 1)
    })
    .join('-')
    .replace(/-?\/-?/g, ' / ')
}

export function a1z26Decode(text) {
  const s = String(text).trim()
  if (!s) return ''
  // 支持 8-5-12-12-15 与 8 5 12 12 15 两种写法
  const groups = s.split(/[^0-9]+/).filter(Boolean)
  return groups
    .map((g) => {
      const n = Number(g)
      return n >= 1 && n <= 26 ? a[n - 1] : '?'
    })
    .join('')
}

/* ---------------- Atbash ---------------- */

export function atbash(text) {
  return String(text).replace(/[a-zA-Z]/g, (ch) => {
    const upper = ch >= 'A' && ch <= 'Z'
    const idx = upper ? ch.charCodeAt(0) - 65 : ch.charCodeAt(0) - 97
    return String.fromCharCode((upper ? 65 : 97) + (25 - idx))
  })
}

/* ---------------- 培根 ---------------- */

const BACON_MAP = {
  A: 'AAAAA', B: 'AAAAB', C: 'AAABA', D: 'AAABB', E: 'AABAA', F: 'AABAB', G: 'AABBA',
  H: 'AABBB', I: 'ABAAA', J: 'ABAAB', K: 'ABABA', L: 'ABABB', M: 'ABBAA', N: 'ABBAB',
  O: 'ABBBA', P: 'ABBBB', Q: 'BAAAA', R: 'BAAAB', S: 'BAABA', T: 'BAABB', U: 'BABAA',
  V: 'BABAB', W: 'BABBA', X: 'BABBB', Y: 'BBAAA', Z: 'BBAAB',
}
const BACON_REV = Object.keys(BACON_MAP).reduce((m, k) => {
  m[BACON_MAP[k]] = k
  return m
}, {})

export function baconEncode(text) {
  return [...String(text).toUpperCase()]
    .map((ch) => BACON_MAP[ch] || (ch === ' ' ? '/' : '?'))
    .join(' ')
}

export function baconDecode(text) {
  const s = String(text).toUpperCase()
  const out = []
  // 同时兼容 A/B 与 0/1 两种写法
  const cleaned = s.replace(/0/g, 'A').replace(/1/g, 'B')
  const groups = cleaned.split(/[^AB]+/).filter((g) => g.length)
  groups.forEach((g) => {
    for (let i = 0; i + 5 <= g.length; i += 5) {
      const chunk = g.slice(i, i + 5)
      out.push(BACON_REV[chunk] || '?')
    }
  })
  return out.join('')
}

/* ---------------- 摩斯 ---------------- */

const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
  I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
  Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
  5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--',
  '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...',
  ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-',
  '"': '.-..-.', '$': '...-..-', '@': '.--.-.',
}
const MORSE_REV = Object.keys(MORSE).reduce((m, k) => {
  m[MORSE[k]] = k
  return m
}, {})

export function morseEncode(text) {
  return [...String(text).toUpperCase()]
    .map((ch) => (ch === ' ' ? '/' : MORSE[ch] || '?'))
    .join(' ')
}

export function morseDecode(text) {
  return String(text)
    .trim()
    .split(/\s+/)
    .map((code) => {
      if (code === '/' || code === '|') return ' '
      return MORSE_REV[code] || '?'
    })
    .join('')
}

/* ---------------- 统一入口 ---------------- */

export const METHODS = [
  { key: 'caesar', name: '凯撒', needNum: true, numLabel: '位移（1-25）', numDefault: 3, hasBrute: true, note: '按固定位数平移字母表，位移 3 就是经典的凯撒密码' },
  { key: 'rot13', name: 'ROT13', needNum: false, note: '凯撒位移 13 的特例，加解密是同一个操作' },
  { key: 'rot47', name: 'ROT47', needNum: false, note: '对全部可打印 ASCII 位移 47，数字和符号也会变' },
  { key: 'rail', name: '栅栏', needNum: true, numLabel: '栏数（2-50）', numDefault: 3, note: '把文字按之字形分到若干行再拼起来，打乱顺序但不改变字符' },
  { key: 'a1z26', name: 'A1Z26', needNum: false, note: 'a=1 到 z=26，最常见的入门密码' },
  { key: 'atbash', name: 'Atbash', needNum: false, note: '字母表首尾互换，a 变 z、b 变 y' },
  { key: 'bacon', name: '培根', needNum: false, note: '每个字母用 5 个 A/B 表示，也常用 0/1 写' },
  { key: 'morse', name: '摩斯电码', needNum: false, note: '点和划的组合，字母之间用空格、单词之间用 / 分隔' },
]

export function runMethod(key, text, numValue, decode) {
  switch (key) {
    case 'caesar':
      return caesar(text, numValue, decode)
    case 'rot13':
      return rot13(text)
    case 'rot47':
      return rot47(text)
    case 'rail':
      return decode ? railDecrypt(text, numValue) : railEncrypt(text, numValue)
    case 'a1z26':
      return decode ? a1z26Decode(text) : a1z26Encode(text)
    case 'atbash':
      return atbash(text)
    case 'bacon':
      return decode ? baconDecode(text) : baconEncode(text)
    case 'morse':
      return decode ? morseDecode(text) : morseEncode(text)
    default:
      throw new Error('未知的方法：' + key)
  }
}

export const SAMPLE_CLASSIC = 'Hello World'
