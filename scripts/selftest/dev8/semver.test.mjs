/** semver.js 自查：npm node-semver 官方用例集 + SemVer 2.0.0 规范示例链 */
import { useUtils, makeTest } from '../harness.mjs'

const T = makeTest('semver')
const {
  parseVersion,
  tryParse,
  coerce,
  compare,
  sortVersions,
  inc,
  diff,
  breakingChanges,
  parseRange,
  satisfies,
  explainSatisfies,
  RELEASE_TYPES,
  SEMVER_SAMPLES,
  SEMVER_NOTES,
} = await useUtils('semver')

/* ---------- 解析 ---------- */
const p = parseVersion('1.2.3')
T.eq('解析三段', [p.major, p.minor, p.patch].join('-'), '1-2-3')
const q = parseVersion('v10.20.30-alpha.1+build.5')
T.eq('v 前缀/预发布/构建元数据', [q.core, q.pre.join('.'), q.build.join('.')].join('|'), '10.20.30|alpha.1|build.5')
T.eq('规范串去掉 v', parseVersion('V1.2.3').version, '1.2.3')
T.eq('大数字段', parseVersion('999999999999.0.0').major, 999999999999)
T.calc('宽松解析 1.2', () => [tryParse('1.2').core, String(tryParse('1.2').partial)].join('|'), '1.2.0|true')
T.calc('宽松解析 1.x', () => tryParse('1.x').core, '1.0.0')
T.eq('严格模式拒绝两段', tryParse('1.2') === null, false)
T.throws('拒绝两段（严格）', () => parseVersion('1.2'))
T.throws('拒绝前导零', () => parseVersion('01.2.3'))
T.throws('拒绝预发布数字前导零', () => parseVersion('1.2.3-01'))
T.throws('拒绝空预发布段', () => parseVersion('1.2.3-'))
T.throws('拒绝下划线', () => parseVersion('1.2.3-beta_1'))
T.throws('拒绝内部空格', () => parseVersion('1.2 .3'))
T.throws('拒绝空串', () => parseVersion(''))
T.throws('拒绝超长输入', () => parseVersion('9'.repeat(300)))
T.eq('coerce 从杂文抓版本', coerce('node v18.17.0 (arm64)').core, '18.17.0')
T.eq('coerce 抓不到给 null', coerce('纯中文'), null)

/* ---------- 比较：semver.org 官方示例链 ---------- */
const chain = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0']
let chainBad = []
for (let i = 0; i + 1 < chain.length; i++) if (compare(chain[i], chain[i + 1]) !== -1) chainBad.push(chain[i] + '>=' + chain[i + 1])
T.eq('官方递增链 7 步', chainBad.join(','), '')
T.eq('数字段按数值比而非字典序', compare('1.0.0-beta.2', '1.0.0-beta.11'), -1)
T.eq('正式版大于其预发布', compare('1.0.0', '1.0.0-rc.9'), 1)
T.eq('构建元数据不参与比较', compare('1.0.0+build.1', '1.0.0+build.2'), 0)
T.eq('主版本优先', compare('2.0.0', '10.0.0'), -1)
T.eq('反序比较取负', compare('1.0.0', '1.0.0-alpha'), 1)
T.throws('比较非法版本抛中文错', () => compare('1.0.0', '1.0.0.1'))
T.eq('超大数字段仍精确（不走 float）', compare('1.0.0-99999999999999999999', '1.0.0-99999999999999999998'), 1)

/* ---------- 排序 ---------- */
const s = sortVersions('1.0.0 2.0.0 1.0.1 1.0.0-beta abc 2.0.0')
T.eq('升序结果', s.unique.join(' < '), '1.0.0-beta < 1.0.0 < 1.0.1 < 2.0.0')
T.eq('非法项被收集', s.rejected.join(','), 'abc')
T.eq('排序最大/最小', s.max + '/' + s.min, '2.0.0/1.0.0-beta')
T.eq('降序首位', sortVersions(['1.0.0', '1.0.1'], true).sorted[0], '1.0.1')
T.eq('重复项标 dup', s.rows.filter((r) => r.dup).length, 1)
T.eq('空列表不炸', sortVersions('').count, 0)

