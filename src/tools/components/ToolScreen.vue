<template>
  <view>
    <PkCard padded>
      <text class="tip">坏点、亮线、漏光、偏色和触摸盲区只能靠眼睛判，软件负责的是把考卷铺满整屏、把手指抹过的地方折算成覆盖率。判读时请把这一页当成一张考卷，而不是一个会自动给结论的检测器。</text>
      <text class="msg" :class="{ 'msg--ok': !!sys }">{{ sizeLine }}</text>
    </PkCard>

    <PkCard title="选一关" :accent="TINT">
      <PkSeg v-model="stage" :items="STAGES" />
      <text class="tip">{{ stageTip }}</text>
      <view v-if="stage === 'solid'" class="chips">
        <text
          v-for="(s, i) in SOLID_ORDER"
          :key="s.key"
          class="chips__i"
          :class="{ 'chips__i--on': i === solidAt }"
          @tap="solidAt = i"
        >{{ s.name }}</text>
      </view>
      <view v-if="stage === 'gray'" class="chips">
        <text
          v-for="n in GRAY_STEPS"
          :key="n"
          class="chips__i"
          :class="{ 'chips__i--on': n === grayAt }"
          @tap="grayAt = n"
        >{{ n }} 级</text>
      </view>
      <view v-if="stage === 'geom'" class="chips">
        <text
          v-for="(g, i) in GEOMETRY_TESTS"
          :key="g.key"
          class="chips__i"
          :class="{ 'chips__i--on': i === geomAt }"
          @tap="geomAt = i"
        >{{ g.name }}</text>
      </view>
      <view v-if="stage === 'touch'" class="steps">
        <text v-for="(s, i) in TOUCH_STEPS" :key="i" class="steps__i">{{ i + 1 }}. {{ s }}</text>
      </view>
      <view class="row2">
        <PkBtn text="全屏开始" kind="primary" @tap="enter" />
        <PkBtn v-if="stage === 'touch'" text="清空记录" kind="ghost" @tap="clearTouch" />
      </view>
      <text class="tip">进全屏后右下角有半透明小浮层：换下一张、退出都点它。浮层会挡住一小块，判读时忽略那一角。</text>
    </PkCard>

    <PkCard v-if="stage === 'touch'" title="触摸统计" :accent="TINT">
      <PkRow label="覆盖率" :value="cover.pct + '%（' + cover.touched + '/' + cover.cells + ' 格）'" :copy="false" />
      <PkRow label="判读" :value="cover.verdict" :copy="false" stack />
      <PkRow label="最多同时" :value="pointers + ' 指'" :copy="false" />
      <PkRow label="采样点数" :value="String(total)" :copy="false" />
      <PkRow label="冷热极差" :value="spread.spread + ' 次（最热 ' + spread.hi + '、最冷 ' + spread.lo + '）'" :copy="false" stack />
      <PkRow v-if="cover.missed.length" label="没抹到的格子" :value="missedText" :copy="false" stack />
      <text class="tip">格子里的数字是采样到的触点次数，越亮表示抹得越多；红色的格子是盲区候选，换个握姿再抹一遍确认，够不着不算屏的问题。</text>
    </PkCard>

    <PkCard title="口径与边界" :accent="TINT">
      <PkRow v-for="n in SCREEN_NOTES" :key="n.t" :label="n.t" :value="n.d" :copy="false" stack />
    </PkCard>

    <!--
      全屏考卷这一层的色值是精确 RGB，刻意不接主题变量：
      考卷要是跟着深色模式变，判读结果就跟着 UI 一起变了。浮层同理，只求在当前底色上看得清。
    -->
    <view
      v-if="fs"
      class="fs"
      :style="fsStyle"
      @tap="onFsTap"
      @touchstart="onTouch"
      @touchmove="onTouch"
      @touchend="onTouchEnd"
    >
      <view v-if="fsStage === 'gray'" class="fs__ramp" :class="{ 'fs__ramp--vert': grayVert }">
        <view v-for="g in rampRows" :key="g.v" class="fs__band" :style="{ background: g.bg, color: g.fg }">
          <text class="fs__band__t">{{ g.label }}</text>
        </view>
      </view>
      <view v-if="fsStage === 'touch'" class="fs__grid">
        <view v-for="(row, ri) in cellGrid" :key="'r' + ri" class="fs__row">
          <view v-for="(cell, ci) in row" :key="'c' + ci" class="fs__cell" :style="{ background: cell.bg }">
            <text class="fs__cell__t" :style="{ color: cell.fg }">{{ cell.n }}</text>
          </view>
        </view>
      </view>
      <view class="fs__hud" :style="hudStyle" @tap.stop="noop">
        <text class="fs__hud__t">{{ hudTitle }}</text>
        <text class="fs__hud__w">{{ hudWhy }}</text>
        <view class="fs__hud__row">
          <text v-for="b in hudBtns" :key="b.t" class="fs__hud__btn" @tap.stop="b.f">{{ b.t }}</text>
          <text class="fs__hud__btn" @tap.stop="exitFs">退出</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, computed, onUnmounted } from 'vue'
