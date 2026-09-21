/**
 * 二维码（QR Code）编码 + 配套最小解码 —— 按 ISO/IEC 18004 从零实现
 * ------------------------------------------------------------
 * 覆盖范围：
 *   · 模式：数字 / 字母数字 / 字节（UTF-8），混合内容用 DP 选总位数最少的分段；
 *   · 版本 1–40、纠错等级 L/M/Q/H；
 *   · GF(256) Reed–Solomon 纠错（本原多项式 0x11D，生成元 α=2）；
 *   · 8 种掩码 + 四罚分规则选优；
 *   · format info（BCH(15,5)，生成式 0x537，掩码 0x5412）与 version info（BCH(18,6)，生成式 0x1F25）；
 *   · 定位图形 / 分隔符 / 定时图形 / 校正图形 / 恒黑模块，静区按标准留 4 模块。
 *
 * 关于「抄不抄」：
 *   · 下面 EC_ROWS、ALIGN_CENTERS 两张表是 ISO/IEC 18004 的规范性数据（数字本身），
 *     任何合规实现都必须逐字一致，属于数据而非代码；
 *   · 比特流拼装、RS 生成式、码字交错、掩码罚分、BCH、zigzag 走位这些**过程**
 *     全部按标准描述自己写，未参考 qrcode.js / JsBarcode / ZXing 的实现。
 *
 * 自检说明：文件末尾的 decodeMatrix 是配套的逆过程，用来跑 encode → decode 往返。
 * 往返一致只能证明编解码互逆，证明不了符合规范，所以另有公开参考向量
 * （format/version 位串表、"HELLO WORLD" 1-Q 字母数字示例）与第三方解码器扫码验证。
 *
 * 纯逻辑：不碰 uni、不碰 DOM。位图渲染交给视图层（canvas / view 网格 / toSvgMatrix）。
 */
import { utf8Bytes, bytesUtf8 } from './base64'

/* ============================ 规范数据表 ============================ */

/**
 * 纠错分块结构表：160 行（版本 1–40 × 等级 L/M/Q/H），每格 'ecc,总块数,短块码字数,长块个数'。
 * 长块码字数 = 短块 + 1；数据码字总数 = 总块数 × 短块 + 长块个数；
 * 总码字数 = 数据码字 + ecc × 总块数（应等于该版本可用模块数 ÷ 8 取整）。
 */
const EC_ROWS = [
  '7,1,19,0;10,1,16,0;13,1,13,0;17,1,9,0',
  '10,1,34,0;16,1,28,0;22,1,22,0;28,1,16,0',
  '15,1,55,0;26,1,44,0;18,2,17,0;22,2,13,0',
  '20,1,80,0;18,2,32,0;26,2,24,0;16,4,9,0',
  '26,1,108,0;24,2,43,0;18,4,15,2;22,4,11,2',
  '18,2,68,0;16,4,27,0;24,4,19,0;28,4,15,0',
  '20,2,78,0;18,4,31,0;18,6,14,4;26,5,13,1',
  '24,2,97,0;22,4,38,2;22,6,18,2;26,6,14,2',
  '30,2,116,0;22,5,36,2;20,8,16,4;24,8,12,4',
  '18,4,68,2;26,5,43,1;24,8,19,2;28,8,15,2',
  '20,4,81,0;30,5,50,4;28,8,22,4;24,11,12,8',
  '24,4,92,2;22,8,36,2;26,10,20,6;28,11,14,4',
  '26,4,107,0;22,9,37,1;24,12,20,4;22,16,11,4',
  '30,4,115,1;24,9,40,5;20,16,16,5;24,16,12,5',
  '22,6,87,1;24,10,41,5;30,12,24,7;24,18,12,7',
  '24,6,98,1;28,10,45,3;24,17,19,2;30,16,15,13',
  '28,6,107,5;28,11,46,1;28,16,22,15;28,19,14,17',
  '30,6,120,1;26,13,43,4;28,18,22,1;28,21,14,19',
  '28,7,113,4;26,14,44,11;26,21,21,4;26,25,13,16',
  '28,8,107,5;26,16,41,13;30,20,24,5;28,25,15,10',
  '28,8,116,4;26,17,42,0;28,23,22,6;30,25,16,6',
  '28,9,111,7;28,17,46,0;30,23,24,16;24,34,13,0',
  '30,9,121,5;28,18,47,14;30,25,24,14;30,30,15,14',
  '30,10,117,4;28,20,45,14;30,27,24,16;30,32,16,2',
  '26,12,106,4;28,21,47,13;30,29,24,22;30,35,15,13',
  '28,12,114,2;28,23,46,4;28,34,22,6;30,37,16,4',
  '30,12,122,4;28,25,45,3;30,34,23,26;30,40,15,28',
  '30,13,117,10;28,26,45,23;30,35,24,31;30,42,15,31',
  '30,14,116,7;28,28,45,7;30,38,23,37;30,45,15,26',
  '30,15,115,10;28,29,47,10;30,40,24,25;30,48,15,25',
  '30,16,115,3;28,31,46,29;30,43,24,1;30,51,15,28',
  '30,17,115,0;28,33,46,23;30,45,24,35;30,54,15,35',
  '30,18,115,1;28,35,46,21;30,48,24,19;30,57,15,46',
  '30,19,115,6;28,37,46,23;30,51,24,7;30,60,16,1',
  '30,19,121,7;28,38,47,26;30,53,24,14;30,63,15,41',
  '30,20,121,14;28,40,47,34;30,56,24,10;30,66,15,64',
  '30,21,122,4;28,43,46,14;30,59,24,10;30,70,15,46',
  '30,22,122,18;28,45,46,32;30,62,24,14;30,74,15,32',
  '30,24,117,4;28,47,47,7;30,65,24,22;30,77,15,67',
  '30,25,118,6;28,49,47,31;30,68,24,34;30,81,15,61',
]

