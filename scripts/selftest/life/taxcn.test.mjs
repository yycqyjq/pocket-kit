/**
 * taxcn.js 自查断言（直接测 src/utils/taxcn.js 本体）
 * 参照答案全部来自公开口径：
 *   · 个税法 2018 年修正第七条税率表（3%~45% 七级，速算扣除数 0/2520/16920/31920/52920/85920/181920）
 *   · 财税〔2018〕164 号年终奖单独计税（按月换算表，速算扣除数 0/210/1410/2660/4410/7160/15160）
 *   · 年终奖「无效区间」与网络上流传的 36001~38566 / 144001~160499 / 300001~318333 /
 *     420001~447499 / 660001~706538 / 960000~1120000 一致（本表用「严格更差」的整数端点）
 *   · 劳务报酬 5 万预扣 1 万、稿酬 5 万预扣 5600 元（国家税务总局公告 2018 年第 61 号）
 */
import { useUtils } from '../harness.mjs'

const T = await useUtils('taxcn')

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
  if (typeof a === 'number' && Math.abs(a - b) <= tol) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + JSON.stringify(a) + ' want ' + b + '±' + tol)
  }
}
function has(s, sub, m) {
  if (String(s).indexOf(sub) >= 0) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': ' + JSON.stringify(String(s).slice(0, 200)) + ' 不含 ' + sub)
  }
}
function throws(fn, m) {
  try {
    fn()
    fail++
    console.log('FAIL ' + m + ': should throw')
  } catch (e) {
    if (/[\u4e00-\u9fa5]/.test(String(e && e.message))) ok++
    else {
      fail++
      console.log('FAIL ' + m + ': 报错不是中文 ' + e.message)
    }
  }
}

/* ---------- 1. 导出面 ---------- */
const EXPORTS = [
  'POLICY_NOTE', 'ANNUAL_BRACKETS', 'MONTHLY_BRACKETS', 'BUSINESS_BRACKETS', 'LABOR_BRACKETS',
  'BASIC_DEDUCTION', 'BASIC_DEDUCTION_MONTHLY', 'SPECIAL_DEDUCTIONS', 'specialDeductions',
  'bracketOf', 'taxFromTaxable', 'annualIit', 'bonusSeparate', 'bonusMerged', 'bonusCompare',
  'bonusTrapRanges', 'bonusAdvice', 'defaultInsurance', 'normalizeInsurance', 'insuranceOf',
  'salaryMonthly', 'withholdingSchedule', 'annualFromMonthly', 'solveGrossForNet',
  'laborPayment', 'authorRemuneration', 'businessIncome', 'incomeFormCompare',
  'fmtYuan', 'percentText', 'bracketTable', 'policyText',
]
is(EXPORTS.filter((k) => T[k] === undefined).length, 0, 'exportsAll')

/* ---------- 2. 税率表本体 ---------- */
is(T.ANNUAL_BRACKETS.length, 7, 'annual7')
is(T.MONTHLY_BRACKETS.length, 7, 'monthly7')
is(T.ANNUAL_BRACKETS.map((b) => b.rate * 100).join('/'), '3/10/20/25/30/35/45', 'annualRates')
is(T.ANNUAL_BRACKETS.map((b) => b.quick).join('/'), '0/2520/16920/31920/52920/85920/181920', 'annualQuick')
is(T.MONTHLY_BRACKETS.map((b) => b.quick).join('/'), '0/210/1410/2660/4410/7160/15160', 'monthlyQuick')
is(T.BUSINESS_BRACKETS.map((b) => b.rate * 100).join('/'), '5/10/20/30/35', 'businessRates')
is(T.LABOR_BRACKETS.map((b) => b.rate * 100).join('/'), '20/30/40', 'laborRates')
is(T.ANNUAL_BRACKETS[6].up, Infinity, 'lastBracketOpen')
// 月表 = 年表 ÷ 12（同一张政策的两种刻度，速算扣除数也同比）
is(
  T.ANNUAL_BRACKETS.every((b, i) => b.up === T.MONTHLY_BRACKETS[i].up * 12 && b.quick === T.MONTHLY_BRACKETS[i].quick * 12 && b.rate === T.MONTHLY_BRACKETS[i].rate),
  true,
  'monthlyIsAnnualDiv12'
)
is(T.BASIC_DEDUCTION, 60000, 'basicYearly')
is(T.BASIC_DEDUCTION_MONTHLY, 5000, 'basicMonthly')
is(T.BASIC_DEDUCTION, T.BASIC_DEDUCTION_MONTHLY * 12, 'basicConsistent')

