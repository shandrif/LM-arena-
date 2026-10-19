/* PowerPoint (.pptx) reader: slide titles, text boxes (with position and font size), tables and native charts (real numbers).
   Runs in the browser with JSZip + DOMParser. Pictures are only counted. */
(function (root) {
  const LM = (root.LM = root.LM || {});
  const kids = (el, name) => { const out = []; for (let n = el && el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && (!name || n.localName === name)) out.push(n); return out; };
  const kid = (el, name) => kids(el, name)[0] || null;
  const desc = (el, name, out = []) => { for (let n = el && el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) { if (n.localName === name) out.push(n); desc(n, name, out); } return out; };
  const attr = (el, a) => (el && el.getAttribute ? el.getAttribute(a) : null);
  const clean = (s) => String(s == null ? '' : s).replace(/[​‎‏]/g, '').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').trim();

  function paragraphs(txBody) {
    const paras = []; let fs = 0;
    kids(txBody, 'p').forEach((p) => { let t = ''; kids(p).forEach((n) => { if (n.localName === 'r' || n.localName === 'fld') { t += (kid(n, 't') || {}).textContent || ''; const rp = kid(n, 'rPr'); const sz = rp && +attr(rp, 'sz'); if (sz) fs = Math.max(fs, sz / 100); } else if (n.localName === 'br') t += '\n'; }); paras.push(t); });
    return { text: clean(paras.join('\n')), fs: fs || null };
  }
  function tableRows(tbl) { return kids(tbl, 'tr').map((tr) => kids(tr, 'tc').map((tc) => clean(paragraphs(kid(tc, 'txBody') || tc).text).replace(/\n+/g, ' / '))); }

  function parseChart(doc) {
    const plot = desc(doc, 'plotArea')[0]; if (!plot) return null;
    const ct = kids(plot).find((n) => /Chart$/.test(n.localName)); if (!ct) return null;
    const pts = (cache) => { if (!cache) return []; const n = +attr(kid(cache, 'ptCount'), 'val') || 0; const arr = new Array(n).fill(null); kids(cache, 'pt').forEach((p) => { arr[+attr(p, 'idx')] = (kid(p, 'v') || {}).textContent; }); return arr; };
    const caches = (node) => desc(node, 'strCache')[0] || desc(node, 'numCache')[0] || null;
    const series = kids(ct, 'ser').map((s) => { const tx = kid(s, 'tx'); const name = tx ? ((desc(tx, 'v')[0] || {}).textContent || '') : ''; const cat = kid(s, 'cat'); const val = kid(s, 'val') || kid(s, 'yVal'); return { name: clean(name), cats: pts(cat ? caches(cat) : null).map((c) => (c == null ? '' : clean(c))), values: pts(val ? caches(val) : null).map((v) => (v == null || v === '' ? null : +v)) }; });
    const titleEl = kid(doc.documentElement, 'chart') && kid(kid(doc.documentElement, 'chart'), 'title');
    return { kind: 'chart', type: ct.localName.replace(/Chart$/, ''), dir: attr(kid(ct, 'barDir'), 'val') || '', grouping: attr(kid(ct, 'grouping'), 'val') || '', title: titleEl ? clean(desc(titleEl, 't').map((t) => t.textContent).join('')) : '', cats: series[0] ? series[0].cats : [], series: series.map((s) => ({ name: s.name, values: s.values })) };
  }

  async function read(buf) {
    const zip = await JSZip.loadAsync(buf);
    const parse = async (p) => { const f = zip.file(p); if (!f) return null; return new DOMParser().parseFromString(await f.async('string'), 'text/xml'); };
    const rels = async (p) => { const dir = p.replace(/[^/]*$/, ''); const d = await parse(dir + '_rels/' + p.slice(dir.length) + '.rels'); const m = {}; if (d) desc(d.documentElement, 'Relationship').forEach((r) => { let t = attr(r, 'Target'); if (!/^\//.test(t)) { const parts = (dir + t).split('/'); const out = []; parts.forEach((x) => { if (x === '..') out.pop(); else if (x !== '.') out.push(x); }); t = out.join('/'); } else t = t.slice(1); m[attr(r, 'Id')] = { target: t, type: (attr(r, 'Type') || '').split('/').pop() }; }); return m; };
    const pres = await parse('ppt/presentation.xml'); if (!pres) throw new Error('This is not a PowerPoint (.pptx) file.');
    const sz = desc(pres.documentElement, 'sldSz')[0]; const W = +attr(sz, 'cx') || 12192000, H = +attr(sz, 'cy') || 6858000;
    const prels = await rels('ppt/presentation.xml'); const order = desc(pres.documentElement, 'sldId').map((s) => prels[attr(s, 'r:id') || attr(s, 'id')] || prels[s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')]).filter(Boolean).map((r) => r.target);
    const slides = [];
    for (let i = 0; i < order.length; i++) {
      const path = order[i]; const doc = await parse(path); const r = await rels(path); const items = []; const cs = { pics: 0 };
      const xf = (el) => { const x = desc(el, 'xfrm')[0]; if (!x) return null; const off = kid(x, 'off'), ext = kid(x, 'ext'), co = kid(x, 'chOff'), ce = kid(x, 'chExt'); return off ? { x: +attr(off, 'x'), y: +attr(off, 'y'), w: ext ? +attr(ext, 'cx') : 0, h: ext ? +attr(ext, 'cy') : 0, cx: co ? +attr(co, 'x') : 0, cy: co ? +attr(co, 'y') : 0, cw: ce ? +attr(ce, 'cx') : 0, ch: ce ? +attr(ce, 'cy') : 0 } : null; };
      const walk = async (parent, T) => {
        for (const n of kids(parent)) {
          const ln = n.localName;
          if (ln === 'grpSp') { const g = xf(kid(n, 'grpSpPr') || n); let T2 = T; if (g && g.cw && g.ch) T2 = { x: (x) => T.x(g.x + (x - g.cx) * (g.w / g.cw)), y: (y) => T.y(g.y + (y - g.cy) * (g.h / g.ch)), sw: (w) => T.sw(w * (g.w / g.cw)), sh: (h) => T.sh(h * (g.h / g.ch)) }; await walk(n, T2); continue; }
          if (ln === 'sp') { const f = xf(kid(n, 'spPr') || n); const tb = kid(n, 'txBody'); if (!tb) continue; const p = paragraphs(tb); if (!p.text) continue; const ph = desc(n, 'ph')[0]; items.push({ kind: 'text', text: p.text, fs: p.fs, ph: ph ? attr(ph, 'type') || 'body' : '', x: f ? T.x(f.x) / W : 0, y: f ? T.y(f.y) / H : 0, w: f ? T.sw(f.w) / W : 0, h: f ? T.sh(f.h) / H : 0 }); continue; }
          if (ln === 'graphicFrame') { const fx = kid(n, 'xfrm'); const off = fx && kid(fx, 'off'), ext = fx && kid(fx, 'ext'); const pos = { x: off ? T.x(+attr(off, 'x')) / W : 0, y: off ? T.y(+attr(off, 'y')) / H : 0, w: ext ? T.sw(+attr(ext, 'cx')) / W : 0, h: ext ? T.sh(+attr(ext, 'cy')) / H : 0 };
            const tbl = desc(n, 'tbl')[0]; if (tbl) { items.push({ kind: 'table', rows: tableRows(tbl), ...pos }); continue; }
            const ch = desc(n, 'chart')[0]; if (ch) { const rid = attr(ch, 'r:id') || ch.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'); const rel = r[rid]; if (rel) { const cd = await parse(rel.target); const c = cd && parseChart(cd); if (c) items.push({ ...c, ...pos }); } } continue; }
          if (ln === 'pic') { cs.pics++; const f = xf(n); items.push({ kind: 'pic', name: attr(desc(n, 'cNvPr')[0], 'name') || 'Picture', x: f ? T.x(f.x) / W : 0, y: f ? T.y(f.y) / H : 0, w: f ? T.sw(f.w) / W : 0, h: f ? T.sh(f.h) / H : 0 }); }
        }
      };
      const tree = desc(doc.documentElement, 'spTree')[0]; await walk(tree, { x: (x) => x, y: (y) => y, sw: (w) => w, sh: (h) => h });
      let notes = ''; const nrel = Object.values(r).find((x) => x.type === 'notesSlide'); if (nrel) { const nd = await parse(nrel.target); if (nd) notes = clean(desc(nd.documentElement, 'sp').filter((s) => { const ph = desc(s, 'ph')[0]; return ph && attr(ph, 'type') === 'body'; }).map((s) => paragraphs(kid(s, 'txBody') || s).text).join('\n')); if (/^\d+$/.test(notes)) notes = ''; }
      items.sort((a, b) => (Math.abs(a.y - b.y) < 0.012 ? a.x - b.x : a.y - b.y));
      const texts = items.filter((x) => x.kind === 'text');
      const tp = texts.find((t) => /title/i.test(t.ph)); const top = texts.filter((t) => t.y < 0.2 && t.text.length < 140).sort((a, b) => a.y - b.y || (b.fs || 0) - (a.fs || 0)); const big = [...texts].filter((t) => t.text.length < 140).sort((a, b) => (b.fs || 0) - (a.fs || 0) || a.y - b.y)[0];
      const title = tp ? tp.text : (top[0] || big || { text: '' }).text.split('\n')[0];
      slides.push({ n: i + 1, title: clean(title), items, notes, pics: cs.pics });
    }
    return slides;
  }
  LM.pptx = { read };
})(typeof window !== 'undefined' ? window : globalThis);
