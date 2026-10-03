/**
 * extract.js 自查断言（直接测 src/utils/extract.js 本体）
 * ------------------------------------------------------------
 * 判据分五类：
 *   1) 外部裁判：抽出来的 IPv4 交给 node:net 的 isIPv4 复核；抽出来的网址交给
 *      WHATWG 的 new URL 复核；UUID 用 node:crypto 的 randomUUID 现场生成再回捞，
 *      生成器与正则互不认识，能对上才说明正则真的认标准 UUID。
 *   2) 已知向量：手写句子 + 手写期望（邮箱/手机/座机/日期/时间/金额/百分比/色值/话题）。
 *   3) 去重性质：同一命中出现两次，dedupe 默认只留一条，关掉后两条都在。
 *   4) 边界与反例：空白串给空结果；越界 IP、非 1[3-9] 开头的 11 位数不该被当成 IP/手机。
 *   5) 界面契约：每个分组都带 key/name/note/items，items 是非空字符串；
 *      total 等于各组条数之和。
 */
import net from 'node:net'
import crypto from 'node:crypto'
import { useUtils, makeTest } from './harness.mjs'

const M = await useUtils('extract')
const T = makeTest('extract')

/* ---------- 0. 模式表 ---------- */
{
  T.eq('模式数量', M.PATTERNS.length, 16)
  T.eq('模式顺序', M.PATTERNS.map((p) => p.key), [
    'url', 'email', 'phone', 'tel', 'ipv4', 'idcard', 'uscc', 'bankcard',
    'date', 'time', 'money', 'percent', 'uuid', 'color', 'hashtag', 'mention',
  ])
  for (const p of M.PATTERNS) {
    T.ok(p.key + ' 有可读名字', typeof p.name === 'string' && p.name.length >= 2)
    T.ok(p.key + ' 有说明', p.note.length > 3)
    T.ok(p.key + ' 的 re 是正则', p.re instanceof RegExp)
    T.ok(p.key + ' 的 re 带 g 标志', p.re.flags.indexOf('g') >= 0)
  }
}

/* ---------- 1. 已知向量的逐项抽取 ---------- */
{
  const s =
    '联系邮箱：hi@example.com，备用 you.name+dev@mail.co.uk\n' +
    '手机 13800138000，座机 010-88886666 转 123\n' +
    '服务器 192.168.1.100，文档 https://docs.example.com/guide?page=2\n' +
    '订单号 f47ac10b-58cc-4372-a567-0e02b2c3d479，金额 ¥1,234.56，折扣 12.5%\n' +
    '签约日期 2026-09-20，时间 15:30:00，主题色 #3F7A6E\n' +
    '#随身匣# 上线了 @小明 记得看'
  const r = M.extract(s)
  const g = (k) => (r.groups.find((x) => x.key === k) || { items: [] }).items
  T.eq('邮箱两条', g('email'), ['hi@example.com', 'you.name+dev@mail.co.uk'])
  T.eq('手机', g('phone'), ['13800138000'])
  T.eq('座机', g('tel'), ['010-88886666'])
  T.eq('IPv4', g('ipv4'), ['192.168.1.100'])
  T.eq('网址', g('url'), ['https://docs.example.com/guide?page=2'])
  T.eq('日期', g('date'), ['2026-09-20'])
  T.eq('时间', g('time'), ['15:30:00'])
  T.eq('金额', g('money'), ['¥1,234.56'])
  T.eq('百分比', g('percent'), ['12.5%'])
  T.eq('色值', g('color'), ['#3F7A6E'])
  T.eq('话题标签', g('hashtag'), ['#随身匣#'])
  T.eq('UUID', g('uuid'), ['f47ac10b-58cc-4372-a567-0e02b2c3d479'])
  T.ok('@小明 在提及里', g('mention').indexOf('@小明') >= 0)
  T.eq('total = 各组条数之和', r.total, r.groups.reduce((a, x) => a + x.items.length, 0))
}

