/* Quality tab: drop any of the five weekly Quality files; each is recognised, checked and reviewed before it is saved. */
(function () {
  const LM = window.LM; const { h, num, num2, compact, dayLabel } = LM; const Q = LM.quality; const T = Q.TYPES; LM.depts = LM.depts || {};
  const today = () => new Date().toISOString().slice(0, 10);
  const p1 = (v) => (v == null || !isFinite(v) ? '–' : (v * 100).toFixed(1) + '%');
  const dd = (v, d = 2) => (v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : '') + v.toFixed(d));
  const per = (s) => (s.start === s.end ? s.end : `${s.start} → ${s.end}`);
  const badge = (t, cls) => h('span', { class: 'pill ' + (cls || '') }, t);
  const kpi = (l, v, d) => h('div', { class: 'card kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
  const pctColor = (v) => (v == null ? '' : v >= 1 ? 'up' : v < 0.8 ? 'down' : '');

  LM.depts.quality = {
    id: 'quality', label: 'Quality',
    async mount(panel) {
      let sets = [], sub = 'Overview'; const sel = {}; // sel[type] = dataset id
      const reload = async () => { sets = (await LM.db.all('datasets')).filter((d) => d.dept === 'quality'); draw(); };
      const of = (t) => sets.filter((s) => s.type === t).sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : a.uploadedAt < b.uploadedAt ? 1 : -1));
      const cur = (t) => { const l = of(t); return l.find((s) => s.id === sel[t]) || l[0] || null; };
      const picker = (t) => { const l = of(t); return l.length > 1 ? h('select', { class: 'sel', onchange: (e) => { sel[t] = e.target.value; draw(); } }, l.map((s) => h('option', { value: s.id, selected: cur(t) && s.id === cur(t).id }, per(s)))) : null; };

      /* ---------- upload (any number of files) ---------- */
      async function uploadMany(files) { for (const f of files) await uploadOne(f); }
      function uploadOne(file) {
        return new Promise(async (resolve) => {
          let rf; try { rf = await LM.readFile(file); } catch (e) { LM.say(e.message); return resolve(); }
          const tpl = { dept: 'quality', ...((await LM.db.get('templates', 'quality')) || {}) };
          const ov = {}; const run = () => Q.analyze(rf.wb, rf.name, ov, tpl, sets, rf.hash, sets);
          let res = run();
          const facts = () => {
            const d = res.ds; if (!d) return [['Report type', 'Not recognised']];
            const f = [['Report type', T[res.type].label], ['Period', d.start ? per(d) : '–']];
            if (res.type === 'trend') f.push(['Weeks', d.data.weeks.length]); if (res.type === 'coo') f.push(['Critical issues', d.data.groups.reduce((s, g) => s + g.n, 0)], ['Complaint cases', d.data.cases.length]);
            if (res.type === 'audit') f.push(['Score', p1(d.data.score)], ['Open items', d.data.ncs.length]); if (res.type === 'visits') f.push(['People', d.data.people.length]); if (res.type === 'wifi') f.push(['Branches', d.data.rows.length]);
            return f;
          };
          const info = () => ({
            title: `Review before processing: ${rf.name}`, facts: facts(), issues: res.issues,
            approveLabel: res.ds && sets.some((s) => s.type === res.type && s.start === res.ds.start && s.end === res.ds.end) ? 'Approve & replace existing' : 'Approve & process',
            onFix: (fix, val) => { if (fix.type === 'type') ov.type = val; else if (fix.type === 'asOf') ov.asOf = { date: val }; res = run(); dlg.update(info()); },
            onCancel: () => resolve(),
            onApprove: async () => {
              if (!res.ds || res.issues.some((i) => i.level === 'error')) throw new Error('Fix the errors first.');
              const d = res.ds; const old = sets.find((s) => s.type === res.type && s.start === d.start && s.end === d.end);
              if (old) { await LM.db.put('history', { ...old, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', old.id); }
              const rec = { id: LM.uid(), dept: 'quality', type: res.type, start: d.start, end: d.end, fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), data: d.data };
              await LM.db.put('datasets', rec);
              const t = { ...tpl }; if (res.type === 'wifi') t.wifiStatuses = [...new Set([...(t.wifiStatuses || []), ...d.data.rows.map((x) => x.status)])];
              await LM.db.put('templates', t); sets = (await LM.db.all('datasets')).filter((x) => x.dept === 'quality'); sel[res.type] = rec.id; sub = subFor(res.type);
              LM.toast(`${T[res.type].label} ${per(d)} processed`); draw(); setTimeout(resolve, 50);
            },
          });
          const dlg = LM.review(info());
        });
      }
      const subFor = (t) => ({ trend: 'Complaints', coo: 'Inspections', audit: 'Factory audit', visits: 'Store visits', wifi: 'WiFi' }[t]);

      /* ---------- layout ---------- */
      const body = h('div');
      function draw() {
        LM.killCharts();
        panel.replaceChildren(h('div', { class: 'head' }, h('h2', {}, 'Quality'), h('span', { class: 'sub' }, 'Upload one or several of the weekly Quality files together; each is recognised automatically.'), h('div', { class: 'spacer' }), LM.filePicker(uploadMany, 'Upload Quality files', true)), body);
        LM.dropZone(panel, uploadMany, true);
        if (!sets.length) return body.replaceChildren(h('div', { class: 'empty' }, h('h3', {}, 'No Quality reports uploaded yet'), h('p', { class: 'sub' }, 'Recognised reports:'),
          h('div', { style: 'display:inline-grid;gap:4px;text-align:left' }, Object.values(T).map((t) => h('div', {}, h('b', {}, t.label), ' – ', h('span', { class: 'sub' }, t.hint))))));
        const tabs = ['Overview', 'Complaints', 'Inspections', 'Factory audit', 'Store visits', 'WiFi', 'Uploads'];
        body.replaceChildren(h('div', { class: 'subtabs' }, tabs.map((t) => h('button', { class: t === sub ? 'on' : '', onclick: () => { sub = t; draw(); } }, t))), { Overview: overview, Complaints: complaints, Inspections: inspections, 'Factory audit': audit, 'Store visits': visits, WiFi: wifi, Uploads: uploads }[sub]());
      }
      const none = (t) => h('div', { class: 'banner' }, `No ${T[t].label} uploaded yet (${T[t].hint}).`);

      /* ---------- Overview ---------- */
      function overview() {
        const series = Q.complaintSeries(sets); const wk = Object.values(series).filter((w) => w.qC != null).sort((a, b) => (a.end < b.end ? -1 : 1)); const last = wk[wk.length - 1], prev = wk[wk.length - 2];
        const coo = cur('coo'), au = cur('audit'), vi = cur('visits'), wf = cur('wifi');
        const ref = [last && last.end, coo && coo.end, au && au.end, vi && vi.end, wf && wf.end].filter(Boolean).sort().pop();
        const stale = (end) => (end && ref && (Date.parse(ref) - Date.parse(end)) / 86400000 > 7 ? h('span', { class: 'down' }, ` · ${Math.round((Date.parse(ref) - Date.parse(end)) / 86400000)} days behind the newest report`) : null);
        const card = (title, sub2, content, jump) => h('div', { class: 'card' }, h('div', { class: 'tools' }, h('b', {}, title), h('div', { class: 'spacer' }), jump ? h('button', { class: 'btn small', onclick: () => { sub = jump; draw(); } }, 'Open') : null), sub2, content);
        const grid = h('div', { class: 'grid half' });
        grid.append(card('Complaints', last ? h('div', { class: 'sub' }, `Week ending ${last.end}`, stale(last.end)) : null, last ? h('div', { class: 'grid kpis', style: 'margin:8px 0 0' }, kpi('Quality complaints', num(last.qC), prev ? `${dd(last.qC - prev.qC, 0)} vs prev week` : ''), kpi('Contact ratio', last.qR != null ? last.qR.toFixed(2) : '–', prev ? `${dd(last.qR - prev.qR)} vs prev week · per 100k customers` : 'per 100k customers')) : none('trend'), 'Complaints'));
        if (coo) { const k = coo.data.kpis; const dn = k.done / (k.done + k.pending); grid.append(card('Inspections (COO update)', h('div', { class: 'sub' }, per(coo), stale(coo.end)), h('div', { class: 'grid kpis', style: 'margin:8px 0 0' }, kpi('Branches visited', num(k.branches), `${k.critical} critical · ${k.major} major · ${k.minor} minor`), kpi('Actions closed', p1(dn), `${num(k.done)} done · ${num(k.pending)} pending`)), 'Inspections')); } else grid.append(card('Inspections', null, none('coo')));
        if (au) { const a = au.data; const open = a.ncs.filter((n) => !n.target || n.target >= today()).length, over = a.ncs.filter((n) => n.target && n.target < today()).length; grid.append(card('Roasting factory audit', h('div', { class: 'sub' }, `Audit ${a.date}`, stale(au.end)), h('div', { class: 'grid kpis', style: 'margin:8px 0 0' }, kpi('Score', p1(a.score), `pass mark ${p1(a.passing)} · ${a.result}`), kpi('Corrective actions', a.ncs.length, `${over} overdue · ${open} not yet due`)), 'Factory audit')); } else grid.append(card('Roasting factory audit', null, none('audit')));
        if (vi) { const tot = (r) => { const L = vi.data.people.filter((p) => p.role.toUpperCase() === r); return { t: LM.sum(L, 'target'), a: LM.sum(L, 'achieved'), v: LM.sum(L, 'visited'), f: LM.sum(L, 'filled') }; }; const R = tot('ROM'), A = tot('AM'); grid.append(card('ROM & AM store visits', h('div', { class: 'sub' }, per(vi), stale(vi.end)), h('div', { class: 'grid kpis', style: 'margin:8px 0 0' }, kpi('ROM visits', p1(R.t ? R.a / R.t : null), `${R.a} of ${R.t}`), kpi('AM visits', p1(A.t ? A.a / A.t : null), `${A.a} of ${A.t}`), kpi('Geo compliance', p1(R.v + A.v ? (R.f + A.f) / (R.v + A.v) : null), `${R.f + A.f} of ${R.v + A.v} filled at location`)), 'Store visits')); } else grid.append(card('ROM & AM store visits', null, none('visits')));
        if (wf) { const c = {}; wf.data.rows.forEach((r) => (c[r.status] = (c[r.status] || 0) + 1)); grid.append(card('Branch WiFi', h('div', { class: 'sub' }, `As of ${wf.end}`, stale(wf.end)), h('div', { class: 'grid kpis', style: 'margin:8px 0 0' }, Object.entries(c).map(([k, v]) => kpi(k, v, `of ${wf.data.rows.length} branches`)), kpi('With an issue noted', wf.data.rows.filter((r) => r.issue).length, '')), 'WiFi')); } else grid.append(card('Branch WiFi', null, none('wifi')));
        return grid;
      }

      /* ---------- Complaints ---------- */
      function complaints() {
        const series = Q.complaintSeries(sets); const wk = Object.values(series).sort((a, b) => (a.end < b.end ? -1 : 1)); if (!wk.length) return none('trend');
        wk.forEach((w, i) => { const p = wk[i - 1]; w.qWow = p && w.qR != null && p.qR != null ? w.qR - p.qR : null; w.oWow = p && w.oR != null && p.oR != null ? w.oR - p.oR : null; w.label = `${dayLabel(w.start)} – ${dayLabel(w.end)}`; });
        const q = wk.filter((w) => w.qC != null); const ytdC = LM.sum(q, 'qC'), ytdCust = LM.sum(q.filter((w) => w.cust), 'cust'), ytdC2 = LM.sum(q.filter((w) => w.cust), 'qC');
        const best = [...q].filter((w) => w.qR != null).sort((a, b) => a.qR - b.qR)[0], worst = [...q].filter((w) => w.qR != null).sort((a, b) => b.qR - a.qR)[0];
        const l4 = q.slice(-4), p4 = q.slice(-8, -4); const avg = (a) => (a.length ? LM.sum(a, 'qR') / a.length : null);
        const cols = [{ k: 'no', label: 'Wk' }, { k: 'label', label: 'Dates', l: 1 }, { k: 'qC', label: 'Quality complaints', fmt: num }, { k: 'cust', label: 'Customers', fmt: num }, { k: 'qR', label: 'Quality ratio', fmt: (v) => (v == null ? '–' : v.toFixed(2)) }, { k: 'qWow', label: 'WoW', fmt: (v) => (v == null ? '–' : h('span', { class: v > 0 ? 'down' : v < 0 ? 'up' : 'flat' }, dd(v))) },
          { k: 'oC', label: 'Ops complaints', fmt: num }, { k: 'oR', label: 'Ops ratio', fmt: (v) => (v == null ? '–' : v.toFixed(2)) }, { k: 'total', label: 'Total (COO)', fmt: num }, { k: 'countable', label: 'Countable (COO)', fmt: num }];
        const cases = sets.filter((s) => s.type === 'coo').flatMap((s) => s.data.cases.map((c) => ({ ...c, period: per(s) }))).sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1));
        const el = h('div', {}, h('div', { class: 'grid kpis' }, kpi('Complaints year to date', num(ytdC), `${q.length} weeks`), kpi('Contact ratio YTD', ytdCust ? ((ytdC2 / ytdCust) * 1e5).toFixed(2) : '–', 'complaints per 100k customers'),
          kpi('Last 4 weeks (avg ratio)', avg(l4) != null ? avg(l4).toFixed(2) : '–', p4.length ? `${dd(avg(l4) - avg(p4))} vs previous 4 weeks` : ''), kpi('Worst week', worst ? worst.qR.toFixed(2) : '–', worst ? worst.label : ''), kpi('Best week', best ? best.qR.toFixed(2) : '–', best ? best.label : '')),
          h('div', { class: 'grid half', style: 'margin-bottom:12px' }, h('div', { class: 'card' }, h('h3', {}, 'Complaints per week'), h('div', { class: 'chart', id: 'c1' })), h('div', { class: 'card' }, h('h3', {}, 'Contact ratio per 100k customers'), h('div', { class: 'chart', id: 'c2' }))),
          LM.table(cols, wk.slice().reverse().map((w) => ({ ...w })), { sort: null }),
          cases.length ? h('div', { class: 'card', style: 'margin-top:12px' }, h('h3', {}, 'Complaint cases (from COO updates)'), LM.table([{ k: 'date', label: 'Date', l: 1 }, { k: 'time', label: 'Time', l: 1 }, { k: 'store', label: 'Store', l: 1 }, { k: 'category', label: 'Type', l: 1 }, { k: 'text', label: 'Case', l: 1, cls: 'wrap' }], cases, { sort: 'date' })) : null);
        setTimeout(() => {
          const ac = LM.css('--accent'), ly = LM.css('--ly'); const L = wk.map((w) => dayLabel(w.end));
          LM.chart(el.querySelector('#c1'), { type: 'bar', data: { labels: L, datasets: [{ label: 'Quality', data: wk.map((w) => w.qC), backgroundColor: ac }, { label: 'Operations', data: wk.map((w) => w.oC), backgroundColor: ly }] }, options: { plugins: { legend: { position: 'bottom' } } } });
          LM.chart(el.querySelector('#c2'), { type: 'line', data: { labels: L, datasets: [{ label: 'Quality', data: wk.map((w) => w.qR), borderColor: ac, backgroundColor: ac, tension: 0, pointRadius: 2 }, { label: 'Operations', data: wk.map((w) => w.oR), borderColor: ly, backgroundColor: ly, tension: 0, pointRadius: 2 }] }, options: { plugins: { legend: { position: 'bottom' } } } });
        }); return el;
      }

      /* ---------- Inspections ---------- */
      function inspections() {
        const s = cur('coo'); if (!s) return none('coo'); const d = s.data, k = d.kpis; const dn = k.done / (k.done + k.pending);
        const bar = h('div', { style: 'height:12px;border-radius:6px;background:var(--bad-bg);overflow:hidden;margin-top:6px' }, h('div', { style: `height:100%;width:${dn * 100}%;background:var(--good)` }));
        const wkb = d.blocks.map((b) => { const rowsN = Object.keys(b.data); return h('div', { class: 'card' }, h('h3', {}, b.name), h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', { class: 'l' }, ''), b.labels.map((l) => h('th', {}, l)))), h('tbody', {}, rowsN.map((r) => h('tr', {}, h('td', { class: 'l' }, r), b.data[r].map((v) => h('td', {}, v == null ? '–' : r === '%' ? v.toFixed(2) : num(v)))))))); });
        return h('div', {}, h('div', { class: 'tools' }, picker('coo'), h('span', { class: 'sub' }, `${per(s)} · ${s.fileName}`)),
          h('div', { class: 'grid kpis' }, kpi('Branches visited', num(k.branches), ''), kpi('Critical observations', k.critical, ''), kpi('Major observations', num(k.major), ''), kpi('Minor observations', num(k.minor), ''), h('div', { class: 'card kpi' }, h('div', { class: 'l' }, 'Operations action items'), h('div', { class: 'v' }, p1(dn)), h('div', { class: 'd' }, `${num(k.done)} done · ${num(k.pending)} pending`), bar)),
          h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Critical issues'), d.groups.length ? d.groups.map((g) => h('div', { style: 'margin-bottom:10px' }, h('b', {}, `${g.title} (${g.n})`), h('ul', { class: 'findings', style: 'margin-top:4px' }, g.items.map((i) => h('li', {}, i.store ? h('b', {}, i.store + ': ') : null, i.text))))) : h('span', { class: 'sub' }, 'None listed.')),
          h('div', { class: 'grid half', style: 'margin-bottom:12px' }, wkb),
          d.cases.length ? h('div', { class: 'card' }, h('h3', {}, 'Complaint cases'), LM.table([{ k: 'date', label: 'Date', l: 1 }, { k: 'time', label: 'Time', l: 1 }, { k: 'store', label: 'Store', l: 1 }, { k: 'category', label: 'Type', l: 1 }, { k: 'text', label: 'Case', l: 1, cls: 'wrap' }], d.cases, { sort: 'date', dir: 1 })) : null);
      }

      /* ---------- Factory audit ---------- */
      function audit() {
        const s = cur('audit'); if (!s) return none('audit'); const a = s.data; const t0 = today();
        const rows = a.ncs.map((n) => ({ ...n, days: n.target ? Math.round((Date.parse(n.target) - Date.parse(t0)) / 86400000) : null }));
        const hist = of('audit').slice().reverse();
        const el = h('div', {}, h('div', { class: 'tools' }, picker('audit'), h('span', { class: 'sub' }, s.fileName)),
          h('div', { class: 'grid kpis' }, kpi('Result', h('span', { class: a.result === 'PASS' ? 'up' : 'down' }, a.result || '–'), `audit ${a.date}`), kpi('Score', p1(a.score), `pass mark ${p1(a.passing)} (${a.score >= a.passing ? '+' : ''}${((a.score - a.passing) * 100).toFixed(1)} pts)`),
            kpi('Critical', a.critical, ''), kpi('Major', a.major, ''), kpi('Unanswered items', a.unanswered == null ? '–' : a.unanswered, '')),
          h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Non-conformities & corrective actions'), LM.table([{ k: 'no', label: '#' }, { k: 'text', label: 'Non-conformity', l: 1, cls: 'wrap' }, { k: 'category', label: 'Category', l: 1 }, { k: 'action', label: 'Corrective action', l: 1, cls: 'wrap', fmt: (v) => h('span', { style: 'white-space:pre-line' }, v) }, { k: 'target', label: 'Target date', l: 1 },
            { k: 'days', label: 'Status', l: 1, fmt: (v) => (v == null ? '–' : v < 0 ? badge(`Overdue ${-v}d`, 'closed') : badge(v === 0 ? 'Due today' : `Due in ${v}d`)) }, { k: 'owner', label: 'Responsible', l: 1, cls: 'wrap' }], rows, { sort: 'no', dir: 1 })),
          hist.length > 1 ? h('div', { class: 'card' }, h('h3', {}, 'Audit score history'), h('div', { class: 'chart', id: 'c1' })) : null);
        setTimeout(() => { const c = el.querySelector('#c1'); if (c) LM.chart(c, { type: 'line', data: { labels: hist.map((x) => x.data.date), datasets: [{ label: 'Score %', data: hist.map((x) => x.data.score * 100), borderColor: LM.css('--accent'), tension: 0 }, { label: 'Pass mark %', data: hist.map((x) => x.data.passing * 100), borderColor: LM.css('--ly'), borderDash: [5, 4], pointRadius: 0 }] }, options: { plugins: { legend: { position: 'bottom' } } } }); }); return el;
      }

      /* ---------- Store visits ---------- */
      function visits() {
        const s = cur('visits'); if (!s) return none('visits'); const P = s.data.people;
        const tbl = (role) => { const L = P.filter((p) => p.role.toUpperCase() === role).map((p) => ({ ...p, pct: p.target ? p.achieved / p.target : null, geoPct: p.visited ? p.filled / p.visited : null })); const T2 = { name: 'Total', target: LM.sum(L, 'target'), achieved: LM.sum(L, 'achieved'), visited: LM.sum(L, 'visited'), filled: LM.sum(L, 'filled') }; T2.pct = T2.target ? T2.achieved / T2.target : null; T2.geoPct = T2.visited ? T2.filled / T2.visited : null;
          return { L, T2, el: h('div', { class: 'card' }, h('h3', {}, role === 'ROM' ? 'Regional Operations Managers' : 'Area Managers'), LM.table([{ k: 'name', label: 'Name', l: 1 }, { k: 'target', label: 'Target', fmt: num }, { k: 'achieved', label: 'Visits', fmt: num }, { k: 'pct', label: 'Visits %', fmt: (v) => h('span', { class: pctColor(v) }, p1(v)) }, { k: 'visited', label: 'Stores visited (geo sheet)', fmt: num }, { k: 'filled', label: 'Filled at location', fmt: num }, { k: 'geoPct', label: 'Geo compliance', fmt: (v) => h('span', { class: pctColor(v) }, p1(v)) }], [...L, T2], { sort: null })) }; };
        const R = tbl('ROM'), A = tbl('AM'); const all = [...R.L, ...A.L];
        const el = h('div', {}, h('div', { class: 'tools' }, picker('visits'), h('span', { class: 'sub' }, `${per(s)} · ${s.fileName}`)),
          h('div', { class: 'grid kpis' }, kpi('ROM visits', p1(R.T2.pct), `${R.T2.achieved} of ${R.T2.target}`), kpi('AM visits', p1(A.T2.pct), `${A.T2.achieved} of ${A.T2.target}`), kpi('ROM geo compliance', p1(R.T2.geoPct), `${R.T2.filled} of ${R.T2.visited}`), kpi('AM geo compliance', p1(A.T2.geoPct), `${A.T2.filled} of ${A.T2.visited}`)),
          h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Visits vs target, and geo-compliant visits'), h('div', { class: 'chart', id: 'c1', style: 'height:340px' })), h('div', { class: 'grid half' }, R.el, A.el));
        setTimeout(() => LM.chart(el.querySelector('#c1'), { type: 'bar', data: { labels: all.map((p) => p.name), datasets: [{ label: 'Target', data: all.map((p) => p.target), backgroundColor: LM.css('--ly') }, { label: 'Visits', data: all.map((p) => p.achieved), backgroundColor: LM.css('--accent') }, { label: 'Filled at location', data: all.map((p) => p.filled), backgroundColor: '#2c7a7b' }] }, options: { plugins: { legend: { position: 'bottom' } } } })); return el;
      }

      /* ---------- WiFi ---------- */
      function wifi() {
        const s = cur('wifi'); if (!s) return none('wifi'); const R = s.data.rows; const c = {}; R.forEach((r) => (c[r.status] = (c[r.status] || 0) + 1));
        const st = h('select', { class: 'sel' }, ['All statuses', ...Object.keys(c)].map((x) => h('option', {}, x)));
        const tbl = LM.table([{ k: 'code', label: 'Code', l: 1 }, { k: 'branch', label: 'Branch', l: 1 }, { k: 'status', label: 'Status', l: 1, fmt: (v) => badge(v, v === 'Good' ? '' : 'closed') }, { k: 'issue', label: 'Issue', l: 1, cls: 'wrap' }, { k: 'action', label: 'Action taken', l: 1, cls: 'wrap' }], R, { sort: 'code', dir: 1 });
        st.onchange = () => tbl.redraw(R.filter((r) => st.value === 'All statuses' || r.status === st.value));
        return h('div', {}, h('div', { class: 'tools' }, picker('wifi'), h('span', { class: 'sub' }, `As of ${s.end} · ${s.fileName}`)),
          h('div', { class: 'grid kpis' }, Object.entries(c).map(([k, v]) => kpi(k, v, `${p1(v / R.length)} of ${R.length} branches`)), kpi('With an issue noted', R.filter((r) => r.issue).length, '')),
          h('div', { class: 'tools' }, st), tbl);
      }

      function uploads() {
        const l = sets.slice().sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
        return h('div', { class: 'card' }, h('h3', {}, 'Uploaded Quality reports'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Report', 'Period', 'File', 'Uploaded', ''].map((t) => h('th', { class: 'l' }, t)))),
          h('tbody', {}, l.map((s) => h('tr', {}, h('td', { class: 'l' }, T[s.type].label), h('td', { class: 'l' }, per(s)), h('td', { class: 'l' }, s.fileName), h('td', { class: 'l' }, s.uploadedAt.slice(0, 16).replace('T', ' ')),
            h('td', {}, h('button', { class: 'btn small danger', onclick: async () => { if (await LM.ask(`Delete this ${T[s.type].label} (${per(s)})?`)) { await LM.db.del('datasets', s.id); reload(); } } }, 'Delete')))))));
      }
      await reload();
    },
  };
  LM.sum = (a, k) => a.reduce((s, x) => s + (+x[k] || 0), 0);
})();
