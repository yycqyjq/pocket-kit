/**
 * 中国大陆个人所得税与社保速算
 * ------------------------------------------------------------
 * 纯函数层：只吃数字与选项，不碰 uni、不碰 DOM。
 *
 * 政策口径（每一项都标了文件与年份，视图会原样展示）
 *   · 综合所得年度税率表：《中华人民共和国个人所得税法》2018 年第七次修正，
 *     2019-01-01 起施行；基本减除费用 60000 元/年（即每月 5000 元）。
 *   · 全年一次性奖金单独计税：财税〔2018〕164 号，执行期限经
 *     财政部 税务总局公告 2023 年第 30 号延长至 2027-12-31。
 *   · 专项附加扣除：国发〔2018〕41 号为原始口径；子女教育、3 岁以下婴幼儿照护、
 *     赡养老人三项标准自 2023-01-01 起提高（国发〔2023〕13 号），本表用提高后的值。
 *   · 劳务报酬 / 稿酬预扣预缴：国家税务总局公告 2018 年第 61 号。
 *   · 经营所得五级税率表：与个税法同批（2018 年修正）。
 *   · 社保与公积金比例：只是全国常见区间里的一组**示例默认值**，
 *     缴费基数上下限、比例、个人定额部分各城市各年度都不同，
 *     全部做成可编辑参数，请照着当地社保局与公积金中心当年公布的通知改。
 *
 * 本工具按上述公开口径做算术，不构成税务、社保、法律或投资建议；
 * 实际应缴额以税务机关核定结果与单位扣缴明细为准。
 */

import { money } from './finance'

/** 政策口径年份，视图直接引用，避免用户误以为是「今年最新」 */
export const POLICY_NOTE =
  '税率表口径：个人所得税法 2018 年修正（2019 施行）；专项附加扣除含 2023 年提高后的标准；年终奖单独计税延至 2027-12-31；社保比例为示例默认值'

/* ------------------------------------------------------------ 税率表（数据） */

/**
 * 综合所得年度税率表（也用于工资薪金累计预扣）。
 * up 为该档上限（含），应纳税所得额 ≤ up 落入该档；末档为 Infinity。
 */
export const ANNUAL_BRACKETS = [
  { up: 36000, rate: 0.03, quick: 0, note: '不超过 3.6 万' },
  { up: 144000, rate: 0.1, quick: 2520, note: '3.6 万 ~ 14.4 万' },
  { up: 300000, rate: 0.2, quick: 16920, note: '14.4 万 ~ 30 万' },
  { up: 420000, rate: 0.25, quick: 31920, note: '30 万 ~ 42 万' },
  { up: 660000, rate: 0.3, quick: 52920, note: '42 万 ~ 66 万' },
  { up: 960000, rate: 0.35, quick: 85920, note: '66 万 ~ 96 万' },
  { up: Infinity, rate: 0.45, quick: 181920, note: '96 万以上' },
]

/**
 * 按月换算后的税率表：全年一次性奖金单独计税用这一张。
 * 数值上正好等于年度表 ÷ 12（速算扣除数同比缩放），不是另一套政策。
 */
export const MONTHLY_BRACKETS = [
  { up: 3000, rate: 0.03, quick: 0, note: '不超过 3000' },
  { up: 12000, rate: 0.1, quick: 210, note: '3000 ~ 1.2 万' },
  { up: 25000, rate: 0.2, quick: 1410, note: '1.2 万 ~ 2.5 万' },
  { up: 35000, rate: 0.25, quick: 2660, note: '2.5 万 ~ 3.5 万' },
  { up: 55000, rate: 0.3, quick: 4410, note: '3.5 万 ~ 5.5 万' },
  { up: 80000, rate: 0.35, quick: 7160, note: '5.5 万 ~ 8 万' },
  { up: Infinity, rate: 0.45, quick: 15160, note: '8 万以上' },
]

/** 经营所得 五级超额累进（年应纳税所得额） */
export const BUSINESS_BRACKETS = [
  { up: 30000, rate: 0.05, quick: 0, note: '不超过 3 万' },
  { up: 90000, rate: 0.1, quick: 1500, note: '3 万 ~ 9 万' },
  { up: 300000, rate: 0.2, quick: 10500, note: '9 万 ~ 30 万' },
  { up: 500000, rate: 0.3, quick: 40500, note: '30 万 ~ 50 万' },
  { up: Infinity, rate: 0.35, quick: 65500, note: '50 万以上' },
]

/** 劳务报酬预扣预缴（对「减除费用后的余额」适用的三级表） */
export const LABOR_BRACKETS = [
  { up: 20000, rate: 0.2, quick: 0, note: '不超过 2 万' },
  { up: 50000, rate: 0.3, quick: 2000, note: '2 万 ~ 5 万' },
  { up: Infinity, rate: 0.4, quick: 7000, note: '5 万以上' },
]

/** 基本减除费用（元/年） */
export const BASIC_DEDUCTION = 60000
/** 每月减除费用（累计预扣法用） */
export const BASIC_DEDUCTION_MONTHLY = 5000

/* ------------------------------------------------------------ 专项附加扣除 */

/**
 * 专项附加扣除清单。monthly 为每月标准，yearly 为一次性标准，
 * from 标出该数目的政策出处与提标年份。
 */
