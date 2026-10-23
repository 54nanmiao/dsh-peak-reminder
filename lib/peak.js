// lib/peak.js —— DeepSeek 峰谷时段判定（纯函数，无依赖，宿主/测试共用）
//
// 规则与「dsh-whale-widget」内置的那份同源（本机已验证实现：
// C:\Users\yang2\.dsh\profiles\desktop\node_modules\dsh-whale-widget\lib\index.js:557-676）：
//   高峰 = 北京时间 周一至周五（不含中国法定节假日）09:00–12:00、14:00–18:00
//   其余全部谷时 = 08:30 前后之外的空档 + 周末 + 法定节假日（含调休放假的工作日）
//   时间线：2026-08-17 峰谷定价实施 → 2026-08-23 00:00 起周末全天谷价
//           → 2026-09-19 明确「法定节假日全天 + 调休上班的周末」按空闲时段计
//
// ⚠️ 每年 11 月国务院发布次年放假安排后，必须往 HOLIDAY_VALLEY 里补下一年日期；
//    没补的话，那一年会被按「普通工作日」判峰时（偏保守：多提醒，不会漏提醒）。

// [开始小时, 结束小时)，北京时间整点边界
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

export const HOLIDAY_VALLEY_LIST = Object.keys(HOLIDAY_VALLEY).sort()

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

export function isHolidayValley(timeSec) {
  const n = Number(timeSec)
  if (!isFinite(n) || n < HOLIDAY_VALLEY_FROM_SEC) return false
  try {
    return Boolean(HOLIDAY_VALLEY[beijingDate(n).toISOString().slice(0, 10)])
  } catch {
    return false
  }
}

/** 是否处于 DeepSeek 峰时（高峰计价） */
export function isPeakTime(timeSec) {
  const n = Number(timeSec)
  if (!isFinite(n)) return false
  if (isWeekend(n)) return false
  if (isHolidayValley(n)) return false
  const hour = beijingDate(n).getUTCHours()
  for (const [start, end] of PEAK_HOURS) {
    if (hour >= start && hour < end) return true
  }
  return false
}

/**
 * 下一个峰谷切换时刻（epoch 秒）。与 isPeakTime 完全同源（含周末/节假日规则）。
 * 只需扫北京时间的整点边界 0/9/12/14/18；最长假期 9 天，扫 12 天留足余量。
 */
export function nextPeakChangeAt(timeSec) {
  const n = Number(timeSec)
  if (!isFinite(n)) return null
  const cur = isPeakTime(n)
  const day0 = Math.floor((n + 8 * 3600) / 86400) * 86400 // 北京当日 00:00（+8h 平移坐标系）
  for (let d = 0; d <= 12; d++) {
    for (const edge of [0, 9, 12, 14, 18]) {
      const cand = day0 + d * 86400 + edge * 3600 - 8 * 3600
      if (cand <= n + 1) continue
      if (isPeakTime(cand) !== cur) return cand
    }
  }
  return null
}

/** 当前所在峰时段的展示文案，例如 '09:00–12:00'；谷时返回 null */
export function currentPeakWindow(timeSec) {
  const n = Number(timeSec)
  if (!isPeakTime(n)) return null
  const hour = beijingDate(n).getUTCHours()
  for (const [start, end] of PEAK_HOURS) {
    if (hour >= start && hour < end) {
      return String(start).padStart(2, '0') + ':00–' + String(end).padStart(2, '0') + ':00'
    }
  }
  return null
}

/** 今天这一天的分类，供界面解释「为什么现在是谷时」 */
export function dayKindLabel(timeSec) {
  if (isHolidayValley(timeSec)) return '法定节假日'
  if (isWeekend(timeSec)) return '周末'
  return '工作日'
}
