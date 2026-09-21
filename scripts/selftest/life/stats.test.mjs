import * as S from './stats.mjs'

let ok = 0
let fail = 0
export function is(a, b, m) {
  if (a === b) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b))
  }
}
export function near(a, b, m, tol) {
  if (isFinite(a) && Math.abs(a - b) < (tol === undefined ? 1e-9 : tol)) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + a + ' want ' + b)
  }
}
export function throws(fn, m) {
  try {
    fn()
    fail++
    console.log('FAIL ' + m + ': should throw')
  } catch (e) {
    if (!e || !e.message) {
      fail++
      console.log('FAIL ' + m + ': empty error')
    } else ok++
  }
}
export function report(name) {
  console.log('== ' + name + ' pass=' + ok + '/' + (ok + fail))
  if (fail) process.exitCode = 1
}

const p = S.parseNumbers('1, 2 3\n4   5\n3x4\nfoo -7')
is(p.values.join(','), '1,2,3,4,5,3,3,3,3,-7', 'parseMixed')
is(p.skipped.join(','), 'foo', 'parseSkipped')
is(S.parseNumbers('1,234,567').values.length, 1, 'thousandsSep')
is(S.parseNumbers('1,234,567').values[0], 1234567, 'thousandsVal')
is(S.parseNumbers('').values.length, 0, 'emptyParse')
is(S.parseNumbers('abc def').values.length, 0, 'noNumbers')
is(S.parseNumbers('1；2、3｜4').values.join(','), '1,2,3,4', 'fullWidthSep')
is(S.parseNumbers('2.5e2').values[0], 250, 'sci')
is(S.parseNumbers('3×7').values.length, 7, 'repeatX')
is(S.parseNumbers('3x0').values.length, 0, 'repeat0')
is(S.parseNumbers('3x99999').notice.indexOf('上限') >= 0, true, 'repeatTooBig')
is(S.parseNumbers('1x2 2').notice, '', 'noNotice')
is(S.parseNumbers('1 NaN').skipped.length, 1, 'nanSkipped')

const d = S.describe([2, 4, 4, 4, 5, 5, 7, 9])
is(d.n, 8, 'n')
near(d.sum, 40, 'sum')
near(d.mean, 5, 'mean')
near(d.median, 4.5, 'median')
is(d.mode.values[0], 4, 'mode')
is(d.mode.count, 3, 'modeCount')
near(d.range, 7, 'range')
near(d.variancePop, 4, 'varPop')
near(d.varianceSample, 32 / 7, 'varSample')
near(d.stdevPop, 2, 'sdPop')
near(d.q1, 4, 'q1R7')
near(d.q3, 5.5, 'q3R7')
near(d.iqr, 1.5, 'iqr')
is(d.outlierCount, 1, 'outlierOf8')
is(d.outliers[0].value, 9, 'outlierVal')
near(d.geometricMean, Math.pow(2 * 4 * 4 * 4 * 5 * 5 * 7 * 9, 1 / 8), 'geo')
near(d.harmonicMean, 8 / (1 / 2 + 3 / 4 + 2 / 5 + 1 / 7 + 1 / 9), 'harm')

const o = S.describe([1, 2, 3, 4, 5, 6, 7, 100])
is(o.outlierCount, 1, 'oneOutlier')
is(o.outliers[0].value, 100, 'outlier100')
is(o.outliers[0].side, 'high', 'side')
is(S.describe([1, 2, 3, 4, 5, 6, 7, 8]).outlierCount, 0, 'noOutlier')

is(S.describe([]).empty, true, 'emptyDesc')
is(S.describe([]).n, 0, 'emptyN')
is(S.describe([7]).n, 1, 'single')
is(Number.isNaN(S.describe([7]).stdevSample), true, 'singleSd')
is(Number.isNaN(S.describe([7]).varianceSample), true, 'singleVar')
is(S.describe([1, 2, 3, -4]).gmNote.indexOf('非正数') >= 0, true, 'gmNote')
is(Number.isNaN(S.describe([1, 2, 3, -4]).geometricMean), true, 'gmNaN')
is(S.describe([1, 2, 3]).mode.uniform, true, 'uniformMode')
is(S.describe([5, 5, 5]).mode.count, 3, 'modeCount3')
near(S.describe([5, 5, 5]).stdevPop, 0, 'zeroSd')
near(S.describe([2, 2, 4, 4]).skewness, 0, 'symZeroSkew')

const g = S.describe([1, 2, 3, 4])
near(g.geometricMean, Math.pow(24, 0.25), 'geo4')
near(g.harmonicMean, 4 / (1 + 0.5 + 1 / 3 + 0.25), 'harm4')
near(g.cv, Math.sqrt(5 / 3) / 2.5, 'cv')
near(g.mad, (1.5 + 0.5 + 0.5 + 1.5) / 4, 'mad')
near(g.trimmedMean10, 2.5, 'trim10')
near(g.sem, Math.sqrt(5 / 3) / 2, 'sem')