/* ---------- 递增（对齐 npm semver.inc） ---------- */
T.eq('major', inc('1.2.3', 'major'), '2.0.0')
T.eq('minor', inc('1.2.3', 'minor'), '1.3.0')
T.eq('patch', inc('1.2.3', 'patch'), '1.2.4')
T.eq('patch 遇预发布只转正', inc('1.2.3-beta.1', 'patch'), '1.2.3')
T.eq('major 已是 2.0.0-beta 只转正', inc('2.0.0-beta', 'major'), '2.0.0')
T.eq('minor 已是 1.3.0-beta 只转正', inc('1.3.0-beta', 'minor'), '1.3.0')
T.eq('prerelease 正式版先升修订', inc('1.2.3', 'prerelease'), '1.2.4-0')
T.eq('prerelease 带前缀', inc('1.2.3', 'prerelease', 'rc'), '1.2.4-rc.0')
T.eq('prerelease 推进序号', inc('1.2.4-rc.0', 'prerelease', 'rc'), '1.2.4-rc.1')
T.eq('prerelease 缺序号则补 0', inc('1.2.3-beta', 'prerelease'), '1.2.3-beta.0')
T.eq('prerelease 换前缀重新起算', inc('1.2.3-beta.7', 'prerelease', 'rc'), '1.2.3-rc.0')
T.eq('premajor', inc('1.2.3', 'premajor'), '2.0.0-0')
T.eq('preminor 带前缀', inc('1.2.3', 'preminor', 'beta'), '1.3.0-beta.0')
T.eq('prepatch', inc('1.2.3', 'prepatch'), '1.2.4-0')
T.eq('天文数字修订号可加一', inc('1.0.999999999999999999', 'prerelease'), '1.0.1000000000000000000-0')
T.throws('未知类型报错', () => inc('1.2.3', 'huge'))
T.throws('非法预发布前缀报错', () => inc('1.2.3', 'prerelease', 'a b'))
T.eq('递增类型表条数', RELEASE_TYPES.length, 7)

/* ---------- diff 与风险提示 ---------- */
T.eq('diff major', diff('1.2.3', '2.0.0').type, 'major')
T.eq('diff minor', diff('1.2.3', '1.3.0').type, 'minor')
T.eq('diff 构建元数据算等价', diff('1.0.0+a', '1.0.0+b').type, 'same')
T.ok('主版本升级标 danger', breakingChanges('1.2.3', '2.0.0').some((x) => x.level === 'danger'))
T.ok('次版本升级只有 ok', breakingChanges('1.2.3', '1.3.0').every((x) => x.level === 'ok'))
T.ok('0.x 升级带专门警告', breakingChanges('0.2.0', '0.3.0').some((x) => /0\.x/.test(x.t + x.d)))
T.ok('降级被识别', breakingChanges('2.0.0', '1.0.0').some((x) => /降级/.test(x.t)))

