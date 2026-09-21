<template>
  <view>
    <PkCard padded>
      <PkField v-model="input" label="输入任意风格的名字" placeholder="例如 getUserByID、user_name、用户昵称">
        <template #labelRight>
          <text class="mini-act" @tap="input = 'getUserByID'">示例</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <PkRow
        v-if="words.length"
        label="切成词"
        :value="words.join(' · ')"
        :copy="false"
        stack
      />
    </PkCard>

    <template v-if="words.length">
      <PkCard title="转换结果" accent="#2F8C7A">
        <PkRow
          v-for="s in list"
          :key="s.key"
          :label="s.name"
          :value="s.value"
          mono
        />
      </PkCard>

      <PkCard title="用法提示" accent="#4A6FA5">
        <PkRow label="驼峰" value="JS / Java / Swift 的变量与方法" :copy="false" stack />
        <PkRow label="下划线" value="Python / Ruby / 数据库字段" :copy="false" stack />
        <PkRow label="常量" value="各语言里表示不可变的编译期常量" :copy="false" stack />
        <PkRow label="短横线" value="CSS 类名、URL 路径、HTML 属性" :copy="false" stack />
        <PkRow label="大驼峰" value="类名、React 组件名" :copy="false" stack />
        <PkRow label="网址别名" value="去掉特殊字符、统一小写，中文会原样保留" :copy="false" stack />
      </PkCard>
    </template>

    <PkCard v-else title="等一个名字" accent="#2F8C7A">
      <PkRow label="提示" value="随便贴一个变量名、类名或文件名字符串，下面会一次给出 11 种风格" :copy="false" stack />
      <PkRow label="识别规则" value="能自动认出小驼峰、大驼峰、下划线、短横线、点号、空格，以及连续大写缩写（HTTPServer → HTTP + Server）" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { convertAll } from '@/utils/naming'

const input = ref('')

const result = computed(() => convertAll(input.value))
const words = computed(() => result.value.words)
const list = computed(() => result.value.list.filter((s) => s.value !== '' || words.value.length === 0))
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 24rpx;
}
</style>
