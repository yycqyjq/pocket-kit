/**
 * 一维条码：Code 39 / Code 128 / EAN-13 / EAN-8 / UPC-A。
 *
 * 位模表不是凭记忆抄的：Code 39 的 43 个字符逐个用外部解码器（zbar）反向标定出来，
 * 再要求「同一张表把整串字符画回去仍能被原样读回」；EAN 系的 L 码由解码器逐位确认，
 * G / R 码用镜像关系推导后同样过了解码器。表本身对不对，scripts/selftest/barcode.test.mjs
 * 里那一节会在装了 zbarimg 的机器上再跑一遍。Code 128 的 107 个图案同样是标定的产物：
 * 用校验位的同余式反推每个值（只放一个数据符号时 check = (起始值 + 值) mod 103），再用
 * A／B／C 三组 96／96／100 个用例让解码器复核。
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
 * Code 128：一个符号 = 6 个元素（条空交替，条开始）、4 以内的宽度、合计 11 模块。
 * 值 0..102 各一个图案，103/104/105 是三个起始码，106 是 7 元素 13 模块的终止符。
 * 三套码表（A／B／C）共用同一批图案，只是值的解释不同：
 *   A：0..63 → ASCII 32..95，64..95 → ASCII 0..31（控制字符只有这套有）
 *   B：0..95 → ASCII 32..127
 *   C：0..99 → 两位数字，所以纯数字用这套能省一半符号
 * 99 = 转 C，100 = 转 B，101 = 转 A（B／C 里），102 = SHIFT（这里不用）。
 * ------------------------------------------------------------------ */

/** 下标即值，图案为 6 个元素的宽度 */
export const C128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222',
  '122213', '122312', '132212', '221213', '221312', '231212',
  '112232', '122132', '122231', '113222', '123122', '123221',
  '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321',
  '112313', '132113', '132311', '211313', '231113', '231311',
  '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131',
  '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124',
  '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111',
  '241112', '134111', '111242', '121142', '121241', '114212',
  '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141',
  '411131',
]

export const C128_START = { A: '211412', B: '211214', C: '211232' }
export const C128_STOP = '2331112'

const C128_VALUE = {}
C128_PATTERNS.forEach((p, v) => {
  C128_VALUE[p] = v
})
C128_VALUE[C128_START.A] = 103
C128_VALUE[C128_START.B] = 104
C128_VALUE[C128_START.C] = 105
C128_VALUE[C128_STOP] = 106

const C128_SWITCH = { toA: 101, toB: 100, toC: 99 }

/** 宽度串 → 模块串：元素按 条-空-条-… 交替，条为 1 */
function widthsToBits(widths) {
  let s = ''
  for (let i = 0; i < widths.length; i++) s += (i % 2 === 0 ? '1' : '0').repeat(Number(widths[i]))
  return s
}

/** Code 128 的校验和：起始码值算第 0 位，其后每个值乘以其序号，mod 103 */
export function c128Check(startValue, values) {
  let sum = startValue
  for (let i = 0; i < values.length; i++) sum += (i + 1) * values[i]
  return sum % 103
}

/**
 * 文本 → 值序列。起始码按内容挑：纯数字且凑得成对走 C，首字符是控制符走 A，其余走 B；
 * 中途碰到足够长的连续数字才切 C（切出去再切回来都要符号位，太短的段不划算）。
 */
