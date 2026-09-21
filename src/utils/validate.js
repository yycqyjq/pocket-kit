/**
 * 各类常见校验，每个校验器返回 { ok, tip, extra? }
 */

/* ---------------- 手机号 ---------------- */
const PHONE_PREFIX = /^1[3-9]\d{9}$/

export function checkPhone(v) {
  const s = String(v).replace(/[\s-]/g, '')
  if (!s) return { ok: false, tip: '请输入手机号' }
  if (!/^\d+$/.test(s)) return { ok: false, tip: '只能包含数字' }
  if (s.length !== 11) return { ok: false, tip: '长度应为 11 位，当前 ' + s.length + ' 位' }
  if (s[0] !== '1') return { ok: false, tip: '应以 1 开头' }
  if (!PHONE_PREFIX.test(s)) return { ok: false, tip: '号段不存在或不是常见号段' }
  const carrier = { 3: '联通/电信', 4: '移动/联通', 5: '移动/联通/电信', 6: '联通/移动', 7: '移动/联通/电信', 8: '移动/联通', 9: '移动/联通' }[s[1]] || '未知'
  return { ok: true, tip: '格式正确', extra: { 号段: s.slice(0, 3), 运营商: carrier } }
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
  const nowYear = new Date().getFullYear()
  if (year < 1900 || year > nowYear) return { ok: false, tip: '出生年份不合理' }
  if (month < 1 || month > 12) return { ok: false, tip: '出生月份不合理' }
  const maxDay = new Date(year, month, 0).getDate()
  if (day < 1 || day > maxDay) return { ok: false, tip: '出生日期不合理' }

  const seq = Number(s.slice(14, 17))
  const gender = seq % 2 === 1 ? '男' : '女'
  const age = (() => {
    const b = new Date(year, month - 1, day)
    const n = new Date()
    let a = n.getFullYear() - b.getFullYear()
    const m = n.getMonth() - b.getMonth()
    if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--
    return a
  })()

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
  ['622588', '招商银行'],
  ['622260', '交通银行'],
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

export function checkEmail(v) {
  const s = String(v).trim()
  if (!s) return { ok: false, tip: '请输入邮箱' }
  const re = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/
  if (!re.test(s)) return { ok: false, tip: '格式不正确' }
  if (s.length > 254) return { ok: false, tip: '过长' }
  return { ok: true, tip: '格式正确', extra: { 用户名: s.split('@')[0], 域名: s.split('@')[1] } }
}

export function checkUrl(v) {
  const s = String(v).trim()
  if (!s) return { ok: false, tip: '请输入网址' }
  if (!/^https?:\/\//i.test(s)) return { ok: false, tip: '建议以 http:// 或 https:// 开头' }
  const re = /^https?:\/\/([^\s/:?#]+)(:\d+)?([^\s?#]*)(\?[^\s#]*)?(#\S*)?$/i
  const m = s.match(re)
  if (!m) return { ok: false, tip: '格式不正确' }
  const host = m[1]
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  if (isIp) {
    const parts = host.split('.').map(Number)
    if (parts.some((p) => p > 255)) return { ok: false, tip: 'IP 段超出 255' }
  } else if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(host) && host !== 'localhost') {
    return { ok: false, tip: '域名格式不正确' }
  }
  return {
    ok: true,
    tip: '格式正确',
    extra: { 协议: m[2 - 1] ? s.slice(0, s.indexOf('://')) : '', 主机: host, 端口: m[2] || '默认', 路径: m[3] || '/' },
  }
}

export function checkIPv4(v) {
  const s = String(v).trim()
  if (!s) return { ok: false, tip: '请输入 IP' }
  const parts = s.split('.')
  if (parts.length !== 4) return { ok: false, tip: '应为 4 段，当前 ' + parts.length + ' 段' }
  for (let i = 0; i < 4; i++) {
    if (!/^\d{1,3}$/.test(parts[i])) return { ok: false, tip: '第 ' + (i + 1) + ' 段不是数字' }
    const n = Number(parts[i])
    if (n > 255) return { ok: false, tip: '第 ' + (i + 1) + ' 段超出 255' }
    if (parts[i].length > 1 && parts[i][0] === '0') return { ok: false, tip: '第 ' + (i + 1) + ' 段不应有前导 0' }
  }
  const n = parts.map(Number)
  let type = '公网地址'
  if (n[0] === 10) type = '私有地址 (A 类)'
  else if (n[0] === 172 && n[1] >= 16 && n[1] <= 31) type = '私有地址 (B 类)'
  else if (n[0] === 192 && n[1] === 168) type = '私有地址 (C 类)'
  else if (n[0] === 127) type = '回环地址'
  else if (n[0] === 169 && n[1] === 254) type = '链路本地地址'
  else if (n[0] >= 224 && n[0] <= 239) type = '组播地址'
  else if (n[0] >= 240) type = '保留地址'
  return { ok: true, tip: '格式正确', extra: { 类型: type } }
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

export function checkPlate(v) {
  const s = String(v).trim().toUpperCase().replace(/\s/g, '')
  const normal = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-HJ-NP-Z][A-HJ-NP-Z0-9]{5}$/
  const newEnergy = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-HJ-NP-Z](([DF][A-HJ-NP-Z0-9]{4}[A-HJ-NP-Z0-9挂学警]?)|([A-HJ-NP-Z0-9]{5}[DF]))$/
  if (newEnergy.test(s)) return { ok: true, tip: '新能源号牌格式正确', extra: { 类型: '新能源' } }
  if (normal.test(s)) return { ok: true, tip: '格式正确', extra: { 类型: '普通号牌' } }
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