export const SPECIAL_DEDUCTIONS = [
  {
    key: 'childrenEdu',
    name: '子女教育',
    monthly: 2000,
    unit: '每个子女',
    from: '国发〔2018〕41 号 1000 元 → 国发〔2023〕13 号提高到 2000 元',
    desc: '年满 3 岁至学前教育、学历教育结束，每个子女每月 2000 元，父母可各扣 50% 或一方全扣',
  },
  {
    key: 'infantEdu',
    name: '3 岁以下婴幼儿照护',
    monthly: 2000,
    unit: '每个婴幼儿',
    from: '国发〔2022〕8 号 1000 元 → 国发〔2023〕13 号提高到 2000 元',
    desc: '每个婴幼儿每月 2000 元',
  },
  {
    key: 'elderCare',
    name: '赡养老人',
    monthly: 3000,
    unit: '按本人',
    from: '国发〔2018〕41 号 2000 元 → 国发〔2023〕13 号提高到 3000 元',
    desc: '独生子女每月 3000 元；非独生子女与兄弟姐妹分摊这 3000 元，每人不超过 1500 元',
  },
  {
    key: 'homeLoan',
    name: '住房贷款利息',
    monthly: 1000,
    unit: '首套',
    from: '国发〔2018〕41 号',
    desc: '首套住房贷款利息，每月 1000 元，最长 240 个月；与住房租金不能同时扣',
  },
  {
    key: 'homeRent',
    name: '住房租金',
    monthly: 1500,
    unit: '按城市档位',
    from: '国发〔2018〕41 号',
    desc: '直辖市/省会/计划单列市 1500，市辖区户籍人口超 100 万 1100，不超过 100 万 800',
    tiers: [
      { key: '1500', monthly: 1500, name: '1500 元/月' },
      { key: '1100', monthly: 1100, name: '1100 元/月' },
      { key: '800', monthly: 800, name: '800 元/月' },
    ],
  },
  {
    key: 'continueEdu',
    name: '继续教育',
    monthly: 400,
    unit: '学历或资格二选一',
    from: '国发〔2018〕41 号',
    desc: '学历教育每月 400 元（最长 48 个月）；职业资格在取得证书当年一次性扣 3600 元',
    tiers: [
      { key: 'academic', monthly: 400, name: '学历继续教育 400/月' },
      { key: 'exam', yearly: 3600, name: '职业资格 3600/年' },
    ],
  },
  {
    key: 'medical',
    name: '大病医疗',
    monthly: 0,
    unit: '按自付额',
    from: '国发〔2018〕41 号',
    desc: '医保目录内个人自付累计超过 15000 元的部分，在 80000 元限额内据实扣除（只在汇算时扣）',
    threshold: 15000,
    cap: 80000,
  },
]

/**
 * 汇总专项附加扣除。
 * @param {object} [sel]
 *   childrenEdu / infantEdu  孩子个数
 *   elderCare  'none' | 'only' | { shared: 分摊人数 }
 *   homeLoan   boolean
 *   homeRent   0 | 'none' | 1500 | 1100 | 800
 *   continueEdu 'none' | 'academic' | 'exam'
 *   medical    年度医保目录内自付金额
 * @returns {{rows:Array, monthlyTotal:number, yearlyTotal:number, medicalYear:number, grandTotal:number, note:string}}
 */
export function specialDeductions(sel) {
  const s = sel || {}
  const rows = []
  let monthly = 0
  let onceYearly = 0

  const push = (key, name, amount, how) => {
    if (amount > 0) {
      rows.push({ key, name, amount: round2(amount), per: '月', how: how || '' })
      monthly += amount
    }
  }

  const kids = intOr(s.childrenEdu)
  push('childrenEdu', '子女教育', kids * 2000, kids + ' 个孩子 × 2000 元/月')
  const infants = intOr(s.infantEdu)
  push('infantEdu', '3 岁以下婴幼儿照护', infants * 2000, infants + ' 个孩子 × 2000 元/月')

  const elder = s.elderCare
  if (elder === 'only' || elder === true) {
    push('elderCare', '赡养老人（独生子女）', 3000, '3000 元/月')
  } else if (elder && typeof elder === 'object') {
    const n = Math.max(2, intOr(elder.shared) || 2)
    push('elderCare', '赡养老人（分摊）', Math.min(1500, 3000 / n), '3000 元由 ' + n + ' 人分摊，每人上限 1500')
  }

  if (s.homeLoan) push('homeLoan', '住房贷款利息', 1000, '1000 元/月')

  const rent = numOr(s.homeRent)
  if (rent > 0) push('homeRent', '住房租金', rent, rent + ' 元/月（按城市档位）')

  const edu = s.continueEdu
  if (edu === 'academic') push('continueEdu', '继续教育（学历）', 400, '400 元/月')
  else if (edu === 'exam') {
    rows.push({ key: 'continueEdu', name: '继续教育（职业资格）', amount: 3600, per: '年', how: '3600 元/年，取证当年一次性' })
    onceYearly += 3600
  }

  let medicalYear = 0
  const med = numOr(s.medical)
  if (med > 15000) medicalYear = Math.min(80000, med - 15000)
  if (medicalYear > 0) {
    rows.push({ key: 'medical', name: '大病医疗', amount: round2(medicalYear), per: '年', how: '自付 ' + fmtYuan(med) + ' − 15000，限额 80000' })
  }

  const monthlyTotal = monthly
  const yearlyTotal = monthlyTotal * 12 + onceYearly
  return {
    rows,
    monthlyTotal: round2(monthlyTotal),
    yearlyTotal: round2(yearlyTotal),
    medicalYear: round2(medicalYear),
    grandTotal: round2(yearlyTotal + medicalYear),
    note: '大病医疗只能在年度汇算时扣，平时预扣用不上；住房贷款利息与住房租金不能同时享受',
  }
}

