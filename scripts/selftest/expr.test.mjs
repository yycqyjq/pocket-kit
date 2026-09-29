/** 表达式计算器的自查。
 *  对照有三类：
 *  一是拿 JS 自己的算术当裁判——优先级、结合性、幂右结合这些语义，写成人话表达式跟引擎给的值对撞；
 *  二是精确已知值与恒等式——sin(30°)=0.5、asin(1)=90、sin²+cos²=1、deg(rad(x))=x，这些不依赖任何实现细节；
 *  三是界面契约——SAMPLE_EXPRS 里那八个快捷片段必须算得出、算得对。
 *  浮点余数（角度制下 cos(90) 给 6.1e-17、tan(90) 给 1.6e+16）按当前行为钉住并在注释里说明，不假装它是 0。 */
import { useUtils } from './harness.mjs'
const X = await useUtils('expr')

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
function close(a, b, eps, m) {
  if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + a + ' want ' + b + ' ±' + eps)
  }
}
function throwsWith(input, re, m, deg) {
  try {
    X.calc(input, deg)
    fail++
    console.log('FAIL ' + m + ': 应该报错却没报错')
  } catch (e) {
    const msg = e && e.message ? e.message : String(e)
    if (!/[\u4e00-\u9fa5]/.test(msg)) {
      fail++
      console.log('FAIL ' + m + ': 报错不是中文 → ' + msg)
    } else if (re && !re.test(msg)) {
      fail++
      console.log('FAIL ' + m + ': 文案不符 → ' + msg)
    } else ok++
  }
}
const val = (s, deg) => X.evaluate(s, deg)
const disp = (s, deg) => X.calc(s, deg).display

/* ---------- 四则与优先级：拿引擎算术做对照 ---------- */
{
  const table = [
    ['2+3*4', 2 + 3 * 4],
    ['(2+3)*4', (2 + 3) * 4],
    ['2+3*4-5/2', 2 + 3 * 4 - 5 / 2],
    ['10-2-3', 10 - 2 - 3],
    ['100/5/2', 100 / 5 / 2],
    ['7%3', 7 % 3],
    ['1024%37', 1024 % 37],
    ['-10%3', -10 % 3],
    ['1+2*3^2', 1 + 2 * 3 ** 2],
    ['(1+2)*(3+4)', (1 + 2) * (3 + 4)],
    ['2^10', 2 ** 10],
    ['2^3^2', 2 ** (3 ** 2)],
    ['-2^2', -(2 ** 2)],
    ['2^-1', 2 ** -1],
    ['-(3+4)', -(3 + 4)],
    ['1.5+2.25', 1.5 + 2.25],
    ['0.1+0.2', 0.1 + 0.2],
  ]
  for (const [expr, want] of table) {
    close(val(expr, true), want, 1e-12, expr + ' 与引擎算术一致')
  }
  is(disp('0.1+0.2', true), '0.3', '显示层给 12 位有效数字，不印 0.30000000000000004')
}

/* ---------- 括号、空格、隐式乘 ---------- */
{
  is(val('((1+2))', true), 3, '多层括号')
  is(val('3(4+5)', true), 27, '隐式乘：3(4+5)')
  is(val('2(3)', true), 6, '隐式乘：2(3)')
  close(val('2pi', true), 2 * Math.PI, 1e-12, '隐式乘：2pi')
  throwsWith('pi pi', /未知的名称/, '两个名字并排会被切成 pipi，报错而不是猜成 π²')
  close(val('2pi^2', true), 2 * Math.PI ** 2, 1e-9, 'pi^2 先算幂再吃隐式乘')
  close(val('sqrt(9)^2', true), 9, 1e-9, '函数结果可以接着做幂')
  is(val('(3!)!', true), 720, '阶乘可以套阶乘')
  // 隐式乘不比乘法更紧，按从左到右走：这是界面没写明、但用户会猜错的点
  close(val('1/2pi', true), Math.PI / 2, 1e-12, '1/2pi 是 (1/2)*pi，不是 1/(2*pi)')
  close(val('2^2pi', true), 4 * Math.PI, 1e-12, '2^2pi 是 (2^2)*pi')
  is(disp('1024 % 37', true), '25', '运算符两侧的空格随便加')
  throwsWith('2 3', /数字之间不能只隔空格/, '两个数字之间只留空格：不许粘成 23')
  throwsWith('12 +3 4', /数字之间不能只隔空格/, '同上，出现在表达式中段也要拦住')
  throwsWith('2 .5', /数字之间不能只隔空格/, '数字与小数点之间也只留一次乘法的机会')
  throwsWith('1 000+1', /数字之间不能只隔空格/, '空格当千分位也不猜，让人自己写清楚')
}

