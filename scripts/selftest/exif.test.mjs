/**
 * exif.js 自测：手工构造最小 JPEG（带 APP1/Exif TIFF 块）与最小 PNG，
 * 外加格式嗅探 / 截断报错 / GPS 十进制换算。canvas 与选图流程不在此测。
 */
import { useUtils, makeTest } from './harness.mjs'

const E = await useUtils('exif')
const T = makeTest('exif')

/* ---------- 构造器 ---------- */

/** 上一版构造顺序不对，重写：先拼 TIFF，再包 Exif 头与段长度 */
function buildExifJpeg2() {
  const t = []
  const t8 = (x) => t.push(x & 0xff)
  const t16 = (x) => { t.push((x >> 8) & 0xff, x & 0xff) }
  const t16le = (x) => { t.push(x & 0xff, (x >> 8) & 0xff) }
  const t32le = (x) => { t.push(x & 0xff, (x >> 8) & 0xff, (x >> 16) & 0xff, (x >>> 24) & 0xff) }
  const tstr = (s) => { for (const ch of s) t.push(ch.charCodeAt(0) & 0xff) }
  tstr('II'); t8(0x2a); t8(0x00); t32le(8)
  t8(4); t8(0)
  t16le(0x010f); t16le(2); t32le(3); t8(0x50); t8(0x4b); t8(0); t8(0)          // Make 'PK'
  t16le(0x0110); t16le(2); t32le(9); t32le(62)                                  // Model 外置
  t16le(0x0112); t16le(3); t32le(1); t16le(1); t16(0)                             // Orientation 1
  t16le(0x0131); t16le(2); t32le(11); t32le(72)                                 // Software 外置
  t32le(0)
  tstr('Test Cam'); t8(0)                                                   // 62..70
  t8(0)                                                                     // 71 填充
  tstr('pocket-kit'); t8(0)                                                 // 72..82
  const tiff = Uint8Array.from(t)

  const payload = []
  const p16 = (x) => { payload.push((x >> 8) & 0xff, x & 0xff) }
  const pstr = (s) => { for (const ch of s) payload.push(ch.charCodeAt(0) & 0xff) }
  pstr('Exif\0\0')
  for (const x of tiff) payload.push(x)

  const out = [0xff, 0xd8, 0xff, 0xe1]
  const segLen = payload.length + 2
  out.push((segLen >> 8) & 0xff, segLen & 0xff)
  for (const x of payload) out.push(x)
  // SOF0：200 高 × 320 宽，1 分量
  out.push(0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0xc8, 0x01, 0x40, 0x01, 0x01, 0x22, 0x00)
  // SOS + 熵编码占位 + EOI
  out.push(0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x00, 0x00, 0xff, 0xd9)
  return Uint8Array.from(out)
}

/** 最小 PNG：IHDR + tEXt + IEND，CRC 按规范计算 */
function crc32(buf) {
  const table = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const x of buf) crc = table[(crc ^ x) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = data.length
  const body = []
  const typeBytes = []
  for (const ch of type) typeBytes.push(ch.charCodeAt(0))
  body.push((len >>> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff)
  for (const x of typeBytes) body.push(x)
  for (const x of data) body.push(x)
  const c = crc32(typeBytes.concat(data))
  body.push((c >>> 24) & 0xff, (c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff)
  return body
}
function buildPng() {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  const ihdr = [0, 0, 0, 2, 0, 0, 0, 2, 8, 2, 0, 0, 0]
  const text = []
  for (const ch of 'Comment\0hello pk') text.push(ch.charCodeAt(0) & 0xff)
  return Uint8Array.from(
    sig.concat(chunk('IHDR', ihdr), chunk('tEXt', text), chunk('IEND', []))
  )
}

/* ---------- JPEG / EXIF ---------- */
const meta = E.parseImageMeta(buildExifJpeg2())
T.eq('格式是 JPEG', meta.format, 'JPEG')
T.eq('支持解析', meta.supported, true)
T.eq('宽 320', meta.width, 320)
T.eq('高 200', meta.height, 200)
T.eq('带 EXIF', meta.hasExif, true)
T.ok('字节序 II', String(meta.byteOrder).indexOf('II') >= 0)
T.ok('字段不少于 4 条', meta.fieldCount >= 4)
const gj = JSON.stringify(meta.groups)
T.ok('Model 解出 Test Cam', gj.indexOf('Test Cam') >= 0)
T.ok('Software 解出 pocket-kit', gj.indexOf('pocket-kit') >= 0)
T.ok('Make 解出 PK', gj.indexOf('"PK"') >= 0 || gj.indexOf('= PK') >= 0 || gj.indexOf('PK') >= 0)
T.ok('方向值 1 讲成 正常', gj.indexOf('正常') >= 0)
T.ok('fieldsToText 可导出', E.fieldsToText(meta).indexOf('Test Cam') >= 0)
T.eq('JPEG 段数量', meta.segments.length >= 5, true)

/* GPS 度分秒 → 十进制 */
const dec = E.dmsToDecimal([{ num: 39, den: 1, val: 39 }, { num: 54, den: 1, val: 54 }, { num: 30, den: 1, val: 30 }], 'N')
T.eq('北纬 39°54′30″', Number(dec.toFixed(4)), 39.9083)
const decW = E.dmsToDecimal([{ num: 39, den: 1, val: 39 }, { num: 54, den: 1, val: 54 }, { num: 30, den: 1, val: 30 }], 'W')
T.eq('西经取负', Number(decW.toFixed(4)), -39.9083)

/* 方向表 */
T.eq('方向 6 = 顺时针 90°', E.ORIENTATIONS[6].rotate, 90)

/* PNG */
const png = E.parseImageMeta(buildPng())
T.eq('PNG 格式', png.format, 'PNG')
T.eq('PNG 宽', png.width, 2)
T.eq('PNG 高', png.height, 2)
T.ok('tEXt 解出 hello pk', JSON.stringify(png.groups || png.fields || {}).indexOf('hello pk') >= 0)

/* 嗅探与容错 */
const gif = E.parseImageMeta(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2, 3, 4]))
T.eq('GIF 走不支持分支', gif.supported, false)
T.eq('GIF 仍给出格式名', gif.format, 'GIF')
T.throws('乱码头部报错', () => E.parseImageMeta(Uint8Array.from([1, 2, 3, 4])), /认不出/)
T.throws('只有 SOI 太短', () => E.parseImageMeta(Uint8Array.from([0xff, 0xd8])), /字节太少/)
T.throws('APP1 段长度撒谎', () => E.parseImageMeta(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00])), /撒谎/)

T.done()
