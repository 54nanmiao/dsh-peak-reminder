// lib/index.js —— 宿主半边：注册 /plugins/dsh-peak-reminder/state 与 /config
// 客户端半边只做界面与计时，峰谷判定一律问宿主（单一事实源，客户端不重算节假日）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  BUILTIN_HOLIDAYS, DEFAULT_RULES, PRICES,
  currentPeakWindow, dayKindLabel, isPeakTime, makeRules, nextPeakChangeAt, normalizeHolidays, normalizePeakHours, rateMultiplier,
} from './peak.js'
import { weekSummary } from './ledger.js'

export const name = 'dsh-peak-reminder'

const ROUTE = '/plugins/dsh-peak-reminder'

export const DEFAULTS = {
  enabled: true,          // 总开关
  intervalMinutes: 5,     // 峰时每隔多少分钟提醒一次
  notifyOnSwitch: true,   // 峰↔谷 切换那一刻额外提醒一条
  showSidebar: true,      // 侧边栏是否常驻那一行状态
  showLedger: true,       // 侧边栏是否显示本周峰时花费（0.2.0）
  peakHours: null,        // 覆盖峰段，例如 [[9,12],[14,18],[20,22]]；null = 用内置表
  holidays: null,         // 额外/覆盖的节假日日期；与 ~/.dsh/peak-reminder-holidays.json 合并
}

function configFile() {
  return join(homedir(), '.dsh', 'peak-reminder.json')
}

/** 节假日表的外部文件：不想改代码的人可以只写日期数组 */
function holidaysFile() {
  return join(homedir(), '.dsh', 'peak-reminder-holidays.json')
}

function readHolidaysFile() {
  try {
    return normalizeHolidays(JSON.parse(readFileSync(holidaysFile(), 'utf8'))) || {}
  } catch {
    return {} // 不存在/坏 JSON：用内置表，不影响启动
  }
}

function clampInterval(v) {
  const n = Number(v)
  if (!isFinite(n) || n <= 0) return DEFAULTS.intervalMinutes
  return Math.min(120, Math.max(1, Math.round(n)))
}

/** 磁盘配置优先级：默认值 < cordis patch 里的 config < 文件（UI 保存写文件层） */
function loadConfig(patchConfig) {
  let file = {}
  try {
    const raw = readFileSync(configFile(), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') file = parsed
  } catch { /* 文件不存在/坏 JSON：全部走默认值，不影响插件启动 */ }
  const merged = { ...DEFAULTS }
  for (const src of [patchConfig, file]) {
    if (!src || typeof src !== 'object') continue
    if (typeof src.enabled === 'boolean') merged.enabled = src.enabled
    if (typeof src.notifyOnSwitch === 'boolean') merged.notifyOnSwitch = src.notifyOnSwitch
    if (typeof src.showSidebar === 'boolean') merged.showSidebar = src.showSidebar
    if (src.intervalMinutes !== undefined) merged.intervalMinutes = clampInterval(src.intervalMinutes)
    if (typeof src.showLedger === 'boolean') merged.showLedger = src.showLedger
    if (src.peakHours !== undefined) merged.peakHours = normalizePeakHours(src.peakHours) || merged.peakHours
    if (src.holidays !== undefined) merged.holidays = normalizeHolidays(src.holidays) || merged.holidays
  }
  return merged
}

/** 配置 + 外部节假日文件 → 运行期规则（只算一次传递给所有判定函数） */
function rulesFor(config) {
  return makeRules({
    peakHours: config.peakHours,
    holidays: { ...readHolidaysFile(), ...(normalizeHolidays(config.holidays) || {}) },
  })
}

function saveConfig(patchConfig, patch) {
  const next = loadConfig(patchConfig)
  if (typeof patch?.enabled === 'boolean') next.enabled = patch.enabled
  if (typeof patch?.notifyOnSwitch === 'boolean') next.notifyOnSwitch = patch.notifyOnSwitch
  if (typeof patch?.showSidebar === 'boolean') next.showSidebar = patch.showSidebar
  if (typeof patch?.showLedger === 'boolean') next.showLedger = patch.showLedger
  if (patch?.peakHours !== undefined) next.peakHours = normalizePeakHours(patch.peakHours) || next.peakHours
  if (patch?.holidays !== undefined) next.holidays = normalizeHolidays(patch.holidays) || next.holidays
  if (patch?.intervalMinutes !== undefined) next.intervalMinutes = clampInterval(patch.intervalMinutes)
  const file = configFile()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(next, null, 2) + '\n', 'utf8')
  return next
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

function readBody(req, cap = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > cap) { reject(new Error('body too large')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** 当前状态快照：客户端拿它渲染侧边栏行、算倒计时、决定要不要提醒 */
function statePayload(patchConfig) {
  const nowSec = Math.floor(Date.now() / 1000)
  const config = loadConfig(patchConfig)
  const rules = rulesFor(config)
  const isPeak = isPeakTime(nowSec, rules)
  return {
    ok: true,
    now: nowSec,
    isPeak,
    peakWindow: currentPeakWindow(nowSec, rules),
    nextChangeAt: nextPeakChangeAt(nowSec, rules),
    dayKind: dayKindLabel(nowSec, rules),
    rateMultiplier: rateMultiplier(nowSec, rules), // 峰时 2、谷时 1（相对谷时价）
    prices: PRICES,                          // 官方价目表，USD / 1M tokens
    config,
    // 本周账：只在开启时算，避免每 30 秒读一次 1.4k 条事件
    week: config.showLedger ? weekSummary(nowSec, rules) : null,
    rules: {
      peakHours: rules.peakHours,
      holidays: Object.keys(rules.holidays).sort(),
      custom: Boolean(config.peakHours || config.holidays),
      builtinHolidays: Object.keys(BUILTIN_HOLIDAYS).length,
      defaultPeakHours: DEFAULT_RULES.peakHours,
    },
  }
}

export function apply(ctx, patchConfig = {}) {
  ctx.inject(['webServer'], (hostCtx) => {
    const host = hostCtx
    host.effect(() => {
      const registrations = [
        // 状态口（客户端每 30 秒轮询 + 启动时探测"插件是否真的加载了"）
        host.webServer.register({
          kind: 'exact',
          path: ROUTE + '/state',
          handler: (req, res) => {
            if (req.method !== 'GET') {
              res.writeHead(405, { allow: 'GET' })
              return res.end()
            }
            return sendJson(res, 200, statePayload(patchConfig))
          },
        }),
        // 配置口：GET 读、POST 写（写 ~/.dsh/peak-reminder.json）
        host.webServer.register({
          kind: 'exact',
          path: ROUTE + '/config',
          handler: async (req, res) => {
            if (req.method === 'GET') {
              return sendJson(res, 200, { ok: true, config: loadConfig(patchConfig), file: configFile() })
            }
            if (req.method !== 'POST') {
              res.writeHead(405, { allow: 'GET, POST' })
              return res.end()
            }
            let raw
            try {
              raw = JSON.parse((await readBody(req)) || '{}')
            } catch (e) {
              return sendJson(res, 400, { ok: false, reason: 'bad-json', detail: String(e?.message ?? e) })
            }
            try {
              const config = saveConfig(patchConfig, raw)
              return sendJson(res, 200, { ok: true, config, file: configFile() })
            } catch (e) {
              return sendJson(res, 500, {
                ok: false, reason: 'config-write-failed', detail: String(e?.message ?? e),
              })
            }
          },
        }),
      ]
      return () => { registrations.forEach((dispose) => { try { dispose() } catch { /* 已卸载 */ } }) }
    }, 'dsh-peak-reminder: routes')
  })
}
