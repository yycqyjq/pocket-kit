/**
 * 位运算台：8 / 16 / 32 / 64 位下的逻辑运算、移位、循环移位、
 * 逐位网格、补码三步过程、掩码与位段抽取、位计数。
 * ------------------------------------------------------------
 * 设计要点
 *   1. 纯函数，不碰 uni / DOM，可在 Node 里直接跑断言。
 *   2. 位数组（MSB 在前的 0/1 数组）是唯一内核表示：
 *      所有运算都在数组上做，逻辑只写一遍，再由 BigInt 或 Number 负责
 *      十进制 / 十六进制的读写。这样 64 位不丢精度，
 *      运行环境没有 BigInt 时自动降级到 8 / 16 / 32 位并给出提示
 *      （探测方式与 utils/radix.js 一致）。
 *   3. 抛出的 Error message 面向用户，视图层可直接展示。
 */

const HAS_BIGINT = (() => {
  try {
    return typeof BigInt === 'function' && BigInt(1) === BigInt('1')
  } catch (e) {
    return false
  }
})()

/** 对外暴露：视图据此决定是否显示 64 位选项与降级提示 */
export const BIGINT_OK = HAS_BIGINT
export const WIDTHS = [8, 16, 32, 64]
export const WIDTH_OPTIONS = [
  { key: 8, name: '8 位' },
  { key: 16, name: '16 位' },
  { key: 32, name: '32 位' },
  { key: 64, name: '64 位' },
]
/** 没有 BigInt 时能安全计算的最大位宽（2^32 在双精度里精确） */
export const SAFE_WIDTH_WITHOUT_BIGINT = 32

export function supportsWidth(width) {
  const w = Number(width)
  if (WIDTHS.indexOf(w) === -1) return false
  return HAS_BIGINT || w <= SAFE_WIDTH_WITHOUT_BIGINT
}

function checkWidth(width) {
  const w = Number(width)
  if (WIDTHS.indexOf(w) === -1) throw new Error('位宽只能是 8 / 16 / 32 / 64')
  if (!HAS_BIGINT && w > SAFE_WIDTH_WITHOUT_BIGINT) {
    throw new Error('当前运行环境不支持 BigInt，64 位会丢精度，请改用 8 / 16 / 32 位')
  }
  return w
}

/* ============================================================
 * 1. 位数组内核（索引 0 = 最高位）
 * ============================================================ */

function zeroArr(w) {
  const a = new Array(w)
  for (let i = 0; i < w; i++) a[i] = 0
  return a
}

/** 数值（BigInt | Number | 整数）-> 位数组，按位宽回绕 */
function numToArr(v, w) {
  let x
  const mod = HAS_BIGINT ? BigInt(2) ** BigInt(w) : Math.pow(2, w)
  if (HAS_BIGINT) {
    x = BigInt(v)
    const m = mod
    x = ((x % m) + m) % m
  } else {
    x = Number(v)
    if (!isFinite(x)) throw new Error('数值过大，当前环境算不了')
    const m = mod
    x = ((x % m) + m) % m
  }
  const a = zeroArr(w)
  for (let i = w - 1; i >= 0; i--) {
    if (HAS_BIGINT) {
      a[i] = Number(x & 1n)
      x = x >> 1n
    } else {
      a[i] = x % 2
      x = Math.floor(x / 2)
    }
  }
  return a
}

/** 位数组 -> 无符号数值（BigInt | Number） */
function arrToNum(bits) {
  const a = normArr(bits)
  if (HAS_BIGINT) {
    let x = 0n
    for (let i = 0; i < a.length; i++) x = (x << 1n) + BigInt(a[i] ? 1 : 0)
    return x
  }
  let n = 0
  for (let i = 0; i < a.length; i++) {
    n = n * 2 + (a[i] ? 1 : 0)
    if (!isFinite(n)) throw new Error('数值过大，当前环境算不了（缺少 BigInt）')
  }
  return n
}

function normArr(bits) {
  const src = Array.isArray(bits) ? bits : []
  const out = new Array(src.length)
  for (let i = 0; i < src.length; i++) out[i] = src[i] ? 1 : 0
  return out
}

function zip(a, b, fn) {
  const out = new Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = fn(a[i], b[i]) ? 1 : 0
  return out
}
function mapBit(a, fn) {
  const out = new Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = fn(a[i]) ? 1 : 0
  return out
}
const band = (x, y) => !!(x && y)
const bor = (x, y) => !!(x || y)
const bxor = (x, y) => !!(x !== y)
const bnot = (x) => !x

