/**
 * markdown.js 自测：结构渲染 / 转义安全 / 大纲 / 统计 / 反向转换
 */
import { useUtils, makeTest } from './harness.mjs'

const M = await useUtils('markdown')
const T = makeTest('markdown')

T.eq('MD_MAX 上限', M.MD_MAX, 20000)

/* 基本渲染 */
const h1 = M.mdToHtml('# 大标题\n\n正文一段。')
T.ok('一级标题渲染', h1.html.indexOf('<h1') >= 0)
T.ok('标题文字在', h1.html.indexOf('大标题') >= 0)
T.ok('段落渲染', h1.html.indexOf('<p') >= 0)
T.eq('干净输入无警告', h1.warnings.length, 0)

/* 行内标记 */
const inline = M.mdToHtml('**粗** 与 *斜* 与 ~~删~~ 与 `码`').html
T.ok('加粗', inline.indexOf('<strong') >= 0)
T.ok('斜体', inline.indexOf('<em') >= 0)
T.ok('删除线', inline.indexOf('<del') >= 0)
T.ok('行内代码', inline.indexOf('<code') >= 0)

/* 结构块 */
const doc = M.mdToHtml('# A\n\n- 甲\n- 乙\n\n> 引用\n\n```\n代码块\n```\n\n| 表头 | 表尾 |\n| --- | --- |\n| 1 | 2 |').html
T.ok('列表', doc.indexOf('<li') >= 0)
T.ok('引用', doc.indexOf('<blockquote') >= 0)
T.ok('代码块', doc.indexOf('<pre') >= 0)
T.ok('表格', doc.indexOf('<table') >= 0)

/* 链接与图片 */
const link = M.mdToHtml('[发布页](https://example.com)')
T.ok('链接渲染', link.html.indexOf('<a ') >= 0)
T.eq('链接计数', M.stats('[发布页](https://example.com)').links, 1)
T.ok('图片渲染', M.mdToHtml('![图](/img.png)').html.indexOf('<img') >= 0)

/* 转义安全：script 与恶意协议都不能原样通过 */
const evil = M.mdToHtml('<script>alert(1)</script>与[javascript:链](javascript:alert(1))').html
T.eq('script 标签被转义', evil.indexOf('<script'), -1)
T.eq('javascript 协议被中和', evil.indexOf('href="javascript'), -1)
const mdEvil = M.htmlToMd('<p>正常</p><script>evil()</script>')
T.eq('htmlToMd 丢弃脚本', mdEvil.indexOf('evil'), -1)

/* escapeHtml */
const esc = M.escapeHtml('<a b="c">&')
T.ok('尖括号转义', esc.indexOf('&lt;') >= 0 && esc.indexOf('&gt;') >= 0)
T.ok('和号转义', esc.indexOf('&amp;') >= 0)
T.eq('引号留给属性转义（escapeAttr）', M.escapeAttr('"x"'), '&quot;x&quot;')

/* 大纲 */
const ol = M.outline('# 甲\n## 乙\n### 丙\n# 丁')
T.eq('两个顶层', ol.length, 2)
T.eq('顶层文字', ol[0].text, '甲')
T.eq('二级', ol[0].children[0].text, '乙')
T.eq('三级', ol[0].children[0].children[0].text, '丙')
T.eq('第二顶层', ol[1].text, '丁')
T.eq('层级', ol[0].children[0].level, 2)
const dup = M.outline('# 同名\n\n# 同名')
T.ok('重复标题 slug 去重', dup[0].slug !== dup[1].slug)

/* 统计 */
const st = M.stats('# 标题\n\n正文一段。\n\n- 甲\n- 乙\n')
T.eq('h1 计数', st.headings.h1, 1)
T.eq('列表项计数', st.listItems, 2)
T.ok('行数与字符数', st.lines >= 4 && st.chars > 0)
const st2 = M.stats('# 只有标题', M.mdToHtml('# 只有标题').html)
T.eq('传入 html 不重复渲染', st2.headingTotal, 1)
T.eq('代码块计数', M.stats('```\ncode\n```').codeBlocks, 1)

/* htmlToMd */
const back = M.htmlToMd('<h1>标题</h1><p>正文 <strong>粗</strong></p>')
T.ok('标题转回 #', back.indexOf('# 标题') >= 0)
T.ok('正文保留', back.indexOf('正文') >= 0)
const docMd = M.SAMPLES.filter((s) => s.key === 'doc')[0]
const round = M.htmlToMd(M.mdToHtml(docMd.src).html)
T.ok('文档样例往返保留标题', round.indexOf('随身匣更新说明') >= 0)

T.done()
