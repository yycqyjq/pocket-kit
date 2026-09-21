<template>
  <view>
    <PkCard title="时区引擎与本机" :accent="TINT">
      <PkRow label="引擎" :value="engineText" :copy="false" />
      <PkRow label="本机 UTC 偏移" :value="deviceText" :copy="false" />
      <PkRow label="收录城市" :value="ZONES.length + ' 座，分 ' + (ZONE_GROUPS.length - 1) + ' 组'" :copy="false" />
      <PkRow v-if="!HAS_TZ" label="注意" value="当前环境取不到 IANA 时区数据，下面所有带 ± 的结果都按标准偏移给出，有夏令时的城市可能差 1 小时" color="var(--pk-warn)" :copy="false" stack />
      <text class="prose">{{ ENGINE_NOTE }}</text>
    </PkCard>

    <!-- ======================= 选城市 ======================= -->
    <PkCard title="挑要看的城市" :accent="TINT" padded>
      <PkSeg v-model="grp" :items="groupItems" />
      <PkField v-model="query" label="城市名 / 英文名 / IANA 名 / 偏移" placeholder="纽约 / tokyo / Asia/Shanghai / UTC+05:45">
        <template #labelRight>
          <text class="mini-act" @tap="query = ''">清空</text>
        </template>
      </PkField>
      <view class="chip-row">
        <text v-for="g in GROUP_SHORTCUTS" :key="g.name" class="chip" @tap="useGroup(g)">{{ g.name }}</text>
      </view>
      <text class="cap">已选 {{ picked.length }} 座（点城市名设为基准，点「移出」删掉）</text>
      <view v-for="k in picked" :key="k" class="city">
        <view class="city__main">
          <text class="city__cn">{{ cnOf(k) }}</text>
          <text class="city__sub">{{ offsetOf(k) }} · {{ cnOffsetOf(k) }}{{ dstMarkOf(k) }}</text>
        </view>
        <text class="city__act" :class="{ 'city__act--on': k === baseKey }" @tap="setBase(k)">{{ k === baseKey ? '基准' : '设为基准' }}</text>
        <text class="city__act" @tap="removeCity(k)">移出</text>
      </view>
      <text v-if="!picked.length" class="cap">一座城市都没选，下面会是空的</text>

      <text class="cap">搜索结果 {{ found.length }} 条</text>
      <view v-for="z in found" :key="z.key" class="city">
        <view class="city__main">
          <text class="city__cn">{{ z.cn }}</text>
          <text class="city__sub">{{ z.en }} · {{ z.key }} · {{ offsetLabel(z.std) }}{{ z.dst === null ? '' : ' / 夏令时 ' + offsetLabel(z.dst) }}</text>
          <text v-if="aliasesOf(z.key)" class="city__aka">别名：{{ aliasesOf(z.key) }}</text>
        </view>
        <text class="city__act" :class="{ 'city__act--on': isPicked(z.key) }" @tap="toggleCity(z.key)">{{ isPicked(z.key) ? '已选' : '加入' }}</text>
      </view>
      <text v-if="found.length > SHOW_LIMIT" class="cap">只列前 {{ SHOW_LIMIT }} 条，再具体些（试试「洛杉矶」「+5:45」「Kolkata」）</text>
      <PkEmpty v-if="!found.length" title="没有匹配的城市" desc="换个写法试试：中文城市名、英文名、IANA 名或 UTC 偏移都能搜" />
    </PkCard>

    <!-- ======================= 现在几点 ======================= -->
    <PkCard title="现在几点" :accent="TINT">
      <template #extra>
        <text class="mini-act" @tap="copyText(worldSummaryText(list))">复制清单</text>
        <text class="mini-act" @tap="running = !running">{{ running ? '暂停' : '继续' }}</text>
      </template>
      <view class="hero">
        <text class="hero__t">{{ list ? list.base.hm : '--:--' }}</text>
        <text class="hero__s">{{ list ? list.base.cn + ' · ' + list.base.date + ' ' + list.base.weekday : '' }}</text>
      </view>
      <view v-for="r in listRows" :key="r.key" class="zone" :class="{ 'zone--base': r.key === (list && list.base.key) }">
        <view class="zone__l">
          <text class="zone__cn">{{ r.cn }}</text>
          <text class="zone__meta">{{ r.date }} {{ r.weekday }}{{ r.isWeekend ? '（周末）' : '' }}</text>
        </view>
        <view class="zone__c">
          <text class="zone__t">{{ r.hm }}</text>
          <text v-if="r.crossDayMark" class="zone__cross">{{ r.crossDay }}</text>
        </view>
        <view class="zone__r">
          <text class="zone__off">{{ r.offsetText }}</text>
          <text class="zone__meta">{{ r.offsetCn }}{{ r.dstActive ? ' · 夏令时中' : '' }}{{ r.approx ? ' · ±1h' : '' }}</text>
        </view>
      </view>
      <PkRow v-if="list" label="跨日城市" :value="list.crossDayCount + ' 座不在基准城市的当天'" :copy="false" />
      <PkRow v-if="list" label="夏令时中" :value="list.dstActiveCount ? list.dstActiveCount + ' 座正在过夏令时' : '没有城市正在过夏令时'" :copy="false" />
      <PkRow v-if="list" label="基准" :value="list.note" :copy="false" stack />
      <text v-if="!picked.length" class="cap">先在上一张表里加入城市</text>
    </PkCard>

    <!-- ======================= 城市档案 ======================= -->
    <PkCard title="基准城市档案" accent="var(--pk-accent)">
      <template v-if="detail">
        <PkRow label="城市" :value="detail.cn + '（' + detail.en + '）'" :copy="false" />
        <PkRow label="IANA 名" :value="detail.key" mono />
        <PkRow label="分组" :value="detail.grp" :copy="false" />
        <PkRow label="此刻" :value="detail.nowText" :copy="false" />
        <PkRow label="此刻偏移" :value="detail.offsetNow + '（' + cnOffsetOf(baseKey) + '）'" :copy="false" />
        <PkRow label="标准偏移" :value="detail.stdText" mono />
        <PkRow label="夏令时" :value="detail.dstText + (detail.dstActive ? '（正在生效）' : '')" :copy="false" stack />
        <PkRow v-if="detail.note" label="备注" :value="detail.note" :copy="false" stack />
        <PkRow v-if="aliasesOf(baseKey)" label="搜索别名" :value="aliasesOf(baseKey)" :copy="false" stack />
        <PkRow label="时区标识" value="本工具只给 UTC±偏移，不给 CST/PST 一类缩写：同一个缩写能指好几个地方（CST 既是中国标准时也的美国中部时间），偏移才唯一" :copy="false" stack />
      </template>
    </PkCard>

    <!-- ======================= 两城对照 ======================= -->
    <PkCard title="两城对照" :accent="TINT" padded>
      <view class="pair">
        <view class="pair__side">
          <text class="pair__label">A 城</text>
          <picker mode="selector" :range="zoneNames" :value="aIndex" @change="onA">
            <view class="picker"><text class="picker__t">{{ cnOf(aKey) }}</text><view class="picker__chev"></view></view>
          </picker>
        </view>
        <view class="pair__swap" @tap="swapPair"><text class="pair__swap-t">⇄</text></view>
        <view class="pair__side">
          <text class="pair__label">B 城</text>
          <picker mode="selector" :range="zoneNames" :value="bIndex" @change="onB">
            <view class="picker"><text class="picker__t">{{ cnOf(bKey) }}</text><view class="picker__chev"></view></view>
          </picker>
        </view>
      </view>
      <PkSeg v-model="pairMode" :items="PAIR_MODES" />
      <view class="chip-row">
        <text v-for="s in DST_SAMPLES" :key="s.tag" class="chip" @tap="useWall(s)">{{ s.tag }}</text>
      </view>
      <text class="cap">切换日样本按 IANA tzdb 规则挑出来的坑：点一个就切到「按 A 城墙钟」，当场看到「不存在」与「出现两次」</text>
      <template v-if="pairMode === 'wall'">
        <view class="grid">
          <view class="cell"><PkField v-model="wall.year" type="number" label="年" placeholder="2024" /></view>
          <view class="cell"><PkField v-model="wall.month" type="number" label="月" placeholder="3" /></view>
          <view class="cell"><PkField v-model="wall.day" type="number" label="日" placeholder="10" /></view>
          <view class="cell"><PkField v-model="wall.hour" type="number" label="时" placeholder="2" /></view>
          <view class="cell"><PkField v-model="wall.minute" type="number" label="分" placeholder="30" /></view>
        </view>
      </template>
      <view v-else class="act-row">
        <PkBtn text="按此刻再算一次" kind="soft" @tap="refreshSnap" />
        <text class="cap cap--inline">按 {{ snapText }} 这个瞬间算</text>
      </view>
      <PkRow v-if="pairError" label="提示" :value="pairError" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard v-if="pair" title="差多少、那边几点" accent="var(--pk-accent)">
      <view class="hero">
        <text class="hero__t">{{ pair.deltaHours }} 小时</text>
        <text class="hero__s">{{ humanGap(pair.deltaMinutes) }}（含分钟）</text>
      </view>
      <PkRow label="谁快谁慢" :value="pair.deltaText" :copy="false" stack />
      <PkRow label="两边读数" :value="pair.thereText" :copy="false" stack />
      <PkRow label="是否同一天" :value="pair.sameDay ? '同一天' : '不在同一天：' + pair.b.crossDay + '（标记 ' + pair.crossDayMark + '）'" :copy="false" stack />
      <PkRow label="那边是否周末" :value="pair.weekendThere ? '是周末，约之前先确认对方上班' : '工作日'" :copy="false" />
      <PkRow label="工作时段重叠" :value="overlapText" :copy="false" stack />
      <PkRow label="偏移明细" :value="pair.note" :copy="false" stack />
      <PkRow
        v-if="pair.dstState !== 'ok'"
        label="夏令时切换"
        :value="pair.dstNote"
        color="var(--pk-warn)"
        :copy="false"
        stack
      />
      <PkRow v-if="pair.approx" label="精度" value="降级模式：偏移未计夏令时，可能差 1 小时" color="var(--pk-warn)" :copy="false" stack />
    </PkCard>

    <!-- ======================= 指定时刻 → 各城 ======================= -->
    <PkCard title="某个时刻在各城是几点" accent="var(--pk-accent)">
      <template #extra>
        <text class="mini-act" @tap="copyText(invite)">复制邀请文案</text>
      </template>
      <view class="grid">
        <view class="cell"><PkField v-model="wall.year" type="number" label="年" placeholder="2024" /></view>
        <view class="cell"><PkField v-model="wall.month" type="number" label="月" placeholder="6" /></view>
        <view class="cell"><PkField v-model="wall.day" type="number" label="日" placeholder="1" /></view>
        <view class="cell"><PkField v-model="wall.hour" type="number" label="时" placeholder="20" /></view>
        <view class="cell"><PkField v-model="wall.minute" type="number" label="分" placeholder="0" /></view>
      </view>
      <text class="cap">按 {{ cnOf(wZoneKey) }} 的墙钟理解；上面选中的城市会一起列出来（与「两城对照」共用同一组年月日时分）</text>
      <view class="chip-row">
        <text v-for="c in WALL_CITY_CHIPS" :key="c" class="chip" :class="{ 'chip--on': wZoneKey === c }" @tap="wZoneKey = c">{{ cnOf(c) }}</text>
      </view>
      <template v-if="atWall">
        <PkRow label="该瞬间" :value="atWall.from.cn + ' ' + atWall.from.date + ' ' + atWall.from.hm + ' ' + atWall.from.weekday" :copy="false" />
        <PkRow label="UTC" :value="atWall.utcText" mono />
        <PkRow label="秒级时间戳" :value="atWall.stamp" mono />
        <PkRow label="ISO 8601" :value="atWall.iso" mono />
        <PkRow label="偏移" :value="atWall.from.offsetText + '（' + atWall.from.offsetCn + '）'" :copy="false" />
        <PkRow
          v-if="atWall.dstState !== 'ok'"
          label="切换日提醒"
          :value="atWall.dstNote"
          color="var(--pk-warn)"
          :copy="false"
          stack
        />
        <view v-for="r in atWall.rows" :key="r.key" class="zone">
          <view class="zone__l">
            <text class="zone__cn">{{ r.cn }}</text>
            <text class="zone__meta">{{ r.date }} {{ r.weekday }}</text>
          </view>
          <view class="zone__c">
            <text class="zone__t">{{ r.hm }}</text>
            <text v-if="r.crossDayMark" class="zone__cross">{{ r.crossDay }}</text>
          </view>
          <view class="zone__r">
            <text class="zone__off">{{ r.offsetText }}</text>
            <text class="zone__meta">{{ r.offsetCn }}{{ r.dstActive ? ' · 夏令时中' : '' }}</text>
          </view>
        </view>
      </template>
      <PkRow v-if="atWallError" label="提示" :value="atWallError" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <!-- ======================= 会议窗口 ======================= -->
    <PkCard title="双方都在工作段的窗口" accent="var(--pk-warn)" padded>
      <PkField v-model="slotDate" label="起始日期（A 城的日历日）" placeholder="2026-06-03" :maxlength="10">
        <template #labelRight>
          <text class="mini-act" @tap="slotDate = pair ? pair.a.date : ''">用 A 城今天</text>
        </template>
      </PkField>
      <view class="grid">
        <view class="cell"><PkField v-model="workStart" type="number" label="上班点" placeholder="9" /></view>
        <view class="cell"><PkField v-model="workEnd" type="number" label="下班点" placeholder="18" /></view>
        <view class="cell"><PkField v-model="hours" type="number" label="往后扫几小时" placeholder="72" /></view>
      </view>
      <PkSwitchRow v-model="skipWeekend" title="跳过周末" desc="任一边是周六周日就不算重叠窗口" last />
      <PkRow v-if="slotError" label="提示" :value="slotError" color="var(--pk-danger)" :copy="false" stack />
      <template v-if="slots">
        <PkRow label="窗口" :value="slots.slots.length + ' 段 · 合计 ' + slots.totalHours + ' 小时'" :copy="false" />
        <view v-for="(s, i) in slots.slots" :key="i" class="slot">
          <text class="slot__head">{{ s.aDate }} {{ s.aWeekday }} · {{ s.hours }} 小时</text>
          <text class="slot__line">{{ s.plainA }}</text>
          <text class="slot__line slot__line--b">{{ cnOf(aKey) }} ↔ {{ s.plainB }}</text>
        </view>
        <text v-if="!slots.slots.length" class="cap">{{ slots.note }}</text>
        <text v-else class="prose">{{ slots.note }}</text>
      </template>
    </PkCard>

    <!-- ======================= 24 小时网格 ======================= -->
    <PkCard title="A 城 24 个整点对应 B 城" accent="var(--pk-accent)">
      <template v-if="grid">
        <view class="tbl">
          <view class="tbl__r tbl__r--h">
            <text class="tbl__c">{{ grid.a }}</text>
            <text class="tbl__c">{{ grid.b }}</text>
            <text class="tbl__c">跨日</text>
            <text class="tbl__c">双方都在工作段</text>
          </view>
          <view v-for="r in grid.rows" :key="r.hour" class="tbl__r" :class="{ 'tbl__r--on': r.bothWork }">
            <text class="tbl__c">{{ r.aTime }}<text v-if="r.dstState !== 'ok'" class="tbl__flag">{{ r.dstState === 'gap' ? '不存在' : '两次' }}</text></text>
            <text class="tbl__c">{{ r.bTime }}</text>
            <text class="tbl__c">{{ r.crossDayMark || '—' }}</text>
            <text class="tbl__c">{{ r.bothWork ? '是' : (r.aWork || r.bWork ? '半边' : '否') }}</text>
          </view>
        </view>
        <PkRow label="对照日" :value="grid.aDate + '（' + grid.a + ' 的日历日）'" :copy="false" />
        <PkRow label="全天都重叠" :value="grid.bothWorkCount + ' 小时'" :copy="false" />
        <PkRow label="切换日" :value="(grid.gapCount || grid.ambiguousCount) ? '不存在 ' + grid.gapCount + ' 个整点 / 出现两次 ' + grid.ambiguousCount + ' 个整点' : '当天没有钟表切换'" :copy="false" stack />
        <text class="prose">{{ grid.note }}</text>
      </template>
      <PkRow v-if="gridError" label="提示" :value="gridError" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <!-- ======================= 说明 ======================= -->
    <PkCard title="为什么会看错" :accent="TINT">
      <view v-for="(n, i) in CLOCK_NOTES" :key="i" class="li">
        <text class="li__dot">·</text>
        <text class="li__t">{{ n }}</text>
      </view>
      <view v-for="o in offsetLadder" :key="o" class="li">
        <text class="li__dot">·</text>
        <text class="li__t">{{ offsetLabel(o) }} {{ offsetCn(o) }}</text>
      </view>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import {
  ENGINE,
  ENGINE_NOTE,
  HAS_TZ,
  CLOCK_NOTES,
  ZONES,
  ZONE_GROUPS,
  DEFAULT_ZONES,
  zone,
  hasZone,
  zoneHasDst,
  searchZones,
  aliasesOf,
  offsetLabel,
  offsetCn,
  humanGap,
  deviceOffsetMinutes,
  nowRows,
  zoneDetail,
  pairCompare,
  atWallInZone,
  meetingSlots,
  dayGrid,
  worldSummaryText,
  inviteText,
  distinctOffsets,
  utcText,
} from '@/utils/worldclock'
import { copyText } from '@/utils/clipboard'