/**
 * 注意数组是 MSB 在前（索引 0 = 最高位），所以：
 *   左移 = 每个位往索引变小的方向挪 => out[i] = a[i + n]，尾部补 0
 *   右移 = 每个位往索引变大的方向挪 => out[i] = a[i - n]，头部补 fill
 */
/** 左移：低位补 0，高位丢弃 */
function shlArr(a, n) {
  const w = a.length
  const out = zeroArr(w)
  const k = n >= w ? w : n
  for (let i = 0; i + k < w; i++) out[i] = a[i + k]
  return out
}
/** 右移：fill = 0 为逻辑右移，fill = 符号位为算术右移；移出位宽的位数按全部移出处理 */
function shrArr(a, n, fill) {
  const w = a.length
  const out = zeroArr(w)
  const k = n >= w ? w : n
  const pad = fill ? 1 : 0
  for (let i = 0; i < w; i++) out[i] = i < k ? pad : a[i - k]
  return out
}
/** 循环左移：移出的高位绕回低位 */
function rolArr(a, n) {
  const w = a.length
  const k = ((n % w) + w) % w
  const out = new Array(w)
  for (let i = 0; i < w; i++) out[i] = a[(i + k) % w]
  return out
}
/** 循环右移：移出的低位绕回高位 */
function rorArr(a, n) {
  const w = a.length
  const k = ((n % w) + w) % w
  const out = new Array(w)
  for (let i = 0; i < w; i++) out[i] = a[(i - k + w) % w]
  return out
}

/* ============================================================
 * 2. 解析与格式化
 * ============================================================ */

const RADIX_PREFIX = [
  { re: /^0x([0-9a-f]+)$/, radix: 16 },
  { re: /^0b([01]+)$/, radix: 2 },
  { re: /^0o([0-7]+)$/, radix: 8 },
]
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'

function normInput(input) {
  return String(input == null ? '' : input).trim().toLowerCase().replace(/[\s_]/g, '')
}

/**
 * 字符串 -> { neg, radix, digits, mag }
 * mag 是非负量级：有 BigInt 时是 BigInt，没有时是双精度 Number（超安全范围直接报错）
 */
function toPlain(raw, radix) {
  if (!raw) throw new Error('请输入一个整数')
  const neg = raw.charAt(0) === '-'
  const body = raw.replace(/^[-+]/, '')
  if (!body) throw new Error('只有符号没有数字，检查一下输入')

  let r = radix ? Number(radix) : 0
  let digits = body
  if (!r) {
    for (let i = 0; i < RADIX_PREFIX.length; i++) {
      const m = RADIX_PREFIX[i].re.exec(body)
      if (m) {
        r = RADIX_PREFIX[i].radix
        digits = m[1]
        break
      }
    }
    if (!r) r = 10
  }
  if (r !== 2 && r !== 8 && r !== 10 && r !== 16) throw new Error('只支持 2 / 8 / 10 / 16 进制')
  if (!/^[0-9a-f]+$/.test(digits)) throw new Error('含有不属于 ' + r + ' 进制的字符')
  for (let i = 0; i < digits.length; i++) {
    const at = DIGITS.indexOf(digits.charAt(i))
    if (at < 0 || at >= r) throw new Error('「' + digits.charAt(i) + '」不属于 ' + r + ' 进制')
  }

  let mag = HAS_BIGINT ? 0n : 0
  const base = HAS_BIGINT ? BigInt(r) : r
  for (let i = 0; i < digits.length; i++) {
    const at = DIGITS.indexOf(digits.charAt(i))
    mag = HAS_BIGINT ? mag * base + BigInt(at) : mag * base + at
    if (!HAS_BIGINT && !isFinite(mag)) throw new Error('数字太长，当前环境（无 BigInt）算不动，请减量或换 8 / 16 / 32 位')
  }
  if (!HAS_BIGINT && mag > Number.MAX_SAFE_INTEGER) {
    throw new Error('数字超出了双精度安全范围，当前环境没有 BigInt，请减量')
  }
  return { neg: neg, radix: r, digits: digits, mag: mag }
}

/** 量级需要多少个二进制位才能装下 */
function bitLengthOf(mag) {
  let x = mag
  let n = 0
  if (HAS_BIGINT) {
    if (x < 0n) x = -x
    while (x > 0n) {
      n++
      x >>= 1n
    }
    return n
  }
  x = Math.abs(Number(x))
  while (x > 0) {
    n++
    x = Math.floor(x / 2)
  }
  return n
}

