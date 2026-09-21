<template>
  <view>
    <PkCard padded>
      <PkField v-model="version" label="版本号" placeholder="1.4.2 或 2.0.0-rc.1+build.7">
        <template #labelRight>
          <text class="mini-act" @tap="version = ''">清空</text>
        </template>
      </PkField>
      <view class="quick-row">
        <text v-for="s in SEMVER_SAMPLES" :key="s.name" class="quick-i" @tap="useSample(s)">{{ s.name }}</text>
      </view>
      <text class="tip">点样例可同时填好版本号、范围与待判定版本，直接就能看到判定效果。</text>
      <PkSwitchRow v-model="loose" title="宽松解析" desc="允许 1、1.2、1.x 这类残缺写法（严格规范只认三段式）" last />
      <PkRow v-if="parseError" label="解析失败" :value="parseError" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard v-if="parsed" title="逐字段拆解" accent="#3E6B8C">
      <view class="hero">
        <text class="hero__v">{{ parsed.version }}</text>
        <text class="hero__s">规范写法</text>
      </view>
      <view v-for="f in fieldRows" :key="f.k" class="fld">
        <view class="fld__head">
          <text class="fld__k">{{ f.k }}</text>
          <text class="fld__v">{{ f.v }}</text>
        </view>
        <text class="fld__t">{{ f.t }}</text>
      </view>
      <PkRow label="核心三段" :value="parsed.core" mono />
      <PkRow label="你输入的原文" :value="parsed.raw" mono />
      <PkRow
        label="严格解析能否通过"
        :value="strictOk ? '能，这是规范的三段式写法' : '不能，只有宽松模式才接受（会按 0 补齐缺的段）'"
        :color="strictOk ? 'var(--pk-text)' : 'var(--pk-warn)'"
        :copy="false"
        stack
      />
    </PkCard>

    <PkCard v-if="parsed" title="同一版本各档递增" accent="#4A6FA5">
      <PkField v-model="preId" label="预发布前缀（选填，如 beta / rc）" placeholder="留空则用 0 起步" />
      <view v-for="r in incRows" :key="r.key" class="inc">
        <view class="inc__head">
          <text class="inc__n">{{ r.name }}</text>
          <text class="inc__v" :class="{ 'inc__v--bad': r.error }">{{ r.error || r.value }}</text>
        </view>
        <text class="inc__note">{{ r.note }}</text>
      </view>
      <text class="tip">档位语义与 npm 的 semver.inc() 一致：从 {{ parsed.version }} 出发，七种升法一次列全。</text>
    </PkCard>

    <PkCard title="范围表达式与满足判定" accent="#6B5B95">
      <PkField v-model="rangeText" label="范围表达式" placeholder="^1.4.0 或 >=1.2.0 <2.0.0 || ~3.1.0">
        <template #labelRight>
          <text class="mini-act" @tap="rangeText = parsed ? parsed.version : ''">用上面的版本当范围</text>
        </template>
      </PkField>
      <PkField v-model="checkVersion" label="要判定的版本" placeholder="1.4.2" />
      <view class="quick-row">
        <text v-for="p in RANGE_PRESETS" :key="p.name" class="quick-i" @tap="usePreset(p)">{{ p.name }}</text>
      </view>
      <PkRow v-if="checkError" label="范围判定失败" :value="checkError" color="var(--pk-danger)" :copy="false" stack />
      <template v-else-if="checkInfo">
        <PkRow
          label="结 论"
          :value="checkInfo.verdict ? '满足（satisfies 返回 true）' : '不满足（satisfies 返回 false）'"
          :color="checkInfo.verdict ? 'var(--pk-accent)' : 'var(--pk-danger)'"
          big
          :copy="false"
        />
        <PkRow label="为什么" :value="checkInfo.reason" :copy="false" stack />
        <PkRow label="展开写法" :value="checkInfo.expanded" mono :copy="false" stack />
        <view v-for="g in checkInfo.groups" :key="g.index" class="grp">
          <view class="grp__head">
            <text class="grp__t">第 {{ g.index }} 组 {{ g.raw }}</text>
            <text class="grp__hit" :class="{ 'grp__hit--on': g.hit }">{{ g.hit ? '命中' : '落空' }}</text>
          </view>
          <text class="grp__span">等价区间 {{ g.bounds.span }}</text>
          <view v-for="(c, i) in visibleItems(g)" :key="i" class="cr">
            <text class="cr__p" :class="{ 'cr__p--no': !c.pass }">{{ c.pass ? '✓' : '✗' }}</text>
            <view class="cr__main">
              <text class="cr__t">{{ c.text }}</text>
              <text v-if="c.why" class="cr__w">{{ c.why }}</text>
            </view>
            <text class="cr__rel">比它 {{ relWord(c.rel) }}</text>
          </view>
          <text v-if="g.items.length > ITEM_LIMIT" class="grp__more">…共 {{ g.items.length }} 个比较符，只显示前 {{ ITEM_LIMIT }} 个</text>
          <text v-if="!g.preOk && g.passAll" class="grp__pre">这一组比较符全都成立，但该版本带预发布标签，被默认规则挡下了</text>
        </view>
        <text class="tip">{{ checkInfo.note }}</text>
      </template>
    </PkCard>

    <PkCard title="两个版本比一比" accent="#8A6D3B">
      <PkField v-model="verA" label="版本 A（当作旧的）" placeholder="1.4.2" />
      <PkField v-model="verB" label="版本 B（当作新的）" placeholder="2.0.0" />
      <view class="quick-row">
        <text v-for="p in PAIR_PRESETS" :key="p.name" class="quick-i" @tap="usePair(p)">{{ p.name }}</text>
      </view>
      <PkRow v-if="cmpError" label="提示" :value="cmpError" color="var(--pk-danger)" :copy="false" stack />
      <template v-else-if="cmpInfo">
        <PkRow label="先后关系" :value="cmpInfo.words" :color="cmpInfo.color" big :copy="false" />
        <PkRow label="compare(a, b)" :value="String(cmpInfo.cmp)" mono />
        <PkRow label="差在哪一档" :value="cmpInfo.diffName" :copy="false" />
        <PkRow label="按规范等价？" :value="cmpInfo.eq ? '是（eq 返回 true）' : '否'" :copy="false" />
      </template>
    </PkCard>

    <PkCard v-if="checkCard" title="升级风险提示" accent="var(--pk-warn)">
      <view v-for="(b, i) in breakRows" :key="i" class="brk">
        <text class="brk__lvl" :class="'brk__lvl--' + b.level">{{ b.tag }}</text>
        <view class="brk__body">
          <text class="brk__t">{{ b.t }}</text>
          <text class="brk__d">{{ b.d }}</text>
        </view>
      </view>
      <text v-if="!breakRows.length" class="tip">这一对版本没有需要提示的差异。</text>
    </PkCard>

    <PkCard title="多版本排序" accent="#3E7A4E">
      <PkField v-model="listText" type="textarea" :area-height="170" label="粘一批版本（空格 / 换行 / 逗号 / 顿号都行）">
        <template #labelRight>
          <text class="mini-act" @tap="listText = SORT_SAMPLE">填样例</text>
          <text class="mini-act" @tap="listText = ''">清空</text>
        </template>
      </PkField>
      <PkSeg v-model="sortDir" :items="DIRS" />
      <template v-if="sortInfo">
        <PkRow label="解析成功" :value="sortInfo.count + ' 个'" :copy="false" />
        <PkRow label="最小 / 最大" :value="sortInfo.min + '  →  ' + sortInfo.max" mono :copy="false" stack />
        <view v-for="r in visibleSort" :key="r.rank" class="srow">
          <text class="srow__i">{{ r.rank }}</text>
          <text class="srow__v">{{ r.version }}</text>
          <text v-if="r.pre" class="srow__p">预发布 {{ r.pre }}</text>
          <text v-if="r.dup" class="srow__d">重复</text>
        </view>
        <text v-if="sortInfo.rows.length > SORT_LIMIT" class="tip">…共 {{ sortInfo.rows.length }} 条，只显示前 {{ SORT_LIMIT }} 条。</text>
        <view v-if="sortInfo.rejected.length" class="rej">
          <text v-for="(t, i) in sortInfo.rejected.slice(0, 20)" :key="i" class="rej__i">{{ t }}</text>
        </view>
        <text v-if="sortInfo.rejected.length" class="tip">
          上面 {{ sortInfo.rejected.length }} 条不是合法版本号，已跳过（只有宽松写法才认 1、1.2 这类残缺）。
        </text>
        <text v-else class="tip">去重后的顺序就是 unique 字段给的列表；「重复」标出来的行与上一行等价。</text>
      </template>
      <PkEmpty v-else title="粘一批版本号进来" desc="排序会按主/次/修订与预发布顺序排，非法行会被跳过并列出" />
    </PkCard>

    <PkCard title="从文本里抓版本号" accent="#B5527A">
      <PkField v-model="looseText" label="任意一段文字" placeholder="node v18.17.0 (arm64)" />
      <PkRow
        label="coerce 抓到"
        :value="caught ? caught.version : '没抓到版本号'"
        :color="caught ? 'var(--pk-text)' : 'var(--pk-text-3)'"
        mono
        :copy="false"
      />
      <PkRow v-if="caught" label="抓自原文" :value="caught.from" mono :copy="false" stack />
      <text class="tip">coerce 会找出文本里第一段「数字.数字.数字」，再按宽松规则补齐，适合从命令行输出里捞版本。</text>
    </PkCard>

    <PkCard title="SemVer 要点" accent="var(--pk-accent)">
      <view v-for="n in SEMVER_NOTES" :key="n.t" class="note">
        <text class="note__t">{{ n.t }}</text>
        <text class="note__d">{{ n.d }}</text>
      </view>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  parseVersion,
  tryParse,
  coerce,
  compare,
  eq,
  sortVersions,
  RELEASE_TYPES,
  inc,
  diff,
  breakingChanges,
  parseRange,
  satisfies,
  explainSatisfies,
  SEMVER_SAMPLES,
  SEMVER_NOTES,
} from '@/utils/semver'
import { toast } from '@/utils/clipboard'