/** 本工具的品牌色（唯一的硬编码颜色，其余全走 CSS 变量） */
const TINT = '#2F7A8C'
const SHOW_LIMIT = 24

const PAIR_MODES = [
  { key: 'now', name: '按此刻' },
  { key: 'wall', name: '按 A 城墙钟' },
]

/** 夏令时切换日与半小时区的样本：都是 tzdb 里可复核的坑 */
const DST_SAMPLES = [
  { tag: '纽约 2024-03-10 02:30（不存在）', key: 'America/New_York', year: '2024', month: '3', day: '10', hour: '2', minute: '30' },
  { tag: '纽约 2024-11-03 01:30（两次）', key: 'America/New_York', year: '2024', month: '11', day: '3', hour: '1', minute: '30' },
  { tag: '伦敦 2024-03-31 01:30（不存在）', key: 'Europe/London', year: '2024', month: '3', day: '31', hour: '1', minute: '30' },
  { tag: '伦敦 2024-10-27 01:30（两次）', key: 'Europe/London', year: '2024', month: '10', day: '27', hour: '1', minute: '30' },
  { tag: '加德满都 2024-05-05 21:15（+5:45）', key: 'Asia/Kathmandu', year: '2024', month: '5', day: '5', hour: '21', minute: '15' },
  { tag: '悉尼 2024-01-15 12:00（南半球夏天）', key: 'Australia/Sydney', year: '2024', month: '1', day: '15', hour: '12', minute: '0' },
]

