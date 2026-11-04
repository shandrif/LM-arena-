/* Custom tabs: an admin adds a tab (name + where it goes) with “＋ Add tab” at the end of the tab bar, then writes its content.
   A tab's page is a list of sections the admin builds: KPI tiles, text (rich-text editor) and tables (typed or pasted from Excel,
   optionally shown as a bar or line chart). Each week has its own page, like every other tab; a new week can start from a copy of
   the last one. The tab also has a “Files” sub-tab that takes any Excel/CSV, like the flexible tabs.
   Tab list: templates store, record dept “customtabs” (so it is the same in every week). Pages: datasets store, dept = the tab id, type “page”. */
(function () {
  const LM = window.LM; const { h, num } = LM;
  const KEY = 'customtabs';
  let defs = [];
  const canEdit = () => !(LM.viewOnly || (LM.snapshot && LM.snapshot.active));
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const wkOf = (r) => r.week || r.end || '';
  const weekRange = () => { const wk = (LM.week && LM.week.selected) || new Date().toISOString().slice(0, 10); const s = new Date(wk + 'T00:00:00Z'); s.setUTCDate(s.getUTCDate() - 6); return { start: s.toISOString().slice(0, 10), end: wk }; };
  const toNum = (v) => { const t = String(v == null ? '' : v).replace(/,/g, '').replace(/%$/, '').trim(); if (t === '' || isNaN(+t)) return null; return +t; };

  async function load() { const r = await LM.db.get('templates', KEY); defs = r && Array.isArray(r.tabs) ? r.tabs : []; return defs; }
  async function save() { await LM.db.put('templates', { dept: KEY, tabs: defs }); }

  /** the built-in tabs with the custom ones placed before the tab each one names (default: before Discussion points) */
  function merge(base) {
    const out = base.slice();
    defs.forEach((d) => { let i = out.findIndex((x) => x.id === (d.before || 'discussion')); if (i < 0) i = out.length; out.splice(i, 0, make(d)); });
    return out;
  }

  /* ---------- small dialogs ---------- */
  function modal(title, body, buttons) {
    return new Promise((resolve) => {
      const ov = h('div', { class: 'overlay', style: 'z-index:95' }); const done = (v) => { ov.remove(); resolve(v); };
      ov.append(h('div', { class: 'modal', style: 'max-width:620px' }, h('div', { class: 'mh' }, h('h3', {}, title)), h('div', { class: 'mb' }, body), h('div', { class: 'mf' }, h('div', { class: 'spacer' }), ...buttons(done))));
      document.body.append(ov); const f = ov.querySelector('input,textarea'); if (f) setTimeout(() => f.focus(), 30);
    });
  }
  const field = (label, el) => h('label', { style: 'display:block;margin:0 0 12px' }, h('div', { class: 'sub', style: 'margin-bottom:4px' }, label), el);
  const inputCss = 'width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit';

  /** add a tab, or change one (name / position / delete); allTabs = the tabs as they are shown now */
  async function settings(allTabs, def) {
    const name = h('input', { type: 'text', value: def ? def.label : '', placeholder: 'e.g. Marketing, HR, Customer care', style: inputCss, maxlength: 40 });
    const others = allTabs.filter((t) => !def || t.id !== def.id);
    const pos = h('select', { class: 'sel', style: 'width:100%' }, others.map((t) => h('option', { value: t.id, selected: t.id === ((def && def.before) || 'discussion') }, 'Before “' + t.label + '”')), h('option', { value: '__end', selected: def && def.before === '__end' }, 'At the end'));
    const err = h('div', { class: 'sub', style: 'color:var(--bad);min-height:1em' });
    const ans = await modal(def ? `Tab settings: ${def.label}` : 'Add a tab', h('div', {}, field('Tab name', name), field('Place it', pos), err,
      def ? null : h('p', { class: 'sub', style: 'margin:0' }, 'The new tab starts empty. Use “Edit page” in it to add KPI tiles, text and tables; use “Files” to upload Excel or CSV files. Each week keeps its own page.')),
      (done) => [def ? h('button', { class: 'btn danger', style: 'margin-right:auto', onclick: () => done('delete') }, 'Delete tab') : null, h('button', { class: 'btn', onclick: () => done(null) }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: () => { const n = clean(name.value); if (!n) { err.textContent = 'Please give the tab a name.'; return; } if (allTabs.some((t) => t.label.toLowerCase() === n.toLowerCase() && (!def || t.id !== def.id))) { err.textContent = 'A tab with this name already exists.'; return; } done({ label: n, before: pos.value }); } }, def ? 'Save' : 'Add tab')]);
    if (!ans) return null;
    if (ans === 'delete') {
      if (!(await LM.ask(`Delete the tab “${def.label}”? Its pages and files of the weeks loaded now are removed as well. (Backups you saved earlier still contain them.)`))) return null;
      const dbx = LM.dbRaw || LM.db; for (const r of (await dbx.all('datasets')).filter((x) => x.dept === def.id)) await dbx.del('datasets', r.id);
      defs = defs.filter((d) => d.id !== def.id); await save(); return { deleted: true };
    }
    if (def) { Object.assign(defs.find((d) => d.id === def.id), ans); await save(); return { id: def.id }; }
    const nd = { id: 'ct-' + LM.uid(), label: ans.label, before: ans.before, createdAt: new Date().toISOString() }; defs.push(nd); await save(); return { id: nd.id };
  }

  /* ---------- page view ---------- */
  const kpiTile = (l, v, d) => h('div', { class: 'card kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
  function viewBlock(b, csvName) {
    if (b.type === 'kpis') return h('div', {}, b.title ? h('h3', { style: 'margin:4px 0 8px' }, b.title) : null, h('div', { class: 'grid kpis' }, (b.items || []).filter((k) => k.label || k.value).map((k) => kpiTile(k.label, k.value, k.note || ''))));
    if (b.type === 'text') { const body = h('div', { class: 'rt' }); body.innerHTML = LM.rich.sanitize(b.html || ''); return h('div', { class: 'card', style: 'margin-bottom:12px' }, b.title ? h('h3', {}, b.title) : null, body); }
    if (b.type === 'table') {
      const cols = b.columns || [], rows = (b.rows || []).filter((r) => r.some((c) => clean(c)));
      const numCols = cols.map((c, i) => i > 0 && rows.length && rows.every((r) => clean(r[i]) === '' || toNum(r[i]) != null) && rows.some((r) => toNum(r[i]) != null));
      const chartHost = b.chart && b.chart !== 'none' && numCols.some(Boolean) ? h('div', { class: 'chart' }) : null;
      if (chartHost) setTimeout(() => { const pal = LM.palette(); LM.chart(chartHost, { type: b.chart, data: { labels: rows.map((r) => clean(r[0])), datasets: cols.map((c, i) => i).filter((i) => numCols[i]).map((i, n) => ({ label: cols[i] || 'Column ' + (i + 1), data: rows.map((r) => toNum(r[i])), backgroundColor: pal[n % pal.length], borderColor: pal[n % pal.length], tension: 0 })) }, options: { plugins: { legend: { display: numCols.filter(Boolean).length > 1, position: 'bottom' } } } }); });
      const csv = () => LM.csv(cols.map((c, i) => ({ k: 'c' + i, label: c || 'Column ' + (i + 1) })), rows.map((r) => Object.fromEntries(cols.map((c, i) => ['c' + i, r[i] == null ? '' : r[i]]))), (csvName + '-' + (b.title || 'table')).replace(/[^\w-]+/g, '-') + '.csv');
      return h('div', { class: 'card', style: 'margin-bottom:12px' }, h('div', { class: 'tools' }, h('h3', { style: 'margin:0' }, b.title || 'Table'), h('div', { class: 'spacer' }), rows.length ? h('button', { class: 'btn small', onclick: csv }, 'Export CSV') : null),
        chartHost, rows.length ? h('div', { style: 'overflow:auto;max-height:560px' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, cols.map((c, i) => h('th', { class: numCols[i] ? '' : 'l' }, c)))), h('tbody', {}, rows.map((r) => h('tr', {}, cols.map((c, i) => h('td', { class: numCols[i] ? '' : 'l', style: 'white-space:normal' }, numCols[i] && toNum(r[i]) != null && !/%$/.test(String(r[i]).trim()) ? num(toNum(r[i])) : clean(r[i])))))))) : h('p', { class: 'sub' }, 'No rows yet.'));
    }
    return null;
  }

  /* ---------- page editor: returns { el, get() } ---------- */
  function editBlock(b, ctl) {
    const title = h('input', { type: 'text', value: b.title || '', placeholder: { kpis: 'Section title (optional)', text: 'Title (optional)', table: 'Table title' }[b.type], style: inputCss + ';font-weight:600' });
    const bar = h('div', { class: 'tools', style: 'margin-bottom:8px' }, h('span', { class: 'chip info' }, { kpis: 'KPI tiles', text: 'Text', table: 'Table' }[b.type]), title, h('div', { class: 'spacer' }),
      h('button', { class: 'btn small', title: 'Move up', onclick: () => ctl.move(-1) }, '↑'), h('button', { class: 'btn small', title: 'Move down', onclick: () => ctl.move(1) }, '↓'), h('button', { class: 'btn small danger', onclick: ctl.remove }, 'Remove'));
    let get;
    const wrap = h('div', { class: 'card', 'data-noblk': '1', style: 'margin-bottom:12px;border:1px dashed var(--line)' }, bar);
    if (b.type === 'kpis') {
      const items = (b.items && b.items.length ? b.items : [{ label: '', value: '', note: '' }]).map((k) => ({ ...k }));
      const list = h('div');
      const paint = () => list.replaceChildren(...items.map((k, i) => h('div', { style: 'display:grid;grid-template-columns:1.2fr 1fr 1.6fr auto;gap:8px;margin-bottom:6px' },
        h('input', { type: 'text', value: k.label, placeholder: 'Label, e.g. Leads', style: inputCss, oninput: (e) => (k.label = e.target.value) }),
        h('input', { type: 'text', value: k.value, placeholder: 'Value, e.g. 1,250', style: inputCss, oninput: (e) => (k.value = e.target.value) }),
        h('input', { type: 'text', value: k.note, placeholder: 'Note, e.g. +8% vs last week', style: inputCss, oninput: (e) => (k.note = e.target.value) }),
        h('button', { class: 'btn small', title: 'Remove tile', onclick: () => { items.splice(i, 1); paint(); } }, '✕'))));
      paint(); wrap.append(list, h('button', { class: 'btn small', onclick: () => { items.push({ label: '', value: '', note: '' }); paint(); } }, '＋ Tile'));
      get = () => ({ type: 'kpis', title: clean(title.value), items: items.map((k) => ({ label: clean(k.label), value: clean(k.value), note: clean(k.note) })).filter((k) => k.label || k.value) });
    } else if (b.type === 'text') {
      const ed = LM.rich.editor({ html: b.html || '', placeholder: 'Write here…' }); wrap.append(ed.el);
      get = () => ({ type: 'text', title: clean(title.value), html: ed.getHTML() });
    } else {
      let cols = (b.columns && b.columns.length ? b.columns : ['Item', 'Value']).slice(); let rows = (b.rows && b.rows.length ? b.rows : [['', '']]).map((r) => cols.map((c, i) => (r[i] == null ? '' : String(r[i]))));
      const chart = h('select', { class: 'sel' }, [['none', 'No chart'], ['bar', 'Bar chart'], ['line', 'Line chart']].map(([v, l]) => h('option', { value: v, selected: (b.chart || 'none') === v }, l)));
      const grid = h('div', { style: 'overflow:auto;max-height:480px' });
      const cellCss = 'width:100%;min-width:90px;padding:5px 7px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);font:inherit';
      const paint = () => grid.replaceChildren(h('table', { class: 't' }, h('thead', {}, h('tr', {}, ...cols.map((c, j) => h('th', { class: 'l' }, h('div', { style: 'display:flex;gap:4px' }, h('input', { type: 'text', value: c, placeholder: 'Column', style: cellCss + ';font-weight:600', oninput: (e) => (cols[j] = e.target.value) }), cols.length > 1 ? h('button', { class: 'btn small', title: 'Remove column', onclick: () => { cols.splice(j, 1); rows.forEach((r) => r.splice(j, 1)); paint(); } }, '✕') : null))), h('th', {}, ''))),
        h('tbody', {}, rows.map((r, i) => h('tr', {}, ...cols.map((c, j) => h('td', { class: 'l' }, h('input', { type: 'text', value: r[j], style: cellCss, oninput: (e) => (r[j] = e.target.value) }))), h('td', {}, h('button', { class: 'btn small', title: 'Remove row', onclick: () => { rows.splice(i, 1); if (!rows.length) rows.push(cols.map(() => '')); paint(); } }, '✕')))))));
      const paste = async () => {
        const ta = h('textarea', { rows: 10, placeholder: 'Copy the cells in Excel (with the header row) and paste them here.', style: inputCss + ';font-family:monospace;font-size:12.5px' });
        const ok = await modal('Paste from Excel', h('div', {}, ta, h('p', { class: 'sub', style: 'margin:8px 0 0' }, 'The first line becomes the column names. This replaces the rows of this table.')), (done) => [h('button', { class: 'btn', onclick: () => done(false) }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => done(true) }, 'Use these rows')]);
        if (!ok) return; const lines = ta.value.replace(/\r/g, '').split('\n').filter((l) => l.trim()); if (!lines.length) return;
        const g = lines.map((l) => l.split('\t')); const w = Math.max(...g.map((r) => r.length)); cols = Array.from({ length: w }, (_, j) => clean(g[0][j]) || 'Column ' + (j + 1)); rows = g.slice(1).map((r) => Array.from({ length: w }, (_, j) => clean(r[j]))); if (!rows.length) rows = [cols.map(() => '')]; paint();
      };
      paint();
      wrap.append(grid, h('div', { class: 'tools', style: 'margin-top:8px' }, h('button', { class: 'btn small', onclick: () => { rows.push(cols.map(() => '')); paint(); } }, '＋ Row'), h('button', { class: 'btn small', onclick: () => { cols.push('Column ' + (cols.length + 1)); rows.forEach((r) => r.push('')); paint(); } }, '＋ Column'), h('button', { class: 'btn small', onclick: paste }, '📋 Paste from Excel'), h('div', { class: 'spacer' }), h('span', { class: 'sub' }, 'Show as'), chart, h('span', { class: 'sub' }, '(first column = labels)')));
      get = () => ({ type: 'table', title: clean(title.value), columns: cols.map(clean), rows: rows.map((r) => r.map(clean)).filter((r) => r.some(Boolean)), chart: chart.value });
    }
    return { el: wrap, get };
  }

  /* ---------- the tab ---------- */
  function make(def) {
    return {
      id: def.id, label: def.label, custom: true,
      async mount(panel) {
        let page = null, earlier = null, sub = 'Page', editing = false;
        async function loadPage() {
          page = (await LM.db.all('datasets')).find((r) => r.dept === def.id && r.type === 'page') || null; earlier = null;
          if (!page) { const sel = (LM.week && LM.week.selected) || '9999'; earlier = (await (LM.dbRaw || LM.db).all('datasets')).filter((r) => r && r.dept === def.id && r.type === 'page' && wkOf(r) < sel).sort((a, b) => (wkOf(a) < wkOf(b) ? 1 : -1))[0] || null; }
        }
        async function savePage(blocks) {
          const rec = { ...(page || { id: LM.uid(), dept: def.id, type: 'page', fileName: '(written in the dashboard)' }), ...weekRange(), uploadedAt: new Date().toISOString(), data: { blocks } };
          await LM.db.put('datasets', rec); await loadPage();
        }
        const allTabs = () => (LM.tabsNow ? LM.tabsNow() : []);
        const gear = canEdit() ? h('button', { class: 'btn small', onclick: async () => { const r = await settings(allTabs(), def); if (r && LM.customTabs.changed) LM.customTabs.changed(r.deleted ? 'sales' : def.id); } }, '⚙ Tab settings') : null;

        function pageView() {
          const host = h('div'); const src = page || earlier; const blocks = src ? src.data.blocks || [] : [];
          if (editing) return editor(blocks);
          const edit = canEdit() ? h('button', { class: 'btn primary', onclick: () => { editing = true; draw(); } }, page ? '✎ Edit page' : '✎ Start this week’s page') : null;
          const copy = canEdit() && !page && earlier ? h('button', { class: 'btn', onclick: async () => { await savePage(JSON.parse(JSON.stringify(earlier.data.blocks || []))); LM.toast('Copied to this week'); draw(); } }, '⧉ Copy last week’s page to this week') : null;
          host.append(h('div', { class: 'tools', style: 'margin-bottom:10px' }, page ? h('span', { class: 'sub' }, `Last saved ${String(page.uploadedAt).slice(0, 16).replace('T', ' ')}`) : null, h('div', { class: 'spacer' }), copy, edit));
          if (!page && earlier) host.append(h('div', { class: 'banner', style: 'background:var(--warn-bg);color:var(--warn)' }, `Nothing written for this week yet. Showing the page of the week ending ${wkOf(earlier)}.`));
          if (!blocks.length) host.append(h('div', { class: 'empty' }, h('h3', {}, 'Nothing here yet'), h('p', { class: 'sub' }, canEdit() ? 'Click “Start this week’s page” to add KPI tiles, text and tables, or open “Files” to upload an Excel or CSV file.' : 'The admin has not added anything to this tab yet.')));
          blocks.forEach((b) => { const el = viewBlock(b, def.label); if (el) host.append(el); });
          return host;
        }
        function editor(blocks) {
          let eds = blocks.map((b) => mk(b)); const list = h('div');
          function mk(b) { const o = { b }; o.e = editBlock(b, { move: (d) => { const i = eds.indexOf(o), j = i + d; if (j < 0 || j >= eds.length) return; eds.forEach((x) => (x.b = x.e.get())); [eds[i], eds[j]] = [eds[j], eds[i]]; eds = eds.map((x) => mk(x.b)); paint(); }, remove: async () => { if (await LM.ask('Remove this section?')) { eds = eds.filter((x) => x !== o); paint(); } } }); return o; }
          const paint = () => list.replaceChildren(...(eds.length ? eds.map((x) => x.e.el) : [h('p', { class: 'sub' }, 'Add a section with the buttons above.')]));
          const add = (type) => { eds.push(mk({ type })); paint(); eds[eds.length - 1].e.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
          paint();
          return h('div', {}, h('div', { class: 'tools', style: 'margin-bottom:10px;position:sticky;top:0;z-index:5;background:var(--bg);padding:6px 0' }, h('b', {}, 'Editing this week’s page'), h('span', { class: 'sub' }, 'Add:'),
            h('button', { class: 'btn small', onclick: () => add('kpis') }, '＋ KPI tiles'), h('button', { class: 'btn small', onclick: () => add('text') }, '＋ Text'), h('button', { class: 'btn small', onclick: () => add('table') }, '＋ Table'), h('div', { class: 'spacer' }),
            h('button', { class: 'btn', onclick: async () => { if (await LM.ask('Leave without saving your changes?')) { editing = false; draw(); } } }, 'Cancel'),
            h('button', { class: 'btn primary', onclick: async (e) => { e.target.disabled = true; try { await savePage(eds.map((x) => x.e.get())); editing = false; LM.toast('Page saved'); draw(); } catch (er) { e.target.disabled = false; LM.say('Could not save: ' + er.message); } } }, 'Save page')), list);
        }
        function draw() {
          LM.killCharts();
          const st = h('div', { class: 'subtabs' }, ['Page', 'Files'].map((t) => h('button', { class: t === sub ? 'on' : '', onclick: async () => { if (editing && !(await LM.ask('Leave the editor without saving?'))) return; editing = false; sub = t; draw(); } }, t)));
          if (sub === 'Files') { const host = h('div'); panel.replaceChildren(h('div', { class: 'head' }, h('h2', {}, def.label), h('div', { class: 'spacer' }), gear), st, host); return LM.makeGenericDept(def.id, def.label, null).mount(host); }
          panel.replaceChildren(h('div', { class: 'head' }, h('h2', {}, def.label), h('div', { class: 'spacer' }), gear), st, pageView());
        }
        await loadPage(); draw();
      },
    };
  }

  LM.customTabs = { load, merge, settings, defs: () => defs, changed: null };
})();
