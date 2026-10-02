/**
 * diff.js 自查断言（直接测 src/utils/diff.js 本体）
 * ------------------------------------------------------------
 * 判据分四类，外部来源如下：
 *   1) 手算小样例：三五行、能一眼看出增删改的文本，行类型序列、行号、similarity 都手算写死，
 *      不抄实现。例：'a\nb\nc' vs 'a\nx\nc' → same/del/add/same，similarity = round(2/3·1000)/10 = 66.7。
 *   2) 重构性质（最强判据）：把 same+del 的行按序拼回去必须等于原文 a，same+add 拼回去必须等于 b。
 *      这条对任意输入都成立，且与实现细节无关，能抓住「吞行/多行/错位」这类 bug。
 *   3) 对称与自洽：LCS 对称 → 交换入参后 same 不变、del 与 add 互换；自身比较为全 same、similarity 100；
 *      CRLF 与 LF 应视为同一行内容（按行切分归一）。
 *   4) 边界与反例：空串、空 vs 有、大输入走截断保护（truncated）、代理对（emoji）按码点切、导出的 +/- 文本形状。
 */
import { useUtils, makeTest } from './harness.mjs'

const D = await useUtils('diff')
const T = makeTest('diff')

/* ---------- 1. 行级差异：手算小样例 ---------- */
const d1 = D.diffLines('a\nb\nc', 'a\nx\nc')
T.eq('diffLines 行类型', d1.rows.map((r) => r.type), ['same', 'del', 'add', 'same'])
T.eq('diffLines same', d1.stats.same, 2)
T.eq('diffLines del', d1.stats.del, 1)
T.eq('diffLines add', d1.stats.add, 1)
T.eq('diffLines similarity（手算 66.7）', d1.stats.similarity, 66.7)
T.eq('diffLines aLines', d1.stats.aLines, 3)
T.eq('diffLines bLines', d1.stats.bLines, 3)
T.eq('diffLines 行号对', d1.rows.map((r) => [r.aNo, r.bNo]), [[1, 1], [2, null], [null, 2], [3, 3]])
T.eq('diffLines truncated', d1.stats.truncated, false)

const same = D.diffLines('x\ny', 'x\ny')
T.eq('相同文本全 same', same.rows.every((r) => r.type === 'same'), true)
T.eq('相同文本 similarity 100', same.stats.similarity, 100)
T.eq('相同文本 del 0', same.stats.del, 0)
T.eq('相同文本 add 0', same.stats.add, 0)

const ins = D.diffLines('a\nb', 'a\nb\nc')
T.eq('末尾插入类型', ins.rows.map((r) => r.type), ['same', 'same', 'add'])
T.eq('末尾插入 add 行 aNo 为 null', ins.rows[2].aNo, null)
T.eq('末尾插入 add 行 bNo', ins.rows[2].bNo, 3)

const del = D.diffLines('a\nb\nc', 'a\nc')
T.eq('删除中间行类型', del.rows.map((r) => r.type), ['same', 'del', 'same'])
T.eq('删除中间行 del 行 bNo 为 null', del.rows[1].bNo, null)

const mid = D.diffLines('1\n2\n3\n4\n5', '1\n2\nX\n4\n5')
T.eq('中间替换 same', mid.stats.same, 4)
T.eq('中间替换 similarity（手算 80）', mid.stats.similarity, 80)

T.eq('空 vs 空 similarity 100', D.diffLines('', '').stats.similarity, 100)
T.eq('空 vs 空只有一行 same', D.diffLines('', '').rows.length, 1)
T.eq('CRLF 与 LF 视为同行', D.diffLines('a\r\nb', 'a\nb').stats.similarity, 100)
T.eq('CRLF 归一 same 2', D.diffLines('a\r\nb', 'a\nb').stats.same, 2)
T.calc('null/undefined 不抛', () => D.diffLines(null, undefined).stats.aLines, 1)

