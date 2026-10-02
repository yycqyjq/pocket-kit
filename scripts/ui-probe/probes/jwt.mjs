/**
 * JWT 解析（id=jwt）。令牌都是手工拼的三段 Base64URL（header/payload 用固定 JSON 自己编），
 * 盯页面上印出来的字段值：
 *   HS256 令牌要印出 alg=HS256、家族 HMAC、签名 32 字节，以及载荷里的 sub/name 原文；
 *   没有 exp 要明确印「无有效期」+「永不过期」的告警，不能拿别的字段冒充；
 *   Bearer 前缀要照解；段数不对、载荷不是 JSON、alg=none 各自印对应那句；
 *   清空后回到「等一个 JWT」，不留上一次的字段。
 * 这些令牌的 base64url 是按 header/payload 的固定 JSON 自己算出来的，不是抄模块输出。
 */
import { TA, MINI } from '../harness.mjs'

// {"alg":"HS256","typ":"JWT"} . {"sub":"1234567890","name":"John Doe","iat":1516239022}
const TOKEN_HS256 =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ' +
  '.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

// {"alg":"none","typ":"JWT"} . {"sub":"attacker"} . abc
const TOKEN_NONE =
  'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhdHRhY2tlciJ9.abc'

// 头部合法、载荷是 base64url("notjson") 的令牌
const TOKEN_BAD_PAYLOAD =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.bm90anNvbg.x'

export default {
  name: 'jwt',
  id: 'jwt',
  height: 2200,
  steps: [
    { desc: '手工构造的 HS256：算法/家族/签名长度/载荷字段都要印出来', act: [[TA(0), TOKEN_HS256]],
      expect: ['3 段', 'HS256', 'HMAC 对称签名', '无有效期', '32 字节',
        '1234567890', 'John Doe', '主体（subject），通常是用户 ID',
        '载荷里没有 exp，意味着这个令牌永不过期'],
      forbid: ['undefined', 'NaN', '[object Object]', '解析失败'] },

    { desc: '带 Bearer 前缀照样解出三段', act: [[TA(0), 'Bearer ' + TOKEN_HS256]],
      expect: ['3 段', 'HS256', '1234567890'], forbid: ['undefined', 'NaN'] },

    { desc: '只有两段：说清段数', act: [[TA(0), 'eyJhIjoxfQ.eyJhIjoxfQ']],
      expect: ['只有 2 段'], forbid: ['HS256', 'undefined', 'NaN'] },

    { desc: '多了一段：说清现在有 4 段', act: [[TA(0), TOKEN_HS256 + '.extra']],
      expect: ['现在有 4 段'], forbid: ['HS256', 'undefined', 'NaN'] },

    { desc: '载荷不是 JSON：点到「载荷」而不是报成头部', act: [[TA(0), TOKEN_BAD_PAYLOAD]],
      expect: ['载荷不是合法 JSON'], forbid: ['undefined', 'NaN'] },

    { desc: 'alg=none：家族是无签名，并给出伪造告警', act: [[TA(0), TOKEN_NONE]],
      expect: ['alg 是 none，签名形同虚设', '无签名', 'attacker'],
      forbid: ['HMAC 对称签名', 'undefined', 'NaN'] },

    { desc: '清空：回到「等一个 JWT」，不留上一次字段', act: [MINI('清空')],
      expect: ['等一个 JWT'], forbid: ['HS256', '无签名', 'undefined', 'NaN'] },
  ],
}
