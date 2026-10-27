/* Cloudflare Worker for the Weekly Department Dashboard.
   - Serves the dashboard (static file) and a small JSON API under /api/* backed by the D1 database bound as DB.
   - Sign-in: built-in email + password accounts (secret USERS) with a signed, HttpOnly session cookie; Cloudflare Access is also
     accepted if ACCESS_TEAM / ACCESS_AUD are set. Nothing under /api works without a valid sign-in (closed by default).
   - Secrets (Workers → Settings → Variables and secrets):
       USERS          one account per line:  email|password|admin   or   email|password|view   (admins can upload / delete / restore)
       SESSION_SECRET a long random string that signs the session cookies
       ADMINS, ACCESS_TEAM, ACCESS_AUD   optional, only when Cloudflare Access is used instead
     DEV_OPEN=1 switches the check off for local testing only. */

const STORES = new Set(['datasets', 'templates', 'history']);
const WEEK_RE = /^\d{4}-\d\d-\d\d$/;
const MAX_DATA = 1_900_000; // D1 rows hold at most 2 MB
const WINDOW_WEEKS = 6;     // weeks of datasets sent to the browser besides each report type's latest one

const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });
const err = (status, message) => json({ error: message }, status);

/* ---------- Cloudflare Access token check ---------- */
const b64uBytes = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const b64uJson = (s) => JSON.parse(new TextDecoder().decode(b64uBytes(s)));
let jwksCache = { at: 0, keys: [], team: '' };
async function jwks(team) {
  if (jwksCache.team === team && Date.now() - jwksCache.at < 3600_000 && jwksCache.keys.length) return jwksCache.keys;
  const r = await fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`); if (!r.ok) throw new Error('Access keys unavailable');
  jwksCache = { at: Date.now(), keys: (await r.json()).keys || [], team }; return jwksCache.keys;
}
/* ---------- built-in accounts: email + password, signed session cookie ---------- */
const enc = new TextEncoder();
const b64uStr = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hmac = async (secret, data) => { const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data))); };
const safeEq = async (a, b) => { const x = await hmac('cmp', String(a)); const y = await hmac('cmp', String(b)); let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]; return d === 0; }; // constant time
const users = (env) => String(env.USERS || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [e, p, r] = l.split('|'); return { email: String(e || '').trim().toLowerCase(), pw: p || '', admin: String(r || '').trim() === 'admin' }; }).filter((u) => u.email && u.pw);
const COOKIE = 'lm_session'; const SESSION_SECONDS = 14 * 86400;
const cookieOf = (req, name) => { const m = (req.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(name + '=')); return m ? m.slice(name.length + 1) : null; };
async function makeSession(env, u) { const payload = b64uStr(enc.encode(JSON.stringify({ e: u.email, a: u.admin ? 1 : 0, x: Math.floor(Date.now() / 1000) + SESSION_SECONDS }))); return payload + '.' + b64uStr(await hmac(env.SESSION_SECRET, payload)); }
async function readSession(req, env) {
  if (!env.SESSION_SECRET || String(env.SESSION_SECRET).length < 16) return null; const c = cookieOf(req, COOKIE); if (!c) return null; const [p, sig] = c.split('.'); if (!p || !sig) return null;
  if (!(await safeEq(b64uStr(await hmac(env.SESSION_SECRET, p)), sig))) return null;
  try { const o = b64uJson(p); if (!o.x || o.x < Date.now() / 1000) return null; const still = users(env).find((u) => u.email === o.e); if (!still) return null; return { email: o.e, admin: still.admin }; } catch (e) { return null; } // role always comes from the current USERS secret
}
const setCookie = (val, maxAge) => `${COOKIE}=${val}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
async function login(req, env) {
  let b; try { b = await req.json(); } catch (e) { return err(400, 'bad json'); }
  if (!env.SESSION_SECRET || String(env.SESSION_SECRET).length < 16 || !users(env).length) return err(503, 'Sign-in is not set up yet on this website.');
  const ip = req.headers.get('cf-connecting-ip') || 'unknown'; const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, at INTEGER NOT NULL)').run();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ?1 AND at > ?2').bind(ip, now - 900).first();
  if (recent && recent.n >= 8) return err(429, 'Too many wrong attempts. Try again in 15 minutes.');
  const email = String(b.email || '').trim().toLowerCase(); const pw = String(b.password || ''); let hit = null;
  for (const u of users(env)) { const a = email ? await safeEq(u.email, email) : true; const c = await safeEq(u.pw, pw); if (a && c) hit = u; } // password only (no email) is enough; always compares every account: no timing hint
  if (!hit) { await env.DB.prepare('INSERT INTO login_attempts (ip, at) VALUES (?1, ?2)').bind(ip, now).run(); await env.DB.prepare('DELETE FROM login_attempts WHERE at < ?1').bind(now - 86400).run(); return err(401, 'Wrong password.'); }
  return json({ ok: true, email: hit.email, canWrite: hit.admin }, 200, { 'set-cookie': setCookie(await makeSession(env, hit), SESSION_SECONDS) });
}

