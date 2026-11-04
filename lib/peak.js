// lib/peak.js —— DeepSeek 峰谷时段判定（纯函数，无依赖，宿主/测试共用）
//
// 规则与「dsh-whale-widget」内置的那份同源（本机已验证实现：
// C:\Users\yang2\.dsh\profiles\desktop\node_modules\dsh-whale-widget\lib\index.js:557-676）：
//   高峰 = 北京时间 周一至周五（不含中国法定节假日）09:00–12:00、14:00–18:00
//   其余全部谷时 = 08:30 前后之外的空档 + 周末 + 法定节假日（含调休放假的工作日）
//   时间线：2026-08-17 峰谷定价实施 → 2026-08-23 00:00 起周末全天谷价
//           → 2026-09-19 明确「法定节假日全天 + 调休上班的周末」按空闲时段计
//
// 0.2.0 起峰段与节假日都可由配置覆盖（见 makeRules）；内置表只当默认值。
// ⚠️ 每年 11 月国务院发布次年放假安排后，必须往内置表里补下一年日期，或写进
//    ~/.dsh/peak-reminder-holidays.json；没补的话，那一年会被按「普通工作日」判峰时
//    （偏保守：多提醒，不会漏提醒）。

// [开始小时, 结束小时)，北京时间整点边界。0.2.0 起可被 config.peakHours 覆盖。
export const PEAK_HOURS = [
  [9, 12],
  [14, 18],
]

// 北京时间 2026-08-23 00:00：此后的周末全天按谷价
export const WEEKEND_VALLEY_FROM_SEC = Math.floor(Date.UTC(2026, 7, 22, 16, 0, 0) / 1000)
// 北京时间 2026-09-19 00:00：此后的法定节假日全天按谷价
export const HOLIDAY_VALLEY_FROM_SEC = Math.floor(Date.UTC(2026, 8, 18, 16, 0, 0) / 1000)

// 只列「放假」的日期（调休上班日都落在周末，按周末谷价规则已覆盖）
export const HOLIDAY_VALLEY = {
  '2026-01-01': 1, '2026-01-02': 1, '2026-01-03': 1, // 元旦
  '2026-02-15': 1, '2026-02-16': 1, '2026-02-17': 1, '2026-02-18': 1, '2026-02-19': 1, // 春节
  '2026-02-20': 1, '2026-02-21': 1, '2026-02-22': 1, '2026-02-23': 1,
  '2026-04-04': 1, '2026-04-05': 1, '2026-04-06': 1, // 清明
  '2026-05-01': 1, '2026-05-02': 1, '2026-05-03': 1, '2026-05-04': 1, '2026-05-05': 1, // 劳动节
  '2026-06-19': 1, '2026-06-20': 1, '2026-06-21': 1, // 端午
  '2026-09-25': 1, '2026-09-26': 1, '2026-09-27': 1, // 中秋
  '2026-10-01': 1, '2026-10-02': 1, '2026-10-03': 1, '2026-10-04': 1, // 国庆
  '2026-10-05': 1, '2026-10-06': 1, '2026-10-07': 1,
}

// 2027 年：媒体转载的放假安排（光明网/人民日报，2026-11-01/02），未核到国务院通知原文。
// 劳动节（4/30–5/4）原文写「预计」且只调休 1 天，故意留空：加错日期会漏提醒，比多提醒危险。
export const HOLIDAY_VALLEY_2027 = {
  '2027-01-01': 1, '2027-01-02': 1, '2027-01-03': 1, // 元旦
  '2027-02-05': 1, '2027-02-06': 1, '2027-02-07': 1, '2027-02-08': 1, '2027-02-09': 1, // 春节
  '2027-02-10': 1, '2027-02-11': 1, '2027-02-12': 1, '2027-02-13': 1,
  '2027-04-03': 1, '2027-04-04': 1, '2027-04-05': 1, // 清明
  '2027-06-09': 1, // 端午
  '2027-09-15': 1, // 中秋
  '2027-10-01': 1, '2027-10-02': 1, '2027-10-03': 1, '2027-10-04': 1, // 国庆
  '2027-10-05': 1, '2027-10-06': 1, '2027-10-07': 1,
}

export const BUILTIN_HOLIDAYS = { ...HOLIDAY_VALLEY, ...HOLIDAY_VALLEY_2027 }

export const DEFAULT_RULES = Object.freeze({
  peakHours: PEAK_HOURS.map((w) => w.slice()),
  holidays: Object.freeze({ ...BUILTIN_HOLIDAYS }),
})

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 校验并规整峰段配置；不合法返回 null（调用方回落到默认值，不抛错） */
export function normalizePeakHours(input) {
  if (!Array.isArray(input) || input.length === 0) return null
  const out = []
  for (const w of input) {
    if (!Array.isArray(w) || w.length !== 2) return null
    const start = Number(w[0])
    const end = Number(w[1])
    if (!Number.isInteger(start) || !Number.isInteger(end)) return null
    if (start < 0 || end > 24 || start >= end) return null
    out.push([start, end])
  }
  out.sort((a, b) => a[0] - b[0])
  for (let i = 1; i < out.length; i++) if (out[i][0] < out[i - 1][1]) return null // 重叠
  return out
}

