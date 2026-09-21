/**
 * AES（Rijndael）对称加解密
 * ------------------------------------------------------------
 * 按 FIPS-197 手写分组运算，模式取 ECB 与 CBC（各带 PKCS#7 填充）。
 * 全程纯 JS：不碰 crypto.subtle（App 端逻辑层不保证有），也不引第三方包。
 *
 * 【已知测试向量（FIPS-197 Appendix C / NIST SP 800-38A）】
 *   AES-128  key 000102030405060708090a0b0c0d0e0f
 *            in  00112233445566778899aabbccddeeff  →  69c4e0d86a7b0430d8cdb78070b4c55a
 *   AES-192  key 000102…1617
 *            in  00112233445566778899aabbccddeeff  →  dda97ca4864cdfe06eaf70a0ec0d7191
 *   AES-256  key 000102…1e1f
 *            in  00112233445566778899aabbccddeeff  →  8ea2b7ca516745bfeafc49904b496089
 *   SP 800-38A 的 ECB / CBC 前四块向量整体写在下面 VECTORS 里。
 *   九条向量 × 正反两个方向，selfTest() 逐条真跑比对；
 *   这些期望值另与 OpenSSL 3.6（enc -nopad）与 node:crypto 双向核对过，不是照抄记忆。
 *
 * 【安全边界，务必读】
 * 1. 口令派生用的是本文件自写的迭代哈希 KDF（见 deriveKey），**不是 PBKDF2 / scrypt /
 *    bcrypt / Argon2，也不是 OpenSSL 的 EVP_BytesToKey**——这种密文不能和标准工具互解。
 *    它只解决「把人类口令拉伸成定长密钥」，抗暴力破解能力远低于正规 KDF。
 * 2. ECB 不做图案隐藏：相同明文块得到相同密文块。
 * 3. CBC 只提供机密性，**不提供完整性**（无 MAC，理论上可被 padding oracle 攻击）。
 *    GCM / CTR 等 AEAD 模式本文件未实现，需要防篡改请另用 HMAC（见「摘要」工具）。
 * 4. 随机 IV 走 Math.random，非密码学安全随机源。日常加解密够用，生产密钥请自行接入 CSPRNG。
 */
import { md5Bytes, sha1Bytes, sha256Bytes } from './hash'
import { utf8Bytes, bytesUtf8 } from './base64'

/* ---------------- GF(2^8)、S 盒 ---------------- */

/**
 * S 盒按 FIPS-197 §5.4 现场生成：GF(2^8) 求逆 + 仿射变换。
 * 生成比手抄 256 项常量安全（抄错一位极难发现），正确性由 selfTest() 的 NIST 向量兜底。
 */
const { SBOX, INV_SBOX, LOG, ALOG } = (() => {
  const LOG = new Uint8Array(256)
  const ALOG = new Uint8Array(256)
  let x = 1
  for (let i = 0; i < 255; i++) {
    ALOG[i] = x
    LOG[x] = i
    const dbl = ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 0xff // x·2（0x11b 约掉高位）
    x = (dbl ^ x) & 0xff // x·3，3 是 GF(2^8) 的本原元
  }
  const rotl = (v, n) => ((v << n) | (v >>> (8 - n))) & 0xff
  /** 仿射变换：b'_i = b_i ⊕ b_{i+4} ⊕ b_{i+5} ⊕ b_{i+6} ⊕ b_{i+7} ⊕ c_i，
   *  bit i 的左旋 n 位取到的是 b_{i-n}，等价写法就是 ⊕ rotl(1..4)。
   *  自检：S[0x00]=0x63、S[0x01]=0x7c、S[0x53]=0xed（FIPS-197 §5.1 例） */
  const sub = (v) => {
    const inv = v === 0 ? 0 : ALOG[(255 - LOG[v]) % 255]
    return (inv ^ rotl(inv, 1) ^ rotl(inv, 2) ^ rotl(inv, 3) ^ rotl(inv, 4) ^ 0x63) & 0xff
  }
  const SBOX = new Uint8Array(256)
  const INV_SBOX = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    SBOX[i] = sub(i)
    INV_SBOX[SBOX[i]] = i
  }
  return { SBOX, INV_SBOX, LOG, ALOG }
})()

/** RCON[i] = x^(i-1) in GF(2^8)，FIPS-197 表 5 */
const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d, 0x9a]

function gmul(a, b) {
  if (a === 0 || b === 0) return 0
  return ALOG[(LOG[a] + LOG[b]) % 255]
}

/* ---------------- 密钥扩展 ---------------- */

function expandKey(key) {
  const Nk = key.length / 4
  if (Nk !== 4 && Nk !== 6 && Nk !== 8) throw new Error('AES 密钥只能是 16 / 24 / 32 字节，当前 ' + key.length + ' 字节')
  const Nr = Nk + 6
  const w = new Uint8Array(16 * (Nr + 1))
  w.set(key)
  const tmp = new Uint8Array(4)
  for (let i = Nk; i < 4 * (Nr + 1); i++) {
    for (let j = 0; j < 4; j++) tmp[j] = w[(i - 1) * 4 + j]
    if (i % Nk === 0) {
      const t0 = tmp[0]
      tmp[0] = SBOX[tmp[1]] ^ RCON[i / Nk - 1]
      tmp[1] = SBOX[tmp[2]]
      tmp[2] = SBOX[tmp[3]]
      tmp[3] = SBOX[t0]
    } else if (Nk > 6 && i % Nk === 4) {
      for (let j = 0; j < 4; j++) tmp[j] = SBOX[tmp[j]]
    }
    for (let j = 0; j < 4; j++) w[i * 4 + j] = w[(i - Nk) * 4 + j] ^ tmp[j]
  }
  return { w, Nr, Nk }
}

