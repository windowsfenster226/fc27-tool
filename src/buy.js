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
    let box = null;
    const st = { rows: [], msg: '', busy: false, t: 0, arm: null, armT: 0, label: '', sel: 0 };
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
      if (typeof GUARD !== 'undefined' && GUARD.blocked()) { st.msg = `🛑 ${GUARD.level().text} – Pause empfohlen. Nochmal tippen = trotzdem suchen.`; render(); return; }
      if (findConfirmButton()) { st.msg = 'In der Web App ist noch ein Kauf-Dialog offen – dort erst bestätigen oder abbrechen.'; render(); return; }
      st.busy = true; st.msg = 'Suche …'; render();
      try {
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
        const got = await waitFor(() => (noResults() ? 'none' : marketOffers().some((o) => !before.has(o.p.tradeId)) ? 'rows' : null), 4000, 50);
        st.t = Date.now();
        if (got !== 'rows') { st.rows = []; st.msg = got === 'none' ? 'Nichts gefunden – nochmal tippen.' : 'Keine Ergebnisse erkannt – nochmal tippen.'; return; }
        await sleep(150);
        st.rows = marketOffers().filter((o) => !before.has(o.p.tradeId)).map((o) => mk({ p: o.p, raw: (marketRows.get(o.p.tradeId) || {}).raw })).filter((r) => r.raw).sort((a, b) => a.bin - b.bin);
        const names = [...new Set(st.rows.map((r) => r.p.name))];
        st.label = names.length === 1 ? `${st.rows[0].p.rating ?? ''} ${names[0]}` : `${names.length} verschiedene Karten`;
        st.msg = '';
        { let bi = 0, bv = -Infinity; st.rows.forEach((r, i) => { if (r.profBin != null && r.profBin > bv) { bv = r.profBin; bi = i; } }); st.sel = bi; }
        // fehlende Futbin-Preise nachladen
        st.rows.filter((r) => r.p.isPlayer && !r.market).slice(0, 4).forEach((r) => {
          getPrice('futbin', r.p).then(() => { const n = mk({ raw: r.raw, p: r.p }); Object.assign(r, { market: n.market, maxBid: n.maxBid, profBin: n.profBin, profBid: n.profBid }); render(); }).catch(() => {});
        });
      } catch (e) { st.msg = 'Fehler: ' + e.message; } finally { st.busy = false; render(); }
    }

    async function act(i, kind) {
      const r = st.rows[i];
      if (!r || r.busy || (r.done && !r.done.bad && kind === 'buy')) return;
      const amount = kind === 'buy' ? r.bin : r.nb;
      const key = `${kind}:${i}`;
      const needConfirm = kind === 'buy' ? settings.buyConfirm : settings.bidConfirm;
      if (needConfirm && (st.arm !== key || Date.now() - st.armT > 4000)) {
        st.arm = key; st.armT = Date.now(); render();
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
        else if (kind === 'buy') { r.done = { t: `✓ gekauft für ${fmt(amount)} – liegt in „Nicht zugewiesen“` }; showToast(`💰 ${r.p.name} für ${fmt(amount)} gekauft`); }
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
        ${st.rows.length ? `<div class="by-h"><b>${esc(st.label)}</b><span>${st.rows.length} Angebote · ${agoText(st.t)}</span></div>
          <div class="by-list">${st.rows.map((r, i) => rowHtml(r, i, best)).join('')}</div>
          <div class="by-note">Kaufen: ${settings.buyConfirm ? 'zweimal tippen (Sicherheit)' : 'ein Tipp'} · Bieten: ${settings.bidConfirm ? 'zweimal tippen' : 'ein Tipp, der Betrag steht auf dem Knopf'} · Gewinn = Marktpreis nach 5 % Steuer minus Preis</div>`
        : `<div class="by-empty">${st.busy ? '' : 'Tippe auf <b>Suchen</b>. Das Tool nutzt deine Suche aus der Web App und zeigt die Angebote hier – mit Gewinn, Kaufen und Bieten.'}</div>`}
        <div class="by-tg" data-el="bytg"></div>
        <div class="by-bar">${st.msg ? `<div class="by-msg">${esc(st.msg)}</div>` : ''}
          <button class="by-go" data-by="search" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Sucht …' : 'Suchen'}${kb('Leertaste')}</button>${pc() ? '<div class="by-keys"><kbd>↑</kbd><kbd>↓</kbd> Angebot wählen · <kbd>K</kbd> Kaufen (2×) · <kbd>B</kbd> Bieten · <kbd>Esc</kbd> Abbrechen</div>' : ''}</div>`;
      box.querySelector('[data-by="search"]').addEventListener('click', (e) => { e.stopPropagation(); search(); });
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
      if (k === ' ' || k === 's' || k === 'S') { if (!ev.repeat) search(); }
      else if (k === 'ArrowDown' || k === 'ArrowUp') { if (st.rows.length) { st.sel = (st.sel + (k === 'ArrowDown' ? 1 : -1) + st.rows.length) % st.rows.length; st.arm = null; render(); const el = box.querySelector('.by-r.sel'); if (el) el.scrollIntoView({ block: 'nearest' }); } }
      else if (k === 'k' || k === 'K' || k === 'Enter') { if (!ev.repeat) act(st.sel, 'buy'); }
      else if (k === 'b' || k === 'B') { if (!ev.repeat) act(st.sel, 'bid'); }
      else if (k === 'Escape' && st.arm) { st.arm = null; render(); }
      else done = false;
      if (done) { ev.preventDefault(); ev.stopPropagation(); }
    }, true);
    function mount(el) { box = el; render(); }
    return { mount, search, render };
  })();
