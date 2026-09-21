/**
 * 世界时钟 / 时区换算
 * ------------------------------------------------------------
 * 纯函数层：只吃数字和字符串，不碰 uni、不碰 DOM、不联网。
 *
 * 两套引擎：
 *   1) intl  —— 环境支持 Intl.DateTimeFormat 的 IANA timeZone（H5 / 新版 WebView / Node）
 *               精确处理夏令时、半小时时区、任意时刻与跨日。
 *   2) fixed —— 能力探测失败时降级：只用本文件 ZONES 里的「标准偏移」做算术，
 *               不知道夏令时，结果带 ±1 小时误差提示。
 * 探测见 HAS_TZ：全部走 typeof 能力检查 + 已知答案试跑，缺 ICU 的环境不会抛错。
 *
 * 依据与假设：偏移与夏令时规则按 IANA tzdb 的公开口径整理（约 2024 年资料，
 * std = 冬令时偏移，dst = 夏令时偏移，null = 不实行）。夏令时起止日会随各国政策
 * 临时变动（俄罗斯 2014 年永久 +3、土耳其 2016 年永久 +3、伊朗与巴西分别于
 * 2022 / 2019 年取消夏令时、摩洛哥斋月临时回拨、美国正在讨论全年夏令时），
 * 重要约定请务必与双方当地日历复核。本工具只做换算与提醒，不构成法律、商务或出行建议。
 */

import { pad2, parseTimestamp } from './date'

/* ============================================================ 能力探测 */

/** 是否存在 Intl.DateTimeFormat */
export const HAS_INTL = typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function'

function readWithFormatter(tzKey, date) {
  if (!HAS_INTL) throw new Error('no-intl')
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tzKey,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const p = {}
  const arr = f.formatToParts(date)
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].type !== 'literal') p[arr[i].type] = arr[i].value
  }
  const h = Number(p.hour)
  return pad2(h === 24 || h !== h ? 0 : h) + ':' + pad2(Number(p.minute)) + ':' + pad2(Number(p.second))
}

/** 用三个已知答案（含 45 分钟偏移）验证 timeZone 参数真的生效 */
const TZ_PROBED = (function probe() {
  try {
    const instant = new Date(Date.UTC(2024, 0, 1, 0, 0, 0))
    return (
      readWithFormatter('UTC', instant) === '00:00:00' &&
      readWithFormatter('Asia/Shanghai', instant) === '08:00:00' &&
      readWithFormatter('Asia/Kathmandu', instant) === '05:45:00'
    )
  } catch (e) {
    return false
  }
})()

/** 是否支持 IANA 时区名（false 即降级为固定偏移） */
export const HAS_TZ = TZ_PROBED

/** 当前实际使用的引擎：'intl' | 'fixed' */
export const ENGINE = TZ_PROBED ? 'intl' : 'fixed'

/** 引擎状态说明，视图直接展示 */
export const ENGINE_NOTE = TZ_PROBED
  ? '已启用 Intl 时区引擎：夏令时、半小时时区、跨日均按 IANA tzdb 规则计算。'
  : '当前环境不支持 IANA 时区名（缺少 ICU 数据），已降级为「固定标准偏移」模式：' +
    '只按本表 std 偏移做算术，不计夏令时。有夏令时的城市可能差 1 小时（豪勋爵岛一类的半小时调整差 30 分钟），' +
    '带 ± 标记的结果请自行复核当地日历；升级到较新的 WebView / 浏览器可恢复精确模式。'

/** 使用提示与免责 */
export const CLOCK_NOTES = [
  '排期前先看待会话里的日期：跨日时你以为的「明天上午」，在对方那里可能是「今天夜里」。',
  '涉及夏令时切换日（美国 3 月第二个周日 / 11 月第一个周日，欧洲 3 月与 10 月最后周日，澳洲 10 月与 4 月第一个周日）时，本工具会提示「该时刻不存在」或「该时刻出现两次」。',
  '南北半球夏令时方向相反：北半球 6 月是夏令时，南半球 6 月是冬令时，悉尼与纽约的时差因此在一年里变两次。',
  '全中国只用一个东八区，但新疆、西藏的实际作息比北京时间晚约 2 小时；约当地生意要按作息而不是按钟点。',
  '印度 UTC+5:30、尼泊尔 UTC+5:45、缅甸 UTC+6:30、豪勋爵岛夏令时只拨 30 分钟——半小时时区真实存在，别按整小时心算。',
  '时间戳是从 1970-01-01 UTC 起算的绝对时刻，本身不含任何时区信息；跨端沟通用它最不容易出错。',
  '本工具不做联网校验、不查节假日安排，也不构成法律、商务或出行建议。',
]

/* ============================================================ 时区表 */