/* ---------------- 单块运算（state 为列优先 16 字节，与输入字节序一致） ---------------- */

/** SubBytes / InvSubBytes 紧接 ShiftRows / InvShiftRows（两者按字节替换，先后可交换） */
function subShift(state, sbox, inverse) {
  for (let i = 0; i < 16; i++) state[i] = sbox[state[i]]
  const t = state.slice()
  for (let r = 1; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const from = inverse ? (c - r + 4) % 4 : (c + r) % 4
      state[r + 4 * c] = t[r + 4 * from]
    }
  }
}

/** MixColumns / InvMixColumns：每列乘 FIPS-197 §5.1.3 / §5.3 的固定循环矩阵 */
function mixColumns(state, inverse) {
  for (let c = 0; c < 4; c++) {
    const o = c * 4
    const a = state[o]
    const b = state[o + 1]
    const k = state[o + 2]
    const d = state[o + 3]
    if (!inverse) {
      state[o] = gmul(a, 2) ^ gmul(b, 3) ^ k ^ d
      state[o + 1] = a ^ gmul(b, 2) ^ gmul(k, 3) ^ d
      state[o + 2] = a ^ b ^ gmul(k, 2) ^ gmul(d, 3)
      state[o + 3] = gmul(a, 3) ^ b ^ k ^ gmul(d, 2)
    } else {
      state[o] = gmul(a, 14) ^ gmul(b, 11) ^ gmul(k, 13) ^ gmul(d, 9)
      state[o + 1] = gmul(a, 9) ^ gmul(b, 14) ^ gmul(k, 11) ^ gmul(d, 13)
      state[o + 2] = gmul(a, 13) ^ gmul(b, 9) ^ gmul(k, 14) ^ gmul(d, 11)
      state[o + 3] = gmul(a, 11) ^ gmul(b, 13) ^ gmul(k, 9) ^ gmul(d, 14)
    }
  }
}

function addRoundKey(state, w, round) {
  for (let i = 0; i < 16; i++) state[i] ^= w[round * 16 + i]
}

/** 加密单个 16 字节块：AddKey(0) → (Sub Shift Mix AddKey)×(Nr-1) → Sub Shift AddKey(Nr) */
export function encryptBlock(block, sched) {
  const s = Uint8Array.prototype.slice.call(block, 0, 16)
  addRoundKey(s, sched.w, 0)
  for (let r = 1; r < sched.Nr; r++) {
    subShift(s, SBOX, false)
    mixColumns(s, false)
    addRoundKey(s, sched.w, r)
  }
  subShift(s, SBOX, false)
  addRoundKey(s, sched.w, sched.Nr)
  return s
}

/**
 * 解密单个 16 字节块。
 * 注意 InvMixColumns 必须在 AddRoundKey(r) **之后**——加密是 Mix 完才加轮密钥，
 * 反过来就得先减轮密钥再逆混合（除非改用「等价逆密码」的预混合轮密钥，这里没走那条路）。
 */
export function decryptBlock(block, sched) {
  const s = Uint8Array.prototype.slice.call(block, 0, 16)
  addRoundKey(s, sched.w, sched.Nr)
  for (let r = sched.Nr - 1; r > 0; r--) {
    subShift(s, INV_SBOX, true)
    addRoundKey(s, sched.w, r)
    mixColumns(s, true)
  }
  subShift(s, INV_SBOX, true)
  addRoundKey(s, sched.w, 0)
  return s
}

/* ---------------- 字节 / 十六进制 / Base64 ---------------- */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function toHexBytes(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += (bytes[i] & 0xff).toString(16).padStart(2, '0')
  return s
}

/** 十六进制串 → 字节；允许空格/冒号/短横分隔 */
export function fromHex(str) {
  const raw = String(str == null ? '' : str)
  const s = raw.replace(/[\s:,_-]/g, '')
  if (!s) return new Uint8Array(0)
  const bad = s.split('').find((c) => !/[0-9a-fA-F]/.test(c))
  if (bad) {
    const pos = s.indexOf(bad)
    throw new Error('十六进制第 ' + (pos + 1) + ' 位「' + bad + '」是非法字符（只允许 0-9 与 a-f）')
  }
  if (s.length % 2) throw new Error('十六进制要两个字符一个字节，当前 ' + s.length + ' 个字符（奇数），少了一位')
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16)
  return out
}

export function bytesToBase64(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : -1
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : -1
    out += B64[b0 >> 2]
    out += B64[((b0 & 3) << 4) | (b1 < 0 ? 0 : b1 >> 4)]
    out += b1 < 0 ? '=' : B64[((b1 & 15) << 2) | (b2 < 0 ? 0 : b2 >> 6)]
    out += b2 < 0 ? '=' : B64[b2 & 63]
  }
  return out
}

