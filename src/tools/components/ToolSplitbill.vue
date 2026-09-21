<template>
  <view>
    <PkCard title="币种与账单金额" accent="#4E7A6B" padded>
      <PkSeg v-model="cur" :items="curItems" />
      <PkField v-model="base" type="digit" label="账单原始金额" :placeholder="'如 ' + curDef.symbol + '680'" :maxlength="16" />
      <text class="tip">
        只做符号展示：本机不联网、不换算汇率，换币种只换符号，数字仍是填的那一个。
        单笔金额上限 {{ curDef.symbol }}{{ MAX_AMOUNT_TEXT }}，超过按输入错误处理。
      </text>
      <PkRow label="按分记账" :value="baseCentsText" mono />
      <PkRow v-if="baseError" label="提示" :value="baseError" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard title="税 · 折扣 · 小费 · 抹零" accent="var(--pk-accent)" padded>
      <view class="chips">
        <text
          v-for="t in TIP_PRESETS"
          :key="t.key"
          class="chips__i"
          :class="{ 'chips__i--on': String(t.rate) === tipRate }"
          @tap="pickTip(t)"
        >{{ t.name }}</text>
      </view>
      <PkField v-model="tipRate" type="digit" label="小费比例（%，可自定义）" placeholder="15" :maxlength="6" />
      <view class="row2">
        <PkField v-model="taxRate" type="digit" label="税率（%）" placeholder="8" :maxlength="6" />
        <PkField v-model="discRate" type="digit" label="折扣（%，减价）" placeholder="10" :maxlength="6" />
      </view>
      <text class="sub">抹零档位</text>
      <PkSeg v-model="roundUnit" :items="unitItems" />
      <text class="sub">取整方向</text>
      <PkSeg v-model="roundMode" :items="modeItems" />
      <view v-if="chain" class="chain">
        <view v-for="(s, i) in chain.steps" :key="i" class="chain__r">
          <text class="chain__k">{{ s.label }}</text>
          <text class="chain__e">{{ s.expr }}</text>
          <text class="chain__v">{{ money(s.value) }}</text>
          <text class="chain__d" :class="{ 'chain__d--n': s.delta < 0 }">{{ s.delta ? fmtDelta(s.delta) : '' }}</text>
        </view>
      </view>
      <PkRow v-if="chain" label="应付合计" :value="money(chain.final)" big color="var(--pk-accent)" />
      <text v-if="chain" class="tip">{{ chain.notice }}</text>
      <PkRow v-if="chainError" label="提示" :value="chainError" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard title="参与人" accent="#4E7A6B" padded>
      <text class="sub">名单粘贴（一行一个人，可带金额或份数）</text>
      <PkField v-model="paste" type="textarea" :area-height="160" placeholder="我 680&#10;阿明&#10;小赵 x2&#10;小李 不参与" />
      <view class="act">
        <PkBtn text="解析并填入" kind="soft" @tap="doParse" />
        <PkBtn text="用样例名单" kind="ghost" @tap="useSample" />
      </view>
      <PkRow v-if="parseNotice" label="解析提示" :value="parseNotice" color="var(--pk-warn)" :copy="false" stack />
      <text class="sub">数字这一列当作</text>
      <PkSeg v-model="numberAs" :items="asItems" />
      <view class="ppl">
        <view v-for="(p, i) in visiblePeople" :key="i" class="ppl__row">
          <text class="ppl__n">{{ i + 1 }}</text>
          <view class="ppl__c"><PkField v-model="p.name" :placeholder="'第 ' + (i + 1) + ' 人'" :maxlength="20" /></view>
          <view class="ppl__c ppl__c--v"><PkField v-model="p.val" type="digit" :placeholder="valPlaceholder" :maxlength="14" /></view>
          <text class="ppl__x" @tap="removePerson(i)">删</text>
        </view>
        <text v-if="people.length > EDITOR_LIMIT" class="tip">
          …共 {{ people.length }} 行，编辑区只显示前 {{ EDITOR_LIMIT }} 行，后面 {{ people.length - EDITOR_LIMIT }} 行本次不参与计算；
          人多请删减名单后分批算。
        </text>
      </view>
      <view class="act">
        <PkBtn text="加一人" kind="soft" @tap="addPerson" />
        <PkBtn text="删最后一行" kind="ghost" :disabled="!visiblePeople.length" @tap="removePerson(visiblePeople.length - 1)" />
      </view>
      <text class="tip">
        编辑区显示 {{ visiblePeople.length }} / {{ people.length }} 行，上限 {{ EDITOR_LIMIT }} 行（名单本身最多 {{ MAX_PEOPLE }} 人）。
        名字留空会自动叫「第 N 人」；重名会加序号区分。
      </text>
    </PkCard>

    <PkCard title="分摊结果" accent="var(--pk-accent)">
      <PkSeg v-model="mode" :items="modeSegItems" />
      <PkRow v-if="splitError" label="提示" :value="splitError" color="var(--pk-danger)" :copy="false" stack />
      <template v-else-if="shares">
        <view class="hero">
          <text class="hero__v">{{ money(shares.total) }}</text>
          <text class="hero__k">合计 · {{ shares.headCount }} 人参与 · 人均 {{ money(shares.perHead) }}</text>
        </view>
        <PkRow label="人均（取整后）" :value="perHeadRoundedText" :copy="false" stack />
        <PkRow label="差额校验" :value="shares.sumCheck ? '各人之和 = 总额，一分不差' : '各人之和与总额不等，检查输入'" color="var(--pk-accent)" :copy="false" stack />
        <PkRow v-if="shares.commonPartText" label="公共部分" :value="money(shares.commonPart) + ' 元（' + shares.commonPartText + '）按人头摊掉'" :copy="false" stack />
        <text class="tip">{{ shares.notice }}</text>
        <view class="list">
          <view v-for="(it, i) in visibleShares" :key="i" class="list__r">
            <text class="list__n">{{ it.name }}</text>
            <text class="list__m" :class="{ 'list__m--off': !it.join }">{{ it.join ? money(it.share) : '不参与' }}</text>
            <text class="list__p">{{ it.join ? it.percent + '%' : '—' }}</text>
            <text class="list__x">{{ rowTag(it) }}</text>
          </view>
          <text v-if="shares.items.length > ITEM_LIMIT" class="tip">
            …共 {{ shares.items.length }} 人，只显示前 {{ ITEM_LIMIT }} 人。
          </text>
        </view>
        <text class="tip">最大余数法逐分分配：{{ allocText }}</text>
      </template>
    </PkCard>

    <PkCard title="谁该给谁钱" accent="var(--pk-accent)">
      <text class="tip">先有人在「垫付」那一列填了实际掏的钱，才谈得上互相转；全空时只有应付，没有应收。</text>
      <PkRow v-if="settleError" label="提示" :value="settleError" color="var(--pk-danger)" :copy="false" stack />
      <template v-else-if="plan && hasPaid">
        <view v-if="plan.transfers.length" class="tr">
          <view v-for="(t, i) in visibleTransfers" :key="i" class="tr__r">
            <text class="tr__f">{{ t.from }}</text>
            <text class="tr__a">→</text>
            <text class="tr__t">{{ t.to }}</text>
            <text class="tr__v">{{ money(t.amount) }}</text>
          </view>
          <text v-if="plan.transfers.length > TRANSFER_LIMIT" class="tip">
            …共 {{ plan.transfers.length }} 笔，只显示前 {{ TRANSFER_LIMIT }} 笔。
          </text>
        </view>
        <text v-else class="tip">{{ plan.notice }}</text>
        <PkRow label="转账笔数" :value="plan.count + ' 笔（' + plan.upperBound + ' 人的上限是 ' + plan.upperBound + ' 笔）'" :copy="false" stack />
        <PkRow label="是否撮平" :value="plan.settled ? '是，应收应付互相抵消' : '否，检查有没有人漏填垫付'" color="var(--pk-warn)" :copy="false" stack />
        <view class="list">
          <view v-for="(b, i) in visibleBalances" :key="i" class="list__r">
            <text class="list__n">{{ b.name }}</text>
            <text class="list__m" :class="{ 'list__m--in': b.balance >= 0 }">{{ b.text }}</text>
          </view>
          <text v-if="plan.balances.length > ITEM_LIMIT" class="tip">
            …共 {{ plan.balances.length }} 人，只显示前 {{ ITEM_LIMIT }} 人。
          </text>
        </view>
      </template>
      <PkRow
        v-else-if="plan"
        label="提示"
        value="当前没人填垫付金额：把「数字这一列」切到已垫付，并给掏钱的那个人填上实付数"
        color="var(--pk-warn)"
        :copy="false"
        stack
      />
    </PkCard>

    <PkCard title="含税与折扣的顺序对比" accent="var(--pk-warn)">
      <view v-for="(v, i) in compare.variants" :key="i" class="cmp">
        <text class="cmp__n">{{ v.name }}</text>
        <text class="cmp__o">{{ v.ops.join(' → ') }}</text>
        <text class="cmp__v">{{ money(v.final) }}</text>
      </view>
      <PkRow label="三种顺序是否一样" :value="compare.identical ? '一样' : '不一样，最大差 ' + money(compare.maxDiff)" :copy="false" stack />
      <text class="tip">{{ compare.notice }}</text>
    </PkCard>

    <PkCard title="发群文本" accent="var(--pk-accent)">
      <PkField v-model="title" label="这顿是什么" placeholder="周五聚餐" :maxlength="30" />
      <view v-if="groupText" class="out">
        <text class="out__t">{{ groupText }}</text>
      </view>
      <PkBtn v-if="groupText" text="复制，直接发群" kind="primary" block @tap="copyGroup" />
      <text v-else class="tip">{{ groupHint }}</text>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  parsePeople,
  allocate,
  splitShares,
  settle,
  splitText,
  priceChain,
  orderCompare,
  roundCents,
  roundModeName,
  currencyOf,
  moneyText,
  centsText,
  toCents,
  TIP_PRESETS,
  ROUND_UNITS,
  CURRENCIES,
  MAX_PEOPLE,
  MAX_AMOUNT,
} from '@/utils/splitbill'
import { copyText, toast } from '@/utils/clipboard'

