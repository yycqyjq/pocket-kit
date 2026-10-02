/**
 * garbled.js 自查断言（直接测 src/utils/garbled.js 本体）
 * ------------------------------------------------------------
 * 判据分五类：
 *   1) 外部裁判 = Node 的 TextEncoder。乱码样本不抄模块里的 GARBLED_SAMPLES，
 *      而是现场把「随身匣」的 UTF-8 字节逐个当 Latin-1 显示造一份，
 *      再看 best() 能不能原样还原——造样本的编码器和被测模块互不认识。
 *   2) 往返性质：toBytes/fromBytes 互为逆；toBytes(Latin-1 化的串) 必须等于
 *      TextEncoder 给出的真实 UTF-8 字节；多重乱码（被解两次）也要能还原。
 *   3) 已知向量：emoji 的四字节 UTF-8、U+FFFD 替换字符、CJK 码点区间。
 *   4) 边界与反例：空串、纯 ASCII、本来就是正常中文（不该被乱改）。
 *   5) 界面契约：候选结果每条都带 label/text/score/note/rank/isBest，
 *      排名连续、没有重复文本、strong 的排在前面。
 */
import { useUtils, makeTest } from './harness.mjs'

const M = await useUtils('garbled')
const T = makeTest('garbled')

/** 现场造乱码：把 UTF-8 字节逐个当 Latin-1 显示（与模块无关的外部动作） */
const latin1 = (s) => [...new TextEncoder().encode(s)].map((b) => String.fromCharCode(b)).join('')

/* ---------- 0. 解码器表 ---------- */
{
  T.ok('SUPPORTED 非空', M.SUPPORTED.length > 0)
  T.ok('认 UTF-8', M.SUPPORTED.some((x) => x.enc === 'utf-8'))
  T.eq('解码器名不重复', new Set(M.SUPPORTED.map((x) => x.enc)).size, M.SUPPORTED.length)
  for (const x of M.SUPPORTED) {
    T.ok('解码器 ' + x.enc + ' 有可读名', typeof x.name === 'string' && x.name.length > 0)
  }
}

/* ---------- 1. 字节与字符串的往返 ---------- */
{
  const bytes = [...new TextEncoder().encode('随身匣')]
  T.eq('toBytes(Latin-1 化串) == 真实 UTF-8 字节', M.toBytes(latin1('随身匣')), bytes)
  T.eq('toBytes 与 TextEncoder 对 emoji 一致', M.toBytes(latin1('😀')), [...new TextEncoder().encode('😀')])
  for (const s of ['abc', 'é', latin1('中文测试'), latin1('😀')]) {
    T.eq('fromBytes∘toBytes 回到原值：' + JSON.stringify(s), M.fromBytes(M.toBytes(s)), s)
  }
  T.eq('fromBytes 把 0xE9 变成 é', M.fromBytes([0xe9]), 'é')
  T.eq('toBytes 只取低 8 位', M.toBytes('\u0141')[0], 0x41)
}

/* ---------- 2. isByteLike 边界 ---------- */
{
  T.eq('ASCII 算字节样', M.isByteLike('abc'), true)
  T.eq('Latin-1 高区算字节样', M.isByteLike('é'), true)
  T.eq('汉字不算字节样', M.isByteLike('随身匣'), false)
  T.eq('空串不算字节样', M.isByteLike(''), false)
  T.eq('混进一个汉字就不算', M.isByteLike('a中'), false)
  T.eq('emoji 不算字节样', M.isByteLike('😀'), false)
  T.ok('null 不炸（返回布尔）', typeof M.isByteLike(null) === 'boolean')
}

/* ---------- 3. score：CJK 加分、替换字符与拉丁补充区扣分 ---------- */
{
  T.eq('空串给极小值', M.score(''), -1e9)
  T.eq('单个替换字符扣 15', M.score('\uFFFD'), -15)
  T.ok('汉字串为正', M.score('中文') > 0)
  T.ok('汉字比 ASCII 得分高', M.score('中文') > M.score('abc'))
  T.ok('é 这类拉丁补充区为负', M.score('é') < 0)
  T.ok('C1 控制区比拉丁补充区更差', M.score('\u0080') < M.score('é'))
  T.ok('换行有微弱正分', M.score('\n') > 0)
}

