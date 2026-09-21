<template>
  <view>
    <PkCard padded>
      <PkField v-model="text" type="textarea" :area-height="120" placeholder="输入要算校验和的内容（文本模式支持中文与 emoji）">
        <template #labelRight>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="text = ''">清空</text>
        </template>
      </PkField>

      <PkSeg v-model="mode" :items="MODES" />
      <text class="mode-note">{{ modeNote }}</text>

      <view class="quick-row">
        <text v-for="s in CHECKSUM_SAMPLES" :key="s.name" class="quick-i" @tap="loadSample(s)">{{ s.name }}</text>
      </view>

      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
      <PkRow v-else label="参与计算" :value="byteInfo" :copy="false" />
    </PkCard>

    <PkCard v-if="!error && rows.length" title="一次算全" accent="var(--pk-accent)">
      <view v-for="r in rows" :key="r.key" class="crow" @tap="detail = r.key">
        <view class="crow__main">
          <text class="crow__n">{{ r.name }}</text>
          <text class="crow__hex" :selectable="true">{{ groupHex(r.hex) }}</text>
        </view>
        <text class="crow__dec">{{ r.decText }}</text>
        <text class="crow__copy" @tap.stop="copyOne(r)">复制</text>
      </view>
    </PkCard>
    <PkCard v-else title="等待输入" accent="var(--pk-accent)">
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
      <PkEmpty v-else title="输入内容后一次算出六种校验和" desc="CRC-8 / CRC-16 / CRC-32 / Adler-32 / FNV-1a 32 与 64" />
    </PkCard>

    <PkCard v-if="!error && rows.length" title="算法参数详解" accent="#4A6FA5">
      <PkSeg v-model="detail" :items="CHECKSUM_ALGOS" />
      <view class="detail">
        <PkRow v-for="p in detailRows" :key="p.k" :label="p.k" :value="p.v" :mono="p.mono" :copy="false" :stack="p.stack" />
        <text class="detail__note">{{ detailAlgo.note }}</text>
        <text class="detail__use">常见于：{{ detailAlgo.use }}</text>
      </view>
    </PkCard>

    <PkCard title="实现自检（公开已知值）" accent="#3E7A4E">
      <template #extra>
        <text class="mini-act" @tap="runSelfTest">跑一遍自检</text>
      </template>
      <view v-for="v in testRows" :key="v.name" class="vrow">
        <text class="vrow__n">{{ v.name }}</text>
        <text class="vrow__r" :class="v.ok ? 'vrow__r--ok' : 'vrow__r--bad'">{{ v.text }}</text>
      </view>
      <PkRow v-if="testMsg" label="自检结果" :value="testMsg" :copy="false" />
      <PkRow
        v-else
        label="说明"
        value="「123456789」是 CRC 目录的通用测试串，各算法的 check 值写在 ISO/IEC 13239 里；Adler-32 与 FNV 的期望值取自 RFC 1950 与 FNV 参考实现。点右上角在本机逐条真跑"
        :copy="false"
        stack
      />
      <PkRow label="BigInt 支持" :value="supportsBigInt ? '可用，FNV-1a 64 走 BigInt 路径' : '不支持，已自动降级到双半字实现'" :copy="false" />
    </PkCard>

    <PkCard title="校验和 ≠ 哈希" accent="#8A6D3B">
      <view v-for="n in CHECKSUM_NOTES" :key="n.t" class="note">
        <text class="note__t">{{ n.t }}</text>
        <text class="note__d">{{ n.d }}</text>
      </view>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  CHECKSUM_ALGOS,
  CHECK_TEXT,
  CHECKSUM_SAMPLES,
  CHECKSUM_NOTES,
  readInput,
  checksumAll,
  checksum,
  groupHex,
  bigintHexToDec,
  supportsBigInt,
  selfTest,
} from '@/utils/checksum'
import { copyText, toast } from '@/utils/clipboard'

const MODES = [
  { key: 'utf8', name: '文本 UTF-8' },
  { key: 'hex', name: '十六进制字节' },
  { key: 'dec', name: '十进制字节' },
]
const MODE_NOTES = {
  utf8: '按 UTF-8 编码成字节：一个中文 3 字节、一个 emoji 4 字节。要复现设备上的值，用下面的字节模式贴原始数据。',
  hex: '空格 / 冒号 / 短横都行，例如 89 50 4E 47 0D 0A 1A 0A（PNG 文件头）。两个字符一个字节，个数必须是偶数。',
  dec: '十进制字节列表，空格或逗号分隔，每个 0~255，例如 72 101 107 101 110。',
}

const text = ref(CHECK_TEXT)
const mode = ref('utf8')
const detail = ref('crc32')
const testRows = ref([])
const testMsg = ref('')

const modeNote = computed(() => MODE_NOTES[mode.value] || '')

const parsed = computed(() => {
  if (!String(text.value).trim()) return { bytes: null, error: '' }
  try {
    return { bytes: readInput(text.value, mode.value), error: '' }
  } catch (e) {
    return { bytes: null, error: e.message }
  }
})
const error = computed(() => parsed.value.error)
const bytes = computed(() => parsed.value.bytes)

const byteInfo = computed(() => {
  const b = bytes.value
  if (!b) return '—'
  if (!b.length) return '0 字节（空输入也算得出来：CRC-32 为 00000000，Adler-32 为 00000001）'
  return b.length + ' 字节 · ' + text.value.trim()
})

