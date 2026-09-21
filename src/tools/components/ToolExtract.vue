<template>
  <view>
    <PkCard padded>
      <PkField v-model="input" type="textarea" :area-height="150" label="任意文本">
        <template #labelRight>
          <text class="mini-act" @tap="input = EXTRACT_SAMPLE">示例</text>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <view class="cat-row">
        <text
          v-for="p in PATTERNS"
          :key="p.key"
          class="cat-i"
          :class="{ 'cat-i--off': !enabled[p.key] }"
          @tap="enabled[p.key] = !enabled[p.key]"
        >{{ p.name }}</text>
      </view>
      <PkRow label="抽到" :value="total + ' 项'" :copy="false" />
    </PkCard>

    <template v-if="groups.length">
      <PkCard v-for="g in groups" :key="g.key" :title="g.name + '（' + g.items.length + '）'" :accent="color(g.key)">
        <template #extra>
          <text class="mini-act" @tap="copyText(g.items.join('\n'))">复制</text>
        </template>
        <view class="list">
          <text v-for="(item, i) in g.items" :key="i" class="item__v" @tap="copyText(item)">{{ item }}</text>
        </view>
        <text class="note">{{ g.note }}</text>
      </PkCard>
    </template>

    <PkCard v-else-if="input.trim()" title="什么都没抽到" accent="var(--pk-danger)">
      <PkRow label="原因" value="文本里没有匹配到所选类型的内容" :copy="false" stack />
    </PkCard>

    <PkCard title="会重叠的几类" accent="var(--pk-warn)">
      <PkRow label="手机号 vs 银行卡" value="11 位的手机号也是合法的长数字串，只勾银行卡时会抽到手机号" :copy="false" stack />
      <PkRow label="身份证 vs 银行卡" value="18 位身份证同时满足银行卡的长度要求，两者都有时按身份证优先" :copy="false" stack />
      <PkRow label="网址 vs 邮箱" value="邮箱的域名部分也满足网址特征，两个都勾时会有重复" :copy="false" stack />
      <PkRow label="建议" value="只勾你需要的那几类，其余关掉，结果更干净" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { extract, PATTERNS, EXTRACT_SAMPLE } from '@/utils/extract'
import { copyText, toast } from '@/utils/clipboard'

const input = ref(EXTRACT_SAMPLE)
const enabled = reactive({})
PATTERNS.forEach((p) => {
  enabled[p.key] = true
})

const activeKeys = computed(() => PATTERNS.filter((p) => enabled[p.key]).map((p) => p.key))

const result = computed(() => {
  if (!input.value.trim()) return { groups: [], total: 0 }
  try {
    return extract(input.value, { keys: activeKeys.value, dedupe: true })
  } catch (e) {
    return { groups: [], total: 0 }
  }
})
const groups = computed(() => result.value.groups)
const total = computed(() => result.value.total)

const accents = {
  url: '#4A6FA5', email: '#6B5B95', phone: '#3E7A4E', tel: '#3E7A4E',
  ipv4: '#2F7A8C', idcard: 'var(--pk-warn)', bankcard: 'var(--pk-danger)', uscc: '#8C5B3E',
  date: '#7A6BA8', time: '#7A6BA8', money: '#3E7A4E', percent: '#B5527A',
  uuid: '#5B7A3E', color: '#B5527A', hashtag: '#4A6FA5', mention: '#6B5B95',
}
function color(k) {
  return accents[k] || 'var(--pk-accent)'
}

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
.cat-row {
  display: flex;
  flex-wrap: wrap;
  margin: 8rpx 0 12rpx;
}
.cat-i {
  display: inline-block;
  font-size: 22rpx;
  color: var(--pk-text-2);
  margin: 6rpx 12rpx 0 0;
  padding: 10rpx 18rpx;
  line-height: 1.3;
  border-radius: 999rpx;
  border: var(--pk-line-w) solid var(--pk-line-strong);
}
.cat-i--off {
  color: var(--pk-text-3);
  opacity: 0.5;
  text-decoration: line-through;
}
.list {
  padding: 4rpx 24rpx 14rpx;
}
.item__v {
  display: block;
  font-size: 24rpx;
  color: var(--pk-text);
  font-family: Menlo, Consolas, monospace;
  padding: 10rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
  line-height: 1.6;
  word-break: break-all;
}
.item__v:last-child {
  border-bottom: none;
}
.note {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  padding: 0 24rpx 14rpx;
  line-height: 1.6;
}
</style>