/** Base64 → 字节（自动兼容 URL 安全字母表，忽略空白与末尾填充） */
export function base64ToBytes(str) {
  const s = String(str == null ? '' : str).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  if (!s) return new Uint8Array(0)
  const bad = s.split('').find((c) => B64.indexOf(c) < 0)
  if (bad) throw new Error('Base64 里有非法字符「' + bad + '」（只允许 A-Z a-z 0-9 + / 与末尾的 =）')
  const out = []
  let bits = 0
  let acc = 0
  for (const ch of s) {
    acc = (acc << 6) | B64.indexOf(ch)
    bits += 6
    if (bits >= 8) {
      out.push((acc >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Uint8Array.from(out)
}

function randomBytes(n) {
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256) & 0xff
  return out
}

/** 随机十六进制串（IV / 盐用；随机源见文件头说明，非 CSPRNG） */
export function randomHex(byteLen) {
  return toHexBytes(randomBytes(Math.min(512, Math.max(1, Number(byteLen) || 16))))
}

/* ---------------- 口令派生（非标准迭代哈希） ---------------- */

const KDF_HASH = { md5: md5Bytes, sha1: sha1Bytes, sha256: sha256Bytes }

/**
 * 自写的迭代哈希 KDF——**非标准**，不可与 PBKDF2 / OpenSSL 互操作。
 * 做法：t = H(salt ‖ utf8(pass))，再连续做 iterations-1 次 t = H(t) 完成拉伸；
 * 密钥不够长时继续往下迭代拼接（SHA-256 一次出 32 字节，MD5 一次出 16 字节）。
 * @param {string} passphrase 口令
 * @param {object} [opts] { keyBytes=32, hash='sha256', iterations=5000, saltHex='' }
 * @returns {{ key: Uint8Array, keyHex: string, saltHex: string, hash: string,
 *             iterations: number, digestBytes: number, chainEndHex: string }}
 */
export function deriveKey(passphrase, opts) {
  const o = opts || {}
  const keyBytes = Number(o.keyBytes) || 32
  const hashName = String(o.hash || 'sha256').toLowerCase()
  const fn = KDF_HASH[hashName]
  if (!fn) throw new Error('不支持的派生哈希：' + hashName + '（可选 md5 / sha1 / sha256）')
  const pass = String(passphrase == null ? '' : passphrase)
  if (!pass) throw new Error('口令是空的——要么填口令，要么把上面的密钥类型换成「十六进制密钥」')
  const iterations = Math.min(200000, Math.max(1, Math.floor(Number(o.iterations) || 5000)))
  const salt = fromHex(o.saltHex || '')
  const pb = utf8Bytes(pass)
  const base = new Uint8Array(salt.length + pb.length)
  base.set(salt)
  base.set(pb, salt.length)

  const digest = fn(base)
  const key = new Uint8Array(keyBytes)
  let cur = digest
  let p = 0
  let steps = 1
  while (p < keyBytes) {
    // 先按 iterations 把链条拉长（这一步就是全部工作量），再取字节
    if (steps === 1) {
      for (; steps < iterations; steps++) cur = fn(cur)
    }
    const take = Math.min(cur.length, keyBytes - p)
    key.set(cur.subarray(0, take), p)
    p += take
    if (p < keyBytes) {
      cur = fn(cur)
      steps++
    }
  }
  return {
    key,
    keyHex: toHexBytes(key),
    saltHex: toHexBytes(salt),
    hash: hashName,
    iterations,
    digestBytes: digest.length,
    chainEndHex: toHexBytes(cur),
  }
}

/* ---------------- PKCS#7 ---------------- */

/** 补到 16 的整数倍；填充字节的值 = 补了几个字节（1~16，整块也补一整块） */
export function pkcs7Pad(bytes) {
  const src = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || [])
  const padLen = 16 - (src.length % 16)
  const out = new Uint8Array(src.length + padLen)
  out.set(src)
  for (let i = 0; i < padLen; i++) out[src.length + i] = padLen & 0xff
  return out
}

/** 校验并剥离填充；非法直接抛中文错误（CBC/ECB 下通常意味着密钥或密文错了） */
export function pkcs7Unpad(bytes) {
  const src = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || [])
  if (src.length === 0) throw new Error('密文是空的，没有可剥离的填充')
  if (src.length % 16 !== 0) throw new Error('密文长度 ' + src.length + ' 字节不是 16 的整数倍，不可能是 CBC/ECB 密文')
  const n = src[src.length - 1]
  if (n < 1 || n > 16) {
    throw new Error('末尾填充字节是 ' + n + '，合法范围 1~16 —— 十有八九是密钥错了，或者密文被截断/改动过')
  }
  for (let i = src.length - n; i < src.length; i++) {
    if (src[i] !== n) {
      throw new Error('填充校验失败（倒数第 ' + (src.length - i) + ' 字节不是 ' + n + '）—— 密钥或 IV 不对，或密文损坏')
    }
  }
  return src.slice(0, src.length - n)
}

/* ---------------- 模式 ---------------- */

export const AES_ALGOS = [
  { key: 'aes-128', name: 'AES-128', keyBytes: 16, keyHexChars: 32, rounds: 10, words: 4 },
  { key: 'aes-192', name: 'AES-192', keyBytes: 24, keyHexChars: 48, rounds: 12, words: 6 },
  { key: 'aes-256', name: 'AES-256', keyBytes: 32, keyHexChars: 64, rounds: 14, words: 8 },
]

export const AES_MODES = [
  { key: 'cbc', name: 'CBC', note: '密文块 C[i] = E(P[i] ⊕ C[i-1])，需要 16 字节 IV。相同明文换 IV 就换密文；无完整性保护' },
  { key: 'ecb', name: 'ECB', note: '每块独立加密。相同明文块 → 相同密文块，会泄露图案，只适合加密一两块的定长短数据' },
]

function algoInfo(algo) {
  const a = AES_ALGOS.find((x) => x.key === String(algo || '').toLowerCase())
  if (!a) throw new Error('不支持的密钥长度：' + algo + '（可选 AES-128 / 192 / 256）')
  return a
}

function xorBlock(a, b) {
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i++) out[i] = (a[i] ^ b[i]) & 0xff
  return out
}

