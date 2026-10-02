/**
 * table.js 自查断言（直接测 src/utils/table.js 本体）
 * ------------------------------------------------------------
 * 判据分四类：
 *   1) 外部裁判：全角宽度用「一个汉字占 2 列」这一终端事实核对——纯 ASCII 表的列
 *      对齐等价于按空格补齐到同一长度，用 indexOf 的落点独立验，不抄实现；
 *   2) 往返性质：alignTable 返回的 data 二维数组与输入单元格逐格一致；Markdown 表
 *      的单元格转义后仍能被 | 安全切回；分隔行的对齐方向与 alignTable.aligns 同结论；
 *   3) 已知向量：SAMPLE_TABLE 的 5 行 4 列、stars 数字列右对齐、name 列左对齐；
 *   4) 边界与反例：空输入、引号包裹、双空格分隔、超宽截断、border 画框。
 */
import { useUtils, makeTest } from './harness.mjs'

const Tb = await useUtils('table')
const T = makeTest('table')

/* ---------- 1. 分隔符猜测 ---------- */
T.eq('逗号', Tb.guessDelimiter('a,b,c'), ',')
T.eq('制表符优先', Tb.guessDelimiter('a\tb'), '\t')
T.eq('分号', Tb.guessDelimiter('a;b;c'), ';')
T.eq('竖线', Tb.guessDelimiter('a|b|c'), '|')
T.eq('单空格', Tb.guessDelimiter('a b'), ' ')
T.eq('连续空格返回 null', Tb.guessDelimiter('a  b'), null)
T.eq('空串按单空格', Tb.guessDelimiter(''), ' ')

/* ---------- 2. 纯 ASCII 对齐（可逐字符验） ---------- */
const t1 = Tb.alignTable('name,stars\nA,128\nBB,9', { header: true })
T.eq('行数', t1.rows, 3)
T.eq('列数', t1.cols, 2)
T.eq('列宽', t1.widths.join(','), '4,5')
T.eq('数字列右对齐', t1.aligns[1], 'right')
T.eq('文本列左对齐', t1.aligns[0], 'left')
const lines1 = t1.text.split('\n')
T.eq('三行数据 + 分隔行', lines1.length, 4)
T.eq('表头行', lines1[0], 'name  stars')
T.eq('分隔行长度对齐列宽', lines1[1], '----  -----')
T.ok('128 落在右对齐列', lines1[2].indexOf('128') === t1.widths[0] + 2 + (t1.widths[1] - 3))
T.ok('9 落在右对齐列尾', lines1[3].indexOf('9') === t1.widths[0] + 2 + (t1.widths[1] - 1))

/* ---------- 3. CJK 宽度（汉字占 2 列） ---------- */
const t2 = Tb.alignTable('名称,数量\n中文,1', { header: true })
T.eq('CJK 列宽', t2.widths.join(','), '4,4')
T.eq('CJK 数字列右对齐', t2.aligns[1], 'right')
T.eq('CJK 表头行', t2.text.split('\n')[0], '名称  数量')

/* ---------- 4. 引号与 data ---------- */
const t3 = Tb.alignTable('a,b\n"x,y",z', { delimiter: ',' })
T.eq('引号内逗号不分列', JSON.stringify(t3.data[1]), '["x,y","z"]')
T.eq('列数仍为 2', t3.cols, 2)
T.eq('data 第一行', JSON.stringify(t3.data[0]), '["a","b"]')

/* ---------- 5. SAMPLE_TABLE 已知向量 ---------- */
const s = Tb.alignTable(Tb.SAMPLE_TABLE)
T.eq('样例 5 行', s.rows, 5)
T.eq('样例 4 列', s.cols, 4)
T.eq('分隔符是逗号', s.delimiter, ',')
T.eq('stars 列右对齐', s.aligns[2], 'right')
T.eq('name 列左对齐', s.aligns[0], 'left')
T.ok('每行补齐到 4 列', s.data.every((r) => r.length === 4))
T.ok('所有列宽 ≤ 40', s.widths.every((w) => w <= 40))
T.ok('渲染 6 行（表头+分隔+4 行）', s.text.split('\n').length === 6)
T.ok('没有 undefined 字样', s.text.indexOf('undefined') === -1)
T.ok('没有 NaN 字样', s.text.indexOf('NaN') === -1)

