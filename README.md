# dsh-peak-reminder

[![npm](https://img.shields.io/npm/v/dsh-peak-reminder)](https://www.npmjs.com/package/dsh-peak-reminder) [![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

A [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) plugin that tells you when DeepSeek is charging **peak rates** — a reminder every few minutes while peak hours are on, silence during the cheap hours.

DSH 峰谷提醒插件：峰时段每隔几分钟在界面顶部提醒一次「现在是峰时」，谷时完全不打扰；侧边栏底部常驻一行显示当前峰/谷状态和下一次切换的倒计时。

- 侧边栏底部一行（`sidebar.footer.action`）：`峰时 · 32 分钟后谷` / `谷时 · 1 分钟后峰`；橙点是峰时、绿点是谷时、灰点是关掉了。悬停看完整说明，点一下立刻弹一条当前状态。
- 顶部提醒条：进入峰时先给一条「现在是峰时 —— 高峰计价」，之后每 N 分钟（默认 5）再给一条；进入谷时提示「现在是谷时 —— 空闲计价」；**谷时期间不会重复提醒**。提醒条带「知道了」和「暂停 30 分钟」。
- 设置页一节（`settings.section`）：总开关、提醒间隔、峰↔谷切换提醒、侧边栏状态行。
- 无网络请求、无凭据，只写一个配置文件 `~/.dsh/peak-reminder.json`。

## Install

```sh
dsh plugin --profile web add dsh-peak-reminder
```

Published on npm as [`dsh-peak-reminder`](https://www.npmjs.com/package/dsh-peak-reminder). Git and local installs work too — `github:` is a pnpm git spec, and DSH's plugin manager hands git specs to pnpm and fetches them itself. If your build does not take git specs, clone the repo and point the profile at the checkout instead:

```sh
git clone https://github.com/54nanmiao/dsh-peak-reminder
dsh plugin --profile web add /absolute/path/to/dsh-peak-reminder
```

The plugin declares a `dsh.bundle` manifest (`cordis.patch.yml`) and ships no build step and no dependencies, so a source install needs no build approval.

Reload the Web UI after installing. The sidebar row appears at the bottom; the settings section is under Settings → the plugins area.

## Peak rules

Judged **only** from the host clock in Beijing time, in `lib/peak.js`:

| | |
|---|---|
| Peak (高峰计价) | Monday–Friday, `09:00–12:00` and `14:00–18:00` Beijing time |
| Valley (空闲计价) | everything else: `00:00–09:00`, `12:00–14:00`, `18:00–24:00`, all weekends, all Chinese public holidays, and weekends that are 调休 workdays |

The holiday table (`HOLIDAY_VALLEY` in `lib/peak.js`) currently lists **2026 only**, matching the pricing rules as published for 2026 (peak/valley pricing started 2026-08-17, weekend-wide valley from 2026-08-23, holiday-wide valley from 2026-09-19).

> When the State Council publishes the next year's holiday schedule (usually November), add those dates to `HOLIDAY_VALLEY`. Until then a future holiday is treated as an ordinary weekday, which **over-reminds but never misses** a reminder.

## Configuration

Settings page writes `~/.dsh/peak-reminder.json`; you can also edit the file by hand (no restart needed, the host reads it per request):

```json
{
  "enabled": true,
  "intervalMinutes": 5,
  "notifyOnSwitch": true,
  "showSidebar": true
}
```

| key | default | meaning |
|---|---|---|
| `enabled` | `true` | master switch; off means no reminders and the sidebar row reads「提醒已关」 |
| `intervalMinutes` | `5` | minutes between reminders while peak (clamped to 1–120) |
| `notifyOnSwitch` | `true` | also remind once at each peak↔valley boundary |
| `showSidebar` | `true` | show the sidebar status row at all |

## HTTP surface

The host half registers two routes on the DSH web server (no auth, same as other plugin routes):

```
GET  /plugins/dsh-peak-reminder/state    -> { ok, now, isPeak, peakWindow, nextChangeAt, dayKind, config, rules }
GET  /plugins/dsh-peak-reminder/config   -> { ok, config, file }
POST /plugins/dsh-peak-reminder/config   -> { ok, config, file }   body: any subset of the keys above
```

`now` is the host's epoch seconds. The client renders from that and corrects for local clock skew, so the countdown follows the machine that actually knows the time. Peak/valley decisions are never re-derived in the browser — only the host decides, so the holiday table lives in exactly one place.

## How it works

- `lib/index.js` — host half: `apply(ctx, config)` injects `webServer`, registers the two routes, and owns config loading (`defaults < cordis patch config < ~/.dsh/peak-reminder.json`).
- `lib/client.js` — browser half: injected through `slots.register` into `sidebar.footer.action` and `settings.section`; polls `/state` every 30 s, ticks once a second for the countdown, and renders the toast with plain DOM (no dependency on any DSH component package).
- `lib/peak.js` — pure functions, no dependencies: `isPeakTime`, `nextPeakChangeAt`, `currentPeakWindow`, `dayKindLabel`, `isWeekend`, `isHolidayValley`.

## Test

```sh
node test/run.mjs
```

Checks the 09:00/12:00/14:00/18:00 boundaries, weekends, a 调休 Sunday, National Day, the window label, `nextPeakChangeAt` across a weekend, and that the state flips on every boundary it reports.

---

## 中文说明

**为什么要有这个插件。** deepseek 的峰谷定价按北京时间切换：工作日 09:00–12:00、14:00–18:00 是高峰计价，其余时间（含周末、法定节假日、调休）是空闲计价。想知道「现在贵不贵」，通常得自己去查规则或者看余额面板；这个插件把状态放在侧边栏常驻一行，并在峰时按你设的间隔提醒。

**规则只写在 `lib/peak.js` 一处**，宿主判定、浏览器只负责显示，所以补节假日年份只需要改那一个数组。

**已知边界：** 节假日表目前只到 2026 年 12 月 31 日；次年放假安排公布后要手工补，补之前会把未来节假日当普通工作日（多提醒，不会漏提醒）。

**安装、配置、接口字段**见上面的英文部分，两者是同一份内容的两种语言。

## License

MIT
