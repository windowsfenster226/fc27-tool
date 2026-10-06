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
    if (settings.snipeOneKey === undefined) settings.snipeOneKey = true;  // Leertaste: suchen – bei bereitem Deal kaufen
    if (settings.snipeMinProfit === undefined) settings.snipeMinProfit = 200;
    let box = null;
    const st = { rows: [], msg: '', busy: false, t: 0, arm: null, armT: 0, armMs: 4000, label: '', sel: 0, lastSearch: 0,
      stats: { n: 0, hits: 0, buys: 0, ms: 0 } };
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
    // Ist gerade ein Deal kaufbereit, der mit derselben Taste gekauft werden darf?
    // (kurze Sperre, damit ein schon „unterwegs“ gedrückter Tastendruck nicht ungesehen kauft)
    const readyBuy = () => settings.snipeOneKey && st.arm && st.arm.startsWith('buy:') && st.armMs > 4000
      && Date.now() - st.armT > 350 && Date.now() - st.armT < st.armMs;
    function mainAction() {
      if (readyBuy()) act(+st.arm.split(':')[1], 'buy');
      else if (!(settings.snipeOneKey && st.arm && st.armMs > 4000 && Date.now() - st.armT <= 350)) search();
    }
    // ---------- TURBO: EAs eigene Marktsuche direkt aufrufen (ohne Seitenwechsel) ----------
    // Die Suchkriterien übernimmt das Tool, sobald du in der Web App einmal normal suchst.
    if (settings.snipeTurbo === undefined) settings.snipeTurbo = true;
    const TC = { crit: null, at: 0, keys: [], hooked: false };
    const fld = (re) => (TC.crit ? Object.keys(TC.crit).find((k) => re.test(k)) : null);
    function hookSearch() {
      const S = W.services && W.services.Item;
      if (!S || typeof S.searchTransferMarket !== 'function') return;
      if (S.searchTransferMarket.__fcpt) { TC.hooked = true; return; }
      const orig = S.searchTransferMarket;
      const f = function (crit) {
        try { if (crit && typeof crit === 'object' && !f.own) { TC.crit = crit; TC.at = Date.now(); TC.keys = Object.keys(crit).slice(0, 40); render(); } } catch (e) { /* */ }
        return orig.apply(this, arguments);
      };
      f.__fcpt = true; f.orig = orig;
      S.searchTransferMarket = f;
      TC.hooked = true;
    }
    hookSearch(); setInterval(hookSearch, 2000);
    // Cache von EA umgehen: Min.-Sofortkauf (bzw. Max.-Gebot) bei jeder Suche eine Stufe weiter
    function bumpCrit() {
      const c = TC.crit;
      if (!c || !settings.bumpMinBin) return;
      if (settings.bumpField === 'maxBid') {
        const k = fld(/^max_?bid$/i); if (!k) return;
        const start = Math.max(1000, settings.bumpStart || 1000000), cur = toNum(c[k]) || 0;
        c[k] = cur < start || cur >= 14900000 ? start : cur + stepFor(cur);
      } else {
        const k = fld(/^min_?(buy|bin|buynow)$/i); if (!k) return;
        const mb = critMaxBuy();
        let lim = Math.max(200, settings.bumpMinMax || 1000);
        if (mb > 0) lim = Math.min(lim, Math.max(150, mb - stepFor(mb) * 2));   // nie über den eigenen Max.-Preis hinaus
        const cur = toNum(c[k]) || 0;
        c[k] = cur >= lim ? 0 : cur ? cur + stepFor(cur) : 150;
      }
    }
    async function directSearch() {
      const S = W.services.Item;
      bumpCrit();
      const t0 = performance.now();
      const fn = S.searchTransferMarket.orig || S.searchTransferMarket;
      const ev = await obs(fn.call(S, TC.crit, 1), 8000);
      st.lastMs = Math.round(performance.now() - t0);
      if (ev && ev.success === false) throw Object.assign(new Error(ERR[ev.status] || `EA-Code ${ev.status || '?'}`), { status: ev.status });
      const items = ((ev && (ev.response || ev.data)) || {}).items || [];
      return items.map((raw) => ({ raw, p: mapItem(raw) })).filter((o) => o.p && o.p.active && o.p.tradeOwner !== true && o.p.buyNow);
    }
    const critMaxBuy = () => { const k = fld(/^max_?(buy|bin|buynow)$/i); return k ? toNum(TC.crit[k]) || 0 : 0; };

    // Bester lohnender Deal -> Kaufen-Knopf vorbereiten (dann reicht 1× K / Enter / Klick)
    function autoArm() {
      if (!settings.snipeArm || !settings.buyConfirm || st.arm) return;
      let bi = -1, bv = -Infinity;
      const mb = critMaxBuy();
      st.rows.forEach((r, i) => {
        if (r.done) return;
        const ok = r.profBin != null ? r.profBin >= settings.snipeMinProfit : (mb > 0 && r.bin <= mb);
        const score = r.profBin != null ? r.profBin : -r.bin;
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
    const ERR = { 461: 'zu spät – schon verkauft oder überboten', 470: 'nicht genug Münzen', 478: 'Gebot zu niedrig', 473: 'eigene Karte', 409: 'schon vergeben', 429: 'EA bremst – kurz Pause', 512: 'EA bremst – Pause machen', 521: 'EA bremst – Pause machen' };

    function mk(o) {
      const raw = o.raw, p = o.p;
      let a = {};
      try { a = raw.getAuctionData ? raw.getAuctionData() : raw._auction || {}; } catch (e) { /* */ }
      const market = p.isPlayer ? (marketPrice(p.resourceId) || cacheGet(`futbin:${settings.platform}:${p.resourceId}`) || null) : CONS.price(p);
      const cur = toNum(a.currentBid) || 0;
      const nb = cur ? cur + stepFor(cur) : (toNum(a.startingBid) || 150);
      const bin = toNum(a.buyNowPrice) || p.buyNow;
      const maxBid = market ? Math.floor((afterTax(market) - settings.tgMinProfit) / stepFor(market)) * stepFor(market) : null;
      return { raw, p, bin, cur, nb, exp: a.expires, market, maxBid, profBin: market ? afterTax(market) - bin : null, profBid: market ? afterTax(market) - nb : null, done: null, busy: false };
    }

    async function search() {
      if (st.busy) return;
      if (Date.now() - st.lastSearch < 600) return;   // Doppeltipp abfangen
      if (typeof GUARD !== 'undefined' && GUARD.blocked()) { st.msg = `🛑 ${GUARD.level().text} – Pause empfohlen. Nochmal tippen = trotzdem suchen.`; render(); return; }
      if (findConfirmButton()) { st.msg = 'In der Web App ist noch ein Kauf-Dialog offen – dort erst bestätigen oder abbrechen.'; render(); return; }
      st.busy = true; st.msg = 'Suche …'; st.arm = null; render();
      const t0 = Date.now(); st.lastSearch = t0;
      try {
        if (settings.snipeTurbo && TC.crit && W.services.Item.bid) {
          st.stats.n++;
          const offers = await directSearch();
          st.t = Date.now(); st.stats.ms += st.lastMs;
          if (!offers.length) { st.rows = []; st.msg = `Nichts gefunden (${st.lastMs} ms) – nochmal.`; return; }
          st.rows = offers.map(mk).sort((a, b) => a.bin - b.bin);
          const names = [...new Set(st.rows.map((r) => r.p.name))];
          st.label = names.length === 1 ? `${st.rows[0].p.rating ?? ''} ${names[0]}` : `${names.length} verschiedene Karten`;
          st.msg = '';
          { let bi = 0, bv = -Infinity; st.rows.forEach((r, i) => { if (r.profBin != null && r.profBin > bv) { bv = r.profBin; bi = i; } }); st.sel = bi; }
          autoArm();
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
        st.stats.n++;
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

    async function act(i, kind) {
      const r = st.rows[i];
      if (!r || r.busy || (r.done && !r.done.bad && kind === 'buy')) return;
      const amount = kind === 'buy' ? r.bin : r.nb;
      const key = `${kind}:${i}`;
      const needConfirm = kind === 'buy' ? settings.buyConfirm : settings.bidConfirm;
      if (needConfirm && (st.arm !== key || Date.now() - st.armT > st.armMs)) {
        st.arm = key; st.armT = Date.now(); st.armMs = 4000; render();
        setTimeout(() => { if (st.arm === key) { st.arm = null; render(); } }, 4000);
        return;
      }
      st.arm = null;
      const S = W.services && W.services.Item;
      if (!S || typeof S.bid !== 'function') { r.done = { bad: true, t: 'EA-Funktion zum Bieten nicht gefunden' }; render(); return; }
      if ((SBCUI.userCoins() ?? Infinity) < amount) { r.done = { bad: true, t: 'nicht genug Münzen' }; render(); return; }
      r.busy = true; render();
      try {
        const ev = await obs(S.bid(r.raw, amount));
        if (ev && ev.success === false) r.done = { bad: true, t: `${kind === 'buy' ? 'Kauf' : 'Gebot'} abgelehnt: ${ERR[ev.status] || `Code ${ev.status || '?'}`}` };
        else if (kind === 'buy') { r.done = { t: `✓ gekauft für ${fmt(amount)} – liegt in „Nicht zugewiesen“` }; showToast(`💰 ${r.p.name} für ${fmt(amount)} gekauft`); st.stats.buys++; }
        else { r.done = { t: `✓ Höchstbietender mit ${fmt(amount)} – steht unter „Meine Gebote“` }; r.cur = amount; r.nb = amount + stepFor(amount); if (r.market) r.profBid = afterTax(r.market) - r.nb; }
      } catch (e) { r.done = { bad: true, t: e.message }; }
      r.busy = false; render();
      if (kind === 'bid' && typeof TARGETS !== 'undefined' && TARGETS.reload) TARGETS.reload();
    }

    const sign = (v) => (v == null ? '' : `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`);
    function rowHtml(r, i, best) {
      const armB = st.arm === `buy:${i}`, armD = st.arm === `bid:${i}`;
      const bidOk = r.nb < r.bin;
      const worthBid = r.maxBid == null || r.nb <= r.maxBid;
      const bought = r.done && !r.done.bad && /gekauft/.test(r.done.t);
      const sel = pc() && i === st.sel;
      return `<div class="by-r ${bought ? 'won' : ''} ${i === best ? 'best' : ''} ${sel ? 'sel' : ''}" data-row="${i}">
        <div class="by-c"><b>${esc(r.p.isCons ? '🧪' : r.p.rating ?? '')}</b><small>${esc(r.p.position || '')}</small></div>
        <div class="by-n"><div class="nm">${esc(r.p.name)}${i === best ? ' <span class="by-best">Bester Deal</span>' : ''}</div>
          <small>${fmtTime(r.exp)} · Gebot ${r.cur ? fmt(r.cur) : '–'} · Markt ${r.market ? fmt(r.market) : '…'}</small>
          ${r.done ? `<small class="${r.done.bad ? 'neg' : 'pos'}">${esc(r.done.t)}</small>` : ''}</div>
        ${bought ? '' : `<div class="by-a">
          <button data-by="buy" data-i="${i}" class="b ${armB ? 'arm' : ''}" ${r.busy ? 'disabled' : ''}><span class="l">${armB ? 'Sicher?' : 'Kaufen'}${sel ? kb('K') : ''}</span><b>${fmt(r.bin)}</b><small class="${r.profBin == null ? '' : r.profBin >= 0 ? 'pos' : 'neg'}">${r.profBin == null ? '&nbsp;' : sign(r.profBin)}</small></button>
          ${bidOk ? `<button data-by="bid" data-i="${i}" class="d ${armD ? 'arm' : ''} ${worthBid ? '' : 'no'}" ${r.busy ? 'disabled' : ''}><span class="l">${armD ? 'Sicher?' : 'Bieten'}${sel ? kb('B') : ''}</span><b>${fmt(r.nb)}</b><small class="${r.profBid == null ? '' : r.profBid >= 0 ? 'pos' : 'neg'}">${r.profBid == null ? '&nbsp;' : worthBid ? sign(r.profBid) : 'lohnt nicht'}</small></button>` : ''}
        </div>`}
      </div>`;
    }

    function render() {
      if (!box) return;
      const g = typeof GUARD !== 'undefined' ? GUARD.level() : { level: 'green', text: '' };
      let best = -1, bv = -Infinity;
      st.rows.forEach((r, i) => { if (!r.done && r.profBin != null && r.profBin > bv && r.profBin > 0) { bv = r.profBin; best = i; } });
      const coins = SBCUI.userCoins();
      box.innerHTML = `<div class="by-top"><span class="by-g ${g.level}">${g.level === 'red' ? 'Pause empfohlen' : g.level === 'yellow' ? 'Langsamer suchen' : 'Sicher'}</span>
          <span class="by-coins">${coins != null ? `${fmt(coins)} Münzen` : ''}</span></div>
        <div class="by-opts">
          <label title="Nach jeder Suche ist der beste lohnende Deal schon „Sicher?“ – dann reicht 1× K, Enter oder Klick"><input type="checkbox" data-bo="arm" ${settings.snipeArm ? 'checked' : ''}> Schnellkauf</label>
          <label title="Leertaste sucht – ist ein Deal bereit, kauft dieselbe Taste ihn"><input type="checkbox" data-bo="one" ${settings.snipeOneKey ? 'checked' : ''}> 1-Tasten-Modus</label>
          <label title="Sucht direkt über EAs Schnittstelle statt über die Seite – deutlich schneller"><input type="checkbox" data-bo="turbo" ${settings.snipeTurbo ? 'checked' : ''}> Turbo</label>
          <label title="Kurzer Ton, wenn ein lohnender Deal gefunden wurde"><input type="checkbox" data-bo="snd" ${settings.snipeSound ? 'checked' : ''}> Ton</label>
          <label title="Ab diesem Gewinn (nach Steuer) gilt ein Angebot als lohnend">ab <input type="number" min="0" step="50" data-bo="min" value="${settings.snipeMinProfit}"> Gewinn</label>
        </div>
        <div class="by-mode ${settings.snipeTurbo && TC.crit ? 'on' : ''}">${settings.snipeTurbo ? (TC.crit ? `⚡ Turbo aktiv – sucht direkt bei EA, ohne Seitenwechsel${critMaxBuy() ? ` · Max. SK ${fmt(critMaxBuy())}` : ''}${st.lastMs ? ` · letzte Suche ${st.lastMs} ms` : ''}` : '⚡ Turbo: einmal in der Web App normal auf „Suchen“ klicken – danach übernimmt das Tool die Suche direkt.') : 'Normaler Modus (über die Web-App-Seite)'}</div>
        ${st.stats.n ? `<div class="by-stats">${st.stats.n} Suchen · ${st.stats.hits} Treffer · ${st.stats.buys} gekauft · Ø ${fmt(Math.round(st.stats.ms / st.stats.n))} ms</div>` : ''}
        ${(() => { const r0 = st.rows.find((r) => r.maxBid); const one = st.rows.length && new Set(st.rows.map((r) => r.p.resourceId)).size === 1; return one && r0 ? `<button class="by-max" data-by="max" data-v="${r0.maxBid}" title="Setzt in der Web App „Max. Sofortkauf“ – dann zeigt EA nur noch lohnende Angebote">Max. Sofortkauf in EA auf <b>${fmt(r0.maxBid)}</b> setzen (lohnt bis)</button>` : ''; })()}
        ${st.arm && st.armMs > 4000 ? `<div class="by-ready">Bester Deal bereit – ${settings.snipeOneKey ? '<b>Leertaste</b> (oder K)' : '<b>K</b>, <b>Enter</b> oder Klick'} kauft ihn. <b>Esc</b> = nicht kaufen.</div>` : ''}
        ${st.rows.length ? `<div class="by-h"><b>${esc(st.label)}</b><span>${st.rows.length} Angebote · ${agoText(st.t)}</span></div>
          <div class="by-list">${st.rows.map((r, i) => rowHtml(r, i, best)).join('')}</div>
          <div class="by-note">Kaufen: ${settings.buyConfirm ? (settings.snipeArm ? `bester Deal ab +${fmt(settings.snipeMinProfit)} ist sofort bereit (1×), sonst zweimal tippen` : 'zweimal tippen (Sicherheit)') : 'ein Tipp'} · Bieten: ${settings.bidConfirm ? 'zweimal tippen' : 'ein Tipp, der Betrag steht auf dem Knopf'} · Gewinn = Marktpreis nach 5 % Steuer minus Preis</div>`
        : `<div class="by-empty">${st.busy ? '' : 'Tippe auf <b>Suchen</b>. Das Tool nutzt deine Suche aus der Web App und zeigt die Angebote hier – mit Gewinn, Kaufen und Bieten.'}</div>`}
        <div class="by-tg" data-el="bytg"></div>
        <div class="by-bar">${st.msg ? `<div class="by-msg">${esc(st.msg)}</div>` : ''}
          ${(() => {
            const ar = settings.snipeOneKey && st.arm && st.arm.startsWith('buy:') && st.armMs > 4000 ? st.rows[+st.arm.split(':')[1]] : null;
            return ar ? `<button class="by-go buy" data-by="search">KAUFEN ${fmt(ar.bin)}${ar.profBin != null ? ` <small>(${sign(ar.profBin)})</small>` : ''}${kb('Leertaste')}</button>`
              : `<button class="by-go" data-by="search" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Sucht …' : 'Suchen'}${kb('Leertaste')}</button>`;
          })()}${pc() ? `<div class="by-keys">${settings.snipeOneKey ? '<b>Nur Leertaste:</b> suchen – bei Treffer nochmal = kaufen · ' : ''}<kbd>↑</kbd><kbd>↓</kbd> Angebot wählen · <kbd>K</kbd> Kaufen${settings.snipeArm ? ' (bester Deal: 1×)' : ' (2×)'} · <kbd>B</kbd> Bieten · <kbd>Esc</kbd> Abbrechen</div>` : ''}</div>`;
      const mx = box.querySelector('[data-by="max"]');
      if (mx) mx.addEventListener('click', (e) => { e.stopPropagation(); setMaxBin(+mx.dataset.v); });
      box.querySelectorAll('[data-bo]').forEach((x) => x.addEventListener('change', (e) => {
        e.stopPropagation();
        if (x.dataset.bo === 'arm') settings.snipeArm = x.checked;
        if (x.dataset.bo === 'one') { settings.snipeOneKey = x.checked; if (x.checked) settings.snipeArm = true; saveSettings(); render(); }
        if (x.dataset.bo === 'turbo') { settings.snipeTurbo = x.checked; saveSettings(); render(); }
        if (x.dataset.bo === 'snd') { settings.snipeSound = x.checked; if (x.checked) beep(); }
        if (x.dataset.bo === 'min') settings.snipeMinProfit = Math.max(0, parseInt(x.value, 10) || 0);
        saveSettings();
      }));
      box.querySelector('[data-by="search"]').addEventListener('click', (e) => { e.stopPropagation(); mainAction(); });
      box.querySelectorAll('[data-row]').forEach((rw) => rw.addEventListener('mouseenter', () => { if (pc() && st.sel !== +rw.dataset.row) { st.sel = +rw.dataset.row; box.querySelectorAll('.by-r.sel').forEach((x) => x.classList.remove('sel')); rw.classList.add('sel'); } }));
      box.querySelectorAll('[data-by="buy"],[data-by="bid"]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); act(+b.dataset.i, b.dataset.by); }));
      if (typeof TARGETS !== 'undefined') TARGETS.mount(box.querySelector('[data-el="bytg"]'));
    }
    // Tastatur (PC): nur wenn das Tool offen ist und „Kaufen & Bieten“ angezeigt wird
    document.addEventListener('keydown', (ev) => {
      if (!box || !panel.classList.contains('open') || !panel.classList.contains('v-buy')) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const a = document.activeElement;
      if (a && (/^(input|textarea|select)$/i.test(a.tagName) || a.isContentEditable)) return;
      const k = ev.key;
      let done = true;
      if (k === ' ') { if (!ev.repeat) mainAction(); }
      else if (k === 's' || k === 'S') { if (!ev.repeat) search(); }
      else if (k === 'ArrowDown' || k === 'ArrowUp') { if (st.rows.length) { st.sel = (st.sel + (k === 'ArrowDown' ? 1 : -1) + st.rows.length) % st.rows.length; st.arm = null; render(); const el = box.querySelector('.by-r.sel'); if (el) el.scrollIntoView({ block: 'nearest' }); } }
      else if (k === 'k' || k === 'K' || k === 'Enter') { if (!ev.repeat) act(st.sel, 'buy'); }
      else if (k === 'b' || k === 'B') { if (!ev.repeat) act(st.sel, 'bid'); }
      else if (k === 'Escape' && st.arm) { st.arm = null; render(); }
      else done = false;
      if (done) { ev.preventDefault(); ev.stopPropagation(); }
    }, true);
    function mount(el) { box = el; render(); }
    const diag = () => ({ hooked: TC.hooked, crit: !!TC.crit, keys: TC.keys, critVals: TC.crit ? Object.fromEntries(TC.keys.filter((k) => typeof TC.crit[k] !== 'object' && typeof TC.crit[k] !== 'function').slice(0, 30).map((k) => [k, TC.crit[k]])) : null, lastMs: st.lastMs, stats: st.stats });
    return { mount, search, render, diag };
  })();