/**
 * 解析一个整数（十进制可带负号；支持 0x / 0b / 0o 前缀；也可显式指定 radix）
 * @returns formatValue 的全部字段，另带 input / radix / negative / exact / overflow / note
 */
export function parseValue(input, width, radix) {
  const w = checkWidth(width)
  const raw = normInput(input)
  const p = toPlain(raw, radix)
  const v = p.neg ? -p.mag : p.mag

  // 回绕到 [0, 2^w)
  const bits = numToArr(v, w)
  const info = formatValue(bits, w)
  info.input = raw
  info.radix = p.radix
  info.negative = p.neg
  info.exact = true
  const want = String(v)
  const got = p.neg ? info.signed : info.unsigned
  if (got !== want) {
    info.exact = false
    info.overflow = true
    info.note =
      (p.neg
        ? '原值 ' + want + ' 低于 ' + w + ' 位有符号下限'
        : '原值 ' + want + ' 超出 ' + w + ' 位能表示的上限') +
      '，按 ' + got + ' 回绕（等价于对 2^' + w + ' 取模）'
  }
  return info
}

/** 自动挑一个能装下该值的最小位宽；解析不了就退回 32 位 */
export function pickWidth(input, radix) {
  const raw = normInput(input)
  let p
  try {
    p = toPlain(raw, radix)
  } catch (e) {
    return 32
  }
  let need
  if (p.neg) {
    // 补码下负数 v 需要 n 位满足 2^(n-1) >= |v|，即 1 + bitLength(|v| - 1)
    need = bitLengthOf(HAS_BIGINT ? p.mag - 1n : p.mag - 1) + 1
  } else {
    need = bitLengthOf(p.mag)
  }
  if (need <= 8) return 8
  if (need <= 16) return 16
  if (need <= 32) return 32
  return 64
}

function signedOf(bits, w) {
  const u = arrToNum(bits)
  if (!bits[0]) return String(u)
  // 无符号值 - 2^w
  if (HAS_BIGINT) return String(u - (BigInt(1) << BigInt(w)))
  return String(u - Math.pow(2, w))
}

function groupBy(s, size, sep) {
  const step = size || 4
  const out = []
  for (let i = s.length; i > 0; i -= step) out.unshift(s.slice(Math.max(0, i - step), i))
  return out.join(sep || ' ')
}

/** 位数组 -> 一整套可读写法 */
export function formatValue(bits, width) {
  const w = checkWidth(width)
  const arr = normArr(bits)
  if (arr.length !== w) throw new Error('位数组长度（' + arr.length + '）与位宽（' + w + '）不一致')
  let bin = ''
  for (let i = 0; i < w; i++) bin += arr[i] ? '1' : '0'
  const u = arrToNum(arr)
  const hexDigits = w / 4
  const hexRaw = (u.toString(16).toUpperCase() + '').slice(-hexDigits)
  return {
    width: w,
    bits: arr,
    bin: bin,
    binGrouped: groupBy(bin, 4),
    bytes: groupBy(bin, 8),
    hex: '0x' + padHex(hexRaw, hexDigits),
    unsigned: String(u),
    signed: signedOf(arr, w),
    octal: u.toString(8),
    signBit: arr[0],
    highIndex: w - 1,
  }
}
function padHex(s, len) {
  let out = String(s)
  while (out.length < len) out = '0' + out
  return out
}

/* ============================================================
 * 3. 逐位网格：bitsOf / fromBits
 * ============================================================ */

/** 值 -> 逐位数组（MSB 在前，长度 = 位宽），供视图渲染成可点击的位网格 */
export function bitsOf(value, width) {
  return parseValue(value, width).bits
}

/** 位数组 -> 无符号十进制字符串 */
export function fromBits(bits, width) {
  const w = checkWidth(width)
  const arr = normArr(bits)
  if (arr.length !== w) throw new Error('位数组长度（' + arr.length + '）与位宽（' + w + '）不一致')
  return String(arrToNum(arr))
}

/** 位数组 -> 有符号十进制字符串 */
export function fromBitsSigned(bits, width) {
  const w = checkWidth(width)
  const arr = normArr(bits)
  if (arr.length !== w) throw new Error('位数组长度（' + arr.length + '）与位宽（' + w + '）不一致')
  return signedOf(arr, w)
}

