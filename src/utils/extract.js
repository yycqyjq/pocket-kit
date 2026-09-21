/**
 * 从任意文本里抽取结构化信息
 * 用途：从日志、聊天记录、文档里把链接、邮箱、号码、金额一次捞出来
 */

/**
 * 注意：这里刻意不用「后行断言」(?<!…)。
 * 后行断言是**解析期**特性，老一点的 Android WebView 不支持时会让整段脚本直接语法错误，
 * 所以统一改用 \b 边界与捕获组，兼容性更稳。
 */
export const PATTERNS = [
  {
    key: 'url',
    name: '网址',
    re: /\bhttps?:\/\/[^\s<>"'`\u4e00-\u9fff，。；：！？、）】]+|\bwww\.[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\s<>"'`\u4e00-\u9fff，。；：！？、）】]*/gi,
    note: '以 http(s):// 或 www. 开头',
  },
  {
    key: 'email',
    name: '邮箱',
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g,
    note: '标准邮箱格式',
  },
  {
    key: 'phone',
    name: '手机号',
    re: /\b1[3-9]\d{9}\b/g,
    note: '中国大陆 11 位手机号',
  },
  {
    key: 'tel',
    name: '座机号',
    re: /\b0\d{2,3}[-\s]?\d{7,8}(?:-\d{1,4})?\b/g,
    note: '区号 + 号码，可选分机',
  },
  {
    key: 'ipv4',
    name: 'IPv4',
    re: /\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\b/g,
    note: '四段 0~255',
  },
  {
    key: 'idcard',
    name: '身份证号',
    re: /\b\d{17}[\dXx]\b/g,
    note: '18 位，末位可为 X',
  },
  {
    key: 'uscc',
    name: '统一社会信用代码',
    re: /\b[0-9A-HJ-NPQRTUWXY]{18}\b/g,
    note: '18 位，不含 I O S V Z',
  },
  {
    key: 'bankcard',
    name: '长数字串（可能是银行卡）',
    re: /\b\d{16,19}\b/g,
    note: '16~19 位纯数字。会与身份证、统一社会信用代码重叠，按需取用',
  },
  {
    key: 'date',
    name: '日期',
    re: /\b\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?|\b\d{4}-\d{2}-\d{2}\b/g,
    note: '支持 2026-09-20、2026/9/20、2026年9月20日',
  },
  {
    key: 'time',
    name: '时间',
    re: /\b(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/g,
    note: 'HH:mm 或 HH:mm:ss',
  },
  {
    key: 'money',
    name: '金额',
    re: /[¥￥$€£]\s?\d[\d,]*(?:\.\d{1,2})?|\d[\d,]*(?:\.\d{1,2})?\s?(?:万元|亿元|美元|欧元|元)/g,
    note: '带货币符号或「元」后缀',
  },
  {
    key: 'percent',
    name: '百分比',
    re: /\b\d+(?:\.\d+)?\s?%|\b-\d+(?:\.\d+)?\s?%/g,
    note: '数字加百分号',
  },
  {
    key: 'uuid',
    name: 'UUID',
    re: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
    note: '标准 8-4-4-4-12 格式',
  },
  {
    key: 'color',
    name: '颜色值',
    re: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g,
    note: '三位或六位十六进制色值',
  },
  {
    key: 'hashtag',
    name: '话题标签',
    re: /#[^#\s<>"'`]{1,30}#|#[\u4e00-\u9fffA-Za-z][^\s<>"'`#]{0,29}/g,
    note: '微博/推特式话题',
  },
  {
    key: 'mention',
    name: '@ 提及',
    re: /@[A-Za-z0-9_\u4e00-\u9fff-]{1,30}/g,
    note: '社交平台的 @ 提及',
  },
]

/**
 * @param {string} text
 * @param {object} opt { keys: string[], dedupe: boolean, caseSensitive: boolean }
 */
export function extract(text, opt) {
  const o = Object.assign({ keys: null, dedupe: true }, opt || {})
  const s = String(text)
  if (!s.trim()) return { groups: [], total: 0 }

  const groups = []
  let total = 0

  for (const p of PATTERNS) {
    if (o.keys && o.keys.indexOf(p.key) < 0) continue
    const re = new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : p.re.flags + 'g')
    const hits = []
    const seen = new Set()
    let m
    let guard = 0
    while ((m = re.exec(s)) !== null && guard++ < 5000) {
      const v = m[0].trim()
      if (!v) continue
      const key = o.dedupe ? v.toLowerCase() : v + '@' + m.index
      if (seen.has(key)) continue
      seen.add(key)
      hits.push(v)
      if (m[0] === '') re.lastIndex++
    }
    if (hits.length) {
      groups.push({ key: p.key, name: p.name, note: p.note, items: hits })
      total += hits.length
    }
  }
  return { groups, total }
}

/** 把结果导出成一行一条的纯文本 */
export function toPlain(group) {
  return (group.items || []).join('\n')
}

export const EXTRACT_SAMPLE =
  '联系邮箱：hi@example.com，备用 you.name+dev@mail.co.uk\n' +
  '手机 13800138000，座机 010-88886666 转 123\n' +
  '服务器 192.168.1.100 与 10.0.0.5，文档 https://docs.example.com/guide?page=2\n' +
  '订单号 f47ac10b-58cc-4372-a567-0e02b2c3d479，金额 ¥1,234.56，折扣 12.5%\n' +
  '签约日期 2026-09-20，时间 15:30:00，主题色 #3F7A6E\n' +
  '#随身匣# 上线了 @小明 记得看'
