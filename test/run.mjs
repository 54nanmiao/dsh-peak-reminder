import { isPeakTime, nextPeakChangeAt, currentPeakWindow, dayKindLabel, isWeekend, isHolidayValley } from '../lib/peak.js'

const bj = (y, m, d, h = 0, mi = 0) => Math.floor(Date.UTC(y, m - 1, d, h, mi, 0) / 1000) - 8 * 3600
const eq = (a, b, msg) => { if (a !== b) throw new Error(`FAIL ${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`) }
let n = 0
const t = (msg, fn) => { fn(); n++ }

t('friday boundaries', () => {
  eq(isPeakTime(bj(2026, 10, 23, 8, 59)), false, '8:59')
  eq(isPeakTime(bj(2026, 10, 23, 9, 0)), true, '9:00')
  eq(isPeakTime(bj(2026, 10, 23, 11, 59)), true, '11:59')
  eq(isPeakTime(bj(2026, 10, 23, 12, 0)), false, '12:00')
  eq(isPeakTime(bj(2026, 10, 23, 13, 59)), false, '13:59')
  eq(isPeakTime(bj(2026, 10, 23, 14, 0)), true, '14:00')
  eq(isPeakTime(bj(2026, 10, 23, 17, 59)), true, '17:59')
  eq(isPeakTime(bj(2026, 10, 23, 18, 0)), false, '18:00')
  eq(isPeakTime(bj(2026, 10, 23, 23, 0)), false, '23:00')
})

t('weekend', () => {
  eq(isWeekend(bj(2026, 10, 24, 10, 0)), true, 'sat isWeekend')
  eq(isPeakTime(bj(2026, 10, 24, 10, 0)), false, 'sat peak')
  eq(isPeakTime(bj(2026, 10, 25, 15, 0)), false, 'sun peak')
  eq(isPeakTime(bj(2026, 9, 20, 10, 0)), false, 'makeup sunday 9/20')
})

t('holiday', () => {
  eq(isHolidayValley(bj(2026, 10, 1, 10, 0)), true, '10/1 holiday')
  eq(isPeakTime(bj(2026, 10, 1, 10, 0)), false, '10/1 peak')
  eq(isPeakTime(bj(2026, 10, 7, 15, 0)), false, '10/7 peak')
})

t('window text', () => {
  eq(currentPeakWindow(bj(2026, 10, 23, 10, 0)), '09:00–12:00', 'am')
  eq(currentPeakWindow(bj(2026, 10, 23, 15, 0)), '14:00–18:00', 'pm')
  eq(currentPeakWindow(bj(2026, 10, 23, 13, 0)), null, 'lunch')
})

t('next change', () => {
  eq(nextPeakChangeAt(bj(2026, 10, 23, 10, 0)), bj(2026, 10, 23, 12, 0), '10->12')
  eq(nextPeakChangeAt(bj(2026, 10, 23, 12, 30)), bj(2026, 10, 23, 14, 0), '12:30->14')
  eq(nextPeakChangeAt(bj(2026, 10, 23, 18, 30)), bj(2026, 10, 26, 9, 0), '18:30->mon9')
})

t('switch flips', () => {
  for (const [y, m, d] of [[2026, 10, 23], [2026, 10, 24], [2026, 10, 26], [2026, 10, 1]]) {
    for (const h of [0, 9, 12, 14, 18, 23]) {
      const x = bj(y, m, d, h, 0)
      const nx = nextPeakChangeAt(x)
      if (nx !== null && isPeakTime(x) === isPeakTime(nx)) throw new Error(`FAIL flip ${y}-${m}-${d} ${h}:00`)
    }
  }
})

t('dayKind', () => {
  eq(dayKindLabel(bj(2026, 10, 23, 10, 0)), '工作日', 'wd')
  eq(dayKindLabel(bj(2026, 10, 24, 10, 0)), '周末', 'we')
  eq(dayKindLabel(bj(2026, 10, 1, 10, 0)), '法定节假日', 'hol')
})

const now = Math.floor(Date.now() / 1000)
const fmt = (s) => new Date((s + 8 * 3600) * 1000).toISOString().replace('Z', '+08')
console.log(`OK ${n} groups`)
console.log('now(bj)', fmt(now), 'isPeak=', isPeakTime(now), 'window=', currentPeakWindow(now), 'dayKind=', dayKindLabel(now), 'nextChange=', fmt(nextPeakChangeAt(now)))
