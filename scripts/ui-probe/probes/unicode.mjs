/**
 * Unicode 码点（id=unicode）。盯三处页面上互相咬合的字：
 *   「可疑不可见字符」总数行与「⚠️ 发现不可见字符」明细卡必须对得上账——
 *     输入 a\nb\x01c：总数「1 个」，明细只许列 #4 U+0001，换行（#2 U+000A）
 *     不许混进来（旧版 analyze 把 \n 标可疑而 summarize 不数它，总数 1、明细 2，
 *     同一页两把尺，见 P2 修复）；
 *   逐字符明细的「URL %XX」与「转义全部非 ASCII」卡 URL 档必须同一口径——
 *     输入 A中：明细 A 行 URL 是 A（不是旧版的 %41），转义卡 %E4%B8%ADA；
 *   零宽空格（U+200B）这种真不可见照样要被抓出来，修换行不许修没零宽。
 */
import { TA, SEG, MINI } from '../harness.mjs'

export default {
  name: 'unicode',
  id: 'unicode',
  height: 2400,
  steps: [
    { desc: '多行文本：换行不算可疑，总数与明细对得上（1 个、只列 U+0001）',
      act: [[TA(0), 'a\nb\x01c']],
      expect: ['可疑不可见字符 1 个', '#4', 'U+0001'],
      forbid: ['#2 U+000A', 'undefined', 'NaN'] },

    { desc: '纯多行粘贴不报警：可疑字符显示「无」，明细卡整个不出现',
      act: [[TA(0), 'line1\nline2\nline3']],
      expect: ['可疑不可见字符 无'],
      forbid: ['发现不可见字符', 'undefined', 'NaN'] },

    { desc: '零宽空格仍被抓出：总数 1、明细列 U+200B',
      act: [[TA(0), 'a​b']],
      expect: ['可疑不可见字符 1 个', '#2', 'U+200B'],
      forbid: ['undefined', 'NaN'] },

    { desc: '明细 URL 列与转义卡同口径：A 不被编成 %41',
      act: [[TA(0), 'A中'], SEG('URL 百分号')],
      expect: ['URL A', 'A%E4%B8%AD'],
      forbid: ['%41', 'undefined', 'NaN'] },

    { desc: '码点还原卡不受影响：默认 4E2D 6587 还是「中文」，换成十进制也同字',
      act: [[TA(1), '20013 25991']],
      expect: ['结果 中文', '从码点还原文字'],
      forbid: ['无法解析', 'undefined', 'NaN'] },
  ],
}