/** 校正图形中心坐标（版本 1 无校正图形，下标从 2 开始） */
const ALIGN_CENTERS = [
  null,
  '6,18', '6,22', '6,26', '6,30', '6,34', '6,22,38', '6,24,42', '6,26,46', '6,28,50', '6,30,54',
  '6,32,58', '6,34,62', '6,26,46,66', '6,26,48,70', '6,26,50,74', '6,30,54,78', '6,30,56,82',
  '6,30,58,86', '6,34,62,90', '6,28,50,72,94', '6,26,50,74,98', '6,30,54,78,102', '6,28,54,80,106',
  '6,32,58,84,110', '6,30,58,86,114', '6,34,62,90,118', '6,26,50,74,98,122', '6,30,54,78,102,126',
  '6,26,52,78,104,130', '6,30,56,82,108,134', '6,34,60,86,112,138', '6,30,58,86,114,142',
  '6,34,62,90,118,146', '6,30,54,78,102,126,150', '6,24,50,76,102,128,154', '6,28,54,80,106,132,158',
  '6,32,58,84,110,136,162', '6,26,54,82,110,138,166', '6,30,58,86,114,142,170',
]

/** 字母数字模式字符表（下标即字符值） */
const ALNUM_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'

/** 静区（quiet zone）：标准要求四周各留至少 4 个模块的空白 */
export const QUIET_ZONE = 4

const MODE_BITS = { numeric: 1, alphanumeric: 2, byte: 4 }
const ELEVEL_ORDER = 'LMQH'
/** format info 里 2 bit 的等级编码（注意 M 是 00，L 才是 01） */
const ELEVEL_FMT = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 }
const PAD_BYTES = [0xec, 0x11]

/* ============================ GF(256) 运算 ============================ */

const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)
;(function buildGF() {
  // 本原多项式 x^8 + x^4 + x^3 + x^2 + 1 = 0x11D，生成元 α = 2
  let x = 1
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x
    GF_LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]
})()

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0
  return GF_EXP[GF_LOG[a] + GF_LOG[b]]
}

function gfPow(a, n) {
  return GF_EXP[(GF_LOG[a] * n) % 255]
}

/** RS 生成多项式缓存：g(x) = (x-α^0)(x-α^1)…(x-α^(n-1))，首项系数 1，长度 n+1 */
const GEN_CACHE = {}
function rsGenerator(n) {
  if (GEN_CACHE[n]) return GEN_CACHE[n]
  let poly = [1]
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j] // x · poly
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]) // α^i · poly
    }
    poly = next
  }
  GEN_CACHE[n] = poly
  return poly
}

/** 求余：把数据多项式乘 x^n 后除以生成式，余式即纠错码字 */
function rsEncode(data, eccLen) {
  const gen = rsGenerator(eccLen)
  const res = new Uint8Array(eccLen)
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0]
    for (let j = 0; j < eccLen - 1; j++) res[j] = res[j + 1]
    res[eccLen - 1] = 0
    if (factor !== 0) {
      for (let j = 0; j < eccLen; j++) res[j] ^= gfMul(gen[j + 1], factor)
    }
  }
  return res
}

/** 伴随式：全 0 说明这一块的码字多项式能被生成式整除 */
function rsSyndromes(block, eccLen) {
  const out = []
  for (let i = 0; i < eccLen; i++) {
    let acc = 0
    for (let j = 0; j < block.length; j++) acc = gfMul(acc, GF_EXP[i]) ^ block[j]
    out.push(acc)
  }
  return out
}

/* ============================ 容量 ============================ */

function normElevel(elevel) {
  const e = String(elevel || 'M').toUpperCase()
  if (ELEVEL_ORDER.indexOf(e) < 0) throw new Error('纠错等级只支持 L / M / Q / H')
  return e
}

function normVersion(version) {
  const v = Number(version) || 0
  if (v < 0 || v > 40 || Math.floor(v) !== v) throw new Error('版本号只能是 0（自动）或 1–40')
  return v
}

/** 分块结构 */
function blockInfo(version, elevel) {
  const e = normElevel(elevel)
  const cell = EC_ROWS[version - 1].split(';')[ELEVEL_ORDER.indexOf(e)].split(',').map(Number)
  const ecc = cell[0]
  const blocks = cell[1]
  const shortLen = cell[2]
  const longBlocks = cell[3]
  const dataCodewords = blocks * shortLen + longBlocks
  return {
    elevel: e,
    eccPerBlock: ecc,
    blocks,
    shortLen,
    longBlocks,
    dataCodewords,
    totalCodewords: dataCodewords + ecc * blocks,
  }
}

/** 字符计数指示符位宽（版本分三档：1–9 / 10–26 / 27–40） */
function cciBits(mode, version) {
  const g = version <= 9 ? 0 : version <= 26 ? 1 : 2
  if (mode === 'numeric') return [10, 12, 14][g]
  if (mode === 'alphanumeric') return [9, 11, 13][g]
  return [8, 16, 16][g]
}

/** 段头 + 数据段本身占多少位 */
function segmentBits(mode, len, version) {
  if (len <= 0) return 0
  if (mode === 'numeric') {
    const full = Math.floor(len / 3)
    const tail = len % 3
    return 4 + cciBits(mode, version) + full * 10 + (tail === 2 ? 7 : tail === 1 ? 4 : 0)
  }
  if (mode === 'alphanumeric') {
    const full = Math.floor(len / 2)
    return 4 + cciBits(mode, version) + full * 11 + (len % 2 ? 6 : 0)
  }
  return 4 + cciBits(mode, version) + len * 8
}

/**
 * 某版本 + 纠错等级下三种模式各自能装多少个字符（真实容量，不是估算）
 * @returns {{version:number, elevel:string, dataCodewords:number, eccPerBlock:number,
 *   blocks:number, totalCodewords:number, numeric:number, alphanumeric:number, byte:number}}
 */
