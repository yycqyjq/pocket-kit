/**
 * cleanescape.js 自查断言（直接测 src/utils/cleanescape.js 本体）
 * ------------------------------------------------------------
 * 判据分五类：
 *   1) 已知向量：ANSI 颜色码（CSI 与 OSC 两种）、零宽字符（U+200B..U+200F、BOM、软连字符）、
 *      控制字符（除 \t\n 外）、伪空格（U+00A0 / U+3000 / U+2009）都有标准码点，逐个验。
 *   2) 开关口径：八个开关默认值按 OPTIONS 表；关掉 crlf 时 \r 保留、打开才归一。
 *   3) 幂等性质：清洗过的文本再洗一次不变（不会越洗越少）。
 *   4) 边界与反例：空串、纯空白、只有制表符与换行时不许被误删。
 *   5) 跨模块同口径 + 界面契约：U+3000 既被本模块转成半角空格，
 *      也被 normalize 的 NFKC 转成半角空格，两边结论必须一致；
 *      report 每项带中文名与次数，before/after 与文本长度对得上。
 */
import { useUtils, makeTest } from './harness.mjs'

const C = await useUtils('cleanescape')
const N = await useUtils('normalize')
const T = makeTest('cleanescape')

/* ---------- 0. 选项表 ---------- */
{
  T.eq('八个开关', C.OPTIONS.length, 8)
  T.eq('开关顺序', C.OPTIONS.map((o) => o.key), [
    'ansi', 'invisible', 'control', 'fakeSpace', 'crlf', 'trimLine', 'collapseSpace', 'dropBlank',
  ])
  for (const o of C.OPTIONS) {
    T.ok(o.key + ' 有中文名', /[\u4e00-\u9fff]/.test(o.name))
    T.ok(o.key + ' 有说明', o.desc.length > 5)
    T.ok(o.key + ' 有布尔默认值', typeof o.default === 'boolean')
  }
  T.eq('crlf 默认关', C.OPTIONS.find((o) => o.key === 'crlf').default, false)
  T.eq('ansi 默认开', C.OPTIONS.find((o) => o.key === 'ansi').default, true)
}

/* ---------- 1. 各开关的已知向量 ---------- */
{
  T.eq('CSI 颜色码被删', C.clean('\u001b[31mred\u001b[0m').text, 'red')
  T.eq('组合参数颜色码被删', C.clean('\u001b[1;32mok\u001b[0m').text, 'ok')
  T.eq('OSC 标题序列被删', C.clean('\u001b]0;title\u0007x').text, 'x')
  T.eq('零宽空格被删', C.clean('a\u200bb').text, 'ab')
  T.eq('BOM 被删', C.clean('\ufeffx').text, 'x')
  T.eq('软连字符被删', C.clean('co\u00adde').text, 'code')
  T.eq('双向控制符被删', C.clean('a\u200eb').text, 'ab')
  T.eq('NUL 控制符被删', C.clean('a\u0000b').text, 'ab')
  T.eq('BEL 控制符被删', C.clean('a\u0007b').text, 'ab')
  T.eq('制表符与换行被保留', C.clean('a\tb\nc').text, 'a\tb\nc')
  T.eq('全角空格转半角', C.clean('a\u3000b').text, 'a b')
  T.eq('不换行空格转半角', C.clean('a\u00a0b').text, 'a b')
  T.eq('窄空格转半角', C.clean('a\u2009b').text, 'a b')
  T.eq('行尾空白被去掉', C.clean('a   \nb  ').text, 'a\nb')
}

/* ---------- 2. 开关口径 ---------- */
{
  T.eq('crlf 默认不归一', C.clean('a\r\nb').text, 'a\r\nb')
  T.eq('打开 crlf 后归一', C.clean('a\r\nb', { crlf: true }).text, 'a\nb')
  T.eq('老 Mac 的单独 CR 也归一', C.clean('a\rb', { crlf: true }).text, 'a\nb')
  T.eq('collapseSpace 默认不合并', C.clean('x   y', { trimLine: false }).text, 'x   y')
  T.eq('打开后多个空格合一', C.clean('x   y', { trimLine: false, collapseSpace: true }).text, 'x y')
  T.eq('dropBlank 默认保留空行', C.clean('a\n\nb').text, 'a\n\nb')
  T.eq('打开后删空行', C.clean('a\n\n\nb', { dropBlank: true }).text, 'a\nb')
  // 关掉 ansi 时，ESC 本身仍被 control 当控制字符删掉，只剩可读的序列骨架
  T.eq('关掉 ansi 后 ESC 仍被 control 删', C.clean('\u001b[31mred\u001b[0m', { ansi: false }).text, '[31mred[0m')
  T.eq('同时关掉 ansi 与 control 才原样', C.clean('\u001b[31mred\u001b[0m', { ansi: false, control: false }).text, '\u001b[31mred\u001b[0m')
  T.eq('关掉 invisible 就留着零宽', C.clean('a\u200bb', { invisible: false }).text, 'a\u200bb')
}

