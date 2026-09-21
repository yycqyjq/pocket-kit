/**
 * 数字转中文读法
 * toChineseUpper —— 财务大写（壹贰叁…），用于报销单、合同、发票
 * toChineseLower —— 日常小写读法（一二三…），用于金额播报、票据朗读
 *
 * 支持到「万亿」位（10^16 以内），超出会提示。
 */

const UPPER_DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
const LOWER_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
const UPPER_UNITS = ['', '拾', '佰', '仟']
const LOWER_UNITS = ['', '十', '百', '千']
const GROUPS = ['', '万', '亿', '万亿']

const MAX_GROUPS = GROUPS.length // 超出后不支持

/** 校验并拆解金额字符串 */
function parseAmount(input) {
  let s = String(input).trim().replace(/[,，\s￥¥元]/g, '')
  if (!s) throw new Error('请输入金额')
  let neg = false
  if (s[0] === '-') {
    neg = true
    s = s.slice(1)
  }
  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') {
    throw new Error('只能是数字，可以带小数点')
  }
  let [int = '', dec = ''] = s.split('.')
  int = int.replace(/^0+(?=\d)/, '')
  if (int === '') int = '0'

  // 四舍五入到分：取前两位作「分」，第三位决定是否进位
  const d3 = (dec + '000').slice(0, 3)
  let cents = Number(d3.slice(0, 2))
  if (Number(d3[2]) >= 5) cents += 1
  let carry = false
  if (cents >= 100) {
    cents -= 100
    carry = true
  }
  if (carry) {
    int = addOne(int)
  }

  const groups = []
  for (let i = int.length; i > 0; i -= 4) {
    groups.unshift(int.slice(Math.max(0, i - 4), i))
  }
  if (groups.length > MAX_GROUPS) {
    throw new Error('数值过大，本工具支持到「万亿」位')
  }
  return {
    neg,
    groups,
    jiao: Math.floor(cents / 10),
    fen: cents % 10,
    intIsZero: !/[1-9]/.test(int),
  }
}

function addOne(intStr) {
  const digits = intStr.split('')
  let i = digits.length - 1
  while (i >= 0) {
    if (digits[i] === '9') {
      digits[i] = '0'
      i--
    } else {
      digits[i] = String(Number(digits[i]) + 1)
      break
    }
  }
  if (i < 0) digits.unshift('1')
  return digits.join('')
}

/** 四位一组转中文（组内零合并，且不留尾零） */
function groupToChinese(group, digits, units) {
  const g = group.padStart(4, '0')
  let out = ''
  let pendingZero = false
  for (let i = 0; i < 4; i++) {
    const d = Number(g[i])
    const unit = units[3 - i]
    if (d === 0) {
      if (out) pendingZero = true
    } else {
      if (pendingZero) out += digits[0]
      out += digits[d] + unit
      pendingZero = false
    }
  }
  return out
}

function intToChinese(intPart, digits, units) {
  const s = String(intPart)
  if (!/[1-9]/.test(s)) return { text: digits[0], isZero: true }

  const groups = []
  for (let i = s.length; i > 0; i -= 4) {
    groups.unshift(s.slice(Math.max(0, i - 4), i))
  }

  let out = ''
  let emitted = false
  for (let i = 0; i < groups.length; i++) {
    const gIndex = groups.length - 1 - i
    const g = groups[i]
    if (!/[1-9]/.test(g)) continue // 整组为零，跳过（零会在下一组补）
    let part = groupToChinese(g, digits, units)
    // 已有更高位输出，且本组四位里最高位是 0，说明中间断了档，要补「零」
    // 例：10001 → 壹万【零】壹
    if (emitted && g.padStart(4, '0')[0] === '0') part = digits[0] + part
    out += part + (GROUPS[gIndex] || '')
    emitted = true
  }
  return { text: out, isZero: false }
}

/** 财务大写，返回「壹佰贰拾元叁角肆分」这类 */
export function toChineseUpper(input) {
  const a = parseAmount(input)
  const { text } = intToChinese(a.groups.join(''), UPPER_DIGITS, UPPER_UNITS)
  let out = ''
  if (a.intIsZero && !a.jiao && !a.fen) {
    return (a.neg ? '负' : '') + '零元整'
  }
  if (!a.intIsZero) out += text + '元'
  else if (a.jiao || a.fen) out += '零元'
  if (!a.jiao && !a.fen) {
    out += '整'
  } else {
    if (a.jiao) out += UPPER_DIGITS[a.jiao] + '角'
    else if (a.fen && !a.intIsZero) out += '零'
    if (a.fen) out += UPPER_DIGITS[a.fen] + '分'
  }
  return (a.neg ? '负' : '') + out
}

/** 日常小写读法 */
export function toChineseLower(input) {
  const a = parseAmount(input)
  const { text, isZero } = intToChinese(a.groups.join(''), LOWER_DIGITS, LOWER_UNITS)
  // 「一十」在日常读法里就是「十」
  const tidy = (t) => t.replace(/^一十/, '十')
  let out = ''
  if (a.intIsZero && !a.jiao && !a.fen) return (a.neg ? '负' : '') + '零'
  if (!a.intIsZero) out += tidy(text) + '元'
  else if (a.jiao || a.fen) out += '零元'
  if (a.jiao) out += LOWER_DIGITS[a.jiao] + '角'
  if (a.fen) out += LOWER_DIGITS[a.fen] + '分'
  if (!a.jiao && !a.fen) out += '整'
  return (a.neg ? '负' : '') + out
}

/** 纯整数转中文（用于非金额场景，如页码、序号） */
export function numberToChinese(input, upper) {
  const digits = upper ? UPPER_DIGITS : LOWER_DIGITS
  const units = upper ? UPPER_UNITS : LOWER_UNITS
  let s = String(input).trim()
  if (!/^-?\d+$/.test(s)) throw new Error('请输入整数')
  const neg = s[0] === '-'
  if (neg) s = s.slice(1)
  s = s.replace(/^0+(?=\d)/, '')
  const { text } = intToChinese(s, digits, units)
  const t = upper ? text : text.replace(/^一十/, '十')
  return (neg ? '负' : '') + t
}