function c128Values(text) {
  const cs = []
  for (let i = 0; i < text.length; i++) cs.push(text.charCodeAt(i))
  const isD = (c) => c >= 48 && c <= 57
  const segs = []
  const allDigits = cs.every(isD)
  let start = 'B'
  if (allDigits && cs.length >= 2 && cs.length % 2 === 0) start = 'C'
  else if (cs[0] < 32) start = 'A'
  let set = start
  let i = 0
  // 奇数长度的纯数字：先把头一位留在 B 组，剩下的凑成对再切 C，省一次来回切
  if (start === 'B' && allDigits && cs.length >= 5) {
    segs.push({ kind: 'data', text: text[0], value: cs[0] - 32 })
    i = 1
  }
  while (i < cs.length) {
    const c = cs[i]
    if (set === 'C') {
      if (isD(c) && isD(cs[i + 1])) {
        const v = (c - 48) * 10 + (cs[i + 1] - 48)
        segs.push({ kind: 'data', text: text.slice(i, i + 2), value: v })
        i += 2
      } else {
        set = c < 32 ? 'A' : 'B'
        segs.push({ kind: 'switch', text: '', value: set === 'A' ? C128_SWITCH.toA : C128_SWITCH.toB })
      }
      continue
    }
    let run = 0
    while (isD(cs[i + run])) run++
    // 进 C 组要一个切换符号，出来还要一个（数字段没到末尾的话）：
    // 偶数段中间赚 2 位起才划算（≥6），紧接末尾只需进不出的话 4 位就赚
    const atEnd = i + run === cs.length
    const worth = run % 2 === 0 ? run >= 6 || (atEnd && run >= 4) : run >= 7 || (atEnd && run >= 5)
    if (worth) {
      set = 'C'
      segs.push({ kind: 'switch', text: '', value: C128_SWITCH.toC })
      continue
    }
    if (set === 'B' && c < 32) {
      set = 'A'
      segs.push({ kind: 'switch', text: '', value: C128_SWITCH.toA })
      continue
    }
    if (set === 'A' && c >= 96) {
      set = 'B'
      segs.push({ kind: 'switch', text: '', value: C128_SWITCH.toB })
      continue
    }
    const v = set === 'A' ? (c < 32 ? c + 64 : c - 32) : c - 32
    segs.push({ kind: 'data', text: text[i], value: v })
    i++
  }
  return { start, segs }
}

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
  code128: {
    name: 'Code 128',
    quiet: 10,
    build(payload) {
      const { start, segs } = c128Values(payload)
      const values = segs.map((s) => s.value)
      const check = c128Check(103 + 'ABC'.indexOf(start), values)
      const structure = [{ kind: 'start', text: 'START ' + start, bits: widthsToBits(C128_START[start]) }]
      for (const s of segs) {
        structure.push({
          kind: s.kind,
          text: s.kind === 'switch' ? '' : displayOf(s.text),
          bits: widthsToBits(C128_PATTERNS[s.value]),
        })
      }
      structure.push({ kind: 'check', text: String(check), bits: widthsToBits(C128_PATTERNS[check]) })
      structure.push({ kind: 'stop', text: 'STOP', bits: widthsToBits(C128_STOP) })
      return { bits: structure.map((s) => s.bits).join(''), structure }
    },
  },
}

/** 控制字符在结构表里显示成 Ctrl+X，不然页面上是个看不见的光标 */
function displayOf(ch) {
  const c = ch.charCodeAt(0)
  if (ch === '\n') return 'Ctrl+J ⏎'
  if (ch === '\t') return 'Ctrl+I ⇥'
  if (c < 32) return 'Ctrl+' + String.fromCharCode(c + 64)
  return ch
}