/** 翻转某一位（网格点击用），返回新数组，不动原数组 */
export function flipBit(bits, index) {
  const arr = normArr(bits)
  const i = Number(index)
  if (!(i >= 0 && i < arr.length)) throw new Error('位序号超出范围')
  arr[i] = arr[i] ? 0 : 1
  return arr
}

/** 该位对应的位号（从左往右第 i 格 = 第 w-1-i 位） */
export function bitIndexOf(width, gridPos) {
  const w = checkWidth(width)
  return w - 1 - Number(gridPos)
}

/* ============================================================
 * 4. 运算全家桶
 * ============================================================ */

/**
 * 一次算完 13 种位运算。
 * 位移类的移位数取操作数 B 的无符号值：B 超过位宽时，移位类结果按「全部移出」处理，
 * 循环移位则自动对位宽取模。
 * @returns {Array} 每项含 group / name / expr / note 与 有符号 · 无符号 · 十六进制 · 二进制分组
 */
export function ops(a, b, width) {
  const w = checkWidth(width)
  const A = parseValue(a, w).bits
  const B = parseValue(b === '' || b == null ? '0' : b, w).bits
  const nBig = arrToNum(B) // B 的无符号值当作移位量
  const tooFar = HAS_BIGINT ? nBig >= BigInt(w) : nBig >= w
  // 移位：位数达到 / 超过位宽就按「全部移出」处理（与 JS 的 ToUint32 语义不同，这里选择更直观的教学口径）
  const n = tooFar ? w : HAS_BIGINT ? Number(nBig) : Number(nBig)
  // 循环移位：自动对位宽取模，不受上面的饱和影响
  const nRot = HAS_BIGINT ? Number(BigInt(nBig) % BigInt(w)) : Number(nBig) % w
  const sat = tooFar ? '移位数（B = ' + String(nBig) + '）不小于位宽 ' + w + '，按全部移出处理' : ''

  const defs = [
    { key: 'and', group: 'logic', name: '与 AND', expr: 'A & B', note: '两位都是 1 才得 1', bits: zip(A, B, band) },
    { key: 'or', group: 'logic', name: '或 OR', expr: 'A | B', note: '任一位是 1 即得 1', bits: zip(A, B, bor) },
    { key: 'xor', group: 'logic', name: '异或 XOR', expr: 'A ^ B', note: '两位不同才得 1，可当无进位加法', bits: zip(A, B, bxor) },
    { key: 'nand', group: 'logic', name: '与非 NAND', expr: '~(A & B)', note: 'AND 再整体取反，万能门', bits: mapBit(zip(A, B, band), bnot) },
    { key: 'nor', group: 'logic', name: '或非 NOR', expr: '~(A | B)', note: 'OR 再整体取反', bits: mapBit(zip(A, B, bor), bnot) },
    { key: 'xnor', group: 'logic', name: '同或 XNOR', expr: '~(A ^ B)', note: '两位相同即得 1', bits: mapBit(zip(A, B, bxor), bnot) },
    { key: 'not', group: 'logic', name: '取反 NOT', expr: '~A', note: '只用到 A，逐位 0/1 互换', bits: mapBit(A, bnot) },
    { key: 'andnot', group: 'logic', name: '清位 ANDNOT', expr: 'A & ~B', note: 'B 里为 1 的位，把 A 对应位清零', bits: zip(A, mapBit(B, bnot), band) },
    { key: 'shl', group: 'shift', name: '左移', expr: 'A << ' + n, note: '低位补 0，高位丢弃；等价于乘 2^n 后回绕', bits: shlArr(A, n), sat: sat },
    {
      key: 'shr',
      group: 'shift',
      name: '算术右移',
      expr: 'A >> ' + n,
      note: '高位补符号位，负数右移仍然趋向负方向',
      bits: shrArr(A, n, A[0]),
      sat: sat,
    },
    { key: 'shrl', group: 'shift', name: '逻辑右移', expr: 'A >>> ' + n, note: '高位补 0，等价于无符号除以 2^n', bits: shrArr(A, n, 0), sat: sat },
    {
      key: 'rol',
      group: 'shift',
      name: '循环左移',
      expr: 'rotateL(A, ' + nRot + ')',
      note: '移出的高位绕回低位，位移量已对 ' + w + ' 取模',
      bits: rolArr(A, nRot),
      sat: tooFar ? 'B = ' + String(nBig) + ' 已对 ' + w + ' 取模为 ' + nRot : '',
    },
    {
      key: 'ror',
      group: 'shift',
      name: '循环右移',
      expr: 'rotateR(A, ' + nRot + ')',
      note: '移出的低位绕回高位，位移量已对 ' + w + ' 取模',
      bits: rorArr(A, nRot),
      sat: tooFar ? 'B = ' + String(nBig) + ' 已对 ' + w + ' 取模为 ' + nRot : '',
    },
  ]

  const aBin = A.join('')
  return defs.map(function (d) {
    const f = formatValue(d.bits, w)
    return {
      key: d.key,
      group: d.group,
      name: d.name,
      expr: d.expr,
      note: d.note,
      signed: f.signed,
      unsigned: f.unsigned,
      hex: f.hex,
      bin: f.bin,
      binGrouped: f.binGrouped,
      bits: f.bits,
      changed: f.bin !== aBin,
      shiftNote: d.group === 'shift' && d.sat ? d.sat : '',
    }
  })
}