import {
  SOLID_ORDER, GEOMETRY_TESTS, TOUCH_COLS, TOUCH_ROWS, TOUCH_STEPS, SCREEN_NOTES,
  rgbText, grayRows, geomStyle, grayRamp, cellHits, cellStyle, coverageOf, hitSpread,
  maxPointers, luma, physSize, ratioName,
} from '@/utils/screen'
import { systemInfo, hasApi, uniCall, missText, probe } from '@/utils/native'

const TINT = '#4F3E8C'
const GRAY_STEPS = [5, 8, 16, 24, 32]
const STAGES = [
  { key: 'solid', name: '纯色' },
  { key: 'gray', name: '灰阶' },
  { key: 'geom', name: '几何' },
  { key: 'touch', name: '触摸' },
]
const STAGE_TIPS = {
  solid: '六张纯色轮播：先红绿蓝看单路子像素，再白看暗点、黑看亮点与漏光，最后中灰看整体偏色。',
  gray: '从最暗到最亮均匀分级。低段糊成一片是灰阶压缩；段与段之间有台阶属于 8bit 量化，正常。',
  geom: '网格看直线弯不弯，斜线看锯齿，细条纹看摩尔纹（拍照才有，肉眼平视没有就没事），渐变看断带。',
  touch: '全屏划一遍，下面按 3×4 统计每格被抹到的次数；五指同按还能验多点触控。',
}

const stage = ref('solid')
const solidAt = ref(0)
const grayAt = ref(8)
const grayVert = ref(false)
const geomAt = ref(0)

const fs = ref(false)
const fsStage = ref('solid')
const dims = reactive({ w: 0, h: 0 })
const statV = ref(0)
const sys = ref(systemInfo())

const stageTip = computed(() => STAGE_TIPS[stage.value] || '')
const sizeLine = computed(() => {
  const s = sys.value
  if (!s) return missText('系统信息（分辨率与缩放比）', probe())
  const logical = (Number(s.screenWidth) || 0) + '×' + (Number(s.screenHeight) || 0)
  const phys = physSize(s.screenWidth, s.screenHeight, s.pixelRatio)
  const ratio = ratioName(s.screenWidth, s.screenHeight)
  return (
    '屏幕逻辑 ' + logical + ' · 物理 ' + (phys || '读不到') + ' · 比例 ' + (ratio || '未给出') +
    ' · 缩放 ' + (Number(s.pixelRatio) || 0) + '×。' +
    (fs.value ? '已进入全屏。' : '点「全屏开始」铺满整屏，测试期间会自动申请屏幕常亮。')
  )
})

const curSolid = computed(() => SOLID_ORDER[solidAt.value] || SOLID_ORDER[0])
const curGeom = computed(() => GEOMETRY_TESTS[geomAt.value] || GEOMETRY_TESTS[0])
const rampRows = computed(() => grayRows(grayAt.value))

const fsStyle = computed(() => {
  if (fsStage.value === 'solid') return { backgroundColor: rgbText(curSolid.value.rgb) }
  if (fsStage.value === 'gray') return { backgroundColor: rgbText([128, 128, 128]) }
  if (fsStage.value === 'geom') return geomStyle(curGeom.value.key, dims.w, dims.h)
  return { backgroundColor: rgbText([20, 20, 20]) }
})

