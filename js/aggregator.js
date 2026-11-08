/* Sales by aggregators: the "Aggregator Report" workbook (Store / Delivery source / Payment type / Bills / Gross sales after discount).
   Saved as a Sales record with type "aggregator"; shown in the Sales tab under "Sales by aggregators". */
(function () {
  const LM = window.LM; const { h, norm } = LM;
  const I = (level, msg) => ({ level, msg });
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const n0 = (v) => Math.round(v).toLocaleString('en-US'); const n2 = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pc1 = (v) => (v == null ? '–' : v.toFixed(1) + '%');
  const iso = (m, d, y) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const srcName = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  const cleanStore = (s) => String(s).replace(/\s+/g, ' ').trim();
  const num = (v) => (typeof v === 'number' ? v : v == null || v === '' ? null : Number(String(v).replace(/,/g, '')));
  const rowsOf = (wb, name) => root().XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });
  const root = () => window;

  function findSheet(wb) {
    for (const name of wb.SheetNames) { const rows = rowsOf(wb, name);
      for (let i = 0; i < Math.min(rows.length, 15); i++) { const n = (rows[i] || []).map((c) => norm(c == null ? '' : String(c)));
        if (n.some((x) => x === 'deliverysource') && n.some((x) => x === 'paymenttype') && n.some((x) => x === 'bills') && n.some((x) => /^grosssales|^netsales/.test(x))) return { name, rows, hi: i, n }; } }
    return null;
  }
  const detect = (wb) => !!findSheet(wb);

  function parse(wb, fileName, existing, hash) {
    const issues = []; const f = findSheet(wb); if (!f) return { ds: null, issues: [I('error', 'This does not look like an Aggregator Report (Store / Delivery source / Payment type / Bills / Gross sales).')] };
    const c = { store: f.n.findIndex((x) => x === 'store'), src: f.n.indexOf('deliverysource'), pay: f.n.indexOf('paymenttype'), bills: f.n.indexOf('bills'), val: f.n.findIndex((x) => /^grosssales|^netsales/.test(x)) };
    const head = f.rows[f.hi]; const cur = (/\b(SAR|AED|IQD|GBP|USD|QAR|KWD|BHD|OMR)\b/i.exec(String(head[c.val])) || [, 'SAR'])[1].toUpperCase(); const valueLabel = String(head[c.val]).replace(/[.\s]+$/, '');
    const pm = /from\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+to\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(f.rows.slice(0, f.hi).map((r) => (r || []).join(' ')).join(' '));
    const start = pm ? iso(pm[1], pm[2], pm[3]) : null, end = pm ? iso(pm[4], pm[5], pm[6]) : null; if (!pm) issues.push(I('error', 'The period (“Period: from … to …”) was not found at the top of the sheet.'));
    const rows = []; let store = null; const storeTot = {}; let grand = null;
    f.rows.slice(f.hi + 1).forEach((r) => { if (!r) return; const a = r[c.store] == null ? '' : cleanStore(r[c.store]);
      if (/^grand total$/i.test(a)) { grand = { orders: num(r[c.bills]), value: num(r[c.val]) }; return; }
      if (/ total$/i.test(a)) { storeTot[a.replace(/ total$/i, '')] = { orders: num(r[c.bills]), value: num(r[c.val]) }; return; }
      if (a) store = a; if (!store || r[c.src] == null || String(r[c.src]).trim() === '') return;
      rows.push({ store, source: srcName(r[c.src]), pay: String(r[c.pay] || '').trim() || '–', orders: num(r[c.bills]) || 0, value: num(r[c.val]) || 0 }); });
    if (!rows.length) issues.push(I('error', 'No aggregator rows were found.'));
    const T = { orders: sum(rows, (x) => x.orders), value: sum(rows, (x) => x.value) };
    if (grand && (Math.abs(grand.orders - T.orders) > 0 || Math.abs(grand.value - T.value) > 1)) issues.push(I('warn', `The rows add up to ${n0(T.orders)} orders / ${cur} ${n2(T.value)} but the Grand Total row says ${n0(grand.orders)} / ${n2(grand.value)}.`));
    if (!grand) issues.push(I('info', 'No Grand Total row was found, so the totals could not be cross-checked.'));
    Object.entries(storeTot).forEach(([s, t]) => { const r = rows.filter((x) => x.store === s); if (!r.length) return; if (Math.abs(sum(r, (x) => x.orders) - t.orders) > 0 || Math.abs(sum(r, (x) => x.value) - t.value) > 1) issues.push(I('warn', `${s}: its rows add up to ${n0(sum(r, (x) => x.orders))} orders / ${n2(sum(r, (x) => x.value))} but its Total row says ${n0(t.orders)} / ${n2(t.value)}.`)); });
    const seen = new Set(); rows.forEach((x) => { const k = x.store + '|' + x.source + '|' + x.pay; if (seen.has(k)) issues.push(I('warn', `${x.store}: ${x.source} / ${x.pay} appears twice.`)); seen.add(k); });
    rows.filter((x) => x.orders && !x.value).forEach((x) => issues.push(I('warn', `${x.store}: ${x.source} has ${x.orders} orders but no value.`)));
    if (start && end) { const d = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1; if (d !== 7) issues.push(I('info', `The period covers ${d} days (${start} → ${end}).`)); }
    const ds = { type: 'aggregator', start, end, currency: cur, valueLabel, rows, totals: T };
    (existing || []).forEach((e) => { if (e.hash === hash) issues.push(I('warn', `This exact file was already uploaded on ${e.uploadedAt.slice(0, 10)}.`)); else if (e.start === start && e.end === end) issues.push(I('warn', `An aggregator report for ${start} → ${end} already exists. Approving replaces it (the old version is kept in history).`)); });
    const prev = (existing || []).filter((e) => e.end < end).sort((a, b) => (a.end < b.end ? 1 : -1))[0];
    if (prev) { const ps = new Set(prev.rows.map((x) => x.store)), ns = new Set(rows.map((x) => x.store)); const added = [...ns].filter((s) => !ps.has(s)), gone = [...ps].filter((s) => !ns.has(s)); if (added.length) issues.push(I('info', `${added.length} store(s) not in the previous report: ${added.slice(0, 4).join('; ')}${added.length > 4 ? '…' : ''}.`)); if (gone.length) issues.push(I('warn', `${gone.length} store(s) from the previous report are missing: ${gone.slice(0, 4).join('; ')}${gone.length > 4 ? '…' : ''}.`)); const ch = prev.totals.value ? (T.value / prev.totals.value - 1) * 100 : 0; if (Math.abs(ch) > 40) issues.push(I('warn', `Total value is ${ch > 0 ? '+' : ''}${ch.toFixed(0)}% against the previous report (${prev.start} → ${prev.end}).`)); }
    return { ds, issues };
  }

  /** all the figures the view needs */
  function compute(rows) {
    const by = (key) => { const m = new Map(); rows.forEach((r) => { const k = r[key]; const o = m.get(k) || { name: k, orders: 0, value: 0 }; o.orders += r.orders; o.value += r.value; m.set(k, o); }); return [...m.values()].map((o) => ({ ...o, aov: o.orders ? o.value / o.orders : null })).sort((a, b) => b.value - a.value); };
    const T = { orders: sum(rows, (r) => r.orders), value: sum(rows, (r) => r.value) }; const srcs = by('source'); const stores = by('store'); const pays = by('pay');
    stores.forEach((s) => { s.share = T.value ? (s.value / T.value) * 100 : 0; s.src = {}; rows.filter((r) => r.store === s.name).forEach((r) => { const o = s.src[r.source] || { orders: 0, value: 0 }; o.orders += r.orders; o.value += r.value; s.src[r.source] = o; }); });
    srcs.forEach((s) => (s.share = T.value ? (s.value / T.value) * 100 : 0));
    return { T, srcs, stores, pays, aov: T.orders ? T.value / T.orders : null };
  }

  function view(ds, prev, onDelete) {
    const c = compute(ds.rows); const p = prev ? compute(prev.rows) : null; const cur = ds.currency; const later = [];
    const dl = (a, b) => (b ? ((a / b - 1) * 100) : null);
    const delta = (v) => (v == null ? '' : h('span', { class: v > 0.04 ? 'up' : v < -0.04 ? 'down' : 'flat' }, (v > 0 ? '▲ +' : v < 0 ? '▼ ' : '● ') + v.toFixed(1) + '%'));
    const kpi = (l, v, d) => h('div', { class: 'card kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
    const card = (t, ...k) => h('div', { class: 'card', style: 'margin-bottom:12px' }, t ? h('h3', {}, t) : null, ...k);
    const since = p ? `vs ${prev.start} → ${prev.end}` : '';
    const el = h('div', {},
      h('div', { class: 'sub', style: 'margin-bottom:8px' }, `Aggregator report ${ds.start} → ${ds.end} · ${ds.fileName} · ${ds.valueLabel} · uploaded ${ds.uploadedAt.slice(0, 16).replace('T', ' ')}${p ? ' · changes ' + since : ''}`),
      h('div', { class: 'grid kpis' },
        kpi('Aggregator sales', n0(c.T.value), h('span', {}, cur + ' ', p ? delta(dl(c.T.value, p.T.value)) : '')),
        kpi('Orders', n0(c.T.orders), p ? delta(dl(c.T.orders, p.T.orders)) : 'bills'),
        kpi('Avg order value', n2(c.aov || 0), p && p.aov ? delta(dl(c.aov, p.aov)) : cur + ' per order'),
        kpi('Stores', c.stores.length, p ? `${p.stores.length} before` : ''),
        ...c.srcs.slice(0, 2).map((s) => kpi(s.name, pc1(s.share), `${n0(s.value)} ${cur} · ${n0(s.orders)} orders`))));
    // by aggregator
    const pv = (name) => (p ? p.srcs.find((x) => x.name === name) : null);
    const colsA = [{ k: 'name', label: 'Aggregator', l: 1 }, { k: 'orders', label: 'Orders', fmt: n0 }, { k: 'value', label: `Value (${cur})`, fmt: n0 }, { k: 'aov', label: 'Avg order', fmt: (v) => (v == null ? '–' : n2(v)) }, { k: 'share', label: 'Share of value', fmt: pc1 }, ...(p ? [{ k: 'chg', label: 'Value vs previous', fmt: (v) => (v == null ? '–' : delta(v)) }] : [])];
    const rowsA = c.srcs.map((s) => ({ ...s, chg: pv(s.name) ? dl(s.value, pv(s.name).value) : null })); const boxA = h('div', { class: 'chart', style: 'height:240px' }); later.push(() => LM.chart(boxA, { type: 'doughnut', data: { labels: c.srcs.map((s) => s.name), datasets: [{ data: c.srcs.map((s) => s.value), backgroundColor: ['#7a4a2b', '#2c7a7b', '#c2851f', '#5b6fb5', '#a8456b', '#6b8e3d'] }] }, options: { plugins: { legend: { position: 'bottom' } } } }));
    el.append(card('By aggregator', h('div', { class: 'grid half' }, LM.table(colsA, rowsA, { sort: null }), boxA)));
    // by store
    const names = c.srcs.map((s) => s.name); const colsS = [{ k: 'name', label: 'Store', l: 1, cls: 'wrap' }, { k: 'orders', label: 'Orders', fmt: n0 }, { k: 'value', label: `Value (${cur})`, fmt: n0 }, { k: 'aov', label: 'Avg order', fmt: (v) => (v == null ? '–' : n2(v)) }, { k: 'share', label: 'Share of all', fmt: pc1 },
      ...names.flatMap((n) => [{ k: 'v_' + n, label: `${n} value`, fmt: n0 }, { k: 'o_' + n, label: `${n} orders`, fmt: n0 }]), { k: 'topShare', label: 'Top aggregator', l: 1 }];
    const rowsS = c.stores.map((s) => { const o = { ...s }; names.forEach((n) => { o['v_' + n] = (s.src[n] || { value: 0 }).value; o['o_' + n] = (s.src[n] || { orders: 0 }).orders; }); const top = names.slice().sort((a, b) => o['v_' + b] - o['v_' + a])[0]; o.topShare = top && s.value ? `${top} ${((o['v_' + top] / s.value) * 100).toFixed(0)}%` : '–'; return o; });
    const boxS = h('div', { class: 'chart', style: `height:${Math.max(260, c.stores.length * 28 + 60)}px` }); const PAL = ['#7a4a2b', '#2c7a7b', '#c2851f', '#5b6fb5', '#a8456b', '#6b8e3d'];
    later.push(() => LM.chart(boxS, { type: 'bar', data: { labels: c.stores.map((s) => s.name.replace(/^B\d+\s*/, '').slice(0, 32)), datasets: names.map((n, i) => ({ label: n, data: c.stores.map((s) => (s.src[n] || { value: 0 }).value), backgroundColor: PAL[i % PAL.length] })) }, options: { indexAxis: 'y', plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true } } } }));
    el.append(card('By store', h('div', { class: 'tscroll' }, LM.table(colsS, rowsS, { sort: 'value' })), h('button', { class: 'btn small', style: 'margin-top:8px', onclick: () => LM.csv(colsS, rowsS, `sales-by-aggregators-${ds.end}.csv`) }, 'Export CSV')), card(`Value by store and aggregator (${cur})`, boxS));
    // payment types, only when there is more than one
    if (c.pays.length > 1) el.append(card('By payment type', LM.table([{ k: 'name', label: 'Payment type', l: 1 }, { k: 'orders', label: 'Orders', fmt: n0 }, { k: 'value', label: `Value (${cur})`, fmt: n0 }, { k: 'aov', label: 'Avg order', fmt: (v) => (v == null ? '–' : n2(v)) }], c.pays, { sort: null })));
    if (onDelete) el.append(h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn small danger', onclick: onDelete }, 'Delete this aggregator report')));
    setTimeout(() => later.forEach((f) => f()));
    return el;
  }
  LM.aggregator = { detect, parse, compute, view };
})();
