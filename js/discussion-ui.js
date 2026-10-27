/* Discussion points: free-text notes that stay on this device until you delete them.
   Stored in the 'templates' store (record dept = 'discussion'), so "Clear dashboard" keeps them and Backup / HTML copies include them. */
(function () {
  const LM = window.LM; const { h } = LM; LM.depts = LM.depts || {};
  const KEY = 'discussion';
  const DEPTS = ['General', 'Sales', 'Wastage', 'International', 'NEP', 'Procurement', 'Quality', 'Roasting', 'Training', 'Warehouse', 'Shipment', 'Bakery factory', 'Manual punch', 'Real estate'];
  const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

  LM.depts.discussion = {
    id: 'discussion', label: 'Discussion points',
    async mount(panel) {
      const readOnly = !!((LM.snapshot && LM.snapshot.active) || LM.viewOnly);
      let notes = []; let fState = 'Open', fDept = 'All', q = ''; let editing = null;
      const load = async () => { const r = await LM.db.get('templates', KEY); notes = r && Array.isArray(r.notes) ? r.notes : []; notes.forEach((n) => { if (n.dept === 'Others') n.dept = 'Real estate'; }); };
      const save = async () => { await LM.db.put('templates', { dept: KEY, notes }); };
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* best effort: asks the browser not to evict this data */ }

      const ed = LM.rich.editor({ placeholder: 'Write a discussion point…  (Ctrl+Enter to add)', onSubmit: () => add() });
      const deptSel = h('select', { class: 'sel' }, DEPTS.map((d) => h('option', { value: d }, d === 'General' ? 'Topic: General' : 'Topic: ' + d)));
      async function add() {
        if (ed.isEmpty()) return ed.focus();
        notes.unshift({ id: LM.uid(), text: ed.getText(), html: ed.getHTML(), dept: deptSel.value, done: false, createdAt: new Date().toISOString() });
        await save(); ed.clear(); draw(); LM.toast('Note saved');
      }
      const search = h('input', { type: 'search', placeholder: 'Search notes…', oninput: () => { q = search.value.toLowerCase(); list(); } });
      const list$ = h('div');

      function noteEl(n) {
        if (editing === n.id) {
          const t = LM.rich.editor({ html: n.html, text: n.html ? '' : n.text });
          return h('div', { class: 'card', 'data-noblk': '1', style: 'margin-bottom:10px' }, t.el, h('div', { class: 'tools', style: 'margin-top:8px' },
            h('button', { class: 'btn primary small', onclick: async () => { if (t.isEmpty()) return; n.text = t.getText(); n.html = t.getHTML(); n.updatedAt = new Date().toISOString(); editing = null; await save(); list(); } }, 'Save'), h('button', { class: 'btn small', onclick: () => { editing = null; list(); } }, 'Cancel')));
        }
        return h('div', { class: 'card', 'data-noblk': '1', style: 'margin-bottom:10px;' + (n.done ? 'opacity:.7' : '') },
          h('div', { style: 'display:flex;gap:10px;align-items:flex-start' },
            readOnly ? null : h('input', { type: 'checkbox', checked: n.done, title: 'Mark as discussed', style: 'margin-top:4px', onchange: async (e) => { n.done = e.target.checked; n.doneAt = n.done ? new Date().toISOString() : null; await save(); list(); } }),
            h('div', { style: 'flex:1;min-width:0' },
              n.html ? h('div', { class: 'rt', style: n.done ? 'text-decoration:line-through' : '', html: LM.rich.sanitize(n.html) }) : h('div', { dir: 'auto', style: 'white-space:pre-wrap;word-break:break-word;' + (n.done ? 'text-decoration:line-through' : '') }, n.text),
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
        panel.replaceChildren(h('div', { class: 'head' }, h('h2', {}, 'Discussion points'), h('span', { class: 'sub' }, 'Saved with the dashboard until you delete them. They are kept when you clear the dashboard.')),
          readOnly ? h('div', { class: 'banner' }, 'This is a saved copy: notes are shown read-only.') : h('div', { class: 'card', style: 'margin-bottom:12px' }, ed.el, h('div', { class: 'tools', style: 'margin-top:8px' }, deptSel, h('div', { class: 'spacer' }), h('button', { class: 'btn primary', onclick: add }, 'Add note'))),
          h('div', { class: 'tools' }, h('select', { class: 'sel', onchange: (e) => { fState = e.target.value; list(); } }, ['Open', 'Discussed', 'All'].map((s) => h('option', { value: s, selected: s === fState }, s))),
            h('select', { class: 'sel', onchange: (e) => { fDept = e.target.value; list(); } }, ['All', ...DEPTS].map((s) => h('option', { value: s, selected: s === fDept }, s === 'All' ? 'All topics' : s))), search, counts, h('div', { class: 'spacer' }), h('button', { class: 'btn small', onclick: exportTxt }, 'Export .txt')),
          list$); list();
      }
      await load(); draw();
    },
  };
})();
