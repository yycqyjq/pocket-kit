/**
 * bodysize.js 自查断言（直接测 src/utils/bodysize.js 本体）
 * 参照值来源：
 *   · 鞋：GB/T 3293 的毫米鞋号（240 = 24.0cm = 旧码 38）、Paris point（EU = 1.5 × 楦长）、
 *     barleycorn（UK = 3×楦英寸 − 25、US 男 = UK + 1、US 女 = US 男 + 1.5、童码 = US 男 + 13）
 *   · 服装：GB/T 1335 男装 5·4A 系列（175/96A = L，欧码 = 胸围 ÷ 2，美码 = 欧码 − 10）
 *   · 文胸：CN/JP 罩杯 A = 差 10cm、每 2.5cm 进档；EU 每 2cm（A ≈ 12cm）；UK/US 每 1 英寸
 *   · 戒指：内周长 ≈ 36.55 + 2.55 × 美码（对公开对照表的线性拟合）
 *   · 腰围提示线：WS/T 428—2013（男 90 / 女 85）、2003 指南关注线（男 85 / 女 80）
 */
import { useUtils } from '../harness.mjs'

const B = await useUtils('bodysize')

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
    console.log('FAIL ' + m + ': ' + JSON.stringify(String(s).slice(0, 220)) + ' 不含 ' + sub)
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

/* ---------- 0. 导出面与免责文案 ---------- */
const EXPORTS = [
  'DATA_NOTE', 'SIZE_SOURCES', 'FOOT_MM_MIN', 'FOOT_MM_MAX', 'KIDS_MM_MAX', 'DEFAULT_ALLOWANCE',
  'SHOE_ALLOWANCES', 'SHOE_AUDIENCES', 'SHOE_SYSTEMS', 'footText', 'shoeFromMm', 'shoeCodeOf',
  'mmFromShoe', 'shoeConvert', 'shoeRecommendByFoot', 'shoeTable', 'shoeSummaryText',
  'SHOE_FIT_NOTES', 'shoeFitAdvice', 'RING_CIRC_BASE', 'RING_CIRC_PER_SIZE', 'RING_HK_OFFSET',
  'ringFromCirc', 'ringConvert', 'ringTable', 'RING_TIPS', 'CLOTHING_MEN', 'CLOTHING_WOMEN',
  'CLOTHING_SEXES', 'SIZE_ORDER', 'clothingTable', 'clothingFromLabel', 'BODY_TYPES', 'bodyType',
  'clothingFromBody', 'jeansFromWaist', 'CUP_STEPS', 'BRA_BANDS_CM', 'BRA_BANDS_IN', 'braFrom',
  'braSisters', 'braTable', 'WAIST_LINES', 'sizeWarnings', 'sizeSummaryText', 'convertSize',
  'fmtCm', 'fmtMm',
]
is(EXPORTS.filter((k) => B[k] === undefined).length, 0, 'exportsAll')
has(B.DATA_NOTE, '非品牌官方数据', 'noteBrand')
has(B.DATA_NOTE, '不构成', 'noteDisclaimer')
is(B.SIZE_SOURCES.length >= 8, true, 'sourcesCount')
is(B.SIZE_SOURCES.every((s) => s.text.length > 20), true, 'sourcesText')
is(B.SIZE_SOURCES.filter((s) => /20\d\d|19\d\d/.test(s.text + s.name)).length >= 4, true, 'sourcesYears')

