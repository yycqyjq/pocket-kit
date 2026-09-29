/**
 * 尺码换算（鞋 / 戒指 / 服装 / 文胸）
 * ------------------------------------------------------------
 * 纯函数层：只吃数字，不碰 uni、不碰 DOM、不联网。
 *
 * 重要前提：本文件里所有号码都是「公式 + 公开标准号型系列」推出来的对照值，
 * 不是任何品牌的官方尺码表。同一个标码在不同品牌能差 1 码以上，
 * 因为真正的决定量是楦长 / 成衣净尺寸，而不是那个字母或数字。
 * 所以每张表都同时给出「底层量」（毫米、厘米、内周长），并附偏码提示。
 *
 * 依据与年份见 SIZE_SOURCES；阈值提醒只引用公开的卫生行业标准线，
 * 用于挑码与自我关注，不构成医学诊断或购物建议。
 */

/** 顶部统一免责声明，视图直接展示 */
export const DATA_NOTE =
  '以下号码全部由公制公式与国标号型系列推得（公式换算，非品牌官方数据）；同一标码不同品牌可差 1 码，请以脚长毫米数、净体围度与实际试穿为准。尺码与阈值提示不构成医学诊断或购物建议。'

/** 数据来源与假设，逐条标年份 */
export const SIZE_SOURCES = [
  {
    name: 'GB/T 3293—1998 鞋号',
    text: '中国鞋号直接用脚长毫米数（240、245…），本工具 mm 一列即该口径；旧码「38 码」= 脚长厘米数 × 2 − 10（1982 版口径，市售仍在用）。',
  },
  {
    name: '欧码 Paris point（1 码 = 2/3 cm）',
    text: 'EU = 1.5 × 鞋楦长(cm)，鞋楦长 = 脚长 + 放余量。本表默认放余量 1.5 cm，可改；品牌成衣表常比公式高 0.5~1 码。',
  },
  {
    name: '英制 barleycorn（1 码 = 1/3 英寸）',
    text: 'UK = 3 × 楦长(英寸) − 25；US 男 = 3 × 楦长 − 24（即比英码大 1 号）；US 女 = US 男 + 1.5；童码 = US 男 + 13。',
  },
  { name: '日本 JIS 鞋码', text: 'JP 码 = 脚长厘米数（24.0 等），与 CN 新码同源只是刻度不同，换算无损失。' },
  {
    name: 'GB/T 1335 服装号型（男子 2009 版 / 女子 2008 版）',
    text: '号 = 身高，型 = 上装胸围 / 下装腰围，后缀 Y·A·B·C 为胸腰差体型；本表用最常见的 5·4 系列跳档（身高进 5cm、围度进 4cm）。每档给的「适穿区间」按市售惯例上下各留 2~3cm，相邻档刻意重叠，两档都能穿时按版型偏好选；版本号仅用于说明数据年代，以现行版本为准。',
  },
  {
    name: '文胸罩杯进档',
    text: 'CN/JP：A = 上下胸围差 10cm，之后每 2.5cm 进一档；EU：A ≈ 12cm，每 2cm 一档；UK/US：A = 1 英寸差，每 1 英寸一档（UK 用 DD/E/F/FF…，US 用 DD/DDD 起）。各体系不完全等价。',
  },
  { name: '戒指尺码', text: '美码按「内周长(mm) ≈ 36.55 + 2.55 × 号」；ISO/欧码直接取内周长毫米数；港号与大陆号常见民间近似「号数 ≈ 内周长 − 40」，珠宝店实量为准。' },
  { name: 'WS/T 428—2013 成人体重判定', text: '中心性肥胖线：男腰围 ≥ 90cm、女 ≥ 85cm。本工具只在超线时提示，不能替代体检。' },
  { name: '《中国成人超重和肥胖症预防控制指南》2003', text: '腰围偏高关注线：男 ≥ 85cm、女 ≥ 80cm，比行业标准早一档，用于提前提醒。' },
]

/* ============================================================ 鞋码 */

/** 脚长合理区间（毫米），超出即判定为输入异常 */
export const FOOT_MM_MIN = 90
export const FOOT_MM_MAX = 340
/** 童码与成人码的分界（约 US 男 0 号） */
export const KIDS_MM_MAX = 190
/** 默认放余量：脚长 → 鞋楦长，单位 cm */
export const DEFAULT_ALLOWANCE = 1.5

/** 放余量预设：不同鞋型需要的空间差很多，这一项直接决定号码 */
export const SHOE_ALLOWANCES = [
  { key: 'sandal', name: '凉鞋/拖鞋', value: 0.5, note: '脚趾不顶到前缘即可' },
  { key: 'flat', name: '平底鞋/单鞋', value: 1.0, note: '软楦、无鞋带' },
  { key: 'sneaker', name: '日常板鞋', value: 1.5, note: '通用默认值' },
  { key: 'running', name: '跑鞋', value: 2.0, note: '长跑脚会胀，需留更多前掌空间' },
  { key: 'leather', name: '正装皮鞋', value: 1.5, note: '硬楦长，穿久会塌' },
  { key: 'child', name: '童鞋', value: 1.2, note: 'child 建议每 2~3 个月复量' },
]

/** 适用人群：决定用哪套美/英码刻度 */
export const SHOE_AUDIENCES = [
  { key: 'men', name: '男码', usOffset: 0, note: 'US 男 = 3 × 楦长(英寸) − 24' },
  { key: 'women', name: '女码', usOffset: 1.5, note: 'US 女 = US 男 + 1.5（同脚长）' },
  { key: 'kids', name: '童码', usOffset: 13, note: '童码 = US 男 + 13（英码同理 UK 长码 + 13），13K 之后回到 1M' },
]

/** 换算入口的尺码体系 */
export const SHOE_SYSTEMS = [
  { key: 'mm', name: 'CN 新码 · 毫米', hint: '240' },
  { key: 'cn', name: 'CN 旧码 · 码', hint: '38' },
  { key: 'eu', name: '欧码 EU', hint: '38.5' },
  { key: 'us', name: '美码 US', hint: '6' },
  { key: 'uk', name: '英码 UK', hint: '5' },
  { key: 'jp', name: '日码 JP · cm', hint: '24.0' },
]

const CM_PER_INCH = 2.54

function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const n = Number(String(v === null || v === undefined ? '' : v).replace(/[，,\s码号]/g, ''))
  return isFinite(n) ? n : 0
}