/** 中文城市名（搜索与展示） */
export const ZONES = [
  { key: 'UTC', cn: '协调世界时 UTC', en: 'UTC', grp: '基准', std: 0, dst: null, note: '民用时间的基准，不随地方规则变化' },
  { key: 'Etc/GMT+12', cn: 'UTC-12（无人区）', en: 'UTC-12', grp: '基准', std: -720, dst: null, note: '没有常住居民，只有个别岛屿与船舶使用' },

  { key: 'Asia/Shanghai', cn: '北京', en: 'Beijing', grp: '中国', std: 480, dst: null, note: '全中国一个东八区；新疆西藏实际作息晚约 2 小时' },
  { key: 'Asia/Hong_Kong', cn: '中国香港', en: 'Hong Kong', grp: '中国', std: 480, dst: null, note: '' },
  { key: 'Asia/Macau', cn: '中国澳门', en: 'Macao', grp: '中国', std: 480, dst: null, note: '' },
  { key: 'Asia/Taipei', cn: '中国台北', en: 'Taipei', grp: '中国', std: 480, dst: null, note: '' },
  { key: 'Asia/Urumqi', cn: '中国乌鲁木齐', en: 'Urumqi', grp: '中国', std: 360, dst: null, note: 'IANA 保留了 +6 的地方时区，官方时钟仍是北京时间' },

  { key: 'Asia/Tokyo', cn: '东京', en: 'Tokyo', grp: '亚洲', std: 540, dst: null, note: '日本自 1951 年起无夏令时' },
  { key: 'Asia/Seoul', cn: '首尔', en: 'Seoul', grp: '亚洲', std: 540, dst: null, note: '韩国 1988 年后不再实行夏令时' },
  { key: 'Asia/Singapore', cn: '新加坡', en: 'Singapore', grp: '亚洲', std: 480, dst: null, note: '地理上属 +7 却用 +8（历史沿革），所以日出很晚' },
  { key: 'Asia/Kuala_Lumpur', cn: '吉隆坡', en: 'Kuala Lumpur', grp: '亚洲', std: 480, dst: null, note: '东马与半岛同钟' },
  { key: 'Asia/Jakarta', cn: '雅加达', en: 'Jakarta', grp: '亚洲', std: 420, dst: null, note: '印尼跨 +7/+8/+9 三个时区' },
  { key: 'Asia/Manila', cn: '马尼拉', en: 'Manila', grp: '亚洲', std: 480, dst: null, note: '' },
  { key: 'Asia/Bangkok', cn: '曼谷', en: 'Bangkok', grp: '亚洲', std: 420, dst: null, note: '中南半岛普遍无夏令时，一年时差恒定' },
  { key: 'Asia/Ho_Chi_Minh', cn: '胡志明市', en: 'Ho Chi Minh City', grp: '亚洲', std: 420, dst: null, note: '' },
  { key: 'Asia/Yangon', cn: '仰光', en: 'Yangon', grp: '亚洲', std: 390, dst: null, note: 'UTC+6:30，半小时时区' },
  { key: 'Asia/Kathmandu', cn: '加德满都', en: 'Kathmandu', grp: '亚洲', std: 345, dst: null, note: 'UTC+5:45，全球唯一的 45 分钟偏移' },
  { key: 'Asia/Dhaka', cn: '达卡', en: 'Dhaka', grp: '亚洲', std: 360, dst: null, note: '' },
  { key: 'Asia/Karachi', cn: '卡拉奇', en: 'Karachi', grp: '亚洲', std: 300, dst: null, note: '巴基斯坦曾短期试行夏令时' },
  { key: 'Asia/Kolkata', cn: '新德里', en: 'New Delhi', grp: '亚洲', std: 330, dst: null, note: '全印度一个钟：UTC+5:30' },
  { key: 'Asia/Tehran', cn: '德黑兰', en: 'Tehran', grp: '亚洲', std: 210, dst: null, note: '2022 年取消夏令时，永久 UTC+3:30' },
  { key: 'Asia/Dubai', cn: '迪拜', en: 'Dubai', grp: '亚洲', std: 240, dst: null, note: '海湾国家无夏令时' },
  { key: 'Asia/Riyadh', cn: '利雅得', en: 'Riyadh', grp: '亚洲', std: 180, dst: null, note: '' },
  { key: 'Asia/Jerusalem', cn: '耶路撒冷', en: 'Jerusalem', grp: '亚洲', std: 120, dst: 180, note: '起止日按犹太历传统调整，常与欧洲差一周' },
  { key: 'Asia/Almaty', cn: '阿拉木图', en: 'Almaty', grp: '亚洲', std: 300, dst: null, note: '哈萨克斯坦 2024 年把时区整体回拨一小时' },
  { key: 'Asia/Tashkent', cn: '塔什干', en: 'Tashkent', grp: '亚洲', std: 300, dst: null, note: '' },

  { key: 'Europe/London', cn: '伦敦', en: 'London', grp: '欧洲', std: 0, dst: 60, note: '3 月最后周日进 BST，10 月最后周日退出' },
  { key: 'Europe/Dublin', cn: '都柏林', en: 'Dublin', grp: '欧洲', std: 0, dst: 60, note: '法定名称反直觉：冬天叫 standard time 才是 UTC+0' },
  { key: 'Europe/Lisbon', cn: '里斯本', en: 'Lisbon', grp: '欧洲', std: 0, dst: 60, note: '' },
  { key: 'Europe/Madrid', cn: '马德里', en: 'Madrid', grp: '欧洲', std: 60, dst: 120, note: '西班牙地理上属 +0，用的是中欧时间' },
  { key: 'Europe/Paris', cn: '巴黎', en: 'Paris', grp: '欧洲', std: 60, dst: 120, note: '欧盟 2019 年通过取消夏令时决议，至今未落地' },
  { key: 'Europe/Berlin', cn: '柏林', en: 'Berlin', grp: '欧洲', std: 60, dst: 120, note: '欧盟国家同一时刻切换，转机不用担心改表' },
  { key: 'Europe/Amsterdam', cn: '阿姆斯特丹', en: 'Amsterdam', grp: '欧洲', std: 60, dst: 120, note: '' },
  { key: 'Europe/Rome', cn: '罗马', en: 'Rome', grp: '欧洲', std: 60, dst: 120, note: '' },
  { key: 'Europe/Zurich', cn: '苏黎世', en: 'Zurich', grp: '欧洲', std: 60, dst: 120, note: '' },
  { key: 'Europe/Stockholm', cn: '斯德哥尔摩', en: 'Stockholm', grp: '欧洲', std: 60, dst: 120, note: '' },
  { key: 'Europe/Oslo', cn: '奥斯陆', en: 'Oslo', grp: '欧洲', std: 60, dst: 120, note: '' },
  { key: 'Europe/Copenhagen', cn: '哥本哈根', en: 'Copenhagen', grp: '欧洲', std: 60, dst: 120, note: '' },
  { key: 'Europe/Prague', cn: '布拉格', en: 'Prague', grp: '欧洲', std: 60, dst: 120, note: '' },
  { key: 'Europe/Warsaw', cn: '华沙', en: 'Warsaw', grp: '欧洲', std: 60, dst: 120, note: '' },
  { key: 'Europe/Helsinki', cn: '赫尔辛基', en: 'Helsinki', grp: '欧洲', std: 120, dst: 180, note: '' },
  { key: 'Europe/Athens', cn: '雅典', en: 'Athens', grp: '欧洲', std: 120, dst: 180, note: '' },
  { key: 'Europe/Kyiv', cn: '基辅', en: 'Kyiv', grp: '欧洲', std: 120, dst: 180, note: '切换仍在 3 月 / 10 月，战时曾调整作息' },
  { key: 'Europe/Minsk', cn: '明斯克', en: 'Minsk', grp: '欧洲', std: 180, dst: null, note: '白俄罗斯永久 UTC+3' },
  { key: 'Europe/Moscow', cn: '莫斯科', en: 'Moscow', grp: '欧洲', std: 180, dst: null, note: '俄罗斯 2014 年起永久使用「冬令时」' },
  { key: 'Europe/Istanbul', cn: '伊斯坦布尔', en: 'Istanbul', grp: '欧洲', std: 180, dst: null, note: '土耳其 2016 年起永久 UTC+3' },

  { key: 'Africa/Cairo', cn: '开罗', en: 'Cairo', grp: '非洲', std: 120, dst: 180, note: '2023 年恢复夏令时，斋月期间暂停一个月' },
  { key: 'Africa/Lagos', cn: '拉各斯', en: 'Lagos', grp: '非洲', std: 60, dst: null, note: '西非多国都在 UTC+1' },
  { key: 'Africa/Nairobi', cn: '内罗毕', en: 'Nairobi', grp: '非洲', std: 180, dst: null, note: '比伦敦只晚 2 小时，客服排班很省事' },
  { key: 'Africa/Johannesburg', cn: '约翰内斯堡', en: 'Johannesburg', grp: '非洲', std: 120, dst: null, note: '' },
  { key: 'Africa/Casablanca', cn: '卡萨布兰卡', en: 'Casablanca', grp: '非洲', std: 60, dst: null, note: '2018 年起永久 UTC+1，斋月临时回到 UTC+0' },
  { key: 'Africa/Algiers', cn: '阿尔及尔', en: 'Algiers', grp: '非洲', std: 60, dst: null, note: '' },

  { key: 'America/New_York', cn: '纽约', en: 'New York', grp: '美洲', std: -300, dst: -240, note: '美国 3 月第二周日 / 11 月第一周日切换，全年固定夏令时已在立法讨论中' },
  { key: 'America/Toronto', cn: '多伦多', en: 'Toronto', grp: '美洲', std: -300, dst: -240, note: '加拿大大部分省份与美国同步，萨斯喀彻温基本不变' },
  { key: 'America/Chicago', cn: '芝加哥', en: 'Chicago', grp: '美洲', std: -360, dst: -300, note: '' },
  { key: 'America/Denver', cn: '丹佛', en: 'Denver', grp: '美洲', std: -420, dst: -360, note: '' },
  { key: 'America/Phoenix', cn: '菲尼克斯', en: 'Phoenix', grp: '美洲', std: -420, dst: null, note: '亚利桑那（除纳瓦霍保留地）不换表，夏天与洛杉矶同钟' },
  { key: 'America/Los_Angeles', cn: '洛杉矶', en: 'Los Angeles', grp: '美洲', std: -480, dst: -420, note: '与北京相差 15~16 小时，几乎完全昼夜颠倒' },
  { key: 'America/Vancouver', cn: '温哥华', en: 'Vancouver', grp: '美洲', std: -480, dst: -420, note: '' },
  { key: 'America/Anchorage', cn: '安克雷奇', en: 'Anchorage', grp: '美洲', std: -540, dst: -480, note: '' },
  { key: 'America/Mexico_City', cn: '墨西哥城', en: 'Mexico City', grp: '美洲', std: -360, dst: null, note: '墨西哥 2022 年取消夏令时' },
  { key: 'America/El_Salvador', cn: '圣萨尔瓦多', en: 'San Salvador', grp: '美洲', std: -360, dst: null, note: '中美洲多国全年 UTC-6，与北京时差恒定' },
  { key: 'America/Bogota', cn: '波哥大', en: 'Bogota', grp: '美洲', std: -300, dst: null, note: '哥伦比亚全年 UTC-5，作息偏早' },
  { key: 'America/Lima', cn: '利马', en: 'Lima', grp: '美洲', std: -300, dst: null, note: '' },
  { key: 'America/Santiago', cn: '圣地亚哥', en: 'Santiago', grp: '美洲', std: -240, dst: -180, note: '南半球：9 月进夏令时、4 月退出，与北半球相反' },
  { key: 'America/Sao_Paulo', cn: '圣保罗', en: 'Sao Paulo', grp: '美洲', std: -180, dst: null, note: '巴西 2019 年取消夏令时，全年 UTC-3' },
  { key: 'America/Buenos_Aires', cn: '布宜诺斯艾利斯', en: 'Buenos Aires', grp: '美洲', std: -180, dst: null, note: '阿根廷 2009 年起不再切换' },

  { key: 'Australia/Sydney', cn: '悉尼', en: 'Sydney', grp: '大洋洲', std: 600, dst: 660, note: '10 月第一个周日进夏令时、4 月第一个周日退出' },
  { key: 'Australia/Melbourne', cn: '墨尔本', en: 'Melbourne', grp: '大洋洲', std: 600, dst: 660, note: '与悉尼同区，个别年份起止差一天' },
  { key: 'Australia/Brisbane', cn: '布里斯班', en: 'Brisbane', grp: '大洋洲', std: 600, dst: null, note: '昆士兰不实行夏令时，当地夏天比悉尼慢 1 小时' },
  { key: 'Australia/Adelaide', cn: '阿德莱德', en: 'Adelaide', grp: '大洋洲', std: 570, dst: 630, note: '半小时区 + 半小时夏令时（+9:30 / +10:30）' },
  { key: 'Australia/Perth', cn: '珀斯', en: 'Perth', grp: '大洋洲', std: 480, dst: null, note: '西澳与北京同钟' },
  { key: 'Australia/Lord_Howe', cn: '豪勋爵岛', en: 'Lord Howe Island', grp: '大洋洲', std: 630, dst: 660, note: '全球唯一每次只拨 30 分钟的夏令时' },
  { key: 'Pacific/Auckland', cn: '奥克兰', en: 'Auckland', grp: '大洋洲', std: 720, dst: 780, note: '主要城市里最早进入新的一天之一' },
  { key: 'Pacific/Apia', cn: '阿皮亚', en: 'Apia', grp: '大洋洲', std: 780, dst: null, note: '萨摩亚 2011-12-30 直接跳过一天，从最晚改成最早' },
  { key: 'Pacific/Tongatapu', cn: '努库阿洛法', en: "Nuku'alofa", grp: '大洋洲', std: 780, dst: null, note: '' },
  { key: 'Pacific/Kiritimati', cn: '圣诞岛（基里巴斯）', en: 'Kiritimati', grp: '大洋洲', std: 840, dst: null, note: 'UTC+14，最早的民用时区，比北京早 6 小时' },
  { key: 'Pacific/Honolulu', cn: '檀香山', en: 'Honolulu', grp: '大洋洲', std: -600, dst: null, note: '夏威夷无夏令时，与美国本土还跨了国际日期变更线' },
]

