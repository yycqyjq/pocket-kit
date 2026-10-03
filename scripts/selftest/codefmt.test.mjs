/**
 * codefmt.js 自查断言（直接测 src/utils/codefmt.js 本体）
 * ------------------------------------------------------------
 * 这个模块只做 HTML / CSS 的排版与压缩，本身不做语法校验。判据分四类：
 *   1) 外部裁判（结构化对撞）：在测试里另写一份**独立的 HTML 切词器**与
 *      **独立的 CSS 规范 token 串**，把「原文」与「格式化后」都喂进去。
 *      排版只应改变空白与注释，所以两者的「标签序列 + 归一化文本」
 *      （HTML）、「去空白去注释的 token 串」（CSS）必须逐字节相同——
 *      这就把「输出能不能重新解析成同一棵树」变成可计算的等式，
 *      而不是把模块输出抄成期望值。
 *   2) 往返性质：格式化两次 == 一次（幂等）；压缩后再排版不改变结构。
 *   3) 边界与反例：空串、纯空白必须抛中文错；属性值里的 '>'、pre 内部空白
 *      属于会被误伤的敏感区，单独盯住。
 *   4) UI 可见契约：text/lines/size 三个字段不许是 undefined/NaN/[object Object]，
 *      正文里也不许出现 undefined / NaN 字样。
 */
import { useUtils, makeTest } from './harness.mjs'

const M = await useUtils('codefmt')
const T = makeTest('codefmt')

/* ---------------- 独立裁判 A：HTML 结构化切词 ---------------- */
// 只认「标签原样」与「非空白的归一化文本」，空白节点丢弃。
function htmlTokens(src) {
  const s = String(src)
  const out = []
  let i = 0
  while (i < s.length) {
    if (s[i] === '<') {
      if (s.slice(i, i + 4) === '<!--') {
        const j = s.indexOf('-->', i + 4)
        const end = j < 0 ? s.length : j + 3
        out.push('T:' + s.slice(i, end))
        i = end
        continue
      }
      let j = i + 1
      let q = null
      while (j < s.length) {
        const ch = s[j]
        if (q) {
          if (ch === q) q = null
        } else if (ch === '"' || ch === "'") q = ch
        else if (ch === '>') break
        j++
      }
      const end = j >= s.length ? s.length : j + 1
      out.push('T:' + s.slice(i, end))
      i = end
      continue
    }
    const j = s.indexOf('<', i)
    const end = j < 0 ? s.length : j
    const norm = s.slice(i, end).replace(/\s+/g, ' ').trim()
    if (norm) out.push('X:' + norm)
    i = end
  }
  return out
}

/* ---------------- 独立裁判 B：CSS 语义 token 串 ---------------- */
// 丢掉注释与空白，保留字符串原样；末尾分号在 } 前属合法压缩，比较前去掉。
function cssCanon(src) {
  const s = String(src)
  const toks = []
  let i = 0
  const PUNCT = '{};:,.>()[]'
  while (i < s.length) {
    const c = s[i]
    if (c === '/' && s[i + 1] === '*') {
      const j = s.indexOf('*/', i + 2)
      i = j < 0 ? s.length : j + 2
      continue
    }
    if (c === '/' && s[i + 1] === '/') {
      const j = s.indexOf('\n', i)
      i = j < 0 ? s.length : j
      continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < s.length) {
        if (s[j] === '\\') {
          j += 2
          continue
        }
        if (s[j] === c) {
          j++
          break
        }
        j++
      }
      toks.push(s.slice(i, j))
      i = j
      continue
    }
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (PUNCT.includes(c)) {
      toks.push(c)
      i++
      continue
    }
    let j = i
    while (j < s.length && !/[\s{};:,.>()[\]]/.test(s[j])) {
      if (s[j] === '/' && (s[j + 1] === '*' || s[j + 1] === '/')) break
      if (s[j] === '"' || s[j] === "'") break
      j++
    }
    if (j === i) {
      toks.push(c)
      i++
    } else {
      toks.push(s.slice(i, j))
      i = j
    }
  }
  const kept = []
  for (let k = 0; k < toks.length; k++) {
    if (toks[k] === ';' && toks[k + 1] === '}') continue
    kept.push(toks[k])
  }
  return kept.join('\u0001')
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const noJunk = (s) => !/undefined|NaN|\[object Object\]/.test(String(s))

/* ---------------- 0. 导出面 ---------------- */
T.ok('导出 formatHtml', typeof M.formatHtml === 'function')
T.ok('导出 formatCss', typeof M.formatCss === 'function')
T.ok('导出 HTML_SAMPLE', typeof M.HTML_SAMPLE === 'string' && M.HTML_SAMPLE.length > 40)
T.ok('导出 CSS_SAMPLE', typeof M.CSS_SAMPLE === 'string' && M.CSS_SAMPLE.length > 40)