export const SYMS = ['code39', 'ean13', 'ean8', 'upca', 'code128'].map((key) => ({
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
  if (sym === 'code128') {
    const s = raw.replace(/\r\n?/g, '\n')
    if (!s.trim()) throw new Error('先输入要编码的内容')
    const bad = [
      ...new Set(
        [...s].filter((c) => {
          const n = c.charCodeAt(0)
          return n > 127 || (n < 32 && n !== 9 && n !== 10)
        })
      ),
    ]
    // 制表符与换行留出来，其余看不见又扫不出的控制符一律拦掉
    if (bad.length) {
      throw new Error(
        'Code 128 支持 ASCII 可打印字符加制表／换行，用不了的字符：' +
        bad.map((c) => '「U+' + c.charCodeAt(0).toString(16).toUpperCase() + '」').join(' ')
      )
    }
    if (s.length > 80) throw new Error('Code 128 这里截到 80 字符，现在 ' + s.length + ' 字符——太长可以先拆成几条')
    return s
  }
  const upper = raw.toUpperCase()
  if (!upper) throw new Error('先输入要编码的内容')
  const bad = [...new Set([...upper].filter((c) => CODE39_CHARS.indexOf(c) < 0))]
  if (bad.length) {
    throw new Error('Code 39 只支持 43 个字符，用不了的字符：' + bad.map((c) => '「' + c + '」').join(' '))
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
    if (cur && cur.on === on) {
      cur.len++
      cur.end++
    } else {
      cur = { on, len: 1, start: i, end: i + 1 }
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
  if (sym === 'code128') return c128ReadBack(modules)
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
  if (modules.slice(0, 3) !== GUARD_SIDE || modules.slice(-3) !== GUARD_SIDE) throw new Error('回读：两侧守卫位不对')
  let i = 3
  const digits = []
  let parStr = ''
  for (let p = 0; p < leftCount; p++) {
    const b = modules.slice(i, i + 7)
    const l = EAN_L.indexOf(b)
    if (l >= 0) {
      parStr += 'L'
      digits.push(String(l))
    } else {
      const g = EAN_G.indexOf(b)
      if (g < 0) throw new Error('回读：左半块 ' + b + ' 不在表里')
      parStr += 'G'
      digits.push(String(g))
    }
    i += 7
  }
  if (modules.slice(i, i + 5) !== GUARD_MID) throw new Error('回读：中间守卫位不对')
  i += 5
  while (i < modules.length - 3) {
    const b = modules.slice(i, i + 7)
    const r = EAN_R.indexOf(b)
    if (r < 0) throw new Error('回读：右半块 ' + b + ' 不在表里')
    digits.push(String(r))
    i += 7
  }
  if (i !== modules.length - 3) throw new Error('回读：模块总数对不上')
  if (sym === 'ean8') return digits.join('')
  // EAN-13 的首位不占模块，只体现在左半 6 位的 L/G 排列上
  const lead = EAN_PAR.indexOf(parStr)
  if (lead < 0) throw new Error('回读：左半的 L/G 排列 ' + parStr + ' 不在奇偶表里')
  const full = String(lead) + digits.join('')
  return sym === 'upca' ? full.slice(1) : full
}

/* ------------------------------------------------------------------ *
 *  Code 128 回读：先按 11 模块一切块查图案表还原值，再验校验和，最后按码集解释
 * ------------------------------------------------------------------ */

/** 取一个符号的元素宽度（els 个，条开头），返回宽度串如 '212222' */
function c128Widths(chunk, els) {
  const ws = []
  let at = 0
  for (let e = 0; e < els; e++) {
    let len = 1
    while (at + len < chunk.length && chunk[at + len] === chunk[at]) len++
    if (len > 4) throw new Error('回读：Code 128 有元素宽到 ' + len + ' 模块，超出 1..4')
    ws.push(len)
    at += len
  }
  if (at !== chunk.length) throw new Error('回读：Code 128 符号元素数或总宽不对')
  return ws.join('')
}

function c128ReadBack(modules) {
  if (modules.length < 11 * 3 + 13) throw new Error('回读：Code 128 太短，装不下起始码 + 校验 + 终止符')
  if ((modules.length - 13) % 11 !== 0) throw new Error('回读：Code 128 模块总数应为 11 × 符号数 + 终止符 13')
  const vals = []
  for (let at = 0; at + 11 <= modules.length - 13; at += 11) {
    const ws = c128Widths(modules.slice(at, at + 11), 6)
    const v = C128_VALUE[ws]
    if (v === undefined) throw new Error('回读：图案 ' + ws + ' 不在 Code 128 表里')
    vals.push(v)
  }
  if (c128Widths(modules.slice(modules.length - 13), 7) !== C128_STOP) throw new Error('回读：末段不是 Code 128 的终止符')
  const start = vals[0]
  if (start < 103) throw new Error('回读：首位不是起始码（应为 103/104/105，现在 ' + start + '）')
  const body = vals.slice(1, vals.length - 1)
  if (!body.length) throw new Error('回读：没有任何数据符号')
  const want = c128Check(start, body)
  if (vals[vals.length - 1] !== want) throw new Error('回读：校验和应为 ' + want + '，码上写的是 ' + vals[vals.length - 1])
  let set = 'ABC'[start - 103]
  let shift = null
  let out = ''
  for (const v of body) {
    const cur = shift || set
    shift = null
    if (v === 102) {
      shift = cur === 'A' ? 'B' : 'A'
      continue
    }
    if (cur !== 'C' && v === C128_SWITCH.toC) {
      set = 'C'
      continue
    }
    if (cur === 'A' && v === 100) {
      set = 'B'
      continue
    }
    if (cur === 'B' && v === 101) {
      set = 'A'
      continue
    }
    if (cur === 'C' && (v === 100 || v === 101)) {
      set = v === 100 ? 'B' : 'A'
      continue
    }
    if (cur === 'C') {
      if (v > 99) throw new Error('回读：C 组出现越界值 ' + v)
      out += String(v).padStart(2, '0')
      continue
    }
    if (v >= 96) throw new Error('回读：值 ' + v + ' 是 FNC 功能码，本工具不解释')
    if (cur === 'A') {
      if (v > 95) throw new Error('回读：A 组出现越界值 ' + v)
      out += String.fromCharCode(v < 64 ? v + 32 : v - 64)
      continue
    }
    out += String.fromCharCode(v + 32)
  }
  return out
}

/* ------------------------------------------------------------------ *
 *  给视图用的杂项
 * ------------------------------------------------------------------ */

export const BARCODE_SAMPLES = [
  { label: 'EAN-13 商品码', sym: 'ean13', value: '590123412345' },
  { label: 'EAN-8 短码', sym: 'ean8', value: '9638507' },
  { label: 'UPC-A', sym: 'upca', value: '03600029145' },
  { label: 'Code 39 编号', sym: 'code39', value: 'PK-2026-0921' },
  { label: 'Code 128 长文本', sym: 'code128', value: 'Pocket-2026#42' },
]

/** 结构摘要：宽窄元素各多少个，用于「体积」那张卡 */
export function widthProfile(modules) {
  const runs = runsOf(modules)
  const wide = runs.filter((r) => r.len >= 3).length
  return { runs: runs.length, wide, narrow: runs.length - wide }
}
