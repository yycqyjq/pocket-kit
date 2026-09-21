<template>
  <view>
    <!-- ---------- 输入 ---------- -->
    <PkCard title="操作数" accent="#2F7A8C">
      <PkField v-model="a" :maxlength="80" label="操作数 A（可写 0x / 0b / 0o / 十进制 / 负数）" placeholder="例如 0xF0">
        <template #labelRight>
          <text class="mini-act" @tap="a = ''">清空</text>
        </template>
      </PkField>
      <PkField v-model="b" :maxlength="80" label="操作数 B（移位时它是移位数）" placeholder="例如 0x0F">
        <template #labelRight>
          <text class="mini-act" @tap="b = ''">清空</text>
        </template>
      </PkField>

      <view class="seg-label">
        <text class="seg-label__t">位宽</text>
        <text v-if="!bigintOk" class="seg-label__warn">当前环境无 BigInt，已隐藏 64 位</text>
      </view>
      <PkSeg v-model="width" :items="widthItems" />

      <view class="quick-row">
        <text
          v-for="q in quick"
          :key="q.v"
          class="quick"
          hover-class="quick--hover"
          @tap="applyQuick(q.v)"
          >{{ q.n }}</text
        >
      </view>

      <PkRow v-for="(e, i) in errors" :key="i" label="提示" :value="e" color="var(--pk-danger)" :copy="false" stack />
      <PkRow v-if="wrapNote" label="回绕说明" :value="wrapNote" color="var(--pk-warn)" :copy="false" stack />
    </PkCard>

    <!-- ---------- 逐位网格 ---------- -->
    <PkCard title="逐位网格（点一位就地翻转）" accent="#2F7A8C">
      <template #extra>
        <text class="mini-act" @tap="copyBits">复制位串</text>
      </template>
      <PkSeg v-model="gridTarget" :items="operandItems" />
      <view class="grid">
        <view v-for="(row, ri) in gridRows" :key="ri" class="grid-row">
          <view v-for="(group, gi) in row" :key="gi" class="grid-group">
            <view
              v-for="cell in group"
              :key="cell.pos"
              class="bit"
              :class="{ 'bit--on': cell.bit, 'bit--sign': cell.pos === 0 }"
              hover-class="bit--hover"
              @tap="flip(cell.pos)"
            >
              <text class="bit__v">{{ cell.bit }}</text>
              <text class="bit__i">{{ cell.index }}</text>
            </view>
          </view>
        </view>
      </view>
      <text class="grid-hint">一行 8 位、每 4 位一组；最左是最高位（位号 {{ width - 1 }}），底色最深的那格是符号位。</text>
      <PkRow :label="gridTarget === 'a' ? 'A · 十六进制' : 'B · 十六进制'" :value="shown.hex" mono :copy="true" />
      <PkRow label="无符号十进制" :value="shown.unsigned" mono />
      <PkRow label="有符号十进制" :value="shown.signed" mono />
      <PkRow label="按字节" :value="shown.bytes" mono />
    </PkCard>

    <!-- ---------- 运算结果 ---------- -->
    <PkCard v-for="grp in groups" :key="grp.key" :title="grp.title" accent="#2F7A8C">
      <template #extra>
        <text class="mini-act" @tap="copyGroup(grp)">复制本组</text>
      </template>
      <view v-for="r in grp.rows" :key="r.key" class="op">
        <view class="op-top">
          <text class="op-name">{{ r.name }}</text>
          <text class="op-expr">{{ r.expr }}</text>
        </view>
        <view class="op-vals" @tap="copyText(r.hex + '  ' + r.unsigned + ' / ' + r.signed, '已复制 ' + r.name)">
          <text class="op-hex">{{ r.hex }}</text>
          <text class="op-dec">无符号 {{ r.unsigned }}</text>
          <text class="op-dec">有符号 {{ r.signed }}</text>
        </view>
        <text class="op-bin">{{ r.binGrouped }}</text>
        <text class="op-note">{{ r.note }}{{ r.shiftNote ? '｜' + r.shiftNote : '' }}</text>
      </view>
      <PkEmpty v-if="!grp.rows.length" title="等着输入" desc="两个操作数都合法时这里会列出结果。" />
    </PkCard>

    <!-- ---------- 补码过程 ---------- -->
    <PkCard title="原码 / 反码 / 补码" accent="#4A6FA5">
      <PkSeg v-model="twosTarget" :items="operandItems" />
      <template v-if="twos">
        <PkRow label="读数" :value="twos.input + '  →  有符号 ' + twos.signed + ' / 无符号 ' + twos.unsigned" mono :copy="false" />
        <view v-for="(s, i) in twos.steps" :key="s.k" class="step">
          <text class="step__k">{{ s.k }}</text>
          <view class="step__main">
            <text class="step__v">{{ s.v }}</text>
            <text class="step__note">{{ s.note }}</text>
          </view>
          <text class="step__ord">{{ i + 1 }}</text>
        </view>
        <text class="twos-note">{{ twos.signMeaning }}；{{ twos.note }}</text>
        <PkRow label="该位宽取值范围" :value="twos.range.signed + ' ／ 无符号 ' + twos.range.unsigned" :copy="false" />
      </template>
      <PkEmpty v-else title="暂时算不了" desc="先把这个操作数写成一个整数。" />
    </PkCard>

    <!-- ---------- 掩码与位段 ---------- -->
    <PkCard title="掩码与位段抽取" accent="#8A6D3B">
      <view class="field-pair">
        <PkField v-model="maskN" :maxlength="3" label="低 n 位掩码 n" placeholder="4" />
      </view>
      <view class="field-pair">
        <PkField v-model="hi" :maxlength="3" label="位段高位号 high" placeholder="7" />
        <PkField v-model="lo" :maxlength="3" label="位段低位号 low" placeholder="4" />
      </view>
      <PkRow v-if="maskErr" label="提示" :value="maskErr" color="var(--pk-danger)" :copy="false" stack />
      <template v-if="lowMask">
        <PkRow label="maskOf(n) 十六进制" :value="lowMask.hex" mono />
        <PkRow label="maskOf(n) 二进制" :value="lowMask.binGrouped" mono />
        <PkRow label="含义" :value="lowMask.note" :copy="false" stack />
      </template>
      <template v-if="rangeMask">
        <PkRow label="maskBits(high, low)" :value="rangeMask.hex" mono />
        <PkRow label="位段二进制" :value="rangeMask.binGrouped" mono />
      </template>
      <PkSeg v-model="extractTarget" :items="operandItems" />
      <template v-if="cut">
        <PkRow label="抽取来源" :value="extractTarget.toUpperCase() + ' = ' + cut.sourceHex" mono :copy="false" />
        <PkRow label="抽出的值" :value="cut.unsigned + '（有符号 ' + cut.signed + '，' + cut.hex + '）'" mono />
        <PkRow label="段内位串" :value="cut.binGrouped" mono />
        <PkRow label="等价写法" :value="cut.note" :copy="false" stack />
      </template>
    </PkCard>

    <!-- ---------- 位特征 ---------- -->
    <PkCard title="位特征速读" accent="#6B5B95">
      <template v-if="profile">
        <view class="stat-grid">
          <view v-for="p in profileCells" :key="p.k" class="stat-cell">
            <text class="stat-cell__v">{{ p.v }}</text>
            <text class="stat-cell__k">{{ p.k }}</text>
          </view>
        </view>
        <PkRow label="含义" :value="profile.note" :copy="false" stack />
      </template>
      <PkEmpty v-else title="暂时算不了" desc="操作数 A 合法后这里给出置位数、前后导零等信息。" />
    </PkCard>

    <!-- ---------- 常用位模式 ---------- -->
    <PkCard title="常用位模式速查" accent="var(--pk-accent)">
      <view v-for="(c, i) in cheatsheet" :key="i" class="cheat" @tap="copyText(c.hex + ' ' + c.bin, '已复制')">
        <text class="cheat__name">{{ c.name }}</text>
        <view class="cheat__main">
          <text class="cheat__hex">{{ c.hex }}</text>
          <text class="cheat__bin">{{ c.bin }}</text>
          <text class="cheat__note">{{ c.note }}</text>
        </view>
      </view>
    </PkCard>

    <!-- ---------- 内置对照 ---------- -->
    <PkCard title="与已知答案对照" accent="var(--pk-accent)">
      <view v-for="(r, i) in checks" :key="i" class="check">
        <text class="check__mark" :class="{ 'check__mark--bad': !r.pass }">{{ r.pass ? '✓' : '✕' }}</text>
        <view class="check__main">
          <text class="check__name">{{ r.name }}</text>
          <text class="check__val">算得 {{ r.got }} · 应为 {{ r.want }}</text>
        </view>
      </view>
      <text class="check-sum">{{ checkPassed }} / {{ checks.length }} 通过</text>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { copyText, toast } from '@/utils/clipboard'
