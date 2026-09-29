<template>
  <view>
    <PkCard title="色值" accent="#B5527A">
      <PkField v-model="hex" placeholder="#3f7a6e" :maxlength="9">
        <template #labelRight>
          <text class="mini-act" @tap="rollRandom">随机</text>
        </template>
      </PkField>
      <view class="preview" :style="{ background: safeHex }">
        <text class="preview__t" :style="{ color: textOn }">{{ safeHex ? safeHex.toUpperCase() : '输入色值' }}</text>
      </view>
      <view class="swatches">
        <view
          v-for="c in presets"
          :key="c"
          class="swatch"
          :style="{ background: c }"
          hover-class="swatch--hover"
          @tap="hex = c"
        ></view>
      </view>
    </PkCard>

    <PkCard v-if="rgb" title="通道调节" accent="#B5527A">
      <view v-for="ch in channels" :key="ch.key" class="ch">
        <text class="ch__k">{{ ch.name }}</text>
        <slider
          class="ch__s"
          :value="ch.value"
          :min="0"
          :max="255"
          :activeColor="ch.color"
          block-size="18"
          @changing="onChannel(ch.key, $event)"
          @change="onChannel(ch.key, $event)"
        />
        <text class="ch__v">{{ ch.value }}</text>
      </view>
    </PkCard>

    <PkCard v-if="rgb" title="各种写法" accent="var(--pk-accent)">
      <PkRow label="HEX" :value="safeHex.toUpperCase()" mono />
      <PkRow label="HEX 短写" :value="shortHex" mono />
      <PkRow label="RGB" :value="'rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')'" mono />
      <PkRow label="RGBA 不透明" :value="'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', 1)'" mono />
      <PkRow label="HSL" :value="'hsl(' + hsl.h + ', ' + hsl.s + '%, ' + hsl.l + '%)'" mono />
      <PkRow label="小数归一" :value="norm" mono />
      <PkRow label="相近色名" :value="name" />
      <PkRow label="明度" :value="lum.toFixed(3)" />
    </PkCard>

    <PkCard v-if="rgb" title="对比度与可读性" accent="#4A6FA5">
      <view class="contrast">
        <view
          v-for="c in contrastCases"
          :key="c.label"
          class="contrast__box"
          :style="{ background: safeHex, color: c.color }"
        >
          <text class="contrast__big" :style="{ color: c.color }">Aa 字</text>
          <text class="contrast__meta" :style="{ color: c.color }">{{ c.label }} {{ c.ratio.text }}</text>
        </view>
      </view>
      <PkRow label="与白字对比度" :value="onWhite.text" :color="onWhite.aa ? 'var(--pk-accent)' : 'var(--pk-danger)'" />
      <PkRow label="与黑字对比度" :value="onBlack.text" :color="onBlack.aa ? 'var(--pk-accent)' : 'var(--pk-danger)'" />
      <PkRow label="建议正文色" :value="textOn === '#FFFFFF' ? '白色文字' : '深色文字'" />
      <PkRow label="达标情况" :value="wcag" />
    </PkCard>

    <PkCard v-if="rgb" title="配色方案" accent="#6B5B95">
      <view v-for="s in schemes" :key="s.key" class="scheme">
        <text class="scheme__t">{{ s.name }}</text>
        <view class="scheme__row">
          <view
            v-for="c in s.list"
            :key="c.hex"
            class="scheme__cell"
            :style="{ background: c.hex }"
            hover-class="swatch--hover"
            @tap="copyText(c.hex)"
          >
            <text class="scheme__h" :style="{ color: readableTextOn(c.hex) }">{{ c.hex.toUpperCase() }}</text>
          </view>
        </view>
      </view>
    </PkCard>

    <PkCard v-if="rgb" title="明度阶梯" accent="#6B5B95">
      <view class="ramp">
        <view
          v-for="(c, i) in rampList"
          :key="i"
          class="ramp__cell"
          :style="{ background: c }"
          hover-class="swatch--hover"
          @tap="copyText(c)"
        >
          <text class="ramp__t" :style="{ color: readableTextOn(c) }">{{ i + 1 }}</text>
        </view>
      </view>
      <text class="tip">点击任意色块即可复制色值</text>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { copyText } from '@/utils/clipboard'
import {
  normalizeHex,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  luminance,
  contrastRatio,
  readableTextOn,
  scheme,
  ramp,
  nearestName,
} from '@/utils/color'
import { randomInt } from '@/utils/random'

const presets = [
  '#3f7a6e', '#4A6FA5', '#6B5B95', '#B5527A', '#a8642f', '#3E7A4E',
  '#1D2521', '#8C8C8C', '#E8E3D9', '#FFFFFF', '#C8503C', '#2F8C7A',
]

const hex = ref('#3f7a6e')