function concat(chunks) {
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let p = 0
  for (const c of chunks) {
    out.set(c, p)
    p += c.length
  }
  return out
}

/**
 * 按 CBC / ECB 逐块处理（1 加密 / 1 解密方向由 decrypt 决定）
 * @returns {{ bytes: Uint8Array, blocks: Array<{index, inputHex, midHex, outputHex}> }}
 */
function runBlocks(data, sched, iv, mode, decrypt) {
  if (data.length % 16 !== 0) {
    throw new Error(
      decrypt
        ? '数据长度 ' + data.length + ' 字节不是 16 的整数倍，先确认密文有没有被截断、格式选对没有'
        : '内部错误：进入分组运算的数据未填充'
    )
  }
  const list = []
  const chunks = []
  let prev = mode === 'cbc' ? iv.slice() : null
  for (let i = 0; i < data.length; i += 16) {
    const raw = data.subarray(i, i + 16)
    let mid
    let out
    if (!decrypt) {
      mid = mode === 'cbc' ? xorBlock(prev, raw) : raw.slice()
      out = encryptBlock(mid, sched)
      if (mode === 'cbc') prev = out
    } else {
      mid = decryptBlock(raw, sched)
      out = mode === 'cbc' ? xorBlock(prev, mid) : mid.slice()
      if (mode === 'cbc') prev = raw
    }
    list.push({
      index: list.length + 1,
      inputHex: toHexBytes(raw),
      midHex: toHexBytes(mid),
      outputHex: toHexBytes(out),
    })
    chunks.push(out)
  }
  return { bytes: concat(chunks), blocks: list }
}

/**
 * 解析密钥与 IV（加解密共用）
 * @param {object} o { algo, mode, keyType:'pass'|'hex', key, saltHex, saltAuto,
 *                     hash, iterations, iv, ivAuto, ivRequired, ivMustBeGiven }
 * @returns {{ key: Uint8Array, keyHex: string, keySource: string, iv: Uint8Array,
 *             ivHex: string, ivAuto: boolean, kdf: object|null, algo: object }}
 */
export function resolveKey(o) {
  const opts = o || {}
  const a = algoInfo(opts.algo || 'aes-256')
  const mode = String(opts.mode || 'cbc').toLowerCase()
  const keyType = String(opts.keyType || 'pass').toLowerCase()
  let key
  let kdf = null
  let keySource
  if (keyType === 'hex') {
    key = fromHex(opts.key)
    if (key.length !== a.keyBytes) {
      throw new Error(a.name + ' 的密钥要 ' + a.keyBytes + ' 字节（' + a.keyHexChars + ' 个十六进制字符），当前是 ' + key.length + ' 字节')
    }
    keySource = '直接给出十六进制密钥'
  } else if (keyType === 'pass' || keyType === 'password' || keyType === 'passphrase') {
    let saltHex = opts.saltHex
    if (!String(saltHex || '').trim() && opts.saltAuto) saltHex = randomHex(8)
    kdf = deriveKey(opts.key, {
      keyBytes: a.keyBytes,
      hash: opts.hash || 'sha256',
      iterations: opts.iterations,
      saltHex: saltHex || '',
    })
    key = kdf.key
    keySource = '口令派生（自写迭代哈希，非标准 KDF）'
  } else {
    throw new Error('未知的密钥类型：' + keyType)
  }

  let iv = new Uint8Array(16)
  let ivHex = ''
  let auto = false
  if (mode !== 'ecb') {
    const hasIv = !!String(opts.iv || '').trim()
    // 解密时 IV 必须由用户给出：勾了「随机 IV」等于没给，随便拿一个随机数去解
    // 只会静默地把首块明文搞乱，不如直接报错让人回去找。
    const ivMissing = opts.ivMustBeGiven ? opts.ivAuto || !hasIv : !hasIv && opts.ivRequired && !opts.ivAuto
    if (ivMissing) {
      throw new Error('CBC 解密必须知道 IV——把加密时那 32 个十六进制字符填进来（IV 错了首块明文必乱）')
    }
    auto = !!opts.ivAuto || !hasIv
    if (auto) {
      iv = randomBytes(16)
    } else {
      iv = fromHex(opts.iv)
      if (iv.length !== 16) throw new Error('IV 要 16 字节（32 个十六进制字符），当前是 ' + iv.length + ' 字节')
    }
    ivHex = toHexBytes(iv)
  }
  return { key, keyHex: toHexBytes(key), keySource, iv, ivHex, ivAuto: auto, kdf, algo: a }
}

function readText(data, inputType) {
  if (inputType === 'hex') return fromHex(data)
  return Uint8Array.from(utf8Bytes(String(data == null ? '' : data)))
}

/** 密文自动识别：纯十六进制且正好整块时按十六进制，否则按 Base64 */
function readCipher(data, inputType) {
  const s = String(data == null ? '' : data).trim()
  if (inputType === 'hex') return { bytes: fromHex(s), via: 'hex' }
  if (inputType === 'text') return { bytes: Uint8Array.from(utf8Bytes(s)), via: 'utf8' }
  const cleaned = s.replace(/\s+/g, '')
  if (!cleaned) throw new Error('密文是空的')
  if (/^[0-9a-fA-F]+$/.test(cleaned) && cleaned.length % 32 === 0) return { bytes: fromHex(cleaned), via: 'hex' }
  return { bytes: base64ToBytes(cleaned), via: 'base64' }
}

