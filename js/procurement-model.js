/* Procurement: pending Purchase Requisitions (PR) and pending Purchase Orders (PO). Snapshot reports "as of" a date. No DOM. */
(function (root) {
  const LM = (root.LM = root.LM || {});
  const { norm } = LM;
  const TYPES = { pr: { label: 'Pending PRs', hint: 'Pending purchase requisitions (Requisition, Line, Item, Quantity …)' }, po: { label: 'Pending POs', hint: 'Purchase orders waiting approval (Order, Supplier, Ordered …)' } };
  const specFor = (type, sheet) => ({
    pr: { id: 'pr', label: 'Pending PRs', sheets: { main: { label: 'pending PR lines', names: [sheet, 'Exported'], required: true, keyCol: 'req', cols: {
      req: { label: 'Requisition', aliases: ['PR', 'PR number'], type: 'text', required: true }, line: { label: 'Line', type: 'num', required: false }, item: { label: 'Item', aliases: ['Item code'], type: 'text', required: true },
      desc: { label: 'Line Description', aliases: ['Description'], type: 'text', required: true }, requester: { label: 'Requester', type: 'text', required: false }, qty: { label: 'Quantity', aliases: ['Qty'], type: 'num', required: true },
      uom: { label: 'UOM', aliases: ['Unit'], type: 'text', required: true }, currency: { label: 'Currency', type: 'text', required: false }, location: { label: 'Deliver-to Location', aliases: ['Deliver to', 'Location'], type: 'text', required: false },
      buyer: { label: 'Buyer', type: 'text', required: false }, category: { label: 'Category Name', aliases: ['Category'], type: 'text', required: true }, created: { label: 'Creation Date', aliases: ['Created', 'Date'], type: 'date', required: true } } } } },
    po: { id: 'po', label: 'Pending POs', sheets: { main: { label: 'pending PO list', names: [sheet, 'Exported'], required: true, keyCol: 'order', cols: {
      order: { label: 'Order', aliases: ['PO', 'PO number'], type: 'text', required: true }, desc: { label: 'Description', type: 'text', required: false }, supplier: { label: 'Supplier', type: 'text', required: true },
      amount: { label: 'Ordered', aliases: ['Amount', 'Total'], type: 'num', required: true }, currency: { label: 'Currency', type: 'text', required: true }, status: { label: 'Status', type: 'text', required: true },
      created: { label: 'Creation Date', aliases: ['Created', 'Date'], type: 'date', required: true }, buyer: { label: 'Buyer', type: 'text', required: false }, req: { label: 'Requisition', aliases: ['PR'], type: 'text', required: false } } } } },
  }[type]);
  const DEFAULT_FX = { SAR: 1, USD: 3.75, AED: 1.0212 }; // SAR value of one unit; editable in the dashboard
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const asOfFromName = (n) => { const m = /(\d{1,2})[-_.](\d{1,2})[-_.](20\d\d)/.exec(n); if (m && +m[2] <= 12) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`; const k = /(20\d\d)[-_.](\d{1,2})[-_.](\d{1,2})/.exec(n); return k ? `${k[1]}-${k[2].padStart(2, '0')}-${k[3].padStart(2, '0')}` : null; };

  function detect(wb) {
    for (const n of wb.SheetNames) { const hdr = (LM.engine.rowsOf(wb, n)[0] || []).map(norm);
      if (hdr.includes('requisition') && hdr.includes('quantity') && hdr.includes('item')) return 'pr';
      if (hdr.includes('order') && hdr.includes('supplier')) return 'po'; }
    return null;
  }
  const I = (level, msg, fix) => ({ level, msg, fix });

  function analyze(wb, name, ov, template, existing, hash) {
    ov = ov || {}; template = template || {}; existing = existing || [];
    const type = ov.type || detect(wb);
    if (!type) return { type: null, ds: null, issues: [I('error', 'This file was not recognised as a pending PR or pending PO report.', { type: 'type', id: 'type', options: Object.keys(TYPES), label: 'Treat this file as' })] };
    const r = LM.engine.analyze(wb, specFor(type, wb.SheetNames[0]), ov, template); const issues = r.issues.slice();
    const rowsIn = (r.sheets.main && r.sheets.main.rows) || [];
    const asOf = (ov.asOf && ov.asOf.date) || asOfFromName(name);
    if (!asOf) issues.push(I('error', 'The report date could not be found in the file name. Enter the “as of” date.', { type: 'asOf', id: 'date', kind: 'date', label: 'Use this date' }));
    else if (!ov.asOf) issues.push(I('info', `Report date taken from the file name: ${asOf}.`));
    const L = rowsIn.map(({ _r, ...x }) => ({ ...x, _r }));
    const ds = { type, start: asOf, end: asOf, data: { rows: L.map(({ _r, ...x }) => x) } };
    const add = (l, m, f) => issues.push(I(l, m, f));
    if (L.length && asOf) {
      const future = L.filter((x) => x.created > asOf); if (future.length) add('warn', `${future.length} row(s) are dated after the report date ${asOf}.`);
      const ages = L.map((x) => days(x.created, asOf)).filter((a) => a >= 0); const old = ages.filter((a) => a > 180).length; if (old) add('info', `${old} row(s) are more than 180 days old.`);
    }
    if (type === 'pr' && L.length) {
      const seen = new Map(); L.forEach((x) => { const k = x.req + '|' + x.line; seen.set(k, (seen.get(k) || 0) + 1); }); const dup = [...seen.values()].filter((v) => v > 1).length; if (dup) add('warn', `${dup} requisition line(s) appear more than once (same PR and line number).`);
      const rep = {}; L.forEach((x) => { const k = x.req + '|' + x.item + '|' + x.qty; rep[k] = (rep[k] || 0) + 1; }); const reps = Object.entries(rep).filter(([, v]) => v > 1);
      if (reps.length) add('info', `${reps.length} requisition(s) repeat the same item and quantity on several lines (e.g. ${reps.slice(0, 2).map(([k, v]) => `${k.split('|')[0]} ×${v}`).join(', ')}). Possibly split deliveries; check they are not duplicates.`);
      const nb = L.filter((x) => !x.buyer).length; if (nb) add('info', `${nb} line(s) in ${new Set(L.filter((x) => !x.buyer).map((x) => x.req)).size} requisition(s) have no buyer assigned yet.`);
      const bad = L.filter((x) => x.qty <= 0).length; if (bad) add('warn', `${bad} line(s) have zero or negative quantity.`);
      const big = L.filter((x) => x.qty >= 1e6); if (big.length) add('warn', `Very large quantity: ${big.slice(0, 3).map((x) => `${x.req} ${x.desc} = ${x.qty.toLocaleString()} ${x.uom}`).join('; ')}. Confirm these are not typos.`);
      const um = {}; L.forEach((x) => ((um[x.item] = um[x.item] || new Set()).add(x.uom))); const mixed = Object.entries(um).filter(([, s]) => s.size > 1); if (mixed.length) add('warn', `${mixed.length} item(s) are requested in different units, so quantities cannot be added: ${mixed.slice(0, 3).map(([k, s]) => `${k} (${[...s].join('/')})`).join('; ')}.`);
      known(add, template, 'prUoms', 'unit(s) of measure', L.map((x) => x.uom)); known(add, template, 'prLocations', 'deliver-to location(s)', L.map((x) => x.location)); known(add, template, 'prBuyers', 'buyer(s)', L.map((x) => x.buyer)); known(add, template, 'prCategories', 'categor(ies)', L.map((x) => x.category));
    }
    if (type === 'po' && L.length) {
      const seen = new Set(); let dup = 0; L.forEach((x) => { if (seen.has(x.order)) dup++; seen.add(x.order); }); if (dup) add('warn', `${dup} order number(s) appear more than once.`);
      const st = [...new Set(L.map((x) => x.status))]; const other = st.filter((s) => !/pending/i.test(s)); if (other.length) add('warn', `Status other than "Pending…" found: ${other.join(', ')}. This report should only list orders waiting approval.`);
      const bad = L.filter((x) => x.amount <= 0).length; if (bad) add('warn', `${bad} order(s) have zero or negative amount.`);
      const fx = { ...DEFAULT_FX, ...(template.fx || {}), ...(ov.fx || {}) }; [...new Set(L.map((x) => x.currency))].filter((c) => fx[c] == null).forEach((c) => add('warn', `No SAR exchange rate for currency ${c}. Enter how many SAR one ${c} is worth.`, { type: 'fx', id: c, kind: 'number', label: 'Use this rate' }));
      const cur = [...new Set(L.map((x) => x.currency))].filter((c) => c !== 'SAR'); if (cur.length) add('info', `Orders in ${cur.join(', ')} are converted to SAR using the rates in the Pending POs tab (USD ${fx.USD}, AED ${fx.AED}); change them there if needed.`);
      known(add, template, 'poBuyers', 'buyer(s)', L.map((x) => x.buyer)); known(add, template, 'poCurrencies', 'currenc(ies)', L.map((x) => x.currency));
      ds.fx = Object.fromEntries([...new Set(L.map((x) => x.currency))].filter((c) => fx[c] != null).map((c) => [c, fx[c]]));
    }
    existing.filter((e) => e.type === type).forEach((e) => {
      if (e.hash === hash) add('warn', `This exact file was already uploaded (as of ${e.end}, on ${e.uploadedAt.slice(0, 10)}).`);
      else if (asOf && e.end === asOf) add('warn', `A ${TYPES[type].label} snapshot for ${asOf} already exists. Approving replaces it (the old version is kept in history).`);
      else if (asOf && e.end > asOf) add('warn', `A newer ${TYPES[type].label} snapshot (${e.end}) exists. This one is older.`);
    });
    // movement vs the latest earlier snapshot
    const prev = existing.filter((e) => e.type === type && asOf && e.end < asOf).sort((a, b) => (a.end < b.end ? 1 : -1))[0];
    if (prev && L.length) { const key = type === 'pr' ? (x) => x.req + '|' + x.line : (x) => x.order; const a = new Set(prev.data.rows.map(key)), b = new Set(ds.data.rows.map(key)); add('info', `Since ${prev.end}: ${[...b].filter((k) => !a.has(k)).length} new, ${[...a].filter((k) => !b.has(k)).length} cleared (no longer pending).`); }
    return { type, ds, issues };
  }
  function known(add, tpl, key, what, vals) { const k = tpl[key] || []; if (!k.length) return; const n = [...new Set(vals.filter(Boolean))].filter((v) => !k.includes(v)); if (n.length) add('warn', `New ${what} not seen before: ${n.slice(0, 6).join(', ')}${n.length > 6 ? ', …' : ''}.`); }
  const learn = (t, type, ds, ov) => {
    const R = ds.data.rows; const u = (k, f) => (t[k] = [...new Set([...(t[k] || []), ...R.map(f).filter(Boolean)])]);
    if (type === 'pr') { u('prUoms', (x) => x.uom); u('prLocations', (x) => x.location); u('prBuyers', (x) => x.buyer); u('prCategories', (x) => x.category); }
    else { u('poBuyers', (x) => x.buyer); u('poCurrencies', (x) => x.currency); t.fx = { ...DEFAULT_FX, ...(t.fx || {}), ...(ov.fx || {}) }; }
    return t;
  };

  /* ---------- analytics ---------- */
  const BUCKETS = [['0–7 days', 0, 7], ['8–30 days', 8, 30], ['31–90 days', 31, 90], ['91–180 days', 91, 180], ['Over 180 days', 181, 1e9]];
  const bucketOf = (age) => (BUCKETS.find((b) => age >= b[1] && age <= b[2]) || BUCKETS[0])[0];
  const group = (arr, keyf, valf) => { const m = {}; arr.forEach((x) => { const k = keyf(x) || '(none)'; const o = (m[k] = m[k] || { name: k, n: 0, value: 0 }); o.n++; o.value += valf ? valf(x) : 0; }); return Object.values(m).sort((a, b) => b.value - a.value || b.n - a.n); };

  function computePO(ds, fx) {
    const rate = (c) => (fx && fx[c] != null ? fx[c] : DEFAULT_FX[c] != null ? DEFAULT_FX[c] : null);
    const R = ds.data.rows.map((x) => ({ ...x, age: days(x.created, ds.end), sar: rate(x.currency) != null ? x.amount * rate(x.currency) : null }));
    R.forEach((x) => (x.bucket = bucketOf(x.age)));
    const total = sum(R, (x) => x.sar);
    const byCur = group(R, (x) => x.currency, (x) => x.amount);
    return { rows: R, n: R.length, total, byCur, buyers: group(R, (x) => x.buyer, (x) => x.sar), suppliers: group(R, (x) => x.supplier, (x) => x.sar), buckets: BUCKETS.map(([l]) => ({ name: l, n: R.filter((x) => x.bucket === l).length, value: sum(R.filter((x) => x.bucket === l), (x) => x.sar) })),
      oldest: [...R].sort((a, b) => b.age - a.age)[0], avgAge: R.length ? sum(R, (x) => x.age) / R.length : null, over90: R.filter((x) => x.age > 90).length, over90Value: sum(R.filter((x) => x.age > 90), (x) => x.sar) };
  }
  const top = (c) => { const s = String(c || ''); return (s.includes('.') ? s.split('.')[0] : s.split('_')[0]).replace(/_/g, ' ').trim(); };
  function computePR(ds, poReqs) {
    const R = ds.data.rows.map((x) => ({ ...x, age: days(x.created, ds.end), group: top(x.category), poPending: poReqs && poReqs.has(x.req) }));
    R.forEach((x) => (x.bucket = bucketOf(x.age)));
    const reqs = {}; R.forEach((x) => { const o = (reqs[x.req] = reqs[x.req] || { req: x.req, lines: 0, created: x.created, age: x.age, buyers: new Set(), requester: x.requester, location: x.location, groups: new Set(), poPending: x.poPending }); o.lines++; o.buyers.add(x.buyer || ''); o.groups.add(x.group); });
    const RQ = Object.values(reqs).map((o) => ({ ...o, buyer: [...o.buyers].filter(Boolean).join(', ') || '(unassigned)', unassigned: [...o.buyers].every((b) => !b), group: [...o.groups].join(', '), bucket: bucketOf(o.age) }));
    return { rows: R, reqs: RQ, n: R.length, nReq: RQ.length, unassigned: R.filter((x) => !x.buyer).length, unassignedReq: RQ.filter((x) => x.unassigned).length, over90Req: RQ.filter((x) => x.age > 90).length,
      buckets: BUCKETS.map(([l]) => ({ name: l, n: RQ.filter((x) => x.bucket === l).length })), buyers: group(R, (x) => x.buyer || '(unassigned)'), groups: group(R, (x) => x.group), categories: group(R, (x) => x.category), requesters: group(R, (x) => x.requester), locations: group(R, (x) => x.location),
      oldest: [...RQ].sort((a, b) => b.age - a.age)[0], withPO: RQ.filter((x) => x.poPending).length };
  }

  LM.procurement = { TYPES, DEFAULT_FX, analyze, learn, computePO, computePR, BUCKETS, days };
})(typeof window !== 'undefined' ? window : globalThis);
