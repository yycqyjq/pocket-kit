/**
 * 系统信息：状态栏高度、安全区、屏幕宽度
 * 单独抽出来是因为自定义导航栏和多处布局都要用
 */
let info
try {
  info = uni.getSystemInfoSync() || {}
} catch (e) {
  info = {}
}

/** 状态栏高度（px） */
export const statusBarHeight = info.statusBarHeight || 20

/** 导航栏内容区高度（px） */
export const navContentHeight = 44

/** 整条导航栏总高度（px） */
export const navTotalHeight = statusBarHeight + navContentHeight

/** 底部安全区（px） */
export const safeBottom =
  (info.safeAreaInsets && info.safeAreaInsets.bottom) || 0

/** 屏幕宽度（px） */
export const windowWidth = info.windowWidth || 375