/* ---------- 3. 逐档累进 vs 速算扣除数 自洽 ---------- */
// 法定临界点：每一档上限处的税额都是公开表里的定值
const KNOWN = [
  [36000, 1080],
  [144000, 11880],
  [300000, 43080],
  [420000, 73080],
  [660000, 145080],
  [960000, 250080],
]
KNOWN.forEach((kv) => {
  const r = T.taxFromTaxable(kv[0])
  is(r.tax, kv[1], 'knownTax' + kv[0])
  is(r.quickCheck, T.bracketOf(kv[0]).quick, 'quickCheck' + kv[0])
  is(r.note.indexOf('一致') >= 0, true, 'quickNote' + kv[0])
})
is(T.taxFromTaxable(240000).tax, 31080, 'knownTax240k')
is(T.taxFromTaxable(240000).percent, 20, 'percent240k')
is(T.taxFromTaxable(240000).bracketNote, '14.4 万 ~ 30 万', 'bracketNote240k')
is(T.taxFromTaxable(240000).rows.length, 3, 'rows3')
is(T.taxFromTaxable(240000).rows[2].tax, 19200, 'row3tax')
is(T.taxFromTaxable(1000000).tax, 250080 + 40000 * 0.45, 'topBracket')
// 区间内任意点也必须自洽（速算扣除数不是抄的，是解出来的）
for (let x = 1000; x <= 1200000; x += 7919) {
  const r = T.taxFromTaxable(x)
  if (Math.abs(r.quickCheck - r.quick) > 0.01 || Math.abs(r.tax - (x * r.rate - r.quick)) > 0.01) {
    fail++
    console.log('FAIL sweep' + x)
    break
  }
  ok++
}
is(T.taxFromTaxable(0).note, '应纳税所得额不为正，无需缴税', 'zeroTaxable')
is(T.taxFromTaxable(-500).tax, 0, 'negTaxable')
is(T.taxFromTaxable('36,000').tax, 1080, 'stringInput')
is(T.taxFromTaxable('abc').tax, 0, 'garbageInput')
is(T.bracketOf(0).rate, 0.03, 'bracketOfZero')
is(T.bracketOf(36001).index, 1, 'bracketOfEdge')
is(T.bracketOf(1e15).index, 6, 'bracketOfHuge')

/* ---------- 4. 综合所得年度算例（已知答案） ---------- */
// 算例：年薪 30 万，三险一金个人 3 万，专项附加 2.4 万
// 应纳税所得额 = 300000 − 60000 − 30000 − 24000 = 186000
// 税额 = 186000 × 20% − 16920 = 20280
const a1 = T.annualIit({ income: 300000, social: 30000, deductionYearly: 24000 })
is(a1.taxable, 186000, 'case1Taxable')
is(a1.tax, 20280, 'case1Tax')
is(a1.net, 225720, 'case1Net')
is(a1.effectiveRate, 6.76, 'case1Effective')
is(a1.percent, 20, 'case1Percent')
// 只有起征点以下 → 0 税
const a2 = T.annualIit({ income: 50000 })
is(a2.tax, 0, 'belowThreshold')
is(a2.negative, true, 'belowThresholdNeg')
is(a2.taxableRaw, -10000, 'taxableRaw')
has(a2.note, '汇算', 'negNote')
// 传 specialDeductions() 对象也能识别
const sd = T.specialDeductions({ childrenEdu: 2, elderCare: 'only', homeLoan: true, homeRent: 1500, continueEdu: 'exam', medical: 50000 })
is(sd.monthlyTotal, 9500, 'sdMonthly')
is(sd.yearlyTotal, 117600, 'sdYearly')
is(sd.medicalYear, 35000, 'sdMedical')
is(sd.grandTotal, 152600, 'sdGrand')
const a3 = T.annualIit({ income: 300000, social: 30000, deductions: sd })
is(a3.specialAdditional, 152600, 'sdIntoAnnual')
is(a3.taxable, 57400, 'sdTaxable')
is(a3.tax, 3220, 'sdTax')
is(T.annualIit({}).tax, 0, 'emptyAnnual')
is(T.annualIit({ income: 1e12 }).percent, 45, 'hugeAnnual')