const GROUP_SHORTCUTS = [
  { name: '常看六城', keys: DEFAULT_ZONES },
  { name: '中国五城', keys: ['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Macau', 'Asia/Taipei', 'Asia/Urumqi'] },
  { name: '半小时区', keys: ['Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Yangon', 'Australia/Lord_Howe'] },
  { name: '昼夜颠倒', keys: ['Pacific/Kiritimati', 'Pacific/Honolulu', 'Asia/Shanghai'] },
]

const groupItems = ZONE_GROUPS.map((g) => ({ key: g, name: g }))
const zoneNames = ZONES.map((z) => z.cn)
// 表里出现过的偏移，从东十二往西十二排，用来讲清「偏移不是整小时」
const offsetLadder = distinctOffsets()

function attempt(fn) {
  try {
    return { data: fn(), error: '' }
  } catch (e) {
    return { data: null, error: e.message }
  }
}

/* ---------------- 选中城市 ---------------- */

const picked = ref(DEFAULT_ZONES.slice())
const baseKey = ref('Asia/Shanghai')
const grp = ref('全部')
const query = ref('')

const found = computed(() => searchZones(query.value, grp.value).slice(0, SHOW_LIMIT))

const isPicked = (k) => picked.value.indexOf(k) >= 0
const cnOf = (k) => (hasZone(k) ? zone(k).cn : k)
const offsetOf = (k) => (hasZone(k) ? offsetLabel(zone(k).std) : '')
const cnOffsetOf = (k) => (hasZone(k) ? offsetCn(zone(k).std) : '')
const dstMarkOf = (k) => (hasZone(k) && zoneHasDst(k) ? ' · 实行夏令时' : '')

