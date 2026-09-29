<template>
  <view>
    <PkCard title="做什么" accent="#4A6FA5">
      <PkSeg v-model="op" :items="opItems" />
      <PkSeg v-model="algo" :items="algoItems" />
      <PkSeg v-model="mode" :items="modeItems" />
      <PkRow label="模式说明" :value="modeNote" :copy="false" stack />
    </PkCard>

    <PkCard title="密钥" accent="#5B6B8C">
      <PkSeg v-model="keyType" :items="keyTypeItems" />
      <template v-if="keyType === 'pass'">
        <PkField v-model="pass" :password="!passVisible" label="口令" placeholder="输入一段只有你和对方知道的口令">
          <template #labelRight>
            <text class="mini-act" @tap="passVisible = !passVisible">{{ passVisible ? '隐藏' : '显示' }}</text>
          </template>
        </PkField>
        <view class="field-line">
          <text class="field-line__k">派生哈希</text>
          <view class="chip-row">
            <text
              v-for="h in hashes"
              :key="h"
              class="chip"
              :class="{ 'chip--on': hash === h }"
              @tap="hash = h"
            >{{ h }}</text>
          </view>
        </view>
        <PkField v-model="iterations" type="number" label="派生轮数（1—200000，默认 5000）" placeholder="5000" />
        <PkField v-model="saltHex" label="盐（十六进制，可空）" placeholder="留空则每次随机">
          <template #labelRight>
            <text class="mini-act" @tap="rollSalt">随机一撮</text>
            <text class="mini-act" @tap="saltHex = ''">清空</text>
          </template>
        </PkField>
        <PkRow
          label="注意"
          value="口令派生是本工具自写的迭代哈希，不是 PBKDF2，也不是 OpenSSL 的 EVP_BytesToKey——密文不能和别的软件互解"
          :copy="false"
          stack
        />
      </template>
      <template v-else>
        <PkField v-model="keyHex" label="十六进制密钥" :placeholder="'AES 需要 ' + keyChars + ' 个字符（' + keyBytes + ' 字节）'" />
        <PkRow label="长度" :value="keyHexCharsIn + ' / ' + keyChars + ' 个字符'" :copy="false" />
        <PkRow label="互通" value="要和 OpenSSL / Java / Python 互解，就把对方导出的密钥原样粘进来（顺序、大小写都不挑）" :copy="false" stack />
      </template>
    </PkCard>

    <PkCard v-if="mode === 'cbc'" title="IV（初始向量）" accent="#8A6D3B">
      <PkField v-model="iv" :label="op === 'enc' ? 'IV（32 个十六进制字符）' : '加密时用的那个 IV（必填）'" placeholder="000102030405060708090a0b0c0d0e0f">
        <template #labelRight>
          <text v-if="op === 'enc'" class="mini-act" @tap="rollIv">随机一个</text>
          <text class="mini-act" @tap="iv = ''">清空</text>
        </template>
      </PkField>
      <PkSwitchRow
        v-if="op === 'enc'"
        v-model="ivAuto"
        title="每次随机 IV"
        desc="IV 不必保密，但每次随机才能让同一段明文得到不同密文；记得把结果里的 IV 和密文一起存"
      />
      <PkRow
        v-else
        label="解密为什么必须给 IV"
        value="CBC 的首块要拿 IV 异或回来。IV 猜不出来也不许留空——填错了不会报错，只会把前 16 字节悄悄解成乱码"
        :copy="false"
        stack
      />
    </PkCard>

    <PkCard padded :title="op === 'enc' ? '明文' : '密文'" accent="var(--pk-accent)">
      <template v-if="op === 'enc'">
        <view class="chip-row chip-row--top">
          <text
            v-for="s in AES_SAMPLES"
            :key="s.name"
            class="chip"
            @tap="loadSample(s.text)"
          >{{ s.name }}</text>
        </view>
        <view class="field-line">
          <text class="field-line__k">明文按什么读</text>
          <view class="chip-row">
            <text class="chip" :class="{ 'chip--on': inputType === 'text' }" @tap="inputType = 'text'">UTF-8 文本</text>
            <text class="chip" :class="{ 'chip--on': inputType === 'hex' }" @tap="inputType = 'hex'">十六进制</text>
          </view>
        </view>
        <PkField v-model="input" type="textarea" :area-height="140" :maxlength="50000" placeholder="要加密的内容（支持中文与 emoji）">
          <template #labelRight>
            <text class="mini-act" @tap="paste">读取剪贴板</text>
            <text class="mini-act" @tap="input = ''">清空</text>
          </template>
        </PkField>
        <PkRow label="长度" :value="input ? input.length + ' 字符 / ' + utf8Len + ' 字节' : '—'" :copy="false" />
      </template>
      <PkField
        v-else
        v-model="input"
        type="textarea"
        :area-height="140"
        :maxlength="50000"
        placeholder="粘贴密文：Base64 或十六进制都能认，会自动分辨"
      >
        <template #labelRight>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>

      <view class="act-row">
        <PkBtn :text="op === 'enc' ? '加密' : '解密'" kind="primary" @tap="run" />
        <PkBtn text="结果当输入" kind="soft" @tap="useOutputAsInput" />
        <PkBtn text="一键往返" kind="ghost" @tap="roundTrip" />
        <PkBtn text="全部清空" kind="ghost" @tap="resetAll" />
      </view>
      <PkRow v-if="error" label="卡在这里" :value="error" color="var(--pk-danger)" :copy="false" stack />
      <PkRow v-if="roundTripMsg" label="往返结果" :value="roundTripMsg" :color="roundTripOk ? 'var(--pk-accent)' : 'var(--pk-danger)'" :copy="false" stack />
    </PkCard>

    <PkCard v-if="enc" title="密文" accent="var(--pk-accent)">
      <template #extra>
        <text class="mini-act" @tap="copyPair">复制密文 + IV</text>
      </template>
      <PkRow label="Base64 密文" :value="enc.outputBase64" mono />
      <PkRow label="十六进制" :value="enc.outputHex" mono />
      <PkRow v-if="enc.mode === 'cbc'" label="IV" :value="enc.ivHex" mono />
      <PkRow v-if="enc.kdf" label="派生出的密钥" :value="enc.kdf.keyHex" mono />
      <PkRow v-if="enc.kdf" label="派生参数" :value="enc.kdf.hash + ' × ' + enc.kdf.iterations + ' 轮，盐 ' + (enc.kdf.saltHex || '无')" :copy="false" />
      <PkRow label="实际密钥" :value="enc.keyHex" mono />
      <PkRow label="长度变化" :value="enc.inputBytes + ' 字节 → 补 ' + enc.padBytes + ' 字节 → ' + enc.paddedBytes + ' 字节 / ' + enc.blocks.length + ' 块' " :copy="false" stack />
      <PkRow label="算法" :value="enc.algoName + ' · ' + enc.mode.toUpperCase() + ' · ' + enc.rounds + ' 轮' " :copy="false" />
      <PkRow label="提醒" :value="enc.note" :copy="false" stack />
    </PkCard>

    <PkCard v-if="dec" title="明文" accent="var(--pk-accent)">
      <PkRow label="还原文本" :value="dec.plainText" :copy="!dec.printable" stack />
      <PkRow label="Base64" :value="dec.plainBase64" mono />
      <PkRow label="十六进制" :value="dec.plainHex" mono />
      <PkRow v-if="dec.kdf" label="派生出的密钥" :value="dec.kdf.keyHex" mono />
      <PkRow label="密文怎么认的" :value="dec.detectedFormat === 'hex' ? '整块十六进制' : dec.detectedFormat === 'base64' ? 'Base64' : '按 UTF-8 文本'" :copy="false" />
      <PkRow label="长度" :value="dec.cipherBytes + ' 字节密文 → ' + dec.plainBytes + ' 字节明文 / ' + dec.blocks.length + ' 块'" :copy="false" />
      <PkRow label="可打印" :value="dec.printable ? '能当文本用' : '含不可打印字节，别硬当文本拷'" :copy="false" stack />
    </PkCard>

    <PkCard v-if="trail.length" :title="'逐块过程（共 ' + trailTotal + ' 块，只列前 ' + trail.length + ' 块）'" accent="#5B6B8C">
      <view class="blk blk--head">
        <text class="blk__i">#</text>
        <text class="blk__h">输入块</text>
        <text class="blk__h">本块运算结果</text>
        <text class="blk__h">输出块</text>
      </view>
      <view v-for="b in trail" :key="b.index" class="blk">
        <text class="blk__i">{{ b.index }}</text>
        <text class="blk__h blk__h--mono">{{ b.inputHex }}</text>
        <text class="blk__h blk__h--mono">{{ b.midHex }}</text>
        <text class="blk__h blk__h--mono">{{ b.outputHex }}</text>
      </view>
      <PkRow label="怎么看" value="CBC 下每块的输入 = 上一块输出 ⊕ 明文；ECB 下输入就是明文，所以重复的明文块会露出来" :copy="false" stack />
    </PkCard>

    <PkCard title="拿公开向量验一验" accent="var(--pk-warn)">
      <template #extra>
        <text class="mini-act" @tap="runVectors">跑 NIST 向量</text>
        <text class="mini-act" @tap="runSelfTest">跑内置自检</text>
      </template>
      <view v-for="v in vectorRows" :key="v.name" class="vrow">
        <text class="vrow__n">{{ v.name }}</text>
        <text class="vrow__r" :class="v.ok ? 'vrow__r--ok' : 'vrow__r--bad'">{{ v.text }}</text>
      </view>
      <PkRow v-if="selfTestMsg" label="内置自检" :value="selfTestMsg" :copy="false" />
      <PkRow
        v-if="!vectorRows.length"
        label="说明"
        value="下面这些期望值抄自 FIPS-197 附录 C 与 NIST SP 800-38A，另与 OpenSSL 3.6 的 enc -nopad 双向核对过；点右上角就能看本机的实现是否对得上"
        :copy="false"
        stack
      />
    </PkCard>

    <PkCard title="用之前先读" accent="var(--pk-danger)">
      <view v-for="(n, i) in AES_NOTES" :key="i" class="note">
        <text class="note__i">{{ i + 1 }}</text>
        <text class="note__t">{{ n }}</text>
      </view>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  aesEncrypt,
  aesDecrypt,
  randomHex,
  selfTest,
  toHexBytes,
  base64ToBytes,
  VECTORS,
  AES_ALGOS,
  AES_MODES,
  AES_NOTES,
  AES_SAMPLES,
} from '@/utils/aes'
import { utf8ByteLen } from '@/utils/base64'
import { copyText, toast } from '@/utils/clipboard'

