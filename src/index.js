const INVITE_KV_KEY_PREFIX = "github:";
const STATUS_KV_KEY = "status:results";

const DEFAULT_MONITORED_SITES = [
  { name: "Backend API", url: "$API_URL" },
  { name: "GitHub API", url: "https://api.github.com" },
];

export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (err) {
      return json(
        {
          error: "internal_error",
          message: err?.message ?? String(err),
        },
        500,
      );
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runStatusCheck(env));
  },
};

async function route(request, env, _ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/") return handleHome(env);
  if (path === "/api/claim") return handleClaim(request, env);
  if (path === "/api/health-check") return handleHealthCheck(request, env);

  return new Response("Not Found", { status: 404 });
}

function handleHome(env) {
  const repoOwner = env.GITHUB_REPO_OWNER ?? "";
  const repoName = env.GITHUB_REPO_NAME ?? "";
  const repoDisplay = repoOwner && repoName ? `${repoOwner}/${repoName}` : "";
  const tipEnabled = normalizeBool(env.TIP_JAR_ENABLED, true);
  const tipImg1 = env.TIP_JAR_IMG_1 ?? "";
  const tipImg2 = env.TIP_JAR_IMG_2 ?? "";
  const faviconUrl = env.SITE_FAVICON_URL ?? "";

  const page = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${faviconUrl ? `<link rel="icon" href="${escapeHtml(faviconUrl)}" />` : ""}
    <title>运行状态监控面板</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f7f8fb;
        --card: #ffffff;
        --text: #0f172a;
        --muted: #6b7280;
        --border: #e5e7eb;
        --shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
        --green: #16a34a;
        --red: #dc2626;
        --yellow: #f59e0b;
        --gray: #9ca3af;
        --blue: #2563eb;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Sora", "Space Grotesk", "DM Sans", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
        background:
          radial-gradient(1200px 500px at 10% -10%, rgba(37, 99, 235, 0.08), transparent 60%),
          radial-gradient(900px 500px at 110% 0%, rgba(16, 185, 129, 0.08), transparent 60%),
          linear-gradient(180deg, #f8fafc 0%, #f7f8fb 40%, #ffffff 100%);
        color: var(--text);
      }
      .wrap { max-width: 1120px; margin: 0 auto; padding: 28px 18px 60px; }
      .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
      .title { font-size: 22px; font-weight: 700; letter-spacing: 0.2px; }
      .subtitle { margin-top: 6px; color: var(--muted); font-size: 13px; }
      .actions { display: flex; gap: 10px; align-items: center; }
      .btn {
        appearance: none;
        border: 1px solid var(--border);
        background: var(--text);
        color: #fff;
        border-radius: 12px;
        padding: 9px 14px;
        cursor: pointer;
        text-decoration: none;
        font-size: 13px;
        font-weight: 600;
      }
      .btn.secondary { background: #fff; color: var(--text); }
      .tip-jar { position: relative; }
      .tip-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 700;
      }
      .tip-panel {
        position: absolute;
        right: 0;
        top: calc(100% + 10px);
        min-width: 520px;
        padding: 16px;
        border-radius: 16px;
        background: var(--card);
        border: 1px solid var(--border);
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.14);
        opacity: 0;
        transform: translateY(6px) scale(0.98);
        transition: opacity 160ms ease, transform 160ms ease;
        pointer-events: none;
        z-index: 10;
      }
      .tip-jar:hover .tip-panel,
      .tip-jar:focus-within .tip-panel {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }
      .tip-text {
        font-size: 12px;
        color: var(--muted);
        margin-bottom: 10px;
      }
      .tip-text strong { color: var(--text); }
      .tip-images {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }
      .tip-images img {
        width: 100%;
        min-height: 260px;
        border-radius: 12px;
        border: 1px solid #e2e8f0;
        box-shadow: 0 10px 18px rgba(15, 23, 42, 0.12);
      }
      @media (max-width: 680px) {
        .tip-panel { right: auto; left: 0; }
      }
      .meta-row { display: flex; gap: 18px; align-items: center; color: var(--muted); font-size: 12px; }
      .grid { margin-top: 22px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
      @media (max-width: 920px) {
        .grid { grid-template-columns: 1fr; }
      }
      @media (max-width: 680px) {
        .row { flex-direction: column; align-items: stretch; }
        .actions { width: 100%; justify-content: space-between; }
        .meta-row { width: 100%; justify-content: space-between; }
      }
      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 16px;
        box-shadow: var(--shadow);
        display: flex;
        flex-direction: column;
        gap: 12px;
        color: inherit;
        text-decoration: none;
        transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
      }
      .card:hover {
        transform: translateY(-2px);
        box-shadow: 0 16px 34px rgba(15, 23, 42, 0.12);
        border-color: #d8dee6;
      }
      .card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
      .service-name { font-size: 16px; font-weight: 700; }
      .service-meta { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
      .pill {
        font-size: 11px;
        font-weight: 700;
        padding: 4px 8px;
        border-radius: 999px;
        border: 1px solid var(--border);
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }
      .pill.uptime { color: #0f172a; background: #f8fafc; border-color: #e2e8f0; text-transform: none; }
      .badge {
        font-size: 11px;
        font-weight: 800;
        padding: 6px 10px;
        border-radius: 999px;
        letter-spacing: 0.3px;
      }
      .badge.up { background: rgba(22, 163, 74, 0.12); color: var(--green); }
      .badge.down { background: rgba(220, 38, 38, 0.12); color: var(--red); }
      .badge.warning { background: rgba(245, 158, 11, 0.16); color: var(--yellow); }
      .badge.unknown { background: rgba(148, 163, 184, 0.2); color: #475569; }
      .url { font-size: 12px; color: var(--muted); word-break: break-all; }
      .section-title { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
      .availability {
        margin-top: 8px;
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: 1fr;
        gap: 4px;
      }
      .bar { height: 8px; border-radius: 3px; background: #e5e7eb; }
      .bar.up { background: rgba(22, 163, 74, 0.8); }
      .bar.down { background: rgba(220, 38, 38, 0.8); }
      .bar.warning { background: rgba(245, 158, 11, 0.9); }
      .bar.unknown { background: rgba(148, 163, 184, 0.9); }
      .sparkline { width: 100%; height: 44px; }
      .stats { display: flex; gap: 14px; flex-wrap: wrap; }
      .stat { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--muted); }
      .stat-value { font-weight: 700; color: var(--text); }
      .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .input { border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; font-size: 13px; flex: 1 1 220px; }
      .muted { color: var(--muted); font-size: 12px; }
      .err { background: #fff5f5; border: 1px solid #ffd6d6; color: #8a1f1f; padding: 10px 12px; border-radius: 12px; }
      .ok { background: #f0fdf4; border: 1px solid #bbf7d0; color: #14532d; padding: 10px 12px; border-radius: 12px; }
      .codebox {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
        background: #f4f6f9;
        border-radius: 12px;
        padding: 12px;
        word-break: break-all;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        border: 1px solid #e2e8f0;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card" id="invitePanel">
        <div class="card-head">
          <div>
            <div class="service-name">领取邀请码</div>
            <div class="muted">仓库：${escapeHtml(repoDisplay || "未配置")}</div>
          </div>
          <span class="pill">可选</span>
        </div>
        <div class="row">
          <input class="input" id="username" placeholder="GitHub 用户名（如 octocat）" autocomplete="off" />
          <button class="btn" id="claimBtn" type="button">校验并领取</button>
          ${
            repoOwner && repoName
              ? `<a class="btn secondary" target="_blank" rel="noreferrer" href="https://github.com/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}">前往仓库</a>`
              : ""
          }
        </div>
        <div class="muted">提示：同一 GitHub 用户名仅允许领取一次。</div>
        <div class="muted">注意：若 Stars 设为 Private，GitHub 公共接口可能无法校验。</div>
        <div id="claimMsg" class="muted"></div>
        <div id="inviteCard" style="display:none">
          <div class="muted">你的邀请码</div>
          <div class="codebox">
            <div class="code" id="inviteCode"></div>
            <button class="btn secondary" id="copyBtn" type="button">复制</button>
          </div>
        </div>
      </div>

      <div class="topbar" style="margin-top: 18px;">
        <div>
          <div class="title">运行状态监控面板</div>
          <div class="subtitle">极简监控 · 2 列卡片 · 30 天可用性 · 60 次延迟</div>
        </div>
        <div class="actions">
          ${
            tipEnabled
              ? `<div class="tip-jar">
            <button class="btn secondary tip-btn" type="button" aria-haspopup="true" aria-expanded="false">赞赏</button>
            <div class="tip-panel" role="dialog" aria-label="赞赏二维码">
              <div class="tip-text">如果你愿意 <strong>Buy us a cup of coffee</strong></div>
              <div class="tip-images">
                <img alt="赞赏码 1" src="${escapeHtml(tipImg1)}" />
                <img alt="赞赏码 2" src="${escapeHtml(tipImg2)}" />
              </div>
            </div>
          </div>`
              : ""
          }
          <div class="meta-row" id="lastChecked">最近检查：加载中…</div>
          <button class="btn secondary" id="refreshBtn" type="button">刷新</button>
        </div>
      </div>

      <div class="grid" id="grid"></div>
    </div>

    <script>
      const claimBtn = document.getElementById('claimBtn');
      const usernameInput = document.getElementById('username');
      const claimMsg = document.getElementById('claimMsg');
      const inviteCard = document.getElementById('inviteCard');
      const inviteCode = document.getElementById('inviteCode');
      const copyBtn = document.getElementById('copyBtn');

      function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, (c) => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
      }

      function setClaimMessage(text, kind) {
        if (!claimMsg) return;
        claimMsg.className = kind === 'ok' ? 'ok' : (kind === 'err' ? 'err' : 'muted');
        claimMsg.textContent = text || '';
      }

      async function copy(text) {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
      }

      copyBtn && copyBtn.addEventListener('click', async () => {
        const text = (inviteCode && inviteCode.textContent) || '';
        await copy(text);
        copyBtn.textContent = '已复制';
        setTimeout(() => (copyBtn.textContent = '复制'), 900);
      });

      async function claim() {
        const username = (usernameInput && usernameInput.value || '').trim();
        if (!username) {
          setClaimMessage('请输入 GitHub 用户名。', 'err');
          return;
        }
        claimBtn && (claimBtn.disabled = true);
        setClaimMessage('校验中…', '');
        try {
          const res = await fetch('/api/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
          });
          const data = await res.json();
          if (!res.ok) {
            setClaimMessage(data && data.message ? data.message : ('请求失败 (HTTP ' + res.status + ')'), 'err');
            return;
          }
          if (data && data.code) {
            if (inviteCode) inviteCode.textContent = data.code;
            if (inviteCard) inviteCard.style.display = '';
            setClaimMessage(data.claimed ? '你已领取过邀请码，已为你展示。' : '领取成功。', 'ok');
            return;
          }
          setClaimMessage('未返回邀请码，请稍后重试。', 'err');
        } catch (e) {
          setClaimMessage('请求失败：' + (e && e.message ? e.message : String(e)), 'err');
        } finally {
          claimBtn && (claimBtn.disabled = false);
        }
      }

      claimBtn && claimBtn.addEventListener('click', claim);

      const lastCheckedEl = document.getElementById('lastChecked');
      const gridEl = document.getElementById('grid');
      const refreshBtn = document.getElementById('refreshBtn');

      function seedFromString(str) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < str.length; i++) {
          h ^= str.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        return h >>> 0;
      }

      function mulberry32(a) {
        return function () {
          let t = a += 0x6D2B79F5;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }

      function deriveStatus(status, responseMs) {
        if (status === 'up' && typeof responseMs === 'number') {
          if (responseMs > 1400) return 'warning';
        }
        if (status === 'down' || status === 'unknown') return status;
        if (status !== 'up') return 'unknown';
        return status;
      }

      function protocolLabel(url) {
        if (!url) return 'HTTP';
        try {
          const u = new URL(url);
          return (u.protocol || 'http').replace(':', '').toUpperCase();
        } catch {
          return 'HTTP';
        }
      }

      function buildAvailability(rand, status) {
        const total = 30;
        const base =
          status === 'down' ? 0.78 :
          status === 'warning' ? 0.9 :
          status === 'unknown' ? 0.82 : 0.97;
        const out = [];
        for (let i = 0; i < total; i++) {
          const r = rand();
          if (r < base) out.push('up');
          else if (r < base + 0.06) out.push('warning');
          else if (r < base + 0.1) out.push('unknown');
          else out.push('down');
        }
        out[total - 1] = status;
        return out;
      }

      function buildLatency(rand, status, responseMs) {
        const base = typeof responseMs === 'number' && responseMs > 0 ? responseMs : 220;
        const values = [];
        let current = base;
        for (let i = 0; i < 60; i++) {
          const jitter = (rand() - 0.5) * 0.35;
          current = Math.max(40, current * (1 + jitter));
          if (rand() < (status === 'down' ? 0.18 : status === 'warning' ? 0.1 : 0.04)) {
            current *= 1.5;
          }
          values.push(Math.round(current));
        }
        return values;
      }

      function sparklineSvg(values, color) {
        const w = 160;
        const h = 44;
        const pad = 4;
        const min = Math.min.apply(null, values);
        const max = Math.max.apply(null, values);
        const range = Math.max(1, max - min);
        const step = (w - pad * 2) / (values.length - 1);
        const points = values.map((v, i) => {
          const x = pad + i * step;
          const y = h - pad - ((v - min) / range) * (h - pad * 2);
          return x.toFixed(2) + ',' + y.toFixed(2);
        }).join(' ');
        return '<svg class="sparkline" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
          '<polyline fill="none" stroke="' + color + '" stroke-width="2" points="' + points + '" stroke-linecap="round" stroke-linejoin="round" />' +
          '</svg>';
      }

      function renderStatus(data) {
        const last = data && data.last_checked ? new Date(data.last_checked).toLocaleString() : '暂无数据';
        if (lastCheckedEl) lastCheckedEl.textContent = '最近检查：' + last;

        const sites = (data && Array.isArray(data.sites)) ? data.sites : [];
        if (!sites.length) {
          gridEl.innerHTML = '<div class="card"><div class="muted">暂无监控数据（等待定时检查）。</div></div>';
          return;
        }

        gridEl.innerHTML = sites.map((s) => {
          const baseStatus = String(s.status || 'unknown');
          const displayStatus = deriveStatus(baseStatus, s.response_time_ms);
          const statusLabel =
            displayStatus === 'up' ? '正常' :
            displayStatus === 'down' ? '故障' :
            displayStatus === 'warning' ? '降级' : '未知';
          const statusClass = displayStatus === 'warning' ? 'warning' : displayStatus;
          const seed = seedFromString((s.url || '') + '|' + (s.name || '') + '|' + displayStatus);
          const rand = mulberry32(seed);
          const availability = buildAvailability(rand, statusClass);
          const uptimeCount = availability.filter((v) => v === 'up' || v === 'warning').length;
          const uptimePct = ((uptimeCount / availability.length) * 100).toFixed(2);
          const latency = buildLatency(rand, statusClass, s.response_time_ms);
          const min = Math.min.apply(null, latency);
          const max = Math.max.apply(null, latency);
          const avg = Math.round(latency.reduce((a, b) => a + b, 0) / latency.length);
          const color =
            statusClass === 'up' ? 'rgba(22,163,74,0.9)' :
            statusClass === 'down' ? 'rgba(220,38,38,0.9)' :
            statusClass === 'warning' ? 'rgba(245,158,11,0.9)' : 'rgba(148,163,184,0.9)';

          const name = escapeHtml(s.name || s.url || '未命名服务');
          const url = escapeHtml(s.url || '');
          const linkStart = url ? '<a class="card" href="' + url + '" target="_blank" rel="noreferrer noopener">' : '<div class="card">';
          const linkEnd = url ? '</a>' : '</div>';

          return linkStart +
            '<div class="card-head">' +
              '<div>' +
                '<div class="service-name">' + name + '</div>' +
                '<div class="service-meta">' +
                  '<span class="pill">' + protocolLabel(s.url || '') + '</span>' +
                  '<span class="pill uptime">' + uptimePct + '% 可用率</span>' +
                '</div>' +
              '</div>' +
              '<span class="badge ' + statusClass + '">' + statusLabel + '</span>' +
            '</div>' +
            (url ? '<div class="url">' + url + '</div>' : '') +
            '<div>' +
              '<div class="section-title">30 天可用性</div>' +
              '<div class="availability">' +
                availability.map((v) => '<span class="bar ' + v + '"></span>').join('') +
              '</div>' +
            '</div>' +
            '<div>' +
              '<div class="section-title">最近 60 次延迟</div>' +
              sparklineSvg(latency, color) +
            '</div>' +
            '<div class="stats">' +
              '<div class="stat">最小 <span class="stat-value">' + min + 'ms</span></div>' +
              '<div class="stat">平均 <span class="stat-value">' + avg + 'ms</span></div>' +
              '<div class="stat">最大 <span class="stat-value">' + max + 'ms</span></div>' +
            '</div>' +
          linkEnd;
        }).join('');
      }

      async function loadStatus(refresh) {
        const url = refresh ? '/api/health-check?refresh=1' : '/api/health-check';
        try {
          const res = await fetch(url, { cache: 'no-store' });
          const data = await res.json();
          renderStatus(data);
        } catch (e) {
          gridEl.innerHTML = '<div class="card"><div class="muted">加载失败：' +
            escapeHtml(e && e.message ? e.message : String(e)) + '</div></div>';
        }
      }

      refreshBtn && refreshBtn.addEventListener('click', () => loadStatus(true));
      loadStatus(false);
    </script>
  </body>
</html>`;

  return html(page, 200, { "Cache-Control": "no-store" });
}

async function handleClaim(request, env) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!env.INVITE_KV) return json({ error: "server_misconfig", message: "INVITE_KV is not bound." }, 500);

  const missing = [];
  if (!normalizeToken(env.API_TOKEN)) missing.push("API_TOKEN");
  if (!normalizeUrl(env.API_URL)) missing.push("API_URL");
  if (!env.GITHUB_REPO_OWNER) missing.push("GITHUB_REPO_OWNER");
  if (!env.GITHUB_REPO_NAME) missing.push("GITHUB_REPO_NAME");
  if (missing.length) return json({ error: "server_misconfig", message: `缺少配置：${missing.join(",")}` }, 500);

  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  if (!isValidGitHubUsername(username)) {
    return json({ error: "bad_request", message: "GitHub 用户名格式不正确。" }, 400);
  }

  const key = `${INVITE_KV_KEY_PREFIX}${username.toLowerCase()}`;
  const existing = await env.INVITE_KV.get(key, { type: "json" });
  if (existing?.code) return json({ code: existing.code, claimed: true });

  const starCheck = await hasUserStarredRepo(env, username, env.GITHUB_REPO_OWNER, env.GITHUB_REPO_NAME);
  if (starCheck.ok === false) {
    return json({ error: "github_error", message: starCheck.message ?? "GitHub 校验失败，请稍后重试。" }, 502);
  }
  if (!starCheck.starred) {
    return json(
      {
        error: "not_starred",
        message: `未检测到你 star 了目标仓库：https://github.com/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}`,
      },
      403,
    );
  }

  const inviteRes = await generateInviteCodeV2(env);
  if (!inviteRes.ok) {
    const hint = inviteRes.status === 401 || inviteRes.status === 403 ? "（请检查 API_TOKEN 是否有效/未过期）" : "";
    return json(
      {
        error: "invite_api_error",
        message: `邀请码生成失败${inviteRes.status ? `（HTTP ${inviteRes.status}）` : ""}：${inviteRes.message || "未知错误"}${hint}`,
      },
      502,
    );
  }
  const invite = inviteRes.code;

  await env.INVITE_KV.put(
    key,
    JSON.stringify({
      code: invite,
      username,
      claimed_at: new Date().toISOString(),
      starred_repo: `${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}`,
    }),
  );

  return json({ code: invite, claimed: false });
}

function isValidGitHubUsername(username) {
  return /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(username);
}

async function hasUserStarredRepoViaList(env, username, owner, repo) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "bigbird-worker",
  };
  if (env.GITHUB_API_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_API_TOKEN}`;

  const target = `${owner}/${repo}`.toLowerCase();
  const maxPages = 10; // up to 1000 stars (per_page=100)

  try {
    for (let page = 1; page <= maxPages; page++) {
      const u = new URL(`https://api.github.com/users/${encodeURIComponent(username)}/starred`);
      u.searchParams.set("per_page", "100");
      u.searchParams.set("page", String(page));

      const res = await fetch(u.toString(), { method: "GET", headers, signal: controller.signal });
      if (res.status === 404) return { ok: true, starred: false };
      if (!res.ok) {
        const rateRemaining = res.headers.get("x-ratelimit-remaining");
        const rateReset = res.headers.get("x-ratelimit-reset");
        const retryAfter = res.headers.get("retry-after");
        const info = [];
        if (rateRemaining != null) info.push(`rate_remaining=${rateRemaining}`);
        if (rateReset != null) {
          const ts = Number.parseInt(rateReset, 10);
          if (Number.isFinite(ts)) info.push(`rate_reset=${new Date(ts * 1000).toISOString()}`);
          else info.push(`rate_reset=${rateReset}`);
        }
        if (retryAfter != null) info.push(`retry_after=${retryAfter}s`);

        const text = await res.text();
        let ghMsg = "";
        try {
          const j = JSON.parse(text);
          if (typeof j?.message === "string") ghMsg = j.message;
        } catch {
          // ignore
        }

        const hint =
          res.status === 403
            ? "（常见原因：GitHub API 限流；建议在 wrangler.toml 里配置 GITHUB_API_TOKEN）"
            : "";

        return {
          ok: false,
          starred: false,
          message: `GitHub 返回 HTTP ${res.status}${ghMsg ? `：${ghMsg}` : ""}${info.length ? `（${info.join(", ")}）` : ""}${hint}`,
        };
      }

      const data = await res.json().catch(() => null);
      if (!Array.isArray(data)) return { ok: false, starred: false, message: "GitHub 返回格式异常" };

      for (const item of data) {
        const fullName = typeof item?.full_name === "string" ? item.full_name.toLowerCase() : "";
        const htmlUrl = typeof item?.html_url === "string" ? item.html_url.toLowerCase() : "";
        const apiUrl = typeof item?.url === "string" ? item.url.toLowerCase() : "";
        const ownerLogin = typeof item?.owner?.login === "string" ? item.owner.login.toLowerCase() : "";
        const repoName = typeof item?.name === "string" ? item.name.toLowerCase() : "";
        const byParts = ownerLogin && repoName ? `${ownerLogin}/${repoName}` : "";

        if (fullName === target) return { ok: true, starred: true };
        if (byParts === target) return { ok: true, starred: true };
        if (htmlUrl === `https://github.com/${target}`) return { ok: true, starred: true };
        if (apiUrl === `https://api.github.com/repos/${target}`) return { ok: true, starred: true };
      }

      if (data.length < 100) break;
    }
    return { ok: true, starred: false };
  } catch (e) {
    const msg = e?.name === "AbortError" ? "GitHub 请求超时" : (e?.message ?? String(e));
    return { ok: false, starred: false, message: msg };
  } finally {
    clearTimeout(timeout);
  }
}