export function capacityOf(version, elevel) {
  const v = Number(version)
  if (!v || v < 1 || v > 40) throw new Error('版本号要落在 1–40')
  const info = blockInfo(v, elevel)
  const bits = info.dataCodewords * 8
  const numAvail = bits - 4 - cciBits('numeric', v)
  const alnAvail = bits - 4 - cciBits('alphanumeric', v)
  const bytAvail = bits - 4 - cciBits('byte', v)
  const numeric = numAvail < 0 ? 0 : Math.floor(numAvail / 10) * 3 + (numAvail % 10 >= 7 ? 2 : numAvail % 10 >= 4 ? 1 : 0)
  const alphanumeric = alnAvail < 0 ? 0 : Math.floor(alnAvail / 11) * 2 + (alnAvail % 11 >= 6 ? 1 : 0)
  const byte = bytAvail < 0 ? 0 : Math.floor(bytAvail / 8)
  return {
    version: v,
    elevel: info.elevel,
    dataCodewords: info.dataCodewords,
    eccPerBlock: info.eccPerBlock,
    blocks: info.blocks,
    totalCodewords: info.totalCodewords,
    numeric,
    alphanumeric,
    byte,
  }
}

/** 某一模式下该版本能装的字符数 */
export function maxChars(version, elevel, mode) {
  const cap = capacityOf(version, elevel)
  return cap[mode === 'numeric' ? 'numeric' : mode === 'alphanumeric' ? 'alphanumeric' : 'byte']
}

/* ============================ 分段与比特流 ============================ */

function charClass(ch) {
  const c = ch.charCodeAt(0)
  if (c >= 48 && c <= 57) return 'numeric'
  if (ALNUM_CHARS.indexOf(ch) > -1) return 'alphanumeric'
  return 'byte'
}

/** 类别强度：字节段能表示一切，所以一个段里只要混进字节字符，整段就只能降级成字节模式 */
const CLASS_RANK = { numeric: 0, alphanumeric: 1, byte: 2 }
const RANK_MODE = ['numeric', 'alphanumeric', 'byte']

/** 按字符类别切成最大连续段（emoji / 生僻字按完整码点走，不会被劈成两半） */
function classRuns(text) {
  const runs = []
  for (const ch of String(text)) {
    const mode = charClass(ch)
    const last = runs[runs.length - 1]
    if (last && last.mode === mode) last.text += ch
    else runs.push({ mode, text: ch })
  }
  return runs
}

/** 段内的编码长度：字节模式数的是 UTF-8 字节数，另两种数的是字符数 */
function segCharLen(seg) {
  return seg.mode === 'byte' ? utf8Bytes(seg.text).length : seg.text.length
}

/** 一套分段的总位数 */
function planBits(segs, version) {
  let acc = 0
  for (const s of segs) acc += segmentBits(s.mode, segCharLen(s), version)
  return acc
}

/** 连续段多到这个量级，O(n²) 的 DP 不划算，直接用整体字节段兜底 */
const MAX_RUNS_FOR_DP = 300

/**
 * 分段最优化（DP）：切点只能落在连续段之间，所以「最后一段从哪个连续段起」就是全部状态。
 *   f[i] = 前 i 个连续段的最少位数；f[i] = min over j ( f[j] + 段头 + 段体 )，
 *   j..i-1 这几段合成一段，模式取其中最强的一种。
 * 这样小写/中文混进 URL 时，零碎的大写小段会被邻居吞掉，省掉一次次 4+CCI 位的段头；
 * 反过来足够长的字母数字段（比字节段省 2.5 bit/字符）会被保留独立成段。
 * @returns {{mode:string, text:string}[]}
 */
function planSegments(runs, version) {
  const n = runs.length
  if (n <= 1) return runs.map((r) => ({ mode: r.mode, text: r.text }))
  const whole = [{ mode: 'byte', text: runs.map((r) => r.text).join('') }]
  if (n > MAX_RUNS_FOR_DP) return whole
  const lens = runs.map((r) => r.text.length)
  // 数字 / 字母数字都是 ASCII，字节数与字符数相同
  const blens = runs.map((r) => (r.mode === 'byte' ? utf8Bytes(r.text).length : r.text.length))
  const f = new Array(n + 1).fill(Infinity)
  const from = new Array(n + 1).fill(0)
  const modeAt = new Array(n + 1).fill('byte')
  f[0] = 0
  for (let i = 0; i < n; i++) {
    if (f[i] === Infinity) continue
    let rank = -1
    let chars = 0
    let bytes = 0
    for (let j = i; j < n; j++) {
      const rk = CLASS_RANK[runs[j].mode]
      if (rk > rank) rank = rk
      chars += lens[j]
      bytes += blens[j]
      const mode = RANK_MODE[rank]
      const cost = f[i] + segmentBits(mode, mode === 'byte' ? bytes : chars, version)
      if (cost < f[j + 1]) {
        f[j + 1] = cost
        from[j + 1] = i
        modeAt[j + 1] = mode
      }
    }
  }
  const segs = []
  for (let e = n; e > 0; e = from[e]) {
    segs.unshift({ mode: modeAt[e], text: runs.slice(from[e], e).map((r) => r.text).join('') })
  }
  return segs
}

/** 版本按字符计数指示符分三档，同档内位数与版本无关 */
const VERSION_TIERS = [[1, 9], [10, 26], [27, 40]]

/**
 * 自动选版本：先按档位做一次 DP 分段，再在该档里取第一个装得下的版本。
 * @returns {{segments:Array, version:number}} version 为 0 表示 40 级也装不下
 */
