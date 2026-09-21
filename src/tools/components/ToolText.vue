<template>
  <view>
    <PkSeg v-model="mode" :items="modes" />

    <PkCard padded>
      <PkField
        v-model="input"
        type="textarea"
        :area-height="200"
        placeholder="在这里粘贴或输入文本……"
      >
        <template #labelRight>
          <text class="mini-act" @tap="pasteFromClipboard">读取剪贴板</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
    </PkCard>

    <!-- 统计 -->
    <template v-if="mode === 'count'">
      <PkCard title="字数统计" accent="var(--pk-accent)">
        <view class="stat-grid">
          <view v-for="s in stats" :key="s.k" class="stat-cell">
            <text class="stat-cell__v">{{ s.v }}</text>
            <text class="stat-cell__k">{{ s.k }}</text>
          </view>
        </view>
      </PkCard>
      <PkCard title="阅读耗时估算" accent="var(--pk-accent)">
        <PkRow label="默读（约 400 字/分）" :value="readTime(400)" />
        <PkRow label="朗读（约 220 字/分）" :value="readTime(220)" />
        <PkRow label="按中文播报（约 300 字/分）" :value="readTime(300)" />
      </PkCard>
    </template>

    <!-- 整理 -->
    <template v-else-if="mode === 'clean'">
      <PkCard title="批量整理" accent="#4A6FA5">
        <view class="op-grid">
          <view v-for="op in ops" :key="op.k" class="op" hover-class="op--hover" @tap="apply(op.k)">
            <text class="op__t">{{ op.n }}</text>
          </view>
        </view>
      </PkCard>
      <PkCard title="输出" accent="#4A6FA5">
        <PkField v-model="output" type="textarea" :area-height="160" placeholder="整理结果会出现在这里" />
        <view class="act-row">
          <PkBtn text="复制结果" kind="primary" @tap="copyText(output)" />
          <PkBtn text="结果替换输入" kind="ghost" @tap="input = output" />
        </view>
      </PkCard>
    </template>

    <!-- 编码 -->
    <template v-else>
      <PkCard title="URL 编码" accent="#6B5B95">
        <PkRow label="编码结果" :value="urlEncoded" />
        <PkRow label="解码结果" :value="urlDecoded" />
      </PkCard>
      <PkCard title="Base64" accent="#6B5B95">
        <PkRow label="标准编码" :value="b64.basic" />
        <PkRow label="URL 安全编码" :value="b64.urlsafe" />
        <PkRow label="解码结果" :value="b64.decoded" />
        <PkRow label="字节长度" :value="b64.byteLen" />
      </PkCard>
    </template>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { copyText, toast } from '@/utils/clipboard'
import * as T from '@/utils/text'
import { utf8Bytes } from '@/utils/base64'

const modes = [
  { key: 'count', name: '统计' },
  { key: 'clean', name: '整理' },
  { key: 'code', name: '编码' },
]

const ops = [
  { k: 'dedupe', n: '行去重' },
  { k: 'dedupeCI', n: '去重(忽略大小写)' },
  { k: 'empty', n: '删空行' },
  { k: 'trim', n: '去首尾空格' },
  { k: 'collapse', n: '合并多余空格' },
  { k: 'sortAsc', n: '升序排列' },
  { k: 'sortDesc', n: '降序排列' },
  { k: 'sortLen', n: '按长度排列' },
  { k: 'reverseLine', n: '行序倒置' },
  { k: 'reverse', n: '整段反转' },
  { k: 'upper', n: '转大写' },
  { k: 'lower', n: '转小写' },
  { k: 'title', n: '首字母大写' },
  { k: 'pad', n: '中英之间加空格' },
  { k: 'number', n: '添加行号' },
  { k: 'strip', n: '去除 HTML 标签' },
  { k: 'py', n: '取拼音首字母' },
]

const mode = ref('count')
const input = ref('')
const output = ref('')

const stats = computed(() => {
  const a = T.analyze(input.value)
  return [
    { k: '总字符', v: a.chars },
    { k: '不计空格', v: a.noSpace },
    { k: '中文', v: a.hanzi },
    { k: '字母', v: a.letters },
    { k: '数字', v: a.digits },
    { k: '标点', v: a.punctuation === undefined ? a.punct : a.punctuation },
    { k: '英文单词', v: a.words },
    { k: '空格', v: a.spaces },
    { k: '行数', v: a.lines },
    { k: '段落', v: a.paragraphs },
  ]
})

