/**
 * 多人账单分摊 · 找零撮平
 * ------------------------------------------------------------
 * 纯函数层：不碰 uni、不碰 DOM。
 *
 * 关键做法
 *   1. 所有金额都先转成「分」（整数）再运算，避免 0.1 + 0.2 这类浮点误差；
 *      分摊时先按比例取整，剩下的零头用「最大余数法」逐分分配，
 *      保证 sum(各人分摊) === 总额，不会出现「加起来少了一分」。
 *   2. 结算用贪心撮合：余额最欠的人先还给余额最多的人，
 *      转账笔数最多 n−1 笔（这是该算法的已知上界，不保证全局最少）。
 *   3. 汇率只做「显示」：不联网取数，用户手填多少按多少算，并明确标注。
 *
 * 结果仅供日常参考，不构成财务、税务或法律建议。
 */

/** 参与人数上限，防止误粘贴一大段文本 */
export const MAX_PEOPLE = 200
/** 单人金额上限（元），超过按输入错误处理 */
export const MAX_AMOUNT = 1e12

/** 币种表：只负责符号与小数位，不做任何换算 */
export const CURRENCIES = [
  { key: 'CNY', symbol: '¥', name: '人民币', code: 'RMB', decimals: 2 },
  { key: 'USD', symbol: '$', name: '美元', code: 'USD', decimals: 2 },
  { key: 'EUR', symbol: '€', name: '欧元', code: 'EUR', decimals: 2 },
  { key: 'JPY', symbol: '¥', name: '日元', code: 'JPY', decimals: 0 },
  { key: 'HKD', symbol: 'HK$', name: '港币', code: 'HKD', decimals: 2 },
  { key: 'GBP', symbol: '£', name: '英镑', code: 'GBP', decimals: 2 },
  { key: 'KRW', symbol: '₩', name: '韩元', code: 'KRW', decimals: 0 },
  { key: 'THB', symbol: '฿', name: '泰铢', code: 'THB', decimals: 2 },
  { key: 'TWD', symbol: 'NT$', name: '新台币', code: 'TWD', decimals: 0 },
  { key: 'AUD', symbol: 'A$', name: '澳元', code: 'AUD', decimals: 2 },
  { key: 'CAD', symbol: 'C$', name: '加元', code: 'CAD', decimals: 2 },
  { key: 'SGD', symbol: 'S$', name: '新币', code: 'SGD', decimals: 2 },
]

/** 常用抹零档位 */
export const ROUND_UNITS = [
  { key: '1', value: 1, name: '元' },
  { key: '0.1', value: 0.1, name: '角' },
  { key: '0.5', value: 0.5, name: '五角' },
  { key: '5', value: 5, name: '5 元' },
  { key: '10', value: 10, name: '十元' },
]

/** 小费习惯参考（只是默认勾选，不替用户决定给多少） */
export const TIP_PRESETS = [
  { key: '0', rate: 0, name: '不给' },
  { key: '5', rate: 5, name: '5%' },
  { key: '10', rate: 10, name: '10%' },
  { key: '15', rate: 15, name: '15%' },
  { key: '18', rate: 18, name: '18%' },
  { key: '20', rate: 20, name: '20%' },
]

export function currencyOf(key) {
  return CURRENCIES.filter((c) => c.key === key)[0] || CURRENCIES[0]
}

/* ------------------------------------------------------------ 金额底层 */

/** 元 → 分（整数）。非法输入抛中文错误 */
export function toCents(value) {
  const n = typeof value === 'number' ? value : Number(String(value == null ? '' : value).replace(/[¥$€£,\s]/g, ''))
  if (!isFinite(n)) throw new Error('金额不是数字：' + value)
  if (Math.abs(n) > MAX_AMOUNT) throw new Error('金额超出可处理范围')
  return Math.round(n * 100)
}

/** 分 → 「12.34」这样的字符串（不含币种符号） */
export function centsText(cents) {
  const neg = cents < 0
  const abs = Math.abs(cents)
  const s = Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0')
  return (neg ? '-' : '') + s
}

/** 分 → 「¥12.34」；负号放在币种符号前面，符合中文账单习惯 */
export function moneyText(cents, curKey) {
  const cur = currencyOf(curKey)
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  if (cur.decimals === 0) {
    return sign + cur.symbol + Math.round(abs / 100).toLocaleString('en-US')
  }
  return sign + cur.symbol + centsText(abs)
}

