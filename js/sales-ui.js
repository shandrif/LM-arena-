/* Sales tab: upload -> review -> store -> dashboards. */
(function () {
  const LM = window.LM; const { h, num, num2, pct, pct0, compact, delta, dayLabel } = LM; const S = LM.sales;
  LM.depts = LM.depts || {};

  LM.depts.sales = {
    id: 'sales', label: 'Sales',
    async mount(panel) {
      const isAgg = (d) => d.type === 'aggregator';
      let sets = (await LM.db.all('datasets')).filter((d) => d.dept === 'sales' && !isAgg(d)).sort((a, b) => (a.start < b.start ? 1 : -1));
      let aggs = (await LM.db.all('datasets')).filter((d) => d.dept === 'sales' && isAgg(d)).sort((a, b) => (a.end < b.end ? 1 : -1)); let curAgg = aggs[0] ? aggs[0].id : null;
      let cur = sets[0] ? sets[0].id : null; let sub = sets[0] || !aggs[0] ? 'Days' : 'Sales by aggregators';
      const template = async () => ({ ...S.defaultTemplate(), ...((await LM.db.get('templates', 'sales')) || {}) });
      let hc = null; // headcount per store of the open week (optional)
      let allSales = []; // sales reports of every loaded week (a week only lists its own), for the Mugs “since previous upload” tile
      let ms = null, msWeek = null, msPrev = null; // mug stock: shown file, this week's own file, the file before the shown one
      const wkOf = (d) => d.week || d.end || '';
      const loadMs = async () => { const all = (await (LM.dbRaw || LM.db).all('datasets')).filter((d) => d && d.dept === 'mugstock').sort((a, b) => (wkOf(a) < wkOf(b) ? 1 : wkOf(a) > wkOf(b) ? -1 : (a.uploadedAt < b.uploadedAt ? 1 : -1)));
        msWeek = (await LM.db.all('datasets')).find((d) => d.dept === 'mugstock') || null; const sel = (LM.week && LM.week.selected) || '9999';
        ms = msWeek || null; void all; void sel; msPrev = ms ? all.find((d) => d.id !== ms.id && wkOf(d) < wkOf(ms)) || null : null; };
      const loadHc = async () => { await loadMs(); allSales = (await (LM.dbRaw || LM.db).all('datasets')).filter((d) => d && d.dept === 'sales'); hc = (await LM.db.all('datasets')).filter((d) => d.dept === 'headcount').sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : (a.uploadedAt < b.uploadedAt ? 1 : -1)))[0] || null; };
      const reload = async () => { const allS = (await LM.db.all('datasets')).filter((d) => d.dept === 'sales'); sets = allS.filter((d) => !isAgg(d)).sort((a, b) => (a.start < b.start ? 1 : -1)); aggs = allS.filter(isAgg).sort((a, b) => (a.end < b.end ? 1 : -1)); if (!aggs.find((x) => x.id === curAgg)) curAgg = aggs[0] ? aggs[0].id : null; await loadDay(); await loadHc(); if (!sets.find((s) => s.id === cur)) cur = sets[0] ? sets[0].id : null; draw(); };

      /* ---------- upload ---------- */
      async function upload(file) {
        let rf;
        try { rf = await LM.readFile(file); } catch (e) { return LM.say(e.message); }
        if (LM.aggregator.detect(rf.wb)) return uploadAgg(rf);
        if (LM.mugdaily && LM.mugdaily.detect(rf.wb)) return LM.say('This is the mugs-sold report. Upload it in Sales → Mugs (button “Upload mugs sales file”).');
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

      /* ---------- aggregator report (Sales by aggregators) ---------- */
      function uploadAgg(rf) {
        const res = LM.aggregator.parse(rf.wb, rf.name, aggs, rf.hash); const ds = res.ds;
        const info = () => ({ title: `Review before processing: ${rf.name}`, facts: ds ? [['Report', 'Sales by aggregators'], ['Period', ds.start ? `${ds.start} → ${ds.end}` : '–'], ['Stores', num(new Set(ds.rows.map((r) => r.store)).size)], ['Aggregators', [...new Set(ds.rows.map((r) => r.source))].join(', ')], ['Orders', num(ds.totals.orders)], [`Value (${ds.currency})`, num(Math.round(ds.totals.value))]] : [['Report', 'Not recognised']], issues: res.issues,
          approveLabel: ds && aggs.some((s) => s.start === ds.start && s.end === ds.end) ? 'Approve & replace existing period' : 'Approve & process', onCancel: () => {},
          onApprove: async () => { if (!ds || res.issues.some((i) => i.level === 'error')) throw new Error('Fix the errors first.'); const same = aggs.find((s) => s.start === ds.start && s.end === ds.end); if (same) { await LM.db.put('history', { ...same, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', same.id); }
            const rec = { id: LM.uid(), dept: 'sales', type: 'aggregator', fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), ...ds }; await LM.db.put('datasets', rec); curAgg = rec.id; sub = 'Sales by aggregators'; await reload(); LM.toast(`Sales by aggregators ${ds.start} → ${ds.end} processed`); } });
        LM.review(info());
      }
      /* ---------- mug sales by day (Sales By Product export) ---------- */
      const mugsT = LM.mugsTab.create({ draw: () => draw() });
      let mugDay = null;
      async function skipMug(list) { const tp = { ...S.defaultTemplate(), ...((await LM.db.get('templates', 'sales')) || {}) }; tp.mugSkip = list; await LM.db.put('templates', tp); LM.mugstock.setSkip(list); draw(); }
      let mugLinks = {}; async function linkMug(name, key, quiet) { if (name == null) { draw(); return; } const tp = { ...S.defaultTemplate(), ...((await LM.db.get('templates', 'sales')) || {}) }; tp.mugLinks = { ...(tp.mugLinks || {}) }; if (key) tp.mugLinks[LM.norm(name)] = key; else delete tp.mugLinks[LM.norm(name)]; await LM.db.put('templates', tp); mugLinks = tp.mugLinks; if (!quiet) draw(); }
      const loadDay = async () => { await mugsT.load(); { const tp0 = (await LM.db.get('templates', 'sales')) || {}; mugLinks = tp0.mugLinks || {}; LM.mugstock.setSkip(tp0.mugSkip || []); } mugDay = (await LM.db.all('datasets')).find((d) => d.dept === 'sales' && d.type === 'mugdaily') || null; };
      function uploadDaily(rf) {
        const same = mugDay ? [mugDay] : []; const res = LM.mugdaily.parse(rf.wb, rf.name, same, rf.hash); const ds = res.ds; const T = ds ? LM.mugdaily.compute(ds) : null;
        const own = (sets.find((x) => x.id === cur) || null); if (ds && own && own.items) { const fl = {}; const mo = LM.mugstock.mugOf; own.items.forEach((r) => { if (!/mug/i.test(r.item) || /repeated|refill|non\s*hm/i.test(r.item)) return; const m = mo(r.item); const k = m && !m.unknown ? m.name : String(r.item).split(/[\\/]/)[0].trim(); fl[k] = (fl[k] || 0) + (r.qty || 0); }); const diff = T.list.map((x) => ({ n: x.name, a: x.qty, b: fl[x.name] || 0 })).filter((x) => Math.abs(x.a - x.b) > 0); const tf = Object.values(fl).reduce((a, b) => a + b, 0); if (own.start === ds.start && own.end === ds.end) res.issues.push({ level: diff.length ? 'info' : 'info', msg: `Compared with the sales report of the same week: this file has ${T.total.toLocaleString()} mugs, the sales report ${Math.round(tf).toLocaleString()}${diff.length ? '. Differences: ' + diff.slice(0, 5).map((x) => `${x.n} ${x.a} vs ${x.b}`).join('; ') + (diff.length > 5 ? '…' : '') : ' (same for every mug)'}.` }); }
        const info = () => ({ title: `Review before processing: ${rf.name}`, facts: ds ? [['Report', 'Mugs sold by day'], ['Period', `${ds.start} → ${ds.end}`], ['Mugs counted', num(T.total)], ['Net sales (SAR)', num(Math.round(T.totalSales))], ['Mug types', num(T.list.length)]] : [['Report', 'Not recognised']], issues: res.issues, approveLabel: mugDay && ds && mugDay.start === ds.start && mugDay.end === ds.end ? 'Approve & replace existing' : 'Approve & process', onCancel: () => {},
          onApprove: async () => { if (!ds || res.issues.some((i) => i.level === 'error')) throw new Error('Fix the errors first.'); if (mugDay) { await LM.db.put('history', { ...mugDay, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', mugDay.id); }
            const rec = { id: LM.uid(), dept: 'sales', type: 'mugdaily', fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), ...ds }; await LM.db.put('datasets', rec); sub = 'Mugs'; await reload(); LM.toast('Mug sales by day processed'); } });
        LM.review(info());
      }
      function aggView() {
        const a = aggs.find((s) => s.id === curAgg); if (!a) return h('div', { class: 'empty' }, h('h3', {}, 'No aggregator report uploaded yet'), h('p', { class: 'sub' }, 'Upload the Aggregator Report (.xlsx): Store, Delivery source, Payment type, Bills, Gross sales.'));
        const prev = aggs.find((s) => s.end < a.end);
        return h('div', {}, aggs.length > 1 ? h('div', { class: 'tools' }, h('select', { class: 'sel', onchange: (e) => { curAgg = e.target.value; draw(); } }, aggs.map((s) => h('option', { value: s.id, selected: s.id === curAgg }, `${s.start} → ${s.end}`)))) : null,
          LM.aggregator.view(a, prev, async () => { if (await LM.ask(`Delete the aggregator report for ${a.start} → ${a.end}?`)) { await LM.db.del('datasets', a.id); reload(); } }));
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
        if (!ds) { const avail = ['Sales report', 'Mugs', ...(aggs.length ? ['Sales by aggregators'] : [])]; if (!avail.includes(sub)) sub = aggs.length && sub === 'Sales by aggregators' ? sub : 'Sales report'; if (sub !== 'Sales report') { const stb = h('div', { class: 'subtabs' }, avail.map((x) => h('button', { class: x === sub ? 'on' : '', onclick: () => { sub = x; draw(); } }, x))); return body.replaceChildren(stb, sub === 'Mugs' ? mugs() : aggView()); } }
        if (!ds) return body.replaceChildren(h('div', { class: 'subtabs' }, ['Sales report', 'Mugs', ...(aggs.length ? ['Sales by aggregators'] : [])].map((x) => h('button', { class: x === sub ? 'on' : '', onclick: () => { sub = x; draw(); } }, x))), h('div', { class: 'empty' }, h('h3', {}, 'No sales report uploaded yet'),
          h('p', { class: 'sub' }, 'Drop the Sales Performance Report (.xlsx) here, or use the Upload button.'),
          h('p', { class: 'sub' }, 'Expected sheets: Data TY (Day, Store, Net sales, Bills), Data LY (same, last year), Data Items (Store, Order type, Item group, Item, Qty, Net sales).')));
        const c = S.compute(ds);
        const tabs = ['Days', 'Branches', 'Item groups', 'Items', 'Heat map', 'Mugs', 'Sales by aggregators', 'Uploads'];
        const st = h('div', { class: 'subtabs' }, tabs.map((t) => h('button', { class: t === sub ? 'on' : '', onclick: () => { sub = t; draw(); } }, t)));
        const v = { Overview: overview, Days: days, Branches: branches, 'Item groups': groups, Items: items, 'Heat map': heat, Mugs: mugs, 'Sales by aggregators': aggView, Uploads: uploads }[sub](ds, c);
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
            kpi('Net sales', num(k.sales), k.hasLy ? h('span', {}, `LY ${num(k.lySales)} · `, delta(k.yoy)) : 'SAR'),
            kpi('Transactions', num(k.bills), k.hasLy ? h('span', {}, `LY ${num(k.lyBills)} · `, delta(k.billsYoy)) : 'bills'),
            kpi('Avg check', num2(k.avg), k.hasLy && k.lyAvg ? h('span', {}, `LY ${num2(k.lyAvg)} · `, delta(k.avgYoy)) : 'SAR per transaction'),
            kpi('Branches trading', num(k.branches), k.hasLy ? `${k.lyBranches} last year` : ''),
            kpi('Like-for-like sales', k.lflSales == null ? '–' : delta(k.lflSales), `${k.lflCount} branches both years`),
            kpi('Like-for-like traffic', k.lflTraffic == null ? '–' : delta(k.lflTraffic), 'same branches')),
          h('div', { class: 'grid two', style: 'margin-bottom:0;align-items:start' }, k.hasLy ? compareCard(c) : h('div', { class: 'banner', style: 'margin-bottom:12px' }, 'This report has no last-year data, so no year-on-year comparison can be shown.'), storeAvgCard(c)),
          weekdayStoreCard(c),
          h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Key findings'), h('ul', { class: 'findings' }, F.map(([a, b]) => h('li', {}, h('b', {}, a + ': '), b)))),
          h('div', { class: 'grid two', style: 'margin-bottom:12px' }, chartCard('Daily net sales: this year vs last year', 'c1'), chartCard('Daily transactions: this year vs last year', 'c4')),
          h('div', { class: 'grid two', style: 'margin-bottom:12px' }, chartCard('Daily average check: this year vs last year', 'c5'), chartCard('Average sales by weekday: this year vs last year', 'c6')),
          h('div', { class: 'grid two', style: 'margin-bottom:12px' }, chartCard('Top 10 branches: net sales this year vs last year', 'c2'), chartCard('Top 10 branches: average check this year vs last year', 'c7')),
          c.groups.length ? h('div', { class: 'card' }, h('h3', {}, 'Item group share of sales'), h('div', { class: 'chart', id: 'c3' })) : null);
        setTimeout(() => { dailyChart(el.querySelector('#c1'), c); topBranches(el.querySelector('#c2'), c); if (c.groups.length) groupChart(el.querySelector('#c3'), c); dailyMetric(el.querySelector('#c4'), c, 'bills', 'lyBills', 'Transactions'); dailyMetric(el.querySelector('#c5'), c, 'avg', 'lyAvg', 'Average check'); weekdayChart(el.querySelector('#c6'), c); topBranchAvg(el.querySelector('#c7'), c); });
        return el;
      }
      const chartCard = (t, id) => h('div', { class: 'card' }, h('h3', {}, t), h('div', { class: 'chart', id }));
      const ty$ = () => LM.css('--accent'), ly$ = () => LM.css('--ly');
      const diff = (a, b, f = num) => (a == null || b == null ? '–' : `${a - b > 0 ? '+' : ''}${f(a - b)}`);
      let wdView = 'ty';
      function storeAvgCard(c) {
        const hasLy = c.k.hasLy; const rows = c.stores.filter((x) => x.ty.n || x.ly.n);
        const cell = (v) => (v == null ? '–' : num(v));
        const staff = hc ? Object.fromEntries(hc.data.rows.map((r) => [r.key, r.total])) : null; // staff per store, from the headcount file
        const withStaff = staff ? rows.filter((x) => staff[x.key] > 0 && x.ty.avg != null) : []; const netProd = withStaff.length ? withStaff.reduce((t, x) => t + x.ty.avg, 0) / withStaff.reduce((t, x) => t + staff[x.key], 0) : null; // network = sum of the stores’ daily averages ÷ their staff
        const body = rows.map((x) => { const st = staff ? staff[x.key] : null; const prod = st > 0 && x.ty.avg != null ? x.ty.avg / st : null;
          return h('tr', {}, h('td', { class: 'l' }, x.name), h('td', {}, cell(x.ty.avg)), ...(hasLy ? [h('td', {}, x.ly.n ? cell(x.ly.avg) : (x.ty.n ? 'new' : '–')), h('td', {}, x.yoy == null ? '–' : delta(x.yoy))] : []),
            ...(staff ? [h('td', {}, st > 0 ? num(st) : '–'), h('td', { style: 'font-weight:700' }, prod == null ? '–' : num(prod)), h('td', {}, prod != null && netProd ? delta(prod / netProd - 1) : '–')] : [])); });
        const nt = c.net.ty, nl = c.net.ly;
        const foot = h('tr', { style: 'font-weight:700' }, h('td', { class: 'l' }, 'All stores (network sales ÷ days)'), h('td', {}, cell(nt.avg)), ...(hasLy ? [h('td', {}, nl.n ? cell(nl.avg) : '–'), h('td', {}, nt.avg && nl.avg ? delta(nt.avg / nl.avg - 1) : '–')] : []),
          ...(staff ? [h('td', { title: `${withStaff.length} of ${rows.length} stores have a headcount` }, num(withStaff.reduce((t, x) => t + staff[x.key], 0))), h('td', { title: `Stores with a headcount: their average daily sales added up ÷ their staff added up` }, netProd == null ? '–' : num(netProd)), h('td', {}, '–')] : []));
        const ly = c.k.hasLy ? `${c.stores.length ? '' : ''}Last year covers the same dates (one year earlier).` : '';
        const heads = ['Store', 'This year', ...(hasLy ? ['Last year', 'Change %'] : []), ...(staff ? ['Staff', 'Staff productivity', 'vs network'] : [])];
        const ds = sets.find((x) => x.id === cur); const pick = LM.filePicker((f) => LM.headcount.upload(f, { ds, existing: hc, done: reload }), hc ? 'Replace headcount' : 'Upload headcount', false, '.xlsx,.xls,.xlsm');
        return h('div', { class: 'card', style: 'margin-bottom:12px' }, h('div', { class: 'tools' }, h('h3', { style: 'margin:0' }, 'Average daily sales by store (SAR)'), h('div', { class: 'spacer' }), hc ? h('span', { class: 'sub' }, `Headcount ${hc.data.period || hc.end} · ${hc.fileName}`) : null, pick, hc ? h('button', { class: 'btn small danger', onclick: async () => { if (await LM.ask('Remove the headcount of this week? Staff productivity will no longer be shown.')) { await LM.db.del('datasets', hc.id); reload(); } } }, 'Remove') : null),
          h('div', { style: 'max-height:380px;overflow:auto' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, heads.map((t, i) => h('th', { class: i ? '' : 'l', title: t === 'Staff productivity' ? 'Average daily sales ÷ staff, in SAR per staff member per day' : '' }, t, t === 'Staff productivity' ? h('div', { class: 'sub', style: 'font-weight:400' }, 'SAR / staff / day') : null)))), h('tbody', {}, body, foot))),
          h('div', { class: 'sub', style: 'margin-top:6px' }, `Average of the days with sales. ${ly}`, staff ? ` Staff productivity = the store’s average daily sales ÷ its headcount (all roles); “–” where the headcount file has no match for the store. vs network compares with ${netProd == null ? '–' : num(netProd)} SAR per staff per day (${withStaff.length} stores with a headcount).` : ' Upload the weekly headcount file to add staff and staff productivity per store.'));
      }
      function weekdayStoreCard(c) {
        const W = c.WEEK; const key = wdView; const hasLy = c.k.hasLy; const rows = [{ name: 'All stores', p: c.net[key], net: true }, ...c.stores.map((x) => ({ name: x.name, p: x[key] }))].filter((r) => r.p.n);
        const tone = (v, lo, hi) => (v == null || hi === lo ? '' : v === hi ? 'background:var(--ok-bg,#e6f4ea)' : v === lo ? 'background:var(--bad-bg,#fdecea)' : '');
        const body = rows.map((r) => { const vals = W.map((w) => r.p.dow[w].avg).filter((v) => v != null); const lo = Math.min(...vals), hi = Math.max(...vals); return h('tr', { style: r.net ? 'font-weight:700' : '' }, h('td', { class: 'l' }, r.name), ...W.map((w) => h('td', { style: tone(r.p.dow[w].avg, lo, hi), title: `${r.p.dow[w].n} ${w}day(s)` }, r.p.dow[w].avg == null ? '–' : num(r.p.dow[w].avg))), h('td', {}, num(r.p.avg))); });
        const btn = (k, l) => h('button', { class: 'btn small' + (wdView === k ? ' primary' : ''), onclick: () => { wdView = k; draw(); } }, l);
        return h('div', { class: 'card', style: 'margin-bottom:12px' }, h('div', { class: 'tools' }, h('h3', { style: 'margin:0' }, `Average daily sales by weekday and store (SAR) · ${key === 'ty' ? 'this year' : 'last year'}`), h('div', { class: 'spacer' }), btn('ty', 'This year'), hasLy ? btn('ly', 'Last year') : null),
          h('div', { style: 'overflow:auto' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Store', ...W, 'All days'].map((t, i) => h('th', { class: i ? '' : 'l' }, t)))), h('tbody', {}, body))),
          h('div', { class: 'sub', style: 'margin-top:6px' }, 'Each cell = total sales on that weekday ÷ number of that weekday the store traded (hover for the count). Green = best weekday, red = weakest, per store. Zero-sales days are not counted.'));
      }
      let dayView = 'ty';
      /* every store against every calendar date: that day's net sales, plus the store's average per trading day */
      function dayStoreCard(c) {
        const hasLy = c.k.hasLy; const key = hasLy ? dayView : 'ty'; const dates = c.days.map((d) => d.day); const cols = key === 'ty' ? dates : dates.map((d) => S.addYears(d, -1));
        const wd = (d) => S.DOW[new Date(d + 'T00:00:00Z').getUTCDay()];
        const rows = [{ name: 'All stores', net: true, get: (d) => (key === 'ty' ? (c.days.find((x) => x.day === d) || {}).sales : (c.lyDays.find((x) => x.day === d) || {}).sales), avg: c.net[key].avg },
          ...c.stores.map((st) => { const b = c.branches.find((x) => x.key === st.key); return { name: st.name, get: (d) => (key === 'ty' ? b.days[d] : b.lyDayMap[d]), avg: st[key].avg }; })].filter((r) => r.avg != null);
        const tone = (v, lo, hi) => (v == null || !(v > 0) || hi === lo ? '' : v === hi ? 'background:var(--good-bg)' : v === lo ? 'background:var(--bad-bg)' : '');
        const body = rows.map((r) => { const vals = cols.map((d) => r.get(d)).filter((v) => v > 0); const lo = Math.min(...vals), hi = Math.max(...vals);
          return h('tr', { style: r.net ? 'font-weight:700' : '' }, h('td', { class: 'l', style: 'position:sticky;left:0;background:var(--surface);white-space:nowrap' }, r.name), ...cols.map((d) => { const v = r.get(d); return h('td', { style: tone(v, lo, hi) }, v > 0 ? num(v) : '–'); }), h('td', { style: 'font-weight:700' }, num(r.avg))); });
        const btn = (k, l) => h('button', { class: 'btn small' + (dayView === k ? ' primary' : ''), onclick: () => { dayView = k; draw(); } }, l);
        const csvCols = [{ k: 'name', label: 'Store' }, ...cols.map((d, i) => ({ k: 'd' + i, label: d })), { k: 'avg', label: 'Average per trading day' }]; const csvRows = rows.map((r) => ({ name: r.name, ...Object.fromEntries(cols.map((d, i) => ['d' + i, r.get(d) > 0 ? Math.round(r.get(d) * 100) / 100 : ''])), avg: Math.round(r.avg * 100) / 100 }));
        return h('div', { class: 'card', style: 'margin-bottom:12px' }, h('div', { class: 'tools' }, h('h3', { style: 'margin:0' }, `Daily sales by store and date (SAR) · ${key === 'ty' ? 'this year' : 'last year'}`), h('div', { class: 'spacer' }), btn('ty', 'This year'), hasLy ? btn('ly', 'Last year') : null, h('button', { class: 'btn small', onclick: () => LM.csv(csvCols, csvRows, `daily-sales-by-store-${key}.csv`) }, 'Export CSV')),
          h('div', { style: 'overflow:auto;max-height:560px' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', { class: 'l', style: 'position:sticky;left:0;background:var(--surface)' }, 'Store'), ...cols.map((d) => h('th', { title: `${wd(d)} ${dayLabel(d)}`, style: 'white-space:nowrap;line-height:1.2' }, wd(d), h('br'), dayLabel(d))), h('th', {}, 'Avg / day'))), h('tbody', {}, body))),
          h('div', { class: 'sub', style: 'margin-top:6px' }, `Each cell = the store’s net sales on that date. “Avg / day” = its average over the days it had sales (zero-sales days are left out and shown as –). Green = best day, red = weakest day, per store.${key === 'ly' ? ' Last year shows the same calendar dates one year earlier.' : ''}`));
      }
      /* “Average daily sales per store” counts every store once for each day it had sales */
      function compareCard(c) {
        const k = c.k; const sd = { ty: { n: 0, sales: 0 }, ly: { n: 0, sales: 0 } }; c.stores.forEach((x) => { ['ty', 'ly'].forEach((y) => { sd[y].n += x[y].n; sd[y].sales += x[y].sales; }); }); const nd = k.matchedDays || 1; const partial = k.matchedDays < k.totalDays;
        const rows = [['Net sales (SAR)', k.sales, k.lySales, num], ['Transactions', k.bills, k.lyBills, num], ['Average check (SAR)', k.avg, k.lyAvg, num2], ['Branches trading', k.branches, k.lyBranches, num], ['Average sales per branch (SAR)', k.branches ? k.sales / k.branches : null, k.lyBranches ? k.lySales / k.lyBranches : null, num], ['Average daily sales (SAR)', c.days.length ? k.sales / c.days.length : null, c.lyDays.length ? k.lySales / c.lyDays.length : null, num], ['Average daily sales per store (SAR)', sd.ty.n ? sd.ty.sales / sd.ty.n : null, sd.ly.n ? sd.ly.sales / sd.ly.n : null, num], ['Average daily transactions', c.days.length ? k.bills / c.days.length : null, c.lyDays.length ? k.lyBills / c.lyDays.length : null, num]];
        return h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'This year vs last year'),
          h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Metric', 'This year', 'Last year', 'Change', 'Change %'].map((t, i) => h('th', { class: i ? '' : 'l' }, t)))),
            h('tbody', {}, rows.map(([l, a, b, f]) => h('tr', {}, h('td', { class: 'l' }, l), h('td', {}, a == null ? '–' : f(a)), h('td', {}, b == null ? '–' : f(b)), h('td', {}, diff(a, b, f)), h('td', {}, a != null && b ? delta(a / b - 1) : '–'))))),
          sd.ty.n ? h('div', { class: 'sub', style: 'margin-top:6px' }, `Average daily sales per store = net sales of all stores ÷ store-days with sales (a store counts once for each day it sold; days without sales are left out). This year: SAR ${num(sd.ty.sales)} ÷ ${num(sd.ty.n)} store-days = SAR ${num(sd.ty.sales / sd.ty.n)}${sd.ly.n ? `. Last year (same dates): SAR ${num(sd.ly.sales)} ÷ ${num(sd.ly.n)} = SAR ${num(sd.ly.sales / sd.ly.n)}` : ''}.`) : null,
          partial ? h('div', { class: 'sub', style: 'margin-top:6px' }, `Last-year data matches only ${k.matchedDays} of ${k.totalDays} days; on those matched days sales are ${k.mLySales ? delta(k.mSales / k.mLySales - 1) : '–'} and transactions ${k.mLyBills ? delta(k.mBills / k.mLyBills - 1) : '–'}.`) : null);
      }
      function dailyChart(host, c) { dailyMetric(host, c, 'sales', 'sales', 'Net sales'); }
      function dailyMetric(host, c, key, lyKey, name) {
        const lyv = (d) => (d.ly ? (lyKey === 'sales' ? d.ly.sales : lyKey === 'lyBills' ? d.ly.bills : d.lyAvg) : null); const fmt = key === 'avg' ? num2 : compact;
        LM.chart(host, { type: 'line', data: { labels: c.days.map((d) => dayLabel(d.day)), datasets: [
          { label: 'This year', data: c.days.map((d) => d[key]), borderColor: ty$(), backgroundColor: ty$(), tension: 0, pointRadius: 3 },
          ...(c.k.hasLy ? [{ label: 'Last year', data: c.days.map(lyv), borderColor: ly$(), backgroundColor: ly$(), borderDash: [5, 4], tension: 0, pointRadius: 2 }] : [])] },
          options: { plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (i) => `${i.dataset.label}: ${key === 'avg' ? num2(i.raw) : num(i.raw)}` } } }, scales: { y: { ticks: { callback: (v) => fmt(v) } } } } });
      }
      function weekdayChart(host, c) {
        if (!c.dow.length) return host.replaceChildren(h('span', { class: 'sub' }, 'No matching last-year days.'));
        LM.chart(host, { type: 'bar', data: { labels: c.dow.map((w) => w.name), datasets: [{ label: 'This year', data: c.dow.map((w) => w.sales / w.n), backgroundColor: ty$() }, { label: 'Last year', data: c.dow.map((w) => w.lySales / w.n), backgroundColor: ly$() }] }, options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: (v) => compact(v) } } } } });
      }
      function topBranches(host, c) {
        const t = c.branches.filter((b) => b.sales > 0).slice(0, 10);
        LM.chart(host, { type: 'bar', data: { labels: t.map((b) => b.name.slice(0, 26)), datasets: [{ label: 'This year', data: t.map((b) => b.sales), backgroundColor: ty$() }, ...(c.k.hasLy ? [{ label: 'Last year', data: t.map((b) => b.lySales || null), backgroundColor: ly$() }] : [])] },
          options: { indexAxis: 'y', plugins: { legend: { position: 'bottom' } }, scales: { x: { ticks: { callback: (v) => compact(v) } } } } });
      }
      function topBranchAvg(host, c) {
        const t = c.branches.filter((b) => b.sales > 0).slice(0, 10);
        LM.chart(host, { type: 'bar', data: { labels: t.map((b) => b.name.slice(0, 26)), datasets: [{ label: 'This year', data: t.map((b) => b.avg), backgroundColor: ty$() }, ...(c.k.hasLy ? [{ label: 'Last year', data: t.map((b) => b.lyAvg), backgroundColor: ly$() }] : [])] },
          options: { indexAxis: 'y', plugins: { legend: { position: 'bottom' } } } });
      }
      function groupChart(host, c) {
        const g = c.groups.slice(0, 8); const rest = c.groups.slice(8).reduce((s, x) => s + x.sales, 0);
        const pal = LM.palette();
        LM.chart(host, { type: 'bar', data: { labels: [...g.map((x) => x.name), ...(rest ? ['Other'] : [])], datasets: [{ data: [...g.map((x) => x.sales), ...(rest ? [rest] : [])], backgroundColor: pal[0] }] },
          options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => num(i.raw) + ' SAR' } } }, scales: { x: { ticks: { callback: (v) => compact(v) } } } } });
      }

      function days(ds, c) {
        const cols = [{ k: 'day', label: 'Date', l: 1 }, { k: 'dow', label: 'Day', l: 1 }, { k: 'sales', label: 'Net sales', fmt: num }, { k: 'bills', label: 'Transactions', fmt: num }, { k: 'avg', label: 'Avg check', fmt: num2 },
          { k: 'lyDay', label: 'LY date', l: 1 }, { k: 'lySales', label: 'LY sales', fmt: num }, { k: 'lyBills', label: 'LY transactions', fmt: num }, { k: 'yoy', label: 'Sales vs LY', fmt: (v) => delta(v) }, { k: 'trafficYoy', label: 'Traffic vs LY', fmt: (v) => delta(v) }, { k: 'lyAvg', label: 'LY avg check', fmt: (v) => (v == null ? '–' : num2(v)) }, { k: 'avgYoy', label: 'Avg check vs LY', fmt: (v) => delta(v) }];
        const k0 = c.k.hasLy;
        const rows = c.days.map((d) => ({ ...d, lyDay: d.ly ? d.ly.day : null, lySales: d.ly ? d.ly.sales : null, lyBills: d.ly ? d.ly.bills : null }));
        const el = h('div', {}, h('div', { class: 'grid two', style: 'margin-bottom:0;align-items:start' }, k0 ? compareCard(c) : null, storeAvgCard(c)), weekdayStoreCard(c), dayStoreCard(c), h('div', { class: 'grid two', style: 'margin-bottom:12px' }, chartCard('Daily net sales vs last year', 'c1'), chartCard('Daily transactions vs last year', 'c4')), h('div', { class: 'grid two', style: 'margin-bottom:12px' }, chartCard('Daily average check vs last year', 'c5'), chartCard('Average sales by weekday vs last year', 'c6')), LM.table(cols, rows, { sort: 'day', dir: 1 }));
        setTimeout(() => { dailyChart(el.querySelector('#c1'), c); dailyMetric(el.querySelector('#c4'), c, 'bills', 'lyBills', 'Transactions'); dailyMetric(el.querySelector('#c5'), c, 'avg', 'lyAvg', 'Average check'); weekdayChart(el.querySelector('#c6'), c); }); return el;
      }

      function branches(ds, c) {
        const cols = [{ k: 'rank', label: '#', fmt: (v) => v || '–' }, { k: 'name', label: 'Branch', l: 1, cls: 'wrap' }, { k: 'sales', label: 'Net sales', fmt: num }, { k: 'bills', label: 'Transactions', fmt: num }, { k: 'avg', label: 'Avg check', fmt: num2 },
          { k: 'share', label: 'Share', fmt: pct0 }, { k: 'lySales', label: 'LY sales', fmt: (v) => (v ? num(v) : '–') }, { k: 'yoy', label: 'Sales vs LY', fmt: (v) => delta(v) }, { k: 'trafficYoy', label: 'Traffic vs LY', fmt: (v) => delta(v) }, { k: 'lyBills', label: 'LY transactions', fmt: (v) => (v ? num(v) : '–') }, { k: 'lyAvg', label: 'LY avg check', fmt: (v) => (v == null ? '–' : num2(v)) }, { k: 'avgYoy', label: 'Avg check vs LY', fmt: (v) => delta(v) },
          { k: 'status', label: 'Status', l: 1, fmt: (v) => h('span', { class: 'pill ' + (v === 'New this year' ? 'new' : /No sales/.test(v) ? 'closed' : '') }, v) }];
        const search = h('input', { type: 'search', placeholder: 'Search branch…' }); const stat = h('select', { class: 'sel' }, ['All statuses', ...new Set(c.branches.map((b) => b.status))].map((x) => h('option', {}, x)));
        let tbl = LM.table(cols, c.branches, { sort: 'rank', dir: 1 });
        const apply = () => { const q = search.value.toLowerCase(); tbl.redraw(c.branches.filter((b) => b.name.toLowerCase().includes(q) && (stat.value === 'All statuses' || b.status === stat.value))); };
        search.oninput = apply; stat.onchange = apply;
        const el = h('div', {}, h('div', { class: 'grid two', style: 'margin-bottom:12px' }, chartCard('Top 10 branches: net sales vs last year', 'c2'), chartCard('Top 10 branches: average check vs last year', 'c7')), h('div', { class: 'tools' }, search, stat, h('button', { class: 'btn small', onclick: () => LM.csv(cols, c.branches, `sales-branches-${ds.start}.csv`) }, 'Export CSV')), tbl);
        setTimeout(() => { topBranches(el.querySelector('#c2'), c); topBranchAvg(el.querySelector('#c7'), c); }); return el;
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

      /* ---------- Mugs: sales of every mug, by family, by store ---------- */
      function mugs() { return mugsT.view(); } // the Mugs tab is built only from its own two uploads
      function mugSales(ds) {
        if (!ds.items || !ds.items.length) return h('div', { class: 'banner' }, 'This report has no item data, so mug sales cannot be shown.');
        const m = S.mugs(ds);
        if (!m.items.length) return h('div', { class: 'banner' }, 'No mugs were found in this report’s item sales.');
        const main = m.families.filter((f) => f.share >= 0.005), small = m.families.filter((f) => f.share < 0.005); // families under 0.5% of mug sales share one “Other mugs” bar / column
        const OTHER = 'Other mugs'; m.mainFams = [...main.map((f) => f.name), ...(small.length ? [OTHER] : [])]; m.otherOf = new Set(small.map((f) => f.name));
        m.stores.forEach((x) => { x.col = {}; Object.entries(x.fam).forEach(([f, v]) => { const k = m.otherOf.has(f) ? OTHER : f; x.col[k] = (x.col[k] || 0) + v; }); });
        const chartFams = [...main.map((f) => [f.name, f.sales]), ...(small.length ? [[OTHER, small.reduce((t, f) => t + f.sales, 0)]] : [])];
        // the report is month-to-date: the earlier upload of the same period gives what was sold in between
        const prev = [...sets, ...allSales].filter((s) => s.start === ds.start && s.end < ds.end).sort((a, b) => (a.end < b.end ? 1 : -1))[0];
        const pm = prev ? S.mugs(prev) : null;
        const nextDay = (d) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
        const between = pm ? `${dayLabel(nextDay(prev.end))} – ${dayLabel(ds.end)}` : '';
        const el = h('div', {},
          h('div', { class: 'grid kpis' },
            kpi('Mug sales', num(m.total), 'SAR'),
            kpi('Mugs sold', num(m.qty), 'pieces'),
            kpi('Average price', num2(m.avg), 'SAR per mug'),
            kpi('Share of all sales', m.share == null ? '–' : pct0(m.share), 'of item sales'),
            kpi('Stores selling mugs', num(m.storesSelling), `${num(m.items.length)} different mugs`),
            kpi(pm ? `Mug sales ${between}` : 'Since previous upload', pm ? num(m.total - pm.total) : '–', pm ? `${num(m.qty - pm.qty)} mugs` : 'no earlier upload of this period')),
          h('div', { class: 'grid two', style: 'margin-bottom:12px' }, chartCard('Mug sales by family (SAR)', 'm1'), chartCard('Top 10 stores: mug sales (SAR)', 'm2')),
          mugFamilyCard(m), mugItemsCard(ds, m), mugStoreCard(ds, m),
          h('div', { class: 'sub', style: 'margin-top:6px' }, 'Mugs = items whose name contains “Mug”. Free refills (“Repeated Hot/Cold Mug”) and refill drinks (“Non HM Mug … Refill”) are not counted. Spelling variants of one mug (a trailing “\\”, “Sig”, “(Signuture)”) are added together. Figures cover the whole report period' + (pm ? `; the last tile is this report minus the upload for ${prev.start} → ${prev.end}.` : '.')));
        setTimeout(() => {
          const pal = LM.palette();
          LM.chart(el.querySelector('#m1'), { type: 'bar', data: { labels: chartFams.map((f) => f[0]), datasets: [{ data: chartFams.map((f) => f[1]), backgroundColor: pal[0] }] },
            options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => num(i.raw) + ' SAR' } } }, scales: { x: { ticks: { callback: (v) => compact(v) } } } } });
          const t = m.stores.slice(0, 10);
          LM.chart(el.querySelector('#m2'), { type: 'bar', data: { labels: t.map((x) => x.name.slice(0, 26)), datasets: [{ data: t.map((x) => x.sales), backgroundColor: ty$() }] },
            options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => num(i.raw) + ' SAR' } } }, scales: { x: { ticks: { callback: (v) => compact(v) } } } } });
        });
        return el;
      }
      function mugFamilyCard(m) {
        const cols = [{ k: 'name', label: 'Mug family', l: 1 }, { k: 'items', label: 'Mugs', fmt: num }, { k: 'qty', label: 'Quantity', fmt: num }, { k: 'sales', label: 'Net sales', fmt: num }, { k: 'avg', label: 'Avg price', fmt: (v) => (v == null ? '–' : num2(v)) }, { k: 'share', label: 'Share', fmt: pct0 }];
        return h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Mug families'), LM.table(cols, m.families, { sort: 'sales' }));
      }
      function mugItemsCard(ds, m) {
        const cols = [{ k: 'name', label: 'Mug', l: 1, cls: 'wrap' }, { k: 'family', label: 'Family', l: 1 }, { k: 'qty', label: 'Quantity', fmt: num }, { k: 'sales', label: 'Net sales', fmt: num }, { k: 'avg', label: 'Avg price', fmt: (v) => (v == null ? '–' : num2(v)) }, { k: 'share', label: 'Share', fmt: pct0 }, { k: 'stores', label: 'Stores selling', fmt: num }];
        const search = h('input', { type: 'search', placeholder: 'Search mug…' }); const fam = h('select', { class: 'sel' }, ['All families', ...m.families.map((f) => f.name)].map((x) => h('option', {}, x)));
        const tbl = LM.table(cols, m.items, { sort: 'sales' });
        const apply = () => { const q = search.value.toLowerCase(); tbl.redraw(m.items.filter((i) => i.name.toLowerCase().includes(q) && (fam.value === 'All families' || i.family === fam.value))); };
        search.oninput = apply; fam.onchange = apply;
        return h('div', { class: 'card', style: 'margin-bottom:12px' }, h('div', { class: 'tools' }, h('h3', { style: 'margin:0' }, 'Every mug'), h('div', { class: 'spacer' }), search, fam, h('button', { class: 'btn small', onclick: () => LM.csv(cols, m.items, `mugs-${ds.start}-${ds.end}.csv`) }, 'Export CSV')), tbl);
      }
      function mugStoreCard(ds, m) {
        const F = m.mainFams;
        const head = h('tr', {}, h('th', { class: 'l', style: 'position:sticky;left:0;background:var(--surface)' }, 'Store'), F.map((f) => h('th', {}, f)), h('th', {}, 'Mug sales'), h('th', {}, 'Mugs sold'), h('th', { title: 'Mug sales ÷ all item sales of the store' }, 'Mugs % of store'));
        const trs = m.stores.map((x) => { const mx = Math.max(...F.map((f) => x.col[f] || 0), 1);
          return h('tr', {}, h('td', { class: 'l', style: 'position:sticky;left:0;background:var(--surface);white-space:nowrap' }, x.name), F.map((f) => { const v = x.col[f] || 0; return v ? h('td', { style: `background:color-mix(in srgb, var(--accent) ${Math.round((v / mx) * 70)}%, transparent)` }, num(v)) : h('td', { class: 'z' }, '–'); }),
            h('td', { style: 'font-weight:700' }, num(x.sales)), h('td', {}, num(x.qty)), h('td', {}, x.share == null ? '–' : pct0(x.share))); });
        const csvCols = [{ k: 'name', label: 'Store' }, ...F.map((f, i) => ({ k: 'f' + i, label: f })), { k: 'sales', label: 'Mug sales' }, { k: 'qty', label: 'Mugs sold' }, { k: 'share', label: 'Mugs % of store sales' }];
        const csvRows = m.stores.map((x) => ({ name: x.name, ...Object.fromEntries(F.map((f, i) => ['f' + i, Math.round((x.col[f] || 0) * 100) / 100])), sales: Math.round(x.sales * 100) / 100, qty: x.qty, share: x.share == null ? '' : Math.round(x.share * 1000) / 10 }));
        return h('div', { class: 'card', style: 'margin-bottom:12px' }, h('div', { class: 'tools' }, h('h3', { style: 'margin:0' }, 'Mug sales by store and family (SAR)'), h('div', { class: 'spacer' }), h('button', { class: 'btn small', onclick: () => LM.csv(csvCols, csvRows, `mugs-by-store-${ds.start}-${ds.end}.csv`) }, 'Export CSV')),
          h('div', { class: 'tscroll', style: 'max-height:560px;overflow:auto' }, h('table', { class: 't heat' }, h('thead', {}, head), h('tbody', {}, trs))),
          h('div', { class: 'sub', style: 'margin-top:6px' }, `Darker = the family that store sells most of. Stores are sorted by mug sales.${m.otherOf.size ? ` Other mugs = ${[...m.otherOf].join(', ')}.` : ''}`));
      }

      /* ---------- Mugs stock in branches (weekly SOH tracker, one sheet per ROM) ---------- */
      let msRom = 'All ROMs', msView = 'mug', msQ = '';
      const shortMug = (n) => n.replace(/^Alsail Mug |^Coffee Mug – |^Al-Haram |^Summer |^Fazaa /, '').replace(/ Mug – /, ' ').replace(/ Mug$/, '');
      const sgn = (v) => (v > 0 ? '+' : '') + num(v);
      function mugStock() {
        const pick = LM.filePicker((f) => LM.mugstock.upload(f, { existing: msWeek, done: reload }), msWeek ? 'Replace mug stock' : 'Upload mug stock', false, '.xlsx,.xls,.xlsm');
        const rm = msWeek ? h('button', { class: 'btn small danger', onclick: async () => { if (await LM.ask('Remove the mug stock file of this week?')) { await LM.db.del('datasets', msWeek.id); reload(); } } }, 'Remove') : null;
        const head = h('div', { class: 'tools', style: 'margin:22px 0 10px' }, h('h2', { style: 'margin:0' }, 'Mugs stock in branches'), h('div', { class: 'spacer' }), ms ? h('span', { class: 'sub' }, `${ms.fileName} · uploaded ${String(ms.uploadedAt).slice(0, 16).replace('T', ' ')}`) : null, pick, rm);
        if (!ms) return h('div', {}, head, h('div', { class: 'card' }, h('p', { class: 'sub', style: 'margin:0' }, 'No stock file yet. Upload the weekly “SOH Daily Tracker – Mugs & Coffee” workbook (one sheet per ROM, stores across the top). Only the mug rows are read; every row is checked against its sheet’s Total before anything is saved.')));
        const V = LM.mugstock.view(ms), P = msPrev ? LM.mugstock.view(msPrev) : null;
        const prevStore = P ? Object.fromEntries(P.stores.map((x) => [x.key.toLowerCase(), x])) : {};
        const el = h('div', {}, head,
          msWeek ? null : h('div', { class: 'banner', style: 'margin-bottom:12px' }, `No stock file for this week yet. Showing the one for the week ending ${wkOf(ms)}.`),
          h('div', { class: 'grid kpis' },
            kpi('Mugs in stock', num(V.total), `${V.mugs.length} mugs`),
            kpi('Stores', num(V.stores.length), `${V.roms.length} ROMs`),
            kpi('At zero', num(V.zeros.length), 'store × mug with 0 stock'),
            kpi('Change vs previous file', P ? sgn(V.total - P.total) : '–', P ? `week ending ${wkOf(msPrev)}` : 'no earlier stock file')),
          stockByMugCard(V, P), stockByStoreCard(V, prevStore, !!P));
        return el;
      }
      function stockByMugCard(V, P) {
        const rem = {}; V.remarks.forEach((r) => { (rem[r.mug + '|' + r.rom] = rem[r.mug + '|' + r.rom] || []).push(r.text); });
        const cell = (m, r) => { const v = (V.byMugRom[m] || {})[r]; const t = rem[m + '|' + r]; return h('td', { title: t ? t.join(' / ') : '', style: v === 0 ? 'background:var(--bad-bg)' : '' }, v == null ? '–' : num(v), t ? ' *' : ''); };
        const mt = (m) => Object.values(V.byMugRom[m] || {}).reduce((a, b) => a + b, 0); const pm = (m) => (P ? Object.values(P.byMugRom[m] || {}).reduce((a, b) => a + b, 0) : null);
        const rows = [];
        V.families.forEach((f) => { const ms_ = V.mugs.filter((m) => m.family === f);
          rows.push(h('tr', { style: 'font-weight:700;background:var(--surface-2, rgba(0,0,0,.03))' }, h('td', { class: 'l' }, f), ...V.roms.map((r) => { const vs = ms_.map((m) => (V.byMugRom[m.name] || {})[r]).filter((v) => v != null); return h('td', {}, vs.length ? num(vs.reduce((t, v) => t + v, 0)) : '–'); }), h('td', {}, num(ms_.reduce((t, m) => t + mt(m.name), 0))), P ? h('td', {}, sgn(ms_.reduce((t, m) => t + mt(m.name) - pm(m.name), 0))) : null));
          ms_.forEach((m) => rows.push(h('tr', {}, h('td', { class: 'l', style: 'padding-left:22px' }, m.name), ...V.roms.map((r) => cell(m.name, r)), h('td', { style: 'font-weight:700' }, num(mt(m.name))), P ? h('td', {}, sgn(mt(m.name) - pm(m.name))) : null))); });
        rows.push(h('tr', { style: 'font-weight:700' }, h('td', { class: 'l' }, 'All mugs'), ...V.roms.map((r) => h('td', {}, num(V.romTot[r] || 0))), h('td', {}, num(V.total)), P ? h('td', {}, sgn(V.total - P.total)) : null));
        const notes = V.remarks.length ? h('div', { class: 'sub', style: 'margin-top:6px' }, '* Remarks in the file: ', [...new Set(V.remarks.map((r) => `${r.rom}: ${r.text}`))].join(' · '), '. Hover a cell to see its remark.') : null;
        return h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Stock by mug and ROM'),
          h('div', { style: 'overflow-x:auto' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', { class: 'l' }, 'Mug'), ...V.roms.map((r) => h('th', {}, r)), h('th', {}, 'Total'), P ? h('th', {}, 'vs previous') : null)), h('tbody', {}, rows))),
          h('div', { class: 'sub', style: 'margin-top:6px' }, 'Added up by mug name from each ROM sheet (the workbook’s own “Total” sheet is not used: it adds rows by position, which mixes up mugs listed in a different order). Red = 0 in stock.'), notes);
      }
      function stockByStoreCard(V, prevStore, hasPrev) {
        const host = h('div');
        const romSel = h('select', { class: 'sel', onchange: (e) => { msRom = e.target.value; paint(); } }, ['All ROMs', ...V.roms].map((r) => h('option', { selected: r === msRom }, r)));
        const search = h('input', { type: 'search', placeholder: 'Search store…', value: msQ, oninput: (e) => { msQ = e.target.value; paint(); } });
        const vb = (k, l) => h('button', { class: 'btn small' + (msView === k ? ' primary' : ''), onclick: () => { msView = k; card.replaceWith(stockByStoreCard(V, prevStore, hasPrev)); } }, l);
        const cols = msView === 'mug' ? V.mugs.map((m) => ({ k: m.name, label: shortMug(m.name), group: m.family, get: (s) => s.mug[m.name] })) : V.families.map((f) => ({ k: f, label: f, get: (s) => { const vs = V.mugs.filter((m) => m.family === f).map((m) => s.mug[m.name]).filter((v) => v != null); return vs.length ? vs.reduce((t, v) => t + v, 0) : null; } }));
        const prevOf = (s) => { const p = prevStore[s.key.toLowerCase()]; return p && p.reported && s.reported ? s.total - p.total : null; };
        const td = (v) => (v == null ? h('td', { class: 'z' }, '–') : h('td', { style: v === 0 ? 'background:var(--bad-bg)' : '' }, num(v)));
        const groupRow = msView === 'mug' ? h('tr', {}, h('th', { class: 'l', style: 'position:sticky;left:0;background:var(--surface)' }, ''), ...V.families.map((f) => h('th', { colspan: V.mugs.filter((m) => m.family === f).length, style: 'text-align:center;border-bottom:1px solid var(--line, #ddd)' }, f)), h('th', {}, ''), hasPrev ? h('th', {}, '') : null) : null;
        const headRow = h('tr', {}, h('th', { class: 'l', style: 'position:sticky;left:0;background:var(--surface)' }, 'Store'), ...cols.map((c) => h('th', { title: c.k, style: 'white-space:nowrap' }, c.label)), h('th', {}, 'Total'), hasPrev ? h('th', { title: 'Store total minus its total in the previous stock file' }, 'vs previous') : null);
        function paint() {
          const q = msQ.toLowerCase(); const roms = msRom === 'All ROMs' ? V.roms : [msRom]; const body = [];
          roms.forEach((r) => { const st = V.stores.filter((s) => s.rom === r && s.name.toLowerCase().includes(q)); if (!st.length) return;
            const sumC = (c) => { const vs = st.map((s) => c.get(s)).filter((v) => v != null); return vs.length ? vs.reduce((t, v) => t + v, 0) : null; }; const tot = st.reduce((t, s) => t + s.total, 0); const pv = st.map(prevOf).filter((x) => x != null);
            body.push(h('tr', { style: 'font-weight:700;background:var(--surface-2, rgba(0,0,0,.03))' }, h('td', { class: 'l', style: 'position:sticky;left:0;background:var(--surface)' }, `${r} (${st.length} stores)`), ...cols.map((c) => h('td', {}, sumC(c) == null ? '–' : num(sumC(c)))), h('td', {}, num(tot)), hasPrev ? h('td', {}, pv.length ? sgn(pv.reduce((a, b) => a + b, 0)) : '–') : null));
            st.forEach((s) => body.push(h('tr', {}, h('td', { class: 'l', style: 'position:sticky;left:0;background:var(--surface);white-space:nowrap;padding-left:18px' }, s.name), ...cols.map((c) => td(c.get(s))), h('td', { style: 'font-weight:700' }, s.reported ? num(s.total) : '–'), hasPrev ? h('td', {}, prevOf(s) == null ? '–' : sgn(prevOf(s))) : null))); });
          host.replaceChildren(body.length ? h('div', { style: 'overflow:auto;max-height:620px' }, h('table', { class: 't' }, h('thead', { style: 'position:sticky;top:0;z-index:2;background:var(--surface)' }, groupRow, headRow), h('tbody', {}, body))) : h('p', { class: 'sub' }, 'No store matches.'));
        }
        const csv = () => { const cc = [{ k: 'rom', label: 'ROM' }, { k: 'store', label: 'Store' }, ...cols.map((c, i) => ({ k: 'c' + i, label: c.k })), { k: 'total', label: 'Total' }];
          LM.csv(cc, V.stores.map((s) => ({ rom: s.rom, store: s.name, ...Object.fromEntries(cols.map((c, i) => ['c' + i, c.get(s) == null ? '' : c.get(s)])), total: s.reported ? s.total : '' })), `mug-stock-by-store-${wkOf(ms)}.csv`); };
        const card = h('div', { class: 'card', style: 'margin-bottom:12px' }, h('div', { class: 'tools' }, h('h3', { style: 'margin:0' }, 'Stock by store'), h('div', { class: 'spacer' }), romSel, search, vb('mug', 'By mug'), vb('family', 'By family'), h('button', { class: 'btn small', onclick: csv }, 'Export CSV')),
          host, h('div', { class: 'sub', style: 'margin-top:6px' }, 'Exactly the quantities in the ROM sheets. Red = 0 in stock; “–” = the cell is empty in the file (no figure). Stores are listed in the same order as in the file.'));
        paint(); return card;
      }

      function uploads() {
        return h('div', { class: 'card' }, h('h3', {}, 'Uploaded sales reports'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Period', 'File', 'Uploaded', 'Rows', ''].map((t) => h('th', { class: 'l' }, t)))),
          h('tbody', {}, sets.map((s) => h('tr', {}, h('td', { class: 'l' }, `${s.start} → ${s.end}`), h('td', { class: 'l' }, s.fileName), h('td', { class: 'l' }, s.uploadedAt.slice(0, 16).replace('T', ' ')), h('td', { class: 'l' }, `${s.ty.length} / ${s.ly.length} / ${s.items.length}`),
            h('td', {}, h('button', { class: 'btn small danger', onclick: async () => { if (await LM.ask(`Delete the report for ${s.start} → ${s.end}?`)) { await LM.db.del('datasets', s.id); reload(); } } }, 'Delete')))))));
      }

      await loadDay(); await loadHc(); // also on the first draw, so the headcount is there after a refresh
      draw();
    },
  };
})();
