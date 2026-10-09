  // ==================================================================
  // GALERIE-PLANER (eigener Ersatz – die FUT-Galerie gibt es nicht in der Web App)
  // Du legst deine Sets an (Liga / Verein / Nation) und trägst aus dem Spiel ein:
  // aktuelle Punkte + Punkte für die nächste Note (+ Tokens). Das Tool rechnet:
  //  • welche eigenen Vereinskarten passen (kostenlos einsetzbar)
  //  • die günstigsten Marktkarten, um die Lücke zu schließen – und was sie dich nach
  //    dem Wiederverkauf wirklich kosten (Karten zählen in der Galerie weiter)
  //  • „Günstigste nächste Tokens“: alle Sets sortiert nach Münzen pro Token
  // Kauft und setzt nichts.
  // ==================================================================
  // eslint-disable-next-line no-var
  var GALLERY = (() => {
    if (!Array.isArray(settings.galSets)) settings.galSets = [];
    const st = { msg: '', busy: false, q: '', hits: null, res: {}, open: null, club: null };
    let box = null;
    const TYPES = { leagueId: 'Liga', clubId: 'Verein', nationId: 'Nation' };

    // Namen von Liga/Verein/Nation über EAs Übersetzungen (falls vorhanden)
    function nameOf(type, id) {
      try {
        const L = W.services && W.services.Localization;
        if (L && typeof L.localize === 'function') {
          const keys = type === 'leagueId' ? [`global.leagueFull.2027.league${id}`, `global.leagueFull.2026.league${id}`, `global.leagueabbr5.2027.league${id}`]
            : type === 'clubId' ? [`global.teamFull.2027.team${id}`, `global.teamFull.2026.team${id}`, `global.teamabbr15.2027.team${id}`]
              : [`search.nationName.nation${id}`, `global.nationFull.nation${id}`];
          for (const k of keys) { const v = L.localize(k); if (v && v !== k && !/^\*/.test(v) && !/\./.test(v)) return v; }
        }
      } catch (e) { /* */ }
      return null;
    }
    const scoreOf = (p) => { const r = SBCUI.CAP.raw.get(p.id) || {}; return typeof r.gradingScore === 'number' && r.gradingScore > 0 ? r.gradingScore : POINTS.baseScore(p.rating); };
    const fits = (s, p) => Number(p[s.type]) === Number(s.id);

    // ---------- Set anlegen: über einen Spieler aus deinem Verein ----------
    async function findPlayers() {
      const q = st.q.trim().toLowerCase();
      if (q.length < 2) return;
      st.busy = true; st.msg = 'Lade Verein …'; render();
      try {
        st.club = st.club || await SBCUI.loadClub((m) => { st.msg = m; render(); }, false);
        st.hits = st.club.players.filter((p) => String(p.name).toLowerCase().includes(q) || String(p.fullName || '').toLowerCase().includes(q)).slice(0, 8);
        st.msg = st.hits.length ? '' : 'Kein Spieler mit diesem Namen in deinem Verein.';
      } catch (e) { st.msg = 'Fehler: ' + e.message; } finally { st.busy = false; render(); }
    }
    function addSet(p, type) {
      const id = p[type];
      if (id == null) { showToast('Für diesen Spieler fehlt die Angabe', true); return; }
      if (settings.galSets.some((s) => s.type === type && Number(s.id) === Number(id))) { showToast('Dieses Set gibt es schon'); return; }
      const nm = nameOf(type, id);
      settings.galSets.push({ type, id: Number(id), label: nm || `${TYPES[type]} von ${p.name}`, score: 0, need: 0, tokens: 0 });
      saveSettings(); st.hits = null; st.q = ''; render();
    }

    // ---------- Rechnen ----------
    async function plan(s, quiet) {
      const gap = Math.max(0, (s.need || 0) - (s.score || 0));
      st.busy = true; if (!quiet) { st.msg = 'Lade Verein und Marktspieler (einmal pro Sitzung, ca. 1–2 Min.) …'; render(); }
      try {
        st.club = st.club || await SBCUI.loadClub(() => {}, false);
        const own = st.club.players.filter((p) => fits(s, p) && !(p.loans > 0)).map((p) => ({ p, sc: scoreOf(p) })).sort((a, b) => b.sc - a.sc);
        let res = { own: own.slice(0, 12), ownPts: own.reduce((a, x) => a + x.sc, 0), gap };
        if (gap > 0) {
          if (typeof RATINGS !== 'undefined' && !RATINGS.get()) { try { await RATINGS.load(); } catch (e) { /* */ } }
          const con = await SBCUI.loadConcepts((m) => { if (!quiet) { st.msg = m; render(); } });
          const pool = con.players.filter((p) => fits(s, p)).map((p) => { SBCUI.conceptPrice(p); const sc = scoreOf(p); return { p, sc, cost: p.value }; }).filter((x) => x.sc > 0 && x.cost > 0);
          // Kosten nach Wiederverkauf (Steuer) zählen – Karten bleiben in der Galerie
          const loss = (x) => Math.max(1, x.cost - afterTax(x.cost));
          pool.sort((a, b) => loss(a) / a.sc - loss(b) / b.sc);
          let g = gap; const pick = [];
          while (g > 0 && pick.length < 40) {
            const one = pool.filter((y) => y.sc >= g && !pick.includes(y)).sort((a, b) => loss(a) - loss(b))[0];
            const nxt = pool.find((y) => !pick.includes(y));
            if (!nxt && !one) break;
            if (one && (!nxt || loss(one) <= loss(nxt) * Math.ceil(g / nxt.sc))) { pick.push(one); g -= one.sc; break; }
            pick.push(nxt); g -= nxt.sc;
          }
          res = Object.assign(res, g > 0 ? { err: 'Mit Marktkarten dieses Sets nicht erreichbar (zu wenige Karten gefunden).' } : {
            pick, buy: pick.reduce((a, x) => a + x.cost, 0), net: pick.reduce((a, x) => a + loss(x), 0),
          });
        }
        st.res[s.id + s.type] = res;
        if (!quiet) st.msg = '';
      } catch (e) { st.res[s.id + s.type] = { err: e.message }; st.msg = ''; } finally { st.busy = false; render(); }
    }
    async function planAll() {
      const L = settings.galSets.filter((s) => s.need > s.score);
      if (!L.length) { st.msg = 'Bei keinem Set ist „nächste Note bei“ größer als „Punkte jetzt“ eingetragen.'; render(); return; }
      st.msg = 'Rechne alle Sets …'; render();
      for (const s of L) { await plan(s, true); }
      st.msg = ''; render();
    }

    // ---------- Oberfläche ----------
    function setHtml(s) {
      const k = s.id + s.type;
      const r = st.res[k];
      const open = st.open === k;
      const gap = Math.max(0, (s.need || 0) - (s.score || 0));
      const perTok = r && r.net != null && s.tokens ? Math.round(r.net / s.tokens) : null;
      return `<div class="ev ${open ? 'open' : ''}"><div class="ev-h" data-gl="${k}"><b>${esc(s.label)}</b><span>${s.need ? (gap ? `noch ${fmt(gap)} 💎` : '✓ erreicht') : 'Punkte eintragen'}${r && r.net != null ? ` · ≈ ${fmt(Math.round(r.net))} Münzen` : ''}${perTok ? ` · ${fmt(perTok)}/Token` : ''}</span></div>
        ${open ? `<div class="ev-b">
          <div class="gl-in">
            <label>Punkte jetzt<input type="number" min="0" step="100" data-gf="score" data-gk="${k}" value="${s.score || ''}" placeholder="aus dem Spiel"></label>
            <label>Nächste Note bei<input type="number" min="0" step="100" data-gf="need" data-gk="${k}" value="${s.need || ''}" placeholder="z. B. 60000"></label>
            <label>Tokens dafür<input type="number" min="0" step="1" data-gf="tokens" data-gk="${k}" value="${s.tokens || ''}" placeholder="optional"></label>
          </div>
          <div class="btns2"><button class="fcpt-smallbtn go" data-glp="${k}" ${st.busy ? 'disabled' : ''}>💰 Günstigsten Weg berechnen</button><button class="fcpt-smallbtn" data-glx="${k}">Set löschen</button></div>
          ${r && r.err ? `<div class="pt-note">${esc(r.err)}</div>` : ''}
          ${r && r.pick ? `<div class="pt-h">🛒 ${r.pick.length} Karte(n) kaufen ≈ ${fmt(Math.round(r.buy))} – nach Wiederverkauf nur ≈ <b>${fmt(Math.round(r.net))}</b> Verlust</div>
            ${r.pick.map((x) => `<div class="pt-r"><span><b>${esc(x.p.rating)}</b> ${esc(x.p.name)}</span><span>+${fmt(x.sc)} 💎 · ≈ ${fmt(Math.round(x.cost))}</span></div>`).join('')}
            <div class="pt-note">Kaufen → in der Galerie einsetzen → wieder verkaufen. Die Karte zählt weiter.</div>` : ''}
          ${r && r.own && r.own.length ? `<div class="pt-h">Aus deinem Verein (kostenlos, falls noch nicht eingesetzt) · zusammen ${fmt(r.ownPts)} 💎</div>
            ${r.own.map((x) => `<div class="pt-r"><span><b>${esc(x.p.rating)}</b> ${esc(x.p.name)}${x.p.untradeable ? ' <em>NH</em>' : ''}</span><span>${fmt(x.sc)} 💎</span></div>`).join('')}` : ''}
        </div>` : ''}</div>`;
    }
    function render() {
      if (!box) return;
      const L = settings.galSets;
      const ranked = L.map((s) => ({ s, r: st.res[s.id + s.type] })).filter((x) => x.r && x.r.net != null && x.s.tokens).sort((a, b) => a.r.net / a.s.tokens - b.r.net / b.s.tokens);
      box.innerHTML = `<div class="fcpt-sgroup"><h4>🖼️ Galerie-Planer</h4>
        <div class="note" style="font-size:12px;color:var(--ink2)">Die FUT-Galerie gibt es nicht in der Web App – darum hier selbst planen: Set anlegen, aus dem Spiel „Punkte jetzt“ und „nächste Note bei“ eintragen. Das Tool zeigt passende eigene Karten und die günstigsten Marktkarten. Gekaufte Karten zählen in der Galerie weiter, auch wenn du sie wieder verkaufst – echte Kosten sind meist nur die 5 % Steuer.</div>
        <div class="ntfy-row"><input type="text" data-gq="1" placeholder="Set anlegen: Spieler aus deinem Verein, z. B. Kane" value="${esc(st.q)}"><button class="fcpt-smallbtn go" data-gs="1" ${st.busy ? 'disabled' : ''}>🔎</button></div>
        ${st.hits && st.hits.length ? `<div class="wl-res">${st.hits.map((p, i) => `<div class="gl-hit"><span><b>${esc(p.rating)}</b> ${esc(p.name)}</span><span>${Object.keys(TYPES).map((t) => `<button class="fcpt-smallbtn" data-ga="${i}:${t}">+ ${TYPES[t]}</button>`).join('')}</span></div>`).join('')}</div>` : ''}
        ${st.msg ? `<div class="fcpt-stand">${esc(st.msg)}</div>` : ''}
        ${ranked.length ? `<div class="pt-h">💡 Günstigste nächste Tokens</div>${ranked.map((x) => `<div class="pt-r"><span>${esc(x.s.label)} · +${x.s.tokens} Tokens</span><span><b>${fmt(Math.round(x.r.net))}</b> · ${fmt(Math.round(x.r.net / x.s.tokens))}/Token</span></div>`).join('')}` : ''}
        ${L.length ? `<div>${L.map(setHtml).join('')}</div><button class="fcpt-smallbtn" data-gall="1" ${st.busy ? 'disabled' : ''}>💰 Alle Sets berechnen</button>` : '<div class="note" style="font-size:12px;color:#7d8aa0">Noch kein Set. Spieler suchen und „+ Liga“, „+ Verein“ oder „+ Nation“ wählen.</div>'}
      </div>`;
      const q = box.querySelector('[data-gq]');
      q.addEventListener('input', () => { st.q = q.value; });
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); st.q = q.value; findPlayers(); } });
      box.querySelector('[data-gs]').addEventListener('click', (e) => { e.stopPropagation(); st.q = q.value; findPlayers(); });
      box.querySelectorAll('[data-ga]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); const [i, t] = b.dataset.ga.split(':'); addSet(st.hits[+i], t); }));
      const byK = (k) => settings.galSets.find((s) => s.id + s.type === k);
      box.querySelectorAll('[data-gl]').forEach((h) => h.addEventListener('click', (e) => { e.stopPropagation(); st.open = st.open === h.dataset.gl ? null : h.dataset.gl; render(); }));
      box.querySelectorAll('[data-gf]').forEach((i) => i.addEventListener('change', (e) => { e.stopPropagation(); const s = byK(i.dataset.gk); if (!s) return; s[i.dataset.gf] = Math.max(0, parseInt(i.value, 10) || 0); delete st.res[i.dataset.gk]; saveSettings(); setTimeout(render, 0); }));
      box.querySelectorAll('[data-glp]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); const s = byK(b.dataset.glp); if (s) plan(s); }));
      box.querySelectorAll('[data-glx]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); settings.galSets = settings.galSets.filter((s) => s.id + s.type !== b.dataset.glx); saveSettings(); render(); }));
      const all = box.querySelector('[data-gall]');
      if (all) all.addEventListener('click', (e) => { e.stopPropagation(); planAll(); });
    }
    function mount(el) { box = el; render(); }
    const diag = () => ({ sets: settings.galSets.map((s) => ({ type: s.type, id: s.id, label: s.label })), names: settings.galSets.slice(0, 3).map((s) => nameOf(s.type, s.id)) });
    return { mount, diag };
  })();