/* ------------------------------------------------------------ 参与人解析 */

/**
 * 解析参与人清单。每行一个人，支持：
 *   张三                → 均摊，权重 1
 *   张三 120            → 该人实付/消费 120（numberAs = 'paid'）
 *   张三 x2 / 张三*2 / 张三 2份 → 权重 2
 *   张三 不参与 / 张三 -  → 不占份额
 * 名字里可以有空格（如 "Li Ming"），解析时从第一个「数值样 token」处切开。
 * @param {string} numberAs 纯数字当作金额（'paid'）还是份数（'weight'）
 * @returns {{rows:Array, notice:string, paidSum:number, weightSum:number}}
 */
export function parsePeople(text, numberAs) {
  const asWeight = numberAs === 'weight'
  const lines = String(text || '').split(/[\n\r]+/).filter((l) => l.trim() !== '')
  if (lines.length > MAX_PEOPLE) throw new Error('人数超过 ' + MAX_PEOPLE + ' 个，请分次计算')
  const rows = []
  const used = {}
  const notice = []
  lines.forEach((line, i) => {
    const norm = line.replace(/[，,：:、]/g, ' ').replace(/\s+/g, ' ').trim()
    const toks = norm.split(' ')
    let cut = -1
    if (toks.length === 1 && VAL_RE.test(toks[0]) && !/^-+$/.test(toks[0])) cut = 0
    else for (let k = 1; k < toks.length; k++) {
      if (VAL_RE.test(toks[k])) { cut = k; break }
    }
    const name = (cut < 0 ? norm : toks.slice(0, cut).join(' ')).trim() || '第' + (i + 1) + '人'
    const rest = cut < 0 ? '' : toks.slice(cut).join(' ').trim()
    let paid = null
    let weight = 1
    let join = true
    if (rest) {
      const wm = rest.match(/^[x×*]([0-9]*\.?[0-9]+)/i) || rest.match(/^([0-9]*\.?[0-9]+)份$/)
      const nm = rest.match(/^[+-]?([0-9]*\.?[0-9]+)(元|块|y|¥)?$/i)
      if (/^不参与$|^not$|^-+$|^无$/.test(rest)) {
        join = false
        weight = 0
      } else if (wm) {
        weight = Number(wm[1])
      } else if (nm) {
        if (asWeight) weight = Number(nm[1])
        else paid = Number(nm[1])
      } else {
        notice.push('第 ' + (i + 1) + ' 行有看不懂的内容：' + rest)
      }
    }
    if (!isFinite(weight) || weight < 0) weight = join ? 1 : 0
    if (paid !== null && !isFinite(paid)) paid = null
    let finalName = name
    if (used[name]) {
      used[name] += 1
      finalName = name + '(' + used[name] + ')'
      notice.push('有重名「' + name + '」，已自动加序号区分')
    } else {
      used[name] = 1
    }
    rows.push({ index: i, name: finalName, paid, weight: join ? weight : 0, join, raw: line })
  })
  return {
    rows,
    notice: notice[0] || '',
    paidSum: rows.reduce((s, r) => s + (r.paid || 0), 0),
    weightSum: rows.reduce((s, r) => s + r.weight, 0),
  }
}

/** 行内「数值样」token：x2 / 2份 / 12.5 / 不参与 / - */
const VAL_RE = /^(?:[x×*][0-9]|-?[0-9]|不参与$|not$|无$|-+$)/i

/* ------------------------------------------------------------ 分摊 */

/**
 * 最大余数法：把 totalCents 按 weights 分配，和恰好等于 totalCents
 */
export function allocate(totalCents, weights) {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0) throw new Error('至少要有一个人参与分摊')
  const raw = weights.map((w, i) => ({ i, exact: (totalCents * w) / sum, floor: Math.floor((totalCents * w) / sum) }))
  let left = totalCents - raw.reduce((a, b) => a + b.floor, 0)
  const order = raw.slice().sort((a, b) => b.exact - b.floor - (a.exact - a.floor))
  for (let k = 0; k < order.length && left > 0; k++, left--) order[k].floor += 1
  if (left < 0) {
    // 全为负数总额时可能出现，反向回收
    for (let k = order.length - 1; k >= 0 && left < 0; k--, left++) order[k].floor -= 1
  }
  const out = new Array(weights.length)
  raw.forEach((r) => { out[r.i] = r.floor })
  return out
}

