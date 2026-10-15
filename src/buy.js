  // ==================================================================
  // KAUFEN & BIETEN: eigene Ansicht im Tool. Ein Tipp = eine Suche (EAs Suche,
  // im Hintergrund unter dem Tool). Treffer erscheinen hier mit Gewinn,
  // Kaufen (mit Rückfrage) und Bieten (Betrag steht auf dem Knopf).
  // Nichts läuft von allein: jede Suche und jedes Gebot startest du.
  // ==================================================================
  // eslint-disable-next-line no-var
  var BUY = (() => {
    if (settings.buyConfirm === undefined) settings.buyConfirm = true;   // Kaufen: zweimal tippen
    if (settings.bidConfirm === undefined) settings.bidConfirm = false;  // Bieten: ein Tipp (Betrag steht drauf)
    if (settings.snipeArm === undefined) settings.snipeArm = true;       // bester Deal nach der Suche sofort kaufbereit (1× K)
    if (settings.snipeSound === undefined) settings.snipeSound = true;   // Ton bei lohnendem Treffer
    if (settings.snipeInstant === undefined) settings.snipeInstant = false;   // Treffer bis Max.-Sofortkauf sofort kaufen (1 Tipp)
    if (settings.snipeOneKey === undefined) settings.snipeOneKey = true;  // Leertaste: suchen – bei bereitem Deal kaufen
    if (settings.snipeMinProfit === undefined) settings.snipeMinProfit = 200;
    if (settings.snKind === undefined) settings.snKind = 'bin';     // 'bin' = Sofortkauf · 'bid' = Auktionen bieten
    if (settings.bdMaxMin === undefined) settings.bdMaxMin = 10;    // Bieten-Modus: nur Auktionen, die in so vielen Minuten enden
    let box = null;
    const st = { rows: [], msg: '', busy: false, t: 0, arm: null, armT: 0, armMs: 4000, label: '', sel: 0, lastSearch: 0,
      stats: { n: 0, hits: 0, buys: 0, miss: 0, ms: 0 }, log: [], flash: null };
    let actx = null;
    function beep() {
      if (!settings.snipeSound) return;
      try {
        actx = actx || new (W.AudioContext || W.webkitAudioContext)();
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.08;
        o.connect(g); g.connect(actx.destination); o.start();
        o.frequency.setValueAtTime(1320, actx.currentTime + 0.08);
        o.stop(actx.currentTime + 0.18);
      } catch (e) { /* */ }
    }
    function failTone() {
      if (!settings.snipeSound) return;
      try {
        actx = actx || new (W.AudioContext || W.webkitAudioContext)();
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'square'; o.frequency.value = 220; g.gain.value = 0.06;
        o.connect(g); g.connect(actx.destination); o.start();
        o.frequency.setValueAtTime(160, actx.currentTime + 0.12);
        o.stop(actx.currentTime + 0.3);
      } catch (e) { /* */ }
    }
    // Ergebnis eines Kaufversuchs deutlich anzeigen (Knopf färbt sich, Ton, Meldung, Liste)
    function result(r, ok, why) {
      st.log.unshift({ t: Date.now(), name: `${r.p.rating ?? ''} ${r.p.name}`.trim(), price: r.bin, ok, why });
      st.log = st.log.slice(0, 12);
      if (ok) st.stats.buys++; else st.stats.miss++;
      { const key = st.lastKey || { k: `${r.p.resourceId}-0`, name: null };
        stat({ k: key.k, name: key.name || `${r.p.rating ?? ''} ${r.p.name}`.trim() }, (e) => { if (ok) { e.buy++; e.spent += r.bin || 0; } else e.miss++; }); saveSettings(); }
      const short = String(why || '').replace(/ – .*/, '').slice(0, 28);
      st.flash = { ok, text: ok ? `✓ GEKAUFT ${fmt(r.bin)}` : '✗ VERPASST', sub: ok ? '' : short, until: Date.now() + 3500 };
      if (!ok) { failTone(); showToast(`✗ Nicht bekommen: ${r.p.name} ${fmt(r.bin)} – ${why}`, true); try { if (navigator.vibrate) navigator.vibrate([80, 60, 80]); } catch (e) { /* */ } }
      setTimeout(() => { if (st.flash && Date.now() >= st.flash.until) { st.flash = null; render(); } }, 3600);
    }
    // Ist gerade ein Deal kaufbereit, der mit derselben Taste gekauft werden darf?
    // (kurze Sperre, damit ein schon „unterwegs“ gedrückter Tastendruck nicht ungesehen kauft)
    const readyBuy = () => settings.snipeOneKey && st.arm && /^(buy|bid):/.test(st.arm) && st.armMs > 4000
      && Date.now() - st.armT > 180 && Date.now() - st.armT < st.armMs;
    // Nach einer Sperr-Antwort von EA: Zwangspause, damit das Konto nicht gesperrt wird
    const BLOCK = [403, 429, 458, 459, 460, 512, 521];
    function cooldown(status) { if (BLOCK.includes(Number(status))) { st.cool = Date.now() + (Number(status) === 458 ? 30000 : 90000); st.coolCode = status; } }
    const coolLeft = () => Math.max(0, Math.ceil(((st.cool || 0) - Date.now()) / 1000));
    function mainAction() {
      if (coolLeft()) { st.msg = `⛔ EA hat mit Code ${st.coolCode} geantwortet – Pause, noch ${coolLeft()} Sek. ${st.coolCode === 458 ? 'Bitte in der Web App die Prüfung (Captcha) erledigen.' : 'Danach langsamer suchen.'}`; render(); return; }
      if (readyBuy()) act(+st.arm.split(':')[1], st.arm.split(':')[0], true);
      else if (!(settings.snipeOneKey && st.arm && st.armMs > 4000 && Date.now() - st.armT <= 180)) search();
    }
    // ---------- TURBO: EAs eigene Marktsuche direkt aufrufen (ohne Seitenwechsel) ----------
    // Die Suchkriterien übernimmt das Tool, sobald du in der Web App einmal normal suchst.
    if (settings.snipeTurbo === undefined) settings.snipeTurbo = true;
    // Rating-Snipe: nur Karten mit bestimmtem Rating aus einer Suche OHNE Spielernamen (z. B. „Gold, alle Spieler“)
    if (settings.rfMin === undefined) settings.rfMin = 0;      // 0 = aus
    if (settings.rfMax === undefined) settings.rfMax = 0;      // 0 = keine Obergrenze
    if (settings.rfWin === undefined || (settings.rfWin === 35 && !settings.rfWinSet)) settings.rfWin = 15;   // Preisfenster in % unter dem Max.-Sofortkauf (klein = weniger fremde Karten)
    if (settings.rfPages === undefined) settings.rfPages = 1;
    if (settings.rfMode === undefined) settings.rfMode = 'rot';   // 'rot' = Spieler-Rotation (fängt neue Angebote) · 'win' = Preisfenster
    const ROT = { list: [], i: 0, cur: null, loading: false };
    if (!settings.rotExcl || typeof settings.rotExcl !== 'object') settings.rotExcl = {};   // asset -> 1 (von dir) | 'auto' (zu teuer)
    if (settings.rotFactor === undefined) settings.rotFactor = 1.5;   // Spieler entfernen, deren Futbin-Preis > Faktor × Max.-Preis
    const RCHK = { run: false, done: 0, total: 0 };
    const rotActive = () => ROT.list.filter((x) => !settings.rotExcl[x.asset]);
    function autoExclude(x) {
      const mx = settings.snMax || critMaxBuy();
      if (!mx || !x.fb || !settings.rotFactor) return;
      if (x.fb > mx * settings.rotFactor) { if (!settings.rotExcl[x.asset]) settings.rotExcl[x.asset] = 'auto'; }
      else if (settings.rotExcl[x.asset] === 'auto') delete settings.rotExcl[x.asset];
    }
    // Futbin-Preise der Liste prüfen (schonend, eigene Warteschlange) und zu teure automatisch entfernen
    async function rotPriceCheck() {
      if (RCHK.run) { RCHK.run = false; return; }
      const todo = ROT.list.filter((x) => !x.fb && !x.fbErr && settings.rotExcl[x.asset] !== 1);
      RCHK.run = true; RCHK.done = 0; RCHK.total = todo.length; render();
      for (const x of todo) {
        if (!RCHK.run) break;
        try { const v = await getPrice('futbin', { resourceId: x.rid || x.asset, name: x.name, fullName: x.name, rating: x.rating, isPlayer: true }, 'futbin:rot'); if (v) { x.fb = v; autoExclude(x); } else x.fbErr = 1; } catch (e) { x.fbErr = 1; if (/Schutzseite/.test(e.message)) { st.msg = e.message; break; } }
        RCHK.done++; if (RCHK.done % 3 === 0 || RCHK.done === RCHK.total) { saveSettings(); render(); }
      }
      RCHK.run = false; ROT.list.sort((a, b) => (b.fb || b.price) - (a.fb || a.price)); saveSettings(); render();
    }
    function rotListHtml() {
      if (!ROT.list.length) return '';
      const mx = settings.snMax || critMaxBuy();
      const act = rotActive().length, ex = ROT.list.length - act;
      return `<details class="by-rot"${ROT.open ? ' open' : ''}><summary>📋 Spielerliste: ${act} aktiv${ex ? ` · ${ex} entfernt` : ''}</summary>
        <div class="by-rot-tools"><button class="fcpt-smallbtn" data-rc="1">${RCHK.run ? `⏹ Stopp (${RCHK.done}/${RCHK.total})` : '💰 Preise prüfen (Futbin)'}</button>
          <label>zu teuer ab<input type="number" step="0.1" min="0" max="10" data-rf2="1" value="${settings.rotFactor}">× Max.-Preis${mx ? ` (> ${fmt(Math.round(mx * settings.rotFactor))})` : ''}</label>
          <button class="fcpt-smallbtn" data-rall="1">alle wieder rein</button></div>
        <div class="by-rot-list">${ROT.list.map((x) => { const e = settings.rotExcl[x.asset]; return `<div class="pt-r ${e ? 'ex' : ''}"><span><b>${x.rating}</b> ${esc(x.name)}</span><span>${x.fb ? fmt(x.fb) : x.fbErr ? '–' : `≈ ${fmt(x.price)}`}${e === 'auto' ? ' · zu teuer' : ''} <button class="by-rx" data-ra="${x.asset}" title="in „Meine Liste“ übernehmen (eigener Preis)">＋</button><button class="by-rx" data-rx="${x.asset}" title="${e ? 'wieder aufnehmen' : 'entfernen'}">${e ? '↺' : '✕'}</button></span></div>`; }).join('')}</div></details>`;
    }
    const rotOn = () => rfOn() && settings.rfMode === 'rot';
    async function loadRotation() {
      ROT.loading = true; st.msg = 'Lade alle Spieler mit diesem Rating (einmal pro Sitzung, ca. 1–2 Min.) …'; render();
      try {
        const con = await SBCUI.loadConcepts((m) => { st.msg = m; render(); }, ROT.reload);
        ROT.reload = true;   // beim nächsten „Liste neu“ wirklich neu laden
        const lo = settings.rfMin, hi = settings.rfMax || 99;
        const seen = new Set();
        ROT.list = con.players.filter((p) => p.rating >= lo && p.rating <= hi && p.assetId != null && !seen.has(p.assetId) && seen.add(p.assetId))
          .map((p) => { SBCUI.conceptPrice(p); return { name: p.name, rating: p.rating, asset: p.assetId, rid: p.resId || p.def || null, price: Math.round(p.value || 0) }; });
        // EAs Katalog liefert pro Abfrage nur ~180 Karten (höchstes Rating zuerst) -> zusätzlich je Liga abfragen
        const LEAGUES = [13, 53, 19, 31, 16, 350, 308, 10, 39, 14, 4, 68, 2216, 2222, 2215, 2228, 2218];
        let lg = 0;
        for (const id of LEAGUES) {
          st.msg = `Lade Spieler je Liga … (${LEAGUES.indexOf(id) + 1}/${LEAGUES.length}, bisher ${ROT.list.length})`; render();
          try {
            const ps = await SBCUI.conceptsByLeague(id);
            for (const p of ps) {
              if (p.rating < lo || p.rating > hi || p.assetId == null || seen.has(p.assetId)) continue;
              seen.add(p.assetId); lg++;
              SBCUI.conceptPrice(p);
              ROT.list.push({ name: p.name, rating: p.rating, asset: p.assetId, rid: p.resId || p.def || null, price: Math.round(p.value || 0) });
            }
          } catch (e) { log('Rotation Liga', id, e); }
          await sleep(250);
        }
        ROT.fromLeagues = lg;
        // Zusätzlich: günstigste Spieler je Rating von Futbin
        let fb = 0;
        try {
          st.msg = 'Lade günstigste Spieler je Rating von Futbin …'; render();
          const rd = await RATINGS.load(true);
          for (let r = lo; r <= Math.min(hi, 99); r++) {
            for (const x of ((rd && rd.players && rd.players[r]) || [])) {
              const aid = x.id % 16777216;   // Futbin-Bild-ID = Karten-ID (Sonderkarten: Basis-ID + n×2^24)
              if (seen.has(aid)) continue;
              seen.add(aid); fb++;
              ROT.list.push({ name: x.name, rating: r, asset: aid, rid: x.id, price: x.price || 0 });
            }
          }
        } catch (e) { log('Rotation Futbin', e); ROT.fbErr = e.message; }
        ROT.list.forEach((x) => { const c = cacheGet(`futbin:${settings.platform}:${x.rid || x.asset}`); if (c) { x.fb = c; autoExclude(x); } });
        ROT.list.sort((a, b) => (b.fb || b.price) - (a.fb || a.price));
        ROT.fromFutbin = fb; saveSettings();
        ROT.i = 0; ROT.cur = null; ROT.key = `${lo}-${hi}`;
        const dist = {};
        con.players.forEach((p) => { if (p.rating >= 80) dist[p.rating] = (dist[p.rating] || 0) + 1; });
        st.msg = ROT.list.length ? `${ROT.list.length} Spieler${lg || fb ? ` (${lg} aus Liga-Suche, ${fb} von Futbin)` : ''} mit Rating ${lo}${hi === 99 ? '+' : hi !== lo ? `–${hi}` : ''} geladen – jeder Tipp sucht den nächsten Spieler gezielt.`
          : `Keine Spieler mit Rating ${lo}${hi === 99 ? '+' : ''} gefunden. EA hat ${con.raw ?? '?'} Karten geliefert, ${con.players.length} normale, höchstes Rating ${con.maxRating || '–'}. ${Object.keys(dist).length ? 'Ab 80: ' + Object.keys(dist).sort().map((r) => `${r}er×${dist[r]}`).join(', ') : ''} · Liga-Suche: ${ROT.fromLeagues ?? 0} · Futbin: ${fb}${ROT.fbErr ? ` (${ROT.fbErr})` : ''} – bitte Screenshot an Claude.`;
      } catch (e) { st.msg = 'Fehler: ' + e.message; } finally { ROT.loading = false; render(); }
    }
    function rotRestore() { if (ROT.k && TC.crit) { TC.crit[ROT.k] = ROT.orig; ROT.k = null; ROT.cur = null; } }
    // Pro Suche den nächsten Spieler einsetzen (Feld für den Spieler in EAs Suchkriterien)
    function rotApply() {
      if (!rotOn() || !ROT.list.length || ROT.key !== `${settings.rfMin}-${settings.rfMax || 99}`) return false;
      const k = fld(/^masked_?def_?id$/i) || fld(/^def_?id$/i) || 'maskedDefId';
      if (ROT.k !== k) { ROT.k = k; ROT.orig = TC.crit[k]; }
      const act = ROT.list.filter((x) => !settings.rotExcl[x.asset]);
      if (!act.length) return false;
      ROT.cur = act[ROT.i % act.length]; ROT.i++;
      TC.crit[k] = ROT.cur.asset;
      return true;
    }   // Ergebnisseiten pro Suche (mehr = mehr Anfragen!)
    const rfOn = () => settings.rfMin > 0;
    const rfOk = (p) => !rfOn() || (p.isPlayer && p.rating >= settings.rfMin && (!settings.rfMax || p.rating <= settings.rfMax));
    const TC = { crit: null, at: 0, keys: [], hooked: false };
    const fld = (re) => (TC.crit ? Object.keys(TC.crit).find((k) => re.test(k)) : null);
    function hookSearch() {
      const S = W.services && W.services.Item;
      if (!S || typeof S.searchTransferMarket !== 'function') return;
      if (S.searchTransferMarket.__fcpt) { TC.hooked = true; return; }
      const orig = S.searchTransferMarket;
      const f = function (crit) {
        try { if (crit && typeof crit === 'object' && !f.own) { TC.crit = crit; TC.own = false; TC.at = Date.now(); TC.keys = Object.keys(crit).slice(0, 40); render(); } } catch (e) { /* */ }
        return orig.apply(this, arguments);
      };
      f.__fcpt = true; f.orig = orig;
      S.searchTransferMarket = f;
      TC.hooked = true;
    }
    hookSearch(); setInterval(hookSearch, 2000);
    // Cache von EA umgehen: Min.-Sofortkauf (bzw. Max.-Gebot) bei jeder Suche eine Stufe weiter
    // Kopie der Suchkriterien nur für die Anfrage – deine Felder in der Web App bleiben unverändert
    function cloneCrit(c) {
      try { const o = Object.create(Object.getPrototypeOf(c)); for (const k of Object.keys(c)) { const v = c[k]; o[k] = Array.isArray(v) ? v.slice() : v; } return o; } catch (e) { return c; }
    }
    // Cache von EA umgehen: jede Anfrage leicht anders, OHNE passende Angebote wegzufiltern. Zustand liegt im Tool, nicht in EAs Feldern.
    const BMP = { n: {}, win: 0, mb: 0, mx: 0, expect: 0, bad: 0 };
    // Prüfen, ob EA unser „Max. Gebot“ wirklich so abschickt (sonst automatisch auf den alten Trick wechseln)
    try {
      SBCUI.CAP.hooks.push((url) => {
        if (!BMP.expect || !/\/transfermarket\?/.test(url)) return;
        const m = String(url).match(/[?&]maxb=(\d+)/);
        const got = m ? +m[1] : 0;
        if (got === BMP.expect) { BMP.bad = 0; return; }
        if (++BMP.bad >= 2 && settings.cacheMode !== 'minbuy') {
          settings.cacheMode = 'minbuy'; saveSettings();
          showToast('Cache-Trick: EA ändert das Max. Gebot – Tool nutzt jetzt wieder „Min. Sofortkauf“ (nur weit unter deinem Max.-Preis).', true);
        }
      });
    } catch (e) { /* */ }
    function bumpCrit(c) {
      if (!c || !settings.bumpMinBin) return;
      const k = fld(/^min_?(buy|bin|buynow)$/i) || 'minBuy';
      const kd = fld(/^max_?bid$/i) || 'maxBid';
      const km = fld(/^max_?(buy|bin|buynow)$/i);
      const mb = km ? toNum(c[km]) || 0 : 0;
      BMP.expect = 0;
      if (settings.bumpField === 'maxBid') {
        const start = Math.max(1000, settings.bumpStart || 1000000);
        BMP.mx = BMP.mx < start || BMP.mx >= 14900000 ? start : BMP.mx + stepFor(BMP.mx);
        c[kd] = BMP.mx; return;
      }
      if (rfOn() && !rotOn() && mb > 0) {
        // Rating-Preisfenster: Min. Sofortkauf knapp unter dem Fenster, Cache-Trick nach UNTEN
        const base = roundPrice(mb * (1 - settings.rfWin / 100)), lo = Math.max(150, base - 6 * stepFor(base));
        BMP.win = BMP.win > base || BMP.win <= lo ? base : BMP.win - stepFor(BMP.win - 1);
        c[k] = BMP.win; return;
      }
      if (!bidMode() && mb > 0 && settings.cacheMode !== 'minbuy') {
        // „Max. Gebot“ knapp ÜBER deinem Max.-Sofortkauf: Startgebot < Sofortkauf ≤ Max. -> filtert nie ein passendes Angebot weg
        const s0 = stepFor(mb), kid = fld(/^masked_?def_?id$/i), bk = `${kid ? c[kid] : ''}:${mb}`;
        const n = ((BMP.n[bk] || 0) % 15) + 1; BMP.n[bk] = n;
        c[kd] = mb + n * s0; BMP.expect = c[kd]; return;
      }
      BMP.expect = 0;
      // ohne Max.-Preis (oder Bieten-Modus): Min. Sofortkauf in kleinen Schritten, aber nur weit unter deinem Limit
      let lim = Math.max(200, settings.bumpMinMax || 1000);
      if (mb > 0) lim = Math.min(lim, Math.max(150, Math.floor(mb * 0.5)));
      if (bidMode() && toNum(c[kd])) lim = Math.min(lim, Math.max(150, Math.floor(toNum(c[kd]) * 0.5)));
      BMP.mb = BMP.mb >= lim ? 0 : BMP.mb ? BMP.mb + stepFor(BMP.mb) : 150;
      if (!toNum(c[k]) || toNum(c[k]) < BMP.mb) c[k] = BMP.mb;   // ein von dir gesetzter höherer Min.-Wert bleibt
    }
    // ---------- Such-Zähler: wie viele Anfragen an den Markt in letzter Zeit (eigene + vom Sperren-Schutz gezählte) ----------
    st.hist = []; let rateWarnT = 0, rateLvl = 'ok';
    function rate() {
      const now = Date.now();
      while (st.hist.length && st.hist[0] < now - 3600000) st.hist.shift();
      const w = st.hist.filter((t) => t > now - 60000);
      const g = typeof GUARD !== 'undefined' ? GUARD.level() : null;
      const gs = (g && g.s) || {};
      const m = Math.max(w.length, gs.sMin || 0), h = Math.max(st.hist.length, gs.sHour || 0);
      const lim = settings.guardPerMin || 20, limH = settings.guardPerHour || 300;
      let lvl = m >= lim || h >= limH ? 'red' : m >= lim * 0.75 || h >= limH * 0.8 ? 'warn' : 'ok';
      const block = g && g.level === 'red' && /Code/.test(g.text) ? g.text : '';
      if (block) lvl = 'red';
      let wait = 0;
      const thr = Math.ceil(lim * 0.75) - 1;   // darunter ist es wieder grün
      if (m > thr && w.length > thr) { const k = w.length - thr; wait = Math.max(1, Math.ceil((w[k - 1] + 60000 - now) / 1000)); }
      return { m, h, lim, limH, lvl, wait, block, own: w.length, gMin: gs.sMin || 0 };
    }
    function rateHtml(coins) {
      const r = rate(), pct = Math.min(100, Math.round((r.m / r.lim) * 100));
      return `<div class="by-rate ${r.lvl}"><div class="by-rate-t"><b>${r.lvl === 'ok' ? '🟢 Sicher' : r.lvl === 'warn' ? '🟡 Etwas langsamer' : '🔴 Pause machen'}</b><span>${r.m}/${r.lim} Suchen pro Min · ${r.h}/${r.limH} pro Std${coins != null ? ` · ${fmt(coins)} Münzen` : ''}</span></div>
        <div class="by-rate-bar"><i style="width:${pct}%"></i></div>
        ${r.block ? `<div class="by-rate-w">⛔ ${esc(r.block)} – 5–10 Min. nichts suchen</div>` : r.lvl !== 'ok' && r.wait ? `<div class="by-rate-w">In ${r.wait} Sek. wieder im grünen Bereich${r.lvl === 'red' ? ' – bis dahin Pause' : ''}</div>` : ''}</div>`;
    }
    function noteSearch() {
      st.hist.push(Date.now());
      const r = rate();
      if (r.lvl !== 'ok' && r.lvl !== rateLvl && Date.now() - rateWarnT > 30000 && r.own >= r.gMin) {
        rateWarnT = Date.now();
        showToast(r.lvl === 'red' ? `🛑 ${r.m} Suchen in der letzten Minute – kurz Pause machen, sonst bremst EA (Code 403/429).` : `⚠ ${r.m} Suchen/Min – etwas langsamer tippen.`, r.lvl === 'red');
        try { if (navigator.vibrate && r.lvl === 'red') navigator.vibrate(200); } catch (e) { /* */ }
      }
      rateLvl = r.lvl;
    }
    setInterval(() => {
      if (!box) return;
      box.querySelectorAll('.by-cd[data-end]').forEach((x) => { const left = Math.max(0, Math.round((+x.dataset.end - Date.now()) / 1000)); x.textContent = left ? fmtTime(left) : 'beendet'; x.classList.toggle('hot', left < 60); });
    }, 1000);
    setInterval(() => { if (!box || !panel.classList.contains('open') || !panel.classList.contains('v-buy')) return; const el = box.querySelector('.by-rate'); if (el) { const c = SBCUI.userCoins(); el.outerHTML = rateHtml(c); } }, 1000);
    // ---------- Snipe-Statistik pro Spieler ----------
    if (!settings.snStats || typeof settings.snStats !== 'object') settings.snStats = {};
    if (settings.snDouble === undefined) settings.snDouble = false;   // 2 Spieler pro Tastendruck (Liste/Rotation)
    function curKey() {
      if (settings.snMode === 'list' && LST.cur) return { k: `${LST.cur.asset}-${LST.cur.rating || 0}`, name: `${LST.cur.rating ? LST.cur.rating + ' ' : ''}${LST.cur.name}` };
      if (rotOn() && ROT.cur) return { k: `${ROT.cur.asset}-${ROT.cur.rating}`, name: `${ROT.cur.rating} ${ROT.cur.name}` };
      const kd = TC.crit && fld(/^masked_?def_?id$/i), id = kd && toNum(TC.crit[kd]);
      return id ? { k: `${id}-0`, name: null } : null;
    }
    function stat(key, f) {
      if (!key) return;
      const S = settings.snStats;
      const e = S[key.k] || (S[key.k] = { name: key.name || '', n: 0, hit: 0, buy: 0, miss: 0, spent: 0, t: 0 });
      if (key.name) e.name = key.name;
      f(e); e.t = Date.now();
      const ks = Object.keys(S);
      if (ks.length > 150) { ks.sort((a, b) => (S[a].t || 0) - (S[b].t || 0)).slice(0, ks.length - 150).forEach((x) => delete S[x]); }
    }
    function statsHtml() {
      const S = settings.snStats, L = Object.values(S).filter((e) => e.n).sort((a, b) => b.buy - a.buy || b.hit - a.hit || b.n - a.n).slice(0, 20);
      return `<details class="by-st"><summary>📊 Snipe-Statistik pro Spieler${L.length ? ` (${Object.keys(S).length})` : ''}</summary>
        ${L.length ? `<div class="by-st-h"><span>Spieler</span><span>Suchen</span><span>Treffer</span><span>✓</span><span>✗</span><span>Ø Preis</span></div>
        ${L.map((e) => `<div class="by-st-r ${e.n >= 30 && !e.hit ? 'dead' : ''}"><span>${esc(e.name || '?')}</span><span>${e.n}</span><span>${e.hit}${e.n ? ` <small>(${Math.round((e.hit / e.n) * 100)} %)</small>` : ''}</span><span>${e.buy}</span><span>${e.miss}</span><span>${e.buy ? fmt(Math.round(e.spent / e.buy)) : '–'}</span></div>`).join('')}
        <div class="by-keys">Grau = 30+ Suchen ohne einen Treffer – Max.-Preis zu niedrig oder kaum Angebote. <button class="fcpt-smallbtn" data-stx="1">Statistik zurücksetzen</button></div>` : '<div class="by-keys">Noch keine Daten – füllt sich beim Snipen.</div>'}</details>`;
    }
    async function directSearch() {
      const S = W.services.Item;
      if (rotOn() && !rotApply()) throw new Error('Erst „Spielerliste laden“ tippen (Rating-Snipe).');
      const reqCrit = cloneCrit(TC.crit);
      bumpCrit(reqCrit);
      st.lastCrit = reqCrit;
      st.lastKey = curKey(); stat(st.lastKey, (e) => { e.n++; });
      const t0 = performance.now();
      const fn = S.searchTransferMarket.orig || S.searchTransferMarket;
      const pages = rfOn() && !rotOn() ? Math.max(1, Math.min(3, settings.rfPages || 1)) : 1;
      let items = [];
      st.pageFull = false;
      for (let pg = 1; pg <= pages; pg++) {
        if (pg > 1) await sleep(250 + Math.random() * 200);
        noteSearch();
        const ev = await obs(fn.call(S, reqCrit, pg), 8000);
        if (pg === 1) st.lastMs = Math.round(performance.now() - t0);
        if (ev && ev.success === false) { cooldown(ev.status); if (pg === 1) throw Object.assign(new Error(`${ERR[ev.status] || 'EA lehnt ab'} (Code ${ev.status || '?'})`), { status: ev.status }); break; }
        const got = ((ev && (ev.response || ev.data)) || {}).items || [];
        items = items.concat(got);
        st.pageSize = Math.max(st.pageSize || 0, got.length);
        st.pageFull = got.length >= 20;   // volle Seite -> es gibt vermutlich noch mehr Angebote
        if (!st.pageFull) break;
      }
      const all = items.map((raw) => ({ raw, p: mapItem(raw) })).filter((o) => o.p && o.p.active && o.p.tradeOwner !== true && o.p.buyNow);
      st.rfSkipped = rfOn() ? all.filter((o) => !rfOk(o.p)).length : 0;
      st.rfTotal = all.length;
      st.lstSkipped = all.filter((o) => rfOk(o.p) && !lstOk(o.p)).length;
      return all.filter((o) => rfOk(o.p) && lstOk(o.p));
    }
    // ---------- Snipe-Ziele: mehrere Turbo-Suchen speichern und per Klick / Shift+1…9 / Q·E wechseln ----------
    if (!Array.isArray(settings.snipeTargets)) settings.snipeTargets = [];
    let activeTarget = null;
    const critFields = (c) => {
      const o = {};
      for (const k of Object.keys(c || {})) {
        const v = c[k];
        if (v == null || typeof v === 'function') continue;
        if (typeof v !== 'object' || (Array.isArray(v) && v.every((x) => x == null || typeof x !== 'object'))) o[k] = Array.isArray(v) ? v.slice() : v;
      }
      return o;
    };
    function saveTarget() {
      if (!TC.crit) { st.msg = 'Erst einmal in der Web App suchen – dann kann das Tool die Suche speichern.'; render(); return; }
      const f = critFields(TC.crit);
      if (rotOn() && ROT.k) f[ROT.k] = ROT.orig;
      const mbK = fld(/^max_?(buy|bin|buynow)$/i), minK = fld(/^min_?(buy|bin|buynow)$/i);
      if (minK) f[minK] = 0;
      const norm = (x) => { const y = Object.assign({}, x); if (minK) y[minK] = 0; if (mbK) delete y[mbK]; return JSON.stringify(y); };
      const same = settings.snipeTargets.find((t) => norm(t.fields) === norm(f) && JSON.stringify(t.rf || null) === JSON.stringify(rfOn() ? { min: settings.rfMin, max: settings.rfMax, win: settings.rfWin } : null));
      if (same) { activeTarget = same.id; st.msg = `„${same.label}“ ist schon gespeichert.`; render(); return; }
      const label = st.rows.length && new Set(st.rows.map((r) => r.p.resourceId)).size === 1 ? `${st.rows[0].p.rating ?? ''} ${st.rows[0].p.name}`.trim() : `Suche ${settings.snipeTargets.length + 1}`;
      const t = { id: Date.now().toString(36), label: rfOn() ? `${settings.rfMin}${settings.rfMax ? `–${settings.rfMax}` : '+'}er bis ${fmt(mbK ? toNum(f[mbK]) || 0 : 0)}` : label, fields: f, maxBuy: mbK ? toNum(f[mbK]) || 0 : 0, rf: rfOn() ? { min: settings.rfMin, max: settings.rfMax, win: settings.rfWin } : null };
      settings.snipeTargets.push(t);
      if (settings.snipeTargets.length > 12) settings.snipeTargets.shift();
      activeTarget = t.id; saveSettings();
      st.msg = `Gespeichert: „${label}“. Umbenennen per Doppelklick auf den Namen.`; render();
    }
    function useTarget(id) {
      const t = settings.snipeTargets.find((x) => x.id === id);
      if (!t) return;
      if (!TC.crit && typeof W.UTSearchCriteriaDTO === 'function') { try { TC.crit = new W.UTSearchCriteriaDTO(); } catch (e) { /* */ } }
      if (!TC.crit) { st.msg = 'Einmal in der Web App normal suchen (egal was) – danach lassen sich gespeicherte Ziele per Klick laden.'; render(); return; }
      for (const k of Object.keys(critFields(TC.crit))) if (!(k in t.fields)) { try { delete TC.crit[k]; } catch (e) { /* */ } }
      Object.assign(TC.crit, JSON.parse(JSON.stringify(t.fields)));
      const mbK = fld(/^max_?(buy|bin|buynow)$/i);
      if (mbK && t.maxBuy) TC.crit[mbK] = t.maxBuy;
      if (t.rf) { settings.rfMin = t.rf.min; settings.rfMax = t.rf.max; settings.rfWin = t.rf.win; } else { settings.rfMin = 0; settings.rfMax = 0; }
      saveSettings();
      activeTarget = id; st.rows = []; st.arm = null; st.label = t.label;
      st.msg = `🎯 Ziel „${t.label}“ aktiv${t.maxBuy ? ` · Max. Sofortkauf ${fmt(t.maxBuy)}` : ''} – Leertaste zum Suchen.`;
      render();
    }
    function targetsHtml() {
      const L = settings.snipeTargets;
      return `<div class="by-tgts"><div class="by-tgts-h"><b>🎯 Snipe-Ziele</b><button class="by-tsave" data-by="tsave" ${TC.crit ? '' : 'disabled'} title="Aktuelle Suche (Spieler, Qualität, Max. Sofortkauf …) speichern">+ Aktuelle Suche speichern</button></div>
        ${L.length ? `<div class="by-tlist">${L.map((t, i) => `<div class="by-t ${activeTarget === t.id ? 'on' : ''}">
          <button class="by-tn" data-tu="${t.id}" title="Laden${i < 9 ? ` (Shift+${i + 1})` : ''} · Doppelklick = umbenennen">${i < 9 ? `<kbd>${i + 1}</kbd>` : ''}${esc(t.label)}</button>
          <label title="Max. Sofortkauf für dieses Ziel">≤<input type="number" step="50" min="0" data-tm="${t.id}" value="${t.maxBuy || ''}" placeholder="Max"></label>
          <button class="by-tx" data-tx="${t.id}" title="Löschen">✕</button></div>`).join('')}</div>
          ${pc() ? '<div class="by-keys"><kbd>Shift</kbd>+<kbd>1</kbd>…<kbd>9</kbd> Ziel laden · <kbd>Q</kbd>/<kbd>E</kbd> vorheriges/nächstes Ziel</div>' : ''}`
        : '<div class="by-keys">Stell in der Web App eine Suche ein, such einmal und speichere sie hier. Danach wechselst du zwischen deinen Zielen per Klick – ohne die Web App anzufassen.</div>'}</div>`;
    }
    function cycleTarget(dir) {
      const L = settings.snipeTargets;
      if (!L.length) return;
      const i = Math.max(-1, L.findIndex((t) => t.id === activeTarget));
      useTarget(L[(i + dir + L.length) % L.length].id);
    }

    const critMaxBuy = () => { const k = fld(/^max_?(buy|bin|buynow)$/i); return k ? toNum(TC.crit[k]) || 0 : 0; };

    // Bester lohnender Deal -> Kaufen-Knopf vorbereiten (dann reicht 1× K / Enter / Klick)
    // Bieten-Modus: Limit für Gebote (Liste: Preis des Spielers · sonst Max. Preis · sonst „lohnt bis“)
    function bidMode() { return settings.snKind === 'bid'; }
    function rowLimit(r) { return (bidMode() && st.bidLimit) || r.maxBid || null; }
    function autoArm() {
      if (bidMode()) {
        if (!settings.snipeArm || st.arm) return;
        let bi = -1;
        st.rows.forEach((r, i) => { const L = rowLimit(r); if (bi < 0 && !r.done && !r.lead && r.nb < r.bin && L && r.nb <= L && r.endAt > Date.now() + 3000) bi = i; });
        if (bi < 0) return;
        st.sel = bi; st.arm = `bid:${bi}`; st.armT = Date.now(); st.armMs = 6000; st.stats.hits++; beep();
        const key = st.arm; setTimeout(() => { if (st.arm === key) { st.arm = null; render(); } }, 6000);
        return;
      }
      if (!settings.snipeArm || !settings.buyConfirm || st.arm) return;
      let bi = -1, bv = -Infinity;
      const mb = critMaxBuy();
      st.rows.forEach((r, i) => {
        if (r.done) return;
        // Eigener Max.-Sofortkauf gesetzt -> jeder Treffer darunter ist gewollt; sonst zählt der Futbin-Gewinn
        const ok = mb > 0 ? r.bin <= mb : (r.profBin != null && r.profBin >= settings.snipeMinProfit);
        const score = mb > 0 ? -r.bin : (r.profBin != null ? r.profBin : -r.bin);
        if (ok && score > bv) { bv = score; bi = i; }
      });
      if (bi < 0 || Date.now() - st.t > 8000) return;
      st.sel = bi; st.arm = `buy:${bi}`; st.armT = Date.now(); st.armMs = 6000;
      st.stats.hits++;
      beep();
      const key = st.arm;
      setTimeout(() => { if (st.arm === key) { st.arm = null; render(); } }, 6000);
    }
    // EAs Feld „Max. Sofortkauf“ auf „lohnt bis“ setzen (Suchseite, 4. Preisfeld)
    async function setMaxBin(v) {
      const k = fld(/^max_?(buy|bin|buynow)$/i);
      if (TC.crit && k) { TC.crit[k] = v; st.msg = `Max. Sofortkauf für die Turbo-Suche auf ${fmt(v)} gesetzt – jeder Treffer lohnt sich und ist sofort kaufbereit.`; render(); return; }
      let s = findSearchButton();
      if (!s) { const back = findBackButton(); if (back) { pressButton(back); s = await waitFor(findSearchButton, 1500, 40); } }
      const filters = [...document.querySelectorAll('.search-prices .price-filter, .price-filter')].filter((f) => shown(f));
      const f = filters[3];
      const input = f && f.querySelector('input');
      if (!input) { st.msg = 'Feld „Max. Sofortkauf“ nicht gefunden – bitte die Suchseite in der Web App öffnen.'; render(); return; }
      setPriceInput(input, v);
      st.msg = `Max. Sofortkauf auf ${fmt(v)} gesetzt – ab jetzt zeigt EA nur noch Angebote, die sich lohnen.`; render();
    }
    const pc = () => !!(W.matchMedia && W.matchMedia('(hover: hover) and (pointer: fine)').matches);
    const kb = (k) => (pc() ? `<kbd>${k}</kbd>` : '');
    const obs = (o, ms = 12000) => new Promise((resolve, reject) => {
      if (!o || typeof o.observe !== 'function') return reject(new Error('Keine EA-Antwort'));
      const sub = {};
      const t = setTimeout(() => reject(new Error('Zeitüberschreitung bei EA')), ms);
      o.observe(sub, (ob, ev) => { clearTimeout(t); try { ob.unobserve(sub); } catch (e) { /* */ } resolve(ev || {}); });
    });
    const ERR = { 403: 'EA verweigert den Zugriff (zu viele Anfragen oder Markt kurz gesperrt) – Pause machen', 458: 'EA will eine Prüfung (Captcha) – in der Web App bestätigen', 461: 'zu spät – schon verkauft oder überboten', 470: 'nicht genug Münzen', 478: 'Gebot zu niedrig', 473: 'eigene Karte', 409: 'schon vergeben', 429: 'EA bremst – kurz Pause', 512: 'EA bremst – Pause machen', 521: 'EA bremst – Pause machen' };

    function mk(o) {
      const raw = o.raw, p = o.p;
      let a = {};
      try { a = raw.getAuctionData ? raw.getAuctionData() : raw._auction || {}; } catch (e) { /* */ }
      const market = p.isPlayer ? (marketPrice(p.resourceId) || cacheGet(`futbin:${settings.platform}:${p.resourceId}`) || null) : CONS.price(p);
      const cur = toNum(a.currentBid) || 0;
      const nb = cur ? cur + stepFor(cur) : (toNum(a.startingBid) || 150);
      const bin = toNum(a.buyNowPrice) || p.buyNow;
      const maxBid = market ? Math.floor((afterTax(market) - settings.tgMinProfit) / stepFor(market)) * stepFor(market) : null;
      return { raw, p, bin, cur, nb, lead: String(a.bidState || '').toLowerCase() === 'highest', exp: a.expires, endAt: Date.now() + (toNum(a.expires) || 0) * 1000, tid: a.tradeId, market, maxBid, profBin: market ? afterTax(market) - bin : null, profBid: market ? afterTax(market) - nb : null, done: null, busy: false };
    }

    async function search() {
      if (st.busy) return;
      if (Date.now() - st.lastSearch < 600) return;   // Doppeltipp abfangen
      if (typeof GUARD !== 'undefined' && GUARD.blocked()) { st.msg = `🛑 ${GUARD.level().text} – Pause empfohlen. Nochmal tippen = trotzdem suchen.`; render(); return; }
      if (findConfirmButton()) { st.msg = 'In der Web App ist noch ein Kauf-Dialog offen – dort erst bestätigen oder abbrechen.'; render(); return; }
      st.busy = true; st.msg = 'Suche …'; st.arm = null; render();
      const t0 = Date.now(); st.lastSearch = t0;
      try {
        const why = applySimple();
        if (why) { st.msg = why; return; }
        if (rotOn() && (!ROT.list.length || ROT.key !== `${settings.rfMin}-${settings.rfMax || 99}`)) { st.busy = false; await loadRotation(); return; }
        if (settings.snipeTurbo && TC.crit && W.services.Item.bid) {
          const multi = settings.snDouble && ((settings.snMode === 'list' && lstActive().length > 1) || (rotOn() && rotActive().length > 1));
          let offers = [], passNames = [];
          for (let pass = 0; pass < (multi ? 2 : 1); pass++) {
            if (pass) { await sleep(120 + Math.random() * 180); if (settings.snMode === 'list') applySimple(); }
            st.stats.n++;
            offers = await directSearch();
            st.t = Date.now(); st.stats.ms += st.lastMs;
            const ck = st.lastKey; if (ck && ck.name) passNames.push(ck.name.replace(/^\d+ /, ''));
            if (offers.length) break;
          }
          if (offers.length) { const mbH = critMaxBuy(); if (!mbH || offers.some((o) => (o.p.buyNow || Infinity) <= mbH)) stat(st.lastKey, (e) => { e.hit++; }); }
          if (passNames.length > 1 && !offers.length) st.multiNote = `${passNames.join(' + ')}: `; else st.multiNote = '';
          saveSettings();
          const fullHint = st.pageFull ? ' ⚠ Seite voll: EA zeigt nur die ersten ~20 Angebote (die bald endenden). Neue, günstige Angebote stehen weiter hinten – Preisfenster kleiner machen, Liga/Nation filtern oder 2 Seiten laden.' : '';
          if (!offers.length) { st.rows = []; st.msg = st.multiNote ? `${st.multiNote}nichts (${st.lastMs} ms).` : settings.snMode === 'list' && LST.cur ? `${LST.cur.name} bis ${fmt(LST.cur.max)}: nichts${st.lstSkipped ? ` (${st.lstSkipped} andere Version${st.lstSkipped > 1 ? 'en' : ''})` : ''} – ${st.lastMs} ms.` : (rotOn() && ROT.cur ? `${ROT.cur.name}: ` : '') + (st.rfSkipped ? `${st.rfSkipped} Angebote, aber keins mit Rating ${settings.rfMin}${settings.rfMax ? `–${settings.rfMax}` : '+'} (${st.lastMs} ms).` : `Nichts gefunden (${st.lastMs} ms) – nochmal.`) + fullHint; return; }
          if (st.pageFull && rfOn()) st.msg = fullHint.trim();
          st.rows = offers.map(mk).sort((a, b) => a.bin - b.bin);
          if (bidMode()) {
            const all = st.rows.length, maxEnd = Date.now() + (settings.bdMaxMin || 10) * 60000;
            st.rows = st.rows.filter((r) => r.nb < r.bin && r.endAt <= maxEnd && r.endAt > Date.now() + 2000 && (!st.bidLimit || r.nb <= st.bidLimit)).sort((a, b) => a.endAt - b.endAt);
            if (!st.rows.length) { st.msg = `${settings.snMode === 'list' && LST.cur ? `${LST.cur.name}: ` : ''}keine Auktion${st.bidLimit ? ` mit nächstem Gebot bis ${fmt(st.bidLimit)}` : ''}, die in ${settings.bdMaxMin} Min. endet (${all} Angebote geprüft, ${st.lastMs} ms).`; return; }
          }
          if (settings.snMode === 'list' && LST.cur && !LST.cur.rid && LST.cur.rating) { const m0 = st.rows.find((r) => r.p.rating === LST.cur.rating); if (m0 && m0.p.resourceId) { LST.cur.rid = m0.p.resourceId; saveSettings(); } }
          const names = [...new Set(st.rows.map((r) => r.p.name))];
          st.label = (bidMode() ? '🔨 ' : '') + (names.length === 1 ? `${st.rows[0].p.rating ?? ''} ${names[0]}` : `${names.length} verschiedene Karten`);
          st.msg = '';
          { let bi = 0, bv = -Infinity; st.rows.forEach((r, i) => { if (r.profBin != null && r.profBin > bv) { bv = r.profBin; bi = i; } }); st.sel = bi; }
          st.hitAt = performance.now();
          // Sofort-Kauf (nur wenn eingeschaltet UND eigener Max.-Sofortkauf gesetzt): günstigster Treffer im Limit, max. 1 Kauf pro Tipp
          const mbI = critMaxBuy();
          if (settings.snipeInstant && mbI > 0 && !bidMode()) {
            const bi = st.rows.findIndex((r) => r.bin <= mbI);
            if (bi >= 0) { st.sel = bi; st.msg = ''; act(bi, 'buy', true); beep(); return; }
          }
          autoArm();
          if (!st.arm && settings.snipeOneKey) {
            const b0 = st.rows[0];
            st.msg = critMaxBuy() ? '' : (b0 && b0.profBin != null ? `Treffer, aber Gewinn ${b0.profBin >= 0 ? '+' : '−'}${fmt(Math.abs(b0.profBin))} liegt unter deinem Minimum (+${fmt(settings.snipeMinProfit)}) – K kauft trotzdem (2×). Tipp: Max. Sofortkauf setzen.` : 'Treffer – Futbin-Preis lädt noch. Tipp: Max. Sofortkauf setzen, dann ist jeder Treffer sofort mit der Leertaste kaufbar.');
          }
          st.rows.filter((r) => r.p.isPlayer && !r.market).slice(0, 2).forEach((r) => {
            getPrice('futbin', r.p, 'futbin:snipe').then(() => { const n = mk({ raw: r.raw, p: r.p }); Object.assign(r, { market: n.market, maxBid: n.maxBid, profBin: n.profBin, profBid: n.profBid }); autoArm(); render(); }).catch(() => {});
          });
          return;
        }
        let s = findSearchButton();
        if (!s) {
          const back = findBackButton();
          if (back) { pressButton(back); s = await waitFor(findSearchButton, 1500, 40); }
          if (!s) { st.msg = 'Öffne einmal in der Web App „Transfers → Transfermarkt durchsuchen“ und stelle die Suche ein (Spieler, Qualität …). Danach suchst du nur noch hier.'; return; }
        }
        for (const [tid, r] of marketRows) if (!r.root.isConnected) marketRows.delete(tid);
        const before = new Set(marketRows.keys());
        if (settings.bumpMinBin) bumpMinBin();
        pressButton(s);
        st.stats.n++; noteSearch();
        const got = await waitFor(() => (noResults() ? 'none' : marketOffers().some((o) => !before.has(o.p.tradeId)) ? 'rows' : null), 4000, 50);
        st.t = Date.now();
        st.stats.ms += st.t - t0;
        if (got !== 'rows') { st.rows = []; st.msg = got === 'none' ? 'Nichts gefunden – nochmal tippen.' : 'Keine Ergebnisse erkannt – nochmal tippen.'; return; }
        await sleep(150);
        st.rows = marketOffers().filter((o) => !before.has(o.p.tradeId)).map((o) => mk({ p: o.p, raw: (marketRows.get(o.p.tradeId) || {}).raw })).filter((r) => r.raw).sort((a, b) => a.bin - b.bin);
        const names = [...new Set(st.rows.map((r) => r.p.name))];
        st.label = names.length === 1 ? `${st.rows[0].p.rating ?? ''} ${names[0]}` : `${names.length} verschiedene Karten`;
        st.msg = '';
        { let bi = 0, bv = -Infinity; st.rows.forEach((r, i) => { if (r.profBin != null && r.profBin > bv) { bv = r.profBin; bi = i; } }); st.sel = bi; }
        autoArm();
        // fehlende Futbin-Preise nachladen
        st.rows.filter((r) => r.p.isPlayer && !r.market).slice(0, 4).forEach((r) => {
          getPrice('futbin', r.p, 'futbin:snipe').then(() => { const n = mk({ raw: r.raw, p: r.p }); Object.assign(r, { market: n.market, maxBid: n.maxBid, profBin: n.profBin, profBid: n.profBid }); autoArm(); render(); }).catch(() => {});
        });
      } catch (e) { st.msg = 'Fehler: ' + e.message; } finally { st.busy = false; render(); }
    }

    async function act(i, kind, force, amt) {
      const r = st.rows[i];
      if (!r || r.busy || (r.done && !r.done.bad && kind === 'buy')) return;
      if (kind === 'bid' && r.lead && !amt) { r.done = { t: 'Du bist schon Höchstbietender' }; render(); return; }
      const amount = kind === 'buy' ? r.bin : (amt && amt >= r.nb ? amt : r.nb);
      const key = `${kind}:${i}`;
      const needConfirm = kind === 'buy' ? settings.buyConfirm : settings.bidConfirm;
      if (!force && needConfirm && (st.arm !== key || Date.now() - st.armT > st.armMs)) {
        st.arm = key; st.armT = Date.now(); st.armMs = 4000; render();
        setTimeout(() => { if (st.arm === key) { st.arm = null; render(); } }, 4000);
        return;
      }
      st.arm = null;
      const S = W.services && W.services.Item;
      if (!S || typeof S.bid !== 'function') { r.done = { bad: true, t: 'EA-Funktion zum Bieten nicht gefunden' }; render(); return; }
      if ((SBCUI.userCoins() ?? Infinity) < amount) { r.done = { bad: true, t: 'nicht genug Münzen' }; render(); return; }
      r.busy = true;
      const tb = performance.now();
      const pr = obs(S.bid(r.raw, amount));   // Anfrage sofort raus, erst danach zeichnen
      render();
      try {
        const ev = await pr;
        st.lastBuyMs = Math.round(performance.now() - tb);
        if (st.hitAt) st.hitToBuy = Math.round(tb - st.hitAt);
        if (ev && ev.success === false) {
          const why = ERR[ev.status] || `Code ${ev.status || '?'}`;
          cooldown(ev.status);
          r.done = { bad: true, t: `${kind === 'buy' ? '✗ Nicht bekommen' : 'Gebot abgelehnt'}: ${why}` };
          if (kind === 'buy') result(r, false, why);
        } else if (kind === 'buy') { r.done = { t: `✓ gekauft für ${fmt(amount)} – liegt in „Nicht zugewiesen“` }; showToast(`💰 ${r.p.name} für ${fmt(amount)} gekauft`); result(r, true); }
        else { r.lead = true; r.done = { t: `✓ Höchstbietender mit ${fmt(amount)} – Überboten-Alarm ist an` }; try { if (typeof TARGETS !== 'undefined' && TARGETS.track) TARGETS.track(r.tid, rowLimit(r)); } catch (e) { /* */ } r.cur = amount; r.nb = amount + stepFor(amount); if (r.market) r.profBid = afterTax(r.market) - r.nb; }
      } catch (e) { r.done = { bad: true, t: e.message }; if (kind === 'buy') result(r, false, /Zeitüberschreitung/.test(e.message) ? 'EA antwortet nicht' : e.message); }
      r.busy = false; render();
    }

    const sign = (v) => (v == null ? '' : `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`);
    function rowHtml(r, i, best) {
      const armB = st.arm === `buy:${i}`, armD = st.arm === `bid:${i}`;
      const bidOk = r.nb < r.bin;
      const worthBid = rowLimit(r) == null || r.nb <= rowLimit(r);
      const bought = r.done && !r.done.bad && /gekauft/.test(r.done.t);
      const sel = pc() && i === st.sel;
      return `<div class="by-r ${bought ? 'won' : ''} ${i === best ? 'best' : ''} ${sel ? 'sel' : ''}" data-row="${i}">
        <div class="by-c"><b>${esc(r.p.isCons ? '🧪' : r.p.rating ?? '')}</b><small>${esc(r.p.position || '')}</small></div>
        <div class="by-n"><div class="nm">${esc(r.p.name)}${i === best ? ' <span class="by-best">Bester Deal</span>' : ''}</div>
          <small><span class="by-cd ${r.endAt - Date.now() < 60000 ? 'hot' : ''}" data-end="${r.endAt}">${fmtTime(Math.max(0, Math.round((r.endAt - Date.now()) / 1000)))}</span> · Gebot ${r.cur ? fmt(r.cur) : '–'} · Markt ${r.market ? fmt(r.market) : '…'}${bidMode() && rowLimit(r) ? ` · Limit ${fmt(rowLimit(r))}` : ''}</small>
          ${r.done ? `<small class="${r.done.bad ? 'neg' : 'pos'}">${esc(r.done.t)}</small>` : r.lead ? '<small class="pos">✓ Du führst</small>' : ''}</div>
        ${bought ? '' : `<div class="by-a">
          <button data-by="buy" data-i="${i}" class="b ${armB ? 'arm' : ''}" ${r.busy ? 'disabled' : ''}><span class="l">${armB ? 'Sicher?' : 'Kaufen'}${sel ? kb('K') : ''}</span><b>${fmt(r.bin)}</b><small class="${r.profBin == null ? '' : r.profBin >= 0 ? 'pos' : 'neg'}">${r.profBin == null ? '&nbsp;' : sign(r.profBin)}</small></button>
          ${bidOk ? `<button data-by="bid" data-i="${i}" class="d ${armD ? 'arm' : ''} ${worthBid ? '' : 'no'}" ${r.busy ? 'disabled' : ''}><span class="l">${armD ? 'Sicher?' : 'Bieten'}${sel ? kb('B') : ''}</span><b>${fmt(r.nb)}</b><small class="${r.profBid == null ? '' : r.profBid >= 0 ? 'pos' : 'neg'}">${r.profBid == null ? '&nbsp;' : worthBid ? sign(r.profBid) : 'lohnt nicht'}</small></button>` : ''}
          ${bidMode() && bidOk && !r.lead && rowJump(r) ? `<button data-by="bidmax" data-i="${i}" class="d j" ${r.busy ? 'disabled' : ''} title="Sprung-Gebot: direkt dein Limit bieten – viele Mitbieter steigen dann aus"><span class="l">Limit</span><b>${fmt(rowJump(r))}</b><small class="${r.market ? (afterTax(r.market) - rowJump(r) >= 0 ? 'pos' : 'neg') : ''}">${r.market ? sign(afterTax(r.market) - rowJump(r)) : '&nbsp;'}</small></button>` : ''}
        </div>`}
      </div>`;
    }
    function rowJump(r) { const L = rowLimit(r); if (!L || L <= r.nb || L >= r.bin) return null; const s0 = stepFor(L); const v = Math.floor(L / s0) * s0; return v > r.nb ? v : null; }

    // ---------- Handy: ein großer Snipe-Knopf unten (auch bei geschlossenem Tool) ----------
    if (settings.snipeBtn === undefined) settings.snipeBtn = 'auto';   // 'auto' = Touch-Geräte · 'on' · 'off'
    const fb = document.createElement('div');
    fb.id = 'fcpt-snipebtn';
    fb.innerHTML = '<div style="position:relative"><span class="sb-grip" title="Ziehen zum Verschieben">⋮</span><button type="button" data-sb="go"></button></div><button type="button" data-sb="rb" class="rb"></button><div class="sb-st"></div>';
    document.body.appendChild(fb);
    GM_addStyle(`
      #fcpt-snipebtn{position:fixed;right:var(--fcpt-sbr, 12px);bottom:calc(env(safe-area-inset-bottom, 0px) + var(--fcpt-sbb, 90px));z-index:100001;display:none;flex-direction:column;align-items:flex-end;gap:4px;max-width:min(240px,70vw)}
      #fcpt-snipebtn.typing{display:none !important}
      #fcpt-snipebtn.show{display:flex}
      #fcpt-snipebtn button{min-width:96px;height:48px;padding:0 16px;border:0;border-radius:24px;background:#f2c14e;color:#15120a;font:800 16px system-ui,-apple-system,sans-serif;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.5);touch-action:manipulation;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}
      #fcpt-snipebtn button small{font-size:12px;font-weight:700;opacity:.9}
      #fcpt-snipebtn .sb-grip{position:absolute;left:-14px;top:50%;width:12px;height:28px;margin-top:-14px;border-radius:6px;background:rgba(11,15,23,.7);color:#a3aec2;font:700 10px/28px system-ui;text-align:center;touch-action:none}
      #fcpt-snipebtn button.buy{background:#f97316;color:#fff;animation:fcptArm 1s infinite}
      #fcpt-snipebtn button.busy{opacity:.75}
      #fcpt-snipebtn button.ok{background:#16a34a;color:#fff}
      #fcpt-snipebtn button.fail{background:#dc2626;color:#fff;animation:fcptShake .35s}
      @keyframes fcptShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
      #fcpt-snipebtn button:active{transform:scale(.97)}
      #fcpt-snipebtn .sb-st{max-width:100%;background:rgba(11,15,23,.92);color:#e9edf5;border:1px solid #263049;border-radius:10px;padding:3px 8px;font:600 11px system-ui,sans-serif;text-align:right}
      #fcpt-snipebtn .sb-st:empty{display:none}
      #fcpt-snipebtn button.rb{display:none;min-width:0;height:38px;font-size:13px;background:#7c3aed;color:#fff;animation:fcptArm 1s infinite}#fcpt-snipebtn button.rb.on{display:block}#fcpt-snipebtn button.rb.no{background:#475069;animation:none}
      @keyframes fcptArm{50%{filter:brightness(1.25)}}`);
    const touch = () => !!(W.matchMedia && W.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in W;
    function armedRow() { return st.arm && /^(buy|bid):/.test(st.arm) && st.armMs > 4000 ? st.rows[+st.arm.split(':')[1]] : null; }
    function updateFloat() {
      const want = settings.snipeBtn === 'on' || (settings.snipeBtn === 'auto' && touch());
      const show = want && settings.snipeTurbo && (!!TC.crit || settings.snMode === 'rating' || settings.snMode === 'list') && !panel.classList.contains('open');
      fb.classList.toggle('show', show);
      if (!show) return;
      const pos = settings.sbPos || {};
      fb.style.setProperty('--fcpt-sbb', `${pos.b != null ? pos.b : (settings.iosBottom || 80) + 12}px`);
      fb.style.setProperty('--fcpt-sbr', `${pos.r != null ? pos.r : 12}px`);
      const b = fb.querySelector('[data-sb="go"]');
      const ob = obAlert(), rb = fb.querySelector('[data-sb="rb"]');
      rb.className = `rb ${ob ? 'on' : ''} ${ob && !ob.worth ? 'no' : ''}`;
      if (ob) rb.textContent = ob.worth ? `🔔 Überboten: ${ob.p.name} – nachbieten ${fmt(ob.nb)}` : `🔔 ${ob.p.name}: über Limit (✕)`;
      const ar = armedRow();
      const fl = st.flash && Date.now() < st.flash.until ? st.flash : null;
      b.className = fl ? (fl.ok ? 'ok' : 'fail') : ar ? 'buy' : st.busy ? 'busy' : '';
      if (coolLeft() && !fl) { b.className = 'fail'; b.innerHTML = `⛔ ${coolLeft()} s`; fb.querySelector('.sb-st').textContent = `EA-Code ${st.coolCode} – Pause`; return; }
      b.innerHTML = fl ? `${esc(fl.text)}${fl.sub ? ` <small>· ${esc(fl.sub)}</small>` : ''}` : ar ? (st.arm.startsWith('bid:') ? `BIETEN ${fmt(ar.nb)}` : `KAUFEN ${fmt(ar.bin)}${ar.profBin != null ? ` <small>(${sign(ar.profBin)})</small>` : ''}`) : st.busy ? 'Sucht …' : `⚡ ${rfOn() ? `${settings.rfMin}${settings.rfMax ? `–${settings.rfMax}` : '+'}` : settings.snMode === 'list' ? 'Liste' : 'Snipe'}${bidMode() ? ' 🔨' : ''}${(settings.snipeInstant || rfOn()) && critMaxBuy() ? ` <small>≤ ${fmt(critMaxBuy())}</small>` : ''}`;
      const done = st.rows.find((r) => r.done);
      const rr = rate();
      if (rr.lvl === 'red' && !ar && !fl) { fb.querySelector('.sb-st').textContent = `🔴 Pause · ${rr.m}/${rr.lim} pro Min${rr.wait ? ` · grün in ${rr.wait} s` : ''}`; return; }
      fb.querySelector('.sb-st').textContent = (rr.lvl === 'warn' && !ar ? `🟡 ${rr.m}/${rr.lim} · ` : '') + (st.msg && !ar ? st.msg.replace(/^🎯 /, '').slice(0, 120)
        : ar ? 'Nochmal tippen = kaufen'
          : rotOn() && ROT.cur && !st.rows.length ? `zuletzt: ${ROT.cur.name}`
          : settings.snMode === 'list' && LST.cur && !st.rows.length ? `zuletzt: ${LST.cur.name} ≤ ${fmt(LST.cur.max)}`
          : done ? done.done.t.replace(/ – .*/, '')
            : st.rows.length ? `${st.rows.length} Treffer, keiner im Max.-Preis` : '');
    }
    fb.querySelector('[data-sb="go"]').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); mainAction(); });
    fb.querySelector('[data-sb="rb"]').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const a = obAlert(); if (a && a.worth) TARGETS.rebid(); else if (typeof TARGETS !== 'undefined') TARGETS.dismiss(); setTimeout(updateFloat, 50); });
    // Verschieben: am Griff ⋮ ziehen (Position wird gemerkt)
    const grip = fb.querySelector('.sb-grip');
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { grip.setPointerCapture(e.pointerId); } catch (er) { /* */ }
      const r0 = fb.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
      const R0 = W.innerWidth - r0.right, B0 = W.innerHeight - r0.bottom;
      const mv = (ev) => {
        const r = Math.max(0, Math.min(W.innerWidth - 80, R0 - (ev.clientX - sx)));
        const b = Math.max(0, Math.min(W.innerHeight - 60, B0 - (ev.clientY - sy)));
        settings.sbPos = { r: Math.round(r), b: Math.round(b) };
        fb.style.setProperty('--fcpt-sbr', `${settings.sbPos.r}px`);
        fb.style.setProperty('--fcpt-sbb', `${settings.sbPos.b}px`);
      };
      const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); saveSettings(); };
      grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });
    // Beim Eintippen in EAs Felder (Preise usw.) ausblenden – die Tastatur braucht Platz
    document.addEventListener('focusin', (e) => { const t = e.target; if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) && !t.closest('#fcpt-panel')) fb.classList.add('typing'); }, true);
    document.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (!a || !/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) fb.classList.remove('typing'); }, 150), true);
    setInterval(updateFloat, 1000);

    // ---------- EINFACH: Was snipen? + Max. Preis – der Rest passiert automatisch ----------
    if (settings.snMode === undefined) settings.snMode = settings.rfMin > 0 ? 'rating' : 'ea';
    if (settings.snRating === undefined) settings.snRating = settings.rfMin || 88;
    if (settings.snRatingUp === undefined) settings.snRatingUp = false;
    if (settings.snMax === undefined) settings.snMax = 0;
    function ensureCrit() {
      if (TC.crit) return true;
      try { const VM = W.UTBucketedItemSearchViewModel; if (VM) { TC.crit = new VM().searchCriteria; } } catch (e) { /* */ }
      if (!TC.crit && typeof W.UTSearchCriteriaDTO === 'function') { try { TC.crit = new W.UTSearchCriteriaDTO(); } catch (e) { /* */ } }
      if (TC.crit) { try { if (W.SearchType && W.SearchType.PLAYER) TC.crit.type = W.SearchType.PLAYER; } catch (e) { /* */ } TC.keys = Object.keys(TC.crit); TC.own = true; }
      return !!TC.crit;
    }
    function applySimple() {
      const why = applySimple0();
      if (why || !TC.crit) return why;
      const km = fld(/^max_?(buy|bin|buynow)$/i) || 'maxBuy', kd = fld(/^max_?bid$/i) || 'maxBid';
      if (bidMode()) {
        const lim = toNum(TC.crit[km]) || (st.bidMoved ? toNum(TC.crit[kd]) : 0) || 0;
        st.bidLimit = lim; st.bidMoved = true;
        TC.crit[kd] = lim || 0; TC.crit[km] = 0;
      } else if (st.bidMoved) {
        if (!toNum(TC.crit[km]) && toNum(TC.crit[kd])) TC.crit[km] = TC.crit[kd];
        TC.crit[kd] = 0; st.bidMoved = false; st.bidLimit = 0;
      }
      return '';
    }
    function applySimple0() {
      if (settings.snMode === 'list') {
        if (settings.rfMin) { settings.rfMin = 0; settings.rfMax = 0; rotRestore(); }
        const act = lstActive();
        if (!act.length) return 'Trag erst Spieler mit Max.-Preis in deine Liste ein (📋 Liste).';
        if (!LST.crit) { const prev = TC.crit, own = TC.own; TC.crit = null; ensureCrit(); LST.crit = TC.crit; TC.crit = prev; TC.own = own; }
        if (!LST.crit) return 'EA-Suche nicht verfügbar – Web App neu laden.';
        if (TC.crit !== LST.crit) { if (TC.crit && !TC.own) LST.prev = TC.crit; TC.crit = LST.crit; TC.own = true; TC.keys = Object.keys(TC.crit); }
        const e = act[LST.i % act.length]; LST.i++; LST.cur = e;
        TC.crit[fld(/^masked_?def_?id$/i) || 'maskedDefId'] = e.asset;
        TC.crit[fld(/^max_?(buy|bin|buynow)$/i) || 'maxBuy'] = e.max;
        return '';
      }
      leaveList();
      if (settings.snMode === 'rating') {
        if (!ensureCrit()) return 'EA-Suche nicht verfügbar – Web App neu laden.';
        settings.rfMin = settings.snRating; settings.rfMax = settings.snRatingUp ? 0 : settings.snRating; settings.rfMode = 'rot';
      } else {
        if (settings.rfMin) { settings.rfMin = 0; settings.rfMax = 0; rotRestore(); }
        if (!TC.crit || TC.own) return 'Such in der Web App einmal nach dem Spieler (Transfermarkt → Spielername → Suchen). Danach reicht hier die Leertaste.';
      }
      if (settings.snMax > 0) { const k = fld(/^max_?(buy|bin|buynow)$/i) || 'maxBuy'; TC.crit[k] = settings.snMax; }
      return '';
    }
    // ---------- MEINE LISTE: eigene Spieler mit eigenem Max.-Preis, reihum gesnipt ----------
    if (!Array.isArray(settings.snList)) settings.snList = [];   // {asset, name, rating, max, off}
    const LST = { i: 0, cur: null, crit: null, prev: null, found: [], q: '', busy: false };
    const lstActive = () => settings.snList.filter((e) => !e.off && e.max > 0 && e.asset);
    const lstOk = (p) => settings.snMode !== 'list' || !LST.cur || !LST.cur.rating || p.rating === LST.cur.rating;
    function lstAdd(o) {
      if (!o || !o.asset) return false;
      const ex = settings.snList.find((e) => String(e.asset) === String(o.asset) && (e.rating || 0) === (o.rating || 0));
      if (ex) { st.msg = `${ex.name} steht schon in deiner Liste.`; return false; }
      settings.snList.push({ asset: o.asset, rid: o.rid || null, name: o.name || `#${o.asset}`, rating: o.rating || 0, max: o.max || 0, off: false, fb: o.fb || null });
      if (settings.snList.length > 40) settings.snList.shift();
      st.msg = `${o.name} hinzugefügt${o.max ? '' : ' – jetzt noch den Max.-Preis eintragen'}.`; saveSettings(); return true;
    }
    // Spieler, nach dem du zuletzt in der Web App gesucht hast
    function lstFromEA() {
      const c = (TC.crit && !TC.own) ? TC.crit : LST.prev;
      const kd = c && Object.keys(c).find((k) => /^masked_?def_?id$/i.test(k));
      const asset = kd && toNum(c[kd]);
      if (!asset) { st.msg = 'Such zuerst in der Web App nach dem Spieler (Transfermarkt → Name → Suchen), dann hier nochmal tippen.'; return; }
      const rs = st.rows.filter((r) => { try { return toNum(r.raw.assetId ?? r.raw._assetId) === asset; } catch (e) { return false; } });
      const rr = rs.length ? rs : st.rows;
      const ratings = [...new Set(rr.map((r) => r.p.rating))];
      const kmx = Object.keys(c).find((k) => /^max_?(buy|bin|buynow)$/i.test(k));
      lstAdd({ asset, rid: ratings.length === 1 && rr.length ? rr[0].p.resourceId : null, name: rr.length ? rr[0].p.name : `Spieler #${asset}`, rating: ratings.length === 1 ? ratings[0] : 0, max: (kmx && toNum(c[kmx])) || settings.snMax || 0 });
    }
    // Namenssuche: EAs Spielerdatenbank (falls vorhanden) + geladene Rating-Liste
    async function lstFind(q) {
      q = String(q || '').trim().toLowerCase();
      LST.q = q; LST.found = [];
      if (q.length < 3) { st.msg = 'Mindestens 3 Buchstaben eingeben.'; return; }
      const seen = new Set();
      const add = (o) => { const k = `${o.asset}-${o.rating || 0}`; if (!o.asset || seen.has(k)) return; seen.add(k); LST.found.push(o); };
      const nm = (m) => m.commonName || m.c || [m.firstName || m.f, m.lastName || m.l].filter(Boolean).join(' ') || m.name || '';
      try {
        const R = W.repositories && (W.repositories.PlayerMeta || W.repositories.PlayerMetaData);
        if (R && typeof R.search === 'function') {
          let res = R.search({ name: q });
          if (res && typeof res.then === 'function') res = await res;
          if (res && !Array.isArray(res) && Array.isArray(res.items)) res = res.items;
          (Array.isArray(res) ? res : []).slice(0, 20).forEach((m) => add({ asset: toNum(m.id), rid: toNum(m.id), name: nm(m), rating: toNum(m.rating || m.r) || 0 }));
        }
      } catch (e) { /* */ }
      ROT.list.forEach((x) => { if (String(x.name).toLowerCase().includes(q)) add({ asset: x.asset, rid: x.rid || null, name: x.name, rating: x.rating, price: x.fb || x.price }); });
      LST.found = LST.found.slice(0, 15);
      st.msg = LST.found.length ? '' : `„${q}“ nicht gefunden. Alternative: In der Web App nach dem Spieler suchen, dann „＋ aus EA-Suche“.`;
    }
    // Futbin-Preis je Listenspieler + Vorschlag „lohnt bis“ (Weiterverkauf nach 5 % Steuer mit deinem Mindestgewinn)
    const lstRid = (e) => e.rid || (!e.rating ? e.asset : null);
    const lohntBis = (fbp) => { if (!fbp) return 0; const st0 = stepFor(fbp); return Math.max(0, Math.floor((afterTax(fbp) - (settings.snipeMinProfit || 0)) / st0) * st0); };
    function lstCached() { settings.snList.forEach((e) => { const r = lstRid(e); const c = r && cacheGet(`futbin:${settings.platform}:${r}`); if (c) e.fb = c; }); }
    const LCHK = { run: false, done: 0, total: 0 };
    async function lstPriceCheck() {
      if (LCHK.run) { LCHK.run = false; return; }
      const todo = settings.snList.filter((e) => lstRid(e));
      LCHK.run = true; LCHK.done = 0; LCHK.total = todo.length; render();
      for (const e of todo) {
        if (!LCHK.run) break;
        try { const v = await getPrice('futbin', { resourceId: lstRid(e), name: e.name, fullName: e.name, rating: e.rating, isPlayer: true }, 'futbin:lst'); if (v) { e.fb = v; e.fbErr = 0; } else e.fbErr = 1; }
        catch (er) { e.fbErr = 1; if (/Schutzseite/.test(er.message)) { st.msg = er.message; break; } }
        LCHK.done++; saveSettings(); render();
      }
      LCHK.run = false; saveSettings(); render();
    }
    function lstFbHtml(e, i) {
      const sx = settings.snStats[`${e.asset}-${e.rating || 0}`];
      const sl = sx && sx.n ? `<div class="by-lst-fb mut">📊 ${sx.n} Suchen · ${sx.hit} Treffer · ${sx.buy} gekauft${sx.miss ? ` · ${sx.miss} verpasst` : ''}${sx.n >= 30 && !sx.hit ? ' · <b>bisher nie getroffen – Preis zu niedrig?</b>' : ''}</div>` : '';
      return lstFbHtml0(e, i) + sl;
    }
    function lstFbHtml0(e, i) {
      if (!lstRid(e)) return '<div class="by-lst-fb mut">Futbin: Version noch unbekannt – wird beim ersten Treffer erkannt</div>';
      if (!e.fb) return `<div class="by-lst-fb mut">Futbin: ${e.fbErr ? 'nicht gefunden' : '– (💰 Preise holen)'}</div>`;
      const lb = lohntBis(e.fb), over = e.max && e.max > e.fb;
      return `<div class="by-lst-fb ${over ? 'warn' : ''}">Futbin <b>${fmt(e.fb)}</b> · lohnt bis <b>${fmt(lb)}</b>${e.max && !over ? ` · Gewinn ab deinem Preis: ${sign(afterTax(e.fb) - e.max)}` : ''}${over ? ' · ⚠ dein Preis liegt über dem Marktpreis' : ''}
        ${lb && lb !== e.max ? `<button class="fcpt-smallbtn" data-lu="${i}" title="„lohnt bis“ als Max.-Preis übernehmen">↧ übernehmen</button>` : ''}</div>`;
    }
    function lstHtml() {
      lstCached();
      const L = settings.snList, act = lstActive().length;
      return `<div class="by-lst">
        ${L.length ? `<div class="by-lst-rows">${L.map((e, i) => `<div class="by-lst-r ${e.off ? 'off' : ''} ${LST.cur === e ? 'cur' : ''}">
            <label class="ck" title="an/aus"><input type="checkbox" data-lo="${i}" ${e.off ? '' : 'checked'}></label>
            <span class="nm">${esc(e.name)}</span>
            <label title="Welche Version (Rating). Leer = jede Version dieses Spielers">⭐<input type="number" min="0" max="99" data-lr="${i}" value="${e.rating || ''}" placeholder="alle"></label>
            <label title="Höchstens so viel zahlst du für diesen Spieler">bis<input type="number" min="0" step="50" data-lm="${i}" value="${e.max || ''}" placeholder="Preis"></label>
            <button class="by-rx" data-ld="${i}" title="aus der Liste löschen">✕</button>${lstFbHtml(e, i)}</div>`).join('')}</div>
          <div class="by-rot-tools"><button class="fcpt-smallbtn" data-lp="1">${LCHK.run ? `⏹ Stopp (${LCHK.done}/${LCHK.total})` : '💰 Futbin-Preise holen'}</button><span>„lohnt bis“ = Futbin-Preis − 5 % Steuer − ${fmt(settings.snipeMinProfit || 0)} Mindestgewinn</span></div>` : '<div class="by-keys">Noch leer – unten Spieler suchen und hinzufügen.</div>'}
        <div class="by-lst-add"><input type="text" data-lq="1" placeholder="Spielername, z. B. Mbappé" value="${esc(LST.q)}"><button class="fcpt-smallbtn" data-lf="1" ${LST.busy ? 'disabled' : ''}>🔍</button><button class="fcpt-smallbtn" data-le="1" title="Spieler aus deiner letzten Suche in der Web App übernehmen">＋ aus EA-Suche</button></div>
        ${LST.found.length ? `<div class="by-lst-found">${LST.found.map((o, i) => `<div class="pt-r"><span>${o.rating ? `<b>${o.rating}</b> ` : ''}${esc(o.name)}${o.price ? ` · ≈ ${fmt(o.price)}` : ''}</span><button class="fcpt-smallbtn" data-la="${i}">＋</button></div>`).join('')}</div>` : ''}
        <div class="by-keys">${act ? `🔄 ${act} Spieler aktiv – jeder Tipp prüft den nächsten mit seinem eigenen Max.-Preis${LST.cur ? ` · zuletzt: <b>${esc(LST.cur.name)}</b> bis ${fmt(LST.cur.max)}` : ''}` : 'Spieler ohne Preis werden nicht gesucht.'}</div></div>`;
    }
    function leaveList() { if (TC.crit && TC.crit === LST.crit) { TC.crit = LST.prev; TC.own = !LST.prev; LST.cur = null; } }
    // kurze Beschreibung der übernommenen EA-Suche
    function critSummary() {
      const c = TC.crit || {}, g = (re) => { const k = Object.keys(c).find((x) => re.test(x)); return k ? c[k] : null; };
      const parts = [];
      const def = toNum(g(/^masked_?def_?id$/i)); parts.push(def ? 'ein bestimmter Spieler' : 'nur Filter, kein Spieler');
      const lev = g(/^level$/i); if (lev && lev !== 'any') parts.push(String(lev));
      if (toNum(g(/^league$/i))) parts.push('Liga');
      if (toNum(g(/^nation$/i))) parts.push('Land');
      if (toNum(g(/^club$/i))) parts.push('Verein');
      const pos = g(/^position$/i); if (pos && pos !== 'any') parts.push(String(pos));
      const mx = critMaxBuy(); parts.push(mx ? `Sofortkauf bis ${fmt(mx)}` : 'ohne Max. Sofortkauf!');
      return parts.join(' · ');
    }
    function simpleHtml() {
      const rot = settings.snMode === 'rating', lst = settings.snMode === 'list';
      const seg = `<div class="by-seg"><button data-sm="ea" class="${!rot && !lst ? 'on' : ''}" title="Genau deine Suche aus der Web App – ein Spieler oder Filter wie Gold + Liga">🔎 Meine Suche</button><button data-sm="rating" class="${rot ? 'on' : ''}">⭐ Rating</button><button data-sm="list" class="${lst ? 'on' : ''}">📋 Liste</button></div>`;
      const bd = bidMode();
      const kind = `<div class="by-kind"><button data-sk="bin" class="${bd ? '' : 'on'}">⚡ Sofortkauf</button><button data-sk="bid" class="${bd ? 'on' : ''}">🔨 Auktion bieten</button></div>`;
      const instOrEnd = bd ? `<label class="inl" title="Nur Auktionen, die bald enden">endet in max.<input type="number" min="1" max="60" data-sn="bdMaxMin" value="${settings.bdMaxMin}"> Min.</label>`
        : `<label class="ck"><input type="checkbox" data-bo="inst" ${settings.snipeInstant ? 'checked' : ''}> Sofort kaufen</label>`;
      const bdNote = bd ? `<div class="by-keys">🔨 Sucht Auktionen, deren nächstes Gebot unter deinem ${lst ? 'Preis pro Spieler' : 'Max. Gebot'} liegt – die bald endende steht oben. Leertaste = suchen, bei Treffer nochmal = bieten. Wirst du überboten, meldet sich das Tool.</div>` : '';
      if (lst) return `<div class="by-simple">${seg}${kind}<div class="by-sin">${instOrEnd}</div>${bdNote}${lstHtml()}</div>`;
      const ready = rot ? (ROT.list.length && ROT.key === `${settings.rfMin}-${settings.rfMax || 99}` ? `🔄 ${rotActive().length} Spieler mit Rating ${settings.snRating}${settings.snRatingUp ? '+' : ''} – jeder Tipp prüft einen gezielt${ROT.cur ? ` · zuletzt: ${esc(ROT.cur.name)}` : ''}` : 'Beim ersten Tipp lädt das Tool alle passenden Spieler (einmalig 1–2 Min.).')
        : (TC.crit && !TC.own ? `Deine Suche aus der Web App: ${esc(critSummary())}` : 'Stell in der Web App deine Suche ein (Spieler oder nur Filter wie Gold + Liga) und drück dort einmal „Suchen“ – dann hier nur noch Leertaste/Knopf.');
      return `<div class="by-simple">
        ${seg}${kind}
        <div class="by-sin">
          ${rot ? `<label>Rating<input type="number" min="45" max="99" data-sn="snRating" value="${settings.snRating}"></label><label class="ck"><input type="checkbox" data-sn="snRatingUp" ${settings.snRatingUp ? 'checked' : ''}> und höher</label>` : ''}
          <label>${bd ? 'Max. Gebot' : 'Max. Preis'}<input type="number" min="0" step="50" data-sn="snMax" value="${settings.snMax || ''}" placeholder="${critMaxBuy() ? fmt(critMaxBuy()) : bd && st.bidLimit ? fmt(st.bidLimit) : 'z. B. 12000'}"></label>
          ${instOrEnd}
        </div>${bdNote}
        <div class="by-keys">${ready}</div>${rot ? rotListHtml() : ''}</div>`;
    }

    // Überboten-Meldung (aus „Meine Gebote“): 1 Tipp / Taste N = nachbieten bis zu deinem Limit
    function obAlert() { return typeof TARGETS !== 'undefined' && TARGETS.alert ? TARGETS.alert() : null; }
    function outbidHtml() {
      if (typeof TARGETS === 'undefined' || !TARGETS.alerts) return '';
      const A = TARGETS.alerts();
      const sm = TARGETS.summary ? TARGETS.summary() : null;
      const strip = sm && sm.loaded && (sm.lead || sm.outbid || sm.won) ? `<div class="by-bids">🎯 Gebote: <b>${sm.lead}</b> führend${sm.outbid ? ` · <b class="neg">${sm.outbid}</b> überboten` : ''}${sm.won ? ` · <b class="pos">${sm.won}</b> gewonnen` : ''}${sm.tied ? ` · ${fmt(sm.tied)} gebunden` : ''}${sm.next ? ` · nächstes Ende <span class="by-cd" data-end="${sm.next.endAt}">${fmtTime(Math.max(0, Math.round((sm.next.endAt - Date.now()) / 1000)))}</span>` : ''}</div>` : '';
      return strip + A.map((a, n) => {
        const half = TARGETS.jumpOf(a, 'half'), lim = TARGETS.jumpOf(a, 'limit');
        return `<div class="by-ob ${a.worth ? '' : 'no'}"><div><b>🔔 Überboten: ${esc(a.p.rating ?? '')} ${esc(a.p.name)}</b><small>jetzt ${fmt(a.cur)} · <span class="by-cd" data-end="${a.endAt}">${fmtTime(Math.max(0, Math.round((a.endAt - Date.now()) / 1000)))}</span>${a.limit != null ? ` · Limit ${fmt(a.limit)}` : ''}</small></div>
        ${a.worth ? `<div class="by-obs"><button class="by-obb" data-ob="step" data-obt="${a.tid}">+ ${fmt(a.nb)}${n === 0 ? kb('N') : ''}</button>${half && half !== lim ? `<button class="by-obb alt" data-ob="half" data-obt="${a.tid}" title="Sprung-Gebot: Mitte bis zu deinem Limit">⤒ ${fmt(half)}</button>` : ''}${lim ? `<button class="by-obb alt" data-ob="limit" data-obt="${a.tid}" title="Direkt dein Limit bieten">Limit ${fmt(lim)}${n === 0 ? kb('⇧N') : ''}</button>` : ''}</div>` : '<span class="tg-no">über deinem Limit</span>'}<button class="by-rx" data-ob="x" data-obt="${a.tid}" title="ausblenden">✕</button></div>`;
      }).join('');
    }
    function render() {
      updateFloat();
      if (!box) return;
      const g = typeof GUARD !== 'undefined' ? GUARD.level() : { level: 'green', text: '' };
      let best = -1, bv = -Infinity;
      st.rows.forEach((r, i) => { if (!r.done && r.profBin != null && r.profBin > bv && r.profBin > 0) { bv = r.profBin; best = i; } });
      const coins = SBCUI.userCoins();
      box.innerHTML = `${rateHtml(coins)}
        ${simpleHtml()}
        ${outbidHtml()}
        <details class="by-adv"><summary>⚙ Erweitert</summary>
        <div class="by-opts">
          <label title="Nach jeder Suche ist der beste lohnende Deal schon „Sicher?“ – dann reicht 1× K, Enter oder Klick"><input type="checkbox" data-bo="arm" ${settings.snipeArm ? 'checked' : ''}> Schnellkauf</label>
          <label title="Tipp/Leertaste = suchen UND bei Treffer bis zu deinem Max.-Sofortkauf sofort kaufen – ohne zweiten Tipp"><input type="checkbox" data-bo="inst" ${settings.snipeInstant ? 'checked' : ''}> Sofort kaufen</label>
          <label title="Leertaste sucht – ist ein Deal bereit, kauft dieselbe Taste ihn"><input type="checkbox" data-bo="one" ${settings.snipeOneKey ? 'checked' : ''}> 1-Tasten-Modus</label>
          <label title="Wie das Tool EAs Zwischenspeicher umgeht (für frische Ergebnisse)">Cache-Trick <select data-cm="1"><option value="maxbid" ${settings.cacheMode !== 'minbuy' ? 'selected' : ''}>Max. Gebot (empfohlen)</option><option value="minbuy" ${settings.cacheMode === 'minbuy' ? 'selected' : ''}>Min. Sofortkauf</option></select></label>
          <label title="Liste/Rating-Rotation: ein Tastendruck prüft 2 Spieler nacheinander (doppelte Abdeckung, aber doppelt so viele Anfragen)"><input type="checkbox" data-bo="dbl" ${settings.snDouble ? 'checked' : ''}> 2 Spieler pro Druck</label>
          <label title="Sucht direkt über EAs Schnittstelle statt über die Seite – deutlich schneller"><input type="checkbox" data-bo="turbo" ${settings.snipeTurbo ? 'checked' : ''}> Turbo</label>
          <label title="Großer Snipe-Knopf unten auf dem Handy – funktioniert auch bei geschlossenem Tool"><input type="checkbox" data-bo="sbtn" ${settings.snipeBtn !== 'off' ? 'checked' : ''}> Handy-Knopf</label>
          <label title="Kurzer Ton, wenn ein lohnender Deal gefunden wurde"><input type="checkbox" data-bo="snd" ${settings.snipeSound ? 'checked' : ''}> Ton</label>
          <label title="Ab diesem Gewinn (nach Steuer) gilt ein Angebot als lohnend">ab <input type="number" min="0" step="50" data-bo="min" value="${settings.snipeMinProfit}"> Gewinn</label>
        </div>
        <div class="by-mode ${settings.snipeTurbo && TC.crit ? 'on' : ''}">${settings.snipeTurbo ? (TC.crit ? `⚡ Turbo aktiv – sucht direkt bei EA, ohne Seitenwechsel${critMaxBuy() ? ` · Max. SK ${fmt(critMaxBuy())}` : ''}${st.lastMs ? ` · letzte Suche ${st.lastMs} ms` : ''}` : '⚡ Turbo: einmal in der Web App normal auf „Suchen“ klicken – danach übernimmt das Tool die Suche direkt.') : 'Normaler Modus (über die Web-App-Seite)'}</div>
        ${settings.snipeInstant ? `<div class="by-ready">⚡ Sofort kaufen ist an: Jede Suche kauft ohne Rückfrage das günstigste Angebot bis <b>${critMaxBuy() ? fmt(critMaxBuy()) : '– (Max. Sofortkauf fehlt, dann wird nichts sofort gekauft)'}</b>. Höchstens 1 Kauf pro Tipp.</div>` : ''}
        ${st.hitToBuy != null || st.lastBuyMs != null ? `<div class="by-stats">Treffer → Kauf-Anfrage: ${st.hitToBuy != null ? fmt(st.hitToBuy) + ' ms' : '–'} · EA-Antwort Kauf: ${st.lastBuyMs != null ? fmt(st.lastBuyMs) + ' ms' : '–'}</div>` : ''}
        <div class="by-rf ${rfOn() ? 'on' : ''}"><div class="by-tgts-h"><b>⭐ Rating-Snipe</b><span class="by-keys">${rfOn() ? `aktiv: ${settings.rfMin}${settings.rfMax ? `–${settings.rfMax}` : '+'}${critMaxBuy() ? (rotOn() ? ` · je Spieler bis ${fmt(critMaxBuy())}` : ` · Preise ${fmt(roundPrice(critMaxBuy() * (1 - settings.rfWin / 100)))}–${fmt(critMaxBuy())}`) : ' · Max. Sofortkauf fehlt!'}` : 'aus'}</span></div>
          <div class="by-rf-in"><label>Rating ab<input type="number" min="0" max="99" data-rf="rfMin" value="${settings.rfMin || ''}" placeholder="z. B. 88"></label>
            <label>bis<input type="number" min="0" max="99" data-rf="rfMax" value="${settings.rfMax || ''}" placeholder="egal"></label>
            <label>Methode<select data-rfm="1"><option value="rot" ${settings.rfMode === 'rot' ? 'selected' : ''}>Spieler-Rotation</option><option value="win" ${settings.rfMode === 'win' ? 'selected' : ''}>Preisfenster</option></select></label>
            ${settings.rfMode === 'win' ? `<label>Fenster %<input type="number" min="5" max="90" data-rf="rfWin" value="${settings.rfWin}"></label>
            <label>Seiten<select data-rfp="1">${[1, 2, 3].map((n) => `<option value="${n}" ${settings.rfPages === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}
            ${rfOn() ? '<button class="fcpt-smallbtn" data-rf="off">Aus</button>' : ''}</div>
          ${rotOn() ? `<div class="by-keys">${ROT.list.length && ROT.key === `${settings.rfMin}-${settings.rfMax || 99}` ? `🔄 ${ROT.list.length} Spieler · jeder Tipp = 1 Spieler gezielt bis ${critMaxBuy() ? fmt(critMaxBuy()) : '– (Max. Sofortkauf fehlt!)'}${ROT.cur ? ` · zuletzt: <b>${esc(ROT.cur.name)}</b> (${ROT.i % ROT.list.length || ROT.list.length}/${ROT.list.length})` : ''}` : 'Spieler-Rotation: Das Tool sucht reihum jeden Spieler mit diesem Rating einzeln – so ist die Ergebnisliste klein und ein neues, günstiges Angebot steht sofort oben.'} <button class="fcpt-smallbtn" data-rfl="1" ${ROT.loading ? 'disabled' : ''}>${ROT.list.length ? '↻ Liste neu' : '📋 Spielerliste laden'}</button></div>` : ''}
          ${rfOn() && !rotOn() && settings.rfPages > 1 ? `<div class="by-keys">⚠ ${settings.rfPages} Seiten = ${settings.rfPages} Anfragen pro Tipp – langsamer tippen, sonst bremst EA.</div>` : ''}
          ${rfOn() && st.rfTotal != null ? `<div class="by-keys">Letzte Suche: ${st.rfTotal} Angebote im Fenster, davon ${st.rfTotal - (st.rfSkipped || 0)} mit passendem Rating${st.pageFull ? ' · Seite voll' : ''}</div>` : ''}
          ${rfOn() ? '' : '<div class="by-keys">Für „alle 88er bis 14.000“: In der Web App <b>ohne Spielernamen</b> suchen (z. B. Qualität Gold, Max. Sofortkauf 14.000), einmal Suchen drücken, hier „Rating ab 88“ eintragen. Das Tool sucht dann nur im Preisfenster knapp unter deinem Max.-Preis und nimmt nur Karten mit passendem Rating.</div>'}</div>
        ${targetsHtml()}
        ${statsHtml()}
        </details>
        ${st.flash && Date.now() < st.flash.until ? `<div class="by-flash ${st.flash.ok ? 'ok' : 'fail'}">${esc(st.flash.text)}${st.flash.sub ? ` – ${esc(st.flash.sub)}` : ''}</div>` : ''}
        ${st.log.length ? `<details class="by-log" ${st.log.length && !st.log[0].ok ? 'open' : ''}><summary>Letzte Snipes: ${st.stats.buys} ✓ · ${st.stats.miss} ✗</summary>${st.log.map((l) => `<div class="pt-r ${l.ok ? '' : 'miss'}"><span>${l.ok ? '✓' : '✗'} ${esc(l.name)} · ${fmt(l.price)}</span><span>${l.ok ? 'gekauft' : esc(l.why)} · ${new Date(l.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></div>`).join('')}</details>` : ''}
        ${st.stats.n ? `<div class="by-stats">${st.stats.n} Suchen · ${st.stats.hits} Treffer · ${st.stats.buys} gekauft · ${st.stats.miss} verpasst · Ø ${fmt(Math.round(st.stats.ms / st.stats.n))} ms</div>` : ''}
        ${(() => { const r0 = st.rows.find((r) => r.maxBid); const one = !bidMode() && st.rows.length && new Set(st.rows.map((r) => r.p.resourceId)).size === 1; return one && r0 ? `<button class="by-max" data-by="max" data-v="${r0.maxBid}" title="Setzt in der Web App „Max. Sofortkauf“ – dann zeigt EA nur noch lohnende Angebote">Max. Sofortkauf in EA auf <b>${fmt(r0.maxBid)}</b> setzen (lohnt bis)</button>` : ''; })()}
        ${st.arm && st.armMs > 4000 ? (st.arm.startsWith('bid:') ? `<div class="by-ready">Auktion bereit – ${settings.snipeOneKey ? '<b>Leertaste</b> (oder B)' : '<b>B</b> oder Klick'} bietet. <b>Esc</b> = nicht bieten.</div>` : `<div class="by-ready">Bester Deal bereit – ${settings.snipeOneKey ? '<b>Leertaste</b> (oder K)' : '<b>K</b>, <b>Enter</b> oder Klick'} kauft ihn. <b>Esc</b> = nicht kaufen.</div>`) : ''}
        ${st.rows.length ? `<div class="by-h"><b>${esc(st.label)}</b><span>${st.rows.length} Angebote · ${agoText(st.t)}</span></div>
          <div class="by-list">${st.rows.map((r, i) => rowHtml(r, i, best)).join('')}</div>
          <div class="by-note">Kaufen: ${settings.buyConfirm ? (settings.snipeArm ? `bester Deal ab +${fmt(settings.snipeMinProfit)} ist sofort bereit (1×), sonst zweimal tippen` : 'zweimal tippen (Sicherheit)') : 'ein Tipp'} · Bieten: ${settings.bidConfirm ? 'zweimal tippen' : 'ein Tipp, der Betrag steht auf dem Knopf'} · Gewinn = Marktpreis nach 5 % Steuer minus Preis</div>`
        : `<div class="by-empty">${st.busy ? '' : 'Oben wählen, was du snipen willst, Max. Preis eintragen – dann nur noch <b>Suchen</b> bzw. Leertaste.'}</div>`}
        <div class="by-tg" data-el="bytg"></div>
        <div class="by-bar">${st.msg ? `<div class="by-msg">${esc(st.msg)}</div>` : ''}
          ${(() => {
            const ar = settings.snipeOneKey && st.arm && /^(buy|bid):/.test(st.arm) && st.armMs > 4000 ? st.rows[+st.arm.split(':')[1]] : null;
            if (ar && st.arm.startsWith('bid:')) return `<button class="by-go buy" data-by="search">BIETEN ${fmt(ar.nb)}${ar.profBid != null ? ` <small>(${sign(ar.profBid)})</small>` : ''}${kb('Leertaste')}</button>`;
            return ar ? `<button class="by-go buy" data-by="search">KAUFEN ${fmt(ar.bin)}${ar.profBin != null ? ` <small>(${sign(ar.profBin)})</small>` : ''}${kb('Leertaste')}</button>`
              : `<button class="by-go" data-by="search" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Sucht …' : 'Suchen'}${kb('Leertaste')}</button>`;
          })()}${pc() ? `<div class="by-keys">${settings.snipeOneKey ? '<b>Nur Leertaste:</b> suchen – bei Treffer nochmal = kaufen · ' : ''}<kbd>↑</kbd><kbd>↓</kbd> Angebot wählen · <kbd>K</kbd> Kaufen${settings.snipeArm ? ' (bester Deal: 1×)' : ' (2×)'} · <kbd>B</kbd> Bieten · <kbd>N</kbd> Nachbieten (<kbd>⇧N</kbd> bis Limit) · <kbd>Esc</kbd> Abbrechen</div>` : ''}</div>`;
      box.querySelectorAll('input[data-rf]').forEach((inp) => inp.addEventListener('change', (e) => {
        e.stopPropagation();
        const k = inp.dataset.rf; const v = Math.max(0, parseInt(inp.value, 10) || 0);
        settings[k] = k === 'rfWin' ? Math.max(5, Math.min(90, v || 15)) : Math.min(99, v);
        if (k === 'rfMin' && !settings.rfMin) rotRestore();
        if (k === 'rfWin') settings.rfWinSet = true;
        saveSettings(); st.rows = []; st.arm = null; setTimeout(render, 0);
      }));
      const rc = box.querySelector('[data-rc]');
      if (rc) rc.addEventListener('click', (e) => { e.stopPropagation(); rotPriceCheck(); });
      const rf2 = box.querySelector('[data-rf2]');
      if (rf2) rf2.addEventListener('change', (e) => { e.stopPropagation(); settings.rotFactor = Math.max(0, parseFloat(String(rf2.value).replace(',', '.')) || 0); ROT.list.forEach(autoExclude); saveSettings(); setTimeout(render, 0); });
      const rall = box.querySelector('[data-rall]');
      if (rall) rall.addEventListener('click', (e) => { e.stopPropagation(); settings.rotExcl = {}; saveSettings(); render(); });
      box.querySelectorAll('[data-rx]').forEach((b2) => b2.addEventListener('click', (e) => {
        e.stopPropagation(); e.preventDefault();
        const a = b2.dataset.rx;
        if (settings.rotExcl[a]) delete settings.rotExcl[a]; else settings.rotExcl[a] = 1;
        ROT.open = true; saveSettings(); render();
      }));
      const rd = box.querySelector('.by-rot');
      if (rd) rd.addEventListener('toggle', () => { ROT.open = rd.open; });
      box.querySelectorAll('[data-ra]').forEach((b2) => b2.addEventListener('click', (e) => {
        e.stopPropagation(); e.preventDefault();
        const x = ROT.list.find((y) => String(y.asset) === b2.dataset.ra);
        if (x) lstAdd({ asset: x.asset, rid: x.rid || null, name: x.name, rating: x.rating, max: settings.snMax || 0, fb: x.fb || null });
        ROT.open = true; render();
      }));
      const lq = box.querySelector('[data-lq]');
      const doFind = async () => { if (!lq) return; LST.busy = true; render(); try { await lstFind(lq.value); } finally { LST.busy = false; render(); const n = box.querySelector('[data-lq]'); if (n && pc()) n.focus(); } };
      if (lq) {
        lq.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); doFind(); } });
        lq.addEventListener('keyup', (e) => e.stopPropagation()); lq.addEventListener('keypress', (e) => e.stopPropagation());
        lq.addEventListener('input', () => { LST.q = lq.value; });
      }
      const lf = box.querySelector('[data-lf]'); if (lf) lf.addEventListener('click', (e) => { e.stopPropagation(); doFind(); });
      const cm = box.querySelector('[data-cm]'); if (cm) cm.addEventListener('change', (e) => { e.stopPropagation(); settings.cacheMode = cm.value; BMP.bad = 0; saveSettings(); });
      const stx = box.querySelector('[data-stx]'); if (stx) stx.addEventListener('click', (e) => { e.stopPropagation(); settings.snStats = {}; saveSettings(); render(); });
      const lp = box.querySelector('[data-lp]'); if (lp) lp.addEventListener('click', (e) => { e.stopPropagation(); lstPriceCheck(); });
      box.querySelectorAll('[data-lu]').forEach((b2) => b2.addEventListener('click', (e) => { e.stopPropagation(); const en = settings.snList[+b2.dataset.lu]; if (en && en.fb) { en.max = lohntBis(en.fb); saveSettings(); render(); } }));
      const le = box.querySelector('[data-le]'); if (le) le.addEventListener('click', (e) => { e.stopPropagation(); lstFromEA(); render(); });
      box.querySelectorAll('[data-la]').forEach((b2) => b2.addEventListener('click', (e) => {
        e.stopPropagation(); const o = LST.found[+b2.dataset.la];
        if (o && lstAdd({ ...o, max: 0 })) LST.found = LST.found.filter((y) => y !== o);
        render(); setTimeout(() => { const m = box.querySelectorAll('[data-lm]'); const last = m[m.length - 1]; if (last) last.focus(); }, 30);
      }));
      box.querySelectorAll('[data-lm],[data-lr]').forEach((inp) => {
        inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); });
        inp.addEventListener('change', (e) => {
          e.stopPropagation();
          const en = settings.snList[+(inp.dataset.lm ?? inp.dataset.lr)]; if (!en) return;
          const v = Math.max(0, parseInt(String(inp.value).replace(/\./g, ''), 10) || 0);
          if (inp.dataset.lm != null) en.max = v; else en.rating = Math.min(99, v);
          saveSettings(); setTimeout(render, 0);
        });
      });
      box.querySelectorAll('[data-lo]').forEach((c) => c.addEventListener('change', (e) => { e.stopPropagation(); const en = settings.snList[+c.dataset.lo]; if (en) { en.off = !c.checked; saveSettings(); setTimeout(render, 0); } }));
      box.querySelectorAll('[data-ld]').forEach((b2) => b2.addEventListener('click', (e) => { e.stopPropagation(); const en = settings.snList[+b2.dataset.ld]; settings.snList.splice(+b2.dataset.ld, 1); if (LST.cur === en) LST.cur = null; saveSettings(); render(); }));
      box.querySelectorAll('[data-ob]').forEach((b2) => b2.addEventListener('click', (e) => { e.stopPropagation(); const k = b2.dataset.ob, t = b2.dataset.obt; if (k === 'x') TARGETS.dismiss(t); else TARGETS.rebid(t, k); render(); }));
      box.querySelectorAll('[data-sk]').forEach((b2) => b2.addEventListener('click', (e) => { e.stopPropagation(); settings.snKind = b2.dataset.sk; st.rows = []; st.arm = null; st.msg = ''; saveSettings(); render(); }));
      box.querySelectorAll('[data-sm]').forEach((b2) => b2.addEventListener('click', (e) => { e.stopPropagation(); settings.snMode = b2.dataset.sm; if (settings.snMode !== 'rating') { settings.rfMin = 0; settings.rfMax = 0; rotRestore(); } if (settings.snMode !== 'list') leaveList(); st.rows = []; st.arm = null; st.msg = ''; saveSettings(); render(); }));
      box.querySelectorAll('[data-sn]').forEach((inp) => inp.addEventListener('change', (e) => {
        e.stopPropagation();
        const k = inp.dataset.sn;
        if (k === 'snRatingUp') settings.snRatingUp = inp.checked;
        else settings[k] = Math.max(0, parseInt(inp.value, 10) || 0);
        if (k === 'snRating') settings.snRating = Math.max(45, Math.min(99, settings.snRating || 88));
        saveSettings(); st.rows = []; st.arm = null; setTimeout(render, 0);
      }));
      const rfm = box.querySelector('[data-rfm]');
      if (rfm) rfm.addEventListener('change', (e) => { e.stopPropagation(); settings.rfMode = rfm.value; if (settings.rfMode !== 'rot') rotRestore(); saveSettings(); setTimeout(render, 0); });
      const rfl = box.querySelector('[data-rfl]');
      if (rfl) rfl.addEventListener('click', (e) => { e.stopPropagation(); loadRotation(); });
      const rfp = box.querySelector('[data-rfp]');
      if (rfp) rfp.addEventListener('change', (e) => { e.stopPropagation(); settings.rfPages = parseInt(rfp.value, 10) || 1; saveSettings(); setTimeout(render, 0); });
      const rfo = box.querySelector('[data-rf="off"]');
      if (rfo) rfo.addEventListener('click', (e) => { e.stopPropagation(); settings.rfMin = 0; settings.rfMax = 0; rotRestore(); saveSettings(); render(); });
      const ts = box.querySelector('[data-by="tsave"]');
      if (ts) ts.addEventListener('click', (e) => { e.stopPropagation(); saveTarget(); });
      box.querySelectorAll('[data-tu]').forEach((b) => {
        b.addEventListener('click', (e) => { e.stopPropagation(); useTarget(b.dataset.tu); });
        b.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          const t = settings.snipeTargets.find((x) => x.id === b.dataset.tu);
          const n = t && W.prompt('Name für dieses Ziel:', t.label);
          if (t && n && n.trim()) { t.label = n.trim().slice(0, 40); saveSettings(); render(); }
        });
      });
      box.querySelectorAll('[data-tm]').forEach((inp) => inp.addEventListener('change', (e) => {
        e.stopPropagation();
        const t = settings.snipeTargets.find((x) => x.id === inp.dataset.tm);
        if (!t) return;
        t.maxBuy = Math.max(0, parseInt(inp.value, 10) || 0); saveSettings();
        if (activeTarget === t.id && TC.crit) { const k = fld(/^max_?(buy|bin|buynow)$/i); if (k) TC.crit[k] = t.maxBuy; }
        render();
      }));
      box.querySelectorAll('[data-tx]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        settings.snipeTargets = settings.snipeTargets.filter((x) => x.id !== b.dataset.tx);
        if (activeTarget === b.dataset.tx) activeTarget = null;
        saveSettings(); render();
      }));
      const mx = box.querySelector('[data-by="max"]');
      if (mx) mx.addEventListener('click', (e) => { e.stopPropagation(); setMaxBin(+mx.dataset.v); });
      box.querySelectorAll('[data-bo]').forEach((x) => x.addEventListener('change', (e) => {
        e.stopPropagation();
        if (x.dataset.bo === 'arm') settings.snipeArm = x.checked;
        if (x.dataset.bo === 'inst') { settings.snipeInstant = x.checked; saveSettings(); render(); }
        if (x.dataset.bo === 'dbl') { settings.snDouble = x.checked; saveSettings(); render(); }
        if (x.dataset.bo === 'sbtn') settings.snipeBtn = x.checked ? 'auto' : 'off';
        if (x.dataset.bo === 'one') { settings.snipeOneKey = x.checked; if (x.checked) settings.snipeArm = true; saveSettings(); render(); }
        if (x.dataset.bo === 'turbo') { settings.snipeTurbo = x.checked; saveSettings(); render(); }
        if (x.dataset.bo === 'snd') { settings.snipeSound = x.checked; if (x.checked) beep(); }
        if (x.dataset.bo === 'min') settings.snipeMinProfit = Math.max(0, parseInt(x.value, 10) || 0);
        saveSettings();
      }));
      box.querySelector('[data-by="search"]').addEventListener('click', (e) => { e.stopPropagation(); mainAction(); });
      box.querySelectorAll('[data-row]').forEach((rw) => rw.addEventListener('mouseenter', () => { if (pc() && st.sel !== +rw.dataset.row) { st.sel = +rw.dataset.row; box.querySelectorAll('.by-r.sel').forEach((x) => x.classList.remove('sel')); rw.classList.add('sel'); } }));
      box.querySelectorAll('[data-by="buy"],[data-by="bid"]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); act(+b.dataset.i, b.dataset.by); }));
      box.querySelectorAll('[data-by="bidmax"]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); const r = st.rows[+b.dataset.i]; if (r) act(+b.dataset.i, 'bid', true, rowJump(r)); }));
      if (typeof TARGETS !== 'undefined') TARGETS.mount(box.querySelector('[data-el="bytg"]'));
    }
    // Tastatur (PC): nur wenn das Tool offen ist und „Kaufen & Bieten“ angezeigt wird
    document.addEventListener('keydown', (ev) => {
      if (!box || !panel.classList.contains('open') || !panel.classList.contains('v-buy')) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const a = document.activeElement;
      const typing = a && (a.tagName === 'TEXTAREA' || a.isContentEditable || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && !/^(checkbox|radio|button|submit)$/i.test(a.type)));
      if (typing) { if (ev.key === 'Escape') { a.blur(); ev.preventDefault(); } return; }
      // Fokus auf Häkchen/Knöpfen darf die Leertaste nicht „schlucken“
      if (a && a !== document.body && (a.tagName === 'INPUT' || a.tagName === 'BUTTON') && panel.contains(a)) { try { a.blur(); } catch (e) { /* */ } }
      const k = ev.key;
      let done = true;
      if (ev.shiftKey && /^Digit[1-9]$/.test(ev.code || '')) { const t = settings.snipeTargets[+ev.code.slice(5) - 1]; if (t && !ev.repeat) useTarget(t.id); }
      else if (k === 'q' || k === 'Q') { if (!ev.repeat) cycleTarget(-1); }
      else if (k === 'e' || k === 'E') { if (!ev.repeat) cycleTarget(1); }
      else if (k === ' ') { if (!ev.repeat) mainAction(); }
      else if (k === 's' || k === 'S') { if (!ev.repeat) search(); }
      else if (k === 'ArrowDown' || k === 'ArrowUp') { if (st.rows.length) { st.sel = (st.sel + (k === 'ArrowDown' ? 1 : -1) + st.rows.length) % st.rows.length; st.arm = null; render(); const el = box.querySelector('.by-r.sel'); if (el) el.scrollIntoView({ block: 'nearest' }); } }
      else if (k === 'k' || k === 'K' || k === 'Enter') { if (!ev.repeat) act(st.sel, 'buy'); }
      else if (k === 'b' || k === 'B') { if (!ev.repeat) act(st.sel, 'bid'); }
      else if (k === 'n' || k === 'N') { if (!ev.repeat && typeof TARGETS !== 'undefined' && TARGETS.rebid(null, ev.shiftKey ? 'limit' : 'step')) setTimeout(render, 50); }
      else if (k === 'Escape' && st.arm) { st.arm = null; render(); }
      else done = false;
      if (done) { ev.preventDefault(); ev.stopPropagation(); }
    }, true);
    function mount(el) { box = el; render(); }
    const diag = () => ({ hooked: TC.hooked, crit: !!TC.crit, keys: TC.keys, critVals: TC.crit ? Object.fromEntries(TC.keys.filter((k) => typeof TC.crit[k] !== 'object' && typeof TC.crit[k] !== 'function').slice(0, 30).map((k) => [k, TC.crit[k]])) : null, lastMs: st.lastMs, stats: st.stats });
    return { mount, search, render, diag };
  })();
