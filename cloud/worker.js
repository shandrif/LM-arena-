/* Cloudflare Worker for the Weekly Department Dashboard.
   - Serves the dashboard (static file) and a small JSON API under /api/* backed by the D1 database bound as DB.
   - Sign-in is done by Cloudflare Access (e.g. one-time code by email). This Worker verifies the Access token itself, so the
     data stays private even if somebody reaches the workers.dev address directly.
   - Settings (Workers → Settings → Variables and secrets):  ACCESS_TEAM = your Zero Trust team name (the part before
     .cloudflareaccess.com),  ACCESS_AUD = the Access application's AUD tag,  ADMINS = comma separated emails allowed to upload / edit
     (everyone else who passes Access can only view).  DEV_OPEN=1 switches the check off for local testing only. */

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
async function whoAmI(req, env) {
  if (env.DEV_OPEN === '1') return { email: 'dev@local', admin: true, dev: true };
  if (!env.ACCESS_TEAM || !env.ACCESS_AUD) return null; // not configured: refuse rather than leave the data open
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
  const me = await whoAmI(req, env); if (!me) return err(401, 'Sign in required (or the website is not configured yet).');
  const path = url.pathname.replace(/^\/api/, ''); const m = req.method;
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
