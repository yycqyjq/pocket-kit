/**
 * 各类「字母表编码」：Base32 / base32hex / Base58 / Base62 / Base64url
 * ------------------------------------------------------------
 * 全部按规范自己实现，不引第三方包，也不复用 totp.js 里的那份 Base32。
 * 分成两条路：
 *   · 定长比特分组类（Base32 系、Base64url）：5 位 / 6 位一组，末尾用 = 补足；
 *   · 大整数类（Base58、Base62）：把整串字节当成一个大整数反复除基，
 *     前导 0x00 字节用字母表首字符逐字节表示（Bitcoin 的规矩）。
 * 有 BigInt 时走 BigInt，没有（或传 noBigInt 对照）时走「字节数组长除法」降级，结果一致。
 * 纯函数：不碰 uni、不碰 DOM。
 */
import { utf8Bytes, bytesUtf8 } from './base64'

export const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const B32HEX_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUV'
export const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
export const B62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
export const B64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** @type {Array<{key:string,name:string,alphabet:string,bits:number,pad:boolean,note:string,use:string}>} */
export const ALPHABETS = [
  {
    key: 'base32',
    name: 'Base32',
    alphabet: B32_ALPHABET,
    bits: 5,
    pad: true,
    use: 'RFC 4648 §6；TOTP/HOTP 的密钥、DNSSEC、需要人工抄写的文件名',
    note: '5 位一组，只含大写字母和 2-7，大小写不敏感、没有 + / ，适合塞进 URL 或手抄',
  },
  {
    key: 'base32hex',
    name: 'Base32hex',
    alphabet: B32HEX_ALPHABET,
    bits: 5,
    pad: true,
    use: 'RFC 4648 §7；OpenPGP 指纹、需要「编码后可排序」的场合',
    note: '分组方式和 Base32 完全一样，只换字母表成 0-9A-V。好处是编码结果的字典序等于原字节的序',
  },
  {
    key: 'base58',
    name: 'Base58（Bitcoin）',
    alphabet: B58_ALPHABET,
    bits: 0,
    pad: false,
    use: '比特币地址、钱包私钥导出、IPFS 哈希',
    note: '去掉了 0O1Il 这些容易看错的字符，没有统一填充规则：前导零字节用首字符 1 逐字节表示',
  },
  {
    key: 'base62',
    name: 'Base62',
    alphabet: B62_ALPHABET,
    bits: 0,
    pad: false,
    use: '短链码、兑换码、把序号压短',
    note: '0-9A-Za-z 全用上，同样按大整数处理；它区分大小写，人工抄写比 Base32 容易错',
  },
  {
    key: 'base64url',
    name: 'Base64url',
    alphabet: B64URL_ALPHABET,
    bits: 6,
    pad: false,
    use: 'RFC 4648 §5；JWT 的三段、URL 里传二进制',
    note: '把 + / 换成 - _ ，通常省略末尾 =。解的时候标准写法（带 + / ）也认',
  },
]

const HAS_BIGINT = (() => {
  try {
    return typeof BigInt === 'function' && typeof 0n === 'bigint'
  } catch (e) {
    return false
  }
})()

/** 当前环境是否有 BigInt（没有则大整数类编码自动走长除法降级路径） */
export const supportsBigInt = HAS_BIGINT

function findAlphabet(key) {
  const k = String(key || '').trim().toLowerCase().replace(/[\s_-]/g, '')
  const a = ALPHABETS.find((x) => {
    const short = x.key.replace(/^base/, '')
    return k === x.key || k === short || k === 'base' + short || k === 'b' + short
  })
  if (!a) throw new Error('未知的编码：' + key + '（可选 ' + ALPHABETS.map((x) => x.key).join(' / ') + '）')
  return a
}

/* ---------------- 字节 / 十六进制 ---------------- */

export function bytesToHex(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += (bytes[i] & 0xff).toString(16).padStart(2, '0')
  return s
}

