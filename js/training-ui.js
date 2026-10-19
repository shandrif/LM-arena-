/* Training tab: weekly PowerPoint report -> onboarding, upcoming trainees, verification, programmes, Know to Grow, projects. */
(function () {
  const LM = window.LM; const { h, num, dayLabel } = LM; const TR = LM.training; LM.depts = LM.depts || {};
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dstr = (d) => (d && /^\d{4}-\d\d-\d\d$/.test(d) ? `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : d || '');
  const kpi = (l, v, d) => h('div', { class: 'card kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
  const card = (t, ...k) => h('div', { class: 'card', style: 'margin-bottom:12px' }, t ? h('h3', {}, t) : null, ...k);
  const chartCard = (t, id, ht) => h('div', { class: 'card' }, h('h3', {}, t), h('div', { class: 'chart', id, style: ht ? `height:${ht}px` : '' }));
  const pill = (t, cls, style) => h('span', { class: 'pill ' + (cls || ''), style }, t);
  const PAL = ['#7a4a2b', '#2c7a7b', '#c2851f', '#5b6fb5', '#a8456b', '#6b8e3d', '#8a8a8a'];
  const p1 = (v) => (v == null ? '–' : (+v).toFixed(v % 1 ? 1 : 0) + '%');
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const statusPill = (s) => (/complete/i.test(s) ? pill(s, 'new') : /tomorrow|today|\d/.test(s) ? pill(s, '', 'background:var(--warn-bg);color:var(--warn)') : s ? pill(s) : null);

  function deckChart(host, c) {
    const horiz = c.dir === 'bar'; const stacked = /stacked/i.test(c.grouping); const pct = /percentStacked/i.test(c.grouping);
    if (/pie|doughnut/.test(c.type)) return LM.chart(host, { type: c.type === 'pie' ? 'pie' : 'doughnut', data: { labels: c.cats, datasets: [{ data: c.series[0].values, backgroundColor: c.cats.map((_, i) => PAL[i % PAL.length]) }] }, options: { plugins: { legend: { position: 'bottom' } } } });
    const type = c.type === 'line' ? 'line' : 'bar';
    return LM.chart(host, { type, data: { labels: c.cats, datasets: c.series.map((s, i) => ({ label: s.name, data: pct ? s.values.map((v) => (v == null ? null : v * 100)) : s.values, backgroundColor: PAL[i % PAL.length], borderColor: PAL[i % PAL.length], tension: 0 })) }, options: { indexAxis: horiz ? 'y' : 'x', plugins: { legend: { display: c.series.length > 1, position: 'bottom' } }, scales: { x: Object.assign({ stacked }, horiz && pct ? { ticks: { callback: (v) => v + '%' } } : {}), y: Object.assign({ stacked }, !horiz && pct ? { ticks: { callback: (v) => v + '%' } } : {}) } } });
  }

  LM.deckChart = deckChart;
  LM.depts.training = {
    id: 'training', label: 'Training',
    async mount(panel) {
      let sets = [], cur = null, sub = 'Overview';
      const reload = async () => { sets = (await LM.db.all('datasets')).filter((d) => d.dept === 'training').sort((a, b) => (a.end < b.end ? 1 : -1)); if (!sets.find((s) => s.id === cur)) cur = sets[0] ? sets[0].id : null; draw(); };

      async function upload(file) {
        let rf; try { rf = await LM.readBinary(file); } catch (e) { return LM.say(e.message); }
        if (!/\.pptx$/i.test(file.name)) return LM.say('Please upload the weekly report as a PowerPoint (.pptx). Old .ppt files must be saved as .pptx first.');
        const tpl = { dept: 'training', ...((await LM.db.get('templates', 'training')) || {}) }; const ov = {}; let res = await TR.analyze(rf.buf, rf.name, ov, tpl, sets, rf.hash);
        const info = () => { const d = res.ds && res.ds.data; return {
          title: `Review before processing: ${rf.name}`, issues: res.issues,
          facts: d ? [['Week', res.ds.start ? `${res.ds.start} → ${res.ds.end}` : '–'], ['Slides', d.slides.length], ['Trainees onboarded', d.onboarding ? (d.onboarding.total != null ? d.onboarding.total : sum(d.onboarding.rows, (r) => r.count)) : '–'], ['Upcoming trainees', d.upcoming ? (d.upcoming.total != null ? d.upcoming.total : sum(d.upcoming.groups, (g) => g.count)) : '–']] : [['Report', 'Not readable']],
          approveLabel: res.ds && sets.some((s) => s.end === res.ds.end) ? 'Approve & replace existing week' : 'Approve & process',
          onFix: async (fix, val) => { if (fix.type === 'asOf') ov.asOf = { date: val }; res = await TR.analyze(rf.buf, rf.name, ov, tpl, sets, rf.hash); dlg.update(info()); },
          onApprove: async () => { if (!res.ds || res.issues.some((i) => i.level === 'error')) throw new Error('Fix the errors first.'); const d = res.ds; const old = sets.find((s) => s.end === d.end);
            if (old) { await LM.db.put('history', { ...old, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', old.id); }
            const rec = { id: LM.uid(), dept: 'training', type: 'training', start: d.start, end: d.end, fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), data: d.data };
            await LM.db.put('datasets', rec); await LM.db.put('templates', { ...tpl, dept: 'training', sections: [...new Set([...(tpl.sections || []), ...d.data.found])] }); cur = rec.id; LM.toast(`Training week ${d.start} → ${d.end} processed`); await reload(); } }; };
        const dlg = LM.review(info());
      }

      const body = h('div');
      function draw() {
        LM.killCharts();
        const sel = sets.length > 1 ? h('select', { class: 'sel', onchange: (e) => { cur = e.target.value; draw(); } }, sets.map((s) => h('option', { value: s.id, selected: s.id === cur }, `${s.start} → ${s.end}`))) : null;
        panel.replaceChildren(h('div', { class: 'head' }, h('h2', {}, 'Training'), sel, h('div', { class: 'spacer' }), LM.filePicker(upload, 'Upload weekly report (.pptx)', false, '.pptx')), body);
        LM.dropZone(panel, upload);
        const ds = sets.find((s) => s.id === cur);
        if (!ds) return body.replaceChildren(h('div', { class: 'empty' }, h('h3', {}, 'No training report uploaded yet'), h('p', { class: 'sub' }, 'Drop the weekly training report (.pptx). Onboarding, upcoming trainees, verification, programmes and Know to Grow are read from its slides and tables.')));
        const tabs = ['Overview', 'Onboarding', 'Verification & visits', 'Programs', 'Know to Grow', 'Activities & projects', 'All slides', 'Uploads'];
        body.replaceChildren(h('div', { class: 'sub', style: 'margin-bottom:8px' }, `Week ${ds.data.weekNo ? 'W' + ds.data.weekNo + ' · ' : ''}${ds.start} → ${ds.end} · ${ds.fileName} · uploaded ${ds.uploadedAt.slice(0, 16).replace('T', ' ')}`), h('div', { class: 'subtabs' }, tabs.map((t) => h('button', { class: t === sub ? 'on' : '', onclick: () => { sub = t; draw(); } }, t))),
          { Overview: overview, Onboarding: onboarding, 'Verification & visits': verification, Programs: programs, 'Know to Grow': know, 'Activities & projects': activities, 'All slides': allSlides, Uploads: uploads }[sub](ds));
      }
      const miss = (w) => h('div', { class: 'banner' }, `${w} is not in this deck.`);
      const onbTotal = (d) => (d.onboarding ? (d.onboarding.total != null ? d.onboarding.total : sum(d.onboarding.rows, (r) => r.count)) : null);
      const upTotal = (d) => (d.upcoming ? (d.upcoming.total != null ? d.upcoming.total : sum(d.upcoming.groups, (g) => g.count)) : null);

      /* ---------- Overview ---------- */
      function overview(ds) {
        const d = ds.data; const g = h('div', { class: 'grid kpis' });
        if (d.onboarding) g.append(kpi('Onboarded last week', onbTotal(d), d.onboarding.rows.map((r) => `${r.count} ${r.position}`).join(' · ')));
        if (d.upcoming) { const next = [...d.upcoming.groups].filter((x) => x.date).sort((a, b) => (a.date < b.date ? -1 : 1))[0]; g.append(kpi('Joining soon', upTotal(d), next ? `next: ${next.count} ${next.position}s on ${dstr(next.date)}` : '')); }
        if (d.verification) g.append(kpi('Employees verified', d.verification.total, `${p1(d.verification.pctClaimed)} overall (${p1(d.verification.pctWeighted)} weighted)`));
        if (d.visits) g.append(kpi('Trainer store visits', d.visits.total, d.visits.rows.map((r) => `${r.visits} ${r.type.replace(/ visit$/i, '').toLowerCase()}`).join(' · ')));
        (d.programs || []).forEach((p) => g.append(kpi(p.title.replace(/\s*training summary/i, ''), p.rate != null ? p.rate + '%' : p.achieved, `${p.achieved} of ${p.total} ${p.achievedLabel.toLowerCase()}${p.inProgress ? ` · ${p.inProgress} in progress` : ''}${p.failed ? ` · ${p.failed} failed` : ''}`)));
        if (d.knowToGrow) g.append(kpi('Know to Grow participation', p1(d.knowToGrow.overall.pct), `${d.knowToGrow.overall.stores} of ${d.knowToGrow.overall.totalStores} stores · ${d.knowToGrow.overall.employees} employees`));
        const ahead = []; (d.upcoming ? d.upcoming.groups : []).forEach((x) => ahead.push({ date: x.date, text: `${x.count} ${x.position}${x.count > 1 ? 's' : ''} join onboarding` })); (d.projects || []).forEach((p) => p.steps.forEach((s) => { if (s.date && s.date > ds.end) ahead.push({ date: s.date, text: `${p.title}: ${s.title}${s.desc ? ' – ' + s.desc : ''}` }); })); ahead.sort((a, b) => (a.date < b.date ? -1 : 1));
        const series = sets.slice().reverse(); const trend = series.length > 1;
        const el = h('div', {}, g,
          card('Coming up', ahead.length ? h('ul', { class: 'findings' }, ahead.map((a) => h('li', {}, h('b', {}, dstr(a.date) + ': '), a.text))) : h('span', { class: 'sub' }, 'Nothing dated after this week was found in the deck.')),
          d.takeaways ? card('Key takeaways from the deck', h('ul', { class: 'findings' }, d.takeaways.lines.map((l) => h('li', {}, l)))) : null,
          h('div', { class: 'grid half' }, d.onboarding ? chartCard('Trainees onboarded last week, by position', 'c1') : h('div'), d.upcoming ? chartCard('Upcoming trainees by start date', 'c2') : h('div')),
          trend ? h('div', { class: 'card', style: 'margin-top:12px' }, h('h3', {}, 'Week by week'), h('div', { class: 'chart', id: 'c3' })) : null);
        setTimeout(() => {
          if (d.onboarding) LM.chart(el.querySelector('#c1'), { type: 'bar', data: { labels: d.onboarding.rows.map((r) => r.position), datasets: [{ data: d.onboarding.rows.map((r) => r.count), backgroundColor: LM.css('--accent') }] }, options: { plugins: { legend: { display: false } } } });
          if (d.upcoming) LM.chart(el.querySelector('#c2'), { type: 'bar', data: { labels: d.upcoming.groups.map((x) => `${x.position} · ${x.label}`), datasets: [{ data: d.upcoming.groups.map((x) => x.count), backgroundColor: '#2c7a7b' }] }, options: { plugins: { legend: { display: false } } } });
          if (trend) LM.chart(el.querySelector('#c3'), { type: 'line', data: { labels: series.map((s) => dayLabel(s.end)), datasets: [{ label: 'Onboarded', data: series.map((s) => onbTotal(s.data)), borderColor: PAL[0], tension: 0 }, { label: 'Upcoming', data: series.map((s) => upTotal(s.data)), borderColor: PAL[1], tension: 0 }, { label: 'Store visits', data: series.map((s) => (s.data.visits ? s.data.visits.total : null)), borderColor: PAL[2], tension: 0 }, { label: 'Verified', data: series.map((s) => (s.data.verification ? s.data.verification.total : null)), borderColor: PAL[3], tension: 0 }] }, options: { plugins: { legend: { position: 'bottom' } } } });
        }); return el;
      }

      /* ---------- Onboarding ---------- */
      function onboarding(ds) {
        const d = ds.data; if (!d.onboarding && !d.upcoming) return miss('Onboarding');
        const o = d.onboarding, u = d.upcoming; const el = h('div', {});
        if (o) el.append(h('div', { class: 'grid kpis' }, kpi('Trainees last week', onbTotal(d), `${o.rows.length} positions`), o.rows.map((r) => kpi(r.position, r.count, `${Math.round((r.count / onbTotal(d)) * 100)}% of total`))), card('Where they are now', LM.table([{ k: 'position', label: 'Position', l: 1 }, { k: 'count', label: 'Trainees', fmt: num }, { k: 'note', label: 'Status / next step', l: 1, cls: 'wrap' }], o.rows, { sort: 'count' })));
        if (u) el.append(h('div', { class: 'grid kpis' }, kpi('Upcoming trainees', upTotal(d), 'across all start dates'), u.groups.map((x) => kpi(`${x.count} ${x.position}${x.count > 1 ? 's' : ''}`, dstr(x.date) || x.label, 'start date'))), card('Upcoming onboarding', LM.table([{ k: 'date', label: 'Start date', l: 1, fmt: (v, r) => dstr(v) || r.label }, { k: 'position', label: 'Position', l: 1 }, { k: 'count', label: 'Trainees', fmt: num }], u.groups, { sort: 'date', dir: 1 })));
        return el;
      }

      /* ---------- Verification & visits ---------- */
      function verification(ds) {
        const d = ds.data; if (!d.verification && !d.visits) return miss('Verification and visits'); const v = d.verification, vi = d.visits; const el = h('div', {});
        if (v) el.append(h('div', { class: 'grid kpis' }, kpi('Employees verified', v.total, 'across all positions'), kpi('Verification rate (as shown)', p1(v.pctClaimed), 'simple average of the positions'), kpi('Weighted by employees', p1(v.pctWeighted), 'verified-weighted'), kpi('Largest group', v.rows.slice().sort((a, b) => b.verified - a.verified)[0].position, `${Math.round((v.rows.slice().sort((a, b) => b.verified - a.verified)[0].verified / v.total) * 100)}% of verified staff`)),
          h('div', { class: 'grid half', style: 'margin-bottom:12px' }, chartCard('Employees verified by position', 'c1'), card('Verification by position', LM.table([{ k: 'position', label: 'Position', l: 1 }, { k: 'verified', label: 'Verified', fmt: num }, { k: 'pct', label: 'Verification %', fmt: (x) => x + '%' }], v.rows, { sort: 'verified' }))));
        if (vi) el.append(h('div', { class: 'grid kpis' }, kpi('Trainer store visits', vi.total, 'this week'), vi.rows.map((r) => kpi(r.type, r.visits, `${Math.round((r.visits / vi.total) * 100)}% of visits`))), h('div', { class: 'grid half' }, chartCard('Visits by type', 'c2'), card('Visits', LM.table([{ k: 'type', label: 'Visit type', l: 1 }, { k: 'visits', label: 'Visits', fmt: num }], vi.rows, { sort: 'visits' }))));
        setTimeout(() => { if (v) LM.chart(el.querySelector('#c1'), { type: 'bar', data: { labels: v.rows.map((r) => r.position), datasets: [{ data: v.rows.map((r) => r.verified), backgroundColor: LM.css('--accent') }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } } } }); if (vi) LM.chart(el.querySelector('#c2'), { type: 'doughnut', data: { labels: vi.rows.map((r) => r.type), datasets: [{ data: vi.rows.map((r) => r.visits), backgroundColor: PAL }] }, options: { plugins: { legend: { position: 'bottom' } } } }); }); return el;
      }

      /* ---------- Programs ---------- */
      function programs(ds) {
        const P = ds.data.programs || []; if (!P.length) return miss('Training programmes'); const el = h('div', {});
        P.forEach((p, i) => el.append(card(p.title, p.subtitle ? h('div', { class: 'sub' }, p.subtitle) : null, h('div', { class: 'grid kpis', style: 'margin-top:8px' }, kpi('Total trainees', p.total, ''), kpi(p.achievedLabel || 'Achieved', p.achieved, p.rate != null ? `${p.rate}% rate` : ''), p.inProgress != null ? kpi('Still in progress', p.inProgress, '') : null, p.failed != null ? kpi('Failed', p.failed, '') : null), p.notes.length ? h('div', { class: 'sub' }, p.notes.join(' · ')) : null, p.chart.length ? h('div', { class: 'chart', id: 'c' + i, style: 'height:240px;margin-top:8px' }) : null)));
        setTimeout(() => P.forEach((p, i) => { const c = el.querySelector('#c' + i); if (c) LM.chart(c, { type: p.chart.length <= 2 ? 'doughnut' : 'bar', data: { labels: p.chart.map((x) => x.name), datasets: [{ data: p.chart.map((x) => x.value), backgroundColor: p.chart.map((_, k) => PAL[k % PAL.length]) }] }, options: { plugins: { legend: { display: p.chart.length <= 2, position: 'bottom' } } } }); })); return el;
      }

      /* ---------- Know to Grow ---------- */
      function know(ds) {
        const k = ds.data.knowToGrow; if (!k) return miss('Know to Grow'); const o = k.overall; const rows = k.ams.map((a) => ({ ...a, pctShow: a.pct }));
        const el = h('div', {}, h('div', { class: 'sub', style: 'margin-bottom:8px' }, `Assessment of ${dstr(k.date)}`), h('div', { class: 'grid kpis' }, kpi('Store participation', p1(o.pct), 'overall'), kpi('Stores participated', `${o.stores} / ${o.totalStores}`, `${o.totalStores - o.stores} did not take part`), kpi('Employees who took part', o.employees, `${(o.employees / Math.max(o.stores, 1)).toFixed(1)} per participating store`), kpi('Area Managers at 100%', rows.filter((a) => a.pct >= 99.9).length, `${rows.filter((a) => a.pct < 25).length} below 25%`)),
          h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, 'Store participation by Area Manager'), h('div', { class: 'chart', id: 'c1', style: 'height:360px' })),
          card('By Area Manager', LM.table([{ k: 'name', label: 'Area Manager', l: 1 }, { k: 'total', label: 'Stores', fmt: num }, { k: 'participated', label: 'Participated', fmt: num }, { k: 'not', label: 'Did not', fmt: num }, { k: 'pctShow', label: 'Participation', fmt: (v) => h('span', { class: v >= 75 ? 'up' : v < 25 ? 'down' : '' }, p1(Math.round(v))) }, { k: 'participants', label: 'Employees who took part', fmt: num }], rows, { sort: 'pctShow' })));
        setTimeout(() => LM.chart(el.querySelector('#c1'), { type: 'bar', data: { labels: rows.map((a) => a.name), datasets: [{ label: 'Participated', data: rows.map((a) => a.participated), backgroundColor: '#2c7a7b' }, { label: 'Did not participate', data: rows.map((a) => a.not), backgroundColor: LM.css('--ly') }] }, options: { indexAxis: 'y', plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true } } } })); return el;
      }

      /* ---------- Activities & projects ---------- */
      function activities(ds) {
        const d = ds.data; if (!d.activities && !(d.projects || []).length) return miss('Activities and projects'); const el = h('div', {});
        if (d.activities) el.append(card('Weekly activities', h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fit,minmax(260px,1fr))' }, d.activities.map((a) => h('div', { class: 'card', style: 'box-shadow:none' }, h('div', { class: 'l', style: 'font-size:11px;font-weight:700;color:var(--muted)' }, '#' + a.no), h('b', {}, a.title), h('div', { class: 'sub', style: 'margin-top:4px' }, a.desc))))));
        (d.projects || []).forEach((p) => el.append(card(p.title, h('div', { class: 'sub' }, p.subtitle), p.facts.length ? h('div', { class: 'grid kpis', style: 'margin-top:8px' }, p.facts.map((f) => kpi(f.label, f.value, ''))) : null,
          p.steps.length ? h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:8px' }, p.steps.map((s) => h('div', { class: 'card', style: 'box-shadow:none' }, h('div', { class: 'tools' }, h('b', {}, `${s.no}. ${s.title}`), h('div', { class: 'spacer' }), statusPill(s.status)), h('div', { class: 'sub' }, s.desc)))) : null, p.details.length ? h('ul', { class: 'findings', style: 'margin-top:8px' }, p.details.map((t) => h('li', {}, t))) : null)));
        return el;
      }

      /* ---------- All slides (generic viewer: works for any deck) ---------- */
      function allSlides(ds) {
        const el = h('div', {}); const later = [];
        ds.data.slides.forEach((s) => { const T = s.items.filter((i) => i.kind === 'text' && i.text !== s.title); const tb = s.items.filter((i) => i.kind === 'table'); const ch = s.items.filter((i) => i.kind === 'chart');
          const c = card(`Slide ${s.n}: ${s.title}`, T.length ? h('div', { class: 'sub', style: 'white-space:pre-line;margin-bottom:8px' }, T.map((t) => t.text.replace(/\n/g, ' ')).join('  ·  ')) : null, tb.map((t) => LM.table(t.rows[0].map((hh, i) => ({ k: 'c' + i, label: hh, l: i === 0 })), t.rows.slice(1).map((r) => Object.fromEntries(r.map((v, i) => ['c' + i, v]))), { sort: null })), ch.length ? h('div', { class: 'grid half' }, ch.map((x, i) => { const box = h('div', { class: 'chart', style: 'height:260px' }); later.push([box, x]); return h('div', {}, h('div', { class: 'sub' }, x.title || x.series.map((q) => q.name).join(', ')), box); })) : null, s.pics ? h('div', { class: 'sub' }, `${s.pics} picture(s) on this slide (not readable as data).`) : null); el.append(c); });
        setTimeout(() => later.forEach(([box, x]) => deckChart(box, x))); return el;
      }

      function uploads() {
        return h('div', { class: 'card' }, h('h3', {}, 'Uploaded training reports'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Week', 'File', 'Slides', 'Uploaded', ''].map((t) => h('th', { class: 'l' }, t)))), h('tbody', {}, sets.map((s) => h('tr', {}, h('td', { class: 'l' }, `${s.start} → ${s.end}`), h('td', { class: 'l' }, s.fileName), h('td', { class: 'l' }, s.data.slides.length), h('td', { class: 'l' }, s.uploadedAt.slice(0, 16).replace('T', ' ')),
          h('td', {}, h('button', { class: 'btn small danger', onclick: async () => { if (await LM.ask(`Delete the training week ${s.start} → ${s.end}?`)) { await LM.db.del('datasets', s.id); reload(); } } }, 'Delete')))))));
      }
      await reload();
    },
  };
})();
