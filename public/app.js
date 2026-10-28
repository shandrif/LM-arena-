"use strict";
// ---------- helpers ----------
const $app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const S = { me: null, passMark: 80, checklists: [], stores: [], filters: {}, draft: null };
const ROLE_LABEL = { admin: "HQ Admin", rom: "ROM", am: "Area Manager", store: "Store Manager" };
const CAT = { training_gap: ["Training gap", "bad"], execution_gap: ["Execution gap", "warn"], untrained_practice: ["Untrained practice", "info"] };
const STATUS = { open: ["Open", "bad"], in_progress: ["In progress", "warn"], done: ["Done – to verify", "info"], verified: ["Verified", "ok"] };
const isHQ = () => S.me.role !== "store";

async function api(path, opts = {}) {
  const res = await fetch("/api" + path, {
    method: opts.method || "GET",
    headers: opts.body ? { "content-type": "application/json" } : { "content-type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/login") { S.me = null; renderLogin(); throw new Error("signed out"); }
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
function toast(msg, err) {
  const t = document.createElement("div");
  t.className = "toast" + (err ? " err" : ""); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}
const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { if (e.message !== "signed out") toast(e.message, true); } };
const pctClass = (v) => (v >= S.passMark ? "good" : v >= S.passMark - 15 ? "mid" : "low");
const pct = (v) => v == null ? '<span class="muted">–</span>' :
  `<div class="pct"><div class="bar" style="flex:1"><i class="${pctClass(v)}" style="width:${Math.min(100, v)}%"></i></div><b>${v}%</b></div>`;
const pill = (txt, cls) => `<span class="pill ${cls}">${esc(txt)}</span>`;
const today = () => new Date().toISOString().slice(0, 10);
const roleName = (id) => (S.checklists.find((r) => r.id === id) || {}).name || id;
function modal(html) {
  const bg = document.createElement("div"); bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal">${html}</div>`;
  bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg); return bg;
}
function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = name; a.click();
}
const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// ---------- shell ----------
function navItems() {
  if (S.me.role === "store") return [["#/", "My Store"], ["#/assess", "New Assessment"], ["#/actions", "Actions"], ["#/staff", "Staff"]];
  const n = [["#/", "Dashboard"], ["#/visits", "Visits"], ["#/assess", "New Visit"], ["#/actions", "Actions"]];
  if (S.me.role === "admin") n.push(["#/admin", "Stores & Mapping"]);
  return n;
}
function shell(content) {
  const cur = location.hash.split("?")[0] || "#/";
  $app.innerHTML = `
  <header class="topbar"><div class="in">
    <a class="logo" href="#/"><b>HM</b><span>Training Audit</span></a>
    <nav class="nav">${navItems().map(([h, l]) => `<a href="${h}" class="${cur === h ? "on" : ""}">${l}</a>`).join("")}</nav>
    <div class="who">${esc(S.me.name)}<br>${ROLE_LABEL[S.me.role]} · <button id="pw">Password</button> · <button id="out">Sign out</button></div>
  </div></header>
  <main>${content}</main>`;
  document.getElementById("out").onclick = guard(async () => { await api("/logout", { method: "POST", body: {} }); S.me = null; renderLogin(); });
  document.getElementById("pw").onclick = changePassword;
}
function changePassword() {
  const m = modal(`<h2>Change password</h2><div class="grid" style="margin-top:12px">
    <div><label>Current password</label><input type="password" id="cp"></div>
    <div><label>New password (min 8 characters)</label><input type="password" id="np"></div>
    <button class="btn gold" id="save">Save</button></div>`);
  m.querySelector("#save").onclick = guard(async () => {
    await api("/password", { method: "POST", body: { current: m.querySelector("#cp").value, next: m.querySelector("#np").value } });
    m.remove(); toast("Password updated");
  });
}

// ---------- login ----------
function renderLogin() {
  $app.innerHTML = `<div class="login"><form class="card" id="f">
    <div class="logo"><b>HM</b><span>Store Training Audit</span></div>
    <p class="muted" style="text-align:center;margin:0 0 18px">Sign in with your store credentials</p>
    <div style="margin-bottom:12px"><label>Username</label><input id="u" autocomplete="username" autocapitalize="none" required></div>
    <div style="margin-bottom:18px"><label>Password</label><input id="p" type="password" autocomplete="current-password" required></div>
    <button class="btn gold" style="width:100%">Sign in</button></form></div>`;
  document.getElementById("f").onsubmit = guard(async (e) => {
    e.preventDefault();
    await api("/login", { method: "POST", body: { username: document.getElementById("u").value, password: document.getElementById("p").value } });
    await boot();
  });
}