/* ------------------------------------------------------------ 底层算术 */

/** 命中税率表中的哪一档 */
export function bracketOf(taxable, table) {
  const t = numOr(taxable)
  const list = table || ANNUAL_BRACKETS
  for (let i = 0; i < list.length; i++) {
    if (t <= list[i].up) {
      return { index: i, up: list[i].up, rate: list[i].rate, quick: list[i].quick, note: list[i].note, percent: list[i].rate * 100 }
    }
  }
  const last = list[list.length - 1]
  return { index: list.length - 1, up: last.up, rate: last.rate, quick: last.quick, note: last.note, percent: last.rate * 100 }
}

/**
 * 超额累进计税：税额 = 应纳税所得额 × 税率 − 速算扣除数。
 * 同时用「逐档累加」再算一遍，用来验证速算扣除数没抄错。
 * @returns {{taxable,tax,rate,percent,quick,bracketNote,byRate,rows,quickCheck,note}}
 */
export function taxFromTaxable(taxable, table) {
  const t = numOr(taxable)
  const list = table || ANNUAL_BRACKETS
  if (t <= 0) {
    return {
      taxable: 0,
      tax: 0,
      rate: 0,
      percent: 0,
      quick: 0,
      bracketNote: '',
      byRate: 0,
      rows: [],
      quickCheck: 0,
      note: '应纳税所得额不为正，无需缴税',
    }
  }
  const hit = bracketOf(t, list)
  const rows = []
  let byRate = 0
  for (let i = 0; i < list.length; i++) {
    const lo = i === 0 ? 0 : list[i - 1].up
    const width = isFinite(list[i].up) ? list[i].up - lo : Infinity
    const inBracket = t > lo ? Math.min(t - lo, width) : 0
    if (inBracket <= 0) break
    const part = inBracket * list[i].rate
    byRate += part
    rows.push({
      range: fmtYuan(lo) + ' ~ ' + (isFinite(list[i].up) ? fmtYuan(list[i].up) : '以上'),
      amount: round2(inBracket),
      percent: list[i].rate * 100,
      tax: round2(part),
    })
  }
  const quickByDef = round2(t * hit.rate - byRate)
  return {
    taxable: round2(t),
    tax: round2(byRate),
    rate: hit.rate,
    percent: hit.rate * 100,
    quick: hit.quick,
    bracketNote: hit.note,
    byRate: round2(byRate),
    rows,
    quickCheck: quickByDef,
    note:
      Math.abs(quickByDef - hit.quick) < 0.01
        ? '速算扣除数 ' + hit.quick + ' 与逐档累加结果一致'
        : '注意：逐档累加得到的速算扣除数为 ' + quickByDef + '，与表内 ' + hit.quick + ' 不符',
  }
}

/* ------------------------------------------------------------ 综合所得年度 */

/**
 * 综合所得年度个税。
 * @param {object} [o]
 *   income           年度收入合计（元，不含单独计税的年终奖）
 *   social           年度三险一金个人部分（元）
 *   deductionYearly  专项附加扣除年度额（元）；也可直接传 specialDeductions() 的返回对象
 *   other            依法确定的其它扣除（元）
 *   basic            基本减除费用，默认 60000
 */
export function annualIit(o) {
  const p = o || {}
  const income = numOr(p.income)
  const basic = p.basic === undefined || p.basic === '' ? BASIC_DEDUCTION : numOr(p.basic)
  const social = numOr(p.social)
  const other = numOr(p.other)
  let yearly = 0
  if (p.deductions && typeof p.deductions === 'object' && p.deductions.yearlyTotal !== undefined) {
    yearly = numOr(p.deductions.yearlyTotal) + numOr(p.deductions.medicalYear)
  } else if (p.deductionYearly !== undefined && p.deductionYearly !== null && p.deductionYearly !== '') {
    yearly = numOr(p.deductionYearly)
  } else if (p.special && typeof p.special === 'object') {
    yearly = numOr(p.special.yearlyTotal) + numOr(p.special.medicalYear)
  } else {
    yearly = numOr(p.special)
  }
  const taxableRaw = income - basic - social - yearly - other
  const t = taxFromTaxable(taxableRaw > 0 ? taxableRaw : 0, ANNUAL_BRACKETS)
  const net = income - social - yearly - t.tax
  return {
    income: round2(income),
    basic: round2(basic),
    social: round2(social),
    specialAdditional: round2(yearly),
    other: round2(other),
    taxable: round2(Math.max(0, taxableRaw)),
    taxableRaw: round2(taxableRaw),
    negative: taxableRaw < 0,
    tax: t.tax,
    percent: t.percent,
    quick: t.quick,
    bracketNote: t.bracketNote,
    rows: t.rows,
    net: round2(net),
    // 有效税率 = 真正交出去的 ÷ 收入，比「边际税率」更有参考价值
    effectiveRate: income > 0 ? round2(round4(t.tax / income) * 100) : 0,
    takeHomeRate: income > 0 ? round2(round4(net / income) * 100) : 0,
    note:
      taxableRaw < 0
        ? '扣除项已超过收入，应纳税所得额按 0 计；已预缴的税额可在汇算时申请退还'
        : '',
  }
}