const ITEM_LIMIT = 8
const SORT_LIMIT = 40

const RANGE_PRESETS = [
  { name: 'caret', range: '^1.4.0', version: '1.9.9' },
  { name: 'tilde', range: '~1.4.0', version: '1.4.9' },
  { name: '或区间', range: '>=1.2.0 <2.0.0 || ^3.0.0', version: '3.2.1' },
  { name: '连字符', range: '1.2.0 - 2.3.0', version: '2.3.0' },
  { name: '通配', range: '1.2.x', version: '1.2.9' },
  { name: '0.x 陷阱', range: '^0.3.1', version: '0.4.0' },
  { name: '预发布被挡', range: '^2.0.0', version: '2.0.0-beta.1' },
]

const PAIR_PRESETS = [
  { name: '跨大版本', a: '1.4.2', b: '2.0.0' },
  { name: '只升修订', a: '1.4.2', b: '1.4.3' },
  { name: '0.x 之间', a: '0.3.1', b: '0.4.0' },
  { name: '转正', a: '2.0.0-rc.1', b: '2.0.0' },
  { name: '只差构建号', a: '1.0.0+a1', b: '1.0.0+b2' },
]

const DIRS = [
  { key: 'asc', name: '升序（旧 → 新）' },
  { key: 'desc', name: '降序（新 → 旧）' },
]

