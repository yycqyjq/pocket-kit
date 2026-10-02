/**
 * 各类常见校验，每个校验器返回 { ok, tip, extra? }
 */
import { specialForIp, parseIpv4, looksLikeIpv4 } from './ip'

/* ---------------- 手机号 ---------------- */
const PHONE_PREFIX = /^1[3-9]\d{9}$/

export function checkPhone(v) {
  const s = String(v).replace(/[\s-]/g, '')
  if (!s) return { ok: false, tip: '请输入手机号' }
  if (!/^\d+$/.test(s)) return { ok: false, tip: '只能包含数字' }
  if (s.length !== 11) return { ok: false, tip: '长度应为 11 位，当前 ' + s.length + ' 位' }
  if (s[0] !== '1') return { ok: false, tip: '应以 1 开头' }
  if (!PHONE_PREFIX.test(s)) return { ok: false, tip: '号段不存在或不是常见号段' }
  // 只报号段，不报运营商。号段↔运营商要一张按三位号段维护的表，而且工信部分配会变；
  // 离线凭第二位猜会把 138 报成「联通/电信」这类错话直接印在界面上。
  return { ok: true, tip: '格式正确', extra: { 号段: s.slice(0, 3) } }
}

/* ---------------- 身份证（18 位） ---------------- */
const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const ID_CHECK = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']

export function checkIdCard(v) {
  const s = String(v).trim().toUpperCase()
  if (!s) return { ok: false, tip: '请输入身份证号' }
  if (s.length !== 18) return { ok: false, tip: '应为 18 位，当前 ' + s.length + ' 位' }
  if (!/^\d{17}[\dX]$/.test(s)) return { ok: false, tip: '格式应为 17 位数字 + 数字或 X' }

  const body = s.slice(0, 17)
  let sum = 0
  for (let i = 0; i < 17; i++) sum += Number(body[i]) * ID_WEIGHTS[i]
  const expect = ID_CHECK[sum % 11]
  if (expect !== s[17]) {
    return { ok: false, tip: '校验位不匹配，应为 ' + expect + '，实际为 ' + s[17] }
  }

  const year = Number(s.slice(6, 10))
  const month = Number(s.slice(10, 12))
  const day = Number(s.slice(12, 14))
  if (year < 1900) return { ok: false, tip: '出生年份不合理' }
  if (month < 1 || month > 12) return { ok: false, tip: '出生月份不合理' }
  const maxDay = new Date(year, month, 0).getDate()
  if (day < 1 || day > maxDay) return { ok: false, tip: '出生日期不合理' }

  const seq = Number(s.slice(14, 17))
  const gender = seq % 2 === 1 ? '男' : '女'
  const b = new Date(year, month - 1, day)
  // 原来只卡「年份不超过今年」，于是今年 12 月这种还没到的日子照样通过，
  // 下面算出来的年龄是负数，界面上印着「-1 岁」。按整天比，今天出生算 0 岁。
  const n = new Date()
  const todayStart = new Date(n.getFullYear(), n.getMonth(), n.getDate())
  if (b.getTime() > todayStart.getTime()) return { ok: false, tip: '出生日期还在未来' }

  let age = n.getFullYear() - b.getFullYear()
  const dm = n.getMonth() - b.getMonth()
  if (dm < 0 || (dm === 0 && n.getDate() < b.getDate())) age--

  return {
    ok: true,
    tip: '校验通过',
    extra: {
      出生日期: year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'),
      性别: gender,
      年龄: age + ' 岁',
      顺序码: s.slice(14, 17),
      校验位: s[17],
      归属地码: s.slice(0, 6),
    },
  }
}

/* ---------------- 银行卡（Luhn） ---------------- */
const BIN_MAP = [
  ['621700', '建设银行'], ['622700', '建设银行'], ['436742', '建设银行'],
  ['622202', '工商银行'], ['622200', '工商银行'], ['955880', '工商银行'],
  ['621661', '中国银行'], ['601382', '中国银行'],
  ['622848', '农业银行'], ['95599', '农业银行'],
  ['622588', '招商银行'], ['622575', '招商银行'], ['356885', '招商银行'],
  ['622260', '交通银行'], ['622250', '交通银行'],
  ['622155', '中信银行'], ['622690', '中信银行'],
  ['622600', '民生银行'], ['622615', '民生银行'],
  ['622521', '浦发银行'], ['622500', '浦发银行'],
  ['622908', '兴业银行'], ['622909', '兴业银行'],
  ['622422', '光大银行'], ['620535', '光大银行'],
  ['622188', '邮储银行'], ['955100', '邮储银行'],
  ['622126', '银联'], ['620000', '银联'],
]

