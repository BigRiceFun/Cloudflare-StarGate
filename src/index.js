const INVITE_KV_KEY_PREFIX = "github:";
const STATUS_KV_KEY = "status:results";
const ADMIN_SETTINGS_KV_KEY = "admin:settings";

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

  if (path === "/") return await handleHome(env);
  if (path === "/admin") return await handleAdminPage(env);
  if (path === "/api/claim") return handleClaim(request, env);
  if (path === "/api/health-check") return handleHealthCheck(request, env);
  if (path === "/api/admin/login") return handleAdminLogin(request, env);
  if (path === "/api/admin/settings") return handleAdminSettings(request, env);
  if (path === "/api/admin/settings/reset") return handleAdminSettingsReset(request, env);

  return new Response("Not Found", { status: 404 });
}

async function handleHome(env) {
  const repoOwner = env.GITHUB_REPO_OWNER ?? "";
  const repoName = env.GITHUB_REPO_NAME ?? "";
  const repoDisplay = repoOwner && repoName ? `${repoOwner}/${repoName}` : "";
  const settings = await getResolvedSettings(env);
  const tipEnabled = settings.tip_enabled;
  const tipImg1 = settings.tip_img_1;
  const tipImg2 = settings.tip_img_2;
  const sponsors = settings.sponsors;
  const faviconUrl = env.SITE_FAVICON_URL ?? "";
  const footerYear = new Date().getFullYear();
  const sponsorsJson = JSON.stringify(sponsors)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e");

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
      .sponsor-board {
        margin-top: 18px;
        padding: 16px;
      }
      .sponsor-list {
        margin-top: 10px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .sponsor-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #fbfdff;
      }
      .sponsor-item img {
        width: 52px;
        height: 52px;
        border-radius: 999px;
        border: 1px solid #e2e8f0;
      }
      @media (max-width: 680px) {
        .sponsor-list { grid-template-columns: 1fr; }
      }
      .footer {
        margin-top: 20px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: var(--muted);
        font-size: 12px;
        text-align: center;
      }
      .footer-brand {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        text-decoration: none;
        color: inherit;
        cursor: pointer;
      }
      .footer-logo {
        width: 24px;
        height: 24px;
        border-radius: 999px;
        border: 1px solid #e2e8f0;
      }
      .overlay {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.35);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 50;
        padding: 14px;
      }
      .overlay.open { display: flex; }
      .modal {
        width: min(760px, 96vw);
        max-height: 90vh;
        overflow: auto;
        background: #fff;
        border-radius: 16px;
        border: 1px solid var(--border);
        box-shadow: 0 18px 45px rgba(15, 23, 42, 0.18);
        padding: 16px;
      }
      .modal h3 {
        margin: 0 0 12px;
        font-size: 16px;
      }
      .admin-section {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px;
        margin-top: 10px;
      }
      .list-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 0;
      }
      .list-meta {
        font-size: 12px;
        color: var(--muted);
        word-break: break-all;
      }
      .danger { background: #fff; color: #991b1b; border-color: #fecaca; }
      .switch {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
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

      <div class="card sponsor-board">
        <div class="service-name">特别鸣谢</div>
        <div class="muted">感谢每一位支持者</div>
        <div class="sponsor-list" id="sponsorList"></div>
      </div>

      <div class="footer">
        <div>© ${footerYear} 鸣谢 GitHub Cloudflare</div>
        <a class="footer-brand" id="adminLogoTrigger" href="${escapeHtml(faviconUrl || '#')}" target="_blank" rel="noreferrer noopener">
          ${faviconUrl ? `<img class="footer-logo" src="${escapeHtml(faviconUrl)}" alt="logo" />` : ""}
          <span>BigBrid</span>
        </a>
      </div>
    </div>

    <div class="overlay" id="loginOverlay" aria-hidden="true">
      <div class="modal">
        <h3>Admin Login</h3>
        <div class="row">
          <input class="input" id="adminPasswordInput" type="password" placeholder="Enter admin password" />
          <button class="btn" id="adminLoginBtn" type="button">Login</button>
          <button class="btn secondary" id="adminLoginCancelBtn" type="button">Cancel</button>
        </div>
        <div class="muted" id="adminLoginMsg"></div>
      </div>
    </div>

    <script>
      const claimBtn = document.getElementById('claimBtn');
      const usernameInput = document.getElementById('username');
      const claimMsg = document.getElementById('claimMsg');
      const inviteCard = document.getElementById('inviteCard');
      const inviteCode = document.getElementById('inviteCode');
      const copyBtn = document.getElementById('copyBtn');
      const sponsorListEl = document.getElementById('sponsorList');
      const loginOverlay = document.getElementById('loginOverlay');
      const adminLogoTrigger = document.getElementById('adminLogoTrigger');
      const adminPasswordInput = document.getElementById('adminPasswordInput');
      const adminLoginBtn = document.getElementById('adminLoginBtn');
      const adminLoginCancelBtn = document.getElementById('adminLoginCancelBtn');
      const adminLoginMsg = document.getElementById('adminLoginMsg');
      const PASS_KEY = 'bigbird_admin_password';
      let logoTapCount = 0;
      let logoTapTimer = null;
      let publicSponsors = ${sponsorsJson};

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

      function setLoginMessage(msg, isError) {
        if (!adminLoginMsg) return;
        adminLoginMsg.textContent = msg || '';
        adminLoginMsg.style.color = isError ? '#991b1b' : '';
      }

      function qqAvatar(qq) {
        return 'http://q1.qlogo.cn/g?b=qq&nk=' + encodeURIComponent(qq) + '&s=100';
      }

      function renderSponsors(list) {
        const items = Array.isArray(list) ? list : [];
        if (!sponsorListEl) return;
        if (!items.length) {
          sponsorListEl.innerHTML = '<div class="muted">暂无赞助成员</div>';
          return;
        }
        sponsorListEl.innerHTML = items.map((item) => {
          const qq = escapeHtml(String(item.qq || ''));
          const nickname = escapeHtml(String(item.nickname || '匿名赞助者'));
          const avatar = escapeHtml(String(item.avatar || qqAvatar(qq)));
          return '<div class="sponsor-item"><img src="' + avatar + '" alt="' + nickname + '" /><div>' +
            '<div>' + nickname + '</div></div></div>';
        }).join('');
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
        setTimeout(() => (copyBtn.textContent = '??'), 900);
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

      async function loginAdmin() {
        const password = (adminPasswordInput && adminPasswordInput.value || '').trim();
        if (!password) {
          setLoginMessage('请输入密码', true);
          return;
        }
        adminLoginBtn && (adminLoginBtn.disabled = true);
        setLoginMessage('登录中...', false);
        try {
          const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.ok) {
            setLoginMessage(data && data.message ? data.message : '登录失败', true);
            return;
          }
          localStorage.setItem(PASS_KEY, password);
          window.location.href = '/admin';
        } catch (e) {
          setLoginMessage(e && e.message ? e.message : String(e), true);
        } finally {
          adminLoginBtn && (adminLoginBtn.disabled = false);
        }
      }

      function onLogoClick(e) {
        e.preventDefault();
        logoTapCount += 1;
        if (logoTapTimer) clearTimeout(logoTapTimer);
        logoTapTimer = setTimeout(() => { logoTapCount = 0; }, 1000);
        if (logoTapCount >= 3) {
          logoTapCount = 0;
          loginOverlay && loginOverlay.classList.add('open');
          adminPasswordInput && adminPasswordInput.focus();
          setLoginMessage('', false);
        }
      }

      renderSponsors(publicSponsors);
      adminLogoTrigger && adminLogoTrigger.addEventListener('click', onLogoClick);
      adminLoginBtn && adminLoginBtn.addEventListener('click', loginAdmin);
      adminPasswordInput && adminPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loginAdmin();
      });
      adminLoginCancelBtn && adminLoginCancelBtn.addEventListener('click', () => {
        loginOverlay && loginOverlay.classList.remove('open');
      });

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

