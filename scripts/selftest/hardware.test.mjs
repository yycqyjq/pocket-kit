/**
 * hardware.js 自查断言（直接测 src/utils/hardware.js 本体）
 * ------------------------------------------------------------
 * 扬声器测试用的音频是这里手写的 PCM16 WAV，所以判据全是「格式规范 + 信号常识」这两类
 * 与本实现无关的独立事实：
 *   1) RIFF 头逐字段对齐公开规范（含 36+N 的块长、byteRate = 采样率×通道×2）；
 *   2) 500 Hz / 8 kHz 的整数周期正弦：四分之一周期正好 4 个采样，
 *      所以峰值必须等于 round(32767×音量)，过零次数必须约等于 2×频率×时长；
 *   3) 全周期正弦的平均绝对值趋于 2/π × 幅值，直流分量趋于 0；
 *   4) 对数扫频后半段的过零数必须明显多于前半段（频率在往上滑）。
 * Base64 那一路拿 Node 的 Buffer 当外部判官，不跟自己比。
 * 视图里唯一测不到的，是把 data URL 交给 createInnerAudioContext 之后的出声。
 */
import { useUtils } from './harness.mjs'

const H = await useUtils('hardware')
const B = await useUtils('base64')

let ok = 0
let fail = 0
function is(a, b, m) {
  if (a === b) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b))
  }
}
function near(a, b, tol, m) {
  if (Math.abs(a - b) <= tol) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + a + ' want ' + b + ' ±' + tol)
  }
}
function inRange(v, lo, hi, m) {
  if (v >= lo && v <= hi) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': ' + v + ' 不在 [' + lo + ',' + hi + ']')
  }
}
function throws(fn, m) {
  try {
    fn()
    fail++
    console.log('FAIL ' + m + ': 没抛错')
  } catch (e) {
    const msg = (e && e.message) || String(e)
    if (!/[一-龥]/.test(msg)) {
      fail++
      console.log('FAIL ' + m + ': 报错不是中文 → ' + msg)
    } else ok++
  }
}
function str(bytes, at, n) {
  let s = ''
  for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[at + i])
  return s
}
function u32(bytes, at) {
  return bytes[at] + (bytes[at + 1] << 8) + (bytes[at + 2] << 16) + (bytes[at + 3] << 24)
}
function u16(bytes, at) {
  return bytes[at] + (bytes[at + 1] << 8)
}
function i16(bytes, at) {
  const v = u16(bytes, at)
  return v >= 0x8000 ? v - 0x10000 : v
}
/** 取某一声道的所有采样 */
function chan(bytes, frames, ch) {
  const out = []
  for (let i = 0; i < frames; i++) out.push(i16(bytes, H.WAV_HEADER + i * 4 + ch * 2))
  return out
}
function crossings(xs) {
  let n = 0
  for (let i = 1; i < xs.length; i++) if (xs[i] !== 0 && (xs[i - 1] === 0 || (xs[i] > 0) !== (xs[i - 1] > 0))) n++
  return n
}
function meanAbs(xs) {
  let s = 0
  for (const v of xs) s += Math.abs(v)
  return xs.length ? s / xs.length : 0
}
function mean(xs) {
  let s = 0
  for (const v of xs) s += v
  return xs.length ? s / xs.length : 0
}
function peak(xs) {
  let p = 0
  for (const v of xs) if (Math.abs(v) > p) p = Math.abs(v)
  return p
}

/* ---------- 0. 导出面 ---------- */
{
  const want = [
    'WAV_HEADER', 'MAX_TONE_MS', 'RAMP_CAP', 'envelope', 'channelGain', 'toneWav', 'sweepWav',
    'noiseWav', 'TONE_PRESETS', 'SWEEP_PRESET', 'NOISE_PRESET', 'presetAudio',
    'brightnessPercent', 'brightnessValue', 'brightnessGrade', 'VIBRATE_LEVELS', 'torchMs',
    'HARDWARE_ITEMS', 'audioLabel',
  ]
  for (const k of want) is(typeof H[k] !== 'undefined', true, '导出 ' + k)
  is(H.WAV_HEADER, 44, 'WAV 头 44 字节')
  is(typeof B.bytesToBase64, 'function', 'base64.js 也导出了字节版编码')
}