function round(n, d) {
  const p = Math.pow(10, d === undefined ? 2 : d)
  return Math.round((Number(n) || 0) * p) / p
}

/** 步进取整：0.5 码体系里 6.37 应该报 6.5 而不是 6 */
function step(n, size) {
  const s = size || 0.5
  return round(Math.round((Number(n) || 0) / s) * s, 4)
}

function allowanceOf(opt) {
  const o = opt || {}
  if (o.allowance !== undefined && o.allowance !== '' && num(o.allowance) > 0) return num(o.allowance)
  if (o.allowanceKey) {
    const hit = SHOE_ALLOWANCES.filter((a) => a.key === o.allowanceKey)[0]
    if (hit) return hit.value
  }
  return DEFAULT_ALLOWANCE
}

function audienceOf(key) {
  return SHOE_AUDIENCES.filter((a) => a.key === key)[0] || SHOE_AUDIENCES[0]
}

/** 毫米数保留一位小数的可读文本：240 → 24.0cm */
export function footText(mm) {
  return round(num(mm) / 10, 1) + 'cm'
}

/**
 * 脚长毫米 → 各体系鞋码。
 * 所有号码都从同一个楦长推出来，因此彼此严格自洽；
 * 与品牌表的出入由 notes / SHOE_FIT_NOTES 说明。
 * @param {number|string} mm 脚长（毫米）
 * @param {object} [opt] { audience, allowance, allowanceKey, euStep, usStep, system }
 * @returns 除各体系号码外还给出 usCodeText / ukCodeText / usDisplay / ukDisplay
 *          （童脚自动退回 1K~13K 口径，不会出现负号）
 */
export function shoeFromMm(mm, opt) {
  const o = opt || {}
  const foot = num(mm)
  if (!(foot >= FOOT_MM_MIN && foot <= FOOT_MM_MAX)) {
    throw new Error('脚长请在 ' + FOOT_MM_MIN + '~' + FOOT_MM_MAX + ' 毫米之间（约 ' + footText(FOOT_MM_MIN) + '~' + footText(FOOT_MM_MAX) + '）')
  }
  const aud = audienceOf(o.audience)
  const allow = allowanceOf(o)
  const lastCm = foot / 10 + allow
  const lastIn = lastCm / CM_PER_INCH
  const euExact = 1.5 * lastCm
  const ukExact = 3 * lastIn - 25
  const usMenExact = ukExact + 1
  const usExact = usMenExact + aud.usOffset
  const cnOld = foot / 5 - 10
  const jp = foot / 10
  const eu = step(euExact, o.euStep || 0.5)
  const us = step(usExact, o.usStep || 0.5)
  const uk = step(ukExact + (aud.key === 'kids' ? 13 : 0), 0.5)
  const isKids = foot <= KIDS_MM_MAX
  const kidsUs = step(usMenExact + 13, 0.5)
  const kidsUk = step(ukExact + 13, 0.5)
  const notes = [
    '公式给的是「连续值」，市售只有半码或 1/3 码，所以取整后与品牌表可能差 0.5 码',
    '欧码在不同品牌能差 0.5~1 码（如 Nike 38.5 / adidas 38⅔ 都对应约 240mm），买鞋优先看毫米数',
    '脚长要按傍晚量、靠墙垫纸描边、取两只脚里较大的一只；宽度大或脚背高再加半码',
  ]
  if (aud.key === 'kids' && usMenExact > 0) notes.splice(1, 0, '童码最多排到 13K（约 ' + KIDS_MM_MAX + 'mm），这双脚已进入成人码区间，请改看男/女码')
  else if (aud.key !== 'kids' && isKids) notes.splice(1, 0, '脚长不超过 ' + KIDS_MM_MAX + 'mm，市售多按童码标注，等价于 US ' + kidsUs + 'K')
  // 成人刻度对童脚会算出 0 以下的数，市售那一段其实是 1K~13K，别把负数丢给用户看
  const kidSuffix = aud.key === 'kids' && isKids ? 'K' : ''
  const usCodeText = us > 0 ? '' + us + kidSuffix : kidsUs + 'K（童码）'
  const ukCodeText = uk > 0 ? '' + uk + kidSuffix : kidsUk + 'K（童码）'
  return {
    mm: round(foot, 0),
    footCm: round(jp, 1),
    cn: round(foot, 0),
    cnOld: round(cnOld, 1),
    eu: eu,
    euExact: round(euExact, 2),
    us: us,
    usExact: round(usExact, 2),
    usMen: step(usMenExact, 0.5),
    usWomen: step(usMenExact + 1.5, 0.5),
    usKids: aud.key === 'kids' ? us : kidsUs,
    uk: uk,
    ukExact: round(ukExact, 2),
    ukKids: kidsUk,
    usDisplay: 'US ' + usCodeText,
    ukDisplay: 'UK ' + ukCodeText,
    usCodeText: usCodeText,
    ukCodeText: ukCodeText,
    jp: round(jp, 1),
    jpText: round(jp, 1).toFixed(1),
    audience: aud.key,
    audienceName: aud.name,
    allowance: round(allow, 2),
    lastCm: round(lastCm, 2),
    lastIn: round(lastIn, 3),
    lastMm: round(lastCm * 10, 0),
    kidsSuggested: isKids,
    label: pickShoeLabel(o, { cn: round(foot, 0), cnOld: round(cnOld, 1), eu, us: usCodeText, uk: ukCodeText, jp: round(jp, 1) }),
    note:
      '脚长 ' + round(foot, 0) + 'mm + 放余量 ' + round(allow, 1) + 'cm = 鞋楦 ' + round(lastCm, 1) + 'cm；' +
      '欧码 = 1.5 × ' + round(lastCm, 1) + ' = ' + round(euExact, 2) + '，取 ' + eu + ' 码；' +
      aud.name + '美码 = 3 × ' + round(lastCm / 2.54, 2) + ' − 24' + (aud.usOffset ? ' + ' + aud.usOffset : '') + ' = ' + round(usExact, 2) + '，取 ' + us + ' 码',
    notes: notes,
  }
}

