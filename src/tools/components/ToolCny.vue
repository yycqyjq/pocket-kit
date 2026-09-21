<template>
  <view>
    <PkCard title="输入数字" accent="var(--pk-warn)">
      <PkSeg v-model="mode" :items="modes" />
      <PkField v-model="input" type="digit" :label="mode === 'money' ? '金额（元）' : '整数'" placeholder="例如 1234.56" />
      <view class="quick-row">
        <text v-for="q in quicks" :key="q.n" class="quick-i" @tap="input = q.v">{{ q.n }}</text>
      </view>
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-if="!error && input">
      <PkCard title="财务大写" accent="var(--pk-accent)">
        <view class="hero">
          <text class="hero__t" selectable>{{ upper }}</text>
        </view>
        <view class="act-row">
          <PkBtn text="复制大写" kind="primary" block @tap="copyText(upper)" />
        </view>
        <PkRow label="用途" value="报销单、合同、支票、发票这类需要写大写的场合" :copy="false" stack />
      </PkCard>

      <PkCard v-if="mode === 'money'" title="拆解" accent="#4A6FA5">
        <PkRow label="日常读法" :value="lower" />
        <PkRow label="整数部分" :value="parts.int" />
        <PkRow label="角" :value="parts.jiao" :copy="false" />
        <PkRow label="分" :value="parts.fen" :copy="false" />
        <PkRow label="原始输入" :value="input" :copy="false" />
      </PkCard>

      <PkCard v-else title="日常读法" accent="#4A6FA5">
        <PkRow label="小写读法" :value="lower" />
        <PkRow label="大写读法" :value="upper" />
      </PkCard>
    </template>

    <PkCard title="书写规范" accent="#6B5B95">
      <PkRow label="1 ~ 10" value="壹 贰 叁 肆 伍 陆 柒 捌 玖 壹拾" :copy="false" stack />
      <PkRow label="单位" value="拾 佰 仟 万 亿，元 角 分" :copy="false" stack />
      <PkRow label="整" value="没有角分时末尾加「整」" :copy="false" stack />
      <PkRow label="零的写法" value="连续零只写一个；万位断档要补零，如 10001 → 壹万零壹元整" :copy="false" stack />
      <PkRow label="金额上限" value="本工具支持到「万亿」位（10^16 以内）" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { toChineseUpper, toChineseLower, numberToChinese } from '@/utils/cny'
import { copyText } from '@/utils/clipboard'

const modes = [
  { key: 'money', name: '金额' },
  { key: 'int', name: '整数' },
]

const mode = ref('money')
const input = ref('1234.56')
const error = ref('')

const quicks = [
  { n: '0.01', v: '0.01' },
  { n: '100', v: '100' },
  { n: '10000', v: '10000' },
  { n: '100000000', v: '100000000' },
]

const upper = computed(() => {
  error.value = ''
  if (!input.value) return ''
  try {
    return mode.value === 'money' ? toChineseUpper(input.value) : numberToChinese(input.value, true)
  } catch (e) {
    error.value = e.message
    return ''
  }
})

const lower = computed(() => {
  if (!input.value || error.value) return ''
  try {
    return mode.value === 'money' ? toChineseLower(input.value) : numberToChinese(input.value, false)
  } catch (e) {
    return ''
  }
})

const parts = computed(() => {
  if (mode.value !== 'money') return { int: '', jiao: '', fen: '' }
  const s = String(input.value).replace(/[,\s￥¥]/g, '')
  const [int = '0', dec = ''] = s.split('.')
  const d = (dec + '00').slice(0, 2)
  return {
    int: int || '0',
    jiao: d[0] === '0' ? '无' : d[0] + ' 角',
    fen: d[1] === '0' ? '无' : d[1] + ' 分',
  }
})
</script>

<style scoped>
.hero {
  padding: 24rpx 24rpx 8rpx;
}
.hero__t {
  font-size: 38rpx;
  font-weight: 600;
  color: var(--pk-text);
  line-height: 1.6;
  letter-spacing: 1rpx;
}
.act-row {
  padding: 12rpx 24rpx 22rpx;
}
.quick-row {
  display: flex;
  flex-wrap: wrap;
  margin-top: 4rpx;
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
</style>