const bgRgb = computed(() => {
  if (fsStage.value === 'solid') return curSolid.value.rgb
  if (fsStage.value === 'gray') return [128, 128, 128]
  if (fsStage.value === 'geom') return curGeom.value.key === 'gradient' ? [128, 128, 128] : [255, 255, 255]
  return [20, 20, 20]
})
const hudStyle = computed(() => {
  const light = luma(bgRgb.value) > 0.5
  return {
    background: light ? 'rgba(255, 255, 255, 0.80)' : 'rgba(14, 14, 14, 0.72)',
    color: light ? '#1A1A1A' : '#FFFFFF',
  }
})

/* ---------- 触摸采样：点位数组放在响应式之外，只靠 statV 触发重算 ---------- */
let samples = []
const lastByTouch = new Map()
let pointerLog = []
let flushTimer = null

const hit = computed(() => {
  void statV.value
  return cellHits(samples, dims.w, dims.h, TOUCH_COLS, TOUCH_ROWS)
})
const cover = computed(() => coverageOf(hit.value))
const spread = computed(() => hitSpread(hit.value))
const total = computed(() => hit.value.total)
const pointers = computed(() => {
  void statV.value
  return maxPointers(pointerLog)
})
const missedText = computed(() => cover.value.missed.map((m) => '第 ' + m.r + ' 行第 ' + m.c + ' 列').join('、'))
const cellGrid = computed(() => {
  const hi = spread.value.hi
  return hit.value.grid.map((row) => row.map((n) => Object.assign({ n }, cellStyle(n, hi))))
})

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    statV.value++
  }, 150)
}

function onTouch(e) {
  if (fsStage.value !== 'touch') return
  const list = (e && (e.touches && e.touches.length ? e.touches : e.changedTouches)) || []
  if (list.length) {
    pointerLog.push(list.length)
    if (pointerLog.length > 60) pointerLog.shift()
  }
  for (let i = 0; i < list.length; i++) {
    const t = list[i] || {}
    const x = Number(t.clientX !== undefined && t.clientX !== null ? t.clientX : t.pageX)
    const y = Number(t.clientY !== undefined && t.clientY !== null ? t.clientY : t.pageY)
    if (!isFinite(x) || !isFinite(y)) continue
    // 系统信息缺失时，用摸到的最远点反推视口，统计不至于全落进第一格
    if (x + 1 > dims.w) dims.w = Math.round(x + 1)
    if (y + 1 > dims.h) dims.h = Math.round(y + 1)
    const id = t.identifier === undefined ? '0' : String(t.identifier)
    const prev = lastByTouch.get(id)
    if (prev && Math.abs(x - prev.x) < 8 && Math.abs(y - prev.y) < 8) continue
    lastByTouch.set(id, { x, y })
    samples.push({ x, y })
  }
  // 点太密就抽稀一半：宁可次数粗一点，也不能后面抹的格子上不了账
  if (samples.length > 4000) samples = samples.filter((p, i) => i % 2 === 0)
  scheduleFlush()
}

function onTouchEnd() {
  lastByTouch.clear()
  clearFlush()
  statV.value++
}

function clearFlush() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
}

function clearTouch() {
  samples = []
  pointerLog = []
  lastByTouch.clear()
  statV.value++
}

/* ---------- 换卷 ---------- */
function stepPattern(d) {
  if (fsStage.value === 'geom') {
    geomAt.value = (geomAt.value + d + GEOMETRY_TESTS.length) % GEOMETRY_TESTS.length
    return
  }
  solidAt.value = (solidAt.value + d + SOLID_ORDER.length) % SOLID_ORDER.length
}
function grayMore() {
  const i = GRAY_STEPS.indexOf(grayAt.value)
  grayAt.value = GRAY_STEPS[Math.min(GRAY_STEPS.length - 1, i + 1)]
}
function grayLess() {
  const i = GRAY_STEPS.indexOf(grayAt.value)
  grayAt.value = GRAY_STEPS[Math.max(0, i - 1)]
}
function flipGray() {
  grayVert.value = !grayVert.value
}