function autoPickVersion(text, elevel) {
  const runs = classRuns(text)
  for (let t = 0; t < VERSION_TIERS.length; t++) {
    const lo = VERSION_TIERS[t][0]
    const hi = VERSION_TIERS[t][1]
    const segs = planSegments(runs, lo)
    const bits = planBits(segs, lo)
    for (let v = lo; v <= hi; v++) {
      if (bits <= blockInfo(v, elevel).dataCodewords * 8) return { segments: segs, version: v }
    }
  }
  return { segments: planSegments(runs, 40), version: 0 }
}

/** 选段结果的整体模式（视图与容量提示用） */
function overallMode(segs) {
  if (segs.length === 1) return segs[0].mode
  const kinds = {}
  segs.forEach((s) => (kinds[s.mode] = 1))
  const ks = Object.keys(kinds)
  return ks.length === 1 ? ks[0] : 'mixed'
}

function pushBits(list, value, len) {
  for (let i = len - 1; i >= 0; i--) list.push((value >>> i) & 1)
}

function encodeNumeric(list, str) {
  for (let i = 0; i < str.length; i += 3) {
    const chunk = str.substr(i, 3)
    pushBits(list, parseInt(chunk, 10), chunk.length === 3 ? 10 : chunk.length === 2 ? 7 : 4)
  }
}

function encodeAlphanumeric(list, str) {
  for (let i = 0; i + 1 < str.length; i += 2) {
    pushBits(list, ALNUM_CHARS.indexOf(str[i]) * 45 + ALNUM_CHARS.indexOf(str[i + 1]), 11)
  }
  if (str.length % 2) pushBits(list, ALNUM_CHARS.indexOf(str[str.length - 1]), 6)
}

function encodeByte(list, str) {
  const bytes = utf8Bytes(str)
  for (let i = 0; i < bytes.length; i++) pushBits(list, bytes[i], 8)
  return bytes.length
}

/** 段列表 → 比特数组 */
function buildBits(segments, version) {
  const bits = []
  segments.forEach((seg) => {
    pushBits(bits, MODE_BITS[seg.mode], 4)
    pushBits(bits, segCharLen(seg), cciBits(seg.mode, version))
    if (seg.mode === 'numeric') encodeNumeric(bits, seg.text)
    else if (seg.mode === 'alphanumeric') encodeAlphanumeric(bits, seg.text)
    else encodeByte(bits, seg.text)
  })
  return bits
}

/** 比特数组 → 数据码字（补终止符、对齐字节、补填充码字） */
function toDataCodewords(bits, capacityBits) {
  if (bits.length > capacityBits) return null
  const out = bits.slice()
  const term = Math.min(4, capacityBits - out.length)
  for (let i = 0; i < term; i++) out.push(0)
  while (out.length % 8) out.push(0)
  let pi = 0
  while (out.length < capacityBits) {
    const v = PAD_BYTES[pi % 2]
    pi++
    pushBits(out, v, 8)
  }
  const cw = new Uint8Array(out.length / 8)
  for (let i = 0; i < cw.length; i++) {
    let acc = 0
    for (let j = 0; j < 8; j++) acc = (acc << 1) | out[i * 8 + j]
    cw[i] = acc
  }
  return cw
}

/** 交错：数据码字按块轮流输出，纠错码字再按块轮流输出 */
function interleave(dataCw, info) {
  const { blocks, shortLen, longBlocks, eccPerBlock } = info
  const dataBlocks = []
  const eccBlocks = []
  let p = 0
  for (let i = 0; i < blocks; i++) {
    const len = shortLen + (i >= blocks - longBlocks ? 1 : 0)
    const chunk = dataCw.subarray(p, p + len)
    p += len
    dataBlocks.push(chunk)
    eccBlocks.push(rsEncode(chunk, eccPerBlock))
  }
  const out = []
  const maxLen = shortLen + 1
  for (let i = 0; i < maxLen; i++) {
    for (let b = 0; b < blocks; b++) {
      if (i < dataBlocks[b].length) out.push(dataBlocks[b][i])
    }
  }
  for (let i = 0; i < eccPerBlock; i++) {
    for (let b = 0; b < blocks; b++) out.push(eccBlocks[b][i])
  }
  return { final: Uint8Array.from(out), dataBlocks, eccBlocks }
}

/* ============================ 矩阵 ============================ */