/* ---------- 2. 重构性质 + 对称 ---------- */
const pairs = [
  ['a\nb\nc', 'a\nx\nc'],
  ['1\n2\n3\n4\n5', '1\n2\nX\n4\n5'],
  ['a\nb', 'a\nb\nc'],
  ['a\nb\nc', 'a\nc'],
  ['foo\nbar\nbaz', 'foo\nqux\nbaz\nquux'],
  ['same', 'same'],
]
for (const [A, B] of pairs) {
  const r = D.diffLines(A, B)
  const aBack = r.rows.filter((x) => x.type !== 'add').map((x) => x.text).join('\n')
  const bBack = r.rows.filter((x) => x.type !== 'del').map((x) => x.text).join('\n')
  T.eq('重构 a ' + JSON.stringify(A), aBack, A)
  T.eq('重构 b ' + JSON.stringify(B), bBack, B)
  T.eq('对称 same ' + JSON.stringify(A), r.stats.same, D.diffLines(B, A).stats.same)
  T.eq('对称 del/add 互换 ' + JSON.stringify(A), r.stats.del === D.diffLines(B, A).stats.add && r.stats.add === D.diffLines(B, A).stats.del, true)
}

/* ---------- 3. 大输入走截断保护 ---------- */
const bigA = Array.from({ length: 1500 }, (_, i) => 'a' + i).join('\n')
const bigB = Array.from({ length: 1500 }, (_, i) => 'b' + i).join('\n')
const big = D.diffLines(bigA, bigB)
T.eq('大输入 truncated', big.stats.truncated, true)
T.eq('大输入 del 1500', big.stats.del, 1500)
T.eq('大输入 add 1500', big.stats.add, 1500)
T.eq('大输入 same 0', big.stats.same, 0)

/* ---------- 4. 字符级差异 ---------- */
T.eq('diffChars 单字符替换', D.diffChars('abc', 'abd').map((x) => x.type + ':' + x.text), ['same:ab', 'del:c', 'add:d'])
T.eq('diffChars 全同', D.diffChars('abc', 'abc').map((x) => x.type + ':' + x.text), ['same:abc'])
T.eq('diffChars 空 vs 字', D.diffChars('', 'x'), [{ type: 'add', text: 'x' }])
T.eq('diffChars 中文', D.diffChars('中文abc', '中文abd').map((x) => x.type + ':' + x.text), ['same:中文ab', 'del:c', 'add:d'])
T.eq('diffChars 代理对按码点切', D.diffChars('😀a', '😀b').map((x) => x.type + ':' + x.text), ['same:😀', 'del:a', 'add:b'])
T.eq('diffChars 大输入退化长度 2', D.diffChars('a'.repeat(300), 'b'.repeat(300)).length, 2)
T.eq('diffChars 大输入退化类型', D.diffChars('a'.repeat(300), 'b'.repeat(300)).map((x) => x.type), ['del', 'add'])
for (const [A, B] of [['abc', 'abd'], ['kitten', 'sitting'], ['中文测试', '中文考察'], ['abc', 'abc']]) {
  const r = D.diffChars(A, B)
  T.eq('diffChars 重构 a ' + A, r.filter((x) => x.type !== 'add').map((x) => x.text).join(''), A)
  T.eq('diffChars 重构 b ' + B, r.filter((x) => x.type !== 'del').map((x) => x.text).join(''), B)
}

/* ---------- 5. 导出文本 / UI 契约 ---------- */
T.eq('toUnified', D.toUnified(D.diffLines('a\nb', 'a\nc').rows), '  a\n- b\n+ c')
T.eq('toUnified 空数组', D.toUnified([]), '')
T.ok('toUnified 无 undefined/NaN', !/undefined|NaN/.test(D.toUnified(D.diffLines('a\nb', 'a\nc').rows)))
T.ok('行文本无 undefined/NaN', D.diffLines('a\nb', 'a\nc').rows.every((r) => !/undefined|NaN/.test(String(r.text))))
T.ok('similarity 落在 0~100', [d1, ins, del, mid, big].every((r) => r.stats.similarity >= 0 && r.stats.similarity <= 100))

T.done()
