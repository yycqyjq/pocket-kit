/**
 * Quoted-Printable 编解码（RFC 2045）
 * 邮件正文里中文常见这种写法：=E9=9A=8F=E8=BA=AB=E5=8C=A3
 */

import { utf8Bytes, bytesUtf8 } from './base64'

const HEX = '0123456789ABCDEF'

/** 哪些字节可以原样输出 */
function isLiteral(b) {
  // 33-60、62-126 是可打印字符（= 是 61，必须转义）
  return (b >= 33 && b <= 60) || (b >= 62 && b <= 126)
}

/**
 * 编码
 * @param {string} text
 * @param {object} opt { maxLine, softBreak }
 */
export function encodeQP(text, opt) {
  const o = Object.assign({ maxLine: 76, softBreak: true }, opt || {})
  const bytes = utf8Bytes(text)
  const parts = []

  for (const b of bytes) {
    if (b === 0x0d || b === 0x0a) {
      parts.push({ type: 'newline' })
      continue
    }
    if (b === 0x20 || b === 0x09) {
      // 空格与制表符可以原样，但如果落在行尾就必须转义 —— 这里先标记，排完行再处理
      parts.push({ type: 'space', ch: b === 0x20 ? ' ' : '\t' })
      continue
    }
    if (isLiteral(b)) {
      parts.push({ type: 'lit', ch: String.fromCharCode(b) })
      continue
    }
    parts.push({ type: 'hex', ch: '=' + HEX[(b >> 4) & 15] + HEX[b & 15] })
  }

  const lines = []
  let cur = ''
  const flushLine = () => {
    // 行尾的空格必须转义
    cur = cur.replace(/ $/, '=20').replace(/\t$/, '=09')
    lines.push(cur)
    cur = ''
  }

  for (const p of parts) {
    if (p.type === 'newline') {
      flushLine()
      continue
    }
    const piece = p.ch
    // 预留 1 字符给软换行的 =
    if (o.softBreak && cur.length + piece.length > o.maxLine - 1) {
      cur += '='
      lines.push(cur)
      cur = ''
    } else if (!o.softBreak && cur.length + piece.length > o.maxLine) {
      flushLine()
    }
    cur += piece
  }
  if (cur !== '' || !lines.length) flushLine()

  return {
    text: lines.join('\r\n'),
    lines: lines.length,
    bytes: bytes.length,
  }
}

/**
 * 解码
 * @param {string} text
 */
export function decodeQP(text) {
  let s = String(text)
  // 先去掉软换行：=(CRLF 或 LF)
  s = s.replace(/=\r?\n/g, '')
  const bytes = []
  let bad = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '=') {
      const hex = s.slice(i + 1, i + 3)
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16))
        i += 2
        continue
      }
      // 不完整的转义，原样保留 =
      bad++
      bytes.push(0x3d)
      continue
    }
    if (c === '\r') continue
    if (c === '\n') {
      bytes.push(0x0a)
      continue
    }
    const cp = c.codePointAt(0)
    if (cp < 128) {
      bytes.push(cp)
    } else {
      // 非 ASCII 原样出现（不符合规范，但现实中常见），按 UTF-8 展开
      for (const b of utf8Bytes(c)) bytes.push(b)
    }
  }
  return {
    text: bytesUtf8(bytes),
    bytes: bytes.length,
    badEscapes: bad,
  }
}

export const QP_SAMPLE = '=E9=9A=8F=E8=BA=AB=E5=8C=A3 =E5=B7=A5=E5=85=B7=E7=AE=B1=EF=BC=8C=E7=A6=BB=E7=BA=BF=E5=8F=AF=E7=94=A8=E3=80=82'

export const QP_NOTES = [
  '邮件协议早年只能传 7 位 ASCII，所以中文要先转成 =XX 这种十六进制写法。',
  '每行不超过 76 个字符，超了就在行尾放一个单独的 = 作为「软换行」，解码时会拼回去。',
  '空格和制表符可以原样写，但如果正好落在行尾就必须转义成 =20 / =09，否则会被沿途的邮件系统吃掉。',
  '它和 URL 的百分号编码长得很像，但用途不同：百分号编码是给 URL 用的，QP 是给邮件正文用的。',
]
