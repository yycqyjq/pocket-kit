/**
 * URL 拆解（id=url）。修的毛病全在页面上那几行：
 *   http://[::1]:8080/x 原来主机行印「[」、端口说「协议默认」、路径整截漏进路径；
 *   http://a.com:99999/ 原来照印端口 99999（校验台同一句却说越界），:abc 被塞进路径；
 *   来源原来带着 user:pw@，跟它自己那句「跨域判断就是比这个」打架；
 *   magnet:?xt=… 的参数整段落进路径，「查询参数」卡对着两条参数说「没有查询参数」；
 *   http://a b.com/ 与 http:// 原来给全套答案；纯数字主机（http://300）不说浏览器会换算；
 *   折行粘进来的链接不吭声；解码把字面「+」吃成空格（base64 粘进来就坏）；
 *   编码遇半个表情符号抛英文异常、界面点了没反应；无害化只查串首、点两次叠成 [[.]]；
 *   清空之后结果行还声称「解析完成」；表格每行算出来的注释（协议说明、端口是显式还是默认、
 *     「原文没写路径」）组件从来只取前两列，等于算了丢掉——这轮连注释一起印。
 *
 * 探针喂不出来的两档：孤立代理字符（半个表情）填进 H5 的 textarea 会被浏览器换成 U+FFFD；
 *   type 相关的分支只能靠 scripts/selftest/url.test.mjs。
 * 注意：底部「看不懂的字段」那张常驻卡里有「默认端口 / http 是 80 / user:pass@」这些字样，
 *   forbid 一律避开它们；输入框的值不在 innerText 里，别拿它当判据。
 */
import { TA, BTN, MINI } from '../harness.mjs'

const URLTA = TA(0)
const CODETA = TA(1)
const DEFTA = TA(2)

