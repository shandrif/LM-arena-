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
    branches.forEach((b) => { const t = toks(b.name); const hits = a.filter((x) => t.some((y) => (x.length === 3 || y.length === 3 ? x === y : LM.similarity(x, y) >= 0.8))).length; if (hits && hits === a.length) { if (!best) best = b; else tie = true; } });
    return best && !tie ? best : null;
  }
  /** V = LM.mugstock.view(record); ds = a sales report (or null) */
  function card(V, ds) {
    const bk = LM.sales.branchKey; const sold = new Map(); let branches = [];
    if (ds) { const seen = new Map(); ds.items.forEach((r) => { const m = LM.mugstock.mugOf(r.item); if (!m || m.unknown) return; const k = bk(r.store) + '|' + m.name; const o = sold.get(k) || { qty: 0, value: 0 }; o.qty += r.qty || 0; o.value += r.sales || 0; sold.set(k, o); seen.set(bk(r.store), r.store); }); branches = [...seen.entries()].map(([key, name]) => ({ key, name })); }
    const rows = []; const used = new Set(); const cnt = {};
    const mm = V.stores.map((s) => ({ s, b: ds ? match(s.name, branches) : null })); mm.forEach(({ b }) => { if (b) cnt[b.key] = (cnt[b.key] || 0) + 1; });
    mm.forEach(({ s, b }) => { const ok = b && cnt[b.key] === 1; if (ok) used.add(b.key); V.mugs.forEach((m) => { const stock = s.mug[m.name]; const sd = ok ? sold.get(b.key + '|' + m.name) : null; if (!(stock || (sd && (sd.qty || sd.value)))) return; rows.push({ store: ok ? b.name : s.name, rom: s.rom, mug: m.name, qty: ok ? (sd ? sd.qty : 0) : null, value: ok ? (sd ? sd.value : 0) : null, stock: stock == null ? null : stock }); }); });
    if (ds) branches.forEach((b) => { if (used.has(b.key)) return; V.mugs.forEach((m) => { const sd = sold.get(b.key + '|' + m.name); if (sd && (sd.qty || sd.value)) rows.push({ store: b.name, rom: '', mug: m.name, qty: sd.qty, value: sd.value, stock: null }); }); });
    const order = new Map(V.mugs.map((m, i) => [m.name, i])); rows.sort((a, b) => (a.store < b.store ? -1 : a.store > b.store ? 1 : order.get(a.mug) - order.get(b.mug)));
    const q = { s: '', store: '' }; const body = h('tbody'); const cnt2 = h('span', { class: 'sub' });
    const draw = () => { const t = q.s.toLowerCase(); const list = rows.filter((d) => (!q.store || d.store === q.store) && (!t || (d.store + ' ' + d.mug).toLowerCase().includes(t))); let last = null;
      body.replaceChildren(...list.map((d) => { const first = d.store !== last; last = d.store; return h('tr', { style: first ? 'border-top:2px solid var(--line)' : '' }, h('td', { class: 'l' }, first ? h('b', {}, d.store) : ''), h('td', { class: 'l' }, d.mug), h('td', {}, d.qty == null ? '–' : n0(d.qty)), h('td', {}, d.value == null ? '–' : n0(d.value)), h('td', {}, d.stock == null ? '–' : n0(d.stock))); })); cnt2.textContent = `${list.length} rows`; };
    draw();
    const names = [...new Set(rows.map((d) => d.store))]; const cols = [{ k: 'store', label: 'Store' }, { k: 'mug', label: 'Mug' }, { k: 'qty', label: 'Sales qty' }, { k: 'value', label: 'Sales value (SAR)' }, { k: 'stock', label: 'Stock' }];
    return h('div', { class: 'card', style: 'margin-bottom:12px' }, h('div', { class: 'tools' }, h('h3', { style: 'margin:0' }, 'Mugs by store'), h('div', { class: 'spacer' }), h('input', { type: 'search', placeholder: 'Search store or mug…', oninput: (e) => { q.s = e.target.value; draw(); } }), h('select', { class: 'sel', onchange: (e) => { q.store = e.target.value; draw(); } }, h('option', { value: '' }, 'All stores'), ...names.map((n) => h('option', { value: n }, n))), cnt2, h('button', { class: 'btn small', onclick: () => LM.csv(cols, rows, 'mugs-by-store.csv') }, 'Export CSV')),
      h('div', { class: 'tscroll', style: 'max-height:560px;overflow:auto;margin-top:8px' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', { class: 'l', rowspan: 2 }, 'Store'), h('th', { class: 'l', rowspan: 2 }, 'Mugs'), h('th', { colspan: 2, style: 'text-align:center;border-bottom:1px solid var(--line)' }, 'Sales'), h('th', { rowspan: 2 }, 'Stock')), h('tr', {}, h('th', {}, 'Qty'), h('th', {}, 'Value (SAR)'))), body)),
      h('div', { class: 'sub', style: 'margin-top:6px' }, ds ? `Sales = the sales report ${ds.start} → ${ds.end} for that mug in that store. “–” = the stock store could not be matched with certainty to a sales branch (or has no stock figure).` : 'Open a sales report to fill the Sales columns.'));
  }
  LM.mugsByStore = { card };
})();