/* ------------------------------------------------------------ 年终奖 */

/** 年终奖单独计税：奖金 ÷ 12 定档，再对全额套用该档税率与速算扣除数 */
export function bonusSeparate(bonus) {
  const b = numOr(bonus)
  if (b <= 0) return { bonus: 0, tax: 0, net: round2(b), perMonth: 0, percent: 0, quick: 0, method: '单独计税', note: '没有奖金' }
  const perMonth = b / 12
  const hit = bracketOf(perMonth, MONTHLY_BRACKETS)
  const tax = round2(b * hit.rate - hit.quick)
  return {
    bonus: round2(b),
    perMonth: round2(perMonth),
    percent: hit.rate * 100,
    rate: hit.rate,
    quick: hit.quick,
    bracketNote: hit.note,
    tax,
    net: round2(b - tax),
    effectiveRate: round2(round4(tax / b) * 100),
    method: '单独计税（财税〔2018〕164 号，延至 2027-12-31）',
    note:
      fmtYuan(b) + ' ÷ 12 = ' + fmtYuan(perMonth) + '，落在「' + hit.note + '」档：' +
      fmtYuan(b) + ' × ' + hit.rate * 100 + '% − ' + hit.quick + ' = ' + fmtYuan(tax),
  }
}

/** 年终奖并入综合所得：比较「不含奖金」与「含奖金」两种年度税额之差 */
export function bonusMerged(o, bonus) {
  const b = numOr(bonus)
  const base = annualIit(o)
  const withBonus = annualIit(Object.assign({}, o || {}, { income: base.income + b }))
  const added = round2(withBonus.tax - base.tax)
  return {
    baseTax: base.tax,
    mergedTax: withBonus.tax,
    addedTax: added,
    bonus: round2(b),
    net: round2(b - added),
    effectiveRate: b > 0 ? round2(round4(added / b) * 100) : 0,
    method: '并入综合所得（汇算清缴时合并计税）',
  }
}

/**
 * 两种算法对比，直接给出更省的选择。
 * @param {object} o annualIit 的入参（income 不含年终奖）
 */
export function bonusCompare(o, bonus) {
  const b = numOr(bonus)
  const sep = bonusSeparate(b)
  const mer = bonusMerged(o, b)
  const diff = round2(sep.tax - mer.addedTax)
  return {
    bonus: round2(b),
    separate: sep,
    merged: mer,
    diff,
    better: Math.abs(diff) < 0.5 ? 'tie' : diff < 0 ? 'separate' : 'merged',
    betterName: Math.abs(diff) < 0.5 ? '两种一样' : diff < 0 ? '单独计税更省' : '并入综合所得更省',
    save: round2(Math.abs(diff)),
    note:
      Math.abs(diff) < 0.5
        ? '两种方法税额相同，随便选'
        : (diff < 0 ? '单独计税少交 ' : '并入综合所得少交 ') + fmtYuan(Math.abs(diff)) + ' 元',
  }
}

/**
 * 年终奖「多发 1 元、到手反而更少」的无效区间。
 * 不抄现成表格，而是在每一档里解 net(x) = x·(1 − r) + q 的交点，
 * 因此结果与本文件税率表严格自洽。
 * @param {number} [step] 起算步长（元），默认 1
 */
export function bonusTrapRanges(step) {
  const st = numOr(step) > 0 ? numOr(step) : 1
  const out = []
  for (let i = 0; i < MONTHLY_BRACKETS.length - 1; i++) {
    if (!isFinite(MONTHLY_BRACKETS[i].up)) continue
    const boundary = MONTHLY_BRACKETS[i].up * 12
    const netB = round2(boundary - bonusSeparate(boundary).tax)
    const from = boundary + st
    // 起点就没掉进坑里，说明这一档不存在无效区间
    if (round2(from - bonusSeparate(from).tax) >= netB) continue
    let hi = from
    let cursor = from
    for (let j = 0; j < MONTHLY_BRACKETS.length; j++) {
      const b = MONTHLY_BRACKETS[j]
      const segLo = j === 0 ? 0 : MONTHLY_BRACKETS[j - 1].up * 12
      const segEnd = isFinite(b.up) ? b.up * 12 : Infinity
      if (cursor > segEnd) continue
      const start = Math.max(cursor, segLo + st)
      // 本档内 net(x) = x·(1 − r) + q，解 net(x) = netB 得到回正点
      const lastBad = Math.floor((netB - b.quick) / (1 - b.rate) - 1e-9)
      if (lastBad < start) break // 本档起点已回正，坑在上一档就结束了
      hi = Math.min(lastBad, segEnd)
      if (lastBad < segEnd) break // 坑在本档内结束
      cursor = segEnd + st // 整档都在坑里，跨到下一档继续找
    }
    if (hi >= from) {
      out.push({
        boundary: round2(boundary),
        from: round2(from),
        to: round2(hi),
        boundaryNet: netB,
        worstNet: round2(hi - bonusSeparate(hi).tax),
        lost: round2(netB - (hi - bonusSeparate(hi).tax)),
        note:
          '发 ' + fmtYuan(boundary) + ' 到手 ' + fmtYuan(netB) + '；发 ' + fmtYuan(hi) +
          ' 到手只有 ' + fmtYuan(hi - bonusSeparate(hi).tax) + '，多给 ' + fmtYuan(hi - boundary) + ' 反而少拿 ' + fmtYuan(netB - (hi - bonusSeparate(hi).tax)),
      })
    }
  }
  return out
}

