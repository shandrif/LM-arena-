import CHECKLISTS from "./checklists.json";

const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));
const b64u = (s) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

// ---------- crypto ----------
async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
}
async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return hex(salt) + ":" + hex(await pbkdf2(pw, salt));
}
async function verifyPassword(pw, stored) {
  const [s, h] = stored.split(":");
  const got = hex(await pbkdf2(pw, unhex(s)));
  let diff = got.length ^ h.length;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ (h.charCodeAt(i) || 0);
  return diff === 0;
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
async function makeToken(env, uid) {
  const body = b64u(JSON.stringify({ uid, exp: Date.now() + 12 * 3600e3 }));
  return body + "." + (await hmac(env.SESSION_SECRET, body));
}
async function readToken(env, token) {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig || (await hmac(env.SESSION_SECRET, body)) !== sig) return null;
  try { const p = JSON.parse(unb64u(body)); return p.exp > Date.now() ? p : null; } catch { return null; }
}
const randomPassword = () => {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...crypto.getRandomValues(new Uint8Array(10))].map((n) => chars[n % chars.length]).join("");
};

// ---------- scoring ----------
const ROLE_BY_ID = Object.fromEntries(CHECKLISTS.map((r) => [r.id, r]));
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// Category drives which team owns the fix.
function classify(trained, performed, task) {
  if (!trained && !performed)
    return { category: "training_gap", owner: "Training", days: 14,
      rec: `Not trained and not performing. Training team to deliver and sign off training on: "${task}".` };
  if (trained && !performed)
    return { category: "execution_gap", owner: "Operations", days: 7,
      rec: `Trained but not performing. Store/area manager to coach on the floor and re-check: "${task}".` };
  return { category: "untrained_practice", owner: "Training", days: 14,
    rec: `Performed without formal training. Training team to certify and record training for: "${task}".` };
}

// ---------- scope ----------
// Returns SQL fragment + binds restricting a query on stores alias `s` to what the user may see.
function scopeSql(user, alias = "s") {
  if (user.role === "admin") return { sql: "1=1", binds: [] };
  if (user.role === "rom") return { sql: `${alias}.rom = ?`, binds: [user.scope] };
  if (user.role === "am") return { sql: `${alias}.area_manager = ?`, binds: [user.scope] };
  return { sql: `${alias}.id = ?`, binds: [user.store_id] };
}
async function assertStore(env, user, storeId) {
  const sc = scopeSql(user);
  const row = await env.DB.prepare(`SELECT s.id FROM stores s WHERE s.id = ? AND ${sc.sql}`).bind(storeId, ...sc.binds).first();
  if (!row) fail(403, "Store not in your scope");
}
function resolveStoreId(user, requested) {
  if (user.role === "store") return user.store_id;
  const id = parseInt(requested, 10);
  if (!id) fail(400, "store_id required");
  return id;
}

// ---------- filters for stats ----------
function filters(user, q) {
  const sc = scopeSql(user);
  const w = [sc.sql], b = [...sc.binds];
  const add = (cond, v) => { if (v) { w.push(cond); b.push(v); } };
  add("a.visit_date >= ?", q.get("from"));
  add("a.visit_date <= ?", q.get("to"));
  add("s.rom = ?", q.get("rom"));
  add("s.area_manager = ?", q.get("am"));
  add("s.id = ?", q.get("store"));
  add("a.role = ?", q.get("role"));
  add("a.type = ?", q.get("type"));
  return { where: w.join(" AND "), binds: b };
}
const AGG = `COUNT(*) AS visits, COUNT(DISTINCT a.staff_id) AS staff,
  ROUND(100.0 * SUM(a.performed) / MAX(SUM(a.items),1), 1) AS compliance,
  ROUND(100.0 * SUM(a.trained) / MAX(SUM(a.items),1), 1) AS training,
  ROUND(100.0 * SUM(a.pass) / COUNT(*), 1) AS pass_pct, SUM(a.pass) AS passed`;