/* ---------- 范围（npm 官方 satisfies 用例节选） ---------- */
const ranges = [
  ['1.2.3', '^1.2.3', true],
  ['1.9.9', '^1.2.3', true],
  ['2.0.0', '^1.2.3', false],
  ['1.2.2', '^1.2.3', false],
  ['0.2.9', '^0.2.3', true],
  ['0.3.0', '^0.2.3', false],
  ['0.0.3', '^0.0.3', true],
  ['0.0.4', '^0.0.3', false],
  ['0.1.0', '^0.0', false],
  ['0.0.9', '^0.0', true],
  ['1.0.0', '^0', false],
  ['0.9.9', '^0', true],
  ['0.0.0', '^0.0.x', true],
  ['0.1.0', '^0.0.x', false],
  ['1.2.99', '^1.2.x', true],
  ['1.3.0', '^1.2.x', true],
  ['2.0.0', '^1.2.x', false],
  ['1.2.3', '~1.2.3', true],
  ['1.3.0', '~1.2.3', false],
  ['1.2.9', '~1.2', true],
  ['1.3.0', '~1.2', false],
  ['1.9.9', '~1', true],
  ['2.0.0', '~1', false],
  ['1.2.3', '~>1.2.3', true],
  ['1.2.9', '1.2.x', true],
  ['1.3.0', '1.2.x', false],
  ['1.2.3', '1.x', true],
  ['0.9.9', '1.x', false],
  ['1.2.3', '*', true],
  ['1.2.3-a', '*', false],
  ['1.2.3', '', true],
  ['1.2.3', 'x', true],
  ['1.2.3', '1.2.3 - 2.3.4', true],
  ['2.3.4', '1.2.3 - 2.3.4', true],
  ['2.3.5', '1.2.3 - 2.3.4', false],
  ['2.3.9', '1.2.3 - 2.3', true],
  ['2.4.0', '1.2.3 - 2.3', false],
  ['1.2.0', '1.2 - 2.3.4', true],
  ['1.1.9', '1.2 - 2.3.4', false],
  ['2.0.0', '^1.0.0 || ^2.0.0', true],
  ['3.0.0', '^1.0.0 || ^2.0.0', false],
  ['1.2.9', '>=1.2 <1.3', true],
  ['1.3.0', '>=1.2 <1.3', false],
  ['1.2.3', '=1.2.3', true],
  ['1.2.3', '>1.2.3', false],
  ['1.2.4', '>1.2.3', true],
  ['1.2.3', '<=1.2.3', true],
  ['1.2.3', 'v1.2.x', true],
  ['1.0.0-rc.1', '>=1.0.0-rc.1 <1.0.0', true],
  ['1.0.0-rc.0', '>=1.0.0-rc.1 <1.0.0', false],
  ['1.0.0', '>=1.0.0-rc.1 <1.0.0', false],
  ['1.2.3-alpha', '^1.2.3', false],
  ['1.2.3-alpha', '^1.2.3-alpha', true],
  ['1.2.4-alpha', '^1.2.3-alpha', false],
  ['1.2.3', '>=1.2.3 <2.0.0', true],
  ['0.0.1', '>=0.0.1', true],
  ['1.2.3', '  ^1.2.3  ', true],
  ['3.0.0', '>=1.0.0 <2.0.0 || ^3.0.0', true],
]
let rBad = []
for (const [ver, range, want] of ranges) {
  let got
  try {
    got = satisfies(ver, range)
  } catch (e) {
    got = 'throw:' + e.message
  }
  if (got !== want) rBad.push(ver + ' vs ' + JSON.stringify(range) + ' 期望 ' + want + ' 实得 ' + got)
}
T.eq('satisfies ' + ranges.length + ' 组（npm 用例）', rBad.join(' ; '), '')

const rr = parseRange('^1.2.3 || ~2.0.0')
T.eq('范围拆两组', rr.sets.length, 2)
T.eq('caret 组边界', rr.sets[0].bounds.min + '~' + rr.sets[0].bounds.max, '1.2.3~2.0.0')
T.eq('tilde 组边界', rr.sets[1].bounds.min + '~' + rr.sets[1].bounds.max, '2.0.0~2.1.0')
T.ok('合并解释文本含「或」', /或/.test(rr.text))
T.eq('连字符区间两个比较符', parseRange('1.2 - 2.3').sets[0].comparators.length, 2)
T.ok('通配解释可读', /放开/.test(parseRange('1.2.x').sets[0].comparators[1].why))
T.ok('star 的边界为空', parseRange('*').sets[0].bounds.min === '')
T.throws('非法范围', () => parseRange('^abc'))
T.throws('只有比较符', () => parseRange('>='))
T.throws('超长范围', () => parseRange('^1.0.0 '.repeat(60)))

/* ---------- 逐项解释 ---------- */
const ex = explainSatisfies('1.2.3-alpha', '^1.0.0')
T.eq('解释：预发布被挡', ex.ok, false)
T.ok('解释：reason 点出预发布规则', /预发布/.test(ex.reason))
T.ok('解释：blockedPre 标记', ex.blockedPre === true)
const ex2 = explainSatisfies('1.2.3', '^1.0.0')
T.eq('解释：命中', ex2.ok, true)
T.ok('解释：每个比较符都有 pass', ex2.groups[0].items.every((i) => typeof i.pass === 'boolean'))
T.ok('解释：给出区间表示', /\[|\(/.test(ex2.groups[0].bounds.span))

/* ---------- 页面数据 ---------- */
T.ok('内置样例都可解析', SEMVER_SAMPLES.every((x) => tryParse(x.version) && parseRange(x.range)))
T.eq('说明条目不少于 4', SEMVER_NOTES.length >= 4, true)

T.done()