/** 十六进制串 → 字节，允许空格 / 冒号 / 短横分隔 */
export function hexToBytes(str) {
  const s = String(str == null ? '' : str).replace(/[\s:,_-]/g, '')
  if (!s) return new Uint8Array(0)
  if (!/^[0-9a-fA-F]+$/.test(s)) {
    const bad = s.replace(/[0-9a-fA-F]/g, '')[0]
    throw new Error('十六进制里有非法字符「' + bad + '」，只允许 0-9 和 A-F')
  }
  if (s.length % 2) throw new Error('十六进制要两个字符一个字节，现在有 ' + s.length + ' 个字符（奇数）')
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16)
  return out
}

function toBytes(x) {
  if (x instanceof Uint8Array) return x
  if (Array.isArray(x)) return Uint8Array.from(x)
  return Uint8Array.from(utf8Bytes(String(x == null ? '' : x)))
}

/* ---------------- 定长比特分组（Base32 系 / Base64url） ---------------- */

function groupEncode(bytes, alphabet, bits, pad) {
  const cycle = bits === 5 ? 8 : 4
  const mask = (1 << bits) - 1
  let out = ''
  let buf = 0
  let held = 0
  for (let i = 0; i < bytes.length; i++) {
    buf = (buf << 8) | (bytes[i] & 0xff)
    held += 8
    while (held >= bits) {
      out += alphabet[(buf >>> (held - bits)) & mask]
      held -= bits
      buf &= (1 << held) - 1
    }
  }
  if (held > 0) out += alphabet[(buf << (bits - held)) & mask]
  if (pad) while (out.length % cycle !== 0) out += '='
  return out
}

/**
 * 比特分组解码：非法字符不抛错，而是带位置写进 issues
 * @param {string} str 输入（空白会被忽略）
 * @param {string} alphabet 字母表
 * @param {number} bits 5 或 6
 * @param {object} [opts] { caseInsensitive:boolean }
 * @returns {{bytes:Uint8Array, issues:string[], chars:number}}
 */
function groupDecode(str, alphabet, bits, opts) {
  const o = opts || {}
  const issues = []
  const clean = String(str == null ? '' : str).replace(/\s+/g, '')
  const cycle = bits === 5 ? 8 : 4
  const lut = {}
  for (let i = 0; i < alphabet.length; i++) lut[alphabet[i]] = i
  const data = []
  let padSeen = false
  let badCount = 0
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (ch === '=') {
      if (!padSeen) padSeen = true
      if (data.length % cycle === 0) issues.push('第 ' + (i + 1) + ' 个字符是「=」，但前面刚好凑满一组（' + data.length + ' 个字符），这里不需要填充')
      continue
    }
    if (padSeen) {
      issues.push('第 ' + (i + 1) + ' 个字符「' + ch + '」出现在填充符「=」后面，填充只能放在最末尾；该字符已忽略')
      continue
    }
    let v = lut[ch]
    if (v === undefined && o.caseInsensitive) v = lut[ch.toUpperCase()]
    if (v === undefined) {
      badCount++
      if (badCount <= 3) {
        issues.push(
          '第 ' + (i + 1) + ' 个字符「' + ch + '」不在 ' + bits + ' 位字母表里' +
            (o.caseInsensitive && /[0189]/.test(ch) ? '（Base32 只用 2-7 这六个数字）' : '')
        )
      }
      continue
    }
    data.push(v)
  }
  if (badCount > 3) issues.push('……另有 ' + (badCount - 3) + ' 个非法字符未逐条列出')
  const mod = data.length % cycle
  const legal = bits === 5 ? [0, 2, 4, 5, 7] : [0, 2, 3]
  if (mod !== 0 && legal.indexOf(mod) < 0) {
    issues.push('有效字符 ' + data.length + ' 个（' + cycle + ' 个一组余 ' + mod + '）不可能由完整字节编出来，多半是中间被删过或裁错了')
  }
  const bytes = []
  let buf = 0
  let held = 0
  for (let i = 0; i < data.length; i++) {
    buf = (buf << bits) | data[i]
    held += bits
    if (held >= 8) {
      bytes.push((buf >>> (held - 8)) & 0xff)
      held -= 8
      buf &= (1 << held) - 1
    }
  }
  if (held > 0 && buf !== 0) {
    issues.push('最后一个字符的补位不是 0（残留 ' + buf.toString(2).padStart(held, '0') + '），属于非规范写法，已按高位截断')
  }
  if (!data.length && clean.length) issues.push('一个有效字符都没有')
  return { bytes: Uint8Array.from(bytes), issues, chars: data.length }
}