/**
 * 搜索别名：IANA 城市名和中文常用名并不总是一致
 * （Asia/Shanghai 在表里叫「北京」，但用户会搜上海），所以单独维护一张对照。
 */
export const ZONE_ALIASES = {
  UTC: '格林尼治 GMT 世界时 零时区',
  'Asia/Shanghai': '上海 广州 深圳 杭州 成都 重庆 西安 中国大陆 东八区',
  'Asia/Hong_Kong': '香港 港',
  'Asia/Macau': '澳门',
  'Asia/Taipei': '台北 台湾',
  'Asia/Urumqi': '乌鲁木齐 新疆',
  'Asia/Tokyo': '东京 日本',
  'Asia/Seoul': '首尔 汉城 韩国',
  'Asia/Singapore': '新加坡 星加坡',
  'Asia/Kuala_Lumpur': '吉隆坡 马来西亚',
  'Asia/Jakarta': '雅加达 印尼 印度尼西亚',
  'Asia/Manila': '马尼拉 菲律宾',
  'Asia/Bangkok': '曼谷 泰国 暹罗',
  'Asia/Ho_Chi_Minh': '胡志明 西贡 越南',
  'Asia/Yangon': '仰光 缅甸',
  'Asia/Kathmandu': '加德满都 尼泊尔',
  'Asia/Dhaka': '达卡 孟加拉',
  'Asia/Karachi': '卡拉奇 巴基斯坦',
  'Asia/Kolkata': '加尔各答 孟买 印度 新德里',
  'Asia/Tehran': '德黑兰 伊朗',
  'Asia/Dubai': '迪拜 阿联酋',
  'Asia/Riyadh': '利雅得 沙特',
  'Asia/Jerusalem': '耶路撒冷 特拉维夫 以色列',
  'Asia/Almaty': '阿拉木图 哈萨克',
  'Asia/Tashkent': '塔什干 乌兹别克',
  'Europe/London': '伦敦 英国 英伦 GMT',
  'Europe/Dublin': '都柏林 爱尔兰',
  'Europe/Lisbon': '里斯本 葡萄牙',
  'Europe/Madrid': '马德里 西班牙 巴塞罗那',
  'Europe/Paris': '巴黎 法国',
  'Europe/Berlin': '柏林 德国 法兰克福 中欧',
  'Europe/Amsterdam': '阿姆斯特丹 荷兰',
  'Europe/Rome': '罗马 意大利 米兰',
  'Europe/Zurich': '苏黎世 瑞士',
  'Europe/Stockholm': '斯德哥尔摩 瑞典',
  'Europe/Oslo': '奥斯陆 挪威',
  'Europe/Copenhagen': '哥本哈根 丹麦',
  'Europe/Prague': '布拉格 捷克',
  'Europe/Warsaw': '华沙 波兰',
  'Europe/Helsinki': '赫尔辛基 芬兰',
  'Europe/Athens': '雅典 希腊',
  'Europe/Kyiv': '基辅 乌克兰 科夫',
  'Europe/Minsk': '明斯克 白俄罗斯',
  'Europe/Moscow': '莫斯科 俄罗斯',
  'Europe/Istanbul': '伊斯坦布尔 土耳其',
  'Africa/Cairo': '开罗 埃及',
  'Africa/Lagos': '拉各斯 尼日利亚',
  'Africa/Nairobi': '内罗毕 肯尼亚',
  'Africa/Johannesburg': '约翰内斯堡 开普敦 南非',
  'Africa/Casablanca': '卡萨布兰卡 摩洛哥',
  'Africa/Algiers': '阿尔及尔',
  'America/New_York': '纽约 美东 东部 波士顿 华盛顿',
  'America/Toronto': '多伦多 蒙特利尔 加拿大',
  'America/Chicago': '芝加哥 中部 美中央',
  'America/Denver': '丹佛 山地',
  'America/Phoenix': '菲尼克斯 凤凰城 亚利桑那',
  'America/Los_Angeles': '洛杉矶 旧金山 硅谷 美西 太平洋',
  'America/Vancouver': '温哥华',
  'America/Anchorage': '安克雷奇 阿拉斯加',
  'America/Mexico_City': '墨西哥城 墨西哥',
  'America/El_Salvador': '圣萨尔瓦多 中美洲',
  'America/Bogota': '波哥大 哥伦比亚',
  'America/Lima': '利马 秘鲁',
  'America/Santiago': '圣地亚哥 智利',
  'America/Sao_Paulo': '圣保罗 里约 巴西',
  'America/Buenos_Aires': '布宜诺斯艾利斯 阿根廷',
  'Australia/Sydney': '悉尼 雪梨 澳洲 新南威尔士',
  'Australia/Melbourne': '墨尔本',
  'Australia/Brisbane': '布里斯班 昆士兰',
  'Australia/Adelaide': '阿德莱德',
  'Australia/Perth': '珀斯 西澳',
  'Australia/Lord_Howe': '豪勋爵 洛德豪',
  'Pacific/Auckland': '奥克兰 惠灵顿 新西兰',
  'Pacific/Apia': '阿皮亚 萨摩亚',
  'Pacific/Tongatapu': '努库阿洛法 汤加',
  'Pacific/Kiritimati': '圣诞岛 基里巴斯 莱恩群岛',
  'Pacific/Honolulu': '檀香山 火奴鲁鲁 夏威夷',
}

