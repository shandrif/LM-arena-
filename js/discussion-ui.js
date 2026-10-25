/* Discussion points: free-text notes that stay on this device until you delete them.
   Stored in the 'templates' store (record dept = 'discussion'), so "Clear dashboard" keeps them and Backup / HTML copies include them. */
(function () {
  const LM = window.LM; const { h } = LM; LM.depts = LM.depts || {};
  const KEY = 'discussion';
  const DEPTS = ['General', 'Sales', 'Wastage', 'International', 'NEP', 'Procurement', 'Quality', 'Roasting', 'Training', 'Warehouse', 'Shipment', 'Bakery factory', 'Manual punch', 'Others'];
  const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

  LM.depts.discussion = {
    id: 'discussion', label: 'Discussion points',
    async mount(panel) {
      const readOnly = LM.snapshot && LM.snapshot.active;
      let notes = []; let fState = 'Open', fDept = 'All', q = ''; let editing = null;
      const load = async () => { const r = await LM.db.get('templates', KEY); notes = r && Array.isArray(r.notes) ? r.notes : []; };
      const save = async () => { await LM.db.put('templates', { dept: KEY, notes }); };
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* best effort: asks the browser not to evict this data */ }

      const box = h('textarea', { rows: 4, placeholder: 'Write a discussion point…  (Ctrl+Enter to add)', style: 'width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font:inherit;background:var(--surface);color:var(--ink);resize:vertical' });
      const deptSel = h('select', { class: 'sel' }, DEPTS.map((d) => h('option', { value: d }, d === 'General' ? 'Topic: General' : 'Topic: ' + d)));
      async function add() {
        const text = box.value.trim(); if (!text) return box.focus();
        notes.unshift({ id: LM.uid(), text, dept: deptSel.value, done: false, createdAt: new Date().toISOString() });
        await save(); box.value = ''; draw(); LM.toast('Note saved on this device');
      }
      box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); } });
      const search = h('input', { type: 'search', placeholder: 'Search notes…', oninput: () => { q = search.value.toLowerCase(); list(); } });
      const list$ = h('div');

      function noteEl(n) {
        if (editing === n.id) {
          const t = h('textarea', { rows: 4, style: 'width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font:inherit;background:var(--surface);color:var(--ink)' }, n.text); t.value = n.text;
          return h('div', { class: 'card', style: 'margin-bottom:10px' }, t, h('div', { class: 'tools', style: 'margin-top:8px' },
            h('button', { class: 'btn primary small', onclick: async () => { const v = t.value.trim(); if (!v) return; n.text = v; n.updatedAt = new Date().toISOString(); editing = null; await save(); list(); } }, 'Save'), h('button', { class: 'btn small', onclick: () => { editing = null; list(); } }, 'Cancel')));
        }
        return h('div', { class: 'card', style: 'margin-bottom:10px;' + (n.done ? 'opacity:.7' : '') },
          h('div', { style: 'display:flex;gap:10px;align-items:flex-start' },
            readOnly ? null : h('input', { type: 'checkbox', checked: n.done, title: 'Mark as discussed', style: 'margin-top:4px', onchange: async (e) => { n.done = e.target.checked; n.doneAt = n.done ? new Date().toISOString() : null; await save(); list(); } }),
            h('div', { style: 'flex:1;min-width:0' },
              h('div', { dir: 'auto', style: 'white-space:pre-wrap;word-break:break-word;' + (n.done ? 'text-decoration:line-through' : '') }, n.text),
              h('div', { class: 'sub', style: 'margin-top:6px' }, h('span', { class: 'pill' }, n.dept || 'General'), ` · added ${when(n.createdAt)}`, n.updatedAt ? ` · edited ${when(n.updatedAt)}` : '', n.done && n.doneAt ? ` · discussed ${when(n.doneAt)}` : '')),
            readOnly ? null : h('div', { style: 'display:flex;gap:6px' }, h('button', { class: 'btn small', onclick: () => { editing = n.id; list(); } }, 'Edit'),
              h('button', { class: 'btn small danger', onclick: async () => { if (!await LM.ask('Delete this note permanently?')) return; notes = notes.filter((x) => x.id !== n.id); await save(); list(); } }, 'Delete'))));
      }
      const visible = () => notes.filter((n) => (fState === 'All' || (fState === 'Open' ? !n.done : n.done)) && (fDept === 'All' || (n.dept || 'General') === fDept) && (!q || (n.text + ' ' + (n.dept || '')).toLowerCase().includes(q)));
      function list() {
        const v = visible(); const open = notes.filter((n) => !n.done).length;
        counts.textContent = `${open} open · ${notes.length - open} discussed · ${notes.length} total`;
        list$.replaceChildren(...(v.length ? v.map(noteEl) : [h('div', { class: 'empty' }, h('p', { class: 'sub' }, notes.length ? 'No notes match this filter.' : readOnly ? 'No notes in this copy.' : 'No notes yet. Write your first discussion point above.'))]));
      }
      function exportTxt() {
        const t = visible().map((n) => `[${n.done ? 'x' : ' '}] ${n.dept || 'General'} · ${when(n.createdAt)}\n${n.text}\n`).join('\n');
        LM.saveFile(`discussion-points-${new Date().toISOString().slice(0, 10)}.txt`, t, 'text/plain;charset=utf-8');
      }
      const counts = h('span', { class: 'sub' });
      function draw() {
        panel.replaceChildren(h('div', { class: 'head' }, h('h2', {}, 'Discussion points'), h('span', { class: 'sub' }, 'Saved on this device until you delete them. They are kept when you clear the dashboard.')),
          readOnly ? h('div', { class: 'banner' }, 'This is a saved copy: notes are shown read-only.') : h('div', { class: 'card', style: 'margin-bottom:12px' }, box, h('div', { class: 'tools', style: 'margin-top:8px' }, deptSel, h('div', { class: 'spacer' }), h('button', { class: 'btn primary', onclick: add }, 'Add note'))),
          h('div', { class: 'tools' }, h('select', { class: 'sel', onchange: (e) => { fState = e.target.value; list(); } }, ['Open', 'Discussed', 'All'].map((s) => h('option', { value: s, selected: s === fState }, s))),
            h('select', { class: 'sel', onchange: (e) => { fDept = e.target.value; list(); } }, ['All', ...DEPTS].map((s) => h('option', { value: s, selected: s === fDept }, s === 'All' ? 'All topics' : s))), search, counts, h('div', { class: 'spacer' }), h('button', { class: 'btn small', onclick: exportTxt }, 'Export .txt')),
          list$); list();
      }
      await load(); draw();
    },
  };
})();
