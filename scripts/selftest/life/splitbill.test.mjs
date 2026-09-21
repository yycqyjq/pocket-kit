import * as S from './splitbill.mjs'

let ok = 0
let fail = 0
function is(a, b, m) {
  if (a === b) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b))
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

/* ---------- 金额底层：分运算，不吃浮点亏 ---------- */
is(S.toCents('12.34'), 1234, 'cents1')
is(S.toCents('¥1,234.56'), 123456, 'cents2')
is(S.toCents(0.1) + S.toCents(0.2), 30, 'floatSafe')
is(S.centsText(30), '0.30', 'centsText1')
is(S.centsText(-1234), '-12.34', 'centsTextNeg')
is(S.moneyText(1234, 'CNY'), '¥12.34', 'moneyCNY')
is(S.moneyText(123456, 'JPY'), '¥1,235', 'moneyJPY')
is(S.moneyText(-500, 'USD'), '-$5.00', 'moneyUSD')
throws(() => S.toCents('abc'), 'badAmount')
throws(() => S.toCents('1e20'), 'hugeAmount')

/* ---------- 参与人解析 ---------- */
const p1 = S.parsePeople('张三\n李四\n王五')
is(p1.rows.length, 3, 'people3')
is(p1.rows[0].weight, 1, 'defaultWeight')
is(p1.weightSum, 3, 'weightSum')
const p2 = S.parsePeople('张三 x2\n李四*1\n王五 3份\n赵六 不参与')
is(p2.rows[0].weight, 2, 'wx2')
is(p2.rows[1].weight, 1, 'wstar1')
is(p2.rows[2].weight, 3, 'w3fen')
is(p2.rows[3].join, false, 'nojoin')
is(p2.weightSum, 6, 'weightSum2')
const p3 = S.parsePeople('张三:120\n李四，80')
is(p3.rows[0].paid, 120, 'paid1')
is(p3.rows[1].paid, 80, 'paid2')
is(p3.paidSum, 200, 'paidSum')
const p4 = S.parsePeople('张三 3\n李四 2', 'weight')
is(p4.rows[0].weight, 3, 'asWeight')
is(p4.rows[0].paid, null, 'asWeightNoPaid')
const p5 = S.parsePeople('Li Ming 100\n张三\n张三')
is(p5.rows[0].name, 'Li Ming', 'spaceName')
is(p5.rows[0].paid, 100, 'spaceNamePaid')
is(p5.rows[2].name, '张三(2)', 'dupName')
is(p5.notice.indexOf('重名') >= 0, true, 'dupNotice')
is(S.parsePeople('120').rows[0].name, '第1人', 'numberOnlyLine')
is(S.parsePeople('').rows.length, 0, 'emptyPeople')
throws(() => S.parsePeople(new Array(201).fill('张三').join('\n')), 'tooMany')

/* ---------- 最大余数法分摊 ---------- */
is(JSON.stringify(S.allocate(1000, [1, 1, 1])), '[334,333,333]', 'alloc1000')
is(S.allocate(1000, [1, 1, 1]).reduce((a, b) => a + b, 0), 1000, 'allocSum')
const nine = [1, 1, 1, 1, 1, 1, 1, 1, 1]
is(S.allocate(10, nine).reduce((a, b) => a + b, 0), 10, 'alloc9sum')
is(S.allocate(10, nine)[0], 2, 'alloc9first')
is(S.allocate(10, nine)[8], 1, 'alloc9last')
is(JSON.stringify(S.allocate(0, [1, 1])), '[0,0]', 'allocZero')
is(JSON.stringify(S.allocate(-101, [1, 1])), '[-50,-51]', 'allocNeg')
is(JSON.stringify(S.allocate(1000, [1, 3])), '[250,750]', 'allocWeight')
throws(() => S.allocate(100, [0, 0]), 'allocNoWeight')

