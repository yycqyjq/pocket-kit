<template>
  <view>
    <PkCard title="来源记法" accent="#6B5B95">
      <PkSeg v-model="srcKey" :items="notationItems" />
      <PkRow
        v-if="srcKey === 'auto'"
        label="自动识别"
        :value="detected ? '识别为 ' + detectedName : '认不出来，请手动指定'"
        :color="detected ? 'var(--pk-accent)' : 'var(--pk-danger)'"
        :copy="false"
        stack
      />
    </PkCard>

    <PkCard padded>
      <PkField v-model="pattern" type="textarea" :area-height="70" label="日期格式串">
        <template #labelRight>
          <text v-for="s in FMT_SAMPLES" :key="s.value" class="mini-act" @tap="pattern = s.value">{{ s.name }}</text>
        </template>
      </PkField>
      <view class="act-row">
        <PkBtn text="翻译并给出示例" kind="primary" block @tap="run" />
      </view>
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-if="result">
      <PkCard title="字段对应" accent="var(--pk-accent)">
        <PkRow
          v-for="(t, i) in result.tokens"
          :key="i"
          :label="t.raw"
          :value="TYPE_CN[t.type] || t.type"
          :copy="false"
        />
      </PkCard>

      <PkCard title="翻译结果" accent="var(--pk-accent)">
        <template #extra>
          <text class="mini-act" @tap="copyText(resultText)">复制</text>
        </template>
        <view
          v-for="r in result.results"
          :key="r.key"
          class="fmt"
          :class="{ 'fmt--src': r.isSource }"
          hover-class="fmt--hover"
          @tap="copyText(r.pattern)"
        >
          <view class="fmt__head">
            <text class="fmt__n">{{ r.name }}</text>
            <text class="fmt__lang">{{ r.lang }}</text>
          </view>
          <text class="fmt__p" selectable>{{ r.pattern }}</text>
          <text class="fmt__s">{{ r.sample }}</text>
        </view>
      </PkCard>

      <PkCard title="为什么这么绕" accent="#4A6FA5">
        <PkRow label="同字段不同写法" value="年：Y（moment）/ y（Java）/ Y（strftime）/ 2006（Go）；月：MM（Java）/ %m（strftime）/ 01（Go）" :copy="false" stack />
        <PkRow label="大小写陷阱" value="Java 的 MM 是月、mm 是分；moment 的 DD 是日、dd 是星期——手抄时最容易错" :copy="false" stack />
        <PkRow label="MySQL 例外" value="MySQL 的 DATE_FORMAT 用 %i 表示分钟（不是 %M），这点和 C 的 strftime 不一样" :copy="false" stack />
        <PkRow label="Go 最特别" value="不用占位符，而是拿参考时间 2006-01-02 15:04:05 当模板，1 月 2 日 3 点 4 分 5 秒" :copy="false" stack />
      </PkCard>
    </template>

    <PkCard title="先贴一段格式串" accent="#8A6D3B">
      <PkRow label="支持" value="strftime（C / Python / PHP）、Java / .NET、moment / dayjs、Go 四种记法互转" :copy="false" stack />
      <PkRow label="自动识别" value="含 % 就是 strftime，含 YYYY 就是 moment，含 2006 就是 Go，含 yyyy 就是 Java。认不出时请手动指定" :copy="false" stack />
      <PkRow label="示例" value="填进一个格式串，会同时给出其它三种写法与示例输出" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { convert as fmtConvert, detect, getNotation, NOTATIONS, FMT_SAMPLES, FMT_NOTES } from '@/utils/datefmt'
import { copyText } from '@/utils/clipboard'

const notationItems = [
  { key: 'auto', name: '自动识别' },
  ...NOTATIONS.map((n) => ({ key: n.key, name: n.name })),
]

const TYPE_CN = {
  year4: '四位年', year2: '两位年', month2: '月份', month1: '月份（不补零）',
  monthName: '月份名', monthShort: '月份缩写', day2: '日期', day1: '日期（不补零）',
  dayOfYear: '年内第几天', dayOfYearn: '年内第几天（不补零）',
  hour24: '24 小时', hour24n: '24 小时（不补零）',
  hour12: '12 小时', hour12n: '12 小时（不补零）',
  minute: '分钟', minuten: '分钟（不补零）',
  second: '秒', secondn: '秒（不补零）',
  ms: '毫秒', ampm: '上午下午', weekday: '星期', weekdayShort: '星期缩写',
  tzOffset: '时区偏移',
}

const srcKey = ref('auto')
const pattern = ref('%Y-%m-%d %H:%M:%S')
const error = ref('')

const detected = computed(() => (pattern.value ? detect(pattern.value) : null))
const detectedName = computed(() => (detected.value ? getNotation(detected.value).name : ''))

const result = computed(() => {
  if (!pattern.value.trim()) return null
  try {
    return fmtConvert(pattern.value, srcKey.value, new Date(2026, 8, 20, 15, 30, 0))
  } catch (e) {
    return { error: e.message, tokens: [], results: [] }
  }
})

const resultText = computed(() => {
  if (!result.value || !result.value.results) return ''
  return result.value.results.map((r) => r.name + ': ' + r.pattern).join('\n')
})
</script>

<style scoped>
.mini-act {
  font-size: 21rpx;
  color: var(--pk-accent);
  margin-left: 18rpx;
}
.act-row {
  padding: 8rpx 0 12rpx;
}
.fmt {
  padding: 16rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.fmt--src {
  background: var(--pk-accent-soft);
}
.fmt--hover {
  opacity: 0.6;
}
.fmt__head {
  display: flex;
  align-items: baseline;
}
.fmt__n {
  font-size: 25rpx;
  color: var(--pk-text);
  font-weight: 600;
  flex: 1;
}
.fmt__lang {
  font-size: 20rpx;
  color: var(--pk-text-3);
}
.fmt__p {
  display: block;
  font-size: 23rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-accent);
  margin-top: 8rpx;
  word-break: break-all;
}
.fmt__s {
  display: block;
  font-size: 21rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
  font-family: Menlo, Consolas, monospace;
  word-break: break-all;
}
</style>
