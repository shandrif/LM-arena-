/* Warehouse department: one large workbook with ~20 sheets (scorecard, stock value, dead stock, mugs, capacity,
   productivity, logistics cost, shipments/OTIF, B2B, inventory & ABC). Every block is found by label, not by position. No DOM. */
(function (root) {
  const LM = (root.LM = root.LM || {});
  const { norm, clean } = LM;
  const I = (level, msg) => ({ level, msg });
  const rowsOf = (wb, n) => LM.engine.rowsOf(wb, n);
  const txt = (v) => (v == null ? '' : clean(v));
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' ? LM.parseNum(v.replace(/^SAR\s*/i, '')) : null));
  const serial = (v) => (typeof v === 'number' && v > 40000 && v < 60000 ? LM.parseDay(v) : null);
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const addDays = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monOf = (v) => { if (typeof v === 'string') { const i = MON.indexOf(v.trim().slice(0, 3).toLowerCase()); return i >= 0 ? { m: i + 1 } : null; } const d = serial(v); return d ? { y: +d.slice(0, 4), m: +d.slice(5, 7), d } : null; };
  const near = (a, b, tol = 1) => a == null || b == null || Math.abs(a - b) <= tol;
  const relNear = (a, b, t = 0.02) => a == null || b == null || Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * t);
  const startsN = (v, key) => norm(v).startsWith(norm(key));
  const rowIdx = (g, keys, from = 0, to = g.length) => { for (let r = from; r < to; r++) { const x = g[r] || []; if (keys.every((k) => x.some((v) => v != null && startsN(v, k)))) return r; } return -1; };
  const colIdx = (row, key, from = 0, to) => { const x = row || []; for (let c = from; c < (to == null ? x.length : to); c++) if (x[c] != null && startsN(x[c], key)) return c; return -1; };
  const findCell = (g, key, from = 0) => { for (let r = from; r < g.length; r++) { const x = g[r] || []; for (let c = 0; c < x.length; c++) if (typeof x[c] === 'string' && startsN(x[c], key)) return [r, c]; } return null; };
  const sheetHas = (g, key, maxRows = 60) => !!findCell(g.slice(0, maxRows), key);
  const firstNum = (row, from) => { for (let c = from; c < (row || []).length; c++) if (num(row[c]) != null && typeof row[c] === 'number') return row[c]; return null; };

  /* ===================================================================== SCORECARD */
  function parseScorecard(g, issues) {
    const hr = rowIdx(g, ['category', 'goal', 'kpi', 'target', 'direction', 'weight']); if (hr < 0) return null; const h = g[hr];
    const cI = { cat: colIdx(h, 'category'), goal: colIdx(h, 'goal'), kpi: colIdx(h, 'kpi'), target: colIdx(h, 'target'), dir: colIdx(h, 'direction'), w: colIdx(h, 'weight'), avg: colIdx(h, 'average'), pct: colIdx(h, '%vstarget'), status: colIdx(h, 'status'), notes: colIdx(h, 'notes') };
    const months = []; for (let c = cI.w + 1; c < cI.avg; c++) { const m = monOf(h[c]); if (m) months.push({ c, m: m.m, label: txt(h[c]) }); }
    const kpis = [];
    for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; if (!txt(x[cI.kpi])) { if (kpis.length) break; continue; }
      kpis.push({ cat: txt(x[cI.cat]), goal: txt(x[cI.goal]), kpi: txt(x[cI.kpi]), target: num(x[cI.target]), dir: /lower/i.test(x[cI.dir]) ? 'lower' : 'higher', w: num(x[cI.w]), months: months.map((m) => ({ m: m.m, v: typeof x[m.c] === 'number' ? x[m.c] : null })), avg: num(x[cI.avg]), pct: num(x[cI.pct]), status: txt(x[cI.status]), notes: txt(x[cI.notes]) }); }
    const lab = (key) => { const f = findCell(g, key); return f ? firstNum(g[f[0]], f[1] + 1) : null; };
    const overall = lab('overallachievement'); const counts = { green: lab('greenkpis'), yellow: lab('yellowkpis'), red: lab('redkpis') };
    // right-hand "Warehouse KPIs" table: KPI / Weight / Target / Actual
    const ar = (() => { for (let r = 0; r < g.length; r++) { const x = g[r] || []; const k = colIdx(x, 'kpi'); if (k >= 0 && colIdx(x, 'actual', k) >= 0 && colIdx(x, 'weight', k) >= 0) return [r, k, colIdx(x, 'actual', k)]; } return null; })();
    const actuals = []; if (ar) for (let r = ar[0] + 1; r < g.length; r++) { const x = g[r] || []; if (!txt(x[ar[1]])) break; actuals.push({ kpi: txt(x[ar[1]]), actual: x[ar[2]], target: x[ar[2] - 1] }); }
    // checks
    const wsum = sum(kpis, (k) => k.w); if (kpis.length && Math.abs(wsum - 1) > 0.001) issues.push(I('warn', `Scorecard weights add up to ${(wsum * 100).toFixed(0)}%, not 100%.`));
    kpis.forEach((k) => {
      const vals = k.months.map((m) => m.v).filter((v) => v != null); if (vals.length) { const mean = sum(vals, (v) => v) / vals.length; k.mean = mean; if (k.avg != null && !relNear(k.avg, mean, 0.03) && Math.abs(k.avg - mean) > 0.002) issues.push(I('warn', `Scorecard “${k.kpi}”: the Average column says ${+k.avg.toFixed(4)} but the monthly values average ${+mean.toFixed(4)}.`)); }
      if (k.avg != null && k.target) { const calc = k.dir === 'lower' ? k.target / k.avg : k.avg / k.target; k.calc = calc; if (k.pct != null && Math.abs(calc - k.pct) > 0.03) issues.push(I('warn', `Scorecard “${k.kpi}”: % vs target is ${k.pct} but average ÷ target gives ${calc.toFixed(3)}.`)); }
      const p = k.pct != null ? k.pct : k.calc; k.derivedStatus = p == null ? '' : p >= 0.9995 ? 'Green' : p >= 0.9 ? 'Yellow' : 'Red'; if (k.status && k.derivedStatus && k.status.toLowerCase() !== k.derivedStatus.toLowerCase()) issues.push(I('warn', `Scorecard “${k.kpi}”: status is ${k.status} but ${(p * 100).toFixed(1)}% of target is normally ${k.derivedStatus} (≥100% green, 90–99% yellow, below 90% red).`));
    });
    if (kpis.length && overall != null) { const calc = sum(kpis, (k) => (k.pct != null ? k.pct : k.calc) * k.w) / (wsum || 1); if (Math.abs(calc - overall) > 0.01) issues.push(I('warn', `Overall achievement is ${(overall * 100).toFixed(1)}% in the sheet but the weighted KPIs give ${(calc * 100).toFixed(1)}%.`)); }
    const cnt = (s) => kpis.filter((k) => k.status.toLowerCase() === s).length; ['green', 'yellow', 'red'].forEach((s) => { if (counts[s] != null && counts[s] !== cnt(s)) issues.push(I('warn', `Scorecard says ${counts[s]} ${s} KPI(s) but ${cnt(s)} are listed.`)); });
    if (actuals.length) actuals.forEach((a, i) => { const k = kpis[i]; if (k && typeof a.actual === 'number' && k.avg != null && !relNear(a.actual, k.avg, 0.05)) issues.push(I('warn', `“${k.kpi}”: the Actual in the small KPI table is ${a.actual} but the main table's average is ${+k.avg.toFixed(3)}.`)); });
    if (kpis.length) { const lastM = Math.max(...kpis.flatMap((k) => k.months.filter((m) => m.v != null).map((m) => m.m))); kpis.forEach((k) => { const l = Math.max(0, ...k.months.filter((m) => m.v != null).map((m) => m.m)); if (l && l < lastM) issues.push(I('warn', `Scorecard “${k.kpi}” has no value for month ${lastM}.`)); }); }
    return { kpis, overall, counts, actuals, lastMonth: kpis.length ? Math.max(0, ...kpis.flatMap((k) => k.months.filter((m) => m.v != null).map((m) => m.m))) : null };
  }

  /* ===================================================================== STOCK VALUE / LOGISTICS (Summary sheet) */
  function parseSummary(g, issues) {
    const out = { metrics: [], monthly: [], breakdown: {}, expired: [] };
    const mh = rowIdx(g, ['metrics', 'performance']); if (mh >= 0) { out.perfLabel = txt(g[mh][colIdx(g[mh], 'performance')]); for (let r = mh + 1; r < g.length; r++) { const x = g[r] || []; if (!txt(x[0]) || typeof x[1] !== 'number') break; out.metrics.push({ name: txt(x[0]), value: x[1], gap: x[2] }); } }
    const th = rowIdx(g, ['month', 'closingstockvalue']); if (th >= 0) { const h = g[th]; const c = { m: colIdx(h, 'month'), stock: colIdx(h, 'closingstockvalue'), sales: colIdx(h, 'sales'), log: colIdx(h, 'logisticscost'), lr: colIdx(h, 'logisticsvs'), sr: colIdx(h, 'stockvaluevs') };
      for (let r = th + 1; r < g.length; r++) { const x = g[r] || []; const mm = monOf(x[c.m]); if (!mm) break; out.monthly.push({ y: mm.y, m: mm.m, stock: num(x[c.stock]), sales: num(x[c.sales]), log: num(x[c.log]), lr: num(x[c.lr]), sr: num(x[c.sr]) }); } }
    const bh = rowIdx(g, ['metric', 'value(sar)']); if (bh >= 0) { for (let r = bh + 1; r < g.length; r++) { const x = g[r] || []; const l = txt(x[0]); if (!l) break; const v = num(x[1]); const k = /^total stock/i.test(l) ? 'total' : /^dead stock value/i.test(l) ? 'dead' : /^healthy/i.test(l) ? 'healthy' : /recoverable/i.test(l) ? 'recoverable' : /write-?off/i.test(l) ? 'writeoff' : /lines/i.test(l) ? 'lines' : null; if (k) { out.breakdown[k] = v; if (k === 'total') out.breakdown.totalLabel = l; } } }
    const eh = rowIdx(g, ['itemname', 'quantity', 'expirydate']); if (eh >= 0) { const h = g[eh]; const c = { n: colIdx(h, 'itemname'), q: colIdx(h, 'quantity'), e: colIdx(h, 'expirydate'), s: colIdx(h, 'shelf'), sup: colIdx(h, 'supplier'), v: colIdx(h, 'valueatrisk') };
      for (let r = eh + 1; r < g.length; r++) { const x = g[r] || []; const n = txt(x[c.n]); if (!n) break; const row = { name: n, qty: num(x[c.q]), expiry: serial(x[c.e]), shelf: num(x[c.s]), supplier: txt(x[c.sup]), value: num(x[c.v]) }; if (/^subtotal/i.test(n)) out.expiredSubtotal = row; else out.expired.push(row); } }
    return out;
  }
  function parseDeadSheet(g) {
    const out = { exec: {}, split: [], buckets: [] };
    const hr = findCell(g, 'totaldeadstock'); if (hr) { const r = hr[0]; (g[r] || []).forEach((v, c) => { if (!txt(v)) return; const val = g[r + 1] ? g[r + 1][c] : null; const sub = g[r + 2] ? g[r + 2][c] : null; out.exec[norm(v)] = { label: txt(v), value: num(val), text: txt(val), sub: txt(sub) }; }); }
    const sh = rowIdx(g, ['split', 'value(sar)']); if (sh >= 0) { const c0 = colIdx(g[sh], 'split'); for (let r = sh + 1; r < g.length; r++) { const x = g[r] || []; if (!txt(x[c0]) || num(x[c0 + 1]) == null) break; out.split.push({ name: txt(x[c0]), value: num(x[c0 + 1]) }); } }
    const bh = rowIdx(g, ['expirybucket']); if (bh >= 0) { const c0 = colIdx(g[bh], 'expirybucket'); for (let r = bh + 1; r < g.length; r++) { const x = g[r] || []; if (!txt(x[c0]) || num(x[c0 + 1]) == null) break; out.buckets.push({ name: txt(x[c0]), value: num(x[c0 + 1]) }); } }
    const t = findCell(g, 'deadstockexecutive'); out.title = t ? txt(g[t[0]][t[1]]) : '';
    return out;
  }

  /* ===================================================================== MUGS */
  function parseMugs(g, issues) {
    const hr = rowIdx(g, ['item', 'unit']); if (hr < 0) return null; const h = g[hr]; const totC = colIdx(h, 'total', 3);
    const whs = []; for (let c = 3; c < totC; c++) if (txt(h[c])) whs.push({ c, name: txt(h[c]) });
    let date = null; for (let r = 0; r < hr; r++) (g[r] || []).forEach((v) => { if (!date) date = serial(v); });
    const items = []; const totals = []; let section = 'Hot';
    for (let r = hr + 1; r < g.length; r++) { const x = g[r] || [];
      if (typeof x[0] === 'string' && /^(total|stanley)/i.test(x[0].trim()) && x.some((v, c) => c >= 3 && typeof v === 'number')) { const key = /cold/i.test(x[0]) ? 'Cold' : /hot/i.test(x[0]) ? 'Hot' : 'Stanley'; totals.push({ section: key, label: txt(x[0]), qty: whs.map((w) => num(x[w.c])), total: num(x[totC]) }); section = key === 'Hot' ? 'Cold' : key === 'Cold' ? 'Stanley' : section; continue; }
      const n = txt(x[1]); if (!n) continue; if (!whs.some((w) => typeof x[w.c] === 'number') && typeof x[totC] !== 'number') continue; if (!/\b(pcs|pc|piece)/i.test(txt(x[2])) && x[2] != null) { /* unit other than pcs */ }
      items.push({ name: n, section, type: /hot\s*(and|&)\s*cold/i.test(n) ? 'Hot & Cold' : section, qty: whs.map((w) => num(x[w.c]) || 0), total: num(x[totC]) }); }
    // movement table (right-hand side): Item / Total Received / OUT Branches / OUT SALASA / SOH
    let move = []; const mr = (() => { for (let r = 0; r < g.length; r++) { const x = g[r] || []; const c = colIdx(x, 'item', 9); if (c >= 0 && colIdx(x, 'totalreceived', c) >= 0) return [r, c]; } return null; })();
    if (mr) for (let r = mr[0] + 1; r < g.length; r++) { const x = g[r] || []; const n = txt(x[mr[1]]); if (!n) break; move.push({ name: n, received: num(x[mr[1] + 1]), outBranches: num(x[mr[1] + 2]), outSalasa: num(x[mr[1] + 3]), soh: num(x[mr[1] + 4]) }); }
    // checks
    items.forEach((i) => { const s = sum(i.qty, (v) => v); if (i.total != null && Math.abs(s - i.total) > 0.5) issues.push(I('warn', `Mug “${i.name}”: warehouses add up to ${s.toLocaleString()} but the total says ${i.total.toLocaleString()}.`)); if (i.qty.some((v) => v < 0)) issues.push(I('warn', `Mug “${i.name}” has negative stock.`)); });
    totals.forEach((t) => { const rows = items.filter((i) => i.section === t.section); whs.forEach((w, k) => { const s = sum(rows, (i) => i.qty[k]); if (t.qty[k] != null && Math.abs(s - t.qty[k]) > 0.5) issues.push(I('warn', `${t.label.trim()} for ${w.name}: items add up to ${s.toLocaleString()} but the total row says ${t.qty[k].toLocaleString()}.`)); }); });
    move.forEach((m) => { if (m.received != null && m.soh != null) { const e = m.received - (m.outBranches || 0) - (m.outSalasa || 0); if (Math.abs(e - m.soh) > 0.5) issues.push(I('warn', `Mug “${m.name}”: received − out = ${e.toLocaleString()} but SOH says ${m.soh.toLocaleString()}.`)); } });
    const dupN = items.map((i) => norm(i.name)).filter((n, i, a) => a.indexOf(n) !== i); if (dupN.length) issues.push(I('warn', `Duplicate mug name(s): ${[...new Set(dupN)].join(', ')}.`));
    return { date, warehouses: whs.map((w) => w.name), items, totals, move };
  }
  function parseMugPlan(g, issues) {
    const hr = rowIdx(g, ['item', 'beforedispatch']); if (hr < 0) return null; const h = g[hr]; const c = { n: colIdx(h, 'item'), b: colIdx(h, 'beforedispatch'), d: colIdx(h, 'dispatched'), s: colIdx(h, 'salasa'), td: colIdx(h, 'totaldispatched'), soh: colIdx(h, 'soh'), a: colIdx(h, 'actualsoh') };
    const rows = [], totals = []; for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const n = txt(x[c.n]); if (!n) { if (rows.length) break; continue; } const row = { name: n, before: num(x[c.b]), dispatched: num(x[c.d]), salasa: num(x[c.s]), totalDispatched: num(x[c.td]), soh: num(x[c.soh]), actual: num(x[c.a]) }; (/^total/i.test(n) ? totals : rows).push(row); }
    const ac = colIdx(h, 'assumptions'); const assumptions = []; if (ac >= 0) for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; if (txt(x[ac]) && num(x[ac + 1]) != null) assumptions.push({ name: txt(x[ac]), value: num(x[ac + 1]) }); }
    rows.forEach((x) => { if (x.before != null && x.totalDispatched != null && x.soh != null && Math.abs(x.before - x.totalDispatched - x.soh) > 1) issues.push(I('warn', `Mug plan “${x.name}”: before dispatch − dispatched = ${(x.before - x.totalDispatched).toLocaleString()} but SOH says ${x.soh.toLocaleString()}.`)); });
    return { rows, totals, assumptions, hidden: true };
  }

  /* ===================================================================== CAPACITY */
  function parseCapacity(g, issues) {
    const hr = rowIdx(g, ['region', 'warehouse', 'area']); if (hr < 0) return null; const h = g[hr]; const c = { reg: colIdx(h, 'region'), wh: colIdx(h, 'warehouse'), area: colIdx(h, 'area'), cap: colIdx(h, 'capacity'), act: colIdx(h, 'actualstock'), u: colIdx(h, 'utilization'), gap: colIdx(h, 'gap') };
    const rows = []; let reg = ''; let total = null;
    for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; if (txt(x[c.reg])) reg = txt(x[c.reg]); const wh = txt(x[c.wh]); if (/overall total/i.test(txt(x[c.reg]))) { total = { area: num(x[c.area]), cap: num(x[c.cap]), act: num(x[c.act]), u: num(x[c.u]), gap: num(x[c.gap]) }; break; } if (!wh) { if (rows.length && !txt(x[c.reg])) break; continue; } rows.push({ region: reg, wh, area: num(x[c.area]), cap: num(x[c.cap]), act: num(x[c.act]), u: num(x[c.u]), gap: num(x[c.gap]) }); }
    rows.forEach((x) => { if (x.cap && x.act != null) { const u = x.act / x.cap; if (x.u != null && Math.abs(u - x.u) > 0.01) issues.push(I('warn', `Capacity “${x.wh}”: utilization is ${(x.u * 100).toFixed(1)}% but ${x.act} ÷ ${x.cap} = ${(u * 100).toFixed(1)}%.`)); const gap = x.act - x.cap; if (x.gap != null && x.gap !== gap) issues.push(I('warn', `Capacity “${x.wh}”: gap is ${x.gap.toLocaleString()} pallets but actual − capacity = ${gap.toLocaleString()}.`)); } });
    if (total) { [['area', 'Area'], ['cap', 'Capacity'], ['act', 'Actual stock']].forEach(([k, l]) => { const s = sum(rows, (x) => x[k]); if (total[k] != null && Math.abs(s - total[k]) > 0.5) issues.push(I('warn', `Capacity total: ${l} adds up to ${s.toLocaleString()} but the total row says ${total[k].toLocaleString()}.`)); }); const sg = sum(rows, (x) => x.act - x.cap); if (total.gap != null && total.gap !== sg) issues.push(I('warn', `Capacity total gap is ${total.gap.toLocaleString()} but the warehouses' gaps add up to ${sg.toLocaleString()}.`)); }
    return { rows, total };
  }

  /* ===================================================================== DAILY IN/OUT + PRODUCTIVITY */
  function parseFlow(g, issues) {
    const sh = rowIdx(g, ['outcartons', 'incartons']); if (sh < 0) return null; const s = g[sh]; const hh = g[sh - 1] || [];
    const c = { reg: 0, wh: 1, served: colIdx(hh, 'servedbranches'), daily: colIdx(hh, 'dailydelivery'), oc: colIdx(s, 'outcartons'), ic: colIdx(s, 'incartons'), cp: colIdx(s, 'cartons%'), nc: colIdx(s, 'netcartons'), op: colIdx(s, 'outpallets'), ip: colIdx(s, 'inpallets'), pp: colIdx(s, 'pallets%'), np: colIdx(s, 'netpallets') };
    if (c.served < 0) { const hr = rowIdx(g, ['region', 'warehouse', 'servedbranches']); if (hr >= 0) { c.served = colIdx(g[hr], 'servedbranches'); c.daily = colIdx(g[hr], 'dailydelivery'); } }
    const rows = []; let reg = ''; let total = null, totalM = null;
    for (let r = sh + 1; r < g.length; r++) { const x = g[r] || []; if (txt(x[c.reg])) reg = txt(x[c.reg]); const wh = txt(x[c.wh]); const lab = txt(x[0]);
      if (/^total\s*\(\s*daily/i.test(lab)) { total = { served: num(x[c.served]), daily: num(x[c.daily]), oc: num(x[c.oc]), ic: num(x[c.ic]), nc: num(x[c.nc]), op: num(x[c.op]), ip: num(x[c.ip]), np: num(x[c.np]) }; continue; }
      if (/^total\s*\(\s*monthly/i.test(lab)) { totalM = { oc: num(x[c.oc]), ic: num(x[c.ic]), nc: num(x[c.nc]), op: num(x[c.op]), ip: num(x[c.ip]), np: num(x[c.np]) }; break; }
      if (!wh) continue; rows.push({ region: reg, wh, served: num(x[c.served]), daily: num(x[c.daily]), dailyText: typeof x[c.daily] === 'string' ? x[c.daily] : '', oc: num(x[c.oc]), ic: num(x[c.ic]), cp: num(x[c.cp]), nc: num(x[c.nc]), op: num(x[c.op]), ip: num(x[c.ip]), pp: num(x[c.pp]), np: num(x[c.np]) }); }
    const badPct = [], badPP = [];
    rows.forEach((x) => { if (x.oc != null && x.ic != null && x.nc != null && x.nc !== x.ic - x.oc) issues.push(I('warn', `Daily flow “${x.wh}”: net cartons is ${x.nc} but IN − OUT = ${x.ic - x.oc}.`)); if (x.op != null && x.ip != null && x.np != null && x.np !== x.ip - x.op) issues.push(I('warn', `Daily flow “${x.wh}”: net pallets is ${x.np} but IN − OUT = ${x.ip - x.op}.`)); if (x.oc && x.ic != null && x.cp != null && Math.abs(x.ic / x.oc - x.cp) > 0.02) badPct.push(`${x.wh} (${x.cp} vs ${(x.ic / x.oc).toFixed(2)})`); if (x.op && x.ip != null && x.pp != null && Math.abs(x.ip / x.op - x.pp) > 0.02) badPP.push(x.wh); });
    if (badPct.length) issues.push(I('warn', `Daily flow: “Cartons %” does not equal IN ÷ OUT for ${badPct.length} warehouse(s), e.g. ${badPct.slice(0, 3).join('; ')}.`)); if (badPP.length) issues.push(I('warn', `Daily flow: “Pallets %” does not equal IN ÷ OUT for ${badPP.length} warehouse(s).`));
    if (total) [['oc', 'OUT cartons'], ['ic', 'IN cartons'], ['op', 'OUT pallets'], ['ip', 'IN pallets'], ['daily', 'daily deliveries']].forEach(([k, l]) => { const s2 = sum(rows, (x) => x[k]); if (total[k] != null && Math.abs(s2 - total[k]) > 0.5) issues.push(I('warn', `Daily flow total: ${l} add up to ${s2.toLocaleString()} but the total row says ${total[k].toLocaleString()}.`)); });
    if (total && totalM && total.oc && totalM.oc && Math.abs(totalM.oc - total.oc * 30) > 1) issues.push(I('info', `Monthly OUT cartons (${totalM.oc.toLocaleString()}) = daily × ${(totalM.oc / total.oc).toFixed(0)}.`));
    // productivity blocks
    const prod = {}; const pr = rowIdx(g, ['productivityperformance']); const find = (key) => findCell(g, key);
    const sc = (() => { const f = find('scope'); return f; })();
    const perf = []; const ph = (() => { for (let r = 0; r < g.length; r++) { const x = g[r] || []; if (colIdx(x, 'scope') >= 0 && colIdx(x, 'actual') >= 0 && colIdx(x, 'target') >= 0) return r; } return -1; })();
    if (ph >= 0) for (let r = ph + 1; r < g.length; r++) { const x = g[r] || []; if (!txt(x[0])) break; perf.push({ scope: txt(x[0]), actual: num(x[1]), target: num(x[2]), pct: num(x[3]) }); }
    const cph = (() => { for (let r = 0; r < g.length; r++) { const x = g[r] || []; if (colIdx(x, 'scope') >= 0 && colIdx(x, 'cartons/hour') >= 0) return r; } return -1; })(); const cph2 = []; if (cph >= 0) for (let r = cph + 1; r < g.length; r++) { const x = g[r] || []; if (!txt(x[0])) break; cph2.push({ scope: txt(x[0]), cph: num(x[1]) }); }
    const dh = rowIdx(g, ['description', 'workers', 'incartons']); const detail = []; if (dh >= 0) { const h = g[dh]; for (let r = dh + 1; r < g.length; r++) { const x = g[r] || []; if (!txt(x[0])) break; detail.push({ desc: txt(x[0]), workers: num(x[1]), ic: num(x[2]), oc: num(x[3]), total: num(x[4]), hrs: num(x[5]), totalHrs: num(x[6]), cph: num(x[7]) }); } }
    perf.forEach((p) => { if (p.actual != null && p.target && p.pct != null && Math.abs(p.actual / p.target - p.pct) > 0.02) issues.push(I('warn', `Productivity “${p.scope}”: % is ${p.pct} but actual ÷ target = ${(p.actual / p.target).toFixed(2)}.`)); });
    detail.forEach((d) => { if (d.total != null && d.totalHrs && d.cph != null && Math.abs(d.total / d.totalHrs - d.cph) > 0.1) issues.push(I('warn', `Productivity “${d.desc}”: cartons/hour is ${d.cph} but ${d.total} ÷ ${d.totalHrs} h = ${(d.total / d.totalHrs).toFixed(1)}.`)); });
    return { rows, total, totalM, perf, cph: cph2, detail };
  }

  /* ===================================================================== LOGISTICS COST */
  function block(g, hr, c0, labels) { // returns column map for header row hr starting at c0
    const h = g[hr] || []; const m = {}; labels.forEach(([k, key]) => { const c = colIdx(h, key, c0); if (c >= 0) m[k] = c; }); return m;
  }
  function parseLogistics(g, issues) {
    const out = { cost: [], budget: [], allCost: [], branches: [], turnover: [] };
    // T1: Month 2026 | Sales | Logistics Cost | %
    let hr = rowIdx(g, ['month2026', 'sales', 'logisticscost']); if (hr >= 0) { const m = block(g, hr, 0, [['mo', 'month'], ['sales', 'sales'], ['log', 'logisticscost'], ['pct', '%']]); for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const mo = txt(x[m.mo]); if (/^average/i.test(mo)) break; const mm = monOf(mo); if (!mm) break; out.cost.push({ m: mm.m, sales: num(x[m.sales]), log: num(x[m.log]), pct: num(x[m.pct]) }); } }
    // T2: budget vs actual (second "Month 2026" header, with 'Budget (SAR) Old')
    hr = rowIdx(g, ['month2026', 'budget(sar)old']); if (hr >= 0) { const c0 = colIdx(g[hr], 'month2026', 1); const m = block(g, hr, c0, [['mo', 'month'], ['old', 'budget(sar)old'], ['nw', 'newbudget'], ['act', 'actual'], ['var', 'variance'], ['util', '%utilization']]); for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const mo = txt(x[m.mo]); if (/^total/i.test(mo)) { out.budgetTotal = { old: num(x[m.old]), nw: num(x[m.nw]), act: num(x[m.act]), var: num(x[m.var]), util: num(x[m.util]) }; break; } const mm = monOf(mo); if (!mm) break; out.budget.push({ m: mm.m, old: num(x[m.old]), nw: num(x[m.nw]), act: num(x[m.act]), var: num(x[m.var]), util: num(x[m.util]) }); } }
    // T3: all costs incl. shipping
    hr = rowIdx(g, ['month2026', 'sales', 'shipcost']); if (hr >= 0) { const c0 = colIdx(g[hr], 'month2026', 0); const m = block(g, hr, c0, [['mo', 'month'], ['sales', 'sales'], ['log', 'logisticscost'], ['ship', 'shipcost'], ['tot', 'totalcost'], ['pct', '%']]); for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const mo = txt(x[m.mo]); if (/^average/i.test(mo)) break; const mm = monOf(mo); if (!mm) break; out.allCost.push({ m: mm.m, sales: num(x[m.sales]), log: num(x[m.log]), ship: num(x[m.ship]), tot: num(x[m.tot]), pct: num(x[m.pct]) }); } }
    // T4: branches / cost per branch
    hr = rowIdx(g, ['month', 'invoice(sar)', 'sales(sar)']); if (hr >= 0) { const c0 = colIdx(g[hr], 'month', 5); const m = block(g, hr, c0 >= 0 ? c0 : 0, [['mo', 'month'], ['inv', 'invoice'], ['sales', 'sales(sar)'], ['pct', '%ofsales'], ['br', 'branches'], ['cm', 'cost/branch(monthly)'], ['cd', 'cost/branch(daily)']]); for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const mm = monOf(x[m.mo]); if (!mm) { if (/average/i.test(txt(x[m.mo]))) break; continue; } if (num(x[m.inv]) == null) continue; out.branches.push({ y: mm.y, m: mm.m, inv: num(x[m.inv]), sales: num(x[m.sales]), pct: num(x[m.pct]), br: num(x[m.br]), cm: num(x[m.cm]), cd: num(x[m.cd]) }); } }
    // T5: RM turns
    hr = rowIdx(g, ['month', 'beginningstock', 'purchases']); if (hr >= 0) { const m = block(g, hr, 0, [['mo', 'month'], ['beg', 'beginning'], ['pur', 'purchases'], ['clo', 'closingstock'], ['cogs', 'cogs'], ['avg', 'avg.inventory'], ['t', 'turnover']]); for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const mo = txt(x[m.mo]); const mm = monOf(mo); if (!mm) { if (/month/i.test(mo)) { out.turnoverTotal = { pur: num(x[m.pur]), cogs: num(x[m.cogs]), avg: num(x[m.avg]), t: num(x[m.t]) }; } break; } out.turnover.push({ m: mm.m, beg: num(x[m.beg]), pur: num(x[m.pur]), clo: num(x[m.clo]), cogs: num(x[m.cogs]), avg: num(x[m.avg]), t: num(x[m.t]) }); } }
    // checks
    out.cost.forEach((x) => { if (x.sales && x.log != null && x.pct != null && Math.abs(x.log / x.sales - x.pct) > 0.002) issues.push(I('warn', `Logistics cost ${MON[x.m - 1]}: % of sales is ${x.pct} but ${x.log} ÷ sales = ${(x.log / x.sales).toFixed(4)}.`)); });
    out.budget.forEach((x) => { if (x.nw != null && x.act != null && x.var != null && Math.abs(x.act - x.nw - x.var) > 1) issues.push(I('warn', `Budget ${MON[x.m - 1]}: variance is ${Math.round(x.var).toLocaleString()} but actual − new budget = ${Math.round(x.act - x.nw).toLocaleString()}.`)); if (x.nw && x.act != null && x.util != null && Math.abs(x.act / x.nw - x.util) > 0.01) issues.push(I('warn', `Budget ${MON[x.m - 1]}: utilization is ${x.util} but actual ÷ new budget = ${(x.act / x.nw).toFixed(3)}.`)); });
    out.allCost.forEach((x) => { if (x.log != null && x.ship != null && x.tot != null && Math.abs(x.log + x.ship - x.tot) > 1) issues.push(I('warn', `Total logistics cost ${MON[x.m - 1]}: ${Math.round(x.log).toLocaleString()} + shipping ${Math.round(x.ship).toLocaleString()} ≠ total ${Math.round(x.tot).toLocaleString()}.`)); });
    out.turnover.forEach((x) => { if (x.beg != null && x.pur != null && x.cogs != null && x.clo != null) { const e = x.beg + x.pur - x.cogs; if (Math.abs(e - x.clo) > Math.max(1000, x.clo * 0.001)) issues.push(I('info', `RM turnover ${MON[x.m - 1]}: beginning + purchases − COGS = ${Math.round(e).toLocaleString()} but closing stock is ${Math.round(x.clo).toLocaleString()}.`)); } if (x.cogs && x.avg && x.t != null && Math.abs(x.cogs / x.avg - x.t) > 0.01) issues.push(I('warn', `RM turnover ${MON[x.m - 1]}: ${x.t} but COGS ÷ average stock = ${(x.cogs / x.avg).toFixed(3)}.`)); });
    return out;
  }

  /* ===================================================================== SHIPMENTS / OTIF */
  function parseWeeklyShip(g, issues) {
    const weeks = []; let cur = null; let reg = '';
    for (let r = 0; r < g.length; r++) { const x = g[r] || []; const a = txt(x[0]);
      if (/^week\s*\d/i.test(a) && x.slice(1).every((v) => v == null)) { cur = { label: a, rows: [] }; weeks.push(cur); reg = ''; continue; }
      if (!cur) continue; if (/^region$/i.test(a)) continue;
      if (/^total orders/i.test(a)) { cur.total = { orders: num(x[4]), onTime: num(x[5]), emergency: num(x[6]), delayed: num(x[7]), otif: num(x[8]) }; continue; }
      const from = serial(x[2]), to = serial(x[3]); if (!from || !txt(x[1])) continue; if (a) reg = a; cur.from = cur.from || from; cur.to = cur.to || to;
      cur.rows.push({ region: reg, wh: txt(x[1]), orders: num(x[4]), onTime: num(x[5]), emergency: num(x[6]), delayed: num(x[7]), otif: typeof x[8] === 'number' ? x[8] : null, em: num(x[9]), note: txt(x[10]) }); }
    const W = weeks.filter((w) => w.rows.length);
    W.forEach((w) => { w.t = { orders: sum(w.rows, (x) => x.orders), onTime: sum(w.rows, (x) => x.onTime), emergency: sum(w.rows, (x) => x.emergency), delayed: sum(w.rows, (x) => x.delayed) }; w.t.otif = w.t.orders ? w.t.onTime / w.t.orders : null;
      if (w.total && w.total.orders != null && w.total.orders !== w.t.orders) issues.push(I('warn', `${w.label}: total orders is ${w.total.orders} but the warehouses add up to ${w.t.orders}.`)); if (w.total && w.total.emergency != null && w.total.emergency !== w.t.emergency) issues.push(I('warn', `${w.label}: emergency total is ${w.total.emergency} but the warehouses add up to ${w.t.emergency}.`));
      w.rows.forEach((x) => { if (x.orders && x.onTime != null && x.delayed != null && x.onTime + x.delayed !== x.orders) issues.push(I('warn', `${w.label}, ${x.wh}: on time ${x.onTime} + delayed ${x.delayed} ≠ total orders ${x.orders}.`)); if (x.orders && x.otif != null && Math.abs(x.onTime / x.orders - x.otif) > 0.01) issues.push(I('warn', `${w.label}, ${x.wh}: OTIF % is ${x.otif} but on time ÷ orders = ${(x.onTime / x.orders).toFixed(2)}.`)); }); });
    const tail = W.filter((w) => w.from).sort((a, b) => (a.from < b.from ? -1 : 1)); for (let i = 1; i < tail.length; i++) { const exp = addDays(tail[i - 1].to || tail[i - 1].from, 1); if (tail[i].from !== exp) issues.push(I('warn', `Shipment weeks are not back to back: “${tail[i - 1].label.trim()}” ends ${tail[i - 1].to}, but “${tail[i].label.trim()}” starts ${tail[i].from}.`)); }
    const dupW = tail.filter((w, i) => tail.findIndex((y) => y.from === w.from) !== i); if (dupW.length) issues.push(I('warn', `Duplicate shipment week(s): ${dupW.map((w) => w.from).join(', ')}.`));
    const emOver = W.reduce((s, w) => s + w.rows.filter((x) => x.orders != null && x.emergency > x.orders).length, 0); if (emOver) issues.push(I('info', `${emOver} warehouse-week line(s) report more emergency orders than total orders (emergency % above 100%).`));
    return W.map((w) => ({ label: w.label, from: w.from, to: w.to, t: w.t, rows: w.rows }));
  }
  function parseDailyShip(g, issues) {
    const hr = rowIdx(g, ['s.n', 'dateofdelivery']); if (hr < 0) return null; const h = g[hr]; const c = { d: colIdx(h, 'dateofdelivery'), tot: colIdx(h, 'total'), on: colIdx(h, 'shippedontime'), off: colIdx(h, 'notshippedontime'), em: colIdx(h, 'emergency') };
    const rows = []; let totalRow = null; for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; if (/^total$/i.test(txt(x[0]))) { totalRow = { orders: num(x[c.tot]), on: num(x[c.on]), off: num(x[c.off]) }; break; } const d = serial(x[c.d]); if (!d) continue; if (num(x[c.tot]) == null) continue; rows.push({ date: d, orders: num(x[c.tot]), on: num(x[c.on]), off: num(x[c.off]), emergency: txt(x[c.em]) }); }
    const o = sum(rows, (x) => x.orders), on = sum(rows, (x) => x.on);
    if (totalRow && totalRow.orders != null && Math.abs(totalRow.orders - o) > 0.5) issues.push(I('warn', `Daily shipments: total says ${totalRow.orders.toLocaleString()} orders but the days add up to ${o.toLocaleString()}.`));
    rows.forEach((x) => { if (x.on + x.off !== x.orders) issues.push(I('warn', `Daily shipments ${x.date}: on time ${x.on} + not on time ${x.off} ≠ orders ${x.orders}.`)); });
    const mo = (g[0] || []).find((v) => typeof v === 'number'); const yr = (g[1] || []).find((v) => typeof v === 'number' && v > 2000);
    return { rows, orders: o, onTime: on, firstDate: rows[0] && rows[0].date, lastDate: rows.length ? rows[rows.length - 1].date : null, title: txt((g[0] || []).find((v) => typeof v === 'string' && /shipment/i.test(v)) || '') };
  }
  function parseOrdering(g, issues, asOf) {
    const hr = rowIdx(g, ['s.n', 'ordersystemdate']); if (hr < 0) return null; const h = g[hr]; const c = { d: colIdx(h, 'ordersystemdate'), rem: colIdx(h, 'remarks'), t: colIdx(h, 'timeoforder'), tg: colIdx(h, 'targeted') };
    let n = 0, ok = 0, later = 0; const notOk = [];
    for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const d = serial(x[c.d]); if (!d) continue; if (asOf && d > asOf) { later++; continue; } const rem = txt(x.slice(5).find((v) => typeof v === 'string' && v.trim())); if (!rem) continue; n++; if (/^ok$/i.test(rem)) ok++; else notOk.push({ date: d, remark: rem }); }
    if (later) issues.push(I('info', `“On Time Ordering” sheet has ${later.toLocaleString()} pre-filled row(s) dated after the report date (up to ${serial((g[g.length - 1] || [])[c.d]) || '?'}); they are ignored.`));
    return { days: n, ok, notOk: notOk.slice(0, 50), pct: n ? ok / n : null };
  }

  /* ===================================================================== B2B */
  function parseB2BProduct(g, issues) {
    const hr = rowIdx(g, ['product', 'totalqty', 'totalsales']); if (hr < 0) return null; const h = g[hr]; const tq = colIdx(h, 'totalqty'), ts = colIdx(h, 'totalsales');
    const qC = []; for (let c = 1; c < tq; c++) qC.push(c); const sC = []; for (let c = colIdx(h, '%oftotal', tq) + 1; c < ts; c++) sC.push(c);
    const rows = []; for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const n = txt(x[0]); if (!n) { if (rows.length) break; continue; } if (/^(grand\s*)?total/i.test(n)) continue; rows.push({ name: n, qty: qC.map((c) => num(x[c]) || 0), sales: sC.map((c) => num(x[c]) || 0), totalQty: num(x[tq]), totalSales: num(x[ts]) }); }
    const monthTotals = (g[hr - 3] || []).filter((v) => typeof v === 'number' && v !== 0); const grand = num((g[0] || [])[(g[0] || []).length - 1]);
    rows.forEach((x) => { const s = sum(x.sales, (v) => v); if (x.totalSales != null && Math.abs(s - x.totalSales) > 1) issues.push(I('warn', `B2B product “${x.name}”: months add up to ${Math.round(s).toLocaleString()} but Total Sales says ${Math.round(x.totalSales).toLocaleString()}.`)); const q = sum(x.qty, (v) => v); if (x.totalQty != null && Math.abs(q - x.totalQty) > 0.5) issues.push(I('warn', `B2B product “${x.name}”: monthly quantities add up to ${q.toLocaleString()} but Total QTY says ${x.totalQty.toLocaleString()}.`)); });
    const tot = sum(rows, (x) => x.totalSales); if (grand != null && Math.abs(tot - grand) > Math.max(1, tot * 0.001)) issues.push(I('warn', `B2B product sales add up to ${Math.round(tot).toLocaleString()} but the sheet's grand total is ${Math.round(grand).toLocaleString()}.`));
    const neg = rows.filter((x) => x.sales.some((v) => v < 0)).length; if (neg) issues.push(I('info', `${neg} B2B product(s) have negative sales in a month (credit notes / returns).`));
    const lastLabel = txt(h[sC[sC.length - 1] - 3] || ''); const partial = sC.map((c) => txt(h[c])).find((l) => /until|till/i.test(l));
    return { products: rows, partialMonth: partial || '' , grand: tot };
  }
  function parseB2BCustomer(g, issues) {
    const hr = rowIdx(g, ['customer', 'category', 'product', 'totalqty']); if (hr < 0) return null; const h = g[hr]; const tq = colIdx(h, 'totalqty'), ts = colIdx(h, 'totalnetsales');
    const mc = []; for (let c = 3; c < tq; c++) mc.push(c); const rows = [];
    for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const cu = txt(x[0]); if (!cu) { if (rows.length) break; continue; } if (/^(grand\s*)?total/i.test(cu)) continue; rows.push({ customer: cu, category: txt(x[1]), product: txt(x[2]), qty: mc.map((c) => num(x[c]) || 0), totalQty: num(x[tq]), sales: num(x[ts]), pctCust: num(x[ts + 1]), pctGrand: num(x[ts + 2]) }); }
    rows.forEach((x) => { const q = sum(x.qty, (v) => v); if (x.totalQty != null && Math.abs(q - x.totalQty) > 0.5) issues.push(I('warn', `B2B customer line “${x.customer} / ${x.product}”: months add up to ${q.toLocaleString()} but Total QTY says ${x.totalQty.toLocaleString()}.`)); });
    const grand = sum(rows, (x) => x.sales); const monthLabels = mc.map((c) => txt(h[c])); const stale = monthLabels.find((l) => /till|until/i.test(l));
    const custTot = {}; rows.forEach((x) => (custTot[x.customer] = (custTot[x.customer] || 0) + x.sales));
    return { rows, grand, monthLabels, stale: stale || '' };
  }

  /* ===================================================================== INVENTORY + ABC */
  function parseInventory(g, issues) {
    const hr = rowIdx(g, ['newsku', 'itemname', 'unit', 'averagecost']); if (hr < 0) return null; const h = g[hr]; const wh = []; for (let c = 4; c < h.length; c++) if (/^physical/i.test(txt(h[c]))) wh.push({ c, name: txt(h[c]).replace(/^physical\s*#?\s*wh\s*/i, '').trim() || txt(h[c]) });
    const totC = colIdx(h, 'totalwarehousestock'); const top = {}; for (let r = Math.max(0, hr - 3); r < hr; r++) { const x = g[r] || []; if (x.some((v) => typeof v === 'number')) { const vals = [...wh.map((w) => x[w.c]), x[totC]]; if (vals.some((v) => typeof v === 'number' && v > 1000)) top.value = vals; else if (vals.some((v) => typeof v === 'number')) top.share = vals; } }
    const items = []; for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const n = txt(x[1]); if (!n) continue; items.push({ code: txt(x[0]), name: n, unit: txt(x[2]), cost: num(x[3]), qty: wh.map((w) => num(x[w.c]) || 0), val: wh.map((w) => num(x[w.c + 1]) || 0), totalQty: num(x[totC]), row: r + 1 }); }
    wh.forEach((w, k) => { const s = sum(items, (i) => i.val[k]); w.value = s; if (top.value && top.value[k] != null && Math.abs(s - top.value[k]) > Math.max(5, top.value[k] * 0.0005)) issues.push(I('warn', `Inventory ${w.name}: item values add up to ${Math.round(s).toLocaleString()} but the header says ${Math.round(top.value[k]).toLocaleString()}.`)); });
    const total = sum(wh, (w) => w.value); if (top.value && top.value[wh.length] != null && Math.abs(total - top.value[wh.length]) > Math.max(5, total * 0.0005)) issues.push(I('warn', `Inventory total: warehouses add up to ${Math.round(total).toLocaleString()} but the header total is ${Math.round(top.value[wh.length]).toLocaleString()}.`));
    items.forEach((i) => { const q = sum(i.qty, (v) => v); if (i.totalQty != null && Math.abs(q - i.totalQty) > 0.5) issues.push(I('warn', `Inventory “${i.name}” (row ${i.row}): warehouses add up to ${q.toLocaleString()} but total stock says ${i.totalQty.toLocaleString()}.`)); i.qty.forEach((qq, k) => { if (i.cost != null && Math.abs(qq * i.cost - i.val[k]) > Math.max(1, Math.abs(i.val[k]) * 0.01)) i._valBad = true; }); if (i.qty.some((v) => v < 0)) issues.push(I('warn', `Inventory “${i.name}” (row ${i.row}) has negative stock.`)); });
    const vb = items.filter((i) => i._valBad).length; if (vb) issues.push(I('warn', `${vb} inventory line(s) where quantity × average cost does not equal the value.`));
    const noCost = items.filter((i) => !i.cost && i.totalQty > 0).length; if (noCost) issues.push(I('warn', `${noCost} inventory line(s) have stock but no average cost.`));
    const dups = items.map((i) => i.code).filter((c, i, a) => c && a.indexOf(c) !== i); if (dups.length) issues.push(I('warn', `Duplicate item code(s) in the inventory count: ${[...new Set(dups)].slice(0, 5).join(', ')}.`));
    return { warehouses: wh.map((w) => ({ name: w.name, value: w.value })), total, items: items.map(({ _valBad, row, ...i }) => i) };
  }
  function parseABC(g, issues) {
    const hr = rowIdx(g, ['code', 'itemdiscription', 'stockonhand', 'classification']); if (hr < 0) return null; const items = []; let headTotal = null; for (let r = 0; r < hr; r++) { const v = (g[r] || []).find((x) => typeof x === 'number' && x > 1000); if (v) headTotal = v; }
    for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const n = txt(x[1]); if (!n || !txt(x[9])) continue; items.push({ code: txt(x[0]), name: n, unit: txt(x[2]), soh: num(x[3]), cost: num(x[4]), value: num(x[5]), share: num(x[6]), cum: num(x[8]), cls: txt(x[9]).toUpperCase() }); }
    const tot = sum(items, (i) => i.value); if (headTotal != null && Math.abs(tot - headTotal) > Math.max(5, headTotal * 0.0005)) issues.push(I('warn', `Item classification: values add up to ${Math.round(tot).toLocaleString()} but the sheet total is ${Math.round(headTotal).toLocaleString()}.`));
    const bad = items.filter((i) => i.soh != null && i.cost != null && i.value != null && Math.abs(i.soh * i.cost - i.value) > Math.max(1, i.value * 0.01)).length; if (bad) issues.push(I('warn', `${bad} classified item(s) where stock × cost does not equal value.`));
    let prev = 1; let unsorted = 0; items.forEach((i) => { if (i.value > prev + 1) unsorted++; prev = i.value; }); if (unsorted) issues.push(I('warn', `Item classification is not sorted by value (${unsorted} out-of-order line(s)); ABC classes may be wrong.`));
    const cls = {}; items.forEach((i) => { const o = (cls[i.cls] = cls[i.cls] || { n: 0, value: 0 }); o.n++; o.value += i.value || 0; }); Object.values(cls).forEach((o) => (o.share = tot ? o.value / tot : 0));
    const unknown = Object.keys(cls).filter((k) => !['A', 'B', 'C'].includes(k)); if (unknown.length) issues.push(I('warn', `Unexpected classification value(s): ${unknown.join(', ')}.`));
    return { items, classes: cls, total: tot };
  }

  /* ===================================================================== misc small tables */
  function parseStockHistory(g, issues) { // "Closing Stock Value" tables incl. 2025 history
    const out = []; for (let r = 0; r < g.length; r++) { const x = g[r] || []; const c = colIdx(x, 'month'); const s = colIdx(x, 'closingstockvalue'); const l = colIdx(x, 'logisticscost'); if (c >= 0 && (s >= 0 || l >= 0)) { const kind = s >= 0 ? 'stock' : 'logistics'; const vc = s >= 0 ? s : l; const sc = colIdx(x, 'sales'); for (let q = r + 1; q < g.length; q++) { const y = g[q] || []; const mm = monOf(y[c]); if (!mm) { if (/average/i.test(txt(y[c])) || !txt(y[c])) break; continue; } if (mm.y) out.push({ kind, y: mm.y, m: mm.m, v: num(y[vc]), sales: sc >= 0 ? num(y[sc]) : null, note: txt(y[colIdx(x, 'notes')]) }); } } }
    return out;
  }
  function parseBranches(g) { const out = []; g.forEach((x) => { const a = txt((x || [])[0]); if (/^(total|grand total)/i.test(a) && typeof x[1] === 'number') out.push({ label: a, n: x[1] }); }); return out; }
  function parseTrucks(g, issues) { const hr = rowIdx(g, ['sl', 'description', 'numberofbranches']); if (hr < 0) return null; const rows = []; for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; if (!txt(x[1])) { if (rows.length) break; continue; } rows.push({ desc: txt(x[1]), branches: num(x[2]), trips: num(x[3]), price: num(x[4]), ex: num(x[5]), vat: num(x[6]), inc: num(x[7]) }); } rows.forEach((x, i) => { if (x.trips != null && x.price != null && x.ex != null && Math.abs(x.trips * x.price - x.ex) > 1) issues.push(I('warn', `Truck line ${i + 1}: ${x.trips} × ${x.price} ≠ ${x.ex}.`)); if (x.ex != null && x.vat != null && Math.abs(x.ex * 0.15 - x.vat) > 1) issues.push(I('warn', `Truck line ${i + 1}: VAT ${x.vat} is not 15% of ${x.ex}.`)); }); return { rows, total: sum(rows, (x) => x.inc), totalEx: sum(rows, (x) => x.ex) }; }

  /* ===================================================================== analyze */
  const PARTS = ['scorecard', 'summary', 'dead', 'mugs', 'mugPlan', 'capacity', 'flow', 'logistics', 'weeklyShip', 'dailyShip', 'ordering', 'b2bProduct', 'b2bCustomer', 'inventory', 'abc', 'history', 'branches', 'trucks'];
  const LABEL = { scorecard: 'Scorecard (KPIs)', summary: 'Summary / stock value', dead: 'Dead stock dashboard', mugs: 'Mug SOH', mugPlan: 'Mug dispatch plan', capacity: 'Warehouse capacity', flow: 'Daily IN & OUT / productivity', logistics: 'Logistics cost', weeklyShip: 'Weekly shipments & emergencies', dailyShip: 'Daily on-time shipments', ordering: 'On-time ordering', b2bProduct: 'B2B by product', b2bCustomer: 'B2B by customer', inventory: 'Inventory count', abc: 'Item classification (ABC)', history: 'Stock value history', branches: 'Branches served', trucks: 'Truck trips' };
  const IGNORED = [{ re: /branch.*area.*management|area\s*manager/i, why: 'branch / area-manager / ROM contact list (contains personal phone numbers, not stored)' }];

  function analyze(wb, name, ov, template, existing, hash) {
    ov = ov || {}; existing = existing || []; template = template || {}; const issues = []; const data = {}; const found = {}; const ignored = [];
    // sheet-level hints (hidden sheets)
    const deferred = [];
    const hidden = new Set(((wb.Workbook && wb.Workbook.Sheets) || []).map((s, i) => (s.Hidden ? wb.SheetNames[i] : null)).filter(Boolean));
    const sheetIssues = {};
    wb.SheetNames.forEach((sn) => {
      const g = rowsOf(wb, sn); if (!g.length) return; const L = (key) => sheetHas(g, key);
      const take = (part, fn) => { if (data[part]) { issues.push(I('warn', `Two sheets look like “${LABEL[part]}” (“${found[part]}” and “${sn}”); the first is used.`)); return; } const sub = []; const r = fn(sub); if (r) { data[part] = r; found[part] = sn; sub.forEach((i) => issues.push({ ...i, msg: `[${sn.trim()}] ${i.msg}` })); } };
      if (rowIdx(g, ['category', 'goal', 'kpi', 'direction', 'weight']) >= 0) take('scorecard', (iss) => parseScorecard(g, iss));
      else if (rowIdx(g, ['metrics', 'performance']) >= 0 && rowIdx(g, ['month', 'closingstockvalue']) >= 0) take('summary', (iss) => parseSummary(g, iss));
      else if (L('deadstockexecutive') || L('totaldeadstock')) take('dead', () => parseDeadSheet(g));
      else if (L('dailymugsoh')) take('mugs', (iss) => parseMugs(g, iss));
      else if (rowIdx(g, ['item', 'beforedispatch']) >= 0) take('mugPlan', (iss) => parseMugPlan(g, iss));
      else if (L('warehousecapacity')) take('capacity', (iss) => parseCapacity(g, iss));
      else if (L('warehouse(dailyin')) take('flow', (iss) => parseFlow(g, iss));
      else if (L('logisticscosttosales')) take('logistics', (iss) => parseLogistics(g, iss));
      else if (L('warehouseshipment')) take('weeklyShip', (iss) => parseWeeklyShip(g, iss));
      else if (L('monthlyon-timeshipment') || rowIdx(g, ['s.n', 'dateofdelivery']) >= 0) take('dailyShip', (iss) => parseDailyShip(g, iss));
      else if (rowIdx(g, ['s.n', 'ordersystemdate']) >= 0) { deferred.push([sn, g]); }
      else if (L('b2bbyproduct')) take('b2bProduct', (iss) => parseB2BProduct(g, iss));
      else if (L('b2bsalesbycustomer')) take('b2bCustomer', (iss) => parseB2BCustomer(g, iss));
      else if (L('inventoryallware')) take('inventory', (iss) => parseInventory(g, iss));
      else if (rowIdx(g, ['code', 'itemdiscription', 'stockonhand', 'classification']) >= 0) take('abc', (iss) => parseABC(g, iss));
      else if (rowIdx(g, ['sl', 'description', 'numberofbranches']) >= 0) take('trucks', (iss) => parseTrucks(g, iss));
      else if (rowIdx(g, ['region', 'branch', 'areamanager']) >= 0) ignored.push(`“${sn.trim()}” (${IGNORED[0].why})`);
      else if (rowIdx(g, ['month', 'closingstockvalue', 'changevspreviousmonth']) >= 0) { const h = parseStockHistory(g); if (h.length) data.history = [...(data.history || []), ...h]; }
      else if (rowIdx(g, ['branch', 'no.ofbranches']) >= 0) take('branches', () => parseBranches(g));
      else if (rowIdx(g, ['region', 'branch']) >= 0 && g.length > 20 && g[0].length <= 3) ignored.push(`“${sn.trim()}” (plain branch list)`);
      else ignored.push(`“${sn.trim()}” (not recognised)`);
      if (hidden.has(sn)) sheetIssues[sn] = true;
    });
    if (!Object.keys(data).length) return { ds: null, issues: [I('error', 'This does not look like the Warehouse report (none of the expected sheets were recognised).')] };
    // which expected parts are missing
    const must = ['scorecard', 'summary', 'mugs', 'capacity', 'flow', 'logistics', 'inventory']; must.forEach((p) => { if (!data[p]) issues.push(I(p === 'mugs' ? 'error' : 'warn', `${LABEL[p]} not found in this file.`)); });
    ['dead', 'weeklyShip', 'dailyShip', 'b2bProduct', 'abc'].forEach((p) => { if (!data[p]) issues.push(I('warn', `${LABEL[p]} not found in this file.`)); });
    const hiddenUsed = Object.entries(found).filter(([, s]) => hidden.has(s)).map(([p]) => LABEL[p]); if (hiddenUsed.length) issues.push(I('info', `Hidden sheet(s) used: ${hiddenUsed.join(', ')}.`));
    if (ignored.length) issues.push(I('info', `Ignored: ${ignored.join('; ')}.`));
    // history merge: logistic history not needed; keep stock only
    // dates
    const mugDate = data.mugs && data.mugs.date; const wk = (data.weeklyShip || []).filter((w) => w.to).sort((a, b) => (a.to < b.to ? -1 : 1)).pop();
    const asOf = (ov.asOf && ov.asOf.date) || mugDate || (wk && wk.to) || null;
    deferred.forEach(([sn, g]) => { const sub = []; data.ordering = parseOrdering(g, sub, asOf); found.ordering = sn; sub.forEach((i) => issues.push({ ...i, msg: `[${sn.trim()}] ${i.msg}` })); });
    if (!asOf) issues.push({ level: 'error', msg: 'The report date could not be found. Enter it.', fix: { type: 'asOf', id: 'date', kind: 'date', label: 'Use this date' } });
    if (data.ordering === undefined && !data.ordering) { /* optional */ }
    if (asOf && wk && Math.abs((Date.parse(asOf) - Date.parse(wk.to)) / 86400000) > 7) issues.push(I('warn', `The report date (${asOf}) is more than a week after the latest shipment week (${wk.label.trim()}).`));
    const fnDate = (() => { const m = /(\d{1,2})[-_\s]*([A-Za-z]{3})[a-z]*[-_\s]*(20\d\d)/.exec(name); if (m) { const mi = MON.indexOf(m[2].toLowerCase()); if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`; } return null; })();
    if (fnDate && asOf && fnDate !== asOf) issues.push(I('warn', `The file name suggests ${fnDate} but the report content is dated ${asOf}.`));
    // report month (data months) and cross-sheet checks
    const lastM = data.scorecard && data.scorecard.lastMonth; const sm = data.summary && data.summary.monthly && data.summary.monthly.filter((x) => x.stock != null); const lastStock = sm && sm.length ? sm[sm.length - 1] : null;
    if (asOf && lastM && +asOf.slice(5, 7) - lastM > 1) issues.push(I('info', `Monthly data (scorecard, stock value, logistics) runs to ${MON[lastM - 1].toUpperCase()}; weekly data (mugs, shipments) to ${asOf}.`));
    if (data.summary) { const b = data.summary.breakdown; if (b.totalLabel && lastStock) { const mo = /([A-Za-z]{3})-?\d{2}/.exec(b.totalLabel); if (mo && MON.indexOf(mo[1].toLowerCase()) + 1 !== lastStock.m && /closing/i.test(b.totalLabel)) issues.push(I('warn', `The stock-value breakdown says “${b.totalLabel}” but the latest stock value row is for month ${lastStock.m} (${MON[lastStock.m - 1].toUpperCase()}).`)); }
      if (b.total != null && b.dead != null && b.healthy != null && Math.abs(b.total - b.dead - b.healthy) > 1) issues.push(I('warn', `Stock breakdown: total ${Math.round(b.total).toLocaleString()} − dead ${Math.round(b.dead).toLocaleString()} ≠ healthy ${Math.round(b.healthy).toLocaleString()}.`));
      if (b.dead != null && b.recoverable != null && b.writeoff != null && Math.abs(b.dead - b.recoverable - b.writeoff) > 1) issues.push(I('warn', `Dead stock ${Math.round(b.dead).toLocaleString()} ≠ recoverable ${Math.round(b.recoverable).toLocaleString()} + write-off ${Math.round(b.writeoff).toLocaleString()}.`));
      const ex = data.summary.expired; if (ex.length) { const s = sum(ex, (x) => x.value); const st = data.summary.expiredSubtotal; if (st && st.value != null && Math.abs(s - st.value) > 1) issues.push(I('warn', `Expired items add up to ${Math.round(s).toLocaleString()} but the subtotal says ${Math.round(st.value).toLocaleString()}.`)); const refs = [...new Set(ex.filter((x) => x.expiry && x.shelf != null).map((x) => addDays(x.expiry, -x.shelf)))]; if (refs.length === 1 && asOf && refs[0] !== asOf) issues.push(I('info', `Shelf-life days in the expired list were counted from ${refs[0]}, not from the report date ${asOf}; the dashboard recalculates them from ${asOf}.`)); }
      data.summary.monthly.forEach((x) => { if (x.sales && x.log != null && x.lr != null && Math.abs(x.log / x.sales - x.lr) > 0.002) issues.push(I('warn', `Summary ${MON[x.m - 1]}: logistics vs sales is ${x.lr} but ${Math.round(x.log).toLocaleString()} ÷ sales = ${(x.log / x.sales).toFixed(4)}.`)); if (x.sales && x.stock != null && x.sr != null && Math.abs(x.stock / x.sales - x.sr) > 0.01) issues.push(I('warn', `Summary ${MON[x.m - 1]}: stock value vs sales is ${x.sr} but ${(x.stock / x.sales).toFixed(3)} when calculated.`)); });
      const mm = data.summary.monthly.map((x) => x.m); const gaps = []; for (let i = 1; i < mm.length; i++) if (mm[i] !== mm[i - 1] + 1) gaps.push(`${mm[i - 1]}→${mm[i]}`); if (gaps.length) issues.push(I('warn', `Summary months are not consecutive (${gaps.join(', ')}).`)); }
    if (data.dead && data.summary) { const b = data.summary.breakdown; const ex = data.dead.exec; const tdead = ex.totaldeadstock && ex.totaldeadstock.value; if (tdead != null && b.dead != null && Math.abs(tdead - b.dead) > 1) issues.push(I('warn', `Dead stock total is ${Math.round(tdead).toLocaleString()} on the dead-stock sheet but ${Math.round(b.dead).toLocaleString()} on the summary sheet.`)); const bs = sum(data.dead.buckets, (x) => x.value); const risk = ex.valueatrisk && ex.valueatrisk.value; if (risk != null && data.dead.buckets.length && Math.abs(bs - risk) > 5) issues.push(I('warn', `Expiry buckets add up to ${Math.round(bs).toLocaleString()} but “Value at Risk” says ${Math.round(risk).toLocaleString()}.`)); const sp = sum(data.dead.split, (x) => x.value); if (data.dead.split.length && b.dead != null && Math.abs(sp - b.dead) > 5) issues.push(I('warn', `Recoverable + write-off (${Math.round(sp).toLocaleString()}) ≠ total dead stock (${Math.round(b.dead).toLocaleString()}).`)); const nl = ex.totaldeadstock && /(\d+)\s*stock lines/i.exec(ex.totaldeadstock.sub || ''); if (nl && b.lines != null && +nl[1] !== b.lines) issues.push(I('warn', `Dead-stock lines: ${nl[1]} on the dashboard but ${b.lines} on the summary sheet.`)); issues.push(I('info', 'The file gives dead-stock totals only (59 lines in total); there is no line-by-line dead-stock list except the 4 expired items.')); }
    if (data.inventory && data.summary && lastStock) { if (Math.abs(data.inventory.total - lastStock.stock) > Math.max(5, lastStock.stock * 0.0005)) issues.push(I('warn', `Inventory count total (${Math.round(data.inventory.total).toLocaleString()}) differs from the latest closing stock value (${Math.round(lastStock.stock).toLocaleString()}).`)); }
    if (data.abc && data.inventory && Math.abs(data.abc.total - data.inventory.total) > Math.max(5, data.inventory.total * 0.0005)) issues.push(I('warn', `Item classification total (${Math.round(data.abc.total).toLocaleString()}) differs from the inventory count total (${Math.round(data.inventory.total).toLocaleString()}).`));
    if (data.b2bCustomer && data.b2bProduct) { const a = data.b2bCustomer.grand, b = data.b2bProduct.grand; if (b && Math.abs(a - b) / b > 0.05) issues.push(I('warn', `B2B by customer adds up to SAR ${Math.round(a).toLocaleString()} but B2B by product adds up to SAR ${Math.round(b).toLocaleString()}${data.b2bCustomer.stale ? ` (the customer sheet is only updated “${data.b2bCustomer.stale}”)` : ''}.`)); }
    if (data.capacity && data.summary) { const m = data.summary.metrics.find((x) => /capacity/i.test(x.name)); if (m && data.capacity.total && data.capacity.total.u != null && Math.abs(m.value - data.capacity.total.u) > 0.02) issues.push(I('warn', `Summary says warehouse capacity used is ${(m.value * 100).toFixed(0)}% but the capacity sheet totals ${(data.capacity.total.u * 100).toFixed(1)}%.`)); }
    if (data.scorecard && data.dailyShip && data.dailyShip.orders) { const k = data.scorecard.kpis.find((x) => /otif/i.test(x.kpi)); const pct = data.dailyShip.onTime / data.dailyShip.orders; if (k && k.avg != null && Math.abs(k.avg - pct) > 0.005) issues.push(I('info', `Scorecard OTIF is ${(k.avg * 100).toFixed(1)}% but the on-time shipment sheet shows ${(pct * 100).toFixed(1)}% (${data.dailyShip.onTime.toLocaleString()} of ${data.dailyShip.orders.toLocaleString()} orders).`)); }
    if (data.scorecard && data.dead && data.summary) { const k = data.scorecard.kpis.find((x) => /slob/i.test(x.kpi)); const b = data.summary.breakdown; if (k && k.avg != null && b.total && b.dead != null) { const dp = b.dead / b.total; if (dp > 0.03 && k.avg >= 0.95) issues.push(I('warn', `Scorecard says ${(k.avg * 100).toFixed(0)}% of stock has no SLOB, yet dead stock is ${(dp * 100).toFixed(1)}% of stock value (${Math.round(b.dead).toLocaleString()} SAR). The two measures disagree.`)); } }
    if (data.scorecard && data.logistics && data.logistics.turnoverTotal) { const k = data.scorecard.kpis.find((x) => /turn/i.test(x.kpi)); const t = data.logistics.turnoverTotal.t; if (k && k.avg != null && t != null && Math.abs(k.avg - t) > 0.5) issues.push(I('warn', `RM turnover is ${t.toFixed(2)} (6 months) on the logistics sheet but ${k.avg} on the scorecard.`)); }
    if (data.mugPlan && data.mugs) { const s = data.mugPlan.totals.find((t) => /stanley/i.test(t.name)); const mt = data.mugs.totals.find((t) => t.section === 'Stanley'); if (s && mt && s.actual != null && mt.total != null && Math.abs(s.actual - mt.total) > 1) issues.push(I('warn', `Stanley mug actual SOH is ${s.actual.toLocaleString()} on the plan sheet but ${mt.total.toLocaleString()} on the Mug SOH report.`)); }
    // history from earlier uploads / duplicates
    existing.forEach((e) => { if (e.hash === hash) issues.push(I('warn', `This exact file was already uploaded (as of ${e.end}, on ${e.uploadedAt.slice(0, 10)}).`)); else if (asOf && e.end === asOf) issues.push(I('warn', `A Warehouse report dated ${asOf} already exists. Approving replaces it (the old version is kept in history).`)); else if (asOf && e.end > asOf) issues.push(I('warn', `A newer Warehouse report (${e.end}) already exists. This one is older.`)); });
    const prev = [...existing].sort((a, b) => (a.end < b.end ? 1 : -1)).find((e) => asOf && e.end < asOf);
    if (prev) { const pp = prev.data; if (pp.mugs && data.mugs) { const a = new Set(pp.mugs.items.map((i) => norm(i.name))), b = new Set(data.mugs.items.map((i) => norm(i.name))); const add = data.mugs.items.filter((i) => !a.has(norm(i.name))).map((i) => i.name), gone = pp.mugs.items.filter((i) => !b.has(norm(i.name))).map((i) => i.name); if (add.length) issues.push(I('info', `New mug(s) since ${prev.end}: ${add.join(', ')}.`)); if (gone.length) issues.push(I('warn', `Mug(s) missing compared with ${prev.end}: ${gone.join(', ')}.`)); }
      if (pp.capacity && data.capacity) { const a = pp.capacity.rows.map((x) => norm(x.wh)), b = data.capacity.rows.map((x) => norm(x.wh)); const gone = pp.capacity.rows.filter((x) => !b.includes(norm(x.wh))).map((x) => x.wh); if (gone.length) issues.push(I('warn', `Warehouse(s) missing from the capacity table compared with ${prev.end}: ${gone.join(', ')}.`)); }
      Object.keys(pp).forEach((p) => { if (!data[p] && PARTS.includes(p)) issues.push(I('warn', `“${LABEL[p]}” was in the previous report (${prev.end}) but is missing now.`)); }); }
    return { ds: { type: 'warehouse', start: asOf, end: asOf, data }, issues };
  }

  LM.warehouse = { analyze, LABEL, PARTS, MON };
})(typeof window !== 'undefined' ? window : globalThis);
