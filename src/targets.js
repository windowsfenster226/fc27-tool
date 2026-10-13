  // ==================================================================
  // TRANSFERZIELE-MANAGER: deine Gebote im Blick – überboten? lohnt Nachbieten?
  // Geboten wird nur, wenn du auf „Nachbieten“ klickst.
  // ==================================================================
  const TARGETS = (() => {
    if (settings.tgMinProfit === undefined) settings.tgMinProfit = 200;
    if (settings.tgAuto === undefined) settings.tgAuto = false;
    if (settings.tgWatch === undefined) settings.tgWatch = true;   // eigene Gebote überwachen (nur Transferziele lesen, nie selbst bieten)
    if (!settings.tgLimits || typeof settings.tgLimits !== 'object') settings.tgLimits = {};   // tradeId -> {l: Limit, t: Zeit}
    let box = null, timer = null;
    const st = { list: null, msg: '', busy: false, prev: {}, alerts: [], aTids: new Set(), watchUntil: 0, lastLoad: 0 };
    let actx = null;
    function tone() {
      try {
        actx = actx || new (W.AudioContext || W.webkitAudioContext)();
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'triangle'; o.frequency.value = 660; g.gain.value = 0.09;
        o.connect(g); g.connect(actx.destination); o.start();
        o.frequency.setValueAtTime(440, actx.currentTime + 0.12); o.frequency.setValueAtTime(660, actx.currentTime + 0.24);
        o.stop(actx.currentTime + 0.36);
      } catch (e) { /* */ }
    }
    const limitOf = (tid, maxBid) => { const x = settings.tgLimits[tid]; return x && x.l ? x.l : maxBid; };
    // Gebot aus „Kaufen & Bieten“ merken: Limit + Überwachung starten
    function track(tid, limit) {
      if (tid == null) return;
      if (limit) settings.tgLimits[tid] = { l: limit, t: Date.now() };
      const now = Date.now();
      for (const k of Object.keys(settings.tgLimits)) if (now - (settings.tgLimits[k].t || 0) > 2 * 86400000) delete settings.tgLimits[k];
      saveSettings();
      st.watchUntil = Date.now() + 70 * 60000;
      st.prev[tid] = 'lead';
      setTimeout(() => load(true), 4000);
    }
    const obs = (o, ms = 12000) => new Promise((resolve, reject) => {
      if (!o || typeof o.observe !== 'function') return reject(new Error('Keine EA-Antwort'));
      const sub = {};
      const t = setTimeout(() => reject(new Error('Zeitüberschreitung bei EA')), ms);
      o.observe(sub, (ob, ev) => { clearTimeout(t); try { ob.unobserve(sub); } catch (e) { /* */ } resolve(ev || {}); });
    });
    const nextBid = (cur, start) => (cur ? cur + stepFor(cur) : start || 150);

    function row(ent) {
      const p = mapItem(ent);
      if (!p) return null;
      let a = {};
      try { a = ent.getAuctionData ? ent.getAuctionData() : ent._auction || {}; } catch (e) { /* */ }
      const bidState = String(a.bidState || '').toLowerCase();
      const trade = String(a.tradeState || '').toLowerCase();
      const lead = bidState === 'highest';
      const status = trade === 'closed' ? (lead ? 'won' : 'lost') : trade === 'expired' ? (lead ? 'won' : 'lost') : lead ? 'lead' : bidState === 'outbid' ? 'outbid' : 'watch';
      const market = p.isPlayer ? (marketPrice(p.resourceId) || cacheGet(`futbin:${settings.platform}:${p.resourceId}`) || null) : null;
      const maxBid = market ? Math.floor((afterTax(market) - settings.tgMinProfit) / stepFor(market)) * stepFor(market) : null;
      const nb = nextBid(a.currentBid, a.startingBid);
      const tid = a.tradeId;
      const limit = limitOf(tid, maxBid), own = !!(settings.tgLimits[tid] && settings.tgLimits[tid].l);
      return { ent, p, status, tid, cur: a.currentBid || 0, bin: a.buyNowPrice, exp: a.expires, endAt: Date.now() + (a.expires || 0) * 1000, market, maxBid, limit, own, nb, worth: limit != null && nb <= limit };
    }

    async function load(quiet) {
      const S = W.services && W.services.Item;
      if (!S || typeof S.requestWatchedItems !== 'function') { st.msg = 'EA-Funktion für Transferziele nicht gefunden.'; render(); return; }
      if (!quiet) { st.busy = true; st.msg = 'Lade Transferziele …'; render(); }
      try {
        const ev = await obs(S.requestWatchedItems());
        const items = (ev.response || ev.data || {}).items || [];
        st.list = items.map(row).filter(Boolean);
        const order = { outbid: 0, lead: 1, watch: 2, won: 3, lost: 4 };
        st.list.sort((a, b) => order[a.status] - order[b.status] || (a.exp || 0) - (b.exp || 0));
        st.msg = st.list.length ? '' : 'Keine Transferziele.';
        st.lastLoad = Date.now();
        // Überboten erkennen (vorher führend / gerade selbst geboten -> jetzt überboten)
        const fresh = [];
        st.list.forEach((r) => {
          const was = st.prev[r.tid];
          if (r.status === 'outbid' && was && was !== 'outbid') fresh.push(r);
          st.prev[r.tid] = r.status;
        });
        fresh.forEach((r) => st.aTids.add(r.tid));
        st.list.forEach((r) => { if (r.status !== 'outbid') st.aTids.delete(r.tid); });
        st.alerts = st.list.filter((r) => st.aTids.has(r.tid) && r.endAt > Date.now());
        if (fresh.length && settings.tgWatch) {
          const r0 = fresh[0];
          tone(); try { if (navigator.vibrate) navigator.vibrate([120, 80, 120]); } catch (e) { /* */ }
          showToast(`🔔 Überboten: ${r0.p.name} (jetzt ${fmt(r0.cur)})${r0.worth ? ` – nachbieten ${fmt(r0.nb)}, dein Limit ${fmt(r0.limit)}` : ' – über deinem Limit'}`, !r0.worth);
          try { if (typeof WATCH !== 'undefined' && document.visibilityState !== 'visible') WATCH.push(`Überboten: ${r0.p.name} – jetzt ${fmt(r0.cur)}`, 'FC27 Gebote'); } catch (e) { /* */ }
        }
        if (st.list.some((r) => (r.status === 'lead' || r.status === 'outbid') && r.endAt > Date.now())) st.watchUntil = Math.max(st.watchUntil, Date.now() + 5 * 60000);
        try { if (typeof BUY !== 'undefined' && BUY.render) BUY.render(); } catch (e) { /* */ }
        // fehlende Futbin-Preise nachladen (gedrosselt)
        st.list.filter((r) => r.p.isPlayer && !r.market).slice(0, 8).forEach((r) => {
          getPrice('futbin', r.p).then(() => { const n = row(r.ent); if (n) Object.assign(r, n); render(); }).catch(() => {});
        });
      } catch (e) { st.msg = 'Fehler: ' + e.message; } finally { st.busy = false; render(); }
    }

    async function bid(i) {
      const r = st.list[i];
      if (!r || r.busy) return;
      if (r.limit != null && r.nb > r.limit) { showToast(`${r.p.name}: ${fmt(r.nb)} liegt über deinem Limit ${fmt(r.limit)} – nicht geboten.`, true); return; }
      st.alerts = st.alerts.filter((x) => x.tid !== r.tid); st.aTids.delete(r.tid);
      const S = W.services.Item;
      r.busy = true; render();
      try {
        const ev = await obs(S.bid(r.ent, r.nb));
        showToast(ev && ev.success === false ? `Gebot abgelehnt (${ev.status || '?'})` : `✓ ${r.p.name}: ${fmt(r.nb)} geboten`, ev && ev.success === false);
        if (!(ev && ev.success === false)) { st.prev[r.tid] = 'lead'; st.watchUntil = Date.now() + 70 * 60000; }
      } catch (e) { showToast('Gebot fehlgeschlagen: ' + e.message, true); }
      r.busy = false;
      await load(true);
    }

    const LBL = { outbid: ['Überboten', 'bad'], lead: ['Führend', 'good'], watch: ['Beobachtet', ''], won: ['Gewonnen', 'good'], lost: ['Verloren', 'mid'] };
    function render() {
      if (!box) return;
      const L = st.list || [];
      const cnt = (s) => L.filter((r) => r.status === s).length;
      box.innerHTML = `<div class="fcpt-sgroup"><h4>🎯 Meine Gebote</h4>
        <div class="note" style="font-size:12px;color:var(--ink2)">Deine Gebote: wo du überboten wurdest und bis wohin Nachbieten noch Profit bringt (Futbin-Preis nach Steuer minus Mindest-Profit).</div>
        <div class="fcpt-set"><span>Mindest-Profit beim Weiterverkauf</span><input type="number" min="0" step="50" data-tg="min" value="${settings.tgMinProfit}"></div>
        <div class="fcpt-set"><span>Überboten-Alarm<small>Nach einem Gebot prüft das Tool alle 15 Sek. deine Transferziele (nur lesen) und meldet sich mit Ton, wenn du überboten wirst</small></span><input type="checkbox" class="fcpt-sw" data-tg="watch" ${settings.tgWatch ? 'checked' : ''}></div>
        <div class="fcpt-set"><span>Alle 20 Sek. aktualisieren<small>Nur solange dieser Bereich offen ist</small></span><input type="checkbox" class="fcpt-sw" data-tg="auto" ${settings.tgAuto ? 'checked' : ''}></div>
        <button class="fcpt-bigbtn" data-tg="load" ${st.busy ? 'disabled' : ''}>🎯 Transferziele laden</button>
        ${st.msg ? `<div class="fcpt-stand">${esc(st.msg)}</div>` : ''}
        ${L.length ? `<div class="ni-sum"><span>${cnt('outbid')}× überboten</span><span>${cnt('lead')}× führend</span><span>${cnt('won')}× gewonnen</span></div>
        <div class="ni-list">${L.map((r, i) => `<div class="ni-r tg-${r.status}">
          <span class="ni-n"><b>${esc(r.p.rating ?? '')}</b> ${esc(r.p.name)} <span class="trel ${LBL[r.status][1]}">${LBL[r.status][0]}</span>
            <small>Gebot ${fmt(r.cur)}${r.bin ? ` · SK ${fmt(r.bin)}` : ''}${r.market ? ` · Futbin ${fmt(r.market)}` : ''}${r.limit != null ? ` · ${r.own ? 'dein Limit' : 'lohnt bis'} <b>${fmt(r.limit)}</b>` : ''}${r.status === 'outbid' || r.status === 'lead' || r.status === 'watch' ? ` · ${fmtTime(r.exp)}` : ''}</small></span>
          ${r.status === 'outbid' || r.status === 'watch' ? (r.worth ? `<button class="fcpt-smallbtn go" data-tg-bid="${i}" ${r.busy ? 'disabled' : ''}>Bieten ${fmt(r.nb)}</button>` : `<span class="tg-no">${r.limit != null ? (r.own ? 'über deinem Limit' : 'lohnt nicht mehr') : 'Preis fehlt'}</span>`) : ''}
        </div>`).join('')}</div>` : ''}
      </div>`;
      const on = (sel, ev, fn) => box.querySelectorAll(sel).forEach((x) => x.addEventListener(ev, (e) => { e.stopPropagation(); fn(x); }));
      on('[data-tg="load"]', 'click', () => load());
      on('[data-tg="min"]', 'change', (x) => { settings.tgMinProfit = Math.max(0, parseInt(x.value, 10) || 0); saveSettings(); if (st.list) { st.list = st.list.map((r) => row(r.ent) || r); render(); } });
      on('[data-tg="auto"]', 'change', (x) => { settings.tgAuto = x.checked; saveSettings(); });
      on('[data-tg="watch"]', 'change', (x) => { settings.tgWatch = x.checked; saveSettings(); });
      on('[data-tg-bid]', 'click', (x) => bid(+x.dataset.tgBid));
    }

    timer = setInterval(() => {
      if (!settings.tgAuto || !box || !st.list || st.busy || document.visibilityState !== 'visible') return;
      const visible = box.offsetParent !== null && panel.classList.contains('open');
      if (visible) load(true);
    }, 20000);

    // Überwachung eigener Gebote: nur solange Gebote laufen, Tab sichtbar ist und höchstens alle 15 Sek.
    setInterval(() => {
      if (!settings.tgWatch || st.busy || Date.now() > st.watchUntil || document.visibilityState !== 'visible') return;
      if (Date.now() - st.lastLoad < 14000) return;
      load(true);
    }, 3000);
    // Für „Kaufen & Bieten“: aktuelle Überboten-Meldung (noch laufend)
    function alert() {
      st.alerts = st.alerts.filter((r) => r.endAt > Date.now() && r.status === 'outbid');
      return st.alerts[0] || null;
    }
    function rebid() { const a = alert(); if (!a) return false; const i = st.list.indexOf(a); if (i >= 0) bid(i); return true; }
    function dismiss() { const a = alert(); if (a) { st.alerts = st.alerts.filter((x) => x !== a); st.aTids.delete(a.tid); } }
    function mount(el) { box = el; render(); }
    return { mount, reload: () => load(true), track, alert, rebid, dismiss };
  })();