function toggleCity(k) {
  if (isPicked(k)) {
    removeCity(k)
    return
  }
  picked.value = picked.value.concat([k])
  // 一座都没设过基准时，第一个加入的就当基准
  if (!hasZone(baseKey.value) || !isPicked(baseKey.value)) baseKey.value = k
}

function removeCity(k) {
  picked.value = picked.value.filter((x) => x !== k)
  if (baseKey.value === k) baseKey.value = picked.value.length ? picked.value[0] : 'Asia/Shanghai'
}

function setBase(k) {
  if (!isPicked(k)) {
    toggleCity(k)
    return
  }
  baseKey.value = k
}

function useGroup(g) {
  picked.value = g.keys.slice()
  baseKey.value = g.keys[0]
}

/* ---------------- 实时 ---------------- */

const running = ref(true)
const tick = ref(Date.now())
const timer = setInterval(() => {
  if (running.value) tick.value = Date.now()
}, 1000)
onUnmounted(() => clearInterval(timer))

const listRun = computed(() => attempt(() => nowRows(picked.value, baseKey.value, tick.value)))
const list = computed(() => (listRun.value.data && listRun.value.data.rows.length ? listRun.value.data : null))
const listRows = computed(() => (list.value ? list.value.rows : []))

const engineText = computed(() => (HAS_TZ ? ENGINE + '（Intl，含夏令时与半小时区）' : ENGINE + '（固定标准偏移，未计夏令时）'))
const deviceText = computed(() => {
  const m = deviceOffsetMinutes(tick.value)
  return offsetLabel(m) + ' · ' + offsetCn(m)
})

