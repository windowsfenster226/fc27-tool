  // ==================================================================
  // OBERFLÄCHE „Variante B“: kompakte Symbolleiste rechts, dichte Transferliste,
  // Übersicht mit Alarmen. Baut das vorhandene Panel um (alle Funktionen bleiben).
  // ==================================================================
  // eslint-disable-next-line no-var
  var UIB = (() => {
    if (settings.uiMini === undefined) settings.uiMini = false;
    if (settings.iosBottom === undefined) settings.iosBottom = 80;   // Platz für Safaris untere Leiste (iPhone)
    const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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
      buy: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/><path d="M11 8v6M8 11h6"/>',
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
      @media (hover:hover){.fcpt-rail button:hover{background:#151c2b;color:var(--ink)}}
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
      .tr .st.fx{color:var(--gold)}
      .tr.lieg>.tr-row{background:rgba(255,174,92,.06)}
      .tr .mk{color:var(--ink2)}
      .tr-det{display:none;padding:0 10px 10px}
      .tr.open>.tr-det{display:block}
      .tr-det .fcpt-card{border:1px solid var(--line);border-left-width:1px;background:var(--bg2);border-radius:12px}
      .tr-det .c-top{display:none}
      .tr-det .c-stats{margin-top:0}
      .fcpt-open #fcpt-bidbar{display:none !important}
      .fcpt-buy{display:none;overflow:auto;flex:1;flex-direction:column;gap:10px;padding:12px 14px 0}
      #fcpt-panel.v-buy .fcpt-buy{display:flex}
      #fcpt-panel.v-buy .fcpt-list,#fcpt-panel.v-buy .fcpt-trade,#fcpt-panel.v-buy .fcpt-settings,#fcpt-panel.v-buy .fcpt-sum,#fcpt-panel.v-buy .fcpt-toolbar,#fcpt-panel.v-buy .fcpt-home{display:none !important}
      .by-top{display:flex;justify-content:space-between;align-items:center}
      .by-g{font:700 12px system-ui,sans-serif;padding:5px 10px;border-radius:14px;background:#10342a;color:#34d399}
      .by-g.yellow{background:#3a2a12;color:#fb923c}.by-g.red{background:#3b1518;color:#f87171}
      .by-coins{font-size:13px;color:var(--ink2);font-variant-numeric:tabular-nums}
      .by-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.by-h b{font-size:16px}.by-h span{font-size:12px;color:var(--ink2)}
      .by-list{display:flex;flex-direction:column;gap:8px}
      .by-r{display:flex;align-items:center;gap:10px;background:#151c2e;border:1px solid #263049;border-radius:14px;padding:10px;font-variant-numeric:tabular-nums}
      .by-r.best{border-color:var(--gold)}.by-r.won{opacity:.7}
      .by-c{width:40px;height:48px;border-radius:9px;background:#3b3115;color:var(--gold);display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none}
      .by-c b{font-size:16px}.by-c small{font-size:10px;font-weight:700}
      .by-n{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.by-n .nm{font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .by-n small{font-size:11px;color:var(--ink2)}.by-n small.pos{color:#34d399}.by-n small.neg{color:#f87171}
      .by-best{font-size:10px;font-weight:800;color:#15120a;background:var(--gold);padding:1px 6px;border-radius:8px;vertical-align:middle}
      .by-a{display:flex;flex-direction:column;gap:6px;flex:none}
      .by-a button{min-width:104px;min-height:44px;border-radius:12px;border:1px solid #2b3654;background:#0f1526;color:var(--ink);font:600 12px system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:4px 8px;cursor:pointer}
      .by-a button b{font-size:15px}.by-a button small{font-size:11px;font-weight:700}.by-a small.pos{color:#34d399}.by-a small.neg{color:#f87171}
      .by-a button.b{background:var(--gold);color:#15120a;border-color:var(--gold)}.by-a button.b small.pos{color:#0b5d3b}.by-a button.b small.neg{color:#8a1c1c}
      .by-a button.arm{background:#f97316;border-color:#f97316;color:#fff;animation:fcptArm 1s infinite}.by-a button.arm small{color:#fff !important}
      .by-a button.no{opacity:.6}
      .by-note,.by-empty{font-size:12px;color:var(--ink2);line-height:1.45}.by-empty{padding:18px 4px;text-align:center;font-size:14px}
      .by-bar{position:sticky;bottom:0;margin:auto -14px 0;padding:10px 14px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(transparent,#0b0f18 30%);display:flex;flex-direction:column;align-items:center;gap:8px}
      .by-msg{font-size:13px;color:var(--ink);background:#151c2e;border:1px solid #263049;border-radius:12px;padding:8px 12px;text-align:center}
      .by-go{width:100%;height:60px;border-radius:18px;border:0;background:var(--gold);color:#15120a;font:800 19px system-ui,sans-serif;cursor:pointer}
      .by-go:disabled{opacity:.6}
      @keyframes fcptArm{50%{filter:brightness(1.25)}}
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
      .ev{border:1px solid var(--line,#334);border-radius:10px;margin:6px 0;overflow:hidden}.ev-h{display:flex;justify-content:space-between;gap:8px;padding:8px 10px;cursor:pointer}.ev-h small{color:var(--ink2)}.ev.open .ev-h{background:rgba(255,255,255,.04)}.ev-b{padding:6px 10px 10px}.ev-req,.ev-ups{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 8px}.ev-req span,.ev-ups span{font-size:11px;padding:2px 6px;border-radius:6px;background:rgba(255,255,255,.06)}.ev-ups span{color:#4ade80}.rl-box{display:flex;flex-direction:column;gap:4px;width:100%}.rl-r{display:flex;justify-content:space-between;gap:8px;font-size:12px}.rl-r small{color:var(--ink2)}.fcpt-listall button.rl{background:transparent;border:1px solid var(--line,#445);color:inherit}.tr-cons{margin:6px 0;font-size:12px;color:var(--ink2)}.tr-cons button{margin-left:6px;padding:4px 8px;border-radius:8px;border:1px solid var(--line,#334);background:transparent;color:inherit}.tr-fix{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:8px;padding:8px 10px;border-radius:10px;background:#0f1420;border:1px solid var(--line)}
      .tr-fix .lb{font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3)}
      .tr-fix input{width:96px;background:var(--bg3);color:var(--ink);border:1px solid #2a3652;border-radius:8px;padding:6px 8px;font:13px 'JetBrains Mono',ui-monospace,monospace;text-align:right}
      .tr-fix button{height:32px;padding:0 10px;border-radius:8px;border:1px solid #2a3652;background:var(--bg3);color:var(--ink);font:600 12.5px 'IBM Plex Sans',system-ui,sans-serif;cursor:pointer}
      .tr-fix small{flex-basis:100%;font-size:11.5px;color:var(--ink3)}
      .fcpt-toolbar{flex-wrap:wrap}
      .fcpt-listall{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      .fcpt-listall button{height:34px;padding:0 12px;border-radius:9px;border:1px solid #2a3652;background:var(--bg3);color:var(--ink);font:600 12.5px 'IBM Plex Sans',system-ui,sans-serif;cursor:pointer}
      .fcpt-listall select{max-width:220px;height:34px}
      .tr-fix button.go{background:var(--gold);border-color:var(--gold);color:#15120a}
      .fcpt-listall button.go{background:var(--gold);border-color:var(--gold);color:#15120a}
      .fcpt-listall button.stop{background:#3a1515;border-color:#7f1d1d;color:#fecaca}
      .fcpt-listall button[disabled]{opacity:.45;cursor:default}
      .fcpt-listall .st{font-size:12px;color:var(--ink2)}
      #fcpt-sbc .pts-in-sbc{--bg2:#121826;--bg3:#182033;--line:#1f2940;--ink:#e9edf5;--ink2:#a3aec2;--ink3:#7c889e;--gold:#f2c14e;margin-bottom:10px}
      #fcpt-sbc .pts-in-sbc .fcpt-sgroup{background:var(--bg2);border:1px solid var(--line);border-radius:12px}
      #fcpt-sbc .pts-in-sbc input[type=number]{width:96px;background:var(--bg3);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px 8px;font:inherit;text-align:right}
      #fcpt-sbc .pts-in-sbc .fcpt-bigbtn{width:100%;background:var(--gold);color:#15120a;border:0;border-radius:10px;padding:10px 12px;font-weight:700;cursor:pointer}
      .pt-det>summary{cursor:pointer;list-style:none}.pt-det>summary::-webkit-details-marker{display:none}
      .pt-det:not([open])>summary::after{content:' ▸ aufklappen';font-size:11px;color:var(--ink3,#7c889e)}
      .pt-det[open]{display:flex;flex-direction:column;gap:10px}
      /* Schwebende Knöpfe an den rechten Rand (Mitte) – sie lagen über EAs „Einreichen“-Knöpfen */
      #fcpt-btn{right:0 !important;left:auto !important;bottom:auto !important;top:calc(50% - 60px) !important;width:46px !important;height:52px !important;border-radius:14px 0 0 14px !important;font-size:15px !important}
      #fcpt-sbcbtn{right:0 !important;left:auto !important;bottom:auto !important;top:calc(50% + 2px) !important;border-radius:14px 0 0 14px !important;padding:10px 8px !important;font-size:12px !important;line-height:1.15;max-width:52px;white-space:normal;text-align:center}
      .ni-sum{display:flex;flex-wrap:wrap;gap:6px}.ni-sum span{font-size:12px;padding:3px 8px;border-radius:999px;background:var(--bg3,#182033);color:var(--ink2,#a3aec2)}
      .ni-list{display:flex;flex-direction:column;max-height:360px;overflow:auto;border:1px solid var(--line,#1f2940);border-radius:10px}
      .ni-r{display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--line,#1f2940)}
      .ni-r:last-child{border-bottom:0}
      .ni-n{flex:1;min-width:0;font-size:13px}.ni-n small{display:block;font-size:11.5px;color:var(--ink3,#7c889e)}
      .ni-n em{font-style:normal;font-size:10.5px;color:#86efac;margin-left:3px}.ni-n em.d{color:#fde68a}
      .ni-r select{max-width:140px;font-size:12.5px}
      .so-v{border:1px solid var(--line,#1f2940);border-radius:10px;overflow:hidden}
      .so-h{display:flex;justify-content:space-between;gap:8px;padding:7px 10px;background:var(--bg3,#182033);font-size:12.5px}
      .so-r{display:flex;align-items:center;gap:8px;padding:5px 10px;border-top:1px solid var(--line,#1f2940);font-size:13px}
      .so-p{width:34px;font-size:11px;color:var(--ink3,#7c889e)}.so-n{flex:1;min-width:0}.so-n em{font-style:normal;font-size:10.5px;color:#86efac;margin-left:3px}
      #fcpt-panel .ch{display:inline-block;min-width:20px;text-align:center;border-radius:5px;font:600 11.5px 'JetBrains Mono',monospace;padding:1px 4px;background:#3a1515;color:#fecaca}
      #fcpt-panel .ch1,#fcpt-panel .ch2{background:#3a2a0e;color:#fde68a}#fcpt-panel .ch3{background:#10301f;color:#86efac}
      .tg-no{font-size:11.5px;color:var(--ink3,#7c889e);white-space:nowrap}
      .ni-r.tg-outbid{background:rgba(255,107,107,.06)}.ni-n .trel{margin-left:4px}
      .fav-b{border:0;background:transparent;cursor:pointer;font-size:15px;padding:0 4px;line-height:1;color:#7c889e;vertical-align:middle}
      .fav-b.on{color:#f2c14e}
      .gd{display:flex;flex-direction:column;gap:2px;padding:9px 11px;border-radius:10px;font-size:12.5px;background:rgba(61,214,140,.08);border:1px solid rgba(61,214,140,.3)}
      .gd span{color:var(--ink2,#a3aec2)}.gd.warn{background:rgba(255,174,92,.08);border-color:rgba(255,174,92,.35)}.gd.red{background:rgba(255,107,107,.1);border-color:rgba(255,107,107,.4)}
      .pt-confirm{display:flex;flex-direction:column;gap:6px;padding:10px;border-radius:10px;background:rgba(255,107,107,.08);border:1px solid rgba(255,107,107,.35);font-size:12.5px}
      .pt-confirm span{color:var(--ink2,#a3aec2)}.pt-confirm .btns2{display:flex;gap:8px}
      .fcpt-smallbtn.go{background:var(--gold,#f2c14e);color:#15120a;border-color:var(--gold,#f2c14e)}
      .pt-res{display:flex;flex-direction:column;gap:6px;margin-top:4px}
      .pt-sum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
      .pt-sum>div{background:var(--bg3,#182033);border-radius:9px;padding:6px 9px;display:flex;flex-direction:column;gap:2px}
      .pt-sum span{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3,#7c889e)}
      .pt-sum b{font:600 14px 'JetBrains Mono',ui-monospace,monospace}
      .pt-h{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3,#7c889e);margin-top:6px}
      .pt-r{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;padding:3px 0;border-bottom:1px dashed rgba(255,255,255,.07)}
      .pt-r span:last-child{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:var(--ink2,#a3aec2);white-space:nowrap}
      .pt-r em{font-style:normal;font-size:10.5px;color:#86efac;margin-left:3px}
      .pt-list{max-height:260px;overflow:auto}
      .pt-note{font-size:11.5px;color:var(--ink3,#7c889e);line-height:1.4}
      #fcpt-btn{width:52px;height:52px;padding:0;border-radius:15px;background:#f2c14e;color:#15120a;font:700 16px 'IBM Plex Sans',system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.45)}
      @media (max-width: 700px){
        #fcpt-panel{width:100vw;flex-direction:column !important;height:100vh;height:100dvh}
        #fcpt-panel.fcpt-ios .fcpt-rail{padding-bottom:calc(env(safe-area-inset-bottom, 0px) + var(--fcpt-iosb, 80px))}
        #fcpt-panel.mini{width:100vw}
        #fcpt-panel.mini .fcpt-body{display:flex}
        .fcpt-body{border-right:0;min-height:0}
        .fcpt-rail{width:100%;flex-direction:row;justify-content:space-around;padding:6px 6px calc(8px + env(safe-area-inset-bottom));gap:0;border-top:1px solid #1c2538}
        .fcpt-rail .lg,.fcpt-rail .sp,.fcpt-rail [data-rail="mini"],.fcpt-rail button .tip{display:none}
        .fcpt-rail button{width:44px}
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
    const buyEl = document.createElement('div');
    buyEl.className = 'fcpt-buy';
    body.appendChild(buyEl);
    BUY.mount(buyEl);
    const rail = document.createElement('nav');
    rail.className = 'fcpt-rail';
    rail.setAttribute('aria-label', 'Bereiche');
    const R = [
      ['home', 'home', 'Übersicht'], ['list', 'list', 'Transferliste'], ['buy', 'buy', 'Kaufen & Bieten'], ['trade:markt', 'market', 'Markt & Prognose'],
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
    const TITLES = { buy: 'Kaufen & Bieten', home: 'Übersicht', list: 'Transferliste', 'trade:markt': 'Markt', 'trade:verein': 'Verein', hist: 'Historie', settings: 'Einstellungen' };

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
      panel.classList.remove('v-buy');
      if (k === 'buy') {
        panel.classList.remove('v-settings', 'v-hist', 'v-trade', 'v-home');
        panel.classList.add('v-buy');
        view = 'buy';
        markRail(k); BUY.render();
        return;
      }
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
      const gl = GUARD.level();
      if (gl.level === 'red') A.unshift({ k: 'o', ic: 'sand', t: 'Sperren-Schutz: Pause empfohlen', s: gl.text, go: 'trade:markt' });
      const nNew = NEWITEMS.count();
      if (nNew) A.push({ k: 'g', ic: 'list', t: `${nNew} neue Item(s) unsortiert`, s: 'Mit einem Klick verteilen: Verkaufen, SBC-Lager, Verein', go: 'trade:verein' });
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
      const g = GUARD.level();
      qs.innerHTML = `${coins != null ? `<span><b class="num">${fmt(coins)}</b> Münzen</span>` : ''}${g.s.sMin || g.level !== 'ok' ? `<span title="Sperren-Schutz"><i class="dot" style="background:${g.level === 'red' ? '#ff6b6b' : g.level === 'warn' ? '#ffae5c' : '#3dd68c'}"></i>${g.s.sMin} Suchen/Min</span>` : ''}<span>Heute <b class="num ${today >= 0 ? 'p' : ''}">${signed(today)}</b></span><span title="${esc(t.text)}"><i class="dot" style="background:${col}"></i>${esc(t.title)}</span>`;
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
      const m = p.isPlayer ? marketPrice(p.resourceId) : CONS.price(p);
      const v = profitValue(p, m);
      return {
        mk: m ? fmt(m) : p.isPlayer ? '…' : '–',
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
          <span class="num ovr">${p.isCons ? '🧪' : esc(p.rating ?? '')}</span>
          <span class="nm">${esc(p.name)}<em class="st">${esc(st)}</em>${!p.sold && !p.active && settings.listPresets && settings.listPresets[p.resourceId] ? `<em class="st fx">fest ${fmt(settings.listPresets[p.resourceId].bin)}</em>` : ''}</span>
          <span class="num r">${fmt(p.sold ? p.soldFor : p.buyNow)}</span>
          <span class="num r mk" data-mk>${c.mk}</span>
          <span class="num r" data-pf>${c.pf}</span>
        </button>
        <div class="tr-det">${cardHtml(p)}${LIST.fixHtml(p)}</div>
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
    btn.addEventListener('click', () => {
      if (!panel.classList.contains('open')) return;
      quick(); badge(); if (cur === 'home') renderHome();
      NEWITEMS.peek().then(() => { badge(); if (cur === 'home') renderHome(); });
    });
    setInterval(() => { if (panel.classList.contains('open')) { quick(); badge(); } }, 30000);

    // iPhone: Menüleiste über Safaris untere Leiste heben (Abstand einstellbar)
    const applyIos = () => { panel.classList.toggle('fcpt-ios', isIOS); panel.style.setProperty('--fcpt-iosb', `${settings.iosBottom}px`); };
    applyIos();
    const setG = panel.querySelector('[data-opt="inline"]');
    const grp = setG && setG.closest('.fcpt-sgroup');
    if (grp) {
      const row = document.createElement('div');
      row.className = 'fcpt-set';
      row.innerHTML = '<span>Abstand unten (iPhone)<small>Falls die Menüleiste unten von Safari verdeckt wird: größer machen</small></span><input type="number" min="0" max="200" step="10" data-uib="iosb">';
      grp.appendChild(row);
      const inp = row.querySelector('input');
      inp.value = settings.iosBottom;
      inp.addEventListener('change', (e) => { e.stopPropagation(); settings.iosBottom = Math.max(0, Math.min(200, parseInt(inp.value, 10) || 0)); saveSettings(); applyIos(); });
    }

    // Schwebende Knöpfe ausblenden, solange das Panel offen ist (sie lagen über der Leiste)
    const syncBtns = () => {
      const o = panel.classList.contains('open');
      btn.style.display = o ? 'none' : '';
      document.documentElement.classList.toggle('fcpt-open', o);
      const sb = document.getElementById('fcpt-sbcbtn');
      if (sb) sb.style.visibility = o ? 'hidden' : '';
    };
    new MutationObserver(syncBtns).observe(panel, { attributes: true, attributeFilter: ['class'] });
    setMini(settings.uiMini);
    markRail('list');
    quick();
    // ---------- Festpreise + „Alle einstellen“ (ein Klick von dir, dann nacheinander) ----------
    const LIST = (() => {
      if (!settings.listPresets || typeof settings.listPresets !== 'object') settings.listPresets = {};
      if (settings.listDuration === undefined) settings.listDuration = 3600;
      if (settings.listFallback === undefined) settings.listFallback = false;
      if (settings.listAllowLoss === undefined) settings.listAllowLoss = false;
      // Festpreis unter „ohne Verlust“: 'be' = zum Ohne-Verlust-Preis einstellen, 'skip' = überspringen, 'allow' = trotzdem Festpreis
      if (settings.listLossMode === undefined) settings.listLossMode = settings.listAllowLoss ? 'allow' : 'be';
      if (settings.relistMode === undefined) settings.relistMode = 'market';   // 'market' | 'cut' | 'same'
      if (settings.relistCut === undefined) settings.relistCut = 1;            // Preisstufen günstiger
      if (settings.relistFloor === undefined) settings.relistFloor = true;     // nie unter „ohne Verlust“
      if (settings.relistUsePreset === undefined) settings.relistUsePreset = true;
      const DUR = [[3600, '1 Std.'], [10800, '3 Std.'], [21600, '6 Std.'], [43200, '12 Std.'], [86400, '1 Tag'], [259200, '3 Tage']];
      let running = false, stop = false, confirmN = 0;
      let group = null;   // resourceId der gewählten Kartenversion (nur gleiche Karten einstellen) oder 'all'
      const preset = (p) => settings.listPresets[p.resourceId] || null;
      function priceFor(p) {
        const ps = preset(p);
        if (ps) return { bin: ps.bin, start: ps.start || lowerStep(ps.bin), src: 'Festpreis' };
        if (!settings.listFallback) return null;
        const m = p.isPlayer ? marketPrice(p.resourceId) : CONS.price(p);
        if (!m) return null;
        const bin = listSuggest(p, m).bin;
        return { bin, start: lowerStep(bin), src: 'Futbin-Vorschlag' };
      }
      // Karten, die gerade eingestellt werden können: in der Transferliste, nicht aktiv, nicht verkauft
      function candidates(only) {
        const out = [], skipped = [];
        for (const p of items) {
          if (p.sold || p.active || !p.__raw) continue;
          if (FAV.has(p.itemId)) continue;   // Favorit -> nicht einstellen
          if (only != null && only !== 'all' && String(p.resourceId) !== String(only)) continue;
          const pr = priceFor(p);
          if (!pr) continue;
          if (p.bought && pr.bin < breakEven(p.bought)) {
            if (settings.listLossMode === 'skip') { skipped.push(p); continue; }
            if (settings.listLossMode === 'be') { const be = breakEven(p.bought); out.push({ p, pr: { bin: be, start: lowerStep(be), src: 'ohne Verlust' }, raised: true }); continue; }
          }
          out.push({ p, pr });
        }
        return { out, skipped };
      }
      // ---------- Abgelaufene neu einstellen (mit Preisanpassung) ----------
      let relistAsk = false;
      const stepsDown = (v, n) => { let x = v; for (let i = 0; i < n; i++) x = Math.max(200, x - stepFor(x - 1)); return x; };
      function relistPrice(p) {
        const old = p.buyNow || null;
        const ps = settings.relistUsePreset ? preset(p) : null;
        let bin = null, src = '';
        if (ps) { bin = ps.bin; src = 'Festpreis'; }
        else if (settings.relistMode === 'market') {
          const m = p.isPlayer ? marketPrice(p.resourceId) : CONS.price(p);
          if (m) { bin = listSuggest(p, m).bin; src = 'Marktpreis'; }
          else if (old) { bin = stepsDown(old, settings.relistCut); src = 'kein Marktpreis → günstiger'; }
        } else if (settings.relistMode === 'cut' && old) { bin = stepsDown(old, settings.relistCut); src = `${settings.relistCut} Stufe(n) günstiger`; }
        else if (old) { bin = old; src = 'gleicher Preis'; }
        if (!bin) return null;
        bin = roundPrice(bin);
        let floored = false;
        if (settings.relistFloor && p.bought && bin < breakEven(p.bought)) { bin = roundPrice(breakEven(p.bought)); if (bin < breakEven(p.bought)) bin += stepFor(bin); floored = true; }
        return { bin, start: lowerStep(bin), src: floored ? 'ohne Verlust' : src, old, floored };
      }
      function relistCandidates() {
        const out = [], none = [];
        for (const p of items) {
          if (!p.expired || p.sold || !p.__raw || FAV.has(p.itemId)) continue;
          const pr = relistPrice(p);
          if (pr) out.push({ p, pr }); else none.push(p);
        }
        return { out, none };
      }

      function fixHtml(p) {
        if (p.sold) return '';
        const ps = preset(p);
        const m = p.isPlayer ? marketPrice(p.resourceId) : CONS.price(p);
        const sug = m ? listSuggest(p, m).bin : null;
        const consNote = !p.isPlayer && !m ? `<div class="tr-cons">${esc(CONS.status() || 'Kein Futbin-Preis gefunden.')} <button data-consload="1">🧪 Futbin-Preise laden</button> <small>Du kannst den Festpreis auch einfach selbst eintippen.</small></div>` : '';
        return `${consNote}<div class="tr-fix"><span class="lb">Festpreis</span>${FAV.btn({ id: p.itemId, name: p.name, rating: p.rating })}
          <input type="number" min="200" step="50" inputmode="numeric" data-fixin="${p.resourceId}" value="${ps ? ps.bin : ''}" placeholder="${sug ? fmt(sug) : 'Sofortkauf'}" aria-label="Festpreis Sofortkauf">
          <button data-fixsave="${p.resourceId}">${ps ? 'Ändern' : 'Festlegen'}</button>
          ${ps ? `<button data-fixdel="${p.resourceId}" aria-label="Festpreis entfernen">✕</button>` : ''}
          ${ps && candidates(p.resourceId).out.length ? `<button data-fixlist="${p.resourceId}" class="go">▶ Alle gleichen einstellen (${candidates(p.resourceId).out.length})</button>` : ''}
          <small>${ps ? `Start ${fmt(ps.start)} · gilt für alle Karten dieser Version` : 'Wird bei „Einstellen“ verwendet'}</small></div>`;
      }
      const bar = document.createElement('div');
      bar.className = 'fcpt-listall';
      const tb = panel.querySelector('.fcpt-toolbar');
      if (tb) tb.appendChild(bar);
      // Gruppen = gleiche Karten (gleiche Spielerversion)
      function groups() {
        const G = new Map();
        for (const c of candidates('all').out) {
          const k = String(c.p.resourceId);
          const ps = preset(c.p);
          const g = G.get(k) || { k, name: c.p.name, rating: c.p.rating, bin: ps ? ps.bin : c.pr.bin, n: 0, raised: 0 };
          g.n++; if (c.raised) g.raised++; G.set(k, g);
        }
        return [...G.values()].sort((a, b) => b.n - a.n || String(a.name).localeCompare(String(b.name), 'de'));
      }
      function drawBar(msg) {
        const G = groups();
        if (group !== 'all' && !G.some((g) => g.k === String(group))) group = G.length ? G[0].k : null;
        const { out, skipped } = candidates(group);
        const gName = group === 'all' ? 'alle Karten mit Festpreis' : (() => { const g = G.find((x) => x.k === String(group)); return g ? `${g.rating ?? ''} ${g.name}` : ''; })();
        if (running) { bar.innerHTML = `<span class="st">${esc(msg || 'Stelle ein …')}</span><button data-la="stop" class="stop">Stopp</button>`; return; }
        const RL = relistCandidates();
        if (relistAsk) {
          if (!RL.out.length) { relistAsk = false; } else {
            const prev = RL.out.slice(0, 6).map(({ p, pr }) => `<div class="rl-r"><span>${esc(p.rating ?? (p.isCons ? '🧪' : ''))} ${esc(p.name)}</span><span>${pr.old ? fmt(pr.old) + ' → ' : ''}<b>${fmt(pr.bin)}</b> <small>${esc(pr.src)}</small></span></div>`).join('');
            const sumOld = RL.out.reduce((a, c) => a + (c.pr.old || 0), 0), sumNew = RL.out.reduce((a, c) => a + c.pr.bin, 0);
            bar.innerHTML = `<div class="rl-box"><span class="st">${RL.out.length} abgelaufene Karte(n) für ${esc(DUR.find((d) => d[0] === settings.listDuration)?.[1] || '')} neu einstellen?${sumOld ? ` Summe ${fmt(sumOld)} → <b>${fmt(sumNew)}</b>` : ''}</span>${prev}${RL.out.length > 6 ? `<div class="rl-r"><small>… und ${RL.out.length - 6} weitere</small></div>` : ''}${RL.none.length ? `<div class="rl-r"><small>${RL.none.length} ohne Preis übersprungen</small></div>` : ''}<div><button data-la="rlyes" class="go">Ja, neu einstellen</button><button data-la="rlno">Nein</button></div></div>`;
            return;
          }
        }
        if (confirmN) {
          const nr = out.filter((c) => c.raised).length;
          bar.innerHTML = `<span class="st">${confirmN}× ${esc(gName)} für ${esc(DUR.find((d) => d[0] === settings.listDuration)?.[1] || '')} einstellen?${nr ? ` (${nr}× zum Ohne-Verlust-Preis, weil teurer gekauft)` : ''}</span><button data-la="yes" class="go">Ja, einstellen</button><button data-la="no">Nein</button>`;
          return;
        }
        const sel = G.length ? `<select data-la="grp" aria-label="Welche Karten einstellen">${G.map((g) => `<option value="${g.k}" ${String(group) === g.k ? 'selected' : ''}>${g.n}× ${esc(g.rating ?? '')} ${esc(g.name)} · ${fmt(g.bin)}${g.raised ? ` (${g.raised}× höher, ohne Verlust)` : ''}</option>`).join('')}${G.length > 1 ? `<option value="all" ${group === 'all' ? 'selected' : ''}>Alle mit Festpreis (${G.reduce((a, g) => a + g.n, 0)})</option>` : ''}</select>` : '';
        const rlBtn = RL.out.length ? `<button data-la="rl" class="rl" title="Abgelaufene Karten mit angepasstem Preis neu einstellen">↻ Abgelaufene (${RL.out.length})</button>` : '';
        bar.innerHTML = `${sel}${rlBtn}<button data-la="ask" class="go" ${out.length ? '' : 'disabled'} title="${skipped.length ? `${skipped.length} Karte(n) übersprungen: Festpreis unter „ohne Verlust“` : 'Stellt die gewählten gleichen Karten nacheinander ein'}">▶ Einstellen (${out.length})</button>${msg ? `<span class="st">${esc(msg)}</span>` : skipped.length ? `<span class="st">${skipped.length} Karte(n) übersprungen: Festpreis unter „ohne Verlust“ – in den Einstellungen änderbar</span>` : (G.length ? '' : '<span class="st">Festpreis in einer Zeile festlegen, dann hier einstellen</span>')}`;
      }
      async function runAll(list) {
        const out = list || candidates(group).out;
        const S = W.services && W.services.Item;
        if (!S || typeof S.list !== 'function') { drawBar('EA-Funktion zum Einstellen nicht gefunden'); return; }
        running = true; stop = false;
        let ok = 0, fail = 0;
        for (let i = 0; i < out.length && !stop; i++) {
          const { p, pr } = out[i];
          drawBar(`${i + 1}/${out.length}: ${p.name} für ${fmt(pr.bin)} …`);
          try {
            const ev = await new Promise((resolve, reject) => {
              const t = setTimeout(() => reject(new Error('Zeitüberschreitung')), 12000);
              S.list(p.__raw, pr.start, pr.bin, settings.listDuration).observe(panel, (obs, res) => {
                clearTimeout(t); try { obs.unobserve(panel); } catch (e) { /* */ } resolve(res);
              });
            });
            if (ev && ev.success !== false) ok++; else { fail++; log('Einstellen', p.name, ev && ev.status); }
          } catch (e) { fail++; log('Einstellen', e); }
          await sleep(1300 + Math.random() * 1200);   // menschliches Tempo, schont EA
        }
        running = false;
        showToast(`${ok} eingestellt${fail ? ` · ${fail} fehlgeschlagen` : ''}${stop ? ' · gestoppt' : ''}`, fail > 0);
        drawBar(`${ok} eingestellt${fail ? `, ${fail} Fehler` : ''}`);
        refresh();
      }
      bar.addEventListener('change', (e) => {
        if (e.target.dataset.la === 'grp') { e.stopPropagation(); group = e.target.value; confirmN = 0; drawBar(); }
      });
      bar.addEventListener('click', (e) => {
        const b = e.target.closest('[data-la]');
        if (!b) return;
        e.stopPropagation();
        const a = b.dataset.la;
        if (a === 'ask') { confirmN = candidates(group).out.length; drawBar(); }
        if (a === 'no') { confirmN = 0; drawBar(); }
        if (a === 'yes') { confirmN = 0; runAll(); }
        if (a === 'rl') { relistAsk = true; confirmN = 0; drawBar(); }
        if (a === 'rlno') { relistAsk = false; drawBar(); }
        if (a === 'rlyes') { relistAsk = false; runAll(relistCandidates().out); }
        if (a === 'stop') { stop = true; drawBar('Stoppe nach dieser Karte …'); }
      });
      panel.addEventListener('click', (e) => {
        const fl = e.target.closest && e.target.closest('[data-fixlist]');
        if (fl) {
          e.stopPropagation();
          group = fl.dataset.fixlist; confirmN = candidates(group).out.length; drawBar();
          const lst = panel.querySelector('.fcpt-list'); if (lst) lst.scrollTop = 0;
          bar.scrollIntoView({ block: 'nearest' });
          return;
        }
        const cl = e.target.closest && e.target.closest('[data-consload]');
        if (cl) {
          e.stopPropagation(); cl.disabled = true; cl.textContent = 'Lädt …';
          CONS.load(true).then(() => { showToast('🧪 Futbin-Preise geladen'); render(); })
            .catch((er) => { showToast('Futbin: ' + er.message, true); render(); });
          return;
        }
        const sv = e.target.closest && e.target.closest('[data-fixsave]');
        const dl = e.target.closest && e.target.closest('[data-fixdel]');
        if (!sv && !dl) return;
        e.stopPropagation();
        const rid = (sv || dl).dataset[sv ? 'fixsave' : 'fixdel'];
        if (dl) { delete settings.listPresets[rid]; saveSettings(); showToast('Festpreis entfernt'); render(); return; }
        // Mehrere gleiche Karten = mehrere Felder mit derselben ID -> das Feld neben DIESEM Knopf nehmen
        const inp = (sv.closest('.tr-fix') || panel).querySelector('[data-fixin]');
        let v = parseInt(inp && (inp.value || inp.placeholder.replace(/\D/g, '')), 10) || 0;
        if (v < 200) { showToast('Bitte einen Preis ab 200 eingeben', true); return; }
        v = roundPrice(v);
        settings.listPresets[rid] = { bin: v, start: lowerStep(v) };
        saveSettings(); showToast(`📌 Festpreis ${fmt(v)} gespeichert`); render();
      });
      // Eingabe im Festpreis-Feld darf nicht den allgemeinen „Einstellung geändert → neu laden“-Code auslösen
      panel.addEventListener('change', (e) => { if (e.target.dataset && e.target.dataset.fixin) e.stopPropagation(); }, true);
      panel.addEventListener('keydown', (e) => {
        if (e.target.dataset && e.target.dataset.fixin && e.key === 'Enter') { e.stopPropagation(); const b2 = e.target.closest('.tr-fix') && e.target.closest('.tr-fix').querySelector('[data-fixsave]'); if (b2) b2.click(); }
      });
      // Einstellungen: Dauer, Fallback, Verlustschutz
      const g = panel.querySelector('[data-opt="inline"]');
      const grp = g && g.closest('.fcpt-settings');
      if (grp) {
        const box = document.createElement('div');
        box.className = 'fcpt-sgroup';
        box.innerHTML = `<h4>Alle einstellen</h4>
          <div class="fcpt-set"><span>Angebotsdauer</span><select data-lo="dur">${DUR.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
          <div class="fcpt-set"><span>Ohne Festpreis: Futbin-Vorschlag nehmen<small>Aus = nur Karten mit Festpreis werden eingestellt</small></span><input type="checkbox" class="fcpt-sw" data-lo="fb"></div>
          <div class="fcpt-set"><span>Festpreis unter „ohne Verlust“<small>Wenn eine Karte teurer gekauft wurde als der Festpreis zurückbringt</small></span><select data-lo="loss"><option value="be">zum Ohne-Verlust-Preis einstellen</option><option value="skip">überspringen</option><option value="allow">trotzdem zum Festpreis</option></select></div>
          <h4>↻ Abgelaufene neu einstellen</h4>
          <div class="fcpt-set"><span>Neuer Preis<small>Für Karten ohne Festpreis</small></span><select data-lo="rlm"><option value="market">aktueller Marktpreis (Futbin)</option><option value="cut">letzter Preis, etwas günstiger</option><option value="same">letzter Preis</option></select></div>
          <div class="fcpt-set"><span>Wie viel günstiger<small>In Preisstufen (z. B. 1 = 2.600 → 2.500)</small></span><input type="number" min="1" max="10" data-lo="rlc"></div>
          <div class="fcpt-set"><span>Festpreis hat Vorrang</span><input type="checkbox" class="fcpt-sw" data-lo="rlp"></div>
          <div class="fcpt-set"><span>Nie unter „ohne Verlust“<small>Teurer gekaufte Karten nicht mit Verlust einstellen</small></span><input type="checkbox" class="fcpt-sw" data-lo="rlf"></div>`;
        grp.appendChild(box);
        const d = box.querySelector('[data-lo="dur"]'), f = box.querySelector('[data-lo="fb"]'), l = box.querySelector('[data-lo="loss"]');
        d.value = String(settings.listDuration); f.checked = !!settings.listFallback; l.value = settings.listLossMode;
        const rm = box.querySelector('[data-lo="rlm"]'), rc = box.querySelector('[data-lo="rlc"]'), rp = box.querySelector('[data-lo="rlp"]'), rf = box.querySelector('[data-lo="rlf"]');
        rm.value = settings.relistMode; rc.value = settings.relistCut; rp.checked = !!settings.relistUsePreset; rf.checked = !!settings.relistFloor;
        box.addEventListener('change', (e) => {
          e.stopPropagation();
          settings.listDuration = parseInt(d.value, 10) || 3600; settings.listFallback = f.checked; settings.listLossMode = l.value;
          settings.relistMode = rm.value; settings.relistCut = Math.max(1, Math.min(10, parseInt(rc.value, 10) || 1)); settings.relistUsePreset = rp.checked; settings.relistFloor = rf.checked;
          saveSettings(); drawBar();
        });
      }
      drawBar();
      return { fixHtml, drawBar };
    })();

    return { rowHtml, headHtml, updateRow, after: () => { after(); LIST.drawBar(); }, go, renderHome };
  })();
