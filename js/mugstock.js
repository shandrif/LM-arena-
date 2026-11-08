/* Mug stock in stores: the "SOH Daily Tracker – Mugs & Coffee" workbook (one sheet per supervisor, stores as columns, items as rows, a Total sheet).
   Saved as a Sales record with type "mugstock"; shown in the Sales tab ("Mugs") next to the mug sales of the sales report. */
(function () {
  const LM = window.LM; const { h, norm } = LM;
  const I = (level, msg, fix) => ({ level, msg, fix });
  const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x || 0), 0);
  const n0 = (v) => Math.round(v).toLocaleString('en-US'); const n1 = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 });
  const rowsOf = (wb, name) => window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });
  const bkey = (name) => { const m = /^B\s*0*(\d+)/i.exec(String(name).trim()); return m ? 'B' + m[1] : null; };
  const cleanName = (s) => String(s).replace(/\s+/g, ' ').trim();

  /** one key for the same product however each sheet / the sales report spells it */
  function itemKey(name) {
    let s = String(name || '').split(/[\\/]|[؀-ۿ]/)[0].toLowerCase().replace(/[–—-]/g, ' ').replace(/\((?:signuture|signature|sig)\)|\bsig(?:n|nuture|nature)?\b/g, ' ').replace(/\bmyg\b/g, 'mug').replace(/biege/g, 'beige').replace(/\s+/g, ' ').trim();
    let m;
    if (/sail/.test(s) && (m = /(blue|yellow|beige|orange)/.exec(s)) && /(20|40)\s*oz/.test(s)) return `sail ${m[1]} ${/(20|40)\s*oz/.exec(s)[1]}`;
    if (/summer/.test(s) && (m = /(blue|yellow|orange)/.exec(s))) return `summer ${m[1]} ${/cold/.test(s) ? 'cold' : 'hot'}`;
    if (/stable|hot ?& ?cold/.test(s) && (m = /(light green|ligth green|green|black|beige)/.exec(s))) return `stable ${m[1].replace('ligth', 'light')}`;
    if (/haram/.test(s) && (m = /(green|beige|black)/.exec(s))) return `haram ${m[1]}`;
    if (/cherry|^red mug/.test(s)) return 'cherry';
    if (/espresso/.test(s) && /mug/.test(s)) return 'espresso mug';
    if (!/national|fazaa|repeated|purple|pink|power|non hm/.test(s) && (m = /^(hot|cold)(?: mugs?)? (green|beige|black)$/.exec(s.replace(/ mug /, ' ')))) return `${m[1]} ${m[2]}`;
    if (!/national|fazaa|repeated|purple|pink|power|non hm/.test(s) && (m = /^(hot|cold) (?:mugs? )?(green|beige|black)$/.exec(s))) return `${m[1]} ${m[2]}`;
    return norm(s);
  }
  const isMugName = (n) => /\bmug/i.test(String(n));

  const detect = (wb) => wb.SheetNames.some((n) => { const r = rowsOf(wb, n); return r[0] && norm(r[0][0]) === 'itemsstores'; });

  function parse(wb, fileName, existing, hash, asOfHint, override) {
    const issues = []; const sheets = wb.SheetNames.filter((n) => { const r = rowsOf(wb, n); return r[0] && norm(r[0][0]) === 'itemsstores'; });
    const totalSheet = sheets.find((n) => /^total$/i.test(n.trim())); const supSheets = sheets.filter((n) => n !== totalSheet);
    if (!supSheets.length) return { ds: null, issues: [I('error', 'No supervisor sheets (Items/STORES) were found.')] };
    const stores = []; const seenRows = {}; const items = new Map(); const remarks = {}; const itemTotals = {}; let blank = 0, neg = 0;
    supSheets.forEach((sn) => {
      const rows = rowsOf(wb, sn); const H = rows[0].map((c) => (c == null ? '' : cleanName(c))); const ti = H.findIndex((x) => /^total$/i.test(x)); const rmI = H.findIndex((x) => /^remarks?$/i.test(x)); const last = ti > 0 ? ti : H.length;
      const names = []; for (let c = 1; c < last; c++) if (H[c]) names.push({ c, name: H[c] }); const seenN = new Set(); names.forEach((s) => { if (seenN.has(s.name.toLowerCase())) issues.push(I('warn', `Sheet “${sn}”: the store “${s.name}” appears twice.`)); seenN.add(s.name.toLowerCase()); });
      let block = 0; let prevBlank = false; const mine = names.map((s) => ({ name: s.name, sheet: sn, qty: {}, c: s.c }));
      rows.slice(1).forEach((r) => { const label = r[0] == null ? '' : cleanName(r[0]); if (!label) { prevBlank = true; return; } if (prevBlank) { block++; prevBlank = false; }
        const key = itemKey(label); const mug = block === 0; (seenRows[sn] = seenRows[sn] || new Set()).add(key); const o = items.get(key) || { key, name: label, mug, order: items.size }; if (!items.has(key)) items.set(key, o); else if (block === 0) o.mug = true;
        if (rmI >= 0 && r[rmI]) remarks[key] = cleanName(r[rmI]);
        let rs = 0; mine.forEach((s) => { const v = r[s.c]; if (v == null || v === '') { blank++; } else if (typeof v === 'number') { if (v < 0) neg++; s.qty[key] = (s.qty[key] || 0) + v; rs += v; } });
        if (ti > 0 && typeof r[ti] === 'number' && Math.abs(r[ti] - rs) > 0.5) issues.push(I('warn', `Sheet “${sn}”, ${label}: the stores add up to ${n0(rs)} but its Total column says ${n0(r[ti])}.`));
        itemTotals[key] = (itemTotals[key] || 0) + rs; });
      stores.push(...mine.map(({ c, ...s }) => s));
    });
    if (blank) issues.push(I('info', `${blank} empty cell(s) were counted as 0.`)); if (neg) issues.push(I('warn', `${neg} negative stock figure(s) found.`));
    if (totalSheet) { const rows = rowsOf(wb, totalSheet); const bad = [];
      rows.slice(1).forEach((r) => { if (!r[0] || typeof r[1] !== 'number') return; const k = itemKey(cleanName(r[0])); const o = items.get(k); if (o && Math.abs((itemTotals[k] || 0) - r[1]) > 0.5) bad.push(`${cleanName(r[0])} (sheets ${n0(itemTotals[k] || 0)}, Total sheet ${n0(r[1])})`); if (!o && r[1]) issues.push(I('warn', `Total sheet lists “${cleanName(r[0])}” (${n0(r[1])}) which is not in any supervisor sheet.`)); });
      if (bad.length) { const seqs = supSheets.map((sn) => rowsOf(wb, sn).slice(1, 27).map((r) => (r[0] ? itemKey(cleanName(r[0])) : '')).join('|')); const odd = supSheets.filter((sn, i) => seqs.filter((q) => q === seqs[i]).length < seqs.length / 2); issues.push(I('warn', `The file's own Total sheet does not match the supervisor sheets for ${bad.length} item(s), e.g. ${bad.slice(0, 3).join('; ')}. The dashboard adds up the supervisor sheets itself${odd.length ? `; the likely cause is that sheet “${odd.join('”, “')}” lists the items in a different order than the others while the Total sheet adds by row position` : ''}.`)); } }
    else issues.push(I('info', 'No Total sheet found, so the sheet totals could not be cross-checked.'));
    // names used by every supervisor sheet
    const allK = [...items.keys()].filter((k) => items.get(k).mug); supSheets.forEach((sn) => { const miss = allK.filter((k) => !(seenRows[sn] && seenRows[sn].has(k))); if (miss.length) issues.push(I('warn', `Sheet “${sn}” has no row for: ${miss.slice(0, 4).map((k) => items.get(k).name).join(', ')}${miss.length > 4 ? '…' : ''}.`)); });
    const dupStore = {}; stores.forEach((s) => { const k = norm(s.name); (dupStore[k] = dupStore[k] || []).push(s.sheet); }); Object.entries(dupStore).forEach(([, a]) => { if (a.length > 1) issues.push(I('info', `A store name appears in more than one sheet (${a.join(', ')}); both are kept.`)); });
    const asOf = override || asOfHint; issues.unshift(I(asOf ? 'warn' : 'error', asOf ? `The file has no date: the stock is taken as at ${asOf}. Change it if it was counted on another day.` : 'The file has no date. Enter the date of the stock count.', { type: 'asOf', id: 'date', kind: 'date', value: asOf || '', label: 'Use this date' }));
    const list = [...items.values()].sort((a, b) => a.order - b.order);
    const ds = { type: 'mugstock', start: asOf || null, end: asOf || null, sheets: supSheets, items: list.map(({ key, name, mug }) => ({ key, name: (totalSheet && nameFromTotal(wb, totalSheet, key)) || name, mug })), stores, remarks };
    (existing || []).forEach((e) => { if (e.hash === hash) issues.push(I('warn', `This exact file was already uploaded on ${e.uploadedAt.slice(0, 10)}.`)); else if (asOf && e.end === asOf) issues.push(I('warn', `A mug stock for ${asOf} already exists. Approving replaces it (the old version is kept in history).`)); });
    return { ds, issues };
  }
  function nameFromTotal(wb, sn, key) { const r = rowsOf(wb, sn).slice(1).find((x) => x[0] && itemKey(cleanName(x[0])) === key); return r ? cleanName(r[0]) : null; }

  /** match a stock-sheet store to a sales-report branch */
  const GENERIC = new Set(['mall', 'road', 'street', 'station', 'center', 'centre', 'plaza', 'jeddah', 'riyadh', 'makkah', 'madinah', 'taif', 'the', 'and']);
  const toks = (s) => String(s).toLowerCase().replace(/^b\s*\d+/, ' ').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((x) => x.length >= 3 && !GENERIC.has(x));
  function matchStore(name, branches, links) {
    const ln = links && links[norm(name)]; if (ln) { const b = branches.find((x) => x.key === ln); if (b) return { b, how: 'manual' }; }
    const k = bkey(name); if (k) { const b = branches.find((x) => x.key === k); return b ? { b, how: 'code' } : null; }
    const a = toks(name); if (!a.length) return null; let best = null, tie = false;
    branches.forEach((b) => { const t = toks(b.name); const hits = a.filter((x) => t.some((y) => (x.length === 3 || y.length === 3 ? x === y : LM.similarity(x, y) >= 0.8))).length; const sc = hits / a.length; if (hits && sc === 1) { if (!best || sc > best.sc) { best = { b, sc }; tie = false; } else if (sc === best.sc) tie = true; } });
    return best && !tie ? { b: best.b, how: 'name' } : null;
  }

  /** stock + sales per store, per item */
  function compute(stock, sales, links) {
    const mugItems = stock.items.filter((i) => i.mug); const mk = new Set(mugItems.map((i) => i.key)); const out = { stores: [], items: [], days: 0, soldAll: null };
    let branches = []; const sold = new Map(); const soldItem = new Map(); const soldSI = new Map();
    if (sales) { out.days = Math.max(1, Math.round((Date.parse(sales.end) - Date.parse(sales.start)) / 86400000) + 1); const bs = new Map();
      sales.items.filter((r) => isMugName(r.item)).forEach((r) => { const bk = LM.sales.branchKey(r.store); const o = bs.get(bk) || { key: bk, name: r.store, units: 0, sales: 0 }; o.units += r.qty || 0; o.sales += r.sales || 0; bs.set(bk, o); const ik = itemKey(r.item); { const kk = bk + '|' + ik; const q = soldSI.get(kk) || { units: 0, sales: 0 }; q.units += r.qty || 0; q.sales += r.sales || 0; soldSI.set(kk, q); } const it = soldItem.get(ik) || { units: 0, sales: 0, name: String(r.item).split(/[\\/]|[؀-ۿ]/)[0].trim() }; it.units += r.qty || 0; it.sales += r.sales || 0; soldItem.set(ik, it); });
      out.soldAll = sum([...bs.values()], (x) => x.units); branches = [...new Set(sales.items.map((r) => r.store))].map((n) => ({ key: LM.sales.branchKey(n), name: n })); branches.forEach((b) => { if (bs.has(b.key)) sold.set(b.key, bs.get(b.key)); }); }
    stock.stores.forEach((s) => { const mt = sum(mugItems, (i) => s.qty[i.key] || 0); const m = branches.length ? matchStore(s.name, branches, links) : null; const sl = m ? sold.get(m.b.key) : null; const per = sl && out.days ? sl.units / out.days : null;
      out.stores.push({ name: s.name, sheet: s.sheet, stock: mt, matched: m ? m.b.name : null, how: m ? m.how : null, matchKey: m ? m.b.key : null, units: sl ? sl.units : m ? 0 : null, sales: sl ? sl.sales : m ? 0 : null, perDay: per, cover: per ? mt / per : null, qty: s.qty, other: sum(stock.items.filter((i) => !i.mug), (i) => s.qty[i.key] || 0) }); });
    const cnt = {}; out.stores.forEach((s) => { if (s.how === 'name') cnt[s.matchKey] = (cnt[s.matchKey] || 0) + 1; }); out.stores.forEach((s) => { if (s.how === 'name' && cnt[s.matchKey] > 1) { s.matched = null; s.how = null; s.matchKey = null; s.units = null; s.sales = null; s.perDay = null; s.cover = null; } }); // two stock stores matching one branch by name: not trusted
    // store x mug rows: stock + what was sold
    out.detail = []; const usedBranch = new Set();
    out.stores.forEach((s) => { if (s.matchKey) usedBranch.add(s.matchKey); mugItems.forEach((i) => { const stk = s.qty[i.key] || 0; const sd = s.matchKey ? soldSI.get(s.matchKey + '|' + i.key) : null; if (!stk && !(sd && (sd.units || sd.sales))) return; out.detail.push({ store: s.matched || s.name, stockName: s.name, mug: i.name, order: i.order, qty: s.matched ? (sd ? sd.units : 0) : null, value: s.matched ? (sd ? sd.sales : 0) : null, stock: stk }); }); });
    if (sales) branches.forEach((b) => { if (usedBranch.has(b.key)) return; mugItems.forEach((i) => { const sd = soldSI.get(b.key + '|' + i.key); if (sd && (sd.units || sd.sales)) out.detail.push({ store: b.name, stockName: null, mug: i.name, order: i.order, qty: sd.units, value: sd.sales, stock: null }); }); });
    mugItems.forEach((i, ix) => { i.order = ix; }); const ordOf = new Map(mugItems.map((i, ix) => [i.name, ix])); out.detail.forEach((d) => { d.order = ordOf.get(d.mug); }); out.detail.sort((a, b) => (a.store < b.store ? -1 : a.store > b.store ? 1 : a.order - b.order));
    mugItems.forEach((i) => { const st = sum(stock.stores, (s) => s.qty[i.key] || 0); const sd = soldItem.get(i.key); const per = sd && out.days ? sd.units / out.days : null; out.items.push({ key: i.key, name: i.name, stock: st, units: sd ? sd.units : null, sales: sd ? sd.sales : null, cover: per ? st / per : null, storesWith: stock.stores.filter((s) => (s.qty[i.key] || 0) > 0).length }); });
    out.otherItems = stock.items.filter((i) => !i.mug).map((i) => ({ key: i.key, name: i.name, stock: sum(stock.stores, (s) => s.qty[i.key] || 0), storesWith: stock.stores.filter((s) => (s.qty[i.key] || 0) > 0).length, remark: stock.remarks[i.key] || '' }));
    const unsoldKeys = [...soldItem.keys()].filter((k) => !mk.has(k)); out.unmatchedSales = unsoldKeys.map((k) => ({ ...soldItem.get(k) })).sort((a, b) => b.units - a.units);
    return out;
  }

  function view(stock, sales, links, onLink, onDelete) {
    const c = compute(stock, sales, links); const pill = (t, cls, st) => h('span', { class: 'pill ' + (cls || ''), style: st }, t);
    const card = (t, ...k) => h('div', { class: 'card', style: 'margin-bottom:12px' }, t ? h('h3', {}, t) : null, ...k); const kpi = (l, v, d) => h('div', { class: 'card kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
    const total = sum(c.stores, (s) => s.stock); const sold = sales ? c.soldAll : null; const withCover = c.stores.filter((s) => s.cover != null); const low = withCover.filter((s) => s.cover < 14);
    const el = h('div', {}, h('div', { class: 'sub', style: 'margin-bottom:8px' }, `Mug stock as at ${stock.end} · ${stock.fileName} · ${stock.stores.length} stores in ${stock.sheets.length} sheets${sales ? ` · mug sales from the sales report ${sales.start} → ${sales.end} (${c.days} days)` : ' · upload the sales report to see mug sales and days of cover'}`),
      h('div', { class: 'grid kpis' }, kpi('Mug stock in stores', n0(total), 'units'), sales ? kpi('Mugs sold (all branches)', n0(sold || 0), `${sales.start} → ${sales.end}`) : null, sales ? kpi('Avg days of cover', withCover.length ? n1(sum(withCover, (s) => s.stock) / Math.max(1e-9, sum(withCover, (s) => s.perDay))) : '–', 'stock ÷ average daily mug sales') : null, sales ? kpi('Stores under 14 days', low.length, `of ${withCover.length} with sales`) : null, kpi('Stores with no mugs', c.stores.filter((s) => s.stock <= 0).length, `of ${c.stores.length}`)));
    // layout asked for: Store | Mug | Sales (Qty, Value) | Stock
    const q = { s: '', store: '' }; const body = h('tbody'); const cnt = h('span', { class: 'sub' });
    const stNames = [...new Set(c.detail.map((d) => d.store))];
    const drawD = () => { const t = q.s.toLowerCase(); const rows = c.detail.filter((d) => (!q.store || d.store === q.store) && (!t || (d.store + ' ' + d.mug).toLowerCase().includes(t))); let last = null;
      body.replaceChildren(...rows.map((d) => { const first = d.store !== last; last = d.store; return h('tr', { style: first ? 'border-top:2px solid var(--line)' : '' }, h('td', { class: 'l' }, first ? h('b', {}, d.store) : ''), h('td', { class: 'l' }, d.mug), h('td', {}, d.qty == null ? '–' : n0(d.qty)), h('td', {}, d.value == null ? '–' : n0(d.value)), h('td', {}, d.stock == null ? '–' : n0(d.stock))); })); cnt.textContent = `${rows.length} rows`; };
    const search = h('input', { type: 'search', placeholder: 'Search store or mug…', oninput: (e) => { q.s = e.target.value; drawD(); } }); const storeSel = h('select', { class: 'sel', onchange: (e) => { q.store = e.target.value; drawD(); } }, h('option', { value: '' }, 'All stores'), ...stNames.map((n) => h('option', { value: n }, n)));
    const dcols = [{ k: 'store', label: 'Store' }, { k: 'mug', label: 'Mug' }, { k: 'qty', label: 'Sales qty' }, { k: 'value', label: 'Sales value (SAR)' }, { k: 'stock', label: 'Stock' }];
    drawD();
    el.append(card('Mugs by store', h('div', { class: 'tools' }, search, storeSel, cnt, h('div', { class: 'spacer' }), h('button', { class: 'btn small', onclick: () => LM.csv(dcols, c.detail, `mugs-by-store-${stock.end}.csv`) }, 'Export CSV')),
      h('div', { class: 'tscroll', style: 'max-height:560px;overflow:auto' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', { class: 'l', rowspan: 2 }, 'Store'), h('th', { class: 'l', rowspan: 2 }, 'Mugs'), h('th', { colspan: 2, style: 'text-align:center;border-bottom:1px solid var(--line)' }, 'Sales'), h('th', { rowspan: 2 }, 'Stock')), h('tr', {}, h('th', {}, 'Qty'), h('th', {}, 'Value (SAR)'))), body)),
      h('div', { class: 'sub', style: 'margin-top:6px' }, sales ? `Sales = what the sales report ${sales.start} → ${sales.end} shows for that mug in that store. “–” = the store could not be matched to a sales branch (or has no stock row).` : 'Upload the sales report to fill the Sales columns.')));
    const cols = [{ k: 'name', label: 'Store (stock sheet)', l: 1, cls: 'wrap' }, { k: 'sheet', label: 'Sheet', l: 1 }, { k: 'stock', label: 'Mug stock', fmt: n0 },
      ...(sales ? [{ k: 'matched', label: 'Sales branch', l: 1, cls: 'wrap', fmt: (v, r) => { const sel = h('select', { class: 'sel', style: 'max-width:220px', onchange: (e) => onLink(r.name, e.target.value) }, h('option', { value: '' }, v ? `${v}${r.how === 'manual' ? '' : ' (auto)'}` : 'Not matched – choose…'), ...[...new Map(sales.items.map((x) => [LM.sales.branchKey(x.store), x.store])).entries()].sort((a, b) => (a[1] < b[1] ? -1 : 1)).map(([k, n]) => h('option', { value: k, selected: k === r.matchKey && r.how === 'manual' }, n))); return LM.viewOnly ? v || '–' : sel; } },
        { k: 'units', label: 'Mugs sold', fmt: (v) => (v == null ? '–' : n0(v)) }, { k: 'sales', label: 'Mug sales (SAR)', fmt: (v) => (v == null ? '–' : n0(v)) }, { k: 'perDay', label: 'Per day', fmt: (v) => (v == null ? '–' : n1(v)) },
        { k: 'cover', label: 'Days of cover', fmt: (v, r) => (v == null ? (r.units === 0 ? pill('no sales', '') : '–') : pill(n1(v) + ' d', v < 7 ? 'closed' : v < 14 ? '' : 'new', v >= 7 && v < 14 ? 'background:var(--warn-bg);color:var(--warn)' : '')) }] : [])];
    el.append(card('Mug stock by store', h('div', { class: 'tscroll' }, LM.table(cols, c.stores.slice().sort((a, b) => (sales ? (a.cover == null) - (b.cover == null) || a.cover - b.cover || b.stock - a.stock : b.stock - a.stock)), { sort: null })), h('div', { class: 'sub', style: 'margin-top:6px' }, sales ? 'Days of cover = mug stock ÷ mugs sold per day in the sales report period. Under 7 days is red, under 14 amber. “(auto)” = matched by name: choose another branch if it is wrong.' : ''), h('button', { class: 'btn small', style: 'margin-top:8px', onclick: () => { const mi = stock.items; const cc = [{ k: 'name', label: 'Store' }, { k: 'sheet', label: 'Sheet' }, ...mi.map((i) => ({ k: 'q_' + i.key, label: i.name }))]; LM.csv(cc, c.stores.map((s) => ({ ...s, ...Object.fromEntries(mi.map((i) => ['q_' + i.key, s.qty[i.key] || 0])) })), `mug-stock-${stock.end}.csv`); } }, 'Export all stock (CSV)')));
    el.append(card('By mug', h('div', { class: 'tscroll' }, LM.table([{ k: 'name', label: 'Mug', l: 1 }, { k: 'stock', label: 'Stock in stores', fmt: n0 }, { k: 'storesWith', label: 'Stores with stock', fmt: n0 }, ...(sales ? [{ k: 'units', label: 'Sold', fmt: (v) => (v == null ? '–' : n0(v)) }, { k: 'sales', label: 'Sales (SAR)', fmt: (v) => (v == null ? '–' : n0(v)) }, { k: 'cover', label: 'Days of cover', fmt: (v) => (v == null ? '–' : n1(v)) }] : [])], c.items, { sort: 'stock' })), sales && c.unmatchedSales.length ? h('div', { class: 'sub', style: 'margin-top:6px' }, `Sold but not in the stock file: ${c.unmatchedSales.slice(0, 6).map((x) => `${x.name} (${n0(x.units)})`).join('; ')}${c.unmatchedSales.length > 6 ? '…' : ''}.`) : null));
    // store x mug matrix
    const mi = stock.items.filter((i) => i.mug); const mx = Math.max(1, ...c.stores.flatMap((s) => mi.map((i) => s.qty[i.key] || 0)));
    const thead = h('thead', {}, h('tr', {}, h('th', { class: 'l' }, 'Store'), ...mi.map((i) => h('th', { title: i.name, style: 'font-size:11px;white-space:normal;min-width:62px' }, i.name.replace(/^AL /i, '').replace(/ mug/i, ''))), h('th', {}, 'Total')));
    const tbody = h('tbody', {}, ...c.stores.map((s) => h('tr', {}, h('td', { class: 'l' }, s.name), ...mi.map((i) => { const v = s.qty[i.key] || 0; return v ? h('td', { style: `background:color-mix(in srgb, var(--accent) ${Math.round(Math.min(1, v / mx) * 70)}%, transparent)` }, n0(v)) : h('td', { class: 'z' }, '0'); }), h('td', {}, h('b', {}, n0(s.stock))))));
    el.append(card('Stock by store and mug', h('div', { class: 'tscroll' }, h('table', { class: 't heat' }, thead, tbody)), h('div', { class: 'sub', style: 'margin-top:6px' }, 'Darker = more stock; tan = none.')));
    if (c.otherItems.length) el.append(card('Cups, beans, cards and other stock (all stores)', LM.table([{ k: 'name', label: 'Item', l: 1 }, { k: 'stock', label: 'Stock in stores', fmt: n0 }, { k: 'storesWith', label: 'Stores with stock', fmt: n0 }, { k: 'remark', label: 'Remark', l: 1 }], c.otherItems, { sort: null })));
    if (onDelete) el.append(h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn small danger', onclick: onDelete }, 'Delete this stock file')));
    return el;
  }
  LM.mugstock = { detect, parse, compute, view, itemKey };
})();
