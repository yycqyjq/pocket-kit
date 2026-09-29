/** 复利/定投/年化反推的自查：期望值来自手算（1.1^5、2^0.1、普通年金终值系数），
 *  以及和 compoundOnce 互逆的往返校验，不复用被测实现的写法。 */
import { useUtils } from '../harness.mjs'
const I = await useUtils('invest')

let ok = 0
let fail = 0
function is(a, b, m) {
  if (a === b) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b))
  }
}
function near(a, b, tol, m) {
  if (Math.abs(a - b) <= tol) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + a + ' want ' + b + '±' + tol)
  }
}
function throws(fn, m) {
  try {
    fn()
    fail++
    console.log('FAIL ' + m + ': should throw')
  } catch (e) {
    ok++
  }
}

/* ---------- 一次性复利 ---------- */
const one = I.compoundOnce({ principal: 1000, annualRate: 10, years: 5, timesPerYear: 1 })
near(one.final, 1610.51, 1e-6, '1.1^5 = 1.61051')
near(one.profit, 610.51, 1e-6, '收益')
near(one.profitRate, 61.051, 1e-6, '收益率')
is(one.periods, 5, '按年复利 5 期')
near(one.effectiveAnnual, 10, 1e-9, '按年复利时有效年利率 = 名义利率')

const m12 = I.compoundOnce({ principal: 1000, annualRate: 12, years: 1, timesPerYear: 12 })
near(m12.final, 1126.8250301319697, 1e-6, '1.01^12')
near(m12.effectiveAnnual, 12.6825030131969, 1e-6, '月复利 12% 折合有效 12.68%')
is(m12.periods, 12, '月复利 12 期')

// 半年 = 6 个计息期（期数四舍五入，不是截断）
is(I.compoundOnce({ principal: 100, annualRate: 8, years: 0.5, timesPerYear: 12 }).periods, 6, '半年 6 期')

const zero = I.compoundOnce({ principal: 1000, annualRate: 0, years: 3, timesPerYear: 12 })
near(zero.final, 1000, 1e-9, '0% 不复利增长')
near(zero.profit, 0, 1e-9, '0% 无收益')
near(zero.effectiveAnnual, 0, 1e-9, '0% 有效年利率')

// 输入里带千分位逗号、百分号、货币符号都要吃得下（界面传的是原始文本）
is(I.compoundOnce({ principal: '1,000', annualRate: '10%', years: '5', timesPerYear: 1 }).final.toFixed(2), '1610.51', '脏输入清洗')

/* ---------- 每月定投 ---------- */
const d0 = I.monthlyPlan({ monthly: 1000, annualRate: 0, years: 1, initial: 0 })
near(d0.final, 12000, 1e-9, '免息定投 1 年')
is(d0.invested, 12000, '投入合计')
near(d0.profit, 0, 1e-9, '免息无利')
is(d0.months, 12, '计息期数')
is(d0.schedule.length, 1, '整年只留一条')

// 普通年金终值 FV = A·((1+i)^n − 1)/i，i=1%、n=12 → 1000×12.6825030…
const d1 = I.monthlyPlan({ monthly: 1000, annualRate: 12, years: 1, initial: 0 })
near(d1.final, 12682.5030402, 1e-4, '年金终值系数独立写法')
near(d1.profit, 682.5030402, 1e-4, '定投收益')
near(d1.profitRate, 5.6875503, 1e-4, '收益率 = 收益 ÷ 投入')

// 有初始本金：0% 时应当是「初始 + 每月×期数」的直线
const d2 = I.monthlyPlan({ monthly: 500, annualRate: 0, years: 2, initial: 3000 })
near(d2.final, 15000, 1e-9, '免息含初始本金')
is(d2.invested, 15000, '投入含初始')