/* ---------- 1. 鞋：脚长 → 各体系 ---------- */
const s240 = B.shoeFromMm(240)
is(s240.cn, 240, 'cnNew')
is(s240.cnOld, 38, 'cnOld38')
is(s240.jpText, '24.0', 'jp')
is(s240.footCm, 24, 'footCm')
is(s240.euExact, 38.25, 'euExact')
is(s240.eu, 38.5, 'euHalfUp')
is(s240.uk, 5, 'uk')
is(s240.us, 6, 'usMen6')
is(s240.usWomen, 7.5, 'usWomen75')
is(s240.lastCm, 25.5, 'lastCm')
is(s240.lastMm, 255, 'lastMm')
near(s240.usExact, 6.12, 0.01, 'usExact')
near(s240.ukExact, 5.12, 0.01, 'ukExact')
is(s240.audience, 'men', 'defaultAudience')
is(s240.allowance, B.DEFAULT_ALLOWANCE, 'defaultAllowance')
is(s240.kidsSuggested, false, 'notKids')
// UK = US 男 − 1，欧码 = 1.5 × 楦长：三条公式必须互相咬合
is(B.shoeFromMm(260).us, 8.5, 'usMen260')
is(B.shoeFromMm(260).euExact, 41.25, 'eu260')
is(B.shoeFromMm(260).cnOld, 42, 'cnOld260')
is(B.shoeFromMm(220).cnOld, 34, 'cnOld220')
is(B.shoeFromMm(220).us, 4, 'us220')
is(B.shoeFromMm(220).jpText, '22.0', 'jp220')
is(B.shoeFromMm('245').cn, 245, 'stringMm')
throws(() => B.shoeFromMm(50), 'mmTooSmall')
throws(() => B.shoeFromMm(400), 'mmTooBig')
throws(() => B.shoeFromMm('abc'), 'mmGarbage')
throws(() => B.shoeFromMm(0), 'mmZero')
throws(() => B.shoeFromMm(-240), 'mmNeg')

/* ---------- 2. 放余量与人群 ---------- */
is(B.shoeFromMm(240, { allowanceKey: 'running' }).us, 6.5, 'runningBigger')
is(B.shoeFromMm(240, { allowanceKey: 'running' }).eu, 39, 'runningEu')
is(B.shoeFromMm(240, { allowanceKey: 'sandal' }).eu, 37, 'sandalEu')
is(B.shoeFromMm(240, { allowance: 2 }).lastMm, 260, 'customAllowance')
is(B.shoeFromMm(240, { audience: 'women' }).us, 7.5, 'womenUs')
is(B.shoeFromMm(240, { audience: 'women' }).audienceName, '女码', 'womenName')
is(B.shoeFromMm(150, { audience: 'kids', allowanceKey: 'child' }).us, 8, 'kidsUs8')
is(B.shoeFromMm(150, { audience: 'kids' }).kidsSuggested, true, 'kidsFlag')
is(B.shoeFromMm(150).usKids, 8.5, 'kidsUsAuto')
is(B.shoeFromMm(150, { allowanceKey: 'child' }).usKids, 8, 'kidsUsChildAllow')
is(B.shoeFromMm(150).ukKids, 7.5, 'kidsUk')
is(B.shoeFromMm(150).uk > 0, false, 'kidsUkNegativeOnAdultScale')
is(B.shoeFromMm(150).ukDisplay, 'UK 7.5K（童码）', 'kidsUkDisplay')
is(B.shoeFromMm(150).usDisplay, 'US 8.5K（童码）', 'kidsUsDisplay')
is(B.shoeFromMm(150, { system: 'uk' }).label, 'UK 7.5K（童码）', 'kidsLabelNoNegative')
is(B.shoeFromMm(240).ukDisplay, 'UK 5', 'adultUkDisplay')
is(B.shoeFromMm(150, { audience: 'kids', allowanceKey: 'child' }).usDisplay, 'US 8K', 'kidsAudienceDisplay')
is(B.shoeFromMm(150, { audience: 'kids', allowanceKey: 'child', system: 'us' }).label, 'US 8K', 'kidsAudienceLabel')
is(B.shoeFromMm(150, { audience: 'kids', allowanceKey: 'child', system: 'cn' }).label, 'CN 旧码 20', 'kidsLabelDefaultsToCn')
is(B.shoeFromMm(150, { audience: 'kids' }).cnOld, 20, 'kidsCnOld')
is(B.shoeFromMm(240, { audience: 'kids' }).notes.some((x) => x.indexOf('童码最多') >= 0), true, 'kidsOverflowNote')
is(B.shoeFromMm(150).notes.some((x) => x.indexOf('童码') >= 0), true, 'kidsNote')
is(B.shoeFromMm(240).notes.length, 3, 'adultNotesLength')

