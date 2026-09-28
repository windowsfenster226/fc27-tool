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
          L.push({ name: p.name, rating: p.rating, val, src: srcName, bin, start: lowerStep(bin), net: afterTax(bin), quick, fav: locked.has(p.id) });
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
          <div class="sa-n"><b>${esc(r.rating)} ${esc(r.name)}</b>${r.fav ? ' <span title="Im SBC-Solver gesperrt – evtl. Lieblingsspieler">🔒</span>' : ''}<small>Wert ${fmt(r.val)} (${r.src})${r.quick && r.quick > r.net ? ' · <span class="fcpt-neg-v">Schnellverkauf bringt mehr!</span>' : ''}</small></div>
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

