/**
 * sqlfmt.js 自查断言（直接测 src/utils/sqlfmt.js 本体）
 * ------------------------------------------------------------
 * 这个模块只做排版、声称「不改语义」。所以判据的核心是：
 *   1) 外部裁判（自写 SQL token 化器）：在测试里另写一份独立分词器，
 *      把「原文 / 排版后 / 压平后」都切成 token 序列再比。
 *      规则：关键字大小写不敏感（排版会把关键字转大写，属合法等价），
 *      字符串字面量、引号标识符、数字、运算符必须逐字节相同。
 *      只要序列相同，就说明排版没有增删或改写任何一个词法单元。
 *   2) 已知样例手写期望排版：小查询逐行写死期望串，来源是模块注释里写明的
 *      「TOP 顶格 / MID 缩进一级 / 逗号换行」这套公开规则，而非抄模块输出。
 *   3) 往返性质：排版两次 == 一次；压平再压平不变。
 *   4) 边界与反例：空串、纯空白、null、超长、含注释/字符串空格等敏感输入。
 *   5) UI 可见契约：text/lines/chars/keywords 不许 undefined/NaN。
 */
import { useUtils, makeTest } from './harness.mjs'

const S = await useUtils('sqlfmt')
const T = makeTest('sqlfmt')

/* ---------------- 独立裁判：SQL 词法 token 化器 ---------------- */
// 关键字（word）统一大写比较；字符串/标识符/数字/运算符原样比较。
function sqlTokens(sql) {
  const s = String(sql)
  const out = []
  const MULTI = ['::', '<=', '>=', '<>', '!=', '||', '->', '=>']
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if ((c === '-' && s[i + 1] === '-') || c === '#') {
      let j = s.indexOf('\n', i)
      if (j < 0) j = s.length
      out.push('C:' + s.slice(i, j).trim())
      i = j
      continue
    }
    if (c === '/' && s[i + 1] === '*') {
      let j = s.indexOf('*/', i + 2)
      j = j < 0 ? s.length : j + 2
      out.push('C:' + s.slice(i, j).trim())
      i = j
      continue
    }
    if (c === "'") {
      let j = i + 1
      while (j < s.length) {
        if (s[j] === "'" && s[j + 1] === "'") {
          j += 2
          continue
        }
        if (s[j] === "'") {
          j++
          break
        }
        j++
      }
      out.push('S:' + s.slice(i, j))
      i = j
      continue
    }
    if (c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c
      let j = s.indexOf(close, i + 1)
      j = j < 0 ? s.length : j + 1
      out.push('I:' + s.slice(i, j))
      i = j
      continue
    }
    if (/[0-9]/.test(c)) {
      const m = /^\d[\d_]*(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i))
      out.push('N:' + m[0])
      i += m[0].length
      continue
    }
    if (/[A-Za-z_\u4e00-\u9fff]/.test(c)) {
      let j = i
      while (j < s.length && /[A-Za-z0-9_$\u4e00-\u9fff]/.test(s[j])) j++
      out.push('W:' + s.slice(i, j).toUpperCase())
      i = j
      continue
    }
    const two = s.slice(i, i + 2)
    if (MULTI.includes(two)) {
      out.push('O:' + two)
      i += 2
      continue
    }
    out.push('O:' + c)
    i++
  }
  return out
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const noJunk = (s) => !/undefined|NaN|\[object Object\]/.test(String(s))

/* ---------------- 0. 导出面 ---------------- */
T.ok('导出 formatSql', typeof S.formatSql === 'function')
T.ok('导出 minifySql', typeof S.minifySql === 'function')
T.ok('导出 SQL_SAMPLE', typeof S.SQL_SAMPLE === 'string' && S.SQL_SAMPLE.length > 40)

/* ---------------- 1. 语义不变（外部裁判） ---------------- */
const pretty = S.formatSql(S.SQL_SAMPLE).text
const min = S.minifySql(S.SQL_SAMPLE)

T.ok('排版后 token 序列不变', same(sqlTokens(S.SQL_SAMPLE), sqlTokens(pretty)))
T.ok('压平后 token 序列不变', same(sqlTokens(S.SQL_SAMPLE), sqlTokens(min)))
T.ok('排版再压平 token 序列仍不变', same(sqlTokens(pretty), sqlTokens(min)))

const lower = 'select a , b from t where x = 1'
T.ok('小写输入 token 序列不变', same(sqlTokens(lower), sqlTokens(S.formatSql(lower).text)))
T.ok('upper:false 也保持 token 序列', same(sqlTokens(lower), sqlTokens(S.formatSql(lower, { upper: false }).text)))

