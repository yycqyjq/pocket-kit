<template>
  <view class="shell" :class="{ 'theme-dark': theme.dark }">
    <!-- 顶部 -->
    <view class="head" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="brand">
        <view class="brand__mark">
          <view class="brand__mark-inner"></view>
        </view>
        <view class="brand__text">
          <text class="brand__name">随身匣</text>
          <text class="brand__sub">{{ headSub }}</text>
        </view>
      </view>

      <view v-if="tab === 'home' || tab === 'fav'" class="search">
        <view class="search__glass"></view>
        <input
          v-model="keyword"
          class="search__input"
          :placeholder="tab === 'fav' ? '在收藏里搜索' : '搜索工具，如「时间戳」「BMI」'"
          placeholder-class="pk-ph"
          confirm-type="search"
        />
        <text v-if="keyword" class="search__clear" @tap="keyword = ''">清除</text>
      </view>
    </view>

    <!-- 内容区 -->
    <view class="body" :style="{ paddingBottom: tabbarHeight + safeBottom + 24 + 'px' }">
      <!-- ============ 工具 ============ -->
      <template v-if="tab === 'home'">
        <scroll-view v-if="!keyword" class="cats" scroll-x :show-scrollbar="false">
          <view class="cats__inner">
            <view
              v-for="c in CATEGORIES"
              :key="c.key"
              class="cat"
              :class="{ 'cat--on': category === c.key }"
              hover-class="cat--hover"
              @tap="category = c.key"
            >
              <text class="cat__t">{{ c.name }}</text>
              <text class="cat__n">{{ countOf(c.key) }}</text>
            </view>
          </view>
        </scroll-view>

        <view v-if="keyword" class="section">
          <text class="section__t">搜索「{{ keyword }}」· 命中 {{ searchHits.length }} 个</text>
        </view>

        <PkEmpty
          v-if="keyword && !searchHits.length"
          title="没有匹配的工具"
          desc="换个说法试试，比如「编码」「利息」「身份证」"
        />

        <view v-else class="grid">
          <view
            v-for="t in shownTools"
            :key="t.id"
            class="card"
            hover-class="card--hover"
            :hover-stay-time="60"
            @tap="open(t)"
          >
            <PkGlyph :char="t.glyph" :tint="t.tint" :size="76" />
            <text class="card__n">{{ t.name }}</text>
            <text class="card__d">{{ t.desc }}</text>
            <view v-if="isFav(t.id)" class="card__star"></view>
          </view>
        </view>
      </template>

      <!-- ============ 收藏 ============ -->
      <template v-else-if="tab === 'fav'">
        <PkEmpty
          v-if="!favTools.length"
          :title="keyword ? '收藏里没有匹配项' : '还没有收藏'"
          desc="在工具页面右上角点亮星标，常用的就会收在这里"
        >
          <template #action>
            <PkBtn v-if="!keyword" text="去挑几个" kind="soft" @tap="tab = 'home'" />
          </template>
        </PkEmpty>
        <view v-else class="grid">
          <view
            v-for="t in favTools"
            :key="t.id"
            class="card"
            hover-class="card--hover"
            :hover-stay-time="60"
            @tap="open(t)"
          >
            <PkGlyph :char="t.glyph" :tint="t.tint" :size="76" />
            <text class="card__n">{{ t.name }}</text>
            <text class="card__d">{{ t.desc }}</text>
            <view class="card__star"></view>
          </view>
        </view>
      </template>

      <!-- ============ 记录 ============ -->
      <template v-else-if="tab === 'recent'">
        <PkEmpty v-if="!recentList.length" title="最近没动过手" desc="用过的工具会按时间倒序留在这里，方便下次直达" />
        <template v-else>
          <view class="section">
            <text class="section__t">最近 {{ recentList.length }} 条</text>
            <text class="section__a" @tap="confirmClearRecent">清空</text>
          </view>
          <PkCard>
            <view
              v-for="(r, i) in recentList"
              :key="r.id"
              class="rec"
              :class="{ 'rec--last': i === recentList.length - 1 }"
              hover-class="rec--hover"
              @tap="open(r.tool)"
            >
              <PkGlyph :char="r.tool.glyph" :tint="r.tool.tint" :size="64" />
              <view class="rec__main">
                <text class="rec__n">{{ r.tool.name }}</text>
                <text class="rec__d">{{ r.tool.desc }}</text>
              </view>
              <text class="rec__t">{{ r.time }}</text>
            </view>
          </PkCard>
        </template>
      </template>

      <!-- ============ 搞机 ============ -->
      <template v-else-if="tab === 'gear'">
        <GearHub />
      </template>

      <!-- ============ 设置 ============ -->
      <template v-else>
        <PkCard title="外观" accent="var(--pk-accent)">
          <PkSwitchRow
            :model-value="theme.dark"
            title="深色模式"
            desc="夜间或暗环境下更省眼"
            :last="true"
            @change="onThemeChange"
          />
        </PkCard>

        <PkCard title="交互" accent="#4A6FA5">
          <PkSwitchRow
            :model-value="settings.haptic"
            title="点击震动"
            desc="点按按钮时给出轻微反馈"
            :last="true"
            @change="save('haptic', $event)"
          />
          <view class="seg-cell">
            <text class="seg-cell__k">启动默认停留</text>
            <PkSeg v-model="startTabModel" :items="startTabItems" />
          </view>
        </PkCard>

        <PkCard title="数据" accent="#6B5B95">
          <view class="cell" hover-class="cell--hover" @tap="confirmClearFav">
            <text class="cell__n">清空收藏</text>
            <text class="cell__v">{{ favList.length }} 个</text>
          </view>
          <view class="cell cell--last" hover-class="cell--hover" @tap="confirmClearRecent">
            <text class="cell__n">清空使用记录</text>
            <text class="cell__v">{{ recentRaw.length }} 条</text>
          </view>
        </PkCard>

        <PkCard title="关于" accent="var(--pk-warn)">
          <PkRow label="应用名称" value="随身匣" :copy="false" />
          <PkRow label="版本" value="1.0.0" :copy="false" />
          <PkRow label="内置工具" :value="TOOL_COUNT + ' 个'" :copy="false" />
          <PkRow label="技术栈" value="uni-app · Vue 3 · Vite" :copy="false" />
          <PkRow label="数据存放" value="全部保存在本机，不联网、不上传" :copy="false" stack />
          <PkRow label="计算口径" value="结果由本地公式估算，仅供参考" :copy="false" stack />
        </PkCard>

        <view class="foot">
          <text class="foot__t">匣中诸器，皆在此间</text>
        </view>
      </template>
    </view>

    <!-- 底部导航 -->
    <view class="tabbar" :style="{ paddingBottom: safeBottom + 'px' }">
      <view
        v-for="t in tabs"
        :key="t.key"
        class="tab"
        hover-class="tab--hover"
        :hover-stay-time="60"
        @tap="tab = t.key"
      >
        <text class="tab__g" :class="{ 'tab__g--on': tab === t.key }">{{ t.glyph }}</text>
        <text class="tab__l" :class="{ 'tab__l--on': tab === t.key }">{{ t.label }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { statusBarHeight, safeBottom } from '@/utils/sys'
import { theme, setTheme, themeColors } from '@/utils/theme'
import { relativeTime } from '@/utils/date'
import { haptic, toast } from '@/utils/clipboard'
import {
  CATEGORIES,
  TOOLS,
  TOOL_COUNT,
  searchTools,
  toolsByCategory,
  getTool,
} from '@/tools/registry'
import GearHub from '@/components/GearHub.vue'
import {
  readFavorites,
  readRecent,
  readSettings,
  writeSetting,
  clearRecent,
  store,
  STORAGE_KEYS,
} from '@/utils/storage'

const tabbarHeight = 58

const tabs = [
  { key: 'home', glyph: '匣', label: '工具' },
  { key: 'gear', glyph: '机', label: '搞机' },
  { key: 'fav', glyph: '藏', label: '收藏' },
  { key: 'recent', glyph: '迹', label: '记录' },
  { key: 'me', glyph: '设', label: '设置' },
]

const tab = ref('home')
const keyword = ref('')
const category = ref('all')
const favList = ref([])
const recentRaw = ref([])
const settings = ref(readSettings())

const startTabItems = [
  { key: 'home', name: '工具' },
  { key: 'gear', name: '搞机' },
  { key: 'fav', name: '收藏' },
  { key: 'recent', name: '记录' },
]

/** 设置里选择「启动默认停留」，写回存储并提示 */
const startTabModel = computed({
  get: () => settings.value.startTab || 'home',
  set: (v) => {
    writeSetting('startTab', v)
    settings.value = readSettings()
    const hit = startTabItems.find((i) => i.key === v)
    if (hit) toast('下次启动将停在「' + hit.name + '」')
  },
})

const headSub = computed(() => {
  if (tab.value === 'home') return TOOL_COUNT + ' 件小工具，离线可用'
  if (tab.value === 'gear') return '这台机器的底细'
  if (tab.value === 'fav') return '常用的一并收在这里'
  if (tab.value === 'recent') return '最近动过手的工具'
  return '偏好与数据'
})

const shownTools = computed(() =>
  keyword.value ? searchTools(keyword.value) : toolsByCategory(category.value)
)

const searchHits = computed(() => searchTools(keyword.value))

function countOf(catKey) {
  if (catKey === 'all') return TOOL_COUNT
  return TOOLS.filter((t) => t.cat === catKey).length
}

const favTools = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return favList.value
    .map((id) => getTool(id))
    .filter(Boolean)
    .filter((t) => !kw || (t.name + t.desc + t.keywords).toLowerCase().indexOf(kw) > -1)
})

