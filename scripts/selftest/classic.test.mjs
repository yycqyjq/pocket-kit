/**
 * classic.js 自查断言（直接测 src/utils/classic.js 本体）
 * ------------------------------------------------------------
 * 这些都是有公开定义的古典变换，所以判据核心是「独立参考实现对撞」：
 *   1) 外部裁判（测试里另写一份）：
 *      - 凯撒：用移位后的字母表做查表，而不是照抄取模公式；
 *      - Atbash：字母表首尾互换的独立查表；
 *      - ROT47：可打印 ASCII（33–126）位移 47 的独立实现；
 *      - 培根：用「字母序号 0–25 的 5 位二进制，0→A、1→B」独立推导，
 *        A=AAAAA … Z=BBAAB 来自这套推导而非模块表；
 *      - 摩斯：按 ITU 公开电码表独立列 A–Z / 0–9 对撞。
 *      另外用维基百科著名的栅栏密码示例（3 栏）做已知向量。
 *   2) 往返性质：encode→decode 回原值；自反密码做两次回原值。
 *   3) 边界与反例：空串、非法位移夹取、未知字符、未知方法抛中文错。
 *   4) UI 可见契约：输出里不许 undefined/NaN。
 */
import { useUtils, makeTest } from './harness.mjs'

const C = await useUtils('classic')
const T = makeTest('classic')

/* ---------------- 独立参考实现 ---------------- */
const LOWER = 'abcdefghijklmnopqrstuvwxyz'

function refCaesar(text, shift, decode) {
  const n = ((Number(shift) % 26) + 26) % 26
  const k = decode ? (26 - n) % 26 : n
  const lo = LOWER.split('').map((_, i) => LOWER[(i + k) % 26]).join('')
  const up = lo.toUpperCase()
  return [...String(text)]
    .map((ch) => {
      const idx = LOWER.indexOf(ch.toLowerCase())
      if (idx < 0) return ch
      return ch === ch.toUpperCase() ? up[idx] : lo[idx]
    })
    .join('')
}

function refAtbash(text) {
  const lo = LOWER.split('').reverse().join('')
  const up = lo.toUpperCase()
  return [...String(text)]
    .map((ch) => {
      const idx = LOWER.indexOf(ch.toLowerCase())
      if (idx < 0) return ch
      return ch === ch.toUpperCase() ? up[idx] : lo[idx]
    })
    .join('')
}

function refRot47(text) {
  return [...String(text)]
    .map((ch) => {
      const c = ch.codePointAt(0)
      if (c >= 33 && c <= 126) return String.fromCharCode(33 + ((c - 33 + 47) % 94))
      return ch
    })
    .join('')
}

// 培根：字母序号 0-25 → 5 位二进制 → 0:A / 1:B
function refBaconEncode(text) {
  return [...String(text).toUpperCase()]
    .map((ch) => {
      const i = ch.charCodeAt(0) - 65
      if (i < 0 || i > 25) return ch === ' ' ? '/' : '?'
      return i.toString(2).padStart(5, '0').replace(/0/g, 'A').replace(/1/g, 'B')
    })
    .join(' ')
}

const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
  I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
  Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
  5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
}
function refMorseEncode(text) {
  return [...String(text).toUpperCase()].map((ch) => (ch === ' ' ? '/' : MORSE[ch] || '?')).join(' ')
}

const noJunk = (s) => !/undefined|NaN|\[object Object\]/.test(String(s))

/* ---------------- 0. 导出面 ---------------- */
for (const k of [
  'caesar', 'caesarBrute', 'rot13', 'rot47', 'railEncrypt', 'railDecrypt',
  'a1z26Encode', 'a1z26Decode', 'atbash', 'baconEncode', 'baconDecode',
  'morseEncode', 'morseDecode', 'runMethod', 'METHODS', 'SAMPLE_CLASSIC',
]) {
  T.ok('导出 ' + k, typeof C[k] !== 'undefined')
}