function readTime(perMin) {
  const a = T.analyze(input.value)
  const unit = a.hanzi + a.words
  if (!unit) return '—'
  const sec = (unit / perMin) * 60
  if (sec < 60) return Math.round(sec) + ' 秒'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return m + ' 分 ' + s + ' 秒'
}

const urlEncoded = computed(() => {
  if (!input.value) return ''
  try {
    return T.urlEncode(input.value)
  } catch (e) {
    return '编码失败'
  }
})

const urlDecoded = computed(() => {
  if (!input.value) return ''
  try {
    return T.urlDecode(input.value.trim())
  } catch (e) {
    return '输入不是合法的 URL 编码'
  }
})

const b64 = computed(() => {
  const src = input.value
  if (!src) return { basic: '', urlsafe: '', decoded: '', byteLen: '—' }
  let basic = ''
  let urlsafe = ''
  let decoded = ''
  try {
    basic = T.toBase64(src, false)
    urlsafe = T.toBase64(src, true)
  } catch (e) {
    basic = '编码失败'
  }
  try {
    decoded = T.fromBase64(src.trim())
    if (/[\uFFFD]/.test(decoded)) decoded = '（结果包含乱码，可能不是 Base64 文本）'
  } catch (e) {
    decoded = '输入不是合法的 Base64'
  }
  return {
    basic,
    urlsafe,
    decoded,
    byteLen: utf8Bytes(src).length + ' 字节',
  }
})

const OP_MAP = {
  dedupe: (t) => T.dedupeLines(t, false, false),
  dedupeCI: (t) => T.dedupeLines(t, true, true),
  empty: (t) => T.removeEmptyLines(t, false),
  trim: (t) => T.trimLines(t),
  collapse: (t) => T.collapseSpaces(t),
  sortAsc: (t) => T.sortLines(t, 'asc'),
  sortDesc: (t) => T.sortLines(t, 'desc'),
  sortLen: (t) => T.sortLines(t, 'lenAsc'),
  reverseLine: (t) => T.reverseLines(t),
  reverse: (t) => T.reverseText(t),
  upper: (t) => T.toUpperCase(t),
  lower: (t) => T.toLowerCase(t),
  title: (t) => T.toTitleCase(t),
  pad: (t) => T.padCJK(t),
  number: (t) => T.numberLines(t, 1, 2),
  strip: (t) => T.stripHtml(t),
  py: (t) => T.initials(t),
}

function apply(k) {
  if (!input.value) {
    toast('先输入一点内容')
    return
  }
  try {
    output.value = OP_MAP[k](input.value)
  } catch (e) {
    toast('处理失败：' + (e.message || ''))
  }
}

function pasteFromClipboard() {
  uni.getClipboardData({
    success(res) {
      if (res.data) {
        input.value = res.data
        toast('已读入剪贴板内容')
      } else {
        toast('剪贴板是空的')
      }
    },
    fail() {
      toast('读取失败')
    },
  })
}

watch(input, (v) => {
  if (mode.value === 'clean' && output.value) output.value = ''
})
</script>

<style scoped>
.mini-act {
  font-size: 23rpx;
  color: var(--pk-accent);
  margin-left: 24rpx;
}
.stat-grid {
  display: flex;
  flex-wrap: wrap;
  padding: 4rpx 12rpx 16rpx;
}
.stat-cell {
  width: 25%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 18rpx 0;
}
.stat-cell__v {
  font-size: 38rpx;
  font-weight: 600;
  color: var(--pk-text);
  line-height: 1.2;
}
.stat-cell__k {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 8rpx;
}
.op-grid {
  display: flex;
  flex-wrap: wrap;
  padding: 8rpx 14rpx 18rpx;
}
.op {
  padding: 16rpx 22rpx;
  margin: 8rpx;
  border-radius: 12rpx;
  background: var(--pk-seg-bg);
  border: var(--pk-line-w) solid var(--pk-line);
}
.op--hover {
  opacity: 0.6;
}
.op__t {
  font-size: 25rpx;
  color: var(--pk-text);
}
.act-row {
  display: flex;
  gap: 20rpx;
  margin-top: 8rpx;
}
</style>
