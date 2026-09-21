<template>
  <view>
    <PkCard padded>
      <PkField v-model="left" type="textarea" :area-height="120" label="原文">
        <template #labelRight>
          <text class="mini-act" @tap="swap">⇅ 对调</text>
          <text class="mini-act" @tap="clearAll">清空</text>
        </template>
      </PkField>
      <PkField v-model="right" type="textarea" :area-height="120" label="改后" />
      <view class="quick-row">
        <text class="quick-i" @tap="loadSample">填入示例</text>
      </view>
    </PkCard>

    <PkCard v-if="error" title="提示" accent="var(--pk-danger)">
      <PkRow label="无法对比" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-else-if="hasBoth">
      <PkCard title="差异统计" accent="#7A6BA8">
        <PkRow label="相同行" :value="diff.stats.same + ' 行'" color="var(--pk-accent)" :copy="false" />
        <PkRow label="删除行" :value="diff.stats.del + ' 行'" color="var(--pk-danger)" :copy="false" />
        <PkRow label="新增行" :value="diff.stats.add + ' 行'" color="var(--pk-accent)" :copy="false" />
        <PkRow label="相似度" :value="diff.stats.similarity + '%'" big :copy="false" />
        <PkRow v-if="diff.stats.truncated" label="注意" value="内容太长，已退化为整块替换的粗略对比" color="var(--pk-warn)" :copy="false" stack />
      </PkCard>

      <PkCard title="逐行差异" accent="var(--pk-accent)">
        <template #extra>
          <text class="mini-act" @tap="copyText(unified)">复制</text>
        </template>
        <view class="diff">
          <view
            v-for="(r, i) in diff.rows"
            :key="i"
            class="diff__row"
            :class="'diff__row--' + r.type"
          >
            <text class="diff__no">{{ r.aNo || '' }}</text>
            <text class="diff__no">{{ r.bNo || '' }}</text>
            <text class="diff__mark">{{ r.type === 'del' ? '−' : r.type === 'add' ? '+' : ' ' }}</text>
            <text class="diff__t">{{ r.text === '' ? '␍' : r.text }}</text>
          </view>
        </view>
        <view class="act-row">
          <PkBtn text="复制带 +/- 的全文" kind="ghost" block @tap="copyText(unified)" />
        </view>
      </PkCard>

      <PkCard v-if="firstChange" title="首个差异的字符级对比" accent="#6B5B95">
        <view class="charline">
          <text
            v-for="(c, i) in firstChange.a"
            :key="'a' + i"
            class="char"
            :class="{ 'char--del': c.type === 'del' }"
          >{{ c.text }}</text>
        </view>
        <view class="charline">
          <text
            v-for="(c, i) in firstChange.b"
            :key="'b' + i"
            class="char"
            :class="{ 'char--add': c.type === 'add' }"
          >{{ c.text }}</text>
        </view>
      </PkCard>
    </template>

    <PkCard v-else title="等两段文本" accent="#7A6BA8">
      <PkRow label="提示" value="左右都填上内容就会逐行比对。适合对代码改动、配置差异、文稿修订" :copy="false" stack />
      <PkRow label="成本控制" value="超过约 200 万行对会自动退化为整块替换，避免手机内存被吃满" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { diffLines, diffChars, toUnified } from '@/utils/diff'
import { copyText } from '@/utils/clipboard'

const left = ref('')
const right = ref('')
const error = ref('')

const hasBoth = computed(() => left.value.trim() !== '' && right.value.trim() !== '')
const diff = computed(() => {
  if (!hasBoth.value) return { rows: [], stats: {} }
  return diffLines(left.value, right.value)
})
const unified = computed(() => toUnified(diff.value.rows || []))

/** 找到第一处修改，做字符级对比 */
const firstChange = computed(() => {
  const rows = diff.value.rows || []
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].type === 'del' && rows[i + 1] && rows[i + 1].type === 'add') {
      return { a: diffChars(rows[i].text, rows[i + 1].text), b: diffChars(rows[i].text, rows[i + 1].text) }
    }
  }
  return null
})

function swap() {
  const t = left.value
  left.value = right.value
  right.value = t
}

function clearAll() {
  left.value = ''
  right.value = ''
}

function loadSample() {
  left.value = '随身匣 v1.0.0\n共 14 个工具\n全部离线可用\n支持深浅色主题'
  right.value = '随身匣 v1.1.0\n共 26 个工具\n全部离线可用\n支持深浅色主题\n新增开发速查'
}
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 24rpx;
}
.quick-row {
  display: flex;
  flex-wrap: wrap;
}
.quick-i {
  display: inline-block;
  font-size: 22rpx;
  color: var(--pk-accent);
  margin: 8rpx 14rpx 0 0;
  padding: 12rpx 20rpx;
  line-height: 1.3;
  border-radius: 10rpx;
  background: var(--pk-accent-soft);
}
.diff {
  padding: 4rpx 0;
}
.diff__row {
  display: flex;
  align-items: flex-start;
  padding: 8rpx 20rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.diff__row--del {
  background: rgba(180, 85, 62, 0.08);
}
.diff__row--add {
  background: rgba(63, 122, 110, 0.08);
}
.diff__no {
  width: 52rpx;
  flex-shrink: 0;
  font-size: 21rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
  text-align: right;
  margin-right: 12rpx;
}
.diff__mark {
  width: 26rpx;
  flex-shrink: 0;
  font-size: 24rpx;
  color: var(--pk-text-3);
}
.diff__t {
  flex: 1;
  font-size: 23rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  word-break: break-all;
  line-height: 1.6;
}
.diff__row--del .diff__t {
  color: var(--pk-danger);
}
.diff__row--add .diff__t {
  color: var(--pk-accent);
}
.act-row {
  padding: 16rpx 24rpx 22rpx;
}
.charline {
  padding: 12rpx 24rpx;
  font-size: 23rpx;
  font-family: Menlo, Consolas, monospace;
  line-height: 1.8;
  color: var(--pk-text-2);
  word-break: break-all;
}
.char--del {
  background: rgba(180, 85, 62, 0.22);
  color: var(--pk-danger);
}
.char--add {
  background: rgba(63, 122, 110, 0.22);
  color: var(--pk-accent);
}
</style>