const recentList = computed(() =>
  recentRaw.value
    .map((r) => {
      const tool = getTool(r.id)
      return tool ? { id: r.id, tool, time: relativeTime(r.at) } : null
    })
    .filter(Boolean)
)

function isFav(id) {
  return favList.value.indexOf(id) > -1
}

function open(tool) {
  if (!tool) return
  haptic()
  uni.navigateTo({ url: '/pages/tool/tool?id=' + tool.id })
}

function reload() {
  favList.value = readFavorites()
  recentRaw.value = readRecent()
}

function onThemeChange(v) {
  setTheme(!!v)
}

function save(key, val) {
  writeSetting(key, val)
  settings.value = readSettings()
}

function confirmClearFav() {
  if (!favList.value.length) {
    toast('本来就是空的')
    return
  }
  uni.showModal({
    title: '清空收藏',
    content: '将移除全部 ' + favList.value.length + ' 个收藏项，无法撤销。',
    confirmText: '清空',
    confirmColor: themeColors.value.danger,
    success(res) {
      if (res.confirm) {
        store.set(STORAGE_KEYS.favorites, [])
        reload()
        toast('已清空收藏')
      }
    },
  })
}

function confirmClearRecent() {
  if (!recentRaw.value.length) {
    toast('本来就是空的')
    return
  }
  uni.showModal({
    title: '清空使用记录',
    content: '将移除全部 ' + recentRaw.value.length + ' 条记录，无法撤销。',
    confirmText: '清空',
    confirmColor: themeColors.value.danger,
    success(res) {
      if (res.confirm) {
        clearRecent()
        reload()
        toast('已清空记录')
      }
    },
  })
}

