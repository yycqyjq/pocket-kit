/**
 * 文本处理
 */
import { base64Encode, base64Decode } from './base64'

/** 统计文本信息 */
export function analyze(text) {
  const s = String(text || '')
  const chars = [...s].length
  const noSpace = s.replace(/\s/g, '')
  const hanzi = (s.match(/[\u4e00-\u9fa5]/g) || []).length
  const letters = (s.match(/[A-Za-z]/g) || []).length
  const digits = (s.match(/[0-9]/g) || []).length
  const punct = (s.match(/[^\w\s\u4e00-\u9fa5]/g) || []).length
  const words = (s.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) || []).length
  const lines = s.length ? s.split(/\r\n|\r|\n/).length : 0
  const paragraphs = s.trim()
    ? s.trim().split(/\n\s*\n/).filter((p) => p.trim()).length
    : 0
  return {
    chars,
    noSpace: [...noSpace].length,
    hanzi,
    letters,
    digits,
    punct,
    words,
    lines,
    paragraphs,
    spaces: chars - [...noSpace].length,
  }
}

export function toUpperCase(t) {
  return String(t).toUpperCase()
}
export function toLowerCase(t) {
  return String(t).toLowerCase()
}
export function toTitleCase(t) {
  return String(t).replace(/\b([A-Za-z])([A-Za-z]*)/g, (m, a, b) => a.toUpperCase() + b.toLowerCase())
}
/** 中英之间插入空格，让混排更易读 */
export function padCJK(t) {
  return String(t)
    .replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, '$1 $2')
}

export function lines(t) {
  return String(t).split(/\r\n|\r|\n/)
}

export function dedupeLines(t, ignoreCase, trim) {
  const seen = Object.create(null)
  const out = []
  for (let line of lines(t)) {
    const raw = trim === false ? line : line.trim()
    const key = ignoreCase ? raw.toLowerCase() : raw
    if (key === '') {
      // 空行只保留第一次出现
      if (seen['\u0000empty']) continue
      seen['\u0000empty'] = 1
      out.push(line)
      continue
    }
    if (seen[key]) continue
    seen[key] = 1
    out.push(line)
  }
  return out.join('\n')
}

export function removeEmptyLines(t, keepIndent) {
  return lines(t)
    .filter((l) => l.trim() !== '')
    .map((l) => (keepIndent ? l : l.trim()))
    .join('\n')
}

export function collapseSpaces(t) {
  return String(t).replace(/[ \t\u3000]+/g, ' ')
}

export function trimLines(t) {
  return lines(t)
    .map((l) => l.trim())
    .join('\n')
}

export function sortLines(t, mode) {
  const arr = lines(t)
  const cmp = {
    asc: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
    desc: (a, b) => (a > b ? -1 : a < b ? 1 : 0),
    lenAsc: (a, b) => a.length - b.length || (a < b ? -1 : 1),
    lenDesc: (a, b) => b.length - a.length || (a < b ? -1 : 1),
  }[mode || 'asc']
  return arr.slice().sort(cmp).join('\n')
}

export function reverseText(t) {
  return [...String(t)].reverse().join('')
}

export function reverseLines(t) {
  return lines(t).reverse().join('\n')
}

export function numberLines(t, start, width) {
  const w = width || 2
  let n = start || 1
  return lines(t)
    .map((l) => String(n++).padStart(w, '0') + '. ' + l)
    .join('\n')
}