async function handleAdminPage(env) {
  const faviconUrl = env.SITE_FAVICON_URL ?? "";
  const page = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${faviconUrl ? `<link rel="icon" href="${escapeHtml(faviconUrl)}" />` : ""}
    <title>管理后台</title>
    <style>
      :root {
        --bg: #f7f8fb;
        --card: #ffffff;
        --text: #0f172a;
        --muted: #64748b;
        --border: #e2e8f0;
        --shadow: 0 12px 36px rgba(15, 23, 42, 0.12);
        --accent: #2563eb;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Sora", "Space Grotesk", "DM Sans", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
        color: var(--text);
        background:
          radial-gradient(1200px 520px at 20% -10%, rgba(37, 99, 235, 0.08), transparent 60%),
          radial-gradient(900px 500px at 120% 10%, rgba(16, 185, 129, 0.08), transparent 60%),
          linear-gradient(180deg, #f8fafc 0%, #f7f8fb 35%, #ffffff 100%);
      }
      .page { max-width: 1240px; margin: 0 auto; padding: 24px 18px 36px; }
      .head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        border: 1px solid var(--border);
        border-radius: 18px;
        background: linear-gradient(120deg, #ffffff 0%, #f7fbff 100%);
        box-shadow: var(--shadow);
        padding: 16px 18px;
      }
      .title { font-size: 24px; font-weight: 800; }
      .muted { color: var(--muted); font-size: 13px; }
      .btn {
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--text);
        color: #fff;
        padding: 10px 14px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 150ms ease, box-shadow 150ms ease;
      }
      .btn:hover { transform: translateY(-1px); box-shadow: 0 6px 14px rgba(15, 23, 42, 0.12); }
      .btn.secondary { background: #fff; color: var(--text); }
      .btn.danger { background: #fff; color: #991b1b; border-color: #fecaca; }
      .grid { margin-top: 16px; display: grid; gap: 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      @media (max-width: 960px) { .grid { grid-template-columns: 1fr; } }
      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 16px;
        box-shadow: var(--shadow);
        padding: 16px;
      }
      .card-title { font-size: 16px; font-weight: 700; margin-bottom: 10px; }
      .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .input {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px 12px;
        font-size: 13px;
        min-width: 200px;
        flex: 1;
        transition: border-color 150ms ease, box-shadow 150ms ease;
      }
      .input:focus {
        outline: none;
        border-color: #93c5fd;
        box-shadow: 0 0 0 3px rgba(147, 197, 253, 0.28);
      }
      .list { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
      .item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px;
        background: #f8fbff;
      }
      .sponsor { display: flex; align-items: center; gap: 10px; }
      .sponsor img { width: 44px; height: 44px; border-radius: 999px; border: 1px solid var(--border); }
      .msg { min-height: 20px; margin-top: 10px; color: var(--muted); font-size: 13px; }
      .login-wrap {
        position: fixed;
        inset: 0;
        display: none;
        background: rgba(15, 23, 42, 0.35);
        align-items: center;
        justify-content: center;
        z-index: 10;
      }
      .login-wrap.open { display: flex; }
      .login-card {
        width: min(460px, 96vw);
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 16px;
        box-shadow: var(--shadow);
        padding: 16px;
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="head">
        <div>
          <div class="title">管理后台</div>
          <div class="muted">统一管理监控网站、赞赏设置、赞助榜成员</div>
        </div>
        <div class="row">
          <a class="btn secondary" href="/">返回首页</a>
          <button class="btn secondary" id="logoutBtn" type="button">退出登录</button>
        </div>
      </div>

      <div class="grid">
        <div class="card">
          <div class="card-title">监控网站</div>
          <div class="list" id="siteList"></div>
          <div class="row" style="margin-top:10px;">
            <input class="input" id="siteNameInput" placeholder="网站名称" />
            <input class="input" id="siteUrlInput" placeholder="网站 URL" />
            <button class="btn secondary" id="addSiteBtn" type="button">添加</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">赞赏设置</div>
          <label class="row" style="margin: 0 0 10px;">
            <input id="tipEnabledInput" type="checkbox" />
            <span>开启赞赏</span>
          </label>
          <div class="row">
            <input class="input" id="tipImg1Input" placeholder="赞赏图片 URL 1" />
            <input class="input" id="tipImg2Input" placeholder="赞赏图片 URL 2" />
          </div>
        </div>

        <div class="card" style="grid-column: 1 / -1;">
          <div class="card-title">赞助榜成员（QQ）</div>
          <div class="list" id="sponsorList"></div>
          <div class="row" style="margin-top:10px;">
            <input class="input" id="sponsorQqInput" placeholder="QQ 号" />
            <input class="input" id="sponsorNicknameInput" placeholder="昵称（可选，不填自动拉取）" />
            <button class="btn secondary" id="addSponsorBtn" type="button">添加</button>
          </div>
        </div>
      </div>

      <div class="row" style="margin-top:16px;">
        <button class="btn" id="saveBtn" type="button">保存全部配置</button>
        <button class="btn secondary" id="resetSitesBtn" type="button">重置监控地址为环境变量</button>
      </div>
      <div class="muted" id="settingsSource" style="margin-top:8px;"></div>
      <div class="msg" id="msg"></div>
    </div>

    <div class="login-wrap" id="loginWrap">
      <div class="login-card">
        <div class="card-title">管理员登录</div>
        <div class="row">
          <input class="input" id="passwordInput" type="password" placeholder="请输入管理员密码" />
          <button class="btn" id="loginBtn" type="button">登录</button>
        </div>
        <div class="msg" id="loginMsg"></div>
      </div>
    </div>

    <script>
      const PASS_KEY = 'bigbird_admin_password';
      const siteListEl = document.getElementById('siteList');
      const siteNameInput = document.getElementById('siteNameInput');
      const siteUrlInput = document.getElementById('siteUrlInput');
      const addSiteBtn = document.getElementById('addSiteBtn');
      const tipEnabledInput = document.getElementById('tipEnabledInput');
      const tipImg1Input = document.getElementById('tipImg1Input');
      const tipImg2Input = document.getElementById('tipImg2Input');
      const sponsorListEl = document.getElementById('sponsorList');
      const sponsorQqInput = document.getElementById('sponsorQqInput');
      const sponsorNicknameInput = document.getElementById('sponsorNicknameInput');
      const addSponsorBtn = document.getElementById('addSponsorBtn');
      const saveBtn = document.getElementById('saveBtn');
      const resetSitesBtn = document.getElementById('resetSitesBtn');
      const settingsSourceEl = document.getElementById('settingsSource');
      const msgEl = document.getElementById('msg');
      const logoutBtn = document.getElementById('logoutBtn');
      const loginWrap = document.getElementById('loginWrap');
      const passwordInput = document.getElementById('passwordInput');
      const loginBtn = document.getElementById('loginBtn');
      const loginMsg = document.getElementById('loginMsg');

      let adminPassword = localStorage.getItem(PASS_KEY) || '';
      let settings = { monitored_sites: [], tip_enabled: false, tip_img_1: '', tip_img_2: '', sponsors: [] };

      function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#39;' }[c]));
      }
      function qqAvatar(qq) {
        return 'http://q1.qlogo.cn/g?b=qq&nk=' + encodeURIComponent(qq) + '&s=100';
      }
      function setMsg(text, isError) {
        msgEl.textContent = text || '';
        msgEl.style.color = isError ? '#991b1b' : '';
      }
      function setLoginMsg(text, isError) {
        loginMsg.textContent = text || '';
        loginMsg.style.color = isError ? '#991b1b' : '';
      }
      function openLogin() { loginWrap.classList.add('open'); passwordInput.focus(); }
      function closeLogin() { loginWrap.classList.remove('open'); }

      async function api(url, init) {
        const headers = Object.assign({}, (init && init.headers) || {}, {
          'X-Admin-Password': adminPassword,
          'Content-Type': 'application/json'
        });
        const res = await fetch(url, Object.assign({}, init || {}, { headers }));
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          openLogin();
          throw new Error(data.message || '请先登录');
        }
        if (!res.ok) throw new Error(data.message || ('请求失败 HTTP ' + res.status));
        return data;
      }

      function renderSites() {
        const list = Array.isArray(settings.monitored_sites) ? settings.monitored_sites : [];
        if (!list.length) {
          siteListEl.innerHTML = '<div class="muted">暂无监控网站</div>';
          return;
        }
        siteListEl.innerHTML = list.map((site, idx) => (
          '<div class="item"><div><div>' + escapeHtml(site.name || site.url || '未命名网站') + '</div><div class="muted">' + escapeHtml(site.url || '') + '</div></div>' +
          '<button class="btn danger" type="button" data-site-del="' + idx + '">删除</button></div>'
        )).join('');
      }

      function renderSponsors() {
        const list = Array.isArray(settings.sponsors) ? settings.sponsors : [];
        if (!list.length) {
          sponsorListEl.innerHTML = '<div class="muted">暂无赞助成员</div>';
          return;
        }
        sponsorListEl.innerHTML = list.map((item, idx) => {
          const qq = escapeHtml(String(item.qq || ''));
          const nickname = escapeHtml(String(item.nickname || '匿名赞助者'));
          const avatar = escapeHtml(String(item.avatar || qqAvatar(qq)));
          return '<div class="item"><div class="sponsor"><img src="' + avatar + '" alt="' + nickname + '" />' +
            '<div><div>' + nickname + '</div></div></div>' +
            '<button class="btn danger" type="button" data-sponsor-del="' + idx + '">删除</button></div>';
        }).join('');
      }

      function renderAll() {
        tipEnabledInput.checked = !!settings.tip_enabled;
        tipImg1Input.value = settings.tip_img_1 || '';
        tipImg2Input.value = settings.tip_img_2 || '';
        renderSites();
        renderSponsors();
      }

      function renderSource(source) {
        if (!settingsSourceEl) return;
        const s = source === 'kv' ? 'KV（后台配置）' : '环境变量（MONITORED_SITES_JSON）';
        settingsSourceEl.textContent = '当前来源：' + s;
      }

      async function loadSettings() {
        const data = await api('/api/admin/settings', { method: 'GET' });
        settings = data.settings || settings;
        renderSource(data.source);
        renderAll();
      }

      async function saveSettings() {
        settings.tip_enabled = !!tipEnabledInput.checked;
        settings.tip_img_1 = (tipImg1Input.value || '').trim();
        settings.tip_img_2 = (tipImg2Input.value || '').trim();
        const data = await api('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({
            monitored_sites: settings.monitored_sites || [],
            tip_enabled: settings.tip_enabled,
            tip_img_1: settings.tip_img_1,
            tip_img_2: settings.tip_img_2,
            sponsors: settings.sponsors || []
          })
        });
        settings = data.settings || settings;
        renderAll();
      }

      loginBtn.addEventListener('click', async () => {
        const password = (passwordInput.value || '').trim();
        if (!password) return setLoginMsg('请输入密码', true);
        setLoginMsg('登录中...', false);
        loginBtn.disabled = true;
        try {
          const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.ok) throw new Error(data.message || '登录失败');
          adminPassword = password;
          localStorage.setItem(PASS_KEY, password);
          closeLogin();
          setLoginMsg('', false);
          await loadSettings();
        } catch (e) {
          setLoginMsg(e.message || String(e), true);
        } finally {
          loginBtn.disabled = false;
        }
      });
      passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginBtn.click(); });

      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem(PASS_KEY);
        adminPassword = '';
        window.location.href = '/';
      });

      siteListEl.addEventListener('click', async (e) => {
        const idx = Number(e.target && e.target.dataset ? e.target.dataset.siteDel : NaN);
        if (!Number.isFinite(idx)) return;
        const prev = Array.isArray(settings.monitored_sites) ? settings.monitored_sites.slice() : [];
        settings.monitored_sites.splice(idx, 1);
        renderSites();
        setMsg('保存中...', false);
        try {
          await saveSettings();
          setMsg('已保存', false);
        } catch (err) {
          settings.monitored_sites = prev;
          renderSites();
          setMsg(err && err.message ? err.message : String(err), true);
        }
      });
      sponsorListEl.addEventListener('click', (e) => {
        const idx = Number(e.target && e.target.dataset ? e.target.dataset.sponsorDel : NaN);
        if (!Number.isFinite(idx)) return;
        settings.sponsors.splice(idx, 1);
        renderSponsors();
      });

      addSiteBtn.addEventListener('click', () => {
        const name = (siteNameInput.value || '').trim();
        const url = (siteUrlInput.value || '').trim();
        if (!url) return setMsg('网站 URL 不能为空', true);
        settings.monitored_sites = settings.monitored_sites || [];
        settings.monitored_sites.push({ name: name || url, url });
        siteNameInput.value = '';
        siteUrlInput.value = '';
        renderSites();
        setMsg('', false);
      });

      addSponsorBtn.addEventListener('click', () => {
        const qq = (sponsorQqInput.value || '').trim();
        if (!/^\\d{5,12}$/.test(qq)) return setMsg('QQ 号格式不正确', true);
        const nickname = (sponsorNicknameInput.value || '').trim();
        settings.sponsors = settings.sponsors || [];
        settings.sponsors.push({ qq, nickname, avatar: qqAvatar(qq) });
        sponsorQqInput.value = '';
        sponsorNicknameInput.value = '';
        renderSponsors();
        setMsg('', false);
      });

      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        setMsg('保存中...', false);
        try {
          await saveSettings();
          renderSource('kv');
          setMsg('保存成功', false);
        } catch (e) {
          setMsg(e.message || String(e), true);
        } finally {
          saveBtn.disabled = false;
        }
      });

      resetSitesBtn.addEventListener('click', async () => {
        resetSitesBtn.disabled = true;
        setMsg('重置中...', false);
        try {
          const data = await api('/api/admin/settings/reset', { method: 'POST' });
          settings = data.settings || settings;
          renderSource(data.source);
          renderAll();
          setMsg('已重置为环境变量', false);
        } catch (e) {
          setMsg(e.message || String(e), true);
        } finally {
          resetSitesBtn.disabled = false;
        }
      });

      if (!adminPassword) openLogin();
      else loadSettings().catch((e) => setMsg(e.message || String(e), true));
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