const ITEM_LIMIT = 20
const TRANSFER_LIMIT = 20
const EDITOR_LIMIT = 30

const SAMPLE_TEXT = '我 680\n阿明\n小赵 x2\n小李 不参与'

const cur = ref('CNY')
const base = ref('680')
const taxRate = ref('0')
const discRate = ref('0')
const tipRate = ref('0')
const roundUnit = ref('1')
const roundMode = ref('down')
const numberAs = ref('paid')
const mode = ref('equal')
const paste = ref(SAMPLE_TEXT)
const title = ref('周五聚餐')
const parseNotice = ref('')

const people = ref(
  parsePeople(SAMPLE_TEXT, 'paid').rows.map((r) => ({ name: r.name, val: valOfRow(r, 'paid') }))
)
const visiblePeople = computed(() => people.value.slice(0, EDITOR_LIMIT))

function valOfRow(r, as) {
  if (!r.join) return '不参与'
  if (r.paid !== null) return String(r.paid)
  if (r.weight !== 1) return as === 'weight' ? String(r.weight) : 'x' + r.weight
  return ''
}

const curDef = computed(() => currencyOf(cur.value))
const curItems = CURRENCIES.map((c) => ({ key: c.key, name: c.symbol + ' ' + c.name }))
const unitItems = ROUND_UNITS.map((u) => ({ key: u.key, name: u.name }))
const modeItems = [
  { key: 'down', name: roundModeName('down') },
  { key: 'up', name: roundModeName('up') },
  { key: 'nearest', name: roundModeName('nearest') },
]
const asItems = [
  { key: 'paid', name: '已垫付的金额' },
  { key: 'weight', name: '摊的份数' },
]
const modeSegItems = [
  { key: 'weight', name: '按份数' },
  { key: 'equal', name: '完全均摊' },
  { key: 'paid', name: '各自消费+公共按人头' },
]