/** 节假日表：接受 ['2027-01-01', …] 或 {'2027-01-01': 1, …}；不合法返回 null */
export function normalizeHolidays(input) {
  const out = {}
  if (Array.isArray(input)) {
    for (const d of input) if (typeof d === 'string' && DATE_RE.test(d)) out[d] = 1
  } else if (input && typeof input === 'object') {
    for (const [d, v] of Object.entries(input)) if (DATE_RE.test(d) && v) out[d] = 1
  } else {
    return null
  }
  return Object.keys(out).length ? out : null
}

/** 合并出运行期规则：默认内置表 + 用户覆盖（覆盖是追加，不是替换） */
export function makeRules({ peakHours, holidays } = {}) {
  return {
    peakHours: normalizePeakHours(peakHours) || DEFAULT_RULES.peakHours,
    holidays: { ...BUILTIN_HOLIDAYS, ...(normalizeHolidays(holidays) || {}) },
  }
}

/** 把 epoch 秒平移到「北京日历」坐标系（读 UTC 字段即北京时间） */
function beijingDate(timeSec) {
  return new Date(Number(timeSec) * 1000 + 8 * 3600 * 1000)
}

export function isWeekend(timeSec) {
  const n = Number(timeSec)
  if (!isFinite(n) || n < WEEKEND_VALLEY_FROM_SEC) return false
  const dow = beijingDate(n).getUTCDay()
  return dow === 0 || dow === 6
}

export function isHolidayValley(timeSec, rules = DEFAULT_RULES) {
  const n = Number(timeSec)
  if (!isFinite(n) || n < HOLIDAY_VALLEY_FROM_SEC) return false
  try {
    return Boolean(rules.holidays[beijingDate(n).toISOString().slice(0, 10)])
  } catch {
    return false
  }
}

/** 是否处于 DeepSeek 峰时（高峰计价） */
export function isPeakTime(timeSec, rules = DEFAULT_RULES) {
  const n = Number(timeSec)
  if (!isFinite(n)) return false
  if (isWeekend(n)) return false
  if (isHolidayValley(n, rules)) return false
  const hour = beijingDate(n).getUTCHours()
  for (const [start, end] of rules.peakHours) {
    if (hour >= start && hour < end) return true
  }
  return false
}

/** 峰段边界小时（含 0 点，用于扫切换点） */
function hourEdges(rules) {
  const set = new Set([0])
  for (const [s, e] of rules.peakHours) { set.add(s); set.add(e) }
  return [...set].sort((a, b) => a - b)
}

/**
 * 下一个峰谷切换时刻（epoch 秒）。与 isPeakTime 完全同源（含周末/节假日规则）。
 * 只需扫北京时间的峰段边界；最长假期 9 天，扫 12 天留足余量。
 */
export function nextPeakChangeAt(timeSec, rules = DEFAULT_RULES) {
  const n = Number(timeSec)
  if (!isFinite(n)) return null
  const cur = isPeakTime(n, rules)
  const day0 = Math.floor((n + 8 * 3600) / 86400) * 86400 // 北京当日 00:00（+8h 平移坐标系）
  const edges = hourEdges(rules)
  for (let d = 0; d <= 12; d++) {
    for (const edge of edges) {
      const cand = day0 + d * 86400 + edge * 3600 - 8 * 3600
      if (cand <= n + 1) continue
      if (isPeakTime(cand, rules) !== cur) return cand
    }
  }
  return null
}

/** 当前所在峰时段的展示文案，例如 '09:00–12:00'；谷时返回 null */
export function currentPeakWindow(timeSec, rules = DEFAULT_RULES) {
  const n = Number(timeSec)
  if (!isPeakTime(n, rules)) return null
  const hour = beijingDate(n).getUTCHours()
  for (const [start, end] of rules.peakHours) {
    if (hour >= start && hour < end) {
      return String(start).padStart(2, '0') + ':00–' + String(end).padStart(2, '0') + ':00'
    }
  }
  return null
}

// 官方价目表（USD / 1M tokens，2026-11-01 抓自 api-docs.deepseek.com/quick_start/pricing）。
// 官方注脚原文：「Off-peak rates are half of the peak rates.」→ 谷时 = 峰时 × 0.5，是精确倍数不是估值。
export const PEAK_RATE_RATIO = 2
export const PRICES = {
  peak: {
    cacheHit: 0.006,   // 1M 输入，缓存命中
    cacheMiss: 0.3,    // 1M 输入，缓存未命中
    output: 1.2,       // 1M 输出
  },
  offPeak: {
    cacheHit: 0.003,
    cacheMiss: 0.15,
    output: 0.6,
  },
}
/** 当前时段相对谷时的价格倍数（峰时 2，谷时 1），供界面直接显示 */
export function rateMultiplier(timeSec, rules = DEFAULT_RULES) {
  return isPeakTime(timeSec, rules) ? PEAK_RATE_RATIO : 1
}

/** 今天这一天的分类，供界面解释「为什么现在是谷时」 */
export function dayKindLabel(timeSec, rules = DEFAULT_RULES) {
  if (isHolidayValley(timeSec, rules)) return '法定节假日'
  if (isWeekend(timeSec)) return '周末'
  return '工作日'
}
