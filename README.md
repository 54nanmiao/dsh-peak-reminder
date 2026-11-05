# dsh-peak-reminder

[![npm](https://img.shields.io/npm/v/dsh-peak-reminder)](https://www.npmjs.com/package/dsh-peak-reminder) [![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

A [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) plugin that tells you when DeepSeek is charging **peak rates** — a reminder every few minutes while peak hours are on, silence during the cheap hours. Peak costs **twice** what off-peak costs; this plugin says which side you are on and how long until it flips.

DSH 峰谷提醒插件：峰时段每隔几分钟在界面顶部提醒一次「现在是峰时」，谷时完全不打扰；侧边栏底部常驻一行显示当前峰/谷状态和下一次切换的倒计时。

- 侧边栏底部一行（`sidebar.footer.action`）：`峰时 · 32 分钟后谷` / `谷时 · 1 分钟后峰`；橙点是峰时、绿点是谷时、灰点是关掉了。悬停看完整说明，点一下立刻弹一条当前状态。
- 顶部提醒条：进入峰时先给一条「现在是峰时 —— 高峰计价」，之后每 N 分钟（默认 5）再给一条；进入谷时提示「现在是谷时 —— 空闲计价」；**谷时期间不会重复提醒**。提醒条带「知道了」和「暂停 30 分钟」。
- 设置页一节（`settings.section`）：总开关、提醒间隔、峰↔谷切换提醒、侧边栏状态行、谷时自动续跑开关，以及一份「正在跑的任务」清单（逐个「暂停」，谷时逐个或一键「继续」，0.3.0）。
- 峰时可以把正在跑的任务**停在这一轮**，队列不丢；到了谷时（或你手动点「继续」）按原任务继续跑。
- 无网络请求、无凭据，只写两个文件：`~/.dsh/peak-reminder.json`（配置）与 `~/.dsh/peak-reminder-paused.json`（暂停清单）。

## Install

```sh
# with a global dsh CLI
dsh plugin --profile <profile> add dsh-peak-reminder

# or without installing dsh globally
npx -y @deepseek-ai/dsh plugin --profile <profile> add dsh-peak-reminder
```

`--profile` is **required** and must be the profile you actually run. The desktop app's profile is usually `desktop`; the CLI/web profile is usually `web`. Installing into a profile you do not launch looks like a successful install and then nothing appears — check the directory name under `~/.dsh/profiles/` (or `%USERPROFILE%\.dsh\profiles\` on Windows) when unsure.

Published on npm as [`dsh-peak-reminder`](https://www.npmjs.com/package/dsh-peak-reminder). Git and local installs work too — `github:` is a pnpm git spec, and DSH's plugin manager hands git specs to pnpm and fetches them itself. If your build does not take git specs, clone the repo and point the profile at the checkout instead:

```sh
git clone https://github.com/54nanmiao/dsh-peak-reminder
dsh plugin --profile web add /absolute/path/to/dsh-peak-reminder
```

The plugin declares a `dsh.bundle` manifest (`cordis.patch.yml`) and ships no build step and no dependencies, so a source install needs no build approval.

Reload the Web UI after installing. The sidebar row appears at the bottom; the settings section is under Settings → the plugins area.

## Troubleshooting

**`'pnpm' is not recognized as an internal or external command`** — `dsh plugin` does not ship its own pnpm: it hands `add …` to whatever `pnpm` is on `PATH`, so the install fails at the first step on machines that only have npm (the desktop app bundles pnpm under `~/.dsh/dsh-runtimes/*/dependencies/pnpm` but does not put it on `PATH`). Fix by installing pnpm, or by prepending the bundled one for the command:

```sh
# Windows: point a shim at the pnpm the desktop app already bundles
set PATH=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin;%PATH%
npm i -g pnpm        # or just install pnpm once, anywhere on PATH
```

**It installs an older version than `npm view dsh-peak-reminder version` reports** — recent pnpm versions gate packages by release age (`minimumReleaseAge`). A version published minutes ago is skipped silently and the previous one is installed instead, so `^0.x` in your `package.json` points at the older release. Ask for the version you want explicitly:

```sh
dsh plugin --profile <profile> add dsh-peak-reminder@0.1.3
```

pnpm then prints `Added 1 entry to minimumReleaseAgeExclude …` and installs it. (Observed with pnpm 11.28.5: `add dsh-peak-reminder` picked the ~29 h-old release while `add dsh-peak-reminder@0.1.3` — published ~45 min earlier — succeeded.)

## How much it saves

Off-peak rates are **exactly half** of peak rates (DeepSeek's own wording: *"Off-peak rates are half of the peak rates."*).
Per 1M tokens, USD:

| | Off-peak | Peak |
|---|---|---|
| Input, cache hit | $0.003 | $0.006 |
| Input, cache miss | $0.15 | $0.30 |
| Output | $0.60 | $1.20 |

So 1M output tokens costs $1.20 during peak and $0.60 off-peak — a $0.60 difference for the same work.
The sidebar shows which side you are on (`峰时 2×` / `谷时 5 折`) and how long until it flips.
Since 0.2.0 it also shows a second line — **this week's spend during peak, and what it would have been off-peak** — computed from DSH's own `~/.dsh/.dshw-usage.json` (`本周峰时 ¥0.06 · 可省 ¥0.03`). That number is an estimate from per-request costs, not your bill.

## Peak-time pause and resume (0.3.0)

Peak pricing is 2× and nothing stops you from being mid-task when 09:00 hits. The tasks panel in Settings lists every session the host reports as **running**, with one button: **暂停**.

- **暂停** cancels the session's *current turn only* (`session.cancel`, which DSH implements as `agent.cancel({ kind: 'user' }, { keepInbox: true })`). Queued messages and the rest of the task stay in the inbox.
- The session id goes into `~/.dsh/peak-reminder-paused.json` **before** the cancel is attempted, and the record is rolled back if the cancel throws — a failed pause never silently loses a task.
- **继续** enqueues one prompt (`session.prompt`, `mode: 'queue'`) with `resumeText`, so the agent picks the task up again as an ordinary queued turn.
- With `autoResume` on (default), a 60-second host heartbeat checks the clock: **outside peak hours**, every paused session is resumed automatically. During peak hours it does nothing.
- The sidebar row keeps a count while anything is paused: `⏸ 2 个任务已暂停`.

Two honest limits: this only stops a session at a **turn boundary** — a tool call already in flight finishes first; and `resumeText` is an ordinary prompt, so the model continues from context rather than from a saved checkpoint.

```json
// ~/.dsh/peak-reminder.json
{ "autoResume": true, "resumeText": "继续刚才的任务，从断点接着做，不用复述已经做完的部分。" }
```

## Peak rules
Judged **only** from the host clock in Beijing time, in `lib/peak.js`:

| | |
|---|---|
| Peak (高峰计价) | Monday–Friday, `09:00–12:00` and `14:00–18:00` Beijing time |
| Valley (空闲计价) | everything else: `00:00–09:00`, `12:00–14:00`, `18:00–24:00`, all weekends, all Chinese public holidays, and weekends that are 调休 workdays |

The built-in holiday table (`BUILTIN_HOLIDAYS` in `lib/peak.js`) lists all of **2026** plus the already-published **2027** dates: New Year 1/1–1/3, Spring Festival 2/5–2/13, Qingming 4/3–4/5, Dragon Boat 6/9, Mid-Autumn 9/15, National Day 10/1–10/7.

**Labor Day 2027 (4/30–5/4) is deliberately absent.** The 2027 schedule was only available through media repeats, where that block is marked 「预计」 with a single make-up workday — and guessing a holiday date wrong can *miss* a reminder, which is worse than an extra one. Add it yourself once the State Council notice is out:

```json
// ~/.dsh/peak-reminder-holidays.json — merged on top of the built-in table
["2027-04-30", "2027-05-01", "2027-05-02", "2027-05-03", "2027-05-04"]
```

Until a future holiday is added, it is treated as an ordinary weekday: **over-reminds but never misses**.

## Configuration

Settings page writes `~/.dsh/peak-reminder.json`; you can also edit the file by hand (no restart needed, the host reads it per request):

```json
{
  "enabled": true,
  "intervalMinutes": 5,
  "notifyOnSwitch": true,
  "showSidebar": true,
  "showLedger": true,
  "autoResume": true,
  "resumeText": "继续刚才的任务，从断点接着做，不用复述已经做完的部分。",
  "peakHours": [[9, 12], [14, 18]],
  "holidays": ["2027-04-30"]
}
```

| key | default | meaning |
|---|---|---|
| `enabled` | `true` | master switch; off means no reminders and the sidebar row reads「提醒已关」 |
| `intervalMinutes` | `5` | minutes between reminders while peak (clamped to 1–120) |
| `notifyOnSwitch` | `true` | also remind once at each peak↔valley boundary |
| `showSidebar` | `true` | show the sidebar status row at all |
| `showLedger` | `true` | show the second line「本周峰时 ¥x · 可省 ¥y」 (0.2.0) |
| `peakHours` | `[[9,12],[14,18]]` | peak windows in Beijing time, `[startHour, endHour)`; invalid or overlapping input falls back to the default instead of throwing (0.2.0) |
| `autoResume` | `true` | resume paused sessions automatically once the clock leaves peak hours (0.3.0) |
| `resumeText` | see above | the prompt sent when resuming; a blank value falls back to the default (0.3.0) |
| `holidays` | `null` | extra valley dates, `["YYYY-MM-DD", …]` or `{"YYYY-MM-DD": 1}`; merged with `~/.dsh/peak-reminder-holidays.json` and the built-in table (0.2.0) |

## HTTP surface

The host half registers two routes on the DSH web server (no auth, same as other plugin routes):

```
GET  /plugins/dsh-peak-reminder/state    -> { ok, now, isPeak, peakWindow, nextChangeAt, dayKind, config, rules }
GET  /plugins/dsh-peak-reminder/config   -> { ok, config, file }
POST /plugins/dsh-peak-reminder/config   -> { ok, config, file }   body: any subset of the keys above
GET  /plugins/dsh-peak-reminder/tasks    -> { ok, tasks: [{ sessionId, title }], paused: [{ sessionId, title, at }] }
POST /plugins/dsh-peak-reminder/pause    -> { ok } | { ok:false, reason }   body: { sessionId }
POST /plugins/dsh-peak-reminder/resume   -> { ok, done, failed }             body: { sessionId } or { all: true }
```

`now` is the host's epoch seconds. The client renders from that and corrects for local clock skew, so the countdown follows the machine that actually knows the time. Peak/valley decisions are never re-derived in the browser — only the host decides, so the holiday table lives in exactly one place.

## How it works

- `lib/index.js` — host half: `apply(ctx, config)` injects `webServer`, registers the two routes, and owns config loading (`defaults < cordis patch config < ~/.dsh/peak-reminder.json`).
- `lib/client.js` — browser half: injected through `slots.register` into `sidebar.footer.action` and `settings.section`; polls `/state` every 30 s, ticks once a second for the countdown, and renders the toast with plain DOM (no dependency on any DSH component package).
- `lib/pause.js` — running-session lookup via the host `agents` service, pause/resume against the `sessionController` service, plus the `~/.dsh/peak-reminder-paused.json` ledger (0.3.0).
- `lib/peak.js` — pure functions, no dependencies: `isPeakTime`, `nextPeakChangeAt`, `currentPeakWindow`, `dayKindLabel`, `isWeekend`, `isHolidayValley`.

## Test

```sh
node test/run.mjs
```

12 groups: the 09:00/12:00/14:00/18:00 boundaries, weekends, a 调休 Sunday, National Day, the window label, `nextPeakChangeAt` across a weekend and that the state flips on every boundary it reports; custom peak hours and the holiday override; the weekly ledger against a fabricated `~/.dsh/.dshw-usage.json`; the host `/state` payload through a fake `webServer`; and the pause/resume wiring through fake `agents` + `sessionController` (including a resume that throws and must stay in the list).

---

## 中文说明

**为什么要有这个插件。** deepseek 的峰谷定价按北京时间切换：工作日 09:00–12:00、14:00–18:00 是高峰计价，其余时间（含周末、法定节假日、调休）是空闲计价。想知道「现在贵不贵」，通常得自己去查规则或者看余额面板；这个插件把状态放在侧边栏常驻一行，并在峰时按你设的间隔提醒。

**规则只写在 `lib/peak.js` 一处**，宿主判定、浏览器只负责显示。0.2.0 起不必改代码：峰段写在配置的 `peakHours`，节假日写 `~/.dsh/peak-reminder-holidays.json`，两者都与内置表合并。

**0.2.0 新增：** 侧边栏第二行显示「本周峰时 ¥x · 可省 ¥y」。数字来自 DSH 自己的 `~/.dsh/.dshw-usage.json` 逐请求成本，是估算不是账单；它对自己也诚实——作者整周只有 1 次请求落在峰时（¥0.06），所以这行更多是给白天上班的人看的。

**0.3.0 新增：峰时暂停、谷时续跑。** 设置页多了一份「正在跑的任务」清单：峰时点「暂停」只取消**当前这一轮**（宿主实现是 `agent.cancel({ kind: 'user' }, { keepInbox: true })`），队列和后续步骤都还在；到谷时（默认开着 `autoResume`，每分钟心跳检查一次）自动按 `resumeText` 继续，也可以手动点「继续」或「全部继续」。清单落在 `~/.dsh/peak-reminder-paused.json`，先写记录再发取消，取消失败会回滚记录，不会出现「清单里有、任务却没停」或反过来。两条边界要说清：它只在**回合边界**停，正在跑的工具调用会先跑完；续跑发的是普通提示，模型靠上下文接着做，不是存档回滚。

**已知边界：** 内置节假日表有 2026 全年 + 2027 已公布的 6 个假期；**2027 劳动节（4/30–5/4）故意没写**，因为当时只有媒体转载、原文标着「预计」，而加错日期会漏提醒。等国务院通知出来后，把它补进 `~/.dsh/peak-reminder-holidays.json` 即可。补之前，未来节假日按普通工作日处理（多提醒，不会漏提醒）。
**装了什么、有没有装错**：可以顺手跑 [`dsh-doctor`](https://github.com/54nanmiao/dsh-doctor)，它会查 pnpm 是否在 PATH、插件是否装了却没启用、registry 上有没有新版本。

**两条实测踩过的安装坑**（详见上面 Troubleshooting）：① `dsh plugin` 不会自己带 pnpm，它把 `add` 交给 PATH 上的 pnpm —— 只装了桌面版、没装 pnpm 的机器会报 `'pnpm' is not recognized`，把 `~\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin` 加进 PATH 即可；② pnpm 的 `minimumReleaseAge` 供应链闸门会跳过「刚发布不到一天」的版本，于是悄悄装成上一版 —— 想要最新版就显式写版本号 `add dsh-peak-reminder@0.1.3`。

**安装、配置、接口字段**见上面的英文部分，两者是同一份内容的两种语言。

## License

MIT