/* ---------------- 大整数类（Base58 / Base62） ---------------- */

function bigEncode(bytes, alphabet, noBigInt) {
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++
  const head = alphabet[0].repeat(zeros)
  const base = alphabet.length
  if (HAS_BIGINT && !noBigInt) {
    let n = 0n
    for (let i = zeros; i < bytes.length; i++) n = n * 256n + BigInt(bytes[i] & 0xff)
    let out = ''
    while (n > 0n) {
      out = alphabet[Number(n % BigInt(base))] + out
      n = n / BigInt(base)
    }
    return head + out
  }
  // 降级：对字节数组做「除基取余」的长除法（每步中间量 < 256*base，双精度足够）
  let work = []
  for (let i = zeros; i < bytes.length; i++) work.push(bytes[i] & 0xff)
  const digits = []
  while (work.length) {
    let rem = 0
    const next = []
    for (const b of work) {
      const cur = rem * 256 + b
      const d = Math.floor(cur / base)
      rem = cur % base
      if (d || next.length) next.push(d)
    }
    digits.unshift(alphabet[rem])
    work = next
  }
  return head + digits.join('')
}

function bigDecode(str, alphabet, opts) {
  const o = opts || {}
  const issues = []
  const clean = String(str == null ? '' : str).replace(/\s+/g, '')
  const base = alphabet.length
  const lut = {}
  for (let i = 0; i < base; i++) lut[alphabet[i]] = i
  let zeros = 0
  while (zeros < clean.length && clean[zeros] === alphabet[0]) zeros++
  const body = clean.slice(zeros)
  const value = []
  let badCount = 0
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    let v = lut[ch]
    if (v === undefined && o.caseInsensitive) v = lut[ch.toUpperCase()]
    if (v === undefined) {
      badCount++
      if (badCount <= 3) issues.push('第 ' + (zeros + i + 1) + ' 个字符「' + ch + '」不在 ' + base + ' 进制字母表里' + nearMiss(ch, alphabet))
      continue
    }
    value.push(v)
  }
  if (badCount > 3) issues.push('……另有 ' + (badCount - 3) + ' 个非法字符未逐条列出')
  let bytes = []
  if (HAS_BIGINT && !o.noBigInt) {
    let n = 0n
    const B = BigInt(base)
    for (const d of value) n = n * B + BigInt(d)
    while (n > 0n) {
      bytes.unshift(Number(n % 256n))
      n = n / 256n
    }
  } else {
    // 降级：对「以 base 表示的数字串」做除 256 取余
    let work = value.slice()
    while (work.length) {
      let rem = 0
      const next = []
      for (const d of work) {
        const cur = rem * base + d
        const q = Math.floor(cur / 256)
        rem = cur % 256
        if (q || next.length) next.push(q)
      }
      bytes.unshift(rem)
      work = next
    }
  }
  const out = []
  for (let i = 0; i < zeros; i++) out.push(0)
  for (const b of bytes) out.push(b)
  return { bytes: Uint8Array.from(out), issues, chars: clean.length }
}

/** 常见「长得像但不该出现」的字符，给一句人话提示 */
function nearMiss(ch, alphabet) {
  if (alphabet.indexOf(ch) > -1) return ''
  const map = {
    '0': '这个字母表里没有数字 0（Base58 剔掉了 0）',
    O: '没有大写字母 O（Base58 剔掉了 O）',
    I: '没有大写字母 I（Base58 剔掉了 I）',
    l: '没有小写字母 l（Base58 剔掉了 l）',
    o: '没有小写字母 o',
    i: '没有小写字母 i',
  }
  return map[ch] ? '——' + map[ch] : ''
}

/* ---------------- 对外统一入口 ---------------- */

