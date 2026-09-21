<template>
  <view>
    <PkCard title="输入" accent="#6B5B95">
      <PkField v-model="input" placeholder="输入数字，例如 255" :maxlength="64">
        <template #labelRight>
          <text class="mini-act" @tap="input = '-' + input">取负</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <view class="from-row">
        <text class="from-label">按此进制解读</text>
        <PkSeg v-model="fromRadix" :items="radixItems" />
      </view>
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" />
    </PkCard>

    <PkCard title="转换结果" accent="#6B5B95">
      <PkRow
        v-for="r in results"
        :key="r.key"
        :label="r.name"
        :value="r.value"
        :mono="true"
        :copy="!!r.value"
      />
    </PkCard>

    <PkCard v-if="bit" title="二进制视图" accent="var(--pk-accent)">
      <PkRow label="分组（4 位）" :value="bit.binaryGrouped" mono />
      <PkRow label="按字节" :value="bit.bytes" mono />
      <PkRow label="十六进制" :value="bit.hex" mono />
      <PkRow label="八进制" :value="bit.oct" mono />
      <PkRow label="有效位数" :value="bit.binary.replace(/^0+/, '').length + ' 位'" />
    </PkCard>

    <PkCard v-if="bit" title="有符号数值细节" accent="var(--pk-accent)">
      <PkSeg v-model="bits" :items="bitOptions" />
      <PkRow :label="'按 ' + bits + ' 位无符号解读'" :value="bit.unsigned" mono />
      <PkRow :label="'按 ' + bits + ' 位补码解读'" :value="bit.binary" mono />
      <PkRow label="按位取反" :value="bit.inverted" mono />
    </PkCard>

    <PkCard title="字符编码" accent="#8A6D3B">
      <PkField v-model="asciiIn" placeholder="输入字符，得到 ASCII 码" />
      <PkRow label="ASCII 码" :value="asciiOut" mono />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import * as R from '@/utils/radix'
import { asciiFromText } from '@/utils/radix'

const radixItems = [
  { key: 2, name: '2 进制' },
  { key: 8, name: '8 进制' },
  { key: 10, name: '10 进制' },
  { key: 16, name: '16 进制' },
  { key: 32, name: '32 进制' },
  { key: 36, name: '36 进制' },
]

const bitOptions = [
  { key: 8, name: '8 位' },
  { key: 16, name: '16 位' },
  { key: 32, name: '32 位' },
]

const input = ref('')
const fromRadix = ref(10)
const bits = ref(32)
const asciiIn = ref('')

const error = ref('')

const results = computed(() => {
  error.value = ''
  const raw = String(input.value).trim()
  if (!raw) return radixItems.map((r) => ({ key: r.key, name: r.name, value: '' }))
  if (!R.isValidInRadix(raw, fromRadix.value)) {
    error.value = '含有不属于 ' + fromRadix.value + ' 进制的字符'
    return radixItems.map((r) => ({ key: r.key, name: r.name, value: '' }))
  }
  try {
    const all = R.convertAll(raw, fromRadix.value)
    return radixItems.map((r) => ({ key: r.key, name: r.name, value: all[r.key] || '' }))
  } catch (e) {
    error.value = e.message || '转换失败'
    return radixItems.map((r) => ({ key: r.key, name: r.name, value: '' }))
  }
})

const bit = computed(() => {
  const raw = String(input.value).trim()
  if (!raw || error.value) return null
  try {
    return R.bitDetail(raw, fromRadix.value, bits.value)
  } catch (e) {
    return null
  }
})

const asciiOut = computed(() => {
  if (!asciiIn.value) return ''
  return asciiFromText(asciiIn.value).join(' ')
})
</script>

<style scoped>
.mini-act {
  font-size: 24rpx;
  color: var(--pk-accent);
  margin-left: 24rpx;
}
.from-row {
  margin-top: 16rpx;
}
.from-label {
  font-size: 24rpx;
  color: var(--pk-text-3);
  display: block;
  margin-bottom: 12rpx;
}
</style>