const MAX_AMOUNT_TEXT = Number(MAX_AMOUNT).toLocaleString('en-US')

const valPlaceholder = computed(() => (numberAs.value === 'paid' ? '垫付金额' : '份数，如 2'))

function money(cents) {
  return moneyText(cents, cur.value)
}

function num(s) {
  const n = Number(String(s === null || s === undefined ? '' : s).replace(/[,¥$€£\s]/g, ''))
  return isFinite(n) ? n : 0
}

const baseCents = computed(() => {
  try {
    return toCents(base.value)
  } catch (e) {
    return null
  }
})
const baseCentsText = computed(() => (baseCents.value === null ? '—' : baseCents.value + ' 分'))
const baseError = computed(() => {
  if (String(base.value).trim() === '') return '先把账单金额填上'
  try {
    toCents(base.value)
    return ''
  } catch (e) {
    return e.message
  }
})

function pickTip(t) {
  tipRate.value = String(t.rate)
}

const unitCents = computed(() => {
  const u = ROUND_UNITS.filter((x) => x.key === roundUnit.value)[0] || ROUND_UNITS[0]
  return toCents(u.value)
})

const chainOps = computed(() => {
  const ops = []
  if (num(discRate.value) > 0) ops.push({ kind: 'discount', v: num(discRate.value), label: '折扣' })
  if (num(taxRate.value) > 0) ops.push({ kind: 'tax', v: num(taxRate.value), label: '含税' })
  if (num(tipRate.value) > 0) ops.push({ kind: 'tip', v: num(tipRate.value), label: '小费' })
  ops.push({ kind: 'round', mode: roundMode.value, unitCents: unitCents.value, label: '抹零' })
  return ops
})