/* ---------- 1. RIFF 头逐字段 ---------- */
{
  const w = H.toneWav(500, { ms: 100, rate: 8000, volume: 0.55 })
  const b = w.bytes
  is(b.length, 44 + 800 * 4, '字节总数 = 头 + 双声道 800 帧')
  is(w.bytesLength, b.length, 'bytesLength 与本体一致')
  is(str(b, 0, 4), 'RIFF', 'RIFF 魔数')
  is(u32(b, 4), b.length - 8, '块长 = 总长 - 8')
  is(str(b, 8, 4), 'WAVE', 'WAVE 魔数')
  is(str(b, 12, 4), 'fmt ', 'fmt 子块')
  is(u32(b, 16), 16, 'fmt 块长 16')
  is(u16(b, 20), 1, 'audioFormat = 1（PCM）')
  is(u16(b, 22), 2, '双声道')
  is(u32(b, 24), 8000, '采样率')
  is(u32(b, 28), 8000 * 2 * 2, 'byteRate = 率×通道×2')
  is(u16(b, 32), 4, 'blockAlign = 通道×2')
  is(u16(b, 34), 16, '位深 16')
  is(str(b, 36, 4), 'data', 'data 子块')
  is(u32(b, 40), 800 * 4, 'data 长度')
  is(w.frames, 800, '帧数')
  is(w.rate, 8000, '回显采样率')
  is(w.channel, 'both', '默认双声道')
  is(w.kb, Math.round((b.length / 1024) * 10) / 10, 'KB 是展示值不是猜的')
}

/* ---------- 2. 采样值：能手算的几个点 ---------- */
{
  const w = H.toneWav(500, { ms: 100, rate: 8000, volume: 0.55 })
  const L = chan(w.bytes, w.frames, 0)
  const R = chan(w.bytes, w.frames, 1)
  // 8000/500 = 16 采样一周：峰在 i=4+16k，零在 8+16k，谷在 12+16k
  is(L[0], 0, '第一个采样是 0（淡入从 0 起）')
  is(L[L.length - 1], 0, '最后一个采样是 0（淡出回 0）')
  is(L[4], Math.round(32767 * 0.55 * 0.1), '淡入期内第一个峰值只爬到 1/4 幅（ramp=40）')
  is(L[84], Math.round(32767 * 0.55), '平台段峰值就是 round(32767×音量)')
  is(L[88], 0, '峰值后半周期过零')
  is(L[92], -L[84], '四分之三周期是负峰值（奇对称）')
  is(L[100], L[84], '下一个周期峰值同高（周期性）')
  is(peak(L), L[84], '全串峰值等于该点')
  is(w.peak, L[84], '返回的 peak 与实际一致')
  is(crossings(L), 100, '0.1 秒 × 500 Hz = 50 周 → 100 次过零')
  is(R[84], L[84], '双声道等幅')
  // 统计形状要拿长样本看，淡入淡出只占千分之几
  const wl = H.toneWav(500, { ms: 1000, rate: 8000, volume: 0.55 })
  const X = chan(wl.bytes, wl.frames, 0)
  is(X.length, 8000, '长样本帧数')
  near(meanAbs(X), (2 / Math.PI) * 32767 * 0.55, 0.03 * 32767 * 0.55, '正弦平均绝对值趋于 2/π×幅值')
  near(Math.abs(mean(X)), 0, 0.01 * 32767 * 0.55, '直流分量趋于 0')
  // 满音量与零音量
  is(peak(chan(H.toneWav(500, { ms: 100, rate: 8000, volume: 1 }).bytes, 800, 0)), 32767, '音量 1 时顶到满刻度')
  is(peak(chan(H.toneWav(500, { ms: 100, rate: 8000, volume: 0 }).bytes, 800, 0)), 0, '音量 0 就是静音')
  is(H.toneWav(500, { ms: 100, rate: 8000, volume: 5 }).volume, 1, '音量越上界截到 1')
  is(H.toneWav(500, { ms: 100, rate: 8000, volume: -3 }).volume, 0, '音量越下界截到 0')
  // 缺省音量
  const d = H.toneWav(440, { ms: 100, rate: 8000 })
  is(d.volume, 0.55, '缺省音量 0.55')
  is(d.frames, 800, '缺省 ms 也能算帧')
}