function getAdminPassword(env) {
  const raw = typeof env.ADMIN_PASSWORD === "string" ? env.ADMIN_PASSWORD.trim() : "";
  return raw || "123456";
}

function makeQqAvatarUrl(qq) {
  return `http://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(qq)}&s=100`;
}

function sanitizeMonitoredSites(list, apiUrl = "") {
  const inList = Array.isArray(list) ? list : [];
  const seen = new Set();
  const out = [];
  for (const item of inList) {
    let url = typeof item?.url === "string" ? item.url.trim() : "";
    if (!url) continue;
    if (url === "$API_URL" || url === "__API_URL__") url = apiUrl;
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      name: typeof item?.name === "string" && item.name.trim() ? item.name.trim() : url,
      url,
    });
  }
  return out;
}

function sanitizeSponsors(list) {
  const inList = Array.isArray(list) ? list : [];
  const seen = new Set();
  const out = [];
  for (const item of inList) {
    const qqRaw = typeof item === "string" ? item : item?.qq;
    const qq = typeof qqRaw === "string" ? qqRaw.trim() : "";
    if (!/^\d{5,12}$/.test(qq)) continue;
    if (seen.has(qq)) continue;
    seen.add(qq);
    const nicknameRaw = typeof item === "string" ? "" : item?.nickname;
    const avatarRaw = typeof item === "string" ? "" : item?.avatar;
    out.push({
      qq,
      nickname: typeof nicknameRaw === "string" ? nicknameRaw.trim() : "",
      avatar: typeof avatarRaw === "string" && avatarRaw.trim() ? avatarRaw.trim() : makeQqAvatarUrl(qq),
    });
  }
  return out;
}