/**
 * 编码
 * @param {string|Uint8Array|number[]} input 文本（按 UTF-8 编码）或字节
 * @param {string} key base32 | base32hex | base58 | base62 | base64url
 * @param {object} [opts] { pad:boolean 是否补 =, noBigInt:boolean 强制走降级路径 }
 */
export function encode(input, key, opts) {
  const a = findAlphabet(key)
  const bytes = toBytes(input)
  const o = opts || {}
  if (a.bits) return groupEncode(bytes, a.alphabet, a.bits, o.pad === undefined ? a.pad : o.pad)
  return bigEncode(bytes, a.alphabet, o.noBigInt)
}

/**
 * 严格 UTF-8 校验：判断解出的字节能不能原样当文本显示。
 * bytesUtf8 对非法序列是「尽力解码」，会静默拼出乱码，所以这里单独判一次：
 * 拒绝多余续字节、过长编码（0xC0/0xC1 等）、UTF-16 代理区、超出 U+10FFFF 的码位。
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
function isUtf8(bytes) {
  let i = 0
  const n = bytes.length
  while (i < n) {
    const b = bytes[i]
    let len
    if (b < 0x80) len = 1
    else if (b >= 0xc2 && b <= 0xdf) len = 2
    else if (b >= 0xe0 && b <= 0xef) len = 3
    else if (b >= 0xf0 && b <= 0xf4) len = 4
    else return false
    if (i + len > n) return false
    let cp = b & (0xff >> len)
    for (let j = 1; j < len; j++) {
      const c = bytes[i + j]
      if ((c & 0xc0) !== 0x80) return false
      cp = (cp << 6) | (c & 0x3f)
    }
    if (len > 1) {
      const min = len === 2 ? 0x80 : len === 3 ? 0x800 : 0x10000
      if (cp < min) return false
    }
    if (cp > 0x10ffff) return false
    if (cp >= 0xd800 && cp <= 0xdfff) return false
    i += len
  }
  return true
}

/** 判断「重新编码」是否与输入等价：忽略空白、大小写（Base32 系）与填充写法 */
function sameAsInput(raw, a, re) {
  const strip = (s) => String(s).replace(/\s+/g, '')
  let x = strip(raw)
  let y = strip(re)
  if (a.bits === 5) {
    x = x.toUpperCase()
    y = y.toUpperCase()
  }
  if (a.key === 'base64url') {
    x = x.replace(/\+/g, '-').replace(/\//g, '_')
  }
  if (a.bits) {
    x = x.replace(/=+$/, '')
    y = y.replace(/=+$/, '')
  }
  return x === y
}

/**
 * 解码：非法字符不抛错，而是带位置写进 issues，方便页面上标出来
 * @returns {{key,name,bytes:Uint8Array,hex:string,text:string,textOk:boolean,issues:string[],reencoded:string,matchesInput:boolean,byteLen:number}}
 */
export function decode(input, key, opts) {
  const a = findAlphabet(key)
  const o = opts || {}
  const raw = String(input == null ? '' : input)
  let r
  if (a.bits) {
    const normalized = a.key === 'base64url' ? raw.replace(/\+/g, '-').replace(/\//g, '_') : raw
    r = groupDecode(normalized, a.alphabet, a.bits, { caseInsensitive: a.bits === 5 })
  } else {
    r = bigDecode(raw, a.alphabet, { noBigInt: !!o.noBigInt })
  }
  const issues = r.issues
  let text = ''
  let textOk = false
  if (r.bytes.length) {
    if (isUtf8(r.bytes)) {
      text = bytesUtf8(Array.from(r.bytes))
      textOk = true
    } else {
      issues.push('解出的 ' + r.bytes.length + ' 个字节不是合法 UTF-8，只能用十六进制看')
    }
  }
  const reencoded = encode(r.bytes, a.key, o)
  return {
    key: a.key,
    name: a.name,
    bytes: r.bytes,
    hex: bytesToHex(r.bytes),
    text,
    textOk,
    issues,
    reencoded,
    matchesInput: sameAsInput(raw, a, reencoded),
    byteLen: r.bytes.length,
  }
}

/** 编解码往返：给页面「往返校验」用 */
export function roundTrip(text, key) {
  const enc = encode(text, key)
  const dec = decode(enc, key)
  return { encoded: enc, back: dec.text, same: dec.hex === bytesToHex(toBytes(text)), issues: dec.issues, hex: dec.hex }
}

/** 字母表速查：按 16 个一行给出「字符 = 下标」 */
export function alphabetRows(key) {
  const a = findAlphabet(key)
  const rows = []
  const step = 16
  for (let i = 0; i < a.alphabet.length; i += step) {
    rows.push({
      from: i,
      cells: a.alphabet.slice(i, i + step).split('').map((ch, j) => ({ ch, index: i + j })),
    })
  }
  return { key: a.key, name: a.name, alphabet: a.alphabet, len: a.alphabet.length, rows, note: a.note, use: a.use, bits: a.bits, pad: a.pad }
}

/** 非法字符体检：把不属于字母表的字符连位置一起列出 */
export function scanInvalid(str, key) {
  const a = findAlphabet(key)
  const s = String(str == null ? '' : str)
  const out = []
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (/\s/.test(ch)) continue
    if (ch === '=' && a.bits) continue
    if (a.key === 'base64url' && (ch === '+' || ch === '/')) continue
    if (a.bits === 5 && /[a-z]/.test(ch) && a.alphabet.indexOf(ch.toUpperCase()) > -1) continue
    if (a.alphabet.indexOf(ch) < 0) out.push({ ch, index: i + 1, line: s.slice(0, i).split('\n').length })
  }
  return { key: a.key, name: a.name, total: s.length, bad: out, ok: out.length === 0 }
}

/** 一次给出全部字母表的编码结果，供对照列表 */
export function encodeAll(input) {
  const bytes = toBytes(input)
  return ALPHABETS.map((a) => {
    try {
      return { key: a.key, name: a.name, value: encode(bytes, a.key), len: encode(bytes, a.key).length }
    } catch (e) {
      return { key: a.key, name: a.name, value: '', error: e.message }
    }
  })
}

/* ---------------- 页面文案 ---------------- */

export const BASES_NOTES = [
  {
    t: 'Base32 与 base32hex 只差字母表',
    d: '两者的比特分组完全相同（5 位一组、8 字符一循环、= 补到 8 的倍数），所以同一段数据的编码长度也一样。base32hex 的字符序与数值序一致，编码结果按字典序排就等于按原字节排。',
  },
  {
    t: 'Base58 为什么前导零要写成「1」',
    d: '大整数编码天生会把前导 0 吃掉：00 00 61 和 61 的数值相同。Base58 的做法是每个前导零字节写一个首字符 1，于是比特币地址里常能看到好几个 1。这也是它和 Base62 实现上最容易踩的坑。',
  },
  {
    t: 'Base64url 与 Base64',
    d: '把 + 和 / 换成 - 和 _，再把末尾的 = 去掉，就能安全地塞进 URL 路径、查询串和 JWT 的一段。本工具解码时两种写法都认。',
  },
  {
    t: '这些都不是加密',
    d: '编码只是可逆的形状变换，没有密钥；Base58/Base62 也只是把字节写成能敲的字符。要保密去用「AES 加解密」，要防篡改用「摘要 / HMAC」。',
  },
  {
    t: '为什么 Base32 只用 2-7',
    d: '字母表避开 0/O、1/I/L 这些易混字符，数字段只留 2-7，于是一个 5 位组恰好对应 32 个不易混淆的符号。代价是编码比 Base64 长 20%。',
  },
]

export const BASES_SAMPLES = [
  { name: '中文', text: '随身匣工具箱' },
  { name: 'Hello!', text: 'Hello!' },
  { name: 'URL 里安全吗', text: 'a?b=c&d/+_' },
  { name: '含前导零', hex: '0000616263' },
  { name: '比特币风格', hex: '002f4c243e6a8e6b5a4c3d2e1f00a1b2c3' },
  { name: '单个零字节', hex: '00' },
  { name: 'emoji', text: '🧰 工具箱' },
]