const opItems = [
  { key: 'enc', name: '加密' },
  { key: 'dec', name: '解密' },
]
const algoItems = AES_ALGOS.map((a) => ({ key: a.key, name: a.name }))
const modeItems = AES_MODES.map((m) => ({ key: m.key, name: m.name }))
const keyTypeItems = [
  { key: 'pass', name: '口令派生' },
  { key: 'hex', name: '十六进制密钥' },
]
const hashes = ['sha256', 'sha1', 'md5']

const op = ref('enc')
const algo = ref('aes-256')
const mode = ref('cbc')
const keyType = ref('pass')
const pass = ref('')
const passVisible = ref(false)
const hash = ref('sha256')
const iterations = ref(5000)
const saltHex = ref('')
const keyHex = ref('')
const iv = ref('')
const ivAuto = ref(true)
const input = ref('随身匣·离线工具箱，不联网')
const inputType = ref('text')

const enc = ref(null)
const dec = ref(null)
const error = ref('')
const roundTripOk = ref(false)
const roundTripMsg = ref('')
const vectorRows = ref([])
const selfTestMsg = ref('')

const modeNote = computed(() => (AES_MODES.find((m) => m.key === mode.value) || AES_MODES[0]).note)
const algoInfo = computed(() => AES_ALGOS.find((a) => a.key === algo.value) || AES_ALGOS[0])
const keyBytes = computed(() => algoInfo.value.keyBytes)
const keyChars = computed(() => algoInfo.value.keyHexChars)
const keyHexCharsIn = computed(() => String(keyHex.value).replace(/[\s:,_-]/g, '').length)
const utf8Len = computed(() => utf8ByteLen(input.value))
const trail = computed(() => {
  const r = enc.value || dec.value
  return r ? r.blockTrail.shown : []
})
const trailTotal = computed(() => {
  const r = enc.value || dec.value
  return r ? r.blockTrail.total : 0
})

