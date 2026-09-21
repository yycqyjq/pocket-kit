/**
 * 剪贴板 / 反馈小工具
 */
export function copyText(text, tip) {
  const str = text === null || text === undefined ? '' : String(text)
  if (!str) {
    uni.showToast({ title: '没有可复制的内容', icon: 'none' })
    return false
  }
  try {
    uni.setClipboardData({
      data: str,
      showToast: false,
      success() {
        uni.showToast({
          title: tip || '已复制',
          icon: 'none',
          duration: 1200,
        })
      },
      fail() {
        uni.showToast({ title: '复制失败', icon: 'none' })
      },
    })
    return true
  } catch (e) {
    uni.showToast({ title: '复制失败', icon: 'none' })
    return false
  }
}

export function toast(title, icon) {
  uni.showToast({
    title: String(title),
    icon: icon || 'none',
    duration: 1500,
  })
}

import { readSettings } from './storage'

/** 轻震动反馈，跟随「点击震动」开关
 *  H5 端没有震动能力，条件编译直接跳过，避免控制台噪音
 */
export function haptic() {
  try {
    if (!readSettings().haptic) return
    // #ifndef H5
    uni.vibrateShort && uni.vibrateShort({ fail() {} })
    // #endif
  } catch (e) {}
}
