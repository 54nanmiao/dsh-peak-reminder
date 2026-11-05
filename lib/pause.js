// lib/pause.js —— 峰时暂停/续跑：把「正在跑的任务」停下来，谷时再接着跑。
// 关键事实（读 DSH 宿主源码得到，0.3.0 的依据）：
//   * 宿主服务 `agents` 暴露 AgentRegistry：get(id) / list()，每个 agent 有 .status（'running' | 'idle'）与 .session
//   * 宿主服务 `sessionController` 有 cancel({sessionId})：只取消当前这一轮，且 keepInbox —— 待办不丢
//     （packages/api/session-controller：agent.cancel({ kind: 'user' }, { keepInbox: true })）
//   * 同一个服务有 prompt({requestId, sessionId, mode, content})：可以直接给会话补一条用户消息，让它接着干
// 所以「暂停」= cancel，「续跑」= prompt 一条『继续』；不需要杀进程，也不丢上下文。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const DEFAULT_RESUME_TEXT = '继续刚才的任务，从断点接着做，不用复述已经做完的部分。'

export function pauseFile() {
  return join(homedir(), '.dsh', 'peak-reminder-paused.json')
}

/** 读暂停清单；坏 JSON 当空表，绝不影响插件启动 */
export function readPaused() {
  try {
    const parsed = JSON.parse(readFileSync(pauseFile(), 'utf8'))
    const list = Array.isArray(parsed?.paused) ? parsed.paused : []
    return list.filter((x) => x && typeof x.sessionId === 'string')
  } catch {
    return []
  }
}

function writePaused(list) {
  const file = pauseFile()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ paused: list }, null, 2) + '\n', 'utf8')
  return list
}

function agentTitle(agent) {
  const session = agent?.session
  const title = session && typeof session.title === 'string' ? session.title.trim() : ''
  return title || (session && session.id) || agent.id
}

/** 列出此刻在跑的会话（只读） */
export function listRunning(ctx) {
  const agents = ctx.get('agents')
  if (!agents || typeof agents.list !== 'function') return { ok: false, reason: 'no-agents-service', tasks: [] }
  const tasks = agents
    .list()
    .filter((a) => a && a.status === 'running')
    .map((a) => ({ sessionId: a.id, title: agentTitle(a), status: a.status }))
  return { ok: true, tasks }
}

/** 暂停一个会话：取消当前轮，保留待办，并记进清单 */
export function pauseSession(ctx, sessionId, extra = {}) {
  const controller = ctx.get('sessionController')
  if (!controller || typeof controller.cancel !== 'function') return { ok: false, reason: 'no-session-controller' }
  const agents = ctx.get('agents')
  const agent = agents && typeof agents.get === 'function' ? agents.get(sessionId) : undefined
  if (!agent) return { ok: false, reason: 'session-not-running' }
  const title = agentTitle(agent)
  // 先记账再取消：cancel 之后 agent 可能立刻变 idle，标题就不好取了
  const record = { sessionId, title, pausedAt: Date.now(), ...extra }
  const list = readPaused().filter((x) => x.sessionId !== sessionId)
  list.push(record)
  writePaused(list)
  try {
    controller.cancel({ sessionId })
  } catch (e) {
    // 取消失败就把记录撤回，别留下一个假的「已暂停」
    writePaused(readPaused().filter((x) => x.sessionId !== sessionId))
    return { ok: false, reason: 'cancel-failed', detail: String(e?.message ?? e) }
  }
  return { ok: true, paused: record }
}

let resumeSeq = 0
/** 续跑一个会话：补一条用户消息，让它从断点继续 */
export async function resumeSession(ctx, sessionId, text = DEFAULT_RESUME_TEXT) {
  const controller = ctx.get('sessionController')
  if (!controller || typeof controller.prompt !== 'function') return { ok: false, reason: 'no-session-controller' }
  resumeSeq += 1
  const requestId = 'dspr-resume-' + Date.now().toString(36) + '-' + resumeSeq
  try {
    // signal 是必需的：宿主 prompt(request, signal) 第一行就 signal.throwIfAborted()
    const signal = new AbortController().signal
    await controller.prompt({
      requestId,
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text }],
    }, signal)
  } catch (e) {
    return { ok: false, reason: 'prompt-failed', detail: String(e?.message ?? e) }
  }
  writePaused(readPaused().filter((x) => x.sessionId !== sessionId))
  return { ok: true }
}

/** 谷时批量续跑；返回实际处理掉的会话数 */
export async function resumeAll(ctx, text) {
  const list = readPaused()
  const done = []
  const failed = []
  for (const item of list) {
    const r = await resumeSession(ctx, item.sessionId, text)
    if (r.ok) done.push(item.sessionId)
    else failed.push({ sessionId: item.sessionId, reason: r.reason, detail: r.detail })
  }
  return { done, failed }
}
