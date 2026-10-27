/* Hide / show for every block (cards, chart panels, KPI rows, tables) in every tab.
   A small "Hide" tag sits on each block; hidden blocks collapse to one line and stay hidden after refreshes and in later weeks
   (remembered per person in this browser; a "Show all" bar appears whenever something is hidden in the current tab). */
(function () {
  const LM = window.LM; const KEY = 'lm-hidden-blocks-v1';
  let hidden = new Set(); try { hidden = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { hidden = new Set(); }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify([...hidden])); } catch (e) { /* storage unavailable: still works for this visit */ } };
  const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').replace(/\d[\d\-/:., ]*/g, '#').trim().slice(0, 80);
  const txt = (el) => (el && el.textContent ? el.textContent.replace(/\s+/g, ' ').trim() : '');

  function attach(panel, getTab) {
    let timer = null; let n = 0;
    const pill = (off, el) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'blk-pill'; b.textContent = off ? '▸ Show' : '▾ Hide'; b.title = off ? 'Show this block' : 'Hide this block'; if (el) b.addEventListener('click', (e) => { e.stopPropagation(); toggle(el); }); return b; };
    const nudge = () => { try { window.dispatchEvent(new Event('resize')); } catch (e) { /* ignore */ } }; // lets charts re-measure after a block is shown
    const setOff = (el, off) => { if (el.__bar) { el.classList.toggle('blk-hidden', off); el.__bar.pill.textContent = off ? '▸ Show' : '▾ Hide'; el.__bar.pill.title = off ? 'Show this block' : 'Hide this block'; } else { el.classList.toggle('blk-off', off); const p = el.querySelector(':scope > .blk-pill'); if (p) { p.textContent = off ? '▸ Show' : '▾ Hide'; p.title = off ? 'Show this block' : 'Hide this block'; } } };
    const toggle = (el) => { const key = el.dataset.blkKey; const off = !hidden.has(key); if (off) hidden.add(key); else hidden.delete(key); persist(); setOff(el, off); if (!off) nudge(); schedule(); };
    const titleOf = (el, fallback) => { const hd = el.querySelector('h1,h2,h3,h4'); if (hd && txt(hd)) return txt(hd); const b = el.querySelector('.tools b, .tools strong, b'); if (b && txt(b)) return txt(b); const t = txt(el).slice(0, 48); return t || fallback; };

    function run() {
      timer = null; const tab = getTab(); const counts = {}; const found = [];
      panel.querySelectorAll('.blk-bar').forEach((b) => { if (b.__target && !b.__target.isConnected) { if (b.__reused) { b.classList.remove('blk-bar'); b.querySelectorAll(':scope > .blk-pill').forEach((x) => x.remove()); } else b.remove(); } });
      const key = (t) => { const k = `${tab}|${norm(t)}`; counts[k] = (counts[k] || 0) + 1; return `${k}|${counts[k]}`; };
      const sel = '.card:not(.kpi):not([data-noblk]), .kpis, .tscroll, .chart, [data-blk]';
      panel.querySelectorAll(sel).forEach((el) => {
        if (el.closest('.rte, .modal, .blk-bar')) return;
        const isCard = el.matches('.card, .kpis'); const own = el.matches('[data-blk]');
        if (!isCard && !own && el.parentElement && el.parentElement.closest('.card, .kpis, [data-blk]')) return; // table / chart inside a card: the card is the block
        if (el.parentElement && el.parentElement.closest('.blk-hidden')) return;
        if (el.dataset.blkKey) { found.push(el); counts[el.dataset.blkKey.split('|').slice(0, 2).join('|')] = (counts[el.dataset.blkKey.split('|').slice(0, 2).join('|')] || 0) + 1; if (isCard || own) { if (!el.__bar && !el.querySelector(':scope > .blk-pill')) { el.append(pill(el.classList.contains('blk-off'), el)); } } return; }
        const fallback = el.matches('.kpis') ? 'Key figures' : el.matches('.tscroll') ? 'Table' : el.matches('.chart') ? 'Chart' : 'Block';
        const prevEl = el.previousElementSibling; const prevHead = prevEl && /^H[1-4]$/.test(prevEl.tagName) && txt(prevEl) ? txt(prevEl) : null;
        const plain = !el.matches('.card, .kpis, [data-blk]'); // standalone table / chart
        const title = el.matches('.kpis') ? 'Key figures' : own ? (el.getAttribute('data-blk') || fallback) : plain ? (prevHead || fallback) : titleOf(el, fallback);
        const keyBase = plain && !prevHead ? (el.matches('.tscroll') ? 'table ' + [...el.querySelectorAll('th')].slice(0, 3).map(txt).join(' ') : fallback) : title;
        el.dataset.blkKey = key(keyBase); el.dataset.blkTitle = title; found.push(el);
        const off = hidden.has(el.dataset.blkKey);
        if (isCard || own && !el.matches('.tscroll, .chart')) { el.classList.add('blk'); el.setAttribute('data-blk-title', title); el.append(pill(off, el)); if (off) el.classList.add('blk-off'); }
        else { // standalone table / chart: put the tag in the heading just above it, or in a small bar
          const prev = el.previousElementSibling; let host; let label = null;
          if (prev && /^H[1-4]$/.test(prev.tagName) && !prev.querySelector('.blk-pill')) { host = prev; host.classList.add('blk-bar'); } else { host = document.createElement('div'); host.className = 'blk-bar'; label = document.createElement('span'); label.className = 'blk-label'; label.textContent = title; el.before(host); }
          const p = pill(off, el); host.append(...(label ? [p, label] : [p])); host.__target = el; host.__reused = !label; el.__bar = { host, pill: p }; if (off) el.classList.add('blk-hidden');
        }
      });
      // "show all" bar
      const mine = found.filter((el) => hidden.has(el.dataset.blkKey)); let bar = panel.querySelector(':scope > .blk-all');
      if (!mine.length) { if (bar) bar.remove(); return; }
      const msg = `${mine.length} hidden block${mine.length > 1 ? 's' : ''} in this tab`;
      if (!bar) { bar = document.createElement('div'); bar.className = 'blk-all'; const s = document.createElement('span'); const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.textContent = 'Show all'; b.addEventListener('click', () => { panel.querySelectorAll('[data-blk-key]').forEach((el) => { hidden.delete(el.dataset.blkKey); setOff(el, false); }); persist(); nudge(); schedule(); }); bar.append(s, b); panel.prepend(bar); }
      const s = bar.firstChild; if (s.textContent !== msg) s.textContent = msg;
    }
    function schedule() { if (timer == null) timer = setTimeout(run, 40); }
    new MutationObserver(schedule).observe(panel, { childList: true, subtree: true });
    schedule();
  }
  LM.blocks = { attach };
})();
