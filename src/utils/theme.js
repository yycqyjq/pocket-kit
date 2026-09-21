/**
 * 主题：单例响应式状态
 * 用法：import { theme, toggleTheme } from '@/utils/theme'
 *      页面根节点 :class="{ 'theme-dark': theme.dark }"
 */
import { reactive, computed } from 'vue'
import { readTheme, writeTheme } from './storage'

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
  theme.dark = readTheme() === 'dark'
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

/** 同步原生界面（下拉背景、导航栏）到当前主题 */
export function syncNativeUI() {
  const dark = theme.dark
  try {
    if (!uni.setNavigationBarColor) return
    uni.setNavigationBarColor({
      frontColor: dark ? '#ffffff' : '#000000',
      backgroundColor: dark ? '#14171A' : '#F6F4EF',
      animation: { duration: 0, timingFunc: 'linear' },
      fail() {},
    })
  } catch (e) {}
}

/** 返回当前主题下要挂在根节点上的 class 字符串 */
export function themeClass() {
  return theme.dark ? 'theme-dark' : ''
}
