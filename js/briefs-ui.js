/* Management briefs: HTML meeting briefs (Cash handling, Policy audit, Coffee quality...) uploaded each week.
   Each brief gets its own sub-tab with a summary in the dashboard's style (KPI tiles, executive summary, findings by level, decisions,
   recommended actions) and a switch to the original document, shown exactly as sent in a sandboxed frame (its scripts run there,
   cut off from the dashboard and its data). The summary is read from the brief's own structure; nothing is retyped. */
(function () {
  const LM = window.LM; const { h, num } = LM; LM.depts = LM.depts || {};
  const T = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');
  const LEVEL = { critical: 'error', important: 'warn', positive: 'ok' };
  const levelOf = (t) => LEVEL[String(t).toLowerCase()] || 'info';

  /** read the brief's sections (the shared brief layout: header, .summary, .kpi, .hl, .req, .rec, .tl, decisions / questions) */
  function parse(html) {
    const d = new DOMParser().parseFromString(html, 'text/html'); // parsing only: no script in the file runs here
    const head = d.querySelector('header') || d;
    const title = T(head.querySelector('h1')) || T(d.querySelector('title')) || 'Untitled brief';
    const tdiv = head.querySelector('.title'); const subtitle = tdiv ? T([...tdiv.children].find((c) => c.tagName !== 'H1')) : '';
    const meta = [...head.querySelectorAll('.meta > div')].map((x) => { const b = x.querySelector('b'); return b ? [T(b).replace(/:\s*$/, ''), T(x).slice(T(b).length).trim()] : null; }).filter(Boolean);
    const status = T(head.querySelector('.meta .badge'));
    const sum = d.querySelector('.summary'); const summary = sum ? [...sum.querySelectorAll(':scope > p')].map(T).filter(Boolean) : [];
    const notice = sum ? T(sum.querySelector('.notice')) : '';
    const kpis = [...d.querySelectorAll('.kpi')].map((k) => ({ v: T(k.querySelector('.v')), l: T(k.querySelector('.l')), n: T(k.querySelector('.n')) })).filter((k) => k.v || k.l);
    const findings = [...d.querySelectorAll('.hl')].map((x) => ({ level: T(x.querySelector('.badge')) || 'Note', title: T(x.querySelector('h3')), text: T(x.querySelector('p')) })).filter((f) => f.title || f.text);
    const requests = [...d.querySelectorAll('.req')].map((x) => { const st = x.querySelector('.badge'); const txt = T(x.querySelector('span:not(.badge)')); const stream = x.closest('.stream'); return { stream: stream ? T(stream.querySelector('h3')) : '', text: txt, status: T(st) }; });
    const who = (x, k) => { const s = [...x.querySelectorAll('.who span')].find((y) => new RegExp('^' + k, 'i').test(T(y))); return s ? T(s).replace(new RegExp('^' + k + ':?\\s*', 'i'), '') : ''; };
    const actions = [...d.querySelectorAll('.rec')].map((x) => ({ n: T(x.querySelector('.n')), title: T(x.querySelector('h3')), text: T(x.querySelector('p')), owner: who(x, 'Owner'), by: who(x, 'By') }));
    const timeline = [...d.querySelectorAll('.tl')].map((x) => { const b = x.querySelector('b'); return { when: T(b), text: T(x).slice(T(b).length).trim(), level: x.classList.contains('crit') ? 'error' : x.classList.contains('warn') ? 'warn' : 'info' }; });
    const listAfter = (re) => { const h3 = [...d.querySelectorAll('h3')].find((x) => re.test(T(x))); const c = h3 && (h3.closest('.card') || h3.parentElement); return c ? [...c.querySelectorAll('li')].map(T) : []; };
    const decisions = listAfter(/^decisions/i), questions = listAfter(/^questions/i);
    const sections = [...d.querySelectorAll('h2')].map((x) => T(x).replace(/^\d+\s*/, ''));
    return { title, subtitle, meta, status, summary, notice, kpis, findings, requests, actions, timeline, decisions, questions, sections };
  }
  /* a short tab name: the part before “:”, without brackets, a leading “Drip” or a trailing “Improvement (Program)” */
  const short = (t) => t.split(':')[0].replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim().replace(/^Drip /i, '').replace(/ Improvement( Program)?$/i, '').replace(/ Program$/i, '');

  LM.depts.briefs = {
    id: 'briefs', label: 'Management briefs',
    async mount(panel) {
      const readOnly = !!((LM.snapshot && LM.snapshot.active) || LM.viewOnly);
      let list = [], older = false, sub = 'Overview', view = 'summary';
      const wkOf = (r) => r.week || r.end || '';
      async function load() {
        list = (await LM.db.all('datasets')).filter((r) => r.dept === 'briefs'); older = false;
        /* a week shows only its own briefs: nothing is carried over from an earlier week */
        list.forEach((r) => (r.p = parse(r.data.html))); list.sort((a, b) => (a.uploadedAt < b.uploadedAt ? -1 : 1));
        if (sub !== 'Overview' && !list.some((r) => r.id === sub)) sub = 'Overview';
      }

      async function upload(files) {
        for (const file of [].concat(files)) {
          if (!/\.html?$/i.test(file.name)) { await LM.say(`“${file.name}” is not an HTML brief (.html).`); continue; }
          let rf; try { rf = await LM.readBinary(file); } catch (e) { await LM.say(e.message); continue; }
          const html = new TextDecoder().decode(rf.buf); const p = parse(html);
          const issues = []; const same = list.filter((r) => !older && r.p.title.toLowerCase() === p.title.toLowerCase());
          if (same.length) issues.push({ level: 'warn', msg: `A brief called “${p.title}” is already saved for this week (${same[0].fileName}). Approving replaces it; the old one is kept in history.` });
          if (!p.kpis.length && !p.summary.length && !p.findings.length) issues.push({ level: 'warn', msg: 'No summary sections were found in this file (it does not use the usual brief layout), so only the original document will be shown.' });
          const miss = [['executive summary', p.summary.length], ['KPI tiles', p.kpis.length], ['findings', p.findings.length], ['recommended actions', p.actions.length]].filter(([, n]) => !n).map(([l]) => l);
          if (miss.length && miss.length < 4) issues.push({ level: 'info', msg: `Not found in this brief: ${miss.join(', ')}. Those parts are left out of the summary; the original shows everything.` });
          issues.push({ level: 'info', msg: 'Charts drawn by the brief’s own scripts appear in the Original view only.' });
          const cnt = (lv) => p.findings.filter((f) => levelOf(f.level) === lv).length;
          await new Promise((resolve) => { LM.review({ title: `Review before saving: ${rf.name}`,
            facts: [['Brief', p.title], ['KPI tiles', p.kpis.length], ['Critical / important findings', `${cnt('error')} / ${cnt('warn')}`], ['Recommended actions', p.actions.length], ['Decisions needed', p.decisions.length]],
            issues, approveLabel: same.length ? 'Approve & replace brief' : 'Approve & save',
            onCancel: () => resolve(),
            onApprove: async () => {
              for (const old of same) { const { p: _p, ...o } = old; await LM.db.put('history', { ...o, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', old.id); }
              const wk = (LM.week && LM.week.selected) || new Date().toISOString().slice(0, 10); const st = new Date(wk + 'T00:00:00Z'); st.setUTCDate(st.getUTCDate() - 6);
              const rec = { id: LM.uid(), dept: 'briefs', type: 'brief', start: st.toISOString().slice(0, 10), end: wk, fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(),
                data: { title: p.title, html, summary: { subtitle: p.subtitle, meta: p.meta, status: p.status, summary: p.summary, kpis: p.kpis, findings: p.findings, actions: p.actions, decisions: p.decisions, questions: p.questions } } };
              await LM.db.put('datasets', rec); sub = rec.id; view = 'summary'; LM.toast('Brief saved'); await load(); draw(); setTimeout(resolve, 50); } }); });
        }
      }

      const kpi = (l, v, d) => h('div', { class: 'card kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v', style: 'font-size:clamp(20px,2.4vw,30px)' }, v), h('div', { class: 'd' }, d));
      const chip = (lv, t) => h('span', { class: 'chip ' + lv, style: 'white-space:nowrap' }, t);
      const card = (title, ...kids) => h('div', { class: 'card', style: 'margin-bottom:12px' }, title ? h('h3', {}, title) : null, ...kids);

      function overview() {
        if (!list.length) return h('div', { class: 'empty' }, h('h3', {}, 'No briefs uploaded yet'), h('p', { class: 'sub' }, 'Upload this week’s management briefs (.html). Each one gets its own tab with a summary, and the original stays one click away.'));
        const all = list.flatMap((r) => r.p.findings.map((f) => ({ ...f, brief: r }))); const n = (lv) => all.filter((f) => levelOf(f.level) === lv).length;
        const rows = list.map((r) => { const c = (lv) => r.p.findings.filter((f) => levelOf(f.level) === lv).length; const prep = (r.p.meta.find((m) => /prepared/i.test(m[0])) || [])[1] || '';
          return h('tr', { style: 'cursor:pointer', onclick: () => { sub = r.id; view = 'summary'; draw(); } }, h('td', { class: 'l' }, h('b', {}, r.p.title), h('div', { class: 'sub' }, r.p.subtitle)), h('td', { class: 'l' }, r.p.status ? chip(/critical|red/i.test(r.p.status) ? 'error' : /amber|partial/i.test(r.p.status) ? 'warn' : 'info', r.p.status) : '–'), h('td', {}, num(c('error'))), h('td', {}, num(c('warn'))), h('td', {}, num(r.p.decisions.length)), h('td', {}, num(r.p.actions.length)), h('td', { class: 'l' }, prep)); });
        const crit = all.filter((f) => levelOf(f.level) === 'error');
        const dec = list.flatMap((r) => r.p.decisions.map((x) => ({ x, r })));
        return h('div', {},
          h('div', { class: 'grid kpis' }, kpi('Briefs', num(list.length), 'this week'), kpi('Critical findings', num(n('error')), 'across all briefs'), kpi('Important findings', num(n('warn')), 'across all briefs'), kpi('Decisions needed', num(dec.length), 'for the meeting'), kpi('Recommended actions', num(list.reduce((t, r) => t + r.p.actions.length, 0)), 'with owners and dates')),
          card('Briefs this week', h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Brief', 'Status', 'Critical', 'Important', 'Decisions', 'Actions', 'Prepared'].map((t, i) => h('th', { class: i < 2 || i === 6 ? 'l' : '' }, t)))), h('tbody', {}, rows)), h('div', { class: 'sub', style: 'margin-top:6px' }, 'Click a brief to open its summary.')),
          crit.length ? card('Critical findings', h('ul', { class: 'findings' }, crit.map((f) => h('li', {}, h('b', {}, f.title), ' · ', h('span', { class: 'sub' }, short(f.brief.p.title)), h('div', {}, f.text))))) : null,
          dec.length ? card('Decisions needed at the meeting', h('ul', { class: 'findings' }, dec.map(({ x, r }) => h('li', {}, x, ' ', h('span', { class: 'sub' }, '· ' + short(r.p.title)))))) : null);
      }

      function brief(r) {
        const p = r.p;
        const sw = (k, l) => h('button', { class: 'btn small' + (view === k ? ' primary' : ''), onclick: () => { view = k; draw(); } }, l);
        const dl = h('button', { class: 'btn small', onclick: () => { const a = h('a', { href: URL.createObjectURL(new Blob([r.data.html], { type: 'text/html' })), download: r.fileName }); document.body.append(a); a.click(); a.remove(); } }, '⬇ Original file');
        const rm = readOnly || older ? null : h('button', { class: 'btn small danger', onclick: async () => { if (await LM.ask(`Remove the brief “${p.title}” from this week?`)) { await LM.db.del('datasets', r.id); await load(); draw(); } } }, 'Remove');
        const top = h('div', { class: 'tools', style: 'margin-bottom:10px;align-items:flex-start' }, h('div', {}, h('h3', { style: 'margin:0' }, p.title), p.subtitle ? h('div', { class: 'sub' }, p.subtitle) : null), h('div', { class: 'spacer' }), sw('summary', 'Summary'), sw('original', 'Original'), dl, rm);
        if (view === 'original') return h('div', {}, top, h('iframe', { sandbox: 'allow-scripts', srcdoc: r.data.html, title: p.title, style: 'width:100%;height:78vh;border:1px solid var(--line);border-radius:12px;background:#fff' }), h('div', { class: 'sub', style: 'margin-top:6px' }, `The brief exactly as uploaded (${r.fileName}). It runs in a closed frame and cannot reach the dashboard or its data.`));
        const cnt = (lv) => p.findings.filter((f) => levelOf(f.level) === lv).length;
        const metaLine = p.meta.length ? h('div', { class: 'sub', style: 'margin-bottom:10px' }, p.meta.map(([k, v]) => `${k}: ${v}`).join(' · '), p.status ? ' · ' : '', p.status ? chip('info', p.status) : null) : null;
        const tiles = p.kpis.length ? h('div', { class: 'grid kpis' }, p.kpis.map((k) => kpi(k.l, k.v, k.n))) : null;
        const exec = p.summary.length ? card('Executive summary', ...p.summary.map((t) => h('p', { style: 'margin:0 0 8px' }, t)), p.notice ? h('div', { class: 'banner', style: 'margin:6px 0 0' }, p.notice) : null) : null;
        const finds = p.findings.length ? card(`Findings · ${cnt('error')} critical, ${cnt('warn')} important${cnt('ok') ? `, ${cnt('ok')} positive` : ''}`, h('table', { class: 't' }, h('tbody', {}, p.findings.map((f) => h('tr', {}, h('td', { class: 'l', style: 'width:110px;vertical-align:top' }, chip(levelOf(f.level), f.level)), h('td', { class: 'l wrap', style: 'white-space:normal' }, h('b', {}, f.title), h('div', {}, f.text))))))) : null;
        const reqs = p.requests.length ? card('Requests and response status', h('table', { class: 't' }, h('tbody', {}, p.requests.map((q) => h('tr', {}, h('td', { class: 'l', style: 'white-space:normal' }, q.text, q.stream ? h('div', { class: 'sub' }, q.stream) : null), h('td', { style: 'width:150px' }, chip(/overdue|not in|late/i.test(q.status) ? 'error' : /unclear|partial/i.test(q.status) ? 'warn' : 'ok', q.status))))))) : null;
        const meet = p.decisions.length || p.questions.length ? h('div', { class: 'grid two', style: 'margin-bottom:0' }, p.decisions.length ? card('Decisions needed', h('ul', { class: 'findings' }, p.decisions.map((x) => h('li', {}, x)))) : null, p.questions.length ? card('Questions to raise', h('ul', { class: 'findings' }, p.questions.map((x) => h('li', {}, x)))) : null) : null;
        const acts = p.actions.length ? card('Recommended actions', h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['#', 'Action', 'Owner', 'By'].map((t, i) => h('th', { class: i ? 'l' : '' }, t)))), h('tbody', {}, p.actions.map((a) => h('tr', {}, h('td', { style: 'vertical-align:top' }, a.n), h('td', { class: 'l', style: 'white-space:normal' }, h('b', {}, a.title), h('div', { class: 'sub' }, a.text)), h('td', { class: 'l', style: 'white-space:normal;vertical-align:top' }, a.owner || '–'), h('td', { class: 'l', style: 'vertical-align:top' }, a.by || '–')))))) : null;
        const tl = p.timeline.length ? card('Timeline', h('table', { class: 't' }, h('tbody', {}, p.timeline.map((t) => h('tr', {}, h('td', { class: 'l', style: 'width:150px;white-space:nowrap;vertical-align:top' }, chip(t.level, t.when)), h('td', { class: 'l', style: 'white-space:normal' }, t.text)))))) : null;
        const none = !tiles && !exec && !finds ? h('div', { class: 'banner' }, 'This file does not use the usual brief layout, so no summary could be read. Use “Original” to see it.') : null;
        return h('div', {}, top, metaLine, none, tiles, exec, meet, finds, reqs, acts, tl, h('div', { class: 'sub' }, 'Summary read from the brief itself. Tables and charts drawn by the brief’s scripts are in the Original view.'));
      }

      function draw() {
        const picker = readOnly ? null : LM.filePicker(upload, 'Upload briefs', true, '.html,.htm');
        const tabs = ['Overview', ...list.map((r) => r.id)];
        const st = list.length ? h('div', { class: 'subtabs' }, tabs.map((t) => h('button', { class: t === sub ? 'on' : '', onclick: () => { sub = t; view = 'summary'; draw(); } }, t === 'Overview' ? 'Overview' : short(list.find((r) => r.id === t).p.title)))) : null;
        const cur = list.find((r) => r.id === sub);
        panel.replaceChildren(...[h('div', { class: 'head' }, h('h2', {}, 'Management briefs'), h('div', { class: 'spacer' }), picker),
          older ? h('div', { class: 'banner', style: 'background:var(--warn-bg);color:var(--warn)' }, `No briefs for this week yet. Showing the briefs of the week ending ${older}.`) : null,
          st, cur ? brief(cur) : overview()].filter(Boolean));
        if (!readOnly) LM.dropZone(panel, upload, true);
      }
      await load(); draw();
    },
  };
  LM.briefs = { parse };
})();
