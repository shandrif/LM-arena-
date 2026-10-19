/* International tab: London & Iraq weekly reviews, expansion updates, Saudi NSO status (PowerPoint) and the events calendar (PDF). */
(function () {
  const LM = window.LM; const { h, num, compact, dayLabel } = LM; const X = LM.international; const T = X.TYPES; LM.depts = LM.depts || {};
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dstr = (d) => (d && /^\d{4}-\d\d-\d\d$/.test(d) ? `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : d || '');
  const kpi = (l, v, d) => h('div', { class: 'card kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
  const card = (t, ...k) => h('div', { class: 'card', style: 'margin-bottom:12px' }, t ? h('h3', {}, t) : null, ...k);
  const pill = (t, cls, style) => h('span', { class: 'pill ' + (cls || ''), style }, t);
  const pc = (v) => (v == null ? '' : h('span', { class: v > 0.04 ? 'up' : v < -0.04 ? 'down' : 'flat' }, (v > 0 ? '▲ +' : v < 0 ? '▼ ' : '● ') + v.toFixed(1) + '%'));
  const statusPill = (s) => { const t = (s || '').trim(); if (!t) return ''; if (/open|launched|done|completed/i.test(t)) return pill(t, 'new'); if (/hold|cancel|delay/i.test(t)) return pill(t, 'closed'); if (/construction|ready/i.test(t)) return pill(t, '', 'background:var(--warn-bg);color:var(--warn)'); return pill(t); };
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const b64 = (buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };

  LM.depts.international = {
    id: 'international', label: 'International',
    async mount(panel) {
      let sets = [], sub = 'Overview', evMonth = 0, evQuery = ''; const sel = {};
      const reload = async () => { sets = (await LM.db.all('datasets')).filter((d) => d.dept === 'international'); draw(); };
      const of = (t) => sets.filter((s) => s.type === t).sort((a, b) => (a.end < b.end ? 1 : -1));
      const cur = (t) => { const l = of(t); return l.find((s) => s.id === sel[t]) || l[0] || null; };
      const prevOf = (t) => { const c = cur(t); return c ? of(t).find((s) => s.end < c.end) || null : null; };
      const picker = (t) => { const l = of(t); return l.length > 1 ? h('select', { class: 'sel', onchange: (e) => { sel[t] = e.target.value; draw(); } }, l.map((s) => h('option', { value: s.id, selected: s.id === cur(t).id }, t === 'calendar' ? s.fileName : (s.start === s.end ? s.end : `${s.start} → ${s.end}`)))) : null; };
      const refDate = () => { const r = [...of('london'), ...of('iraq')].map((s) => s.end).sort().pop(); return r || new Date().toISOString().slice(0, 10); };
      async function nepList() { const all = (await LM.db.all('datasets')).filter((d) => d.dept === 'nep').sort((a, b) => (a.end < b.end ? 1 : -1)); if (!all[0]) return null; const c = LM.nep.compute(all[0]); return c ? c.list.filter((s) => !s.opened) : null; }

      /* ---------- upload (any mix of .pptx and .pdf) ---------- */
      let batchEnd = null;
      async function uploadMany(files) { batchEnd = null; for (const f of files) await uploadOne(f); }
      function uploadOne(file) {
        return new Promise(async (resolve) => {
          let rf; try { rf = await LM.readBinary(file); } catch (e) { alert(e.message); return resolve(); }
          const tpl = { dept: 'international', ...((await LM.db.get('templates', 'international')) || {}) }; const ov = {};
          const isPdf = /\.pdf$/i.test(file.name); let res;
          const run = async () => (isPdf ? analyzeCalendar(rf, ov, tpl) : X.analyze(rf.buf, rf.name, ov, tpl, sets, rf.hash, { end: batchEnd || refDate(), nepList: await nepList() }));
          try { res = await run(); } catch (e) { alert(`“${file.name}” could not be read: ${e.message}`); return resolve(); }
          const facts = () => { const d = res.ds; if (!d) return [['Report', 'Not recognised']]; const f = [['Type', T[res.type].label], ['Date', d.end || '–']]; if (res.type === 'calendar') { const ev = d.data.events; f.push(['Pages', d.data.numPages], ['Events', ev.length], ['B2B / B2C / orders', `${ev.filter((e) => e.kind === 'B2B').length} / ${ev.filter((e) => e.kind === 'B2C').length} / ${ev.filter((e) => e.kind === 'Order').length}`]); } else if (d.data.metrics) f.push(['Market', d.data.market], ['Metrics', d.data.metrics.length], ['Callouts', d.data.callouts.length]); else if (d.data.rows) f.push(['Stores', d.data.rows.length]); else if (d.data.sections) f.push(['Tables', d.data.sections.length], ['Rows', sum(d.data.sections, (s) => s.rows.length)]); return f; };
          const info = () => ({
            title: `Review before processing: ${rf.name}`, facts: facts(), issues: res.issues,
            approveLabel: res.ds && sets.some((s) => s.type === res.type && s.end === res.ds.end) ? 'Approve & replace existing' : 'Approve & process',
            onFix: async (fix, val) => { if (fix.type === 'type') ov.type = val; else if (fix.type === 'asOf') ov.asOf = { date: val }; res = await run(); dlg.update(info()); },
            onCancel: () => resolve(),
            onApprove: async () => { if (!res.ds || res.issues.some((i) => i.level === 'error')) throw new Error('Fix the errors first.'); const d = res.ds; const old = sets.find((s) => s.type === res.type && s.end === d.end);
              if (old) { await LM.db.put('history', { ...old, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', old.id); }
              const rec = { id: LM.uid(), dept: 'international', type: res.type, start: d.start, end: d.end, fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), data: d.data }; if (isPdf) rec.pdf = rf.buf;
              await LM.db.put('datasets', rec); if (d.data.period) batchEnd = d.end; sel[res.type] = rec.id; sub = { london: 'London', iraq: 'Iraq', expansion: 'Expansion', nso: 'Saudi NSO', calendar: 'Events' }[res.type]; LM.toast(`${T[res.type].label} ${d.end} processed`); sets = (await LM.db.all('datasets')).filter((x) => x.dept === 'international'); draw(); setTimeout(resolve, 50); } });
          const dlg = LM.review(info());
        });
      }
      async function analyzeCalendar(rf, ov, tpl) {
        const issues = []; const I = (level, msg) => ({ level, msg }); let cal; try { cal = await LM.pdf.calendar(rf.buf); } catch (e) { return { type: null, ds: null, issues: [I('error', `The PDF could not be read (${e.message}). It may be password-protected or damaged.`)] }; }
        const ev = cal.pages.flatMap((p) => p.events.map((e) => ({ ...e, page: p.page }))); if (!ev.length) issues.push(I('error', 'No events could be read from this PDF. It may be a scan or not an events calendar.'));
        const yr = (/(20\d\d)/.exec(rf.name) || [])[1] ? +/(20\d\d)/.exec(rf.name)[1] : new Date().getFullYear(); const months = cal.pages.map((p) => p.month).filter(Boolean);
        if (cal.numPages !== 12) issues.push(I('warn', `The calendar has ${cal.numPages} page(s), not 12.`)); const missing = []; for (let m = 1; m <= 12; m++) if (!months.includes(m)) missing.push(MON[m - 1]); if (missing.length && ev.length) issues.push(I('warn', `No calendar page found for: ${missing.join(', ')}.`)); const dm = months.filter((m, i) => months.indexOf(m) !== i); if (dm.length) issues.push(I('warn', `Month page(s) appear twice: ${[...new Set(dm)].map((m) => MON[m - 1]).join(', ')}.`));
        const unk = ev.filter((e) => e.kind === '?').length; if (unk) issues.push(I('warn', `${unk} event(s): the type (B2C / B2B) could not be read from the cell colour.`));
        const noDate = ev.filter((e) => !e.dateLabel).length; if (noDate) issues.push(I('warn', `${noDate} event(s) have no date column.`));
        const seen = {}; ev.forEach((e) => { const k = `${e.month}|${e.dateLabel}|${e.text.toLowerCase()}`; seen[k] = (seen[k] || 0) + 1; }); const dups = Object.entries(seen).filter(([, n]) => n > 1); if (dups.length) issues.push(I('info', `${dups.length} event(s) are listed twice on the same date (e.g. “${dups[0][0].split('|')[2]}”).`));
        const words = ev.filter((e) => /[a-z]\s[a-z]{1,2}\b/.test(e.text) && /Associatio n|Muhamma d|Mohamme d/.test(e.text)).length; if (words) issues.push(I('info', 'Some long names were split across two lines in the PDF and may read slightly broken.'));
        issues.push(I('info', 'Events are read from the page layout; the PDF itself is stored and can be opened page by page to check any entry.'));
        const prev = of('calendar').find((s) => s.end === `${yr}-12-31`); if (prev) { const key = (e) => `${e.month}|${e.dateLabel}|${e.text.toLowerCase()}`; const a = new Set(prev.data.events.map(key)), b = new Set(ev.map(key)); const added = ev.filter((e) => !a.has(key(e))), gone = prev.data.events.filter((e) => !b.has(key(e))); if (added.length) issues.push(I('info', `${added.length} event(s) added since the stored calendar: ${added.slice(0, 5).map((e) => `${e.text} (${MON[e.month - 1]})`).join('; ')}${added.length > 5 ? '; …' : ''}.`)); if (gone.length) issues.push(I('warn', `${gone.length} event(s) from the stored calendar are not in this one: ${gone.slice(0, 5).map((e) => `${e.text} (${MON[e.month - 1]})`).join('; ')}${gone.length > 5 ? '; …' : ''}.`)); }
        of('calendar').forEach((e) => { if (e.hash === rf.hash) issues.push(I('warn', `This exact PDF was already uploaded on ${e.uploadedAt.slice(0, 10)}.`)); else if (e.end === `${yr}-12-31`) issues.push(I('warn', `A ${yr} events calendar already exists. Approving replaces it (the old version is kept in history).`)); });
        return { type: 'calendar', ds: { type: 'calendar', start: `${yr}-01-01`, end: `${yr}-12-31`, data: { numPages: cal.numPages, events: ev, text: cal.text } }, issues };
      }

      /* ---------- layout ---------- */
      const body = h('div');
      function draw() {
        LM.killCharts();
        panel.replaceChildren(h('div', { class: 'head' }, h('h2', {}, 'International'), h('span', { class: 'sub' }, 'Upload the weekly decks (.pptx) and the events calendar (.pdf), together or one by one.'), h('div', { class: 'spacer' }), LM.filePicker(uploadMany, 'Upload International files', true, '.pptx,.pdf')), body);
        LM.dropZone(panel, uploadMany, true);
        if (!sets.length) return body.replaceChildren(h('div', { class: 'empty' }, h('h3', {}, 'No International files uploaded yet'), h('div', { style: 'display:inline-grid;gap:4px;text-align:left' }, Object.values(T).map((t) => h('div', {}, h('b', {}, t.label))))));
        const tabs = ['Overview', 'London', 'Iraq', 'Expansion', 'Saudi NSO', 'Events', 'Uploads'];
        body.replaceChildren(h('div', { class: 'subtabs' }, tabs.map((t) => h('button', { class: t === sub ? 'on' : '', onclick: () => { sub = t; draw(); } }, t))), { Overview: overview, London: () => review('london'), Iraq: () => review('iraq'), Expansion: expansion, 'Saudi NSO': nso, Events: events, Uploads: uploads }[sub]());
      }
      const none = (t) => h('div', { class: 'banner' }, `No ${T[t].label} uploaded yet.`);
      const metric = (d, re) => (d.metrics || []).find((m) => re.test(m.name));

      /* ---------- Overview ---------- */
      function overview() {
        const lo = cur('london'), ir = cur('iraq'), ex = cur('expansion'), ns = cur('nso'), ca = cur('calendar'); const g = h('div', { class: 'grid half' });
        const rv = (s, title, key) => { if (!s) return card(title, none(key)); const d = s.data; const n = metric(d, key === 'iraq' ? /net sales.*\(sar\)/i : /^net sales/i), b = metric(d, /^(transactions|bills)/i), a = metric(d, key === 'iraq' ? /apc.*\(sar\)/i : /^apc/i); const cs = key === 'iraq' ? 'SAR ' : '£'; return card(title, h('div', { class: 'sub' }, `${dstr(s.start)} → ${dstr(s.end)}`), h('div', { class: 'grid kpis', style: 'margin:8px 0 0' }, n ? kpi('Net sales', cs + compact(n.curr), pc(n.pct != null ? n.pct : ((n.curr - n.prev) / n.prev) * 100)) : null, b ? kpi(b.name, num(b.curr), pc(b.pct != null ? b.pct : ((b.curr - b.prev) / b.prev) * 100)) : null, a ? kpi('APC', cs + a.curr.toFixed(2), pc(a.pct != null ? a.pct : ((a.curr - a.prev) / a.prev) * 100)) : null), h('button', { class: 'btn small', style: 'margin-top:8px', onclick: () => { sub = key === 'iraq' ? 'Iraq' : 'London'; draw(); } }, 'Open')); };
        g.append(rv(lo, 'London', 'london'), rv(ir, 'Iraq', 'iraq'));
        if (ns) { const rows = [...ns.data.rows].sort((a, b) => (a.when || '9') < (b.when || '9') ? -1 : 1); const slips = rows.filter((r) => r.slipDays > 7).length; g.append(card('Saudi stores to open (NSO status)', h('div', { class: 'sub' }, `as of ${dstr(ns.end)}`), h('ul', { class: 'findings', style: 'margin-top:6px' }, rows.map((r) => h('li', {}, h('b', {}, r.name), ` · ${dstr(r.when)}${r.whenKind && r.whenKind !== 'exact' ? ' (' + r.whenKind + ')' : ''} · `, statusPill(r.status), r.slipDays > 7 ? h('span', { class: 'down' }, ` · ${r.slipDays} days later than NEP`) : null))), slips ? h('div', { class: 'sub', style: 'margin-top:6px' }, `${slips} store(s) are later than the NEP plan.`) : null, h('button', { class: 'btn small', style: 'margin-top:8px', onclick: () => { sub = 'Saudi NSO'; draw(); } }, 'Open'))); } else g.append(card('Saudi stores to open', none('nso')));
        if (ex) { const iq = ex.data.sections.find((s) => /expansion plan/i.test(s.title)); const cnt = {}; (iq ? iq.rows : []).forEach((r) => (cnt[r[1].trim()] = (cnt[r[1].trim()] || 0) + 1)); g.append(card('Iraq & GCC expansion', h('div', { class: 'sub' }, `as of ${dstr(ex.end)}`), h('div', { style: 'margin-top:6px' }, Object.entries(cnt).map(([k, v]) => h('span', { style: 'margin-right:6px' }, statusPill(k), ' ×' + v))), h('button', { class: 'btn small', style: 'margin-top:8px', onclick: () => { sub = 'Expansion'; draw(); } }, 'Open'))); } else g.append(card('Iraq & GCC expansion', none('expansion')));
        const ref = refDate(); const upcoming = ca ? ca.data.events.filter((e) => { const d = evDate(e, +ca.end.slice(0, 4)); return !!d && d >= ref && d <= addDays(ref, 45); }).sort((a, b) => (evDate(a, +ca.end.slice(0, 4)) < evDate(b, +ca.end.slice(0, 4)) ? -1 : 1)) : [];
        const callouts = [...(lo ? lo.data.callouts.map((c) => ({ ...c, who: 'London' })) : []), ...(ir ? ir.data.callouts.map((c) => ({ ...c, who: 'Iraq' })) : [])].filter((c) => /focus|improve|watch/i.test(c.kind));
        const el = h('div', {}, g, ca ? card(`Events in the next 45 days (from ${dstr(ref)})`, upcoming.length ? LM.table([{ k: 'when', label: 'Date', l: 1 }, { k: 'text', label: 'Event', l: 1, cls: 'wrap' }, { k: 'kind', label: 'Type', l: 1, fmt: kindPill }], upcoming.map((e) => ({ ...e, when: dstr(evDate(e, +ca.end.slice(0, 4))) + (/to|–/.test(e.dateLabel) ? ' (' + e.dateLabel + ')' : '') })), { sort: null }) : h('span', { class: 'sub' }, 'No events in this window.')) : null,
          callouts.length ? card('Areas to focus on (from the weekly reviews)', callouts.slice(0, 8).map((c) => h('div', { class: 'issue warn' }, h('div', { class: 'tag' }, c.who), h('div', {}, h('b', {}, c.title + ': '), c.text)))) : null);
        return el;
      }
      const addDays = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
      const kindPill = (k) => (k === 'B2B' ? pill('B2B', 'closed') : k === 'Order' ? pill('Order', '', 'background:var(--info-bg);color:var(--info)') : k === 'B2C' ? pill('B2C', 'new') : pill('?'));
      function evDate(e, year) { const m = /(\d{1,2})/.exec(e.dateLabel || ''); if (!m) return null; const mon = (/([A-Za-z]{3})\b/.exec((e.dateLabel || '').replace(/to|t0/gi, ' ')) || [])[1]; const mi = mon ? MON.findIndex((x) => x.toLowerCase() === mon.toLowerCase()) + 1 : e.month; if (!mi) return null; return `${year}-${String(mi).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`; }

      /* ---------- weekly review (London / Iraq) ---------- */
      function review(type) {
        const s = cur(type); if (!s) return none(type); const d = s.data; const p = prevOf(type);
        const kp = d.metrics.map((m) => ({ ...m, pctShow: m.pct != null ? m.pct : m.prev ? ((m.curr - m.prev) / m.prev) * 100 : null }));
        const el = h('div', {}, h('div', { class: 'tools' }, picker(type), h('span', { class: 'sub' }, `${d.market}${d.weekNo ? ' · week ' + d.weekNo : ''} · ${dstr(d.period.start)} → ${dstr(d.period.end)} vs ${d.prevPeriod ? dstr(d.prevPeriod.start) + ' → ' + dstr(d.prevPeriod.end) : 'previous week'} · ${s.fileName}`)),
          d.tiles && d.tiles.length ? h('div', { class: 'grid kpis' }, d.tiles.slice(0, 4).map((t) => kpi(t.label, t.value, t.sub.slice(0, 2).join(' · ')))) : null,
          card('Week on week', LM.table([{ k: 'name', label: 'Metric', l: 1 }, { k: 'prevS', label: 'Previous week', fmt: (v, r) => r.raw[0] }, { k: 'currS', label: 'Current week', fmt: (v, r) => h('b', {}, r.raw[1]) }, { k: 'chS', label: 'Change', fmt: (v, r) => r.raw[2] }, { k: 'pctShow', label: '%', fmt: (v) => pc(v) }], kp, { sort: null })),
          d.callouts.length ? card('What worked and what to watch', h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fit,minmax(280px,1fr))' }, d.callouts.map((c) => h('div', { class: 'issue ' + (/worked|drove|happened/i.test(c.kind) ? 'info' : 'warn'), style: 'margin:0' }, h('div', { class: 'tag', style: 'min-width:70px' }, c.kind.replace('AREA TO ', '')), h('div', {}, h('b', {}, c.title), h('div', {}, c.text)))))) : null,
          d.focus.length ? card('Focus points for next week', h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fit,minmax(260px,1fr))' }, d.focus.map((f) => h('div', { class: 'card', style: 'box-shadow:none' }, h('b', {}, `${f.no}. ${f.title.replace(/\n/g, ' · ')}`), h('div', { class: 'sub', style: 'margin-top:4px' }, f.desc), f.target ? h('div', { style: 'margin-top:4px;font-weight:600;color:var(--accent)' }, f.target) : null)))) : null,
          d.info.length ? card('Store information', h('ul', { class: 'findings' }, d.info.map((t) => h('li', {}, t)))) : null);
        const later = []; d.blocks.forEach((b) => { if (b.kind === 'table') el.append(card(b.title, LM.table(b.rows[0].map((hh, i) => ({ k: 'c' + i, label: hh || ' ', l: i === 0 })), b.rows.slice(1).map((r) => Object.fromEntries(r.map((v, i) => ['c' + i, v]))), { sort: null }))); else { const box = h('div', { class: 'chart', style: 'height:280px' }); later.push([box, b.chart]); el.append(card(b.title, box)); } });
        const hist = of(type).slice().reverse(); if (hist.length > 1) { const box = h('div', { class: 'chart', style: 'height:260px' }); el.append(card('Net sales trend', box)); later.push([box, null, hist]); }
        setTimeout(() => later.forEach(([box, c, hist2]) => { if (c) LM.deckChart(box, c); else LM.chart(box, { type: 'line', data: { labels: hist2.map((x) => dayLabel(x.end)), datasets: [{ label: 'Net sales', data: hist2.map((x) => { const m = metric(x.data, type === 'iraq' ? /net sales.*\(sar\)/i : /^net sales/i); return m ? m.curr : null; }), borderColor: LM.css('--accent'), tension: 0 }] }, options: { plugins: { legend: { display: false } } } }); })); return el;
      }

      /* ---------- expansion ---------- */
      function expansion() {
        const s = cur('expansion'); if (!s) return none('expansion'); const pv = prevOf('expansion'); const el = h('div', {}, h('div', { class: 'tools' }, picker('expansion'), h('span', { class: 'sub' }, `As of ${dstr(s.end)} · ${s.fileName}`)));
        s.data.sections.forEach((sec) => { const old = pv ? pv.data.sections.find((x) => LM.norm(x.title) === LM.norm(sec.title)) : null; const rows = sec.rows.map((r) => { const o = old ? old.rows.find((x) => LM.norm(x[0]) === LM.norm(r[0])) : null; return { name: r[0], status: r[1] || '', comment: r[2] || '', was: o ? o[1] : null, isNew: !!old && !o, changed: !!o && LM.norm(o[1]) !== LM.norm(r[1]) }; });
          el.append(card(sec.title, LM.table([{ k: 'name', label: sec.headers[0], l: 1, cls: 'wrap' }, { k: 'status', label: sec.headers[1], l: 1, fmt: (v, r) => h('span', {}, statusPill(v), r.changed ? h('span', { class: 'sub' }, ` (was ${r.was})`) : null, r.isNew ? pill('New', 'new') : null) }, { k: 'comment', label: sec.headers[2] || 'Comment', l: 1, cls: 'wrap' }], rows, { sort: null }))); }); return el;
      }

      /* ---------- Saudi NSO ---------- */
      function nso() {
        const s = cur('nso'); if (!s) return none('nso'); const rows = [...s.data.rows].sort((a, b) => ((a.when || '9') < (b.when || '9') ? -1 : 1)); const cnt = {}; rows.forEach((r) => (cnt[r.status] = (cnt[r.status] || 0) + 1));
        return h('div', {}, h('div', { class: 'tools' }, picker('nso'), h('span', { class: 'sub' }, `As of ${dstr(s.end)} · ${s.fileName}`)),
          h('div', { class: 'grid kpis' }, kpi('Stores to open', rows.length, rows.length ? `${dstr(rows[0].when)} → ${dstr(rows[rows.length - 1].when)}` : ''), Object.entries(cnt).map(([k, v]) => kpi(k, v, 'stores')), kpi('Later than NEP plan', rows.filter((r) => r.slipDays > 7).length, 'by more than a week')),
          card('Stores to open', LM.table([{ k: 'name', label: 'Store', l: 1, cls: 'wrap' }, { k: 'status', label: 'Status', l: 1, fmt: (v) => statusPill(v) }, { k: 'when', label: 'Opening (from comment)', l: 1, fmt: (v, r) => (v ? dstr(v) + (r.whenKind && r.whenKind !== 'exact' ? ' (' + r.whenKind + ')' : '') : '') }, { k: 'nepDate', label: 'NEP plan', l: 1, fmt: (v) => v || h('span', { class: 'sub' }, 'not in NEP') }, { k: 'slipDays', label: 'vs NEP', fmt: (v) => (v == null ? '–' : h('span', { class: v > 7 ? 'down' : v < -7 ? 'up' : 'flat' }, (v > 0 ? '+' : '') + v + ' d')) }, { k: 'comment', label: 'Comment', l: 1, cls: 'wrap' }, { k: 'readiness', label: 'Operation readiness', l: 1, cls: 'wrap' }], rows.map((r) => ({ ...r, nepDate: r.nep ? (r.nep.openDate ? dstr(r.nep.openDate) : r.nep.ym) + ' · ' + r.nep.name : '' })), { sort: null })));
      }

      /* ---------- Events calendar + PDF viewer ---------- */
      function events() {
        const s = cur('calendar'); if (!s) return none('calendar'); const ev = s.data.events; const yr = +s.end.slice(0, 4);
        const q = evQuery.toLowerCase(); const list = ev.filter((e) => (evMonth === 0 || e.month === evMonth) && (!q || (e.text + ' ' + e.dateLabel).toLowerCase().includes(q))).map((e) => ({ ...e, when: (e.dateLabel || '') + (e.dateLabel && !/[A-Za-z]{3}/.test(e.dateLabel.replace(/to|t0/gi, '')) ? ' ' + MON[e.month - 1] : ''), monthName: MON[e.month - 1], sortKey: evDate(e, yr) || '' }));
        const byM = Array.from({ length: 12 }, (_, i) => ({ b2c: ev.filter((e) => e.month === i + 1 && e.kind === 'B2C').length, b2b: ev.filter((e) => e.month === i + 1 && e.kind === 'B2B').length, ord: ev.filter((e) => e.month === i + 1 && e.kind === 'Order').length }));
        const search = h('input', { type: 'search', placeholder: 'Search events…', value: evQuery }); search.oninput = () => { evQuery = search.value; const t = tbl; t.redraw(ev.filter((e) => (evMonth === 0 || e.month === evMonth) && (!evQuery || (e.text + e.dateLabel).toLowerCase().includes(evQuery.toLowerCase())))); };
        const cols = [{ k: 'monthName', label: 'Month', l: 1 }, { k: 'when', label: 'Date', l: 1 }, { k: 'text', label: 'Event', l: 1, cls: 'wrap' }, { k: 'kind', label: 'Type', l: 1, fmt: kindPill }]; const tbl = LM.table(cols, list, { sort: null });
        const viewer = h('div', { class: 'card', style: 'margin-top:12px' }); const canvas = h('canvas', { style: 'max-width:100%;border:1px solid var(--line);border-radius:8px' }); let page = evMonth || 1, doc = null; const label = h('b', {});
        const showPage = async () => { if (!doc) doc = await LM.pdf.open(s.pdf); page = Math.min(Math.max(page, 1), doc.numPages); label.textContent = `Page ${page} of ${doc.numPages}`; await LM.pdf.render(doc, page, canvas, 1.3); };
        const nav = (d) => () => { page += d; showPage(); };
        viewer.append(h('div', { class: 'tools' }, h('h3', { style: 'margin:0' }, 'The original PDF'), h('div', { class: 'spacer' }), h('button', { class: 'btn small', onclick: nav(-1) }, '◀ Prev'), label, h('button', { class: 'btn small', onclick: nav(1) }, 'Next ▶'), h('a', { class: 'btn small', href: URL.createObjectURL(new Blob([s.pdf], { type: 'application/pdf' })), download: s.fileName, target: '_blank' }, 'Open / download')), canvas); if (s.pdf) showPage(); else viewer.append(h('div', { class: 'sub' }, 'The PDF file itself was not stored in this backup.'));
        const el = h('div', {}, h('div', { class: 'tools' }, picker('calendar'), h('span', { class: 'sub' }, `${s.fileName} · ${ev.length} events read from ${s.data.numPages} pages`)),
          h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Events per month'), h('div', { class: 'chart', id: 'c1', style: 'height:240px' })),
          h('div', { class: 'tools' }, h('select', { class: 'sel', onchange: (e) => { evMonth = +e.target.value; draw(); } }, [['All months', 0], ...MON.map((m, i) => [m, i + 1])].map(([t, v]) => h('option', { value: v, selected: v === evMonth }, t))), search, h('button', { class: 'btn small', onclick: () => LM.csv(cols, list, `events-${yr}.csv`) }, 'Export CSV'), h('span', { class: 'sub' }, 'Event type comes from the cell colour in the PDF: green = B2C, pink = B2B, “Order” = the orders table.')), tbl, viewer);
        setTimeout(() => LM.chart(el.querySelector('#c1'), { type: 'bar', data: { labels: MON, datasets: [{ label: 'B2C', data: byM.map((x) => x.b2c), backgroundColor: '#2c7a7b' }, { label: 'B2B', data: byM.map((x) => x.b2b), backgroundColor: '#c25b6b' }, { label: 'Orders', data: byM.map((x) => x.ord), backgroundColor: '#5b6fb5' }] }, options: { plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, ticks: { precision: 0 } } } } })); return el;
      }

      function uploads() {
        const l = sets.slice().sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
        return h('div', { class: 'card' }, h('h3', {}, 'Uploaded International files'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Type', 'Date', 'File', 'Uploaded', ''].map((t) => h('th', { class: 'l' }, t)))), h('tbody', {}, l.map((s) => h('tr', {}, h('td', { class: 'l' }, T[s.type].label), h('td', { class: 'l' }, s.start === s.end ? s.end : `${s.start} → ${s.end}`), h('td', { class: 'l' }, s.fileName), h('td', { class: 'l' }, s.uploadedAt.slice(0, 16).replace('T', ' ')),
          h('td', {}, h('button', { class: 'btn small danger', onclick: async () => { if (confirm(`Delete this ${T[s.type].label} (${s.end})?`)) { await LM.db.del('datasets', s.id); reload(); } } }, 'Delete')))))));
      }
      await reload();
    },
  };
})();