function trail(blocks, limit) {
  const n = Math.max(1, Number(limit) || 8)
  return { shown: blocks.slice(0, n), total: blocks.length, truncated: blocks.length > n }
}

/**
 * 加密
 * @param {object} opts { algo, mode, keyType, key, saltHex, saltAuto, hash, iterations,
 *                        iv, ivAuto, input, inputType:'text'|'hex', out:'base64'|'hex', blockLimit }
 * @returns {{ output, outputHex, outputBase64, keyHex, keySource, ivHex, ivAuto, mode,
 *             algoName, rounds, inputBytes, paddedBytes, padBytes, blocks, blockTrail,
 *             kdf, note, asString }}
 */
export function aesEncrypt(opts) {
  const o = opts || {}
  const mode = String(o.mode || 'cbc').toLowerCase()
  if (mode !== 'cbc' && mode !== 'ecb') throw new Error('只支持 CBC 与 ECB 两种模式（GCM 未实现，见文件头说明）')
  const raw = readText(o.input, o.inputType)
  if (!raw.length) throw new Error('明文是空的——先输入要加密的内容')
  if (raw.length > 200000) throw new Error('明文 ' + raw.length + ' 字节，超过 20 万字节上限（纯 JS 会很慢）')
  const ctx = resolveKey({ ...o, mode })
  const sched = expandKey(ctx.key)
  const padded = pkcs7Pad(raw)
  const r = runBlocks(padded, sched, ctx.iv, mode, false)
  const hex = toHexBytes(r.bytes)
  const b64 = bytesToBase64(r.bytes)
  return {
    output: o.out === 'hex' ? hex : b64,
    outputHex: hex,
    outputBase64: b64,
    keyHex: ctx.keyHex,
    keySource: ctx.keySource,
    ivHex: ctx.ivHex,
    ivAuto: ctx.ivAuto,
    mode,
    algoName: ctx.algo.name,
    rounds: ctx.algo.rounds,
    inputBytes: raw.length,
    paddedBytes: padded.length,
    padBytes: padded.length - raw.length,
    blocks: r.blocks,
    blockTrail: trail(r.blocks, o.blockLimit),
    kdf: ctx.kdf,
    note:
      mode === 'ecb'
        ? 'ECB 不隐藏图案：明文里重复的 16 字节块，密文里也会原样重复'
        : 'CBC 只保证机密性；要防篡改需要另加 HMAC（本工具不做认证加密）',
    /** 直接可粘走的一行：Base64(密文)（IV 单独记） */
    asString: (o.out === 'hex' ? hex : b64) + (mode === 'cbc' ? '\u2009·\u2009IV ' + ctx.ivHex : ''),
  }
}

/**
 * 解密
 * @param {object} opts 同 aesEncrypt，input 为密文，inputType 可为 'base64'|'hex'|'text'|未指定(自动)
 * @returns {{ plain, plainText, plainHex, plainBase64, printable, cipherBytes, detectedFormat,
 *             keyHex, keySource, ivHex, mode, algoName, rounds, blocks, blockTrail, kdf }}
 */
export function aesDecrypt(opts) {
  const o = opts || {}
  const mode = String(o.mode || 'cbc').toLowerCase()
  if (mode !== 'cbc' && mode !== 'ecb') throw new Error('只支持 CBC 与 ECB 两种模式')
  const ct = readCipher(o.input, o.inputType)
  if (!ct.bytes.length) throw new Error('密文是空的')
  const ctx = resolveKey({ ...o, mode, ivRequired: true, ivMustBeGiven: true })
  if (mode === 'cbc' && !ctx.ivHex) throw new Error('CBC 解密必须知道 IV——把加密时那 32 个十六进制字符填进来')
  const sched = expandKey(ctx.key)
  const r = runBlocks(ct.bytes, sched, ctx.iv, mode, true)
  const plain = pkcs7Unpad(r.bytes)
  const rt = renderPlain(plain)
  return {
    plain,
    plainText: rt.text,
    printable: rt.printable,
    plainHex: toHexBytes(plain),
    plainBase64: bytesToBase64(plain),
    plainBytes: plain.length,
    cipherBytes: ct.bytes.length,
    detectedFormat: ct.via,
    keyHex: ctx.keyHex,
    keySource: ctx.keySource,
    ivHex: ctx.ivHex,
    mode,
    algoName: ctx.algo.name,
    rounds: ctx.algo.rounds,
    blocks: r.blocks,
    blockTrail: trail(r.blocks, o.blockLimit),
    kdf: ctx.kdf,
  }
}

/** 能按 UTF-8 还原成正常文本就还原，掺了控制字符就退回「可打印字符 + 点」的视图 */
function renderPlain(bytes) {
  let control = 0
  for (const b of bytes) {
    if (b < 32 && b !== 9 && b !== 10 && b !== 13) control++
    else if (b === 127) control++
  }
  if (control === 0 && bytes.length) {
    try {
      return { text: bytesUtf8(Array.from(bytes)), printable: true }
    } catch (e) {
      /* 落到下面的转义视图 */
    }
  }
  let s = ''
  for (const b of bytes) s += b >= 32 && b < 127 ? String.fromCharCode(b) : '·'
  return { text: s + (control ? '（含 ' + control + ' 个不可打印字节，原始内容请用十六进制看）' : ''), printable: false }
}

