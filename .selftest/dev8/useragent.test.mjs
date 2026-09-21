/** useragent.js 自查：真实 UA 样本的关键结论 + 生成器自洽 + 边界输入 */
import { useUtils, makeTest } from '../harness.mjs'

const T = makeTest('useragent')
const { parseUA, splitUA, buildUA, selfTest, UA_SAMPLES, UA_PLATFORMS, UA_BROWSERS, UA_NOTES } = await useUtils('useragent')

const p = (ua) => parseUA(ua)
const S = (i) => UA_SAMPLES[i].ua

/* ---------- 自检器本身 ---------- */
const st = selfTest()
T.ok('内置自检全绿（失败项：' + st.rows.filter((r) => !r.ok).map((r) => r.name).join('、') + '）', st.ok)
T.ok('自检条目 ≥ 20', st.total >= 20)

/* ---------- 边界与报错 ---------- */
T.throws('空 UA 报中文错', () => p(''))
T.throws('只有空格同样报错', () => p('    '))
T.throws('超长输入报错', () => p('Mozilla/5.0 (' + 'a'.repeat(3000) + ')'))
T.ok('300 字符的合法 UA 仍能解析', p('Mozilla/5.0 (Linux; Android 13; ' + 'X'.repeat(240) + ') AppleWebKit/537.36 K').raw.length > 250)
T.eq('只有 Mozilla/5.0 时系统未识别', p('Mozilla/5.0').os.name, '未识别')
T.ok('只有 Mozilla/5.0 时给出可信度提醒', p('Mozilla/5.0').trust.length >= 1)
T.eq('中文伪 UA 不崩', p('随身匣浏览器/1.0 (手机; 中文系统)').browser.name, '未识别')
T.ok('未知产品令牌有说明', /未收录/.test(splitUA('FooBar/1.0 (Linux; Android 13)')[0].note + splitUA('FooBar/1.0').map((x) => x.note).join()))

/* ---------- 浏览器识别（顺序即优先级） ---------- */
T.eq('Chrome 桌面：浏览器', p(S(0)).browser.name, 'Chrome')
T.eq('Chrome 桌面：版本', p(S(0)).browser.version, '120.0.0.0')
T.eq('Chrome 桌面：内核', p(S(0)).engine.name, 'Blink')
T.eq('Edge 不能被认成 Chrome', p(S(3)).browser.name, 'Microsoft Edge')
T.eq('Edge 版本取 Edg/', p(S(3)).browser.version, '120.0.2210.91')
T.eq('Edge 内核标注为 Chromium 版', p(S(3)).engine.name, 'Blink（Edge Chromium）')
T.eq('小米浏览器优先于 Chrome', p(S(16)).browser.name, '小米浏览器')
T.eq('微信内置优先于 WebKit', p(S(9)).browser.name, '微信内置浏览器')
T.eq('微信版本', p(S(9)).browser.version, '8.0.44')
T.eq('无头 Chrome', p(S(14)).browser.name, '无头 Chrome')
T.eq('iOS Chrome 认成 CriOS', p('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/101.0.4951.34 Mobile/15E148 Safari/604.1').browser.name, 'Chrome（iOS）')
T.eq('Opera 不能被认成 Chrome', p('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0').browser.name, 'Opera')
T.eq('SamsungBrowser', p('Mozilla/5.0 (Linux; Android 13; SM-S9080) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/111.0.0.0 Mobile Safari/537.36').browser.name, 'Samsung Internet')
T.eq('IE 11 只带 Trident', p(S(15)).browser.name, 'Internet Explorer 11')
T.eq('IE 版本从 rv: 取', p(S(15)).browser.version, '11.0')
T.eq('IE 内核', p(S(15)).engine.name, 'MSHTML（Trident）')
T.eq('MSIE 老写法', p('Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.1; Trident/4.0)').browser.name, 'Internet Explorer 8')
T.eq('Firefox 浏览器', p(S(2)).browser.name, 'Firefox')
T.eq('Firefox 内核版本取 rv:', p(S(2)).engine.version, '121.0')
T.eq('iOS Safari 版本取 Version/ 而非 Safari/', p(S(7)).browser.version, '17.4')
T.eq('Safari 内核', p(S(7)).engine.name, 'WebKit')
T.eq('curl 认不出浏览器', p(S(12)).browser.name, '未识别')