/* ---------- 3. 鞋：反向换算与回代 ---------- */
is(B.mmFromShoe(240, 'mm'), 240, 'revMm')
is(B.mmFromShoe(38, 'cn'), 240, 'revCn')
is(B.mmFromShoe(24, 'jp'), 240, 'revJp')
is(B.mmFromShoe(24.5, 'jp'), 245, 'revJpHalf')
near(B.mmFromShoe(38.5, 'eu'), 241.67, 0.05, 'revEu')
is(B.mmFromShoe(5, 'uk'), 239, 'revUk')
is(B.mmFromShoe(6, 'us'), 239, 'revUs')
is(B.mmFromShoe(7.5, 'us', { audience: 'women' }), 239, 'revUsWomen')
throws(() => B.mmFromShoe(38, 'mars'), 'revBadSystem')
throws(() => B.mmFromShoe(0, 'cn'), 'revZero')
throws(() => B.mmFromShoe(300, 'eu'), 'revCrazyEu')
const c1 = B.shoeConvert({ value: 38, system: 'cn' })
is(c1.cnOld, 38, 'roundTripCn')
is(c1.codeDrift, 0, 'roundTripDrift0')
is(c1.inputMm, 240, 'roundTripMm')
has(c1.label, '38', 'labelHasCode')
is(B.shoeConvert({ value: 240, system: 'mm' }).eu, 38.5, 'convertFromMm')
is(B.shoeRecommendByFoot('24.5').cn, 245, 'recommendByCm')
is(B.shoeRecommendByFoot(24.5).eu, 39, 'recommendEu')
throws(() => B.shoeRecommendByFoot(0), 'recommendZero')

/* ---------- 4. 鞋：对照表与偏码 ---------- */
const tb = B.shoeTable()
is(tb.rows.length, 33, 'tableRows')
is(tb.rows[0].mm, 140, 'tableFrom')
is(tb.rows[32].mm, 300, 'tableTo')
is(tb.rows[20].cnOld, 38, 'tableRow20')
is(tb.columns.length, 6, 'tableCols')
is(B.shoeTable({ audience: 'kids' }).rows.slice(-1)[0].mm, 190, 'kidsTableCap')
is(B.shoeTable({ from: 999, to: 1 }).rows.length, 0, 'tableEmpty')
is(B.shoeTable({ from: 240, to: 5000 }).rows.length, 21, 'tableClampMax')
has(B.shoeSummaryText(s240), '240 mm', 'summaryMm')
has(B.shoeSummaryText(s240), 'EU 38.5', 'summaryEu')
has(B.shoeSummaryText(s240), 'US 6', 'summaryUs')
is(B.SHOE_FIT_NOTES.length >= 8, true, 'fitNotesCount')
const nike = B.shoeFitAdvice('nike')
is(nike.matched, true, 'nikeMatched')
is(nike.delta, 0.5, 'nikeDelta')
has(nike.formulaNote, '加', 'nikeFormNote')
is(B.shoeFitAdvice('匡威').delta, -1, 'converseDelta')
is(B.shoeFitAdvice('Vans').matched, true, 'vansMatched')
is(B.shoeFitAdvice('没听过的牌子').matched, false, 'unknownBrand')
is(B.shoeFitAdvice('').list.length, B.SHOE_FIT_NOTES.length, 'emptyBrandList')
is(B.SHOE_FIT_NOTES.every((x) => x.brand && x.advice && x.source), true, 'fitNoteFields')

