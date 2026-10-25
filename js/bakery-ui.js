/* Bakery factory tab: production plan vs actual, factory projects, new products, machine purchases, risks and food safety. */
(function () {
  const LM = window.LM; const { h, num, num2, compact } = LM; const B = LM.bakery; LM.depts = LM.depts || {};
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dstr = (d) => (d && /^\d{4}-\d\d-\d\d$/.test(d) ? `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : d ? String(d) : '–');
  const dshort = (d) => (d && /^\d{4}-\d\d-\d\d$/.test(d) ? `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}` : '–');
  const pc = (v, d = 0) => (v == null || !isFinite(v) ? '–' : (v * 100).toFixed(d) + '%');
  const sar = (v) => (v == null ? '–' : num(Math.round(v)));
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const kpi = (l, v, d) => h('div', { class: 'card kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
  const card = (t, ...k) => h('div', { class: 'card', style: 'margin-bottom:12px' }, t ? h('h3', {}, t) : null, ...k);
  const chartCard = (t, id, ht) => h('div', { class: 'card' }, h('h3', {}, t), h('div', { class: 'chart', id, style: ht ? `height:${ht}px` : '' }));
  const pill = (t, cls, style) => h('span', { class: 'pill ' + (cls || ''), style }, t);
  const WARN = 'background:var(--warn-bg);color:var(--warn)';
  const stPill = (s) => (/^(done|launched|received|approved|closed|ok)$/i.test(s) ? pill(s, 'new') : /overdue|high|late|open$/i.test(s) && !/waiting/i.test(s) ? pill(s, 'closed') : /pending|waiting|medium|in progress|planned|not started/i.test(s) ? pill(s, '', WARN) : pill(s));
  const wrap = (w) => (v) => h('span', { style: `display:inline-block;width:${w};white-space:normal;line-height:1.35;word-break:break-word` }, v || '');
  const clip = (w, n) => (v) => h('span', { title: v || '', style: `display:inline-block;width:${w};white-space:normal;line-height:1.35;word-break:break-word` }, v && v.length > n ? v.slice(0, n).trim() + '…' : v || '');
  const bar = (el, labels, vals, color, horiz, fmt) => LM.chart(el, { type: 'bar', data: { labels, datasets: [{ data: vals, backgroundColor: color || LM.css('--accent') }] }, options: { indexAxis: horiz ? 'y' : 'x', plugins: { legend: { display: false } }, scales: { [horiz ? 'x' : 'y']: { ticks: { precision: 0, callback: fmt ? (v) => fmt(v) : undefined } } } } });
  const KIND_LABEL = { report: 'Factory report', machines: 'Machine purchase plan', risks: 'Risk assessments', food: 'Food safety issues' };

  LM.depts.bakery = {
    id: 'bakery', label: 'Bakery factory',
    async mount(panel) {
      let sets = [], sub = 'Overview', factoryIx = 0, projIx = 0, mFilter = { st: 'All', dept: 'All', q: '' }, batchEnd = null;
      const reload = async () => { sets = (await LM.db.all('datasets')).filter((d) => d.dept === 'bakery').sort((a, b) => (a.end < b.end ? 1 : -1)); draw(); };
      const kindOf = (d) => d.type.replace('bakery-', ''); const latest = (k) => sets.find((d) => kindOf(d) === k) || null;

      /* ---------- upload (several files at once) ---------- */
      async function uploadMany(files) { batchEnd = null; for (const f of [].concat(files)) await uploadOne(f); }
      function uploadOne(file) { return new Promise(async (resolve) => {
        let rf; try { if (/\.pptx$/i.test(file.name)) { const r = await LM.readBinary(file); rf = { slides: await LM.pptx.read(r.buf), name: r.name, hash: r.hash }; } else { const r = await LM.readFile(file); rf = { wb: r.wb, name: r.name, hash: r.hash }; } } catch (e) { LM.say(`“${file.name}” could not be read: ${e.message}`); return resolve(); }
        const tpl = { dept: 'bakery', ...((await LM.db.get('templates', 'bakery')) || {}) }; const ov = {}; const kind0 = B.detect(rf); const run = () => B.analyze(rf, sets.filter((d) => kindOf(d) === kind0), tpl, ov, batchEnd); let res = run();
        const info = () => { const d = res.ds && res.ds.data; const f = [['Type', res.kind ? KIND_LABEL[res.kind] : 'Not recognised']]; if (d) { f.push(['As of', res.ds.end]); if (res.kind === 'report') f.push(['Project schedules', d.projects.length + (d.npd ? 1 : 0)], ['Factories with production', d.production.length], ['New products', d.npd ? d.npd.phases.length : 0]); else if (res.kind === 'machines') { const s = B.machineStats(d); f.push(['Machine lines', s.n], ['Total (SAR)', sar(s.total)], ['Pending approval', s.byStatus.filter((x) => x.name === 'Pending approval').reduce((a, x) => a + x.n, 0)]); } else f.push([res.kind === 'risks' ? 'Risks' : 'Issues', d.rows.length], ...(res.kind === 'risks' ? [['High priority', d.rows.filter((r) => /high/i.test(r.priority)).length]] : [])); } return {
          title: `Review before processing: ${rf.name}`, issues: res.issues, facts: f, onCancel: resolve,
          approveLabel: res.ds && sets.some((s) => kindOf(s) === res.kind && s.end === res.ds.end) ? 'Approve & replace existing' : 'Approve & process',
          onFix: (fix, val) => { if (fix.type === 'asOf') ov.asOf = { date: val }; res = run(); dlg.update(info()); },
          onApprove: async () => { if (!res.ds || res.issues.some((i) => i.level === 'error')) throw new Error('Fix the errors first.'); const d = res.ds; const old = sets.find((s) => kindOf(s) === res.kind && s.end === d.end);
            if (old) { await LM.db.put('history', { ...old, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', old.id); }
            await LM.db.put('datasets', { id: LM.uid(), dept: 'bakery', type: d.type, start: d.start, end: d.end, fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), data: d.data });
            if (res.kind === 'machines') await LM.db.put('templates', { ...tpl, dept: 'bakery', knownRfq: [...new Set([...(tpl.knownRfq || []), ...d.data.rows.map((x) => x.rfq).filter(Boolean)])] });
            batchEnd = d.end; sub = res.kind === 'machines' ? 'Machine purchases' : res.kind === 'report' ? 'Overview' : 'Risks & food safety'; LM.toast(`${KIND_LABEL[res.kind]} as of ${d.end} processed`); await reload(); resolve(); } }; };
        const dlg = LM.review(info());
      }); }

      const body = h('div');
      const tabsAll = ['Overview', 'Production', 'Projects', 'New products', 'Machine purchases', 'Risks & food safety', 'Uploads'];
      function draw() {
        LM.killCharts();
        panel.replaceChildren(h('div', { class: 'head' }, h('h2', {}, 'Bakery factory'), h('span', { class: 'sub' }, 'Upload the factory report, machine purchase plan, risk assessments and food safety issues, together or one by one.'), h('div', { class: 'spacer' }), LM.filePicker(uploadMany, 'Upload bakery files', true, '.xlsx,.xls,.ods,.pptx')), body);
        LM.dropZone(panel, uploadMany, true);
        if (!sets.length) return body.replaceChildren(h('div', { class: 'empty' }, h('h3', {}, 'No bakery factory files uploaded yet'), h('div', { style: 'display:inline-grid;gap:4px;text-align:left' }, Object.values(KIND_LABEL).map((t) => h('div', {}, h('b', {}, t))))));
        const rep = latest('report'); const asOf = rep ? rep.end : null;
        body.replaceChildren(h('div', { class: 'subtabs' }, tabsAll.map((t) => h('button', { class: t === sub ? 'on' : '', onclick: () => { sub = t; draw(); } }, t))), { Overview: overview, Production: production, Projects: projects, 'New products': npd, 'Machine purchases': machines, 'Risks & food safety': risks, Uploads: uploads }[sub](rep, asOf));
      }
      const missing = (k) => h('div', { class: 'banner' }, `No ${KIND_LABEL[k].toLowerCase()} uploaded yet.`);
      const asOfLine = (ds) => (ds ? h('div', { class: 'sub', style: 'margin-bottom:8px' }, `${KIND_LABEL[kindOf(ds)]} as of ${dstr(ds.end)} · ${ds.fileName} · uploaded ${ds.uploadedAt.slice(0, 16).replace('T', ' ')}`) : null);

      /* ---------- Overview ---------- */
      function overview(rep, asOf) {
        const mac = latest('machines'), rk = latest('risks'), fd = latest('food'); const F = rep ? rep.data.production.map((f) => B.productionStats(f, asOf)) : []; const P = rep ? rep.data.projects.map((p) => B.projectStats(p, asOf)) : []; const N = rep && rep.data.npd ? B.npdStats(rep.data.npd, asOf).products : []; const M = mac ? B.machineStats(mac.data) : null;
        const hi = rk ? rk.data.rows.filter((r) => /high/i.test(r.priority)) : []; const find = [];
        F.forEach((s) => find.push(`${s.factory}: ${num(Math.round(s.actual))} ${s.unit} produced in ${s.days} days against a plan of ${num(Math.round(s.plan))} (${pc(s.adherence, 1)})${s.workersAvg != null ? `, about ${Math.round(s.workersAvg)} workers a day` : ''}.`));
        P.forEach((p) => find.push(`${p.title.replace(/[\[\]]/g, '')}: ${pc(p.pct)} complete, ${p.overdue.length} task(s) overdue, planned finish ${dstr(p.end)}.`));
        if (N.length) find.push(`New products: ${N.filter((x) => x.status === 'Launched').length} launched, ${N.filter((x) => x.status === 'In progress').length} in progress, ${N.filter((x) => x.status === 'Overdue').length} past their launch date without launching, ${N.filter((x) => x.status === 'Planned' || x.status === 'Not started').length} not started.`);
        if (M) find.push(`Machine purchases: SAR ${sar(M.total)} across ${M.n} lines; ${M.byStatus.filter((x) => /waiting|^received$/i.test(x.name)).reduce((s, x) => s + x.n, 0)} approved lines are waiting for or have been received, ${M.byStatus.filter((x) => x.name === 'Pending approval').reduce((s, x) => s + x.n, 0)} are pending approval.`);
        if (rk) find.push(`Risks: ${rk.data.rows.length} listed, ${hi.length} high priority (${hi.map((r) => r.risk).join('; ')}).`);
        if (fd) find.push(`Food safety: ${fd.data.rows.length} issue(s): ${fd.data.rows.map((r) => `${r.issue} (${r.desc.toLowerCase()})`).join('; ')}.`);
        const el = h('div', {}, rep ? asOfLine(rep) : null, h('div', { class: 'grid kpis' },
          F.map((s) => kpi(`${s.factory} production`, `${num(Math.round(s.actual))}`, `${s.unit} · ${pc(s.adherence, 1)} of plan · ${s.days} days to ${dshort(s.lastDay)}`)),
          P.map((p) => kpi(p.title.replace(/[\[\]]/g, '').replace(' Project Schedule', ''), pc(p.pct), `${p.overdue.length} overdue · ends ${dstr(p.end)}`)),
          N.length ? kpi('New products', `${N.filter((x) => x.status === 'Launched').length} of ${N.length} launched`, `${N.filter((x) => x.status === 'Overdue').length} past launch date`) : null,
          M ? kpi('Machine purchase plan', `SAR ${compact(M.total)}`, `${M.n} lines · ${M.byStatus.filter((x) => x.name === 'Pending approval').reduce((s, x) => s + x.n, 0)} pending approval`) : null,
          rk ? kpi('Open risks', rk.data.rows.filter((r) => /open/i.test(r.status)).length, `${hi.length} high priority`) : null, fd ? kpi('Food safety issues', fd.data.rows.length, fd.data.rows.map((r) => r.issue).join(', ')) : null),
          card('What stands out', h('ul', { class: 'findings' }, find.map((t) => h('li', {}, t)))),
          h('div', { class: 'grid half', style: 'margin-bottom:12px' }, rep ? chartCard('Plan adherence by factory (month to date)', 'c1', 240) : null, M ? chartCard('Machine purchases by status (SAR)', 'c2', 240) : null),
          h('div', { class: 'grid half' }, rep ? chartCard('Project progress', 'c3', 240) : null, N.length ? chartCard('New products by status', 'c4', 240) : null));
        setTimeout(() => { const g = (id) => el.querySelector(id); if (g('#c1')) bar(g('#c1'), F.map((s) => s.factory), F.map((s) => +((s.adherence || 0) * 100).toFixed(1)), '#2c7a7b', false, (v) => v + '%'); if (g('#c2')) bar(g('#c2'), M.byStatus.map((x) => x.name), M.byStatus.map((x) => Math.round(x.total)), '#b7791f', true, compact); if (g('#c3')) bar(g('#c3'), P.map((p) => p.title.replace(/[\[\]]/g, '').replace(' Project Schedule', '')), P.map((p) => +(p.pct * 100).toFixed(0)), LM.css('--accent'), true, (v) => v + '%'); if (g('#c4')) { const cnt = {}; N.forEach((x) => (cnt[x.status] = (cnt[x.status] || 0) + 1)); const ks = Object.keys(cnt); bar(g('#c4'), ks, ks.map((k) => cnt[k]), '#6b46c1', true); } }); return el;
      }

      /* ---------- Production ---------- */
      function production(rep, asOf) {
        if (!rep) return missing('report'); const Fs = rep.data.production; if (!Fs.length) return h('div', { class: 'banner' }, 'This report has no daily production sheets.'); if (factoryIx >= Fs.length) factoryIx = 0; const F = Fs[factoryIx]; const s = B.productionStats(F, asOf); const sp = F.support;
        const chips = h('div', { class: 'dslist' }, Fs.map((f, i) => h('button', { class: 'btn' + (i === factoryIx ? ' on' : ''), onclick: () => { factoryIx = i; draw(); } }, `${f.factory} · ${f.month}`)));
        const dayRows = s.rd.map((x) => ({ d: x.d, plan: x.plan, actual: x.actual, adh: x.plan ? x.actual / x.plan : null, workers: sp.workers ? sp.workers[x.i] : null, ot: sp.overtime ? sp.overtime[x.i] : null, hours: sp.hours ? sp.hours[x.i] : null, rate: sp.rate ? sp.rate[x.i] : null, rem: F.products.some((p) => p.rem) ? sum(F.products, (p) => p.rem && p.rem[x.i]) : null, del: F.products.some((p) => p.delivery) ? sum(F.products, (p) => p.delivery && p.delivery[x.i]) : null })).sort((a, b) => (a.d < b.d ? 1 : -1));
        const dcols = [{ k: 'd', label: 'Date', l: 1, fmt: dstr }, { k: 'plan', label: `Plan (${F.unit})`, fmt: (v) => num(Math.round(v)) }, { k: 'actual', label: 'Actual', fmt: (v) => num(Math.round(v)) }, { k: 'adh', label: 'Adherence', fmt: (v) => (v == null ? '–' : h('span', { class: v < 0.95 || v > 1.05 ? 'down' : '' }, pc(v, 1))) }, ...(F.products.some((p) => p.delivery) ? [{ k: 'del', label: 'Delivered to branches', fmt: (v) => num(Math.round(v)) }, { k: 'rem', label: 'Left over', fmt: (v) => num2(v) }] : []), { k: 'workers', label: 'Workers', fmt: (v) => (v == null || v === '' ? '–' : num(v)) }, { k: 'ot', label: 'Overtime h', fmt: (v) => (v == null || v === '' ? '–' : num(v)) }, { k: 'hours', label: 'Working h', fmt: (v) => (v == null || v === '' ? '–' : num(v)) }, { k: 'rate', label: `${F.unit}/hour`, fmt: (v) => (v == null || v === '' ? '–' : num2(v)) }];
        const pcols = [{ k: 'name', label: 'Product', l: 1 }, { k: 'plan', label: 'Plan', fmt: (v) => num(Math.round(v)) }, { k: 'actual', label: 'Actual', fmt: (v) => num(Math.round(v)) }, { k: 'diff', label: 'Difference', fmt: (v) => (v > 0 ? '+' : '') + num(Math.round(v)) }, { k: 'adherence', label: 'Adherence', fmt: (v) => (v == null ? '–' : h('span', { class: v < 0.95 ? 'down' : '' }, pc(v, 1))) }, { k: 'share', label: 'Share of output', fmt: (v) => pc(v, 1) }, { k: 'daysBelow', label: 'Days under 95%', fmt: (v) => (v ? h('b', {}, v) : '0') }];
        const el = h('div', {}, chips, h('div', { class: 'sub', style: 'margin:6px 0 10px' }, `Reported through ${dstr(s.lastDay)} (${s.days} days of ${F.dates.length} in the sheet). Plan adherence = actual ÷ plan.`),
          h('div', { class: 'grid kpis' }, kpi('Produced', num(Math.round(s.actual)), `${s.unit} · plan ${num(Math.round(s.plan))}`), kpi('Plan adherence', pc(s.adherence, 1), `${num(Math.round(s.actual - s.plan))} ${s.unit} ${s.actual >= s.plan ? 'above' : 'below'} plan`), kpi('Average per day', num(Math.round(s.avgDaily)), `best ${s.best ? dshort(s.best.d) + ' ' + num(Math.round(s.best.actual)) : '–'} · lowest ${s.worst ? dshort(s.worst.d) + ' ' + num(Math.round(s.worst.actual)) : '–'}`), s.workersAvg != null ? kpi('Workers per day', Math.round(s.workersAvg), `${num(Math.round(s.hours || 0))} working hours · ${num(Math.round(s.overtime || 0))} overtime`) : null, s.rate != null ? kpi(`${F.unit} per working hour`, num2(s.rate), 'actual ÷ working hours') : null),
          h('div', { class: 'grid half', style: 'margin-bottom:12px' }, chartCard('Daily plan vs actual', 'c1', 300), chartCard('Plan adherence by product', 'c2', Math.max(260, F.products.length * 22 + 60))),
          h('div', { class: 'grid half', style: 'margin-bottom:12px' }, sp.workers ? chartCard('Workers per day', 'c3', 240) : null, sp.rate ? chartCard(`${F.unit} per working hour`, 'c4', 240) : null),
          card(`By product, ${F.month}`, h('div', { class: 'tools' }, h('button', { class: 'btn small', onclick: () => LM.csv(pcols, s.products, `bakery-${F.factory}-${F.month}-products.csv`) }, 'Export CSV')), LM.table(pcols, s.products, { sort: 'actual' })),
          card('By day', h('div', { class: 'tools' }, h('button', { class: 'btn small', onclick: () => LM.csv(dcols, dayRows, `bakery-${F.factory}-${F.month}-days.csv`) }, 'Export CSV')), LM.table(dcols, dayRows, { sort: 'd', dir: -1 })));
        setTimeout(() => { const rd = s.rd.map((x) => x.d); LM.chart(el.querySelector('#c1'), { data: { labels: rd.map(dshort), datasets: [{ type: 'bar', label: 'Actual', data: s.rd.map((x) => x.actual), backgroundColor: LM.css('--accent') }, { type: 'line', label: 'Plan', data: s.rd.map((x) => x.plan), borderColor: '#2c7a7b', backgroundColor: '#2c7a7b', pointRadius: 2, tension: 0 }] }, options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: (v) => compact(v) } } } } });
          const pr = [...s.products].filter((p) => p.adherence != null).sort((a, b) => b.adherence - a.adherence); LM.chart(el.querySelector('#c2'), { type: 'bar', data: { labels: pr.map((p) => p.name), datasets: [{ data: pr.map((p) => +(p.adherence * 100).toFixed(1)), backgroundColor: pr.map((p) => (p.adherence < 0.95 ? '#b3261e' : p.adherence > 1.05 ? '#c2851f' : '#1d7a46')) }] }, options: { indexAxis: 'y', plugins: { legend: { display: false }, valueLabels: { suffix: '%' } }, scales: { x: { min: 80, ticks: { callback: (v) => v + '%' } } } } });
          if (sp.workers) bar(el.querySelector('#c3'), s.rd.map((x) => dshort(x.d)), s.rd.map((x) => sp.workers[x.i]), '#5b6fb5'); if (sp.rate) LM.chart(el.querySelector('#c4'), { type: 'line', data: { labels: s.rd.map((x) => dshort(x.d)), datasets: [{ data: s.rd.map((x) => sp.rate[x.i]), borderColor: '#6b46c1', backgroundColor: '#6b46c1', tension: 0, pointRadius: 2 }] }, options: { plugins: { legend: { display: false } } } }); }); return el;
      }

      /* ---------- Projects (Gantt schedules) ---------- */
      const toDay = (d) => Math.round(Date.parse(d) / 86400000);
      function gantt(host, S, asOf) {
        const ph = S.phases.filter((p) => p.start && p.end); const lo = Math.min(...ph.map((p) => toDay(p.start))), hi = Math.max(...ph.map((p) => toDay(p.end)));
        LM.chart(host, { type: 'bar', data: { labels: ph.map((p) => `${p.name.trim()} · ${pc(p.pct)}`), datasets: [{ data: ph.map((p) => [toDay(p.start), toDay(p.end)]), backgroundColor: ph.map((p) => (p.pct >= 1 ? '#1d7a46' : p.overdue ? '#b3261e' : LM.css('--accent'))), borderSkipped: false }] },
          options: { indexAxis: 'y', plugins: { legend: { display: false }, valueLabels: false, tooltip: { callbacks: { label: (c) => { const p = ph[c.dataIndex]; return `${dstr(p.start)} → ${dstr(p.end)} · ${pc(p.pct)} done${p.overdue ? ` · ${p.overdue} overdue` : ''}`; } } } }, scales: { x: { min: lo - 10, max: hi + 10, ticks: { maxTicksLimit: 8, callback: (v) => { const d = new Date(v * 86400000).toISOString(); return `${MON[+d.slice(5, 7) - 1]} ${d.slice(2, 4)}`; } } } } },
          plugins: [{ id: 'asof', afterDraw(ch) { const x = ch.scales.x.getPixelForValue(toDay(asOf)); if (x < ch.chartArea.left || x > ch.chartArea.right) return; const c = ch.ctx; c.save(); c.strokeStyle = '#b3261e'; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(x, ch.chartArea.top); c.lineTo(x, ch.chartArea.bottom); c.stroke(); c.fillStyle = '#b3261e'; c.font = '600 10px system-ui'; c.textAlign = 'center'; c.fillText('as of ' + dshort(asOf), x, ch.chartArea.top - 4); c.restore(); } }] });
      }
      function projects(rep, asOf) {
        if (!rep) return missing('report'); const Ps = rep.data.projects; if (!Ps.length) return h('div', { class: 'banner' }, 'This report has no project schedules.'); if (projIx >= Ps.length) projIx = 0; const S = B.projectStats(Ps[projIx], asOf);
        const chips = h('div', { class: 'dslist' }, Ps.map((p, i) => h('button', { class: 'btn' + (i === projIx ? ' on' : ''), onclick: () => { projIx = i; draw(); } }, p.title.replace(/[\[\]]/g, '').replace(' Project Schedule', ''))));
        const tcols = [{ k: 'wbs', label: 'WBS', l: 1 }, { k: 'task', label: 'Task', l: 1, fmt: wrap('280px') }, { k: 'lead', label: 'Lead', l: 1, fmt: wrap('150px') }, { k: 'start', label: 'Start', l: 1, fmt: dstr }, { k: 'end', label: 'End', l: 1, fmt: dstr }, { k: 'days', label: 'Days', fmt: (v) => (v == null ? '–' : num(v)) }, { k: 'pct', label: '% done', fmt: (v) => pc(v) }, { k: 'status', label: 'Status', l: 1, fmt: (v) => stPill(v) }, { k: 'late', label: 'Days late', fmt: (v) => (v ? h('b', { style: 'color:var(--bad)' }, v) : '') }];
        const tasks = S.tasks.map((t) => ({ ...t, late: t.status === 'Overdue' ? days(t.end, asOf) : 0 })); const od = tasks.filter((t) => t.status === 'Overdue').sort((a, b) => b.late - a.late);
        const el = h('div', {}, chips, h('div', { class: 'sub', style: 'margin:6px 0 10px' }, `${S.title.replace(/[\[\]]/g, '')}${S.lead ? ' · project lead(s): ' + S.lead : ''}${S.projectStart ? ' · project start ' + dstr(S.projectStart) : ''}. Progress is weighted by task duration. Status is as of ${dstr(asOf)}.`),
          h('div', { class: 'grid kpis' }, kpi('Progress', pc(S.pct), `${S.done} of ${S.n} tasks done`), kpi('In progress', S.inProgress.length, 'started, not finished'), kpi('Overdue', S.overdue.length, 'end date passed, not 100%'), kpi('Not started', S.notStarted, ''), kpi('Planned finish', dstr(S.end), `started ${dstr(S.start)}`)),
          h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Phase timeline'), h('div', { class: 'chart', id: 'c1', style: `height:${Math.max(220, S.phases.length * 40 + 70)}px` })),
          od.length ? card(`Overdue tasks (${od.length})`, LM.table(tcols.filter((c) => !['wbs'].includes(c.k)).map((c) => (c.k === 'phase' ? c : c)), od, { sort: 'late' })) : null,
          card('Phases', LM.table([{ k: 'name', label: 'Phase', l: 1, fmt: wrap('260px') }, { k: 'n', label: 'Tasks', fmt: num }, { k: 'done', label: 'Done', fmt: num }, { k: 'overdue', label: 'Overdue', fmt: (v) => (v ? h('b', { style: 'color:var(--bad)' }, v) : '0') }, { k: 'pct', label: 'Progress', fmt: (v) => pc(v) }, { k: 'start', label: 'Start', l: 1, fmt: dstr }, { k: 'end', label: 'End', l: 1, fmt: dstr }], S.phases, { sort: 'start', dir: 1 })),
          card('All tasks', h('div', { class: 'tools' }, h('button', { class: 'btn small', onclick: () => LM.csv(tcols, tasks, `bakery-${S.sheet}-tasks.csv`) }, 'Export CSV')), LM.table([...tcols.slice(0, 1), { k: 'phase', label: 'Phase', l: 1, fmt: wrap('180px') }, ...tcols.slice(1)], tasks, { sort: 'start', dir: 1, limit: 200 })));
        setTimeout(() => gantt(el.querySelector('#c1'), S, asOf)); return el;
      }

      /* ---------- New products ---------- */
      function npd(rep, asOf) {
        if (!rep) return missing('report'); if (!rep.data.npd) return h('div', { class: 'banner' }, 'This report has no new-product schedule.'); const pr = B.npdStats(rep.data.npd, asOf).products; const cnt = (s) => pr.filter((x) => x.status === s).length;
        const up = pr.filter((x) => x.status !== 'Launched' && x.launchDate && x.launchDate >= asOf).sort((a, b) => (a.launchDate < b.launchDate ? -1 : 1)), late = pr.filter((x) => x.status === 'Overdue').sort((a, b) => b.lateDays - a.lateDays);
        const cols = [{ k: 'name', label: 'Product', l: 1, fmt: wrap('220px') }, { k: 'pct', label: 'Stages done', fmt: (v) => pc(v) }, { k: 'status', label: 'Status', l: 1, fmt: (v) => stPill(v) }, { k: 'launchDate', label: 'Planned launch', l: 1, fmt: dstr }, { k: 'lateDays', label: 'Days late', fmt: (v) => (v ? h('b', { style: 'color:var(--bad)' }, v) : '') }, { k: 'next', label: 'Next stage', l: 1 }, { k: 'nextEnd', label: 'Stage ends', l: 1, fmt: dstr }];
        const stages = [...new Set(rep.data.npd.phases.flatMap((p) => p.tasks.map((t) => t.task.trim().toLowerCase())))]; const cell = (p, st) => { const t = p.tasks.find((x) => x.task.trim().toLowerCase() === st); if (!t) return h('td', {}, ''); const v = t.pct || 0; return h('td', { title: `${t.task.trim()}: ${dstr(t.start)} → ${dstr(t.end)}`, style: `text-align:center;background:color-mix(in srgb, var(--accent) ${Math.round(v * 60)}%, transparent)` }, v >= 1 ? '✓' : v > 0 ? Math.round(v * 100) + '%' : ''); };
        return h('div', {}, h('div', { class: 'sub', style: 'margin-bottom:8px' }, `Status as of ${dstr(asOf)}. A product is Launched when its “Product Launching” stage is 100%, Overdue when that stage ended before the as-of date without finishing.`),
          h('div', { class: 'grid kpis' }, kpi('Products', pr.length, `${rep.data.npd.phases.filter((p) => p.unnamed).length ? 'incl. 1 unnamed' : ''}`), kpi('Launched', cnt('Launched'), ''), kpi('In progress', cnt('In progress'), ''), kpi('Past launch date', cnt('Overdue'), late[0] ? `longest ${late[0].lateDays} days (${late[0].name.trim()})` : ''), kpi('Not started / planned', cnt('Not started') + cnt('Planned'), '')),
          up.length ? card(`Launching next (${up.length})`, LM.table(cols.filter((c) => c.k !== 'lateDays'), up, { sort: 'launchDate', dir: 1 })) : null,
          late.length ? card(`Past their planned launch date (${late.length})`, LM.table(cols, late, { sort: 'lateDays' })) : null,
          card('All products', LM.table(cols, pr, { sort: 'start', dir: 1 })),
          card('Stage by stage', h('div', { class: 'tscroll' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', { class: 'l' }, 'Product'), stages.map((s) => h('th', {}, s.replace('shelf life and external lab analysis', 'shelf life / lab').replace('product ', ''))))), h('tbody', {}, pr.map((p) => h('tr', {}, h('td', { class: 'l' }, p.name.trim()), stages.map((s) => cell(p, s)))))))));
      }

      /* ---------- Machine purchases ---------- */
      function machines() {
        const ds = latest('machines'); if (!ds) return missing('machines'); const M = B.machineStats(ds.data); const R = ds.data.rows; const sts = ['All', ...M.byStatus.map((x) => x.name)], depts = ['All', ...[...new Set(R.map((x) => x.dept.replace(/\s+/g, ' ').trim()))].sort()];
        const cols = [{ k: 'name', label: 'Machine', l: 1, fmt: wrap('230px') }, { k: 'dept', label: 'Department', l: 1, fmt: wrap('130px') }, { k: 'qty', label: 'Qty', fmt: (v) => (v == null ? '–' : num(v)) }, { k: 'unit', label: 'Unit (SAR)', fmt: sar }, { k: 'total', label: 'Total (SAR)', fmt: sar }, { k: 'supplier', label: 'Supplier', l: 1, fmt: wrap('150px') }, { k: 'bucket', label: 'Status', l: 1, fmt: (v) => stPill(v) }, { k: 'pr', label: 'PR / PO', l: 1, fmt: wrap('110px') }, { k: 'payStage', label: 'Payment', l: 1, fmt: wrap('130px') }, { k: 'purpose', label: 'Purpose (hover for full text)', l: 1, fmt: clip('260px', 90) }, { k: 'notes', label: 'Notes (hover for full text)', l: 1, fmt: clip('240px', 90) }];
        const rows = R.map((x) => ({ ...x, name: x.name.trim(), dept: x.dept.replace(/\s+/g, ' ').trim(), supplier: x.supplier.replace(/\s+/g, ' ').trim(), purpose: x.purpose.replace(/\s+/g, ' ').trim(), notes: x.notes.replace(/\s+/g, ' ').trim(), pr: x.pr.trim() })); const t = LM.table(cols, rows, { sort: 'total', limit: 200 }); const cnt = h('span', { class: 'sub' });
        const apply = () => { const q = mFilter.q.trim().toLowerCase(); const f = rows.filter((x) => (mFilter.st === 'All' || x.bucket === mFilter.st) && (mFilter.dept === 'All' || x.dept === mFilter.dept) && (!q || `${x.name} ${x.supplier} ${x.purpose} ${x.pr} ${x.notes}`.toLowerCase().includes(q))); t.redraw(f); cnt.textContent = `${f.length} of ${rows.length} lines · SAR ${sar(sum(f, (x) => x.total))}`; return f; };
        const sel = (v, opts, set) => h('select', { class: 'sel', onchange: (e) => { set(e.target.value); apply(); } }, opts.map((o) => h('option', { value: o, selected: o === v }, o)));
        const search = h('input', { type: 'search', placeholder: 'Search machine, supplier, PO…', value: mFilter.q, oninput: () => { mFilter.q = search.value; apply(); } });
        const g = (s) => M.byStatus.find((x) => x.name === s) || { n: 0, total: 0 };
        const el = h('div', {}, asOfLine(ds), h('div', { class: 'grid kpis' }, kpi('Total plan', `SAR ${compact(M.total)}`, `${M.n} lines · ${num(M.units)} units · without VAT`), kpi('Approved', `SAR ${compact(g('Approved').total + g('Approved, waiting for receiving').total + g('Received').total)}`, `${g('Approved').n + g('Approved, waiting for receiving').n + g('Received').n} lines`), kpi('Waiting for receiving', g('Approved, waiting for receiving').n, `SAR ${compact(g('Approved, waiting for receiving').total)}`), kpi('Received', g('Received').n, `SAR ${compact(g('Received').total)}`), kpi('Pending approval', g('Pending approval').n, `SAR ${compact(g('Pending approval').total)}`), kpi('Planned, not yet ordered', g('Planned').n, `SAR ${compact(g('Planned').total)} priced`)),
          h('div', { class: 'grid half', style: 'margin-bottom:12px' }, chartCard('Spend by status (SAR)', 'c1', 230), chartCard('Spend by department (SAR)', 'c2', Math.max(260, M.byDept.length * 22 + 50))),
          chartCard('Spend by supplier (SAR)', 'c3', Math.max(240, M.bySupplier.length * 22 + 50)),
          h('div', { class: 'tools', style: 'margin-top:12px' }, sel(mFilter.st, sts, (v) => (mFilter.st = v)), sel(mFilter.dept, depts, (v) => (mFilter.dept = v)), search, cnt, h('div', { class: 'spacer' }), h('button', { class: 'btn small', onclick: () => LM.csv(cols, apply(), `bakery-machine-purchases-${ds.end}.csv`) }, 'Export CSV')), t);
        setTimeout(() => { apply(); bar(el.querySelector('#c1'), M.byStatus.map((x) => x.name), M.byStatus.map((x) => Math.round(x.total)), '#b7791f', true, compact); bar(el.querySelector('#c2'), M.byDept.map((x) => x.name), M.byDept.map((x) => Math.round(x.total)), '#2c7a7b', true, compact); bar(el.querySelector('#c3'), M.bySupplier.map((x) => (x.name === '(none)' ? 'No supplier yet' : x.name.slice(0, 34))), M.bySupplier.map((x) => Math.round(x.total)), '#6b46c1', true, compact); }); return el;
      }

      /* ---------- Risks & food safety ---------- */
      function risks() {
        const rk = latest('risks'), fd = latest('food'); if (!rk && !fd) return missing('risks'); const order = { high: 0, medium: 1, low: 2 }; const R = rk ? [...rk.data.rows].sort((a, b) => (order[a.priority.toLowerCase()] ?? 9) - (order[b.priority.toLowerCase()] ?? 9)) : [];
        const c = (p) => R.filter((r) => r.priority.toLowerCase() === p).length;
        return h('div', {}, rk ? h('div', {}, asOfLine(rk), h('div', { class: 'grid kpis' }, kpi('Risks listed', R.length, `${R.filter((r) => /open/i.test(r.status)).length} open`), kpi('High priority', c('high'), R.filter((r) => r.priority.toLowerCase() === 'high').map((r) => r.risk).join('; ')), kpi('Medium', c('medium'), ''), kpi('Low', c('low'), '')),
          card('Risk register', LM.table([{ k: 'risk', label: 'Risk', l: 1, fmt: wrap('220px') }, { k: 'priority', label: 'Priority', l: 1, fmt: (v) => stPill(v) }, { k: 'desc', label: 'Description', l: 1, fmt: wrap('280px') }, { k: 'owner', label: 'Owner', l: 1, fmt: wrap('140px') }, { k: 'status', label: 'Status', l: 1, fmt: (v) => stPill(v) }, { k: 'notes', label: 'Notes / mitigation', l: 1, fmt: wrap('280px') }], R, { sort: null }))) : missing('risks'),
          fd ? h('div', {}, asOfLine(fd), card(`Food safety issues (${fd.data.rows.length})`, LM.table([{ k: 'issue', label: 'Issue', l: 1, fmt: wrap('200px') }, { k: 'desc', label: 'Description', l: 1, fmt: wrap('320px') }, { k: 'actions', label: 'Actions', l: 1, fmt: wrap('320px') }], fd.data.rows, { sort: null }))) : missing('food'));
      }

      /* ---------- Uploads ---------- */
      function uploads() {
        return card('Uploaded bakery files', LM.table([{ k: 'kind', label: 'Type', l: 1 }, { k: 'end', label: 'As of', l: 1, fmt: dstr }, { k: 'fileName', label: 'File', l: 1 }, { k: 'uploadedAt', label: 'Uploaded', l: 1, fmt: (v) => v.slice(0, 16).replace('T', ' ') }, { k: 'x', label: '', fmt: (v, r) => h('button', { class: 'btn small danger', onclick: async () => { if (await LM.ask(`Delete the ${r.kind.toLowerCase()} as of ${r.end}?`)) { await LM.db.del('datasets', r.id); reload(); } } }, 'Delete') }], sets.map((s) => ({ ...s, kind: KIND_LABEL[kindOf(s)] })), { sort: 'end' }));
      }
      await reload();
    },
  };
})();