/* ---------------- 1. HTML：结构对撞（外部裁判） ---------------- */
const htmlPretty = M.formatHtml(M.HTML_SAMPLE).text
const htmlMin = M.formatHtml(M.HTML_SAMPLE, { minify: true }).text

T.ok('HTML 排版后结构不变', same(htmlTokens(M.HTML_SAMPLE), htmlTokens(htmlPretty)), '标签序列或文本被改了')
T.ok('HTML 压缩后结构不变', same(htmlTokens(M.HTML_SAMPLE), htmlTokens(htmlMin)), '标签序列或文本被改了')
T.ok('HTML 压缩确实去掉了标签间空白', !/>\s+</.test(htmlMin), '压缩后标签之间还留着空白')
T.ok('HTML 压缩比排版短', htmlMin.length < htmlPretty.length)
T.ok('HTML 排版把块级标签分到多行', htmlPretty.split('\n').length > 5)
T.ok('HTML 排版首行是 doctype', htmlPretty.split('\n')[0].trim() === '<!DOCTYPE html>')

// pre 是原样文本区：内部的空格与换行不能被压缩
const preSrc = '<div><pre>  a\n   b  </pre><span> x </span></div>'
T.ok('HTML 压缩保留 pre 内部空白', M.formatHtml(preSrc, { minify: true }).text.includes('<pre>  a\n   b  </pre>'))
T.ok('HTML 压缩 pre 结构不变', same(htmlTokens(preSrc), htmlTokens(M.formatHtml(preSrc, { minify: true }).text)))

// 属性值里带 '>' 不能被当成标签结束
const attrSrc = '<a href="x?a=1&b=2" title="a > b">go</a>'
T.ok('HTML 属性里的 > 不切标签', same(htmlTokens(attrSrc), htmlTokens(M.formatHtml(attrSrc).text)))
T.ok('HTML 属性原样保留', M.formatHtml(attrSrc).text.includes('title="a > b"'))

// 注释与自闭合/空元素
const withComment = '<div><!-- hi --><br><img src="a.png"><p>x</p></div>'
T.ok('HTML 注释结构对撞', same(htmlTokens(withComment), htmlTokens(M.formatHtml(withComment).text)))
T.ok('HTML 压缩保留注释文本位置', htmlTokens(M.formatHtml(withComment, { minify: true }).text).length > 0)
T.ok('HTML 空元素不加深缩进', M.formatHtml('<div><br><p>x</p></div>').text.split('\n').filter((l) => l.includes('<br>')).length === 1)

// 缩进宽度可调：4 空格缩进必须真的出现
T.ok('HTML indent 选项生效', M.formatHtml('<div><p>x</p></div>', { indent: 4 }).text.includes('    <p>'))

/* ---------------- 2. HTML：幂等与压缩往返 ---------------- */
T.eq('HTML 排版幂等', M.formatHtml(htmlPretty).text, htmlPretty)
T.eq('HTML 压缩幂等', M.formatHtml(htmlMin, { minify: true }).text, htmlMin)
T.ok('HTML 压缩再排版结构不变', same(htmlTokens(M.HTML_SAMPLE), htmlTokens(M.formatHtml(htmlMin).text)))

/* ---------------- 3. HTML：边界与反例 ---------------- */
T.throws('HTML 空串报错', () => M.formatHtml(''), /内容/)
// 纯空白与空串同口径（本轮修的 P3）：以前 formatHtml('   ') 静默返回空、
// formatCss('   ') 抛「内容是空的」——同模块两把尺。判据是「空」的定义：
// 没有可排版的内容就是空，空白不算内容。
T.throws('HTML 纯空白报错（与 CSS 同口径）', () => M.formatHtml('   '), /内容/)
T.throws('HTML 空白加换行报错', () => M.formatHtml('\n\t '), /内容/)
T.throws('HTML 压缩模式纯空白也报错', () => M.formatHtml('  ', { minify: true }), /内容/)
T.throws('CSS 空串报错', () => M.formatCss(''), /内容/)
T.throws('CSS 纯空白报错', () => M.formatCss('  \t '), /内容/)

/* ---------------- 4. HTML：UI 可见字段 ---------------- */
const hp = M.formatHtml(M.HTML_SAMPLE)
const hm = M.formatHtml(M.HTML_SAMPLE, { minify: true })
T.ok('HTML 排版 size == 文本长度', hp.size === hp.text.length)
T.ok('HTML 排版 lines 是数字', typeof hp.lines === 'number' && hp.lines > 0)
T.ok('HTML 压缩 size 不小于文本长度', hm.size >= hm.text.length)
T.ok('HTML 输出无脏字', noJunk(htmlPretty) && noJunk(htmlMin))