import {
  BIGINT_OK,
  WIDTH_OPTIONS,
  supportsWidth,
  parseValue,
  fromBits,
  flipBit,
  bitIndexOf,
  ops,
  twosComplement,
  maskBits,
  maskOf,
  extract,
  bitProfile,
  CHEATSHEET,
  selfCheck,
} from '@/utils/bitwise'

const bigintOk = BIGINT_OK
const widthItems = WIDTH_OPTIONS.filter(function (o) {
  return supportsWidth(o.key)
})
const cheatsheet = CHEATSHEET
const quick = [
  { n: 'A=0xFF', v: '0xFF' },
  { n: 'A=0x00', v: '0x00' },
  { n: 'A=0x55', v: '0x55' },
  { n: 'A=0xAA', v: '0xAA' },
  { n: 'A=-1', v: '-1' },
  { n: 'A=0x0F', v: '0x0F' },
  { n: 'B=1', v: '@1' },
  { n: 'B=8', v: '@8' },
]

const operandItems = [
  { key: 'a', name: '操作数 A' },
  { key: 'b', name: '操作数 B' },
]

const a = ref('0xF0')
const b = ref('0x0F')
const width = ref(8)
const gridTarget = ref('a')
const twosTarget = ref('a')
const extractTarget = ref('a')
const maskN = ref('4')
const hi = ref('7')
const lo = ref('4')

