  // ==================================================================
  // PUNKTE-SBC („Streamlined SBC“, Diamanten / Item Score) – FC 27
  // Keine Chemie/Positionen: Karten abgeben, bis die Punktzahl erreicht ist.
  // Rechner: günstigste Auswahl aus deinem Verein + optional Futter kaufen.
  // Punkte je Rating laut Community-Messungen (EA veröffentlicht keine Tabelle).
  // ==================================================================
  const POINTS = (() => {
    const TABLE = { 99: 100000, 98: 90000, 97: 85000, 96: 55000, 95: 40000, 94: 30000, 93: 25000, 92: 20000, 91: 19000, 90: 14000,
      89: 11000, 88: 8300, 87: 5500, 86: 4100, 85: 2100, 84: 830, 83: 410, 82: 340, 81: 280, 80: 180, 79: 160, 78: 140, 77: 120, 76: 100, 75: 90 };
    const base = (r) => (r == null ? 0 : r >= 75 ? (TABLE[Math.min(99, r)] || 0) : r >= 65 ? 35 : 20);
    if (settings.ptsTarget === undefined) settings.ptsTarget = 10000;
    if (settings.ptsMinOvr === undefined) settings.ptsMinOvr = 0;
    if (settings.ptsBuy === undefined) settings.ptsBuy = true;

    // Punkte einer Karte: falls EA den Wert mitliefert, den nehmen, sonst Tabelle
    function scoreOf(p) {
      const raw = (SBCUI.CAP && SBCUI.CAP.raw && SBCUI.CAP.raw.get(p.id)) || {};
      // EA liefert den Diamanten-Wert als „gradingScore“ (per Diagnose bestätigt: 88 = 8.300, 84 = 830 …)
      if (typeof raw.gradingScore === 'number' && raw.gradingScore > 0) return { v: raw.gradingScore, live: true };
      return { v: base(p.rating), live: false };
    }

    // Ziel aus der geöffneten Aufgabe erkennen (Anforderung mit „SCORE“ im Namen)
    function detectTarget() {
      try {
        // FC 27: die Aufgabe selbst hat „scoreRequirement“ und „submittedScore“ (bereits abgegeben)
        const ctx = SBCUI.findSbcContext();
        const c = ctx && ctx.challenge;
        const req = c && Number(c.scoreRequirement);
        if (req > 0) {
          let done = Number(c.submittedScore) || 0;
          // Wiederholbare SBC schon abgeschlossen -> die nächste Runde beginnt wieder bei 0
          if (c.repeatable && (String(c.status).toUpperCase() === 'COMPLETED' || done >= req)) done = 0;
          return Object.assign({ v: Math.max(1, req - done), total: req, done, name: c.name || 'SBC', oneClick: c.type === 'ONE_CLICK_CHALLENGE', id: c.id }, ovrBounds(c.id));
        }
        const id = SBCUI.CAP.currentId;
        const ch = id != null ? SBCUI.CAP.challenges.get(id) : null;
        if (ch && Number(ch.scoreRequirement) > 0) return { v: Math.max(1, ch.scoreRequirement - (Number(ch.submittedScore) || 0)), total: ch.scoreRequirement, done: Number(ch.submittedScore) || 0, name: ch.name };
        if (!ch || !Array.isArray(ch.elgReq)) return null;
        const e = ch.elgReq.find((x) => /SCORE|POINT|GEM/i.test(String(x.type || '')));
        return e && e.eligibilityValue > 0 ? { v: e.eligibilityValue, name: ch.name } : null;
      } catch (e) { return null; }
    }

    // OVR-Grenzen der Aufgabe (Eintrag „ACADEMY_PLAYER_SLOTTING“ mit SCOPE: 0 = mind., 1 = max., 2 = genau)
    // z. B. „Bronze- und Silber-Neu-Ziehung“: max. 74
    function ovrBounds(id) {
      const ch = SBCUI.CAP.challenges.get(id);
      const L = (ch && ch.elgReq) || [];
      const e = L.find((x) => x.type === 'ACADEMY_PLAYER_SLOTTING' || x.eligibilityKey === 40);
      if (!e) return {};
      const sc = L.find((x) => x.eligibilitySlot === e.eligibilitySlot && (x.type === 'SCOPE' || x.eligibilityKey === 13));
      const scope = sc ? sc.eligibilityValue : 0;
      const v = e.eligibilityValue;
      if (scope === 1) return { maxOvr: v };
      if (scope === 2) return { minOvr: v, maxOvr: v };
      return v > 45 ? { minOvr: v } : {};
    }

    // Günstigste Auswahl: 0/1-Rucksack über den Verein + beliebig viele Kauf-Karten je Rating
    function solve(club, buys, target, U = 5) {
      const cap = Math.max(1, Math.ceil(target / U));
      const INF = 1e15;
      const dp = new Float64Array(cap + 1).fill(INF); dp[0] = 0;
      const words = Math.ceil((cap + 1) / 32);
      const take = [], capFrom = new Int32Array(club.length).fill(-1), W = [];
      club.forEach((it, i) => {
        const w = Math.max(1, Math.floor(it.score / U)); W.push(w);
        const bits = new Uint32Array(words);
        for (let s = cap - 1; s >= 0; s--) {
          if (dp[s] >= INF) continue;
          const ns = Math.min(cap, s + w), v = dp[s] + it.cost;
          if (v < dp[ns]) { dp[ns] = v; bits[ns >> 5] |= 1 << (ns & 31); if (ns === cap) capFrom[i] = s; }
        }
        take.push(bits);
      });
      const bPrev = new Int32Array(cap + 1).fill(-1), bItem = new Int16Array(cap + 1).fill(-1);
      const bw = buys.map((b) => Math.max(1, Math.floor(b.score / U)));
      for (let s = 0; s < cap; s++) {
        if (dp[s] >= INF) continue;
        buys.forEach((b, j) => {
          const ns = Math.min(cap, s + bw[j]), v = dp[s] + b.price;
          if (v < dp[ns]) { dp[ns] = v; bPrev[ns] = s; bItem[ns] = j; }
        });
      }
      if (dp[cap] >= INF) return null;
      let s = cap;
      const bought = [];
      while (bItem[s] >= 0) { bought.push(buys[bItem[s]]); s = bPrev[s]; }
      const used = [];
      for (let i = club.length - 1; i >= 0 && s > 0; i--) {
        if (take[i][s >> 5] & (1 << (s & 31))) { used.push(club[i]); s = s === cap ? capFrom[i] : s - W[i]; }
      }
      return { cost: dp[cap], used, bought };
    }

    let box = null, state = { msg: '', res: null, busy: false };
    async function run() {
      if (state.busy) return;
      const target = Math.max(1, parseInt(settings.ptsTarget, 10) || 0);
      state.busy = true; state.res = null; state.msg = 'Lade Verein …'; render();
      try {
        const c = await SBCUI.loadClub((m) => { state.msg = m; render(); }, !!state.reload);
        state.reload = false; state.club = c;
        let act = new Set();
        if (settings.sbcProtectActive !== false) { state.msg = 'Lese aktive Mannschaft …'; render(); act = await SBCUI.activeSquadIds(); }
        const locked = new Set((settings.sbcLocked || []).map((x) => x.id));
        const d = detectTarget() || {};
        const minO = Math.max(settings.ptsMinOvr || 0, d.minOvr || 0);
        const maxO = d.maxOvr || 99;
        let pool = c.players.filter((p) => !(p.loans > 0) && !locked.has(p.id) && !act.has(p.id) && (settings.sbcSpecials || !p.special) && (p.rating || 0) >= minO && (p.rating || 0) <= maxO)
          .map((p) => { const sc = scoreOf(p); return { p, score: sc.v, live: sc.live, cost: Math.max(1, p.cost) }; })
          .filter((x) => x.score > 0);
        // große Vereine: nur die günstigsten pro Punkt behalten (Rechner bleibt schnell)
        pool.sort((a, b) => a.cost / a.score - b.cost / b.score);
        if (pool.length > 1200) pool = pool.slice(0, 1200);
        let buys = [];
        if (settings.ptsBuy) {
          let rp = RATINGS.get();
          if (!rp) { state.msg = 'Lade Rating-Preise von Futbin …'; render(); try { rp = await RATINGS.load(); } catch (e) { rp = null; } }
          if (rp) buys = Object.keys(rp.prices).map(Number).filter((r) => r >= minO && r <= maxO && base(r) > 0).map((r) => ({ rating: r, price: rp.prices[r], score: base(r) }));
        }
        state.msg = `Rechne mit ${pool.length} Karten${buys.length ? ` + Kauf-Futter (${buys.length} Ratings)` : ''} …`; render();
        await sleep(30);
        const res = solve(pool, buys, target);
        const onlyBuy = buys.length ? solve([], buys, target) : null;
        if (!res) { state.msg = 'Ziel nicht erreichbar – Futter kaufen einschalten oder Min. OVR senken.'; }
        else {
          const pts = res.used.reduce((a, x) => a + x.score, 0) + res.bought.reduce((a, b) => a + b.score, 0);
          const own = res.used.reduce((a, x) => a + x.p.value, 0);
          const buy = res.bought.reduce((a, b) => a + b.price, 0);
          state.res = { target, pts, own, buy, challengeId: d.id, oneClick: !!d.oneClick, ownPts: res.used.reduce((a, x) => a + x.score, 0), bounds: d.maxOvr || d.minOvr ? `${d.minOvr ? `mind. ${d.minOvr}` : ''}${d.minOvr && d.maxOvr ? ', ' : ''}${d.maxOvr ? `max. ${d.maxOvr}` : ''} OVR` : '', used: res.used.sort((a, b) => b.score - a.score), bought: res.bought, onlyBuy: onlyBuy ? onlyBuy.cost : null, live: pool.some((x) => x.live) };
          state.msg = '';
        }
      } catch (e) { state.msg = 'Fehler: ' + e.message; } finally { state.busy = false; render(); }
    }

    function resHtml() {
      const r = state.res;
      if (!r) return '';
      const grp = {};
      r.bought.forEach((b) => { const g = grp[b.rating] || (grp[b.rating] = { n: 0, price: b.price, score: b.score }); g.n++; });
      const buyRows = Object.keys(grp).map(Number).sort((a, b) => b - a).map((k) => `<div class="pt-r"><span>${grp[k].n}× ${k}er kaufen</span><span>je ≈ ${fmt(grp[k].price)} · ${fmt(grp[k].score)} 💎</span></div>`).join('');
      const own = r.used.map((x) => `<div class="pt-r"><span><b>${esc(x.p.rating)}</b> ${esc(x.p.name)}${x.p.untradeable ? ' <em>NH</em>' : ''}${x.p.dup ? ' <em>Dup</em>' : ''}</span><span>${fmt(x.score)} 💎 · ${fmt(Math.round(x.p.value))}</span></div>`).join('');
      const save = r.onlyBuy != null ? r.onlyBuy - (r.own + r.buy) : null;
      return `<div class="pt-res">
        <div class="pt-sum"><div><span>Punkte</span><b>${fmt(r.pts)} / ${fmt(r.target)}</b></div><div><span>Eigene Karten</span><b>${fmt(Math.round(r.own))}</b></div><div><span>Kaufen</span><b>${fmt(Math.round(r.buy))}</b></div></div>
        ${save != null && save > 0 ? `<div class="pt-note">Komplett mit Kauf-Futter ≈ <b>${fmt(Math.round(r.onlyBuy))}</b> – mit deinem Verein sparst du ≈ <b class="fcpt-pos-v">${fmt(Math.round(save))}</b>.</div>` : ''}
        ${buyRows ? `<div class="pt-h">🛒 Futter kaufen</div>${buyRows}` : ''}
        ${own ? `<div class="pt-h">Aus deinem Verein (${r.used.length})</div><div class="pt-list">${own}</div>` : ''}
        ${r.bounds ? `<div class="pt-note">Vorgabe der Aufgabe beachtet: ${esc(r.bounds)}</div>` : ''}
        <div class="pt-note">${r.live ? 'Punkte direkt von EA gelesen.' : 'Punkte laut Community-Tabelle.'} Teilabgaben sind erlaubt.</div>
        ${submitHtml(r)}
      </div>`;
    }

    // ---------- Abgeben (nur auf deinen Klick + Bestätigung) ----------
    // Welche Abgabe-Art ist gerade möglich? (wird bei jedem Zeichnen neu geprüft)
    function submitMode(r) {
      const cur = detectTarget();
      const ctx = SBCUI.findSbcContext();
      const ch = ctx && ctx.challenge;
      if (cur && cur.oneClick && W.services && W.services.SBC && typeof W.services.SBC.submitOneClickChallenge === 'function') {
        r.challengeId = cur.id; r.oneClick = true;
        return { mode: 'oneclick', cur };
      }
      if (ch && ctx.squad) return { mode: 'squad', cur, ch };
      return { mode: 'none', cur };
    }
    function submitHtml(r) {
      if (!r.used.length) return '';
      const m = submitMode(r);
      if (m.mode === 'none') {
        return `<div class="pt-open"><b>Zum Einsetzen die SBC öffnen</b><span>Öffne in der Web App die Diamanten-SBC selbst (die Aufgabe mit der Punktzahl). Dann hier auf „Günstigste Auswahl berechnen“ tippen – danach erscheint der Knopf zum Einsetzen/Abgeben.</span></div>`;
      }
      if (m.mode === 'squad') {
        return `<button class="fcpt-bigbtn" data-pt="place" ${state.busy ? 'disabled' : ''}>🧩 ${r.used.length} Karte(n) in die SBC setzen</button>
          <div class="pt-note">Setzt die Karten in die geöffnete SBC. Abgeben/Einreichen machst du danach selbst in der Web App.</div>`;
      }
      if (state.confirm) {
        return `<div class="pt-confirm"><b>${r.used.length} Karte(n) mit ${fmt(r.ownPts)} 💎 abgeben?</b>
          <span>Wert zusammen ≈ ${fmt(Math.round(r.own))} Münzen${r.used.some((x) => !x.p.untradeable) ? ' · enthält handelbare Karten' : ''}. Die Karten sind danach weg – das lässt sich nicht rückgängig machen.</span>
          <div class="btns2"><button class="fcpt-smallbtn go" data-pt="yes">Ja, abgeben</button><button class="fcpt-smallbtn" data-pt="no">Abbrechen</button></div></div>`;
      }
      return `<button class="fcpt-bigbtn" data-pt="submit" ${state.busy ? 'disabled' : ''}>💎 Diese ${r.used.length} Karte(n) abgeben (${fmt(r.ownPts)} Punkte)</button>
        ${m.cur && m.cur.v && r.ownPts < m.cur.v ? `<div class="pt-note">Das sind ${fmt(r.ownPts)} von noch ${fmt(m.cur.v)} Punkten – Teilabgabe.</div>` : ''}
        ${r.bought.length ? '<div class="pt-note">Die Kauf-Karten fehlen noch – erst kaufen, dann neu berechnen. Du kannst die eigenen Karten aber schon jetzt abgeben (Teilabgabe).</div>' : ''}`;
    }
    async function place() {
      const r = state.res;
      if (!r) return;
      state.busy = true; state.msg = 'Setze Karten ein …'; render();
      try {
        await SBCUI.applyPlayers(r.used.map((x) => x.p));
        state.msg = `✓ ${r.used.length} Karte(n) eingesetzt – jetzt in der Web App prüfen und einreichen.`;
        showToast('🧩 Karten eingesetzt');
      } catch (e) { state.msg = 'Fehler: ' + e.message; } finally { state.busy = false; render(); }
    }
    const obs = (o, ms = 15000) => new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Zeitüberschreitung')), ms);
      o.observe(box, (ob, ev) => { clearTimeout(t); try { ob.unobserve(box); } catch (e) { /* */ } resolve(ev); });
    });
    function findSet(setId) {
      try {
        const sets = W.services.SBC.repository.sets;
        const vals = sets instanceof Map ? [...sets.values()] : Array.isArray(sets) ? sets : Object.values(sets || {});
        return vals.find((x) => x && x.id === setId) || null;
      } catch (e) { return null; }
    }
    async function submit() {
      const r = state.res;
      const ctx = SBCUI.findSbcContext();
      const ch = ctx && ctx.challenge;
      const S = W.services && W.services.SBC;
      if (!ch || (r.challengeId != null && ch.id !== r.challengeId) || !S || typeof S.submitOneClickChallenge !== 'function') { state.msg = 'Die Diamanten-SBC ist in der Web App nicht geöffnet – bitte die Aufgabe öffnen und erneut tippen.'; render(); return; }
      const ents = r.used.map((x) => state.club && state.club.ents.get(x.p.id)).filter(Boolean);
      if (ents.length !== r.used.length) { state.msg = 'Karten nicht mehr gefunden – bitte neu berechnen.'; render(); return; }
      state.busy = true; state.msg = 'Gebe ab …'; render();
      try {
        if (typeof ch.hasNotStarted === 'function' && ch.hasNotStarted() && typeof S.initiateOneClickChallenge === 'function') {
          const e0 = await obs(S.initiateOneClickChallenge(ch));
          if (e0 && e0.success === false) throw new Error(`EA hat den Start abgelehnt (${e0.status || '?'})`);
        }
        const set = findSet(ch.setId) || { id: ch.setId, totalSubmittedScore: 0 };
        let ev;
        try { ev = await obs(S.submitOneClickChallenge(ch, set, ents)); } catch (e) { ev = { success: false, error: e }; }
        // Falls EA IDs statt Karten erwartet: einmal mit IDs versuchen (nur wenn der erste Versuch abgelehnt wurde)
        if (ev && ev.success === false && ev.status !== 409 && ev.status >= 400 && ev.status < 500) {
          ev = await obs(S.submitOneClickChallenge(ch, set, ents.map((x) => x.id)));
        }
        if (ev && ev.success !== false) {
          const d = ev.data || {};
          showToast(d.challengeCompleted ? '💎 SBC abgeschlossen!' : `💎 Abgegeben – jetzt ${fmt(d.submittedScore ?? ch.submittedScore)} Punkte`);
          state.msg = d.challengeCompleted ? (ch.repeatable ? '✓ Runde abgeschlossen – Belohnung einsammeln. Für die nächste Runde einfach neu berechnen.' : '✓ SBC abgeschlossen – Belohnung einsammeln.') : `✓ Abgegeben. Stand: ${fmt(d.submittedScore ?? ch.submittedScore)} von ${fmt(ch.scoreRequirement)}.`;
          state.res = null; state.reload = true;
        } else if (ev && ev.status === 409) {
          state.msg = 'Einige Karten stecken noch in anderen SBC-Aufstellungen – dort entfernen oder sperren und neu berechnen.';
        } else {
          state.msg = `EA hat die Abgabe abgelehnt (${(ev && ev.status) || '?'}). Bitte „Diagnose kopieren“ schicken.`;
          log('Abgabe', ev);
        }
      } catch (e) { state.msg = 'Fehler: ' + e.message; } finally { state.busy = false; state.confirm = false; render(); }
    }

    function render() {
      if (!box) return;
      const d = detectTarget();
      if (d && d.id != null && state.autoFor !== `${d.id}:${d.v}`) { state.autoFor = `${d.id}:${d.v}`; settings.ptsTarget = d.v; saveSettings(); }
      const collapsed = !!box.closest('#fcpt-sbc') && !d && !state.res && !state.busy && !state.msg;
      box.innerHTML = `<details class="fcpt-sgroup pt-det" ${collapsed ? '' : 'open'}><summary><h4 style="display:inline">💎 Punkte-SBC (Diamanten)</h4></summary>
        <div class="note" style="font-size:12px;color:var(--ink2)">Neue FC-27-SBCs ohne Chemie: Karten abgeben, bis die Diamanten-Punkte erreicht sind. Das Tool sucht die günstigste Kombination aus deinem Verein – und rechnet Kauf-Futter mit ein.</div>
        <div class="fcpt-set"><span>Ziel-Punkte${d ? `<small>Aus „${esc(d.name)}“ erkannt: ${d.total ? `noch ${fmt(d.v)} von ${fmt(d.total)}` : fmt(d.v)}</small>` : '<small>Die Zahl neben dem Diamanten in der SBC</small>'}</span><input type="number" min="1" step="100" data-pt="target" value="${settings.ptsTarget}"></div>
        <div class="fcpt-set"><span>Min. OVR pro Karte<small>0 = keine Vorgabe</small></span><input type="number" min="0" max="99" data-pt="min" value="${settings.ptsMinOvr}"></div>
        <div class="fcpt-set"><span>Futter kaufen einrechnen<small>Günstigste Karte je Rating laut Futbin</small></span><input type="checkbox" class="fcpt-sw" data-pt="buy" ${settings.ptsBuy ? 'checked' : ''}></div>
        ${d && d.v !== settings.ptsTarget ? `<button class="fcpt-smallbtn" data-pt="use">Erkanntes Ziel ${fmt(d.v)} übernehmen</button>` : ''}
        <button class="fcpt-bigbtn" data-pt="run" ${state.busy ? 'disabled' : ''}>💎 Günstigste Auswahl berechnen</button>
        ${state.msg ? `<div class="fcpt-stand">${esc(state.msg)}</div>` : ''}
        ${resHtml()}
        ${cheapHtml()}
      </details>`;
      const on = (sel, ev, fn) => { const x = box.querySelector(sel); if (x) x.addEventListener(ev, (e) => { e.stopPropagation(); fn(x); }); };
      on('[data-pt="target"]', 'change', (x) => { settings.ptsTarget = Math.max(1, parseInt(x.value, 10) || 1); saveSettings(); });
      on('[data-pt="min"]', 'change', (x) => { settings.ptsMinOvr = Math.max(0, Math.min(99, parseInt(x.value, 10) || 0)); saveSettings(); });
      on('[data-pt="buy"]', 'change', (x) => { settings.ptsBuy = x.checked; saveSettings(); });
      on('[data-pt="use"]', 'click', () => { settings.ptsTarget = d.v; saveSettings(); render(); });
      on('[data-pt="run"]', 'click', () => { state.confirm = false; run(); });
      on('[data-pt="submit"]', 'click', () => { state.confirm = true; render(); });
      on('[data-pt="no"]', 'click', () => { state.confirm = false; render(); });
      on('[data-pt="yes"]', 'click', () => submit());
      on('[data-pt="place"]', 'click', () => place());
    }

    // Welches Rating ist gerade das günstigste Futter pro Punkt?
    function cheapHtml() {
      const rp = typeof RATINGS !== 'undefined' ? RATINGS.get() : null;
      if (!rp) return '<div class="pt-note">Tipp: Unter Verein › Rating-Preise laden, dann siehst du hier das günstigste Futter pro Punkt.</div>';
      const L = Object.keys(rp.prices).map(Number).filter((r) => base(r) > 0).map((r) => ({ r, per: rp.prices[r] / base(r) * 1000 })).sort((a, b) => a.per - b.per).slice(0, 4);
      if (!L.length) return '';
      return `<div class="pt-h">Günstigstes Futter pro 1.000 💎</div>${L.map((x, i) => `<div class="pt-r"><span>${i === 0 ? '⭐ ' : ''}${x.r}er</span><span>≈ ${fmt(Math.round(x.per))} Münzen</span></div>`).join('')}`;
    }

    function mount(el) { box = el; render(); }
    return { mount, solve, base, render };
  })();
