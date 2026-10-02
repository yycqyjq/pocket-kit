/**
 * json2ts.js 自查断言（直接测 src/utils/json2ts.js 本体）
 * ------------------------------------------------------------
 * 判据分四类：
 *   1) 外部裁判：生成结果里每个字段的类型都能从原始 JSON 值独立推出来——用
 *      typeof / === null 核对 number/string/boolean/null，不抄实现的 typeOf；
 *      可选字段用「两个样本键集求差」独立验证，不抄实现的 counts 表；
 *   2) 结构契约：花括号配平、字段行形如 `key: type;`、非标识符键必须加引号并附
 *      原字段名注释；
 *   3) 已知向量：TS_SAMPLE 应产出 Root/Data/ListItem/Owner 四个接口，且 list 元素
 *      的 tags/owner/deleted/extra 类型与样本结构吻合；
 *   4) UI 契约：印到界面的文本不许出现 undefined / NaN / [object Object]。
 */
import { useUtils, makeTest } from './harness.mjs'

const J = await useUtils('json2ts')
const T = makeTest('json2ts')

/* ---------- 1. 简单对象与选项 ---------- */
const t1 = J.jsonToTs({ a: 1 })
T.eq('根名', t1.root, 'Root')
T.eq('一个接口', t1.interfaces, 1)
T.ok('含 Root 接口声明', t1.text.indexOf('export interface Root {') > -1)
T.ok('number 字段', t1.text.indexOf('a: number;') > -1)
T.eq('semicolon=false', J.jsonToTs({ a: 1 }, { semicolon: false }).text.indexOf('a: number\n') > -1, true)
T.ok('缩进可调', J.jsonToTs({ a: 1 }, { indent: 4 }).text.indexOf('    a: number;') > -1)
T.ok('rootName 可改', J.jsonToTs({ a: 1 }, { rootName: 'Config' }).text.indexOf('export interface Config {') > -1)

/* ---------- 2. 标量类型（外部裁判：typeof / null） ---------- */
const scalars = { s: 'x', n: 1, b: true, z: null }
const t2 = J.jsonToTs(scalars)
for (const [k, v] of Object.entries(scalars)) {
  const want = v === null ? 'null' : typeof v
  T.ok('字段 ' + k + ' 类型为 ' + want, t2.text.indexOf(k + ': ' + want + ';') > -1)
}

/* ---------- 3. 数组 ---------- */
T.eq('空数组默认 any[]', J.jsonToTs({ a: [] }).text.indexOf('a: any[];') > -1, true)
T.eq('空数组可用 unknown[]', J.jsonToTs({ a: [] }, { useArrayGeneric: true }).text.indexOf('a: unknown[];') > -1, true)
T.eq('同质数组', J.jsonToTs({ a: [1, 2] }).text.indexOf('a: number[];') > -1, true)
T.eq('混合数组加括号联合', J.jsonToTs({ a: [1, 'x'] }).text.indexOf('a: (number | string)[];') > -1, true)
T.eq('根数组', J.jsonToTs([1, 2]).root, 'type Root = number[]')
T.eq('根混合数组', J.jsonToTs([1, 'a']).root, 'type Root = (number | string)[]')

/* ---------- 4. 对象数组 → 子接口 + 可选字段（独立求差） ---------- */
const samples = [{ id: 1 }, { id: 2, name: 'x' }]
const t3 = J.jsonToTs({ list: samples })
T.ok('生成 ListItem 接口', t3.text.indexOf('export interface ListItem {') > -1)
T.ok('list 指向 ListItem[]', t3.text.indexOf('list: ListItem[];') > -1)
const keys = new Set(samples.flatMap((o) => Object.keys(o)))
const missing = [...keys].filter((k) => samples.some((o) => !(k in o)))
T.eq('可选字段集合', missing.join(','), 'name')
T.ok('name 标可选', t3.text.indexOf('name?: string;') > -1)
T.ok('id 必填', t3.text.indexOf('id: number;') > -1)

