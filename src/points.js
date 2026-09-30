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
      // „gradingScore“ gehört vermutlich zur FUT-Galerie, nicht zur SBC – nur eindeutige SBC-Felder übernehmen
      for (const k of Object.keys(raw)) if (/sbc.?score|item.?score|submit.?score/i.test(k) && typeof raw[k] === 'number' && raw[k] > 0) return { v: raw[k], live: true };
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
          const done = Number(c.submittedScore) || 0;
          return { v: Math.max(1, req - done), total: req, done, name: c.name || 'SBC' };
        }
        const id = SBCUI.CAP.currentId;
        const ch = id != null ? SBCUI.CAP.challenges.get(id) : null;
        if (ch && Number(ch.scoreRequirement) > 0) return { v: Math.max(1, ch.scoreRequirement - (Number(ch.submittedScore) || 0)), total: ch.scoreRequirement, done: Number(ch.submittedScore) || 0, name: ch.name };
        if (!ch || !Array.isArray(ch.elgReq)) return null;
        const e = ch.elgReq.find((x) => /SCORE|POINT|GEM/i.test(String(x.type || '')));
        return e && e.eligibilityValue > 0 ? { v: e.eligibilityValue, name: ch.name } : null;
      } catch (e) { return null; }
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
        const c = await SBCUI.loadClub((m) => { state.msg = m; render(); }, false);
        let act = new Set();
        if (settings.sbcProtectActive !== false) { state.msg = 'Lese aktive Mannschaft …'; render(); act = await SBCUI.activeSquadIds(); }
        const locked = new Set((settings.sbcLocked || []).map((x) => x.id));
        const minO = settings.ptsMinOvr || 0;
        let pool = c.players.filter((p) => !(p.loans > 0) && !locked.has(p.id) && !act.has(p.id) && (settings.sbcSpecials || !p.special) && (p.rating || 0) >= minO)
          .map((p) => { const sc = scoreOf(p); return { p, score: sc.v, live: sc.live, cost: Math.max(1, p.cost) }; })
          .filter((x) => x.score > 0);
        // große Vereine: nur die günstigsten pro Punkt behalten (Rechner bleibt schnell)
        pool.sort((a, b) => a.cost / a.score - b.cost / b.score);
        if (pool.length > 1200) pool = pool.slice(0, 1200);
        let buys = [];
        if (settings.ptsBuy) {
          let rp = RATINGS.get();
          if (!rp) { state.msg = 'Lade Rating-Preise von Futbin …'; render(); try { rp = await RATINGS.load(); } catch (e) { rp = null; } }
          if (rp) buys = Object.keys(rp.prices).map(Number).filter((r) => r >= minO && base(r) > 0).map((r) => ({ rating: r, price: rp.prices[r], score: base(r) }));
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
          state.res = { target, pts, own, buy, used: res.used.sort((a, b) => b.score - a.score), bought: res.bought, onlyBuy: onlyBuy ? onlyBuy.cost : null, live: pool.some((x) => x.live) };
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
        <div class="pt-note">${r.live ? 'Punkte teils direkt von EA gelesen.' : 'Punkte laut Community-Tabelle (Sonderkarten zählen im Spiel oft mehr – dann reicht evtl. weniger).'} Karten wählst du in der SBC selbst aus; Teilabgaben sind erlaubt.</div>
      </div>`;
    }

    function render() {
      if (!box) return;
      const d = detectTarget();
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
      on('[data-pt="run"]', 'click', () => run());
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
