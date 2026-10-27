/* Cloud storage: when the dashboard is opened as its own website (not inside claude.ai), the records live in the D1 database behind
   /api/* (see cloud/worker.js). Everyone who can sign in sees the same data; only the administrators can upload, delete or restore.
   If /api is not there (local testing, a saved HTML copy, a plain file) it falls back to the browser's own storage exactly as before. */
(function () {
  const LM = window.LM; if (LM.snapshot && LM.snapshot.active) return; if (window.claude) return; if (!/^https?:$/.test(location.protocol)) return;
  const STORES = ['datasets', 'templates', 'history']; const KP = (s) => (s === 'templates' ? 'dept' : 'id');
  const { encode, decode } = LM.codec; const idOf = (s, k) => `${s}-${String(k).slice(0, 120)}`.replace(/[^A-Za-z0-9_\-.~:@+]/g, '_');

  function loginScreen() {
    const { h } = LM; const msg = h('div', { class: 'sub', style: 'color:var(--bad);min-height:18px;margin-top:8px' });
    const pw = h('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password', autofocus: true, style: 'width:100%;padding:10px 12px;margin-top:8px;border:1px solid var(--line);border-radius:8px;font:inherit;background:var(--surface);color:var(--ink)' });
    const go = h('button', { type: 'submit', class: 'btn primary', style: 'width:100%;margin-top:12px' }, 'Open dashboard');
    const form = h('form', { onsubmit: async (e) => { e.preventDefault(); go.disabled = true; msg.textContent = ''; try { const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-lm-request': '1' }, body: JSON.stringify({ password: pw.value }) }); if (r.ok) return location.reload(); let m = 'Could not sign in.'; try { m = (await r.json()).error || m; } catch (x) { /* ignore */ } msg.textContent = m; } catch (x) { msg.textContent = 'No connection. Try again.'; } go.disabled = false; } }, pw, go, msg);
    document.body.append(h('div', { class: 'overlay', style: 'align-items:center' }, h('div', { class: 'modal', style: 'max-width:380px' }, h('div', { class: 'mh' }, h('h3', {}, '☕ Weekly Department Dashboard')), h('div', { class: 'mb' }, h('div', { class: 'sub' }, 'Enter the password to open the dashboard.'), form))));
    setTimeout(() => pw.focus(), 50);
  }
  LM.ready = (async () => {
    let me; let res;
    const strict = !!window.LM_CLOUD_SITE; // the real website: never fall back to this browser's own storage
    const blocked = (msg) => { LM.notice = msg; LM.viewOnly = true; const no = async () => { throw new Error(msg); }; LM.db = { all: async () => [], get: async () => undefined, put: no, del: no, clear: no }; };
    try { res = await fetch('/api/ping', { cache: 'no-store' }); } catch (e) { if (strict) blocked('No connection to the server. Reload the page in a moment; nothing is shown or saved until it is back.'); return; }
    if (res.status === 404 || res.status === 405 || !(res.headers.get('content-type') || '').includes('json')) { if (strict) blocked('The server did not answer correctly (it may still be updating). Reload the page in a moment; nothing is shown or saved until it does.'); return; } // no cloud back-end here
    if (res.status === 401) { let j = {}; try { j = await res.json(); } catch (e) { /* not json */ } if (j.login) { loginScreen(); await new Promise(() => {}); return; } } // not signed in: show the sign-in form and stop here
    if (!res.ok) { LM.notice = 'The website could not verify your sign-in, or it is not configured yet (Cloudflare Access settings). Nothing is shown or saved until that is fixed.'; LM.viewOnly = true; LM.db = { all: async () => [], get: async () => undefined, put: async () => { throw new Error(LM.notice); }, del: async () => { throw new Error(LM.notice); }, clear: async () => { throw new Error(LM.notice); } }; return; }
    me = await res.json();
    const cache = {}; STORES.forEach((s) => (cache[s] = new Map()));
    const call = async (path, opt = {}) => { const r = await fetch('/api' + path, { cache: 'no-store', ...opt, headers: { 'content-type': 'application/json', 'x-lm-request': '1', ...(opt.headers || {}) } }); if (!r.ok) { let m = ''; try { m = (await r.json()).error; } catch (e) { /* not json */ } throw new Error(m || `Server answered ${r.status}`); } return r.json(); };
    async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } })); }
    let stamp = null; const markStamp = async () => { try { stamp = (await call('/stamp')).stamp; } catch (e) { /* next poll */ } };
    async function load(week) {
      const { records } = await call('/load?week=' + encodeURIComponent(week)); const fresh = {}; STORES.forEach((s) => (fresh[s] = new Map()));
      await pool(records, 8, async (r) => { if (!fresh[r.store]) return; try { const rec = await decode(r.data); if (r.week && !rec.week && r.store !== 'templates') rec.week = r.week; fresh[r.store].set(r.key, rec); } catch (e) { console.warn('record not read', r.id, e.message); } });
      STORES.forEach((s) => (cache[s] = fresh[s])); await markStamp();
    }
    const meta = (store, rec) => ({ store, key: String(rec[KP(store)]), dept: rec.dept || null, type: rec.type || null, week: store === 'templates' ? null : rec.week || null, start: rec.start || null, end: rec.end || null, file_name: rec.fileName || null, uploaded_at: rec.uploadedAt || null });
    let chain = Promise.resolve(); const serial = (fn) => (chain = chain.then(fn, fn));
    const denied = () => { throw new Error('View only: your account is not allowed to change data.'); };
    LM.cloud = { me, signOut: async () => { try { await call('/logout', { method: 'POST', body: '{}' }); } catch (e) { /* ignore */ } location.reload(); }, load, weeks: async () => (await call('/weeks')).weeks, async exportAll() { const { records } = await call('/export'); const out = { datasets: [], templates: [], history: [] }; await pool(records, 8, async (r) => { try { const rec = await decode(r.data); if (r.week && !rec.week && r.store !== 'templates') rec.week = r.week; if (out[r.store]) out[r.store].push(rec); } catch (e) { /* skip unreadable */ } }); return out; }, clearWeek: (week) => call('/clear', { method: 'POST', body: JSON.stringify({ week }) }) };
    LM.sharedMode = true; LM.cloudMode = true; LM.viewOnly = !me.canWrite;
    LM.db = {
      all: async (s) => [...cache[s].values()],
      get: async (s, k) => cache[s].get(k),
      put: async (s, v) => { if (!me.canWrite) denied(); cache[s].set(String(v[KP(s)]), v); await serial(async () => { await call('/rec', { method: 'PUT', body: JSON.stringify({ ...meta(s, v), data: await encode(v) }) }); await markStamp(); }); },
      del: async (s, k) => { if (!me.canWrite) denied(); cache[s].delete(String(k)); await serial(async () => { await call('/rec?id=' + encodeURIComponent(idOf(s, k)), { method: 'DELETE' }); await markStamp(); }); },
      clear: async (s) => { if (!me.canWrite) denied(); for (const k of [...cache[s].keys()]) await LM.db.del(s, k); },
    };
    if (!me.canWrite) { LM.filePicker = () => document.createElement('span'); LM.dropZone = () => {}; document.documentElement.classList.add('snap'); }
    // other people's uploads appear without a reload (one cheap request every few minutes while the page is open)
    setInterval(async () => { if (document.hidden) return; try { const s = (await call('/stamp')).stamp; if (stamp && s && s !== stamp) { await (LM.week ? LM.week.reload() : load('9999-12-31')); if (LM.refresh) LM.refresh(); if (LM.toast) LM.toast('Dashboard updated with new data'); } } catch (e) { /* offline: try again later */ } }, 180000);
  })();
})();
