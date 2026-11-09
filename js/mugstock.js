/* Mugs stock in branches: the weekly "SOH Daily Tracker - Mugs & Coffee" workbook. One sheet per ROM (area manager), mugs and coffee items
   down the side, that ROM's stores across the top, then "Total", "Av" and "Remarks" columns. Only the mug rows are read.
   Mugs are matched by NAME, never by row position: the sheets list the mugs in different orders and spellings ("SAIL BLUE MUG 40oz",
   "AL SAIL MUG BLUE 40oz", "Red mug" = "Cherry Mug", "Haram Myg -BIEGE"...). The workbook's own "Total" sheet adds the ROM sheets row by row,
   so it is not used; the dashboard adds the stores itself and checks every row against that sheet's own Total column.
   Used by the Mugs sub-tab of Sales. */
(function () {
  const LM = window.LM; const { h } = LM;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const COLOURS = { orange: 'orange', blue: 'blue', beige: 'beige', biege: 'beige', yellow: 'yellow', green: 'green', greene: 'green', black: 'black', red: 'red', purple: 'purple', pink: 'pink', white: 'white', grey: 'grey', gray: 'grey' };
  const FAMILY_ORDER = ['Alsail', 'Hot & Cold Mug', 'Summer', 'Coffee Mug', 'Al-Haram', 'National (Fazaa)', 'Other mugs'];

  /** the mug a row label stands for, with the same names the Sales report uses; null = not a mug (cups, beans, cards...) */
  function mugOf(label) {
    const s = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); if (!s) return null;
    const words = s.split(' '); const colour = (words.map((w) => COLOURS[w]).find(Boolean)) || null; const C = colour ? cap(colour) : '';
    const hc = /\bhot\b/.test(s) ? 'Hot' : /\bcold+\b/.test(s) ? 'Cold' : null; const size = (/\b(20|40)\s*oz\b/.exec(s) || [])[1];
    const out = (name, family) => ({ name: name.replace(/\s+/g, ' ').trim(), family });
    if (/\b(al ?)?sail\b|alsail/.test(s)) return colour && size ? out(`Alsail Mug ${C} ${size}oz`, 'Alsail') : { unknown: true };
    { const raw = String(label || '').toLowerCase(); // the sales report spells the Hot & Cold (stable) mugs without the word “stable”, sometimes with typos: “Hot&ColdBeige Mug”, “Hot&clod Black Mug”, “HM Green Mug”
      if (/\bhm\s*green\s*mug/.test(raw)) return out('Stable Mug – Light Green', 'Hot & Cold Mug');
      if (/hot\s*(?:&|and)?\s*c(?:old|lod)/.test(raw) && /\bmug/.test(raw)) { const cm = /(beige|biege|black|green)/.exec(raw); return cm ? out(`Stable Mug – ${cm[1] === 'green' ? 'Light Green' : cm[1] === 'black' ? 'Black' : 'Beige'}`, 'Hot & Cold Mug') : { unknown: true }; } }
    if (/\bstable\b/.test(s)) { const lg = /\bl[iy]?gth\b|\blight\b/.test(s) ? 'Light ' : ''; return colour ? out(`Stable Mug – ${lg}${C}`, 'Hot & Cold Mug') : { unknown: true }; } // “Hot&Cold Mug … ( STABLE )” is its own mug, not the Hot / Cold mug of the same colour
    if (/\bsummer\b/.test(s)) return colour && hc ? out(`Summer ${hc} ${C} Mug`, 'Summer') : { unknown: true };
    if (/\bharam\b/.test(s)) return colour ? out(`Al-Haram ${C} Mug`, 'Al-Haram') : { unknown: true };
    if (/\bfaz+a+\b/.test(s)) return hc ? out(`Fazaa ${hc} Mug`, 'National (Fazaa)') : { unknown: true };
    if (/\bcherry\b/.test(s) || /^red mugs?$/.test(s)) return out('Coffee Mug – Cherry', 'Coffee Mug');
    if (/\bespresso mugs?\b/.test(s)) return out('Coffee Mug – Espresso', 'Coffee Mug');
    if (/^(hot|cold)\b/.test(s) && !/\bcups?\b/.test(s)) return colour ? out(`${hc} Mug – ${C}`, 'Hot & Cold Mug') : { unknown: true };
    if (/\bm[uy]gs?\b|\bsail\b|summer|haram|faz|cherry/.test(s)) return { unknown: true }; // says “mug” but is none of the known mugs: reported in the review, not guessed
    return null;
  }
  /** a cell: number, or null when empty (no figure), 0 for “-” (Excel shows zero as a dash), { text } for anything else */
  const cellVal = (v) => { if (v == null) return null; if (typeof v === 'number') return isFinite(v) ? v : { text: String(v) }; const t = String(v).trim(); if (!t) return null; if (/^-+$/.test(t)) return 0; const n = +t.replace(/,/g, ''); return isFinite(n) ? n : { text: t }; };
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  /** read every ROM sheet; issues are listed in the review before anything is saved */
  function parse(wb) {
    const issues = []; const add = (level, msg) => issues.push({ level, msg });
    const roms = []; const rows = []; const remarks = []; const ignoredSheets = []; let totalSheet = null;
    wb.SheetNames.forEach((sn) => {
      const g = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: true });
      if (/^\s*totals?\s*$/i.test(sn)) { totalSheet = g; return; }
      const hi = g.findIndex((r) => r && /items|stores/i.test(String(r[0] || '')) && r.some((x) => /^\s*total\s*$/i.test(String(x || ''))));
      if (hi < 0) { ignoredSheets.push(sn); return; }
      const H = g[hi]; const ti = H.findIndex((x) => /^\s*total\s*$/i.test(String(x || ''))); const ri = H.findIndex((x, i) => i > ti && /remark/i.test(String(x || '')));
      const cols = []; for (let c = 1; c < ti; c++) { const nm = clean(H[c]); if (nm) cols.push({ c, store: nm }); else if (g.slice(hi + 1).some((r) => r && cellVal(r[c]) != null && r[0] && mugOf(r[0]) && !mugOf(r[0]).unknown)) add('warn', `Sheet “${sn}”: column ${XLSX.utils.encode_col(c)} has figures but no store name, so it is left out.`); }
      const rom = clean(sn); const seenStore = {}; cols.forEach((x) => { if (seenStore[x.store]) add('warn', `Sheet “${sn}” lists the store “${x.store}” twice; both columns are added together.`); seenStore[x.store] = 1; });
      roms.push({ name: rom, stores: [...new Set(cols.map((x) => x.store))] });
      const seenMug = {};
      g.slice(hi + 1).forEach((r, k) => {
        if (!r || r[0] == null || !clean(r[0])) return; const label = clean(r[0]); const m = mugOf(label); if (!m) return;
        const at = `sheet “${sn}”, row ${hi + k + 2}`;
        if (m.unknown) { add('warn', `“${label}” (${at}) looks like a mug but could not be matched to a known mug, so it is left out. Tell Claude its name to add it.`); return; }
        if (seenMug[m.name]) add('warn', `${at}: “${label}” is the same mug as “${seenMug[m.name]}” above; both rows are added together.`); else seenMug[m.name] = label;
        let sum = 0; cols.forEach(({ c, store }) => { const v = cellVal(r[c]);
          if (v && typeof v === 'object') { add('error', `${at}, store “${store}”: “${v.text}” is not a number. Fix the cell and upload again.`); return; }
          if (v != null && v < 0) add('warn', `${at}, store “${store}”: negative stock (${v}).`);
          if (v != null && Math.round(v) !== v) add('warn', `${at}, store “${store}”: ${v} is not a whole number.`);
          if (v != null) sum += v; rows.push({ rom, store, mug: m.name, family: m.family, qty: v, label }); });
        const T = cellVal(r[ti]); if (T && typeof T === 'object') add('warn', `${at}: the Total cell says “${T.text}”.`); else if (T != null && Math.abs(T - sum) > 0.0001) add('warn', `${at} (“${label}”): the stores add up to ${sum.toLocaleString()} but the sheet’s Total column says ${T.toLocaleString()}. The dashboard shows the store figures.`);
        if (ri > 0 && clean(r[ri])) remarks.push({ rom, mug: m.name, text: clean(r[ri]) });
      });
      const empty = cols.filter(({ store }) => !rows.some((x) => x.rom === rom && x.store === store && x.qty != null)).map((x) => x.store);
      if (empty.length) add('info', `Sheet “${sn}”: ${empty.join(', ')} ${empty.length > 1 ? 'have' : 'has'} no figures at all; shown as “–” (not as zero).`);
    });
    if (!roms.length) return { error: 'No ROM sheet was found. Each sheet should have “Items/STORES” in the first cell, the stores across the first row and a “Total” column.' };
    if (!rows.length) return { error: 'No mug rows were found in this workbook.' };
    // the same store in two ROM sheets
    const where = {}; roms.forEach((r) => r.stores.forEach((s) => { const k = s.toLowerCase(); (where[k] = where[k] || []).push(r.name); }));
    Object.entries(where).filter(([, a]) => a.length > 1).forEach(([s, a]) => add('warn', `The store “${s}” appears in ${a.length} ROM sheets (${a.join(', ')}). It is shown under each.`));
    // the workbook's “Total” sheet, compared by mug name
    if (totalSheet) {
      const mine = {}; rows.forEach((x) => { mine[x.mug] = (mine[x.mug] || 0) + (x.qty || 0); }); const off = [];
      totalSheet.slice(1).forEach((r) => { if (!r || !r[0]) return; const m = mugOf(r[0]); if (!m || m.unknown) return; const v = cellVal(r[1]); if (typeof v !== 'number') return; if (Math.abs(v - (mine[m.name] || 0)) > 0.0001) off.push(`${clean(r[0])}: Total sheet ${v.toLocaleString()}, ROM sheets ${(mine[m.name] || 0).toLocaleString()}`); });
      if (off.length) add('info', `The workbook’s “Total” sheet does not match the ROM sheets for ${off.length} mug(s). It adds the sheets row by row, but the ROM sheets list the mugs in different orders, so the wrong mugs get added together. The dashboard adds them by name instead. ${off.slice(0, 8).join('; ')}${off.length > 8 ? '; …' : ''}.`);
    }
    if (ignoredSheets.length) add('info', `Sheet(s) not read (no store layout): ${ignoredSheets.join(', ')}.`);
    add('info', 'Only the mug rows are read. Coffee items (cups, beans, coffee cards, B2C bags, filter bags, instant coffee) are not stored.');
    return { roms, rows, remarks, issues };
  }

  /** totals for the screen: per store, per mug, per ROM, per family */
  function view(rec) {
    const d = rec.data; const mugs = []; const seen = {};
    d.rows.forEach((x) => { if (!seen[x.mug]) { seen[x.mug] = 1; mugs.push({ name: x.mug, family: x.family }); } });
    mugs.sort((a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family) || a.name.localeCompare(b.name));
    const families = FAMILY_ORDER.filter((f) => mugs.some((m) => m.family === f));
    const stores = []; const S = {};
    d.roms.forEach((r) => r.stores.forEach((s) => { const k = r.name + '|' + s; S[k] = { key: k, rom: r.name, name: s, mug: {}, fam: {}, total: 0, reported: false }; stores.push(S[k]); }));
    const byMugRom = {}; const romTot = {};
    d.rows.forEach((x) => { const st = S[x.rom + '|' + x.store]; if (!st) return; if (x.qty == null) { if (!(x.mug in st.mug)) st.mug[x.mug] = null; return; }
      st.reported = true; st.mug[x.mug] = (st.mug[x.mug] || 0) + x.qty; st.fam[x.family] = (st.fam[x.family] || 0) + x.qty; st.total += x.qty;
      const k = x.mug; byMugRom[k] = byMugRom[k] || {}; byMugRom[k][x.rom] = (byMugRom[k][x.rom] || 0) + x.qty; romTot[x.rom] = (romTot[x.rom] || 0) + x.qty; });
    const total = stores.reduce((t, s) => t + s.total, 0);
    const zeros = []; stores.forEach((s) => mugs.forEach((m) => { if (s.mug[m.name] === 0) zeros.push({ store: s.name, rom: s.rom, mug: m.name }); }));
    return { roms: d.roms.map((r) => r.name), mugs, families, stores, byMugRom, romTot, total, zeros, remarks: d.remarks || [] };
  }

  /** whole upload flow: read, review, save (one stock file per week; the one it replaces is kept in history) */
  async function upload(file, ctx) {
    let rf; try { rf = await LM.readFile(file); } catch (e) { return LM.say(e.message); }
    const P = parse(rf.wb); if (P.error) return LM.say(P.error + '\n\nUpload the weekly “SOH Daily Tracker – Mugs & Coffee” workbook.');
    const issues = P.issues.slice();
    const v = view({ data: P }); const cells = P.rows.filter((x) => x.qty != null).length;
    const wk = (LM.week && LM.week.selected) || null; const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
    const end = wk || new Date().toISOString().slice(0, 10), start = wk ? addDays(wk, -6) : end;
    await new Promise((resolve) => { LM.review({ title: `Review before processing: ${rf.name}`,
      facts: [['ROMs', v.roms.length], ['Stores', v.stores.length], ['Mugs', v.mugs.length], ['Mugs in stock', v.total.toLocaleString()], ['Figures read', cells.toLocaleString()]],
      issues, approveLabel: ctx.existing ? 'Approve & replace mug stock' : 'Approve & save',
      onCancel: () => resolve(),
      onApprove: async () => {
        for (const old of (await LM.db.all('datasets')).filter((d) => d.dept === 'mugstock')) { await LM.db.put('history', { ...old, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', old.id); } // one stock file per week
        const rec = { id: LM.uid(), dept: 'mugstock', type: 'mugstock', start, end, fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), data: { roms: P.roms, rows: P.rows.map(({ rom, store, mug, family, qty }) => ({ rom, store, mug, family, qty })), remarks: P.remarks } };
        await LM.db.put('datasets', rec); LM.toast('Mug stock saved'); if (ctx.done) await ctx.done(); setTimeout(resolve, 50); } }); });
  }

  LM.mugstock = { upload, parse, view, mugOf, FAMILY_ORDER };
})();
