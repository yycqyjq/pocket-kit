/**
 * percent.js 自查断言（直接测 src/utils/percent.js 本体）
 * ------------------------------------------------------------
 * 判据分四类，外部来源如下：
 *   1) 手算已知值（核心）：每类场景都用小学算术独立算一遍再对撞。
 *      典型反直觉点：100→120 是 +20%，而 120→100 是 -16.67%（基数永远是「起始值/比字后面那个」），
 *      从 10% 到 15% 是 5 个百分点、但相对涨幅是 50% —— 这些必须由手算钉死，不能抄实现。
 *   2) 舍入独立复核：value 是未舍入原值、text 是舍入后的串；用「|parseFloat(text) - value| 落在半格内」
 *      这个与实现无关的性质来验，而不是重抄一遍 toFixed。
 *   3) 边界与反例：0、负数、分母/起始为 0、折扣越界、非数字、带千分位/百分号的输入都要按预期处理或抛中文错。
 *   4) UI 契约：界面直接印的 text/explain 不许含 undefined/NaN，百分比串形状要规整；预置场景的默认值必须都能算。
 */
import { useUtils, makeTest } from './harness.mjs'

const M = await useUtils('percent')
const T = makeTest('percent')

/* 舍入性质：text 的数值必须落在 value 的四舍五入半格内 */
const halfGrid = (text, value, digits) => Math.abs(parseFloat(text) - value) <= 0.5 * Math.pow(10, -digits) + 1e-9

/* ---------- 1. 占比 ratio：a 是 b 的百分之几 ---------- */
const r1 = M.ratio(25, 200)
T.eq('ratio 25/200 值（手算 12.5%）', r1.text, '12.5%')
T.ok('ratio value 数值', Math.abs(r1.value - 12.5) < 1e-12)
T.eq('ratio 倒数', r1.inverse, '800%')
T.eq('ratio 说明', r1.explain, '25 占 200 的 12.5%')
T.eq('ratio 1/3 舍入', M.ratio(1, 3).text, '33.3333%')
T.ok('ratio 1/3 与手算一致', Math.abs(M.ratio(1, 3).value - (1 / 3) * 100) < 1e-12)
T.eq('ratio 0/5 是 0', M.ratio(0, 5).text, '0%')
T.eq('ratio 千分位与空格入参', M.ratio('1,000', '2 000').text, '50%')
T.eq('ratio 带百分号入参', M.ratio('25%', 200).text, '12.5%')
T.ok('ratio 舍入落在半格内', halfGrid(M.ratio(2, 3).text, M.ratio(2, 3).value, 4))
T.throws('ratio 分母 0 抛中文', () => M.ratio(5, 0), /分母不能为 0/)
T.throws('ratio 非数字抛中文', () => M.ratio('a', 5), /请填写两个数字/)

/* ---------- 2. 求部分 percentOf：b 的 p% 是多少 ---------- */
const p1 = M.percentOf(200, 15)
T.eq('percentOf 200 的 15%（手算 30）', p1.text, '30')
T.ok('percentOf value', Math.abs(p1.value - 30) < 1e-12)
T.eq('percentOf 剩余', p1.rest, '170（剩下的）')
T.eq('percentOf 说明', p1.explain, '200 的 15% 是 30')
T.eq('percentOf 80 的 25%', M.percentOf(80, 25).text, '20')
T.eq('percentOf 0 的 50%', M.percentOf(0, 50).text, '0')
T.eq('percentOf 100 的 150%', M.percentOf(100, 150).text, '150')
T.eq('percentOf 保留 4 位', M.percentOf(200, 12.345).text, '24.69')
T.ok('percentOf 舍入落在半格内', halfGrid(M.percentOf(200, 12.345).text, M.percentOf(200, 12.345).value, 4))
T.throws('percentOf 非数字抛中文', () => M.percentOf('x', 10), /请填写两个数字/)