const SORT_SAMPLE = '1.4.2\n2.0.0-rc.1  1.4.10\n^3.0.0\n0.9.0, 1.4.2, 2.0.0\n10.0.0\nnot-a-version'

const version = ref('1.4.2')
const loose = ref(false)
const preId = ref('')
const rangeText = ref('^1.4.0')
const checkVersion = ref('1.4.2')
const verA = ref('1.4.2')
const verB = ref('2.0.0')
const listText = ref(SORT_SAMPLE)
const sortDir = ref('asc')
const looseText = ref('node v18.17.0 (arm64)')

/** 解析卡片用的版本对象；失败时只留错误文案 */
const parseState = computed(() => {
  const raw = String(version.value || '').trim()
  if (!raw) return { v: null, error: '' }
  try {
    return { v: parseVersion(raw, { loose: loose.value }), error: '' }
  } catch (e) {
    return { v: null, error: e.message }
  }
})
const parsed = computed(() => parseState.value.v)
const parseError = computed(() => parseState.value.error)

/** tryParse 走的是宽松通道，正好用来对照「严格 vs 宽松」 */
const strictOk = computed(() => {
  const raw = String(version.value || '').trim()
  if (!raw) return false
  try {
    parseVersion(raw)
    return true
  } catch (e) {
    return !!tryParse(raw)
  }
})

