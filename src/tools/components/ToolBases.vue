<template>
  <view>
    <PkCard title="输入" accent="#4A6FA5">
      <PkSeg v-model="key" :items="ALPHABETS" />
      <view class="seg2">
        <PkSeg v-model="mode" :items="MODES" />
      </view>
      <view v-if="mode === 'encode'" class="seg2">
        <PkSeg v-model="srcKind" :items="SRC_KINDS" />
      </view>
      <PkField
        v-model="text"
        :placeholder="mode === 'encode' ? '要编码的内容（可中文、可 emoji）' : '把编码结果粘进来'"
        :area-height="220"
      />
      <view class="quick-row">
        <text v-for="s in BASES_SAMPLES" :key="s.name" class="quick-i" @tap="useSample(s)">{{ s.name }}</text>
      </view>
      <view v-if="isGroup && mode === 'encode'" class="opt-row" @tap="pad = !pad">
        <text class="opt-box" :class="{ 'opt-box--on': pad }">{{ pad ? '✓' : '' }}</text>
        <text class="opt-txt">末尾补 = 填充（关掉就是「裸」写法，适合塞进 URL）</text>
      </view>
      <PkRow v-if="error" label="输入问题" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard v-if="!error && current" title="结果" accent="var(--pk-accent)">
      <view class="hero">
        <text class="hero__val">{{ current.value }}</text>
      </view>
      <PkRow label="用的编码" :value="current.name" :copy="false" />
      <PkRow :label="mode === 'encode' ? '输入字节' : '解出字节'" :value="current.byteLen + ' 字节'" :copy="false" />
      <PkRow label="十六进制" :value="current.hex" mono />
      <PkRow v-if="mode === 'decode'" label="解出的文本" :value="current.textOk ? current.text : '不是合法 UTF-8，见十六进制'" :mono="current.textOk" :copy="current.textOk" :stack="true" />
      <view v-if="current.issues.length" class="issues">
        <text v-for="(i, n) in current.issues" :key="n" class="issue">· {{ i }}</text>
      </view>
      <view class="act-row">
        <PkBtn text="结果变输入" kind="soft" @tap="swap" />
        <PkBtn text="换方向" kind="ghost" @tap="flip" />
      </view>
    </PkCard>

    <PkCard v-if="!error" title="五种编码对照" accent="#3E7A4E">
      <text class="tip">同一段字节换字母表就长这样，能直观看出「编码长度 vs 数据量」的取舍：</text>
      <view class="cmp">
        <view v-for="r in compareRows" :key="r.key" class="cmp__row">
          <text class="cmp__name" :class="{ 'cmp__name--on': r.key === key }">{{ r.name }}</text>
          <text class="cmp__val">{{ r.value || '—' }}</text>
          <text class="cmp__len">{{ r.len }}</text>
        </view>
      </view>
      <text class="tip">Base32 比 Base64url 长一档（5 位一组 vs 6 位一组）；Base58/Base62 是大整数法，长度不固定、也不认填充。</text>
    </PkCard>

    <PkCard v-if="!error && mode === 'decode'" title="解码体检" accent="#8A6D3B">
      <PkRow
        label="重新编码是否等于输入"
        :value="current.matchesInput ? '等于 —— 这是一份完整、规范的写法' : '不等于 —— 有字符被跳过，或补位写法不标准'"
        :color="current.matchesInput ? 'var(--pk-accent)' : 'var(--pk-warn)'"
        :copy="false"
        stack
      />
      <view v-if="badCells.length" class="grid">
        <view v-for="c in badCells" :key="c.index" class="cell">
          <text class="cell__ch">{{ c.ch }}</text>
          <text class="cell__p">第 {{ c.index }} 个 / 第 {{ c.line }} 行</text>
        </view>
      </view>
      <text class="tip">
        {{
          badCells.length
            ? '上面这些字符不在 ' + current.name + ' 的字母表里，解码时被忽略。如果它们本该是数据，说明编码选错了或者串被截断过。'
            : '没发现字母表外的字符；若结果仍不对，八成是编码种类认错了（比如把 Base64 当 Base64url 粘进来）。'
        }}
      </text>
    </PkCard>

    <PkCard :title="alphaInfo.name + ' 字母表'" accent="#6B5B95">
      <text class="tip">{{ alphaInfo.note }}</text>
      <text class="tip">典型用途：{{ alphaInfo.use }}</text>
      <text v-if="block" class="tip">
        比特分组法：每 {{ block.bits }} 位一个字符，{{ block.chars }} 个字符正好装下 {{ block.bytes }} 字节，所以编码后长度约为原来的 {{ (block.chars / block.bytes).toFixed(2) }} 倍。
      </text>
      <text v-else class="tip">
        大整数法：整串字节当成一个 {{ alphaInfo.len }} 进制大数，从高位往低位写；前导零字节不在数值里，改用首字符「{{ alphaInfo.alphabet.charAt(0) }}」逐字节补上。
      </text>
      <view class="rows">
        <view v-for="r in alphaInfo.rows" :key="r.from" class="rows__line">
          <view v-for="c in r.cells" :key="c.index" class="alpha">
            <text class="alpha__ch">{{ c.ch }}</text>
            <text class="alpha__i">{{ c.index }}</text>
          </view>
        </view>
      </view>
    </PkCard>

    <PkCard title="原理与坑" accent="var(--pk-warn)">
      <PkRow v-for="n in BASES_NOTES" :key="n.t" :label="n.t" :value="n.d" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  ALPHABETS,
  BASES_NOTES,
  BASES_SAMPLES,
  encode,
  decode,
  encodeAll,
  alphabetRows,
  scanInvalid,
  hexToBytes,
} from '@/utils/bases'
import { copyText, toast } from '@/utils/clipboard'