function luhn(s) {
  let sum = 0
  let alt = false
  for (let i = s.length - 1; i >= 0; i--) {
    let n = Number(s[i])
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

export function checkBankCard(v) {
  const s = String(v).replace(/[\s-]/g, '')
  if (!s) return { ok: false, tip: '请输入银行卡号' }
  if (!/^\d+$/.test(s)) return { ok: false, tip: '只能包含数字' }
  if (s.length < 12 || s.length > 19) return { ok: false, tip: '长度通常在 12-19 位之间' }
  if (!luhn(s)) return { ok: false, tip: 'Luhn 校验未通过' }

  let bank = '未识别'
  for (const [bin, name] of BIN_MAP) {
    if (s.indexOf(bin) === 0) {
      bank = name
      break
    }
  }
  // 卡组织粗判
  let org = '未知'
  if (/^62/.test(s)) org = '银联'
  else if (/^4/.test(s)) org = 'Visa'
  else if (/^5[1-5]/.test(s)) org = 'MasterCard'
  else if (/^3[47]/.test(s)) org = 'American Express'
  else if (/^35/.test(s)) org = 'JCB'

  return {
    ok: true,
    tip: '校验通过',
    extra: { 归属行: bank, 卡组织: org, 卡号长度: s.length + ' 位' },
  }
}

/* ---------------- 其他 ---------------- */

/** 域名标签：字母数字开头、字母数字结尾，连字符只能夹在中间，最后一段只许字母。
 *  邮箱和网址共用这一条——原来两边各写一遍，`-abc.com` 这种两边都能过。 */
function isDomain(s) {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/.test(s)
}

export function checkEmail(v) {
  const s = String(v).trim()
  if (!s) return { ok: false, tip: '请输入邮箱' }
  if (s.length > 254) return { ok: false, tip: '过长' }
  const at = s.lastIndexOf('@')
  if (at <= 0) return { ok: false, tip: '格式不正确' }
  const local = s.slice(0, at)
  const domain = s.slice(at + 1)
  if (!/^[A-Za-z0-9._%+-]+$/.test(local)) return { ok: false, tip: '用户名只能含字母、数字和 . _ % + -' }
  if (local.length > 64) return { ok: false, tip: '用户名最长 64 个字符，当前 ' + local.length + ' 个' }
  // 点必须夹在字符中间：首尾的点、连续的点都不是合法用户名，真实邮件系统会退信
  if (/^\./.test(local) || /\.$/.test(local) || /\.\./.test(local)) return { ok: false, tip: '用户名里的点不能在首尾或连续' }
  if (!isDomain(domain)) return { ok: false, tip: '域名格式不正确' }
  return { ok: true, tip: '格式正确', extra: { 用户名: local, 域名: domain } }
}

export function checkUrl(v) {
  const s = String(v).trim()
  if (!s) return { ok: false, tip: '请输入网址' }
  if (!/^https?:\/\//i.test(s)) return { ok: false, tip: '建议以 http:// 或 https:// 开头' }
  // 主机位允许方括号 IPv6：原来 [^\s/:?#]+ 在第一个冒号就停，整截 [: 一路漏到路径上
  const re = /^https?:\/\/(\[[^\]]*\]|[^\s/:?#]+)(:[^\s/?#]*)?([^\s?#]*)(\?[^\s#]*)?(#\S*)?$/i
  const m = s.match(re)
  if (!m) return { ok: false, tip: '格式不正确' }
  const host = m[1]
  // 端口原来只按「有冒号有数字」放过：:0 与 :99999 印成格式正确；而 :abc 连冒号带字母
  // 整段不匹配、全落进路径，校验台印「格式正确」，拆解页同一串却在抛「不是端口号」——两页结论相反。
  // 现在冒号一旦出现就只许是端口：先看是不是数字，再看位数，最后才看范围，
  // 报错点名用户写的原文（000080 不许印成 80），三段判据与 url.js 逐字同一句话。
  if (m[2] !== undefined) {
    const raw = m[2].slice(1)
    // 空端口（a.com:/x）两页都按「没写端口」收，只是别把那个冒号漏进路径
    if (raw !== '') {
      if (!/^\d+$/.test(raw)) return { ok: false, tip: '「' + raw + '」不是端口号，冒号后面写数字，例如 :8080' }
      // 位数先于范围：5 位以上连 Number 都不可靠，别拿换算后的数去报错
      if (raw.length > 5) return { ok: false, tip: '端口最多 5 位数字，你写的是 ' + raw }
      const n = Number(raw)
      if (n < 1 || n > 65535) return { ok: false, tip: '端口应在 1-65535 之间，当前 ' + raw }
    }
  }
  if (looksLikeIpv4(host)) {
    // 主机写成 IP 时按 ip.js 那一份四段判据走（含前导 0），别再各判各的
    const r = parseIpv4(host)
    if (!r.ok) return r
  } else if (host !== 'localhost' && !isDomain(host)) {
    return { ok: false, tip: '域名格式不正确' }
  }
  // 协议一定存在：上面已经要求整串以 http(s):// 开头
  return {
    ok: true,
    tip: '格式正确',
    extra: { 协议: s.slice(0, s.indexOf('://')), 主机: host, 端口: m[2] && m[2].length > 1 ? m[2] : '默认', 路径: m[3] || '/' },
  }
}

export function checkIPv4(v) {
  const s = String(v).trim()
  if (!s) return { ok: false, tip: '请输入 IP' }
  // 四段的判据（含前导 0）只在 ip.js 里有一份。原来这里另抄一遍，于是 010.1.1.1
  // 在校验台判不合法、在 IP 计算器被悄悄算成 10.1.1.1。
  const r = parseIpv4(s)
  if (!r.ok) return r
  // 网段分类同样只在 ip.js 那张表里维护；这里原来自己抄了一份首位判断，
  // 于是 0.0.0.0 和 100.64.x.x 这类都会被报成「公网地址」。
  const sp = specialForIp(s)
  return { ok: true, tip: '格式正确', extra: { 类型: sp ? sp.name : '公网地址' } }
}

export function checkMac(v) {
  const s = String(v).trim().replace(/[-:]/g, '')
  if (/^[0-9A-Fa-f]{12}$/.test(s)) {
    const upper = s.toUpperCase()
    const isMulticast = parseInt(upper.slice(0, 2), 16) & 1
    const isLocal = parseInt(upper.slice(0, 2), 16) & 2
    return {
      ok: true,
      tip: '格式正确',
      extra: {
        标准写法: upper.match(/.{2}/g).join(':'),
        类型: isMulticast ? '组播地址' : '单播地址',
        范围: isLocal ? '本地管理' : '全球唯一 (OUI)',
        厂商前缀: upper.slice(0, 6),
      },
    }
  }
  return { ok: false, tip: '应为 12 位十六进制，可用 - 或 : 分隔' }
}

export function checkImei(v) {
  const s = String(v).replace(/\s/g, '')
  if (!/^\d{15}$/.test(s)) return { ok: false, tip: 'IMEI 应为 15 位数字' }
  if (!luhn(s)) return { ok: false, tip: 'Luhn 校验未通过' }
  return {
    ok: true,
    tip: '校验通过',
    extra: { TAC: s.slice(0, 8), 序列号: s.slice(8, 14), 校验位: s[14] },
  }
}

const USCC_CHARS = '0123456789ABCDEFGHJKLMNPQRTUWXY'
const USCC_WEIGHTS = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28]

export function checkUSCC(v) {
  const s = String(v).trim().toUpperCase()
  if (s.length !== 18) return { ok: false, tip: '统一社会信用代码应为 18 位' }
  for (const c of s) {
    if (USCC_CHARS.indexOf(c) === -1) return { ok: false, tip: '包含非法字符 ' + c }
  }
  let sum = 0
  for (let i = 0; i < 17; i++) sum += USCC_CHARS.indexOf(s[i]) * USCC_WEIGHTS[i]
  const check = (31 - (sum % 31)) % 31
  if (USCC_CHARS[check] !== s[17]) {
    return { ok: false, tip: '校验位不匹配，应为 ' + USCC_CHARS[check] }
  }
  const deptMap = { '1': '机构编制', '5': '民政', '9': '工商', 'Y': '其他' }
  return {
    ok: true,
    tip: '校验通过',
    extra: {
      登记管理部门: deptMap[s[0]] || s[0],
      机构类别: s[1],
      行政区划: s.slice(2, 8),
      主体标识码: s.slice(8, 17),
    },
  }
}

/* 末位可以是挂/学/警：挂车、教练车、警车都是 7 位号牌。
   原来新能源那条里就写着这三个字，普通牌却不收，界面把真车牌判成「格式不正确」。 */
const PLATE_NORMAL = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-HJ-NP-Z][A-HJ-NP-Z0-9]{4}[A-HJ-NP-Z0-9挂学警]$/
const PLATE_NEW_ENERGY = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-HJ-NP-Z](([DF][A-HJ-NP-Z0-9]{4}[A-HJ-NP-Z0-9挂学警]?)|([A-HJ-NP-Z0-9]{5}[DF]))$/
const PLATE_TAIL = { 学: '教练车', 警: '警车', 挂: '挂车' }

export function checkPlate(v) {
  const s = String(v).trim().toUpperCase().replace(/\s/g, '')
  if (PLATE_NEW_ENERGY.test(s)) return { ok: true, tip: '新能源号牌格式正确', extra: { 类型: '新能源' } }
  if (PLATE_NORMAL.test(s)) {
    const kind = PLATE_TAIL[s[6]]
    return { ok: true, tip: '格式正确', extra: { 类型: kind ? kind + '号牌' : '普通号牌' } }
  }
  if (s.length !== 7) return { ok: false, tip: '普通号牌应为 7 位，新能源为 8 位' }
  return { ok: false, tip: '格式不正确' }
}

export function checkPostcode(v) {
  const s = String(v).trim()
  if (!/^\d{6}$/.test(s)) return { ok: false, tip: '邮政编码应为 6 位数字' }
  if (s[0] === '0') return { ok: false, tip: '首位不应为 0' }
  return { ok: true, tip: '格式正确', extra: { 邮区: s.slice(0, 2), 省份码: s.slice(0, 1) } }
}

export function checkChineseName(v) {
  const s = String(v).trim()
  if (!/^[\u4e00-\u9fa5·]{2,15}$/.test(s)) return { ok: false, tip: '应为 2-15 位中文，可含间隔号' }
  // 间隔号只用来在中文名里断词（买买提·阿吾江），出现在首尾或连着两个都不是姓名写法
  if (s.startsWith('·') || s.endsWith('·') || s.includes('··')) {
    return { ok: false, tip: '间隔号不能在首尾或连续' }
  }
  const extra = { 字数: [...s].length }
  if (['赵', '钱', '孙', '李', '周', '吴', '郑', '王', '冯', '陈', '褚', '卫', '蒋', '沈', '韩', '杨'].indexOf(s[0]) > -1) {
    extra.常见姓氏 = '是'
  }
  return { ok: true, tip: '格式正确', extra }
}

/** 校验器清单，供「校验台」使用
 *  placeholder 是输入框里的格式提示，sample 是一个确实能通过校验的示例值
 *  （示例值由脚本按各自的校验算法反推得出，不是随手编的）
 */
export const VALIDATORS = [
  { key: 'phone', name: '手机号', placeholder: '11 位，1 开头', sample: '13800138000', fn: checkPhone },
  { key: 'idcard', name: '身份证', placeholder: '18 位，末位可为 X', sample: '110101199003077213', fn: checkIdCard },
  { key: 'bank', name: '银行卡', placeholder: '12-19 位卡号', sample: '6222021234567890128', fn: checkBankCard },
  { key: 'email', name: '邮箱', placeholder: 'name@example.com', sample: 'hello@example.com', fn: checkEmail },
  { key: 'url', name: '网址', placeholder: 'https://example.com/path', sample: 'https://example.com/path?q=1', fn: checkUrl },
  { key: 'ipv4', name: 'IPv4', placeholder: '点分四段，每段 0-255', sample: '192.168.1.1', fn: checkIPv4 },
  { key: 'mac', name: 'MAC 地址', placeholder: '6 组两位十六进制', sample: 'A0:B1:C2:D3:E4:F5', fn: checkMac },
  { key: 'imei', name: 'IMEI', placeholder: '15 位数字', sample: '860123456789014', fn: checkImei },
  { key: 'uscc', name: '统一社会信用代码', placeholder: '18 位，不含 I O S V Z', sample: '91110108MA01ABCDEN', fn: checkUSCC },
  { key: 'plate', name: '车牌号', placeholder: '省份简称 + 字母数字', sample: '京A12345', fn: checkPlate },
  { key: 'postcode', name: '邮政编码', placeholder: '6 位数字，首位不为 0', sample: '100000', fn: checkPostcode },
  { key: 'name', name: '中文姓名', placeholder: '2-15 位中文', sample: '张三', fn: checkChineseName },
]

export function findValidator(key) {
  return VALIDATORS.find((v) => v.key === key) || VALIDATORS[0]
}