function pickShoeLabel(o, v) {
  const sys = o.system || 'cn'
  if (sys === 'mm') return 'CN ' + v.cn + ' 码（毫米）'
  if (sys === 'cn') return 'CN 旧码 ' + v.cnOld
  if (sys === 'eu') return 'EU ' + v.eu
  if (sys === 'us') return 'US ' + v.us
  if (sys === 'uk') return 'UK ' + v.uk
  return 'JP ' + v.jp.toFixed(1)
}

/** 一条换算结果里，某个体系对应的号码（用于回代自检） */
export function shoeCodeOf(r, system) {
  if (system === 'mm') return r.cn
  if (system === 'cn') return r.cnOld
  if (system === 'eu') return r.eu
  if (system === 'us') return r.us
  if (system === 'uk') return r.uk
  if (system === 'jp') return r.jp
  throw new Error('不支持的鞋码体系：' + system)
}

/**
 * 任意体系 → 脚长毫米。
 * @param {number|string} value 号码
 * @param {string} system mm|cn|eu|us|uk|jp
 * @param {object} [opt] { audience, allowance, allowanceKey }
 */
export function mmFromShoe(value, system, opt) {
  const o = opt || {}
  const v = num(value)
  if (!(v > 0)) throw new Error('请输入有效号码')
  const allow = allowanceOf(o)
  const aud = audienceOf(o.audience)
  let foot
  if (system === 'mm') foot = v
  else if (system === 'jp') foot = v * 10
  else if (system === 'cn') foot = (v + 10) * 5
  else if (system === 'eu') foot = v / 1.5 * 10 - allow * 10
  else if (system === 'uk') foot = ((v - (aud.key === 'kids' ? 13 : 0) + 25) / 3) * CM_PER_INCH * 10 - allow * 10
  else if (system === 'us') foot = ((v - aud.usOffset + 24) / 3) * CM_PER_INCH * 10 - allow * 10
  else throw new Error('不支持的鞋码体系：' + system)
  if (!(foot >= FOOT_MM_MIN && foot <= FOOT_MM_MAX)) throw new Error('换算出的脚长 ' + round(foot, 0) + 'mm 不在 ' + FOOT_MM_MIN + '~' + FOOT_MM_MAX + 'mm 之间，请确认体系与放余量')
  return round(foot, 1)
}

/** 一个入口：给任意体系的号码，返回全部号码 + 回代偏差 */
export function shoeConvert(input) {
  const p = input || {}
  const system = p.system || 'cn'
  const mm = mmFromShoe(p.value, system, p)
  const r = shoeFromMm(mm, p)
  const backCode = shoeCodeOf(r, system)
  return Object.assign({}, r, {
    system: system,
    inputMm: mm,
    inputCode: num(p.value),
    backCode: backCode,
    codeDrift: round(backCode - num(p.value), 2),
    summary: shoeSummaryText(r),
  })
}

/** 直接按脚长毫米推荐（最不容易错的路径） */
export function shoeRecommendByFoot(footCm, opt) {
  const cm = num(footCm)
  if (!(cm > 5 && cm < 35)) throw new Error('请输入脚长厘米数（如 24.5）')
  return shoeFromMm(cm * 10, opt)
}

/** 一屏可读的对照行 */
export function shoeTable(opt) {
  const o = opt || {}
  const from = Math.max(FOOT_MM_MIN, num(o.from) || 140)
  const to = Math.min(FOOT_MM_MAX, num(o.to) || (o.audience === 'kids' ? KIDS_MM_MAX : 300))
  const rows = []
  for (let mm = from; mm <= to && rows.length < 60; mm += 5) {
    const r = shoeFromMm(mm, o)
    rows.push({
      mm: r.mm,
      cnOld: r.cnOld,
      eu: r.eu,
      us: r.usCodeText,
      uk: r.ukCodeText,
      jp: r.jpText,
    })
  }
  return { rows, audience: o.audience || 'men', allowance: allowanceOf(o), columns: ['毫米', '旧码', '欧码', '美码', '英码', '日码'] }
}

/** 复制用的纯文本对照 */
export function shoeSummaryText(r) {
  return [
    '脚长 ' + r.mm + ' mm（' + r.footCm + ' cm）· 放余量 ' + r.allowance + ' cm',
    'CN 新码 ' + r.cn + ' / 旧码 ' + r.cnOld + ' 码',
    '欧码 EU ' + r.eu + '（公式 ' + r.euExact + '）',
    r.audienceName + ' ' + r.usDisplay + ' / ' + r.ukDisplay + ' / 日码 ' + r.jpText,
    '鞋楦内长建议 ' + r.lastMm + ' mm',
  ].join('\n')
}

/**
 * 偏码倾向：口碑整理，属于经验值，不是官方尺码表。
 * delta 为「相对公式值」的建议调整（正 = 要买更大）。
 */
export const SHOE_FIT_NOTES = [
  { brand: 'Nike / 耐克', delta: 0.5, fits: '普遍反馈偏小半码', advice: '脚背高或宽楦需求再加半码；KD/科比正代更窄', source: '电商评价与跑圈常见说法' },
  { brand: 'adidas', delta: 0, fits: '三叶草偏大、跑鞋偏小', advice: 'Superstar 建议减半码，Boost 跑鞋按原码', source: '同上' },
  { brand: 'Converse 匡威', delta: -1, fits: '明显偏大约 1 码', advice: 'All Star / 1970s 帆布无弹性，建议减 0.5~1 码', source: '同上' },
  { brand: 'Vans', delta: -0.5, fits: '偏大约半码', advice: '滑板鞋穿久塌陷，宁可先合脚', source: '同上' },
  { brand: 'New Balance', delta: 0, fits: '同码分宽度（2E/4E/6E）', advice: '宽脚请换宽度而不是加码，围度更稳', source: '品牌宽度体系' },
  { brand: 'Dr. Martens', delta: -0.5, fits: '前期偏大且磨脚', advice: '穿厚袜磨合后回落，一般减半天到半码', source: '同上' },
  { brand: 'Yeezy / 部分潮牌限量楦', delta: 1, fits: '偏小', advice: '常见建议加 1 码，且以毫米数为准', source: '同上' },
  { brand: 'Crocs / 洞洞鞋', delta: -1, fits: '偏大且无束缚', advice: '减 1 码，穿袜子再评估', source: '同上' },
  { brand: 'ECCO / Clarks 皮鞋', delta: 0, fits: '楦型偏长、皮会延展', advice: '按脚长毫米选，宁小勿大（真皮会撑开）', source: '同上' },
  { brand: '李宁 / 安踏 等国产', delta: 0, fits: '多用 CN 毫米标', advice: '直接按 CN 新码走，与欧码出入 ±0.5', source: '同上' },
  { brand: '婴儿/学步鞋', delta: 0, fits: '尺码断层大', advice: '每 2~3 个月复量，留 1cm 生长空间即可', source: '常见育儿建议' },
]

