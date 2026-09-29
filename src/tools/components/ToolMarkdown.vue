<template>
  <view>
    <PkSeg v-model="mode" :items="modes" />

    <!-- ---------- 输入 ---------- -->
    <PkCard title="Markdown 原文" accent="#4A6FA5">
      <PkField
        v-model="src"
        type="textarea"
        :area-height="240"
        :maxlength="MD_MAX"
        placeholder="粘贴或输入 Markdown：标题、列表、任务项、表格、引用、代码块、链接图片都支持……"
      >
        <template #labelRight>
          <text class="mini-act" @tap="readClipboard">读剪贴板</text>
          <text class="mini-act" @tap="src = ''">清空</text>
        </template>
      </PkField>

      <view class="sample-row">
        <text
          v-for="s in samples"
          :key="s.key"
          class="sample"
          hover-class="sample--hover"
          @tap="useSample(s)"
          >{{ s.name }}</text
        >
      </view>

      <PkRow
        label="篇幅"
        :value="srcChars + ' 字 · ' + srcLines + ' 行 · 上限 ' + MD_MAX + ' 字'"
        :copy="false"
      />
      <PkRow v-if="error" label="渲染异常" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <!-- ---------- 解析器给出的安全提示 ---------- -->
    <PkCard v-if="warnings.length" title="安全与解析提示" accent="var(--pk-warn)">
      <PkRow
        v-for="(w, i) in warnings"
        :key="i"
        :label="'提示 ' + (i + 1)"
        :value="w"
        color="var(--pk-warn)"
        :copy="false"
        stack
      />
    </PkCard>

    <!-- ---------- 视图一：预览 ---------- -->
    <PkCard v-if="mode === 'preview'" title="预览" accent="#4A6FA5">
      <template #extra>
        <text class="mini-act" @tap="copyText(html, '已复制渲染后的 HTML')">复制 HTML</text>
      </template>
      <PkEmpty
        v-if="!html"
        title="这里还是空的"
        desc="输入 Markdown，或点上面任一示例一键载入。"
      />
      <!--
        v-html 的安全前提：html 由 utils/markdown.js 的 mdToHtml 产出，
        所有文本节点都过 escapeHtml、所有属性值都过 escapeAttr + attrSafe，
        链接再经协议白名单（javascript: / data: / vbscript: 直接拒绝并留提示），
        源文本里的原生 HTML 标签一律当纯文本显示（等价 markdown-it 默认 html:false）。
        因此这段 HTML 里不存在可执行的标签或事件属性，视图层只负责渲染。
      -->
      <view v-else class="md-panel">
        <!-- eslint-disable-next-line vue/no-v-html, vue/no-v-text-v-html-on-component （安全前提见上方注释：文本已转义、属性已转义、链接过协议白名单、原生 HTML 当纯文本） -->
        <view class="md-body" v-html="html"></view>
      </view>
    </PkCard>

    <!-- ---------- 视图二：HTML 源码 ---------- -->
    <template v-else-if="mode === 'html'">
      <PkCard title="渲染出的 HTML" accent="#4A6FA5">
        <template #extra>
          <text class="mini-act" @tap="copyText(html, '已复制 HTML')">复制</text>
        </template>
        <PkEmpty v-if="!html" title="这里还是空的" desc="先写点什么，再回来看源码。" />
        <PkOutput v-else :value="html" mono :size="22" />
        <view class="act-row">
          <PkBtn text="拿这段 HTML 反向转 Markdown" kind="ghost" @tap="selfToMd" />
        </view>
      </PkCard>

      <PkCard title="任意 HTML → Markdown" accent="#8C5B3E">
        <PkField
          v-model="htmlIn"
          type="textarea"
          :area-height="160"
          :maxlength="MD_MAX"
          placeholder="粘贴一段网页正文 / 富文本 HTML，这里反向转成 Markdown"
        >
          <template #labelRight>
            <text class="mini-act" @tap="htmlIn = ''">清空</text>
          </template>
        </PkField>
        <view class="act-row">
          <PkBtn text="反向转换" kind="primary" @tap="convertHtml" />
          <PkBtn text="复制 Markdown" kind="ghost" @tap="copyText(mdOut, '已复制 Markdown')" />
          <PkBtn text="填到原文框" kind="ghost" @tap="useMdOut" />
        </view>
        <PkField
          v-model="mdOut"
          type="textarea"
          :area-height="160"
          :maxlength="MD_MAX"
          label="得到的 Markdown（可再编辑）"
        />
      </PkCard>
    </template>

    <!-- ---------- 视图三：大纲 ---------- -->
    <PkCard v-else title="标题大纲" accent="#4A6FA5">
      <template #extra>
        <text class="mini-act" @tap="copyOutline">复制大纲</text>
      </template>
      <PkEmpty v-if="!outlineFlat.length" title="没找到标题" desc="用 # ~ ###### 写标题，这里就会长出层级。" />
      <view v-else>
        <view
          v-for="node in outlineFlat"
          :key="node.slug"
          class="ol-row"
          :style="{ paddingLeft: 12 + node.depth * 26 + 'rpx' }"
        >
          <text class="ol-badge">H{{ node.level }}</text>
          <view class="ol-main">
            <text class="ol-text">{{ node.text || '（空标题）' }}</text>
            <text class="ol-meta">第 {{ node.line }} 行 · 锚点 #{{ node.slug }}</text>
          </view>
        </view>
      </view>
    </PkCard>

    <!-- ---------- 统计 ---------- -->
    <PkCard title="渲染统计" accent="var(--pk-accent)">
      <view class="stat-grid">
        <view v-for="s in statCells" :key="s.k" class="stat-cell">
          <text class="stat-cell__v">{{ s.v }}</text>
          <text class="stat-cell__k">{{ s.k }}</text>
        </view>
      </view>
      <PkRow label="HTML 体量" :value="num.bytes + ' 字节（' + num.chars + ' 字原文）'" mono />
      <PkRow label="各级标题" :value="headingText" />
      <PkRow label="锚点前缀" value="标题 id 与大纲 #锚点一致，中文标题保留" :copy="false" />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { copyText, toast } from '@/utils/clipboard'