/* ---------- 5. 专项附加扣除细则 ---------- */
is(T.SPECIAL_DEDUCTIONS.length, 7, 'specialCount')
is(T.SPECIAL_DEDUCTIONS.every((x) => /〔20\d\d〕/.test(x.from)), true, 'specialHasSourceYear')
is(T.specialDeductions({}).rows.length, 0, 'specialNone')
is(T.specialDeductions().monthlyTotal, 0, 'specialUndefined')
is(T.specialDeductions({ childrenEdu: 1.9 }).monthlyTotal, 2000, 'kidsTruncated')
is(T.specialDeductions({ elderCare: { shared: 3 } }).monthlyTotal, 1000, 'elderShared3')
is(T.specialDeductions({ elderCare: { shared: 5 } }).monthlyTotal, 600, 'elderShared5')
is(T.specialDeductions({ elderCare: { shared: 1 } }).monthlyTotal, 1500, 'elderSharedFloor2')
is(T.specialDeductions({ continueEdu: 'academic' }).yearlyTotal, 4800, 'eduAcademic')
is(T.specialDeductions({ continueEdu: 'exam' }).yearlyTotal, 3600, 'eduExam')
is(T.specialDeductions({ continueEdu: 'exam' }).rows[0].per, '年', 'eduExamPerYear')
is(T.specialDeductions({ medical: 15000 }).medicalYear, 0, 'medicalThreshold')
is(T.specialDeductions({ medical: 15001 }).medicalYear, 1, 'medicalJustOver')
is(T.specialDeductions({ medical: 999999 }).medicalYear, 80000, 'medicalCap')
is(T.specialDeductions({ homeRent: 800 }).monthlyTotal, 800, 'rentTier800')
is(T.specialDeductions({ homeRent: 'none' }).monthlyTotal, 0, 'rentNone')
has(T.specialDeductions({}).note, '不能同时', 'specialNoteConflict')

/* ---------- 6. 年终奖：单独计税 ---------- */
const b1 = T.bonusSeparate(36000)
is(b1.tax, 1080, 'bonus36kTax')
is(b1.net, 34920, 'bonus36kNet')
is(b1.percent, 3, 'bonus36kRate')
has(b1.method, '164', 'bonusMethod')
is(T.bonusSeparate(144000).tax, 14190, 'bonus144k')
is(T.bonusSeparate(144000).net, 129810, 'bonus144kNet')
is(T.bonusSeparate(100000).tax, 100000 * 0.1 - 210, 'bonus100k')
is(T.bonusSeparate(0).note, '没有奖金', 'bonusZero')
is(T.bonusSeparate('abc').tax, 0, 'bonusGarbage')
has(T.bonusSeparate(36000).note, '÷ 12', 'bonusNote')
// 月表 7 档临界点全部落在年度表的 12 倍上
is(T.MONTHLY_BRACKETS.filter((b) => isFinite(b.up)).every((b) => T.bonusSeparate(b.up * 12).quick === b.quick), true, 'bonusBoundaries')

/* ---------- 7. 年终奖无效区间（公开对照答案） ---------- */
const traps = T.bonusTrapRanges()
is(traps.length, 6, 'trapCount')
is(traps.map((t) => t.boundary).join('/'), '36000/144000/300000/420000/660000/960000', 'trapBoundaries')
is(traps.map((t) => t.from).join('/'), '36001/144001/300001/420001/660001/960001', 'trapFroms')
is(traps.map((t) => t.to).join('/'), '38566/160499/318333/447499/706538/1119999', 'trapTos')
is(traps[0].boundaryNet, 34920, 'trap0Net')
near(traps[0].worstNet, 34919.4, 0.01, 'trap0Worst')
near(traps[0].lost, 0.6, 0.01, 'trap0Lost')
// 端点自证：to 那一元仍然亏，to+1 已经不亏
is(T.bonusAdvice(38566).inTrap, true, 'trapEndIn')
is(T.bonusAdvice(38567).inTrap, false, 'trapEndOut')
is(T.bonusAdvice(160499).inTrap, true, 'trap2EndIn')
is(T.bonusAdvice(160500).inTrap, false, 'trap2EndOut')
is(T.bonusAdvice(1120000).inTrap, false, 'trapTopEndOut')
is(T.bonusAdvice(1119999).inTrap, true, 'trapTopIn')
is(traps.every((t) => t.worstNet < t.boundaryNet && t.lost > 0), true, 'trapMonotoneCheck')
const adv = T.bonusAdvice(38000)
is(adv.inTrap, true, 'adviceIn')
is(adv.suggest, 36000, 'adviceSuggest')
is(adv.currentNet, 34410, 'adviceNet')
is(adv.more, 510, 'adviceMore')
is(T.bonusAdvice(20000).inTrap, false, 'adviceOut')
is(T.bonusAdvice(0).inTrap, false, 'adviceZero')

