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
  const SIZES = [[1, 'Tiny'], [2, 'Normal'], [3, 'Medium'], [4, 'Large'], [5, 'X-large'], [6, 'XX-large'], [7, 'Huge']];

  const hsl = (hh, ss, ll) => { ss /= 100; ll /= 100; const k = (n) => (n + hh / 30) % 12; const a = ss * Math.min(ll, 1 - ll); const f = (n) => ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); };
  const PALETTE = [...['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'], ...[88, 76, 62, 48, 34, 22].flatMap((l) => [0, 28, 50, 120, 175, 210, 240, 270, 300, 335].map((hu) => hsl(hu, 85, l)))];
  const BLOCK_OPT = { h1: '<h1>', h2: '<h2>', h3: '<h3>', blockquote: '<blockquote>', div: '<div>', p: '<div>' };

  function editor(opts = {}) {
    const ed = h('div', { class: 'rte-body', contenteditable: 'true', dir: 'auto', spellcheck: 'true', 'data-placeholder': opts.placeholder || 'Write here…' });
    ed.innerHTML = opts.html ? sanitize(opts.html) : opts.text ? fromText(opts.text) : '';
    let saved = null; let openPop = null;
    const inEd = () => { const s = getSelection(); return !!(s && s.rangeCount && ed.contains(s.anchorNode)); };
    const textPos = (node, off) => { const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let n; let sum = 0; while ((n = w.nextNode())) { if (n === node) return sum + off; sum += n.length; } return null; };
    const setTextPos = (pos) => { const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let n; let sum = 0; while ((n = w.nextNode())) { if (pos <= sum + n.length) { const cur = getSelection(); if (cur.rangeCount && cur.isCollapsed && cur.anchorNode === n && cur.anchorOffset === pos - sum) return; const r = document.createRange(); r.setStart(n, pos - sum); r.collapse(true); cur.removeAllRanges(); cur.addRange(r); return; } sum += n.length; } };
    const restore = () => { if (document.activeElement === ed && inEd()) return; ed.focus(); const s = getSelection(); s.removeAllRanges(); if (saved && ed.contains(saved.startContainer)) s.addRange(saved); else { const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); s.addRange(r); } };
    const fix = () => { ed.querySelectorAll(BLOCKS).forEach((el) => { if (!el.hasAttribute('dir')) el.setAttribute('dir', 'auto'); }); };
    const empty = () => !ed.textContent.trim() && !ed.querySelector('hr');
    const sync = () => ed.classList.toggle('is-empty', empty());
    const q = (c) => { try { return String(document.queryCommandValue(c) || ''); } catch (e) { return ''; } };
    const qs = (c) => { try { return document.queryCommandState(c); } catch (e) { return false; } };
    let fontSel, sizeSel, styleSel;
    // shows what is under the cursor: pressed buttons, current font / size / style
    const refresh = () => {
      if (!ed.isConnected || !inEd()) return;
      bar.querySelectorAll('[data-cmd]').forEach((b) => b.classList.toggle('on', qs(b.dataset.cmd)));
      const f = q('fontName').replace(/["']/g, '').split(',')[0].trim(); fontSel.value = FONTS.find((x) => x.toLowerCase() === f.toLowerCase()) || '';
      const z = q('fontSize'); sizeSel.value = /^[1-7]$/.test(z) ? z : '';
      sizeSel.options[0].textContent = 'Size'; styleSel.value = BLOCK_OPT[q('formatBlock').replace(/[<>]/g, '').toLowerCase()] || '';
    };
    const run = (cmd, val) => {
      closePop(); restore(); try { document.execCommand('styleWithCSS', false, true); } catch (e) { /* older browsers */ }
      const s0 = getSelection(); const pos = s0.rangeCount && s0.isCollapsed && inEd() && s0.anchorNode.nodeType === 3 && !/^(undo|redo)$/.test(cmd) ? textPos(s0.anchorNode, s0.anchorOffset) : null; // some browsers jump the caret to the start of the line after a list / block command
      document.execCommand(cmd, false, val == null ? null : val);
      if (pos != null) setTextPos(pos);
      fix(); sync(); if (inEd()) saved = getSelection().getRangeAt(0).cloneRange(); refresh();
    };
    const btn = (label, title, fn, cmd) => { const b = h('button', { type: 'button', class: 'rte-btn', title, onclick: fn }, label); if (cmd) b.dataset.cmd = cmd; return b; };
    const sel = (title, first, opts2, fn) => h('select', { class: 'rte-sel', title, onchange: (e) => { const v = e.target.value; if (v !== '') fn(v); else refresh(); } }, h('option', { value: '' }, first), opts2.map(([v, l]) => h('option', { value: v }, l)));

    /* colour palette (text colour / highlight): a swatch grid instead of the browser's own picker, which can be blocked inside embedded pages */
    function closePop() { if (openPop) { openPop.pop.remove(); document.removeEventListener('mousedown', openPop.out, true); document.removeEventListener('keydown', openPop.esc, true); openPop = null; } }
    function colorBtn(label, title, cmd, kind) {
      const mark = h('span', { class: 'rte-mark' }); label.append(mark); mark.style.background = kind === 'text' ? '#d00000' : '#ffe14d';
      const b = h('button', { type: 'button', class: 'rte-btn', title }, label);
      const pick = (c) => { run(cmd, c); mark.style.background = c === 'transparent' ? 'transparent' : c; };
      b.addEventListener('click', () => {
        if (openPop && openPop.btn === b) return closePop(); closePop(); restore();
        const hex = h('input', { type: 'text', class: 'rte-hex', placeholder: '#rrggbb', maxlength: 7 });
        const useHex = () => { const v = hex.value.trim(); if (/^#?[0-9a-f]{6}$/i.test(v)) pick(v[0] === '#' ? v : '#' + v); };
        hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); useHex(); } });
        const none = kind === 'text' ? h('button', { type: 'button', class: 'rte-none', onclick: () => pick(getComputedStyle(ed).color) }, 'Default colour') : h('button', { type: 'button', class: 'rte-none', onclick: () => pick('transparent') }, 'No highlight');
        const pop = h('div', { class: 'rte-pop' }, h('div', { class: 'rte-sw' }, PALETTE.map((c) => h('button', { type: 'button', class: 'rte-swatch', title: c, style: `background:${c}`, onclick: () => pick(c) }))), h('div', { class: 'rte-pop-row' }, none, hex, h('button', { type: 'button', class: 'btn small', onclick: useHex }, 'Use')));
        pop.addEventListener('mousedown', (e) => { if (!e.target.closest('input')) e.preventDefault(); });
        b.parentElement.append(pop);
        const out = (e) => { if (!pop.contains(e.target) && !b.contains(e.target)) closePop(); }; const esc = (e) => { if (e.key === 'Escape') closePop(); };
        document.addEventListener('mousedown', out, true); document.addEventListener('keydown', esc, true); openPop = { pop, btn: b, out, esc };
      });
      return h('span', { class: 'rte-popwrap' }, b);
    }
    const linkRow = h('div', { class: 'rte-link', style: 'display:none' });
    const linkIn = h('input', { type: 'url', placeholder: 'https://…', class: 'rte-linkin' });
    const closeLink = () => { linkRow.style.display = 'none'; linkIn.value = ''; };
    const applyLink = () => { let u = linkIn.value.trim(); if (!u) return closeLink(); if (!/^(https?:|mailto:)/i.test(u)) u = 'https://' + u; closeLink(); restore(); if (saved && saved.collapsed) document.execCommand('insertHTML', false, `<a href="${esc(u)}">${esc(u)}</a>`); else document.execCommand('createLink', false, u); fix(); sync(); refresh(); };
    linkRow.append(linkIn, h('button', { type: 'button', class: 'btn small primary', onclick: applyLink }, 'Apply'), h('button', { type: 'button', class: 'btn small', onclick: closeLink }, 'Cancel'));
    linkIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } else if (e.key === 'Escape') closeLink(); });
    fontSel = sel('Font', 'Font', FONTS.map((f) => [f, f]), (v) => run('fontName', v)); sizeSel = sel('Size', 'Size', SIZES.map(([v, l]) => [v, l]), (v) => run('fontSize', v));
    styleSel = sel('Style', 'Style', [['<h1>', 'Heading 1'], ['<h2>', 'Heading 2'], ['<h3>', 'Heading 3'], ['<blockquote>', 'Quote'], ['<div>', 'Normal text']], (v) => run('formatBlock', v));
    const bar = h('div', { class: 'rte-bar' }, fontSel, sizeSel, styleSel,
      h('span', { class: 'rte-sep' }),
      btn(h('b', {}, 'B'), 'Bold (Ctrl+B)', () => run('bold'), 'bold'), btn(h('i', {}, 'I'), 'Italic (Ctrl+I)', () => run('italic'), 'italic'), btn(h('u', {}, 'U'), 'Underline (Ctrl+U)', () => run('underline'), 'underline'), btn(h('s', {}, 'S'), 'Strikethrough', () => run('strikeThrough'), 'strikeThrough'),
      btn(h('span', {}, 'x', h('sub', {}, '2')), 'Subscript', () => run('subscript'), 'subscript'), btn(h('span', {}, 'x', h('sup', {}, '2')), 'Superscript', () => run('superscript'), 'superscript'),
      h('span', { class: 'rte-sep' }),
      colorBtn(h('span', { class: 'rte-glyph' }, 'A'), 'Text colour', 'foreColor', 'text'), colorBtn(h('span', { class: 'rte-glyph' }, 'ab'), 'Highlight colour', 'hiliteColor', 'mark'),
      h('span', { class: 'rte-sep' }),
      btn('☰', 'Align left', () => run('justifyLeft'), 'justifyLeft'), btn('≡', 'Centre', () => run('justifyCenter'), 'justifyCenter'), btn('☷', 'Align right', () => run('justifyRight'), 'justifyRight'), btn('▤', 'Justify', () => run('justifyFull'), 'justifyFull'),
      h('span', { class: 'rte-sep' }),
      btn('• List', 'Bullet list', () => run('insertUnorderedList'), 'insertUnorderedList'), btn('1. List', 'Numbered list', () => run('insertOrderedList'), 'insertOrderedList'), btn('⇥', 'Increase indent', () => run('indent')), btn('⇤', 'Decrease indent', () => run('outdent')),
      h('span', { class: 'rte-sep' }),
      btn('🔗', 'Insert link', () => { closePop(); restore(); linkRow.style.display = 'flex'; linkIn.focus(); }), btn('⛓', 'Remove link', () => run('unlink')), btn('―', 'Horizontal line', () => run('insertHorizontalRule')),
      btn('Tx', 'Clear formatting', () => run('removeFormat')), btn('↶', 'Undo (Ctrl+Z)', () => run('undo')), btn('↷', 'Redo (Ctrl+Y)', () => run('redo')));
    // pressing a toolbar button must not take the cursor / selection away from the text (selects and inputs still need their own focus)
    bar.addEventListener('mousedown', (e) => { if (!e.target.closest('select, input')) e.preventDefault(); });
    const onSel = () => { if (!ed.isConnected) { document.removeEventListener('selectionchange', onSel); return; } if (!inEd()) return; saved = getSelection().getRangeAt(0).cloneRange(); refresh(); };
    document.addEventListener('selectionchange', onSel);
    ed.addEventListener('input', () => { fix(); sync(); });
    ed.addEventListener('keyup', refresh); ed.addEventListener('mouseup', refresh);
    ed.addEventListener('focus', () => { try { document.execCommand('styleWithCSS', false, true); document.execCommand('defaultParagraphSeparator', false, 'div'); } catch (e) { /* ignore */ } refresh(); });
    ed.addEventListener('paste', (e) => { e.preventDefault(); const cd = e.clipboardData; if (!cd) return; const html = cd.getData('text/html'); const text = cd.getData('text/plain'); document.execCommand('insertHTML', false, html ? sanitize(html) : fromText(text)); fix(); sync(); });
    ed.addEventListener('drop', (e) => e.preventDefault());
    ed.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && opts.onSubmit) { e.preventDefault(); opts.onSubmit(); } });
    fix(); sync();
    const el = h('div', { class: 'rte' }, bar, linkRow, ed);
    return { el, focus: () => ed.focus(), isEmpty: empty, getHTML: () => sanitize(ed.innerHTML), getText: () => toText(ed.innerHTML), clear: () => { ed.innerHTML = ''; sync(); closePop(); }, setHTML: (x) => { ed.innerHTML = sanitize(x); fix(); sync(); } };
  }
  LM.rich = { sanitize, toText, fromText, editor };
})();
