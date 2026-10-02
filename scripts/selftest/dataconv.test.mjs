/**
 * dataconv.js 自查断言（直接测 src/utils/dataconv.js 本体）
 * ------------------------------------------------------------
 * 判据分四类：
 *   1) 外部裁判：JSON 一律用 Node 的 JSON.parse 反解比对；CSV 的引号包裹与 "" 转义
 *      按 RFC 4180 的口径验；XML 按「属性→@name、文本→#text、同名子节点→数组」的
 *      既定映射验；
 *   2) 往返性质：JSON→YAML→JSON、JSON→TOML→JSON 必须回到同一个值（JSON.parse 后
 *      整体深比），含 #、-1、空串、0.0.0.0 这类要加引号的边界串；
 *   3) 已知向量：六种格式各带一份 SAMPLES，逐份 parse 成 JSON 再核对结构；
 *   4) 边界与反例：空输入、未知格式、XML 多根/标签不匹配、YAML 锚点与块标量、
 *      TOML 顶层数组自动包 items。
 */
import { useUtils, makeTest } from './harness.mjs'

const D = await useUtils('dataconv')
const T = makeTest('dataconv')

const parse = (k) => JSON.parse(D.convert(D.SAMPLES[k], k, 'json').text)
const fromText = (text, from) => JSON.parse(D.convert(text, from, 'json').text)

/* ---------- 1. 导出面 ---------- */
T.eq('格式表 6 项', D.FORMATS.length, 6)
T.eq('格式 key', D.FORMATS.map((f) => f.key).join(','), 'json,csv,md,xml,yaml,toml')
T.eq('formatName 已知', D.formatName('json'), 'JSON')
T.eq('formatName 未知原样', D.formatName('nope'), 'nope')
T.eq('FORMAT_NOTES 覆盖六种', Object.keys(D.FORMAT_NOTES).length, 6)
T.eq('SAMPLES 覆盖六种', Object.keys(D.SAMPLES).length, 6)

/* ---------- 2. 每份样例都能 parse 成 JSON（JSON.parse 当裁判） ---------- */
T.eq('csv 样例行数', parse('csv').length, 3)
T.eq('csv 数字还原', parse('csv')[0].age, 28)
T.eq('md 样例行数', parse('md').length, 2)
T.eq('md 数字还原', parse('md')[0].数量, 2)
T.eq('xml 根', Object.keys(parse('xml'))[0], 'book')
T.eq('xml 属性映射 @name', parse('xml').book['@id'], '1')
T.eq('xml 同名子节点成数组', parse('xml').book.tags.tag.join(','), '玄幻,修炼')
T.eq('yaml 嵌套对象', parse('yaml').server.port, 8080)
T.eq('yaml 布尔', parse('yaml').server.tls, true)
T.eq('yaml 列表长度', parse('yaml').users.length, 2)
T.eq('toml 表', parse('toml').server.host, '0.0.0.0')
T.eq('toml 数组表', parse('toml').users[1].name, 'bob')
T.eq('json 样例', parse('json').offline, true)

/* ---------- 3. CSV（RFC 4180 口径） ---------- */
T.eq('引号内逗号不分列', fromText('a,b\n"x,y",z', 'csv')[0].a, 'x,y')
T.eq('双引号转义', fromText('a\n"he said ""hi"""', 'csv')[0].a, 'he said "hi"')
T.eq('制表符分隔', fromText('a\tb\n1\t2', 'csv')[0].b, 2)
T.eq('分号分隔', fromText('a;b\n1;2', 'csv')[0].b, 2)
T.eq('布尔还原', fromText('a\ntrue', 'csv')[0].a, true)
T.eq('null 还原', fromText('a\nnull', 'csv')[0].a, null)
T.eq('空单元格为空串', fromText('a,b\n1,', 'csv')[0].b, '')
T.eq('对象转 CSV', D.convert('[{"a":1,"b":"x"}]', 'json', 'csv').text, 'a,b\n1,x')
T.eq('含逗号单元格加引号', D.convert('[{"a":"x,y"}]', 'json', 'csv').text, 'a\n"x,y"')
T.eq('数组套数组', D.convert('[[1,2],[3,4]]', 'json', 'csv').text, '1,2\n3,4')

/* ---------- 4. Markdown 表格 ---------- */
T.eq('md 分隔行被忽略', parse('md').length, 2)
T.eq('md 类型还原', parse('md')[1].单价, 1299)
T.eq('JSON 转 md', D.convert('[{"a":1}]', 'json', 'md').text, '| a |\n| --- |\n| 1 |')
T.eq('md 竖线转义', D.convert('[{"a":"x|y"}]', 'json', 'md').text, '| a |\n| --- |\n| x\\|y |')
T.eq('标量数组转 md', D.convert('[1,2,3]', 'json', 'md').text, '| 值 |\n| --- |\n| 1 |\n| 2 |\n| 3 |')

/* ---------- 5. XML（既定映射） ---------- */
T.eq('文本单值折叠', fromText('<a>hi</a>', 'xml').a, 'hi')
T.eq('属性 @name', fromText('<a x="1"/>', 'xml').a['@x'], '1')
T.eq('子节点文本', fromText('<a><b>t</b></a>', 'xml').a.b, 't')
const xmlMulti = D.convert('{"a":"x","b":"y"}', 'json', 'xml').text
T.ok('多顶层键包 root', xmlMulti.indexOf('<root>') > -1 && xmlMulti.indexOf('</root>') > -1)
T.eq('多顶层键反解在 root 下', fromText(xmlMulti, 'xml').root.b, 'y')
T.eq('单顶层键不包 root', D.convert('{"a":{"b":"1"}}', 'json', 'xml').text.indexOf('<root>'), -1)
T.eq('样例 xml→xml→json 结构不变', JSON.stringify(fromText(D.convert(D.SAMPLES.xml, 'xml', 'xml').text, 'xml')), JSON.stringify(parse('xml')))
T.ok('XML 转义 & <', D.convert('{"a":"x&y<z"}', 'json', 'xml').text.indexOf('x&amp;y&lt;z') > -1)
T.throws('XML 多根报错', () => D.convert('<a></a><b></b>', 'xml', 'json'), /只能有一个根节点/)
T.throws('XML 标签不匹配', () => D.convert('<a><b></a>', 'xml', 'json'), /不匹配/)
T.throws('XML 未闭合', () => D.convert('<a>', 'xml', 'json'), /没有闭合/)

