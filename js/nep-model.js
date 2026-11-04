/* NEP (Network Expansion Plan): monthly opening plan + NSO tracker (status, lease, handover, contractors) + closures. Parsed by label. No DOM. */
(function (root) {
  const LM = (root.LM = root.LM || {});
  const { norm, clean } = LM;
  const I = (level, msg) => ({ level, msg });
  const rowsOf = (wb, n) => LM.engine.rowsOf(wb, n);
  const txt = (v) => (v == null ? '' : clean(v));
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const serial = (v) => (typeof v === 'number' && v > 40000 && v < 60000 ? LM.parseDay(v) : null);
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const monIdx = (s) => MONTHS.findIndex((m) => norm(s) === m || (norm(s).length >= 3 && m.startsWith(norm(s).slice(0, 3)) && norm(s).length <= 4));
  const pad = (n) => String(n).padStart(2, '0');
  const addMonths = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCMonth(t.getUTCMonth() + n); return t.toISOString().slice(0, 10); };
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const REGIONS = { riy: 'Riyadh', jed: 'Jeddah', mec: 'Makkah', med: 'Madinah', tab: 'Tabuk', abh: 'Abha', bur: 'Buraidah', kho: 'Khobar', dam: 'Dammam', ahs: 'Al Ahsa', tai: 'Taif', tay: 'Taif', jaz: 'Jazan', naj: 'Najran', kha: 'Khamis Mushait', kham: 'Khamis Mushait', hai: 'Hail', hafer: 'Hafr Al Batin', jub: 'Jubail', yan: 'Yanbu', yanb: 'Yanbu', ska: 'Sakaka', sabia: 'Sabya', unaizah: 'Unaizah', metro: 'Riyadh Metro', iraq: 'Iraq', hm: 'Head office / HM' };
  const regionOf = (name) => { const p = txt(name).split(/[-\s]/)[0].toLowerCase(); return REGIONS[p] || REGIONS[p.slice(0, 3)] || txt(name).split(/[-\s]/)[0]; };
  /** comparable key for a store name across sheets: drop class letter (A/B/C/A+), 'HM', punctuation */
  const key = (s) => norm(String(s).replace(/\b[ABC]\+?\s*$/i, '').replace(/^hm[\s-]*/i, '').replace(/\bx\b/gi, ' '));
  const sim = LM.similarity;
  const pre = (s) => txt(s).split(/[-\s]/)[0].toLowerCase().slice(0, 3);
  const tailNum = (s) => (/(\d+)\s*[ABC]?\+?\s*$/.exec(txt(s)) || [])[1] || '';
  const same = (a, b) => { const hm = pre(a) === 'hm' || pre(b) === 'hm'; if (!hm && pre(a) !== pre(b)) return false; if (tailNum(a) !== tailNum(b)) return false; const ka = key(a), kb = key(b); if (ka === kb) return true; const strip = (k, s) => (pre(s) === 'hm' || hm ? k.replace(/^(riy|jed|mec|med|tab|abh)/, '') : k); return sim(strip(ka, a), strip(kb, b)) >= 0.88; };
  /* ---------------- plan sheet ---------------- */
  function parsePlan(g, issues) {
    const hr = g.findIndex((r) => (r || []).some((v) => norm(v) === 'quarter') && (r || []).some((v) => norm(v) === 'newopenings')); if (hr < 0) return null; const h = g[hr];
    const c = { year: h.findIndex((v) => norm(v) === 'quarter'), month: h.findIndex((v) => norm(v) === 'month'), nw: h.findIndex((v) => norm(v) === 'newopenings'), ex: h.findIndex((v) => norm(v).startsWith('existing')), op: h.findIndex((v) => norm(v).startsWith('operating')), nso: h.findIndex((v) => norm(v) === 'nso') };
    const other = h.findIndex((v) => /^other\s*projects/i.test(txt(v))); const nameTo = other > 0 ? other : c.nso + 5;
    const months = []; let year = null;
    for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; if (typeof x[c.year] === 'number' && x[c.year] > 2000 && x[c.year] < 2100) year = x[c.year]; const mi = monIdx(txt(x[c.month])); if (mi < 0) { if (months.length && !txt(x[c.month]) && !x.slice(0, 6).some((v) => v != null)) continue; if (months.length && r > hr + 80) break; continue; }
      if (year == null) continue; const names = []; for (let k = c.nso; k < nameTo; k++) if (txt(x[k])) names.push(txt(x[k])); months.push({ y: year, m: mi + 1, ym: `${year}-${pad(mi + 1)}`, nw: num(x[c.nw]), ex: num(x[c.ex]), op: num(x[c.op]), names, row: r + 1 }); }
    // opening-date table (header 'Opening Date')
    const dr = g.findIndex((r) => (r || []).some((v) => /^opening\s*date$/i.test(txt(v)))); const dates = []; let dateCols = null;
    if (dr >= 0) { const dh = g[dr]; const dc = dh.findIndex((v) => /^opening\s*date$/i.test(txt(v))); const nc = dc - 1; dateCols = { name: nc, date: dc, note: dc + 1 };
      for (let r = dr + 1; r < g.length; r++) { const x = g[r] || []; const nm = txt(x[nc]); if (!nm && !serial(x[dc])) { if (dates.length && r > dr + 60) break; continue; } if (!nm) continue; dates.push({ name: nm, date: serial(x[dc]), raw: x[dc], note: txt(x[dc + 1]), row: r + 1 }); } }
    // other projects (status list) and legend
    const op = h.findIndex((v) => /^other\s*projects/i.test(txt(v))); const projects = []; if (op >= 0) for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const n = x[op]; if (typeof n === 'number' && txt(x[op + 1])) projects.push({ no: n, name: txt(x[op + 1]), status: txt(x[op + 2]) }); }
    const pipeline27 = []; if (op >= 0) { const first27 = months.find((m) => m.y === 2027); if (first27) for (let r = first27.row - 1; r < g.length; r++) { const x = g[r] || []; if (typeof x[op + 1] === 'string' && txt(x[op + 1]) && num(x[op]) == null) pipeline27.push(txt(x[op + 1])); } }
    const lg = h.findIndex((v) => /^legend/i.test(txt(v))); const legend = []; if (lg >= 0) for (let r = hr + 1; r < Math.min(g.length, hr + 12); r++) { const x = g[r] || []; const nameC = lg + 1; const lab = txt(x[lg + 1]) || txt(x[lg]); const cnt = [x[lg + 2], x[lg + 3]].find((v) => typeof v === 'number'); if (lab && cnt != null && lab !== txt(x[op + 1])) legend.push({ label: lab, n: cnt }); }
    // checks
    months.forEach((m, i) => {
      if (m.nw != null && m.ex != null && m.op != null && m.ex + m.nw !== m.op) issues.push(I('warn', `Plan ${m.ym}: existing ${m.ex} + new ${m.nw} = ${m.ex + m.nw}, but operating stores says ${m.op}.`));
      const p = months[i - 1]; if (p && p.op != null && m.ex != null && p.op !== m.ex) issues.push(I('warn', `Plan ${m.ym}: existing stores (${m.ex}) is not last month's operating stores (${p.op}).`));
      if (m.nw != null && m.names.length !== m.nw) issues.push(I('warn', `Plan ${m.ym}: “New Openings” says ${m.nw} but ${m.names.length} store name(s) are listed.`));
      if (p && ((p.y * 12 + p.m) + 1 !== (m.y * 12 + m.m))) issues.push(I('warn', `Plan months are not consecutive after ${p.ym}.`));
    });
    const all = months.flatMap((m) => m.names.map((n) => [n, m.ym])); const seen = {}; all.forEach(([n, ym]) => { const k = key(n); (seen[k] = seen[k] || []).push(`${n} (${ym})`); }); Object.values(seen).filter((a) => a.length > 1).forEach((a) => issues.push(I('warn', `Store appears in the plan more than once: ${a.join(' and ')}.`)));
    return { months, dates, dateCols, projects, pipeline27, legend };
  }

  /* ---------------- tracker ---------------- */
  function parseTracker(g, issues) {
    const sections = []; let cur = null; let hdr = null;
    for (let r = 0; r < g.length; r++) { const x = g[r] || [];
      const c = x.findIndex((v) => /^lease\s*contract/i.test(txt(v))); if (c >= 0) { const nameC = c - 1; const noC = nameC - 1; const title = txt(x[noC]) || txt(x[nameC]); hdr = { noC, nameC, lease: c, handover: x.findIndex((v) => /^handover/i.test(txt(v))), area: x.findIndex((v) => /^area/i.test(txt(v))), type: x.findIndex((v) => /project\s*description/i.test(txt(v))), floors: x.findIndex((v) => /^floors/i.test(txt(v))), landBy: x.findIndex((v) => /land\s*construction/i.test(txt(v))), civil: x.findIndex((v) => /civil/i.test(txt(v))), fit: x.findIndex((v) => /fit\s*outs?/i.test(txt(v))), status: x.findIndex((v) => /^status/i.test(txt(v))) }; cur = { title, rows: [] }; sections.push(cur); continue; }
      if (!cur || !hdr) continue; const nm = txt(x[hdr.nameC]); if (!nm) continue;
      const hv = x[hdr.handover]; cur.rows.push({ no: num(x[hdr.noC]), name: nm, lease: txt(x[hdr.lease]), handoverDate: serial(hv), handover: serial(hv) || txt(hv), area: num(x[hdr.area]), type: txt(x[hdr.type]), floors: txt(x[hdr.floors]), landBy: txt(x[hdr.landBy]), civil: txt(x[hdr.civil]), fit: txt(x[hdr.fit]), status: txt(x[hdr.status]), row: r + 1 }); }
    sections.forEach((s) => { const d = {}; s.rows.forEach((x) => { const k = key(x.name); (d[k] = d[k] || []).push(x.name); }); Object.values(d).filter((a) => a.length > 1).forEach((a) => issues.push(I('warn', `Tracker “${s.title}”: duplicate store ${a.join(' / ')}.`))); const ns = s.rows.filter((x) => !x.status).length; if (ns) issues.push(I('info', `Tracker “${s.title}”: ${ns} store(s) have no status yet (${s.rows.filter((x) => !x.status).slice(0, 4).map((x) => x.name).join(', ')}${ns > 4 ? ', …' : ''}).`)); });
    return sections;
  }
  function parseClosures(g) { const hr = g.findIndex((r) => (r || []).some((v) => /closure\s*stores?/i.test(txt(v)))); if (hr < 0) return null; const h = g[hr]; const nc = h.findIndex((v) => /closure\s*stores?/i.test(txt(v))); const dc = h.findIndex((v) => /closure\s*date/i.test(txt(v))); const out = []; for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const n = txt(x[nc]); if (!n) continue; const v = x[dc]; out.push({ name: n, date: serial(v), year: typeof v === 'number' && v < 3000 ? v : null, raw: v == null ? '' : v }); } return out; }

  function analyze(wb, name, ov, template, existing, hash) {
    ov = ov || {}; existing = existing || []; const issues = []; const data = {};
    wb.SheetNames.forEach((sn) => { const g = rowsOf(wb, sn); const head = g.slice(0, 12);
      if (!data.plan && head.some((r) => (r || []).some((v) => norm(v) === 'newopenings'))) { data.plan = parsePlan(g, issues); data.planSheet = sn; }
      else if (!data.tracker && g.some((r) => (r || []).some((v) => /^lease\s*contract/i.test(txt(v))))) { data.tracker = parseTracker(g, issues); data.trackerSheet = sn; }
      else if (!data.closures && head.some((r) => (r || []).some((v) => /closure\s*stores?/i.test(txt(v))))) data.closures = parseClosures(g); });
    if (!data.plan && !data.tracker) return { ds: null, issues: [I('error', 'This does not look like the NEP workbook (no monthly plan and no NSO tracker found).')] };
    if (!data.plan) issues.push(I('error', 'The monthly plan sheet (Quarter / Month / New Openings) was not found.')); if (!data.tracker) issues.push(I('warn', 'The NSO tracker sheet was not found: status, lease and contractor details will be missing.')); if (!data.closures) issues.push(I('info', 'No closures sheet found.'));
    let fnDate = null; for (const mm of String(name).matchAll(/(?<!\d)(\d{1,2})[-_\s]*([A-Za-z]{3})[a-z]*[-_\s,]*(20\d\d)/g)) { const mi = monIdx(mm[2]); if (mi >= 0) { fnDate = `${mm[3]}-${pad(mi + 1)}-${pad(+mm[1])}`; break; } }
    const asOf = (ov.asOf && ov.asOf.date) || fnDate; if (!asOf) issues.push({ level: 'error', msg: 'The report date could not be found in the file name. Enter it.', fix: { type: 'asOf', id: 'date', kind: 'date', label: 'Use this date' } }); else if (!ov.asOf) issues.push(I('info', `Report date taken from the file name: ${asOf}.`));
    const P = data.plan, T = data.tracker || [];
    if (P && T.length) {
      const tr = (re) => T.find((s) => re.test(s.title)); const t26 = tr(/^nso\s*2026/i), t27 = tr(/^nso\s*2027/i);
      [[t26, 2026], [t27, 2027]].forEach(([s, y]) => { if (!s) return; const planNames = P.months.filter((x) => x.y === y).flatMap((x) => x.names.map((n) => ({ n, ym: x.ym })));
        const missInPlan = s.rows.filter((r) => !planNames.some((p) => same(p.n, r.name))), missInTracker = planNames.filter((p) => !s.rows.some((r) => same(p.n, r.name)));
        if (missInPlan.length) issues.push(I(y === 2026 ? 'warn' : 'info', `${missInPlan.length} store(s) in the NSO ${y} tracker are not scheduled in a month of the plan: ${missInPlan.slice(0, 8).map((r) => r.name).join(', ')}${missInPlan.length > 8 ? ', …' : ''}.`));
        if (missInTracker.length) issues.push(I('warn', `${missInTracker.length} store(s) planned for ${y} are not in the NSO ${y} tracker (or are spelled differently): ${missInTracker.slice(0, 6).map((p) => `${p.n} (${p.ym})`).join(', ')}.`));
        if (y === 2026 && planNames.length !== s.rows.length) issues.push(I('warn', `The 2026 plan schedules ${planNames.length} openings but the tracker lists ${s.rows.length} stores.`)); });
      // opening-date table vs plan month and tracker
      (P.dates || []).forEach((d) => { const pm = P.months.find((mm) => mm.names.some((n) => same(n, d.name))); if (!d.date) issues.push(I('warn', `Opening date for “${d.name}” is not a valid date (${d.raw}).`)); else if (!pm) issues.push(I('warn', `“${d.name}” has an opening date (${d.date}) but is not in the monthly plan.`)); else if (pm.ym !== d.date.slice(0, 7)) issues.push(I('warn', `“${d.name}”: planned for ${pm.ym} but the opening date is ${d.date}.`)); });
      // status vs time
      const t26rows = t26 ? t26.rows : [];
      t26rows.forEach((r) => { const pm = P.months.find((mm) => mm.names.some((n) => same(n, r.name))); const od = (P.dates || []).find((d) => same(d.name, r.name)); const planned = od && od.date ? od.date : pm ? `${pm.ym}-28` : null; r.planned = planned; r.plannedMonth = pm ? pm.ym : null; r.openDate = od && od.date; r.note = od && od.note ? od.note : '';
        if (asOf && planned) { if (/^opened/i.test(r.status) && planned > asOf && !(pm && pm.ym === asOf.slice(0, 7))) issues.push(I('warn', `“${r.name}” is marked Opened but its planned opening is ${planned}, after the report date.`)); if (!/^opened/i.test(r.status) && planned < asOf) issues.push(I('warn', `“${r.name}” was planned to open by ${planned} but its status is “${r.status || 'blank'}”: it is overdue.`)); } });
      // legend counts
      if (t26 && P.legend && P.legend.length) { const cnt = {}; t26.rows.forEach((r) => { const k = norm(r.status); cnt[k] = (cnt[k] || 0) + 1; }); P.legend.forEach((l) => { const k = norm(l.label); if (/^nso2026$/.test(k)) { if (l.n !== t26.rows.length) issues.push(I('warn', `Legend says NSO 2026 = ${l.n} but the tracker lists ${t26.rows.length}.`)); return; } const mine = Object.entries(cnt).find(([s]) => s.startsWith(k) || k.startsWith(s)); const v = mine ? mine[1] : 0; if (v !== l.n) issues.push(I('warn', `Legend says ${l.n} “${l.label.trim()}” but the tracker has ${v}.`)); }); }
    }
    if (P && data.closures && data.closures.length) { issues.push(I('info', `${data.closures.length} closed stores are listed (${data.closures.filter((c) => c.date || c.year).length} with a date). The plan's “Existing / Operating stores” counts do not subtract closures, so the operating count may be overstated by up to ${data.closures.length}.`)); data.closures.filter((c) => !c.date && !c.year).forEach((c) => issues.push(I('info', `Closure “${c.name}” has no closure date.`))); }
    if (P) { const lastActual = P.months.filter((x) => asOf && x.ym < asOf.slice(0, 7)).pop(); if (!P.months.some((x) => asOf && x.ym === asOf.slice(0, 7))) issues.push(I('warn', `The plan has no row for the report month ${asOf ? asOf.slice(0, 7) : ''}.`)); }
    existing.forEach((e) => { if (e.hash === hash) issues.push(I('warn', `This exact file was already uploaded (as of ${e.end}, on ${e.uploadedAt.slice(0, 10)}).`)); else if (asOf && e.end === asOf) issues.push(I('warn', `An NEP report dated ${asOf} already exists. Approving replaces it (the old version is kept in history).`)); else if (asOf && e.end > asOf) issues.push(I('warn', `A newer NEP report (${e.end}) already exists. This one is older.`)); });
    const prev = [...existing].sort((a, b) => (a.end < b.end ? 1 : -1)).find((e) => asOf && e.end < asOf);
    if (prev && prev.data.plan && P) { const pn = new Map(); prev.data.plan.months.forEach((mm) => mm.names.forEach((n) => pn.set(key(n), mm.ym))); const nn = new Map(); P.months.forEach((mm) => mm.names.forEach((n) => nn.set(key(n), mm.ym)));
      const moved = [...nn].filter(([k, ym]) => pn.has(k) && pn.get(k) !== ym).map(([k, ym]) => { const nm = P.months.flatMap((mm) => mm.names).find((n) => key(n) === k); return `${nm} (${pn.get(k)} → ${ym})`; }); const added = [...nn.keys()].filter((k) => !pn.has(k)).map((k) => P.months.flatMap((mm) => mm.names).find((n) => key(n) === k)); const removed = [...pn.keys()].filter((k) => !nn.has(k)).map((k) => prev.data.plan.months.flatMap((mm) => mm.names).find((n) => key(n) === k));
      if (moved.length) issues.push(I('warn', `${moved.length} opening(s) moved since ${prev.end}: ${moved.slice(0, 6).join('; ')}${moved.length > 6 ? '; …' : ''}.`)); if (added.length) issues.push(I('info', `New store(s) added to the plan since ${prev.end}: ${added.slice(0, 8).join(', ')}.`)); if (removed.length) issues.push(I('warn', `Store(s) removed from the plan since ${prev.end}: ${removed.slice(0, 8).join(', ')}.`)); }
    return { ds: { type: 'nep', start: asOf, end: asOf, data }, issues };
  }

  /* ---------------- analytics for the dashboard ---------------- */
  function compute(ds) {
    const d = ds.data, asOf = ds.end, P = d.plan; if (!P) return null; const T = d.tracker || []; const t26 = T.find((s) => /^nso\s*2026/i.test(s.title)), t27 = T.find((s) => /^nso\s*2027/i.test(s.title));
    const find = (nm, sec) => (sec ? sec.rows.find((r) => same(r.name, nm)) : null);
    const horizon = addMonths(asOf, 6); const curYM = asOf.slice(0, 7); const horizonYM = horizon.slice(0, 7);
    const list = [];
    P.months.forEach((mm) => mm.names.forEach((nm) => { const od = (P.dates || []).find((x) => same(x.name, nm)); const tr = find(nm, t26) || find(nm, t27); const openDate = od && od.date ? od.date : null; const status = tr ? tr.status : ''; const when0 = openDate || `${mm.ym}-28`; const opened = tr ? /^opened/i.test(status) : when0 < asOf;
      list.push({ name: nm, region: regionOf(nm), ym: mm.ym, openDate, note: od ? od.note : '', status, opened, lease: tr ? tr.lease : '', handover: tr ? tr.handover : '', handoverDate: tr ? tr.handoverDate : null, area: tr ? tr.area : null, type: tr ? tr.type : '', fit: tr ? tr.fit : '', civil: tr ? tr.civil : '', landBy: tr ? tr.landBy : '', inTracker: !!tr, class: (/\b([ABC]\+?)\s*$/.exec(nm) || [])[1] || '' }); }));
    list.forEach((s) => { const when = s.openDate || `${s.ym}-28`; s.when = when; s.daysTo = days(asOf, when); s.overdue = !s.opened && when < asOf; const flags = [];
      if (s.overdue) flags.push(['bad', 'Overdue']);
      if (!s.opened && s.inTracker && !/^signed/i.test(s.lease)) flags.push(['bad', 'Lease not signed']); if (!s.opened && !s.inTracker) flags.push(['warn', 'Not in tracker']);
      if (!s.opened && s.daysTo <= 90 && /design|bidding|scouting|permit|license|^$/i.test(s.status || '')) flags.push(['warn', `Status “${(s.status || 'blank').trim()}” with ${Math.max(s.daysTo, 0)} days to go`]);
      if (!s.opened && s.daysTo <= 60 && s.handover && !/^(done|ready)/i.test(String(s.handover))) flags.push(['warn', `Handover: ${s.handover}`]);
      if (/postpon/i.test(s.note)) flags.push(['warn', 'Postponed']); s.flags = flags; });
    const upcoming = list.filter((s) => !s.opened && ((s.openDate ? (s.when >= asOf && s.when <= horizon) : (s.ym >= curYM && s.ym <= horizonYM)) || s.overdue)).sort((a, b) => (a.when < b.when ? -1 : 1));
    const cur = P.months.find((x) => x.ym === curYM) || P.months.filter((x) => x.ym <= curYM).pop();
    const before = P.months.filter((x) => x.ym < curYM).pop(); const operatingNow = before ? before.op : cur ? cur.ex : null;
    const openedNow = list.filter((s) => s.opened).length;
    const byYear = {}; P.months.forEach((x) => { const o = (byYear[x.y] = byYear[x.y] || { y: x.y, opened: 0, end: null, start: x.ex }); o.opened += x.nw || 0; o.end = x.op; });
    const next6 = P.months.filter((x) => x.ym >= curYM && x.ym <= horizonYM);
    const status26 = {}; (t26 ? t26.rows : []).forEach((r) => { const k = r.status ? r.status.trim().replace(/\s+/g, ' ') : '(no status)'; status26[k] = (status26[k] || 0) + 1; });
    const status27 = {}; (t27 ? t27.rows : []).forEach((r) => { const k = r.status ? r.status.trim().replace(/\s+/g, ' ').replace(/ - License.*/, '').slice(0, 30) : '(no status)'; status27[k] = (status27[k] || 0) + 1; });
    return { list, upcoming, operatingNow, openedNow, asOf, horizon, byYear: Object.values(byYear), next6, status26, status27, t26, t27, plan26: P.months.filter((x) => x.y === 2026), total26: P.months.filter((x) => x.y === 2026).reduce((s, x) => s + (x.nw || 0), 0), yearEnd26: (P.months.filter((x) => x.y === 2026).pop() || {}).op, yearEnd27: (P.months.filter((x) => x.y === 2027).pop() || {}).op };
  }

  LM.nep = { analyze, compute, regionOf, key, same };
})(typeof window !== 'undefined' ? window : globalThis);
