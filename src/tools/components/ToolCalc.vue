<template>
  <view>
    <PkCard title="表达式" accent="#6B5B95">
      <PkField v-model="input" placeholder="例如 (1+2)*3、2^10、sin(30)、10!" @confirm="run">
        <template #labelRight>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <view class="quick-row">
        <text v-for="s in SAMPLE_EXPRS" :key="s.name" class="quick-i" @tap="useSample(s)">{{ s.name }}</text>
      </view>
      <PkSeg v-model="angleMode" :items="angleItems" />
    </PkCard>

    <PkCard v-if="error" title="算不出来" accent="var(--pk-danger)">
      <PkRow label="原因" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard v-else title="结果" accent="var(--pk-accent)">
      <PkRow label="计算结果" :value="result.display" big :copy="!!result.display" />
      <PkRow v-if="result.scientific" label="科学计数法" :value="result.scientific" mono />
      <PkRow v-if="result.hex" label="十六进制" :value="result.hex" mono />
      <PkRow label="原始表达式" :value="input || '—'" :copy="false" />
      <view class="act-row">
        <PkBtn text="把结果作为新输入" kind="ghost" block @tap="useResult" />
      </view>
    </PkCard>

    <PkCard title="运算符" accent="#4A6FA5">
      <PkRow label="四则" value="+  -  *  /  也支持 × ÷" :copy="false" stack />
      <PkRow label="幂与余" value="2^10 表示 2 的 10 次方；1024 % 37 取余" :copy="false" stack />
      <PkRow label="阶乘" value="5! = 120，最大 170!" :copy="false" stack />
      <PkRow label="隐式乘" value="2pi、3(4+5) 都会被当成乘法" :copy="false" stack />
      <PkRow label="常量" value="pi / π、e、tau" :copy="false" stack />
      <PkRow label="注意" value="数字里的千分位逗号要去掉，否则会被当成参数分隔" :copy="false" stack />
    </PkCard>

    <PkCard title="函数" accent="#8A6D3B">
      <PkRow label="三角" value="sin cos tan asin acos atan sinh cosh tanh" :copy="false" stack />
      <PkRow label="开方取整" value="sqrt cbrt abs sign floor ceil trunc round" :copy="false" stack />
      <PkRow label="对数指数" value="ln log(以10为底) log2 log10 exp" :copy="false" stack />
      <PkRow label="多参数" value="pow(a,b) min max hypot atan2" :copy="false" stack />
      <PkRow label="角度弧度" value="deg(x) 把弧度转角度，rad(x) 反过来" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { calc, SAMPLE_EXPRS } from '@/utils/expr'

const input = ref('(1+2)*3')
const angleMode = ref('deg')
const angleItems = [
  { key: 'deg', name: '角度制' },
  { key: 'rad', name: '弧度制' },
]

const result = computed(() => {
  if (!input.value.trim()) return { display: '', value: NaN, scientific: '', hex: '' }
  try {
    return calc(input.value, angleMode.value === 'deg')
  } catch (e) {
    return { display: '', value: NaN, scientific: '', hex: '', error: e.message }
  }
})

const error = computed(() => result.value.error || '')

function useSample(s) {
  input.value = s.expr
}

function useResult() {
  const v = result.value.value
  if (!isFinite(v)) return
  input.value = String(v)
}

function run() {}
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
}
.quick-row {
  display: flex;
  flex-wrap: wrap;
  margin: 0 0 12rpx;
}
.quick-i {
  display: inline-block;
  font-size: 22rpx;
  color: var(--pk-accent);
  margin: 8rpx 14rpx 0 0;
  padding: 12rpx 20rpx;
  line-height: 1.3;
  border-radius: var(--pk-radius-sm);
  background: var(--pk-accent-soft);
}
.act-row {
  padding: 14rpx 0 4rpx;
}
</style>