export function stripHtml(t) {
  return String(t)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function urlEncode(t) {
  return encodeURIComponent(String(t))
}
export function urlDecode(t) {
  return decodeURIComponent(String(t).replace(/\+/g, ' '))
}

export const toBase64 = (t, urlSafe) => base64Encode(t, urlSafe)
export const fromBase64 = (t, urlSafe) => base64Decode(t, urlSafe)

/** 简单的中文转拼音首字母（常用字表，够做归类用） */
const PINYIN_INDEX = [
  ['A', '阿啊哎唉哀挨癌爱矮碍安氨俺岸按案暗昂凹熬袄傲奥澳'],
  ['B', '八巴扒吧疤拔把坝罢白百柏摆败拜班般斑搬板版办半伴拌邦帮绑榜膀傍包胞保堡报抱豹暴爆杯悲碑北贝备背倍被奔本笨崩逼鼻比彼笔币必毕闭边编鞭贬便变遍辨辩标表别宾冰兵丙柄饼并病波玻剥播伯泊驳勃脖博薄补捕不布步部'],
  ['C', '擦猜才材财裁采彩踩菜参餐残蚕惭惨灿仓苍舱藏操糙曹草册侧厕测层插叉察差拆柴缠产铲颤昌长肠尝偿厂场畅唱抄超朝潮吵车扯彻尘臣沉陈衬称城乘程惩澄诚承吃池驰迟持匙尺齿斥赤翅冲充虫崇抽仇绸愁筹酬丑臭初出橱除楚储处触川穿传船喘串疮窗床闯创吹垂春纯唇词瓷慈磁辞此刺次聪从丛凑粗促醋窜催脆翠村存寸错'],
  ['D', '搭达答打大呆代带待袋逮担丹单耽胆但淡蛋当挡党荡刀导岛倒蹈到盗道稻得德灯的登等凳低堤滴敌笛底抵地弟递第颠典点电店垫殿叼雕吊钓调掉爹跌叠蝶丁叮盯钉顶订定丢东冬董懂动冻洞都斗抖陡豆逗督毒独读堵赌杜肚度渡端短段断锻堆队对兑吨蹲盾炖钝多夺朵躲舵'],
  ['E', '俄鹅蛾额恶饿鄂恩儿而尔耳饵二'],
  ['F', '发罚阀伐帆番翻凡烦繁反返犯泛饭范贩方坊芳防妨房仿访纺放飞非肥匪肺废沸费分芬纷坟粉份奋愤丰风封疯峰锋蜂逢冯缝讽凤佛否夫肤孵伏扶服浮符幅福抚府辅腐父付妇负附阜复腹覆'],
  ['G', '该改概钙盖干甘杆肝赶敢感刚钢岗港高搞稿告哥割歌阁革格隔个各给根跟更耕工弓公功攻供宫恭巩共勾沟钩狗构购够估姑孤咕姑古谷股骨鼓固故顾瓜刮挂乖拐怪关观官冠馆惯灌贯光广归龟规鬼柜贵桂跪滚棍锅国果裹过'],
  ['H', '哈孩海害含函寒韩罕喊汉汗旱行航毫豪好号浩喝合何和河荷核盒贺黑痕很狠恨恒横轰烘红宏洪喉猴后厚候呼忽狐胡湖糊虎互户护花华划滑化画话怀淮坏欢还环缓换荒慌皇黄谎灰挥恢辉回毁悔汇会绘惠昏婚浑魂混活火伙或货获祸惑'],
  ['J', '击圾基机肌鸡积绩激及吉级即极急疾集几己挤计记纪技忌际剂季既继寄加夹佳家嘉甲价驾架尖坚间肩艰监兼捡检减剪简见件建剑健舰渐践鉴键江姜将讲奖降交郊娇骄胶焦角脚搅叫轿较教阶皆接街节劫洁结捷截姐解介戒届界借巾今斤金津筋仅紧谨尽进近劲禁京经茎惊晶睛精井颈景警净径竞竟敬境静镜纠究揪九久酒旧救就舅居局菊举巨拒具剧惧据距锯聚卷决绝均军君俊'],
  ['K', '卡开凯刊看康扛抗炕考靠科棵颗壳咳可克刻客课肯坑空孔恐控口扣枯哭苦库裤夸块快宽款狂况亏葵愧昆捆困扩括阔'],
  ['L', '垃拉啦喇腊蜡辣来拦栏蓝览懒烂郎狼廊朗浪捞劳牢老乐雷累泪类冷厘梨离李里理力历厉立利例隶粒连帘怜莲联廉脸练炼恋链良凉梁量粮两亮谅辆晾疗辽了料列劣烈猎裂林临淋铃灵岭领另令溜刘流留柳六龙笼楼漏露炉芦鲁陆录鹿路旅铝履律虑率绿卵乱略伦轮论罗萝逻锣骡裸洛络落'],
  ['M', '妈麻马码蚂骂埋买麦卖迈脉瞒馒满慢漫忙芒茫盲猫毛矛茅冒贸帽貌么没眉梅媒煤每美妹门闷们萌蒙猛梦孟迷谜米秘密眠绵棉免勉面苗描秒妙庙灭民敏名明鸣命摸模膜摩磨魔抹末沫陌莫墨默谋某母亩木目牧墓幕慕穆'],
  ['N', '拿哪那纳乃奶耐男南难囊脑恼闹呢嫩能尼泥你拟逆年念娘酿鸟尿捏您宁凝牛扭纽农浓弄奴努怒女暖虐诺'],
  ['O', '哦欧偶'],
  ['P', '趴爬帕怕拍排牌派攀盘判叛盼乓旁胖抛炮跑泡陪培赔佩配喷盆朋棚蓬膨捧碰批披皮疲脾匹屁偏篇骗飘漂票撇拼贫品平评凭瓶泼婆迫破剖扑铺仆葡朴普谱'],
  ['Q', '期欺齐其奇歧骑棋旗乞岂企启起气弃汽器恰千迁牵铅谦签前钱潜浅遣谴欠枪腔强墙抢悄敲桥瞧巧切茄且窃亲侵勤琴禽青轻倾清晴情请庆穷丘秋求球区曲驱屈趋渠取去圈权全泉拳犬劝缺却确群'],
  ['R', '然燃染让饶扰绕热人仁忍认任扔日荣容绒柔肉如儒乳入软锐润若弱'],
  ['S', '撒洒塞赛三伞散丧扫色森杀沙傻晒山删闪陕扇善伤商赏上尚梢烧稍勺少绍舌蛇舍设社射涉摄申伸身深神审婶肾甚渗升生声牲胜绳省圣盛剩尸失师诗施湿十什石时识实拾蚀食史使始驶士氏示世市式似势事侍饰试视柿是适室逝释收手守首寿受授售兽瘦书叔殊疏输蔬熟属暑鼠薯术束述树竖数刷耍衰摔甩帅拴双霜爽谁水税睡顺说丝司私思斯撕死四寺似松宋送搜艘苏俗诉肃素速塑酸蒜算虽随岁碎孙损笋缩所索锁'],
  ['T', '他她它塔踏台抬太态泰贪摊滩坛谈坦毯叹炭汤唐堂塘糖躺掏涛逃桃陶讨套特疼腾梯踢提题蹄体替天添田甜填挑条跳贴铁帖厅听停挺通同铜童桶统痛偷头投透突图徒涂途土吐兔团推腿退吞屯托拖脱驼妥'],
  ['W', '挖哇歪外弯湾丸完玩顽挽晚碗万汪亡王网往忘旺望危威微为围违唯维伟伪尾委卫未位味畏胃喂慰温文纹闻蚊吻稳问翁窝我沃卧握乌污屋无吴五午伍武舞务物误雾'],
  ['X', '夕西吸希昔析息悉惜稀溪熄膝习席袭洗喜系细戏虾瞎峡狭霞下吓夏先仙鲜闲弦贤咸衔显险现限线宪陷献县腺乡相香箱详想响巷项象像橡削消宵销小晓孝校笑效些歇协邪斜鞋写泄泻谢心辛欣新薪信星腥刑行形型醒杏姓幸性胸兄凶雄休修羞朽秀绣袖需虚须徐许序叙畜绪续蓄宣悬旋选穴学雪血寻巡询循训讯迅'],
  ['Y', '压呀押鸦鸭牙芽哑亚呀咽烟淹严言岩沿炎研盐颜眼演厌宴验秧扬羊阳杨洋仰养样腰邀摇遥咬药要耀爷也冶野业叶页夜液一衣医依仪宜姨移遗疑乙已以义艺忆议亦异役译易疫益谊意溢因阴音银引饮隐印应英婴樱迎盈营蝇赢影硬映哟拥庸永泳勇涌用优忧幽悠尤由犹油游友有又右幼诱于予余鱼愉渔舆与宇羽雨语玉育狱浴预域欲遇御愈誉元员园原圆援缘源远怨院愿约月越云匀允运晕韵孕'],
  ['Z', '杂灾栽仔载再在咱攒暂赞脏葬遭糟早枣澡灶造燥责择则泽贼怎增赠扎渣眨炸摘宅窄债寨沾粘展占战站张章涨掌丈帐账障招找召照遮折哲者这浙珍真诊枕阵振镇震争征挣睁蒸整正证郑政症之支只汁芝枝知织肢直值职植殖止旨址纸指至志制治质致秩智置中忠终钟肿种众重周州洲粥轴肘昼皱骤朱珠株诸猪竹逐主煮嘱助住注驻祝著筑抓专转赚庄装壮状撞追准捉桌资姿兹滋宗综总纵走奏租足族阻组祖钻嘴最罪尊遵昨左作坐座做'],
]

let PY_MAP = null
function buildPinyinMap() {
  if (PY_MAP) return PY_MAP
  PY_MAP = Object.create(null)
  for (const [letter, chars] of PINYIN_INDEX) {
    for (const ch of chars) {
      if (!PY_MAP[ch]) PY_MAP[ch] = letter
    }
  }
  return PY_MAP
}

/** 取首字母：中文取拼音首字母，英文取首字母，其余保留 */
export function initials(text) {
  const map = buildPinyinMap()
  let out = ''
  for (const ch of String(text)) {
    if (/[A-Za-z]/.test(ch)) {
      out += ch.toUpperCase()
    } else if (map[ch]) {
      out += map[ch]
    } else if (/[0-9]/.test(ch)) {
      out += ch
    }
  }
  return out
}
