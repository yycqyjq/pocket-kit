/**
 * 字节／字符计数（hash / aes / json 三个组件）。
 * 各自的 UTF-8 分段计数收口到 base64.utf8ByteLen 之后，「共 N 字节」那一类计数仍按字节报，
 * 而不是按字符数糊过去。
 *
 * 定位：uni-app 的 placeholder 挂在外层 uni-input 上，内层是 .uni-input-input；textarea 同理。
 */
import { TA, TAP } from '../harness.mjs'

export default {
  name: 'hash-aes-json',
  height: 1200,
  pages: [
    {
      id: 'hash',
      steps: [
        { desc: '默认空输入', act: [], expect: ['等待输入'], forbid: ['字节 /'] },
        { desc: '中文 abc：6 字符 10 字节', act: [[TA(0), '中文 abc']], expect: ['10 字节 / 6 字符'] },
        { desc: 'emoji：2 字符 4 字节', act: [[TA(0), '😀']], expect: ['4 字节 / 2 字符'] },
        { desc: '纯 ASCII', act: [[TA(0), 'abc']], expect: ['3 字节 / 3 字符'] },
        { desc: '摘要照常出', act: [[TA(0), '中文 abc']], expect: ['消息摘要', 'MD5', 'SHA-512'] },
      ],
    },
    {
      id: 'aes',
      steps: [
        { desc: '默认明文按字节报', act: [], expect: ['13 字符 / 38 字节'] },
        { desc: '中文 abc', act: [[TA(0), '中文 abc']], expect: ['6 字符 / 10 字节'] },
        { desc: 'emoji 不糊成 2 字节', act: [[TA(0), '😀']], expect: ['2 字符 / 4 字节'] },
        { desc: '清空', act: [[TA(0), '']], expect: ['长度 —'] },
      ],
    },
    {
      id: 'json',
      steps: [
        { desc: '含中文的 JSON：字符数与字节数分得开', act: [[TA(0), '{"a":"中"}'], TAP('格式化')], expect: ['9 字符 · 11 字节'] },
        { desc: '纯 ASCII', act: [[TA(0), '{"a":1}'], TAP('格式化')], expect: ['7 字符 · 7 字节'] },
        { desc: '报错带位置（引擎给 position 的口径）', act: [[TA(0), '[1,2'], TAP('格式化')], expect: ['解析失败', '第 1 行第 5 列附近'] },
        { desc: '报错带位置（多行，引擎给行列的口径）', act: [[TA(0), '{"a":[1,\n2,\n3 4]}'], TAP('格式化')],
          expect: ['第 3 行第 3 列附近：…{"a":[1,⏎2,⏎3 4]}…'] },
        { desc: '报错没有位置：也不能甩英文给用户', act: [[TA(0), '{"a":}'], TAP('格式化')],
          expect: ['解析失败', '引擎没给出出错位置'], forbid: ['格式有误 Unexpected'] },
      ],
    },
  ],
}