onMounted(() => {
  reload()
  const s = readSettings()
  if (['home', 'gear', 'fav', 'recent'].indexOf(s.startTab) > -1) tab.value = s.startTab
})
// 从工具页返回时刷新收藏与使用记录
onShow(reload)
</script>

<style scoped>
.shell {
  min-height: 100vh;
  background: var(--pk-bg);
}

/* 顶部 */
.head {
  padding-left: 32rpx;
  padding-right: 32rpx;
  padding-bottom: 8rpx;
  background: var(--pk-bg);
}
.brand {
  display: flex;
  align-items: center;
  padding: 22rpx 0 24rpx;
}
.brand__mark {
  width: 68rpx;
  height: 68rpx;
  border-radius: 20rpx;
  background: var(--pk-accent-soft);
  border: 1px solid var(--pk-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 20rpx;
}
.brand__mark-inner {
  width: 26rpx;
  height: 26rpx;
  border-radius: 6rpx;
  border: 3rpx solid var(--pk-accent);
  position: relative;
}
.brand__mark-inner::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 6rpx;
  height: 6rpx;
  margin: -3rpx 0 0 -3rpx;
  border-radius: 50%;
  background: var(--pk-accent);
}
.brand__text {
  display: flex;
  flex-direction: column;
}
.brand__name {
  font-size: 40rpx;
  font-weight: 700;
  color: var(--pk-text);
  letter-spacing: 4rpx;
  line-height: 1.15;
}
.brand__sub {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 4rpx;
  letter-spacing: 1rpx;
}

/* 搜索 */
.search {
  display: flex;
  align-items: center;
  height: 76rpx;
  padding: 0 22rpx;
  border-radius: 16rpx;
  background: var(--pk-card);
  border: 1px solid var(--pk-line);
  margin-bottom: 8rpx;
}
.search__glass {
  width: 22rpx;
  height: 22rpx;
  border-radius: 50%;
  border: 3rpx solid var(--pk-text-3);
  position: relative;
  margin-right: 18rpx;
  flex-shrink: 0;
}
.search__glass::after {
  content: '';
  position: absolute;
  right: -10rpx;
  bottom: -8rpx;
  width: 12rpx;
  height: 3rpx;
  background: var(--pk-text-3);
  transform: rotate(45deg);
  border-radius: 2rpx;
}
.search__input {
  flex: 1;
  font-size: 27rpx;
  color: var(--pk-text);
  height: 76rpx;
}
.search__clear {
  font-size: 23rpx;
  color: var(--pk-accent);
  padding-left: 16rpx;
  flex-shrink: 0;
}

