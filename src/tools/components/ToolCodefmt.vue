<template>
  <view>
    <PkCard title="选语言" accent="#5B6B8C">
      <PkSeg v-model="lang" :items="langItems" />
      <PkSeg v-model="indent" :items="indentItems" />
    </PkCard>

    <PkCard padded>
      <PkField v-model="input" type="textarea" :area-height="180" label="源码">
        <template #labelRight>
          <text class="mini-act" @tap="loadSample">示例</text>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <view class="act-row">
        <PkBtn text="美化" kind="primary" @tap="run('format')" />
        <PkBtn text="压缩" kind="soft" @tap="run('minify')" />
        <PkBtn text="复制结果" kind="ghost" @tap="copyText(output)" />
      </view>
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard v-if="output" title="结果" accent="var(--pk-accent)">
      <PkRow label="行数" :value="stat.lines !== undefined ? stat.lines + ' 行' : '1 行'" :copy="false" />
      <PkRow label="字符数" :value="stat.size + ' 个'" :copy="false" />
      <PkRow v-if="saved" label="压缩效果" :value="saved" color="var(--pk-accent)" :copy="false" />
      <PkOutput :value="output" mono pre :size="21" />
      <view class="act-row">
        <PkBtn text="复制结果" kind="primary" block @tap="copyText(output)" />
      </view>
    </PkCard>

    <PkCard title="它会做什么 / 不会做什么" accent="#4A6FA5">
      <PkRow label="会做" value="按标签与选择器重新换行缩进；元素内部与选择器内部的空白规范化；行末多余分号清理" :copy="false" stack />
      <PkRow label="会做" value="注释与字符串原样保留，不会把 content:「a;b」里的分号当成结构" :copy="false" stack />
      <PkRow label="不会做" value="不做语法校验，不会改写选择器或属性，也不做属性排序" :copy="false" stack />
      <PkRow label="不会做" value="不处理 JavaScript —— JS 的自动分号插入规则很微妙，硬排容易改坏语义" :copy="false" stack />
      <PkRow label="保留原样" value="<pre>、<script>、<style> 内部的内容不会重排" :copy="false" stack />
    </PkCard>

    <PkCard title="HTML 与 CSS 的常见错法" accent="var(--pk-warn)">
      <PkRow label="单标签写成双标签" value="<img></img> 是错的，img / br / hr / input / meta / link 是自闭合元素" :copy="false" stack />
      <PkRow label="属性值不加引号" value="含空格或 / 的值必须加引号，否则解析会断掉" :copy="false" stack />
      <PkRow label="CSS 少分号" value="最后一条属性可以省略分号，但压缩时不补一个会出问题（本工具压缩会去掉末尾分号）" :copy="false" stack />
      <PkRow label="!important 位置" value="必须写在声明末尾、分号之前" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, watch } from 'vue'
import { formatCss, formatHtml, HTML_SAMPLE, CSS_SAMPLE } from '@/utils/codefmt'
import { copyText, toast } from '@/utils/clipboard'

const langItems = [
  { key: 'html', name: 'HTML' },
  { key: 'css', name: 'CSS' },
]
const indentItems = [
  { key: '2', name: '缩进 2 空格' },
  { key: '4', name: '缩进 4 空格' },
  { key: '1', name: 'Tab（1 缩进）' },
]

const lang = ref('html')
const indent = ref('2')
const input = ref(HTML_SAMPLE)
const output = ref('')
const error = ref('')
const stat = ref({ lines: 0, size: 0 })
const saved = ref('')

watch(lang, () => {
  loadSample()
})

function loadSample() {
  input.value = lang.value === 'html' ? HTML_SAMPLE : CSS_SAMPLE
  output.value = ''
  error.value = ''
  saved.value = ''
}

function run(kind) {
  error.value = ''
  output.value = ''
  saved.value = ''
  if (!input.value.trim()) {
    error.value = '请先粘贴源码'
    return
  }
  try {
    const o = { indent: Number(indent.value), minify: kind === 'minify' }
    const r = lang.value === 'html' ? formatHtml(input.value, o) : formatCss(input.value, o)
    output.value = r.text
    stat.value = { lines: r.lines !== undefined ? r.lines : 1, size: r.size }
    if (kind === 'minify' && input.value.length > 0) {
      const before = input.value.length
      const after = output.value.length
      saved.value = '从 ' + before + ' 压到 ' + after + ' 字符，省了 ' + Math.max(0, Math.round((1 - after / before) * 100)) + '%'
    }
  } catch (e) {
    error.value = e.message || '处理失败'
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
</style>
