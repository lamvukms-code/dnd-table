// Open the table's pages in a real (headless) Chrome against a running server — the real one, with
// its security headers — and fail on anything the browser blocked or could not load: CSP
// violations, failed requests, uncaught errors. A control case on each page loads a script from
// an outside CDN on purpose; if that is NOT reported, the check itself is broken and it says so.
//
//   node client/scripts/check-pages.mjs [baseUrl]        (default http://127.0.0.1:8787)
//
// Pages: "/" plus every client/dist/campaign/*.html (or PAGES_DIR). Needs Chrome installed.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const here = dirname(fileURLToPath(import.meta.url));
const campaignDir = process.env.PAGES_DIR ?? join(here, '..', 'dist', 'campaign');
const pages = ['/', ...(existsSync(campaignDir) ? readdirSync(campaignDir).filter((f) => f.endsWith('.html')).map((f) => `/campaign/${f}`) : [])];

const chromePath = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && existsSync(p));
if (!chromePath) {
  console.error('Không tìm thấy Chrome (đặt biến CHROME=đường dẫn).');
  process.exit(2);
}

const port = 9400 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), 'dnd-check-'));
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(200);
  }
  throw new Error('Chrome không mở được cổng điều khiển');
}

let failed = false;
try {
  const ws = new WebSocket((await target()).webSocketDebuggerUrl);
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method) events.push(msg);
  };
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__blocked = []; document.addEventListener('securitypolicyviolation', (e) => window.__blocked.push(e.violatedDirective + ' ← ' + (e.blockedURI || 'inline')));`,
  });

  for (const path of pages) {
    events.length = 0;
    await send('Page.navigate', { url: base + path });
    await sleep(3500);
    const problems = [];
    for (const v of (await evalJs('window.__blocked')) ?? []) problems.push(`CSP chặn: ${v}`);
    const urls = new Map(events.filter((e) => e.method === 'Network.requestWillBeSent').map((e) => [e.params.requestId, e.params.request.url]));
    for (const e of events) {
      if (e.method === 'Network.loadingFailed' && !e.params.canceled && e.params.blockedReason !== 'csp')
        problems.push(`Không tải được: ${urls.get(e.params.requestId) ?? '?'} (${e.params.errorText})`);
      if (e.method === 'Network.responseReceived' && e.params.response.status >= 400 && !/\/(ws|socket)/.test(e.params.response.url))
        problems.push(`HTTP ${e.params.response.status}: ${e.params.response.url}`);
      // a missing file comes back as the app's index.html (SPA fallback): 200, but HTML where a script / style / font belongs
      if (e.method === 'Network.responseReceived' && ['Script', 'Stylesheet', 'Font'].includes(e.params.type) && /text\/html/.test(e.params.response.mimeType))
        problems.push(`File thiếu (server trả trang HTML thay cho ${e.params.type}): ${e.params.response.url}`);
      if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error' && e.params.entry.source !== 'network')
        problems.push(`Trình duyệt báo lỗi: ${e.params.entry.text.slice(0, 200)}`);
      if (e.method === 'Runtime.exceptionThrown') problems.push(`Lỗi JS: ${e.params.exceptionDetails.exception?.description?.split('\n')[0] ?? e.params.exceptionDetails.text}`);
    }
    // control: an outside script must be reported, or this check can't see CSP at all
    const control = await evalJs(`new Promise((r) => { const n = window.__blocked.length; const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/left-pad@1.3.0/index.js'; document.head.appendChild(s); setTimeout(() => r(window.__blocked.length > n), 1500); })`);
    const ok = problems.length === 0;
    if (!ok || !control) failed = true;
    console.log(`${ok ? '✓' : '✗'} ${path}${control ? '' : '  — ⚠ ca đối chứng KHÔNG bị bắt: phép kiểm hỏng, đừng tin kết quả'}`);
    for (const p of problems) console.log(`    ${p}`);
  }
  ws.close();
} catch (e) {
  console.error('Lỗi khi kiểm:', e.message);
  failed = true;
} finally {
  chrome.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
}
process.exit(failed ? 1 : 0);
