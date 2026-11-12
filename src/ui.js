// dsh-mail 极简收件箱 UI
// 单文件内嵌在 Worker 里，读 /api/messages 渲染

export const UI_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>dsh-mail · 收件箱</title>
<style>
  :root { --bg:#0e1116; --panel:#161b22; --line:#232b36; --ink:#e6edf3; --dim:#7d8590; --accent:#3b82f6; --green:#2ea043; --warn:#d29922; }
  * { box-sizing:border-box; }
  body { margin:0; font:14px/1.6 -apple-system,"Segoe UI","Noto Sans CJK SC",sans-serif; background:var(--bg); color:var(--ink); }
  header { display:flex; align-items:center; gap:12px; padding:14px 20px; border-bottom:1px solid var(--line); background:var(--panel); position:sticky; top:0; z-index:10; }
  h1 { margin:0; font-size:16px; font-weight:600; letter-spacing:.3px; }
  .to-select { background:#0d1117; color:var(--ink); border:1px solid var(--line); border-radius:6px; padding:5px 10px; font-size:13px; }
  .spacer { flex:1; }
  button { background:var(--panel); color:var(--ink); border:1px solid var(--line); border-radius:6px; padding:6px 12px; cursor:pointer; font-size:13px; }
  button:hover { border-color:var(--accent); color:var(--accent); }
  button:disabled { opacity:.5; cursor:default; }
  main { display:flex; height:calc(100vh - 57px); }
  .list { width:340px; min-width:260px; border-right:1px solid var(--line); overflow-y:auto; }
  .item { padding:12px 16px; border-bottom:1px solid var(--line); cursor:pointer; }
  .item:hover { background:#1c2330; }
  .item.active { background:#1f2937; border-left:3px solid var(--accent); }
  .item .subj { font-weight:600; font-size:13px; margin-bottom:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .item .from { color:var(--dim); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .item .time { color:#4b5563; font-size:11px; margin-top:2px; }
  .item .code { display:inline-block; background:var(--green); color:#fff; font:600 12px/1 monospace; padding:3px 7px; border-radius:4px; margin-top:5px; letter-spacing:1px; }
  .view { flex:1; overflow-y:auto; padding:24px 32px; }
  .empty { color:var(--dim); text-align:center; padding-top:80px; }
  .meta { border-bottom:1px solid var(--line); padding-bottom:14px; margin-bottom:18px; }
  .meta h2 { margin:0 0 8px; font-size:18px; }
  .meta .row { color:var(--dim); font-size:12.5px; }
  .meta .row b { color:var(--ink); font-weight:500; }
  pre { white-space:pre-wrap; word-break:break-word; font:13px/1.7 "SF Mono",Consolas,monospace; color:#c9d1d9; margin:0; }
  .banner { background:var(--warn); color:#000; padding:8px 16px; font-size:13px; text-align:center; }
  .status { color:var(--dim); font-size:12px; }
  iframe { width:100%; height:70vh; border:1px solid var(--line); border-radius:6px; background:#fff; }
  /* 登录页 */
  .login-wrap { display:flex; align-items:center; justify-content:center; height:calc(100vh - 57px); }
  .login-box { width:320px; padding:28px; background:var(--panel); border:1px solid var(--line); border-radius:12px; }
  .login-box h2 { margin:0 0 6px; font-size:17px; }
  .login-box p { margin:0 0 18px; color:var(--dim); font-size:12.5px; }
  .login-box input { width:100%; padding:10px 12px; background:#0d1117; color:var(--ink); border:1px solid var(--line); border-radius:6px; font-size:14px; margin-bottom:12px; }
  .login-box input:focus { outline:none; border-color:var(--accent); }
  .login-box button { width:100%; padding:10px; background:var(--accent); color:#fff; border:none; border-radius:6px; font-size:14px; font-weight:500; cursor:pointer; }
  .login-box button:hover { background:#2563eb; }
  .login-box button:disabled { opacity:.6; cursor:default; }
  .login-err { color:#f85149; font-size:12.5px; margin-top:10px; min-height:18px; }
</style>
</head>
<body>
<div id="app" style="display:none">
<header>
  <h1>📬 dsh-mail</h1>
  <select class="to-select" id="mailbox">
    <option value="bot@goodloop.si">bot@goodloop.si</option>
    <option value="verify@goodloop.si">verify@goodloop.si</option>
    <option value="__all__">全部邮件</option>
  </select>
  <span class="status" id="status"></span>
  <div class="spacer"></div>
  <button id="refresh">刷新</button>
</header>
<main>
  <div class="list" id="list"><div class="empty">加载中…</div></div>
  <div class="view" id="view"><div class="empty">← 从左侧选择一封邮件</div></div>
</main>
</div>

<div id="login" class="login-wrap">
  <div class="login-box">
    <h2>📬 dsh-mail</h2>
    <p>请输入访问密码</p>
    <input type="password" id="pwd" placeholder="密码" autocomplete="current-password">
    <button id="loginBtn">登录</button>
    <div class="login-err" id="loginErr"></div>
  </div>
</div>

<script>
const $ = (id) => document.getElementById(id);
let messages = [], current = null;

// 从 URL hash 或 localStorage 取 token，避免写死在页面里
function getToken() {
  // 兼容旧的 hash token 方式（一次性迁移到 localStorage）
  const m = location.hash.match(/token=([^&]+)/);
  if (m) { localStorage.setItem('dsh_token', m[1]); history.replaceState(null,'','/'); return m[1]; }
  return localStorage.getItem('dsh_token') || '';
}

function showApp() {
  $('login').style.display = 'none';
  $('app').style.display = 'block';
}

function showLogin(msg) {
  $('app').style.display = 'none';
  $('login').style.display = 'flex';
  if (msg) $('loginErr').textContent = msg;
}

async function doLogin() {
  const pwd = $('pwd').value;
  if (!pwd) { $('loginErr').textContent = '请输入密码'; return; }
  $('loginBtn').disabled = true;
  $('loginErr').textContent = '';
  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
    });
    const d = await r.json();
    if (d.ok && d.token) {
      localStorage.setItem('dsh_token', d.token);
      $('pwd').value = '';
      showApp();
      load();
    } else if (r.status === 429) {
      $('loginErr').textContent = '尝试次数过多，请稍后再试';
    } else {
      $('loginErr').textContent = '密码错误';
    }
  } catch (e) {
    $('loginErr').textContent = '网络错误，请重试';
  } finally {
    $('loginBtn').disabled = false;
  }
}

async function api(path) {
  const token = getToken();
  if (!token) throw new Error('NO_TOKEN');
  const r = await fetch(path, { headers: { Authorization: 'Bearer ' + token } });
  if (r.status === 401) throw new Error('UNAUTHORIZED');
  return r.json();
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function extractCode(subject = '', text = '') {
  const hay = subject + '\\n' + text;
  const pats = [
    /(?:验证码|校验码|确认码|verification code|security code|code)[^0-9A-Z]{0,20}([0-9]{4,8})/i,
    /\\b([0-9]{6})\\b/, /\\b([0-9]{4,8})\\b/
  ];
  for (const p of pats) { const m = hay.match(p); if (m) return m[1]; }
  return null;
}

function fmtTime(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return s.slice(0,16);
  const now = new Date(), diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff/60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff/3600) + ' 小时前';
  return (d.getMonth()+1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function renderList() {
  const el = $('list');
  if (!messages.length) { el.innerHTML = '<div class="empty">收件箱是空的</div>'; return; }
  el.innerHTML = messages.map((m, i) => {
    const code = extractCode(m.subject, m.text);
    return '<div class="item" data-i="' + i + '">' +
      '<div class="subj">' + esc(m.subject || '(无主题)') + '</div>' +
      '<div class="from">' + esc(m.fromName || m.from || '未知发件人') + '</div>' +
      '<div class="time">' + esc(fmtTime(m.date || m.receivedAt)) + '</div>' +
      (code ? '<span class="code">' + esc(code) + '</span>' : '') +
    '</div>';
  }).join('');
  el.querySelectorAll('.item').forEach(n => n.onclick = () => show(Number(n.dataset.i)));
}

function show(i) {
  current = i;
  document.querySelectorAll('.item').forEach(n => n.classList.toggle('active', Number(n.dataset.i) === i));
  const m = messages[i];
  const code = extractCode(m.subject, m.text);
  const isHtml = m.html && m.html.length > 40;
  $('view').innerHTML =
    '<div class="meta">' +
      '<h2>' + esc(m.subject || '(无主题)') + '</h2>' +
      '<div class="row">发件人：<b>' + esc(m.fromName ? m.fromName + ' <' + m.from + '>' : m.from || '-') + '</b></div>' +
      '<div class="row">收件人：<b>' + esc(m.to) + '</b> · 时间：<b>' + esc(m.date || m.receivedAt) + '</b></div>' +
      (code ? '<div class="row" style="margin-top:8px">验证码：<span class="code">' + esc(code) + '</span> <button onclick="navigator.clipboard.writeText(\\'' + esc(code) + '\\')">复制</button></div>' : '') +
    '</div>' +
    (isHtml
      ? '<iframe sandbox srcdoc="' + esc(m.html).replace(/"/g,'&quot;') + '"></iframe>'
      : '<pre>' + esc(m.text || '(无正文)') + '</pre>');
}

async function load() {
  $('status').textContent = '加载中…';
  const box = $('mailbox').value;
  try {
    const q = box === '__all__' ? '/api/messages?all=1&limit=50' : '/api/messages?to=' + encodeURIComponent(box) + '&limit=50';
    const d = await api(q);
    messages = d.messages || [];
    $('status').textContent = messages.length + ' 封';
    renderList();
    $('view').innerHTML = '<div class="empty">← 从左侧选择一封邮件</div>';
  } catch (e) {
    if (e.message === 'NO_TOKEN') {
      showLogin('');
    } else if (e.message === 'UNAUTHORIZED') {
      localStorage.removeItem('dsh_token');
      showLogin('登录已过期，请重新登录');
    } else {
      $('status').textContent = '加载失败';
      $('view').innerHTML = '<div class="empty">加载失败：' + esc(e.message) + '</div>';
    }
  }
}

$('refresh').onclick = load;
$('mailbox').onchange = load;
$('loginBtn').onclick = doLogin;
$('pwd').onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };

// 启动：有 token 直接进，没有则显示登录页
if (getToken()) {
  showApp();
  load();
  setInterval(load, 30000);
} else {
  showLogin('');
  setTimeout(() => $('pwd')?.focus(), 100);
}
</script>
</body>
</html>`
