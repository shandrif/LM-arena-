/* International: London & Iraq weekly reviews, expansion updates (Iraq / GCC), Saudi NSO status. All PowerPoint. No DOM. */
(function (root) {
  const LM = (root.LM = root.LM || {});
  const { norm, clean } = LM;
  const I = (level, msg, fix) => ({ level, msg, fix });
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monNo = (s) => MON.indexOf(String(s).slice(0, 3).toLowerCase()) + 1;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const addDays = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const items = (s, k) => s.items.filter((i) => i.kind === k);
  const TYPES = { london: { label: 'London weekly review' }, iraq: { label: 'Iraq weekly review' }, expansion: { label: 'Expansion updates (Iraq / GCC)' }, nso: { label: 'Saudi NSO status' }, calendar: { label: 'Events calendar (PDF)' } };

  /** "£31,340", "+5.43%", "–16.6%", "IQD 13,336" -> number */
  const val = (v) => { if (v == null) return null; const s = String(v).replace(/[–−—]/g, '-').replace(/[£$,\s%]|IQD|SAR|GBP/gi, '').replace(/^\+/, ''); const n = Number(s); return s !== '' && isFinite(n) ? n : null; };

  function weeksIn(text, yearHint) {
    const out = []; const re = /\(\s*(\d{1,2})\s*([A-Za-z]{3})?\s*[–—-]\s*(\d{1,2})\s*([A-Za-z]{3})\s*\)/g; let m;
    const y = (/(20\d\d)/.exec(text) || [])[1] ? +/(20\d\d)/.exec(text)[1] : yearHint;
    while ((m = re.exec(text))) { const m2 = monNo(m[4]); if (!m2) continue; const m1 = m[2] ? monNo(m[2]) : m2; out.push({ start: iso(m1 > m2 ? y - 1 : y, m1, +m[1]), end: iso(y, m2, +m[3]) }); }
    return out;
  }
  function detect(slides) {
    const all = slides.flatMap((s) => [s.title, ...items(s, 'text').map((t) => t.text)]).join(' \n ');
    const hdrs = slides.flatMap((s) => items(s, 'table').map((t) => t.rows[0].map(norm).join('|'))).join(' ; ');
    if (/operationreadiness/.test(hdrs) || /\bNSO\b/.test(slides[0].title)) return 'nso';
    if (/week[\s-]*on[\s-]*week|weekly\s*(performance\s*)?review/i.test(all) && /prev|week2|week3/.test(hdrs)) return /london/i.test(all) ? 'london' : /iraq/i.test(all) ? 'iraq' : 'review';
    if (/expansion/i.test(all) && /status/.test(hdrs)) return 'expansion';
    return null;
  }

  /* ---------- weekly review ---------- */
  function tiles(s) {
    const T = items(s, 'text'); const big = T.filter((t) => (t.fs || 0) >= 20 && /^[£$]?[\d,.]+(\.\d+)?%?$/.test(t.text)); const out = [];
    big.forEach((b) => { const col = T.filter((u) => u !== b && Math.abs(u.x - b.x) < 0.04); const label = col.filter((u) => u.y < b.y && b.y - u.y < 0.1).sort((p, q) => q.y - p.y)[0]; const sub = col.filter((u) => u.y > b.y && u.y - b.y < 0.2).sort((p, q) => p.y - q.y).map((u) => u.text); if (label) out.push({ label: label.text, value: b.text, sub }); });
    return out;
  }
  function parseReview(slides, name, ov, yearHint, issues) {
    const first = slides[0]; const sub = items(first, 'text').map((t) => t.text).join(' ');
    const title = first.title; const market = /^(\w+)/.exec(title.replace(/[–—-].*$/, ''))[1];
    const wk = weeksIn(sub, yearHint); const D = { market, title, period: wk[0] || null, prevPeriod: wk[1] || null, weekNo: (/Week\s*(\d+)\s*\(/i.exec(sub) || [])[1] ? +/Week\s*(\d+)\s*\(/i.exec(sub)[1] : null };
    if (!D.period) issues.push(I('error', 'The reporting week could not be read from the title slide.', { type: 'asOf', id: 'date', kind: 'date', label: 'Use this date as week end' }));
    // metrics table
    const mt = slides.flatMap((s) => items(s, 'table')).find((t) => t.rows[0].length >= 4 && /prev|week\s*\d/i.test(t.rows[0][1]) && /curr|week\s*\d/i.test(t.rows[0][2])); D.metrics = [];
    if (mt) mt.rows.slice(1).forEach((r) => D.metrics.push({ name: r[0], prev: val(r[1]), curr: val(r[2]), change: val(r[3]), pct: r[4] != null ? val(r[4]) : null, raw: r.slice(1) })); else issues.push(I('warn', 'No week-on-week summary table found.'));
    D.metrics.forEach((m) => { if (m.prev != null && m.curr != null && m.change != null && Math.abs(m.curr - m.prev - m.change) > Math.max(1.01, Math.abs(m.prev) * 0.002)) issues.push(I('warn', `${m.name}: change is ${m.raw[2]} but current − previous = ${(m.curr - m.prev).toLocaleString(undefined, { maximumFractionDigits: 2 })}.`)); const p = m.pct != null ? m.pct : null; if (m.prev && p != null && Math.abs(((m.curr - m.prev) / m.prev) * 100 - p) > 0.15) issues.push(I('warn', `${m.name}: the % change is ${m.raw[3] || m.pct} but the numbers give ${(((m.curr - m.prev) / m.prev) * 100).toFixed(2)}%.`)); });
    const byName = (re) => D.metrics.find((m) => re.test(m.name));
    // currency pair consistency (IQD vs SAR)
    const iq = D.metrics.filter((m) => /\(IQD\)/i.test(m.name)), sr = D.metrics.filter((m) => /\(SAR\)/i.test(m.name)); const rates = []; iq.forEach((a) => { const b = sr.find((x) => norm(x.name.replace(/\(SAR\)/i, '')) === norm(a.name.replace(/\(IQD\)/i, ''))); if (b && a.curr && b.curr) { rates.push(a.curr / b.curr); if (a.prev && b.prev) rates.push(a.prev / b.prev); } }); if (rates.length > 1) { const mn = Math.min(...rates), mx = Math.max(...rates); D.fx = +(rates.reduce((s, x) => s + x, 0) / rates.length).toFixed(2); if ((mx - mn) / mn > 0.01) issues.push(I('warn', `IQD per SAR is not constant across the table (${mn.toFixed(1)} to ${mx.toFixed(1)}).`)); }
    const gross = byName(/gross/i), vat = byName(/^vat/i), net = byName(/^net sales(?!.*\(iqd\))/i), bills = byName(/^(bills|transactions)/i), apc = byName(/^apc/i);
    if (gross && vat && net) ['prev', 'curr'].forEach((k) => { if (Math.abs(gross[k] - vat[k] - net[k]) > 2) issues.push(I('warn', `${k === 'curr' ? 'Current' : 'Previous'} week: gross ${gross[k].toLocaleString()} − VAT ${vat[k].toLocaleString()} ≠ net sales ${net[k].toLocaleString()}.`)); });
    if (net && bills && apc) ['prev', 'curr'].forEach((k) => { const c = net[k] / bills[k]; if (Math.abs(c - apc[k]) > Math.max(0.02, apc[k] * 0.003) && !/iqd/i.test(apc.name)) issues.push(I('warn', `${k === 'curr' ? 'Current' : 'Previous'} week: APC is ${apc[k]} but net sales ÷ bills = ${c.toFixed(2)}.`)); });
    // tables and charts with totals
    D.blocks = []; slides.forEach((s) => { items(s, 'table').forEach((t) => D.blocks.push({ slide: s.n, title: s.title, kind: 'table', rows: t.rows })); items(s, 'chart').forEach((c) => D.blocks.push({ slide: s.n, title: s.title, kind: 'chart', chart: c })); });
    D.blocks.filter((b) => b.kind === 'table').forEach((b) => { const rows = b.rows.slice(1); const tr = rows.find((r) => /^total/i.test(r[0])); if (!tr) return; const body = rows.filter((r) => r !== tr); b.rows[0].forEach((h, c) => { if (c === 0 || /%|apc|avg|per |share|large|gap|change|var/i.test(h)) return; const tv = val(tr[c]); const vs = body.map((r) => val(r[c])); if (tv == null || vs.some((v) => v == null)) return; const s2 = sum(vs, (v) => v); if (Math.abs(s2 - tv) > Math.max(1.5, Math.abs(tv) * 0.003)) issues.push(I('warn', `Slide ${b.slide} “${h}”: the rows add up to ${s2.toLocaleString(undefined, { maximumFractionDigits: 2 })} but the Total row says ${tr[c]}.`)); }); });
    D.blocks.filter((b) => b.kind === 'chart' && b.chart.series.length >= 1 && /^(sun|mon)/i.test(b.chart.cats[0] || '')).forEach((b) => { const t = b.title; const find = /net sales/i.test(t) ? (net || byName(/net sales/i)) : /transaction|bills/i.test(t) ? bills : null; if (!find) return; const s = b.chart.series; [[s[0], 'prev'], [s[1], 'curr']].forEach(([se, k]) => { if (!se) return; const sm = sum(se.values, (v) => v); const tv = /net sales/i.test(t) && D.fx && /iqd/i.test(find.name) ? find[k] : find[k]; const alt = /net sales/i.test(t) ? D.metrics.find((m) => /net sales.*\(sar\)/i.test(m.name)) : null; const target = alt ? alt[k] : tv; if (target && Math.abs(sm - target) > Math.max(2, target * 0.004)) issues.push(I('warn', `Slide ${b.slide}: the daily chart (${k === 'curr' ? 'current' : 'previous'} week) adds up to ${Math.round(sm).toLocaleString()} but the summary says ${Math.round(target).toLocaleString()}.`)); }); });
    // callouts, focus points, info
    const CAL = /^(WHAT WORKED|AREA TO FOCUS|AREA TO IMPROVE|WATCH|WHAT HAPPENED|WHAT DROVE IT|LEARNING|RISK)\b/i; D.callouts = [];
    slides.forEach((s) => items(s, 'text').forEach((t) => { const m = CAL.exec(t.text); if (m && t.text.includes('\n')) { const L = t.text.split('\n').map((x) => x.trim()).filter(Boolean); D.callouts.push({ slide: s.n, kind: L[0].toUpperCase(), title: L[1] || '', text: L.slice(2).join(' ') }); } }));
    const fs = slides.find((s) => /areas?\s+(to\s+)?(focus|improve)|focus points/i.test(s.title) && !items(s, 'chart').length && !items(s, 'table').length); D.focus = []; if (fs) { const k = LM.training.kpiPairs(fs); const c = LM.training.cards(fs, new Set()); D.focus = c.cards.map((x) => ({ no: x.no, title: x.title, desc: x.desc, target: x.status })).filter((x) => x.title); if (!D.focus.length) issues.push(I('warn', 'The focus-points slide was found but no numbered items could be read.')); }
    const inf = slides.find((s) => /^information/i.test(s.title)); D.info = inf ? items(inf, 'text').filter((t) => t.text !== inf.title).flatMap((t) => t.text.split('\n')).map((x) => x.trim()).filter((x) => x.length > 3) : [];
    D.tiles = slides.flatMap((s) => tiles(s)); D.slides = slides.map((s) => ({ n: s.n, title: s.title }));
    if (D.period) { const len = days(D.period.start, D.period.end) + 1; if (len !== 7) issues.push(I('warn', `The week is ${len} days (${D.period.start} → ${D.period.end}).`)); if (D.prevPeriod && days(D.prevPeriod.end, D.period.start) !== 1) issues.push(I('warn', `The “previous week” (${D.prevPeriod.start} → ${D.prevPeriod.end}) does not directly precede the current week.`)); if (!D.prevPeriod) issues.push(I('warn', 'The previous week could not be read from the title slide.')); const dow = new Date(D.period.start + 'T00:00:00Z').getUTCDay(); if (dow !== 0) issues.push(I('info', `The week starts on a ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow]}.`)); }
    return D;
  }

  /* ---------- status tables ---------- */
  function labelFor(s, t) { const T = items(s, 'text').filter((x) => x.text !== s.title && x.text.length < 60); const c = T.map((x) => ({ x, d: Math.hypot(x.x - t.x, (x.y - t.y) * 1.5) , ok: x.y <= t.y + 0.02 })).filter((a) => a.ok).sort((a, b) => a.d - b.d)[0]; return c && c.d < 0.3 ? c.x.text.replace(/\s*:\s*$/, '') : s.title; }
  function parseExpansion(slides, issues) { const sections = []; slides.forEach((s) => items(s, 'table').forEach((t) => { if (t.rows.length < 2) return; sections.push({ slide: s.n, title: labelFor(s, t), headers: t.rows[0], rows: t.rows.slice(1).filter((r) => r.some((c) => c)) }); })); if (!sections.length) issues.push(I('warn', 'No status tables found.')); const mt = slides.flatMap((s) => items(s, 'text')).find((t) => /iraq|gcc/i.test(t.text)); return { sections, region: mt ? mt.text.split('\n')[0] : '' }; }
  function openWhen(text, year) {
    const t = String(text); let m = /(\d{1,2})\s*(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})/i.exec(t); if (m && monNo(m[2])) return { date: iso(year, monNo(m[2]), +m[1]), approx: 'exact' };
    m = /mid[-\s]*([A-Za-z]{3,9})/i.exec(t); if (m && monNo(m[1])) return { date: iso(year, monNo(m[1]), 15), approx: 'mid-month' };
    m = /(\d)(?:st|nd|rd|th)?\s+week\s+of\s+([A-Za-z]{3,9})/i.exec(t); if (m && monNo(m[2])) return { date: iso(year, monNo(m[2]), Math.min(28, 7 * +m[1] - 3)), approx: 'week ' + m[1] };
    m = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i.exec(t); if (m) return { date: iso(year, monNo(m[1]), 15), approx: 'month only' };
    return null;
  }
  function parseNso(slides, yearHint, issues) {
    const t = slides.flatMap((s) => items(s, 'table')).find((x) => /operation/i.test(x.rows[0].join(' '))); if (!t) { issues.push(I('error', 'The “Stores to open” table was not found.')); return { rows: [] }; }
    const H = t.rows[0].map(norm); const c = { name: 0, status: H.findIndex((h) => /^status/.test(h)), comment: H.findIndex((h) => /^comment/.test(h)), ready: H.findIndex((h) => /readiness/.test(h)) };
    const rows = t.rows.slice(1).filter((r) => r[0]).map((r) => { const w = openWhen(r[c.comment] || '', yearHint); return { name: r[0], status: r[c.status] || '', comment: r[c.comment] || '', readiness: c.ready >= 0 ? r[c.ready] : '', when: w ? w.date : null, whenKind: w ? w.approx : '' }; });
    rows.forEach((r) => { if (!r.when) issues.push(I('warn', `“${r.name}”: no opening date could be read from the comment (“${r.comment}”).`)); if (/ready/i.test(r.status) && /waiting|pending/i.test(r.comment)) issues.push(I('warn', `“${r.name}” is marked ${r.status} but still waiting: ${r.comment}`)); if (!r.readiness) issues.push(I('info', `“${r.name}” has no operation-readiness note.`)); });
    return { rows };
  }
  /** match an NSO store name against NEP store names */
  const STOP = new Set(['jeddah', 'makkah', 'khobar', 'riyadh', 'madinah', 'store', 'station', 'mall']);
  const toks = (s) => String(s).toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter((x) => x.length >= 4 && !STOP.has(x));
  function nepMatch(name, list) { const a = toks(name); if (!a.length) return null; let best = null; list.forEach((n) => { const b = toks(n.name); const hits = a.filter((x) => b.some((y) => LM.similarity(x, y) >= 0.8)).length; if (hits && hits / a.length >= 0.5 && (!best || hits > best.hits)) best = { n, hits }; }); return best ? best.n : null; }

  async function analyze(buf, name, ov, template, existing, hash, others) {
    ov = ov || {}; existing = existing || []; template = template || {}; const issues = [];
    let slides; try { slides = await LM.pptx.read(buf); } catch (e) { return { type: null, ds: null, issues: [I('error', `“${name}” could not be read as a PowerPoint (.pptx) (${e.message}).`)] }; }
    if (!slides.length) return { type: null, ds: null, issues: [I('error', 'The presentation has no slides.')] };
    const type = ov.type || detect(slides); if (!type || type === 'review') return { type: null, ds: null, issues: [I('error', 'This deck was not recognised as a London / Iraq weekly review, expansion update or NSO status.', { type: 'type', id: 'type', options: ['london', 'iraq', 'expansion', 'nso'], label: 'Treat this file as' })] };
    const yh = (template.year) || new Date().getFullYear(); let data, start = null, end = null;
    if (type === 'london' || type === 'iraq') { data = parseReview(slides, name, ov, yh, issues); end = data.period ? data.period.end : null; start = data.period ? data.period.start : null; if (ov.asOf && ov.asOf.date) { end = ov.asOf.date; start = addDays(end, -6); data.period = { start, end }; for (let i = issues.length - 1; i >= 0; i--) if (/could not be read from the title/.test(issues[i].msg)) issues.splice(i, 1); } }
    else {
      const a = ov.asOf && ov.asOf.date; const hint = others && others.end;
      if (!a) issues.push(I('error', `This deck has no date. Enter the date it applies to${hint ? ` (the weekly reviews uploaded with it end ${hint})` : ''}.`, { type: 'asOf', id: 'date', kind: 'date', value: hint || '', label: 'Use this date' }));
      end = a || null; start = end; const y = end ? +end.slice(0, 4) : yh;
      data = type === 'nso' ? parseNso(slides, y, issues) : parseExpansion(slides, issues); data.slides = slides.map((s) => ({ n: s.n, title: s.title }));
    }
    const ds = { type, start, end, data };
    // history checks
    const same = existing.filter((e) => e.type === type).sort((a, b) => (a.end < b.end ? 1 : -1));
    same.forEach((e) => { if (e.hash === hash) issues.push(I('warn', `This exact deck was already uploaded (${e.end}, on ${e.uploadedAt.slice(0, 10)}).`)); else if (end && e.end === end) issues.push(I('warn', `A ${TYPES[type].label} for ${end} already exists. Approving replaces it (the old version is kept in history).`)); else if (end && e.end > end) issues.push(I('warn', `A newer ${TYPES[type].label} (${e.end}) already exists. This one is older.`)); });
    const prev = same.find((e) => end && e.end < end);
    if (prev && (type === 'london' || type === 'iraq')) { if (days(prev.end, end) !== 7) issues.push(I('warn', `The previous ${TYPES[type].label} ends ${prev.end}; expected one week before ${end}.`)); else (data.metrics || []).forEach((m) => { const pm = (prev.data.metrics || []).find((x) => norm(x.name) === norm(m.name)); if (pm && pm.curr != null && m.prev != null && Math.abs(pm.curr - m.prev) > Math.max(1.5, Math.abs(pm.curr) * 0.002)) issues.push(I('warn', `${m.name}: last week's report said ${pm.curr.toLocaleString()} for that week, but this deck now shows ${m.prev.toLocaleString()} as the previous week (restated).`)); }); }
    if (prev && (type === 'expansion' || type === 'nso')) { const flat = (d) => (type === 'nso' ? d.rows.map((r) => [r.name, r.status]) : d.sections.flatMap((s) => s.rows.map((r) => [s.title + '|' + r[0], r[1]]))); const pm = new Map(flat(prev.data).map(([k, v]) => [norm(k), v])), nm = new Map(flat(data).map(([k, v]) => [norm(k), v])); const added = [...nm.keys()].filter((k) => !pm.has(k)), gone = [...pm.keys()].filter((k) => !nm.has(k)); const chg = [...nm].filter(([k, v]) => pm.has(k) && norm(pm.get(k)) !== norm(v)).length; if (added.length) issues.push(I('info', `${added.length} new row(s) since ${prev.end}.`)); if (gone.length) issues.push(I('warn', `${gone.length} row(s) from ${prev.end} are missing now.`)); if (chg) issues.push(I('info', `${chg} status change(s) since ${prev.end}.`)); }
    // NSO vs NEP
    if (type === 'nso' && others && others.nepList) { const L = others.nepList; data.rows.forEach((r) => { const m = nepMatch(r.name, L); r.nep = m ? { name: m.name, openDate: m.openDate, ym: m.ym, status: m.status } : null; if (!m) { issues.push(I('info', `“${r.name}” is not in the NEP plan for the next months.`)); return; } const nd = m.openDate || `${m.ym}-15`; if (r.when) { const d = days(nd, r.when); r.slipDays = d; if (Math.abs(d) > 7) issues.push(I('warn', `“${r.name}”: this deck says ${r.comment.replace(/^.*?(open|launch)/i, '$1')} (${r.when}), but the NEP plan has ${m.name} on ${m.openDate || m.ym} (${d > 0 ? d + ' days later' : -d + ' days earlier'}).`)); } }); }
    return { type, ds, issues };
  }
  LM.international = { TYPES, analyze, val, nepMatch, openWhen };
})(typeof window !== 'undefined' ? window : globalThis);