const MODES = [
  { key: 'encode', name: '编码' },
  { key: 'decode', name: '解码' },
]
const SRC_KINDS = [
  { key: 'text', name: '输入是文本（按 UTF-8 取字节）' },
  { key: 'hex', name: '输入是十六进制字节' },
]

const key = ref('base32')
const mode = ref('encode')
const srcKind = ref('text')
const text = ref('Hello!')
const pad = ref(true)

const alpha = computed(() => ALPHABETS.filter((x) => x.key === key.value)[0] || ALPHABETS[0])
const isGroup = computed(() => !!alpha.value.bits)

/** 编码方向的字节来源；解码方向直接把输入当字符串 */
const source = computed(() => (srcKind.value === 'hex' ? hexToBytes(text.value) : String(text.value || '')))

const state = computed(() => {
  const raw = String(text.value || '')
  if (!raw.trim()) return { current: null, error: '' }
  try {
    if (mode.value === 'encode') {
      const value = encode(source.value, key.value, { pad: pad.value })
      const back = decode(value, key.value)
      return {
        current: {
          name: alpha.value.name,
          value,
          hex: back.hex,
          byteLen: back.byteLen,
          textOk: back.textOk,
          text: back.text,
          issues: back.issues,
          matchesInput: back.matchesInput,
        },
        error: '',
      }
    }
    const r = decode(raw, key.value, { pad: pad.value })
    return {
      current: {
        name: alpha.value.name,
        value: r.reencoded,
        hex: r.hex,
        byteLen: r.byteLen,
        textOk: r.textOk,
        text: r.text,
        issues: r.issues,
        matchesInput: r.matchesInput,
      },
      error: '',
    }
  } catch (e) {
    return { current: null, error: e.message }
  }
})
const current = computed(() => state.value.current)
const error = computed(() => state.value.error)

/** 五种字母表同时编一遍，供对照 */
const compareRows = computed(() => {
  try {
    const bytes = mode.value === 'decode' ? decode(String(text.value || ''), key.value).bytes : source.value
    return encodeAll(bytes).map((x) => ({ key: x.key, name: x.name, value: x.value, len: x.len }))
  } catch (e) {
    return []
  }
})

const alphaInfo = computed(() => alphabetRows(key.value))
const block = computed(() => {
  const bits = alphaInfo.value.bits
  if (!bits) return null
  const chars = 8 / gcd(8, bits)
  return { bits, chars, bytes: (chars * bits) / 8 }
})
function gcd(a, b) {
  return b ? gcd(b, a % b) : a
}