/* ---------- 3. 报告与长度 ---------- */
{
  const r = C.clean('a\u200bb')
  T.eq('报告点名零宽字符', r.report[0].name, '零宽 / 不可见字符')
  T.eq('报告计数为 1', r.report[0].count, 1)
  T.eq('before = 输入长度', r.before, 3)
  T.eq('after = 输出长度', r.after, r.text.length)
  T.eq('after = 2', r.after, 2)
  T.ok('干净文本报告为空', C.clean('abc').report.length === 0)
  T.ok('报告名都是中文', C.clean(C.CLEAN_SAMPLE).report.every((x) => /[\u4e00-\u9fff]/.test(x.name)))
  T.ok('报告次数都是正整数', C.clean(C.CLEAN_SAMPLE).report.every((x) => Number.isInteger(x.count) && x.count > 0))
}

/* ---------- 4. 幂等 + 边界 ---------- */
{
  const once = C.clean(C.CLEAN_SAMPLE).text
  T.eq('再洗一次不变（幂等）', C.clean(once).text, once)
  T.eq('空串不炸', C.clean('').text, '')
  T.eq('纯空白保留换行', C.clean('  \n\t ').text, '\n')
  T.eq('null 不炸', C.clean(null).text, 'null')
  T.ok('清洗结果不含 ANSI 起始符', C.clean(C.CLEAN_SAMPLE).text.indexOf('\u001b') < 0)
  T.ok('清洗结果不含零宽/BOM/软连字符', !/[\u200b-\u200f\ufeff\u00ad]/.test(C.clean(C.CLEAN_SAMPLE).text))
  T.ok('清洗结果不含全角/不换行空格', !/[\u00a0\u3000]/.test(C.clean(C.CLEAN_SAMPLE).text))
  T.ok('结果不含 undefined', C.clean(C.CLEAN_SAMPLE).text.indexOf('undefined') < 0)
}

/* ---------- 5. scan 体检 ---------- */
{
  const names = C.scan(C.CLEAN_SAMPLE).map((x) => x.name)
  T.ok('认出终端颜色码', names.indexOf('终端颜色码') >= 0)
  T.ok('认出零宽空格 / 连字', names.indexOf('零宽空格 / 连字') >= 0)
  T.ok('认出 BOM', names.indexOf('BOM 字节顺序标记') >= 0)
  T.ok('认出软连字符', names.indexOf('软连字符') >= 0)
  T.ok('认出不换行空格 / 全角空格', names.indexOf('不换行空格 / 全角空格') >= 0)
  T.ok('认出制表符', names.indexOf('制表符') >= 0)
  T.ok('认出 行尾空格', names.indexOf('行尾空格') >= 0)
  T.eq('干净文本体检为空', C.scan('abc'), [])
  T.eq('空串体检为空', C.scan(''), [])
  for (const x of C.scan(C.CLEAN_SAMPLE)) {
    T.ok('体检项 ' + x.name + ' 有说明', x.note.length > 3)
    T.ok('体检项 ' + x.name + ' 次数为正', x.count > 0)
  }
}

/* ---------- 6. 跨模块同口径：U+3000 / U+00A0 ---------- */
{
  const nfkc = (s) => N.compare(s).forms.filter((f) => f.key === 'NFKC')[0].text
  T.eq('全角空格：清洗成半角', C.clean('a\u3000b').text, 'a b')
  T.eq('全角空格：NFKC 也是半角', nfkc('a\u3000b'), 'a b')
  T.eq('不换行空格：两边都成半角', [C.clean('a\u00a0b').text, nfkc('a\u00a0b')], ['a b', 'a b'])
}

T.done()
