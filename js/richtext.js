/* Rich text for notes (Word-like): fonts, sizes, colours, highlight, bold/italic/underline/strike, headings, lists, alignment,
   indent, links, clear formatting, undo/redo. Notes are stored as sanitised HTML (only a small safe set of tags and styles is
   kept), so what is saved and shown can never contain scripts or foreign markup, even when pasted from Word or a web page. */
(function () {
  const LM = window.LM; const { h } = LM;
  const TAGS = new Set(['p', 'div', 'br', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'sub', 'sup', 'font', 'h1', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li', 'a', 'mark', 'hr']);
  const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'link', 'meta', 'form', 'input', 'button', 'textarea', 'select', 'template', 'noscript', 'img', 'video', 'audio', 'canvas', 'title', 'head']);
  const BLOCKS = 'p,div,li,h1,h2,h3,blockquote';
  const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.\s,%]+\)|hsla?\(\s*[\d.\s,%deg]+\)|[a-z]{3,20}|transparent)$/i;
  const SIZE = /^(xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|\d+(\.\d+)?(px|pt|em|rem|%))$/i;
  const FAMILY = /^[\w\s,'"\-]+$/;
  const LEN = /^-?\d+(\.\d+)?(px|pt|em|rem|%)?$/;
  const FONT_SIZE_KW = { 1: 'x-small', 2: 'small', 3: 'medium', 4: 'large', 5: 'x-large', 6: 'xx-large', 7: 'xxx-large' };
  const okVal = (v) => !/url\(|expression|javascript|@import|[<>\\]/i.test(v);

  function cleanStyle(st) {
    const out = [];
    String(st || '').split(';').forEach((d) => {
      const i = d.indexOf(':'); if (i < 0) return; const p = d.slice(0, i).trim().toLowerCase(); let v = d.slice(i + 1).trim().replace(/\s*!important$/i, ''); if (!v || !okVal(v)) return;
      if ((p === 'color' || p === 'background-color') && COLOR.test(v)) out.push(`${p}:${v}`);
      else if (p === 'background' && COLOR.test(v)) out.push(`background-color:${v}`);
      else if (p === 'font-family' && FAMILY.test(v)) out.push(`font-family:${v}`);
      else if (p === 'font-size' && SIZE.test(v)) out.push(`font-size:${v}`);
      else if (p === 'font-weight' && /^(normal|bold|bolder|lighter|[1-9]00)$/i.test(v)) out.push(`font-weight:${v}`);
      else if (p === 'font-style' && /^(normal|italic|oblique)$/i.test(v)) out.push(`font-style:${v}`);
      else if ((p === 'text-decoration' || p === 'text-decoration-line') && /^(none|underline|line-through|overline)( (underline|line-through|overline))*$/i.test(v)) out.push(`text-decoration:${v}`);
      else if (p === 'text-align' && /^(left|right|center|justify|start|end)$/i.test(v)) out.push(`text-align:${v}`);
      else if (/^(margin|margin-left|margin-right|padding|padding-left|padding-right|text-indent)$/.test(p) && v.split(/\s+/).every((x) => LEN.test(x))) out.push(`${p}:${v}`);
      else if (p === 'vertical-align' && /^(sub|super|baseline)$/i.test(v)) out.push(`vertical-align:${v}`);
    });
    return out.join(';');
  }
  function cleanNode(node, doc) {
    const frag = doc.createDocumentFragment();
    [...node.childNodes].forEach((c) => {
      if (c.nodeType === 3) { frag.append(doc.createTextNode(c.nodeValue)); return; }
      if (c.nodeType !== 1) return;
      const tag = c.tagName.toLowerCase(); if (DROP.has(tag)) return;
      if (!TAGS.has(tag)) { frag.append(cleanNode(c, doc)); return; } // unknown tag: keep its text/children
      const el = doc.createElement(tag === 'strike' ? 's' : tag === 'font' ? 'span' : tag);
      let style = cleanStyle(c.getAttribute('style'));
      if (tag === 'font') { const col = c.getAttribute('color'), face = c.getAttribute('face'), sz = c.getAttribute('size'); const x = []; if (col && COLOR.test(col)) x.push(`color:${col}`); if (face && FAMILY.test(face)) x.push(`font-family:${face}`); if (sz && FONT_SIZE_KW[sz]) x.push(`font-size:${FONT_SIZE_KW[sz]}`); style = [style, ...x].filter(Boolean).join(';'); }
      if (style) el.setAttribute('style', style);
      const dir = c.getAttribute('dir'); if (dir && /^(ltr|rtl|auto)$/i.test(dir)) el.setAttribute('dir', dir.toLowerCase());
      if (tag === 'a') { const href = (c.getAttribute('href') || '').trim(); if (/^(https?:|mailto:)/i.test(href)) { el.setAttribute('href', href); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); } }
      el.append(cleanNode(c, doc)); frag.append(el);
    });
    return frag;
  }
  function sanitize(html) {
    const doc = new DOMParser().parseFromString('<!doctype html><body>' + String(html || ''), 'text/html'); const out = doc.createElement('div'); out.append(cleanNode(doc.body, doc));
    out.querySelectorAll(BLOCKS).forEach((el) => { if (!el.hasAttribute('dir')) el.setAttribute('dir', 'auto'); }); // each paragraph picks its own direction (English / Arabic)
    return out.innerHTML;
  }
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fromText = (t) => String(t || '').split(/\r?\n/).map((l) => `<div dir="auto">${l ? esc(l) : '<br>'}</div>`).join('');
  const toText = (html) => { const d = document.createElement('div'); d.innerHTML = sanitize(html); d.querySelectorAll('br').forEach((b) => b.replaceWith('\n')); d.querySelectorAll('div,p,li,h1,h2,h3,blockquote').forEach((b) => b.append('\n')); return d.textContent.replace(/\n{3,}/g, '\n\n').trim(); };

  const FONTS = ['Arial', 'Calibri', 'Cambria', 'Comic Sans MS', 'Courier New', 'Georgia', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];
  const SIZES = [[1, 'Tiny'], [2, 'Small'], [3, 'Normal'], [4, 'Medium'], [5, 'Large'], [6, 'X-large'], [7, 'Huge']];

  function editor(opts = {}) {
    const ed = h('div', { class: 'rte-body', contenteditable: 'true', dir: 'auto', spellcheck: 'true', 'data-placeholder': opts.placeholder || 'Write here…' });
    ed.innerHTML = opts.html ? sanitize(opts.html) : opts.text ? fromText(opts.text) : '';
    let saved = null;
    const inEd = () => { const s = getSelection(); return s && s.rangeCount && ed.contains(s.anchorNode); };
    const textPos = (node, off) => { const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let n; let sum = 0; while ((n = w.nextNode())) { if (n === node) return sum + off; sum += n.length; } return null; };
    const setTextPos = (pos) => { const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let n; let sum = 0; while ((n = w.nextNode())) { if (pos <= sum + n.length) { const cur = getSelection(); if (cur.rangeCount && cur.isCollapsed && cur.anchorNode === n && cur.anchorOffset === pos - sum) return; const r = document.createRange(); r.setStart(n, pos - sum); r.collapse(true); cur.removeAllRanges(); cur.addRange(r); return; } sum += n.length; } };
    const restore = () => { if (document.activeElement === ed && inEd()) return; ed.focus(); if (saved) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved); } };
    const run = (cmd, val) => { restore(); try { document.execCommand('styleWithCSS', false, true); } catch (e) { /* older browsers */ }
      const s0 = getSelection(); const pos = s0.rangeCount && s0.isCollapsed && inEd() && s0.anchorNode.nodeType === 3 && !/^(undo|redo)$/.test(cmd) ? textPos(s0.anchorNode, s0.anchorOffset) : null; // some browsers jump the caret to the start of the line after a list / block command
      document.execCommand(cmd, false, val == null ? null : val);
      if (pos != null) setTextPos(pos);
      fix(); sync(); };
    const fix = () => { ed.querySelectorAll(BLOCKS).forEach((el) => { if (!el.hasAttribute('dir')) el.setAttribute('dir', 'auto'); }); };
    const empty = () => !ed.textContent.trim() && !ed.querySelector('hr');
    const sync = () => ed.classList.toggle('is-empty', empty());
    const btn = (label, title, fn, cmd) => { const b = h('button', { type: 'button', class: 'rte-btn', title, onmousedown: (e) => e.preventDefault(), onclick: fn }, label); if (cmd) b.dataset.cmd = cmd; return b; };
    const sel = (title, first, opts2, fn) => { const s = h('select', { class: 'rte-sel', title, onchange: () => { if (s.value !== '') fn(s.value); s.value = ''; } }, h('option', { value: '' }, first), opts2.map(([v, l]) => h('option', { value: v }, l))); return s; };
    const color = (label, title, cmd, init) => { const i = h('input', { type: 'color', class: 'rte-color', value: init, title, oninput: () => run(cmd, i.value) }); return h('label', { class: 'rte-btn rte-colorwrap', title, onmousedown: () => { /* keep selection via saved range */ } }, label, i); };
    const linkRow = h('div', { class: 'rte-link', style: 'display:none' });
    const linkIn = h('input', { type: 'url', placeholder: 'https://…', class: 'rte-linkin' });
    const closeLink = () => { linkRow.style.display = 'none'; linkIn.value = ''; };
    const applyLink = () => { let u = linkIn.value.trim(); if (!u) return closeLink(); if (!/^(https?:|mailto:)/i.test(u)) u = 'https://' + u; closeLink(); restore(); if (saved && saved.collapsed) document.execCommand('insertHTML', false, `<a href="${esc(u)}">${esc(u)}</a>`); else document.execCommand('createLink', false, u); fix(); sync(); };
    linkRow.append(linkIn, h('button', { type: 'button', class: 'btn small primary', onclick: applyLink }, 'Apply'), h('button', { type: 'button', class: 'btn small', onclick: closeLink }, 'Cancel'));
    linkIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } });
    const bar = h('div', { class: 'rte-bar' },
      sel('Font', 'Font', FONTS.map((f) => [f, f]), (v) => run('fontName', v)), sel('Size', 'Size', SIZES.map(([v, l]) => [v, l]), (v) => run('fontSize', v)),
      sel('Style', 'Style', [['<h1>', 'Heading 1'], ['<h2>', 'Heading 2'], ['<h3>', 'Heading 3'], ['<blockquote>', 'Quote'], ['<div>', 'Normal text']], (v) => run('formatBlock', v)),
      h('span', { class: 'rte-sep' }),
      btn(h('b', {}, 'B'), 'Bold (Ctrl+B)', () => run('bold'), 'bold'), btn(h('i', {}, 'I'), 'Italic (Ctrl+I)', () => run('italic'), 'italic'), btn(h('u', {}, 'U'), 'Underline (Ctrl+U)', () => run('underline'), 'underline'), btn(h('s', {}, 'S'), 'Strikethrough', () => run('strikeThrough'), 'strikeThrough'),
      btn(h('span', {}, 'x', h('sub', {}, '2')), 'Subscript', () => run('subscript'), 'subscript'), btn(h('span', {}, 'x', h('sup', {}, '2')), 'Superscript', () => run('superscript'), 'superscript'),
      h('span', { class: 'rte-sep' }),
      color(h('span', { style: 'font-weight:700;border-bottom:3px solid #d00' }, 'A'), 'Text colour', 'foreColor', '#d00000'), color(h('span', { style: 'background:#ffe14d;padding:0 4px;font-weight:700' }, 'ab'), 'Highlight colour', 'hiliteColor', '#ffe14d'),
      h('span', { class: 'rte-sep' }),
      btn('☰', 'Align left', () => run('justifyLeft'), 'justifyLeft'), btn('≡', 'Centre', () => run('justifyCenter'), 'justifyCenter'), btn('☷', 'Align right', () => run('justifyRight'), 'justifyRight'), btn('▤', 'Justify', () => run('justifyFull'), 'justifyFull'),
      h('span', { class: 'rte-sep' }),
      btn('• List', 'Bullet list', () => run('insertUnorderedList'), 'insertUnorderedList'), btn('1. List', 'Numbered list', () => run('insertOrderedList'), 'insertOrderedList'), btn('⇥', 'Increase indent', () => run('indent')), btn('⇤', 'Decrease indent', () => run('outdent')),
      h('span', { class: 'rte-sep' }),
      btn('🔗', 'Insert link', () => { restore(); linkRow.style.display = 'flex'; linkIn.focus(); }), btn('⛓', 'Remove link', () => run('unlink')), btn('―', 'Horizontal line', () => run('insertHorizontalRule')),
      btn('Tx', 'Clear formatting', () => run('removeFormat')), btn('↶', 'Undo (Ctrl+Z)', () => run('undo')), btn('↷', 'Redo (Ctrl+Y)', () => run('redo')));
    const onSel = () => { if (!ed.isConnected) { document.removeEventListener('selectionchange', onSel); return; } if (!inEd()) return; saved = getSelection().getRangeAt(0).cloneRange(); bar.querySelectorAll('[data-cmd]').forEach((b) => { let on = false; try { on = document.queryCommandState(b.dataset.cmd); } catch (e) { on = false; } b.classList.toggle('on', !!on); }); };
    document.addEventListener('selectionchange', onSel);
    ed.addEventListener('input', () => { fix(); sync(); });
    ed.addEventListener('focus', () => { try { document.execCommand('styleWithCSS', false, true); document.execCommand('defaultParagraphSeparator', false, 'div'); } catch (e) { /* ignore */ } });
    ed.addEventListener('paste', (e) => { e.preventDefault(); const cd = e.clipboardData; if (!cd) return; const html = cd.getData('text/html'); const text = cd.getData('text/plain'); document.execCommand('insertHTML', false, html ? sanitize(html) : fromText(text)); fix(); sync(); });
    ed.addEventListener('drop', (e) => e.preventDefault());
    ed.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && opts.onSubmit) { e.preventDefault(); opts.onSubmit(); } });
    fix(); sync();
    const el = h('div', { class: 'rte' }, bar, linkRow, ed);
    return { el, focus: () => ed.focus(), isEmpty: empty, getHTML: () => sanitize(ed.innerHTML), getText: () => toText(ed.innerHTML), clear: () => { ed.innerHTML = ''; sync(); }, setHTML: (x) => { ed.innerHTML = sanitize(x); fix(); sync(); } };
  }
  LM.rich = { sanitize, toText, fromText, editor };
})();
