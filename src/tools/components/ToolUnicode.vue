<template>
  <view>
    <PkCard padded>
      <PkField v-model="input" type="textarea" :area-height="110" label="文本">
        <template #labelRight>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-if="sum">
      <PkCard title="整体构成" accent="var(--pk-accent)">
        <PkRow label="字符数" :value="sum.chars + ' 个'" big :copy="false" />
        <PkRow label="UTF-16 码元" :value="sum.utf16Units + ' 个'" :copy="false" />
        <PkRow label="UTF-8 字节" :value="sum.utf8Bytes + ' 字节'" :copy="false" />
        <PkRow label="最长字符占" :value="sum.maxBytes + ' 字节'" :copy="false" />
        <PkRow
          label="含代理对"
          :value="sum.hasSurrogatePair ? '是（有 Emoji 或扩展汉字）' : '否'"
          :copy="false"
        />
        <PkRow
          label="可疑不可见字符"
          :value="sum.suspects ? sum.suspects + ' 个 ⚠️' : '无'"
          :color="sum.suspects ? 'var(--pk-danger)' : 'var(--pk-accent)'"
          :copy="false"
        />
      </PkCard>

      <PkCard v-if="sum.suspects" title="⚠️ 发现不可见字符" accent="var(--pk-danger)">
        <PkRow
          label="为什么要在意"
          value="零宽空格、双向控制符这类字符肉眼看不见，但会让「看起来一样」的两段文本比对不相等，也可能被用来伪装文件名和域名"
          :copy="false"
          stack
        />
        <view v-for="c in suspectChars" :key="c.index" class="row">
          <text class="row__i">#{{ c.index }}</text>
          <text class="row__hex">{{ c.hex }}</text>
          <text class="row__name">{{ c.kind }}</text>
        </view>
      </PkCard>

      <PkCard title="字符构成" accent="#4A6FA5">
        <PkRow
          v-for="(n, k) in sum.kinds"
          :key="k"
          :label="k"
          :value="n + ' 个'"
          :copy="false"
        />
      </PkCard>

      <PkCard :title="'逐字符明细（' + list.length + (truncated ? '，只显示前 500' : '') + '）'" accent="#6B5B95">
        <view v-for="c in list" :key="c.index" class="ch">
          <view class="ch__head">
            <text class="ch__idx">{{ c.index }}</text>
            <text class="ch__char">{{ c.visible }}</text>
            <text class="ch__hex">{{ c.hex }}</text>
            <text class="ch__kind" :class="{ 'ch__kind--warn': c.suspect }">{{ c.kind }}</text>
          </view>
          <text class="ch__detail">十进制 {{ c.dec }} ｜ UTF-8 {{ c.bytes }}（{{ c.byteCount }} 字节）｜ UTF-16 {{ c.utf16.join(' + ') }}</text>
          <text class="ch__code" @tap="copyText(c.jsEscape)">JS {{ c.jsEscape }}　HTML {{ c.entity }}　URL {{ c.urlEncoded }}</text>
        </view>
      </PkCard>

      <PkCard title="转义全部非 ASCII" accent="var(--pk-warn)">
        <template #extra>
          <text class="mini-act" @tap="copyText(escaped)">复制</text>
        </template>
        <PkSeg v-model="escapeStyle" :items="escapeItems" />
        <PkOutput :value="escaped" mono />
      </PkCard>
    </template>

    <PkCard title="从码点还原文字" accent="#2F8C7A">
      <PkField v-model="cpInput" type="textarea" :area-height="70" placeholder="4E2D 6587 或 U+4E2D 或 20013 25991" />
      <PkRow label="结果" :value="cpResult" :copy="cpResult !== '—'" />
      <PkRow
        label="进制规则"
        value="带 U+ / 0x 前缀的一律按十六进制；其余整串里只要出现 a-f 字母就全按十六进制，全是数字则按十进制。所以 4E2D 6587 和 20013 25991 都能解出「中文」"
        :copy="false"
        stack
      />
    </PkCard>

    <PkCard title="常见不可见字符" accent="#8C5B3E">
      <view v-for="s in SUSPICIOUS_LIST" :key="s.code" class="row">
        <text class="row__i">{{ s.code }}</text>
        <text class="row__name">{{ s.name }}</text>
      </view>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { analyze, summarize, escapeAll, fromCodePoints, SUSPICIOUS_LIST } from '@/utils/unicode'
import { copyText, toast } from '@/utils/clipboard'

const input = ref('')
const escapeStyle = ref('unicode')
const cpInput = ref('4E2D 6587')

const escapeItems = [
  { key: 'unicode', name: 'JS \\u 转义' },
  { key: 'html', name: 'HTML 实体' },
  { key: 'url', name: 'URL 百分号' },
]

const parsed = computed(() => {
  if (!input.value) return { list: [], total: 0, truncated: false, sum: null, error: '' }
  try {
    const a = analyze(input.value)
    return { ...a, sum: summarize(input.value), error: '' }
  } catch (e) {
    return { list: [], total: 0, truncated: false, sum: null, error: e.message }
  }
})
const list = computed(() => parsed.value.list)
const truncated = computed(() => parsed.value.truncated)
const sum = computed(() => parsed.value.sum)
const error = computed(() => parsed.value.error)
const suspectChars = computed(() => list.value.filter((c) => c.suspect))
const escaped = computed(() => escapeAll(input.value, escapeStyle.value))

const cpResult = computed(() => {
  if (!cpInput.value.trim()) return '—'
  try {
    return fromCodePoints(cpInput.value)
  } catch (e) {
    return '无法解析：' + e.message
  }
})

function paste() {
  uni.getClipboardData({
    success(res) {
      if (res.data) input.value = String(res.data)
      else toast('剪贴板是空的')
    },
    fail() {
      toast('读取失败')
    },
  })
}
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 22rpx;
}
.row {
  display: flex;
  align-items: baseline;
  padding: 12rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.row:last-child {
  border-bottom: none;
}
.row__i {
  font-size: 22rpx;
  color: var(--pk-text-3);
  min-width: 110rpx;
  font-family: Menlo, Consolas, monospace;
}
.row__hex {
  font-size: 24rpx;
  color: var(--pk-accent);
  font-family: Menlo, Consolas, monospace;
  min-width: 130rpx;
}
.row__name {
  flex: 1;
  font-size: 24rpx;
  color: var(--pk-text-2);
  line-height: 1.6;
}
.ch {
  padding: 16rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.ch:last-child {
  border-bottom: none;
}
.ch__head {
  display: flex;
  align-items: baseline;
}
.ch__idx {
  font-size: 20rpx;
  color: var(--pk-text-3);
  min-width: 56rpx;
}
.ch__char {
  font-size: 30rpx;
  color: var(--pk-text);
  min-width: 70rpx;
}
.ch__hex {
  font-size: 24rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-accent);
  min-width: 130rpx;
}
.ch__kind {
  flex: 1;
  font-size: 22rpx;
  color: var(--pk-text-3);
}
.ch__kind--warn {
  color: var(--pk-danger);
  font-weight: 600;
}
.ch__detail {
  display: block;
  font-size: 20rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
  font-family: Menlo, Consolas, monospace;
  line-height: 1.6;
  word-break: break-all;
}
.ch__code {
  display: block;
  font-size: 20rpx;
  color: var(--pk-text-2);
  margin-top: 6rpx;
  font-family: Menlo, Consolas, monospace;
  line-height: 1.6;
  word-break: break-all;
}
</style>
