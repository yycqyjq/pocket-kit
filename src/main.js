import { createSSRApp } from 'vue'
import App from './App.vue'

export function createApp() {
  const app = createSSRApp(App)
  // 单个工具的渲染异常不再拖垮整个应用：给出友好提示，控制台留痕
  app.config.errorHandler = (err) => {
    console.error('渲染异常：', err)
    try {
      uni.showToast({ title: '出了点小问题：' + String((err && err.message) || err).slice(0, 24), icon: 'none' })
    } catch (e) {}
  }
  return {
    app,
  }
}