/* ---------- 操作系统 ---------- */
T.eq('Win10/11 合并', p(S(0)).os.name, 'Windows 10 / 11')
T.ok('Win10/11 说明里点出无法区分', /Win11|11/.test(p(S(0)).os.note))
T.eq('Win7', p('Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/49.0.3668.100 Safari/537.36').os.name, 'Windows 7')
T.eq('WinXP', p('Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 5.1)').os.name, 'Windows XP')
T.eq('macOS 下划线换点', p(S(1)).os.version, '10.15.7')
T.eq('iOS 下划线换点', p(S(7)).os.version, '17.4')
T.eq('Android 带版本', p(S(4)).os.name, 'Android')
T.eq('Android 版本号', p(S(4)).os.version, '13')
T.eq('ChromeOS', p('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.95 Safari/537.36').os.name, 'ChromeOS')
T.eq('鸿蒙提示', p('Mozilla/5.0 (Linux; Android 10; JSC-AL50) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.88 HuaweiBrowser/12.0.5.320 Mobile Safari/537.36 HMSCore/6.11.0.301').device.hint.indexOf('鸿蒙') > -1, true)
T.eq('Linux 桌面', p(S(2)).os.name, 'Linux')

/* ---------- 设备形态与厂商 ---------- */
T.eq('桌面 UA 形态', p(S(0)).device.kind, 'desktop')
T.eq('iPhone 形态', p(S(7)).device.kind, 'mobile')
T.eq('iPhone 机型', p(S(7)).device.model, 'iPhone')
T.eq('iPhone 厂商', p(S(7)).device.vendor, 'Apple')
T.eq('Pixel 机型', p(S(4)).device.model, 'Pixel 7')
T.eq('Pixel 厂商', p(S(4)).device.vendor, 'Google')
T.eq('三星机型', p(S(5)).device.model, 'SM-S9080')
T.eq('三星厂商', p(S(5)).device.vendor, '三星')
T.eq('Android 无 Mobile 判平板', p(S(16)).device.kind, 'tablet')
T.eq('Android 有 Mobile 判手机', p(S(5)).device.kind, 'mobile')
T.eq('机型抹成 K 有专门说明', /抹成 K|K，/.test(p(S(6)).device.modelNote), true)
T.eq('电视 UA 形态', p(S(17)).device.kind, 'tv')
T.eq('手表 UA 形态', p('Mozilla/5.0 (Linux; Android 8.1.0; Polar Vantage) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.0.0 Mobile Safari/537.36 WearOS/1.0').device.kind, 'watch')
T.eq('车机 UA 形态', p('Mozilla/5.0 (Linux; Android 9; automotive) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36 AndroidAuto/1.0').device.kind, 'car')
T.eq('curl 形态为脚本客户端', p(S(12)).device.kind, 'app')
T.eq('wv 标记提示内嵌 WebView', /WebView/.test(p('Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/108.0.5359.128 Mobile Safari/537.36 wv').device.hint), true)
T.eq('爬虫的说明链接不会被当机型', p(S(10)).device.model, '')

/* ---------- 爬虫 ---------- */
T.eq('Googlebot 判定', p(S(10)).bot.who, 'Google 搜索爬虫')
T.eq('GPTBot 判定', p(S(11)).bot.isBot, true)
T.eq('GPTBot 归属', p(S(11)).bot.who, 'OpenAI（训练/搜索/用户代理）')
T.eq('Baiduspider 判定', p('Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)').bot.who, '百度爬虫')
T.eq('okhttp 判定', p('okhttp/4.9.3').bot.isBot, true)
T.eq('无头浏览器判定', p(S(14)).bot.isBot, true)
T.eq('真人 Chrome 不是爬虫', p(S(0)).bot.isBot, false)
T.eq('微信不是爬虫', p(S(9)).bot.isBot, false)
T.ok('爬虫结论带依据令牌', p(S(10)).bot.token.length > 0)

