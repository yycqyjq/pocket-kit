<template>
  <view>
    <PkCard padded>
      <PkField v-model="input" type="textarea" :area-height="200" placeholder='粘贴 JSON，例如 {"a":1}'>
        <template #labelRight>
          <text class="mini-act" @tap="loadSample">示例</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <view class="act-row">
        <PkBtn text="格式化" kind="primary" @tap="format" />
        <PkBtn text="压缩" kind="soft" @tap="minify" />
        <PkBtn text="校验" kind="ghost" @tap="validate" />
      </view>
    </PkCard>

    <PkCard v-if="status" :title="status.ok ? '解析结果' : '解析失败'" :accent="status.ok ? 'var(--pk-accent)' : 'var(--pk-danger)'">
      <PkRow label="状态" :value="status.text" :color="status.ok ? 'var(--pk-accent)' : 'var(--pk-danger)'" />
      <PkRow v-if="status.detail" label="提示" :value="status.detail" stack />
    </PkCard>

    <template v-if="info">
      <PkCard title="结构体检" accent="#4A6FA5">
        <PkRow label="根节点类型" :value="info.rootType" />
        <PkRow label="键总数" :value="info.keys" />
        <PkRow label="最大层级" :value="info.depth" />
        <PkRow label="数组个数" :value="info.arrays" />
        <PkRow label="空值个数" :value="info.nulls" />
        <PkRow label="体积" :value="info.size" />
      </PkCard>
      <PkCard v-if="info.topKeys.length" title="顶层字段" accent="#4A6FA5">
        <PkRow
          v-for="k in info.topKeys"
          :key="k.name"
          :label="k.name"
          :value="k.type + (k.len !== null ? ' · ' + k.len + ' 项' : '')"
          :copy="false"
        />
      </PkCard>
    </template>

    <PkCard v-if="output" title="输出" accent="var(--pk-accent)">
      <PkField v-model="output" type="textarea" :area-height="220" />
      <view class="act-row">
        <PkBtn text="复制结果" kind="primary" @tap="copyText(output)" />
        <PkBtn text="结果回填" kind="ghost" @tap="input = output" />
      </view>
    </PkCard>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { utf8ByteLen } from '@/utils/base64'
import { copyText, toast } from '@/utils/clipboard'

const SAMPLE = '{"name":"随身匣","version":"1.0.0","tags":["工具","离线"],"author":{"nick":"you","contact":{"mail":"hi@example.com"}},"enabled":true,"weight":null}'

const input = ref('')
const output = ref('')
const status = ref(null)
const info = ref(null)

function loadSample() {
  input.value = SAMPLE
  format()
}

function format() {
  parseAndSet(2)
}

function minify() {
  parseAndSet(0)
}

function validate() {
  parseAndSet(null, true)
}

function parseAndSet(space, onlyCheck) {
  status.value = null
  info.value = null
  output.value = ''
  const src = String(input.value).trim()
  if (!src) {
    toast('请先输入 JSON')
    return
  }
  let data
  try {
    data = JSON.parse(src)
  } catch (e) {
    const msg = e && e.message ? e.message : '解析失败'
    status.value = { ok: false, text: '格式有误', detail: describeError(msg, src) }
    return
  }
  status.value = {
    ok: true,
    text: onlyCheck ? '格式正确' : '已生成结果',
    detail: '',
  }
  info.value = inspect(data, src.length)
  if (!onlyCheck) {
    output.value = space === 0 ? JSON.stringify(data) : JSON.stringify(data, null, space)
  }
}

/** 把 JS 引擎的报错翻译成带位置的说明 */
function describeError(msg, src) {
  const at = locateError(msg, src)
  if (!at) return '引擎没给出出错位置，原文：' + msg
  const snippet = src.slice(Math.max(0, at.idx - 18), at.idx + 18).replace(/\n/g, '⏎')
  return '第 ' + at.line + ' 行第 ' + at.col + ' 列附近：…' + snippet + '…'
}

/** 引擎的报错有两种口径：老口径给字符位置，新口径直接给行列，两种都翻成行/列/字符下标 */
function locateError(msg, src) {
  const p = msg.match(/position\s+(\d+)/i)
  if (p) {
    const idx = Number(p[1])
    const before = src.slice(0, idx)
    return { line: before.split('\n').length, col: idx - before.lastIndexOf('\n'), idx }
  }
  const lc = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i)
  if (lc) {
    const line = Number(lc[1])
    const col = Number(lc[2])
    const head = src.split('\n').slice(0, line - 1).join('\n')
    return { line, col, idx: head.length + (line > 1 ? 1 : 0) + col - 1 }
  }
  return null
}

function inspect(data, byteLen) {
  let keys = 0
  let arrays = 0
  let nulls = 0
  let depth = 0

  function walk(node, d) {
    if (d > depth) depth = d
    if (node === null) {
      nulls++
      return
    }
    if (Array.isArray(node)) {
      arrays++
      node.forEach((n) => walk(n, d + 1))
      return
    }
    if (typeof node === 'object') {
      const ks = Object.keys(node)
      keys += ks.length
      ks.forEach((k) => walk(node[k], d + 1))
    }
  }
  walk(data, 1)

  const topKeys = []
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    Object.keys(data).slice(0, 30).forEach((k) => {
      const v = data[k]
      topKeys.push({
        name: k,
        type: Array.isArray(v)
          ? '数组'
          : v === null
          ? '空值'
          : typeof v === 'object'
          ? '对象'
          : typeof v === 'number'
          ? '数字'
          : typeof v === 'boolean'
          ? '布尔'
          : '字符串',
        len: Array.isArray(v) ? v.length : null,
      })
    })
  }

  return {
    rootType: Array.isArray(data) ? '数组' : data === null ? '空值' : typeof data === 'object' ? '对象' : typeof data,
    keys,
    arrays,
    nulls,
    depth,
    topKeys,
    size: byteLen + ' 字符 · ' + utf8ByteLen(JSON.stringify(data)) + ' 字节',
  }
}
</script>

<style scoped>
.mini-act {
  font-size: 24rpx;
  color: var(--pk-accent);
  margin-left: 24rpx;
}
.act-row {
  display: flex;
  gap: 20rpx;
  flex-wrap: wrap;
}
</style>