/**
 * 分摊
 * @param {number} totalCents 待分摊总额（分）
 * @param {Array} rows parsePeople 的结果
 * @param {string} mode 'weight' 按份数 | 'paid' 各付各的+公共部分按人头 | 'equal' 完全均摊
 */
export function splitShares(totalCents, rows, mode) {
  const m = mode || 'weight'
  const active = rows.filter((r) => (m === 'paid' ? r.paid !== null : r.weight > 0))
  if (!active.length) throw new Error(m === 'paid' ? '按消费额分摊需要先填每人金额' : '至少要有一个人参与分摊')
  let shares
  let commonPart = 0
  if (m === 'paid') {
    const own = active.map((r) => toCents(r.paid))
    commonPart = totalCents - own.reduce((a, b) => a + b, 0)
    const extra = allocate(commonPart, own.map(() => 1))
    shares = own.map((v, i) => v + extra[i])
  } else {
    const weights = m === 'equal' ? active.map(() => 1) : active.map((r) => r.weight)
    shares = allocate(totalCents, weights)
  }
  const items = rows.map((r) => ({
    name: r.name,
    paid: r.paid,
    weight: r.weight,
    join: m === 'paid' ? r.paid !== null : r.weight > 0,
    own: 0,
    common: 0,
    share: 0,
    shareText: '不参与',
    percent: 0,
  }))
  active.forEach((r, k) => {
    const t = items[rows.indexOf(r)]
    t.share = shares[k]
    t.own = m === 'paid' ? toCents(r.paid) : 0
    t.common = m === 'paid' ? shares[k] - t.own : 0
    t.shareText = centsText(shares[k])
    t.percent = totalCents ? Math.round((shares[k] / totalCents) * 1000) / 10 : 0
  })
  const max = shares.reduce((a, b) => (b > a ? b : a), shares[0])
  const min = shares.reduce((a, b) => (b < a ? b : a), shares[0])
  return {
    mode: m,
    total: totalCents,
    totalText: centsText(totalCents),
    headCount: active.length,
    perHead: Math.floor(totalCents / active.length),
    perHeadText: centsText(Math.round(totalCents / active.length)),
    commonPart,
    commonPartText: commonPart ? centsText(commonPart) : '',
    spread: max - min,
    sumCheck: shares.reduce((a, b) => a + b, 0) === totalCents,
    items,
    notice:
      m === 'paid'
        ? commonPart === 0
          ? '各自消费额之和正好等于总额，不需要再摊公共部分'
          : '各自消费额之外还有 ' + centsText(commonPart) + ' 元（税/服务费/满减差额），已按人头摊掉'
        : max === min
          ? '每人金额完全相同'
          : '总额除不尽或份数不同，最大相差 ' + centsText(max - min) + ' 元；合计与总额完全一致',
  }
}

/* ------------------------------------------------------------ 税费 / 小费 / 抹零 */

/**
 * 通用「按顺序算价」链路。
 * 每一步都可选是否在中途取整——先后顺序真正影响结果的，正是中途取整与
 * 固定额加减；纯百分比乘除是可交换的，函数会明确提示这一点。
 *
 * @param {number} baseCents 起始金额（分）
 * @param {Array} ops [{kind:'tax'|'discount'|'add'|'sub'|'tip'|'round', v:百分数或分, mode, unitCents, label}]
 */