async function whoAmI(req, env) {
  if (env.DEV_OPEN === '1') return { email: 'dev@local', admin: true, dev: true };
  const ses = await readSession(req, env); if (ses) return ses;
  if (!env.ACCESS_TEAM || !env.ACCESS_AUD) return null; // no other sign-in configured: refuse rather than leave the data open
  const tok = req.headers.get('Cf-Access-Jwt-Assertion'); if (!tok) return null;
  try {
    const [h, p, s] = tok.split('.'); const head = b64uJson(h); const pay = b64uJson(p);
    if (!pay.exp || pay.exp * 1000 < Date.now()) return null;
    if (![].concat(pay.aud || []).includes(env.ACCESS_AUD)) return null;
    if (pay.iss !== `https://${env.ACCESS_TEAM}.cloudflareaccess.com`) return null;
    const jwk = (await jwks(env.ACCESS_TEAM)).find((k) => k.kid === head.kid); if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uBytes(s), new TextEncoder().encode(h + '.' + p)))) return null;
    const email = String(pay.email || '').toLowerCase(); if (!email) return null;
    const admins = String(env.ADMINS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
    return { email, admin: admins.includes(email) };
  } catch (e) { return null; }
}

/* ---------- API ---------- */
const COLS = 'id, store, key, dept, type, week, start, end, file_name, uploaded_at, size, data, updated_at';
async function load(env, week) {
  // templates (small, global) + every dataset / history record of the last WINDOW_WEEKS weeks up to `week` + the newest record of each report type
  const from = new Date(Date.parse(week + 'T00:00:00Z') - WINDOW_WEEKS * 7 * 86400000).toISOString().slice(0, 10);
  const q = `SELECT ${COLS} FROM records WHERE store = 'templates'
    UNION SELECT ${COLS} FROM records WHERE store IN ('datasets','history') AND week <= ?1 AND week >= ?2
    UNION SELECT ${COLS} FROM records WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY dept, IFNULL(type,'') ORDER BY week DESC, end DESC, uploaded_at DESC) AS rn FROM records WHERE store = 'datasets' AND week <= ?1) WHERE rn = 1)`;
  return (await env.DB.prepare(q).bind(week, from).all()).results;
}

async function api(req, env, url) {
  const path = url.pathname.replace(/^\/api/, ''); const m = req.method;
  if (m !== 'GET' && req.headers.get('x-lm-request') !== '1') return err(403, 'Missing request header.'); // blocks cross-site form posts
  if (path === '/login' && m === 'POST') return login(req, env);
  if (path === '/logout' && m === 'POST') return json({ ok: true }, 200, { 'set-cookie': setCookie('', 0) });
  const me = await whoAmI(req, env); if (!me) return json({ error: 'Sign in required.', login: users(env).length > 0 }, 401);
  if (path === '/ping' && m === 'GET') return json({ ok: true, email: me.email, canWrite: me.admin });
  if (path === '/weeks' && m === 'GET') {
    const r = await env.DB.prepare(`SELECT week, SUM(CASE WHEN store = 'datasets' THEN 1 ELSE 0 END) AS n FROM records WHERE store IN ('datasets','history') AND week IS NOT NULL GROUP BY week ORDER BY week DESC`).all(); return json({ weeks: r.results });
  }
  if (path === '/stamp' && m === 'GET') { const r = await env.DB.prepare('SELECT updated_at FROM records ORDER BY updated_at DESC LIMIT 1').first(); return json({ stamp: r ? r.updated_at : null }); }
  if (path === '/load' && m === 'GET') { const week = url.searchParams.get('week'); if (!WEEK_RE.test(week || '')) return err(400, 'week=YYYY-MM-DD required'); return json({ records: await load(env, week) }); }
  if (path === '/export' && m === 'GET') { const r = await env.DB.prepare(`SELECT ${COLS} FROM records`).all(); return json({ records: r.results }); }
  // everything below changes data: administrators only
  if (!me.admin) return err(403, 'View only: your account is not allowed to change data.');
  if (path === '/rec' && m === 'PUT') {
    let b; try { b = await req.json(); } catch (e) { return err(400, 'bad json'); }
    if (!STORES.has(b.store) || !b.key || typeof b.data !== 'string' || !b.data) return err(400, 'store, key and data required');
    if (b.data.length > MAX_DATA) return err(413, 'This record is too large to store (over 1.9 MB).');
    if (b.week != null && !WEEK_RE.test(b.week)) return err(400, 'bad week');
    const key = String(b.key).slice(0, 120); const id = `${b.store}-${key}`.replace(/[^A-Za-z0-9_\-.~:@+]/g, '_');
    await env.DB.prepare(`INSERT INTO records (id, store, key, dept, type, week, start, end, file_name, uploaded_at, size, data, updated_at, updated_by)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
      ON CONFLICT(id) DO UPDATE SET dept=?4, type=?5, week=?6, start=?7, end=?8, file_name=?9, uploaded_at=?10, size=?11, data=?12, updated_at=?13, updated_by=?14`)
      .bind(id, b.store, key, b.dept || null, b.type || null, b.week || null, b.start || null, b.end || null, b.file_name || null, b.uploaded_at || null, b.data.length, b.data, new Date().toISOString(), me.email).run();
    return json({ ok: true, id });
  }
  if (path === '/rec' && m === 'DELETE') { const id = url.searchParams.get('id'); if (!id) return err(400, 'id required'); await env.DB.prepare('DELETE FROM records WHERE id = ?1').bind(id).run(); return json({ ok: true }); }
  if (path === '/clear' && m === 'POST') { // removes one week's reports (never the saved formats, notes or other weeks)
    let b; try { b = await req.json(); } catch (e) { return err(400, 'bad json'); }
    if (!WEEK_RE.test(b.week || '')) return err(400, 'week required');
    const r = await env.DB.prepare(`DELETE FROM records WHERE store IN ('datasets','history') AND week = ?1`).bind(b.week).run(); return json({ ok: true, deleted: r.meta.changes });
  }
  return err(404, 'not found');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) { try { return await api(req, env, url); } catch (e) { return err(500, 'Server error: ' + (e && e.message ? e.message : e)); } }
    return env.ASSETS.fetch(req);
  },
};