/* ---------- 2. 外部裁判 ---------- */
{
  const ip = M.extract('内网 10.0.0.5 与外网 8.8.8.8', { keys: ['ipv4'] }).groups[0].items
  T.eq('两个 IP 都抽到', ip.length, 2)
  T.ok('每个结果都通过 node:net.isIPv4', ip.every((x) => net.isIPv4(x)))

  const u = M.extract('看 https://a.example.com/p?q=1#f 和 www.b.com/x', { keys: ['url'] }).groups[0].items
  T.ok('网址条数', u.length >= 2)
  for (const x of u) {
    const parsed = new URL(x.indexOf('http') === 0 ? x : 'https://' + x)
    T.ok('new URL 能解析：' + x, typeof parsed.hostname === 'string' && parsed.hostname.length > 0)
  }

  const id = crypto.randomUUID()
  const got = M.extract('追踪号 ' + id + ' 结束', { keys: ['uuid'] }).groups[0].items
  T.eq('crypto.randomUUID 现场生成能被回捞', got, [id])
  T.ok('回捞的 UUID 与生成器完全一致', got[0] === id)
}

/* ---------- 3. 日期三种写法 ---------- */
{
  T.eq('横杠日期', M.extract('2026-09-20', { keys: ['date'] }).groups[0].items, ['2026-09-20'])
  T.eq('斜杠日期', M.extract('2026/9/20', { keys: ['date'] }).groups[0].items, ['2026/9/20'])
  T.eq('中文日期', M.extract('2026年9月20日', { keys: ['date'] }).groups[0].items, ['2026年9月20日'])
}

/* ---------- 4. 去重与 keys 过滤 ---------- */
{
  T.eq('默认去重', M.extract('a@b.com a@b.com', { keys: ['email'] }).groups[0].items.length, 1)
  T.eq('关掉去重两条都在', M.extract('a@b.com a@b.com', { keys: ['email'], dedupe: false }).groups[0].items.length, 2)
  const onlyEmail = M.extract('a@b.com 13800138000', { keys: ['email'] })
  T.eq('keys 只留邮箱一组', onlyEmail.groups.length, 1)
  T.eq('keys 过滤后组名', onlyEmail.groups[0].key, 'email')
  T.eq('keys 过滤后 total', onlyEmail.total, 1)
}

/* ---------- 5. 边界与反例 ---------- */
{
  T.eq('空白串给空结果', JSON.stringify(M.extract('   ')), JSON.stringify({ groups: [], total: 0 }))
  T.eq('空串给空结果', M.extract('').total, 0)
  T.eq('null 不炸', M.extract(null).total, 0)
  T.eq('普通中文没有可抽项', M.extract('普通中文没有信息').total, 0)
  T.eq('越界 IP 不抽', M.extract('999.1.1.1', { keys: ['ipv4'] }).groups.length, 0)
  T.ok('node:net 也认为 999.1.1.1 不是 IP', net.isIPv4('999.1.1.1') === false)
  T.eq('非 1[3-9] 的 11 位数不算手机', M.extract('12800138000', { keys: ['phone'] }).groups.length, 0)
  T.eq('12 位数字不算手机', M.extract('138001380001', { keys: ['phone'] }).groups.length, 0)
  T.eq('话题在干净输入里正常抽', M.extract('#随身匣#', { keys: ['hashtag'] }).groups[0].items, ['#随身匣#'])
  T.eq('提及在干净输入里正常抽', M.extract('@小明 你好 @dev_1', { keys: ['mention'] }).groups[0].items, ['@小明', '@dev_1'])
}