/* ============================================================
 * 5. 补码三步过程
 * ============================================================ */

/**
 * 原码 / 反码 / 补码的逐步过程（教材口径：符号位不变，数值位取反，末位加 1）
 */
export function twosComplement(value, width) {
  const w = checkWidth(width)
  const info = parseValue(value, w)
  const bits = info.bits
  const neg = bits[0] === 1
  const u = arrToNum(bits)
  const mod = HAS_BIGINT ? BigInt(1) << BigInt(w) : Math.pow(2, w)
  // 绝对值：负数的量级 = 2^w - 无符号读数（全程 BigInt，64 位不丢精度）
  const absMag = neg ? mod - u : u
  const absBits = numToArr(absMag, w)

  // 原码：符号位 + 绝对值二进制
  const signAndAbs = absBits.slice()
  if (neg) signAndAbs[0] = 1
  // 反码：符号位不变，数值位逐位取反
  const ones = signAndAbs.map(function (x, i) {
    return i === 0 ? x : x ? 0 : 1
  })
  // 补码：负数 = 反码末位加 1；而机器里本来存的就是这个补码
  const twos = bits.slice()

  function binOf(arr) {
    let s = ''
    for (let i = 0; i < arr.length; i++) s += arr[i] ? '1' : '0'
    return groupBy(s, 4)
  }
  function hexOf(arr) {
    return formatValue(arr, w).hex
  }

  const absText = String(absMag)
  const steps = neg
    ? [
        { k: '绝对值', v: binOf(absBits), note: '先把 ' + absText + ' 写成二进制' },
        {
          k: '原码',
          v: binOf(signAndAbs),
          note:
            '符号位置 1，数值位不变（教材口径的原码 ' +
            hexOf(signAndAbs) +
            '）' +
            (absBits[0] ? '；注意：这是该位宽的最低负数，量级已占满数值位，原码形式其实表示不下它' : ''),
        },
        { k: '反码', v: binOf(ones), note: '符号位不动，数值位逐位取反，0 变 1、1 变 0' },
        {
          k: '补码',
          v: binOf(twos),
          note: '反码末位加 1，就是机器真正存的 ' + hexOf(twos) + '（无符号读作 ' + info.unsigned + '）',
        },
      ]
    : [
        { k: '原码', v: binOf(bits), note: '正数符号位是 0' },
        { k: '反码', v: binOf(bits), note: '正数的反码与原码相同' },
        { k: '补码', v: binOf(bits), note: '正数的补码也与原码相同，三步合一' },
      ]

  return {
    width: w,
    input: info.input,
    signed: info.signed,
    unsigned: info.unsigned,
    hex: info.hex,
    bin: info.bin,
    binGrouped: info.binGrouped,
    bits: bits,
    negative: neg,
    absolute: absText,
    signBit: bits[0],
    signMeaning: neg ? '最高位是 1：按有符号读它是负数' : '最高位是 0：按有符号读它是非负数',
    steps: steps,
    range: signedRange(w),
    note: neg
      ? '同一个位串，无符号读作 ' + info.unsigned + '，补码读作 ' + info.signed + '，相差 2^' + w + '（' + String(mod) + '）'
      : '正数三种码完全一致，所以正负判断只看最高位',
    overflow: info.overflow,
    wrapNote: info.note || '',
  }
}

function signedRange(w) {
  const hi = (HAS_BIGINT ? Number(BigInt(1) << BigInt(w - 1)) - 1 : Math.pow(2, w - 1) - 1)
  const lo = HAS_BIGINT ? -Number(BigInt(1) << BigInt(w - 1)) : -Math.pow(2, w - 1)
  if (w === 64) {
    return {
      signed: '-9223372036854775808 ~ 9223372036854775807',
      unsigned: '0 ~ 18446744073709551615',
    }
  }
  return { signed: lo + ' ~ ' + hi, unsigned: '0 ~ ' + (Math.pow(2, w) - 1) }
}

