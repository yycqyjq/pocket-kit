/**
 * 一维条码：Code 39 / EAN-13 / EAN-8 / UPC-A。
 *
 * 位模表不是凭记忆抄的：Code 39 的 43 个字符逐个用外部解码器（zbar）反向标定出来，
 * 再要求「同一张表把整串字符画回去仍能被原样读回」；EAN 系的 L 码由解码器逐位确认，
 * G / R 码用镜像关系推导后同样过了解码器。表本身对不对，scripts/selftest/barcode.test.mjs
 * 里那一节会在装了 zbarimg 的机器上再跑一遍。
 */

/* ------------------------------------------------------------------ *
 * Code 39：每个字符 9 个元素（5 条 4 空，顺序固定为 条-空-条-…-条），
 * 其中 3 个宽元素（3 模块）、6 个窄元素（1 模块），字符之间插 1 模块白。
 * 值 = 9 位掩码，第 i 位为 1 表示第 i 个元素取宽。
 * ------------------------------------------------------------------ */

export const CODE39_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%'

/** 起始 / 终止符 *，它不是数据字符，只是分隔符；掩码自带左右对称 */
export const CODE39_DELIM = 82

const C39 = {
  '0': 88, '1': 265, '2': 268, '3': 13, '4': 280, '5': 25,
  '6': 28, '7': 328, '8': 73, '9': 76, A: 289, B: 292,
  C: 37, D: 304, E: 49, F: 52, G: 352, H: 97,
  I: 100, J: 112, K: 385, L: 388, M: 133, N: 400,
  O: 145, P: 148, Q: 448, R: 193, S: 196, T: 208,
  U: 259, V: 262, W: 7, X: 274, Y: 19, Z: 22,
  '-': 322, '.': 67, ' ': 70, $: 42, '/': 138, '+': 162,
  '%': 168,
}

/** 反查表：掩码 → 字符 */
const MASK39 = {}
for (const k of Object.keys(C39)) MASK39[C39[k]] = k

/* ------------------------------------------------------------------ *
 * EAN / UPC：一个数字 = 4 个元素、7 个模块。
 * L 码（左半，空开头）是基本盘；R 码 = L 码逐位取反（条开头）；
 * G 码 = R 码左右翻转。这三条关系本身就是解码器认账的前提。
 * ------------------------------------------------------------------ */

export const EAN_L = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
]

function invertBits(s) {
  let o = ''
  for (let i = 0; i < s.length; i++) o += s[i] === '1' ? '0' : '1'
  return o
}

function reverseBits(s) {
  return [...s].reverse().join('')
}

export const EAN_R = EAN_L.map(invertBits)
export const EAN_G = EAN_R.map(reverseBits)

/** 首位数字 → 左半 6 位各自用 L 还是 G。首位自己不占模块，全靠这行奇偶表达 */
export const EAN_PAR = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
]

const GUARD_SIDE = '101'
const GUARD_MID = '01010'

/* ------------------------------------------------------------------ *
 *  symbology 描述
 * ------------------------------------------------------------------ */

const SYM_SPEC = {
  code39: {
    name: 'Code 39',
    quiet: 10,
    /** 数据字符数 → 模块数：15 × (n+2) + (n+1) 个窄间隔 */
    build(payload) {
      const masks = [CODE39_DELIM]
      for (const ch of payload) masks.push(C39[ch])
      masks.push(CODE39_DELIM)
      const structure = []
      masks.forEach((mask, i) => {
        const bits = code39Bits(mask)
        structure.push({
          kind: i === 0 || i === masks.length - 1 ? 'delim' : 'data',
          text: i === 0 || i === masks.length - 1 ? '*' : payload[i - 1],
          bits,
        })
      })
      return { bits: structure.map((s) => s.bits).join('0'), structure }
    },
    charset: CODE39_CHARS,
    maxChars: Infinity,
  },
  ean13: {
    name: 'EAN-13',
    quiet: 11,
    digits: 13,
    build(payload) {
      // 首位只体现在左半的 L/G 排列里，自己不占模块
      return eanBuild(payload[0], payload.slice(1), 6, EAN_PAR[Number(payload[0])])
    },
  },
  ean8: {
    name: 'EAN-8',
    quiet: 7,
    digits: 8,
    build(payload) {
      return eanBuild('', payload, 4, 'LLLL')
    },
  },
  upca: {
    name: 'UPC-A',
    quiet: 11,
    digits: 12,
    build(payload) {
      // UPC-A 就是补了前导 0 的 EAN-13：首位 0 的奇偶行全是 L
      return eanBuild('0', payload, 6, EAN_PAR[0])
    },
  },
}

export const SYMS = ['code39', 'ean13', 'ean8', 'upca'].map((key) => ({
  key,
  name: SYM_SPEC[key].name,
  quiet: SYM_SPEC[key].quiet,
  digits: SYM_SPEC[key].digits || 0,
  charset: SYM_SPEC[key].charset || '',
}))