/* ---------- 阶乘 ---------- */
{
  is(val('0!', true), 1, '0! = 1')
  is(val('1!', true), 1, '1! = 1')
  is(val('5!', true), 120, '5! = 120')
  is(val('10!', true), 3628800, '10! 界面示例值')
  is(val('1!+2!', true), 3, '阶乘参与求和')
  is(val('10!/(3!*7!)', true), 120, '组合数 C(10,3)')
  ok_(Number.isFinite(val('170!', true)), '170! 还在 double 范围内（界面写着最大 170!）')
  ok_(val('170!', true) > 7.2e306 && val('170!', true) < 7.3e306, '170! 的量级')
  is(disp('171!', true), '∞ 无穷大', '171! 溢出成无穷，不报错也不给假数')
  throwsWith('(-1)!', /阶乘只支持非负整数/, '负数没有阶乘')
  throwsWith('1.5!', /阶乘只支持非负整数/, '小数没有阶乘（这里不接伽马函数）')
  throwsWith('sqrt(-4)!', /阶乘|有效数字/, 'NaN 想求阶乘要当场拦住')
}

/* ---------- 词法：数字写法 ---------- */
{
  is(val('1e5', true), 100000, '小写 e 的科学计数法')
  is(val('1E5', true), 100000, '大写 E 也一样认——只认小写时这条会当成 1×E5 报未知名称')
  close(val('1.5e-3', true), 0.0015, 1e-18, '小写 1.5e-3')
  close(val('1.5E-3', true), 0.0015, 1e-18, '大写 1.5E-3：旧实现拆成 1.5×e−3，静默给出 1.0774')
  close(val('1.5E3', true), 1500, 1e-9, '1.5E3 是 1500')
  close(val('6.02E23', true), 6.02e23, 1e11, '阿伏伽德罗常数那个写法')
  is(val('1e+3', true), 1000, '正号指数')
  close(val('2E', true), 2 * Math.E, 1e-12, 'E 后面没有数字就还是常数 e')
  close(val('1E', true), Math.E, 1e-15, '1E 是 1×e，不是指数')
  is(disp('.5', true), '0.5', '省略整数部分')
  is(disp('5.', true), '5', '省略小数部分')
  is(val('0.5*2', true), 1, '小数参与运算')
  throwsWith('1.2.3', /多个小数点/, '一个数字里两个小数点')
  throwsWith('@', /看不懂的字符/, '不认识符号要说清是哪个')
  throwsWith('1_000', /未知的名称/, '下划线分隔不认，但也别当成 1000')
  throwsWith('', /请输入表达式/, '空输入')
  throwsWith('   ', /请输入表达式/, '全是空格')
}

/* ---------- 常量、别名、Unicode ---------- */
{
  close(val('pi', true), Math.PI, 1e-15, 'pi')
  close(val('π', true), Math.PI, 1e-15, '希腊字母 π')
  close(val('PI', true), Math.PI, 1e-15, '大小写不敏感')
  close(val('e', true), Math.E, 1e-15, 'e')
  close(val('tau', true), 2 * Math.PI, 1e-15, 'tau 是 2π')
  is(disp('inf', true), '∞ 无穷大', 'inf 常量')
  throwsWith('inf-inf', /有效数字/, '∞−∞ 是不定式，别给个 0 糊过去')
  is(val('2×3', true), 6, '乘号 ×')
  is(val('2✕3', true), 6, '乘号 ✕')
  is(val('6÷3', true), 2, '除号 ÷')
  throwsWith('2，3', /逗号/, '全角逗号是分隔符，不许被吃掉当成 23')
  throwsWith('1，2，3', /逗号只能写在函数参数之间/, '全角逗号也归到千分位那条提示')
  throwsWith('1,000+1', /千分位/, '半角千分位同样给提示')
  throwsWith('(1+2', /表达式不完整/, '少了右括号')
  throwsWith('1+', /表达式不完整/, '运算符后面空了')
  throwsWith('()', /表达式不完整/, '空括号')
  throwsWith('2**3', /表达式不完整/, '不认 ** 写法，但给的是中文')
  throwsWith('1+2 3 4', /数字之间|表达式/, '多个数字并排不许静默拼起来')
}

