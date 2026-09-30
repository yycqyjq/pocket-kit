/**
 * 国际化域名（id=punycode）。修的全在页面上那几行：
 *   「中 文.cn」原来编成中间带空格的 xn-- 照样印结果，63/253 只写在文案里一条没查；
 *   「xn--a」「xn--ib9b」解出看不见的控制字符与孤立代理，还当作「可读形式」印出来；
 *   编码那头收孤立代理，编出一个自己解不回的 xn--（两头尺不一样）；
 *   「ａｐｐｌｅ．ｃｏｍ」不折全角——转出来的 xn-- 跟 apple.com 是两个名字，
 *     钓鱼检查恰恰在这里给错答案，折了又必须说清折了什么，不能悄悄改用户写的串；
 *   「xn--ri7c4agaaa」自称解成「ｆｕｗｗｗｗ」，跟本页编码同一条输入的结果对不上；
 *   「xn---fiq228c」解出来回编不是原来那一串、「a..b.com」空标签、「-abc」首尾连字符照收；
 *   下划线跟中文混一段时编出来的 A 标签自家解析器不认；报错不指是哪一个标签、
 *   零宽空格被说成「空格」；粘 xn-- 进来时拆解表全是「本来就是」，「解出「中文」」算完没人印。
 *
 * 每一条 expect/forbid 都对着 src/utils/punycode.js 打出来的模块原文，不是照着文案猜的。
 * 静态说明卡里有「Punycode 形式 xn--」这类字样，所以 forbid 要写成带标签前缀的那一截。
 */
import { IN, MINI } from '../harness.mjs'

const ZW = String.fromCharCode(0x200b)