/** format info 第一份拷贝的 15 个位置（[行,列]；下标 i 那格放 format 值的第 14-i 位） */
const FMT_POS_A = [
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
  [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
]
/** format info 第二份拷贝：竖排 7 格（列 8，行 size-1…size-7），横排 8 格（行 8，列 size-8…size-1） */
function fmtPosB(size) {
  const p = []
  for (let i = 0; i <= 6; i++) p.push([size - 1 - i, 8])
  for (let i = 7; i <= 14; i++) p.push([8, size - 15 + i])
  return p
}

/** BCH(15,5)：QR 的 format info，生成式 0x537，末了统一异或 0x5412 */
export function formatInfoBits(elevel, mask) {
  const data = (ELEVEL_FMT[normElevel(elevel)] << 3) | (mask & 7)
  let v = data << 10
  for (let i = 14; i >= 10; i--) {
    if ((v >>> i) & 1) v ^= 0x537 << (i - 10)
  }
  return (((data << 10) | v) ^ 0x5412) & 0x7fff
}

/** BCH(18,6)：version ≥ 7 的 version info，生成式 0x1F25 */
export function versionInfoBits(version) {
  const v0 = Number(version)
  if (v0 < 7) return 0
  let v = v0 << 12
  for (let i = 17; i >= 12; i--) {
    if ((v >>> i) & 1) v ^= 0x1f25 << (i - 12)
  }
  return (v0 << 12) | v
}

/** 掩码条件：返回 true 表示该模块要取反（row = y，col = x） */
function maskFlip(mask, row, col) {
  switch (mask) {
    case 0: return (row + col) % 2 === 0
    case 1: return row % 2 === 0
    case 2: return col % 3 === 0
    case 3: return (row + col) % 3 === 0
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0
    default: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0
  }
}

/**
 * 画好功能图形、留出数据区的底图。
 * grid: -1 未定（数据区）、0 白、1 黑； res: 1 表示功能图形，不能写字数据。
 */
function buildFunctionMap(version) {
  const size = version * 4 + 17
  const grid = new Int8Array(size * size).fill(-1)
  const res = new Uint8Array(size * size)
  const put = (r, c, dark) => {
    grid[r * size + c] = dark ? 1 : 0
    res[r * size + c] = 1
  }
  const inBox = (r, c) => r >= 0 && c >= 0 && r < size && c < size

  // 定时图形：整行整列按奇偶交替，随后会被定位图形覆盖掉属于它的部分
  for (let i = 0; i < size; i++) {
    put(6, i, i % 2 === 0)
    put(i, 6, i % 2 === 0)
  }

  // 三个定位图形 + 分隔符（7×7 黑环 + 白环 + 3×3 黑心，外围一圈白）
  const finder = (or, oc) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        if (!inBox(or + r, oc + c)) continue
        const ring = (r === 0 || r === 6 || c === 0 || c === 6) && r >= 0 && r <= 6 && c >= 0 && c <= 6
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4
        put(or + r, oc + c, ring || core)
      }
    }
  }
  finder(0, 0)
  finder(0, size - 7)
  finder(size - 7, 0)

  // 校正图形：跳过与定位图形重叠的位置
  if (version >= 2) {
    const cs = ALIGN_CENTERS[version - 1].split(',').map(Number)
    for (const r of cs) {
      for (const c of cs) {
        if (r <= 8 && c <= 8) continue
        if (r <= 8 && c >= size - 9) continue
        if (r >= size - 9 && c <= 8) continue
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            put(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1)
          }
        }
      }
    }
  }

  // 恒黑模块
  put(size - 8, 8, true)

  // format info 区（两份）
  const fa = FMT_POS_A
  for (const [r, c] of fa) if (inBox(r, c)) put(r, c, false)
  const fb = fmtPosB(size)
  for (const [r, c] of fb) if (inBox(r, c)) put(r, c, false)

  // version info 区（≥7 版本才有）
  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const a = Math.floor(i / 3)
      const b = (i % 3) + size - 11
      put(a, b, false)
      put(b, a, false)
    }
  }
  return { grid, res, size }
}

/** zigzag 写入：两列一组、自下而上与自上而下交替，跳过功能图形 */
function walkDataCells(size, res, handle) {
  let bitIndex = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    const upward = ((right + 1) & 2) === 0
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j
        const row = upward ? size - 1 - vert : vert
        const idx = row * size + col
        if (res[idx]) continue
        handle(idx, row, col, bitIndex)
        bitIndex++
      }
    }
  }
  return bitIndex
}

function writeCodewords(grid, res, size, codewords) {
  const bits = []
  for (let i = 0; i < codewords.length; i++) {
    for (let j = 7; j >= 0; j--) bits.push((codewords[i] >>> j) & 1)
  }
  let k = 0
  walkDataCells(size, res, (idx, row, col, i) => {
    grid[idx] = i < bits.length ? bits[i] : 0
    k++
  })
  return k
}

function applyMask(grid, res, size, mask) {
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const idx = row * size + col
      if (!res[idx] && maskFlip(mask, row, col)) grid[idx] ^= 1
    }
  }
}

function placeFormatAndVersion(grid, size, version, elevel, mask) {
  const fb = fmtPosB(size)
  const fmt = formatInfoBits(elevel, mask)
  for (let i = 0; i < 15; i++) {
    // 位置表的第 i 格放 format 值的第 (14-i) 位（bit14 落在 (8,0)，与真实二维码一致）
    const bit = (fmt >>> (14 - i)) & 1
    const a = FMT_POS_A[i]
    grid[a[0] * size + a[1]] = bit
    grid[fb[i][0] * size + fb[i][1]] = bit
  }
  if (version >= 7) {
    const ver = versionInfoBits(version)
    for (let i = 0; i < 18; i++) {
      const bit = (ver >>> i) & 1
      const a = Math.floor(i / 3)
      const b = (i % 3) + size - 11
      grid[a * size + b] = bit
      grid[b * size + a] = bit
    }
  }
}

/**
 * 罚分（ISO/IEC 18004 四条评价条件）：
 *   规则一 行/列里长度 ≥5 的同色游程，各计 3 +（游程长 - 5）；
 *   规则二 每个同色 2×2 块计 3；
 *   规则三 出现与定位图形同比例的 1:1:3:1:1（1011101）且单侧带 4 个白模块，
 *          每处计 40。符号外的静区按白处理，所以定位图形自身的中行/中列也会被计入；
 *   规则四 黑模块占比偏离 50% 每满 5 个百分点计 10。
 */
const FINDER_LIKE_A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0]
const FINDER_LIKE_B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
const PEN_PAD = QUIET_ZONE
function penaltyScore(grid, size) {
  let score = 0
  const get = (r, c) => grid[r * size + c]
  // 规则一 + 规则三（行、列各扫一遍）
  const line = (count, read) => {
    let runLen = 1
    for (let i = 1; i <= count; i++) {
      if (i < count && read(i) === read(i - 1)) {
        runLen++
        continue
      }
      if (runLen >= 5) score += 3 + (runLen - 5)
      runLen = 1
    }
    // 规则三：左右各补 4 个白模块，命中 10111010000 / 00001011101 记 40
    const pad = new Array(count + PEN_PAD * 2).fill(0)
    for (let i = 0; i < count; i++) pad[PEN_PAD + i] = read(i) ? 1 : 0
    for (let i = 0; i + 11 <= pad.length; i++) {
      let a = true
      let b = true
      for (let j = 0; j < 11; j++) {
        const v = pad[i + j]
        if (v !== FINDER_LIKE_A[j]) a = false
        if (v !== FINDER_LIKE_B[j]) b = false
        if (!a && !b) break
      }
      if (a) score += 40
      if (b) score += 40
    }
  }
  for (let r = 0; r < size; r++) line(size, (i) => get(r, i))
  for (let c = 0; c < size; c++) line(size, (i) => get(i, c))
  // 规则二
  for (let r = 0; r + 1 < size; r++) {
    for (let c = 0; c + 1 < size; c++) {
      const v = get(r, c)
      if (v === get(r, c + 1) && v === get(r + 1, c) && v === get(r + 1, c + 1)) score += 3
    }
  }
  // 规则四
  let dark = 0
  for (let i = 0; i < grid.length; i++) if (grid[i]) dark++
  const percent = (dark * 100) / (size * size)
  score += Math.floor(Math.abs(percent - 50) / 5) * 10
  return score
}