const s1 = S.splitShares(10000, S.parsePeople('A\nB\nC').rows, 'equal')
is(s1.sumCheck, true, 'sumCheck')
is(s1.items[0].share, 3334, 'eqShare')
is(s1.spread, 1, 'eqSpread')
is(s1.headCount, 3, 'headCount')
const s2 = S.splitShares(10000, S.parsePeople('A x2\nB x1').rows, 'weight')
is(s2.items[0].share, 6667, 'wShare2')
is(s2.items[1].share, 3333, 'wShare1')
is(s2.sumCheck, true, 'wSumCheck')
const s3 = S.splitShares(10000, S.parsePeople('A:60\nB:30').rows, 'paid')
is(s3.items[0].share, 6500, 'paidOwnA')
is(s3.items[1].share, 3500, 'paidOwnB')
is(s3.commonPart, 1000, 'commonPart')
is(s3.sumCheck, true, 'paidSumCheck')
is(s3.notice.indexOf('10.00') >= 0, true, 'commonNotice')
const s4 = S.splitShares(9999, S.parsePeople('A\nB\nC\nD\nE').rows, 'equal')
is(s4.items.reduce((a, b) => a + b.share, 0), 9999, 'fiveSum')
is(s4.items.filter((x) => x.join).length, 5, 'fiveJoin')
throws(() => S.splitShares(100, S.parsePeople('A 不参与').rows, 'weight'), 'nobody')
throws(() => S.splitShares(100, S.parsePeople('A\nB').rows, 'paid'), 'paidNoAmount')

/* ---------- 取整 / 抹零 ---------- */
is(S.roundCents(1299, 'down', 100), 1200, 'roundDown')
is(S.roundCents(1201, 'up', 100), 1300, 'roundUp')
is(S.roundCents(1250, 'nearest', 100), 1300, 'roundNear')
is(S.roundCents(1249, 'nearest', 100), 1200, 'roundNear2')
is(S.roundCents(1234, 'down', 500), 1000, 'round5Yuan')
is(S.roundCents(1234, 'nearest', 10), 1230, 'roundJiao')
is(S.roundCents(-1299, 'down', 100), -1200, 'roundNegDown')
is(S.roundCents(-1201, 'up', 100), -1300, 'roundNegUp')
is(S.roundModeName('up'), '向上进', 'modeName')

/* ---------- 计价链路 ---------- */
const c1 = S.priceChain(10000, [{ kind: 'tax', v: 10 }, { kind: 'tip', v: 10 }])
is(c1.final, 12100, 'chainTaxTip')
is(c1.notice.indexOf('可交换') >= 0, true, 'chainNotice')
is(c1.steps.length, 3, 'chainSteps')
is(c1.steps[2].text, '121.00', 'chainLast')
const c2 = S.priceChain(10000, [{ kind: 'discount', v: 20 }, { kind: 'tax', v: 8 }, { kind: 'round', mode: 'down', unitCents: 100 }])
is(c2.final, 8600, 'chainRound')
is(c2.notice.indexOf('会改变结果') >= 0, true, 'chainNotice2')
const c3 = S.priceChain(10000, [{ kind: 'add', v: '20.00' }, { kind: 'sub', v: '5.00' }])
is(c3.final, 11500, 'chainAddSub')
is(c3.steps[1].expr, '+ 20.00', 'chainAddExpr')

const oc = S.orderCompare(10000, { taxRate: 8, discountRate: 20, tipRate: 0, roundMode: 'down', roundUnitCents: 100 })
is(oc.variants.length, 3, 'orderVariants')
is(oc.identical, false, 'orderDiffers')
is(oc.variants[0].final, 8600, 'orderFold')
const oc2 = S.orderCompare(10000, { taxRate: 8, discountRate: 20, tipRate: 10, roundMode: 'nearest', roundUnitCents: 10000 })
is(oc2.variants[0].final, 10000, 'orderBigRoundA')
is(oc2.variants[1].final, 10000, 'orderBigRoundB')
is(oc2.variants[2].final, 9504, 'orderBigRoundC')
is(oc2.identical, false, 'orderBigIdentical')
is(oc2.maxDiff, 496, 'orderBigMaxDiff')
is(oc2.notice.length > 4, true, 'orderNotice')

