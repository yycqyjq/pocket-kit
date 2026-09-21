<template>
  <view>
    <PkCard title="方向" accent="#8A6D3B">
      <PkSeg v-model="dir" :items="dirItems" />
    </PkCard>

    <PkCard padded>
      <PkField
        v-model="input"
        type="textarea"
        :area-height="100"
        :label="dir === 'enc' ? '文本 → QP' : 'QP → 文本'"
        :placeholder="dir === 'enc' ? '输入任意文本' : '粘贴 =E9=9A=8F 这种内容'"
      >
        <template #labelRight>
          <text class="mini-act" @tap="input = QP_SAMPLE">示例</text>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <PkSwitchRow v-model="softBreak" title="启用软换行" desc="每 76 字符在行尾放一个单独的 =，解码时会拼回去" />
      <view class="act-row">
        <PkBtn text="转换" kind="primary" @tap="run" />
        <PkBtn text="复制结果" kind="ghost" @tap="copyText(output)" />
      </view>
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard v-if="output" title="结果" accent="var(--pk-accent)">
      <PkRow label="字节数" :value="qpBytes + ' 字节'" :copy="false" />
      <PkRow v-if="decodeInfo && decodeInfo.badEscapes" label="不完整的转义" :value="decodeInfo.badEscapes + ' 处'" color="var(--pk-warn)" :copy="false" />
      <PkOutput :value="output" mono />
    </PkCard>

    <PkCard title="QP 是什么" accent="#8C5B3E">
      <PkRow v-for="(n, i) in QP_NOTES" :key="i" :label="'第 ' + (i + 1) + ' 条'" :value="n" :copy="false" stack />
      <PkRow label="和 Base64 的区别" value="QP 只转义特殊字符，英文单词还能直接读出来；Base64 会把整个内容都变成乱码" :copy="false" stack />
      <PkRow label="典型场景" value="在邮件源码里、某些老系统的配置里会看到这种内容" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { encodeQP, decodeQP, QP_SAMPLE, QP_NOTES } from '@/utils/qp'
import { copyText, toast } from '@/utils/clipboard'

const dirItems = [
  { key: 'enc', name: '文本 → QP' },
  { key: 'dec', name: 'QP → 文本' },
]

const dir = ref('dec')
const input = ref(QP_SAMPLE)
const output = ref('')
const error = ref('')
const qpBytes = ref(0)
const softBreak = ref(true)
const decodeInfo = ref(null)

function run() {
  error.value = ''
  output.value = ''
  decodeInfo.value = null
  if (!input.value.trim()) {
    error.value = '请先输入内容'
    return
  }
  try {
    if (dir.value === 'enc') {
      const r = encodeQP(input.value, { softBreak: softBreak.value })
      output.value = r.text
      qpBytes.value = r.bytes
    } else {
      const r = decodeQP(input.value)
      output.value = r.text
      qpBytes.value = r.bytes
      decodeInfo.value = r
    }
  } catch (e) {
    error.value = e.message
  }
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

run()
</script>

<style scoped>
.act-row {
  display: flex;
  gap: 18rpx;
  flex-wrap: wrap;
  padding: 8rpx 0 12rpx;
}
</style>