/* ---------- 8. 单独 vs 并入 ---------- */
const cmp1 = T.bonusCompare({ income: 200000 }, 36000)
is(cmp1.separate.tax, 1080, 'cmp1Sep')
is(cmp1.merged.addedTax, 6800, 'cmp1Mer')
is(cmp1.diff, -5720, 'cmp1Diff')
is(cmp1.better, 'separate', 'cmp1Better')
is(cmp1.save, 5720, 'cmp1Save')
has(cmp1.note, '单独计税少交', 'cmp1Note')
// 收入没吃掉 6 万起征点时，并入更省
const cmp2 = T.bonusCompare({ income: 50000 }, 36000)
is(cmp2.better, 'merged', 'cmp2Better')
is(cmp2.save, 300, 'cmp2Save')
const cmp3 = T.bonusCompare({ income: 100000 }, 0)
is(cmp3.better, 'tie', 'cmp3Tie')
is(T.bonusMerged({ income: 200000 }, 36000).net, 29200, 'mergedNet')

/* ---------- 9. 五险一金（示例参数 + 上下限） ---------- */
const ins = T.insuranceOf(20000)
is(ins.base, 20000, 'insBase')
is(ins.personalTotal, 4503, 'insPersonal')
is(ins.companyTotal, 7580, 'insCompany')
is(ins.fundBoth, 4800, 'insFundBoth')
is(ins.capped, '', 'insNoCap')
is(ins.rows.length, 6, 'insRows')
is(ins.rows.map((r) => r.name).join('/'), '养老保险/医疗保险/失业保险/工伤保险/生育保险/住房公积金', 'insNames')
is(ins.totalCost, 27580, 'insTotalCost')
const insHigh = T.insuranceOf(50000)
is(insHigh.base, 30000, 'capHighBase')
has(insHigh.capped, '上限', 'capHighMsg')
is(insHigh.personalTotal, 6753, 'capHighPersonal')
is(insHigh.companyTotal, 11370, 'capHighCompany')
const insLow = T.insuranceOf(3000)
is(insLow.base, 6000, 'capLowBase')
has(insLow.capped, '下限', 'capLowMsg')
is(insLow.personalTotal, 1353, 'capLowPersonal')
// 自定义参数：items 是整表替换（视图每次都提交完整 6 行）
const custom = T.insuranceOf(20000, { items: [{ key: 'fund', personal: 0.05, company: 0.05 }] })
is(custom.rows.length, 1, 'customReplaceTable')
is(custom.personalTotal, 1000, 'customFund')
is(custom.companyTotal, 1000, 'customFundCompany')
is(custom.fundBoth, 2000, 'customFundBoth')
// 关掉某个险种 = 比例填 0，同时可以改基数上下限
const full = T.normalizeInsurance({ baseLow: 0, baseHigh: 0 }).items.map((x) => (x.key === 'maternity' ? { key: x.key, personal: 0, company: 0 } : x))
const custom2 = T.insuranceOf(20000, { baseLow: 0, baseHigh: 0, items: full })
is(custom2.base, 20000, 'custom2Base')
is(custom2.personalTotal, 4503, 'custom2Personal')
is(custom2.rows[0].personal, 1600, 'custom2Pension')
// 基数无上下限时高工资全额计入
const custom3 = T.insuranceOf(50000, { baseLow: 0, baseHigh: 0, items: full })
is(custom3.base, 50000, 'noCapBase')
is(custom3.personalTotal, 11253, 'noCapPersonal')
is(T.normalizeInsurance().items.length, 6, 'normalizeDefault')
is(T.normalizeInsurance({ baseLow: 0, baseHigh: 0 }).baseLow, 0, 'normalizeZero')
// 个人 8% + 2% + 0.5% + 12% = 22.5%，另加 3 元定额
const ins10k = T.insuranceOf(10000)
is(ins10k.personalTotal, 2253, 'ins10k')

