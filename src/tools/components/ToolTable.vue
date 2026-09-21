<template>
  <view>
    <PkCard padded>
      <PkField v-model="input" type="textarea" :area-height="150" label="分隔文本">
        <template #labelRight>
          <text class="mini-act" @tap="input = SAMPLE_TABLE">示例</text>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <PkRow v-if="meta" label="识别结果" :value="meta.rows + ' 行 × ' + meta.cols + ' 列，分隔符：' + meta.delimiter" :copy="false" />
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard title="排版选项" accent="#4A6FA5">
      <PkSeg v-model="formatKey" :items="formatItems" />
      <PkSeg v-model="delimiterKey" :items="delimiterItems" />
      <PkSeg v-model="alignKey" :items="alignItems" />
      <PkSwitchRow v-model="border" title="加边框" desc="用制表符画框线，贴进聊天或文档更清楚（Markdown 输出不受影响）" />
      <PkSwitchRow v-model="header" title="首行是表头" desc="会额外画一条分隔线，并且数字列右对齐时不带上表头" :last="true" />
    </PkCard>

    <PkCard v-if="output" :title="isMarkdown ? 'Markdown 结果' : '对齐结果'" accent="var(--pk-accent)">
      <template #extra>
        <text class="mini-act" @tap="copyText(output)">复制</text>
      </template>
      <PkOutput :value="output" mono pre :size="21" />
      <view class="act-row">
        <PkBtn :text="isMarkdown ? '复制 Markdown' : '复制表格'" kind="primary" block @tap="copyText(output)" />
      </view>
    </PkCard>

    <PkCard title="列宽与对齐" accent="#6B5B95">
      <PkRow v-if="meta" label="每列宽度" :value="meta.widths.join(' / ')" :copy="false" />
      <PkRow v-if="meta" label="每列对齐" :value="meta.aligns.join(' / ')" :copy="false" />
      <PkRow label="中文按两列宽" value="汉字、假名、全角标点都按 2 个字符宽度计算，所以中英混排也能对齐" :copy="false" stack />
      <PkRow label="对齐规则" value="选「自动」时，整列都是数字（含千分位与百分号）就右对齐，否则左对齐" :copy="false" stack />
      <PkRow label="超宽处理" value="超过 40 列的单元格会被截断并加省略号，避免整张表被一个长字段撑爆" :copy="false" stack />
      <PkRow label="Markdown 模式" value="不填充空格、不截断长单元格（截断会真的丢数据），单元格里的 | 会转义成 \|，列对齐改由分隔行表达" :copy="false" stack />
    </PkCard>

    <PkCard title="能拿来做什么" accent="#8A6D3B">
      <PkRow label="贴进聊天" value="CSV 直接贴出去是歪的，对齐后再贴可读性完全不同" :copy="false" stack />
      <PkRow label="写注释" value="代码注释里想画个对照表，用等宽字体对齐才不会错位" :copy="false" stack />
      <PkRow label="转 Markdown" value="把表格数据转成 Markdown 表格语法，直接粘进文档" :copy="false" stack />
      <PkRow label="检查数据" value="列宽和列数一眼就能看出是不是有行的字段少了" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { alignTable, toMarkdownTable, SAMPLE_TABLE } from '@/utils/table'
import { copyText, toast } from '@/utils/clipboard'

const input = ref(SAMPLE_TABLE)
const formatKey = ref('align')
const delimiterKey = ref('auto')
const alignKey = ref('auto')
const border = ref(false)
const header = ref(true)

const formatItems = [
  { key: 'align', name: '等宽对齐' },
  { key: 'md', name: 'Markdown' },
]

const delimiterItems = [
  { key: 'auto', name: '自动识别' },
  { key: ',', name: '逗号' },
  { key: '\t', name: '制表符' },
  { key: ';', name: '分号' },
  { key: '|', name: '竖线' },
  { key: ' ', name: '空格' },
]

const alignItems = [
  { key: 'auto', name: '自动' },
  { key: 'left', name: '左对齐' },
  { key: 'center', name: '居中' },
  { key: 'right', name: '右对齐' },
]

const isMarkdown = computed(() => formatKey.value === 'md')

// 两种输出共用同一份解析选项
const parseOpts = computed(() => ({
  delimiter: delimiterKey.value === 'auto' ? null : delimiterKey.value,
  align: alignKey.value,
  header: header.value,
}))

const result = computed(() => {
  if (!input.value.trim()) return { meta: null, output: '', error: '' }
  try {
    const r = alignTable(input.value, { ...parseOpts.value, border: border.value })
    // Markdown 模式走独立实现：不填充空格、不截断、转义 | 。
    // 拿对齐结果去凑 Markdown 是行不通的，空格填充会污染单元格内容。
    const output = isMarkdown.value ? toMarkdownTable(input.value, parseOpts.value) : r.text
    return { meta: r, output, error: '' }
  } catch (e) {
    return { meta: null, output: '', error: e.message }
  }
})

const meta = computed(() => result.value.meta)
const output = computed(() => result.value.output)
const error = computed(() => result.value.error)

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
  padding: 6rpx 24rpx 20rpx;
}
</style>