const hudTitle = computed(() => {
  if (fsStage.value === 'solid') return curSolid.value.name + ' · 第 ' + (solidAt.value + 1) + '/' + SOLID_ORDER.length + ' 张'
  if (fsStage.value === 'gray') return grayAt.value + ' 级灰阶 · ' + (grayVert.value ? '竖条' : '横条')
  if (fsStage.value === 'geom') return curGeom.value.name + ' · 第 ' + (geomAt.value + 1) + '/' + GEOMETRY_TESTS.length + ' 张'
  return '触摸覆盖 · ' + cover.value.pct + '% · 已采 ' + total.value + ' 点'
})
const hudWhy = computed(() => {
  if (fsStage.value === 'solid') return curSolid.value.why
  if (fsStage.value === 'geom') return curGeom.value.why
  if (fsStage.value === 'gray') {
    const g = grayRamp(grayAt.value)
    return '第一级 ' + g[0] + '、最后一级 ' + g[g.length - 1] + '；盯着最低那几级看还能不能分出深浅'
  }
  return cover.value.verdict + (cover.value.missed.length ? '；还没抹到：' + missedText.value : '')
})
const hudBtns = computed(() => {
  if (fsStage.value === 'touch') return [{ t: '清空重画', f: clearTouch }]
  if (fsStage.value === 'gray') {
    return [
      { t: '少一级', f: grayLess },
      { t: '多一级', f: grayMore },
      { t: '换方向', f: flipGray },
    ]
  }
  return [
    { t: '上一张', f: () => stepPattern(-1) },
    { t: '下一张', f: () => stepPattern(1) },
  ]
})

function noop() {}

function onFsTap() {
  if (fsStage.value === 'touch') return
  if (fsStage.value === 'gray') {
    flipGray()
    return
  }
  stepPattern(1)
}

/* ---------- 进出全屏 ---------- */
let keepSet = false

function enter() {
  fsStage.value = stage.value
  fs.value = true
  const s = systemInfo()
  if (s) {
    dims.w = Number(s.windowWidth) || 0
    dims.h = Number(s.windowHeight) || 0
    sys.value = s
  }
  if (!hasApi('setKeepScreenOn')) return
  uniCall('setKeepScreenOn', { keepScreenOn: true })
    .then(() => {
      keepSet = true
    })
    .catch(() => {
      /* 常亮申请不到不影响判读，只是屏可能会自己熄 */
    })
}

function exitFs() {
  fs.value = false
  clearFlush()
  statV.value++
  releaseKeep()
}

function releaseKeep() {
  if (!keepSet) return
  keepSet = false
  if (hasApi('setKeepScreenOn')) uniCall('setKeepScreenOn', { keepScreenOn: false }).catch(() => {})
}

onUnmounted(() => {
  clearFlush()
  releaseKeep()
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
.chips__i--on {
  color: var(--pk-bg);
  background: var(--pk-accent);
}
.steps {
  padding: 8rpx 24rpx 0;
}
.steps__i {
  display: block;
  font-size: 21rpx;
  line-height: 1.9;
  color: var(--pk-text-2);
}
.fs {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 9000;
  display: flex;
  flex-direction: column;
}
.fs__ramp {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.fs__ramp--vert {
  flex-direction: row;
}
.fs__band {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.fs__band__t {
  font-size: 20rpx;
}
.fs__grid {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.fs__row {
  flex: 1;
  display: flex;
}
.fs__cell {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.20);
}
.fs__cell__t {
  font-size: 26rpx;
}
.fs__hud {
  position: absolute;
  left: 24rpx;
  right: 24rpx;
  bottom: 48rpx;
  padding: 20rpx 24rpx;
  border-radius: var(--pk-radius-md);
}
.fs__hud__t {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
}
.fs__hud__w {
  display: block;
  font-size: 21rpx;
  line-height: 1.7;
  margin-top: 6rpx;
}
.fs__hud__row {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 16rpx;
}
.fs__hud__btn {
  font-size: 22rpx;
  padding: 16rpx 24rpx;
  line-height: 1.2;
  border-radius: 10rpx;
  border: 1px solid currentColor;
}
</style>