const chain = computed(() => {
  if (baseCents.value === null) return null
  try {
    return priceChain(baseCents.value, chainOps.value)
  } catch (e) {
    return null
  }
})
const chainError = computed(() => {
  if (baseCents.value === null) return baseError.value || '金额无法解析'
  return ''
})

const totalCents = computed(() => (chain.value ? chain.value.final : 0))

const rows = computed(() => {
  const out = []
  visiblePeople.value.forEach((p, i) => {
    const name = String(p.name || '').trim() || '第 ' + (i + 1) + ' 人'
    const txt = name + (String(p.val || '').trim() ? ' ' + String(p.val).trim() : '')
    try {
      const r = parsePeople(txt, numberAs.value).rows[0]
      if (r) out.push({ name: r.name, paid: r.paid, weight: r.weight, join: r.join })
    } catch (e) {
      out.push({ name, paid: null, weight: 1, join: true })
    }
  })
  return out
})

const shares = computed(() => {
  if (!rows.value.length || totalCents.value === 0) return null
  try {
    return splitShares(totalCents.value, rows.value, mode.value)
  } catch (e) {
    return null
  }
})
const splitError = computed(() => {
  if (!rows.value.length) return '先把参与人加上'
  if (baseCents.value === null) return baseError.value
  if (!totalCents.value) return '金额为 0，没什么可摊的'
  if (shares.value) return ''
  try {
    splitShares(totalCents.value, rows.value, mode.value)
    return ''
  } catch (e) {
    return e.message
  }
})

const allocCents = computed(() => {
  if (!shares.value || mode.value === 'paid') return []
  try {
    return allocate(totalCents.value, shares.value.items.filter((x) => x.join).map((x) => (mode.value === 'equal' ? 1 : x.weight || 1)))
  } catch (e) {
    return []
  }
})
const allocText = computed(() => {
  if (!shares.value) return '—'
  if (mode.value === 'paid') return '这一档是「各自消费额 + 公共部分按人头」，公共部分才用最大余数法，逐分数组不适用'
  if (!allocCents.value.length) return '—'
  const sum = allocCents.value.reduce((a, b) => a + b, 0)
  return (
    allocCents.value.map((c) => centsText(c)).join(' + ') +
    ' = ' + centsText(sum) + ' 元' + (sum === totalCents.value ? '，与总额相等' : '，与总额不等')
  )
})

const perHeadRounded = computed(() => {
  if (!shares.value) return null
  return roundCents(shares.value.perHead, roundMode.value, unitCents.value)
})
const perHeadRoundedText = computed(() => {
  if (perHeadRounded.value === null) return '—'
  const n = shares.value.headCount
  const back = perHeadRounded.value * n - totalCents.value
  return (
    money(perHeadRounded.value) + ' / 人（' + roundModeName(roundMode.value) + '到 ' + centsText(unitCents.value) +
    ' 元档），' + n + ' 人合计 ' + money(perHeadRounded.value * n) + '，与总额差 ' + money(back)
  )
})

