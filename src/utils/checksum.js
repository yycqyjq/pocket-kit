/**
 * 循环冗余校验与和校验：CRC-8 / CRC-16 / CRC-32 / Adler-32 / FNV-1a
 * ------------------------------------------------------------
 * 全部按规范自己实现，不引第三方库：
 *   · CRC 用「逐位串行」写法（不查表），代码短且每一步都能对着 ISO/IEC 13239 的参数表核；
 *   · 反射（refin / refout）用显式的位翻转函数处理，避免「查表法里藏了反射」导致看不懂；
 *   · FNV-1a-64 优先走 BigInt，没有 BigInt 时用「hi / lo 两个 32 位半字 + 浮点安全整数」
 *     手写 64 位乘法（乘数拆成 2^40 + 435，中间量最大不超过 3×2^32，双精度可精确表示）。
 * 纯函数：不碰 uni、不碰 DOM。
 */
import { utf8Bytes } from './base64'

const MASK32 = 0xffffffff

/** 把 32 位数当无符号用（JS 的位运算是带符号 int32） */
const u32 = (x) => x >>> 0

/* ---------------- 参数表 ---------------- */

/**
 * CRC 目录参数（ISO/IEC 13239 风格）：
 * width 位宽 · poly 生成多项式（MSB 对齐，省略最高位）· init 初值
 * refin 输入字节是否低位优先 · refout 输出是否反射 · xorout 末异或 · check 全 1 测试值
 * @type {Array<{key:string,name:string,width:number,poly:number,init:number,refin:boolean,refout:boolean,xorout:number,check:number,use:string,note:string}>}
 */
export const CRC_ALGOS = [
  {
    key: 'crc8',
    name: 'CRC-8',
    width: 8,
    poly: 0x07,
    init: 0x00,
    refin: false,
    refout: false,
    xorout: 0x00,
    check: 0xf4,
    residue: 0x00,
    use: '1-Wire / DVB-S2 / 各种传感器报文',
    note: '单字节校验和，常见于温度探头、EEPROM 头部这类几个字节的小报文',
  },
  {
    key: 'crc16-ccitt',
    name: 'CRC-16/CCITT-FALSE',
    width: 16,
    poly: 0x1021,
    init: 0xffff,
    refin: false,
    refout: false,
    xorout: 0x0000,
    check: 0x29b1,
    residue: 0x1d0f,
    use: 'XModem 类协议、AIS、一些工业总线',
    note: '名字里带 CCITT 的变种特别多，这条是「初值 FFFF、不反射」的 CCITT-FALSE',
  },
  {
    key: 'crc16-xmodem',
    name: 'CRC-16/XMODEM',
    width: 16,
    poly: 0x1021,
    init: 0x0000,
    refin: false,
    refout: false,
    xorout: 0x0000,
    check: 0x31c3,
    residue: 0x0000,
    use: 'XModem 文件传输',
    note: '和上面同多项式，只是初值为 0，很多「CRC-CCITT 查表代码」其实是这一条',
  },
  {
    key: 'crc32',
    name: 'CRC-32（以太网）',
    width: 32,
    poly: 0x04c11db7,
    init: 0xffffffff,
    refin: true,
    refout: true,
    xorout: 0xffffffff,
    check: 0xcbf43926,
    residue: 0x376ac67a,
    use: '以太网 / PNG / gzip / ZIP 的 FCS',
    note: '就是 zlib.crc32、Ethernet 帧尾那一个；字节低位先进入，所以 refin/refout 都是 true',
  },
]

/** 全部可选算法（含非 CRC 的两类） */
export const CHECKSUM_ALGOS = CRC_ALGOS.concat([
  {
    key: 'adler32',
    name: 'Adler-32',
    width: 32,
    use: 'zlib 头部、APK 校验',
    note: '两段累加取模 65521，算得比 CRC 快，但短数据的雪崩性差',
  },
  {
    key: 'fnv1a32',
    name: 'FNV-1a 32',
    width: 32,
    use: '哈希表键、非密码学散列',
    note: '严格说是散列不是 CRC；因为快、分布均匀常被拿来当校验用',
  },
  {
    key: 'fnv1a64',
    name: 'FNV-1a 64',
    width: 64,
    use: '需要更长散列的场合',
    note: '64 位乘法需要 BigInt；没有 BigInt 时走两半字的降级路径',
  },
])