export const SYM_ITEMS = SYMS.map((s) => ({ key: s.key, name: s.name }))

function code39Bits(mask) {
  let s = ''
  for (let i = 0; i < 9; i++) {
    const w = mask & (1 << i) ? 3 : 1
    s += (i % 2 === 0 ? '1' : '0').repeat(w)
  }
  return s
}

/**
 * EAN 家族骨架：守卫 + 左半 + 中缝 + 右半 + 守卫。
 * leading 是只靠奇偶表达、不占模块的首位（EAN-13 / UPC-A 有，EAN-8 没有）；
 * body 为剩下的数字，前 leftCount 位走 L/G，其余走 R。
 */
function eanBuild(leading, body, leftCount, par) {
  const structure = [{ kind: 'guard', text: '', bits: GUARD_SIDE }]
  for (let i = 0; i < leftCount; i++) {
    const d = Number(body[i])
    const useL = par[i] === 'L'
    structure.push({ kind: useL ? 'data' : 'dataG', text: body[i], bits: useL ? EAN_L[d] : EAN_G[d] })
  }
  structure.push({ kind: 'guard', text: '', bits: GUARD_MID })
  for (let i = leftCount; i < body.length; i++) {
    const d = Number(body[i])
    structure.push({ kind: 'data', text: body[i], bits: EAN_R[d] })
  }
  structure.push({ kind: 'guard', text: '', bits: GUARD_SIDE })
  return { bits: structure.map((s) => s.bits).join(''), structure, leading }
}

/* ------------------------------------------------------------------ *
 *  校验位
 * ------------------------------------------------------------------ */

/** EAN-13 从第一位按 1,3,1,3… 加权；EAN-8 / UPC-A 从第一位按 3,1,3,1… 加权 */
export function checkDigit(body, sym) {
  const weights = sym === 'ean13' ? [1, 3] : [3, 1]
  let sum = 0
  for (let i = 0; i < body.length; i++) sum += Number(body[i]) * weights[i % 2]
  return String((10 - (sum % 10)) % 10)
}

/* ------------------------------------------------------------------ *
 *  归一化 + 校验输入
 * ------------------------------------------------------------------ */

/** 把用户输入整理成「载荷」（含校验位）。不合法就抛中文错误。 */
export function normalize(text, sym) {
  const spec = SYM_SPEC[sym]
  if (!spec) throw new Error('不认识这种条码：' + sym)
  const raw = String(text == null ? '' : text)
  if (spec.digits) {
    const digits = raw.replace(/[\s-]/g, '')
    if (!digits) throw new Error('先输入数字')
    if (!/^\d+$/.test(digits)) throw new Error(sym === 'upca' ? 'UPC-A 只能是数字' : '条码内容只能是数字')
    const need = spec.digits
    if (digits.length === need) {
      const expect = checkDigit(digits.slice(0, need - 1), sym)
      if (digits[need - 1] !== expect) {
        throw new Error('最后一位校验位应为 ' + expect + '，现在是 ' + digits[need - 1])
      }
      return digits
    }
    if (digits.length === need - 1) return digits + checkDigit(digits, sym)
    throw new Error(spec.name + ' 需要 ' + (need - 1) + ' 位数字（校验位自动补），现在 ' + digits.length + ' 位')
  }
  const upper = raw.toUpperCase()
  if (!upper) throw new Error('先输入要编码的内容')
  const bad = [...new Set([...upper].filter((c) => CODE39_CHARS.indexOf(c) < 0))]
  if (bad.length) {
    const hasLower = [...raw].some((c) => c >= 'a' && c <= 'z')
    throw new Error(
      'Code 39 只支持 43 个字符，' + (hasLower ? '且没有小写字母。' : '。') + '用不了的字符：' + bad.map((c) => '「' + c + '」').join(' ')
    )
  }
  if (upper.length > 40) throw new Error('Code 39 没有内置长度上限，但太长的码扫不出来，先截到 40 字符以内')
  return upper
}

/* ------------------------------------------------------------------ *
 *  主入口
 * ------------------------------------------------------------------ */

/** 把一段文本编成条码。返回模块串、分段结构和体积统计。 */
export function encode(text, sym) {
  const spec = SYM_SPEC[sym]
  const payload = normalize(text, sym)
  const built = spec.build(payload)
  const modules = built.bits
  const runs = runsOf(modules)
  const dark = modules.split('').reduce((n, c) => n + (c === '1' ? 1 : 0), 0)
  const structure = []
  let at = 0
  for (const s of built.structure) {
    structure.push({ ...s, from: at, to: at + s.bits.length })
    at += s.bits.length + (sym === 'code39' ? 1 : 0)
  }
  return {
    sym,
    name: spec.name,
    payload,
    /** 补出来的校验位；输入自带校验位时为 null */
    appended: spec.digits && String(text).replace(/[\s-]/g, '').length === spec.digits - 1
      ? payload[payload.length - 1]
      : null,
    modules,
    moduleCount: modules.length,
    quiet: spec.quiet,
    runs,
    structure,
    stats: {
      modules: modules.length,
      bars: runs.filter((r) => r.on).length,
      spaces: runs.filter((r) => !r.on).length,
      dark,
      light: modules.length - dark,
      ratio: Math.round((dark / modules.length) * 1000) / 10,
      chars: payload.length,
    },
  }
}

