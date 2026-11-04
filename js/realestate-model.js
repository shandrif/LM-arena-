/* Real estate (RE): Arabic lease register (one row per branch contract) + contract-count summary sheet. No DOM.
   Landlord / contact names and phone numbers in the register are deliberately NOT read or stored. */
(function (root) {
  const LM = (root.LM = root.LM || {});
  const { norm, clean } = LM;
  const I = (level, msg) => ({ level, msg });
  const txt = (v) => (v == null ? '' : clean(v));
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const addYears = (d, n) => `${+d.slice(0, 4) + n}${d.slice(4)}`;
  const serial = (v) => (typeof v === 'number' && v > 30000 && v < 70000 ? LM.parseDay(v) : null);
  const numOf = (v) => { if (typeof v === 'number') return isFinite(v) ? v : null; if (v == null) return null; const s = String(v).replace(/[٫,]/g, '.').replace(/[^\d.\-]/g, ''); const n = Number(s); return s !== '' && isFinite(n) ? n : null; };
  const dateOf = (v) => serial(v) || (typeof v === 'string' ? LM.parseDay(v.trim()) : null);

  const COLS = [['no', 'عددالفروع'], ['name', 'الفرع'], ['street', 'اسمالشارع'], ['district', 'الحي'], ['signed', 'تاريخالتوقيع'], ['start', 'بدايةالعقد'], ['city', 'المدينة'], ['rent1', 'إيجارالسنةالأولى'], ['term', 'مدةالعقد'], ['rentRate', 'معدلالإيجارالسنوي'], ['status', 'الحالة'], ['notes', 'ملاحظات'], ['type', 'طبيعةالمحل'], ['area', 'المساحة'], ['front', 'الواجهة'], ['depth', 'العمق'], ['licence', 'حالةالتراخيص'], ['sign', 'حالةتركيبلوحة'], ['avgRent', 'متوسطالايجارالسنوى'], ['ppm', 'سعرالمتر'], ['expected', 'التاريخالمتوقعللافتتاح'], ['grace', 'فترةالسماح'], ['water', 'توفرالمياه'], ['elec', 'توفرالكهرباء'], ['cars', 'توفرخدمةسيارات'], ['end', 'تاريخنهايةالعقد'], ['handover', 'تاريخاستلامالموقع'], ['url', 'الموقع']];
  const REQUIRED = ['name', 'city', 'rent1', 'end', 'area'];
  const CITY = { 'الرياض': 'Riyadh', 'جدة': 'Jeddah', 'جده': 'Jeddah', 'مكة المكرمة': 'Makkah', 'المدينة المنورة': 'Madinah', 'ابها': 'Abha', 'أبها': 'Abha', 'الخبر': 'Khobar', 'الطائف': 'Taif', 'بريدة': 'Buraidah', 'تبوك': 'Tabuk', 'الدمام': 'Dammam', 'خميس مشيط': 'Khamis Mushait', 'الاحساء': 'Al Ahsa', 'الأحساء': 'Al Ahsa', 'جيزان': 'Jazan', 'جازان': 'Jazan', 'مكة': 'Makkah', 'المدينة': 'Madinah', 'نجران': 'Najran', 'حائل': 'Hail', 'الجبيل': 'Jubail', 'الخرج': 'Al Kharj', 'عنيزة': 'Unaizah', 'سكاكا': 'Sakaka', 'حفر الباطن': 'Hafr Al Batin', 'حفرالباطن': 'Hafr Al Batin', 'صبيا': 'Sabya', 'ينبع': 'Yanbu', 'الشرقية': 'Eastern Province', 'القصيم': 'Qassim' };
  const cityEn = (c) => CITY[txt(c)] || null;
  const mapStatus = (s) => { const t = txt(s); if (!t) return ['Unknown', '']; if (/يعمل/.test(t)) return ['Operating', (/(\d+)\s*ساعة/.exec(t) || [])[1] ? (/(\d+)\s*ساعة/.exec(t))[1] + ' h' : '']; if (/غير\s*جاه/.test(t)) return ['Not ready', '']; if (/لم\s*يستلم|لم\s*يتم\s*الاستلام/.test(t)) return ['Not received', '']; if (/مستلم/.test(t)) return ['Received', '']; if (/جاه/.test(t)) return ['Ready', '']; if (/بالمخططات/.test(t)) return ['At plans stage', '']; if (/تحت\s*التجهيز/.test(t)) return ['Under fit-out', '']; return [t, '']; };
  const mapType = (s) => { const t = txt(s); if (!t) return ''; if (/مبنى/.test(t)) return 'Building'; if (/معرض/.test(t)) return 'Showroom'; if (/[اأإ]رض/.test(t)) return 'Land'; if (/^فرع/.test(t)) return 'Branch unit'; if (/محل/.test(t)) return 'Shop'; return t; };
  const mapLicence = (s) => { const t = txt(s); if (!t) return ''; if (/غير\s*جاه/.test(t)) return 'Not ready'; if (/تحت\s*الترخيص/.test(t)) return 'Under licensing'; if (/تحت\s*التجهيز/.test(t)) return 'Being prepared'; if (/جاه/.test(t)) return 'Ready'; return t; };
  const mapSign = (s) => { const t = txt(s); if (!t) return ''; if (/لا\s*يحتاج/.test(t)) return 'Not needed (operating)'; if (/لم/.test(t)) return 'Not installed'; if (/تم|تركيب/.test(t)) return 'Installed'; return t; };
  const mapHandover = (v) => { const d = serial(v); if (d) return { en: 'Date given', date: d }; const t = txt(v); if (!t) return { en: '', date: null }; if (/افتتاح|إفتتاح/.test(t)) return { en: 'Opened', date: null }; if (/لم\s*يتم\s*(التسليم|الاستلام)/.test(t)) return { en: 'Not handed over', date: null }; if (/تم\s*(التسليم|الاستلام)|مستلم/.test(t)) return { en: 'Handed over', date: null }; return { en: t, date: null }; };
  const graceMonths = (s) => { const t = txt(s); if (!t) return null; if (/^لا$/.test(t)) return 0; if (/سنة|عام/.test(t)) return 12; const m = /(\d+)\s*(شهر|اشهر|أشهر|شهور)/.exec(t); if (m) return +m[1]; if (/ست/.test(t)) return 6; if (/ثلاث|ثلاثة/.test(t)) return 3; if (/أربع|اربع/.test(t)) return 4; if (/شهرين/.test(t)) return 2; return null; };
  const yes = (v) => { const t = txt(v); return /^نعم/.test(t) ? true : /^لا/.test(t) ? false : null; };

  function parseRegister(g, issues) {
    const hr = g.findIndex((r) => (r || []).some((v) => norm(v) === 'عددالفروع') && (r || []).some((v) => norm(v).startsWith('تاريخنهايةالعقد'))); if (hr < 0) return null; const h = g[hr]; const col = {};
    COLS.forEach(([k, key]) => { const i = h.findIndex((v) => norm(v).startsWith(key)); if (i >= 0) col[k] = i; });
    REQUIRED.forEach((k) => { if (!(k in col)) issues.push(I('error', `Register: column “${COLS.find((c) => c[0] === k)[1]}” was not found.`)); });
    const rows = []; const incomplete = []; let totalRow = null;
    for (let r = hr + 1; r < g.length; r++) { const x = g[r] || []; const first = txt(x[0]);
      if (/^الإجمالي|^الاجمالي/.test(first)) { totalRow = { count: numOf(x[1]), rent1: numOf(x[col.rent1]), rentRate: numOf(x[col.rentRate]), avgRent: numOf(x[col.avgRent]), row: r + 1 }; continue; }
      if (typeof x[0] !== 'number') continue; const name = txt(x[col.name]); if (!name || !txt(x[col.city])) { incomplete.push({ no: x[0], name, row: r + 1 }); continue; }
      const [st, hrs] = mapStatus(x[col.status]); const ho = mapHandover(x[col.handover]); const city = txt(x[col.city]).replace('جده', 'جدة');
      rows.push({ no: x[0], row: r + 1, name, street: txt(x[col.street]), district: txt(x[col.district]), city, cityEn: cityEn(city) || cityEn(city.replace('ابها', 'أبها')) || city, signed: dateOf(x[col.signed]), start: dateOf(x[col.start]), rent1: numOf(x[col.rent1]), term: numOf(x[col.term]), rentRate: numOf(x[col.rentRate]), status: st, statusRaw: txt(x[col.status]), hours: hrs, type: mapType(x[col.type]), typeRaw: txt(x[col.type]), area: numOf(x[col.area]), front: numOf(x[col.front]), depth: numOf(x[col.depth]), licence: mapLicence(x[col.licence]), sign: mapSign(x[col.sign]), avgRent: numOf(x[col.avgRent]), ppm: numOf(x[col.ppm]), expectedDone: /^تم/.test(txt(x[col.expected])), grace: txt(x[col.grace]), graceMonths: graceMonths(x[col.grace]), water: yes(x[col.water]), elec: yes(x[col.elec]), cars: yes(x[col.cars]), end: dateOf(x[col.end]), endRaw: typeof x[col.end] === 'string' ? x[col.end] : '', handover: ho.en, handoverDate: ho.date, url: txt(x[col.url]) });
    }
    return { rows, incomplete, totalRow };
  }

  const BLOCKS = [[/^العقودالموقعه/, 'signed', 'Signed contracts by city'], [/^الفروعالحالية/, 'current', 'Current branches by city'], [/^السكن/, 'housing', 'Staff housing by city'], [/^المستودعات/, 'warehouses', 'Warehouses by city'], [/^الأكشاك|^الاكشاك/, 'kiosks', 'Kiosks / other sites'], [/^الفروعالمنتهيه|^الفروعالمنتهية/, 'closed', 'Closed branches'], [/^معامل/, 'labs', 'Labs'], [/^مصانع/, 'factories', 'Factories']];
  function parseSummary(g, issues) {
    const out = []; g.forEach((x, r) => (x || []).forEach((v, c) => { const k = norm(v); if (typeof v !== 'string' || !k) return; const b = BLOCKS.find(([re]) => re.test(k)); if (!b) return; if (out.some((o) => o.key === b[1])) return;
      let lc = c, vc = c + 1; if (b[1] === 'signed') { lc = c + 1; vc = c + 2; } const rows = []; let total = null;
      for (let q = r + 1; q < g.length; q++) { const y = g[q] || []; const lab = txt(y[lc]); const val = y[vc]; if (q === r + 1 && /^no\.?$|^عدد/i.test(lab)) continue; if (!lab && val == null) { if (rows.length || total != null) break; continue; } if (BLOCKS.some(([re]) => re.test(norm(lab))) && !rows.length) break; if (/^الإجمالي|^الاجمالي/.test(norm(lab))) { total = typeof val === 'number' ? val : null; break; } if (!lab) break; rows.push({ label: lab, value: typeof val === 'number' ? val : null, extra: typeof val === 'string' ? val : '' }); }
      out.push({ key: b[1], title: b[2], rows, total }); })); return out;
  }

  function monthFromName(name) { const m = /(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[-_ ]*(20\d\d)/i.exec(name); if (!m) return null; const mi = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1].slice(0, 3).toLowerCase()) + 1; const last = new Date(Date.UTC(+m[2], mi, 0)).getUTCDate(); return { start: `${m[2]}-${String(mi).padStart(2, '0')}-01`, end: `${m[2]}-${String(mi).padStart(2, '0')}-${last}` }; }

  function detect(wb) { return wb.SheetNames.some((n) => { const g = LM.engine.rowsOf(wb, n).slice(0, 6); return g.some((r) => (r || []).some((v) => norm(v) === 'عددالفروع') && (r || []).some((v) => norm(v).startsWith('تاريخنهايةالعقد'))); }); }

  function analyze(rf, existing, template, ov) {
    ov = ov || {}; existing = existing || []; const issues = []; const wb = rf.wb; let reg = null, summary = null;
    wb.SheetNames.forEach((n) => { const g = LM.engine.rowsOf(wb, n); if (!reg) { const r = parseRegister(g, issues); if (r) { reg = r; reg.sheet = n; return; } } if (!summary && g.some((x) => (x || []).some((v) => BLOCKS.some(([re]) => typeof v === 'string' && re.test(norm(v)))))) { const s = parseSummary(g, issues); if (s.length) { summary = s; } } });
    if (!reg) return { ds: null, issues: [I('error', 'The lease register (sheet with “عدد الفروع … تاريخ نهاية العقد”) was not found.')] };
    const per = ov.asOf && ov.asOf.date ? { start: ov.asOf.date.slice(0, 8) + '01', end: ov.asOf.date } : monthFromName(rf.name);
    if (!per) issues.push({ level: 'error', msg: 'The report month could not be found in the file name (e.g. “…OCT-2026…”). Enter the report date.', fix: { type: 'asOf', id: 'date', kind: 'date', label: 'Use this date' } });
    const R = reg.rows; const asOf = per ? per.end : null; const date = (d) => d || '–';
    // totals row
    if (reg.totalRow) { const t = reg.totalRow; if (t.count != null && t.count !== R.length + reg.incomplete.filter((x) => x.name).length) issues.push(I('warn', `The register's total row says ${t.count} contracts but ${R.length} complete row(s) and ${reg.incomplete.filter((x) => x.name).length} named row(s) without data were found.`)); [['rent1', 'first-year rent'], ['rentRate', 'annual rent'], ['avgRent', 'average annual rent incl. VAT']].forEach(([k, l]) => { const s = sum(R, (x) => x[k]); if (t[k] != null && Math.abs(s - t[k]) > Math.max(1, t[k] * 0.002)) issues.push(I('warn', `Total row (${l}): ${Math.round(t[k]).toLocaleString()} but the rows add up to ${Math.round(s).toLocaleString()}.`)); }); }
    if (reg.incomplete.length) issues.push(I('warn', `${reg.incomplete.length} register row(s) are incomplete: ${reg.incomplete.map((x) => `#${x.no}${x.name ? ' “' + x.name + '”' : ''} (row ${x.row})`).join(', ')}. They are listed but not counted in the figures.`));
    const miss = (k, l) => { const n = R.filter((x) => x[k] == null || x[k] === '').length; if (n) issues.push(I('warn', `${n} contract(s) have no ${l}: ${R.filter((x) => x[k] == null || x[k] === '').slice(0, 5).map((x) => x.name).join('، ')}${n > 5 ? '…' : ''}.`)); };
    miss('rent1', 'first-year rent'); miss('end', 'contract end date'); miss('area', 'area');
    const badEnd = R.filter((x) => x.endRaw); if (badEnd.length) issues.push(I('info', `Contract end date written as text for ${badEnd.map((x) => `#${x.no} (“${x.endRaw}”)`).join(', ')}; ${badEnd.filter((x) => x.end).length ? 'those that look like dates were read.' : 'not readable as a date.'}`));
    const comma = R.filter((x) => x.front == null || x.depth == null).length; void comma;
    // logic checks
    const term = R.filter((x) => x.start && x.term && x.end && Math.abs(days(addYears(x.start, x.term), x.end)) > 60); if (term.length) issues.push(I('warn', `${term.length} contract(s) where the end date is not start + term (more than 2 months apart), e.g. ${term.slice(0, 3).map((x) => `#${x.no} ${x.name}`).join('، ')}. Renewals or a wrong term?`));
    const sg = R.filter((x) => x.signed && x.start && x.start < x.signed); if (sg.length) issues.push(I('warn', `${sg.length} contract(s) start before they were signed: ${sg.slice(0, 4).map((x) => '#' + x.no).join(', ')}.`));
    const ppm = R.filter((x) => x.ppm && x.rent1 && x.area && Math.abs(x.rent1 / x.area - x.ppm) / x.ppm > 0.1); if (ppm.length) issues.push(I('info', `${ppm.length} row(s) where the file's “price per m²” differs by more than 10% from first-year rent ÷ area (the file may use another base, e.g. average rent incl. VAT), e.g. ${ppm.slice(0, 3).map((x) => `#${x.no}: ${x.ppm} vs ${Math.round(x.rent1 / x.area)}`).join('; ')}. The dashboard uses first-year rent ÷ area.`));
    if (asOf) { const exp = R.filter((x) => x.end && x.end < asOf); if (exp.length) issues.push(I('warn', `${exp.length} contract(s) ended before ${asOf}: ${exp.map((x) => `#${x.no} ${x.name} (${x.end}, ${x.status})`).join('؛ ')}.`)); }
    const dupN = {}; R.forEach((x) => { const k = x.name + '|' + x.city; (dupN[k] = dupN[k] || []).push(x.no); }); Object.entries(dupN).filter(([, a]) => a.length > 1).forEach(([k, a]) => issues.push(I('warn', `Branch name “${k.split('|')[0]}” (${k.split('|')[1]}) appears more than once: #${a.join(', #')}.`)));
    const noCity = R.filter((x) => !CITY[x.city] && !CITY[x.city.replace('ابها', 'أبها')]).map((x) => x.city); if (noCity.length) issues.push(I('info', `City name(s) without an English label: ${[...new Set(noCity)].join('، ')}.`));
    const op = R.filter((x) => x.status === 'Operating'); const opNoLic = op.filter((x) => x.licence && x.licence !== 'Ready'); if (opNoLic.length) issues.push(I('warn', `${opNoLic.length} operating branch(es) do not have a ready licence: ${opNoLic.slice(0, 4).map((x) => x.name).join('، ')}.`));
    const opUtil = op.filter((x) => x.water === false || x.elec === false); if (opUtil.length) issues.push(I('warn', `${opUtil.length} operating branch(es) are marked without water or electricity: ${opUtil.slice(0, 4).map((x) => x.name).join('، ')}.`));
    const statuses = [...new Set(R.map((x) => x.statusRaw))].length, mapped = [...new Set(R.map((x) => x.status))].length; if (statuses > mapped) issues.push(I('info', `${statuses} spellings of the status were merged into ${mapped} categories (e.g. “غير جاهزه / غير جاهزة / غير جاهز”).`));
    const unk = R.filter((x) => x.status === 'Unknown').length; if (unk) issues.push(I('warn', `${unk} contract(s) have no status.`));
    const newVals = (k, known, label) => { const kn = (template[known] || []); if (!kn.length) return; const v = [...new Set(R.map((x) => x[k]).filter(Boolean))].filter((x) => !kn.includes(x)); if (v.length) issues.push(I('warn', `New ${label}: ${v.join(', ')}.`)); }; newVals('status', 'knownStatuses', 'status value(s)'); newVals('type', 'knownTypes', 'property type(s)'); newVals('cityEn', 'knownCities', 'city/cities');
    // summary sheet cross-checks
    if (summary) { const get = (k) => summary.find((s) => s.key === k); const signed = get('signed'); if (signed) { const s = sum(signed.rows, (r) => r.value); if (signed.total != null && signed.total !== s) issues.push(I('warn', `Summary sheet: signed contracts by city add up to ${s} but the total says ${signed.total}.`)); const byCity = {}; R.forEach((x) => (byCity[x.cityEn] = (byCity[x.cityEn] || 0) + 1)); signed.rows.forEach((r) => { const en = cityEn(r.label.replace('جده', 'جدة')) || cityEn(r.label.replace('ابها', 'أبها')) || r.label; if (r.value != null && (byCity[en] || 0) !== r.value) issues.push(I('warn', `${en}: the summary sheet says ${r.value} signed contract(s) but the register has ${byCity[en] || 0}.`)); }); if (signed.total != null && signed.total !== R.length) issues.push(I('warn', `The summary sheet counts ${signed.total} signed contracts, the register has ${R.length} complete rows.`)); }
      ['current', 'housing', 'warehouses'].forEach((k) => { const b = get(k); if (b && b.total != null) { const s = sum(b.rows, (r) => r.value); if (s !== b.total) issues.push(I('warn', `Summary “${b.title}”: the cities add up to ${s} but the total says ${b.total}.`)); } }); const cur = get('current'); if (cur && cur.total != null) issues.push(I('info', `The summary sheet lists ${cur.total} current branches; the register marks ${op.length} contracts as “operating” (the register is a contract list, not the live branch list).`)); } else issues.push(I('warn', 'The contract-count summary sheet was not found.'));
    existing.forEach((e) => { if (e.hash === rf.hash) issues.push(I('warn', `This exact file was already uploaded (${e.end}, on ${e.uploadedAt.slice(0, 10)}).`)); else if (per && e.end === per.end) issues.push(I('warn', `A real-estate report for ${per.end.slice(0, 7)} already exists. Approving replaces it (the old version is kept in history).`)); else if (per && e.end > per.end) issues.push(I('warn', `A newer real-estate report (${e.end}) already exists. This one is older.`)); });
    const prev = [...existing].sort((a, b) => (a.end < b.end ? 1 : -1)).find((e) => per && e.end < per.end);
    if (prev) { const a = new Map(prev.data.rows.map((x) => [x.name + '|' + x.city, x])), b = new Map(R.map((x) => [x.name + '|' + x.city, x])); const added = [...b.keys()].filter((k) => !a.has(k)), gone = [...a.keys()].filter((k) => !b.has(k)); const ch = [...b].filter(([k, x]) => a.has(k) && (a.get(k).status !== x.status || a.get(k).end !== x.end || a.get(k).rent1 !== x.rent1)); if (added.length) issues.push(I('info', `${added.length} new contract(s) since ${prev.end.slice(0, 7)}: ${added.slice(0, 5).map((k) => k.split('|')[0]).join('، ')}.`)); if (gone.length) issues.push(I('warn', `${gone.length} contract(s) from ${prev.end.slice(0, 7)} are missing now: ${gone.slice(0, 5).map((k) => k.split('|')[0]).join('، ')}.`)); if (ch.length) issues.push(I('info', `${ch.length} contract(s) changed status, rent or end date since ${prev.end.slice(0, 7)}.`)); }
    issues.push(I('info', 'Landlord and contact names / phone numbers in the register are not read or stored.'));
    return { ds: per ? { type: 'realestate', start: per.start, end: per.end, data: { rows: R, incomplete: reg.incomplete, totalRow: reg.totalRow, summary: summary || [] } } : null, issues };
  }

  /* ---------- analytics ---------- */
  function compute(ds) {
    const R = ds.data.rows, asOf = ds.end; const grp = (f, v) => { const m = {}; R.forEach((x) => { const k = f(x) || '(none)'; const o = (m[k] = m[k] || { name: k, n: 0, rent: 0, area: 0 }); o.n++; o.rent += v ? v(x) || 0 : 0; o.area += x.area || 0; }); return Object.values(m).sort((a, b) => b.n - a.n); };
    const rentTotal = sum(R, (x) => x.rentRate), rent1 = sum(R, (x) => x.rent1), area = sum(R, (x) => x.area);
    const opened = R.filter((x) => x.status === 'Operating' || x.handover === 'Opened'); const pipeline = R.filter((x) => !(x.status === 'Operating' || x.handover === 'Opened'));
    const endYear = {}; R.forEach((x) => { if (x.end) { const y = x.end.slice(0, 4); (endYear[y] = endYear[y] || []).push(x); } });
    const within = (n) => R.filter((x) => x.end && x.end >= asOf && days(asOf, x.end) <= n).sort((a, b) => (a.end < b.end ? -1 : 1));
    const expired = R.filter((x) => x.end && x.end < asOf);
    const byCity = grp((x) => x.cityEn, (x) => x.rentRate), byStatus = grp((x) => x.status), byType = grp((x) => x.type), byLic = grp((x) => x.licence), bySign = grp((x) => x.sign);
    return { n: R.length, rentTotal, rent1, area, avgPpm: area ? rent1 / area : null, opened, pipeline, endYear, within, expired, byCity, byStatus, byType, byLic, bySign, avgTerm: sum(R.filter((x) => x.term), (x) => x.term) / Math.max(1, R.filter((x) => x.term).length),
      noWater: R.filter((x) => x.water === false).length, noElec: R.filter((x) => x.elec === false).length, noCars: R.filter((x) => x.cars === false).length, grace: R.filter((x) => x.graceMonths), };
  }
  LM.realestate = { detect, analyze, compute, cityEn };
})(typeof window !== 'undefined' ? window : globalThis);
