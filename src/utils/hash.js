/**
 * 消息摘要与 HMAC
 * 纯 JS 实现，不依赖 crypto.subtle（App 端逻辑层不保证有）
 * MD5 / SHA-1 / SHA-256 用 32 位整数运算，SHA-512 用 BigInt
 */
import { utf8Bytes } from './base64'

/* ---------------- 32 位工具 ---------------- */

const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0
const rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0

function toHex(bytes) {
  let s = ''
  for (const b of bytes) s += (b & 0xff).toString(16).padStart(2, '0')
  return s
}

export function bytesToHexStr(bytes) {
  return toHex(bytes)
}

/* ---------------- MD5 ---------------- */

const MD5_K = (() => {
  const k = []
  for (let i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0
  return k
})()

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

export function md5Bytes(bytes) {
  const len = bytes.length
  const withPad = new Uint8Array((((len + 8) >> 6) + 1) * 64)
  withPad.set(bytes)
  withPad[len] = 0x80
  const bitLen = len * 8
  // 长度按小端写入最后 8 字节
  withPad[withPad.length - 8] = bitLen & 0xff
  withPad[withPad.length - 7] = (bitLen >>> 8) & 0xff
  withPad[withPad.length - 6] = (bitLen >>> 16) & 0xff
  withPad[withPad.length - 5] = (bitLen >>> 24) & 0xff

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let off = 0; off < withPad.length; off += 64) {
    const m = []
    for (let i = 0; i < 16; i++) {
      const o = off + i * 4
      m[i] = (withPad[o] | (withPad[o + 1] << 8) | (withPad[o + 2] << 16) | (withPad[o + 3] << 24)) >>> 0
    }
    let [A, B, C, D] = [a0, b0, c0, d0]
    for (let i = 0; i < 64; i++) {
      let F, g
      if (i < 16) {
        F = (B & C) | (~B & D)
        g = i
      } else if (i < 32) {
        F = (D & B) | (~D & C)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        F = B ^ C ^ D
        g = (3 * i + 5) % 16
      } else {
        F = C ^ (B | ~D)
        g = (7 * i) % 16
      }
      F = (F + A + MD5_K[i] + m[g]) >>> 0
      A = D
      D = C
      C = B
      B = (B + rotl(F, MD5_S[i])) >>> 0
    }
    a0 = (a0 + A) >>> 0
    b0 = (b0 + B) >>> 0
    c0 = (c0 + C) >>> 0
    d0 = (d0 + D) >>> 0
  }

  const out = new Uint8Array(16)
  ;[a0, b0, c0, d0].forEach((w, i) => {
    out[i * 4] = w & 0xff
    out[i * 4 + 1] = (w >>> 8) & 0xff
    out[i * 4 + 2] = (w >>> 16) & 0xff
    out[i * 4 + 3] = (w >>> 24) & 0xff
  })
  return out
}

/* ---------------- SHA-1 ---------------- */

export function sha1Bytes(bytes) {
  const len = bytes.length
  const withPad = new Uint8Array((((len + 8) >> 6) + 1) * 64)
  withPad.set(bytes)
  withPad[len] = 0x80
  const bitLenHi = Math.floor((len * 8) / 4294967296)
  const bitLenLo = (len * 8) >>> 0
  const p = withPad.length
  withPad[p - 8] = (bitLenHi >>> 24) & 0xff
  withPad[p - 7] = (bitLenHi >>> 16) & 0xff
  withPad[p - 6] = (bitLenHi >>> 8) & 0xff
  withPad[p - 5] = bitLenHi & 0xff
  withPad[p - 4] = (bitLenLo >>> 24) & 0xff
  withPad[p - 3] = (bitLenLo >>> 16) & 0xff
  withPad[p - 2] = (bitLenLo >>> 8) & 0xff
  withPad[p - 1] = bitLenLo & 0xff

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  for (let off = 0; off < withPad.length; off += 64) {
    const w = new Array(80)
    for (let i = 0; i < 16; i++) {
      const o = off + i * 4
      w[i] = ((withPad[o] << 24) | (withPad[o + 1] << 16) | (withPad[o + 2] << 8) | withPad[o + 3]) >>> 0
    }
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)

    let [a, b, c, d, e] = [h0, h1, h2, h3, h4]
    for (let i = 0; i < 80; i++) {
      let f, k
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }
      const t = (rotl(a, 5) + f + e + k + w[i]) >>> 0
      e = d
      d = c
      c = rotl(b, 30)
      b = a
      a = t
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }

  const out = new Uint8Array(20)
  ;[h0, h1, h2, h3, h4].forEach((v, i) => {
    out[i * 4] = (v >>> 24) & 0xff
    out[i * 4 + 1] = (v >>> 16) & 0xff
    out[i * 4 + 2] = (v >>> 8) & 0xff
    out[i * 4 + 3] = v & 0xff
  })
  return out
}

