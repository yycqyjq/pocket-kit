<template>
  <view>
    <PkCard title="方向" accent="#5B6B8C">
      <PkSeg v-model="dir" :items="dirItems" />
    </PkCard>

    <PkCard padded>
      <PkField
        v-model="input"
        type="textarea"
        :area-height="140"
        :label="dir === 'enc' ? '文本 → 十六进制' : '十六进制 → 文本'"
        :placeholder="dir === 'enc' ? '输入任意文本' : '粘贴十六进制'"
      >
        <template #labelRight>
          <text class="mini-act" @tap="input = HEX_SAMPLE">示例</text>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <PkSwitchRow v-model="upper" title="大写十六进制" desc="AB CD 比 ab cd 好读" />
      <PkSwitchRow v-model="prefix" title="加 0x 前缀" desc="0xE9 0x9A 0x8F 这种写法，代码里常用" :last="true" />
      <view class="act-row">
        <PkBtn text="转换" kind="primary" @tap="run" />
      </view>
    </PkCard>

    <PkCard v-if="error" title="提示" accent="var(--pk-danger)">
      <PkRow label="原因" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard v-if="output" title="结果" accent="var(--pk-accent)">
      <template #extra>
        <text class="mini-act" @tap="copyText(output)">复制</text>
      </template>
      <PkRow label="字节数" :value="bytes + ' 字节'" :copy="false" />
      <PkOutput :value="output" mono />
    </PkCard>

    <PkCard title="hexdump 转储视图" accent="#6B5B95">
      <template #extra>
        <text class="mini-act" @tap="copyText(dump)">复制</text>
      </template>
      <view class="dump">
        <text class="dump__t" selectable>{{ dump || '输入内容后这里会生成偏移量 + 十六进制 + ASCII 的转储视图' }}</text>
      </view>
      <PkRow
        label="说明"
        value="每行 16 字节：左边是偏移量，中间是十六进制，右边是能打印的字符（不可打印的显示点）"
        :copy="false"
        stack
      />
    </PkCard>

    <PkCard title="常见字节序列" accent="#8A6D3B">
      <view v-for="b in BYTE_NOTES" :key="b.hex" class="note">
        <text class="note__h">{{ b.hex }}</text>
        <text class="note__n">{{ b.name }}</text>
        <text class="note__t">{{ b.note }}</text>
      </view>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { textToHex, hexToText, hexdump, fromHexdump, BYTE_NOTES, HEX_SAMPLE } from '@/utils/hexdump'
import { copyText, toast } from '@/utils/clipboard'

const dirItems = [
  { key: 'enc', name: '文本 → 十六进制' },
  { key: 'dec', name: '十六进制 → 文本' },
]

const dir = ref('enc')
const input = ref(HEX_SAMPLE)
const output = ref('')
const error = ref('')
const bytes = ref(0)
const upper = ref(false)
const prefix = ref(false)
const dump = ref('')

function run() {
  error.value = ''
  output.value = ''
  bytes.value = 0
  try {
    if (dir.value === 'enc') {
      const r = textToHex(input.value, { sep: ' ', upper: upper.value, prefix: prefix.value })
      output.value = r.text
      bytes.value = r.bytes
    } else {
      const r = hexToText(input.value)
      output.value = r.text
      bytes.value = r.bytes
    }
    if (dir.value === 'enc') {
      const d = hexdump(input.value)
      dump.value = d.text
    } else {
      // 解码方向：把还原出来的内容再转一次转储，方便比对
      const d = hexdump(output.value)
      dump.value = d.text
    }
  } catch (e) {
    error.value = e.message
  }
}

/** 把用户输入里无关的字符去掉，只留十六进制 */
function cleanHex(x) {
  return String(x).replace(/0x/gi, ' ').replace(/[^0-9a-fA-F]/g, '')
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
.act-row {
  display: flex;
  gap: 18rpx;
  flex-wrap: wrap;
  padding: 8rpx 0 12rpx;
}
.dump {
  margin: 8rpx 24rpx 18rpx;
  padding: 18rpx;
  border-radius: 14rpx;
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line);
  overflow: hidden;
}
.dump__t {
  font-size: 20rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text-2);
  line-height: 1.9;
  word-break: break-all;
}
.note {
  padding: 14rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.note:last-child {
  border-bottom: none;
}
.note__h {
  font-size: 23rpx;
  color: var(--pk-accent);
  font-family: Menlo, Consolas, monospace;
}
.note__n {
  font-size: 23rpx;
  color: var(--pk-text);
  margin-left: 16rpx;
}
.note__t {
  display: block;
  font-size: 21rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
  line-height: 1.6;
}
</style>
