  // ==================================================================
  // TRANSFERZIELE-MANAGER: deine Gebote im Blick – überboten? lohnt Nachbieten?
  // Geboten wird nur, wenn du auf „Nachbieten“ klickst.
  // ==================================================================
  const TARGETS = (() => {
    if (settings.tgMinProfit === undefined) settings.tgMinProfit = 200;
    if (settings.tgAuto === undefined) settings.tgAuto = false;
    let box = null, timer = null;
    const st = { list: null, msg: '', busy: false };
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
      return { ent, p, status, cur: a.currentBid || 0, bin: a.buyNowPrice, exp: a.expires, market, maxBid, nb, worth: maxBid != null && nb <= maxBid };
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
        // fehlende Futbin-Preise nachladen (gedrosselt)
        st.list.filter((r) => r.p.isPlayer && !r.market).slice(0, 8).forEach((r) => {
          getPrice('futbin', r.p).then(() => { const n = row(r.ent); if (n) Object.assign(r, n); render(); }).catch(() => {});
        });
      } catch (e) { st.msg = 'Fehler: ' + e.message; } finally { st.busy = false; render(); }
    }

    async function bid(i) {
      const r = st.list[i];
      if (!r) return;
      const S = W.services.Item;
      r.busy = true; render();
      try {
        const ev = await obs(S.bid(r.ent, r.nb));
        showToast(ev && ev.success === false ? `Gebot abgelehnt (${ev.status || '?'})` : `✓ ${r.p.name}: ${fmt(r.nb)} geboten`, ev && ev.success === false);
      } catch (e) { showToast('Gebot fehlgeschlagen: ' + e.message, true); }
      r.busy = false;
      await load(true);
    }

    const LBL = { outbid: ['Überboten', 'bad'], lead: ['Führend', 'good'], watch: ['Beobachtet', ''], won: ['Gewonnen', 'good'], lost: ['Verloren', 'mid'] };
    function render() {
      if (!box) return;
      const L = st.list || [];
      const cnt = (s) => L.filter((r) => r.status === s).length;
      box.innerHTML = `<div class="fcpt-sgroup"><h4>🎯 Transferziele</h4>
        <div class="note" style="font-size:12px;color:var(--ink2)">Deine Gebote: wo du überboten wurdest und bis wohin Nachbieten noch Profit bringt (Futbin-Preis nach Steuer minus Mindest-Profit).</div>
        <div class="fcpt-set"><span>Mindest-Profit beim Weiterverkauf</span><input type="number" min="0" step="50" data-tg="min" value="${settings.tgMinProfit}"></div>
        <div class="fcpt-set"><span>Alle 20 Sek. aktualisieren<small>Nur solange dieser Bereich offen ist</small></span><input type="checkbox" class="fcpt-sw" data-tg="auto" ${settings.tgAuto ? 'checked' : ''}></div>
        <button class="fcpt-bigbtn" data-tg="load" ${st.busy ? 'disabled' : ''}>🎯 Transferziele laden</button>
        ${st.msg ? `<div class="fcpt-stand">${esc(st.msg)}</div>` : ''}
        ${L.length ? `<div class="ni-sum"><span>${cnt('outbid')}× überboten</span><span>${cnt('lead')}× führend</span><span>${cnt('won')}× gewonnen</span></div>
        <div class="ni-list">${L.map((r, i) => `<div class="ni-r tg-${r.status}">
          <span class="ni-n"><b>${esc(r.p.rating ?? '')}</b> ${esc(r.p.name)} <span class="trel ${LBL[r.status][1]}">${LBL[r.status][0]}</span>
            <small>Gebot ${fmt(r.cur)}${r.bin ? ` · SK ${fmt(r.bin)}` : ''}${r.market ? ` · Futbin ${fmt(r.market)}` : ''}${r.maxBid != null ? ` · lohnt bis <b>${fmt(r.maxBid)}</b>` : ''}${r.status === 'outbid' || r.status === 'lead' || r.status === 'watch' ? ` · ${fmtTime(r.exp)}` : ''}</small></span>
          ${r.status === 'outbid' || r.status === 'watch' ? (r.worth ? `<button class="fcpt-smallbtn go" data-tg-bid="${i}" ${r.busy ? 'disabled' : ''}>Bieten ${fmt(r.nb)}</button>` : `<span class="tg-no">${r.maxBid != null ? 'lohnt nicht mehr' : 'Preis fehlt'}</span>`) : ''}
        </div>`).join('')}</div>` : ''}
      </div>`;
      const on = (sel, ev, fn) => box.querySelectorAll(sel).forEach((x) => x.addEventListener(ev, (e) => { e.stopPropagation(); fn(x); }));
      on('[data-tg="load"]', 'click', () => load());
      on('[data-tg="min"]', 'change', (x) => { settings.tgMinProfit = Math.max(0, parseInt(x.value, 10) || 0); saveSettings(); if (st.list) { st.list = st.list.map((r) => row(r.ent) || r); render(); } });
      on('[data-tg="auto"]', 'change', (x) => { settings.tgAuto = x.checked; saveSettings(); });
      on('[data-tg-bid]', 'click', (x) => bid(+x.dataset.tgBid));
    }

    timer = setInterval(() => {
      if (!settings.tgAuto || !box || !st.list || st.busy || document.visibilityState !== 'visible') return;
      const visible = box.offsetParent !== null && panel.classList.contains('open');
      if (visible) load(true);
    }, 20000);

    function mount(el) { box = el; render(); }
    return { mount };
  })();