const plan = computed(() => {
  if (!shares.value) return null
  try {
    return settle(shares.value.items.map((it) => ({
      name: it.name,
      paid: it.paid === null || it.paid === undefined ? null : safeCents(it.paid),
      share: it.share,
    })))
  } catch (e) {
    return null
  }
})
const settleError = computed(() => {
  if (!shares.value) return splitError.value || '先算出分摊结果'
  return plan.value ? '' : '撮平时出错，检查金额是否过大'
})

const compare = computed(() => {
  try {
    return orderCompare(baseCents.value === null ? 0 : baseCents.value, {
      taxRate: num(taxRate.value),
      discountRate: num(discRate.value),
      tipRate: num(tipRate.value),
      roundUnitCents: unitCents.value,
      roundMode: roundMode.value,
    })
  } catch (e) {
    return { variants: [], identical: false, maxDiff: 0, notice: '顺序对比算不出来：' + (e.message || '金额异常') }
  }
})

const groupText = computed(() => {
  if (!shares.value) return ''
  try {
    return splitText({
      cur: cur.value,
      title: title.value,
      chain: chain.value,
      total: totalCents.value,
      headCount: shares.value.headCount,
      items: shares.value.items,
    })
  } catch (e) {
    return ''
  }
})
const groupHint = computed(() => {
  if (!rows.value.length) return '先把参与人加上，再生成文本'
  return splitError.value || '金额与名单都齐了才能生成'
})

const hasPaid = computed(() => rows.value.some((r) => r.paid !== null))

const visibleShares = computed(() => (shares.value ? shares.value.items.slice(0, ITEM_LIMIT) : []))
const visibleTransfers = computed(() => (plan.value ? plan.value.transfers.slice(0, TRANSFER_LIMIT) : []))
const visibleBalances = computed(() => (plan.value ? plan.value.balances.slice(0, ITEM_LIMIT) : []))

function safeCents(yuan) {
  try {
    return toCents(yuan)
  } catch (e) {
    return null
  }
}

function rowTag(it) {
  if (!it.join) return ''
  if (numberAs.value === 'paid' && it.paid !== null) {
    const c = safeCents(it.paid)
    return c === null ? '垫付金额过大' : '已垫 ' + money(c)
  }
  if (mode.value === 'weight' && it.weight !== 1) return it.weight + ' 份'
  return ''
}

function doParse() {
  try {
    const r = parsePeople(paste.value, numberAs.value)
    if (!r.rows.length) {
      parseNotice.value = '名单是空的，一行写一个人'
      return
    }
    people.value = r.rows.map((x) => ({ name: x.name, val: valOfRow(x, numberAs.value) }))
    parseNotice.value = r.notice
  } catch (e) {
    parseNotice.value = e.message || '名单解析失败'
  }
}

function useSample() {
  paste.value = SAMPLE_TEXT
  base.value = '680'
  people.value = parsePeople(SAMPLE_TEXT, 'paid').rows.map((r) => ({ name: r.name, val: valOfRow(r, 'paid') }))
  parseNotice.value = ''
}

function addPerson() {
  if (people.value.length >= MAX_PEOPLE) {
    toast('一次最多 ' + MAX_PEOPLE + ' 人，请分次计算')
    return
  }
  people.value.push({ name: '', val: '' })
}

function removePerson(i) {
  if (i < 0 || i >= people.value.length) return
  people.value.splice(i, 1)
}

function fmtDelta(d) {
  return (d > 0 ? '+' : '−') + centsText(Math.abs(d))
}

function copyGroup() {
  copyText(groupText.value, '已复制，可直接发群')
}
</script>

