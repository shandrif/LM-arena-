/* NEP tab: network expansion plan, next-6-months openings, pipeline status, history, closures. */
(function () {
  const LM = window.LM; const { h, num, compact } = LM; const N = LM.nep; LM.depts = LM.depts || {};
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ymLabel = (ym) => `${MON[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
  const kpi = (l, v, d) => h('div', { class: 'card kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
  const card = (t, ...k) => h('div', { class: 'card', style: 'margin-bottom:12px' }, t ? h('h3', {}, t) : null, ...k);
  const chartCard = (t, id, ht) => h('div', { class: 'card' }, h('h3', {}, t), h('div', { class: 'chart', id, style: ht ? `height:${ht}px` : '' }));
  const pill = (t, cls, style) => h('span', { class: 'pill ' + (cls || ''), style }, t);
  const statusPill = (s) => { const t = (s || '').trim(); if (!t) return pill('No status', ''); if (/^opened/i.test(t)) return pill(t, 'new'); if (/cancel/i.test(t)) return pill(t, 'closed'); if (/construction/i.test(t)) return pill(t, '', 'background:var(--warn-bg);color:var(--warn)'); return pill(t, ''); };
  const flagEl = (f) => h('span', { class: 'pill ' + (f[0] === 'bad' ? 'closed' : ''), style: f[0] === 'warn' ? 'background:var(--warn-bg);color:var(--warn);margin-right:4px' : 'margin-right:4px' }, f[1]);
  const dstr = (d) => (d && /^\d{4}-\d\d-\d\d$/.test(d) ? `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : d ? String(d) : '');

  LM.depts.nep = {
    id: 'nep', label: 'NEP',
    async mount(panel) {
      let sets = [], cur = null, sub = 'Overview', planYear = 'All';
      const reload = async () => { sets = (await LM.db.all('datasets')).filter((d) => d.dept === 'nep').sort((a, b) => (a.end < b.end ? 1 : -1)); if (!sets.find((s) => s.id === cur)) cur = sets[0] ? sets[0].id : null; draw(); };

      async function upload(file) {
        let rf; try { rf = await LM.readFile(file); } catch (e) { return LM.say(e.message); }
        const tpl = { dept: 'nep', ...((await LM.db.get('templates', 'nep')) || {}) }; const ov = {}; const run = () => N.analyze(rf.wb, rf.name, ov, tpl, sets, rf.hash); let res = run();
        const info = () => { const d = res.ds && res.ds.data; const c = res.ds && res.ds.end && d && d.plan ? N.compute(res.ds) : null; return {
          title: `Review before processing: ${rf.name}`, issues: res.issues,
          facts: d ? [['Report date', res.ds.end || '–'], ['Plan months', d.plan ? d.plan.months.length : 0], ['Openings next 6 months', c ? c.upcoming.length : '–'], ['Tracked stores', d.tracker ? d.tracker.reduce((s, x) => s + x.rows.length, 0) : 0]] : [['Report', 'Not recognised']],
          approveLabel: res.ds && sets.some((s) => s.end === res.ds.end) ? 'Approve & replace existing' : 'Approve & process',
          onFix: (fix, val) => { if (fix.type === 'asOf') ov.asOf = { date: val }; res = run(); dlg.update(info()); },
          onApprove: async () => { if (!res.ds || res.issues.some((i) => i.level === 'error')) throw new Error('Fix the errors first.'); const d = res.ds; const old = sets.find((s) => s.end === d.end);
            if (old) { await LM.db.put('history', { ...old, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', old.id); }
            const rec = { id: LM.uid(), dept: 'nep', type: 'nep', start: d.start, end: d.end, fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), data: d.data };
            await LM.db.put('datasets', rec); cur = rec.id; LM.toast(`NEP ${d.end} processed`); await reload(); } }; };
        const dlg = LM.review(info());
      }

      const body = h('div');
      function draw() {
        LM.killCharts();
        const sel = sets.length > 1 ? h('select', { class: 'sel', onchange: (e) => { cur = e.target.value; draw(); } }, sets.map((s) => h('option', { value: s.id, selected: s.id === cur }, 'Plan of ' + s.end))) : null;
        panel.replaceChildren(h('div', { class: 'head' }, h('h2', {}, 'NEP – Network Expansion Plan'), sel, h('div', { class: 'spacer' }), LM.filePicker(upload, 'Upload NEP file')), body);
        LM.dropZone(panel, upload);
        const ds = sets.find((s) => s.id === cur);
        if (!ds) return body.replaceChildren(h('div', { class: 'empty' }, h('h3', {}, 'No NEP file uploaded yet'), h('p', { class: 'sub' }, 'Drop the NEP workbook (.xlsx) with the sheets NEP (monthly plan), NSO Tracker and Closures.')));
        const c = N.compute(ds); if (!c) return body.replaceChildren(h('div', { class: 'banner' }, 'This upload has no monthly plan sheet.'));
        const tabs = ['Overview', 'Next 6 months', 'Pipeline', 'Plan by month', 'Other', 'Uploads'];
        body.replaceChildren(h('div', { class: 'sub', style: 'margin-bottom:8px' }, `Plan as of ${ds.end} · ${ds.fileName} · uploaded ${ds.uploadedAt.slice(0, 16).replace('T', ' ')}`), h('div', { class: 'subtabs' }, tabs.map((t) => h('button', { class: t === sub ? 'on' : '', onclick: () => { sub = t; draw(); } }, t))),
          { Overview: overview, 'Next 6 months': next6, Pipeline: pipeline, 'Plan by month': planTab, Other: other, Uploads: uploads }[sub](ds, c));
      }

      function trendChart(host, ds, c) {
        const M = ds.data.plan.months; const ym = ds.end.slice(0, 7);
        LM.chart(host, { data: { labels: M.map((m) => `${MON[m.m - 1]} ${String(m.y).slice(2)}`), datasets: [{ type: 'line', label: 'Operating stores (actual)', data: M.map((m) => (m.ym < ym ? m.op : m.ym === ym ? m.ex : null)), borderColor: LM.css('--accent'), backgroundColor: LM.css('--accent'), pointRadius: 1.5, tension: 0, yAxisID: 'y' }, { type: 'line', label: 'Operating stores (planned)', data: M.map((m) => (m.ym >= ym ? m.op : null)), borderColor: '#2c7a7b', borderDash: [6, 4], backgroundColor: '#2c7a7b', pointRadius: 1.5, tension: 0, yAxisID: 'y' }, { type: 'bar', label: 'Openings', data: M.map((m) => m.nw), backgroundColor: M.map((m) => (m.ym >= ym ? '#2c7a7b66' : LM.css('--ly'))), yAxisID: 'y1' }] },
          options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { title: { display: true, text: 'stores' } }, y1: { position: 'right', grid: { drawOnChartArea: false }, max: 12 } } } });
      }

      function overview(ds, c) {
        const win = c.upcoming; const byMonth = {}; win.forEach((s) => { const k = s.when.slice(0, 7); (byMonth[k] = byMonth[k] || []).push(s); });
        const risky = win.filter((s) => s.flags.length); const overdue = win.filter((s) => s.overdue); const leaseGap = win.filter((s) => s.inTracker !== false && !/^signed/i.test(s.lease));
        const closures = (ds.data.closures || []).length; const planned26 = c.total26;
        const el = h('div', {}, h('div', { class: 'grid kpis' }, kpi('Operating stores now', num(c.operatingNow), `per plan, ${ds.end}`), kpi('Opened in 2026', `${c.list.filter((s) => s.ym.startsWith('2026') && s.opened).length} of ${planned26}`, `${planned26 - c.list.filter((s) => s.ym.startsWith('2026') && s.opened).length} still to open this year`), kpi('Opening in next 6 months', win.length, `to ${dstr(c.horizon)}`), kpi('Year-end 2026 (plan)', num(c.yearEnd26), `2027 year-end: ${num(c.yearEnd27)}`), kpi('Stores with a risk flag', risky.length, `${overdue.length} overdue · ${leaseGap.length} lease not signed`), kpi('Closed stores listed', closures, 'not deducted from plan counts')),
          card(`Opening in the next 6 months (${win.length})`, win.length ? h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fit,minmax(230px,1fr))' }, Object.entries(byMonth).sort().map(([ym, arr]) => h('div', { class: 'card', style: 'box-shadow:none' }, h('div', { class: 'l', style: 'font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted)' }, ymLabel(ym), ` · ${arr.length} store${arr.length > 1 ? 's' : ''}`), h('ul', { class: 'findings', style: 'margin-top:6px' }, arr.map((s) => h('li', {}, h('b', {}, s.name), s.openDate ? h('span', { class: 'sub' }, ' · ' + dstr(s.openDate)) : null, h('div', {}, statusPill(s.status), ' ', s.flags.map(flagEl)))))))) : h('span', { class: 'sub' }, 'No openings are scheduled in the next 6 months.'), h('div', { class: 'sub', style: 'margin-top:8px' }, 'Months with no openings: ' + (() => { const m = []; for (let i = 0; i <= 6; i++) { const d = new Date(Date.UTC(+ds.end.slice(0, 4), +ds.end.slice(5, 7) - 1 + i, 1)); const ym = d.toISOString().slice(0, 7); if (ym <= c.horizon.slice(0, 7) && !byMonth[ym]) m.push(ymLabel(ym)); } return m.join(', ') || 'none'; })())),
          risky.length ? card('Needs attention', risky.map((s) => h('div', { class: 'issue ' + (s.flags.some((f) => f[0] === 'bad') ? 'error' : 'warn') }, h('div', { class: 'tag' }, s.flags.some((f) => f[0] === 'bad') ? 'Risk' : 'Watch'), h('div', {}, h('b', {}, s.name), ` (${s.openDate ? dstr(s.openDate) : ymLabel(s.ym)}): ${s.flags.map((f) => f[1]).join('; ')}`)))) : null,
          h('div', { class: 'card' }, h('h3', {}, 'Operating stores and monthly openings, 2022 – 2027'), h('div', { class: 'chart', id: 'c1', style: 'height:320px' })));
        setTimeout(() => trendChart(el.querySelector('#c1'), ds, c)); return el;
      }

      function next6(ds, c) {
        const rows = c.upcoming.map((s) => ({ ...s, month: ymLabel(s.when.slice(0, 7)), date: s.openDate || '', flagsText: s.flags.map((f) => f[1]).join('; ') }));
        const cols = [{ k: 'month', label: 'Month', l: 1 }, { k: 'date', label: 'Opening date', l: 1, fmt: (v) => (v ? dstr(v) : h('span', { class: 'sub' }, 'month only')) }, { k: 'name', label: 'Store', l: 1, cls: 'wrap' }, { k: 'region', label: 'Region', l: 1 }, { k: 'type', label: 'Type', l: 1 }, { k: 'area', label: 'Area m²', fmt: (v) => (v == null ? '–' : num(v)) }, { k: 'status', label: 'Status', l: 1, fmt: (v) => statusPill(v) }, { k: 'lease', label: 'Lease', l: 1 }, { k: 'handover', label: 'Handover', l: 1, fmt: (v) => dstr(v) }, { k: 'fit', label: 'Fit-out', l: 1 }, { k: 'civil', label: 'Civil', l: 1 }, { k: 'note', label: 'Note', l: 1, cls: 'wrap' }, { k: 'flagsText', label: 'Flags', l: 1, cls: 'wrap', fmt: (v, r) => h('span', {}, r.flags.map(flagEl)) }];
        const byRegion = {}, byType = {}; rows.forEach((r) => { byRegion[r.region] = (byRegion[r.region] || 0) + 1; byType[r.type || 'n/a'] = (byType[r.type || 'n/a'] || 0) + 1; });
        const el = h('div', {}, h('div', { class: 'sub', style: 'margin-bottom:8px' }, `Stores not yet opened, planned between ${dstr(ds.end)} and ${dstr(c.horizon)} (plus any overdue ones). Stores without an exact opening date are placed in their plan month.`),
          h('div', { class: 'grid kpis' }, kpi('Stores', rows.length, `${rows.filter((r) => r.openDate).length} with an exact date`), kpi('Total area', num(rows.reduce((s, r) => s + (r.area || 0), 0)) + ' m²', ''), kpi('Under construction', rows.filter((r) => /construction/i.test(r.status)).length, 'closest to opening'), kpi('Still in design / bidding', rows.filter((r) => /design|bidding|scouting|permit/i.test(r.status)).length, 'at risk of slipping')),
          h('div', { class: 'grid half', style: 'margin-bottom:12px' }, chartCard('Openings by month', 'c1'), chartCard('Openings by region', 'c2')),
          h('div', { class: 'tools' }, h('button', { class: 'btn small', onclick: () => LM.csv(cols, rows, `nep-next-6-months-${ds.end}.csv`) }, 'Export CSV')), LM.table(cols, rows, { sort: 'when', dir: 1 }));
        setTimeout(() => { const bm = {}; rows.forEach((r) => { const k = r.when.slice(0, 7); bm[k] = (bm[k] || 0) + 1; }); const ks = Object.keys(bm).sort(); LM.chart(el.querySelector('#c1'), { type: 'bar', data: { labels: ks.map(ymLabel), datasets: [{ data: ks.map((k) => bm[k]), backgroundColor: LM.css('--accent') }] }, options: { plugins: { legend: { display: false } }, scales: { y: { ticks: { precision: 0 } } } } });
          const rg = Object.entries(byRegion).sort((a, b) => b[1] - a[1]); LM.chart(el.querySelector('#c2'), { type: 'bar', data: { labels: rg.map((x) => x[0]), datasets: [{ data: rg.map((x) => x[1]), backgroundColor: '#2c7a7b' }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 } } } } }); }); return el;
      }

      function trackerTable(rows, withPlan) {
        const cols = [{ k: 'no', label: '#' }, { k: 'name', label: 'Store', l: 1, cls: 'wrap' }, { k: 'type', label: 'Type', l: 1 }, { k: 'area', label: 'Area m²', fmt: (v) => (v == null ? '–' : num(v)) }, { k: 'lease', label: 'Lease', l: 1 }, { k: 'handover', label: 'Handover', l: 1, fmt: (v) => dstr(v) }, { k: 'fit', label: 'Fit-out', l: 1 }, { k: 'civil', label: 'Civil', l: 1 }, { k: 'status', label: 'Status', l: 1, cls: 'wrap', fmt: (v) => statusPill(v) }, ...(withPlan ? [{ k: 'plannedMonth', label: 'Planned', l: 1, fmt: (v) => (v ? ymLabel(v) : '') }, { k: 'openDate', label: 'Opening date', l: 1, fmt: (v) => (v ? dstr(v) : '') }, { k: 'note', label: 'Note', l: 1, cls: 'wrap' }] : [])];
        return LM.table(cols, rows, { sort: 'no', dir: 1 });
      }
      function pipeline(ds, c) {
        const cnt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]); const nonOpened = c.list.filter((s) => !s.opened && s.inTracker);
        const work = {}; nonOpened.forEach((s) => { [['Fit-out', s.fit], ['Civil', s.civil]].forEach(([k, v]) => { if (v) { const o = (work[v] = work[v] || { name: v, fit: 0, civil: 0 }); if (k === 'Fit-out') o.fit++; else o.civil++; } }); });
        const t26 = c.t26 ? c.t26.rows.map((r) => ({ ...(c.list.find((s) => N.same(s.name, r.name)) || {}), ...r, status: r.status })) : []; const plan26 = c.t26 ? c.t26.rows.map((r) => { const l = c.list.find((s) => N.same(s.name, r.name)); return { ...r, plannedMonth: l ? l.ym : '', openDate: l ? l.openDate : null, note: l ? l.note : '' }; }) : [];
        const el = h('div', {}, h('div', { class: 'grid half', style: 'margin-bottom:12px' }, chartCard('NSO 2026: status of all stores', 'c1'), chartCard('NSO 2027: status of all stores', 'c2')),
          c.t26 ? card(`NSO 2026 tracker (${c.t26.rows.length} stores)`, trackerTable(plan26, true)) : null, c.t27 ? card(`NSO 2027 tracker (${c.t27.rows.length} stores)`, trackerTable(c.t27.rows, false)) : null,
          Object.keys(work).length ? card('Contractor workload on stores not yet open', LM.table([{ k: 'name', label: 'Contractor', l: 1 }, { k: 'fit', label: 'Fit-out jobs', fmt: num }, { k: 'civil', label: 'Civil jobs', fmt: num }], Object.values(work), { sort: 'fit' })) : null);
        setTimeout(() => { const s26 = cnt(c.status26); LM.chart(el.querySelector('#c1'), { type: 'bar', data: { labels: s26.map((x) => x[0]), datasets: [{ data: s26.map((x) => x[1]), backgroundColor: s26.map((x) => (/opened/i.test(x[0]) ? '#1d7a46' : LM.css('--accent'))) }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 } } } } }); const s27 = cnt(c.status27); LM.chart(el.querySelector('#c2'), { type: 'bar', data: { labels: s27.map((x) => x[0]), datasets: [{ data: s27.map((x) => x[1]), backgroundColor: '#2c7a7b' }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 } } } } }); }); return el;
      }

      function planTab(ds, c) {
        const P = ds.data.plan; const years = [...new Set(P.months.map((m) => m.y))]; const rows = P.months.filter((m) => planYear === 'All' || m.y === +planYear).map((m) => ({ ...m, month: ymLabel(m.ym), q: Math.ceil(m.m / 3), list: m.names.join(', '), future: m.ym >= ds.end.slice(0, 7) }));
        const el = h('div', {}, card('Yearly summary', LM.table([{ k: 'y', label: 'Year' }, { k: 'start', label: 'Stores at start', fmt: (v) => (v == null ? '–' : num(v)) }, { k: 'opened', label: 'Openings', fmt: num }, { k: 'end', label: 'Stores at year end', fmt: (v) => (v == null ? '–' : num(v)) }], c.byYear, { sort: 'y', dir: 1 })),
          h('div', { class: 'tools' }, h('select', { class: 'sel', onchange: (e) => { planYear = e.target.value; draw(); } }, ['All', ...years].map((y) => h('option', { selected: String(y) === String(planYear) }, y)))),
          LM.table([{ k: 'month', label: 'Month', l: 1 }, { k: 'q', label: 'Qtr', fmt: (v) => 'Q' + v }, { k: 'nw', label: 'New openings', fmt: num }, { k: 'ex', label: 'Existing', fmt: num }, { k: 'op', label: 'Operating', fmt: num }, { k: 'list', label: 'Stores', l: 1, cls: 'wrap', fmt: (v, r) => h('span', { style: r.future ? 'font-weight:600' : '' }, v) }], rows, { sort: null }));
        return el;
      }

      function other(ds, c) {
        const D = ds.data; const iraq = (D.tracker || []).find((s) => /iraq/i.test(s.title)), canc = (D.tracker || []).find((s) => /cancel/i.test(s.title)); const P = D.plan;
        return h('div', {}, iraq ? card(`Iraq NSO (${iraq.rows.length} locations)`, LM.table([{ k: 'name', label: 'Location', l: 1 }, { k: 'type', label: 'Type', l: 1 }, { k: 'lease', label: 'Lease', l: 1 }, { k: 'handover', label: 'Handover', l: 1 }, { k: 'status', label: 'Status', l: 1, fmt: (v) => statusPill(v) }], iraq.rows, { sort: null })) : null,
          P.projects.length ? card('Other projects 2026', LM.table([{ k: 'no', label: '#' }, { k: 'name', label: 'Project', l: 1 }, { k: 'status', label: 'Status', l: 1, fmt: (v) => statusPill(v) }], P.projects, { sort: null })) : null,
          P.pipeline27.length ? card('2027 pipeline without a month yet', h('div', {}, P.pipeline27.map((n) => pill(n, '', 'margin:2px'))), h('div', { class: 'sub', style: 'margin-top:6px' }, 'These are listed beside the 2027 plan but not in a monthly column.')) : null,
          canc ? card(`Cancelled locations (${canc.rows.length})`, LM.table([{ k: 'name', label: 'Location', l: 1 }, { k: 'area', label: 'Area m²', fmt: (v) => (v == null ? '–' : num(v)) }, { k: 'status', label: 'Reason', l: 1, cls: 'wrap' }], canc.rows, { sort: null })) : null,
          (D.closures || []).length ? card(`Closed stores (${D.closures.length})`, LM.table([{ k: 'name', label: 'Store', l: 1 }, { k: 'when', label: 'Closure date', l: 1, fmt: (v) => v || h('span', { class: 'sub' }, 'not given') }], D.closures.map((x) => ({ ...x, when: x.date ? dstr(x.date) : x.year ? String(x.year) : '' })), { sort: null }), h('div', { class: 'sub' }, 'The plan’s operating-store counts do not deduct these closures.')) : null);
      }

      function uploads() {
        return h('div', { class: 'card' }, h('h3', {}, 'Uploaded NEP files'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Plan date', 'File', 'Uploaded', ''].map((t) => h('th', { class: 'l' }, t)))), h('tbody', {}, sets.map((s) => h('tr', {}, h('td', { class: 'l' }, s.end), h('td', { class: 'l' }, s.fileName), h('td', { class: 'l' }, s.uploadedAt.slice(0, 16).replace('T', ' ')),
          h('td', {}, h('button', { class: 'btn small danger', onclick: async () => { if (await LM.ask(`Delete the NEP of ${s.end}?`)) { await LM.db.del('datasets', s.id); reload(); } } }, 'Delete')))))));
      }
      await reload();
    },
  };
})();
