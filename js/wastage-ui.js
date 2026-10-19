/* Wastage tab: upload -> review -> store -> dashboards. Waste % uses net sales from the Sales tab where available. */
(function () {
  const LM = window.LM; const { h, num, num2, pct0, compact, delta, dayLabel } = LM; const W = LM.wastage; LM.depts = LM.depts || {};
  const pc = (v, d = 2) => (v == null || !isFinite(v) ? '–' : (v * 100).toFixed(d) + '%');
  const pp = (v) => (v == null ? '–' : h('span', { class: v > 0.00005 ? 'down' : v < -0.00005 ? 'up' : 'flat' }, (v > 0 ? '▲ +' : v < 0 ? '▼ ' : '● ') + (v * 100).toFixed(2) + ' pp'));
  const wow = (a, b) => (b ? a / b - 1 : null);
  const costDelta = (v) => h('span', { class: v == null ? 'flat' : v > 0.0005 ? 'down' : v < -0.0005 ? 'up' : 'flat' }, v == null ? '–' : (v > 0.0005 ? '▲ ' : v < -0.0005 ? '▼ ' : '● ') + (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%');

  LM.depts.wastage = {
    id: 'wastage', label: 'Wastage',
    async mount(panel) {
      let sets = [], salesSets = [], cur = null, sub = 'Overview';
      const tpl = async () => ({ ...W.defaultTemplate(), ...((await LM.db.get('templates', 'wastage')) || {}) });
      let T = W.defaultTemplate();
      const reload = async () => {
        const all = await LM.db.all('datasets');
        sets = all.filter((d) => d.dept === 'wastage').sort((a, b) => (a.start < b.start ? 1 : -1)); salesSets = all.filter((d) => d.dept === 'sales');
        T = await tpl(); if (!sets.find((s) => s.id === cur)) cur = sets[0] ? sets[0].id : null; draw();
      };
      const calc = (ds) => W.compute(ds, T, W.salesNetFor(salesSets, ds.start, ds.end), null);
      const prevOf = (ds) => { const p = sets.find((s) => s.end === W.addDays(ds.start, -1)); return p ? { ...calc(p), start: p.start, end: p.end } : null; };

      function upload(file) {
        LM.runUpload(file, {
          dept: 'wastage', label: 'Wastage', spec: W.spec, existing: sets,
          build: (parsed, t, ov) => W.build(parsed, t, ov),
          checks: (parsed, ds, t, ov, rf, existing) => W.checks(parsed, ds, { ...W.defaultTemplate(), ...t }, ov, rf, existing),
          facts: (ds) => [['Period', ds.start ? `${ds.start} → ${ds.end}` : '–'], ['Write-off lines', num(ds.lines.length)], ['Storages', num(new Set(ds.lines.map((l) => l.storage)).size)], ['Total waste (SAR)', num(ds.lines.reduce((s, l) => s + l.value, 0))]],
          learn: (t, ds, ov) => {
            t.storageMap = { ...(t.storageMap || {}), ...ds.fileMap, ...(ov.storage || {}) };
            t.branchNames = { ...(t.branchNames || {}) }; Object.values(t.storageMap).forEach((n) => (t.branchNames[W.branchKey(n)] = n));
            t.knownCategories = [...new Set([...(t.knownCategories || []), ...ds.lines.map((l) => l.category)])];
            t.knownUoms = [...new Set([...(t.knownUoms || []), ...ds.lines.map((l) => l.uom).filter(Boolean)])];
            return t;
          },
          onSaved: (rec) => { cur = rec.id; reload(); },
        });
      }

      const body = h('div');
      function draw() {
        LM.killCharts();
        const picker = LM.filePicker(upload, 'Upload Wastage report');
        const sel = sets.length ? h('select', { class: 'sel', onchange: (e) => { cur = e.target.value; draw(); } }, sets.map((s) => h('option', { value: s.id, selected: s.id === cur }, `${s.start} → ${s.end}`))) : null;
        panel.replaceChildren(h('div', { class: 'head' }, h('h2', {}, 'Wastage'), sel, h('div', { class: 'spacer' }), picker), body);
        LM.dropZone(panel, upload);
        const ds = sets.find((s) => s.id === cur);
        if (!ds) return body.replaceChildren(h('div', { class: 'empty' }, h('h3', {}, 'No wastage report uploaded yet'), h('p', { class: 'sub' }, 'Drop the weekly Waste Report (.xlsx) here, or use the Upload button.'),
          h('p', { class: 'sub' }, 'Expected: sheet “Products statement” (Code, Stock list, U/M, Quantity, Unit Pr, Wastage Value, Document date, Document type, Write-off storage, Category). Optional “Sheet2” links storages to branches.')));
        const c = calc(ds); c.prev = prevOf(ds);
        const tabs = ['Overview', 'Branches', 'Items', 'Days', 'Uploads'];
        const st = h('div', { class: 'subtabs' }, tabs.map((t) => h('button', { class: t === sub ? 'on' : '', onclick: () => { sub = t; draw(); } }, t)));
        const ns = c.netSources; const unm = c.branches.filter((b) => /^U:/.test(b.key)).length;
        const notes = [];
        notes.push(`Net sales for waste % come from the Sales tab for ${ns.sales} branch(es)${ns.file ? ` and from this file for ${ns.file}` : ''}${ns.none ? `; ${ns.none} have no net sales` : ''}.`);
        if (unm) notes.push(`${unm} storage(s) are not linked to a branch.`);
        body.replaceChildren(h('div', { class: 'sub', style: 'margin-bottom:8px' }, `Report ${ds.start} → ${ds.end} · ${ds.fileName} · uploaded ${ds.uploadedAt.slice(0, 16).replace('T', ' ')}`),
          st, notes.length ? h('div', { class: 'sub', style: 'margin-bottom:8px' }, notes.join(' ')) : null,
          { Overview: overview, Branches: branches, Items: items, Days: days, Uploads: uploads }[sub](ds, c));
      }
      const kpi = (l, v, d) => h('div', { class: 'card kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
      const catColors = () => ['#7a4a2b', '#2c7a7b', '#c2851f', '#5b6fb5', '#a8456b', '#6b8e3d'];

      function dailyStack(host, c) {
        const col = catColors();
        LM.chart(host, { type: 'bar', data: { labels: c.days.map((d) => dayLabel(d.day)), datasets: c.cats.map((k, i) => ({ label: k, data: c.days.map((d) => d.byCat[k] || 0), backgroundColor: col[i % col.length] })) },
          options: { plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: (v) => compact(v) } } } } });
      }
      function overview(ds, c) {
        const p = c.prev; const top = c.branches.filter((b) => b.pct != null);
        const hi = top.filter((b) => b.vsNet >= 3);
        const F = [];
        F.push(['Network', `Waste SAR ${num(c.total)} = ${pc(c.netPct)} of net sales (SAR ${num(c.netTotal)}) across ${c.branches.length} branches${p ? `; previous week SAR ${num(p.total)} (${pc(p.netPct)})` : ''}.`]);
        F.push(['Categories', c.catArr.map((k) => `${k.name} SAR ${num(k.value)} (${pct0(k.share)})`).join('; ') + '.']);
        if (top[0]) F.push(['Branches', `Highest waste %: ${top[0].name} ${pc(top[0].pct)} (SAR ${num(top[0].value)}); ${hi.length} branch(es) are 3× the network rate or more.`]);
        const t3 = c.items.slice(0, 3); F.push(['Items', `Top 3 items = ${pct0(t3.reduce((s, i) => s + i.share, 0))} of waste: ${t3.map((i) => `${i.name} (SAR ${num(i.value)})`).join('; ')}.`]);
        const el = h('div', {},
          h('div', { class: 'grid kpis' },
            kpi('Waste value', num(c.total), p ? h('span', {}, costDelta(wow(c.total, p.total)), ' vs prev week') : 'SAR'),
            kpi('Waste % of net sales', pc(c.netPct), p ? h('span', {}, pp(c.netPct != null && p.netPct != null ? c.netPct - p.netPct : null), ' vs prev week') : `net sales SAR ${compact(c.netTotal)}`),
            kpi('Write-off lines', num(c.lines), `${num(new Set(ds.lines.map((l) => l.storage)).size)} storages`),
            kpi('Avg per day', num(c.avgDay), `${c.days.length} days`),
            c.catArr.map((k) => kpi(k.name, num(k.value), `${pc(k.pct)} of net sales · ${pct0(k.share)} of waste`))),
          h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Key findings'), h('ul', { class: 'findings' }, F.map(([a, b]) => h('li', {}, h('b', {}, a + ': '), b)))),
          h('div', { class: 'grid half', style: 'margin-bottom:12px' }, h('div', { class: 'card' }, h('h3', {}, 'Daily waste value by category'), h('div', { class: 'chart', id: 'c1' })), h('div', { class: 'card' }, h('h3', {}, 'Top 10 branches by waste %'), h('div', { class: 'chart', id: 'c2' }))),
          h('div', { class: 'card' }, h('h3', {}, 'Top 10 items by waste value (SAR)'), h('div', { class: 'chart', id: 'c3', style: 'height:340px' })));
        setTimeout(() => {
          dailyStack(el.querySelector('#c1'), c);
          const tb = top.slice(0, 10); LM.chart(el.querySelector('#c2'), { type: 'bar', data: { labels: tb.map((b) => b.name.slice(0, 26)), datasets: [{ data: tb.map((b) => b.pct * 100), backgroundColor: LM.css('--accent') }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: (v) => v + '%' } } } } });
          const ti = c.items.slice(0, 10); LM.chart(el.querySelector('#c3'), { type: 'bar', data: { labels: ti.map((i) => i.name.slice(0, 40)), datasets: [{ data: ti.map((i) => i.value), backgroundColor: LM.css('--accent') }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: (v) => compact(v) } } } } });
        }); return el;
      }

      function branches(ds, c) {
        const cols = [{ k: 'name', label: 'Branch', l: 1, cls: 'wrap' }, { k: 'net', label: 'Net sales', fmt: (v) => (v == null ? '–' : num(v)) }, { k: 'value', label: 'Waste value', fmt: num }, { k: 'pct', label: 'Waste %', fmt: (v) => pc(v) },
          { k: 'vsNet', label: 'vs network', fmt: (v) => (v == null ? '–' : h('span', { class: v >= 2 ? 'down' : v <= 0.5 ? 'up' : '' }, v.toFixed(1) + '×')) },
          ...c.cats.map((k) => ({ k: 'cat_' + k, label: k + ' %', fmt: (v) => pc(v) })), { k: 'netSource', label: 'Net sales from', l: 1, fmt: (v) => v || '–' }];
        const search = h('input', { type: 'search', placeholder: 'Search branch…' }); const tbl = LM.table(cols, c.branches, { sort: 'pct' });
        search.oninput = () => tbl.redraw(c.branches.filter((b) => b.name.toLowerCase().includes(search.value.toLowerCase())));
        return h('div', {}, h('div', { class: 'tools' }, search, h('span', { class: 'sub' }, `Network waste % = ${pc(c.netPct)}. Red = 2× network or more.`), h('button', { class: 'btn small', onclick: () => LM.csv(cols, c.branches, `wastage-branches-${ds.start}.csv`) }, 'Export CSV')), tbl);
      }
      function items(ds, c) {
        const cols = [{ k: 'name', label: 'Item', l: 1, cls: 'wrap' }, { k: 'category', label: 'Category', l: 1 }, { k: 'uom', label: 'Unit', l: 1 }, { k: 'qty', label: 'Quantity', fmt: num2 }, { k: 'value', label: 'Waste value', fmt: num }, { k: 'share', label: 'Share', fmt: pct0 }, { k: 'cum', label: 'Cumulative', fmt: pct0 }, { k: 'nBranches', label: 'Branches', fmt: num }, { k: 'avgPrice', label: 'Avg cost / unit', fmt: num2 }];
        const search = h('input', { type: 'search', placeholder: 'Search item…' }); const cat = h('select', { class: 'sel' }, ['All categories', ...c.cats].map((x) => h('option', {}, x)));
        const tbl = LM.table(cols, c.items, { sort: 'value', limit: 500 });
        const ap = () => tbl.redraw(c.items.filter((i) => i.name.toLowerCase().includes(search.value.toLowerCase()) && (cat.value === 'All categories' || i.category === cat.value))); search.oninput = ap; cat.onchange = ap;
        return h('div', {}, h('div', { class: 'tools' }, search, cat, h('span', { class: 'sub' }, `${num(c.items.length)} items`), h('button', { class: 'btn small', onclick: () => LM.csv(cols, c.items, `wastage-items-${ds.start}.csv`) }, 'Export CSV')), tbl);
      }
      function days(ds, c) {
        const rows = c.days.map((d) => ({ day: d.day, dow: LM.sales.DOW[new Date(d.day + 'T00:00:00Z').getUTCDay()], value: d.value, ...Object.fromEntries(c.cats.map((k) => ['c_' + k, d.byCat[k] || 0])) }));
        const cols = [{ k: 'day', label: 'Date', l: 1 }, { k: 'dow', label: 'Day', l: 1 }, { k: 'value', label: 'Waste value', fmt: num }, ...c.cats.map((k) => ({ k: 'c_' + k, label: k, fmt: num }))];
        const el = h('div', {}, h('div', { class: 'card', style: 'margin-bottom:12px' }, h('div', { class: 'chart', id: 'c1' })), LM.table(cols, rows, { sort: 'day', dir: 1 }));
        setTimeout(() => dailyStack(el.querySelector('#c1'), c)); return el;
      }
      function uploads() {
        return h('div', { class: 'card' }, h('h3', {}, 'Uploaded wastage reports'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Period', 'File', 'Uploaded', 'Lines', ''].map((t) => h('th', { class: 'l' }, t)))),
          h('tbody', {}, sets.map((s) => h('tr', {}, h('td', { class: 'l' }, `${s.start} → ${s.end}`), h('td', { class: 'l' }, s.fileName), h('td', { class: 'l' }, s.uploadedAt.slice(0, 16).replace('T', ' ')), h('td', { class: 'l' }, num(s.lines.length)),
            h('td', {}, h('button', { class: 'btn small danger', onclick: async () => { if (await LM.ask(`Delete the report for ${s.start} → ${s.end}?`)) { await LM.db.del('datasets', s.id); reload(); } } }, 'Delete')))))));
      }
      await reload();
    },
  };
})();