/* ---------- 3. 声道分离 ---------- */
{
  const l = H.toneWav(440, { ms: 100, rate: 8000, channel: 'left' })
  const r = H.toneWav(440, { ms: 100, rate: 8000, channel: 'right' })
  const L = chan(l.bytes, l.frames, 0)
  const R = chan(l.bytes, l.frames, 1)
  is(l.channel, 'left', '回显声道')
  is(peak(R), 0, '只放左声道时右声道全静音')
  is(peak(L) > 0, true, '左声道有声')
  is(peak(chan(r.bytes, r.frames, 0)), 0, '只放右声道时左声道全静音')
  is(peak(chan(r.bytes, r.frames, 1)) > 0, true, '右声道有声')
  is(r.channel, 'right', '右声道回显')
  is(H.channelGain('both').l + H.channelGain('both').r, 2, 'both 两路都是 1')
  is(H.channelGain('left').r, 0, 'left 右路为 0')
  is(H.channelGain('right').l, 0, 'right 左路为 0')
  is(H.channelGain(undefined).l, 1, '未知声道按双路处理')
}

/* ---------- 4. data URL 与 Base64 ---------- */
{
  const w = H.toneWav(440, { ms: 60, rate: 22050 })
  is(w.url.slice(0, 22), 'data:audio/wav;base64,', 'data URL 前缀')
  const b64 = w.url.slice(22)
  is(b64.length % 4, 0, 'Base64 长度是 4 的倍数')
  is(b64.length, Math.ceil(w.bytes.length / 3) * 4, 'Base64 长度按 3→4 展开')
  const back = Buffer.from(b64, 'base64')
  is(back.length, w.bytes.length, 'Node 判官解回同样长度')
  let same = true
  for (let i = 0; i < back.length; i++) if (back[i] !== w.bytes[i]) same = false
  is(same, true, '逐字节与本体一致')
  // 字节版 base64 单独对外部判官再跑一遍
  for (const n of [0, 1, 2, 3, 4, 5, 255]) {
    const arr = []
    for (let i = 0; i < n; i++) arr.push((i * 137 + 7) & 255)
    is(B.bytesToBase64(arr), Buffer.from(arr).toString('base64'), '字节 Base64 对齐 Node（' + n + ' 字节）')
  }
  is(B.bytesToBase64([]), '', '空数组编出空串')
  const typed = new Uint8Array([0, 255, 128, 64])
  is(B.bytesToBase64(typed), Buffer.from(typed).toString('base64'), 'Uint8Array 也能编')
}

/* ---------- 5. 入参校验 ---------- */
{
  throws(() => H.toneWav(0), '频率 0 要报错')
  throws(() => H.toneWav(-100), '负频率要报错')
  throws(() => H.toneWav('x'), '非数字频率要报错')
  throws(() => H.toneWav(30000, { ms: 100 }), '超过 24 kHz 要报错')
  throws(() => H.toneWav(440, { ms: 0 }), '时长 0 要报错')
  throws(() => H.toneWav(440, { ms: -1 }), '负时长要报错')
  throws(() => H.toneWav(440, { ms: 99999 }), '超长时长要报错')
  throws(() => H.toneWav(440, { rate: 4000 }), '过低采样率要报错')
  throws(() => H.toneWav(440, { rate: 96000 }), '过高采样率要报错')
  throws(() => H.sweepWav(0, 1000), '扫频起点为 0 要报错')
  throws(() => H.sweepWav(1000, 0), '扫频终点为 0 要报错')
  throws(() => H.sweepWav(100, 1000, { ms: 0 }), '扫频时长 0 要报错')
  is(H.MAX_TONE_MS > 1000, true, '上限本身合理')
  // 边界值必须能过
  is(H.toneWav(24000, { ms: 10, rate: 48000 }).frames, 480, '24 kHz 与 48 kHz 是允许的边界')
  is(H.toneWav(20, { ms: H.MAX_TONE_MS }).frames, Math.round(44100 * H.MAX_TONE_MS / 1000), '最长时长边界')
}