const detail = computed(() => {
  if (!isPicked(baseKey.value)) return null
  const r = attempt(() => zoneDetail(baseKey.value, tick.value))
  return r.data
})

/* ---------------- 两城对照 ---------------- */

const aKey = ref('Asia/Shanghai')
const bKey = ref('America/New_York')
const pairMode = ref('now')
const snap = ref(Date.now())
const snapText = computed(() => utcText(snap.value))

const zoneKeys = ZONES.map((z) => z.key)
const aIndex = computed(() => {
  const i = zoneKeys.indexOf(aKey.value)
  return i < 0 ? 0 : i
})
const bIndex = computed(() => {
  const i = zoneKeys.indexOf(bKey.value)
  return i < 0 ? 1 : i
})

function onA(e) {
  aKey.value = ZONES[Number(e.detail.value)].key
}
function onB(e) {
  bKey.value = ZONES[Number(e.detail.value)].key
}
function swapPair() {
  const a = aKey.value
  aKey.value = bKey.value
  bKey.value = a
}
function refreshSnap() {
  snap.value = Date.now()
}

// 墙钟输入：A 城今天的日期 + 20:00，读数由 util 给，视图不自己拆日期
const seed = zoneDetail('Asia/Shanghai', Date.now()).row
const wall = ref({
  year: String(seed.year),
  month: String(seed.month),
  day: String(seed.day),
  hour: '20',
  minute: '0',
})
const wZoneKey = ref('Asia/Shanghai')
const WALL_CITY_CHIPS = ['Asia/Shanghai', 'Europe/London', 'America/New_York', 'UTC', 'Asia/Tokyo']

