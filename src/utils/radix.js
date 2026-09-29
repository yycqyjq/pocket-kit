/**
 * 进制转换
 * 用 BigInt 保证大整数不丢精度，环境不支持时退回 Number
 */
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'

const HAS_BIGINT = (() => {
  try {
    return typeof BigInt === 'function' && BigInt(1) === BigInt('1')
  } catch (e) {
    return false
  }
})()

export const SUPPORTED_RADIX = [2, 8, 10, 16, 32, 36]

/** 校验某进制下的字符串是否合法 */
export function isValidInRadix(str, radix) {
  const s = String(str).trim().toLowerCase().replace(/^[-+]/, '')
  if (!s) return false
  return s.split('').every((c) => {
    const i = DIGITS.indexOf(c)
    return i > -1 && i < radix
  })
}

/**
 * 通用转换：把 fromRadix 进制字符串转成 toRadix 进制字符串
 * 抛错信息面向用户，可直接展示
 */
export function convert(value, fromRadix, toRadix) {
  const raw = String(value).trim().toLowerCase().replace(/[\s_]/g, '')
  if (!raw) throw new Error('请输入内容')
  const negative = raw[0] === '-'
  const body = raw.replace(/^[-+]/, '')
  if (!isValidInRadix(body, fromRadix)) {
    throw new Error('含有不属于 ' + fromRadix + ' 进制的字符')
  }
  if (HAS_BIGINT) {
    let n = 0n
    const base = BigInt(fromRadix)
    for (const ch of body) {
      n = n * base + BigInt(DIGITS.indexOf(ch))
    }
    if (negative) n = -n
    return n.toString(toRadix)
  }
  let n = 0
  for (const ch of body) {
    n = n * fromRadix + DIGITS.indexOf(ch)
    if (!isFinite(n)) throw new Error('数字过大，当前环境无法精确计算')
  }
  if (negative) n = -n
  return n.toString(toRadix)
}

/** 一次算出所有常用进制 */
export function convertAll(value, fromRadix) {
  const out = {}
  for (const r of SUPPORTED_RADIX) {
    try {
      out[r] = convert(value, fromRadix, r)
    } catch (e) {
      out[r] = null
    }
  }
  return out
}

/** 二进制按 4 位分组（BigInt 安全版） */
export function groupBinary(bin, size) {
  const s = String(bin).replace(/^[-+]/, '').replace(/^0b/i, '')
  if (!s || !/^[01]+$/.test(s)) return ''
  const step = size || 4
  const padLen = Math.ceil(s.length / step) * step
  const padded = s.padStart(padLen, '0')
  const parts = []
  for (let i = 0; i < padded.length; i += step) {
    parts.push(padded.slice(i, i + step))
  }
  return parts.join(' ')
}

/** 位运算视角：原码 / 反码 / 补码（8/16/32 位） */
export function bitDetail(value, radix, bits) {
  let dec
  try {
    dec = convert(value, radix || 10, 10)
  } catch (e) {
    return null
  }
  const n = Number(dec)
  if (!isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER) return null
  const width = bits || 32
  const max = Math.pow(2, width)
  const unsigned = n < 0 ? max + n : n
  const bin = unsigned.toString(2).padStart(width, '0')
  const hex = unsigned.toString(16).padStart(width / 4, '0').toUpperCase()
  const oct = unsigned.toString(8)
  // 负数补码对应的按位取反值
  const inverted = unsigned ^ (max - 1)
  return {
    width,
    unsigned: String(unsigned),
    binary: bin,
    binaryGrouped: groupBinary(bin, 4),
    hex,
    oct,
    inverted: inverted.toString(2).padStart(width, '0'),
    bytes: (() => {
      const arr = []
      for (let i = bin.length; i > 0; i -= 8) {
        arr.unshift(bin.slice(Math.max(0, i - 8), i))
      }
      return arr.join(' ').toUpperCase()
    })(),
  }
}

/** 常用字符集换算：ASCII 码 <-> 字符 */
export function asciiFromText(text) {
  return [...String(text)]
    .map((c) => {
      const code = c.codePointAt(0)
      return code < 128 || code > 0xffff
        ? code
        : null
    })
    .filter((x) => x !== null)
}
