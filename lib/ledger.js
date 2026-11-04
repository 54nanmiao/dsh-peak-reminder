// lib/ledger.js —— 本周「峰时到底花了多少」的一行账（0.2.0 新增）
//
// 数据源：~/.dsh/.dshw-usage.json 的 events[]（每条 { ts 毫秒, cost 元, day, model, tokens }）。
// 口径提醒：这是 DSH 自己记的逐次请求成本，按请求时间落在峰/谷，与账单页可能有几 % 差异；
// 对外一律说「估算」，不要当成官方账单。
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_RULES, isPeakTime } from './peak.js'

export function usageFile() {
  return join(homedir(), '.dsh', '.dshw-usage.json')
}

/** 本周一 00:00（北京）的 epoch 秒 */
export function weekStartSec(nowSec) {
  const n = Number(nowSec)
  const bj = new Date(n * 1000 + 8 * 3600 * 1000)
  const back = (bj.getUTCDay() + 6) % 7 // 周一=0 … 周日=6
  const midnight = Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate()) - back * 86400000
  return Math.floor((midnight - 8 * 3600 * 1000) / 1000)
}

function readEvents() {
  try {
    const parsed = JSON.parse(readFileSync(usageFile(), 'utf8'))
    return Array.isArray(parsed.events) ? parsed.events : []
  } catch {
    return null // 文件不存在/坏 JSON：调用方区分「没有数据」与「花了 0」
  }
}

const round4 = (x) => Math.round(x * 10000) / 10000

/**
 * 本周汇总。peakSpent = 峰时请求花的钱；savedIfValley = 这些请求如果全在谷时能省多少
 * （峰时价是谷时的 2 倍 → 省下 peakSpent / 2）。
 */
export function weekSummary(nowSec, rules = DEFAULT_RULES) {
  const events = readEvents()
  const since = weekStartSec(nowSec)
  if (events === null) return { ok: false, since, reason: 'no-usage-file', file: usageFile() }
  let spent = 0
  let peakSpent = 0
  let calls = 0
  let peakCalls = 0
  for (const e of events) {
    const ts = Number(e && e.ts) / 1000
    if (!isFinite(ts) || ts < since || ts > nowSec) continue
    const cost = Number(e.cost) || 0
    spent += cost
    calls += 1
    if (isPeakTime(ts, rules)) {
      peakSpent += cost
      peakCalls += 1
    }
  }
  return {
    ok: true,
    since,
    spent: round4(spent),
    peakSpent: round4(peakSpent),
    savedIfValley: round4(peakSpent / 2),
    calls,
    peakCalls,
    file: usageFile(),
  }
}