/** 取某城市的搜索别名（没有则空串） */
export function aliasesOf(tzKey) {
  return ZONE_ALIASES[String(tzKey)] || ''
}

/** 分组顺序，供分段控件使用 */
export const ZONE_GROUPS = ['全部', '中国', '亚洲', '欧洲', '非洲', '美洲', '大洋洲', '基准']

/** 默认常看城市（首次进入时展示） */
export const DEFAULT_ZONES = ['Asia/Shanghai', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'UTC']

const ZONE_INDEX = {}
for (let i = 0; i < ZONES.length; i++) ZONE_INDEX[ZONES[i].key] = ZONES[i]

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']
const MIN_MS = 60000
const HOUR_MS = 3600000
const DAY_MS = 86400000

/** 该城市是否实行夏令时 */
export function zoneHasDst(tzKey) {
  const z = zone(tzKey)
  return z.dst !== null && z.dst !== undefined
}

/** 按 IANA 名取时区元数据 */
export function zone(key) {
  const k = String(key === undefined || key === null || key === '' ? 'Asia/Shanghai' : key)
  const hit = ZONE_INDEX[k]
  if (!hit) throw new Error('不认识的时区：' + k + '（请从城市列表里选）')
  return hit
}

/** 是否存在该时区（视图做兜底用） */
export function hasZone(key) {
  return !!ZONE_INDEX[String(key)]
}

/** 中文 / 英文 / IANA 名 / 偏移 模糊搜索 */
export function searchZones(q, grp) {
  const s = String(q === undefined ? '' : q).trim().toLowerCase()
  return ZONES.filter((z) => {
    if (grp && grp !== '全部' && z.grp !== grp) return false
    if (!s) return true
    return (
      z.cn.toLowerCase().indexOf(s) >= 0 ||
      z.en.toLowerCase().indexOf(s) >= 0 ||
      z.key.toLowerCase().indexOf(s) >= 0 ||
      z.grp.indexOf(s) >= 0 ||
      aliasesOf(z.key).indexOf(s) >= 0 ||
      offsetLabel(z.std).toLowerCase().indexOf(s) >= 0 ||
      String(z.std).indexOf(s) >= 0
    )
  })
}

/** 全部城市按分组整理，用于列表渲染 */
export function zonesByGroup() {
  return ZONE_GROUPS.filter((g) => g !== '全部').map((g) => ({
    name: g,
    items: ZONES.filter((z) => z.grp === g),
  }))
}

/** 表里出现过的偏移（做「按偏移排序」的刻度） */
export function distinctOffsets() {
  const seen = []
  for (let i = 0; i < ZONES.length; i++) {
    if (seen.indexOf(ZONES[i].std) < 0) seen.push(ZONES[i].std)
  }
  return seen.sort((a, b) => b - a)
}

/* ============================================================ 小工具 */

function num(v, dft) {
  const d = dft || 0
  if (typeof v === 'number') return isFinite(v) ? v : d
  const s = String(v === null || v === undefined ? '' : v).replace(/[，,\s]/g, '')
  if (s === '') return d
  const n = Number(s)
  return isFinite(n) ? n : d
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

function floorSecond(ms) {
  return Math.floor(num(ms, 0) / MIN_MS) * MIN_MS
}

/** 年月日时分秒 → 把它们当成 UTC 读出的 epoch（只是为了求差值） */
function wallToEpoch(y, mo, d, h, mi, s) {
  return Date.UTC(num(y, 1970), num(mo, 1) - 1, num(d, 1), num(h, 0), num(mi, 0), num(s, 0))
}

/** 输入归一：Date / 毫秒 / 秒 / ISO 字符串 / 纯数字串 */
function toMs(at) {
  if (at instanceof Date) return at.getTime()
  if (typeof at === 'number') {
    if (!isFinite(at)) throw new Error('时间超出可表示范围')
    return Math.abs(at) > 1e11 ? at : at * 1000
  }
  const s = String(at === undefined || at === null ? '' : at).trim()
  if (s === '') throw new Error('请输入时间')
  if (/^-?\d{9,13}$/.test(s)) {
    const p = parseTimestamp(s)
    if (!isNaN(p.ms)) return p.ms
  }
  const t = Date.parse(s)
  if (!isNaN(t)) return t
  const n = Number(s)
  if (isFinite(n) && Math.abs(n) > 1e8) return Math.abs(n) > 1e11 ? n : n * 1000
  throw new Error('认不出这个时间：' + s + '（可写 2024-03-10 02:30、ISO 串或时间戳）')
}

/* ============================================================ 底层：墙钟与偏移 */

const FMT_CACHE = {}

/** 一个时区缓存一个 formatter；不支持就返回 null，让上层走算术降级 */
function getFormatter(tzKey) {
  if (!HAS_TZ) return null
  if (FMT_CACHE[tzKey] !== undefined) return FMT_CACHE[tzKey]
  let f = null
  try {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tzKey,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    f.formatToParts(new Date(0))
  } catch (e) {
    f = null
  }
  FMT_CACHE[tzKey] = f
  return f
}

/** 某瞬间在该时区的墙钟读数（Intl 路径） */
function intlParts(tzKey, ms) {
  const f = getFormatter(tzKey)
  if (!f) return null
  try {
    const p = {}
    const arr = f.formatToParts(new Date(ms))
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].type !== 'literal') p[arr[i].type] = arr[i].value
    }
    const hh = Number(p.hour)
    return {
      year: Number(p.year),
      month: Number(p.month),
      day: Number(p.day),
      hour: hh === 24 || isNaN(hh) ? 0 : hh,
      minute: Number(p.minute),
      second: Number(p.second),
    }
  } catch (e) {
    return null
  }
}

