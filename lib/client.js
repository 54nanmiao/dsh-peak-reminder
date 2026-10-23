/* eslint-disable */
// lib/client.js —— 客户端半边（DSH Web 界面）：
//   1) 侧边栏一行常驻状态（峰时/谷时 + 下次切换倒计时）；
//   2) 峰时每隔 N 分钟在界面顶部弹一条「现在是峰时」提醒，谷时不提醒；
//   3) 设置 → 峰谷提醒：开关与间隔。
// 约定照抄生态插件：不 require Harness 的 client 包，只 require('react')；
// CSS 自带、类名加 .dspr- 前缀、颜色只引用 --dsw-* token（取不到时给兜底色）。
// 峰谷判定不在前端算 —— 一律问宿主 /plugins/dsh-peak-reminder/state（单一事实源）。
window.__ModuleLoader__.load({
  id: 'dsh-peak-reminder',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require('react');

    var name = 'dsh-peak-reminder';
    var STATE_URL = '/plugins/dsh-peak-reminder/state';
    var CONFIG_URL = '/plugins/dsh-peak-reminder/config';
    var NAV_LABEL = '峰谷提醒';
    var POLL_MS = 30000;      // 状态轮询
    var TICK_MS = 1000;       // 倒计时/提醒检查
    var TOAST_MS = 12000;     // 提醒条自动消失
    var SNOOZE_MS = 30 * 60000;

    var CSS = [
      // 侧边栏行（官方 panelRow 形态：全宽、hover 有底色、收窄态 36x36）
      '.dspr-row{box-sizing:border-box;width:100%;border-radius:var(--dsw-radius-md,8px);min-height:36px;color:var(--dsw-alias-label-primary,#e7e7e7);font:inherit;text-align:left;cursor:pointer;background:0 0;border:none;align-items:center;gap:8px;margin:0 2px;padding:7px 8px;line-height:22px;display:flex;flex:1 1 auto}',
      '.dspr-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}',
      '.dspr-row.dspr-collapsed{width:36px;height:36px;min-height:36px;justify-content:center;margin:0;padding:0;flex:none;align-self:center}',
      '.dspr-glyph{flex:none;justify-content:center;align-items:center;display:inline-flex;position:relative}',
      '.dspr-title{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden;font-size:13px}',
      '.dspr-dot{width:8px;height:8px;border-radius:50%;display:block;background:var(--dsw-alias-label-tertiary,#8b8b8b)}',
      '.dspr-dot.dspr-peak{background:#ff8a3d;box-shadow:0 0 0 3px rgba(255,138,61,.18)}',
      '.dspr-dot.dspr-valley{background:#3ecf8e;box-shadow:0 0 0 3px rgba(62,207,142,.16)}',
      '.dspr-dot.dspr-off{background:var(--dsw-alias-label-dimmed,#666)}',
      // 顶部提醒条：自家卡片（不透明底 + 毛玻璃），不吃 DSH 主题 token 的透明度，避免透出底下壁纸/正文
      '.dspr-toast-wrap{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;flex-direction:column;gap:10px;align-items:center;pointer-events:none}',
      '.dspr-toast{pointer-events:auto;box-sizing:border-box;width:min(400px,92vw);display:flex;gap:11px;align-items:flex-start;padding:13px 13px 12px;border-radius:14px;background:rgba(22,24,28,.95);-webkit-backdrop-filter:blur(20px) saturate(1.6);backdrop-filter:blur(20px) saturate(1.6);color:#f2f4f7;border:1px solid rgba(255,255,255,.09);box-shadow:0 18px 44px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.05);font-size:13px;line-height:1.55;animation:dspr-in 180ms cubic-bezier(.22,.9,.3,1)}',
      '.dspr-toast.dspr-toast-peak{border-color:rgba(255,138,61,.42);box-shadow:0 18px 44px rgba(0,0,0,.5),0 0 0 3px rgba(255,138,61,.10)}',
      '.dspr-toast.dspr-toast-valley{border-color:rgba(62,207,142,.36);box-shadow:0 18px 44px rgba(0,0,0,.5),0 0 0 3px rgba(62,207,142,.08)}',
      '@keyframes dspr-in{from{opacity:0;transform:translateY(-10px) scale(.98)}to{opacity:1;transform:none}}',
      '.dspr-badge{flex:none;width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;background:rgba(255,255,255,.07);color:#cfd4dc}',
      '.dspr-toast-peak .dspr-badge{background:rgba(255,138,61,.16);color:#ffb27a}',
      '.dspr-toast-valley .dspr-badge{background:rgba(62,207,142,.14);color:#6fe3ad}',
      '.dspr-toast-body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px;padding-top:1px}',
      '.dspr-toast-title{font-size:13.5px;font-weight:650;line-height:1.45;letter-spacing:.01em}',
      '.dspr-toast-sub{font-size:12.5px;line-height:1.55;color:rgba(236,240,245,.62)}',
      '.dspr-toast-actions{display:flex;flex-direction:column;gap:6px;align-items:stretch;flex:none;padding-top:1px}',
      '.dspr-btn{box-sizing:border-box;border:none;border-radius:8px;cursor:pointer;font:inherit;font-size:12px;line-height:18px;padding:4px 10px;color:rgba(236,240,245,.9);background:rgba(255,255,255,.08);white-space:nowrap}',
      '.dspr-btn:hover{background:rgba(255,255,255,.14)}',
      '.dspr-btn-primary{background:rgba(255,255,255,.92);color:#16181b;font-weight:600}',
      '.dspr-btn-primary:hover{background:#fff}',
      '.dspr-btn-ghost{background:transparent;color:rgba(236,240,245,.5)}',
      '.dspr-btn-ghost:hover{background:rgba(255,255,255,.08);color:rgba(236,240,245,.82)}',
      // 设置页
      '.dspr-section{display:flex;flex-direction:column;width:100%;gap:0}',
      '.dspr-field{display:flex;flex-direction:column;gap:6px;padding:12px 0}',
      '.dspr-field+.dspr-field{border-top:.5px solid var(--dsw-alias-border-l2,#2c2f33)}',
      '.dspr-head{display:flex;gap:8px;align-items:center}',
      '.dspr-label{flex:1;font-size:13px;line-height:1.5;font-weight:500;color:var(--dsw-alias-label-primary,#e7e7e7)}',
      '.dspr-hint{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#8b8b8b)}',
      '.dspr-switch{width:36px;height:20px;padding:2px;border-radius:999px;border:none;background:var(--dsw-alias-border-l3,#3a3d42);cursor:pointer;display:inline-flex;align-items:center;flex-shrink:0}',
      '.dspr-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary,#4d6bfe)}',
      '.dspr-thumb{width:16px;height:16px;border-radius:50%;background:#fff;transition:transform 120ms ease;display:block}',
      '.dspr-switch[aria-checked="true"] .dspr-thumb{transform:translateX(16px)}',
      '.dspr-input{height:34px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l4,#4a4d52);border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-3,#1f2124);font-size:13px;color:var(--dsw-alias-label-primary,#e7e7e7);outline:none;box-sizing:border-box}',
      '.dspr-status{font-size:12.5px;color:var(--dsw-alias-label-secondary,#b9bcc1)}',
      '.dspr-footer{display:flex;gap:10px;align-items:center;justify-content:flex-end;padding-top:16px}',
      '.dspr-save{background:var(--dsw-alias-label-primary,#e7e7e7);color:var(--dsw-alias-bg-layer-3,#1f2124);padding:5px 14px;font-size:13px;line-height:1.5;border:none;border-radius:var(--dsw-radius-md,8px);cursor:pointer}',
      '.dspr-save:hover{opacity:.9}',
      '.dspr-ok{color:var(--dsw-alias-label-tertiary,#8b8b8b);font-size:12px}',
      '.dspr-bad{color:var(--dsw-alias-label-error,#ff6b6b);font-size:12px}',
    ].join('\n');

    if (typeof document !== 'undefined' &&
        document.querySelector('style[data-plugin-css="dsh-peak-reminder/client.css"]') === null) {
      var styleTag = document.createElement('style');
      styleTag.dataset.plugin = 'dsh-peak-reminder';
      styleTag.dataset.pluginCss = 'dsh-peak-reminder/client.css';
      styleTag.textContent = CSS;
      document.head.appendChild(styleTag);
    }

    // ================= 状态仓库 =================
    // serverOffsetMs：本机时钟与宿主时钟的差（宿主时间才是峰谷判定的基准）
    var store = {
      data: null,        // 宿主返回的状态快照
      error: null,       // 上次拉取失败原因（用于「未连接」提示）
      serverOffsetMs: 0,
      subs: [],
    };
    function subscribe(fn) {
      store.subs.push(fn);
      return function () {
        var i = store.subs.indexOf(fn);
        if (i >= 0) store.subs.splice(i, 1);
      };
    }
    function emit() {
      store.subs.forEach(function (fn) { try { fn(); } catch (e) { void e; } });
    }
    function serverNowSec() {
      return Math.floor((Date.now() + store.serverOffsetMs) / 1000);
    }
    function config() {
      var d = store.data;
      return (d && d.config) || { enabled: true, intervalMinutes: 5, notifyOnSwitch: true, showSidebar: true };
    }

    var inflight = false;
    function fetchState() {
      if (inflight) return;
      inflight = true;
      fetch(STATE_URL, { credentials: 'omit', cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : r.json().catch(function () { return null; }).then(function (j) { throw new Error((j && j.reason) || ('HTTP ' + r.status)); }); })
        .then(function (j) {
          inflight = false;
          if (!j || !j.ok) throw new Error((j && j.reason) || 'bad payload');
          store.error = null;
          store.data = j;
          // 时区/时钟对齐：以宿主 now 为准（发请求到收响应通常 <200ms，忽略往返）
          store.serverOffsetMs = j.now * 1000 - Date.now();
          emit();
        })
        .catch(function (e) {
          inflight = false;
          store.error = String((e && e.message) || e);
          emit();
        });
    }

    // ================= 顶部提醒条（原生 DOM，不进 React 树） =================
    var toastHost = null;
    function ensureToastHost() {
      if (typeof document === 'undefined') return null;
      if (toastHost && document.body.contains(toastHost)) return toastHost;
      toastHost = document.createElement('div');
      toastHost.className = 'dspr-toast-wrap';
      toastHost.setAttribute('data-plugin', 'dsh-peak-reminder');
      document.body.appendChild(toastHost);
      return toastHost;
    }

    function fmtDuration(sec) {
      var s = Math.max(0, Math.round(sec));
      var h = Math.floor(s / 3600);
      var m = Math.floor((s % 3600) / 60);
      if (h > 0) return h + ' 小时 ' + m + ' 分';
      if (m > 0) return m + ' 分钟';
      return s + ' 秒';
    }

    function showToast(opts) {
      var host = ensureToastHost();
      if (!host) return;
      var kind = opts.kind === 'valley' ? 'dspr-toast-valley' : (opts.kind === 'peak' ? 'dspr-toast-peak' : '');
      var el = document.createElement('div');
      el.className = 'dspr-toast' + (kind ? ' ' + kind : '');

      // 左侧状态徽标：峰 ▲ 谷 ▼ 其它 ●
      var badge = document.createElement('div');
      badge.className = 'dspr-badge';
      badge.textContent = opts.kind === 'peak' ? '▲' : (opts.kind === 'valley' ? '▼' : '●');
      badge.setAttribute('aria-hidden', 'true');
      el.appendChild(badge);

      var body = document.createElement('div');
      body.className = 'dspr-toast-body';
      var title = document.createElement('div');
      title.className = 'dspr-toast-title';
      title.textContent = opts.title || '';
      body.appendChild(title);
      if (opts.sub) {
        var sub = document.createElement('div');
        sub.className = 'dspr-toast-sub';
        sub.textContent = opts.sub;
        body.appendChild(sub);
      }
      el.appendChild(body);

      var actions = document.createElement('div');
      actions.className = 'dspr-toast-actions';
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'dspr-btn dspr-btn-primary';
      closeBtn.textContent = '知道了';
      closeBtn.onclick = function () { close(); };
      var snooze = document.createElement('button');
      snooze.type = 'button';
      snooze.className = 'dspr-btn dspr-btn-ghost';
      snooze.textContent = '暂停 30 分钟';
      snooze.onclick = function () { snoozeUntil = Date.now() + SNOOZE_MS; close(); };
      actions.appendChild(closeBtn);
      actions.appendChild(snooze);
      el.appendChild(actions);

      host.appendChild(el);
      // 同屏最多 3 条，旧的先走
      while (host.children.length > 3) host.removeChild(host.firstChild);

      var timer = setTimeout(function () { close(); }, TOAST_MS);
      var closed = false;
      function close() {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        if (el.parentNode) el.parentNode.removeChild(el);
      }
      el.__dsprClose = close;
    }

    // ================= 提醒节拍 =================
    var snoozeUntil = 0;
    var lastRemindAt = 0;     // ms
    var everPeak = null;      // 上一次已知的峰/谷（用于切换提醒）
    var remindedInPeak = false;

    function tick() {
      var d = store.data;
      if (!d) return;
      var cfg = config();
      var nowSec = serverNowSec();

      // 已跨过切换点 → 立刻补一次状态（最多 1 秒的滞后再正确不过）
      if (d.nextChangeAt && nowSec >= d.nextChangeAt) fetchState();

      var peak = !!d.isPeak;
      var nowMs = Date.now();

      // 峰↔谷 切换提醒（只做一次，且不因暂停而丢失"状态已切换"的记忆）
      if (everPeak !== null && peak !== everPeak && cfg.enabled && cfg.notifyOnSwitch && nowMs >= snoozeUntil) {
        if (peak) {
          showToast({
            kind: 'peak',
            title: '现在是峰时 —— 高峰计价',
            sub: (d.peakWindow ? '峰时段 ' + d.peakWindow + '，' : '') + '之后每 ' + cfg.intervalMinutes + ' 分钟提醒一次。',
          });
          lastRemindAt = nowMs;
        } else {
          showToast({
            kind: 'valley',
            title: '现在是谷时 —— 空闲计价',
            sub: '峰时提醒已停，' + (d.nextChangeAt ? '距下次峰时约 ' + fmtDuration(d.nextChangeAt - nowSec) : '') + '。',
          });
        }
      }
      everPeak = peak;

      if (!cfg.enabled || !peak || nowMs < snoozeUntil) {
        if (!peak) remindedInPeak = false;
        return;
      }

      var intervalMs = Math.max(1, Number(cfg.intervalMinutes) || 5) * 60000;
      // 进入峰时后的第一条立刻给（不用等满一个间隔）
      if (!remindedInPeak) {
        remindedInPeak = true;
        lastRemindAt = nowMs;
        showToast({
          kind: 'peak',
          title: '现在是峰时 · 高峰计价',
          sub: (d.peakWindow ? '峰时段 ' + d.peakWindow : '') +
            (d.nextChangeAt ? '，距谷时还有 ' + fmtDuration(d.nextChangeAt - nowSec) : '') +
            '；每 ' + cfg.intervalMinutes + ' 分钟提醒一次（谷时不提醒）。',
        });
        return;
      }

      if (nowMs - lastRemindAt >= intervalMs) {
        lastRemindAt = nowMs;
        showToast({
          kind: 'peak',
          title: '还在峰时 · 高峰计价',
          sub: (d.nextChangeAt ? '距谷时还有 ' + fmtDuration(d.nextChangeAt - nowSec) : '') +
            (d.dayKind ? '（' + d.dayKind + '）' : ''),
        });
      }
    }

    // ================= React 视图 =================
    function usePeakState() {
      var st = React.useState(0);
      var bump = st[1];
      React.useEffect(function () {
        var un = subscribe(function () { bump(function (n) { return n + 1; }); });
        return function () { un(); };
      }, []);
      return store;
    }

    function SidebarRow(props) {
      props = props || {};
      var wide = !!props.wide;
      var snap = usePeakState();
      var cfg = config();
      if (!cfg.showSidebar) return null;

      var d = snap.data;
      var nowSec = serverNowSec();
      var peak = !!(d && d.isPeak);
      var left = d && d.nextChangeAt ? d.nextChangeAt - nowSec : 0;
      var label;
      var title;
      if (!d) {
        label = snap.error ? '峰谷提醒（未连接）' : '峰谷提醒…';
        title = snap.error ? ('宿主状态接口不可用：' + snap.error) : '正在读取峰谷状态…';
      } else if (!cfg.enabled) {
        label = '提醒已关';
        title = '峰谷提醒已在设置里关闭（点设置 → 峰谷提醒打开）';
      } else if (peak) {
        label = '峰时 · ' + fmtDuration(left) + '后谷';
        title = '现在是峰时（' + (d.peakWindow || '高峰时段') + '，高峰计价）\n距谷时还有 ' + fmtDuration(left) +
          '\n每 ' + cfg.intervalMinutes + ' 分钟提醒一次；' + (d.dayKind || '');
      } else {
        label = '谷时 · ' + fmtDuration(left) + '后峰';
        title = '现在是谷时（空闲计价，不提醒）\n' + (d.dayKind || '') +
          (d.nextChangeAt ? '\n距峰时还有 ' + fmtDuration(left) : '');
      }
      var dotCls = 'dspr-dot' + (d ? (cfg.enabled ? (peak ? ' dspr-peak' : ' dspr-valley') : ' dspr-off') : '');

      return React.createElement('button', {
        type: 'button',
        className: 'dspr-row' + (wide ? '' : ' dspr-collapsed'),
        title: title,
        'aria-label': title,
        onClick: function () {
          // 点一下 = 立刻刷新状态并弹一条当前详情（手动查看用，不占「每 N 分钟」的节拍）
          fetchState();
          showToast({
            kind: d && d.isPeak ? 'peak' : 'valley',
            title: d
              ? (d.isPeak ? '峰时 · ' + (d.peakWindow || '高峰时段') : '谷时 · 空闲计价')
              : '峰谷提醒：还没读到宿主状态',
            sub: d
              ? ((d.isPeak
                  ? '高峰计价中，距谷时还有 ' + fmtDuration(left) + '；每 ' + cfg.intervalMinutes + ' 分钟提醒一次。'
                  : '空闲计价，峰时提醒停用；' + (d.nextChangeAt ? '距峰时还有 ' + fmtDuration(left) + '。' : '')) +
                 (d.dayKind ? '（' + d.dayKind + '）' : ''))
              : (snap.error || '正在读取…'),
          });
        },
      },
        React.createElement('span', { className: 'dspr-glyph', 'aria-hidden': 'true' },
          React.createElement('span', { className: dotCls })),
        wide ? React.createElement('span', { className: 'dspr-title' }, label) : null
      );
    }

    function Switch(props) {
      return React.createElement('button', {
        type: 'button',
        role: 'switch',
        className: 'dspr-switch',
        'aria-checked': props.checked ? 'true' : 'false',
        onClick: function () { props.onChange(!props.checked); },
      }, React.createElement('span', { className: 'dspr-thumb' }));
    }

    function SettingsSection() {
      var snap = usePeakState();
      var cfgState = React.useState(null);
      var draft = cfgState[0];
      var setDraft = cfgState[1];
      var saveState = React.useState(0); // 0 未存 1 已存 -1 失败
      var saved = saveState[0];
      var setSaved = saveState[1];
      var failReason = React.useRef('');

      React.useEffect(function () {
        if (draft === null && snap.data && snap.data.config) setDraft(snap.data.config);
      }, [snap.data]);
      var view = draft || config();
      function upd(key, value) {
        setSaved(0);
        setDraft(function (old) { return Object.assign({}, (old || config()), { [key]: value }); });
      }
      var d = snap.data;
      var nowSec = serverNowSec();
      var left = d && d.nextChangeAt ? d.nextChangeAt - nowSec : 0;

      return React.createElement('div', { className: 'dspr-section' },
        React.createElement('div', { className: 'dspr-field' },
          React.createElement('div', { className: 'dspr-head' },
            React.createElement('span', { className: 'dspr-label' }, '启用峰时提醒'),
            React.createElement(Switch, { checked: view.enabled !== false, onChange: function (v) { upd('enabled', v); } })),
          React.createElement('div', { className: 'dspr-hint' },
            '开启后，峰时段（北京时间工作日 09:00–12:00、14:00–18:00）每 ' + (view.intervalMinutes || 5) +
            ' 分钟在界面顶部提醒一次「现在是峰时」；谷时（含周末、法定节假日）不提醒。')),

        React.createElement('div', { className: 'dspr-field' },
          React.createElement('div', { className: 'dspr-head' },
            React.createElement('span', { className: 'dspr-label' }, '提醒间隔（分钟）'),
            React.createElement('input', {
              type: 'number', min: 1, max: 120, className: 'dspr-input', style: { width: 120 },
              value: view.intervalMinutes || 5,
              onChange: function (e) { upd('intervalMinutes', Number(e.target.value) || 1); },
            })),
          React.createElement('div', { className: 'dspr-hint' }, '取值 1–120 分钟；默认 5 分钟。峰时刚到时先给一条，之后按这个间隔。')),

        React.createElement('div', { className: 'dspr-field' },
          React.createElement('div', { className: 'dspr-head' },
            React.createElement('span', { className: 'dspr-label' }, '峰↔谷 切换时也提醒一条'),
            React.createElement(Switch, { checked: view.notifyOnSwitch !== false, onChange: function (v) { upd('notifyOnSwitch', v); } })),
          React.createElement('div', { className: 'dspr-hint' }, '进入峰时提示「高峰计价」，进入谷时提示「空闲计价」。')),

        React.createElement('div', { className: 'dspr-field' },
          React.createElement('div', { className: 'dspr-head' },
            React.createElement('span', { className: 'dspr-label' }, '侧边栏显示状态行'),
            React.createElement(Switch, { checked: view.showSidebar !== false, onChange: function (v) { upd('showSidebar', v); } })),
          React.createElement('div', { className: 'dspr-hint' }, '侧边栏底部常驻一行：峰时/谷时 + 距下次切换倒计时。')),

        React.createElement('div', { className: 'dspr-field' },
          React.createElement('div', { className: 'dspr-status' },
            d
              ? ((d.isPeak ? '当前：峰时（' + (d.peakWindow || '') + '，高峰计价）' : '当前：谷时（空闲计价）') +
                 (d.nextChangeAt ? ' · ' + fmtDuration(left) + '后切换 · ' + (d.dayKind || '') : ''))
              : (snap.error ? ('未连上宿主状态接口：' + snap.error) : '正在读取状态…')),
          React.createElement('div', { className: 'dspr-hint' },
            '判定规则与 dsh-whale-widget 同源：北京时间周一至周五 09:00–12:00、14:00–18:00 为峰时；' +
            '周末与法定节假日全天谷价。配置存于 ~/.dsh/peak-reminder.json。')),

        React.createElement('div', { className: 'dspr-footer' },
          saved === 1 ? React.createElement('span', { className: 'dspr-ok' }, '已保存 ✓') : null,
          saved === -1 ? React.createElement('span', { className: 'dspr-bad' }, '保存失败：' + failReason.current) : null,
          React.createElement('button', {
            type: 'button', className: 'dspr-save',
            onClick: function () {
              fetch(CONFIG_URL, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  enabled: view.enabled !== false,
                  intervalMinutes: view.intervalMinutes || 5,
                  notifyOnSwitch: view.notifyOnSwitch !== false,
                  showSidebar: view.showSidebar !== false,
                }),
              })
                .then(function (r) { return r.json(); })
                .then(function (j) {
                  if (j && j.ok) {
                    setSaved(1);
                    fetchState(); // 立刻把新配置同步进侧边栏行与提醒节拍
                  } else {
                    failReason.current = (j && (j.reason || j.detail)) || 'unknown';
                    setSaved(-1);
                  }
                })
                .catch(function (e) { failReason.current = String((e && e.message) || e); setSaved(-1); });
            },
          }, '保存配置')));
    }

    // ================= 挂载 =================
    var timers = [];
    function applyClient(ctx) {
      var slots = ctx.get('slots');
      if (slots && typeof slots.inject === 'function') {
        slots.inject('sidebar.footer.action', function () {
          return slots.register(
            { name: 'sidebar.footer.action', id: 'dsh-peak-reminder', order: 90, label: NAV_LABEL },
            function (props) { return React.createElement(SidebarRow, props); }
          );
        });
        slots.inject('settings.section', function () {
          return slots.register(
            { name: 'settings.section', id: 'dsh-peak-reminder', order: 880, label: NAV_LABEL },
            function () { return React.createElement(SettingsSection, null); }
          );
        });
      }

      fetchState();
      timers.push(setInterval(fetchState, POLL_MS));
      timers.push(setInterval(tick, TICK_MS));
    }

    exports.name = name;
    exports.inject = ['slots'];
    exports.apply = function (ctx, config) {
      exports.__peakCfg = config || {};
      try { applyClient(ctx); } catch (e) { /* 挂载失败不拖垮宿主界面 */ void e; }
    };
    exports.__unload = function () {
      timers.forEach(function (t) { clearInterval(t); });
      timers = [];
      if (toastHost && toastHost.parentNode) toastHost.parentNode.removeChild(toastHost);
      toastHost = null;
    };

    return module.exports;
  },
});
