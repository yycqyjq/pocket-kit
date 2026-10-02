/**
 * health.js 自查断言（直接测 src/utils/health.js 本体）
 * ------------------------------------------------------------
 * 判据分四类，外部来源如下：
 *   1) 教科书公式（核心）：BMI = w / (h/100)^2；基础代谢 Mifflin-St Jeor
 *      10w + 6.25h - 5a + (男 +5 / 女 -161)；体脂 Deurenberg 1.2·BMI + 0.23·年龄 - 10.8·(男) - 5.4。
 *      这些公式在测试里独立再写一遍对撞，不抄实现里的表达式写法。
 *   2) 分级阈值：BMI 分级用中国成人标准 WS/T 428-2013（18.5 / 24 / 28）；
 *      体脂分级、腰高比 0.5 / 0.6 的分档都是公开口径，用「略低于/略高于阈值」的成对样例钉边界。
 *   3) 常量事实：活动系数 1.2 / 1.375 / 1.55 / 1.725 / 1.9 是公认的 TDEE 系数；饮水量 30/35 ml/kg。
 *   4) 边界与反例：0、负数、非数字都要抛中文错；数值字段不得为 NaN，tone 只能是 ok/warn/bad。
 */
import { useUtils, makeTest } from './harness.mjs'

const M = await useUtils('health')
const T = makeTest('health')

/* 独立公式实现 */
const refBmi = (w, hcm) => { const h = hcm / 100; return w / (h * h) }
const refBmr = (w, h, a, g) => 10 * w + 6.25 * h - 5 * a + (g === 'male' ? 5 : -161)
const refBodyFat = (b, a, g) => 1.2 * b + 0.23 * a - 10.8 * (g === 'male' ? 1 : 0) - 5.4

/* ---------- 1. BMI ---------- */
T.ok('bmi 与独立公式一致 70/175', Math.abs(M.bmi(70, 175).value - refBmi(70, 175)) < 1e-12)
T.eq('bmi 70/175 标签', M.bmi(70, 175).label, '正常')
T.eq('bmi 70/175 tone', M.bmi(70, 175).tone, 'ok')
T.eq('bmi 70/175 无需调整', M.bmi(70, 175).toNormal, 0)
T.ok('bmi minNormal 与 idealWeight 一致', Math.abs(M.bmi(70, 175).minNormal - M.idealWeight(175).min) < 1e-12)
T.ok('bmi maxNormal 与 idealWeight 一致', Math.abs(M.bmi(70, 175).maxNormal - M.idealWeight(175).max) < 1e-12)

T.eq('bmi 50/170 偏瘦', M.bmi(50, 170).label, '偏瘦')
T.eq('bmi 50/170 tone', M.bmi(50, 170).tone, 'warn')
T.ok('bmi 50/170 增重目标=下限-体重', Math.abs(M.bmi(50, 170).toNormal - (18.5 * 1.7 * 1.7 - 50)) < 1e-9)
T.eq('bmi 80/170 超重', M.bmi(80, 170).label, '超重')
T.ok('bmi 80/170 减重目标=体重-上限', Math.abs(M.bmi(80, 170).toNormal - (80 - 23.9 * 1.7 * 1.7)) < 1e-9)
T.eq('bmi 90/170 肥胖', M.bmi(90, 170).label, '肥胖')
T.eq('bmi 90/170 tone', M.bmi(90, 170).tone, 'bad')

// 分级边界（中国标准 18.5 / 24 / 28），用略低于/略高于阈值规避浮点正好落在边界
const H = 170
const h2 = (H / 100) * (H / 100)
T.eq('bmi 18.49 偏瘦', M.bmi(18.49 * h2, H).label, '偏瘦')
T.eq('bmi 18.51 正常', M.bmi(18.51 * h2, H).label, '正常')
T.eq('bmi 23.99 正常', M.bmi(23.99 * h2, H).label, '正常')
T.eq('bmi 24.01 超重', M.bmi(24.01 * h2, H).label, '超重')
T.eq('bmi 27.99 超重', M.bmi(27.99 * h2, H).label, '超重')
T.eq('bmi 28.01 肥胖', M.bmi(28.01 * h2, H).label, '肥胖')
T.throws('bmi 体重 0 抛中文', () => M.bmi(0, 170), /身高和体重/)
T.throws('bmi 身高 0 抛中文', () => M.bmi(70, 0), /身高和体重/)
T.throws('bmi 负数抛中文', () => M.bmi(-1, 170), /身高和体重/)
T.throws('bmi 非数字抛中文', () => M.bmi('x', 170), /身高和体重/)

/* ---------- 2. 基础代谢 BMR（Mifflin-St Jeor） ---------- */
T.ok('bmr 男与公式一致', Math.abs(M.bmr(70, 175, 30, 'male') - refBmr(70, 175, 30, 'male')) < 1e-12)
T.ok('bmr 男已知值 1648.75', Math.abs(M.bmr(70, 175, 30, 'male') - 1648.75) < 1e-9)
T.ok('bmr 女已知值 1482.75', Math.abs(M.bmr(70, 175, 30, 'female') - 1482.75) < 1e-9)
T.ok('bmr 性别缺省按女', Math.abs(M.bmr(70, 175, 30) - 1482.75) < 1e-9)
T.ok('bmr 女 60/160/25', Math.abs(M.bmr(60, 160, 25, 'female') - 1314) < 1e-9)
T.throws('bmr 年龄 0 抛中文', () => M.bmr(70, 175, 0, 'male'), /身体数据/)
T.throws('bmr 身高 0 抛中文', () => M.bmr(70, 0, 30, 'male'), /身体数据/)

