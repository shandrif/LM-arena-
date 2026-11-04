/* Quality department: five different weekly reports, each recognised automatically and parsed by label (not by cell address),
   so small layout shifts do not break them. No DOM. */
(function (root) {
  const LM = (root.LM = root.LM || {});
  const { norm, clean } = LM;

  const TYPES = {
    trend: { label: 'Complaints trend', hint: '2026 Weekly (sheet “Weekly_Trend”)' },
    coo: { label: 'Weekly update', hint: 'Quality inspections, critical issues, complaints' },
    audit: { label: 'Roasting factory audit', hint: 'Audit summary and non-conformities' },
    visits: { label: 'ROM & AM store visits', hint: 'Visit targets and geo compliance' },
    wifi: { label: 'Branch WiFi status', hint: 'WIFI report' },
  };
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const addDays = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const rows = (wb, n) => LM.engine.rowsOf(wb, n);
  const txt = (v) => (v == null ? '' : clean(v));
  const numOf = (v) => (typeof v === 'number' ? v : LM.parseNum(v));
  const monthOf = (s) => MON.indexOf(String(s).slice(0, 3).toLowerCase());
  const excelDay = (v) => (typeof v === 'number' && v > 30000 && v < 80000 ? LM.parseDay(v) : null);

  /** All "<month> <day>" / "<day> <month>" tokens of a label -> [{m,d}] */
  function dateTokens(label) {
    const out = []; const re = /([A-Za-z]{3,9})\W{0,3}(\d{1,2})\b|(\d{1,2})\W{0,3}([A-Za-z]{3,9})\b/g; let m;
    while ((m = re.exec(String(label).replace(/\s+/g, ' ')))) {
      const mon = monthOf(m[1] || m[4]); const d = +(m[2] || m[3]);
      if (mon >= 0 && MON.includes(String(m[1] || m[4]).slice(0, 3).toLowerCase()) && d >= 1 && d <= 31) out.push({ m: mon + 1, d });
    }
    return out;
  }
  /** "Oct 03 - Oct 09" -> {start,end}; year taken from hint, rolled back when the range wraps a year end. */
  function parseRange(label, yearHint) {
    const t = dateTokens(label); if (t.length < 2) return null;
    const a = t[0], b = t[t.length - 1]; const yEnd = yearHint; const yStart = a.m > b.m ? yEnd - 1 : yEnd;
    return { start: iso(yStart, a.m, a.d), end: iso(yEnd, b.m, b.d) };
  }
  function parseNamedDate(v, yearHint) {
    const d = excelDay(v); if (d) return d;
    const s = txt(v); if (!s) return null;
    const iso1 = LM.parseDay(s); if (iso1) return iso1;
    const t = dateTokens(s); if (!t.length) return null;
    const y = /(\d{4})/.exec(s) ? +/(\d{4})/.exec(s)[1] : (/\b(\d{2})\s*$/.test(s) ? 2000 + +/\b(\d{2})\s*$/.exec(s)[1] : yearHint);
    return iso(y, t[0].m, t[0].d);
  }
  /** Period written into a file name: Oct_04-Oct_10 or 10-Oct-_16-Oct_2026 / 11_Oct_-_17_Oct */
  function periodFromName(name, yearHint) {
    const n = String(name).replace(/\.[A-Za-z0-9]+$/, '');
    const y = (/(20\d\d)/.exec(n) || [])[1] ? +/(20\d\d)/.exec(n)[1] : yearHint;
    let m = /([A-Za-z]{3})[_\s-]*(\d{1,2})[_\s-]+([A-Za-z]{3})[_\s-]*(\d{1,2})/.exec(n);
    if (m && monthOf(m[1]) >= 0 && monthOf(m[3]) >= 0) return fix(monthOf(m[1]) + 1, +m[2], monthOf(m[3]) + 1, +m[4], y);
    m = /(\d{1,2})[_\s-]*([A-Za-z]{3})[_\s-]+(\d{1,2})[_\s-]*([A-Za-z]{3})/.exec(n);
    if (m && monthOf(m[2]) >= 0 && monthOf(m[4]) >= 0) return fix(monthOf(m[2]) + 1, +m[1], monthOf(m[4]) + 1, +m[3], y);
    return null;
    function fix(m1, d1, m2, d2, yy) { return { start: iso(m1 > m2 ? yy - 1 : yy, m1, d1), end: iso(yy, m2, d2) }; }
  }
  const yearHintFor = (name, wb) => { const m = /(20\d\d)/.exec(name || '') || (wb && wb.SheetNames.map((s) => /^(20\d\d)$/.exec(s)).find(Boolean)); return m ? +m[1] : new Date().getFullYear(); };

  /* ------------------------------------------------------------------ detection */
  function detect(wb) {
    const names = wb.SheetNames.map(norm);
    const hasText = (re, maxSheets = 3) => wb.SheetNames.slice(0, maxSheets).some((n) => rows(wb, n).slice(0, 60).some((r) => (r || []).some((v) => typeof v === 'string' && re.test(v))));
    if (names.includes('weeklytrend') || wb.SheetNames.some((n) => rows(wb, n).slice(0, 5).some((r) => (r || []).some((v) => norm(v) === 'qualitycomplaints')))) return 'trend';
    if (hasText(/quality inspections? points|pending capa/i) || names.includes('coo')) return 'coo';
    if (hasText(/factory audit|audit overview/i)) return 'audit';
    if (names.some((n) => /storevisit|geocompliance/.test(n)) || hasText(/store visit|geo compliance/i)) return 'visits';
    if (names.includes('wifi') || hasText(/^wi-?fi/i) || wb.SheetNames.some((n) => { const g = rows(wb, n).slice(0, 8); return g.some((r) => (r || []).some((v) => norm(v) === 'branch') && (r || []).some((v) => norm(v) === 'status')); })) return 'wifi';
    return null;
  }

  const I = (level, msg, fix) => ({ level, msg, fix });
  const findCell = (g, re, from = 0) => { for (let r = from; r < g.length; r++) { const row = g[r] || []; for (let c = 0; c < row.length; c++) if (typeof row[c] === 'string' && re.test(row[c])) return [r, c]; } return null; };
  const nextVal = (g, r, c, pred = (v) => v != null && String(v).trim() !== '') => { const row = g[r] || []; for (let i = c + 1; i < row.length; i++) if (pred(row[i])) return row[i]; return null; };

  /* ------------------------------------------------------------------ parsers: each returns {data, start, end, issues} */
  function parseTrend(wb, name, ov) {
    const issues = []; const yh = yearHintFor(name, wb);
    const spec = { id: 'trend', label: 'Complaints trend', sheets: { trend: { label: 'weekly trend', names: ['Weekly_Trend', 'Weekly Trend'], required: true, keyCol: 'week', ignoreCols: ['Quality WoW Change', 'Ops WoW Change'],
      cols: { week: { label: 'Week', type: 'text', required: true }, dates: { label: 'Week Dates', aliases: ['Dates', 'Period'], type: 'text', required: true },
        qC: { label: 'Quality Complaints', aliases: ['Quality'], type: 'num', required: true }, qR: { label: 'Quality Contact Ratio', type: 'num', required: true },
        oC: { label: 'Ops Complaints', aliases: ['Operations Complaints'], type: 'num', required: true }, oR: { label: 'Ops Contact Ratio', aliases: ['Operations Contact Ratio'], type: 'num', required: true },
        qW: { label: 'Quality WoW Change', type: 'num', required: false }, oW: { label: 'Ops WoW Change', type: 'num', required: false } } } } };
    const r = LM.engine.analyze(wb, spec, ov, {}); issues.push(...r.issues);
    const t = r.sheets.trend; if (!t || t.blocked) return { issues, data: { weeks: [] } };
    // customers per week from the main "2026" sheet (if present)
    const custByNo = {}; const main = wb.SheetNames.find((n) => /^20\d\d$/.test(n.trim()));
    if (main) {
      const g = rows(wb, main); const wkRow = g.findIndex((x) => norm((x || [])[0]) === 'week');
      const cr = g.findIndex((x) => /^customer count\s*$/i.test(txt((x || [])[0])));
      const cc = g.findIndex((x) => /^complaints\s*$/i.test(txt((x || [])[0])));
      if (wkRow >= 0 && cr >= 0) (g[wkRow] || []).forEach((w, c) => { if (typeof w === 'number' && typeof g[cr][c] === 'number') custByNo[w] = { cust: g[cr][c], comp: cc >= 0 ? g[cc][c] : null }; });
      issues.push(I('info', `Sheet "${main}" is used only for customer counts; its day-range breakdown rows carry shifted labels and are ignored.`));
    } else issues.push(I('info', 'No main year sheet found: customer counts are derived from complaints ÷ contact ratio.'));
    let weeks = t.rows.map((x) => {
      const no = +(String(x.week).match(/\d+/) || [])[0]; const rg = parseRange(x.dates, yh);
      return { no, label: txt(x.dates), qC: x.qC, qR: x.qR, oC: x.oC, oR: x.oR, rg, cust: custByNo[no] ? custByNo[no].cust : (x.qR ? Math.round((x.qC / x.qR) * 1e5) : null), mainC: custByNo[no] ? custByNo[no].comp : null };
    }).filter((w) => w.no);
    weeks.sort((a, b) => a.no - b.no);
    // dates: weeks are 7 days; derive from the end of the label, walk back from the first week
    let prevEnd = null; const repaired = [];
    weeks.forEach((w) => {
      let end = w.rg ? w.rg.end : null; if (prevEnd && (!end || end !== addDays(prevEnd, 7))) { if (end) repaired.push(w.no); end = addDays(prevEnd, 7); }
      if (!end) { issues.push(I('error', `Week ${w.no}: dates "${w.label}" could not be read.`)); return; }
      w.end = end; w.start = addDays(end, -6); prevEnd = end;
      if (w.rg && w.rg.start !== w.start && !repaired.includes(w.no)) repaired.push(w.no);
    });
    if (repaired.length) issues.push(I('info', `Date label(s) look wrong for week(s) ${repaired.join(', ')}; dates were rebuilt from the weekly sequence.`));
    weeks = weeks.filter((w) => w.end);
    // sequence checks
    const nos = weeks.map((w) => w.no); const gaps = []; for (let i = 1; i < nos.length; i++) for (let k = nos[i - 1] + 1; k < nos[i]; k++) gaps.push(k);
    if (gaps.length) issues.push(I('warn', `Week number(s) missing from the sequence: ${gaps.slice(0, 8).join(', ')}.`));
    if (new Set(nos).size !== nos.length) issues.push(I('warn', 'Some week numbers appear more than once.'));
    // ratio check (complaints per 100,000 customers)
    const bad = weeks.filter((w) => w.cust && w.qR != null && Math.abs((w.qC / w.cust) * 1e5 - w.qR) > 0.05);
    if (bad.length) issues.push(I('warn', `Quality contact ratio does not equal complaints ÷ customers × 100,000 for week(s) ${bad.slice(0, 8).map((w) => w.no).join(', ')}.`));
    const mism = weeks.filter((w) => w.mainC != null && w.mainC !== w.qC); if (mism.length) issues.push(I('warn', `Quality complaints differ between "Weekly_Trend" and the main sheet for week(s) ${mism.slice(0, 8).map((w) => w.no).join(', ')}.`));
    const neg = weeks.filter((w) => w.qC < 0 || w.oC < 0); if (neg.length) issues.push(I('warn', 'Negative complaint counts found.'));
    const last = weeks[weeks.length - 1];
    return { issues, start: weeks[0] && weeks[0].start, end: last && last.end, data: { weeks: weeks.map(({ rg, mainC, ...w }) => w) } };
  }

  function parseCOO(wb, name, ov) {
    const issues = []; const sn = wb.SheetNames.find((n) => rows(wb, n).some((r) => (r || []).some((v) => typeof v === 'string' && /quality inspections? points|pending capa/i.test(v)))) || wb.SheetNames[0];
    const g = rows(wb, sn); const yh = yearHintFor(name, wb);
    const kpi = (re, label) => { const f = findCell(g, re); if (!f) { issues.push(I('error', `"${label}" was not found in sheet "${sn}".`)); return null; } const v = numOf(nextVal(g, f[0], f[1], (x) => numOf(x) != null)); if (v == null) issues.push(I('error', `"${label}" has no number next to it.`)); return v; };
    const k = { branches: kpi(/total branches visited/i, 'Total Branches Visited'), major: kpi(/total major observ/i, 'Total Major Observations'), minor: kpi(/total minor observ/i, 'Total Minor Observation'),
      critical: kpi(/total critical observ/i, 'Total Critical Observation'), done: kpi(/action items done/i, 'Action items done'), pending: kpi(/action items pending/i, 'Action items pending') };
    if (k.done != null && k.pending != null) { const f = findCell(g, /action items pending/i); const tot = f ? numOf(nextVal(g, f[0], f[1] + 2, (x) => numOf(x) != null)) : null; if (tot != null && tot !== k.done + k.pending) issues.push(I('warn', `Action items: done (${k.done}) + pending (${k.pending}) = ${k.done + k.pending}, but the sheet shows ${tot}.`)); }
    // critical issue groups: header cells like "Expiry (1)" followed by numbered text in the same column
    const ci = findCell(g, /^critical issues/i); const weeklyRow = findCell(g, /^weekly\s*$/i); const stop = weeklyRow ? weeklyRow[0] : g.length;
    const groups = [];
    if (ci) for (let r = ci[0] + 1; r < stop; r++) (g[r] || []).forEach((v, c) => {
      const m = typeof v === 'string' && /^(.+?)\s*\((\d+)\)\s*$/.exec(clean(v)); if (!m) return;
      let body = ''; for (let rr = r + 1; rr < Math.min(stop, r + 4); rr++) if (typeof (g[rr] || [])[c] === 'string' && clean(g[rr][c])) { body = clean(g[rr][c]); break; }
      const parts = body.split(/(?:^|\s)(\d{1,2})\.\s+/).slice(1); const items = [];
      for (let i = 0; i < parts.length; i += 2) { const s = clean(parts[i + 1]); const mm = /^(.+?)\s+-\s+(.*)$/.exec(s); items.push(mm ? { store: mm[1], text: mm[2] } : { store: '', text: s }); }
      groups.push({ title: clean(m[1]), n: +m[2], items });
      if (items.length !== +m[2]) issues.push(I('warn', `Critical group "${clean(m[1])}" says ${m[2]} but ${items.length} numbered item(s) were found.`));
    });
    if (!groups.length) issues.push(I('warn', 'No critical-issue groups found.'));
    else if (k.critical != null && sum(groups, (x) => x.n) !== k.critical) issues.push(I('warn', `Critical groups add up to ${sum(groups, (x) => x.n)} but "Total Critical Observation" is ${k.critical}.`));
    // weekly table: blocks start at cells exactly "Period"
    const pr = g.findIndex((r) => (r || []).some((v) => norm(v) === 'period')); const blocks = [];
    if (pr >= 0) {
      const heads = (g[pr - 1] || []).filter((v) => typeof v === 'string' && v.trim()).map((v) => clean(v)); const row = g[pr] || []; const starts = row.map((v, c) => (norm(v) === 'period' ? c : -1)).filter((c) => c >= 0);
      starts.forEach((c0, bi) => {
        const c1 = bi + 1 < starts.length ? starts[bi + 1] : row.length; const cols = []; for (let c = c0 + 1; c < c1; c++) if (txt(row[c])) cols.push(c);
        const labels = cols.map((c) => txt(row[c])); const data = {};
        for (let r = pr + 1; r < Math.min(g.length, pr + 8); r++) { const lab = txt((g[r] || [])[c0]); if (!lab) { if (Object.keys(data).length) break; continue; } data[lab] = cols.map((c) => numOf(g[r][c])); }
        blocks.push({ name: heads[bi] || `Block ${bi + 1}`, labels, ranges: labels.map((l) => parseRange(l, yh)), data });
      });
    } else issues.push(I('warn', 'Weekly complaints table (row starting “Period”) not found.'));
    blocks.forEach((b) => b.ranges.forEach((r, i) => { if (!r) issues.push(I('warn', `Block "${b.name}": period "${b.labels[i]}" could not be read.`)); }));
    const wk = blocks.find((b) => b.data.Transactions && b.data['%'] && b.data.Complains);
    if (wk) wk.data.Transactions.forEach((t, i) => { const c = wk.data.Complains[i], p = wk.data['%'][i]; if (t && c != null && p != null && Math.abs((c / t) * 1e5 - p) > 0.05) issues.push(I('warn', `Weekly table "${wk.labels[i]}": % (${p.toFixed(2)}) is not complaints ÷ transactions × 100,000 (${((c / t) * 1e5).toFixed(2)}).`)); });
    // complaint cases
    const cases = []; let cat = null; let cols = null;
    g.forEach((r, i) => {
      r = r || []; if (norm(r[0]) === 'sn' && typeof r[1] === 'string') { cat = clean(r[1]); cols = { text: 1, store: r.findIndex((v) => norm(v) === 'store'), date: r.findIndex((v) => norm(v) === 'date'), time: r.findIndex((v) => norm(v) === 'time') }; return; }
      if (cat && typeof r[0] === 'number' && cols && txt(r[cols.text])) cases.push({ sn: r[0], category: cat, text: txt(r[cols.text]), store: txt(r[cols.store]), date: parseNamedDate(r[cols.date], yh), time: txt(r[cols.time]), row: i + 1 });
    });
    // period = the latest period label in the weekly table(s), else file name
    const ends = blocks.flatMap((b) => b.ranges.filter(Boolean).map((r) => r.end)).sort(); let end = ends[ends.length - 1] || null; let start = end ? addDays(end, -6) : null;
    const fn = periodFromName(name, yh);
    if (fn && end && (fn.end !== end)) issues.push(I('warn', `The file name says ${fn.start} → ${fn.end} but the latest period inside the file is ${start} → ${end}.`));
    if (!end && fn) { start = fn.start; end = fn.end; issues.push(I('info', 'Period taken from the file name.')); }
    cases.forEach((c) => { if (!c.date) issues.push(I('warn', `Complaint case ${c.sn} has no readable date.`)); else if (start && (c.date < start || c.date > end)) issues.push(I('warn', `Complaint case ${c.sn} (${c.store}) is dated ${c.date}, outside ${start} → ${end}.`)); if (!c.store) issues.push(I('warn', `Complaint case ${c.sn} has no store.`)); });
    if (!cases.length) issues.push(I('info', 'No individual complaint cases found.'));
    return { issues, start, end, data: { kpis: k, groups, blocks: blocks.map(({ ranges, ...b }) => ({ ...b, ends: ranges.map((r) => (r ? r.end : null)) })), cases } };
  }

  function parseAudit(wb, name) {
    const issues = []; const sn = wb.SheetNames.find((n) => rows(wb, n).some((r) => (r || []).some((v) => typeof v === 'string' && /audit overview|factory audit/i.test(v)))) || wb.SheetNames[0]; const g = rows(wb, sn);
    const val = (re, label, req = true) => { const f = findCell(g, re); if (!f) { if (req) issues.push(I('error', `"${label}" not found.`)); return null; } return nextVal(g, f[0], f[1]); };
    const dateRaw = val(/^audit date/i, 'Audit Date'); const date = parseNamedDate(dateRaw, new Date().getFullYear());
    if (dateRaw != null && !date) issues.push(I('error', `Audit date "${dateRaw}" could not be read.`));
    const pass = numOf(val(/^passing score/i, 'Passing Score')), score = numOf(val(/^score achieved/i, 'Score Achieved')); const result = txt(val(/^result/i, 'Result'));
    const crit = numOf(val(/^critical issues/i, 'Critical Issues Found')), major = numOf(val(/^major issues/i, 'Major Issues Found')), unans = numOf(val(/^unanswered/i, 'Unanswered Items', false));
    const hr = g.findIndex((r) => (r || []).some((v) => norm(v) === 'nonconformity') && (r || []).some((v) => /corrective action/i.test(String(v || ''))));
    const ncs = [];
    if (hr < 0) issues.push(I('warn', 'Non-conformity table not found.'));
    else {
      const h = g[hr]; const col = (re) => h.findIndex((v) => re.test(norm(v)));
      const c = { no: col(/^no$/), nc: col(/^nonconformity$/), cat: col(/^category$/), act: col(/^correctiveaction/), tgt: col(/^targetdate/), who: col(/^responsible/) };
      Object.entries(c).forEach(([k, i]) => { if (i < 0) issues.push(I('warn', `Non-conformity table: column "${k}" not found.`)); });
      for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; if (!txt(x[c.nc])) { if (ncs.length) break; continue; } ncs.push({ no: x[c.no], text: txt(x[c.nc]), category: txt(x[c.cat]), action: String(x[c.act] == null ? '' : x[c.act]).replace(/\r/g, '').trim(), target: excelDay(x[c.tgt]) || parseNamedDate(x[c.tgt], new Date().getFullYear()), owner: txt(x[c.who]) }); }
    }
    if (score != null && pass != null) { const exp = score >= pass ? 'PASS' : 'FAIL'; if (result && result.toUpperCase() !== exp) issues.push(I('warn', `Result says ${result} but score ${(score * 100).toFixed(1)}% vs passing ${(pass * 100).toFixed(1)}% means ${exp}.`)); }
    if (major != null && ncs.filter((n) => /major/i.test(n.category)).length !== major) issues.push(I('warn', `"Major Issues Found" is ${major} but ${ncs.filter((n) => /major/i.test(n.category)).length} major item(s) are listed.`));
    if (crit != null && ncs.filter((n) => /critical/i.test(n.category)).length !== crit) issues.push(I('warn', `"Critical Issues Found" is ${crit} but ${ncs.filter((n) => /critical/i.test(n.category)).length} critical item(s) are listed.`));
    ncs.forEach((n) => { if (!n.target) issues.push(I('warn', `Item ${n.no}: no valid target date.`)); else if (date && n.target < date) issues.push(I('warn', `Item ${n.no}: target date ${n.target} is before the audit date ${date}.`)); if (!n.owner) issues.push(I('warn', `Item ${n.no}: no responsible person.`)); if (!n.action) issues.push(I('warn', `Item ${n.no}: no corrective action.`)); });
    if (score != null && (score < 0 || score > 1)) issues.push(I('warn', `Score ${score} is outside 0–100%.`));
    return { issues, start: date, end: date, data: { date, passing: pass, score, result, critical: crit, major, unanswered: unans, ncs } };
  }

  function parseVisits(wb, name) {
    const issues = []; const yh = yearHintFor(name, wb); const people = {}; const periods = new Set();
    const sheets = wb.SheetNames.filter((n) => /visit|geo/i.test(n)); if (!sheets.length) issues.push(I('error', 'No visit / geo-compliance sheets found.'));
    sheets.forEach((sn) => {
      const geo = /geo/i.test(sn); const g = rows(wb, sn);
      g.forEach((r, i) => {
        r = r || []; const role = txt(r[1]); if (norm(r[0]) !== 'sn' || !/^(rom|am|[a-z]{2,4})$/i.test(role)) return;
        const lab = r.findIndex((v, c) => c > 1 && txt(v) && !numOf(v)); const per = lab >= 0 ? txt(r[lab]) : ''; const rg = parseRange(per, yh); if (rg) periods.add(rg.start + '|' + rg.end); else issues.push(I('warn', `Sheet "${sn}", ${role}: period "${per}" could not be read.`));
        const sub = g[i + 1] || []; const c = (re) => sub.findIndex((v) => re.test(norm(v)));
        const cols = geo ? { a: c(/^ofstorevisited|visited/), b: c(/^filledatlocation|filled/), p: c(/geocompliance|^$/) } : { a: c(/^target/), b: c(/^achieved/), p: sub.findIndex((v) => /^%$/.test(txt(v))) };
        if (cols.a < 0 || cols.b < 0) { issues.push(I('warn', `Sheet "${sn}", ${role}: expected column headings not found.`)); return; }
        for (let rr = i + 2; rr < g.length; rr++) {
          const x = g[rr] || []; const nm = txt(x[1]); if (!nm) break;
          if (/^total/i.test(nm)) { const key = `total|${role}`; people[key] = people[key] || { role, name: nm, total: true }; if (geo) { people[key].visitedT = numOf(x[cols.a]); people[key].filledT = numOf(x[cols.b]); } else { people[key].targetT = numOf(x[cols.a]); people[key].achievedT = numOf(x[cols.b]); } break; }
          const key = `${role}|${norm(nm)}`; const p = (people[key] = people[key] || { role, name: nm });
          if (geo) { p.visited = numOf(x[cols.a]); p.filled = numOf(x[cols.b]); } else { p.target = numOf(x[cols.a]); p.achieved = numOf(x[cols.b]); }
        }
      });
    });
    const list = Object.values(people).filter((p) => !p.total); const tot = Object.values(people).filter((p) => p.total);
    if (!list.length && sheets.length) issues.push(I('error', 'No ROM / AM rows were found.'));
    // checks
    ['ROM', 'AM'].forEach((role) => {
      const L = list.filter((p) => p.role.toUpperCase() === role); const T = tot.find((p) => p.role.toUpperCase() === role); if (!T) return;
      if (T.targetT != null && sum(L, (p) => p.target) !== T.targetT) issues.push(I('warn', `${role}: targets add up to ${sum(L, (p) => p.target)} but the total row says ${T.targetT}.`));
      if (T.achievedT != null && sum(L, (p) => p.achieved) !== T.achievedT) issues.push(I('warn', `${role}: achieved visits add up to ${sum(L, (p) => p.achieved)} but the total row says ${T.achievedT}.`));
      if (T.visitedT != null && sum(L, (p) => p.visited) !== T.visitedT) issues.push(I('warn', `${role} geo sheet: visits add up to ${sum(L, (p) => p.visited)} but the total row says ${T.visitedT}.`));
    });
    list.forEach((p) => {
      if (p.achieved != null && p.visited != null && p.achieved !== p.visited) issues.push(I('warn', `${p.name} (${p.role}): visit sheet says ${p.achieved} visits achieved but the geo sheet says ${p.visited} stores visited.`));
      if (p.filled != null && p.visited != null && p.filled > p.visited) issues.push(I('warn', `${p.name}: more visits filled at location (${p.filled}) than visits (${p.visited}).`));
      if (p.target != null && p.achieved != null && p.achieved > p.target * 1.25) issues.push(I('info', `${p.name}: ${p.achieved} visits against a target of ${p.target}.`));
    });
    let start = null, end = null; if (periods.size) { const ps = [...periods].sort(); [start, end] = ps[ps.length - 1].split('|'); if (periods.size > 1) issues.push(I('warn', `Sheets show different periods: ${ps.map((p) => p.replace('|', ' → ')).join(' ; ')}.`)); }
    const fn = periodFromName(name, yh); if (fn && start && (fn.start !== start || fn.end !== end)) issues.push(I('warn', `The file name says ${fn.start} → ${fn.end} but the sheet says ${start} → ${end}. Check which week this is.`));
    return { issues, start, end, data: { people: list, totals: tot } };
  }

  function parseWifi(wb, name, ov) {
    const issues = []; const sn = wb.SheetNames.find((n) => /wifi/i.test(n)) || wb.SheetNames[0]; const g = rows(wb, sn);
    const hr = g.findIndex((r) => (r || []).some((v) => norm(v) === 'branch') && (r || []).some((v) => norm(v) === 'status')); if (hr < 0) { issues.push(I('error', 'Header row (CODE / BRANCH / STATUS) not found.')); return { issues, data: { rows: [] } }; }
    const h = g[hr]; const ci = (re) => h.findIndex((v) => re.test(norm(v))); const c = { code: ci(/^code$/), branch: ci(/^branch$/), status: ci(/^status$/), issue: ci(/^issue/), action: ci(/^action/) };
    ['code', 'branch', 'status'].forEach((k) => { if (c[k] < 0) issues.push(I('error', `Column "${k}" not found.`)); });
    const out = []; for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; if (!txt(x[c.code]) && !txt(x[c.branch])) continue; out.push({ code: txt(x[c.code]).toUpperCase(), branch: txt(x[c.branch]), status: txt(x[c.status]), issue: c.issue >= 0 ? txt(x[c.issue]) : '', action: c.action >= 0 ? txt(x[c.action]) : '', row: r + 1 }); }
    const seen = new Set(); out.forEach((x) => { if (!/^B\d+$/.test(x.code)) issues.push(I('warn', `Row ${x.row}: branch code "${x.code}" is not in the usual B## format.`)); if (!x.status) issues.push(I('warn', `Row ${x.row} (${x.code}): status is empty.`)); if (seen.has(x.code)) issues.push(I('warn', `Branch ${x.code} appears more than once.`)); seen.add(x.code); });
    if (!out.length) issues.push(I('error', 'No branch rows found.'));
    const asOf = (ov && ov.asOf && ov.asOf.date) || null;
    if (!asOf) issues.push(I('error', 'This file has no date. Enter the week-ending date it applies to below.', { type: 'asOf', id: 'date', kind: 'date', label: 'Use this date' }));
    return { issues, start: asOf, end: asOf, data: { rows: out } };
  }

  const PARSERS = { trend: parseTrend, coo: parseCOO, audit: parseAudit, visits: parseVisits, wifi: parseWifi };

  /** Full pipeline for one file. ov.type forces a type. */
  function analyze(wb, name, ov, template, existing, hash, allSets) {
    ov = ov || {}; template = template || {}; existing = existing || [];
    const type = ov.type || detect(wb);
    if (!type) return { type: null, ds: null, issues: [I('error', 'This file was not recognised as one of the Quality reports (complaints trend, weekly update, factory audit, store visits, WiFi).', { type: 'type', id: 'type', options: Object.keys(TYPES), label: 'Treat this file as' })] };
    const r = PARSERS[type](wb, name, ov); const issues = r.issues.slice();
    if (ov.type) issues.unshift(I('info', `Treated as: ${TYPES[type].label}.`));
    const ds = { type, start: r.start || null, end: r.end || null, data: r.data };
    // history-based checks
    const same = existing.filter((e) => e.type === type);
    if (type === 'wifi' && same.length && ds.data.rows.length) {
      const last = [...same].sort((a, b) => (a.end < b.end ? 1 : -1))[0]; const a = new Set(last.data.rows.map((x) => x.code)), b = new Set(ds.data.rows.map((x) => x.code));
      const added = [...b].filter((x) => !a.has(x)), gone = [...a].filter((x) => !b.has(x)); if (added.length) issues.push(I('info', `New branch(es) vs previous WiFi report: ${added.join(', ')}.`)); if (gone.length) issues.push(I('warn', `Branch(es) missing vs previous WiFi report: ${gone.join(', ')}.`));
      const known = template.wifiStatuses || []; const ns = [...new Set(ds.data.rows.map((x) => x.status))].filter((s) => known.length && !known.includes(s)); if (ns.length) issues.push(I('warn', `New status value(s): ${ns.join(', ')}.`));
    }
    if (type === 'visits' && same.length && ds.data.people.length) {
      const last = [...same].sort((a, b) => (a.end < b.end ? 1 : -1))[0]; const a = new Set(last.data.people.map((x) => x.role + norm(x.name))); const b = new Set(ds.data.people.map((x) => x.role + norm(x.name)));
      const added = ds.data.people.filter((x) => !a.has(x.role + norm(x.name))).map((x) => x.name), gone = last.data.people.filter((x) => !b.has(x.role + norm(x.name))).map((x) => x.name);
      if (added.length) issues.push(I('info', `New person/people vs previous report: ${added.join(', ')}.`)); if (gone.length) issues.push(I('info', `Not in this report but in the previous one: ${gone.join(', ')}.`));
    }
    if (type === 'coo' && allSets) {
      const wk = (ds.data.blocks || []).find((b) => b.data.Transactions && b.data.Complains); const series = complaintSeries(allSets);
      if (wk) wk.ends.forEach((e, i) => { const old = series[e]; if (old && old.qC != null && wk.data.Complains[i] != null && old.qC !== wk.data.Complains[i]) issues.push(I('warn', `Week ending ${e}: complaints are ${wk.data.Complains[i]} here but ${old.qC} in the stored trend.`)); });
    }
    if (type === 'trend' && allSets) {
      const series = complaintSeries(allSets); (ds.data.weeks || []).forEach((w) => { const o = series[w.end]; if (o && o.qC != null && o.qC !== w.qC) issues.push(I('warn', `Week ending ${w.end}: complaints are ${w.qC} here but ${o.qC} in data already stored (it will be replaced).`)); });
      const st = existing.filter((e) => e.type === 'trend'); if (st.length) { const prev = st.sort((a, b) => (a.end < b.end ? 1 : -1))[0]; if (ds.end && prev.end && ds.end < prev.end) issues.push(I('warn', `This trend ends ${ds.end}, earlier than the stored one (${prev.end}). It looks like an older file.`)); }
    }
    if (!ds.start || !ds.end) { if (!issues.some((i) => i.fix && i.fix.type === 'asOf')) issues.push(I('error', 'The reporting period could not be determined.')); }
    existing.filter((e) => e.type === type).forEach((e) => {
      if (e.hash === hash) issues.push(I('warn', `This exact file was already uploaded (${e.start} → ${e.end}, on ${e.uploadedAt.slice(0, 10)}).`));
      else if (e.start === ds.start && e.end === ds.end) issues.push(I('warn', `A ${TYPES[type].label} report for ${ds.start} → ${ds.end} already exists. Approving replaces it (the old version is kept in history).`));
    });
    return { type, ds, issues };
  }

  /** Weekly complaint series keyed by week-end date, merged from trend snapshots and weekly-update tables (later upload wins). */
  function complaintSeries(sets) {
    const S = {};
    [...sets].sort((a, b) => (a.uploadedAt < b.uploadedAt ? -1 : 1)).forEach((s) => {
      if (s.type === 'trend') (s.data.weeks || []).forEach((w) => (S[w.end] = { ...(S[w.end] || {}), end: w.end, start: w.start, no: w.no, qC: w.qC, qR: w.qR, oC: w.oC, oR: w.oR, cust: w.cust }));
      if (s.type === 'coo') (s.data.blocks || []).forEach((b) => b.ends.forEach((e, i) => {
        if (!e) return; const o = (S[e] = S[e] || { end: e, start: addDays(e, -6) });
        if (b.data.Transactions && b.data.Complains) { o.qC = b.data.Complains[i]; o.cust = b.data.Transactions[i]; o.qR = b.data['%'] ? b.data['%'][i] : o.qR; o.src = 'COO'; }
        else if (/total/i.test(b.name) && b.data.Complains) o.total = b.data.Complains[i]; else if (/countable/i.test(b.name) && b.data.Complains) o.countable = b.data.Complains[i];
      }));
    });
    return S;
  }

  LM.quality = { TYPES, detect, analyze, complaintSeries, parseRange, periodFromName, addDays };
})(typeof window !== 'undefined' ? window : globalThis);