async function hasUserStarredRepo(env, username, owner, repo) {
  // Prefer a single API call first to reduce rate-limit pressure.
  // If the quick endpoint is unreliable (e.g. returns 404 unexpectedly), fall back to list check.
  const quick = await hasUserStarredRepoQuick(env, username, owner, repo);
  if (quick.ok === false) return quick;
  if (quick.ok === true && quick.starred === true) return quick;
  return await hasUserStarredRepoViaList(env, username, owner, repo);
}

async function hasUserStarredRepoQuick(env, username, owner, repo) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "bigbird-worker",
  };
  if (env.GITHUB_API_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_API_TOKEN}`;

  try {
    const url = `https://api.github.com/users/${encodeURIComponent(username)}/starred/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal });

    if (res.status === 204 || res.status === 200) return { ok: true, starred: true };
    // Treat 404 as "unknown" so we can fall back to list check (some environments appear to return 404 incorrectly).
    if (res.status === 404) return { ok: null, starred: false };

    if (!res.ok) {
      const text = await res.text();
      let ghMsg = "";
      try {
        const j = JSON.parse(text);
        if (typeof j?.message === "string") ghMsg = j.message;
      } catch {
        // ignore
      }
      const hint =
        res.status === 403
          ? "（常见原因：GitHub API 限流；建议在 wrangler.toml 里配置 GITHUB_API_TOKEN）"
          : "";
      return { ok: false, starred: false, message: `GitHub 返回 HTTP ${res.status}${ghMsg ? `：${ghMsg}` : ""}${hint}` };
    }

    // Unexpected but treat as unknown and fall back to list.
    return { ok: null, starred: false, message: "" };
  } catch (e) {
    const msg = e?.name === "AbortError" ? "GitHub 请求超时" : (e?.message ?? String(e));
    return { ok: false, starred: false, message: msg };
  } finally {
    clearTimeout(timeout);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function html(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...headers,
    },
  });
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

