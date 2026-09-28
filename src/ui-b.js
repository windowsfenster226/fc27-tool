  // ==================================================================
  // OBERFLÄCHE „Variante B“: kompakte Symbolleiste rechts, dichte Transferliste,
  // Übersicht mit Alarmen. Baut das vorhandene Panel um (alle Funktionen bleiben).
  // ==================================================================
  // eslint-disable-next-line no-var
  var UIB = (() => {
    if (settings.uiMini === undefined) settings.uiMini = false;
    const I = {
      home: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
      list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
      market: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
      club: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
      hist: '<path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-6"/>',
      sbc: '<path d="M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3z"/>',
      gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
      collapse: '<path d="M9 6l6 6-6 6"/>',
      expand: '<path d="M15 6l-6 6 6 6"/>',
      refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
      reload: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
      close: '<path d="M6 6l12 12M18 6L6 18"/>',
      star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
      target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>',
      sand: '<path d="M6 2h12M6 22h12M7 2c0 6 10 6 10 10S7 16 7 22M17 2c0 6-10 6-10 10"/>',
      check: '<path d="M5 12l5 5 9-10"/>',
      chev: '<path d="M9 6l6 6-6 6"/>',
    };
    const svg = (k, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg>`;

    try {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap';
      document.head.appendChild(l);
    } catch (e) { /* ohne Webfonts */ }

    GM_addStyle(`
      #fcpt-panel{--bg:#0b0f17;--bg2:#121826;--bg3:#182033;--line:#1f2940;--ink:#e9edf5;--ink2:#a3aec2;--ink3:#7c889e;--gold:#f2c14e;--pos:#3dd68c;--neg:#ff6b6b;--warn:#ffae5c;--blue:#5b9cff;
        width:480px;flex-direction:row !important;font-family:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif;border-left:1px solid var(--line);box-shadow:-24px 0 60px rgba(0,0,0,.45)}
      #fcpt-panel:not(.open){display:none !important}
      #fcpt-panel button svg,#fcpt-panel a svg{pointer-events:none}
      #fcpt-panel .num,#fcpt-panel .fcpt-profit,#fcpt-panel .c-stats b,#fcpt-panel .fcpt-overview .v{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
      .fcpt-body{flex:1;min-width:0;display:flex;flex-direction:column;border-right:1px solid #1a2236}
      .fcpt-rail{width:64px;flex:none;display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 0;background:#0e131e}
      .fcpt-rail .lg{width:40px;height:40px;border-radius:11px;background:var(--gold);color:#15120a;display:flex;align-items:center;justify-content:center;font:700 15px 'IBM Plex Sans',system-ui,sans-serif;margin-bottom:10px;letter-spacing:.02em}
      .fcpt-rail button{width:48px;height:48px;border-radius:12px;border:0;background:transparent;color:#8b96ab;display:flex;align-items:center;justify-content:center;position:relative;cursor:pointer;padding:0;transition:background .12s,color .12s}
      .fcpt-rail button:hover{background:#151c2b;color:var(--ink)}
      .fcpt-rail button.on{background:#1b2336;color:var(--gold)}
      .fcpt-rail button .bd{position:absolute;top:6px;right:5px;min-width:16px;height:16px;border-radius:8px;background:var(--neg);color:#fff;font:700 10px system-ui,sans-serif;display:none;align-items:center;justify-content:center;padding:0 4px;box-sizing:border-box;pointer-events:none}
      .fcpt-rail button .bd.show{display:flex}
      .fcpt-rail button .tip{position:absolute;right:56px;top:50%;transform:translateY(-50%);background:#0f1420;border:1px solid #243049;color:var(--ink);font:500 12px system-ui,sans-serif;padding:4px 8px;border-radius:6px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .12s}
      .fcpt-rail button:hover .tip{opacity:1}
      .fcpt-rail .sp{flex:1}
      #fcpt-panel.mini{width:64px}
      #fcpt-panel.mini .fcpt-body{display:none}
      #fcpt-panel .fcpt-tabs{display:none}
      #fcpt-panel .fcpt-head{background:var(--bg);padding:14px 14px 10px;gap:8px;border-bottom:1px solid #161d2c}
      #fcpt-panel .fcpt-logo{display:none}
      #fcpt-panel .fcpt-brand .t{font-size:17px;font-weight:600;letter-spacing:0}
      #fcpt-panel .fcpt-icons .ic{width:34px;height:34px;border-radius:9px;background:#151c2b;border:1px solid #243049;color:var(--ink2)}
      #fcpt-panel .fcpt-icons .ic:hover{color:var(--gold);border-color:#3a4a6a}
      #fcpt-panel .fcpt-ver{background:#1f2940;color:var(--ink2);font-weight:600}
      .fcpt-qs{display:flex;gap:14px;font-size:12px;color:var(--ink3);flex-wrap:wrap}
      .fcpt-qs b{color:var(--ink);font-weight:600}.fcpt-qs .p{color:var(--pos)}
      .fcpt-qs .dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;vertical-align:1px}
      #fcpt-panel .fcpt-overview{gap:6px}
      #fcpt-panel .fcpt-overview>div{background:var(--bg2);border-color:var(--line);padding:6px 9px;border-radius:9px}
      #fcpt-panel .fcpt-overview .v{font-size:14px}
      #fcpt-panel .fcpt-list{padding:0 0 90px;gap:0}
      .tr-h,.tr-row{display:grid;grid-template-columns:30px minmax(0,1fr) 70px 70px 66px;gap:8px;align-items:center;padding:0 14px}
      .tr-h{font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3);padding-top:10px;padding-bottom:6px;border-bottom:1px solid #161d2c;position:sticky;top:0;background:var(--bg);z-index:1}
      .tr-h span:nth-child(n+3),.tr-row .r{text-align:right}
      .tr{border-bottom:1px solid #161d2c}
      .tr-row{width:100%;min-height:40px;background:transparent;border:0;color:var(--ink);font:13px 'IBM Plex Sans',system-ui,sans-serif;cursor:pointer;text-align:left}
      .tr-row:hover{background:#111726}
      .tr.open>.tr-row{background:#131a29}
      .tr .ovr{color:var(--gold);font-weight:600}
      .tr .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tr .st{font-style:normal;font-size:11.5px;margin-left:6px;color:var(--ink3)}
      .tr.sold .st{color:var(--pos)}.tr.expired .st{color:var(--warn)}.tr.active .st{color:#7fb0ff}
      .tr.lieg>.tr-row{background:rgba(255,174,92,.06)}
      .tr .mk{color:var(--ink2)}
      .tr-det{display:none;padding:0 10px 10px}
      .tr.open>.tr-det{display:block}
      .tr-det .fcpt-card{border:1px solid var(--line);border-left-width:1px;background:var(--bg2);border-radius:12px}
      .tr-det .c-top{display:none}
      .tr-det .c-stats{margin-top:0}
      .fcpt-home{display:none;overflow:auto;padding:12px 14px 90px;flex:1;flex-direction:column;gap:12px}
      #fcpt-panel.v-home .fcpt-home{display:flex}
      #fcpt-panel.v-home .fcpt-list,#fcpt-panel.v-home .fcpt-trade,#fcpt-panel.v-home .fcpt-settings,#fcpt-panel.v-home .fcpt-sum,#fcpt-panel.v-home .fcpt-toolbar{display:none !important}
      #fcpt-panel.v-trade .fcpt-subtabs{display:none}
      #fcpt-panel[data-sub="verein"] .fcpt-subpane[data-pane="futter"]{display:block !important}
      .h-kpi{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .h-kpi>div{background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:3px}
      .h-kpi .l{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}
      .h-kpi .v{font-size:19px;font-weight:600}
      .h-kpi .s{font-size:11.5px;color:var(--ink3)}
      .h-sec{display:flex;justify-content:space-between;align-items:center;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}
      .h-al{background:var(--bg2);border:1px solid var(--line);border-radius:12px;display:flex;flex-direction:column;overflow:hidden}
      .h-al button{display:flex;align-items:center;gap:12px;padding:10px 12px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--ink);text-align:left;cursor:pointer;font:inherit}
      .h-al button:last-child{border-bottom:0}
      .h-al button:hover{background:#151c2b}
      .h-al .ic{width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex:none}
      .h-al .ic.g{background:rgba(242,193,78,.14);color:var(--gold)}.h-al .ic.p{background:rgba(61,214,140,.14);color:var(--pos)}.h-al .ic.o{background:rgba(255,174,92,.14);color:var(--warn)}
      .h-al .tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
      .h-al .tx b{font-size:13.5px;font-weight:600}.h-al .tx span{font-size:12px;color:var(--ink2)}
      .h-al .cv{color:var(--ink3)}
      .h-empty{font-size:12.5px;color:var(--ink3);padding:12px;background:var(--bg2);border:1px dashed var(--line);border-radius:12px}
      .h-btns{display:flex;gap:8px}
      .h-btns button{flex:1;height:42px;border-radius:10px;border:1px solid #2a3652;background:var(--bg3);color:var(--ink);font:600 13.5px 'IBM Plex Sans',system-ui,sans-serif;cursor:pointer}
      .h-btns button.pri{background:var(--gold);border-color:var(--gold);color:#15120a}
      #fcpt-panel .fcpt-bigbtn{background:var(--gold);color:#15120a;border-radius:10px;font-weight:600}
      #fcpt-panel .fcpt-sgroup{border-radius:12px;background:var(--bg2);border-color:var(--line)}
      #fcpt-panel .fcpt-sgroup h4{font-size:10.5px;letter-spacing:.08em;color:var(--ink3)}
      #fcpt-panel .fcpt-overview .l{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3)}
      #fcpt-btn{width:52px;height:52px;padding:0;border-radius:15px;background:#f2c14e;color:#15120a;font:700 16px 'IBM Plex Sans',system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.45)}
      @media (max-width: 700px){
        #fcpt-panel{width:100vw;flex-direction:column !important}
        #fcpt-panel.mini{width:100vw}
        #fcpt-panel.mini .fcpt-body{display:flex}
        .fcpt-body{border-right:0;min-height:0}
        .fcpt-rail{width:100%;flex-direction:row;justify-content:space-around;padding:6px 6px calc(8px + env(safe-area-inset-bottom));gap:0;border-top:1px solid #1c2538}
        .fcpt-rail .lg,.fcpt-rail .sp,.fcpt-rail [data-rail="mini"],.fcpt-rail button .tip{display:none}
        .tr-h,.tr-row{grid-template-columns:28px minmax(0,1fr) 62px 62px 58px;gap:6px;padding:0 10px}
        #fcpt-btn{width:48px;height:48px;right:12px;bottom:88px}
      }
    `);

    // ---------- Panel umbauen ----------
    const body = document.createElement('div');
    body.className = 'fcpt-body';
    while (panel.firstChild) body.appendChild(panel.firstChild);
    const home = document.createElement('div');
    home.className = 'fcpt-home';
    body.appendChild(home);
    const rail = document.createElement('nav');
    rail.className = 'fcpt-rail';
    rail.setAttribute('aria-label', 'Bereiche');
    const R = [
      ['home', 'home', 'Übersicht'], ['list', 'list', 'Transferliste'], ['trade:markt', 'market', 'Markt & Prognose'],
      ['trade:verein', 'club', 'Verein & Futter'], ['hist', 'hist', 'Historie & Statistik'], ['sbc', 'sbc', 'SBC-Solver'],
    ];
    rail.innerHTML = `<div class="lg" aria-hidden="true">FC</div>` +
      R.map(([k, ic, t]) => `<button data-rail="${k}" aria-label="${t}">${svg(ic)}<span class="bd"></span><span class="tip">${t}</span></button>`).join('') +
      `<div class="sp"></div>
       <button data-rail="settings" aria-label="Einstellungen">${svg('gear')}<span class="tip">Einstellungen</span></button>
       <button data-rail="mini" aria-label="Einklappen">${svg('collapse')}<span class="tip">Einklappen</span></button>`;
    panel.appendChild(body);
    panel.appendChild(rail);
    btn.textContent = 'FC';
    btn.setAttribute('aria-label', 'FC27 Tool öffnen');

    // Kopfzeile: Symbole statt Zeichen, Titel je Bereich, Kurzinfo-Zeile
    const icMap = { refresh: ['refresh', 'Transferliste neu laden'], reload: ['reload', 'Alle Preise frisch von Futbin holen'], close: ['close', 'Schließen'] };
    panel.querySelectorAll('.fcpt-icons .ic').forEach((b) => { const m = icMap[b.dataset.act]; if (m) { b.innerHTML = svg(m[0], 17); b.setAttribute('aria-label', m[1]); } });
    const tEl = panel.querySelector('.fcpt-brand .t');
    const verEl = tEl && tEl.querySelector('.fcpt-ver');
    if (tEl) { tEl.innerHTML = '<span class="fcpt-vtitle">Transferliste</span> '; if (verEl) tEl.appendChild(verEl); }
    const qs = document.createElement('div');
    qs.className = 'fcpt-qs';
    const head = panel.querySelector('.fcpt-head');
    head.insertBefore(qs, head.querySelector('.fcpt-tabs'));
    const TITLES = { home: 'Übersicht', list: 'Transferliste', 'trade:markt': 'Markt', 'trade:verein': 'Verein', hist: 'Historie', settings: 'Einstellungen' };

    let cur = 'list';
    function markRail(k) {
      rail.querySelectorAll('[data-rail]').forEach((b) => b.classList.toggle('on', b.dataset.rail === k));
      const vt = panel.querySelector('.fcpt-vtitle');
      if (vt && TITLES[k]) vt.textContent = TITLES[k];
    }
    function setMini(on) {
      settings.uiMini = !!on; saveSettings();
      panel.classList.toggle('mini', settings.uiMini);
      const m = rail.querySelector('[data-rail="mini"]');
      m.innerHTML = svg(settings.uiMini ? 'expand' : 'collapse') + `<span class="tip">${settings.uiMini ? 'Ausklappen' : 'Einklappen'}</span>`;
    }
    const tabBtn = (t) => panel.querySelector(`.fcpt-tabs [data-tab="${t}"]`);

    function go(k) {
      if (k === 'mini') { setMini(!settings.uiMini); return; }
      if (settings.uiMini) setMini(false);
      if (k === 'sbc') {
        const sb = document.getElementById('fcpt-sbcbtn');
        if (sb && sb.classList.contains('show')) sb.click();
        else showToast('Öffne zuerst eine SBC-Aufgabe in der Web App – dann startet der Solver hier.', true);
        return;
      }
      cur = k;
      if (k === 'home') {
        panel.classList.remove('v-settings', 'v-hist', 'v-trade');
        panel.classList.add('v-home');
        view = 'home';
        markRail(k); renderHome();
        return;
      }
      panel.classList.remove('v-home');
      if (k.startsWith('trade:')) {
        const sub = k.split(':')[1];
        settings.tradeSub = sub; saveSettings();
        panel.dataset.sub = sub;
        const tb = tabBtn('trade');
        if (tb) tb.click();
        const sbtn = panel.querySelector(`.fcpt-subtabs [data-sub="${sub}"]`);
        if (sbtn) sbtn.click();
      } else {
        delete panel.dataset.sub;
        const tb = tabBtn(k);
        if (tb) tb.click();
      }
      markRail(k);
    }
    rail.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rail]');
      if (!b) return;
      e.stopPropagation();
      go(b.dataset.rail);
    });

    // ---------- Übersicht ----------
    function alarms() {
      const A = [];
      for (const w of settings.watch || []) {
        if (w.last != null && w.last <= w.target) A.push({ k: 'g', ic: 'star', t: `${w.rating ?? ''} ${w.name} unter deinem Ziel`, s: `Futbin ${fmt(w.last)} · Ziel ${fmt(w.target)}`, go: 'trade:markt' });
      }
      for (const t of settings.sellTargets || []) {
        if (t.last != null && t.last >= t.target) A.push({ k: 'p', ic: 'target', t: `Verkaufsziel erreicht: ${t.name}`, s: `Futbin ${fmt(t.last)} · Ziel ${fmt(t.target)}`, go: 'list' });
      }
      const exp = items.filter((p) => p.expired && p.isPlayer);
      const lieg = exp.filter((p) => expiredCount(p.itemId) >= 2);
      lieg.forEach((p) => { const m = marketPrice(p.resourceId); A.push({ k: 'o', ic: 'sand', t: `${p.name} liegt: ${expiredCount(p.itemId)}× abgelaufen`, s: m ? `Vorschlag neu einstellen: ${fmt(listSuggest(p, m).bin)}` : 'Günstiger neu einstellen', go: 'list' }); });
      if (exp.length > lieg.length) A.push({ k: 'o', ic: 'sand', t: `${exp.length - lieg.length} Karte(n) abgelaufen`, s: 'Neu einstellen – „Futbin-Preis übernehmen“ hilft', go: 'list' });
      const sold = items.filter((p) => p.sold);
      if (sold.length) A.push({ k: 'p', ic: 'check', t: `${sold.length} Karte(n) verkauft`, s: `+${fmt(sold.reduce((a, p) => a + (p.profit || 0), 0))} Profit – in der Web App abholen`, go: 'list' });
      return A;
    }
    function badge() {
      const n = alarms().length;
      const b = rail.querySelector('[data-rail="home"] .bd');
      if (b) { b.textContent = n > 9 ? '9+' : String(n); b.classList.toggle('show', n > 0); }
    }
    function quick() {
      let coins = null;
      try { coins = SBCUI.userCoins(); } catch (e) { /* */ }
      const d0 = new Date(); d0.setHours(0, 0, 0, 0);
      const today = sumSince(d0.getTime()).profit;
      const t = TIMING.info();
      const col = t.cls === 'sell' ? '#ff6b6b' : t.cls === 'buy' ? '#3dd68c' : t.cls === 'warn' ? '#ffae5c' : '#7c889e';
      qs.innerHTML = `${coins != null ? `<span><b class="num">${fmt(coins)}</b> Münzen</span>` : ''}<span>Heute <b class="num ${today >= 0 ? 'p' : ''}">${signed(today)}</b></span><span title="${esc(t.text)}"><i class="dot" style="background:${col}"></i>${esc(t.title)}</span>`;
    }
    function renderHome() {
      quick();
      const d0 = new Date(); d0.setHours(0, 0, 0, 0);
      const wk = sumSince(Date.now() - 7 * 864e5).profit;
      const open = items.filter((p) => !p.sold);
      let listVal = 0, possible = 0;
      for (const p of open) {
        const m = p.isPlayer ? marketPrice(p.resourceId) : null;
        if (m) listVal += m;
        const v = profitValue(p, m);
        if (v != null) possible += v;
      }
      const sold = items.filter((p) => p.sold);
      const soldP = sold.reduce((a, p) => a + (p.profit || 0), 0);
      const A = alarms();
      home.innerHTML = `
        ${TIMING.html()}
        <div class="h-kpi">
          <div><span class="l">Transferliste</span><span class="v num">${listVal ? fmt(listVal) : '–'}</span><span class="s">${open.length} offene Karten · Marktwert</span></div>
          <div><span class="l">Profit bei Verkauf</span><span class="v num ${possible >= 0 ? 'fcpt-pos-v' : 'fcpt-neg-v'}">${items.length ? signed(possible) : '–'}</span><span class="s">nach 5 % Steuer</span></div>
          <div><span class="l">Verkauft</span><span class="v num fcpt-pos-v">${sold.length ? signed(soldP) : '–'}</span><span class="s">${sold.length} Karten</span></div>
          <div><span class="l">7 Tage</span><span class="v num ${wk >= 0 ? 'fcpt-pos-v' : 'fcpt-neg-v'}">${signed(wk)}</span><span class="s">Profit laut Historie</span></div>
        </div>
        <div class="h-sec"><span>Alarme</span><span>${A.length}</span></div>
        ${A.length ? `<div class="h-al">${A.map((a, i) => `<button data-al="${i}"><span class="ic ${a.k}">${svg(a.ic, 16)}</span><span class="tx"><b>${esc(a.t)}</b><span>${esc(a.s)}</span></span><span class="cv">${svg('chev', 16)}</span></button>`).join('')}</div>`
          : `<div class="h-empty">${items.length ? 'Keine Alarme. Watchlist und Verkaufsziele findest du unter Markt und in der Transferliste.' : 'Noch keine Daten – lade deine Transferliste.'}</div>`}
        <div class="h-btns"><button class="pri" data-act="refresh">Transferliste laden</button><button data-act="reload">Preise neu holen</button></div>`;
      home.querySelectorAll('[data-al]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); go(A[+b.dataset.al].go); }));
      badge();
    }

    // ---------- Dichte Transferliste ----------
    const openRows = new Set();
    function rowCells(p) {
      const m = p.isPlayer ? marketPrice(p.resourceId) : null;
      const v = profitValue(p, m);
      return {
        mk: p.isPlayer ? (m ? fmt(m) : '…') : '–',
        pf: v == null ? '<span class="fcpt-muted">–</span>' : `<span class="${profitCls(v)}">${signed(v)}</span>`,
      };
    }
    function rowHtml(p) {
      const cls = p.sold ? 'sold' : p.expired ? 'expired' : p.active ? 'active' : '';
      const n = p.expired ? expiredCount(p.itemId) : 0;
      const st = p.sold ? 'verkauft' : p.expired ? (n >= 2 ? `${n}× abgel.` : 'abgelaufen') : p.active ? fmtTime(p.expires) : 'offen';
      const key = String(p.itemId ?? p.resourceId);
      const c = rowCells(p);
      return `<div class="tr ${cls}${n >= 2 ? ' lieg' : ''}${openRows.has(key) ? ' open' : ''}" data-row="${esc(key)}" data-rid="${p.resourceId}">
        <button class="tr-row" data-trow="${esc(key)}" aria-expanded="${openRows.has(key)}">
          <span class="num ovr">${esc(p.rating ?? '')}</span>
          <span class="nm">${esc(p.name)}<em class="st">${esc(st)}</em></span>
          <span class="num r">${fmt(p.sold ? p.soldFor : p.buyNow)}</span>
          <span class="num r mk" data-mk>${c.mk}</span>
          <span class="num r" data-pf>${c.pf}</span>
        </button>
        <div class="tr-det">${cardHtml(p)}</div>
      </div>`;
    }
    const headHtml = () => '<div class="tr-h"><span>OVR</span><span>Spieler</span><span>Sofortk.</span><span>Markt</span><span>Profit</span></div>';
    function updateRow(rid) {
      panel.querySelectorAll(`.tr[data-rid="${rid}"]`).forEach((r) => {
        const p = items.find((x) => String(x.itemId ?? x.resourceId) === r.dataset.row);
        if (!p) return;
        const c = rowCells(p);
        const mk = r.querySelector('[data-mk]'), pf = r.querySelector('[data-pf]');
        if (mk) mk.textContent = c.mk;
        if (pf) pf.innerHTML = c.pf;
      });
    }
    panel.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-trow]');
      if (!b) return;
      const r = b.parentElement, k = b.dataset.trow;
      const on = !r.classList.contains('open');
      r.classList.toggle('open', on);
      b.setAttribute('aria-expanded', String(on));
      if (on) openRows.add(k); else openRows.delete(k);
    });

    let aT = null;
    function after() { clearTimeout(aT); aT = setTimeout(() => { quick(); badge(); if (cur === 'home') renderHome(); }, 250); }
    // Tabs, die vom alten Code umgeschaltet werden, im Menü nachziehen
    panel.addEventListener('click', (e) => {
      const t = e.target.dataset && e.target.dataset.tab;
      if (t && !e.target.closest('.fcpt-rail') && t !== 'trade') { cur = t; markRail(t); }
    });
    btn.addEventListener('click', () => { if (panel.classList.contains('open')) { quick(); badge(); if (cur === 'home') renderHome(); } });
    setInterval(() => { if (panel.classList.contains('open')) { quick(); badge(); } }, 30000);

    // Schwebende Knöpfe ausblenden, solange das Panel offen ist (sie lagen über der Leiste)
    const syncBtns = () => {
      const o = panel.classList.contains('open');
      btn.style.display = o ? 'none' : '';
      const sb = document.getElementById('fcpt-sbcbtn');
      if (sb) sb.style.visibility = o ? 'hidden' : '';
    };
    new MutationObserver(syncBtns).observe(panel, { attributes: true, attributeFilter: ['class'] });
    setMini(settings.uiMini);
    markRail('list');
    quick();
    return { rowHtml, headHtml, updateRow, after, go, renderHome };
  })();
