/**
 * 盲文转换（英文一级盲文 / Grade 1）
 *
 * 点位编号：
 *   1 4
 *   2 5
 *   3 6
 *
 * 说明：这里实现的是**英文一级盲文**。
 * 中文盲文（现行盲文）是按拼音声母韵母设计的另一套体系，
 * 需要完整的拼音数据表，本工具不做——遇到中文会明确提示，而不是给个错结果。
 */

const D = (s) => s.split('').reduce((m, n) => m | (1 << (Number(n) - 1)), 0)

// 字母
const LETTERS = {
  a: D('1'), b: D('12'), c: D('14'), d: D('145'), e: D('15'), f: D('124'),
  g: D('1245'), h: D('125'), i: D('24'), j: D('245'), k: D('13'), l: D('123'),
  m: D('134'), n: D('1345'), o: D('135'), p: D('1234'), q: D('12345'), r: D('1235'),
  s: D('234'), t: D('2345'), u: D('136'), v: D('1236'), w: D('2456'), x: D('1346'),
  y: D('13456'), z: D('1356'),
}

// 数字：先打数字号（3456），然后 a-j 依次代表 1-0
const DIGITS = { 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'e', 6: 'f', 7: 'g', 8: 'h', 9: 'i', 0: 'j' }

// 标点（英美标准略有差异，这里取常用的一套）
const PUNCT = {
  ',': D('2'),
  ';': D('23'),
  ':': D('25'),
  '.': D('256'),
  '!': D('235'),
  '?': D('26'),
  "'": D('3'),
  '-': D('36'),
  '"': D('236'),
  '(': D('2356'),
  ')': D('2356'),
  '/': D('34'),
  '@': D('4'),
  '&': D('12346'),
  '*': D('16'),
  '+': D('346'),
  '=': D('123456'),
  $: D('1246'),
  '%': D('146'),
  _: D('456'),
  '~': D('46'),
}

const CAPITAL = D('6')
const NUMBER = D('3456')

// 反向表
const REV_LETTER = {}
Object.keys(LETTERS).forEach((k) => {
  REV_LETTER[LETTERS[k]] = k
})
const REV_DIGIT = {}
Object.keys(DIGITS).forEach((k) => {
  REV_DIGIT[LETTERS[DIGITS[k]]] = k
})
const REV_PUNCT = {}
Object.keys(PUNCT).forEach((k) => {
  if (REV_PUNCT[PUNCT[k]] === undefined) REV_PUNCT[PUNCT[k]] = k
})

/** 位掩码 → 盲文字符（Unicode U+2800 起） */
export function maskToChar(mask) {
  return String.fromCharCode(0x2800 + mask)
}

/** 盲文字符 → 位掩码 */
export function charToMask(ch) {
  const cp = ch.codePointAt(0)
  if (cp < 0x2800 || cp > 0x28ff) return -1
  return cp - 0x2800
}

/** 位掩码 → 点位写法，如 "1 3 4" */
export function maskToDots(mask) {
  const out = []
  for (let i = 1; i <= 6; i++) {
    if (mask & (1 << (i - 1))) out.push(String(i))
  }
  return out.join(' ')
}

const isCJK = (cp) => (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff)

/**
 * 文本 → 盲文
 * @returns {{ text, cells: Array, unsupported: string[] }}
 */
export function encodeBraille(input) {
  const s = String(input)
  if (!s) throw new Error('请输入要转换的文本')
  const cells = []
  const unsupported = []
  let numberMode = false

  for (const ch of s) {
    const cp = ch.codePointAt(0)

    if (isCJK(cp)) {
      unsupported.push(ch)
      cells.push({ raw: ch, mask: null, dots: '', label: '中文', note: '本工具不做中文盲文' })
      numberMode = false
      continue
    }

    if (ch === ' ' || ch === '\n' || ch === '\t') {
      cells.push({ raw: ch, mask: null, dots: '', label: ch === '\n' ? '换行' : '空格', note: '直接留空' })
      numberMode = false
      continue
    }

    if (/[0-9]/.test(ch)) {
      if (!numberMode) {
        cells.push({ raw: ch, mask: NUMBER, dots: maskToDots(NUMBER), label: '数字号', note: '声明「后面是数字」', marker: true })
        numberMode = true
      }
      const letter = DIGITS[ch]
      cells.push({ raw: ch, mask: LETTERS[letter], dots: maskToDots(LETTERS[letter]), label: ch, note: '数字 ' + ch + ' 用字母 ' + letter })
      continue
    }

    const lower = ch.toLowerCase()
    if (LETTERS[lower] !== undefined) {
      numberMode = false
      if (ch !== lower) {
        cells.push({ raw: ch, mask: CAPITAL, dots: maskToDots(CAPITAL), label: '大写号', note: '声明下一个字母大写', marker: true })
      }
      cells.push({
        raw: ch,
        mask: LETTERS[lower],
        dots: maskToDots(LETTERS[lower]),
        label: ch,
        note: ch !== lower ? '大写 ' + lower : '',
      })
      continue
    }

    if (PUNCT[ch] !== undefined) {
      numberMode = false
      cells.push({ raw: ch, mask: PUNCT[ch], dots: maskToDots(PUNCT[ch]), label: ch, note: '标点' })
      continue
    }

    numberMode = false
    unsupported.push(ch)
    cells.push({ raw: ch, mask: null, dots: '', label: ch, note: '没有对应的盲文单元' })
  }

  const text = cells.map((c) => (c.mask === null ? (c.raw === ' ' || c.raw === '\n' || c.raw === '\t' ? c.raw : '') : maskToChar(c.mask))).join('')

  return { text, cells: cells.filter((c) => c.mask !== null), unsupported }
}

/**
 * 盲文 → 文本
 */
export function decodeBraille(input) {
  const s = String(input)
  if (!s) throw new Error('请输入盲文')
  const out = []
  let numberMode = false
  let capitalNext = false
  let unknown = 0

  for (const ch of s) {
    if (ch === ' ' || ch === '\n' || ch === '\t') {
      out.push(ch)
      numberMode = false
      continue
    }
    const mask = charToMask(ch)
    if (mask < 0) {
      unknown++
      out.push('?')
      continue
    }
    if (mask === NUMBER) {
      numberMode = true
      continue
    }
    if (mask === CAPITAL) {
      capitalNext = true
      continue
    }
    if (numberMode && REV_DIGIT[mask] !== undefined) {
      out.push(REV_DIGIT[mask])
      continue
    }
    if (REV_LETTER[mask] !== undefined) {
      const l = REV_LETTER[mask]
      out.push(capitalNext ? l.toUpperCase() : l)
      capitalNext = false
      numberMode = false
      continue
    }
    if (REV_PUNCT[mask] !== undefined) {
      out.push(REV_PUNCT[mask])
      capitalNext = false
      numberMode = false
      continue
    }
    unknown++
    out.push('?')
  }

  return { text: out.join(''), unknown }
}

export const BRAILLE_SAMPLES = [
  { name: 'Hello', value: 'Hello' },
  { name: '小写字母表', value: 'abcdefghijklmnopqrstuvwxyz' },
  { name: '数字', value: '2026' },
  { name: '一句话', value: 'Hi, world!' },
  { name: '从盲文解码', value: '⠓⠑⠇⠇⠕' },
]