/* ---------------- SHA-256 ---------------- */

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

export function sha256Bytes(bytes) {
  const len = bytes.length
  const withPad = new Uint8Array((((len + 8) >> 6) + 1) * 64)
  withPad.set(bytes)
  withPad[len] = 0x80
  const bitLenHi = Math.floor((len * 8) / 4294967296)
  const bitLenLo = (len * 8) >>> 0
  const p = withPad.length
  withPad[p - 8] = (bitLenHi >>> 24) & 0xff
  withPad[p - 7] = (bitLenHi >>> 16) & 0xff
  withPad[p - 6] = (bitLenHi >>> 8) & 0xff
  withPad[p - 5] = bitLenHi & 0xff
  withPad[p - 4] = (bitLenLo >>> 24) & 0xff
  withPad[p - 3] = (bitLenLo >>> 16) & 0xff
  withPad[p - 2] = (bitLenLo >>> 8) & 0xff
  withPad[p - 1] = bitLenLo & 0xff

  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]

  for (let off = 0; off < withPad.length; off += 64) {
    const w = new Array(64)
    for (let i = 0; i < 16; i++) {
      const o = off + i * 4
      w[i] = ((withPad[o] << 24) | (withPad[o + 1] << 16) | (withPad[o + 2] << 8) | withPad[o + 3]) >>> 0
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + SHA256_K[i] + w[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h[0] = (h[0] + a) >>> 0
    h[1] = (h[1] + b) >>> 0
    h[2] = (h[2] + c) >>> 0
    h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0
    h[5] = (h[5] + f) >>> 0
    h[6] = (h[6] + g) >>> 0
    h[7] = (h[7] + hh) >>> 0
  }

  const out = new Uint8Array(32)
  h.forEach((v, i) => {
    out[i * 4] = (v >>> 24) & 0xff
    out[i * 4 + 1] = (v >>> 16) & 0xff
    out[i * 4 + 2] = (v >>> 8) & 0xff
    out[i * 4 + 3] = v & 0xff
  })
  return out
}

/* ---------------- SHA-512（BigInt） ---------------- */

const HAS_BIGINT = (() => {
  try {
    return typeof BigInt === 'function' && BigInt(1) === BigInt('1')
  } catch (e) {
    return false
  }
})()

export const supportsSHA512 = HAS_BIGINT

const M64 = (1n << 64n) - 1n

const SHA512_K = (() => {
  if (!HAS_BIGINT) return []
  // 前 80 个素数的立方根小数部分前 64 位（标准常量表）
  const K = [
    '428a2f98d728ae22', '7137449123ef65cd', 'b5c0fbcfec4d3b2f', 'e9b5dba58189dbbc',
    '3956c25bf348b538', '59f111f1b605d019', '923f82a4af194f9b', 'ab1c5ed5da6d8118',
    'd807aa98a3030242', '12835b0145706fbe', '243185be4ee4b28c', '550c7dc3d5ffb4e2',
    '72be5d74f27b896f', '80deb1fe3b1696b1', '9bdc06a725c71235', 'c19bf174cf692694',
    'e49b69c19ef14ad2', 'efbe4786384f25e3', '0fc19dc68b8cd5b5', '240ca1cc77ac9c65',
    '2de92c6f592b0275', '4a7484aa6ea6e483', '5cb0a9dcbd41fbd4', '76f988da831153b5',
    '983e5152ee66dfab', 'a831c66d2db43210', 'b00327c898fb213f', 'bf597fc7beef0ee4',
    'c6e00bf33da88fc2', 'd5a79147930aa725', '06ca6351e003826f', '142929670a0e6e70',
    '27b70a8546d22ffc', '2e1b21385c26c926', '4d2c6dfc5ac42aed', '53380d139d95b3df',
    '650a73548baf63de', '766a0abb3c77b2a8', '81c2c92e47edaee6', '92722c851482353b',
    'a2bfe8a14cf10364', 'a81a664bbc423001', 'c24b8b70d0f89791', 'c76c51a30654be30',
    'd192e819d6ef5218', 'd69906245565a910', 'f40e35855771202a', '106aa07032bbd1b8',
    '19a4c116b8d2d0c8', '1e376c085141ab53', '2748774cdf8eeb99', '34b0bcb5e19b48a8',
    '391c0cb3c5c95a63', '4ed8aa4ae3418acb', '5b9cca4f7763e373', '682e6ff3d6b2b8a3',
    '748f82ee5defb2fc', '78a5636f43172f60', '84c87814a1f0ab72', '8cc702081a6439ec',
    '90befffa23631e28', 'a4506cebde82bde9', 'bef9a3f7b2c67915', 'c67178f2e372532b',
    'ca273eceea26619c', 'd186b8c721c0c207', 'eada7dd6cde0eb1e', 'f57d4f7fee6ed178',
    '06f067aa72176fba', '0a637dc5a2c898a6', '113f9804bef90dae', '1b710b35131c471b',
    '28db77f523047d84', '32caab7b40c72493', '3c9ebe0a15c9bebc', '431d67c49c100d4c',
    '4cc5d4becb3e42b6', '597f299cfc657e2a', '5fcb6fab3ad6faec', '6c44198c4a475817',
  ]
  return K.map((x) => BigInt('0x' + x))
})()

const ror64 = (x, n) => ((x >> BigInt(n)) | (x << BigInt(64 - n))) & M64

export function sha512Bytes(bytes) {
  if (!HAS_BIGINT) return null
  const len = bytes.length
  const total = (((len + 16) >> 7) + 1) * 128
  const withPad = new Uint8Array(total)
  withPad.set(bytes)
  withPad[len] = 0x80
  // 最后 16 字节放位长度（高 64 位在 JS 里恒为 0）
  let bitLen = BigInt(len) * 8n
  for (let i = 0; i < 8; i++) {
    withPad[total - 1 - i] = Number(bitLen & 0xffn)
    bitLen >>= 8n
  }

  const H = [
    '6a09e667f3bcc908', 'bb67ae8584caa73b', '3c6ef372fe94f82b', 'a54ff53a5f1d36f1',
    '510e527fade682d1', '9b05688c2b3e6c1f', '1f83d9abfb41bd6b', '5be0cd19137e2179',
  ].map((x) => BigInt('0x' + x))

  for (let off = 0; off < total; off += 128) {
    const w = new Array(80)
    for (let i = 0; i < 16; i++) {
      let v = 0n
      for (let j = 0; j < 8; j++) v = (v << 8n) | BigInt(withPad[off + i * 8 + j])
      w[i] = v
    }
    for (let i = 16; i < 80; i++) {
      const s0 = ror64(w[i - 15], 1) ^ ror64(w[i - 15], 8) ^ (w[i - 15] >> 7n)
      const s1 = ror64(w[i - 2], 19) ^ ror64(w[i - 2], 61) ^ (w[i - 2] >> 6n)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) & M64
    }
    let [a, b, c, d, e, f, g, h] = H
    for (let i = 0; i < 80; i++) {
      const S1 = ror64(e, 14) ^ ror64(e, 18) ^ ror64(e, 41)
      const ch = (e & f) ^ (~e & M64 & g)
      const t1 = (h + S1 + ch + SHA512_K[i] + w[i]) & M64
      const S0 = ror64(a, 28) ^ ror64(a, 34) ^ ror64(a, 39)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) & M64
      h = g
      g = f
      f = e
      e = (d + t1) & M64
      d = c
      c = b
      b = a
      a = (t1 + t2) & M64
    }
    const next = [a, b, c, d, e, f, g, h]
    for (let i = 0; i < 8; i++) H[i] = (H[i] + next[i]) & M64
  }

  const out = new Uint8Array(64)
  H.forEach((v, i) => {
    for (let j = 0; j < 8; j++) {
      out[i * 8 + j] = Number((v >> BigInt(56 - j * 8)) & 0xffn)
    }
  })
  return out
}

