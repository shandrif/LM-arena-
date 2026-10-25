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
  const TYPES = { combined: { label: 'Weekly review deck (all sections)' }, events: { label: 'Event performance report' }, london: { label: 'London weekly review' }, iraq: { label: 'Iraq weekly review' }, expansion: { label: 'Expansion updates (Iraq / GCC)' }, nso: { label: 'Saudi NSO status' }, calendar: { label: 'Events calendar (PDF)' } };

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
    const T = items(s, 'text'); const big = T.filter((t) => (t.fs || 0) >= 20 && /^[£$]?[\d,.]+(\.\d+)?[KkMm]?%?$/.test(t.text)); const out = [];
    big.forEach((b) => { const col = T.filter((u) => u !== b && Math.abs(u.x - b.x) < 0.04); const label = col.filter((u) => u.y < b.y && b.y - u.y < 0.1).sort((p, q) => q.y - p.y)[0]; const sub = col.filter((u) => u.y > b.y && u.y - b.y < 0.25).sort((p, q) => p.y - q.y).map((u) => u.text); if (label) out.push({ label: label.text, value: b.text, sub }); });
    return out;
  }
  function parseReview(slides, name, ov, yearHint, issues, forcedMarket) {
    const first = slides[0]; const sub = items(first, 'text').map((t) => t.text).join(' ');
    const title = first.title; const market = forcedMarket || /^(\w+)/.exec(title.replace(/[–—-].*$/, ''))[1];
    let wk = weeksIn(sub, yearHint);
    if (!wk.length) { const out = []; const re = /Week\s*(\d+)\s*:\s*(\d{1,2})\s*[–—-]\s*(\d{1,2})\s*([A-Za-z]{3})\s*(20\d\d)/g; let m; while ((m = re.exec(sub))) { const m2 = monNo(m[4]); if (m2) out.push({ start: iso(+m[5], m2, +m[2]), end: iso(+m[5], m2, +m[3]), no: +m[1] }); } if (out.length >= 2) wk = [out[out.length - 1], out[out.length - 2]]; } const D = { market, title, period: wk[0] || null, prevPeriod: wk[1] || null, weekNo: (/Week\s*(\d+)\s*\(/i.exec(sub) || [])[1] ? +/Week\s*(\d+)\s*\(/i.exec(sub)[1] : (wk[0] && wk[0].no) || null };
    if (!D.period) issues.push(I('error', 'The reporting week could not be read from the title slide.', { type: 'asOf', id: 'date', kind: 'date', label: 'Use this date as week end' }));
    // metrics table
    const mt = slides.flatMap((s) => items(s, 'table')).find((t) => t.rows[0].length >= 4 && /prev|week\s*\d/i.test(t.rows[0][1]) && /curr|week\s*\d/i.test(t.rows[0][2])); D.metrics = [];
    if (mt) mt.rows.slice(1).forEach((r) => { const pctCol = /%/.test(String(r[3] || '')); const pv = val(r[1]), cv = val(r[2]); D.metrics.push({ name: r[0], prev: pv, curr: cv, change: pctCol && pv != null && cv != null ? cv - pv : val(r[3]), pct: pctCol ? val(r[3]) : r[4] != null ? val(r[4]) : null, raw: r.slice(1) }); });
    else { const tl = slides.flatMap((s) => tiles(s)).filter((t) => t.sub.some((x) => /^W\d/.test(x))); const kv = (v) => { const m = /^([£$]?)([\d,.]+)\s*([KkMm]?)/.exec(String(v).replace(/[−–]/g, '-')); return m ? Number(m[2].replace(/,/g, '')) * ({ k: 1e3, m: 1e6 }[m[3].toLowerCase()] || 1) : null; }; tl.forEach((t) => { const ch = t.sub.find((x) => /[▲▼]/.test(x)) || ''; const w1 = t.sub.find((x) => /^W\d/.test(x)) || ''; const pc2 = /([▲▼])\s*([\d.]+)%/.exec(ch); D.metrics.push({ name: t.label, prev: kv(w1.replace(/^W\d\s*/, '')), curr: kv(t.value), change: null, pct: pc2 ? (pc2[1] === '▼' ? -1 : 1) * Number(pc2[2]) : null, raw: [w1.replace(/^W\d\s*/, ''), t.value, ch.replace(/^[▲▼]\s*[\d.]+%\s*/, '') || ch] }); }); if (!D.metrics.length) issues.push(I('warn', 'No week-on-week summary table found.')); }
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
    D.blocks.filter((b) => b.kind === 'chart' && b.chart.series.length >= 1 && /^(sun|mon)/i.test(b.chart.cats[0] || '') && !/by store|per store|each store/i.test(b.title) && b.chart.series.slice(0, 2).every((x) => /week|^w\d|wk|prev|last|curr|this/i.test(x.name || ''))).forEach((b) => { const t = b.title; const find = /net sales/i.test(t) ? (net || byName(/net sales/i)) : /transaction|bills/i.test(t) ? bills : null; if (!find) return; const s = b.chart.series; [[s[0], 'prev'], [s[1], 'curr']].forEach(([se, k]) => { if (!se) return; const sm = sum(se.values, (v) => v); const tv = /net sales/i.test(t) && D.fx && /iqd/i.test(find.name) ? find[k] : find[k]; const alt = /net sales/i.test(t) ? D.metrics.find((m) => /net sales.*\(sar\)/i.test(m.name)) : null; const target = alt ? alt[k] : tv; if (target && Math.abs(sm - target) > Math.max(2, target * 0.004)) issues.push(I('warn', `Slide ${b.slide}: the daily chart (${k === 'curr' ? 'current' : 'previous'} week) adds up to ${Math.round(sm).toLocaleString()} but the summary says ${Math.round(target).toLocaleString()}.`)); }); });
    // callouts, focus points, info
    const CAL = /^(WHAT WORKED|AREA TO FOCUS|AREA TO IMPROVE|WATCH|WHAT HAPPENED|WHAT DROVE IT|LEARNING|RISK)\b/i; D.callouts = [];
    slides.forEach((s) => items(s, 'text').forEach((t) => { const m = CAL.exec(t.text); if (m && t.text.includes('\n')) { const L = t.text.split('\n').map((x) => x.trim()).filter(Boolean); D.callouts.push({ slide: s.n, kind: L[0].toUpperCase(), title: L[1] || '', text: L.slice(2).join(' ') }); } }));
    const CAL2 = /^(WHAT WENT WELL|WHAT WORKED|AREA TO FOCUS|AREA TO IMPROVE|WATCH|WHAT HAPPENED)$/i;
    slides.forEach((s) => { const T = items(s, 'text'); T.filter((t) => CAL2.test(t.text.trim())).forEach((l) => { const col = T.filter((u) => u !== l && !CAL2.test(u.text.trim()) && Math.abs(u.x - l.x) < 0.03 && u.y > l.y && u.y - l.y < 0.2).sort((a, b) => a.y - b.y); if (col.length) D.callouts.push({ slide: s.n, kind: l.text.trim().toUpperCase(), title: col[0].text.replace(/\s+/g, ' '), text: col[1] ? col[1].text.replace(/\s+/g, ' ') : '' }); }); });
    const fs = slides.find((s) => /areas?\s+(to\s+)?(focus|improve)|focus points/i.test(s.title) && !items(s, 'chart').length && !items(s, 'table').length); D.focus = []; if (fs) { const k = LM.training.kpiPairs(fs); const c = LM.training.cards(fs, new Set()); D.focus = c.cards.map((x) => ({ no: x.no, title: x.title, desc: x.desc, target: x.status })).filter((x) => x.title); if (!D.focus.length) issues.push(I('warn', 'The focus-points slide was found but no numbered items could be read.')); }
    const inf = slides.find((s) => /^information/i.test(s.title)); D.info = inf ? items(inf, 'text').filter((t) => t.text !== inf.title).flatMap((t) => t.text.split('\n')).map((x) => x.trim()).filter((x) => x.length > 3) : [];
    const gs = slides.find((s) => /half million caf|google reviews/i.test(s.title + ' ' + items(s, 'text').map((t) => t.text).join(' ')) && !/week/i.test(s.title)); if (gs && !D.info.length) { const T = items(gs, 'text').filter((t) => t.text !== gs.title); const g = (re) => T.find((t) => re.test(t.text)); const rating = g(/^\d\.\d$/), nrev = T.find((t) => /^[\d,]{3,}$/.test(t.text.trim())), loves = T.find((t) => /^special|love/i.test(t.text) && t.text.includes('\n')) || T.filter((t) => t.text.includes('\n') && t.x > 0.4 && t.x < 0.6)[0], flags = T.filter((t) => t.text.includes('\n') && t.x > 0.65)[0], hrs = g(/^hours/i), src = g(/^source/i), addr = g(/\d.*(st|street|road).*·|·.*next to/i); D.info = [rating ? `Google rating ${rating.text}${nrev ? ` from ${nrev.text.trim()} reviews` : ''}${T.find((t) => /lowest price|£/.test(t.text) && t.text.length < 40) ? ' · ' + T.find((t) => /price band/.test(t.text)).text : ''}.` : null, addr ? addr.text : null, loves ? 'Guests love: ' + loves.text.split('\n').join('; ') : null, flags ? 'Guests flag: ' + flags.text.split('\n').join('; ') : null, hrs ? hrs.text : null, src ? src.text : null].filter(Boolean); }
    D.tiles = slides.flatMap((s) => tiles(s)); D.slides = slides.map((s) => ({ n: s.n, title: s.title }));
    if (D.period) { const len = days(D.period.start, D.period.end) + 1; if (len !== 7) issues.push(I('warn', `The week is ${len} days (${D.period.start} → ${D.period.end}).`)); if (D.prevPeriod && days(D.prevPeriod.end, D.period.start) !== 1) issues.push(I('warn', `The “previous week” (${D.prevPeriod.start} → ${D.prevPeriod.end}) does not directly precede the current week.`)); if (!D.prevPeriod) issues.push(I('warn', 'The previous week could not be read from the title slide.')); const dow = new Date(D.period.start + 'T00:00:00Z').getUTCDay(); if (dow !== 0) issues.push(I('info', `The week starts on a ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow]}.`)); }
    return D;
  }


  /* ---------- event performance report ---------- */
  function parseEvents(slides, issues) {
    const s0 = slides[0]; const sub = items(s0, 'text').map((t) => t.text).join(' ');
    const pm = /(\d{1,2})\s*[–—-]\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d\d)/.exec(sub); const m = pm ? monNo(pm[3]) : 0; const period = pm && m ? { start: iso(+pm[4], m, +pm[1]), end: iso(+pm[4], m, +pm[2]) } : null;
    const cnt = /(\d+)\s+reported events/i.exec(sub); const D = { title: s0.title, period, reported: cnt ? +cnt[1] : null, subtitle: items(s0, 'text').slice(1).map((t) => t.text.replace(/\s+/g, ' ')).join(' · ') };
    const isNum = (t) => /^[\d,.]+$/.test(t.text.trim());
    const ks = slides.find((x) => items(x, 'text').filter((t) => (t.fs || 0) >= 24 && isNum(t)).length >= 4); D.kpis = []; D.insights = [];
    if (ks) { const T = items(ks, 'text'); T.filter((t) => (t.fs || 0) >= 24 && isNum(t)).sort((a, b) => a.x - b.x).forEach((b) => { const lab = T.filter((u) => u !== b && Math.abs(u.x - b.x) < 0.05 && u.y > b.y && u.y - b.y < 0.2).sort((p, q) => p.y - q.y)[0]; D.kpis.push({ label: lab ? lab.text.replace(/\s+/g, ' ') : '', value: b.text.trim(), n: Number(b.text.replace(/,/g, '')) }); });
      const marks = T.filter((t) => /^\d$/.test(t.text.trim()) && t.x < 0.08 && t.y > 0.45).sort((a, b) => a.y - b.y); marks.forEach((mk) => { const tx = T.find((u) => u.x > mk.x + 0.03 && Math.abs(u.y - mk.y) < 0.03 && u.text.length > 15); if (tx) D.insights.push(tx.text.replace(/\s+/g, ' ')); }); }
    else issues.push(I('warn', 'The headline figures slide (cups, net sales, transactions, average check) was not found.'));
    const tb = slides.flatMap((x) => items(x, 'table').map((t) => ({ s: x, t }))).find((o) => /^event$/i.test(norm(o.t.rows[0][0])) && o.t.rows[0].length >= 6); D.events = [];
    if (tb) { const H = tb.t.rows[0].map(norm); const c = { name: 0, type: H.findIndex((h) => /^type/.test(h)), cups: H.findIndex((h) => /^cups/.test(h)), net: H.findIndex((h) => /^netsales/.test(h)), trans: H.findIndex((h) => /^trans/.test(h)), avg: H.findIndex((h) => /^avgcheck|^averagecheck/.test(h)), days: H.findIndex((h) => /^days/.test(h)), daily: H.findIndex((h) => /^avgdaily|^averagedaily/.test(h)) }; tb.t.rows.slice(1).filter((r) => r[0] && !/^total/i.test(r[0].trim())).forEach((r) => D.events.push({ name: r[0].trim(), type: c.type >= 0 ? r[c.type] : '', cups: val(r[c.cups]), net: val(r[c.net]), trans: val(r[c.trans]), avg: val(r[c.avg]), days: val(r[c.days]), daily: val(r[c.daily]) })); }
    else issues.push(I('error', 'The event-by-event table was not found.'));
    D.claims = slides.slice(1).filter((x) => x.title).map((x) => ({ slide: x.n, title: x.title })); D.notes = slides.flatMap((x) => items(x, 'text').filter((t) => (t.fs || 99) <= 9 && t.text.length > 40).map((t) => t.text.replace(/\s+/g, ' ')));
    D.blocks = []; slides.forEach((x) => { items(x, 'table').forEach((t) => D.blocks.push({ slide: x.n, title: x.title, kind: 'table', rows: t.rows })); items(x, 'chart').forEach((c) => D.blocks.push({ slide: x.n, title: x.title, kind: 'chart', chart: c })); }); D.slides = slides.map((x) => ({ n: x.n, title: x.title }));
    // checks
    if (!period) issues.push(I('error', 'The reporting period could not be read from the title slide (e.g. “1–24 October 2026”).', { type: 'asOf', id: 'date', kind: 'date', label: 'Use this date as the period end' }));
    const E = D.events; const k = (re) => D.kpis.find((x) => re.test(x.label));
    const kc = k(/cups/i), kn = k(/net sales/i), kt = k(/transactions/i), ka = k(/average check/i), ke = k(/events/i);
    if (kc && E.length && Math.abs(sum(E, (e) => e.cups) - kc.n) > 1) issues.push(I('warn', `Cups: the events add up to ${Math.round(sum(E, (e) => e.cups)).toLocaleString()} but the headline says ${kc.value}.`));
    if (kn && E.length && Math.abs(sum(E, (e) => e.net) - kn.n) > Math.max(2, kn.n * 0.001)) issues.push(I('warn', `Net sales: the events add up to ${Math.round(sum(E, (e) => e.net)).toLocaleString()} but the headline says ${kn.value}.`));
    if (kt && E.length && Math.abs(sum(E, (e) => e.trans) - kt.n) > 1) issues.push(I('warn', `Transactions: the events add up to ${Math.round(sum(E, (e) => e.trans)).toLocaleString()} but the headline says ${kt.value}.`));
    if (kn && kt && ka && Math.abs(kn.n / kt.n - ka.n) > 0.05) issues.push(I('warn', `Average check shows ${ka.value} but net sales ÷ transactions = ${(kn.n / kt.n).toFixed(2)}.`));
    const nEv = ke ? ke.n : D.reported; if (nEv != null && E.length && E.length !== nEv) issues.push(I('warn', `The deck says ${nEv} reported events but the table lists ${E.length}.`));
    E.forEach((e) => { if (e.net != null && e.trans && e.avg != null && Math.abs(e.net / e.trans - e.avg) > 0.05) issues.push(I('warn', `${e.name}: average check is ${e.avg} but net sales ÷ transactions = ${(e.net / e.trans).toFixed(2)}.`)); if (e.net != null && e.days && e.daily != null && Math.abs(e.net / e.days - e.daily) > 1) issues.push(I('warn', `${e.name}: average daily sales is ${e.daily} but net sales ÷ days = ${(e.net / e.days).toFixed(2)}.`)); });
    D.notes.filter((t) => /listed as|but recorded|anomal/i.test(t)).forEach((t) => issues.push(I('info', t)));
    const comp = E.filter((e) => /complimentary/i.test(e.type) && e.net > 0); if (comp.length) issues.push(I('warn', `Marked complimentary but with sales: ${comp.map((e) => `${e.name} (SAR ${Math.round(e.net).toLocaleString()})`).join('; ')}.`));
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

  /* ---------- one deck holding several sections (London, Iraq, event performance, Saudi NSO, expansion) ---------- */
  const hasTable = (s, re) => items(s, 'table').some((t) => re.test(t.rows[0].map(norm).join('|')));
  function sectionsOf(slides) {
    const iL = slides.findIndex((s) => /london.*weekly\s*(performance\s*)?review/i.test(s.title)); const iI = slides.findIndex((s) => /weekly sales comparison/i.test(s.title) || (/iraq/i.test(items(s, 'text').map((t) => t.text).join(' ')) && /store-by-store/i.test(items(s, 'text').map((t) => t.text).join(' ')))); const iE = slides.findIndex((s) => /event performance report/i.test(s.title));
    const marks = [['london', iL], ['iraq', iI], ['events', iE]].filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]); if (marks.length < 2) return null;
    const tailAt = slides.findIndex((s, i) => i > (marks[marks.length - 1][1]) && (hasTable(s, /readiness/) || /^nso\b|gcc expansion|^expansion$/i.test(s.title))); const end = tailAt >= 0 ? tailAt : slides.length; const out = [];
    marks.forEach(([k, i], j) => out.push([k, slides.slice(i, j + 1 < marks.length ? marks[j + 1][1] : end)]));
    const tail = tailAt >= 0 ? slides.slice(tailAt) : []; const nsoS = tail.filter((s) => hasTable(s, /readiness/)), expS = tail.filter((s) => items(s, 'table').length && !hasTable(s, /readiness/) && hasTable(s, /status/));
    if (nsoS.length) out.push(['nso', nsoS]); if (expS.length) out.push(['expansion', expS]); return out;
  }
  async function analyzeCombined(secs, name, ov, template, existing, hash, others) {
    const parts = []; let weekEnd = ov.asOf && ov.asOf.date;
    for (const [type, sl] of secs) { const r = await analyzeSlides(sl, name, type === 'nso' || type === 'expansion' ? { ...ov, asOf: { date: weekEnd || (parts.find((p) => p.type === 'london' && p.ds) || {}).ds ? weekEnd || parts.find((p) => p.type === 'london').ds.end : (others && others.end) } } : ov, template, existing, hash, others, type); parts.push({ type, ds: r.ds, issues: r.issues, label: TYPES[type].label }); if (!weekEnd && r.ds && (type === 'london' || type === 'iraq')) weekEnd = r.ds.end; }
    const issues = []; parts.forEach((p) => p.issues.forEach((i) => issues.push({ ...i, msg: `${p.label}: ${i.msg}` })));
    const known = template.combined || []; const got = parts.map((p) => p.type); known.filter((k) => !got.includes(k)).forEach((k) => issues.push(I('warn', `The ${TYPES[k].label} section was in the previous deck but is missing now.`))); got.filter((k) => known.length && !known.includes(k)).forEach((k) => issues.push(I('info', `New section in this deck: ${TYPES[k].label}.`)));
    if (!secs.some(([k]) => k === 'nso')) issues.push(I('info', 'No Saudi NSO / stores-to-open table was found in this deck.'));
    const pic = []; const dates = parts.filter((p) => p.ds && (p.type === 'london' || p.type === 'iraq')).map((p) => p.ds.end); if (new Set(dates).size > 1) issues.push(I('warn', `The London and Iraq sections end on different days (${[...new Set(dates)].join(', ')}).`)); void pic;
    const ends = parts.filter((p) => p.ds).map((p) => p.ds.end).sort(); return { type: 'combined', parts, issues, ds: { type: 'combined', start: ends[0] || null, end: weekEnd || ends[ends.length - 1] || null, data: {} } };
  }
  async function analyze(buf, name, ov, template, existing, hash, others) {
    ov = ov || {}; template = template || {}; let slides; try { slides = await LM.pptx.read(buf); } catch (e) { return { type: null, ds: null, issues: [I('error', `“${name}” could not be read as a PowerPoint (.pptx) (${e.message}).`)] }; }
    if (!slides.length) return { type: null, ds: null, issues: [I('error', 'The presentation has no slides.')] };
    const secs = ov.type ? null : sectionsOf(slides); if (secs) return analyzeCombined(secs, name, ov, template, existing || [], hash, others);
    return analyzeSlides(slides, name, ov, template, existing, hash, others, null);
  }
  async function analyzeSlides(slides, name, ov, template, existing, hash, others, forced) {
    ov = ov || {}; existing = existing || []; template = template || {}; const issues = [];
    const type = forced || ov.type || detect(slides); if (!type || type === 'review') return { type: null, ds: null, issues: [I('error', 'This deck was not recognised as a London / Iraq weekly review, expansion update or NSO status.', { type: 'type', id: 'type', options: ['london', 'iraq', 'events', 'expansion', 'nso'], label: 'Treat this file as' })] };
    const yh = (template.year) || new Date().getFullYear(); let data, start = null, end = null;
    if (type === 'events') { data = parseEvents(slides, issues); end = data.period ? data.period.end : null; start = data.period ? data.period.start : null; if (ov.asOf && ov.asOf.date) { end = ov.asOf.date; start = start || end; data.period = { start, end }; for (let i = issues.length - 1; i >= 0; i--) if (/reporting period could not be read/.test(issues[i].msg)) issues.splice(i, 1); } }
    else if (type === 'london' || type === 'iraq') { data = parseReview(slides, name, ov, yh, issues, forced ? (type === 'iraq' ? 'Iraq' : 'London') : null); end = data.period ? data.period.end : null; start = data.period ? data.period.start : null; if (ov.asOf && ov.asOf.date) { end = ov.asOf.date; start = addDays(end, -6); data.period = { start, end }; for (let i = issues.length - 1; i >= 0; i--) if (/could not be read from the title/.test(issues[i].msg)) issues.splice(i, 1); } }
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
  LM.international = { TYPES, analyze, val, nepMatch, openWhen, sectionsOf };
})(typeof window !== 'undefined' ? window : globalThis);