import { MD_MAX, SAMPLES, mdToHtml, htmlToMd, outline, stats } from '@/utils/markdown'

const modes = [
  { key: 'preview', name: '预览' },
  { key: 'html', name: 'HTML 源码' },
  { key: 'outline', name: '大纲' },
]

const samples = SAMPLES

const mode = ref('preview')
const src = ref('')
const htmlIn = ref('')
const mdOut = ref('')

/* ---- 渲染：解析 + 转义全部在 utils 里完成，这里只拿结果 ---- */
const rendered = computed(() => {
  const raw = String(src.value || '')
  if (!raw.trim()) return { html: '', warnings: [], error: '' }
  try {
    const r = mdToHtml(raw)
    return { html: r.html, warnings: r.warnings, error: '' }
  } catch (e) {
    return { html: '', warnings: [], error: e.message || '渲染失败' }
  }
})
const html = computed(() => rendered.value.html)
const warnings = computed(() => rendered.value.warnings)
const error = computed(() => rendered.value.error)

const srcChars = computed(() => String(src.value || '').length)
const srcLines = computed(() => (src.value ? String(src.value).split('\n').length : 0))

/* ---- 大纲：树 -> 带层级的扁平行（不额外引入递归组件） ---- */
const outlineFlat = computed(() => {
  const raw = String(src.value || '')
  if (!raw.trim()) return []
  let roots
  try {
    roots = outline(raw)
  } catch (e) {
    return []
  }
  const out = []
  const walk = (nodes, depth) => {
    for (const n of nodes) {
      out.push({ level: n.level, text: n.text, line: n.line, slug: n.slug, depth: depth })
      if (n.children && n.children.length) walk(n.children, depth + 1)
    }
  }
  walk(roots, 0)
  return out
})

/* ---- 统计：复用已渲染的 HTML，省一次解析 ---- */
const num = computed(() => {
  try {
    return stats(String(src.value || ''), html.value)
  } catch (e) {
    return {
      bytes: 0,
      elements: 0,
      headings: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
      headingTotal: 0,
      links: 0,
      images: 0,
      codeBlocks: 0,
      tables: 0,
      listItems: 0,
      quotes: 0,
      chars: 0,
      lines: 0,
    }
  }
})
const statCells = computed(() => [
  { k: '元素', v: num.value.elements },
  { k: '标题', v: num.value.headingTotal },
  { k: '链接', v: num.value.links },
  { k: '图片', v: num.value.images },
  { k: '代码块', v: num.value.codeBlocks },
  { k: '表格', v: num.value.tables },
  { k: '列表项', v: num.value.listItems },
  { k: '引用', v: num.value.quotes },
])
const headingText = computed(() => {
  const h = num.value.headings
  const parts = []
  for (let lv = 1; lv <= 6; lv++) if (h['h' + lv]) parts.push('H' + lv + ' × ' + h['h' + lv])
  return parts.length ? parts.join(' · ') : '暂无标题'
})