async function stats(env, user, q) {
  const f = filters(user, q);
  const base = `FROM assessments a JOIN stores s ON s.id = a.store_id WHERE ${f.where}`;
  const all = async (sql, extra = []) => (await env.DB.prepare(sql).bind(...f.binds, ...extra).all()).results;
  const group = (col, label) => all(`SELECT ${col} AS ${label}, ${AGG} ${base} GROUP BY ${col} ORDER BY compliance ASC`);
  const [overall] = await all(`SELECT ${AGG} ${base}`);
  const [byRom, byAm, byStore, byRole, trend] = await Promise.all([
    group("s.rom", "rom"),
    all(`SELECT s.area_manager AS am, s.rom AS rom, ${AGG} ${base} GROUP BY s.area_manager, s.rom ORDER BY compliance ASC`),
    all(`SELECT s.id, s.code, s.name, s.area_manager AS am, s.rom AS rom, ${AGG}, MAX(a.visit_date) AS last_visit ${base} GROUP BY s.id ORDER BY compliance ASC`),
    group("a.role", "role"),
    all(`SELECT substr(a.visit_date,1,7) AS month, ${AGG} ${base} GROUP BY month ORDER BY month`),
  ]);
  const gapBase = `FROM actions x JOIN assessments a ON a.id = x.assessment_id JOIN stores s ON s.id = x.store_id WHERE ${f.where}`;
  const byGap = await all(`SELECT x.category, x.owner, COUNT(*) AS n ${gapBase} GROUP BY x.category, x.owner`);
  const topGaps = await all(`SELECT x.role, x.section, x.task, COUNT(*) AS n, SUM(x.category='training_gap') AS training_gap,
    SUM(x.category='execution_gap') AS execution_gap, SUM(x.category='untrained_practice') AS untrained_practice
    ${gapBase} GROUP BY x.role, x.section, x.task ORDER BY n DESC LIMIT 15`);
  const bySection = await all(`SELECT x.role, x.section, COUNT(*) AS n ${gapBase} GROUP BY x.role, x.section ORDER BY n DESC LIMIT 12`);
  const open = await all(`SELECT x.owner, x.status, COUNT(*) AS n, SUM(x.status IN ('open','in_progress') AND x.due_date < date('now')) AS overdue ${gapBase} GROUP BY x.owner, x.status`);
  let staff = [];
  if (q.get("store") || user.role === "store") {
    const sid = user.role === "store" ? user.store_id : q.get("store");
    await assertStore(env, user, sid);
    staff = (await env.DB.prepare(
      `SELECT st.id, st.name, st.emp_no, st.role, COUNT(a.id) AS visits,
        ROUND(100.0 * SUM(a.performed) / MAX(SUM(a.items),1), 1) AS compliance,
        ROUND(100.0 * SUM(a.trained) / MAX(SUM(a.items),1), 1) AS training,
        ROUND(100.0 * SUM(a.pass) / MAX(COUNT(a.id),1), 1) AS pass_pct, MAX(a.visit_date) AS last_visit
       FROM staff st LEFT JOIN assessments a ON a.staff_id = st.id AND a.visit_date >= ? AND a.visit_date <= ?
       WHERE st.store_id = ? AND st.active = 1 GROUP BY st.id ORDER BY st.name`
    ).bind(q.get("from") || "0000", q.get("to") || "9999", sid).all()).results;
  }
  return { overall, byRom, byAm, byStore, byRole, trend, byGap, topGaps, bySection, open, staff };
}

// ---------- handlers ----------
async function getUser(env, req) {
  const m = /(?:^|;\s*)hm_session=([^;]+)/.exec(req.headers.get("cookie") || "");
  const p = await readToken(env, m && m[1]);
  if (!p) return null;
  return env.DB.prepare(
    `SELECT u.id, u.username, u.name, u.role, u.store_id, u.scope, s.name AS store_name, s.code AS store_code
     FROM users u LEFT JOIN stores s ON s.id = u.store_id WHERE u.id = ? AND u.active = 1`
  ).bind(p.uid).first();
}
const needAdmin = (u) => { if (u.role !== "admin") fail(403, "Admin only"); };

async function bootstrapAdmin(env) {
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
  if (n.n === 0 && env.ADMIN_PASSWORD)
    await env.DB.prepare("INSERT INTO users (username,name,role,pass_hash) VALUES ('admin','HQ Admin','admin',?)").bind(await hashPassword(env.ADMIN_PASSWORD)).run();
}

async function login(env, req) {
  const { username, password } = await req.json();
  const uname = String(username || "").trim().toLowerCase();
  if (!uname || !password) fail(400, "Enter username and password");
  const since = Date.now() - 15 * 60e3;
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_log WHERE username=? AND ok=0 AND at>?").bind(uname, since).first();
  if (recent.n >= 8) fail(429, "Too many failed attempts. Try again in 15 minutes.");
  const u = await env.DB.prepare("SELECT id, pass_hash FROM users WHERE username = ? AND active = 1").bind(uname).first();
  const ok = u ? await verifyPassword(String(password), u.pass_hash) : false;
  await env.DB.prepare("INSERT INTO login_log (username, ok, at) VALUES (?,?,?)").bind(uname, ok ? 1 : 0, Date.now()).run();
  if (!ok) fail(401, "Wrong username or password");
  const token = await makeToken(env, u.id);
  return json({ ok: true }, 200, { "set-cookie": `hm_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200` });
}

