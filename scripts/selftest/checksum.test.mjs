/**
 * checksum.js 自测：官方已知值 + 自带 selfTest + 输入模式与格式化
 */
import { useUtils, makeTest } from './harness.mjs'

const C = await useUtils('checksum')
const T = makeTest('checksum')

/* 官方已知值（与文件内 EXPECTED 表同源，独立再断言一遍） */
T.eq('crc8 check', C.checksum('crc8', C.CHECK_TEXT).hex, 'f4')
T.eq('crc16-ccitt check', C.checksum('crc16-ccitt', C.CHECK_TEXT).hex, '29b1')
T.eq('crc16-xmodem check', C.checksum('crc16-xmodem', C.CHECK_TEXT).hex, '31c3')
T.eq('crc32 check', C.checksum('crc32', C.CHECK_TEXT).hex, 'cbf43926')
T.eq('crc32 空串', C.checksum('crc32', C.hexToBytes('')).hex, '00000000')
T.eq('adler32 abc', C.checksum('adler32', 'abc').hex, '024d0127')
T.eq('adler32 Wikipedia', C.checksum('adler32', 'Wikipedia').hex, '11e60398')
T.eq('adler32 空串', C.checksum('adler32', C.hexToBytes('')).hex, '00000001')
T.eq('fnv1a32 空串（offset basis）', C.checksum('fnv1a32', C.hexToBytes('')).hex, '811c9dc5')
T.eq('fnv1a32 a', C.checksum('fnv1a32', 'a').hex, 'e40c292c')
T.eq('fnv1a64 空串（offset basis）', C.checksum('fnv1a64', C.hexToBytes('')).hex, 'cbf29ce484222325')
T.eq('fnv1a64 a', C.checksum('fnv1a64', 'a').hex, 'af63dc4c8601ec8c')

/* 内置 selfTest：13 行全过（含 64 位降级路径交叉验证） */
const st = C.selfTest()
T.eq('selfTest 全过', st.ok, true)
T.ok('selfTest 行数', st.total === 13 && st.passed === 13)

/* 64 位两条实现一致（多字节中文） */
const zh = Uint8Array.from([0xe9, 0x9a, 0x8f, 0xe8, 0xba, 0xab, 0xe5, 0x8c, 0x9c]) // 随身匣
T.eq('fnv1a64 软硬一致（中文）', C.fnv1a64(zh, true), C.fnv1a64(zh))

/* 十进制换算：FNV-64 offset basis 的十进制是公开常数 */
T.eq('bigintHexToDec', C.bigintHexToDec('cbf29ce484222325'), '14695981039346656037')

/* 输入模式 */
T.eq('hex 模式带分隔', Array.from(C.readInput('50 4e:47-0a', 'hex')), [0x50, 0x4e, 0x47, 0x0a])
T.eq('dec 模式', Array.from(C.readInput('72 101 108', 'dec')), [72, 101, 108])
T.eq('utf8 模式', Array.from(C.readInput('ok', 'utf8')), [111, 107])

/* 报错文案面向用户 */
T.throws('hex 非法字符', () => C.hexToBytes('de ad zz'), /非法字符/)
T.throws('hex 奇数位', () => C.hexToBytes('abc'), /奇数/)
T.throws('dec 越界', () => C.decToBytes('300'), /0~255/)

/* 一次算全部 */
const all = C.checksumAll('123456789', 'utf8')
T.eq('算法数量', all.length, 7)
T.ok('全部成功', all.every((r) => r.ok))
T.eq('all 里的 crc32', all.filter((r) => r.key === 'crc32')[0].hex, 'cbf43926')

/* 展示格式 */
T.eq('groupHex 空格', C.groupHex('cbf43926'), 'CB F4 39 26')
T.eq('groupHex 自定分隔', C.groupHex('deadbeef', '-'), 'DE-AD-BE-EF')
T.eq('hexByteLen', C.hexByteLen('cbf43926'), 4)

T.done()