/* ---------- 5. 戒指 ---------- */
const r52 = B.ringFromCirc(51.9)
is(r52.us, 6, 'ringUs6')
is(r52.diameter, 16.52, 'ringDiam')
is(r52.hk, 12, 'ringHk')
is(r52.iso, 52, 'ringIso')
is(r52.uk, 5.5, 'ringUk')
is(r52.inRange, true, 'ringInRange')
is(r52.warning, '', 'ringNoWarning')
has(r52.note, 'π', 'ringNotePi')
is(B.ringFromCirc(54.4).us, 7, 'ringUs7')
is(B.ringFromCirc(57).us, 8, 'ringUs8')
is(B.ringFromCirc(51.9).circIn, 20.43, 'ringCircIn')
const rc1 = B.ringConvert({ us: 7 })
near(rc1.circ, 54.4, 0.01, 'ringFromUs')
is(rc1.us, 7, 'ringFromUsRoundTrip')
is(rc1.from, '美码', 'ringFromLabel')
is(B.ringConvert({ diameter: 16.51 }).us, 6, 'ringFromDiam')
is(B.ringConvert({ hk: 12 }).circ, 52, 'ringFromHk')
is(B.ringConvert({ iso: 60 }).us, B.ringFromCirc(60).us, 'ringFromIso')
throws(() => B.ringConvert({}), 'ringConvertEmpty')
throws(() => B.ringFromCirc(0), 'ringZero')
throws(() => B.ringFromCirc('abc'), 'ringGarbage')
is(B.ringFromCirc(30).inRange, false, 'ringTooThin')
has(B.ringFromCirc(90).warning, '珠宝店', 'ringTooFatWarning')
is(B.ringTable().rows.length, 33, 'ringTableRows')
is(B.ringTable({ from: 50, to: 55 }).rows.length, 6, 'ringTableSmall')
is(B.RING_TIPS.length >= 5, true, 'ringTips')
is(B.RING_CIRC_BASE + B.RING_CIRC_PER_SIZE * 6 > 51, true, 'ringFitConstants')

/* ---------- 6. 服装号型 ---------- */
is(B.CLOTHING_MEN.length, 9, 'menRows')
is(B.CLOTHING_WOMEN.length, 9, 'womenRows')
is(B.SIZE_ORDER.length, 9, 'sizeOrderLen')
const L = B.clothingFromLabel('L', 'male')
is(L.row.cn, '175/96A', 'menL')
is(L.row.eu, 48, 'menLEu')
is(L.row.us, 38, 'menLUs')
is(L.order, 3, 'menLOrder')
has(L.rangeText, '173~180', 'menLHeight')
has(L.rangeText, '胸围 92~98', 'menLChest')
has(L.note, '号型', 'menLNote')
is(B.clothingFromLabel('M').sex, '男', 'defaultSexMale')
is(B.clothingFromLabel('M', 'female').row.cn, '165/88A', 'womenM')
is(B.clothingFromLabel('175/96A', 'male').row.label, 'L', 'lookupBySeq')
is(B.clothingFromLabel('17596A', 'male').row.label, 'L', 'lookupBySeqNoSlash')
is(B.clothingFromLabel('48', 'male').row.label, 'L', 'lookupByEu')
throws(() => B.clothingFromLabel('ZZZ'), 'badLabel')
throws(() => B.clothingFromLabel(''), 'emptyLabel')
is(B.clothingFromLabel('XXXXL', 'male').row.label, 'XXXXL', 'xxxxlExists')
is(B.clothingFromLabel('XXXXL', 'female').row.chest[1] > B.clothingFromLabel('XXL', 'female').row.chest[1], true, 'monotoneChest')
// 号型系列的跳档必须是 5·4
is(B.CLOTHING_MEN.every((r, i) => i === 0 || r.chest[0] - B.CLOTHING_MEN[i - 1].chest[0] === 4), true, 'chestStep4')
is(B.CLOTHING_MEN.every((r, i) => i === 0 || r.height[0] - B.CLOTHING_MEN[i - 1].height[0] === 5), true, 'heightStep5')
is(B.CLOTHING_MEN.every((r) => r.eu === Math.round((r.chest[0] + r.chest[1]) / 2 / 2)), true, 'euIsHalfChest')
is(B.CLOTHING_MEN.every((r) => r.us === r.eu - 10), true, 'usMinus10')

