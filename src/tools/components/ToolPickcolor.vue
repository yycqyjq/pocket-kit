<template>
  <view>
    <PkCard padded accent="var(--pk-accent)">
      <view class="pick" hover-class="pick--hover" @tap="pick">
        <text class="pick__t">{{ src ? '换一张图片' : '选一张图，点哪儿取哪儿' }}</text>
      </view>
      <PkRow v-if="err" label="提示" :value="err" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard v-if="src" padded accent="var(--pk-accent)">
      <view class="bar">
        <text class="bar__t">{{ src.width }} × {{ src.height }} px</text>
        <text class="bar__t">{{ formatBytes(src.size) }}</text>
      </view>
      <PkSeg v-model="zoom" :items="zooms" @change="layout" />
      <scroll-view id="pk-stage" class="stage" scroll-x scroll-y>
        <image
          id="pk-img"
          class="stage__img"
          :src="src.path"
          mode="scaleToFill"
          :style="{ width: dispW + 'px', height: dispH + 'px' }"
          @tap="onTap"
          @touchstart="onTouch"
          @touchmove="onTouch"
          @touchend="onTouchEnd"
        />
      </scroll-view>
      <view class="mag">
        <view class="mag__box">
          <image v-if="mag" class="mag__img" :src="mag.url" mode="aspectFill" />
          <text v-else class="mag__ph">点图上看像素</text>
          <view class="mag__cross"></view>
        </view>
        <view class="mag__info">
          <view class="mag__row">
            <text class="mag__k">像素坐标</text>
            <text class="mag__v">{{ cur ? cur.x + ', ' + cur.y : '—' }}</text>
          </view>
          <view class="mag__row">
            <text class="mag__k">取样范围</text>
            <text class="mag__v">{{ mag ? mag.span + ' × ' + mag.span + ' px 放大 ' + mag.zoom + '×' : '—' }}</text>
          </view>
          <text v-if="cur && cur.approx" class="mag__note">这张大图按 {{ MAX_SAMPLE_EDGE }} px 上限降采样后取色，颜色代表该像素所在的小块区域。</text>
        </view>
      </view>
      <view class="hint">
        <text class="hint__t">坐标是图片自身的自然像素（左上角为 0,0），跟显示缩放无关；放大到 2× 以上才谈得上逐像素目视。</text>
      </view>
    </PkCard>

    <PkCard v-if="src" title="手动定位" accent="#5B6B8C" padded>
      <view class="xy">
        <view class="xy__f">
          <PkField v-model="manX" type="number" label="X（0 - {{ src.width - 1 }}）" placeholder="横向像素序号" />
        </view>
        <view class="xy__f">
          <PkField v-model="manY" type="number" label="Y（0 - {{ src.height - 1 }}）" placeholder="纵向像素序号" />
        </view>
      </view>
      <view class="btns">
        <PkBtn text="取这点" kind="soft" block @tap="pickManual" />
      </view>
    </PkCard>

    <PkCard v-if="cur" title="当前颜色" :accent="cur.hex">
      <view class="swatch" :style="{ background: cur.cssHex }">
        <text class="swatch__t" :style="{ color: cur.bestText }">{{ cur.hexUpper }}　{{ cur.name }}</text>
      </view>
      <PkRow label="HEX" :value="cur.hex8 ? cur.cssHex.toUpperCase() : cur.hex" mono />
      <PkRow label="RGB" :value="cur.rgbText" mono />
      <PkRow v-if="cur.rgbaText" label="RGBA" :value="cur.rgbaText" mono />
      <PkRow label="HSL" :value="cur.hslText" mono />
      <PkRow label="CMYK" :value="cur.cmykText" mono />
      <PkRow label="相对亮度" :value="cur.luminanceText" :copy="false" />
      <view class="rows">
        <view class="cr">
          <text class="cr__k">放黑字</text>
          <text class="cr__v">{{ cur.onBlack.text }}</text>
          <text class="badge" :class="cur.onBlack.aa ? 'badge--ok' : 'badge--no'">{{ cur.onBlack.aa ? 'AA 达标' : '不达标' }}</text>
        </view>
        <view class="cr">
          <text class="cr__k">放白字</text>
          <text class="cr__v">{{ cur.onWhite.text }}</text>
          <text class="badge" :class="cur.onWhite.aa ? 'badge--ok' : 'badge--no'">{{ cur.onWhite.aa ? 'AA 达标' : '不达标' }}</text>
        </view>
        <view class="cr">
          <text class="cr__k">放进这色里</text>
          <text class="cr__v">{{ cur.bestText }}</text>
        </view>
      </view>
      <view class="btns">
        <view class="btns__half">
          <PkBtn text="复制色值" kind="primary" block @tap="copyHex" />
        </view>
        <view class="btns__half">
          <PkBtn text="复制完整描述" kind="soft" block @tap="copyDetail" />
        </view>
      </view>
      <view class="hint">
        <text class="hint__t">要调色阶、做配色去「色彩工坊」；这里只负责从图里把颜色捞出来。</text>
      </view>
    </PkCard>

    <PkCard v-if="hist.length" :title="'取色历史（' + hist.length + '/' + MAX_HISTORY + '）'" accent="var(--pk-accent)">
      <view class="hist">
        <view v-for="(h, i) in hist" :key="i" class="hist__row" @tap="copyOne(h)">
          <view class="hist__dot" :style="{ background: h.cssHex }"></view>
          <view class="hist__main">
            <text class="hist__hex">{{ h.hex.toUpperCase() }}　{{ h.rgbText }}</text>
            <text class="hist__pos">{{ h.x }}, {{ h.y }}　{{ h.hslText }}</text>
          </view>
          <view class="hist__del" @tap.stop="delHist(i)">
            <text class="hist__del-t">删</text>
          </view>
        </view>
      </view>
      <view class="btns">
        <view class="btns__half">
          <PkBtn text="复制全部历史" kind="soft" block @tap="copyHistAll" />
        </view>
        <view class="btns__half">
          <PkBtn text="清空历史" kind="danger" block @tap="clearHist" />
        </view>
      </view>
    </PkCard>

    <PkCard v-if="src" title="取色板" accent="#8A6D3B" padded>
      <view class="bar bar--tight">
        <text class="bar__t">整图网格取样 + 分桶去重，挑出代表色</text>
      </view>
      <PkSeg v-model="palSize" :items="palSizes" />
      <view class="btns">
        <PkBtn :text="palBusy ? '正在取样…' : '生成 ' + palSize + ' 色'" kind="primary" block :disabled="!src || palBusy" @tap="makePalette" />
      </view>
      <view v-if="palCells.length" class="pal">
        <view v-for="(c, i) in palCells" :key="'p' + i" class="pal__cell" :style="{ background: c.hex, flexGrow: c.grow }"></view>
      </view>
      <view v-if="pal.length" class="pal-list">
        <view v-for="(c, i) in pal" :key="'q' + i" class="pal-item" @tap="copyOne(c)">
          <view class="pal-item__dot" :style="{ background: c.hex }"></view>
          <view class="pal-item__main">
            <text class="pal-item__hex">{{ c.hex.toUpperCase() }}　{{ c.name }}　占比 {{ c.shareText }}</text>
            <text class="pal-item__tip">{{ advice[i].level }}　压 {{ advice[i].text }} 字 {{ advice[i].ratio }}</text>
          </view>
        </view>
      </view>
      <view v-if="pal.length" class="btns">
        <PkBtn text="复制色板文本" kind="soft" block @tap="copyPalette" />
      </view>
    </PkCard>

    <PkEmpty v-if="!src" title="还没有图片" desc="选一张本地图就能点着取色，全程不联网" />
  </view>
