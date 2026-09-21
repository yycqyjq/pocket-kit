/**
 * 本地存储封装
 * 所有持久化数据都经过这一层，方便日后换存储方案或做迁移
 */
const KEY = {
  theme: 'pk.theme',
  favorites: 'pk.favorites',
  recent: 'pk.recent',
  settings: 'pk.settings',
  drafts: 'pk.drafts',
}

export const STORAGE_KEYS = KEY

function safeGet(key, def) {
  try {
    const v = uni.getStorageSync(key)
    if (v === '' || v === null || v === undefined) return def
    return v
  } catch (e) {
    return def
  }
}

function safeSet(key, val) {
  try {
    uni.setStorageSync(key, val)
    return true
  } catch (e) {
    return false
  }
}

export const store = {
  get: safeGet,
  set: safeSet,
  remove(key) {
    try {
      uni.removeStorageSync(key)
    } catch (e) {}
  },
}

/* ---------------- 主题 ---------------- */

export function readTheme() {
  return safeGet(KEY.theme, 'light') === 'dark' ? 'dark' : 'light'
}

export function writeTheme(mode) {
  safeSet(KEY.theme, mode === 'dark' ? 'dark' : 'light')
}

/* ---------------- 收藏 ---------------- */

export function readFavorites() {
  const list = safeGet(KEY.favorites, [])
  return Array.isArray(list) ? list : []
}

export function isFavorite(id) {
  return readFavorites().indexOf(id) > -1
}

/** 切换收藏，返回切换后的状态 */
export function toggleFavorite(id) {
  const list = readFavorites()
  const i = list.indexOf(id)
  if (i > -1) {
    list.splice(i, 1)
    safeSet(KEY.favorites, list)
    return false
  }
  list.unshift(id)
  safeSet(KEY.favorites, list)
  return true
}

/* ---------------- 最近使用 ---------------- */

const RECENT_MAX = 24

export function readRecent() {
  const list = safeGet(KEY.recent, [])
  return Array.isArray(list) ? list : []
}

/** 记录一次使用，按时间倒序、去重、限长 */
export function pushRecent(id) {
  const list = readRecent().filter((x) => x.id !== id)
  list.unshift({ id, at: Date.now() })
  safeSet(KEY.recent, list.slice(0, RECENT_MAX))
}

export function clearRecent() {
  safeSet(KEY.recent, [])
}

/* ---------------- 设置 ---------------- */

const DEFAULT_SETTINGS = {
  haptic: true, // 点击震动反馈
  startTab: 'home', // 启动时默认停留的页签
}

export function readSettings() {
  const s = safeGet(KEY.settings, {})
  return Object.assign({}, DEFAULT_SETTINGS, s && typeof s === 'object' ? s : {})
}

export function writeSetting(key, val) {
  const s = readSettings()
  s[key] = val
  safeSet(KEY.settings, s)
  return s
}

/* ---------------- 工具草稿（记住上次输入） ---------------- */

export function readDraft(toolId) {
  const all = safeGet(KEY.drafts, {})
  return (all && all[toolId]) || null
}

export function writeDraft(toolId, data) {
  const all = safeGet(KEY.drafts, {})
  const next = all && typeof all === 'object' ? all : {}
  next[toolId] = data
  safeSet(KEY.drafts, next)
}
