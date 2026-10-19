/* Roasting: green bean sample (cupping / approval) report. One row per sample lot. No DOM. */
(function (root) {
  const LM = (root.LM = root.LM || {});
  const { norm, clean } = LM;
  const I = (level, msg, fix) => ({ level, msg, fix });
  const txt = (v) => (v == null ? '' : clean(v));
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const blank = (v) => { const t = txt(v); return !t || /^[_\-–]+$/.test(t) ? '' : t; };
  const COUNTRY = [['Ethiopia', /ethiop|guji|sidam|hamb[eé]?l+a?|chelchel|bensa|shakis|guitit|gotiti|yirg|sheba|nansebo|arsi|uraga|humbella|bombe|\bura\b|\bET\b/i], ['Colombia', /colom|las ?moras|las ?palmas|rojo|candelan|thila|mojito|malekah|peaches|wild berry|la viva|el diviso/i], ['Brazil', /brazil|cerrado|mogiana|minas|bou?rbon|lobo guara/i], ['Uganda', /ugand/i], ['Rwanda', /rawanda|rwanda|kizibera/i], ['Guatemala', /guatemala/i], ['Costa Rica', /costa rica/i], ['Honduras', /hondur/i], ['Nicaragua', /nicar/i], ['El Salvador', /salvador/i], ['Kenya', /kenya/i]];
  const country = (o) => { const c = COUNTRY.find(([, re]) => re.test(o)); return c ? c[0] : 'Not identified'; };
  const result = (v) => { const t = norm(txt(v)); if (!t) return ''; if (/^not?approved|^reject|^fail/.test(t)) return 'Not approved'; if (/^approved|^pass/.test(t)) return 'Approved'; if (/under|process|pending/.test(t)) return 'Under process'; return txt(v); };
  const KNOWN = ['Approved', 'Not approved', 'Under process'];

  function find(wb) { for (const sn of wb.SheetNames) { const g = LM.engine.rowsOf(wb, sn); const hr = g.slice(0, 15).findIndex((r) => (r || []).some((v) => /^origin/i.test(txt(v))) && (r || []).some((v) => /supplier/i.test(txt(v))) && (r || []).some((v) => /result|score/i.test(txt(v)))); if (hr >= 0) return { sn, g, hr }; } return null; }
  const detect = (wb) => !!find(wb);

  function period(sn) { const m = /^([a-z]{3})[a-z]*(?:[\s_-]+([a-z]{3})[a-z]*)?[\s_-]*(20\d\d)$/i.exec(txt(sn)); if (!m) return null; const a = MON.indexOf(m[1].toLowerCase()), b = m[2] ? MON.indexOf(m[2].toLowerCase()) : a; if (a < 0 || b < 0) return null; return { start: iso(m[3], a + 1, 1), end: iso(m[3], b + 1, new Date(Date.UTC(+m[3], b + 1, 0)).getUTCDate()), label: `${m[1].toUpperCase()}${m[2] ? '–' + m[2].toUpperCase() : ''} ${m[3]}` }; }

  function analyze(rf, existing, ov) {
    ov = ov || {}; existing = existing || []; const issues = []; const f = find(rf.wb);
    if (!f) return { ds: null, issues: [I('error', 'This does not look like the green bean sample report (no “Origin / Supplier / Result” header found).')] };
    const { g, hr, sn } = f; const h = g[hr]; const ci = (re) => h.findIndex((v) => re.test(txt(v)));
    const col = { origin: ci(/^origin/i), supplier: ci(/supplier/i), lot: ci(/^lot/i), process: ci(/process/i), grade: ci(/grade/i), date: ci(/received/i), beans: ci(/bean.*status/i), result: ci(/result|score/i) };
    Object.entries({ origin: 'Origin', supplier: 'Supplier Name', lot: 'Lot name', date: 'Received date', result: 'RESULT / SCORE' }).forEach(([k, l]) => { if (col[k] < 0) issues.push(I('error', `Column “${l}” was not found.`)); });
    if (issues.some((i) => i.level === 'error')) return { ds: null, issues };
    const other = rf.wb.SheetNames.filter((n) => n !== sn && (() => { const gg = LM.engine.rowsOf(rf.wb, n); return gg.slice(0, 15).some((r) => (r || []).some((v) => /^origin/i.test(txt(v)))); })()); if (other.length) issues.push(I('warn', `The file has more than one sample sheet (${[sn, ...other].join(', ')}). Only “${sn}” is read.`));
    // dates: strings are day/month/year; numeric cells are checked for swapped day/month
    const sure = []; const raw = [];
    for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const origin = txt(x[col.origin]); if (!origin) continue; const dv = x[col.date]; let date = null, kind = '';
      if (typeof dv === 'number') { date = LM.parseDay(dv); kind = 'serial'; } else if (typeof dv === 'string') { const t = dv.trim(); let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](20\d\d)$/.exec(t); if (m) { date = iso(m[3], +m[2], +m[1]); kind = 'text'; sure.push(date); } else if ((m = /^(\d{1,2})\D+(\d{1,2})\D+(20\d\d)$/.exec(t))) { date = iso(m[3], +m[2], +m[1]); kind = 'loose'; } else kind = 'bad'; }
      raw.push({ row: r + 1, origin, supplier: blank(x[col.supplier]), lot: blank(x[col.lot]), process: blank(x[col.process]), grade: blank(x[col.grade]), date, kind, dateRaw: typeof dv === 'string' ? dv.trim() : '', beans: blank(x[col.beans]), result: result(x[col.result]), resultRaw: txt(x[col.result]) }); }
    if (!raw.length) return { ds: null, issues: [I('error', 'No sample rows were found.')] };
    const ms = sure.map(Date.parse).sort((a, b) => a - b); const med = ms.length ? ms[Math.floor(ms.length / 2)] : null; let swapped = 0;
    raw.forEach((x) => { if (x.kind === 'serial' && x.date && med != null) { const [y, m, d] = x.date.split('-').map(Number); if (d <= 12 && d !== m) { const alt = iso(y, d, m); if (Math.abs(Date.parse(alt) - med) < Math.abs(Date.parse(x.date) - med)) { x.date = alt; x.swapped = true; swapped++; } } } });
    const per = ov.asOf && ov.asOf.date ? { start: ov.asOf.date.slice(0, 8) + '01', end: ov.asOf.date, label: ov.asOf.date.slice(0, 7) } : period(sn);
    if (!per) issues.push({ level: 'error', msg: `The report period could not be read from the sheet name “${sn}” (expected e.g. “AUG-SEP_2026”). Enter the period end date.`, fix: { type: 'asOf', id: 'date', kind: 'date', label: 'Period end date' } });
    // suppliers: merge spellings
    const sup = {}; raw.forEach((x) => { if (!x.supplier) return; const k = norm(x.supplier); (sup[k] = sup[k] || {})[x.supplier] = ((sup[k] || {})[x.supplier] || 0) + 1; });
    const pick = {}; Object.entries(sup).forEach(([k, v]) => { pick[k] = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0]; if (Object.keys(v).length > 1) issues.push(I('info', `Supplier spelled differently (${Object.keys(v).map((s) => `“${s}”`).join(', ')}); treated as one: “${pick[k]}”.`)); });
    raw.forEach((x) => { x.supplier = x.supplier ? pick[norm(x.supplier)] : ''; x.country = country(x.origin); });
    const R = raw;
    if (swapped) issues.push(I('warn', `${swapped} received date(s) are stored as real dates with day and month swapped (e.g. 10-Jan-2026 for 1 Oct 2026). They were read as day/month using the other dates in the file: ${R.filter((x) => x.swapped).slice(0, 4).map((x) => `row ${x.row} → ${x.date}`).join('; ')}. Please check.`));
    const bad = R.filter((x) => x.kind === 'bad' || !x.date); if (bad.length) issues.push(I('warn', `${bad.length} row(s) have no readable received date: ${bad.slice(0, 4).map((x) => `row ${x.row}`).join(', ')}.`));
    const loose = R.filter((x) => x.kind === 'loose'); if (loose.length) issues.push(I('warn', `Received date written oddly: ${loose.map((x) => `row ${x.row} “${x.dateRaw}”`).join(', ')} (read as ${loose.map((x) => x.date).join(', ')}).`));
    if (per) { const out = R.filter((x) => x.date && (x.date < per.start || x.date > per.end)); if (out.length) issues.push(I('warn', `${out.length} sample(s) were received outside ${per.label}: ${out.slice(0, 5).map((x) => `${x.origin} (${x.date})`).join('; ')}${out.length > 5 ? '…' : ''}.`)); }
    const unk = R.filter((x) => !KNOWN.includes(x.result)); if (unk.length) issues.push(I('warn', `${unk.length} row(s) with a result that is not Approved / Not Approved / underprocess: ${[...new Set(unk.map((x) => x.resultRaw || '(empty)'))].join(', ')}.`));
    if (new Set(R.map((x) => x.resultRaw)).size > new Set(R.map((x) => x.result)).size) issues.push(I('info', 'Result spellings were merged (e.g. “underprocess” → Under process).'));
    const key = (x) => [norm(x.origin), norm(x.supplier), norm(x.lot), x.date].join('|'); const seen = {}; R.forEach((x) => (seen[key(x)] = (seen[key(x)] || []).concat(x.row))); const dups = Object.values(seen).filter((a) => a.length > 1); if (dups.length) issues.push(I('warn', `${dups.length} sample(s) appear more than once (same origin, supplier, lot and date): rows ${dups.slice(0, 4).map((a) => a.join('/')).join('; ')}.`));
    const noSup = R.filter((x) => !x.supplier).length; if (noSup) issues.push(I('info', `${noSup} sample(s) have no supplier; ${R.filter((x) => !x.lot).length} have no lot name.`));
    const nid = R.filter((x) => x.country === 'Not identified'); if (nid.length) issues.push(I('info', `Country could not be worked out from the origin name for: ${[...new Set(nid.map((x) => x.origin))].join(', ')}.`));
    const oneBeans = [...new Set(R.map((x) => x.beans))]; if (oneBeans.length === 1) issues.push(I('info', `The “beans status” column says “${oneBeans[0]}” for every row.`));
    const prevSame = existing.find((e) => per && e.end === per.end);
    existing.forEach((e) => { if (e.hash === rf.hash) issues.push(I('warn', `This exact file was already uploaded (${e.end}, on ${e.uploadedAt.slice(0, 10)}).`)); });
    if (prevSame && prevSame.hash !== rf.hash) { const a = new Map(prevSame.data.rows.map((x) => [key(x), x])); const ch = R.filter((x) => a.has(key(x)) && a.get(key(x)).result !== x.result); const added = R.filter((x) => !a.has(key(x))).length; issues.push(I('warn', `A sample report for ${prevSame.label} already exists. Approving replaces it (old version kept in history). Compared with it: ${added} new sample(s), ${ch.length} result(s) changed${ch.length ? ' (' + ch.slice(0, 3).map((x) => `${x.origin}: ${a.get(key(x)).result} → ${x.result}`).join('; ') + ')' : ''}.`)); }
    const newer = existing.find((e) => per && e.end > per.end); if (newer) issues.push(I('info', `A newer sample report (${newer.label}) already exists.`));
    return { ds: per ? { type: 'samples', start: per.start, end: per.end, label: per.label, data: { rows: R.map(({ kind, swapped: s, dateRaw, ...x }) => ({ ...x, dateFixed: !!s })), sheet: sn } } : null, issues };
  }

  function compute(ds) {
    const R = ds.data.rows; const by = (f) => { const m = {}; R.forEach((x) => { const k = f(x) || '(none)'; const o = (m[k] = m[k] || { name: k, n: 0, ok: 0, no: 0, up: 0 }); o.n++; if (x.result === 'Approved') o.ok++; else if (x.result === 'Not approved') o.no++; else if (x.result === 'Under process') o.up++; }); return Object.values(m).map((o) => ({ ...o, rate: o.ok + o.no ? o.ok / (o.ok + o.no) : null })).sort((a, b) => b.n - a.n); };
    const last = R.reduce((m, x) => (x.date && x.date > m ? x.date : m), ds.end); const ok = R.filter((x) => x.result === 'Approved').length, no = R.filter((x) => x.result === 'Not approved').length;
    const pending = R.filter((x) => x.result === 'Under process').map((x) => ({ ...x, age: x.date ? days(x.date, last) : null })).sort((a, b) => (b.age || 0) - (a.age || 0));
    const wk = {}; R.forEach((x) => { if (!x.date) return; const d = new Date(x.date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); const k = d.toISOString().slice(0, 10); (wk[k] = wk[k] || { n: 0, ok: 0 }).n++; if (x.result === 'Approved') wk[k].ok++; });
    return { n: R.length, ok, no, up: pending.length, rate: ok + no ? ok / (ok + no) : null, pending, last, bySupplier: by((x) => x.supplier || 'No supplier'), byCountry: by((x) => x.country), byProcess: by((x) => (x.process || '').toLowerCase().replace(/anaer?o?bic|anaorobic|anerobic/, 'anaerobic')), weeks: Object.entries(wk).sort(), approvedList: R.filter((x) => x.result === 'Approved') };
  }
  LM.roastSamples = { detect, analyze, compute };
})(typeof window !== 'undefined' ? window : globalThis);