/* 位宽换小之后大值会被回绕，这里顺手把两个操作数按新位宽重写成无符号十进制，读数与输入不脱节 */
watch(width, function () {
  const av = safeParse(a.value)
  if (av) a.value = av.unsigned
  const bv = safeParse(b.value)
  if (bv) b.value = bv.unsigned
})

function safeParse(input) {
  try {
    return parseValue(input, width.value)
  } catch (e) {
    return null
  }
}
function parseError(input) {
  try {
    parseValue(input, width.value)
    return ''
  } catch (e) {
    return e.message || '输入不合法'
  }
}

const aInfo = computed(() => safeParse(a.value))
const bInfo = computed(() => safeParse(b.value))
const errors = computed(() => {
  const out = []
  const ae = parseError(a.value)
  const be = parseError(b.value)
  if (ae) out.push('A：' + ae)
  if (be) out.push('B：' + be)
  return out
})
const wrapNote = computed(() => {
  const notes = []
  if (aInfo.value && aInfo.value.note) notes.push('A ' + aInfo.value.note)
  if (bInfo.value && bInfo.value.note) notes.push('B ' + bInfo.value.note)
  return notes.join('；')
})

/* ---- 网格 ---- */
function zeroBits() {
  const out = []
  for (let i = 0; i < width.value; i++) out.push(0)
  return out
}
const EMPTY_SHOWN = { bits: [], hex: '—', unsigned: '—', signed: '—', bytes: '—' }
const shown = computed(() => {
  const info = gridTarget.value === 'a' ? aInfo.value : bInfo.value
  return info || EMPTY_SHOWN
})
const gridRows = computed(() => {
  const bits = shown.value.bits.length ? shown.value.bits : zeroBits()
  const rows = []
  for (let i = 0; i < bits.length; i += 8) {
    const row = []
    for (let k = i; k < Math.min(i + 8, bits.length); k += 4) {
      const group = []
      for (let j = k; j < Math.min(k + 4, bits.length); j++) {
        group.push({ pos: j, bit: bits[j], index: bitIndexOf(width.value, j) })
      }
      row.push(group)
    }
    rows.push(row)
  }
  return rows
})
function flip(pos) {
  const bits = shown.value.bits.length ? shown.value.bits : zeroBits()
  let next
  try {
    next = flipBit(bits, pos)
  } catch (e) {
    toast(e.message || '翻转失败')
    return
  }
  const dec = fromBits(next, width.value)
  if (gridTarget.value === 'a') a.value = dec
  else b.value = dec
}
function copyBits() {
  copyText((shown.value.bits || []).join(''), '已复制位串')
}

