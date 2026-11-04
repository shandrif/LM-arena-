/* Shipment: inbound shipment tracker (one row per shipment / bill of lading). No DOM.
   Columns: Supplier, Items, Terms, CNTR, BL, ETD, ETA, POD, Remarks (+ optional Category). Status is worked out from remarks, ETD, ETA and the as-of date. */
(function (root) {
  const LM = (root.LM = root.LM || {});
  const { norm, clean } = LM;
  const I = (level, msg, fix) => ({ level, msg, fix });
  const txt = (v) => (v == null ? '' : clean(v));
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const addDays = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const serial = (v) => (typeof v === 'number' && v > 30000 && v < 70000 ? LM.parseDay(v) : null);
  const dateOf = (v) => serial(v) || (typeof v === 'string' && v.trim() ? LM.parseDay(v.trim()) : null);
  const CATS = ['Packaging', 'Food', 'Merchandise', 'Others'];
  const COLS = { supplier: ['supplier', 'vendor'], items: ['items', 'item', 'description'], terms: ['terms', 'incoterm'], cntr: ['cntr', 'container', 'containers', 'cntrs'], bl: ['bl', 'b/l', 'billoflading', 'blno'], etd: ['etd'], eta: ['eta'], pod: ['pod', 'portofdischarge', 'port'], remarks: ['remarks', 'remark', 'status', 'notes'], category: ['category'] };
  const REQUIRED = ['supplier', 'items', 'bl', 'etd', 'eta', 'pod'];
  const category = (items, supplier) => { const t = `${items} ${supplier}`.toLowerCase();
    if (/\b(mug|mugs|stanley|merch|tumbler|cherry)\b/.test(t)) return 'Merchandise';
    if (/cup|napkin|bag|bottle|box|packag|tin can|sachet|aseptic|filter|lid|straw|carton|wrap/.test(t) && !/coffee beans/.test(t)) return 'Packaging';
    if (/coffee|bean|matcha|chocolate|corn flake|cheese|tea|sugar|milk|syrup|premix|flour|cocoa|food/.test(t)) return 'Food';
    return 'Others'; };

  /* remark -> { stage, note, date } ; stage is the part of the status the remark decides */
  function readRemark(v, asOf) {
    const d = serial(v); if (d) return { stage: null, note: '', date: d, raw: d };
    const t = txt(v); if (!t) return { stage: null, note: '', date: null, raw: '' };
    let stage = null;
    if (/^delivered/i.test(t)) stage = 'delivered';
    else if (/bayan|customs|not discharge/i.test(t)) stage = 'customs';
    else if (/not manifest/i.test(t)) stage = 'notmanifested';
    else if (/for delivery|pull ?out|pulled out|yard|terminal|awaiting delivery|delivery instructions|arranging (the )?delivery|waiting for the green light/i.test(t)) stage = 'arrived';
    else if (/^manifested/i.test(t)) stage = 'manifested';
    const dm = /^(\d{1,2})\/(\d{1,2})\/(20\d\d)\b/.exec(t); const date = dm ? `${dm[3]}-${String(dm[1]).padStart(2, '0')}-${String(dm[2]).padStart(2, '0')}` : null;
    const delayText = /delay|red sea|djibouti/i.test(t);
    return { stage, note: t, date, delayText, raw: t };
  }
  function statusOf(x, asOf) {
    const r = x.remark; if (r.stage === 'delivered') return 'Delivered';
    if (r.stage === 'customs') return 'Customs hold';
    if (r.stage === 'arrived') return 'Arrived, awaiting delivery';
    if (r.delayText || (x.eta && x.eta < asOf)) return 'Delayed';
    if (r.stage === 'notmanifested') return 'Not manifested';
    if (r.stage === 'manifested') return 'Manifested, in transit';
    if (x.etd && x.etd > asOf) return 'Not departed yet';
    return 'In transit';
  }
  const ACTIVE = (x) => x.status !== 'Delivered';

  function find(wb) { for (const sn of wb.SheetNames) { const g = LM.engine.rowsOf(wb, sn); for (let r = 0; r < Math.min(10, g.length); r++) { const h = (g[r] || []).map((v) => norm(v)); const hit = (k) => h.findIndex((v) => COLS[k].some((a) => v === norm(a))); if (hit('supplier') >= 0 && hit('etd') >= 0 && hit('eta') >= 0 && (hit('bl') >= 0 || hit('pod') >= 0)) return { sn, g, hr: r, hit }; } } return null; }
  const detect = (wb) => !!find(wb);

  function analyze(rf, existing, template, ov) {
    ov = ov || {}; existing = existing || []; template = template || {}; const issues = []; const f = find(rf.wb);
    if (!f) return { ds: null, issues: [I('error', 'This does not look like the shipment tracker (no sheet with Supplier, ETD, ETA and BL / POD columns).')] };
    const { g, hr, sn, hit } = f; const col = {}; Object.keys(COLS).forEach((k) => { col[k] = hit(k); });
    REQUIRED.forEach((k) => { if (col[k] < 0) issues.push(I('error', `Column “${COLS[k][0].toUpperCase()}” was not found. Expected: Supplier, Items, Terms, CNTR, BL, ETD, ETA, POD, Remarks.`)); });
    if (issues.some((i) => i.level === 'error')) return { ds: null, issues };
    if (col.remarks < 0) issues.push(I('warn', 'No “Remarks” column: statuses can only be worked out from dates.'));
    if (col.cntr < 0) issues.push(I('warn', 'No “CNTR” (containers) column: container counts are not available.'));
    const known = Object.values(col).filter((i) => i >= 0); const extra = (g[hr] || []).map((v, i) => [txt(v), i]).filter(([t, i]) => t && !known.includes(i)); if (extra.length) issues.push(I('info', `Extra column(s) not used: ${extra.map((e) => e[0]).join(', ')}.`));
    // as-of date: the file has none
    const asOf = ov.asOf && ov.asOf.date ? ov.asOf.date : null;
    if (!asOf) issues.push({ level: 'error', msg: 'The file has no report date. Enter the date these shipment statuses are as of (it decides what counts as delayed).', fix: { type: 'asOf', id: 'date', kind: 'date', label: 'Use this date', value: new Date().toISOString().slice(0, 10) } });
    const rows = []; let blanks = 0;
    for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const cell = (k) => (col[k] >= 0 ? x[col[k]] : null);
      if (![cell('supplier'), cell('items'), cell('bl')].some((v) => txt(v))) { if (x.some((v) => txt(v))) blanks++; continue; }
      const cn = cell('cntr'); const etdRaw = cell('etd'), etaRaw = cell('eta');
      rows.push({ row: r + 1, supplier: txt(cell('supplier')), items: txt(cell('items')), terms: txt(cell('terms')).toUpperCase(), cntr: typeof cn === 'number' ? cn : null, cntrRaw: typeof cn === 'string' ? txt(cn) : '', bl: txt(cell('bl')), etd: dateOf(etdRaw), eta: dateOf(etaRaw), etdBad: txt(etdRaw) && !dateOf(etdRaw), etaBad: txt(etaRaw) && !dateOf(etaRaw), pod: txt(cell('pod')).toUpperCase(), remarkRaw: cell('remarks'), catGiven: txt(cell('category')) }); }
    if (!rows.length) return { ds: null, issues: [I('error', 'No shipment rows were found.')] };
    const ref = asOf || new Date().toISOString().slice(0, 10);
    rows.forEach((x) => { x.remark = readRemark(x.remarkRaw, ref); x.remarkText = x.remark.note; x.remarkDate = x.remark.date; x.category = CATS.find((c) => c.toLowerCase() === x.catGiven.toLowerCase()) || category(x.items, x.supplier); x.catDerived = !CATS.some((c) => c.toLowerCase() === x.catGiven.toLowerCase()); x.status = statusOf(x, ref); delete x.remarkRaw; });
    rows.forEach((x) => { x.remark = { stage: x.remark.stage }; });
    // ---- checks ----
    if (blanks) issues.push(I('info', `${blanks} row(s) without supplier, items and BL were ignored.`));
    if (col.category < 0) issues.push(I('warn', `The template asks for a “Category” column (Packaging, Food, Merchandise, Others) but the file has none. Categories were worked out from the item names: ${CATS.map((c) => `${c} ${rows.filter((x) => x.category === c).length}`).join(', ')}. Add the column to the file to control them.`));
    else { const bad = rows.filter((x) => x.catDerived); if (bad.length) issues.push(I('warn', `${bad.length} row(s) have a category that is not Packaging / Food / Merchandise / Others (${[...new Set(bad.map((x) => x.catGiven || '(empty)'))].join(', ')}); worked out from the item names instead.`)); }
    const badD = rows.filter((x) => x.etdBad || x.etaBad); if (badD.length) issues.push(I('warn', `${badD.length} row(s) with an ETD/ETA that is not a date: ${badD.slice(0, 4).map((x) => `row ${x.row}`).join(', ')}.`));
    const noEtd = rows.filter((x) => !x.etd && !x.etdBad); if (noEtd.length) issues.push(I('warn', `${noEtd.length} shipment(s) have no ETD: ${noEtd.slice(0, 4).map((x) => `${x.supplier} (row ${x.row})`).join(', ')}.`));
    const noEta = rows.filter((x) => !x.eta && !x.etaBad && x.status !== 'Delivered'); if (noEta.length) issues.push(I('warn', `${noEta.length} shipment(s) that are not delivered have no ETA: ${noEta.slice(0, 5).map((x) => `${x.supplier} / ${x.bl} (row ${x.row})`).join('; ')}.`));
    const rev = rows.filter((x) => x.etd && x.eta && x.eta < x.etd); if (rev.length) issues.push(I('warn', `ETA is before ETD for ${rev.map((x) => `${x.supplier} / ${x.bl} (row ${x.row})`).slice(0, 4).join('; ')}.`));
    const sea = rows.filter((x) => x.etd && x.eta && x.eta >= x.etd).map((x) => days(x.etd, x.eta)); const odd = rows.filter((x) => x.etd && x.eta && x.eta >= x.etd && (days(x.etd, x.eta) > 120 || days(x.etd, x.eta) < 3)); if (odd.length) issues.push(I('warn', `Unusual transit time (under 3 or over 120 days): ${odd.slice(0, 4).map((x) => `${x.supplier} / ${x.bl} ${days(x.etd, x.eta)} days (row ${x.row})`).join('; ')}.`)); void sea;
    const blk = {}; rows.forEach((x) => { const k = norm(x.bl); if (k) (blk[k] = blk[k] || []).push(x); }); const dups = Object.values(blk).filter((a) => a.length > 1); if (dups.length) issues.push(I('warn', `BL number used more than once: ${dups.slice(0, 4).map((a) => `${a[0].bl} (rows ${a.map((x) => x.row).join(', ')})`).join('; ')}.`));
    const noBl = rows.filter((x) => !x.bl); if (noBl.length) issues.push(I('warn', `${noBl.length} shipment(s) have no BL number.`));
    const nonNum = rows.filter((x) => col.cntr >= 0 && x.cntr == null && !/^LCL/i.test(x.cntrRaw)); if (nonNum.length) issues.push(I('warn', `${nonNum.length} row(s) with a container count that is not a number or LCL: ${nonNum.slice(0, 4).map((x) => `row ${x.row} “${x.cntrRaw || 'empty'}”`).join(', ')}.`));
    const lcl = rows.filter((x) => x.cntrRaw && /LCL/i.test(x.cntrRaw)).length; if (lcl) issues.push(I('info', `${lcl} shipment(s) are LCL (part container); they are not counted in the container totals.`));
    const delOld = rows.filter((x) => x.status === 'Delivered' && x.eta && x.eta < addDays(ref, -45)); if (delOld.length) issues.push(I('info', `${delOld.length} delivered shipment(s) have been listed for more than 45 days after their ETA; they can be removed from the file.`));
    if (asOf) { const late = rows.filter((x) => x.status === 'Delivered' && x.eta && x.eta > addDays(ref, 14)); if (late.length) issues.push(I('warn', `Marked DELIVERED but ETA is more than 2 weeks in the future: ${late.slice(0, 4).map((x) => `${x.supplier} / ${x.bl} (ETA ${x.eta})`).join('; ')}.`)); }
    const fut = rows.filter((x) => x.remarkDate && x.remarkDate > ref && x.remark.stage !== 'delivered' && /^\d/.test(x.remarkText)); if (fut.length) issues.push(I('info', `${fut.length} remark(s) start with a date later than the as-of date (${[...new Set(fut.map((x) => x.remarkDate))].slice(0, 3).join(', ')}).`));
    const nd = rows.filter((x) => !x.remarkText && x.remarkDate); if (nd.length) issues.push(I('info', `${nd.length} remark(s) contain only a date (e.g. ${nd[0].remarkDate}, row ${nd[0].row}). It is shown as “Date in remarks”; its meaning (revised ETA? pull-out date?) is not defined in the template.`));
    const terms = new Set(rows.map((x) => x.terms).filter(Boolean)); const knownT = template.knownTerms || []; if (knownT.length) { const nt = [...terms].filter((t) => !knownT.includes(t)); if (nt.length) issues.push(I('warn', `New shipping term(s): ${nt.join(', ')}.`)); }
    const pods = new Set(rows.map((x) => x.pod).filter(Boolean)); const knownP = template.knownPods || []; if (knownP.length) { const np = [...pods].filter((t) => !knownP.includes(t)); if (np.length) issues.push(I('warn', `New port(s) of discharge: ${np.join(', ')}.`)); }
    const sups = {}; rows.forEach((x) => { const k = norm(x.supplier); (sups[k] = sups[k] || new Set()).add(x.supplier); }); Object.values(sups).filter((s) => s.size > 1).forEach((s) => issues.push(I('info', `Supplier spelled differently: ${[...s].map((x) => `“${x}”`).join(', ')}.`)));
    // vs previous upload
    const prev = asOf ? [...existing].sort((a, b) => (a.end < b.end ? 1 : -1)).find((e) => e.end < asOf) : null;
    if (prev) { const key = (x) => norm(x.bl) || norm(x.supplier + x.items); const a = new Map(prev.data.rows.map((x) => [key(x), x])), b = new Map(rows.map((x) => [key(x), x]));
      const added = rows.filter((x) => !a.has(key(x))), gone = prev.data.rows.filter((x) => !b.has(key(x)) && x.status !== 'Delivered'), slipped = rows.filter((x) => a.has(key(x)) && x.eta && a.get(key(x)).eta && days(a.get(key(x)).eta, x.eta) > 0);
      if (added.length) issues.push(I('info', `${added.length} new shipment(s) since ${prev.end}.`));
      if (gone.length) issues.push(I('warn', `${gone.length} shipment(s) that were not delivered on ${prev.end} are missing now: ${gone.slice(0, 4).map((x) => `${x.supplier} / ${x.bl}`).join('; ')}.`));
      if (slipped.length) issues.push(I('warn', `ETA moved later for ${slipped.length} shipment(s): ${slipped.slice(0, 4).map((x) => `${x.supplier} / ${x.bl} +${days(a.get(key(x)).eta, x.eta)} days`).join('; ')}.`)); }
    existing.forEach((e) => { if (e.hash === rf.hash) issues.push(I('warn', `This exact file was already uploaded (${e.end}).`)); else if (asOf && e.end === asOf) issues.push(I('warn', `A shipment list for ${asOf} already exists. Approving replaces it (the old version is kept in history).`)); else if (asOf && e.end > asOf) issues.push(I('warn', `A newer shipment list (${e.end}) already exists.`)); });
    return { ds: asOf ? { type: 'shipment', start: asOf, end: asOf, data: { rows, sheet: sn, hasCategory: col.category >= 0 } } : null, issues };
  }

  function compute(ds) {
    const R = ds.data.rows, asOf = ds.end; const act = R.filter(ACTIVE);
    const by = (list, f, v) => { const m = {}; list.forEach((x) => { const k = f(x) || '(none)'; const o = (m[k] = m[k] || { name: k, n: 0, cntr: 0 }); o.n++; o.cntr += v ? v(x) || 0 : 0; }); return Object.values(m).sort((a, b) => b.n - a.n); };
    const cn = (x) => x.cntr || 0;
    const ORDER = ['Delayed', 'Customs hold', 'Arrived, awaiting delivery', 'Not manifested', 'Manifested, in transit', 'In transit', 'Not departed yet', 'Delivered'];
    const byStatus = ORDER.map((s) => ({ name: s, n: R.filter((x) => x.status === s).length, cntr: sum(R.filter((x) => x.status === s), cn) })).filter((x) => x.n);
    const upcoming = act.filter((x) => x.eta && x.eta >= asOf).sort((a, b) => (a.eta < b.eta ? -1 : 1));
    const overdue = act.filter((x) => x.status === 'Delayed' || x.status === 'Customs hold' || x.status === 'Arrived, awaiting delivery').map((x) => ({ ...x, lateDays: x.eta && x.eta < asOf ? days(x.eta, asOf) : 0 })).sort((a, b) => b.lateDays - a.lateDays);
    const wk = {}; act.filter((x) => x.eta).forEach((x) => { const d = new Date(x.eta + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); const k = d.toISOString().slice(0, 10); const o = (wk[k] = wk[k] || { week: k, n: 0, cntr: 0 }); o.n++; o.cntr += cn(x); });
    const transit = R.filter((x) => x.etd && x.eta && x.eta >= x.etd).map((x) => days(x.etd, x.eta));
    return { n: R.length, delivered: R.length - act.length, active: act, byStatus, byCategory: by(act, (x) => x.category, cn), bySupplier: by(act, (x) => x.supplier, cn), byPod: by(act, (x) => x.pod, cn), byTerms: by(act, (x) => x.terms, cn), upcoming, overdue, weeks: Object.values(wk).sort((a, b) => (a.week < b.week ? -1 : 1)), cntrActive: sum(act, cn), within: (d) => upcoming.filter((x) => days(asOf, x.eta) <= d), avgTransit: transit.length ? sum(transit, (x) => x) / transit.length : null, noEta: act.filter((x) => !x.eta) };
  }
  LM.shipment = { detect, analyze, compute, CATS };
})(typeof window !== 'undefined' ? window : globalThis);
