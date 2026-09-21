/**
 * Unicode 规范化
 * 解释「看起来一模一样的两个字，为什么 === 比对不相等」
 */

export const FORMS = [
  { key: 'NFC', name: 'NFC', note: '用最少的码点表示（网络传输与 HTML 的默认选择）' },
  { key: 'NFD', name: 'NFD', note: '拆成基字符 + 组合符号（macOS 文件系统默认用这个）' },
  { key: 'NFKC', name: 'NFKC', note: '兼容分解再组合：全角转半角、连字拆开、圈号变数字' },
  { key: 'NFKD', name: 'NFKD', note: '彻底分解，信息损失最大，一般只用于搜索比对' },
]

const hex = (n) => 'U+' + n.toString(16).toUpperCase().padStart(4, '0')

/** 需要留意的字符类型 */
const CLASSES = [
  { re: /[\uff01-\uff5e]/, name: '全角字符', note: 'NFKC 下会变成半角' },
  { re: /[\uff10-\uff19]/, name: '全角数字', note: 'NFKC 下会变成普通数字' },
  { re: /[\u2460-\u2473]/, name: '带圈数字', note: 'NFKC 下会变成数字' },
  { re: /[\u2160-\u217f]/, name: '罗马数字符号', note: 'NFKC 下会变成拉丁字母' },
  { re: /[\ufb00-\ufb06]/, name: '连字', note: '如 ﬁ 会被拆成 f + i' },
  { re: /[\u00b2\u00b3\u00b9\u2070-\u2079]/, name: '上标', note: 'NFKC 下会变成普通数字' },
  { re: /[\u2070-\u209f]/, name: '下标/上标', note: 'NFKC 下会变成普通字符' },
  { re: /[\u2000-\u200a\u202f\u205f\u3000]/, name: '特殊空格', note: '宽度不同，肉眼难以区分' },
  { re: /[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/, name: '零宽/双向控制符', note: '完全看不见' },
  { re: /[\u0300-\u036f]/, name: '组合附加符号', note: 'NFD 分解后出现，NFC 会合并回去' },
  { re: /[\ufffd]/, name: '替换字符', note: '说明原文有过编码错误，信息已丢失' },
]

/**
 * 逐字符体检
 */
export function inspect(text) {
  const s = String(text)
  const chars = [...s]
  const counts = {}
  const rows = chars.map((ch, i) => {
    const cp = ch.codePointAt(0)
    const cls = CLASSES.find((c) => c.re.test(ch))
    const nfkc = ch.normalize('NFKC')
    const nfc = ch.normalize('NFC')
    if (cls) counts[cls.name] = (counts[cls.name] || 0) + 1
    return {
      index: i + 1,
      char: cp < 0x20 || cp === 0x7f || (cp >= 0x200b && cp <= 0x200f) ? '·' : ch,
      hex: hex(cp),
      cls: cls ? cls.name : (cp < 0x80 ? 'ASCII' : cp >= 0x4e00 && cp <= 0x9fff ? '汉字' : '其他'),
      note: cls ? cls.note : '',
      nfkcChanged: nfkc !== ch,
      nfkcText: nfkc,
      nfcChanged: nfc !== ch,
      nfcText: nfc,
      suspect: !!cls,
    }
  })
  return { rows, counts, hasSuspect: rows.some((r) => r.suspect) }
}

/**
 * 各规范化形式对比
 */
export function compare(text) {
  const s = String(text)
  const base = [...s].map((c) => hex(c.codePointAt(0))).join(' ')

  const forms = FORMS.map((f) => {
    let out
    try {
      out = s.normalize(f.key)
    } catch (e) {
      out = s
    }
    const points = [...out].map((c) => hex(c.codePointAt(0))).join(' ')
    return {
      key: f.key,
      name: f.name,
      note: f.note,
      text: out,
      points,
      changed: out !== s,
      sameAsInput: out === s,
      length: [...out].length,
    }
  })

  // 找出「已经处于哪个形式」
  const current = forms.filter((f) => f.sameAsInput).map((f) => f.key)

  // 各形式之间两两是否相同，用来展示差异
  const distinct = []
  forms.forEach((f) => {
    if (!distinct.some((d) => d.points === f.points)) distinct.push(f)
  })

  return { input: s, inputPoints: base, forms, current, distinctCount: distinct.length }
}

export function check(text) {
  const c = compare(text)
  const i = inspect(text)
  return { ...c, inspect: i }
}

export const NORMALIZE_NOTES = [
  '「é」有两种写法：一个码点 U+00E9，或者 e（U+0065）加组合符号 U+0301。肉眼看完全一样，但 === 比对不相等。',
  'macOS 的文件名用 NFD，Windows 与网络传输多用 NFC，所以同一个文件跨系统拷贝后名字可能「变了」。',
  '搜索与去重场景通常用 NFKC：它会把全角转半角、圈号变数字、连字拆开，让「看起来一样」的真的变成一样。',
  '反过来，NFKC/NFKD 是有损的：① 会变成 1，ﬁ 会变成 fi，改完就回不去了。',
  '规范化的方向要统一：要么全用 NFC，要么全用 NFKC，混用等于没做。',
  '正规化能解决「表示形式不同」，但解决不了「长得像」—— 如拉丁字母 a 与西里尔字母 а 是不同码点，NFKC 也不会统一它们。',
]

export const NORMALIZE_SAMPLES = [
  { name: 'é 的两种写法', value: 'e\u0301' },
  { name: 'NFC 写法对比', value: '\u00e9' },
  { name: '全角英文数字', value: 'ＡＢＣ１２３' },
  { name: '带圈数字', value: '①②③' },
  { name: '连字', value: 'ﬁ ﬂ ﬀ' },
  { name: '罗马数字', value: 'Ⅻ Ⅷ' },
  { name: '上标', value: 'x² + y³' },
  { name: '混合在一起', value: 'Ｃａｆｅ\u0301 ① Ⅻ ﬁ' },
]
