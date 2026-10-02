/**
 * perm.js 自查断言（直接测 src/utils/perm.js 本体）
 * ------------------------------------------------------------
 * 判据分四类，外部来源如下：
 *   1) 经典对照（核心）：Unix 权限的 rwx↔数字是公开常识 —— rwxr-xr-x=755、rw-r--r--=644、
 *      rwxrwxrwx=777、r--------=400、SUID 的 rwsr-xr-x=4755、Sticky 的 rwxrwxrwt=1777、SGID 的 rwxr-sr-x=2755。
 *      这些写死答案，不抄实现。
 *   2) 往返性质：数字→符号→数字必须回到同一串；符号→数字→符号也必须回到同一串（含特殊位 s/S/t/T）。
 *   3) 表自洽：COMMON_PERMS 速查表里的每一条，都要能被 parsePerm 解出来并与表里写的符号串完全一致
 *      （表是人工维护的，这条能抓住表和解析器漂移）。
 *   4) 边界与反例：空/null、非八进制字符、位数不对、符号长度不对、非法符号字符都要抛中文错；
 *      安全警告分级（ok/warn/bad）按公开的「其他人可写 / 777 / SUID+可写」口径判定。
 */
import { useUtils, makeTest } from './harness.mjs'

const P = await useUtils('perm')
const T = makeTest('perm')

/* ---------- 1. 经典对照 ---------- */
T.eq('755 符号', P.parsePerm('755').symbolic, 'rwxr-xr-x')
T.eq('755 三位数字', P.parsePerm('755').octal3, '755')
T.eq('755 四位数字', P.parsePerm('755').octal4, '0755')
T.eq('755 特殊位为 0', P.parsePerm('755').special, 0)
T.eq('rwxr-xr-x→755', P.parsePerm('rwxr-xr-x').octal3, '755')
T.eq('rwxr-xr-x 符号保留', P.parsePerm('rwxr-xr-x').symbolic, 'rwxr-xr-x')
T.eq('644 符号', P.parsePerm('644').symbolic, 'rw-r--r--')
T.eq('rw-r--r--→644', P.parsePerm('rw-r--r--').octal3, '644')
T.eq('600 符号', P.parsePerm('600').symbolic, 'rw-------')
T.eq('700 符号', P.parsePerm('700').symbolic, 'rwx------')
T.eq('777 符号', P.parsePerm('777').symbolic, 'rwxrwxrwx')
T.eq('400 符号', P.parsePerm('400').symbolic, 'r--------')
T.eq('444 符号', P.parsePerm('444').symbolic, 'r--r--r--')
T.eq('0755 四位写法', P.parsePerm('0755').octal4, '0755')
T.eq('0755 符号', P.parsePerm('0755').symbolic, 'rwxr-xr-x')
T.eq('r-xr-xr-x→555', P.parsePerm('r-xr-xr-x').octal3, '555')

/* ---------- 2. 特殊位 SUID / SGID / Sticky ---------- */
T.eq('4755 特殊位 4', P.parsePerm('4755').special, 4)
T.eq('4755 符号含 s', P.parsePerm('4755').symbolic, 'rwsr-xr-x')
T.eq('4755 四位数字', P.parsePerm('4755').octal4, '4755')
T.eq('2755 符号', P.parsePerm('2755').symbolic, 'rwxr-sr-x')
T.eq('1777 符号', P.parsePerm('1777').symbolic, 'rwxrwxrwt')
T.eq('4755 有 SUID 说明', P.parsePerm('4755').specialBits.some((b) => b.key === 'suid'), true)
T.eq('2755 有 SGID 说明', P.parsePerm('2755').specialBits.some((b) => b.key === 'sgid'), true)
T.eq('1777 有 Sticky 说明', P.parsePerm('1777').specialBits.some((b) => b.key === 'sticky'), true)

/* ---------- 3. 往返性质 ---------- */
for (const o of ['755', '644', '600', '700', '777', '400', '444', '4755', '2755', '1777', '0755', '555']) {
  const p = P.parsePerm(o)
  T.eq('往返 ' + o + ' 数字→符号→数字', P.parsePerm(p.symbolic).octal4, p.octal4)
  T.eq('往返 ' + o + ' 符号不变', P.parsePerm(p.symbolic).symbolic, p.symbolic)
}

