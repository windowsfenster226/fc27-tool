  // ==================================================================
  // ICON/HERO-MARKT: alle Icons & Heroes aus EAs Katalog, Futbin-Preise, Trend seit dem letzten Abruf,
  // mit einem Tipp in „📋 Meine Liste“ zum Snipen übernehmen. Preise holt das Tool nur auf Knopfdruck.
  // ==================================================================
  // eslint-disable-next-line no-var
  var IHM = (() => {
    if (!settings.ihHist || typeof settings.ihHist !== 'object') settings.ihHist = {};   // assetId -> [[t, preis], …]
    if (settings.ihType === undefined) settings.ihType = 'all';     // all | icon | hero
    if (settings.ihMax === undefined) settings.ihMax = 0;           // max. Preis-Filter (0 = egal)
    if (settings.ihMin === undefined) settings.ihMin = 0;           // min. Rating
    if (settings.ihSort === undefined) settings.ihSort = 'rating';  // rating | price | trend
    const st = { list: null, msg: '', busy: false, run: false, done: 0, total: 0, q: '' };
    let box = null;
    const kindOf = (p) => (SBC.isIcon(p) ? 'icon' : SBC.isHero(p) ? 'hero' : null);
    const rid = (p) => p.resId || p.def;
    const priceOf = (p) => cacheGet(`futbin:${settings.platform}:${rid(p)}`) || null;

    async function loadList() {
      st.busy = true; st.msg = 'Lade Icons & Heroes aus EAs Katalog …'; render();
      try {
        const seen = new Set(), out = [];
        const add = (p) => { const k = kindOf(p); if (!k || seen.has(rid(p))) return; seen.add(rid(p)); out.push(Object.assign(p, { kind: k })); };
        // Icons: eigene Liga (2118) – mehrere Seiten
        try { (await SBCUI.conceptsByLeague(2118, (m) => { st.msg = m; render(); }, { pages: 14, specials: true })).forEach(add); } catch (e) { log('IHM icons', e); }
        // Heroes: spielen in echten Ligen -> Katalog (höchste Ratings zuerst) + die großen Ligen, jeweils inkl. Sonderkarten
        for (const lg of [null, 13, 53, 19, 31, 16, 14, 4, 10, 308, 39]) {
          try { (await SBCUI.conceptsByLeague(lg, (m) => { st.msg = `Heroes suchen – ${m}`; render(); }, { pages: lg == null ? 4 : 3, specials: true })).forEach(add); } catch (e) { log('IHM heroes', lg, e); }
          await sleep(250);
        }
        st.list = out;
        st.msg = out.length ? `${out.filter((x) => x.kind === 'icon').length} Icons · ${out.filter((x) => x.kind === 'hero').length} Heroes geladen. Preise: „💰 Preise holen“.` : 'Keine Icons/Heroes gefunden – Web App einmal neu laden und erneut versuchen.';
      } catch (e) { st.msg = 'Fehler: ' + e.message; } finally { st.busy = false; render(); }
    }

    function record(p, v) {
      if (!v) return;
      const h = settings.ihHist[p.assetId] || (settings.ihHist[p.assetId] = []);
      const last = h[h.length - 1];
      if (last && last[1] === v && Date.now() - last[0] < 6 * 3600000) return;
      h.push([Date.now(), v]);
      if (h.length > 10) h.splice(0, h.length - 10);
    }
    function trend(p) {
      const h = settings.ihHist[p.assetId];
      if (!h || h.length < 2) return null;
      const [t0, a] = h[h.length - 2], b = h[h.length - 1][1];
      return { d: b - a, pct: a ? ((b - a) / a) * 100 : 0, t0 };
    }
    async function fetchPrices(list) {
      if (st.run) { st.run = false; return; }
      st.run = true; st.done = 0; st.total = list.length; render();
      for (const p of list) {
        if (!st.run) break;
        try { const v = await getPrice('futbin', { resourceId: rid(p), name: p.name, fullName: p.fullName || p.name, rating: p.rating, isPlayer: true }, 'futbin:ih'); if (v) record(p, v); }
        catch (e) { if (/Schutzseite/.test(e.message)) { st.msg = e.message; break; } }
        st.done++; if (st.done % 3 === 0 || st.done === st.total) { saveSettings(); render(); }
      }
      st.run = false; saveSettings(); render();
    }
    function view() {
      let L = (st.list || []).filter((p) => (settings.ihType === 'all' || p.kind === settings.ihType) && p.rating >= (settings.ihMin || 0));
      if (st.q) L = L.filter((p) => String(p.name + ' ' + (p.fullName || '')).toLowerCase().includes(st.q));
      if (settings.ihMax) L = L.filter((p) => !priceOf(p) || priceOf(p) <= settings.ihMax);
      const pr = (p) => priceOf(p) || Infinity;
      const tr = (p) => { const t = trend(p); return t ? t.pct : 0; };
      L.sort(settings.ihSort === 'price' ? (a, b) => pr(a) - pr(b) : settings.ihSort === 'trend' ? (a, b) => tr(a) - tr(b) : (a, b) => b.rating - a.rating || pr(a) - pr(b));
      return L;
    }

    function render() {
      if (!box) return;
      const L = st.list ? view() : [];
      const noPrice = L.filter((p) => !priceOf(p));
      box.innerHTML = `<div class="fcpt-sgroup"><h4>👑 Icon/Hero-Markt</h4>
        <div class="note" style="font-size:12px;color:var(--ink2)">Alle Icons & Heroes aus EAs Katalog mit Futbin-Preis und Trend seit deinem letzten Abruf. „＋ Liste“ übernimmt den Spieler in „📋 Meine Liste“ (Kaufen & Bieten) – dort den Snipe-Preis eintragen.</div>
        <button class="fcpt-bigbtn" data-ih="load" ${st.busy ? 'disabled' : ''}>${st.list ? '↻ Liste neu laden' : '👑 Icons & Heroes laden'}</button>
        ${st.msg ? `<div class="fcpt-stand">${esc(st.msg)}</div>` : ''}
        ${st.list ? `<div class="ih-f">
            <select data-ih="type"><option value="all" ${settings.ihType === 'all' ? 'selected' : ''}>Icons + Heroes</option><option value="icon" ${settings.ihType === 'icon' ? 'selected' : ''}>nur Icons</option><option value="hero" ${settings.ihType === 'hero' ? 'selected' : ''}>nur Heroes</option></select>
            <select data-ih="sort"><option value="rating" ${settings.ihSort === 'rating' ? 'selected' : ''}>nach Rating</option><option value="price" ${settings.ihSort === 'price' ? 'selected' : ''}>günstigste zuerst</option><option value="trend" ${settings.ihSort === 'trend' ? 'selected' : ''}>größter Preisfall zuerst</option></select>
            <label>ab ⭐<input type="number" min="0" max="99" data-ih="min" value="${settings.ihMin || ''}" placeholder="–"></label>
            <label>bis<input type="number" min="0" step="1000" data-ih="max" value="${settings.ihMax || ''}" placeholder="Preis"></label>
            <input type="text" data-ih="q" placeholder="Name" value="${esc(st.q)}">
          </div>
          <div class="ih-b"><button class="fcpt-smallbtn" data-ih="prices">${st.run ? `⏹ Stopp (${st.done}/${st.total})` : `💰 Preise holen (${Math.min(40, noPrice.length || L.length)} von ${L.length})`}</button><span>${L.length} Spieler</span></div>
          <div class="ih-list">${L.slice(0, 120).map((p) => {
            const v = priceOf(p), t = trend(p);
            return `<div class="ih-r"><span class="ih-o ${p.kind}">${p.rating}</span><span class="ih-n">${esc(p.name)}<small>${p.kind === 'icon' ? 'Icon' : 'Hero'}</small></span>
              <span class="ih-p">${v ? fmt(v) : '–'}${t ? `<small class="${t.d < 0 ? 'neg' : t.d > 0 ? 'pos' : ''}" title="seit ${new Date(t.t0).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}">${t.d > 0 ? '▲' : t.d < 0 ? '▼' : '='} ${Math.abs(t.pct).toFixed(1).replace('.', ',')} %</small>` : ''}</span>
              <button class="fcpt-smallbtn" data-ih-add="${esc(String(rid(p)))}" title="In „📋 Meine Liste“ zum Snipen übernehmen">＋ Liste</button></div>`;
          }).join('')}</div>${L.length > 120 ? `<div class="pt-note">… ${L.length - 120} weitere – Filter enger stellen.</div>` : ''}` : ''}
      </div>`;
      const q = (s) => box.querySelector(s);
      const on = (el, ev, fn) => el && el.addEventListener(ev, (e) => { e.stopPropagation(); fn(e); });
      on(q('[data-ih="load"]'), 'click', () => loadList());
      on(q('[data-ih="type"]'), 'change', (e) => { settings.ihType = e.target.value; saveSettings(); render(); });
      on(q('[data-ih="sort"]'), 'change', (e) => { settings.ihSort = e.target.value; saveSettings(); render(); });
      on(q('[data-ih="min"]'), 'change', (e) => { settings.ihMin = Math.max(0, parseInt(e.target.value, 10) || 0); saveSettings(); render(); });
      on(q('[data-ih="max"]'), 'change', (e) => { settings.ihMax = Math.max(0, parseInt(String(e.target.value).replace(/\./g, ''), 10) || 0); saveSettings(); render(); });
      const qi = q('[data-ih="q"]');
      if (qi) {
        ['keydown', 'keyup', 'keypress'].forEach((ev) => qi.addEventListener(ev, (e) => e.stopPropagation()));
        qi.addEventListener('change', () => { st.q = String(qi.value || '').trim().toLowerCase(); render(); });
      }
      on(q('[data-ih="prices"]'), 'click', () => { const L2 = view(); const todo = L2.filter((p) => !priceOf(p)); fetchPrices((todo.length ? todo : L2).slice(0, 40)); });
      box.querySelectorAll('[data-ih-add]').forEach((b) => on(b, 'click', () => {
        const p = (st.list || []).find((x) => String(rid(x)) === b.dataset.ihAdd);
        if (!p || typeof BUY === 'undefined' || !BUY.addList) return;
        const v = priceOf(p);
        const max = v ? Math.floor((v * 0.9) / stepFor(v)) * stepFor(v) : 0;   // Vorschlag: 10 % unter Futbin
        if (BUY.addList({ asset: p.assetId, rid: rid(p), name: p.name, rating: p.rating, max, fb: v })) showToast(`＋ ${p.name} in „Meine Liste“${max ? ` – Snipe-Preis ${fmt(max)} (10 % unter Futbin), bei Bedarf anpassen` : ' – Snipe-Preis noch eintragen'}`);
        else showToast(`${p.name} steht schon in „Meine Liste“`);
      }));
    }
    GM_addStyle(`
      .ih-f{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;align-items:center;font-size:12px;color:var(--ink2)}
      .ih-f select,.ih-f input{height:30px;border-radius:8px;border:1px solid #2b3654;background:#0b1020;color:var(--ink);padding:0 6px;font:inherit;font-size:12px}
      .ih-f label{display:flex;align-items:center;gap:4px}.ih-f input[type=number]{width:78px}.ih-f input[type=text]{flex:1 1 90px;min-width:0}
      .ih-b{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--ink2);margin-bottom:6px}
      .ih-list{display:flex;flex-direction:column;gap:3px;max-height:420px;overflow:auto}
      .ih-r{display:grid;grid-template-columns:34px minmax(0,1fr) auto auto;gap:8px;align-items:center;background:#0f1526;border:1px solid #1d2638;border-radius:10px;padding:5px 8px;font-size:13px}
      .ih-o{font-weight:800;text-align:center;border-radius:6px;padding:2px 0}.ih-o.icon{background:#f3ead0;color:#3a2f12}.ih-o.hero{background:#3b2a6b;color:#e9ddff}
      .ih-n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ih-n small{margin-left:6px;color:var(--ink3);font-size:11px}
      .ih-p{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.ih-p small{display:block;font-size:11px}.ih-p small.neg{color:#ff6b6b}.ih-p small.pos{color:#34D399}
    `);
    function mount(el) { box = el; render(); }
    return { mount };
  })();