/* ---------------- 自测 ---------------- */

/** SP 800-38A 的 f 向量明文（前 4 块，64 字节） */
const SP800_38A_PLAIN =
  '6bc1bee22e409f96e93d7e117393172a' +
  'ae2d8a571e03ac9c9eb76fac45af8e51' +
  '30c81c46a35ce411e5fbc1191a0a52ef' +
  'f69f2445df4f9b17ad2b417be66c3710'

/** NIST 公开向量：FIPS-197 附录 C 的三块 + SP 800-38A 的 ECB/CBC 前四块
 *  （十六进制，无 PKCS#7，直接比对分组结果） */
export const VECTORS = [
  {
    name: 'FIPS-197 C.1 · AES-128 分组',
    algo: 'aes-128',
    mode: 'ecb',
    key: '000102030405060708090a0b0c0d0e0f',
    plain: '00112233445566778899aabbccddeeff',
    cipher: '69c4e0d86a7b0430d8cdb78070b4c55a',
  },
  {
    name: 'FIPS-197 C.2 · AES-192 分组',
    algo: 'aes-192',
    mode: 'ecb',
    key: '000102030405060708090a0b0c0d0e0f1011121314151617',
    plain: '00112233445566778899aabbccddeeff',
    cipher: 'dda97ca4864cdfe06eaf70a0ec0d7191',
  },
  {
    name: 'FIPS-197 C.3 · AES-256 分组',
    algo: 'aes-256',
    mode: 'ecb',
    key: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    plain: '00112233445566778899aabbccddeeff',
    cipher: '8ea2b7ca516745bfeafc49904b496089',
  },
  {
    name: 'SP 800-38A F.1.1 · ECB-AES128 前四块',
    algo: 'aes-128',
    mode: 'ecb',
    key: '2b7e151628aed2a6abf7158809cf4f3c',
    plain: SP800_38A_PLAIN,
    cipher:
      '3ad77bb40d7a3660a89ecaf32466ef97' +
      'f5d3d58503b9699de785895a96fdbaaf' +
      '43b1cd7f598ece23881b00e3ed030688' +
      '7b0c785e27e8ad3f8223207104725dd4',
  },
  {
    name: 'SP 800-38A F.1.3 · ECB-AES192 前四块',
    algo: 'aes-192',
    mode: 'ecb',
    key: '8e73b0f7da0e6452c810f32b809079e562f8ead2522c6b7b',
    plain: SP800_38A_PLAIN,
    cipher:
      'bd334f1d6e45f25ff712a214571fa5cc' +
      '974104846d0ad3ad7734ecb3ecee4eef' +
      'ef7afd2270e2e60adce0ba2face6444e' +
      '9a4b41ba738d6c72fb16691603c18e0e',
  },
  {
    name: 'SP 800-38A F.1.5 · ECB-AES256 前四块',
    algo: 'aes-256',
    mode: 'ecb',
    key: '603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4',
    plain: SP800_38A_PLAIN,
    cipher:
      'f3eed1bdb5d2a03c064b5a7e3db181f8' +
      '591ccb10d410ed26dc5ba74a31362870' +
      'b6ed21b99ca6f4f9f153e7b1beafed1d' +
      '23304b7a39f9f3ff067d8d8f9e24ecc7',
  },
  {
    name: 'SP 800-38A F.2.1 · CBC-AES128 前四块',
    algo: 'aes-128',
    mode: 'cbc',
    key: '2b7e151628aed2a6abf7158809cf4f3c',
    iv: '000102030405060708090a0b0c0d0e0f',
    plain: SP800_38A_PLAIN,
    cipher:
      '7649abac8119b246cee98e9b12e9197d' +
      '5086cb9b507219ee95db113a917678b2' +
      '73bed6b8e3c1743b7116e69e22229516' +
      '3ff1caa1681fac09120eca307586e1a7',
  },
  {
    name: 'SP 800-38A F.2.3 · CBC-AES192 前四块',
    algo: 'aes-192',
    mode: 'cbc',
    key: '8e73b0f7da0e6452c810f32b809079e562f8ead2522c6b7b',
    iv: '000102030405060708090a0b0c0d0e0f',
    plain: SP800_38A_PLAIN,
    cipher:
      '4f021db243bc633d7178183a9fa071e8' +
      'b4d9ada9ad7dedf4e5e738763f69145a' +
      '571b242012fb7ae07fa9baac3df102e0' +
      '08b0e27988598881d920a9e64f5615cd',
  },
  {
    name: 'SP 800-38A F.2.5 · CBC-AES256 前四块',
    algo: 'aes-256',
    mode: 'cbc',
    key: '603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4',
    iv: '000102030405060708090a0b0c0d0e0f',
    plain: SP800_38A_PLAIN,
    cipher:
      'f58c4c04d6e5f1ba779eabfb5f7bfbd6' +
      '9cfc4e967edb808d679f777bc6702c7d' +
      '39f23369a9d9bacfa530e26304231461' +
      'b2eb05e2c39be9fcda6c19078c6a9d1b',
  },
]

