<template>
  <view>
    <PkCard padded accent="var(--pk-accent)">
      <view class="pick" hover-class="pick--hover" @tap="pick">
        <text class="pick__t">{{ src ? '换一张图片' : '选择要压缩的图片' }}</text>
      </view>
      <PkRow v-if="err" label="提示" :value="err" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard v-if="src" title="压缩参数" accent="#4A6FA5">
      <PkField v-model="maxW" type="number" label="最大宽度（px）" placeholder="留空不缩放，仅重编码" />
      <view class="seg-label">
        <text class="seg-label__t">输出格式</text>
      </view>
      <PkSeg v-model="mime" :items="formats" value-key="key" label-key="name" />
      <view class="q-row">
        <text class="q-label">质量</text>
        <slider
          class="q-slider"
          :value="qPercent"
          :min="30"
          :max="100"
          :block-size="22"
          :activeColor="accent"
          @changing="onSlide"
          @change="onSlide"
        />
        <text class="q-val">{{ qPercent }}%</text>
      </view>
      <PkRow v-if="mime === 'image/png'" label="说明" value="PNG 是无损，质量滑杆对它不起作用，只能靠缩尺寸" :copy="false" stack />
    </PkCard>

    <PkCard v-if="out" title="压缩结果" accent="var(--pk-accent)">
      <view class="preview">
        <image class="preview__img" :src="out.dataUrl" mode="aspectFit" />
      </view>
      <PkRow label="压缩前" :value="formatBytes(src.size)" :copy="false" />
      <PkRow label="压缩后" :value="formatBytes(out.size)" big />
      <PkRow label="体积变化" :value="deltaText" :color="deltaColor" :copy="false" />
      <PkRow label="输出尺寸" :value="out.width + ' × ' + out.height" :copy="false" />
      <view class="row-btn">
        <PkBtn text="保存 / 下载" kind="primary" block @tap="save" />
      </view>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { chooseImage, loadImage, drawScaled, canvasToBlob, blobToDataURL, formatBytes, saveCanvasImage } from '@/utils/image'
import { toast } from '@/utils/clipboard'
import { themeColors } from '@/utils/theme'

let imgEl = null
let lastCanvas = null

const src = ref(null)
const out = ref(null)
const err = ref('')
const maxW = ref('1920')
const qPercent = ref(80)
const mime = ref('image/jpeg')

const accent = computed(() => themeColors.value.accent)
const formats = [
  { key: 'image/jpeg', name: 'JPEG' },
  { key: 'image/webp', name: 'WebP' },
  { key: 'image/png', name: 'PNG' },
]

async function pick() {
  err.value = ''
  let chosen
  try {
    chosen = await chooseImage()
  } catch (e) {
    return
  }
  try {
    imgEl = await loadImage(chosen.path)
    src.value = {
      name: chosen.name,
      width: imgEl.naturalWidth || imgEl.width,
      height: imgEl.naturalHeight || imgEl.height,
      size: chosen.size,
    }
    out.value = null
    await recompute()
  } catch (e) {
    err.value = e.message || '无法读取这张图片'
    src.value = null
  }
}

function onSlide(e) {
  qPercent.value = e.detail.value
}

async function recompute() {
  if (!imgEl) return
  const w = parseInt(maxW.value, 10)
  const quality = qPercent.value / 100
  try {
    lastCanvas = drawScaled(imgEl, w > 0 ? w : 0, 0, mime.value === 'image/jpeg')
    const blob = await canvasToBlob(lastCanvas, mime.value, mime.value === 'image/png' ? undefined : quality)
    const dataUrl = await blobToDataURL(blob)
    out.value = {
      size: blob.size,
      width: lastCanvas.width,
      height: lastCanvas.height,
      dataUrl,
    }
  } catch (e) {
    err.value = e.message || '压缩失败'
    out.value = null
  }
}

watch([maxW, qPercent, mime], () => {
  recompute()
})

const deltaText = computed(() => {
  if (!out.value || !src.value || !src.value.size) return '—'
  const d = out.value.size - src.value.size
  const pct = Math.abs((d / src.value.size) * 100).toFixed(0)
  return d < 0 ? '省了 ' + pct + '%' : '反而大了 ' + pct + '%'
})

const deltaColor = computed(() => {
  if (!out.value || !src.value || !src.value.size) return ''
  return out.value.size < src.value.size ? 'var(--pk-accent)' : 'var(--pk-warn)'
})

async function save() {
  if (!lastCanvas) return
  const ext = mime.value === 'image/png' ? 'png' : mime.value === 'image/webp' ? 'webp' : 'jpg'
  const base = (src.value && src.value.name ? src.value.name.replace(/\.[^.]+$/, '') : 'image')
  try {
    await saveCanvasImage(lastCanvas, base + '-min.' + ext, mime.value, qPercent.value / 100)
    toast('已保存')
  } catch (e) {
    toast(e.message || '保存失败')
  }
}
</script>

<style scoped>
.pick {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 96rpx;
  border-radius: 14rpx;
  background: var(--pk-accent-soft);
}
.pick--hover {
  opacity: 0.7;
}
.pick__t {
  font-size: 27rpx;
  color: var(--pk-accent);
  font-weight: 600;
}
.seg-label {
  margin: 8rpx 0 12rpx;
}
.seg-label__t {
  font-size: 24rpx;
  color: var(--pk-text-2);
}
.q-row {
  display: flex;
  align-items: center;
  margin-top: 10rpx;
}
.q-label {
  font-size: 24rpx;
  color: var(--pk-text-2);
  flex-shrink: 0;
}
.q-slider {
  flex: 1;
  margin: 0 16rpx;
}
.q-val {
  font-size: 24rpx;
  color: var(--pk-text);
  width: 64rpx;
  text-align: right;
}
.preview {
  margin: 8rpx 0 16rpx;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 320rpx;
  border-radius: 14rpx;
  background: var(--pk-input);
  overflow: hidden;
}
.preview__img {
  width: 100%;
  height: 100%;
}
.row-btn {
  margin-top: 20rpx;
}
</style>