/** 给定一个奖金数，判断是否落在无效区间，并给出建议值 */
export function bonusAdvice(bonus) {
  const b = round2(numOr(bonus))
  const traps = bonusTrapRanges()
  const net = round2(b - bonusSeparate(b).tax)
  for (let i = 0; i < traps.length; i++) {
    const t = traps[i]
    if (b >= t.from && b <= t.to) {
      return {
        inTrap: true,
        bonus: b,
        currentNet: net,
        suggest: t.boundary,
        suggestNet: t.boundaryNet,
        more: round2(t.boundaryNet - net),
        note:
          '奖金落在 ' + fmtYuan(t.from) + ' ~ ' + fmtYuan(t.to) + ' 的无效区间里，' +
          '改成 ' + fmtYuan(t.boundary) + ' 元到手反而多 ' + fmtYuan(t.boundaryNet - net) + ' 元（差额可换成其它福利）',
      }
    }
  }
  return { inTrap: false, bonus: b, currentNet: net, note: '不在无效区间内，单独计税的到手金额随奖金单调增加' }
}

/* ------------------------------------------------------------ 社保公积金 */

/**
 * 五险一金默认参数（示例口径，各地差异大，全部可改）。
 * personal / company 为费率（小数）；baseLow / baseHigh 为缴费基数上下限（元/月）。
 */
export function defaultInsurance() {
  return {
    base: 0,
    baseLow: 6000,
    baseHigh: 30000,
    items: [
      { key: 'pension', name: '养老保险', personal: 0.08, company: 0.16, extra: 0, note: '个人 8% 全部进个人账户；单位 16%（2019 年起统一）' },
      { key: 'medical', name: '医疗保险', personal: 0.02, company: 0.09, extra: 3, note: '个人 2% + 每月定额大病救助 3 元（不少城市如此，金额可改）' },
      { key: 'unemployed', name: '失业保险', personal: 0.005, company: 0.005, extra: 0, note: '个人与单位常见各 0.5%' },
      { key: 'injury', name: '工伤保险', personal: 0, company: 0.004, extra: 0, note: '个人不缴；单位按行业 0.2%~1.9% 浮动' },
      { key: 'maternity', name: '生育保险', personal: 0, company: 0, extra: 0, note: '多数城市已并入医疗保险，默认 0' },
      { key: 'fund', name: '住房公积金', personal: 0.12, company: 0.12, extra: 0, note: '5%~12% 之间由单位选定，默认 12%' },
    ],
  }
}

/**
 * 归一化并补齐参数表。
 * 注意：传了 items 就是「整表替换」（视图每次都提交完整的 6 行表格），
 * 只想关掉某个险种请把它的比例改成 0，而不是把它从数组里删掉。
 */
export function normalizeInsurance(opt) {
  const d = defaultInsurance()
  const o = opt || {}
  const src = o.items && o.items.length ? o.items : d.items
  const items = src.map((x) => {
    const base = d.items.filter((y) => y.key === x.key)[0] || {}
    return {
      key: x.key,
      name: x.name || base.name || x.key,
      personal: numOr(x.personal === undefined ? base.personal : x.personal),
      company: numOr(x.company === undefined ? base.company : x.company),
      extra: numOr(x.extra === undefined ? base.extra : x.extra),
      note: x.note === undefined ? base.note || '' : x.note,
    }
  })
  return {
    base: numOr(o.base),
    baseLow: numOr(o.baseLow === undefined ? d.baseLow : o.baseLow),
    baseHigh: numOr(o.baseHigh === undefined ? d.baseHigh : o.baseHigh),
    items,
  }
}

/**
 * 算出实际缴费基数与逐险种金额。
 * @param {number} gross 月工资（元），base 未填时按工资作基数
 */
export function insuranceOf(gross, opt) {
  const p = normalizeInsurance(opt)
  const g = numOr(gross)
  let base = p.base > 0 ? p.base : g
  let capped = ''
  if (p.baseLow > 0 && base < p.baseLow) {
    capped = '工资低于缴费基数下限 ' + fmtYuan(p.baseLow) + ' 元，按下限缴'
    base = p.baseLow
  }
  if (p.baseHigh > 0 && base > p.baseHigh) {
    capped = '工资高于缴费基数上限 ' + fmtYuan(p.baseHigh) + ' 元，按上限缴（超出部分不计入）'
    base = p.baseHigh
  }
  let personalTotal = 0
  let companyTotal = 0
  const rows = p.items.map((it) => {
    const personal = it.personal > 0 || it.extra > 0 ? round2(base * it.personal + it.extra) : 0
    const company = round2(base * it.company)
    personalTotal += personal
    companyTotal += company
    return {
      key: it.key,
      name: it.name,
      personalRate: round4(it.personal * 100),
      companyRate: round4(it.company * 100),
      personal,
      company,
      extra: it.extra,
      note: it.note,
    }
  })
  const fund = rows.filter((r) => r.key === 'fund')[0] || { personal: 0, company: 0 }
  return {
    gross: round2(g),
    base: round2(base),
    baseLow: round2(p.baseLow),
    baseHigh: round2(p.baseHigh),
    capped,
    rows,
    personalTotal: round2(personalTotal),
    companyTotal: round2(companyTotal),
    // 公积金个人 + 单位全额进入个人账户，「到手看不见」但确实是自己的钱
    fundBoth: round2(fund.personal + fund.company),
    personalOnlyTotal: round2(personalTotal),
    totalCost: round2(g + companyTotal),
  }
}

