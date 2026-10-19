/* Shared browser helpers: DOM, formatting, storage (IndexedDB), file reading, review dialog, tables, charts. */
(function () {
  const LM = (window.LM = window.LM || {});

  /* ---------- DOM + formatting ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'checked' || k === 'disabled' || k === 'value' || k === 'selected') e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat(9).forEach((c) => c != null && c !== false && e.append(c.nodeType ? c : document.createTextNode(c)));
    return e;
  }
  const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = (v) => (v == null || isNaN(v) ? '–' : nf0.format(Math.round(v)));
  const num2 = (v) => (v == null || isNaN(v) ? '–' : nf2.format(v));
  const pct = (v, d = 1) => (v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%');
  const pct0 = (v) => (v == null ? '–' : (v * 100).toFixed(1) + '%');
  const compact = (v) => (v == null ? '–' : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : nf0.format(v));
  const delta = (v) => h('span', { class: v == null ? 'flat' : v > 0.0005 ? 'up' : v < -0.0005 ? 'down' : 'flat' }, v == null ? '–' : (v > 0.0005 ? '▲ ' : v < -0.0005 ? '▼ ' : '● ') + pct(v));
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const dayLabel = (d) => { const [, m, dd] = d.split('-'); return `${+dd} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]}`; };
  const shortName = (s) => String(s).replace(/^B\d+\s*[-,،]?\s*/, (m) => m.trim().replace(/[-,،]$/, '') + ' ');

  function toast(msg) {
    const t = h('div', { class: 'toast' }, msg); document.body.append(t); setTimeout(() => t.remove(), 3500);
  }

  /* ---------- IndexedDB ---------- */
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('lm-dashboard', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('datasets', { keyPath: 'id' });
      d.createObjectStore('templates', { keyPath: 'dept' });
      d.createObjectStore('history', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (store, mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode); const s = t.objectStore(store); const q = fn(s);
      t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error);
    });
  };
  LM.db = {
    all: (s) => tx(s, 'readonly', (o) => o.getAll()),
    get: (s, k) => tx(s, 'readonly', (o) => o.get(k)),
    put: (s, v) => tx(s, 'readwrite', (o) => o.put(v)),
    del: (s, k) => tx(s, 'readwrite', (o) => o.delete(k)),
    clear: (s) => tx(s, 'readwrite', (o) => o.clear()),
  };
  LM.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---------- file reading ---------- */
  async function sha(buf) {
    const d = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  LM._fileInfo = async (file, buf) => {
    const hash = await sha(buf);
    // has this exact file (or a file with the same name) been sent before, in ANY tab?
    let dup = null;
    try {
      const prior = [...(await LM.db.all('datasets')), ...(await LM.db.all('history'))];
      const same = prior.find((d) => d.hash === hash);
      const sameName = !same && prior.find((d) => d.fileName === file.name);
      if (same) dup = { exact: true, dept: same.dept, name: same.fileName, at: same.uploadedAt };
      else if (sameName) dup = { exact: false, dept: sameName.dept, name: sameName.fileName, at: sameName.uploadedAt };
    } catch (e) { /* storage unavailable: skip */ }
    LM._dup = dup;
    return { hash, name: file.name, size: file.size, dup };
  };
  LM.readBinary = async (file) => { const buf = await file.arrayBuffer(); return { buf, ...(await LM._fileInfo(file, buf)) }; };
  LM.readFile = async (file) => {
    const buf = await file.arrayBuffer();
    let wb;
    try { wb = XLSX.read(buf, { type: 'array', cellDates: false }); }
    catch (e) { throw new Error(`"${file.name}" could not be opened as an Excel/CSV file (${e.message}).`); }
    if (!wb.SheetNames.length) throw new Error(`"${file.name}" contains no sheets.`);
    const info = await LM._fileInfo(file, buf); const { hash, dup } = info;
    return { wb, hash, name: file.name, size: file.size, dup };
  };

  /* ---------- review dialog (shown before anything is processed) ---------- */
  /** opts: {title, facts:[[label,value]], issues, extra: Node, approveLabel, onFix(fix,value), onApprove(), onCancel()} */
  LM.review = (opts) => {
    const ov = h('div', { class: 'overlay' });
    const dup = LM._dup; LM._dup = null;
    const DEPT = { sales: 'Sales', wastage: 'Wastage', quality: 'Quality', procurement: 'Procurement', roasting: 'Roasting', warehouse: 'Warehouse', others: 'Others' };
    const dupIssue = dup ? { level: 'warn', msg: dup.exact ? `DUPLICATE FILE: you already sent this exact file on ${dup.at.slice(0, 10)} ${dup.at.slice(11, 16)} (as “${dup.name}”, ${DEPT[dup.dept] || dup.dept} tab). It contains nothing new; cancel unless you want to re-process it.` : `A file with the same name (“${dup.name}”) was uploaded on ${dup.at.slice(0, 10)} in the ${DEPT[dup.dept] || dup.dept} tab, but its contents are different. Check this is the newer version.` } : null;
    const render = (o) => {
      const issues = dupIssue ? [dupIssue, ...o.issues] : o.issues;
      const n = (l) => issues.filter((i) => i.level === l).length;
      const ack = h('input', { type: 'checkbox' });
      const approve = h('button', { class: 'btn primary', disabled: true }, o.approveLabel || 'Approve & process');
      const sync = () => (approve.disabled = n('error') > 0 || (n('warn') > 0 && !ack.checked));
      ack.addEventListener('change', sync);
      const close = () => ov.remove();
      approve.onclick = async () => { approve.disabled = true; try { await o.onApprove(); close(); } catch (e) { LM.say(e.message); approve.disabled = false; } };
      const list = [...(dupIssue ? [dupIssue] : []), ...['error', 'warn', 'info'].flatMap((lv) => issues.filter((i) => i.level === lv && i !== dupIssue))].map((i) => {
        let fixEl = null;
        if (i.fix && (i.fix.kind === 'date' || i.fix.kind === 'number')) {
          const inp = h('input', { type: i.fix.kind, step: 'any', class: 'sel', value: i.fix.value || '' });
          fixEl = h('div', { class: 'fix' }, inp, h('button', { class: 'btn small', onclick: () => inp.value && o.onFix(i.fix, inp.value) }, i.fix.label || 'Apply'));
        } else if (i.fix && i.fix.type !== 'alias' && i.fix.options && i.fix.options.length) {
          const sel = h('select', { class: 'sel' }, h('option', { value: '' }, 'Choose…'), i.fix.options.map((x) => h('option', { value: x, selected: x === i.fix.suggest }, x)));
          fixEl = h('div', { class: 'fix' }, sel, h('button', { class: 'btn small', onclick: () => sel.value && o.onFix(i.fix, sel.value) }, i.fix.label || 'Apply'));
        } else if (i.fix && i.fix.type === 'alias')
          fixEl = h('div', { class: 'fix' }, h('button', { class: 'btn small', onclick: () => o.onFix(i.fix, i.fix.canon) }, i.fix.label));
        return h('div', { class: 'issue ' + i.level }, h('div', { class: 'tag' }, { error: 'Error', warn: 'Check', info: 'Note' }[i.level]), h('div', {}, i.msg, fixEl));
      });
      ov.replaceChildren(h('div', { class: 'modal' },
        h('div', { class: 'mh' }, h('h3', {}, o.title),
          h('div', { class: 'chips' },
            h('span', { class: 'chip error' }, n('error') + ' errors'), h('span', { class: 'chip warn' }, n('warn') + ' to check'), h('span', { class: 'chip info' }, n('info') + ' notes'),
            !issues.length ? h('span', { class: 'chip ok' }, 'No problems found') : null)),
        h('div', { class: 'mb' },
          o.facts ? h('div', { class: 'facts' }, o.facts.map(([l, v]) => h('div', {}, l, h('b', {}, v)))) : null,
          o.extra || null, list.length ? list : h('div', { class: 'sub' }, 'Everything matches the expected format.')),
        h('div', { class: 'mf' },
          n('error') ? h('span', { class: 'sub' }, 'Fix or map the errors above, or cancel and correct the file.') :
            n('warn') ? h('label', { class: 'ck' }, ack, 'I have reviewed the items to check') : null,
          h('div', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => { close(); o.onCancel && o.onCancel(); } }, 'Cancel'), approve)));
      sync();
    };
    document.body.append(ov); render(opts);
    return { update: render, close: () => ov.remove() };
  };

  /* ---------- sortable table ---------- */
  /** cols: [{k,label,fmt(v,row),cls,l}] */
  LM.table = (cols, rows, o = {}) => {
    let sk = o.sort || null, dir = o.dir || -1;
    const body = h('tbody'); const head = h('tr');
    const wrap = h('div', { class: 'tscroll' }, h('table', { class: 't ' + (o.cls || '') }, h('thead', {}, head), body));
    const draw = () => {
      const data = rows.slice();
      if (sk) data.sort((a, b) => { const x = a[sk], y = b[sk]; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir; });
      const lim = o.limit || data.length;
      body.replaceChildren(...data.slice(0, lim).map((r) => h('tr', {}, cols.map((c) => { const v = c.fmt ? c.fmt(r[c.k], r) : r[c.k]; return h('td', { class: (c.l ? 'l ' : '') + (c.cls || '') }, v); }))));
      head.querySelectorAll('.arr').forEach((a) => (a.textContent = ''));
      const th = head.querySelector(`[data-k="${sk}"] .arr`); if (th) th.textContent = dir < 0 ? '▼' : '▲';
    };
    cols.forEach((c) => head.append(h('th', { class: c.l ? 'l' : '', 'data-k': c.k, onclick: () => { if (sk === c.k) dir = -dir; else { sk = c.k; dir = c.l ? 1 : -1; } draw(); } }, c.label, h('span', { class: 'arr' }))));
    draw(); wrap.redraw = (newRows) => { rows = newRows; draw(); };
    return wrap;
  };
  LM.csv = (cols, rows, name) => {
    const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const txt = '﻿' + [cols.map((c) => q(c.label)).join(','), ...rows.map((r) => cols.map((c) => q(r[c.k])).join(','))].join('\n');
    const a = h('a', { href: URL.createObjectURL(new Blob([txt], { type: 'text/csv' })), download: name }); document.body.append(a); a.click(); a.remove();
  };

  /* ---------- charts ---------- */
  const live = new Set();
  /* ---------- value labels: every bar / point / slice shows its number ---------- */
  const tidy = (x, d) => String(+x.toFixed(d));
  const fmtValue = (v) => { const a = Math.abs(v); if (Number.isInteger(v) && a < 1e4) return v.toLocaleString('en-US'); if (a >= 1e6) return tidy(v / 1e6, 2) + 'M'; if (a >= 1e4) return tidy(v / 1e3, 1) + 'K'; if (a >= 1e3) return Math.round(v).toLocaleString('en-US'); if (a >= 100) return String(Math.round(v)); if (a >= 10) return tidy(v, 1); return tidy(v, 2); };
  const lum = (c) => { const m = /^#([0-9a-f]{6})$/i.exec(String(c || '').trim()); if (!m) return 0.2; const n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const valueLabels = {
    id: 'valueLabels',
    afterDatasetsDraw(chart) {
      const o = (chart.options.plugins || {}).valueLabels; if (o === false || (o && o.display === false)) return;
      const ctx = chart.ctx; const ink = css('--ink') || '#222', halo = css('--surface') || '#fff';
      const horiz = chart.options.indexAxis === 'y'; const vis = chart.data.datasets.map((_, i) => i).filter((i) => chart.isDatasetVisible(i));
      const fmtFor = (di) => { const ds = chart.data.datasets[di]; const sc = chart.scales[ds.yAxisID || (horiz ? 'x' : 'y')]; const cb = sc && sc.options && sc.options.ticks && sc.options.ticks.callback;
        return (v) => { if (o && typeof o.format === 'function') return o.format(v);
          if (typeof cb === 'function') { try { const r = String(cb.call(sc, v, 0, [])); if (/%\s*$/.test(r)) { const x = parseFloat(r.replace(/,/g, '')); if (isFinite(x)) return fmtValue(x) + '%'; } } catch (e) { /* plain number */ } }
          return fmtValue(v); }; };
      ctx.save(); ctx.font = '600 11px system-ui, sans-serif'; ctx.fontVariantNumeric = 'tabular-nums';
      const text = (t, x, y, align, base, color, rot) => { ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.textAlign = align; ctx.textBaseline = base; if (color === ink) { ctx.lineWidth = 3; ctx.strokeStyle = halo; ctx.lineJoin = 'round'; ctx.strokeText(t, 0, 0); } ctx.fillStyle = color; ctx.fillText(t, 0, 0); ctx.restore(); };
      const kind = (di) => chart.getDatasetMeta(di).type; const bv = vis.filter((i) => kind(i) === 'bar'), lv = vis.filter((i) => kind(i) === 'line'), pv = vis.filter((i) => kind(i) === 'doughnut' || kind(i) === 'pie');
      if (bv.length) {
        const stacked = !!(chart.options.scales && ((chart.options.scales.x && chart.options.scales.x.stacked) || (chart.options.scales.y && chart.options.scales.y.stacked)));
        const n = chart.data.labels ? chart.data.labels.length : 0; const tot = {}; const bw = bv.length ? chart.getDatasetMeta(bv[0]).data : []; const pitch = !horiz && bw.length > 1 ? Math.abs(bw[1].x - bw[0].x) * 1 : 99; const cap = Math.ceil(n / 30);
        bv.forEach((di) => { const meta = chart.getDatasetMeta(di); const f = fmtFor(di); const ds = chart.data.datasets[di];
          meta.data.forEach((el, i) => { const pr = meta._parsed[i]; const v = pr ? (horiz ? pr.x : pr.y) : null; if (v == null || !isFinite(v)) return; const P = el.getProps(['x', 'y', 'base', 'width', 'height'], true); const t = f(v);
            const bg = Array.isArray(ds.backgroundColor) ? ds.backgroundColor[i] : ds.backgroundColor;
            if (stacked) { if (v === 0) return; const size = horiz ? Math.abs(P.x - P.base) : Math.abs(P.base - P.y); const tw = ctx.measureText(t).width; const fits = horiz ? size >= tw + 8 : size >= 16 && P.width >= tw + 4;
              if (fits) text(t, horiz ? (P.x + P.base) / 2 : P.x, horiz ? P.y : (P.y + P.base) / 2, 'center', 'middle', lum(bg) > 0.62 ? '#222' : '#fff');
              const k = tot[i] || (tot[i] = { sum: 0, pos: null, cnt: 0 }); k.sum += v; k.cnt++; const end = horiz ? P.x : P.y; if (k.pos == null || (horiz ? end > k.pos.v : end < k.pos.v)) k.pos = { v: end, x: P.x, y: P.y, w: P.width, h: P.height }; return; }
            const tw = ctx.measureText(t).width; const neg = v < 0; if (v === 0 && n > 12) return; const rot = !horiz && P.width < tw; const step = Math.max(cap, horiz ? 1 : Math.ceil((rot ? 13 : tw + 8) / Math.max(pitch, 1))); if (step > 1 && i % step) return;
            if (horiz) text(t, P.x + (neg ? -6 : 6), P.y, neg ? 'right' : 'left', 'middle', ink);
            else if (rot) text(t, P.x, P.y + (neg ? 6 : -6), neg ? 'right' : 'left', 'middle', ink, -Math.PI / 2);
            else text(t, P.x, P.y + (neg ? 6 : -5), 'center', neg ? 'top' : 'bottom', ink); }); });
        if (stacked) Object.values(tot).forEach((k) => { if (k.cnt < 2) return; const t = fmtFor(bv[0])(k.sum); if (horiz) text(t, k.pos.x + 6, k.pos.y, 'left', 'middle', ink); else text(t, k.pos.x, k.pos.y - 5, 'center', 'bottom', ink); });
      }
      if (lv.length) {
        const many = lv.length > 1; const val = (di, i) => { const m = chart.getDatasetMeta(di)._parsed[i]; return m && m.y != null && isFinite(m.y) ? m.y : null; };
        lv.forEach((di) => { const meta = chart.getDatasetMeta(di); const f = fmtFor(di); const pts = meta.data.map((el, i) => ({ el, i, v: val(di, i) })).filter((p) => p.v != null); if (!pts.length) return;
          const step = Math.max(1, Math.ceil(pts.length / (many ? 9 : 14))); const mx = pts.reduce((a, b) => (b.v > a.v ? b : a)), mn = pts.reduce((a, b) => (b.v < a.v ? b : a)); const flat = mx.v === mn.v;
          pts.forEach((p, k) => { if (flat && k !== pts.length - 1) return; const edge = k === pts.length - 1 || k === 0; if (k % step && !edge && p !== mx && p !== mn) return;
            const others = lv.filter((d) => d !== di).map((d) => val(d, p.i)).filter((x) => x != null); const above = flat || !many || !others.length || p.v >= Math.max(...others);
            const P = p.el.getProps(['x', 'y'], true); text(f(p.v), P.x, P.y + (above ? -8 : 8), 'center', above ? 'bottom' : 'top', ink); }); });
      }
      if (pv.length) {
        const di = pv[0]; const meta = chart.getDatasetMeta(di); const data = chart.data.datasets[di].data; const total = data.reduce((a, b) => a + (+b || 0), 0) || 1; const f = fmtFor(di);
        meta.data.forEach((el, i) => { const v = +data[i]; if (!isFinite(v) || v === 0 || el.hidden) return; const P = el.getProps(['x', 'y', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius'], true); const mid = (P.startAngle + P.endAngle) / 2; const big = P.endAngle - P.startAngle > 0.35; const r = big ? (P.innerRadius + P.outerRadius) / 2 : P.outerRadius + 14;
          const t = `${f(v)} · ${Math.round((v / total) * 100)}%`; const bg = chart.data.datasets[di].backgroundColor; text(t, P.x + Math.cos(mid) * r, P.y + Math.sin(mid) * r, 'center', 'middle', big ? (lum(Array.isArray(bg) ? bg[i] : bg) > 0.62 ? '#222' : '#fff') : ink); });
      }
      ctx.restore();
    },
  };
  LM.chart = (canvasHost, cfg) => {
    const c = h('canvas'); canvasHost.append(c);
    Chart.defaults.font.family = 'system-ui, sans-serif'; Chart.defaults.color = css('--muted');
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false }, cfg.options);
    cfg.plugins = [...(cfg.plugins || []), valueLabels];
    const ty = cfg.type || 'bar'; const horiz = cfg.options.indexAxis === 'y'; const many = (cfg.data.labels || []).length > 16;
    cfg.options.layout = cfg.options.layout || {};
    const all = [].concat(...(cfg.data.datasets || []).map((d) => (d.data || []).map((x) => (typeof x === 'number' ? Math.abs(x) : 0)))); const mxv = Math.max(0, ...all); const wRight = Math.min(80, Math.max(40, fmtValue(mxv).length * 7 + 18));
    if (!cfg.options.layout.padding) cfg.options.layout.padding = ty === 'bar' ? (horiz ? { right: wRight, top: 4 } : { top: many ? 44 : 22 }) : ty === 'line' ? { top: 24, bottom: 16, right: 26, left: 4 } : { top: 22, bottom: 22, left: 22, right: 22 };
    if (ty === 'bar' && horiz) { const nrows = (cfg.data.labels || []).length, ns = (cfg.data.datasets || []).length; const stacked = cfg.options.scales && cfg.options.scales.x && cfg.options.scales.x.stacked; const need = nrows * (stacked ? 24 : ns * 15 + 8) + 60; if (need > canvasHost.clientHeight) canvasHost.style.height = need + 'px'; }
    const ch = new Chart(c, cfg); live.add(ch); return ch;
  };
  LM.killCharts = () => { live.forEach((c) => c.destroy()); live.clear(); };
  LM.palette = () => ['#7a4a2b', '#2c7a7b', '#c2851f', '#5b6fb5', '#a8456b', '#6b8e3d', '#8a8a8a', '#c25b3a'].map((c, i) => c);

  /* ---------- drag & drop on an element ---------- */
  LM.dropZone = (el, onFile, multi = false) => {
    ['dragenter', 'dragover'].forEach((ev) => el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.add('drop-on'); }));
    ['dragleave', 'drop'].forEach((ev) => el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.remove('drop-on'); }));
    el.addEventListener('drop', (e) => { const fs = [...e.dataTransfer.files]; if (fs.length) onFile(multi ? fs : fs[0]); });
  };
  LM.filePicker = (onFile, label = 'Upload file', multiple = false, accept = '.xlsx,.xls,.xlsm,.csv,.ods') => {
    const inp = h('input', { type: 'file', multiple, accept, style: 'display:none', onchange: () => { if (inp.files.length) onFile(multiple ? [...inp.files] : inp.files[0]); inp.value = ''; } });
    return h('span', {}, inp, h('button', { class: 'btn primary', onclick: () => inp.click() }, '⬆ ' + label));
  };


  /* In-page replacements for confirm() / alert() (those are blocked in some embedded viewers and block the page elsewhere). */
  const dialog = (msg, buttons) => new Promise((resolve) => {
    const ov = h('div', { class: 'overlay', style: 'z-index:90' }); const done = (v) => { ov.remove(); resolve(v); };
    ov.append(h('div', { class: 'modal', style: 'max-width:480px;max-height:none' }, h('div', { class: 'mb', style: 'white-space:pre-wrap' }, String(msg)), h('div', { class: 'mf' }, h('div', { class: 'spacer' }), ...buttons(done))));
    document.body.append(ov);
  });
  LM.ask = (msg) => dialog(msg, (done) => [h('button', { class: 'btn', onclick: () => done(false) }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => done(true) }, 'OK')]);
  LM.say = (msg) => { dialog(msg, (done) => [h('button', { class: 'btn primary', onclick: () => done() }, 'OK')]); };

  Object.assign(LM, { h, num, num2, pct, pct0, compact, delta, css, dayLabel, shortName, toast });
})();
