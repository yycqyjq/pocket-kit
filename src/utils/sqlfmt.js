/**
 * SQL 格式化
 * 只做排版，不改语义：会跳过字符串、引号标识符与注释，不会把里面的内容搞坏
 */

// 换行到顶格的子句
const TOP = [
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET',
  'UNION ALL', 'UNION', 'EXCEPT', 'INTERSECT', 'WITH', 'VALUES', 'SET', 'RETURNING',
  'INSERT INTO', 'INSERT', 'UPDATE', 'DELETE FROM', 'DELETE',
  'CREATE TABLE', 'CREATE INDEX', 'CREATE VIEW', 'ALTER TABLE', 'DROP TABLE', 'TRUNCATE TABLE',
  'WINDOW',
]
// 换行但缩进一级（连接与条件）
const MID = [
  'INNER JOIN', 'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
  'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'JOIN',
  'ON', 'AND', 'OR', 'WHEN', 'ELSE',
]
// 就地大写的关键字
const KEYS = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'HAVING', 'ORDER', 'LIMIT', 'OFFSET', 'UNION',
  'ALL', 'EXCEPT', 'INTERSECT', 'WITH', 'AS', 'VALUES', 'SET', 'RETURNING', 'INSERT', 'INTO',
  'UPDATE', 'DELETE', 'CREATE', 'TABLE', 'INDEX', 'VIEW', 'ALTER', 'DROP', 'TRUNCATE',
  'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'ON', 'AND', 'OR', 'NOT',
  'NULL', 'IS', 'IN', 'BETWEEN', 'LIKE', 'ILIKE', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE',
  'END', 'ASC', 'DESC', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE',
  'CAST', 'NULLIF', 'GREATEST', 'LEAST', 'ARRAY_AGG', 'STRING_AGG', 'ROW_NUMBER', 'RANK',
  'DENSE_RANK', 'LAG', 'LEAD', 'OVER', 'PARTITION', 'WINDOW', 'NULLS', 'FIRST', 'LAST',
  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'DEFAULT', 'CHECK', 'CONSTRAINT',
  'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'VARCHAR', 'TEXT', 'CHAR', 'BOOLEAN', 'DATE',
  'TIMESTAMP', 'TIMESTAMPTZ', 'NUMERIC', 'DECIMAL', 'FLOAT', 'DOUBLE', 'JSON', 'JSONB',
  'UUID', 'SERIAL', 'BIGSERIAL', 'TRUE', 'FALSE', 'CASCADE', 'RESTRICT', 'IF', 'REPLACE',
  'EXPLAIN', 'ANALYZE', 'VACUUM', 'BEGIN', 'COMMIT', 'ROLLBACK', 'GRANT', 'REVOKE',
])

// 后面会跟括号、但本身不是函数的关键字（括号前要留空格）
const PAREN_BLOCK = new Set([
  'IN', 'VALUES', 'EXISTS', 'ON', 'AND', 'OR', 'NOT', 'USING', 'BETWEEN', 'LIKE', 'ILIKE',
  'SELECT', 'FROM', 'WHERE', 'HAVING', 'BY', 'SET', 'RETURNING', 'GROUP', 'ORDER',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'ALL', 'ANY', 'SOME', 'PARTITION', 'OVER', 'AS',
])

/* ---------------- 分词 ---------------- */