is(S.quantile([3, 1, 2], 0.5), 2, 'quantileAPI')
is(S.quantile([1, 2, 3, 4], 0), 1, 'quantileP0')
is(S.quantile([1, 2, 3, 4], 1), 4, 'quantileP1')
is(S.fiveNumber([4, 1, 3, 2]).min, 1, 'fiveMin')
is(S.fiveNumber([4, 1, 3, 2]).max, 4, 'fiveMax')
is(S.fiveNumber([4, 1, 3, 2]).q1, 1.75, 'fiveQ1')

const h = S.histogram([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5)
is(h.bins.length, 5, 'bins5')
is(h.bins[0].count, 2, 'binFirst')
is(h.bins[4].count, 2, 'binLastInclusive')
near(h.binWidth, 1.8, 'binWidth')
is(h.bins.reduce((s, b) => s + b.count, 0), 10, 'binSum')
near(h.bins[4].cumPercent, 100, 'cum100')
is(S.histogram([1, 2, 3, 4, 5]).bins.length, S.suggestBins([1, 2, 3, 4, 5]), 'autoBins')
is(S.histogram([5, 5, 5]).bins.length, 1, 'flatHist')
is(S.histogram([1]).bins.length, 0, 'onePointHist')
is(S.histogram([1, 2, 3], 999).bins.length, 40, 'binCap')

const f = S.freqTable([1, 1, 2, 3, 3, 3])
is(f.rows.length, 3, 'freqRows')
is(f.rows[2].count, 3, 'freqCount')
near(f.rows[2].percent, 50, 'freqPercent')
near(f.rows[2].cumPercent, 100, 'freqCum')
is(f.distinct, 3, 'distinct')
is(S.freqTable([]).rows.length, 0, 'freqEmpty')
is(S.freqTable([1, 2, 3, 4, 5, 6], { top: 2 }).rows.length, 2, 'freqTop')
is(S.freqTable([1, 2, 3, 4, 5, 6], { top: 2 }).truncatedBy, 4, 'freqTruncBy')

const pr = S.parsePairs('10 2\n20 3\nabc\n30,1\n\n40')
is(pr.pairs.length, 4, 'pairsLen')
is(pr.skipped[0], 'abc', 'pairSkipped')
is(pr.pairs[3].weight, 1, 'pairDefaultWeight')
near(S.weightedMean(pr.pairs).value, (10 * 2 + 20 * 3 + 30 * 1 + 40 * 1) / 7, 'weightedMean')
is(S.weightedMean(pr.pairs).weightSum, 7, 'weightSum')
throws(() => S.weightedMean([]), 'weightedEmpty')
throws(() => S.weightedMean([{ value: 1, weight: 0 }]), 'weightedZero')
is(S.parsePairs('').pairs.length, 0, 'pairsEmpty')
near(S.weightedVariance([{ value: 1, weight: 1 }, { value: 3, weight: 1 }], false), 1, 'wVarPop')

const xy = S.parseXY('1 2\n2 4\n3 6')
is(xy.points.length, 3, 'xyLen')
is(xy.points[2].y, 6, 'xyVal')

const r = S.linearFit([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])
near(r.slope, 2, 'slope')
near(r.intercept, 0, 'intercept')
near(r.r2, 1, 'r2')
near(r.predict(6), 12, 'predict')
near(r.r, 1, 'pearson')
const r2 = S.linearFit([1, 2, 3], [1, 3, 2])
near(r2.slope, 0.5, 'slope2')
near(r2.intercept, 1, 'intercept2')
near(r2.r2, 0.25, 'r2b')
near(S.linearFit([1, 2, 3, 4], [8, 6, 4, 2]).slope, -2, 'negSlope')
is(S.linearFit([1, 2, 3, 4], [8, 6, 4, 2]).equation.indexOf('−') >= 0, true, 'negEq')
is(Number.isNaN(S.linearFit([1, 2, 3], [5, 5, 5]).r2), true, 'flatY')
throws(() => S.linearFit([2, 2, 2], [1, 2, 3]), 'flatX')
throws(() => S.linearFit([1], [1]), 'onePoint')
throws(() => S.linearFit([], []), 'emptyFit')
is(S.pearson([1, 2, 3], [1, 2, 3]).r, 1, 'pearsonAPI')

const txt = S.summaryText(S.describe([1, 2, 3]))
is(txt.indexOf('n = 3') >= 0, true, 'text')
is(S.summaryText(null), '（没有数据）', 'textNull')
is(S.fmtNum(1.5) , '1.5', 'fmt1')
is(S.fmtNum(1.25, 1), '1.3', 'fmtRound')
is(S.fmtNum(NaN), '—', 'fmtNaN')
is(S.fmtNum(1e20).indexOf('e+') >= 0, true, 'fmtExp')
is(S.cleanValues(['a', 1, 2, null, '3']).length, 3, 'cleanValues')
is(S.MAX_POINTS > 0, true, 'constMax')
report('stats')