export function priceChain(baseCents, ops) {
  let v = baseCents
  const steps = [{ label: '起始金额', expr: '= 输入', value: v, exact: v }]
  let hasPercentOnly = true
  ;(ops || []).forEach((op) => {
    const before = v
    let exact = v
    if (op.kind === 'tax' || op.kind === 'tip') {
      exact = v * (1 + num(op.v) / 100)
      steps.push({ label: op.label || (op.kind === 'tax' ? '加税' : '加小费'), expr: op.kind === 'tax' ? '× (1 + ' + num(op.v) + '%)' : '× (1 + ' + num(op.v) + '%)', value: exact, exact })
      v = exact
    } else if (op.kind === 'discount') {
      exact = v * (1 - num(op.v) / 100)
      steps.push({ label: op.label || '折扣', expr: '× (1 − ' + num(op.v) + '%)', value: exact, exact })
      v = exact
    } else if (op.kind === 'add' || op.kind === 'sub') {
      hasPercentOnly = false
      exact = v + (op.kind === 'add' ? 1 : -1) * toCents(op.v)
      steps.push({ label: op.label || (op.kind === 'add' ? '加上固定额' : '减固定额'), expr: (op.kind === 'add' ? '+ ' : '− ') + centsText(toCents(op.v)), value: exact, exact })
      v = exact
    } else if (op.kind === 'round') {
      hasPercentOnly = false
      const unit = op.unitCents > 0 ? op.unitCents : 100
      v = roundCents(v, op.mode || 'down', unit)
      steps.push({ label: op.label || '抹零', expr: roundModeName(op.mode) + '到' + centsText(unit) + ' 元档', value: v, exact })
    }
    if (steps.length) steps[steps.length - 1].delta = v - before
  })
  return {
    start: baseCents,
    final: Math.round(v),
    finalText: centsText(Math.round(v)),
    totalDelta: Math.round(v) - baseCents,
    steps: steps.map((s) => ({ ...s, value: Math.round(s.value), text: centsText(Math.round(s.value)) })),
    notice: hasPercentOnly
      ? '这条链路里只有百分比乘除，乘法可交换：调换税率与小费/折扣的先后不会改变结果。真正会影响金额的是取整与加减固定额。'
      : '链路含取整或固定额加减，先后顺序会改变结果，请按店家实际算法排序。',
  }
}

function num(v) {
  const n = typeof v === 'number' ? v : Number(v)
  return isFinite(n) ? n : 0
}

/** 取整：down=抹去（朝零方向）、up=进到（远离零）、nearest=四舍五入；对负数按绝对值对称 */
export function roundCents(cents, mode, unitCents) {
  const unit = unitCents > 0 ? unitCents : 100
  const sign = cents < 0 ? -1 : 1
  const q = Math.abs(cents) / unit
  let k
  if (mode === 'up') k = Math.ceil(q - 1e-9)
  else if (mode === 'nearest') k = Math.round(q + 1e-9)
  else k = Math.floor(q + 1e-9)
  return sign * k * unit
}

export function roundModeName(mode) {
  return mode === 'up' ? '向上进' : mode === 'nearest' ? '四舍五入' : '向下抹'
}

/** 三种常见「税率 / 折扣 / 抹零」顺序的对比 */
export function orderCompare(baseCents, opts) {
  const o = opts || {}
  const tax = o.taxRate || 0
  const disc = o.discountRate || 0
  const tip = o.tipRate || 0
  const unit = o.roundUnitCents || 100
  const mode = o.roundMode || 'down'
  const lists = {
    折后计税: [{ kind: 'discount', v: disc }, { kind: 'tax', v: tax }, { kind: 'tip', v: tip }, { kind: 'round', mode, unitCents: unit }],
    先计税再折: [{ kind: 'tax', v: tax }, { kind: 'discount', v: disc }, { kind: 'tip', v: tip }, { kind: 'round', mode, unitCents: unit }],
    先抹零再计税: [{ kind: 'round', mode, unitCents: unit }, { kind: 'discount', v: disc }, { kind: 'tax', v: tax }, { kind: 'tip', v: tip }],
  }
  const out = Object.keys(lists).map((k) => {
    const r = priceChain(baseCents, lists[k])
    return { name: k, final: r.final, finalText: r.finalText, ops: lists[k].map((x) => x.kind), steps: r.steps }
  })
  const vals = out.map((x) => x.final)
  return {
    variants: out,
    identical: Math.max.apply(null, vals) === Math.min.apply(null, vals),
    maxDiff: Math.max.apply(null, vals) - Math.min.apply(null, vals),
    notice:
      Math.max.apply(null, vals) === Math.min.apply(null, vals)
        ? '这三种顺序算出来一样：纯百分比可交换，只有取整位置会带来差异'
        : '顺序不同结果不同，最大相差 ' + centsText(Math.max.apply(null, vals) - Math.min.apply(null, vals)) + ' 元，付款前问清店家按哪种口径',
  }
}