/* ---------- 6. border 画框 ---------- */
const bl = Tb.alignTable('a,b\n1,2', { border: true, header: true, align: 'left' }).text.split('\n')
T.eq('画框 5 行', bl.length, 5)
T.ok('顶框', bl[0].startsWith('┌') && bl[0].endsWith('┐'))
T.ok('表头分隔', bl[2].startsWith('├') && bl[2].indexOf('┼') > -1)
T.ok('底框', bl[4].startsWith('└') && bl[4].endsWith('┘'))
T.ok('竖线包裹', bl[1].startsWith('│ ') && bl[1].endsWith(' │'))

/* ---------- 7. header / align / delimiter 选项 ---------- */
const t5 = Tb.alignTable('1,2\n3,4', { header: false })
T.eq('无表头则无分隔行', t5.text.split('\n').length, 2)
T.ok('无表头不出现 ---', t5.text.indexOf('---') === -1)
T.eq('无表头数字列右对齐', t5.aligns[0], 'right')
T.eq('显式分隔符', Tb.alignTable('a;b\n1;2', { delimiter: ';' }).cols, 2)
T.eq('显式右对齐', Tb.alignTable('a\n1', { align: 'right', header: false }).text, 'a\n1')
T.eq('行尾不留空格', Tb.alignTable('a,b\n1,2', { header: false, align: 'left' }).text.split('\n').every((l) => l === l.replace(/\s+$/, '')), true)

/* ---------- 8. 截断 ---------- */
const t6 = Tb.alignTable('a\n' + 'x'.repeat(50), { header: false })
T.eq('默认 maxWidth 40', t6.widths[0], 40)
T.eq('截断保留 39 个 x + 省略号', (t6.text.match(/x/g) || []).length, 39)
T.ok('带省略号', t6.text.indexOf('…') > -1)
const t7 = Tb.alignTable('a\n' + 'x'.repeat(50), { header: false, maxWidth: 10 })
T.eq('maxWidth 10', t7.widths[0], 10)
T.eq('截断到 9 个 x', (t7.text.match(/x/g) || []).length, 9)

/* ---------- 9. 连续空格 / 制表符标识 ---------- */
const t8 = Tb.alignTable('a  b\n1  2')
T.eq('连续空格标识', t8.delimiter, '连续空格')
T.eq('连续空格列数', t8.cols, 2)
T.eq('制表符标识', Tb.alignTable('a\tb\n1\t2').delimiter, '制表符')

/* ---------- 10. Markdown 表 ---------- */
const ml = Tb.toMarkdownTable(Tb.SAMPLE_TABLE).split('\n')
T.eq('md 行数', ml.length, 6)
T.ok('每行以 | 开头结尾', ml.every((l) => l.startsWith('| ') && l.endsWith(' |')))
T.eq('md 列数（管道数）', (ml[0].match(/\|/g) || []).length, 5)
T.ok('数字列用 ---: 表右对齐', ml[1].indexOf('---:') > -1)
T.ok('文本列用 --- 表左对齐', ml[1].indexOf('---') > -1)
T.eq('md 转义竖线', Tb.toMarkdownTable('a,b\nx|y,z', { delimiter: ',' }).indexOf('x\\|y') > -1, true)
const mdNoHeader = Tb.toMarkdownTable('1,2\n3,4', { header: false })
T.eq('md 无表头仍补空表头', mdNoHeader.split('\n').length, 4)
T.eq('md 无表头数据全保留', mdNoHeader.indexOf('| 1 | 2 |') > -1 && mdNoHeader.indexOf('| 3 | 4 |') > -1, true)
T.ok('md 不做等宽填充', Tb.toMarkdownTable(Tb.SAMPLE_TABLE).split('\n').every((l) => l === l.trim()))

/* ---------- 11. 反例 ---------- */
T.throws('空输入', () => Tb.alignTable(''), /请粘贴/)
T.throws('全空白', () => Tb.alignTable('   '), /请粘贴/)
T.throws('换行空白', () => Tb.alignTable('\n\n'), /请粘贴/)

T.done()
