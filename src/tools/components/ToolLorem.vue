<template>
  <view>
    <PkCard title="要什么样的占位文本" accent="#3E7A4E">
      <PkSeg v-model="lang" :items="langItems" />
      <PkSeg v-model="unit" :items="unitItems" />
      <PkField
        v-if="unit !== 'length'"
        v-model="count"
        type="number"
        :label="unit === 'para' ? '生成几段' : '生成几句'"
      />
      <PkField v-else v-model="targetLength" type="number" label="目标字符数" />
      <view class="act-row">
        <PkBtn text="生成" kind="primary" @tap="run" />
        <PkBtn text="再换一批" kind="soft" @tap="run" />
        <PkBtn text="复制" kind="ghost" @tap="copyText(output)" />
      </view>
    </PkCard>

    <PkCard v-if="output" title="生成结果" accent="var(--pk-accent)">
      <PkRow label="字符数" :value="st.chars + ' 个'" :copy="false" />
      <PkRow label="不计空格" :value="st.noSpace + ' 个'" :copy="false" />
      <PkRow v-if="st.hanzi" label="汉字" :value="st.hanzi + ' 个'" :copy="false" />
      <PkRow v-if="st.words" label="英文单词" :value="st.words + ' 个'" :copy="false" />
      <PkRow label="段落" :value="st.paragraphs + ' 段'" :copy="false" />
      <PkOutput :value="output" :size="25" />
      <view class="act-row">
        <PkBtn text="复制文本" kind="primary" block @tap="copyText(output)" />
      </view>
    </PkCard>

    <PkCard title="这个能拿来做什么" accent="#4A6FA5">
      <PkRow label="检查排版" value="把版面填满，行高、字距、折行的问题才会暴露出来" :copy="false" stack />
      <PkRow label="做原型" value="设计稿里先用占位文字撑出真实长度，之后替换成正式文案不会大跳版" :copy="false" stack />
      <PkRow label="压测接口" value="批量生成固定长度的文本，测字段长度限制" :copy="false" stack />
      <PkRow label="中英混排" value="切到 English 就能测英文单词折行与连字符的表现" :copy="false" stack />
      <PkRow label="按字数生成" value="选「按字数」时会尽量贴近目标长度的整句，末尾超出才截断" :copy="false" stack />
    </PkCard>

    <PkCard title="关于 Lorem ipsum" accent="#8A6D3B">
      <PkRow
        label="为什么长得像拉丁文"
        value="它摘自西塞罗《论至善与至恶》的一段，五百多年来一直是印刷与排版的默认占位文字"
        :copy="false"
        stack
      />
      <PkRow
        label="为什么用假文"
        value="真人看到有意义的文字会忍不住去读，注意力就被内容带走了；用假文才能专注看版式"
        :copy="false"
        stack
      />
      <PkRow
        label="中文的场景"
        value="中文的字宽一致，一行能放多少字是固定值，所以中文排版更依赖「按字数」验证"
        :copy="false"
        stack
      />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { generate, stats, GENERATE_OPTIONS } from '@/utils/lorem'
import { copyText, toast } from '@/utils/clipboard'

const lang = ref('cn')
const unit = ref('para')
const count = ref('3')
const targetLength = ref('200')
const output = ref('')

const langItems = GENERATE_OPTIONS.langs
const unitItems = GENERATE_OPTIONS.units

const st = computed(() => (output.value ? stats(output.value) : { chars: 0, noSpace: 0, hanzi: 0, words: 0, paragraphs: 0 }))

function run() {
  try {
    output.value = generate({
      lang: lang.value,
      unit: unit.value,
      count: Number(count.value),
      targetLength: Number(targetLength.value),
    })
  } catch (e) {
    toast(e.message || '生成失败')
  }
}

// 打开就有一份结果，不用先点一次
run()
</script>

<style scoped>
.act-row {
  display: flex;
  gap: 18rpx;
  flex-wrap: wrap;
  padding: 8rpx 0 4rpx;
}
</style>