/* ---------------- 对外接口 ---------------- */

export const ALGOS = [
  { key: 'md5', name: 'MD5', bits: 128, weak: true, note: '已被证明可构造碰撞，只适合做校验和，不要用于密码' },
  { key: 'sha1', name: 'SHA-1', bits: 160, weak: true, note: '已被 Google 实证碰撞（SHAttered），不要用于签名' },
  { key: 'sha256', name: 'SHA-256', bits: 256, weak: false, note: '目前最常用的安全摘要' },
  { key: 'sha512', name: 'SHA-512', bits: 512, weak: false, note: '更长摘要，64 位平台更快' },
]

const IMPL = {
  md5: md5Bytes,
  sha1: sha1Bytes,
  sha256: sha256Bytes,
  sha512: sha512Bytes,
}

const BLOCK = { md5: 64, sha1: 64, sha256: 64, sha512: 128 }
const OUTLEN = { md5: 16, sha1: 20, sha256: 32, sha512: 64 }

/** 对字符串求摘要，返回十六进制 */
export function hash(algo, text) {
  const fn = IMPL[algo]
  if (!fn) throw new Error('不支持的算法：' + algo)
  const out = fn(utf8Bytes(text))
  if (!out) throw new Error(algo + ' 需要 BigInt 支持，当前环境不可用')
  return toHex(out)
}