const d3 = I.monthlyPlan({ monthly: 1000, annualRate: 6, years: 3, initial: 0 })
is(d3.schedule.length, 3, '三年三条')
is(d3.schedule[0].year, 1, '第一条是第一年')
is(d3.schedule[2].month, 36, '最后一条在第 36 月')
// 逐年余额必须单调上升（投入为正、利率非负）
is(
  d3.schedule.every((r, idx) => idx === 0 || r.balance > d3.schedule[idx - 1].balance),
  true,
  '年度余额递增'
)
// 每年那条自己也要对得上：balance = invested + interest
for (const r of d3.schedule) near(r.balance, r.invested + r.interest, 1e-6, '第' + r.year + '年 余额=投入+收益')

/* ---------- 年化反推 ---------- */
const rr = I.annualizedReturn(1000, 2000, 10)
near(rr.total, 100, 1e-9, '累计翻倍')
near(rr.annual, 7.17734644, 1e-6, '2^0.1 − 1')
is(rr.multiple, 2, '倍数')
// 与 compoundOnce 互逆：正推算出来的终值再反推，应回到 10%
const rt = I.annualizedReturn(1000, I.compoundOnce({ principal: 1000, annualRate: 10, years: 5, timesPerYear: 12 }).final, 5)
near(rt.annual, 10.471, 0.01, '月复利 10% 名义反推年化 ≈ 10.47%')
near(I.annualizedReturn(1000, 1610.51, 5).annual, 10, 1e-4, '按年复利的往返')
near(I.annualizedReturn(1000, 500, 3).annual, -20.6299474, 1e-6, '亏一半 3 年：0.5 的立方根减一')

/* ---------- 72 法则 ---------- */
const r8 = I.rule72(8)
near(r8.years, 9, 1e-9, '72 ÷ 8')
// 精确值不背小数：按 exact 年数复利，本利和应当正好翻倍
near(Math.pow(1.08, r8.exact), 2, 1e-9, 'ln2÷ln1.08 的等价判据：1.08^exact = 2')
near(I.rule72(6).years, 12, 1e-9, '72 ÷ 6')
near(Math.pow(1.06, I.rule72(6).exact), 2, 1e-9, '6% 同样翻倍')
is(I.rule72(6).exact < I.rule72(6).years, true, '低利率时 72 法则偏慢（12 > 11.9）')
is(typeof r8.note, 'string', '带误差说明')
throws(() => I.rule72(0), '0% 无法用 72 法则')
throws(() => I.rule72(''), '空利率')

/* ---------- 校验与文案 ---------- */
throws(() => I.compoundOnce({ principal: 0, annualRate: 3, years: 1, timesPerYear: 12 }), '本金 0')
throws(() => I.compoundOnce({ principal: 1000, annualRate: 3, years: 0, timesPerYear: 12 }), '年限 0')
throws(() => I.compoundOnce({ principal: 1000, annualRate: 'abc', years: 1, timesPerYear: 12 }), '利率非数字')
// 次数走分段选择器，界面只给 12/4/1/365；留空或填 0 都按「没填」落到默认 12（`|| 12`）
is(I.compoundOnce({ principal: 1000, annualRate: 12, years: 1 }).periods, 12, '没填次数默认按月')
is(I.compoundOnce({ principal: 1000, annualRate: 12, years: 1, timesPerYear: 0 }).periods, 12, '0 当作没填')
throws(() => I.compoundOnce({ principal: 1000, annualRate: 3, years: 1, timesPerYear: 366 }), '复利次数上界')
throws(() => I.compoundOnce({ principal: 1000, annualRate: 3, years: 1, timesPerYear: -1 }), '复利次数不许为负')
throws(() => I.monthlyPlan({ monthly: 0, annualRate: 3, years: 1, initial: 0 }), '定投两头都空')
throws(() => I.annualizedReturn(0, 100, 1), '期初 0')
throws(() => I.annualizedReturn(100, 0, 1), '期末 0')
is(
  (function () {
    try {
      I.annualizedReturn(0, 1, 1)
      return ''
    } catch (e) {
      return e.message
    }
  })(),
  '期初金额要大于 0',
  '错误文案是中文'
)
is(I.money ? '有' : '无', '无', '千分位只有 finance.js 一份，invest 不再自带')
is(I.INVEST_NOTES.length >= 3, true, '口径说明还在界面上')

console.log('== invest pass=' + ok + '/' + (ok + fail))
if (fail) process.exitCode = 1