/* ------------------------------------------------------------ 撮平转账 */

/**
 * 最少笔数撮平（贪心）：把「已垫付」和「应分摊」做差，欠钱的人还给垫付多的人
 * @param {Array} rows [{name, paid(分|null), share(分)}]
 */
export function settle(rows) {
  const list = (rows || []).map((r) => ({ name: r.name, balance: (r.paid === null || r.paid === undefined ? 0 : r.paid) - r.share }))
  const debtors = list.filter((x) => x.balance < 0).map((x) => ({ ...x }))
  const creditors = list.filter((x) => x.balance > 0).map((x) => ({ ...x }))
  const transfers = []
  let guard = 0
  while (debtors.length && creditors.length && guard++ < 5000) {
    debtors.sort((a, b) => a.balance - b.balance)
    creditors.sort((a, b) => b.balance - a.balance)
    const d = debtors[0]
    const c = creditors[0]
    const amount = Math.min(-d.balance, c.balance)
    transfers.push({ from: d.name, to: c.name, amount, amountText: centsText(amount) })
    d.balance += amount
    c.balance -= amount
    if (Math.abs(d.balance) < 1) debtors.shift()
    if (Math.abs(c.balance) < 1) creditors.shift()
  }
  const residual = list.reduce((a, b) => a + b.balance, 0)
  return {
    transfers,
    count: transfers.length,
    upperBound: Math.max(0, list.length - 1),
    balances: list.map((x) => ({ name: x.name, balance: x.balance, text: (x.balance >= 0 ? '应收 ' : '应付 ') + centsText(Math.abs(x.balance)) })),
    settled: Math.abs(residual) < 1 && transfers.every((t) => t.amount > 0),
    notice: transfers.length
      ? '贪心撮合，' + list.length + ' 个人最多 ' + Math.max(0, list.length - 1) + ' 笔即可完成，本方案 ' + transfers.length + ' 笔'
      : '大家垫付和应摊一致，不需要互相转账',
  }
}

/* ------------------------------------------------------------ 群聊文本 */

/**
 * 生成可以直接粘到群里的 AA 文本
 */
export function splitText(o) {
  const cur = currencyOf(o.cur)
  const L = []
  L.push('【AA 账单】' + (o.title ? ' ' + o.title : ''))
  if (o.chain && o.chain.steps.length > 1) {
    o.chain.steps.forEach((s) => L.push(s.label + '：' + cur.symbol + s.text))
  }
  L.push('合计：' + moneyText(o.total, o.cur))
  L.push('参与：' + o.headCount + ' 人　人均：' + moneyText(Math.round(o.total / o.headCount), o.cur))
  L.push('—— 各人金额 ——')
  o.items.forEach((it) => {
    if (!it.join) L.push(it.name + '：不参与')
    else L.push(it.name + '：' + moneyText(it.share, o.cur) + (it.paid !== null ? '（已垫 ' + moneyText(toCents(it.paid), o.cur) + '）' : ''))
  })
  const st = settle(o.items.map((it) => ({ name: it.name, paid: it.paid === null ? null : toCents(it.paid), share: it.share })))
  if (st.transfers.length) {
    L.push('—— 怎么转 ——')
    st.transfers.forEach((t) => L.push(t.from + ' → ' + t.to + '　' + moneyText(t.amount, o.cur)))
  }
  L.push('（用「口袋工具箱 · 分摊账单」生成，金额仅供参考）')
  return L.join('\n')
}

/** 汇率只做显示：手填多少按多少 */
export function fxDisplay(cents, rate, fromKey, toKey) {
  const r = num(rate)
  const a = currencyOf(fromKey)
  const b = currencyOf(toKey)
  if (!r) {
    return { text: moneyText(cents, fromKey) + '（未填汇率，不做换算）', converted: null, note: '不联网取数：汇率要手填，填了就按你填的算' }
  }
  const converted = Math.round(cents * r)
  return {
    rate: r,
    text: moneyText(cents, fromKey) + ' × ' + r + ' = ' + moneyText(converted, toKey),
    converted,
    note: '汇率为手填值（' + a.code + '→' + b.code + '），不是实时行情，仅供估算',
  }
}
