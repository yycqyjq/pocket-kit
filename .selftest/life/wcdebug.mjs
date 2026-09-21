import { useUtils } from '../harness.mjs'
const W = await useUtils('worldclock')
const mt = W.meetingSlots({ a: 'Asia/Shanghai', b: 'Asia/Tokyo', date: '2024-06-03', hours: 24 })
console.log(JSON.stringify(mt, null, 1).slice(0, 1200))
for (let i = 0; i < 4; i++) {
  const start = W.instantFromWall('Asia/Shanghai', { year: 2024, month: 6, day: 3, hour: 9, minute: 0 }).ms
  const ms = start + i * 3600000
  const a = W.zoneRow(ms, 'Asia/Shanghai')
  const b = W.zoneRow(ms, 'Asia/Tokyo', { baseDay: a.dayEpoch })
  console.log(i, new Date(ms).toISOString(), a.hm, a.hour, b.hm, b.hour, a.isWeekend, b.isWeekend, a.date, b.date)
}
console.log('workStart/end', W.meetingSlots({ a: 'Asia/Shanghai', b: 'Asia/Tokyo', date: '2024-06-03', hours: 24 }).workStart, W.meetingSlots({}).workEnd)