/* ---------- 4. 还原：现场造的乱码要回到原值 ---------- */
{
  for (const s of ['随身匣', '中文测试', '😀', '混合 mixed 内容']) {
    const b = M.best(latin1(s))
    T.eq('best 还原 ' + JSON.stringify(s), b.text, s)
  }
  T.eq('已经正常的中文原样返回', M.best('这是一段本来就正常的中文').text, '这是一段本来就正常的中文')
  T.eq('正常中文的标签是原样', M.best('这是一段本来就正常的中文').label, '原样（未处理）')
  // 原样候选永远在（不依赖 best 的排序结论，见报告里记的 UTF-16LE 误判）
  T.ok('原样候选总在列表里', M.recoverCandidates('hello world').some((x) => x.label === '原样（未处理）' && x.text === 'hello world'))

  // 被解两次的乱码：Latin-1 化两次后仍要还原
  const twice = latin1(latin1('随身匣'))
  T.eq('双重乱码也能还原', M.best(twice).text, '随身匣')
  T.ok('双重乱码走的是多轮 UTF-8 候选', M.recoverCandidates(twice).some((x) => x.label.indexOf('连续解') === 0))
}

/* ---------- 5. 候选结构：排序、去重、界面契约 ---------- */
{
  const list = M.recoverCandidates(latin1('随身匣'))
  T.ok('至少给出几条候选', list.length >= 3)
  T.eq('首条就是最可能的那条', list[0].text, '随身匣')
  T.eq('rank 从 1 连续编号', list.map((x) => x.rank), list.map((_, i) => i + 1))
  T.eq('文本不重复', new Set(list.map((x) => x.text)).size, list.length)
  T.ok('strong 的排在非 strong 前面', list.findIndex((x) => !x.strong) === -1 || list.findIndex((x) => !x.strong) >= list.filter((x) => x.strong).length)
  T.ok('恰好一条 isBest', list.filter((x) => x.isBest).length === 1)
  T.eq('isBest 就是第一条', list.filter((x) => x.isBest)[0].rank, 1)
  for (const x of list) {
    T.ok('候选有 label', typeof x.label === 'string' && x.label.length > 0)
    T.ok('候选 text 是字符串', typeof x.text === 'string')
    T.ok('候选 score 是有限数', Number.isFinite(x.score))
    T.ok('候选 note 不是 undefined', typeof x.note === 'string')
    T.ok('候选 from 不是 undefined', typeof x.from === 'string')
    T.ok('候选 strong 是布尔', typeof x.strong === 'boolean')
  }
  T.ok('候选里不出现 undefined 字样', JSON.stringify(list).indexOf('undefined') < 0)
}

/* ---------- 6. diagnose 判语 ---------- */
{
  T.eq('空串提示输入', M.diagnose('').notes[0], '请输入内容')
  T.ok('纯 ASCII 说不必恢复', M.diagnose('abc').notes[0].indexOf('ASCII') >= 0)
  const latin = M.diagnose(latin1('随身匣'))
  T.eq('乱码被认成字节样', latin.byteLike, true)
  T.ok('拉丁补充区占比高时给出「字节被当 Latin-1」的判断', latin.notes[0].indexOf('Latin-1') >= 0)
  T.eq('乱码的 latinSupp 计数', latin.latinSupp, 9)
  const cjk = M.diagnose('这是一段正常的中文文本内容')
  T.ok('正常中文说汉字占比高', cjk.notes[0].indexOf('汉字') >= 0)
  T.eq('正常中文 byteLike=false', cjk.byteLike, false)
  T.ok('混合字符给出混合判断', M.diagnose('aa中é').notes[0].indexOf('混合') >= 0)
  const d = M.diagnose('abc')
  for (const k of ['byteLike', 'nonAscii', 'latinSupp', 'cjk']) {
    T.ok('diagnose.' + k + ' 在结果里', d[k] !== undefined)
  }
  T.ok('diagnose 不出现 undefined', JSON.stringify(d).indexOf('undefined') < 0)
}

T.done()
