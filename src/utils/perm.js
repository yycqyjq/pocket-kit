/**
 * Linux 文件权限计算
 * 支持数字（755 / 0755 / 4755）与符号（rwxr-xr-x）两种输入
 */

const CLASSES = [
  { key: 'u', name: '属主', idx: 0 },
  { key: 'g', name: '同组', idx: 1 },
  { key: 'o', name: '其他人', idx: 2 },
]

const rwxToDigit = (s) => (s[0] === 'r' ? 4 : 0) + (s[1] === 'w' ? 2 : 0) + (s[2] === 'x' || s[2] === 's' || s[2] === 't' ? 1 : 0)

function digitToRwx(d, special) {
  const r = d & 4 ? 'r' : '-'
  const w = d & 2 ? 'w' : '-'
  let x = d & 1 ? 'x' : '-'
  if (special === 's') x = d & 1 ? 's' : 'S'
  if (special === 't') x = d & 1 ? 't' : 'T'
  return r + w + x
}

/**
 * @param {string} input 数字或符号写法
 */
export function parsePerm(input) {
  const s = String(input || '').trim()
  if (!s) throw new Error('请输入权限，例如 755 或 rwxr-xr-x')

  let special = 0
  let digits = [0, 0, 0]
  let symbolic = ''

  if (/^[0-7]{3,4}$/.test(s)) {
    const t = s.padStart(4, '0')
    special = Number(t[0])
    digits = [Number(t[1]), Number(t[2]), Number(t[3])]
    symbolic =
      digitToRwx(digits[0], special & 4 ? 's' : '') +
      digitToRwx(digits[1], special & 2 ? 's' : '') +
      digitToRwx(digits[2], special & 1 ? 't' : '')
  } else if (/^[-r][-w][-xsStT][-r][-w][-xsStT][-r][-w][-xsStT]$/.test(s)) {
    symbolic = s
    digits = [rwxToDigit(s.slice(0, 3)), rwxToDigit(s.slice(3, 6)), rwxToDigit(s.slice(6, 9))]
    if (s[2] === 's' || s[2] === 'S') special |= 4
    if (s[5] === 's' || s[5] === 'S') special |= 2
    if (s[8] === 't' || s[8] === 'T') special |= 1
  } else {
    if (/^[0-8]/.test(s)) throw new Error('八进制每一位只能是 0~7，「' + s + '」里有超过 7 的数字')
    throw new Error('认不出这个写法。数字用 3~4 位八进制（如 755、4755），符号用 9 位（如 rwxr-xr-x）')
  }

  const octal3 = digits.join('')
  const octal4 = String(special) + octal3

  const classes = CLASSES.map((c, i) => ({
    name: c.name,
    digit: digits[i],
    code: '0' + String(digits[i]),
    rwx: symbolic.slice(i * 3, i * 3 + 3),
    read: !!(digits[i] & 4),
    write: !!(digits[i] & 2),
    execute: !!(digits[i] & 1),
    text: [digits[i] & 4 ? '读' : null, digits[i] & 2 ? '写' : null, digits[i] & 1 ? '执行' : null]
      .filter(Boolean)
      .join('、') || '无',
  }))

  const specialBits = []
  if (special & 4) specialBits.push({ name: 'SUID', key: 'suid', note: '执行时以文件属主的身份运行', level: '注意' })
  if (special & 2) specialBits.push({ name: 'SGID', key: 'sgid', note: '执行时以文件属组的身份运行；用在目录上则新建文件继承属组', level: '注意' })
  if (special & 1) specialBits.push({ name: 'Sticky', key: 'sticky', note: '目录内的文件只有属主能删除（如 /tmp）', level: '正常' })

  // 安全性提示
  const warnings = []
  const u = digits[0]
  const g = digits[1]
  const o = digits[2]
  if (o & 2) warnings.push({ text: '其他人可写（o+w）', note: '任何用户都能改这个文件，通常不该这样' })
  if (u & 2 && g & 2 && o & 2) warnings.push({ text: '所有人都可写', note: '666 / 777 这类权限对服务来说很危险' })
  if ((special & 4) && (g & 2 || o & 2)) warnings.push({ text: 'SUID 且同组或其他人可写', note: '这是典型的提权漏洞组合，务必改掉' })
  if (octal3 === '777') warnings.push({ text: '777 全开', note: '调试临时用可以，生产环境不要留' })
  if (!(u & 4)) warnings.push({ text: '属主自己都不能读', note: '确认是有意为之吗？' })

  const level = warnings.length >= 2 ? 'bad' : warnings.length === 1 ? 'warn' : 'ok'

  return {
    input: s,
    octal3,
    octal4,
    symbolic,
    special,
    specialBits,
    classes,
    warnings,
    level,
    command: 'chmod ' + (special ? octal4 : octal3) + ' <文件>',
    recursive: '如需目录递归：chmod -R ' + (special ? octal4 : octal3) + ' <目录>',
    bitSum: digits.map((d) => d).join('+'),
  }
}

/** 常用权限速查 */
export const COMMON_PERMS = [
  { octal: '644', symbolic: 'rw-r--r--', use: '普通文件默认，谁都能读，只有属主能改' },
  { octal: '600', symbolic: 'rw-------', use: '私钥、密码文件，只有属主能看' },
  { octal: '755', symbolic: 'rwxr-xr-x', use: '可执行文件、目录默认' },
  { octal: '700', symbolic: 'rwx------', use: '私人目录，别人连进都进不去' },
  { octal: '775', symbolic: 'rwxrwxr-x', use: '团队共享目录' },
  { octal: '664', symbolic: 'rw-rw-r--', use: '团队共享文件' },
  { octal: '400', symbolic: 'r--------', use: '只读，连属主都不能改（需先 chmod 才能编辑）' },
  { octal: '444', symbolic: 'r--r--r--', use: '完全只读' },
  { octal: '777', symbolic: 'rwxrwxrwx', use: '全开，仅调试用，生产禁用' },
  { octal: '4755', symbolic: 'rwsr-xr-x', use: 'SUID 可执行文件（如 passwd）' },
  { octal: '1777', symbolic: 'rwxrwxrwt', use: '带 Sticky 的共享目录（如 /tmp）' },
  { octal: '2755', symbolic: 'rwxr-sr-x', use: 'SGID，目录内新文件继承属组' },
]