/* ---- 交互 ---- */
function useSample(s) {
  src.value = s.src
  mode.value = 'preview'
  toast('已载入「' + s.name + '」')
}

function readClipboard() {
  uni.getClipboardData({
    success(res) {
      if (res.data) {
        src.value = res.data
        toast('已读入剪贴板')
      } else {
        toast('剪贴板是空的')
      }
    },
    fail() {
      toast('读取失败')
    },
  })
}

function convertHtml() {
  if (!String(htmlIn.value || '').trim()) {
    toast('先粘一段 HTML')
    return
  }
  try {
    mdOut.value = htmlToMd(htmlIn.value)
    if (!mdOut.value.trim()) toast('这段 HTML 里没有正文文字')
  } catch (e) {
    toast('转换失败：' + (e.message || ''))
  }
}

function selfToMd() {
  if (!html.value) {
    toast('先把 Markdown 渲染出结果')
    return
  }
  htmlIn.value = html.value
  convertHtml()
  toast('已拿本页 HTML 做反向转换')
}

function useMdOut() {
  if (!mdOut.value) {
    toast('先转出一段 Markdown')
    return
  }
  src.value = mdOut.value
  mode.value = 'preview'
}

function copyOutline() {
  if (!outlineFlat.value.length) {
    toast('还没有标题')
    return
  }
  const text = outlineFlat.value
    .map(function (n) {
      return new Array(n.depth + 1).join('  ') + '#'.repeat(n.level) + ' ' + n.text + '  (L' + n.line + ' #' + n.slug + ')'
    })
    .join('\n')
  copyText(text, '已复制大纲')
}
</script>

<style scoped>
.mini-act {
  font-size: 24rpx;
  color: var(--pk-accent);
  margin-left: 24rpx;
}
.sample-row {
  display: flex;
  flex-wrap: wrap;
  margin: 4rpx 0 14rpx;
}
.sample {
  font-size: 24rpx;
  color: var(--pk-text-2);
  background: var(--pk-seg-bg);
  border: var(--pk-line-w) solid var(--pk-line);
  border-radius: 999rpx;
  padding: 10rpx 22rpx;
  margin: 6rpx 10rpx 6rpx 0;
}
.sample--hover {
  opacity: 0.6;
}
.act-row {
  display: flex;
  gap: 20rpx;
  margin-top: 8rpx;
}