export default {
  name: 'url',
  id: 'url',
  height: 1800,
  check: async ({ page, ok }) => {
    const counts = await page.evaluate(() => ({
      ta: [...document.querySelectorAll('textarea.uni-textarea-textarea')].length,
      btn: [...document.querySelectorAll('.pk-btn')].map((e) => e.textContent.trim()),
      mini: [...document.querySelectorAll('.mini-act')].map((e) => e.textContent.trim()),
    }))
    ok(counts.ta === 3, '三个文本框（地址 / 编解码 / 无害化）：' + counts.ta)
    const own = counts.btn.filter((t) => t !== '回到匣中')
    ok(own.length === 5, '工具自己的五个按钮：' + JSON.stringify(own))
    ok(counts.mini.length === 4, '四个小动作：' + JSON.stringify(counts.mini))
  },
  steps: [
    { desc: '示例地址：来源不含凭证，注释也印出来了', act: [MINI('示例')],
      expect: ['结果 解析完成', '协议 https（加密 HTTP，默认端口 443）', '用户名 user', '密码 （有）（URL 里不该带密码）',
        '主机 api.example.com（域名）', '端口 8443（显式指定）', '路径 /v2/items', '锚点 section-3（只在本页内跳转，不会发给服务器）',
        '来源 https://api.example.com:8443', '参数个数 4 个'],
      forbid: ['user:pw@api.example.com', '来源 https://user'] },

    { desc: 'IPv6 字面量主机：方括号整段是主机，端口认 8080（原来主机印「[」）', act: [[URLTA, 'http://[::1]:8080/x']],
      expect: ['主机 [::1]（IPv6 地址（方括号写法））', '端口 8080（显式指定）', '路径 /x', '来源 http://[::1]:8080'],
      forbid: ['端口 80（协议默认）', '主机名（可能是内网机器）', '直接写 IP 而没有域名'] },
    { desc: '带路径与参数的 IPv6 主机，端口 80 要说清是默认值', act: [[URLTA, 'http://[2001:db8::1]:80/path?q=1#f']],
      expect: ['主机 [2001:db8::1]（IPv6 地址（方括号写法））', '端口 80（跟 http 的默认端口是同一个）', '路径 /path',
        '查询串 q=1（1 个参数）', '来源 http://[2001:db8::1]', '直接写 IP 而没有域名'],
      forbid: ['端口 80（协议默认）'] },
    { desc: '::1 是环回，不说钓鱼那句', act: [[URLTA, 'http://[::1]/']],
      expect: ['主机 [::1]', '来源 http://[::1]', '路径 /'], forbid: ['直接写 IP 而没有域名'] },
    { desc: 'IPv6 主机的端口越界照样拦', act: [[URLTA, 'http://[::1]:99999/x']],
      expect: ['端口应在 1-65535 之间，当前 99999'], forbid: ['主机 [::1]'] },

    { desc: '端口 99999：跟校验台同一句话（原来照印 99999）', act: [[URLTA, 'http://example.com:99999/']],
      expect: ['端口应在 1-65535 之间，当前 99999'], forbid: ['端口 99999', '协议 http'] },
    { desc: '端口写成 abc：指着端口，别塞进路径', act: [[URLTA, 'http://a.com:abc/']],
      expect: ['「abc」不是端口号'], forbid: ['协议 http', '路径 /abc'] },
    { desc: ':080 印原文并说它跟默认端口是一回事', act: [[URLTA, 'http://a.com:080/']],
      expect: ['端口 080（跟 http 的默认端口是同一个）', '来源 http://a.com'], forbid: ['来源 http://a.com:080'] },

    { desc: '空主机：http:// 不给整套答案', act: [[URLTA, 'http://']],
      expect: ['后面要跟域名或 IP'], forbid: ['协议 http', '来源 http://'] },
    { desc: '主机里有空格：拦住并说清主机是哪一截', act: [[URLTA, 'http://a b.com/']],
      expect: ['主机位里有空格'], forbid: ['协议 http'] },
    { desc: '纯数字主机：说清浏览器会按 IPv4 简写换算', act: [[URLTA, 'http://300/']],
      expect: ['主机 300（纯数字主机', '浏览器会按 IPv4 简写换算', '来源 http://300'], forbid: ['主机 300（域名'] },
    { desc: '邮件里折行的链接：删掉换行要吭一声', act: [[URLTA, 'http://exa\nmple.com/p']],
      expect: ['主机 example.com（域名）', '原文里有换行或制表符'] },

    { desc: '磁力链接的参数看得见（原来对着两条参数说没有）', act: [[URLTA, 'magnet:?xt=urn:btih:abc&tr=http://t/']],
      expect: ['查询串 xt=urn:btih:abc&tr=http://t/（2 个参数）', '参数个数 2 个'],
      forbid: ['这个地址没有查询参数'] },
    { desc: 'mailto 带主题：参数也算出来，来源说清谈不上', act: [[URLTA, 'mailto:me@example.com?subject=hi%20there']],
      expect: ['参数个数 1 个', '来源 —（伪协议没有主机，谈不上来源）'] },
    { desc: '没写路径的协议不再凭空多一个斜杠', act: [[URLTA, 'ssh://user@a.com']],
      expect: ['路径 —（原文没写路径）', '来源 ssh://a.com', '用户名 user'], forbid: ['路径 /'] },
    { desc: 'http 没写路径按规范算 /', act: [[URLTA, 'http://a.com']],
      expect: ['路径 /', '来源 http://a.com'] },

    { desc: '解码不偷吃字面「+」（base64 粘进来会被改坏）', act: [[CODETA, 'Q+c='], BTN('解码')],
      expect: ['结果 Q+c='], forbid: ['Q c='] },
    { desc: '编码那档照旧：%20 与 %26', act: [[CODETA, 'a b&c'], BTN('编码')],
      expect: ['结果 a%20b%26c'] },

    { desc: '无害化把一句话里的两个链接都拆开（原来只查串首）', act: [[DEFTA, 'Visit http://a.com and https://b.com now'], BTN('无害化')],
      expect: ['Visit hxxp[:]//a[.]com and hxxps[:]//b[.]com now'] },
    { desc: '再点一次无害化不许叠成 [[.]]', act: [BTN('无害化')],
      expect: ['Visit hxxp[:]//a[.]com and hxxps[:]//b[.]com now'], forbid: ['[[.]]', '[[@]]'] },
    { desc: '还原回去一字不差', act: [BTN('还原')],
      expect: ['Visit http://a.com and https://b.com now'] },
    { desc: '大写协议名还原后还是大写', act: [[DEFTA, 'HTTP://A.COM'], BTN('无害化')],
      expect: ['HXXP[:]//A[.]COM'] },
    { desc: '大写协议名还原不丢大小写', act: [BTN('还原')],
      expect: ['HTTP://A.COM'], forbid: ['结果 http://A.COM'] },

    { desc: '清空之后不再声称解析完成', act: [MINI('清空')],
      expect: ['还没输入地址'], forbid: ['解析完成', '协议 http'] },
  ],
}