function tokenize(sql) {
  const s = String(sql)
  const out = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    // 行注释
    if ((c === '-' && s[i + 1] === '-') || c === '#') {
      let j = s.indexOf('\n', i)
      if (j < 0) j = s.length
      out.push({ t: 'comment', v: s.slice(i, j) })
      i = j
      continue
    }
    // 块注释
    if (c === '/' && s[i + 1] === '*') {
      let j = s.indexOf('*/', i + 2)
      j = j < 0 ? s.length : j + 2
      out.push({ t: 'comment', v: s.slice(i, j) })
      i = j
      continue
    }
    // 字符串
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
      out.push({ t: 'str', v: s.slice(i, j) })
      i = j
      continue
    }
    // 引号标识符
    if (c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c
      let j = s.indexOf(close, i + 1)
      j = j < 0 ? s.length : j + 1
      out.push({ t: 'ident', v: s.slice(i, j) })
      i = j
      continue
    }
    // 数字
    if (/[0-9]/.test(c)) {
      let j = i
      while (j < s.length && /[0-9._eE]/.test(s[j])) {
        if ((s[j] === 'e' || s[j] === 'E') && !/[0-9+-]/.test(s[j + 1] || '')) break
        j++
        if (/[+-]/.test(s[j]) && /[eE]/.test(s[j - 1])) j++
      }
      out.push({ t: 'num', v: s.slice(i, j) })
      i = j
      continue
    }
    // 词
    if (/[A-Za-z_\u4e00-\u9fff]/.test(c)) {
      let j = i
      while (j < s.length && /[A-Za-z0-9_$\u4e00-\u9fff]/.test(s[j])) j++
      out.push({ t: 'word', v: s.slice(i, j) })
      i = j
      continue
    }
    if (/\s/.test(c)) {
      i++
      continue
    }
    // 多字符运算符
    const three = s.slice(i, i + 3)
    if (three === '::') {
      out.push({ t: 'op', v: '::' })
      i += 2
      continue
    }
    const two = s.slice(i, i + 2)
    if (['<=', '>=', '<>', '!=', '||', '->', '=>'].indexOf(two) > -1) {
      out.push({ t: 'op', v: two })
      i += 2
      continue
    }
    out.push({ t: 'op', v: c })
    i++
  }
  return out
}

/* ---------------- 排版 ---------------- */

function phraseAt(tokens, i, table) {
  for (const phrase of table) {
    const parts = phrase.split(' ')
    if (i + parts.length > tokens.length) continue
    let ok = true
    for (let k = 0; k < parts.length; k++) {
      const tk = tokens[i + k]
      if (!tk || tk.t !== 'word' || tk.v.toUpperCase() !== parts[k]) {
        ok = false
        break
      }
    }
    if (ok) return { phrase, len: parts.length }
  }
  return null
}

/**
 * @param {string} sql
 * @param {object} opts { upper: 关键字大写, commaBreak: 逗号换行 }
 */