// ---------- dashboard ----------
function filterQuery() {
  const f = S.filters; const q = new URLSearchParams();
  for (const k of ["from", "to", "rom", "am", "store", "role", "type"]) if (f[k]) q.set(k, f[k]);
  return q.toString();
}
function filterBar(withStore = true) {
  const f = S.filters, st = S.stores;
  const uniq = (k) => [...new Set(st.map((s) => s[k]).filter(Boolean))].sort();
  const sel = (id, label, opts, val) => `<div><label>${label}</label><select data-f="${id}"><option value="">All</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${v == val ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
  const stores = st.filter((s) => (!f.rom || s.rom === f.rom) && (!f.am || s.area_manager === f.am));
  return `<div class="card"><div class="filters">
    <div><label>From</label><input type="date" data-f="from" value="${f.from || ""}"></div>
    <div><label>To</label><input type="date" data-f="to" value="${f.to || ""}"></div>
    ${isHQ() ? sel("rom", "ROM", uniq("rom").map((v) => [v, v]), f.rom) : ""}
    ${isHQ() ? sel("am", "Area manager", [...new Set(st.filter((s) => !f.rom || s.rom === f.rom).map((s) => s.area_manager).filter(Boolean))].sort().map((v) => [v, v]), f.am) : ""}
    ${isHQ() && withStore ? sel("store", "Store", stores.map((s) => [s.id, `${s.code} · ${s.name}`]), f.store) : ""}
    ${sel("role", "Role", S.checklists.map((r) => [r.id, r.name]), f.role)}
    ${sel("type", "Type", [["self", "Self assessment"], ["coaching", "Coaching visit"]], f.type)}
    <button class="btn ghost sm" id="clr">Clear</button></div></div>`;
}
function bindFilters(reload) {
  document.querySelectorAll("[data-f]").forEach((el) => el.onchange = () => {
    S.filters[el.dataset.f] = el.value;
    if (el.dataset.f === "rom") { S.filters.am = ""; S.filters.store = ""; }
    if (el.dataset.f === "am") S.filters.store = "";
    reload();
  });
  const c = document.getElementById("clr"); if (c) c.onclick = () => { S.filters = {}; reload(); };
}
const nameCell = (v) => v || '<span class="muted">Unmapped</span>';
function rankTable(rows, cols, onclickAttr) {
  if (!rows.length) return '<div class="empty">No assessments in this period yet.</div>';
  return `<div class="tablewrap"><table><thead><tr>${cols.map((c) => `<th class="${c.num ? "num" : ""}">${c.h}</th>`).join("")}</tr></thead><tbody>
    ${rows.map((r) => `<tr ${onclickAttr ? `class="click" ${onclickAttr(r)}` : ""}>${cols.map((c) => `<td class="${c.num ? "num" : ""}">${c.f(r)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
const metricCols = [
  { h: "Visits", num: 1, f: (r) => r.visits },
  { h: "Compliance %", f: (r) => pct(r.compliance) },
  { h: "Trained %", f: (r) => pct(r.training) },
  { h: "Pass %", f: (r) => pct(r.pass_pct) },
];

async function renderDashboard() {
  shell('<div class="empty">Loading…</div>');
  const d = await api("/stats?" + filterQuery());
  const o = d.overall || {};
  const openN = (owner) => d.open.filter((x) => x.owner === owner && (x.status === "open" || x.status === "in_progress")).reduce((a, x) => a + x.n, 0);
  const overdue = d.open.reduce((a, x) => a + (x.overdue || 0), 0);
  const gapTotal = d.byGap.reduce((a, g) => a + g.n, 0) || 1;
  const maxTrend = 100;
  const title = S.me.role === "store" ? `${esc(S.me.store_name)} – outcomes` : "Training audit dashboard";
  shell(`
  <div class="page-head"><h1>${title}</h1><a class="btn gold" href="#/assess">${S.me.role === "store" ? "Start assessment" : "New coaching visit"}</a></div>
  ${filterBar()}
  <div class="grid kpis">
    <div class="kpi"><div class="v">${o.visits || 0}</div><div class="l">Assessments</div></div>
    <div class="kpi"><div class="v">${o.compliance ?? "–"}${o.compliance != null ? "%" : ""}</div><div class="l">Compliance (performed)</div></div>
    <div class="kpi"><div class="v">${o.training ?? "–"}${o.training != null ? "%" : ""}</div><div class="l">Trained</div></div>
    <div class="kpi"><div class="v">${o.pass_pct ?? "–"}${o.pass_pct != null ? "%" : ""}</div><div class="l">Pass rate (≥${S.passMark}%)</div></div>
    <div class="kpi"><div class="v">${openN("Operations")}</div><div class="l">Open · Operations</div></div>
    <div class="kpi"><div class="v">${openN("Training")}</div><div class="l">Open · Training</div></div>
    <div class="kpi" style="border-top-color:var(--bad)"><div class="v">${overdue}</div><div class="l">Overdue actions</div></div>
  </div>
  ${S.me.role === "store" || S.filters.store ? `<div class="card"><h2>Staff outcomes</h2>${rankTable(d.staff, [
    { h: "Staff", f: (r) => esc(r.name) + (r.emp_no ? ` <span class="muted small">#${esc(r.emp_no)}</span>` : "") },
    { h: "Role", f: (r) => esc(roleName(r.role)) },
    { h: "Visits", num: 1, f: (r) => r.visits },
    { h: "Compliance %", f: (r) => pct(r.visits ? r.compliance : null) },
    { h: "Trained %", f: (r) => pct(r.visits ? r.training : null) },
    { h: "Pass %", f: (r) => pct(r.visits ? r.pass_pct : null) },
    { h: "Last", f: (r) => r.last_visit || '<span class="muted">Never</span>' },
  ])}</div>` : ""}
  ${isHQ() ? `<div class="grid cols2">
    <div class="card"><h2>By ROM</h2>${rankTable(d.byRom, [{ h: "ROM", f: (r) => nameCell(esc(r.rom)) }, ...metricCols], (r) => `data-rom="${esc(r.rom || "")}"`)}</div>
    <div class="card"><h2>By area manager</h2>${rankTable(d.byAm, [{ h: "Area manager", f: (r) => nameCell(esc(r.am)) }, { h: "ROM", f: (r) => esc(r.rom || "") }, ...metricCols], (r) => `data-am="${esc(r.am || "")}"`)}</div>
  </div>
  <div class="card"><h2>By store <span class="muted small">(lowest compliance first – click to drill down)</span></h2>${rankTable(d.byStore, [
    { h: "Store", f: (r) => `<b>${esc(r.code)}</b> ${esc(r.name)}` }, { h: "Area manager", f: (r) => esc(r.am || "") }, { h: "ROM", f: (r) => esc(r.rom || "") },
    { h: "Staff", num: 1, f: (r) => r.staff }, ...metricCols, { h: "Last visit", f: (r) => r.last_visit }], (r) => `data-store="${r.id}"`)}</div>` : ""}
  <div class="grid cols2">
    <div class="card"><h2>Gap categories <span class="muted small">(who must act)</span></h2>
      ${d.byGap.length ? d.byGap.map((g) => `<div class="hbar"><span>${pill(CAT[g.category][0], CAT[g.category][1])}</span><div class="bar"><i style="background:var(--hm-gold);width:${100 * g.n / gapTotal}%"></i></div><b>${g.n}</b></div>
        <div class="muted small" style="margin:-4px 0 6px 0">Owner: <b>${g.owner}</b></div>`).join("") : '<div class="empty">No gaps recorded 🎉</div>'}</div>
    <div class="card"><h2>Compliance by role</h2>${d.byRole.length ? d.byRole.map((r) => `<div class="hbar"><span>${esc(roleName(r.role))}</span>${pct(r.compliance)}<span></span></div>`).join("") : '<div class="empty">No data</div>'}</div>
  </div>
  <div class="grid cols2">
    <div class="card"><h2>Monthly trend (compliance %)</h2>${d.trend.length ? `<div class="trend">${d.trend.map((t) => `<div><b>${t.compliance}%</b><i style="height:${t.compliance / maxTrend * 100}px"></i>${t.month.slice(2)}</div>`).join("")}</div>` : '<div class="empty">No data</div>'}</div>
    <div class="card"><h2>Weakest sections</h2>${d.bySection.length ? d.bySection.map((s) => `<div class="hbar"><span title="${esc(s.section)}">${esc(roleName(s.role))}: ${esc(s.section.slice(0, 22))}</span><div class="bar"><i class="low" style="width:${100 * s.n / d.bySection[0].n}%"></i></div><b>${s.n}</b></div>`).join("") : '<div class="empty">No gaps</div>'}</div>
  </div>
  <div class="card"><h2>Most frequent failing tasks</h2>${rankTable(d.topGaps, [
    { h: "Role", f: (r) => esc(roleName(r.role)) }, { h: "Section", f: (r) => esc(r.section) }, { h: "Task", f: (r) => esc(r.task) },
    { h: "Gaps", num: 1, f: (r) => r.n }, { h: "Training", num: 1, f: (r) => r.training_gap + r.untrained_practice }, { h: "Execution", num: 1, f: (r) => r.execution_gap }])}</div>`);
  bindFilters(renderDashboard);
  document.querySelectorAll("tr[data-store]").forEach((tr) => tr.onclick = () => { S.filters.store = tr.dataset.store; renderDashboard(); });
  document.querySelectorAll("tr[data-rom]").forEach((tr) => tr.onclick = () => { S.filters.rom = tr.dataset.rom; renderDashboard(); });
  document.querySelectorAll("tr[data-am]").forEach((tr) => tr.onclick = () => { S.filters.am = tr.dataset.am; renderDashboard(); });
}

// ---------- visits list + detail ----------
async function renderVisits() {
  shell('<div class="empty">Loading…</div>');
  const rows = await api("/assessments?" + filterQuery());
  shell(`<div class="page-head"><h1>Assessments & coaching visits</h1>
    <button class="btn ghost sm" id="csv">Export CSV</button></div>${filterBar()}
  <div class="card">${rankTable(rows, [
    { h: "Date", f: (r) => r.visit_date }, { h: "Store", f: (r) => `<b>${esc(r.store_code)}</b> ${esc(r.store_name)}` },
    { h: "Staff", f: (r) => esc(r.staff_name) }, { h: "Role", f: (r) => esc(roleName(r.role)) },
    { h: "Type", f: (r) => pill(r.type === "self" ? "Self" : "Coaching", r.type === "self" ? "gray" : "info") },
    { h: "Assessor", f: (r) => esc(r.assessor) },
    { h: "Trained", f: (r) => pct(r.train_pct) }, { h: "Compliance", f: (r) => pct(r.comp_pct) },
    { h: "Result", f: (r) => pill(r.pass ? "Pass" : "Fail", r.pass ? "ok" : "bad") },
  ], (r) => `data-id="${r.id}"`)}</div>`);
  bindFilters(renderVisits);
  document.querySelectorAll("tr[data-id]").forEach((tr) => tr.onclick = () => (location.hash = "#/visit/" + tr.dataset.id));
  document.getElementById("csv").onclick = () => download("assessments.csv",
    ["Date,Store code,Store,Area manager,ROM,Staff,Role,Type,Assessor,Trained %,Compliance %,Result",
      ...rows.map((r) => [r.visit_date, r.store_code, r.store_name, r.am, r.rom, r.staff_name, roleName(r.role), r.type, r.assessor, r.train_pct, r.comp_pct, r.pass ? "Pass" : "Fail"].map(csvCell).join(","))].join("\n"));
}
async function renderVisit(id) {
  shell('<div class="empty">Loading…</div>');
  const a = await api("/assessments/" + id);
  const role = S.checklists.find((r) => r.id === a.role);
  const acts = await api("/actions?assessment=" + id);
  shell(`<div class="page-head"><div><a href="#/visits">← Back</a><h1>${esc(a.staff_name)} · ${esc(role.name)}</h1>
    <div class="muted">${esc(a.store_name)} · ${a.visit_date} · ${a.type === "self" ? "Self assessment" : "Coaching visit"} by ${esc(a.assessor)}</div></div>
    ${pill(a.pass ? "PASS" : "FAIL", a.pass ? "ok" : "bad")}</div>
  <div class="grid kpis"><div class="kpi"><div class="v">${a.comp_pct}%</div><div class="l">Compliance</div></div>
  <div class="kpi"><div class="v">${a.train_pct}%</div><div class="l">Trained</div></div>
  <div class="kpi"><div class="v">${acts.length}</div><div class="l">Actions raised</div></div></div>
  ${a.notes ? `<div class="card"><h2>Notes</h2>${esc(a.notes)}</div>` : ""}
  ${role.sections.map((sec, si) => `<div class="card"><h2>${esc(sec.name)}</h2><div class="tablewrap"><table><thead><tr><th>Task</th><th>Trained</th><th>Performed</th></tr></thead><tbody>
    ${sec.tasks.map((t, ti) => { const v = a.answers[`${si}.${ti}`] || [0, 0]; return `<tr><td>${esc(t)}</td><td>${pill(v[0] ? "Yes" : "No", v[0] ? "ok" : "bad")}</td><td>${pill(v[1] ? "Yes" : "No", v[1] ? "ok" : "bad")}</td></tr>`; }).join("")}
    </tbody></table></div></div>`).join("")}`);
}

// ---------- new assessment ----------
async function renderAssess(params) {
  shell('<div class="empty">Loading…</div>');
  const q = new URLSearchParams(params);
  let storeId = S.me.role === "store" ? S.me.store_id : q.get("store") || "";
  const staff = storeId ? await api("/staff?store_id=" + storeId) : [];
  const staffId = q.get("staff") || "";
  const person = staff.find((s) => String(s.id) === staffId);
  const storeSel = isHQ() ? `<div><label>Store</label><select id="st"><option value="">Select store…</option>${S.stores.map((s) => `<option value="${s.id}" ${String(s.id) === String(storeId) ? "selected" : ""}>${esc(s.code)} · ${esc(s.name)}</option>`).join("")}</select></div>` : "";
  const head = `<div class="page-head"><h1>${S.me.role === "store" ? "New staff assessment" : "New coaching visit"}</h1></div>
  <div class="card"><div class="row">${storeSel}
    <div><label>Staff member</label><select id="sp"><option value="">Select staff…</option>${staff.map((s) => `<option value="${s.id}" ${String(s.id) === staffId ? "selected" : ""}>${esc(s.name)} — ${esc(roleName(s.role))}</option>`).join("")}</select></div>
    <div><label>Date</label><input type="date" id="dt" value="${today()}" max="${today()}"></div>
    <div style="flex:0 0 auto"><button class="btn ghost sm" id="addstaff">+ Add staff</button></div></div>
    ${storeId && !staff.length ? '<p class="muted">No staff added for this store yet — use “Add staff”.</p>' : ""}</div>`;
  if (!person) {
    shell(head);
    const go = (s, p) => (location.hash = `#/assess?store=${s}&staff=${p}`);
    const st = document.getElementById("st"); if (st) st.onchange = () => go(st.value, "");
    document.getElementById("sp").onchange = (e) => go(storeId, e.target.value);
    document.getElementById("addstaff").onclick = () => addStaffModal(storeId, () => renderAssess(params));
    return;
  }
  const role = S.checklists.find((r) => r.id === person.role);
  const key = `hm-draft-${person.id}`;
  let ans = {}; try { ans = JSON.parse(localStorage.getItem(key) || "{}"); } catch { /* ignore */ }
  let notes = "";
  const total = role.sections.reduce((a, s) => a + s.tasks.length, 0);
  const calc = () => {
    let answered = 0, perf = 0, tr = 0;
    Object.values(ans).forEach((v) => { if (v[0] != null && v[1] != null) { answered++; perf += v[1]; tr += v[0]; } });
    return { answered, perf, tr };
  };
  const seg = (si, ti, idx, v) => `<div class="seg" data-k="${si}.${ti}" data-i="${idx}">
    <button class="y ${v === 1 ? "on" : ""}" data-v="1">Yes</button><button class="n ${v === 0 ? "on" : ""}" data-v="0">No</button></div>`;
  shell(`${head}
  <div class="progress"><div class="bar"><i id="pb" class="good" style="width:0"></i></div></div>
  ${role.sections.map((sec, si) => `<details class="sec" open><summary><span>${esc(sec.name)}</span><span class="small" style="opacity:.8">${sec.tasks.length} items · <a href="#" data-all="${si}" style="color:var(--hm-gold)">All Yes</a></span></summary><div class="body">
    ${sec.tasks.map((t, ti) => { const v = ans[`${si}.${ti}`] || [null, null]; return `<div class="task"><div class="t">${esc(t)}</div>
      <div class="tog tgl"><span>Trained</span>${seg(si, ti, 0, v[0])}</div><div class="tog tgl"><span>Performed</span>${seg(si, ti, 1, v[1])}</div></div>`; }).join("")}</div></details>`).join("")}
  <div class="card"><label>Notes / coaching comments</label><textarea id="nt" rows="3" maxlength="1000" placeholder="Optional"></textarea></div>
  <div class="stickybar"><div class="in"><div class="score"><span id="cnt"></span> · Compliance <b id="cmp">0%</b> · Trained <b id="trn">0%</b></div><button class="btn gold" id="sub">Submit</button></div></div>`);
  const refresh = () => {
    const c = calc();
    document.getElementById("cnt").textContent = `${c.answered}/${total} answered`;
    document.getElementById("cmp").textContent = (total ? Math.round(1000 * c.perf / total) / 10 : 0) + "%";
    document.getElementById("trn").textContent = (total ? Math.round(1000 * c.tr / total) / 10 : 0) + "%";
    const pb = document.getElementById("pb"); pb.style.width = (100 * c.answered / total) + "%";
    try { localStorage.setItem(key, JSON.stringify(ans)); } catch { /* ignore */ }
  };
  const paint = (k) => document.querySelectorAll(`.seg[data-k="${k}"]`).forEach((sg) => {
    const v = (ans[k] || [null, null])[sg.dataset.i];
    sg.querySelector(".y").classList.toggle("on", v === 1); sg.querySelector(".n").classList.toggle("on", v === 0);
  });
  document.querySelectorAll(".seg button").forEach((b) => b.onclick = () => {
    const sg = b.parentElement, k = sg.dataset.k;
    ans[k] = ans[k] || [null, null]; ans[k][sg.dataset.i] = +b.dataset.v;
    // trained = No means they cannot have been trained; keep both flags independent so untrained practice is captured.
    paint(k); refresh();
  });
  document.querySelectorAll("[data-all]").forEach((a) => a.onclick = (e) => {
    e.preventDefault(); e.stopPropagation(); const si = a.dataset.all;
    role.sections[si].tasks.forEach((_, ti) => { ans[`${si}.${ti}`] = [1, 1]; paint(`${si}.${ti}`); }); refresh();
  });
  const st = document.getElementById("st"); if (st) st.onchange = () => (location.hash = `#/assess?store=${st.value}`);
  document.getElementById("sp").onchange = (e) => (location.hash = `#/assess?store=${storeId}&staff=${e.target.value}`);
  document.getElementById("addstaff").onclick = () => addStaffModal(storeId, () => renderAssess(params));
  document.getElementById("sub").onclick = guard(async () => {
    const c = calc();
    if (c.answered < total) { toast(`Answer all items first (${total - c.answered} left)`, true); return; }
    const r = await api("/assessments", { method: "POST", body: { staff_id: person.id, answers: ans, notes: document.getElementById("nt").value, visit_date: document.getElementById("dt").value } });
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    modal(`<h2>${r.pass ? "✅ Passed" : "❌ Below pass mark"}</h2><p>Compliance <b>${r.compliance}%</b> · Trained <b>${r.training}%</b><br>${r.gaps} action${r.gaps === 1 ? "" : "s"} raised and assigned to Operations / Training.</p>
      <div class="row"><a class="btn gold" href="#/actions" style="text-align:center;text-decoration:none">View actions</a><a class="btn ghost" href="#/assess" style="text-align:center;text-decoration:none">Next staff</a></div>`);
  });
  refresh();
}
function addStaffModal(storeId, done) {
  if (!storeId) { toast("Select a store first", true); return; }
  const m = modal(`<h2>Add staff member</h2><div class="grid" style="margin-top:12px">
    <div><label>Name</label><input id="n"></div><div><label>Employee no. (optional)</label><input id="e"></div>
    <div><label>Role</label><select id="r">${S.checklists.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join("")}</select></div>
    <button class="btn gold" id="ok">Add</button></div>`);
  m.querySelector("#ok").onclick = guard(async () => {
    await api("/staff", { method: "POST", body: { store_id: storeId, name: m.querySelector("#n").value, emp_no: m.querySelector("#e").value, role: m.querySelector("#r").value } });
    m.remove(); toast("Staff added"); done();
  });
}

// ---------- staff (store) ----------
async function renderStaff() {
  shell('<div class="empty">Loading…</div>');
  const rows = await api("/staff?store_id=" + S.me.store_id);
  shell(`<div class="page-head"><h1>Our team</h1><button class="btn gold" id="add">+ Add staff</button></div>
  <div class="card">${rankTable(rows, [
    { h: "Name", f: (r) => esc(r.name) }, { h: "Emp #", f: (r) => esc(r.emp_no) }, { h: "Role", f: (r) => esc(roleName(r.role)) },
    { h: "Last assessed", f: (r) => r.last_visit || '<span class="muted">Never</span>' }, { h: "Last compliance", f: (r) => pct(r.last_comp) },
    { h: "", f: (r) => `<a class="btn sm" href="#/assess?staff=${r.id}">Assess</a> <button class="btn ghost sm" data-rm="${r.id}">Remove</button>` }])}</div>`);
  document.getElementById("add").onclick = () => addStaffModal(S.me.store_id, renderStaff);
  document.querySelectorAll("[data-rm]").forEach((b) => b.onclick = guard(async () => {
    if (!confirm("Remove this staff member? Past assessments are kept.")) return;
    await api("/staff/" + b.dataset.rm, { method: "DELETE" }); renderStaff();
  }));
}

// ---------- actions ----------
const AF = { status: "active", owner: "" };
async function renderActions() {
  shell('<div class="empty">Loading…</div>');
  const q = new URLSearchParams();
  if (AF.status === "active") q.set("active", "1"); else if (AF.status === "overdue") q.set("overdue", "1"); else if (AF.status) q.set("status", AF.status);
  if (AF.owner) q.set("owner", AF.owner);
  const rows = await api("/actions?" + q);
  const todayS = today();
  shell(`<div class="page-head"><h1>Actions & accountability</h1></div>
  <div class="card"><div class="filters">
    <div><label>Show</label><select data-a="status">${[["active", "Open & in progress"], ["overdue", "Overdue"], ["done", "Done – awaiting verification"], ["verified", "Verified"], ["", "Everything"]].map(([v, l]) => `<option value="${v}" ${AF.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div><label>Owner</label><select data-a="owner">${[["", "Both teams"], ["Operations", "Operations"], ["Training", "Training"]].map(([v, l]) => `<option value="${v}" ${AF.owner === v ? "selected" : ""}>${l}</option>`).join("")}</select></div></div></div>
  <div class="card">${rows.length ? `<div class="tablewrap"><table><thead><tr><th>Store / staff</th><th>Gap</th><th>Recommended action</th><th>Owner</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.map((x) => { const late = (x.status === "open" || x.status === "in_progress") && x.due_date < todayS; return `<tr>
      <td><b>${esc(x.store_code)}</b> ${esc(x.store_name)}<br><span class="muted small">${esc(x.staff_name)} · ${esc(roleName(x.role))}</span></td>
      <td>${pill(CAT[x.category][0], CAT[x.category][1])}<div class="small muted" style="margin-top:4px">${esc(x.section)}</div></td>
      <td style="min-width:260px">${esc(x.recommendation)}${x.comment ? `<div class="small" style="margin-top:4px">💬 ${esc(x.comment)}</div>` : ""}</td>
      <td>${pill(x.owner, x.owner === "Training" ? "info" : "warn")}</td>
      <td>${x.due_date}${late ? ` ${pill("Overdue", "bad")}` : ""}</td>
      <td>${pill(STATUS[x.status][0], STATUS[x.status][1])}${x.updated_by ? `<div class="small muted">${esc(x.updated_by)}</div>` : ""}</td>
      <td><button class="btn sm" data-edit="${x.id}">Update</button></td></tr>`; }).join("")}</tbody></table></div>` : '<div class="empty">Nothing here. 🎉</div>'}</div>`);
  document.querySelectorAll("[data-a]").forEach((el) => el.onchange = () => { AF[el.dataset.a] = el.value; renderActions(); });
  document.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => {
    const x = rows.find((r) => String(r.id) === b.dataset.edit);
    const canVerify = isHQ();
    const locked = S.me.role === "store" && x.owner === "Training";
    const opts = Object.entries(STATUS).filter(([k]) => canVerify || k !== "verified");
    const m = modal(`<h2>${esc(x.task)}</h2><p class="muted small">${esc(x.recommendation)}</p>
      ${locked ? `<p>${pill("Owned by Training team", "info")} They will update this once training is delivered.</p>` : ""}
      <div class="grid"><div><label>Status</label><select id="s" ${locked ? "disabled" : ""}>${opts.map(([k, v]) => `<option value="${k}" ${x.status === k ? "selected" : ""}>${v[0]}</option>`).join("")}</select></div>
      <div><label>Comment / evidence</label><textarea id="c" rows="3" maxlength="500" ${locked ? "disabled" : ""}>${esc(x.comment)}</textarea></div>
      ${isHQ() ? `<div><label>Due date</label><input type="date" id="d" value="${x.due_date}"></div>` : ""}
      <button class="btn gold" id="ok" ${locked ? "disabled" : ""}>Save</button></div>`);
    m.querySelector("#ok").onclick = guard(async () => {
      const body = { status: m.querySelector("#s").value, comment: m.querySelector("#c").value };
      const d = m.querySelector("#d"); if (d) body.due_date = d.value;
      await api("/actions/" + x.id, { method: "PATCH", body }); m.remove(); toast("Updated"); renderActions();
    });
  });
}

// ---------- admin: mapping ----------
async function renderAdmin() {
  shell('<div class="empty">Loading…</div>');
  const stores = await api("/admin/stores");
  shell(`<div class="page-head"><h1>Stores & area-manager mapping</h1></div>
  <div class="card"><h2>Import / update mapping</h2>
    <p class="muted small">Paste rows (or upload a CSV) with columns: <b>store_code, store_name, city, area_manager, rom</b>. Existing store codes are updated. New store, area-manager and ROM logins are created and the one-time passwords are shown below — download them and share securely.</p>
    <textarea id="csv" rows="6" placeholder="HM001,Half Million – Olaya,Riyadh,Ahmed Ali,Khalid Noor&#10;HM002,Half Million – Malaz,Riyadh,Ahmed Ali,Khalid Noor"></textarea>
    <div class="row" style="margin-top:10px"><input type="file" id="file" accept=".csv,text/csv"><button class="btn gold" id="imp" style="flex:0 0 auto">Import</button></div></div>
  <div class="card"><h2>Stores (${stores.length})</h2>${rankTable(stores, [
    { h: "Code", f: (r) => `<b>${esc(r.code)}</b>` }, { h: "Store", f: (r) => esc(r.name) }, { h: "City", f: (r) => esc(r.city) },
    { h: "Area manager", f: (r) => nameCell(esc(r.area_manager)) }, { h: "ROM", f: (r) => nameCell(esc(r.rom)) },
    { h: "Staff", num: 1, f: (r) => r.staff }, { h: "Login", f: (r) => `<code>${esc(r.username || "")}</code>` },
    { h: "", f: (r) => `<button class="btn ghost sm" data-map="${r.id}">Edit</button>` }])}</div>
  <div class="card"><h2>Logins</h2><button class="btn ghost sm" id="users">Show users & reset passwords</button><div id="ul"></div></div>`);
  const parse = (text) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")))
    .filter((c) => !/^store_?code$/i.test(c[0])).map((c) => ({ store_code: c[0], store_name: c[1], city: c[2], area_manager: c[3], rom: c[4] }));
  document.getElementById("file").onchange = async (e) => { document.getElementById("csv").value = await e.target.files[0].text(); };
  document.getElementById("imp").onclick = guard(async () => {
    const rows = parse(document.getElementById("csv").value);
    if (!rows.length) { toast("Paste some rows first", true); return; }
    const r = await api("/admin/import", { method: "POST", body: { rows } });
    showCreds(r.credentials, `Imported ${r.stores} stores`); renderAdmin();
  });
  document.querySelectorAll("[data-map]").forEach((b) => b.onclick = () => {
    const s = stores.find((x) => String(x.id) === b.dataset.map);
    const m = modal(`<h2>${esc(s.code)} mapping</h2><div class="grid" style="margin-top:12px">
      <div><label>Store name</label><input id="n" value="${esc(s.name)}"></div><div><label>City</label><input id="c" value="${esc(s.city)}"></div>
      <div><label>Area manager</label><input id="a" value="${esc(s.area_manager)}"></div><div><label>ROM</label><input id="r" value="${esc(s.rom)}"></div>
      <button class="btn gold" id="ok">Save</button></div>`);
    m.querySelector("#ok").onclick = guard(async () => {
      await api("/admin/stores/" + s.id, { method: "PUT", body: { name: m.querySelector("#n").value, city: m.querySelector("#c").value, area_manager: m.querySelector("#a").value, rom: m.querySelector("#r").value } });
      m.remove(); renderAdmin();
    });
  });
  document.getElementById("users").onclick = guard(async () => {
    const us = await api("/admin/users");
    const el = document.getElementById("ul");
    el.innerHTML = rankTable(us, [{ h: "Username", f: (u) => `<code>${esc(u.username)}</code>` }, { h: "Name", f: (u) => esc(u.name) }, { h: "Role", f: (u) => ROLE_LABEL[u.role] },
      { h: "", f: (u) => `<button class="btn ghost sm" data-rs="${u.id}">Reset password</button>` }]);
    el.querySelectorAll("[data-rs]").forEach((b) => b.onclick = guard(async () => {
      const r = await api(`/admin/users/${b.dataset.rs}/reset`, { method: "POST", body: {} });
      const u = us.find((x) => String(x.id) === b.dataset.rs);
      showCreds([{ username: u.username, name: u.name, role: u.role, password: r.password }], "New password");
    }));
  });
}
function showCreds(creds, title) {
  if (!creds.length) { toast(title + " – no new logins needed"); return; }
  const m = modal(`<h2>${esc(title)}</h2><p class="muted small">Passwords are shown once only. Download and share securely.</p>
    <div class="tablewrap" style="max-height:40vh"><table><tr><th>Username</th><th>Role</th><th>Password</th></tr>${creds.map((c) => `<tr><td>${esc(c.username)}</td><td>${ROLE_LABEL[c.role]}</td><td><code>${esc(c.password)}</code></td></tr>`).join("")}</table></div>
    <button class="btn gold" id="dl" style="margin-top:12px">Download CSV</button>`);
  m.querySelector("#dl").onclick = () => download("hm-logins.csv", ["username,name,role,password", ...creds.map((c) => [c.username, c.name, c.role, c.password].map(csvCell).join(","))].join("\n"));
}

// ---------- router ----------
const guarded = guard(async () => {
  if (!S.me) return renderLogin();
  const [path, qs] = (location.hash || "#/").split("?");
  let m;
  if (path === "#/" || path === "") return renderDashboard();
  if (path === "#/assess") return renderAssess(qs || "");
  if (path === "#/visits" && isHQ()) return renderVisits();
  if ((m = /^#\/visit\/(\d+)$/.exec(path))) return renderVisit(m[1]);
  if (path === "#/actions") return renderActions();
  if (path === "#/staff" && S.me.role === "store") return renderStaff();
  if (path === "#/admin" && S.me.role === "admin") return renderAdmin();
  location.hash = "#/";
});
window.addEventListener("hashchange", guarded);

async function boot() {
  try {
    const me = await api("/me");
    S.me = me.user; S.passMark = me.pass_mark;
    S.checklists = await api("/checklists");
    S.stores = (await api("/filters")).stores;
    if (S.me.role === "store") S.filters.store = String(S.me.store_id);
    guarded();
  } catch { S.me = null; renderLogin(); }
}
boot();
