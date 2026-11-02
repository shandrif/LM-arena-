/* Headcount per store (sheet "By Branch" of the weekly Headcount workbook). Only the counts per location are read and stored; the "Data" sheet
   with the individual employees is never opened, so no names are kept. Used by the Sales tab for "Staff productivity". */
(function () {
  const LM = window.LM; const { h } = LM; const S = () => LM.sales;
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const NOT_STORE = /factory|production|roasting|head\s*office|event|training|centre|center|bank|tower|\bhq\b|stc/i;
  const ALIAS = { medina: 'madina', madinah: 'madina', jazan: 'jizan', makkah: 'mec', mecca: 'mec', mekka: 'mec', abha: 'abh', riyadh: 'riy', tabuk: 'tbu', burydah: 'buraidah', buraydah: 'buraidah', buraida: 'buraidah', jeddah: 'jed', dammam: 'dmm', khobar: 'kbr', ahsa: 'ahs', hofuf: 'hofuf' };
  const ROLE_COLS = { sm: /store manager/i, tl: /team leader/i, barista: /barista/i, cashier: /cashier/i, cleaner: /cleaner/i, other: /other/i };
  const CODE = /(?:^|[^A-Za-z0-9])B\s*0*(\d+)(?!\d)/i;
  const toks = (s) => String(s).toLowerCase().replace(/^\s*\d+\s*:\s*/, '').replace(/(^|[^a-z0-9])b\s*0*\d+(?!\d)/g, ' ').replace(/[^a-z؀-ۿ\s]/g, ' ').split(/\s+/).filter((t) => t.length >= 3).map((t) => ALIAS[t] || t);
  const digs = (x) => (String(x).replace(/^\s*\d+\s*:\s*/, '').replace(CODE, ' ').match(/(?:^|[^0-9])(\d{1,2})(?![0-9])/g) || []).map((d) => d.replace(/\D/g, '')).join(',');
  const score = (a, b) => { const A = toks(a), B = toks(b); if (!A.length || !B.length) return 0; const [s, l] = A.length <= B.length ? [A, B] : [B, A]; const base = s.reduce((t, x) => t + Math.max(...l.map((y) => LM.similarity(x, y))), 0) / s.length; const da = digs(a), db = digs(b); return Math.max(0, Math.min(1, base + (da && da === db ? 0.15 : da !== db ? -0.15 : 0))); };
  const period = (txt) => { const m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+to\s+(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(20\d\d)/i.exec(txt || ''); if (!m) return null; const m1 = MON.indexOf(m[2].toLowerCase()) + 1, m2 = MON.indexOf(m[4].toLowerCase()) + 1; if (!m1 || !m2) return null; const p = (n) => String(n).padStart(2, '0'); return { start: `${m[5]}-${p(m1)}-${p(+m[1])}`, end: `${m[5]}-${p(m2)}-${p(+m[3])}`, label: `${m[1]} ${m[2]} – ${m[3]} ${m[4]} ${m[5]}` }; };

  /** read the "By Branch" sheet: one row per matrix location with a count per role */
  function parse(wb) {
    const name = wb.SheetNames.find((n) => /by\s*branch/i.test(n)); if (!name) return { error: 'The sheet “By Branch” was not found in this workbook.' };
    const g = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true }); const hi = g.findIndex((r) => r && /matrix location/i.test(String(r[0] || ''))); if (hi < 0) return { error: 'The “By Branch” sheet has no “Matrix Location” header row.' };
    const H = g[hi].map((x) => String(x || '')); const col = {}; Object.entries(ROLE_COLS).forEach(([k, re]) => (col[k] = H.findIndex((x) => re.test(x)))); col.total = H.findIndex((x) => /^total$/i.test(x.trim()));
    if (col.total < 0) return { error: 'The “By Branch” sheet has no “Total” column.' };
    const per = period(String((g[0] || [])[0] || '')) || period((wb.SheetNames.includes('Summary') ? XLSX.utils.sheet_to_json(wb.Sheets.Summary, { header: 1, defval: null }).flat().map(String).find((x) => /period/i.test(x)) : '') || '');
    const rows = []; let grand = null; let checkRow = null;
    g.slice(hi + 1).forEach((r) => { const nm = String((r && r[0]) || '').trim(); if (!nm) return; if (/^grand total/i.test(nm)) { grand = +r[col.total] || 0; return; } if (/^check/i.test(nm)) { checkRow = r[col.total]; return; }
      const roles = {}; Object.keys(ROLE_COLS).forEach((k) => (roles[k] = col[k] >= 0 ? +r[col[k]] || 0 : 0)); const code = CODE.exec(nm); rows.push({ loc: nm, code: code ? 'B' + code[1] : null, roles, total: +r[col.total] || 0 }); });
    return { period: per, rows, grand, checkRow };
  }

  /** link every location to a Sales store: by the B-code in its name, then by a remembered choice, then by a suggestion the user confirms */
  function link(rows, stores, map) {
    const keys = new Set(stores.map((s) => s.key)); const byCode = rows.filter((r) => r.code && keys.has(r.code)); const taken = new Set(byCode.map((r) => r.code));
    const pending = []; const skipped = [];
    rows.forEach((r) => { if (r.code && keys.has(r.code)) { r.key = r.code; return; }
      if (map && Object.prototype.hasOwnProperty.call(map, r.loc)) { if (map[r.loc]) { r.key = map[r.loc]; taken.add(r.key); } else skipped.push({ loc: r.loc, total: r.total, why: 'not a store' }); return; }
      if (NOT_STORE.test(r.loc) && !r.code) { skipped.push({ loc: r.loc, total: r.total, why: 'not a store' }); return; }
      if (r.code) { r.key = r.code; return; } // a store that has no sales in this report: kept for later
      pending.push(r); });
    pending.forEach((r) => { const c = stores.filter((s) => !taken.has(s.key)).map((s) => ({ s, sc: score(r.loc, s.name) })).sort((a, b) => b.sc - a.sc)[0]; r.suggest = c && c.sc >= 0.8 ? c.s.key : ''; r.alt = c ? c.sc : 0; });
    return { linked: rows.filter((r) => r.key), pending, skipped, taken };
  }

  function mapDialog(pending, stores, taken) {
    return new Promise((resolve) => {
      const ov = h('div', { class: 'overlay', style: 'z-index:90' }); const sels = [];
      const opts = (r) => [h('option', { value: '' }, 'Not a store (skip)'), ...stores.filter((s) => !taken.has(s.key)).sort((a, b) => (a.key === r.suggest ? -1 : b.key === r.suggest ? 1 : a.name.localeCompare(b.name))).map((s) => h('option', { value: s.key, selected: s.key === r.suggest }, s.name))];
      const rows = pending.map((r) => { const sel = h('select', { class: 'sel', style: 'max-width:260px' }, ...opts(r)); sels.push(sel); return h('tr', {}, h('td', { class: 'l' }, r.loc), h('td', {}, String(r.total)), h('td', { class: 'l' }, sel)); });
      const done = (ok) => { ov.remove(); resolve(ok ? Object.fromEntries(pending.map((r, i) => [r.loc, sels[i].value])) : null); };
      ov.append(h('div', { class: 'modal', style: 'max-width:760px' }, h('div', { class: 'mh' }, h('h3', {}, 'Link these locations to Sales stores')),
        h('div', { class: 'mb' }, h('p', {}, `${pending.length} location(s) in the headcount file have no store code that matches the Sales report. Check the suggested store for each one (or choose “Not a store”). Your choice is remembered for next time.`),
          h('div', { style: 'max-height:50vh;overflow:auto' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Location in the headcount file', 'Staff', 'Sales store'].map((t, i) => h('th', { class: i === 1 ? '' : 'l' }, t)))), h('tbody', {}, rows)))),
        h('div', { class: 'mf' }, h('div', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => done(false) }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => done(true) }, 'Continue'))));
      document.body.append(ov);
    });
  }

  /** whole flow for one file; ctx = { ds (the sales report of the open week), existing (headcount record or null), done() } */
  async function upload(file, ctx) {
    let rf; try { rf = await LM.readFile(file); } catch (e) { return LM.say(e.message); }
    const P = parse(rf.wb); if (P.error) return LM.say(P.error + '\n\nUpload the weekly Headcount workbook (sheet “By Branch”).');
    const stores = (() => { const m = new Map(); (ctx.ds.ty || []).forEach((r) => { const k = S().branchKey(r.store); if (!m.has(k)) m.set(k, { key: k, name: r.store }); }); return [...m.values()]; })();
    const tpl = { dept: 'headcount', map: {}, ...((await LM.db.get('templates', 'headcount')) || {}) }; let L = link(P.rows, stores, tpl.map);
    if (L.pending.length) { const ans = await mapDialog(L.pending, stores, L.taken); if (!ans) return; tpl.map = { ...tpl.map, ...Object.fromEntries(Object.entries(ans).filter(([, v]) => v)) }; L = link(P.rows, stores, { ...tpl.map, ...ans }); } // only real links are remembered; a skipped location is asked about again next time
    const issues = []; const I = (level, msg) => ({ level, msg });
    const total = P.rows.reduce((s, r) => s + r.total, 0); if (P.grand != null && P.grand !== total) issues.push(I('warn', `The locations add up to ${total} but the sheet’s grand total says ${P.grand}.`)); if (P.checkRow != null && +P.checkRow !== 0) issues.push(I('warn', `The workbook’s own check (total − employees) is ${P.checkRow}, not 0.`));
    const seen = {}; L.linked.forEach((r) => { (seen[r.key] = seen[r.key] || []).push(r); }); const dupK = Object.entries(seen).filter(([, a]) => a.length > 1); dupK.forEach(([k, a]) => issues.push(I('warn', `${a.length} locations are linked to the same store (${k}): ${a.map((x) => x.loc).join('; ')}. Their staff are added together.`)));
    const sales = ctx.ds; if (P.period && sales.end && (P.period.start > sales.end || P.period.end < sales.start)) issues.push(I('info', `The headcount is for ${P.period.label} but the Sales report covers ${sales.start} → ${sales.end}. Staff productivity then divides the sales of that period by the team as it stands in the headcount file.`)); if (!P.period) issues.push(I('warn', 'The period of the headcount file could not be read.'));
    const noHc = stores.filter((s) => !seen[s.key]); if (noHc.length) issues.push(I('info', `${noHc.length} Sales store(s) have no headcount and show “–”: ${noHc.slice(0, 6).map((s) => s.name).join('; ')}${noHc.length > 6 ? '; …' : ''}.`));
    if (L.skipped.length) issues.push(I('info', `${L.skipped.length} location(s) were left out (factories, head office, events, etc.): ${L.skipped.slice(0, 5).map((s) => s.loc).join('; ')}${L.skipped.length > 5 ? '; …' : ''}.`));
    issues.push(I('info', 'Only the counts per location are read. Individual employees (sheet “Data”) are not opened or stored.'));
    const staff = L.linked.reduce((s, r) => s + r.total, 0);
    await new Promise((resolve) => { LM.review({ title: `Review before processing: ${rf.name}`, facts: [['Period', P.period ? P.period.label : '–'], ['Stores linked', Object.keys(seen).length], ['Staff in those stores', staff], ['Left out', L.skipped.length]], issues, approveLabel: ctx.existing ? 'Approve & replace headcount' : 'Approve & process',
      onCancel: () => resolve(),
      onApprove: async () => { const merged = Object.entries(seen).map(([k, a]) => ({ key: k, name: a.map((x) => x.loc).join(' + '), total: a.reduce((s, x) => s + x.total, 0), roles: Object.fromEntries(Object.keys(ROLE_COLS).map((r) => [r, a.reduce((s, x) => s + x.roles[r], 0)])) }));
        if (ctx.existing) { await LM.db.put('history', { ...ctx.existing, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', ctx.existing.id); }
        const rec = { id: LM.uid(), dept: 'headcount', type: 'headcount', start: P.period ? P.period.start : sales.start, end: P.period ? P.period.end : sales.end, fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), data: { period: P.period ? P.period.label : '', rows: merged, skipped: L.skipped } };
        await LM.db.put('datasets', rec); await LM.db.put('templates', tpl); LM.toast('Headcount saved'); if (ctx.done) await ctx.done(); setTimeout(resolve, 50); } }); });
  }
  LM.headcount = { upload, parse, link };
})();