/* ---------------- 1. 凯撒：查表参考实现对撞 ---------------- */
const cs = 'Hello, World! 123'
for (const shift of [0, 1, 3, 13, 25, 26, 27, -1, 100]) {
  T.eq('凯撒位移 ' + shift, C.caesar(cs, shift), refCaesar(cs, shift))
}
T.eq('凯撒位移 0 是恒等', C.caesar(cs, 0), cs)
T.eq('凯撒只动字母', C.caesar('a1!Z', 3), 'd1!C')
T.eq('凯撒编码后再解码回原值', C.caesar(C.caesar(cs, 7), 7, true), cs)
T.eq('凯撒已知向量', C.caesar('Hello, World!', 3), 'Khoor, Zruog!')

/* ---------------- 2. 凯撒暴力枚举 ---------------- */
const brute = C.caesarBrute('Khoor')
T.eq('暴力枚举 26 种', brute.length, 26)
T.eq('暴力位移 3 得明文', brute[3].text, 'Hello')
T.ok('暴力每项都有 shift/text', brute.every((b) => typeof b.shift === 'number' && typeof b.text === 'string'))

/* ---------------- 3. ROT13 / ROT47 ---------------- */
T.eq('ROT13 与凯撒 13 一致', C.rot13('Hello'), refCaesar('Hello', 13, false))
T.eq('ROT13 两次回原值', C.rot13(C.rot13('Hello, World!')), 'Hello, World!')
const r47src = 'Hello! ~ 2026'
T.eq('ROT47 与独立实现一致', C.rot47(r47src), refRot47(r47src))
T.eq('ROT47 两次回原值', C.rot47(C.rot47(r47src)), r47src)
T.eq('ROT47 已知向量', C.rot47('Hello!'), 'w6==@P')

/* ---------------- 4. Atbash ---------------- */
T.eq('Atbash 与独立实现一致', C.atbash(cs), refAtbash(cs))
T.eq('Atbash 两次回原值', C.atbash(C.atbash(cs)), cs)
T.eq('Atbash 已知向量', C.atbash('Hello'), 'Svool')
T.eq('Atbash 只动字母', C.atbash('a1!Z'), 'z1!A')

/* ---------------- 5. 栅栏：维基已知向量 + 往返 ---------------- */
const railPlain = 'WEAREDISCOVEREDFLEEATONCE'
const rail3 = C.railEncrypt(railPlain, 3)
T.eq('栅栏 3 栏已知向量', rail3, 'WECRLTEERDSOEEFEAOCAIVDEN')
T.eq('栅栏 3 栏解码回原值', C.railDecrypt(rail3, 3), railPlain)
T.ok('栅栏只打乱不改字符', [...C.railEncrypt(railPlain, 4)].sort().join('') === [...railPlain].sort().join(''))
T.eq('栅栏往返（4 栏）', C.railDecrypt(C.railEncrypt(railPlain, 4), 4), railPlain)
T.eq('栅栏往返（7 栏）', C.railDecrypt(C.railEncrypt(railPlain, 7), 7), railPlain)
T.eq('栅栏栏数下限夹到 2', C.railEncrypt('abc', 1), C.railEncrypt('abc', 2))
T.eq('栅栏栏数上限夹到 50', C.railEncrypt('abc', 100), C.railEncrypt('abc', 50))
T.eq('栅栏空串', C.railEncrypt('', 3), '')
T.eq('栅栏解码空串', C.railDecrypt('', 3), '')

/* ---------------- 6. A1Z26 ---------------- */
T.eq('A1Z26 编码', C.a1z26Encode('hello'), '8-5-12-12-15')
T.eq('A1Z26 单词用 / 分隔', C.a1z26Encode('hi there'), '8-9 / 20-8-5-18-5')
T.eq('A1Z26 解码（横线）', C.a1z26Decode('8-5-12-12-15'), 'hello')
T.eq('A1Z26 解码（空格）', C.a1z26Decode('8 5 12 12 15'), 'hello')
T.eq('A1Z26 越界给问号', C.a1z26Decode('0-27-1'), '??a')
T.eq('A1Z26 往返（纯字母）', C.a1z26Decode(C.a1z26Encode('cipher')), 'cipher')
T.eq('A1Z26 空串', C.a1z26Decode(''), '')

