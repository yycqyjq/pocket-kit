<template>
  <view>
    <PkCard padded>
      <PkField v-model="input" type="textarea" :area-height="110" label="乱码内容">
        <template #labelRight>
          <text class="mini-act" @tap="makeSample">示例</text>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <PkRow v-if="diag" label="诊断" :value="diag.notes[0]" :copy="false" stack />
    </PkCard>

    <PkCard v-if="error" title="提示" accent="var(--pk-danger)">
      <PkRow label="原因" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-if="list.length">
      <PkCard title="候选结果" accent="var(--pk-accent)">
        <template #extra>
          <text class="mini-act" @tap="copyText(bestText)">复制最优</text>
        </template>
        <view
          v-for="c in list"
          :key="c.rank"
          class="cand"
          :class="{ 'cand--best': c.isBest }"
          hover-class="cand--hover"
          @tap="output = c.text"
        >
          <view class="cand__head">
            <text class="cand__rank">#{{ c.rank }}</text>
            <text class="cand__label">{{ c.label }}</text>
            <text v-if="c.isBest" class="cand__best">推荐</text>
          </view>
          <text class="cand__t" selectable>{{ c.text === '' ? '（空）' : c.text }}</text>
          <text class="cand__s">得分 {{ c.score.toFixed(2) }} · {{ c.note }}</text>
        </view>
        <text class="tip">点一下任意候选即可把它填到下面的输出框</text>
      </PkCard>

      <PkCard title="选中的结果" accent="#4A6FA5">
        <template #extra>
          <text class="mini-act" @tap="copyText(output)">复制</text>
        </template>
        <PkOutput :value="output || '（在上面点一个候选）'" :size="25" />
      </PkCard>
    </template>

    <PkCard title="为什么会乱码" accent="#8A6D3B">
      <PkRow label="本质" value="字节没变，但解释方式错了。先弄清原始字节是什么，再换编码解一次" :copy="false" stack />
      <PkRow label="最常见" value="UTF-8 的文件被按 GBK / Latin-1 打开，显示成「æµ‹è¯•」这类形态——本工具能直接还原" :copy="false" stack />
      <PkRow label="救不回的" value="反过来「UTF-8 的文件被按 GBK 打开」会显示成问号或方块，原始字节已经丢了" :copy="false" stack />
      <PkRow label="本环境能解码" :value="supportedText" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { recoverCandidates, diagnose, GARBLED_SAMPLES, SUPPORTED } from '@/utils/garbled'
import { copyText, toast } from '@/utils/clipboard'

const input = ref('')
const output = ref('')

const result = computed(() => {
  if (!input.value.trim()) return { list: [], diag: null, error: '' }
  try {
    return { list: recoverCandidates(input.value), diag: diagnose(input.value), error: '' }
  } catch (e) {
    return { list: [], diag: null, error: e.message }
  }
})
const list = computed(() => result.value.list)
const diag = computed(() => result.value.diag)
const error = computed(() => result.value.error)
const bestText = computed(() => {
  const b = list.value.find((x) => x.isBest)
  return b ? b.text : ''
})
const supportedText = computed(() => SUPPORTED.map((x) => x.name).join('、'))

function makeSample() {
  input.value = GARBLED_SAMPLES[0].value
  output.value = ''
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
.cand {
  padding: 16rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.cand--best {
  background: var(--pk-accent-soft);
}
.cand--hover {
  opacity: 0.6;
}
.cand__head {
  display: flex;
  align-items: center;
}
.cand__rank {
  font-size: 22rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
  margin-right: 14rpx;
}
.cand__label {
  font-size: 24rpx;
  color: var(--pk-text-2);
  flex: 1;
}
.cand__best {
  font-size: 20rpx;
  color: var(--pk-accent);
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  background: rgba(63, 122, 110, 0.14);
}
.cand__t {
  display: block;
  font-size: 26rpx;
  color: var(--pk-text);
  font-family: Menlo, Consolas, monospace;
  word-break: break-all;
  margin-top: 8rpx;
  line-height: 1.7;
}
.cand__s {
  display: block;
  font-size: 20rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
}
.tip {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  padding: 8rpx 24rpx 16rpx;
}
</style>
