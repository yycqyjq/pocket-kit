<template>
  <view>
    <PkCard padded>
      <PkField v-model="input" type="textarea" :area-height="150" label="要清洗的文本">
        <template #labelRight>
          <text class="mini-act" @tap="input = CLEAN_SAMPLE">示例</text>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <view v-for="o in OPTIONS" :key="o.key" class="opt">
        <PkSwitchRow
          :model-value="opts[o.key]"
          :title="o.name"
          :desc="o.desc"
          :last="true"
          @change="opts[o.key] = !opts[o.key]"
        />
      </view>
      <PkRow label="字符数" :value="before + ' → ' + after" :copy="false" />
    </PkCard>

    <PkCard v-if="report.length" title="清洗报告" accent="var(--pk-accent)">
      <PkRow v-for="r in report" :key="r.name" :label="r.name" :value="r.count + ' 处'" :copy="false" />
      <view class="act-row">
        <PkBtn text="复制清洗结果" kind="primary" block @tap="copyText(cleaned)" />
      </view>
    </PkCard>

    <PkCard title="清洗结果" accent="var(--pk-accent)">
      <PkOutput :value="cleaned || '（空）'" :size="24" />
    </PkCard>

    <PkCard title="扫描结果：还剩哪些脏东西" accent="var(--pk-danger)">
      <PkEmpty v-if="!scanned.length" title="已经很干净" desc="没有发现终端色码、零宽字符、控制字符这类东西" />
      <view v-for="s in scanned" :key="s.name" class="dirty">
        <text class="dirty__n">{{ s.name }}</text>
        <text class="dirty__c">{{ s.count }} 处</text>
        <text class="dirty__note">{{ s.note }}</text>
      </view>
    </PkCard>

    <PkCard title="这些字符从哪来" accent="#8A6D3B">
      <PkRow label="终端颜色码" value="从终端复制日志、git 输出、npm 报错时必带" :copy="false" stack />
      <PkRow label="零宽字符" value="网页正文、PDF、聊天软件里常见；也是「文本比对不相等」的元凶" :copy="false" stack />
      <PkRow label="全角空格" value="中文输入法打空格、Word 粘贴都会产生" :copy="false" stack />
      <PkRow label="BOM" value="Windows 记事本保存 UTF-8 时默认加，会让第一行解析出错" :copy="false" stack />
      <PkRow label="双向控制符" value="可以让「实际顺序」与「显示顺序」不一致，文件名伪装常用" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { clean, scan, OPTIONS, CLEAN_SAMPLE } from '@/utils/cleanescape'
import { copyText, toast } from '@/utils/clipboard'

const input = ref(CLEAN_SAMPLE)
const opts = reactive({})
OPTIONS.forEach((o) => {
  opts[o.key] = o.default
})

const cleaned = computed(() => {
  if (!input.value) return ''
  try {
    return clean(input.value, opts).text
  } catch (e) {
    return input.value
  }
})

const report = computed(() => {
  if (!input.value) return []
  try {
    return clean(input.value, opts).report
  } catch (e) {
    return []
  }
})

const before = computed(() => {
  if (!input.value) return 0
  try { return clean(input.value, opts).before } catch (e) { return input.value.length }
})
const after = computed(() => cleaned.value.length)

const scanned = computed(() => scan(cleaned.value))
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 22rpx;
}
.opt {
  padding-left: 24rpx;
}
.act-row {
  padding: 8rpx 24rpx 20rpx;
}
.dirty {
  padding: 14rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.dirty:last-child {
  border-bottom: none;
}
.dirty__n {
  display: block;
  font-size: 24rpx;
  color: var(--pk-danger);
}
.dirty__c {
  font-size: 21rpx;
  color: var(--pk-text-3);
  margin-left: 12rpx;
}
.dirty__note {
  display: block;
  font-size: 21rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
  line-height: 1.6;
}
</style>
