/**
 * braille.js 自查断言（直接测 src/utils/braille.js 本体）
 * ------------------------------------------------------------
 * 盲文是有公开标准的（Unicode U+2800–U+283F 的 6 点模式），所以判据核心是：
 *   1) 外部裁判（独立实现）：在测试里**另写一份 6 点盲文编码器**，
 *      点位含义按官方：位 1=左上、2=中上、3=左下、4=右上、5=中右、6=右下，
 *      字符 = U+2800 + 位掩码；字母表用通行的 Grade 1 点字（a=1, b=12 … z=1356），
 *      数字用「数字号 3456 + a–j 代表 1–0」，大写号是点 6。
 *      把模块的编码结果与这份独立实现逐字符对撞，一致才算过。
 *   2) 往返性质：encode → decode 回原值（字母/数字/标点/空格）。
 *   3) 边界与反例：空串抛中文错、未知字符给 '?' 并计数、中文明确不支持、
 *      空白不计入 cells。
 *   4) UI 可见契约：cells 的 mask/dots 不许 undefined，text 里不许脏字。
 */
import { useUtils, makeTest } from './harness.mjs'

const B = await useUtils('braille')
const T = makeTest('braille')

/* ---------------- 独立参考实现（来源：Unicode 盲文 / Grade 1 点字表） ---------------- */
const LETTER_DOTS = {
  a: '1', b: '12', c: '14', d: '145', e: '15', f: '124', g: '1245', h: '125',
  i: '24', j: '245', k: '13', l: '123', m: '134', n: '1345', o: '135', p: '1234',
  q: '12345', r: '1235', s: '234', t: '2345', u: '136', v: '1236', w: '2456',
  x: '1346', y: '13456', z: '1356',
}
const PUNCT_DOTS = {
  ',': '2', ';': '23', ':': '25', '.': '256', '!': '235', '?': '26', "'": '3',
  '-': '36', '/': '34', '@': '4', '&': '12346', '*': '16', '+': '346',
  '=': '123456', $: '1246', '%': '146', _: '456', '~': '46',
}
const DIGIT_LETTER = { 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'e', 6: 'f', 7: 'g', 8: 'h', 9: 'i', 0: 'j' }
const NUMBER_DOTS = '3456'
const CAPITAL_DOTS = '6'

function maskOf(dots) {
  let m = 0
  for (const d of dots) m |= 1 << (Number(d) - 1)
  return m
}
const refChar = (dots) => String.fromCharCode(0x2800 + maskOf(dots))

function refEncode(s) {
  let out = ''
  let numberMode = false
  for (const ch of s) {
    if (ch === ' ' || ch === '\n' || ch === '\t') {
      out += ch
      numberMode = false
      continue
    }
    if (/[0-9]/.test(ch)) {
      if (!numberMode) {
        out += refChar(NUMBER_DOTS)
        numberMode = true
      }
      out += refChar(LETTER_DOTS[DIGIT_LETTER[ch]])
      continue
    }
    const lower = ch.toLowerCase()
    if (LETTER_DOTS[lower] !== undefined) {
      numberMode = false
      if (ch !== lower) out += refChar(CAPITAL_DOTS)
      out += refChar(LETTER_DOTS[lower])
      continue
    }
    if (PUNCT_DOTS[ch] !== undefined) {
      numberMode = false
      out += refChar(PUNCT_DOTS[ch])
      continue
    }
    // 不支持的字符：模块的 text 会跳过，这里也跳过
  }
  return out
}

const noJunk = (s) => !/undefined|NaN|\[object Object\]/.test(String(s))

/* ---------------- 0. 导出面 ---------------- */
for (const k of ['maskToChar', 'charToMask', 'maskToDots', 'encodeBraille', 'decodeBraille', 'BRAILLE_SAMPLES']) {
  T.ok('导出 ' + k, typeof B[k] !== 'undefined')
}

/* ---------------- 1. 位掩码 ↔ 字符 ↔ 点位 ---------------- */
T.eq('U+2800 空盲文', B.maskToChar(0), '\u2800')
T.eq('掩码 1 是左上点', B.maskToChar(1), '\u2801')
T.eq('掩码 0x3f 是六点全满', B.maskToChar(0x3f), '\u283f')
let invOk = true
for (let m = 0; m <= 255; m++) if (B.charToMask(B.maskToChar(m)) !== m) invOk = false
T.ok('charToMask 与 maskToChar 全 256 值互逆', invOk)
T.eq('ASCII 不是盲文', B.charToMask('a'), -1)
T.eq('U+27FF 越界', B.charToMask('\u27ff'), -1)
T.eq('U+2900 越界', B.charToMask('\u2900'), -1)
T.eq('maskToDots 空掩码', B.maskToDots(0), '')
T.eq('maskToDots 六点全满', B.maskToDots(0x3f), '1 2 3 4 5 6')
T.eq('maskToDots 按点位升序', B.maskToDots(maskOf('134')), '1 3 4')

