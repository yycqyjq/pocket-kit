/**
 * 贷款 / 还款计算
 * money 是全站金额千分位的唯一实现，invest.js 与两个界面组件都复用它。
 */

/**
 * 等额本息
 * @param {number} principal 本金（元）
 * @param {number} annualRate 年利率（%）
 * @param {number} months 期数（月）
 */
export function equalInstallment(principal, annualRate, months) {
  const P = Number(principal)
  const n = Math.round(Number(months))
  const i = Number(annualRate) / 100 / 12
  if (!(P > 0) || !(n > 0)) throw new Error('请输入有效的金额与期数')

  let monthly
  if (i === 0) {
    monthly = P / n
  } else {
    monthly = (P * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1)
  }

  const schedule = []
  let remain = P
  for (let k = 1; k <= n; k++) {
    const interest = remain * i
    let principalPart = monthly - interest
    if (k === n) principalPart = remain
    remain = Math.max(0, remain - principalPart)
    schedule.push({
      period: k,
      payment: k === n ? principalPart + interest : monthly,
      principal: principalPart,
      interest,
      remain,
    })
  }
  const totalPayment = schedule.reduce((s, r) => s + r.payment, 0)
  return {
    type: '等额本息',
    monthly,
    firstMonthly: monthly,
    lastMonthly: monthly,
    totalPayment,
    totalInterest: totalPayment - P,
    schedule,
  }
}

/**
 * 等额本金
 */
export function equalPrincipal(principal, annualRate, months) {
  const P = Number(principal)
  const n = Math.round(Number(months))
  const i = Number(annualRate) / 100 / 12
  if (!(P > 0) || !(n > 0)) throw new Error('请输入有效的金额与期数')

  const principalPart = P / n
  const schedule = []
  let remain = P
  for (let k = 1; k <= n; k++) {
    const interest = remain * i
    const payment = principalPart + interest
    remain = Math.max(0, remain - principalPart)
    schedule.push({ period: k, payment, principal: principalPart, interest, remain })
  }
  const totalPayment = schedule.reduce((s, r) => s + r.payment, 0)
  return {
    type: '等额本金',
    monthly: schedule[0].payment,
    firstMonthly: schedule[0].payment,
    lastMonthly: schedule[schedule.length - 1].payment,
    totalPayment,
    totalInterest: totalPayment - P,
    schedule,
  }
}

/**
 * 提前还款试算（等额本息）
 * 给出「在第 k 期后一次性还 X 元」后，月供不变可缩短多少期 / 期数不变可减少多少月供
 */
export function prepaymentEffect(principal, annualRate, months, afterPeriod, extra) {
  const base = equalInstallment(principal, annualRate, months)
  const n = Math.round(Number(months))
  const k = Math.round(Number(afterPeriod))
  const X = Number(extra)
  const i = Number(annualRate) / 100 / 12
  if (!(k > 0) || k >= n || !(X > 0)) {
    return { valid: false, reason: '请检查提前还款的期数与金额' }
  }
  const remainAfter = base.schedule[k - 1].remain
  if (X >= remainAfter) {
    return { valid: true, payoff: true, savedInterest: base.schedule.slice(k).reduce((s, r) => s + r.interest, 0) }
  }
  const newPrincipal = remainAfter - X

  // 月供不变，缩短期限。零利率时 n = -log(1 - B·i/M)/log(1+i) 退化成 0/0，直接按本金除以月供算
  const monthly = base.monthly
  const remainMonths =
    i === 0
      ? Math.ceil(newPrincipal / monthly)
      : Math.ceil(-Math.log(1 - (newPrincipal * i) / monthly) / Math.log(1 + i))
  const interestBefore = base.schedule.slice(k).reduce((s, r) => s + r.interest, 0)
  let tmp = newPrincipal
  let interestAfter = 0
  for (let m = 0; m < remainMonths; m++) {
    const int = tmp * i
    interestAfter += int
    tmp = tmp + int - monthly
  }

  // 期限不变，降低月供
  const newMonthly =
    i === 0
      ? newPrincipal / (n - k)
      : (newPrincipal * i * Math.pow(1 + i, n - k)) / (Math.pow(1 + i, n - k) - 1)

  return {
    valid: true,
    payoff: false,
    remainBefore: remainAfter,
    remainAfter: newPrincipal,
    originRemainMonths: n - k,
    newRemainMonths: remainMonths,
    shortenMonths: n - k - remainMonths,
    newMonthly,
    monthlyDrop: monthly - newMonthly,
    savedInterest: interestBefore - interestAfter,
    monthlyKept: monthly,
  }
}

/** 格式化金额，带千分位；算不出来的（NaN/Infinity）一律显示「—」 */
export function money(n, digits) {
  if (!isFinite(n)) return '—'
  const d = digits === undefined ? 2 : digits
  const neg = n < 0
  const s = Math.abs(n).toFixed(d)
  const [int, dec] = s.split('.')
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (neg ? '-' : '') + withSep + (dec ? '.' + dec : '')
}