</template>

<script setup>
import { ref, computed, getCurrentInstance, nextTick } from 'vue'
import { chooseImage, loadImage, formatBytes } from '@/utils/image'
import { createSampler, paletteAdvice, colorToText, paletteToText, MAX_HISTORY, MAX_SAMPLE_EDGE } from '@/utils/pickcolor'
import { copyText, toast } from '@/utils/clipboard'

const instance = getCurrentInstance()

const src = ref(null)
const err = ref('')
const zoom = ref('fit')
const dispW = ref(0)
const dispH = ref(0)
const cur = ref(null)
const mag = ref(null)
const hist = ref([])
const pal = ref([])
const palSize = ref(5)
const palBusy = ref(false)
const manX = ref('')
const manY = ref('')

/** 显示区尺寸与图片盒子位置，都用 px（和 boundingClientRect / offsetX 同一单位） */
let sampler = null
let stageW = 0
let stageH = 0
let rectCache = null
let lastTouchAt = 0

const zooms = [
  { key: 'fit', name: '适应' },
  { key: '1', name: '1×' },
  { key: '2', name: '2×' },
  { key: '4', name: '4×' },
]
const palSizes = [
  { key: 5, name: '5 色' },
  { key: 8, name: '8 色' },
]

async function pick() {
  err.value = ''
  src.value = null
  cur.value = null
  mag.value = null
  pal.value = []
  sampler = null
  let chosen
  try {
    chosen = await chooseImage()
  } catch (e) {
    return
  }
  try {
    const img = await loadImage(chosen.path)
    // 一次解码 + 一次绘制，后面点击只读 1×1 像素；读不到像素这里就抛中文错
    sampler = createSampler(img)
    src.value = {
      path: chosen.path,
      name: chosen.name,
      size: chosen.size,
      width: sampler.width,
      height: sampler.height,
    }
    hist.value = []
    await nextTick()
    measureStage()
  } catch (e) {
    err.value = e.message || '这张图读不了'
    sampler = null
  }
}