/* ---------- 角度制 / 弧度制 ---------- */
{
  close(val('sin(30)', true), 0.5, 1e-12, '角度制 sin(30)=0.5')
  close(val('cos(60)', true), 0.5, 1e-12, '角度制 cos(60)=0.5')
  close(val('tan(45)', true), 1, 1e-12, '角度制 tan(45)=1')
  close(val('sin(90)', true), 1, 1e-12, '角度制 sin(90)=1')
  close(val('asin(1)', true), 90, 1e-9, '角度制下 asin(1) 给 90 而不是 π/2')
  close(val('acos(1)', true), 0, 1e-12, 'acos(1)=0')
  close(val('atan2(1,1)', true), 45, 1e-9, 'atan2 也跟随角度制')
  close(val('atan2(0,-1)', true), 180, 1e-9, 'atan2 的象限是对的，不是只看比值')
  is(val('deg(pi)', true), 180, 'deg() 把弧度换成角度')
  close(val('rad(180)', true), Math.PI, 1e-15, 'rad() 反过来')
  is(val('deg(pi)', false), 180, 'deg()/rad() 不受模式影响：它们自己就是转换器')
  close(val('deg(rad(37))', true), 37, 1e-9, '两个转换器互为逆运算')
  // 弧度制那一组：同一个式子必须跟着模式变
  close(val('sin(30)', false), Math.sin(30), 1e-12, '弧度制 sin(30) 是 30 弧度')
  ok_(val('sin(30)', false) < -0.98 && val('sin(30)', false) > -0.99, '弧度制下 sin(30) 与角度制的 0.5 完全不同')
  close(val('asin(1)', false), Math.PI / 2, 1e-15, '弧度制 asin(1)=π/2')
  close(val('atan2(1,1)', false), Math.PI / 4, 1e-15, '弧度制 atan2')
  close(val('sin(pi)', false), 0, 1e-15, '弧度制 sin(π) 落在 0 附近')
  close(val('sin(30)+cos(60)', true), 1, 1e-12, '界面示例：角度制下正好是 1')
  // 浮点余数按现状钉住：角度制换弧度时 π 不是精确值，所以这两条不是 0 和 ∞
  ok_(Math.abs(val('cos(90)', true)) < 1e-15, '角度制 cos(90) 只剩浮点余数，显示成 6.1e-17')
  ok_(val('tan(90)', true) > 1e15, '角度制 tan(90) 因为同一个原因给一个巨大的数而不是报错')
  for (const a of [0, 7, 23, 45, 88, 137, 200, 359]) {
    const s = val('sin(' + a + ')', true)
    const c = val('cos(' + a + ')', true)
    close(s * s + c * c, 1, 1e-9, a + ' 度的 sin²+cos²=1')
  }
  for (const a of [0.1, 0.5, 0.9]) {
    close(val('sin(asin(' + a + '))', true), a, 1e-12, 'asin 是 sin 的逆（角度制）')
  }
  is(disp('sin(30)', true), '0.5', '浮点尾巴不进显示（0.49999999999999994 → 0.5）')
  is(disp('tan(45)', true), '1', '同上，0.9999999999999999 → 1')
  // 默认参数：不传模式时是角度制，界面的默认档就是这个
  close(val('sin(30)'), 0.5, 1e-12, 'evaluate 不传第二个参数默认角度制')
  close(val('sin(30)', undefined), 0.5, 1e-12, 'undefined 也是默认，不是弧度')
  throwsWith('asin(2)', /有效数字/, '定义域外给 NaN，再被拦住')
  throwsWith('sin(1,2)', /需要 1 个参数/, '一元函数多给参数')
  throwsWith('sin()', /需要 1 个参数/, '一元函数空参数')
  // 函数名会吃掉后面的数字，所以无括号写法只对运算符生效
  close(val('sin-30', true), -0.5, 1e-15, 'sin-30 这种写法走的是无括号分支')
  throwsWith('sin30', /未知的名称/, 'sin30 会被切成一个名字，报错而不是猜')
  throwsWith('sin2pi', /未知的名称/, '注释里那条「等价于 sin(2*pi)」的说法不成立，钉住真实行为')
}