function useWall(s) {
  wZoneKey.value = s.key
  aKey.value = s.key
  pairMode.value = 'wall'
  wall.value = { year: s.year, month: s.month, day: s.day, hour: s.hour, minute: s.minute }
}

const wallInput = computed(() => ({
  year: wall.value.year,
  month: wall.value.month,
  day: wall.value.day,
  hour: wall.value.hour,
  minute: wall.value.minute,
}))

const pairRun = computed(() =>
  attempt(() =>
    pairMode.value === 'wall'
      ? pairCompare({ a: aKey.value, b: bKey.value, aWall: wallInput.value })
      : pairCompare({ a: aKey.value, b: bKey.value, at: snap.value })
  )
)
const pair = computed(() => pairRun.value.data)
const pairError = computed(() => pairRun.value.error)
const overlapText = computed(() => {
  if (!pair.value) return ''
  const r = pair.value.overlapRatio
  return (
    r + '（把 A 城当天 24 小时逐格对着 B 城看，双方都在 9:00~18:00 的小时数 ÷ 9。' +
    (r === 0 ? '完全错开，只能一方熬夜或改异步' : r === 1 ? '两边作息完全同步' : '按比例挑共同工作时段') +
    '）'
  )
})

/* ---------------- 指定时刻 → 各城 ---------------- */