/* ------------------------------------------------------------ 月薪 → 到手 */

/**
 * 单月速算（简化口径：把 5000 元/月当作当月减除费用）。
 * 真实工资薪金按「累计预扣法」逐月累计算，前几个月少扣、年底多扣，
 * 本函数的单月税额只在平均意义上等于全年税额 ÷ 12。逐月明细请用 withholdingSchedule()。
 */
export function salaryMonthly(o) {
  const p = o || {}
  const gross = numOr(p.gross)
  if (!(gross > 0)) throw new Error('请输入月工资')
  const ins = insuranceOf(gross, p.insurance)
  const specialMonthly = numOr(p.specialMonthly)
  const basic = p.basic === undefined || p.basic === '' ? BASIC_DEDUCTION_MONTHLY : numOr(p.basic)
  const taxableRaw = gross - ins.personalTotal - basic - specialMonthly
  const t = taxFromTaxable(taxableRaw > 0 ? taxableRaw : 0, ANNUAL_BRACKETS)
  const net = gross - ins.personalTotal - t.tax
  return {
    gross: round2(gross),
    insurance: ins,
    personalSocial: ins.personalTotal,
    specialMonthly: round2(specialMonthly),
    basic: round2(basic),
    taxable: round2(Math.max(0, taxableRaw)),
    tax: t.tax,
    percent: t.percent,
    net: round2(net),
    // 到手 + 公积金双边入账 = 广义可支配
    netWide: round2(net + ins.fundBoth),
    effectiveRate: gross > 0 ? round2(round4(t.tax / gross) * 100) : 0,
    note: '月度简化口径：把 5000 元/月当作当月减除费用。实际工资按年累计预扣，全年逐月明细见「累计预扣表」。',
  }
}

/**
 * 累计预扣法逐月明细（工资薪金预扣预缴的正统算法）。
 * 本月应预扣 = （累计收入 − 累计扣除）× 预扣率 − 速算扣除数 − 累计已预扣
 * @param {object} o { gross, months, insurance, specialMonthly, otherMonthly, bonus, bonusMonth }
 */
export function withholdingSchedule(o) {
  const p = o || {}
  const gross = numOr(p.gross)
  if (!(gross > 0)) throw new Error('请输入月工资')
  const months = Math.min(12, Math.max(1, intOr(p.months) || 12))
  const ins = insuranceOf(gross, p.insurance)
  const social = ins.personalTotal
  const special = numOr(p.specialMonthly)
  const other = numOr(p.otherMonthly)
  const bonus = numOr(p.bonus)
  const bonusMonth = Math.min(12, Math.max(1, intOr(p.bonusMonth) || 12))
  let cumIncome = 0
  let cumDeduct = 0
  let cumPaid = 0
  const rows = []
  for (let m = 1; m <= months; m++) {
    cumIncome = round2(cumIncome + gross)
    cumDeduct = round2(cumDeduct + BASIC_DEDUCTION_MONTHLY + social + special + other)
    const cumTaxable = Math.max(0, round2(cumIncome - cumDeduct))
    const hit = bracketOf(cumTaxable, ANNUAL_BRACKETS)
    const cumTax = cumTaxable > 0 ? round2(cumTaxable * hit.rate - hit.quick) : 0
    const due = round2(Math.max(0, cumTax - cumPaid))
    cumPaid = round2(cumPaid + due)
    rows.push({
      month: m,
      income: round2(gross),
      cumIncome,
      cumDeduct,
      cumTaxable,
      percent: hit.rate * 100,
      quick: hit.quick,
      cumTax,
      tax: due,
      social,
      net: round2(gross - social - due + (m === bonusMonth ? bonus : 0)),
      bonus: m === bonusMonth && bonus > 0 ? round2(bonus) : 0,
    })
  }
  const totalTax = round2(rows.reduce((s, r) => s + r.tax, 0))
  const totalSocial = round2(social * months)
  const firstTaxed = rows.filter((r) => r.tax > 0)[0]
  // 累计应纳税所得额越涨，边际档位会在年中某个月突然跳高一档，这就是「年初到手多、年底到手少」的原因
  let jump = null
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].percent > rows[i - 1].percent) {
      jump = { month: rows[i].month, percent: rows[i].percent }
      break
    }
  }
  return {
    months,
    gross: round2(gross),
    socialMonthly: social,
    specialMonthly: round2(special),
    rows,
    totalTax,
    totalSocial,
    totalIncome: round2(gross * months + bonus),
    totalNet: round2(gross * months + bonus - totalSocial - totalTax),
    firstTaxedMonth: firstTaxed ? firstTaxed.month : 0,
    jumpMonth: jump ? jump.month : 0,
    jumpPercent: jump ? jump.percent : 0,
    note:
      '累计预扣法：全年合计税额 ' + fmtYuan(totalTax) + ' 元。' +
      (totalTax <= 0
        ? '全年累计应纳税所得额没超过起征点，不需要代扣个税。'
        : firstTaxed && firstTaxed.month > 1
          ? '前 ' + (firstTaxed.month - 1) + ' 个月累计应纳税所得额没到起征点，不扣税，从第 ' + firstTaxed.month + ' 月起开始代扣。'
          : '每个月都有代扣。') +
      (jump ? '第 ' + jump.month + ' 月起累计应纳税所得额跳入 ' + jump.percent + '% 档，当月扣税明显变多——这就是「年初到手多、年底到手少」的原因。' : ''),
    method: '个人所得税预扣率表一（累计预扣）',
  }
}