/* ---------- 撮平转账 ---------- */
const st1 = S.settle([
  { name: 'A', paid: 30000, share: 10000 },
  { name: 'B', paid: 0, share: 10000 },
  { name: 'C', paid: 0, share: 10000 },
])
is(st1.transfers.length, 2, 'settle2')
is(st1.transfers[0].from + '>' + st1.transfers[0].to, 'B>A', 'settleOrder')
is(st1.transfers[0].amount, 10000, 'settleAmount')
is(st1.settled, true, 'settleDone')
is(st1.upperBound, 2, 'settleUpper')
const st2 = S.settle([
  { name: 'A', paid: 10000, share: 10000 },
  { name: 'B', paid: 10000, share: 10000 },
])
is(st2.transfers.length, 0, 'settleNone')
is(st2.notice.indexOf('不需要互相转账') >= 0, true, 'settleNoneNotice')
const st3 = S.settle([
  { name: 'A', paid: 30000, share: 10000 },
  { name: 'B', paid: 0, share: 8000 },
  { name: 'C', paid: 0, share: 6000 },
  { name: 'D', paid: 0, share: 6000 },
])
is(st3.transfers.length, 3, 'settle3Count')
is(st3.transfers.reduce((a, t) => a + t.amount, 0), 20000, 'settleFlow')
is(st3.settled, true, 'settle3Done')
is(st3.balances.filter((b) => b.balance !== 0).length, 4, 'settle3Balances')
is(st3.balances[0].text, '应收 200.00', 'settle3BalanceText')
is(st3.upperBound, 3, 'settle3Upper')
const st4 = S.settle([
  { name: 'A', paid: 100, share: 33 },
  { name: 'B', paid: 0, share: 33 },
  { name: 'C', paid: 0, share: 34 },
])
is(st4.transfers.every((t) => t.amount > 0), true, 'settleNoZero')
is(st4.balances[0].text, '应收 0.67', 'settleBalanceText')

/* ---------- 群聊文本 ---------- */
const txt = S.splitText({
  title: '周五火锅',
  cur: 'CNY',
  total: 10000,
  headCount: 3,
  items: S.splitShares(10000, S.parsePeople('A 30\nB 20\nC').rows, 'weight').items,
})
is(txt.indexOf('【AA 账单】') === 0, true, 'txtHead')
is(txt.indexOf('¥33.34') >= 0 || txt.indexOf('¥33.33') >= 0, true, 'txtShares')
is(txt.indexOf('人均：¥33.33') >= 0, true, 'txtPerHead')
is(txt.indexOf('生成') >= 0, true, 'txtFooter')
is(txt.split('\n').length > 6, true, 'txtLines')

/* ---------- 汇率只做显示 ---------- */
const fx1 = S.fxDisplay(12340, 0, 'USD', 'CNY')
is(fx1.converted, null, 'fxNoRate')
is(fx1.text, '$123.40（未填汇率，不做换算）', 'fxNoRateText')
const fx2 = S.fxDisplay(12340, 7.1, 'USD', 'CNY')
is(fx2.converted, 87614, 'fxRate')
is(fx2.note.indexOf('手填') >= 0, true, 'fxNote')
is(S.fxDisplay(12340, 1, 'CNY', 'CNY').converted, 12340, 'fxIdentity')
is(S.currencyOf('NOPE').key, 'CNY', 'currencyFallback')
is(S.CURRENCIES.length >= 10, true, 'currencyTable')
is(S.ROUND_UNITS.length, 5, 'roundUnits')
is(S.TIP_PRESETS.length, 6, 'tipPresets')

console.log('== splitbill pass=' + ok + '/' + (ok + fail))
if (fail) process.exitCode = 1