/* ---------- 6. YAML（子集） ---------- */
const y2j = (t) => fromText(t, 'yaml')
T.eq('嵌套对象', y2j('a:\n  b: 1').a.b, 1)
T.eq('布尔大小写', y2j('a: TRUE\nb: False').b, false)
T.eq('null 三种写法', JSON.stringify(y2j('a: ~\nb: null\nc: NULL')), '{"a":null,"b":null,"c":null}')
T.eq('双引号转义', y2j('a: "x\\ny"').a, 'x\ny')
T.eq('单引号转义', y2j("a: 'it''s'").a, "it's")
T.eq('行内数组', y2j('a: [1, 2, 3]').a, [1, 2, 3])
T.eq('行内对象', y2j('a: {x: 1, y: 2}').a.y, 2)
T.eq('注释被剥掉', y2j('a: 1 # 注释').a, 1)
T.eq('URL 里的冒号不当分隔', y2j('a: http://x.com/y').a, 'http://x.com/y')
T.eq('列表项对象', y2j('u:\n  - n: 1\n    m: 2').u[0].m, 2)
T.eq('嵌套列表', y2j('a:\n  - 1\n  - 2').a, [1, 2])
T.throws('锚点拒绝', () => D.convert('a: &x 1', 'yaml', 'json'), /锚点/)
T.throws('块标量拒绝', () => D.convert('a: |\n  x', 'yaml', 'json'), /块标量/)

/* ---------- 7. TOML（子集） ---------- */
const t2j = (t) => fromText(t, 'toml')
T.eq('TOML 表', t2j('[s]\nhost = "x"\nport = 1').s.port, 1)
T.eq('TOML 字符串', t2j('[s]\nhost = "x"').s.host, 'x')
T.eq('TOML 布尔', t2j('a = true').a, true)
T.eq('TOML 数组', t2j('a = [1, 2, 3]').a, [1, 2, 3])
T.eq('TOML 嵌套表', t2j('[a.b]\nc = 1').a.b.c, 1)
T.eq('TOML 数组表', t2j('[[u]]\nn = 1\n[[u]]\nn = 2').u.length, 2)
T.eq('TOML 顶层数组包 items', D.convert('[1,2]', 'json', 'toml').text, 'items = [1, 2]')
T.ok('TOML 顶层数组带说明', D.convert('[1,2]', 'json', 'toml').note.indexOf('items') > -1)
T.throws('TOML 非法行', () => D.convert('x', 'toml', 'json'), /key = value/)

/* ---------- 8. 往返闭合 ---------- */
const j2j = (v, via) => fromText(D.convert(JSON.stringify(v), 'json', via).text, via)
const sample = JSON.parse(D.SAMPLES.json)
T.eq('JSON→YAML→JSON', JSON.stringify(j2j(sample, 'yaml')), JSON.stringify(sample))
T.eq('JSON→TOML→JSON', JSON.stringify(j2j(sample, 'toml')), JSON.stringify(sample))
const tricky = { a: '#x', b: '-1', c: '', d: 'true', e: '0.0.0.0' }
T.eq('YAML 边界串往返', JSON.stringify(j2j(tricky, 'yaml')), JSON.stringify(tricky))
T.eq('TOML 引号串往返', JSON.stringify(j2j({ a: 'x"y', b: 'line' }, 'toml')), JSON.stringify({ a: 'x"y', b: 'line' }))

/* ---------- 9. 边界与错误 ---------- */
T.throws('空输入', () => D.convert('', 'json', 'yaml'), /请先粘贴/)
T.throws('空白输入', () => D.convert('   ', 'json', 'yaml'), /请先粘贴/)
T.throws('未知源格式', () => D.convert('{}', 'bogus', 'json'), /不支持的源格式/)
T.throws('未知目标格式', () => D.convert('{}', 'json', 'bogus'), /不支持的目标格式/)
T.throws('JSON 语法错误', () => D.convert('{bad', 'json', 'yaml'), /JSON/)
T.eq('同格式不转换', D.convert('{"a":1}', 'json', 'json').note.indexOf('未做转换') > -1, true)
T.eq('同格式原样返回', D.convert('{"a":1}', 'json', 'json').text, '{"a":1}')

/* ---------- 10. UI 契约：印出去的文本不能带脏字 ---------- */
const outs = []
for (const k of Object.keys(D.SAMPLES)) {
  for (const to of ['json', 'csv', 'md', 'xml', 'yaml', 'toml']) {
    if (k === to) continue
    try { outs.push(D.convert(D.SAMPLES[k], k, to).text) } catch (e) { /* 已知的格式限制（如 XML 多根） */ }
  }
}
T.ok('没有 undefined 字样', outs.every((t) => t.indexOf('undefined') === -1))
T.ok('没有 NaN 字样', outs.every((t) => t.indexOf('NaN') === -1))
T.ok('没有 [object Object]', outs.every((t) => t.indexOf('[object Object]') === -1))

T.done()
