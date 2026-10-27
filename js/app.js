/* App shell: tabs + backup / restore. */
(function () {
  const LM = window.LM; const { h } = LM;
  const DRAFT = 'No custom summary for this department yet. Files you upload are checked and summarised automatically; share the weekly report with Claude to build the dedicated KPIs and format checks for this tab.';
  const generic = (id, l) => LM.makeGenericDept(id, l, DRAFT);
  // tabs are placed side by side by topic; a thin divider separates the groups
  const depts = [
    LM.depts.sales, LM.depts.manualpunch, LM.depts.wastage, LM.depts.international, LM.depts.training, LM.depts.quality,
    LM.depts.procurement, LM.depts.warehouse, LM.depts.shipment,
    LM.depts.bakery, LM.depts.roasting,
    LM.depts.nep, LM.makeGenericDept('others', 'Real estate', null),
    LM.depts.discussion,
  ];
  const GROUP_END = ['quality', 'shipment', 'roasting', 'others']; // a divider is drawn after these
  const panel = h('main'); const tabs = h('nav', { class: 'tabs' });
  let active = (location.hash || '#sales').slice(1);
  if (LM.blocks) LM.blocks.attach(panel, () => active);
  if (LM.week && LM.week.attach) LM.week.attach(panel, () => active);
  if (!depts.some((d) => d.id === active)) active = 'sales';

  async function show(id) {
    active = id; location.hash = id; LM.killCharts();
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
    panel.replaceChildren(); await depts.find((d) => d.id === id).mount(panel);
  }
  depts.forEach((d) => tabs.append(h('button', { 'data-id': d.id, class: GROUP_END.includes(d.id) ? 'grp' : '', onclick: () => show(d.id) }, d.label)));

  async function backup() {
    const b64 = (buf) => { let t = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(t); };
    const all = LM.week && LM.week.exportAll ? await LM.week.exportAll() : { datasets: await LM.db.all('datasets'), templates: await LM.db.all('templates'), history: await LM.db.all('history') };
    const dump = { app: 'lm-dashboard', version: 2, at: new Date().toISOString(), datasets: all.datasets.map((r) => (r.pdf instanceof ArrayBuffer ? { ...r, pdf: { __b64: b64(r.pdf) } } : r)), templates: all.templates, history: all.history };
    await LM.saveFile(`lm-dashboard-backup-${dump.at.slice(0, 10)}.json`, JSON.stringify(dump), 'application/json');
  }
  async function restore(file) {
    let d; try { d = JSON.parse(await file.text()); } catch { return LM.say('That is not a valid backup file.'); }
    if (d.app !== 'lm-dashboard') return LM.say('That file is not a dashboard backup.');
    const n = (d.datasets || []).length; const W = LM.week; let target = null;
    // reports saved before weeks existed are put into the week you choose; newer backups already know their week
    const loose = (d.datasets || []).filter((r) => !r.week);
    if (W && loose.length) { const guess = W.of((loose.map((r) => r.end).filter(Boolean).sort()[Math.floor(loose.length / 2)]) || new Date().toISOString().slice(0, 10)) || W.selected; target = await W.pickWeek('Which week do these reports belong to?', `The backup holds ${n} report(s) that are not tied to a week yet. Choose the week to put them in (long reference files such as the year calendar stay available in every week). Existing reports are kept; matching ones are overwritten.`, guess); if (!target) return; }
    else if (!await LM.ask(`Restore ${n} report(s) from this backup? Existing weeks are kept; matching reports are overwritten.`)) return;
    LM.toast('Restoring…');
    try {
      for (const s of ['datasets', 'templates', 'history']) for (const r of d[s] || []) {
        if (r.pdf && r.pdf.__b64) { const bin = atob(r.pdf.__b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); r.pdf = u.buffer; }
        if (s !== 'templates' && !r.week && target) { const span = r.start && r.end ? (Date.parse(r.end) - Date.parse(r.start)) / 86400000 : 0; r.week = span > 100 ? W.REF : target; }
        await (LM.dbRaw || LM.db).put(s, r);
      }
      if (W) { await W.rebuild(); if (LM.cloud) await LM.cloud.load(W.selected); }
    } catch (e) { return LM.say('Restore stopped: ' + e.message); }
    if (W) { const c = document.querySelector('.wkctl'); if (c) c.replaceWith(W.control()); }
    show(active); LM.toast('Backup restored');
  }
  const rin = h('input', { type: 'file', accept: '.json', style: 'display:none', onchange: () => rin.files[0] && restore(rin.files[0]) });

  (LM.ready || Promise.resolve()).catch(() => {}).then(() => {
  const snap = LM.snapshot.active; const view = !!LM.viewOnly; LM.refresh = () => show(active);
  async function saveCopy() { try { await LM.snapshot.download(); } catch (e) { LM.say('Could not create the HTML copy: ' + e.message + (location.protocol === 'file:' ? '\n\nThis page was opened straight from a file; open the hosted dashboard (or the single-file build) to save copies.' : '')); } }
  function clearDialog() {
    const ov = h('div', { class: 'overlay' }); const close = () => ov.remove(); let saved = false;
    const status = h('div', { class: 'sub', style: 'margin-top:8px' });
    const wipe = async () => { await LM.snapshot.clearAll(); close(); LM.toast('Dashboard cleared. Upload the new week’s files.'); show(active); };
    ov.append(h('div', { class: 'modal', style: 'max-width:560px' }, h('div', { class: 'mh' }, h('h3', {}, 'Clear this week’s reports')), h('div', { class: 'mb' },
      h('p', {}, `This removes the reports uploaded into the week ${LM.week && LM.week.selected ? LM.week.label(LM.week.selected) : 'you are in'}, in all tabs. Other weeks stay saved. To begin a new week without deleting anything, use “＋ New week” instead.`),
      h('p', { class: 'sub' }, 'Kept: all other weeks, your Discussion points, and what the dashboard has learned about your file formats (so the same files still upload without questions). Not touched: your original files and any HTML copies you saved.'),
      window.LM_NO_DOWNLOADS ? null : h('button', { class: 'btn primary', onclick: async (e) => { e.target.disabled = true; try { await LM.snapshot.download(); saved = true; status.textContent = '✓ HTML copy saved to your downloads.'; } catch (er) { status.textContent = 'Could not save the copy: ' + er.message; } e.target.disabled = false; } }, '⬇ Save an HTML copy first'), status),
      h('div', { class: 'mf' }, h('div', { class: 'spacer' }), h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn danger', onclick: async () => { if (!saved && !window.LM_NO_DOWNLOADS && !await LM.ask('You have not saved an HTML copy. Clear everything anyway?')) return; await wipe(); } }, 'Clear this week'))));
    document.body.append(ov);
  }
  const m = LM.snapshot.meta || {};
  document.body.prepend(h('header', { class: 'top' },
    h('div', { class: 'bar' }, h('span', { class: 'brand' }, '☕ Weekly Department Dashboard'), snap || !LM.week || !LM.week.ready ? null : LM.week.control(), h('div', { class: 'spacer' }),
      LM.cloud && !snap ? h('button', { class: 'btn small', onclick: () => LM.cloud.signOut(), title: 'Sign out of this website' }, 'Sign out') : null,
      snap ? null : view ? [...(window.LM_NO_DOWNLOADS ? [] : [h('button', { class: 'btn small', onclick: saveCopy, title: 'Save the whole dashboard with its data as one HTML file' }, '⬇ Download as HTML')])] : [...(window.LM_NO_DOWNLOADS ? [] : [h('button', { class: 'btn small', onclick: saveCopy, title: 'Save the whole dashboard with its data as one HTML file (read-only copy)' }, '⬇ Download as HTML')]), h('button', { class: 'btn small danger', onclick: clearDialog, title: 'Remove the reports of the week you are in (other weeks stay saved)' }, 'Clear this week'),
        ...(window.LM_NO_DOWNLOADS ? [] : [h('button', { class: 'btn small', onclick: backup, title: 'Download all stored data as one file (to restore later)' }, 'Backup'), h('button', { class: 'btn small', onclick: () => rin.click() }, 'Restore'), rin])]),
    LM.notice ? h('div', { class: 'banner', style: 'margin:8px 16px;border-color:var(--bad)' }, LM.notice) : null,
    view && !LM.notice ? h('div', { class: 'banner', style: 'margin:8px 16px' }, 'Shared live dashboard · view only. The owner uploads the weekly files; you always see the latest data.') : null,
    snap ? h('div', { class: 'banner', style: 'margin:8px 16px' }, `Saved copy · data up to ${m.latest || '–'} · saved ${(m.savedAt || '').slice(0, 16).replace('T', ' ')}. Read-only: uploads are switched off here. Open the live dashboard to add or change data.`) : null,
    tabs), panel);
  show(active);
  if (LM.week && LM.week.migrateLegacy) setTimeout(() => LM.week.migrateLegacy().catch(() => {}), 400); // one-time: put reports saved before weeks existed into a week
  });
})();
