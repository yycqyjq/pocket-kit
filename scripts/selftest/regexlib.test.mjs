/**
 * regexlib.js 自查断言（直接测 src/utils/regexlib.js 本体）
 * ------------------------------------------------------------
 * 速查表里每条正则都会印给用户照抄，所以判据分四类：
 *   1) 外部裁判（JS 引擎本身）：用 new RegExp(item.pattern) 把全部 40 条
 *      都构造一遍，构造不出来就是死链；再用它给出的 sample 撞自己的 pattern，
 *      样例都匹配不上说明这张表在骗人。
 *   2) 独立正反例：对常用条目手写「该匹配 / 不该匹配」的字符串，来源是
 *      各条目的公开语义（RFC 791 的 IPv4 八位组、ISO 8601 的日期、
 *      E.164/大陆手机号段、UUID 的 8-4-4-4-12 形状等），不抄实现。
 *   3) runRegex / highlight 行为：全局与非全局、捕获组、非法正则、空模式、
 *      零宽匹配不死循环、高亮切片能拼回原文。
 *   4) UI 可见契约：结果里不许出现 undefined/NaN/[object Object]。
 */
import { useUtils, makeTest } from './harness.mjs'

const R = await useUtils('regexlib')
const T = makeTest('regexlib')

const byName = {}
for (const g of R.REGEX_LIB) for (const it of g.items) byName[it.name] = it.pattern

const reOf = (name) => new RegExp(byName[name])
const noJunk = (s) => !/undefined|NaN|\[object Object\]/.test(String(s))

/* ---------------- 0. 导出面与结构 ---------------- */
T.ok('导出 REGEX_LIB', Array.isArray(R.REGEX_LIB) && R.REGEX_LIB.length >= 5)
T.ok('导出 runRegex', typeof R.runRegex === 'function')
T.ok('导出 highlight', typeof R.highlight === 'function')
T.ok('分组都有名字与条目', R.REGEX_LIB.every((g) => typeof g.group === 'string' && g.group && Array.isArray(g.items) && g.items.length > 0))
T.ok('条目都有 name/pattern/sample', R.REGEX_LIB.every((g) => g.items.every((i) => i.name && typeof i.pattern === 'string' && typeof i.sample === 'string')))

/* ---------------- 1. 外部裁判：全部条目可构造 + 样例自洽 ---------------- */
let allCompile = true
let allSample = true
for (const g of R.REGEX_LIB) {
  for (const it of g.items) {
    let re
    try {
      re = new RegExp(it.pattern)
    } catch (e) {
      allCompile = false
      continue
    }
    if (!re.test(it.sample)) allSample = false
  }
}
T.ok('40 条 pattern 全部能 new RegExp', allCompile)
T.ok('每条 sample 都能命中自己的 pattern', allSample)
T.eq('pattern 不重复', new Set(R.REGEX_LIB.flatMap((g) => g.items.map((i) => i.pattern))).size, 40)
T.eq('name 不重复', new Set(R.REGEX_LIB.flatMap((g) => g.items.map((i) => i.name))).size, 40)

/* ---------------- 2. 独立正反例（外部语义） ---------------- */
const CASES = [
  ['整数', ['0', '42', '-7'], ['4.2', '', '-', ' 1']],
  ['正整数', ['1', '42', '999'], ['0', '-1', '01']],
  ['小数', ['3.14', '-0.5', '7'], ['.5', '3.', '1.2.3']],
  ['千分位金额', ['1,234,567.89', '12', '-1,000'], ['1234', '1,23', '1,2345']],
  ['百分比', ['85.5%', '100%', '-3%'], ['85%5', '%', 'abc%']],
  ['科学计数法', ['1.2e-3', '5E10', '-1e+2'], ['1.2e', 'e3', '1.2.3e4']],
  ['中文字符', ['中', 'a中b'], ['abc', '123', '，']],
  ['双字节字符（含中文标点）', ['，', '中'], ['abc', '123']],
  ['英文单词', ['hello', 'foo bar'], ['123', '中文']],
  ['空白行', ['   ', ''], ['x', '  x  ']],
  ['连续重复字符', ['aaa', '!!!!'], ['aa', 'abc']],
  ['HTML 标签', ['<div class="x">', '</p>', '<br>'], ['< div>', '<1>', 'div']],
  ['手机号（中国大陆）', ['13800138000', '19912345678'], ['12800138000', '1380013800', '138001380001']],
  ['身份证（18 位）', ['110101199003077213', '11010119900307721X'], ['11010119900307721', '1101011990030772133', '11010119900307721Y']],
  ['护照（简）', ['E12345678'], ['E1234567', '1E2345678']],
  ['微信号', ['wxid_abc123', 'abcde1'], ['1abcde', 'abcd']],
  ['邮政编码（中国）', ['100000'], ['012345', '12345']],
  ['IPv4', ['192.168.1.1', '255.255.255.255', '0.0.0.0'], ['256.1.1.1', '1.1.1', '1.1.1.1.1', '01.1.1.1']],
  ['端口号', ['1', '80', '8080', '65535'], ['0', '65536', '99999']],
  ['域名', ['example.com', 'a.b.co'], ['-bad.com', 'example', 'a..b']],
  ['URL', ['http://example.com', 'https://x/a?b=1'], ['ftp://x', 'example.com', 'http://a b']],
  ['MAC 地址', ['A0:B1:C2:D3:E4:F5', 'aa-bb-cc-dd-ee-ff'], ['A0B1C2D3E4F5', 'A0:B1:C2:D3:E4']],
  ['Hex 颜色值', ['#fff', '#3F7A6E'], ['#ffff', '#gg0000', '3F7A6E']],
  ['UUID', ['550e8400-e29b-41d4-a716-446655440000'], ['550e8400e29b41d4a716446655440000', '550e8400-e29b-41d4-a716-44665544000']],
  ['YYYY-MM-DD', ['2026-09-20', '2026-01-31'], ['2026-13-01', '2026-00-10', '2026-9-20']],
  ['HH:mm:ss', ['15:53:00', '00:00', '23:59:59'], ['24:00', '15:60', '15:5']],
  ['10 位时间戳', ['1789000000'], ['178900000', '17890000000']],
  ['中文日期', ['2026年9月20日', '2026年09月20日'], ['2026-09-20', '2026年9月']],
  ['变量名（驼峰/下划线）', ['userName_1', '_x', '$y'], ['1abc', 'a b', 'a-b']],
  ['十六进制数', ['0xFF00', 'FF00', '123'], ['0x', 'GG']],
  ['Base64', ['aGVsbG8=', 'YWJj'], ['a-b', 'a b']],
  ['强密码（≥8 位含大小写数字）', ['Abcd1234', 'aA1aaaaa'], ['abcd1234', 'ABCD1234', 'Ab1']],
  ['行注释（// 或 #）', ['// note', '# note', '  // x'], ['/* x */', 'x // y']],
  ['语义化版本号', ['1.2.3', '1.2.3-beta.1'], ['1.2', '1.2.3.4', 'v1.2.3']],
]
for (const [name, yes, no] of CASES) {
  const re = reOf(name)
  T.ok(name + ' 该匹配', yes.every((s) => re.test(s)), '正例没命中：' + JSON.stringify(yes.filter((s) => !re.test(s))))
  T.ok(name + ' 不该匹配', no.every((s) => !re.test(s)), '反例误命中：' + JSON.stringify(no.filter((s) => re.test(s))))
}

