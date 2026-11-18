/* Sales > Mugs: built only from the two files uploaded here — (1) the mugs-sold-by-store export and (2) the SOH Daily Tracker (stock in stores).
   Nothing is read from the sales report or from older uploads. Records: dept "sales", type "mugs-sales" / "mugs-stock" (one per week). */
(function () {
  const LM = window.LM; const { h, num } = LM; const T_SALES = 'mugs-sales', T_STOCK = 'mugs-stock';
  const stamp = (d) => String(d.uploadedAt || '').slice(0, 16).replace('T', ' ');
  function create(env) {
    let sales = null, stock = null, links = {};
    const weekEnd = () => (LM.week && LM.week.selected) || new Date().toISOString().slice(0, 10);
    const weekStart = () => new Date(Date.parse(weekEnd() + 'T00:00:00Z') - 6 * 864e5).toISOString().slice(0, 10);
    async function load() {
      const all = await LM.db.all('datasets'); sales = all.find((d) => d.dept === 'sales' && d.type === T_SALES) || null; stock = all.find((d) => d.dept === 'sales' && d.type === T_STOCK) || null;
      const tp = (await LM.db.get('templates', 'sales')) || {}; links = tp.mugLinks || {}; LM.mugstock.setSkip(tp.mugSkip || []);
    }
    async function setTpl(patch) { const tp = { dept: 'sales', ...((await LM.db.get('templates', 'sales')) || {}) }; Object.assign(tp, patch(tp)); await LM.db.put('templates', tp); await load(); env.draw(); }
    const linkMug = async (name, key, quiet) => { if (name == null) { env.draw(); return; } const tp = { dept: 'sales', ...((await LM.db.get('templates', 'sales')) || {}) }; tp.mugLinks = { ...(tp.mugLinks || {}) }; if (key) tp.mugLinks[LM.norm(name)] = key; else delete tp.mugLinks[LM.norm(name)]; await LM.db.put('templates', tp); links = tp.mugLinks; if (!quiet) { await load(); env.draw(); } };
    const skipMug = (list) => setTpl(() => ({ mugSkip: list }));
    const replaceOld = async (old) => { if (old) { await LM.db.put('history', { ...old, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', old.id); } };

    /* ---- upload 1: mugs sold by store ---- */
    async function uploadSales(file) {
      let rf; try { rf = await LM.readFile(file); } catch (e) { return LM.say(e.message); }
      if (!LM.mugdaily.detect(rf.wb)) return LM.say('This is not the mugs-sold report (Store / Accounting day / Item group / Item / Sold with item / Net sales / Number of items).');
      const res = LM.mugdaily.parse(rf.wb, rf.name, sales ? [sales] : [], rf.hash); const ds = res.ds;
      if (ds && !ds.hasStores) res.issues.push({ level: 'error', msg: 'This file has no Store column. Upload the mugs-sold report that is split by store.' });
      const C = ds && ds.hasStores ? LM.mugdaily.compute(ds) : null; const stores = ds ? new Set(ds.rows.map((x) => x.store).filter(Boolean)).size : 0;
      const info = () => ({ title: `Review before processing: ${rf.name}`, issues: res.issues, facts: C ? [['Report', 'Mugs sold by store'], ['Period', `${ds.start} → ${ds.end}`], ['Stores', num(stores)], ['Mugs counted', num(C.total)], ['Net sales (SAR)', num(Math.round(C.totalSales))], ['Mug types', num(C.list.length)]] : [['Report', 'Not recognised']],
        approveLabel: sales ? 'Approve & replace this week’s file' : 'Approve & process', onCancel: () => {},
        onApprove: async () => { if (!ds || res.issues.some((i) => i.level === 'error')) throw new Error('Fix the errors first.'); await replaceOld(sales); await LM.db.put('datasets', { ...ds, id: LM.uid(), dept: 'sales', type: T_SALES, fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString() }); await load(); env.draw(); LM.toast('Mugs sold by store processed'); } });
      LM.review(info());
    }
    /* ---- upload 2: stock in stores (SOH tracker) ---- */
    async function uploadStock(file) {
      let rf; try { rf = await LM.readFile(file); } catch (e) { return LM.say(e.message); }
      const P = LM.mugstock.parse(rf.wb); if (P.error) return LM.say(P.error + '\n\nUpload the weekly “SOH Daily Tracker – Mugs & Coffee” workbook.');
      const issues = P.issues.slice(); const V = LM.mugstock.view({ data: P }); const cells = P.rows.filter((x) => x.qty != null).length;
      const info = () => ({ title: `Review before processing: ${rf.name}`, issues, facts: [['ROMs', V.roms.length], ['Stores', V.stores.length], ['Mugs', V.mugs.length], ['Mugs in stock', V.total.toLocaleString()], ['Figures read', cells.toLocaleString()]],
        approveLabel: stock ? 'Approve & replace this week’s file' : 'Approve & save', onCancel: () => {},
        onApprove: async () => { if (issues.some((i) => i.level === 'error')) throw new Error('Fix the errors first.'); await replaceOld(stock); await LM.db.put('datasets', { id: LM.uid(), dept: 'sales', type: T_STOCK, start: weekStart(), end: weekEnd(), fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), data: { roms: P.roms, rows: P.rows.map(({ rom, store, mug, family, qty }) => ({ rom, store, mug, family, qty })), remarks: P.remarks } }); await load(); env.draw(); LM.toast('Mug stock saved'); } });
      LM.review(info());
    }

    function box(title, step, rec, label, onFile, hint) {
      return h('div', { class: 'card', style: 'flex:1;min-width:300px' }, h('h3', {}, `${step}. ${title}`),
        rec ? h('div', { class: 'sub', style: 'margin-bottom:8px' }, `${rec.fileName} · ${rec.start && rec.end ? rec.start + ' → ' + rec.end + ' · ' : ''}uploaded ${stamp(rec)}`) : h('div', { class: 'sub', style: 'margin-bottom:8px' }, hint),
        LM.viewOnly ? null : LM.filePicker(onFile, rec ? `Replace ${label}` : `Upload ${label}`, false, '.xlsx,.xls,.xlsm'));
    }
    function view() {
      const V = stock ? LM.mugstock.view(stock) : null;
      const top = h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px' },
        box('Mugs sold, by store', 1, sales, 'mugs sales file', uploadSales, 'Upload the “mugs sold” export (Sales By Product, split by store and day). It must have a Store column.'),
        box('Mug stock in stores', 2, stock, 'mugs stock file (SOH)', uploadStock, 'Upload the weekly SOH Daily Tracker – Mugs & Coffee (one sheet per ROM, branch code in front of each store name).'));
      const el = h('div', {}, top, h('div', { class: 'sub', style: 'margin-bottom:10px' }, 'This tab shows only what is in these two files for the week you have open.'));
      if (!sales && !stock) { el.append(h('div', { class: 'empty' }, h('h3', {}, 'Nothing uploaded yet'), h('p', { class: 'sub' }, 'Upload the two files above.'))); return el; }
      if (LM.mugsByStore) el.append(LM.mugsByStore.card(V, null, sales, links, linkMug, skipMug));
      if (sales && LM.mugdaily) el.append(LM.mugdaily.card(sales, V, null));
      return el;
    }
    return { load, view };
  }
  LM.mugsTab = { create };
})();
