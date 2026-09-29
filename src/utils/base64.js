/**
 * Base64 编解码（纯 JS 实现，不依赖 btoa/atob）
 * 原因：App 端逻辑层不保证有 btoa/atob，手写一份最稳
 */

const TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** 字符串 -> UTF-8 字节数组 */
export function utf8Bytes(str) {
  const out = []
  const s = String(str)
  for (let i = 0; i < s.length; i++) {
    let code = s.charCodeAt(i)
    // 处理代理对（emoji 等）
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = (code - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000
        i++
      }
    }
    if (code < 0x80) {
      out.push(code)
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code < 0x10000) {
      out.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      )
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      )
    }
  }
  return out
}

/**
 * 字符串按 UTF-8 编码后的字节数，规则与 utf8Bytes 一致。
 * 界面上「共 N 字节」那一类计数一律走这里，别在组件里再抄一遍分段阈值。
 */
export function utf8ByteLen(str) {
  let n = 0
  for (const ch of String(str)) {
    const c = ch.codePointAt(0)
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4
  }
  return n
}

/** UTF-8 字节数组 -> 字符串 */
export function bytesUtf8(bytes) {
  let out = ''
  let i = 0
  while (i < bytes.length) {
    const b = bytes[i]
    let code
    if (b < 0x80) {
      code = b
      i += 1
    } else if (b >= 0xc0 && b < 0xe0) {
      code = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f)
      i += 2
    } else if (b >= 0xe0 && b < 0xf0) {
      code = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)
      i += 3
    } else {
      code =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f)
      i += 4
    }
    if (code > 0xffff) {
      code -= 0x10000
      out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff))
    } else {
      out += String.fromCharCode(code)
    }
  }
  return out
}

export function base64Encode(str, urlSafe) {
  const bytes = utf8Bytes(str)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : NaN
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : NaN
    out += TABLE[b0 >> 2]
    out += TABLE[((b0 & 3) << 4) | (isNaN(b1) ? 0 : b1 >> 4)]
    out += isNaN(b1) ? '=' : TABLE[((b1 & 15) << 2) | (isNaN(b2) ? 0 : b2 >> 6)]
    out += isNaN(b2) ? '=' : TABLE[b2 & 63]
  }
  if (urlSafe) {
    return out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  return out
}

export function base64Decode(str, urlSafe) {
  let s = String(str).replace(/\s+/g, '')
  if (urlSafe || /[-_]/.test(s)) {
    s = s.replace(/-/g, '+').replace(/_/g, '/')
  }
  s = s.replace(/[^A-Za-z0-9+/=]/g, '')
  const pad = s.length % 4
  if (pad) s += '='.repeat(4 - pad)

  const bytes = []
  for (let i = 0; i < s.length; i += 4) {
    const c0 = TABLE.indexOf(s[i])
    const c1 = TABLE.indexOf(s[i + 1])
    const c2 = s[i + 2] === '=' ? -1 : TABLE.indexOf(s[i + 2])
    const c3 = s[i + 3] === '=' ? -1 : TABLE.indexOf(s[i + 3])
    if (c0 < 0 || c1 < 0) throw new Error('包含非法 Base64 字符')
    bytes.push((c0 << 2) | (c1 >> 4))
    if (c2 >= 0) bytes.push(((c1 & 15) << 4) | (c2 >> 2))
    if (c3 >= 0) bytes.push(((c2 & 3) << 6) | c3)
  }
  return bytesUtf8(bytes)
}

/** 字节数组 -> 十六进制字符串 */
export function bytesToHex(bytes, sep) {
  return bytes
    .map((b) => (b & 0xff).toString(16).padStart(2, '0'))
    .join(sep || '')
}

/** 字节数组 -> Base64（不经过 UTF-8，二进制安全） */
export function bytesToBase64(bytes) {
  let out = ''
  const arr = bytes.length !== undefined ? bytes : Array.from(bytes)
  for (let i = 0; i < arr.length; i += 3) {
    const b0 = arr[i]
    const b1 = i + 1 < arr.length ? arr[i + 1] : NaN
    const b2 = i + 2 < arr.length ? arr[i + 2] : NaN
    out += TABLE[b0 >> 2]
    out += TABLE[((b0 & 3) << 4) | (isNaN(b1) ? 0 : b1 >> 4)]
    out += isNaN(b1) ? '=' : TABLE[((b1 & 15) << 2) | (isNaN(b2) ? 0 : b2 >> 6)]
    out += isNaN(b2) ? '=' : TABLE[b2 & 63]
  }
  return out
}