/* ---------------- 位翻转 ---------------- */

/** 反转 width 位内的低位部分 */
function reflectBits(value, width) {
  let out = 0
  let v = value
  for (let i = 0; i < width; i++) {
    out = ((out << 1) | (v & 1)) >>> 0
    v >>>= 1
  }
  return u32(out)
}

/** 反转一个字节（CRC 里处理输入字节用） */
function reflect8(b) {
  return reflectBits(b, 8)
}

/* ---------------- CRC 核心 ---------------- */

/**
 * 逐位串行 CRC。
 * refin=true 时字节先做位反转，等价于教科书里的「低位优先查表法」。
 * @param {Uint8Array|number[]} bytes 待校验字节
 * @param {object} p CRC 参数（见 CRC_ALGOS）
 * @returns {number} 无符号结果
 */
export function crcRun(bytes, p) {
  const width = Number(p.width)
  const mask = width >= 32 ? MASK32 : u32((1 << width) - 1)
  const topBit = width >= 32 ? 0x80000000 : u32(1 << (width - 1))
  const data = toBytes(bytes)
  let crc = u32(p.init) & mask
  for (let i = 0; i < data.length; i++) {
    let b = data[i] & 0xff
    if (p.refin) b = reflect8(b)
    // MSB 对齐：把字节塞进寄存器的高位段（width=32 时不能用 << ，会溢出成 int32）
    const into = width >= 32 ? (b * 0x1000000) >>> 0 : ((b << (width - 8)) & mask)
    crc = u32(crc ^ into) & mask
    for (let k = 0; k < 8; k++) {
      if (crc & topBit) crc = u32(((crc ^ topBit) << 1) ^ p.poly) & mask
      else crc = u32(crc << 1) & mask
    }
  }
  if (p.refout) crc = reflectBits(crc, width) & mask
  return u32(crc ^ p.xorout) & mask
}

/** 按算法 key 计算 CRC，返回无符号整数 */
export function crc(key, bytes) {
  const p = findAlgo(key)
  if (!p || p.width === undefined || p.poly === undefined) {
    throw new Error('未知的 CRC 算法：' + key + '（可选 ' + CRC_ALGOS.map((a) => a.key).join(' / ') + '）')
  }
  return crcRun(bytes, p)
}

function findAlgo(key) {
  const k = String(key || '').trim().toLowerCase()
  return CHECKSUM_ALGOS.find((a) => a.key === k || a.name.toLowerCase() === k) || null
}

/* ---------------- Adler-32 ---------------- */

const ADLER_MOD = 65521

/**
 * Adler-32（RFC 1950 §7.2）：s1 = 1 + 累加字节，s2 = 累加 s1，都取模 65521。
 * @returns {number} 无符号 32 位结果
 */
export function adler32(bytes) {
  const data = toBytes(bytes)
  let s1 = 1
  let s2 = 0
  for (let i = 0; i < data.length; i++) {
    s1 = (s1 + (data[i] & 0xff)) % ADLER_MOD
    s2 = (s2 + s1) % ADLER_MOD
  }
  return u32(s2 * 0x10000 + s1) // s2<<16 | s1，乘法避开 int32 溢出
}

/* ---------------- FNV-1a ---------------- */

const FNV32_OFFSET = 0x811c9dc5
const FNV64_OFFSET_HEX = 'cbf29ce484222325'
const FNV64_PRIME_HEX = '100000001b3'

