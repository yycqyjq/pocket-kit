/**
 * 金额大写（id=cny）。大写读法全部按中文财务规范手写，不抄模块输出：
 *   1234.56 → 壹仟贰佰叁拾肆元伍角陆分（日常读法：一千二百三十四元五角六分）；
 *   100 → 壹佰元整；10001 → 壹万零壹元整（万位断档补零）；
 *   0.01 → 零元壹分；1.234 → 壹元贰角叁分；1.235 → 壹元贰角肆分（四舍五入到分）；
 *   100000000 → 壹亿元整；快捷「10000」→ 壹万元整；
 *   超出万亿位报「数值过大」；切「整数」后 1234 → 壹仟贰佰叁拾肆 / 一千二百三十四。
 */
import { IN, SEG, CHIP } from '../harness.mjs'

export default {
  name: 'cny',
  id: 'cny',
  height: 1500,
  steps: [
    { desc: '默认 1234.56：大写与日常读法、角分拆解都对', act: [],
      expect: ['壹仟贰佰叁拾肆元伍角陆分', '一千二百三十四元五角六分', '5 角', '6 分'],
      forbid: ['undefined', 'NaN', '[object Object]'] },

    { desc: '100 → 壹佰元整', act: [[IN(0), '100']],
      expect: ['壹佰元整', '一百元整'], forbid: ['undefined', 'NaN'] },

    { desc: '10001 → 壹万零壹元整（万位断档补零）', act: [[IN(0), '10001']],
      expect: ['壹万零壹元整', '一万零一元整'], forbid: ['undefined', 'NaN'] },

    { desc: '0.01 → 零元壹分', act: [[IN(0), '0.01']],
      expect: ['零元壹分', '零元一分'], forbid: ['undefined', 'NaN'] },

    { desc: '1.234 → 壹元贰角叁分（第三位 4 不进位）', act: [[IN(0), '1.234']],
      expect: ['壹元贰角叁分'], forbid: ['壹元贰角肆分', 'undefined', 'NaN'] },

    { desc: '1.235 → 壹元贰角肆分（第三位 5 进位）', act: [[IN(0), '1.235']],
      expect: ['壹元贰角肆分'], forbid: ['壹元贰角叁分', 'undefined', 'NaN'] },

    { desc: '100000000 → 壹亿元整', act: [[IN(0), '100000000']],
      expect: ['壹亿元整'], forbid: ['undefined', 'NaN'] },

    { desc: '快捷「10000」→ 壹万元整', act: [CHIP('10000')],
      expect: ['壹万元整'], forbid: ['undefined', 'NaN'] },

    { desc: '超出万亿位：报数值过大', act: [[IN(0), '10000000000000000']],
      expect: ['数值过大，本工具支持到「万亿」位'],
      forbid: ['壹万元整', 'undefined', 'NaN'] },

    { desc: '切「整数」：1234 → 壹仟贰佰叁拾肆 / 一千二百三十四', act: [SEG('整数'), [IN(0), '1234']],
      expect: ['壹仟贰佰叁拾肆', '一千二百三十四'], forbid: ['undefined', 'NaN'] },
  ],
}
