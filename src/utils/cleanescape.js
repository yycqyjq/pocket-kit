/**
 * 文本清洗：把「看不见但会捣乱」的东西去掉
 * 典型场景：从终端、PDF、网页、聊天记录里复制出来的文本带了一堆隐形字符
 */

// ANSI 转义序列（颜色、光标移动等）
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g

// 零宽与双向控制字符
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff\u00ad]/g

// 控制字符（保留 \t \n \r）
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g

// 其他常见「伪空格」
const FAKE_SPACE = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g

export const OPTIONS = [
  { key: 'ansi', name: '去终端颜色码', desc: '把从终端复制的 \u001b[32m 这类转义序列删掉', default: true },
  { key: 'invisible', name: '去零宽字符', desc: '零宽空格、双向控制符、软连字符等看不见的字符', default: true },
  { key: 'control', name: '去控制字符', desc: '除换行与制表符之外的控制字符', default: true },
  { key: 'fakeSpace', name: '全角空格转半角', desc: '不换行空格、全角空格等统一成普通空格', default: true },
  { key: 'crlf', name: '换行统一成 LF', desc: 'Windows 的 CRLF 与老 Mac 的 CR 都转成 LF', default: false },
  { key: 'trimLine', name: '去行尾空白', desc: '每行末尾的空格与制表符', default: true },
  { key: 'collapseSpace', name: '合并连续空白', desc: '多个空格合成一个（不影响缩进以外的地方）', default: false },
  { key: 'dropBlank', name: '去空行', desc: '删掉不含内容的行', default: false },
]

function buildOpts(overrides) {
  const o = {}
  OPTIONS.forEach((x) => {
    o[x.key] = overrides && overrides[x.key] !== undefined ? overrides[x.key] : x.default
  })
  return o
}

/**
 * 清洗
 * @returns {{ text, report: Array<{name, count}>, before, after }}
 */
export function clean(input, overrides) {
  const o = buildOpts(overrides)
  let s = String(input)
  const before = s.length
  const report = []

  const countAndReplace = (name, re, replacement) => {
    const m = s.match(re)
    if (m && m.length) {
      report.push({ name, count: m.length })
      s = s.replace(re, replacement)
    }
  }

  if (o.ansi) countAndReplace('终端颜色码', ANSI, '')
  if (o.invisible) countAndReplace('零宽 / 不可见字符', INVISIBLE, '')
  if (o.control) countAndReplace('控制字符', CONTROL, '')
  if (o.fakeSpace) countAndReplace('伪空格（全角/不换行）', FAKE_SPACE, ' ')
  if (o.crlf) countAndReplace('换行符统一', /\r\n?/g, '\n')

  if (o.trimLine) {
    const m = s.match(/[ \t]+$/gm)
    if (m && m.length) {
      report.push({ name: '行尾空白', count: m.length })
      s = s.replace(/[ \t]+$/gm, '')
    }
  }
  if (o.collapseSpace) {
    const m = s.match(/[ \t]{2,}/g)
    if (m && m.length) {
      report.push({ name: '连续空白', count: m.length })
      s = s.replace(/[ \t]{2,}/g, ' ')
    }
  }
  if (o.dropBlank) {
    const lines = s.split('\n')
    const kept = lines.filter((l) => l.trim() !== '')
    if (kept.length !== lines.length) {
      report.push({ name: '空行', count: lines.length - kept.length })
      s = kept.join('\n')
    }
  }

  return { text: s, report, before, after: s.length }
}

/** 顺手给出「还剩下哪些不可见字符」的体检结果 */
export function scan(input) {
  const s = String(input)
  const found = []
  const add = (name, re, note) => {
    const m = s.match(re)
    if (m && m.length) found.push({ name, count: m.length, note })
  }
  add('终端颜色码', ANSI, '来自终端复制')
  add('零宽空格 / 连字', /[\u200b-\u200d]/g, '看不见，会导致比对不相等')
  add('双向控制符', /[\u202a-\u202e\u2066-\u2069]/g, '可能被用来伪装文件名或域名')
  add('BOM 字节顺序标记', /\ufeff/g, '文件开头常见的三字节')
  add('软连字符', /\u00ad/g, '排版用的隐形断字点')
  add('不换行空格 / 全角空格', /[\u00a0\u3000]/g, '长得像空格但不是空格')
  add('控制字符', CONTROL, '会破坏解析')
  add('制表符', /\t/g, '本身不是问题，但混用空格会错位')
  add('行尾空格', /[ \t]+$/gm, '一般无害，但 diff 时会显出来')
  return found
}

export const SCAN_NOTES = [
  '从终端、PDF、网页、聊天软件里复制出来的文本，经常夹带零宽字符与全角空格。',
  '零宽字符最常见的坑：两个字符串看起来一模一样，用 === 比对却不相等。',
  '双向控制符可以让「实际字符顺序」和「显示顺序」不一致，文件名伪装常用这招。',
  '先扫一遍再清洗，比直接清空干净——你能知道原文到底脏在哪。',
]

export const CLEAN_SAMPLE =
  '\u001b[32m✓\u001b[0m 构建完成\u200b\ufeff\n' +
  '  路径：/Users/me/项目　（此处有一个全角空格）   \n' +
  '\u00a0\n' +
  '\t结果：成功\u00ad'