/* ---------- 3. TDEE 与活动系数 ---------- */
T.eq('tdee 久坐 1500×1.2', M.tdee(1500, 'sedentary').value, 1800)
T.eq('tdee 中度 1500×1.55', M.tdee(1500, 'moderate').value, 2325)
T.eq('tdee 专业 1500×1.9', M.tdee(1500, 'athlete').value, 2850)
T.eq('tdee 未知档回退久坐', M.tdee(1500, 'nope').value, 1800)
T.eq('tdee 返回档位 key', M.tdee(1500, 'active').level.key, 'active')
T.eq('ACTIVITY_LEVELS 数量 5', M.ACTIVITY_LEVELS.length, 5)
T.eq('ACTIVITY_LEVELS 系数（公认值）', M.ACTIVITY_LEVELS.map((l) => l.factor), [1.2, 1.375, 1.55, 1.725, 1.9])
T.ok('ACTIVITY_LEVELS key 唯一', new Set(M.ACTIVITY_LEVELS.map((l) => l.key)).size === 5)

/* ---------- 4. 体脂率（Deurenberg） ---------- */
T.ok('bodyFat 男与公式一致', Math.abs(M.bodyFat(22, 30, 'male') - refBodyFat(22, 30, 'male')) < 1e-12)
T.ok('bodyFat 男已知值 17.1', Math.abs(M.bodyFat(22, 30, 'male') - 17.1) < 1e-9)
T.ok('bodyFat 女已知值 27.9', Math.abs(M.bodyFat(22, 30, 'female') - 27.9) < 1e-9)
T.ok('bodyFat 25/40/男 与公式一致', Math.abs(M.bodyFat(25, 40, 'male') - refBodyFat(25, 40, 'male')) < 1e-12)
T.throws('bodyFat BMI 0 抛中文', () => M.bodyFat(0, 30, 'male'), /年龄与身体数据/)
T.throws('bodyFat 年龄 0 抛中文', () => M.bodyFat(22, 0, 'male'), /年龄与身体数据/)

/* ---------- 5. 体脂分级 ---------- */
T.eq('体脂 男 5', M.bodyFatLabel(5, 'male'), '必需脂肪')
T.eq('体脂 男 6 进运动员', M.bodyFatLabel(6, 'male'), '运动员')
T.eq('体脂 男 13.9', M.bodyFatLabel(13.9, 'male'), '运动员')
T.eq('体脂 男 14 进健康', M.bodyFatLabel(14, 'male'), '健康')
T.eq('体脂 男 18 进偏高', M.bodyFatLabel(18, 'male'), '偏高')
T.eq('体脂 男 25 进肥胖', M.bodyFatLabel(25, 'male'), '肥胖')
T.eq('体脂 女 13', M.bodyFatLabel(13, 'female'), '必需脂肪')
T.eq('体脂 女 14 进运动员', M.bodyFatLabel(14, 'female'), '运动员')
T.eq('体脂 女 21 进健康', M.bodyFatLabel(21, 'female'), '健康')
T.eq('体脂 女 25 进偏高', M.bodyFatLabel(25, 'female'), '偏高')
T.eq('体脂 女 32 进肥胖', M.bodyFatLabel(32, 'female'), '肥胖')

/* ---------- 6. 理想体重 / 饮水 / 腰高比 ---------- */
T.ok('idealWeight 下限=18.5h²', Math.abs(M.idealWeight(175).min - 18.5 * 1.75 * 1.75) < 1e-12)
T.ok('idealWeight 上限=23.9h²', Math.abs(M.idealWeight(175).max - 23.9 * 1.75 * 1.75) < 1e-12)
T.throws('idealWeight 身高 0 抛中文', () => M.idealWeight(0), /身高/)

T.eq('waterIntake 普通 70kg = 2100ml', M.waterIntake(70, false).ml, 2100)
T.eq('waterIntake 普通杯数 8', M.waterIntake(70, false).cups, 8)
T.eq('waterIntake 运动 70kg = 2450ml', M.waterIntake(70, true).ml, 2450)
T.eq('waterIntake 运动杯数 10', M.waterIntake(70, true).cups, 10)
T.eq('waterIntake 60kg = 1800ml', M.waterIntake(60, false).ml, 1800)
T.throws('waterIntake 0 抛中文', () => M.waterIntake(0), /体重/)

T.eq('waistRatio 0.457 健康', M.waistRatio(80, 175).label, '健康')
T.eq('waistRatio 0.5 需留意', M.waistRatio(87.5, 175).label, '需留意')
T.eq('waistRatio 0.6 风险偏高', M.waistRatio(105, 175).label, '风险偏高')
T.ok('waistRatio 值 = 腰/高', Math.abs(M.waistRatio(80, 175).value - 80 / 175) < 1e-12)
T.throws('waistRatio 腰围 0 抛中文', () => M.waistRatio(0, 175), /腰围和身高/)
T.throws('waistRatio 身高 0 抛中文', () => M.waistRatio(80, 0), /腰围和身高/)

/* ---------- 7. UI 契约 ---------- */
T.ok('tone 合法', ['ok', 'warn', 'bad'].includes(M.bmi(70, 175).tone))
T.ok('数值字段无 NaN', [M.bmi(70, 175).value, M.bmi(70, 175).minNormal, M.bmr(70, 175, 30, 'male'), M.bodyFat(22, 30, 'male')].every(Number.isFinite))
T.ok('标签都是中文', /[\u4e00-\u9fa5]/.test(M.bmi(70, 175).label) && /[\u4e00-\u9fa5]/.test(M.bodyFatLabel(20, 'male')))

T.done()