/** 月薪明细 + 年度汇总，并校验累计预扣合计与年度应纳税额是否吻合 */
export function annualFromMonthly(o) {
  const sch = withholdingSchedule(o)
  const bonusRow = sch.rows.filter((r) => r.bonus > 0)[0]
  const bonus = bonusRow ? bonusRow.bonus : 0
  const a = annualIit({
    income: round2(sch.gross * 12),
    social: sch.totalSocial,
    deductionYearly: round2(sch.specialMonthly * 12),
  })
  return {
    schedule: sch,
    annual: a,
    bonus,
    gap: round2(a.tax - sch.totalTax),
    note:
      Math.abs(a.tax - sch.totalTax) < 1
        ? '累计预扣合计与年度应纳税额一致，说明不需要补退'
        : '两者相差 ' + fmtYuan(a.tax - sch.totalTax) + ' 元，要在汇算清缴时补/退',
  }
}

/* ------------------------------------------------------------ 反推税前 */

/**
 * 迭代求解「想每月到手 X 元，税前要多少」。
 * 到手 = 税前 − 五险一金个人部分 − 个税，三段都是分段函数，
 * 因此用二分而不是解析式；多挣不会少拿（单调），二分必然收敛。
 * @param {number} targetNet 目标月度到手（元）
 * @param {object} [o] { insurance, specialMonthly, wide } —— wide=true 时把公积金双边也算进「到手」
 */
export function solveGrossForNet(targetNet, o) {
  const p = o || {}
  const target = numOr(targetNet)
  if (!(target > 0)) throw new Error('请输入目标到手金额')
  const netOf = (g) => {
    const r = salaryMonthly(Object.assign({}, p, { gross: g }))
    return p.wide ? r.netWide : r.net
  }
  let lo = Math.max(1, target * 0.6)
  let hi = Math.max(target * 1.5, target + 5000)
  let guard = 0
  while (netOf(hi) < target && guard++ < 80) hi *= 1.5
  let guard2 = 0
  while (netOf(lo) > target && guard2++ < 80) lo = lo / 2
  const steps = []
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2
    const n = netOf(mid)
    steps.push({ i: i + 1, lo: round2(lo), hi: round2(hi), mid: round2(mid), net: round2(n), diff: round2(n - target) })
    if (Math.abs(n - target) < 0.005 || hi - lo < 0.0005) {
      lo = mid
      hi = mid
      break
    }
    if (n < target) lo = mid
    else hi = mid
  }
  const gross = round2((lo + hi) / 2)
  const detail = salaryMonthly(Object.assign({}, p, { gross }))
  const got = p.wide ? detail.netWide : detail.net
  return {
    target: round2(target),
    gross,
    iterations: steps.length,
    steps: steps.slice(-6),
    detail,
    error: round2(got - target),
    note: '二分迭代 ' + steps.length + ' 次，残差 ' + fmtYuan(Math.abs(got - target)) + ' 元。反推用月度简化口径，全年实发仍受累计预扣影响。',
  }
}

/* ------------------------------------------------------------ 劳务报酬 / 稿酬 / 经营所得 */

/**
 * 劳务报酬预扣预缴：
 *   每次收入 ≤ 4000 元 → 减 800 元费用；> 4000 元 → 减 20% 费用
 *   余额按 20% / 30% / 40% 三级预扣；年度终了并入综合所得汇算，多退少补
 */
export function laborPayment(gross) {
  const g = numOr(gross)
  if (!(g > 0)) throw new Error('请输入劳务报酬金额')
  const deduction = g <= 4000 ? 800 : g * 0.2
  const taxable = Math.max(0, g - deduction)
  const t = taxFromTaxable(taxable, LABOR_BRACKETS)
  return {
    gross: round2(g),
    deduction: round2(deduction),
    deductionNote: g <= 4000 ? '收入不超过 4000 元，定额减除 800 元' : '收入超过 4000 元，定率减除 20%',
    taxable: round2(taxable),
    tax: t.tax,
    percent: t.percent,
    quick: t.quick,
    net: round2(g - t.tax),
    effectiveRate: round2(round4(t.tax / g) * 100),
    rows: t.rows,
    note: '劳务报酬预扣率（最低 20%）比工资薪金高一截，但年度汇算时要并入综合所得，通常能退一部分回来',
  }
}

/**
 * 稿酬：收入额 = （收入 − 20% 费用）× 70%，预扣时统一按 20% 预扣率，
 * 年度并入综合所得。
 */
