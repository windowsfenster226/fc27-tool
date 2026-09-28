  // ==================================================================
  // TRADING-FINDER: Spieler mit lohnender Tages-Preisspanne (Futbin-Stundenpreise)
  // Liest nur Futbin – kauft oder bietet nichts.
  // ==================================================================
  const TRADE = (() => {
    if (settings.tradeMin === undefined) settings.tradeMin = 5000;
    if (settings.tradeMax === undefined) settings.tradeMax = 30000;
    if (settings.tradeMinProfit === undefined) settings.tradeMinProfit = 500;
    if (settings.tradeCount === undefined || settings.tradeCount > 60) settings.tradeCount = 25;
    if (settings.tradeHideFalling === undefined) settings.tradeHideFalling = true;
    if (settings.tradeSort === undefined) settings.tradeSort = 'profit';
    if (settings.tradeOnlyReliable === undefined) settings.tradeOnlyReliable = true;

    // Ergebnisse 60 Min. dauerhaft merken (auch nach Neuladen) -> weniger Futbin-Abrufe
    const TC_KEY = 'fcpt_trade_cache';
    const TCACHE = GM_getValue(TC_KEY, {});
    for (const k of Object.keys(TCACHE)) if (Date.now() - TCACHE[k].t > 60 * 60000) delete TCACHE[k];
    const saveTC = () => GM_setValue(TC_KEY, TCACHE);
    let running = false, stopFlag = false, results = [];

    const pct = (arr, q) => {
      const a = [...arr].sort((x, y) => x - y);
      if (!a.length) return null;
      const i = Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))));
      return a[i];
    };
    const stepDown = (v) => { const st = stepFor(v); return Math.floor(v / st) * st; };
    const stepUp = (v) => { const st = stepFor(v); return Math.ceil(v / st) * st; };

    async function candidates(min, max, want) {
      const plat = settings.platform === 'pc' ? 'pc' : 'ps';
      const out = [];
      for (let page = 1; page <= 3 && out.length < want; page++) {
        const url = `https://www.futbin.com/27/players?${plat}_price=${min}-${max}&sort=${plat}_price&order=desc&page=${page}`;
        const html = await gmGet(url, 'text');
        if (isCfPage(html)) throw new Error('Futbin-Schutzseite – öffne futbin.com einmal in einem Tab');
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const rows = [...doc.querySelectorAll('tbody tr')];
        if (!rows.length) break;
        for (const r of rows) {
          const a = r.querySelector('a[href*="/player/"]');
          if (!a) continue;
          const path = a.getAttribute('href').split('?')[0];
          if (out.some((x) => x.path === path)) continue;
          const nameEl = r.querySelector('.table-player-name, .player-name') || a;
          out.push({
            path,
            name: (nameEl.textContent || '').replace(/\s+/g, ' ').trim().replace(/\s+(Normal|Rare).*$/i, ''),
            rating: toNum((r.querySelector('.table-rating') || {}).textContent),
          });
          if (out.length >= want) break;
        }
        await sleep(600);
      }
      return out;
    }

    async function analyse(c, maxAge = 60 * 60000) {
      const hit = TCACHE[c.path];
      if (hit && Date.now() - hit.t < maxAge && hit.data && hit.data.nDays != null) return hit.data;
      const html = await gmGet(`https://www.futbin.com${c.path}/market`, 'text');
      if (isCfPage(html)) throw new Error('Futbin-Schutzseite');
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const plat = settings.platform === 'pc' ? 'pc' : 'ps';
      const series = [...doc.querySelectorAll(`[data-${plat}-data]`)].map((e) => {
        try { return JSON.parse(e.getAttribute(`data-${plat}-data`)); } catch (err) { return []; }
      }).filter((a) => Array.isArray(a) && a.length > 1);
      const hourly = series.filter((a) => a[1][0] - a[0][0] <= 3600000 * 1.5).sort((a, b) => b.length - a.length)[0];
      const daily = series.find((a) => a[1][0] - a[0][0] >= 3600000 * 20);
      if (!hourly || hourly.length < 24) return null;
      const last72 = hourly.slice(-72).map((x) => x[1]).filter((v) => v > 0);
      const current = hourly[hourly.length - 1][1];
      // Tages-Schwankung statt Gesamtspanne: je 24-Std.-Fenster Tief (P10) und Hoch (P90), davon der Median.
      // So zählt ein fallender Preis nicht als "Spanne".
      const days = [];
      for (let end = last72.length; end >= 12; end -= 24) days.push(last72.slice(Math.max(0, end - 24), end));
      const med = (a) => pct(a, 0.5);
      const buy = stepDown(med(days.map((d) => pct(d, 0.1))));
      const sell = stepUp(med(days.map((d) => pct(d, 0.9))));
      const profit = afterTax(sell) - buy;
      // Zuverlässigkeit: an wie vielen der letzten Tage gab es wirklich Kaufpreis UND Verkaufspreis?
      const nDays = days.length;
      const hitDays = days.filter((d) => Math.min(...d) <= buy * 1.01 && Math.max(...d) >= sell * 0.99).length;
      let trend = null;
      if (daily && daily.length >= 4) {
        const d = daily.map((x) => x[1]);
        const ref = d[d.length - 4];
        if (ref > 0) trend = (current - ref) / ref;
      }
      const data = { current, buy, sell, profit, margin: buy ? profit / buy : 0, trend, low: Math.min(...last72), high: Math.max(...last72), spark: last72, nDays, hitDays };
      TCACHE[c.path] = { t: Date.now(), data }; saveTC();
      return data;
    }

    const falling = (r) => r.trend != null && r.trend < -0.15;
    function signal(r) {
      if (falling(r)) return '<span class="tsig bad" title="Preis ist in 3 Tagen um mehr als 15 % gefallen">⚠ Fällt stark – Finger weg</span>';
      if (r.current <= r.buy * 1.02) return '<span class="tsig good" title="Aktueller Preis liegt im Tagestief">● Guter Kaufpreis</span>';
      if (r.current >= r.sell * 0.98) return '<span class="tsig hot" title="Preis liegt im Tageshoch – zum Kaufen zu teuer. Besitzt du die Karte: guter Verkaufszeitpunkt.">● Gerade teuer – nicht kaufen</span>';
      return '<span class="tsig" title="Preis liegt zwischen Tief und Hoch">○ Auf Kaufpreis warten</span>';
    }
    function reliability(r) {
      if (r.nDays == null) return '';
      const cls = r.hitDays >= 2 ? 'good' : r.hitDays === 1 ? 'mid' : 'bad';
      const txt = r.hitDays >= 2 ? `Regelmäßig: an ${r.hitDays} von ${r.nDays} Tagen machbar` : r.hitDays === 1 ? `Nur an 1 von ${r.nDays} Tagen machbar` : `An keinem Tag ganz erreicht`;
      return `<span class="trel ${cls}" title="An wie vielen der letzten Tage der Preis sowohl bis „Kaufen bis“ fiel als auch bis „Verkaufen für“ stieg">${txt}</span>`;
    }

    // Mini-Preisverlauf (72 Std.) mit Kauf- und Verkaufslinie
    function spark(r) {
      const d = r.spark || [];
      if (d.length < 2) return '';
      const W2 = 300, H2 = 46, pad = 3;
      const lo = Math.min(...d, r.buy), hi = Math.max(...d, r.sell);
      const y = (v) => pad + (hi - v) / Math.max(1, hi - lo) * (H2 - 2 * pad);
      const x = (i) => (i / (d.length - 1)) * W2;
      const pts = d.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      return `<svg class="tspark" viewBox="0 0 ${W2} ${H2}" preserveAspectRatio="none" aria-label="Preisverlauf 72 Stunden">
        <line x1="0" x2="${W2}" y1="${y(r.sell)}" y2="${y(r.sell)}" class="ls"/>
        <line x1="0" x2="${W2}" y1="${y(r.buy)}" y2="${y(r.buy)}" class="lb"/>
        <polyline points="${pts}" class="pl"/>
        <circle cx="${x(d.length - 1)}" cy="${y(d[d.length - 1])}" r="3" class="pt"/></svg>`;
    }

    function renderRows(box) {
      let list = results.filter((r) => r.profit >= settings.tradeMinProfit);
      const hidden = settings.tradeHideFalling ? list.filter(falling).length : 0;
      if (settings.tradeHideFalling) list = list.filter((r) => !falling(r));
      const hiddenRare = settings.tradeOnlyReliable ? list.filter((r) => (r.hitDays ?? 0) < 2).length : 0;
      if (settings.tradeOnlyReliable) list = list.filter((r) => (r.hitDays ?? 0) >= 2);
      const rank = (r) => (r.current <= r.buy * 1.02 ? 0 : r.current >= r.sell * 0.98 ? 2 : 1);
      const sorters = {
        profit: (a, b) => b.profit - a.profit,
        margin: (a, b) => b.margin - a.margin,
        now: (a, b) => rank(a) - rank(b) || b.profit - a.profit,
        reliable: (a, b) => (b.hitDays ?? -1) - (a.hitDays ?? -1) || b.profit - a.profit,
      };
      list.sort(sorters[settings.tradeSort] || sorters.profit);
      const cards = list.map((r) => `
        <div class="tcard">
          <div class="tc-top">
            <span class="tc-ovr">${esc(r.rating ?? '')}</span>
            <a class="tc-name" href="https://www.futbin.com${r.path}/market" target="_blank" rel="noopener" title="Futbin-Preisverlauf öffnen">${esc(r.name)} ↗</a>
            <div class="tc-profit"><b>${signed(r.profit)}</b><small>${Math.round(r.margin * 100)} % Profit</small></div>
            <button class="tc-star ${WATCH.has(r.path) ? 'on' : ''}" data-star="${esc(r.path)}" title="${WATCH.has(r.path) ? 'Auf der Watchlist' : 'Beobachten – Alarm, sobald die Karte unter „Kaufen bis“ auftaucht'}">${WATCH.has(r.path) ? '★' : '☆'}</button>
          </div>
          <div class="tc-sig">${signal(r)}${reliability(r)}${r.trend == null ? '' : `<span class="tc-trend ${r.trend >= 0 ? 'up' : 'down'}">${r.trend >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(r.trend * 100))} % in 3 Tagen</span>`}</div>
          ${spark(r)}
          <div class="tc-stats">
            <div><span>Aktuell</span><b>${fmt(r.current)}</b></div>
            <div class="buy"><span>Kaufen bis</span><b>${fmt(r.buy)}</b></div>
            <div class="sell"><span>Verkaufen für</span><b>${fmt(r.sell)}</b></div>
          </div>
        </div>`).join('');
      const head = `<div class="tbar">
          <select data-ts="tradeSort">
            <option value="profit">Sortieren: höchster Profit</option>
            <option value="margin">Sortieren: höchster Profit in %</option>
            <option value="now">Sortieren: guter Kaufpreis zuerst</option>
            <option value="reliable">Sortieren: am regelmäßigsten zuerst</option>
          </select>
          <label class="tchk"><input type="checkbox" data-tc="tradeHideFalling"> Fallende ausblenden${hidden ? ` (${hidden})` : ''}</label>
          <label class="tchk"><input type="checkbox" data-tc2="tradeOnlyReliable"> Nur regelmäßige${hiddenRare ? ` (${hiddenRare} ausgeblendet)` : ''}</label>
        </div>`;
      box.innerHTML = results.length || running ? head + (list.length ? `<div class="tlist">${cards}</div>`
        : `<div class="fcpt-msg">${running ? 'Suche läuft …' : `Keine passenden Spieler mit mind. ${fmt(settings.tradeMinProfit)} Profit – Budget oder Mindest-Profit ändern.`}</div>`)
        : '<div class="fcpt-msg">Budget einstellen und „Spieler suchen“ klicken.</div>';
      const sel = box.querySelector('[data-ts]');
      if (sel) { sel.value = settings.tradeSort; sel.onchange = () => { settings.tradeSort = sel.value; saveSettings(); renderRows(box); }; }
      box.querySelectorAll('[data-star]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = results.find((x) => x.path === b.dataset.star);
        if (!r) return;
        if (WATCH.has(r.path)) WATCH.remove(r.path); else WATCH.add(r);
        renderRows(box);
      }));
      const chk2 = box.querySelector('[data-tc2]');
      if (chk2) { chk2.checked = !!settings.tradeOnlyReliable; chk2.onchange = () => { settings.tradeOnlyReliable = chk2.checked; saveSettings(); renderRows(box); }; }
      const chk = box.querySelector('[data-tc]');
      if (chk) { chk.checked = !!settings.tradeHideFalling; chk.onchange = () => { settings.tradeHideFalling = chk.checked; saveSettings(); renderRows(box); }; }
    }

    function html() {
      return `
        <div class="fcpt-sgroup"><h4>Trading-Finder</h4>
          <div class="note" style="font-size:12px;color:#a7b3c6">Findet Spieler, deren Preis im Tagesverlauf schwankt: im Tagestief kaufen, im Tageshoch verkaufen. Am verlässlichsten sind Karten mit „Regelmäßig“ – dort hat die Spanne an mehreren Tagen geklappt. Profit nach 5 % Steuer, berechnet aus den Futbin-Stundenpreisen der letzten 3 Tage.</div>
          <div class="fcpt-set"><span>Budget von</span><input type="number" step="500" min="0" data-t="tradeMin"></div>
          <div class="fcpt-set"><span>Budget bis</span><input type="number" step="500" min="0" data-t="tradeMax"></div>
          <div class="fcpt-set"><span>Mindest-Profit pro Karte</span><input type="number" step="100" min="0" data-t="tradeMinProfit"></div>
          <div class="fcpt-set"><span>Spieler prüfen<small>~2 Sek. pro Spieler · max. 60, sonst blockt Futbin</small></span><input type="number" step="5" min="10" max="60" data-t="tradeCount"></div>
          <button class="fcpt-bigbtn" data-act="tradeRun">📈 Spieler suchen</button>
          <div class="fcpt-stand" data-el="tradeStatus"></div>
        </div>
        <div data-el="tradeRes"></div>
        <div class="note" style="font-size:11px;color:#7d8aa0">Grafik: Preis der letzten 72 Std. · <span style="color:#86efac">grüne Linie</span> = Kaufen bis · <span style="color:#fca5a5">rote Linie</span> = Verkaufen für. Futbin-Werte sind Durchschnitte – keine Garantie. Nichts wird automatisch gekauft.</div>`;
    }

    async function run(root) {
      const st = root.querySelector('[data-el="tradeStatus"]');
      const box = root.querySelector('[data-el="tradeRes"]');
      const btn = root.querySelector('[data-act="tradeRun"]');
      if (running) { stopFlag = true; st.textContent = 'Wird gestoppt …'; return; }
      running = true; stopFlag = false; results = [];
      futbinBlockedUntil = 0;   // du startest bewusst neu -> eigene Pause aufheben
      btn.textContent = '■ Stopp';
      try {
        st.textContent = 'Lade Spieler aus Futbin …';
        const min = Math.min(settings.tradeMin, settings.tradeMax), max = Math.max(settings.tradeMin, settings.tradeMax);
        const cands = await candidates(min, max, Math.max(10, Math.min(60, settings.tradeCount)));
        let i = 0, blocked = null;
        for (const c of cands) {
          if (stopFlag) break;
          i++;
          st.textContent = `Prüfe ${i}/${cands.length}: ${c.name} …`;
          try {
            const d = await analyse(c);
            if (d) { results.push(Object.assign({}, c, d)); renderRows(box); }
          } catch (e) {
            log('Trade', c.name, e);
            if (isFutbinBlock(e) || /Schutzseite/.test(e.message)) { blocked = e.message; break; }
          }
          await sleep(1300 + Math.random() * 900);
        }
        const good = results.filter((r) => r.profit >= settings.tradeMinProfit).length;
        st.textContent = blocked
          ? `⚠ ${blocked} Bisher ${results.length} Spieler geprüft – die Ergebnisse bleiben stehen.`
          : `${stopFlag ? 'Gestoppt' : 'Fertig'}: ${results.length} Spieler geprüft, ${good} mit mind. ${fmt(settings.tradeMinProfit)} Profit.`;
      } catch (e) {
        st.textContent = 'Fehler: ' + e.message;
      } finally {
        running = false; btn.textContent = '📈 Spieler suchen'; renderRows(box);
      }
    }

    // ---------- Vereinswert (nur handelbare Karten) ----------
    function clubValueHtml() {
      return `<div class="fcpt-sgroup"><h4>💼 Vereinswert</h4>
          <div class="note" style="font-size:12px;color:#a7b3c6">Wert aller <b>handelbaren</b> Spieler in deinem Verein, im SBC-Lager und in der Transferliste – nicht handelbare und Leihspieler zählen nicht. Bewertet mit Futbin (falls schon geladen), sonst EAs Durchschnittspreis.</div>
          <button class="fcpt-bigbtn" data-act="clubValue">💼 Vereinswert berechnen</button>
          <div class="fcpt-stand" data-el="cvStatus"></div>
          <div data-el="cvRes"></div></div>`;
    }

    async function runClubValue(root) {
      const st = root.querySelector('[data-el="cvStatus"]');
      const box = root.querySelector('[data-el="cvRes"]');
      const btn = root.querySelector('[data-act="clubValue"]');
      btn.disabled = true;
      try {
        const c = await SBCUI.loadClub((m) => { st.textContent = m; }, false);
        const seen = new Set();
        const rows = [];
        for (const p of c.players) {
          if (p.untradeable || p.loans > 0 || seen.has(p.id)) continue;
          seen.add(p.id);
          const ent = c.ents.get(p.id);
          const resId = ent && (ent.resourceId || ent.definitionId);
          const fb = resId != null ? cacheGet(`futbin:${settings.platform}:${resId}`) : null;
          const raw = SBCUI.CAP.raw.get(p.id) || {};
          const val = fb || raw.marketAverage || null;
          rows.push({ name: p.name, rating: p.rating, where: 'Verein', value: val || p.value, src: fb ? 'Futbin' : raw.marketAverage ? 'EA' : 'Schätzung' });
        }
        // Transferliste (nicht verkaufte Karten) – wird bei Bedarf automatisch geladen
        if (!items || !items.length) {
          try {
            st.textContent = 'Lade Transferliste …';
            items = (await loadTransferList()).map((raw) => { const x = mapItem(raw); if (x) x.__raw = raw; return x; }).filter(Boolean);
          } catch (e) { log('Vereinswert: Transferliste', e); }
        }
        let tlCount = 0;
        for (const it of items || []) {
          if (!it.isPlayer || it.sold || seen.has(it.itemId)) continue;
          seen.add(it.itemId);
          const fb = cacheGet(`futbin:${settings.platform}:${it.resourceId}`);
          const raw = SBCUI.CAP.raw.get(it.itemId) || {};
          const val = fb || raw.marketAverage;
          if (!val) continue;
          rows.push({ name: it.name, rating: it.rating, where: 'Transferliste', value: val, src: fb ? 'Futbin' : 'EA' });
          tlCount++;
        }
        const total = rows.reduce((a, r) => a + (r.value || 0), 0);
        const net = rows.reduce((a, r) => a + afterTax(r.value || 0), 0);
        const coins = SBCUI.userCoins();
        const bySrc = (k) => rows.filter((r) => r.src === k).length;
        const bands = [[90, 99, '90+'], [85, 89, '85–89'], [80, 84, '80–84'], [75, 79, '75–79'], [0, 74, 'unter 75']].map(([lo, hi, l]) => {
          const b = rows.filter((r) => r.rating >= lo && r.rating <= hi);
          return { l, n: b.length, v: b.reduce((a, r) => a + r.value, 0) };
        }).filter((b) => b.n);
        const top = [...rows].sort((a, b) => b.value - a.value).slice(0, 10);
        const maxBand = Math.max(1, ...bands.map((b) => b.v));
        box.innerHTML = `
          <div class="fcpt-overview" style="margin-top:4px">
            <div><div class="l">Marktwert (${rows.length} Karten)</div><div class="v">${fmt(Math.round(total))}</div></div>
            <div><div class="l">Nach 5 % Steuer</div><div class="v fcpt-pos-v">${fmt(Math.round(net))}</div></div>
            <div><div class="l">+ Münzen = Gesamt</div><div class="v">${coins != null ? fmt(Math.round(net + coins)) : '–'}</div></div>
          </div>
          <div class="cv-bands">${bands.map((b) => `<div class="cv-band"><span>${b.l}</span><div class="cv-bar"><i style="width:${Math.max(2, Math.round(b.v / maxBand * 100))}%"></i></div><b>${fmt(Math.round(b.v))}</b><small>${b.n}×</small></div>`).join('')}</div>
          <div class="fcpt-mini"><div class="h">Wertvollste handelbare Karten</div>${top.map((r) => `<div class="r"><span>${esc(r.rating)} ${esc(r.name)}${r.where === 'Transferliste' ? ' <span class="fcpt-muted">(TL)</span>' : ''}</span><b>${fmt(Math.round(r.value))} <small class="fcpt-muted">${r.src}</small></b></div>`).join('')}</div>
          <div class="fcpt-stand">Davon ${tlCount} Karten aus der Transferliste · Preisquellen: ${bySrc('Futbin')}× Futbin · ${bySrc('EA')}× EA-Durchschnitt · ${bySrc('Schätzung')}× geschätzt${coins != null ? ` · Münzen: ${fmt(coins)}` : ''}</div>`;
        st.textContent = `Stand: ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · Verein wird 10 Min. zwischengespeichert.`;
      } catch (e) {
        st.textContent = 'Fehler: ' + e.message;
      } finally { btn.disabled = false; }
    }

    function mount(root) {
      root.innerHTML = clubValueHtml() + '<div data-el="watch"></div>' + html();
      WATCH.mount(root.querySelector('[data-el="watch"]'));
      root.querySelector('[data-act="clubValue"]').addEventListener('click', (e) => { e.stopPropagation(); runClubValue(root); });
      root.querySelectorAll('[data-t]').forEach((i) => {
        i.value = settings[i.dataset.t];
        i.addEventListener('change', () => {
          settings[i.dataset.t] = Math.max(0, parseInt(i.value, 10) || 0); saveSettings();
          renderRows(root.querySelector('[data-el="tradeRes"]'));
        });
      });
      root.querySelector('[data-act="tradeRun"]').addEventListener('click', (e) => { e.stopPropagation(); run(root); });
      renderRows(root.querySelector('[data-el="tradeRes"]'));
    }
    return { mount, analyse };
  })();

