/* Custom tabs: the user adds his own tab to the tab bar and fills it with notes, number cards and tables (optionally charted).
   The list of tabs is saved once (templates store, same for every week); the content of a tab is saved per week like every other tab. */
(function () {
  const LM = window.LM; const { h } = LM; const KEY = 'custom-tabs';
  const uid = () => 'cu_' + Math.random().toString(36).slice(2, 8);
  const readOnly = () => !!LM.viewOnly || !!(LM.snapshot && LM.snapshot.active);
  const NUM = (v) => { const s = String(v == null ? '' : v).replace(/[,£$€%\s]|SAR|IQD|GBP|USD/gi, '').replace(/[−–]/g, '-'); if (s === '' || s === '-') return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
  const fmt = (n) => (Math.abs(n - Math.round(n)) < 1e-9 ? Math.round(n).toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 2 }));

  async function loadDefs() { try { const r = await LM.db.get('templates', KEY); return (r && r.tabs) || []; } catch (e) { return []; } }
  async function saveDefs(tabs) { await LM.db.put('templates', { dept: KEY, tabs }); }

  /** small "type a name" dialog */
  function askText(title, value, okLabel) {
    return new Promise((resolve) => {
      const inp = h('input', { type: 'text', value: value || '', maxlength: 40, style: 'width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);font:inherit' });
      const ov = h('div', { class: 'overlay', style: 'z-index:90' }); const done = (v) => { ov.remove(); resolve(v); };
      const ok = () => { const t = inp.value.trim(); if (t) done(t); else inp.focus(); };
      inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); else if (e.key === 'Escape') done(null); };
      ov.append(h('div', { class: 'modal', style: 'max-width:420px' }, h('div', { class: 'mh' }, h('h3', {}, title)), h('div', { class: 'mb' }, inp), h('div', { class: 'mf' }, h('div', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => done(null) }, 'Cancel'), h('button', { class: 'btn primary', onclick: ok }, okLabel || 'Save'))));
      document.body.append(ov); inp.focus(); inp.select();
    });
  }

  function makeDept(def, ctl) {
    return {
      id: def.id, label: def.label, custom: true,
      async mount(panel) {
        const view = readOnly();
        let rec = (await LM.db.all('datasets')).find((r) => r.dept === def.id) || null;
        let page = rec && rec.data ? rec.data : { blocks: [] }; if (!Array.isArray(page.blocks)) page.blocks = [];
        let t = null;
        const save = () => { clearTimeout(t); t = setTimeout(async () => { try { const r = { id: rec ? rec.id : `cu-${def.id}-${LM.week.selected}`, dept: def.id, type: 'page', fileName: def.label, uploadedAt: new Date().toISOString(), data: page }; await LM.db.put('datasets', r); rec = r; } catch (e) { LM.say('Could not save: ' + e.message); } }, 350); };
        const root = h('div');
        const ibox = (v, o) => h('input', Object.assign({ type: 'text', value: v == null ? '' : v, disabled: view, style: 'width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);font:inherit;min-width:70px' }, o || {}));
        const move = (b, d) => { const i = page.blocks.indexOf(b), j = i + d; if (j < 0 || j >= page.blocks.length) return; page.blocks.splice(i, 1); page.blocks.splice(j, 0, b); save(); draw(); };
        const remove = async (b) => { if (!(await LM.ask(`Delete this ${b.type === 'table' ? 'table' : b.type === 'kpi' ? 'number cards block' : 'note'}${b.title ? ' “' + b.title + '”' : ''}?`))) return; page.blocks.splice(page.blocks.indexOf(b), 1); save(); draw(); };
        const head = (b) => h('div', { class: 'tools', style: 'margin-bottom:8px' }, ibox(b.title, { placeholder: 'Title (optional)', style: 'flex:1;min-width:160px;font-weight:600;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink)', oninput: (e) => { b.title = e.target.value; save(); } }),
          view ? null : [h('button', { class: 'btn small', title: 'Move up', onclick: () => move(b, -1) }, '▲'), h('button', { class: 'btn small', title: 'Move down', onclick: () => move(b, 1) }, '▼'), h('button', { class: 'btn small danger', title: 'Delete', onclick: () => remove(b) }, '✕')]);

        /* ---- note ---- */
        function noteBlock(b) {
          const el = h('div', { class: 'card', 'data-noblk': '1', style: 'margin-bottom:12px' }, head(b));
          if (view) { el.append(h('div', { class: 'rt', html: LM.rich.sanitize(b.html || '') })); return el; }
          const ed = LM.rich.editor({ html: b.html || '', placeholder: 'Write your notes here…' }); const sv = () => { b.html = ed.isEmpty() ? '' : ed.getHTML(); save(); }; ed.el.addEventListener('focusout', sv); ed.el.addEventListener('input', () => { clearTimeout(noteBlock.t); noteBlock.t = setTimeout(sv, 600); });
          el.append(ed.el); return el;
        }
        /* ---- number cards ---- */
        function kpiBlock(b) {
          const el = h('div', { class: 'card', 'data-noblk': '1', style: 'margin-bottom:12px' }, head(b)); const grid = h('div', { class: 'grid kpis' });
          const drawK = () => { grid.replaceChildren(...b.items.map((k, i) => h('div', { class: 'card kpi' },
            ibox(k.label, { placeholder: 'Label', oninput: (e) => { k.label = e.target.value; save(); }, style: 'font-size:12px;margin-bottom:4px;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);width:100%' }),
            ibox(k.value, { placeholder: 'Value', oninput: (e) => { k.value = e.target.value; save(); }, style: 'font-size:22px;font-weight:700;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);width:100%' }),
            ibox(k.note, { placeholder: 'Note (optional)', oninput: (e) => { k.note = e.target.value; save(); }, style: 'font-size:12px;margin-top:4px;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);width:100%' }),
            view ? null : h('button', { class: 'btn small', style: 'margin-top:6px', onclick: () => { b.items.splice(i, 1); save(); drawK(); } }, 'Remove')))); };
          drawK(); el.append(grid, view ? null : h('button', { class: 'btn small', style: 'margin-top:8px', onclick: () => { b.items.push({ label: '', value: '', note: '' }); save(); drawK(); } }, '＋ Add a number')); return el;
        }
        /* ---- table (+ optional chart) ---- */
        function tableBlock(b) {
          const el = h('div', { class: 'card', 'data-noblk': '1', style: 'margin-bottom:12px' }, head(b)); const holder = h('div', { style: 'overflow-x:auto' }); const foot = h('div'); const chartHost = h('div');
          const nCols = () => b.cols.length;
          const fit = () => { b.rows.forEach((r) => { while (r.length < nCols()) r.push(''); r.length = nCols(); }); };
          const numCol = (c) => { const v = b.rows.map((r) => r[c]).filter((x) => String(x == null ? '' : x).trim() !== ''); return v.length > 0 && v.every((x) => NUM(x) != null); };
          function paste(e, r0, c0) {
            const txt = (e.clipboardData || window.clipboardData).getData('text/plain'); if (!/[\t\n]/.test(txt.replace(/\n$/, ''))) return; e.preventDefault();
            const grid = txt.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
            if (r0 === 0 && c0 === 0 && grid.length > 1 && grid[0].every((x) => NUM(x) == null) && grid.slice(1).some((g) => g.some((x) => NUM(x) != null))) { b.cols = grid[0].map((x, i) => x.trim() || 'Column ' + (i + 1)); b.rows = grid.slice(1).map((g) => b.cols.map((_, i) => (g[i] || '').trim())); save(); drawTable(); return; } // first line = column names
            const needC = c0 + Math.max(...grid.map((g) => g.length)); while (nCols() < needC) b.cols.push('Column ' + (nCols() + 1)); while (b.rows.length < r0 + grid.length) b.rows.push(b.cols.map(() => '')); fit();
            grid.forEach((g, i) => g.forEach((v, j) => { b.rows[r0 + i][c0 + j] = v.trim(); })); save(); drawTable();
          }
          function drawTable() {
            fit(); const tbl = h('table', { class: 't' });
            tbl.append(h('thead', {}, h('tr', {}, b.cols.map((c, ci) => h('th', { class: 'l', style: 'white-space:nowrap' }, ibox(c, { style: 'font-weight:600;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);width:calc(100% - 36px);min-width:90px', oninput: (e) => { b.cols[ci] = e.target.value; save(); }, onchange: () => { drawFoot(); } }), view ? null : h('button', { class: 'btn small', title: 'Delete this column', style: 'margin-left:4px', onclick: () => { if (nCols() < 2) return; b.cols.splice(ci, 1); b.rows.forEach((r) => r.splice(ci, 1)); save(); drawTable(); } }, '✕'))), view ? null : h('th', {}))));
            const tb = h('tbody'); b.rows.forEach((r, ri) => tb.append(h('tr', {}, r.map((v, ci) => h('td', { class: 'l' }, ibox(v, { oninput: (e) => { r[ci] = e.target.value; save(); }, onchange: () => drawFoot(), onpaste: (e) => paste(e, ri, ci), style: 'width:100%;padding:5px 7px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);min-width:90px' + (numCol(ci) ? ';text-align:right' : '') }))), view ? null : h('td', {}, h('button', { class: 'btn small', title: 'Delete this row', onclick: () => { b.rows.splice(ri, 1); save(); drawTable(); } }, '✕'))))); tbl.append(tb); holder.replaceChildren(tbl); drawFoot();
          }
          function drawFoot() {
            const sums = b.cols.map((_, c) => (numCol(c) ? b.rows.reduce((s, r) => s + (NUM(r[c]) || 0), 0) : null)); const any = sums.some((s) => s != null);
            const tot = any ? h('div', { style: 'margin-top:8px;display:flex;gap:16px;flex-wrap:wrap;font-size:13px' }, b.cols.map((c, i) => (sums[i] != null ? h('span', {}, h('b', {}, c || 'Column ' + (i + 1)), ' total: ', fmt(sums[i])) : null))) : null;
            foot.replaceChildren(...[tot].filter(Boolean)); drawChart();
          }
          function drawChart() {
            chartHost.replaceChildren(); if (!b.chart || !b.chart.on) return; const cols = b.cols.map((_, c) => c).filter((c) => c > 0 && numCol(c)); const rows = b.rows.filter((r) => String(r[0] || '').trim() !== '');
            if (!cols.length || !rows.length) { chartHost.append(h('div', { class: 'sub' }, 'To draw a chart: put names in the first column and numbers in the other columns.')); return; }
            const box = h('div', { class: 'chart', style: 'height:280px;margin-top:10px' }); chartHost.append(box); const PAL = ['#7a4a2b', '#2c7a7b', '#c2851f', '#5b6fb5', '#a8456b', '#6b8e3d', '#8a8a8a'];
            setTimeout(() => LM.chart(box, { type: b.chart.kind === 'line' ? 'line' : 'bar', data: { labels: rows.map((r) => r[0]), datasets: cols.map((c, i) => ({ label: b.cols[c], data: rows.map((r) => NUM(r[c])), backgroundColor: PAL[i % PAL.length], borderColor: PAL[i % PAL.length], tension: 0 })) }, options: { plugins: { legend: { display: cols.length > 1, position: 'bottom' } } } }));
          }
          drawTable();
          const ctrl = view ? (b.chart && b.chart.on ? null : null) : h('div', { class: 'tools', style: 'margin-top:8px' },
            h('button', { class: 'btn small', onclick: () => { b.rows.push(b.cols.map(() => '')); save(); drawTable(); } }, '＋ Row'), h('button', { class: 'btn small', onclick: () => { b.cols.push('Column ' + (nCols() + 1)); fit(); save(); drawTable(); } }, '＋ Column'),
            h('label', { class: 'sub', style: 'display:inline-flex;gap:6px;align-items:center' }, h('input', { type: 'checkbox', checked: !!(b.chart && b.chart.on), onchange: (e) => { b.chart = { ...(b.chart || { kind: 'bar' }), on: e.target.checked }; save(); drawChart(); } }), 'Show chart'),
            h('select', { class: 'sel', onchange: (e) => { b.chart = { ...(b.chart || {}), on: !!(b.chart && b.chart.on), kind: e.target.value }; save(); drawChart(); } }, [['bar', 'Bars'], ['line', 'Lines']].map(([v, l]) => h('option', { value: v, selected: ((b.chart && b.chart.kind) || 'bar') === v }, l))),
            h('span', { class: 'sub' }, 'Tip: copy cells from Excel and paste them into the first cell.'));
          el.append(holder, foot, ctrl, chartHost); return el;
        }

        const blank = { note: () => ({ type: 'note', title: '', html: '' }), kpi: () => ({ type: 'kpi', title: '', items: [{ label: '', value: '', note: '' }, { label: '', value: '', note: '' }, { label: '', value: '', note: '' }] }), table: () => ({ type: 'table', title: '', cols: ['Name', 'Value'], rows: [['', ''], ['', ''], ['', '']], chart: { on: false, kind: 'bar' } }) };
        const addBar = () => (view ? null : h('div', { class: 'tools', style: 'margin:6px 0 14px' }, h('b', {}, 'Add to this tab:'), h('button', { class: 'btn small primary', onclick: () => { page.blocks.push(blank.table()); save(); draw(); } }, '＋ Table'), h('button', { class: 'btn small primary', onclick: () => { page.blocks.push(blank.kpi()); save(); draw(); } }, '＋ Number cards'), h('button', { class: 'btn small primary', onclick: () => { page.blocks.push(blank.note()); save(); draw(); } }, '＋ Note')));

        async function lastWeek() { const raw = await (LM.dbRaw || LM.db).all('datasets'); return raw.filter((r) => r.dept === def.id && r.week && r.week < LM.week.selected).sort((a, b) => (a.week < b.week ? 1 : -1))[0] || null; }
        async function draw() {
          LM.killCharts();
          const top = h('div', { class: 'head' }, h('h2', {}, def.label), h('span', { class: 'sub' }, view ? 'Custom tab' : 'Your own tab: add tables, number cards and notes. Everything is saved automatically for the week you are in.'), h('div', { class: 'spacer' }),
            view ? null : [h('button', { class: 'btn small', onclick: async () => { const n = await askText('Rename this tab', def.label, 'Rename'); if (n) { await ctl.rename(def.id, n); def.label = n; draw(); } } }, 'Rename tab'), h('button', { class: 'btn small danger', onclick: async () => { if (await LM.ask(`Delete the tab “${def.label}” and everything in it (all weeks)? This cannot be undone.`)) ctl.remove(def.id); } }, 'Delete tab')]);
          const kids = [top];
          if (!page.blocks.length) { const lw = view ? null : await lastWeek(); kids.push(h('div', { class: 'empty' }, h('h3', {}, view ? 'Nothing here yet' : 'This tab is empty'), view ? null : h('div', { class: 'sub', style: 'margin-bottom:10px' }, 'Start with a table for your numbers, number cards for the headline figures, or a note.'), lw ? h('button', { class: 'btn', onclick: () => { page = { blocks: JSON.parse(JSON.stringify(lw.data.blocks || [])) }; save(); draw(); } }, `Copy week ${LM.week.label(lw.week)} into this week`) : null)); }
          page.blocks.forEach((b) => kids.push(b.type === 'table' ? tableBlock(b) : b.type === 'kpi' ? kpiBlock(b) : noteBlock(b)));
          kids.push(addBar()); root.replaceChildren(...kids.filter(Boolean));
        }
        panel.replaceChildren(root); await draw();
      },
    };
  }
  LM.custom = { loadDefs, saveDefs, makeDept, askText, uid, ctl: null };
})();