/** 查某个品牌的偏码建议 */
export function shoeFitAdvice(brand) {
  const q = String(brand === undefined ? '' : brand).trim().toLowerCase()
  if (!q) return { matched: false, note: '输入品牌名可查偏码倾向；没有查到就按毫米数选', list: SHOE_FIT_NOTES }
  const hit = SHOE_FIT_NOTES.filter(
    (x) => x.brand.toLowerCase().indexOf(q) >= 0 || q.indexOf(x.brand.split(' ')[0].toLowerCase()) >= 0
  )[0]
  if (!hit) return { matched: false, brand: brand, note: '未收录该品牌，按毫米数 + 放余量选最稳', list: SHOE_FIT_NOTES }
  return Object.assign({}, hit, {
    matched: true,
    formulaNote: '公式码先按放余量算出，再按该品牌建议 ' + (hit.delta > 0 ? '加 ' : hit.delta < 0 ? '减 ' : '不变（差 ') + Math.abs(hit.delta) + (hit.delta === 0 ? '）' : ' 码'),
  })
}

/* ============================================================ 戒指 */

/** 美码线性拟合：内周长(mm) = 36.55 + 2.55 × 号 */
export const RING_CIRC_BASE = 36.55
export const RING_CIRC_PER_SIZE = 2.55
/** 民间近似的港号 / 大陆号：号数 = 内周长 − 40 */
export const RING_HK_OFFSET = 40
export const RING_CIRC_MIN = 35
export const RING_CIRC_MAX = 82

/**
 * 内周长毫米 → 各体系戒圈号。
 * @param {number|string} circ 内周长（毫米）
 */
export function ringFromCirc(circ) {
  const c = num(circ)
  if (!(c > 0)) throw new Error('请输入戒指内周长')
  const inRange = c >= RING_CIRC_MIN && c <= RING_CIRC_MAX
  const us = (c - RING_CIRC_BASE) / RING_CIRC_PER_SIZE
  const diam = c / Math.PI
  return {
    circ: round(c, 1),
    diameter: round(diam, 2),
    diameterIn: round(diam / 2.54, 3),
    circIn: round(c / 2.54, 2),
    us: step(us, 0.5),
    usExact: round(us, 2),
    uk: step(us - 0.5, 0.5),
    ukNote: '英码与美码同一 barleycorn 刻度但整体低半号，属常见对照习惯',
    hk: round(step(c - RING_HK_OFFSET, 0.5), 1),
    iso: round(c, 0),
    inRange: inRange,
    note:
      '内周长 ' + round(c, 1) + 'mm ÷ π = 内直径 ' + round(diam, 2) + 'mm；' +
      '美码 = (' + round(c, 1) + ' − ' + RING_CIRC_BASE + ') ÷ ' + RING_CIRC_PER_SIZE + ' = ' + round(us, 2) + '，取 ' + step(us, 0.5) + ' 号；' +
      '港/大陆近似号 ≈ ' + round(c - RING_HK_OFFSET, 1),
    warning: inRange
      ? ''
      : '内周长 ' + round(c, 1) + 'mm 超出 ' + RING_CIRC_MIN + '~' + RING_CIRC_MAX + 'mm 的常规区间，戒圈跨度大，务必去珠宝店实量',
  }
}

/**
 * 戒指换算：内周长 / 内直径 / 美码 / 港号 任给其一。
 * @param {object} input { circ, diameter, us, hk, iso }
 */
export function ringConvert(input) {
  const p = input || {}
  let circ
  let from
  if (num(p.circ) > 0) {
    circ = num(p.circ)
    from = '内周长'
  } else if (num(p.diameter) > 0) {
    circ = num(p.diameter) * Math.PI
    from = '内直径'
  } else if (num(p.us) > 0) {
    circ = RING_CIRC_BASE + num(p.us) * RING_CIRC_PER_SIZE
    from = '美码'
  } else if (num(p.hk) > 0) {
    circ = num(p.hk) + RING_HK_OFFSET
    from = '港号/大陆号'
  } else if (num(p.iso) > 0) {
    circ = num(p.iso)
    from = 'ISO/欧码'
  } else {
    throw new Error('请至少填写内周长、内直径、美码或港号中的一项')
  }
  return Object.assign(ringFromCirc(circ), { from: from })
}

/** 对照表：周长 40~76mm */
export function ringTable(opt) {
  const o = opt || {}
  const from = num(o.from) || 40
  const to = num(o.to) || 72
  const rows = []
  for (let c = from; c <= to && rows.length < 60; c += 1) {
    const r = ringFromCirc(c)
    rows.push({ circ: r.circ, diameter: r.diameter, us: r.us, hk: r.hk, iso: r.iso })
  }
  return { rows, columns: ['内周长mm', '内直径mm', '美码', '港/大陆号', 'ISO'] }
}

/** 测量与佩戴提示（挑码用的经验项，非医学结论） */
export const RING_TIPS = [
  '手指在傍晚最粗、天冷最细，请在常温偏晚时测量',
  '用细绳绕指根一圈做记号再量长度，就是内周长；不要绕指关节',
  '指关节比指根粗时，取两个周长之间偏大的值，或选可开合戒圈',
  '宽版戒指（≥6mm）比细圈紧，通常要在原号上加半号',
  '左右手同一手指能差半号，以要戴的那只手为准',
  '怀孕、水肿、季节体重变化都会改变指围，贵重戒指建议可改圈',
]

/* ============================================================ 服装号型 */

/**
 * GB/T 1335 常见 5·4A 系列跳档。
 * height 身高（号），chest 上装胸围（型），waist 下装腰围，hip 臀围，
 * eu/us 为按公式推得的国际码（男装欧码 = 胸围 ÷ 2，美码 = 欧码 − 10；
 * 女装欧码 = 胸围 − 48 + 2 的常见对照，美码 = 欧码 − 32）。
 */
