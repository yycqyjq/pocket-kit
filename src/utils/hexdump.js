/**
 * 十六进制与转储视图
 * 文本 ↔ 十六进制 ↔ hexdump 三向转换
 */
import { utf8Bytes, bytesUtf8, bytesToHex } from './base64'

const HEX = '0123456789abcdef'

function stripHex(input) {
  return String(input)
    .replace(/0x/gi, ' ')
    .replace(/[^0-9a-fA-F]/g, '')
}

/** 文本 → 十六进制 */
export function textToHex(text, opt) {
  const o = Object.assign({ sep: ' ', upper: false, prefix: false }, opt || {})
  const bytes = utf8Bytes(text)
  let s = bytesToHex(bytes, o.sep)
  if (o.upper) s = s.toUpperCase()
  if (o.prefix) {
    s = s
      .split(o.sep || '')
      .map((x) => (x ? '0x' + x : x))
      .join(o.sep || '')
  }
  return { text: s, bytes: bytes.length }
}

/** 十六进制 → 文本 */
export function hexToText(hex) {
  let s = stripHex(hex)
  if (!s) throw new Error('没有找到十六进制内容')
  // 奇数位凑不成完整字节，丢掉最后半个并告知
  const dropped = s.length % 2
  if (dropped) s = s.slice(0, -1)
  if (!s) return { text: '', bytes: 0, dropped }
  const bytes = []
  for (let i = 0; i < s.length; i += 2) bytes.push(parseInt(s.slice(i, i + 2), 16))
  return { text: bytesUtf8(bytes), bytes: bytes.length, dropped }
}

/**
 * 生成 hexdump 视图
 * @param {string|Uint8Array} input
 * @param {object} opt { width, offset, group, ascii }
 */
export function hexdump(input, opt) {
  const o = Object.assign({ width: 16, offset: true, group: 8, ascii: true }, opt || {})
  const bytes = typeof input === 'string' ? utf8Bytes(input) : input
  if (!bytes.length) throw new Error('没有可转储的内容')
  const w = Math.min(32, Math.max(8, Number(o.width) || 16))

  const lines = []
  for (let i = 0; i < bytes.length; i += w) {
    const chunk = bytes.slice(i, i + w)
    const parts = []
    const asciiChars = []
    for (let k = 0; k < w; k++) {
      if (k < chunk.length) {
        parts.push(HEX[(chunk[k] >> 4) & 15] + HEX[chunk[k] & 15])
        const b = chunk[k]
        asciiChars.push(b >= 32 && b < 127 ? String.fromCharCode(b) : '.')
      } else {
        parts.push('  ')
        asciiChars.push(' ')
      }
    }
    // 分组更方便读
    const g = Number(o.group) || 8
    const hexStr = parts
      .map((p, idx) => (idx > 0 && idx % g === 0 ? ' ' + p : p))
      .join(' ')
    let line = ''
    if (o.offset) line += i.toString(16).padStart(8, '0') + '  '
    line += hexStr
    if (o.ascii) line += '  |' + asciiChars.join('') + '|'
    lines.push(line)
  }
  return { text: lines.join('\n'), lines: lines.length, bytes: bytes.length, width: w }
}

/** 从 hexdump 视图里把字节读回来 */
export function fromHexdump(dumpText) {
  const lines = String(dumpText).split(/\r?\n/)
  const bytes = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    // 去掉行首的偏移量（8 位十六进制 + 空格）
    let body = t.replace(/^[0-9a-fA-F]{4,8}\s+/, '')
    // 去掉尾部的 |...| ASCII 列
    body = body.replace(/\|[^|]*\|?\s*$/, '')
    // 只保留形如「两个十六进制字符」的 token，跳过偏移与 ASCII
    const tokens = body.split(/\s+/).filter((x) => /^[0-9a-fA-F]{2}$/.test(x))
    for (const tk of tokens) bytes.push(parseInt(tk, 16))
  }
  if (!bytes.length) throw new Error('没从这段内容里认出 hexdump 格式')
  return { text: bytesUtf8(bytes), bytes: bytes.length }
}

/** 常见字节序列的说明，帮助对照 */
export const BYTE_NOTES = [
  { hex: 'EF BB BF', name: 'UTF-8 BOM', note: '文件开头多出来的三个字节，常导致第一行解析出错' },
  { hex: 'E5 8C A3', name: '「匣」的 UTF-8', note: '一个汉字占 3 字节' },
  { hex: '0A', name: 'LF', note: 'Unix / macOS 换行' },
  { hex: '0D 0A', name: 'CRLF', note: 'Windows 换行；跨平台复制粘贴时常见' },
  { hex: '0D', name: 'CR', note: '老 Mac（OS 9 以前）换行' },
  { hex: 'E2 80 8B', name: '零宽空格', note: '看不见，但会让字符串比对不相等' },
  { hex: 'C2 A0', name: '不换行空格', note: '长得像空格，但不是空格，正则 \\s 有时匹配不到' },
  { hex: 'F0 9F 98 80', name: '😀', note: 'Emoji 占 4 字节，UTF-16 里要两个码元' },
]

export const HEX_SAMPLE = '随身匣 PocketKit'