const cb = B.clothingFromBody({ sex: 'male', height: 176, chest: 97, waist: 82 })
is(cb.label, 'L', 'bodyL')
is(cb.seq, '175/96A', 'bodyLSeq')
is(cb.eu, 48, 'bodyLEu')
is(cb.bodyType.key, 'A', 'bodyTypeA')
is(cb.advice.length, 0, 'bodyNoAdvice')
is(cb.warnings.length, 0, 'bodyNoWarn')
is(cb.parts.chest.state, 'fit', 'bodyChestFit')
// 号型语义自检：身高 170 胸围 92 腰围 76 必须正好落在 170/92A = M
const cbM = B.clothingFromBody({ sex: 'male', height: 170, chest: 92, waist: 76 })
is(cbM.label, 'M', 'bodySeqM')
is(cbM.seq, '170/92A', 'bodySeqMText')
is(cbM.eu, 46, 'bodySeqMEu')
is(cbM.us, 36, 'bodySeqMUs')
// 175/96A = L；165/88A = S（女装同理）
is(B.clothingFromBody({ sex: 'male', height: 175, chest: 96, waist: 80 }).label, 'L', 'bodySeqL')
is(B.clothingFromBody({ sex: 'male', height: 165, chest: 88, waist: 72 }).label, 'S', 'bodySeqS')
const cb3 = B.clothingFromBody({ sex: 'female', height: 165, chest: 88, waist: 70 })
is(cb3.label, 'M', 'bodyWomenM')
is(cb3.seq, '165/88A', 'bodyWomenSeq')
is(cb3.sex, '女', 'bodyWomenSex')
is(cb3.bodyType.key, 'Y', 'bodyWomenTypeY')
// 腰腹明显偏大 → 体型 C，并给出「上下分开设码」的建议
const cbType = B.clothingFromBody({ sex: 'male', height: 182, chest: 96, waist: 90 })
is(cbType.label, 'XXL', 'bodyTypeCaseLabel')
is(cbType.bodyType.key, 'C', 'bodyTypeCaseC')
is(cbType.advice.length >= 1, true, 'bodyTypeAdvice')
has(cbType.advice.join('\n'), '上衣按胸围', 'bodyTypeAdviceText')
// 胸围腰围都很大但身高很矮 → 按较大维度给码，同时提示身高档位偏大
const cb2 = B.clothingFromBody({ sex: 'male', chest: 112, waist: 100, height: 170 })
is(cb2.label, 'XXXXL', 'bodyBig')
has(cb2.advice.join('\n'), '身高', 'bodyBigAdvice')
is(cb2.bodyType.key, 'A', 'bodyBigType')
const cb4 = B.clothingFromBody({ height: 170 })
is(cb4.label, 'M', 'bodyHeightOnly')
is(cb4.alternatives.length, 2, 'bodyAlternatives')
is(cb4.bodyType, null, 'bodyNoType')
throws(() => B.clothingFromBody({}), 'bodyEmpty')
throws(() => B.clothingFromBody({ chest: 'abc' }), 'bodyGarbage')