const fieldRows = computed(() => {
  const v = parsed.value
  if (!v) return []
  const pre = v.pre.length ? v.pre.join('.') : '（无）'
  const build = v.build.length ? v.build.join('.') : '（无）'
  const rows = [
    { k: 'major 主版本', v: String(v.major), t: '不兼容的删改。升它就得把次版本与修订归零，依赖方要改代码。' },
    { k: 'minor 次版本', v: String(v.minor), t: '向后兼容地加功能。可以加字段、加接口，不能删也不能改行为。' },
    { k: 'patch 修订号', v: String(v.patch), t: '向后兼容地修 bug。加了功能只升它是范围判定失灵的头号原因。' },
    { k: 'prerelease 预发布', v: pre, t: '带标签表示「还没正式版」，按规范排在同号正式版之前，且默认不被范围接受。' },
    { k: 'build 构建元数据', v: build, t: '「+」后面那段只是附加信息，规范明确它不参与先后比较。' },
  ]
  if (v.pre.length) {
    rows.push({
      k: '预发布逐段比较',
      v: v.preIds.map((p) => p.id + '（' + (p.numeric ? '数字，按数值比' : '字母，按 ASCII 比') + '）').join('  ›  '),
      t: '数字段恒小于字母段，所以 1.0.0-2 排在 1.0.0-alpha 之前；段数少的排在前面。',
    })
  }
  return rows
})

const incRows = computed(() => {
  const v = parsed.value
  if (!v) return []
  return RELEASE_TYPES.map((t) => {
    try {
      return { key: t.key, name: t.name, note: t.note, value: inc(v.version, t.key, preId.value), error: '' }
    } catch (e) {
      return { key: t.key, name: t.name, note: t.note, value: '', error: e.message }
    }
  })
})

const checkState = computed(() => {
  const v = String(checkVersion.value || '').trim()
  const r = String(rangeText.value || '').trim()
  if (!v || !r) return { info: null, error: '' }
  try {
    const info = explainSatisfies(v, r)
    info.verdict = satisfies(v, r)
    info.expanded = parseRange(r).text
    return { info, error: '' }
  } catch (e) {
    return { info: null, error: e.message }
  }
})
const checkInfo = computed(() => checkState.value.info)
const checkError = computed(() => checkState.value.error)

function visibleItems(g) {
  return g.items.slice(0, ITEM_LIMIT)
}

function relWord(rel) {
  if (rel === '<') return '小'
  if (rel === '>') return '大'
  if (rel === '=') return '相等'
  return '—'
}

const cmpState = computed(() => {
  const a = String(verA.value || '').trim()
  const b = String(verB.value || '').trim()
  if (!a || !b) return { info: null, error: '' }
  try {
    const c = compare(a, b)
    const d = diff(a, b)
    return {
      info: {
        cmp: c,
        diffName: d.name + (d.note ? ' —— ' + d.note : ''),
        eq: eq(a, b),
        breaks: breakingChanges(a, b),
        words: c === 0 ? '两个版本按规范等价' : c < 0 ? 'A 比 B 旧' : 'A 比 B 新',
        color: c === 0 ? 'var(--pk-text-3)' : c < 0 ? 'var(--pk-accent)' : 'var(--pk-warn)',
      },
      error: '',
    }
  } catch (e) {
    return { info: null, error: e.message }
  }
})
const cmpInfo = computed(() => cmpState.value.info)
const cmpError = computed(() => cmpState.value.error)

const checkCard = computed(() => !!cmpInfo.value)
const breakRows = computed(() => {
  if (!cmpInfo.value) return []
  const tag = { danger: '危险', warn: '注意', ok: '没事' }
  return cmpInfo.value.breaks.map((b) => ({ level: b.level, tag: tag[b.level] || b.level, t: b.t, d: b.d }))
})

const sortInfo = computed(() => {
  const raw = String(listText.value || '')
  if (!raw.trim()) return null
  const r = sortVersions(raw, sortDir.value === 'desc')
  if (!r.count) return null
  return r
})
const visibleSort = computed(() => {
  const r = sortInfo.value
  if (!r) return []
  return r.rows.slice(0, SORT_LIMIT)
})

const caught = computed(() => {
  const raw = String(looseText.value || '')
  if (!raw.trim()) return null
  const v = coerce(raw)
  if (!v) return null
  return { version: v.version, from: raw.trim().slice(0, 60) }
})

function useSample(s) {
  version.value = s.version
  rangeText.value = s.range
  checkVersion.value = s.version
  toast('已载入：' + s.name)
}

function usePreset(p) {
  rangeText.value = p.range
  checkVersion.value = p.version
}

