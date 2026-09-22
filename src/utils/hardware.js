/**
 * 硬件测试的计算层：正弦音与扫频音的 WAV 字节、亮度/音量的归一、测试项清单。
 *
 * 为什么 WAV 要在这里手写：扬声器测试得有一段干净的单频音，而工程零第三方依赖，
 * 也不想为了一个测试音去下一个音频库。PCM16 + 44 字节 RIFF 头是公开格式，
 * 手写出来还能在 Node 里逐字节验（长度、采样率字段、峰值、淡入淡出、左右声道），
 * 比拿别人的文件盲放靠谱得多。
 *
 * 这一层同样不碰 plus / uni：硬件调用一律走 utils/native.js，这里只负责「该发什么数」。
 */

import { bytesToBase64 } from './base64'

/** WAV 头固定 44 字节（PCM16、无扩展块） */
export const WAV_HEADER = 44

/** 单次发声最长时长，超过就拒：手机内存里堆几十秒音频没意义，也可能把播放卡住 */
export const MAX_TONE_MS = 6000

/** 淡入淡出的采样数上限：约 5 ms，够消掉咔哒声又不至于吃掉有效时长 */
export const RAMP_CAP = 220

/* ------------------------------------------------------------------ *
 *  字节序写入：RIFF 是小端
 * ------------------------------------------------------------------ */

function putStr(bytes, at, s) {
  for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i)
  return at + s.length
}
function putU32(bytes, at, v) {
  bytes[at] = v & 255
  bytes[at + 1] = (v >> 8) & 255
  bytes[at + 2] = (v >> 16) & 255
  bytes[at + 3] = (v >> 24) & 255
  return at + 4
}
function putU16(bytes, at, v) {
  bytes[at] = v & 255
  bytes[at + 1] = (v >> 8) & 255
  return at + 2
}
function putI16(bytes, at, v) {
  const u = v < 0 ? 0x10000 + v : v
  return putU16(bytes, at, u)
}

/* ------------------------------------------------------------------ *
 *  包络与声道增益
 * ------------------------------------------------------------------ */

/** 淡入淡出系数：两端各 ramp 个采样线性爬升/回落，中间为 1 */
export function envelope(i, frames, ramp) {
  const r = ramp === undefined ? Math.min(RAMP_CAP, Math.max(1, Math.floor(frames * 0.05))) : ramp
  if (r <= 0) return 1
  if (i < r) return i / r
  if (i > frames - 1 - r) return Math.max(0, frames - 1 - i) / r
  return 1
}

/** 声道：'left' / 'right' / 'both' → 左右各多少增益 */
export function channelGain(ch) {
  if (ch === 'left') return { l: 1, r: 0 }
  if (ch === 'right') return { l: 0, r: 1 }
  return { l: 1, r: 1 }
}

/* ------------------------------------------------------------------ *
 *  WAV 装配
 * ------------------------------------------------------------------ */

function wavHeader(frames, rate, channels) {
  const dataBytes = frames * channels * 2
  const bytes = new Uint8Array(WAV_HEADER + dataBytes)
  let at = 0
  at = putStr(bytes, at, 'RIFF')
  at = putU32(bytes, at, 36 + dataBytes)
  at = putStr(bytes, at, 'WAVE')
  at = putStr(bytes, at, 'fmt ')
  at = putU32(bytes, at, 16)
  at = putU16(bytes, at, 1) // PCM
  at = putU16(bytes, at, channels)
  at = putU32(bytes, at, rate)
  at = putU32(bytes, at, rate * channels * 2)
  at = putU16(bytes, at, channels * 2)
  at = putU16(bytes, at, 16)
  at = putStr(bytes, at, 'data')
  putU32(bytes, at, dataBytes)
  return bytes
}