const atWallRun = computed(() =>
  attempt(() =>
    atWallInZone(Object.assign({ zoneKey: wZoneKey.value, zones: picked.value.length ? picked.value : [wZoneKey.value] }, wallInput.value))
  )
)
const atWall = computed(() => atWallRun.value.data)
const atWallError = computed(() => atWallRun.value.error)
const inviteRun = computed(() =>
  attempt(() =>
    inviteText(Object.assign({ zoneKey: wZoneKey.value, zones: picked.value.length ? picked.value : [wZoneKey.value] }, wallInput.value))
  )
)
const invite = computed(() => (inviteRun.value.data ? inviteRun.value.data : ''))

/* ---------------- 会议窗口 / 网格 ---------------- */

const slotDate = ref(seed.date)
const workStart = ref('9')
const workEnd = ref('18')
const hours = ref('72')
const skipWeekend = ref(true)

const slotRun = computed(() =>
  attempt(() =>
    meetingSlots({
      a: aKey.value,
      b: bKey.value,
      date: slotDate.value,
      workStart: workStart.value,
      workEnd: workEnd.value,
      hours: hours.value,
      skipWeekend: skipWeekend.value,
    })
  )
)
const slots = computed(() => slotRun.value.data)
const slotError = computed(() => (slotDate.value.trim() ? slotRun.value.error : ''))

const gridRun = computed(() => attempt(() => dayGrid({ a: aKey.value, b: bKey.value, date: slotDate.value })))
const grid = computed(() => gridRun.value.data)
const gridError = computed(() => (slotDate.value.trim() ? gridRun.value.error : ''))
</script>