/* ---------- 7. 体型与裤装 ---------- */
// 分档下限沿用 GB/T 1335 常见男子口径：Y ≥17 / A ≥12 / B ≥7 / C 其余
is(B.bodyType(96, 80).key, 'A', 'typeA')
is(B.bodyType(96, 78).key, 'Y', 'typeY')
is(B.bodyType(96, 84).key, 'A', 'typeAEdge12')
is(B.bodyType(96, 86).key, 'B', 'typeB')
is(B.bodyType(96, 92).key, 'C', 'typeC')
is(B.bodyType(96, 100).key, 'C', 'typeNegative')
is(B.bodyType(96, 100).diff, -4, 'typeNegDiff')
has(B.bodyType(96, 100).code, '按腰围选码', 'typeNegCode')
is(B.bodyType(90, 80).key, 'B', 'typeWomenSameBasis')
is(B.bodyType(90, 83.5).key, 'C', 'typeFractional')
is(B.bodyType(90, 71).key, 'Y', 'typeA2')
is(B.bodyType(96, 79).key, 'Y', 'typeYEdge17')
is(B.bodyType(96, 79.5).key, 'A', 'typeYEdgeJustBelow')
is(B.bodyType(96, 84.5).key, 'B', 'typeAEdgeJustBelow')
is(B.bodyType(96, 89).key, 'B', 'typeBEdge7')
is(B.bodyType(96, 89.5).key, 'C', 'typeCEdgeBelow7')
has(B.bodyType(96, 80).basis, '女子资料出入', 'typeBasisHonest')
throws(() => B.bodyType(0, 80), 'typeThrow')
throws(() => B.bodyType(96, 0), 'typeThrow2')
const j = B.jeansFromWaist(80)
is(j.inch, 31.5, 'jeansInch')
is(j.size, 31, 'jeansSize')
is(j.chi, 2.4, 'jeansChi')
is(j.folk, 31, 'jeansFolkMatchesInch')
is(B.jeansFromWaist(70).size, 28, 'jeans70')
is(B.jeansFromWaist(70).folk, 28, 'jeans70Folk')
is(B.jeansFromWaist(106).size, 42, 'jeans106')
has(B.jeansFromWaist(80).note, '英寸', 'jeansNote')
throws(() => B.jeansFromWaist(20), 'jeansThrow')
throws(() => B.jeansFromWaist(0), 'jeansZero')

/* ---------- 8. 文胸 ---------- */
const b1 = B.braFrom({ under: 75, over: 87.5 })
is(b1.diff, 12.5, 'braDiff')
is(b1.cupCn, 'B', 'braCupB')
is(b1.cn, '75B', 'braCn')
is(b1.jp, 'B75', 'braJp')
is(b1.cupEu, 'A', 'braCupEuA')
is(b1.eu, '75A', 'braEu')
is(b1.bandIn, 30, 'braBandIn')
is(b1.uk, '30DD', 'braUk')
is(b1.us, '30DD', 'braUs')
is(b1.warnings.length, 0, 'braNoWarn')
has(b1.note, '标称差 12.5', 'braNominalB')
has(b1.crossNote, '+ 4', 'braPlusFourWarning')
is(B.braFrom({ under: 70, over: 80 }).cn, '70A', 'bra70A')
is(B.braFrom({ under: 70, over: 80 }).cupEu, 'AA', 'bra70EuAA')
is(B.braFrom({ under: 80, over: 98 }).cn, '80D', 'bra80D')
is(B.braFrom({ under: 80, over: 98 }).cupUk, 'F', 'bra80UkF')
is(B.braFrom({ under: 80, over: 98 }).bandIn, 32, 'bra80BandIn')
is(B.braFrom({ under: 68, over: 85 }).bandCm, 68, 'braBand68')
is(B.braFrom({ under: 68, over: 85 }).cupCn, 'D', 'bra68CupD')
is(B.braFrom({ under: 68, over: 85 }).diff, 17, 'bra68Diff')
is(B.braFrom({ under: 68, over: 85 }).cupEu, 'D', 'bra68CupEu')
is(B.braFrom({ under: 68, over: 84 }).cupCn, 'C', 'bra68CupC14')
is(B.braFrom({ under: 68, over: 84 }).cupEu, 'C', 'bra68CupEu14')
is(B.braFrom({ under: 68, over: 83 }).cupCn, 'C', 'bra68CupC15')
is(B.braFrom({ under: 75, over: 76 }).cupCn, 'AA', 'braAA')
is(B.braFrom({ under: 75, over: 76 }).warnings.length >= 1, true, 'braSmallDiffWarn')
is(B.braFrom({ under: 75, over: 105 }).warnings.length >= 1, true, 'braBigDiffWarn')
is(B.braFrom({ under: 130, over: 145 }).warnings.length >= 1, true, 'braBandWarn')
throws(() => B.braFrom({ under: 75, over: 75 }), 'braEqual')
throws(() => B.braFrom({ under: 0, over: 80 }), 'braNoUnder')
throws(() => B.braFrom({ under: 75 }), 'braNoOver')
throws(() => B.braFrom({ under: 40, over: 80 }), 'braUnderRange')
const sis = B.braSisters(75, 'B')
is(sis.list.length, 3, 'sisterCount')
is(sis.list[0].code, '73C', 'sisterUp')
is(sis.list[1].code, '78A', 'sisterDown')
is(sis.list[2].code, '70D', 'sisterTight')
is(B.braSisters(74, 'B').list.length, 0, 'sisterUnknown')
const bt = B.braTable()
is(bt.rows.length, 8, 'braTableRows')
is(bt.rows[0].cn, 'A', 'braTableA')
is(bt.rows[2].diff, 15, 'braTableDiff15')
is(bt.rows[2].cn, 'C', 'braTableC')
is(bt.rows[2].uk, 'E', 'braTableUkE')
is(bt.rows[3].cn, 'D', 'braTableD')