/* 分类 */
.cats {
  width: 100%;
  white-space: nowrap;
  padding: 12rpx 0 4rpx;
}
.cats__inner {
  display: inline-flex;
  padding: 0 32rpx;
}
.cat {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  flex-grow: 0;
  padding: 12rpx 24rpx;
  margin-right: 16rpx;
  border-radius: 999rpx;
  background: var(--pk-card);
  border: 1px solid var(--pk-line);
}
.cat--on {
  background: var(--pk-accent-soft);
  border-color: var(--pk-accent);
}
.cat--hover {
  opacity: 0.7;
}
.cat__t {
  font-size: 24rpx;
  color: var(--pk-text-2);
  white-space: nowrap;
  line-height: 1.2;
}
.cat--on .cat__t {
  color: var(--pk-accent);
  font-weight: 600;
}
.cat__n {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-left: 10rpx;
}

/* 内容 */
.body {
  padding: 0 32rpx;
}
.section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26rpx 0 16rpx;
}
.section__t {
  font-size: 23rpx;
  color: var(--pk-text-3);
  letter-spacing: 1rpx;
}
.section__a {
  font-size: 23rpx;
  color: var(--pk-accent);
}

/* 网格 */
.grid {
  display: flex;
  flex-wrap: wrap;
  margin: 0 -10rpx;
}
.card {
  width: calc(50% - 20rpx);
  margin: 10rpx;
  padding: 26rpx 24rpx 28rpx;
  border-radius: 20rpx;
  background: var(--pk-card);
  border: 1px solid var(--pk-line);
  position: relative;
  display: flex;
  flex-direction: column;
}
.card--hover {
  opacity: 0.72;
}
.card__n {
  font-size: 29rpx;
  font-weight: 600;
  color: var(--pk-text);
  margin-top: 22rpx;
  letter-spacing: 1rpx;
}
.card__d {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 10rpx;
  line-height: 1.6;
}
.card__star {
  position: absolute;
  top: 24rpx;
  right: 24rpx;
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: var(--pk-accent);
}

/* 记录列表 */
.rec {
  display: flex;
  align-items: center;
  padding: 22rpx 24rpx;
  border-bottom: 1px solid var(--pk-line);
}
.rec--last {
  border-bottom: none;
}
.rec--hover {
  background: var(--pk-seg-bg);
}
.rec__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin: 0 20rpx;
  min-width: 0;
}
.rec__n {
  font-size: 28rpx;
  color: var(--pk-text);
}
.rec__d {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.rec__t {
  font-size: 22rpx;
  color: var(--pk-text-3);
  flex-shrink: 0;
}

/* 设置单元格 */
.cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26rpx 24rpx;
  border-bottom: 1px solid var(--pk-line);
}
.cell--last {
  border-bottom: none;
}
.cell--hover {
  background: var(--pk-seg-bg);
}
.cell__n {
  font-size: 28rpx;
  color: var(--pk-text);
}
.cell__v {
  font-size: 23rpx;
  color: var(--pk-text-3);
}
.foot {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx 0 20rpx;
}
.foot__t {
  font-size: 22rpx;
  color: var(--pk-text-3);
  letter-spacing: 4rpx;
}
.seg-cell {
  padding: 20rpx 24rpx 24rpx;
}
.seg-cell__k {
  display: block;
  font-size: 28rpx;
  color: var(--pk-text);
  margin-bottom: 16rpx;
}

/* 底部导航 */
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 80;
  height: 58px;
  display: flex;
  align-items: center;
  background: var(--pk-card);
  border-top: 1px solid var(--pk-line);
}
.tab {
  flex: 1;
  height: 58px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.tab--hover {
  opacity: 0.6;
}
.tab__g {
  font-size: 30rpx;
  color: var(--pk-text-3);
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: 1rpx;
}
.tab__g--on {
  color: var(--pk-accent);
}
.tab__l {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
  letter-spacing: 1rpx;
}
.tab__l--on {
  color: var(--pk-accent);
}
</style>