/* ---------- 3. 涨跌幅 changeRate：从 a 变到 b ---------- */
const c1 = M.changeRate(100, 120)
T.eq('changeRate 100→120（手算 +20%）', c1.text, '+20%')
T.eq('changeRate up', c1.up, true)
T.eq('changeRate 绝对变化', c1.diff, '20（绝对变化量）')
T.eq('changeRate 倍数', c1.multiple, '1.2 倍')
T.eq('changeRate 说明', c1.explain, '从 100 到 120，上涨 20%')
// 关键反直觉点：基数取起始值，120 降到 100 不是 -20%
const c2 = M.changeRate(120, 100)
T.eq('changeRate 120→100 是 -16.6667%', c2.text, '-16.6667%')
T.ok('changeRate 120→100 数值', Math.abs(c2.value - (-100 / 6)) < 1e-9)
T.eq('changeRate down', c2.up, false)
T.eq('changeRate 下跌说明', c2.explain, '从 120 到 100，下跌 16.6667%')
T.eq('changeRate 负数基数取绝对值 -100→-50', M.changeRate(-100, -50).text, '+50%')
T.eq('changeRate 负数继续跌 -100→-150', M.changeRate(-100, -150).text, '-50%')
T.eq('changeRate 0 变化', M.changeRate(100, 100).text, '+0%')
T.throws('changeRate 起始 0 抛中文', () => M.changeRate(0, 5), /起始值不能为 0/)
T.throws('changeRate 非数字抛中文', () => M.changeRate('x', 5), /请填写两个数字/)

/* ---------- 4. 增减 applyChange ---------- */
const a1 = M.applyChange(100, 15)
T.eq('applyChange 增 15%', a1.upText, '115')
T.eq('applyChange 减 15%', a1.downText, '85')
T.eq('applyChange 增减量', a1.delta, '15')
T.eq('applyChange 说明', a1.explain, '100 增加 15% 是 115；减少 15% 是 85')
T.eq('applyChange 200 增减 10% 上', M.applyChange(200, 10).upText, '220')
T.eq('applyChange 200 增减 10% 下', M.applyChange(200, 10).downText, '180')
T.eq('applyChange 增 0', M.applyChange(100, 0).upText, '100')
T.eq('applyChange 增 100% 翻倍', M.applyChange(100, 100).upText, '200')
T.eq('applyChange 增 100% 归零', M.applyChange(100, 100).downText, '0')
T.eq('applyChange 负百分比方向翻转（上）', M.applyChange(50, -10).upText, '45')
T.eq('applyChange 负百分比方向翻转（下）', M.applyChange(50, -10).downText, '55')
T.throws('applyChange 非数字抛中文', () => M.applyChange('x', 10), /请填写两个数字/)

/* ---------- 5. 多/少 compare：基数是「比」后面那个 ---------- */
const cmp1 = M.compare(120, 100)
T.eq('compare 120 比 100 多 20%', cmp1.text, '多 20%')
T.eq('compare up', cmp1.up, true)
T.eq('compare 说明', cmp1.explain, '120 比 100 多 20%')
T.eq('compare 100 比 120 少 16.6667%', M.compare(100, 120).text, '少 16.6667%')
T.eq('compare 相等', M.compare(100, 100).text, '多 0%')
T.eq('compare 提示基数是后面的数', /比/.test(M.compare(1, 2).warn), true)
T.throws('compare 被比较数为 0 抛中文', () => M.compare(1, 0), /被比较的数不能为 0/)
T.throws('compare 非数字抛中文', () => M.compare('x', 1), /请填写两个数字/)

/* ---------- 6. 折扣 discount ---------- */
const d1 = M.discount(299, 30)
T.eq('discount 实付', d1.pay, '209.3')
T.eq('discount 省下', d1.saved, '89.7')
T.eq('discount 中文几折', d1.zhe, '7')
T.eq('discount 说明', d1.explain, '原价 299，打 7 折，实付 209.3，省 89.7')
T.eq('discount 200 打 75 折', M.discount(200, 25).pay, '150')
T.eq('discount 不打折', M.discount(100, 0).pay, '100')
T.eq('discount 打 0 折是原价', M.discount(100, 0).zhe, '10')
T.eq('discount 全免', M.discount(100, 100).pay, '0')
T.throws('discount 负数折扣抛中文', () => M.discount(100, -1), /折扣百分比要在 0~100 之间/)
T.throws('discount 超 100 抛中文', () => M.discount(100, 101), /折扣百分比要在 0~100 之间/)
T.throws('discount 非数字抛中文', () => M.discount('abc', 10), /请填写原价与折扣/)

