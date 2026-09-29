<template>
  <view>
    <PkCard padded>
      <PkField v-model="input" type="textarea" :area-height="150" label="文本">
        <template #labelRight>
          <text class="mini-act" @tap="input = WORDFREQ_SAMPLE">示例</text>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <PkSwitchRow v-model="cnBigram" title="中文按二字词统计" desc="比单字更接近「词」的感觉，适合长文本" />
      <PkSwitchRow v-model="ignoreStop" title="忽略高频虚词" desc="跳过「的、了、和」与 the/a/of 这类没有信息量的词" :last="true" />
    </PkCard>

    <PkCard title="整体概况" accent="var(--pk-accent)">
      <PkRow label="总 token" :value="data.total + ' 个'" big :copy="false" />
      <PkRow label="不同的词" :value="data.unique + ' 个'" :copy="false" />
      <PkRow label="词汇丰富度" :value="data.stats.richness + '%'" :copy="false" />
      <PkRow label="汉字" :value="data.stats.hanzi + ' 个'" :copy="false" />
      <PkRow label="英文单词" :value="data.stats.latin + ' 个'" :copy="false" />
      <PkRow label="标点符号" :value="data.stats.punct + ' 个'" :copy="false" />
      <PkRow label="行数 / 段落" :value="data.stats.lines + ' 行，' + data.stats.paragraphs + ' 段'" :copy="false" />
      <PkRow label="最长一行" :value="data.stats.longestLine + ' 个字符'" :copy="false" />
      <PkRow label="平均每句" :value="data.stats.avgSentence + ' 个字符'" :copy="false" />
    </PkCard>

    <PkCard title="Top 词频" accent="#B5527A">
      <template #extra>
        <text class="mini-act" @tap="copyText(topText)">复制</text>
      </template>
      <view v-for="(x, i) in data.top" :key="x.value" class="row">
        <text class="row__rank">{{ i + 1 }}</text>
        <text class="row__w" @tap="copyText(x.value)">{{ x.value }}</text>
        <view class="row__bar">
          <view class="row__fill" :style="{ width: (x.ratio * 100) + '%' }"></view>
        </view>
        <text class="row__n">{{ x.count }}</text>
      </view>
      <PkRow v-if="!data.top.length" label="结果" value="没有统计到内容" :copy="false" stack />
    </PkCard>

    <PkCard v-if="data.wordTop.length" title="英文词 Top" accent="#4A6FA5">
      <view v-for="(x, i) in data.wordTop.slice(0, 15)" :key="x.value" class="row">
        <text class="row__rank">{{ i + 1 }}</text>
        <text class="row__w" @tap="copyText(x.value)">{{ x.value }}</text>
        <view class="row__bar">
          <view class="row__fill row__fill--blue" :style="{ width: (x.ratio * 100) + '%' }"></view>
        </view>
        <text class="row__n">{{ x.count }}</text>
      </view>
    </PkCard>

    <PkCard title="能发现什么" accent="#8A6D3B">
      <PkRow label="文案重复" value="某个词出现次数异常多，说明行文在绕圈子" :copy="false" stack />
      <PkRow label="关键词" value="忽略虚词之后排前面的，往往就是文本主题" :copy="false" stack />
      <PkRow label="中英混排比例" value="汉字与英文单词的数量比，能看出文档是中文还是英文主导" :copy="false" stack />
      <PkRow label="排版密度" value="平均每句长度过长时，读者会很难读下去" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { analyze, WORDFREQ_SAMPLE } from '@/utils/wordfreq'
import { copyText, toast } from '@/utils/clipboard'

const input = ref(WORDFREQ_SAMPLE)
const cnBigram = ref(false)
const ignoreStop = ref(false)

const data = computed(() => {
  if (!input.value.trim()) {
    return { total: 0, unique: 0, top: [], cjkTop: [], wordTop: [], stats: { richness: 0, hanzi: 0, latin: 0, punct: 0, lines: 0, paragraphs: 0, avgSentence: 0, longestLine: 0 } }
  }
  try {
    return analyze(input.value, { cnBigram: cnBigram.value, ignoreStop: ignoreStop.value, topN: 30 })
  } catch (e) {
    return { total: 0, unique: 0, top: [], cjkTop: [], wordTop: [], stats: { richness: 0, hanzi: 0, latin: 0, punct: 0, lines: 0, paragraphs: 0, avgSentence: 0, longestLine: 0 } }
  }
})

const topText = computed(() =>
  data.value.top.map((x, i) => (i + 1) + '. ' + x.value + '（' + x.count + '）').join('\n')
)

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
.row {
  display: flex;
  align-items: center;
  padding: 12rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.row:last-child {
  border-bottom: none;
}
.row__rank {
  width: 52rpx;
  font-size: 22rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
}
.row__w {
  width: 200rpx;
  font-size: 26rpx;
  color: var(--pk-text);
  word-break: break-all;
  margin-right: 12rpx;
}
.row__bar {
  flex: 1;
  height: 14rpx;
  border-radius: 7rpx;
  background: var(--pk-seg-bg);
  overflow: hidden;
}
.row__fill {
  height: 14rpx;
  border-radius: 7rpx;
  background: var(--pk-accent);
}
.row__fill--blue {
  background: var(--pk-info);
}
.row__n {
  width: 70rpx;
  text-align: right;
  font-size: 22rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
}
</style>