/* ---------------- 5. CSS：语义对撞（外部裁判） ---------------- */
const cssPretty = M.formatCss(M.CSS_SAMPLE).text
const cssMin = M.formatCss(M.CSS_SAMPLE, { minify: true }).text

T.eq('CSS 排版语义不变', cssCanon(cssPretty), cssCanon(M.CSS_SAMPLE))
T.eq('CSS 压缩语义不变', cssCanon(cssMin), cssCanon(M.CSS_SAMPLE))
T.ok('CSS 排版把声明分到多行', cssPretty.split('\n').length > 5)
T.ok('CSS 排版选择器与 { 之间留空格', cssPretty.includes('.card {'))
T.ok('CSS 压缩不含换行', !/\n/.test(cssMin))
T.ok('CSS 压缩没有连续空白', !/ {2}/.test(cssMin))
T.ok('CSS 压缩比排版短', cssMin.length < cssPretty.length)

// 注释：排版保留、压缩丢弃
const cssCmt = '/* c */ .a{color:red} // line\n.b{margin:0}'
T.ok('CSS 排版保留注释', M.formatCss(cssCmt).text.includes('/* c */') && M.formatCss(cssCmt).text.includes('// line'))
T.ok('CSS 压缩丢弃注释', M.formatCss(cssCmt, { minify: true }).text.indexOf('c */') === -1)
T.eq('CSS 去注释后语义不变（压缩）', cssCanon(M.formatCss(cssCmt, { minify: true }).text), cssCanon(cssCmt))

// 字符串里的连续空格（无标点）压缩后必须保留
const cssStr = '.a{content:"a  b";color:red}'
T.ok('CSS 字符串内空格被保留（排版）', M.formatCss(cssStr).text.includes('"a  b"'))
T.ok('CSS 字符串内空格被保留（压缩）', M.formatCss(cssStr, { minify: true }).text.includes('"a  b"'))

// 字符串里带 {}:;,> 的——压缩末尾那道 /\s*([{}:;,>])\s*/g 全串清扫曾把
// content:"x : y" 里的冒号两侧空格吃掉变成 "x:y"，改了字符串的字面语义。
// 判据用外部裁判 cssCanon（它把字符串当原子 token）+ 字面串必须逐字节还在。
{
  const STR_PUNCT = [
    '.a{content:"x : y"}',
    '.a{content:attr("a > b")}',
    '.a{background:url("a;b.png")}',
    '.a{grid-template:"a b" / "c d"}',
    '.a{content:";"}',
    '.a{content:";}"}',
    ".a{font-family:'A, B'}",
  ]
  for (const src of STR_PUNCT) {
    const lit = /["'][^"']*["']/.exec(src)[0] // 抓出字符串字面（含内部标点与空格）
    const min = M.formatCss(src, { minify: true }).text
    T.eq('压缩不改字符串字面 ' + JSON.stringify(src), min.includes(lit), true)
    T.eq('压缩语义不变（外部裁判） ' + JSON.stringify(src), cssCanon(min), cssCanon(src))
  }
  // 结构字符周围的空格该照旧压掉（别把修复做成「整个清扫都不动了」）
  T.eq('压缩仍去掉冒号外的空格', M.formatCss('.a { color : red }', { minify: true }).text, '.a{color:red}')
  T.eq('压缩仍去掉大括号旁的空格', M.formatCss('.a  >  .b { margin : 0 }', { minify: true }).text, '.a>.b{margin:0}')
}

/* ---------------- 6. CSS：幂等与缩进 ---------------- */
T.eq('CSS 排版幂等', M.formatCss(cssPretty).text, cssPretty)
T.eq('CSS 压缩幂等', M.formatCss(cssMin, { minify: true }).text, cssMin)
T.ok('CSS indent 选项生效', M.formatCss('.a{color:red}', { indent: 4 }).text.includes('    color'))

/* ---------------- 7. CSS：UI 可见字段 ---------------- */
const cp = M.formatCss(M.CSS_SAMPLE)
const cm = M.formatCss(M.CSS_SAMPLE, { minify: true })
T.ok('CSS 排版 size == 文本长度', cp.size === cp.text.length)
T.ok('CSS 排版 lines 是数字', typeof cp.lines === 'number' && cp.lines > 0)
T.ok('CSS 压缩 size 不小于文本长度', cm.size >= cm.text.length)
T.ok('CSS 输出无脏字', noJunk(cssPretty) && noJunk(cssMin))

T.done()