/* ---------- 5. 非标识符键 ---------- */
T.ok('加引号', J.jsonToTs({ 'a-b': 1 }).text.indexOf('"a-b": number;') > -1)
T.ok('附原字段名注释', J.jsonToTs({ 'a-b': 1 }).text.indexOf('原字段名：a-b') > -1)
T.ok('$ 与 _ 是合法键', J.jsonToTs({ $x: 1, _y: 2 }).text.indexOf('$x: number;') > -1)
T.ok('驼峰键不加引号', J.jsonToTs({ userName: 1 }).text.indexOf('userName: number;') > -1)

/* ---------- 6. 命名（PascalCase 从键名推） ---------- */
T.ok('下划线转 Pascal', J.jsonToTs({ user_name: { x: 1 } }).text.indexOf('export interface UserName {') > -1)
T.ok('驼峰转 Pascal', J.jsonToTs({ userInfo: { x: 1 } }).text.indexOf('export interface UserInfo {') > -1)
T.eq('嵌套对象生成两个接口', J.jsonToTs({ a: { b: 1 } }).interfaces, 2)

/* ---------- 7. TS_SAMPLE：已知向量 ---------- */
const raw = JSON.parse(J.TS_SAMPLE)
const ts = J.jsonToTs(raw)
T.eq('接口数', ts.interfaces, 4)
T.ok('Root 接口', ts.text.indexOf('export interface Root {') > -1)
T.ok('Data 接口', ts.text.indexOf('export interface Data {') > -1)
T.ok('ListItem 接口', ts.text.indexOf('export interface ListItem {') > -1)
T.ok('Owner 接口', ts.text.indexOf('export interface Owner {') > -1)
T.ok('code 类型与原始值一致', ts.text.indexOf('code: ' + typeof raw.code + ';') > -1)
T.ok('message 类型与原始值一致', ts.text.indexOf('message: ' + typeof raw.message + ';') > -1)
T.ok('data 指向 Data', ts.text.indexOf('data: Data;') > -1)
T.ok('total 类型与原始值一致', ts.text.indexOf('total: ' + typeof raw.data.total + ';') > -1)
T.ok('tags 是 string[]', ts.text.indexOf('tags: string[];') > -1)
T.ok('deleted 可空', ts.text.indexOf('deleted?: null;') > -1)
T.ok('extra 只在第二个样本里所以可选', ts.text.indexOf('extra?: boolean;') > -1)

/* ---------- 8. UI 契约与结构 ---------- */
T.ok('无 undefined 字样', ts.text.indexOf('undefined') === -1)
T.ok('无 NaN 字样', ts.text.indexOf('NaN') === -1)
T.ok('无 [object Object]', ts.text.indexOf('[object Object]') === -1)
T.eq('花括号配平', (ts.text.match(/\{/g) || []).length, (ts.text.match(/\}/g) || []).length)
T.ok('字段行形如 key: type', ts.text.split('\n').filter((l) => l.trim() && !/^(\/\/|export|\})/.test(l.trim())).every((l) => /^\s+.+: .+;$/.test(l)))
T.ok('TS_SAMPLE 本身是合法 JSON', (() => { try { JSON.parse(J.TS_SAMPLE); return true } catch (e) { return false } })())

/* ---------- 9. 边界 ---------- */
T.eq('根标量', J.jsonToTs('x').root, 'type Root = string')
T.eq('根数组套对象', J.jsonToTs([{ a: 1 }]).root, 'type Root = RootItem[]')
T.ok('根数组对象生成接口', J.jsonToTs([{ a: 1 }]).text.indexOf('export interface RootItem {') > -1)
T.eq('二维数组', J.jsonToTs({ m: [[1, 2], [3]] }).text.indexOf('m: number[][];') > -1, true)
T.eq('空对象也能出接口', J.jsonToTs({}).interfaces, 1)
T.eq('返回 text 是字符串', typeof J.jsonToTs({}).text, 'string')

T.done()