/** 采样函数 → 完整 WAV。samples(i) 返回 -1~1 的单声道幅度。 */
function assemble(sampleAt, opts) {
  const rate = opts.rate || 44100
  const ms = opts.ms === undefined || opts.ms === null ? 500 : Number(opts.ms)
  if (!(rate >= 8000 && rate <= 48000)) throw new Error('采样率要在 8000 到 48000 之间，现在 ' + rate)
  if (!(ms > 0)) throw new Error('发声时长要大于 0 毫秒')
  if (ms > MAX_TONE_MS) throw new Error('单次最长 ' + MAX_TONE_MS + ' 毫秒，太长的音测试没意义还占内存')
  const vol = Math.min(1, Math.max(0, opts.volume === undefined ? 0.55 : Number(opts.volume)))
  const g = channelGain(opts.channel)
  const frames = Math.round((rate * ms) / 1000)
  const bytes = wavHeader(frames, rate, 2)
  let peak = 0
  for (let i = 0; i < frames; i++) {
    const s0 = sampleAt(i)
    const s = (isFinite(s0) ? s0 : 0) * envelope(i, frames) * vol
    const li = Math.round(s * g.l * 32767)
    const ri = Math.round(s * g.r * 32767)
    const lv = Math.max(-32768, Math.min(32767, li))
    const rv = Math.max(-32768, Math.min(32767, ri))
    if (Math.abs(lv) > peak) peak = Math.abs(lv)
    if (Math.abs(rv) > peak) peak = Math.abs(rv)
    putI16(bytes, WAV_HEADER + i * 4, lv)
    putI16(bytes, WAV_HEADER + i * 4 + 2, rv)
  }
  const b64 = bytesToBase64(bytes)
  return {
    bytes,
    base64: b64,
    url: 'data:audio/wav;base64,' + b64,
    frames,
    rate,
    ms,
    channel: opts.channel === 'left' || opts.channel === 'right' ? opts.channel : 'both',
    volume: vol,
    peak,
    bytesLength: bytes.length,
    kb: Math.round((bytes.length / 1024) * 10) / 10,
  }
}

/** 单频正弦音：扬声器/左右声道测试用它 */
export function toneWav(freq, opts) {
  const f = Number(freq)
  if (!(f > 0)) throw new Error('频率要是个大于 0 的数')
  if (f > 24000) throw new Error('频率超过 24 kHz 了，44.1 kHz 采样也放不下')
  const o = opts || {}
  const rate = o.rate || 44100
  const step = (2 * Math.PI * f) / rate
  return assemble((i) => Math.sin(step * i), o)
}

/**
 * 对数扫频（chirp）：从 from 平滑滑到 to，用来一次放过整段频率。
 * 相位按瞬时频率积分，所以听起来是匀速滑过去的，不是分段跳。
 */
export function sweepWav(from, to, opts) {
  const a = Number(from)
  const b = Number(to)
  if (!(a > 0 && b > 0)) throw new Error('扫频的起止频率都要大于 0')
  const o = opts || {}
  const rate = o.rate || 44100
  const ms = o.ms === undefined || o.ms === null ? 3000 : Number(o.ms)
  const frames = Math.round((rate * ms) / 1000)
  if (frames < 2) throw new Error('扫频时长太短，装不下一个完整的滑变')
  const k = b / a
  const T = ms / 1000
  return assemble((i) => {
    // 起止同频时 ln(k)=0，式子会炸，直接按定频处理
    if (Math.abs(k - 1) < 1e-9) return Math.sin((2 * Math.PI * a * i) / rate)
    const t = i / (frames - 1)
    const phase = 2 * Math.PI * a * T * (Math.pow(k, t) - 1) / Math.log(k)
    return Math.sin(phase)
  }, Object.assign({ rate, ms }, o))
}

/** 白噪声：测环境声和是否串扰用；同一套 assemble，样本换成伪随机 */
export function noiseWav(opts) {
  const o = opts || {}
  const ms = o.ms === undefined || o.ms === null ? 1000 : Number(o.ms)
  const frames = Math.round(((o.rate || 44100) * ms) / 1000)
  let seed = o.seed === undefined ? 20260921 : Number(o.seed)
  return assemble(() => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return (seed / 0x7fffffff) * 2 - 1
  }, Object.assign({ ms }, o))
}

/* ------------------------------------------------------------------ *
 *  预设：页面上的按钮直接来自这张表
 * ------------------------------------------------------------------ */

export const TONE_PRESETS = [
  { key: 'low', name: '低频 60 Hz', freq: 60, ms: 1200, hint: '看低音单元有没有破音、振不振得起来' },
  { key: 'voice', name: '人声 440 Hz', freq: 440, ms: 900, hint: '最容易被听出来的一段，先拿它校准音量' },
  { key: 'speech', name: '语音段 1 kHz', freq: 1000, ms: 800, hint: '通话与播报主要落在这附近' },
  { key: 'high', name: '高频 12 kHz', freq: 12000, ms: 1000, hint: '高频糊成一片或完全没声，多半是单元或腔体的问题' },
  { key: 'left', name: '只放左声道', freq: 440, ms: 1000, channel: 'left', hint: '应该只有左边出声' },
  { key: 'right', name: '只放右声道', freq: 440, ms: 1000, channel: 'right', hint: '应该只有右边出声' },
]