export const CLOTHING_MEN = [
  { label: 'XS', seq: '160/84A', height: [158, 165], chest: [80, 86], waist: [64, 70], hip: [84, 90], eu: 42, us: 32, cn: '160/84A' },
  { label: 'S', seq: '165/88A', height: [163, 170], chest: [84, 90], waist: [68, 74], hip: [88, 94], eu: 44, us: 34, cn: '165/88A' },
  { label: 'M', seq: '170/92A', height: [168, 175], chest: [88, 94], waist: [72, 78], hip: [92, 98], eu: 46, us: 36, cn: '170/92A' },
  { label: 'L', seq: '175/96A', height: [173, 180], chest: [92, 98], waist: [76, 82], hip: [96, 102], eu: 48, us: 38, cn: '175/96A' },
  { label: 'XL', seq: '180/100A', height: [178, 185], chest: [96, 102], waist: [80, 86], hip: [100, 106], eu: 50, us: 40, cn: '180/100A' },
  { label: 'XXL', seq: '185/104A', height: [183, 190], chest: [100, 106], waist: [84, 90], hip: [104, 110], eu: 52, us: 42, cn: '185/104A' },
  { label: '3XL', seq: '190/108A', height: [188, 195], chest: [104, 110], waist: [88, 94], hip: [108, 114], eu: 54, us: 44, cn: '190/108A' },
  { label: '4XL', seq: '195/112A', height: [193, 200], chest: [108, 114], waist: [92, 98], hip: [112, 118], eu: 56, us: 46, cn: '195/112A' },
  { label: 'XXXXL', seq: '200/116A', height: [198, 210], chest: [112, 120], waist: [96, 108], hip: [116, 126], eu: 58, us: 48, cn: '200/116A' },
]

export const CLOTHING_WOMEN = [
  { label: 'XS', seq: '155/80A', height: [153, 160], chest: [76, 82], waist: [58, 64], hip: [82, 88], eu: 34, us: 2, cn: '155/80A' },
  { label: 'S', seq: '160/84A', height: [158, 165], chest: [80, 86], waist: [62, 68], hip: [86, 92], eu: 36, us: 4, cn: '160/84A' },
  { label: 'M', seq: '165/88A', height: [163, 170], chest: [84, 90], waist: [66, 72], hip: [90, 96], eu: 38, us: 6, cn: '165/88A' },
  { label: 'L', seq: '170/92A', height: [168, 175], chest: [88, 94], waist: [70, 76], hip: [94, 100], eu: 40, us: 8, cn: '170/92A' },
  { label: 'XL', seq: '175/96A', height: [173, 180], chest: [92, 98], waist: [74, 80], hip: [98, 104], eu: 42, us: 10, cn: '175/96A' },
  { label: 'XXL', seq: '180/100A', height: [178, 185], chest: [96, 102], waist: [78, 86], hip: [102, 108], eu: 44, us: 12, cn: '180/100A' },
  { label: '3XL', seq: '185/104A', height: [183, 190], chest: [100, 108], waist: [84, 92], hip: [106, 114], eu: 46, us: 14, cn: '185/104A' },
  { label: '4XL', seq: '190/108A', height: [188, 195], chest: [104, 114], waist: [90, 98], hip: [110, 120], eu: 48, us: 16, cn: '190/108A' },
  { label: 'XXXXL', seq: '195/112A', height: [193, 205], chest: [110, 122], waist: [96, 106], hip: [116, 128], eu: 50, us: 18, cn: '195/112A' },
]

export const CLOTHING_SEXES = [
  { key: 'male', name: '男装' },
  { key: 'female', name: '女装' },
]

/** 字母码顺序，用于「偏大/偏小几档」提示 */
export const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', 'XXXXL']

export function clothingTable(sex) {
  return sex === 'female' ? CLOTHING_WOMEN : CLOTHING_MEN
}