function toBoolMatrix(grid, size) {
  const out = []
  for (let r = 0; r < size; r++) {
    const row = new Array(size)
    for (let c = 0; c < size; c++) row[c] = grid[r * size + c] === 1
    out.push(row)
  }
  return out
}

/* ============================ 对外：编码 ============================ */

/**
 * 编码一段文本为二维码
 * @param {string} text 内容（支持中文 / emoji，按 UTF-8 走字节模式）
 * @param {{elevel?:string, version?:number, mask?:number}} [opts] mask 传 0–7 可指定掩码，默认罚分选优
 * @returns {{modules:boolean[][], size:number, version:number, elevel:string, mask:number,
 *   penalty:number, mode:string, segments:Array, bitLength:number, usedRatio:number,
 *   dataCodewords:number, codewords:number, blocks:number, eccPerBlock:number,
 *   capacity:Object, text:string, darkModule:boolean}}
 */
export function encode(text, opts) {
  const o = opts || {}
  const str = text === null || text === undefined ? '' : String(text)
  if (!str) throw new Error('内容为空，先生成一段文字或链接')
  const elevel = normElevel(o.elevel || 'M')
  const forced = normVersion(o.version)

  let segments
  let version = forced
  if (!version) {
    const picked = autoPickVersion(str, elevel)
    segments = picked.segments
    version = picked.version
    if (!version) {
      const cap40 = capacityOf(40, elevel)
      throw new Error(
        '内容超出容量：' + elevel + ' 级最大版本 40 只能装 ' + cap40.byte + ' 个字节（当前 ' + utf8Bytes(str).length + ' 字节）。换低纠错等级（H→Q→M→L）或缩短内容'
      )
    }
  } else {
    segments = planSegments(classRuns(str), version)
    const bitsHere = buildBits(segments, version)
    const cap = blockInfo(version, elevel).dataCodewords * 8
    if (bitsHere.length > cap) {
      const capHere = capacityOf(version, elevel)
      throw new Error(
        '版本 ' + version + '-' + elevel + ' 装不下：字节模式上限 ' + capHere.byte + ' 字节，当前 ' + utf8Bytes(str).length + ' 字节。换低纠错等级或缩短内容，或把版本改回自动'
      )
    }
  }

  const info = blockInfo(version, elevel)
  const bits = buildBits(segments, version)
  const dataCw = toDataCodewords(bits, info.dataCodewords * 8)
  if (!dataCw) {
    throw new Error('内容超出容量。换低纠错等级或缩短内容')
  }
  const { final, dataBlocks, eccBlocks } = interleave(dataCw, info)

  const base = buildFunctionMap(version)
  const wantMask = o.mask === undefined || o.mask === null || o.mask === '' ? -1 : Number(o.mask)
  if (wantMask !== -1 && (!(wantMask >= 0 && wantMask <= 7) || wantMask % 1)) throw new Error('掩码只能是 0–7 或留空（自动选优）')

  const render = (m) => {
    const g = base.grid.slice()
    writeCodewords(g, base.res, base.size, final)
    applyMask(g, base.res, base.size, m)
    placeFormatAndVersion(g, base.size, version, elevel, m)
    return g
  }

  let best = null
  if (wantMask >= 0) {
    const g = render(wantMask)
    best = { mask: wantMask, score: penaltyScore(g, base.size), grid: g }
  } else {
    for (let m = 0; m <= 7; m++) {
      const g = render(m)
      const s = penaltyScore(g, base.size)
      if (!best || s < best.score) best = { mask: m, score: s, grid: g }
    }
  }
  const grid = best.grid
  const capacityBits = info.dataCodewords * 8

  return {
    modules: toBoolMatrix(grid, base.size),
    size: base.size,
    version,
    elevel,
    mask: best.mask,
    penalty: best.score,
    mode: overallMode(segments),
    segments: segments.map((s) => ({
      mode: s.mode,
      chars: Array.from(s.text).length,
      bytes: s.mode === 'byte' ? utf8Bytes(s.text).length : s.text.length,
      bits: segmentBits(s.mode, s.mode === 'byte' ? utf8Bytes(s.text).length : s.text.length, version),
    })),
    bitLength: bits.length,
    /** 数据区占用比（0–1），视图里换算成百分比进度条 */
    usedRatio: capacityBits ? bits.length / capacityBits : 0,
    dataCodewords: info.dataCodewords,
    codewords: info.totalCodewords,
    dataBytes: Array.from(dataCw),
    finalBytes: Array.from(final),
    eccBytes: dataBlocks.reduce((acc, _, i) => acc.concat(Array.from(eccBlocks[i])), []),
    blocks: info.blocks,
    eccPerBlock: info.eccPerBlock,
    capacity: capacityOf(version, elevel),
    bytes: utf8Bytes(str).length,
    text: str,
    darkModule: grid[(base.size - 8) * base.size + 8] === 1,
  }
}

/**
 * 某版本的功能图形占用（结构自校验用）：
 * 数据格子数应当等于「总码字数 × 8 + 该版本的余比特」。
 * @param {number} version
 */
