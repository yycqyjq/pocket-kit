/**
 * 乱码恢复
 * 最常见的成因：**原始字节被当成了错误的编码去解释**。
 * 例如「随身」的 UTF-8 字节被当成 Latin-1 显示，就成了「éš?èº«」。
 *
 * 说明：这里主打「Latin-1 视角」这一类（覆盖现实中绝大多数乱码）。
 * 因为浏览器只能**解码** GBK/Big5，不能把它们编码回去，
 * 所以「GBK 字节被当成 UTF-8」这种反向情况无法可靠还原，遇到会说清楚而不是给个错答案。
 */

import { utf8Bytes, bytesUtf8 } from './base64'

/** 探测当前环境支持哪些解码器 */
export const SUPPORTED = (() => {
  const list = []
  const tryOne = (enc) => {
    try {
      new TextDecoder(enc)
      return true
    } catch (e) {
      return false
    }
  }
  ;[
    ['utf-8', 'UTF-8'],
    ['gbk', 'GBK / GB18030（简体）'],
    ['big5', 'Big5（繁体）'],
    ['shift_jis', 'Shift-JIS（日文）'],
    ['euc-kr', 'EUC-KR（韩文）'],
    ['windows-1252', 'Windows-1252（西欧）'],
    ['latin1', 'Latin-1 / ISO-8859-1'],
    ['utf-16le', 'UTF-16 LE'],
  ].forEach(([enc, name]) => {
    if (tryOne(enc)) list.push({ enc, name })
  })
  return list
})()

const decode = (bytes, enc) => {
  try {
    return new TextDecoder(enc, { fatal: false }).decode(Uint8Array.from(bytes))
  } catch (e) {
    return null
  }
}

/** 整串字符是否都在 0~255（说明它长得就像「字节被逐个当字符」） */
export function isByteLike(s) {
  const arr = [...String(s)]
  if (!arr.length) return false
  return arr.every((c) => c.codePointAt(0) < 256)
}

/** 把字符串按 Latin-1 拆回字节 */
export function toBytes(s) {
  return [...String(s)].map((c) => c.codePointAt(0) & 0xff)
}

/** 字节按 Latin-1 变成字符串 */
export function fromBytes(bytes) {
  return bytes.map((b) => String.fromCharCode(b & 0xff)).join('')
}

/** 给一段候选结果打分：汉字加分、替换字符与拉丁补充区扣分 */
export function score(text) {
  const arr = [...String(text)]
  if (!arr.length) return -1e9
  let s = 0
  for (const ch of arr) {
    const cp = ch.codePointAt(0)
    if (cp === 0xfffd) s -= 15
    else if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf)) s += 6
    else if (cp >= 0x3000 && cp <= 0x303f || cp >= 0xff00 && cp <= 0xffef) s += 3
    else if (cp >= 0x20 && cp < 0x7f) s += 1
    else if (cp === 0x0a || cp === 0x0d) s += 0.5
    else if (cp >= 0xa0 && cp <= 0xff) s -= 3
    else if (cp >= 0x80 && cp <= 0x9f) s -= 6
    else s -= 2
  }
  return s / arr.length
}

/**
 * 生成候选恢复结果
 * @returns {Array<{label, text, score, note, from, strong}>}
 */
