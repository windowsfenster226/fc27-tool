  // ==================================================================
  // EXTRAS: Timing-Ampel · Rating-Preise (+ Futter-Rechner) · Verkaufs-Assistent
  // ==================================================================

  // ---------- Timing-Ampel (deutsche Zeit) ----------
  const TIMING = (() => {
    function info(d = new Date()) {
      const day = d.getDay();          // 0 So … 5 Fr … 6 Sa
      const h = d.getHours() + d.getMinutes() / 60;
      if (day === 5 && h >= 16 && h < 19) return { cls: 'warn', icon: '⚠', title: 'Promo-Freitag – gleich 19 Uhr neue Inhalte', text: 'Preise fallen um 19 Uhr oft deutlich. Jetzt nichts Teures kaufen, eher verkaufen.' };
      if (day === 5 && h >= 19 && h < 23) return { cls: 'buy', icon: '🟢', title: 'Promo ist raus – Kaufgelegenheit', text: 'Nach dem ersten Preissturz (ab ca. 20–21 Uhr) günstig einkaufen, später teurer verkaufen.' };
      if (h >= 18.75 && h < 19.5) return { cls: 'warn', icon: '⚡', title: '19 Uhr: neue Inhalte & SBCs', text: 'Neue SBCs können Futter-Preise (83–88er) sprunghaft steigen lassen. Beobachten!' };
      if (h >= 1 && h < 9) return { cls: 'buy', icon: '🟢', title: 'Kaufzeit', text: 'Wenige Spieler online – Preise meist im Tagestief. Gute Zeit zum Einkaufen.' };
      const wl = day === 4 || day === 5 || day === 6 || day === 0;
      if (h >= 17 && h < 23.5) return { cls: 'sell', icon: '🔴', title: wl ? 'Verkaufszeit (Weekend League)' : 'Verkaufszeit', text: wl ? 'Abends Do–So kaufen viele für die Weekend League – beste Zeit zum Verkaufen.' : 'Abends sind die meisten Käufer online – gute Zeit zum Verkaufen.' };
      return { cls: 'mid', icon: '○', title: 'Neutrale Zeit', text: 'Kein besonderer Vorteil – normal handeln, auf Kaufpreise warten.' };
    }
    const html = () => { const t = info(); return `<div class="tim ${t.cls}"><b>${t.icon} ${t.title}</b><span>${t.text}</span></div>`; };
    return { info, html };
  })();

  // ---------- Rating-Preise von Futbin (1 Abruf) + Futter-Rechner ----------
  const RATINGS = (() => {
    if (settings.comboTarget === undefined) settings.comboTarget = 84;
    const RC_KEY = 'fcpt_rating_prices';
    let data = GM_getValue(RC_KEY, null);   // { t, plat, prices: {r: p}, names: {r: [..]} }

    const parseK = (t) => {
      const m = String(t || '').replace(/\s/g, '').match(/([\d.,]+)\s*([KkMm])?/);
      if (!m) return null;
      let v = parseFloat(m[1].replace(/,/g, '.').replace(/\.(?=\d{3}\b)/g, ''));
      if (m[2]) v *= /[Kk]/.test(m[2]) ? 1000 : 1e6;
      return Math.round(v) || null;
    };

    function parse(html, plat) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const heads = [...doc.querySelectorAll('h1,h2,h3,h4,h5,div,span,p')].filter((e) => e.children.length === 0 && /^\s*\d{2}\s+Rated Players\s*$/i.test(e.textContent));
      const prices = {}, names = {};
      heads.forEach((h, idx) => {
        const r = parseInt(h.textContent, 10);
        let box = h.parentElement;
        while (box && !box.querySelector('a[href*="/player/"]')) box = box.parentElement;
        if (!box) return;
        // Enthält die Box mehrere Rating-Blöcke? Dann nur bis zur nächsten Überschrift lesen.
        const next = heads[idx + 1];
        const inBlock = (el) => {
          if (!next || !box.contains(next)) return true;
          return !!(h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(el.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING);
        };
        const vals = [...box.querySelectorAll(`.platform-${plat}-only`)].filter(inBlock).map((e) => parseK(e.textContent)).filter((v) => v && v >= 150);
        const nm = [...box.querySelectorAll('a[href*="/player/"]')].filter(inBlock).map((a) => a.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
        if (vals.length) { prices[r] = Math.min(...vals); names[r] = [...new Set(nm)].slice(0, 3); }
      });
      return { prices, names };
    }

    async function load(force) {
      const plat = settings.platform === 'pc' ? 'pc' : 'ps';
      if (!force && data && data.plat === plat && Date.now() - data.t < 30 * 60000) return data;
      const html = await gmGet('https://www.futbin.com/27/stc/cheapest', 'text');
      if (isCfPage(html)) throw new Error(CHECK_MSG);
      const res = parse(html, plat);
      if (!Object.keys(res.prices).length) throw new Error('Futbin-Seite konnte nicht gelesen werden (Aufbau geändert?)');
      data = { t: Date.now(), plat, prices: res.prices, names: res.names };
      GM_setValue(RC_KEY, data);
      return data;
    }
    const get = () => data;

    function comboHtml() {
      if (!data) return '';
      const c = SBC.cheapestCombo(data.prices, settings.comboTarget);
      if (!c) return `<div class="note">Für Teambewertung ${settings.comboTarget} keine Kombination aus den Futbin-Ratings möglich.</div>`;
      const groups = {};
      c.ratings.forEach((r) => { groups[r] = (groups[r] || 0) + 1; });
      const txt = Object.keys(groups).sort((a, b) => b - a).map((r) => `<b>${groups[r]}× ${r}</b>`).join(' + ');
      return `<div class="combo">${txt}<span>≈ <b>${fmt(c.cost)}</b> Münzen (wenn alles gekauft)</span></div>`;
    }

    let box = null;
    function render(msg) {
      if (!box) return;
      const rows = data ? Object.keys(data.prices).map(Number).sort((a, b) => a - b).map((r) => `
        <div class="rp-row"><span class="rp-r">${r}</span><b>${fmt(data.prices[r])}</b><small>${esc((data.names[r] || []).join(', '))}</small></div>`).join('') : '';
      box.innerHTML = `
        <div class="fcpt-sgroup"><h4>📊 Rating-Preise (günstigste Karte)</h4>
          <div class="note" style="font-size:12px;color:#a7b3c6">Günstigste Karte pro Rating laut Futbin – zeigt, was SBC-Futter gerade kostet. 1 Abruf, 30 Min. gespeichert.</div>
          <button class="fcpt-bigbtn" data-ra="load">📊 Rating-Preise laden</button>
          <div class="fcpt-stand">${msg || (data ? `Stand: ${agoText(data.t)} · ${data.plat === 'pc' ? 'PC' : 'Konsole'}` : '')}</div>
          ${rows ? `<div class="rp-list">${rows}</div>
          <div class="fcpt-set"><span>Futter-Rechner: Teambewertung<small>Günstigste Rating-Kombination, wenn du alle 11 kaufst</small></span><input type="number" min="60" max="95" data-ra="target" value="${settings.comboTarget}"></div>
          <div data-ra="combo">${comboHtml()}</div>` : ''}
        </div>`;
      box.querySelector('[data-ra="load"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        render('Lade von Futbin …');
        try { await load(true); render(); } catch (err) { render('Fehler: ' + err.message); }
      });
      const t = box.querySelector('[data-ra="target"]');
      if (t) t.addEventListener('change', () => {
        settings.comboTarget = Math.max(60, Math.min(95, parseInt(t.value, 10) || 84)); saveSettings();
        box.querySelector('[data-ra="combo"]').innerHTML = comboHtml();
      });
    }
    function mount(el) { box = el; render(); }
    return { load, get, mount, parse };
  })();

  // ---------- Verkaufs-Assistent ----------
  const SELL = (() => {
    if (settings.sellMinValue === undefined) settings.sellMinValue = 1000;
    let box = null, list = null, status = '';
    const setSt = (m) => { status = m; const el = box && box.querySelector('[data-sa="st"]'); if (el) el.textContent = m; };
    async function run() {
      const btn = box.querySelector('[data-sa="run"]');
      btn.disabled = true;
      try {
        const c = await SBCUI.loadClub((m) => setSt(m), false);
        setSt('Lese aktive Mannschaft …');
        const act = await SBCUI.activeSquadIds();
        const locked = new Set((settings.sbcLocked || []).map((x) => x.id));
        const L = [];
        for (const p of c.players) {
          if (p.untradeable || p.loans > 0 || act.has(p.id)) continue;
          const ent = c.ents.get(p.id);
          const resId = ent && (ent.resourceId || ent.definitionId);
          const fb = resId != null ? cacheGet(`futbin:${settings.platform}:${resId}`) : null;
          const raw = SBCUI.CAP.raw.get(p.id) || {};
          const val = fb || raw.marketAverage || p.value || null;
          if (!val || val < settings.sellMinValue) continue;
          const srcName = fb ? 'Futbin' : raw.marketAverage ? 'EA' : 'geschätzt';
          const bin = roundPrice(val);
          const quick = raw.discardValue || (ent && ent.discardValue) || 0;
          if (locked.has(p.id)) continue;   // Favorit -> nie zum Verkauf vorschlagen
          L.push({ id: p.id, name: p.name, rating: p.rating, val, src: srcName, bin, start: lowerStep(bin), net: afterTax(bin), quick });
        }
        L.sort((a, b) => b.val - a.val);
        list = { L, activeRead: act.size > 0 };
        status = `${L.length} Karten ab ${fmt(settings.sellMinValue)} gefunden · aktive Mannschaft ${act.size ? 'ausgeschlossen' : 'konnte nicht gelesen werden – selbst prüfen!'}`;
        render();
      } catch (e) { setSt('Fehler: ' + e.message); } finally { const b2 = box.querySelector('[data-sa="run"]'); if (b2) b2.disabled = false; }
    }
    function render() {
      if (!box) return;
      const t = TIMING.info();
      const rows = list ? list.L.slice(0, 40).map((r) => `
        <div class="sa-row">
          <div class="sa-n"><b>${esc(r.rating)} ${esc(r.name)}</b> ${FAV.btn({ id: r.id, name: r.name, rating: r.rating })}<small>Wert ${fmt(r.val)} (${r.src})${r.quick && r.quick > r.net ? ' · <span class="fcpt-neg-v">Schnellverkauf bringt mehr!</span>' : ''}</small></div>
          <div class="sa-p"><span>Einstellen</span><b>${fmt(r.start)} / ${fmt(r.bin)}</b><small>du bekommst ${fmt(r.net)}</small></div>
        </div>`).join('') : '';
      const total = list ? list.L.reduce((a, r) => a + r.net, 0) : 0;
      box.innerHTML = `
        <div class="fcpt-sgroup"><h4>🏷 Verkaufs-Assistent</h4>
          <div class="note" style="font-size:12px;color:#a7b3c6">Handelbare Spieler, die <b>nicht in deiner aktiven Mannschaft</b> stehen – mit Preisvorschlag (Start / Sofortkauf). Einstellen machst du selbst in der Web App (Tipp: „Futbin-Preis übernehmen“).</div>
          ${TIMING.html()}
          <div class="fcpt-set"><span>Nur Karten ab Wert</span><input type="number" step="500" min="0" data-sa="min" value="${settings.sellMinValue}"></div>
          <button class="fcpt-bigbtn" data-sa="run">🏷 Verkaufs-Kandidaten suchen</button>
          <div class="fcpt-stand" data-sa="st">${esc(status)}</div>
          ${list && list.L.length ? `<div class="fcpt-stand">Alles verkauft brächte ca. <b class="fcpt-pos-v">${fmt(total)}</b> nach Steuer${t.cls === 'sell' ? ' · 🔴 jetzt ist Verkaufszeit' : t.cls === 'buy' ? ' · besser abends einstellen' : ''}</div><div class="sa-list">${rows}</div>` : ''}
        </div>`;
      box.querySelector('[data-sa="run"]').addEventListener('click', (e) => { e.stopPropagation(); run(); });
      box.querySelector('[data-sa="min"]').addEventListener('change', (e) => { settings.sellMinValue = Math.max(0, parseInt(e.target.value, 10) || 0); saveSettings(); });
    }
    function mount(el) { box = el; render(); }
    return { mount };
  })();


  // ---------- Verkaufs-Alarm ----------
  // Für eigene Karten ein Verkaufsziel setzen. Meldung (Ton, Toast, Handy-Push),
  // sobald der Futbin-Preis das Ziel erreicht. Stellt nichts selbst ein.
  const SELLALERT = (() => {
    if (!Array.isArray(settings.sellTargets)) settings.sellTargets = [];
    let box = null;
    const find = (iid) => settings.sellTargets.find((t) => String(t.itemId) === String(iid));
    const has = (iid) => iid != null && !!find(iid);
    const get = (iid) => find(iid) || null;
    function toggle(p, market) {
      if (p.itemId == null) return;
      if (has(p.itemId)) { remove(p.itemId); showToast(`🎯 Verkaufsziel für ${p.name} entfernt`); return; }
      const base = Math.max(market ? market * 1.05 : 0, p.bought ? breakEven(p.bought) * 1.05 : 0);
      if (!base) { showToast('Noch kein Preis bekannt – erst Preise laden', true); return; }
      const target = roundPrice(base);
      settings.sellTargets.push({ itemId: p.itemId, resourceId: p.resourceId, name: p.name, fullName: p.fullName, rating: p.rating,
        bought: p.bought || 0, target, last: market || null, lastAt: market ? Date.now() : 0 });
      saveSettings(); render();
      showToast(`🎯 Verkaufsziel ${fmt(target)} für ${p.name} – Alarm, sobald Futbin das erreicht (Ziel im Trading-Reiter › Verein änderbar)`);
    }
    function remove(iid) { settings.sellTargets = settings.sellTargets.filter((t) => String(t.itemId) !== String(iid)); saveSettings(); render(); }
    function sold(iid) { if (has(iid)) remove(iid); }

    setInterval(async () => {
      if (!settings.sellTargets.length || document.visibilityState !== 'visible' || futbinBlocked()) return;
      const due = settings.sellTargets.filter((t) => Date.now() - (t.lastAt || 0) > 10 * 60000).sort((a, b) => (a.lastAt || 0) - (b.lastAt || 0))[0];
      if (!due) return;
      due.lastAt = Date.now();
      try {
        const v = await getPrice('futbin', { resourceId: due.resourceId, name: due.name, fullName: due.fullName, rating: due.rating, isPlayer: true });
        if (v) {
          due.last = v; saveSettings(); render();
          if (v >= due.target) WATCH.alarm(`s${due.itemId}`, `${due.name} steht bei ${fmt(v)} (Futbin) – dein Verkaufsziel ${fmt(due.target)} ist erreicht. Jetzt einstellen!`, 60 * 60000);
        } else saveSettings();
      } catch (e) { log('SellAlert', e); saveSettings(); }
    }, 60000);

    function render() {
      if (!box) return;
      const L = settings.sellTargets;
      box.innerHTML = `
        <div class="fcpt-sgroup"><h4>🎯 Verkaufs-Alarm</h4>
          ${L.length ? L.map((t) => {
            const hit = t.last != null && t.last >= t.target;
            const prof = t.bought ? afterTax(t.target) - t.bought : null;
            return `<div class="wl-row ${hit ? 'hit' : ''}">
              <div class="wl-name"><b>${esc(t.rating ?? '')} ${esc(t.name)}</b><small>Futbin: ${t.last != null ? fmt(t.last) : '–'}${t.lastAt ? ' · ' + agoText(t.lastAt) : ''}${prof != null ? ` · Profit am Ziel ${signed(prof)}` : ''}</small></div>
              <label class="wl-t">Ziel ≥<input type="number" step="50" min="0" data-st="${esc(t.itemId)}" value="${t.target}"></label>
              <button class="wl-x" data-sx="${esc(t.itemId)}" title="Entfernen">✕</button></div>`;
          }).join('') : '<div class="note" style="font-size:12px;color:#7d8aa0">Noch leer. In der Transferliste (Panel) bei einer eigenen Karte auf „🎯 Verkaufsziel“ tippen.</div>'}
          <div class="note" style="font-size:11px;color:#7d8aa0">Prüft jede Karte alle 10 Min. bei Futbin, solange die Web App offen ist. Alarm per Ton, Meldung und – falls eingerichtet – Push aufs Handy (ntfy, siehe Markt › Watchlist).</div>
        </div>`;
      box.querySelectorAll('[data-st]').forEach((i) => i.addEventListener('change', () => {
        const t = find(i.dataset.st);
        if (t) { t.target = Math.max(0, parseInt(i.value, 10) || 0); saveSettings(); render(); }
      }));
      box.querySelectorAll('[data-sx]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); remove(b.dataset.sx); }));
    }
    function mount(el) { box = el; render(); }
    return { has, get, toggle, remove, sold, mount };
  })();

  // ---------- Preis-Einschätzung: steigt / fällt? ----------
  // Regeln aus Futbin-Verlauf (Trend, Lage in der Spanne, Kartenalter, Futter-Boden, Wochentag).
  // Keine Garantie – die Trefferquote der Regeln für genau diese Karte wird mit angezeigt.
  const PROGNOSE = (() => {
    let box = null, state = { q: '', list: null, pick: null, res: null, msg: '' };
    const DAY = 86400000;
    const slope = (a) => {   // Steigung von log(Preis) pro Tag
      const n = a.length; if (n < 2) return 0;
      const ys = a.map((v) => Math.log(Math.max(1, v)));
      const mx = (n - 1) / 2, my = ys.reduce((s, v) => s + v, 0) / n;
      let num = 0, den = 0;
      ys.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) * (i - mx); });
      return den ? num / den : 0;
    };
    const P = (x) => `${x > 0 ? '+' : ''}${Math.round(x * 100)} %`;

    // Bewertung nur aus Tageswerten (für den Rückblick-Test wiederverwendbar)
    function dailyScore(d) {
      const n = d.length, cur = d[n - 1];
      const out = { s: 0, why: [] };
      const add = (v, t) => { out.s += v; out.why.push({ v, t }); };
      if (n < 7) add(-2, `Neue Karte (erst ${n} Tage auf dem Markt) – neue Karten fallen meist in den ersten 1–2 Wochen`);
      else if (n < 14) add(-1, `Noch recht neue Karte (${n} Tage) – oft noch leicht fallend`);
      const w = d.slice(-7), sl = slope(w);
      const wk = Math.exp(sl * (w.length - 1)) - 1;
      if (sl > 0.02) add(1, `Trend 7 Tage steigend (${P(wk)})`);
      else if (sl < -0.02) add(-1, `Trend 7 Tage fallend (${P(wk)})`);
      else out.why.push({ v: 0, t: `Trend 7 Tage flach (${P(wk)})` });
      const r = d.slice(-30), lo = Math.min(...r), hi = Math.max(...r);
      if (hi > lo * 1.08 && n >= 10) {
        const pos = (cur - lo) / (hi - lo);
        if (pos <= 0.2) add(1, `Liegt nahe am ${r.length}-Tage-Tief (${fmt(lo)}) – Luft nach oben`);
        else if (pos >= 0.85) add(-1, `Liegt nahe am ${r.length}-Tage-Hoch (${fmt(hi)}) – Rücksetzer wahrscheinlich`);
      }
      if (n >= 3) {
        const d3 = cur / d[n - 3] - 1;
        if (d3 < -0.2) add(1, `In 2 Tagen um ${P(d3)} gefallen – nach starkem Absturz oft Gegenbewegung`);
        if (d3 > 0.25) add(-1, `In 2 Tagen um ${P(d3)} gestiegen – nach Sprüngen oft Gewinnmitnahmen`);
      }
      return out;
    }

    function forecast(daily, hourly, rating, floor, now = new Date()) {
      const d = daily.map((x) => x[1]).filter((v) => v > 0);
      const h = (hourly || []).map((x) => x[1]).filter((v) => v > 0);
      const cur = h.length ? h[h.length - 1] : d[d.length - 1];
      if (d.length) d[d.length - 1] = cur;
      const base = dailyScore(d);
      let s = base.s; const why = base.why.slice();
      const add = (v, t) => { s += v; why.push({ v, t }); };
      if (h.length >= 30) {
        const ch = cur / h[Math.max(0, h.length - 25)] - 1;
        if (ch > 0.05) add(0.5, `Letzte 24 Std. ${P(ch)} – Schwung nach oben`);
        else if (ch < -0.05) add(-0.5, `Letzte 24 Std. ${P(ch)} – Schwung nach unten`);
      }
      if (floor && rating >= 82) {
        if (cur <= floor * 1.15) add(1, `Kostet kaum mehr als die günstigste ${rating}er (${fmt(floor)}) – SBC-Futter, viel tiefer geht es kaum`);
        const dow = now.getDay(), hr = now.getHours();
        if ((dow === 3 && hr >= 19) || dow === 4 || (dow === 5 && hr < 19)) add(0.5, 'Vor neuen SBCs/Promo (Do/Fr) steigen Futter-Preise oft');
      }
      const dow = now.getDay(), hr = now.getHours();
      if (dow === 5 && hr >= 12 && hr < 19) add(-1, 'Freitag vor 19 Uhr: neue Promo-Karten drücken die Preise oft');
      else if ((dow === 4 || dow === 5) && hr >= 19 || dow === 6 || dow === 0) {
        if (!floor || rating < 82) add(0.5, 'Weekend League (Do–So): mehr Nachfrage nach guten Spielern');
      }
      // Rückblick: Wie oft lagen die Tagesregeln bei DIESER Karte richtig (3 Tage später)?
      let bt = null;
      if (d.length >= 20) {
        let ok = 0, tot = 0;
        for (let i = 14; i < d.length - 3; i++) {
          const sc = dailyScore(d.slice(0, i + 1)).s;
          if (Math.abs(sc) < 1) continue;
          const fut = d[i + 3] / d[i] - 1;
          if (Math.abs(fut) < 0.02) continue;
          tot++; if (Math.sign(fut) === Math.sign(sc)) ok++;
        }
        if (tot >= 5) bt = { ok, tot };
      }
      const rets = []; for (let i = Math.max(1, d.length - 14); i < d.length; i++) rets.push(d[i] / d[i - 1] - 1);
      const vol = rets.length ? Math.sqrt(rets.reduce((a, r) => a + r * r, 0) / rets.length) : 0;
      const verdict = s >= 1.5 ? 'up' : s <= -1.5 ? 'down' : 'flat';
      let conf = Math.abs(s) >= 3 ? 'mittel' : 'niedrig';
      if (bt && bt.ok / bt.tot >= 0.62 && Math.abs(s) >= 1.5) conf = Math.abs(s) >= 3 ? 'hoch' : 'mittel';
      if (bt && bt.ok / bt.tot < 0.5) conf = 'niedrig';
      const last3 = h.slice(-72);
      return { cur, s, verdict, conf, why, bt, vol, lo3: last3.length ? roundPrice(Math.min(...last3)) : null, hi3: last3.length ? roundPrice(Math.max(...last3)) : null, days: d.length };
    }

    async function search(q) {
      const html = await gmGet('https://www.futbin.com/players?search=' + encodeURIComponent(q), 'text');
      if (isCfPage(html)) throw new Error(CHECK_MSG);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const out = [];
      for (const tr of doc.querySelectorAll('tbody tr')) {
        const a = tr.querySelector('a[href*="/player/"]');
        if (!a) continue;
        const path = a.getAttribute('href').split('?')[0];
        if (!/^\/27\/player\//.test(path) || out.some((x) => x.path === path)) continue;
        const nameEl = tr.querySelector('.table-player-name, .player-name') || a;
        const name = (nameEl.textContent || '').replace(/\s+/g, ' ').trim();
        const rating = toNum((tr.querySelector('.table-rating, .rating') || {}).textContent) || toNum((tr.textContent.match(/\b([4-9]\d)\b/) || [])[1]);
        const ver = ((tr.querySelector('.table-player-revision, .player-revision, .revision') || {}).textContent || '').replace(/\s+/g, ' ').trim();
        const plat = settings.platform === 'pc' ? 'pc' : 'ps';
        const pt = String((tr.querySelector(`.platform-${plat}-only`) || {}).textContent || '').replace(/\s/g, '');
        const pm = pt.match(/([\d.,]+)([KkMm])?/);
        const price = pm ? Math.round(parseFloat(pm[2] ? pm[1].replace(',', '.') : pm[1].replace(/[.,]/g, '')) * (pm[2] ? (/k/i.test(pm[2]) ? 1000 : 1e6) : 1)) : null;
        out.push({ path, name: name || path.split('/').pop(), rating, ver, price });
        if (out.length >= 10) break;
      }
      return out;
    }

    async function market(path) {
      const html = await gmGet(`https://www.futbin.com${path}/market`, 'text');
      if (isCfPage(html)) throw new Error(CHECK_MSG);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const plat = settings.platform === 'pc' ? 'pc' : 'ps';
      const series = [...doc.querySelectorAll(`[data-${plat}-data]`)].map((e) => {
        try { return JSON.parse(e.getAttribute(`data-${plat}-data`)); } catch (err) { return []; }
      }).filter((a) => Array.isArray(a) && a.length > 1);
      const hourly = series.filter((a) => a[1][0] - a[0][0] <= 3600000 * 1.5).sort((a, b) => b.length - a.length)[0] || [];
      const daily = series.find((a) => a[1][0] - a[0][0] >= 3600000 * 20) || [];
      if (!daily.length && !hourly.length) throw new Error('Kein Preisverlauf bei Futbin gefunden');
      return { daily, hourly };
    }

    async function pick(c) {
      state.pick = c; state.res = null; state.msg = `Lade Preisverlauf von ${c.name} …`; render();
      try {
        const m = await market(c.path);
        let floor = null;
        try { const rp = RATINGS.get() || (c.rating >= 82 ? await RATINGS.load() : null); floor = rp && rp.prices[c.rating]; } catch (e) { /* ohne Futter-Boden */ }
        const daily = m.daily.length ? m.daily : [];
        state.res = forecast(daily.length ? daily : m.hourly.filter((x, i) => i % 24 === 0), m.hourly, c.rating, floor);
        state.msg = '';
      } catch (e) { state.msg = 'Fehler: ' + e.message; }
      render();
    }

    async function doSearch() {
      const q = state.q.trim();
      if (q.length < 3) { state.msg = 'Mindestens 3 Buchstaben eingeben'; render(); return; }
      state.list = null; state.pick = null; state.res = null; state.msg = 'Suche bei Futbin …'; render();
      try {
        state.list = await search(q);
        state.msg = state.list.length ? '' : 'Nichts gefunden – Schreibweise prüfen (z. B. „Mbappe“)';
        if (state.list.length === 1) { render(); return pick(state.list[0]); }
      } catch (e) { state.msg = 'Fehler: ' + e.message; }
      render();
    }

    function resHtml() {
      const r = state.res, c = state.pick;
      if (!r || !c) return '';
      const V = { up: ['up', '📈 Wird eher steigen'], down: ['down', '📉 Wird eher fallen'], flat: ['flat', '➡️ Eher seitwärts'] }[r.verdict];
      const tip = r.verdict === 'up' ? `Kaufen lohnt eher jetzt${r.lo3 ? ` (Tief der letzten 3 Tage: ${fmt(r.lo3)})` : ''}. Besitzt du sie: noch halten.`
        : r.verdict === 'down' ? `Nicht kaufen – abwarten. Besitzt du sie: eher bald verkaufen${r.hi3 ? ` (Hoch der letzten 3 Tage: ${fmt(r.hi3)})` : ''}.`
          : `Kein klarer Trend. Nur mit Spanne handeln: unter ${r.lo3 ? fmt(r.lo3) : '–'} kaufen, bei ${r.hi3 ? fmt(r.hi3) : '–'} verkaufen.`;
      return `<div class="pg-res ${V[0]}">
          <div class="pg-h"><b>${esc(c.rating ?? '')} ${esc(c.name)}</b>${c.ver ? ` <small>${esc(c.ver)}</small>` : ''}<span>jetzt ${fmt(r.cur)}</span></div>
          <div class="pg-v">${V[1]}</div>
          <div class="pg-c">Sicherheit: <b>${r.conf}</b> · Zeitraum: nächste 1–3 Tage${r.bt ? ` · Diese Regeln lagen bei der Karte ${r.bt.ok} von ${r.bt.tot} Mal richtig` : ''}</div>
          <ul class="pg-w">${r.why.map((w) => `<li class="${w.v > 0 ? 'p' : w.v < 0 ? 'n' : ''}">${w.v > 0 ? '▲' : w.v < 0 ? '▼' : '•'} ${esc(w.t)}</li>`).join('')}</ul>
          <div class="pg-tip">💡 ${esc(tip)}</div>
          <div class="btns"><button class="fcpt-smallbtn" data-pg="watch">${WATCH.has(c.path) ? '⭐ Auf der Watchlist' : '☆ Auf Watchlist (Alarm)'}</button></div>
          <div class="note" style="font-size:11px;color:#7d8aa0">Schätzung aus dem Futbin-Verlauf – keine Garantie. Promos, neue SBCs oder Content können alles schnell drehen.</div>
        </div>`;
    }

    function render() {
      if (!box) return;
      const L = state.list;
      box.innerHTML = `
        <div class="fcpt-sgroup"><h4>🔮 Preis-Einschätzung</h4>
          <div class="note" style="font-size:12px;color:#a7b3c6">Spielername eingeben – das Tool sagt, ob der Preis eher steigt oder fällt, und warum.</div>
          <div class="ntfy-row"><input type="text" data-pg="q" placeholder="z. B. Wirtz" value="${esc(state.q)}"><button class="fcpt-smallbtn" data-pg="go">🔮 Einschätzen</button></div>
          ${state.msg ? `<div class="fcpt-stand">${esc(state.msg)}</div>` : ''}
          ${L && L.length > 1 && !state.res ? `<div class="pg-list">${L.map((c, i) => `<button class="pg-item${state.pick === c ? ' on' : ''}" data-pi="${i}"><b>${esc(c.rating ?? '')}</b> ${esc(c.name)}${c.ver ? ` <small>${esc(c.ver)}</small>` : ''}${c.price ? `<span>${fmt(c.price)}</span>` : ''}</button>`).join('')}</div>` : ''}
          ${resHtml()}
          ${state.res && L && L.length > 1 ? '<button class="fcpt-smallbtn" data-pg="back">← andere Version wählen</button>' : ''}
        </div>`;
      const q = box.querySelector('[data-pg="q"]');
      q.addEventListener('input', () => { state.q = q.value; });
      q.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') doSearch(); });
      box.querySelector('[data-pg="go"]').addEventListener('click', (e) => { e.stopPropagation(); doSearch(); });
      box.querySelectorAll('[data-pi]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); pick(state.list[+b.dataset.pi]); }));
      const bk = box.querySelector('[data-pg="back"]');
      if (bk) bk.addEventListener('click', (e) => { e.stopPropagation(); state.res = null; state.pick = null; render(); });
      const wb = box.querySelector('[data-pg="watch"]');
      if (wb) wb.addEventListener('click', (e) => {
        e.stopPropagation();
        const c = state.pick, r = state.res;
        if (WATCH.has(c.path)) return;
        WATCH.add({ path: c.path, name: c.name, rating: c.rating, buy: roundPrice(r.lo3 || r.cur * 0.95), sell: r.hi3 || r.cur, current: r.cur });
        render();
      });
    }
    function mount(el) { box = el; render(); }
    return { mount, forecast };
  })();
