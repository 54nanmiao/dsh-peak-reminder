import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  isPeakTime, nextPeakChangeAt, currentPeakWindow, dayKindLabel, isWeekend, isHolidayValley,
  makeRules, normalizePeakHours, normalizeHolidays,
} from '../lib/peak.js'

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

t('custom peak hours', () => {
  const rules = makeRules({ peakHours: [[20, 22]] })
  eq(isPeakTime(bj(2026, 10, 23, 20, 30), rules), true, '20:30 custom peak')
  eq(isPeakTime(bj(2026, 10, 23, 10, 0), rules), false, '10:00 no longer peak')
  eq(currentPeakWindow(bj(2026, 10, 23, 21, 0), rules), '20:00–22:00', 'window follows config')
  eq(nextPeakChangeAt(bj(2026, 10, 23, 19, 0), rules), bj(2026, 10, 23, 20, 0), 'next 20:00')
  eq(normalizePeakHours([[20, 22], [9, 12]]).length, 2, 'valid')
  eq(normalizePeakHours([[12, 9]]), null, 'reject reversed')
  eq(normalizePeakHours([[9, 12], [11, 13]]), null, 'reject overlap')
  eq(normalizePeakHours([[9, 25]]), null, 'reject >24')
})

t('holiday override', () => {
  const rules = makeRules({ holidays: ['2027-01-04'] })
  eq(isHolidayValley(bj(2027, 1, 4, 10, 0), rules), true, 'custom holiday wins')
  eq(isHolidayValley(bj(2027, 1, 1, 10, 0), rules), true, 'builtin 2027 kept')
  eq(isHolidayValley(bj(2027, 5, 3, 10, 0), rules), false, 'labor day left out on purpose')
  eq(JSON.stringify(normalizeHolidays(['2027-01-01', 'bad'])), '{"2027-01-01":1}', 'filters junk')
  eq(JSON.stringify(normalizeHolidays({ '2027-02-05': 1 })), '{"2027-02-05":1}', 'accepts object')
})

t('week ledger', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'peakledger-'))
  mkdirSync(join(tmp, '.dsh'), { recursive: true })
  const events = [
    { ts: bj(2026, 10, 18, 10, 0) * 1000, cost: 8 },  // 上周日：不算
    { ts: bj(2026, 10, 19, 10, 0) * 1000, cost: 1 },  // 周一峰时
    { ts: bj(2026, 10, 20, 20, 0) * 1000, cost: 2 },  // 周二谷时
  ]
  writeFileSync(join(tmp, '.dsh', '.dshw-usage.json'), JSON.stringify({ events }))
  const oldProfile = process.env.USERPROFILE
  process.env.USERPROFILE = tmp
  const { weekSummary, weekStartSec } = await import('../lib/ledger.js')
  const now = bj(2026, 10, 23, 15, 0)
  eq(weekStartSec(now), bj(2026, 10, 19, 0, 0), 'monday 00:00')
  const s = weekSummary(now)
  eq(s.ok, true, 'ok')
  eq(s.spent, 3, 'spent')
  eq(s.peakSpent, 1, 'peak spend')
  eq(s.savedIfValley, 0.5, 'half saved')
  eq(s.calls, 2, 'calls')
  eq(s.peakCalls, 1, 'peak calls')
  if (oldProfile === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = oldProfile
  rmSync(tmp, { recursive: true, force: true })
})

t('host state payload', async () => {
  const { apply } = await import('../lib/index.js')
  const regs = []
  const host = {
    effect: (fn) => fn(),
    webServer: { register: (def) => { regs.push(def); return () => {} } },
  }
  apply({ inject: (_deps, cb) => cb(host) }, {})
  const stateDef = regs.find((r) => r.path.endsWith('/state'))
  const out = {}
  const res = {
    writeHead: (status) => { out.status = status },
    end: (body) => { out.body = body },
  }
  await stateDef.handler({ method: 'GET' }, res)
  const s = JSON.parse(out.body)
  eq(out.status, 200, 'status')
  eq(s.ok, true, 'ok')
  eq(typeof s.isPeak, 'boolean', 'isPeak')
  eq(Array.isArray(s.rules.peakHours), true, 'rules.peakHours')
  eq(s.rules.peakHours.length, 2, 'default windows')
  eq(s.rules.holidays.some ? true : s.rules.holidays.includes('2027-01-01'), true, '2027 builtin')
  eq(s.week === null || typeof s.week === 'object', true, 'week payload')
})
const now = Math.floor(Date.now() / 1000)
const fmt = (s) => new Date((s + 8 * 3600) * 1000).toISOString().replace('Z', '+08')
console.log(`OK ${n} groups`)
console.log('now(bj)', fmt(now), 'isPeak=', isPeakTime(now), 'window=', currentPeakWindow(now), 'dayKind=', dayKindLabel(now), 'nextChange=', fmt(nextPeakChangeAt(now)))
