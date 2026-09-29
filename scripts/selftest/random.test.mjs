/** 随机模块的自查：区间边界、洗牌与取样的不变量、密码/ID 的形状。
 *  统计类的判据一律放得很松（只看有没有塌成一边），
 *  因为取模偏置量级在 1e-9，抽样测不出来——那种事只能靠算术，见最后一段。 */
import { useUtils } from './harness.mjs'
const R = await useUtils('random')

let ok = 0
let fail = 0
function is(a, b, m) {
  if (a === b) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b))
  }
}
function ok_(cond, m) {
  is(!!cond, true, m)
}

/* ---------- randomInt：区间闭、边界可达 ---------- */
is(R.randomInt(7, 7), 7, '上下相等只能取它自己')
is(R.randomInt(-3, -3), -3, '负数同理')
ok_(Number.isInteger(R.randomInt(1, 6)), '出来是整数')
{
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < 20000; i++) {
    const v = R.randomInt(1, 100)
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  is(lo + '-' + hi, '1-100', '两万次的极值确实摸到了两端')
}
{
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < 20000; i++) {
    const v = R.randomInt(12, 12)
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  is(lo + '-' + hi, '12-12', '零宽区间两万轮都还是 12')
}
is(R.randomInt(6, 1) >= 1 && R.randomInt(6, 1) <= 6, true, '参数写反了照样在区间内')
is(R.randomInt(-10, -1) >= -10 && R.randomInt(-10, -1) <= -1, true, '负区间')
{
  const seen = new Set()
  for (let i = 0; i < 6000; i++) seen.add(R.randomInt(-5, 4))
  is(seen.size, 10, '跨零的十个值都能取到')
}
/* 小数输入：向内取整，[1.5, 2.5] 里只有 2 */
is(R.randomInt(1.5, 2.5), 2, '区间里只剩一个整数时就是它')
is(R.randomInt(0, 0.4), 0, '(0, 0.4) 里有 0')
is(Number.isNaN(R.randomInt(2.5, 2.8)), true, '区间里一个整数都没有 → NaN，界面得先挡掉')
is(Number.isNaN(R.randomInt(0.5, 0.5)), true, '同一个小数也没有整数')

/* 回归钉：旧实现是 nextUint32() % span，跨度超过 2^32 时上半段永远到不了 */
{
  let above = 0
  for (let i = 0; i < 2000; i++) if (R.randomInt(0, 8000000000) > 4294967295) above++
  ok_(above > 500, '8e9 的区间里 4.3e9 以上要取得到（旧实现 20 万次都是 0）')
}
{
  let bad = 0
  for (let i = 0; i < 2000; i++) {
    const v = R.randomInt(5000000000, 9000000000)
    if (!(Number.isInteger(v) && v >= 5000000000 && v <= 9000000000)) bad++
  }
  is(bad, 0, '大区间也逐个落在 [5e9, 9e9] 内且是整数')
}
is(R.randomInt(0, 9007199254740991) >= 0, true, '宽到 2^53 仍给得出数')
ok_(Number.isNaN(R.randomInt(-9e15, 9e15)), '宽过 2^53 表示不动，交回 NaN')