/** FNV-1a 32 位：h = (h ^ byte) * 16777619 (mod 2^32) */
export function fnv1a32(bytes) {
  const data = toBytes(bytes)
  let h = FNV32_OFFSET
  for (let i = 0; i < data.length; i++) {
    h = u32(h ^ (data[i] & 0xff))
    // 16777619 = 2^24 + 403 → 用移位拆乘法，绕开 int32 溢出
    h = u32(h + (((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0))
    h = u32(h)
  }
  return u32(h)
}

const HAS_BIGINT = (() => {
  try {
    return typeof BigInt === 'function' && BigInt(1) === BigInt('1')
  } catch (e) {
    return false
  }
})()

/** 当前环境能否用 BigInt 走 64 位快路径（false 时自动降级，仍能算出正确结果） */
export const supportsBigInt = HAS_BIGINT

const M64 = HAS_BIGINT ? (1n << 64n) - 1n : null

/**
 * FNV-1a 64 位。
 * @param {Uint8Array|number[]} bytes
 * @param {boolean} [forceFallback] 强制走「无 BigInt」的降级路径（自检时用来交叉验证两条实现）
 * @returns {string} 16 位小写十六进制
 */
export function fnv1a64(bytes, forceFallback) {
  const data = toBytes(bytes)
  if (HAS_BIGINT && !forceFallback) {
    let h = BigInt('0x' + FNV64_OFFSET_HEX)
    const prime = BigInt('0x' + FNV64_PRIME_HEX)
    for (let i = 0; i < data.length; i++) {
      h = (h ^ BigInt(data[i] & 0xff)) & M64
      h = (h * prime) & M64
    }
    return h.toString(16).padStart(16, '0')
  }
  return fnv1a64Soft(data)
}

/**
 * 降级实现：把 64 位拆成 hi / lo 两个 32 位半字。
 * 乘数 1099511628211 = 2^40 + 435，于是 h×prime = (h<<40) + h×435 (mod 2^64)。
 * 中间量最大约 3×2^32 ≈ 1.3×2^34，远小于 2^53，双精度浮点可以精确表示。
 */
function fnv1a64Soft(data) {
  const BASE32N = 4294967296
  let hi = 0xcbf29ce4
  let lo = 0x84222325
  for (let i = 0; i < data.length; i++) {
    lo = u32(lo ^ (data[i] & 0xff))
    // h << 40：低 32 位全 0，高 32 位 = (lo×256) mod 2^32
    const ahi = (lo * 256) % BASE32N
    // h × 435
    const ll = lo * 435
    const blo = ll % BASE32N
    const bcarry = Math.floor(ll / BASE32N)
    const bh = (hi * 435) % BASE32N
    lo = blo
    hi = (ahi + bh + bcarry) % BASE32N
  }
  return hex32(hi) + hex32(lo)
}

function hex32(n) {
  return (n >>> 0).toString(16).padStart(8, '0')
}

/* ---------------- 统一入口 ---------------- */

/** 十六进制串 → 字节；允许空格 / 冒号 / 短横分隔 */
export function hexToBytes(str) {
  const s = String(str == null ? '' : str).replace(/[\s:,-]/g, '')
  if (!s) return new Uint8Array(0)
  if (!/^[0-9a-fA-F]+$/.test(s)) {
    const bad = s.replace(/[0-9a-fA-F]/g, '')
    throw new Error('十六进制里有非法字符「' + bad[0] + '」，只允许 0-9 和 A-F')
  }
  if (s.length % 2) throw new Error('十六进制字符数是奇数（' + s.length + ' 个），凑不成整字节')
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16)
  return out
}

/** 「10 20 255」这种十进制字节列表 → 字节 */
export function decToBytes(str) {
  const parts = String(str == null ? '' : str).trim().split(/[\s,，]+/).filter(Boolean)
  const out = new Uint8Array(parts.length)
  for (let i = 0; i < parts.length; i++) {
    if (!/^\d{1,3}$/.test(parts[i]) || Number(parts[i]) > 255) {
      throw new Error('第 ' + (i + 1) + ' 个「' + parts[i] + '」不是 0~255 的字节值')
    }
    out[i] = Number(parts[i])
  }
  return out
}

/**
 * 输入模式 → 字节数组
 * @param {string} text 原始输入
 * @param {string} mode utf8 | hex | dec
 */
export function readInput(text, mode) {
  const m = String(mode || 'utf8').toLowerCase()
  if (m === 'hex') return hexToBytes(text)
  if (m === 'dec' || m === 'bytes') return decToBytes(text)
  return Uint8Array.from(utf8Bytes(String(text == null ? '' : text)))
}

/** 无符号整数 → 补零十六进制，按位宽定长 */
function toFixedHex(value, width) {
  const bits = Math.ceil(width / 4)
  return (value >>> 0).toString(16).padStart(bits, '0')
}

function toBytes(x) {
  if (x instanceof Uint8Array) return x
  if (Array.isArray(x)) return Uint8Array.from(x)
  if (typeof x === 'string') return Uint8Array.from(utf8Bytes(x))
  return new Uint8Array(0)
}

/**
 * 算一个算法。
 * @param {string} key 算法 key
 * @param {Uint8Array|string|number[]} input 字节数组，或直接给字符串（按 UTF-8）
 * @returns {{key:string,name:string,hex:string,dec:number|null,width:number}}
 */
export function checksum(key, input) {
  const a = findAlgo(key)
  if (!a) throw new Error('未知的算法：' + key)
  const bytes = toBytes(input)
  if (a.key === 'adler32') {
    const v = adler32(bytes)
    return { key: a.key, name: a.name, hex: toFixedHex(v, 32), dec: v, width: 32 }
  }
  if (a.key === 'fnv1a32') {
    const v = fnv1a32(bytes)
    return { key: a.key, name: a.name, hex: toFixedHex(v, 32), dec: v, width: 32 }
  }
  if (a.key === 'fnv1a64') {
    const hex = fnv1a64(bytes)
    // 64 位结果超出安全整数范围，十进制只能给字符串
    return { key: a.key, name: a.name, hex: hex, decStr: bigintHexToDec(hex), width: 64 }
  }
  const v = crc(a.key, bytes)
  return { key: a.key, name: a.name, hex: toFixedHex(v, a.width), dec: v, width: a.width }
}

/** 十六进制（无 0x）转十进制字符串，不依赖 BigInt */
export function bigintHexToDec(hex) {
  const s = String(hex).replace(/^0x/i, '')
  if (HAS_BIGINT) return BigInt('0x' + (s || '0')).toString(10)
  let out = '0'
  const digits = s.split('').reverse()
  for (const ch of digits) {
    const v = parseInt(ch, 16)
    out = decAdd(decMul(out, 16), String(v))
  }
  return out
}

/* —— 十进制字符串加减乘（仅在无 BigInt 时给 bigintHexToDec 兜底） —— */
function decAdd(a, b) {
  const x = String(a).split('').reverse()
  const y = String(b).split('').reverse()
  let carry = 0
  let out = ''
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const s = (Number(x[i]) || 0) + (Number(y[i]) || 0) + carry
    out = (s % 10) + out
    carry = s >= 10 ? 1 : 0
  }
  if (carry) out = '1' + out
  return out
}
function decMul(a, m) {
  const x = String(a).split('').reverse()
  let carry = 0
  let out = ''
  for (let i = 0; i < x.length; i++) {
    const p = Number(x[i]) * m + carry
    out = (p % 10) + out
    carry = Math.floor(p / 10)
  }
  while (carry > 0) {
    out = (carry % 10) + out
    carry = Math.floor(carry / 10)
  }
  return out
}