/** 无填充地跑一遍分组（向量比对用） */
function rawRun(algo, mode, keyHex, ivHex, plainHex) {
  const sched = expandKey(fromHex(keyHex))
  const m = mode === 'cbc' ? 'cbc' : 'ecb'
  const r = runBlocks(fromHex(plainHex), sched, m === 'cbc' ? fromHex(ivHex) : new Uint8Array(16), m, false)
  return toHexBytes(r.bytes)
}

function rawDecrypt(algo, mode, keyHex, ivHex, cipherHex) {
  const sched = expandKey(fromHex(keyHex))
  const m = mode === 'cbc' ? 'cbc' : 'ecb'
  const r = runBlocks(fromHex(cipherHex), sched, m === 'cbc' ? fromHex(ivHex) : new Uint8Array(16), m, true)
  return toHexBytes(r.bytes)
}

/**
 * 跑一遍自测：NIST 向量（正/反）+ 三种长度往返 + 填充边界 + 报错文案
 * @param {(msg: string) => void} [log] 传 console.log 即可逐条打印
 * @returns {{ pass: number, fail: number, total: number, results: Array<object> }}
 */
export function selfTest(log) {
  const results = []
  const push = (name, ok, expected, actual) => {
    results.push({ name, ok: !!ok, expected: String(expected), actual: String(actual) })
    if (log) log((ok ? '✓ ' : '✗ ') + name + (ok ? '' : '  期望 ' + expected + '  实际 ' + actual))
  }

  // 1) NIST 向量：加密比对 + 解密反推
  for (const v of VECTORS) {
    const mode = v.mode || 'ecb'
    const enc = rawRun(v.algo, mode, v.key, v.iv || '', v.plain)
    push(v.name, enc === v.cipher, v.cipher.slice(0, 32) + '…', enc.slice(0, 32) + '…')
    const back = rawDecrypt(v.algo, mode, v.key, v.iv || '', v.cipher)
    push(v.name + ' · 反向解密', back === v.plain, v.plain.slice(0, 32) + '…', back.slice(0, 32) + '…')
  }

  // 2) S 盒 / 逆 S 盒互逆
  let invOk = true
  for (let i = 0; i < 256; i++) if (INV_SBOX[SBOX[i]] !== i) invOk = false
  push('S 盒与逆 S 盒互逆（256 项）', invOk, '互逆', '互逆')
  push('S 盒首末项对表', SBOX[0] === 0x63 && SBOX[1] === 0x7c && SBOX[0x53] === 0xed, '63 7c ed', SBOX[0].toString(16) + ' ' + SBOX[1].toString(16) + ' ' + SBOX[0x53].toString(16))

  // 3) 三种长度 × 两种模式往返（含中文与 emoji）
  for (const algo of ['aes-128', 'aes-192', 'aes-256']) {
    for (const mode of ['cbc', 'ecb']) {
      const keyHex = randomHex(algoInfo(algo).keyBytes)
      const msg = '随身匣 ' + algo + '/' + mode + ' 测试🔐'
      const enc = aesEncrypt({ algo, mode, keyType: 'hex', key: keyHex, iv: mode === 'cbc' ? randomHex(16) : '', input: msg, inputType: 'text' })
      const dec = aesDecrypt({ algo, mode, keyType: 'hex', key: keyHex, iv: enc.ivHex, input: enc.outputBase64, inputType: 'base64' })
      push(algo + '/' + mode + ' Base64 往返', dec.plainText === msg, msg, dec.plainText)
      const dec2 = aesDecrypt({ algo, mode, keyType: 'hex', key: keyHex, iv: enc.ivHex, input: enc.outputHex, inputType: 'hex' })
      push(algo + '/' + mode + ' 十六进制往返', dec2.plainText === msg, msg, dec2.plainText)
    }
  }

  // 4) 口令派生
  const d1 = deriveKey('hunter2', { keyBytes: 32, hash: 'sha256', iterations: 100, saltHex: '00ff' })
  const d2 = deriveKey('hunter2', { keyBytes: 32, hash: 'sha256', iterations: 100, saltHex: '00ff' })
  const d3 = deriveKey('hunter2', { keyBytes: 32, hash: 'sha256', iterations: 101, saltHex: '00ff' })
  const d4 = deriveKey('hunter2', { keyBytes: 32, hash: 'sha256', iterations: 100, saltHex: '00fe' })
  push('派生确定性（同参数同结果）', d1.keyHex === d2.keyHex, d2.keyHex.slice(0, 8), d1.keyHex.slice(0, 8))
  push('迭代轮数改变密钥', d1.keyHex !== d3.keyHex, '不同', '不同')
  push('加盐改变密钥', d1.keyHex !== d4.keyHex, '不同', '不同')
  push('16/24/32 字节派生长度', [16, 24, 32].every((n) => deriveKey('a', { keyBytes: n, iterations: 1 }).key.length === n), 3, 3)
  push('MD5 派生跨摘要块拼接', deriveKey('中文口令', { keyBytes: 32, hash: 'md5', iterations: 3 }).keyHex.length === 64, 64, deriveKey('中文口令', { keyBytes: 32, hash: 'md5', iterations: 3 }).keyHex.length)
  const passEnc = aesEncrypt({ algo: 'aes-256', mode: 'cbc', keyType: 'pass', key: '口令 abc', saltHex: '0a0b', iterations: 50, iv: '', input: 'hello', out: 'base64' })
  const passDec = aesDecrypt({ algo: 'aes-256', mode: 'cbc', keyType: 'pass', key: '口令 abc', saltHex: '0a0b', iterations: 50, iv: passEnc.ivHex, input: passEnc.output, inputType: 'base64' })
  push('口令模式（固定盐）往返', passDec.plainText === 'hello', 'hello', passDec.plainText)

  // 5) 填充边界
  push('空输入补一整块', pkcs7Pad(new Uint8Array(0)).length === 16, 16, pkcs7Pad(new Uint8Array(0)).length)
  push('15 字节补 1 字节', pkcs7Pad(new Uint8Array(15)).length === 16, 16, pkcs7Pad(new Uint8Array(15)).length)
  push('16 字节补一整块', pkcs7Pad(new Uint8Array(16)).length === 32, 32, pkcs7Pad(new Uint8Array(16)).length)
  push('17 字节补 15 字节', pkcs7Pad(new Uint8Array(17)).length === 32, 32, pkcs7Pad(new Uint8Array(17)).length)
  push('填充可逆', toHexBytes(pkcs7Unpad(pkcs7Pad(fromHex('0011223344556677')))) === '0011223344556677', '原样', '原样')
  let unpadMsg = ''
  try {
    pkcs7Unpad(new Uint8Array(16))
  } catch (e) {
    unpadMsg = e.message
  }
  push('全零填充被判为错误', /填充字节是 0/.test(unpadMsg), '抛错', unpadMsg)

  // 6) 错误输入的中文报错
  const errCases = [
    ['密钥长度不符', () => aesEncrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '0011', input: 'x' })],
    ['十六进制奇数位', () => fromHex('abc')],
    ['十六进制非法字符', () => fromHex('zz00')],
    ['IV 长度不符', () => aesEncrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '00112233445566778899aabbccddeeff', iv: '0011', input: 'x' })],
    ['空口令派生', () => deriveKey('', { keyBytes: 16 })],
    ['不支持的哈希', () => deriveKey('a', { keyBytes: 16, hash: 'sm3' })],
    ['密文非整块', () => aesDecrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '00112233445566778899aabbccddeeff', iv: '00112233445566778899aabbccddeeff', input: '00112233', inputType: 'hex' })],
    ['Base64 非法字符', () => base64ToBytes('!!!!')],
    ['错误密钥导致填充失败', () => {
      const e1 = aesEncrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '00112233445566778899aabbccddeeff', iv: '00112233445566778899aabbccddeeff', input: 'abcd' })
      aesDecrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: 'ff112233445566778899aabbccddeeff', iv: e1.ivHex, input: e1.outputBase64, inputType: 'base64' })
    }],
  ]
  for (const [name, fn] of errCases) {
    let msg = ''
    let threw = false
    try {
      fn()
    } catch (e) {
      threw = true
      msg = e && e.message ? e.message : String(e)
    }
    push(name + ' → 中文报错', threw && /[\u4e00-\u9fa5]/.test(msg), '中文 Error', msg || '（没抛错）')
  }

  // 7) 编解码互逆
  const rt = randomBytes(37)
  push('Base64 编解码互逆（37 字节）', toHexBytes(base64ToBytes(bytesToBase64(rt))) === toHexBytes(rt), '一致', '一致')
  push('Base64 长度是 4 的倍数', bytesToBase64(new Uint8Array(1)).length % 4 === 0, 4, bytesToBase64(new Uint8Array(1)).length)
  push('十六进制互逆', toHexBytes(fromHex('De Ad Be Ef')) === 'deadbeef', 'deadbeef', toHexBytes(fromHex('De Ad Be Ef')))
  push('长文本往返（10001 字节）', (() => {
    const long = 'x'.repeat(10001)
    const e = aesEncrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '00112233445566778899aabbccddeeff', iv: '00112233445566778899aabbccddeeff', input: long })
    return e.padBytes === 15 && aesDecrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '00112233445566778899aabbccddeeff', iv: e.ivHex, input: e.outputBase64, inputType: 'base64' }).plainText === long
  })(), true, true)

  const pass = results.filter((r) => r.ok).length
  return { pass, fail: results.length - pass, total: results.length, results }
}

