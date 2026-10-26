/* Roasting: weekly production history + stock-on-hand (SOH) snapshot + 250g SKU stock + planning tables. Parsed by label. No DOM. */
(function (root) {
  const LM = (root.LM = root.LM || {});
  const { norm, clean } = LM;
  const I = (level, msg, fix) => ({ level, msg, fix });
  const rows = (wb, n) => LM.engine.rowsOf(wb, n);
  const txt = (v) => (v == null ? '' : clean(v));
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : LM.parseNum(v));
  const serial = (v) => (typeof v === 'number' && v > 40000 && v < 60000 ? LM.parseDay(v) : null);
  const addDays = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const findN = (g, key) => { for (let r = 0; r < g.length; r++) for (let c = 0; c < (g[r] || []).length; c++) if (typeof g[r][c] === 'string' && norm(g[r][c]).startsWith(key)) return [r, c]; return null; };
  const find = (g, re, from = 0) => { for (let r = from; r < g.length; r++) for (let c = 0; c < (g[r] || []).length; c++) if (typeof g[r][c] === 'string' && re.test(g[r][c])) return [r, c]; return null; };
  const isoWeekEnd = (y, w) => { const j4 = new Date(Date.UTC(y, 0, 4)); const mon1 = j4.getTime() - ((j4.getUTCDay() + 6) % 7) * 86400000; return new Date(mon1 + ((w - 1) * 7 + 6) * 86400000).toISOString().slice(0, 10); };
  const DOH_TOL = (a, b) => Math.abs(a - b) > 0.5 && Math.abs(a - b) / Math.max(Math.abs(b), 1e-9) > 0.02;

  /* ---------- weekly production ---------- */
  function parseWeekly(wb, sn, issues) {
    const g = rows(wb, sn); const hr = g.findIndex((r) => (r || []).some((v) => /utili[sz]ation/i.test(String(v))) && (r || []).some((v) => /roasted/i.test(String(v)))); if (hr < 0) return null;
    const h = g[hr]; const c = { wk: h.findIndex((v) => norm(v) === 'week'), util: h.findIndex((v) => /utili/i.test(String(v))), tons: h.findIndex((v) => /roasted/i.test(String(v))), rej: h.findIndex((v) => /rejection/i.test(String(v))) };
    c.cap = c.rej + 1; const out = []; let blocks = 0, prevNo = null; const raw = [];
    for (let r = hr + 1; r < g.length; r++) {
      const x = g[r] || []; const m = /^week\s*(\d{1,2})$/i.exec(txt(x[c.wk])); if (!m) continue; const no = +m[1];
      if (prevNo != null && no < prevNo) blocks++; prevNo = no;
      let date = null; x.forEach((v, i) => { if (!date && ![c.util, c.tons, c.rej, c.cap].includes(i)) date = serial(v); });
      raw.push({ no, block: blocks, row: r + 1, util: num(x[c.util]), tons: num(x[c.tons]), rej: num(x[c.rej]), cap: num(x[c.cap]), date });
    }
    if (!raw.length) return null;
    // year for each block: anchor on the latest explicit date, count backwards
    const dated = raw.filter((x) => x.date).pop(); const lastBlock = raw[raw.length - 1].block;
    let lastYear = dated ? +isoYearOf(dated.date) : new Date().getFullYear(); if (dated && dated.block !== lastBlock) lastYear += lastBlock - dated.block;
    raw.forEach((x) => { x.year = lastYear - (lastBlock - x.block); x.end = isoWeekEnd(x.year, x.no); });
    const used = raw.filter((x) => x.tons != null || x.util != null);
    const blank = raw.length - used.length; if (blank) issues.push(I('info', `${blank} week row(s) with no data (e.g. ${raw.filter((x) => x.tons == null && x.util == null).slice(0, 4).map((x) => `${x.year} wk ${x.no}`).join(', ')}) were ignored.`));
    // checks
    const badDate = used.filter((x) => x.date && x.date !== x.end && Math.abs(days(x.date, x.end)) > 3); if (badDate.length) issues.push(I('warn', `Week-end date in the sheet does not match the week number for: ${badDate.slice(0, 4).map((x) => `${x.year} wk ${x.no} (row ${x.row}: ${x.date}, expected ${x.end})`).join('; ')}. The week number is used.`));
    const gaps = []; for (let i = 1; i < used.length; i++) { const d = days(used[i - 1].end, used[i].end); if (d !== 7) gaps.push(`${used[i - 1].year} wk ${used[i - 1].no} → ${used[i].year} wk ${used[i].no}`); } if (gaps.length) issues.push(I('warn', `Weeks are not consecutive at: ${gaps.slice(0, 4).join('; ')}.`));
    const dup = used.filter((x, i) => used.findIndex((y) => y.end === x.end) !== i); if (dup.length) issues.push(I('warn', `Duplicate week(s): ${dup.slice(0, 4).map((x) => `${x.year} wk ${x.no}`).join(', ')}.`));
    const calc = used.filter((x) => x.cap && x.tons != null && x.util != null && Math.abs((x.tons / x.cap) * 100 - x.util) > 0.5); if (calc.length) issues.push(I('warn', `Utilization ≠ roasted ÷ capacity for: ${calc.slice(0, 4).map((x) => `${x.year} wk ${x.no} (${x.util.toFixed(1)}% vs ${((x.tons / x.cap) * 100).toFixed(1)}%)`).join('; ')}.`));
    const over = used.filter((x) => x.util > 100.5 || (x.cap && x.tons > x.cap * 1.005)); if (over.length) issues.push(I('warn', `Roasted tons above capacity (utilization over 100%): ${over.slice(0, 4).map((x) => `${x.year} wk ${x.no}`).join(', ')}.`));
    const neg = used.filter((x) => x.tons < 0 || x.rej < 0); if (neg.length) issues.push(I('warn', 'Negative roasted tons or rejections found.'));
    const nocap = used.filter((x) => x.tons != null && !x.cap); if (nocap.length) issues.push(I('info', `${nocap.length} week(s) have no capacity figure.`));
    return used.map(({ block, row, date, ...x }) => x);
  }
  const isoYearOf = (d) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - 3); return t.getUTCFullYear(); }; // week ends Sunday → ISO year of its Thursday

  /* ---------- stock on hand ---------- */
  function parseSOH(wb, sn, name, issues) {
    const g = rows(wb, sn); const gh = findN(g, 'greenbeansstock'); if (!gh) return null;
    const hr = g.findIndex((r, i) => i > gh[0] && (r || []).some((v) => norm(v) === 'greenbeansorigin')); if (hr < 0) return null; const h = g[hr];
    const cIdx = (key, from = 0, to = h.length) => { for (let i = from; i < to; i++) if (norm(h[i]).startsWith(key)) return i; return -1; };
    const rb = cIdx('beanstype'); const L = { grp: 0, origin: cIdx('greenbeansorigin'), soh: cIdx('soh', 1, rb), target: cIdx('target', 1, rb), doh: cIdx('daysonhand', 1, rb), tstock: cIdx('totalstock'), tdoh: cIdx('totaldoh', 1, rb), pipe: cIdx('ordersin'), eta: cIdx('eta'), status: cIdx('status') };
    const R = { type: rb, soh: cIdx('soh', rb), target: cIdx('target', rb), doh: cIdx('daysonhand', rb), tdoh: cIdx('totaldoh', rb) }; const noteC = Math.max(...Object.values(R)) + 1;
    [['origin', L.origin], ['soh', L.soh], ['target', L.target], ['roast beans type', rb]].forEach(([n, v]) => { if (v < 0) issues.push(I('error', `Stock sheet: column "${n}" not found.`)); });
    let date = null; for (let r = 0; r < gh[0]; r++) (g[r] || []).forEach((v) => { if (!date) date = serial(v) || (typeof v === 'string' ? LM.parseDay(v) : null); });
    if (!date) { const m = /(\d{1,2})[-_.\s]*(oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep)[a-z]*[-_.,\s]*(20\d\d)/i.exec(name + ' ' + sn); if (m) date = LM.parseDay(`${m[3]}-${String(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase()) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`); }
    const green = []; let grp = null; const roast = []; let rt = null; let stop = false; const stray = [];
    for (let r = hr + 1; r < g.length; r++) {
      const x = g[r] || []; if (!x.some((v) => v != null && String(v).trim() !== '')) { if (green.length) grp = null; continue; }
      const origin = txt(x[L.origin]); const type = txt(x[R.type]);
      if (origin) {
        if (txt(x[L.grp]) && /^blend for/i.test(txt(x[L.grp])) && grp) grp.blendNote = txt(x[L.grp]);
        else if (txt(x[L.grp])) grp = { name: txt(x[L.grp]), target: num(x[L.target]), totalStock: num(x[L.tstock]), totalDoh: num(x[L.tdoh]), items: [], row: r + 1 }, green.push(grp);
        if (!grp) { stray.push(r + 1); continue; }
        if (grp.target == null && num(x[L.target]) != null) grp.target = num(x[L.target]);
        grp.items.push({ origin, soh: num(x[L.soh]), doh: num(x[L.doh]), pipeline: txt(x[L.pipe]), eta: txt(x[L.eta]), status: txt(x[L.status]), row: r + 1 });
        if (!txt(x[L.grp]) && num(x[L.tstock]) != null && grp.totalStock == null) { grp.totalStock = num(x[L.tstock]); grp.totalDoh = num(x[L.tdoh]); }
      }
      if (type) { const t = num(x[R.target]); if (t != null) rt = t; roast.push({ type, soh: num(x[R.soh]), target: t, inherited: t != null ? t : rt, doh: num(x[R.doh]), totalDoh: num(x[R.tdoh]), note: txt(x[noteC]) || txt(x[noteC - 1] && typeof x[noteC - 1] === 'string' && x[noteC - 1] !== type ? x[noteC - 1] : ''), row: r + 1 }); }
      if (!origin && !type) stray.push(r + 1);
    }
    if (stray.length) issues.push(I('info', `Unlabelled figures at row(s) ${stray.slice(0, 6).join(', ')} below the stock table were ignored.`));
    // checks
    green.forEach((p) => {
      const s = sum(p.items, (i) => i.soh);
      if (p.totalStock != null && Math.abs(p.totalStock - s) > 1) issues.push(I('warn', `${p.name}: "Total Stock" is ${p.totalStock.toLocaleString()} but the origins add up to ${s.toLocaleString()}.`));
      if (p.target > 0) { p.items.forEach((i) => { if (i.soh != null && i.doh != null) { const e = (i.soh / p.target) * 30; if (DOH_TOL(i.doh, e)) issues.push(I('warn', `${p.name} / ${i.origin}: days on hand is ${i.doh.toFixed(1)} but SOH ÷ target × 30 = ${e.toFixed(1)}.`)); } });
        if (p.totalDoh != null) { const t = p.totalStock != null ? p.totalStock : s; const e = (t / p.target) * 30; if (DOH_TOL(p.totalDoh, e)) issues.push(I('warn', `${p.name}: "Total DOH" is ${p.totalDoh.toFixed(1)} but total stock ÷ target × 30 = ${e.toFixed(1)}.`)); } }
    });
    roast.forEach((x) => { const tg = x.target != null ? x.target : x.inherited; if (tg > 0 && x.soh != null && x.doh != null) { const e = (x.soh / tg) * 30; if (DOH_TOL(x.doh, e)) issues.push(I('warn', `${x.type}: days on hand is ${x.doh.toFixed(1)} but SOH ÷ target × 30 = ${e.toFixed(1)} (target ${tg.toLocaleString()}).`)); } if (x.target == null && x.doh != null) x.target = x.inherited; });
    const negS = [...green.flatMap((p) => p.items.map((i) => [i.origin, i.soh])), ...roast.map((x) => [x.type, x.soh])].filter(([, v]) => v != null && v < 0); if (negS.length) issues.push(I('warn', `Negative stock: ${negS.map(([n]) => n).join(', ')}.`));
    const noS = [...green.flatMap((p) => p.items), ...roast].filter((i) => i.soh == null); if (noS.length) issues.push(I('info', `${noS.length} line(s) have no stock figure: ${noS.slice(0, 4).map((i) => i.origin || i.type).join(', ')}.`));
    if (!date) issues.push(I('warn', 'The stock sheet has no readable date.'));
    return { date, green, roast, sheet: sn };
  }

  function parseSKU(wb, sn) { const g = rows(wb, sn); const f = find(g, /250\s*g.*soh/i); if (!f) return null; const hr = g.findIndex((r, i) => i > f[0] && (r || []).some((v) => norm(v) === 'sku')); if (hr < 0) return null; const out = []; for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const k = (x || []).findIndex((v) => typeof v === 'string' && v.trim()); if (k < 0) continue; const v = num(x.slice(k + 1).find((y) => num(y) != null)); out.push({ sku: txt(x[k]), pcs: v }); } return out; }
  function parseRequired(wb, sn) { const g = rows(wb, sn); const f = find(g, /^roast beans$/i); if (!f) return null; const hr = g.findIndex((r, i) => i >= f[0] && (r || []).some((v) => /beans type/i.test(String(v)))); if (hr < 0) return null; const h = g[hr]; const cols = h.map((v, i) => [i, txt(v)]).filter(([, t]) => t); const out = []; let last = null;
    for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; if (/last update/i.test(x.map(txt).join('|'))) { const v = x.map(serial).find(Boolean); last = v || null; continue; } if (!cols.some(([i]) => txt(x[i]))) continue; const o = {}; cols.forEach(([i, t]) => (o[t] = x[i] == null ? '' : x[i])); out.push(o); } return { cols: cols.map(([, t]) => t), rows: out, lastUpdate: last }; }
  function parseMonthly(wb, sn) { const g = rows(wb, sn); const f = find(g, /production-consumption/i); if (!f) return null; const blocks = []; const hr = g.findIndex((r, i) => i > f[0] && (r || []).some((v) => norm(v) === 'month')); if (hr < 0) return null; const h = g[hr]; const starts = h.map((v, i) => (norm(v) === 'month' ? i : -1)).filter((i) => i >= 0); const titles = g[hr - 1] || [];
    starts.forEach((c0, bi) => { const name = txt(titles[c0]) || `Block ${bi + 1}`; const rowsB = []; for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const m = txt(x[c0]); if (!m) { if (num(x[c0 + 1]) != null) { rowsB.push({ month: 'Total', prod: num(x[c0 + 1]), cons: num(x[c0 + 2]), diff: num(x[c0 + 3]), total: true }); } continue; } rowsB.push({ month: m, prod: num(x[c0 + 1]), cons: num(x[c0 + 2]), diff: num(x[c0 + 3]) }); } blocks.push({ name, rows: rowsB }); }); return blocks; }

  function analyze(wb, name, ov, template, existing, hash) {
    ov = ov || {}; existing = existing || []; const issues = []; const data = {};
    wb.SheetNames.forEach((sn) => { const g = rows(wb, sn).slice(0, 80); const has = (re) => g.some((r) => (r || []).some((v) => typeof v === 'string' && re.test(v)));
      if (!data.weekly && has(/utili[sz]ation/i) && has(/roasted/i)) { const w = parseWeekly(wb, sn, issues); if (w) data.weekly = w; }
      if (!data.soh && findN(rows(wb, sn).slice(0, 80), 'greenbeansstock')) { const s = parseSOH(wb, sn, name, issues); if (s) data.soh = s; }
      if (!data.sku && has(/250\s*g.*soh/i)) { const s = parseSKU(wb, sn); if (s) data.sku = s; }
      if (!data.required && has(/required container/i)) { const s = parseRequired(wb, sn); if (s) data.required = s; }
      if (!data.monthly && has(/production-consumption/i)) { const s = parseMonthly(wb, sn); if (s) data.monthly = s; } });
    if (!data.weekly && !data.soh) return { ds: null, issues: [I('error', 'This does not look like the Roasting report (no weekly production table and no green/roast stock sheet found).')] };
    if (!data.weekly) issues.push(I('warn', 'No weekly production table found.')); if (!data.soh) issues.push(I('warn', 'No stock-on-hand sheet found.'));
    const lastWeek = data.weekly && data.weekly[data.weekly.length - 1]; const sohDate = data.soh && data.soh.date;
    const fn = (/(\d{1,2})[-_\s]*([A-Za-z]{3})[a-z]*[-_\s]*(20\d\d)/.exec(name) || null); const fnDate = fn ? LM.parseDay(`${fn[3]}-${String(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(fn[2].toLowerCase()) + 1).padStart(2, '0')}-${fn[1].padStart(2, '0')}`) : null;
    const asOf = sohDate || (lastWeek && lastWeek.end) || fnDate;
    if (!asOf) issues.push(I('error', 'The report date could not be found.', { type: 'asOf', id: 'date', kind: 'date', label: 'Use this date' }));
    if (ov.asOf && ov.asOf.date) { /* manual date wins */ }
    const useDate = (ov.asOf && ov.asOf.date) || asOf;
    if (sohDate && lastWeek && Math.abs(days(sohDate, lastWeek.end)) > 7) issues.push(I('warn', `Stock sheet is dated ${sohDate} but the latest production week ends ${lastWeek.end}.`));
    if (fnDate && useDate && fnDate !== useDate) issues.push(I('warn', `The file name says ${fnDate} but the report content is dated ${useDate}.`));
    // cross-checks between sheets
    if (data.sku && data.soh) data.sku.forEach((s) => { const k = norm(s.sku); const r = data.soh.roast.find((x) => norm(x.type).startsWith(k)); if (r && r.soh != null && s.pcs != null && Math.abs(r.soh - s.pcs) > 0.5) issues.push(I('warn', `250g stock for "${s.sku}" is ${s.pcs.toLocaleString()} on the 250G SOH sheet but ${r.soh.toLocaleString()} on the stock sheet.`)); });
    if (data.required && data.required.lastUpdate && useDate) { const a = days(data.required.lastUpdate, useDate); if (a > 30) issues.push(I('warn', `The "Required Qty" planning table was last updated ${data.required.lastUpdate} (${a} days before this report).`)); }
    if (data.required && data.soh) data.required.rows.forEach((r) => { const t = String(r['Beans Type'] || '').trim(); const tot = r['Total RB']; const m = /^(\d+(?:\.\d+)?)\s*pcs/i.exec(String(tot || '')); if (!m) return; if (!/b2c/i.test(t)) return; const roast = data.soh.roast.find((x) => norm(x.type).startsWith(norm(t).replace(/pcs$/, ''))); if (roast && roast.target && Math.abs(roast.target - +m[1]) > 1) issues.push(I('warn', `Target for "${t}" is ${(+m[1]).toLocaleString()} pcs on the Required Qty sheet but ${roast.target.toLocaleString()} on the stock sheet.`)); });
    if (data.monthly) { data.monthly.forEach((b) => { const R = b.rows.filter((x) => !x.total); R.forEach((x) => { if (x.prod != null && x.cons != null && x.diff != null && Math.abs(x.prod - x.cons - x.diff) > 0.5) issues.push(I('warn', `${b.name}, ${x.month}: difference ${x.diff} ≠ production − consumption (${x.prod - x.cons}).`)); }); const T = b.rows.find((x) => x.total); if (T) { if (Math.abs(T.prod - sum(R, (x) => x.prod)) > 0.5 || Math.abs(T.cons - sum(R, (x) => x.cons)) > 0.5) issues.push(I('warn', `${b.name}: total row does not match the months above.`)); } }); issues.push(I('info', 'The production-consumption table (months only) has no year; it is shown as received.')); }
    // changes vs previous upload
    const prev = [...existing].sort((a, b) => (a.end < b.end ? 1 : -1)).find((e) => e.end <= (useDate || '9999'));
    if (prev && data.weekly && prev.data.weekly) { const m = {}; prev.data.weekly.forEach((w) => (m[w.end] = w)); const ch = data.weekly.filter((w) => m[w.end] && (Math.abs((m[w.end].tons || 0) - (w.tons || 0)) > 0.01 || (m[w.end].rej || 0) !== (w.rej || 0))); if (ch.length) issues.push(I('warn', `${ch.length} earlier week(s) differ from the previous upload: ${ch.slice(0, 4).map((w) => `${w.year} wk ${w.no} (${m[w.end].tons} → ${w.tons} t)`).join('; ')}.`)); const added = data.weekly.filter((w) => !m[w.end]).length; issues.push(I('info', `${added} new week(s) since the previous upload (${prev.end}).`)); }
    if (prev && data.soh && prev.data.soh) { const a = new Set([...prev.data.soh.green.flatMap((p) => p.items.map((i) => i.origin)), ...prev.data.soh.roast.map((x) => x.type)]), b = new Set([...data.soh.green.flatMap((p) => p.items.map((i) => i.origin)), ...data.soh.roast.map((x) => x.type)]); const add = [...b].filter((x) => !a.has(x)), gone = [...a].filter((x) => !b.has(x)); if (add.length) issues.push(I('info', `New stock line(s): ${add.join(', ')}.`)); if (gone.length) issues.push(I('warn', `Stock line(s) missing compared with the previous upload: ${gone.join(', ')}.`)); }
    existing.forEach((e) => { if (e.hash === hash) issues.push(I('warn', `This exact file was already uploaded (${e.end}, on ${e.uploadedAt.slice(0, 10)}).`)); else if (useDate && e.end === useDate) issues.push(I('warn', `A report dated ${useDate} already exists. Approving replaces it (the old version is kept in history).`)); else if (useDate && e.end > useDate) issues.push(I('warn', `A newer report (${e.end}) already exists. This one is older.`)); });
    return { ds: { type: 'roasting', start: useDate, end: useDate, data }, issues };
  }

  /* One line per use. Green beans follow the sheet's own groups (Espresso, Ethiopia Drip, New B2C/B2B ...); roasted products are
     folded into the same uses by name. Total SOH = sum of the lines; DOH = total SOH ÷ monthly target × 30. The sheet's own totals are
     only used to flag differences. */
  const USE = [[/^espresso/i, 'Espresso'], [/^drip\s*ethiop/i, 'Ethiopia Drip'], [/^drip\s*brazil/i, 'Brazilian Drip'], [/^b2c\s*colomb/i, 'B2C Colombian'], [/^b2c\s*brazil/i, 'B2C Brazilian'], [/^b2c\s*ethiop/i, 'B2C Ethiopian'], [/^b2c/i, 'New B2C/B2B'], [/^v60/i, 'V60'], [/^ufo\s*ethiop/i, 'UFO ETHIOPAN'], [/^ufo/i, 'UFO BLEND']];
  const useOf = (t) => { const f = USE.find(([re]) => re.test(String(t).trim())); return f ? f[1] : String(t).trim(); };
  const COVERED = 14; // days of roasted stock that count as "sufficient"
  function byUse(soh) {
    const out = { green: [], roast: [], checks: [] }; if (!soh) return out; const dohOf = (st, tg) => (tg > 0 && st != null ? (st / tg) * 30 : null);
    const R = new Map(); soh.roast.forEach((x) => { const u = useOf(x.type); if (!R.has(u)) R.set(u, { use: u, soh: 0, targets: [], lines: [], sheetDoh: null }); const r = R.get(u); r.soh += x.soh || 0; if (x.target != null) r.targets.push(x.target); r.lines.push(x); if (x.totalDoh != null && r.sheetDoh == null) r.sheetDoh = x.totalDoh; });
    R.forEach((r) => { const t = r.targets.length ? (r.targets.every((v) => v === r.targets[0]) ? r.targets[0] : r.targets.reduce((a, v) => a + v, 0)) : null; r.target = t; r.doh = r.sheetDoh != null ? r.sheetDoh : dohOf(r.soh, t); out.roast.push(r); });
    // green beans: the sheet's own "Total stock" and "Total DOH" for each use (a use can leave a line out of its total on purpose)
    soh.green.forEach((g) => { const lines = g.items.filter((i) => i.soh != null); const sumL = lines.reduce((a, i) => a + i.soh, 0); const total = g.totalStock != null ? g.totalStock : sumL;
      const doh = g.totalDoh != null ? g.totalDoh : dohOf(total, g.target); const r = R.get(useOf(g.name)); const roastDoh = r ? r.doh : null;
      out.green.push({ use: g.name, soh: total, target: g.target, doh, lines: g.items, incoming: g.items.map((i) => [i.pipeline, i.eta, i.status].filter(Boolean).join(' · ')).filter(Boolean), delayed: g.items.some((i) => /delay/i.test(i.status || '')), roastDoh, covered: roastDoh != null && roastDoh >= COVERED }); });
    return out;
  }
  LM.roasting = { analyze, isoWeekEnd, parseSOH, byUse, useOf };
})(typeof window !== 'undefined' ? window : globalThis);