/* ---------- 6. 包络 ---------- */
{
  is(H.envelope(0, 1000, 40), 0, '包络从 0 起')
  is(H.envelope(20, 1000, 40), 0.5, '淡入线性')
  is(H.envelope(40, 1000, 40), 1, '淡入结束就是 1')
  is(H.envelope(500, 1000, 40), 1, '中段保持 1')
  is(H.envelope(959, 1000, 40), 1, '淡出起点')
  is(H.envelope(979, 1000, 40), 0.5, '淡出线性')
  is(H.envelope(999, 1000, 40), 0, '淡出回 0')
  is(H.envelope(5, 10, 0), 1, 'ramp=0 时不加包络')
  for (let i = 0; i < 200; i++) {
    const v = H.envelope(i, 200, 20)
    inRange(v, 0, 1, '包络不越界：' + i)
  }
  // 单调性：淡入段不减、淡出段不增
  let prev = 0
  for (let i = 0; i <= 100; i++) {
    const v = H.envelope(i, 200, 100)
    is(v >= prev, true, '淡入段单调不减：' + i)
    prev = v
  }
  prev = 1
  for (let i = 100; i < 200; i++) {
    const v = H.envelope(i, 200, 100)
    is(v <= prev, true, '淡出段单调不增：' + i)
    prev = v
  }
  // 极短样本也要有淡入淡出，否则咔哒声照样存在
  const tiny = H.toneWav(440, { ms: 10, rate: 8000 })
  const t = chan(tiny.bytes, tiny.frames, 0)
  is(t[0], 0, '440 帧的短音第一帧仍是 0')
  is(t[t.length - 1], 0, '短音最后一帧仍是 0')
  is(H.RAMP_CAP > 0, true, '淡入上限是正数')
}

/* ---------- 7. 扫频 ---------- */
{
  const w = H.sweepWav(80, 14000, { ms: 2000, rate: 22050, volume: 0.5 })
  const L = chan(w.bytes, w.frames, 0)
  is(w.frames, 44100, '扫频帧数按时长算')
  is(w.bytes.length, 44 + 44100 * 4, '扫频字节数')
  is(L[0], 0, '扫频从静音起')
  is(L[L.length - 1], 0, '扫频回静音')
  const half = Math.floor(L.length / 2)
  const first = crossings(L.slice(0, half))
  const last = crossings(L.slice(half))
  is(last > first * 3, true, '对数扫频：后半段过零数远多于前半段（前 ' + first + ' / 后 ' + last + '）')
  const q1 = crossings(L.slice(0, Math.floor(L.length / 4)))
  const q4 = crossings(L.slice(Math.floor((L.length * 3) / 4)))
  is(q4 > q1, true, '四分段也是越往后越密')
  is(peak(L) > 0, true, '扫频有幅度')
  near(peak(L), 32767 * 0.5, 0.06 * 32767 * 0.5, '峰值贴近设定音量')
  // 上行与下行的区分
  const down = H.sweepWav(12000, 100, { ms: 1200, rate: 22050 })
  const D = chan(down.bytes, down.frames, 0)
  const dh = Math.floor(D.length / 2)
  is(crossings(D.slice(0, dh)) > crossings(D.slice(dh)), true, '下行扫频前半段更密')
  is(H.sweepWav(440, 440, { ms: 500 }).frames, 22050, '起止同频也当定频处理，不抛')
}