/* ---------- 10. 月薪 → 到手 ---------- */
const s1 = T.salaryMonthly({ gross: 20000, specialMonthly: 2000 })
is(s1.personalSocial, 4503, 's1Social')
is(s1.taxable, 8497, 's1Taxable')
is(s1.tax, 254.91, 's1Tax')
is(s1.net, 15242.09, 's1Net')
is(s1.netWide, 20042.09, 's1NetWide')
has(s1.note, '累计预扣', 's1Note')
is(T.salaryMonthly({ gross: 5000 }).tax, 0, 'sLowNoTax')
throws(() => T.salaryMonthly({ gross: 0 }), 'sZero')
throws(() => T.salaryMonthly({}), 'sEmpty')

/* ---------- 11. 累计预扣法 ---------- */
const sch = T.withholdingSchedule({ gross: 20000, specialMonthly: 2000, months: 12 })
is(sch.rows.length, 12, 'schRows')
is(sch.rows[0].cumTaxable, 8497, 'schM1')
is(sch.rows[0].tax, 254.91, 'schM1Tax')
is(sch.rows[3].cumTaxable, 33988, 'schM4')
is(sch.rows[3].percent, 3, 'schM4Rate')
is(sch.rows[4].cumTaxable, 42485, 'schM5')
is(sch.rows[4].percent, 10, 'schM5Rate')
is(sch.rows[4].tax, 708.86, 'schM5Tax')
is(sch.rows[11].cumTaxable, 101964, 'schM12')
is(sch.totalTax, 7676.4, 'schTotal')
is(sch.firstTaxedMonth, 1, 'schFirst')
is(sch.totalSocial, 54036, 'schSocial')
is(sch.totalIncome, 240000, 'schIncome')
is(sch.totalNet, 178287.6, 'schNet')
is(sch.jumpMonth, 5, 'schJump')
is(sch.jumpPercent, 10, 'schJumpPercent')
has(sch.note, '跳入 10% 档', 'schJumpNote')
// 全年逐月预扣合计 == 年度应纳税额（同一套税率的两种算法互证）
const afm = T.annualFromMonthly({ gross: 20000, specialMonthly: 2000 })
is(afm.annual.tax, 7676.4, 'afmAnnualTax')
is(afm.gap, 0, 'afmGap')
has(afm.note, '一致', 'afmNote')
// 全年累计没到起征点：一个月都不扣
const sch2 = T.withholdingSchedule({ gross: 6000, months: 12 })
is(sch2.rows[0].cumTaxable, 0, 'sch2M1')
is(sch2.rows[11].cumTaxable, 0, 'sch2M12')
is(sch2.totalTax, 0, 'sch2Total')
is(sch2.firstTaxedMonth, 0, 'sch2None')
is(sch2.jumpMonth, 0, 'sch2NoJump')
has(sch2.note, '不需要代扣', 'sch2Note')
// 年终奖塞进某个月的到手明细（单独计税，不进累计收入）
const sch3 = T.withholdingSchedule({ gross: 20000, months: 12, bonus: 36000, bonusMonth: 2 })
is(sch3.rows[1].bonus, 36000, 'sch3Bonus')
is(sch3.rows[1].net, 51182.09, 'sch3Net')
is(sch3.rows[0].net, 15182.09, 'sch3NetM1')
is(sch3.rows[0].bonus, 0, 'sch3NoBonus')
is(sch3.rows[1].cumIncome, 40000, 'sch3CumNoBonus')
is(sch3.totalIncome, 276000, 'sch3TotalIncome')
throws(() => T.withholdingSchedule({}), 'schThrow')
is(T.withholdingSchedule({ gross: 20000, months: 99 }).months, 12, 'schMonthsClamp')

/* ---------- 12. 反推税前 ---------- */
const rv = T.solveGrossForNet(15000, { specialMonthly: 2000 })
is(rv.target, 15000, 'rvTarget')
is(Math.abs(rv.error) < 0.01, true, 'rvError')
is(rv.gross > 19000 && rv.gross < 20500, true, 'rvBand')
is(rv.iterations > 3 && rv.iterations < 90, true, 'rvIter')
is(Math.abs(T.salaryMonthly({ gross: rv.gross, specialMonthly: 2000 }).net - 15000) < 0.02, true, 'rvRoundTrip')
// 超过公积金基数上限的高收入（税档跳变处也要能收敛）
const rv2 = T.solveGrossForNet(200000, {})
is(Math.abs(rv2.error) < 0.01, true, 'rv2Error')
is(rv2.gross > 234000 && rv2.gross < 235000, true, 'rv2Band')
// wide 口径把公积金双边算进「到手」
const rv3 = T.solveGrossForNet(20000, { wide: true })
is(Math.abs(rv3.detail.netWide - 20000) < 0.01, true, 'rv3Wide')
is(rv3.gross < rv.gross + 20000, true, 'rv3Lower')
throws(() => T.solveGrossForNet(0), 'rvThrow')
throws(() => T.solveGrossForNet('abc'), 'rvThrow2')

