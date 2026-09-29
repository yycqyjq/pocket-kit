<template>
  <view>
    <PkCard title="生成结果" accent="var(--pk-danger)">
      <view class="pw-box">
        <text class="pw-box__t" selectable>{{ result.password || '点击下方按钮生成' }}</text>
      </view>
      <view class="strength">
        <view class="strength__bar">
          <view
            v-for="i in 4"
            :key="i"
            class="strength__seg"
            :style="{ background: i <= analysis.score ? scoreColor : 'var(--pk-line-strong)' }"
          ></view>
        </view>
        <text class="strength__t" :style="{ color: scoreColor }">{{ analysis.label }}</text>
      </view>
      <view class="act-row">
        <PkBtn text="重新生成" kind="primary" @tap="gen" />
        <PkBtn text="复制" kind="soft" @tap="copyText(result.password, '密码已复制')" />
      </view>
    </PkCard>

    <PkCard title="生成策略" accent="#4F6B8C">
      <view class="len-row">
        <text class="len-row__k">长度</text>
        <slider
          class="len-row__s"
          :value="opts.length"
          :min="4"
          :max="64"
          activeColor="var(--pk-accent)"
          block-size="18"
          @changing="onLen"
          @change="onLen"
        />
        <text class="len-row__v">{{ opts.length }}</text>
      </view>
      <PkSwitchRow v-model="opts.upper" title="大写字母 A-Z" desc="26 个字符" @change="gen" />
      <PkSwitchRow v-model="opts.lower" title="小写字母 a-z" desc="26 个字符" @change="gen" />
      <PkSwitchRow v-model="opts.digit" title="数字 0-9" desc="10 个字符" @change="gen" />
      <PkSwitchRow v-model="opts.symbol" title="符号 !@#$…" desc="25 个字符" @change="gen" />
      <PkSwitchRow v-model="opts.excludeSimilar" title="排除易混淆字符" desc="去掉 i l 1 L o 0 O" @change="gen" />
      <PkSwitchRow v-model="opts.excludeAmbiguous" title="排除需转义字符" desc="去掉大括号、中括号、斜杠与引号等" :last="true" @change="gen" />
    </PkCard>

    <PkCard title="强度分析" accent="var(--pk-accent)">
      <PkRow label="字符集大小" :value="result.poolSize + ' 种'" />
      <PkRow label="信息熵" :value="analysis.entropy + ' bit'" />
      <PkRow label="离线爆破估算" :value="analysis.crack" color="var(--pk-danger)" />
      <PkRow label="安全等级" :value="analysis.label" :color="scoreColor" />
      <view class="tips">
        <text v-for="(t, i) in analysis.tips" :key="i" class="tips__i">· {{ t }}</text>
      </view>
    </PkCard>

    <PkCard title="一次生成多个" accent="#6B5B95">
      <PkSeg v-model="batchCount" :items="batchOptions" />
      <PkRow
        v-for="(p, i) in batch"
        :key="i"
        :label="'#' + (i + 1)"
        :value="p"
        mono
      />
      <view class="act-row">
        <PkBtn text="复制全部" kind="ghost" @tap="copyText(batch.join('\n'), '已复制 ' + batch.length + ' 条')" />
      </view>
    </PkCard>

    <PkCard title="强度自测" accent="#8A6D3B">
      <PkField v-model="testPw" :password="!showTest" placeholder="输入一个密码看看它有多结实">
        <template #labelRight>
          <text class="mini-act" @tap="showTest = !showTest">{{ showTest ? '隐藏' : '显示' }}</text>
        </template>
      </PkField>
      <PkRow label="强度" :value="testAnalysis.label" :color="testScoreColor" />
      <PkRow label="信息熵" :value="testAnalysis.entropy + ' bit'" />
      <PkRow label="爆破估算" :value="testAnalysis.crack" />
      <view class="tips">
        <text v-for="(t, i) in testAnalysis.tips" :key="i" class="tips__i">· {{ t }}</text>
      </view>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { copyText } from '@/utils/clipboard'
import { generatePassword, passwordStrength } from '@/utils/random'

const opts = reactive({
  length: 16,
  upper: true,
  lower: true,
  digit: true,
  symbol: true,
  excludeSimilar: true,
  excludeAmbiguous: false,
})

const result = ref({ password: '', poolSize: 0 })
const batchCount = ref('5')
const batchOptions = [
  { key: '3', name: '3 条' },
  { key: '5', name: '5 条' },
  { key: '10', name: '10 条' },
]
const showTest = ref(false)
const testPw = ref('')

const analysis = computed(() => passwordStrength(result.value.password))
const testAnalysis = computed(() => passwordStrength(testPw.value))

const SCORE_COLORS = ['var(--pk-danger)', 'var(--pk-danger)', 'var(--pk-warn)', 'var(--pk-accent)', '#2F8C7A']
const scoreColor = computed(() => SCORE_COLORS[analysis.value.score] || 'var(--pk-accent)')
const testScoreColor = computed(() => SCORE_COLORS[testAnalysis.value.score] || 'var(--pk-accent)')

const batch = computed(() => {
  const n = Number(batchCount.value)
  const out = []
  for (let i = 0; i < n; i++) out.push(generatePassword(opts).password)
  return out
})

function onLen(e) {
  opts.length = Number(e.detail.value)
  gen()
}

function gen() {
  result.value = generatePassword(opts)
}

onMounted(gen)
</script>

<style scoped>
.mini-act {
  font-size: 24rpx;
  color: var(--pk-accent);
}
.pw-box {
  margin: 4rpx 24rpx 0;
  padding: 28rpx 22rpx;
  border-radius: var(--pk-radius-md);
  background: var(--pk-seg-bg);
  border: var(--pk-line-w) solid var(--pk-line);
  min-height: 108rpx;
  display: flex;
  align-items: center;
}
.pw-box__t {
  font-size: 32rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  word-break: break-all;
  line-height: 1.5;
  letter-spacing: 1rpx;
}
.strength {
  display: flex;
  align-items: center;
  padding: 20rpx 24rpx 0;
}
.strength__bar {
  flex: 1;
  display: flex;
  gap: 8rpx;
}
.strength__seg {
  flex: 1;
  height: 10rpx;
  border-radius: 5rpx;
}
.strength__t {
  font-size: 24rpx;
  margin-left: 20rpx;
  font-weight: 600;
  width: 90rpx;
  text-align: right;
}
.act-row {
  display: flex;
  gap: 20rpx;
  padding: 20rpx 24rpx 24rpx;
}
.len-row {
  display: flex;
  align-items: center;
  padding: 12rpx 24rpx 8rpx;
}
.len-row__k {
  font-size: 28rpx;
  color: var(--pk-text);
  width: 90rpx;
}
.len-row__s {
  flex: 1;
  margin: 0 16rpx;
}
.len-row__v {
  width: 60rpx;
  text-align: right;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--pk-text);
}
.tips {
  padding: 8rpx 24rpx 22rpx;
}
.tips__i {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.8;
}
</style>