async function createAssessment(env, user, req) {
  const b = await req.json();
  const staff = await env.DB.prepare("SELECT * FROM staff WHERE id = ? AND active = 1").bind(b.staff_id).first();
  if (!staff) fail(404, "Staff member not found");
  await assertStore(env, user, staff.store_id);
  const role = ROLE_BY_ID[staff.role];
  if (!role) fail(400, "Unknown role");
  const answers = b.answers || {};
  const rows = [], clean = {};
  role.sections.forEach((sec, si) => sec.tasks.forEach((task, ti) => {
    const a = answers[`${si}.${ti}`];
    if (!a || a[0] === null || a[0] === undefined || a[1] === null || a[1] === undefined) fail(400, "Answer every task before submitting");
    rows.push({ section: sec.name, task, trained: a[0] ? 1 : 0, performed: a[1] ? 1 : 0 });
    clean[`${si}.${ti}`] = [a[0] ? 1 : 0, a[1] ? 1 : 0];
  }));
  const items = rows.length;
  const trained = rows.filter((r) => r.trained).length;
  const performed = rows.filter((r) => r.performed).length;
  const comp = Math.round((1000 * performed) / items) / 10;
  const trainPct = Math.round((1000 * trained) / items) / 10;
  const pass = comp >= Number(env.PASS_MARK || 80) ? 1 : 0;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.visit_date || "") ? b.visit_date : today();
  const res = await env.DB.prepare(
    `INSERT INTO assessments (store_id,staff_id,role,type,visit_date,assessor,items,trained,performed,train_pct,comp_pct,pass,answers,notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(staff.store_id, staff.id, staff.role, user.role === "store" ? "self" : "coaching", date, user.name, items, trained, performed,
    trainPct, comp, pass, JSON.stringify(clean), String(b.notes || "").slice(0, 1000)).run();
  const id = res.meta.last_row_id;
  const stmts = rows.filter((r) => !(r.trained && r.performed)).map((r) => {
    const c = classify(r.trained, r.performed, r.task);
    return env.DB.prepare(
      `INSERT INTO actions (assessment_id,store_id,staff_id,role,section,task,category,owner,recommendation,due_date) VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(id, staff.store_id, staff.id, staff.role, r.section, r.task, c.category, c.owner, c.rec, addDays(date, c.days));
  });
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  return json({ id, compliance: comp, training: trainPct, pass: !!pass, gaps: stmts.length });
}

async function listActions(env, user, q) {
  const sc = scopeSql(user);
  const w = [sc.sql], b = [...sc.binds];
  for (const [k, col] of [["status", "x.status"], ["owner", "x.owner"], ["store", "x.store_id"], ["category", "x.category"], ["staff", "x.staff_id"], ["assessment", "x.assessment_id"]])
    if (q.get(k)) { w.push(`${col} = ?`); b.push(q.get(k)); }
  if (q.get("active")) w.push("x.status IN ('open','in_progress')");
  if (q.get("overdue")) w.push("x.status IN ('open','in_progress') AND x.due_date < date('now')");
  const rows = (await env.DB.prepare(
    `SELECT x.*, st.name AS staff_name, s.name AS store_name, s.code AS store_code, s.area_manager AS am, s.rom AS rom
     FROM actions x JOIN stores s ON s.id = x.store_id JOIN staff st ON st.id = x.staff_id
     WHERE ${w.join(" AND ")} ORDER BY (x.status IN ('open','in_progress')) DESC, x.due_date ASC LIMIT 500`
  ).bind(...b).all()).results;
  return json(rows);
}

