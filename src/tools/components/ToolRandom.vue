<template>
  <view>
    <PkCard title="选择玩法" accent="#2F8C7A">
      <PkSeg v-model="mode" :items="modes" />
    </PkCard>

    <!-- 随机数 -->
    <template v-if="mode === 'number'">
      <PkCard title="区间随机数" accent="#2F8C7A">
        <PkField v-model="min" type="number" label="最小值" placeholder="1" />
        <PkField v-model="max" type="number" label="最大值" placeholder="100" />
        <PkField v-model="count" type="number" label="生成个数" placeholder="1" />
        <PkSwitchRow v-model="unique" title="结果不重复" desc="个数超过区间长度时会自动限制" :last="true" />
        <view class="act-row">
          <PkBtn text="生成" kind="primary" block @tap="runNumber" />
        </view>
        <view v-if="numbers.length" class="chips">
          <view v-for="(n, i) in numbers" :key="i" class="chip" hover-class="chip--hover" @tap="copyText(String(n))">
            <text class="chip__t">{{ n }}</text>
          </view>
        </view>
      </PkCard>
    </template>

    <!-- 抽签 -->
    <template v-else-if="mode === 'lot'">
      <PkCard title="名单抽签" accent="#6B5B95">
        <PkField
          v-model="names"
          type="textarea"
          :area-height="160"
          placeholder="每行一个名字，或用逗号、空格分隔"
        >
          <template #labelRight>
            <text class="mini-act">{{ nameList.length }} 个</text>
          </template>
        </PkField>
        <PkField v-model="pickCount" type="number" label="抽取个数" placeholder="1" />
        <PkSwitchRow v-model="lotUnique" title="不重复抽取" desc="同一个人不会出现两次" :last="true" />
        <view class="act-row">
          <PkBtn text="开始抽取" kind="primary" block @tap="runLot" />
        </view>
        <view v-if="picked.length" class="picked">
          <text class="picked__label">抽中</text>
          <view class="chips">
            <view v-for="(n, i) in picked" :key="i" class="chip chip--accent" hover-class="chip--hover" @tap="copyText(n)">
              <text class="chip__t">{{ n }}</text>
            </view>
          </view>
        </view>
      </PkCard>
    </template>

    <!-- 硬币骰子 -->
    <template v-else-if="mode === 'dice'">
      <PkCard title="硬币与骰子" accent="var(--pk-warn)">
        <PkField v-model="diceCount" type="number" label="投掷次数" placeholder="1" />
        <view class="act-row">
          <PkBtn text="抛硬币" kind="soft" @tap="runCoin" />
          <PkBtn text="掷骰子" kind="primary" @tap="runDice" />
        </view>
        <view v-if="rolls.length" class="rolls">
          <view v-for="(r, i) in rolls" :key="i" class="roll">
            <text class="roll__t">{{ r }}</text>
          </view>
        </view>
        <PkRow v-if="rolls.length" label="统计" :value="rollSummary" :copy="false" />
      </PkCard>
    </template>

    <!-- 洗牌分组 -->
    <template v-else>
      <PkCard title="随机分组" accent="#3E7A4E">
        <PkField v-model="names" type="textarea" :area-height="160" placeholder="每行一个名字">
          <template #labelRight>
            <text class="mini-act">{{ nameList.length }} 个</text>
          </template>
        </PkField>
        <PkField v-model="groupCount" type="number" label="分成几组" placeholder="3" />
        <view class="act-row">
          <PkBtn text="洗牌分组" kind="primary" block @tap="runGroup" />
        </view>
        <view v-if="groups.length" class="groups">
          <view v-for="(g, gi) in groups" :key="gi" class="group">
            <text class="group__t">第 {{ gi + 1 }} 组 · {{ g.length }} 人</text>
            <text class="group__m">{{ g.join('、') }}</text>
          </view>
          <PkBtn text="复制分组结果" kind="ghost" block @tap="copyGroups" />
        </view>
      </PkCard>

      <PkCard title="随机排序" accent="#4A6FA5">
        <view class="act-row">
          <PkBtn text="打乱顺序" kind="soft" block @tap="runShuffle" />
        </view>
        <view v-if="shuffled.length" class="shuffled">
          <text v-for="(n, i) in shuffled" :key="i" class="shuffled__i">{{ i + 1 }}. {{ n }}</text>
        </view>
        <PkBtn v-if="shuffled.length" text="复制顺序" kind="ghost" block @tap="copyText(shuffled.map((n, i) => i + 1 + '. ' + n).join('\n'))" />
      </PkCard>
    </template>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { copyText, toast } from '@/utils/clipboard'
import { randomInt, pickMany, shuffle, roll } from '@/utils/random'

const modes = [
  { key: 'number', name: '随机数' },
  { key: 'lot', name: '抽签' },
  { key: 'dice', name: '硬币骰子' },
  { key: 'group', name: '分组洗牌' },
]

const mode = ref('number')

/* --- 随机数 --- */
const min = ref('1')
const max = ref('100')
const count = ref('1')
const unique = ref(true)
const numbers = ref([])

