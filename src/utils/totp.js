/**
 * 两步验证码（TOTP / HOTP，RFC 6238 / 4226）
 * 纯本地计算，密钥不出设备。
 */
import { hmacBytes } from './hash'

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/* ---------------- Base32（RFC 4648） ---------------- */

export function base32Encode(bytes) {
  const src = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || [])
  let out = ''
  let bits = 0
  let value = 0
  for (const b of src) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31]
  while (out.length % 8 !== 0) out += '='
  return out
}

export function base32Decode(str) {
  let s = String(str || '').toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '')
  if (!s) throw new Error('密钥是空的')
  if (!/^[A-Z2-7]+$/.test(s)) {
    const bad = s.split('').find((c) => B32_ALPHABET.indexOf(c) < 0)
    throw new Error('Base32 密钥里出现了非法字符「' + bad + '」（只允许 A-Z 与 2-7）')
  }
  const out = []
  let bits = 0
  let value = 0
  for (const ch of s) {
    value = (value << 5) | B32_ALPHABET.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Uint8Array.from(out)
}

/* ---------------- HOTP / TOTP ---------------- */

const ALGO_MAP = { SHA1: 'sha1', SHA256: 'sha256', SHA512: 'sha512' }

/** 8 字节大端计数器 */
function counterBytes(counter) {
  const buf = new Uint8Array(8)
  let c = BigInt(counter)
  for (let i = 7; i >= 0; i--) {
    buf[i] = Number(c & 0xffn)
    c >>= 8n
  }
  return buf
}

/**
 * HOTP
 * @param {Uint8Array} keyBytes 解码后的密钥
 * @param {number|bigint} counter 计数器
 */
export function hotp(keyBytes, counter, digits, algo) {
  const d = digits || 6
  const a = ALGO_MAP[String(algo || 'SHA1').toUpperCase()] || 'sha1'
  const mac = hmacBytes(a, keyBytes, counterBytes(counter))
  // 动态截断
  const offset = mac[mac.length - 1] & 0x0f
  const bin =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff)
  const code = String(bin % Math.pow(10, d))
  return code.padStart(d, '0')
}

/**
 * TOTP
 * @param {string} secret Base32 密钥
 * @param {object} opt { period, digits, algo, at }
 */
export function totp(secret, opt) {
  const o = Object.assign({ period: 30, digits: 6, algo: 'SHA1', at: Date.now() }, opt || {})
  let keyBytes
  try {
    keyBytes = base32Decode(secret)
  } catch (e) {
    return { ok: false, error: e.message }
  }
  if (!keyBytes.length) return { ok: false, error: '密钥解出来是空的' }

  const nowSec = Math.floor(o.at / 1000)
  const counter = Math.floor(nowSec / o.period)
  const code = hotp(keyBytes, counter, o.digits, o.algo)
  const elapsed = nowSec % o.period
  const remain = o.period - elapsed

  return {
    ok: true,
    code,
    pretty: code.length === 6 ? code.slice(0, 3) + ' ' + code.slice(3) : code,
    counter,
    period: o.period,
    remain,
    progress: elapsed / o.period,
    keyBytes: keyBytes.length,
    expiresAt: (counter + 1) * o.period * 1000,
  }
}

/** 校验一个验证码（前后各容一个时间窗，和常见实现一致） */
export function verifyTotp(secret, code, opt) {
  const o = Object.assign({ period: 30, digits: 6, algo: 'SHA1', at: Date.now(), window: 1 }, opt || {})
  const target = String(code).replace(/\s/g, '')
  if (!/^\d+$/.test(target)) return { ok: false, error: '验证码只能是数字', matched: false }
  let keyBytes
  try {
    keyBytes = base32Decode(secret)
  } catch (e) {
    return { ok: false, error: e.message, matched: false }
  }
  const nowSec = Math.floor(o.at / 1000)
  const base = Math.floor(nowSec / o.period)
  for (let i = -o.window; i <= o.window; i++) {
    const c = hotp(keyBytes, base + i, o.digits, o.algo)
    if (c === target) {
      const diffSec = i * o.period - (nowSec % o.period)
      return {
        ok: true,
        matched: true,
        offset: i,
        explain: i === 0 ? '正好是当前时间窗' : i < 0 ? '属于上一个时间窗（可能刚过期）' : '属于下一个时间窗（设备时钟偏快）',
        diffSec,
      }
    }
  }
  return { ok: true, matched: false, explain: '当前时间窗与前后各一个窗口都对不上' }
}

/** 生成一个随机 Base32 密钥 */
export function randomSecret(bytes) {
  const n = bytes || 20
  const buf = new Uint8Array(n)
  for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256)
  return base32Encode(buf).replace(/=+$/, '')
}

/** 把 otpauth:// 链接里的 secret 抽出来 */
export function secretFromUri(uri) {
  const m = /[?&]secret=([A-Za-z2-7]+)/.exec(String(uri))
  return m ? m[1] : ''
}

export const TOTP_DEFAULTS = { period: 30, digits: 6, algo: 'SHA1' }

export const TOTP_NOTES = [
  '密钥只在本地计算，不上传、不落盘。',
  '手机上的身份验证器用的是同一套算法（RFC 6238），所以两端算出来的码一定一致。',
  '验证码只在一段时间内有效，过期就作废，这是它比固定密码安全的原因。',
  '本工具不保存密钥。关掉页面后要重新输入。',
]