/** 量一次显示区尺寸。量不到就用窗口宽度兜底，不让界面卡住 */
function measureStage() {
  try {
    uni
      .createSelectorQuery()
      .in(instance)
      .select('#pk-stage')
      .boundingClientRect((r) => {
        if (r && r.width) {
          stageW = r.width
          stageH = r.height || 320
        } else {
          fallbackStage()
        }
        layout()
      })
      .exec()
  } catch (e) {
    fallbackStage()
    layout()
  }
}
function fallbackStage() {
  try {
    const si = uni.getSystemInfoSync()
    stageW = Math.max(240, (si.windowWidth || 360) - 80)
    stageH = 320
  } catch (e) {
    stageW = 320
    stageH = 320
  }
}

/** 按缩放档算出显示尺寸：图片盒子严格等比，
 *  「offsetX / 盒子宽 × 自然宽」就是精确的自然像素坐标，H5 与 App webview 同一条算式 */
function layout() {
  if (!src.value || !stageW) return
  const ar = src.value.width / src.value.height
  if (zoom.value === 'fit') {
    let w = stageW
    let h = w / ar
    const maxH = Math.max(220, stageH || 320)
    if (h > maxH) {
      h = maxH
      w = h * ar
    }
    dispW.value = Math.round(w)
    dispH.value = Math.round(w / ar)
  } else {
    const z = Number(zoom.value) || 1
    const w = Math.min(src.value.width * z, 6000)
    dispW.value = Math.round(w)
    dispH.value = Math.round(w / ar)
  }
  rectCache = null
  queryRect()
}
function queryRect() {
  try {
    uni
      .createSelectorQuery()
      .in(instance)
      .select('#pk-img')
      .boundingClientRect((r) => {
        if (r && r.width) rectCache = r
      })
      .exec()
  } catch (e) {
    rectCache = null
  }
}

/** 事件坐标 → 自然像素坐标 */
function naturalFromEvent(e) {
  if (!src.value || !dispW.value) return null
  const t = (e && e.touches && e.touches[0]) || (e && e.changedTouches && e.changedTouches[0]) || e
  if (!t) return null
  let px
  let py
  if (typeof t.offsetX === 'number' && typeof t.offsetY === 'number') {
    px = t.offsetX
    py = t.offsetY
  } else if (typeof t.clientX === 'number' && rectCache && rectCache.width) {
    px = t.clientX - rectCache.left
    py = t.clientY - rectCache.top
  } else {
    return null
  }
  if (px < 0 || py < 0 || px > dispW.value || py > dispH.value) return null
  return {
    x: Math.floor((px / dispW.value) * src.value.width),
    y: Math.floor((py / dispH.value) * src.value.height),
  }
}

function sampleAt(e) {
  if (!sampler) return
  const pos = naturalFromEvent(e)
  if (!pos) {
    err.value = '这次点击没算出坐标，用下面的 X/Y 手动定位更稳'
    return
  }
  try {
    cur.value = sampler.pickAt(pos.x, pos.y)
    mag.value = sampler.magnifyAt(pos.x, pos.y)
    err.value = ''
  } catch (e2) {
    err.value = e2.message || '取色失败'
  }
}