/* ---- 运算表 ---- */
const opsRows = computed(() => {
  if (!aInfo.value || !bInfo.value) return []
  try {
    return ops(a.value, b.value, width.value)
  } catch (e) {
    return []
  }
})
const groups = computed(() => {
  const rows = opsRows.value
  return [
    { key: 'logic', title: '逻辑运算（' + width.value + ' 位）', rows: rows.filter((r) => r.group === 'logic') },
    { key: 'shift', title: '移位与循环移位（B 当移位数）', rows: rows.filter((r) => r.group === 'shift') },
  ]
})
function copyGroup(grp) {
  if (!grp.rows.length) {
    toast('还没有结果')
    return
  }
  copyText(
    grp.rows
      .map(function (r) {
        return r.name + ' ' + r.expr + ' = ' + r.hex + '  (无符号 ' + r.unsigned + ' / 有符号 ' + r.signed + ')  ' + r.binGrouped
      })
      .join('\n'),
    '已复制 ' + grp.title
  )
}

/* ---- 补码 ---- */
const twosInput = computed(() => (twosTarget.value === 'a' ? a.value : b.value))
const twos = computed(() => {
  if (!safeParse(twosInput.value)) return null
  try {
    return twosComplement(twosInput.value, width.value)
  } catch (e) {
    return null
  }
})

/* ---- 掩码与位段 ---- */
const lowMask = computed(() => {
  try {
    return maskOf(maskN.value === '' ? 0 : Number(maskN.value), width.value)
  } catch (e) {
    return null
  }
})
const rangeMask = computed(() => {
  try {
    return maskBits(hi.value, lo.value, width.value)
  } catch (e) {
    return null
  }
})
const maskErr = computed(() => {
  const out = []
  if (!lowMask.value) out.push('低 n 位掩码：' + nHint(maskN.value))
  if (!rangeMask.value) out.push('位段掩码：位号得是 0 ~ ' + (width.value - 1) + ' 的整数，且 high ≥ low')
  return out.join('；')
})
function nHint(v) {
  const k = Number(v)
  if (v === '' || !isFinite(k) || k !== Math.floor(k)) return 'n 得是整数'
  if (k < 0) return 'n 不能为负'
  if (k > width.value) return '位宽 ' + width.value + ' 位放不下 ' + k + ' 位掩码'
  return 'n 得是整数'
}
const extractInput = computed(() => {
  const input = extractTarget.value === 'a' ? a.value : b.value
  return safeParse(input) ? input : ''
})
const cut = computed(() => {
  if (!extractInput.value) return null
  try {
    return extract(extractInput.value, hi.value, lo.value, width.value)
  } catch (e) {
    return null
  }
})

/* ---- 位特征 ---- */
const profile = computed(() => {
  if (!aInfo.value) return null
  try {
    return bitProfile(a.value, width.value)
  } catch (e) {
    return null
  }
})
const profileCells = computed(() => {
  const p = profile.value
  if (!p) return []
  return [
    { k: '置位 1', v: p.popcount },
    { k: '清零 0', v: p.zeros },
    { k: '前导零', v: p.clz },
    { k: '尾随零', v: p.ctz },
    { k: '最低置位', v: p.lowestSet },
    { k: '最高置位', v: p.highestSet },
    { k: '有效位长', v: p.bitLength },
    { k: '奇偶校验', v: p.parity },
  ]
})

/* ---- 内置对照 ---- */
const checks = computed(() => selfCheck())
const checkPassed = computed(() => checks.value.filter((r) => r.pass).length)

function applyQuick(v) {
  if (v.charAt(0) === '@') b.value = v.slice(1)
  else a.value = v.slice(2)
}

</script>

<style scoped>
.mini-act {
  font-size: 23rpx;
  color: var(--pk-accent);
  margin-left: 24rpx;
}
.seg-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 12rpx 0 10rpx;
}
.seg-label__t {
  font-size: 24rpx;
  color: var(--pk-text-2);
}
.seg-label__warn {
  font-size: 21rpx;
  color: var(--pk-warn);
}
.quick-row {
  display: flex;
  flex-wrap: wrap;
  margin: 10rpx 0 4rpx;
}
.quick {
  font-size: 22rpx;
  color: var(--pk-text-2);
  background: var(--pk-seg-bg);
  border: var(--pk-line-w) solid var(--pk-line);
  border-radius: 999rpx;
  padding: 8rpx 18rpx;
  margin: 6rpx 10rpx 6rpx 0;
}
.quick--hover {
  opacity: 0.6;
}

