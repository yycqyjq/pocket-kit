<template>
  <view>
    <PkCard title="图片 → Base64" padded accent="var(--pk-accent)">
      <view class="row-btn">
        <PkBtn text="选择图片" kind="soft" @tap="pickToBase64" />
        <PkBtn v-if="b64" text="复制" kind="ghost" @tap="copyBase64" />
      </view>
      <template v-if="b64">
        <view class="preview">
          <image class="preview__img" :src="b64" mode="aspectFit" />
        </view>
        <PkRow label="原始大小" :value="formatBytes(srcSize)" :copy="false" />
        <PkRow label="Base64 长度" :value="b64.length + ' 字符'" :copy="false" />
        <PkRow label="膨胀率" :value="inflate" :copy="false" stack />
        <PkOutput :value="b64" :size="20" />
      </template>
      <PkRow v-else label="说明" value="选一张图，得到它的 dataURL（Base64）文本，可直接塞进 CSS 或 HTML" :copy="false" stack />
    </PkCard>

    <PkCard title="Base64 → 图片" padded accent="#4A6FA5">
      <PkField v-model="raw" type="textarea" :area-height="140" placeholder="粘贴 data:image/...;base64, 或直接粘 base64 串">
        <template #labelRight>
          <text class="mini-act" @tap="pasteIn">读取剪贴板</text>
          <text class="mini-act" @tap="raw = ''">清空</text>
        </template>
      </PkField>
      <template v-if="decoded">
        <view class="preview">
          <image class="preview__img" :src="decoded" mode="aspectFit" @error="onDecodeErr" />
        </view>
        <PkRow label="解码后大小" :value="formatBytes(decodedBytes)" :copy="false" />
        <PkRow label="格式" :value="decodedMime" :copy="false" />
      </template>
      <PkRow v-else-if="raw" label="提示" value="解析不出图片，检查是不是完整的 base64" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { chooseImage, loadImage, formatBytes } from '@/utils/image'
import { toast, copyText } from '@/utils/clipboard'

const b64 = ref('')
const srcSize = ref(null)
const raw = ref('')

async function pickToBase64() {
  let chosen
  try {
    chosen = await chooseImage()
  } catch (e) {
    return
  }
  srcSize.value = chosen.size
  try {
    if (chosen.file && typeof FileReader !== 'undefined') {
      b64.value = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result)
        r.onerror = () => reject(new Error('读取失败'))
        r.readAsDataURL(chosen.file)
      })
    } else {
      const img = await loadImage(chosen.path)
      b64.value = imgToDataURL(img)
    }
  } catch (e) {
    toast(e.message || '转换失败')
    b64.value = ''
  }
}

function imgToDataURL(img) {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth || img.width
  c.height = img.naturalHeight || img.height
  c.getContext('2d').drawImage(img, 0, 0)
  return c.toDataURL('image/png')
}

function copyBase64() {
  copyText(b64.value)
}

const inflate = computed(() => {
  if (!srcSize.value || !b64.value) return ''
  const approx = Math.round((b64.value.length * 3) / 4)
  return 'Base64 比原图大约 ' + (((approx / srcSize.value - 1) * 100) || 0).toFixed(0) + '%（编码换体积，便于内联）'
})

const decoded = computed(() => {
  const s = String(raw.value).trim()
  if (!s) return ''
  if (s.startsWith('data:')) return s
  if (/^[A-Za-z0-9+/=\s]+$/.test(s)) return 'data:image/png;base64,' + s.replace(/\s/g, '')
  return ''
})

const decodedBytes = computed(() => {
  if (!decoded.value) return null
  const b = decoded.value.split(',')[1] || ''
  const clean = b.replace(/\s/g, '')
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0
  return Math.floor((clean.length * 3) / 4) - pad
})

const decodedMime = computed(() => {
  const m = String(decoded.value).match(/^data:([^;]+)/)
  return m ? m[1] : 'image/png（推断）'
})

function onDecodeErr() {
  toast('这串解码后不是有效图片')
}

function pasteIn() {
  uni.getClipboardData({
    success(res) {
      if (res.data) raw.value = String(res.data)
      else toast('剪贴板是空的')
    },
    fail() {
      toast('读取失败')
    },
  })
}
</script>

<style scoped>
.row-btn {
  display: flex;
  gap: 20rpx;
  margin-bottom: 8rpx;
}
.preview {
  margin: 16rpx 0;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 320rpx;
  border-radius: var(--pk-radius-md);
  background: var(--pk-input);
  overflow: hidden;
}
.preview__img {
  width: 100%;
  height: 100%;
}
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 24rpx;
}
</style>