/* ---------- 9. 阈值提醒 ---------- */
const w1 = B.sizeWarnings({ sex: 'male', waist: 92 })
is(w1.length, 2, 'waistMaleTwoLines')
is(w1.filter((x) => x.level === 'bad').length, 1, 'waistMaleBad')
has(w1.map((x) => x.text).join('\n'), 'WS/T 428', 'waistStandard')
has(w1.map((x) => x.text).join('\n'), '2003', 'waistGuideYear')
is(B.sizeWarnings({ sex: 'female', waist: 82 }).length, 1, 'waistWomenOne')
is(B.sizeWarnings({ sex: 'female', waist: 70 }).length, 0, 'waistWomenNone')
is(B.sizeWarnings({ sex: 'male', waist: 85 }).length, 1, 'waistMaleEdge85')
is(B.sizeWarnings({}).length, 0, 'warnEmpty')
is(B.sizeWarnings({ height: 120 }).length, 1, 'warnHeight')
is(B.sizeWarnings({ height: 230 })[0].text.indexOf('超出') >= 0, true, 'warnHeightHigh')
is(B.sizeWarnings({ chest: 80, waist: 100 })[0].field, '胸腰差', 'warnDiff')
is(B.sizeWarnings({ footMm: 400 })[0].field, '脚长', 'warnFoot')
is(B.sizeWarnings({ ringCirc: 30 })[0].field, '指围', 'warnRing')
is(B.sizeWarnings({ under: 75, over: 76 })[0].field, '罩杯', 'warnBra')
is(B.WAIST_LINES.length, 4, 'waistLinesCount')
is(B.WAIST_LINES.every((l) => /WS\/T|指南/.test(l.text)), true, 'waistLinesSource')

/* ---------- 10. 统一入口与文本 ---------- */
const all = B.convertSize({ kind: 'clothing', sex: 'male', height: 176, chest: 97, waist: 92 })
is(all.kind, 'clothing', 'allKind')
is(all.clothing.label, 'XL', 'allWaistDriven')
is(all.warnings.length, 2, 'allWarnings')
has(B.sizeSummaryText({ kind: '鞋', shoe: s240 }), 'CN 240', 'sumShoe')
has(B.sizeSummaryText({ kind: '戒指', ring: r52 }), '美码 6', 'sumRing')
has(B.sizeSummaryText({ kind: '服装', clothing: all.clothing, warnings: all.warnings }), '提醒', 'sumWarn')
has(B.sizeSummaryText({ kind: '文胸', bra: b1 }), '75B', 'sumBra')
has(B.sizeSummaryText({ kind: 'x', shoe: s240 }), '非品牌官方数据', 'sumNote')
throws(() => B.convertSize({ kind: 'hat' }), 'badKind')
is(B.fmtCm(175.6), '175.6 cm', 'fmtCm')
is(B.fmtCm(0), '—', 'fmtCmZero')
is(B.fmtMm(240), '240 mm', 'fmtMm')

