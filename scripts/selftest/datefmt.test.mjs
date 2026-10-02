/**
 * datefmt.js 自查断言（直接测 src/utils/datefmt.js 本体）
 * ------------------------------------------------------------
 * 判据分四类，外部来源如下：
 *   1) 外部裁判：渲染出的字段值用 toISOString()（天然 UTC）切出来的年/月/日/时/分/秒/毫秒对撞；
 *      星期名/月名是公开英文日历事实（2024-02-29 是 Thursday、2 月是 February），写死答案。
 *   2) 往返性质：一种记法译成另一种，再译回来必须逐字回到原串 —— 这正是源码注释里
 *      反复强调的坑（单字符占位符缺失会让「译过去再译回来」丢字段）。
 *   3) 切分性质：parsePattern 的 token.raw 拼回去必须等于原格式串（没吞字），
 *      且 Go 的 `15:04:05` 不能被 `1`/`5` 抢先拆坏（长 token 优先）。
 *   4) 边界与反例：空串、认不出的串、非法输入必须抛中文错；译出的格式串与样例不得为空、不含 undefined/NaN。
 *
 * 时区：本机 UTC+8、CI 是 UTC。渲染用的是本地 getter，所以先把进程时区钉成 UTC，
 * 输入一律用 Date.UTC 构造，断言才与时区无关。
 */
import { useUtils, makeTest } from './harness.mjs'

process.env.TZ = 'UTC'

const F = await useUtils('datefmt')
const T = makeTest('datefmt')

const MS = Date.UTC(2024, 1, 29, 13, 5, 7, 9) // 2024-02-29 星期四 13:05:07.009 UTC
const d = new Date(MS)
const iso = (ms) => new Date(ms).toISOString()

/* ---------- 1. 记法检测 ---------- */
T.eq('detect strftime', F.detect('%Y-%m-%d %H:%M:%S'), 'strftime')
T.eq('detect go', F.detect('2006-01-02 15:04:05'), 'go')
T.eq('detect moment', F.detect('YYYY-MM-DD'), 'moment')
T.eq('detect java', F.detect('yyyy-MM-dd'), 'java')
T.eq('detect java HH:mm', F.detect('HH:mm:ss'), 'java')
T.eq('detect 认不出给 null', F.detect('随便一串'), null)
T.eq('detect 空串给 null', F.detect(''), null)

/* ---------- 2. parsePattern：切分与长 token 优先 ---------- */
const tk = (p, n) => F.parsePattern(p, n)
T.eq('parse java yyyy-MM-dd', tk('yyyy-MM-dd', 'java').map((t) => t.type), ['year4', 'literal', 'month2', 'literal', 'day2'])
T.eq('parse go 15:04:05 不被拆坏', tk('15:04:05', 'go').map((t) => t.type), ['hour24', 'literal', 'minute', 'literal', 'second'])
T.eq('parse go 2006-01-02', tk('2006-01-02', 'go').map((t) => t.type), ['year4', 'literal', 'month2', 'literal', 'day2'])
T.eq('parse strftime %-m 是 month1', tk('%-m', 'strftime')[0].type, 'month1')
T.eq('parse strftime %Y 是 year4', tk('%Y', 'strftime')[0].type, 'year4')
T.eq('parse 连续字面量合并成一个', tk('xyz', 'java').length, 1)
T.eq('parse 空串给空数组', tk('', 'java').length, 0)
for (const [p, n] of [['yyyy-MM-dd HH:mm:ss', 'java'], ['%Y-%m-%dT%H:%M:%S%z', 'strftime'], ['2006-01-02 15:04:05', 'go'], ['YYYY年MM月DD日 dddd', 'moment']]) {
  T.eq('parse 拼回原串 ' + n, tk(p, n).map((t) => t.raw).join(''), p)
}

/* ---------- 3. renderSample：与 toISOString 及日历事实对撞 ---------- */
const rd = (p, n) => F.renderSample(F.parsePattern(p, n), d)
T.eq('render java 全字段', rd('yyyy-MM-dd HH:mm:ss', 'java'), '2024-02-29 13:05:07')
T.eq('render 与 ISO 切出的一致', rd('yyyy-MM-dd HH:mm:ss', 'java'), iso(MS).slice(0, 10) + ' ' + iso(MS).slice(11, 19))
T.eq('render strftime', rd('%Y-%m-%d %H:%M:%S', 'strftime'), '2024-02-29 13:05:07')
T.eq('render 月名', rd('MMMM', 'moment'), 'February')
T.eq('render 月名缩写', rd('MMM', 'moment'), 'Feb')
T.eq('render 星期名', rd('dddd', 'moment'), 'Thursday')
T.eq('render 星期缩写', rd('ddd', 'moment'), 'Thu')
T.eq('render 12 小时补零', rd('hh', 'moment'), '01')
T.eq('render 12 小时不补零', rd('h', 'moment'), '1')
T.eq('render 下午标记', rd('A', 'moment'), 'PM')
T.eq('render 年内第几天', rd('DDD', 'moment'), '060')
T.eq('render go 年内第几天', rd('002', 'go'), '060')
T.eq('render 时区偏移（UTC）', rd('ZZ', 'moment'), '+00:00')
T.eq('render 不补零时分秒', rd('H:m:s', 'java'), '13:5:7')
T.eq('render 上午标记', F.renderSample(F.parsePattern('A', 'moment'), new Date(Date.UTC(2024, 0, 1, 9, 0, 0))), 'AM')
T.eq('render 午夜 12 小时制', F.renderSample(F.parsePattern('h', 'moment'), new Date(Date.UTC(2024, 0, 1, 0, 30, 0))), '12')
T.ok('render 无 undefined/NaN', !/undefined|NaN/.test(rd('yyyy-MM-dd HH:mm:ss SSS EEEE', 'java')))