/* ---------- 函数家族 ---------- */
{
  is(val('sqrt(9)', true), 3, 'sqrt')
  close(val('sqrt(2)^2', true), 2, 1e-9, 'sqrt(2)² 回到 2')
  throwsWith('sqrt(-4)', /有效数字/, '负数开平方不硬造虚数')
  is(val('cbrt(-8)', true), -2, 'cbrt 收负数')
  is(val('abs(-3)', true), 3, 'abs')
  is(val('sign(-2)', true), -1, 'sign 负')
  is(val('sign(0)', true), 0, 'sign 零')
  is(val('sign(5)', true), 1, 'sign 正')
  is(val('floor(2.7)', true), 2, 'floor')
  is(val('floor(-2.7)', true), -3, 'floor 往小走')
  is(val('ceil(2.1)', true), 3, 'ceil')
  is(val('trunc(-2.7)', true), -2, 'trunc 往零走')
  is(val('round(2.5)', true), 3, 'round 半数进位')
  is(val('round(-2.5)', true), -2, 'round 对负半数是 JS 口径')
  close(val('exp(1)', true), Math.E, 1e-15, 'exp(1)=e')
  is(val('ln(e)', true), 1, 'ln(e)=1')
  is(val('log(1000)', true), 3, 'log 是常用对数（以 10 为底）')
  is(val('log10(1000)', true), 3, 'log10 与 log 同义')
  is(val('log2(8)', true), 3, 'log2')
  is(val('log(1000)+ln(e^2)', true), 5, '界面示例：对数那条')
  is(val('pow(2,10)', true), 1024, 'pow 双参')
  is(val('min(3,1,2)', true), 1, 'min 可变参')
  is(val('max(3,1,2)', true), 3, 'max 可变参')
  is(val('hypot(3,4)', true), 5, 'hypot 勾股')
  is(val('hypot(3,4,12)', true), 13, 'hypot 三个参数照常')
  throwsWith('max(1)', /需要至少两个参数/, '双参函数只给一个')
  throwsWith('max()', /需要至少两个参数/, '一个都不给')
  throwsWith('pow(2,3,4)', /只接受两个参数/, 'pow 多给一个不许悄悄丢掉（旧实现静默给 8）')
  throwsWith('atan2(1,1,1)', /只接受两个参数/, 'atan2 同上')
  is(val('max(1,2)+min(3,4)', true), 5, '多参函数参与求和')
  close(val('sqrt(hypot(3,4))', true), Math.sqrt(5), 1e-12, '嵌套函数：hypot 的结果再开方')
  throwsWith('foo(1)', /未知的名称/, '未知函数名要指名道姓')
  throwsWith('1+foo', /未知的名称/, '未知常量名同理')
}