/* ---------------- 2. 字母：与独立实现逐字符对撞 ---------------- */
const alpha = 'abcdefghijklmnopqrstuvwxyz'
T.eq('小写字母表整串一致', B.encodeBraille(alpha).text, refEncode(alpha))
T.eq('a 的点位', B.encodeBraille('a').text, refChar('1'))
T.eq('z 的点位', B.encodeBraille('z').text, refChar('1356'))
T.eq('w 的点位（唯一带 6 的字母）', B.encodeBraille('w').text, refChar('2456'))
let lettersOk = true
for (const ch of alpha) if (B.encodeBraille(ch).text !== refEncode(ch)) lettersOk = false
T.ok('26 个字母逐一与独立实现一致', lettersOk)

/* ---------------- 3. 大写与数字：与独立实现对撞 ---------------- */
T.eq('大写 Hello 一致', B.encodeBraille('Hello').text, refEncode('Hello'))
T.eq('大写号是点 6', B.encodeBraille('A').text.slice(0, 1), refChar('6'))
T.eq('数字 2026 一致', B.encodeBraille('2026').text, refEncode('2026'))
T.eq('数字号是 3456', B.encodeBraille('5').text.slice(0, 1), refChar('3456'))
T.eq('连续数字只打一次数字号', (B.encodeBraille('123').text.match(new RegExp(refChar('3456'), 'g')) || []).length, 1)

/* ---------------- 4. 标点：与独立实现对撞 ---------------- */
let punctOk = true
for (const ch of Object.keys(PUNCT_DOTS)) {
  if (B.encodeBraille(ch).text !== refEncode(ch)) punctOk = false
}
T.ok('常用标点与独立实现一致', punctOk)

/* ---------------- 5. 往返闭合 ---------------- */
const rt = 'Hello, World! 2026'
T.eq('整句往返回原值', B.decodeBraille(B.encodeBraille(rt).text).text, rt)
T.eq('字母表往返', B.decodeBraille(B.encodeBraille(alpha).text).text, alpha)
T.eq('数字串往返', B.decodeBraille(B.encodeBraille('0123456789').text).text, '0123456789')
T.eq('标点往返', B.decodeBraille(B.encodeBraille(',;:.!?-/@&*+= $_~').text).text, ',;:.!?-/@&*+= $_~')
T.eq('大写往返', B.decodeBraille(B.encodeBraille('AbC').text).text, 'AbC')
T.eq('空格与换行保留', B.decodeBraille(B.encodeBraille('a b\nc').text).text, 'a b\nc')
T.eq('盲文样例解码', B.decodeBraille('⠓⠑⠇⠇⠕').text, 'hello')

/* ---------------- 6. 中文与不支持字符 ---------------- */
const zh = B.encodeBraille('中文abc')
T.eq('中文进 unsupported', JSON.stringify(zh.unsupported), JSON.stringify(['中', '文']))
T.eq('中文不产出盲文字符', zh.text, '⠁⠃⠉')
T.eq('中文不进 cells（只留 abc 三个）', zh.cells.length, 3)
const mixed = B.encodeBraille('a😀b')
T.ok('emoji 进 unsupported', mixed.unsupported.includes('😀'))
T.ok('emoji 不出现在 text', !mixed.text.includes('😀'))

/* ---------------- 7. 空白与 cells 结构 ---------------- */
const sp = B.encodeBraille('a b')
T.eq('空格保留在 text', sp.text, refChar('1') + ' ' + refChar('12'))
T.eq('空格不计入 cells', sp.cells.length, 2)
T.ok('cells 每项 mask 与 dots 自洽', sp.cells.every((c) => c.mask !== null && c.dots === B.maskToDots(c.mask)))
T.ok('cells 每项有 raw/label', sp.cells.every((c) => typeof c.raw === 'string' && typeof c.label === 'string'))

/* ---------------- 8. 边界与反例 ---------------- */
T.throws('空文本报错', () => B.encodeBraille(''), /文本/)
T.throws('空盲文报错', () => B.decodeBraille(''), /盲文/)
const unk = B.decodeBraille('x')
T.eq('未知字符解成问号', unk.text, '?')
T.eq('未知字符计数', unk.unknown, 1)
const blank = B.decodeBraille('\u2800')
T.eq('空白盲文点解成问号', blank.text, '?')
T.ok('decode 结果无脏字', noJunk(B.decodeBraille(rt).text))

/* ---------------- 9. 样例表 ---------------- */
T.ok('BRAILLE_SAMPLES 非空', Array.isArray(B.BRAILLE_SAMPLES) && B.BRAILLE_SAMPLES.length >= 4)
T.ok('样例都有 name/value', B.BRAILLE_SAMPLES.every((s) => s.name && typeof s.value === 'string'))
T.ok('可编码样例都能编码', B.BRAILLE_SAMPLES.filter((s) => /^[a-zA-Z0-9 ,.!?]+$/.test(s.value)).every((s) => B.encodeBraille(s.value).text.length > 0))

T.done()