/** 模块串 → 连续同色的段，视图按段画条，比一模块一个节点省得多 */
export function runsOf(modules) {
  const runs = []
  let cur = null
  for (let i = 0; i < modules.length; i++) {
    const on = modules[i] === '1'
    if (cur && cur.on === on) cur.len++
    else {
      cur = { on, len: 1 }
      runs.push(cur)
    }
  }
  return runs
}

/* ------------------------------------------------------------------ *
 *  回读：从模块串重新解析出内容，和 encode 走完全不同的代码路径
 * ------------------------------------------------------------------ */

export function readBack(modules, sym) {
  const spec = SYM_SPEC[sym]
  if (!spec) throw new Error('不认识这种条码：' + sym)
  if (sym === 'code39') {
    // 每个字符 9 元素 = 3×3 + 6×1 = 15 模块，字符之间夹 1 模块白
    const groups = []
    for (let at = 0; at < modules.length; at += 16) groups.push(modules.slice(at, at + 15))
    if (modules.length !== groups.length * 15 + (groups.length - 1)) throw new Error('回读：模块总数对不上 15/字符 + 1/间隔')
    const out = []
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      if (g.length !== 15 || g[0] !== '1') throw new Error('回读：第 ' + (i + 1) + ' 段不是 15 模块的 Code 39 字符')
      let mask = 0
      let at = 0
      for (let e = 0; e < 9; e++) {
        let len = 1
        // 元素边界靠颜色变化定位：宽元素 3 模块、窄元素 1 模块
        while (at + len < g.length && g[at + len] === g[at]) len++
        if (len === 3) mask |= 1 << e
        else if (len !== 1) throw new Error('回读：元素宽度既不是 1 模块也不是 3 模块')
        at += len
      }
      if (at !== 15) throw new Error('回读：元素数不足 9 个')
      if (mask === CODE39_DELIM) {
        if (i !== 0 && i !== groups.length - 1) throw new Error('回读：分隔符出现在了中间')
        continue
      }
      const ch = MASK39[mask]
      if (!ch) throw new Error('回读：掩码 ' + mask + ' 不在表里')
      out.push(ch)
    }
    return out.join('')
  }
  const leftCount = sym === 'ean8' ? 4 : 6
  const blockCount = sym === 'ean8' ? 8 : 12
  if (modules.slice(0, 3) !== GUARD_SIDE || modules.slice(-3) !== GUARD_SIDE) throw new Error('回读：两侧守卫位不对')
  let i = 3
  const digits = []
  for (let p = 0; p < leftCount; p++) {
    const b = modules.slice(i, i + 7)
    const v = EAN_L.indexOf(b) >= 0 ? EAN_L.indexOf(b) : EAN_G.indexOf(b)
    if (v < 0) throw new Error('回读：左半块 ' + b + ' 不在表里')
    digits.push(String(v))
    i += 7
  }
  if (modules.slice(i, i + 5) !== GUARD_MID) throw new Error('回读：中间守卫位不对')
  i += 5
  for (let p = leftCount; p < blockCount; p++) {
    const b = modules.slice(i, i + 7)
    const v = EAN_R.indexOf(b)
    if (v < 0) throw new Error('回读：右半块 ' + b + ' 不在表里')
    digits.push(String(v))
    i += 7
  }
  if (i !== modules.length - 3) throw new Error('回读：模块总数对不上')
  return sym === 'upca' ? digits.slice(1).join('') : digits.join('')
}

/* ------------------------------------------------------------------ *
 *  给视图用的杂项
 * ------------------------------------------------------------------ */

export const BARCODE_SAMPLES = [
  { label: 'EAN-13 商品码', sym: 'ean13', value: '590123412345' },
  { label: 'EAN-8 短码', sym: 'ean8', value: '9638507' },
  { label: 'UPC-A', sym: 'upca', value: '03600029145' },
  { label: 'Code 39 编号', sym: 'code39', value: 'PK-2026-0921' },
]

/** 结构摘要：宽窄元素各多少个，用于「体积」那张卡 */
export function widthProfile(modules) {
  const runs = runsOf(modules)
  const wide = runs.filter((r) => r.len >= 3).length
  return { runs: runs.length, wide, narrow: runs.length - wide }
}
