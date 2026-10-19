/* Real estate section inside the Others tab: lease register review + views. */
(function () {
  const LM = window.LM; const { h, num, compact } = LM; const RE = LM.realestate;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dstr = (d) => (d && /^\d{4}-\d\d-\d\d$/.test(d) ? `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : d ? String(d) : '–');
  const kpi = (l, v, d) => h('div', { class: 'card kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
  const card = (t, ...k) => h('div', { class: 'card', style: 'margin-bottom:12px' }, t ? h('h3', {}, t) : null, ...k);
  const chartCard = (t, id, ht) => h('div', { class: 'card' }, h('h3', {}, t), h('div', { class: 'chart', id, style: ht ? `height:${ht}px` : '' }));
  const pill = (t, cls, style) => h('span', { class: 'pill ' + (cls || ''), style }, t);
  const ar = (v) => h('span', { dir: 'auto' }, v == null ? '' : String(v));
  const sar = (v) => (v == null ? '–' : num(Math.round(v)));
  const statusPill = (s) => (s === 'Operating' ? pill(s, 'new') : /not/i.test(s) || s === 'Unknown' ? pill(s, '', 'background:var(--warn-bg);color:var(--warn)') : pill(s, ''));
  const bar = (el, items, color, horiz, fmt) => LM.chart(el, { type: 'bar', data: { labels: items.map((x) => x[0]), datasets: [{ data: items.map((x) => x[1]), backgroundColor: color || LM.css('--accent') }] }, options: { indexAxis: horiz ? 'y' : 'x', plugins: { legend: { display: false } }, scales: { [horiz ? 'x' : 'y']: { ticks: { precision: 0, callback: fmt ? (v) => fmt(v) : undefined } } } } });

  const state = { sub: 'Overview', city: 'All', status: 'All', q: '' };

  function rowObjs(ds) { return ds.data.rows.map((x) => ({ ...x })); }
  const contractCols = [{ k: 'no', label: '#' }, { k: 'name', label: 'Branch', l: 1, cls: 'wrap', fmt: (v) => ar(v) }, { k: 'cityEn', label: 'City', l: 1 }, { k: 'district', label: 'District', l: 1, fmt: (v) => ar(v) }, { k: 'status', label: 'Status', l: 1, fmt: (v) => statusPill(v) }, { k: 'type', label: 'Type', l: 1 }, { k: 'area', label: 'Area m²', fmt: (v) => (v == null ? '–' : num(v)) }, { k: 'rentRate', label: 'Annual rent', fmt: sar }, { k: 'ppmCalc', label: 'Rent / m²', fmt: sar }, { k: 'start', label: 'Start', l: 1, fmt: dstr }, { k: 'term', label: 'Term (yrs)' }, { k: 'end', label: 'End', l: 1, fmt: (v, r) => (v ? dstr(v) : r.endRaw ? ar(r.endRaw) : '–') }, { k: 'licence', label: 'Licence', l: 1 }, { k: 'sign', label: 'Signboard', l: 1 }, { k: 'handover', label: 'Handover', l: 1 }];

  async function upload(rf, ctx) {
    const tpl = (await LM.db.get('templates', 'realestate')) || {}; const ov = {};
    const run = () => RE.analyze(rf, ctx.sets, tpl, ov); let res = run();
    const info = () => { const d = res.ds && res.ds.data; const c = d ? RE.compute(res.ds) : null; return {
      title: `Review before processing: ${rf.name}`, issues: res.issues,
      facts: d ? [['Report month', res.ds.end.slice(0, 7)], ['Contracts', num(c.n)], ['Annual rent (SAR)', compact(c.rentTotal)], ['Not yet open', c.pipeline.length], ['Expiring in 12 months', c.within(365).length]] : [['Report', 'Not recognised']],
      approveLabel: res.ds && ctx.sets.some((s) => s.end === res.ds.end) ? 'Approve & replace existing' : 'Approve & process',
      onFix: (fix, val) => { if (fix.type === 'asOf') ov.asOf = { date: val }; res = run(); dlg.update(info()); },
      onApprove: async () => { if (!res.ds || res.issues.some((i) => i.level === 'error')) throw new Error('Fix the errors first.'); const d = res.ds; const old = ctx.sets.find((s) => s.end === d.end);
        if (old) { await LM.db.put('history', { ...old, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', old.id); }
        const rec = { id: LM.uid(), dept: 'others', type: 'realestate', start: d.start, end: d.end, fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), data: d.data };
        await LM.db.put('datasets', rec);
        const known = { knownStatuses: [...new Set(d.data.rows.map((x) => x.status))], knownTypes: [...new Set(d.data.rows.map((x) => x.type).filter(Boolean))], knownCities: [...new Set(d.data.rows.map((x) => x.cityEn))] };
        await LM.db.put('templates', { ...tpl, dept: 'realestate', id: 'realestate', ...known });
        LM.toast(`Real estate ${d.end.slice(0, 7)} processed`); ctx.done(rec.id); } }; };
    const dlg = LM.review(info());
  }

  function view(host, sets, ctx) {
    let cur = ctx.cur && sets.find((s) => s.id === ctx.cur) ? ctx.cur : sets[0].id;
    const body = h('div');
    const draw = () => {
      LM.killCharts(); ctx.cur = cur; const ds = sets.find((s) => s.id === cur); const c = RE.compute(ds);
      ds.data.rows.forEach((x) => { x.ppmCalc = x.area && x.rent1 ? x.rent1 / x.area : null; });
      const tabs = ['Overview', 'Contracts', 'Expiry & renewals', 'Pipeline', 'Rent', 'Network summary', 'Uploads'];
      const sel = sets.length > 1 ? h('select', { class: 'sel', onchange: (e) => { cur = e.target.value; draw(); } }, sets.map((s) => h('option', { value: s.id, selected: s.id === cur }, 'Register of ' + s.end.slice(0, 7)))) : null;
      body.replaceChildren(h('div', { class: 'tools' }, sel, h('span', { class: 'sub' }, `${ds.fileName} · uploaded ${ds.uploadedAt.slice(0, 16).replace('T', ' ')} · landlord / contact details are not stored`)),
        h('div', { class: 'subtabs' }, tabs.map((t) => h('button', { class: t === state.sub ? 'on' : '', onclick: () => { state.sub = t; draw(); } }, t))),
        { Overview: overview, Contracts: contracts, 'Expiry & renewals': expiry, Pipeline: pipeline, Rent: rent, 'Network summary': network, Uploads: uploads }[state.sub](ds, c));
    };
    host.replaceChildren(body); draw();
  }

  function overview(ds, c) {
    const w12 = c.within(365), w24 = c.within(730); const el = h('div', {},
      h('div', { class: 'grid kpis' }, kpi('Contracts', num(c.n), `${ds.data.incomplete.length} incomplete row(s) not counted`), kpi('Annual rent (SAR)', compact(c.rentTotal), `first-year rent ${compact(c.rent1)}`), kpi('Total area', num(c.area) + ' m²', `avg rent ${sar(c.avgPpm)} SAR/m² (first year)`), kpi('Operating', c.opened.length, `${c.pipeline.length} not yet open`), kpi('Expiring in 12 months', w12.length, `${w24.length} within 24 months`), kpi('Already expired', c.expired.length, 'end date before report month end'), kpi('Average term', c.avgTerm.toFixed(1) + ' yrs', 'contract length')),
      h('div', { class: 'grid half', style: 'margin-bottom:12px' }, chartCard('Contracts by city', 'c1', 300), chartCard('Contracts by status', 'c2', 300)),
      h('div', { class: 'grid half' }, chartCard('Annual rent by city (SAR)', 'c3', 300), chartCard('Contracts by property type', 'c4', 300)));
    setTimeout(() => { const top = c.byCity.slice(0, 15); bar(el.querySelector('#c1'), top.map((x) => [x.name, x.n]), null, true); bar(el.querySelector('#c2'), c.byStatus.map((x) => [x.name, x.n]), '#2c7a7b', true);
      const r = [...c.byCity].sort((a, b) => b.rent - a.rent).slice(0, 15); bar(el.querySelector('#c3'), r.map((x) => [x.name, Math.round(x.rent)]), '#b7791f', true, compact); bar(el.querySelector('#c4'), c.byType.map((x) => [x.name, x.n]), '#6b46c1', true); }); return el;
  }

  function contracts(ds) {
    const rows = rowObjs(ds); rows.forEach((x) => { x.ppmCalc = x.area && x.rent1 ? x.rent1 / x.area : null; });
    const cities = ['All', ...[...new Set(rows.map((x) => x.cityEn))].sort()], sts = ['All', ...[...new Set(rows.map((x) => x.status))].sort()];
    const q = h('input', { type: 'search', placeholder: 'Search branch / district (Arabic or English)…', value: state.q });
    const t = LM.table(contractCols, rows, { sort: 'no', dir: 1, limit: 200 });
    const apply = () => { const v = state.q.trim().toLowerCase(); const f = rows.filter((x) => (state.city === 'All' || x.cityEn === state.city) && (state.status === 'All' || x.status === state.status) && (!v || (x.name + ' ' + x.district + ' ' + x.street + ' ' + x.cityEn).toLowerCase().includes(v))); t.redraw(f); cnt.textContent = `${f.length} of ${rows.length}`; return f; };
    q.oninput = () => { state.q = q.value; apply(); };
    const cnt = h('span', { class: 'sub' });
    const mk = (key, opts) => h('select', { class: 'sel', onchange: (e) => { state[key] = e.target.value; apply(); } }, opts.map((o) => h('option', { value: o, selected: o === state[key] }, key === 'city' ? 'City: ' + o : 'Status: ' + o)));
    setTimeout(apply);
    return h('div', {}, h('div', { class: 'tools' }, mk('city', cities), mk('status', sts), q, cnt, h('div', { class: 'spacer' }), h('button', { class: 'btn small', onclick: () => LM.csv(contractCols, apply(), `real-estate-contracts-${ds.end}.csv`) }, 'Export CSV')), t);
  }

  function expiry(ds, c) {
    const w12 = c.within(365), w24 = c.within(730).filter((x) => !w12.includes(x)); const cols = [{ k: 'name', label: 'Branch', l: 1, cls: 'wrap', fmt: (v) => ar(v) }, { k: 'cityEn', label: 'City', l: 1 }, { k: 'status', label: 'Status', l: 1, fmt: (v) => statusPill(v) }, { k: 'end', label: 'Contract end', l: 1, fmt: dstr }, { k: 'left', label: 'Days left', fmt: (v) => (v < 0 ? h('span', { style: 'color:var(--bad);font-weight:600' }, `${-v} overdue`) : num(v)) }, { k: 'rentRate', label: 'Annual rent', fmt: sar }, { k: 'area', label: 'Area m²', fmt: (v) => (v == null ? '–' : num(v)) }];
    const dl = (x) => Math.round((Date.parse(x.end) - Date.parse(ds.end)) / 86400000); const mk = (a) => a.map((x) => ({ ...x, left: dl(x) }));
    const years = Object.keys(c.endYear).sort(); const noEnd = ds.data.rows.filter((x) => !x.end);
    const el = h('div', {}, h('div', { class: 'grid kpis' }, kpi('Already expired', c.expired.length, 'renew or regularise'), kpi('Expiring ≤ 12 months', w12.length, `${compact(w12.reduce((s, x) => s + (x.rentRate || 0), 0))} SAR rent`), kpi('Expiring 12–24 months', w24.length, `${compact(w24.reduce((s, x) => s + (x.rentRate || 0), 0))} SAR rent`), kpi('No end date', noEnd.length, noEnd.map((x) => x.name).join('، ') || 'none')),
      chartCard('Contracts ending per year', 'c1', 280),
      c.expired.length ? card('Contract end date already passed', LM.table(cols, mk(c.expired), { sort: 'end', dir: 1 })) : null,
      card(`Expiring in the next 12 months (${w12.length})`, w12.length ? LM.table(cols, mk(w12), { sort: 'end', dir: 1 }) : h('span', { class: 'sub' }, 'None.')),
      card(`Expiring in 12–24 months (${w24.length})`, w24.length ? LM.table(cols, mk(w24), { sort: 'end', dir: 1 }) : h('span', { class: 'sub' }, 'None.')));
    setTimeout(() => bar(el.querySelector('#c1'), years.map((y) => [y, c.endYear[y].length]), LM.css('--accent'))); return el;
  }

  function pipeline(ds, c) {
    const P = c.pipeline.map((x) => ({ ...x })); const cols = [{ k: 'no', label: '#' }, { k: 'name', label: 'Branch', l: 1, cls: 'wrap', fmt: (v) => ar(v) }, { k: 'cityEn', label: 'City', l: 1 }, { k: 'status', label: 'Status', l: 1, fmt: (v) => statusPill(v) }, { k: 'handover', label: 'Handover', l: 1, fmt: (v, r) => (r.handoverDate ? dstr(r.handoverDate) : v) }, { k: 'licence', label: 'Licence', l: 1 }, { k: 'sign', label: 'Signboard', l: 1 }, { k: 'grace', label: 'Grace period', l: 1, cls: 'wrap', fmt: (v) => ar(v) }, { k: 'start', label: 'Lease start', l: 1, fmt: dstr }, { k: 'rentRate', label: 'Annual rent', fmt: sar }, { k: 'water', label: 'Water', l: 1, fmt: (v) => (v == null ? '' : v ? 'Yes' : 'No') }, { k: 'elec', label: 'Electricity', l: 1, fmt: (v) => (v == null ? '' : v ? 'Yes' : 'No') }];
    const cnt = (f) => { const m = {}; P.forEach((x) => { const k = f(x) || '(not given)'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const rentAtRisk = P.reduce((s, x) => s + (x.rentRate || 0), 0);
    const el = h('div', {}, h('div', { class: 'sub', style: 'margin-bottom:8px' }, 'Contracts that are signed but whose branch is not operating yet. Rent may already be running during the grace period.'),
      h('div', { class: 'grid kpis' }, kpi('Signed, not open', P.length, `${compact(rentAtRisk)} SAR annual rent`), kpi('Licence ready', P.filter((x) => x.licence === 'Ready').length, 'of the pipeline'), kpi('Signboard installed', P.filter((x) => x.sign === 'Installed').length, ''), kpi('No water / electricity', P.filter((x) => x.water === false || x.elec === false).length, 'blocked utilities'), kpi('Not handed over', P.filter((x) => /not/i.test(x.handover)).length, '')),
      h('div', { class: 'grid half', style: 'margin-bottom:12px' }, chartCard('Pipeline by status', 'c1', 260), chartCard('Pipeline by licence status', 'c2', 260)),
      h('div', { class: 'tools' }, h('button', { class: 'btn small', onclick: () => LM.csv(cols, P, `real-estate-pipeline-${ds.end}.csv`) }, 'Export CSV')), LM.table(cols, P, { sort: 'no', dir: 1 }));
    setTimeout(() => { bar(el.querySelector('#c1'), cnt((x) => x.status), '#2c7a7b', true); bar(el.querySelector('#c2'), cnt((x) => x.licence), '#b7791f', true); }); return el;
  }

  function rent(ds, c) {
    const R = ds.data.rows.map((x) => ({ ...x, ppmCalc: x.area && x.rent1 ? x.rent1 / x.area : null })); const top = [...R].sort((a, b) => (b.rentRate || 0) - (a.rentRate || 0)).slice(0, 15);
    const pp = R.filter((x) => x.ppmCalc).sort((a, b) => b.ppmCalc - a.ppmCalc).slice(0, 15);
    const cc = [{ k: 'name', label: 'Branch', l: 1, cls: 'wrap', fmt: (v) => ar(v) }, { k: 'cityEn', label: 'City', l: 1 }, { k: 'status', label: 'Status', l: 1, fmt: (v) => statusPill(v) }, { k: 'area', label: 'Area m²', fmt: (v) => (v == null ? '–' : num(v)) }, { k: 'rentRate', label: 'Annual rent', fmt: sar }, { k: 'ppmCalc', label: 'Rent / m²', fmt: sar }];
    const cityRows = c.byCity.map((x) => ({ city: x.name, n: x.n, rent: x.rent, area: x.area, ppm: x.area ? x.rent / x.area : null, share: c.rentTotal ? x.rent / c.rentTotal : 0 }));
    return h('div', {}, h('div', { class: 'grid kpis' }, kpi('Annual rent', compact(c.rentTotal) + ' SAR', 'sum of the annual-rent column'), kpi('First-year rent', compact(c.rent1) + ' SAR', ''), kpi('Average per contract', sar(c.rentTotal / Math.max(1, c.n)) + ' SAR', ''), kpi('Average rent / m²', sar(c.avgPpm) + ' SAR', 'first-year rent ÷ area')),
      card('Rent by city', LM.table([{ k: 'city', label: 'City', l: 1 }, { k: 'n', label: 'Contracts', fmt: num }, { k: 'area', label: 'Area m²', fmt: num }, { k: 'rent', label: 'Annual rent', fmt: sar }, { k: 'ppm', label: 'Rent / m²', fmt: sar }, { k: 'share', label: 'Share of rent', fmt: (v) => (v * 100).toFixed(1) + '%' }], cityRows, { sort: 'rent' })),
      h('div', { class: 'grid half' }, card('Highest annual rent', LM.table(cc, top, { sort: 'rentRate' })), card('Highest rent per m²', LM.table(cc, pp, { sort: 'ppmCalc' }))));
  }

  function network(ds) {
    const S = ds.data.summary || []; if (!S.length) return h('div', { class: 'banner' }, 'This upload has no contract-count summary sheet.');
    return h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fit,minmax(260px,1fr))' }, S.map((b) => card(`${b.title}${b.total != null ? ' · ' + b.total : ''}`, LM.table([{ k: 'label', label: 'Name', l: 1, fmt: (v) => ar(v) }, { k: 'value', label: 'Count', fmt: (v, r) => (v == null ? (r.extra ? ar(r.extra) : '') : num(v)) }], b.rows.map((r) => ({ ...r, label: RE.cityEn(r.label) || r.label })), { sort: null }))));
  }

  function uploads(ds, c) {
    return LM.table([{ k: 'end', label: 'Report month', l: 1, fmt: (v) => v.slice(0, 7) }, { k: 'fileName', label: 'File', l: 1 }, { k: 'n', label: 'Contracts', fmt: num }, { k: 'uploadedAt', label: 'Uploaded', l: 1, fmt: (v) => v.slice(0, 16).replace('T', ' ') }, { k: 'x', label: '', fmt: (v, r) => h('button', { class: 'btn small danger', onclick: async () => { if (await LM.ask(`Delete the ${r.end.slice(0, 7)} real-estate report?`)) { await LM.db.del('datasets', r.id); ctx_reload(); } } }, 'Delete') }], uploads.sets.map((s) => ({ ...s, n: s.data.rows.length })), { sort: 'end' });
  }
  let ctx_reload = () => {};

  LM.realestateUI = { upload, view: (host, sets, ctx) => { uploads.sets = sets; ctx_reload = ctx.reload; view(host, sets, ctx); } };
})();