/**
 * 一次算出全部算法，供列表展示。
 * @param {string} text 输入内容
 * @param {string} mode utf8 | hex | dec
 */
export function checksumAll(text, mode) {
  const bytes = readInput(text, mode)
  return CHECKSUM_ALGOS.map((a) => {
    try {
      return Object.assign({ ok: true }, checksum(a.key, bytes))
    } catch (e) {
      return { key: a.key, name: a.name, ok: false, error: e.message }
    }
  })
}

/** 把结果按 N 字节分组显示，例如 CB F4 39 26 */
export function groupHex(hex, sep) {
  const s = String(hex || '')
  const parts = []
  for (let i = 0; i < s.length; i += 2) parts.push(s.substr(i, 2).toUpperCase())
  return parts.join(sep === undefined ? ' ' : sep)
}

/** 十六进制串的字节数 */
export function hexByteLen(hex) {
  return String(hex || '').length / 2
}

/* ---------------- 已知值自检 ---------------- */

/** 业界通用测试串：几乎所有 CRC 目录都用它当 check 值 */
export const CHECK_TEXT = '123456789'

const EXPECTED = [
  { key: 'crc8', text: CHECK_TEXT, hex: 'f4' },
  { key: 'crc16-ccitt', text: CHECK_TEXT, hex: '29b1' },
  { key: 'crc16-xmodem', text: CHECK_TEXT, hex: '31c3' },
  { key: 'crc32', text: CHECK_TEXT, hex: 'cbf43926' },
  { key: 'crc32', text: '', hex: '00000000' },
  { key: 'adler32', text: '', hex: '00000001' },
  { key: 'adler32', text: 'abc', hex: '024d0127' },
  { key: 'adler32', text: 'Wikipedia', hex: '11e60398' },
  { key: 'fnv1a32', text: '', hex: '811c9dc5' },
  { key: 'fnv1a32', text: 'a', hex: 'e40c292c' },
  { key: 'fnv1a64', text: '', hex: 'cbf29ce484222325' },
  { key: 'fnv1a64', text: 'a', hex: 'af63dc4c8601ec8c' },
]