/* ---------- 8. 白噪声 ---------- */
{
  const a = H.noiseWav({ ms: 300, rate: 8000 })
  const b = H.noiseWav({ ms: 300, rate: 8000 })
  const c = H.noiseWav({ ms: 300, rate: 8000, seed: 12345 })
  const A = chan(a.bytes, a.frames, 0)
  is(a.frames, 2400, '噪声帧数')
  is(a.bytes.length, 44 + 2400 * 4, '噪声字节数')
  let same = true
  for (let i = 0; i < A.length; i++) if (chan(b.bytes, b.frames, 0)[i] !== A[i]) same = false
  is(same, true, '同一颗种子两次结果逐采样一致（可复现）')
  let diff = false
  const C = chan(c.bytes, c.frames, 0)
  for (let i = 0; i < C.length; i++) if (C[i] !== A[i]) diff = true
  is(diff, true, '换种子就换波形')
  near(Math.abs(mean(A)), 0, 0.06 * 32767, '噪声没有直流偏置')
  near(meanAbs(A), 0.5 * 32767 * a.volume, 0.15 * 32767 * a.volume, '均匀分布的平均绝对值约为幅值一半')
  is(peak(A) <= 32767, true, '噪声不溢出')
  is(peak(A) > 32767 * 0.4, true, '噪声确实铺满了幅度')
  is(crossings(A) > A.length * 0.2, true, '噪声过零极密（确实是随机而非音调整）')
}

/* ---------- 9. 预设表 ---------- */
{
  is(H.TONE_PRESETS.length >= 4, true, '至少四段预设音')
  const keys = H.TONE_PRESETS.map((p) => p.key)
  is(new Set(keys).size, keys.length, '预设 key 不重复')
  for (const p of H.TONE_PRESETS) {
    is(typeof p.name === 'string' && p.name.length > 1, true, p.key + ' 有名字')
    is(typeof p.hint === 'string' && p.hint.length > 4, true, p.key + ' 有听感说明')
    is(p.freq > 0 && p.freq < 24000, true, p.key + ' 频率可用')
    is(p.ms > 0 && p.ms <= H.MAX_TONE_MS, true, p.key + ' 时长在上限内')
    is(p.channel === undefined || ['left', 'right'].includes(p.channel), true, p.key + ' 声道写法合法')
  }
  is(H.SWEEP_PRESET.to > H.SWEEP_PRESET.from, true, '扫频预设是上行')
  is(H.SWEEP_PRESET.ms <= H.MAX_TONE_MS, true, '扫频预设时长合规')
  is(H.NOISE_PRESET.ms > 0, true, '噪声预设有长度')
  is(new Set([H.SWEEP_PRESET.key, H.NOISE_PRESET.key, ...keys]).size, keys.length + 2, '三类预设 key 互不冲突')
}

/* ---------- 10. presetAudio 分派 ---------- */
{
  for (const p of H.TONE_PRESETS) {
    const w = H.presetAudio(p)
    is(w.frames, Math.round((44100 * p.ms) / 1000), p.key + ' 按预设时长出帧')
    is(w.channel, p.channel || 'both', p.key + ' 声道按预设')
    is(w.bytes.length, 44 + w.frames * 4, p.key + ' 字节数自洽')
  }
  const s = H.presetAudio(H.SWEEP_PRESET)
  is(s.frames, Math.round((44100 * H.SWEEP_PRESET.ms) / 1000), '扫频预设可播')
  const n = H.presetAudio(H.NOISE_PRESET)
  is(n.frames, Math.round((44100 * H.NOISE_PRESET.ms) / 1000), '噪声预设可播')
  throws(() => H.presetAudio(null), '空预设要报错')
  throws(() => H.presetAudio({ key: 'x', name: '坏预设', hint: 'x' }), '既没频率又没时长的预设要报错')
  // 预设全跑一遍不能有任何一个炸
  for (const p of H.TONE_PRESETS.concat([H.SWEEP_PRESET, H.NOISE_PRESET])) is(!!H.presetAudio(p).url, true, p.key + ' 生成 data URL')
}

