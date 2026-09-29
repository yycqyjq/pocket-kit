/** 贷款还款的自查：期望值全部来自手算或独立写法，不复用被测实现的公式。
 *  直接跑 src/utils/finance.js 本体（harness 在内存里改写相对 import）。 */
import { useUtils } from '../harness.mjs'
const F = await useUtils('finance')

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
// 独立写法：月供 = P·i / (1 − (1+i)^−n)，与实现里的 (1+i)^n 分式不同源
const annuity = (P, annualRatePct, n) => {
  const i = annualRatePct / 100 / 12
  return i === 0 ? P / n : (P * i) / (1 - Math.pow(1 + i, -n))
}

/* ---------- 等额本息 ---------- */
const a = F.equalInstallment(100000, 4.8, 120)
near(a.monthly, 1050.91, 0.005, '月供 10万/4.8%/10年 教科书值')
near(a.monthly, annuity(100000, 4.8, 120), 1e-9, '月供 vs 独立闭式')
near(a.totalPayment, 126108.75, 0.02, '总还款')
near(a.totalInterest, 26108.75, 0.02, '总利息 = 总还款 − 本金')
is(a.schedule.length, 120, '期数')
is(a.schedule[0].period, 1, '首期号')
is(a.type, '等额本息', '类型标签')
// 首期：利息 = 100000×0.4% = 400，本金 = 1050.9061… − 400
near(a.schedule[0].interest, 400, 1e-9, '首期利息')
near(a.schedule[0].principal, a.monthly - 400, 1e-9, '首期本金')

/* 逐期不变量：本金还清、每期本息相加等于月供、剩余递减 */
let addends = true
for (const r of a.schedule) {
  if (Math.abs(r.principal + r.interest - r.payment) > 1e-9) addends = false
}
is(addends, true, '每期本金+利息=月供')
near(
  a.schedule.reduce((s, r) => s + r.principal, 0),
  100000,
  1e-6,
  '本金列合计 = 本金'
)
near(a.schedule[a.schedule.length - 1].remain, 0, 1e-6, '末期余额归零')
is(
  a.schedule.every((r, idx) => idx === 0 || r.remain <= a.schedule[idx - 1].remain),
  true,
  '余额单调递减'
)

// 另一组手算：12000 元、年利率 12%（月息 1%）、12 期
const a2 = F.equalInstallment(12000, 12, 12)
near(a2.monthly, 1066.19, 0.005, '月供 1.2万/12%/12期')
near(a2.schedule[0].interest, 120, 1e-9, '首期利息 12000×1%')

/* 零利率退化成除法，不能出现 NaN */
const a0 = F.equalInstallment(12000, 0, 12)
near(a0.monthly, 1000, 1e-9, '免息月供')
near(a0.totalInterest, 0, 1e-9, '免息零利息')
near(a0.schedule[11].remain, 0, 1e-6, '免息末期归零')

/* ---------- 等额本金 ---------- */
const b = F.equalPrincipal(100000, 4.8, 120)
near(b.firstMonthly, 1233.33, 0.005, '首月 833.33+400')
near(b.lastMonthly, 836.67, 0.005, '末月 833.33+3.33')
near(
  b.schedule.reduce((s, r) => s + r.principal, 0),
  100000,
  1e-6,
  '等额本金本金列合计'
)
is(b.type, '等额本金', '类型标签')
// 总利息手算：i×P×(n+1)/2 = 0.004×100000×60.5
near(b.totalInterest, 24200, 0.01, '等额本金总利息闭式')
const b0 = F.equalPrincipal(12000, 0, 12)
near(b0.firstMonthly, 1000, 1e-9, '免息等额本金首月')
near(b0.totalInterest, 0, 1e-9, '免息等额本金零利息')

/* ---------- 提前还款 ---------- */
const p = F.prepaymentEffect(100000, 4.8, 120, 12, 20000)
is(p.valid, true, '有息试算有效')
near(p.remainBefore, 92014.97, 0.01, '第 12 期后余额')
near(p.remainAfter, 72014.97, 0.01, '还 2 万后余额')
is(p.newRemainMonths, 81, '月供不变剩 81 期')
is(p.shortenMonths, 27, '缩短 27 期')
near(p.newMonthly, 822.49, 0.005, '期限不变新月供')
near(p.monthlyDrop, 228.42, 0.005, '月供减少')
near(p.savedInterest, 9164.41, 0.02, '省下的利息')
is(p.payoff, false, '没到结清')

/* 免息分期：月供不变时，缩短期数 = 剩余本金 ÷ 月供（这里 30000÷8333.33 → 4 期）
   这条是 2026-09-30 修 NaN 回归的钉子：旧实现走 -log(1−B·i/M)/log(1+i)，i=0 时是 0/0 */
const pz = F.prepaymentEffect(100000, 0, 12, 6, 20000)
is(pz.valid, true, '免息试算有效')
is(pz.newRemainMonths, 4, '免息剩余期数')
is(pz.shortenMonths, 2, '免息可缩短 2 期')
is(Number.isFinite(pz.newMonthly), true, '免息新月供不是 NaN')
near(pz.newMonthly, 5000, 1e-6, '免息新月供 30000÷6')
near(pz.monthlyDrop, 3333.33, 0.005, '免息月供减少')
near(pz.savedInterest, 0, 1e-9, '免息无利息可省')

const pp = F.prepaymentEffect(100000, 4.8, 120, 12, 200000)
is(pp.payoff, true, '还得够就是结清')
is(pp.valid, true, '结清路径有效')
const pinv = F.prepaymentEffect(100000, 4.8, 120, 120, 1000)
is(pinv.valid, false, '期数不小于总期数无效')
is(pinv.reason, '请检查提前还款的期数与金额', '无效提示文案')
is(F.prepaymentEffect(100000, 4.8, 120, 0, 1000).valid, false, '第 0 期无效')
is(F.prepaymentEffect(100000, 4.8, 120, 12, 0).valid, false, '还款额 0 无效')

/* ---------- 金额千分位（全站唯一实现，invest.js 也复用它）---------- */
is(F.money(1234567.891), '1,234,567.89', '四舍五入到分')
is(F.money(0), '0.00', '零')
is(F.money(1000, 0), '1,000', '指定位数')
is(F.money(-1234567, 2), '-1,234,567.00', '负数')
is(F.money(1234567890123), '1,234,567,890,123.00', '万亿级分组')
is(F.money(NaN), '—', 'NaN 显示破折号')
is(F.money(Infinity), '—', 'Infinity 同样')
is(F.money(-0.4, 0), '-0', '负小数取零位')

/* ---------- 入参校验 ---------- */
throws(() => F.equalInstallment(0, 4.8, 120), '本金 0')
throws(() => F.equalInstallment(100000, 4.8, 0), '期数 0')
throws(() => F.equalPrincipal(-1, 4.8, 120), '负本金')
throws(() => F.equalInstallment('abc', 4.8, 120), '非数字本金')
is(
  (function () {
    try {
      F.equalInstallment(0, 1, 1)
      return ''
    } catch (e) {
      return e.message
    }
  })(),
  '请输入有效的金额与期数',
  '错误文案是中文'
)

console.log('== finance pass=' + ok + '/' + (ok + fail))
if (fail) process.exitCode = 1
