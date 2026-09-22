<template>
  <view>
    <PkCard padded>
      <text class="tip">二手验机、自己修完屏幕，都需要把这几样硬件逐个点一遍。这里每一项都只调系统接口，读不到的会在原位写清楚是缺接口、缺权限还是这台机器根本没这个件。</text>
      <text class="msg" :class="{ 'msg--ok': caps.android }">{{ envLine }}</text>
    </PkCard>

    <PkCard title="震动" :accent="TINT">
      <text class="tip">{{ descOf('vibrate') }}</text>
      <view class="row2">
        <PkBtn text="短震一下" kind="soft" @tap="vibrateShort" />
        <PkBtn text="长震一下" kind="ghost" @tap="vibrateLong" />
      </view>
      <view class="chips">
        <text v-for="v in VIBRATE_LEVELS" :key="v.key" class="chips__i" @tap="vibrateAt(v)">{{ v.name }}强度</text>
      </view>
      <PkRow v-if="vib.last" label="最后一次" :value="vib.last" :copy="false" stack />
      <text v-if="vib.msg" class="msg">{{ vib.msg }}</text>
    </PkCard>

    <PkCard title="闪光灯" :accent="TINT">
      <text class="tip">{{ descOf('torch') }}</text>
      <PkSeg v-model="torchKey" :items="TORCH_TIMES" />
      <view class="row2">
        <PkBtn text="点亮" kind="soft" @tap="torchOn" />
        <PkBtn text="立刻熄灭" kind="ghost" @tap="torchOff" />
      </view>
      <PkRow label="状态" :value="torchState" :copy="false" />
      <PkRow v-if="torchLeft > 0" label="自动熄灭" :value="torchLeft + ' 秒后'" :copy="false" />
      <text v-if="torchMsg" class="msg">{{ torchMsg }}</text>
    </PkCard>

    <PkCard title="屏幕常亮与亮度" :accent="TINT">
      <text class="tip">{{ descOf('screen') }}</text>
      <PkRow label="当前亮度" :value="brightText" :copy="false" />
      <view class="row2">
        <PkBtn text="读取亮度" kind="soft" @tap="readBrightness" />
        <PkBtn :text="keepOn ? '取消常亮' : '设为常亮'" :kind="keepOn ? 'ghost' : 'primary'" @tap="toggleKeep" />
      </view>
      <view class="chips">
        <text v-for="b in BRIGHT_SETS" :key="b.p" class="chips__i" @tap="setBrightness(b)">{{ b.name }}</text>
      </view>
      <text class="tip">亮度这里只动当前窗口的显示值，不写系统设置；退出这一页或杀掉应用就会回到系统原来的亮度。</text>
      <text v-if="screenMsg" class="msg">{{ screenMsg }}</text>
    </PkCard>

    <PkCard title="扬声器与听筒" :accent="TINT">
      <text class="tip">{{ descOf('speaker') }}</text>
      <view class="chips">
        <text v-for="p in TONE_PRESETS" :key="p.key" class="chips__i" @tap="play(p)">{{ p.name }}</text>
      </view>
      <view class="chips">
        <text class="chips__i" @tap="play(SWEEP_PRESET)">{{ SWEEP_PRESET.name }}</text>
        <text class="chips__i" @tap="play(NOISE_PRESET)">{{ NOISE_PRESET.name }}</text>
      </view>
      <PkRow label="正在播" :value="nowPlaying" :copy="false" />
      <PkRow v-if="audio" label="这段音频" :value="audio.info" :copy="false" stack />
      <text v-if="audio" class="tip">{{ playing ? '声音停了再点下一次；扫频那一段最长，中途可以按停止。' : '音频是这台机器现场算出来的正弦波，不是下载来的文件：' + audio.hint }}</text>
      <view v-if="playing" class="row2">
        <PkBtn text="停止" kind="danger" @tap="stopPlay" />
      </view>
      <text v-if="audioMsg" class="msg">{{ audioMsg }}</text>
    </PkCard>

    <PkCard title="媒体音量" :accent="TINT">
      <text class="tip">{{ descOf('volume') }}</text>
      <view class="row2">
        <PkBtn text="读一次音量" kind="soft" @tap="readVolume" />
      </view>
      <template v-if="vol">
        <PkRow label="当前档位" :value="vol.now + ' / ' + vol.max" mono />
        <PkRow label="音量条" :value="volBar" :copy="false" stack />
        <text class="tip">{{ volHint }}</text>
      </template>
      <text v-if="volMsg" class="msg">{{ volMsg }}</text>
    </PkCard>

    <PkCard title="口径与边界" :accent="TINT">
      <PkRow v-for="n in NOTES" :key="n.t" :label="n.t" :value="n.d" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed, reactive, onUnmounted } from 'vue'
import {
  TONE_PRESETS, SWEEP_PRESET, NOISE_PRESET, presetAudio, audioLabel,
  brightnessPercent, brightnessValue, brightnessGrade, VIBRATE_LEVELS, torchMs, HARDWARE_ITEMS,
} from '@/utils/hardware'
import { probe, hasApi, uniCall, playWav, stopWav, withAndroid, missText, NATIVE_NOTES, requestAndroidPermissions, PERM_CAMERA } from '@/utils/native'
import { toast } from '@/utils/clipboard'

