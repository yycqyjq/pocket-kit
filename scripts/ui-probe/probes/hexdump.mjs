/**
 * 十六进制 / 转储（id=hexdump）。输出只在点「转换」后刷新，所以每步都带一次转换。
 * 盯页面上印出来的串：
 *   示例（随身匣 PocketKit）→ 逐字节 hex 与「19 字节」，转储两行偏移 00000000 / 00000010；
 *   AB → `41 42`；匣 → `e5 8c a3`（汉字 3 字节）；
 *   切「十六进制 → 文本」后 48 65 6c 6c 6f 还原成 Hello；带 0x 前缀也能还原成 ABC；
 *   非法输入 zz 报「没有找到十六进制内容」；文本方向清空后报「没有可转储的内容」。
 *
 * 页面上「大写十六进制 / 加 0x 前缀」是 uni-switch，harness 的 SWITCH 点的是行标题
 * （.pk-switch-row__title），实测切不动开关，故这两档不在探针里断言（见报告）。
 */
import { TA, SEG, MINI, BTN } from '../harness.mjs'

const SAMPLE_HEX = 'e9 9a 8f e8 ba ab e5 8c a3 20 50 6f 63 6b 65 74 4b 69 74'

export default {
  name: 'hexdump',
  id: 'hexdump',
  height: 1900,
  steps: [
    { desc: '示例文本：逐字节 hex、19 字节、两行偏移', act: [MINI('示例'), BTN('转换')],
      expect: [SAMPLE_HEX, '19 字节', '00000000', '00000010'],
      forbid: ['undefined', 'NaN', '[object Object]'] },

    { desc: 'AB → 41 42，2 字节', act: [[TA(0), 'AB'], BTN('转换')],
      expect: ['41 42', '2 字节', '00000000'], forbid: ['undefined', 'NaN'] },

    { desc: '汉字「匣」→ e5 8c a3，3 字节', act: [[TA(0), '匣'], BTN('转换')],
      expect: ['e5 8c a3', '3 字节'], forbid: ['undefined', 'NaN'] },

    { desc: '切「十六进制 → 文本」：48 65 6c 6c 6f 还原成 Hello', act: [SEG('十六进制 → 文本'), [TA(0), '48 65 6c 6c 6f'], BTN('转换')],
      expect: ['Hello', '5 字节', '00000000'], forbid: ['undefined', 'NaN'] },

    { desc: '带 0x 前缀的十六进制也能还原成 ABC', act: [[TA(0), '0x41 0x42 0x43'], BTN('转换')],
      expect: ['ABC', '3 字节'], forbid: ['undefined', 'NaN'] },

    { desc: '奇数位 41424：还原 AB、2 字节，页面必须吭声丢掉了末尾半个字节（P3）',
      act: [[TA(0), '41424'], BTN('转换')],
      expect: ['AB', '2 字节', '末尾 1 个十六进制字符凑不成完整字节'],
      forbid: ['undefined', 'NaN'] },

    { desc: '只剩 4 一个字符：全丢光也要吭声，不许误报「没有可转储的内容」',
      act: [[TA(0), '4'], BTN('转换')],
      expect: ['0 字节', '末尾 1 个十六进制字符凑不成完整字节'],
      forbid: ['没有可转储的内容', 'undefined', 'NaN'] },

    { desc: '非法输入 zz：报没有找到十六进制内容', act: [[TA(0), 'zz'], BTN('转换')],
      expect: ['没有找到十六进制内容'], forbid: ['undefined', 'NaN'] },

    { desc: '切回文本方向后清空：报没有可转储的内容', act: [SEG('文本 → 十六进制'), MINI('清空'), BTN('转换')],
      expect: ['没有可转储的内容'], forbid: ['undefined', 'NaN'] },
  ],
}