<style scoped>
.prose {
  display: block;
  font-size: 21rpx;
  line-height: 1.75;
  color: var(--pk-text-3);
  padding: 10rpx 24rpx 18rpx;
}
.mini-act {
  font-size: 21rpx;
  color: var(--pk-accent);
  margin-left: 18rpx;
}
.cap {
  display: block;
  font-size: 21rpx;
  line-height: 1.7;
  color: var(--pk-text-3);
  margin: 8rpx 0;
}
.cap--inline {
  margin: 0 0 0 16rpx;
}
.hero {
  display: flex;
  align-items: baseline;
  padding: 24rpx 24rpx 14rpx;
}
.hero__t {
  font-size: 52rpx;
  font-weight: 600;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  flex: 1;
}
.hero__s {
  font-size: 22rpx;
  color: var(--pk-text-3);
}
.li {
  display: flex;
  align-items: flex-start;
  padding: 10rpx 24rpx;
}
.li__dot {
  width: 26rpx;
  font-size: 24rpx;
  color: var(--pk-text-3);
  flex-shrink: 0;
}
.li__t {
  flex: 1;
  font-size: 22rpx;
  line-height: 1.7;
  color: var(--pk-text-2);
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 10rpx;
}
.chip {
  font-size: 22rpx;
  color: var(--pk-text-2);
  margin: 8rpx 12rpx 0 0;
  padding: 12rpx 18rpx;
  line-height: 1.3;
  border-radius: 10rpx;
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line);
}
.chip--on {
  color: var(--pk-accent);
  background: var(--pk-accent-soft);
}
.city {
  display: flex;
  align-items: center;
  padding: 14rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.city__main {
  flex: 1;
  min-width: 0;
}
.city__cn {
  display: block;
  font-size: 26rpx;
  color: var(--pk-text);
}
.city__sub {
  display: block;
  font-size: 20rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
  word-break: break-all;
}
.city__aka {
  display: block;
  font-size: 20rpx;
  color: var(--pk-text-3);
}
.city__act {
  font-size: 21rpx;
  color: var(--pk-text-2);
  margin-left: 16rpx;
  padding: 10rpx 14rpx;
  border-radius: 10rpx;
  border: var(--pk-line-w) solid var(--pk-line-strong);
  flex-shrink: 0;
}
.city__act--on {
  color: var(--pk-accent);
  border-color: var(--pk-accent);
}
.zone {
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.zone--base {
  background: var(--pk-accent-soft);
}
.zone__l {
  flex: 1;
  min-width: 0;
}
.zone__cn {
  display: block;
  font-size: 25rpx;
  color: var(--pk-text);
}
.zone__c {
  width: 150rpx;
}
.zone__t {
  display: block;
  font-size: 30rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
}
.zone__cross {
  display: block;
  font-size: 19rpx;
  color: var(--pk-warn);
}
.zone__r {
  width: 190rpx;
  text-align: right;
}
.zone__off {
  display: block;
  font-size: 21rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text-2);
}
.zone__meta {
  display: block;
  font-size: 19rpx;
  color: var(--pk-text-3);
}
.pair {
  display: flex;
  align-items: flex-end;
  margin-top: 8rpx;
}
.pair__side {
  flex: 1;
}
.pair__label {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-bottom: 8rpx;
}
.pair__swap {
  width: 68rpx;
  height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pair__swap-t {
  font-size: 34rpx;
  color: var(--pk-accent);
}
.picker {
  height: 76rpx;
  border-radius: 14rpx;
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20rpx;
}
.picker__t {
  font-size: 27rpx;
  color: var(--pk-text);
}
.picker__chev {
  width: 12rpx;
  height: 12rpx;
  border-right: 3rpx solid var(--pk-text-3);
  border-bottom: 3rpx solid var(--pk-text-3);
  transform: rotate(45deg) translate(-3rpx, -3rpx);
}
.grid {
  display: flex;
  flex-wrap: wrap;
}
.cell {
  width: 32%;
  margin-right: 2%;
}
.cell:nth-child(3n) {
  margin-right: 0;
}
.act-row {
  display: flex;
  align-items: center;
  padding: 10rpx 0 16rpx;
}
.slot {
  padding: 14rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.slot__head {
  display: block;
  font-size: 23rpx;
  color: var(--pk-text-2);
}
.slot__line {
  display: block;
  font-size: 22rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-accent);
  margin-top: 6rpx;
}
.slot__line--b {
  color: var(--pk-text-3);
}
.tbl {
  padding: 4rpx 24rpx 14rpx;
}
.tbl__r {
  display: flex;
  align-items: center;
  padding: 10rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.tbl__r--h {
  border-bottom-color: var(--pk-line-strong);
}
.tbl__r--on {
  background: var(--pk-accent-soft);
}
.tbl__c {
  flex: 1;
  font-size: 21rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text-3);
  text-align: right;
}
.tbl__r--h .tbl__c {
  color: var(--pk-text-2);
  font-weight: 600;
}
.tbl__c:first-child {
  text-align: left;
}
.tbl__flag {
  font-size: 18rpx;
  color: var(--pk-warn);
  margin-left: 6rpx;
}
</style>
