<template>
  <view>
    <PkCard padded>
      <PkField v-model="input" type="textarea" :area-height="180" label="JSON 数据">
        <template #labelRight>
          <text class="mini-act" @tap="input = TS_SAMPLE">示例</text>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <PkField v-model="rootName" label="根接口名" placeholder="Root" />
      <PkSeg v-model="indentKey" :items="indentItems" />
      <view class="act-row">
        <PkBtn text="生成 TypeScript" kind="primary" block @tap="run" />
      </view>
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
      <PkRow
        label="输入要求"
        value="必须是数组或对象。单个数字/字符串没有结构可推，会提示改输入"
        :copy="false"
        stack
      />
    </PkCard>

    <template v-if="output">
      <PkCard title="生成结果" accent="var(--pk-accent)">
        <template #extra>
          <text class="mini-act" @tap="copyText(output)">复制</text>
        </template>
        <PkRow label="接口个数" :value="stat.interfaces + ' 个'" :copy="false" />
        <PkRow label="根类型" :value="stat.root" mono :copy="false" />
        <PkOutput :value="output" mono pre :size="21" />
        <view class="act-row">
          <PkBtn text="复制代码" kind="primary" block @tap="copyText(output)" />
        </view>
      </PkCard>
    </template>

    <PkCard title="推断规则" accent="#4A6FA5">
      <PkRow label="类型映射" value="string→string，number→number，true→boolean，null→null，嵌套对象→独立 interface" :copy="false" stack />
      <PkRow label="数组" value="会合并数组内所有元素的类型：既有字符串又有数字，就是 (string | number)[]" :copy="false" stack />
      <PkRow label="空数组" value="推断不出元素类型，输出 any[]（可以在选项里改成 unknown[] 更严格）" :copy="false" stack />
      <PkRow label="可选字段" value="某个键只在一部分样本里出现时，会标成可选（extra?: boolean）" :copy="false" stack />
      <PkRow label="非法标识符" value="像 user-name、中文键名这类不能直接当变量名的键，会用引号包住，并在上一行注释出原字段名" :copy="false" stack />
      <PkRow label="命名" value="复数会自动转单数给数组元素命名：users → User" :copy="false" stack />
    </PkCard>

    <PkCard title="怎么用得上" accent="#6B5B95">
      <PkRow label="对接接口" value="拿到后端返回的示例 JSON，直接生成接口定义，比手写靠谱" :copy="false" stack />
      <PkRow label="类型存疑" value="不确定某个字段会不会缺、会不会是 null，多贴几条真实数据就能看出来" :copy="false" stack />
      <PkRow label="注意事项" value="生成的是「从这份数据看到的」类型，不代表接口契约。可选性、枚举值这些还要人工核对" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { jsonToTs, TS_SAMPLE } from '@/utils/json2ts'
import { copyText, toast } from '@/utils/clipboard'

const indentItems = [
  { key: '2', name: '缩进 2 空格' },
  { key: '4', name: '缩进 4 空格' },
]

const input = ref(TS_SAMPLE)
const rootName = ref('ApiResponse')
const indentKey = ref('2')
const output = ref('')
const error = ref('')
const stat = ref({ interfaces: 0, root: '' })

const parsed = computed(() => {
  if (!input.value.trim()) return { value: null, error: '' }
  try {
    return { value: JSON.parse(input.value), error: '' }
  } catch (e) {
    const m = /position\s+(\d+)/i.exec(e.message)
    if (m) {
      const pos = Number(m[1])
      const before = String(input.value).slice(0, pos)
      return { value: null, error: 'JSON 第 ' + before.split('\n').length + ' 行附近有语法错误' }
    }
    return { value: null, error: 'JSON 解析失败：' + e.message }
  }
})

function run() {
  error.value = ''
  output.value = ''
  if (parsed.value.error) {
    error.value = parsed.value.error
    return
  }
  const v = parsed.value.value
  if (v === null || typeof v !== 'object') {
    error.value = '顶层必须是数组或对象，'+ typeof v + ' 没有结构可以推断'
    return
  }
  try {
    const r = jsonToTs(v, { rootName: rootName.value || 'Root', indent: Number(indentKey.value) })
    output.value = r.text
    stat.value = { interfaces: r.interfaces, root: r.root }
  } catch (e) {
    error.value = e.message || '生成失败'
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
  padding: 8rpx 0 12rpx;
}
</style>
