/* "Ask the dashboard": a chat panel backed by Gemini (through the Worker, which holds the API key).
   Gemini never reads the data itself. It calls the exact lookup tools below, which run here in the browser on the reports of the
   week that is open, and then words the answer. Every number therefore comes from the saved reports. */
(function () {
  const LM = window.LM; if (!LM) return;
  const { h } = LM;

  /* ---------- reading the saved reports ---------- */
  const SKIP = new Set(['pdf', 'hash', 'id']);
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const num = (v) => { if (typeof v === 'number') return v; if (typeof v === 'string' && v.trim() !== '') { const n = +v.replace(/,/g, ''); if (isFinite(n)) return n; } return NaN; };
  const short = (v, n = 160) => { if (v == null) return v; if (typeof v === 'object') { const s = JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…' : s; } if (typeof v === 'string' && v.length > n) return v.slice(0, n) + '…'; return v; };
  const parts = (p) => (String(p || '').match(/[^.\[\]]+/g) || []).map((x) => (/^\d+$/.test(x) ? +x : x));
  const dig = (o, p) => { let c = o; for (const k of parts(p)) { if (c == null) return undefined; c = c[k]; } return c; };

  let reports = [];
  async function load() {
    const sel = LM.week && LM.week.selected; const REF = LM.week && LM.week.REF;
    const raw = (await (LM.dbRaw || LM.db).all('datasets')).filter((r) => r && r.dept);
    const wk = (r) => r.week || REF;
    const all = raw.filter((r) => wk(r) === sel || wk(r) === REF || r.week); // the open week, the reference files, and the other weeks already loaded
    all.sort((a, b) => ((wk(a) === sel ? '0' : wk(a) === REF ? '1' : '2' + String(9999 - (+String(wk(a)).replace(/-/g, '') % 100000))) + a.dept + (a.type || '') + (a.start || '')).localeCompare((wk(b) === sel ? '0' : wk(b) === REF ? '1' : '2' + String(9999 - (+String(wk(b)).replace(/-/g, '') % 100000))) + b.dept + (b.type || '') + (b.start || '')));
    reports = all.map((r, i) => {
      const body = {}; for (const k of Object.keys(r)) if (!SKIP.has(k) && !['uploadedAt', 'week'].includes(k)) body[k] = r[k];
      const w = wk(r); return { ref: 'r' + (i + 1), rec: r, body, week: w === REF ? 'reference' : w, open: w === sel || w === REF };
    });
  }
  /* the stored data uses short column names; this says what they mean (so "contact ratio" etc. can be found) */
  const GLOSS = {
    'quality/trend': { 'data.weeks': { no: 'week number of the year', label: 'week dates', qC: 'Quality complaints (count)', qR: 'Quality CONTACT RATIO = quality complaints per 100,000 customers', oC: 'Operations complaints (count)', oR: 'Ops/Operations CONTACT RATIO = ops complaints per 100,000 customers', cust: 'customers served that week', start: 'week start', end: 'week end (Friday)' } },
    'roasting/roasting': { 'data.weekly': { no: 'week number', util: 'capacity utilisation %', tons: 'tons roasted', rej: 'rejection %', cap: 'capacity (tons)', end: 'week end date' }, 'data.soh.roast': { soh: 'stock on hand', doh: 'days on hand', target: 'target stock' }, 'data.soh.green': { totalDoh: 'total days on hand' } },
    'manualpunch/manualpunch': { 'data.stores': { mtd: 'month-to-date manual punch % of sales', p: 'manual punch % by period' }, 'data.periods': { manual: 'manual punch value', total: 'total sales', pct: 'manual punch %' } },
    'warehouse/warehouse': { 'data.summary.monthly': { y: 'year', m: 'month', stock: 'closing stock value', sales: 'sales', log: 'logistics cost', lr: 'logistics cost as % of sales', sr: 'stock as % of sales' }, 'data.logistics.cost': { m: 'month', sales: 'sales', log: 'logistics cost', pct: 'logistics cost % of sales' }, 'data.logistics.budget': { m: 'month', old: 'old budget', nw: 'new budget', act: 'actual', var: 'variance', util: 'budget utilisation %' }, 'data.logistics.allCost': { ship: 'shipping cost', tot: 'total cost' }, 'data.logistics.turnover': { beg: 'opening stock', pur: 'purchases', clo: 'closing stock', cogs: 'cost of goods sold', avg: 'average stock', t: 'turnover' }, 'data.flow.rows': { wh: 'warehouse', served: 'branches served', daily: 'daily deliveries', oc: 'out cartons', ic: 'in cartons', cp: 'cartons %', nc: 'net cartons', op: 'out pallets', ip: 'in pallets', np: 'net pallets' }, 'data.capacity.rows': { wh: 'warehouse', cap: 'capacity', act: 'actual use', u: 'utilisation %', gap: 'free space / gap' }, 'data.flow.detail': { cph: 'cartons per hour', hrs: 'hours', totalHrs: 'total hours' }, 'data.dailyShip.rows': { on: 'on-time orders', off: 'late/off-schedule orders' }, 'data.scorecard.kpis': { w: 'weight', pct: '% achieved', avg: 'average', dir: 'direction (higher or lower is better)' } },
    'nep/nep': { 'data.plan.months': { y: 'year', m: 'month', nw: 'new openings (NSO)', ex: 'existing stores', op: 'opening stores total' } },
    'shipment/shipment': { 'data.rows': { cntr: 'container', bl: 'bill of lading', etd: 'estimated departure', eta: 'estimated arrival', pod: 'port of discharge' } },
    'procurement/po': { 'data.rows': { order: 'PO number', req: 'requisition (PR) number' } },
    'procurement/pr': { 'data.rows': { req: 'PR number', uom: 'unit of measure' } },
  };
  const glossFor = (rep, path) => { const g = GLOSS[rep.rec.dept + '/' + (rep.rec.type || rep.rec.dept)]; return (g && g[path]) || null; };
  /* every list of rows inside a report, found by walking the stored data */
  function tablesOf(body) {
    const out = [];
    const walk = (o, path, d) => {
      if (Array.isArray(o)) {
        if (o.length && o.every(isObj)) out.push({ path, kind: 'rows', rows: o });
        else if (o.length && o.every(Array.isArray)) out.push({ path, kind: 'grid', rows: o.map((r) => Object.fromEntries(r.map((v, i) => ['c' + i, v]))) });
        return;
      }
      if (isObj(o) && d < 7) for (const k of Object.keys(o)) walk(o[k], path ? path + '.' + k : k, d + 1);
    };
    walk(body, '', 0); return out;
  }
  const colsOf = (rows) => { const s = new Set(); rows.slice(0, 60).forEach((r) => Object.keys(r).forEach((k) => s.add(k))); return [...s]; };
  const findReport = (ref) => reports.find((r) => r.ref === String(ref).toLowerCase());
  function getTable(ref, path) {
    const r = findReport(ref); if (!r) return { err: `No report "${ref}". Call list_reports first.` };
    const root = path ? dig(r.body, path) : null; let rows = null;
    if (Array.isArray(root)) rows = root.every(isObj) ? root : root.every(Array.isArray) ? root.map((a) => Object.fromEntries(a.map((v, i) => ['c' + i, v]))) : null;
    if (!rows) { const t = tablesOf(r.body).find((x) => x.path === path); rows = t && t.rows; }
    if (!rows) return { err: `Report ${ref} has no table "${path}". Tables: ${tablesOf(r.body).map((t) => t.path).join(', ') || 'none'}` };
    return { rows };
  }

  /* ---------- the tools Gemini can call ---------- */
  const cmp = (a, op, b) => {
    const na = num(a), nb = num(b);
    if (op === 'contains') return String(a == null ? '' : a).toLowerCase().includes(String(b).toLowerCase());
    if (!isNaN(na) && !isNaN(nb) && typeof a !== 'boolean') { if (op === '=') return na === nb; if (op === '!=') return na !== nb; if (op === '>') return na > nb; if (op === '>=') return na >= nb; if (op === '<') return na < nb; return na <= nb; }
    const x = String(a == null ? '' : a).trim().toLowerCase(), y = String(b).trim().toLowerCase();
    if (op === '=') return x === y; if (op === '!=') return x !== y; if (op === '>') return x > y; if (op === '>=') return x >= y; if (op === '<') return x < y; return x <= y;
  };
  const r4 = (v) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v);

  const TOOLS = {
    list_reports({ week } = {}) {
      const pick = reports.filter((r) => (week ? r.week === week : r.open));
      return { week: LM.week && LM.week.selected ? LM.week.label(LM.week.selected) : null, other_weeks_available: [...new Set(reports.filter((r) => !r.open).map((r) => r.week))], reports: pick.map((r) => ({ report: r.ref, week: r.week, tab: r.rec.dept, kind: r.rec.type || null, file: r.rec.fileName, from: r.rec.start || null, to: r.rec.end || null,
        tables: tablesOf(r.body).map((t) => { const g = glossFor(r, t.path); return { table: t.path, rows: t.rows.length, columns: colsOf(t.rows).slice(0, 30).map((c) => (g && g[c] ? `${c} = ${g[c]}` : c)) }; }) })) };
    },
    describe_table({ report, table }) {
      const t = getTable(report, table); if (t.err) return { error: t.err };
      const cols = colsOf(t.rows); const gg = glossFor(findReport(report), table); return { rows: t.rows.length, columns: cols, meanings: gg || undefined, sample: t.rows.slice(0, 4).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, short(v, 60)]))) };
    },
    query_table({ report, table, where, select, group_by, metrics, order_by, descending, limit }) {
      const t = getTable(report, table); if (t.err) return { error: t.err };
      let rows = t.rows; const cols = colsOf(rows);
      for (const c of [...(where || []).map((w) => w.column), ...(group_by || []), ...(metrics || []).map((m) => m.column).filter(Boolean), ...(select || [])]) if (c && !cols.includes(c) && !dig(rows[0], c) && rows.length) return { error: `Column "${c}" not found. Columns: ${cols.join(', ')}` };
      for (const w of where || []) rows = rows.filter((r) => cmp(dig(r, w.column), w.op || '=', w.value));
      const matched = rows.length; let result;
      if (metrics && metrics.length) {
        const groups = new Map();
        for (const r of rows) { const key = (group_by || []).map((g) => dig(r, g)); const k = JSON.stringify(key); if (!groups.has(k)) groups.set(k, { key, rows: [] }); groups.get(k).rows.push(r); }
        if (!groups.size && !(group_by || []).length) groups.set('[]', { key: [], rows: [] });
        result = [...groups.values()].map((g) => {
          const o = {}; (group_by || []).forEach((c, i) => { o[c] = g.key[i]; });
          for (const m of metrics) {
            const vals = m.fn === 'count' && !m.column ? g.rows : g.rows.map((r) => dig(r, m.column));
            const ns = vals.map(num).filter((x) => !isNaN(x)); const name = (m.as || (m.fn + '_' + (m.column || 'rows')));
            o[name] = m.fn === 'count' ? vals.filter((v) => v != null && v !== '').length : !ns.length ? null : m.fn === 'sum' ? r4(ns.reduce((a, b) => a + b, 0)) : m.fn === 'avg' ? r4(ns.reduce((a, b) => a + b, 0) / ns.length) : m.fn === 'min' ? Math.min(...ns) : Math.max(...ns);
          }
          return o;
        });
      } else result = rows.map((r) => (select && select.length ? Object.fromEntries(select.map((c) => [c, short(dig(r, c), 200)])) : Object.fromEntries(Object.entries(r).map(([k, v]) => [k, short(v, 200)]))));
      if (order_by) { const f = (o) => { const v = dig(o, order_by); const n = num(v); return isNaN(n) ? String(v == null ? '' : v) : n; }; result.sort((a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * (descending ? -1 : 1); }); }
      const lim = Math.min(Math.max(+limit || 50, 1), 200);
      return { rows_matched: matched, groups_or_rows_returned: result.length, truncated: result.length > lim, result: result.slice(0, lim) };
    },
    get_value({ report, path }) {
      const r = findReport(report); if (!r) return { error: `No report "${report}".` };
      const v = path ? dig(r.body, path) : r.body; if (v === undefined) return { error: `Nothing at "${path}".` };
      const s = JSON.stringify(v); return s && s.length > 7000 ? { truncated: true, note: 'Too large; use query_table or a deeper path.', value: s.slice(0, 7000) } : { value: v };
    },
    search({ text, report }) {
      const q = String(text || '').toLowerCase().trim(); if (!q) return { error: 'text is required' }; const hits = []; let total = 0;
      const walk = (ref, o, path) => {
        if (o == null || hits.length >= 40 && total > 400) return;
        if (typeof o === 'object') { for (const k of Array.isArray(o) ? o.keys() : Object.keys(o)) walk(ref, o[k], path ? `${path}${Array.isArray(o) ? `[${k}]` : '.' + k}` : String(k)); return; }
        if (String(o).toLowerCase().includes(q)) { total++; if (hits.length < 40) hits.push({ report: ref, path, value: short(o, 140) }); }
      };
      for (const r of reports) if (!report || r.ref === String(report).toLowerCase()) walk(r.ref, r.body, '');
      return { matches_shown: hits.length, more_not_shown: Math.max(0, total - hits.length), hits };
    },
    async read_dashboard({ tab }) {
      const id = String(tab || '').toLowerCase(); const btn = document.querySelector(`nav.tabs button[data-id="${id}"]`); if (!btn) return { error: 'Unknown tab. Tabs: ' + [...document.querySelectorAll('nav.tabs button')].map((b) => b.dataset.id).join(', ') };
      const main = () => document.querySelector('main'); const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
      const settle = async () => { let last = '', n = 0; for (let i = 0; i < 14; i++) { await wait(260); const t = main().innerText; if (t === last && t.length > 20) { if (++n >= 1) break; } else n = 0; last = t; } };
      const was = (location.hash || '#sales').slice(1); const subs = () => [...main().querySelectorAll('.subtabs button')]; const wasSub = subs().findIndex((b) => b.classList.contains('on'));
      if (was !== id) { btn.click(); } await settle();
      const out = []; const n = subs().length; const cut = (t) => t.replace(/\n{3,}/g, '\n\n').trim().slice(0, 7000);
      if (!n) out.push({ section: id, text: cut(main().innerText) });
      else for (let i = 0; i < Math.min(n, 9); i++) { const b = subs()[i]; if (!b) break; const name = b.textContent.trim(); if (!b.classList.contains('on')) { b.click(); await settle(); } out.push({ section: name, text: cut(main().innerText) }); }
      if (was !== id) { document.querySelector(`nav.tabs button[data-id="${was}"]`).click(); await settle(); if (wasSub >= 0 && subs()[wasSub] && !subs()[wasSub].classList.contains('on')) subs()[wasSub].click(); }
      else if (wasSub >= 0 && subs()[wasSub] && !subs()[wasSub].classList.contains('on')) subs()[wasSub].click();
      return { tab: id, note: 'Text exactly as the dashboard shows it for the week that is open (what the user sees). Numbers may be rounded.', sections: out };
    },
    screen_text() {
      const m = document.querySelector('main'); const t = m ? m.innerText.replace(/\n{3,}/g, '\n\n').trim() : '';
      return { tab: (location.hash || '').slice(1) || 'sales', note: 'Text exactly as shown on the dashboard screen right now (values may be rounded or formatted).', text: t.length > 14000 ? t.slice(0, 14000) + '\n…(cut)' : t };
    },
  };

  const S = (d, extra) => ({ type: 'string', description: d, ...extra });
  const DECL = [
    { name: 'list_reports', description: 'Lists every report saved in the open week (id, tab, file, period) and the tables inside each with row counts and column names. Call this first when unsure where something is.', parameters: { type: 'object', properties: {} } },
    { name: 'describe_table', description: 'Shows the columns and 4 sample rows of one table so you understand what its columns mean.', parameters: { type: 'object', properties: { report: S('report id such as r3'), table: S('table path from list_reports') }, required: ['report', 'table'] } },
    { name: 'query_table', description: 'Exact filter / group / sum / average / count over one table. Use this for ANY number: totals, a store on a day, rankings, comparisons. Never add numbers yourself.', parameters: { type: 'object', properties: {
      report: S('report id such as r3'), table: S('table path from list_reports, e.g. ty'),
      where: { type: 'array', description: 'all conditions must hold', items: { type: 'object', properties: { column: S('column name'), op: S('= != > >= < <= contains', { enum: ['=', '!=', '>', '>=', '<', '<=', 'contains'] }), value: S('value to compare (dates as YYYY-MM-DD)') }, required: ['column', 'value'] } },
      select: { type: 'array', items: { type: 'string' }, description: 'columns to return when not aggregating' },
      group_by: { type: 'array', items: { type: 'string' }, description: 'columns to group by when aggregating' },
      metrics: { type: 'array', description: 'aggregations', items: { type: 'object', properties: { fn: S('sum avg min max count', { enum: ['sum', 'avg', 'min', 'max', 'count'] }), column: S('column (omit for count of rows)'), as: S('name for the result') }, required: ['fn'] } },
      order_by: S('column or metric name to sort by'), descending: { type: 'boolean' }, limit: { type: 'integer', description: 'max rows, default 50' } }, required: ['report', 'table'] } },
    { name: 'get_value', description: 'Reads one value or block by path, such as data.kpis or lines[3]. Use it for text slides, notes, single figures.', parameters: { type: 'object', properties: { report: S('report id'), path: S('path inside the report; empty for the whole report') }, required: ['report'] } },
    { name: 'search', description: 'Finds where a word or number appears anywhere in the open week (store names, item names, people, statuses). Use it to learn the exact spelling of a store/item before filtering.', parameters: { type: 'object', properties: { text: S('text to find'), report: S('optional: only this report') }, required: ['text'] } },
    { name: 'read_dashboard', description: 'Reads what the dashboard itself shows on one tab (all its sub-tabs): the KPI cards and tables with their proper labels, exactly as the user sees them. Use this FIRST for KPIs, ratios, scores, status and anything defined by the dashboard; use query_table when you need exact raw rows or your own filters.', parameters: { type: 'object', properties: { tab: S('tab id: sales, manualpunch, wastage, international, training, quality, procurement, warehouse, shipment, bakery, roasting, nep, others (real estate), discussion') }, required: ['tab'] } },
    { name: 'screen_text', description: 'Returns the text currently visible on the dashboard screen. Use when the user says "this screen/tab/chart" or asks what a number on screen means.', parameters: { type: 'object', properties: {} } },
  ];

  const GUIDE = `You are the built-in assistant of Half Million Coffee's Weekly Department Dashboard. Answer only from the saved reports of the week that is open.
RULES
- For KPIs, ratios, scores or statuses that the dashboard calculates (for example contact ratio, store average, OTIF, utilisation), call read_dashboard for the right tab FIRST: it shows the figures with their proper labels, as the user sees them. Use query_table for raw rows and your own filters. Column names in the raw data are often short (qR, oC, lr); the table description explains them.
- 'Last week', 'previous weeks': the other saved weeks are listed below; the open week is the default. Weekly trend tables inside one report (for example the quality weekly trend) hold many weeks in one file.
- The list of saved reports and their tables is given below, so you do not need list_reports. Ask for several lookups in one step when they are independent. Prefer one query_table with group_by over many separate queries.
- For every figure call a tool (query_table for sums, averages, rankings; search to find exact spellings; get_value for text). Never calculate by hand and never guess. If something is not in the reports, say so plainly and name what is there.
- Store and item names may be bilingual (English / Arabic). Use search first when a name is uncertain, then filter with the exact spelling. If a name could mean several stores, list them and ask.
- Dates are YYYY-MM-DD in the data. Amounts are SAR unless the report says otherwise. State the period and the report file you used. Give the number first, then one short line of context.
- Never add amounts in different currencies together; show each currency separately. If a period is not specified, use the whole report period and say so.
- Reply in the language the user wrote in. Keep answers short; use a small table for several rows. Do not mention tools or ids to the user.
- To explain a part of the dashboard, call screen_text, then explain in plain words what it shows, where each number comes from, and what it means for the business. If the screen text does not say how a number is computed, say you are not certain instead of inventing a formula.
THE TABS (each holds the reports uploaded that week)
Sales: daily net sales and bills per store (this year "ty", last year "ly") and item-group sales; sub-tabs Days, Branches, Item groups, Items, Heat map, Uploads. Store average = total net sales divided by number of days it traded. Like-for-like compares this year with last year.
Manual punch: manual-punch value vs total sales per store and period. Wastage: waste lines by store, item and value. International: London and Iraq weekly reviews, events, Saudi NSO, expansion, events calendar. Training: weekly training slides. Quality: store visit scores, COO weekly update, trend over the year. Procurement: pending purchase requisitions (PR) and orders (PO) as of a date. Warehouse: scorecard, stock value, dead stock, capacity, productivity, logistics cost, OTIF, inventory. Shipment: inbound shipments with ETD / ETA and status. Bakery: factory plan, production plan vs actual, machines, risks, food safety. Roasting: weekly production batches and stock on hand. NEP: network expansion plan, new store openings (NSO) tracker, closures. Real estate: lease register per branch (no landlord contacts stored). Discussion: the team's notes.
Reports shown in every week (year calendar, yearly quality trend) are reference files.`;

  /* a short map of the open week, sent with every step so Gemini does not spend steps discovering it */
  function indexText() {
    const L = TOOLS.list_reports(); const wl = LM.week ? LM.week.label : (x) => x;
    const line = (r) => [r.report, r.tab, r.kind || '-', r.file, (r.from || '') + '..' + (r.to || ''), r.tables.map((t) => `${t.table}(${t.rows}: ${t.columns.slice(0, 12).map((c) => c.split(' = ')[0]).join(',')})`).join('; ')].join(' | ');
    const others = reports.filter((r) => !r.open); const byWeek = {}; others.forEach((r) => { (byWeek[r.week] = byWeek[r.week] || []).push(`${r.ref}:${r.rec.dept}${r.rec.type ? '/' + r.rec.type : ''}`); });
    return 'REPORTS SAVED IN THE OPEN WEEK (' + (L.week || '') + ') AND REFERENCE FILES: id | tab | kind | file | period | tables as name(rows: columns)\n' + L.reports.map(line).join('\n').slice(0, 16000)
      + (others.length ? '\nOTHER WEEKS ALSO AVAILABLE (use describe_table / query_table with these ids, or list_reports with week=YYYY-MM-DD):\n' + Object.keys(byWeek).sort().reverse().map((w) => `${w} (${wl(w)}): ${byWeek[w].join(', ')}`).join('\n').slice(0, 4000) : '');
  }

  /* ---------- the conversation ---------- */
  let history = []; // Gemini "contents"
  async function callGemini(contents, last) {
    const r = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json', 'x-lm-request': '1' }, credentials: 'same-origin', body: JSON.stringify({ system: GUIDE + '\n\n' + indexText(), tools: DECL, contents, noTools: !!last }) });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (r.status === 401) { location.reload(); throw new Error('Signed out'); }
    if (!r.ok) { const e = new Error(j.error || 'The assistant is not available right now.'); e.code = j.code; if (j.detail) console.warn('assistant:', j.detail); throw e; }
    return j;
  }
  const FRIENDLY = { list_reports: 'Looking at the saved reports', describe_table: 'Checking a table', query_table: 'Calculating from the table', get_value: 'Reading the report', search: 'Searching the reports', screen_text: 'Reading this screen', read_dashboard: 'Reading the dashboard tab' };

  async function ask(question, onStatus) {
    await load(); const used = []; const turn = history.length;
    history.push({ role: 'user', parts: [{ text: question }] });
    try {
      const MAX = 14;
      for (let step = 0; step < MAX; step++) {
        if (step === MAX - 1) history.push({ role: 'user', parts: [{ text: 'Stop looking things up. Give the best answer you can now from what you have found, say clearly what is still missing, and suggest how I can ask for the rest.' }] }); // never end on an error
        const res = await callGemini(history, step === MAX - 1);
        const c = res.candidates && res.candidates[0]; const content = c && c.content;
        if (!content || !content.parts || !content.parts.length) { const why = (c && c.finishReason) || (res.promptFeedback && res.promptFeedback.blockReason) || 'empty'; throw new Error('No answer came back (' + why + '). Please rephrase the question.'); }
        history.push(content);
        const calls = content.parts.filter((p) => p.functionCall);
        if (!calls.length) return { text: content.parts.map((p) => p.text || '').join('').trim(), used };
        const back = [];
        for (const p of calls) {
          const { name, args } = p.functionCall; onStatus(FRIENDLY[name] || name);
          let out; try { out = TOOLS[name] ? await TOOLS[name](args || {}) : { error: 'Unknown tool ' + name }; } catch (e) { out = { error: 'Lookup failed: ' + e.message }; }
          used.push({ name, args: args || {}, out }); back.push({ functionResponse: { name, response: { output: out } } });
        }
        history.push({ role: 'user', parts: back });
      }
      throw new Error('That question needed too many steps. Try asking it in smaller parts.'); // only reached if Gemini still asks for lookups on the last turn
    } catch (e) { history.length = turn; throw e; }
  }

  /* ---------- the panel ---------- */
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  function md(src) {
    const lines = String(src).split('\n'); let out = '', i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
        const row = (x) => x.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()); const head = row(l); i += 2; let body = '';
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { body += '<tr>' + row(lines[i]).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>'; i++; }
        out += `<div class="ask-tw"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`; continue;
      }
      if (/^\s*[-*•]\s+/.test(l)) { let li = ''; while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) { li += `<li>${inline(lines[i].replace(/^\s*[-*•]\s+/, ''))}</li>`; i++; } out += `<ul>${li}</ul>`; continue; }
      if (/^\s*\d+[.)]\s+/.test(l)) { let li = ''; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { li += `<li>${inline(lines[i].replace(/^\s*\d+[.)]\s+/, ''))}</li>`; i++; } out += `<ol>${li}</ol>`; continue; }
      out += l.trim() ? `<p>${inline(l.replace(/^#+\s*/, ''))}</p>` : ''; i++;
    }
    return out;
  }

  const CHIPS = {
    sales: ['Explain this screen', 'Which store had the highest net sales this week?', 'Net sales of each store yesterday', 'How is the store average calculated?'],
    wastage: ['Explain this screen', 'Which store has the highest waste value?', 'Top 5 wasted items'],
    procurement: ['Explain this screen', 'How many POs are pending and what is their total value?', 'Oldest pending requisitions'],
    shipment: ['Explain this screen', 'Which shipments are late?', 'What arrives next week?'],
    _: ['Explain this screen', 'What reports are saved for this week?', 'Summarise this week in 5 points'],
  };

  let panel, list, input, sendBtn, fab, busy = false, headline;
  function weekName() { return LM.week && LM.week.selected ? LM.week.label(LM.week.selected) : 'this week'; }
  function addMsg(role, node) { const m = h('div', { class: 'ask-m ' + role }); if (typeof node === 'string') m.textContent = node; else m.append(node); list.append(m); list.scrollTop = list.scrollHeight; return m; }
  function chips() {
    const key = (location.hash || '#sales').slice(1); const set = CHIPS[key] || CHIPS._;
    const box = h('div', { class: 'ask-chips' }, set.map((t) => h('button', { onclick: () => submit(t) }, t)));
    return box;
  }
  function welcome() {
    list.replaceChildren(); history = [];
    const art = LM.pudding || {};
    list.append(h('div', { class: 'ask-hello' }, art.hello ? h('img', { class: 'ask-pic', src: art.hello, alt: 'Pudding the robot' }) : null,
      h('div', { class: 'ask-bubble' }, h('b', {}, 'Hi, my name is Pudding.'), h('div', {}, 'Have any questions for this report?'),
        h('p', {}, `I read the reports saved under ${weekName()} and work out every figure exactly. I can also explain what you see on screen. To ask about another week, pick it in the Week box first.`))), chips());
    headline.textContent = weekName();
  }
  async function submit(q) {
    q = (q || input.value).trim(); if (!q || busy) return; busy = true; input.value = ''; autosize(); sendBtn.disabled = true;
    list.querySelectorAll('.ask-chips,.ask-hello').forEach((e) => e.remove());
    addMsg('me', q); const st = addMsg('bot pending', 'Thinking'); const dots = h('span', { class: 'ask-dots' }, '…'); st.append(dots);
    try {
      const { text, used } = await ask(q, (s) => { st.firstChild.textContent = s; });
      st.remove(); const m = addMsg('bot', ''); m.innerHTML = md(text || 'I could not find an answer in the reports.');
      if (used.length) {
        const det = h('details', { class: 'ask-how' }, h('summary', {}, `How I got this (${used.length} lookup${used.length > 1 ? 's' : ''})`),
          ...used.map((u) => h('div', { class: 'ask-step' }, h('b', {}, u.name), h('code', {}, JSON.stringify(u.args)), h('span', {}, u.out && u.out.error ? ' → ' + u.out.error : u.out && u.out.rows_matched != null ? ` → ${u.out.rows_matched} matching rows` : ''))));
        m.append(det);
      }
    } catch (e) {
      st.remove(); const m = addMsg('bot err', ''); m.textContent = e.code === 'no-key' ? 'The assistant is not switched on yet: the Gemini key has not been added to the website. Ask the dashboard owner to finish the setup.' : e.message;
    }
    busy = false; sendBtn.disabled = false; input.focus(); list.scrollTop = list.scrollHeight;
  }
  function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; }
  function toggle(open) {
    const on = open == null ? !panel.classList.contains('open') : open; panel.classList.toggle('open', on); fab.classList.toggle('on', on);
    if (on) { headline.textContent = weekName(); if (!list.children.length) welcome(); setTimeout(() => input.focus(), 120); }
  }
  function build() {
    if (document.querySelector('.ask-fab')) return;
    const art = LM.pudding || {}; const pic = h('img', { class: 'pud', alt: '', draggable: 'false' });
    const tip = h('span', { class: 'ask-tip' }, 'Ask Pudding');
    fab = h('button', { class: 'ask-fab', title: 'Ask Pudding', 'aria-label': 'Ask Pudding about this report', onclick: () => toggle() }, pic, tip);
    const still = () => { pic.src = art.idle || ''; fab.classList.add('floating'); };
    if (art.wave && !matchMedia('(prefers-reduced-motion: reduce)').matches) { pic.src = art.wave; fab.classList.add('waving'); setTimeout(() => { fab.classList.remove('waving'); still(); }, 3600); setTimeout(() => tip.classList.add('gone'), 9000); }
    else { still(); setTimeout(() => tip.classList.add('gone'), 6000); }
    headline = h('span', { class: 'ask-week' });
    list = h('div', { class: 'ask-list', 'aria-live': 'polite' });
    input = h('textarea', { rows: 1, placeholder: 'Ask about sales, stores, a screen…', onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } if (e.key === 'Escape') toggle(false); }, oninput: autosize });
    sendBtn = h('button', { class: 'ask-send', title: 'Send', onclick: () => submit() }, '➤');
    panel = h('section', { class: 'ask-panel', role: 'dialog', 'aria-label': 'Pudding, the dashboard assistant' },
      h('div', { class: 'ask-head' }, h('div', {}, h('b', {}, 'Pudding'), h('div', { class: 'ask-sub' }, 'Answers from ', headline)), h('div', { class: 'spacer' }),
        h('button', { class: 'btn small', onclick: () => { if (!busy) welcome(); }, title: 'Start a new conversation' }, 'New chat'), h('button', { class: 'ask-x', onclick: () => toggle(false), title: 'Close' }, '×')),
      list, h('div', { class: 'ask-foot' }, input, sendBtn), h('div', { class: 'ask-note' }, 'AI can misread a question. Open “How I got this” under an answer to see the exact lookups.'));
    document.body.append(panel, fab);
    window.addEventListener('hashchange', () => { if (list && list.querySelector('.ask-chips')) { list.querySelector('.ask-chips').replaceWith(chips()); } });
  }
  LM.ask2 = { open: () => { build(); toggle(true); }, tools: TOOLS, load, reports: () => reports, history: () => history };
  (LM.ready || Promise.resolve()).catch(() => {}).then(() => { if (LM.cloud) setTimeout(build, 600); }); // only on the website (needs the Worker)
  /* a different week was chosen: start a fresh conversation so answers never mix weeks */
  document.addEventListener('lm-week-changed', () => { if (list) { headline.textContent = weekName(); if (!busy) welcome(); } });
})();
