/* Bakery factory: factory project schedules (Gantt), new-product pipeline (NPD), daily production plan vs actual,
   machine purchase plan, risk register and food-safety issues. Four file kinds, recognised by content. No DOM. */
(function (root) {
  const LM = (root.LM = root.LM || {});
  const { norm, clean } = LM;
  const I = (level, msg, fix) => ({ level, msg, fix });
  const txt = (v) => (v == null ? '' : clean(v));
  const num = (v) => { if (typeof v === 'number') return isFinite(v) ? v : null; if (v == null) return null; const s = String(v).replace(/[,\s]/g, ''); if (s === '' || !/^-?\d*\.?\d+%?$/.test(s)) return null; return s.endsWith('%') ? Number(s.slice(0, -1)) / 100 : Number(s); };
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const addDays = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
  const serial = (v) => (typeof v === 'number' && v > 30000 && v < 70000 ? LM.parseDay(v) : null);
  const today = () => new Date().toISOString().slice(0, 10);
  const KINDS = { report: 'Factory report (project schedules and daily production)', machines: 'Machine purchase plan', risks: 'Risk assessments', food: 'Food safety issues' };

  /* ---------- recognition ---------- */
  function sheetKind(wb, sn) {
    const g = LM.engine.rowsOf(wb, sn).slice(0, 12);
    if (g.some((r) => (r || []).some((v) => norm(v) === 'wbs') && (r || []).some((v) => norm(v) === 'task'))) return 'gantt';
    const r0 = (g[0] || []).map((v) => norm(v)), r1 = (g[1] || []).map((v) => norm(v));
    if (r0[0] === 'product' && r1.some((v) => v === 'plan') && r1.some((v) => v.startsWith('actual'))) return 'production';
    if (g.some((r) => (r || []).some((v) => norm(v) === 'machinename') && (r || []).some((v) => norm(v).startsWith('unitprice')))) return 'machines';
    return null;
  }
  const tableKind = (rows) => { const h = (rows[0] || []).map((v) => norm(v)); if (h.includes('risk') && h.includes('priority')) return 'risks'; if (h.includes('issue') && (h.includes('actions') || h.includes('action'))) return 'food'; return null; };
  /** -> { kind, sheets? } or null.  rf = {wb,name} for spreadsheets, {slides,name} for decks */
  function detect(rf) {
    if (rf.slides) { const kinds = new Set(); rf.slides.forEach((s) => s.items.filter((i) => i.kind === 'table').forEach((t) => { const k = tableKind(t.rows); if (k) kinds.add(k); })); return kinds.size ? [...kinds][0] : null; }
    const ks = rf.wb.SheetNames.map((n) => sheetKind(rf.wb, n)); if (ks.includes('machines') && !ks.includes('gantt') && !ks.includes('production')) return 'machines'; if (ks.includes('gantt') || ks.includes('production')) return 'report'; return null;
  }

  /* ---------- Gantt sheets ---------- */
  function parseGantt(wb, sn, issues) {
    const g = LM.engine.rowsOf(wb, sn); const hr = g.findIndex((r) => (r || []).some((v) => norm(v) === 'wbs') && (r || []).some((v) => norm(v) === 'task')); const h = g[hr]; const ix = (re) => h.findIndex((v) => re.test(norm(v)));
    const c = { wbs: ix(/^wbs$/), task: ix(/^task$/), lead: ix(/^lead$/), pre: ix(/^predecessor$/), start: ix(/^start$/), end: ix(/^end$/), days: ix(/^days$/), done: ix(/done/), work: ix(/^workdays$/) };
    let title = ''; for (let r = 0; r < Math.min(hr, 4); r++) for (const v of g[r] || []) { const t = txt(v); if (t && !/vertex42|gantt chart template/i.test(t) && !title && /schedule|product|automation|project|factory|develop/i.test(t)) title = t; }
    const sub = (re) => { for (let r = 0; r < hr; r++) { const row = g[r] || []; const i = row.findIndex((v) => typeof v === 'string' && re.test(v)); if (i >= 0) return row.slice(i + 1).find((v) => v != null && v !== ''); } return null; };
    const projectStart = serial(sub(/project start date/i)); const lead = txt(sub(/project lead/i));
    const phases = []; let cur = null;
    for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const first = txt(x[c.wbs >= 0 ? c.wbs : 0]); if (/^template rows|^►|^see the help/i.test(first) || /^template rows/i.test(txt(x[0]))) break;
      const task = txt(x[c.task]); if (!task) continue; const st = serial(x[c.start]), en = serial(x[c.end]);
      if (!st && !en) { cur = { wbs: first, name: task.replace(/^\[|\]$/g, ''), tasks: [] }; phases.push(cur); continue; }
      if (!cur) { cur = { wbs: '', name: '(no phase)', tasks: [] }; phases.push(cur); }
      let pct = num(x[c.done]); cur.tasks.push({ wbs: first, row: r + 1, task, lead: txt(x[c.lead]), start: st, end: en, days: num(x[c.days]), workdays: num(x[c.work]), pct, predecessor: txt(x[c.pre]) }); }
    const isNpd = /new product|npd/i.test(title + ' ' + sn);
    return { sheet: sn, title: title || sn, kind: isNpd ? 'npd' : 'project', projectStart, lead, phases };
  }
  function checkGanttImpl(P, issues) {
    const T = P.phases.flatMap((p) => p.tasks.map((t) => ({ ...t, phase: p.name }))); const nm = `“${P.sheet}”`;
    const bad = T.filter((t) => !t.start || !t.end); if (bad.length) issues.push(I('warn', `${nm}: ${bad.length} task(s) without a start or end date: ${bad.slice(0, 4).map((t) => `${t.task} (row ${t.row})`).join('; ')}.`));
    const rev = T.filter((t) => t.start && t.end && t.end < t.start); if (rev.length) issues.push(I('warn', `${nm}: end date before start date: ${rev.slice(0, 4).map((t) => `${t.task} (row ${t.row})`).join('; ')}.`));
    const dd = T.filter((t) => t.start && t.end && t.days != null && Math.abs(days(t.start, t.end) - t.days) > 1 && Math.abs(days(t.start, t.end) + 1 - t.days) > 1); if (dd.length) issues.push(I('warn', `${nm}: the DAYS column does not match start and end for ${dd.length} task(s), e.g. ${dd.slice(0, 3).map((t) => `${t.task} (row ${t.row}: ${t.days} vs ${days(t.start, t.end)})`).join('; ')}.`));
    const pp = T.filter((t) => t.pct == null || t.pct < 0 || t.pct > 1); if (pp.length) issues.push(I('warn', `${nm}: % DONE missing or outside 0–100% for ${pp.length} task(s): ${pp.slice(0, 4).map((t) => `${t.task} (row ${t.row})`).join('; ')}.`));
    const empty = P.phases.filter((p) => !p.tasks.length); if (empty.length) issues.push(I('info', `${nm}: phase(s) with no tasks: ${empty.map((p) => p.name).join(', ')}.`));
    const noLead = T.filter((t) => !t.lead).length; if (noLead && noLead === T.length) issues.push(I('info', `${nm}: no task has a lead; accountability per task cannot be shown.`));
    if (T.every((t) => !t.predecessor)) issues.push(I('info', `${nm}: no task has a predecessor, so dependencies are not tracked in the file.`));
    if (P.kind === 'npd') { const names = {}; P.phases.forEach((p) => { const k = norm(p.name); (names[k] = names[k] || []).push(p.name); }); Object.values(names).filter((a) => a.length > 1).forEach((a) => issues.push(I('warn', `${nm}: the product “${a[0]}” appears ${a.length} times; check whether it is a re-launch or a duplicate.`)));
      P.phases.forEach((p) => { const k = p.tasks.filter((t) => /concept/i.test(t.task)).length; if (k > 1) issues.push(I('warn', `${nm}: “${p.name}” has ${p.tasks.length} stages and the stage list repeats ${k} times (rows ${p.tasks[0].row}–${p.tasks[p.tasks.length - 1].row}). A product name row is probably missing; the repeated block is shown as a separate unnamed product.`)); }); }
  }
  /** split a product phase whose stage list repeats (missing product header row) */
  function splitRepeats(P) { if (P.kind !== 'npd') return; const out = []; P.phases.forEach((p) => { let blocks = [[]]; p.tasks.forEach((t) => { if (/concept/i.test(t.task) && blocks[blocks.length - 1].some((x) => /concept/i.test(x.task))) blocks.push([]); blocks[blocks.length - 1].push(t); }); blocks.forEach((b, i) => out.push({ ...p, name: i ? `(unnamed product after “${p.name}”)` : p.name, tasks: b, unnamed: !!i })); }); P.phases = out; }

  /* ---------- daily production sheets ---------- */
  function parseProduction(wb, sn, issues) {
    const g = LM.engine.rowsOf(wb, sn); const r0 = g[0] || [], r1 = g[1] || []; const dateCols = r0.map((v, i) => [i, serial(v)]).filter(([, d]) => d); if (!dateCols.length) return null;
    const width = dateCols.length > 1 ? dateCols[1][0] - dateCols[0][0] : 3; const lab = (s) => { const t = norm(s); return /yesterday/.test(t) ? 'remYesterday' : /remainingfromtoday|remainingtoday/.test(t) ? 'remToday' : /deliver/.test(t) ? 'delivery' : /adher/.test(t) ? 'adherence' : /^actual/.test(t) ? 'actual' : /^plan$/.test(t) ? 'plan' : null; };
    const off = {}; for (let k = 0; k < width; k++) { const l = lab(r1[dateCols[0][0] + k]); if (l) off[l] = k; }
    const lastDate = dateCols[dateCols.length - 1][0]; const tot = {}; for (let i = lastDate + width; i < r1.length; i++) { const l = lab(r1[i]); if (l && tot[l] == null) tot[l] = i; }
    const first = serial(r0[dateCols[0][0]]); const month = first.slice(0, 7); const factory = txt(sn).replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi, '').replace(/\b\d{2,4}\b/g, '').replace(/\s+/g, ' ').trim() || sn;
    const products = []; let totalRow = null; const support = {}; const stray = []; let endProducts = false;
    for (let r = 2; r < g.length; r++) { const x = g[r] || []; const name = txt(x[0]); const hasNum = x.slice(1).some((v) => typeof v === 'number');
      if (!name && !hasNum) continue; const s = norm(name);
      if (/^total$/.test(s) || (!name && !endProducts && products.length && hasNum)) { totalRow = x; endProducts = true; continue; }
      if (/workers/.test(s)) { support.workers = x; endProducts = true; continue; } if (/overtime/.test(s)) { support.overtime = x; continue; } if (/workinghours/.test(s)) { support.hours = x; continue; } if (/productionrate/.test(s)) { support.rate = x; continue; }
      if (endProducts) { if (hasNum) stray.push({ row: r + 1, name, values: x.filter((v) => typeof v === 'number').slice(0, 5) }); continue; }
      if (name) products.push({ name, row: r + 1, x }); }
    const col = (x, k, i) => (off[k] == null ? null : num(x[dateCols[i][0] + off[k]])); const series = (x, k) => dateCols.map((_, i) => col(x, k, i));
    const out = { sheet: sn, factory, month, unit: products.some((p) => /liter/i.test(p.name)) ? 'liters' : 'units', dates: dateCols.map(([, d]) => d), extras: Object.keys(off).filter((k) => !['plan', 'actual', 'adherence'].includes(k)), stray,
      products: products.map((p) => ({ name: p.name.replace(/\s+/g, ' '), row: p.row, plan: series(p.x, 'plan'), actual: series(p.x, 'actual'), adherence: series(p.x, 'adherence'), rem: off.remToday != null ? series(p.x, 'remToday') : null, delivery: off.delivery != null ? series(p.x, 'delivery') : null, monthPlan: tot.plan != null ? num(p.x[tot.plan]) : null, monthActual: tot.actual != null ? num(p.x[tot.actual]) : null })),
      total: totalRow ? { plan: series(totalRow, 'plan'), actual: series(totalRow, 'actual'), monthPlan: tot.plan != null ? num(totalRow[tot.plan]) : null, monthActual: tot.actual != null ? num(totalRow[tot.actual]) : null } : null,
      support: { workers: support.workers ? series(support.workers, 'plan') : null, overtime: support.overtime ? series(support.overtime, 'plan') : null, hours: support.hours ? series(support.hours, 'plan') : null, rate: support.rate ? series(support.rate, 'plan') : null }, supportTotals: {} };
    ['workers', 'overtime', 'hours', 'rate'].forEach((k) => { if (support[k] && tot.plan != null) out.supportTotals[k] = num(support[k][tot.plan]); });
    return out;
  }
  function reportedDays(F) { return F.dates.map((d, i) => ({ d, i, plan: F.total ? F.total.plan[i] : sum(F.products, (p) => p.plan[i]), actual: F.total ? F.total.actual[i] : sum(F.products, (p) => p.actual[i]) })).filter((x) => (x.actual || 0) > 0); }
  function checkProduction(F, issues) {
    const nm = `“${F.sheet}”`; const rd = reportedDays(F); const [y, m] = F.month.split('-').map(Number); const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (F.dates.length !== dim) issues.push(I('warn', `${nm}: the sheet has ${F.dates.length} date columns but ${F.month} has ${dim} days${F.dates.length < dim ? ` (missing ${addDays(F.dates[F.dates.length - 1], 1)} onwards)` : ''}.`));
    for (let i = 1; i < F.dates.length; i++) if (days(F.dates[i - 1], F.dates[i]) !== 1) { issues.push(I('warn', `${nm}: dates are not consecutive at ${F.dates[i - 1]} → ${F.dates[i]}.`)); break; }
    if (!rd.length) { issues.push(I('warn', `${nm}: no day has any actual production yet.`)); return; }
    const last = rd[rd.length - 1].d; const gaps = F.dates.filter((d, i) => d < last && !rd.find((x) => x.d === d)); if (gaps.length) issues.push(I('warn', `${nm}: no production recorded on ${gaps.slice(0, 5).join(', ')} although later days have data.`));
    // totals vs sum of products
    if (F.total) { const bad = rd.filter((x) => { const sp = sum(F.products, (p) => p.plan[x.i]), sa = sum(F.products, (p) => p.actual[x.i]); return Math.abs(sa - x.actual) > Math.max(1, x.actual * 0.002) || Math.abs(sp - x.plan) > Math.max(1, x.plan * 0.002); }); if (bad.length) issues.push(I('warn', `${nm}: the Total row differs from the sum of the products on ${bad.length} day(s): ${bad.slice(0, 4).map((x) => `${x.d} (total ${Math.round(x.actual)} vs ${Math.round(sum(F.products, (p) => p.actual[x.i]))})`).join('; ')}.`)); }
    const mp = F.products.filter((p) => p.monthActual != null && Math.abs(sum(p.actual, (v) => v) - p.monthActual) > Math.max(1, p.monthActual * 0.002)); if (mp.length) issues.push(I('warn', `${nm}: the month total differs from the sum of the days for ${mp.slice(0, 4).map((p) => `${p.name} (${Math.round(p.monthActual)} vs ${Math.round(sum(p.actual, (v) => v))})`).join('; ')}.`));
    const adh = []; F.products.forEach((p) => rd.forEach((x) => { const pl = p.plan[x.i], ac = p.delivery ? p.delivery[x.i] : p.actual[x.i], ad = p.adherence[x.i]; if (typeof ad === 'number' && pl > 0 && ac != null && Math.abs(ac / pl - ad) > 0.01) adh.push(`${p.name} ${x.d}`); })); if (adh.length) issues.push(I('warn', `${nm}: plan adherence differs from ${F.products.some((p) => p.delivery) ? 'delivery to branches' : 'actual'} ÷ plan on ${adh.length} cell(s), e.g. ${adh.slice(0, 3).join('; ')}.`));
    const noAct = []; F.products.forEach((p) => rd.forEach((x) => { if ((p.plan[x.i] || 0) > 0 && !(p.actual[x.i] > 0)) noAct.push(`${p.name} ${x.d}`); })); if (noAct.length) issues.push(I('warn', `${nm}: planned but nothing produced for ${noAct.length} product-day(s), e.g. ${noAct.slice(0, 3).join('; ')}.`));
    const noPlan = []; F.products.forEach((p) => rd.forEach((x) => { if (!((p.plan[x.i] || 0) > 0) && p.actual[x.i] > 0) noPlan.push(`${p.name} ${x.d}`); })); if (noPlan.length) issues.push(I('warn', `${nm}: produced without a plan for ${noPlan.length} product-day(s), e.g. ${noPlan.slice(0, 3).join('; ')}.`));
    const off = rd.filter((x) => x.plan > 0 && (x.actual / x.plan < 0.95 || x.actual / x.plan > 1.05)); if (off.length) issues.push(I('info', `${nm}: total adherence outside 95–105% on ${off.length} day(s): ${off.slice(0, 4).map((x) => `${x.d} ${Math.round((x.actual / x.plan) * 100)}%`).join(', ')}.`));
    const s = F.support; if (s.workers) { const miss = rd.filter((x) => !(s.workers[x.i] > 0)); if (miss.length) issues.push(I('warn', `${nm}: no worker count on ${miss.length} day(s) with production: ${miss.slice(0, 4).map((x) => x.d).join(', ')}.`)); } else issues.push(I('warn', `${nm}: the “No. of workers” row was not found.`));
    if (s.hours && s.rate) { const bad = rd.filter((x) => s.hours[x.i] > 0 && s.rate[x.i] != null && Math.abs(x.actual / s.hours[x.i] - s.rate[x.i]) > Math.max(0.5, s.rate[x.i] * 0.02)); if (bad.length) issues.push(I('info', `${nm}: production rate differs from actual ÷ working hours on ${bad.length} day(s).`)); }
    if (F.stray.length) issues.push(I('info', `${nm}: unlabelled numbers below the table (row ${F.stray.map((s2) => s2.row).join(', ')}: ${F.stray[0].values.join(', ')}) were ignored.`));
    const zeroP = F.products.filter((p) => !sum(p.plan, (v) => v) && !sum(p.actual, (v) => v)); if (zeroP.length) issues.push(I('info', `${nm}: ${zeroP.length} product(s) have no plan or production this month: ${zeroP.map((p) => p.name).join(', ')}.`));
  }

  /* ---------- machine purchase plan ---------- */
  function parseMachines(wb, issues) {
    const sn = wb.SheetNames.find((n) => sheetKind(wb, n) === 'machines'); const g = LM.engine.rowsOf(wb, sn); const hr = g.findIndex((r) => (r || []).some((v) => norm(v) === 'machinename')); const h = g[hr].map((v) => norm(v));
    const ix = (...re) => h.findIndex((v) => re.some((r) => r.test(v))); const c = { name: ix(/^machinename$/), desc: ix(/^description$/), purpose: ix(/purpose/), dept: ix(/^department$/), qty: ix(/^qty$/), unit: ix(/^unitprice/), total: ix(/^total/), supplier: ix(/^supplier/), offer: ix(/^offer/), rfq: ix(/^rfq/), pr: ix(/^pr/), pay: ix(/^payment/), notes: ix(/^notes?$/) };
    const rows = []; let stated = null; for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const name = txt(x[c.name]); if (/^total/i.test(name)) { stated = num(x[c.total]); continue; } if (!name) continue;
      rows.push({ row: r + 1, name, desc: txt(x[c.desc]), purpose: txt(x[c.purpose]), dept: txt(x[c.dept]), qty: num(x[c.qty]), unit: num(x[c.unit]), total: num(x[c.total]), supplier: txt(x[c.supplier]), offer: txt(x[c.offer]), rfq: txt(x[c.rfq]), pr: txt(x[c.pr]), pay: txt(x[c.pay]), notes: txt(x[c.notes]) }); }
    return { sheet: sn, rows, stated };
  }
  function checkMachines(M, issues, template) {
    const R = M.rows; const calc = sum(R, (x) => x.total); if (M.stated != null && Math.abs(calc - M.stated) > Math.max(1, M.stated * 0.001)) issues.push(I('warn', `The total row says SAR ${Math.round(M.stated).toLocaleString()} but the lines add up to SAR ${Math.round(calc).toLocaleString()}.`));
    const mm = R.filter((x) => x.qty != null && x.unit != null && x.total != null && Math.abs(x.qty * x.unit - x.total) > Math.max(1, x.total * 0.01)); if (mm.length) issues.push(I('warn', `${mm.length} line(s) where quantity × unit price is not the total: ${mm.slice(0, 5).map((x) => `${x.name.trim()} (${x.qty} × ${x.unit} = ${Math.round(x.qty * x.unit).toLocaleString()} vs ${Math.round(x.total).toLocaleString()}, row ${x.row})`).join('; ')}.`));
    const miss = (k, l) => { const a = R.filter((x) => x[k] == null || x[k] === ''); if (a.length) issues.push(I('warn', `${a.length} line(s) have no ${l}: ${a.slice(0, 5).map((x) => x.name.trim()).join('; ')}${a.length > 5 ? '…' : ''}.`)); };
    miss('qty', 'quantity'); miss('unit', 'unit price'); miss('supplier', 'supplier'); miss('rfq', 'RFQ status'); miss('dept', 'department');
    const seen = {}; R.forEach((x) => (seen[norm(x.name)] = (seen[norm(x.name)] || []).concat(x))); Object.values(seen).filter((a) => a.length > 1).forEach((a) => issues.push(I('warn', `“${a[0].name.trim()}” is listed ${a.length} times (rows ${a.map((x) => x.row).join(', ')}; quantities ${a.map((x) => x.qty).join(' + ')}, unit prices ${a.map((x) => x.unit).join(' / ')}). Is it one order split in two, or a duplicate?`)));
    const appr = R.filter((x) => /^approved/i.test(x.rfq)); const noPr = appr.filter((x) => !x.pr); if (noPr.length) issues.push(I('warn', `${noPr.length} approved line(s) have no PR / PO number: ${noPr.slice(0, 4).map((x) => x.name.trim()).join('; ')}.`));
    const noPay = appr.filter((x) => /^PO/i.test(x.pr.trim()) && !x.pay); if (noPay.length) issues.push(I('info', `${noPay.length} approved PO(s) have no payment request or payment status yet (SAR ${Math.round(sum(noPay, (x) => x.total)).toLocaleString()}).`));
    const pendRecv = R.filter((x) => /pending/i.test(x.rfq) && /receiv/i.test(x.notes)); if (pendRecv.length) issues.push(I('warn', `${pendRecv.length} line(s) are “Pending approval” but the notes say “waiting for receiving”: ${pendRecv.map((x) => x.name.trim()).join('; ')}.`));
    const planned = R.filter((x) => /^planned/i.test(x.rfq) && x.total); if (planned.length) issues.push(I('info', `${planned.length} planned line(s) with a price but no approval yet (SAR ${Math.round(sum(planned, (x) => x.total)).toLocaleString()}); ${R.filter((x) => /^planned/i.test(x.rfq) && !x.total).length} planned line(s) have no price yet.`));
    const sts = [...new Set(R.map((x) => x.rfq).filter(Boolean))]; const known = template.knownRfq || []; if (known.length) { const nw = sts.filter((s) => !known.includes(s)); if (nw.length) issues.push(I('warn', `New RFQ status value(s): ${nw.join(', ')}.`)); }
    const noOffer = R.filter((x) => !x.offer).length; if (noOffer === R.length) issues.push(I('info', 'The “Offer attached” column is empty for every line.'));
    const pend = R.filter((x) => /pending/i.test(x.rfq)); if (pend.length) issues.push(I('info', `${pend.length} line(s) are still pending approval (SAR ${Math.round(sum(pend, (x) => x.total)).toLocaleString()}).`));
  }

  /* ---------- decks (risks, food safety) ---------- */
  function parseDeckTables(slides, kind) {
    const rows = []; slides.forEach((s) => s.items.filter((i) => i.kind === 'table').forEach((t) => { if (tableKind(t.rows) !== kind) return; const h = t.rows[0].map((v) => norm(v)); const ix = (re) => h.findIndex((v) => re.test(v));
      const c = kind === 'risks' ? { risk: ix(/^risk$/), priority: ix(/^priority$/), desc: ix(/^description$/), owner: ix(/^owner$/), status: ix(/^status$/), notes: ix(/^notes?$/) } : { issue: ix(/^issue$/), desc: ix(/^description$/), actions: ix(/^actions?$/) };
      t.rows.slice(1).forEach((r) => { const o = {}; Object.entries(c).forEach(([k, i]) => { o[k] = i >= 0 ? txt(r[i]).replace(/\s+/g, ' ') : ''; }); if (Object.values(o).some(Boolean)) rows.push({ ...o, slide: s.n }); }); })); return rows;
  }
  const PRI = ['High', 'Medium', 'Low'];
  function checkDeck(kind, rows, slides, issues, template) {
    if (!rows.length) issues.push(I('warn', 'The table has no rows.'));
    if (kind === 'risks') { const bad = rows.filter((r) => !PRI.some((p) => p.toLowerCase() === r.priority.toLowerCase())); if (bad.length) issues.push(I('warn', `${bad.length} risk(s) with a priority that is not High / Medium / Low: ${bad.map((r) => `${r.risk} (“${r.priority || 'empty'}”)`).slice(0, 4).join('; ')}.`));
      const noOwner = rows.filter((r) => !r.owner); if (noOwner.length) issues.push(I('warn', `${noOwner.length} risk(s) have no owner: ${noOwner.map((r) => r.risk).join('; ')}.`)); const noStatus = rows.filter((r) => !r.status); if (noStatus.length) issues.push(I('warn', `${noStatus.length} risk(s) have no status.`));
      const trunc = rows.filter((r) => /…|\.\.\.\s*$/.test(`${r.desc} ${r.notes}`)); if (trunc.length) issues.push(I('warn', `The text is cut off with “…” in: ${trunc.map((r) => r.risk).join('; ')}. The full wording is missing in the deck.`));
      const noNote = rows.filter((r) => !r.notes); if (noNote.length) issues.push(I('info', `${noNote.length} risk(s) have no notes or mitigation: ${noNote.map((r) => r.risk).join('; ')}.`));
      const owners = [...new Set(rows.map((r) => r.owner).filter(Boolean))]; const ab = owners.filter((o) => owners.some((p) => p !== o && p.toLowerCase().startsWith(o.toLowerCase().slice(0, 2)) && p.length > o.length && /^[A-Z]{2,4}$/.test(o))); if (ab.length) issues.push(I('info', `Owner appears both abbreviated and in full (${owners.join(', ')}); “GR” is read as “Government relation”.`));
      const dup = {}; rows.forEach((r) => (dup[norm(r.risk)] = (dup[norm(r.risk)] || 0) + 1)); Object.entries(dup).filter(([, n]) => n > 1).forEach(([k]) => issues.push(I('warn', `Risk “${rows.find((r) => norm(r.risk) === k).risk}” is listed more than once.`)));
      const known = template.knownPriorities || []; void known; }
    else { const noAct = rows.filter((r) => !r.actions); if (noAct.length) issues.push(I('warn', `${noAct.length} food-safety issue(s) have no action: ${noAct.map((r) => r.issue).join('; ')}.`)); const noDesc = rows.filter((r) => !r.desc); if (noDesc.length) issues.push(I('warn', `${noDesc.length} issue(s) have no description.`)); issues.push(I('info', 'The deck has no date, severity, owner or closing status for food-safety issues, so these cannot be tracked from the file.')); }
    const other = slides.filter((s) => !s.items.some((i) => i.kind === 'table') && s.items.some((i) => i.kind === 'text' && i.text.length > 40)); if (other.length) issues.push(I('info', `Slide(s) ${other.map((s) => s.n).join(', ')} contain text outside the table that is not read.`));
    const pics = slides.filter((s) => s.pics > 0); if (pics.length) issues.push(I('warn', `Slide(s) ${pics.map((s) => s.n).join(', ')} contain pictures that cannot be read.`));
  }

  /* ---------- analyze ---------- */
  /** rf: {wb,name,hash} or {slides,name,hash}; existing = datasets of this kind; returns {kind, ds, issues} */
  function analyze(rf, existing, template, ov, batchEnd) {
    ov = ov || {}; existing = existing || []; template = template || {}; const issues = []; const kind = detect(rf); if (!kind) return { kind: null, ds: null, issues: [I('error', 'This is not one of the bakery factory files (factory report, machine purchase plan, risk assessments or food safety issues).')] };
    let data = null, defEnd = null;
    if (kind === 'report') { const P = [], F = []; rf.wb.SheetNames.forEach((sn) => { const k = sheetKind(rf.wb, sn); if (k === 'gantt') { const p = parseGantt(rf.wb, sn, issues); if (p.phases.length) { checkGanttImpl(p, issues); splitRepeats(p); P.push(p); } else issues.push(I('warn', `Sheet “${sn}” looks like a schedule but no tasks were found.`)); } else if (k === 'production') { const f = parseProduction(rf.wb, sn, issues); if (f) { checkProduction(f, issues); F.push(f); } } else issues.push(I('info', `Sheet “${sn}” was not recognised and is ignored.`)); });
      if (!P.length) issues.push(I('warn', 'No project schedule (Gantt) sheet was found.')); if (!F.length) issues.push(I('warn', 'No daily production sheet was found.'));
      const fac = F.map((f) => f.factory); const dupF = fac.filter((f, i) => fac.indexOf(f) !== i && F[i].month === F[fac.indexOf(f)].month); if (dupF.length) issues.push(I('warn', `Two production sheets for the same factory and month: ${[...new Set(dupF)].join(', ')}.`));
      const lastDays = F.map((f) => { const r = reportedDays(f); return r.length ? r[r.length - 1].d : null; }).filter(Boolean).sort(); defEnd = lastDays.length ? lastDays[lastDays.length - 1] : null;
      if (F.length > 1) { const ls = F.map((f) => { const r = reportedDays(f); return [f.factory, r.length ? r[r.length - 1].d : null]; }); if (new Set(ls.map((x) => x[1])).size > 1) issues.push(I('info', `Production is reported up to different days: ${ls.map((x) => `${x[0]} ${x[1] || 'no data'}`).join(', ')}.`)); }
      data = { projects: P.filter((p) => p.kind === 'project'), npd: P.find((p) => p.kind === 'npd') || null, production: F }; }
    else if (kind === 'machines') { const M = parseMachines(rf.wb, issues); checkMachines(M, issues, template); data = M; }
    else { const rows = parseDeckTables(rf.slides, kind); checkDeck(kind, rows, rf.slides, issues, template); data = { rows, slides: rf.slides.length }; }
    const asOf = ov.asOf && ov.asOf.date ? ov.asOf.date : null;
    if (!asOf) issues.push({ level: 'error', msg: `The file has no report date. Enter the date this ${kind === 'report' ? 'factory report' : kind === 'machines' ? 'purchase plan' : kind === 'risks' ? 'risk list' : 'issue list'} is as of${kind === 'report' && defEnd ? ' (the last day with production is suggested)' : batchEnd ? ' (the date used for the other files in this upload is suggested)' : ''}.`, fix: { type: 'asOf', id: 'date', kind: 'date', label: 'Use this date', value: batchEnd || defEnd || today() } });
    existing.forEach((e) => { if (e.hash === rf.hash) issues.push(I('warn', `This exact file was already uploaded (${e.end}).`)); else if (asOf && e.end === asOf) issues.push(I('warn', `A ${KINDS[kind].toLowerCase()} for ${asOf} already exists. Approving replaces it (the old one is kept in history).`)); else if (asOf && e.end > asOf) issues.push(I('warn', `A newer one (${e.end}) already exists.`)); });
    const prev = asOf ? [...existing].sort((a, b) => (a.end < b.end ? 1 : -1)).find((e) => e.end < asOf) : null;
    if (prev) compareWithPrevious(kind, data, prev, issues);
    return { kind, ds: asOf ? { type: 'bakery-' + kind, start: asOf, end: asOf, data } : null, issues, defEnd };
  }
  function compareWithPrevious(kind, d, prev, issues) {
    const p = prev.data; if (kind === 'risks') { const a = new Map(p.rows.map((r) => [norm(r.risk), r])); const added = d.rows.filter((r) => !a.has(norm(r.risk))), gone = p.rows.filter((r) => !d.rows.find((x) => norm(x.risk) === norm(r.risk))), ch = d.rows.filter((r) => a.has(norm(r.risk)) && (a.get(norm(r.risk)).status !== r.status || a.get(norm(r.risk)).priority !== r.priority)); if (added.length) issues.push(I('info', `${added.length} new risk(s) since ${prev.end}: ${added.map((r) => r.risk).join('; ')}.`)); if (gone.length) issues.push(I('info', `${gone.length} risk(s) no longer listed since ${prev.end}: ${gone.map((r) => r.risk).join('; ')}.`)); if (ch.length) issues.push(I('info', `${ch.length} risk(s) changed status or priority since ${prev.end}.`)); }
    else if (kind === 'food') { const a = new Set(p.rows.map((r) => norm(r.issue + r.desc))); const added = d.rows.filter((r) => !a.has(norm(r.issue + r.desc))); if (added.length) issues.push(I('info', `${added.length} new food-safety issue(s) since ${prev.end}.`)); }
    else if (kind === 'machines') { const a = new Map(p.rows.map((r) => [norm(r.name) + '|' + r.qty, r])); const ch = d.rows.filter((r) => a.has(norm(r.name) + '|' + r.qty) && a.get(norm(r.name) + '|' + r.qty).rfq !== r.rfq); const added = d.rows.filter((r) => !a.has(norm(r.name) + '|' + r.qty)); if (ch.length) issues.push(I('info', `${ch.length} machine line(s) changed RFQ status since ${prev.end}.`)); if (added.length) issues.push(I('info', `${added.length} machine line(s) are new or changed in quantity since ${prev.end}.`)); }
    else if (kind === 'report' && d.projects && p.projects) { const prog = (P) => { const T = P.phases.flatMap((x) => x.tasks); const w = sum(T, (t) => t.days || 1); return w ? sum(T, (t) => (t.pct || 0) * (t.days || 1)) / w : 0; }; d.projects.forEach((P) => { const o = p.projects.find((x) => x.sheet === P.sheet); if (o) { const a = prog(o), b = prog(P); if (b < a - 0.005) issues.push(I('warn', `${P.sheet}: progress went down from ${Math.round(a * 100)}% to ${Math.round(b * 100)}% since ${prev.end}.`)); } }); }
  }

  /* ---------- analytics ---------- */
  const taskStatus = (t, asOf) => (t.pct >= 1 ? 'Done' : t.end && t.end < asOf ? 'Overdue' : t.start && t.start > asOf && !(t.pct > 0) ? 'Not started' : t.pct > 0 || (t.start && t.start <= asOf) ? 'In progress' : 'Not started');
  function projectStats(P, asOf) { const T = P.phases.flatMap((p) => p.tasks.map((t) => ({ ...t, phase: p.name, status: taskStatus(t, asOf) }))); const w = sum(T, (t) => t.days || 1); const phases = P.phases.map((p) => { const L = T.filter((t) => t.phase === p.name && P.phases.indexOf(p) >= 0); const ww = sum(L, (t) => t.days || 1); const st = L.map((t) => t.start).filter(Boolean).sort(), en = L.map((t) => t.end).filter(Boolean).sort(); return { name: p.name, wbs: p.wbs, n: L.length, pct: ww ? sum(L, (t) => (t.pct || 0) * (t.days || 1)) / ww : 0, start: st[0] || null, end: en[en.length - 1] || null, overdue: L.filter((t) => t.status === 'Overdue').length, done: L.filter((t) => t.status === 'Done').length, tasks: L }; });
    const st = T.map((t) => t.start).filter(Boolean).sort(), en = T.map((t) => t.end).filter(Boolean).sort(); return { sheet: P.sheet, title: P.title, lead: P.lead, projectStart: P.projectStart, pct: w ? sum(T, (t) => (t.pct || 0) * (t.days || 1)) / w : 0, start: st[0] || null, end: en[en.length - 1] || null, n: T.length, done: T.filter((t) => t.status === 'Done').length, inProgress: T.filter((t) => t.status === 'In progress'), overdue: T.filter((t) => t.status === 'Overdue'), notStarted: T.filter((t) => t.status === 'Not started').length, phases, tasks: T }; }
  function npdStats(N, asOf) { const prods = N.phases.map((p) => { const T = p.tasks.map((t) => ({ ...t, status: taskStatus(t, asOf) })); const launch = T.find((t) => /launching/i.test(t.task) && !/trial/i.test(t.task)) || T[T.length - 1]; const next = T.find((t) => !(t.pct >= 1)); const pct = T.length ? sum(T, (t) => Math.min(1, t.pct || 0)) / T.length : 0; const launched = launch && launch.pct >= 1; const started = T.some((t) => t.pct > 0);
      const status = launched ? 'Launched' : launch && launch.end && launch.end < asOf ? 'Overdue' : started ? 'In progress' : T[0] && T[0].start && T[0].start > asOf ? 'Planned' : 'Not started'; const lateDays = status === 'Overdue' ? days(launch.end, asOf) : 0;
      const st = T.map((t) => t.start).filter(Boolean).sort(); return { name: p.name, unnamed: !!p.unnamed, n: T.length, pct, status, launchDate: launch ? launch.end : null, lateDays, next: next ? next.task.trim() : '', nextEnd: next ? next.end : null, start: st[0] || null, tasks: T }; }); return { products: prods }; }
  function productionStats(F, asOf) { const rd = reportedDays(F); const n = rd.length; const mp = sum(rd, (x) => x.plan), ma = sum(rd, (x) => x.actual); const idx = rd.map((x) => x.i); const products = F.products.map((p) => { const pl = sum(idx, (i) => p.plan[i]), ac = sum(idx, (i) => p.actual[i]); return { name: p.name, plan: pl, actual: ac, adherence: pl ? ac / pl : null, diff: ac - pl, share: ma ? ac / ma : 0, daysBelow: idx.filter((i) => p.plan[i] > 0 && p.actual[i] / p.plan[i] < 0.95).length }; }); const sp = F.support; const wk = sp.workers ? sum(idx, (i) => sp.workers[i]) : null, hr = sp.hours ? sum(idx, (i) => sp.hours[i]) : null, ot = sp.overtime ? sum(idx, (i) => sp.overtime[i]) : null; const best = [...rd].sort((a, b) => b.actual - a.actual)[0], worst = [...rd].sort((a, b) => a.actual - b.actual)[0]; const lastD = n ? rd[n - 1] : null;
    return { factory: F.factory, month: F.month, unit: F.unit, days: n, lastDay: lastD ? lastD.d : null, plan: mp, actual: ma, adherence: mp ? ma / mp : null, avgDaily: n ? ma / n : 0, products, rd, workersAvg: n && wk != null ? wk / n : null, hours: hr, overtime: ot, rate: hr ? ma / hr : null, best, worst, dates: F.dates }; }
  function machineStats(M) { const R = M.rows; const grp = (f) => { const m = {}; R.forEach((x) => { const k = f(x) || '(none)'; const o = (m[k] = m[k] || { name: k, n: 0, total: 0 }); o.n++; o.total += x.total || 0; }); return Object.values(m).sort((a, b) => b.total - a.total); }; const bucket = (x) => (/^approved/i.test(x.rfq) ? (/^received/i.test(x.notes) ? 'Received' : /waiting for receiving/i.test(x.notes) ? 'Approved, waiting for receiving' : 'Approved') : /pending/i.test(x.rfq) ? 'Pending approval' : x.rfq || 'No status'); const payStage = (x) => (/(\d+)\s*%/.test(x.pay) ? `Paid ${/(\d+)\s*%/.exec(x.pay)[1]}%` : /^PYR|^PYR-/i.test(x.pay) ? 'Payment request raised' : /^approved/i.test(x.rfq) ? 'No payment request yet' : ''); R.forEach((x) => { x.bucket = bucket(x); x.payStage = payStage(x); });
    return { total: sum(R, (x) => x.total), n: R.length, units: sum(R, (x) => x.qty), byStatus: grp((x) => x.bucket), byDept: grp((x) => x.dept.replace(/\s+/g, ' ').trim()), bySupplier: grp((x) => x.supplier.replace(/\s+/g, ' ').trim()), top: [...R].sort((a, b) => (b.total || 0) - (a.total || 0)).slice(0, 10) }; }
  LM.bakery = { detect, analyze, KINDS, projectStats, npdStats, productionStats, machineStats, reportedDays, taskStatus };
})(typeof window !== 'undefined' ? window : globalThis);