/** 字母码 → 号型与各围度区间 */
export function clothingFromLabel(label, sex) {
  const q = String(label === undefined ? '' : label).trim().toUpperCase().replace(/\s/g, '')
  const table = clothingTable(sex)
  const hit =
    table.filter((r) => r.label === q)[0] ||
    table.filter((r) => r.cn.replace(/\//g, '') === q.replace(/\//g, ''))[0] ||
    table.filter((r) => String(r.eu) === q || String(r.us) === q)[0]
  if (!hit) throw new Error('没找到该尺码：' + label + '（支持 XS~XXXXL、175/96A、欧码或美码数字）')
  return {
    row: hit,
    sex: sex === 'female' ? '女' : '男',
    order: SIZE_ORDER.indexOf(hit.label),
    rangeText:
      '身高 ' + hit.height[0] + '~' + hit.height[1] + 'cm · 胸围 ' + hit.chest[0] + '~' + hit.chest[1] + 'cm · 腰围 ' + hit.waist[0] + '~' + hit.waist[1] + 'cm · 臀围 ' + hit.hip[0] + '~' + hit.hip[1] + 'cm',
    note: '号型 ' + hit.cn + '（号=身高，型=胸围/腰围，A=常规体型）；欧码 ' + hit.eu + '，美码 ' + hit.us + '。区间为适穿净体范围，相邻档刻意重叠 2~3cm，跨在两档之间时按版型松紧偏好选',
  }
}

/**
 * 胸腰差 → 体型后缀。
 * GB/T 1335 用「胸围 − 腰围」把体型分四档，常见资料给的男子区间是
 * Y 17~22 / A 12~16 / B 7~11 / C 2~6；女子的分档各版本资料出入较大，
 * 本工具统一沿用上面这套下限（近似口径，只用于挑码，不是标准判定）。
 */
export const BODY_TYPES = [
  { key: 'Y', name: 'Y 偏瘦', min: 17, range: '17~22', note: '胸围明显大于腰围' },
  { key: 'A', name: 'A 标准', min: 12, range: '12~16', note: '最常见，市售默认版型' },
  { key: 'B', name: 'B 偏胖', min: 7, range: '7~11', note: '腰腹较满，注意下装腰围' },
  { key: 'C', name: 'C 肥胖', min: -99, range: '2~6 及以下', note: '建议按腰围选码或改裤装' },
]

export function bodyType(chest, waist) {
  const diff = num(chest) - num(waist)
  if (!(num(chest) > 0 && num(waist) > 0)) throw new Error('请输入胸围与腰围')
  const hit = BODY_TYPES.filter((t) => diff >= t.min)[0] || BODY_TYPES[BODY_TYPES.length - 1]
  return {
    key: hit.key,
    name: hit.name,
    diff: round(diff, 1),
    range: hit.range,
    note: hit.note,
    code: hit.key === 'C' && diff < 2 ? 'C（胸腰差已到标准分档下沿，按腰围选码更稳）' : hit.key,
    basis: 'GB/T 1335 胸腰差分档，采用常见男子口径；女子资料出入较大，此处为近似',
  }
}

function dimScore(value, range) {
  const v = num(value)
  if (!v) return { value: 0, state: 'missing', gap: 0 }
  if (v < range[0]) return { value: v, state: 'small', gap: round(range[0] - v, 1) }
  if (v > range[1]) return { value: v, state: 'big', gap: round(v - range[1], 1) }
  // 落在档位里也分「贴边」和「居中」：贴边时更希望给出相邻档做对照
  const gap = round(Math.min(v - range[0], range[1] - v), 1)
  return { value: v, state: 'fit', gap: gap, edge: gap < 1 ? 0.2 : gap < 2 ? 0.1 : 0 }
}

/**
 * 净体尺寸 → 推荐字母码。
 * 上装看胸围、下装看腰围，臀围作辅助；三者不一致时按「较大的那一维」给码，
 * 并把差异逐条列出，避免只给一个码误导。
 * @param {object} o { sex, height, chest, waist, hip }
 */
export function clothingFromBody(o) {
  const p = o || {}
  const sex = p.sex === 'female' ? 'female' : 'male'
  const table = clothingTable(sex)
  const dims = [
    { key: 'height', name: '身高', range: 'height' },
    { key: 'chest', name: '胸围', range: 'chest' },
    { key: 'waist', name: '腰围', range: 'waist' },
    { key: 'hip', name: '臀围', range: 'hip' },
  ]
  const given = dims.filter((d) => num(p[d.key]) > 0)
  if (!given.length) throw new Error('请至少填写身高、胸围、腰围或臀围中的一项')
  const scored = table.map((row) => {
    const parts = {}
    let penalty = 0
    given.forEach((d) => {
      const s = dimScore(p[d.key], row[d.range])
      parts[d.key] = s
      if (s.state === 'big') penalty += 3 + Math.min(9, s.gap / 2)
      else if (s.state === 'small') penalty += 1 + Math.min(6, s.gap / 3)
      else penalty += s.edge
    })
    return { row: row, label: row.label, parts: parts, penalty: round(penalty, 2) }
  })
  scored.sort((a, b) => a.penalty - b.penalty || SIZE_ORDER.indexOf(a.label) - SIZE_ORDER.indexOf(b.label))
  const best = scored[0]
  const idx = SIZE_ORDER.indexOf(best.label)
  const advice = []
  given.forEach((d) => {
    const s = best.parts[d.key]
    if (s.state === 'big') advice.push(d.name + ' ' + s.value + 'cm 超过 ' + best.label + ' 的档位上限，建议往上加一档或选宽松版型')
    else if (s.state === 'small') advice.push(d.name + ' ' + s.value + 'cm 低于 ' + best.label + ' 档位下限，会偏大，可往下调一档')
  })
  const chestW = num(p.chest)
  const waistW = num(p.waist)
  const bt = chestW > 0 && waistW > 0 ? bodyType(chestW, waistW) : null
  if (bt && (bt.key === 'C' || bt.key === 'B')) advice.push('体型 ' + bt.key + '：上衣按胸围、裤子按腰围分开选码更准')
  return {
    sex: sex === 'female' ? '女' : '男',
    label: best.label,
    seq: best.row.cn,
    eu: best.row.eu,
    us: best.row.us,
    order: idx,
    rangeText: clothingFromLabel(best.label, sex).rangeText,
    table: best.row,
    parts: best.parts,
    advice: advice,
    bodyType: bt,
    warnings: sizeWarnings(p),
    alternatives: scored.slice(1, 3).map((x) => x.label),
    note: '净体围度不含放松量；衬衫外套需另加 4~10cm 松量，针织与梭形版型差异更大',
  }
}

/** 腰围厘米 → 牛仔裤英寸码 / 市尺 */
export function jeansFromWaist(cm) {
  const w = num(cm)
  if (!(w >= 40 && w <= 160)) throw new Error('请输入腰围厘米数（40~160）')
  const inch = w / 2.54
  const chi = w / 33.333
  return {
    waistCm: round(w, 1),
    inch: round(inch, 1),
    size: Math.round(inch),
    sizeHalf: round(inch, 1),
    chi: round(chi, 2),
    chiText: round(chi, 2).toFixed(2) + ' 尺',
    folk: round(chi * 10 + 7, 0),
    note:
      round(w, 1) + 'cm ÷ 2.54 = ' + round(inch, 1) + ' 英寸 → 牛仔码约 ' + Math.round(inch) + ' 码；' +
      '÷ 33.333 = ' + round(chi, 2) + ' 尺，民间口算「尺 × 10 + 7」= ' + round(chi * 10 + 7, 0) + ' 码，与英寸法基本一致',
    advice: '牛仔裤无弹性要按实际腰围偏大放 1~2cm；低腰款另按髋骨位置复量',
  }
}

/* ============================================================ 文胸 */

/** 罩杯进档表（差值单位：cm，取最近档） */
export const CUP_STEPS = {
  cn: { start: 10, step: 2.5, letters: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J'], from: 'GB/T 一般按 2.5cm 进档，A = 差 10cm' },
  jp: { start: 10, step: 2.5, letters: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], from: '日本与 CN 同刻度' },
  eu: { start: 12, step: 2, letters: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], from: '欧码罩杯 2cm 进档，A ≈ 差 12cm' },
  uk: { start: 2.54, step: 2.54, letters: ['A', 'B', 'C', 'D', 'DD', 'E', 'F', 'FF', 'G', 'GG', 'H', 'HH'], from: '英码 1 英寸进档' },
  us: { start: 2.54, step: 2.54, letters: ['A', 'B', 'C', 'D', 'DD', 'DDD', 'G', 'H', 'I', 'J'], from: '美码与英码同刻度但双字母排布不同' },
}

/** 底围档位（厘米体系） */
export const BRA_BANDS_CM = [60, 63, 65, 68, 70, 73, 75, 78, 80, 83, 85, 88, 90, 93, 95, 98, 100, 105, 110, 115, 120]
export const BRA_BANDS_IN = [26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50]

function cupLetter(diff, system) {
  const cfg = CUP_STEPS[system] || CUP_STEPS.cn
  if (diff < cfg.start - cfg.step / 2) return { letter: 'AA', index: -1, nominal: cfg.start - cfg.step }
  const i = Math.round((diff - cfg.start) / cfg.step)
  const idx = Math.min(cfg.letters.length - 1, Math.max(0, i))
  return { letter: cfg.letters[idx], index: idx, nominal: round(cfg.start + idx * cfg.step, 2) }
}

function nearestBand(v, list) {
  let best = list[0]
  for (let i = 1; i < list.length; i++) {
    if (Math.abs(list[i] - v) < Math.abs(best - v)) best = list[i]
  }
  return best
}

/**
 * 下胸围 + 上胸围 → 各体系文胸码。
 * @param {object} o { under, over } 单位 cm
 */
export function braFrom(o) {
  const p = o || {}
  const under = num(p.under)
  const over = num(p.over)
  if (!(under >= 50 && under <= 150)) throw new Error('下胸围请在 50~150cm 之间')
  if (!(over > 0)) throw new Error('请输入上胸围（放松站立、身体前倾 45° 各量一次取平均）')
  if (over <= under) throw new Error('上胸围要大于下胸围，请检查量法')
  const diff = round(over - under, 1)
  const bandCm = nearestBand(under, BRA_BANDS_CM)
  const bandIn = nearestBand(under / 2.54, BRA_BANDS_IN)
  const cn = cupLetter(diff, 'cn')
  const eu = cupLetter(diff, 'eu')
  const uk = cupLetter(diff, 'uk')
  const us = cupLetter(diff, 'us')
  const warns = []
  if (diff < 7.5) warns.push('上下胸围差 ' + diff + 'cm 不足 A 档，多为测量偏大或罩杯不适用，可考虑背心式')
  if (diff > 27.5) warns.push('差值 ' + diff + 'cm 超出常规对照表，务必找专业 fitting 复核')
  if (under < 60) warns.push('下胸围小于 60cm，超出常规定档范围')
  if (under > 120) warns.push('下胸围大于 120cm，需要大码专用版型')
  if (over - under > 40) warns.push('差值超过 40cm 属极端数据，请复核读数')
  return {
    under: round(under, 1),
    over: round(over, 1),
    diff: diff,
    bandCm: bandCm,
    bandIn: bandIn,
    cn: bandCm + cn.letter,
    cnExact: cn.letter,
    jp: cn.letter + bandCm,
    eu: bandCm + eu.letter,
    uk: bandIn + uk.letter,
    us: bandIn + us.letter,
    cupCn: cn.letter,
    cupEu: eu.letter,
    cupUk: uk.letter,
    cupUs: us.letter,
    sisters: braSisters(bandCm, cn.letter),
    warnings: warns,
    note:
      '差值 ' + diff + 'cm：CN/JP 落在 ' + cn.letter + '（标称差 ' + cn.nominal + 'cm），EU 为 ' + eu.letter +
      '（标称 ' + eu.nominal + 'cm），UK/US 为 ' + uk.letter + '（标称 ' + uk.nominal + 'cm）。日本习惯把罩杯写在前面（' + cn.letter + bandCm + '）',
    crossNote:
      '跨体系试穿时：' + bandCm + cn.letter + '（CN）≈ ' + bandIn + uk.letter + '（UK/US）；' +
      'EU 罩杯进档更密，同一字母下 EU 往往略小，可在 EU 上试大一档。' +
      '注意：这里英/美底围按「下胸围实测英寸取最近档位」，与老式「实测 + 4 英寸」算法不同（' + round(under / 2.54, 1) + ' 英寸会被算成 ' + nearestBand(round(under / 2.54, 1) + 4, BRA_BANDS_IN) + '），两套算法不能混用',
  }
}

/** 相邻「同容积」码：底围进一档、罩杯退一档 */
export function braSisters(bandCm, cupLetterName) {
  const letters = CUP_STEPS.cn.letters
  const bi = BRA_BANDS_CM.indexOf(num(bandCm))
  const ci = letters.indexOf(String(cupLetterName || '').toUpperCase())
  if (bi < 0 || ci < 0) return { list: [], note: '底围或罩杯不在常规档位里，无相邻同容积码' }
  const out = []
  const pair = (db, dc, tag) => {
    const nb = BRA_BANDS_CM[bi + db]
    const nc = letters[ci + dc]
    if (nb !== undefined && nc !== undefined) out.push({ band: nb, cup: nc, code: '' + nb + nc, tag: tag })
  }
  pair(-1, 1, '底围小一档 / 罩杯大一档')
  pair(1, -1, '底围大一档 / 罩杯小一档')
  pair(-2, 2, '紧一档（很多人实际该穿这个）')
  pair(2, -2, '松一档')
  return { from: '' + bandCm + cupLetterName, list: out, note: '同一容积会在「底围↑罩杯↓」之间迁移，肩带滑落或压肩时可按相邻码换' }
}

/** 常见对照小表：固定差值 → 各体系罩杯 */
export function braTable(opt) {
  const o = opt || {}
  const from = num(o.from) || 10
  const to = num(o.to) || 28
  const rows = []
  for (let d = from; d <= to && rows.length < 40; d += 2.5) {
    rows.push({
      diff: round(d, 1),
      cn: cupLetter(d, 'cn').letter,
      eu: cupLetter(d, 'eu').letter,
      uk: cupLetter(d, 'uk').letter,
      us: cupLetter(d, 'us').letter,
    })
  }
  return { rows, columns: ['上下差cm', 'CN/JP', 'EU', 'UK', 'US'] }
}

/* ============================================================ 阈值提醒 */

/** 腰围提示线：来源与年份都写在 text 里 */
export const WAIST_LINES = [
  { key: 'attention', sex: 'male', value: 85, text: '男 ≥ 85cm：《中国成人超重和肥胖症预防控制指南》2003 的腰围偏高关注线' },
  { key: 'attention', sex: 'female', value: 80, text: '女 ≥ 80cm：同上指南的女性关注线' },
  { key: 'obese', sex: 'male', value: 90, text: '男 ≥ 90cm：WS/T 428—2013 的中心性肥胖判定线' },
  { key: 'obese', sex: 'female', value: 85, text: '女 ≥ 85cm：WS/T 428—2013 的中心性肥胖判定线' },
]

export const HEIGHT_RANGE = [130, 210]
export const CHEST_RANGE = [60, 150]
export const WAIST_RANGE = [45, 160]
export const HIP_RANGE = [60, 170]

/**
 * 汇总各输入的越界与健康提示线。
 * 只报事实与出处，语气保持「提示」而不是「诊断」。
 */
export function sizeWarnings(o) {
  const p = o || {}
  const out = []
  const sex = p.sex === 'female' ? 'female' : p.sex === 'male' ? 'male' : ''
  const check = (name, value, range) => {
    const v = num(value)
    if (!v) return
    if (v < range[0]) out.push({ level: 'warn', field: name, text: name + ' ' + v + 'cm 低于常规区间 ' + range[0] + '~' + range[1] + 'cm，请复核读数' })
    else if (v > range[1]) out.push({ level: 'warn', field: name, text: name + ' ' + v + 'cm 超出常规区间 ' + range[0] + '~' + range[1] + 'cm，需走大码/特体渠道' })
  }
  check('身高', p.height, HEIGHT_RANGE)
  check('胸围', p.chest, CHEST_RANGE)
  check('腰围', p.waist, WAIST_RANGE)
  check('臀围', p.hip, HIP_RANGE)
  if (p.footMm !== undefined && p.footMm !== '') {
    const mm = num(p.footMm)
    if (mm && (mm < FOOT_MM_MIN || mm > FOOT_MM_MAX)) out.push({ level: 'warn', field: '脚长', text: '脚长 ' + mm + 'mm 不在 ' + FOOT_MM_MIN + '~' + FOOT_MM_MAX + 'mm 常规范围内' })
  }
  if (p.ringCirc !== undefined && p.ringCirc !== '') {
    const c = num(p.ringCirc)
    if (c && (c < RING_CIRC_MIN || c > RING_CIRC_MAX)) out.push({ level: 'warn', field: '指围', text: '戒指内周长 ' + c + 'mm 不在 ' + RING_CIRC_MIN + '~' + RING_CIRC_MAX + 'mm 常规范围内，务必到珠宝店实量' })
  }
  const w = num(p.waist)
  if (w && sex) {
    WAIST_LINES.filter((l) => l.sex === sex).forEach((l) => {
      if (w >= l.value) out.push({ level: l.key === 'obese' ? 'bad' : 'warn', field: '腰围', text: l.text + '。仅为公开标准线，不能替代体检' })
    })
  }
  const chest = num(p.chest)
  if (chest && w) {
    const diff = chest - w
    if (diff < 0) out.push({ level: 'warn', field: '胸腰差', text: '腰围大于胸围（差 ' + round(diff, 1) + 'cm），上衣按胸围会紧、裤子按腰围会大，建议上下分开设码' })
  }
  if (num(p.over) > 0 && num(p.under) > 0) {
    const d = num(p.over) - num(p.under)
    if (d < 7.5) out.push({ level: 'warn', field: '罩杯', text: '上下胸围差 ' + round(d, 1) + 'cm 未到 A 档（差 10cm 起）' })
    else if (d > 27.5) out.push({ level: 'warn', field: '罩杯', text: '上下胸围差 ' + round(d, 1) + 'cm 超出常规对照，建议专业 fitting' })
  }
  return out
}

/** 一段可以复制到聊天窗口的尺码小结 */
export function sizeSummaryText(o) {
  const p = o || {}
  const lines = ['— 尺码换算 · 依据 ' + (p.kind || '') + ' —']
  if (p.shoe) {
    lines.push('脚长 ' + p.shoe.mm + 'mm（' + p.shoe.footCm + 'cm）')
    lines.push('CN ' + p.shoe.cn + ' / 旧码 ' + p.shoe.cnOld + ' / EU ' + p.shoe.eu + ' / US ' + p.shoe.us + ' / UK ' + p.shoe.uk + ' / JP ' + p.shoe.jpText)
  }
  if (p.ring) {
    lines.push('内周长 ' + p.ring.circ + 'mm · 内直径 ' + p.ring.diameter + 'mm')
    lines.push('美码 ' + p.ring.us + ' 号 / 港号近似 ' + p.ring.hk + ' 号 / ISO ' + p.ring.iso)
  }
  if (p.clothing) {
    lines.push(p.clothing.sex + '装推荐 ' + p.clothing.label + '（号型 ' + p.clothing.seq + '，欧码 ' + p.clothing.eu + '，美码 ' + p.clothing.us + '）')
    lines.push(p.clothing.rangeText)
    ;(p.clothing.advice || []).forEach((a) => lines.push('· ' + a))
  }
  if (p.bra) {
    lines.push('CN ' + p.bra.cn + ' / EU ' + p.bra.eu + ' / UK ' + p.bra.uk + ' / US ' + p.bra.us + '（差 ' + p.bra.diff + 'cm）')
  }
  const ws = p.warnings || sizeWarnings(p)
  if (ws && ws.length) {
    lines.push('提醒：')
    ws.forEach((x) => lines.push('· ' + x.text))
  }
  lines.push(DATA_NOTE)
  return lines.join('\n')
}

/** 对外统一入口：kind = shoe|ring|clothing|bra */
export function convertSize(input) {
  const p = input || {}
  const kind = p.kind || 'shoe'
  if (kind === 'shoe') {
    const s = shoeConvert(p)
    return { kind: kind, shoe: s, warnings: sizeWarnings({ footMm: s.mm }) }
  }
  if (kind === 'ring') {
    const r = ringConvert(p)
    return { kind: kind, ring: r, warnings: sizeWarnings({ ringCirc: r.circ }) }
  }
  if (kind === 'clothing') {
    const c = clothingFromBody(p)
    return { kind: kind, clothing: c, warnings: c.warnings }
  }
  if (kind === 'bra') {
    const b = braFrom(p)
    return { kind: kind, bra: b, warnings: b.warnings.map((t) => ({ level: 'warn', field: '罩杯', text: t })) }
  }
  throw new Error('不支持的尺码类别：' + kind)
}

/** 金额/尺寸共用的显示辅助 */
export function fmtCm(v) {
  const n = num(v)
  return n ? round(n, 1).toFixed(1) + ' cm' : '—'
}

export function fmtMm(v) {
  const n = num(v)
  return n ? round(n, 0) + ' mm' : '—'
}
