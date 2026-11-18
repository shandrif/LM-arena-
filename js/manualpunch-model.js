/* Manual punch: self-contained HTML report ("Manual Punch Dashboard") with an embedded JSON block of store figures
   (manual punch value vs total sales per period). The original report is kept and shown as it is; the figures are read for the summary. */
(function (root) {
  const LM = (root.LM = root.LM || {});
  const I = (level, msg, fix) => ({ level, msg, fix });
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const FULL = { jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June', jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December' };
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const unesc = (s) => String(s).replace(/&middot;/g, '·').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&rarr;/g, '→').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');

  const getJson = (html) => { const m = /<script[^>]*id=["']data-json["'][^>]*>([\s\S]*?)<\/script>/i.exec(html); if (!m) return null; try { return JSON.parse(m[1]); } catch (e) { return undefined; } };
  const detect = (html) => /id=["']data-json["']/.test(html) && /manual punch/i.test(html);

  function periodKeys(D) { const ks = Object.keys(D.totals || {}).filter((k) => !/mtd/i.test(k)); return ks; }
  function labelsFrom(html, keys) {
    const m = /labels\s*:\s*\[([^\]]+)\]/.exec(html); let labels = m ? [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]) : [];
    if (labels.length !== keys.length) labels = keys.map((k) => { const mm = /^([a-z]{3})(\d*)$/.exec(k); return mm && FULL[mm[1]] ? (mm[2] ? `${FULL[mm[1]]} window ${mm[2]}` : FULL[mm[1]]) : k; });
    return labels;
  }
  function notesFrom(html) {
    if (typeof DOMParser === 'undefined') return { title: '', head: '', notes: [] };
    const doc = new DOMParser().parseFromString(html, 'text/html'); doc.querySelectorAll('script,style').forEach((n) => n.remove());
    const title = (doc.querySelector('title') || {}).textContent || ''; const head = (doc.querySelector('header') || {}).textContent || '';
    const notes = [...doc.querySelectorAll('p,li,.note,.footnote,.sub')].map((n) => n.textContent.replace(/\s+/g, ' ').trim()).filter((t) => t.length > 60); return { title: title.trim(), head: head.replace(/\s+/g, ' ').trim(), notes: [...new Set(notes)] };
  }
  function asOfFrom(title, head) { const t = `${title} ${head}`; const m = /([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*,?\s*(20\d\d)/g; let last = null, x; while ((x = m.exec(unesc(t)))) { const mi = MON.indexOf(x[1].slice(0, 3).toLowerCase()); if (mi >= 0) last = iso(x[3], mi + 1, +x[2]); } return last; }

  function analyze(rf, existing, template, ov) {
    ov = ov || {}; existing = existing || []; template = template || {}; const issues = []; const html = rf.text;
    if (!/<html|<!doctype/i.test(html)) return { ds: null, issues: [I('error', 'This is not an HTML report.')] };
    const D = getJson(html); if (D === null) return { ds: null, issues: [I('error', 'This HTML file has no embedded data block (script id “data-json”), so it is not a Manual Punch report this dashboard can read.')] };
    if (D === undefined) return { ds: null, issues: [I('error', 'The embedded data block in the HTML could not be read (invalid JSON).')] };
    if (!Array.isArray(D.stores) || !D.totals) return { ds: null, issues: [I('error', 'The data block does not have “stores” and “totals”.')] };
    const keys = periodKeys(D); if (!keys.length) return { ds: null, issues: [I('error', 'No periods were found in the totals.')] };
    const labels = labelsFrom(html, keys); if (labels.length === keys.length && !/labels\s*:\s*\[/.test(html)) issues.push(I('info', 'Period names were not found in the report, so they are derived from the data keys.'));
    const N = notesFrom(html); const periods = keys.map((k, i) => ({ key: k, label: labels[i], manual: D.totals[k].manual, total: D.totals[k].total, pct: D.totals[k].pct }));
    const stores = D.stores.map((s) => ({ store: String(s.store || '').trim(), reason: s.reason || '', action: s.action || '', mtd: s.octmtd_pct != null ? s.octmtd_pct : (Object.keys(s).find((k) => /mtd_pct$/.test(k)) ? s[Object.keys(s).find((k) => /mtd_pct$/.test(k))] : null), p: keys.map((k) => ({ pct: s[k + '_pct'], manual: s[k + '_manual'], total: s[k + '_total'] })) }));
    // ---- checks ----
    const bad = D.stores.filter((s) => keys.some((k) => s[k + '_pct'] === undefined || s[k + '_manual'] === undefined || s[k + '_total'] === undefined)); if (bad.length) issues.push(I('warn', `${bad.length} store(s) are missing a figure for some period: ${bad.slice(0, 4).map((s) => s.store).join('; ')}.`));
    const dup = {}; stores.forEach((s) => (dup[s.store] = (dup[s.store] || 0) + 1)); Object.entries(dup).filter(([, n]) => n > 1).forEach(([k]) => issues.push(I('warn', `Store “${k}” appears more than once.`)));
    periods.forEach((p) => { if (p.total > 0 && Math.abs((p.manual / p.total) * 100 - p.pct) > 0.02) issues.push(I('warn', `${p.label}: the company total says ${p.pct}% but ${Math.round(p.manual).toLocaleString()} ÷ ${Math.round(p.total).toLocaleString()} = ${((p.manual / p.total) * 100).toFixed(2)}%.`)); });
    const badPct = []; stores.forEach((s) => s.p.forEach((q, i) => { if (q.total > 0 && Math.abs((q.manual / q.total) * 100 - q.pct) > 0.06) badPct.push(`${s.store} ${periods[i].label}`); })); if (badPct.length) issues.push(I('warn', `${badPct.length} store percentage(s) do not match manual ÷ total, e.g. ${badPct.slice(0, 3).join('; ')}.`));
    periods.forEach((p, i) => { const sm = sum(stores, (s) => s.p[i].manual), st = sum(stores, (s) => s.p[i].total); if (p.total > 0 && Math.abs(sm - p.manual) > Math.max(5, p.manual * 0.005)) issues.push(I('warn', `${p.label}: the stores add up to ${Math.round(sm).toLocaleString()} manual but the company total is ${Math.round(p.manual).toLocaleString()}.`)); if (p.total > 0 && Math.abs(st - p.total) > Math.max(5, p.total * 0.005)) issues.push(I('info', `${p.label}: the stores' sales add up to ${Math.round(st).toLocaleString()} but the company total is ${Math.round(p.total).toLocaleString()} (difference ${Math.round(p.total - st).toLocaleString()}; the report excludes test stores from the list).`)); });
    const mt = D.totals[Object.keys(D.totals).find((k) => /mtd/i.test(k))]; if (mt) { const mk = keys.filter((k) => /^oct\d/.test(k)); if (mk.length) { const m2 = sum(mk, (k) => D.totals[k].manual), t2 = sum(mk, (k) => D.totals[k].total); if (Math.abs(m2 - mt.manual) > 5 || Math.abs(t2 - mt.total) > 5) issues.push(I('warn', `The month-to-date total does not equal the sum of its weekly windows (${Math.round(m2).toLocaleString()} vs ${Math.round(mt.manual).toLocaleString()}).`)); } }
    const noReason = stores.filter((s) => s.p[s.p.length - 1].total > 0 && s.p[s.p.length - 1].pct >= 3 && !s.reason); if (noReason.length) issues.push(I('info', `${noReason.length} store(s) at 3% or more in the latest period have no reason or action in the report.`));
    const nonCh = []; if (!/cdn\.jsdelivr|chart\.umd/i.test(html)) issues.push(I('info', 'The report does not load a chart library; it is shown as it is.'));
    if (/<script[^>]+src=["']https?:/i.test(html)) { const ext = [...html.matchAll(/<script[^>]+src=["'](https?:[^"']+)/gi)].map((m) => m[1]); issues.push(I('info', `The report loads ${ext.length} external script(s) (${ext.map((u) => u.split('/').slice(2, 4).join('/')).join(', ')}). The chart library is replaced by the dashboard's own copy so the report works offline.`)); } void nonCh;
    const asOf = ov.asOf && ov.asOf.date ? ov.asOf.date : asOfFrom(N.title, N.head);
    if (!asOf) issues.push({ level: 'error', msg: 'The report date could not be found. Enter the date the report runs to.', fix: { type: 'asOf', id: 'date', kind: 'date', label: 'Use this date' } });
    if (asOf && !ov.asOf) issues.push(I('info', `Report runs to ${asOf} (read from the title).`));
    existing.forEach((e) => { if (e.hash === rf.hash) issues.push(I('warn', `This exact report was already uploaded (${e.end}).`)); else if (asOf && e.end === asOf) issues.push(I('warn', `A manual punch report to ${asOf} already exists. Approving replaces it (the old one is kept in history).`)); else if (asOf && e.end > asOf) issues.push(I('warn', `A newer manual punch report (${e.end}) already exists.`)); });
    const prev = asOf ? [...existing].sort((a, b) => (a.end < b.end ? 1 : -1)).find((e) => e.end < asOf) : null; if (prev) { const a = new Set(prev.data.stores.map((s) => s.store)), b = new Set(stores.map((s) => s.store)); const added = [...b].filter((x) => !a.has(x)), gone = [...a].filter((x) => !b.has(x)); if (added.length) issues.push(I('info', `${added.length} new store(s) since ${prev.end}: ${added.slice(0, 5).join('; ')}.`)); if (gone.length) issues.push(I('warn', `${gone.length} store(s) from ${prev.end} are missing now: ${gone.slice(0, 5).join('; ')}.`)); }
    const kn = template.knownStores || []; if (kn.length) { const nw = stores.map((s) => s.store).filter((x) => !kn.includes(x)); if (nw.length) issues.push(I('info', `${nw.length} store(s) not seen in earlier reports: ${nw.slice(0, 5).join('; ')}.`)); }
    return { ds: asOf ? { type: 'manualpunch', start: asOf, end: asOf, data: { html, title: N.title, head: N.head, notes: N.notes, periods, stores, mtd: mt || null } } : null, issues };
  }

  function compute(ds) {
    const d = ds.data, P = d.periods, S = d.stores; const L = P.length - 1, V = L - 1; const active = (s, i) => s.p[i] && s.p[i].total > 0; const act = S.filter((s) => active(s, L));
    const over = (thr) => act.filter((s) => s.p[L].pct >= thr).sort((a, b) => b.p[L].manual - a.p[L].manual);
    const prevHigh = S.filter((s) => V >= 0 && active(s, V) && s.p[V].pct >= 3); const recovered = prevHigh.filter((s) => !active(s, L) || s.p[L].pct < 3); const worse = V >= 0 ? act.filter((s) => active(s, V) && s.p[L].pct > s.p[V].pct).length : null, better = V >= 0 ? act.filter((s) => active(s, V) && s.p[L].pct < s.p[V].pct).length : null;
    const topManual = [...act].sort((a, b) => b.p[L].manual - a.p[L].manual); const tot = P[L].manual; const top3 = topManual.slice(0, 3);
    const anyOver10 = S.filter((s) => s.p.some((q) => q.total > 0 && q.pct > 10));
    return { periods: P, L, V, latest: P[L], prev: V >= 0 ? P[V] : null, mtd: d.mtd, over3: over(3), over10: over(10), recovered, worse, better, active: act.length, top3, top3Share: tot ? sum(top3, (s) => s.p[L].manual) / tot : null, restPct: (() => { const rm = tot - sum(top3, (s) => s.p[L].manual), rt = P[L].total - sum(top3, (s) => s.p[L].total); return rt > 0 ? (rm / rt) * 100 : null; })(), anyOver10 };
  }

  /* ---------- the PowerPoint “Executive Summary” (trend chart + flagged stores), checked against the last full report ---------- */
  const isDeck = (slides) => slides.some((sl) => /manual punch/i.test(sl.title || '') || sl.items.some((i) => i.kind === 'text' && /manual punch/i.test(i.text)));
  function periodOf(label, year) { const m = /^([A-Za-z]{3})[a-z]*\.?\s*(\d{1,2})\s*[–—-]\s*(\d{1,2})$/.exec(String(label).trim()); if (!m) return null; const mi = MON.indexOf(m[1].toLowerCase()); return mi < 0 ? null : { start: iso(year, mi + 1, +m[2]), end: iso(year, mi + 1, +m[3]) }; }
  const keyOf = (label) => { const t = String(label).trim().toLowerCase(); const m = /^([a-z]{3})[a-z]*\s*(\d{1,2})\s*[–—-]\s*(\d{1,2})$/.exec(t); return m ? `${m[1]}${m[2]}_${m[3]}` : t.slice(0, 3); };
  function analyzeDeck(slides, name, all, hash, ov) {
    ov = ov || {}; all = all || []; const issues = []; const T = (sl) => sl.items.filter((i) => i.kind === 'text'); const cl = (x) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim();
    if (!isDeck(slides)) return { ds: null, issues: [I('error', 'This PowerPoint is not a Manual Punch executive summary.')] };
    const ch = slides.flatMap((sl) => sl.items.filter((i) => i.kind === 'chart')).find((c) => c.series && c.series.some((se) => /manual punch|%/i.test(se.name || '')) && c.cats && c.cats.length >= 2);
    if (!ch) return { ds: null, issues: [I('error', 'The trend chart (manual punch % of total sales by period) was not found.')] };
    const se = ch.series.find((x) => /manual punch|%/i.test(x.name || '')) || ch.series[0];
    const prevFull = [...all].filter((e) => e.data && !e.data.kind && e.data.periods).sort((a, b) => (a.end < b.end ? 1 : -1))[0] || null;
    const year = +((/(20\d\d)/.exec(name) || [])[1] || (prevFull ? prevFull.end.slice(0, 4) : new Date().getFullYear()));
    const periods = ch.cats.map((c, i) => ({ key: keyOf(c), label: cl(c).replace(/(\d)-(\d)/, '$1-$2'), pct: se.values[i] == null ? null : +(+se.values[i]).toFixed(2), manual: null, total: null }));
    const last = periods[periods.length - 1]; const per = ov.asOf && ov.asOf.date ? { start: ov.asOf.date, end: ov.asOf.date } : periodOf(last.label, year);
    if (!per) issues.push({ level: 'error', msg: `The latest period (“${last.label}”) has no readable dates. Enter the date the summary runs to.`, fix: { type: 'asOf', id: 'date', kind: 'date', label: 'Use this date' } });
    // headline figures: big value + its caption
    const callouts = []; slides.forEach((sl) => T(sl).filter((t) => /^(SAR\s*)?[\d.,]+\s*[KkMm%]?$/.test(t.text.trim()) && (t.fs || 0) >= 20).sort((a, b) => a.y - b.y).forEach((v) => { const lab = T(sl).filter((u) => u !== v && Math.abs(u.x - v.x) < 0.05 && u.y > v.y && u.y - v.y < 0.15).sort((a, b) => a.y - b.y)[0]; callouts.push({ value: v.text.trim(), label: lab ? cl(lab.text) : '' }); }));
    // flagged stores table
    const tb = slides.flatMap((sl) => sl.items.filter((i) => i.kind === 'table')).find((t) => /store/i.test(t.rows[0][0] || '') && t.rows[0].some((c) => /reason|action|status/i.test(c)));
    const H = tb ? tb.rows[0].map((x) => cl(x).toLowerCase()) : []; const col = (re) => H.findIndex((x) => re.test(x));
    const flagged = tb ? tb.rows.slice(1).filter((r) => cl(r[0])).map((r) => { const rc = cl(r[col(/rate/)] || ''); const m = /([\d.]+)\s*%\s*(?:→|->|to)\s*([\d.]+)\s*%/.exec(rc); return { store: cl(r[0]), rateText: rc, from: m ? +m[1] : null, to: m ? +m[2] : null, manual: col(/manual/) >= 0 ? Number(String(r[col(/manual/)]).replace(/[^\d.]/g, '')) || null : null, reason: cl(r[col(/reason/)] || ''), action: cl(r[col(/action/)] || ''), status: cl(r[col(/status/)] || '') }; }) : [];
    if (!tb) issues.push(I('warn', 'No flagged-stores table (Store / Rate change / Reason / Action / Status) was found.'));
    const titles = slides.map((sl) => cl(sl.title)).filter(Boolean); const source = cl((slides.flatMap(T).find((t) => /^source\s*:/i.test(t.text.trim())) || {}).text || '');
    // ---- checks against the deck itself and the last full report ----
    const pp = (x) => +(+x).toFixed(2);
    if (prevFull) { let same = 0; periods.forEach((p) => { const q = prevFull.data.periods.find((x) => x.label.toLowerCase().replace(/\s+/g, '') === p.label.toLowerCase().replace(/\s+/g, '')); if (q && p.pct != null) { same++; if (Math.abs(q.pct - p.pct) > 0.011) issues.push(I('warn', `${p.label}: the deck says ${p.pct}% but the full report to ${prevFull.end} says ${q.pct}%.`)); } }); if (same) issues.push(I('info', `${same} of the deck’s ${periods.length} periods were also in the full report to ${prevFull.end}; their rates were compared.`)); }
    const days = (String(last.label).match(/\d+/g) || []); const c1 = callouts.find((c) => /%$/.test(c.value) && days.length && days.every((d) => new RegExp('\\b' + d + '\\b').test(c.label.split(/\bvs\b/i)[0]))) || callouts.find((c) => /%$/.test(c.value));
    if (c1 && last.pct != null && Math.abs(parseFloat(c1.value) - last.pct) > 0.011) issues.push(I('warn', `The headline says ${c1.value} for the latest period but the chart says ${last.pct}%.`));
    const vsPrev = c1 ? /vs\.?\s*([\d.]+)%/.exec(c1.label) : null; const pv = periods[periods.length - 2]; if (vsPrev && pv && pv.pct != null && Math.abs(+vsPrev[1] - pv.pct) > 0.011) issues.push(I('warn', `The headline compares with ${vsPrev[1]}% but the chart shows ${pv.pct}% for ${pv.label}.`));
    const day = callouts.find((c) => /a day/i.test(c.label)); const fromOct = day ? /from\s+SAR\s*([\d.,]+)\s*([KkMm]?)\s+in\s+([A-Za-z]+)/i.exec(day.label) : null;
    if (fromOct && prevFull) { const mi = MON.indexOf(fromOct[3].slice(0, 3).toLowerCase()); const q = prevFull.data.periods.find((x) => x.key === MON[mi]); if (q && q.manual) { const dim = new Date(Date.UTC(year, mi + 1, 0)).getUTCDate(); const perDay = q.manual / dim; const said = Number(fromOct[1].replace(/,/g, '')) * ({ k: 1e3, m: 1e6 }[fromOct[2].toLowerCase()] || 1); if (Math.abs(perDay - said) > Math.max(60, said * 0.005)) issues.push(I('warn', `${FULL[MON[mi]]} manual sales a day: the deck says SAR ${fromOct[1]}${fromOct[2]} but the full report gives SAR ${Math.round(perDay).toLocaleString()}.`)); } }
    const tm = /([\d.]+)%\s*in\s+([A-Za-z]+).*?to\s+([\d.]+)%/i.exec(titles[0] || ''); if (tm && periods[0].pct != null && last.pct != null) { if (Math.abs(+tm[1] - periods[0].pct) > 0.051) issues.push(I('warn', `The title says ${tm[1]}% in ${tm[2]} but the chart says ${periods[0].pct}%.`)); if (Math.abs(+tm[3] - last.pct) > 0.051) issues.push(I('warn', `The title says ${tm[3]}% now but the chart says ${last.pct}%.`)); }
    if (prevFull && flagged.length) { const L = prevFull.data.periods.length - 1; const lab = prevFull.data.periods[L].label; const bad = []; let found = 0; flagged.forEach((f) => { const code = (/^B\s*0*(\d+)/i.exec(f.store) || [])[1]; const ps = prevFull.data.stores.find((x) => (code && new RegExp('^B\\s*0*' + code + '\\b', 'i').test(x.store)) || x.store === f.store); if (!ps || f.from == null) return; found++; const q = ps.p[L]; if (q && q.pct != null && Math.abs(q.pct - f.from) > 0.051) bad.push(`${f.store} ${f.from}% vs ${q.pct}%`); }); if (found) issues.push(I(bad.length ? 'warn' : 'info', bad.length ? `Flagged stores: the “from” rate differs from ${lab} in the full report for ${bad.join('; ')}.` : `Flagged stores: the “from” rates match ${lab} in the full report to ${prevFull.end} for all ${found} stores.`)); }
    if (!prevFull) issues.push(I('info', 'No earlier full report was found to compare with.'));
    issues.push(I('info', `This file is the executive summary: the trend (${periods.length} periods), ${callouts.length} headline figures and ${flagged.length} flagged stores are read. The full store-by-store figures are only in the HTML dashboard, so the Stores view shows the flagged stores.`));
    const all2 = all.filter((e) => e.end === (per && per.end)); all2.forEach((e) => issues.push(I('warn', e.hash === hash ? `This exact file was already uploaded (${e.end}).` : `A manual punch report to ${e.end} already exists. Approving replaces it (the old one is kept in history).`)));
    return { ds: per ? { type: 'manualpunch', start: per.start, end: per.end, data: { kind: 'deck', title: titles[0] || 'Manual punch executive summary', titles, notes: [...titles.slice(1), ...callouts.map((c) => `${c.value} — ${c.label}`), source].filter(Boolean), periods, callouts, flagged, source, stores: [], html: null, mtd: null, comparedWith: prevFull ? prevFull.end : null } } : null, issues };
  }
  LM.manualpunch = { detect, analyze, compute, analyzeDeck, isDeck };
})(typeof window !== 'undefined' ? window : globalThis);