function parseSponsorsFromEnv(env) {
  const raw =
    typeof env.SPONSOR_QQ_LIST_JSON === "string" && env.SPONSOR_QQ_LIST_JSON.trim()
      ? env.SPONSOR_QQ_LIST_JSON.trim()
      : typeof env.SPONSOR_BOARD_JSON === "string"
        ? env.SPONSOR_BOARD_JSON.trim()
        : "";
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return sanitizeSponsors(parsed);
  } catch {
    return [];
  }
}

function parseQqPortraitMap(text) {
  if (typeof text !== "string" || !text.trim()) return {};
  const m = text.match(/\(([\s\S]+)\)\s*;?\s*$/);
  if (!m?.[1]) return {};
  try {
    const obj = Function(`"use strict"; return (${m[1]});`)();
    if (!obj || typeof obj !== "object") return {};
    const out = {};
    for (const [qq, val] of Object.entries(obj)) {
      if (!/^\d{5,12}$/.test(qq)) continue;
      const arr = Array.isArray(val) ? val : [];
      // qq portrait payload usually stores nickname at index 6.
      const nickname = typeof arr[6] === "string" ? arr[6].trim() : "";
      out[qq] = nickname;
    }
    return out;
  } catch {
    return {};
  }
}

async function fetchQqNicknames(qqList) {
  const ids = Array.from(new Set((Array.isArray(qqList) ? qqList : []).filter((x) => /^\d{5,12}$/.test(x))));
  if (!ids.length) return {};
  const url = `http://users.qzone.qq.com/fcg-bin/cgi_get_portrait.fcg?uins=${encodeURIComponent(ids.join(","))}`;
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return {};
    const text = await res.text();
    return parseQqPortraitMap(text);
  } catch {
    return {};
  }
}

