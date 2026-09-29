<template>
  <view>
    <PkCard padded accent="var(--pk-accent)">
      <view class="pick" hover-class="pick--hover" @tap="pick">
        <text class="pick__t">{{ src ? '换一张图片' : '选择一张图片读元数据' }}</text>
      </view>
      <view v-if="src" class="preview">
        <image class="preview__img" :src="src.path" mode="aspectFit" />
      </view>
      <PkRow v-if="err" label="提示" :value="err" color="var(--pk-danger)" :copy="false" stack />
      <PkRow v-if="busy" label="状态" value="正在读本地文件字节…" :copy="false" stack />
      <PkRow
        v-if="res && res.supported === false"
        label="说明"
        :value="res.message"
        color="var(--pk-warn)"
        :copy="false"
        stack
      />
    </PkCard>

    <PkCard v-if="res && res.supported !== false" title="概览" accent="var(--pk-accent)">
      <PkRow label="文件格式" :value="formatLine" :copy="false" />
      <PkRow label="文件大小" :value="formatBytes(sizeBytes)" big />
      <PkRow v-if="res.width" label="编码尺寸" :value="res.width + ' × ' + res.height" :copy="false" />
      <PkRow label="元数据字段" :value="res.fieldCount ? res.fieldCount + ' 条' : '没有 EXIF / 文本块'" :copy="false" />
      <PkRow v-if="res.byteOrder" label="TIFF 字节序" :value="res.byteOrder" :copy="false" />
      <PkRow v-if="res.exifBytes" label="APP1 占用" :value="formatBytes(res.exifBytes)" :copy="false" />
      <PkRow v-if="res.pngInfo" label="PNG 位深/类型" :value="pngInfoLine" :copy="false" stack />

      <view v-if="res.notices && res.notices.length" class="notice-box">
        <view v-for="(n, i) in res.notices" :key="'n' + i" class="notice" :class="'notice--' + n.level">
          <text class="notice__k">{{ n.level === 'warn' ? '隐私风险' : '提示' }}</text>
          <text class="notice__t">{{ n.text }}</text>
        </view>
      </view>

      <view v-if="res.fieldCount" class="btns">
        <PkBtn text="复制全部字段文本" kind="soft" block @tap="copyAll" />
      </view>
    </PkCard>

    <PkCard v-if="res && res.pngNote" title="PNG 文本块说明" accent="#4A6FA5">
      <view class="note">
        <text class="note__t">{{ res.pngNote }}</text>
      </view>
    </PkCard>

    <PkCard v-if="summaryRows.length" title="拍摄概览" accent="var(--pk-accent)">
      <PkRow v-for="r in summaryRows" :key="r.k" :label="r.k" :value="r.v" :stack="r.long === true" />
    </PkCard>

    <PkCard v-if="res && res.gps" title="位置信息（隐私）" accent="var(--pk-warn)">
      <PkRow label="十进制坐标" :value="res.gps.decimal" mono big />
      <PkRow label="度分秒原文" :value="res.gps.dms" :copy="false" stack />
      <PkRow v-if="res.gps.alt !== null" label="海拔" :value="gpsAlt" :copy="false" />
      <PkRow v-if="res.gps.date || res.gps.time" label="定位时间" :value="gpsTime" :copy="false" />
      <PkRow v-if="res.gps.direction" label="镜头朝向" :value="res.gps.direction" :copy="false" />
      <view class="note">
        <text class="note__t">这组坐标能把人定位到几米内。发图前先清一次。</text>
      </view>
    </PkCard>

    <PkCard v-for="g in groups" :key="g.id" :title="g.title + '（' + g.items.length + '）'" :accent="groupAccent(g.id)">
      <view class="fields">
        <view v-for="(it, i) in g.items" :key="g.id + '-' + i" class="field" @tap="copyField(it)">
          <view class="field__main">
            <view class="field__head">
              <text class="field__name">{{ it.name }}</text>
              <text class="field__tag" :class="{ 'field__tag--raw': !it.known }">{{ it.tag }} · {{ it.type }}</text>
            </view>
            <text class="field__val">{{ it.text || '（空值）' }}</text>
            <text v-if="it.note" class="field__note">{{ it.note }}</text>
          </view>
          <text class="field__copy">复制</text>
        </view>
      </view>
    </PkCard>

    <PkCard v-if="res && res.thumbnail" title="内嵌缩略图" accent="#5B6B8C">
      <view class="thumb">
        <image class="thumb__img" :src="thumbSrc" mode="aspectFit" />
      </view>
      <PkRow label="缩略图大小" :value="formatBytes(res.thumbnail.bytes)" :copy="false" />
      <PkRow label="格式" :value="res.thumbnail.mime" :copy="false" />
    </PkCard>

    <PkCard v-if="segText" title="JPEG 段结构" accent="#4A6FA5">
      <PkRow label="段数量" :value="res.segments.length + ' 个'" :copy="false" />
      <scroll-view class="segs" scroll-y>
        <text class="segs__t">{{ segText }}</text>
      </scroll-view>
      <view class="note">
        <text class="note__t">EXIF 放在 APP1（FFE1）里；扫描到 SOS 之后的压缩数据会被整段跳过。</text>
      </view>
    </PkCard>

    <PkCard v-if="res && res.supported !== false && res.warnings && res.warnings.length" title="解析告警" accent="var(--pk-warn)">
      <view v-for="(w, i) in res.warnings" :key="'w' + i" class="warn">
        <text class="warn__t">{{ w }}</text>
      </view>
    </PkCard>

    <PkCard v-if="res && res.supported !== false" title="一键清除元数据" accent="var(--pk-accent)">
      <view class="note">
        <text class="note__t">做法是把图片重新画一遍再导出：canvas 的输出不带 EXIF，也不带 PNG 文本块。代价是重新编码一次，画质按 {{ Math.round(QUALITY * 100) }}% 重压，原来的位深和无损信息会丢，不保证和原图逐字节一致。</text>
      </view>
      <view class="btns btns--first">
        <PkBtn :text="busyText" kind="primary" block :disabled="!canClear || busy" @tap="doClear" />
      </view>
      <view v-if="cleared" class="result">
        <PkRow label="清除前大小" :value="formatBytes(sizeBytes)" :copy="false" />
        <PkRow label="清除后大小" :value="formatBytes(cleared.size)" big />
        <PkRow label="体积变化" :value="deltaText" :color="deltaColor" :copy="false" />
        <PkRow label="已清除字段数" :value="res.fieldCount ? res.fieldCount + ' 条' : '这张图本来就没有元数据'" :copy="false" />
        <PkRow label="重绘尺寸" :value="cleared.width + ' × ' + cleared.height" :copy="false" />
        <PkRow label="输出格式" :value="cleared.mime" :copy="false" />
        <PkRow v-if="cleared.verify" label="复检" :value="cleared.verify" :color="cleared.verify.indexOf('通过') > -1 ? 'var(--pk-accent)' : 'var(--pk-warn)'" :copy="false" stack />
        <view class="btns">
          <PkBtn text="保存到相册 / 下载" kind="primary" block @tap="saveClear" />
        </view>
      </view>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { chooseImage, loadImage, drawScaled, canvasToBlob, formatBytes, saveCanvasImage } from '@/utils/image'