export function layoutStats(version) {
  const v = Number(version)
  if (!v || v < 1 || v > 40) throw new Error('版本号要落在 1–40')
  const { res, size } = buildFunctionMap(v)
  let dataCells = 0
  for (let i = 0; i < res.length; i++) if (!res[i]) dataCells++
  const levels = {}
  for (const e of ELEVEL_ORDER) levels[e] = blockInfo(v, e).totalCodewords
  return {
    version: v,
    size,
    modules: size * size,
    functionCells: size * size - dataCells,
    dataCells,
    totalCodewords: Math.floor(dataCells / 8),
    remainderBits: dataCells % 8,
    levels,
  }
}

/* ============================ 对外：最小解码（自检用） ============================ */

/**
 * 从模块矩阵把内容解回来：读 format → 定等级与掩码 → 逆掩码 → zigzag 取码字 →
 * 反交错 → RS 伴随式校验 → 按段还原原文。
 * 只做校验不做纠错（自测数据本身没有误码），遇到 Kanji / ECI 直接报错。
 * @param {boolean[][]} modules
 * @returns {{text:string, version:number, elevel:string, mask:number, mode:string,
 *   segments:Array, syndromesOk:boolean, corrected:boolean}}
 */
export function decodeMatrix(modules) {
  const size = modules.length
  if (!size || size % 4 !== 1 || size < 21 || size > 177) throw new Error('矩阵尺寸不像二维码（应为 21–177 且 mod 4 = 1）')
  const version = (size - 17) / 4
  const flat = new Int8Array(size * size)
  for (let r = 0; r < size; r++) {
    if (!modules[r] || modules[r].length !== size) throw new Error('矩阵不是正方形')
    for (let c = 0; c < size; c++) flat[r * size + c] = modules[r][c] ? 1 : 0
  }

  // ---- format info：两份拷贝都验一遍 BCH ----
  const fb = fmtPosB(size)
  const read15 = (pos) => {
    let acc = 0
    for (let i = 0; i < 15; i++) acc |= (flat[pos[i][0] * size + pos[i][1]] & 1) << (14 - i)
    return acc
  }
  const bchOk = (fifteen) => {
    let v = fifteen ^ 0x5412
    for (let i = 14; i >= 10; i--) {
      if ((v >>> i) & 1) v ^= 0x537 << (i - 10)
    }
    return (v & 0x3ff) === 0
  }
  const ELEVEL_BY_FMT = { 0b01: 'L', 0b00: 'M', 0b11: 'Q', 0b10: 'H' }
  const decode15 = (fifteen) => {
    const raw = fifteen ^ 0x5412
    return { elevel: ELEVEL_BY_FMT[(raw >>> 13) & 3], mask: (raw >>> 10) & 7 }
  }
  let fmt = null
  const cand = [read15(FMT_POS_A), read15(fb)]
  for (const c of cand) {
    if (bchOk(c)) {
      fmt = decode15(c)
      break
    }
  }
  if (!fmt || !fmt.elevel) throw new Error('format info 校验失败，不是合法二维码')

  // ---- 逆掩码 + 取码字 ----
  const { res } = buildFunctionMap(version)
  const flipped = Int8Array.from(flat)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const idx = r * size + c
      if (!res[idx] && maskFlip(fmt.mask, r, c)) flipped[idx] ^= 1
    }
  }
  const info = blockInfo(version, fmt.elevel)
  const bits = []
  walkDataCells(size, res, (idx, row, col, i) => {
    bits[i] = flipped[idx]
  })
  const total = info.totalCodewords
  const cw = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    let acc = 0
    for (let j = 0; j < 8; j++) acc = (acc << 1) | (bits[i * 8 + j] || 0)
    cw[i] = acc
  }

  // ---- 反交错 ----
  const { blocks, shortLen, longBlocks, eccPerBlock } = info
  const lens = []
  for (let i = 0; i < blocks; i++) lens.push(shortLen + (i >= blocks - longBlocks ? 1 : 0))
  const dataBlocks = lens.map((l) => new Uint8Array(l))
  const eccBlocks = lens.map(() => new Uint8Array(eccPerBlock))
  let p = 0
  const maxLen = shortLen + 1
  for (let i = 0; i < maxLen; i++) {
    for (let b = 0; b < blocks; b++) {
      if (i < lens[b]) dataBlocks[b][i] = cw[p++]
    }
  }
  for (let i = 0; i < eccPerBlock; i++) {
    for (let b = 0; b < blocks; b++) eccBlocks[b][i] = cw[p++]
  }
  let syndromesOk = true
  for (let b = 0; b < blocks; b++) {
    const full = new Uint8Array(lens[b] + eccPerBlock)
    full.set(dataBlocks[b], 0)
    full.set(eccBlocks[b], lens[b])
    const syn = rsSyndromes(full, eccPerBlock)
    if (syn.some((s) => s !== 0)) syndromesOk = false
  }
  if (!syndromesOk) throw new Error('RS 伴随式非零，码字与纠错位不自洽')

  const data = new Uint8Array(info.dataCodewords)
  let q = 0
  for (let b = 0; b < blocks; b++) {
    data.set(dataBlocks[b], q)
    q += lens[b]
  }

  // ---- 按段解原文 ----
  const all = []
  for (let i = 0; i < data.length; i++) {
    for (let j = 7; j >= 0; j--) all.push((data[i] >>> j) & 1)
  }
  let cur = 0
  const take = (n) => {
    let acc = 0
    for (let i = 0; i < n; i++) acc = (acc << 1) | (all[cur++] || 0)
    return acc
  }
  const segs = []
  let text = ''
  for (let guard = 0; guard < 64; guard++) {
    if (cur + 4 > all.length) break
    const mode = take(4)
    if (mode === 0) break
    if (mode === MODE_BITS.numeric) {
      const len = take(cciBits('numeric', version))
      let s = ''
      let left = len
      while (left >= 3) {
        s += String(take(10)).padStart(3, '0')
        left -= 3
      }
      if (left === 2) s += String(take(7)).padStart(2, '0')
      else if (left === 1) s += String(take(4)).padStart(1, '0')
      text += s
      segs.push({ mode: 'numeric', chars: len })
    } else if (mode === MODE_BITS.alphanumeric) {
      const len = take(cciBits('alphanumeric', version))
      let s = ''
      for (let i = 0; i + 1 < len; i += 2) {
        const v = take(11)
        s += ALNUM_CHARS[Math.floor(v / 45)] + ALNUM_CHARS[v % 45]
      }
      if (len % 2) s += ALNUM_CHARS[take(6)]
      text += s
      segs.push({ mode: 'alphanumeric', chars: len })
    } else if (mode === MODE_BITS.byte) {
      const len = take(cciBits('byte', version))
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) bytes[i] = take(8)
      text += bytesUtf8(bytes)
      segs.push({ mode: 'byte', chars: len })
    } else {
      throw new Error('解码器只支持数字 / 字母数字 / 字节模式，遇到模式位 ' + mode.toString(2))
    }
    if (cur + 4 > all.length) break
  }
  return {
    text,
    version,
    elevel: fmt.elevel,
    mask: fmt.mask,
    mode: segs.length === 1 ? segs[0].mode : 'mixed',
    segments: segs,
    syndromesOk,
    corrected: false,
  }
}

