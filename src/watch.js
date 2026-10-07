  // ==================================================================
  // WATCHLIST + PREIS-ALARM
  // Karten mit Wunsch-Kaufpreis merken. Alarm (Ton + Meldung), wenn
  //  a) eine passende Karte in deinen Transfermarkt-Suchergebnissen darunter auftaucht
  //  b) der Futbin-Preis auf/unter dein Ziel fällt (Prüfung alle 10 Min., schonend)
  // Kauft nichts – du entscheidest.
  // ==================================================================
  const WATCH = (() => {
    if (!Array.isArray(settings.watch)) settings.watch = [];
    if (settings.watchCheck === undefined) settings.watchCheck = true;
    if (settings.watchSound === undefined) settings.watchSound = true;
    if (settings.ntfyTopic === undefined) settings.ntfyTopic = '';
    if (settings.watchEvery === undefined) settings.watchEvery = 5;   // Minuten je Spieler
    const st = { q: '', res: null, msg: '', busy: false, checking: null };
    // Ziel erreicht? „below“ = Preis fällt auf/unter Ziel (kaufen), „above“ = steigt auf/über Ziel (verkaufen)
    const hit = (w) => w.last != null && (w.dir === 'above' ? w.last >= w.target : w.last <= w.target);

    // Push aufs Handy über ntfy.sh (kostenlose App „ntfy“, Thema abonnieren)
    function push(msg, title = 'FC27 Watchlist') {
      const topic = String(settings.ntfyTopic || '').trim();
      if (!topic) return Promise.resolve(false);
      return new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: 'POST', url: 'https://ntfy.sh/' + encodeURIComponent(topic), data: msg, timeout: 10000,
          headers: { Title: title, Tags: 'soccer,star', Priority: 'high' },
          onload: (r) => resolve(r.status >= 200 && r.status < 300), onerror: () => resolve(false), ontimeout: () => resolve(false),
        });
      });
    }
    const alerted = {};
    let box = null;

    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

    function add(r) {
      if (settings.watch.some((w) => w.path === r.path)) return false;
      settings.watch.push({ path: r.path, name: r.name, rating: r.rating, ver: r.ver || '', target: r.buy, dir: r.dir || 'below', sell: r.sell, last: r.current, lastAt: r.current != null ? Date.now() : 0 });
      saveSettings(); render();
      showToast(`⭐ ${r.name} wird beobachtet – Alarm ${r.dir === 'above' ? 'ab' : 'bis'} ${fmt(r.buy)}`);
      return true;
    }
    function remove(path) { settings.watch = settings.watch.filter((w) => w.path !== path); saveSettings(); render(); }
    const has = (path) => settings.watch.some((w) => w.path === path);

    function beep() {
      if (!settings.watchSound) return;
      try {
        const Ctx = W.AudioContext || W.webkitAudioContext;
        const ctx = new Ctx();
        [0, 0.18].forEach((t, i) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.frequency.value = i ? 1320 : 880; o.type = 'sine';
          g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
          g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.16);
          o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.17);
        });
        setTimeout(() => ctx.close(), 800);
      } catch (e) { /* kein Ton möglich */ }
    }
    function alarm(key, msg, minGapMs) {
      if (alerted[key] && Date.now() - alerted[key] < minGapMs) return;
      alerted[key] = Date.now();
      showToast('⭐ ' + msg);
      beep();
      try { if (W.Notification && W.Notification.permission === 'granted') new W.Notification('FC27 Watchlist', { body: msg }); } catch (e) { /* */ }
      push(msg);
    }

    // EA-Karte (aus mapItem) einer Watchlist-Karte zuordnen: gleiches Rating + Name passt
    function match(p) {
      if (!settings.watch.length || !p || !p.name) return null;
      const en = norm(p.name);
      const last = en.split(' ').pop();
      return settings.watch.find((w) => {
        if (w.rating != null && p.rating != null && w.rating !== p.rating) return false;
        const wn = norm(w.name);
        return wn === en || wn.includes(en) || (last.length > 2 && wn.split(' ').includes(last));
      }) || null;
    }

    // Aufruf aus der Listen-Anzeige für fremde Angebote (Transfermarkt/Transferziele)
    function marketChip(p, root) {
      const w = match(p);
      if (!w || w.dir === 'above') return '';
      const nb = p.currentBid ? p.currentBid + (p.currentBid < 1000 ? 50 : p.currentBid < 10000 ? 100 : p.currentBid < 50000 ? 250 : p.currentBid < 100000 ? 500 : 1000) : p.startPrice;
      const binOk = p.buyNow && p.buyNow <= w.target;
      const bidOk = nb && nb <= w.target;
      if (binOk || bidOk) {
        root.classList.add('fcpt-watchhit');
        alarm(`m${p.tradeId}`, `${w.name}: ${binOk ? `Sofortkauf ${fmt(p.buyNow)}` : `Gebot ab ${fmt(nb)}`} – dein Ziel ${fmt(w.target)}`, 10 * 60000);
        return `<span class="fcpt-chip watch">⭐ Unter deinem Ziel (${fmt(w.target)})</span>`;
      }
      return `<span class="fcpt-chip">⭐ Watchlist · Ziel ${fmt(w.target)}</span>`;
    }

    // Futbin-Preis eines Spielers holen: Preisverlauf (genauer), sonst Suchergebnis
    async function priceOf(w) {
      try { const d = await TRADE.analyse(w, Math.max(60000, settings.watchEvery * 60000 - 30000)); if (d && d.current) return { v: d.current, sell: d.sell }; } catch (e) { if (/Schutzseite/.test(e.message)) throw e; }
      const list = await PROGNOSE.search(w.name);
      const m = list.find((x) => x.path === w.path) || list.find((x) => x.rating === w.rating);
      return m && m.price ? { v: m.price } : null;
    }
    async function check(w, manual) {
      st.checking = w.path; render();
      try {
        const r = await priceOf(w);
        if (r) {
          const prev = w.last;
          w.last = r.v; if (r.sell) w.sell = r.sell;
          w.hist = (w.hist || []).concat([[Date.now(), r.v]]).slice(-24);
          if (prev != null && prev !== r.v) w.prev = prev;
          if (hit(w)) {
            if (!w.hitAt) w.hitAt = Date.now();
            alarm(`f${w.path}`, `${w.rating ?? ''} ${w.name}: ${fmt(r.v)} (Futbin) – Ziel ${w.dir === 'above' ? '≥' : '≤'} ${fmt(w.target)} erreicht! ${w.dir === 'above' ? 'Jetzt verkaufen.' : 'Jetzt suchen und kaufen.'}`, 60 * 60000);
          } else w.hitAt = 0;
        } else if (manual) showToast(`${w.name}: kein Futbin-Preis gefunden`, true);
      } catch (e) { log('Watch', e); if (manual) showToast('Futbin: ' + e.message, true); }
      w.lastAt = Date.now(); saveSettings(); st.checking = null; render();
    }
    // Prüfung im Hintergrund: höchstens alle 20 Sek. EINE Karte, jede alle X Min. -> schonend für Futbin
    setInterval(() => {
      if (!settings.watchCheck || !settings.watch.length || st.checking || document.visibilityState !== 'visible' || futbinBlocked()) return;
      const every = Math.max(2, settings.watchEvery) * 60000;
      const due = settings.watch.filter((w) => !w.paused && Date.now() - (w.lastAt || 0) > every).sort((a, b2) => (a.lastAt || 0) - (b2.lastAt || 0))[0];
      if (due) check(due, false);
    }, 20000);

    async function find() {
      const q = st.q.trim();
      if (q.length < 2) return;
      st.busy = true; st.msg = 'Suche bei Futbin …'; st.res = null; render();
      try { st.res = await PROGNOSE.search(q); st.msg = st.res.length ? '' : 'Nichts gefunden – anders schreiben (z. B. nur Nachname).'; }
      catch (e) { st.msg = 'Fehler: ' + e.message; } finally { st.busy = false; render(); }
    }

    function rowHtml(w) {
      const h = hit(w);
      const dist = w.last != null && !h ? Math.abs(w.last - w.target) : null;
      const trend = w.prev != null && w.last != null && w.prev !== w.last ? (w.last < w.prev ? '<span class="wl-dn">▼</span>' : '<span class="wl-up">▲</span>') : '';
      const busy = st.checking === w.path;
      return `<div class="wl-row ${h ? 'hit' : ''} ${w.paused ? 'paused' : ''}">
        <div class="wl-name"><div class="wl-h"><b>${esc(w.rating ?? '')} ${esc(w.name)}</b>${w.ver ? ` <span class="wl-ver">${esc(w.ver)}</span>` : ''}</div>
          <small>${busy ? 'prüfe …' : `Futbin <b>${w.last != null ? fmt(w.last) : '–'}</b> ${trend}${w.lastAt ? ' · ' + agoText(w.lastAt) : ''}`}</small>
          <small class="wl-st">${w.paused ? '⏸ pausiert' : h ? `✓ Ziel erreicht${w.hitAt ? ' · ' + agoText(w.hitAt) : ''}` : dist != null ? `noch ${fmt(dist)} ${w.dir === 'above' ? 'bis zum Ziel (steigen)' : 'bis zum Ziel (fallen)'}` : 'wartet auf ersten Preis'}</small></div>
        <div class="wl-ctl">
          <select data-wd="${esc(w.path)}" title="Alarm wenn der Preis …"><option value="below" ${w.dir !== 'above' ? 'selected' : ''}>fällt auf ≤</option><option value="above" ${w.dir === 'above' ? 'selected' : ''}>steigt auf ≥</option></select>
          <input type="number" step="50" min="0" data-wt="${esc(w.path)}" value="${w.target}" aria-label="Zielpreis">
          <button class="wl-b" data-wc="${esc(w.path)}" title="Jetzt prüfen" ${busy ? 'disabled' : ''}>↻</button>
          <button class="wl-b" data-wp="${esc(w.path)}" title="${w.paused ? 'Fortsetzen' : 'Pausieren'}">${w.paused ? '▶' : '⏸'}</button>
          <button class="wl-b" data-wx="${esc(w.path)}" title="Entfernen">✕</button>
        </div></div>`;
    }
    function render() {
      if (!box) return;
      const L = settings.watch;
      box.innerHTML = `
        <div class="fcpt-sgroup"><h4>⭐ Spieler-Monitoring</h4>
          <div class="note" style="font-size:12px;color:var(--ink2)">Spieler eintragen, Zielpreis festlegen – das Tool prüft den Futbin-Preis regelmäßig und meldet sich (Ton, Meldung, optional aufs Handy), sobald das Ziel erreicht ist. Gekauft wird nichts.</div>
          <div class="ntfy-row"><input type="text" data-wq="q" placeholder="Spieler suchen, z. B. Wirtz" value="${esc(st.q)}"><button class="fcpt-smallbtn go" data-wa="find" ${st.busy ? 'disabled' : ''}>🔎 Suchen</button></div>
          ${st.msg ? `<div class="fcpt-stand">${esc(st.msg)}</div>` : ''}
          ${st.res && st.res.length ? `<div class="wl-res">${st.res.map((r, i) => `<button class="wl-pick" data-wr="${i}" ${has(r.path) ? 'disabled' : ''}><b>${esc(r.rating ?? '')} ${esc(r.name)}</b> <small>${esc(r.ver || '')}</small><span>${r.price ? fmt(r.price) : '–'}${has(r.path) ? ' · schon drin' : ' · + beobachten'}</span></button>`).join('')}</div>` : ''}
          ${L.length ? `<div class="wl-list">${L.map(rowHtml).join('')}</div>` : '<div class="note" style="font-size:12px;color:#7d8aa0">Noch kein Spieler im Monitoring.</div>'}
          <div class="fcpt-set"><span>Automatisch prüfen<small>Nur solange die Web App offen ist · schonend: max. 1 Futbin-Abruf alle 20 Sek.</small></span><input type="checkbox" class="fcpt-sw" data-wo="watchCheck"></div>
          <div class="fcpt-set"><span>Jeden Spieler prüfen alle</span><select data-we="1">${[2, 5, 10, 30].map((m) => `<option value="${m}" ${settings.watchEvery === m ? 'selected' : ''}>${m} Min.</option>`).join('')}</select></div>
          <div class="fcpt-set"><span>Ton bei Alarm</span><input type="checkbox" class="fcpt-sw" data-wo="watchSound"></div>
          <button class="fcpt-smallbtn" data-wa="notify">🔔 Browser-Benachrichtigungen erlauben</button>
          <div class="fcpt-set"><span>📱 Push aufs Handy (ntfy)<small>App „ntfy“ installieren und dieses Thema abonnieren</small></span></div>
          <div class="ntfy-row"><input type="text" data-wn="topic" placeholder="Thema, z. B. fc27-abc123" value="${esc(settings.ntfyTopic)}"><button class="fcpt-smallbtn" data-wa="gen">Erzeugen</button><button class="fcpt-smallbtn" data-wa="test">Test senden</button></div>
        </div>`;
      const q = box.querySelector('[data-wq]');
      q.addEventListener('input', () => { st.q = q.value; });
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); st.q = q.value; find(); } });
      box.querySelector('[data-wa="find"]').addEventListener('click', (e) => { e.stopPropagation(); st.q = q.value; find(); });
      box.querySelectorAll('[data-wr]').forEach((b2) => b2.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = st.res[+b2.dataset.wr];
        if (!r || has(r.path)) return;
        add({ path: r.path, name: r.name, rating: r.rating, ver: r.ver, buy: r.price ? roundPrice(r.price * 0.95) : 0, current: r.price || null, dir: 'below' });
        st.res = null; st.q = ''; render();
      }));
      const W8 = (sel, ev, fn) => box.querySelectorAll(sel).forEach((x) => x.addEventListener(ev, (e) => { e.stopPropagation(); const w = settings.watch.find((y) => y.path === Object.values(x.dataset)[0]); if (w) fn(w, x); }));
      W8('[data-wt]', 'change', (w, x) => { w.target = Math.max(0, parseInt(x.value, 10) || 0); w.hitAt = 0; saveSettings(); render(); });
      W8('[data-wd]', 'change', (w, x) => { w.dir = x.value; w.hitAt = 0; saveSettings(); render(); });
      W8('[data-wc]', 'click', (w) => check(w, true));
      W8('[data-wp]', 'click', (w) => { w.paused = !w.paused; saveSettings(); render(); });
      box.querySelectorAll('[data-wx]').forEach((b2) => b2.addEventListener('click', (e) => { e.stopPropagation(); remove(b2.dataset.wx); }));
      const we = box.querySelector('[data-we]');
      we.addEventListener('change', (e) => { e.stopPropagation(); settings.watchEvery = parseInt(we.value, 10) || 5; saveSettings(); });
      box.querySelectorAll('[data-wo]').forEach((c) => { c.checked = !!settings[c.dataset.wo]; c.addEventListener('change', () => { settings[c.dataset.wo] = c.checked; saveSettings(); }); });
      const tp = box.querySelector('[data-wn="topic"]');
      if (tp) tp.addEventListener('change', () => { settings.ntfyTopic = tp.value.trim().replace(/[^A-Za-z0-9_-]/g, ''); tp.value = settings.ntfyTopic; saveSettings(); });
      const gen = box.querySelector('[data-wa="gen"]');
      if (gen) gen.addEventListener('click', (e) => {
        e.stopPropagation();
        settings.ntfyTopic = 'fc27-' + Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
        saveSettings(); render();
      });
      const tb = box.querySelector('[data-wa="test"]');
      if (tb) tb.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!settings.ntfyTopic) { showToast('Erst ein Thema eintragen oder erzeugen', true); return; }
        const ok = await push('Test: Monitoring-Alarme kommen hier an ✅', 'FC27 Tool');
        showToast(ok ? '📱 Test gesendet – kam die Nachricht an?' : 'Senden fehlgeschlagen – Tampermonkey muss ntfy.sh erlauben', !ok);
      });
      const nb = box.querySelector('[data-wa="notify"]');
      if (nb) nb.addEventListener('click', (e) => {
        e.stopPropagation();
        try { W.Notification.requestPermission().then((r) => showToast(r === 'granted' ? '🔔 Benachrichtigungen erlaubt' : 'Benachrichtigungen nicht erlaubt')); } catch (err) { showToast('Dein Browser unterstützt das nicht', true); }
      });
    }
    function mount(el) { box = el; render(); }
    return { add, remove, has, hit, match, marketChip, mount, render, alarm, push };
  })();

