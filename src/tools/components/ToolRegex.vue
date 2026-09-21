<template>
  <view>
    <PkCard title="表达式" accent="#8A6D3B">
      <PkField v-model="pattern" placeholder="输入正则，例如 \d{4}" />
      <view class="flags">
        <view
          v-for="f in flagList"
          :key="f.key"
          class="flag"
          :class="{ 'flag--on': flags.indexOf(f.key) > -1 }"
          hover-class="flag--hover"
          @tap="toggleFlag(f.key)"
        >
          <text class="flag__t">{{ f.name }}</text>
          <text class="flag__d">{{ f.desc }}</text>
        </view>
      </view>
      <text class="hint">当前：/{{ pattern || '…' }}/{{ flags }}</text>
    </PkCard>

    <PkCard title="待测文本" accent="#8A6D3B">
      <PkField v-model="text" type="textarea" :area-height="150" placeholder="粘贴要匹配的文本" />
    </PkCard>

    <PkCard v-if="result.error" title="表达式有误" accent="var(--pk-danger)">
      <PkRow label="提示" :value="result.error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-else>
      <PkCard title="匹配结果" accent="var(--pk-accent)">
        <PkRow label="命中数量" :value="result.list.length" big :copy="false" />
        <PkRow label="是否匹配" :value="result.match ? '是' : '否'" :color="result.match ? 'var(--pk-accent)' : ''" :copy="false" />
      </PkCard>

      <PkCard v-if="result.list.length" title="高亮预览" accent="var(--pk-accent)">
        <view class="hl-box">
          <text class="hl-text"><text
            v-for="(p, i) in parts"
            :key="i"
            :class="p.hit ? 'hl-hit' : 'hl-plain'"
          >{{ p.text }}</text></text>
        </view>
      </PkCard>

      <PkCard v-if="result.list.length" title="命中明细" accent="var(--pk-accent)">
        <PkRow
          v-for="(m, i) in result.list.slice(0, 50)"
          :key="i"
          :label="'#' + (i + 1) + ' @ ' + m.index"
          :value="m.text"
          mono
        />
        <view v-if="result.list.length > 50" class="more">
          <text class="more__t">仅显示前 50 条，共 {{ result.list.length }} 条</text>
        </view>
      </PkCard>
    </template>

    <PkCard title="常用表达式" accent="#6B5B95">
      <PkSeg v-model="group" :items="groupItems" />
      <view v-for="item in currentItems" :key="item.name" class="lib-item" hover-class="lib-item--hover" @tap="useItem(item)">
        <view class="lib-item__main">
          <text class="lib-item__n">{{ item.name }}</text>
          <text class="lib-item__p">{{ item.pattern }}</text>
        </view>
        <!-- 整行已经有 @tap="useItem(item)"，这里只是视觉提示，不要再绑事件 -->
        <text class="lib-item__use">套用</text>
      </view>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { runRegex, highlight, REGEX_LIB } from '@/utils/regexlib'
import { toast } from '@/utils/clipboard'

const flagList = [
  { key: 'g', name: 'g', desc: '全部' },
  { key: 'i', name: 'i', desc: '忽略大小写' },
  { key: 'm', name: 'm', desc: '多行' },
  { key: 's', name: 's', desc: '点匹配换行' },
]

const groupItems = REGEX_LIB.map((g) => ({ key: g.group, name: g.group }))

const pattern = ref('')
const flags = ref('g')
const text = ref('')
const group = ref(REGEX_LIB[0].group)

const currentItems = computed(() => {
  const g = REGEX_LIB.find((x) => x.group === group.value)
  return g ? g.items : []
})

const result = computed(() => runRegex(pattern.value, flags.value, text.value))

const parts = computed(() => highlight(text.value, result.value.list))

function toggleFlag(k) {
  const arr = flags.value.split('')
  const i = arr.indexOf(k)
  if (i > -1) arr.splice(i, 1)
  else arr.push(k)
  flags.value = arr.join('')
}

function useItem(item) {
  pattern.value = item.pattern
  if (!text.value) {
    text.value = item.sample
    toast('已填入示例文本')
  }
}
</script>

<style scoped>
.flags {
  display: flex;
  gap: 16rpx;
  flex-wrap: wrap;
}
.flag {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12rpx 20rpx;
  border-radius: var(--pk-radius-sm);
  background: var(--pk-seg-bg);
  border: var(--pk-line-w) solid var(--pk-line);
}
.flag--on {
  background: var(--pk-accent-soft);
  border-color: var(--pk-accent);
}
.flag--hover {
  opacity: 0.65;
}
.flag__t {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--pk-text-2);
}
.flag--on .flag__t {
  color: var(--pk-accent);
}
.flag__d {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 4rpx;
}
.hint {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 16rpx;
  display: block;
  word-break: break-all;
}
.hl-box {
  padding: 20rpx 24rpx 24rpx;
}
.hl-text {
  font-size: 26rpx;
  line-height: 1.8;
  color: var(--pk-text-2);
  word-break: break-all;
}
.hl-plain {
  color: var(--pk-text-2);
}
.hl-hit {
  color: var(--pk-on-accent);
  background: var(--pk-accent);
  border-radius: 4rpx;
}
.more {
  padding: 16rpx 24rpx 20rpx;
}
.more__t {
  font-size: 22rpx;
  color: var(--pk-text-3);
}
.lib-item {
  display: flex;
  align-items: center;
  padding: 18rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.lib-item--hover {
  background: var(--pk-seg-bg);
}
.lib-item__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.lib-item__n {
  font-size: 26rpx;
  color: var(--pk-text);
}
.lib-item__p {
  font-size: 22rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
  margin-top: 6rpx;
  word-break: break-all;
}
.lib-item__use {
  display: inline-block;
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 16rpx;
  padding: 10rpx 20rpx;
  line-height: 1.2;
  border-radius: var(--pk-radius-sm);
  border: var(--pk-line-w) solid var(--pk-accent);
  flex-shrink: 0;
  align-self: center;
}
</style>