/* ============================ 对外：渲染辅助 ============================ */

/**
 * 模块矩阵 → 独立 SVG 文本（可直接粘进 HTML / 设计稿）
 * @param {boolean[][]} modules
 * @param {{scale?:number, margin?:number, dark?:string, light?:string}} [opts]
 */
export function toSvgMatrix(modules, opts) {
  const o = opts || {}
  const size = modules.length
  const scale = Math.max(1, Number(o.scale) || 4)
  const margin = Number(o.margin === undefined ? scale * 4 : o.margin)
  const dark = o.dark || '#000000'
  const light = o.light || '#ffffff'
  const px = size * scale + margin * 2
  let d = ''
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) d += 'M' + (margin + c * scale) + ' ' + (margin + r * scale) + 'h' + scale + 'v' + scale + 'h-' + scale + 'z'
    }
  }
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px + '" viewBox="0 0 ' + px + ' ' + px +
    '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="' + light + '"/><path d="' + d + '" fill="' + dark + '"/></svg>'
  )
}

/* ============================ 结构化内容生成器 ============================ */

/**
 * Wi-Fi 配置：WIFI:T:<认证>;S:<SSID>;P:<密码>;H:<是否隐藏>;;
 * 转义规则：SSID / 密码里的 \\ ; , : " 前面要补反斜杠（ZBar / Android / iOS 同一套规则）
 */
export function buildWifi(payload) {
  const o = payload || {}
  const esc = (s) => String(s || '').replace(/([\\;,:"])/g, '\\$1')
  const auth = o.auth === 'nopass' ? 'nopass' : o.auth === 'WEP' ? 'WEP' : 'WPA'
  let out = 'WIFI:T:' + auth + ';S:' + esc(o.ssid) + ';'
  if (auth !== 'nopass') out += 'P:' + esc(o.password) + ';'
  if (o.hidden) out += 'H:true;'
  return out + ';'
}

/**
 * 名片 vCard 3.0：BEGIN:VCARD / VERSION:3.0 … END:VCARD
 * 换行用 \r\n；值里的 ; , \ 要先转义，换行转成 \\n（vCard 3.0 的写法）
 */
export function buildVCard(payload) {
  const o = payload || {}
  const esc = (s) =>
    String(s || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n')
  const lines = ['BEGIN:VCARD', 'VERSION:3.0']
  lines.push('N:' + esc(o.last || o.name) + ';' + esc(o.first) + ';;;')
  lines.push('FN:' + esc(o.name || [o.last, o.first].filter(Boolean).join('')))
  if (o.org) lines.push('ORG:' + esc(o.org))
  if (o.title) lines.push('TITLE:' + esc(o.title))
  if (o.tel) lines.push('TEL;TYPE=CELL:' + esc(o.tel))
  if (o.email) lines.push('EMAIL;TYPE=INTERNET:' + esc(o.email))
  if (o.url) lines.push('URL:' + esc(o.url))
  if (o.addr) lines.push('ADR;TYPE=WORK:;;' + esc(o.addr) + ';;;;')
  if (o.note) lines.push('NOTE:' + esc(o.note))
  lines.push('END:VCARD')
  return lines.join('\r\n')
}

/** 常见网址前缀快填 */
export const QR_SAMPLES = [
  { label: '网址', value: 'https://example.com/pocketkit' },
  { label: '中文', value: '随身匣 · 离线工具箱' },
  { label: '纯数字', value: '13800138000' },
  { label: '字母数字', value: 'POCKET-KIT 2026' },
  { label: 'Wi-Fi', value: 'WIFI:T:WPA;S:MyRouter;P:passw0rd;;' },
  { label: '名片', value: 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:张三\r\nTEL:13800138000\r\nEND:VCARD' },
]

/** 纠错等级说明（视图里的分段副标题与说明卡共用） */
export const ELEVEL_INFO = [
  { key: 'L', name: 'L 约 7%', desc: '恢复约 7% 码字，最省空间，干净环境贴纸上用' },
  { key: 'M', name: 'M 约 15%', desc: '恢复约 15%，日常扫码的推荐档' },
  { key: 'Q', name: 'Q 约 25%', desc: '恢复约 25%，适合会被折一下、有磨损的场景' },
  { key: 'H', name: 'H 约 30%', desc: '恢复约 30%，最高冗余，常用于带 logo 的码' },
]
