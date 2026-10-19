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
      approve.onclick = async () => { approve.disabled = true; try { await o.onApprove(); close(); } catch (e) { alert(e.message); approve.disabled = false; } };
      const list = [...(dupIssue ? [dupIssue] : []), ...['error', 'warn', 'info'].flatMap((lv) => issues.filter((i) => i.level === lv && i !== dupIssue))].map((i) => {
        let fixEl = null;
        if (i.fix && (i.fix.kind === 'date' || i.fix.kind === 'number')) {
          const inp = h('input', { type: i.fix.kind, step: 'any', class: 'sel' });
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
  LM.chart = (canvasHost, cfg) => {
    const c = h('canvas'); canvasHost.append(c);
    Chart.defaults.font.family = 'system-ui, sans-serif'; Chart.defaults.color = css('--muted');
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false }, cfg.options);
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

  Object.assign(LM, { h, num, num2, pct, pct0, compact, delta, css, dayLabel, shortName, toast });
})();