const TINT = '#7A5C3E'

const NOTES = [
  { t: '音频怎么来的', d: '每一段声音都是现场按采样率算出来的 PCM，封成 WAV 再交给播放器，全程不联网、不落盘。所以「按下了没声音」通常是播放器或音量问题，不是没生成。' },
  { t: '闪光灯为什么会自动灭', d: '手电筒没有系统开关可用时，靠的是相机服务的 torch 接口，长时间常亮会发热也费电，所以这里最多元 5 秒就自己关，页面离开时也会强制关一次。' },
  { t: '读不到不代表坏了', d: '震动在模拟器上没有；闪光灯在没有独立闪光灯的机器上会直接报没有这个件；亮度接口被部分定制 ROM 屏蔽。这些都会写成一行中文提示，其余项照常可测。' },
  { t: '音量档位是几', d: '读的是安卓 STREAM_MUSIC（媒体音量），铃声音量、通话音量、通知音量各是另一条，不在这儿显示。档位是系统给的对数刻度，不是百分比。' },
  { t: '听筒与扬声器不是一条', d: '安卓上听筒走 STREAM_VOICE_CALL，本工具播的是媒体通道，默认从主扬声器出声。要试听筒，请拨一个真实号码在通话里听。' },
].concat(NATIVE_NOTES.slice(0, 2))

const TORCH_TIMES = [
  { key: 'a', name: '0.5 秒' },
  { key: 'b', name: '1.5 秒' },
  { key: 'c', name: '3 秒' },
  { key: 'd', name: '5 秒' },
]
const TORCH_MS = { a: 500, b: 1500, c: 3000, d: 5000 }
const BRIGHT_SETS = [
  { p: 2, name: '拉到最暗' },
  { p: 50, name: '一半' },
  { p: 100, name: '拉到最亮' },
]

const caps = probe()
const envLine = computed(() => (caps.android ? '已进入安卓原生分支，下面各项都直接调系统接口。' : missText('原生硬件能力', caps)))

function descOf(key) {
  const it = HARDWARE_ITEMS.find((i) => i.key === key)
  return it ? it.desc : ''
}

/* ---------- 震动 ---------- */
const vib = reactive({ last: '', msg: '' })
async function doVibrate(label, key, opts) {
  vib.msg = ''
  if (!hasApi(key)) {
    vib.msg = missText(label, probe())
    return
  }
  try {
    await uniCall(key, opts)
    vib.last = label + ' 已触发'
    toast(label)
  } catch (e) {
    vib.msg = (e && e.message) || '震动失败'
  }
}
function vibrateShort() {
  doVibrate('短震动', 'vibrateShort', {})
}
function vibrateLong() {
  doVibrate('长震动', 'vibrateLong', {})
}
function vibrateAt(v) {
  doVibrate(v.name + '强度震动', 'vibrateShort', { type: v.key })
}

/* ---------- 闪光灯 ---------- */
const torchKey = ref('b')
const torchOn0 = ref(false)
const torchLeft = ref(0)
const torchMsg = ref('')
let torchTimer = null
let torchCount = null
const torchState = computed(() => (torchOn0.value ? '亮着' : '灭'))

function setTorch(on) {
  return withAndroid((p) => {
    const main = p.android.runtimeMainActivity()
    const ctx = main.getApplicationContext ? main.getApplicationContext() : main
    const mgr = ctx.getSystemService('camera')
    p.android.importClass(mgr)
    const ids = mgr.getCameraIdList()
    const id = ids && ids.length ? String(ids[0]) : '0'
    mgr.setTorchMode(id, !!on)
    return id
  }, '闪光灯')
}

async function torchOn() {
  torchMsg.value = ''
  clearTorch()
  // setTorchMode 与 getCameraIdList 都归在 CAMERA 危险权限下，没授权时系统直接抛 SecurityException
  const perm = await requestAndroidPermissions(PERM_CAMERA, '闪光灯')
  if (perm.noneGranted) {
    torchMsg.value = perm.message
    return
  }
  const r = setTorch(true)
  if (!r.ok) {
    torchMsg.value = r.message
    return
  }
  torchOn0.value = true
  const ms = torchMs(TORCH_MS[torchKey.value], 5000)
  torchLeft.value = Math.round(ms / 1000)
  torchCount = setInterval(() => {
    torchLeft.value = torchLeft.value - 1
    if (torchLeft.value <= 0) clearTorch()
  }, 1000)
  torchTimer = setTimeout(() => torchOff(), ms + 400)
}

function clearTorch() {
  if (torchCount) {
    clearInterval(torchCount)
    torchCount = null
  }
  if (torchTimer) {
    clearTimeout(torchTimer)
    torchTimer = null
  }
  torchLeft.value = 0
}

function torchOff() {
  clearTorch()
  if (!torchOn0.value) return
  const r = setTorch(false)
  torchOn0.value = false
  if (!r.ok) torchMsg.value = r.message + '（已经尝试熄灭，请检查是否还亮着）'
}