/** 一次算出全部支持的摘要 */
export function hashAll(text) {
  const out = {}
  for (const a of ALGOS) {
    try {
      out[a.key] = hash(a.key, text)
    } catch (e) {
      out[a.key] = null
    }
  }
  return out
}

/**
 * HMAC（字节接口）
 * 注意 key 与 message 都是字节数组——TOTP 这类场景要哈希二进制计数器，
 * 走字符串会被 UTF-8 编码改变内容（≥0x80 的字节会变两个字节）。
 */
export function hmacBytes(algo, keyBytes, msgBytes) {
  const fn = IMPL[algo]
  if (!fn) throw new Error('不支持的算法：' + algo)
  const block = BLOCK[algo]
  let k = Array.from(keyBytes || [])
  if (k.length > block) {
    const h = fn(Uint8Array.from(k))
    if (!h) throw new Error('当前环境不支持 ' + algo)
    k = Array.from(h)
  }
  const pad = new Uint8Array(block)
  pad.set(k)
  const inner = new Uint8Array(block)
  const outer = new Uint8Array(block)
  for (let i = 0; i < block; i++) {
    inner[i] = pad[i] ^ 0x36
    outer[i] = pad[i] ^ 0x5c
  }
  const msg = msgBytes instanceof Uint8Array ? msgBytes : Uint8Array.from(msgBytes || [])
  const first = new Uint8Array(block + msg.length)
  first.set(inner)
  first.set(msg, block)
  const mid = fn(first)
  if (!mid) throw new Error('当前环境不支持 ' + algo)
  const second = new Uint8Array(block + mid.length)
  second.set(outer)
  second.set(mid, block)
  return fn(second)
}

/**
 * HMAC（字符串接口）
 * @param {string} algo md5 | sha1 | sha256 | sha512
 */
export function hmac(algo, key, message) {
  return toHex(hmacBytes(algo, utf8Bytes(key), utf8Bytes(message)))
}

/** 摘要长度（字节），用于展示 */
export function outLength(algo) {
  return OUTLEN[algo] || 0
}