export function recoverCandidates(input) {
  const s = String(input)
  const out = []
  const push = (label, text, note, from) => {
    if (text === null || text === undefined) return
    if (text === s && label !== '原样（未处理）') return
    if (out.some((x) => x.text === text)) return
    out.push({ label, text, score: score(text), note: note || '', from: from || '', strong: false })
  }

  push('原样（未处理）', s, '不做任何改动')

  const byteLike = isByteLike(s)

  // 路径一：把当前字符串当「字节的 Latin-1 呈现」，再按各种编码解码
  if (byteLike) {
    const bytes = toBytes(s)
    SUPPORTED.forEach(({ enc, name }) => {
      if (enc === 'latin1') return
      const t = decode(bytes, enc)
      if (t !== null) push('把内容当成 ' + name + ' 的字节来解', t, bytes.length + ' 个字节', enc)
    })

    // 多轮 UTF-8：有些乱码是「被解了两次」
    let cur = decode(bytes, 'utf-8')
    for (let round = 2; round <= 3 && cur && isByteLike(cur); round++) {
      const next = decode(toBytes(cur), 'utf-8')
      if (!next || next === cur) break
      cur = next
      push('连续解 ' + round + ' 次 UTF-8', cur, '多次编码错误叠加', 'utf-8')
    }
  }

  // 路径二：反向 —— 把当前文本的 UTF-8 字节「显示」出来
  const u8 = utf8Bytes(s)
  push('UTF-8 字节被当成 Latin-1 显示的样子', fromBytes(u8), '用来反推原始字节', 'reverse')
  if (SUPPORTED.some((x) => x.enc === 'gbk')) {
    const g = decode(u8, 'gbk')
    if (g) push('UTF-8 字节被当成 GBK 显示的样子', g, '常见于后端按 GBK 读 UTF-8 文件', 'reverse-gbk')
  }

  // 排序：
  // 1) UTF-8 解码且没有替换字符的候选优先——UTF-8 的字节结构是自校验的，
  //    四个字节正好能按 UTF-8 解通，基本就说明原始字节就是 UTF-8。
  //    （GBK 把 4 字节解成 2 个冷僻汉字的假结果，靠「类型加分」赢不过它，
  //     所以要用这条硬规则压住。）
  // 2) 其余按文本得分降序。
  out.forEach((x) => {
    x.strong = x.from === 'utf-8' && x.text.indexOf('\uFFFD') < 0 && x.text.trim() !== ''
  })
  out.sort((a, b) => {
    if (a.strong !== b.strong) return a.strong ? -1 : 1
    return b.score - a.score
  })

  out.forEach((x, i) => {
    x.rank = i + 1
    x.isBest = i === 0 && x.label !== '原样（未处理）'
  })
  return out
}

/** 最好的一条 */
export function best(input) {
  const list = recoverCandidates(input)
  return list.find((x) => x.isBest) || list[0]
}

/** 诊断：说明当前文本的构成 */
export function diagnose(input) {
  const s = String(input)
  const arr = [...s]
  const nonAscii = arr.filter((c) => c.codePointAt(0) > 127)
  const latinSupp = arr.filter((c) => {
    const cp = c.codePointAt(0)
    return (cp >= 0xa0 && cp <= 0xff) || (cp >= 0x80 && cp <= 0x9f)
  })
  const cjk = arr.filter((c) => {
    const cp = c.codePointAt(0)
    return (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf)
  })

  const notes = []
  if (!arr.length) notes.push('请输入内容')
  else if (!nonAscii.length) notes.push('全是 ASCII 字符，通常不需要恢复')
  else if (latinSupp.length / arr.length > 0.3) {
    notes.push('拉丁补充区字符占比很高，这是「字节被当成 Latin-1」的典型特征，恢复成功率较大')
  } else if (cjk.length / arr.length > 0.5) {
    notes.push('汉字占比很高，看起来是正常文本；如果语义不通，可能是「GBK 被当成 UTF-8」这类反向乱码，浏览器无法可靠还原')
  } else {
    notes.push('混合字符，建议直接看下面的候选结果')
  }
  return { byteLike: isByteLike(s), nonAscii: nonAscii.length, latinSupp: latinSupp.length, cjk: cjk.length, notes }
}

/**
 * 样例都用显式转义写，因为乱码里本来就夹着 U+00AD、U+0096 这类看不见的字符，
 * 直接写成可见字符会失真。
 * 例：'随身匣' 的 UTF-8 是 E9 9A 8F E8 BA AB E5 8C A3，
 *     逐个当 Latin-1 显示就是下面第一个样例。
 */
export const GARBLED_SAMPLES = [
  { name: '随身匣（UTF-8 被当 Latin-1）', value: '\u00e9\u009a\u008f\u00e8\u00ba\u00ab\u00e5\u008c\u00a3' },
  { name: '中文测试（同上）', value: '\u00e4\u00b8\u00ad\u00e6\u0096\u0087\u00e6\u00b5\u008b\u00e8\u00af\u0095' },
  { name: 'emoji 😀（同上）', value: '\u00f0\u009f\u0098\u0080' },
  { name: '已经是正常中文', value: '这是一段本来就正常的中文' },
]

export const GARBLED_NOTES = [
  '乱码的本质是「字节没变，但解释方式错了」——先弄清楚原始字节是什么，再换编码解一次就好。',
  '「用 UTF-8 保存、用 GBK 打开」是最常见的一种：显示成一堆问号或方块，这种信息已经丢了，还原不回来。',
  '「用 GBK 保存、用 UTF-8 打开」通常显示成「æµ‹è¯•」这种形态，本工具能直接还原。',
  '本环境能解码的编码：' + SUPPORTED.map((x) => x.name).join('、') + '。',
  '如果候选里都找不到能读的结果，说明当初写入时就已经丢字节了，任何工具都救不回来。',
]
