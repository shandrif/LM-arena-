/* Procurement tab: pending POs and pending PRs, uploaded as dated snapshots. */
(function () {
  const LM = window.LM; const { h, num, num2, compact } = LM; const P = LM.procurement; const T = P.TYPES; LM.depts = LM.depts || {};
  const kpi = (l, v, d) => h('div', { class: 'card kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
  const age = (v) => h('span', { class: v > 180 ? 'down' : v > 90 ? 'flat' : '', style: v > 90 ? 'font-weight:700' : '' }, v + 'd');
  const chg = (a, b) => (b == null ? '' : `${a - b > 0 ? '+' : ''}${num(a - b)} vs ${'previous snapshot'}`);

  LM.depts.procurement = {
    id: 'procurement', label: 'Procurement',
    async mount(panel) {
      let sets = [], tpl = { dept: 'procurement' }, sub = 'Overview', prView = 'Requisitions'; const sel = {};
      const reload = async () => { sets = (await LM.db.all('datasets')).filter((d) => d.dept === 'procurement'); tpl = { dept: 'procurement', ...((await LM.db.get('templates', 'procurement')) || {}) }; draw(); };
      const of = (t) => sets.filter((s) => s.type === t).sort((a, b) => (a.end < b.end ? 1 : -1));
      const cur = (t) => { const l = of(t); return l.find((s) => s.id === sel[t]) || l[0] || null; };
      const prev = (t) => { const c = cur(t); return c ? of(t).find((s) => s.end < c.end) || null : null; };
      const fx = () => ({ ...P.DEFAULT_FX, ...(tpl.fx || {}) });
      const picker = (t) => { const l = of(t); return l.length > 1 ? h('select', { class: 'sel', onchange: (e) => { sel[t] = e.target.value; draw(); } }, l.map((s) => h('option', { value: s.id, selected: s.id === cur(t).id }, 'As of ' + s.end))) : null; };
      const poC = (s) => P.computePO(s, { ...fx(), ...(s.fx || {}) });
      const poReqs = () => { const c = cur('po'); return c ? new Set(c.data.rows.map((x) => x.req)) : new Set(); };

      async function uploadMany(files) { for (const f of files) await uploadOne(f); }
      function uploadOne(file) {
        return new Promise(async (resolve) => {
          let rf; try { rf = await LM.readFile(file); } catch (e) { LM.say(e.message); return resolve(); }
          const ov = {}; const run = () => P.analyze(rf.wb, rf.name, ov, tpl, sets, rf.hash); let res = run();
          const facts = () => { const d = res.ds; if (!d) return [['Report type', 'Not recognised']]; const R = d.data.rows; return [['Report type', T[res.type].label], ['As of', d.end || '–'], [res.type === 'pr' ? 'Lines' : 'Orders', num(R.length)], res.type === 'pr' ? ['Requisitions', num(new Set(R.map((x) => x.req)).size)] : ['Suppliers', num(new Set(R.map((x) => x.supplier)).size)]]; };
          const info = () => ({
            title: `Review before processing: ${rf.name}`, facts: facts(), issues: res.issues,
            approveLabel: res.ds && sets.some((s) => s.type === res.type && s.end === res.ds.end) ? 'Approve & replace snapshot' : 'Approve & process',
            onFix: (fix, val) => { if (fix.type === 'type') ov.type = val; else if (fix.type === 'asOf') ov.asOf = { date: val }; else if (fix.type === 'fx') ov.fx = { ...(ov.fx || {}), [fix.id]: +val }; else if (fix.type === 'col') ov.cols = { ...(ov.cols || {}), [fix.id]: val }; else if (fix.type === 'sheet') ov.sheets = { ...(ov.sheets || {}), [fix.key]: val }; res = run(); dlg.update(info()); },
            onCancel: () => resolve(),
            onApprove: async () => {
              if (!res.ds || res.issues.some((i) => i.level === 'error')) throw new Error('Fix the errors first.');
              const d = res.ds; const old = sets.find((s) => s.type === res.type && s.end === d.end);
              if (old) { await LM.db.put('history', { ...old, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', old.id); }
              const rec = { id: LM.uid(), dept: 'procurement', type: res.type, start: d.start, end: d.end, fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), data: d.data, fx: d.fx };
              await LM.db.put('datasets', rec); const t = P.learn({ ...tpl }, res.type, d, ov);
              t.colAliases = { ...(t.colAliases || {}) }; Object.entries(ov.cols || {}).forEach(([k, v]) => (t.colAliases[k] = [...new Set([...(t.colAliases[k] || []), v])]));
              await LM.db.put('templates', t); sel[res.type] = rec.id; sub = res.type === 'po' ? 'Pending POs' : 'Pending PRs'; LM.toast(`${T[res.type].label} as of ${d.end} processed`); await reload(); setTimeout(resolve, 50);
            },
          });
          const dlg = LM.review(info());
        });
      }

      const body = h('div');
      function draw() {
        LM.killCharts();
        panel.replaceChildren(h('div', { class: 'head' }, h('h2', {}, 'Procurement'), h('span', { class: 'sub' }, 'Upload the pending PR and pending PO files (together or separately).'), h('div', { class: 'spacer' }), LM.filePicker(uploadMany, 'Upload Procurement files', true)), body);
        LM.dropZone(panel, uploadMany, true);
        if (!sets.length) return body.replaceChildren(h('div', { class: 'empty' }, h('h3', {}, 'No procurement reports uploaded yet'), h('div', { style: 'display:inline-grid;gap:4px;text-align:left' }, Object.values(T).map((t) => h('div', {}, h('b', {}, t.label), ' – ', h('span', { class: 'sub' }, t.hint))))));
        const tabs = ['Overview', 'Pending POs', 'Pending PRs', 'Uploads'];
        body.replaceChildren(h('div', { class: 'subtabs' }, tabs.map((t) => h('button', { class: t === sub ? 'on' : '', onclick: () => { sub = t; draw(); } }, t))), { Overview: overview, 'Pending POs': poTab, 'Pending PRs': prTab, Uploads: uploads }[sub]());
      }
      const none = (t) => h('div', { class: 'banner' }, `No ${T[t].label} uploaded yet.`);
      const barChart = (host, labels, data, horizontal, fmt) => LM.chart(host, { type: 'bar', data: { labels, datasets: [{ data, backgroundColor: LM.css('--accent') }] }, options: { indexAxis: horizontal ? 'y' : 'x', plugins: { legend: { display: false } }, scales: { [horizontal ? 'x' : 'y']: { ticks: { callback: (v) => (fmt ? fmt(v) : v) } } } } });
      const mv = (t, rowKey) => { const c = cur(t), p = prev(t); if (!c || !p) return null; const a = new Set(p.data.rows.map(rowKey)), b = new Set(c.data.rows.map(rowKey)); return { added: [...b].filter((k) => !a.has(k)).length, cleared: [...a].filter((k) => !b.has(k)).length, since: p.end }; };

      /* ---------- Overview ---------- */
      function overview() {
        const po = cur('po'), pr = cur('pr'); const el = h('div', { class: 'grid half' });
        if (po) { const c = poC(po), p = prev('po'), pc = p ? poC(p) : null, m = mv('po', (x) => x.order);
          el.append(h('div', { class: 'card' }, h('div', { class: 'tools' }, h('b', {}, 'Pending POs (awaiting approval)'), h('span', { class: 'sub' }, 'as of ' + po.end), h('div', { class: 'spacer' }), h('button', { class: 'btn small', onclick: () => { sub = 'Pending POs'; draw(); } }, 'Open')),
            h('div', { class: 'grid kpis', style: 'margin:8px 0 0' }, kpi('Orders', num(c.n), pc ? chg(c.n, pc.n) : `${new Set(c.rows.map((x) => x.supplier)).size} suppliers`), kpi('Value (SAR)', compact(c.total), pc ? chg(Math.round(c.total), Math.round(pc.total)).replace(/(-?\+?\d[\d,]*)/, (x) => compact(+x.replace(/,/g, ''))) : 'converted at stored rates'), kpi('Older than 90 days', c.over90, `SAR ${compact(c.over90Value)}`), kpi('Oldest', c.oldest ? c.oldest.age + ' days' : '–', c.oldest ? c.oldest.order + ' · ' + c.oldest.supplier : '')), m ? h('div', { class: 'sub', style: 'margin-top:8px' }, `Since ${m.since}: ${m.added} new, ${m.cleared} cleared.`) : null)); } else el.append(none('po'));
        if (pr) { const c = P.computePR(pr, poReqs()), p = prev('pr'), pc = p ? P.computePR(p) : null, m = mv('pr', (x) => x.req + '|' + x.line);
          el.append(h('div', { class: 'card' }, h('div', { class: 'tools' }, h('b', {}, 'Pending PRs'), h('span', { class: 'sub' }, 'as of ' + pr.end), h('div', { class: 'spacer' }), h('button', { class: 'btn small', onclick: () => { sub = 'Pending PRs'; draw(); } }, 'Open')),
            h('div', { class: 'grid kpis', style: 'margin:8px 0 0' }, kpi('Requisitions', num(c.nReq), pc ? chg(c.nReq, pc.nReq) : `${num(c.n)} lines`), kpi('No buyer yet', c.unassignedReq, `${c.unassigned} lines`), kpi('Older than 90 days', c.over90Req, 'requisitions'), kpi('Oldest', c.oldest ? c.oldest.age + ' days' : '–', c.oldest ? c.oldest.req : '')), m ? h('div', { class: 'sub', style: 'margin-top:8px' }, `Since ${m.since}: ${m.added} new lines, ${m.cleared} cleared.`) : null)); } else el.append(none('pr'));
        const wrap = h('div', {}, el);
        const hist = (t) => of(t).slice().reverse();
        if (hist('po').length > 1 || hist('pr').length > 1) { wrap.append(h('div', { class: 'card', style: 'margin-top:12px' }, h('h3', {}, 'Pending items over time'), h('div', { class: 'chart', id: 'c1' }))); setTimeout(() => { const a = hist('po'), b = hist('pr'); const labels = [...new Set([...a, ...b].map((s) => s.end))].sort(); LM.chart(wrap.querySelector('#c1'), { type: 'line', data: { labels, datasets: [{ label: 'Pending POs', data: labels.map((l) => (a.find((s) => s.end === l) || { data: { rows: [] } }).data.rows.length || null), borderColor: LM.css('--accent'), spanGaps: true }, { label: 'Pending PR requisitions', data: labels.map((l) => { const s = b.find((x) => x.end === l); return s ? new Set(s.data.rows.map((x) => x.req)).size : null; }), borderColor: '#2c7a7b', spanGaps: true }] }, options: { plugins: { legend: { position: 'bottom' } } } }); }); }
        return wrap;
      }

      /* ---------- Pending POs ---------- */
      function poTab() {
        const s = cur('po'); if (!s) return none('po'); const c = poC(s); const f = { ...fx(), ...(s.fx || {}) };
        const fxBox = h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Exchange rates (SAR per 1 unit)'), h('div', { class: 'builder' }, Object.keys(f).filter((k) => k !== 'SAR').map((k) => h('label', {}, k, h('input', { type: 'number', step: 'any', value: f[k], 'data-cur': k, style: 'width:90px;padding:5px;border:1px solid var(--line);border-radius:8px' }))),
          h('button', { class: 'btn small', onclick: async () => { const t = { ...tpl, fx: { ...(tpl.fx || {}) } }; fxBox.querySelectorAll('input[data-cur]').forEach((i) => (t.fx[i.dataset.cur] = +i.value)); await LM.db.put('templates', t); const upd = { ...s, fx: { ...(s.fx || {}), ...t.fx } }; await LM.db.put('datasets', upd); LM.toast('Rates saved'); reload(); } }, 'Save rates')), h('div', { class: 'sub' }, 'Used only to show one SAR total. Original currency amounts are always kept in the table.'));
        const cols = [{ k: 'order', label: 'PO', l: 1 }, { k: 'supplier', label: 'Supplier', l: 1, cls: 'wrap' }, { k: 'buyer', label: 'Buyer', l: 1 }, { k: 'amount', label: 'Amount', fmt: num2 }, { k: 'currency', label: 'Cur.', l: 1 }, { k: 'sar', label: 'SAR', fmt: (v) => (v == null ? '–' : num(v)) }, { k: 'created', label: 'Created', l: 1 }, { k: 'age', label: 'Age', fmt: age }, { k: 'req', label: 'PR', l: 1 }, { k: 'desc', label: 'Description', l: 1, cls: 'wrap' }];
        const search = h('input', { type: 'search', placeholder: 'Search PO, supplier, description…' }); const tbl = LM.table(cols, c.rows, { sort: 'age' });
        search.oninput = () => tbl.redraw(c.rows.filter((r) => [r.order, r.supplier, r.desc, r.buyer, r.req].join(' ').toLowerCase().includes(search.value.toLowerCase())));
        const el = h('div', {}, h('div', { class: 'tools' }, picker('po'), h('span', { class: 'sub' }, `As of ${s.end} · ${s.fileName}`)),
          h('div', { class: 'grid kpis' }, kpi('Pending orders', num(c.n), 'all “Pending Approval”'), kpi('Total value (SAR)', num(c.total), c.byCur.map((x) => `${x.name} ${compact(x.value)}`).join(' · ')), kpi('Average age', c.avgAge == null ? '–' : Math.round(c.avgAge) + ' days', `${c.over90} older than 90 days`), kpi('Oldest', c.oldest ? c.oldest.age + ' days' : '–', c.oldest ? `${c.oldest.order} · ${c.oldest.supplier}` : '')),
          fxBox,
          h('div', { class: 'grid half', style: 'margin-bottom:12px' }, h('div', { class: 'card' }, h('h3', {}, 'Orders by age'), h('div', { class: 'chart', id: 'c1' })), h('div', { class: 'card' }, h('h3', {}, 'Value waiting by buyer (SAR)'), h('div', { class: 'chart', id: 'c2' }))),
          h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Top suppliers by value waiting (SAR)'), h('div', { class: 'chart', id: 'c3' })),
          h('div', { class: 'tools' }, search, h('button', { class: 'btn small', onclick: () => LM.csv(cols, c.rows, `pending-pos-${s.end}.csv`) }, 'Export CSV')), tbl);
        setTimeout(() => { barChart(el.querySelector('#c1'), c.buckets.map((b) => b.name), c.buckets.map((b) => b.n)); barChart(el.querySelector('#c2'), c.buyers.map((b) => b.name), c.buyers.map((b) => b.value), true, compact); const t = c.suppliers.slice(0, 10); barChart(el.querySelector('#c3'), t.map((b) => b.name.slice(0, 34)), t.map((b) => b.value), true, compact); }); return el;
      }

      /* ---------- Pending PRs ---------- */
      function prTab() {
        const s = cur('pr'); if (!s) return none('pr'); const c = P.computePR(s, poReqs());
        const rq = [{ k: 'req', label: 'PR', l: 1 }, { k: 'lines', label: 'Lines', fmt: num }, { k: 'created', label: 'Created', l: 1 }, { k: 'age', label: 'Age', fmt: age }, { k: 'buyer', label: 'Buyer', l: 1 }, { k: 'requester', label: 'Requester', l: 1 }, { k: 'location', label: 'Deliver to', l: 1, cls: 'wrap' }, { k: 'group', label: 'Category', l: 1, cls: 'wrap' }, { k: 'poPending', label: 'PO waiting approval', l: 1, fmt: (v) => (v ? h('span', { class: 'pill new' }, 'Yes') : '') }];
        const ln = [{ k: 'req', label: 'PR', l: 1 }, { k: 'line', label: 'Line', fmt: num }, { k: 'item', label: 'Item', l: 1 }, { k: 'desc', label: 'Description', l: 1, cls: 'wrap' }, { k: 'qty', label: 'Quantity', fmt: num }, { k: 'uom', label: 'Unit', l: 1 }, { k: 'buyer', label: 'Buyer', l: 1, fmt: (v) => v || h('span', { class: 'down' }, 'unassigned') }, { k: 'requester', label: 'Requester', l: 1 }, { k: 'location', label: 'Deliver to', l: 1, cls: 'wrap' }, { k: 'category', label: 'Category', l: 1, cls: 'wrap' }, { k: 'created', label: 'Created', l: 1 }, { k: 'age', label: 'Age', fmt: age }];
        const data = prView === 'Requisitions' ? c.reqs : c.rows; const cols = prView === 'Requisitions' ? rq : ln;
        const search = h('input', { type: 'search', placeholder: 'Search…' }); const tbl = LM.table(cols, data, { sort: 'age' });
        search.oninput = () => tbl.redraw(data.filter((r) => Object.values(r).filter((v) => typeof v !== 'object').join(' ').toLowerCase().includes(search.value.toLowerCase())));
        const el = h('div', {}, h('div', { class: 'tools' }, picker('pr'), h('span', { class: 'sub' }, `As of ${s.end} · ${s.fileName}`)),
          h('div', { class: 'grid kpis' }, kpi('Pending requisitions', num(c.nReq), `${num(c.n)} lines`), kpi('No buyer assigned', c.unassignedReq, `${c.unassigned} lines`), kpi('Older than 90 days', c.over90Req, 'requisitions'), kpi('Oldest', c.oldest ? c.oldest.age + ' days' : '–', c.oldest ? c.oldest.req : ''), kpi('Already have a PO waiting approval', c.withPO, 'requisitions')),
          h('div', { class: 'grid half', style: 'margin-bottom:12px' }, h('div', { class: 'card' }, h('h3', {}, 'Requisitions by age'), h('div', { class: 'chart', id: 'c1' })), h('div', { class: 'card' }, h('h3', {}, 'Lines by buyer'), h('div', { class: 'chart', id: 'c2' }))),
          h('div', { class: 'grid half', style: 'margin-bottom:12px' }, h('div', { class: 'card' }, h('h3', {}, 'Lines by category group'), h('div', { class: 'chart', id: 'c3' })), h('div', { class: 'card' }, h('h3', {}, 'Lines by deliver-to location'), h('div', { class: 'chart', id: 'c4' }))),
          h('div', { class: 'subtabs' }, ['Requisitions', 'Lines'].map((v) => h('button', { class: v === prView ? 'on' : '', onclick: () => { prView = v; draw(); } }, v))),
          h('div', { class: 'tools' }, search, h('span', { class: 'sub' }, 'Quantities are never added across different units.'), h('button', { class: 'btn small', onclick: () => LM.csv(cols, data, `pending-prs-${s.end}.csv`) }, 'Export CSV')), tbl);
        setTimeout(() => { barChart(el.querySelector('#c1'), c.buckets.map((b) => b.name), c.buckets.map((b) => b.n)); barChart(el.querySelector('#c2'), c.buyers.map((b) => b.name), c.buyers.map((b) => b.n), true); barChart(el.querySelector('#c3'), c.groups.slice(0, 8).map((b) => b.name.slice(0, 28)), c.groups.slice(0, 8).map((b) => b.n), true); barChart(el.querySelector('#c4'), c.locations.map((b) => b.name.slice(0, 28)), c.locations.map((b) => b.n), true); }); return el;
      }

      function uploads() {
        const l = sets.slice().sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
        return h('div', { class: 'card' }, h('h3', {}, 'Uploaded procurement snapshots'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Report', 'As of', 'Rows', 'File', 'Uploaded', ''].map((t) => h('th', { class: 'l' }, t)))),
          h('tbody', {}, l.map((s) => h('tr', {}, h('td', { class: 'l' }, T[s.type].label), h('td', { class: 'l' }, s.end), h('td', { class: 'l' }, s.data.rows.length), h('td', { class: 'l' }, s.fileName), h('td', { class: 'l' }, s.uploadedAt.slice(0, 16).replace('T', ' ')),
            h('td', {}, h('button', { class: 'btn small danger', onclick: async () => { if (await LM.ask(`Delete this ${T[s.type].label} snapshot (${s.end})?`)) { await LM.db.del('datasets', s.id); reload(); } } }, 'Delete')))))));
      }
      await reload();
    },
  };
})();
