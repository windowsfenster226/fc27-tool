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
      settings.watch.push({ path: r.path, name: r.name, rating: r.rating, target: r.buy, sell: r.sell, last: r.current, lastAt: Date.now() });
      saveSettings(); render();
      showToast(`⭐ ${r.name} beobachtet – Alarm ab ${fmt(r.buy)}`);
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
      if (!w) return '';
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

    // Futbin-Prüfung: pro Minute höchstens EINE Karte, jede alle 10 Min. -> schonend
    setInterval(async () => {
      if (!settings.watchCheck || !settings.watch.length || document.visibilityState !== 'visible' || futbinBlocked()) return;
      const due = settings.watch.filter((w) => Date.now() - (w.lastAt || 0) > 10 * 60000).sort((a, b) => (a.lastAt || 0) - (b.lastAt || 0))[0];
      if (!due) return;
      try {
        const d = await TRADE.analyse(due, 9 * 60000);
        if (!d) return;
        due.last = d.current; due.lastAt = Date.now(); due.sell = d.sell; saveSettings(); render();
        if (d.current <= due.target) alarm(`f${due.path}`, `${due.name} liegt bei ${fmt(d.current)} (Futbin) – dein Ziel ${fmt(due.target)}. Jetzt suchen!`, 60 * 60000);
      } catch (e) { log('Watch', e); due.lastAt = Date.now(); }
    }, 60000);

    function render() {
      if (!box) return;
      const L = settings.watch;
      box.innerHTML = `
        <div class="fcpt-sgroup"><h4>⭐ Watchlist & Preis-Alarm</h4>
          ${L.length ? L.map((w) => {
            const hit = w.last != null && w.last <= w.target;
            return `<div class="wl-row ${hit ? 'hit' : ''}">
              <div class="wl-name"><b>${esc(w.rating ?? '')} ${esc(w.name)}</b><small>Futbin: ${w.last != null ? fmt(w.last) : '–'} · ${w.lastAt ? agoText(w.lastAt) : ''}</small></div>
              <label class="wl-t">Ziel ≤<input type="number" step="50" min="0" data-wt="${esc(w.path)}" value="${w.target}"></label>
              <button class="wl-x" data-wx="${esc(w.path)}" title="Entfernen">✕</button></div>`;
          }).join('') : '<div class="note" style="font-size:12px;color:#7d8aa0">Noch leer. Im Trading-Finder bei einer Karte auf ☆ klicken – das Ziel wird auf „Kaufen bis“ gesetzt.</div>'}
          <div class="fcpt-set"><span>Futbin-Preis alle 10 Min. prüfen<small>Nur solange die Web App offen ist · 1 Abruf pro Minute</small></span><input type="checkbox" class="fcpt-sw" data-wo="watchCheck"></div>
          <div class="fcpt-set"><span>Ton bei Alarm</span><input type="checkbox" class="fcpt-sw" data-wo="watchSound"></div>
          <button class="fcpt-smallbtn" data-wa="notify">🔔 Browser-Benachrichtigungen erlauben</button>
          <div class="fcpt-set"><span>📱 Push aufs Handy (ntfy)<small>App „ntfy“ installieren und dieses Thema abonnieren</small></span></div>
          <div class="ntfy-row"><input type="text" data-wn="topic" placeholder="Thema, z. B. fc27-abc123" value="${esc(settings.ntfyTopic)}"><button class="fcpt-smallbtn" data-wa="gen">Erzeugen</button><button class="fcpt-smallbtn" data-wa="test">Test senden</button></div>
        </div>`;
      box.querySelectorAll('[data-wt]').forEach((i) => i.addEventListener('change', () => {
        const w = settings.watch.find((x) => x.path === i.dataset.wt);
        if (w) { w.target = Math.max(0, parseInt(i.value, 10) || 0); saveSettings(); }
      }));
      box.querySelectorAll('[data-wx]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); remove(b.dataset.wx); }));
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
        const ok = await push('Test: Watchlist-Alarme kommen hier an ✅', 'FC27 Tool');
        showToast(ok ? '📱 Test gesendet – kam die Nachricht an?' : 'Senden fehlgeschlagen – Tampermonkey muss ntfy.sh erlauben', !ok);
      });
      const nb = box.querySelector('[data-wa="notify"]');
      if (nb) nb.addEventListener('click', (e) => {
        e.stopPropagation();
        try { W.Notification.requestPermission().then((r) => showToast(r === 'granted' ? '🔔 Benachrichtigungen erlaubt' : 'Benachrichtigungen nicht erlaubt')); } catch (err) { showToast('Dein Browser unterstützt das nicht', true); }
      });
    }
    function mount(el) { box = el; render(); }
    return { add, remove, has, match, marketChip, mount, render, alarm, push };
  })();