export function authorRemuneration(gross) {
  const g = numOr(gross)
  if (!(g > 0)) throw new Error('请输入稿酬金额')
  const deduction = g <= 4000 ? 800 : g * 0.2
  const incomeAmount = Math.max(0, (g - deduction) * 0.7)
  const tax = round2(incomeAmount * 0.2)
  return {
    gross: round2(g),
    deduction: round2(deduction),
    intoIncome: round2(incomeAmount),
    intoIncomePercent: round2(round4(incomeAmount / g) * 100),
    tax,
    net: round2(g - tax),
    note:
      '稿酬减 20% 费用后再按 70% 计入，实际进入应税收入的只有 ' + fmtYuan(incomeAmount) +
      ' 元（占 ' + round2(round4(incomeAmount / g) * 100) + '%），预扣率固定 20%',
  }
}

/** 经营所得：按年应纳税所得额走五级累进 */
export function businessIncome(o) {
  const p = o || {}
  const income = numOr(p.income)
  const cost = numOr(p.cost)
  const loss = numOr(p.loss)
  const basic = p.basic === undefined || p.basic === '' ? BASIC_DEDUCTION : numOr(p.basic)
  const special = numOr(p.special)
  const taxable = Math.max(0, income - cost - loss - basic - special)
  const t = taxFromTaxable(taxable, BUSINESS_BRACKETS)
  return {
    income: round2(income),
    cost: round2(cost),
    loss: round2(loss),
    basic: round2(basic),
    special: round2(special),
    taxable: round2(taxable),
    tax: t.tax,
    percent: t.percent,
    quick: t.quick,
    net: round2(income - cost - loss - t.tax),
    effectiveRate: income > 0 ? round2(round4(t.tax / income) * 100) : 0,
    rows: t.rows,
    note: '经营所得可用 60000 元减除，但只能在一处扣：与工资薪金同时取得时，减除费用不能重复享受',
  }
}

/**
 * 同一笔钱在三种税目下的名义税负对比（纯算术，不做适用性判断）。
 */
export function incomeFormCompare(amount) {
  const g = numOr(amount)
  if (!(g > 0)) throw new Error('请输入金额')
  const labor = laborPayment(g)
  const biz = businessIncome({ income: g, cost: round2(g * 0.2) })
  const monthly = round2(g / 12)
  const salaryYear = annualIit({ income: g })
  return {
    amount: round2(g),
    monthly,
    labor,
    business: biz,
    salaryAsAnnual: salaryYear,
    cheapest: (function () {
      const list = [
        { name: '工资薪金（年度）', tax: salaryYear.tax },
        { name: '劳务报酬（预扣）', tax: labor.tax },
        { name: '经营所得（成本 20%）', tax: biz.tax },
      ]
      list.sort((a, b) => a.tax - b.tax)
      return list[0].name
    })(),
    note: '三行是同一笔 ' + fmtYuan(g) + ' 元在不同税目下的名义税负，仅作量级对比；能否按经营所得申报取决于业务实质，本对比不构成税务建议，请自行咨询税务机关',
  }
}

/* ------------------------------------------------------------ 展示辅助 */

/** 金额格式化（带千分位，两位小数） */
export function fmtYuan(n) {
  if (n === Infinity) return '∞'
  if (!isFinite(n)) return '—'
  return money(n, 2)
}

export function percentText(n, digits) {
  if (!isFinite(n)) return '—'
  return n.toFixed(digits === undefined ? 2 : digits) + '%'
}

/** 把税率表转成视图表行 */
export function bracketTable(table) {
  const list = table || ANNUAL_BRACKETS
  return list.map((b, i) => ({
    index: i + 1,
    lo: i === 0 ? 0 : list[i - 1].up,
    hi: b.up,
    range: fmtYuan(i === 0 ? 0 : list[i - 1].up) + ' ~ ' + (isFinite(b.up) ? fmtYuan(b.up) : '以上'),
    note: b.note,
    percent: b.rate * 100,
    quick: b.quick,
  }))
}

/** 一段可以直接复制的口径说明 */
export function policyText() {
  return [
    '— 个税社保速算 · 口径说明 —',
    POLICY_NOTE,
    '综合所得年度：基本减除 ' + fmtYuan(BASIC_DEDUCTION) + ' 元 + 三险一金个人部分 + 专项附加扣除 + 其它扣除',
    '年度税率（七级超额累进）：' + ANNUAL_BRACKETS.map((b) => b.rate * 100 + '%').join(' / '),
    '速算扣除数：' + ANNUAL_BRACKETS.map((b) => b.quick).join(' / '),
    '年终奖单独计税：财税〔2018〕164 号，2027-12-31 前有效',
    '社保与公积金的比例、基数上下限为示例默认值，各城市每年度不同，请改参数后再看结果。',
    '以上只是按公开口径做的算术演示，不构成税务、社保或法律建议；以税务机关核定为准。',
  ].join('\n')
}

/* ------------------------------------------------------------ 小工具 */

function numOr(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const n = Number(String(v === null || v === undefined ? '' : v).replace(/[,\s¥￥]/g, ''))
  return isFinite(n) ? n : 0
}

function intOr(v) {
  const n = numOr(v)
  return isFinite(n) ? Math.trunc(n) : 0
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

function round4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000
}