export default {
  name: 'punycode',
  id: 'punycode',
  height: 2000,
  check: async ({ page, ok, body }) => {
    const counts = await page.evaluate(() => ({
      input: [...document.querySelectorAll('input.uni-input-input')].map((e) => e.type + ':' + (e.getAttribute('placeholder') || '')),
      mini: [...document.querySelectorAll('.mini-act')].map((e) => e.textContent.trim()),
    }))
    ok(counts.input.length === 1, '输入框就一个：' + JSON.stringify(counts.input))
    ok(counts.mini.length === 3, '三个小动作：' + JSON.stringify(counts.mini))
    // 页面上不许出现英文异常字样，也不许留着那句没验过的「浏览器会拒绝」
    const raw = await body()
    ok(!/浏览器会拒绝|本来就是 Punycode 形式/.test(raw), '改过的文案没残留：旧那句「浏览器会拒绝」不在页面上')
    ok(/NFKC/.test(raw), '折叠口径写在页面上（NFKC 那一行）')
  },
  steps: [
    { desc: '默认那串：两行结果、方向、逐标签拆解都在', act: [],
      expect: ['双向结果', '可读形式 中文.cn', 'Punycode 形式 xn--fiq228c.cn', '方向 unicode→ascii', '逐标签拆解',
        '中文 → xn--fiq228c 编码为 xn--fiq228c', 'cn → cn 纯 ASCII，本来就是这种写法'] },
    { desc: '粘 xn-- 进来时表上印「解出」，不许全是「本来就是」', act: [[IN(0), 'xn--fiq228c.cn']],
      expect: ['可读形式 中文.cn', 'xn--fiq228c → 中文 解出「中文」', '方向 ascii→unicode'] },

    { desc: '全角整串折成基本形式（原来转出来是另一个名字）', act: [[IN(0), 'ａｐｐｌｅ．ｃｏｍ']],
      expect: ['Punycode 形式 apple.com', '可读形式 apple.com', '备注 这串里有全角/兼容字符', '「ａｐｐｌｅ．ｃｏｍ」折成「apple.com」再转'],
      forbid: ['Punycode 形式 xn--', '方向 unicode→ascii'] },
    { desc: '全角点后面的 xn-- 照样解，并且说清折了什么', act: [[IN(0), 'xn--fiq228c．cn']],
      expect: ['可读形式 中文.cn', '备注 这串里有全角/兼容字符', '方向 ascii→unicode'] },
    { desc: '全角数字折完只剩数字：照印，不换成 IPv4 简写', act: [[IN(0), '１２３']],
      expect: ['Punycode 形式 123', '备注 这串里有全角/兼容字符'], forbid: ['0.0.0.123', 'Punycode 形式 xn--'] },
    { desc: '只折大小写不开折叠备注（DNS 本来就不区分）', act: [[IN(0), 'WWW.Baidu.COM']],
      expect: ['Punycode 形式 www.baidu.com', '方向 ascii（本就不需要转换）'],
      forbid: ['备注 这串里有全角'] },

    { desc: '标签里有空格：拦住，别再给一张结果卡', act: [[IN(0), '中 文.cn']],
      expect: ['提示 标签「中 文」里有空格'], forbid: ['双向结果', '逐标签拆解'] },
    { desc: '零宽空格报码点，不说成「空格」', act: [[IN(0), '中' + ZW + '文.cn']],
      expect: ['提示 标签「中' + ZW + '文」里有空白字符 U+200B'], forbid: ['双向结果'] },
    { desc: '「xn--a」解出看不见的控制字符：报错点名是哪一段', act: [[IN(0), 'xn--a.com']],
      expect: ['提示 「xn--a」解不出来：解出来的内容里有C1 控制符 U+0080'], forbid: ['双向结果', '可读形式 xn--a.com'] },
    { desc: '孤立代理那种 xn-- 也拦（原来解出一个空字符印在可读行）', act: [[IN(0), 'xn--ib9b.com']],
      expect: ['「xn--ib9b」解不出来', '半个表情符号（孤立的代理字符）'], forbid: ['双向结果'] },
    { desc: '解出来回编对不上（多一个减号那种写法）', act: [[IN(0), 'xn---fiq228c.com']],
      expect: ['「xn---fiq228c」解出来再编回去是「xn--fiq228c」，跟你写的这一串对不上'] },
    { desc: '折完全是 ASCII 的 xn-- 要拒（它跟本页编码的结果不是一个串）', act: [[IN(0), 'xn--ri7c4agaaa.com']],
      expect: ['「xn--ri7c4agaaa」解出来是「fuwwww」，全是 ASCII'] },
    { desc: '半截扩展数据、算不动的大数都说人话', act: [[IN(0), 'xn--fiq228.com']],
      expect: ['「xn--fiq228」解不出来：Punycode 数据不完整'], forbid: ['Invalid', 'Overflow'] },
    { desc: '大数那一串不许漏出英文异常', act: [[IN(0), 'xn--9999999999999999999999999999.com']],
      expect: ['超出可计算范围'], forbid: ['Overflow', 'URI'] },

    { desc: '64 个字符的标签：文案里那句 63 是真的在查', act: [[IN(0), 'a'.repeat(64) + '.com']],
      expect: ['有 64 个字符，DNS 一个标签最多 63 个'], forbid: ['双向结果'] },
    { desc: '整域名超 253：编码以后才算', act: [[IN(0), [0, 1, 2, 3, 4].map(() => 'a'.repeat(60)).join('.')]],
      expect: ['整个域名编码后是 304 个字符，DNS 最多 253 个'], forbid: ['双向结果'] },
    { desc: '空标签不许悄悄通过', act: [[IN(0), 'a..b.com']],
      expect: ['第 2 个标签是空的，标签之间要点开一段内容'], forbid: ['双向结果'] },
    { desc: '连字符开头', act: [[IN(0), '-abc.com']], expect: ['标签「-abc」不能以「-」开头'], forbid: ['双向结果'] },
    { desc: '连字符结尾', act: [[IN(0), 'abc-.com']], expect: ['标签「abc-」不能以「-」结尾'] },
    { desc: '第 3、4 位都是连字符（那两个位置是 xn-- 专用）', act: [[IN(0), 'ab--cd.com']],
      expect: ['标签「ab--cd」第 3、4 位不能都是「-」'] },
    { desc: '斜杠不是域名该带的东西，指着那一截', act: [[IN(0), '中文.cn/path']],
      expect: ['标签「cn/path」里的字符「/」不能出现在域名里'] },
    { desc: '服务记录名那种下划线开头照收', act: [[IN(0), '_dmarc.example.com']],
      expect: ['Punycode 形式 _dmarc.example.com', '方向 ascii（本就不需要转换）'], forbid: ['提示 '] },
    { desc: '两个下划线开头也算一个标签里只许开头那一个', act: [[IN(0), '__txt.example.com']],
      expect: ['标签「__txt」里的字符「_」不能出现在域名里'] },
    { desc: '下划线跟中文混一段：编出来的 A 标签自家不认，所以在这儿就拦', act: [[IN(0), '_x中文.com']],
      expect: ['标签「_x中文」里的字符「_」不能出现在域名里'], forbid: ['xn--_x'] },
    { desc: '下划线在中间', act: [[IN(0), '中文_search.cn']], expect: ['标签「中文_search」里的字符「_」不能出现在域名里'] },

    { desc: '末尾的点是根标签：留着且说出来', act: [[IN(0), '中文.cn.']],
      expect: ['Punycode 形式 xn--fiq228c.cn.', '备注 末尾的点是 DNS 的根标签，已原样留着'] },
    { desc: 'xn-- 与中文混着写要提醒两种都要看', act: [[IN(0), 'xn--fiq228c.中文']],
      expect: ['备注 这串里既有 xn-- 又有非 ASCII 字符', '方向 unicode→ascii', '可读形式 中文.中文'] },
    { desc: '光一个 xn--：说后面没内容，不是说「不能以减号结尾」', act: [[IN(0), 'xn--']],
      expect: ['「xn--」后面没有内容'] },
    { desc: 'xn-- 套 xn--', act: [[IN(0), 'xn--xn---.com']], expect: ['解出来自己又带 xn-- 前缀'] },

    { desc: '清空之后结果卡撤掉，静态说明还在', act: [MINI('清空')],
      expect: ['什么是 Punycode'], forbid: ['双向结果', '逐标签拆解', '方向 ', '提示 '] },
    { desc: '只有空格的输入：不谎称转换完成，也不偷偷把空格吞了', act: [[IN(0), '   ']],
      forbid: ['双向结果', '逐标签拆解', '提示 '], readback: '   ' },
  ],
}