function onTouch(e) {
  lastTouchAt = Date.now()
  sampleAt(e)
}
function onTouchEnd() {
  lastTouchAt = Date.now()
  pushHistory()
}
function onTap(e) {
  // 触屏走 touch 系列；这里只兜住 H5 预览里的鼠标点击（那种情况没有 touch 事件）
  if (Date.now() - lastTouchAt < 600) return
  sampleAt(e)
  pushHistory()
}

function pushHistory() {
  const c = cur.value
  if (!c) return
  const top = hist.value[0]
  if (top && top.hex === c.hex && top.x === c.x && top.y === c.y) return
  hist.value.unshift(Object.assign({}, c))
  if (hist.value.length > MAX_HISTORY) hist.value.splice(MAX_HISTORY)
}

function pickManual() {
  if (!sampler) return
  const x = parseInt(manX.value, 10)
  const y = parseInt(manY.value, 10)
  if (isNaN(x) || isNaN(y)) {
    err.value = 'X、Y 都要填整数'
    return
  }
  if (x < 0 || y < 0 || x >= src.value.width || y >= src.value.height) {
    err.value = '坐标超出图片范围（X 0-' + (src.value.width - 1) + '，Y 0-' + (src.value.height - 1) + '）'
    return
  }
  try {
    cur.value = sampler.pickAt(x, y)
    mag.value = sampler.magnifyAt(x, y)
    err.value = ''
    pushHistory()
  } catch (e) {
    err.value = e.message || '取色失败'
  }
}

/** 色板条的宽度按占比给，Math 在模板里不可用，先在 JS 里算好 */
const palCells = computed(() => pal.value.map((c) => Object.assign({}, c, { grow: Math.max(1, Math.round(c.share || 1)) })))
const advice = computed(() => pal.value.map((c) => c.advice || { level: '', text: '', ratio: '' }))

function makePalette() {
  if (!sampler) return
  palBusy.value = true
  err.value = ''
  nextTick(() => {
    try {
      const list = sampler.palette(palSize.value)
      const adv = paletteAdvice(list)
      pal.value = list.map((c, i) => Object.assign({}, c, { advice: adv[i] }))
      if (!pal.value.length) err.value = '没取到代表色，换一张图试试'
    } catch (e) {
      err.value = e.message || '取色板生成失败'
      pal.value = []
    }
    palBusy.value = false
  })
}

function copyHex() {
  if (cur.value) copyText(cur.value.hex8 ? cur.value.cssHex : cur.value.hex, 'HEX 已复制')
}
function copyDetail() {
  if (cur.value) copyText(colorToText(cur.value), '完整描述已复制')
}
function copyOne(h) {
  copyText(h.hex8 ? h.cssHex : h.hex, h.hex.toUpperCase() + ' 已复制')
}
function delHist(i) {
  hist.value.splice(i, 1)
}
function clearHist() {
  hist.value = []
  toast('历史已清空')
}
function copyHistAll() {
  copyText(hist.value.map((h) => colorToText(h)).join('\n\n'), '历史已复制')
}
function copyPalette() {
  copyText(paletteToText(pal.value), '色板已复制')
}
</script>