/** 某瞬间在该偏移下的墙钟读数（纯算术，降级路径） */
function epochToParts(epoch) {
  const d = new Date(epoch)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  }
}

function fixedParts(offsetMinutes, ms) {
  return epochToParts(floorSecond(ms) + offsetMinutes * MIN_MS)
}

/** 该瞬间的墙钟 + 该时区偏移；两条引擎共用一个出口 */
function readZone(tzKey, ms) {
  const z = zone(tzKey)
  const t = floorSecond(ms)
  if (HAS_TZ) {
    const p = intlParts(z.key, t)
    if (p) {
      return { parts: p, minutes: Math.round((wallToEpoch(p.year, p.month, p.day, p.hour, p.minute, p.second) - t) / MIN_MS), approx: false }
    }
  }
  return { parts: fixedParts(z.std, t), minutes: z.std, approx: true }
}

/**
 * 某时区在某瞬间的 UTC 偏移（分钟）。
 * @returns {{ minutes:number, approx:boolean, hasDst:boolean }} approx=true 表示降级模式的固定值
 */
export function offsetAt(tzKey, ms) {
  const z = zone(tzKey)
  const r = readZone(tzKey, ms)
  return { minutes: r.minutes, approx: r.approx, hasDst: z.dst !== null && z.dst !== undefined }
}

/** 此刻是否正处于夏令时（用偏移与 std 比较得出，降级模式恒为 false） */
export function isDstActive(tzKey, ms) {
  const z = zone(tzKey)
  const o = offsetAt(tzKey, ms)
  return { active: o.minutes !== z.std, offsetMinutes: o.minutes, stdMinutes: z.std, approx: o.approx }
}

/**
 * 墙钟 → 瞬间。Intl 引擎同时尝试附近出现过的每种偏移，
 * 因此能识别「不存在的时刻」（春季拨快跳过）与「出现两次的时刻」（秋季拨回重叠）。
 * @param {string} tzKey
 * @param {object} wall { year, month, day, hour, minute, second }
 * @returns {{ ms:number, offsetMinutes:number, dstState:'ok'|'gap'|'ambiguous',
 *              candidates:Array, approx:boolean, note:string }}
 */
export function instantFromWall(tzKey, wall) {
  const z = zone(tzKey)
  const w = wall || {}
  const y = num(w.year, 0)
  if (!(y >= 1000 && y <= 9999)) throw new Error('请输入 4 位年份（1000~9999）')
  const mo = clamp(num(w.month, 1), 1, 12)
  const d = clamp(num(w.day, 1), 1, 31)
  const h = clamp(num(w.hour, 0), 0, 23)
  const mi = clamp(num(w.minute, 0), 0, 59)
  const s = clamp(num(w.second, 0), 0, 59)
  const wallEpoch = Date.UTC(y, mo - 1, d, h, mi, s)
  const dayText = y + '-' + pad2(mo) + '-' + pad2(d)
  const hmText = pad2(h) + ':' + pad2(mi)

  if (!HAS_TZ) {
    return {
      ms: wallEpoch - z.std * MIN_MS,
      offsetMinutes: z.std,
      dstState: 'ok',
      candidates: [{ ms: wallEpoch - z.std * MIN_MS, offsetMinutes: z.std }],
      approx: true,
      note: '降级模式：按固定偏移 ' + offsetLabel(z.std) + ' 计算，未计入夏令时' + (zoneHasDst(z.key) ? '（该地实行夏令时，实际可能差 1 小时）' : ''),
    }
  }

  // 扫一下这个时刻附近用过的偏移（前后各 26 小时，覆盖任何切换）
  const probes = [wallEpoch - 26 * HOUR_MS, wallEpoch - HOUR_MS, wallEpoch, wallEpoch + HOUR_MS, wallEpoch + 26 * HOUR_MS]
  const offsets = []
  for (let i = 0; i < probes.length; i++) {
    const p = intlParts(z.key, probes[i])
    if (!p) break
    const o = Math.round((wallToEpoch(p.year, p.month, p.day, p.hour, p.minute, p.second) - floorSecond(probes[i])) / MIN_MS)
    if (offsets.indexOf(o) < 0) offsets.push(o)
  }
  if (!offsets.length) offsets.push(z.std)

  const matches = []
  const misses = []
  for (let i = 0; i < offsets.length; i++) {
    const ms = wallEpoch - offsets[i] * MIN_MS
    const p = intlParts(z.key, ms)
    if (!p) continue
    const readEpoch = wallToEpoch(p.year, p.month, p.day, p.hour, p.minute, p.second)
    if (readEpoch === wallEpoch) matches.push({ ms: ms, offsetMinutes: offsets[i], parts: p })
    else misses.push({ ms: ms, offsetMinutes: offsets[i], parts: p, readEpoch: readEpoch })
  }

  if (matches.length) {
    matches.sort((a, b) => a.ms - b.ms)
    if (matches.length > 1) {
      return {
        ms: matches[0].ms,
        offsetMinutes: matches[0].offsetMinutes,
        dstState: 'ambiguous',
        candidates: matches.map((c) => ({ ms: c.ms, offsetMinutes: c.offsetMinutes })),
        approx: false,
        note:
          z.cn + ' ' + dayText + ' 的 ' + hmText + ' 这个时刻出现两次（夏令时结束把钟往回拨）：' +
          '第一次是 ' + offsetLabel(matches[0].offsetMinutes) + '（夏令时中），第二次是 ' + offsetLabel(matches[1].offsetMinutes) + '（已回冬令时），' +
          '两者相差 ' + Math.round((matches[1].ms - matches[0].ms) / HOUR_MS) + ' 小时。已按第一次给出结果；排会议建议直接给 UTC 或时间戳。',
      }
    }
    return {
      ms: matches[0].ms,
      offsetMinutes: matches[0].offsetMinutes,
      dstState: 'ok',
      candidates: [{ ms: matches[0].ms, offsetMinutes: matches[0].offsetMinutes }],
      approx: false,
      note: '',
    }
  }

  // 一次都没匹配上 —— 这就是不存在的时刻（拨快被跳过的一小时）
  const later = misses.filter((m) => m.readEpoch > wallEpoch).sort((a, b) => a.readEpoch - b.readEpoch)[0]
  const earlier = misses.filter((m) => m.readEpoch < wallEpoch).sort((a, b) => b.readEpoch - a.readEpoch)[0]
  const picked = later || earlier || { ms: wallEpoch - z.std * MIN_MS, offsetMinutes: z.std, parts: fixedParts(z.std, wallEpoch - z.std * MIN_MS) }
  return {
    ms: picked.ms,
    offsetMinutes: picked.offsetMinutes,
    dstState: 'gap',
    candidates: [],
    approx: false,
    note:
      z.cn + ' ' + dayText + ' 的 ' + hmText + ' 这个时刻不存在：当地时钟在这一小时被拨快（夏令时开始）。' +
      (earlier && later
        ? '实际是从 ' + pad2(earlier.parts.hour) + ':' + pad2(earlier.parts.minute) + '（' + offsetLabel(earlier.offsetMinutes) + '）直接跳到 ' +
          pad2(later.parts.hour) + ':' + pad2(later.parts.minute) + '（' + offsetLabel(later.offsetMinutes) + '）。已按顺延后的时刻给出结果。'
        : ''),
  }
}

/* ============================================================ 文本与格式化 */

