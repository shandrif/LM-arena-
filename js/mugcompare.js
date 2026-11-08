/* Warehouse > Mugs: stock in the stores (weekly SOH tracker) next to stock in the warehouses (warehouse report), mug by mug.
   The two files name the mugs differently, so each store mug is linked to a warehouse line. Clear matches are made automatically,
   likely matches are pre-selected and marked “suggested”, and every link can be changed; changes are remembered. Nothing is hidden:
   warehouse lines that are not linked to any store mug are listed underneath. */
(function () {
  const LM = window.LM; const { h } = LM; const n0 = (v) => Math.round(v).toLocaleString('en-US');
  const COL = { orange: 'peach', peach: 'peach', blue: 'blue', yellow: 'yellow', beige: 'beige', black: 'black', green: 'green' };
  const lc = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
  /** warehouse line for a store mug: { item, how } how = 'auto' (clear) | 'suggested' (likely) | null */
  function suggest(mug, items) {
    const s = lc(mug); const find = (re) => items.find((i) => re.test(lc(i.name)));
    let m;
    if ((m = /^(hot|cold) mug . (\w+)$/.exec(s))) { const i = find(new RegExp(`^${m[1]} mug ${m[2]}$`)); return i ? { item: i, how: 'auto' } : null; }
    if (/cherry/.test(s)) { const i = find(/cherry/); return i ? { item: i, how: 'auto' } : null; }
    if (/espresso/.test(s)) { const i = find(/^espresso mug/); return i ? { item: i, how: 'auto' } : null; }
    if ((m = /^alsail mug (\w+) (20|40)oz$/.exec(s))) { const c = COL[m[1]]; const i = find(new RegExp(`(^|\\b)${c}\\b.*${m[2]}oz|${m[2]}oz mug ${c}|stanley mug . ${c} ${m[2]}oz`)); return i ? { item: i, how: 'suggested' } : null; }
    if ((m = /^summer (hot|cold) (\w+) mug$/.exec(s))) { const c = COL[m[2]]; const i = m[1] === 'cold' ? find(new RegExp(`^${c} cold$`)) : find(new RegExp(`^${c} hot (and|&) cold`)); return i ? { item: i, how: 'suggested' } : null; }
    return null;
  }
  /** st = mugstock dataset | null; wh = warehouse data.mugs; links = { storeMug: warehouseItemName | '' } */
  function card(st, wh, links, onLink) {
    const box = (...k) => h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Mugs: stock in stores vs stock in warehouses'), ...k);
    if (!wh) return null;
    if (!st) return box(h('div', { class: 'sub' }, 'No mug stock file from the stores for this week yet. Upload the weekly SOH tracker in Sales → Mugs to compare it with the warehouse.'));
    const V = LM.mugstock.view(st); const items = wh.items; const W = wh.warehouses; const byName = new Map(items.map((i) => [i.name, i]));
    const storeQty = (m) => V.stores.reduce((t, s) => t + (s.mug[m] || 0), 0);
    const used = new Map(); const rows = V.mugs.map((m) => {
      const manual = links && Object.prototype.hasOwnProperty.call(links, m.name); let item = null, how = null;
      if (manual) { item = links[m.name] ? byName.get(links[m.name]) || null : null; how = item ? 'manual' : 'none'; } else { const sg = suggest(m.name, items); if (sg) { item = sg.item; how = sg.how; } }
      if (item) used.set(item.name, (used.get(item.name) || 0) + 1);
      return { mug: m.name, stores: storeQty(m.name), item, how, wh: item ? item.total || 0 : null };
    });
    const dup = (r) => r.item && used.get(r.item.name) > 1;
    const linkedWh = rows.reduce((t, r) => t + (r.item && !dup(r) ? r.wh : r.item ? 0 : 0), 0);
    const seen = new Set(); let whLinkedTotal = 0; rows.forEach((r) => { if (r.item && !seen.has(r.item.name)) { seen.add(r.item.name); whLinkedTotal += r.item.total || 0; } }); void linkedWh;
    const unlinked = items.filter((i) => !used.has(i.name));
    const sel = (r) => { const s = h('select', { class: 'sel', style: 'max-width:230px', disabled: !!LM.viewOnly, onchange: (e) => onLink(r.mug, e.target.value) }, h('option', { value: '' }, '— no warehouse line —'), ...items.map((i) => h('option', { value: i.name, selected: r.item && i.name === r.item.name }, i.name.trim()))); return s; };
    const tag = (r) => (r.how === 'suggested' ? h('span', { class: 'pill', style: 'background:var(--warn-bg);color:var(--warn)', title: 'Likely match: check it and change it if wrong' }, 'suggested') : r.how === 'auto' ? h('span', { class: 'sub' }, 'auto') : r.how === 'manual' ? h('span', { class: 'sub' }, 'chosen') : h('span', { class: 'sub' }, 'not linked'));
    const th = (t, c) => h('th', { class: c || '', style: 'white-space:normal' }, t);
    const head = h('thead', {}, h('tr', {}, th('Mug', 'l'), h('th', { colspan: 1, style: 'text-align:center;border-left:2px solid var(--line)' }, 'In stores'), h('th', { colspan: W.length + 1, style: 'text-align:center;border-left:2px solid var(--line);border-bottom:1px solid var(--line)' }, 'In warehouses'), th('Total'), th('Warehouse line (link)', 'l')), h('tr', {}, h('th', {}), h('th', { style: 'border-left:2px solid var(--line)' }, 'Stock'), ...W.map((w, i) => h('th', { style: i === 0 ? 'border-left:2px solid var(--line);white-space:normal' : 'white-space:normal' }, w)), h('th', {}, 'All WH'), h('th', {}), h('th', {})));
    const body = h('tbody', {}, ...rows.map((r) => h('tr', {}, h('td', { class: 'l' }, r.mug), h('td', { style: 'border-left:2px solid var(--line)' }, n0(r.stores)), ...W.map((w, i) => h('td', { style: i === 0 ? 'border-left:2px solid var(--line)' : '' }, r.item ? n0(r.item.qty[i] || 0) : '–')), h('td', {}, r.item ? h('b', {}, n0(r.wh)) : '–'), h('td', {}, r.item ? h('b', {}, n0(r.stores + r.wh)) : n0(r.stores)), h('td', { class: 'l' }, sel(r), ' ', tag(r), dup(r) ? h('div', { class: 'sub', style: 'color:var(--bad)' }, 'same warehouse line as another mug: counted once in the totals') : null))));
    const storeTotal = rows.reduce((t, r) => t + r.stores, 0);
    const foot = h('tfoot', {}, h('tr', { style: 'font-weight:700' }, h('td', { class: 'l' }, 'All mugs'), h('td', { style: 'border-left:2px solid var(--line)' }, n0(storeTotal)), ...W.map((w, i) => h('td', { style: i === 0 ? 'border-left:2px solid var(--line)' : '' }, n0(items.reduce((t, x) => t + (x.qty[i] || 0), 0)))), h('td', {}, n0(items.reduce((t, x) => t + (x.total || 0), 0))), h('td', {}, n0(storeTotal + items.reduce((t, x) => t + (x.total || 0), 0))), h('td', {})));
    const chartRows = rows.filter((r) => r.item).sort((a, b) => b.stores + b.wh - (a.stores + a.wh)).slice(0, 12); const cbox = h('div', { class: 'chart', style: 'height:300px' });
    setTimeout(() => { if (chartRows.length) LM.chart(cbox, { type: 'bar', data: { labels: chartRows.map((r) => r.mug), datasets: [{ label: 'In stores', data: chartRows.map((r) => r.stores), backgroundColor: LM.css('--accent') }, { label: 'In warehouses', data: chartRows.map((r) => r.wh), backgroundColor: '#c2851f' }] }, options: { plugins: { legend: { position: 'bottom' } } } }); });
    return box(h('div', { class: 'sub', style: 'margin-bottom:8px' }, `Stores: SOH tracker ${st.fileName}${st.end ? ' (' + st.end + ')' : ''} · Warehouses: Mug SOH${wh.date ? ' as of ' + wh.date : ''}. “suggested” links are likely matches (e.g. Alsail Orange = Stanley Peach): check them once and they are remembered.`),
      h('div', { class: 'grid kpis' }, h('div', { class: 'card kpi' }, h('div', { class: 'l' }, 'Mugs in stores'), h('div', { class: 'v' }, n0(storeTotal)), h('div', { class: 'd' }, `${V.stores.length} stores`)), h('div', { class: 'card kpi' }, h('div', { class: 'l' }, 'Mugs in warehouses'), h('div', { class: 'v' }, n0(items.reduce((t, x) => t + (x.total || 0), 0))), h('div', { class: 'd' }, `${W.length} warehouses`)), h('div', { class: 'card kpi' }, h('div', { class: 'l' }, 'Linked mugs: stores | warehouse'), h('div', { class: 'v' }, `${n0(rows.filter((r) => r.item).reduce((t, r) => t + r.stores, 0))} | ${n0(whLinkedTotal)}`), h('div', { class: 'd' }, `${rows.filter((r) => r.item).length} of ${rows.length} store mugs linked`))),
      cbox, h('div', { class: 'tscroll', style: 'margin-top:10px;overflow:auto' }, h('table', { class: 't' }, head, body, foot)),
      unlinked.length ? h('div', { style: 'margin-top:12px' }, h('b', {}, 'Warehouse lines not linked to a store mug'), h('div', { class: 'sub' }, 'These are in the warehouse total above but have no store mug to compare with.'), h('table', { class: 't', style: 'margin-top:6px' }, h('thead', {}, h('tr', {}, h('th', { class: 'l' }, 'Warehouse line'), ...W.map((w) => h('th', { style: 'white-space:normal' }, w)), h('th', {}, 'Total'))), h('tbody', {}, ...unlinked.filter((i) => i.total).map((i) => h('tr', {}, h('td', { class: 'l' }, i.name.trim()), ...W.map((w, k) => h('td', {}, n0(i.qty[k] || 0))), h('td', {}, h('b', {}, n0(i.total || 0)))))))) : null);
  }
  LM.mugCompare = { card, suggest };
})();
