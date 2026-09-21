<template>
  <view>
    <PkCard title="转换方向" accent="#4A6FA5">
      <view class="dir">
        <view class="dir__side">
          <text class="dir__label">从</text>
          <picker mode="selector" :range="names" :value="fromIdx" @change="onFrom">
            <view class="picker">
              <text class="picker__t">{{ fromName }}</text>
              <view class="picker__chev"></view>
            </view>
          </picker>
        </view>
        <view class="dir__swap" hover-class="pk-op" @tap="swapFmt">
          <text class="dir__swap-t">⇄</text>
        </view>
        <view class="dir__side">
          <text class="dir__label">到</text>
          <picker mode="selector" :range="names" :value="toIdx" @change="onTo">
            <view class="picker">
              <text class="picker__t">{{ toName }}</text>
              <view class="picker__chev"></view>
            </view>
          </picker>
        </view>
      </view>
      <PkRow label="目标格式说明" :value="toNote" :copy="false" stack />
    </PkCard>

    <PkCard padded>
      <PkField v-model="input" type="textarea" :area-height="160" :label="'输入（' + fromName + '）'">
        <template #labelRight>
          <text class="mini-act" @tap="loadSample">示例</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <view class="act-row">
        <PkBtn text="开始转换" kind="primary" block @tap="run" />
      </view>
    </PkCard>

    <PkCard v-if="error" title="转换失败" accent="var(--pk-danger)">
      <PkRow label="原因" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-if="output">
      <PkCard :title="'输出（' + toName + '）'" accent="var(--pk-accent)">
        <template #extra>
          <text class="mini-act" @tap="copyText(output)">复制</text>
        </template>
        <PkRow v-if="note" label="提示" :value="note" color="var(--pk-warn)" :copy="false" stack />
        <PkField v-model="output" type="textarea" :area-height="240" />
        <view class="act-row">
          <PkBtn text="复制结果" kind="primary" @tap="copyText(output)" />
          <PkBtn text="结果回填为源文本" kind="ghost" @tap="swapWithOutput" />
        </view>
      </PkCard>
    </template>

    <PkCard title="格式速查" accent="#6B5B95">
      <PkRow
        v-for="f in FORMATS"
        :key="f.key"
        :label="f.name"
        :value="FORMAT_NOTES[f.key]"
        :copy="false"
        stack
      />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { convert, FORMATS, FORMAT_NOTES, SAMPLES } from '@/utils/dataconv'
import { copyText } from '@/utils/clipboard'

const input = ref(SAMPLES.json)
const output = ref('')
const error = ref('')
const note = ref('')
const fromKey = ref('json')
const toKey = ref('yaml')

const names = FORMATS.map((f) => f.name)
const fromIdx = computed(() => FORMATS.findIndex((f) => f.key === fromKey.value))
const toIdx = computed(() => (FORMATS.findIndex((f) => f.key === toKey.value) < 0 ? 0 : FORMATS.findIndex((f) => f.key === toKey.value)))
const fromName = computed(() => FORMATS[fromIdx.value].name)
const toName = computed(() => FORMATS[toIdx.value].name)
const toNote = computed(() => FORMAT_NOTES[toKey.value] || '')

function onFrom(e) {
  fromKey.value = FORMATS[Number(e.detail.value)].key
}
function onTo(e) {
  toKey.value = FORMATS[Number(e.detail.value)].key
}
function swapFmt() {
  const a = fromKey.value
  fromKey.value = toKey.value
  toKey.value = a
  if (output.value) {
    input.value = output.value
    output.value = ''
  }
}
function loadSample() {
  input.value = SAMPLES[fromKey.value] || ''
  output.value = ''
  error.value = ''
}

function run() {
  error.value = ''
  note.value = ''
  output.value = ''
  try {
    const r = convert(input.value, fromKey.value, toKey.value)
    output.value = r.text
    note.value = r.note || ''
  } catch (e) {
    error.value = e.message
  }
}

function swapWithOutput() {
  input.value = output.value
  output.value = ''
}
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 24rpx;
}
.dir {
  display: flex;
  align-items: flex-end;
  margin-bottom: 12rpx;
}
.dir__side {
  flex: 1;
}
.dir__label {
  font-size: 22rpx;
  color: var(--pk-text-3);
  display: block;
  margin-bottom: 8rpx;
}
.dir__swap {
  width: 68rpx;
  height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dir__swap-t {
  font-size: 34rpx;
  color: var(--pk-accent);
}
.pk-op {
  opacity: 0.5;
}
.picker {
  height: 76rpx;
  border-radius: var(--pk-radius-md);
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20rpx;
}
.picker__t {
  font-size: 28rpx;
  color: var(--pk-text);
}
.picker__chev {
  width: 12rpx;
  height: 12rpx;
  border-right: 3rpx solid var(--pk-text-3);
  border-bottom: 3rpx solid var(--pk-text-3);
  transform: rotate(45deg) translate(-3rpx, -3rpx);
}
.act-row {
  display: flex;
  gap: 20rpx;
  flex-wrap: wrap;
  padding: 8rpx 0 4rpx;
}
</style>
