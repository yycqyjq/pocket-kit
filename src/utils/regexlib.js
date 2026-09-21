/**
 * 常用正则速查表 + 匹配工具
 */

export const REGEX_LIB = [
  {
    group: '数字',
    items: [
      { name: '整数', pattern: '^-?\\d+$', sample: '-42' },
      { name: '正整数', pattern: '^[1-9]\\d*$', sample: '42' },
      { name: '小数', pattern: '^-?\\d+(\\.\\d+)?$', sample: '3.14' },
      { name: '保留两位小数的金额', pattern: '^\\d+(\\.\\d{1,2})?$', sample: '19.90' },
      { name: '千分位金额', pattern: '^-?\\d{1,3}(,\\d{3})*(\\.\\d{1,2})?$', sample: '1,234,567.89' },
      { name: '百分比', pattern: '^-?\\d+(\\.\\d+)?%$', sample: '85.5%' },
      { name: '科学计数法', pattern: '^-?\\d+(\\.\\d+)?[eE][+-]?\\d+$', sample: '1.2e-3' },
    ],
  },
  {
    group: '文本',
    items: [
      { name: '中文字符', pattern: '[\\u4e00-\\u9fa5]', sample: '中文' },
      { name: '双字节字符（含中文标点）', pattern: '[^\\x00-\\xff]', sample: '，。' },
      { name: '英文单词', pattern: '\\b[A-Za-z]+\\b', sample: 'hello world' },
      { name: '全角字符', pattern: '[\\uff00-\\uffef]', sample: '！＠＃' },
      { name: '空白行', pattern: '^\\s*$', sample: '   ' },
      { name: '连续重复字符', pattern: '(.)\\1{2,}', sample: 'aaa' },
      { name: 'HTML 标签', pattern: '<\\/?[a-zA-Z][^>]*>', sample: '<div class="x">' },
      { name: '首尾空白', pattern: '^\\s+|\\s+$', sample: '  hi  ' },
    ],
  },
  {
    group: '账号与身份',
    items: [
      { name: '手机号（中国大陆）', pattern: '^1[3-9]\\d{9}$', sample: '13800138000' },
      { name: '身份证（18 位）', pattern: '^\\d{17}[\\dXx]$', sample: '110101199003077213' },
      { name: '护照（简）', pattern: '^[A-Za-z]\\d{8}$', sample: 'E12345678' },
      { name: 'QQ 号', pattern: '^[1-9]\\d{4,10}$', sample: '10001' },
      { name: '微信号', pattern: '^[a-zA-Z][-_a-zA-Z0-9]{5,19}$', sample: 'wxid_abc123' },
      { name: '邮政编码（中国）', pattern: '^[1-9]\\d{5}$', sample: '100000' },
      { name: '车牌号', pattern: '^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-HJ-NP-Z][A-HJ-NP-Z0-9]{5}$', sample: '京A12345' },
    ],
  },
  {
    group: '网络',
    items: [
      { name: 'IPv4', pattern: '^((25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]?\\d)\\.){3}(25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]?\\d)$', sample: '192.168.1.1' },
      { name: '端口号', pattern: '^([1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$', sample: '8080' },
      { name: '域名', pattern: '^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}$', sample: 'example.com' },
      { name: 'URL', pattern: '^https?:\\/\\/[^\\s]+$', sample: 'https://example.com/a?b=1' },
      { name: 'MAC 地址', pattern: '^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$', sample: 'A0:B1:C2:D3:E4:F5' },
      { name: 'Hex 颜色值', pattern: '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$', sample: '#3F7A6E' },
      { name: 'UUID', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$', sample: '550e8400-e29b-41d4-a716-446655440000' },
    ],
  },
  {
    group: '日期时间',
    items: [
      { name: 'YYYY-MM-DD', pattern: '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$', sample: '2026-09-20' },
      { name: 'HH:mm:ss', pattern: '^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$', sample: '15:53:00' },
      { name: '10 位时间戳', pattern: '^\\d{10}$', sample: '1789000000' },
      { name: '13 位时间戳', pattern: '^\\d{13}$', sample: '1789000000000' },
      { name: '中文日期', pattern: '^\\d{4}年\\d{1,2}月\\d{1,2}日$', sample: '2026年9月20日' },
    ],
  },
  {
    group: '编程常用',
    items: [
      { name: '变量名（驼峰/下划线）', pattern: '^[a-zA-Z_$][a-zA-Z0-9_$]*$', sample: 'userName_1' },
      { name: '十六进制数', pattern: '^(0[xX])?[0-9a-fA-F]+$', sample: '0xFF00' },
      { name: 'Base64', pattern: '^[A-Za-z0-9+/]+={0,2}$', sample: 'aGVsbG8=' },
      { name: '强密码（≥8 位含大小写数字）', pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)[^\\s]{8,}$', sample: 'Abcd1234' },
      { name: '行注释（// 或 #）', pattern: '^\\s*(//|#).*', sample: '// note' },
      { name: '语义化版本号', pattern: '^\\d+\\.\\d+\\.\\d+(-[0-9A-Za-z.-]+)?$', sample: '1.2.3-beta.1' },
    ],
  },
]

/**
 * 执行匹配
 * @returns { match: boolean, list: [{text, index, groups}], error }
 */
export function runRegex(pattern, flags, text) {
  if (!pattern) return { match: false, list: [], error: '' }
  let re
  try {
    re = new RegExp(pattern, flags || 'g')
  } catch (e) {
    return { match: false, list: [], error: e && e.message ? e.message : '正则表达式有误' }
  }
  const src = String(text || '')
  if (!src) return { match: false, list: [], error: '' }

  const global = re.global
  const list = []
  if (!global) {
    const m = src.match(re)
    if (m) {
      list.push({ text: m[0], index: m.index, groups: m.slice(1) })
    }
  } else {
    let m
    let guard = 0
    re.lastIndex = 0
    while ((m = re.exec(src)) !== null && guard++ < 2000) {
      list.push({ text: m[0], index: m.index, groups: m.slice(1) })
      if (m[0] === '') re.lastIndex++
    }
  }
  return { match: list.length > 0, list, error: '' }
}

/** 高亮：把匹配到的片段切成 [{text, hit}] */
export function highlight(text, list) {
  const src = String(text || '')
  if (!list || !list.length) return [{ text: src, hit: false }]
  const parts = []
  let cursor = 0
  const sorted = list.slice().sort((a, b) => a.index - b.index)
  for (const m of sorted) {
    if (m.index < cursor) continue
    if (m.index > cursor) parts.push({ text: src.slice(cursor, m.index), hit: false })
    parts.push({ text: src.slice(m.index, m.index + m.text.length), hit: true })
    cursor = m.index + m.text.length
  }
  if (cursor < src.length) parts.push({ text: src.slice(cursor), hit: false })
  return parts
}
