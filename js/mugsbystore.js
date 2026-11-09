/* Mugs tab, extra table "Mugs by store": Store | Mugs | Sales (Qty, Value) | Stock.
   Stock comes from the weekly SOH tracker (LM.mugstock.view), sales from the sales report items; mugs are matched by the same mug names. */
(function () {
  const LM = window.LM; const { h, norm } = LM; const n0 = (v) => Math.round(v).toLocaleString('en-US');
  const bkey = (name) => { const m = /^B\s*0*(\d+)/i.exec(String(name).trim()); return m ? 'B' + m[1] : null; };
  const GENERIC = new Set(['mall', 'road', 'street', 'station', 'center', 'centre', 'plaza', 'jeddah', 'riyadh', 'makkah', 'madinah', 'taif', 'the', 'and']);
  const toks = (s) => String(s).toLowerCase().replace(/^b\s*\d+/, ' ').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((x) => x.length >= 3 && !GENERIC.has(x));
  function match(name, branches) {
    const k = bkey(name); if (k) { const b = branches.find((x) => x.key === k); return b || null; }
    const a = toks(name); if (!a.length) return null; let best = null, tie = false;
    branches.forEach((b) => { const t = toks(b.name); const dal = (w) => w.replace(/^(al|el)(?=.{3,})/, ''); const same = (x, y) => { x = dal(x); y = dal(y); if (x === y) return true; if (x.length <= 3 || y.length <= 3) return false; const [sh, lo] = x.length <= y.length ? [x, y] : [y, x]; return (sh.length >= 4 && lo.includes(sh)) || LM.similarity(x, y) >= 0.8; }; const hits = a.filter((x) => t.some((y) => same(x, y))).length; if (hits && hits === a.length) { if (!best) best = b; else tie = true; } });
    return best && !tie ? best : null;
  }
  /** V = LM.mugstock.view(record); ds = a sales report (or null) */
  function card(V, ds, day, links, onLink) {
    const bk = LM.sales.branchKey; const sold = new Map(); let branches = [];
    const dayOn = !!(day && day.hasStores); // the mugs-sold-by-store export is the exact source when it has been uploaded for the week
    if (dayOn) { const seen = new Map(); LM.mugdaily.compute(day).byStore.forEach((r) => { const k = bk(r.store) + '|' + r.mug; const o = sold.get(k) || { qty: 0, value: 0 }; o.qty += r.qty; o.value += r.sales; sold.set(k, o); seen.set(bk(r.store), r.store); }); branches = [...seen.entries()].map(([key, name]) => ({ key, name })); }
    else if (ds) { const seen = new Map(); ds.items.forEach((r) => { const m = LM.mugstock.mugOf(r.item); if (!m || m.unknown || /repeated|refill|non\s*hm/i.test(r.item)) return; const k = bk(r.store) + '|' + m.name; const o = sold.get(k) || { qty: 0, value: 0 }; o.qty += r.qty || 0; o.value += r.sales || 0; sold.set(k, o); seen.set(bk(r.store), r.store); }); branches = [...seen.entries()].map(([key, name]) => ({ key, name })); }
    if (!V) { const names = [...new Set([...sold.keys()].map((k) => k.split('|')[1]))].sort(); V = { stores: [], mugs: names.map((name) => ({ name })) }; } // no stock file for this week: sales only, Stock shows “–”
    const rows = []; const used = new Set(); const cnt = {};
    const mm = V.stores.map((s) => { const lk = links && links[norm(s.name)]; const lb = lk ? branches.find((x) => x.key === lk) : null; return { s, b: (ds || dayOn) ? (lb || match(s.name, branches)) : null, manual: !!lb }; }); mm.forEach(({ b, manual }) => { if (b && !manual) cnt[b.key] = (cnt[b.key] || 0) + 1; });
    mm.forEach(({ s, b, manual }) => { const ok = b && (manual || cnt[b.key] === 1); if (ok) used.add(b.key); V.mugs.forEach((m) => { const stock = s.mug[m.name]; const sd = ok ? sold.get(b.key + '|' + m.name) : null; if (!(stock || (sd && (sd.qty || sd.value)))) return; rows.push({ store: ok ? b.name : s.name, rom: s.rom, mug: m.name, qty: ok ? (sd ? sd.qty : 0) : null, value: ok ? (sd ? sd.value : 0) : null, stock: stock == null ? null : stock }); }); });
    if (ds) branches.forEach((b) => { if (used.has(b.key)) return; V.mugs.forEach((m) => { const sd = sold.get(b.key + '|' + m.name); if (sd && (sd.qty || sd.value)) rows.push({ store: b.name, rom: '', mug: m.name, qty: sd.qty, value: sd.value, stock: null }); }); });
    const order = new Map(V.mugs.map((m, i) => [m.name, i])); rows.sort((a, b) => (a.store < b.store ? -1 : a.store > b.store ? 1 : order.get(a.mug) - order.get(b.mug)));
    const q = { s: '', store: '', max: 150 }; const body = h('tbody'); const cnt2 = h('span', { class: 'sub' }); const more = h('div', { style: 'margin-top:8px' });
    const draw = () => { const t = q.s.toLowerCase(); const list = rows.filter((d) => (!q.store || d.store === q.store) && (!t || (d.store + ' ' + d.mug).toLowerCase().includes(t))); const shown = list.slice(0, q.max); let last = null; // only the first rows are drawn so the page stays fast; “Show more” adds the rest
      body.replaceChildren(...shown.map((d) => { const first = d.store !== last; last = d.store; return h('tr', { style: first ? 'border-top:2px solid var(--line)' : '' }, h('td', { class: 'l' }, first ? h('b', {}, d.store) : ''), h('td', { class: 'l' }, d.mug), h('td', {}, d.qty == null ? '–' : n0(d.qty)), h('td', {}, d.value == null ? '–' : n0(d.value)), h('td', {}, d.stock == null ? '–' : n0(d.stock))); })); cnt2.textContent = `${list.length} rows`;
      more.replaceChildren(...(list.length > shown.length ? [h('button', { class: 'btn small', onclick: () => { q.max += 300; draw(); } }, `Show 300 more (${list.length - shown.length} not shown yet)`), ' ', h('button', { class: 'btn small', onclick: () => { q.max = 1e9; draw(); } }, 'Show all'), h('span', { class: 'sub' }, ' Search or pick a store to find a row.')] : [])); };
    draw();
    const names = [...new Set(rows.map((d) => d.store))]; const cols = [{ k: 'store', label: 'Store' }, { k: 'mug', label: 'Mug' }, { k: 'qty', label: 'Sales qty' }, { k: 'value', label: 'Sales value (SAR)' }, { k: 'stock', label: 'Stock' }];
    const unm = (ds || dayOn) ? mm.filter(({ s, b, manual }) => !b || (!manual && cnt[b.key] > 1)) : []; const opts = branches.slice().sort((a, b) => (a.name < b.name ? -1 : 1));
    // best guess for each unlinked stock store (never saved until the user confirms it)
    const usedKeys = new Set(mm.filter(({ b, manual }) => b && (manual || cnt[b.key] === 1)).map(({ b }) => b.key)); const dal2 = (w) => w.replace(/^(al|el)(?=.{3,})/, '');
    const score = (name, b) => { const a = toks(name), t = toks(b.name); if (!a.length || !t.length) return 0; return a.reduce((m, x) => Math.max(m, ...t.map((y) => { const xx = dal2(x), yy = dal2(y); if (xx === yy) return 1; const sh = xx.length <= yy.length ? xx : yy, lo = xx.length <= yy.length ? yy : xx; if (sh.length >= 4 && lo.includes(sh)) return 0.9; return LM.similarity(xx, yy); })), 0) / 1; };
    const guess = (name) => { let best = null; opts.forEach((b) => { if (usedKeys.has(b.key)) return; const sc = score(name, b); if (sc >= 0.6 && (!best || sc > best.sc)) best = { b, sc }; }); return best ? best.b : null; };
    const guesses = new Map(unm.map(({ s }) => [s.name, guess(s.name)])); const nGuess = [...guesses.values()].filter(Boolean).length;
    let unmatched = null;
    if (unm.length && onLink && !LM.viewOnly) {
      const gc = {}; guesses.forEach((b) => { if (b) gc[b.key] = (gc[b.key] || 0) + 1; }); // a guess that two stock stores share is not offered
      const selFor = (s) => h('select', { class: 'sel', style: 'max-width:260px', onchange: (e) => onLink(s.name, e.target.value) }, h('option', { value: '' }, 'Not linked – choose…'), ...opts.map((b) => h('option', { value: b.key }, b.name)));
      const hint = (s) => { const g = guesses.get(s.name); return g && gc[g.key] === 1 ? h('span', {}, h('span', { class: 'sub' }, 'closest name: '), g.name, ' ', h('button', { class: 'btn small', onclick: () => onLink(s.name, g.key) }, 'Use')) : h('span', { class: 'sub' }, 'no clear candidate'); };
      const trs = unm.map(({ s }) => h('tr', {}, h('td', { class: 'l' }, s.name, h('span', { class: 'sub' }, ` · ${s.rom}`)), h('td', { class: 'l' }, hint(s)), h('td', { class: 'l' }, selFor(s))));
      unmatched = h('details', { style: 'margin-top:10px' }, h('summary', { style: 'cursor:pointer;font-weight:600' }, `${unm.length} stock stores are not linked to a store of the sales data — link them`), h('div', { class: 'sub', style: 'margin:6px 0' }, 'Choose the matching store once; it is remembered for the next weeks. “Closest name” is only a guess from the spelling: check it before pressing Use.'), h('table', { class: 't' }, h('tbody', {}, ...trs)));
    }
    return h('div', { class: 'card', style: 'margin-bottom:12px' }, h('div', { class: 'tools' }, h('h3', { style: 'margin:0' }, 'Mugs by store'), h('div', { class: 'spacer' }), h('input', { type: 'search', placeholder: 'Search store or mug…', oninput: (e) => { q.s = e.target.value; q.max = 150; draw(); } }), h('select', { class: 'sel', onchange: (e) => { q.store = e.target.value; q.max = 150; draw(); } }, h('option', { value: '' }, 'All stores'), ...names.map((n) => h('option', { value: n }, n))), cnt2, h('button', { class: 'btn small', onclick: () => LM.csv(cols, rows, 'mugs-by-store.csv') }, 'Export CSV')),
      h('div', { class: 'tscroll', style: 'max-height:560px;overflow:auto;margin-top:8px' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', { class: 'l', rowspan: 2 }, 'Store'), h('th', { class: 'l', rowspan: 2 }, 'Mugs'), h('th', { colspan: 2, style: 'text-align:center;border-bottom:1px solid var(--line)' }, 'Sales'), h('th', { rowspan: 2 }, 'Stock')), h('tr', {}, h('th', {}, 'Qty'), h('th', {}, 'Value (SAR)'))), body)), more,
      unmatched, h('div', { class: 'sub', style: 'margin-top:6px' }, dayOn ? `Sales = the “mugs sold” report ${day.start} → ${day.end} (exact, per store). “–” = the stock store could not be matched with certainty to a store of that report (or has no stock figure).` : !ds ? 'Open a sales report to fill the Sales columns.' : ds ? `Sales = the sales report ${ds.start} → ${ds.end} for that mug in that store. “–” = the stock store could not be matched with certainty to a sales branch (or has no stock figure).` : 'Open a sales report to fill the Sales columns.'));
  }
  LM.mugsByStore = { card, match };
})();