const safeHex = computed(() => normalizeHex(hex.value) || '')
const rgb = computed(() => (safeHex.value ? hexToRgb(safeHex.value) : null))
const hsl = computed(() => (rgb.value ? rgbToHsl(rgb.value.r, rgb.value.g, rgb.value.b) : { h: 0, s: 0, l: 0 }))
const lum = computed(() => (safeHex.value ? luminance(safeHex.value) : 0))
const textOn = computed(() => (safeHex.value ? readableTextOn(safeHex.value) : '#1D2521'))
const onWhite = computed(() => contrastRatio(safeHex.value || '#000', '#FFFFFF'))
const onBlack = computed(() => contrastRatio(safeHex.value || '#000', '#000000'))
const name = computed(() => (safeHex.value ? nearestName(safeHex.value) : ''))
const shortHex = computed(() => {
  const h = (safeHex.value || '').slice(1)
  if (h[0] === h[1] && h[2] === h[3] && h[4] === h[5]) return '#' + h[0] + h[2] + h[4]
  return '（不可短写）'
})
const norm = computed(() => {
  if (!rgb.value) return ''
  const f = (v) => (v / 255).toFixed(3)
  return `(${f(rgb.value.r)}, ${f(rgb.value.g)}, ${f(rgb.value.b)})`
})
const wcag = computed(() => {
  const best = Math.max(onWhite.value.value, onBlack.value.value)
  if (best >= 7) return 'AAA 通过'
  if (best >= 4.5) return 'AA 通过'
  if (best >= 3) return '仅大字号可用'
  return '对比度不足'
})

const channels = computed(() => {
  if (!rgb.value) return []
  return [
    { key: 'r', name: 'R', value: rgb.value.r, color: '#C8503C' },
    { key: 'g', name: 'G', value: rgb.value.g, color: '#3E7A4E' },
    { key: 'b', name: 'B', value: rgb.value.b, color: '#4A6FA5' },
  ]
})

const contrastCases = computed(() => {
  if (!safeHex.value) return []
  return [
    { label: '白字', color: '#FFFFFF', ratio: onWhite.value },
    { label: '黑字', color: '#000000', ratio: onBlack.value },
  ]
})

const schemes = computed(() => {
  if (!safeHex.value) return []
  return [
    { key: 'complement', name: '互补色', list: scheme(safeHex.value, 'complement') },
    { key: 'analogous', name: '邻近色', list: scheme(safeHex.value, 'analogous') },
    { key: 'triad', name: '三角配色', list: scheme(safeHex.value, 'triad') },
    { key: 'split', name: '分裂互补', list: scheme(safeHex.value, 'split') },
  ]
})

const rampList = computed(() => (safeHex.value ? ramp(safeHex.value, 9) : []))

function onChannel(key, e) {
  if (!rgb.value) return
  const v = Number(e.detail.value)
  const next = { ...rgb.value }
  next[key] = v
  hex.value = rgbToHex(next.r, next.g, next.b)
}

function rollRandom() {
  hex.value = rgbToHex(randomInt(0, 255), randomInt(0, 255), randomInt(0, 255))
}

watch(hex, (v) => {
  // 用户输入时补上 #，但不强行纠正中间状态
  if (v && v[0] !== '#') hex.value = '#' + v
})
</script>

<style scoped>
.mini-act {
  font-size: 24rpx;
  color: var(--pk-accent);
}
.preview {
  height: 140rpx;
  border-radius: var(--pk-radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 8rpx 0 20rpx;
  border: var(--pk-line-w) solid var(--pk-line);
}
.preview__t {
  font-size: 30rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
}
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}
.swatch {
  width: 72rpx;
  height: 72rpx;
  border-radius: var(--pk-radius-sm);
  border: var(--pk-line-w) solid var(--pk-line);
}
.swatch--hover {
  opacity: 0.6;
}
.ch {
  display: flex;
  align-items: center;
  padding: 4rpx 24rpx;
}
.ch__k {
  width: 40rpx;
  font-size: 26rpx;
  color: var(--pk-text-2);
  font-weight: 600;
}
.ch__s {
  flex: 1;
  margin: 0 16rpx;
}
.ch__v {
  width: 70rpx;
  text-align: right;
  font-size: 26rpx;
  color: var(--pk-text-3);
}
.contrast {
  display: flex;
  gap: 16rpx;
  padding: 4rpx 24rpx 20rpx;
}
.contrast__box {
  flex: 1;
  height: 130rpx;
  border-radius: var(--pk-radius-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: var(--pk-line-w) solid var(--pk-line);
}
.contrast__big {
  font-size: 34rpx;
  font-weight: 600;
}
.contrast__meta {
  font-size: 22rpx;
  margin-top: 8rpx;
}
.scheme {
  padding: 12rpx 24rpx 20rpx;
}
.scheme__t {
  font-size: 24rpx;
  color: var(--pk-text-3);
  display: block;
  margin-bottom: 12rpx;
}
.scheme__row {
  display: flex;
  gap: 12rpx;
}
.scheme__cell {
  flex: 1;
  height: 96rpx;
  border-radius: var(--pk-radius-sm);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 10rpx;
  border: var(--pk-line-w) solid var(--pk-line);
}
.scheme__h {
  font-size: 22rpx;
  font-family: Menlo, Consolas, monospace;
}
.ramp {
  display: flex;
  padding: 8rpx 24rpx 16rpx;
}
.ramp__cell {
  flex: 1;
  height: 96rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ramp__cell:first-child {
  border-radius: var(--pk-radius-sm) 0 0 12rpx;
}
.ramp__cell:last-child {
  border-radius: 0 12rpx 12rpx 0;
}
.ramp__t {
  font-size: 22rpx;
  opacity: 0.7;
}
.tip {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  padding: 0 24rpx 20rpx;
}
</style>
