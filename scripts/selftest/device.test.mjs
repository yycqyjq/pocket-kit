/**
 * device.js 纯格式化函数自测（node 直接跑，不碰 uni / plus）
 */
import { useUtils, makeTest } from './harness.mjs'

const D = await useUtils('device')
const T = makeTest('device.js 纯函数')

T.eq('fmtGB 12GiB', D.fmtGB(12 * 1073741824), '12 GB')
T.eq('fmtGB 7.25GiB', D.fmtGB(7.25 * 1073741824), '7.25 GB')
T.eq('fmtGB 180.5GiB', D.fmtGB(180.5 * 1073741824), '180.5 GB')
T.eq('fmtGB 0', D.fmtGB(0), '')
T.eq('fmtGB 负数', D.fmtGB(-5), '')

T.eq('fmtTemp 312', D.fmtTemp(312), '31.2 °C')
T.eq('fmtTemp 0', D.fmtTemp(0), '0.0 °C')
T.eq('fmtTemp 无效', D.fmtTemp(-1000), '')

T.eq('fmtVoltage 3900000', D.fmtVoltage(3900000), '3.90 V')
T.eq('fmtVoltage -1', D.fmtVoltage(-1), '')

T.eq('fmtKHz 1804800', D.fmtKHz(1804800), '1805 MHz')
T.eq('fmtKHz 2500000', D.fmtKHz(2500000), '2500 MHz')
T.eq('fmtKHz 0', D.fmtKHz(0), '')

T.eq('fmtUptime 1天1小时1分', D.fmtUptime((86400 + 3600 + 60) * 1000), '1 天 1 小时 1 分')
T.eq('fmtUptime 59分', D.fmtUptime(59 * 60 * 1000), '59 分')

T.eq('屏幕尺寸估算', Number(D.screenDiagonalIn(1440, 3200, 403, 403)), 8.7)
T.eq('屏幕尺寸 无效', D.screenDiagonalIn(0, 0, 0, 0), '')

T.eq('电量 87/100', D.batteryPercent(87, 100), 87)
T.eq('电量 50/100', D.batteryPercent(50, 100), 50)
T.eq('电量 scale=0', D.batteryPercent(5, 0), '')
T.eq('电量 越界钳制', D.batteryPercent(120, 100), 100)

T.done()
