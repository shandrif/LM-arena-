/* International: the newer inputs.
   1. "Weekly Sales Review | Iraq & London" deck (Week N vs Week M, KPI tiles + weekday charts + store table + takeaways + Google reviews)
   2. the two raw workbooks (London "Revenue by day / Itemwise / Category / Revenue per hour", Iraq "Daily Sales Report / Item wise sales")
   3. "HM Weekly Event Report" PDF in the Sales Overview / Sales Mix / Events & Operations layout
   Every reader produces the same data shape as the older readers, so the International tab shows it the same way. No DOM. */
(function (root) {
  const LM = (root.LM = root.LM || {});
  const { norm } = LM; const X = LM.international;
  const I = (level, msg, fix) => ({ level, msg, fix });
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const MONN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monNo = (s) => MON.indexOf(String(s).slice(0, 3).toLowerCase()) + 1;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const addDays = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const dowOf = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
  const dmon = (d) => `${+d.slice(8, 10)} ${MONN[+d.slice(5, 7) - 1]}`;
  const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x || 0), 0);
  const items = (s, k) => s.items.filter((i) => i.kind === k);
  const fmtN = (n, d) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const r2 = (n) => Math.round(n * 100) / 100;
  const val = (v) => X.val(v);
  const fmtN2 = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const sgn = (p) => `${p < 0 ? '-' : '+'}${Math.abs(p).toFixed(1)}%`;
  const pctOf = (c, p) => (p ? Number((((c - p) / p) * 100).toFixed(1)) : null);
  const word = (p) => (p < 0 ? 'down' : 'up');
  const kfmt = (n, d) => (n >= 1000 ? (n / 1000).toFixed(d == null ? 1 : d) + 'K' : String(Math.round(n)));
  const CH = (title, type, dir, cats, series) => ({ kind: 'chart', type, dir, grouping: type === 'line' ? 'standard' : 'clustered', title, cats, series });

  /* =====================================================================================
     1. the "Weekly Sales Review | Iraq & London" deck
     ===================================================================================== */
  function weeklyInfo(slides, yearHint) {
    const s0 = slides && slides[0]; if (!s0) return null;
    const txt = [s0.title, ...items(s0, 'text').map((t) => t.text)].join(' ');
    if (!/weekly\s+sales\s+review/i.test(txt)) return null;
    const yr = (/(20\d\d)/.exec(txt) || [])[1] || yearHint; const ws = []; const re = /Week\s*(\d+)\s*\(([^)]*)\)/gi; let m;
    while ((m = re.exec(txt))) {
      const r = /(\d{1,2})\s*([A-Za-z]{3})?[A-Za-z]*\s*[–—-]\s*(\d{1,2})\s*([A-Za-z]{3})[A-Za-z]*\s*(20\d\d)?/.exec(m[2]); if (!r) continue;
      const m2 = monNo(r[4]), m1 = r[2] ? monNo(r[2]) : m2; const y = +(r[5] || yr || 0); if (!m2 || !m1 || !y) continue;
      ws.push({ no: +m[1], start: iso(m1 > m2 ? y - 1 : y, m1, +r[1]), end: iso(y, m2, +r[3]) });
    }
    if (ws.length < 2) return null; ws.sort((a, b) => (a.end < b.end ? -1 : 1));
    const has = (re2) => slides.some((s) => re2.test(s.title || '') && (items(s, 'chart').length || items(s, 'table').length));
    const markets = { london: has(/^london\b/i), iraq: has(/^iraq\b/i) };
    if (!markets.london && !markets.iraq) return null;
    return { cur: ws[ws.length - 1], prev: ws[ws.length - 2], markets };
  }
  const hasTable = (s, re) => items(s, 'table').some((t) => re.test(t.rows[0].map(norm).join('|')));
  /** the slides of the deck, split into the sections the International tab keeps: London, Iraq, Saudi NSO, expansion */
  function weeklySections(slides) {
    const wi = weeklyInfo(slides); if (!wi) return null;
    const isNso = (s) => hasTable(s, /readiness/) || /^nso\b/i.test(s.title || '');
    const isExp = (s) => /gcc expansion/i.test(s.title || '') || /iraq operation\s*(&|and)\s*expansion/i.test(s.title || '');
    const f = slides.findIndex((s, i) => i > 0 && (isNso(s) || isExp(s))); const review = f < 0 ? slides : slides.slice(0, f); const rest = f < 0 ? [] : slides.slice(f);
    const secs = []; if (wi.markets.london) secs.push(['london', review]); if (wi.markets.iraq) secs.push(['iraq', review]);
    const nsoS = rest.filter((s) => hasTable(s, /readiness/)), expS = rest.filter((s) => items(s, 'table').length && !hasTable(s, /readiness/) && hasTable(s, /status/));
    if (nsoS.length) secs.push(['nso', nsoS]); if (expS.length) secs.push(['expansion', expS]); secs.dup = 0; return secs;
  }
  /** "SAR 530.2K" / "£31.5K" / "15,445" / "5.85" -> number (K/M expanded) */
  const kNum = (t) => { const m = /([\d,]+(?:\.\d+)?)\s*([KkMm]?)\b/.exec(String(t).replace(/[−–—]/g, '-')); if (!m) return null; const n = Number(m[1].replace(/,/g, '')); return Number.isFinite(n) ? n * ({ k: 1e3, m: 1e6 }[m[2].toLowerCase()] || 1) : null; };
  const BIG = /^(?:SAR|IQD|GBP|USD)?\s*[£$]?\s*[\d,]+(?:\.\d+)?\s*[KkMm]?$/;
  /** the big-number blocks of a market slide: label above, value, "▲ +7.4%" beside it, "Week 1: …" below */
  function kpiBlocks(sl) {
    const out = [];
    sl.forEach((s) => { const T = items(s, 'text'); T.filter((t) => (t.fs || 0) >= 20 && BIG.test(t.text.trim())).forEach((b) => {
      const label = T.filter((u) => u !== b && u.y < b.y && b.y - u.y < 0.1 && Math.abs(u.x - b.x) < 0.04).sort((p, q) => q.y - p.y)[0];
      const pc = T.find((u) => /^[▲▼]/.test(u.text.trim()) && Math.abs(u.y - b.y) < 0.03 && u.x > b.x);
      const pv = T.filter((u) => u.y > b.y && u.y - b.y < 0.2 && Math.abs(u.x - b.x) < 0.04 && /^week\s*\d+\s*:/i.test(u.text.trim())).sort((p, q) => p.y - q.y)[0];
      if (!label) return; const pm = pc ? /([▲▼])\s*([+\-–−]?)\s*([\d.]+)\s*%/.exec(pc.text) : null;
      out.push({ label: label.text.replace(/\s+/g, ' ').trim(), value: b.text.trim(), n: kNum(b.text), pct: pm ? (pm[1] === '▼' || /[-–−]/.test(pm[2]) ? -1 : 1) * Number(pm[3]) : null, prevText: pv ? pv.text.replace(/^week\s*\d+\s*:\s*/i, '').trim() : null, prevN: pv ? kNum(pv.text.replace(/^week\s*\d+\s*:/i, '')) : null, slide: s.n });
    }); });
    return out;
  }
  const seriesPair = (c, wi) => {
    if (!c || !c.series || c.series.length < 2) return null; const num = (s) => { const m = /(?:week|wk)\s*(\d+)/i.exec(s.name || ''); return m ? +m[1] : null; };
    let p = c.series.find((s) => num(s) === wi.prev.no), q = c.series.find((s) => num(s) === wi.cur.no); if (!p || !q || p === q) { p = c.series[0]; q = c.series[1]; }
    return { prev: p.values.map((v) => v || 0), cur: q.values.map((v) => v || 0), cats: c.cats };
  };
  const marketOfSlide = (s) => {
    const t = s.title || ''; if (/^london\b/i.test(t)) return 'London'; if (/^iraq\b/i.test(t) && (items(s, 'chart').length || items(s, 'table').length)) return 'Iraq';
    if (/google|reviews/i.test(t)) { const all = t + ' ' + items(s, 'text').map((x) => x.text).join(' '); return /iraq|baghdad|erbil/i.test(all) ? 'Iraq' : 'London'; } return null;
  };
  function reviewInfo(s) {
    const T = items(s, 'text').filter((t) => t.text !== s.title); const g = (re) => T.find((t) => re.test(t.text.trim()));
    const rating = g(/^\d\.\d$/); const cnt = T.find((t) => /^[\d,]{2,}\s*\n?\s*google reviews/i.test(t.text.trim())); const sub = T.filter((t) => t.y < 0.25 && t.y > 0.1 && (t.fs || 0) >= 12).sort((a, b) => a.y - b.y)[0];
    const lines = (t) => (t ? t.text.split('\n').map((x) => x.trim()).filter(Boolean) : []);
    const l1 = g(/^what guests love/i), l2 = g(/^what could improve/i);
    const under = (lab, nextLab) => (lab ? T.filter((t) => t !== lab && t !== nextLab && t.text.length > 3 && t.y > lab.y && t.y - lab.y < 0.3 && Math.abs(t.x - lab.x) < 0.1 && (!nextLab || t.y < nextLab.y)).sort((a, b) => a.y - b.y)[0] : null);
    const loves = under(l1, l2), flags = under(l2, null);
    const staff = T.filter((t) => (t.fs || 0) >= 20 && t.y > 0.22 && t.y < 0.45 && t.x > 0.3 && !BIG.test(t.text.trim()) && !/^\d\.\d$/.test(t.text.trim())).sort((a, b) => a.x - b.x).map((n) => {
      const men = T.filter((u) => u !== n && /mention/i.test(u.text) && Math.abs(u.x - n.x) < 0.04 && u.y > n.y && u.y - n.y < 0.12).sort((a, b) => a.y - b.y)[0];
      const note = men ? T.filter((u) => u !== men && u !== n && !/mention|what the reviewer/i.test(u.text) && u.y > men.y && u.y - men.y < 0.15 && Math.abs(u.x - n.x) < 0.12).sort((a, b) => Math.abs(a.x - n.x) - Math.abs(b.x - n.x))[0] : null;
      return { name: n.text.replace(/\s+/g, ' ').trim(), mentions: men && men.text, note: note && note.text }; });
    const said = g(/^what the reviewer said/i);
    const out = []; if (rating) out.push(`Google rating ${rating.text.trim()}${cnt ? ` from ${/^([\d,]+)/.exec(cnt.text.trim())[1]} reviews` : ''}.`);
    if (sub) out.push(sub.text.replace(/\s+/g, ' ').trim().replace(/\.?$/, '.'));
    staff.forEach((x) => out.push(`${x.name}${x.mentions ? ': ' + x.mentions.replace(/\s+/g, ' ') : ''}${x.note ? ' — ' + x.note.replace(/\s+/g, ' ') : ''}`));
    if (loves) out.push('Guests love: ' + lines(loves).join('; ')); if (flags) out.push('Guests flag: ' + lines(flags).join('; '));
    if (said) out.push(lines(said).join(': ').replace(/\s+/g, ' '));
    return out;
  }
  /** build one market's dataset (same shape as the older London / Iraq reviews) from the combined deck */
  function parseWeekly(slides, market, wi, issues, fileName) {
    const iraq = /iraq/i.test(market); const sym = iraq ? '' : '£'; const cur = wi.cur, prev = wi.prev;
    const mine = slides.filter((s) => marketOfSlide(s) === market); const detail = mine.filter((s) => items(s, 'chart').length || items(s, 'table').length || /google|reviews/i.test(s.title || ''));
    const charts = detail.flatMap((s) => items(s, 'chart').map((c) => ({ s, c }))); const pick = (re) => (charts.find((o) => re.test(o.c.title || '')) || {}).c;
    const cNet = pick(/net sales/i), cTr = pick(/transactions|bills/i), cApc = pick(/average per cheque|apc|average cheque/i);
    const sNet = seriesPair(cNet, wi), sTr = seriesPair(cTr, wi), sApc = seriesPair(cApc, wi);
    const kp = kpiBlocks(detail.filter((s) => items(s, 'chart').length)); const kfind = (re) => kp.find((k) => re.test(k.label));
    const kNet = kfind(/net sales/i), kTr = kfind(/transactions|bills/i), kApc = kfind(/average|apc/i);
    // store table (Iraq): the exact weekly totals
    let st = null; detail.forEach((s) => items(s, 'table').forEach((t) => { if (!st && /^store/i.test(String(t.rows[0][0]).trim())) st = t; }));
    const colOf = (re1, no) => st.rows[0].findIndex((h) => re1.test(String(h)) && new RegExp('w(?:eek)?\\s*' + no + '\\b', 'i').test(String(h)));
    let net, tr, apc, how = '';
    const totRow = st ? st.rows.slice(1).find((r) => /total/i.test(String(r[0]))) : null;
    if (st && totRow) {
      const g = (re1, no) => { const c = colOf(re1, no); return c >= 0 ? val(totRow[c]) : null; };
      net = { p: g(/^sales|^net/i, prev.no), c: g(/^sales|^net/i, cur.no) }; tr = { p: g(/^trans/i, prev.no), c: g(/^trans/i, cur.no) }; apc = { p: g(/^apc/i, prev.no), c: g(/^apc/i, cur.no) }; how = 'store table';
      if ([net.p, net.c, tr.p, tr.c, apc.p, apc.c].some((v) => v == null)) { st = null; how = ''; }
    }
    if (!how && sNet && sTr) {
      const dp = iraq ? 0 : 2; net = { p: +sum(sNet.prev).toFixed(dp), c: +sum(sNet.cur).toFixed(dp) }; tr = { p: sum(sTr.prev), c: sum(sTr.cur) };
      apc = { p: kApc && kApc.prevN != null ? kApc.prevN : r2(net.p / tr.p), c: kApc && kApc.n != null ? kApc.n : r2(net.c / tr.c) }; how = 'charts';
    }
    if (!how && kNet && kTr && kApc) { net = { p: kNet.prevN, c: kNet.n }; tr = { p: kTr.prevN, c: kTr.n }; apc = { p: kApc.prevN, c: kApc.n }; how = 'tiles'; issues.push(I('warn', `${market}: no weekday charts or store table were found, so the figures come from the rounded headline tiles.`)); }
    const D = { market, title: `${market} — Weekly Sales Review`, period: { start: cur.start, end: cur.end, no: cur.no }, prevPeriod: { start: prev.start, end: prev.end, no: prev.no }, weekNo: cur.no, metrics: [], blocks: [], callouts: [], focus: [], info: [], tiles: [], slides: [], source: 'deck', sources: [{ kind: 'deck', file: fileName || '' }] };
    if (!how || [net, tr, apc].some((o) => !o || o.p == null || o.c == null)) { issues.push(I('error', `${market}: the weekly figures (net sales, transactions, average per cheque) could not be read from the deck.`)); return D; }
    const mk = (name, p, c, dec, ex, plain) => { const sy = plain ? '' : sym; const ch = +(c - p).toFixed(dec); return { name, prev: p, curr: c, change: ch, pct: pctOf(ex ? ex.c : c, ex ? ex.p : p), raw: [sy + fmtN(p, dec), sy + fmtN(c, dec), `${ch < 0 ? '–' : '+'}${sy}${fmtN(Math.abs(ch), dec)}`] }; };
    if (iraq) { D.metrics = [mk('Net sales (SAR)', net.p, net.c, 0), mk('Transactions', tr.p, tr.c, 0), mk('APC (SAR)', apc.p, apc.c, 2, { p: net.p / tr.p, c: net.c / tr.c })]; }
    else { const dp = 0; D.metrics = [mk('Net sales (excl. VAT)', Math.round(net.p), Math.round(net.c), dp, { p: net.p, c: net.c }), mk('Bills', tr.p, tr.c, 0, null, true), mk('APC (excl. VAT)', apc.p, apc.c, 2, { p: net.p / tr.p, c: net.c / tr.c }), mk('Net sales per day (excl. VAT)', Math.round(net.p / 7), Math.round(net.c / 7), dp, { p: net.p, c: net.c })]; }
    // tiles (same four the older reviews showed)
    const arrow = (m) => (m.pct == null ? '' : `${m.pct < 0 ? '▼ –' : '▲ +'}${Math.abs(m.pct).toFixed(1)}% WoW`);
    const TL = iraq ? {} : { 'Net sales (excl. VAT)': 'Net sales (excl. VAT)', Bills: 'Bills (transactions)', 'APC (excl. VAT)': 'APC (excl. VAT)', 'Net sales per day (excl. VAT)': 'Net sales per day' };
    D.tiles = D.metrics.map((m) => ({ label: TL[m.name] || m.name, value: m.raw[1], sub: [`Week ${prev.no}: ${m.raw[0]}`, arrow(m)].filter(Boolean) }));
    if (iraq && st) { const sr = st.rows.slice(1).find((r) => r[0] && !/total/i.test(String(r[0]))); if (sr) { const cc = colOf(/^sales|^net/i, cur.no), dc = st.rows[0].findIndex((h, i) => i > cc && /[Δ%]|vs/i.test(String(h))); const v = val(sr[cc]); if (v != null) D.tiles.splice(3, 1, { label: String(sr[0]).trim(), value: kfmt(v), sub: [`Week ${cur.no} net sales (SAR)`, dc >= 0 && sr[dc] ? `${/^-/.test(String(sr[dc]).trim()) ? '▼' : '▲'} ${String(sr[dc]).replace(/^[+\-–−]\s*/, '')}` : ''].filter(Boolean) }); } }
    // blocks: every table and chart of the market's slides, in deck order
    detail.forEach((s) => { items(s, 'table').forEach((t) => D.blocks.push({ slide: s.n, title: s.title, kind: 'table', rows: t.rows, src: 'deck' })); items(s, 'chart').forEach((c) => D.blocks.push({ slide: s.n, title: s.title, kind: 'chart', chart: c, src: 'deck' })); });
    D.slides = mine.map((s) => ({ n: s.n, title: s.title }));
    // written takeaways: per-store notes on the store slide, the market column of the "Key takeaways" slide
    if (iraq && st) { const sl = detail.find((s) => items(s, 'table').includes(st)); if (sl) items(sl, 'text').filter((t) => t.y > 0.55 && t.text.includes('\n')).sort((a, b) => a.x - b.x).forEach((t) => { const L = t.text.split('\n').map((x) => x.trim()).filter(Boolean); D.callouts.push({ slide: sl.n, kind: 'WHAT HAPPENED', title: L[0], text: L.slice(1).join(' ') }); }); }
    const ks = slides.find((s) => /takeaway|next steps/i.test(s.title || '')); if (ks) {
      const T = items(ks, 'text'); const heads = T.filter((t) => /^(iraq|london)$/i.test(t.text.trim())).sort((a, b) => a.x - b.x); const me = heads.find((h) => h.text.trim().toLowerCase() === market.toLowerCase());
      if (me) { const nx = heads.find((h) => h.x > me.x); const body = T.filter((t) => t.y > me.y && t.text.includes('\n') && t.x >= me.x - 0.05 && (!nx || t.x < nx.x - 0.05)).sort((a, b) => a.y - b.y)[0];
        if (body) { const L = body.text.split('\n').map((x) => x.trim()).filter(Boolean); L.forEach((x, i) => D.callouts.push({ slide: ks.n, kind: i === L.length - 1 && L.length > 1 ? 'AREA TO FOCUS' : 'WHAT HAPPENED', title: x, text: '' })); } else issues.push(I('warn', `${market}: the takeaways could not be read from slide ${ks.n}.`)); }
    } else issues.push(I('info', `${market}: no “Key takeaways” slide was found.`));
    // Google reviews
    mine.filter((s) => /google|reviews/i.test(s.title || '')).forEach((s) => D.info.push(...reviewInfo(s)));
    // ---------- checks ----------
    const ck = (what, a, b, tol) => { if (a != null && b != null && Math.abs(a - b) > tol) issues.push(I('warn', `${market}: ${what} — ${fmtN(a, 2)} vs ${fmtN(b, 2)}.`)); };
    if (how === 'store table') {
      if (sNet) { ck(`daily net sales chart (Week ${prev.no}) adds up to`, sum(sNet.prev), net.p, 12); ck(`daily net sales chart (Week ${cur.no}) adds up to`, sum(sNet.cur), net.c, 12); }
      if (sTr) { ck(`daily transactions chart (Week ${prev.no}) adds up to`, sum(sTr.prev), tr.p, 1); ck(`daily transactions chart (Week ${cur.no}) adds up to`, sum(sTr.cur), tr.c, 1); }
      const body = st.rows.slice(1).filter((r) => r !== totRow && r[0]);
      st.rows[0].forEach((h, c) => { if (c === 0 || /[Δ%]|apc/i.test(String(h))) return; const tv = val(totRow[c]); const vs = body.map((r) => val(r[c])); if (tv == null || vs.some((v) => v == null)) return; if (Math.abs(sum(vs) - tv) > Math.max(3, Math.abs(tv) * 0.0005)) issues.push(I('warn', `${market}: the stores add up to ${fmtN(sum(vs), 0)} in “${h}” but the total row says ${totRow[c]}.`)); });
    } else if (how === 'charts') {
      if (kNet) { ck(`net sales: the daily chart (Week ${cur.no}) adds up to`, net.c / 1000, kNet.n / 1000, 0.06); if (kNet.prevN != null) ck(`net sales: the daily chart (Week ${prev.no}) adds up to`, net.p / 1000, kNet.prevN / 1000, 0.06); }
      if (kTr) { ck(`transactions: the daily chart (Week ${cur.no}) adds up to`, tr.c, kTr.n, 1); if (kTr.prevN != null) ck(`transactions: the daily chart (Week ${prev.no}) adds up to`, tr.p, kTr.prevN, 1); }
      if (sApc && sNet && sTr) sApc.cur.forEach((a, i) => { const e = sTr.cur[i] ? sNet.cur[i] / sTr.cur[i] : null; if (e != null && Math.abs(e - a) > 0.02) issues.push(I('warn', `${market}: average per cheque on ${(sApc.cats || [])[i] || 'day ' + (i + 1)} is ${a} but net sales ÷ transactions = ${e.toFixed(2)}.`)); });
    }
    [[kNet, D.metrics[0]], [kTr, D.metrics[1]], [kApc, D.metrics[2]]].forEach(([k, m]) => { if (!k || !m) return; if (k.pct != null && m.pct != null && Math.abs(k.pct - m.pct) > 0.15) issues.push(I('warn', `${market}: the headline says ${m.name} changed ${sgn(k.pct)} but the figures give ${sgn(m.pct)}.`)); if (k.n != null && !/[KkMm]\s*$/.test(k.value) && how !== 'tiles' && Math.abs(k.n - m.curr) > 0.006 + Math.abs(m.curr) * 1e-4) issues.push(I('warn', `${market}: the headline shows ${k.value} for ${m.name} but the figures give ${m.raw[1]}.`)); if (k.n != null && /[KkMm]\s*$/.test(k.value) && Math.abs(k.n - m.curr) > k.n * 0.006) issues.push(I('warn', `${market}: the headline shows ${k.value} for ${m.name} but the figures give ${m.raw[1]}.`)); });
    const nm = D.metrics[0], tm = D.metrics[1], am = D.metrics[2]; ['prev', 'curr'].forEach((k) => { const e = nm[k] / tm[k]; if (Math.abs(e - am[k]) > Math.max(0.02, am[k] * 0.003)) issues.push(I('warn', `${market}: ${k === 'curr' ? 'Current' : 'Previous'} week: APC is ${am[k]} but net sales ÷ transactions = ${e.toFixed(2)}.`)); });
    if (daysBetween(cur.start, cur.end) !== 6) issues.push(I('warn', `The week is ${daysBetween(cur.start, cur.end) + 1} days (${cur.start} → ${cur.end}).`));
    if (daysBetween(prev.end, cur.start) !== 1) issues.push(I('warn', `The “previous week” (${prev.start} → ${prev.end}) does not directly precede the current week.`));
    if (dowOf(cur.start) !== 0) issues.push(I('info', `The week starts on a ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dowOf(cur.start)]}.`));
    if (!sNet) issues.push(I('warn', `${market}: the daily net sales chart was not found.`)); if (!sTr) issues.push(I('warn', `${market}: the daily transactions chart was not found.`));
    return D;
  }

  /* =====================================================================================
     2. the two raw workbooks
     ===================================================================================== */
  const toISO = (v) => {
    if (typeof v === 'number' && v > 30000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
    if (v instanceof Date && !isNaN(v)) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())).toISOString().slice(0, 10);
    if (typeof v === 'string') { let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v.trim()); if (m) return iso(+m[3], +m[1], +m[2]); m = /^(\d{4})-(\d\d)-(\d\d)/.exec(v.trim()); if (m) return v.trim().slice(0, 10); }
    return null;
  };
  const rowsOfSheet = (wb, name) => root.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });
  const nrow = (r) => (r || []).map((c) => norm(c == null ? '' : String(c)));
  const findHdr = (rows, test) => { for (let i = 0; i < Math.min(rows.length, 15); i++) { const n = nrow(rows[i]); if (test(n)) return i; } return -1; };
  const colIdx = (n, re) => n.findIndex((x) => re.test(x));
  const num = (v) => (typeof v === 'number' ? v : v == null || v === '' ? null : Number(String(v).replace(/,/g, '')) || (String(v).trim() === '0' ? 0 : null));
  const nameOnly = (s) => String(s || '').replace(/ /g, ' ').replace(/\s*\/?\s*[؀-ۿ].*$/, '').replace(/\s+/g, ' ').trim();

  function detectExcel(wb) {
    for (const name of wb.SheetNames) { const rows = rowsOfSheet(wb, name);
      let hi = findHdr(rows, (n) => n.some((x) => /^accountingday/.test(x)) && n.some((x) => /^transactions/.test(x)) && n.some((x) => /^netsales/.test(x)));
      if (hi >= 0) return { market: 'London', sheet: name, rows, hi };
      hi = findHdr(rows, (n) => /^store/.test(n[0] || '') && n.some((x) => /^accountingday/.test(x)) && n.some((x) => /^netsales.*iqd/.test(x)));
      if (hi >= 0) return { market: 'Iraq', sheet: name, rows, hi }; }
    return null;
  }
  const sheetBy = (wb, test) => { for (const name of wb.SheetNames) { const rows = rowsOfSheet(wb, name); const hi = findHdr(rows, test); if (hi >= 0) return { name, rows, hi }; } return null; };
  const wkLab = (a, b) => `${+a.slice(8, 10)}${a.slice(5, 7) === b.slice(5, 7) ? '' : ' ' + MONN[+a.slice(5, 7) - 1]}–${+b.slice(8, 10)} ${MONN[+b.slice(5, 7) - 1]}`;

  /** shared: figures per day -> two weeks -> metrics, tiles, weekday charts, text highlights */
  function buildMarket(market, days, W, extra, issues) {
    const iraq = market === 'Iraq'; const sym = iraq ? '' : '£'; const cur = W.cur, prev = W.prev; const dp = iraq ? 0 : 2;
    const wk = (w) => days.filter((d) => d.date >= w.start && d.date <= w.end).sort((a, b) => (a.date < b.date ? -1 : 1));
    const dc = wk(cur), dpv = wk(prev); const cats = dc.map((d) => DOW[dowOf(d.date)]);
    const tot = (a) => ({ net: sum(a, (d) => d.net), tr: sum(a, (d) => d.tr) });
    const T1 = tot(dpv), T2 = tot(dc);
    const D = { market, title: `${market} — Weekly Sales Review`, period: { start: cur.start, end: cur.end, no: 2 }, prevPeriod: { start: prev.start, end: prev.end, no: 1 }, weekNo: 2, metrics: [], blocks: [], callouts: [], focus: [], info: [], tiles: [], slides: [], source: 'excel', sources: [] };
    const mk = (name, p, c, dec, ex, plain) => { const sy = plain ? '' : sym; const ch = +(c - p).toFixed(dec); return { name, prev: p, curr: c, change: ch, pct: pctOf(ex ? ex.c : c, ex ? ex.p : p), raw: [sy + fmtN(p, dec), sy + fmtN(c, dec), `${ch < 0 ? '–' : '+'}${sy}${fmtN(Math.abs(ch), dec)}`] }; };
    const apc1 = T1.net / T1.tr, apc2 = T2.net / T2.tr;
    if (iraq) D.metrics = [mk('Net sales (SAR)', Math.round(T1.net), Math.round(T2.net), 0), mk('Transactions', T1.tr, T2.tr, 0), mk('APC (SAR)', r2(apc1), r2(apc2), 2, { p: apc1, c: apc2 })];
    else D.metrics = [mk('Net sales (excl. VAT)', Math.round(T1.net), Math.round(T2.net), 0, { p: T1.net, c: T2.net }), mk('Bills', T1.tr, T2.tr, 0, null, true), mk('APC (excl. VAT)', r2(apc1), r2(apc2), 2, { p: apc1, c: apc2 }), mk('Net sales per day (excl. VAT)', Math.round(T1.net / 7), Math.round(T2.net / 7), 0, { p: T1.net, c: T2.net })];
    const arrow = (m) => (m.pct == null ? '' : `${m.pct < 0 ? '▼ –' : '▲ +'}${Math.abs(m.pct).toFixed(1)}% WoW`);
    const TL = { 'Net sales (excl. VAT)': 'Net sales (excl. VAT)', Bills: 'Bills (transactions)', 'APC (excl. VAT)': 'APC (excl. VAT)', 'Net sales per day (excl. VAT)': 'Net sales per day' };
    D.tiles = D.metrics.map((m) => ({ label: TL[m.name] || m.name, value: m.raw[1], sub: [`Week 1: ${m.raw[0]}`, arrow(m)].filter(Boolean) }));
    if (iraq && extra.stores && extra.stores.length) { const s0 = extra.stores[0]; D.tiles.splice(3, 1, { label: s0.store, value: kfmt(s0.net2), sub: ['Week 2 net sales (SAR)', s0.d1 == null ? '' : `${s0.d1 < 0 ? '▼' : '▲'} ${Math.abs(s0.d1).toFixed(1)}%`].filter(Boolean) }); }
    const lbl1 = `Week 1 (${wkLab(prev.start, prev.end)})`, lbl2 = `Week 2 (${wkLab(cur.start, cur.end)})`;
    const cn = iraq ? 'SAR' : 'GBP'; const m0 = D.metrics[0], m1 = D.metrics[1];
    const cNet = CH(`Daily net sales by weekday (${cn})`, 'bar', 'col', cats, [{ name: lbl1, values: dpv.map((d) => (iraq ? Math.round(d.net) : r2(d.net))) }, { name: lbl2, values: dc.map((d) => (iraq ? Math.round(d.net) : r2(d.net))) }]);
    const cTr = CH('Transactions by weekday', 'bar', 'col', cats, [{ name: 'Week 1', values: dpv.map((d) => d.tr) }, { name: 'Week 2', values: dc.map((d) => d.tr) }]);
    const cApc = CH(`Average per cheque by weekday (${cn})`, 'line', '', cats, [{ name: 'Week 1', values: dpv.map((d) => r2(d.net / d.tr)) }, { name: 'Week 2', values: dc.map((d) => r2(d.net / d.tr)) }]);
    const money = (v) => (iraq ? 'SAR ' : '£') + kfmt(v, 1);
    D.blocks.push({ slide: 1, title: `${market}: net sales ${word(m0.pct)} ${Math.abs(m0.pct).toFixed(1)}% to ${money(m0.curr)}`, kind: 'chart', chart: cNet, src: 'excel' });
    const tt = `${market}: transactions ${word(m1.pct)} ${Math.abs(m1.pct).toFixed(1)}% to ${fmtN(m1.curr)}; average per cheque ${word(D.metrics[2].pct)} ${Math.abs(D.metrics[2].pct).toFixed(1)}%`;
    D.blocks.push({ slide: 2, title: tt, kind: 'chart', chart: cTr, src: 'excel' }, { slide: 2, title: tt, kind: 'chart', chart: cApc, src: 'excel' });
    if (iraq && extra.stores) {
      const rows = [['Store', 'Sales W1 (SAR)', 'Sales W2 (SAR)', 'Δ', 'Trans. W1', 'Trans. W2', 'Δ', 'APC W1', 'APC W2', 'Δ']];
      const row = (n, s) => [n, fmtN(s.net1, 0), fmtN(s.net2, 0), sgn(pctOf(s.net2, s.net1) || 0), fmtN(s.tr1, 0), fmtN(s.tr2, 0), sgn(pctOf(s.tr2, s.tr1) || 0), fmtN(s.net1 / s.tr1, 2), fmtN(s.net2 / s.tr2, 2), sgn(pctOf(s.net2 / s.tr2, s.net1 / s.tr1) || 0)];
      extra.stores.forEach((s) => rows.push(row(s.store, s))); rows.push(row('Iraq total', { net1: T1.net, net2: T2.net, tr1: T1.tr, tr2: T2.tr }));
      D.blocks.push({ slide: 3, title: `Iraq by store: Week 2 vs Week 1`, kind: 'table', rows, src: 'excel' });
    } else {
      const rows = [['Day', 'Net W1 (£)', 'Net W2 (£)', 'Δ', 'Trans. W1', 'Trans. W2', 'Δ', 'APC W1', 'APC W2']];
      dc.forEach((d, i) => { const p = dpv[i]; if (!p) return; rows.push([`${DOW[dowOf(d.date)]} ${dmon(d.date)}`, fmtN(p.net, 2), fmtN(d.net, 2), sgn(pctOf(d.net, p.net) || 0), fmtN(p.tr), fmtN(d.tr), sgn(pctOf(d.tr, p.tr) || 0), fmtN(p.net / p.tr, 2), fmtN(d.net / d.tr, 2)]); });
      rows.push(['Week total', fmtN(T1.net, 2), fmtN(T2.net, 2), sgn(m0.pct), fmtN(T1.tr), fmtN(T2.tr), sgn(m1.pct), fmtN(apc1, 2), fmtN(apc2, 2)]);
      D.blocks.push({ slide: 3, title: 'London: Week 2 vs Week 1 by day', kind: 'table', rows, src: 'excel' });
    }
    // facts calculated from the figures (the written takeaways come from the weekly deck)
    const best = dc.slice().sort((a, b) => b.net - a.net)[0], worst = dc.slice().sort((a, b) => a.net - b.net)[0]; const mny = (v) => (iraq ? 'SAR ' : '£') + fmtN(v, 0);
    D.callouts.push({ slide: 1, kind: 'WHAT HAPPENED', title: `Net sales ${word(m0.pct)} ${Math.abs(m0.pct).toFixed(1)}% to ${mny(m0.curr)}; transactions ${word(m1.pct)} ${Math.abs(m1.pct).toFixed(1)}% and average per cheque ${word(D.metrics[2].pct)} ${Math.abs(D.metrics[2].pct).toFixed(1)}%.`, text: '' });
    if (best && worst) D.callouts.push({ slide: 1, kind: 'WHAT HAPPENED', title: `Best day: ${DOW[dowOf(best.date)]} ${dmon(best.date)} (${mny(best.net)}); weakest: ${DOW[dowOf(worst.date)]} ${dmon(worst.date)} (${mny(worst.net)}).`, text: '' });
    D.callouts.push({ slide: 1, kind: 'WHAT HAPPENED', title: 'Day by day vs Week 1 (net sales): ' + dc.map((d, i) => (dpv[i] ? `${DOW[dowOf(d.date)]} ${sgn(pctOf(d.net, dpv[i].net) || 0)}` : null)).filter(Boolean).join(', ') + '.', text: '' });
    if (iraq && extra.stores) D.callouts.push({ slide: 1, kind: 'WHAT HAPPENED', title: 'By store (net sales vs Week 1): ' + extra.stores.map((s) => `${s.store} ${sgn(s.d1 || 0)}`).join(', ') + '.', text: '' });
    return { D, T1, T2, dc, dpv };
  }
  /** weeks from the dates in the file: the last 14 days = Week 1 and Week 2 */
  function weeksOf(dates, issues) {
    const u = [...new Set(dates)].sort(); if (!u.length) { issues.push(I('error', 'No dated rows were found.')); return null; }
    const end = u[u.length - 1]; const need = []; for (let i = 13; i >= 0; i--) need.push(addDays(end, -i)); const miss = need.filter((d) => !u.includes(d));
    if (u.filter((d) => d >= need[0]).length < 14) { issues.push(I('error', `The workbook needs two full weeks (14 days) so this week can be compared with last week, but it ends ${end} and only ${u.filter((d) => d >= need[0]).length} of the last 14 days are in it${miss.length ? ' (missing ' + miss.slice(0, 4).join(', ') + (miss.length > 4 ? '…' : '') + ')' : ''}.`)); return null; }
    if (u[0] < need[0]) issues.push(I('info', `The workbook starts ${u[0]}; only the last 14 days (${need[0]} → ${end}) are used.`));
    const W = { prev: { start: need[0], end: need[6] }, cur: { start: need[7], end: need[13] } };
    if (dowOf(W.cur.start) !== 0) issues.push(I('info', `The week starts on a ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dowOf(W.cur.start)]}.`)); return W;
  }
  const periodCheck = (rows, W, issues) => { const t = rows.slice(0, 6).map((r) => (r || []).join(' ')).join(' ').match(/from\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+to\s+(\d{1,2}\/\d{1,2}\/\d{4})/i); if (t) { const a = toISO(t[1]), b = toISO(t[2]); if (b && b !== W.cur.end) issues.push(I('warn', `The workbook header says the period ends ${b}, but the last day with sales is ${W.cur.end}.`)); } };

  function parseLondonExcel(wb, det, fileName, issues) {
    const H = nrow(det.rows[det.hi]); const c = { day: colIdx(H, /^accountingday/), net: colIdx(H, /^netsales/), tr: colIdx(H, /^transactions/), gross: colIdx(H, /grosssalesafterdiscount/), vat: colIdx(H, /^vat/) };
    const days = []; let grand = null;
    det.rows.slice(det.hi + 1).forEach((r) => { if (!r) return; if (/grand\s*total/i.test(String(r[0] || ''))) { grand = { net: num(r[c.net]), tr: num(r[c.tr]), gross: c.gross >= 0 ? num(r[c.gross]) : null }; return; } const d = toISO(r[c.day]); if (d && num(r[c.net]) != null) days.push({ date: d, net: num(r[c.net]), tr: num(r[c.tr]) || 0, gross: c.gross >= 0 ? num(r[c.gross]) || 0 : 0, vat: c.vat >= 0 ? num(r[c.vat]) || 0 : 0 }); });
    const W = weeksOf(days.map((d) => d.date), issues); if (!W) return null; periodCheck(det.rows, W, issues);
    if (new Set(days.map((d) => d.date)).size !== days.length) issues.push(I('warn', 'Some dates appear more than once in the daily sheet.'));
    if (grand) { const t = { net: sum(days, (d) => d.net), tr: sum(days, (d) => d.tr) }; if (grand.net != null && Math.abs(t.net - grand.net) > Math.max(1, grand.net * 0.0005)) issues.push(I('warn', `The days add up to £${fmtN(t.net, 2)} net sales but the Grand Total row says £${fmtN(grand.net, 2)}.`)); if (grand.tr != null && Math.abs(t.tr - grand.tr) > 1) issues.push(I('warn', `The days add up to ${fmtN(t.tr)} transactions but the Grand Total row says ${fmtN(grand.tr)}.`)); }
    days.forEach((d) => { if (d.gross && d.vat && Math.abs(d.gross - d.vat - d.net) > 1.5) issues.push(I('warn', `${d.date}: gross after discount − VAT = ${fmtN(d.gross - d.vat, 2)} but net sales is ${fmtN(d.net, 2)}.`)); });
    const { D, T1, T2 } = buildMarket('London', days, W, {}, issues);
    const wkOf = (d) => (d >= W.cur.start ? 2 : d >= W.prev.start ? 1 : 0);
    // hourly
    const hs = sheetBy(wb, (n) => n.some((x) => /^closinghour/.test(x)) && n.some((x) => /^accountingday/.test(x)));
    if (hs) { const HH = nrow(hs.rows[hs.hi]); const ci = { day: colIdx(HH, /^accountingday/), hour: colIdx(HH, /^closinghour/), sales: colIdx(HH, /grosssalesafterdiscount/), bills: colIdx(HH, /^bills/) };
      const agg = { 1: {}, 2: {} }; const dayTot = {}; let dcur = null;
      hs.rows.slice(hs.hi + 1).forEach((r) => { if (!r) return; const d = toISO(r[ci.day]); if (d) dcur = d; if (r[ci.hour] == null || !/^\d{1,2}$/.test(String(r[ci.hour]).trim()) || !dcur) return; const w = wkOf(dcur); if (!w) return; const h = String(r[ci.hour]).trim().padStart(2, '0'); const sv = num(r[ci.sales]) || 0, bv = ci.bills >= 0 ? num(r[ci.bills]) || 0 : 0; const a = (agg[w][h] = agg[w][h] || { s: 0, b: 0 }); a.s += sv; a.b += bv; dayTot[dcur] = (dayTot[dcur] || 0) + sv; });
      const bad = days.filter((d) => wkOf(d.date) && d.gross && dayTot[d.date] != null && Math.abs(dayTot[d.date] - d.gross) > 1.5); if (bad.length) issues.push(I('warn', `Hourly sales do not add up to the daily gross sales on ${bad.slice(0, 3).map((d) => d.date).join(', ')}${bad.length > 3 ? '…' : ''}.`));
      const hrs = [...new Set([...Object.keys(agg[1]), ...Object.keys(agg[2])])].sort();
      if (hrs.length) { D.blocks.push({ slide: 4, title: 'London: sales by hour, Week 2 vs Week 1 (gross after discount, incl. VAT)', kind: 'chart', chart: CH('Sales by hour, Week 2 vs Week 1 (£, incl. VAT)', 'bar', 'col', hrs.map((h) => h + ':00'), [{ name: 'Week 1', values: hrs.map((h) => r2((agg[1][h] || { s: 0 }).s)) }, { name: 'Week 2', values: hrs.map((h) => r2((agg[2][h] || { s: 0 }).s)) }]), src: 'excel' });
        const t2 = sum(hrs, (h) => (agg[2][h] || { s: 0 }).s); const peak = hrs.slice().sort((a, b) => ((agg[2][b] || { s: 0 }).s) - ((agg[2][a] || { s: 0 }).s))[0]; const lateS = sum(hrs.filter((h) => +h >= 17 && +h < 22), (h) => (agg[2][h] || { s: 0 }).s);
        if (t2 > 0) D.callouts.push({ slide: 4, kind: 'WHAT HAPPENED', title: `Busiest hour in Week 2: ${peak}:00 (£${fmtN((agg[2][peak] || { s: 0 }).s, 0)} gross); 17:00–22:00 brought ${((lateS / t2) * 100).toFixed(0)}% of the week's sales.`, text: '' }); }
    } else issues.push(I('info', 'No “Revenue per hour” sheet found: the hourly chart is skipped.'));
    // categories
    const cs = sheetBy(wb, (n) => /^itemcategory/.test(n[0] || '') && n.some((x) => /^numberofguests/.test(x)) && !n.some((x) => /^item$/.test(x)));
    if (cs) { const CC = nrow(cs.rows[cs.hi]); const ci = { cat: 0, g: colIdx(CC, /^numberofguests/), s: colIdx(CC, /grosssalesafterdiscount/), b: colIdx(CC, /^bills/) }; const cats = []; let grandC = null;
      cs.rows.slice(cs.hi + 1).forEach((r) => { if (!r || r[0] == null) return; if (/grand\s*total/i.test(String(r[0]))) { grandC = num(r[ci.s]); return; } if (/total$/i.test(String(r[0]).trim())) return; cats.push({ cat: String(r[0]).trim(), g: num(r[ci.g]) || 0, s: num(r[ci.s]) || 0, b: num(r[ci.b]) || 0 }); });
      const T = sum(cats, (x) => x.s); if (grandC != null && Math.abs(T - grandC) > 1) issues.push(I('warn', `Categories add up to £${fmtN(T, 2)} but the Grand Total row says £${fmtN(grandC, 2)}.`));
      const allS = sum(days.filter((d) => wkOf(d.date)), (d) => d.gross); if (allS && Math.abs(T - allS) > Math.max(2, allS * 0.001)) issues.push(I('warn', `Category sales (£${fmtN(T, 2)}) differ from the daily gross sales after discount (£${fmtN(allS, 2)}).`));
      cats.sort((a, b) => b.s - a.s); const rows = [['#', 'Category', 'Sales (£)', 'Share', 'Guests', 'Sales / guest']]; cats.forEach((x, i) => rows.push([String(i + 1), x.cat, fmtN(x.s, 0), ((x.s / T) * 100).toFixed(1) + '%', fmtN(x.g), x.g ? fmtN(x.s / x.g, 2) : '–']));
      const lab = `${dmon(W.prev.start)} – ${dmon(W.cur.end)}`;
      D.blocks.push({ slide: 5, title: `London: sales by item category, ${lab} (after discount, incl. VAT; both weeks together)`, kind: 'table', rows, src: 'excel' }, { slide: 5, title: `London: sales by item category, ${lab} (after discount, incl. VAT; both weeks together)`, kind: 'chart', chart: CH('Sales by item category (£, incl. VAT)', 'bar', 'bar', cats.slice(0, 8).map((x) => x.cat), [{ name: 'Sales (£)', values: cats.slice(0, 8).map((x) => r2(x.s)) }]), src: 'excel' });
    } else issues.push(I('info', 'No “Category Wise sales” sheet found: the category table is skipped.'));
    // items
    const is = sheetBy(wb, (n) => /^itemcategory/.test(n[0] || '') && n.some((x) => /^item$/.test(x)) && n.some((x) => /^itemsize$/.test(x)));
    if (is) { const II = nrow(is.rows[is.hi]); const ci = { cat: 0, item: colIdx(II, /^item$/), size: colIdx(II, /^itemsize$/), q: colIdx(II, /^numberofguests/), s: colIdx(II, /grosssalesafterdiscount/) }; let cat = ''; let grandI = null;
      const agg = new Map(); let curName = ''; const scale = colIdx(II, /^itemsizesscale|^sizesscale|^itemsizescale/);
      is.rows.slice(is.hi + 1).forEach((r) => { if (!r) return; if (/grand\s*total/i.test(String(r[0] || ''))) { grandI = num(r[ci.s]); return; } if (r[0] != null) { const t = String(r[0]).trim(); if (/total$/i.test(t)) return; cat = t; }
        const it = r[ci.item] == null ? '' : String(r[ci.item]).replace(/\u00a0/g, ' ').trim(); if (it && / total$/i.test(it)) return; if (scale >= 0 && /^\s*total\s*$/i.test(String(r[scale] || ''))) return; if (it) curName = it; if (!curName) return;
        const sv = num(r[ci.s]); if (sv == null) return; const k = cat + '|' + curName; const o = agg.get(k) || { name: curName, cat, q: 0, s: 0 }; o.q += num(r[ci.q]) || 0; o.s += sv; agg.set(k, o); });
      const out = [...agg.values()];
      const T = sum(out, (x) => x.s); if (grandI != null && Math.abs(T - grandI) > Math.max(1, grandI * 0.0005)) issues.push(I('warn', `Items add up to £${fmtN(T, 2)} but the Grand Total row says £${fmtN(grandI, 2)}.`));
      out.sort((a, b) => b.s - a.s); const top = out.slice(0, 10); const rows = [['#', 'Item', 'Units', 'Sales (£)', 'Share']]; top.forEach((x, i) => rows.push([String(i + 1), x.name, fmtN(x.q), fmtN(x.s, 0), ((x.s / T) * 100).toFixed(1) + '%'])); rows.push(['', 'Top 10 total', fmtN(sum(top, (x) => x.q)), fmtN(sum(top, (x) => x.s), 0), ((sum(top, (x) => x.s) / T) * 100).toFixed(1) + '%']);
      D.blocks.push({ slide: 6, title: `London: top 10 items, ${dmon(W.prev.start)} – ${dmon(W.cur.end)} (after discount, incl. VAT; both weeks together)`, kind: 'table', rows, src: 'excel' });
    } else issues.push(I('info', 'No “Itemwise sales” sheet found: the top-items table is skipped.'));
    D.slides = wb.SheetNames.map((n, i) => ({ n: i + 1, title: n })); D.sources = [{ kind: 'excel', file: fileName }];
    issues.push(I('info', `Read from the workbook: ${days.length} days (${W.prev.start} → ${W.cur.end}). Week 1 = ${W.prev.start} → ${W.prev.end}, Week 2 = ${W.cur.start} → ${W.cur.end}. The highlights are calculated from the figures; upload the weekly deck to add its written takeaways and Google reviews.`));
    return { D, W };
  }

  function parseIraqExcel(wb, det, fileName, issues) {
    const H = nrow(det.rows[det.hi]); const c = { store: 0, day: colIdx(H, /^accountingday/), net: colIdx(H, /^netsales.*iqd/), bills: colIdx(H, /^bills/) };
    const rowsD = []; let store = null; let grand = null;
    det.rows.slice(det.hi + 1).forEach((r) => { if (!r) return; const a = r[0] == null ? '' : String(r[0]).trim(); if (/grand\s*total/i.test(a)) { grand = { iqd: num(r[c.net]), bills: num(r[c.bills]) }; return; } if (a && /total$/i.test(a)) return; if (a) store = a; const d = toISO(r[c.day]); if (d && store && num(r[c.net]) != null) rowsD.push({ store, date: d, iqd: num(r[c.net]), bills: num(r[c.bills]) || 0 }); });
    // IQD -> SAR: use the SAR column of the item sheet when there is one
    const it = sheetBy(wb, (n) => n.some((x) => /^item$/.test(x)) && n.some((x) => /^sar$/.test(x)) && n.some((x) => /^accountingday/.test(x)));
    let rate = 404, rateNote = 'IQD → SAR at 404 (no SAR column was found in the workbook, so the usual rate is used).';
    if (it) { const II = nrow(it.rows[it.hi]); const ni = colIdx(II, /^netsales.*iqd/), si = colIdx(II, /^sar$/); const rs = []; it.rows.slice(it.hi + 1).forEach((r) => { if (!r) return; const a = num(r[ni]), b = num(r[si]); if (a > 0 && b > 0) rs.push(a / b); }); if (rs.length) { rs.sort((x, y) => x - y); rate = +rs[Math.floor(rs.length / 2)].toFixed(4); const mn = rs[0], mx = rs[rs.length - 1]; rateNote = `IQD → SAR at ${rate} (from the SAR column of the item sheet).`; if ((mx - mn) / mn > 0.005) issues.push(I('warn', `IQD per SAR is not constant in the item sheet (${mn.toFixed(1)} to ${mx.toFixed(1)}).`)); } }
    const W = weeksOf(rowsD.map((d) => d.date), issues); if (!W) return null; periodCheck(det.rows, W, issues);
    const byDay = {}; rowsD.forEach((r) => { const d = (byDay[r.date] = byDay[r.date] || { date: r.date, net: 0, tr: 0 }); d.net += r.iqd / rate; d.tr += r.bills; });
    const days = Object.values(byDay);
    if (grand) { const t = { iqd: sum(rowsD, (d) => d.iqd), bills: sum(rowsD, (d) => d.bills) }; if (grand.iqd != null && Math.abs(t.iqd - grand.iqd) > Math.max(1, grand.iqd * 0.0005)) issues.push(I('warn', `The stores add up to IQD ${fmtN(t.iqd)} but the Grand Total row says IQD ${fmtN(grand.iqd)}.`)); if (grand.bills != null && Math.abs(t.bills - grand.bills) > 1) issues.push(I('warn', `The stores add up to ${fmtN(t.bills)} bills but the Grand Total row says ${fmtN(grand.bills)}.`)); }
    const inW = (d, w) => d >= w.start && d <= w.end; const names = [...new Set(rowsD.map((r) => r.store))];
    const stores = names.map((s) => { const a = rowsD.filter((r) => r.store === s); const f = (w, k) => sum(a.filter((r) => inW(r.date, w)), (r) => (k === 'net' ? r.iqd / rate : r.bills)); const o = { store: s, net1: f(W.prev, 'net'), net2: f(W.cur, 'net'), tr1: f(W.prev, 'tr'), tr2: f(W.cur, 'tr') }; o.d1 = o.net1 ? pctOf(o.net2, o.net1) : null; return o; }).filter((s) => s.net1 || s.net2);
    const { D } = buildMarket('Iraq', days, W, { stores }, issues); D.fx = rate;
    // items
    if (it) { const II = nrow(it.rows[it.hi]); const ci = { day: colIdx(II, /^accountingday/), store: colIdx(II, /^store$/), item: colIdx(II, /^item$/), code: colIdx(II, /^itemcode/), q: colIdx(II, /^numberof.*items?$/), iqd: colIdx(II, /^netsales.*iqd/) };
      const agg = {}; let dcur = null, scur = null; let totIqd = 0; let grandI = null;
      it.rows.slice(it.hi + 1).forEach((r) => { if (!r) return; const a0 = r[0] == null ? '' : String(r[0]).trim(); if (/grand\s*total/i.test(a0)) { grandI = num(r[ci.iqd]); return; } if (a0 && /total$/i.test(a0)) return; const d = toISO(r[ci.day]); if (d) dcur = d; if (r[ci.store] != null && !/total$/i.test(String(r[ci.store]))) scur = String(r[ci.store]).trim(); if (r[ci.item] == null || !dcur) return; if (dcur < W.prev.start || dcur > W.cur.end) return;
        const nm = nameOnly(r[ci.item]); const key = String(r[ci.code] != null ? r[ci.code] : nm); const o = (agg[key] = agg[key] || { name: nm, q: 0, iqd: 0 }); o.q += num(r[ci.q]) || 0; o.iqd += num(r[ci.iqd]) || 0; totIqd += num(r[ci.iqd]) || 0; });
      const T = sum(days.filter((d) => d.date >= W.prev.start), (d) => d.net); if (Math.abs(totIqd / rate - T) > Math.max(2, T * 0.0005)) issues.push(I('warn', `Item sales (SAR ${fmtN(totIqd / rate, 0)}) differ from the daily sales (SAR ${fmtN(T, 0)}).`));
      if (grandI != null && Math.abs(totIqd - grandI) > Math.max(1, grandI * 0.0005)) issues.push(I('warn', `Items add up to IQD ${fmtN(totIqd)} but the Grand Total row says IQD ${fmtN(grandI)}.`));
      const all = Object.values(agg).sort((a, b) => b.iqd - a.iqd).slice(0, 10); let cum = 0; const rows = [['#', 'Item', 'Sales SAR', 'Qty', 'Contrib.', 'Cum.']];
      all.forEach((x, i) => { const sar = x.iqd / rate; cum += sar; rows.push([String(i + 1), x.name, fmtN(sar, 0), fmtN(x.q), ((sar / T) * 100).toFixed(1) + '%', ((cum / T) * 100).toFixed(1) + '%']); });
      D.blocks.push({ slide: 4, title: `Iraq: top 10 items, ${dmon(W.prev.start)} – ${dmon(W.cur.end)} (all stores, both weeks together)`, kind: 'table', rows, src: 'excel' });
    } else issues.push(I('info', 'No “Item wise sales” sheet found: the top-items table is skipped.'));
    D.slides = wb.SheetNames.map((n, i) => ({ n: i + 1, title: n })); D.sources = [{ kind: 'excel', file: fileName }];
    issues.push(I('info', `Read from the workbook: ${rowsD.length} store-days (${W.prev.start} → ${W.cur.end}). ${rateNote} Week 1 = ${W.prev.start} → ${W.prev.end}, Week 2 = ${W.cur.start} → ${W.cur.end}. The highlights are calculated from the figures; upload the weekly deck to add its written takeaways and Google reviews.`));
    return { D, W };
  }

  /* =====================================================================================
     3. combining the deck and the workbook of the same week
     ===================================================================================== */
  const kindOf = (d) => (d && d.source === 'excel' ? 'excel' : 'deck');
  const partsOf = (d) => (d.source === 'deck+excel' ? { deck: d.srcDeck || null, excel: d.srcExcel || null } : kindOf(d) === 'excel' ? { deck: null, excel: d } : { deck: d, excel: null });
  const blockKey = (b) => (b.kind === 'chart' ? 'c|' + norm((b.chart && b.chart.title) || b.title) : 't|' + norm((b.rows[0] || []).join('|')));
  function mergeParts(deck, xl, issues, label) {
    const out = { ...deck }; delete out.srcDeck; delete out.srcExcel;
    // the figures: the deck's, unless the workbook disagrees
    let differ = false; (xl.metrics || []).forEach((m) => { const dm = (deck.metrics || []).find((x) => norm(x.name) === norm(m.name)); if (!dm) return; ['prev', 'curr'].forEach((k) => { if (dm[k] != null && m[k] != null && Math.abs(dm[k] - m[k]) > Math.max(1.5, Math.abs(m[k]) * 0.002)) { differ = true; issues.push(I('warn', `${label}: the deck and the workbook disagree on ${m.name} (${k === 'curr' ? 'this' : 'last'} week): deck ${dm.raw[k === 'curr' ? 1 : 0]}, workbook ${m.raw[k === 'curr' ? 1 : 0]}. The workbook figures are used.`)); } }); });
    if (differ) { out.metrics = xl.metrics; out.tiles = xl.tiles; }
    if (deck.period && xl.period && (deck.period.end !== xl.period.end || deck.period.start !== xl.period.start)) issues.push(I('warn', `${label}: the deck covers ${deck.period.start} → ${deck.period.end} but the workbook covers ${xl.period.start} → ${xl.period.end}.`));
    if (!(out.callouts || []).length) out.callouts = xl.callouts || []; if (!(out.focus || []).length) out.focus = xl.focus || []; if (!(out.info || []).length) out.info = xl.info || []; if (!(out.tiles || []).length) out.tiles = xl.tiles || [];
    const keys = new Set((deck.blocks || []).map(blockKey)); out.blocks = [...(deck.blocks || []), ...(xl.blocks || []).filter((b) => !keys.has(blockKey(b)))];
    out.source = 'deck+excel'; out.sources = [...(deck.sources || [{ kind: 'deck', file: '' }]), ...(xl.sources || [])].filter((s, i, a) => a.findIndex((t) => t.kind === s.kind && t.file === s.file) === i); out.srcDeck = deck; out.srcExcel = xl; return out;
  }
  /** called with the freshly read dataset: if the other source for the same market and week is already stored, combine them */
  function reconcile(type, ds, existing, issues) {
    if (!ds || !ds.data || !(type === 'london' || type === 'iraq')) return;
    const e = (existing || []).filter((x) => x.type === type && x.end === ds.end && x.data).sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1))[0]; const mine = kindOf(ds.data); const p = e ? partsOf(e.data) : { deck: null, excel: null };
    p[mine] = ds.data; if (!(p.deck && p.excel)) return;
    const label = type === 'iraq' ? 'Iraq' : 'London'; const other = mine === 'deck' ? 'workbook' : 'weekly deck';
    ds.data = mergeParts(p.deck, p.excel, issues, label); for (let i = issues.length - 1; i >= 0; i--) if (/already exists\. Approving replaces it/.test(issues[i].msg)) issues.splice(i, 1);
    issues.push(I('info', `${label}: combined with the ${other} already uploaded for this week — the deck's written takeaways and Google reviews are kept, and the tables and charts that only the workbook has are added.`));
  }

  async function analyzeExcel(buf, name, ov, template, existing, hash, others) {
    ov = ov || {}; existing = existing || []; const issues = [];
    let wb; try { wb = root.XLSX.read(buf, { type: 'array', cellDates: false }); } catch (e) { return { type: null, ds: null, issues: [I('error', `“${name}” could not be opened as an Excel file (${e.message}).`)] }; }
    const det = detectExcel(wb);
    if (!det) return { type: null, ds: null, issues: [I('error', `“${name}” was not recognised. Expected the London workbook (sheet “Revenue by day” with Accounting day / Transactions / Net Sales) or the Iraq workbook (sheet “A-Daily Sales Report” with Store / Accounting day / Net Sales IQD).`)] };
    const r = det.market === 'London' ? parseLondonExcel(wb, det, name, issues) : parseIraqExcel(wb, det, name, issues);
    if (!r) return { type: det.market.toLowerCase(), ds: null, issues };
    const type = det.market.toLowerCase(); const D = r.D; const ds = { type, start: D.period.start, end: D.period.end, data: D };
    if (ov.asOf && ov.asOf.date) { /* the weeks come from the dates in the file; nothing to override */ }
    X.history(type, ds, D, existing, hash, issues);
    reconcile(type, ds, existing, issues);
    return { type, ds, issues };
  }

  /* =====================================================================================
     4. "HM Weekly Event Report" PDF: Sales Overview / Sales Mix & Top Products / Events & Operations
     ===================================================================================== */
  const flat = (pages, i) => (pages && pages[i] ? pages[i].items.map((x) => x.s).join(' ') : '');
  const isOverviewPdf = (pages) => { const t = flat(pages, 0); return /sales overview/i.test(t) && /weekly event report/i.test(t) && /event performance/i.test(t); };
  const rowsOf = (its, tol) => { const rows = []; [...its].sort((a, b) => a.y - b.y || a.x - b.x).forEach((i) => { const r = rows.find((q) => Math.abs(q.y - i.y) <= (tol || 3)); if (r) r.items.push(i); else rows.push({ y: i.y, items: [i] }); }); rows.forEach((r) => r.items.sort((a, b) => a.x - b.x)); return rows; };
  const joinRun = (its) => its.slice().sort((a, b) => a.x - b.x).reduce((t, i, k, a) => t + (k && i.x - (a[k - 1].x + a[k - 1].w) > 1.5 ? ' ' : '') + i.s, '');
  const NUMT = /^\d[\d,]*(\.\d+)?%?$/; const DASH = /^[–—-]$/;
  /** glue "63.75" + "%" into one token */
  const glue = (its) => { const out = []; const ps = its.filter((i) => i.s === '%'); const used = new Set(); its.forEach((t) => { if (t.s === '%') return; const p = ps.find((q) => !used.has(q) && Math.abs(q.y - t.y) <= 3 && Math.abs(q.x - (t.x + t.w)) <= 3 && NUMT.test(t.s)); if (p) { used.add(p); out.push({ ...t, s: t.s + '%', w: t.w + p.w }); } else out.push(t); }); its.forEach((t) => { if (t.s === '%' && !used.has(t)) out.push(t); }); return out; };
  const nearest = (anchors, edge, tol) => { let best = null; Object.entries(anchors).forEach(([k, a]) => { if (a == null) return; const d = Math.abs(a - edge); if (d <= tol && (!best || d < best.d)) best = { k, d }; }); return best ? best.k : null; };
  const cellVal = (s) => (s == null ? null : DASH.test(s) ? null : val(String(s).replace('%', '')));

  function overviewPage1(P, issues) {
    const rows = rowsOf(P.items, 3); const out = { title: joinRun((rows[0] || { items: [] }).items), sub: rows[1] ? joinRun(rows[1].items) : '', kpis: [], events: [], total: null, highlights: '' };
    const vi = rows.findIndex((r, i) => i > 1 && r.items.length >= 4 && r.items.every((x) => NUMT.test(x.s))); const lr = vi >= 0 ? rows[vi + 1] : null;
    if (vi >= 0 && lr) rows[vi].items.forEach((v, i, a) => { const x0 = v.x - 8, x1 = a[i + 1] ? a[i + 1].x - 8 : 1e9; out.kpis.push({ value: v.s, x: v.x, y: v.y, label: joinRun(lr.items.filter((l) => l.x >= x0 && l.x < x1)), ly: lr.y }); }); else issues.push(I('warn', 'The headline figures were not found on the first page.'));
    const hi = rows.findIndex((r) => r.items.some((x) => /^event$/i.test(x.s)) && r.items.some((x) => /^status$/i.test(x.s))); if (hi < 0) { issues.push(I('error', 'The event table (Event / Status / Sales days / …) was not found on the first page.')); return out; }
    const hy = rows[hi].y; const ht = P.items.filter((i) => Math.abs(i.y - hy) <= 14); const edge = (re) => { const t = ht.find((i) => re.test(i.s)); return t ? t.x + t.w : null; };
    const anchors = { days: edge(/^sales days$/i), trans: edge(/^transactions$/i), net: edge(/^net sales/i), daily: edge(/^avg daily$/i), avg: edge(/^avg sale$/i), cups: edge(/^cups$/i), drip: edge(/^drip cups$/i), share: edge(/^% of sales$/i) };
    const statusX = (ht.find((i) => /^status$/i.test(i.s)) || { x: 290 }).x - 6; const daysLeft = anchors.days ? anchors.days - 20 : 380;
    Object.entries(anchors).forEach(([k, v]) => { if (v == null) issues.push(I('warn', `The “${k}” column header was not found in the event table.`)); });
    const body = rows.slice(hi + 1); const stop = body.findIndex((r) => /^total$/i.test(joinRun(r.items.filter((x) => x.x < statusX)).trim()));
    (stop >= 0 ? body.slice(0, stop) : body).forEach((r) => {
      const its = glue(r.items); const nameP = its.filter((x) => x.x + x.w <= statusX + 2), statusP = its.filter((x) => x.x >= statusX && x.x + x.w < daysLeft), numP = its.filter((x) => x.x + x.w >= daysLeft);
      if (!nameP.length) return; if (!numP.length && !statusP.length) return; const cells = {};
      numP.forEach((t) => { const k = nearest(anchors, t.x + t.w, 8); if (!k) { issues.push(I('warn', `“${joinRun(nameP)}”: a figure (${t.s}) does not sit under any column.`)); return; } cells[k] = t.s; });
      out.events.push({ name: joinRun(nameP).trim(), status: joinRun(statusP).trim(), cells });
    });
    if (stop >= 0) { const tr = glue(body[stop].items); const cells = {}; tr.filter((x) => x.x + x.w >= daysLeft).forEach((t) => { const k = nearest(anchors, t.x + t.w, 8); if (k) cells[k] = t.s; }); out.total = cells; out.highlights = body.slice(stop + 1).map((r) => joinRun(r.items)).join(' | '); }
    return out;
  }
  function overviewPage2(P, issues) {
    const out = { products: [], productTotal: null, cats: [], catTotal: null, drip: [], dripTotal: null };
    const Lx = glue(P.items.filter((i) => i.x < 530)), Rx = glue(P.items.filter((i) => i.x >= 530));
    const hdrL = rowsOf(Lx, 3).find((r) => r.items.some((x) => /^product$/i.test(x.s))); if (hdrL) {
      const e = (re) => { const t = hdrL.items.find((i) => re.test(i.s)); return t ? t.x + t.w : null; }; const A = { sales: e(/^sales/i), qty: e(/^qty$/i), share: e(/^share$/i), price: e(/^avg price/i) };
      rowsOf(Lx.filter((i) => i.y > hdrL.y + 4), 3).forEach((r) => { const idx = r.items.find((x) => /^\d{1,2}$/.test(x.s) && x.x < 70); const cells = {}; const nameT = [];
        r.items.forEach((t) => { if (t === idx) return; const k = nearest(A, t.x + t.w, 8); if (k && (NUMT.test(t.s) || DASH.test(t.s))) cells[k] = t.s; else nameT.push(t); });
        const nm = joinRun(nameT).trim(); if (cells.sales == null) return; if (idx) out.products.push({ no: idx.s, name: nm, cells }); else if (/total/i.test(nm)) out.productTotal = { name: nm, cells }; });
    } else issues.push(I('error', 'The “Top 10 sold products” table was not found on page 2.'));
    const hdrR = rowsOf(Rx, 3).find((r) => r.items.some((x) => /^category$/i.test(x.s))); if (hdrR) {
      const ht = Rx.filter((i) => Math.abs(i.y - hdrR.y) <= 14); const e = (re) => { const t = ht.find((i) => re.test(i.s)); return t ? t.x + t.w : null; }; const A = { sales: e(/^sales/i), qty: e(/^cups$/i) || e(/^qty/i), share: e(/^share$/i), rank: e(/^rank$/i) };
      const dripY = (Rx.find((i) => /^drip coffee mix/i.test(i.s)) || { y: 1e9 }).y;
      rowsOf(Rx.filter((i) => i.y > hdrR.y + 12 && i.y < dripY - 4), 3).forEach((r) => { const cells = {}; const nameT = []; r.items.forEach((t) => { const k = nearest(A, t.x + t.w, 9); if (k && (NUMT.test(t.s) || DASH.test(t.s))) cells[k] = t.s; else nameT.push(t); }); const nm = joinRun(nameT).trim(); if (!nm || cells.sales == null) return; if (/^total$/i.test(nm)) out.catTotal = cells; else out.cats.push({ name: nm, cells }); });
      // drip mix boxes
      const dt = Rx.find((i) => /^drip coffee mix/i.test(i.s)); if (dt) { const rr = rowsOf(Rx.filter((i) => i.y > dt.y + 4), 3); const heads = rr[0] ? rr[0].items.filter((i) => /drip/i.test(i.s)) : [];
        const drows = rr.slice(1); heads.forEach((hd, k) => { const x0 = hd.x - 8, x1 = heads[k + 1] ? heads[k + 1].x - 8 : 1e9; const lines = drows.map((r) => joinRun(r.items.filter((i) => i.x >= x0 && i.x < x1))).filter(Boolean).join(' | '); const a = /SAR\s*([\d,]+(?:\.\d+)?)\s*·\s*([\d,]+)\s*cups/i.exec(lines), b = /([\d.]+)\s*%\s*of sales\s*·\s*([\d.]+)\s*%\s*of cups/i.exec(lines); if (a && b) out.drip.push({ name: hd.s.trim(), sales: a[1], cups: a[2], pSales: b[1], pCups: b[2] }); });
        const tl = rr.map((r) => joinRun(r.items)).find((t) => /total drip/i.test(t)); const m = tl ? /SAR\s*([\d,]+(?:\.\d+)?)\s*·\s*([\d,]+)\s*cups\s*·\s*avg\s*SAR\s*([\d.]+)/i.exec(tl) : null; if (m) out.dripTotal = { sales: m[1], cups: m[2], avg: m[3] }; }
    } else issues.push(I('error', 'The “Sales by category” table was not found on page 2.'));
    return out;
  }
  function overviewPage3(P, issues) {
    const W = P.w; const rowsP = rowsOf(P.items, 3); const sub = rowsP[1] ? joinRun(rowsP[1].items) : ''; const notes = [];
    const left = P.items.filter((i) => i.x < 300 && i.y > 130); const LAB = /^(UPCOMING|COMPLETED|ONGOING|NEW\s*·\s*ACTIVE|ACTIVE|NEW)$/i; const lines = rowsOf(left, 3).map((r) => ({ y: r.y, t: joinRun(r.items).trim() })); const cards = []; let c = null;
    lines.forEach((l) => { if (LAB.test(l.t)) { c = { label: l.t.toUpperCase(), lines: [] }; cards.push(c); } else if (c) c.lines.push(l.t); });
    cards.forEach((k) => notes.push(`${k.label} · ${k.lines[0] || ''}${k.lines.length > 1 ? ' — ' + k.lines.slice(1).join(' · ') : ''}`));
    // photo captions: a heading with its caption under it
    const right = glue(P.items.filter((i) => i.x >= 300 && i.y > 130)); const rr = rowsOf(right, 3); const keep = [];
    rr.forEach((r, i) => { const nx = rr[i + 1]; if (!nx || nx.y - r.y > 22) return; const heads = r.items.filter((h2) => h2.s.length > 3 && nx.items.some((u) => Math.abs(u.x - h2.x) <= 8)); heads.forEach((h2, k) => { const x1 = heads[k + 1] ? heads[k + 1].x - 8 : 1e9; const cap = joinRun(nx.items.filter((u) => u.x >= h2.x - 8 && u.x < x1)).replace(/\s*·\s*$/, ''); if (cap) keep.push({ x: h2.x, y: h2.y, text: `${h2.s} — ${cap}` }); }); });
    const ph = keep.sort((a, b) => a.y - b.y || a.x - b.x).map((k) => k.text); if (ph.length) notes.push('Photos: ' + ph.join('; '));
    if (!cards.length) issues.push(I('warn', 'No active / upcoming / completed event cards were found on page 3.'));
    return { sub, notes, cards };
  }
  function overviewSlides(pages, issues) {
    const p1 = overviewPage1(pages[0], issues); const P1 = pages[0]; const W = P1.w, Hh = P1.h; const T = (text, x, y, fs) => ({ kind: 'text', text, x: x / W, y: y / Hh, fs });
    const s1 = { n: 1, title: 'Event performance — Sales Overview', items: [] }; if (p1.sub) s1.items.push(T(p1.sub, 43, 101, 10));
    p1.kpis.forEach((k) => { s1.items.push(T(k.value, k.x, k.y, 30)); s1.items.push(T(k.label, k.x, k.ly, 10)); });
    const tbl = [['Event', 'Type', 'Cups', 'Net sales (SAR)', 'Transactions', 'Avg check (SAR)', 'Days', 'Avg daily sales']];
    p1.events.forEach((e) => { const c = e.cells; tbl.push([e.name, e.status || '', c.cups || '–', c.net || '–', c.trans || '–', c.avg || '–', c.days || '–', c.daily || '–']); });
    if (tbl.length < 2) issues.push(I('error', 'The event-by-event table was not found.')); s1.items.push({ kind: 'table', rows: tbl }); const slides = [s1];
    const ev = p1.events.map((e) => ({ name: e.name, cups: cellVal(e.cells.cups) })).filter((e) => e.cups).sort((a, b) => b.cups - a.cups);
    slides.push({ n: 2, title: 'Cups served by event', items: ev.length ? [{ kind: 'chart', type: 'bar', dir: 'bar', grouping: 'clustered', title: 'Cups served by event', cats: ev.map((e) => e.name), series: [{ name: 'Cups served', values: ev.map((e) => e.cups) }] }] : [] });
    let p2 = null, p3 = null; if (pages[1]) p2 = overviewPage2(pages[1], issues); else issues.push(I('warn', 'Page 2 (Sales Mix & Top Products) is missing.')); if (pages[2]) p3 = overviewPage3(pages[2], issues); else issues.push(I('warn', 'Page 3 (Events & Operations) is missing.'));
    if (p2) {
      const prod = p2.products; if (prod.length) {
        const rows = [['#', 'Product', 'Sales (SAR)', 'Qty', 'Share', 'Avg price']]; prod.forEach((p) => rows.push([p.no, p.name, p.cells.sales, p.cells.qty || '–', p.cells.share || '–', p.cells.price || '–'])); if (p2.productTotal) { const c = p2.productTotal.cells; rows.push(['', p2.productTotal.name, c.sales, c.qty || '–', c.share || '–', c.price || '–']); }
        slides.push({ n: 3, title: 'Top 10 sold products', items: [{ kind: 'table', rows, show: true }, { kind: 'chart', type: 'bar', dir: 'bar', grouping: 'clustered', title: 'Top 10 sold products — sales (SAR)', cats: prod.map((p) => p.name), series: [{ name: 'Sales (SAR)', values: prod.map((p) => cellVal(p.cells.sales)) }] }] });
      }
      if (p2.cats.length) { const rows = [['Category', 'Sales (SAR)', 'Qty / cups', 'Share', 'Rank']]; p2.cats.forEach((c) => rows.push([c.name, c.cells.sales, c.cells.qty || '–', c.cells.share || '–', c.cells.rank || '–'])); if (p2.catTotal) rows.push(['Total', p2.catTotal.sales, p2.catTotal.qty || '–', p2.catTotal.share || '–', p2.catTotal.rank || '']);
        slides.push({ n: 4, title: 'Sales by category', items: [{ kind: 'table', rows, show: true }, { kind: 'chart', type: 'doughnut', dir: '', grouping: 'clustered', title: 'Sales by category (SAR)', cats: p2.cats.map((c) => c.name), series: [{ name: 'Sales (SAR)', values: p2.cats.map((c) => cellVal(c.cells.sales)) }] }] }); }
      if (p2.drip.length) { const rows = [['Drip coffee', 'Sales (SAR)', 'Cups', '% of drip sales', '% of drip cups', 'Avg per cup (SAR)']]; p2.drip.forEach((d) => rows.push([d.name, d.sales, d.cups, d.pSales + '%', d.pCups + '%', fmtN(val(d.sales) / val(d.cups), 2)])); if (p2.dripTotal) rows.push(['Total drip', p2.dripTotal.sales, p2.dripTotal.cups, '100%', '100%', p2.dripTotal.avg]); slides.push({ n: 5, title: 'Drip coffee mix — Brazilian & Ethiopian', items: [{ kind: 'table', rows, show: true }] }); }
    }
    return { slides, p1, p2, p3 };
  }
  function overviewExtras(D, parts, pages, issues) {
    const { p1, p2, p3 } = parts; const E = D.events; const fmt = (n, d) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
    p1.events.forEach((pe, i) => { const e = E[i]; if (!e) return; e.status = pe.status; e.drip = cellVal(pe.cells.drip); e.share = cellVal(pe.cells.share); e.type = pe.status; });
    D.template = 'sales-overview'; D.title = 'HM Weekly Event Report'; D.subtitle = p1.sub.replace(/\s+/g, ' ');
    // insights: same sentences the earlier event report produced
    const total = sum(E, (e) => e.net); const top = E.slice().sort((a, b) => b.net - a.net)[0]; const free = E.filter((e) => !e.net && e.cups); const freeCups = sum(free, (e) => e.cups); const hiAvg = E.filter((e) => e.avg).sort((a, b) => b.avg - a.avg)[0];
    D.insights = []; if (top && total) D.insights.push(`${((top.net / total) * 100).toFixed(2)}% of net sales came from one event: ${top.name} (SAR ${fmt(top.net, 2)} over ${top.days} days).`);
    if (freeCups) D.insights.push(`${fmt(freeCups)} cups served at zero-revenue complimentary events (${free.map((e) => e.name).join(', ')}).`);
    if (hiAvg && top && top.avg) D.insights.push(`${hiAvg.avg.toFixed(2)} SAR average check at ${hiAvg.name} — the highest of any event, ${Math.round((hiAvg.avg / top.avg - 1) * 100)}% above ${top.name}.`);
    const pg1 = flat(pages, 0); if (top && total && !pg1.includes(((top.net / total) * 100).toFixed(2))) issues.push(I('warn', `Page 1 does not show ${((top.net / total) * 100).toFixed(2)}% of net sales for ${top.name} — the highlight card may disagree with the table.`));
    if (hiAvg && !pg1.includes(hiAvg.avg.toFixed(2))) issues.push(I('warn', `Page 1 does not show the highest average check (${hiAvg.avg.toFixed(2)}, ${hiAvg.name}).`)); if (freeCups && !pg1.includes(fmt(freeCups))) issues.push(I('warn', `Page 1 does not show ${fmt(freeCups)} complimentary cups.`));
    // checks the PDF does not make for itself
    const kd = D.kpis.find((k) => /sales days/i.test(k.label)); const tc = p1.total || {};
    const chk = (tpl, a, b, tol) => { if (a != null && b != null && Math.abs(a - b) > tol) issues.push(I('warn', tpl.replace('{a}', fmtN2(a)).replace('{b}', fmtN2(b)) + '.')); };
    chk('Sales days: the events add up to {a} but the Total row says {b}', sum(E, (e) => e.days), cellVal(tc.days), 0.5); chk('Drip cups: the events add up to {a} but the Total row says {b}', sum(E, (e) => e.drip), cellVal(tc.drip), 0.5); chk('% of sales: the events add up to {a} but the Total row says {b}', sum(E, (e) => e.share), cellVal(tc.share), 0.1);
    chk('Avg daily sales: the Total row says {a} but total net sales ÷ total sales days = {b}', cellVal(tc.daily), total && cellVal(tc.days) ? total / cellVal(tc.days) : null, 0.02);
    E.forEach((e) => { if (e.net && e.share != null && total && Math.abs((e.net / total) * 100 - e.share) > 0.02) issues.push(I('warn', `${e.name}: % of sales is ${e.share} but net sales ÷ total = ${((e.net / total) * 100).toFixed(2)}.`)); });
    if (kd && D.period) { const span = Math.round((Date.parse(D.period.end) - Date.parse(D.period.start)) / 86400000) + 1; if (kd.n > span) issues.push(I('info', `“${kd.label}” shows ${kd.value} but the period covers ${span} days.`)); }
    if (p2) {
      chk('Top 10 products: the rows add up to SAR {a} but the total row says {b}', sum(p2.products, (p) => cellVal(p.cells.sales)), p2.productTotal ? cellVal(p2.productTotal.cells.sales) : null, 0.05); chk('Top 10 products: the quantities add up to {a} but the total row says {b}', sum(p2.products, (p) => cellVal(p.cells.qty)), p2.productTotal ? cellVal(p2.productTotal.cells.qty) : null, 0.5);
      chk('Sales by category: the rows add up to SAR {a} but the total row says {b}', sum(p2.cats, (c) => cellVal(c.cells.sales)), p2.catTotal ? cellVal(p2.catTotal.sales) : null, 0.05); chk('Sales by category: the shares add up to {a}% but the total row says {b}%', sum(p2.cats, (c) => cellVal(c.cells.share)), p2.catTotal ? cellVal(p2.catTotal.share) : 100, 0.1);
      if (p2.dripTotal) { chk('Drip mix: Brazilian + Ethiopian sales add up to SAR {a} but the total says {b}', sum(p2.drip, (d) => val(d.sales)), val(p2.dripTotal.sales), 0.05); chk('Drip mix: Brazilian + Ethiopian cups add up to {a} but the total says {b}', sum(p2.drip, (d) => val(d.cups)), val(p2.dripTotal.cups), 0.5); const dc = p2.cats.find((c) => /drip/i.test(c.name)); if (dc) { chk('Drip coffee: the category table says SAR {a} but the drip mix total says {b}', cellVal(dc.cells.sales), val(p2.dripTotal.sales), 0.05); } chk('Drip cups: the event table says {a} but the drip mix says {b}', cellVal(tc.drip), val(p2.dripTotal.cups), 0.5); }
      const cat = p2.catTotal ? cellVal(p2.catTotal.sales) : null; if (cat != null && total && Math.abs(cat - total) > 1) issues.push(I('warn', `The sales-mix tables add up to SAR ${fmt(cat, 2)} but total net sales is SAR ${fmt(total, 2)} (difference ${fmt(total - cat, 2)}).`));
    }
    // page 3 cards against the table
    D.notes = []; if (p3) { const sub = p3.sub ? p3.sub.replace(/\s+/g, ' ') : ''; if (sub) D.notes.push(sub); p3.notes.forEach((n) => D.notes.push(n)); const m = /(\d[\d\s–-]+\w+\s+20\d\d)\s*[–—-]\s*(\d{1,2}\s+\w+\s+20\d\d)/.exec(sub); void m;
      const pn = p3.cards.find((c) => /^NEW|ACTIVE/.test(c.label) && /pnu/i.test(c.lines[0] || '')); const pe = E.find((e) => /pnu/i.test(e.name)); if (pn && pe) { const t = pn.lines.join(' '); const sar = /SAR\s*([\d,.]+)/.exec(t), cups = /([\d,]+)\s*cups/.exec(t); if (sar && pe.net != null && Math.abs(val(sar[1]) - pe.net) > 0.01) issues.push(I('warn', `Page 3 says SAR ${sar[1]} for ${pe.name} but the table says ${fmt(pe.net, 2)}.`)); if (cups && pe.cups != null && val(cups[1]) !== pe.cups) issues.push(I('warn', `Page 3 says ${cups[1]} cups for ${pe.name} but the table says ${fmt(pe.cups)}.`)); }
    }
    D.reported = D.reported != null ? D.reported : null;
    if (D.period) { const p3p = p3 && p3.sub ? /(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d\d)\s*[–—-]\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d\d)/.exec(p3.sub) : null; if (p3p) { const e3 = iso(+p3p[6], monNo(p3p[5]), +p3p[4]); if (e3 !== D.period.end) issues.push(I('warn', `Page 3 covers up to ${e3} but page 1 says ${D.period.end}.`)); } }
  }
  async function analyzeEventOverview(pages, name, ov, template, existing, hash, others) {
    const issues = []; const parts = overviewSlides(pages, issues); const r = await X.analyzeSlides(parts.slides, name, ov, template || {}, existing || [], hash, others, 'events');
    if (r.ds) { overviewExtras(r.ds.data, parts, pages, r.issues); (r.ds.data.blocks || []).forEach((b) => { if (b.kind === 'table' && b.slide >= 3) b.show = true; }); }
    return { ...r, issues: [...issues, ...r.issues, I('info', 'Read from the PDF: the event table, top products, sales by category, drip coffee mix and the events & operations page. The PDF itself is not stored.')] };
  }

  X.weeklyInfo = weeklyInfo; X.weeklySections = weeklySections; X.parseWeekly = parseWeekly; X.analyzeExcel = analyzeExcel; X.reconcile = reconcile; X.mergeParts = mergeParts;
  X.isOverviewPdf = isOverviewPdf; X.analyzeEventOverview = analyzeEventOverview;
})(typeof window !== 'undefined' ? window : globalThis);