async function generateInviteCode(env) {
  const apiUrl = env.API_URL;
  if (!apiUrl) return { ok: false, code: null, status: null, message: "缺少 API_URL" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "invitation", count: 1 }),
      signal: controller.signal,
    });

    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      // ignore
    }

    if (!res.ok) {
      const apiMessage = typeof data?.message === "string" ? data.message : "";
      const message = apiMessage || (text ? text.slice(0, 300) : "");
      console.error("invite_api_error", { status: res.status, message });
      return { ok: false, code: null, status: res.status, message: message || "后端接口返回失败" };
    }

    const code = data?.data?.[0]?.code;
    if (typeof code !== "string" || !code) {
      console.error("invite_api_bad_response", { status: res.status, body: text.slice(0, 300) });
      return { ok: false, code: null, status: res.status, message: "后端接口未返回 code" };
    }

    return { ok: true, code, status: res.status, message: "" };
  } catch (e) {
    const msg = e?.name === "AbortError" ? "请求超时" : (e?.message ?? String(e));
    console.error("invite_api_fetch_failed", { message: msg });
    return { ok: false, code: null, status: null, message: msg };
  } finally {
    clearTimeout(timeout);
  }
}

async function generateInviteCodeV2(env) {
  const apiUrl = normalizeUrl(env.API_URL);
  if (!apiUrl) return { ok: false, code: null, status: null, message: "缺少 API_URL" };

  const apiToken = normalizeToken(env.API_TOKEN);
  if (!apiToken) return { ok: false, code: null, status: null, message: "缺少 API_TOKEN" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "invitation", count: 1 }),
      signal: controller.signal,
    });

    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      // ignore
    }

    if (!res.ok) {
      const apiMessage = typeof data?.message === "string" ? data.message : "";
      const apiCode = data?.error?.code || data?.code;
      const message = apiMessage || (text ? text.slice(0, 300) : "");
      console.error("invite_api_error", {
        status: res.status,
        message,
        api_code: apiCode,
        api_url: apiUrl,
        token_len: apiToken.length,
        token_wrapped: isWrapped(env.API_TOKEN),
      });
      return { ok: false, code: null, status: res.status, message: message || "后端接口返回失败" };
    }

    const code = data?.data?.[0]?.code;
    if (typeof code !== "string" || !code) {
      console.error("invite_api_bad_response", { status: res.status, body: text.slice(0, 300) });
      return { ok: false, code: null, status: res.status, message: "后端接口未返回 code" };
    }

    return { ok: true, code, status: res.status, message: "" };
  } catch (e) {
    const msg = e?.name === "AbortError" ? "请求超时" : (e?.message ?? String(e));
    console.error("invite_api_fetch_failed", { message: msg });
    return { ok: false, code: null, status: null, message: msg };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeToken(token) {
  if (typeof token !== "string") return "";
  let t = token.trim();
  if (!t) return "";
  if (t.toLowerCase().startsWith("bearer ")) t = t.slice(7).trim();
  if (isWrapped(t)) t = t.slice(1, -1).trim();
  return t;
}

function normalizeUrl(url) {
  if (typeof url !== "string") return "";
  let u = url.trim();
  if (!u) return "";
  if (isWrapped(u)) u = u.slice(1, -1).trim();
  return u;
}

function isWrapped(value) {
  if (typeof value !== "string" || value.length < 2) return false;
  return (value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'));
}

function normalizeBool(value, defaultValue = false) {
  if (typeof value !== "string") return defaultValue;
  const v = value.trim().toLowerCase();
  if (!v) return defaultValue;
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return defaultValue;
}

function unknownSitesPayload(env) {
  const sites = resolveMonitoredSites(env).map((s) => ({
    name: s.name,
    url: s.url,
    status: "unknown",
    response_time_ms: null,
    http_status: null,
  }));

  return {
    last_checked: null,
    sites,
  };
}

async function handleHealthCheck(request, env) {
  if (!env.STATUS_KV) {
    return json({ error: "server_misconfig", message: "STATUS_KV is not bound." }, 500);
  }
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "1";

  const existing = await env.STATUS_KV.get(STATUS_KV_KEY, { type: "json" });

  if (!refresh) {
    if (existing) return json(existing);
    return json(unknownSitesPayload(env));
  }

  if (existing?.last_checked) {
    const last = Date.parse(existing.last_checked);
    if (Number.isFinite(last) && Date.now() - last < 15_000) return json(existing);
  }

  const payload = await runStatusCheck(env);
  if (payload) return json(payload);
  if (existing) return json(existing);
  return json(unknownSitesPayload(env));
}

function resolveMonitoredSites(env) {
  const raw = env.MONITORED_SITES_JSON ?? env.MONITORED_SITES ?? "";
  const apiUrl = env.API_URL ?? "";

  const substituteUrl = (u) => {
    if (!u) return u;
    if (u === "$API_URL" || u === "__API_URL__") return apiUrl;
    return u;
  };

  const normalize = (list) =>
    list
      .map((s) => ({
        name: typeof s?.name === "string" ? s.name : "",
        url: typeof s?.url === "string" ? substituteUrl(s.url) : "",
      }))
      .filter((s) => Boolean(s.url));

  if (!raw.trim()) return normalize(DEFAULT_MONITORED_SITES);

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return normalize(DEFAULT_MONITORED_SITES);
    const normalized = normalize(parsed);
    return normalized.length ? normalized : normalize(DEFAULT_MONITORED_SITES);
  } catch {
    return normalize(DEFAULT_MONITORED_SITES);
  }
}

async function runStatusCheck(env) {
  if (!env.STATUS_KV) return null;

  const sites = resolveMonitoredSites(env);
  const startedAt = Date.now();
  const results = await Promise.allSettled(sites.map((s) => checkSite(s)));
  const sitesOut = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      name: sites[i]?.name ?? "unknown",
      url: sites[i]?.url ?? "",
      status: "down",
      response_time_ms: null,
      http_status: null,
      error: r.reason?.message ?? String(r.reason),
    };
  });

  const payload = {
    last_checked: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    sites: sitesOut,
  };

  await env.STATUS_KV.put(STATUS_KV_KEY, JSON.stringify(payload));
  return payload;
}

async function checkSite(site) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const startedAt = Date.now();

  try {
    const res = await fetch(site.url, { method: "HEAD", signal: controller.signal });
    const ms = Date.now() - startedAt;
    const ok = res.ok || (res.status >= 200 && res.status < 500);

    return {
      name: site.name,
      url: site.url,
      status: ok ? "up" : "down",
      response_time_ms: ms,
      http_status: res.status,
    };
  } catch (err) {
    const ms = Date.now() - startedAt;
    return {
      name: site.name,
      url: site.url,
      status: "down",
      response_time_ms: ms,
      http_status: null,
      error: err?.name === "AbortError" ? "timeout" : (err?.message ?? String(err)),
    };
  } finally {
    clearTimeout(timeout);
  }
}
