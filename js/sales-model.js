/* Sales department: expected file layout, extra checks and all the maths. No DOM. */
(function (root) {
  const LM = (root.LM = root.LM || {});
  const { norm, similarity } = LM;

  const spec = {
    id: 'sales', label: 'Sales',
    sheets: {
      ty: { label: 'this-year daily sales', names: ['Data TY', 'Data 2026', 'TY'], required: true, keyCol: 'day',
        cols: {
          day: { label: 'Day', aliases: ['Date'], type: 'date', required: true },
          store: { label: 'Store', aliases: ['Branch', 'Store name', 'Branch name'], type: 'text', required: true },
          sales: { label: 'Net sales', aliases: ['Sales', 'Net amount'], type: 'num', required: true },
          bills: { label: 'Bills', aliases: ['Transactions', 'Tickets', 'Receipts', 'Invoices'], type: 'num', required: true },
        } },
      ly: { label: 'last-year daily sales', names: ['Data LY', 'Data 2025', 'LY'], required: false, keyCol: 'day',
        cols: {
          day: { label: 'Day', aliases: ['Date'], type: 'date', required: true },
          store: { label: 'Store', aliases: ['Branch', 'Store name', 'Branch name'], type: 'text', required: true },
          sales: { label: 'Net sales', aliases: ['Sales', 'Net amount'], type: 'num', required: true },
          bills: { label: 'Bills', aliases: ['Transactions', 'Tickets', 'Receipts', 'Invoices'], type: 'num', required: true },
        } },
      items: { label: 'item group sales', names: ['Data Items', 'Data Item Group Sales', 'Items'], required: false, keyCol: 'store',
        cols: {
          store: { label: 'Store', aliases: ['Branch', 'Store name'], type: 'text', required: true },
          orderType: { label: 'Order type', aliases: ['Type'], type: 'text', required: false },
          group: { label: 'Item group', aliases: ['Group', 'Category'], type: 'text', required: true },
          item: { label: 'Item', aliases: ['Item name', 'Product'], type: 'text', required: true },
          qty: { label: 'Qty', aliases: ['Quantity'], type: 'num', required: true },
          sales: { label: 'Net sales', aliases: ['Sales', 'Net amount'], type: 'num', required: true },
        } },
    },
  };

  /* Known duplicate spellings (from the report's Notes sheet). User-confirmed merges are added to the template. */
  const SEED_ALIASES = {
    'Cold Drinks/ المشروبات الباردة': ['Cold Drinks/المشروبات الباردة'],
    'Desserts/حلى': ['Dessert/حلى'],
    'RETAIL/بيع بالتجزئة': ['Retail/بيع بالتجزئة'],
    'Sandwiches/ساندويتشات': ['Sandwich/ساندويتشات'],
    'Salad/ سلطة': ['Salad/سلطة'],
  };
  const EXCLUDED = /(^|\s)(B05|B11)(\s|$|,|-)|almarai|event/i; // exclusion list stated in the report notes

  const defaultTemplate = () => ({ dept: 'sales', version: 1, aliases: {}, groupAliases: {}, knownGroups: [], knownStores: [], colAliases: {}, sheetNames: {} });

  const branchKey = (name) => { const m = /^B\s*0*(\d+)/i.exec(name); return m ? 'B' + m[1] : norm(name); };
  const dayOfWeek = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const addYears = (d, n) => `${+d.slice(0, 4) + n}${d.slice(4)}`;
  const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

  function groupCanonicalizer(template) {
    const map = {};
    const add = (canon, alts) => { map[norm(canon)] = canon; alts.forEach((a) => (map[norm(a)] = canon)); };
    Object.entries(SEED_ALIASES).forEach(([c, a]) => add(c, a));
    (template.knownGroups || []).forEach((g) => { if (!map[norm(g)]) map[norm(g)] = g; });
    Object.entries(template.groupAliases || {}).forEach(([alt, canon]) => (map[norm(alt)] = canon));
    return (g) => map[norm(g)] || g;
  }

  /** Turns analysed rows into the dataset we store. */
  function build(parsed, template, overrides) {
    const canon = groupCanonicalizer({ ...template, groupAliases: { ...(template.groupAliases || {}), ...((overrides && overrides.groupAliases) || {}) } });
    const ty = (parsed.ty ? parsed.ty.rows : []).map((r) => ({ day: r.day, store: r.store, sales: r.sales, bills: r.bills }));
    const ly = (parsed.ly ? parsed.ly.rows : []).map((r) => ({ day: r.day, store: r.store, sales: r.sales, bills: r.bills }));
    const items = (parsed.items ? parsed.items.rows : []).map((r) => ({ store: r.store, group: canon(r.group), item: r.item, qty: r.qty, sales: r.sales }));
    const days = ty.map((r) => r.day).sort();
    return { ty, ly, items, start: days[0] || null, end: days[days.length - 1] || null };
  }

  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);

  /** Extra, Sales-specific checks on top of the generic ones. */
  function checks(parsed, ds, template, existing, fileHash, summaryTiles) {
    const issues = [];
    const add = (level, msg, fix) => issues.push({ level, code: 'sales', msg, fix });
    if (!ds.ty.length) return issues;

    // ---- period ----
    const dayList = [...new Set(ds.ty.map((r) => r.day))].sort();
    const span = daysBetween(ds.start, ds.end) + 1;
    const missing = [];
    for (let i = 0; i < span; i++) { const d = new Date(Date.parse(ds.start) + i * 86400000).toISOString().slice(0, 10); if (!dayList.includes(d)) missing.push(d); }
    if (missing.length) add('warn', `${missing.length} day(s) have no sales rows between ${ds.start} and ${ds.end}: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ', …' : ''}.`);
    if (span !== 7) add('info', `Period is ${span} days (${ds.start} to ${ds.end}), not a standard 7-day week. It will be stored as its own period.`);

    // ---- last year alignment ----
    if (ds.ly.length) {
      const lyDays = ds.ly.map((r) => r.day).sort();
      const expS = addYears(ds.start, -1), expE = addYears(ds.end, -1);
      if (lyDays[0] !== expS || lyDays[lyDays.length - 1] !== expE)
        add('warn', `Last-year data covers ${lyDays[0]} to ${lyDays[lyDays.length - 1]}, but the same calendar dates last year would be ${expS} to ${expE}.`);
    } else if (parsed.ly && parsed.ly.rows) add('warn', 'Last-year sheet is present but has no rows: no year-on-year figures can be shown.');

    // ---- duplicates / negatives / outliers ----
    const seen = new Map(); let dups = 0;
    ds.ty.forEach((r) => { const k = r.day + '|' + branchKey(r.store); if (seen.has(k)) dups++; seen.set(k, 1); });
    if (dups) add('warn', `${dups} duplicate Day + Store row(s) in the this-year sheet. Values will be added together; confirm this is not a double export.`);
    const neg = ds.ty.filter((r) => r.sales < 0).length;
    if (neg) add('warn', `${neg} this-year row(s) have negative net sales.`);
    const dayTot = {}; ds.ty.forEach((r) => (dayTot[r.day] = (dayTot[r.day] || 0) + r.sales));
    const vals = Object.values(dayTot).sort((a, b) => a - b); const med = vals[Math.floor(vals.length / 2)];
    const odd = Object.entries(dayTot).filter(([, v]) => med > 0 && (v > med * 2.5 || v < med * 0.4));
    if (odd.length && vals.length > 3) add('warn', `Unusual daily total(s) vs the period median (${Math.round(med).toLocaleString()}): ${odd.map(([d, v]) => `${d} = ${Math.round(v).toLocaleString()}`).slice(0, 4).join('; ')}.`);
    const zeroBills = ds.ty.filter((r) => r.sales > 0 && !(r.bills > 0)).length;
    if (zeroBills) add('warn', `${zeroBills} row(s) have sales but zero bills, so average check cannot be calculated for them.`);

    // ---- excluded branches ----
    const ex = [...new Set([...ds.ty, ...ds.ly, ...ds.items].map((r) => r.store).filter((s) => EXCLUDED.test(s)))];
    if (ex.length) add('warn', `Branch(es) that the report notes say should be excluded are present: ${ex.slice(0, 5).join(' | ')}.`);

    // ---- stores vs previous knowledge ----
    const stores = [...new Set(ds.ty.map((r) => branchKey(r.store)))];
    if (template.knownStores && template.knownStores.length) {
      const fresh = stores.filter((s) => !template.knownStores.includes(s));
      if (fresh.length) add('info', `${fresh.length} branch(es) not seen in earlier uploads: ${fresh.slice(0, 8).join(', ')}${fresh.length > 8 ? ', …' : ''}.`);
    }
    // ---- items vs daily ----
    if (ds.items.length) {
      const itemStores = new Set(ds.items.map((r) => branchKey(r.store)));
      const noItems = stores.filter((s) => !itemStores.has(s));
      if (noItems.length) add('info', `${noItems.length} branch(es) in the daily sheet have no item sales: ${noItems.slice(0, 6).join(', ')}${noItems.length > 6 ? ', …' : ''}.`);
      const a = sum(ds.items, (r) => r.sales), b = sum(ds.ty, (r) => r.sales);
      if (b && Math.abs(a - b) / b > 0.03)
        add('warn', `Item sales total (${Math.round(a).toLocaleString()}) differs from daily net sales total (${Math.round(b).toLocaleString()}) by ${(((a - b) / b) * 100).toFixed(1)}%.`);
      // item-group spellings
      const known = new Set(template.knownGroups || []);
      const groups = [...new Set(ds.items.map((r) => r.group))];
      const fresh = groups.filter((g) => known.size && !known.has(g));
      fresh.forEach((g) => {
        const near = [...known].map((k) => [k, similarity(k, g)]).sort((x, y) => y[1] - x[1])[0];
        if (near && near[1] >= 0.8) add('warn', `Item group "${g}" is new but looks like "${near[0]}". It may be a duplicate spelling.`, { type: 'alias', alt: g, canon: near[0], label: `Merge into "${near[0]}"` });
        else add('info', `New item group: "${g}".`);
      });
    }

    // ---- cross-check against the sheet's own summary tiles ----
    if (summaryTiles) {
      const net = sum(ds.ty, (r) => r.sales);
      if (summaryTiles.netSales != null && Math.abs(net - summaryTiles.netSales) > Math.max(1, net * 0.001))
        add('warn', `Summary sheet says net sales are ${Math.round(summaryTiles.netSales).toLocaleString()} but the data sheet adds up to ${Math.round(net).toLocaleString()}.`);
    }

    // ---- already uploaded? ----
    (existing || []).forEach((e) => {
      if (e.hash === fileHash) add('warn', `This exact file was already uploaded (${e.start} to ${e.end}, on ${e.uploadedAt.slice(0, 10)}).`);
      else if (e.start === ds.start && e.end === ds.end) add('warn', `A report for ${ds.start} to ${ds.end} already exists. Approving will replace it (the old version is kept in history).`);
      else if (e.start <= ds.end && ds.start <= e.end) add('warn', `This period overlaps an existing report (${e.start} to ${e.end}). Both will be kept; totals are never combined across reports.`);
    });
    return issues;
  }

  /** Reads the "NET SALES" tile of the Summary sheet if the file has one. */
  function readSummaryTiles(wb) {
    const name = wb.SheetNames.find((n) => norm(n) === 'summary');
    if (!name) return null;
    const ws = wb.Sheets[name];
    for (const addr of Object.keys(ws)) {
      if (addr[0] === '!') continue;
      if (typeof ws[addr].v === 'string' && ws[addr].v.trim().toUpperCase() === 'NET SALES') {
        const m = /^([A-Z]+)(\d+)$/.exec(addr);
        const below = ws[m[1] + (+m[2] + 1)];
        if (below && typeof below.v === 'number') return { netSales: below.v };
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ analytics */
  function compute(ds) {
    const branchNames = {};
    const B = {}; // key -> {name, sales, bills, lySales, lyBills, days:{}}
    const get = (store) => {
      const k = branchKey(store);
      if (!B[k]) B[k] = { key: k, name: store, sales: 0, bills: 0, lySales: 0, lyBills: 0, days: {}, lyDayMap: {} };
      return B[k];
    };
    const D = {};
    ds.ty.forEach((r) => {
      const b = get(r.store); b.name = r.store; b.sales += r.sales; b.bills += r.bills || 0; b.days[r.day] = (b.days[r.day] || 0) + r.sales;
      const d = (D[r.day] = D[r.day] || { day: r.day, sales: 0, bills: 0 }); d.sales += r.sales; d.bills += r.bills || 0;
    });
    const LD = {};
    ds.ly.forEach((r) => {
      const b = get(r.store); b.lySales += r.sales; b.lyBills += r.bills || 0; b.lyDayMap[r.day] = (b.lyDayMap[r.day] || 0) + r.sales;
      const d = (LD[r.day] = LD[r.day] || { day: r.day, sales: 0, bills: 0 }); d.sales += r.sales; d.bills += r.bills || 0;
    });
    const branches = Object.values(B);
    const total = sum(branches, (b) => b.sales);
    branches.forEach((b) => {
      b.avg = b.bills ? b.sales / b.bills : null;
      b.share = total ? b.sales / total : 0;
      b.yoy = b.lySales > 0 && b.sales > 0 ? b.sales / b.lySales - 1 : null;
      b.trafficYoy = b.lyBills > 0 && b.sales > 0 ? b.bills / b.lyBills - 1 : null;
      b.lyAvg = b.lyBills ? b.lySales / b.lyBills : null; b.avgYoy = b.lyAvg && b.avg ? b.avg / b.lyAvg - 1 : null;
      b.status = b.sales > 0 && b.lySales > 0 ? 'Trading both years' : b.sales > 0 ? (ds.ly.length ? 'New this year' : 'Trading') : b.lySales > 0 ? 'No sales this year' : 'No sales';
    });
    branches.sort((a, b) => b.sales - a.sales);
    branches.forEach((b, i) => (b.rank = b.sales > 0 ? i + 1 : null));

    const trading = branches.filter((b) => b.sales > 0);
    const lfl = trading.filter((b) => b.lySales > 0);
    const lySalesTot = sum(branches, (b) => b.lySales), lyBillsTot = sum(branches, (b) => b.lyBills);
    const bills = sum(branches, (b) => b.bills);
    const lflSales = sum(lfl, (b) => b.sales), lflLy = sum(lfl, (b) => b.lySales);
    const lflBills = sum(lfl, (b) => b.bills), lflLyBills = sum(lfl, (b) => b.lyBills);

    const days = Object.values(D).sort((a, b) => (a.day < b.day ? -1 : 1));
    const lyDays = Object.values(LD).sort((a, b) => (a.day < b.day ? -1 : 1));
    days.forEach((d) => {
      d.avg = d.bills ? d.sales / d.bills : null;
      d.dow = DOW[dayOfWeek(d.day)];
      const ly = LD[addYears(d.day, -1)];
      d.ly = ly || null;
      d.yoy = ly && ly.sales ? d.sales / ly.sales - 1 : null;
      d.trafficYoy = ly && ly.bills ? d.bills / ly.bills - 1 : null;
      d.lyAvg = ly && ly.bills ? ly.sales / ly.bills : null; d.avgYoy = d.lyAvg && d.avg ? d.avg / d.lyAvg - 1 : null;
    });

    // item groups / items
    const G = {}, I = {};
    ds.items.forEach((r) => {
      const g = (G[r.group] = G[r.group] || { name: r.group, sales: 0, qty: 0 }); g.sales += r.sales; g.qty += r.qty || 0;
      const i = (I[r.item] = I[r.item] || { name: r.item, group: r.group, sales: 0, qty: 0 }); i.sales += r.sales; i.qty += r.qty || 0;
    });
    const rank = (o) => {
      const arr = Object.values(o).sort((a, b) => b.sales - a.sales);
      const t = sum(arr, (x) => x.sales); let c = 0;
      arr.forEach((x) => { x.share = t ? x.sales / t : 0; c += x.share; x.cum = c; });
      return { arr, total: t };
    };
    const groups = rank(G), itemsR = rank(I);

    const k = {
      sales: total, lySales: lySalesTot, yoy: lySalesTot ? total / lySalesTot - 1 : null,
      bills, lyBills: lyBillsTot, avg: bills ? total / bills : null,
      branches: trading.length, lyBranches: branches.filter((b) => b.lySales > 0).length,
      lflSales: lflLy ? lflSales / lflLy - 1 : null, lflTraffic: lflLyBills ? lflBills / lflLyBills - 1 : null,
      lflCount: lfl.length, newBranches: trading.filter((b) => b.status === 'New this year'),
      newSales: sum(trading.filter((b) => b.status === 'New this year'), (b) => b.sales),
      noSales: branches.filter((b) => b.status === 'No sales this year').map((b) => b.name),
      hasLy: ds.ly.length > 0,
      lyAvg: lyBillsTot ? lySalesTot / lyBillsTot : null,
    };
    k.avgYoy = k.lyAvg && k.avg ? k.avg / k.lyAvg - 1 : null; k.billsYoy = lyBillsTot ? bills / lyBillsTot - 1 : null;
    // same-date comparison (only days that have a last-year match) so partial coverage does not distort the comparison
    const matched = days.filter((d) => d.ly); k.matchedDays = matched.length; k.totalDays = days.length;
    k.mSales = sum(matched, (d) => d.sales); k.mLySales = sum(matched, (d) => d.ly.sales); k.mBills = sum(matched, (d) => d.bills); k.mLyBills = sum(matched, (d) => d.ly.bills);
    // weekday profile, this year vs the matching last-year dates
    const W = DOW.map((n) => ({ name: n, n: 0, sales: 0, bills: 0, lySales: 0, lyBills: 0 })); matched.forEach((d) => { const w = W[dayOfWeek(d.day)]; if (!w) return; w.n++; w.sales += d.sales; w.bills += d.bills; w.lySales += d.ly.sales; w.lyBills += d.ly.bills; });
    const ORD = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']; const dow = W.filter((w) => w.n).sort((x, y) => ORD.indexOf(x.name) - ORD.indexOf(y.name)).map((w) => ({ ...w, avg: w.bills ? w.sales / w.bills : null, lyAvg: w.lyBills ? w.lySales / w.lyBills : null, yoy: w.lySales ? w.sales / w.lySales - 1 : null }));
    // average daily sales per store and per weekday (Sat first). A trading day = a day with net sales above 0 for that store.
    // Last year uses only the dates that line up with this year's period, so both sides cover the same window.
    const WEEK = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']; const first = days.length ? days[0].day : null, last = days.length ? days[days.length - 1].day : null;
    const lyFrom = first ? addYears(first, -1) : null, lyTo = last ? addYears(last, -1) : null;
    const prof = (map, from, to) => { const o = { n: 0, sales: 0, dow: {} }; WEEK.forEach((w) => (o.dow[w] = { n: 0, sales: 0 }));
      Object.entries(map).forEach(([day, v]) => { if (!(v > 0) || (from && day < from) || (to && day > to)) return; o.n++; o.sales += v; const w = o.dow[DOW[dayOfWeek(day)]]; w.n++; w.sales += v; });
      o.avg = o.n ? o.sales / o.n : null; WEEK.forEach((w) => (o.dow[w].avg = o.dow[w].n ? o.dow[w].sales / o.dow[w].n : null)); return o; };
    const stores = branches.filter((b) => b.sales > 0 || b.lySales > 0).map((b) => { const ty = prof(b.days, null, null), ly = prof(b.lyDayMap, lyFrom, lyTo); return { key: b.key, name: b.name, ty, ly, yoy: ty.avg && ly.avg ? ty.avg / ly.avg - 1 : null, rawSales: b.sales, nonPositive: Object.values(b.days).filter((v) => !(v > 0)).length }; }).sort((a, b) => (b.ty.avg || 0) - (a.ty.avg || 0));
    const netD = {}; ds.ty.forEach((r) => { netD[r.day] = 1; }); const lyNet = {}; ds.ly.forEach((r) => { if ((!lyFrom || r.day >= lyFrom) && (!lyTo || r.day <= lyTo)) lyNet[r.day] = (lyNet[r.day] || 0) + r.sales; });
    const net = { ty: prof(Object.fromEntries(days.map((d) => [d.day, d.sales])), null, null), ly: prof(lyNet, lyFrom, lyTo) };
    return { k, branches, days, lyDays, dow, stores, net, WEEK, groups: groups.arr, items: itemsR.arr, itemsTotal: itemsR.total };
  }

  LM.sales = { WEEK: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'], spec, defaultTemplate, build, checks, compute, readSummaryTiles, branchKey, addYears, DOW };
})(typeof window !== 'undefined' ? window : globalThis);
