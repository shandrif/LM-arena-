/* PDF support (pdf.js, loaded on first use): page viewer + reader for monthly "Events Calendar" pages.
   The event type (B2C / B2B / order) comes from the cell colour, sampled from the rendered page. Browser only. */
(function () {
  const LM = (window.LM = window.LM || {});
  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s); });
  let ready;
  const lib = () => ready || (ready = (async () => { const emb = (id) => { const e = document.getElementById(id); return e ? URL.createObjectURL(new Blob([e.textContent], { type: 'text/javascript' })) : null; }; const eMain = emb('lm-lib-pdf'), eWork = emb('lm-lib-pdfworker'); if (!window.pdfjsLib) { await loadScript(eMain || 'vendor/pdf.min.js'); if (!eWork) { try { await loadScript('vendor/pdf.worker.min.js'); } catch (e) { /* worker loaded separately */ } } } window.pdfjsLib.GlobalWorkerOptions.workerSrc = eWork || 'vendor/pdf.worker.min.js'; return window.pdfjsLib; })());
  const open = async (buf) => { const L = await lib(); return L.getDocument({ data: buf.slice(0) }).promise; };
  const render = async (doc, n, canvas, scale = 1.4) => { const page = await doc.getPage(n); const vp = page.getViewport({ scale }); canvas.width = vp.width; canvas.height = vp.height; await page.render({ canvasContext: canvas.getContext('2d', { willReadFrequently: true }), viewport: vp }).promise; return { page, vp }; };
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const DATE = /^\d{1,2}(\s*(to|t0|-|–|—)\s*\d{1,2})?(\s*[A-Za-z]{3,4})?$/;
  const SKIP = /^(date|event|orders?|b2c events|b2b events|partnerships events|&|\/)$/i;

  async function calendar(buf) {
    const doc = await open(buf); const pages = []; const text = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const canvas = document.createElement('canvas'); const { page, vp } = await render(doc, n, canvas, 1.5); const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const tc = await page.getTextContent(); const its = tc.items.map((i) => { const [x, y] = vp.convertToViewportPoint(i.transform[4], i.transform[5]); return { s: i.str.replace(/\s+/g, ' ').trim(), x, y, w: i.width * vp.scale, h: Math.abs(i.height * vp.scale) || 12 }; }).filter((i) => i.s);
      text.push(its.map((i) => i.s).join(' '));
      const title = its.find((i) => /events calendar/i.test(i.s)); const mm = title && /\(([A-Za-z]+)\)/.exec(title.s); const month = mm ? MONTHS[mm[1].slice(0, 3).toLowerCase()] : null;
      // header rows = lines holding at least two date-like items
      const lines = []; [...its].sort((a, b) => a.y - b.y || a.x - b.x).forEach((i) => { const l = lines.find((q) => Math.abs(q.y - i.y) < 4); if (l) l.items.push(i); else lines.push({ y: i.y, items: [i] }); });
      const heads = lines.filter((l) => l.items.filter((i) => DATE.test(i.s)).length >= 2).map((l) => ({ y: l.y, cols: l.items.filter((i) => DATE.test(i.s)).sort((a, b) => a.x - b.x) })); const events = [];
      const legendY = (its.find((i) => /^b2c events/i.test(i.s)) || { y: 1e9 }).y; const ordersLabel = its.filter((i) => /^orders?$/i.test(i.s));
      heads.forEach((hd, hi) => { const y0 = hd.y + 6, y1 = hi + 1 < heads.length ? heads[hi + 1].y - 4 : legendY - 4; const cx = hd.cols.map((c) => c.x + c.w / 2); const body = its.filter((i) => i.y > y0 && i.y < y1 && !hd.cols.includes(i) && !SKIP.test(i.s) && !/^date$/i.test(i.s) && !(title && i === title) && i.x > hd.cols[0].x - 30);
        const colOf = (i) => { const c = i.x + i.w / 2; let b = 0, d = 1e9; cx.forEach((q, k) => { if (Math.abs(q - c) < d) { d = Math.abs(q - c); b = k; } }); return b; };
        const byCol = {}; body.forEach((i) => { const k = colOf(i); (byCol[k] = byCol[k] || []).push(i); });
        Object.entries(byCol).forEach(([k, arr]) => { arr.sort((a, b) => a.y - b.y); let cur = null; arr.forEach((i) => { if (cur && i.y - cur.lastY <= Math.max(i.h, 10) * 1.9 && Math.abs((i.x + i.w / 2) - cur.cx) < 60) { cur.parts.push(i.s); cur.lastY = i.y; } else { cur = { parts: [i.s], lastY: i.y, cx: i.x + i.w / 2, first: i, col: +k }; events.push(cur); } }); });
        events.filter((e) => !e.done && e.first && body.includes(e.first)).forEach((e) => { e.done = true; e.table = hi > 0 || ordersLabel.length && hd.y > ordersLabel[0].y - 40 ? 'orders' : 'events'; e.dateLabel = hd.cols[e.col] ? hd.cols[e.col].s : ''; const px = Math.max(0, Math.round(e.first.x - 3)), py = Math.round(e.first.y - e.first.h * 0.3); let kind = '?'; try { const d = ctx.getImageData(px, py, 1, 1).data; const [r, g, b] = d; kind = r > 235 && g < 190 && b < 190 ? 'B2B' : g > 200 && b > 190 && r < 235 && r > 170 ? 'B2C' : '?'; } catch (er) { /* canvas blocked */ } e.kind = e.table === 'orders' ? 'Order' : kind; });
      });
      pages.push({ page: n, month, title: title ? title.s : '', headers: heads.map((h2) => h2.cols.map((c) => c.s)), events: events.filter((e) => e.done).map((e) => ({ month, dateLabel: e.dateLabel, text: e.parts.reduce((a, p) => { const lt = (a.split(' ').pop() || ''); return a && /^[a-z]{1,5}$/.test(p) && /[a-z]$/.test(a) && (p.length <= 2 || lt.length >= 8) ? a + p : a ? a + ' ' + p : p; }, '').replace(/\s+/g, ' ').trim(), kind: e.kind, table: e.table })) });
    }
    return { pages, text, numPages: doc.numPages };
  }
  LM.pdf = { open, render, calendar };
})();