/* ============================================================
 * 6. 掩码与位段
 * ============================================================ */

function rangeCheck(high, low, w) {
  const hi = Number(high)
  const lo = Number(low)
  if (!isFinite(hi) || !isFinite(lo) || hi !== Math.floor(hi) || lo !== Math.floor(lo)) {
    throw new Error('位号必须是整数')
  }
  if (lo < 0 || hi < 0) throw new Error('位号不能为负')
  if (hi > w - 1) throw new Error(w + ' 位下最高位号是 ' + (w - 1))
  if (hi < lo) throw new Error('高位的位号（' + hi + '）不能小于低位（' + lo + '）')
  return { hi: hi, lo: lo }
}

/** 把 [high..low] 这段置 1 的掩码 */
export function maskBits(high, low, width) {
  const w = checkWidth(width == null ? 32 : width)
  const rg = rangeCheck(high, low, w)
  const arr = zeroArr(w)
  for (let i = 0; i < w; i++) {
    const bitNo = w - 1 - i
    arr[i] = bitNo <= rg.hi && bitNo >= rg.lo ? 1 : 0
  }
  const f = formatValue(arr, w)
  return {
    high: rg.hi,
    low: rg.lo,
    width: w,
    count: rg.hi - rg.lo + 1,
    bits: f.bits,
    bin: f.bin,
    binGrouped: f.binGrouped,
    hex: f.hex,
    unsigned: f.unsigned,
    signed: f.signed,
    note: '第 ' + rg.hi + ' ~ ' + rg.lo + ' 位为 1，共 ' + (rg.hi - rg.lo + 1) + ' 位',
  }
}

/** 低 n 位全 1 的掩码：maskOf(n) = 2^n - 1 */
export function maskOf(n, width) {
  const k = Number(n)
  if (!isFinite(k) || k !== Math.floor(k)) throw new Error('掩码位数必须是整数')
  if (k < 0) throw new Error('掩码位数不能为负')
  const w = checkWidth(width == null ? Math.max(8, Math.ceil(k / 8) * 8) : width)
  if (k > w) throw new Error('位宽 ' + w + ' 位放不下 ' + k + ' 位掩码')
  const arr = zeroArr(w)
  for (let i = 0; i < w; i++) arr[i] = w - 1 - i < k ? 1 : 0
  const f = formatValue(arr, w)
  return {
    n: k,
    width: w,
    bits: f.bits,
    bin: f.bin,
    binGrouped: f.binGrouped,
    hex: f.hex,
    unsigned: f.unsigned,
    signed: f.signed,
    note: '低 ' + k + ' 位全 1（2^' + k + ' - 1）：与它是取低 ' + k + ' 位，与它是按位清零',
  }
}

/** 抽出 [high..low] 这一段的值（段宽可以是任意 1~位宽，不必是 8/16/32/64） */
export function extract(value, high, low, width) {
  const w = checkWidth(width == null ? pickWidth(value) : width)
  const src = parseValue(value, w)
  const rg = rangeCheck(high, low, w)
  const picked = []
  for (let i = 0; i < w; i++) {
    const bitNo = w - 1 - i
    if (bitNo <= rg.hi && bitNo >= rg.lo) picked.push(src.bits[i])
  }
  const subW = picked.length
  let bin = ''
  for (let i = 0; i < subW; i++) bin += picked[i] ? '1' : '0'
  const u = arrToNum(picked)
  const mask = maskBits(rg.hi, rg.lo, w)
  return {
    source: src.binGrouped,
    sourceHex: src.hex,
    sourceUnsigned: src.unsigned,
    high: rg.hi,
    low: rg.lo,
    width: w,
    bits: picked,
    bin: bin,
    binGrouped: groupBy(bin, 4),
    count: subW,
    unsigned: String(u),
    signed: signedOf(picked, subW),
    hex: '0x' + padHex(u.toString(16).toUpperCase(), Math.max(1, Math.ceil(subW / 4))),
    maskHex: mask.hex,
    note:
      '第 ' + rg.hi + ' ~ ' + rg.lo + ' 位（共 ' + subW + ' 位）：等价于 (x & ' + mask.hex + ') >> ' + rg.lo,
  }
}