export function formatSql(sql, opts) {
  const o = Object.assign({ upper: true, commaBreak: true, oneLine: false }, opts || {})
  const tokens = tokenize(sql)
  if (!tokens.length) return { text: '', lines: 0, keywords: 0 }

  const lines = []
  let cur = ''
  let depth = 0
  let currentTop = ''
  let keywordCount = 0
  // 上一个词后面是否紧跟左括号（用来判断是不是函数调用，决定 ( 前要不要空格）
  let callableBefore = false

  const flush = () => {
    const t = cur.replace(/\s+$/, '')
    if (t) lines.push(t)
    cur = ''
  }
  const startLine = (text, indent) => {
    if (o.oneLine) {
      cur += (cur ? ' ' : '') + text
      return
    }
    flush()
    cur = '  '.repeat(indent) + text
  }
  const append = (text, attachParen) => {
    if (!cur) {
      cur = text
      return
    }
    let noSpaceBefore =
      text === ')' || text === ',' || text === '.' || text === '::' || text === ';'
    // 只有函数名后的 ( 才紧贴，IN (、VALUES ( 这类要保持空格
    if (text === '(') noSpaceBefore = !!attachParen
    const noSpaceAfter = /[(.]$/.test(cur)
    if (noSpaceBefore || noSpaceAfter) cur += text
    else cur += ' ' + text
  }
  /** 看下一个 token 是不是 ( ，是则说明当前这个词是函数名 */
  const followedByParen = (idx) => {
    const nx = tokens[idx + 1]
    if (!(nx && nx.t === 'op' && nx.v === '(')) return false
    // 有些关键字后面也跟括号，但它们不是函数，括号前要留空格：
    // IN (1,2) / VALUES (…) / EXISTS (…) / ON (…) / PARTITION BY (…) 等
    const up = tokens[idx].v.toUpperCase()
    return !PAREN_BLOCK.has(up)
  }

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i]

    if (tk.t === 'comment') {
      if (o.oneLine) {
        // 块注释可以就地接上；行注释必须独占一行 ——
        // 压平时若把 `-- 注释` 和它后面的 SQL 挤在同一行，后面全部会被注释掉
        if (tk.v.startsWith('/*')) {
          append(tk.v)
        } else {
          flush()
          lines.push(tk.v.trim())
        }
        continue
      }
      flush()
      lines.push(tk.v.trim())
      continue
    }

    if (tk.t === 'word') {
      const top = phraseAt(tokens, i, TOP)
      if (top && depth === 0) {
        // 只把首个词交给 startLine，剩下的用 += 续上，
        // 否则整段短语会被写入两次（曾出现 GROUP BY BY / LEFT JOIN JOIN）
        startLine(o.upper ? tk.v.toUpperCase() : tk.v, 0)
        if (o.upper) keywordCount++
        for (let k = 1; k < top.len; k++) {
          const t2 = tokens[i + k]
          if (o.upper) keywordCount++
          cur += ' ' + (o.upper ? t2.v.toUpperCase() : t2.v)
        }
        currentTop = top.phrase
        i += top.len - 1
        continue
      }
      const mid = phraseAt(tokens, i, MID)
      if (mid && depth === 0) {
        startLine(o.upper ? tk.v.toUpperCase() : tk.v, 1)
        if (o.upper) keywordCount++
        for (let k = 1; k < mid.len; k++) {
          const t2 = tokens[i + k]
          if (o.upper) keywordCount++
          cur += ' ' + (o.upper ? t2.v.toUpperCase() : t2.v)
        }
        i += mid.len - 1
        continue
      }
      const up = tk.v.toUpperCase()
      if (o.upper && KEYS.has(up)) {
        keywordCount++
        append(up)
      } else {
        append(tk.v)
      }
      callableBefore = followedByParen(i)
      continue
    }

    if (tk.t === 'op') {
      if (tk.v === '(') {
        depth++
        append('(', callableBefore)
        callableBefore = false
        continue
      }
      if (tk.v === ')') {
        depth = Math.max(0, depth - 1)
        append(')')
        callableBefore = false
        continue
      }
      if (tk.v === ',') {
        append(',')
        callableBefore = false
        const breakable = !o.oneLine && o.commaBreak && depth === 0 &&
          (currentTop === 'SELECT' || currentTop === 'GROUP BY' || currentTop === 'ORDER BY' || currentTop === 'VALUES' || currentTop === 'SET')
        if (breakable) {
          flush()
          cur = '  '
        }
        continue
      }
      append(tk.v)
      callableBefore = false
      continue
    }

    append(tk.v)
    callableBefore = false
  }
  flush()

  const text = lines.join('\n')
  return {
    text,
    lines: lines.length,
    chars: text.length,
    keywords: keywordCount,
  }
}

/**
 * 压成一行
 * 注意：不能拿 formatSql 的结果做正则压平 —— 那会把字符串字面量里的连续空格
 * 压掉（'a  b' → 'a b'，是另一个查询条件），也会把 `-- 行注释` 后面的 SQL
 * 挤进注释里。必须走 token 流，所以这里用 formatSql 的单行模式。
 * 含行注释时输出会保留换行，这是正确性要求，不是没压干净。
 */
export function minifySql(sql) {
  return formatSql(sql, { commaBreak: false, oneLine: true }).text
}

export const SQL_SAMPLE = `select u.id,u.name,count(o.id) as order_count,sum(o.amount) as total from users u left join orders o on o.user_id=u.id and o.status<>'cancelled' where u.created_at>='2026-01-01' and u.city in ('北京','上海') group by u.id,u.name having count(o.id)>3 order by total desc limit 20;`
