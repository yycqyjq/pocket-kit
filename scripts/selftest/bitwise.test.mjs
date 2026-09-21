/**
 * bitwise.js 自测：内置 selfCheck + 解析/回绕/运算/补码/掩码/位段/位计数
 */
import { useUtils, makeTest } from './harness.mjs'

const B = await useUtils('bitwise')
const T = makeTest('bitwise')

/* 内置自检全过（14 行，含 64 位） */
const sc = B.selfCheck()
T.eq('selfCheck 行数', sc.length, 14)
T.ok('selfCheck 全过', sc.every((r) => r.pass))

/* 解析与回绕 */
const p255 = B.parseValue('255', 8)
T.eq('255 无符号', p255.unsigned, '255')
T.eq('255 有符号读法', p255.signed, '-1')
T.eq('255 十六进制', p255.hex, '0xFF')
T.eq('255 分组二进制', p255.binGrouped, '1111 1111')
const p256 = B.parseValue('256', 8)
T.eq('256 溢出回绕到 0', p256.unsigned, '0')
T.eq('256 标记溢出', p256.exact, false)
T.ok('溢出说明提到回绕', String(p256.note).indexOf('回绕') >= 0)
T.eq('-1 的 8 位形状', B.parseValue('-1', 8).unsigned, '255')
T.eq('0x0f 解析', B.parseValue('0x0f', 8).unsigned, '15')

/* 自动挑位宽 */
T.eq('pickWidth 255', B.pickWidth('255'), 8)
T.eq('pickWidth 256', B.pickWidth('256'), 16)
T.eq('pickWidth 65535', B.pickWidth('65535'), 16)
T.eq('pickWidth 65536', B.pickWidth('65536'), 32)
T.eq('pickWidth -128', B.pickWidth('-128'), 8)
T.eq('pickWidth -129', B.pickWidth('-129'), 16)

/* 位网格 */
T.eq('bitsOf 0b1010', B.bitsOf('0b1010', 8), [0, 0, 0, 0, 1, 0, 1, 0])
T.eq('fromBits 170', B.fromBits([1, 0, 1, 0, 1, 0, 1, 0], 8), '170')
T.eq('fromBitsSigned -86', B.fromBitsSigned([1, 0, 1, 0, 1, 0, 1, 0], 8), '-86')
const flipped = B.flipBit(B.bitsOf('0x0f', 8), 0)
T.eq('翻转最高位', B.fromBits(flipped, 8), '143')
T.eq('flipBit 不动原数组', B.fromBits(B.bitsOf('0x0f', 8), 8), '15')
T.eq('bitIndexOf 左端', B.bitIndexOf(8, 0), 7)
T.eq('bitIndexOf 右端', B.bitIndexOf(8, 7), 0)

/* 13 种运算（B=10 时的逻辑组） */
const r = {}
B.ops('0b1100', '0b1010', 8).forEach((x) => { r[x.key] = x })
T.eq('AND', r.and.unsigned, '8')
T.eq('OR', r.or.unsigned, '14')
T.eq('XOR', r.xor.unsigned, '6')
T.eq('ANDNOT 清位', r.andnot.unsigned, '4')
T.eq('NOT 无符号', r.not.unsigned, '243')
T.eq('NOT 有符号', r.not.signed, '-13')
T.eq('移位量饱和按全移出', r.shl.unsigned, '0')
T.ok('饱和提示', String(r.shl.shiftNote).indexOf('全部移出') >= 0)

/* 移位与循环（B=1） */
const r2 = {}
B.ops('0b0001', '1', 8).forEach((x) => { r2[x.key] = x })
T.eq('左移 1 位', r2.shl.unsigned, '2')
T.eq('循环左移 1 位', r2.rol.unsigned, '2')
T.eq('循环右移 1 位', r2.ror.unsigned, '128')
const r3 = {}
B.ops('0b10000000', '1', 8).forEach((x) => { r3[x.key] = x })
T.eq('算术右移补符号', r3.shr.unsigned, '192')
T.eq('逻辑右移补零', r3.shrl.unsigned, '64')

/* 补码三步 */
const tc = B.twosComplement('-5', 8)
T.eq('-5 补码形状', tc.hex, '0xFB')
T.eq('-5 是负数', tc.negative, true)
T.eq('-5 绝对值', tc.absolute, '5')
T.eq('负数走四步', tc.steps.length, 4)
T.eq('首步是绝对值', tc.steps[0].k, '绝对值')
const tp = B.twosComplement('5', 8)
T.eq('正数补码三步合一', tp.steps.length, 3)
T.eq('正数补码形状', tp.hex, '0x05')

/* 掩码与位段 */
T.eq('掩码 7..4', B.maskBits(7, 4, 8).unsigned, '240')
T.eq('掩码 hex', B.maskBits(7, 4, 8).hex, '0xF0')
T.eq('低 12 位掩码', B.maskOf(12, 16).hex, '0x0FFF')
T.eq('抽 11..8 位', B.extract('0xABCD', 11, 8, 16).unsigned, '11')
T.eq('抽 15..12 位', B.extract('0xABCD', 15, 12, 16).hex, '0xA')

/* 位计数 */
T.eq('popcount 0xFF', B.popcount('0xFF', 8), 8)
T.eq('popcount 0b1010', B.popcount('0b1010', 8), 2)
T.eq('前导零', B.leadingZeros('0x01', 8), 7)
T.eq('最低置位位', B.lowestSetBit('0b1000', 8), 3)
T.eq('最低置位位 0b0110', B.lowestSetBit('0b0110', 8), 1)
T.eq('最高置位位', B.highestSetBit('0b1000', 8), 3)
T.eq('2 的幂判定', B.isPowerOfTwo('128', 8), true)
T.eq('非 2 的幂', B.isPowerOfTwo('100', 8), false)
T.eq('0 不是 2 的幂', B.isPowerOfTwo('0', 8), false)

/* 位特征汇总 */
const bp = B.bitProfile('0x5AA5', 16)
T.eq('1 的个数', bp.ones, 8)
T.eq('字节分组', bp.bytes, '5A A5')
T.eq('最高置位位号', bp.highestSet, 14)
T.eq('尾随零', bp.ctz, 0)
T.eq('不是 2 的幂', bp.isPowerOfTwo, false)

T.done()