async function patchAction(env, user, id, req) {
  const b = await req.json();
  const sc = scopeSql(user);
  const x = await env.DB.prepare(`SELECT x.* FROM actions x JOIN stores s ON s.id = x.store_id WHERE x.id = ? AND ${sc.sql}`).bind(id, ...sc.binds).first();
  if (!x) fail(404, "Action not found");
  const sets = [], binds = [];
  if (b.status) {
    if (!["open", "in_progress", "done", "verified"].includes(b.status)) fail(400, "Bad status");
    // Training-owned actions are closed by HQ; store-level users can only progress Operations items.
    if (user.role === "store" && x.owner === "Training") fail(403, "This action is owned by the Training team");
    if (b.status === "verified" && !["admin", "rom", "am"].includes(user.role)) fail(403, "Only HQ / area managers can verify");
    sets.push("status = ?"); binds.push(b.status);
  }
  if (typeof b.comment === "string") { sets.push("comment = ?"); binds.push(b.comment.slice(0, 500)); }
  if (b.due_date && user.role !== "store") { sets.push("due_date = ?"); binds.push(b.due_date); }
  if (!sets.length) fail(400, "Nothing to update");
  sets.push("updated_by = ?", "updated_at = datetime('now')"); binds.push(user.name);
  await env.DB.prepare(`UPDATE actions SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
  return json({ ok: true });
}

async function importMapping(env, req) {
  const { rows } = await req.json();
  if (!Array.isArray(rows) || !rows.length) fail(400, "No rows");
  const creds = [];
  const seenScope = new Set();
  const userStmts = async (username, name, role, storeId, scope, regen) => {
    const ex = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (ex && !regen) return null;
    const pw = randomPassword();
    const h = await hashPassword(pw);
    if (ex) await env.DB.prepare("UPDATE users SET pass_hash=?, name=?, role=?, store_id=?, scope=?, active=1 WHERE id=?").bind(h, name, role, storeId, scope, ex.id).run();
    else await env.DB.prepare("INSERT INTO users (username,name,role,store_id,scope,pass_hash) VALUES (?,?,?,?,?,?)").bind(username, name, role, storeId, scope, h).run();
    creds.push({ username, name, role, password: pw });
  };
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
  for (const r of rows) {
    const code = String(r.store_code || "").trim();
    const name = String(r.store_name || "").trim();
    if (!code || !name) continue;
    const am = String(r.area_manager || "").trim(), rom = String(r.rom || "").trim();
    await env.DB.prepare(
      `INSERT INTO stores (code,name,city,area_manager,rom) VALUES (?,?,?,?,?)
       ON CONFLICT(code) DO UPDATE SET name=excluded.name, city=excluded.city, area_manager=excluded.area_manager, rom=excluded.rom`
    ).bind(code, name, String(r.city || "").trim(), am, rom).run();
    const st = await env.DB.prepare("SELECT id FROM stores WHERE code = ?").bind(code).first();
    await userStmts("store." + slug(code), name + " (Store Manager)", "store", st.id, "", false);
    if (am && !seenScope.has("am:" + am)) { seenScope.add("am:" + am); await userStmts("am." + slug(am), am, "am", null, am, false); }
    if (rom && !seenScope.has("rom:" + rom)) { seenScope.add("rom:" + rom); await userStmts("rom." + slug(rom), rom, "rom", null, rom, false); }
  }
  return json({ ok: true, stores: rows.length, credentials: creds });
}

async function route(env, req, url) {
  const p = url.pathname, m = req.method, q = url.searchParams;
  if (m !== "GET" && !(req.headers.get("content-type") || "").includes("application/json")) fail(415, "JSON only");
  if (!env.SESSION_SECRET) fail(500, "SESSION_SECRET not configured");
  if (p === "/api/login" && m === "POST") { await bootstrapAdmin(env); return login(env, req); }
  if (p === "/api/logout" && m === "POST") return json({ ok: true }, 200, { "set-cookie": "hm_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0" });
  const user = await getUser(env, req);
  if (!user) fail(401, "Not signed in");
  if (p === "/api/me") return json({ user, pass_mark: Number(env.PASS_MARK || 80) });
  if (p === "/api/checklists") return json(CHECKLISTS);
  if (p === "/api/stats") return json(await stats(env, user, q));
  if (p === "/api/filters") {
    const sc = scopeSql(user);
    const stores = (await env.DB.prepare(`SELECT s.id, s.code, s.name, s.city, s.area_manager, s.rom FROM stores s WHERE ${sc.sql} ORDER BY s.name`).bind(...sc.binds).all()).results;
    return json({ stores });
  }
  if (p === "/api/staff") {
    if (m === "GET") {
      const sid = resolveStoreId(user, q.get("store_id")); await assertStore(env, user, sid);
      return json((await env.DB.prepare(
        `SELECT st.*, (SELECT visit_date FROM assessments a WHERE a.staff_id = st.id ORDER BY visit_date DESC, id DESC LIMIT 1) AS last_visit,
          (SELECT comp_pct FROM assessments a WHERE a.staff_id = st.id ORDER BY visit_date DESC, id DESC LIMIT 1) AS last_comp
         FROM staff st WHERE st.store_id = ? AND st.active = 1 ORDER BY st.name`).bind(sid).all()).results);
    }
    if (m === "POST") {
      const b = await req.json();
      const sid = resolveStoreId(user, b.store_id); await assertStore(env, user, sid);
      if (!String(b.name || "").trim() || !ROLE_BY_ID[b.role]) fail(400, "Name and a valid role are required");
      const r = await env.DB.prepare("INSERT INTO staff (store_id,name,emp_no,role) VALUES (?,?,?,?)").bind(sid, b.name.trim(), String(b.emp_no || "").trim(), b.role).run();
      return json({ id: r.meta.last_row_id });
    }
  }
  let mm;
  if ((mm = /^\/api\/staff\/(\d+)$/.exec(p)) && m === "DELETE") {
    const st = await env.DB.prepare("SELECT store_id FROM staff WHERE id = ?").bind(mm[1]).first();
    if (!st) fail(404, "Not found");
    await assertStore(env, user, st.store_id);
    await env.DB.prepare("UPDATE staff SET active = 0 WHERE id = ?").bind(mm[1]).run();
    return json({ ok: true });
  }
  if (p === "/api/assessments" && m === "POST") return createAssessment(env, user, req);
  if (p === "/api/assessments" && m === "GET") {
    const f = filters(user, q);
    return json((await env.DB.prepare(
      `SELECT a.id, a.visit_date, a.type, a.assessor, a.role, a.items, a.trained, a.performed, a.train_pct, a.comp_pct, a.pass,
        st.name AS staff_name, s.name AS store_name, s.code AS store_code, s.area_manager AS am, s.rom AS rom
       FROM assessments a JOIN stores s ON s.id = a.store_id JOIN staff st ON st.id = a.staff_id
       WHERE ${f.where} ORDER BY a.visit_date DESC, a.id DESC LIMIT 300`).bind(...f.binds).all()).results);
  }
  if ((mm = /^\/api\/assessments\/(\d+)$/.exec(p)) && m === "GET") {
    const sc = scopeSql(user);
    const a = await env.DB.prepare(
      `SELECT a.*, st.name AS staff_name, s.name AS store_name FROM assessments a JOIN stores s ON s.id = a.store_id JOIN staff st ON st.id = a.staff_id
       WHERE a.id = ? AND ${sc.sql}`).bind(mm[1], ...sc.binds).first();
    if (!a) fail(404, "Not found");
    a.answers = JSON.parse(a.answers);
    return json(a);
  }
  if (p === "/api/actions" && m === "GET") return listActions(env, user, q);
  if ((mm = /^\/api\/actions\/(\d+)$/.exec(p)) && m === "PATCH") return patchAction(env, user, mm[1], req);

  // admin
  if (p === "/api/admin/import" && m === "POST") { needAdmin(user); return importMapping(env, req); }
  if (p === "/api/admin/stores" && m === "GET") {
    needAdmin(user);
    return json((await env.DB.prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM staff WHERE store_id = s.id AND active = 1) AS staff,
        (SELECT username FROM users WHERE store_id = s.id AND role='store' LIMIT 1) AS username FROM stores s ORDER BY s.rom, s.area_manager, s.name`).all()).results);
  }
  if ((mm = /^\/api\/admin\/stores\/(\d+)$/.exec(p)) && m === "PUT") {
    needAdmin(user);
    const b = await req.json();
    await env.DB.prepare("UPDATE stores SET name=?, city=?, area_manager=?, rom=? WHERE id=?").bind(b.name, b.city || "", b.area_manager || "", b.rom || "", mm[1]).run();
    return json({ ok: true });
  }
  if (p === "/api/admin/users" && m === "GET") {
    needAdmin(user);
    return json((await env.DB.prepare("SELECT id, username, name, role, scope, store_id, active FROM users ORDER BY role, name").all()).results);
  }
  if ((mm = /^\/api\/admin\/users\/(\d+)\/reset$/.exec(p)) && m === "POST") {
    needAdmin(user);
    const pw = randomPassword();
    await env.DB.prepare("UPDATE users SET pass_hash = ? WHERE id = ?").bind(await hashPassword(pw), mm[1]).run();
    return json({ password: pw });
  }
  if (p === "/api/password" && m === "POST") {
    const b = await req.json();
    const u = await env.DB.prepare("SELECT pass_hash FROM users WHERE id = ?").bind(user.id).first();
    if (!(await verifyPassword(String(b.current || ""), u.pass_hash))) fail(403, "Current password is wrong");
    if (String(b.next || "").length < 8) fail(400, "New password must be at least 8 characters");
    await env.DB.prepare("UPDATE users SET pass_hash = ? WHERE id = ?").bind(await hashPassword(b.next), user.id).run();
    return json({ ok: true });
  }
  fail(404, "Not found");
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try { return await route(env, req, url); }
    catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Something went wrong" }, 500);
    }
  },
};
