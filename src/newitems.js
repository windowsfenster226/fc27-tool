  // ==================================================================
  // „NEUE ITEMS“-SORTIERER
  // Nach dem Pack-Öffnen: jede Karte bewerten und auf Klick verteilen
  // (Transferliste, SBC-Lager, Verein, Schnellverkauf). Nichts passiert ohne Bestätigung.
  // ==================================================================
  const NEWITEMS = (() => {
    if (settings.niSellMin === undefined) settings.niSellMin = 1000;   // ab diesem Wert: verkaufen
    let box = null;
    const st = { items: null, msg: '', busy: false, confirm: false, count: null, choice: {} };
    const ACT = { tl: 'Transferliste', store: 'SBC-Lager', club: 'Verein', qs: 'Schnellverkauf', keep: 'Liegen lassen' };

    const obs = (o, ms = 12000) => new Promise((resolve, reject) => {
      if (!o || typeof o.observe !== 'function') return reject(new Error('Keine EA-Antwort'));
      const sub = {};
      const t = setTimeout(() => reject(new Error('Zeitüberschreitung bei EA')), ms);
      o.observe(sub, (ob, ev) => { clearTimeout(t); try { ob.unobserve(sub); } catch (e) { /* */ } resolve(ev || {}); });
    });
    // EAs Stapel-Konstanten (z. B. ItemPile.TRANSFER) – je nach Version verschieden benannt
    function pile(kind) {
      const P = W.ItemPile || {};
      const keys = Object.keys(P);
      const find = (re) => { const k = keys.find((x) => re.test(x)); return k != null ? P[k] : null; };
      if (kind === 'tl') return find(/^TRANSFER$/) ?? find(/TRANSFER/);
      if (kind === 'club') return find(/^CLUB$/) ?? find(/CLUB/);
      if (kind === 'store') return find(/STORAGE/) ?? find(/SBC/);
      return null;
    }
    const canQS = () => !!(W.services && W.services.Item && typeof W.services.Item.discard === 'function');

    function info(ent) {
      const raw = (SBCUI.CAP.raw.get(ent.id)) || {};
      const isPl = typeof ent.isPlayer === 'function' ? ent.isPlayer() : ent.type === 'player';
      let sd = {};
      try { sd = typeof ent.getStaticData === 'function' ? ent.getStaticData() || {} : {}; } catch (e) { /* */ }
      const name = sd.name || [sd.firstName, sd.lastName].filter(Boolean).join(' ') || (isPl ? `#${ent.definitionId}` : 'Gegenstand');
      const rating = ent.rating ?? raw.rating ?? null;
      const untr = !!(ent.untradeable ?? raw.untradeable ?? (ent.tradable === false));
      let dup = false;
      try { dup = (typeof ent.isDuplicate === 'function' && ent.isDuplicate()) || !!(ent.duplicateId && ent.duplicateId > 0); } catch (e) { /* */ }
      const rid = ent.resourceId ?? ent.definitionId;
      const fb = isPl && rid != null ? cacheGet(`futbin:${settings.platform}:${rid}`) : null;
      const value = fb || raw.marketAverage || ent._marketAverage || null;
      const qs = raw.discardValue ?? ent.discardValue ?? 0;
      const pts = raw.gradingScore || null;
      return { ent, id: ent.id, isPl, name, rating, untr, dup, value, src: fb ? 'Futbin' : value ? 'EA' : '', qs, pts };
    }

    // Vorschlag: teure handelbare Karten verkaufen, Duplikate ins SBC-Lager, sonst Verein
    function suggest(x) {
      if (!x.isPl) return 'club';
      if (FAV.has(x.id)) return 'club';   // Favorit -> behalten
      if (!x.untr && x.value && x.value >= settings.niSellMin) return 'tl';
      if (!x.untr && x.value && afterTax(x.value) < x.qs) return 'qs';
      if (x.dup) return pile('store') != null ? 'store' : (x.untr ? 'qs' : 'tl');
      return 'club';
    }

    async function load() {
      const S = W.services && W.services.Item;
      if (!S || typeof S.requestUnassignedItems !== 'function') { st.msg = 'EA-Funktion für „Neue Items“ nicht gefunden.'; render(); return; }
      st.busy = true; st.msg = 'Lade neue Items …'; render();
      try {
        const ev = await obs(S.requestUnassignedItems());
        const L = ((ev.response || ev.data || {}).items || []).map(info);
        L.sort((a, b) => (b.value || 0) - (a.value || 0) || (b.rating || 0) - (a.rating || 0));
        st.items = L; st.count = L.length; st.choice = {};
        try { PACKS.learnNames(L); } catch (e) { /* */ }
        L.forEach((x) => { st.choice[x.id] = suggest(x); });
        st.msg = L.length ? '' : 'Keine neuen Items – alles sortiert. 👍';
      } catch (e) { st.msg = 'Fehler: ' + e.message; } finally { st.busy = false; render(); }
    }

    async function apply() {
      const S = W.services.Item;
      const L = st.items.filter((x) => st.choice[x.id] && st.choice[x.id] !== 'keep');
      st.busy = true; st.confirm = false;
      let ok = 0, fail = 0;
      const errs = {};
      for (let i = 0; i < L.length; i++) {
        const x = L[i], a = st.choice[x.id];
        st.msg = `${i + 1}/${L.length}: ${x.name} → ${ACT[a]} …`; render();
        try {
          let ev;
          if (a === 'qs') {
            if (!canQS()) throw new Error('Schnellverkauf nicht verfügbar');
            ev = await obs(S.discard([x.ent]));
          } else {
            const p = pile(a);
            if (p == null) throw new Error(`Ziel „${ACT[a]}“ unbekannt`);
            ev = await obs(S.move(x.ent, p));
          }
          if (ev && ev.success === false) { fail++; errs[ev.status || '?'] = (errs[ev.status || '?'] || 0) + 1; } else ok++;
        } catch (e) { fail++; errs[e.message] = (errs[e.message] || 0) + 1; }
        await sleep(350 + Math.random() * 400);
      }
      const why = Object.entries(errs).map(([k, n]) => `${n}× ${k}`).join(', ');
      st.busy = false;
      showToast(`📦 ${ok} verteilt${fail ? ` · ${fail} fehlgeschlagen` : ''}`, fail > 0);
      await load();
      if (fail) st.msg = `${ok} verteilt, ${fail} fehlgeschlagen (${why}). Häufigster Grund: Transferliste oder SBC-Lager voll.`;
      render();
    }

    function sum() {
      const L = st.items || [];
      const by = {};
      L.forEach((x) => { const a = st.choice[x.id]; by[a] = (by[a] || 0) + 1; });
      const qsCoins = L.filter((x) => st.choice[x.id] === 'qs').reduce((a, x) => a + (x.qs || 0), 0);
      const tlVal = L.filter((x) => st.choice[x.id] === 'tl').reduce((a, x) => a + (x.value ? afterTax(x.value) : 0), 0);
      return { by, qsCoins, tlVal };
    }

    function render() {
      if (!box) return;
      const L = st.items;
      const s = L ? sum() : null;
      const opts = (x) => Object.keys(ACT).filter((k) => !(FAV.has(x.id) && (k === 'qs' || k === 'tl')) && (k !== 'qs' || canQS()) && (k !== 'store' || pile('store') != null) && (k !== 'tl' || !x.untr))
        .map((k) => `<option value="${k}" ${st.choice[x.id] === k ? 'selected' : ''}>${ACT[k]}</option>`).join('');
      const rows = L ? L.map((x) => `<div class="ni-r">
          <span class="ni-n">${x.isPl ? FAV.btn({ id: x.id, name: x.name, rating: x.rating }) : ''}<b>${esc(x.rating ?? '')}</b> ${esc(x.name)}${x.untr ? ' <em>NH</em>' : ''}${x.dup ? ' <em class="d">Dup</em>' : ''}
            <small>${x.value ? `Wert ${fmt(x.value)}` : 'Wert –'}${x.qs ? ` · Schnell ${fmt(x.qs)}` : ''}${x.pts ? ` · ${fmt(x.pts)} 💎` : ''}</small></span>
          <select data-ni="${x.id}" aria-label="Ziel für ${esc(x.name)}">${opts(x)}</select></div>`).join('') : '';
      box.innerHTML = `<div class="fcpt-sgroup"><h4>📦 Neue Items sortieren</h4>
        <div class="note" style="font-size:12px;color:var(--ink2)">Nach dem Pack-Öffnen: das Tool schlägt für jede Karte ein Ziel vor – du kannst alles ändern und bestätigst am Ende.</div>
        <div class="fcpt-set"><span>Verkaufen ab Wert<small>Handelbare Karten ab diesem Marktwert → Transferliste</small></span><input type="number" min="0" step="250" data-ni-min value="${settings.niSellMin}"></div>
        <button class="fcpt-bigbtn" data-ni-load ${st.busy ? 'disabled' : ''}>📦 Neue Items laden${st.count != null ? ` (${st.count})` : ''}</button>
        ${st.msg ? `<div class="fcpt-stand">${esc(st.msg)}</div>` : ''}
        ${L && L.length ? `
          <div class="ni-sum">${Object.entries(s.by).map(([k, n]) => `<span>${n}× ${ACT[k]}</span>`).join('')}</div>
          ${s.tlVal ? `<div class="pt-note">Transferliste bringt ca. <b>${fmt(s.tlVal)}</b> nach Steuer${s.qsCoins ? ` · Schnellverkauf <b>${fmt(s.qsCoins)}</b> sofort` : ''}.</div>` : s.qsCoins ? `<div class="pt-note">Schnellverkauf bringt sofort <b>${fmt(s.qsCoins)}</b>.</div>` : ''}
          <div class="ni-list">${rows}</div>
          ${st.confirm ? `<div class="pt-confirm"><b>${L.filter((x) => st.choice[x.id] !== 'keep').length} Items verteilen?</b>
              <span>${s.by.qs ? `${s.by.qs}× Schnellverkauf ist endgültig. ` : ''}Verschieben lässt sich in der Web App wieder ändern.</span>
              <div class="btns2"><button class="fcpt-smallbtn go" data-ni-yes>Ja, verteilen</button><button class="fcpt-smallbtn" data-ni-no>Abbrechen</button></div></div>`
            : `<button class="fcpt-bigbtn" data-ni-go ${st.busy ? 'disabled' : ''}>✓ Alle verteilen</button>`}` : ''}
      </div>`;
      const q = (sel) => box.querySelector(sel);
      const on = (el, ev, fn) => el && el.addEventListener(ev, (e) => { e.stopPropagation(); fn(e); });
      on(q('[data-ni-load]'), 'click', () => load());
      on(q('[data-ni-go]'), 'click', () => { st.confirm = true; render(); });
      on(q('[data-ni-no]'), 'click', () => { st.confirm = false; render(); });
      on(q('[data-ni-yes]'), 'click', () => apply());
      on(q('[data-ni-min]'), 'change', (e) => {
        settings.niSellMin = Math.max(0, parseInt(e.target.value, 10) || 0); saveSettings();
        if (st.items) { st.items.forEach((x) => { st.choice[x.id] = suggest(x); }); render(); }
      });
      box.querySelectorAll('[data-ni]').forEach((sel) => on(sel, 'change', () => { st.choice[sel.dataset.ni] = sel.value; render(); }));
    }

    // Anzahl im Hintergrund nachsehen (für die Übersicht) – höchstens alle 5 Min., nur wenn das Panel offen ist
    let lastCount = 0;
    async function peek() {
      if (Date.now() - lastCount < 5 * 60000 || st.busy) return st.count;
      lastCount = Date.now();
      try {
        const S = W.services && W.services.Item;
        if (!S || typeof S.requestUnassignedItems !== 'function') return null;
        const ev = await obs(S.requestUnassignedItems());
        st.count = ((ev.response || ev.data || {}).items || []).length;
        render();
      } catch (e) { /* */ }
      return st.count;
    }

    function mount(el) {
      box = el; render();
      FAV.onChange(() => { if (st.items) { st.items.forEach((x) => { if (FAV.has(x.id)) st.choice[x.id] = 'club'; }); render(); } });
    }
    const diag = () => ({ itemPileKeys: Object.keys(W.ItemPile || {}), move: !!(W.services && W.services.Item && W.services.Item.move), discard: canQS(), count: st.count });
    return { mount, peek, count: () => st.count, diag };
  })();