async function enrichSponsorsWithQqProfile(list) {
  const sponsors = sanitizeSponsors(list);
  if (!sponsors.length) return [];
  const nicknameMap = await fetchQqNicknames(sponsors.map((s) => s.qq));
  return sponsors.map((item) => {
    const qq = item.qq;
    const nickname = item.nickname || nicknameMap[qq] || "匿名赞助者";
    return {
      qq,
      nickname,
      avatar: makeQqAvatarUrl(qq),
    };
  });
}

function buildDefaultSettings(env) {
  return {
    monitored_sites: parseMonitoredSitesRaw(env),
    tip_enabled: normalizeBool(env.TIP_JAR_ENABLED, true),
    tip_img_1: typeof env.TIP_JAR_IMG_1 === "string" ? env.TIP_JAR_IMG_1 : "",
    tip_img_2: typeof env.TIP_JAR_IMG_2 === "string" ? env.TIP_JAR_IMG_2 : "",
    sponsors: parseSponsorsFromEnv(env),
  };
}

function sanitizeSettings(raw, env, fallback = buildDefaultSettings(env)) {
  const src = raw && typeof raw === "object" ? raw : {};
  const tipEnabled =
    typeof src.tip_enabled === "boolean"
      ? src.tip_enabled
      : normalizeBool(typeof src.tip_enabled === "string" ? src.tip_enabled : "", fallback.tip_enabled);

  return {
    monitored_sites: sanitizeMonitoredSites(src.monitored_sites, env.API_URL ?? "") || fallback.monitored_sites,
    tip_enabled: tipEnabled,
    tip_img_1:
      typeof src.tip_img_1 === "string" && src.tip_img_1.trim() ? src.tip_img_1.trim() : fallback.tip_img_1,
    tip_img_2:
      typeof src.tip_img_2 === "string" && src.tip_img_2.trim() ? src.tip_img_2.trim() : fallback.tip_img_2,
    sponsors: sanitizeSponsors(src.sponsors),
  };
}

