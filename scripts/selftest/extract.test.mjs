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