/* ---------- 片段拆解 ---------- */
const segs = splitUA(S(0))
T.ok('桌面 Chrome 拆出 ≥ 5 段', segs.length >= 5)
T.eq('第一段是 Mozilla/5.0', segs[0].text, 'Mozilla/5.0')
T.ok('Mozilla/5.0 标注为兼容占位', /兼容占位/.test(segs[0].note))
T.eq('KHTML 段归为兼容段', splitUA(S(0)).filter((x) => /KHTML/.test(x.text))[0].kind, '兼容段')
T.eq('平台注释段带括号', segs[1].kind, '平台注释')
T.ok('Chrome 令牌给出判定依据', /据此判定/.test(segs.filter((x) => x.text.indexOf('Chrome/') === 0)[0].note))
T.eq('片段保留原始位置（括号起点）', segs[1].index, 12)
T.ok('iOS 版式也能拆', splitUA(S(7)).length >= 6)

/* ---------- 字段结论 ---------- */
const f = p(S(0)).fields
T.eq('结论字段固定 6 条', f.length, 6)
T.ok('每条都有依据来源', f.every((x) => x.k && x.v && x.from))
T.ok('结论里能读到浏览器名', f[0].v.indexOf('Chrome') === 0)

/* ---------- 生成器 ---------- */
const g = buildUA('chrome', 'windows', '121.0.0.0')
T.eq('生成 Chrome/Win', g.ua, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36')
T.eq('生成的 UA 能再解析回 Chrome', p(g.ua).browser.name, 'Chrome')
T.eq('生成的 UA 版本读回', p(g.ua).browser.version, '121.0.0.0')
T.eq('IE11 强制换 Windows 平台', buildUA('ie11', 'iphone').ua.indexOf('Windows NT') > -1, true)
T.ok('IE11 强制换平台时有提示', /只存在于 Windows/.test(buildUA('ie11', 'iphone').explain.join()))
T.eq('Firefox 模板把 rv: 放进括号', buildUA('firefox', 'linux').ua, 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0')
T.eq('iOS Safari 模板保留 Mobile 段', buildUA('ios-safari', 'iphone').ua.indexOf('Mobile/15E148 Safari/604.1') > -1, true)
T.throws('非法版本号报错', () => buildUA('chrome', 'windows', '12;0'))
T.eq('版本号里的空格会被拒', (() => { try { buildUA('chrome', 'windows', '12 0'); return 'no' } catch (e) { return /版本号/.test(e.message) } })(), true)
let genBad = []
for (const b of UA_BROWSERS) {
  for (const pl of UA_PLATFORMS) {
    const r = buildUA(b.key, pl.key, b.def)
    if (/\{[a-z]+\}/.test(r.ua)) genBad.push(b.key + '/' + pl.key)
    if (r.ua.indexOf('Mozilla/5.0 (') !== 0) genBad.push('前缀不对 ' + b.key)
  }
}
T.eq('10 模板 × 8 平台 全部无残留占位符', genBad.join(' '), '')
T.eq('模板数', UA_BROWSERS.length, 10)
T.eq('平台数', UA_PLATFORMS.length, 8)

/* ---------- 文案与样本 ---------- */
T.ok('样本 ≥ 12 条', UA_SAMPLES.length >= 12)
T.ok('样本都有名字和 UA', UA_SAMPLES.every((s) => s.name && s.ua))
T.ok('样本都能解析（不抛错）', UA_SAMPLES.every((s) => parseUA(s.ua).fields.length === 6))
T.ok('说明 ≥ 4 条', UA_NOTES.length >= 4)
T.ok('说明提到 Client Hints / Reduction', /Client Hints|Reduction/.test(UA_NOTES.map((n) => n.t + n.d).join()))

T.done()
