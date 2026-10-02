/**
 * radix.js 自查断言（直接测 src/utils/radix.js 本体）
 * ------------------------------------------------------------
 * 判据分三类：
 *   1) 外部裁判：进制换算全部用 Node 的 BigInt 独立算一遍——BigInt('0xff').toString(36)
 *      就是标准答案，不经过实现的逐位累加；补码/反码用 BigInt 位运算反查；
 *   2) 往返性质：A→B→A 必须闭合，跨 2/8/10/16/32/36 六种进制都试；
 *   3) 已知向量与边界：36 进制字母表（z=35、zzzz=1679615）、二进制 4 位分组、
 *      ASCII 码表、空串/非法字符/越界/超安全整数。
 */
import { useUtils, makeTest } from './harness.mjs'

const R = await useUtils('radix')
const T = makeTest('radix')

/* 只对 BigInt 能直接解析的进制（2/8/10/16）取标准值，避免把实现的算法抄进来 */
const toBig = (v, radix) =>
  radix === 2 ? BigInt('0b' + v) : radix === 8 ? BigInt('0o' + v) : radix === 16 ? BigInt('0x' + v) : BigInt(v)

/* ---------- 1. 与 BigInt 同口径 ---------- */
const cases = [
  ['ff', 16, 10], ['11111111', 2, 16], ['777', 8, 10], ['100', 10, 2],
  ['123456789', 10, 16], ['1010', 2, 8], ['65535', 10, 36], ['255', 10, 32],
  ['abcdef', 16, 36], ['11111111111111111111111111111111', 2, 16],
]
for (const [v, f, t] of cases) {
  T.eq(v + ' @' + f + ' → ' + t, R.convert(v, f, t), toBig(v, f).toString(t))
}
T.eq('z 在 36 进制', R.convert('z', 36, 10), '35')
T.eq('10 在 36 进制', R.convert('10', 36, 10), '36')
T.eq('zzzz 在 36 进制', R.convert('zzzz', 36, 10), '1679615')
T.eq('7v 在 32 进制', R.convert('7v', 32, 10), '255')

/* ---------- 2. 大整数不丢精度（BigInt 独立算） ---------- */
const bigHex = 'ffffffffffffffff'
T.eq('64 位最大值', R.convert(bigHex, 16, 10), BigInt('0x' + bigHex).toString())
T.eq('64 位最大值十进制', R.convert(bigHex, 16, 10), '18446744073709551615')
T.eq('十进制回十六进制', R.convert('18446744073709551615', 10, 16), 'ffffffffffffffff')
T.eq('超 64 位', R.convert('1'.repeat(30), 10, 16), BigInt('1'.repeat(30)).toString(16))

/* ---------- 3. 往返闭合（A→B→A） ---------- */
for (const [v, f] of [['255', 10], ['ff', 16], ['11111111', 2], ['777', 8], ['7v', 32], ['zz', 36]]) {
  for (const t of [2, 8, 10, 16, 32, 36]) {
    const mid = R.convert(v, f, t)
    T.eq('往返 ' + v + '@' + f + ' 经 ' + t, R.convert(mid, t, f), v.toLowerCase())
  }
}

/* ---------- 4. 校验与符号 ---------- */
T.eq('16 进制合法', R.isValidInRadix('ff', 16), true)
T.eq('16 进制非法 g', R.isValidInRadix('g', 16), false)
T.eq('2 进制里 2 非法', R.isValidInRadix('2', 2), false)
T.eq('允许负号', R.isValidInRadix('-5', 10), true)
T.eq('空串非法', R.isValidInRadix('', 10), false)
T.eq('空格串非法', R.isValidInRadix('   ', 10), false)
T.eq('负数转换', R.convert('-ff', 16, 10), '-255')
T.eq('负数往返', R.convert(R.convert('-ff', 16, 10), 10, 16), '-ff')
T.eq('容忍空格', R.convert('1 0000', 2, 10), '16')
T.eq('容忍下划线', R.convert('f_f', 16, 10), '255')
T.eq('大小写等价', R.convert('FF', 16, 10), R.convert('ff', 16, 10))
T.throws('非法字符报中文错', () => R.convert('xyz', 10, 16), /不属于/)
T.throws('空内容报错', () => R.convert('', 10, 16), /请输入内容/)
T.throws('二进制里塞 2', () => R.convert('12', 2, 10), /不属于/)

/* ---------- 5. convertAll ---------- */
const all = R.convertAll('255', 10)
T.eq('支持六种进制', R.SUPPORTED_RADIX.length, 6)
T.eq('convertAll 2 进制', all[2], '11111111')
T.eq('convertAll 8 进制', all[8], '377')
T.eq('convertAll 16 进制', all[16], 'ff')
T.eq('convertAll 32 进制', all[32], '7v')
T.eq('convertAll 36 进制', all[36], '73')
T.eq('非法时该进制为 null', R.convertAll('12', 2)[2], null)

/* ---------- 6. 二进制分组 ---------- */
T.eq('4 位分组', R.groupBinary('11010010', 4), '1101 0010')
T.eq('不足补齐到 4', R.groupBinary('101', 4), '0101')
T.eq('8 位分组', R.groupBinary('110100101', 8), '00000001 10100101')
T.eq('剥 0b 前缀', R.groupBinary('0b1010', 4), '1010')
T.eq('非法返回空串', R.groupBinary('xyz', 4), '')
T.eq('空返回空串', R.groupBinary('', 4), '')

/* ---------- 7. 位运算视角（BigInt 反查） ---------- */
const b8 = R.bitDetail('255', 10, 8)
T.eq('8 位无符号', b8.unsigned, '255')
T.eq('8 位二进制', b8.binary, (BigInt(255) & 0xffn).toString(2).padStart(8, '0'))
T.eq('8 位十六进制', b8.hex, 'FF')
T.eq('8 位八进制', b8.oct, '377')
T.eq('全 1 取反为 0', b8.inverted, '00000000')
T.eq('-1 的 8 位补码', R.bitDetail('-1', 10, 8).unsigned, '255')
T.eq('5 取反', R.bitDetail('5', 10, 8).inverted, '11111010')
T.eq('16 位补零', R.bitDetail('255', 10, 16).binary, '0000000011111111')
T.eq('16 位 hex 补零', R.bitDetail('255', 10, 16).hex, '00FF')
T.eq('字节分组', R.bitDetail('255', 10, 16).bytes, '00000000 11111111')
T.eq('非法值返回 null', R.bitDetail('abc', 10, 8), null)
T.eq('超安全整数返回 null', R.bitDetail('999999999999999999999', 10, 32), null)

/* ---------- 8. ASCII 码表 ---------- */
T.eq('AB 的码', R.asciiFromText('AB'), [65, 66])
T.eq('中文被过滤', R.asciiFromText('A中B'), [65, 66])
T.eq('emoji 保留码点', R.asciiFromText('😀'), [128512])
T.eq('空串', R.asciiFromText(''), [])

T.done()