export const SWEEP_PRESET = { key: 'sweep', name: '扫频 80 → 14 kHz', from: 80, to: 14000, ms: 4000, hint: '一整段频率一次放过，中间某处发闷或咔哒就是那个频段有问题' }
export const NOISE_PRESET = { key: 'noise', name: '白噪声 1 秒', ms: 1000, hint: '听有没有沙沙的底噪和杂音' }

/** 生成一个预设对应的音频，失败时抛中文错误 */
export function presetAudio(preset) {
  if (!preset) throw new Error('没选中要播的声音')
  if (preset.from && preset.to) return sweepWav(preset.from, preset.to, { ms: preset.ms, channel: preset.channel })
  if (preset.freq === undefined && !preset.ms) throw new Error('这个预设既没频率也没时长')
  if (preset.freq === undefined) return noiseWav({ ms: preset.ms, channel: preset.channel })
  return toneWav(preset.freq, { ms: preset.ms, channel: preset.channel })
}

/* ------------------------------------------------------------------ *
 *  亮度 / 音量 / 常亮
 * ------------------------------------------------------------------ */

/** uni 的亮度值域是 0~1，页面按百分数显示；越界一律截断而不是报错，没读就是没读 */
export function brightnessPercent(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!isFinite(n)) return null
  return Math.round(Math.min(1, Math.max(0, n)) * 100)
}

export function brightnessValue(percent) {
  const n = Number(percent)
  if (!isFinite(n)) throw new Error('亮度得是个数字')
  if (n < 0 || n > 100) throw new Error('亮度在 0~100 之间，现在 ' + n)
  return Math.round(Math.min(1, Math.max(0, n / 100)) * 1000) / 1000
}

/** 亮度档位的口语判读，避免把 0.02 直接甩给用户看。入参是百分数 */
export function brightnessGrade(percent) {
  const n = Number(percent)
  if (!isFinite(n)) return '读不到'
  const p = Math.min(100, Math.max(0, n))
  if (p <= 2) return '接近最暗'
  if (p <= 20) return '很暗'
  if (p <= 45) return '偏暗'
  if (p <= 70) return '适中'
  if (p < 100) return '偏亮'
  return '最亮'
}

/** 震动档位：uni.vibrateShort 的 type 三档 */
export const VIBRATE_LEVELS = [
  { key: 'light', name: '轻' },
  { key: 'medium', name: '中' },
  { key: 'heavy', name: '重' },
]

/**
 * 闪光灯自动回秒：常亮会烧手也费电，所以给了上限。
 * 返回实际要用的毫秒数（越界截断），非法输入按默认 1500ms。
 */
export function torchMs(ms, max) {
  const lim = max && max > 0 ? max : 5000
  const n = Number(ms)
  if (!isFinite(n) || n <= 0) return 1500
  return Math.min(lim, Math.round(n))
}

/* ------------------------------------------------------------------ *
 *  测试项清单：视图按这张表渲染，缺接口的项自己显示降级说明
 * ------------------------------------------------------------------ */

export const HARDWARE_ITEMS = [
  { key: 'vibrate', name: '震动', glyph: '震', api: 'vibrateShort', desc: '短震动和三档强弱各来一次，感受马达是否正常起停。' },
  { key: 'torch', name: '闪光灯', glyph: '闪', api: 'setTorchMode', desc: '点亮后自动在设定的秒数后熄灭，不会一直开着。' },
  { key: 'screen', name: '屏幕常亮与亮度', glyph: '亮', api: 'setKeepScreenOn', desc: '常亮开关，加上读当前亮度、临时拉到最暗和最亮。' },
  { key: 'speaker', name: '扬声器与听筒', glyph: '响', api: 'createInnerAudioContext', desc: '单频、左右声道、扫频、白噪声各一段，全部本机合成，不联网。' },
  { key: 'volume', name: '音量键与铃声', glyph: '量', api: 'getAvailableVolumeLevel', desc: '读系统媒体音量档位，提醒你把媒体音量而不是铃声音量打开。' },
]

/** 一段音频的展示摘要，避免把 base64 甩到屏幕上 */
export function audioLabel(wav) {
  if (!wav) return ''
  const ch = wav.channel === 'both' ? '双声道' : wav.channel === 'left' ? '左声道' : '右声道'
  return wav.ms + ' ms · ' + wav.rate + ' Hz · ' + ch + ' · ' + wav.kb + ' KB'
}
