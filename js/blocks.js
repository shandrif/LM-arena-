/* Hide / show and Edit for every block (cards, KPI tiles, chart panels, tables) in every tab.
   - Hide: a small "Hide" tag sits on each block and on each KPI tile; a hidden block collapses to one line. The choice is saved with the
     dashboard (so it is the same on every device) and also kept in this browser.
   - Edit: next to Hide. Click "Edit", change any text or number inside the block, press Save. The change is saved with the week's data and is
     shown again after every refresh until you edit it again or press "Reset". The original data is never changed.
   A bar appears in the tab whenever something is hidden or edited ("Show all" / "Reset all edits"). */
(function () {
  const LM = window.LM; const KEY = 'lm-hidden-blocks-v1';
  let hidden = new Set(); try { hidden = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { hidden = new Set(); }
  let edits = {}; // blockKey -> [{ d: where inside the block, o: the original text, t: your text }] for the open week
  const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').replace(/\d[\d\-/:., ]*/g, '#').trim().slice(0, 80);
  const txt = (el) => (el && el.textContent ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const week = () => (LM.week && LM.week.selected) || 'local';
  const canEdit = () => !(LM.viewOnly || (LM.snapshot && LM.snapshot.active));
  const ORIG = new WeakMap(); // text unit (element or text node) -> the original text it had before an edit was applied to this copy of the page
  let hideTimer = null; let schedule = () => {};

  /* ---------- saving ---------- */
  const persistLocal = () => { try { localStorage.setItem(KEY, JSON.stringify([...hidden])); } catch (e) { /* storage unavailable: still works for this visit */ } };
  const persistHidden = () => { persistLocal(); if (!LM.db || LM.viewOnly || (LM.snapshot && LM.snapshot.active)) return; clearTimeout(hideTimer); hideTimer = setTimeout(() => { Promise.resolve(LM.db.put('templates', { dept: 'blocks', hidden: [...hidden] })).catch(() => {}); }, 400); };
  const editsKey = (w) => 'edits:' + w;
  async function persistEdits() {
    if (!LM.db) return; const k = editsKey(week());
    try { if (Object.keys(edits).length) await LM.db.put('templates', { dept: k, edits }); else await LM.db.del('templates', k); } catch (e) { if (LM.say) LM.say('Your edit could not be saved: ' + e.message); }
  }
  async function loadSaved() {
    try {
      const rec = LM.db ? await LM.db.get('templates', 'blocks') : null;
      if (rec && Array.isArray(rec.hidden)) { hidden = new Set(rec.hidden); persistLocal(); } else if (hidden.size && LM.db && !LM.viewOnly) persistHidden(); // first time: put what this browser had on the server
      await loadEdits();
    } catch (e) { /* the page still works without saved blocks */ }
    schedule();
  }
  async function loadEdits() { try { const rec = LM.db ? await LM.db.get('templates', editsKey(week())) : null; edits = rec && rec.edits ? rec.edits : {}; } catch (e) { edits = {}; } }

  /* ---------- the text units of a block: every piece of text that can be edited ---------- */
  const SKIP = '.blk-pill, .blk-edit, .blk-edpill, .blk-edbar, button, select, input, textarea, canvas, svg, script, style, .rte, summary, .tools select';
  function units(root) {
    const out = []; const tagCount = {};
    const walk = (el) => {
      if (el.nodeType !== 1 || el.matches(SKIP)) return;
      const elKids = [...el.children].filter((c) => !c.matches(SKIP));
      if (!el.children.length) { if (clean(el.textContent)) out.push({ el, key: el }); return; }
      if (!elKids.length && clean(el.textContent) && ![...el.children].some((c) => clean(c.textContent))) { out.push({ el, key: el }); return; }
      el.childNodes.forEach((n) => { if (n.nodeType === 3 && clean(n.nodeValue)) out.push({ el: n.parentElement, node: n, key: n }); else if (n.nodeType === 1) walk(n); });
    };
    walk(root);
    const origText = (u) => (ORIG.has(u.key) ? ORIG.get(u.key) : clean(u.node ? u.node.nodeValue : u.el.textContent));
    out.forEach((u) => {
      u.get = () => clean(u.node ? u.node.nodeValue : u.el.textContent);
      u.set = (v) => { if (u.node) u.node.nodeValue = v; else u.el.textContent = v; };
      const cell = u.el.closest('td, th'); let id;
      if (cell && cell.closest('table') && root.contains(cell)) { // table cells are found by their row label and column name, so sorting does not move an edit to another row
        const tbl = cell.closest('table'); const row = cell.parentElement; const first = row.children[0]; const fu = out.find((x) => x.el === first && !x.node) || out.find((x) => x.el && x.el.closest('td, th') === first);
        const rowLabel = first === cell ? '' : clean(fu ? origText(fu) : first.textContent); const head = tbl.tHead && tbl.tHead.rows[0] ? tbl.tHead.rows[0].cells[cell.cellIndex] : null;
        const hu = head ? out.find((x) => x.el && x.el.closest('td, th') === head) : null; id = `c|${rowLabel}|${head ? clean(hu ? origText(hu) : head.textContent) : cell.cellIndex}`;
        if (first === cell && !tbl.tHead) id += '|r';
      } else { const tag = u.el.tagName.toLowerCase() + (u.node ? '#t' : ''); tagCount[tag] = (tagCount[tag] || 0) + 1; id = `u|${tag}|${tagCount[tag]}`; }
      u.id = id;
    });
    const seen = {}; out.forEach((u) => { seen[u.id] = (seen[u.id] || 0) + 1; if (seen[u.id] > 1) u.id += '#' + seen[u.id]; });
    return out;
  }
  const mark = (u, orig) => { ORIG.set(u.key, orig); const e = u.el; if (e && e.classList) { e.classList.add('blk-edited'); e.title = `Edited · original: ${orig}`; } };
  const unmark = (u) => { const e = u.el; if (e && e.classList && !u.node) { e.classList.remove('blk-edited'); if (e.title && e.title.startsWith('Edited ·')) e.removeAttribute('title'); } else if (e && e.classList) { e.classList.remove('blk-edited'); } ORIG.delete(u.key); };

  /* put the saved edits into a block (nothing is applied when the figure underneath has changed since: that is shown as "not applied") */
  function applyEdits(el) {
    const key = el.dataset.blkKey; const list = edits[key]; const pill = el.__edpill;
    if (!list || !list.length) { if (pill) { pill.remove(); el.__edpill = null; } return; }
    if (el.classList.contains('blk-editing')) return;
    const us = units(el); const byId = new Map(us.map((u) => [u.id, u])); let ok = 0, stale = 0;
    list.forEach((e) => { const u = byId.get(e.d); if (!u) { stale++; return; } const cur = u.get(); if (cur === e.t) { mark(u, e.o); ok++; } else if (cur === e.o) { u.set(e.t); mark(u, e.o); ok++; } else stale++; });
    el.dataset.blkEdited = ok ? '1' : ''; el.dataset.blkStale = stale ? String(stale) : '';
    const label = stale && !ok ? `⚠ ${stale} edit${stale > 1 ? 's' : ''} not applied · ↺ Reset` : `● Edited${stale ? ` (${stale} not applied)` : ''} · ↺ Reset`;
    if (!pill) { const b = document.createElement('button'); b.type = 'button'; b.className = 'blk-edpill'; b.addEventListener('click', (ev) => { ev.stopPropagation(); resetBlock(el); }); el.__edpill = b; (el.__bar ? el.__bar.host : el).append(b); }
    el.__edpill.textContent = label; el.__edpill.title = stale ? 'Some edits are not shown because the figure under them has changed since you edited it. Reset removes them.' : 'Show the original figures again';
  }
  async function resetBlock(el) {
    if (!(await LM.ask('Put the original figures back in this block? Your edits to it will be removed.'))) return;
    units(el).forEach((u) => { if (ORIG.has(u.key)) { u.set(ORIG.get(u.key)); unmark(u); } }); delete edits[el.dataset.blkKey]; el.dataset.blkEdited = ''; el.dataset.blkStale = '';
    if (el.__edpill) { el.__edpill.remove(); el.__edpill = null; } await persistEdits(); if (LM.toast) LM.toast('Original figures restored'); schedule();
  }

  /* ---------- edit mode ---------- */
  let active = null; // the block being edited
  function startEdit(el) {
    if (active && active !== el) cancelEdit(active); if (el.classList.contains('blk-editing')) return;
    const us = units(el); if (!us.length) return; const ctx = { us: us.map((u) => ({ u, v: u.get() })), stop: (e) => { if (e.target.closest('.blk-edbar, .blk-pill, .blk-edit, .blk-edpill')) return; if (e.target.closest('th, a, button, summary, .btn, select')) { e.preventDefault(); e.stopPropagation(); } } };
    el.classList.add('blk-editing'); el.__edit = ctx; active = el;
    ctx.us.forEach(({ u }) => { let t = u.el; if (u.node) { const sp = document.createElement('span'); sp.dataset.blkWrap = '1'; u.node.parentNode.replaceChild(sp, u.node); sp.append(u.node); t = sp; } u.ed = t; t.contentEditable = 'true'; t.spellcheck = false; t.classList.add('blk-ce'); t.addEventListener('keydown', onKey); t.addEventListener('paste', onPaste); });
    el.addEventListener('click', ctx.stop, true);
    const bar = document.createElement('div'); bar.className = 'blk-edbar'; const s = document.createElement('span'); s.innerHTML = '<b>Editing this block</b> Click any text or number to change it.'; const sp = document.createElement('span'); sp.style.flex = '1';
    const c = document.createElement('button'); c.type = 'button'; c.className = 'btn small'; c.textContent = 'Cancel'; c.addEventListener('click', (e) => { e.stopPropagation(); cancelEdit(el); });
    const v = document.createElement('button'); v.type = 'button'; v.className = 'btn small primary'; v.textContent = 'Save'; v.addEventListener('click', (e) => { e.stopPropagation(); saveEdit(el); });
    bar.append(s, sp, c, v); (el.__bar ? el : el).prepend(bar); ctx.bar = bar; const first = ctx.us[0]; if (first && first.u.ed.focus) first.u.ed.focus();
  }
  const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } if (e.key === 'Escape') { const b = e.target.closest('.blk-editing'); if (b) cancelEdit(b); } };
  const onPaste = (e) => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\s+/g, ' '); document.execCommand('insertText', false, t); };
  function finish(el) { // leave edit mode, keep whatever text is in the cells right now
    const ctx = el.__edit; if (!ctx) return;
    ctx.us.forEach(({ u }) => { const t = u.ed; t.removeEventListener('keydown', onKey); t.removeEventListener('paste', onPaste); t.removeAttribute('contenteditable'); t.classList.remove('blk-ce'); if (u.node) { const txt2 = document.createTextNode(t.textContent); t.parentNode.replaceChild(txt2, t); u.node = txt2; u.key = txt2; } });
    el.removeEventListener('click', ctx.stop, true); ctx.bar.remove(); el.classList.remove('blk-editing'); el.__edit = null; if (active === el) active = null;
  }
  function cancelEdit(el) { const ctx = el.__edit; if (!ctx) return; ctx.us.forEach(({ u, v }) => { u.ed.textContent = v; }); finish(el); schedule(); }
  async function saveEdit(el) {
    const ctx = el.__edit; if (!ctx) return; const key = el.dataset.blkKey; const map = new Map((edits[key] || []).map((e) => [e.d, e])); let changed = 0;
    ctx.us.forEach(({ u, v }) => { const now = clean(u.ed.textContent); if (now === v) return; changed++; const prior = map.get(u.id); const orig = prior ? prior.o : (ORIG.has(u.key) ? ORIG.get(u.key) : v); if (now === orig) map.delete(u.id); else map.set(u.id, { d: u.id, o: orig, t: now }); });
    finish(el); if (!changed) return;
    // the cells already show the new text; the saved list says which cell and what it was
    const list = [...map.values()]; if (list.length) edits[key] = list; else delete edits[key];
    units(el).forEach((u) => { const e = list.find((x) => x.d === u.id); if (e && u.get() === e.t) mark(u, e.o); else if (!e && ORIG.has(u.key)) unmark(u); });
    applyEdits(el); await persistEdits(); if (LM.toast) LM.toast('Saved'); schedule();
  }
  async function resetTab() {
    const tab = currentTab(); if (!(await LM.ask('Put the original figures back everywhere in this tab? All your edits in this tab will be removed.'))) return;
    Object.keys(edits).filter((k) => k.startsWith(tab + '|')).forEach((k) => delete edits[k]);
    panel_().querySelectorAll('[data-blk-key]').forEach((el) => { if (el.dataset.blkKey.startsWith(tab + '|')) { units(el).forEach((u) => { if (ORIG.has(u.key)) { u.set(ORIG.get(u.key)); unmark(u); } }); el.dataset.blkEdited = ''; if (el.__edpill) { el.__edpill.remove(); el.__edpill = null; } } });
    await persistEdits(); if (LM.toast) LM.toast('Original figures restored'); schedule();
  }
  let currentTab = () => ''; let panel_ = () => document.createElement('div');

  function attach(panel, getTab) {
    let timer = null; currentTab = getTab; panel_ = () => panel;
    const hideTag = (off, el) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'blk-pill'; b.textContent = off ? '▸ Show' : '▾ Hide'; b.title = off ? 'Show this block' : 'Hide this block'; if (el) b.addEventListener('click', (e) => { e.stopPropagation(); toggle(el); }); return b; };
    const editTag = (el) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'blk-edit'; b.textContent = '✎ Edit'; b.title = 'Edit the text and numbers in this block'; b.addEventListener('click', (e) => { e.stopPropagation(); startEdit(el); }); return b; };
    const nudge = () => { try { window.dispatchEvent(new Event('resize')); } catch (e) { /* ignore */ } }; // lets charts re-measure after a block is shown
    const setOff = (el, off) => {
      if (el.__bar) { el.classList.toggle('blk-hidden', off); el.__bar.pill.textContent = off ? '▸ Show' : '▾ Hide'; el.__bar.pill.title = off ? 'Show this block' : 'Hide this block'; if (el.__bar.edit) el.__bar.edit.style.display = off ? 'none' : ''; if (el.__edpill) el.__edpill.style.display = off ? 'none' : ''; }
      else { el.classList.toggle('blk-off', off); const p = el.querySelector(':scope > .blk-pill'); if (p) { p.textContent = off ? '▸ Show' : '▾ Hide'; p.title = off ? 'Show this block' : 'Hide this block'; } }
    };
    const toggle = (el) => { if (el.classList.contains('blk-editing')) cancelEdit(el); const key = el.dataset.blkKey; const off = !hidden.has(key); if (off) hidden.add(key); else hidden.delete(key); persistHidden(); setOff(el, off); if (!off) nudge(); schedule(); };
    const titleOf = (el, fallback) => { const hd = el.querySelector('h1,h2,h3,h4'); if (hd && txt(hd)) return txt(hd); const b = el.querySelector('.tools b, .tools strong, b'); if (b && txt(b)) return txt(b); const t = txt(el).slice(0, 48); return t || fallback; };

    function run() {
      timer = null; const tab = getTab(); const counts = {}; const found = []; const editable = canEdit();
      panel.querySelectorAll('.blk-bar').forEach((b) => { if (b.__target && !b.__target.isConnected) { if (b.__reused) { b.classList.remove('blk-bar'); b.querySelectorAll(':scope > .blk-pill, :scope > .blk-edit, :scope > .blk-edpill').forEach((x) => x.remove()); } else b.remove(); } });
      const key = (t) => { const k = `${tab}|${norm(t)}`; counts[k] = (counts[k] || 0) + 1; return `${k}|${counts[k]}`; };
      const sel = '.card:not([data-noblk]), .kpis, .tscroll, .chart, [data-blk]';
      panel.querySelectorAll(sel).forEach((el) => {
        if (el.closest('.rte, .modal, .blk-bar, .blk-edbar')) return;
        const isKpi = el.matches('.card.kpi'); const isRow = el.matches('.kpis'); const isCard = el.matches('.card, .kpis'); const own = el.matches('[data-blk]');
        if (isRow && el.querySelector(':scope > .card.kpi')) return; // a row of KPI tiles: every tile is its own block
        if (!isCard && !own && el.parentElement && el.parentElement.closest('.card:not(.kpi), .kpis, [data-blk]')) return; // table / chart inside a card: the card is the block
        if (isKpi && el.parentElement && el.parentElement.closest('.card:not(.kpi)') && !el.parentElement.closest('.kpis')) return;
        if (el.parentElement && el.parentElement.closest('.blk-hidden')) return;
        if (el.dataset.blkKey) { found.push(el); if ((isCard || own) && !el.__bar && !el.querySelector(':scope > .blk-pill')) { el.append(hideTag(el.classList.contains('blk-off'), el)); if (editable && units(el).length) el.append(editTag(el)); } return; }
        const fallback = isRow ? 'Key figures' : el.matches('.tscroll') ? 'Table' : el.matches('.chart') ? 'Chart' : 'Block';
        const prevEl = el.previousElementSibling; const prevHead = prevEl && /^H[1-4]$/.test(prevEl.tagName) && txt(prevEl) ? txt(prevEl) : null;
        const plain = !el.matches('.card, .kpis, [data-blk]'); // standalone table / chart
        const title = isRow ? 'Key figures' : isKpi ? (txt(el.querySelector('.l')) || 'Figure') : own ? (el.getAttribute('data-blk') || fallback) : plain ? (prevHead || fallback) : titleOf(el, fallback);
        const keyBase = plain && !prevHead ? (el.matches('.tscroll') ? 'table ' + [...el.querySelectorAll('th')].slice(0, 3).map(txt).join(' ') : fallback) : title;
        el.dataset.blkKey = key(keyBase); el.dataset.blkTitle = title; found.push(el);
        const off = hidden.has(el.dataset.blkKey);
        if (isCard || own && !el.matches('.tscroll, .chart')) { el.classList.add('blk'); el.setAttribute('data-blk-title', title); el.append(hideTag(off, el)); if (editable && units(el).length) el.append(editTag(el)); if (off) el.classList.add('blk-off'); }
        else { // standalone table / chart: put the tags in the heading just above it, or in a small bar
          const prev = el.previousElementSibling; let host; let label = null;
          if (prev && /^H[1-4]$/.test(prev.tagName) && !prev.querySelector('.blk-pill')) { host = prev; host.classList.add('blk-bar'); } else { host = document.createElement('div'); host.className = 'blk-bar'; label = document.createElement('span'); label.className = 'blk-label'; label.textContent = title; el.before(host); }
          const p = hideTag(off, el); const ed = editable && el.matches('.tscroll') && units(el).length ? editTag(el) : null; host.append(...[ed, p, label].filter(Boolean)); host.__target = el; host.__reused = !label; el.__bar = { host, pill: p, edit: ed }; if (off) el.classList.add('blk-hidden'); if (ed && off) ed.style.display = 'none';
        }
      });
      found.forEach((el) => { if (!el.classList.contains('blk-off') && !el.classList.contains('blk-hidden')) applyEdits(el); });
      // the bar of the tab: hidden blocks and edited blocks
      const mine = found.filter((el) => hidden.has(el.dataset.blkKey)); const edited = Object.keys(edits).filter((k) => k.startsWith(tab + '|') && edits[k].length); let bar = panel.querySelector(':scope > .blk-all');
      if (!mine.length && !edited.length) { if (bar) bar.remove(); return; }
      const msg = [mine.length ? `${mine.length} hidden block${mine.length > 1 ? 's' : ''}` : '', edited.length ? `${edited.length} edited block${edited.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') + ' in this tab';
      if (!bar) {
        bar = document.createElement('div'); bar.className = 'blk-all'; const s = document.createElement('span'); bar.append(s);
        const sa = document.createElement('button'); sa.type = 'button'; sa.className = 'btn small'; sa.dataset.act = 'show'; sa.textContent = 'Show all'; sa.addEventListener('click', () => { panel.querySelectorAll('[data-blk-key]').forEach((el) => { hidden.delete(el.dataset.blkKey); setOff(el, false); }); persistHidden(); nudge(); schedule(); });
        const ra = document.createElement('button'); ra.type = 'button'; ra.className = 'btn small'; ra.dataset.act = 'reset'; ra.textContent = 'Reset all edits'; ra.addEventListener('click', resetTab); bar.append(sa, ra); panel.prepend(bar);
      }
      bar.querySelector('[data-act=show]').style.display = mine.length ? '' : 'none'; bar.querySelector('[data-act=reset]').style.display = edited.length ? '' : 'none';
      const s = bar.firstChild; if (s.textContent !== msg) s.textContent = msg;
    }
    schedule = () => { if (timer == null) timer = setTimeout(run, 40); };
    new MutationObserver(() => schedule()).observe(panel, { childList: true, subtree: true });
    document.addEventListener('lm-week-changed', async () => { await loadEdits(); schedule(); });
    (LM.ready || Promise.resolve()).catch(() => {}).then(loadSaved);
    schedule();
  }
  LM.blocks = { attach, reload: async () => { await loadEdits(); schedule(); } };
})();
