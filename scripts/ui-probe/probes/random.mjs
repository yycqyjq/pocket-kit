/**
 * 取样与随机类工具（random / password / id / jwt）的界面口径：
 * randomInt 的取模毛病修完之后，区间挡错走 toast，结果落在区间内且全页不许出现 NaN；
 * 「不重复 + 二十亿区间」这一条是盯旧版硬建整段池子的——它必须在一瞬间出结果。
 *
 * 这一页的挡错很多是 toast（只活 1.5 秒），所以断言里用 toast 字段轮询抓文案，
 * 而不是等结果卡；结果卡的个数与取值范围用 results 钉。
 */
import { IN, TA, TAP, SEG, SWITCH } from '../harness.mjs'

const RFC =
  'eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlLA0KICJodHRwOi8vZXhhbXBsZS5jb20vcG9saWN5IjoiYWxsIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const b64u = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url')
const ARRAY_PAYLOAD = b64u({ alg: 'HS256' }) + '.' + b64u([1, 2]) + '.' + 'ZmFrZXNpZw'

export default {
  name: 'random',
  height: 1300,
  pages: [
    {
      id: 'random',
      steps: [
        { desc: '默认区间出结果', act: [TAP('生成')],
          results: { sel: '.chip', count: 1, range: [1, 100], re: /^\d+$/ }, forbid: ['NaN'] },
        { desc: '关掉不重复后填没有整数的区间 → 挡住', act: [SWITCH('结果不重复'), [IN(0), '2.5'], [IN(1), '2.8'], TAP('生成')],
          toast: '区间内没有整数', forbid: ['NaN'] },
        { desc: '区间宽过 2^53 → 挡住', act: [[IN(0), '1'], [IN(1), '10000000000000000'], TAP('生成')],
          toast: '区间太宽，超出能精确表示的整数范围', forbid: ['NaN'] },
        { desc: '不重复 + 二十亿区间（旧版会去建整段池子）', act: [[IN(0), '1'], [IN(1), '2000000000'], [IN(2), '5'], TAP('生成')],
          results: { sel: '.chip', count: 5, range: [1, 2000000000], re: /^\d+$/ }, forbid: ['NaN'], mustBeFast: 3000 },
        { desc: '掷骰子回到 1..6', act: [SEG('硬币骰子'), [IN(0), '20'], TAP('掷骰子')],
          expect: ['统计'], results: { sel: '.roll', count: 20, range: [1, 6], re: /^[1-6]$/ }, forbid: ['NaN'] },
        { desc: '抽签名单', act: [SEG('抽签'), [TA(0), '甲,乙,丙,丁,戊'], [IN(0), '3'], TAP('开始抽取')],
          expect: ['抽中'], results: { sel: '.chip', count: 3 }, forbid: ['NaN'] },
      ],
    },
    {
      id: 'password',
      steps: [{ desc: '重新生成并评强度', act: [TAP('重新生成')], expect: ['信息熵', 'bit', '25 个字符'], forbid: ['NaN'] }],
    },
    {
      id: 'id',
      steps: [{ desc: '默认 UUID 一批', act: [TAP('生成一批')], expect: ['结果'],
        expectRe: /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/, forbid: ['NaN'] }],
    },
    {
      id: 'jwt',
      steps: [
        { desc: 'RFC 7519 样例令牌', act: [[TA(0), RFC]], expect: ['已过期', 'HMAC 对称签名', 'joe'], forbid: ['解析失败', 'NaN'] },
        { desc: '载荷是数组 → 明确报错', act: [[TA(0), ARRAY_PAYLOAD]], expect: ['解析失败', '不是一个对象'], forbid: ['NaN'] },
        { desc: '只有两段 → 说清段数', act: [[TA(0), 'eyJhIjoxfQ.eyJhIjoxfQ']], expect: ['只有 2 段'], forbid: ['NaN'] },
      ],
    },
  ],
}
