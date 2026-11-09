/* Mug sales by day: the “Sales By Product” export for the mugs (Accounting day / Item group / Item code / Item / Sold with item / Net sales / Number of items).
   Network totals per day (no store). Used in Sales > Mugs: sales per mug per day, the trend of the last days and the days of cover of the stock in stores. */
(function () {
  const LM = window.LM; const { h, norm } = LM;
  const I = (level, msg) => ({ level, msg });
  const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x || 0), 0); const n0 = (v) => Math.round(v).toLocaleString('en-US'); const n1 = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 });
  const rowsOf = (wb, name) => window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });
  const iso = (v) => { if (typeof v === 'number' && v > 30000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10); if (typeof v === 'string') { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v.trim()); if (m) return `${m[3]}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`; } return null; };
  const find = (wb) => { for (const name of wb.SheetNames) { const g = rowsOf(wb, name); for (let i = 0; i < Math.min(12, g.length); i++) { const n = (g[i] || []).map((c) => norm(c == null ? '' : String(c))); if (n.includes('accountingday') && n.includes('itemgroup') && n.includes('soldwithitem') && n.some((x) => /^numberof.*items?$/.test(x))) return { g, hi: i, n, name }; } } return null; };
  const detect = (wb) => !!find(wb);
  const clean = (s) => String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const kind = (item) => (/printer|printed/i.test(item) ? 'print' : /repeated/i.test(item) ? 'free' : /refill|non\s*hm/i.test(item) ? 'refill' : /mug/i.test(item) ? 'mug' : 'other');

  function parse(wb, fileName, existing, hash) {
    const issues = []; const f = find(wb); if (!f) return { ds: null, issues: [I('error', 'This does not look like the mug “Sales By Product” report.')] };
    const c = { day: f.n.indexOf('accountingday'), grp: f.n.indexOf('itemgroup'), item: f.n.indexOf('item'), withI: f.n.indexOf('solditem') >= 0 ? f.n.indexOf('solditem') : f.n.indexOf('soldwithitem'), sales: f.n.findIndex((x) => /^netsales/.test(x)), qty: f.n.findIndex((x) => /^numberof.*items?$/.test(x)) };
    const pm = /from\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+to\s+(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(f.g.slice(0, f.hi).map((r) => (r || []).join(' ')).join(' ')); const start = pm ? iso(pm[1]) : null, end = pm ? iso(pm[2]) : null; if (!pm) issues.push(I('error', 'The period (“Period: from … to …”) was not found.'));
    const rows = []; let day = null, item = null; const dayTot = {}; let grand = null;
    f.g.slice(f.hi + 1).forEach((r) => { if (!r) return; const a = r[c.day]; if (a != null) { const d = iso(a); if (d) day = d; else if (/grand total/i.test(String(a))) { grand = { qty: r[c.qty], sales: r[c.sales] }; return; } else { const m = /^(\d{1,2}\/\d{1,2}\/\d{4}) total/i.exec(String(a)); if (m) dayTot[iso(m[1])] = { qty: r[c.qty], sales: r[c.sales] }; return; } }
      if (r[c.grp] != null && /total/i.test(String(r[c.grp]))) return; if (r[c.item] != null) { item = clean(r[c.item]); } if (r[c.sales] == null && r[c.qty] == null) return; if (item && / total$/i.test(item)) return; if (!day || !item) return;
      rows.push({ day, item, grp: clean(r[c.grp]) || null, with: c.withI >= 0 && r[c.withI] != null ? clean(r[c.withI]) : '', sales: +r[c.sales] || 0, qty: +r[c.qty] || 0 }); });
    if (!rows.length) issues.push(I('error', 'No sales rows were found.'));
    const T = { qty: sum(rows, (x) => x.qty), sales: sum(rows, (x) => x.sales) };
    if (grand && (Math.abs(T.qty - grand.qty) > 0 || Math.abs(T.sales - grand.sales) > 1)) issues.push(I('warn', `The rows add up to ${n0(T.qty)} pieces / SAR ${n0(T.sales)} but the Grand Total says ${n0(grand.qty)} / ${n0(grand.sales)}.`));
    Object.entries(dayTot).forEach(([d, t]) => { const r = rows.filter((x) => x.day === d); if (r.length && (Math.abs(sum(r, (x) => x.qty) - t.qty) > 0 || Math.abs(sum(r, (x) => x.sales) - t.sales) > 1)) issues.push(I('warn', `${d}: the rows add up to ${n0(sum(r, (x) => x.qty))} pieces but the day total says ${n0(t.qty)}.`)); });
    const days = [...new Set(rows.map((x) => x.day))].sort(); if (start && end) { const want = Math.round((Date.parse(end) - Date.parse(start)) / 864e5) + 1; if (days.length < want) issues.push(I('warn', `${want} days are expected (${start} → ${end}) but only ${days.length} have sales.`)); }
    const pr = rows.filter((x) => kind(x.item) === 'print'); if (pr.length) issues.push(I('info', `“Printed mug” add-on lines (${n0(sum(pr, (x) => x.qty))} prints, SAR ${n0(sum(pr, (x) => x.sales))}) are not counted as mugs.`));
    const fr = rows.filter((x) => kind(x.item) === 'free' || kind(x.item) === 'refill'); if (fr.length) issues.push(I('info', `Free “Repeated” mugs and “Non HM … Refill” drinks (${n0(sum(fr, (x) => x.qty))} pieces) are shown separately and not counted as mugs sold.`));
    (existing || []).forEach((e) => { if (e.hash === hash) issues.push(I('warn', `This exact file was already uploaded on ${e.uploadedAt.slice(0, 10)}.`)); else if (e.start === start && e.end === end) issues.push(I('warn', `A mug sales-by-day report for ${start} → ${end} already exists. Approving replaces it (the old version is kept in history).`)); });
    return { ds: { type: 'mugdaily', start, end, rows, totals: T }, issues };
  }

  /** per canonical mug: pieces per day */
  function compute(rec) {
    const days = [...new Set(rec.rows.map((x) => x.day))].sort(); const M = new Map(); const extra = { print: { qty: 0, sales: 0 }, free: { qty: 0 }, refill: { qty: 0 } };
    rec.rows.forEach((x) => { const k = kind(x.item); if (k === 'print' || k === 'free' || k === 'refill') { extra[k].qty += x.qty; extra[k].sales = (extra[k].sales || 0) + x.sales; return; } if (k !== 'mug' || x.with) return;
      const m = LM.mugstock.mugOf(x.item); const name = m && !m.unknown ? m.name : x.item.split(/[\\/]|[؀-ۿ]/)[0].trim(); const o = M.get(name) || { name, day: {}, qty: 0, sales: 0 }; o.day[x.day] = (o.day[x.day] || 0) + x.qty; o.qty += x.qty; o.sales += x.sales; M.set(name, o); });
    const list = [...M.values()].map((o) => { const last3 = days.slice(-3); const a3 = sum(last3, (d) => o.day[d] || 0) / Math.max(1, last3.length); const aw = o.qty / Math.max(1, days.length); return { ...o, a3, aw, trend: aw ? (a3 / aw - 1) * 100 : null }; }).sort((a, b) => b.qty - a.qty);
    return { days, list, extra, total: sum(list, (x) => x.qty), totalSales: sum(list, (x) => x.sales) };
  }

  function card(rec, V, onDelete) {
    const c = compute(rec); const stock = new Map(); if (V) V.mugs.forEach((m) => stock.set(m.name, V.stores.reduce((t, s) => t + (s.mug[m.name] || 0), 0)));
    const dl = (d) => `${+d.slice(8, 10)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+d.slice(5, 7) - 1]}`;
    const cover = (st, a) => (st != null && a > 0 ? st / a : null); const pill = (v) => (v == null ? '–' : h('span', { class: 'pill ' + (v < 7 ? 'closed' : v < 14 ? '' : 'new'), style: v >= 7 && v < 14 ? 'background:var(--warn-bg);color:var(--warn)' : '' }, n1(v) + ' d'));
    const dayTot = c.days.map((d) => sum(c.list, (x) => x.day[d] || 0));
    const head = h('thead', {}, h('tr', {}, h('th', { class: 'l' }, 'Mug'), ...c.days.map((d) => h('th', {}, dl(d))), h('th', {}, 'Week'), h('th', { title: 'average per day over the last 3 days' }, 'Last 3 days / day'), h('th', { title: 'last 3 days average vs the week average' }, 'Trend'), ...(V ? [h('th', {}, 'Stock in stores'), h('th', { title: 'stock in stores ÷ last-3-day average' }, 'Cover (last 3 days)'), h('th', { title: 'stock in stores ÷ week average' }, 'Cover (week avg)')] : [])));
    const body = h('tbody', {}, ...c.list.map((x) => { const st = stock.has(x.name) ? stock.get(x.name) : null; return h('tr', {}, h('td', { class: 'l' }, x.name), ...c.days.map((d) => h('td', {}, x.day[d] ? n0(x.day[d]) : h('span', { class: 'sub' }, '0'))), h('td', {}, h('b', {}, n0(x.qty))), h('td', {}, n0(x.a3)), h('td', {}, x.trend == null ? '–' : h('span', { class: x.trend > 15 ? 'up' : x.trend < -15 ? 'down' : 'flat' }, (x.trend > 0 ? '+' : '') + x.trend.toFixed(0) + '%')), ...(V ? [h('td', {}, st == null ? '–' : n0(st)), h('td', {}, pill(cover(st, x.a3))), h('td', {}, pill(cover(st, x.aw)))] : [])); }), h('tr', { style: 'font-weight:700;border-top:2px solid var(--line)' }, h('td', { class: 'l' }, 'All mugs'), ...dayTot.map((v) => h('td', {}, n0(v))), h('td', {}, n0(c.total)), h('td', {}, n0(sum(c.list, (x) => x.a3))), h('td', {}), ...(V ? [h('td', {}, n0([...stock.values()].reduce((a, b) => a + b, 0))), h('td', {}), h('td', {})] : [])));
    const box = h('div', { class: 'chart', style: 'height:300px' }); const top = c.list.slice(0, 6);
    setTimeout(() => LM.chart(box, { type: 'line', data: { labels: c.days.map(dl), datasets: top.map((x, i) => ({ label: x.name, data: c.days.map((d) => x.day[d] || 0), borderColor: ['#7a4a2b', '#2c7a7b', '#c2851f', '#5b6fb5', '#a8456b', '#6b8e3d'][i], backgroundColor: ['#7a4a2b', '#2c7a7b', '#c2851f', '#5b6fb5', '#a8456b', '#6b8e3d'][i], tension: 0 })) }, options: { plugins: { legend: { position: 'bottom' } } } }));
    const spikes = c.list.filter((x) => x.trend != null && x.trend < -40 && x.qty > 1000);
    return h('div', { class: 'card', style: 'margin-bottom:12px' }, h('div', { class: 'tools' }, h('h3', { style: 'margin:0' }, 'Mugs sold by day (all branches)'), h('div', { class: 'spacer' }), onDelete ? h('button', { class: 'btn small danger', onclick: onDelete }, 'Delete this report') : null),
      h('div', { class: 'sub', style: 'margin:6px 0' }, `${rec.fileName} · ${rec.start} → ${rec.end} · ${n0(c.total)} mugs, SAR ${n0(c.totalSales)}${c.extra.free.qty || c.extra.refill.qty ? ` · not counted: ${n0(c.extra.free.qty)} free “Repeated” mugs, ${n0(c.extra.refill.qty)} refill drinks` : ''}${c.extra.print.qty ? ` · printed-mug add-on: ${n0(c.extra.print.qty)} prints (SAR ${n0(c.extra.print.sales)})` : ''}`),
      spikes.length ? h('div', { class: 'banner', style: 'background:var(--warn-bg);color:var(--warn);margin:6px 0' }, `Sales were much higher at the start of the week than now: ${spikes.map((x) => `${x.name} (${n0(x.day[c.days[0]] || 0)} on ${dl(c.days[0])} → ${n0(x.day[c.days[c.days.length - 1]] || 0)} on ${dl(c.days[c.days.length - 1])})`).join('; ')}. The week average overstates their current rate, so “Cover (last 3 days)” is the better guide.`) : null,
      box, h('div', { class: 'tscroll', style: 'overflow:auto;margin-top:10px' }, h('table', { class: 't' }, head, body)),
      V ? h('div', { class: 'sub', style: 'margin-top:6px' }, 'Cover = stock in the stores (SOH tracker) ÷ pieces sold per day. Under 7 days red, under 14 amber. Warehouse stock is not included.') : h('div', { class: 'sub', style: 'margin-top:6px' }, 'Upload the SOH tracker to see the stock in stores and the days of cover.'));
  }
  LM.mugdaily = { detect, parse, compute, card };
})();
