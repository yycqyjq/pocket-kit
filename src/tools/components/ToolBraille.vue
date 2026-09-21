<template>
  <view>
    <PkCard title="方向" accent="#6B5B95">
      <PkSeg v-model="dir" :items="dirItems" />
    </PkCard>

    <PkCard padded>
      <PkField
        v-model="input"
        type="textarea"
        :area-height="110"
        :label="dir === 'enc' ? '文本' : '盲文（Unicode ⣿ 区）'"
        :placeholder="dir === 'enc' ? '输入英文、数字与标点' : '粘贴盲文字符'"
      >
        <template #labelRight>
          <text class="mini-act" @tap="input = BRAILLE_SAMPLES[3].value">示例</text>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <view class="act-row">
        <PkBtn :text="dir === 'enc' ? '转成盲文' : '转成文本'" kind="primary" block @tap="run" />
      </view>
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard v-if="output" title="结果" accent="var(--pk-accent)">
      <template #extra>
        <text class="mini-act" @tap="copyText(output)">复制</text>
      </template>
      <PkOutput :value="output || '（空）'" mono :size="34" />
    </PkCard>

    <PkCard v-if="cells.length" title="逐字符点位" accent="#4A6FA5">
      <view v-for="(c, i) in cells" :key="i" class="cell-row">
        <view class="dots">
          <view class="dots__grid">
            <text class="dots__p" :class="{ 'dots__p--on': c.dots.indexOf('1') > -1 }">1</text>
            <text class="dots__p" :class="{ 'dots__p--on': c.dots.indexOf('4') > -1 }">4</text>
            <text class="dots__p" :class="{ 'dots__p--on': c.dots.indexOf('2') > -1 }">2</text>
            <text class="dots__p" :class="{ 'dots__p--on': c.dots.indexOf('5') > -1 }">5</text>
            <text class="dots__p" :class="{ 'dots__p--on': c.dots.indexOf('3') > -1 }">3</text>
            <text class="dots__p" :class="{ 'dots__p--on': c.dots.indexOf('6') > -1 }">6</text>
          </view>
        </view>
        <view class="cell__main">
          <text class="cell__l">{{ c.label }}</text>
          <text class="cell__t">{{ c.raw }}</text>
          <text class="cell__d">{{ c.dots || '（空）' }}</text>
          <text v-if="c.note" class="cell__note">{{ c.note }}</text>
        </view>
      </view>
    </PkCard>

    <PkCard title="点位编号" accent="#8A6D3B">
      <view class="legend">
        <view class="legend__col">
          <text class="legend__p">1</text>
          <text class="legend__p">2</text>
          <text class="legend__p">3</text>
        </view>
        <view class="legend__col">
          <text class="legend__p">4</text>
          <text class="legend__p">5</text>
          <text class="legend__p">6</text>
        </view>
      </view>
      <PkRow label="字母表" value="a=1  b=12  c=14  d=145  e=15  f=124  g=1245  h=125  i=24  j=245 …" :copy="false" stack />
      <PkRow label="数字" value="先打 3456（数字号），后面按字母位读：a=1、b=2 … j=0" :copy="false" stack />
      <PkRow label="大写" value="先打 6（大写号），后面的字母按大写读" :copy="false" stack />
      <PkRow label="为什么不支持中文" value="中文盲文（现行盲文）按拼音的声母韵母另设了一套体系，需要完整拼音表，不在本工具范围内" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { encodeBraille, decodeBraille, BRAILLE_SAMPLES } from '@/utils/braille'
import { copyText, toast } from '@/utils/clipboard'

const dirItems = [
  { key: 'enc', name: '文本 → 盲文' },
  { key: 'dec', name: '盲文 → 文本' },
]

const dir = ref('enc')
const input = ref(BRAILLE_SAMPLES[0].value)
const output = ref('')
const cells = ref([])
const error = ref('')

function run() {
  error.value = ''
  output.value = ''
  cells.value = []
  if (!input.value.trim()) {
    error.value = '请先输入内容'
    return
  }
  try {
    if (dir.value === 'enc') {
      const r = encodeBraille(input.value)
      output.value = r.text
      cells.value = r.cells
    } else {
      const r = decodeBraille(input.value)
      output.value = r.text
      cells.value = []
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
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 22rpx;
}
.act-row {
  padding: 8rpx 0 12rpx;
}
.cell-row {
  display: flex;
  align-items: center;
  padding: 14rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.cell-row:last-child {
  border-bottom: none;
}
.dots {
  width: 90rpx;
  flex-shrink: 0;
}
.dots__grid {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.dots__p {
  display: flex;
  gap: 14rpx;
  font-size: 20rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
  line-height: 1.2;
}
.dots__p--on {
  color: var(--pk-accent);
  font-weight: 700;
}
.cell__main {
  flex: 1;
  margin-left: 20rpx;
}
.cell__l {
  font-size: 26rpx;
  color: var(--pk-text);
  font-family: Menlo, Consolas, monospace;
}
.cell__t {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-left: 12rpx;
}
.cell__d {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
  font-family: Menlo, Consolas, monospace;
}
.cell__note {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 4rpx;
}
.legend {
  display: flex;
  gap: 40rpx;
  padding: 10rpx 24rpx 20rpx;
}
.legend__col {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.legend__p {
  font-size: 24rpx;
  color: var(--pk-text-2);
  font-family: Menlo, Consolas, monospace;
}
</style>