/* ---------- random() ---------- */
{
  let lo = 1
  let hi = 0
  for (let i = 0; i < 5000; i++) {
    const v = R.random()
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  ok_(lo >= 0 && hi < 1, 'random() 恒在 [0,1)')
  ok_(hi > 0.9, '上端取得到接近 1 的地方')
  ok_(lo < 0.1, '下端取得到接近 0 的地方')
}

/* ---------- shuffle / pickMany ---------- */
{
  const src = [1, 2, 3, 4, 5]
  const out = R.shuffle(src)
  is(src.join(','), '1,2,3,4,5', 'shuffle 不改原数组')
  is(out.slice().sort((a, b) => a - b).join(','), '1,2,3,4,5', '出来是个排列，元素不丢不重')
  is(R.shuffle([]).length, 0, '空数组')
  is(R.shuffle([9]).join(','), '9', '单元素')
  is(R.shuffle(null).length, 0, 'null 不炸')
  is(R.shuffle([1, 1, 1]).join(','), '1,1,1', '重复元素原样保留')
  const headCount = new Set()
  for (let i = 0; i < 500; i++) headCount.add(R.shuffle([1, 2, 3, 4, 5, 6])[0])
  is(headCount.size, 6, '洗牌后首位六种可能都出现过')
}
{
  const src = ['a', 'b', 'c', 'd', 'e']
  is(R.pickMany(src, 3).length, 3, '取 3 个')
  is(new Set(R.pickMany(src, 5)).size, 5, '不重复')
  is(R.pickMany(src, 99).length, 5, '要得比总数还多就全给')
  is(R.pickMany(src, 0).length, 0, '要 0 个')
  is(R.pickMany(src, -3).length, 0, '负数当 0')
  is(R.pickMany(src, 4).every((x) => src.includes(x)), true, '只会给原来的元素')
  is(src.length, 5, '原数组没被动过')
}

/* ---------- generatePassword ---------- */
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const DIGIT = '0123456789'
const SYMBOL = '!@#$%^&*()-_=+[]{};:,.?/~'
const SIMILAR = 'il1Lo0O'
const AMBIGUOUS = "{}[]()/\\'\"`~,;:.<>"
{
  const p = R.generatePassword({ length: 20 })
  is(p.password.length, 20, '长度说话算数')
  is(/[A-Z]/.test(p.password) && /[a-z]/.test(p.password) && /[0-9]/.test(p.password), true, '默认每类至少一个')
  const g = R.generatePassword({ length: 24, upper: true, lower: true, digit: true, symbol: true, mustEach: true })
  ok_([...g.password].some((c) => SYMBOL.includes(c)), '开了符号就一定出现')
  is(g.password.length, 24, '补齐之后总长不变')
  is(R.generatePassword({ length: 0 }).password.length, 1, '长度 0 兜到 1')
  is(R.generatePassword({ length: 9999 }).password.length, 128, '上限 128')
  // 默认大小写+数字共 62，剔掉形近 i l 1 L o 0 O 七个后是 55
  is(R.generatePassword({}).poolSize, 55, '默认池子扣掉了七个形近字')
  const nos = R.generatePassword({ length: 200, excludeSimilar: false })
  let pool = UPPER + LOWER + DIGIT
  is(
    [...nos.password].every((c) => pool.includes(c)),
    true,
    '关掉形近过滤后仍然只在这三类的字符集里'
  )
  const onlySym = R.generatePassword({ length: 40, upper: false, lower: false, digit: false, symbol: true, excludeSimilar: false, excludeAmbiguous: false })
  is([...onlySym.password].every((c) => SYMBOL.includes(c)), true, '只开符号时不会漏进别的字符')
  is(onlySym.poolSize, SYMBOL.length, '符号池 26 个')
  const symNoAmb = R.generatePassword({ length: 40, upper: false, lower: false, digit: false, symbol: true, excludeAmbiguous: true })
  const kept = [...SYMBOL].filter((c) => !AMBIGUOUS.includes(c)).join('')
  is([...symNoAmb.password].every((c) => kept.includes(c)), true, '歧义字符真的被剔干净')
  is(symNoAmb.poolSize, kept.length, '池子大小跟着缩')
  ok_(symNoAmb.poolSize < SYMBOL.length, '剔完确实变少了')
  const allOff = R.generatePassword({ length: 12, upper: false, lower: false, digit: false, symbol: false })
  is([...allOff.password].every((c) => LOWER.includes(c)), true, '四类全关时退回小写，不至于生成空串')
  const tight = R.generatePassword({ length: 2, upper: true, lower: true, digit: true, mustEach: true })
  is(tight.password.length, 2, '长度不够三类都塞时就放弃保证，也不能超长')
  const sim = R.generatePassword({ length: 60, excludeSimilar: true, upper: true, lower: true, digit: true, symbol: true })
  is([...sim.password].some((c) => SIMILAR.includes(c)), false, '形近字一个不留')
}

/* ---------- passwordStrength ---------- */
{
  const e = (s, pool) => Math.round(s.length * Math.log2(pool) * 10) / 10
  is(R.passwordStrength('').score, 0, '空串')
  is(R.passwordStrength('').label, '空', '空的说法')
  is(R.passwordStrength('123456').entropy, e('123456', 10), '纯数字按 10 的池子算熵')
  is(R.passwordStrength('123456').tips.includes('包含常见弱模式'), true, '连号要点名')
  is(R.passwordStrength('aaaaaaaa').tips.includes('整串为同一字符'), true, '同一个字要点名')
  is(R.passwordStrength('password').tips.includes('包含常见弱模式'), true, 'password 要点名')
  is(R.passwordStrength('PASSWORD').tips.includes('包含常见弱模式'), true, '大小写不改弱模式')
  is(R.passwordStrength('aA1').label, '很弱', '三位是「很弱」')
  ok_(R.passwordStrength('Tr0ub4dor&3xk').score >= 0 && R.passwordStrength('Tr0ub4dor&3xk').score <= 4, '分数不越界')
  ok_(R.passwordStrength('aB1!cD2@eF3#gH4').score >= 3, '16 位四类齐的应该算强')
  is(R.passwordStrength('aB1!cD2@eF3#gH4').entropy, e('aB1!cD2@eF3#gH4', 95), '四类齐的池子按 95 算')
  is(R.passwordStrength('aB1!cD2@eF3#gH4').label, '很强', '90 熵以上是「很强」')
  is(R.passwordStrength('a').crack, '瞬间', '一位密码瞬间被爆')
  // 熵落在哪一档就报哪一档的单位：13 位纯数字 ≈ 43.2 bit → 2^42.2/1e10 ≈ 8 分钟
  is(/^[1-9]\d? 分钟$/.test(R.passwordStrength('0123456789012').crack), true, '十分钟量级要报「分钟」')
  is(/^[1-9]\d? 小时$/.test(R.passwordStrength('01234567890123').crack), true, '再长一位换「小时」')
  is(/^[1-9]\d? 天$/.test(R.passwordStrength('0123456789012345').crack), true, '再长两位换「天」')
  is(R.passwordStrength('Zx9!Qw7@Km2$Rp5&Tn8#').crack, '远超宇宙年龄', '20 位四类的估算是天文数字')
  is(R.passwordStrength('abc123').tips.length >= 2, true, '弱密码至少给两条提示')
}

/* ---------- 各类 ID 的形状 ---------- */
{
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  is(re.test(R.uuidV4()), true, 'UUID v4 形状（第 14 位是版本 4，第 19 位在 8/9/a/b 里）')
  const set = new Set()
  for (let i = 0; i < 2000; i++) set.add(R.uuidV4())
  is(set.size, 2000, '两千个不重样')
  const seenVariant = new Set()
  for (let i = 0; i < 400; i++) seenVariant.add(R.uuidV4()[19])
  is(seenVariant.size, 4, '变体位四个值都出现')
  const hexVersion = new Set()
  for (let i = 0; i < 300; i++) hexVersion.add(R.uuidV4()[14])
  is([...hexVersion].join(''), '4', '版本位恒为 4，没有第二取值')
}
{
  is(R.shortId().length, 21, '短 ID 默认 21 位')
  is(R.shortId(8).length, 8, '指定 8 位')
  is(R.shortId(6, 'abc').length, 6, '自定义字母表也按长度出')
  is([...R.shortId(40, 'abc')].every((c) => 'abc'.includes(c)), true, '只会用给定字母表里的字符')
  is(new Set(Array.from({ length: 40 }, () => R.shortId(4, 'ab'))).size > 8, true, '两位字母表也真随机，不是全同')
  is(new Set(Array.from({ length: 300 }, () => R.shortId())).size, 300, '短 ID 三百个不重样')
}
{
  const o = R.objectIdLike()
  is(/^[0-9a-f]{24}$/.test(o), true, '24 位十六进制')
  const ts = parseInt(o.slice(0, 8), 16)
  ok_(Math.abs(ts - Math.floor(Date.now() / 1000)) <= 2, '前 8 位是当前的秒级时间戳')
  is(new Set(Array.from({ length: 200 }, () => R.objectIdLike())).size, 200, '同一秒内也撞不出重复')
}
{
  const u = R.uintId()
  is(/^\d+$/.test(u), true, '无符号十进制')
  ok_(Number(u) >= 0 && Number(u) <= 4294967295, '在 32 位无符号范围内')
}
{
  const s = R.snowflakeLike()
  is(/^\d{19}$/.test(s), true, '19 位十进制')
  const back = Number(BigInt(s) >> 22n)
  ok_(Math.abs(back - (Date.now() - 1288834974657)) <= 2000, '右移 22 位能还原出当前毫秒时间戳')
  const low = BigInt(s) & ((1n << 22n) - 1n)
  ok_(low >= 0n && low < 4194304n, '低 22 位在 0..4194303 里')
}

/* ---------- roll ---------- */
{
  is(R.roll('coin', 1).length, 1, '一枚硬币')
  is(R.roll('coin', 0).length, 1, '要 0 次也给 1 次')
  is(R.roll('coin', 9999).length, 100, '上限 100 次')
  is(R.roll('coin', 50).every((x) => x === '正' || x === '反'), true, '硬币只有正反')
  is(R.roll('dice', 500).every((x) => Number.isInteger(x) && x >= 1 && x <= 6), true, '骰子在 1..6')
  is(R.roll('lot', 500).every((x) => Number.isInteger(x) && x >= 1 && x <= 100), true, '抽签在 1..100')
  const diceSeen = new Set(R.roll('dice', 500))
  is(diceSeen.size, 6, '五百次骰子六个面都出现过')
}

/* ---------- 偏置这件事只能用算术说，抽样看不出来 ---------- */
/* 旧写法 nextUint32() % span：2^32 除 6 余 4，前 4 个面各多出 1/2^32 的概率——
   量级 2e-10，六十万次采样完全淹在噪声里，所以这里断言的是算术事实而不是观测。 */
is(2 ** 32 % 6, 4, '2^32 不被 6 整除，取模必然有偏')
is(2 ** 53 % 6, 2, '换到 2^53 同样不整除——所以靠拒绝采样，不靠取模')
{
  // 拒绝采样的判据：接受的区间必须是 span 的整数倍
  const limit = 2 ** 53 - (2 ** 53 % 100)
  is(limit % 100, 0, '1..100 的接受域正好铺满整数个周期')
  is(2 ** 53 - limit < 100, true, '丢掉的部分不到一个周期')
}

console.log('== random pass=' + ok + '/' + (ok + fail))
if (fail) process.exitCode = 1