/* ---------------- 3. runRegex 行为 ---------------- */
const g = R.runRegex('\\d+', 'g', 'a12b345')
T.ok('runRegex 命中', g.match === true)
T.eq('runRegex 命中两段', g.list.length, 2)
T.eq('runRegex 第一段文本', g.list[0].text, '12')
T.eq('runRegex 第一段下标', g.list[0].index, 1)
T.eq('runRegex 第二段下标', g.list[1].index, 4)
T.eq('runRegex 无 error', g.error, '')

const ng = R.runRegex('\\d+', 'i', 'a12b345')
T.eq('非全局只取第一处', ng.list.length, 1)
T.eq('非全局第一处下标', ng.list[0].index, 1)

const grp = R.runRegex('(a)(b)', 'g', 'ab')
T.eq('捕获组', JSON.stringify(grp.list[0].groups), JSON.stringify(['a', 'b']))

const bad = R.runRegex('(', 'g', 'abc')
T.eq('非法正则 match=false', bad.match, false)
T.ok('非法正则给出 error', bad.error.length > 0)
T.eq('非法正则 list 为空', bad.list.length, 0)

const noPat = R.runRegex('', 'g', 'abc')
T.eq('空模式 match=false', noPat.match, false)
T.eq('空模式不报错', noPat.error, '')
T.eq('空文本无匹配', R.runRegex('\\d+', 'g', '').match, false)
T.eq('无命中时 list 为空', R.runRegex('^x', 'g', 'abc').list.length, 0)

// 零宽匹配（a*）在 'bbb' 上会到处匹配空串，实现有 guard，必须不卡死
const zero = R.runRegex('a*', 'g', 'bbb')
T.ok('零宽匹配不死循环', zero.list.length < 100 && Array.isArray(zero.list))
T.ok('runRegex 结果无脏字', noJunk(JSON.stringify(g)) && noJunk(JSON.stringify(grp)))

/* ---------------- 4. highlight ---------------- */
const parts = R.highlight('a12b345', g.list)
T.eq('highlight 切片能拼回原文', parts.map((p) => p.text).join(''), 'a12b345')
T.eq('highlight 命中片段数', parts.filter((p) => p.hit).length, 2)
T.ok('highlight 命中标记正确', parts.filter((p) => p.hit).every((p) => /^\d+$/.test(p.text)))
T.ok('highlight 非命中标记正确', parts.filter((p) => !p.hit).every((p) => !/^\d+$/.test(p.text) || p.text === ''))
const emptyHl = R.highlight('abc', [])
T.eq('highlight 空列表整段非命中', emptyHl.length, 1)
T.eq('highlight 空列表拼回原文', emptyHl[0].text, 'abc')
T.eq('highlight 空列表 hit=false', emptyHl[0].hit, false)
// 乱序传入也要按位置切开
const unordered = R.highlight('a12b345', [g.list[1], g.list[0]])
T.eq('highlight 乱序也能拼回原文', unordered.map((p) => p.text).join(''), 'a12b345')
T.ok('highlight 结果无脏字', noJunk(JSON.stringify(parts)))

T.done()