const badCells = computed(() => {
  try {
    if (mode.value !== 'decode') return []
    return scanInvalid(String(text.value || ''), key.value).bad.slice(0, 24)
  } catch (e) {
    return []
  }
})

function useSample(s) {
  mode.value = 'encode'
  srcKind.value = s.hex ? 'hex' : 'text'
  text.value = s.hex || s.text
}

/** 把结果搬到输入框，方向不变：方便连续操作 */
function swap() {
  if (!current.value) return
  copyText(current.value.value)
  toast('结果已复制')
}

function flip() {
  if (!current.value) return
  text.value = current.value.value
  mode.value = mode.value === 'encode' ? 'decode' : 'encode'
  if (mode.value === 'decode') srcKind.value = 'text'
}
</script>

<style scoped>
.seg2 {
  margin-top: 10rpx;
}
.quick-row {
  display: flex;
  flex-wrap: wrap;
  margin-top: 4rpx;
}
.quick-i {
  display: inline-block;
  font-size: 22rpx;
  color: var(--pk-accent);
  margin: 8rpx 14rpx 0 0;
  padding: 12rpx 20rpx;
  line-height: 1.3;
  border-radius: 10rpx;
  background: var(--pk-accent-soft);
}
.opt-row {
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx 6rpx;
}
.opt-box {
  width: 40rpx;
  height: 40rpx;
  line-height: 40rpx;
  text-align: center;
  font-size: 24rpx;
  border-radius: 8rpx;
  border: var(--pk-line-w) solid var(--pk-line-strong);
  color: var(--pk-accent);
  margin-right: 16rpx;
}
.opt-box--on {
  background: var(--pk-accent-soft);
  border-color: var(--pk-accent);
}
.opt-txt {
  flex: 1;
  font-size: 22rpx;
  line-height: 1.6;
  color: var(--pk-text-2);
}
.hero {
  padding: 20rpx 24rpx 12rpx;
}
.hero__val {
  font-size: 27rpx;
  font-weight: 600;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-accent);
  word-break: break-all;
  line-height: 1.7;
}
.issues {
  padding: 6rpx 24rpx 12rpx;
}
.issue {
  display: block;
  font-size: 22rpx;
  line-height: 1.75;
  color: var(--pk-warn);
}
.act-row {
  display: flex;
  gap: 20rpx;
  padding: 10rpx 24rpx 16rpx;
}
.tip {
  display: block;
  padding: 8rpx 24rpx;
  font-size: 21rpx;
  line-height: 1.8;
  color: var(--pk-text-3);
}
.cmp {
  padding: 4rpx 24rpx 10rpx;
}
.cmp__row {
  display: flex;
  align-items: flex-start;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
  padding: 12rpx 0;
}
.cmp__name {
  width: 180rpx;
  font-size: 22rpx;
  color: var(--pk-text-3);
}
.cmp__name--on {
  color: var(--pk-accent);
  font-weight: 600;
}
.cmp__val {
  flex: 1;
  font-size: 22rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  word-break: break-all;
  line-height: 1.6;
}
.cmp__len {
  width: 70rpx;
  text-align: right;
  font-size: 20rpx;
  color: var(--pk-text-3);
}
.grid {
  display: flex;
  flex-wrap: wrap;
  padding: 10rpx 18rpx 6rpx;
}
.cell {
  min-width: 140rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 6rpx;
  padding: 12rpx 10rpx;
  border-radius: 12rpx;
  background: var(--pk-danger-soft);
}
.cell__ch {
  font-size: 30rpx;
  font-weight: 600;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-danger);
}
.cell__p {
  font-size: 18rpx;
  color: var(--pk-text-3);
  margin-top: 4rpx;
}
.rows {
  padding: 8rpx 24rpx 20rpx;
}
.rows__line {
  display: flex;
  flex-wrap: wrap;
}
.alpha {
  width: 74rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 4rpx 0;
}
.alpha__ch {
  font-size: 26rpx;
  font-weight: 600;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
}
.alpha__i {
  font-size: 18rpx;
  color: var(--pk-text-3);
}
</style>
