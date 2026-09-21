<template>
  <view>
    <PkCard padded>
      <PkField v-model="input" type="textarea" :area-height="110" label="文本 / HTML">
        <template #labelRight>
          <text class="mini-act" @tap="input = SAMPLE">示例</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <PkSeg v-model="scope" :items="scopeItems" />
    </PkCard>

    <PkCard title="编码结果" accent="var(--pk-accent)">
      <template #extra>
        <text class="mini-act" @tap="copyText(encoded)">复制</text>
      </template>
      <PkOutput :value="encoded" mono :size="23" />
      <PkRow label="字符数" :value="input.length + ' → ' + encoded.length" :copy="false" />
      <PkRow label="当前模式" :value="scopeHint" :copy="false" stack />
    </PkCard>

    <PkCard title="解码结果" accent="#4A6FA5">
      <template #extra>
        <text class="mini-act" @tap="copyText(decoded)">复制</text>
      </template>
      <PkOutput :value="decoded" mono :size="23" />
      <PkRow label="识别到的实体" :value="entityCount + ' 个'" :copy="false" />
      <PkRow label="说明" value="把输入里的 &amp; &lt; &#20013; 这类写法还原成真正的字符" :copy="false" stack />
    </PkCard>

    <PkCard title="去标签取纯文本" accent="#6B5B95">
      <template #extra>
        <text class="mini-act" @tap="copyText(plain)">复制</text>
      </template>
      <PkOutput :value="plain || '输入里没有识别到 HTML 标签'" mono :size="23" />
      <PkRow label="用途" value="把一段 HTML 变成纯文本，<script> 与 <style> 的内容会被整段丢弃" :copy="false" stack />
    </PkCard>

    <PkCard title="必须转义的五个字符" accent="var(--pk-danger)">
      <view v-for="e in NEED_ESCAPE" :key="e.ch" class="esc">
        <view class="esc__head">
          <text class="esc__ch">{{ e.ch }}</text>
          <text class="esc__arrow">→</text>
          <text class="esc__to" selectable>{{ e.entity }}</text>
        </view>
        <text class="esc__note">{{ e.note }}</text>
      </view>
    </PkCard>

    <PkCard title="常用实体表" accent="var(--pk-warn)">
      <view class="grid">
        <view
          v-for="e in entityTable"
          :key="e[1]"
          class="cell"
          hover-class="cell--hover"
          @tap="copyText(e[1])"
        >
          <text class="cell__ch">{{ e[0] }}</text>
          <text class="cell__name">{{ e[1] }}</text>
        </view>
      </view>
      <PkRow label="提示" value="点一下即可复制实体名。字符本身也能直接写，但 & < > 这几个必须转义" :copy="false" stack />
    </PkCard>

    <PkCard title="三种转义写法的区别" accent="#4A6FA5">
      <PkRow label="命名实体" value="&amp; &lt; &copy; —— 好读，但只覆盖两千多个常用字符" :copy="false" stack />
      <PkRow label="十进制数字实体" value="&#20013; —— 所有字符都能写，不依赖字符集声明" :copy="false" stack />
      <PkRow label="十六进制数字实体" value="&#x4E2D; —— 和十进制等价，写起来短一些" :copy="false" stack />
      <PkRow label="实践建议" value="HTML 正文里中文直接写就好，只有 & 、尖括号、单双引号这几个需要转义；只有在不方便写中文的场合才用数字实体" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { encodeEntities, decodeEntities, stripTags, countEntities, NAMED_ENTITIES, NEED_ESCAPE } from '@/utils/entity'
import { copyText } from '@/utils/clipboard'

const SAMPLE = '<a href="搜索?q=工具&page=1" title=\'随身匣\'>点我 &copy;</a>'

const scopeItems = [
  { key: 'basic', name: '只转义 5 个' },
  { key: 'named', name: '中文用命名实体' },
  { key: 'numeric', name: '中文用数字实体' },
]

const input = ref(SAMPLE)
const scope = ref('basic')

const scopeHint = computed(() => {
  if (scope.value === 'basic') return '只处理 & < > " \' 五个必须转义的字符，中文原样保留——日常最常用'
  if (scope.value === 'named') return '有命名实体的字符用名字表示（© → &copy;），其余非 ASCII 用十进制数字'
  return '所有非 ASCII 字符都写成十进制数字实体（中 → &#20013;），不依赖字符集声明'
})

const encoded = computed(() => {
  try {
    return encodeEntities(input.value, { scope: scope.value, quotes: true })
  } catch (e) {
    return ''
  }
})
const decoded = computed(() => decodeEntities(input.value))
const plain = computed(() => stripTags(input.value))
const entityCount = computed(() => countEntities(input.value))

const entityTable = computed(() => NAMED_ENTITIES.slice(0, 48))
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 24rpx;
}
.esc {
  padding: 16rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.esc:last-child {
  border-bottom: none;
}
.esc__head {
  display: flex;
  align-items: center;
}
.esc__ch {
  font-size: 28rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  min-width: 60rpx;
}
.esc__arrow {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin: 0 16rpx;
}
.esc__to {
  font-size: 26rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-accent);
  flex: 1;
}
.esc__note {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
  line-height: 1.6;
}
.grid {
  display: flex;
  flex-wrap: wrap;
  padding: 8rpx 16rpx 16rpx;
}
.cell {
  width: calc(25% - 12rpx);
  margin: 6rpx;
  padding: 12rpx 6rpx;
  border-radius: var(--pk-radius-sm);
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.cell--hover {
  opacity: 0.6;
}
.cell__ch {
  font-size: 30rpx;
  color: var(--pk-text);
  line-height: 1.2;
}
.cell__name {
  font-size: 20rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
  font-family: Menlo, Consolas, monospace;
}
</style>