/** 工具页底部的说明条目 */
export const AES_NOTES = [
  'CBC 是默认也推荐的模式：需要 16 字节 IV。IV 不必保密，但必须和密文一起保存（惯例是拼在密文前面，本工具单独列出来方便你粘）。',
  '「随机 IV」每次结果都不一样——这是特性不是 bug。想复现同样的密文，把 IV 固定填成同一个值。',
  'ECB 只要明文里有重复的 16 字节块，密文里就会重复出现（著名的「ECB 企鹅图」）。除了定长的单一字段，别用它。',
  '口令派生是自写的迭代哈希（T1=H(salt‖pass)，Tn=H(Tn-1)），不是 PBKDF2，密文无法和 OpenSSL / Java / Python 的标准工具互解。要跟别的软件互通就选「十六进制密钥」，并把对方导出的密钥原样填进来。',
  'AES-GCM、CTR 等认证加密模式本工具未实现。需要防篡改，请另外用 HMAC（「摘要」工具里就有）。',
  '解不出明文时的报错基本就两类：填充校验失败（密钥或 IV 错、密文被改动），或长度不是 16 的整数倍（格式选错了、内容被截断）。',
]

/** 示例输入，供工具页一键载入 */
export const AES_SAMPLES = [
  { name: '中文短句', text: '随身匣·离线工具箱，不联网' },
  { name: 'JSON', text: '{"uid":1024,"token":"aXBob25lLWJvbG9ja2Vk"}' },
  { name: '整块重复（ECB 会露馅）', text: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
]