/* ---------- 大纲 ---------- */
.ol-row {
  display: flex;
  align-items: flex-start;
  padding: 14rpx 12rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.ol-badge {
  flex: none;
  font-size: 20rpx;
  color: var(--pk-on-accent);
  background: var(--pk-accent);
  border-radius: 8rpx;
  padding: 3rpx 10rpx;
  margin-right: 16rpx;
  margin-top: 4rpx;
}
.ol-main {
  display: flex;
  flex-direction: column;
  flex: 1;
}
.ol-text {
  font-size: 26rpx;
  color: var(--pk-text);
  word-break: break-all;
}
.ol-meta {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
}

/* ---------- 统计 ---------- */
.stat-grid {
  display: flex;
  flex-wrap: wrap;
  padding: 4rpx 12rpx 12rpx;
}
.stat-cell {
  width: 25%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14rpx 0;
}
.stat-cell__v {
  font-size: 34rpx;
  font-weight: 600;
  color: var(--pk-text);
  line-height: 1.2;
}
.stat-cell__k {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
}

/* ---------- 预览面板 ---------- */
.md-panel {
  background: var(--pk-bg-soft);
  border: var(--pk-line-w) solid var(--pk-line);
  border-radius: var(--pk-radius-md);
  padding: 24rpx 22rpx;
}
/*
  下面是 v-html 产物内部的样式。选择器一律走 --pk-* 变量，
  否则深色模式会白底白字。scoped + :deep() 才能命中 v-html 插进来的节点。
*/
.md-body {
  font-size: 28rpx;
  line-height: 1.75;
  color: var(--pk-text);
  word-break: break-word;
}
:deep(.pk-md__h) {
  color: var(--pk-text);
  font-weight: 600;
  margin: 26rpx 0 12rpx;
  line-height: 1.4;
}
:deep(.pk-md__h--1) {
  font-size: 40rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line-strong);
  padding-bottom: 10rpx;
}
:deep(.pk-md__h--2) {
  font-size: 34rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
  padding-bottom: 8rpx;
}
:deep(.pk-md__h--3) {
  font-size: 30rpx;
}
:deep(.pk-md__h--4) {
  font-size: 28rpx;
}
:deep(.pk-md__h--5) {
  font-size: 28rpx;
  color: var(--pk-text-2);
}
:deep(.pk-md__h--6) {
  font-size: 26rpx;
  color: var(--pk-text-2);
}
:deep(.pk-md__p) {
  margin: 14rpx 0;
  color: var(--pk-text);
}
:deep(.pk-md__strong) {
  font-weight: 700;
  color: var(--pk-text);
}
:deep(.pk-md__em) {
  font-style: italic;
  color: var(--pk-text-2);
}
:deep(.pk-md__del) {
  text-decoration: line-through;
  color: var(--pk-text-3);
}
:deep(.pk-md__a) {
  color: var(--pk-accent);
  text-decoration: underline;
  word-break: break-all;
}
:deep(.pk-md__in-code) {
  font-family: Menlo, Consolas, monospace;
  font-size: 24rpx;
  color: var(--pk-text);
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line);
  border-radius: 8rpx;
  padding: 2rpx 8rpx;
}
:deep(.pk-md__pre) {
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line);
  border-radius: var(--pk-radius-md);
  padding: 20rpx 18rpx;
  margin: 18rpx 0;
  overflow-x: auto;
}
:deep(.pk-md__lang) {
  display: block;
  font-size: 20rpx;
  color: var(--pk-text-3);
  letter-spacing: 1rpx;
  margin-bottom: 10rpx;
}
:deep(.pk-md__code) {
  display: block;
  font-family: Menlo, Consolas, monospace;
  font-size: 24rpx;
  line-height: 1.7;
  color: var(--pk-text);
  white-space: pre;
}
:deep(.pk-md__hr) {
  height: var(--pk-line-w);
  background: var(--pk-line-strong);
  border: none;
  margin: 26rpx 0;
}
:deep(.pk-md__quote) {
  margin: 18rpx 0;
  padding: 12rpx 0 12rpx 20rpx;
  border-left: 6rpx solid var(--pk-line-strong);
  background: var(--pk-bg-soft);
  border-radius: 0 12rpx 12rpx 0;
  color: var(--pk-text-2);
}
:deep(.pk-md__quote .pk-md__quote) {
  border-left-color: var(--pk-accent-soft);
  background: transparent;
}
:deep(.pk-md__list) {
  margin: 14rpx 0;
  padding-left: 44rpx;
}
:deep(.pk-md__list .pk-md__list) {
  margin: 6rpx 0;
}
:deep(.pk-md__li) {
  margin: 6rpx 0;
  color: var(--pk-text);
}
:deep(.pk-md__task) {
  color: var(--pk-text-3);
  margin-right: 10rpx;
}
:deep(.pk-md__task--on) {
  color: var(--pk-accent);
}
:deep(.pk-md__scroll) {
  overflow-x: auto;
  margin: 18rpx 0;
}
:deep(.pk-md__table) {
  border-collapse: collapse;
  font-size: 24rpx;
  min-width: 100%;
}
:deep(.pk-md__th),
:deep(.pk-md__td) {
  border: var(--pk-line-w) solid var(--pk-line-strong);
  padding: 10rpx 16rpx;
  color: var(--pk-text);
  text-align: left;
}
:deep(.pk-md__th) {
  background: var(--pk-input);
  font-weight: 600;
}
:deep(.pk-md__al--c) {
  text-align: center;
}
:deep(.pk-md__al--r) {
  text-align: right;
}
:deep(.pk-md__img) {
  max-width: 100%;
  border-radius: var(--pk-radius-sm);
  border: var(--pk-line-w) solid var(--pk-line);
  display: block;
  margin: 14rpx 0;
}
:deep(.pk-md__rej) {
  color: var(--pk-danger);
  background: var(--pk-danger-soft);
  border-radius: 8rpx;
  padding: 2rpx 8rpx;
  font-size: 24rpx;
}
</style>