/* ---------------- 2. 手写期望排版（来自公开规则） ---------------- */
const q = 'select a,b from t where x=1 and y=2'
const want = ['SELECT a,', '   b', 'FROM t', 'WHERE x = 1', '  AND y = 2'].join('\n')
T.eq('小查询逐行排版', S.formatSql(q).text, want)
T.ok('SELECT 列表逗号换行', S.formatSql(q).text.split('\n')[0] === 'SELECT a,')
T.ok('JOIN/AND 缩进一级', S.formatSql(q).text.includes('\n  AND y = 2'))
T.ok('commaBreak:false 不拆 SELECT 列表', S.formatSql(q, { commaBreak: false }).text.includes('SELECT a, b'))
T.eq('oneLine 压成一行', /\n/.test(S.formatSql(q, { oneLine: true }).text), false)

/* ---------------- 3. 关键字大写、标识符保原样 ---------------- */
const mixed = 'select Foo, Bar from Baz'
const mixedOut = S.formatSql(mixed).text
T.ok('关键字转大写', mixedOut.includes('SELECT') && mixedOut.includes('FROM'))
T.ok('标识符大小写保留', mixedOut.includes('Foo') && mixedOut.includes('Bar') && mixedOut.includes('Baz'))
T.ok('upper:false 关键字不转大写', S.formatSql(mixed, { upper: false }).text.includes('select'))

/* ---------------- 4. 字符串 / 注释 敏感区 ---------------- */
const strSql = "select 'a  b' as s from t"
T.ok('排版保留字符串内连续空格', S.formatSql(strSql).text.includes("'a  b'"))
T.ok('压平保留字符串内连续空格', S.minifySql(strSql).includes("'a  b'"))
T.ok('字符串里的关键字不被改写', S.minifySql("select 'select from where'").includes("'select from where'"))
T.ok('字符串里单引号转义保留', S.minifySql("select 'it''s ok'").includes("'it''s ok'"))

const cmt = 'select 1 -- 说明\nfrom t'
const cmtMin = S.minifySql(cmt)
T.ok('压平后行注释独占一行', cmtMin.includes('\n-- 说明\n'), '否则后面的 SQL 会被注释掉')
T.ok('行注释后仍能看见 FROM', cmtMin.includes('FROM t'))
T.ok('排版保留块注释', S.formatSql('select /* c */ 1').text.includes('/* c */'))
T.ok('压平保留块注释', S.minifySql('select /* c */ 1').includes('/* c */'))

/* ---------------- 5. 幂等与往返 ---------------- */
T.eq('排版幂等', S.formatSql(pretty).text, pretty)
T.eq('压平幂等', S.minifySql(min), min)
T.ok('压平结果通常无换行', !/\n/.test(min))

/* ---------------- 6. 结构敏感区：括号与函数 ---------------- */
const fn = S.formatSql('select count(o.id) from t where id in (1,2,3)').text
T.ok('函数名与括号紧贴', fn.includes('COUNT(o.id)'))
T.ok('IN 与括号间留空格', fn.includes('IN (1, 2, 3)'))
T.ok('子查询 token 序列不变', same(sqlTokens('select * from (select 1) x'), sqlTokens(S.formatSql('select * from (select 1) x').text)))

/* ---------------- 7. 边界与反例 ---------------- */
T.eq('空串返回空结构', S.formatSql('').text, '')
T.eq('空串 lines=0', S.formatSql('').lines, 0)
T.eq('空串 keywords=0', S.formatSql('').keywords, 0)
T.eq('纯空白返回空', S.formatSql('   \n  ').text, '')
T.ok('null 不抛', (() => {
  try {
    S.formatSql(null)
    return true
  } catch (e) {
    return false
  }
})())
const long = 'select ' + Array.from({ length: 300 }, (_, i) => 'c' + i).join(',') + ' from t'
T.ok('超长输入不抛且 token 不变', same(sqlTokens(long), sqlTokens(S.formatSql(long).text)))
T.ok('CJK 字符串保留', S.minifySql("select '中文 空格' from t").includes("'中文 空格'"))
T.ok('引号标识符保留', S.minifySql('select "My Col" from "My Table"').includes('"My Col"') && S.minifySql('select "My Col" from "My Table"').includes('"My Table"'))
T.ok('数字与运算符保留', S.minifySql('select a>=1 and b<>2').includes('a >= 1') && S.minifySql('select a>=1 and b<>2').includes('<> 2'))
T.ok('结尾分号保留', S.formatSql('select 1;').text.trim().endsWith(';'))

/* ---------------- 8. UI 可见字段 ---------------- */
T.ok('排版 chars == 文本长度', S.formatSql(S.SQL_SAMPLE).chars === pretty.length)
T.ok('排版 lines == 行数', S.formatSql(S.SQL_SAMPLE).lines === pretty.split('\n').length)
T.ok('keywords 是正数', S.formatSql(S.SQL_SAMPLE).keywords > 0)
T.ok('输出无脏字', noJunk(pretty) && noJunk(min))

T.done()