import { parseImageMeta, readImageBytes, fieldsToText } from '@/utils/exif'
import { copyText, toast } from '@/utils/clipboard'

/** 重绘时的 JPEG 质量：够看清，又不至于把原图压烂 */
const QUALITY = 0.92

const src = ref(null)
const res = ref(null)
const err = ref('')
const busy = ref(false)
const cleared = ref(null)

let imgEl = null
let clearCanvas = null
let rawBytes = 0

async function pick() {
  err.value = ''
  src.value = null
  res.value = null
  cleared.value = null
  clearCanvas = null
  imgEl = null
  rawBytes = 0
  let chosen
  try {
    chosen = await chooseImage()
  } catch (e) {
    return
  }
  src.value = { path: chosen.path, name: chosen.name, size: chosen.size, type: chosen.type }
  busy.value = true
  // 读字节只走本地：FileReader / 本地 blob 路径，不联网
  try {
    const bytes = await readImageBytes(chosen)
    rawBytes = bytes.length
    res.value = parseImageMeta(bytes)
  } catch (e) {
    err.value = e.message || '读不出这张图的字节'
  }
  try {
    imgEl = await loadImage(chosen.path)
  } catch (e) {
    err.value = e.message || '图片预览加载失败，清除功能不可用'
    imgEl = null
  }
  busy.value = false
}

