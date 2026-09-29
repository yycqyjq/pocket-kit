/**
 * 复利与投资计算
 * 说明：全部按「名义年利率按月复利」计算，不考虑通胀、税费与申购赎回费。
 */

const num = (v) => {
  const n = Number(String(v).replace(/[,，\s%元]/g, ''))
  return isFinite(n) ? n : NaN
}

export function money(n, digits) {
  if (!isFinite(n)) return '—'
  const d = digits === undefined ? 2 : digits
  const neg = n < 0
  const s = Math.abs(n).toFixed(d)
  const [int, dec] = s.split('.')
  return (neg ? '-' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dec ? '.' + dec : '')
}

const pct = (n) => (isFinite(n) ? Number(n.toFixed(2)).toString() + '%' : '—')

/**
 * 一次性投入的复利终值
 * @param {object} p { principal, annualRate, years, timesPerYear }
 */
export function compoundOnce(p) {
  const P = num(p.principal)
  const r = num(p.annualRate) / 100
  const y = num(p.years)
  const m = Number(p.timesPerYear || 12)
  if (!(P > 0)) throw new Error('本金要大于 0')
  if (!(y > 0)) throw new Error('年限要大于 0')
  if (!isFinite(r)) throw new Error('请填写年利率')
  if (!(m >= 1 && m <= 365)) throw new Error('每年复利次数要在 1~365 之间')

  const rate = r / m
  const periods = Math.round(y * m)
  const final = P * Math.pow(1 + rate, periods)
  return {
    final,
    profit: final - P,
    profitRate: ((final - P) / P) * 100,
    periods,
    effectiveAnnual: (Math.pow(1 + rate, m) - 1) * 100,
    text: money(P) + ' 元按年化 ' + pct(num(p.annualRate)) + ' 复利 ' + y + ' 年，变成 ' + money(final) + ' 元',
  }
}

/**
 * 定投（每月投入）
 * @param {object} p { monthly, annualRate, years, initial }
 */
export function monthlyPlan(p) {
  const A = num(p.monthly)
  const r = num(p.annualRate) / 100
  const y = num(p.years)
  const P0 = num(p.initial) || 0
  if (!(A > 0) && !(P0 > 0)) throw new Error('每月投入或初始本金至少填一个')
  if (!(y > 0)) throw new Error('年限要大于 0')

  const i = r / 12
  const n = Math.round(y * 12)
  const schedule = []
  let bal = P0
  let invested = P0

  for (let k = 1; k <= n; k++) {
    const interest = bal * i
    bal = bal + interest + A
    invested += A
    if (k % 12 === 0 || k === n) {
      schedule.push({
        year: Math.ceil(k / 12),
        month: k,
        invested,
        interest: bal - invested,
        balance: bal,
      })
    }
  }

  return {
    final: bal,
    invested,
    profit: bal - invested,
    profitRate: invested > 0 ? ((bal - invested) / invested) * 100 : 0,
    months: n,
    schedule,
    text: '每月 ' + money(A) + ' 元投 ' + y + ' 年，累计投入 ' + money(invested) + ' 元，期末 ' + money(bal) + ' 元',
  }
}

/** 年化收益率（从期初期末反推） */
export function annualizedReturn(initial, final, years) {
  const P = num(initial)
  const F = num(final)
  const y = num(years)
  if (!(P > 0)) throw new Error('期初金额要大于 0')
  if (!(F > 0)) throw new Error('期末金额要大于 0')
  if (!(y > 0)) throw new Error('年限要大于 0')
  const total = (F / P - 1) * 100
  const annual = (Math.pow(F / P, 1 / y) - 1) * 100
  return {
    total,
    annual,
    multiple: F / P,
    text: P + ' 元 ' + y + ' 年后变成 ' + F + ' 元，累计收益 ' + pct(total) + '，折合年化 ' + pct(annual),
  }
}

/** 72 法则：本金翻倍需要多久 */
export function rule72(annualRate) {
  const r = num(annualRate)
  if (!(r > 0)) throw new Error('年利率要大于 0')
  const years = 72 / r
  const exact = Math.log(2) / Math.log(1 + r / 100)
  return {
    years,
    exact,
    text: '年化 ' + pct(r) + ' 时，按 72 法则约 ' + years.toFixed(1) + ' 年翻倍；精确计算是 ' + exact.toFixed(1) + ' 年',
    note: '72 法则在 6%~10% 区间最准，利率越高误差越大',
  }
}

export const INVEST_NOTES = [
  '默认按月复利。如果产品是按年复利，把「每年复利次数」改成 1 即可。',
  '结果是名义值，没有扣除通胀、税费、申购赎回费，也不是任何投资建议。',
  '定投算的是「每月月末投入」，不同时点投入的结果会有差异。',
]
