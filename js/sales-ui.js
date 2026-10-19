/* Sales tab: upload -> review -> store -> dashboards. */
(function () {
  const LM = window.LM; const { h, num, num2, pct, pct0, compact, delta, dayLabel } = LM; const S = LM.sales;
  LM.depts = LM.depts || {};

  LM.depts.sales = {
    id: 'sales', label: 'Sales',
    async mount(panel) {
      let sets = (await LM.db.all('datasets')).filter((d) => d.dept === 'sales').sort((a, b) => (a.start < b.start ? 1 : -1));
      let cur = sets[0] ? sets[0].id : null; let sub = 'Overview';
      const template = async () => ({ ...S.defaultTemplate(), ...((await LM.db.get('templates', 'sales')) || {}) });
      const reload = async () => { sets = (await LM.db.all('datasets')).filter((d) => d.dept === 'sales').sort((a, b) => (a.start < b.start ? 1 : -1)); if (!sets.find((s) => s.id === cur)) cur = sets[0] ? sets[0].id : null; draw(); };

      /* ---------- upload ---------- */
      async function upload(file) {
        let rf;
        try { rf = await LM.readFile(file); } catch (e) { return alert(e.message); }
        const tpl = await template();
        const ov = { sheets: {}, cols: {}, groupAliases: {} };
        const run = () => {
          const r = LM.engine.analyze(rf.wb, S.spec, ov, tpl);
          const ds = S.build(r.sheets, tpl, ov);
          const issues = r.issues.concat(S.checks(r.sheets, ds, { ...tpl, groupAliases: { ...tpl.groupAliases, ...ov.groupAliases } }, sets, rf.hash, S.readSummaryTiles(rf.wb)));
          if (!r.sheets.ty || (r.sheets.ty.blocked && !issues.some((i) => i.level === 'error'))) { /* covered by issues */ }
          const looksSales = !!r.sheets.ty;
          if (!looksSales && !issues.some((i) => i.code === 'sheet-missing' && i.sheet === 'ty')) issues.push({ level: 'error', msg: 'This does not look like a Sales report.' });
          return { r, ds, issues };
        };
        let res = run();
        const info = () => ({
          title: `Review before processing: ${rf.name}`,
          facts: [['Period', res.ds.start ? `${res.ds.start} → ${res.ds.end}` : '–'], ['Daily rows (this year)', num(res.ds.ty.length)], ['Daily rows (last year)', num(res.ds.ly.length)], ['Item rows', num(res.ds.items.length)],
            ['Branches', num(new Set(res.ds.ty.map((x) => S.branchKey(x.store))).size)]],
          issues: res.issues,
          approveLabel: sets.some((s) => s.start === res.ds.start && s.end === res.ds.end) ? 'Approve & replace existing period' : 'Approve & process',
          onFix: (fix, val) => {
            if (fix.type === 'sheet') ov.sheets[fix.key] = val; else if (fix.type === 'col') ov.cols[fix.id] = val; else if (fix.type === 'alias') ov.groupAliases[fix.alt] = val;
            res = run(); dlg.update(info());
          },
          onApprove: async () => {
            const { ds } = res;
            const same = sets.find((s) => s.start === ds.start && s.end === ds.end);
            if (same) { await LM.db.put('history', { ...same, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', same.id); }
            const rec = { id: LM.uid(), dept: 'sales', start: ds.start, end: ds.end, fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), ty: ds.ty, ly: ds.ly, items: ds.items };
            await LM.db.put('datasets', rec);
            const t = { ...tpl, dept: 'sales' };
            t.knownGroups = [...new Set([...(tpl.knownGroups || []), ...ds.items.map((i) => i.group)])];
            t.knownStores = [...new Set([...(tpl.knownStores || []), ...ds.ty.map((x) => S.branchKey(x.store))])];
            t.groupAliases = { ...(tpl.groupAliases || {}), ...ov.groupAliases };
            t.colAliases = { ...(tpl.colAliases || {}) }; Object.entries(ov.cols).forEach(([k, v]) => (t.colAliases[k] = [...new Set([...(t.colAliases[k] || []), v])]));
            t.sheetNames = { ...(tpl.sheetNames || {}) }; Object.entries(ov.sheets).forEach(([k, v]) => (t.sheetNames[k] = [...new Set([...(t.sheetNames[k] || []), v])]));
            await LM.db.put('templates', t);
            cur = rec.id; await reload(); LM.toast(`Sales ${ds.start} → ${ds.end} processed`);
          },
        });
        const dlg = LM.review(info());
      }

      /* ---------- render ---------- */
      const body = h('div');
      function draw() {
        LM.killCharts();
        const picker = LM.filePicker(upload, 'Upload Sales report');
        const periodSel = sets.length ? h('select', { class: 'sel', onchange: (e) => { cur = e.target.value; draw(); } }, sets.map((s) => h('option', { value: s.id, selected: s.id === cur }, `${s.start} → ${s.end}`))) : null;
        panel.replaceChildren(
          h('div', { class: 'head' }, h('h2', {}, 'Sales'), periodSel, h('div', { class: 'spacer' }), picker), body);
        LM.dropZone(panel, upload);
        const ds = sets.find((s) => s.id === cur);
        if (!ds) return body.replaceChildren(h('div', { class: 'empty' }, h('h3', {}, 'No sales report uploaded yet'),
          h('p', { class: 'sub' }, 'Drop the Sales Performance Report (.xlsx) here, or use the Upload button.'),
          h('p', { class: 'sub' }, 'Expected sheets: Data TY (Day, Store, Net sales, Bills), Data LY (same, last year), Data Items (Store, Order type, Item group, Item, Qty, Net sales).')));
        const c = S.compute(ds);
        const tabs = ['Overview', 'Days', 'Branches', 'Item groups', 'Items', 'Heat map', 'Uploads'];
        const st = h('div', { class: 'subtabs' }, tabs.map((t) => h('button', { class: t === sub ? 'on' : '', onclick: () => { sub = t; draw(); } }, t)));
        const v = { Overview: overview, Days: days, Branches: branches, 'Item groups': groups, Items: items, 'Heat map': heat, Uploads: uploads }[sub](ds, c);
        body.replaceChildren(h('div', { class: 'sub', style: 'margin-bottom:8px' }, `Report ${ds.start} → ${ds.end} · ${ds.fileName} · uploaded ${ds.uploadedAt.slice(0, 16).replace('T', ' ')}`), st, v);
      }

      const kpi = (l, v, d) => h('div', { class: 'card kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));

      function overview(ds, c) {
        const k = c.k;
        const trading = c.branches.filter((b) => b.sales > 0);
        const bestDay = [...c.days].sort((a, b) => b.sales - a.sales)[0], worstDay = [...c.days].sort((a, b) => a.sales - b.sales)[0];
        const F = [];
        F.push(['Network', `Net sales SAR ${num(k.sales)}${k.hasLy ? ` vs SAR ${num(k.lySales)} last year (${pct(k.yoy)})` : ''} across ${k.branches} branches${k.hasLy ? ` (${k.lyBranches} last year)` : ''}.`]);
        if (k.lflSales != null) F.push(['Like-for-like', `The ${k.lflCount} branches trading in both years are ${pct(k.lflSales)} on sales and ${pct(k.lflTraffic)} on transactions${k.newBranches.length ? `; ${k.newBranches.length} new branches contribute SAR ${num(k.newSales)}` : ''}.`]);
        if (trading.length) F.push(['Branches', `Top: ${trading[0].name} (SAR ${num(trading[0].sales)}); lowest: ${trading[trading.length - 1].name} (SAR ${num(trading[trading.length - 1].sales)}).${k.noSales.length ? ` No sales this year: ${k.noSales.join(', ')}.` : ''}`]);
        if (bestDay) F.push(['Days', `Best day ${bestDay.dow} ${dayLabel(bestDay.day)} (SAR ${num(bestDay.sales)}); weakest ${worstDay.dow} ${dayLabel(worstDay.day)} (SAR ${num(worstDay.sales)}).`]);
        if (c.groups[0]) F.push(['Products', `${c.groups[0].name} is ${pct0(c.groups[0].share)} of item sales; top item ${c.items[0].name} (${pct0(c.items[0].share)}).`]);
        const el = h('div', {},
          h('div', { class: 'grid kpis' },
            kpi('Net sales', num(k.sales), k.hasLy ? h('span', {}, delta(k.yoy), ' vs LY') : 'SAR'),
            kpi('Last year', k.hasLy ? num(k.lySales) : '–', 'same dates'),
            kpi('Transactions', num(k.bills), k.hasLy ? h('span', {}, delta(k.lyBills ? k.bills / k.lyBills - 1 : null), ' vs LY') : 'bills'),
            kpi('Avg check', num2(k.avg), 'SAR per transaction'),
            kpi('Branches trading', num(k.branches), k.hasLy ? `${k.lyBranches} last year` : ''),
            kpi('Like-for-like sales', k.lflSales == null ? '–' : delta(k.lflSales), `${k.lflCount} branches both years`),
            kpi('Like-for-like traffic', k.lflTraffic == null ? '–' : delta(k.lflTraffic), 'same branches')),
          h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Key findings'), h('ul', { class: 'findings' }, F.map(([a, b]) => h('li', {}, h('b', {}, a + ': '), b)))),
          h('div', { class: 'grid two', style: 'margin-bottom:12px' }, h('div', { class: 'card' }, h('h3', {}, 'Daily net sales'), h('div', { class: 'chart', id: 'c1' })), h('div', { class: 'card' }, h('h3', {}, 'Top 10 branches'), h('div', { class: 'chart', id: 'c2' }))),
          c.groups.length ? h('div', { class: 'card' }, h('h3', {}, 'Item group share of sales'), h('div', { class: 'chart', id: 'c3' })) : null);
        setTimeout(() => { dailyChart(el.querySelector('#c1'), c); topBranches(el.querySelector('#c2'), c); if (c.groups.length) groupChart(el.querySelector('#c3'), c); });
        return el;
      }
      function dailyChart(host, c) {
        const ac = LM.css('--accent'), ly = LM.css('--ly');
        LM.chart(host, { type: 'line', data: { labels: c.days.map((d) => dayLabel(d.day)), datasets: [
          { label: 'This year', data: c.days.map((d) => d.sales), borderColor: ac, backgroundColor: ac, tension: 0, pointRadius: 3 },
          ...(c.k.hasLy ? [{ label: 'Last year', data: c.days.map((d) => (d.ly ? d.ly.sales : null)), borderColor: ly, backgroundColor: ly, borderDash: [5, 4], tension: 0, pointRadius: 2 }] : [])] },
          options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: (v) => compact(v) } } } } });
      }
      function topBranches(host, c) {
        const t = c.branches.filter((b) => b.sales > 0).slice(0, 10);
        LM.chart(host, { type: 'bar', data: { labels: t.map((b) => b.name.slice(0, 26)), datasets: [{ data: t.map((b) => b.sales), backgroundColor: LM.css('--accent') }] },
          options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: (v) => compact(v) } } } } });
      }
      function groupChart(host, c) {
        const g = c.groups.slice(0, 8); const rest = c.groups.slice(8).reduce((s, x) => s + x.sales, 0);
        const pal = LM.palette();
        LM.chart(host, { type: 'bar', data: { labels: [...g.map((x) => x.name), ...(rest ? ['Other'] : [])], datasets: [{ data: [...g.map((x) => x.sales), ...(rest ? [rest] : [])], backgroundColor: pal[0] }] },
          options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => num(i.raw) + ' SAR' } } }, scales: { x: { ticks: { callback: (v) => compact(v) } } } } });
      }

      function days(ds, c) {
        const cols = [{ k: 'day', label: 'Date', l: 1 }, { k: 'dow', label: 'Day', l: 1 }, { k: 'sales', label: 'Net sales', fmt: num }, { k: 'bills', label: 'Transactions', fmt: num }, { k: 'avg', label: 'Avg check', fmt: num2 },
          { k: 'lyDay', label: 'LY date', l: 1 }, { k: 'lySales', label: 'LY sales', fmt: num }, { k: 'lyBills', label: 'LY transactions', fmt: num }, { k: 'yoy', label: 'Sales vs LY', fmt: (v) => delta(v) }, { k: 'trafficYoy', label: 'Traffic vs LY', fmt: (v) => delta(v) }];
        const rows = c.days.map((d) => ({ ...d, lyDay: d.ly ? d.ly.day : null, lySales: d.ly ? d.ly.sales : null, lyBills: d.ly ? d.ly.bills : null }));
        const el = h('div', {}, h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Daily net sales vs last year'), h('div', { class: 'chart', id: 'c1' })), LM.table(cols, rows, { sort: 'day', dir: 1 }));
        setTimeout(() => dailyChart(el.querySelector('#c1'), c)); return el;
      }

      function branches(ds, c) {
        const cols = [{ k: 'rank', label: '#', fmt: (v) => v || '–' }, { k: 'name', label: 'Branch', l: 1, cls: 'wrap' }, { k: 'sales', label: 'Net sales', fmt: num }, { k: 'bills', label: 'Transactions', fmt: num }, { k: 'avg', label: 'Avg check', fmt: num2 },
          { k: 'share', label: 'Share', fmt: pct0 }, { k: 'lySales', label: 'LY sales', fmt: (v) => (v ? num(v) : '–') }, { k: 'yoy', label: 'Sales vs LY', fmt: (v) => delta(v) }, { k: 'trafficYoy', label: 'Traffic vs LY', fmt: (v) => delta(v) },
          { k: 'status', label: 'Status', l: 1, fmt: (v) => h('span', { class: 'pill ' + (v === 'New this year' ? 'new' : /No sales/.test(v) ? 'closed' : '') }, v) }];
        const search = h('input', { type: 'search', placeholder: 'Search branch…' }); const stat = h('select', { class: 'sel' }, ['All statuses', ...new Set(c.branches.map((b) => b.status))].map((x) => h('option', {}, x)));
        let tbl = LM.table(cols, c.branches, { sort: 'rank', dir: 1 });
        const apply = () => { const q = search.value.toLowerCase(); tbl.redraw(c.branches.filter((b) => b.name.toLowerCase().includes(q) && (stat.value === 'All statuses' || b.status === stat.value))); };
        search.oninput = apply; stat.onchange = apply;
        return h('div', {}, h('div', { class: 'tools' }, search, stat, h('button', { class: 'btn small', onclick: () => LM.csv(cols, c.branches, `sales-branches-${ds.start}.csv`) }, 'Export CSV')), tbl);
      }

      function groups(ds, c) {
        if (!c.groups.length) return h('div', { class: 'banner' }, 'This report has no item data.');
        const cols = [{ k: 'name', label: 'Item group', l: 1, cls: 'wrap' }, { k: 'sales', label: 'Net sales', fmt: num }, { k: 'qty', label: 'Quantity', fmt: num }, { k: 'share', label: 'Share', fmt: pct0 }, { k: 'cum', label: 'Cumulative', fmt: pct0 }];
        const el = h('div', {}, h('div', { class: 'card', style: 'margin-bottom:12px' }, h('div', { class: 'chart', id: 'c3' })), LM.table(cols, c.groups, { sort: 'sales' }));
        setTimeout(() => groupChart(el.querySelector('#c3'), c)); return el;
      }
      function items(ds, c) {
        if (!c.items.length) return h('div', { class: 'banner' }, 'This report has no item data.');
        const cols = [{ k: 'name', label: 'Item', l: 1, cls: 'wrap' }, { k: 'group', label: 'Group', l: 1 }, { k: 'sales', label: 'Net sales', fmt: num }, { k: 'qty', label: 'Quantity', fmt: num }, { k: 'share', label: 'Share', fmt: pct0 }, { k: 'cum', label: 'Cumulative', fmt: pct0 }];
        const search = h('input', { type: 'search', placeholder: 'Search item…' }); const tbl = LM.table(cols, c.items, { sort: 'sales' });
        search.oninput = () => tbl.redraw(c.items.filter((i) => i.name.toLowerCase().includes(search.value.toLowerCase()) || i.group.toLowerCase().includes(search.value.toLowerCase())));
        return h('div', {}, h('div', { class: 'tools' }, search, h('span', { class: 'sub' }, `${num(c.items.length)} items`), h('button', { class: 'btn small', onclick: () => LM.csv(cols, c.items, `sales-items-${ds.start}.csv`) }, 'Export CSV')), tbl);
      }

      function heat(ds, c) {
        const dl = c.days.map((d) => d.day);
        const rows = c.branches.filter((b) => b.sales > 0 || b.lySales > 0);
        const head = h('tr', {}, h('th', { class: 'l' }, 'Branch'), dl.map((d) => h('th', {}, dayLabel(d))), h('th', {}, 'Total'));
        const trs = rows.map((b) => { const mx = Math.max(...dl.map((d) => b.days[d] || 0), 1);
          return h('tr', {}, h('td', { class: 'l' }, b.name), dl.map((d) => { const v = b.days[d] || 0; return v ? h('td', { style: `background:color-mix(in srgb, var(--accent) ${Math.round((v / mx) * 70)}%, transparent)` }, num(v)) : h('td', { class: 'z' }, '0'); }), h('td', {}, num(b.sales))); });
        return h('div', {}, h('div', { class: 'sub', style: 'margin-bottom:6px' }, 'Net sales per branch per day. Darker = closer to that branch’s best day; tan cells = no sales recorded.'),
          h('div', { class: 'tscroll' }, h('table', { class: 't heat' }, h('thead', {}, head), h('tbody', {}, trs))));
      }

      function uploads() {
        return h('div', { class: 'card' }, h('h3', {}, 'Uploaded sales reports'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Period', 'File', 'Uploaded', 'Rows', ''].map((t) => h('th', { class: 'l' }, t)))),
          h('tbody', {}, sets.map((s) => h('tr', {}, h('td', { class: 'l' }, `${s.start} → ${s.end}`), h('td', { class: 'l' }, s.fileName), h('td', { class: 'l' }, s.uploadedAt.slice(0, 16).replace('T', ' ')), h('td', { class: 'l' }, `${s.ty.length} / ${s.ly.length} / ${s.items.length}`),
            h('td', {}, h('button', { class: 'btn small danger', onclick: async () => { if (confirm(`Delete the report for ${s.start} → ${s.end}?`)) { await LM.db.del('datasets', s.id); reload(); } } }, 'Delete')))))));
      }

      draw();
    },
  };
})();
