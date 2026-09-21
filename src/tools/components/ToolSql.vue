<template>
  <view>
    <PkCard padded>
      <PkField v-model="input" type="textarea" :area-height="200" label="SQL">
        <template #labelRight>
          <text class="mini-act" @tap="input = SQL_SAMPLE">示例</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <PkSwitchRow v-model="upper" title="关键字大写" desc="SELECT / FROM / WHERE 等统一转成大写" />
      <PkSwitchRow v-model="commaBreak" title="逗号换行" desc="SELECT 的字段列表每个占一行" :last="true" />
      <view class="act-row">
        <PkBtn text="格式化" kind="primary" @tap="run" />
        <PkBtn text="压成一行" kind="ghost" @tap="runMin" />
        <PkBtn text="复制" kind="soft" @tap="copyText(output)" />
      </view>
    </PkCard>

    <PkCard v-if="error" title="出错了" accent="var(--pk-danger)">
      <PkRow label="原因" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard v-if="output" title="结果" accent="var(--pk-accent)">
      <PkRow label="行数" :value="stat.lines + ' 行'" :copy="false" />
      <PkRow label="关键字" :value="stat.keywords + ' 个'" :copy="false" />
      <PkRow label="字符数" :value="stat.chars + ' 个'" :copy="false" />
      <PkOutput :value="output" mono />
    </PkCard>

    <PkCard title="排版规则" accent="#4A6FA5">
      <PkRow label="顶格换行" value="SELECT / FROM / WHERE / GROUP BY / ORDER BY / LIMIT / UNION 等子句" :copy="false" stack />
      <PkRow label="缩进换行" value="JOIN / ON / AND / OR 这些连接与条件" :copy="false" stack />
      <PkRow label="逗号换行" value="只在 SELECT、GROUP BY、ORDER BY、VALUES、SET 的顶层生效，括号里的逗号不动" :copy="false" stack />
      <PkRow label="不会破坏" value="字符串、反引号/双引号标识符、行注释与块注释都原样保留" :copy="false" stack />
      <PkRow label="只排版不改语义" value="不做语法校验，也不重写表名别名" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { formatSql, minifySql, SQL_SAMPLE } from '@/utils/sqlfmt'
import { copyText } from '@/utils/clipboard'

const input = ref('')
const output = ref('')
const error = ref('')
const stat = ref({ lines: 0, keywords: 0, chars: 0 })
const upper = ref(true)
const commaBreak = ref(true)

function run() {
  error.value = ''
  output.value = ''
  if (!input.value.trim()) {
    error.value = '请先粘贴 SQL'
    return
  }
  try {
    const r = formatSql(input.value, { upper: upper.value, commaBreak: commaBreak.value })
    output.value = r.text
    stat.value = { lines: r.lines, keywords: r.keywords, chars: r.chars }
  } catch (e) {
    error.value = e.message || '格式化失败'
  }
}

function runMin() {
  error.value = ''
  output.value = ''
  if (!input.value.trim()) {
    error.value = '请先粘贴 SQL'
    return
  }
  try {
    const t = minifySql(input.value)
    output.value = t
    stat.value = { lines: 1, keywords: 0, chars: t.length }
  } catch (e) {
    error.value = e.message || '压缩失败'
  }
}
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 24rpx;
}
.act-row {
  display: flex;
  gap: 20rpx;
  flex-wrap: wrap;
}
</style>