<style scoped>
.tip {
  display: block;
  font-size: 22rpx;
  line-height: 1.8;
  color: var(--pk-text-3);
  padding: 10rpx 0 4rpx;
}
.sub {
  display: block;
  font-size: 24rpx;
  color: var(--pk-text-2);
  padding: 8rpx 0 10rpx;
}
.row2 {
  display: flex;
  gap: 18rpx;
}
.chips {
  display: flex;
  flex-wrap: wrap;
}
.chips__i {
  display: inline-block;
  font-size: 22rpx;
  color: var(--pk-accent);
  margin: 0 12rpx 10rpx 0;
  padding: 12rpx 20rpx;
  line-height: 1.3;
  border-radius: var(--pk-radius-sm);
  background: var(--pk-accent-soft);
}
.chips__i--on {
  color: var(--pk-on-accent);
  background: var(--pk-accent);
}
.act {
  display: flex;
  gap: 18rpx;
  padding: 6rpx 0 14rpx;
}
.chain {
  padding: 8rpx 0 4rpx;
}
.chain__r {
  display: flex;
  align-items: baseline;
  padding: 10rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.chain__k {
  font-size: 24rpx;
  color: var(--pk-text-2);
  width: 130rpx;
  flex-shrink: 0;
}
.chain__e {
  flex: 1;
  font-size: 22rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
}
.chain__v {
  font-size: 26rpx;
  color: var(--pk-text);
  font-family: Menlo, Consolas, monospace;
  margin-left: 12rpx;
}
.chain__d {
  font-size: 22rpx;
  color: var(--pk-accent);
  width: 140rpx;
  text-align: right;
}
.chain__d--n {
  color: var(--pk-danger);
}
.ppl {
  padding-top: 6rpx;
}
.ppl__row {
  display: flex;
  align-items: flex-start;
  gap: 10rpx;
}
.ppl__n {
  font-size: 22rpx;
  color: var(--pk-text-3);
  width: 34rpx;
  line-height: 84rpx;
}
.ppl__c {
  flex: 1.4;
  min-width: 0;
}
.ppl__c--v {
  flex: 1;
}
.ppl__x {
  font-size: 22rpx;
  color: var(--pk-danger);
  padding: 26rpx 10rpx;
  line-height: 1.2;
}
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 22rpx 24rpx 10rpx;
}
.hero__v {
  font-size: 52rpx;
  font-weight: 600;
  color: var(--pk-text);
  font-family: Menlo, Consolas, monospace;
}
.hero__k {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 10rpx;
}
.list {
  padding: 6rpx 24rpx 8rpx;
}
.list__r {
  display: flex;
  align-items: baseline;
  padding: 12rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.list__n {
  font-size: 26rpx;
  color: var(--pk-text);
  flex: 1;
  min-width: 0;
  word-break: break-all;
}
.list__m {
  font-size: 26rpx;
  color: var(--pk-text);
  font-family: Menlo, Consolas, monospace;
  margin-left: 12rpx;
}
.list__m--off {
  color: var(--pk-text-3);
}
.list__m--in {
  color: var(--pk-accent);
}
.list__p {
  font-size: 22rpx;
  color: var(--pk-text-3);
  width: 96rpx;
  text-align: right;
}
.list__x {
  font-size: 20rpx;
  color: var(--pk-text-3);
  width: 190rpx;
  text-align: right;
}
.tr {
  padding: 8rpx 24rpx 4rpx;
}
.tr__r {
  display: flex;
  align-items: center;
  padding: 14rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.tr__f,
.tr__t {
  font-size: 26rpx;
  color: var(--pk-text);
}
.tr__f {
  width: 160rpx;
}
.tr__t {
  width: 160rpx;
}
.tr__a {
  font-size: 26rpx;
  color: var(--pk-text-3);
  margin: 0 12rpx;
}
.tr__v {
  flex: 1;
  text-align: right;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--pk-accent);
  font-family: Menlo, Consolas, monospace;
}
.cmp {
  display: flex;
  align-items: baseline;
  padding: 16rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.cmp__n {
  font-size: 26rpx;
  color: var(--pk-text-2);
  width: 190rpx;
}
.cmp__o {
  flex: 1;
  font-size: 20rpx;
  color: var(--pk-text-3);
}
.cmp__v {
  font-size: 28rpx;
  color: var(--pk-text);
  font-family: Menlo, Consolas, monospace;
}
.out {
  margin: 6rpx 0 16rpx;
  padding: 20rpx 22rpx;
  border-radius: var(--pk-radius-md);
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line);
}
.out__t {
  font-size: 24rpx;
  line-height: 1.9;
  color: var(--pk-text-2);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
