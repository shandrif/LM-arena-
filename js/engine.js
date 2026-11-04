/* Generic file-check engine shared by every department.
   A department supplies a `spec` (expected sheets / columns / types); the engine
   locates them in the workbook, parses the rows and returns `issues` for the user
   to review BEFORE anything is saved. Pure logic, no DOM, so it can be tested in node. */
(function (root) {
  const LM = (root.LM = root.LM || {});

  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  function similarity(a, b) {
    a = norm(a); b = norm(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++)
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return 1 - prev[n] / Math.max(m, n);
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

  /** Returns 'YYYY-MM-DD' or null. Accepts Excel serials, Date objects, ISO / d/m/y strings. */
  function parseDay(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number') {
      if (v < 30000 || v > 80000) return null;
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
      return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return valid(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/); // day-first (Saudi / UK style)
    if (m) return valid(+m[3], +m[2], +m[1]);
    return null;
  }
  function valid(y, m, d) {
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    return iso(y, m, d);
  }

  function parseNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v == null) return null;
    const s = String(v).replace(/[,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
    if (s === '' || s === '-') return null;
    const n = Number(s);
    return isFinite(n) ? n : null;
  }

  const isBlank = (v) => v == null || (typeof v === 'string' && v.trim() === '');

  /** Matches a header cell to a column spec. */
  function headerMatches(h, colSpec, extraAliases) {
    const k = norm(h);
    if (!k) return false;
    const names = [colSpec.label, ...(colSpec.aliases || []), ...(extraAliases || [])];
    return names.some((n) => norm(n) === k);
  }

  function resolveColumns(headerRow, colSpecs, overrideCols, sheetKey, tmplAliases) {
    const map = {}; // colKey -> index
    const used = new Set();
    for (const [ck, cs] of Object.entries(colSpecs)) {
      const ov = overrideCols && overrideCols[`${sheetKey}.${ck}`];
      let idx = -1;
      if (ov != null) idx = headerRow.findIndex((h, i) => !used.has(i) && clean(h) === ov);
      if (idx < 0) idx = headerRow.findIndex((h, i) => !used.has(i) && headerMatches(h, cs, tmplAliases && tmplAliases[`${sheetKey}.${ck}`]));
      if (idx >= 0) { map[ck] = idx; used.add(idx); }
    }
    return { map, used };
  }

  function findSheet(wb, sheetSpec, key, overrides, tmplNames) {
    const ov = overrides.sheets && overrides.sheets[key];
    if (ov && wb.SheetNames.includes(ov)) return ov;
    const names = [...sheetSpec.names, ...((tmplNames && tmplNames[key]) || [])].map(norm);
    return wb.SheetNames.find((n) => names.includes(norm(n))) || null;
  }

  const rowsOf = (wb, name) => root.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });

  /** Analyse a workbook against a spec. Returns {sheets, issues, used}. */
  function analyze(wb, spec, overrides, template) {
    overrides = overrides || {};
    template = template || {};
    const issues = [];
    const out = {};
    const used = { sheets: {}, cols: {} }; // what was matched, for learning on approval

    for (const [sk, ss] of Object.entries(spec.sheets)) {
      const name = findSheet(wb, ss, sk, overrides, template.sheetNames);
      if (!name) {
        issues.push({
          level: ss.required ? 'error' : ss.missingLevel || 'warn', code: 'sheet-missing', sheet: sk,
          msg: `${ss.required ? 'Required' : 'Expected'} sheet "${ss.names[0]}" (${ss.label}) was not found.`,
          fix: { type: 'sheet', key: sk, options: wb.SheetNames, label: 'Use this sheet instead' },
        });
        continue;
      }
      used.sheets[sk] = name;
      const grid = rowsOf(wb, name);

      // header row = the row (in the first 30) that resolves the most required columns
      let best = { row: -1, score: -1, map: {}, used: new Set() };
      const reqKeys = Object.keys(ss.cols).filter((c) => ss.cols[c].required);
      for (let r = 0; r < Math.min(30, grid.length); r++) {
        const hdr = (grid[r] || []).map((h) => (h == null ? '' : h));
        const res = resolveColumns(hdr, ss.cols, overrides.cols, sk, template.colAliases);
        const score = Object.keys(res.map).filter((c) => reqKeys.includes(c)).length * 10 + Object.keys(res.map).length;
        if (score > best.score) best = { row: r, score, map: res.map, used: res.used };
      }
      if (best.row < 0) {
        issues.push({ level: 'error', code: 'sheet-empty', sheet: sk, msg: `Sheet "${name}" is empty.` });
        continue;
      }
      const header = (grid[best.row] || []).map((h) => clean(h));
      const unmatched = header.filter((h, i) => h && !best.used.has(i));

      let blocked = false;
      for (const [ck, cs] of Object.entries(ss.cols)) {
        if (ck in best.map) { used.cols[`${sk}.${ck}`] = header[best.map[ck]]; continue; }
        const guess = unmatched.map((h) => [h, similarity(h, cs.label)]).sort((a, b) => b[1] - a[1])[0];
        const hint = guess && guess[1] >= 0.5 ? ` Closest column in the file: "${guess[0]}".` : '';
        issues.push({
          level: cs.required ? 'error' : 'warn', code: 'col-missing', sheet: sk,
          msg: `Sheet "${name}": column "${cs.label}" not found.${hint}`,
          fix: { type: 'col', id: `${sk}.${ck}`, options: unmatched, suggest: guess && guess[1] >= 0.5 ? guess[0] : null, label: `Treat as "${cs.label}"` },
        });
        if (cs.required) blocked = true;
      }
      const extras = unmatched.filter((h) => !(ss.ignoreCols || []).some((i) => norm(i) === norm(h)));
      if (extras.length)
        issues.push({ level: 'warn', code: 'col-new', sheet: sk, msg: `Sheet "${name}": new column(s) not in the ${spec.label} template (ignored): ${extras.join(', ')}.` });
      if (blocked) { out[sk] = { sheetName: name, headerRow: best.row + 1, rows: [], colMap: best.map, blocked: true }; continue; }

      // parse rows
      const rows = [];
      const bad = {}; const blank = {}; let skippedTotals = 0; let dataRows = 0;
      for (let r = best.row + 1; r < grid.length; r++) {
        const line = grid[r] || [];
        if (!Object.values(best.map).some((i) => !isBlank(line[i]))) continue;
        const firstText = clean(line[best.map[ss.keyCol || Object.keys(best.map)[0]]]);
        if (/^(grand\s*)?total/i.test(firstText)) { skippedTotals++; continue; }
        dataRows++;
        const rec = { _r: r + 1 };
        let ok = true;
        for (const [ck, cs] of Object.entries(ss.cols)) {
          if (!(ck in best.map)) continue;
          const raw = line[best.map[ck]];
          if (isBlank(raw)) {
            if (cs.required) { (blank[ck] = blank[ck] || []).push(r + 1); ok = false; }
            rec[ck] = cs.type === 'text' ? '' : null;
            continue;
          }
          let v;
          if (cs.type === 'date') v = parseDay(raw);
          else if (cs.type === 'num') v = parseNum(raw);
          else v = clean(raw);
          if (v == null) { (bad[ck] = bad[ck] || []).push(r + 1); if (cs.required) ok = false; }
          rec[ck] = v;
        }
        if (ok) rows.push(rec);
      }
      const sample = (a) => a.slice(0, 5).join(', ') + (a.length > 5 ? ', …' : '');
      const dropped = dataRows - rows.length;
      const big = dataRows && dropped / dataRows > 0.05;
      for (const [ck, a] of Object.entries(bad))
        issues.push({ level: ss.cols[ck].required && big ? 'error' : 'warn', code: 'bad-type', sheet: sk,
          msg: `Sheet "${name}": ${a.length} value(s) in "${ss.cols[ck].label}" are not valid ${ss.cols[ck].type === 'date' ? 'dates' : ss.cols[ck].type === 'num' ? 'numbers' : 'text'} (rows ${sample(a)}).${ss.cols[ck].required ? ' These rows will be skipped.' : ''}` });
      for (const [ck, a] of Object.entries(blank))
        issues.push({ level: big ? 'error' : 'warn', code: 'blank', sheet: sk,
          msg: `Sheet "${name}": ${a.length} row(s) have an empty "${ss.cols[ck].label}" (rows ${sample(a)}). These rows will be skipped.` });
      if (skippedTotals)
        issues.push({ level: 'info', code: 'totals', sheet: sk, msg: `Sheet "${name}": ${skippedTotals} "Total" row(s) ignored.` });
      if (!rows.length)
        issues.push({ level: ss.required ? 'error' : 'warn', code: 'no-rows', sheet: sk, msg: `Sheet "${name}" has no usable data rows.` });
      out[sk] = { sheetName: name, headerRow: best.row + 1, rows, colMap: best.map, dataRows };
    }
    return { sheets: out, issues, used };
  }

  LM.norm = norm; LM.clean = clean; LM.similarity = similarity; LM.parseDay = parseDay; LM.parseNum = parseNum;
  /** Common "already uploaded / overlapping period" checks. */
  const periodChecks = (ds, existing, hash) => {
    const out = [];
    (existing || []).forEach((e) => {
      if (e.hash === hash) out.push({ level: 'warn', msg: `This exact file was already uploaded (${e.start} to ${e.end}, on ${e.uploadedAt.slice(0, 10)}).` });
      else if (e.start === ds.start && e.end === ds.end) out.push({ level: 'warn', msg: `A report for ${ds.start} to ${ds.end} already exists. Approving will replace it (the old version is kept in history).` });
      else if (e.start <= ds.end && ds.start <= e.end) out.push({ level: 'warn', msg: `This period overlaps an existing report (${e.start} to ${e.end}). Both will be kept; totals are never combined across reports.` });
    });
    return out;
  };
  LM.periodChecks = periodChecks;
  LM.engine = { analyze, rowsOf };
})(typeof window !== 'undefined' ? window : globalThis);