/* ============================================================
 * 7. 位计数与速查
 * ============================================================ */

export function popcount(value, width) {
  const bits = parseValue(value, width == null ? pickWidth(value) : width).bits
  let n = 0
  for (let i = 0; i < bits.length; i++) n += bits[i]
  return n
}

/** 前导零的个数（从最高位起连续有多少个 0） */
export function leadingZeros(value, width) {
  const w = checkWidth(width == null ? pickWidth(value) : width)
  const bits = parseValue(value, w).bits
  let n = 0
  while (n < bits.length && !bits[n]) n++
  return n
}

/** 尾随零个数，等价于「最低置位位的位号」；0 返回 -1 */
export function lowestSetBit(value, width) {
  const w = checkWidth(width == null ? pickWidth(value) : width)
  const bits = parseValue(value, w).bits
  for (let i = bits.length - 1; i >= 0; i--) {
    if (bits[i]) return w - 1 - i
  }
  return -1
}

/** 最高置位位的位号（0 返回 -1） */
export function highestSetBit(value, width) {
  const w = checkWidth(width == null ? pickWidth(value) : width)
  const bits = parseValue(value, w).bits
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) return w - 1 - i
  }
  return -1
}

export function isPowerOfTwo(value, width) {
  const w = checkWidth(width == null ? pickWidth(value) : width)
  const bits = parseValue(value, w).bits
  let n = 0
  for (let i = 0; i < bits.length; i++) n += bits[i]
  const zero = bits.join('').indexOf('1') === -1
  return !zero && n === 1
}

/** 一个数的位特征汇总：视图直接铺成速查卡 */
export function bitProfile(value, width) {
  const w = checkWidth(width == null ? pickWidth(value) : width)
  const info = parseValue(value, w)
  const bits = info.bits
  let ones = 0
  for (let i = 0; i < bits.length; i++) ones += bits[i]
  let clz = 0
  while (clz < bits.length && !bits[clz]) clz++
  let low = -1
  for (let i = bits.length - 1; i >= 0; i--) {
    if (bits[i]) {
      low = w - 1 - i
      break
    }
  }
  let high = -1
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) {
      high = w - 1 - i
      break
    }
  }
  const pow2 = low === high && low !== -1
  const bytes = []
  for (let i = 0; i < w; i += 8) {
    let s = 0
    for (let k = i; k < Math.min(i + 8, w); k++) s = (s << 1) | bits[k]
    bytes.push(padHex(s.toString(16).toUpperCase(), 2))
  }
  return {
    width: w,
    input: info.input,
    signed: info.signed,
    unsigned: info.unsigned,
    hex: info.hex,
    bin: info.bin,
    binGrouped: info.binGrouped,
    bytes: bytes.join(' '),
    ones: ones,
    zeros: w - ones,
    popcount: ones,
    clz: clz,
    ctz: low === -1 ? w : low,
    lowestSet: low,
    highestSet: high,
    bitLength: high === -1 ? 0 : high + 1,
    isPowerOfTwo: pow2,
    parity: ones % 2,
    signBit: bits[0],
    signMeaning: bits[0] ? '最高位 1 => 有符号读作负数' : '最高位 0 => 有符号读作非负数',
    range: signedRange(w),
    note: ones === 0 ? '全 0：任何位与它 AND 都得 0，OR 得原值，XOR 也得原值' : pow2 ? '只有一个 1：它是 2 的幂（2^' + high + '），常用做位标志与快速取模' : '含 ' + ones + ' 个 1 / ' + (w - ones) + ' 个 0',
  }
}

