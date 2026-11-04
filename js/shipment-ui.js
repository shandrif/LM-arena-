/* Shipment tab: inbound shipment tracker (arrivals, delays, containers). */
(function () {
  const LM = window.LM; const { h, num, compact } = LM; const S = LM.shipment; LM.depts = LM.depts || {};
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dstr = (d) => (d && /^\d{4}-\d\d-\d\d$/.test(d) ? `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : d ? String(d) : '–');
  const dshort = (d) => (d && /^\d{4}-\d\d-\d\d$/.test(d) ? `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}` : '–');
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const kpi = (l, v, d) => h('div', { class: 'card kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
  const card = (t, ...k) => h('div', { class: 'card', style: 'margin-bottom:12px' }, t ? h('h3', {}, t) : null, ...k);
  const chartCard = (t, id, ht) => h('div', { class: 'card' }, h('h3', {}, t), h('div', { class: 'chart', id, style: ht ? `height:${ht}px` : '' }));
  const pill = (t, cls, style) => h('span', { class: 'pill ' + (cls || ''), style }, t);
  const WARN = 'background:var(--warn-bg);color:var(--warn)';
  const short = (s) => s.replace('Arrived, awaiting delivery', 'Awaiting delivery').replace('Manifested, in transit', 'Manifested');
  const statusPill = (s) => (s === 'Delivered' ? pill(s, 'new') : s === 'Delayed' ? pill(s, 'closed') : /Customs|Arrived|Not manifested/.test(s) ? pill(short(s), '', WARN) : pill(short(s), ''));
  const box = (w) => (v) => h('span', { style: `display:inline-block;width:${w};white-space:normal;line-height:1.35;word-break:break-word` }, v || '');
  const barH = (el, items, color) => LM.chart(el, { type: 'bar', data: { labels: items.map((x) => x[0]), datasets: [{ data: items.map((x) => x[1]), backgroundColor: color || LM.css('--accent') }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 } } } } });
  const SCOL = { 'Delayed': '#b3261e', 'Customs hold': '#c2851f', 'Arrived, awaiting delivery': '#d9a441', 'Not manifested': '#a8456b', 'Manifested, in transit': '#5b6fb5', 'In transit': '#2c7a7b', 'Not departed yet': '#8a8a8a', 'Delivered': '#1d7a46' };

  LM.depts.shipment = {
    id: 'shipment', label: 'Shipment',
    async mount(panel) {
      let sets = [], cur = null, sub = 'Arrivals', fSt = 'All', fCat = 'All', fPod = 'All', q = '';
      const reload = async () => { sets = (await LM.db.all('datasets')).filter((d) => d.dept === 'shipment').sort((a, b) => (a.end < b.end ? 1 : -1)); if (!sets.find((s) => s.id === cur)) cur = sets[0] ? sets[0].id : null; draw(); };

      async function upload(file) {
        let rf; try { rf = await LM.readFile(file); } catch (e) { return LM.say(e.message); }
        const tpl = { dept: 'shipment', ...((await LM.db.get('templates', 'shipment')) || {}) }; const ov = {}; const run = () => S.analyze(rf, sets, tpl, ov); let res = run();
        const info = () => { const d = res.ds; const c = d ? S.compute(d) : null; return {
          title: `Review before processing: ${rf.name}`, issues: res.issues,
          facts: d ? [['As of', d.end], ['Shipments', c.n], ['Not delivered', c.active.length], ['Delayed', c.byStatus.filter((x) => x.name === 'Delayed').reduce((s, x) => s + x.n, 0)], ['Containers on the way', c.cntrActive]] : [['Report', res.issues.some((i) => i.fix) ? 'Needs a date' : 'Not recognised']],
          approveLabel: res.ds && sets.some((s) => s.end === res.ds.end) ? 'Approve & replace existing' : 'Approve & process',
          onFix: (fix, val) => { if (fix.type === 'asOf') ov.asOf = { date: val }; res = run(); dlg.update(info()); },
          onApprove: async () => { if (!res.ds || res.issues.some((i) => i.level === 'error')) throw new Error('Fix the errors first.'); const d = res.ds; const old = sets.find((s) => s.end === d.end);
            if (old) { await LM.db.put('history', { ...old, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', old.id); }
            const rec = { id: LM.uid(), dept: 'shipment', type: 'shipment', start: d.start, end: d.end, fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), data: d.data };
            await LM.db.put('datasets', rec); await LM.db.put('templates', { ...tpl, dept: 'shipment', knownTerms: [...new Set([...(tpl.knownTerms || []), ...d.data.rows.map((x) => x.terms).filter(Boolean)])], knownPods: [...new Set([...(tpl.knownPods || []), ...d.data.rows.map((x) => x.pod).filter(Boolean)])] });
            cur = rec.id; LM.toast(`Shipments as of ${d.end} processed`); await reload(); } }; };
        const dlg = LM.review(info());
      }

      const body = h('div');
      function draw() {
        LM.killCharts();
        const sel = sets.length > 1 ? h('select', { class: 'sel', onchange: (e) => { cur = e.target.value; draw(); } }, sets.map((s) => h('option', { value: s.id, selected: s.id === cur }, 'As of ' + s.end))) : null;
        panel.replaceChildren(h('div', { class: 'head' }, h('h2', {}, 'Shipment'), sel, h('div', { class: 'spacer' }), LM.filePicker(upload, 'Upload shipment file')), body);
        LM.dropZone(panel, upload);
        const ds = sets.find((s) => s.id === cur);
        if (!ds) return body.replaceChildren(h('div', { class: 'empty' }, h('h3', {}, 'No shipment file uploaded yet'), h('p', { class: 'sub' }, 'Drop the shipment arrivals workbook (.xlsx): one row per shipment with Supplier, Items, Terms, CNTR, BL, ETD, ETA, POD and Remarks.')));
        const c = S.compute(ds); const tabs = ['Arrivals', 'Needs attention', 'All shipments', 'Suppliers', 'Uploads'];
        body.replaceChildren(h('div', { class: 'sub', style: 'margin-bottom:8px' }, `Status as of ${dstr(ds.end)} · ${ds.fileName} · uploaded ${ds.uploadedAt.slice(0, 16).replace('T', ' ')}`), h('div', { class: 'subtabs' }, tabs.map((t) => h('button', { class: t === sub ? 'on' : '', onclick: () => { sub = t; draw(); } }, t))),
          { Overview: overview, Arrivals: arrivals, 'Needs attention': attention, 'All shipments': all, Suppliers: suppliers, Uploads: uploads }[sub](ds, c));
      }
      const cols = (extra, full) => { const a = [{ k: 'supplier', label: 'Supplier', l: 1, fmt: box('140px') }, { k: 'items', label: 'Items', l: 1, fmt: box('190px') }, ...(full ? [{ k: 'category', label: 'Category', l: 1 }] : []), { k: 'cntrShow', label: 'Cntr', fmt: (v) => v }, { k: 'bl', label: 'BL', l: 1, fmt: box('150px') }, ...(full ? [{ k: 'terms', label: 'Terms', l: 1 }, { k: 'etd', label: 'ETD', l: 1, fmt: dshort }] : []), { k: 'eta', label: 'ETA', l: 1, fmt: (v) => (v ? dshort(v) : h('span', { class: 'sub' }, 'no ETA')) }, { k: 'pod', label: 'POD', l: 1 }, { k: 'status', label: 'Status', l: 1, fmt: (v) => statusPill(v) }, ...(extra || []), { k: 'remarkShow', label: 'Remarks', l: 1, fmt: (v) => box('240px')(v) }]; return a; };
      const prep = (list, asOf) => list.map((x) => ({ ...x, cntrShow: x.cntr != null ? x.cntr : x.cntrRaw || '–', remarkShow: x.remarkText || (x.remarkDate ? `Date in remarks: ${dstr(x.remarkDate)}` : ''), left: x.eta ? days(asOf, x.eta) : null }));

      function overview(ds, c) {
        const cnt = (s) => c.byStatus.find((x) => x.name === s) || { n: 0, cntr: 0 }; const nmL = c.active.filter((x) => x.remark && x.remark.stage === 'notmanifested'); const d14 = c.within(14), d30 = c.within(30); const late = cnt('Delayed'), arr = cnt('Arrived, awaiting delivery'), cus = cnt('Customs hold'), nm = { n: nmL.length, cntr: nmL.reduce((a, x) => a + (x.cntr || 0), 0) };
        const worst = c.overdue.filter((x) => x.lateDays > 0).slice(0, 3);
        const F = [`${c.active.length} of ${c.n} shipments are still on the way (${c.cntrActive} containers); ${c.delivered} delivered.`, `${late.n} delayed, ${cus.n} held at customs and ${arr.n} arrived but not yet delivered to the warehouse (${late.cntr + cus.cntr + arr.cntr} containers need action).`, d14.length ? `${d14.length} shipment(s) are due within 14 days, ${d30.length} within 30 days.` : 'No arrivals are due within 14 days.', worst.length ? `Longest past ETA: ${worst.map((x) => `${x.supplier} / ${x.bl} (${x.lateDays} days)`).join('; ')}.` : null, c.noEta.length ? `${c.noEta.length} shipment(s) have no ETA.` : null].filter(Boolean);
        const el = h('div', {}, h('div', { class: 'grid kpis' }, kpi('Shipments listed', c.n, `${c.delivered} delivered`), kpi('On the way', c.active.length, `${c.cntrActive} containers`), kpi('Due in 14 days', d14.length, `${d30.length} in 30 days`), kpi('Delayed', late.n, `${late.cntr} containers`), kpi('Arrived, not delivered', arr.n, `${arr.cntr} containers · pulled out / in yard`), kpi('Customs hold', cus.n, `${cus.cntr} containers`), kpi('Not manifested', nm.n, `${nm.cntr} containers · shipping line has not manifested`), kpi('Average transit', c.avgTransit == null ? '–' : Math.round(c.avgTransit) + ' days', 'ETD to ETA')),
          card('What stands out', h('ul', { class: 'findings' }, F.map((t) => h('li', {}, t)))),
          h('div', { class: 'grid half', style: 'margin-bottom:12px' }, chartCard('Shipments by status', 'c1', 300), chartCard('Arrivals per week (not yet delivered)', 'c2', 300)),
          h('div', { class: 'grid half' }, chartCard('On the way by category', 'c3', 240), chartCard('On the way by port of discharge', 'c4', 240)));
        setTimeout(() => { const bs = c.byStatus; LM.chart(el.querySelector('#c1'), { type: 'bar', data: { labels: bs.map((x) => x.name), datasets: [{ data: bs.map((x) => x.n), backgroundColor: bs.map((x) => SCOL[x.name]) }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 } } } } });
          LM.chart(el.querySelector('#c2'), { type: 'bar', data: { labels: c.weeks.map((w) => 'wk ' + dshort(w.week)), datasets: [{ label: 'Shipments', data: c.weeks.map((w) => w.n), backgroundColor: LM.css('--accent') }] }, options: { plugins: { legend: { display: false } }, scales: { y: { ticks: { precision: 0 } } } } });
          barH(el.querySelector('#c3'), c.byCategory.map((x) => [x.name, x.n]), '#6b46c1'); barH(el.querySelector('#c4'), c.byPod.map((x) => [x.name, x.n]), '#2c7a7b'); }); return el;
      }

      function arrivals(ds, c) {
        const rows = prep(c.upcoming, ds.end); const groups = [['Within 7 days', 0, 7], ['8 – 14 days', 8, 14], ['15 – 30 days', 15, 30], ['31 – 60 days', 31, 60], ['Later than 60 days', 61, 9999]];
        const body2 = groups.map(([t, a, b]) => { const g = rows.filter((x) => x.left >= a && x.left <= b); return card(`${t} (${g.length})`, g.length ? LM.table(cols(), g, { sort: 'eta', dir: 1 }) : h('span', { class: 'sub' }, 'No arrivals.')); });
        return h('div', {}, h('div', { class: 'sub', style: 'margin-bottom:8px' }, 'Shipments not yet delivered with an ETA on or after the as-of date.'), ...body2, c.noEta.length ? card(`No ETA yet (${c.noEta.length})`, LM.table(cols(), prep(c.noEta, ds.end), { sort: 'supplier' })) : null);
      }

      function attention(ds, c) {
        const rows = prep(c.overdue, ds.end); const gp = (st) => rows.filter((x) => x.status === st);
        const ex = [{ k: 'lateDays', label: 'Days late', fmt: (v) => (v ? h('b', { style: 'color:var(--bad)' }, v) : '–') }];
        const part = (t, st, note) => card(`${t} (${gp(st).length})`, note ? h('div', { class: 'sub', style: 'margin-bottom:6px' }, note) : null, gp(st).length ? LM.table(cols(ex), gp(st), { sort: 'lateDays' }) : h('span', { class: 'sub' }, 'None.'));
        return h('div', {}, part('Delayed', 'Delayed', 'Not delivered and past ETA, or the remarks mention a delay.'), part('Customs hold', 'Customs hold', 'Manifested but not discharged or waiting for the Bayan / customs release.'), part('Arrived, awaiting delivery to warehouse', 'Arrived, awaiting delivery', 'Pulled out or in the yard / terminal; waiting for warehouse space or delivery instructions.'),
          card(`Not manifested (${prep(c.active.filter((x) => x.remark && x.remark.stage === 'notmanifested'), ds.end).length})`, h('div', { class: 'sub', style: 'margin-bottom:6px' }, 'The remarks say the shipment is not manifested yet (some of these are also delayed, listed above).'), LM.table(cols(), prep(c.active.filter((x) => x.remark && x.remark.stage === 'notmanifested'), ds.end), { sort: 'eta', dir: 1 })));
      }

      function all(ds, c) {
        const rows = prep(ds.data.rows, ds.end); const sts = ['All', ...[...new Set(rows.map((x) => x.status))]], cats = ['All', ...S.CATS], pods = ['All', ...[...new Set(rows.map((x) => x.pod))].sort()];
        const t = LM.table(cols(null, true), rows, { sort: 'eta', dir: 1, limit: 200 }); const cntEl = h('span', { class: 'sub' });
        const apply = () => { const v = q.trim().toLowerCase(); const f = rows.filter((x) => (fSt === 'All' || x.status === fSt) && (fCat === 'All' || x.category === fCat) && (fPod === 'All' || x.pod === fPod) && (!v || `${x.supplier} ${x.items} ${x.bl} ${x.remarkShow}`.toLowerCase().includes(v))); t.redraw(f); cntEl.textContent = `${f.length} of ${rows.length}`; return f; };
        const mk = (label, cur2, opts, set) => h('select', { class: 'sel', onchange: (e) => { set(e.target.value); apply(); } }, opts.map((o) => h('option', { value: o, selected: o === cur2 }, o === 'All' ? label + ': all' : o)));
        const search = h('input', { type: 'search', placeholder: 'Search supplier, item, BL…', value: q, oninput: () => { q = search.value; apply(); } });
        setTimeout(apply);
        return h('div', {}, h('div', { class: 'tools' }, mk('Status', fSt, sts, (v) => (fSt = v)), mk('Category', fCat, cats, (v) => (fCat = v)), mk('Port', fPod, pods, (v) => (fPod = v)), search, cntEl, h('div', { class: 'spacer' }), h('button', { class: 'btn small', onclick: () => LM.csv(cols(null, true), apply(), `shipments-${ds.end}.csv`) }, 'Export CSV')), t);
      }

      function suppliers(ds, c) {
        const rows = c.bySupplier.map((s) => { const L = c.active.filter((x) => x.supplier === s.name); return { name: s.name, n: s.n, cntr: s.cntr, delayed: L.filter((x) => x.status === 'Delayed').length, next: (L.filter((x) => x.eta && x.eta >= ds.end).sort((a, b) => (a.eta < b.eta ? -1 : 1))[0] || {}).eta || null, items: [...new Set(L.map((x) => x.category))].join(', ') }; });
        const el = h('div', {}, chartCard('Containers on the way by supplier', 'c1', Math.max(240, rows.length * 24 + 60)), card('Suppliers with shipments on the way', LM.table([{ k: 'name', label: 'Supplier', l: 1, cls: 'wrap' }, { k: 'items', label: 'Categories', l: 1 }, { k: 'n', label: 'Shipments', fmt: num }, { k: 'cntr', label: 'Containers', fmt: num }, { k: 'delayed', label: 'Delayed', fmt: (v) => (v ? h('b', { style: 'color:var(--bad)' }, v) : '0') }, { k: 'next', label: 'Next ETA', l: 1, fmt: dshort }], rows, { sort: 'cntr' })));
        setTimeout(() => barH(el.querySelector('#c1'), [...rows].sort((a, b) => b.cntr - a.cntr).map((x) => [x.name.slice(0, 32), x.cntr]), '#b7791f')); return el;
      }

      function uploads() {
        return card('Uploaded shipment lists', LM.table([{ k: 'end', label: 'As of', l: 1 }, { k: 'fileName', label: 'File', l: 1 }, { k: 'n', label: 'Shipments', fmt: num }, { k: 'uploadedAt', label: 'Uploaded', l: 1, fmt: (v) => v.slice(0, 16).replace('T', ' ') }, { k: 'x', label: '', fmt: (v, r) => h('button', { class: 'btn small danger', onclick: async () => { if (await LM.ask(`Delete the shipment list as of ${r.end}?`)) { await LM.db.del('datasets', r.id); reload(); } } }, 'Delete') }], sets.map((s) => ({ ...s, n: s.data.rows.length })), { sort: 'end' }));
      }
      await reload();
    },
  };
})();