/* ---------- 4. convert：互转 + 往返性质 ---------- */
const c = F.convert('yyyy-MM-dd HH:mm:ss', 'java', d)
T.eq('convert source', c.source, 'java')
T.eq('convert 结果数 4', c.results.length, 4)
T.eq('convert →moment', c.results.find((r) => r.key === 'moment').pattern, 'YYYY-MM-DD HH:mm:ss')
T.eq('convert →strftime', c.results.find((r) => r.key === 'strftime').pattern, '%Y-%m-%d %H:%M:%S')
T.eq('convert →go', c.results.find((r) => r.key === 'go').pattern, '2006-01-02 15:04:05')
T.eq('convert 源记法标记', c.results.find((r) => r.key === 'java').isSource, true)
T.eq('convert 源样例', c.sourceSample, '2024-02-29 13:05:07')
T.eq('convert moment 样例', c.results.find((r) => r.key === 'moment').sample, '2024-02-29 13:05:07')
T.eq('convert tokens 去掉字面量', c.tokens.length, 6)
T.ok('convert tokens 全是字段', c.tokens.every((t) => t.type !== 'literal'))

const back = (pattern, from, to) =>
  F.convert(F.convert(pattern, from).results.find((r) => r.key === to).pattern, to)
    .results.find((r) => r.key === from).pattern
T.eq('往返 java↔moment', back('yyyy-MM-dd HH:mm:ss', 'java', 'moment'), 'yyyy-MM-dd HH:mm:ss')
T.eq('往返 strftime↔go', back('%Y-%m-%d %H:%M:%S', 'strftime', 'go'), '%Y-%m-%d %H:%M:%S')
T.eq('往返 java↔strftime', back('yyyy-MM-dd', 'java', 'strftime'), 'yyyy-MM-dd')
T.eq('往返 moment↔go', back('YYYY-MM-DD', 'moment', 'go'), 'YYYY-MM-DD')
T.eq('往返 strftime↔moment 单字符月', back('%-m', 'strftime', 'moment'), '%-m')

T.eq('convert auto 检测 strftime', F.convert('%Y', 'auto').source, 'strftime')
T.throws('convert 空串抛中文', () => F.convert('', 'java'), /空/)
T.throws('convert 认不出抛中文', () => F.convert('随便', 'auto'), /认不出/)

/* ---------- 5. 记法定义与样例表 ---------- */
T.eq('NOTATIONS 数量 4', F.NOTATIONS.length, 4)
T.eq('NOTATIONS keys', F.NOTATIONS.map((n) => n.key), ['strftime', 'java', 'moment', 'go'])
T.eq('getNotation java', F.getNotation('java').key, 'java')
T.eq('getNotation 未知回退 strftime', F.getNotation('nope').key, 'strftime')
T.eq('FMT_SAMPLES 数量 5', F.FMT_SAMPLES.length, 5)
T.ok('FMT_SAMPLES 都能识别为 strftime', F.FMT_SAMPLES.every((s) => F.detect(s.value) === 'strftime'))
T.ok('FMT_SAMPLES 都能转换', F.FMT_SAMPLES.every((s) => { try { return F.convert(s.value, 'auto').results.length === 4 } catch (e) { return false } }))
T.ok('FMT_SAMPLES 有中文名', F.FMT_SAMPLES.every((s) => /[\u4e00-\u9fa5]/.test(s.name)))

/* ---------- 6. UI 契约：译出的格式串与样例都要可用 ---------- */
const cc = F.convert('%Y-%m-%d %H:%M:%S', 'strftime', d)
T.ok('所有译出的格式串非空', cc.results.every((r) => r.pattern.length > 0))
T.ok('所有样例无 undefined/NaN', cc.results.every((r) => !/undefined|NaN/.test(r.sample)))
T.ok('样例都不为空', cc.results.every((r) => r.sample.length > 0))

T.done()
