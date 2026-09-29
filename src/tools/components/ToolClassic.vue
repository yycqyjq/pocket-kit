<template>
  <view>
    <PkCard title="选方法" accent="#5B6B8C">
      <PkSeg v-model="method" :items="methodItems" />
      <PkRow label="说明" :value="current.note" :copy="false" stack />
      <PkField
        v-if="current.needNum"
        v-model="numValue"
        type="number"
        :label="current.numLabel"
      />
      <PkField v-model="input" type="textarea" :area-height="110" label="输入">
        <template #labelRight>
          <text class="mini-act" @tap="input = SAMPLE_CLASSIC">示例</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <view class="act-row">
        <PkBtn text="编码" kind="primary" @tap="run(false)" />
        <PkBtn text="解码" kind="soft" @tap="run(true)" />
        <PkBtn text="复制结果" kind="ghost" @tap="copyText(output)" />
        <PkBtn text="结果当输入" kind="ghost" @tap="useOutput" />
      </view>
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard v-if="output" title="结果" accent="var(--pk-accent)">
      <PkOutput :value="output" mono :size="24" />
    </PkCard>

    <PkCard v-if="method === 'caesar' && brute.length" title="凯撒暴力枚举" accent="var(--pk-warn)">
      <PkRow label="用途" value="不知道位移是多少时，把 26 种可能全列出来，一眼就能找到像正常文字的那一行" :copy="false" stack />
      <view v-for="b in brute" :key="b.shift" class="brute" hover-class="brute--hover" @tap="output = b.text">
        <text class="brute__s">{{ b.shift }}</text>
        <text class="brute__t">{{ b.text }}</text>
      </view>
    </PkCard>

    <PkCard title="先说清楚：这些不是加密" accent="var(--pk-danger)">
      <PkRow label="凯撒 / ROT13" value="只是把字母表转一下，26 种可能穷举一遍就破" :copy="false" stack />
      <PkRow label="栅栏 / 培根 / A1Z26" value="纯字符变换，不涉及密钥，任何人知道方法就能还原" :copy="false" stack />
      <PkRow label="用途" value="解谜游戏、字符混淆、给朋友留个谜语可以；保护真实机密请用正经加密" :copy="false" stack />
    </PkCard>

    <PkCard title="摩斯电码速查" accent="#2F8C7A">
      <view class="grid">
        <view v-for="m in morseTable" :key="m[0]" class="cell">
          <text class="cell__c">{{ m[0] }}</text>
          <text class="cell__m">{{ m[1] }}</text>
        </view>
      </view>
      <PkRow label="分隔规则" value="字母之间用空格，单词之间用 / 或 |。解码时这两种都能识别" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { METHODS, runMethod, caesarBrute, SAMPLE_CLASSIC } from '@/utils/classic'
import { copyText, toast } from '@/utils/clipboard'

const methodItems = METHODS.map((m) => ({ key: m.key, name: m.name }))

const method = ref('caesar')
const numValue = ref(3)
const input = ref(SAMPLE_CLASSIC)
const output = ref('')
const error = ref('')

const current = computed(() => METHODS.find((m) => m.key === method.value) || METHODS[0])

const brute = computed(() => {
  if (method.value !== 'caesar' || !input.value) return []
  return caesarBrute(input.value)
})

const morseTable = [
  ['A', '.-'], ['B', '-...'], ['C', '-.-.'], ['D', '-..'], ['E', '.'], ['F', '..-.'],
  ['G', '--.'], ['H', '....'], ['I', '..'], ['J', '.---'], ['K', '-.-'], ['L', '.-..'],
  ['M', '--'], ['N', '-.'], ['O', '---'], ['P', '.--.'], ['Q', '--.-'], ['R', '.-.'],
  ['S', '...'], ['T', '-'], ['U', '..-'], ['V', '...-'], ['W', '.--'], ['X', '-..-'],
  ['Y', '-.--'], ['Z', '--..'], ['0', '-----'], ['1', '.----'], ['2', '..---'],
  ['3', '...--'], ['4', '....-'], ['5', '.....'], ['6', '-....'], ['7', '--...'],
  ['8', '---..'], ['9', '----.'], ['?', '..--..'], ['!', '-.-.--'], [',', '--..--'],
  ['.', '.-.-.-'], ['/', '-..-.'], ['@', '.--.-.'],
]

watch(method, (k) => {
  const m = METHODS.find((x) => x.key === k)
  if (m && m.numDefault) numValue.value = m.numDefault
  output.value = ''
  error.value = ''
})

function run(decode) {
  error.value = ''
  if (!input.value) {
    toast('先输入内容')
    return
  }
  try {
    output.value = runMethod(method.value, input.value, Number(numValue.value), decode)
  } catch (e) {
    error.value = e.message
    output.value = ''
  }
}

function useOutput() {
  if (!output.value) return
  input.value = output.value
  output.value = ''
}
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 22rpx;
}
.act-row {
  display: flex;
  gap: 16rpx;
  flex-wrap: wrap;
  padding: 8rpx 0 12rpx;
}
.brute {
  display: flex;
  align-items: baseline;
  padding: 10rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.brute--hover {
  background: var(--pk-seg-bg);
}
.brute__s {
  width: 56rpx;
  font-size: 22rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
}
.brute__t {
  flex: 1;
  font-size: 24rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text-2);
  word-break: break-all;
}
.grid {
  display: flex;
  flex-wrap: wrap;
  padding: 8rpx 16rpx 16rpx;
}
.cell {
  width: calc(25% - 12rpx);
  margin: 6rpx;
  padding: 10rpx 6rpx;
  border-radius: var(--pk-radius-sm);
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.cell__c {
  font-size: 28rpx;
  color: var(--pk-text);
  font-weight: 600;
}
.cell__m {
  font-size: 20rpx;
  color: var(--pk-accent);
  font-family: Menlo, Consolas, monospace;
  margin-top: 4rpx;
}
</style>
