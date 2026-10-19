/* Wastage department: expected file layout, checks and maths. No DOM. */
(function (root) {
  const LM = (root.LM = root.LM || {});
  const { norm } = LM;

  const spec = {
    id: 'wastage', label: 'Wastage',
    sheets: {
      waste: { label: 'write-off lines', names: ['Products statement', 'Product statement', 'Write-offs', 'Waste'], required: true, keyCol: 'item',
        cols: {
          code: { label: 'Code', aliases: ['Item code', 'SKU'], type: 'text', required: false },
          item: { label: 'Stock list', aliases: ['Item', 'Product', 'Item name'], type: 'text', required: true },
          uom: { label: 'U/M', aliases: ['UOM', 'Unit', 'Unit of measure'], type: 'text', required: false },
          qty: { label: 'Quantity in meas. units', aliases: ['Quantity', 'Qty'], type: 'num', required: true },
          price: { label: 'Unit Pr', aliases: ['Unit price', 'Price'], type: 'num', required: false },
          value: { label: 'Wastage Value', aliases: ['Value', 'Waste value', 'Amount'], type: 'num', required: true },
          date: { label: 'Document date', aliases: ['Date'], type: 'date', required: true },
          docType: { label: 'Document type', aliases: ['Type'], type: 'text', required: false },
          storage: { label: 'Write-off storage', aliases: ['Storage', 'Warehouse'], type: 'text', required: true },
          category: { label: 'Category', aliases: ['Item category'], type: 'text', required: true },
        } },
      stores: { label: 'store summary (branch ↔ storage map and net sales)', names: ['Sheet2', 'Store summary', 'Stores'], required: false, missingLevel: 'info', keyCol: 'store',
        ignoreCols: ['Mix Waste %', 'P&S Waste %', 'Calibration Waste %', 'Stores Operations Waste %', 'Waste %', 'Items'],
        cols: {
          store: { label: 'Store', aliases: ['Branch'], type: 'text', required: true },
          storage: { label: 'Write-off storage', aliases: ['Store', 'Storage'], type: 'text', required: true },
          net: { label: 'Net Sales', aliases: ['Sales'], type: 'num', required: false },
          wasteValue: { label: 'Waste Value', aliases: ['Wastage Value'], type: 'num', required: false },
        } },
    },
  };
  const IGNORED_SHEETS = ['sheet1']; // pivot of item totals; recomputed from the raw lines

  const branchKey = (name) => { const m = /^(?:HM\s+)?B\s*0*(\d+)/i.exec(String(name).trim()); return m ? 'B' + m[1] : norm(name); };
  const inferKey = (storage) => { const m = /\bB\s*0*(\d+)\b/i.exec(storage); return m ? 'B' + m[1] : null; };
  const addDays = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const defaultTemplate = () => ({ dept: 'wastage', version: 1, storageMap: {}, branchNames: {}, knownCategories: [], knownUoms: [], colAliases: {}, sheetNames: {} });

  /** storage -> {key,name,how}; how: 'file' | 'saved' | 'manual' | 'inferred' | null */
  function resolver(template, fileMap, manual) {
    return (storage) => {
      const hit = (m, how) => (m[storage] ? { key: branchKey(m[storage]), name: m[storage], how } : null);
      const r = hit(manual || {}, 'manual') || hit(fileMap, 'file') || hit(template.storageMap || {}, 'saved');
      if (r) return r;
      const k = inferKey(storage); if (k) return { key: k, name: (template.branchNames || {})[k] || k, how: 'inferred' };
      return { key: 'U:' + storage, name: storage + ' (unmapped)', how: null };
    };
  }

  function build(parsed, template, ov) {
    const lines = (parsed.waste ? parsed.waste.rows : []).map((r) => ({ code: r.code || '', item: r.item, uom: r.uom || '', qty: r.qty, price: r.price, value: r.value, date: r.date, storage: r.storage, category: r.category, docType: r.docType || '' }));
    const fileMap = {}, fileNet = {};
    ((parsed.stores && parsed.stores.rows) || []).forEach((r) => { fileMap[r.storage] = r.store; if (r.net != null) fileNet[branchKey(r.store)] = (fileNet[branchKey(r.store)] || 0) + r.net; });
    const days = lines.map((l) => l.date).sort();
    const fileTotal = parsed.stores && parsed.stores.rows.some((r) => r.wasteValue != null) ? sum(parsed.stores.rows, (r) => r.wasteValue) : null;
    return { lines, fileMap, fileNet, fileTotal, manualMap: (ov && ov.storage) || {}, start: days[0] || null, end: days[days.length - 1] || null };
  }

  function checks(parsed, ds, template, ov, rf, existing, wb) {
    const issues = []; const add = (level, msg, fix) => issues.push({ level, msg, fix });
    const L = ds.lines; if (!L.length) return issues;
    // sheets we deliberately ignore
    if (rf && rf.wb) { const ign = rf.wb.SheetNames.filter((n) => IGNORED_SHEETS.includes(norm(n))); if (ign.length) add('info', `Sheet(s) ${ign.map((n) => `"${n}"`).join(', ')} ignored: item totals are recalculated from the write-off lines.`); }
    // period
    const span = daysBetween(ds.start, ds.end) + 1;
    const present = new Set(L.map((l) => l.date)); const miss = [];
    for (let i = 0; i < span; i++) { const d = addDays(ds.start, i); if (!present.has(d)) miss.push(d); }
    if (miss.length) add('warn', `No write-offs on ${miss.length} day(s) in the period: ${miss.join(', ')}.`);
    if (span !== 7) add('warn', `Period is ${span} days (${ds.start} to ${ds.end}), not a standard 7-day week.`);
    // values
    const badVal = L.filter((l) => l.value < 0).length; if (badVal) add('warn', `${badVal} line(s) have negative wastage value.`);
    const zero = L.filter((l) => l.value === 0 || l.qty === 0).length; if (zero) add('info', `${zero} line(s) have zero quantity or value.`);
    const calc = L.filter((l) => l.price != null && Math.abs(l.qty * l.price - l.value) > 0.05 + Math.abs(l.value) * 0.01);
    if (calc.length) add('warn', `${calc.length} line(s) where quantity × unit price does not equal wastage value (e.g. ${calc.slice(0, 2).map((l) => `${l.item}: ${l.qty} × ${l.price} ≠ ${l.value}`).join('; ')}).`);
    const big = [...L].sort((a, b) => b.value - a.value).filter((l) => l.value > 3000).slice(0, 3);
    if (big.length) add('warn', `Unusually large single write-off(s): ${big.map((l) => `${l.item} ${Math.round(l.value).toLocaleString()} SAR at ${l.storage}`).join('; ')}.`);
    // duplicates
    const seen = new Map(); let dups = 0; L.forEach((l) => { const k = [l.code, l.item, l.qty, l.value, l.date, l.storage].join('|'); if (seen.has(k)) dups++; seen.set(k, 1); });
    if (dups) add('info', `${dups} line(s) repeat an earlier one exactly (same item, quantity, value, day and storage). This can be genuine; check it is not a double export.`);
    // document types
    const types = [...new Set(L.map((l) => l.docType).filter(Boolean))]; if (types.length > 1) add('warn', `Several document types present: ${types.join(', ')}. Only "Write-off record" is normally expected.`);
    const odd = types.filter((t) => !/write-?off/i.test(t)); if (odd.length === 1 && types.length === 1) add('warn', `Document type is "${odd[0]}", not a write-off record.`);
    // categories & units vs history
    const cats = [...new Set(L.map((l) => l.category))]; const known = template.knownCategories || [];
    if (known.length) { const nc = cats.filter((c) => !known.includes(c)); if (nc.length) add('warn', `New waste categor${nc.length > 1 ? 'ies' : 'y'} not seen before: ${nc.join(', ')}.`); const gone = known.filter((c) => !cats.includes(c)); if (gone.length) add('info', `Category(ies) missing this period: ${gone.join(', ')}.`); }
    else add('info', `Categories found: ${cats.join(', ')}.`);
    const uoms = [...new Set(L.map((l) => l.uom).filter(Boolean))]; const ku = template.knownUoms || [];
    if (ku.length) { const nu = uoms.filter((u) => !ku.includes(u)); if (nu.length) add('warn', `New unit(s) of measure: ${nu.join(', ')}.`); }
    // storages
    const res = resolver(template, ds.fileMap, ds.manualMap);
    const storages = [...new Set(L.map((l) => l.storage))];
    const branchOpts = [...new Set([...Object.values(ds.fileMap), ...Object.values(template.storageMap || {}), ...Object.values(template.branchNames || {})])].sort();
    const unmapped = storages.filter((s) => !res(s).how);
    unmapped.slice(0, 8).forEach((s) => add('warn', `Storage "${s}" is not linked to a branch, so its waste cannot be matched to net sales.`, { type: 'storage', id: s, options: branchOpts, label: 'Link to branch' }));
    if (unmapped.length > 8) add('warn', `${unmapped.length - 8} more storage(s) are not linked to a branch (link the ones above first, or include the store-summary sheet that maps storages to branches).`);
    const inferred = storages.filter((s) => res(s).how === 'inferred'); if (inferred.length) add('info', `${inferred.length} storage(s) linked to a branch by the B-number in their name: ${inferred.slice(0, 4).join('; ')}${inferred.length > 4 ? '; …' : ''}.`);
    if (!parsed.stores || !(parsed.stores.rows || []).length) add('info', 'No store-summary sheet in this file: branch links and net sales come from earlier uploads and the Sales tab.');
    // net sales availability
    const cmp = parsed.stores && parsed.stores.rows ? sum(parsed.stores.rows, (r) => r.value) : 0; void cmp;
    // totals vs file's own summaries
    if (rf && rf.wb) {
      const total = sum(L, (l) => l.value);
      const s2 = ds.fileTotal; if (s2 != null && Math.abs(s2 - total) > Math.max(1, total * 0.005)) add('warn', `Store summary waste total (${Math.round(s2).toLocaleString()}) differs from the write-off lines total (${Math.round(total).toLocaleString()}).`);
    }
    issues.push(...LM.periodChecks(ds, existing, rf && rf.hash));
    return issues;
  }

  /** salesNet: {byBranch:{key:net}, covered:n, days:n} from Sales tab; prev: previous-period dataset's summary or null */
  function compute(ds, template, salesNet, prev) {
    const res = resolver(template, ds.fileMap, ds.manualMap);
    const cats = [...new Set(ds.lines.map((l) => l.category))].sort();
    const B = {}, D = {}, C = {}, I = {};
    ds.lines.forEach((l) => {
      const r = res(l.storage);
      const b = (B[r.key] = B[r.key] || { key: r.key, name: r.name, value: 0, byCat: {}, lines: 0 });
      b.value += l.value; b.byCat[l.category] = (b.byCat[l.category] || 0) + l.value; b.lines++;
      if (r.how && /^B\d/.test(r.name) === false && b.name === r.key) b.name = r.name;
      const d = (D[l.date] = D[l.date] || { day: l.date, value: 0, byCat: {} }); d.value += l.value; d.byCat[l.category] = (d.byCat[l.category] || 0) + l.value;
      const c = (C[l.category] = C[l.category] || { name: l.category, value: 0, lines: 0 }); c.value += l.value; c.lines++;
      const ik = l.code || l.item; const it = (I[ik] = I[ik] || { name: l.item, code: l.code, category: l.category, uom: l.uom, qty: 0, value: 0, branches: new Set(), lines: 0 });
      it.qty += l.qty; it.value += l.value; it.branches.add(r.key); it.lines++;
    });
    const total = sum(Object.values(B), (b) => b.value);
    const branches = Object.values(B);
    branches.forEach((b) => {
      const fromSales = salesNet && salesNet.byBranch[b.key] != null ? salesNet.byBranch[b.key] : null;
      b.net = fromSales != null ? fromSales : ds.fileNet[b.key] != null ? ds.fileNet[b.key] : null;
      b.netSource = fromSales != null ? 'Sales tab' : ds.fileNet[b.key] != null ? 'File' : null;
      b.pct = b.net ? b.value / b.net : null;
      cats.forEach((c) => (b['cat_' + c] = b.net ? (b.byCat[c] || 0) / b.net : null));
    });
    const netTotal = sum(branches.filter((b) => b.net != null), (b) => b.net);
    const withNet = branches.filter((b) => b.net != null);
    const netPct = netTotal ? sum(withNet, (b) => b.value) / netTotal : null;
    branches.forEach((b) => (b.vsNet = netPct && b.pct != null ? b.pct / netPct : null));
    branches.sort((a, b) => (b.pct == null) - (a.pct == null) || (b.pct || 0) - (a.pct || 0) || b.value - a.value);
    const catArr = Object.values(C).sort((a, b) => b.value - a.value);
    catArr.forEach((c) => { c.share = total ? c.value / total : 0; c.pct = netTotal ? sum(withNet, (b) => b.byCat[c.name]) / netTotal : null; });
    const items = Object.values(I).sort((a, b) => b.value - a.value); let cum = 0;
    items.forEach((i) => { i.share = total ? i.value / total : 0; cum += i.share; i.cum = cum; i.nBranches = i.branches.size; i.avgPrice = i.qty ? i.value / i.qty : null; });
    const days = Object.values(D).sort((a, b) => (a.day < b.day ? -1 : 1));
    return { total, lines: ds.lines.length, branches, cats, catArr, items, days, netTotal, netPct, avgDay: days.length ? total / days.length : null,
      netSources: { sales: withNet.filter((b) => b.netSource === 'Sales tab').length, file: withNet.filter((b) => b.netSource === 'File').length, none: branches.length - withNet.length },
      prev: prev ? { total: prev.total, netPct: prev.netPct, start: prev.start, end: prev.end } : null };
  }

  /** Net sales per branch for [start,end] from stored Sales datasets (later uploads win per day). */
  function salesNetFor(salesSets, start, end) {
    const byDay = {};
    [...salesSets].sort((a, b) => (a.uploadedAt < b.uploadedAt ? -1 : 1)).forEach((s) => {
      const cut = s.ty.filter((r) => r.day >= start && r.day <= end); const seenDays = new Set(cut.map((r) => r.day));
      seenDays.forEach((d) => (byDay[d] = {})); cut.forEach((r) => { const k = LM.sales.branchKey(r.store); byDay[r.day][k] = (byDay[r.day][k] || 0) + r.sales; });
    });
    const byBranch = {}; Object.values(byDay).forEach((m) => Object.entries(m).forEach(([k, v]) => (byBranch[k] = (byBranch[k] || 0) + v)));
    const need = daysBetween(start, end) + 1;
    return { byBranch, covered: Object.keys(byDay).length, days: need };
  }

  LM.wastage = { spec, defaultTemplate, build, checks, compute, salesNetFor, branchKey, addDays, resolver };
})(typeof window !== 'undefined' ? window : globalThis);