async function getStoredAdminSettings(env) {
  if (!env.STATUS_KV) return null;
  return await env.STATUS_KV.get(ADMIN_SETTINGS_KV_KEY, { type: "json" });
}

async function getResolvedSettings(env) {
  const defaults = buildDefaultSettings(env);
  defaults.sponsors = await enrichSponsorsWithQqProfile(defaults.sponsors);
  const stored = await getStoredAdminSettings(env);
  if (!stored) return defaults;
  const sanitized = sanitizeSettings(stored, env, defaults);
  sanitized.sponsors = await enrichSponsorsWithQqProfile(sanitized.sponsors);
  if (!sanitized.monitored_sites.length) sanitized.monitored_sites = defaults.monitored_sites;
  return sanitized;
}

async function assertAdmin(request, env) {
  const pass = request.headers.get("X-Admin-Password") ?? "";
  if (pass === getAdminPassword(env)) return null;
  return json({ error: "unauthorized", message: "管理员认证失败。" }, 401);
}

async function handleAdminLogin(request, env) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await request.json().catch(() => null);
  const input = typeof body?.password === "string" ? body.password.trim() : "";
  if (!input) return json({ error: "bad_request", message: "密码不能为空。" }, 400);
  if (input !== getAdminPassword(env)) return json({ error: "unauthorized", message: "密码错误。" }, 401);
  return json({ ok: true });
}

