/* Headcount per store (sheet "By Branch" of the weekly Headcount workbook). Only counts per location are stored. From the "Data" sheet only the
   Matrix Location and Role Group columns are read (to count when By Branch has no numbers, or to check it); names are never kept. Used by the Sales tab for "Staff productivity". */
(function () {
  const LM = window.LM; const { h } = LM; const S = () => LM.sales;
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const NOT_STORE = /factory|production|roasting|head\s*office|event|training|centre|center|bank|tower|\bhq\b|stc/i;
  const ALIAS = { medina: 'madina', madinah: 'madina', jazan: 'jizan', makkah: 'mec', mecca: 'mec', mekka: 'mec', abha: 'abh', riyadh: 'riy', tabuk: 'tbu', burydah: 'buraidah', buraydah: 'buraidah', buraida: 'buraidah', jeddah: 'jed', dammam: 'dmm', khobar: 'kbr', ahsa: 'ahs', hofuf: 'hofuf', crown: 'walyal', prince: 'ahd', waly: 'walyal', wali: 'walyal' };
  const ROLE_COLS = { sm: /store manager/i, tl: /team leader/i, barista: /barista/i, cashier: /cashier/i, cleaner: /cleaner/i, other: /other/i };
  const CODE = /(?:^|[^A-Za-z0-9])B\s*0*(\d+)(?!\d)/i;
  const toks = (s) => String(s).toLowerCase().replace(/^\s*\d+\s*:\s*/, '').replace(/(^|[^a-z0-9])b\s*0*\d+(?!\d)/g, ' ').replace(/[^a-z؀-ۿ\s]/g, ' ').split(/\s+/).filter((t) => t.length >= 3).map((t) => ALIAS[t] || t);
  const digs = (x) => (String(x).replace(/^\s*\d+\s*:\s*/, '').replace(CODE, ' ').match(/(?:^|[^0-9])(\d{1,2})(?![0-9])/g) || []).map((d) => d.replace(/\D/g, '')).join(',');
  const score = (a, b) => { const A = toks(a), B = toks(b); if (!A.length || !B.length) return 0; const [s, l] = A.length <= B.length ? [A, B] : [B, A]; const base = s.reduce((t, x) => t + Math.max(...l.map((y) => LM.similarity(x, y))), 0) / s.length; const da = digs(a), db = digs(b); return Math.max(0, Math.min(1, base + (da && da === db ? 0.15 : da !== db ? -0.15 : 0))); };
  const period = (txt) => { const m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+to\s+(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(20\d\d)/i.exec(txt || ''); if (!m) return null; const m1 = MON.indexOf(m[2].toLowerCase()) + 1, m2 = MON.indexOf(m[4].toLowerCase()) + 1; if (!m1 || !m2) return null; const p = (n) => String(n).padStart(2, '0'); return { start: `${m[5]}-${p(m1)}-${p(+m[1])}`, end: `${m[5]}-${p(m2)}-${p(+m[3])}`, label: `${m[1]} ${m[2]} – ${m[3]} ${m[4]} ${m[5]}` }; };

  /** count staff per matrix location and role from the "Data" sheet. Only two columns are read (Matrix Location, Role Group, or Title when
      there is no Role Group); names and other employee details are not read into the dashboard. null = no usable Data sheet. */
  const roleKey = (t) => { t = String(t || ''); for (const [k, re] of Object.entries(ROLE_COLS)) if (k !== 'other' && re.test(t)) return k; return 'other'; };
  function countData(wb) {
    const name = wb.SheetNames.find((n) => /^\s*data\s*$/i.test(n)); if (!name) return null;
    const g = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true }); const hi = g.findIndex((r) => r && r.some((x) => /^matrix location$/i.test(String(x || '').trim()))); if (hi < 0) return null;
    const H = g[hi].map((x) => String(x || '').trim()); const cL = H.findIndex((x) => /^matrix location$/i.test(x)); let cR = H.findIndex((x) => /^role group$/i.test(x)); const byTitle = cR < 0; if (byTitle) cR = H.findIndex((x) => /^(title|position|job title)$/i.test(x)); if (cR < 0) return null;
    const by = {}; let n = 0;
    g.slice(hi + 1).forEach((r) => { if (!r || !r.some((x) => x != null && String(x).trim() !== '')) return; n++; const loc = String(r[cL] == null ? '' : r[cL]).trim() || '(No location)'; const o = (by[loc] = by[loc] || Object.fromEntries(Object.keys(ROLE_COLS).map((k) => [k, 0]))); o[roleKey(r[cR])]++; });
    return { by, employees: n, byTitle };
  }

  /** read the "By Branch" sheet: one row per matrix location with a count per role. Newer files split it into “Branches” and “Non-branch
      locations” with Region / City / Area Manager columns; when its count cells are empty the counts come from the Data sheet instead. */
  function parse(wb) {
    const name = wb.SheetNames.find((n) => /by\s*branch/i.test(n)); if (!name) return { error: 'The sheet “By Branch” was not found in this workbook.' };
    const g = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true }); const hi = g.findIndex((r) => r && /matrix location/i.test(String(r[0] || ''))); if (hi < 0) return { error: 'The “By Branch” sheet has no “Matrix Location” header row.' };
    const H = g[hi].map((x) => String(x || '').trim()); const col = {}; Object.entries(ROLE_COLS).forEach(([k, re]) => (col[k] = H.findIndex((x) => re.test(x)))); col.total = H.findIndex((x) => /^total$/i.test(x));
    if (col.total < 0) return { error: 'The “By Branch” sheet has no “Total” column.' };
    const cRegion = H.findIndex((x) => /^region$/i.test(x)), cCity = H.findIndex((x) => /^city$/i.test(x)), cAm = H.findIndex((x) => /^area manager$/i.test(x));
    const per = period(String((g[0] || [])[0] || '')) || period((wb.SheetNames.includes('Summary') ? XLSX.utils.sheet_to_json(wb.Sheets.Summary, { header: 1, defval: null }).flat().map(String).find((x) => /period/i.test(x)) : '') || '');
    const nv = (v) => (v == null || String(v).trim() === '' ? null : isFinite(+v) ? +v : null); const txt = (r, c) => (c >= 0 && r[c] != null ? String(r[c]).replace(/\s+/g, ' ').trim() : '');
    const rows = []; let grand = null, checkRow = null; const secTotals = {}; let nonBranch = false;
    g.slice(hi + 1).forEach((r) => { const nm = String((r && r[0]) || '').trim(); if (!nm) return;
      if (/^grand total/i.test(nm)) { grand = nv(r[col.total]); return; } if (/^check/i.test(nm)) { checkRow = nv(r[col.total]); return; }
      if (/^non[-\s]*branch(es)? locations?$/i.test(nm)) { nonBranch = true; return; } if (/^matrix location$/i.test(nm) || /^locations?\s*:/i.test(nm)) return;
      if (/^(branch(es)?|non[-\s]*branch(es)?)\s+total$/i.test(nm)) { secTotals[/^non/i.test(nm) ? 'nonBranch' : 'branch'] = nv(r[col.total]); return; }
      const roles = {}; Object.keys(ROLE_COLS).forEach((k) => (roles[k] = col[k] >= 0 ? nv(r[col[k]]) : null)); const code = CODE.exec(nm);
      rows.push({ loc: nm, code: code ? 'B' + code[1] : null, roles, total: nv(r[col.total]), nonBranch, region: txt(r, cRegion), city: txt(r, cCity), areaManager: txt(r, cAm) }); });
    const filled = rows.some((r) => r.total != null || Object.values(r.roles).some((v) => v != null)); const D = countData(wb); const mism = [];
    if (!filled && D) rows.forEach((r) => { const o = D.by[r.loc] || {}; Object.keys(ROLE_COLS).forEach((k) => (r.roles[k] = o[k] || 0)); r.total = Object.values(r.roles).reduce((t, x) => t + x, 0); });
    else rows.forEach((r) => { Object.keys(ROLE_COLS).forEach((k) => (r.roles[k] = r.roles[k] || 0)); const rs = Object.values(r.roles).reduce((t, x) => t + x, 0); if (r.total == null) r.total = rs; // an empty Total cell (formula without a saved value) is worked out from the roles
      if (D && !D.byTitle) { const o = D.by[r.loc]; const dt = o ? Object.values(o).reduce((t, x) => t + x, 0) : 0; if (dt !== r.total) mism.push(`${r.loc}: ${r.total} in By Branch, ${dt} on Data`); } });
    const extra = D ? Object.keys(D.by).filter((l) => !rows.some((r) => r.loc === l)) : [];
    if (!filled && D) extra.forEach((l) => { const o = D.by[l]; rows.push({ loc: l, code: (CODE.exec(l) || [])[1] ? 'B' + CODE.exec(l)[1] : null, roles: { ...o }, total: Object.values(o).reduce((t, x) => t + x, 0), nonBranch: !CODE.test(l), region: '', city: '', areaManager: '' }); });
    return { period: per, rows, grand, checkRow, secTotals, source: !filled && D ? 'data' : 'sheet', employees: D ? D.employees : null, byTitle: D ? D.byTitle : false, mismatches: mism, extra, empty: !filled && !D };
  }

  /** link every location to a Sales store: by the B-code in its name, then by a remembered choice, then by a suggestion the user confirms */
  function link(rows, stores, map) {
    const keys = new Set(stores.map((s) => s.key)); const byCode = rows.filter((r) => r.code && keys.has(r.code)); const taken = new Set(byCode.map((r) => r.code));
    const pending = []; const skipped = [];
    rows.forEach((r) => { if (!r.total) { skipped.push({ loc: r.loc, total: 0, why: 'no staff' }); return; } if (r.code && keys.has(r.code)) { r.key = r.code; return; }
      if (map && Object.prototype.hasOwnProperty.call(map, r.loc)) { if (map[r.loc]) { r.key = map[r.loc]; taken.add(r.key); } else skipped.push({ loc: r.loc, total: r.total, why: 'not a store' }); return; }
      if ((r.nonBranch || NOT_STORE.test(r.loc)) && !r.code) { skipped.push({ loc: r.loc, total: r.total, why: 'not a store' }); return; }
      if (r.code) { const free = stores.filter((s) => !rows.some((x) => x.code === s.key)); const best = free.map((s) => ({ s, sc: score(r.loc, s.name) })).sort((a, b) => b.sc - a.sc)[0]; if (best && best.sc >= 0.8) { pending.push(r); return; } r.key = r.code; return; } // a code the Sales report does not have: asked about when a Sales store without headcount looks like it (e.g. HR “B72 Abha Dabab” = Sales “B74 Dabab”), otherwise kept for later
      pending.push(r); });
    const free = stores.filter((s) => !rows.some((x) => x.code === s.key) && !taken.has(s.key)); pending.forEach((r) => { const pool = free.length ? free : stores; const c = pool.map((s) => ({ s, sc: score(r.loc, s.name) })).sort((a, b) => b.sc - a.sc)[0]; r.suggest = c && c.sc >= 0.8 ? c.s.key : ''; r.alt = c ? c.sc : 0; });
    return { linked: rows.filter((r) => r.key), pending, skipped, taken };
  }

  function mapDialog(pending, stores, taken) {
    return new Promise((resolve) => {
      const ov = h('div', { class: 'overlay', style: 'z-index:90' }); const sels = [];
      const opts = (r) => [h('option', { value: '' }, 'Not a store (skip)'), ...stores.slice().sort((a, b) => (a.key === r.suggest ? -1 : b.key === r.suggest ? 1 : a.name.localeCompare(b.name))).map((s) => h('option', { value: s.key, selected: s.key === r.suggest }, taken.has(s.key) ? `${s.name} (already linked: staff are added together)` : s.name))];
      const rows = pending.map((r) => { const sel = h('select', { class: 'sel', style: 'max-width:260px' }, ...opts(r)); sels.push(sel); return h('tr', {}, h('td', { class: 'l' }, r.loc), h('td', {}, String(r.total)), h('td', { class: 'l' }, sel)); });
      const done = (ok) => { ov.remove(); resolve(ok ? Object.fromEntries(pending.map((r, i) => [r.loc, sels[i].value])) : null); };
      ov.append(h('div', { class: 'modal', style: 'max-width:760px' }, h('div', { class: 'mh' }, h('h3', {}, 'Link these locations to Sales stores')),
        h('div', { class: 'mb' }, h('p', {}, `${pending.length} location(s) in the headcount file have no store code that matches the Sales report. Check the suggested store for each one (or choose “Not a store”). A store that already has another location can be chosen again: the staff of both are added together. Your choice is remembered for next time.`),
          h('div', { style: 'max-height:50vh;overflow:auto' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Location in the headcount file', 'Staff', 'Sales store'].map((t, i) => h('th', { class: i === 1 ? '' : 'l' }, t)))), h('tbody', {}, rows)))),
        h('div', { class: 'mf' }, h('div', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => done(false) }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => done(true) }, 'Continue'))));
      document.body.append(ov);
    });
  }

  /** whole flow for one file; ctx = { ds (the sales report of the open week), existing (headcount record or null), done() } */
  async function upload(file, ctx) {
    let rf; try { rf = await LM.readFile(file); } catch (e) { return LM.say(e.message); }
    const P = parse(rf.wb); if (P.error) return LM.say(P.error + '\n\nUpload the weekly Headcount workbook (sheet “By Branch”).'); if (P.empty) return LM.say('The “By Branch” sheet has no numbers in this file and there is no “Data” sheet to count from, so no headcount can be read. Open the file in Excel, let it calculate, save it and upload it again.');
    const stores = (() => { const m = new Map(); (ctx.ds.ty || []).forEach((r) => { const k = S().branchKey(r.store); if (!m.has(k)) m.set(k, { key: k, name: r.store }); }); return [...m.values()]; })();
    const tpl = { dept: 'headcount', map: {}, ...((await LM.db.get('templates', 'headcount')) || {}) }; let L = link(P.rows, stores, tpl.map);
    if (L.pending.length) { const ans = await mapDialog(L.pending, stores, L.taken); if (!ans) return; tpl.map = { ...tpl.map, ...Object.fromEntries(Object.entries(ans).filter(([, v]) => v)) }; L = link(P.rows, stores, { ...tpl.map, ...ans }); } // only real links are remembered; a skipped location is asked about again next time
    const issues = []; const I = (level, msg) => ({ level, msg });
    const total = P.rows.reduce((s, r) => s + r.total, 0);
    if (P.source === 'data') issues.push(I('info', `The “By Branch” sheet has no numbers in this file (its count cells are empty), so the staff were counted from the “Data” sheet: ${P.employees} employees by Matrix Location and ${P.byTitle ? 'Title' : 'Role Group'}. Only those two columns are read; names and other employee details are not stored.`));
    else if (P.employees != null) issues.push(I('info', `From the “Data” sheet only Matrix Location and ${P.byTitle ? 'Title' : 'Role Group'} are read, to check the By Branch counts; names and other employee details are not stored.`));
    if (P.employees != null && total !== P.employees) issues.push(I('warn', `The locations add up to ${total} staff but the Data sheet lists ${P.employees} employees.`)); else if (P.employees != null) issues.push(I('info', `Check passed: the ${P.rows.length} locations add up to ${total} staff, the same as the ${P.employees} employees on the Data sheet.`));
    if (P.mismatches.length) issues.push(I('warn', `${P.mismatches.length} location(s) have a different total in “By Branch” than on the Data sheet: ${P.mismatches.slice(0, 6).join('; ')}${P.mismatches.length > 6 ? '; …' : ''}.`));
    if (P.extra.length && P.source === 'sheet') issues.push(I('warn', `${P.extra.length} location(s) on the Data sheet are missing from “By Branch”: ${P.extra.slice(0, 6).join('; ')}.`));
    const secSum = (nb) => P.rows.filter((r) => !!r.nonBranch === nb).reduce((s, r) => s + r.total, 0); if (P.secTotals.branch != null && P.secTotals.branch !== secSum(false)) issues.push(I('warn', `Branches add up to ${secSum(false)} but the sheet’s branches total says ${P.secTotals.branch}.`)); if (P.secTotals.nonBranch != null && P.secTotals.nonBranch !== secSum(true)) issues.push(I('warn', `Non-branch locations add up to ${secSum(true)} but the sheet says ${P.secTotals.nonBranch}.`));
    if (P.grand != null && P.grand !== total) issues.push(I('warn', `The locations add up to ${total} but the sheet’s grand total says ${P.grand}.`)); if (P.checkRow != null && +P.checkRow !== 0) issues.push(I('warn', `The workbook’s own check (total − employees) is ${P.checkRow}, not 0.`));
    const seen = {}; L.linked.forEach((r) => { (seen[r.key] = seen[r.key] || []).push(r); }); const dupK = Object.entries(seen).filter(([, a]) => a.length > 1); dupK.forEach(([k, a]) => issues.push(I('warn', `${a.length} locations are linked to the same store (${k}): ${a.map((x) => x.loc).join('; ')}. Their staff are added together.`)));
    const sales = ctx.ds; if (P.period && sales.end && (P.period.start > sales.end || P.period.end < sales.start)) issues.push(I('info', `The headcount is for ${P.period.label} but the Sales report covers ${sales.start} → ${sales.end}. Staff productivity then divides the sales of that period by the team as it stands in the headcount file.`)); if (!P.period) issues.push(I('warn', 'The period of the headcount file could not be read.'));
    const noHc = stores.filter((s) => !seen[s.key]); if (noHc.length) issues.push(I('info', `${noHc.length} Sales store(s) have no headcount and show “–”: ${noHc.slice(0, 6).map((s) => s.name).join('; ')}${noHc.length > 6 ? '; …' : ''}.`));
    const zero = P.rows.filter((r) => !r.total); if (zero.length) issues.push(I('warn', `${zero.length} location(s) have 0 staff in the file and are left out: ${zero.slice(0, 6).map((r) => r.loc).join('; ')}. The counts come from the “Matrix Location” column of the Data sheet, so a location renamed only in “By Branch” shows 0; rename it in the Data sheet too, or link the staff to the right location.`));
    const left = L.skipped.filter((x) => x.why !== 'no staff'); if (left.length) issues.push(I('info', `${left.length} location(s) were left out (factories, head office, events, etc.): ${left.slice(0, 5).map((x) => x.loc).join('; ')}${left.length > 5 ? '; …' : ''}.`));
    if (P.employees == null) issues.push(I('info', 'Only the counts per location are read. Individual employees are not opened or stored.'));
    const staff = L.linked.reduce((s, r) => s + r.total, 0);
    await new Promise((resolve) => { LM.review({ title: `Review before processing: ${rf.name}`, facts: [['Period', P.period ? P.period.label : '–'], ['Counted from', P.source === 'data' ? 'Data sheet' : '“By Branch” sheet'], ['Staff in the file', total], ['Stores linked', Object.keys(seen).length], ['Staff in those stores', staff], ['Left out', L.skipped.length]], issues, approveLabel: ctx.existing ? 'Approve & replace headcount' : 'Approve & process',
      onCancel: () => resolve(),
      onApprove: async () => { const merged = Object.entries(seen).map(([k, a]) => ({ key: k, name: a.map((x) => x.loc).join(' + '), region: (a.find((x) => x.region) || {}).region || '', city: (a.find((x) => x.city) || {}).city || '', areaManager: [...new Set(a.map((x) => x.areaManager).filter(Boolean))].join(' / '), total: a.reduce((s, x) => s + x.total, 0), roles: Object.fromEntries(Object.keys(ROLE_COLS).map((r) => [r, a.reduce((s, x) => s + x.roles[r], 0)])) }));
        for (const old of (await LM.db.all('datasets')).filter((d) => d.dept === 'headcount')) { await LM.db.put('history', { ...old, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', old.id); } // one headcount per week
        const rec = { id: LM.uid(), dept: 'headcount', type: 'headcount', start: P.period ? P.period.start : sales.start, end: P.period ? P.period.end : sales.end, fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), data: { period: P.period ? P.period.label : '', source: P.source, staffInFile: total, nonBranch: P.rows.filter((r) => r.nonBranch).map((r) => ({ loc: r.loc, total: r.total })), rows: merged, skipped: L.skipped } };
        await LM.db.put('datasets', rec); await LM.db.put('templates', tpl); LM.toast('Headcount saved'); if (ctx.done) await ctx.done(); setTimeout(resolve, 50); } }); });
  }
  LM.headcount = { upload, parse, link };
})();
