/* Manual punch tab: the uploaded HTML report is kept and shown as it is (Report), and its store figures are summarised (Summary, Stores). */
(function () {
  const LM = window.LM; const { h, num, compact } = LM; const M = LM.manualpunch; LM.depts = LM.depts || {};
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dstr = (d) => (d && /^\d{4}-\d\d-\d\d$/.test(d) ? `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : d || '–');
  const kpi = (l, v, d) => h('div', { class: 'card kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
  const card = (t, ...k) => h('div', { class: 'card', style: 'margin-bottom:12px' }, t ? h('h3', {}, t) : null, ...k);
  const chartCard = (t, id, ht) => h('div', { class: 'card' }, h('h3', {}, t), h('div', { class: 'chart', id, style: ht ? `height:${ht}px` : '' }));
  const p2 = (v) => (v == null || !isFinite(v) ? '–' : (+v).toFixed(2) + '%');
  const sar = (v) => (v == null ? '–' : num(Math.round(v)));
  const pp = (a, b) => { if (a == null || b == null) return ''; const d = Math.round((a - b) * 100) / 100; return h('span', { class: d <= 0 ? 'up' : 'down' }, `${d <= 0 ? '▼' : '▲'} ${Math.abs(d).toFixed(2)} pp`); };
  const pctCell = (v, had) => (!had ? h('span', { class: 'sub' }, '–') : h('span', { style: v >= 20 ? 'color:var(--bad);font-weight:700' : v >= 8 ? 'color:var(--warn);font-weight:600' : '' }, v + '%'));

  async function chartSource() { for (const s of document.scripts) { const t = s.textContent; if (t && t.length > 100000 && /Chart\.js v\d/.test(t.slice(0, 400))) return t; } try { const r = await fetch('vendor/chart.umd.js'); if (r.ok) return await r.text(); } catch (e) { /* offline file */ } return null; }

  LM.depts.manualpunch = {
    id: 'manualpunch', label: 'Manual punch',
    async mount(panel) {
      let sets = [], cur = null, sub = 'Summary', q = '', flt = 'All';
      const reload = async () => { sets = (await LM.db.all('datasets')).filter((d) => d.dept === 'manualpunch').sort((a, b) => (a.end < b.end ? 1 : -1)); if (!sets.find((s) => s.id === cur)) cur = sets[0] ? sets[0].id : null; draw(); };

      async function upload(file) {
        let rf; try { const r = await LM.readBinary(file); rf = { text: new TextDecoder('utf-8').decode(r.buf), name: r.name, hash: r.hash }; } catch (e) { return LM.say(e.message); }
        const tpl = { dept: 'manualpunch', ...((await LM.db.get('templates', 'manualpunch')) || {}) }; const ov = {}; const run = () => M.analyze(rf, sets, tpl, ov); let res = run();
        const info = () => { const d = res.ds && res.ds.data; const c = res.ds ? M.compute(res.ds) : null; return {
          title: `Review before processing: ${rf.name}`, issues: res.issues,
          facts: d ? [['Runs to', res.ds.end], ['Stores', d.stores.length], ['Periods', d.periods.length], [c.latest.label, p2(c.latest.pct)], ['Stores at 3%+', c.over3.length]] : [['Report', 'Not recognised']],
          approveLabel: res.ds && sets.some((s) => s.end === res.ds.end) ? 'Approve & replace existing' : 'Approve & process',
          onFix: (fix, val) => { if (fix.type === 'asOf') ov.asOf = { date: val }; res = run(); dlg.update(info()); },
          onApprove: async () => { if (!res.ds || res.issues.some((i) => i.level === 'error')) throw new Error('Fix the errors first.'); const d = res.ds; const old = sets.find((s) => s.end === d.end);
            if (old) { await LM.db.put('history', { ...old, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', old.id); }
            const rec = { id: LM.uid(), dept: 'manualpunch', type: 'manualpunch', start: d.start, end: d.end, fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), data: d.data };
            await LM.db.put('datasets', rec); await LM.db.put('templates', { ...tpl, dept: 'manualpunch', knownStores: [...new Set([...(tpl.knownStores || []), ...d.data.stores.map((s) => s.store)])] }); cur = rec.id; LM.toast(`Manual punch report to ${d.end} processed`); await reload(); } }; };
        const dlg = LM.review(info());
      }

      const body = h('div');
      function draw() {
        LM.killCharts();
        const sel = sets.length > 1 ? h('select', { class: 'sel', onchange: (e) => { cur = e.target.value; draw(); } }, sets.map((s) => h('option', { value: s.id, selected: s.id === cur }, 'To ' + s.end))) : null;
        panel.replaceChildren(h('div', { class: 'head' }, h('h2', {}, 'Manual punch'), sel, h('div', { class: 'spacer' }), LM.filePicker(upload, 'Upload manual punch report (.html)', false, '.html,.htm')), body);
        LM.dropZone(panel, upload);
        const ds = sets.find((s) => s.id === cur);
        if (!ds) return body.replaceChildren(h('div', { class: 'empty' }, h('h3', {}, 'No manual punch report uploaded yet'), h('p', { class: 'sub' }, 'Drop the Manual Punch Dashboard (.html). It is shown exactly as it is, and its store figures are summarised here.')));
        const c = M.compute(ds); const tabs = ['Summary', 'Stores', 'Report', 'Uploads'];
        body.replaceChildren(h('div', { class: 'sub', style: 'margin-bottom:8px' }, `${ds.data.title || 'Manual punch report'} · runs to ${dstr(ds.end)} · ${ds.fileName} · uploaded ${ds.uploadedAt.slice(0, 16).replace('T', ' ')}`), h('div', { class: 'subtabs' }, tabs.map((t) => h('button', { class: t === sub ? 'on' : '', onclick: () => { sub = t; draw(); } }, t))), { Summary: summary, Stores: stores, Report: report, Uploads: uploads }[sub](ds, c));
      }

      function summary(ds, c) {
        const L = c.L, V = c.V; const lat = c.latest, prv = c.prev; const mt = c.mtd; const sep = c.periods.find((p) => /sep/i.test(p.key));
        const high = c.over3; const act = c.active;
        const find = [`Company-wide manual punch was ${p2(lat.pct)} of sales in ${lat.label}${prv ? ` (${p2(prv.pct)} in ${prv.label})` : ''}, SAR ${sar(lat.manual)} of SAR ${sar(lat.total)}.`, mt ? `Month to date it is ${p2(mt.pct)}${sep ? ` against ${p2(sep.pct)} in ${sep.label}` : ''}.` : null, c.better != null ? `${c.better} stores improved and ${c.worse} got worse against ${prv.label} (${act} stores traded).` : null, `${high.length} store(s) are at 3% or more in ${lat.label}; ${c.over10.length} are above 10%.`, c.top3.length ? `The three biggest in manual value (${c.top3.map((s) => s.store.split(',')[0]).join(', ')}) are ${(c.top3Share * 100).toFixed(0)}% of manual sales; the rest of the network is at ${p2(c.restPct)}.` : null, c.recovered.length ? `${c.recovered.length} store(s) that were at 3% or more in ${prv.label} are now below 3%.` : null].filter(Boolean);
        const hcols = [{ k: 'name', label: 'Store', l: 1, cls: 'wrap' }, { k: 'pct', label: `${lat.label} %`, fmt: (v) => pctCell(v, true) }, { k: 'prev', label: prv ? `${prv.label} %` : '', fmt: (v, r) => (r.hadPrev ? v + '%' : '–') }, { k: 'chg', label: 'Change', fmt: (v, r) => (r.hadPrev ? pp(r.pct, r.prev) : '') }, { k: 'manual', label: 'Manual (SAR)', fmt: sar }, { k: 'total', label: 'Sales (SAR)', fmt: sar }, { k: 'reason', label: 'Reason', l: 1, cls: 'wrap' }, { k: 'action', label: 'Action', l: 1, cls: 'wrap' }];
        const hrows = high.map((s) => ({ name: s.store, pct: s.p[L].pct, prev: V >= 0 ? s.p[V].pct : null, hadPrev: V >= 0 && s.p[V].total > 0, manual: s.p[L].manual, total: s.p[L].total, reason: s.reason, action: s.action }));
        const rrows = c.recovered.map((s) => ({ name: s.store, pct: s.p[L].total > 0 ? s.p[L].pct : 0, prev: s.p[V].pct, hadPrev: true, manual: s.p[L].manual, total: s.p[L].total, reason: s.reason, action: s.action }));
        const el = h('div', {}, h('div', { class: 'grid kpis' }, kpi(lat.label, p2(lat.pct), prv ? h('span', {}, pp(lat.pct, prv.pct), ` vs ${prv.label}`) : `SAR ${sar(lat.manual)}`), mt ? kpi('Month to date', p2(mt.pct), `SAR ${sar(mt.manual)} of ${compact(mt.total)}`) : null, sep ? kpi(sep.label, p2(sep.pct), `SAR ${sar(sep.manual)}`) : null, kpi('Stores at 3%+', high.length, `of ${act} trading in ${lat.label}`), kpi('Stores above 10%', c.over10.length, c.over10.map((s) => s.store.split(',')[0]).join(', ')), c.better != null ? kpi('Better / worse', `${c.better} / ${c.worse}`, `vs ${prv.label}`) : null),
          card('What stands out', h('ul', { class: 'findings' }, find.map((t) => h('li', {}, t)))),
          h('div', { class: 'grid half', style: 'margin-bottom:12px' }, chartCard('Manual punch as % of sales', 'c1', 280), chartCard('Manual punch value (SAR)', 'c2', 280)),
          card(`Stores at 3% or more in ${lat.label} (${high.length})`, h('div', { class: 'sub', style: 'margin-bottom:6px' }, 'Sorted by manual value. Reasons and actions are those written in the report.'), high.length ? LM.table(hcols, hrows, { sort: 'manual' }) : h('span', { class: 'sub' }, 'None.')),
          c.recovered.length ? card(`Recovered since ${prv.label} (${c.recovered.length})`, LM.table(hcols, rrows, { sort: 'prev' })) : null,
          ds.data.notes.length ? card('Notes in the report', h('ul', { class: 'findings' }, ds.data.notes.map((t) => h('li', {}, t)))) : null);
        setTimeout(() => { LM.chart(el.querySelector('#c1'), { type: 'line', data: { labels: c.periods.map((p) => p.label), datasets: [{ data: c.periods.map((p) => p.pct), borderColor: '#0F6E56', backgroundColor: '#0F6E56', tension: 0, pointRadius: 3 }] }, options: { plugins: { legend: { display: false }, valueLabels: { suffix: '%' } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + '%' } } } } });
          LM.chart(el.querySelector('#c2'), { type: 'bar', data: { labels: c.periods.map((p) => p.label), datasets: [{ data: c.periods.map((p) => Math.round(p.manual)), backgroundColor: LM.css('--accent') }] }, options: { plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (v) => compact(v) } } } } }); }); return el;
      }

      function stores(ds, c) {
        const P = c.periods; const rows = ds.data.stores.map((s) => { const o = { name: s.store, reason: s.reason, action: s.action, active: s.p[c.L].total > 0, anyOver10: s.p.some((x) => x.total > 0 && x.pct > 10), over3: s.p[c.L].total > 0 && s.p[c.L].pct >= 3, lastManual: s.p[c.L].manual }; P.forEach((p, i) => { o['p' + i] = s.p[i].pct; o['h' + i] = s.p[i].total > 0; }); return o; });
        const cols = [{ k: 'name', label: 'Store', l: 1, cls: 'wrap' }, ...P.map((p, i) => ({ k: 'p' + i, label: p.label + ' %', fmt: (v, r) => pctCell(v, r['h' + i]) })), { k: 'lastManual', label: `Manual ${P[c.L].label} (SAR)`, fmt: sar }, { k: 'reason', label: 'Reason', l: 1, cls: 'wrap' }, { k: 'action', label: 'Action', l: 1, cls: 'wrap' }];
        const t = LM.table(cols, rows, { sort: 'lastManual', limit: 200 }); const cnt = h('span', { class: 'sub' });
        const apply = () => { const v = q.trim().toLowerCase(); const f = rows.filter((r) => (flt === 'All' || (flt === 'Trading in latest period' && r.active) || (flt === '3% or more in latest period' && r.over3) || (flt === 'Any period above 10%' && r.anyOver10)) && (!v || r.name.toLowerCase().includes(v))); t.redraw(f); cnt.textContent = `${f.length} of ${rows.length} stores`; return f; };
        const sel = h('select', { class: 'sel', onchange: (e) => { flt = e.target.value; apply(); } }, ['All', 'Trading in latest period', '3% or more in latest period', 'Any period above 10%'].map((o) => h('option', { value: o, selected: o === flt }, o)));
        const search = h('input', { type: 'search', placeholder: 'Search store…', value: q, oninput: () => { q = search.value; apply(); } });
        setTimeout(apply);
        return h('div', {}, h('div', { class: 'sub', style: 'margin-bottom:8px' }, 'A dash means the store had no sales in that period. Orange is 8% or more, red 20% or more.'), h('div', { class: 'tools' }, sel, search, cnt, h('div', { class: 'spacer' }), h('button', { class: 'btn small', onclick: () => LM.csv(cols, apply(), `manual-punch-stores-${ds.end}.csv`) }, 'Export CSV')), t);
      }

      function report(ds) {
        const host = h('div', {}, h('div', { class: 'sub', style: 'margin-bottom:8px' }, 'The uploaded report, exactly as it was sent. It runs inside a sandbox and cannot reach the rest of the dashboard.'), h('div', { class: 'banner' }, 'Loading the report…'));
        chartSource().then((src) => {
          let html = ds.data.html; const safe = (t) => t.replace(/<\/(script)/gi, '<\\/$1'); if (src) html = html.replace(/<script[^>]+src=["']https?:[^"']*chart[^"']*["'][^>]*><\/script>/i, () => `<script>${safe(src)}</script>`);
          const f = h('iframe', { sandbox: 'allow-scripts', style: 'width:100%;height:85vh;border:1px solid var(--line);border-radius:10px;background:#fff', title: 'Manual punch report' }); f.srcdoc = html; host.replaceChildren(host.firstChild, f, h('div', { class: 'sub', style: 'margin-top:6px' }, 'If the frame stays blank in this view, use the Summary and Stores tabs, which show the same figures.'));
        }); return host;
      }

      function uploads() {
        return card('Uploaded manual punch reports', LM.table([{ k: 'end', label: 'Runs to', l: 1, fmt: dstr }, { k: 'fileName', label: 'File', l: 1 }, { k: 'n', label: 'Stores', fmt: num }, { k: 'uploadedAt', label: 'Uploaded', l: 1, fmt: (v) => v.slice(0, 16).replace('T', ' ') }, { k: 'x', label: '', fmt: (v, r) => h('button', { class: 'btn small danger', onclick: async () => { if (await LM.ask(`Delete the manual punch report to ${r.end}?`)) { await LM.db.del('datasets', r.id); reload(); } } }, 'Delete') }], sets.map((s) => ({ ...s, n: s.data.stores.length })), { sort: 'end' }));
      }
      await reload();
    },
  };
})();
