/**
 * CRM Monitor Server — замена статического `serve`.
 *
 * Одновременно:
 *  1) раздаёт собранный фронтенд из dist/ (SPA-fallback на index.html);
 *  2) предоставляет защищённые API-эндпоинты мониторинга сервера
 *     (статус PM2, логи приложения и Nginx, перезапуск, срок SSL-сертификата)
 *     для встроенного раздела «Сервер» в CRM (только главный администратор).
 *
 * Безопасность:
 *  - каждый запрос к /api/* требует Supabase JWT вызывающего и роль admin
 *    (проверка через auth.getUser + таблицу profiles, сервисный ключ
 *    живёт только на сервере в .env и никогда не уходит в браузер);
 *  - перезапуск ограничен rate limit (3 раза в минуту);
 *  - логи читаются только из фиксированного списка файлов (нет path traversal);
 *  - эндпоинты доступны только с того же origin (проверка Host/Referer не
 *    требуется — токен нельзя подделать, CORS на API не настраиваем вовсе,
 *    браузер шлёт same-origin запросы без preflight).
 *
 * Запуск:  pm2 start server/monitor-server.js --name crm
 * Порт:    PORT (default 3000). Nginx проксирует на 127.0.0.1:PORT.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

// ── Конфигурация из .env (простейший парсер, без зависимостей) ──
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const PORT = parseInt(process.env.PORT || '3000', 10);
const DIST = path.join(__dirname, '..', 'dist');
const PM2_APP_NAME = process.env.PM2_APP_NAME || 'crm';
const LOG_DIR = process.env.PM2_LOG_DIR || path.join(os.homedir(), '.pm2', 'logs');
const NGINX_ERROR_LOG = process.env.NGINX_ERROR_LOG || '/var/log/nginx/error.log';
const NGINX_ACCESS_LOG = process.env.NGINX_ACCESS_LOG || '/var/log/nginx/access.log';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

// ── Мини-клиент Supabase через fetch (Node 18+, без npm-зависимостей) ──
async function supabaseRest(pathname, { method = 'GET', token, body } = {}) {
  const headers = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (SUPABASE_SERVICE_KEY) headers.Authorization = `Bearer ${SUPABASE_SERVICE_KEY}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1${pathname}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`Supabase REST ${res.status}`);
  return res.json();
}

/** Проверяет: запрос от активного администратора CRM. */
async function verifyAdmin(req) {
  if (!SUPABASE_URL) return { ok: false, error: 'Supabase не настроен на сервере' };
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false, error: 'Нет токена авторизации' };
  // 1) валидность JWT через GoTrue
  const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!ures.ok) return { ok: false, error: 'Токен недействителен' };
  const { id } = await ures.json();
  // 2) роль из profiles (service key — только серверная сторона)
  if (!SUPABASE_SERVICE_KEY) return { ok: false, error: 'На сервере не задан SUPABASE_SERVICE_ROLE_KEY' };
  const rows = await supabaseRest(`/profiles?select=role&id=eq.${id}`, {});
  if (!rows[0] || rows[0].role !== 'admin') return { ok: false, error: 'Требуется роль администратора' };
  return { ok: true };
}

// ── Утилиты ──
function run(cmd, args = []) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 15000 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code ?? 1 : 0, stdout, stderr: String(stderr).slice(0, 2000) });
    });
  });
}
function tailFile(file, lines = 100) {
  return new Promise((resolve) => {
    fs.readFile(file, 'utf8', (err, data) => {
      if (err) return resolve({ file, error: `Не удалось прочитать: ${err.code}` });
      const arr = data.split('\n').filter(Boolean);
      resolve({ file, lines: arr.slice(-Math.min(lines, 1000)) });
    });
  });
}
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

// rate limit для /api/restart
const restartHits = [];
function restartLimited() {
  const now = Date.now();
  while (restartHits.length && now - restartHits[0] > 60000) restartHits.shift();
  if (restartHits.length >= 3) return true;
  restartHits.push(now);
  return false;
}

// ── API ──
async function handleApi(req, res, url) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return json(res, 403, { error: auth.error });

  if (url.pathname === '/api/health' && req.method === 'GET') {
    const mem = process.memoryUsage();
    return json(res, 200, {
      ok: true,
      serverTime: new Date().toISOString(),
      uptimeSec: Math.floor(process.uptime()),
      loadAvg: os.loadavg().map(n => Math.round(n * 100) / 100),
      memory: { usedMb: Math.round(mem.rss / 1048576), totalMb: Math.round(os.totalmem() / 1048576), freeMb: Math.round(os.freemem() / 1048576) },
      platform: `${os.type()} ${os.release()}`,
      node: process.version,
    });
  }

  if (url.pathname === '/api/processes' && req.method === 'GET') {
    const r = await run('pm2', ['jlist']);
    if (r.code !== 0) return json(res, 502, { error: 'pm2 недоступен', detail: r.stderr });
    try { return json(res, 200, { processes: JSON.parse(r.stdout) }); }
    catch { return json(res, 502, { error: 'Неожиданный ответ pm2' }); }
  }

  if (url.pathname === '/api/logs' && req.method === 'GET') {
    const source = url.searchParams.get('source') || 'app';
    const lines = parseInt(url.searchParams.get('lines') || '100', 10);
    if (source === 'app') {
      const out = await tailFile(path.join(LOG_DIR, `${PM2_APP_NAME}-out.log`), lines);
      const err = await tailFile(path.join(LOG_DIR, `${PM2_APP_NAME}-error.log`), lines);
      return json(res, 200, { stdout: out, stderr: err });
    }
    if (source === 'nginx') {
      const err = await tailFile(NGINX_ERROR_LOG, lines);
      const acc = await tailFile(NGINX_ACCESS_LOG, Math.min(lines, 50));
      return json(res, 200, { errorLog: err, accessLog: acc });
    }
    return json(res, 400, { error: 'Неизвестный источник логов' });
  }

  if (url.pathname === '/api/restart' && req.method === 'POST') {
    if (restartLimited()) return json(res, 429, { error: 'Слишком часто: максимум 3 перезапуска в минуту' });
    const r = await run('pm2', ['restart', PM2_APP_NAME]);
    return json(res, r.code === 0 ? 200 : 502, { ok: r.code === 0, detail: (r.stdout + r.stderr).slice(0, 1000) });
  }

  if (url.pathname === '/api/ssl' && req.method === 'GET') {
    const r = await run('certbot', ['certificates']);
    return json(res, 200, { raw: r.stdout, code: r.code });
  }

  json(res, 404, { error: 'Неизвестный эндпоинт' });
}

// ── Статика (SPA) ──
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' };
function serveStatic(req, res, url) {
  let filePath = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  if (!filePath.startsWith(DIST)) { res.writeHead(403); return res.end('Forbidden'); }
  if (url.pathname === '/' || !path.extname(filePath)) filePath = path.join(DIST, 'index.html');
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    serveStatic(req, res, url);
  } catch (e) {
    json(res, 500, { error: 'Внутренняя ошибка сервера' });
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`CRM monitor server: http://127.0.0.1:${PORT}`));