/* ---------- 4. classes 分解 ---------- */
const c755 = P.parsePerm('755').classes
T.eq('classes 三段', c755.length, 3)
T.eq('属主 digit', c755[0].digit, 7)
T.eq('属主 rwx', c755[0].rwx, 'rwx')
T.eq('属主文字', c755[0].text, '读、写、执行')
T.eq('同组 rwx', c755[1].rwx, 'r-x')
T.eq('同组文字', c755[1].text, '读、执行')
T.eq('其他人文字', c755[2].text, '读、执行')
T.eq('属主可读', c755[0].read, true)
T.eq('同组不可写', c755[1].write, false)
T.eq('同组可执行', c755[1].execute, true)
T.eq('000 文字', P.parsePerm('000').classes[0].text, '无')
T.eq('000 rwx', P.parsePerm('000').classes[0].rwx, '---')

/* ---------- 5. 安全警告分级 ---------- */
T.eq('755 无警告', P.parsePerm('755').warnings.length, 0)
T.eq('755 level ok', P.parsePerm('755').level, 'ok')
T.eq('644 无警告', P.parsePerm('644').warnings.length, 0)
T.eq('777 警告数 3', P.parsePerm('777').warnings.length, 3)
T.eq('777 level bad', P.parsePerm('777').level, 'bad')
T.ok('777 含其他人可写', P.parsePerm('777').warnings.some((w) => /其他人可写/.test(w.text)))
T.ok('777 含全开提示', P.parsePerm('777').warnings.some((w) => /777/.test(w.text)))
T.eq('666 警告数 2', P.parsePerm('666').warnings.length, 2)
T.eq('666 level bad', P.parsePerm('666').level, 'bad')
T.eq('000 level warn', P.parsePerm('000').level, 'warn')
T.ok('000 提示属主不可读', P.parsePerm('000').warnings.some((w) => /属主/.test(w.text)))
T.eq('4755 无警告', P.parsePerm('4755').warnings.length, 0)
T.ok('4777 含提权组合', P.parsePerm('4777').warnings.some((w) => /SUID/.test(w.text)))
T.eq('4777 level bad', P.parsePerm('4777').level, 'bad')

/* ---------- 6. 命令串与杂项 ---------- */
T.eq('755 command', P.parsePerm('755').command, 'chmod 755 <文件>')
T.eq('755 recursive', P.parsePerm('755').recursive, '如需目录递归：chmod -R 755 <目录>')
T.eq('4755 command', P.parsePerm('4755').command, 'chmod 4755 <文件>')
T.eq('755 bitSum', P.parsePerm('755').bitSum, '7+5+5')
T.eq('4755 bitSum', P.parsePerm('4755').bitSum, '7+5+5')
T.eq('input 去空格', P.parsePerm('  755  ').input, '755')
T.eq('去空格后仍可解析', P.parsePerm('  755  ').octal3, '755')

/* ---------- 7. 非法输入：必须抛中文错 ---------- */
T.throws('空输入', () => P.parsePerm(''), /请输入权限/)
T.throws('null 输入', () => P.parsePerm(null), /请输入权限/)
T.throws('乱写', () => P.parsePerm('abc'), /认不出/)
T.throws('八进制含 8', () => P.parsePerm('8'), /八进制/)
T.throws('符号太短', () => P.parsePerm('rwx'), /认不出/)
T.throws('符号含非法字符', () => P.parsePerm('rwxr-xr-z'), /认不出/)
T.throws('三位非法八进制 999', () => P.parsePerm('999'), /认不出/)

/* ---------- 8. 速查表自洽 + UI 契约 ---------- */
T.eq('COMMON_PERMS 数量 12', P.COMMON_PERMS.length, 12)
T.ok('COMMON_PERMS 唯一', new Set(P.COMMON_PERMS.map((x) => x.octal)).size === 12)
for (const c of P.COMMON_PERMS) {
  T.eq('表↔解析符号 ' + c.octal, P.parsePerm(c.octal).symbolic, c.symbolic)
  T.eq('表↔解析回数字 ' + c.symbolic, P.parsePerm(c.symbolic).octal4, P.parsePerm(c.octal).octal4)
  T.ok('表 use 说明够长 ' + c.octal, c.use.length > 3)
}
T.ok('symbolic 形状', /^[-r][-w][-xsStT][-r][-w][-xsStT][-r][-w][-xsStT]$/.test(P.parsePerm('755').symbolic))
T.ok('command 无 undefined/NaN', !/undefined|NaN/.test(P.parsePerm('755').command + P.parsePerm('755').recursive))
T.ok('classes 字段完整', P.parsePerm('755').classes.every((c) => c.name && c.rwx.length === 3 && c.text))
T.ok('specialBits 文案非空', P.parsePerm('4755').specialBits.every((b) => b.name && b.note))

T.done()