function usePair(p) {
  verA.value = p.a
  verB.value = p.b
}
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 24rpx;
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
.tip {
  display: block;
  font-size: 22rpx;
  line-height: 1.8;
  color: var(--pk-text-3);
  padding: 10rpx 24rpx 12rpx;
}
.hero {
  display: flex;
  flex-direction: column;
  padding: 18rpx 24rpx 10rpx;
}
.hero__v {
  font-size: 40rpx;
  font-weight: 600;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  word-break: break-all;
  line-height: 1.4;
}
.hero__s {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 4rpx;
}
.fld {
  padding: 16rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.fld__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.fld__k {
  font-size: 24rpx;
  color: var(--pk-text-3);
  flex-shrink: 0;
  margin-right: 16rpx;
}
.fld__v {
  flex: 1;
  text-align: right;
  font-size: 26rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-accent);
  word-break: break-all;
  line-height: 1.6;
}
.fld__t {
  display: block;
  font-size: 22rpx;
  line-height: 1.7;
  color: var(--pk-text-3);
  margin-top: 6rpx;
}
.inc {
  padding: 16rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.inc__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.inc__n {
  font-size: 24rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text-2);
  flex-shrink: 0;
  margin-right: 16rpx;
}
.inc__v {
  flex: 1;
  text-align: right;
  font-size: 26rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  word-break: break-all;
}
.inc__v--bad {
  color: var(--pk-danger);
  font-size: 22rpx;
}
.inc__note {
  display: block;
  font-size: 22rpx;
  line-height: 1.7;
  color: var(--pk-text-3);
  margin-top: 6rpx;
}
.grp {
  padding: 14rpx 24rpx 16rpx;
  border-top: var(--pk-line-w) solid var(--pk-line);
}
.grp__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.grp__t {
  flex: 1;
  font-size: 24rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text-2);
  word-break: break-all;
  line-height: 1.6;
}
.grp__hit {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-left: 14rpx;
  flex-shrink: 0;
}
.grp__hit--on {
  color: var(--pk-accent);
  font-weight: 600;
}
.grp__span {
  display: block;
  font-size: 22rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text-3);
  margin: 6rpx 0 8rpx;
}
.cr {
  display: flex;
  align-items: flex-start;
  padding: 10rpx 0;
  border-top: var(--pk-line-w) solid var(--pk-line);
}
.cr__p {
  width: 34rpx;
  font-size: 24rpx;
  color: var(--pk-accent);
  flex-shrink: 0;
}
.cr__p--no {
  color: var(--pk-danger);
}
.cr__main {
  flex: 1;
  min-width: 0;
}
.cr__t {
  display: block;
  font-size: 24rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  word-break: break-all;
  line-height: 1.6;
}
.cr__w {
  display: block;
  font-size: 20rpx;
  line-height: 1.7;
  color: var(--pk-text-3);
  margin-top: 4rpx;
}
.cr__rel {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-left: 14rpx;
  flex-shrink: 0;
}
.grp__more {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  padding-top: 10rpx;
}
.grp__pre {
  display: block;
  font-size: 22rpx;
  line-height: 1.7;
  color: var(--pk-warn);
  padding-top: 10rpx;
}
.brk {
  display: flex;
  align-items: flex-start;
  padding: 16rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.brk__lvl {
  width: 84rpx;
  flex-shrink: 0;
  font-size: 22rpx;
  line-height: 1.8;
  text-align: center;
  border-radius: 8rpx;
  margin-right: 18rpx;
}
.brk__lvl--danger {
  color: var(--pk-danger);
  background: var(--pk-danger-soft);
}
.brk__lvl--warn {
  color: var(--pk-warn);
  background: var(--pk-bg-soft);
}
.brk__lvl--ok {
  color: var(--pk-accent);
  background: var(--pk-accent-soft);
}
.brk__body {
  flex: 1;
  min-width: 0;
}
.brk__t {
  display: block;
  font-size: 24rpx;
  color: var(--pk-text);
  line-height: 1.6;
}
.brk__d {
  display: block;
  font-size: 22rpx;
  line-height: 1.75;
  color: var(--pk-text-3);
  margin-top: 6rpx;
}
.srow {
  display: flex;
  align-items: baseline;
  padding: 12rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.srow__i {
  width: 60rpx;
  font-size: 20rpx;
  color: var(--pk-text-3);
  flex-shrink: 0;
}
.srow__v {
  flex: 1;
  font-size: 26rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  word-break: break-all;
}
.srow__p {
  font-size: 20rpx;
  color: var(--pk-warn);
  margin-left: 12rpx;
  flex-shrink: 0;
}
.srow__d {
  font-size: 20rpx;
  color: var(--pk-text-3);
  margin-left: 12rpx;
  flex-shrink: 0;
}
.rej {
  display: flex;
  flex-wrap: wrap;
  padding: 10rpx 24rpx 0;
}
.rej__i {
  font-size: 22rpx;
  color: var(--pk-danger);
  background: var(--pk-danger-soft);
  margin: 6rpx 10rpx 0 0;
  padding: 6rpx 14rpx;
  border-radius: 8rpx;
  word-break: break-all;
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
