/* Flexible tab (Others, and every department that has no dedicated template yet).
   Accepts any Excel/CSV, profiles it, flags problems and compares with earlier versions of the same dataset. */
(function () {
  const LM = window.LM; const { h, num, num2, pct0, compact } = LM; LM.depts = LM.depts || {};
  const ERRVAL = /^#(REF|N\/A|DIV\/0|VALUE|NAME|NUM|NULL)[!?]?/i;

  /* ---------- profiling (pure) ---------- */
  function detectHeader(grid) {
    const cnt = (r) => (r || []).filter((v) => v != null && String(v).trim() !== '').length;
    const mx = Math.max(0, ...grid.slice(0, 30).map(cnt));
    for (let i = 0; i < Math.min(30, grid.length); i++) {
      const r = grid[i] || [];
      if (cnt(r) >= Math.max(2, mx * 0.6) || (mx === 1 && cnt(r) === 1)) {
        const strs = r.filter((v) => typeof v === 'string').length;
        if (strs >= cnt(r) * 0.6) return i;
      }
    }
    return 0;
  }
  function profileSheet(name, grid) {
    const out = { name, issues: [], columns: [], rows: [], headerRow: 0 };
    if (!grid.length) { out.issues.push({ level: 'warn', msg: `Sheet "${name}" is empty.` }); return out; }
    const hr = detectHeader(grid); out.headerRow = hr + 1;
    const hdr = grid[hr] || []; const width = Math.max(hdr.length, ...grid.slice(hr + 1, hr + 200).map((r) => (r || []).length), 0);
    const seen = {};
    const names = Array.from({ length: width }, (_, i) => { let n = hdr[i] != null && String(hdr[i]).trim() ? LM.clean(hdr[i]) : `Column ${i + 1}`; if (seen[n]) n += ` (${++seen[n]})`; else seen[n] = 1; return n; });
    const body = grid.slice(hr + 1).filter((r) => (r || []).some((v) => v != null && String(v).trim() !== ''));
    if (!body.length) { out.issues.push({ level: 'warn', msg: `Sheet "${name}" has a header but no data rows.` }); }
    const errs = [];
    names.forEach((n, ci) => {
      const vals = body.map((r) => r[ci]).filter((v) => v != null && String(v).trim() !== '');
      let nNum = 0, nDate = 0;
      vals.forEach((v) => { if (typeof v === 'number') nNum++; else if (typeof v === 'string') { if (LM.parseNum(v) != null && /^[\d.,\s()-]+$/.test(v)) nNum++; if (LM.parseDay(v) && /[-/.]/.test(v)) nDate++; } });
      let type = 'text';
      const dateHdr = /date|day|week|month|تاريخ|يوم/i.test(n);
      if (vals.length && nDate / vals.length >= 0.9) type = 'date';
      else if (vals.length && nNum / vals.length >= 0.9) type = dateHdr && vals.every((v) => typeof v === 'number' && v > 30000 && v < 80000) ? 'date' : 'number';
      const col = { name: n, type, nulls: body.length - vals.length, distinct: 0 };
      if (type === 'number') {
        const ns = vals.map(LM.parseNum).filter((v) => v != null); col.sum = ns.reduce((a, b) => a + b, 0); col.min = Math.min(...ns); col.max = Math.max(...ns); col.avg = ns.length ? col.sum / ns.length : null;
        const bad = vals.length - ns.length; if (bad) out.issues.push({ level: 'warn', msg: `Column "${n}": ${bad} non-numeric value(s) in a numeric column.` });
      } else if (type === 'date') {
        const bad = vals.filter((v) => !LM.parseDay(v)).length; if (bad) out.issues.push({ level: 'warn', msg: `Column "${n}": ${bad} value(s) are not valid dates.` });
      } else {
        col.distinct = new Set(vals.map(String)).size;
        vals.forEach((v) => { if (typeof v === 'string' && ERRVAL.test(v.trim())) errs.push(`${n}: ${v}`); });
        if (vals.length && nNum / vals.length > 0.5) out.issues.push({ level: 'warn', msg: `Column "${n}" mixes numbers and text (${nNum} numeric of ${vals.length}).` });
      }
      if (body.length && col.nulls / body.length > 0.8) out.issues.push({ level: 'info', msg: `Column "${n}" is ${Math.round((col.nulls / body.length) * 100)}% empty.` });
      out.columns.push(col);
    });
    if (errs.length) out.issues.push({ level: 'warn', msg: `${errs.length} spreadsheet error value(s) found (e.g. ${errs.slice(0, 3).join('; ')}).` });
    out.rows = body.map((r) => names.map((_, ci) => { const v = r[ci]; const t = out.columns[ci].type; if (v == null || String(v).trim() === '') return null; if (t === 'date') return LM.parseDay(v); if (t === 'number') return LM.parseNum(v); return typeof v === 'string' ? v.trim() : v; }));
    const keys = new Set(); let dup = 0; out.rows.forEach((r) => { const k = JSON.stringify(r); if (keys.has(k)) dup++; keys.add(k); });
    if (dup) out.issues.push({ level: 'warn', msg: `${dup} fully duplicated row(s) in sheet "${name}".` });
    return out;
  }
  LM.profileSheet = profileSheet;

  /** Compare a new dataset against the previous version of the same dataset. */
  function diff(prev, next) {
    const issues = [];
    next.sheets.forEach((s) => {
      const p = prev.sheets.find((x) => x.name === s.name);
      if (!p) return issues.push({ level: 'warn', msg: `New sheet "${s.name}" was not in the previous version.` });
      const pn = p.columns.map((c) => c.name), nn = s.columns.map((c) => c.name);
      const added = nn.filter((c) => !pn.includes(c)), gone = pn.filter((c) => !nn.includes(c));
      if (added.length) issues.push({ level: 'warn', msg: `Sheet "${s.name}": new column(s) since last version: ${added.join(', ')}.` });
      if (gone.length) issues.push({ level: 'warn', msg: `Sheet "${s.name}": column(s) missing compared with last version: ${gone.join(', ')}.` });
      s.columns.forEach((c) => { const o = p.columns.find((x) => x.name === c.name); if (o && o.type !== c.type) issues.push({ level: 'warn', msg: `Sheet "${s.name}", column "${c.name}": type changed from ${o.type} to ${c.type}.` }); });
      if (p.rows.length && Math.abs(s.rows.length - p.rows.length) / p.rows.length > 0.5) issues.push({ level: 'warn', msg: `Sheet "${s.name}": row count changed from ${num(p.rows.length)} to ${num(s.rows.length)}.` });
    });
    prev.sheets.forEach((p) => { if (!next.sheets.find((s) => s.name === p.name)) issues.push({ level: 'warn', msg: `Sheet "${p.name}" from the previous version is missing.` }); });
    return issues;
  }

  /* ---------- tab ---------- */
  LM.makeGenericDept = (id, label, banner) => ({
    id, label,
    async mount(panel) {
      let all = [], selName = null, selVer = null, selSheet = 0, chartCfg = null;
      let reSets = [], reCur = null; const REV = '__realestate__';
      const load = async () => { const every = (await LM.db.all('datasets')).filter((d) => d.dept === id); all = every.filter((d) => !d.type); reSets = every.filter((d) => d.type === 'realestate').sort((a, b) => (a.end < b.end ? 1 : -1)); };
      const names = () => [...new Set(all.map((d) => d.name))].sort();
      const versions = (n) => all.filter((d) => d.name === n).sort((a, b) => b.version - a.version);

      async function upload(file) {
        let rf; try { rf = await LM.readFile(file); } catch (e) { return LM.say(e.message); }
        if (id === 'others' && LM.realestate && LM.realestate.detect(rf.wb)) return LM.realestateUI.upload(rf, { sets: reSets, done: async (rid) => { reCur = rid; selName = REV; await load(); draw(); }, reload: async () => { await load(); draw(); } });
        const sheets = rf.wb.SheetNames.map((n) => profileSheet(n, LM.engine.rowsOf(rf.wb, n)));
        const defName = file.name.replace(/\.[^.]+$/, '').replace(/[\s_-]*(\d{1,4}[-_.]\d{1,2}([-_.]\d{1,4})?|week\s*\d+|wk\s*\d+|w\d+)[\s_-]*/gi, ' ').trim() || file.name;
        const guess = names().find((n) => LM.similarity(n, defName) > 0.7) || null;
        let target = guess || '__new__', newName = defName;
        const nameInput = h('input', { type: 'text', value: newName, style: 'padding:6px 10px;border:1px solid var(--line);border-radius:8px;min-width:240px', oninput: () => (newName = nameInput.value) });
        const targetSel = h('select', { class: 'sel', onchange: () => { target = targetSel.value; dlg.update(info()); } }, h('option', { value: '__new__' }, 'New dataset'), names().map((n) => h('option', { value: n, selected: n === target }, 'Update: ' + n)));
        const info = () => {
          const issues = sheets.flatMap((s) => s.issues);
          const draft = { sheets: sheets.map((s) => ({ name: s.name, columns: s.columns, rows: s.rows })) };
          if (!sheets.some((s) => s.rows.length)) issues.push({ level: 'error', msg: 'No data rows were found in any sheet.' });
          if (target !== '__new__') {
            const vs = versions(target);
            if (vs[0]) { issues.push(...diff(vs[0], draft)); if (vs.some((v) => v.hash === rf.hash)) issues.push({ level: 'warn', msg: 'This exact file was already uploaded for this dataset.' }); }
          } else if (all.some((d) => d.hash === rf.hash)) issues.push({ level: 'warn', msg: 'This exact file was already uploaded (under another dataset name).' });
          else if (names().some((n) => LM.similarity(n, newName) > 0.7)) issues.push({ level: 'info', msg: 'A similar dataset name already exists; choose “Update” above if this is a newer version of it.' });
          return {
            title: `Review before processing: ${rf.name}`,
            facts: [['Sheets', sheets.length], ['Rows', num(sheets.reduce((s, x) => s + x.rows.length, 0))], ['Columns', sheets.reduce((s, x) => s + x.columns.length, 0)]],
            extra: h('div', { class: 'tools' }, h('span', { class: 'sub' }, 'Save as:'), targetSel, target === '__new__' ? nameInput : null),
            issues, approveLabel: target === '__new__' ? 'Approve & save' : 'Approve & add new version',
            onApprove: async () => {
              const name = target === '__new__' ? newName.trim() : target; if (!name) throw new Error('Please enter a dataset name.');
              const v = (versions(name)[0] || { version: 0 }).version + 1;
              const rec = { id: LM.uid(), dept: id, name, version: v, hash: rf.hash, fileName: rf.name, uploadedAt: new Date().toISOString(), sheets: draft.sheets };
              await LM.db.put('datasets', rec); await load(); selName = name; selVer = rec.id; selSheet = draft.sheets.reduce((b, s, i, a) => (s.rows.length > a[b].rows.length ? i : b), 0); chartCfg = null; draw(); LM.toast(`${name} saved (version ${v})`);
            },
          };
        };
        const dlg = LM.review(info());
      }

      function draw() {
        LM.killCharts();
        const picker = LM.filePicker(upload, 'Upload file');
        panel.replaceChildren(h('div', { class: 'head' }, h('h2', {}, label), h('div', { class: 'spacer' }), picker));
        LM.dropZone(panel, upload);
        if (banner) panel.append(h('div', { class: 'banner' }, banner));
        if (!names().length && !reSets.length) return panel.append(h('div', { class: 'empty' }, h('h3', {}, 'Nothing uploaded yet'), h('p', { class: 'sub' }, 'Drop any Excel or CSV file here. It is checked for problems first, then summarised automatically.')));
        if (selName === REV && !reSets.length) selName = null;
        if (selName !== REV && (!selName || !names().includes(selName))) { selName = names()[0] || (reSets.length ? REV : null); selVer = null; }
        const chips = h('div', { class: 'dslist' }, reSets.length ? h('button', { class: 'btn' + (selName === REV ? ' on' : ''), onclick: () => { selName = REV; draw(); } }, '🏢 Real estate') : null, names().map((n) => h('button', { class: 'btn' + (n === selName ? ' on' : ''), onclick: () => { selName = n; selVer = null; selSheet = 0; chartCfg = null; draw(); } }, n)));
        if (selName === REV) { const host = h('div'); panel.append(chips, host); return LM.realestateUI.view(host, reSets, { cur: reCur, reload: async () => { await load(); draw(); } }); }
        const vs = versions(selName); const ds = vs.find((v) => v.id === selVer) || vs[0]; selVer = ds.id;
        panel.append(
          chips,
          h('div', { class: 'tools' },
            h('select', { class: 'sel', onchange: (e) => { selVer = e.target.value; chartCfg = null; draw(); } }, vs.map((v) => h('option', { value: v.id, selected: v.id === ds.id }, `Version ${v.version} · ${v.uploadedAt.slice(0, 10)} · ${v.fileName}`))),
            ds.sheets.length > 1 ? h('select', { class: 'sel', onchange: (e) => { selSheet = +e.target.value; chartCfg = null; draw(); } }, ds.sheets.map((s, i) => h('option', { value: i, selected: i === selSheet }, `Sheet: ${s.name}`))) : null,
            h('div', { class: 'spacer' }),
            h('button', { class: 'btn small danger', onclick: async () => { if (await LM.ask(`Delete version ${ds.version} of "${ds.name}"?`)) { await LM.db.del('datasets', ds.id); await load(); selVer = null; draw(); } } }, 'Delete this version')),
          sheetView(ds.sheets[Math.min(selSheet, ds.sheets.length - 1)]));
      }

      function sheetView(s) {
        const nums = s.columns.map((c, i) => ({ ...c, i })).filter((c) => c.type === 'number');
        const cards = h('div', { class: 'grid kpis' },
          h('div', { class: 'card kpi' }, h('div', { class: 'l' }, 'Rows'), h('div', { class: 'v' }, num(s.rows.length)), h('div', { class: 'd' }, `${s.columns.length} columns`)),
          nums.slice(0, 5).map((c) => h('div', { class: 'card kpi' }, h('div', { class: 'l' }, c.name), h('div', { class: 'v' }, compact(c.sum)), h('div', { class: 'd' }, `avg ${num2(c.avg)} · min ${num2(c.min)} · max ${num2(c.max)}`))));
        const prof = LM.table([{ k: 'name', label: 'Column', l: 1 }, { k: 'type', label: 'Type', l: 1 }, { k: 'nulls', label: 'Empty', fmt: num }, { k: 'distinct', label: 'Distinct', fmt: (v, r) => (r.type === 'text' ? num(v) : '–') }, { k: 'sum', label: 'Sum', fmt: (v) => (v == null ? '–' : num2(v)) }, { k: 'avg', label: 'Avg', fmt: (v) => (v == null ? '–' : num2(v)) }, { k: 'min', label: 'Min', fmt: (v) => (v == null ? '–' : num2(v)) }, { k: 'max', label: 'Max', fmt: (v) => (v == null ? '–' : num2(v)) }], s.columns, { sort: 'name', dir: 1 });
        const view = h('div', {}, cards, builder(s), h('div', { class: 'card', style: 'margin:12px 0' }, h('h3', {}, 'Column profile'), prof), previewTable(s));
        return view;
      }

      function builder(s) {
        const cols = s.columns; const numeric = cols.filter((c) => c.type === 'number'); const groupable = cols.filter((c) => c.type !== 'number' || c.distinct > 0 || true);
        if (!chartCfg || chartCfg.sheet !== s.name) {
          const dc = cols.find((c) => c.type === 'date'); const tc = cols.find((c) => c.type === 'text' && c.distinct > 1 && c.distinct <= 60);
          chartCfg = { sheet: s.name, by: (dc || tc || cols[0] || {}).name, measure: numeric[0] ? numeric[0].name : '__count__', agg: numeric[0] ? 'sum' : 'count', type: dc ? 'line' : 'bar', gran: 'day', top: 15 };
        }
        const c = chartCfg; const host = h('div', { class: 'chart' });
        const sel = (label, key, opts) => h('label', {}, label, h('select', { class: 'sel', onchange: (e) => { c[key] = key === 'top' ? +e.target.value : e.target.value; redraw(); } }, opts.map(([v, t]) => h('option', { value: v, selected: String(v) === String(c[key]) }, t))));
        const ui = h('div', { class: 'builder' },
          sel('Group by', 'by', cols.map((x) => [x.name, x.name])), sel('Measure', 'measure', [['__count__', 'Row count'], ...numeric.map((x) => [x.name, x.name])]),
          sel('Calculation', 'agg', [['sum', 'Sum'], ['avg', 'Average'], ['count', 'Count'], ['max', 'Max'], ['min', 'Min']]),
          sel('Date step', 'gran', [['day', 'Day'], ['week', 'Week'], ['month', 'Month']]), sel('Chart', 'type', [['bar', 'Bar'], ['line', 'Line'], ['doughnut', 'Doughnut']]), sel('Show top', 'top', [[10, '10'], [15, '15'], [30, '30'], [100, '100']]));
        const redraw = () => { LM.killCharts(); host.replaceChildren(); plot(s, c, host); };
        setTimeout(redraw);
        return h('div', { class: 'card' }, h('h3', {}, 'Summary chart'), ui, host);
      }
      function plot(s, c, host) {
        const bi = s.columns.findIndex((x) => x.name === c.by); if (bi < 0) return;
        const bc = s.columns[bi]; const mi = s.columns.findIndex((x) => x.name === c.measure);
        const key = (v) => { if (v == null) return '(empty)'; if (bc.type !== 'date') return String(v); if (c.gran === 'month') return v.slice(0, 7); if (c.gran === 'week') { const d = new Date(v + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); } return v; };
        const g = new Map();
        s.rows.forEach((r) => { const k = key(r[bi]); const a = g.get(k) || { n: 0, sum: 0, min: Infinity, max: -Infinity }; const v = mi >= 0 ? r[mi] : 1; a.n++; if (typeof v === 'number') { a.sum += v; a.min = Math.min(a.min, v); a.max = Math.max(a.max, v); } g.set(k, a); });
        let arr = [...g.entries()].map(([k, a]) => [k, c.agg === 'count' || mi < 0 ? a.n : c.agg === 'avg' ? a.sum / a.n : c.agg === 'min' ? a.min : c.agg === 'max' ? a.max : a.sum]);
        if (bc.type === 'date') arr.sort((x, y) => (x[0] < y[0] ? -1 : 1)); else arr.sort((x, y) => y[1] - x[1]);
        if (bc.type !== 'date') arr = arr.slice(0, c.top); else arr = arr.slice(-c.top * (c.type === 'line' ? 4 : 1));
        const pal = LM.palette(); const pie = c.type === 'doughnut';
        LM.chart(host, { type: c.type, data: { labels: arr.map((x) => x[0]), datasets: [{ data: arr.map((x) => x[1]), backgroundColor: pie ? arr.map((_, i) => pal[i % pal.length]) : pal[0], borderColor: pal[0], tension: .25 }] },
          options: { plugins: { legend: { display: pie, position: 'right' } }, scales: pie ? {} : { y: { ticks: { callback: (v) => compact(v) } } } } });
      }
      function previewTable(s) {
        const q = h('input', { type: 'search', placeholder: 'Search rows…' });
        const objs = s.rows.slice(0, 5000).map((r) => Object.fromEntries(r.map((v, i) => ['c' + i, v])));
        const cols = s.columns.map((c, i) => ({ k: 'c' + i, label: c.name, l: c.type !== 'number', fmt: c.type === 'number' ? (v) => (v == null ? '' : num2(v)) : undefined }));
        const t = LM.table(cols, objs, { limit: 300 });
        q.oninput = () => { const v = q.value.toLowerCase(); t.redraw(v ? objs.filter((o) => Object.values(o).some((x) => String(x).toLowerCase().includes(v))) : objs); };
        return h('div', {}, h('div', { class: 'tools' }, h('b', {}, 'Data preview'), h('span', { class: 'sub' }, `first 300 of ${num(s.rows.length)} rows`), q), t);
      }

      await load(); draw();
    },
  });
})();
