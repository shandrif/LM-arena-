/* Weeks. Every uploaded report belongs to a week (Sunday-Saturday, named by its Saturday). The Week box in the header chooses which
   week you are looking at and uploading into; earlier weeks stay saved. A tab shows the newest file it has up to the chosen week, and
   a banner says so when that file is older than the chosen week. Works on top of any storage back-end (cloud, claude.ai, this browser). */
(function () {
  const LM = window.LM; if (LM.snapshot && LM.snapshot.active) return; const { h } = LM;
  const DAY = 86400000; const KEY = 'lm-week'; const WEEK_RE = /^\d{4}-\d\d-\d\d$/; const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ts = (d) => Date.parse(d.slice(0, 10) + 'T00:00:00Z'); const iso = (t) => new Date(t).toISOString().slice(0, 10);
  /* the Saturday that ends the Sunday-Saturday week containing `d`; a Sunday date belongs to the week that has just ended */
  const weekOf = (d) => { if (!d || !/^\d{4}-\d\d-\d\d/.test(d)) return null; const t = ts(d); const dow = new Date(t).getUTCDay(); return dow === 0 ? iso(t - DAY) : iso(t + (6 - dow) * DAY); };
  const label = (we) => { const a = new Date(ts(we) - 6 * DAY); const b = new Date(ts(we)); const m = (x) => MON[x.getUTCMonth()]; return `${a.getUTCDate()}${a.getUTCMonth() === b.getUTCMonth() ? '' : ' ' + m(a)} – ${b.getUTCDate()} ${m(b)} ${b.getUTCFullYear()}`; };
  const today = () => iso(Date.now());
  // week of a record saved before weeks existed: long reference files (a year calendar, a trend) are always available; otherwise the earlier of its end date and its upload day
  const REF = '2000-01-01'; // long reference files (a year calendar, a trend) are available in every week and are not listed as a week
  // a report saved before weeks existed has no week yet: it is shown in every week until the owner assigns it (see migrateLegacy)
  const recWeek = (r) => r.week || REF;
  const saved = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const persist = (w) => { try { localStorage.setItem(KEY, w); } catch (e) { /* ignore */ } };
  const W = LM.week = { selected: null, list: [], of: weekOf, label, recWeek, REF, importing: false, ready: false };
  let base = null; let ctl = null;

  LM.ready = Promise.resolve(LM.ready).catch(() => {}).then(async () => {
    base = LM.dbRaw = LM.db;
    const mine = (r) => recWeek(r);
    const rebuild = async () => {
      if (LM.cloud) { try { W.list = (await LM.cloud.weeks()).map((x) => ({ week: x.week, n: x.n })); } catch (e) { W.list = []; } }
      else { const m = new Map(); for (const s of ['datasets', 'history']) for (const r of await base.all(s)) { const w = mine(r); const o = m.get(w) || { week: w, n: 0 }; if (s === 'datasets') o.n++; m.set(w, o); } W.list = [...m.values()].sort((a, b) => (a.week < b.week ? 1 : -1)); }
      if (W.selected && !W.list.some((x) => x.week === W.selected)) W.list.unshift({ week: W.selected, n: 0 }); // a week you have just started
      W.list = W.list.filter((x) => x.week > '2010-01-01'); W.list.sort((a, b) => (a.week < b.week ? 1 : -1));
    };
    W.rebuild = rebuild;
    await rebuild();
    const s0 = saved(); const dataWeeks = W.list.filter((x) => x.n > 0);
    W.selected = s0 && WEEK_RE.test(s0) && W.list.some((x) => x.week === s0) ? s0 : dataWeeks.length ? dataWeeks[0].week : weekOf(today());
    if (!W.list.some((x) => x.week === W.selected)) W.list.unshift({ week: W.selected, n: 0 });
    if (LM.cloud) await LM.cloud.load(W.selected);
    const vis = (s, r) => (s === 'templates' ? true : mine(r) <= W.selected);
    LM.db = {
      all: async (s) => (await base.all(s)).filter((r) => vis(s, r)),
      get: (s, k) => base.get(s, k),
      put: async (s, v) => { if (s !== 'templates' && !v.week) v.week = W.importing ? recWeek(v) : W.selected; const had = s === 'datasets' ? await base.get(s, v.id) : null; const r = await base.put(s, v); if (s === 'datasets' && !had) bump(v.week, 1); return r; },
      del: async (s, k) => { const old = s === 'datasets' ? await base.get(s, k) : null; const r = await base.del(s, k); if (old) bump(mine(old), -1); return r; },
      // "clear" only ever empties the week you are in: other weeks, saved formats and notes are untouched
      clear: async (s) => { if (s === 'templates') return base.clear(s); for (const r of await base.all(s)) if (mine(r) === W.selected) await base.del(s, r[s === 'templates' ? 'dept' : 'id']); if (s === 'datasets') { const o = W.list.find((x) => x.week === W.selected); if (o) o.n = 0; fillControl(); } },
    };
    W.ready = true;
  });
  function bump(week, d) { let o = W.list.find((x) => x.week === week); if (!o) { o = { week, n: 0 }; W.list.push(o); W.list.sort((a, b) => (a.week < b.week ? 1 : -1)); } o.n = Math.max(0, o.n + d); fillControl(); }

  W.select = async (we) => { W.selected = we; persist(we); if (LM.cloud) { try { await LM.cloud.load(we); } catch (e) { if (LM.say) LM.say('Could not load that week: ' + e.message); } } fillControl(); if (LM.refresh) LM.refresh(); };
  W.reload = async () => { if (LM.cloud) { await LM.cloud.load(W.selected); await W.rebuild(); fillControl(); } else await W.rebuild(); };
  W.startNew = async () => {
    const latest = W.list.length ? W.list[0].week : W.selected; const next = iso(Math.max(ts(latest), ts(W.selected)) + 7 * DAY);
    if (!LM.ask || await LM.ask(`Start the week ${label(next)}?\n\nThe weeks before it stay saved and can be opened any time from the Week box. Files you upload now go into the new week.`)) { if (!W.list.some((x) => x.week === next)) { W.list.unshift({ week: next, n: 0 }); } await W.select(next); }
  };
  function fillControl() { if (!ctl) return; const sel = ctl.querySelector('select'); sel.replaceChildren(...W.list.map((x) => h('option', { value: x.week, selected: x.week === W.selected }, `${label(x.week)}${x.n ? ` · ${x.n} file${x.n > 1 ? 's' : ''}` : ' · empty'}`))); sel.value = W.selected; }
  W.control = () => {
    const sel = h('select', { class: 'sel', title: 'Choose the week to look at / upload into', onchange: (e) => W.select(e.target.value) });
    ctl = h('div', { class: 'wkctl' }, h('span', { class: 'sub' }, 'Week'), sel, LM.viewOnly ? null : h('button', { class: 'btn small', title: 'Start the next week: earlier weeks stay saved', onclick: () => W.startNew() }, '＋ New week')); fillControl(); return ctl;
  };

  /* ---- one-time: reports saved before weeks existed are put into a week the owner chooses ---- */
  W.migrateLegacy = async () => {
    if (LM.viewOnly || !base) return;
    const old = []; for (const s of ['datasets', 'history']) for (const r of await base.all(s)) if (!r.week) old.push([s, r]);
    if (!old.length) return;
    const ends = old.filter(([s]) => s === 'datasets').map(([, r]) => r).filter((r) => r.end && !(r.start && (ts(r.end) - ts(r.start)) > 100 * DAY)).map((r) => r.end).sort();
    const guess = weekOf(ends.length ? ends[Math.floor(ends.length / 2)] : today()) || W.selected;
    const pick = await W.pickWeek('Which week do your current reports belong to?', `${old.filter(([s]) => s === 'datasets').length} report(s) were uploaded before weeks existed. Choose the week to put them in. Long reference files (such as the year calendar) stay available in every week. Until you choose, they show in every week.`, guess, 'Save');
    if (!pick) return;
    for (const [s, r] of old) { const long = r.start && r.end && (ts(r.end) - ts(r.start)) > 100 * DAY; r.week = long ? REF : pick; await base.put(s, r); }
    await W.rebuild(); W.selected = pick; persist(pick); if (LM.cloud) await LM.cloud.load(pick); fillControl(); if (LM.refresh) LM.refresh(); if (LM.toast) LM.toast('Your reports are now in the week ' + label(pick));
  };

  /* ---- backup of every week / restore that adds to what is there ---- */
  W.exportAll = async () => { if (LM.cloud) return LM.cloud.exportAll(); const o = {}; for (const s of ['datasets', 'templates', 'history']) o[s] = await base.all(s); return o; };
  W.pickWeek = (title, text, def, okLabel = 'Restore') => new Promise((resolve) => {
    const ov = h('div', { class: 'overlay' }); const close = (v) => { ov.remove(); resolve(v); };
    const sel = h('select', { class: 'sel' }, [...new Set([def, ...W.list.map((x) => x.week)])].sort().reverse().map((w) => h('option', { value: w, selected: w === def }, label(w))));
    ov.append(h('div', { class: 'modal', style: 'max-width:520px' }, h('div', { class: 'mh' }, h('h3', {}, title)), h('div', { class: 'mb' }, h('p', {}, text), sel), h('div', { class: 'mf' }, h('div', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => close(null) }, okLabel === 'Save' ? 'Later' : 'Cancel'), h('button', { class: 'btn primary', onclick: () => close(sel.value) }, okLabel))));
    document.body.append(ov);
  });

  /* ---- banner: which tabs have nothing new for the chosen week ---- */
  W.attach = (panel, getTab) => {
    let timer = null; let busy = false;
    const pretty = (t) => String(t).replace(/[-_]/g, ' ');
    async function run() {
      timer = null; if (busy || !W.ready) return; busy = true;
      try {
        const tab = getTab(); let bar = panel.querySelector(':scope > .wk-banner'); let text = '';
        if (tab !== 'discussion') {
          const recs = (await LM.db.all('datasets')).filter((r) => r.dept === tab); const latest = new Map();
          recs.forEach((r) => { const k = r.type || ''; const w = recWeek(r); if (!latest.has(k) || w > latest.get(k)) latest.set(k, w); });
          const old = [...latest].filter(([, w]) => w < W.selected && w !== REF);
          if (old.length) { const names = old.map(([t]) => (t ? pretty(t) : null)).filter(Boolean); const oldest = old.map(([, w]) => w).sort()[0]; text = `Week ${label(W.selected)}: ${names.length ? 'no new file yet for ' + names.join(', ') : 'no new file for this tab yet'}. Showing the latest earlier upload (week ${label(oldest)}).`; }
        }
        if (!text) { if (bar) bar.remove(); return; }
        if (!bar) { bar = h('div', { class: 'banner wk-banner', style: 'margin-bottom:10px' }); panel.prepend(bar); }
        if (bar.textContent !== text) bar.textContent = text;
      } finally { busy = false; }
    }
    const schedule = () => { if (timer == null) timer = setTimeout(run, 60); };
    new MutationObserver(schedule).observe(panel, { childList: true, subtree: true }); schedule(); W.recheck = schedule;
  };
})();
