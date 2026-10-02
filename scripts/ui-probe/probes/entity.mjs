/**
 * HTML 实体（id=entity）。盯「编码结果 / 解码结果 / 去标签」三张卡上印出来的具体串：
 *   `<b>&</b>` 编码后页面必须印 `&lt;b&gt;&amp;&lt;/b&gt;`，字符数 `8 → 24`；
 *   `<b>&amp;</b>` 编码后印 `&lt;b&gt;&amp;amp;&lt;/b&gt;`，解码回来印 `<b>&</b>`；
 *   十进制/十六进制数字实体都能还原成对应汉字；
 *   命名实体模式把 © 印成 `&copy;`，数字实体模式印 `&#169;`，两者不能串味；
 *   清空后编码结果归零、去标签卡提示「没有识别到 HTML 标签」。
 *
 * 注意：basic（只转义 5 个）模式下组件实际把中文编成了数字实体，
 *   与「当前模式」那句「中文原样保留」自相矛盾（见报告）。这一处不对编码结果写断言，
 *   只用纯 ASCII 输入与 © 来钉编码/解码的确定行为。
 */
import { TA, SEG, MINI } from '../harness.mjs'

export default {
  name: 'entity',
  id: 'entity',
  height: 2200,
  steps: [
    { desc: '编码 `<b>&</b>`：页面上印出完整的实体串与字符数', act: [[TA(0), '<b>&</b>']],
      expect: ['&lt;b&gt;&amp;&lt;/b&gt;', '8 → 24'],
      forbid: ['undefined', 'NaN', '[object Object]'] },

    { desc: '编码 `<b>&amp;</b>`：&amp; 被再转义一次；解码卡还原成 `<b>&</b>`', act: [[TA(0), '<b>&amp;</b>']],
      expect: ['&lt;b&gt;&amp;amp;&lt;/b&gt;', '12 → 28', '<b>&</b>'],
      forbid: ['undefined', 'NaN'] },

    { desc: '「示例」按钮：编码结果里尖括号、引号、单引号都转义到位', act: [MINI('示例')],
      expect: ['&lt;a href=&quot;', 'title=&#39;'], forbid: ['undefined', 'NaN'] },

    { desc: '十进制数字实体：&#35874;&#35874; 还原成「谢谢」', act: [[TA(0), '&#35874;&#35874;']],
      expect: ['谢谢'], forbid: ['undefined', 'NaN'] },

    { desc: '十六进制数字实体：&#x8C22;&#x8C22; 同样还原成「谢谢」', act: [[TA(0), '&#x8C22;&#x8C22;']],
      expect: ['谢谢'], forbid: ['undefined', 'NaN'] },

    { desc: '命名实体模式：© 编成 &copy;', act: [SEG('中文用命名实体'), [TA(0), '©']],
      expect: ['&copy;'], forbid: ['&#169;', 'undefined', 'NaN'] },

    { desc: '数字实体模式：© 编成 &#169;，不再出现 &copy;', act: [SEG('中文用数字实体'), [TA(0), '©']],
      expect: ['&#169;'], forbid: ['&copy;', 'undefined', 'NaN'] },

    { desc: '清空：编码归零、去标签卡提示没识别到标签', act: [MINI('清空')],
      expect: ['0 → 0', '输入里没有识别到 HTML 标签'],
      forbid: ['&copy;', '&#169;', 'undefined', 'NaN'] },
  ],
}