/* ---------- 11. 亮度 ---------- */
{
  is(H.brightnessPercent(0.5), 50, '一半')
  is(H.brightnessPercent(0), 0, '最暗')
  is(H.brightnessPercent(1), 100, '最亮')
  is(H.brightnessPercent(1.4), 100, '越上界截断')
  is(H.brightnessPercent(-0.2), 0, '越下界截断')
  is(H.brightnessPercent('x'), null, '非数字给 null 而不是 0')
  is(H.brightnessPercent(undefined), null, '缺值给 null')
  is(H.brightnessPercent(null), null, 'null 是「还没读」，不是 0%')
  is(H.brightnessPercent(''), null, '空串是「还没读」')
  is(H.brightnessPercent(0), 0, '真 0 才是最暗')
  is(H.brightnessPercent(0.004), 0, '小于 0.5% 归零')
  is(H.brightnessValue(50), 0.5, '百分数回值域')
  is(H.brightnessValue(0), 0, '0%')
  is(H.brightnessValue(100), 1, '100%')
  is(H.brightnessValue(33), 0.33, '整百分比精确往返')
  throws(() => H.brightnessValue(150), '超界亮度要报错')
  throws(() => H.brightnessValue(-5), '负亮度要报错')
  throws(() => H.brightnessValue('x'), '非数字亮度要报错')
  for (const p of [0, 5, 20, 45, 70, 100]) {
    const back = H.brightnessPercent(H.brightnessValue(p))
    inRange(Math.abs(back - p), 0, 1, '亮度往返一致：' + p)
  }
  is(H.brightnessGrade(1), '接近最暗', '1% 档')
  is(H.brightnessGrade(10), '很暗', '10% 档')
  is(H.brightnessGrade(30), '偏暗', '30% 档')
  is(H.brightnessGrade(60), '适中', '60% 档')
  is(H.brightnessGrade(90), '偏亮', '90% 档')
  is(H.brightnessGrade(100), '最亮', '100% 档')
  is(H.brightnessGrade(0.5), '接近最暗', '半百分比也归最暗')
  is(H.brightnessGrade('x'), '读不到', '读不到时不猜档位')
}

/* ---------- 12. 震动档位与闪光灯计时 ---------- */
{
  is(H.VIBRATE_LEVELS.map((v) => v.key).join(','), 'light,medium,heavy', '三档与 uni 的 type 对齐')
  for (const v of H.VIBRATE_LEVELS) is(v.name.length > 0, true, '档位 ' + v.key + ' 有中文名')
  is(H.torchMs(), 1500, '缺省 1.5 秒')
  is(H.torchMs(300), 300, '正常值原样用')
  is(H.torchMs(99999), 5000, '超上限截到 5 秒：常亮会烧手')
  is(H.torchMs(-1), 1500, '负数回落缺省')
  is(H.torchMs('x'), 1500, '非数字回落缺省')
  is(H.torchMs(0), 1500, '0 视为没填')
  is(H.torchMs(5000, 2000), 2000, '自定义上限生效')
  is(H.torchMs(2500.6), 2501, '毫秒取整')
}

/* ---------- 13. 测试项清单与展示文案 ---------- */
{
  is(H.HARDWARE_ITEMS.length, 5, '五项硬件测试')
  const keys = H.HARDWARE_ITEMS.map((i) => i.key)
  is(new Set(keys).size, keys.length, '测试项 key 不重复')
  for (const i of H.HARDWARE_ITEMS) {
    is(typeof i.name === 'string' && i.name.length > 1, true, i.key + ' 有名字')
    is([...i.glyph].length, 1, i.key + ' 图标是一个字')
    is(typeof i.api === 'string' && i.api.length > 3, true, i.key + ' 写明接口名')
    is(typeof i.desc === 'string' && i.desc.length > 8, true, i.key + ' 有说明')
  }
  const w = H.toneWav(440, { ms: 100, rate: 8000 })
  const label = H.audioLabel(w)
  is(label.indexOf('100 ms') > -1, true, '摘要带时长')
  is(label.indexOf('8000 Hz') > -1, true, '摘要带采样率')
  is(label.indexOf('双声道') > -1, true, '摘要带声道')
  is(label.indexOf('KB') > -1, true, '摘要带体积')
  is(label.indexOf('base64') < 0, true, '摘要里不能出现 base64 本体')
  is(H.audioLabel(null), '', '空值不报错')
  is(H.audioLabel(H.toneWav(440, { ms: 50, rate: 8000, channel: 'left' })).indexOf('左声道') > -1, true, '左声道摘要')
  is(H.audioLabel(H.toneWav(440, { ms: 50, rate: 8000, channel: 'right' })).indexOf('右声道') > -1, true, '右声道摘要')
}

console.log('hardware ' + (fail ? 'FAIL ' + fail : '全绿') + ' ' + ok + '/' + (ok + fail))
process.exit(fail ? 1 : 0)