function rollSalt() {
  saltHex.value = randomHex(8)
}
function rollIv() {
  iv.value = randomHex(16)
  ivAuto.value = false
}
function loadSample(text) {
  op.value = 'enc'
  inputType.value = 'text'
  input.value = text
  run()
}
function paste() {
  uni.getClipboardData({
    success(res) {
      if (res.data) input.value = String(res.data)
      else toast('剪贴板是空的')
    },
    fail() {
      toast('读取失败')
    },
  })
}

/** 把当前所有选项 + 给定明文打包成 aesEncrypt 的参数 */
function encOpts(text) {
  const o = {
    algo: algo.value,
    mode: mode.value,
    keyType: keyType.value,
    key: keyType.value === 'hex' ? keyHex.value : pass.value,
    input: text,
    inputType: inputType.value,
    blockLimit: 8,
  }
  if (keyType.value === 'pass') {
    o.hash = hash.value
    o.iterations = Number(iterations.value) || 5000
    o.saltHex = saltHex.value
    o.saltAuto = !String(saltHex.value).trim()
  }
  if (mode.value === 'cbc') {
    if (ivAuto.value && !String(iv.value).trim()) o.ivAuto = true
    else o.iv = iv.value
  }
  return o
}

/** 把当前所有选项 + 给定密文打包成 aesDecrypt 的参数 */
function decOpts(cipher) {
  const o = {
    algo: algo.value,
    mode: mode.value,
    keyType: keyType.value,
    key: keyType.value === 'hex' ? keyHex.value : pass.value,
    input: cipher,
    inputType: 'base64',
    blockLimit: 8,
  }
  if (keyType.value === 'pass') {
    o.hash = hash.value
    o.iterations = Number(iterations.value) || 5000
    o.saltHex = saltHex.value
  }
  if (mode.value === 'cbc') o.iv = iv.value
  return o
}

