  // ==================================================================
  // FAVORITEN-SCHUTZ: Karten als „behalten“ markieren – kein Modul schlägt sie
  // zum Verkaufen, Einstellen, Schnellverkauf oder für SBCs vor.
  // (gleiche Liste wie die 🔒-Sperre im SBC-Solver)
  // ==================================================================
  // eslint-disable-next-line no-var
  var FAV = (() => {
    if (!Array.isArray(settings.sbcLocked)) settings.sbcLocked = [];
    const has = (id) => id != null && settings.sbcLocked.some((x) => String(x.id) === String(id));
    const listeners = [];
    const changed = () => listeners.forEach((f) => { try { f(); } catch (e) { /* */ } });
    function toggle(p) {
      if (!p || p.id == null) return;
      if (has(p.id)) {
        settings.sbcLocked = settings.sbcLocked.filter((x) => String(x.id) !== String(p.id));
        showToast(`☆ ${p.name} nicht mehr geschützt`);
      } else {
        settings.sbcLocked.push({ id: /^\d+$/.test(String(p.id)) ? Number(p.id) : p.id, name: p.name, rating: p.rating === '' || p.rating == null ? null : Number(p.rating) });
        showToast(`⭐ ${p.name} wird behalten – nie zum Verkauf oder für SBCs vorgeschlagen`);
      }
      saveSettings(); changed(); render();
    }
    const btn = (p) => `<button class="fav-b ${has(p.id) ? 'on' : ''}" data-fav="${esc(p.id)}" data-favn="${esc(p.name)}" data-favr="${esc(p.rating ?? '')}" title="Behalten (Favorit)" aria-label="Als Favorit behalten">${has(p.id) ? '⭐' : '☆'}</button>`;
    // ein Klick-Handler für alle ☆-Knöpfe im Tool
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-fav]');
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      toggle({ id: b.dataset.fav, name: b.dataset.favn, rating: b.dataset.favr });
      b.classList.toggle('on', has(b.dataset.fav)); b.textContent = has(b.dataset.fav) ? '⭐' : '☆';
    }, true);

    let box = null;
    function render() {
      if (!box) return;
      const L = settings.sbcLocked;
      box.innerHTML = `<div class="fcpt-sgroup"><h4>⭐ Favoriten (${L.length})</h4>
        <div class="note" style="font-size:12px;color:var(--ink2)">Diese Karten schlägt das Tool nie vor: nicht zum Verkaufen, Einstellen, Schnellverkauf, nicht für SBCs oder Diamanten-SBCs. Markieren mit ☆ in der Transferliste, bei neuen Items, im Verkaufs-Assistenten oder 🔒 im SBC-Solver.</div>
        ${L.length ? `<div class="ni-list">${L.map((x) => `<div class="ni-r"><span class="ni-n"><b>${esc(x.rating ?? '')}</b> ${esc(x.name)}</span><button class="fcpt-smallbtn" data-favdel="${esc(x.id)}">Entfernen</button></div>`).join('')}</div>` : ''}
      </div>`;
      box.querySelectorAll('[data-favdel]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        settings.sbcLocked = settings.sbcLocked.filter((x) => String(x.id) !== b.dataset.favdel); saveSettings(); changed(); render();
      }));
    }
    function mount(el) { box = el; render(); }
    return { has, toggle, btn, mount, onChange: (f) => listeners.push(f) };
  })();

  // ==================================================================
  // SPERREN-SCHUTZ: zählt Suchen/Gebote/Einstellungen und warnt, bevor EA bremst
  // ==================================================================
  // eslint-disable-next-line no-var
  var GUARD = (() => {
    if (settings.guardOn === undefined) settings.guardOn = true;
    if (settings.guardPerMin === undefined) settings.guardPerMin = 20;
    if (settings.guardPerHour === undefined) settings.guardPerHour = 300;
    if (settings.guardBlock === undefined) settings.guardBlock = true;
    const ev = { search: [], bid: [], list: [], all: [] };
    let lastBlock = null, lastWarn = 0, override = 0;
    const prune = (a, ms) => { const t = Date.now() - ms; while (a.length && a[0] < t) a.shift(); };
    const BLOCK_CODES = [429, 458, 459, 460, 512, 521];

    SBCUI.CAP.hooks.push((url, method, status) => {
      const now = Date.now();
      ev.all.push(now);
      if (/\/transfermarket(\?|$)/.test(url) && method === 'GET') ev.search.push(now);
      if (/\/trade\/\d+\/bid/.test(url)) ev.bid.push(now);
      if (/\/auctionhouse(\?|$)/.test(url) && method === 'POST') ev.list.push(now);
      Object.values(ev).forEach((a) => prune(a, 3600000));
      if (BLOCK_CODES.includes(Number(status)) || (Number(status) === 403 && /\/transfermarket|\/trade\/|\/bid/.test(url))) {
        lastBlock = { t: now, status };
        showToast(`⛔ EA bremst (Code ${status}) – mach jetzt 5–10 Min. Pause, sonst droht eine Markt-Sperre.`, true);
        try { if (typeof WATCH !== 'undefined') WATCH.push(`EA bremst dein Konto (Code ${status}) – Pause machen!`, 'FC27 Sperren-Schutz'); } catch (e) { /* */ }
      }
      const l = level();
      if (settings.guardOn && l.level !== 'ok' && now - lastWarn > 45000) {
        lastWarn = now;
        showToast(l.level === 'red' ? `🛑 ${l.text} – kurz Pause machen!` : `⚠ ${l.text} – etwas langsamer`, l.level === 'red');
      }
    });

    function stats() {
      const now = Date.now();
      const inWin = (a, ms) => a.filter((t) => t > now - ms).length;
      return { sMin: inWin(ev.search, 60000), sHour: ev.search.length, bMin: inWin(ev.bid, 60000), lMin: inWin(ev.list, 60000), allMin: inWin(ev.all, 60000) };
    }
    function level() {
      const s = stats();
      if (lastBlock && Date.now() - lastBlock.t < 10 * 60000) return { level: 'red', text: `EA hat vor ${Math.round((Date.now() - lastBlock.t) / 60000)} Min. gebremst (Code ${lastBlock.status})`, s };
      if (s.sMin >= settings.guardPerMin || s.sHour >= settings.guardPerHour) return { level: 'red', text: `${s.sMin} Suchen/Min · ${s.sHour}/Std`, s };
      if (s.sMin >= settings.guardPerMin * 0.75 || s.sHour >= settings.guardPerHour * 0.8) return { level: 'warn', text: `${s.sMin} Suchen/Min · ${s.sHour}/Std`, s };
      return { level: 'ok', text: `${s.sMin} Suchen/Min · ${s.sHour}/Std`, s };
    }
    // Für Such-/Snipe-Taste: bei Rot einmal anhalten; zweiter Druck innerhalb von 4 Sek. geht trotzdem
    function blocked() {
      if (!settings.guardOn || !settings.guardBlock) return false;
      if (level().level !== 'red') return false;
      if (Date.now() - override < 4000) { override = 0; return false; }
      override = Date.now();
      return true;
    }

    let box = null;
    function render() {
      if (!box) return;
      const l = level();
      box.innerHTML = `<div class="fcpt-sgroup"><h4>🛡 Sperren-Schutz</h4>
        <div class="gd ${l.level}"><b>${l.level === 'ok' ? '🟢 Alles im grünen Bereich' : l.level === 'warn' ? '🟡 Etwas langsamer' : '🔴 Pause empfohlen'}</b><span>${esc(l.text)} · Gebote ${l.s.bMin}/Min · Einstellungen ${l.s.lMin}/Min</span></div>
        <div class="fcpt-set"><span>Schutz aktiv<small>Warnt bei vielen Suchen und wenn EA bremst (inkl. Handy-Push)</small></span><input type="checkbox" class="fcpt-sw" data-gd="on" ${settings.guardOn ? 'checked' : ''}></div>
        <div class="fcpt-set"><span>Such-Tasten bei Rot anhalten<small>Nochmal drücken (innerhalb 4 Sek.) = trotzdem suchen</small></span><input type="checkbox" class="fcpt-sw" data-gd="block" ${settings.guardBlock ? 'checked' : ''}></div>
        <div class="fcpt-set"><span>Grenze Suchen pro Minute</span><input type="number" min="5" max="60" data-gd="min" value="${settings.guardPerMin}"></div>
        <div class="fcpt-set"><span>Grenze Suchen pro Stunde</span><input type="number" min="50" max="2000" step="50" data-gd="hour" value="${settings.guardPerHour}"></div>
        <div class="pt-note">EA nennt keine festen Grenzen – die Werte sind vorsichtige Erfahrungswerte. Gezählt wird nur, was in diesem Tab passiert.</div>
      </div>`;
      const on = (sel, fn) => { const x = box.querySelector(sel); if (x) x.addEventListener('change', (e) => { e.stopPropagation(); fn(x); saveSettings(); render(); }); };
      on('[data-gd="on"]', (x) => { settings.guardOn = x.checked; });
      on('[data-gd="block"]', (x) => { settings.guardBlock = x.checked; });
      on('[data-gd="min"]', (x) => { settings.guardPerMin = Math.max(5, parseInt(x.value, 10) || 20); });
      on('[data-gd="hour"]', (x) => { settings.guardPerHour = Math.max(50, parseInt(x.value, 10) || 300); });
    }
    setInterval(() => { if (box && box.offsetParent !== null) render(); }, 5000);
    function mount(el) { box = el; render(); }
    return { level, stats, blocked, mount };
  })();

  // ==================================================================
  // PACK-AUSWERTUNG: merkt sich, was du aus Packs ziehst
  // ==================================================================
  const PACKS = (() => {
    const KEY = 'fcpt_packs';
    let log2 = GM_getValue(KEY, []);
    const store = GM_getValue('fcpt_packstore', {});   // packId -> { name, coins }
    const names = {};                                  // itemId -> Name (aus „Neue Items“/Verein gelernt)
    const save = () => GM_setValue(KEY, log2.slice(-300));

    function walk(o, fn, d = 0) {
      if (!o || typeof o !== 'object' || d > 7) return;
      if (Array.isArray(o)) { o.forEach((x) => walk(x, fn, d + 1)); return; }
      fn(o); Object.values(o).forEach((v) => walk(v, fn, d + 1));
    }
    SBCUI.CAP.hooks.push((url, method, status, text, body) => {
      if (!text) return;
      // Shop: Pack-Namen und Münzpreise lernen
      if (/\/store\/purchaseGroup/.test(url)) {
        try {
          walk(JSON.parse(text), (o) => {
            if (o.id != null && (o.coins != null || o.price != null)) {
              const nm = o.packName || o.name || o.description || o.localizationKey || store[o.id]?.name || `Pack ${o.id}`;
              store[o.id] = { name: String(nm).replace(/^.*\./, ''), coins: Number(o.coins ?? o.price) || 0 };
            }
          });
          GM_setValue('fcpt_packstore', store);
        } catch (e) { /* */ }
        return;
      }
      // Pack geöffnet = POST auf /purchased/items mit packId
      if (method !== 'POST' || !/\/purchased\/items/.test(url) || !(status >= 200 && status < 300)) return;
      let data, req = {};
      try { data = JSON.parse(text); } catch (e) { return; }
      try { req = typeof body === 'string' ? JSON.parse(body) : body || {}; } catch (e) { /* */ }
      const items = (data && (data.itemList || data.itemData || data.items)) || [];
      if (!Array.isArray(items) || !items.length) return;
      const pk = req.packId ?? req.packID ?? null;
      const info = (pk != null && store[pk]) || {};
      const currency = String(req.currency || (info.coins ? 'COINS' : '')).toUpperCase();
      const its = items.filter((x) => x && x.id != null).map((x) => {
        const fb = x.resourceId != null ? cacheGet(`futbin:${settings.platform}:${x.resourceId}`) : null;
        return { id: x.id, r: x.rating || null, pl: x.itemType === 'player', untr: !!x.untradeable, v: x.untradeable ? 0 : (fb || x.marketAverage || 0), qs: x.discardValue || 0, pos: x.preferredPosition };
      });
      log2.push({ t: Date.now(), pk, name: info.name || (pk != null ? `Pack ${pk}` : 'Pack'), cost: currency === 'COINS' ? info.coins || 0 : 0, cur: currency || '?', items: its });
      save();
      const val = its.reduce((a, x) => a + x.v, 0);
      const top = its.filter((x) => x.pl).sort((a, b) => (b.r || 0) - (a.r || 0))[0];
      showToast(`🎁 Pack erfasst: ${its.length} Items · Marktwert ≈ ${fmt(val)}${top ? ` · bester: ${top.r}` : ''}`);
      render();
    });
    function learnNames(list) { (list || []).forEach((x) => { if (x && x.id != null && x.name) names[x.id] = x.name; }); }

    let box = null;
    function render() {
      if (!box) return;
      const L = log2;
      const sum = (f) => L.reduce((a, p) => a + f(p), 0);
      const val = (p) => p.items.reduce((a, x) => a + x.v, 0);
      const coinsSpent = sum((p) => p.cost || 0);
      const coinsPacks = L.filter((p) => p.cost);
      const valPaid = coinsPacks.reduce((a, p) => a + val(p), 0);
      const best = L.flatMap((p) => p.items.map((x) => Object.assign({ t: p.t, pack: p.name }, x))).filter((x) => x.pl).sort((a, b) => (b.v - a.v) || ((b.r || 0) - (a.r || 0))).slice(0, 5);
      const byName = {};
      L.forEach((p) => { const g = byName[p.name] || (byName[p.name] = { n: 0, v: 0, c: 0, top: 0 }); g.n++; g.v += val(p); g.c += p.cost || 0; g.top = Math.max(g.top, ...p.items.map((x) => x.r || 0)); });
      box.innerHTML = `<div class="fcpt-sgroup"><h4>🎁 Pack-Auswertung</h4>
        ${L.length ? `<div class="pt-sum"><div><span>Packs</span><b>${L.length}</b></div><div><span>Münzen bezahlt</span><b>${fmt(coinsSpent)}</b></div><div><span>Wert gezogen</span><b>${fmt(sum(val))}</b></div></div>
          ${coinsPacks.length ? `<div class="pt-note">Gekaufte Packs: ${fmt(coinsSpent)} Münzen → ${fmt(valPaid)} handelbarer Marktwert (<b class="${valPaid >= coinsSpent ? 'fcpt-pos-v' : 'fcpt-neg-v'}">${Math.round(valPaid / Math.max(1, coinsSpent) * 100)} %</b>).</div>` : ''}
          <div class="pt-h">Nach Pack</div>${Object.entries(byName).sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([n, g]) => `<div class="pt-r"><span>${esc(n)} (${g.n}×)</span><span>Ø ${fmt(Math.round(g.v / g.n))}${g.c ? ` · kostet Ø ${fmt(Math.round(g.c / g.n))}` : ''} · bestes ${g.top || '–'}</span></div>`).join('')}
          ${best.length ? `<div class="pt-h">Beste Ziehungen</div>${best.map((x) => `<div class="pt-r"><span><b>${esc(x.r ?? '')}</b> ${esc(names[x.id] || x.pos || 'Spieler')}${x.untr ? ' <em>NH</em>' : ''}</span><span>${x.v ? fmt(x.v) : 'NH'} · ${new Date(x.t).toLocaleDateString('de-DE')}</span></div>`).join('')}` : ''}
          <div class="pt-note">Wert = Marktwert handelbarer Karten (Futbin/EA). Nicht handelbare zählen mit 0.</div>
          <button class="fcpt-smallbtn" data-pk="clear">Auswertung zurücksetzen</button>`
        : '<div class="note" style="font-size:12px;color:var(--ink2)">Noch keine Packs erfasst. Öffne ein Pack in der Web App (dieser Tab) – das Tool merkt sich automatisch Inhalt und Wert.</div>'}
      </div>`;
      const c = box.querySelector('[data-pk="clear"]');
      if (c) c.addEventListener('click', (e) => { e.stopPropagation(); if (confirm('Pack-Auswertung löschen?')) { log2 = []; save(); render(); } });
    }
    function mount(el) { box = el; render(); }
    return { mount, learnNames, count: () => log2.length };
  })();