/* ---------- 位网格 ---------- */
.grid {
  display: flex;
  flex-direction: column;
  margin: 8rpx 0 4rpx;
}
.grid-row {
  display: flex;
  flex-direction: row;
  margin-bottom: 10rpx;
}
.grid-group {
  display: flex;
  flex-direction: row;
  margin-right: 18rpx;
}
.bit {
  width: 72rpx;
  margin-right: 6rpx;
  border-radius: 10rpx;
  background: var(--pk-bg-soft);
  border: var(--pk-line-w) solid var(--pk-line);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8rpx 0 4rpx;
}
.bit--on {
  background: var(--pk-accent-soft);
  border-color: var(--pk-accent);
}
.bit--sign {
  border-width: 2rpx;
  border-color: var(--pk-line-strong);
}
.bit--hover {
  opacity: 0.65;
}
.bit__v {
  font-size: 30rpx;
  line-height: 1.1;
  color: var(--pk-text);
  font-weight: 600;
}
.bit__i {
  font-size: 18rpx;
  color: var(--pk-text-3);
  margin-top: 2rpx;
}
.grid-hint {
  display: block;
  font-size: 21rpx;
  color: var(--pk-text-3);
  margin: 4rpx 24rpx 14rpx;
}

/* ---------- 运算表 ---------- */
.op {
  padding: 14rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.op-top {
  display: flex;
  align-items: baseline;
}
.op-name {
  font-size: 25rpx;
  color: var(--pk-text);
  font-weight: 600;
  margin-right: 14rpx;
}
.op-expr {
  font-size: 21rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
}
.op-vals {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  margin-top: 6rpx;
}
.op-hex {
  font-size: 25rpx;
  color: var(--pk-accent);
  font-family: Menlo, Consolas, monospace;
  margin-right: 20rpx;
}
.op-dec {
  font-size: 22rpx;
  color: var(--pk-text-2);
  margin-right: 20rpx;
}
.op-bin {
  display: block;
  font-size: 21rpx;
  color: var(--pk-text-2);
  font-family: Menlo, Consolas, monospace;
  margin-top: 4rpx;
  word-break: break-all;
}
.op-note {
  display: block;
  font-size: 20rpx;
  color: var(--pk-text-3);
  margin-top: 4rpx;
}

/* ---------- 补码 ---------- */
.step {
  display: flex;
  align-items: flex-start;
  padding: 12rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.step__ord {
  font-size: 20rpx;
  color: var(--pk-text-3);
  margin-left: 12rpx;
}
.step__k {
  flex: none;
  width: 96rpx;
  font-size: 24rpx;
  color: var(--pk-text-2);
  margin-right: 16rpx;
}
.step__main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.step__v {
  font-size: 25rpx;
  color: var(--pk-text);
  font-family: Menlo, Consolas, monospace;
}
.step__note {
  font-size: 20rpx;
  color: var(--pk-text-3);
  margin-top: 4rpx;
}
.twos-note {
  display: block;
  font-size: 21rpx;
  color: var(--pk-text-2);
  margin: 12rpx 24rpx 4rpx;
}

/* ---------- 掩码 ---------- */
.field-pair {
  display: flex;
  gap: 16rpx;
}
.field-pair > view {
  flex: 1;
}

/* ---------- 位特征 ---------- */
.stat-grid {
  display: flex;
  flex-wrap: wrap;
  padding: 4rpx 12rpx 12rpx;
}
.stat-cell {
  width: 25%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14rpx 0;
}
.stat-cell__v {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--pk-text);
  line-height: 1.2;
}
.stat-cell__k {
  font-size: 21rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
}

/* ---------- 速查 ---------- */
.cheat {
  display: flex;
  align-items: flex-start;
  padding: 12rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.cheat__name {
  flex: none;
  width: 168rpx;
  font-size: 23rpx;
  color: var(--pk-text-2);
  margin-right: 16rpx;
}
.cheat__main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.cheat__hex {
  font-size: 24rpx;
  color: var(--pk-text);
  font-family: Menlo, Consolas, monospace;
}
.cheat__bin {
  font-size: 22rpx;
  color: var(--pk-accent);
  font-family: Menlo, Consolas, monospace;
}
.cheat__note {
  font-size: 20rpx;
  color: var(--pk-text-3);
  margin-top: 4rpx;
}

/* ---------- 自查 ---------- */
.check {
  display: flex;
  align-items: flex-start;
  padding: 10rpx 24rpx;
}
.check__mark {
  flex: none;
  width: 40rpx;
  font-size: 26rpx;
  color: var(--pk-accent);
}
.check__mark--bad {
  color: var(--pk-danger);
}
.check__main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.check__name {
  font-size: 23rpx;
  color: var(--pk-text);
}
.check__val {
  font-size: 20rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
}
.check-sum {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-2);
  margin: 8rpx 24rpx 12rpx;
}
</style>