function clearResults() {
  enc.value = null
  dec.value = null
  error.value = ''
  roundTripMsg.value = ''
}

function run() {
  clearResults()
  if (!String(input.value).trim()) {
    error.value = '内容还是空的——先输入要处理的文本'
    return
  }
  try {
    if (op.value === 'enc') {
      enc.value = aesEncrypt(encOpts(input.value))
    } else {
      dec.value = aesDecrypt(decOpts(input.value))
    }
  } catch (e) {
    error.value = e && e.message ? e.message : String(e)
  }
}

function useOutputAsInput() {
  const out = enc.value ? enc.value.outputBase64 : dec.value ? dec.value.plainText : ''
  if (!out) return
  input.value = out
  clearResults()
  toast('已把结果搬到输入框')
}

/** 把粘贴进来的密文归一成十六进制，方便和「再加密」的结果逐字节比对 */
function cipherHexOf(text) {
  const s = String(text).trim()
  if (/^[0-9a-fA-F\s:,_-]+$/.test(s) && s.replace(/[\s:,_-]/g, '').length % 32 === 0) {
    return s.replace(/[\s:,_-]/g, '').toLowerCase()
  }
  return toHexBytes(base64ToBytes(s))
}

/** 加密 → 立刻解密回来，和原文明文比对；解密 → 再加密回去，和原密文比对 */
function roundTrip() {
  roundTripMsg.value = ''
  const src = String(input.value)
  if (!src.trim()) {
    error.value = '内容还是空的——先输入要处理的文本'
    return
  }
  try {
    if (op.value === 'enc') {
      const e1 = aesEncrypt(encOpts(src))
      const d1 = aesDecrypt({ ...decOpts(e1.outputBase64), iv: e1.ivHex })
      const want = inputType.value === 'hex' ? src.replace(/[\s:,_-]/g, '').toLowerCase() : src
      const got = inputType.value === 'hex' ? d1.plainHex : d1.plainText
      enc.value = e1
      dec.value = d1
      roundTripOk.value = got === want
      roundTripMsg.value = roundTripOk.value
        ? '加密再解密，' + d1.plainBytes + ' 字节原样回来了'
        : '对不上：解出来是「' + String(got).slice(0, 40) + '」'
    } else {
      const d1 = aesDecrypt(decOpts(src))
      const e2 = aesEncrypt({
        ...encOpts(d1.plainHex),
        inputType: 'hex',
        iv: d1.ivHex,
        ivAuto: false,
      })
      enc.value = e2
      dec.value = d1
      roundTripOk.value = e2.outputHex === cipherHexOf(src)
      roundTripMsg.value = roundTripOk.value
        ? '解密后按同一个 IV 再加密，密文和粘贴进来的逐字节一致'
        : '再加密对不上——多半是口令/盐/轮数和加密时不一致（IV 错了只会乱首块，不会在这里露馅）'
    }
    error.value = ''
  } catch (e) {
    roundTripOk.value = false
    roundTripMsg.value = '往返没跑成'
    error.value = e && e.message ? e.message : String(e)
  }
}