const sizeBytes = computed(() => {
  if (rawBytes) return rawBytes
  return src.value && src.value.size ? src.value.size : 0
})

const formatLine = computed(() => {
  if (!res.value) return ''
  const t = src.value && src.value.type ? '（' + src.value.type + '）' : ''
  return res.value.format + t
})

const pngInfoLine = computed(() => {
  const p = res.value && res.value.pngInfo
  if (!p) return ''
  return p.bitDepth + ' bit · ' + p.colorType + (p.alpha ? ' · 含透明' : '')
})

const summaryRows = computed(() => {
  const s = res.value && res.value.summary
  if (!s || !res.value.hasExif) return []
  const rows = []
  const push = (k, v, long) => {
    if (v === null || v === undefined || v === '') return
    rows.push({ k, v: String(v), long: !!long })
  }
  push('机身', [s.make, s.model].filter(Boolean).join('  '))
  push('镜头', s.lens, true)
  push('拍摄时间', s.dateTimeOriginal || s.dateTime)
  push('曝光组合', s.shot)
  push('测光', s.metering)
  push('曝光程序', s.program)
  push('白平衡', s.wb)
  push('闪光灯', s.flash)
  push('色彩空间', s.colorSpace)
  push('像素尺寸', s.pixels === '—' ? '' : s.pixels)
  push('方向', s.orientation ? s.orientation.text : '')
  push('软件', s.software)
  push('版权', s.copyright, true)
  push('序列号', s.serial)
  return rows
})

const gpsAlt = computed(() => {
  const g = res.value && res.value.gps
  if (!g || g.alt === null || g.alt === undefined) return ''
  return g.alt.toFixed(1) + ' 米'
})
const gpsTime = computed(() => {
  const g = res.value && res.value.gps
  if (!g) return ''
  return [g.date, g.time].filter(Boolean).join(' ')
})

const groups = computed(() => (res.value && res.value.groups) || [])

function groupAccent(id) {
  if (id === 'GPS') return 'var(--pk-warn)'
  if (id === 'other') return '#5B6B8C'
  return 'var(--pk-accent)'
}

const thumbSrc = computed(() => {
  const t = res.value && res.value.thumbnail
  if (!t) return ''
  return 'data:' + t.mime + ';base64,' + t.base64
})

const segText = computed(() => {
  const segs = res.value && res.value.segments
  if (!segs || segs.length < 2) return ''
  return segs
    .map((s) => s.marker + '  ' + s.name + (s.size ? '  ' + s.size + ' 字节' : '') + (s.offset ? '  @' + s.offset : ''))
    .join('\n')
})

function copyField(it) {
  copyText((it.name + '（' + it.tag + '）= ' + (it.text || '')), it.name + ' 已复制')
}

function copyAll() {
  if (!res.value) return
  copyText(fieldsToText(res.value), '全部字段已复制')
}

const canClear = computed(() => !!imgEl && !!res.value && res.value.supported !== false)
const busyText = computed(() => (busy.value ? '处理中…' : '重绘并清除元数据'))

const deltaText = computed(() => {
  if (!cleared.value || !sizeBytes.value) return '—'
  const d = cleared.value.size - sizeBytes.value
  const pct = Math.abs((d / sizeBytes.value) * 100).toFixed(0)
  return d < 0 ? '小了 ' + pct + '%' : '大了 ' + pct + '%'
})
const deltaColor = computed(() => {
  if (!cleared.value || !sizeBytes.value) return ''
  return cleared.value.size < sizeBytes.value ? 'var(--pk-accent)' : 'var(--pk-warn)'
})