const rows = computed(() => {
  const b = bytes.value
  if (!b) return []
  return checksumAll(text.value, mode.value).map((r) => ({
    key: r.key,
    name: r.name,
    hex: r.hex || '',
    ok: r.ok,
    error: r.error || '',
    decText: r.decStr || (r.dec === undefined ? '' : String(r.dec)),
  }))
})

const detailAlgo = computed(() => CHECKSUM_ALGOS.find((a) => a.key === detail.value) || CHECKSUM_ALGOS[0])

const detailRows = computed(() => {
  const a = detailAlgo.value
  const out = []
  const add = (k, v, mono, stack) => out.push({ k, v, mono: !!mono, stack: !!stack })
  add('位宽', a.width + ' 位')
  if (a.poly !== undefined) add('生成多项式', '0x' + a.poly.toString(16).toUpperCase(), true)
  if (a.init !== undefined) add('初值 init', '0x' + a.init.toString(16).toUpperCase().padStart(a.width / 4, '0'), true)
  if (a.refin !== undefined) add('输入反射 refin', a.refin ? '是（字节低位先进入）' : '否', false, true)
  if (a.refout !== undefined) add('输出反射 refout', a.refout ? '是（结果再整体翻转一次）' : '否', false, true)
  if (a.xorout !== undefined) add('末异或 xorout', '0x' + a.xorout.toString(16).toUpperCase(), true)
  if (a.check !== undefined) add('check 值', '算「' + CHECK_TEXT + '」应得 0x' + a.check.toString(16).toUpperCase(), false, true)
  if (a.residue !== undefined) add('residue 值', '0x' + a.residue.toString(16).toUpperCase(), true)
  let cur = rows.value.find((r) => r.key === a.key)
  if (!cur) {
    try {
      const one = checksum(a.key, bytes.value || new Uint8Array(0))
      cur = { hex: one.hex, decText: one.decStr || String(one.dec) }
    } catch (e) {
      cur = { hex: '—', decText: e.message }
    }
  }
  add('本机结果', groupHex(cur.hex), true)
  add('十进制', cur.decText || '—', true)
  if (cur.hex && cur.hex !== '—') add('二进制', hexToBin(cur.hex), false, true)
  return out
})

function hexToBin(hex) {
  const out = []
  const s = String(hex || '')
  for (let i = 0; i < s.length; i++) out.push(parseInt(s[i], 16).toString(2).padStart(4, '0'))
  return out.join(' ')
}

function loadSample(s) {
  text.value = s.text
  mode.value = s.mode
}

function copyOne(r) {
  if (!r.hex) {
    toast('没有结果可复制')
    return
  }
  copyText(r.hex, r.name + ' 已复制')
}

function paste() {
  uni.getClipboardData({
    success(res) {
      if (res.data) text.value = String(res.data)
      else toast('剪贴板是空的')
    },
    fail() {
      toast('读取失败')
    },
  })
}

function runSelfTest() {
  const st = selfTest()
  const bad = st.rows.filter((r) => !r.ok)
  testRows.value = (bad.length ? bad : st.rows).map((r) => ({
    name: r.name,
    ok: r.ok,
    text: r.ok ? '✓ ' + r.actual : '✗ 期望 ' + r.expected + '，实得 ' + r.actual,
  }))
  testMsg.value = st.passed + '/' + st.total + ' 条通过' + (bad.length ? '，' + bad.length + ' 条不符' : '')
  toast(bad.length ? '自检有 ' + bad.length + ' 条没过' : '内置自检 ' + st.passed + '/' + st.total + ' 全绿')
}
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 24rpx;
}
.mode-note {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.7;
  margin: -6rpx 0 6rpx;
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
  border-radius: var(--pk-radius-sm);
  background: var(--pk-accent-soft);
}
.crow {
  display: flex;
  align-items: center;
  padding: 18rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.crow:last-child {
  border-bottom: none;
}
.crow__main {
  flex: 1;
  min-width: 0;
}
.crow__n {
  display: block;
  font-size: 24rpx;
  color: var(--pk-text-2);
  margin-bottom: 6rpx;
}
.crow__hex {
  display: block;
  font-size: 26rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  letter-spacing: 1rpx;
  word-break: break-all;
}
.crow__dec {
  font-size: 22rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
  margin-right: 16rpx;
  flex-shrink: 0;
}
.crow__copy {
  font-size: 22rpx;
  color: var(--pk-text-2);
  padding: 10rpx 18rpx;
  border-radius: var(--pk-radius-sm);
  border: var(--pk-line-w) solid var(--pk-line-strong);
  flex-shrink: 0;
}
.detail {
  padding-bottom: 6rpx;
}
.detail__note {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.75;
  padding: 16rpx 24rpx 4rpx;
}
.detail__use {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-2);
  line-height: 1.75;
  padding: 0 24rpx 14rpx;
}
.vrow {
  display: flex;
  flex-direction: column;
  padding: 14rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.vrow:last-child {
  border-bottom: none;
}
.vrow__n {
  font-size: 24rpx;
  color: var(--pk-text-2);
  margin-bottom: 4rpx;
}
.vrow__r {
  font-size: 22rpx;
  font-family: Menlo, Consolas, monospace;
  word-break: break-all;
}
.vrow__r--ok {
  color: var(--pk-accent);
}
.vrow__r--bad {
  color: var(--pk-danger);
}
.note {
  padding: 18rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.note:last-child {
  border-bottom: none;
}
.note__t {
  display: block;
  font-size: 26rpx;
  color: var(--pk-text);
  font-weight: 600;
  margin-bottom: 8rpx;
}
.note__d {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.75;
}
</style>