/** 分钟偏移 → 'UTC+08:00' / 'UTC-05:30' / 'UTC±00:00' */
export function offsetLabel(minutes) {
  const m = num(minutes, 0)
  const abs = Math.abs(m)
  const sign = m < 0 ? '-' : '+'
  return 'UTC' + (abs === 0 ? '±00:00' : sign + pad2(Math.floor(abs / 60)) + ':' + pad2(abs % 60))
}

/** 偏移的中文口语：东八区 / 西五区 / 东五区半 */
export function offsetCn(minutes) {
  const m = num(minutes, 0)
  if (m === 0) return '零时区'
  const dir = m > 0 ? '东' : '西'
  const abs = Math.abs(m)
  const hh = Math.floor(abs / 60)
  const mm = abs % 60
  return dir + hh + ' 区' + (mm === 30 ? '半' : mm ? ' ' + mm + ' 分' : '')
}

/** 谁快谁慢：'北京比纽约快 13 小时' */
export function deltaText(aMinutes, bMinutes, aName, bName) {
  const d = num(aMinutes, 0) - num(bMinutes, 0)
  if (d === 0) return aName + ' 与 ' + bName + ' 同一时刻'
  const abs = Math.abs(d)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const dur = h + ' 小时' + (m ? ' ' + m + ' 分' : '')
  return aName + ' 比 ' + bName + (d > 0 ? ' 快 ' : ' 慢 ') + dur
}

/** 把分钟讲成人话：'1 天 3 小时 20 分' */
export function humanGap(minutes) {
  const abs = Math.abs(num(minutes, 0))
  const d = Math.floor(abs / 1440)
  const h = Math.floor((abs % 1440) / 60)
  const m = abs % 60
  const out = []
  if (d) out.push(d + ' 天')
  if (h) out.push(h + ' 小时')
  if (m) out.push(m + ' 分')
  return out.length ? out.join(' ') : '0 分'
}

/** 毫秒级 epoch → 该时区的当天零点 epoch，用来算跨日 */
function dayEpochOf(parts) {
  return wallToEpoch(parts.year, parts.month, parts.day, 0, 0, 0)
}

/**
 * 瞬间 → 某城市的一整行读数。
 * @param {number|Date|string} at 毫秒 / 秒 / Date / 可解析字符串
 * @param {string} tzKey
 * @param {object} [opt] { baseDay } 传入基准城市的当天零点 epoch 以算跨日
 */
export function zoneRow(at, tzKey, opt) {
  const o = opt || {}
  const z = zone(tzKey)
  const ms = toMs(at)
  const r = readZone(z.key, ms)
  const p = r.parts
  const dayEpoch = dayEpochOf(p)
  const baseDay = o.baseDay === undefined ? dayEpoch : o.baseDay
  const dayOffset = Math.round((dayEpoch - baseDay) / DAY_MS)
  const weekIdx = new Date(dayEpoch).getUTCDay()
  return {
    key: z.key,
    cn: z.cn,
    en: z.en,
    grp: z.grp,
    note: z.note,
    year: p.year,
    month: p.month,
    day: p.day,
    hour: p.hour,
    minute: p.minute,
    second: p.second,
    date: p.year + '-' + pad2(p.month) + '-' + pad2(p.day),
    dateShort: p.month + '月' + p.day + '日',
    time: pad2(p.hour) + ':' + pad2(p.minute),
    hm: pad2(p.hour) + ':' + pad2(p.minute),
    timeFull: pad2(p.hour) + ':' + pad2(p.minute) + ':' + pad2(p.second),
    weekday: '星期' + WEEK_CN[weekIdx],
    weekdayShort: WEEK_CN[weekIdx],
    isWeekend: weekIdx === 0 || weekIdx === 6,
    offsetMinutes: r.minutes,
    offsetText: offsetLabel(r.minutes),
    offsetCn: offsetCn(r.minutes),
    stdText: offsetLabel(z.std),
    dayEpoch,
    dayOffset: dayOffset,
    crossDay: dayOffset === 0 ? '当日' : dayOffset > 0 ? '后 ' + dayOffset + ' 天' : '前 ' + -dayOffset + ' 天',
    crossDayMark: dayOffset === 0 ? '' : (dayOffset > 0 ? '+' : '') + dayOffset,
    dstObserves: z.dst !== null && z.dst !== undefined,
    dstActive: r.minutes !== z.std,
    approx: r.approx,
    ms,
  }
}

/** UTC 的规范文本（与设备无关，适合写进会议邀请） */
export function utcText(ms) {
  const d = new Date(toMs(ms))
  return (
    d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) + ' ' +
    pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds()) + ' UTC'
  )
}

/* ============================================================ 多城市对照 */

/**
 * 多城市对照表（「现在几点」与「指定时刻」共用）。
 * @param {object} input { at, zones:[key], baseKey }
 */
export function worldAt(input) {
  const p = input || {}
  const ms = toMs(p.at === undefined ? Date.now() : p.at)
  const keys = (Array.isArray(p.zones) && p.zones.length ? p.zones : DEFAULT_ZONES).filter(hasZone)
  const baseKey = hasZone(p.baseKey) ? p.baseKey : keys[0]
  const baseRow = zoneRow(ms, baseKey)
  const rows = keys
    .map((k) => zoneRow(ms, k, { baseDay: baseRow.dayEpoch }))
    .sort((a, b) => b.offsetMinutes - a.offsetMinutes || a.key.localeCompare(b.key))
  const base = rows.filter((r) => r.key === baseKey)[0] || baseRow
  const cross = rows.filter((r) => r.dayOffset !== 0).length
  const dstNow = rows.filter((r) => r.dstActive)
  return {
    rows,
    base,
    count: rows.length,
    engine: ENGINE,
    ms,
    crossDayCount: cross,
    dstActiveCount: dstNow.length,
    note:
      (!HAS_TZ ? ENGINE_NOTE + '\n' : '') +
      '以 ' + base.cn + ' ' + base.date + ' ' + base.hm + '（' + base.weekday + '）为基准；' +
      (cross ? '其中 ' + cross + ' 个城市不在同一天，约时间请留意「跨日」列' : '所有城市都在同一天') +
      (dstNow.length ? '；正在过夏令时的有 ' + dstNow.map((r) => r.cn).join('、') : ''),
  }
}

/** 「现在几点」的便捷入口（视图里定时刷新用这个） */
export function nowRows(zones, baseKey, atMs) {
  return worldAt({ at: atMs === undefined ? Date.now() : atMs, zones: zones, baseKey: baseKey })
}

/**
 * 指定时刻多城市对照：把某城市的墙钟时刻换算到其他城市。
 * @param {object} input { zoneKey, year, month, day, hour, minute, zones:[...] }
 */
export function atWallInZone(input) {
  const p = input || {}
  const fromKey = hasZone(p.zoneKey) ? p.zoneKey : 'Asia/Shanghai'
  const r = instantFromWall(fromKey, { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second })
  const list = Array.isArray(p.zones) && p.zones.length ? p.zones : DEFAULT_ZONES
  const view = worldAt({ at: r.ms, zones: list, baseKey: fromKey })
  return {
    ms: r.ms,
    iso: new Date(r.ms).toISOString(),
    from: view.base,
    rows: view.rows,
    dstState: r.dstState,
    dstNote: r.note,
    candidates: r.candidates,
    approx: r.approx || view.rows.some((x) => x.approx),
    utcText: utcText(r.ms),
    stamp: Math.floor(r.ms / 1000),
    note: view.note,
  }
}

/* ============================================================ 时间戳联动 */

