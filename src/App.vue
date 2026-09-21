<script>
import { initTheme, setTheme, theme } from '@/utils/theme'

export default {
  onLaunch() {
    initTheme()
    // 启动时把原生界面配色同步成用户上次选择
    setTheme(theme.dark)
  },
  onShow() {},
  onHide() {},
}
</script>

<style>
/* ============================================================
   全局设计变量
   浅色为默认值，深色通过根节点上的 .theme-dark 覆盖
   ============================================================ */
page {
  --pk-bg: #f6f4ef;
  --pk-bg-soft: #efece5;
  --pk-card: #ffffff;
  /* 输入框要比卡片底色略深，否则白底白框在卡片上"看不见" */
  --pk-input: #f4f2ec;
  --pk-seg-bg: #ece9e2;

  --pk-line: rgba(29, 37, 33, 0.08);
  --pk-line-strong: rgba(29, 37, 33, 0.16);
  /* 描边粗细的单一来源。定 1px：跨设备表现最稳（0.5px 在桌面 DPR=1 预览会偏淡）。
     改这一处即可全局调粗细，公共组件与工具边框都走它 */
  --pk-line-w: 1px;

  /* 圆角三档：卡片 lg / 输入与按钮 md / 小元件 sm。
     取值原先散在各组件（20/16/14/12/10 各有拥趸），收口成 token 后改一处全局生效 */
  --pk-radius-lg: 20rpx;
  --pk-radius-md: 14rpx;
  --pk-radius-sm: 10rpx;

  --pk-text: #1d2521;
  --pk-text-2: #5d6862;
  /* 三级文字也要保证可读：此值对米白底约 4.5:1、对白卡片约 4.9:1 */
  --pk-text-3: #68736d;
  /* 占位符单独一个变量。它只出现在 --pk-input 上，而输入框底色比卡片更深，
     所以不能直接借用 --pk-text-3。实测对 #f4f2ec 约 5.0:1。
     ⚠ 这里曾经硬编码 #98a29c —— 那是旧版 --pk-text-3 的值，后者加深后它掉了队，
     只剩 2.35:1。别再写死颜色。 */
  --pk-ph: #5f6a64;

  --pk-accent: #3f7a6e;
  --pk-accent-soft: rgba(63, 122, 110, 0.12);
  /* 压在 accent 填充上的前景色（主按钮文字）。accent 在深色下要提亮做文字，
     但同一个亮绿托不住白字，所以文字色单独成 token 按主题翻转，别和 --pk-accent 混用 */
  --pk-on-accent: #ffffff;
  --pk-danger: #b4553e;
  --pk-danger-soft: rgba(180, 85, 62, 0.35);
  --pk-warn: #a8642f;
  /* 蓝色信息色：代码类标签与数据图表的次强调色（与青瓷主色区分） */
  --pk-info: #4a6fa5;

  --pk-shadow: 0 6rpx 24rpx rgba(29, 37, 33, 0.06);
  --pk-shadow-sm: 0 2rpx 8rpx rgba(29, 37, 33, 0.08);

  background-color: var(--pk-bg);
  color: var(--pk-text);
  font-size: 28rpx;
  font-family: -apple-system, "PingFang SC", "Helvetica Neue", "Source Han Sans SC",
    "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
  line-height: 1.5;
}

/* 深色主题 */
.theme-dark {
  --pk-bg: #14171a;
  --pk-bg-soft: #1a1e22;
  --pk-card: #1d2226;
  --pk-input: #262d32;
  --pk-seg-bg: #242a2f;

  --pk-line: rgba(255, 255, 255, 0.07);
  --pk-line-strong: rgba(255, 255, 255, 0.16);

  --pk-text: #e8e6e1;
  --pk-text-2: #a8b0ac;
  /* 深色下三级文字对暗卡片约 5.1:1 */
  --pk-text-3: #8a948e;
  /* 占位符：对输入框底 #262d32 约 4.8:1（原 #6f7873 只有 3.1:1） */
  --pk-ph: #8f9993;

  --pk-accent: #6bb3a3;
  --pk-accent-soft: rgba(107, 179, 163, 0.16);
  /* 深色下 accent 是提亮绿，白字只有 2.44:1，改用近黑字压出 7.58:1 */
  --pk-on-accent: #101418;
  --pk-danger: #d98070;
  --pk-danger-soft: rgba(217, 128, 112, 0.4);
  --pk-warn: #d0a05a;
  --pk-info: #8fb0de;

  --pk-shadow: 0 6rpx 24rpx rgba(0, 0, 0, 0.35);
  --pk-shadow-sm: 0 2rpx 8rpx rgba(0, 0, 0, 0.3);

  background-color: var(--pk-bg);
  color: var(--pk-text);
}

/* 基础重置 */
view,
text,
scroll-view,
input,
textarea {
  box-sizing: border-box;
}

/* 输入框占位符 */
.pk-ph {
  color: var(--pk-ph);
}

/* 让 picker 内部元素继承主题文字色 */
picker {
  color: var(--pk-text);
}

/* 去掉 slider 默认边距 */
slider {
  margin: 0;
}

/* ============================================================
   全局小控件修正
   注意：scoped 样式编译后是 `.cls[data-v-xxx]`，特异性 0-2-0。
   如果本地规则也声明了同一个属性，两边特异性打平就由源码顺序决定，
   而组件样式排在 App.vue 之后 —— 本地的会赢。
   所以这里只处理「本地没有声明」的属性，或者把选择器加到 0-3-0 压过去。
   凡是本地已声明同属性的，一律改本地规则，不要在这里硬碰。
   ============================================================ */

/* 输入框旁的小文字动作：原先整块只有 18px 高，手指点不准。
   写成 0-3-0 是为了稳定压过各工具组件里的 scoped 同名规则 */
.pk-page .pk-field .mini-act {
  display: inline-block;
  padding: 20rpx 12rpx;
  margin-left: 12rpx;
  line-height: 1.3;
}

/* 卡片右上角（PkCard 的 extra 插槽）里的小动作不在 .pk-field 内，
   上一条匹配不到。padding 本地规则没有声明，所以 0-2-0 就能生效 */
.pk-page .mini-act {
  display: inline-block;
  padding: 20rpx 12rpx;
  line-height: 1.3;
}

/* 滑杆默认只有 18px 高、很难拖准。本地规则没声明 padding，这条能生效 */
.pk-page uni-slider,
.pk-page .uni-slider {
  padding-top: 16rpx;
  padding-bottom: 16rpx;
  box-sizing: content-box;
}
</style>