function copyPair() {
  const e = enc.value
  if (!e) return
  copyText(e.mode === 'cbc' ? e.outputBase64 + '\nIV ' + e.ivHex : e.outputBase64)
}

function resetAll() {
  clearResults()
  vectorRows.value = []
  selfTestMsg.value = ''
  input.value = ''
  toast('已清空')
}

/** 逐条真跑 VECTORS：期望密文 vs 实际密文 */
function runVectors() {
  vectorRows.value = []
  for (const v of VECTORS) {
    let row
    try {
      const r = aesEncrypt({
        algo: v.algo,
        mode: v.mode,
        keyType: 'hex',
        key: v.key,
        iv: v.iv || '',
        input: v.plain,
        inputType: 'hex',
        blockLimit: 1,
      })
      const okBack = r.outputHex === v.cipher
      row = { name: v.name, ok: okBack, text: okBack ? '✓ ' + r.blocks.length + ' 块全部吻合' : '✗ 期望 ' + v.cipher.slice(0, 16) + '… 实得 ' + r.outputHex.slice(0, 16) + '…' }
    } catch (e) {
      row = { name: v.name, ok: false, text: '✗ ' + (e && e.message ? e.message : e) }
    }
    vectorRows.value.push(row)
  }
  const bad = vectorRows.value.filter((r) => !r.ok).length
  toast(bad ? bad + ' 条向量对不上' : VECTORS.length + ' 条向量全对')
}

/** 内置自检：分组运算 + 填充 + 派生 + 中文报错，逐项真跑 */
function runSelfTest() {
  const st = selfTest()
  const bad = st.results.filter((r) => !r.ok)
  vectorRows.value = bad.slice(0, 8).map((r) => ({ name: r.name, ok: false, text: '✗ 期望 ' + r.expected + '，实得 ' + r.actual }))
  selfTestMsg.value = st.pass + '/' + st.total + ' 条通过'
  toast(bad.length ? '自检有 ' + bad.length + ' 条没过' : '内置自检 ' + st.pass + '/' + st.total + ' 全绿')
}
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 22rpx;
}
.act-row {
  display: flex;
  gap: 16rpx;
  flex-wrap: wrap;
  padding: 8rpx 0 4rpx;
}
.field-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8rpx 0 12rpx;
}
.field-line__k {
  font-size: 24rpx;
  color: var(--pk-text-2);
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.chip-row--top {
  justify-content: flex-start;
  padding: 0 0 12rpx;
}
.chip {
  font-size: 22rpx;
  color: var(--pk-text-2);
  margin: 6rpx 0 6rpx 14rpx;
  padding: 10rpx 20rpx;
  line-height: 1.3;
  border-radius: var(--pk-radius-sm);
  border: var(--pk-line-w) solid var(--pk-line-strong);
}
.chip--on {
  color: var(--pk-accent);
  border-color: var(--pk-accent);
  background: var(--pk-accent-soft);
}
.blk {
  display: flex;
  align-items: flex-start;
  padding: 12rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.blk--head {
  background: var(--pk-input);
}
.blk--head .blk__h {
  font-size: 22rpx;
  color: var(--pk-text-3);
}
.blk__i {
  width: 44rpx;
  font-size: 22rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
  flex-shrink: 0;
}
.blk__h {
  flex: 1;
  min-width: 0;
  margin-right: 12rpx;
  font-size: 22rpx;
  color: var(--pk-text-2);
  word-break: break-all;
}
.blk__h--mono {
  font-family: Menlo, Consolas, "Courier New", monospace;
  letter-spacing: 0.4rpx;
}
.vrow {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 14rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.vrow__n {
  font-size: 24rpx;
  color: var(--pk-text-2);
  margin-right: 16rpx;
  flex-shrink: 0;
}
.vrow__r {
  font-size: 22rpx;
  text-align: right;
  word-break: break-all;
  color: var(--pk-text-3);
}
.vrow__r--ok {
  color: var(--pk-accent);
}
.vrow__r--bad {
  color: var(--pk-danger);
}
.note {
  display: flex;
  align-items: flex-start;
  padding: 14rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.note:last-child {
  border-bottom: none;
}
.note__i {
  width: 34rpx;
  flex-shrink: 0;
  font-size: 22rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
}
.note__t {
  flex: 1;
  font-size: 22rpx;
  color: var(--pk-text-2);
  line-height: 1.75;
}
</style>
