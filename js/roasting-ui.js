/* Roasting tab: weekly production history, green/roast stock cover, planning tables. */
(function () {
  const LM = window.LM; const { h, num, num2, compact, dayLabel } = LM; LM.depts = LM.depts || {};
  const kpi = (l, v, d) => h('div', { class: 'card kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
  const f1 = (v) => (v == null || !isFinite(v) ? '–' : v.toFixed(1));
  const dlt = (a, b, d = 1, good = 'up') => (a == null || b == null ? '' : `${a - b > 0 ? '+' : ''}${(a - b).toFixed(d)}`);
  const cover = (v) => (v == null ? '–' : h('span', { class: v < 7 ? 'down' : v < 14 ? '' : 'up', style: v < 14 ? 'font-weight:700' : '' }, v.toFixed(1)));
  const chip = (v) => (v == null ? '' : v < 7 ? h('span', { class: 'pill closed' }, 'Under 7 days') : v < 14 ? h('span', { class: 'pill' }, 'Under 14 days') : h('span', { class: 'pill new' }, 'OK'));

  LM.depts.roasting = {
    id: 'roasting', label: 'Roasting',
    async mount(panel) {
      let sets = [], smp = [], smCur = null, cur = null, sub = 'Overview', year = 'All';
      const reload = async () => { const all = (await LM.db.all('datasets')).filter((d) => d.dept === 'roasting'); smp = all.filter((d) => d.type === 'samples').sort((a, b) => (a.end < b.end ? 1 : -1)); if (!smp.find((s) => s.id === smCur)) smCur = smp[0] ? smp[0].id : null; sets = all.filter((d) => d.type !== 'samples').sort((a, b) => (a.end < b.end ? 1 : -1)); if (!sets.find((s) => s.id === cur)) cur = sets[0] ? sets[0].id : null; draw(); };

      async function uploadMany(files) { for (const f of [].concat(files)) await upload(f); }
      function upload(file) { return new Promise(async (resolve) => {
        let rf; try { rf = await LM.readFile(file); } catch (e) { LM.say(e.message); return resolve(); }
        if (LM.roastSamples.detect(rf.wb)) return uploadSamples(rf, resolve);
        const tpl = { dept: 'roasting', ...((await LM.db.get('templates', 'roasting')) || {}) }; const ov = {}; const run = () => LM.roasting.analyze(rf.wb, rf.name, ov, tpl, sets, rf.hash); let res = run();
        const info = () => { const d = res.ds && res.ds.data; return {
          title: `Review before processing: ${rf.name}`, issues: res.issues, onCancel: resolve,
          facts: d ? [['Report date', res.ds.end || '–'], ['Production weeks', d.weekly ? d.weekly.length : 0], ['Green bean origins', d.soh ? d.soh.green.reduce((s, g) => s + g.items.length, 0) : 0], ['Roast bean lines', d.soh ? d.soh.roast.length : 0]] : [['Report', 'Not recognised']],
          approveLabel: res.ds && sets.some((s) => s.end === res.ds.end) ? 'Approve & replace existing' : 'Approve & process',
          onFix: (fix, val) => { if (fix.type === 'asOf') ov.asOf = { date: val }; res = run(); dlg.update(info()); },
          onApprove: async () => { if (!res.ds || res.issues.some((i) => i.level === 'error')) throw new Error('Fix the errors first.'); const d = res.ds; const old = sets.find((s) => s.end === d.end);
            if (old) { await LM.db.put('history', { ...old, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', old.id); }
            const rec = { id: LM.uid(), dept: 'roasting', type: 'roasting', start: d.start, end: d.end, fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), data: d.data };
            await LM.db.put('datasets', rec); cur = rec.id; LM.toast(`Roasting report ${d.end} processed`); await reload(); resolve(); } }; };
        const dlg = LM.review(info());
      }); }
      function uploadSamples(rf, resolve) {
        const ov = {}; const run = () => LM.roastSamples.analyze(rf, smp, ov); let res = run();
        const info = () => { const d = res.ds; const c = d ? LM.roastSamples.compute(d) : null; return {
          title: `Review before processing: ${rf.name}`, issues: res.issues,
          facts: d ? [['Report', 'Green bean samples'], ['Period', d.label], ['Samples', c.n], ['Approved / Not approved / Under process', `${c.ok} / ${c.no} / ${c.up}`]] : [['Report', 'Not recognised']],
          approveLabel: res.ds && smp.some((s) => s.end === res.ds.end) ? 'Approve & replace existing' : 'Approve & process',
          onCancel: resolve,
          onFix: (fix, val) => { if (fix.type === 'asOf') ov.asOf = { date: val }; res = run(); dlg.update(info()); },
          onApprove: async () => { if (!res.ds || res.issues.some((i) => i.level === 'error')) throw new Error('Fix the errors first.'); const d = res.ds; const old = smp.find((s) => s.end === d.end);
            if (old) { await LM.db.put('history', { ...old, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', old.id); }
            const rec = { id: LM.uid(), dept: 'roasting', type: 'samples', start: d.start, end: d.end, label: d.label, fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), data: d.data };
            await LM.db.put('datasets', rec); smCur = rec.id; sub = 'Green bean samples'; LM.toast(`Green bean samples ${d.label} processed`); await reload(); resolve(); } }; };
        const dlg = LM.review(info());
      }

      const body = h('div');
      function draw() {
        LM.killCharts();
        const sel = sets.length > 1 ? h('select', { class: 'sel', onchange: (e) => { cur = e.target.value; draw(); } }, sets.map((s) => h('option', { value: s.id, selected: s.id === cur }, 'Report ' + s.end))) : null;
        panel.replaceChildren(h('div', { class: 'head' }, h('h2', {}, 'Roasting'), sel, h('div', { class: 'spacer' }), LM.filePicker(uploadMany, 'Upload Roasting files', true)), body);
        LM.dropZone(panel, uploadMany, true);
        const ds = sets.find((s) => s.id === cur);
        if (!ds && smp.length) { sub = 'Green bean samples'; return body.replaceChildren(h('div', { class: 'subtabs' }, ['Green bean samples', 'Uploads'].map((t) => h('button', { class: t === sub ? 'on' : '', onclick: () => { sub = t; draw(); } }, t))), sub === 'Uploads' ? uploads() : samples()); }
        if (!ds) return body.replaceChildren(h('div', { class: 'empty' }, h('h3', {}, 'No roasting report uploaded yet'), h('p', { class: 'sub' }, 'Drop the weekly “Coffee production batches & SOH” workbook (.xlsx). It should contain the Weekly production sheet and the dated stock-on-hand sheet.')));
        const tabs = ['Overview', 'Production', 'Stock', 'Planning', ...(smp.length ? ['Green bean samples'] : []), 'Uploads'];
        body.replaceChildren(h('div', { class: 'sub', style: 'margin-bottom:8px' }, `Report ${ds.end} · ${ds.fileName} · uploaded ${ds.uploadedAt.slice(0, 16).replace('T', ' ')}`), h('div', { class: 'subtabs' }, tabs.map((t) => h('button', { class: t === sub ? 'on' : '', onclick: () => { sub = t; draw(); } }, t))), { Overview: overview, Production: production, Stock: stock, Planning: planning, 'Green bean samples': samples, Uploads: uploads }[sub](ds));
      }

      /* ---------- alerts ---------- */
      function alerts(d) {
        const A = []; if (!d.soh) return A;
        const U = LM.roasting.byUse(d.soh); U.green.forEach((g) => { const doh = g.doh; if (g.target > 0 && doh != null && doh < 14 && !g.covered) A.push({ lvl: doh < 7 ? 'error' : 'warn', text: `Green beans – ${g.use}: ${doh.toFixed(1)} days of stock (target ${num(g.target)} kg/month)`, pipe: g.incoming.join(' | ') });
          g.lines.forEach((i) => { if (/delay/i.test(i.status)) A.push({ lvl: 'warn', text: `Delayed shipment – ${g.use} / ${i.origin}: ${[i.pipeline, i.eta].filter(Boolean).join(', ')}` }); }); });
        U.roast.forEach((x) => { if (x.doh != null && x.doh < 14) A.push({ lvl: x.doh < 7 ? 'error' : 'warn', text: `Roasted – ${x.use}: ${x.doh.toFixed(1)} days of stock` }); });
        return A.sort((a, b) => (a.lvl === b.lvl ? 0 : a.lvl === 'error' ? -1 : 1));
      }

      function overview(ds) {
        const d = ds.data; const W = d.weekly || []; const last = W[W.length - 1], prev = W[W.length - 2]; const l4 = W.slice(-5, -1); const avg4 = l4.length ? l4.reduce((s, w) => s + w.tons, 0) / l4.length : null;
        const yr = last ? last.year : null; const ytd = W.filter((w) => w.year === yr); const ly = W.filter((w) => w.year === yr - 1 && w.no <= (last ? last.no : 0)); const sumT = (a) => a.reduce((s, w) => s + (w.tons || 0), 0);
        const A = alerts(d); const grid = h('div', { class: 'grid kpis' });
        if (last) grid.append(kpi('Latest week roasted', f1(last.tons) + ' t', `week ${last.no}, ${last.year} (ends ${last.end})${prev ? ' · ' + dlt(last.tons, prev.tons) + ' t vs prev' : ''}`), kpi('Utilization', f1(last.util) + '%', `capacity ${f1(last.cap)} t${prev ? ' · ' + dlt(last.util, prev.util) + ' pts vs prev' : ''}`), kpi('Rejected batches', last.rej == null ? '–' : last.rej, `${ytd.reduce((s, w) => s + (w.rej || 0), 0)} so far in ${yr}`), kpi('Last 4 weeks avg', f1(avg4) + ' t', avg4 != null ? `${dlt(last.tons, avg4)} t latest vs avg` : ''), kpi(`${yr} to date`, f1(sumT(ytd)) + ' t', ly.length ? `${dlt(sumT(ytd), sumT(ly), 0)} t vs same weeks ${yr - 1} (${f1(sumT(ly))} t)` : ''));
        const el = h('div', {}, grid,
          h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, `Stock alerts${d.soh ? ' (as of ' + d.soh.date + ')' : ''}`), A.length ? A.map((a) => h('div', { class: 'issue ' + (a.lvl === 'error' ? 'error' : 'warn') }, h('div', { class: 'tag' }, a.lvl === 'error' ? 'Under 7d' : 'Watch'), h('div', {}, a.text, a.pipe ? h('div', { class: 'sub' }, 'Pipeline: ' + a.pipe) : null))) : h('span', { class: 'sub' }, d.soh ? 'Every line with a target has at least 14 days of cover.' : 'No stock sheet in this upload.')),
          h('div', { class: 'card' }, h('h3', {}, 'Weekly roasted tons and utilization (last 26 weeks)'), h('div', { class: 'chart', id: 'c1' })));
        setTimeout(() => prodChart(el.querySelector('#c1'), W.slice(-26))); return el;
      }
      function prodChart(host, W) {
        LM.chart(host, { data: { labels: W.map((w) => `${w.no}${w.year !== W[W.length - 1].year ? "'" + String(w.year).slice(2) : ''}`), datasets: [{ type: 'bar', label: 'Roasted (t)', data: W.map((w) => w.tons), backgroundColor: LM.css('--accent'), yAxisID: 'y' }, { type: 'line', label: 'Utilization %', data: W.map((w) => w.util), borderColor: '#2c7a7b', backgroundColor: '#2c7a7b', tension: 0, pointRadius: 2, yAxisID: 'y1' }] },
          options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { title: { display: true, text: 'tons' } }, y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: (v) => v + '%' } } } } });
      }

      function production(ds) {
        const W = ds.data.weekly || []; if (!W.length) return h('div', { class: 'banner' }, 'No weekly production table in this report.');
        const years = [...new Set(W.map((w) => w.year))]; const S = year === 'All' ? W : W.filter((w) => w.year === +year); const tons = S.reduce((s, w) => s + (w.tons || 0), 0); const best = [...S].sort((a, b) => b.tons - a.tons)[0];
        const cols = [{ k: 'year', label: 'Year' }, { k: 'no', label: 'Week' }, { k: 'end', label: 'Week ends', l: 1 }, { k: 'tons', label: 'Roasted (t)', fmt: (v) => f1(v) }, { k: 'cap', label: 'Capacity (t)', fmt: (v) => f1(v) }, { k: 'util', label: 'Utilization %', fmt: (v) => f1(v) }, { k: 'rej', label: 'Rejected batches', fmt: (v) => (v == null ? '–' : v) }];
        const el = h('div', {}, h('div', { class: 'tools' }, h('select', { class: 'sel', onchange: (e) => { year = e.target.value; draw(); } }, ['All', ...years].map((y) => h('option', { selected: String(y) === String(year) }, y))), h('span', { class: 'sub' }, 'Utilization = roasted ÷ capacity (capacity changes week to week in the file).')),
          h('div', { class: 'grid kpis' }, kpi('Roasted', f1(tons) + ' t', `${S.length} weeks`), kpi('Average per week', f1(tons / S.length) + ' t', ''), kpi('Average utilization', f1(S.reduce((s, w) => s + (w.util || 0), 0) / S.length) + '%', ''), kpi('Rejected batches', S.reduce((s, w) => s + (w.rej || 0), 0), `${S.filter((w) => w.rej > 0).length} weeks with a rejection`), kpi('Best week', best ? f1(best.tons) + ' t' : '–', best ? `week ${best.no}, ${best.year}` : '')),
          h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Roasted tons and utilization'), h('div', { class: 'chart', id: 'c1' })),
          h('div', { class: 'grid half', style: 'margin-bottom:12px' }, h('div', { class: 'card' }, h('h3', {}, 'Year on year: tons by week number'), h('div', { class: 'chart', id: 'c2' })), h('div', { class: 'card' }, h('h3', {}, 'Rejected batches'), h('div', { class: 'chart', id: 'c3' }))),
          LM.table(cols, S.slice().reverse(), { sort: null }));
        setTimeout(() => { prodChart(el.querySelector('#c1'), S); const pal = ['#a9a29b', '#2c7a7b', '#7a4a2b']; LM.chart(el.querySelector('#c2'), { type: 'line', data: { labels: Array.from({ length: 52 }, (_, i) => i + 1), datasets: years.map((y, i) => ({ label: String(y), data: Array.from({ length: 52 }, (_, k) => { const w = W.find((x) => x.year === y && x.no === k + 1); return w ? w.tons : null; }), borderColor: pal[(i + pal.length - years.length) % pal.length], backgroundColor: pal[(i + pal.length - years.length) % pal.length], tension: 0, pointRadius: 1.5, spanGaps: false })) }, options: { plugins: { legend: { position: 'bottom' } } } });
          LM.chart(el.querySelector('#c3'), { type: 'bar', data: { labels: S.map((w) => `${w.no}`), datasets: [{ data: S.map((w) => w.rej), backgroundColor: LM.css('--bad') }] }, options: { plugins: { legend: { display: false } }, scales: { y: { ticks: { precision: 0 } } } } }); }); return el;
      }

      function stock(ds) {
        const s = ds.data.soh; if (!s) return h('div', { class: 'banner' }, 'No stock-on-hand sheet in this report.'); const U = LM.roasting.byUse(s);
        const dc = (v, r) => (v == null ? h('span', { class: 'sub' }, '–') : h('span', {}, cover(v), ' ', chip(v)));
        const gdc = (v, r) => (v == null ? h('span', { class: 'sub' }, '–') : r.covered ? h('span', {}, h('b', {}, v.toFixed(1)), ' ', h('span', { class: 'sub' }, `green bean stock only · roasted beans cover ${r.roastDoh.toFixed(1)} days`)) : h('span', {}, cover(v), ' ', chip(v)));
        const gcols = [{ k: 'use', label: 'Used for', l: 1 }, { k: 'soh', label: 'Total stock (kg)', fmt: (v) => num(v) }, { k: 'doh', label: 'Total DOH (days)', fmt: gdc }];
        const rcols = [{ k: 'use', label: 'Used for', l: 1 }, { k: 'soh', label: 'Total SOH', fmt: (v) => num(v) }, { k: 'doh', label: 'Total DOH (days)', fmt: dc }];
        const bars = [...U.green.filter((g) => g.doh != null).map((g) => [g.use + ' (green)', g.doh, g.covered]), ...U.roast.filter((x) => x.doh != null).map((x) => [x.use + ' (roasted)', x.doh, false])];
        const gdet = s.green.flatMap((g) => g.items.map((i) => ({ group: g.name, origin: i.origin, soh: i.soh, doh: i.doh, pipeline: i.pipeline, eta: i.eta, status: i.status })));
        const el = h('div', {}, h('div', { class: 'sub', style: 'margin-bottom:8px' }, `Stock as of ${s.date || '–'}. One line per use, with the sheet's own Total stock and Total DOH for green beans. Red under 7 days, amber under 14; green beans are not flagged when the roasted beans for that use already cover 14+ days.`),
                    h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Days on hand by use'), h('div', { class: 'chart', id: 'c1', style: 'height:' + Math.max(260, bars.length * 24) + 'px' })),
          h('h3', {}, 'Green beans (kg)'), LM.table(gcols, U.green, { sort: null }), h('h3', { style: 'margin-top:14px' }, 'Roasted beans'), LM.table(rcols, U.roast, { sort: null }),
          h('details', { class: 'card', style: 'margin-top:12px' }, h('summary', {}, 'Detail by origin and by roasted product'),
            LM.table([{ k: 'group', label: 'Used for', l: 1 }, { k: 'origin', label: 'Origin', l: 1 }, { k: 'soh', label: 'SOH (kg)', fmt: (v) => (v == null ? '–' : num(v)) }, { k: 'doh', label: 'Days on hand', fmt: cover }, { k: 'pipeline', label: 'Orders in pipeline', l: 1, cls: 'wrap' }, { k: 'eta', label: 'ETA', l: 1 }, { k: 'status', label: 'Status', l: 1 }], gdet, { sort: null }),
            LM.table([{ k: 'type', label: 'Roasted product', l: 1 }, { k: 'soh', label: 'SOH', fmt: (v) => (v == null ? '–' : num2(v)) }, { k: 'target', label: 'Target / month', fmt: (v) => (v ? num(v) : '') }, { k: 'doh', label: 'Days on hand', fmt: dc }], s.roast, { sort: null })),
          ds.data.sku && ds.data.sku.length ? h('div', { class: 'card', style: 'margin-top:12px' }, h('h3', {}, '250g stock (pieces)'), LM.table([{ k: 'sku', label: 'SKU', l: 1 }, { k: 'pcs', label: 'Pieces', fmt: num }], ds.data.sku, { sort: 'pcs' })) : null);
        setTimeout(() => LM.chart(el.querySelector('#c1'), { type: 'bar', data: { labels: bars.map((b) => b[0]), datasets: [{ data: bars.map((b) => b[1]), backgroundColor: bars.map((b) => (b[2] ? LM.css('--ly') : b[1] < 7 ? LM.css('--bad') : b[1] < 14 ? LM.css('--warn') : LM.css('--accent'))) }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } } } })); return el;
      }

      function planning(ds) {
        const d = ds.data; const req = d.required; const el = h('div', {});
        if (req) { el.append(h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Required quantities (planning)'), req.lastUpdate ? h('div', { class: 'sub' }, `Last updated ${req.lastUpdate}${(Date.parse(ds.end) - Date.parse(req.lastUpdate)) / 86400000 > 30 ? ' – out of date' : ''}`) : null,
          h('div', { class: 'tscroll' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, req.cols.map((c, i) => h('th', { class: i === 0 || /green/i.test(c) ? 'l' : '' }, c)))), h('tbody', {}, req.rows.map((r) => h('tr', {}, req.cols.map((c, i) => h('td', { class: i === 0 || /^green beans$/i.test(c) ? 'l' : '' }, String(r[c] == null ? '' : r[c])))))))))); }
        (d.monthly || []).forEach((b) => el.append(h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Production vs consumption: ' + b.name), h('div', { class: 'sub' }, 'Months as given in the file (no year).'), LM.table([{ k: 'month', label: 'Month', l: 1 }, { k: 'prod', label: 'Production (kg)', fmt: num }, { k: 'cons', label: 'Consumption (kg)', fmt: num }, { k: 'diff', label: 'Difference (kg)', fmt: (v) => (v == null ? '' : h('span', { class: v < 0 ? 'down' : 'up' }, (v > 0 ? '+' : '') + num(v))) }], b.rows, { sort: null }))));
        if (!el.children.length) el.append(h('div', { class: 'banner' }, 'No planning tables in this report.')); return el;
      }
      function samples() {
        if (!smp.length) return h('div', { class: 'banner' }, 'No green bean sample report uploaded yet. Upload it together with the weekly roasting file.');
        const ds = smp.find((s) => s.id === smCur) || smp[0]; const c = LM.roastSamples.compute(ds); const pctS = (v) => (v == null ? '–' : (v * 100).toFixed(0) + '%');
        const sel = smp.length > 1 ? h('select', { class: 'sel', onchange: (e) => { smCur = e.target.value; draw(); } }, smp.map((s) => h('option', { value: s.id, selected: s.id === ds.id }, 'Samples ' + s.label))) : null;
        const ar = (v) => h('span', { dir: 'auto' }, v || '');
        const rate = (v, r) => (v == null ? '–' : h('span', { class: v < 0.4 ? 'down' : '' }, pctS(v)));
        const gcols = (first) => [{ k: 'name', label: first, l: 1 }, { k: 'n', label: 'Samples', fmt: num }, { k: 'ok', label: 'Approved', fmt: num }, { k: 'no', label: 'Not approved', fmt: num }, { k: 'up', label: 'Under process', fmt: num }, { k: 'rate', label: 'Approval rate*', fmt: rate }];
        const lcols = [{ k: 'origin', label: 'Origin', l: 1, fmt: ar }, { k: 'country', label: 'Country', l: 1 }, { k: 'supplier', label: 'Supplier', l: 1 }, { k: 'lot', label: 'Lot', l: 1 }, { k: 'process', label: 'Process', l: 1 }, { k: 'grade', label: 'Grade', l: 1 }, { k: 'date', label: 'Received', l: 1, fmt: (v, r) => (v ? v + (r.dateFixed ? ' *' : '') : '–') }, { k: 'result', label: 'Result', l: 1, fmt: (v) => h('span', { class: 'pill ' + (v === 'Approved' ? 'new' : v === 'Not approved' ? 'closed' : '') }, v) }];
        const el = h('div', {}, h('div', { class: 'tools' }, sel, h('span', { class: 'sub' }, `${ds.fileName} · uploaded ${ds.uploadedAt.slice(0, 16).replace('T', ' ')} · sheet ${ds.data.sheet}`)),
          h('div', { class: 'grid kpis' }, kpi('Samples', c.n, ds.label), kpi('Approved', c.ok, `${c.n ? Math.round((c.ok / c.n) * 100) : 0}% of all samples`), kpi('Not approved', c.no, ''), kpi('Under process', c.up, c.pending[0] ? `oldest received ${c.pending[0].date} (${c.pending[0].age} days)` : ''), kpi('Approval rate*', pctS(c.rate), '*approved ÷ (approved + not approved)')),
          h('div', { class: 'grid half', style: 'margin-bottom:12px' }, h('div', { class: 'card' }, h('h3', {}, 'Result by supplier'), h('div', { class: 'chart', id: 's1', style: 'height:320px' })), h('div', { class: 'card' }, h('h3', {}, 'Samples received per week'), h('div', { class: 'chart', id: 's2', style: 'height:320px' }))),
          h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, `Still under process (${c.pending.length})`), c.pending.length ? LM.table([...lcols, { k: 'age', label: 'Days waiting', fmt: (v) => (v == null ? '–' : num(v)) }], c.pending, { sort: 'age' }) : h('span', { class: 'sub' }, 'None.')),
          h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'By supplier'), LM.table(gcols('Supplier'), c.bySupplier, { sort: 'n' })),
          h('div', { class: 'grid half', style: 'margin-bottom:12px' }, h('div', { class: 'card' }, h('h3', {}, 'By origin country'), LM.table(gcols('Country'), c.byCountry, { sort: 'n' })), h('div', { class: 'card' }, h('h3', {}, 'By process'), LM.table(gcols('Process'), c.byProcess, { sort: 'n' }))),
          h('div', { class: 'card' }, h('h3', {}, 'All samples'), h('div', { class: 'tools' }, h('button', { class: 'btn small', onclick: () => LM.csv(lcols, ds.data.rows, `green-bean-samples-${ds.label.replace(/\W+/g, '-')}.csv`) }, 'Export CSV')), LM.table(lcols, ds.data.rows, { sort: 'date', dir: 1, limit: 200 })));
        setTimeout(() => { const s = c.bySupplier.slice(0, 12); LM.chart(el.querySelector('#s1'), { type: 'bar', data: { labels: s.map((x) => x.name), datasets: [{ label: 'Approved', data: s.map((x) => x.ok), backgroundColor: '#1d7a46' }, { label: 'Not approved', data: s.map((x) => x.no), backgroundColor: '#c0392b' }, { label: 'Under process', data: s.map((x) => x.up), backgroundColor: '#b7791f' }] }, options: { indexAxis: 'y', plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true, ticks: { precision: 0 } }, y: { stacked: true } } } });
          LM.chart(el.querySelector('#s2'), { type: 'bar', data: { labels: c.weeks.map((w) => 'wk ' + w[0].slice(5)), datasets: [{ label: 'Approved', data: c.weeks.map((w) => w[1].ok), backgroundColor: '#1d7a46' }, { label: 'Other', data: c.weeks.map((w) => w[1].n - w[1].ok), backgroundColor: '#999' }] }, options: { plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, ticks: { precision: 0 } } } } }); }); return el;
      }
      function uploads() {
        const smTbl = smp.length ? h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Uploaded green bean sample reports'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Period', 'File', 'Samples', 'Uploaded', ''].map((t) => h('th', { class: 'l' }, t)))), h('tbody', {}, smp.map((s) => h('tr', {}, h('td', { class: 'l' }, s.label), h('td', { class: 'l' }, s.fileName), h('td', { class: 'l' }, s.data.rows.length), h('td', { class: 'l' }, s.uploadedAt.slice(0, 16).replace('T', ' ')), h('td', {}, h('button', { class: 'btn small danger', onclick: async () => { if (await LM.ask(`Delete the ${s.label} sample report?`)) { await LM.db.del('datasets', s.id); reload(); } } }, 'Delete'))))))) : null;
        return h('div', {}, smTbl, h('div', { class: 'card' }, h('h3', {}, 'Uploaded roasting reports'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Report date', 'File', 'Weeks', 'Uploaded', ''].map((t) => h('th', { class: 'l' }, t)))), h('tbody', {}, sets.map((s) => h('tr', {}, h('td', { class: 'l' }, s.end), h('td', { class: 'l' }, s.fileName), h('td', { class: 'l' }, s.data.weekly ? s.data.weekly.length : 0), h('td', { class: 'l' }, s.uploadedAt.slice(0, 16).replace('T', ' ')),
          h('td', {}, h('button', { class: 'btn small danger', onclick: async () => { if (await LM.ask(`Delete the report dated ${s.end}?`)) { await LM.db.del('datasets', s.id); reload(); } } }, 'Delete'))))))));
      }
      await reload();
    },
  };
})();
