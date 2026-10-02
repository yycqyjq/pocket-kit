/**
 * 色彩工坊（id=color）。这一页所有结论都印在卡片行里，所以逐行盯渲染出来的那行字：
 *   默认 #3f7a6e 的 HEX/RGB/HSL/小数归一/相近色名/明度、与白/黑字的对比度、达标情况；
 *   三位短写 #fff 要还原成 #FFFFFF 并给出「可短写」的 #fff；
 *   输入不带 # 时组件会自己补（用 readback 盯输入框里那串）；非法串（zzz）不该印任何结果；
 *   八位带透明度的 #ff000080 按前六位算，不许把整串印出来。
 * 期望值全部手算／用标准库独立核算过，不是抄模块输出。
 */
import { IN, MINI } from '../harness.mjs'

export default {
  name: 'color',
  id: 'color',
  height: 2400,
  check: async ({ page, ok }) => {
    const kinds = await page.evaluate(() => [...document.querySelectorAll('input.uni-input-input')].map((e) => e.type))
    ok(kinds.length === 1 && kinds[0] === 'text', '色值输入框是普通文本框（才谈得上填 zzz）：' + JSON.stringify(kinds))
  },
  steps: [
    { desc: '默认 #3f7a6e：六种写法、对比度、达标情况都印出来', act: [],
      expect: ['#3F7A6E', '（不可短写）', 'rgb(63, 122, 110)', 'rgba(63, 122, 110, 1)', 'hsl(168, 32%, 36%)',
        '(0.247, 0.478, 0.431)', '墨绿', '0.161', '与白字对比度', '4.98 : 1', '与黑字对比度', '4.22 : 1',
        '白色文字', 'AA 通过', '互补色', '邻近色', '三角配色', '分裂互补', '点击任意色块即可复制色值'],
      forbid: ['undefined', 'NaN', '[object Object]'] },

    { desc: '#fff 短写：还原成 #FFFFFF，短写行给出 #fff', act: [[IN(0), '#fff']],
      expect: ['#FFFFFF', '#fff', 'rgb(255, 255, 255)', 'hsl(0, 0%, 100%)', '(1.000, 1.000, 1.000)',
        '白', '1.000', '21.00 : 1', '深色文字', 'AAA 通过'],
      forbid: ['undefined', 'NaN'] },

    { desc: '不带 # 输入：组件自己补上井号（盯输入框里的回显）', act: [[IN(0), '3f7a6e']],
      readback: '#3f7a6e',
      expect: ['#3F7A6E', 'rgb(63, 122, 110)'] },

    { desc: '非法串 zzz：预览印「输入色值」，所有结果卡都收起', act: [[IN(0), 'zzz']],
      expect: ['输入色值'],
      forbid: ['#3F7A6E', 'rgb(', 'hsl(', 'undefined', 'NaN', '[object Object]'] },

    { desc: '「随机」按钮：能生成一个合法色值并给出 RGB', act: [MINI('随机')],
      expect: ['各种写法'],
      expectRe: /rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)/,
      forbid: ['输入色值', 'undefined', 'NaN'] },

    { desc: '#ff0000：纯红的三行写法与两个对比度', act: [[IN(0), '#ff0000']],
      expect: ['#FF0000', 'rgb(255, 0, 0)', 'hsl(0, 100%, 50%)', '(1.000, 0.000, 0.000)',
        '红', '0.213', '4.00 : 1', '5.25 : 1', '白色文字', 'AA 通过'],
      forbid: ['undefined', 'NaN'] },

    { desc: '八位带透明度 #ff000080：只按前六位算，不许把整串印出来', act: [[IN(0), '#ff000080']],
      expect: ['#FF0000', 'rgb(255, 0, 0)'],
      forbid: ['FF000080', '#FF000080'] },

    { desc: '清空：回到「输入色值」，结果卡消失', act: [[IN(0), '']],
      expect: ['输入色值'],
      forbid: ['#FF0000', 'rgb(255, 0, 0)', 'AA 通过'] },
  ],
}
