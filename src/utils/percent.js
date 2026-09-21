/**
 * 百分比计算
 * 把日常最容易算混的几类百分比场景拆成独立函数，界面上分成几个小卡片列出来。
 */

const num = (v) => {
  const n = Number(String(v).replace(/[,，\s%]/g, ''))
  return isFinite(n) ? n : NaN
}

const fmt = (n, digits) => {
  if (!isFinite(n)) return '—'
  const d = digits === undefined ? 4 : digits
  return Number(n.toFixed(d)).toString()
}

/** 1. a 是 b 的百分之几 */
export function ratio(a, b) {
  const x = num(a)
  const y = num(b)
  if (!isFinite(x) || !isFinite(y)) throw new Error('请填写两个数字')
  if (y === 0) throw new Error('分母不能为 0')
  const p = (x / y) * 100
  return {
    value: p,
    text: fmt(p) + '%',
    explain: x + ' 占 ' + y + ' 的 ' + fmt(p) + '%',
    inverse: fmt((y / x) * 100) + '%',
  }
}

/** 2. b 的 p% 是多少 */
export function percentOf(b, p) {
  const y = num(b)
  const r = num(p)
  if (!isFinite(y) || !isFinite(r)) throw new Error('请填写两个数字')
  const v = (y * r) / 100
  return {
    value: v,
    text: fmt(v),
    explain: y + ' 的 ' + fmt(r) + '% 是 ' + fmt(v),
    rest: fmt(y - v) + '（剩下的）',
  }
}

/** 3. 从 a 变到 b，涨跌了百分之几 */
export function changeRate(from, to) {
  const a = num(from)
  const b = num(to)
  if (!isFinite(a) || !isFinite(b)) throw new Error('请填写两个数字')
  if (a === 0) throw new Error('起始值不能为 0，否则涨幅没有意义')
  const p = ((b - a) / Math.abs(a)) * 100
  return {
    value: p,
    text: (p >= 0 ? '+' : '') + fmt(p) + '%',
    up: p >= 0,
    explain: '从 ' + a + ' 到 ' + b + '，' + (p >= 0 ? '上涨' : '下跌') + ' ' + fmt(Math.abs(p)) + '%',
    diff: fmt(b - a) + '（绝对变化量）',
    multiple: fmt(b / a, 4) + ' 倍',
  }
}

/** 4. 基数增减 p% 后是多少 */
export function applyChange(base, p) {
  const b = num(base)
  const r = num(p)
  if (!isFinite(b) || !isFinite(r)) throw new Error('请填写两个数字')
  const up = b * (1 + r / 100)
  const down = b * (1 - r / 100)
  return {
    base: b,
    rate: r,
    upText: fmt(up),
    downText: fmt(down),
    delta: fmt(Math.abs((b * r) / 100)),
    explain: b + ' 增加 ' + fmt(r) + '% 是 ' + fmt(up) + '；减少 ' + fmt(r) + '% 是 ' + fmt(down),
  }
}

/** 5. a 比 b 多/少百分之几（注意基数是 b） */
export function compare(a, b) {
  const x = num(a)
  const y = num(b)
  if (!isFinite(x) || !isFinite(y)) throw new Error('请填写两个数字')
  if (y === 0) throw new Error('被比较的数不能为 0')
  const p = ((x - y) / Math.abs(y)) * 100
  return {
    value: p,
    text: (p >= 0 ? '多 ' : '少 ') + fmt(Math.abs(p)) + '%',
    up: p >= 0,
    explain: x + ' 比 ' + y + (p >= 0 ? ' 多 ' : ' 少 ') + fmt(Math.abs(p)) + '%',
    warn: '基数是「比」字后面的那个数，别颠倒',
  }
}

/** 6. 折扣 */
export function discount(original, off) {
  const o = num(original)
  const d = num(off)
  if (!isFinite(o) || !isFinite(d)) throw new Error('请填写原价与折扣')
  if (d < 0 || d > 100) throw new Error('折扣百分比要在 0~100 之间')
  const pay = o * (1 - d / 100)
  const saved = o - pay
  // 中文习惯里的「几折」
  const zhe = ((100 - d) / 10).toFixed(1).replace(/\.0$/, '')
  return {
    pay: fmt(pay, 2),
    saved: fmt(saved, 2),
    zhe,
    explain: '原价 ' + fmt(o, 2) + '，打 ' + zhe + ' 折，实付 ' + fmt(pay, 2) + '，省 ' + fmt(saved, 2),
  }
}

/** 7. 百分点差（两个百分比相减，不是相对变化） */
export function pointsDiff(a, b) {
  const x = num(a)
  const y = num(b)
  if (!isFinite(x) || !isFinite(y)) throw new Error('请填写两个百分数')
  const d = x - y
  return {
    value: d,
    text: (d >= 0 ? '+' : '') + fmt(d) + ' 个百分点',
    explain: '从 ' + fmt(y) + '% 变成 ' + fmt(x) + '%，相差 ' + fmt(Math.abs(d)) + ' 个百分点',
    warn: '「涨了几个百分点」和「涨了百分之几」不是一回事：从 10% 到 15% 是涨了 5 个百分点，但相对涨幅是 50%',
  }
}

/** 8. 含税 / 不含税 */
export function tax(amount, rate, mode) {
  const a = num(amount)
  const r = num(rate)
  if (!isFinite(a) || !isFinite(r)) throw new Error('请填写金额与税率')
  if (mode === 'excl') {
    const t = (a * r) / 100
    return { price: fmt(a, 2), taxPart: fmt(t, 2), total: fmt(a + t, 2), explain: '不含税 ' + fmt(a, 2) + '，税 ' + fmt(t, 2) + '，含税合计 ' + fmt(a + t, 2) }
  }
  const base = a / (1 + r / 100)
  return { price: fmt(base, 2), taxPart: fmt(a - base, 2), total: fmt(a, 2), explain: '含税 ' + fmt(a, 2) + '，其中不含税 ' + fmt(base, 2) + '，税 ' + fmt(a - base, 2) }
}

export const PERCENT_SCENES = [
  { key: 'ratio', name: '占比', hint: 'a 是 b 的百分之几', labels: ['a（部分）', 'b（总数）'] },
  { key: 'value', name: '求部分', hint: 'b 的 p% 是多少', labels: ['b（基数）', 'p（百分比 %）'] },
  { key: 'change', name: '涨跌幅', hint: '从 a 变到 b', labels: ['起始值 a', '变化后 b'] },
  { key: 'apply', name: '增减', hint: '基数增减 p% 后是多少', labels: ['基数', '增减百分比 p'] },
  { key: 'compare', name: '多多少', hint: 'a 比 b 多/少百分之几', labels: ['a', 'b（「比」字后面那个）'] },
  { key: 'discount', name: '折扣', hint: '原价与折扣率', labels: ['原价', '折扣百分比（比如打 7 折填 30）'] },
  { key: 'points', name: '百分点', hint: '两个百分数相差几个点', labels: ['变化后的百分数', '原来的百分数'] },
  { key: 'tax', name: '税', hint: '含税与不含税互算', labels: ['金额', '税率 %'] },
]

/** 界面上常用的默认值，让用户点开就有结果 */
export const PERCENT_DEFAULTS = {
  ratio: ['25', '200'],
  value: ['200', '15'],
  change: ['100', '118'],
  apply: ['100', '15'],
  compare: ['120', '100'],
  discount: ['299', '30'],
  points: ['15', '10'],
  tax: ['113', '13'],
}