/* ---------- 13. 劳务报酬 / 稿酬 / 经营所得 ---------- */
const lb = T.laborPayment(50000)
is(lb.deduction, 10000, 'laborDed')
is(lb.taxable, 40000, 'laborTaxable')
is(lb.tax, 10000, 'laborTax')
is(lb.net, 40000, 'laborNet')
is(lb.percent, 30, 'laborPercent')
const lb2 = T.laborPayment(3000)
is(lb2.deduction, 800, 'laborSmallDed')
is(lb2.tax, 440, 'laborSmallTax')
is(lb2.net, 2560, 'laborSmallNet')
has(lb2.deductionNote, '定额', 'laborNote800')
is(T.laborPayment(4000).deduction, 800, 'labor4000')
is(T.laborPayment(4001).deduction, 800.2, 'labor4001')
is(T.laborPayment(800).tax, 0, 'laborBelow800')
throws(() => T.laborPayment(0), 'laborThrow')
const au = T.authorRemuneration(50000)
is(au.intoIncome, 28000, 'authorIncome')
is(au.tax, 5600, 'authorTax')
is(au.net, 44400, 'authorNet')
is(au.intoIncomePercent, 56, 'authorPercent')
is(T.authorRemuneration(3000).tax, 308, 'authorSmall')
throws(() => T.authorRemuneration(-1), 'authorThrow')
const biz = T.businessIncome({ income: 500000, cost: 100000 })
is(biz.taxable, 340000, 'bizTaxable')
is(biz.tax, 61500, 'bizTax')
is(biz.net, 338500, 'bizNet')
is(biz.percent, 30, 'bizPercent')
is(T.businessIncome({ income: 30000, cost: 0 }).tax, 0, 'bizBelowBasic')
is(T.businessIncome({ income: 200000, cost: 0, loss: 50000 }).taxable, 90000, 'bizLoss')
const cmp = T.incomeFormCompare(200000)
is(cmp.labor.tax, 57000, 'formLabor')
is(cmp.business.tax, 9500, 'formBiz')
is(cmp.salaryAsAnnual.tax, 11480, 'formSalary')
is(cmp.cheapest, '经营所得（成本 20%）', 'formCheapest')
has(cmp.note, '咨询', 'formNoteWarn')
throws(() => T.incomeFormCompare(0), 'formThrow')

/* ---------- 14. 展示层与口径说明 ---------- */
is(T.fmtYuan(12345.678), '12,345.68', 'fmtYuan')
is(T.fmtYuan(0), '0.00', 'fmtYuanZero')
is(T.fmtYuan(-1000), '-1,000.00', 'fmtYuanNeg')
is(T.fmtYuan(Infinity), '∞', 'fmtYuanInf')
is(T.fmtYuan(NaN), '—', 'fmtYuanNaN')
is(T.percentText(10.3652, 2), '10.37%', 'percentText')
is(T.percentText(NaN), '—', 'percentTextNaN')
const bt = T.bracketTable()
is(bt.length, 7, 'btLen')
is(bt[0].range, '0.00 ~ 36,000.00', 'btFirst')
is(bt[6].range, '960,000.00 ~ 以上', 'btLast')
is(bt[6].quick, 181920, 'btLastQuick')
is(T.bracketTable(T.MONTHLY_BRACKETS)[1].range, '3,000.00 ~ 12,000.00', 'btMonthly')
has(T.POLICY_NOTE, '2018', 'policyYear')
has(T.POLICY_NOTE, '2027-12-31', 'policyBonusEnd')
has(T.POLICY_NOTE, '示例默认值', 'policySocialHint')
const pt = T.policyText()
has(pt, '不构成税务', 'policyTextDisclaimer')
has(pt, '0 / 2520 / 16920', 'policyTextQuick')
has(pt, '164', 'policyTextDoc')
is(pt.split('\n').length, 8, 'policyTextLines')

console.log('taxcn ' + (fail ? 'FAIL ' + fail + '/' : '全绿 ') + ok + '/' + (ok + fail))
if (fail) process.exitCode = 1