<style scoped>
.pick {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 96rpx;
  border-radius: var(--pk-radius-md);
  background: var(--pk-accent-soft);
}
.pick--hover {
  opacity: 0.7;
}
.pick__t {
  font-size: 28rpx;
  color: var(--pk-accent);
  font-weight: 600;
}
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14rpx;
}
.bar--tight {
  margin-bottom: 10rpx;
}
.bar__t {
  font-size: 24rpx;
  color: var(--pk-text-3);
}
.stage {
  width: 100%;
  height: 560rpx;
  border-radius: var(--pk-radius-md);
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line);
  white-space: nowrap;
}
.stage__img {
  display: block;
}
.mag {
  display: flex;
  align-items: flex-start;
  margin-top: 18rpx;
}
.mag__box {
  position: relative;
  width: 180rpx;
  height: 180rpx;
  flex-shrink: 0;
  border-radius: var(--pk-radius-md);
  overflow: hidden;
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line-strong);
  display: flex;
  align-items: center;
  justify-content: center;
}
.mag__img {
  width: 100%;
  height: 100%;
}
.mag__ph {
  font-size: 20rpx;
  color: var(--pk-ph);
  text-align: center;
  padding: 0 12rpx;
}
.mag__cross {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 14rpx;
  height: 14rpx;
  margin-left: -7rpx;
  margin-top: -7rpx;
  border: 2rpx solid var(--pk-accent);
  border-radius: 50%;
}
.mag__info {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
}
.mag__row {
  display: flex;
  align-items: baseline;
  margin-bottom: 8rpx;
}
.mag__k {
  font-size: 24rpx;
  color: var(--pk-text-3);
  width: 140rpx;
  flex-shrink: 0;
}
.mag__v {
  font-size: 26rpx;
  color: var(--pk-text);
}
.mag__note {
  font-size: 22rpx;
  line-height: 1.5;
  color: var(--pk-warn);
}
.hint {
  margin-top: 16rpx;
}
.hint__t {
  font-size: 22rpx;
  line-height: 1.6;
  color: var(--pk-text-3);
}
.xy {
  display: flex;
  align-items: flex-start;
}
.xy__f {
  flex: 1;
  min-width: 0;
}
.xy__f + .xy__f {
  margin-left: 16rpx;
}
.btns {
  display: flex;
  align-items: center;
  margin-top: 18rpx;
}
.btns__half {
  flex: 1;
  min-width: 0;
}
.btns__half + .btns__half {
  margin-left: 16rpx;
}
.swatch {
  height: 140rpx;
  border-radius: var(--pk-radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--pk-line-w) solid var(--pk-line-strong);
  margin-bottom: 8rpx;
}
.swatch__t {
  font-size: 28rpx;
  font-weight: 600;
}
.rows {
  margin-top: 10rpx;
}
.cr {
  display: flex;
  align-items: center;
  padding: 12rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.cr:last-child {
  border-bottom: none;
}
.cr__k {
  font-size: 24rpx;
  color: var(--pk-text-3);
  width: 190rpx;
  flex-shrink: 0;
}
.cr__v {
  flex: 1;
  font-size: 26rpx;
  color: var(--pk-text);
}
.badge {
  font-size: 22rpx;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
}
.badge--ok {
  color: var(--pk-accent);
  background: var(--pk-accent-soft);
}
.badge--no {
  color: var(--pk-warn);
  background: var(--pk-bg-soft);
}
.hist {
  padding: 4rpx 0;
}
.hist__row {
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.hist__row:last-child {
  border-bottom: none;
}
.hist__dot {
  width: 56rpx;
  height: 56rpx;
  border-radius: var(--pk-radius-sm);
  flex-shrink: 0;
  border: var(--pk-line-w) solid var(--pk-line-strong);
}
.hist__main {
  flex: 1;
  min-width: 0;
  margin: 0 18rpx;
}
.hist__hex {
  display: block;
  font-size: 26rpx;
  color: var(--pk-text);
}
.hist__pos {
  display: block;
  margin-top: 2rpx;
  font-size: 22rpx;
  color: var(--pk-text-3);
}
.hist__del {
  flex-shrink: 0;
  padding: 6rpx 16rpx;
  border-radius: var(--pk-radius-sm);
  background: var(--pk-bg-soft);
}
.hist__del-t {
  font-size: 22rpx;
  color: var(--pk-text-2);
}
.pal {
  display: flex;
  height: 96rpx;
  border-radius: var(--pk-radius-md);
  overflow: hidden;
  margin-top: 18rpx;
  border: var(--pk-line-w) solid var(--pk-line-strong);
}
.pal__cell {
  height: 100%;
}
.pal-list {
  margin-top: 14rpx;
}
.pal-item {
  display: flex;
  align-items: center;
  padding: 12rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.pal-item:last-child {
  border-bottom: none;
}
.pal-item__dot {
  width: 40rpx;
  height: 40rpx;
  border-radius: var(--pk-radius-sm);
  flex-shrink: 0;
  border: var(--pk-line-w) solid var(--pk-line-strong);
}
.pal-item__main {
  flex: 1;
  min-width: 0;
  margin-left: 16rpx;
}
.pal-item__hex {
  display: block;
  font-size: 24rpx;
  color: var(--pk-text);
}
.pal-item__tip {
  display: block;
  margin-top: 2rpx;
  font-size: 22rpx;
  color: var(--pk-text-3);
}
</style>