/**
 * 用公开已知值自检（页面底部可以放一个「自检」按钮）。
 * @param {(line:string)=>void} [log]
 */
export function selfTest(log) {
  const out = []
  for (const e of EXPECTED) {
    let actual = ''
    try {
      actual = checksum(e.key, Uint8Array.from(utf8Bytes(e.text))).hex
    } catch (err) {
      actual = 'error:' + err.message
    }
    const ok = actual === e.hex
    out.push({ name: e.key + '("' + e.text + '")', expected: e.hex, actual: actual, ok: ok })
    if (log) log((ok ? '✓ ' : '✗ ') + e.key + '("' + e.text + '") = ' + actual + (ok ? '' : ' 应为 ' + e.hex))
  }
  // FNV-1a 64 的降级路径单独再验一遍：两条实现必须一致
  const probe = Uint8Array.from(utf8Bytes(CHECK_TEXT))
  const fast = fnv1a64(probe)
  const slow = fnv1a64(probe, true)
  const softOk = fast === slow
  out.push({ name: 'fnv1a64 降级实现与 BigInt 实现一致', expected: fast, actual: slow, ok: softOk })
  if (log) log((softOk ? '✓ ' : '✗ ') + 'fnv1a64 soft/bigint = ' + slow + ' / ' + fast)
  return { total: out.length, passed: out.filter((r) => r.ok).length, rows: out, ok: out.every((r) => r.ok) }
}

/* ---------------- 说明文案 ---------------- */

export const CHECKSUM_NOTES = [
  {
    t: '校验和与哈希不是一回事',
    d: 'CRC、Adler-32 的目标是「抓线路噪声和意外损坏」：改一个 bit 结果一定变，但没有抗碰撞设计，' +
      '两个人可以轻易构造出结果相同、内容不同的数据。要防篡改得用 MD5/SHA 这类摘要，最好直接上 HMAC 或签名。',
  },
  {
    t: 'CRC 为什么会漏',
    d: 'CRC 本质是多项式除法取余，任何长度 ≥ 位宽的随机错误大约只有 2^-width 的概率被漏掉；' +
      '但对成对交换字节这种错误，CRC-32 的漏检率远高于随机水平，别把它当数据完整性保险用。',
  },
  {
    t: '同名 CRC 参数不同',
    d: '「CRC-16-CCITT」至少有 CCITT-FALSE / XMODEM / KERMIT / AUG-CCITT 四个变种，' +
      '多项式相同但初值和是否反射不同，结果完全不同。对接硬件前先确认对方用的是哪一条。',
  },
  {
    t: 'FNV 是散列',
    d: 'FNV-1a 不在 ISO/IEC 13239 里，它是一类非加密散列。做哈希表键、做缓存指纹很好用，' +
      '但协议报文里要按对方规范来，别看到 32 位就以为是 CRC-32。',
  },
  {
    t: '字节序与编码',
    d: '同一段文字，UTF-8 和 GBK 的字节不同，结果自然不同。工具默认按 UTF-8 编码中文；' +
      '要复现设备上的值，直接切到「十六进制字节」输入模式贴原始字节。',
  },
]

/** 一键载入的样例 */
export const CHECKSUM_SAMPLES = [
  { name: '标准测试串', text: '123456789', mode: 'utf8' },
  { name: '中文 UTF-8', text: '随身匣工具箱', mode: 'utf8' },
  { name: 'PNG 文件头', text: '89 50 4e 47 0d 0a 1a 0a', mode: 'hex' },
  { name: 'ZIP 里的 CRC', text: '48656c6c6f20576f726c64', mode: 'hex' },
  { name: '十进制字节', text: '72 101 107 101 110', mode: 'dec' },
  { name: '带 emoji', text: 'ok 👍', mode: 'utf8' },
]