/* ---------- 常亮与亮度 ---------- */
const keepOn = ref(false)
const bright = ref(null)
const screenMsg = ref('')
const brightText = computed(() => {
  const p = brightnessPercent(bright.value)
  return p === null ? '还没读' : p + '% · ' + brightnessGrade(p)
})

async function readBrightness() {
  screenMsg.value = ''
  if (!hasApi('getScreenBrightness')) {
    screenMsg.value = missText('读取屏幕亮度', probe())
    return
  }
  try {
    const r = await uniCall('getScreenBrightness')
    bright.value = r && r.value !== undefined ? r.value : null
    if (bright.value === null) screenMsg.value = '系统没给亮度值'
  } catch (e) {
    screenMsg.value = (e && e.message) || '读亮度失败'
  }
}

async function toggleKeep() {
  screenMsg.value = ''
  if (!hasApi('setKeepScreenOn')) {
    screenMsg.value = missText('屏幕常亮', probe())
    return
  }
  try {
    await uniCall('setKeepScreenOn', { keepScreenOn: !keepOn.value })
    keepOn.value = !keepOn.value
    toast(keepOn.value ? '屏幕不会自动熄了' : '已交还给系统熄屏')
  } catch (e) {
    screenMsg.value = (e && e.message) || '设置常亮失败'
  }
}

async function setBrightness(b) {
  screenMsg.value = ''
  if (!hasApi('setScreenBrightness')) {
    screenMsg.value = missText('设置屏幕亮度', probe())
    return
  }
  let v
  try {
    v = brightnessValue(b.p)
  } catch (e) {
    screenMsg.value = (e && e.message) || '亮度不合法'
    return
  }
  try {
    await uniCall('setScreenBrightness', { value: v })
    bright.value = v
    toast('亮度设为 ' + b.p + '%')
  } catch (e) {
    screenMsg.value = (e && e.message) || '设置亮度失败'
  }
}

/* ---------- 扬声器 ---------- */
const playing = ref(false)
const audio = ref(null)
const audioMsg = ref('')
const nowPlaying = computed(() => (playing.value && audio.value ? audio.value.name : '没在播'))

function play(preset) {
  audioMsg.value = ''
  let wav
  try {
    wav = presetAudio(preset)
  } catch (e) {
    audioMsg.value = (e && e.message) || '这段音频没能生成'
    return
  }
  // base64 很长，只把展示要的几个字段放进响应式对象
  audio.value = { name: preset.name, hint: preset.hint || '', info: audioLabel(wav) }
  playing.value = true
  playWav(wav.url, wav.ms)
    .then(() => {
      playing.value = false
    })
    .catch((e) => {
      playing.value = false
      audioMsg.value = (e && e.message) || '播放失败'
    })
}

function stopPlay() {
  stopWav()
  playing.value = false
}

/* ---------- 音量 ---------- */
const vol = ref(null)
const volMsg = ref('')
const volBar = computed(() => {
  const v = vol.value
  if (!v || !v.max) return '—'
  const filled = Math.round((v.now / v.max) * 10)
  return '■'.repeat(filled) + '□'.repeat(10 - filled)
})
const volHint = computed(() => {
  const v = vol.value
  if (!v) return ''
  if (v.now === 0) return '媒体音量是 0：这时候按再多测试键也是静音，先把音量键往上按'
  if (v.max && v.now / v.max < 0.3) return '档位偏低：细节容易听不见，验机时建议先拉到一半以上'
  return '档位正常，可以直接听'
})

function readVolume() {
  volMsg.value = ''
  const r = withAndroid((p) => {
    const main = p.android.runtimeMainActivity()
    const am = main.getSystemService('audio')
    p.android.importClass(am)
    return { now: Number(am.getStreamVolume(3)), max: Number(am.getStreamMaxVolume(3)) }
  }, '媒体音量')
  if (!r.ok) {
    volMsg.value = r.message
    vol.value = null
    return
  }
  vol.value = r.value
}

onUnmounted(() => {
  stopWav()
  clearTorch()
  if (torchOn0.value) setTorch(false)
  // 离开这一页就不该再霸占常亮
  if (keepOn.value && hasApi('setKeepScreenOn')) uniCall('setKeepScreenOn', { keepScreenOn: false }).catch(() => {})
})
</script>

<style scoped>
.tip {
  display: block;
  font-size: 21rpx;
  line-height: 1.8;
  color: var(--pk-text-3);
  padding: 8rpx 24rpx 12rpx;
}
.msg {
  display: block;
  font-size: 22rpx;
  line-height: 1.8;
  color: var(--pk-danger);
  padding: 12rpx 24rpx;
}
.msg--ok {
  color: var(--pk-text-2);
}
.row2 {
  display: flex;
  gap: 20rpx;
  padding: 16rpx 24rpx 8rpx;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  padding: 8rpx 24rpx 0;
}
.chips__i {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin: 8rpx 14rpx 0 0;
  padding: 14rpx 20rpx;
  line-height: 1.3;
  border-radius: 10rpx;
  background: var(--pk-accent-soft);
}
</style>
