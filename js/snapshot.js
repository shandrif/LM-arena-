/* Snapshot (read-only HTML copy of the whole dashboard with its data) + Clear dashboard.
   A snapshot file embeds the app and the stored data; when it opens it uses an in-memory database, so it never touches
   (or mixes with) the live dashboard's stored data. */
(function () {
  const LM = window.LM; const { h } = LM;
  const STORES = ['datasets', 'templates', 'history'];
  const b64 = (buf) => { let t = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(t); };
  const unb64 = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  const pack = (r) => (r.pdf instanceof ArrayBuffer ? { ...r, pdf: { __b64: b64(r.pdf) } } : r);
  const unpack = (r) => (r.pdf && r.pdf.__b64 ? { ...r, pdf: unb64(r.pdf.__b64) } : r);
  LM.packRecord = pack; LM.unpackRecord = unpack;

  const el = document.getElementById('lm-snapshot');
  LM.snapshot = { active: !!el, meta: null };

  if (el) { // ---------- opened from a saved HTML copy: read-only, in-memory ----------
    let snap = {}; try { snap = JSON.parse(el.textContent); } catch (e) { /* empty snapshot */ }
    LM.snapshot.meta = snap.meta || {};
    const mem = {}; STORES.forEach((s) => { mem[s] = new Map(); (snap[s] || []).forEach((r) => mem[s].set(r.id || r.dept, unpack(r))); });
    const kp = (s) => (s === 'templates' ? 'dept' : 'id');
    LM.db = { all: async (s) => [...mem[s].values()], get: async (s, k) => mem[s].get(k), put: async (s, v) => { mem[s].set(v[kp(s)], v); }, del: async (s, k) => { mem[s].delete(k); }, clear: async (s) => { mem[s].clear(); } };
    LM.filePicker = () => h('span');
    LM.dropZone = () => {};
    document.documentElement.classList.add('snap');
  }

  /* ---------- build a snapshot ---------- */
  const textOf = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(url + ' → ' + r.status); return r.text(); };
  const safe = (t) => t.replace(/<\/(script)/gi, '<\\/$1');
  async function build() {
    const data = {}; for (const s of STORES) data[s] = (await LM.db.all(s)).map(pack);
    if (!data.datasets.length) throw new Error('There is no data in the dashboard yet.');
    const today = new Date().toISOString().slice(0, 10); const ends = data.datasets.map((d) => d.end).filter((e) => e && e <= today).sort(); const latest = ends[ends.length - 1] || today;
    const meta = { savedAt: new Date().toISOString(), latest, datasets: data.datasets.length };
    let css = ''; const own = (sel) => { const t = [...document.querySelectorAll(sel + '[data-lm]')]; return t.length ? t : [...document.querySelectorAll(sel)]; };
    for (const n of own('link[rel=stylesheet],style')) css += n.tagName === 'STYLE' ? n.textContent : await textOf(n.getAttribute('href'));
    let js = ''; for (const n of own('script')) { if (n.id === 'lm-snapshot' || n.type === 'text/plain') continue; js += `<script>${safe(n.src ? await textOf(n.getAttribute('src')) : n.textContent)}</script>\n`; }
    let libs = ''; if (data.datasets.some((d) => d.pdf)) { // the PDF viewer needs pdf.js
      const get = async (id, url) => { const e = document.getElementById(id); return e ? e.textContent : textOf(url); };
      libs = `<script type="text/plain" id="lm-lib-pdf">${safe(await get('lm-lib-pdf', 'vendor/pdf.min.js'))}</script>\n<script type="text/plain" id="lm-lib-pdfworker">${safe(await get('lm-lib-pdfworker', 'vendor/pdf.worker.min.js'))}</script>\n`; }
    const json = JSON.stringify({ meta, ...data }).replace(/</g, '\\u003c');
    const html = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Weekly Department Dashboard – ${latest}</title>\n<style>${css}</style>\n</head>\n<body>\n<script type="application/json" id="lm-snapshot">${json}</script>\n${libs}${js}</body>\n</html>\n`;
    return { html, name: `weekly-dashboard-${latest}-saved-${today}.html`, meta };
  }
  async function download() {
    const { html, name } = await build(); const ok = await LM.saveFile(name, html, 'text/html'); if (ok) LM.toast(`Saved ${name}`); return name;
  }
  async function clearAll() { for (const s of ['datasets', 'history']) await LM.db.clear(s); }
  LM.snapshot.build = build; LM.snapshot.download = download; LM.snapshot.clearAll = clearAll;
})();