/** 设备自身的 UTC 偏移（分钟）——只用 Date，不碰任何宿主 API */
export function deviceOffsetMinutes(at) {
  try {
    return -new Date(toMs(at === undefined ? Date.now() : at)).getTimezoneOffset()
  } catch (e) {
    return 0
  }
}

/**
 * 时间戳 / UTC / 设备本地 / 指定城市墙钟 四者联动。
 * @param {object} input { stamp, utc, zoneKey, year, month, day, hour, minute }
 *        任一即可，优先级 stamp > utc > 墙钟
 */
export function stampLinks(input) {
  const p = input || {}
  let ms = NaN
  let from = ''
  let dst = { state: 'ok', note: '' }
  if (p.stamp !== undefined && String(p.stamp).trim() !== '') {
    const s = String(p.stamp).trim()
    if (!/^-?\d+$/.test(s)) throw new Error('时间戳只能是纯数字：10 位按秒、13 位按毫秒')
    const parsed = parseTimestamp(s)
    if (isNaN(parsed.ms)) throw new Error('时间戳超出可表示范围')
    ms = parsed.ms
    from = '时间戳（' + (parsed.unit === 's' ? '秒' : '毫秒') + '）'
  } else if (p.utc !== undefined && String(p.utc).trim() !== '') {
    const t = Date.parse(String(p.utc).trim())
    if (isNaN(t)) throw new Error('认不出这个 UTC 时间，请用 2024-03-10 02:30 或 ISO 写法')
    ms = t
    from = 'UTC 文本（按 UTC 理解）'
  } else {
    const zKey = hasZone(p.zoneKey) ? p.zoneKey : 'Asia/Shanghai'
    const r = instantFromWall(zKey, p)
    ms = r.ms
    from = zone(zKey).cn + ' 墙钟'
    dst = { state: r.dstState, note: r.note }
  }
  const devOff = deviceOffsetMinutes(ms)
  const dev = fixedParts(devOff, ms)
  const utcRow = zoneRow(ms, 'UTC')
  return {
    ms,
    stampSec: Math.floor(ms / 1000),
    stampMs: ms,
    utc: utcText(ms),
    iso: new Date(ms).toISOString(),
    utcDate: utcRow.date,
    utcTime: utcRow.hm,
    utcWeekday: utcRow.weekday,
    deviceOffsetMinutes: devOff,
    deviceOffsetText: offsetLabel(devOff),
    deviceDate: dev.year + '-' + pad2(dev.month) + '-' + pad2(dev.day),
    deviceTime: pad2(dev.hour) + ':' + pad2(dev.minute),
    deviceWeekday: '星期' + WEEK_CN[new Date(ms).getDay()],
    from,
    dstState: dst.state,
    dstNote: dst.note,
    beijing: zoneRow(ms, 'Asia/Shanghai'),
    note:
      '时间戳是绝对时刻、与时区无关；同一个时间戳在哪个城市都是同一个瞬间，只是墙钟读数不同。' +
      (HAS_TZ ? '设备本地偏移按当前环境算得 ' + offsetLabel(devOff) + '。' : '降级模式下城市偏移用固定值，设备本地偏移仍按系统读数。'),
  }
}

/* ============================================================ 两两对照 */

/**
 * 两个城市的时差与「那边几点」。
 * @param {object} input { a, b, at } 或 { a, b, aWall:{year,month,day,hour,minute} }
 */
export function pairCompare(input) {
  const p = input || {}
  const aKey = hasZone(p.a) ? p.a : 'Asia/Shanghai'
  const bKey = hasZone(p.b) ? p.b : 'America/New_York'
  let ms
  let dst = { state: 'ok', note: '' }
  if (p.aWall) {
    const r = instantFromWall(aKey, p.aWall)
    ms = r.ms
    dst = { state: r.dstState, note: r.note }
  } else {
    ms = toMs(p.at === undefined ? Date.now() : p.at)
  }
  const a = zoneRow(ms, aKey)
  const b = zoneRow(ms, bKey, { baseDay: a.dayEpoch })
  const delta = a.offsetMinutes - b.offsetMinutes
  const abs = Math.abs(delta)
  return {
    a,
    b,
    ms,
    iso: new Date(ms).toISOString(),
    deltaMinutes: delta,
    absDelta: abs,
    deltaHours: Math.round((abs / 60) * 100) / 100,
    deltaText: deltaText(a.offsetMinutes, b.offsetMinutes, a.cn, b.cn),
    thereText: a.cn + ' ' + a.date + ' ' + a.hm + ' 时，' + b.cn + ' 是 ' + b.date + ' ' + b.hm + '（' + b.weekday + '，' + b.crossDay + '）',
    sameDay: b.dayOffset === 0,
    dayOffset: b.dayOffset,
    crossDayMark: b.crossDayMark,
    weekendThere: b.isWeekend,
    // 24 小时里双方都醒着的粗略重叠度，只用于排序展示，不是承诺
    overlapRatio: Math.round((1 - abs / 24) * 100) / 100,
    dstState: dst.state,
    dstNote: dst.note,
    approx: a.approx || b.approx,
    note:
      '按 ' + new Date(ms).toISOString() + ' 这个瞬间算：' + a.cn + ' ' + a.offsetText + '（' + a.offsetCn + '），' +
      b.cn + ' ' + b.offsetText + '（' + b.offsetCn + '）。' +
      (a.approx || b.approx ? '降级模式，偏移未计入夏令时。' : '含夏令时，同一对城市在一年里的时差可能变化，跨切换日要重新算。'),
  }
}

/* ============================================================ 会议重叠 */

function addHourLabel(hm) {
  const h = Number(String(hm).slice(0, 2))
  const next = h + 1
  return pad2(next % 24) + ':00' + (next >= 24 ? '（次日）' : '')
}

/**
 * 双方都在工作时段（默认 9:00~18:00）的连续小时。
 * 以 A 地日历日为起点，按真实时间逐小时推进，因此天然跟着 DST 走。
 * @param {object} input { a, b, at | date:'YYYY-MM-DD', hours=72, workStart=9, workEnd=18, skipWeekend=true }
 */
