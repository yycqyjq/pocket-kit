/**
 * 身体数据计算
 * 分级采用中国成人标准（WS/T 428-2013）
 */

export function bmi(weightKg, heightCm) {
  const w = Number(weightKg)
  const h = Number(heightCm) / 100
  if (!(w > 0) || !(h > 0)) throw new Error('请输入有效的身高和体重')
  const value = w / (h * h)
  let label
  let tone
  if (value < 18.5) {
    label = '偏瘦'
    tone = 'warn'
  } else if (value < 24) {
    label = '正常'
    tone = 'ok'
  } else if (value < 28) {
    label = '超重'
    tone = 'warn'
  } else {
    label = '肥胖'
    tone = 'bad'
  }
  const minNormal = 18.5 * h * h
  const maxNormal = 23.9 * h * h
  return {
    value,
    label,
    tone,
    minNormal,
    maxNormal,
    toNormal:
      value < 18.5 ? minNormal - w : value >= 24 ? w - maxNormal : 0,
  }
}

/** 基础代谢率 Mifflin-St Jeor */
export function bmr(weightKg, heightCm, age, gender) {
  const w = Number(weightKg)
  const h = Number(heightCm)
  const a = Number(age)
  if (!(w > 0) || !(h > 0) || !(a > 0)) throw new Error('请输入有效的身体数据')
  return 10 * w + 6.25 * h - 5 * a + (gender === 'male' ? 5 : -161)
}

export const ACTIVITY_LEVELS = [
  { key: 'sedentary', name: '久坐', desc: '几乎不运动', factor: 1.2 },
  { key: 'light', name: '轻度', desc: '每周 1-3 次', factor: 1.375 },
  { key: 'moderate', name: '中度', desc: '每周 3-5 次', factor: 1.55 },
  { key: 'active', name: '高度', desc: '每周 6-7 次', factor: 1.725 },
  { key: 'athlete', name: '专业', desc: '每日高强度', factor: 1.9 },
]

export function tdee(base, levelKey) {
  const lv = ACTIVITY_LEVELS.find((l) => l.key === levelKey) || ACTIVITY_LEVELS[0]
  return { value: base * lv.factor, level: lv }
}

/** 体脂率（Deurenberg 公式），误差约 ±4% */
export function bodyFat(bmiValue, age, gender) {
  const a = Number(age)
  if (!(bmiValue > 0) || !(a > 0)) throw new Error('请输入有效的年龄与身体数据')
  const s = gender === 'male' ? 1 : 0
  return 1.2 * bmiValue + 0.23 * a - 10.8 * s - 5.4
}

export function bodyFatLabel(percent, gender) {
  const p = Number(percent)
  const male = gender === 'male'
  const scale = male
    ? [
        [6, '必需脂肪'],
        [14, '运动员'],
        [18, '健康'],
        [25, '偏高'],
        [Infinity, '肥胖'],
      ]
    : [
        [14, '必需脂肪'],
        [21, '运动员'],
        [25, '健康'],
        [32, '偏高'],
        [Infinity, '肥胖'],
      ]
  for (const [limit, label] of scale) {
    if (p < limit) return label
  }
  return '肥胖'
}

/** 理想体重范围（BMI 18.5-23.9） */
export function idealWeight(heightCm) {
  const h = Number(heightCm) / 100
  if (!(h > 0)) throw new Error('请输入有效的身高')
  return { min: 18.5 * h * h, max: 23.9 * h * h }
}

/** 每日饮水量（ml），按体重 30-35 ml/kg */
export function waterIntake(weightKg, active) {
  const w = Number(weightKg)
  if (!(w > 0)) throw new Error('请输入有效的体重')
  const perKg = active ? 35 : 30
  return { ml: w * perKg, cups: Math.round((w * perKg) / 250) }
}

/** 腰高比 */
export function waistRatio(waistCm, heightCm) {
  const w = Number(waistCm)
  const h = Number(heightCm)
  if (!(w > 0) || !(h > 0)) throw new Error('请输入有效的腰围和身高')
  const r = w / h
  let label = '健康'
  if (r >= 0.5 && r < 0.6) label = '需留意'
  else if (r >= 0.6) label = '风险偏高'
  return { value: r, label }
}