/** 常用位模式速查 */
export const CHEATSHEET = [
  { name: '1 比特 bit', hex: '0x0 / 0x1', bin: '0 / 1', note: '只能表示 2 种状态，是位标志的最小单位' },
  { name: '1 半字节 nibble', hex: '0x0 ~ 0xF', bin: '0000 ~ 1111', note: '4 位 = 16 种，正好对应一个十六进制字符' },
  { name: '1 字节 byte', hex: '0x00 ~ 0xFF', bin: '00000000 ~ 11111111', note: '8 位 = 256 种；有符号是 -128 ~ 127' },
  { name: '0x55', hex: '0x55', bin: '0101 0101', note: '奇数位为 1：取奇数位、隔位掩码' },
  { name: '0xAA', hex: '0xAA', bin: '1010 1010', note: '偶数位为 1：与 0x55 互补，常用于奇偶校验' },
  { name: '0xFF', hex: '0xFF', bin: '1111 1111', note: '8 位全 1：与它是保留低 8 位，非它是按位取反' },
  { name: '0x0F', hex: '0x0F', bin: '0000 1111', note: '低 4 位掩码：x & 0x0F 取半个字节' },
  { name: '0xF0', hex: '0xF0', bin: '1111 0000', note: '高 4 位掩码：x & ~0x0F 清掉低半字节' },
  { name: '2 的幂', hex: '0x01 02 04 08 10 20 40 80', bin: '每行只有一个 1', note: '位标志位：置位 |= 、清位 &= ~ 、翻转 ^= ' },
  { name: '-1 的形状', hex: '0xFF / 0xFFFF / 0xFFFFFFFF', bin: '全 1', note: '补码下 -1 就是全 1，所以 ~x === -x - 1' },
  { name: '最小负数', hex: '0x80（8 位）', bin: '1000 0000', note: '有符号下它是 -128，无符号下是 128，只看你怎么解读' },
  { name: '符号位', hex: '0x80（8 位）/ 0x80000000（32 位）', bin: '1000 ……', note: '有数：最高位 = 1 即负数；无符号：最高位只是普通数值位' },
]

/** 已知正确值，视图中可当场比对（也用于自查脚本）；环境没有 BigInt 时自动跳过 64 位项 */
export function selfCheck() {
  const rows = [
    { name: '8 位 0xF0 | 0x0F', got: orStr('0xF0', '0x0F', 8), want: '0xFF' },
    { name: '8 位 ~0x00', got: notStr('0x00', 8), want: '0xFF' },
    { name: '32 位 -1 >>> 1', got: shrlStr('-1', '1', 32), want: '0x7FFFFFFF' },
    { name: '32 位 0x12345678 循环左移 8', got: rolStr('0x12345678', '8', 32), want: '0x34567812' },
    { name: '8 位 -5 的补码', got: twosComplement('-5', 8).hex, want: '0xFB' },
    { name: '0xFF 的 popcount', got: String(popcount('0xFF', 8)), want: '8' },
    { name: '32 位 0x80000000 算术右移 1', got: shrStr('0x80000000', '1', 32), want: '0xC0000000' },
    { name: '低 12 位掩码', got: maskOf('12', 16).hex, want: '0x0FFF' },
    { name: '0xABCD 抽第 11~8 位', got: extract('0xABCD', 11, 8, 16).unsigned, want: '11' },
    { name: '0xABCD 抽第 15~12 位', got: extract('0xABCD', 15, 12, 16).hex, want: '0xA' },
    { name: '位网格往返 0x5AA5', got: gridRound('0x5AA5', 16), want: '0x5AA5' },
    { name: '8 位 0b1100 >> 2', got: shrlStr('0b1100', '2', 8), want: '0x03' },
  ]
  if (HAS_BIGINT) {
    rows.push({ name: '64 位 1 << 63', got: shlStr('1', '63', 64), want: '0x8000000000000000' })
    rows.push({ name: '64 位 -1 的无符号读数', got: parseValue('-1', 64).unsigned, want: '18446744073709551615' })
  }
  return rows.map(function (r) {
    return { name: r.name, want: r.want, got: String(r.got), pass: String(r.got).toUpperCase() === String(r.want).toUpperCase() }
  })
}
function opHex(a, b, w, fn) {
  return formatValue(fn(bitsOf(a, w), bitsOf(b, w)), w).hex
}
function orStr(a, b, w) {
  return opHex(a, b, w, function (x, y) {
    return zip(x, y, bor)
  })
}
function notStr(a, w) { return formatValue(mapBit(bitsOf(a, w), bnot), w).hex }
function shrlStr(a, n, w) { return formatValue(shrArr(bitsOf(a, w), Number(n), 0), w).hex }
function shrStr(a, n, w) { const A = bitsOf(a, w); return formatValue(shrArr(A, Number(n), A[0]), w).hex }
function shlStr(a, n, w) { return formatValue(shlArr(bitsOf(a, w), Number(n)), w).hex }
function rolStr(a, n, w) { return formatValue(rolArr(bitsOf(a, w), Number(n)), w).hex }
function gridRound(value, w) {
  let bits = bitsOf(value, w)
  for (let i = 0; i < bits.length; i++) bits = flipBit(bits, i) // 全翻一遍
  for (let i = 0; i < bits.length; i++) bits = flipBit(bits, i) // 再翻回来
  return formatValue(bits, w).hex
}
