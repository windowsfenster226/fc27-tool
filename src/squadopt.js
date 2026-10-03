  // ==================================================================
  // KADER-OPTIMIERER: stärkste Elf mit möglichst hoher Chemie aus deinem Verein
  // (+ optional günstige Upgrades vom Markt). Setzt nichts automatisch ein.
  // ==================================================================
  const SQUADOPT = (() => {
    if (settings.soFormation === undefined) settings.soFormation = '';
    if (settings.soMinChem === undefined) settings.soMinChem = 24;
    let box = null;
    const st = { msg: '', busy: false, res: null, ups: null, active: null };

    const formations = () => {
      const all = Object.assign({}, SBC.FORMATIONS, settings.sbcFormations || {});
      return Object.keys(all).filter((k) => Array.isArray(all[k]) && all[k].length === 11).sort();
    };
    const posOf = (f) => (settings.sbcFormations && settings.sbcFormations[f]) || SBC.FORMATIONS[f] || null;
    const label = (f) => String(f).replace(/^f/, '').replace(/[^0-9]/g, '').split('').join('-');

    async function run() {
      st.busy = true; st.res = null; st.ups = null; st.msg = 'Lade Verein …'; render();
      try {
        const c = await SBCUI.loadClub((m) => { st.msg = m; render(); }, false);
        if (!st.active) st.active = await SBCUI.activeSquadInfo();
        let f = settings.soFormation;
        if (!f && st.active && st.active.formation && posOf(st.active.formation)) f = st.active.formation;
        if (!f || !posOf(f)) f = formations().includes('f4231') ? 'f4231' : 'f442';
        const positions = posOf(f);
        const pool = c.players.filter((p) => !p.storage && !p.unassigned && p.rating)
          .map((p) => Object.assign({}, p, { cost: Math.pow(100 - p.rating, 2) }));   // Ziel: hohe Ratings
        const slots = positions.map((position) => ({ position }));
        const variants = [];
        for (const t of [33, 30, 27, settings.soMinChem]) {
          st.msg = `Suche beste Elf (${label(f)}) mit Chemie ≥ ${t} …`; render();
          await sleep(30);
          const sol = SBC.solve(pool, slots, [{ id: 1, kind: 'CHEMISTRY_POINTS', value: t, scope: 'MIN' }], { timeMs: 2500 });
          if (!sol.error && sol.feasible) variants.push({ t, sol });
          if (variants.length && t <= settings.soMinChem) break;
        }
        if (!variants.length) { st.msg = 'Keine Elf mit genug Chemie gefunden – Mindest-Chemie senken.'; return; }
        // Varianten: höchste Chemie und höchstes Rating (falls verschieden)
        const byChem = variants[0];
        const byRating = [...variants].sort((a, b) => b.sol.ev.ratingRaw - a.sol.ev.ratingRaw || b.sol.ev.chem.total - a.sol.ev.chem.total)[0];
        st.res = { f, positions, pool, list: byRating === byChem ? [byChem] : [byChem, byRating] };
        st.msg = '';
      } catch (e) { st.msg = 'Fehler: ' + e.message; } finally { st.busy = false; render(); }
    }

    // Upgrades: Konzept-Spieler gleicher Position, besser bewertet, gleiche Liga oder Nation (Chemie bleibt ähnlich)
    async function upgrades() {
      const r = st.res && st.res.list[0];
      if (!r) return;
      st.busy = true; st.msg = 'Lade Marktspieler (einmal pro Sitzung, ca. 1–2 Min.) …'; render();
      try {
        if (typeof RATINGS !== 'undefined' && !RATINGS.get()) { try { await RATINGS.load(); } catch (e) { /* */ } }
        const con = await SBCUI.loadConcepts((m) => { st.msg = m; render(); });
        const out = [];
        r.sol.players.forEach((cur, i) => {
          if (!cur) return;
          const pos = st.res.positions[i];
          let best = null;
          for (const p of con.players) {
            if (p.rating <= cur.rating || !(p.positions || []).includes(pos)) continue;
            if (p.leagueId !== cur.leagueId && p.nationId !== cur.nationId) continue;
            SBCUI.conceptPrice(p);
            const gain = p.rating - cur.rating;
            const per = p.value / gain;
            if (!best || per < best.per) best = { p, gain, per, pos, cur };
          }
          if (best) out.push(best);
        });
        out.sort((a, b) => a.per - b.per);
        st.ups = out.slice(0, 6);
        st.msg = out.length ? '' : 'Keine passenden Upgrades gefunden.';
      } catch (e) { st.msg = 'Fehler: ' + e.message; } finally { st.busy = false; render(); }
    }

    function solHtml(v, i) {
      const ev = v.sol.ev;
      const rows = v.sol.players.map((p, k) => p ? `<div class="so-r"><span class="so-p">${esc(st.res.positions[k])}</span><span class="so-n"><b>${esc(p.rating)}</b> ${esc(p.name)}${p.untradeable ? ' <em>NH</em>' : ''}</span><span class="ch ch${ev.chem.per[k]}">${ev.chem.per[k]}</span></div>` : '').join('');
      return `<div class="so-v"><div class="so-h"><b>${i === 0 ? 'Beste Chemie' : 'Bestes Rating'}</b><span>Rating <b>${ev.rating}</b> · Chemie <b>${ev.chem.total}</b>/33</span></div>${rows}</div>`;
    }

    function render() {
      if (!box) return;
      const fs = formations();
      const cur = settings.soFormation;
      box.innerHTML = `<div class="fcpt-sgroup"><h4>⚽ Kader-Optimierer</h4>
        <div class="note" style="font-size:12px;color:var(--ink2)">Baut aus deinem Verein die stärkste Elf mit möglichst hoher Chemie. Setzt nichts ein – du stellst die Mannschaft in der Web App selbst auf.</div>
        <div class="fcpt-set"><span>Formation${st.active && st.active.formation ? `<small>Aktive Mannschaft: ${esc(label(st.active.formation))}</small>` : ''}</span>
          <select data-so="f"><option value="">Automatisch${st.active && st.active.formation && posOf(st.active.formation) ? ' (wie aktive)' : ''}</option>${fs.map((f) => `<option value="${f}" ${cur === f ? 'selected' : ''}>${esc(label(f))}</option>`).join('')}</select></div>
        <div class="fcpt-set"><span>Mindest-Chemie<small>Für die Variante „Bestes Rating“</small></span><input type="number" min="0" max="33" data-so="c" value="${settings.soMinChem}"></div>
        <button class="fcpt-bigbtn" data-so="run" ${st.busy ? 'disabled' : ''}>⚽ Beste Elf berechnen</button>
        ${st.msg ? `<div class="fcpt-stand">${esc(st.msg)}</div>` : ''}
        ${st.res ? `<div class="pt-note">Formation ${esc(label(st.res.f))} · aus ${fmt(st.res.pool.length)} Spielern</div>${st.res.list.map(solHtml).join('')}
          <button class="fcpt-smallbtn" data-so="ups" ${st.busy ? 'disabled' : ''}>💡 Günstige Upgrades vom Markt suchen</button>` : ''}
        ${st.ups && st.ups.length ? `<div class="pt-h">Günstigste Upgrades (Chemie bleibt ähnlich)</div>${st.ups.map((u) => `<div class="pt-r"><span>${esc(u.pos)}: ${esc(u.cur.rating)} ${esc(u.cur.name)} → <b>${esc(u.p.rating)} ${esc(u.p.name)}</b></span><span>+${u.gain} · ≈ ${fmt(Math.round(u.p.value))}</span></div>`).join('')}
          <div class="pt-note">Preise teils geschätzt (Futbin, günstigste Karte je Rating) – vor dem Kauf prüfen.</div>` : ''}
      </div>`;
      const on = (sel, ev, fn) => { const x = box.querySelector(sel); if (x) x.addEventListener(ev, (e) => { e.stopPropagation(); fn(x); }); };
      on('[data-so="f"]', 'change', (x) => { settings.soFormation = x.value; saveSettings(); });
      on('[data-so="c"]', 'change', (x) => { settings.soMinChem = Math.max(0, Math.min(33, parseInt(x.value, 10) || 0)); saveSettings(); });
      on('[data-so="run"]', 'click', () => run());
      on('[data-so="ups"]', 'click', () => upgrades());
    }
    function mount(el) { box = el; render(); }
    return { mount };
  })();
