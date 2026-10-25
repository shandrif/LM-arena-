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
  LM.manualpunch = { detect, analyze, compute };
})(typeof window !== 'undefined' ? window : globalThis);