/* ---------------- 7. 培根：二进制推导对撞 ---------------- */
T.eq('培根与独立推导一致', C.baconEncode('HELLO'), refBaconEncode('HELLO'))
T.eq('培根 A', C.baconEncode('A'), 'AAAAA')
T.eq('培根 Z', C.baconEncode('Z'), 'BBAAB')
T.eq('培根往返', C.baconDecode(C.baconEncode('HELLO')), 'HELLO')
T.eq('培根兼容 0/1', C.baconDecode('00000 00001'), 'AB')
T.eq('培根解码空格分隔', C.baconDecode('AABBB ABAAA'), 'HI')

/* ---------------- 8. 摩斯：ITU 表对撞 ---------------- */
T.eq('摩斯 SOS', C.morseEncode('SOS'), '... --- ...')
T.eq('摩斯与独立表一致', C.morseEncode('HELLO WORLD'), refMorseEncode('HELLO WORLD'))
T.eq('摩斯数字', C.morseEncode('2026'), '..--- ----- ..--- -....')
T.eq('摩斯解码', C.morseDecode('... --- ...'), 'SOS')
T.eq('摩斯往返', C.morseDecode(C.morseEncode('HELLO WORLD')), 'HELLO WORLD')
T.eq('摩斯 / 解成空格', C.morseDecode('... --- ... / ... --- ...'), 'SOS SOS')
T.eq('摩斯未知给问号', C.morseDecode('... ??? ...'), 'S?S')

/* ---------------- 9. 统一入口 runMethod ---------------- */
T.eq('runMethod caesar 编码', C.runMethod('caesar', 'Hello', 3, false), C.caesar('Hello', 3, false))
T.eq('runMethod caesar 解码', C.runMethod('caesar', 'Khoor', 3, true), C.caesar('Khoor', 3, true))
T.eq('runMethod rot13', C.runMethod('rot13', 'Hello'), C.rot13('Hello'))
T.eq('runMethod rot47', C.runMethod('rot47', r47src), C.rot47(r47src))
T.eq('runMethod rail 编码', C.runMethod('rail', railPlain, 3, false), C.railEncrypt(railPlain, 3))
T.eq('runMethod rail 解码', C.runMethod('rail', rail3, 3, true), C.railDecrypt(rail3, 3))
T.eq('runMethod a1z26 编码', C.runMethod('a1z26', 'hello', 0, false), C.a1z26Encode('hello'))
T.eq('runMethod a1z26 解码', C.runMethod('a1z26', '8-5-12-12-15', 0, true), C.a1z26Decode('8-5-12-12-15'))
T.eq('runMethod atbash', C.runMethod('atbash', 'Hello'), C.atbash('Hello'))
T.eq('runMethod bacon 编码', C.runMethod('bacon', 'Hi', 0, false), C.baconEncode('Hi'))
T.eq('runMethod bacon 解码', C.runMethod('bacon', C.baconEncode('Hi'), 0, true), C.baconDecode(C.baconEncode('Hi')))
T.eq('runMethod morse 编码', C.runMethod('morse', 'SOS', 0, false), C.morseEncode('SOS'))
T.eq('runMethod morse 解码', C.runMethod('morse', '... --- ...', 0, true), C.morseDecode('... --- ...'))
T.throws('未知方法报中文错', () => C.runMethod('nope', 'x'), /未知/)

/* ---------------- 10. 方法表与 UI 契约 ---------------- */
T.eq('方法表 8 项', C.METHODS.length, 8)
T.eq('方法 key 唯一', new Set(C.METHODS.map((m) => m.key)).size, C.METHODS.length)
T.ok('每项都有 name/note', C.METHODS.every((m) => m.name.length > 0 && m.note.length > 8))
T.ok('凯撒标记可暴力枚举', C.METHODS.find((m) => m.key === 'caesar').hasBrute === true)
T.ok('需要数字的方法给了默认值', C.METHODS.filter((m) => m.needNum).every((m) => typeof m.numDefault === 'number'))
T.ok('SAMPLE_CLASSIC 是字符串', typeof C.SAMPLE_CLASSIC === 'string' && C.SAMPLE_CLASSIC.length > 0)
T.ok('输出无脏字', noJunk(C.caesar(cs, 3)) && noJunk(C.rot47(r47src)) && noJunk(C.morseEncode('HELLO')))

T.done()