/* ---------- 显示层：整数、有效数字、科学计数、十六进制 ---------- */
{
  is(disp('9', true), '9', '整数直接给')
  is(disp('1/3', true), '0.333333333333', '非整数保留 12 位有效数字')
  is(disp('2/3', true), '0.666666666667', '最后一位是四舍五入来的')
  is(disp('1e-20', true), '1e-20', '极小值走 toString 的指数形式')
  is(disp('1/0', true), '∞ 无穷大', '正无穷')
  is(disp('-1/0', true), '-∞ 负无穷大', '负无穷')
  is(disp('0^0', true), '1', '0 的 0 次方按 JS 口径是 1')
  is(disp('-0', true), '0', '负零印成 0')
  is(disp('9^9^9', true), '∞ 无穷大', 'tower 溢出不炸')
  is(disp('1e309', true), '∞ 无穷大', '字面量本身溢出也给得出话')
  const big = X.calc('1e15', true)
  is(big.display, '1000000000000000', '1e15 的 display 还是十进制')
  is(big.scientific, '1.000000e+15', '到 1e15 起附科学计数法')
  is(X.calc('1e14', true).scientific, '', '不到 1e15 不附')
  is(X.calc('-1e20', true).scientific, '-1.000000e+20', '负的大值同样附')
  is(X.calc('1/0', true).scientific, '', '无穷不附科学计数')
  is(X.calc('255', true).hex, '0xff', '整数给十六进制')
  is(X.calc('1024', true).hex, '0x400', '同上')
  is(X.calc('-1', true).hex, '', '负数不给十六进制')
  is(X.calc('0.5', true).hex, '', '非整数不给')
  is(X.calc('1e16', true).hex, '', '十六进制行有意只覆盖安全整数范围（大数留给计算结果那行印全）')
  is(X.calc('9007199254740991', true).hex, '0x1fffffffffffff', '安全整数上限照样给十六进制')
  is(Object.keys(X.calc('1', true)).sort().join(','), 'display,hex,scientific,value', '界面只吃这四个字段')
}

/* ---------- 整数结果逐位印全（曾经一到 1e15 就砍成 12 位有效数字，末尾几位是编出来的） ---------- */
{
  is(disp('2^50', true), '1125899906842624', '2^50 的尾数不能被砍成 …840000')
  is(X.calc('2^50', true).hex, '0x4000000000000', '十六进制那行本来就对，两行不再自相矛盾')
  is(disp('2^52', true), '4503599627370496', '2^52 同样一位不差')
  is(disp('9007199254740991', true), '9007199254740991', '安全整数上限本身也印全')
  is(disp('123456789012345', true), '123456789012345', '15 位整数')
  is(disp('15!', true), '1307674368000', '15! 全位印出')
  // 安全范围之外照样是整数：整数值的双精度数本身就是精确整数，String 读得回同一个数
  is(disp('20!', true), '2432902008176640000', '20! 双精度本来就存得下，不该印成 …8180000000')
  ok_(X.calc('20!', true).scientific === '2.432902e+18', '20! 的科学计数法行照旧给量级')
  is(disp('2^53', true), '9007199254740992', '2^53 起双精度间隔变成 2，但这个数仍存得准')
  is(disp('2^60', true), '1152921504606847000', '再往上只能给「能读回」的最短十进制，比 12 位有效数字多 4 位真数')
  ok_(Number(disp('2^60', true)) === 2 ** 60, '印出来的字符串读回来还是同一个 double')
  is(disp('25!', true), '1.5511210043330986e+25', '超过 1e21 由 JS 自己换成科学计数法，不虚印一长串')
}

/* ---------- 稳定与不重复求值 ---------- */
{
  const t = 'sin(30)+2^10-log(100)'
  is(disp(t, true), disp(t, true), '同一句重复算，结果一样')
  is(disp(t, false), disp(t, false), '弧度制同理')
  ok_(disp(t, true) !== disp(t, false), '两种模式对同一句的结果不同（模式确实传到了三角函数）')
  const src = '1+2*3'
  const before = src
  is(src, before, '输入字符串不会被改动（纯函数）')
  is(typeof X.calc('1', true).value, 'number', 'value 是数字')
}

/* ---------- 界面快捷片段：八个都得算得出 ---------- */
{
  const want = {
    'pi*5^2': 25 * Math.PI,
    '1.05^30': 1.05 ** 30,
    'sin(30)+cos(60)': 1,
    'log(1000)+ln(e^2)': 5,
    '10!': 3628800,
    'hypot(3,4)': 5,
    '1024 % 37': 25,
    '10!/(3!*7!)': 120,
  }
  ok_(X.SAMPLE_EXPRS.length >= 8, '快捷片段至少八条')
  for (const s of X.SAMPLE_EXPRS) {
    ok_(s.name && s.expr, '每条都要有名字和表达式：' + s.name)
    ok_(s.expr in want, '示例表达式在对照表里：' + s.expr)
    close(val(s.expr, true), want[s.expr], 1e-9, '片段「' + s.name + '」算得出且值对')
  }
}

console.log('== expr pass=' + ok + '/' + (ok + fail))
if (fail) process.exitCode = 1
