/**
 * 主题：单例响应式状态
 * 用法：import { theme, toggleTheme } from '@/utils/theme'
 *      页面根节点 :class="{ 'theme-dark': theme.dark }"
 */
import { reactive, computed } from 'vue'
import { readTheme, writeTheme, hasStoredTheme } from './storage'

export const theme = reactive({
  dark: false,
  ready: false,
})

/**
 * 原生 API（uni.showModal 的 confirmColor、<switch> 的 color）不解析 CSS 变量，
 * 只能在 JS 侧留一份语义色镜像。值必须与 App.vue 的 --pk-accent / --pk-danger /
 * --pk-warn 严格一致；改主题色时两处一起改。
 */
const SEMANTIC_LIGHT = { accent: '#3F7A6E', danger: '#B4553E', warn: '#A8642F' }
const SEMANTIC_DARK = { accent: '#6BB3A3', danger: '#D98070', warn: '#D0A05A' }

/** 当前主题下的语义色，供原生 API 绑定用（响应式） */
export const themeColors = computed(() => (theme.dark ? SEMANTIC_DARK : SEMANTIC_LIGHT))

export function initTheme() {
  if (hasStoredTheme()) {
    // 用户手动切过：以存档为准
    theme.dark = readTheme() === 'dark'
  } else {
    // 首次启动：跟随系统深浅色，并把这份选择存档
    let sysDark = false
    try {
      const sys = uni.getSystemInfoSync()
      sysDark = sys.theme === 'dark'
    } catch (e) {}
    theme.dark = sysDark
    writeTheme(theme.dark ? 'dark' : 'light')
  }
  theme.ready = true
}

export function setTheme(dark) {
  theme.dark = !!dark
  writeTheme(theme.dark ? 'dark' : 'light')
  syncNativeUI()
}

export function toggleTheme() {
  setTheme(!theme.dark)
}

/** 同步原生界面到当前主题（状态栏图标与底色、窗口背景） */
export function syncNativeUI() {
  const dark = theme.dark
  // #ifdef APP-PLUS
  try {
    if (typeof plus !== 'undefined' && plus.navigator) {
      // 状态栏图标：深色主题用浅色图标，浅色主题用深色图标
      plus.navigator.setStatusBarStyle(dark ? 'light' : 'dark')
      // 状态栏底色跟随页面背景，避免深色下顶栏露出浅色条
      plus.navigator.setStatusBarBackground(dark ? '#14171A' : '#F6F4EF')
    }
  } catch (e) {}
  try {
    if (typeof plus !== 'undefined' && plus.webview) {
      // 原生窗口背景：过滚动与冷启动瞬间露出的就是它
      const wv = plus.webview.currentWebview()
      if (wv) wv.setStyle({ background: dark ? '#14171A' : '#F6F4EF' })
    }
  } catch (e) {}
  // #endif
  try {
    if (uni.setNavigationBarColor) {
      uni.setNavigationBarColor({
        frontColor: dark ? '#ffffff' : '#000000',
        backgroundColor: dark ? '#14171A' : '#F6F4EF',
        animation: { duration: 0, timingFunc: 'linear' },
        fail() {},
      })
    }
  } catch (e) {}
}