/* ---------- 5b. mention 左边界（本轮修的 bug） ---------- */
{
  // 原正则 /@[A-Za-z0-9_\u4e00-\u9fff-]{1,30}/ 没有左边界：任何夹在中间的 @
  // 都会被当成提及捞出并截断——报告里的例子 extract('hi@example.com',{keys:['mention']})
  // 得 ['@example']。修法是 @ 前面是邮件字符（\w . @ % + -）就当「本地@域名」拦掉；
  // 中文、空格、标点都允许当边界（「感谢@小明。」在中文里极常见）。
  // 为兼容老 WebView 不用后行断言：非捕获边界 + 捕获组，extract 取 m[1]。
  const g = (s) => {
    const r = M.extract(s, { keys: ['mention'] })
    return r.groups.length ? r.groups[0].items : []
  }
  // 邮箱里的 @ 一律不算提及（报告的确切症状）
  T.eq('纯邮箱不产提及', g('hi@example.com'), [])
  T.eq('多个邮箱都不产提及', g('a@b.com 和 c@d.org'), [])
  // 邮箱 + 真提及：只留独立成词的那个
  T.eq('邮箱混提及只捞提及', g('联系 hi@example.com 或 @小明'), ['@小明'])
  // 行首、空格后——真正的提及
  T.eq('行首提及', g('@alice hi'), ['@alice'])
  T.eq('空格后提及', g('hi @bob'), ['@bob'])
  // 中文紧邻是真提及（「感谢@小明。」中文里 @ 紧贴汉字极常见），
  // CJK 不算邮件字符、不拦左边界；标点同理
  T.eq('汉字紧邻提及', g('感谢@小明。'), ['@小明'])
  T.eq('标点后提及', g('(@group) 加入'), ['@group'])
  T.eq('相邻提及逐个都捞', g('@A @B @C'), ['@A', '@B', '@C'])
  // @@ 里第二个 @ 紧跟第一个 @，边界不成立，不产出畸形提及
  T.eq('@@ 不产出畸形提及', g('user@@double'), [])
  // 干净的正向：下划线/连字符/中文/数字用户名照常
  T.eq('提及用户名支持数字下划线连字符中文', g('@dev_1 @a-b @中文 @123'), ['@dev_1', '@a-b', '@中文', '@123'])
  // 既有正向口径不许被改坏（来自第 1、5 节）
  T.eq('样例里的 @小明 仍在提及里', g('#随身匣# 上线了 @小明 记得看'), ['@小明'])
  T.eq('两干净提及仍都抽到', g('@小明 你好 @dev_1'), ['@小明', '@dev_1'])
  // 机制本身也要钉住：带捕获组的模式上报 m[1] 而不是带边界的 m[0]，
  // 且 mention 是全表唯一一个带捕获组的模式（其余 15 个模式零影响）
  const caps = (src) => (src.replace(/\(\?[:=!]/g, '~').match(/\(/g) || []).length
  T.ok('上报的都是以 @ 开头的净命中', g('邮箱 hi@x.io 找@kate 谈').every((v) => v[0] === '@'))
  T.eq('mention 是全表唯一带捕获组的模式', M.PATTERNS.filter((p) => caps(p.re.source) > 0).map((p) => p.key), ['mention'])
}

/* ---------- 6. toPlain 与界面契约 ---------- */
{
  T.eq('toPlain 一行一条', M.toPlain({ items: ['a', 'b', 'c'] }), 'a\nb\nc')
  T.eq('toPlain 空组给空串', M.toPlain({ items: [] }), '')
  T.eq('toPlain 脏入参不炸', M.toPlain({}), '')
  const r = M.extract('hi@example.com 13800138000', {})
  for (const grp of r.groups) {
    T.ok(grp.key + ' 有 key', typeof grp.key === 'string' && grp.key.length > 0)
    T.ok(grp.key + ' 有可读名字', typeof grp.name === 'string' && grp.name.length >= 2)
    T.ok(grp.key + ' 有说明', grp.note.length > 3)
    T.ok(grp.key + ' items 全是非空串', grp.items.every((x) => typeof x === 'string' && x.trim() !== ''))
  }
  T.ok('结果里不出现 undefined', JSON.stringify(r).indexOf('undefined') < 0)
  T.ok('示例文本能抽到多组', M.extract(M.EXTRACT_SAMPLE).groups.length >= 8)
}

T.done()