export function meetingSlots(input) {
  const p = input || {}
  const aKey = hasZone(p.a) ? p.a : 'Asia/Shanghai'
  const bKey = hasZone(p.b) ? p.b : 'America/New_York'
  const workStart = clamp(num(p.workStart, 9), 0, 23)
  const workEnd = clamp(num(p.workEnd, 18), workStart + 1, 24)
  const span = clamp(num(p.hours, 72), 12, 240)
  const skipWeekend = p.skipWeekend === undefined ? true : !!p.skipWeekend

  let startMs
  if (p.date) {
    const m = String(p.date).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (!m) throw new Error('日期请写成 2024-03-10')
    startMs = instantFromWall(aKey, { year: m[1], month: m[2], day: m[3], hour: workStart, minute: 0 }).ms
  } else {
    const aNow = zoneRow(toMs(p.at === undefined ? Date.now() : p.at), aKey)
    const h = aNow.hour < workStart ? workStart : aNow.hour + 1
    startMs = instantFromWall(aKey, { year: aNow.year, month: aNow.month, day: aNow.day, hour: h > 23 ? 23 : h, minute: 0 }).ms
  }

  const slots = []
  let cur = null
  for (let i = 0; i < span; i++) {
    const ms = startMs + i * HOUR_MS
    const a = zoneRow(ms, aKey)
    const b = zoneRow(ms, bKey, { baseDay: a.dayEpoch })
    const aOk = a.hour >= workStart && a.hour < workEnd
    const bOk = b.hour >= workStart && b.hour < workEnd
    const wkOk = !skipWeekend || (!a.isWeekend && !b.isWeekend)
    if (aOk && bOk && wkOk) {
      if (cur && cur.endMs === ms) {
        cur.endMs = ms + HOUR_MS
        cur.hours += 1
        cur.endA = a.hm
        cur.endB = b.hm
      } else {
        cur = {
          startMs: ms,
          endMs: ms + HOUR_MS,
          hours: 1,
          aDate: a.date,
          aWeekday: a.weekday,
          startA: a.hm,
          endA: a.hm,
          bDate: b.date,
          bWeekday: b.weekday,
          startB: b.hm,
          endB: b.hm,
          bDayOffset: b.dayOffset,
        }
        slots.push(cur)
      }
    } else {
      cur = null
    }
  }
  slots.forEach((s) => {
    s.plainA = s.aDate + ' ' + s.startA + '~' + addHourLabel(s.endA)
    s.plainB = s.bDate + ' ' + s.startB + '~' + addHourLabel(s.endB)
    s.text =
      s.aDate + '（' + s.aWeekday + '）' + s.startA + ' 起 ' + s.hours + ' 小时：' +
      s.plainA + ' ↔ ' + s.plainB + '（对方' + (s.bDayOffset === 0 ? '当天' : s.bDayOffset > 0 ? '次日' : '前一日') + '）'
  })
  const total = slots.reduce((acc, s) => acc + s.hours, 0)
  return {
    a: zone(aKey).cn,
    b: zone(bKey).cn,
    workStart,
    workEnd,
    skipWeekend,
    span,
    slots,
    totalHours: total,
    approx: !HAS_TZ,
    note:
      '按双方都在 ' + workStart + ':00~' + workEnd + ':00' + (skipWeekend ? '、且当天双方都不是周末' : '') +
      ' 的条件，从起点逐小时扫描 ' + span + ' 小时，得到 ' + slots.length + ' 段共 ' + total + ' 小时。' +
      (slots.length ? '第一段的时刻已经分别用两地时间写出，直接抄进日历即可。' : '没有重叠窗口——通常只能一方熬夜，或改成异步留言。'),
  }
}

/**
 * 24 小时网格对照：A 地每个整点对应 B 地几点（视图画表用）。
 * @param {object} input { a, b, date:'YYYY-MM-DD', at, workStart, workEnd }
 */
export function dayGrid(input) {
  const p = input || {}
  const aKey = hasZone(p.a) ? p.a : 'Asia/Shanghai'
  const bKey = hasZone(p.b) ? p.b : 'America/New_York'
  const workStart = clamp(num(p.workStart, 9), 0, 23)
  const workEnd = clamp(num(p.workEnd, 18), workStart + 1, 24)
  let wall
  if (p.date) {
    const m = String(p.date).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (!m) throw new Error('日期请写成 2024-03-10')
    wall = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
  } else {
    const aRow = zoneRow(toMs(p.at === undefined ? Date.now() : p.at), aKey)
    wall = { year: aRow.year, month: aRow.month, day: aRow.day }
  }
  const rows = []
  let gapCount = 0
  let ambCount = 0
  for (let h = 0; h < 24; h++) {
    const r = instantFromWall(aKey, { year: wall.year, month: wall.month, day: wall.day, hour: h, minute: 0 })
    if (r.dstState === 'gap') gapCount++
    if (r.dstState === 'ambiguous') ambCount++
    const ms = r.ms
    const a = zoneRow(ms, aKey)
    const b = zoneRow(ms, bKey, { baseDay: dayEpochOf({ year: wall.year, month: wall.month, day: wall.day }) })
    rows.push({
      hour: h,
      aTime: pad2(h) + ':00',
      aActual: a.hm,
      bTime: b.hm,
      bHour: b.hour,
      bDate: b.date,
      bDateShort: b.dateShort,
      bWeekday: b.weekday,
      dayOffset: b.dayOffset,
      crossDayMark: b.crossDayMark,
      aWork: h >= workStart && h < workEnd,
      bWork: b.hour >= workStart && b.hour < workEnd,
      bothWork: h >= workStart && h < workEnd && b.hour >= workStart && b.hour < workEnd,
      inWeek: !a.isWeekend,
      bInWeek: !b.isWeekend,
      dstState: r.dstState,
      dstNote: r.note,
      ms,
    })
  }
  const bothCount = rows.filter((x) => x.bothWork && x.inWeek && x.bInWeek).length
  return {
    a: zone(aKey).cn,
    b: zone(bKey).cn,
    aDate: wall.year + '-' + pad2(wall.month) + '-' + pad2(wall.day),
    rows,
    bothWorkCount: bothCount,
    gapCount,
    ambiguousCount: ambCount,
    note:
      '按 ' + zone(aKey).cn + ' 的 24 个整点逐小时对照 ' + zone(bKey).cn + '。' +
      (gapCount ? '其中 ' + gapCount + ' 个整点当天在当地不存在（夏令时开始拨快）；' : '') +
      (ambCount ? '其中 ' + ambCount + ' 个整点当天出现两次（夏令时结束拨回）。' : '') +
      (bothCount ? '' : '这一天双方的工作时段没有重叠。'),
  }
}

/* ============================================================ 复制文案 */

/** 多城市表的纯文本（发群里同步时刻用） */
export function worldSummaryText(result) {
  const r = result || {}
  const rows = r.rows || []
  const head = r.base
    ? '【世界时钟】基准 ' + r.base.cn + ' ' + r.base.date + ' ' + r.base.hm + ' ' + r.base.weekday
    : '【世界时钟】'
  const engine = '引擎：' + (HAS_TZ ? 'Intl（含夏令时）' : '固定偏移（不含夏令时，可能有 1 小时误差）')
  const lines = rows.map((x) =>
    x.cn + '  ' + x.date + ' ' + x.hm + ' ' + x.weekday + '  ' + x.offsetText +
    (x.crossDayMark ? '  ' + x.crossDayMark : '') + (x.dstActive ? '  夏令时中' : '')
  )
  return [head, engine].concat(lines).join('\n')
}

/** 一段可直接粘进会议邀请的对照文案 */
export function inviteText(input) {
  const p = input || {}
  const r = atWallInZone(p)
  const lines = ['【会议时间】' + r.from.cn + ' ' + r.from.date + ' ' + r.from.hm + '（' + r.from.weekday + '）']
  r.rows.forEach((x) => {
    if (x.key === r.from.key) return
    lines.push(x.cn + ' ' + x.dateShort + ' ' + x.hm + ' ' + x.weekday + (x.crossDayMark ? ' ' + x.crossDayMark : ''))
  })
  lines.push('UTC ' + r.utcText)
  lines.push('时间戳 ' + r.stamp)
  if (r.dstState !== 'ok') lines.push('注意：' + r.dstNote)
  if (!HAS_TZ) lines.push('（降级模式，未计夏令时，请自行复核）')
  return lines.join('\n')
}

/** 时区详情（视图的说明区） */
export function zoneDetail(tzKey, at) {
  const z = zone(tzKey)
  const ms = toMs(at === undefined ? Date.now() : at)
  const row = zoneRow(ms, z.key)
  return Object.assign({}, z, {
    nowText: row.date + ' ' + row.hm + ' ' + row.weekday,
    offsetNow: row.offsetText,
    stdText: offsetLabel(z.std),
    dstText: z.dst === null || z.dst === undefined ? '不实行夏令时' : '夏令时期间 ' + offsetLabel(z.dst),
    dstActive: row.dstActive,
    row,
    engine: ENGINE,
    approx: row.approx,
  })
}
