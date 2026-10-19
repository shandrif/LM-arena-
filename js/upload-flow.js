/* Reusable upload -> review -> approve -> save flow for departments with a dedicated template.
   A department passes its spec plus build / checks / learn callbacks. */
(function () {
  const LM = window.LM; const { num } = LM;

  /** cfg: {dept, label, spec, existing:[datasets], build(parsed,tpl,ov), checks(parsed,ds,tpl,ov,rf,existing), facts(ds), learn(tpl,ds,ov), onSaved(rec)} */
  LM.runUpload = async (file, cfg) => {
    let rf; try { rf = await LM.readFile(file); } catch (e) { return alert(e.message); }
    const base = { dept: cfg.dept, colAliases: {}, sheetNames: {} };
    const tpl = { ...base, ...((await LM.db.get('templates', cfg.dept)) || {}) };
    const ov = { sheets: {}, cols: {} };
    const run = () => {
      const r = LM.engine.analyze(rf.wb, cfg.spec, ov, tpl);
      const ds = cfg.build(r.sheets, tpl, ov);
      const issues = r.issues.concat(cfg.checks(r.sheets, ds, tpl, ov, rf, cfg.existing));
      return { r, ds, issues };
    };
    let res = run();
    const info = () => {
      const same = cfg.existing.find((s) => s.start === res.ds.start && s.end === res.ds.end);
      return {
        title: `Review before processing: ${rf.name}`, facts: cfg.facts(res.ds), issues: res.issues,
        approveLabel: same ? 'Approve & replace existing period' : 'Approve & process',
        onFix: (fix, val) => {
          if (fix.type === 'sheet') ov.sheets[fix.key] = val; else if (fix.type === 'col') ov.cols[fix.id] = val;
          else { ov[fix.type] = { ...(ov[fix.type] || {}), [fix.id || fix.alt]: val }; }
          res = run(); dlg.update(info());
        },
        onApprove: async () => {
          const { ds } = res;
          const old = cfg.existing.find((s) => s.start === ds.start && s.end === ds.end);
          if (old) { await LM.db.put('history', { ...old, id: LM.uid(), replacedAt: new Date().toISOString() }); await LM.db.del('datasets', old.id); }
          const rec = { id: LM.uid(), dept: cfg.dept, fileName: rf.name, hash: rf.hash, uploadedAt: new Date().toISOString(), ...ds };
          await LM.db.put('datasets', rec);
          const t = cfg.learn ? cfg.learn({ ...tpl }, ds, ov) : { ...tpl };
          t.colAliases = { ...(t.colAliases || {}) }; Object.entries(ov.cols).forEach(([k, v]) => (t.colAliases[k] = [...new Set([...(t.colAliases[k] || []), v])]));
          t.sheetNames = { ...(t.sheetNames || {}) }; Object.entries(ov.sheets).forEach(([k, v]) => (t.sheetNames[k] = [...new Set([...(t.sheetNames[k] || []), v])]));
          await LM.db.put('templates', t);
          cfg.onSaved(rec); LM.toast(`${cfg.label} ${ds.start} → ${ds.end} processed`);
        },
      };
    };
    const dlg = LM.review(info());
  };

})();
