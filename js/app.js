/* App shell: tabs + backup / restore. */
(function () {
  const LM = window.LM; const { h } = LM;
  const DRAFT = 'No custom summary for this department yet. Files you upload are checked and summarised automatically; share the weekly report with Claude to build the dedicated KPIs and format checks for this tab.';
  const generic = (id, l) => LM.makeGenericDept(id, l, DRAFT);
  const depts = [
    LM.depts.sales, LM.depts.wastage, generic('international', 'International'), generic('nep', 'NEP'), generic('procurement', 'Procurement'),
    LM.depts.quality, generic('roasting', 'Roasting'), generic('training', 'Training'), generic('warehouse', 'Warehouse'),
    LM.makeGenericDept('others', 'Others', null),
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
    const dump = { app: 'lm-dashboard', version: 1, at: new Date().toISOString(), datasets: await LM.db.all('datasets'), templates: await LM.db.all('templates'), history: await LM.db.all('history') };
    const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(dump)], { type: 'application/json' })), download: `lm-dashboard-backup-${dump.at.slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
  }
  async function restore(file) {
    let d; try { d = JSON.parse(await file.text()); } catch { return alert('That is not a valid backup file.'); }
    if (d.app !== 'lm-dashboard') return alert('That file is not a dashboard backup.');
    if (!confirm('Restoring replaces everything currently stored in this browser. Continue?')) return;
    for (const s of ['datasets', 'templates', 'history']) { await LM.db.clear(s); for (const r of d[s] || []) await LM.db.put(s, r); }
    show(active); LM.toast('Backup restored');
  }
  const rin = h('input', { type: 'file', accept: '.json', style: 'display:none', onchange: () => rin.files[0] && restore(rin.files[0]) });

  document.body.prepend(h('header', { class: 'top' },
    h('div', { class: 'bar' }, h('span', { class: 'brand' }, '☕ Weekly Department Dashboard'), h('div', { class: 'spacer' }),
      h('button', { class: 'btn small', onclick: backup, title: 'Download all stored data as one file' }, 'Backup'), h('button', { class: 'btn small', onclick: () => rin.click() }, 'Restore'), rin),
    tabs), panel);
  show(active);
})();
