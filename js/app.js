/* App shell: tabs + backup / restore. */
(function () {
  const LM = window.LM; const { h } = LM;
  const DRAFT = 'No custom summary for this department yet. Files you upload are checked and summarised automatically; share the weekly report with Claude to build the dedicated KPIs and format checks for this tab.';
  const generic = (id, l) => LM.makeGenericDept(id, l, DRAFT);
  const depts = [
    LM.depts.sales, LM.depts.wastage, LM.depts.international, LM.depts.nep, LM.depts.procurement,
    LM.depts.quality, LM.depts.roasting, LM.depts.training, LM.depts.warehouse,
    LM.makeGenericDept('others', 'Others', null), LM.depts.shipment, LM.depts.discussion,
  ];
  const panel = h('main'); const tabs = h('nav', { class: 'tabs' });
  let active = (location.hash || '#sales').slice(1);
  if (!depts.some((d) => d.id === active)) active = 'sales';

  async function show(id) {
    active = id; location.hash = id; LM.killCharts();
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
    panel.replaceChildren(); await depts.find((d) => d.id === id).mount(panel);
  }
  depts.forEach((d) => tabs.append(h('button', { 'data-id': d.id, onclick: () => show(d.id) }, d.label)));

  async function backup() {
    const b64 = (buf) => { let t = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(t); };
    const dump = { app: 'lm-dashboard', version: 1, at: new Date().toISOString(), datasets: (await LM.db.all('datasets')).map((r) => (r.pdf instanceof ArrayBuffer ? { ...r, pdf: { __b64: b64(r.pdf) } } : r)), templates: await LM.db.all('templates'), history: await LM.db.all('history') };
    await LM.saveFile(`lm-dashboard-backup-${dump.at.slice(0, 10)}.json`, JSON.stringify(dump), 'application/json');
  }
  async function restore(file) {
    let d; try { d = JSON.parse(await file.text()); } catch { return LM.say('That is not a valid backup file.'); }
    if (d.app !== 'lm-dashboard') return LM.say('That file is not a dashboard backup.');
    if (!await LM.ask('Restoring replaces everything currently stored in this browser. Continue?')) return;
    for (const s of ['datasets', 'templates', 'history']) { await LM.db.clear(s); for (const r of d[s] || []) { if (r.pdf && r.pdf.__b64) { const bin = atob(r.pdf.__b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); r.pdf = u.buffer; } await LM.db.put(s, r); } }
    show(active); LM.toast('Backup restored');
  }
  const rin = h('input', { type: 'file', accept: '.json', style: 'display:none', onchange: () => rin.files[0] && restore(rin.files[0]) });

  const snap = LM.snapshot.active;
  async function saveCopy() { try { await LM.snapshot.download(); } catch (e) { LM.say('Could not create the HTML copy: ' + e.message + (location.protocol === 'file:' ? '\n\nThis page was opened straight from a file; open the hosted dashboard (or the single-file build) to save copies.' : '')); } }
  function clearDialog() {
    const ov = h('div', { class: 'overlay' }); const close = () => ov.remove(); let saved = false;
    const status = h('div', { class: 'sub', style: 'margin-top:8px' });
    const wipe = async () => { await LM.snapshot.clearAll(); close(); LM.toast('Dashboard cleared. Upload the new week’s files.'); show(active); };
    ov.append(h('div', { class: 'modal', style: 'max-width:560px' }, h('div', { class: 'mh' }, h('h3', {}, 'Clear dashboard and start a new week')), h('div', { class: 'mb' },
      h('p', {}, 'This removes every uploaded report and its history from this browser, in all tabs, so the new week starts completely empty and nothing is mixed.'),
      h('p', { class: 'sub' }, 'Kept: your Discussion points, and what the dashboard has learned about your file formats (so the same files still upload without questions). Not touched: your original files and any HTML copies you saved.'),
      window.LM_NO_DOWNLOADS ? null : h('button', { class: 'btn primary', onclick: async (e) => { e.target.disabled = true; try { await LM.snapshot.download(); saved = true; status.textContent = '✓ HTML copy saved to your downloads.'; } catch (er) { status.textContent = 'Could not save the copy: ' + er.message; } e.target.disabled = false; } }, '⬇ Save an HTML copy first'), status),
      h('div', { class: 'mf' }, h('div', { class: 'spacer' }), h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn danger', onclick: async () => { if (!saved && !window.LM_NO_DOWNLOADS && !await LM.ask('You have not saved an HTML copy. Clear everything anyway?')) return; await wipe(); } }, 'Clear all data'))));
    document.body.append(ov);
  }
  const m = LM.snapshot.meta || {};
  document.body.prepend(h('header', { class: 'top' },
    h('div', { class: 'bar' }, h('span', { class: 'brand' }, '☕ Weekly Department Dashboard'), h('div', { class: 'spacer' }),
      snap ? null : [...(window.LM_NO_DOWNLOADS ? [] : [h('button', { class: 'btn small', onclick: saveCopy, title: 'Save the whole dashboard with its data as one HTML file (read-only copy)' }, '⬇ Download as HTML')]), h('button', { class: 'btn small danger', onclick: clearDialog, title: 'Remove all uploaded data to start a new week' }, 'Clear dashboard'),
        ...(window.LM_NO_DOWNLOADS ? [] : [h('button', { class: 'btn small', onclick: backup, title: 'Download all stored data as one file (to restore later)' }, 'Backup'), h('button', { class: 'btn small', onclick: () => rin.click() }, 'Restore'), rin])]),
    snap ? h('div', { class: 'banner', style: 'margin:8px 16px' }, `Saved copy · data up to ${m.latest || '–'} · saved ${(m.savedAt || '').slice(0, 16).replace('T', ' ')}. Read-only: uploads are switched off here. Open the live dashboard to add or change data.`) : null,
    tabs), panel);
  show(active);
})();
