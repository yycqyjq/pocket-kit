import * as S from './stats.mjs'
let ok=0, fail=0
function eq(a,b,m){ if(Math.abs(a-b)<1e-9){ok++} else {fail++; console.log('FAIL',m,a,b)} }
function is(a,b,m){ if(a===b){ok++} else {fail++; console.log('FAIL',m,a,'!==',b)} }
const p = S.parseNumbers("1, 2 3\n4   5\n3x4\nfoo -7")
is(p.values.join(','), '1,2,3,4,5,3,3,3,3,-7', 'parse')
is(p.skipped.join(','), 'foo', 'skipped')
const d = S.describe([2,4,4,4,5,5,7,9])
eq(d.mean,5,'mean'); is(d.n,8,'n'); eq(d.median,4.5,'median'); eq(d.mode.values[0],4,'mode'); eq(d.range,7,'range')
eq(d.variancePop,4,'vp'); eq(d.varianceSample,4.571428571428571,'vs'); eq(d.q1,3.75,'q1'); eq(d.q3,6.5,'q3'); eq(d.iqr,2.75,'iqr')
is(d.outlierCount,0,'out0')
const d2 = S.describe([1,2,3,4,5,6,7,100])
is(d2.outliers.length,1,'out1'); is(d2.outliers[0].value,100,'out100')
const g = S.describe([1,2,3,4])
eq(g.geometricMean, Math.pow(24,0.25),'geo'); eq(g.harmonicMean, 4/(1+0.5+1/3+0.25),'harm')
is(S.describe([1,2,3,-4]).gmNote.indexOf('非正数')>=0, true, 'gmneg')
is(S.describe([]).empty, true, 'empty')
const h = S.histogram([1,2,3,4,5,6,7,8,9,10], 5)
is(h.bins.length,5,'bins5'); is(h.bins[0].count,2,'bin1'); is(h.bins[4].count,2,'bin5'); eq(h.binWidth,1.8,'bw')
const f = S.freqTable([1,1,2,3,3,3])
is(f.rows[2].count,3,'freq3'); eq(f.rows[2].percent,50,'pct')
const pr = S.parsePairs("10 2\n20 3\nabc\n30,1")
is(pr.pairs.length,3,'pairs'); is(pr.skipped[0],'abc','pskip')
const w = S.weightedMean(pr.pairs)
eq(w.value,(10*2+20*3+30*1)/6,'wm'); eq(w.weightSum,6,'ws')
const r = S.linearFit([1,2,3,4,5],[2,4,6,8,10])
eq(r.slope,2,'slope'); eq(r.intercept,0,'intc'); eq(r.r2,1,'r2'); eq(r.predict(6),12,'pred')
const r2 = S.linearFit([1,2,3],[1,3,2])
is(Math.abs(r2.slope-0.5)<1e-9,'',true); eq(r2.slope,0.5,'s2'); eq(r2.intercept,0.6666666666666661+0.3333333333333333-0.3333333333333333,'i2')
try{ S.linearFit([1,1],[1,2]); fail++ }catch(e){ ok++ }
try{ S.weightedMean([]); fail++ }catch(e){ ok++ }
is(S.quantile([3,1,2],0.5),2,'qAPI')
is(S.parseNumbers("1000000x5").values.length,5,'rep')
console.log('STATS ok='+ok+' fail='+fail)
