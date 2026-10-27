/* Warehouse tab: scorecard, stock & cost, dead stock, mugs, capacity & flow, shipments/OTIF, B2B, inventory/ABC. */
(function () {
  const LM = window.LM; const { h, num, num2, compact, dayLabel } = LM; const WM = LM.warehouse; LM.depts = LM.depts || {};
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const kpi = (l, v, d) => h('div', { class: 'card kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
  const p1 = (v) => (v == null || !isFinite(v) ? '–' : (v * 100).toFixed(1) + '%');
  const p0 = (v) => (v == null || !isFinite(v) ? '–' : Math.round(v * 100) + '%');
  const M = (v) => (v == null ? '–' : compact(v));
  const rag = (s) => h('span', { class: 'pill ' + (/red/i.test(s) ? 'closed' : /green/i.test(s) ? 'new' : '') , style: /yellow/i.test(s) ? 'background:var(--warn-bg);color:var(--warn)' : '' }, s || '–');
  const tone = (v, good, bad, hi = true) => (v == null ? '' : hi ? (v >= good ? 'up' : v < bad ? 'down' : '') : (v <= good ? 'up' : v > bad ? 'down' : ''));
  const card = (title, ...kids) => h('div', { class: 'card', style: 'margin-bottom:12px' }, title ? h('h3', {}, title) : null, ...kids);
  const chartCard = (title, id, ht) => h('div', { class: 'card' }, h('h3', {}, title), h('div', { class: 'chart', id, style: ht ? `height:${ht}px` : '' }));
  const bar = (host, labels, data, o = {}) => LM.chart(host, { type: 'bar', data: { labels, datasets: (o.sets || [{ data, backgroundColor: LM.css('--accent') }]) }, options: { indexAxis: o.h ? 'y' : 'x', plugins: { legend: { display: !!o.sets && o.sets.length > 1, position: 'bottom' } }, scales: { [o.h ? 'x' : 'y']: { stacked: !!o.stack, ticks: { callback: (v) => (o.fmt ? o.fmt(v) : compact(v)) } }, [o.h ? 'y' : 'x']: { stacked: !!o.stack } } } });
  const PAL = ['#7a4a2b', '#2c7a7b', '#c2851f', '#5b6fb5', '#a8456b', '#6b8e3d', '#8a8a8a'];
  const mname = (y, m) => MON[m - 1] + (y ? " '" + String(y).slice(2) : '');

  LM.depts.warehouse = {
    id: 'warehouse', label: 'Warehouse',
    async mount(panel) {
      let sets = [], cur = null, sub = 'Scorecard', mugSec = 'All', mugQ = '', invQ = '';
      const reload = async () => { sets = (await LM.db.all('datasets')).filter((d) => d.dept === 'warehouse').sort((a, b) => (a.end < b.end ? 1 : -1)); if (!sets.find((s) => s.id === cur)) cur = sets[0] ? sets[0].id : null; draw(); };

      async function upload(file) {
        let rf; try { rf = await LM.readFile(file); } catch (e) { return LM.say(e.message); }
        const tpl = { dept: 'warehouse', ...((await LM.db.get('templates', 'warehouse')) || {}) }; const ov = {}; const run = () => WM.analyze(rf.wb, rf.name, ov, tpl, sets, rf.hash); let res = run();
        const info = () => { const d = res.ds && res.ds.data; return {
          title: `Review before processing: ${rf.name}`, issues: res.issues,
          facts: d ? [['Report date', res.ds.end || '–'], ['Sections recognised', Object.keys(d).filter((k) => WM.PARTS.includes(k)).length + ' of ' + WM.PARTS.length], ['Inventory lines', d.inventory ? d.inventory.items.length : 0], ['Mug lines', d.mugs ? d.mugs.items.length : 0]] : [['Report', 'Not recognised']],
          approveLabel: res.ds && sets.some((s) => s.end === res.ds.end) ? 'Approve & replace existing' : 'Approve & process',
          onFix: (fix, val) => { if (fix.type === 'asOf') ov.asOf = { date: val }; res = run(); dlg.update(info()); },
          onApprove: async () => { if (!res.ds || res.issues.some((i) => i.level === 'error')) throw new Error('Fix the errors first.'); const d = res.ds; const old = sets.find((s) => s.end === d.end);
            if (old) { await LM.db.put('history', { ...old, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', old.id); }
            const rec = { id: LM.uid(), dept: 'warehouse', type: 'warehouse', start: d.start, end: d.end, fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), data: d.data };
            await LM.db.put('datasets', rec); cur = rec.id; LM.toast(`Warehouse report ${d.end} processed`); await reload(); } }; };
        const dlg = LM.review(info());
      }

      const body = h('div');
      function draw() {
        LM.killCharts();
        const sel = sets.length > 1 ? h('select', { class: 'sel', onchange: (e) => { cur = e.target.value; draw(); } }, sets.map((s) => h('option', { value: s.id, selected: s.id === cur }, 'Report ' + s.end))) : null;
        panel.replaceChildren(h('div', { class: 'head' }, h('h2', {}, 'Warehouse'), sel, h('div', { class: 'spacer' }), LM.filePicker(upload, 'Upload Warehouse report')), body);
        LM.dropZone(panel, upload);
        const ds = sets.find((s) => s.id === cur);
        if (!ds) return body.replaceChildren(h('div', { class: 'empty' }, h('h3', {}, 'No warehouse report uploaded yet'), h('p', { class: 'sub' }, 'Drop the Weekly Warehouse Report workbook (.xlsx). Every sheet (KPIs, stock value, dead stock, mugs, capacity, shipments, B2B, inventory …) is recognised automatically.')));
        const tabs = ['Scorecard', 'Stock & cost', 'Dead stock', 'Mugs', 'Capacity & flow', 'Shipments', 'B2B', 'Inventory', 'Uploads'];
        body.replaceChildren(h('div', { class: 'sub', style: 'margin-bottom:8px' }, `Report ${ds.end} · ${ds.fileName} · uploaded ${ds.uploadedAt.slice(0, 16).replace('T', ' ')}`), h('div', { class: 'subtabs' }, tabs.map((t) => h('button', { class: t === sub ? 'on' : '', onclick: () => { sub = t; draw(); } }, t))),
          { Overview: overview, Scorecard: scorecard, 'Stock & cost': stockCost, 'Dead stock': dead, Mugs: mugs, 'Capacity & flow': capFlow, Shipments: shipments, B2B: b2b, Inventory: inventory, Uploads: uploads }[sub](ds));
      }
      const missing = (what) => h('div', { class: 'banner' }, `${what} is not in this report.`);
      const lastOf = (a) => (a && a.length ? a[a.length - 1] : null);

      /* ---------- Overview ---------- */
      function overview(ds) {
        const d = ds.data; const g = h('div', { class: 'grid kpis' }); const notes = [];
        if (d.scorecard) { const s = d.scorecard; g.append(kpi('Scorecard', p1(s.overall), `${s.counts.green} green · ${s.counts.yellow} yellow · ${s.counts.red} red KPIs`)); const reds = s.kpis.filter((k) => /red/i.test(k.status)); if (reds.length) notes.push(['error', `Red KPIs: ${reds.map((k) => `${k.kpi} (${p0(k.pct)} of target)`).join('; ')}`]); }
        const sm = d.summary && d.summary.monthly.filter((x) => x.stock != null); const ls = lastOf(sm), ps = sm && sm[sm.length - 2];
        if (ls) g.append(kpi('Closing stock value', M(ls.stock), `${mname(ls.y, ls.m)}${ps ? ' · ' + (ls.stock - ps.stock > 0 ? '+' : '') + M(ls.stock - ps.stock) + ' vs prev month' : ''} · ${p0(ls.sr)} of monthly sales`));
        if (d.summary && d.summary.breakdown.dead != null) { const b = d.summary.breakdown; g.append(kpi('Dead stock', M(b.dead), `${p1(b.dead / b.total)} of stock · ${b.lines} lines`), kpi('Recoverable', M(b.recoverable), `${p0(b.recoverable / b.dead)} of dead stock · write-off ${M(b.writeoff)}`)); notes.push(['warn', `Dead stock is ${p1(b.dead / b.total)} of stock value; only ${M(b.recoverable)} is recoverable, ${M(b.writeoff)} is to be written off.`]); }
        const lc = d.logistics && lastOf(d.logistics.cost.filter((x) => x.log != null)); if (lc) g.append(kpi('Logistics cost vs sales', p1(lc.log / lc.sales), `${MON[lc.m - 1]} · SAR ${M(lc.log)} · target 1.0%`));
        if (d.capacity && d.capacity.total) g.append(kpi('Warehouse utilization', p1(d.capacity.total.u), `${num(d.capacity.total.act)} of ${num(d.capacity.total.cap)} pallets`));
        const lw = lastOf(d.weeklyShip); if (lw) g.append(kpi('OTIF (latest week)', p1(lw.t.otif), `${lw.label.trim()} · ${num(lw.t.orders)} orders · ${lw.t.emergency} emergency`));
        if (d.mugs) { const t = d.mugs.totals.reduce((s, x) => s + (x.total || 0), 0); g.append(kpi('Mugs in stock', num(t), `${d.mugs.date || ''} · ${d.mugs.items.filter((i) => i.total === 0).length} mug types at zero`)); }
        if (d.flow) { const p = d.flow.perf[0]; if (p) g.append(kpi('Picking productivity', num2(p.actual), `cartons/hour · target ${p.target}`)); }
        const el = h('div', {}, g, notes.length ? card('What needs attention', notes.map(([l, t]) => h('div', { class: 'issue ' + l }, h('div', { class: 'tag' }, l === 'error' ? 'Red' : 'Watch'), h('div', {}, t)))) : null,
          d.summary ? h('div', { class: 'grid half' }, chartCard('Closing stock value and stock ÷ sales', 'c1'), chartCard('Logistics cost % of sales', 'c2')) : null);
        setTimeout(() => { if (d.summary) { stockChart(el.querySelector('#c1'), d); costChart(el.querySelector('#c2'), d); } }); return el;
      }
      function stockChart(host, d) {
        const s = d.summary.monthly.filter((x) => x.stock != null); LM.chart(host, { data: { labels: s.map((x) => MON[x.m - 1]), datasets: [{ type: 'bar', label: 'Closing stock (SAR)', data: s.map((x) => x.stock), backgroundColor: LM.css('--accent'), yAxisID: 'y' }, { type: 'line', label: 'Stock ÷ sales', data: s.map((x) => (x.sales ? x.stock / x.sales : null)), borderColor: '#2c7a7b', backgroundColor: '#2c7a7b', tension: 0, yAxisID: 'y1' }] }, options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: (v) => compact(v) } }, y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: (v) => Math.round(v * 100) + '%' } } } } });
      }
      function costChart(host, d) {
        const c = (d.logistics ? d.logistics.cost : d.summary.monthly.map((x) => ({ m: x.m, log: x.log, sales: x.sales }))).filter((x) => x.log != null); const a = d.logistics ? d.logistics.allCost.filter((x) => x.tot != null) : [];
        LM.chart(host, { type: 'line', data: { labels: c.map((x) => MON[x.m - 1]), datasets: [{ label: 'Logistics cost ÷ sales', data: c.map((x) => (x.sales ? x.log / x.sales : null)), borderColor: LM.css('--accent'), backgroundColor: LM.css('--accent'), tension: 0 }, { label: 'Incl. shipping', data: c.map((x) => { const y = a.find((z) => z.m === x.m); return y && y.sales ? y.tot / y.sales : null; }), borderColor: '#c2851f', backgroundColor: '#c2851f', tension: 0 }, { label: 'Target 1%', data: c.map(() => 0.01), borderColor: LM.css('--ly'), borderDash: [5, 4], pointRadius: 0 }] }, options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: (v) => (v * 100).toFixed(1) + '%' } } } } });
      }

      /* ---------- Scorecard ---------- */
      function scorecard(ds) {
        const s = ds.data.scorecard; if (!s) return missing('The scorecard (KPIs sheet)');
        const months = [...new Set(s.kpis.flatMap((k) => k.months.map((m) => m.m)))].sort((a, b) => a - b);
        const fmt = (k, v) => (v == null ? '–' : k.target != null && k.target <= 1.0001 && v <= 1.5 ? (v * 100).toFixed(1) + '%' : +v.toFixed(2));
        const rows = s.kpis.map((k) => ({ ...k, pctShow: k.pct != null ? k.pct : k.calc }));
        const head = ['Category', 'KPI', 'Target', 'Weight', ...months.map((m) => MON[m - 1]), 'Average', '% of target', 'Status'];
        const el = h('div', {}, h('div', { class: 'grid kpis' }, kpi('Overall achievement', p1(s.overall), 'weighted average vs target'), kpi('Green', s.counts.green, 'KPIs at or above target'), kpi('Yellow', s.counts.yellow, 'KPIs within 10% of target'), kpi('Red', s.counts.red, 'KPIs more than 10% below target')),
          h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Achievement vs target by KPI'), h('div', { class: 'chart', id: 'c1', style: 'height:300px' })),
          h('div', { class: 'tscroll' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, head.map((x, i) => h('th', { class: i < 2 ? 'l' : '' }, x)))), h('tbody', {}, rows.map((k) => h('tr', {}, h('td', { class: 'l' }, k.cat), h('td', { class: 'l wrap' }, k.kpi, h('div', { class: 'sub' }, `${k.dir === 'lower' ? 'lower' : 'higher'} is better`)), h('td', {}, fmt(k, k.target)), h('td', {}, p0(k.w)), months.map((m) => { const x = k.months.find((q) => q.m === m); return h('td', {}, x ? fmt(k, x.v) : '–'); }), h('td', {}, fmt(k, k.avg)), h('td', { class: tone(k.pctShow, 1, 0.9) }, p1(k.pctShow)), h('td', { class: 'l' }, rag(k.status))))))),
          h('div', { class: 'sub', style: 'margin-top:8px' }, 'Status rule used: 100% of target or more = green, 90–99% = yellow, below 90% = red. Notes from the sheet:'), h('ul', { class: 'findings' }, rows.filter((k) => k.notes).map((k) => h('li', {}, h('b', {}, k.kpi + ': '), k.notes))));
        setTimeout(() => LM.chart(el.querySelector('#c1'), { type: 'bar', data: { labels: rows.map((k) => k.kpi.slice(0, 34)), datasets: [{ data: rows.map((k) => (k.pctShow == null ? null : k.pctShow * 100)), backgroundColor: rows.map((k) => (k.pctShow >= 0.9995 ? '#1d7a46' : k.pctShow >= 0.9 ? '#c2851f' : '#b3261e')) }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { min: 0, ticks: { callback: (v) => v + '%' } } } } })); return el;
      }

      /* ---------- Stock & cost ---------- */
      function stockCost(ds) {
        const d = ds.data; if (!d.summary && !d.logistics) return missing('Stock value and logistics cost');
        const L = d.logistics || {}; const mrows = (d.summary ? d.summary.monthly : []).map((x) => ({ month: mname(x.y, x.m), stock: x.stock, sales: x.sales, sr: x.sr, log: x.log, lr: x.lr }));
        const hist25 = (d.history || []).filter((x) => x.kind === 'stock' && x.y === 2025); const hist26 = (d.history || []).filter((x) => x.kind === 'stock' && x.y === 2026);
        const el = h('div', {}, h('div', { class: 'grid half', style: 'margin-bottom:12px' }, chartCard('Closing stock value and stock ÷ sales', 'c1'), chartCard('Logistics cost % of sales (target 1%)', 'c2')),
          hist25.length ? h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Closing stock value: 2026 vs 2025'), h('div', { class: 'chart', id: 'c3' })) : null,
          L.budget && L.budget.length ? h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Logistics budget vs actual (SAR)'), h('div', { class: 'chart', id: 'c4' }), L.budgetTotal ? h('div', { class: 'sub' }, `Year to date: actual ${num(L.budgetTotal.act)} vs new budget ${num(L.budgetTotal.nw)} (${p1(L.budgetTotal.util)} used).`) : null) : null,
          mrows.length ? card('Monthly stock, sales and logistics cost', LM.table([{ k: 'month', label: 'Month', l: 1 }, { k: 'stock', label: 'Closing stock', fmt: num }, { k: 'sales', label: 'Sales', fmt: num }, { k: 'sr', label: 'Stock ÷ sales', fmt: p1 }, { k: 'log', label: 'Logistics cost', fmt: num }, { k: 'lr', label: 'Logistics ÷ sales', fmt: p1 }], mrows, { sort: null })) : null,
          L.allCost && L.allCost.length ? card('Total logistics cost including shipping', LM.table([{ k: 'month', label: 'Month', l: 1 }, { k: 'log', label: 'Logistics', fmt: num }, { k: 'ship', label: 'Shipping', fmt: num }, { k: 'tot', label: 'Total', fmt: num }, { k: 'pct', label: '% of sales', fmt: p1 }], L.allCost.filter((x) => x.tot != null).map((x) => ({ ...x, month: MON[x.m - 1] })), { sort: null })) : null,
          L.branches && L.branches.length ? card('Cost per branch', LM.table([{ k: 'month', label: 'Month', l: 1 }, { k: 'br', label: 'Branches served', fmt: num }, { k: 'inv', label: 'Invoice (SAR)', fmt: num }, { k: 'pct', label: '% of sales', fmt: p1 }, { k: 'cm', label: 'Per branch / month', fmt: num }, { k: 'cd', label: 'Per branch / day', fmt: num }], L.branches.filter((x) => x.y === 2026 && x.br != null).map((x) => ({ ...x, month: mname(x.y, x.m) })), { sort: null })) : null,
          L.turnover && L.turnover.length ? card('Raw-material turnover', LM.table([{ k: 'month', label: 'Month', l: 1 }, { k: 'beg', label: 'Beginning stock', fmt: num }, { k: 'pur', label: 'Purchases', fmt: num }, { k: 'cogs', label: 'COGS', fmt: num }, { k: 'clo', label: 'Closing stock', fmt: num }, { k: 't', label: 'Turnover', fmt: (v) => (v == null ? '–' : v.toFixed(3)) }], L.turnover.map((x) => ({ ...x, month: MON[x.m - 1] })), { sort: null }), L.turnoverTotal ? h('div', { class: 'sub' }, `6 months: purchases ${num(L.turnoverTotal.pur)}, COGS ${num(L.turnoverTotal.cogs)}, turnover ${L.turnoverTotal.t.toFixed(2)}.`) : null) : null);
        setTimeout(() => { if (d.summary) { stockChart(el.querySelector('#c1'), d); costChart(el.querySelector('#c2'), d); }
          const c3 = el.querySelector('#c3'); if (c3) LM.chart(c3, { type: 'line', data: { labels: MON, datasets: [{ label: '2025', data: MON.map((_, i) => { const x = hist25.find((q) => q.m === i + 1); return x ? x.v : null; }), borderColor: LM.css('--ly'), tension: 0 }, { label: '2026', data: MON.map((_, i) => { const x = hist26.find((q) => q.m === i + 1); return x ? x.v : null; }), borderColor: LM.css('--accent'), tension: 0 }] }, options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: (v) => compact(v) } } } } });
          const c4 = el.querySelector('#c4'); if (c4) LM.chart(c4, { type: 'bar', data: { labels: L.budget.map((x) => MON[x.m - 1]), datasets: [{ label: 'New budget', data: L.budget.map((x) => x.nw), backgroundColor: LM.css('--ly') }, { label: 'Actual', data: L.budget.map((x) => x.act), backgroundColor: LM.css('--accent') }] }, options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: (v) => compact(v) } } } } }); }); return el;
      }

      /* ---------- Dead stock ---------- */
      function dead(ds) {
        const d = ds.data; const b = d.summary && d.summary.breakdown; const ex = d.dead && d.dead.exec; if (!b && !ex) return missing('Dead stock');
        const dead = b ? b.dead : ex.totaldeadstock.value, rec = b ? b.recoverable : null, wo = b ? b.writeoff : null, total = b ? b.total : null;
        const exp = (d.summary ? d.summary.expired : []).map((x) => ({ ...x, daysNow: x.expiry ? Math.round((Date.parse(x.expiry) - Date.parse(ds.end)) / 86400000) : null }));
        const el = h('div', {}, h('div', { class: 'grid kpis' }, kpi('Total dead stock', M(dead), `SAR ${num(dead)}${b ? ' · ' + b.lines + ' lines' : ''}`), kpi('Recoverable / consumable', M(rec), rec != null && dead ? `${p0(rec / dead)} of dead stock` : ''), kpi('Write-off (disposal)', M(wo), wo != null && dead ? `${p0(wo / dead)} of dead stock` : ''), kpi('Healthy stock', M(b && b.healthy), total ? `${p1(b.healthy / total)} of ${M(total)} total` : ''), kpi('Dead stock share', total ? p1(dead / total) : '–', 'of total stock value'),
          ex && ex.valueatrisk ? kpi('Value at risk (expiry)', M(ex.valueatrisk.value), ex.valueatrisk.sub) : null),
          h('div', { class: 'grid half', style: 'margin-bottom:12px' }, chartCard('Recoverable vs write-off (SAR)', 'c1'), chartCard('Dead stock by expiry bucket (SAR)', 'c2')),
          exp.length ? card('Expired items', LM.table([{ k: 'name', label: 'Item', l: 1, cls: 'wrap' }, { k: 'qty', label: 'Quantity', fmt: num }, { k: 'expiry', label: 'Expiry date', l: 1 }, { k: 'daysNow', label: `Days from ${ds.end}`, fmt: (v) => (v == null ? '–' : h('span', { class: v < 0 ? 'down' : '' }, v)) }, { k: 'shelf', label: 'Days (as in file)', fmt: (v) => (v == null ? '–' : v) }, { k: 'supplier', label: 'Supplier', l: 1 }, { k: 'value', label: 'Value at risk (SAR)', fmt: num }], exp, { sort: 'value' }), d.summary.expiredSubtotal ? h('div', { class: 'sub' }, `Subtotal: ${num(d.summary.expiredSubtotal.qty)} units, SAR ${num(d.summary.expiredSubtotal.value)}.`) : null) : null,
          h('div', { class: 'banner' }, 'This workbook gives dead-stock totals by category and expiry bucket. The 59 individual dead-stock lines are not listed in the file (only the 4 expired items above), so a per-item recoverable list is not available. Add the line list to the workbook if you want it shown here.'));
        setTimeout(() => { const sp = d.dead && d.dead.split.length ? d.dead.split : [{ name: 'Recoverable or Consumable', value: rec }, { name: 'Write-off', value: wo }]; LM.chart(el.querySelector('#c1'), { type: 'doughnut', data: { labels: sp.map((x) => x.name), datasets: [{ data: sp.map((x) => x.value), backgroundColor: ['#2c7a7b', '#b3261e'] }] }, options: { plugins: { legend: { position: 'bottom' } } } });
          const bk = d.dead ? d.dead.buckets : []; if (bk.length) bar(el.querySelector('#c2'), bk.map((x) => x.name), bk.map((x) => x.value), { h: true }); }); return el;
      }

      /* ---------- Mugs ---------- */
      function mugs(ds) {
        const m = ds.data.mugs; if (!m) return missing('The Mug SOH report'); const W = m.warehouses; const secs = ['All', ...new Set(m.items.map((i) => i.type))];
        const tot = (sec) => m.items.filter((i) => sec === 'All' || i.type === sec).reduce((s, i) => s + (i.total || 0), 0);
        const perW = W.map((w, k) => m.items.reduce((s, i) => s + (i.qty[k] || 0), 0)); const grand = tot('All');
        const zero = m.items.filter((i) => !i.total); const rowsAll = m.items.map((i) => { const o = { name: i.name, type: i.type, total: i.total }; W.forEach((w, k) => (o['w' + k] = i.qty[k])); return o; });
        const cols = [{ k: 'name', label: 'Mug', l: 1, cls: 'wrap' }, { k: 'type', label: 'Type', l: 1 }, ...W.map((w, k) => ({ k: 'w' + k, label: w, fmt: (v) => (v ? num(v) : h('span', { class: 'sub' }, '0')) })), { k: 'total', label: 'Total', fmt: (v) => h('b', {}, num(v)) }];
        const search = h('input', { type: 'search', placeholder: 'Search mug…' }); const secSel = h('select', { class: 'sel' }, secs.map((x) => h('option', { selected: x === mugSec }, x))); const tbl = LM.table(cols, rowsAll, { sort: 'total' });
        const ap = () => { mugSec = secSel.value; tbl.redraw(rowsAll.filter((r) => (mugSec === 'All' || r.type === mugSec) && r.name.toLowerCase().includes(search.value.toLowerCase()))); }; search.oninput = ap; secSel.onchange = ap;
        const plan = ds.data.mugPlan; const planRows = plan ? plan.rows.map((x) => ({ ...x, gap: x.actual != null && x.soh != null ? x.actual - x.soh : null })) : [];
        const el = h('div', {}, h('div', { class: 'sub', style: 'margin-bottom:8px' }, `Mug stock on hand${m.date ? ' as of ' + m.date : ''}.`),
          h('div', { class: 'grid kpis' }, kpi('Total mugs', num(grand), `${m.items.length} mug types`), secs.filter((x) => x !== 'All').map((s) => kpi(s, num(tot(s)), `${m.items.filter((i) => i.type === s).length} types`)), kpi('Out of stock', zero.length, zero.slice(0, 3).map((i) => i.name.trim()).join(', ') + (zero.length > 3 ? '…' : ''))),
          h('div', { class: 'grid half', style: 'margin-bottom:12px' }, chartCard('Mugs by warehouse', 'c1'), chartCard('Top 12 mugs by stock', 'c2')),
          h('div', { class: 'tools' }, search, secSel, h('button', { class: 'btn small', onclick: () => LM.csv(cols, rowsAll, `mugs-${ds.end}.csv`) }, 'Export CSV')), tbl,
          m.move.length ? card('Best-selling mug lines: received vs out vs on hand', LM.table([{ k: 'name', label: 'Mug', l: 1 }, { k: 'received', label: 'Total received', fmt: num }, { k: 'outBranches', label: 'Out to branches', fmt: num }, { k: 'outSalasa', label: 'Out to Salasa', fmt: num }, { k: 'soh', label: 'SOH', fmt: num }], m.move, { sort: null })) : null,
          planRows.length ? h('div', { class: 'card', style: 'margin-top:12px' }, h('h3', {}, 'Dispatch plan vs actual stock'), h('div', { class: 'sub' }, `Expected SOH = before dispatch − dispatched (assumptions: ${plan.assumptions.map((a) => `${a.name} ${p0(a.value)}`).join(', ')}). A negative gap means less stock than the plan expected.`),
            LM.table([{ k: 'name', label: 'Mug', l: 1 }, { k: 'before', label: 'Before dispatch', fmt: num }, { k: 'totalDispatched', label: 'Dispatched', fmt: num }, { k: 'soh', label: 'Expected SOH', fmt: num }, { k: 'actual', label: 'Actual SOH', fmt: num }, { k: 'gap', label: 'Gap', fmt: (v) => (v == null ? '–' : h('span', { class: v < 0 ? 'down' : 'up' }, (v > 0 ? '+' : '') + num(v))) }], planRows, { sort: null })) : null);
        setTimeout(() => { bar(el.querySelector('#c1'), W, perW); const t = [...m.items].sort((a, b) => b.total - a.total).slice(0, 12); bar(el.querySelector('#c2'), t.map((i) => i.name.trim().slice(0, 28)), t.map((i) => i.total), { h: true }); }); return el;
      }

      /* ---------- Capacity & flow ---------- */
      function capFlow(ds) {
        const c = ds.data.capacity, f = ds.data.flow; if (!c && !f) return missing('Capacity and daily flow');
        const el = h('div', {});
        if (c) { const rows = c.rows.map((x) => ({ ...x, calcGap: x.act - x.cap })); el.append(h('div', { class: 'grid kpis' }, kpi('Network utilization', p1(c.total && c.total.u), `${num(c.total && c.total.act)} of ${num(c.total && c.total.cap)} pallets`), kpi('Total area', num(c.total && c.total.area) + ' m²', `${c.rows.length} warehouses`), kpi('Fullest', (() => { const t = [...c.rows].sort((a, b) => b.u - a.u)[0]; return t ? p1(t.u) : '–'; })(), (() => { const t = [...c.rows].sort((a, b) => b.u - a.u)[0]; return t ? t.wh : ''; })()), kpi('Most spare room', (() => { const t = [...c.rows].sort((a, b) => a.u - b.u)[0]; return t ? p1(t.u) : '–'; })(), (() => { const t = [...c.rows].sort((a, b) => a.u - b.u)[0]; return t ? t.wh + ` · ${t.cap - t.act} pallets free` : ''; })())),
            h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Utilization by warehouse (85% target)'), h('div', { class: 'chart', id: 'c1' })),
            card('Warehouse capacity', LM.table([{ k: 'region', label: 'Region', l: 1 }, { k: 'wh', label: 'Warehouse', l: 1 }, { k: 'area', label: 'Area (m²)', fmt: num }, { k: 'cap', label: 'Capacity (pallets)', fmt: num }, { k: 'act', label: 'Actual (pallets)', fmt: num }, { k: 'u', label: 'Utilization', fmt: (v) => h('span', { class: v > 0.95 ? 'down' : v < 0.7 ? 'flat' : '' }, p1(v)) }, { k: 'calcGap', label: 'Free pallets', fmt: (v) => num(-v) }], rows, { sort: null }), h('div', { class: 'sub' }, 'Free pallets are recalculated as capacity − actual; the file’s own “Gap” column has errors for some warehouses.'))); }
        if (f) { el.append(h('div', { class: 'grid kpis' }, f.perf.map((p) => kpi(p.scope.replace(/\s*\(.*\)/, ''), num2(p.actual), `target ${p.target} · ${p0(p.pct)}`)), f.total ? [kpi('Daily cartons out', num(f.total.oc), `${num(f.total.ic)} in · net ${num(f.total.nc)}`), kpi('Daily pallets out', num(f.total.op), `${num(f.total.ip)} in · net ${num(f.total.np)}`), kpi('Branches served', num(f.total.served), `${f.total.daily} deliveries a day`)] : null),
          card('Daily IN & OUT by warehouse', LM.table([{ k: 'region', label: 'Region', l: 1 }, { k: 'wh', label: 'Warehouse', l: 1 }, { k: 'served', label: 'Branches', fmt: (v) => (v == null ? '' : num(v)) }, { k: 'daily', label: 'Daily deliveries', fmt: (v, r) => (v == null ? r.dailyText : num(v)) }, { k: 'oc', label: 'OUT cartons', fmt: num }, { k: 'ic', label: 'IN cartons', fmt: num }, { k: 'nc', label: 'Net cartons', fmt: num }, { k: 'op', label: 'OUT pallets', fmt: num }, { k: 'ip', label: 'IN pallets', fmt: num }, { k: 'np', label: 'Net pallets', fmt: num }], f.rows, { sort: null })),
          f.detail.length ? card('Productivity detail', LM.table([{ k: 'desc', label: 'Team', l: 1, cls: 'wrap' }, { k: 'workers', label: 'Workers', fmt: num }, { k: 'ic', label: 'IN cartons', fmt: num }, { k: 'oc', label: 'OUT cartons', fmt: num }, { k: 'totalHrs', label: 'Hours', fmt: num }, { k: 'cph', label: 'Cartons / hour', fmt: (v) => (v == null ? '–' : v.toFixed(1)) }], f.detail, { sort: null })) : null); }
        setTimeout(() => { const c1 = el.querySelector('#c1'); if (c1) LM.chart(c1, { type: 'bar', data: { labels: c.rows.map((x) => x.wh), datasets: [{ data: c.rows.map((x) => x.u * 100), backgroundColor: c.rows.map((x) => (x.u > 0.95 ? '#b3261e' : x.u < 0.8 ? '#8a8a8a' : LM.css('--accent'))) }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { min: 0, max: 100, ticks: { callback: (v) => v + '%' } } } } }); }); return el;
      }

      /* ---------- Shipments ---------- */
      function shipments(ds) {
        const W = ds.data.weeklyShip || [], D = ds.data.dailyShip, O = ds.data.ordering; if (!W.length && !D) return missing('Shipment and OTIF data'); const last = lastOf(W);
        const el = h('div', {}, h('div', { class: 'grid kpis' }, last ? [kpi('Latest week orders', num(last.t.orders), last.label.trim()), kpi('OTIF', p1(last.t.otif), `${num(last.t.onTime)} on time · ${last.t.delayed} delayed`), kpi('Emergency orders', num(last.t.emergency), `${p0(last.t.orders ? last.t.emergency / last.t.orders : null)} of orders`)] : null,
          D ? kpi('Year to date', p1(D.orders ? D.onTime / D.orders : null), `${num(D.onTime)} of ${num(D.orders)} orders shipped on time`) : null, O ? kpi('Ordering cut-off met', p1(O.pct), `${O.ok} of ${O.days} days OK`) : null),
          W.length ? h('div', { class: 'grid half', style: 'margin-bottom:12px' }, chartCard('Weekly orders and emergency orders', 'c1'), chartCard('Weekly OTIF %', 'c2')) : null,
          last ? card(`Latest week by warehouse: ${last.label.trim()}`, LM.table([{ k: 'wh', label: 'Warehouse', l: 1 }, { k: 'orders', label: 'Orders', fmt: num }, { k: 'onTime', label: 'On time', fmt: num }, { k: 'delayed', label: 'Delayed', fmt: num }, { k: 'emergency', label: 'Emergency', fmt: num }, { k: 'otif', label: 'OTIF', fmt: (v) => (v == null ? '–' : p1(v)) }, { k: 'note', label: 'Reason / note', l: 1, cls: 'wrap' }], last.rows, { sort: null })) : null,
          W.length ? card('All weeks', LM.table([{ k: 'label', label: 'Week', l: 1 }, { k: 'orders', label: 'Orders', fmt: num }, { k: 'onTime', label: 'On time', fmt: num }, { k: 'delayed', label: 'Delayed', fmt: num }, { k: 'emergency', label: 'Emergency', fmt: num }, { k: 'otif', label: 'OTIF', fmt: p1 }], W.map((w) => ({ label: w.label.trim(), ...w.t })).reverse(), { sort: null })) : null,
          O && O.notOk.length ? card('Late ordering days', LM.table([{ k: 'date', label: 'Date', l: 1 }, { k: 'remark', label: 'Remark', l: 1 }], O.notOk, { sort: null })) : null);
        setTimeout(() => { if (!W.length) return; const L = W.map((w) => (w.from ? dayLabel(w.from) : w.label)); LM.chart(el.querySelector('#c1'), { type: 'bar', data: { labels: L, datasets: [{ label: 'Orders', data: W.map((w) => w.t.orders), backgroundColor: LM.css('--accent') }, { label: 'Emergency', data: W.map((w) => w.t.emergency), backgroundColor: '#c2851f' }] }, options: { plugins: { legend: { position: 'bottom' } } } });
          LM.chart(el.querySelector('#c2'), { type: 'line', data: { labels: L, datasets: [{ label: 'OTIF %', data: W.map((w) => (w.t.otif == null ? null : w.t.otif * 100)), borderColor: '#2c7a7b', tension: 0 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { min: 90, max: 100.5, ticks: { callback: (v) => v + '%' } } } } }); }); return el;
      }

      /* ---------- B2B ---------- */
      function b2b(ds) {
        const P = ds.data.b2bProduct, C = ds.data.b2bCustomer; if (!P && !C) return missing('B2B sales'); const el = h('div', {});
        if (P) { const mt = Array.from({ length: 12 }, (_, i) => P.products.reduce((s, x) => s + (x.sales[i] || 0), 0)); const lastM = mt.reduce((a, v, i) => (v ? i : a), 0); const top = P.products.slice(0, 15);
          el.append(h('div', { class: 'grid kpis' }, kpi('B2B net sales (year to date)', M(P.grand), P.partialMonth ? `includes ${P.partialMonth.trim()}` : ''), kpi('Products sold', P.products.filter((x) => x.totalSales).length, ''), kpi('Top product', top[0] ? M(top[0].totalSales) : '–', top[0] ? top[0].name.slice(0, 40) : ''), kpi('Latest month', M(mt[lastM]), MON[lastM])),
            h('div', { class: 'grid half', style: 'margin-bottom:12px' }, chartCard('B2B net sales by month (SAR)', 'c1'), chartCard('Top products by net sales (SAR)', 'c2', 340)),
            card('B2B by product', LM.table([{ k: 'name', label: 'Product', l: 1, cls: 'wrap' }, { k: 'totalQty', label: 'Total qty', fmt: num }, { k: 'totalSales', label: 'Net sales (SAR)', fmt: num }, { k: 'share', label: 'Share', fmt: p1 }], P.products.map((x) => ({ ...x, share: P.grand ? x.totalSales / P.grand : 0 })), { sort: 'totalSales' })));
          setTimeout(() => { bar(el.querySelector('#c1'), MON.slice(0, lastM + 1), mt.slice(0, lastM + 1)); bar(el.querySelector('#c2'), top.map((x) => x.name.slice(0, 32)), top.map((x) => x.totalSales), { h: true }); }); }
        if (C) { const by = {}; C.rows.forEach((r) => ((by[r.customer] = by[r.customer] || { customer: r.customer, sales: 0, qty: 0, lines: 0 }), (by[r.customer].sales += r.sales || 0), (by[r.customer].qty += r.totalQty || 0), by[r.customer].lines++)); const cust = Object.values(by).sort((a, b) => b.sales - a.sales);
          el.append(card('B2B by customer', C.stale ? h('div', { class: 'banner' }, `This sheet is only updated “${C.stale.replace(/\s+/g, ' ')}”, so customer totals are lower than the product totals above.`) : null, LM.table([{ k: 'customer', label: 'Customer', l: 1, cls: 'wrap' }, { k: 'lines', label: 'Product lines', fmt: num }, { k: 'qty', label: 'Quantity', fmt: num }, { k: 'sales', label: 'Net sales (SAR)', fmt: num }, { k: 'share', label: 'Share', fmt: p1 }], cust.map((x) => ({ ...x, share: C.grand ? x.sales / C.grand : 0 })), { sort: 'sales' }))); }
        return el;
      }

      /* ---------- Inventory & ABC ---------- */
      function inventory(ds) {
        const I = ds.data.inventory, A = ds.data.abc; if (!I && !A) return missing('Inventory count'); const el = h('div', {});
        if (I) { const items = I.items.map((i) => ({ ...i, value: i.val.reduce((s, v) => s + v, 0) })); const cols = [{ k: 'code', label: 'Code', l: 1 }, { k: 'name', label: 'Item', l: 1, cls: 'wrap' }, { k: 'unit', label: 'Unit', l: 1 }, { k: 'cost', label: 'Avg cost', fmt: (v) => (v == null ? '–' : num2(v)) }, { k: 'totalQty', label: 'Stock', fmt: num }, { k: 'value', label: 'Value (SAR)', fmt: num }];
          const search = h('input', { type: 'search', placeholder: 'Search item or code…' }); const tbl = LM.table(cols, items, { sort: 'value', limit: 300 }); search.oninput = () => tbl.redraw(items.filter((i) => (i.name + ' ' + i.code).toLowerCase().includes(search.value.toLowerCase())));
          el.append(h('div', { class: 'grid kpis' }, kpi('Total stock value', M(I.total), `SAR ${num(I.total)}`), kpi('Items', num(I.items.length), 'count lines'), I.warehouses.map((w) => kpi(w.name, M(w.value), p1(I.total ? w.value / I.total : 0)))),
            h('div', { class: 'grid half', style: 'margin-bottom:12px' }, chartCard('Stock value by warehouse (SAR)', 'c1'), A ? chartCard('ABC classes: share of stock value', 'c2') : h('div')),
            A ? card('ABC classification', h('div', { class: 'grid kpis' }, ['A', 'B', 'C'].filter((k) => A.classes[k]).map((k) => kpi(`Class ${k}`, num(A.classes[k].n) + ' items', `${p1(A.classes[k].share)} of value · SAR ${M(A.classes[k].value)}`)))) : null,
            h('div', { class: 'tools' }, search, h('span', { class: 'sub' }, 'First 300 matches shown; export for the full list.'), h('button', { class: 'btn small', onclick: () => LM.csv(cols, items, `inventory-${ds.end}.csv`) }, 'Export CSV')), tbl);
          setTimeout(() => { bar(el.querySelector('#c1'), I.warehouses.map((w) => w.name), I.warehouses.map((w) => w.value), { h: true }); if (A) LM.chart(el.querySelector('#c2'), { type: 'doughnut', data: { labels: ['A', 'B', 'C'].filter((k) => A.classes[k]).map((k) => 'Class ' + k), datasets: [{ data: ['A', 'B', 'C'].filter((k) => A.classes[k]).map((k) => A.classes[k].value), backgroundColor: ['#7a4a2b', '#c2851f', '#8a8a8a'] }] }, options: { plugins: { legend: { position: 'bottom' } } } }); }); }
        else if (A) el.append(card('ABC classification', LM.table([{ k: 'code', label: 'Code', l: 1 }, { k: 'name', label: 'Item', l: 1, cls: 'wrap' }, { k: 'value', label: 'Value', fmt: num }, { k: 'cls', label: 'Class', l: 1 }], A.items, { sort: 'value', limit: 200 })));
        return el;
      }

      function uploads() {
        return h('div', { class: 'card' }, h('h3', {}, 'Uploaded warehouse reports'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Report date', 'File', 'Sections', 'Uploaded', ''].map((t) => h('th', { class: 'l' }, t)))), h('tbody', {}, sets.map((s) => h('tr', {}, h('td', { class: 'l' }, s.end), h('td', { class: 'l' }, s.fileName), h('td', { class: 'l' }, Object.keys(s.data).filter((k) => WM.PARTS.includes(k)).length), h('td', { class: 'l' }, s.uploadedAt.slice(0, 16).replace('T', ' ')),
          h('td', {}, h('button', { class: 'btn small danger', onclick: async () => { if (await LM.ask(`Delete the report dated ${s.end}?`)) { await LM.db.del('datasets', s.id); reload(); } } }, 'Delete')))))));
      }
      await reload();
    },
  };
})();