/* ---------- 7. 百分点 pointsDiff ---------- */
const pt = M.pointsDiff(15, 10)
T.eq('pointsDiff 15-10=5 个点', pt.text, '+5 个百分点')
T.ok('pointsDiff value', pt.value === 5)
T.eq('pointsDiff 说明', pt.explain, '从 10% 变成 15%，相差 5 个百分点')
T.eq('pointsDiff 下降', M.pointsDiff(10, 15).text, '-5 个百分点')
T.eq('pointsDiff 相等', M.pointsDiff(10, 10).text, '+0 个百分点')
T.throws('pointsDiff 非数字抛中文', () => M.pointsDiff('x', 1), /请填写两个百分数/)

/* ---------- 8. 税 tax ---------- */
const tx1 = M.tax(100, 13, 'excl')
T.eq('tax 不含税 100 税额', tx1.taxPart, '13')
T.eq('tax 不含税 100 合计', tx1.total, '113')
T.eq('tax 不含税说明', tx1.explain, '不含税 100，税 13，含税合计 113')
const tx2 = M.tax(113, 13)
T.eq('tax 含税 113 不含税价', tx2.price, '100')
T.eq('tax 含税 113 税额', tx2.taxPart, '13')
T.eq('tax 含税合计回原值', tx2.total, '113')
const tx3 = M.tax(226, 13)
T.eq('tax 含税 226 不含税价', tx3.price, '200')
T.eq('tax 含税 226 税额', tx3.taxPart, '26')
T.eq('tax 税率 0', M.tax(100, 0, 'excl').total, '100')
T.throws('tax 非数字抛中文', () => M.tax('abc', 13), /请填写金额与税率/)

/* ---------- 9. UI 契约 + 预置场景 ---------- */
const texts = [
  r1.text, r1.explain, p1.text, p1.explain, c1.text, c2.explain,
  a1.upText, a1.downText, cmp1.text, d1.pay, pt.text, tx1.explain,
]
T.ok('输出无 undefined/NaN', texts.every((s) => !/undefined|NaN/.test(s)))
T.ok('百分比 text 形状规整', /^[+-]?\d+(\.\d+)?%$/.test(r1.text) && /^[+-]?\d+(\.\d+)?%$/.test(c1.text))

T.eq('PERCENT_SCENES 数量 8', M.PERCENT_SCENES.length, 8)
T.ok('scenes key 唯一', new Set(M.PERCENT_SCENES.map((s) => s.key)).size === 8)
T.ok('scenes labels 各两个', M.PERCENT_SCENES.every((s) => Array.isArray(s.labels) && s.labels.length === 2))
T.ok('scenes 名字与提示非空', M.PERCENT_SCENES.every((s) => s.name.length > 0 && s.hint.length > 0))
T.ok('defaults 覆盖所有场景', M.PERCENT_SCENES.every((s) => Array.isArray(M.PERCENT_DEFAULTS[s.key]) && M.PERCENT_DEFAULTS[s.key].length === 2))
const runners = {
  ratio: (v) => M.ratio(...v), value: (v) => M.percentOf(...v), change: (v) => M.changeRate(...v),
  apply: (v) => M.applyChange(...v), compare: (v) => M.compare(...v), discount: (v) => M.discount(...v),
  points: (v) => M.pointsDiff(...v), tax: (v) => M.tax(...v),
}
for (const s of M.PERCENT_SCENES) {
  T.ok('默认值可算 ' + s.key, (() => { try { return !!runners[s.key](M.PERCENT_DEFAULTS[s.key]) } catch (e) { return false } })())
}
T.eq('默认 ratio 结果', M.ratio(...M.PERCENT_DEFAULTS.ratio).text, '12.5%')
T.eq('默认 value 结果', M.percentOf(...M.PERCENT_DEFAULTS.value).text, '30')
T.eq('默认 discount 实付', M.discount(...M.PERCENT_DEFAULTS.discount).pay, '209.3')
T.eq('默认 tax 合计', M.tax(...M.PERCENT_DEFAULTS.tax).total, '113')

T.done()