function runNumber() {
  const lo = Number(min.value)
  const hi = Number(max.value)
  const n = Math.max(1, Math.min(500, Number(count.value) || 1))
  if (!isFinite(lo) || !isFinite(hi)) {
    toast('请输入有效范围')
    return
  }
  if (lo > hi) {
    toast('最小值不能大于最大值')
    return
  }
  if (unique.value) {
    const span = Math.floor(hi) - Math.ceil(lo) + 1
    if (span <= 0) {
      toast('区间内没有整数')
      return
    }
    if (n > span) {
      toast('不重复最多只能取 ' + span + ' 个')
    }
    const pool = []
    for (let i = Math.ceil(lo); i <= Math.floor(hi); i++) pool.push(i)
    numbers.value = pickMany(pool, Math.min(n, span))
  } else {
    const out = []
    for (let i = 0; i < n; i++) out.push(randomInt(lo, hi))
    numbers.value = out
  }
}

/* --- 抽签 / 分组 --- */
const names = ref('')
const pickCount = ref('1')
const lotUnique = ref(true)
const picked = ref([])
const groupCount = ref('3')
const groups = ref([])
const shuffled = ref([])

const nameList = computed(() =>
  String(names.value)
    .split(/[\n,，、;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
)

function runLot() {
  const list = nameList.value
  if (!list.length) {
    toast('先输入一些名字')
    return
  }
  const n = Math.max(1, Math.min(list.length, Number(pickCount.value) || 1))
  picked.value = lotUnique.value ? pickMany(list, n) : Array.from({ length: n }, () => list[randomInt(0, list.length - 1)])
}

function runGroup() {
  const list = nameList.value
  if (list.length < 2) {
    toast('至少需要两个名字')
    return
  }
  const g = Math.max(2, Math.min(list.length, Number(groupCount.value) || 2))
  const arr = shuffle(list)
  const buckets = Array.from({ length: g }, () => [])
  arr.forEach((n, i) => buckets[i % g].push(n))
  groups.value = buckets.filter((b) => b.length)
}

function runShuffle() {
  const list = nameList.value
  if (list.length < 2) {
    toast('至少需要两个名字')
    return
  }
  shuffled.value = shuffle(list)
}

function copyGroups() {
  const text = groups.value.map((g, i) => '第 ' + (i + 1) + ' 组：' + g.join('、')).join('\n')
  copyText(text, '分组结果已复制')
}

/* --- 硬币骰子 --- */
const diceCount = ref('1')
const rolls = ref([])
const rollKind = ref('coin')

function runCoin() {
  rollKind.value = 'coin'
  rolls.value = roll('coin', Number(diceCount.value) || 1)
}
function runDice() {
  rollKind.value = 'dice'
  rolls.value = roll('dice', Number(diceCount.value) || 1)
}

const rollSummary = computed(() => {
  if (!rolls.value.length) return ''
  const map = {}
  rolls.value.forEach((r) => (map[r] = (map[r] || 0) + 1))
  const total = rolls.value.length
  return Object.keys(map)
    .sort()
    .map((k) => k + ' 出现 ' + map[k] + ' 次（' + ((map[k] / total) * 100).toFixed(1) + '%）')
    .join('；')
})
</script>

<style scoped>
.mini-act {
  font-size: 24rpx;
  color: var(--pk-text-3);
}
.act-row {
  display: flex;
  gap: 20rpx;
  padding: 12rpx 24rpx 20rpx;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  padding: 4rpx 18rpx 22rpx;
}
.chip {
  padding: 14rpx 24rpx;
  margin: 8rpx;
  border-radius: var(--pk-radius-sm);
  background: var(--pk-seg-bg);
  border: var(--pk-line-w) solid var(--pk-line);
}
.chip--hover {
  opacity: 0.6;
}
.chip--accent {
  background: var(--pk-accent-soft);
  border-color: var(--pk-accent);
}
.chip__t {
  font-size: 28rpx;
  color: var(--pk-text);
  font-weight: 600;
}
.chip--accent .chip__t {
  color: var(--pk-accent);
}
.picked {
  padding: 0 0 12rpx;
}
.picked__label {
  font-size: 22rpx;
  color: var(--pk-text-3);
  padding: 0 28rpx;
  display: block;
}
.rolls {
  display: flex;
  flex-wrap: wrap;
  padding: 4rpx 18rpx 12rpx;
}
.roll {
  width: 76rpx;
  height: 76rpx;
  margin: 8rpx;
  border-radius: var(--pk-radius-md);
  background: var(--pk-seg-bg);
  border: var(--pk-line-w) solid var(--pk-line);
  display: flex;
  align-items: center;
  justify-content: center;
}
.roll__t {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--pk-text);
}
.groups {
  padding: 0 24rpx 24rpx;
}
.group {
  padding: 18rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.group__t {
  font-size: 24rpx;
  color: var(--pk-accent);
  display: block;
  margin-bottom: 8rpx;
}
.group__m {
  font-size: 26rpx;
  color: var(--pk-text);
  line-height: 1.7;
}
.shuffled {
  padding: 4rpx 24rpx 20rpx;
}
.shuffled__i {
  display: block;
  font-size: 26rpx;
  color: var(--pk-text);
  line-height: 2;
}
</style>
