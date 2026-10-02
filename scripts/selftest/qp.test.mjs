/**
 * qp.js 自查断言（直接测 src/utils/qp.js 本体）
 * ------------------------------------------------------------
 * 判据分三类：
 *   1) 外部裁判：字节层拿 Node 的 Buffer 当尺子——编码出来的 =E9=9A=8F... 必须等于
 *      Buffer.from('随','utf8') 的十六进制逐字节形式；文本层必须等于原字；
 *   2) 往返性质：encode→decode 必须回原值，且「文本 ↔ 字节 ↔ =XX」三层闭合，
 *      软换行（行尾单个 =）拼回后仍等于原文本；
 *   3) 已知向量与边界：RFC 2045 规定的每行 ≤76、软换行用 '='、行尾空格/制表符
 *      必须转义成 =20/=09、'=' 本身必须写成 =3D、畸形转义原样保留并计数。
 */
import { useUtils, makeTest } from './harness.mjs'

const Q = await useUtils('qp')
const T = makeTest('qp')

/* ---------- 1. 已知向量：模块自带示例 ---------- */
T.eq('QP_SAMPLE 解码', Q.decodeQP(Q.QP_SAMPLE).text, '随身匣 工具箱，离线可用。')
T.eq('QP_SAMPLE 字节数', Q.decodeQP(Q.QP_SAMPLE).bytes, Buffer.from('随身匣 工具箱，离线可用。', 'utf8').length)

/* ---------- 2. 三层闭合：=XX ↔ 字节 ↔ 文本 ---------- */
const zs = '随身匣'
const enc = Q.encodeQP(zs).text
const expectHex = Buffer.from(zs, 'utf8').toString('hex').toUpperCase()
T.eq('中文编码 = Buffer 十六进制的 =XX 形式', enc, '=' + (expectHex.match(/../g) || []).join('='))
T.eq('中文往返', Q.decodeQP(enc).text, zs)
T.eq('字节计数 = Buffer 长度', Q.encodeQP(zs).bytes, Buffer.from(zs, 'utf8').length)
T.eq('=XX 逐段解出字节', Q.decodeQP('=E4=B8=AD').text, '中')
T.eq('emoji 四字节编码', Q.encodeQP('😀').text, '=' + (Buffer.from('😀', 'utf8').toString('hex').toUpperCase().match(/../g) || []).join('='))

/* ---------- 3. 可打印 ASCII 原样，'=' 必须转义 ---------- */
T.eq('字母原样', Q.encodeQP('abc').text, 'abc')
T.eq('等号转义', Q.encodeQP('=').text, '=3D')
T.eq('等号夹在中间', Q.encodeQP('a=1').text, 'a=3D1')
T.eq('波浪号原样', Q.encodeQP('~').text, '~')
T.eq('空格不在行尾原样', Q.encodeQP('a b').text, 'a b')
T.eq('行尾空格转义', Q.encodeQP('a ').text, 'a=20')
T.eq('行尾制表符转义', Q.encodeQP('a\t').text, 'a=09')
T.eq('空文本', Q.encodeQP('').text, '')

/* ---------- 4. 行宽与软换行（RFC 2045：≤76） ---------- */
const long = Q.encodeQP('a'.repeat(80)).text
const lines = long.split('\r\n')
T.eq('软换行后两行', lines.length, 2)
T.ok('每行 ≤ 76', lines.every((l) => l.length <= 76))
T.eq('第一行 75 字符 + 软换行 =', lines[0], 'a'.repeat(75) + '=')
T.eq('解码拼回 80 个 a', Q.decodeQP(long).text, 'a'.repeat(80))
const noSoft = Q.encodeQP('a'.repeat(80), { softBreak: false }).text
T.ok('关闭软换行也 ≤ 76', noSoft.split('\r\n').every((l) => l.length <= 76))
T.eq('关闭软换行后两行', noSoft.split('\r\n').length, 2)
/* 注：softBreak=false 时实现用硬换行折行，而解码会把该换行当成正文换行，
   往返无法闭合——这是实现的问题，按规则不在此断言，记入报告。 */
T.ok('maxLine 可调', Q.encodeQP('a'.repeat(10), { maxLine: 5 }).text.split('\r\n').length > 1)

/* ---------- 5. 换行与往返 ---------- */
T.eq('换行编码成 CRLF', Q.encodeQP('a\nb').text, 'a\r\nb')
T.eq('换行往返', Q.decodeQP(Q.encodeQP('a\nb').text).text, 'a\nb')
T.eq('软换行还原', Q.decodeQP('abc=\ndef').text, 'abcdef')
T.eq('CRLF 软换行还原', Q.decodeQP('abc=\r\ndef').text, 'abcdef')
T.eq('裸 CR 被丢弃', Q.decodeQP('a\r\nb').text, 'a\nb')
T.eq('裸 LF 保留', Q.decodeQP('a\nb').text, 'a\nb')

/* ---------- 6. 综合往返 ---------- */
for (const s of ['', 'Hello, World!', '中文 abc 123 = +', 'a=b', '你好\n世界', '😀 emoji']) {
  T.eq('往返 ' + JSON.stringify(s), Q.decodeQP(Q.encodeQP(s).text).text, s)
}

/* ---------- 7. 畸形转义与说明 ---------- */
T.eq('畸形转义原样保留', Q.decodeQP('=XY').text, '=XY')
T.eq('畸形转义计数', Q.decodeQP('=XY').badEscapes, 1)
T.eq('半个转义计数', Q.decodeQP('=E').badEscapes, 1)
T.eq('合法转义不计数', Q.decodeQP('=E9').badEscapes, 0)
T.eq('非 ASCII 裸字按 UTF-8 展开', Q.decodeQP('中').text, '中')
T.eq('非 ASCII 裸字字节数', Q.decodeQP('中').bytes, 3)
T.eq('QP_NOTES 四条', Q.QP_NOTES.length, 4)
T.ok('QP_NOTES 讲清 76 与软换行', Q.QP_NOTES.some((n) => n.indexOf('76') > -1 && n.indexOf('软换行') > -1))
T.ok('QP_NOTES 讲清行尾空格转义', Q.QP_NOTES.some((n) => n.indexOf('=20') > -1 && n.indexOf('=09') > -1))

T.done()
