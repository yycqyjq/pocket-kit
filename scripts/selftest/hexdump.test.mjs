/**
 * hexdump.js 自查断言（直接测 src/utils/hexdump.js 本体）
 * ------------------------------------------------------------
 * 判据分三类：
 *   1) 外部裁判：文本↔十六进制一律拿 Node 的 Buffer.from(x,'utf8') 与
 *      Buffer 的十六进制/反解当尺子，不抄实现里的分隔与大小写；
 *   2) 往返性质：文本→hex→文本闭合；hex→文本→hex 收敛到同一串字节，
 *      0x 前缀、空格/冒号分隔、奇数位都要能处理；
 *   3) 已知向量与边界：经典 hexdump 分栏（8 位十六进制偏移 + 16 字节/行 + ASCII 栏）、
 *      BYTE_NOTES 里的字节序列必须与 Buffer 编出来的逐字节一致（BOM/emoji/零宽空格等）。
 */
import { useUtils, makeTest } from './harness.mjs'

const H = await useUtils('hexdump')
const T = makeTest('hexdump')

const buf = (s) => Buffer.from(s, 'utf8')
const bufHexLower = (s) => Array.from(buf(s)).map((b) => b.toString(16).padStart(2, '0')).join(' ')
const bufHexUpper = (s) => Array.from(buf(s)).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
const bare = (s) => Array.from(buf(s)).map((b) => b.toString(16).padStart(2, '0')).join('')

/* ---------- 1. textToHex 与 Buffer 同口径 ---------- */
T.eq('ASCII', H.textToHex('ABC').text, '41 42 43')
T.eq('CJK', H.textToHex('中').text, 'e4 b8 ad')
T.eq('emoji 四字节', H.textToHex('😀').text, 'f0 9f 98 80')
T.eq('长串与 Buffer 一致', H.textToHex('随身匣 PocketKit').text, bufHexLower('随身匣 PocketKit'))
T.eq('字节计数 = Buffer 长度', H.textToHex('中').bytes, buf('中').length)
T.eq('大写选项', H.textToHex('中', { upper: true }).text, 'E4 B8 AD')
T.eq('0x 前缀选项', H.textToHex('AB', { prefix: true }).text, '0x41 0x42')
T.eq('自定义分隔', H.textToHex('AB', { sep: '-' }).text, '41-42')
T.eq('空文本', H.textToHex('').text, '')
T.eq('空文本字节数', H.textToHex('').bytes, 0)

/* ---------- 2. hexToText 与 Buffer 反解 ---------- */
T.eq('空格分隔', H.hexToText('41 42 43').text, 'ABC')
T.eq('无分隔', H.hexToText('e4b8ad').text, '中')
T.eq('0x 前缀', H.hexToText('0x41 0x42').text, 'AB')
T.eq('冒号分隔', H.hexToText('41:42:43').text, 'ABC')
T.eq('字节计数', H.hexToText('414243').bytes, 3)
T.eq('丢弃奇数位并计数', H.hexToText('41424').dropped, 1)
T.eq('奇数位丢末位后仍是 AB', H.hexToText('41424').text, 'AB')
T.eq('偶数位不丢', H.hexToText('4142').dropped, 0)
T.eq('与 Buffer 反解一致', H.hexToText(bufHexLower('随身匣')).text, '随身匣')

/* ---------- 3. 往返闭合 ---------- */
for (const s of ['a', '中文', '😀', '随身匣 PocketKit', '=E9=9A=8F']) {
  T.eq('文本往返 ' + JSON.stringify(s), H.hexToText(H.textToHex(s).text).text, s)
}

/* ---------- 4. hexdump 经典分栏 ---------- */
const d = H.hexdump('AB')
T.eq('一行', d.lines, 1)
T.eq('默认宽度 16', d.width, 16)
T.eq('字节数', d.bytes, 2)
T.ok('8 位偏移开头', d.text.startsWith('00000000  '))
T.ok('十六进制栏', d.text.indexOf('41 42') > -1)
T.ok('ASCII 栏包竖线', /\|AB\s+\|$/.test(d.text))
T.eq('两行宽度 8', H.hexdump('123456789', { width: 8 }).lines, 2)
T.ok('第二行偏移 8', H.hexdump('123456789', { width: 8 }).text.split('\n')[1].startsWith('00000008'))
T.ok('非打印字节显示点', H.hexdump('中').text.indexOf('...') > -1)

/* ---------- 5. hexdump 与 Buffer 一致 ---------- */
const noOff = H.hexdump('AB', { offset: false, ascii: false }).text
T.eq('去掉偏移与 ASCII 只剩 hex', noOff.replace(/\s/g, ''), bare('AB'))
T.ok('无 ASCII 栏', H.hexdump('AB', { ascii: false }).text.indexOf('|') === -1)
T.eq('dump 的字节 = Buffer 字节', H.hexdump('随身匣', { offset: false, ascii: false }).text.replace(/\s/g, ''), bare('随身匣'))
T.eq('Uint8Array 入参', H.hexdump(new Uint8Array([0, 1, 2])).bytes, 3)
T.ok('0 显示为点', H.hexdump(new Uint8Array([0])).text.indexOf('|.') > -1)
T.eq('宽度下限夹到 8', H.hexdump('abc', { width: 4 }).width, 8)
T.eq('宽度上限夹到 32', H.hexdump('abc', { width: 100 }).width, 32)
T.eq('每行 16 字节', H.hexdump('a'.repeat(17)).lines, 2)
T.eq('17 字节', H.hexdump('a'.repeat(17)).bytes, 17)

/* ---------- 6. 反例与字节序列表 ---------- */
T.throws('空转储', () => H.hexdump(''), /没有可转储的内容/)
T.throws('空 hex', () => H.hexToText(''), /没有找到十六进制内容/)
T.throws('非 hex 输入', () => H.hexToText('zz'), /没有找到十六进制内容/)
T.ok('BYTE_NOTES 形状正确', H.BYTE_NOTES.every((b) => /^[0-9A-F ]+$/.test(b.hex) && b.name && b.note))
T.ok('BOM 表项与 Buffer 对上', H.BYTE_NOTES.some((b) => b.hex === bufHexUpper('\uFEFF')))
T.ok('emoji 表项与 Buffer 对上', H.BYTE_NOTES.some((b) => b.hex === bufHexUpper('😀')))
T.ok('零宽空格表项与 Buffer 对上', H.BYTE_NOTES.some((b) => b.hex === bufHexUpper('\u200b')))
T.ok('不换行空格表项与 Buffer 对上', H.BYTE_NOTES.some((b) => b.hex === bufHexUpper('\u00a0')))
T.ok('「匣」表项与 Buffer 对上', H.BYTE_NOTES.some((b) => b.hex === bufHexUpper('匣')))
T.eq('HEX_SAMPLE 是文本', typeof H.HEX_SAMPLE, 'string')

T.done()
