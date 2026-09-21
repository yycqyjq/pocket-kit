<template>
  <view>
    <PkCard padded accent="var(--pk-accent)">
      <view class="pick" hover-class="pick--hover" @tap="pick">
        <text class="pick__t">{{ src ? '换一张图片' : '选择要转格式的图片' }}</text>
      </view>
      <PkRow v-if="err" label="提示" :value="err" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard v-if="src" title="目标格式" accent="#4A6FA5">
      <PkSeg v-model="mime" :items="formats" value-key="key" label-key="name" />
      <view v-if="mime === 'image/jpeg'" class="q-row">
        <text class="q-label">质量</text>
        <slider class="q-slider" :value="qPercent" :min="30" :max="100" :block-size="22" :activeColor="accent" @changing="onSlide" @change="onSlide" />
        <text class="q-val">{{ qPercent }}%</text>
      </view>
      <PkRow label="原图" :value="src.type || '未知'" :copy="false" />
      <PkRow v-if="mime === 'image/jpeg'" label="注意" value="JPEG 不支持透明，透明区域会被铺成白底" :copy="false" stack />
    </PkCard>

    <PkCard v-if="out" title="转换结果" accent="var(--pk-accent)">
      <view class="preview">
        <image class="preview__img" :src="out.dataUrl" mode="aspectFit" />
      </view>
      <PkRow label="尺寸" :value="out.width + ' × ' + out.height" :copy="false" />
      <PkRow label="新文件大小" :value="formatBytes(out.size)" big />
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
const mime = ref('image/png')
const qPercent = ref(90)

const accent = computed(() => themeColors.value.accent)
const formats = [
  { key: 'image/png', name: 'PNG' },
  { key: 'image/jpeg', name: 'JPEG' },
  { key: 'image/webp', name: 'WebP' },
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
    src.value = { name: chosen.name, type: chosen.type }
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
  try {
    lastCanvas = drawScaled(imgEl, 0, 0, mime.value === 'image/jpeg')
    const blob = await canvasToBlob(lastCanvas, mime.value, mime.value === 'image/png' ? undefined : qPercent.value / 100)
    const dataUrl = await blobToDataURL(blob)
    out.value = { size: blob.size, width: lastCanvas.width, height: lastCanvas.height, dataUrl }
  } catch (e) {
    err.value = e.message || '转换失败'
    out.value = null
  }
}

watch([mime, qPercent], () => {
  recompute()
})

async function save() {
  if (!lastCanvas) return
  const ext = mime.value === 'image/png' ? 'png' : mime.value === 'image/webp' ? 'webp' : 'jpg'
  const base = src.value && src.value.name ? src.value.name.replace(/\.[^.]+$/, '') : 'image'
  try {
    await saveCanvasImage(lastCanvas, base + '.' + ext, mime.value, qPercent.value / 100)
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
