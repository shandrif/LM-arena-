/* Shared storage. When the dashboard runs as a claude.ai artifact it keeps its data in the artifact's shared database, so
   everyone with the link sees the same data. Only people who can edit the artifact (the owner) can upload, clear or restore;
   everybody else gets a read-only live view. Outside claude.ai (or if the database is unavailable) it falls back to the
   browser's own IndexedDB exactly as before.
   Layout: rec/<store>-<key>  = { store, key, ver, n, at }  and  rec/<store>-<key>/c/<000..>  = { d: <chunk of gzip+base64 JSON> }
   (a document holds at most 256 KiB, so each record is compressed and split into chunks). */
(function () {
  const LM = window.LM; if (LM.snapshot && LM.snapshot.active) return;
  const STORES = ['datasets', 'templates', 'history']; const CHUNK = 150000;
  LM.sharedMode = false; LM.viewOnly = false;
  if (!window.claude || typeof window.claude.use !== 'function') return;

  const local = LM.db; const KP = (s) => (s === 'templates' ? 'dept' : 'id');
  const safeId = (s) => String(s).replace(/[^A-Za-z0-9_\-.~:@+]/g, '_');
  const toB64 = (u8) => { let t = ''; for (let i = 0; i < u8.length; i += 0x8000) t += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(t); };
  const fromB64 = (s) => { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const pipe = async (u8, stream) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer());
  const hasGz = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
  async function encode(rec) { const raw = new TextEncoder().encode(JSON.stringify(LM.packRecord(rec))); return hasGz ? 'z' + toB64(await pipe(raw, new CompressionStream('gzip'))) : 'j' + toB64(raw); }
  async function decode(str) { let u = fromB64(str.slice(1)); if (str[0] === 'z') u = await pipe(u, new DecompressionStream('gzip')); return LM.unpackRecord(JSON.parse(new TextDecoder().decode(u))); }

  LM.ready = (async () => {
    let db, user; try { db = await window.claude.use('db'); user = await window.claude.use('user'); } catch (e) { db = null; }
    if (!db) return;
    const canWrite = user ? !!(user.canEdit() || user.isOwner()) : true;
    const cache = {}; STORES.forEach((s) => (cache[s] = new Map())); const vers = new Map(); const recs = db.collection('rec');
    const docId = (s, k) => `${s}-${safeId(k)}`; const chunkId = (i) => String(i).padStart(4, '0');
    async function loadOne(meta) {
      const cs = await recs.doc(meta.id).collection('c').orderBy('i').limit(1000).get(); const parts = cs.docs.map((d) => d.data().d); if (parts.length < meta.n) throw new Error(`${meta.id}: ${parts.length}/${meta.n} chunks`);
      return decode(parts.join(''));
    }
    async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } })); }
    async function loadAll() {
      const snap = await recs.limit(1000).get(); const metas = snap.docs.map((d) => ({ id: d.id, ...d.data() })); const seen = new Set();
      await pool(metas, 6, async (m) => { if (!STORES.includes(m.store)) return; seen.add(m.id); if (vers.get(m.id) === m.ver && cache[m.store].has(m.key)) return; try { const r = await loadOne(m); cache[m.store].set(m.key, r); vers.set(m.id, m.ver); } catch (e) { console.warn('shared record not read', e.message); } });
      STORES.forEach((s) => [...cache[s].keys()].forEach((k) => { if (!seen.has(docId(s, k))) { cache[s].delete(k); vers.delete(docId(s, k)); } }));
      return metas.length;
    }
    async function removeChunks(id, from, to) { for (let i = from; i < to; i++) await recs.doc(id).collection('c').doc(chunkId(i)).delete(); }
    async function write(store, rec) {
      const key = rec[KP(store)]; const id = docId(store, key); const str = await encode(rec); const parts = []; for (let i = 0; i < str.length; i += CHUNK) parts.push(str.slice(i, i + CHUNK));
      const old = await recs.doc(id).get(); const oldN = old.exists ? old.data().n || 0 : 0; const ver = Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      for (let i = 0; i < parts.length; i++) await recs.doc(id).collection('c').doc(chunkId(i)).set({ i, d: parts[i] });
      vers.set(id, ver); await recs.doc(id).set({ store, key: String(key), ver, n: parts.length, end: rec.end || null, at: new Date().toISOString() });
      if (oldN > parts.length) await removeChunks(id, parts.length, oldN);
    }
    async function remove(store, key) { const id = docId(store, key); const old = await recs.doc(id).get(); const n = old.exists ? old.data().n || 0 : 0; await recs.doc(id).delete(); vers.delete(id); await removeChunks(id, 0, n); }
    const denied = () => { throw new Error('This is a shared, view-only dashboard. Only the owner can change data.'); };
    // keep concurrent writes of different records from overlapping on the same document
    let chain = Promise.resolve(); const serial = (fn) => (chain = chain.then(fn, fn));

    let count = 0; try { count = await loadAll(); } catch (e) { console.warn('shared db not readable', e); return; }
    LM.sharedMode = true; LM.viewOnly = !canWrite;
    LM.db = {
      all: async (s) => [...cache[s].values()],
      get: async (s, k) => cache[s].get(k),
      put: async (s, v) => { if (!canWrite) denied(); const k = v[KP(s)]; cache[s].set(k, v); await serial(() => write(s, v)); },
      del: async (s, k) => { if (!canWrite) denied(); cache[s].delete(k); await serial(() => remove(s, k)); },
      clear: async (s) => { if (!canWrite) denied(); const keys = [...cache[s].keys()]; cache[s].clear(); for (const k of keys) await serial(() => remove(s, k)); },
    };
    if (!canWrite) { LM.filePicker = () => document.createElement('span'); LM.dropZone = () => {}; document.documentElement.classList.add('snap'); }

    // changes made by someone else show up without a reload
    let timer = null; let first = true;
    recs.onSnapshot((snap) => { if (first) { first = false; return; } const ours = snap.docChanges().every((c) => c.doc.metadata.hasPendingWrites || vers.get(c.doc.id) === (c.doc.data() || {}).ver); if (ours) return; clearTimeout(timer); timer = setTimeout(async () => { try { await loadAll(); if (LM.refresh) LM.refresh(); if (LM.toast) LM.toast('Dashboard updated with new data'); } catch (e) { /* next change retries */ } }, 1500); }, () => {});

    // first time on the shared dashboard: offer to publish what this browser already holds
    if (canWrite && !count) {
      let n = 0; try { n = (await local.all('datasets')).length; } catch (e) { n = 0; }
      if (n && LM.ask && await LM.ask(`This browser already holds ${n} uploaded report(s). Publish them to the shared dashboard so everyone with the link sees them?`)) {
        for (const s of STORES) for (const r of await local.all(s)) await LM.db.put(s, r);
        if (LM.toast) LM.toast('Your data is now shared');
      }
    }
  })();
})();