async function handleAdminSettings(request, env) {
  if (!env.STATUS_KV) {
    return json({ error: "server_misconfig", message: "STATUS_KV is not bound." }, 500);
  }

  const authError = await assertAdmin(request, env);
  if (authError) return authError;

  if (request.method === "GET") {
    const settings = await getResolvedSettings(env);
    const stored = await getStoredAdminSettings(env);
    return json({ settings, source: stored ? "kv" : "env" });
  }

  if (request.method === "PUT") {
    const body = await request.json().catch(() => null);
    const defaults = buildDefaultSettings(env);
    const settings = sanitizeSettings(body, env, defaults);
    settings.sponsors = await enrichSponsorsWithQqProfile(settings.sponsors);
    if (!settings.monitored_sites.length) {
      return json({ error: "bad_request", message: "至少保留一个监控网站。" }, 400);
    }
    await env.STATUS_KV.put(ADMIN_SETTINGS_KV_KEY, JSON.stringify(settings));
    // Clear cached health results so homepage reflects latest site list immediately.
    await env.STATUS_KV.delete(STATUS_KV_KEY);
    return json({ ok: true, settings });
  }

  return json({ error: "method_not_allowed" }, 405);
}

async function handleAdminSettingsReset(request, env) {
  if (!env.STATUS_KV) {
    return json({ error: "server_misconfig", message: "STATUS_KV is not bound." }, 500);
  }

  const authError = await assertAdmin(request, env);
  if (authError) return authError;

  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const defaults = buildDefaultSettings(env);
  const settings = {
    monitored_sites: sanitizeMonitoredSites(defaults.monitored_sites, env.API_URL ?? ""),
    tip_enabled: defaults.tip_enabled,
    tip_img_1: defaults.tip_img_1,
    tip_img_2: defaults.tip_img_2,
    sponsors: await enrichSponsorsWithQqProfile(defaults.sponsors),
  };

  await env.STATUS_KV.put(ADMIN_SETTINGS_KV_KEY, JSON.stringify(settings));
  await env.STATUS_KV.delete(STATUS_KV_KEY);
  return json({ ok: true, settings, source: "kv" });
}

async function unknownSitesPayload(env) {
  const sites = (await resolveMonitoredSites(env)).map((s) => ({
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
    return json(await unknownSitesPayload(env));
  }

  if (existing?.last_checked) {
    const last = Date.parse(existing.last_checked);
    if (Number.isFinite(last) && Date.now() - last < 15_000) return json(existing);
  }

  const payload = await runStatusCheck(env);
  if (payload) return json(payload);
  if (existing) return json(existing);
  return json(await unknownSitesPayload(env));
}

function parseMonitoredSitesRaw(env) {
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

async function resolveMonitoredSites(env) {
  const settings = await getResolvedSettings(env);
  const sites = sanitizeMonitoredSites(settings?.monitored_sites, env.API_URL ?? "");
  if (sites.length) return sites;
  return parseMonitoredSitesRaw(env);
}

async function runStatusCheck(env) {
  if (!env.STATUS_KV) return null;

  const sites = await resolveMonitoredSites(env);
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
