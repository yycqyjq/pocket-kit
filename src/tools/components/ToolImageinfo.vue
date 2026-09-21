<template>
  <view>
    <PkCard padded accent="var(--pk-accent)">
      <view class="pick" hover-class="pick--hover" @tap="pick">
        <text class="pick__t">{{ info ? '换一张图片' : '选择一张图片' }}</text>
      </view>
      <view v-if="info" class="preview">
        <image class="preview__img" :src="info.path" mode="aspectFit" />
      </view>
      <PkRow v-if="err" label="提示" :value="err" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard v-if="info" title="基本信息" accent="var(--pk-accent)">
      <PkRow label="文件名" :value="info.name" :copy="false" />
      <PkRow label="类型" :value="info.type || '未识别'" :copy="false" />
      <PkRow label="文件大小" :value="formatBytes(info.size)" big />
      <PkRow v-if="info.alpha !== null" label="含透明通道" :value="info.alpha ? '是' : '否'" :copy="false" />
    </PkCard>

    <PkCard v-if="info" title="尺寸与比例" accent="#4A6FA5">
      <PkRow label="像素尺寸" :value="info.width + ' × ' + info.height" big />
      <PkRow label="纵横比" :value="reduceRatio(info.width, info.height)" :copy="false" />
      <PkRow label="比值小数" :value="(info.width / info.height).toFixed(4)" :copy="false" />
      <PkRow label="总像素" :value="megaPixels" :copy="false" />
      <PkRow label="方向" :value="orient" :copy="false" />
      <PkRow label="常见档位" :value="nearestName" :copy="false" />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { chooseImage, loadImage, hasAlpha, formatBytes, reduceRatio } from '@/utils/image'
import { toast } from '@/utils/clipboard'

const info = ref(null)
const err = ref('')

const STANDARDS = [
  ['16:9', 16 / 9], ['4:3', 4 / 3], ['3:2', 3 / 2], ['1:1', 1], ['2:3', 2 / 3], ['9:16', 9 / 16],
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
    const img = await loadImage(chosen.path)
    let alpha = null
    try {
      alpha = hasAlpha(img)
    } catch (e) {
      alpha = null
    }
    info.value = {
      path: chosen.path,
      name: chosen.name,
      type: chosen.type,
      size: chosen.size,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      alpha,
    }
  } catch (e) {
    err.value = e.message || '无法读取这张图片'
    info.value = null
  }
}

const megaPixels = computed(() => {
  if (!info.value) return ''
  const mp = (info.value.width * info.value.height) / 1e6
  return mp >= 1 ? mp.toFixed(2) + ' 百万像素' : Math.round(mp * 1000) + ' 千像素'
})

const orient = computed(() => {
  if (!info.value) return ''
  const { width: w, height: h } = info.value
  return w > h ? '横向' : w < h ? '纵向' : '正方形'
})

const nearestName = computed(() => {
  if (!info.value) return ''
  const r = info.value.width / info.value.height
  let best = null
  let bestDiff = Infinity
  for (const [name, val] of STANDARDS) {
    const d = Math.abs(r - val) / val
    if (d < bestDiff) {
      bestDiff = d
      best = name
    }
  }
  return bestDiff < 0.03 ? '约 ' + best : '非标准比例'
})
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
.preview {
  margin-top: 20rpx;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 360rpx;
  border-radius: var(--pk-radius-md);
  background: var(--pk-input);
  overflow: hidden;
}
.preview__img {
  width: 100%;
  height: 100%;
}
</style>