async function doClear() {
  if (!canClear.value || busy.value) return
  err.value = ''
  cleared.value = null
  busy.value = true
  const isJpeg = res.value.format === 'JPEG'
  try {
    // 尺寸原样保留（maxW/maxH 传 0），JPEG 铺白底，PNG 保留透明
    clearCanvas = drawScaled(imgEl, 0, 0, isJpeg)
    const blob = await canvasToBlob(clearCanvas, isJpeg ? 'image/jpeg' : 'image/png', isJpeg ? QUALITY : undefined)
    cleared.value = {
      size: blob.size,
      width: clearCanvas.width,
      height: clearCanvas.height,
      mime: isJpeg ? 'image/jpeg' : 'image/png',
      ext: isJpeg ? 'jpg' : 'png',
      verify: '',
    }
    // 复检：把重绘出来的字节再解析一遍，字段数应为 0（读不到就只报大小，不做无法验证的承诺）
    try {
      const again = parseImageMeta(await readImageBytes({ file: blob }))
      cleared.value.verify = again.fieldCount === 0 ? '复检通过：新文件 0 条元数据' : '复检发现新文件仍带 ' + again.fieldCount + ' 条，注意甄别'
    } catch (e) {
      cleared.value.verify = '新文件字节没能复检（' + (e.message || '读取失败') + '），只比对了体积'
    }
  } catch (e) {
    err.value = e.message || '重绘失败，换一张普通图片试试'
    clearCanvas = null
  }
  busy.value = false
}

async function saveClear() {
  if (!clearCanvas || !cleared.value) return
  const base = src.value && src.value.name ? String(src.value.name).replace(/\.[^.]+$/, '') : 'image'
  try {
    await saveCanvasImage(clearCanvas, base + '-noexif.' + cleared.value.ext, cleared.value.mime, cleared.value.mime === 'image/png' ? undefined : QUALITY)
    toast('已保存，新文件不含元数据')
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
  height: 320rpx;
  border-radius: var(--pk-radius-md);
  background: var(--pk-input);
  overflow: hidden;
}
.preview__img {
  width: 100%;
  height: 100%;
}
.notice-box {
  margin-top: 16rpx;
}
.notice {
  padding: 14rpx 18rpx;
  margin-bottom: 12rpx;
  border-radius: var(--pk-radius-sm);
  background: var(--pk-bg-soft);
  border-left: 6rpx solid var(--pk-text-3);
}
.notice--warn {
  border-left-color: var(--pk-warn);
}
.notice__k {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-bottom: 4rpx;
}
.notice--warn .notice__k,
.notice--warn .notice__t {
  color: var(--pk-warn);
}
.notice__t {
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--pk-text-2);
}
.fields {
  padding: 4rpx 0;
}
.field {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.field:last-child {
  border-bottom: none;
}
.field__main {
  flex: 1;
  min-width: 0;
  margin-right: 16rpx;
}
.field__head {
  display: flex;
  align-items: baseline;
}
.field__name {
  font-size: 26rpx;
  color: var(--pk-text);
  font-weight: 600;
}
.field__tag {
  margin-left: 12rpx;
  font-size: 20rpx;
  color: var(--pk-text-3);
}
.field__tag--raw {
  color: var(--pk-warn);
}
.field__val {
  display: block;
  margin-top: 4rpx;
  font-size: 26rpx;
  line-height: 1.5;
  color: var(--pk-text-2);
  word-break: break-all;
}
.field__note {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: var(--pk-text-3);
}
.field__copy {
  flex-shrink: 0;
  font-size: 22rpx;
  color: var(--pk-accent);
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
  background: var(--pk-accent-soft);
}
.note {
  padding: 4rpx 24rpx 8rpx;
}
.note__t {
  font-size: 22rpx;
  line-height: 1.6;
  color: var(--pk-text-3);
}
.thumb {
  margin: 8rpx 24rpx 12rpx;
  height: 240rpx;
  border-radius: var(--pk-radius-md);
  background: var(--pk-input);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.thumb__img {
  width: 100%;
  height: 100%;
}
.segs {
  max-height: 340rpx;
  margin: 4rpx 24rpx 12rpx;
  padding: 16rpx 18rpx;
  border-radius: var(--pk-radius-md);
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line);
}
.segs__t {
  font-size: 22rpx;
  line-height: 1.7;
  color: var(--pk-text-2);
}
.warn {
  padding: 16rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.warn:last-child {
  border-bottom: none;
}
.warn__t {
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--pk-warn);
}
.btns {
  margin-top: 16rpx;
}
.btns--first {
  padding: 0 24rpx;
  margin-top: 8rpx;
}
.result {
  margin-top: 12rpx;
  border-top: var(--pk-line-w) solid var(--pk-line);
}
</style>