/* ---------- 11. 全局自洽扫描 ---------- */
// 每个体系反推回来的号码必须落在半步之内（公式可逆）
// 注意：童鞋脚长（≤190mm）按成人 barleycorn 刻度算会得到 0 以下，
// 市售那段是 1K~13K 童码，所以只回代正数号码，负数另有专门断言。
for (let mm = 100; mm <= 335; mm += 15) {
  const r = B.shoeFromMm(mm)
  const sys = ['mm', 'cn', 'jp', 'eu', 'uk', 'us']
  sys.forEach((k) => {
    const code = B.shoeCodeOf(r, k)
    if (k !== 'mm' && k !== 'cn' && k !== 'jp' && !(code > 0)) {
      is(code <= 0, true, 'kidFootGoesNonPositive')
      is(r.kidsSuggested, true, 'kidFootFlagged')
      return
    }
    const back = B.mmFromShoe(code, k)
    if (Math.abs(back - mm) > 3) {
      fail++
      console.log('FAIL reversible' + k + '@' + mm + ': ' + back)
    } else ok++
  })
}
// 童码口径下同样要可逆（用 K 码反推要能回到同一只脚，半码步进 ≈ 4.2mm 允许偏差）
near(B.mmFromShoe(B.shoeFromMm(150).usKids, 'us', { audience: 'kids' }), 150, 5, 'kidsUsReversible')
near(B.mmFromShoe(B.shoeFromMm(150).ukKids, 'uk', { audience: 'kids' }), 150, 5, 'kidsUkReversible')
// 对照表里不许出现负数或 0 号
is(B.shoeTable({ audience: 'kids', from: 120, to: 190 }).rows.every((x) => parseFloat(x.us) > 0 && parseFloat(x.uk) > 0), true, 'kidsTablePositive')
is(B.shoeTable({ from: 230, to: 250 }).rows.length, 5, 'tableRows')
// 每档号型的「号 / 型」必须落在自己给的适穿区间里
is(['male', 'female'].every((sex) => B.clothingTable(sex).every((r) => {
  const seqHeight = parseFloat(r.cn.split('/')[0])
  const seqChest = parseFloat(r.cn.split('/')[1])
  return r.height[0] <= seqHeight && seqHeight <= r.height[1] && r.chest[0] <= seqChest && seqChest <= r.chest[1]
})), true, 'clothingSeqInsideRange')
// 欧码表单调：脚长越大，每个号码都不许变小
const seq = [180, 200, 220, 240, 260, 280, 300].map((mm) => B.shoeFromMm(mm))
is(seq.every((r, i) => i === 0 || (r.eu >= seq[i - 1].eu && r.us >= seq[i - 1].us && r.uk >= seq[i - 1].uk && r.cnOld >= seq[i - 1].cnOld)), true, 'shoeMonotone')
// 服装表每一档的四个区间都必须单调递增
is(['male', 'female'].every((sex) => B.clothingTable(sex).every((r, i, a) => i === 0 || (r.chest[0] > a[i - 1].chest[0] && r.waist[0] > a[i - 1].waist[0] && r.hip[0] > a[i - 1].hip[0] && r.height[0] > a[i - 1].height[0]))), true, 'clothingMonotone')
// 戒指线性公式反算自洽
for (let us = 1; us <= 15; us += 1) {
  const circ = B.RING_CIRC_BASE + us * B.RING_CIRC_PER_SIZE
  if (B.ringFromCirc(circ).us !== us) {
    fail++
    console.log('FAIL ringRoundTrip' + us)
  } else ok++
}

console.log('bodysize ' + (fail ? 'FAIL ' + fail + '/' : '全绿 ') + ok + '/' + (ok + fail))
if (fail) process.exitCode = 1
