  // ==================================================================
  // OBERFLÄCHE „Variante B“: kompakte Symbolleiste rechts, dichte Transferliste,
  // Übersicht mit Alarmen. Baut das vorhandene Panel um (alle Funktionen bleiben).
  // ==================================================================
  // eslint-disable-next-line no-var
  var UIB = (() => {
    if (settings.uiMini === undefined) settings.uiMini = false;
    if (settings.ufm === undefined) settings.ufm = true;   // Design „Stadion“ (Schwarz/Gold, große Kacheln)
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
      l.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;0,800;1,800&family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap';
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
      /* ===== Transferliste – überarbeitetes Design ===== */
      #fcpt-panel .fcpt-overview.lo{grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      #fcpt-panel .fcpt-overview.lo>div{position:relative;background:linear-gradient(180deg,#161c2a,#11151f);border:1px solid #232b3d;border-radius:14px;padding:10px 12px 11px;overflow:hidden}
      #fcpt-panel .fcpt-overview.lo>div::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--lc,#f2c14e)}
      #fcpt-panel .fcpt-overview.lo .lo-a{--lc:#60a5fa}#fcpt-panel .fcpt-overview.lo .lo-b{--lc:#f2c14e}#fcpt-panel .fcpt-overview.lo .lo-c{--lc:#34d399}#fcpt-panel .fcpt-overview.lo .lo-d{--lc:#a78bfa}
      #fcpt-panel .fcpt-overview.lo .l{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8d98ad}
      #fcpt-panel .fcpt-overview.lo .v{font-size:19px;font-weight:700;margin-top:2px}#fcpt-panel .fcpt-overview.lo .v small{font-size:12px;color:var(--ink3);margin-left:2px}
      #fcpt-panel .fcpt-overview.lo .s{font-size:11px;color:var(--ink3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .lo .s i{display:inline-block;width:7px;height:7px;border-radius:2px;margin:0 3px 0 6px;vertical-align:0}.lo .s i:first-child{margin-left:0}
      .lo .b-a{background:#60a5fa}.lo .b-e{background:#fb923c}.lo .b-o{background:#64748b}.lo .b-s{background:#34d399}
      .lo-bar{display:flex;height:4px;border-radius:2px;background:#1b2232;margin-top:6px;overflow:hidden}.lo-bar i{display:block;height:100%}
      .lo-st{margin-top:6px !important;font-size:11.5px}
      @media (max-width:640px){#fcpt-panel .fcpt-overview.lo{grid-template-columns:repeat(2,minmax(0,1fr))}}
      .fcpt-toolbar{flex-wrap:wrap;row-gap:8px}
      .lf-chips{display:flex;gap:6px;flex-wrap:wrap;flex:1 1 100%}
      .lf-chips button{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:999px;border:1px solid #263049;background:#10151f;color:var(--ink2);font:600 12.5px 'IBM Plex Sans',system-ui,sans-serif;cursor:pointer}
      .lf-chips button span{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#1c2436;color:var(--ink);font-size:11px;display:inline-flex;align-items:center;justify-content:center}
      .lf-chips button.on{background:#2a2412;border-color:var(--gold);color:var(--gold)}.lf-chips button.on span{background:var(--gold);color:#15120a}
      .lf-chips button:disabled{opacity:.4;cursor:default}
      @media (max-width:640px){
        .lf-chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}.lf-chips::-webkit-scrollbar{display:none}
        .lf-chips button{flex:none;height:28px;padding:0 10px}
        .tr .nm{white-space:normal;line-height:1.25;display:flex;flex-wrap:wrap;align-items:center;column-gap:4px}
        .tr .nm .st{margin-left:0 !important;flex-basis:auto}
        .tr .ovr{width:28px;height:22px;font-size:12px}
        .tr-row{padding-top:6px;padding-bottom:6px}
      }
      .lv-sw{display:inline-flex;border:1px solid #263049;border-radius:10px;overflow:hidden}.lv-sw button{height:32px;padding:0 12px;border:0;background:#10151f;color:var(--ink2);font:600 12.5px 'IBM Plex Sans',system-ui,sans-serif;cursor:pointer}.lv-sw button.on{background:#2a2412;color:var(--gold)}
      .kan{display:grid;grid-template-columns:1fr;gap:12px;padding:10px 12px 20px}
      .kan-c{background:#0d121b;border:1px solid #1d2536;border-radius:16px;padding:12px;min-width:0}
      .kan-c h3{margin:0;display:flex;justify-content:space-between;align-items:center;font:700 12.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--kc)}
      .kan-c h3 em{font-style:normal;background:#1c2436;color:var(--ink);border-radius:8px;padding:1px 9px;font-size:12px;letter-spacing:0}
      .kan-s{font-size:11.5px;color:var(--ink3);margin:4px 0 10px}.kan-s b{font-family:'JetBrains Mono',monospace}
      .kan-l{display:flex;flex-direction:column;gap:8px}.kan-e{color:var(--ink3);text-align:center;padding:14px 0}
      .kan .tr.kc{border:1px solid #20283a;border-radius:12px;background:#141a27;overflow:hidden}
      .kan .tr.kc>.kc-b{display:flex !important;align-items:center;gap:10px;padding:9px 10px;min-height:0;grid-template-columns:none}
      .kan .tr.kc>.kc-b .ovr{flex:none;width:32px;height:38px;font-size:13.5px}
      .kan .kc-x{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.kan .kc-x .nm{font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kan .kc-x small{font-size:12px;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kan .kc-x .fx{font-style:normal;color:var(--gold)}
      .kan .kc-r{display:flex;flex-direction:column;align-items:flex-end;gap:2px;font-size:13px}.kan .kc-r [data-pf]{font-size:12.5px;font-weight:700}
      .kan .tr.kc.lieg{border-color:rgba(255,174,92,.35)}.kan .tr.kc.open{border-color:var(--gold)}.kan .tr.kc.open>.kc-b{box-shadow:none;background:#18202f}
      .kan .tr.kc>.tr-det{padding:0 8px 8px}
      .kan .tr-det .tr-row,html.fcpt-fill .kan .tr-det .tr-row{grid-template-columns:26px minmax(0,1fr) 64px 0 64px;gap:6px;padding:0 6px;font-size:13px;min-height:40px}
      .kan .tr-det .tr-row .mk{display:none}
      .kan .tr-det .tr-row,html.fcpt-fill .kan .tr-det .tr-row{grid-template-columns:24px minmax(0,1fr) 62px 0 66px}
      .kan .tr-det .tr-row .ovr,html.fcpt-fill .kan .tr-det .tr-row .ovr{width:24px;height:20px;font-size:11px}.kan .tr-det .tr-row .nm{font-weight:500;font-size:12.5px}
      html.fcpt-fill #fcpt-panel .fcpt-toolbar{justify-content:flex-start;column-gap:12px}
      .kan .tr-det .tr{border-bottom:1px solid #1a2132}
      @media (min-width:1100px){html.fcpt-fill .kan.k4{grid-template-columns:repeat(4,minmax(0,1fr))}html.fcpt-fill .kan.k1{grid-template-columns:minmax(0,560px)}html.fcpt-fill .kan{padding:14px 0 30px;align-items:start}}
      @media (min-width:700px) and (max-width:1099px){html.fcpt-fill .kan.k4{grid-template-columns:repeat(2,minmax(0,1fr))}}
      .cs{display:flex;flex-direction:column;gap:10px;margin-top:10px}
      .cs-w{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--ink2)}
      .cs-q{display:flex;gap:6px}.cs-q input{flex:1;min-width:0;height:34px;border-radius:9px;border:1px solid #2b3654;background:#0b1020;color:var(--ink);padding:0 10px;font:inherit;font-size:13px}
      .cs-pl{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 6px 0 12px;border-radius:9px;background:#2a2412;border:1px solid var(--gold);color:var(--ink);font-size:13.5px;width:fit-content}.cs-pl b{color:var(--gold)}.cs-pl button{border:0;background:transparent;color:var(--ink2);cursor:pointer;font-size:14px}
      .cs-found{display:flex;flex-wrap:wrap;gap:6px}.cs-found button{height:30px;padding:0 10px;border-radius:999px;border:1px solid #2b3654;background:#10151f;color:var(--ink);font:600 12.5px inherit;cursor:pointer}.cs-found button b{color:var(--gold)}
      .cs-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
      .cs-g label{display:flex;flex-direction:column;gap:4px;font-size:11.5px;color:var(--ink2);font-weight:600}
      .cs-g select,.cs-g input{height:34px;border-radius:9px;border:1px solid #2b3654;background:#0b1020;color:var(--ink);padding:0 8px;font:inherit;font-size:13px;width:100%;box-sizing:border-box}
      .cs-a{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .lf-empty{padding:40px 16px;text-align:center;color:var(--ink3);font-size:14px}
      .tr-h{background:#0d121c}
      .tr .ovr{display:inline-flex;align-items:center;justify-content:center;width:30px;height:24px;border-radius:6px;background:linear-gradient(160deg,#f6e08a,#c9a227);color:#241a00 !important;font-weight:700;font-size:12.5px}
      .tr .nm{font-weight:600}
      .tr .st{display:inline-block;font-weight:600;font-size:11px !important;padding:2px 8px;border-radius:999px;background:#1a2131;vertical-align:1px}
      .tr.sold .st{background:rgba(61,214,140,.12)}.tr.expired .st{background:rgba(255,174,92,.12)}.tr.active .st{background:rgba(91,156,255,.12)}
      .tr .st.fx{background:rgba(242,193,78,.12)}
      .tr-row [data-pf]{font-weight:700}
      .tr-row{transition:background .1s}.tr.open>.tr-row{box-shadow:inset 3px 0 0 var(--gold)}
      .tr.grp>.tr-row .nm{font-weight:700}
      @media (min-width:900px){
        html.fcpt-fill #fcpt-panel .fcpt-list{padding:14px 36px 90px}
        html.fcpt-fill #fcpt-panel .fcpt-list .tr-h{border:1px solid #1d2536;border-bottom:0;border-radius:14px 14px 0 0;position:sticky;top:0}
        html.fcpt-fill #fcpt-panel .fcpt-list>.tr{border-left:1px solid #1d2536;border-right:1px solid #1d2536;background:#0d121b}
        html.fcpt-fill #fcpt-panel .fcpt-list>.tr:last-child{border-radius:0 0 14px 14px;border-bottom:1px solid #1d2536}
        html.fcpt-fill #fcpt-panel .fcpt-list>.tr>.tr-row:hover,html.fcpt-fill .kan .kc-b:hover{background:#121a28}
        html.fcpt-fill .tr .ovr{width:36px;height:28px;font-size:14px}
        html.fcpt-fill #fcpt-panel .fcpt-sum{padding-top:18px}
        html.fcpt-fill #fcpt-panel .fcpt-sum>*,html.fcpt-fill #fcpt-panel .fcpt-toolbar>*{max-width:1500px}
        html.fcpt-fill #fcpt-panel .fcpt-overview.lo .v{font-size:24px}
        html.fcpt-fill #fcpt-panel .fcpt-toolbar{padding-top:12px;padding-bottom:4px}
      }
      .tr.grp>.tr-det.grp-det{padding:0 0 4px 16px;border-left:2px solid #2b3654;margin-left:14px}.grp-det .tr{border-bottom:1px solid #141b29}.grp-det .tr-row{padding-left:4px}
      .tr .gc{display:inline-block;min-width:22px;margin-right:6px;padding:0 5px;border-radius:6px;background:#1b2336;color:var(--gold);font-size:11.5px;font-weight:700;text-align:center}
      .tr-row .r small{font-size:10.5px;color:var(--ink3);margin-left:1px}
      .fcpt-grpt{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--ink2);margin-left:8px;white-space:nowrap;cursor:pointer}
      .tr-det .c-stats{margin-top:0}
      .by-r.sel{outline:2px solid var(--blue);outline-offset:1px}
      #fcpt-panel kbd{display:inline-block;min-width:16px;padding:0 4px;margin-left:5px;border-radius:4px;border:1px solid currentColor;font:600 10px ui-monospace,monospace;opacity:.7;vertical-align:1px}
      .by-keys{font-size:11px;color:var(--ink3)}
      .by-opts{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--ink2);align-items:center}
      .by-opts label{display:flex;align-items:center;gap:5px;cursor:pointer}.by-opts input[type=number]{width:70px;padding:3px 6px;border-radius:6px;border:1px solid #2b3654;background:#0f1526;color:var(--ink)}
      .gl-in{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:8px}.gl-in label{display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--ink2)}.gl-in input{height:32px;border-radius:8px;border:1px solid #2b3654;background:#0f1526;color:var(--ink);padding:0 8px;min-width:0}
      .gl-hit{display:flex;justify-content:space-between;align-items:center;gap:6px;border:1px solid #2b3654;background:#0f1526;border-radius:10px;padding:6px 8px;font-size:13px}.gl-hit span:last-child{display:flex;gap:4px}
      #fcpt-panel .btns2{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}
      .gl-rest summary{cursor:pointer;font-size:13px;color:var(--ink2);margin:6px 0}
      .wl-list{display:flex;flex-direction:column;gap:6px;margin:8px 0}
      .wl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;background:#121a2a;border:1px solid #223049;border-radius:12px;padding:9px 10px}
      .wl-row.hit{border-color:#16a34a;background:#0d2a1b}.wl-row.paused{opacity:.6}
      .wl-name{display:flex;flex-direction:column;gap:2px;min-width:150px;flex:1}.wl-name small{font-size:11px;color:var(--ink2)}.wl-name small b{color:var(--ink)}
      .wl-name small b,.wl-h b{display:inline !important}.wl-h{font-size:14px}.wl-ver{font-size:11px}
      .wl-row.hit .wl-st{color:#4ade80;font-weight:700}.wl-ver{color:var(--ink3)}
      .wl-up{color:#4ade80}.wl-dn{color:#f87171}
      .wl-ctl{display:flex;gap:4px;align-items:center}.wl-ctl select,.wl-ctl input{height:32px;border-radius:8px;border:1px solid #2b3654;background:#0f1526;color:var(--ink);font-size:12px;padding:0 6px}.wl-ctl input{width:84px}
      .wl-b{width:32px;height:32px;border-radius:8px;border:1px solid #2b3654;background:#0f1526;color:var(--ink);cursor:pointer}
      .wl-res{display:flex;flex-direction:column;gap:4px;margin:6px 0}
      .wl-pick{display:flex;justify-content:space-between;gap:8px;align-items:center;text-align:left;border:1px solid #2b3654;background:#0f1526;color:var(--ink);border-radius:10px;padding:8px 10px;cursor:pointer;font-size:13px}
      .wl-pick span{color:var(--gold);font-size:12px;white-space:nowrap}.wl-pick:disabled{opacity:.5}
      .pt-open{display:flex;flex-direction:column;gap:4px;background:#2a2412;border:1px solid #a16207;color:#fde68a;border-radius:12px;padding:10px 12px;margin-top:8px;font-size:13px}.pt-open span{color:var(--ink2);font-size:12px}
      .by-rot summary{cursor:pointer;font-size:13px;color:var(--ink);margin-top:2px}.by-rot-tools{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0;font-size:12px;color:var(--ink2)}.by-rot-tools input{width:56px;height:28px;margin:0 4px;border-radius:7px;border:1px solid #2b3654;background:#0b1020;color:var(--ink);padding:0 6px}
      .by-rot-list{max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:2px}.by-rot-list .pt-r{font-size:12px;align-items:center}.by-rot-list .pt-r.ex{opacity:.45;text-decoration:line-through}.by-rot-list .pt-r.ex .by-rx{text-decoration:none}
      .by-seg{display:flex}.by-seg button{flex:1 1 0;min-width:0;white-space:nowrap}
      .by-lst{display:flex;flex-direction:column;gap:6px;margin-top:6px}.by-lst-rows{display:flex;flex-direction:column;gap:4px;max-height:300px;overflow:auto}
      .by-lst-r{display:flex;align-items:center;gap:6px;background:#0f1526;border:1px solid #232c45;border-radius:10px;padding:4px 6px;font-size:12px}.by-lst-r.cur{border-color:#F2C14E}.by-lst-r.off{opacity:.45}
      .by-lst-r .nm{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;color:var(--ink)}
      .by-lst-r label{display:flex;align-items:center;gap:3px;color:var(--ink2);white-space:nowrap}.by-lst-r input[type=number]{height:28px;border-radius:7px;border:1px solid #2b3654;background:#0b1020;color:var(--ink);padding:0 6px;font:inherit}
      .by-lst-r input[data-lr]{width:44px}.by-lst-r input[data-lm]{width:78px}
      .by-lst-add{display:flex;gap:6px;align-items:center}.by-lst-add input{flex:1 1 auto;min-width:0;height:32px;border-radius:8px;border:1px solid #2b3654;background:#0b1020;color:var(--ink);padding:0 8px;font:inherit;font-size:13px}
      .by-lst-found{display:flex;flex-direction:column;gap:2px;max-height:200px;overflow:auto}.by-lst-found .pt-r{font-size:12px;align-items:center}
      .by-rate{background:#0f1526;border:1px solid #232c45;border-radius:12px;padding:8px 10px;display:flex;flex-direction:column;gap:5px}
      .by-rate-t{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--ink2)}.by-rate-t b{font-size:13px;color:#34D399}
      .by-rate.warn .by-rate-t b{color:#F2C14E}.by-rate.red .by-rate-t b{color:#ff6b6b}.by-rate.red{border-color:#ff6b6b}.by-rate.warn{border-color:#8a6d1f}
      .by-rate-bar{height:6px;border-radius:3px;background:#1b2336;overflow:hidden}.by-rate-bar i{display:block;height:100%;background:#34D399;transition:width .4s}
      .by-rate.warn .by-rate-bar i{background:#F2C14E}.by-rate.red .by-rate-bar i{background:#ff6b6b}.by-rate-w{font-size:12px;color:var(--ink)}
      .by-lst-r{flex-wrap:wrap}.by-lst-fb{flex:1 1 100%;font-size:11.5px;color:var(--ink2);display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-left:26px}.by-lst-fb b{color:var(--ink)}
      .by-lst-fb.mut{opacity:.7}.by-lst-fb.warn{color:#ffae5c}.by-lst-fb .fcpt-smallbtn{padding:2px 8px;font-size:11px}
      .by-kind{display:flex;gap:6px;margin-top:6px}.by-kind button{flex:1 1 0;min-width:0;height:34px;border-radius:10px;border:1px solid #2b3654;background:#0f1526;color:var(--ink2);font:700 13px inherit;cursor:pointer;white-space:nowrap}.by-kind button.on{background:#1b2336;color:var(--gold);border-color:var(--gold)}
      .by-sin label.inl{flex-direction:row;align-items:center;gap:6px;white-space:nowrap}.by-sin label.inl input{width:64px;flex:none}
      .by-kind button{font-family:inherit;font-weight:700;font-size:13px}.by-obb{font-family:inherit}
      .by-cd{font-variant-numeric:tabular-nums}.by-cd.hot{color:#ff6b6b;font-weight:700}
      .by-ob{display:flex;align-items:center;gap:8px;background:#2a1640;border:2px solid #a78bfa;border-radius:14px;padding:8px 10px;animation:fcptArm 1.2s infinite}.by-ob.no{background:#1b2336;border-color:#475069;animation:none}
      .by-ob>div{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}.by-ob b{font-size:13px;color:var(--ink)}.by-ob small{font-size:12px;color:var(--ink2)}
      .by-obs{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.by-obb.alt{background:#2a1f45;color:#ddd6fe;border:1px solid #a78bfa}
      .by-bids{font-size:12px;color:var(--ink2);background:#0f1526;border:1px solid #232c45;border-radius:10px;padding:6px 10px}.by-bids b{color:var(--ink)}.by-bids b.neg{color:#ff6b6b}.by-bids b.pos{color:#34D399}
      .by-ob{flex-wrap:wrap;position:relative;padding-right:40px}.by-ob>.by-rx{position:absolute;top:8px;right:8px;margin:0}.by-ob>div:first-child{flex:1 1 100%}.by-ob>div.by-obs{flex:1 1 100%;flex-direction:row;justify-content:flex-start}.by-obs .by-obb{flex:1 1 0;min-width:0}.by-obs .by-obb{height:36px;padding:0 12px}
      .by-r:has(.by-a button.j){flex-wrap:wrap}.by-r:has(.by-a button.j) .by-a{flex:1 1 100%;flex-direction:row}.by-r:has(.by-a button.j) .by-a button{flex:1 1 0;min-width:0}.by-obb{height:40px;padding:0 14px;border:0;border-radius:12px;background:#a78bfa;color:#140b24;font:800 14px inherit;cursor:pointer;white-space:nowrap}
      .by-st summary{cursor:pointer;font-size:13px;color:var(--ink);margin:6px 0}.by-st-h,.by-st-r{display:grid;grid-template-columns:minmax(0,2.4fr) repeat(5,minmax(0,1fr));gap:6px;font-size:12px;padding:3px 0;align-items:center}
      .by-st-h{color:var(--ink2);font-weight:700;border-bottom:1px solid #232c45}.by-st-r span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink)}.by-st-r small{color:var(--ink2)}.by-st-r.dead{opacity:.5}
      .by-rx{width:26px;height:26px;border-radius:7px;border:1px solid #2b3654;background:#0f1526;color:var(--ink);cursor:pointer;margin-left:4px}
      .by-simple{display:flex;flex-direction:column;gap:8px;background:#121a2a;border:1px solid var(--gold);border-radius:14px;padding:10px 12px}
      .by-seg{display:flex;gap:6px}.by-seg button{flex:1;height:38px;border-radius:10px;border:1px solid #2b3654;background:#0f1526;color:var(--ink);font:700 14px system-ui,sans-serif;cursor:pointer}.by-seg button.on{background:var(--gold);color:#15120a;border-color:var(--gold)}
      .by-sin{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}.by-sin label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--ink2)}.by-sin label.ck{flex-direction:row;align-items:center;gap:5px;height:34px;color:var(--ink);font-size:13px}
      .by-sin input[type=number]{width:110px;height:34px;border-radius:8px;border:1px solid #2b3654;background:#0b1020;color:var(--ink);padding:0 8px;font-size:15px}
      .by-adv > summary{cursor:pointer;font-size:13px;color:var(--ink2);padding:4px 2px}.by-adv[open]{display:flex;flex-direction:column;gap:10px}
      .by-flash{border-radius:12px;padding:12px;text-align:center;font:800 17px system-ui,sans-serif}.by-flash.ok{background:#14532d;color:#bbf7d0;border:1px solid #16a34a}.by-flash.fail{background:#450a0a;color:#fecaca;border:1px solid #dc2626}
      .by-log summary{cursor:pointer;font-size:13px;color:var(--ink2);margin:2px 0}.by-log .pt-r{font-size:12px;font-family:inherit;display:flex;justify-content:space-between;gap:8px;align-items:baseline}.by-log .pt-r span:first-child{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.by-log .pt-r span:last-child{flex:none;white-space:nowrap;text-align:right}.by-log .pt-r.miss{color:#fca5a5}
      .by-rf{display:flex;flex-direction:column;gap:6px;background:#121a2a;border:1px solid #223049;border-radius:12px;padding:8px 10px}.by-rf.on{border-color:var(--gold)}
      .by-rf-in{display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap}.by-rf-in label{display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--ink2)}.by-rf-in select{height:30px;border-radius:7px;border:1px solid #2b3654;background:#0b1020;color:var(--ink)}.by-rf-in input{width:76px;height:30px;border-radius:7px;border:1px solid #2b3654;background:#0b1020;color:var(--ink);padding:0 6px}
      .by-tgts{display:flex;flex-direction:column;gap:6px;background:#121a2a;border:1px solid #223049;border-radius:12px;padding:8px 10px}
      .by-tgts-h{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px}
      .by-tsave{border:1px dashed #3a4562;background:transparent;color:var(--gold);border-radius:8px;padding:5px 9px;font:600 12px system-ui,sans-serif;cursor:pointer}.by-tsave:disabled{opacity:.5;cursor:default}
      .by-tlist{display:flex;flex-direction:column;gap:4px}
      .by-t{display:flex;align-items:center;gap:6px;border:1px solid #2b3654;border-radius:10px;padding:3px 4px 3px 3px;background:#0f1526}
      .by-t.on{border-color:var(--gold);background:#2a2412}
      .by-tn{flex:1;min-width:0;text-align:left;border:0;background:transparent;color:var(--ink);font:600 13px system-ui,sans-serif;padding:6px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .by-tn kbd{margin:0 6px 0 0 !important}
      .by-t label{display:flex;align-items:center;gap:3px;font-size:12px;color:var(--ink2)}.by-t input{width:80px;height:28px;border-radius:7px;border:1px solid #2b3654;background:#0b1020;color:var(--ink);padding:0 6px}
      .by-tx{width:28px;height:28px;border:0;border-radius:7px;background:transparent;color:var(--ink3);cursor:pointer}
      .by-mode{font-size:12px;color:var(--ink2);background:#151c2e;border:1px solid #263049;border-radius:10px;padding:7px 10px}.by-mode.on{color:#fde68a;border-color:#a16207;background:#2a2412}
      .by-stats{font-size:11px;color:var(--ink3);font-variant-numeric:tabular-nums}
      .by-max{border:1px dashed #3a4562;background:transparent;color:var(--ink);border-radius:10px;padding:8px 10px;font:600 12px system-ui,sans-serif;cursor:pointer;text-align:left}
      .by-max b{color:var(--gold)}
      .by-ready{background:#3a2a12;border:1px solid #f97316;color:#fed7aa;border-radius:10px;padding:8px 10px;font-size:13px}
      .by-a .l{white-space:nowrap}.by-keys kbd{margin:0 1px}
      .fcpt-resize{position:absolute;left:-4px;top:0;bottom:0;width:8px;cursor:ew-resize;z-index:3}
      .fcpt-resize:hover,.fcpt-resize.on{background:linear-gradient(90deg,transparent 3px,var(--gold) 3px,var(--gold) 5px,transparent 5px)}
      html.fcpt-dock body{width:calc(100vw - var(--fcpt-w, 520px)) !important;min-width:0 !important;transform:translateZ(0);overflow:hidden}
      html.fcpt-dock #fcpt-panel{box-shadow:none}
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
      .by-go.wait,.by-go:disabled.wait{background:#2b3140;color:#9aa4b6;cursor:not-allowed}
      .by-go{width:100%;height:60px;border-radius:18px;border:0;background:var(--gold);color:#15120a;font:800 19px system-ui,sans-serif;cursor:pointer}
      .by-go:disabled{opacity:.6}
      .by-go.buy{background:#f97316;color:#fff;animation:fcptArm 1s infinite}.by-go.buy small{font-size:14px;opacity:.9}
      @keyframes fcptArm{50%{filter:brightness(1.25)}}
      @media (min-width:701px){.by-a{flex-direction:row}.by-a button{min-width:112px}.by-r{padding:8px 10px}}
      .fcpt-home{display:none;overflow:auto;padding:12px 14px 90px;flex:1;flex-direction:column;gap:12px}
      #fcpt-panel.v-home .fcpt-home{display:flex}
      #fcpt-panel.v-home .fcpt-list,#fcpt-panel.v-home .fcpt-trade,#fcpt-panel.v-home .fcpt-settings,#fcpt-panel.v-home .fcpt-sum,#fcpt-panel.v-home .fcpt-toolbar{display:none !important}
      #fcpt-panel.v-trade .fcpt-subtabs{display:none}
      #fcpt-panel[data-sub="verein"] .fcpt-subpane[data-pane="futter"]{display:block !important}
.d-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .d-t{position:relative;background:linear-gradient(180deg,#1a1f2c,#12161f);border:1px solid #262d3d;border-radius:12px;padding:10px 12px 12px;display:flex;flex-direction:column;align-items:center;gap:2px;overflow:hidden;cursor:default}
      .d-t[data-dgo]{cursor:pointer}.d-t[data-dgo]:hover{border-color:#3a4562}
      .d-t::before{content:'';position:absolute;left:0;right:0;top:0;height:3px;background:var(--dc,#f2c14e)}
      .d-t .l{align-self:stretch;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#c9a24a;border-bottom:1px solid #262d3d;padding-bottom:6px;margin-bottom:4px}
      .d-t .v{font-size:26px;font-weight:800;color:var(--dc,#f2c14e);line-height:1.15}.d-t .s{font-size:11px;color:var(--ink3);text-align:center}
      .d-t.gold{--dc:#f2c14e}.d-t.pink{--dc:#f472b6}.d-t.violet{--dc:#c084fc}.d-t.teal{--dc:#2dd4bf}.d-t.orange{--dc:#fb923c}.d-t.purple{--dc:#a78bfa}.d-t.blue{--dc:#60a5fa}.d-t.green{--dc:#34d399}
      .d-charts{display:grid;grid-template-columns:repeat(1,minmax(0,1fr));gap:8px}
      .d-c{background:linear-gradient(180deg,#1a1f2c,#12161f);border:1px solid #262d3d;border-radius:12px;padding:10px 12px}
      .d-ch{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#c9a24a;margin-bottom:8px}
      .d-bars{display:flex;align-items:flex-end;gap:8px;height:120px}
      .d-bar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:3px;min-width:0}
      .d-bar i{display:block;width:70%;max-width:36px;min-height:2px;border-radius:4px 4px 0 0;background:linear-gradient(180deg,#f2c14e,#b8860b)}.d-bar i.neg{background:#ef4444}
      .d-bar .bv{font-size:10px;color:var(--ink2);white-space:nowrap}.d-bar .bv.neg{color:#ff6b6b}.d-bar .bl{font-size:10px;color:var(--ink3)}
      html.fcpt-fill .d-grid{grid-template-columns:repeat(4,minmax(0,1fr))}html.fcpt-fill .d-charts{grid-template-columns:repeat(2,minmax(0,1fr))}
      @media (max-width:520px){html.fcpt-fill .d-grid{grid-template-columns:repeat(2,minmax(0,1fr))}html.fcpt-fill .d-charts{grid-template-columns:1fr}}
      @media (min-width:900px){.d-charts{grid-template-columns:repeat(2,minmax(0,1fr))}}
      html.fcpt-fill #fcpt-panel{position:fixed !important;left:var(--fcpt-fl,0px) !important;right:0 !important;top:0 !important;bottom:var(--fcpt-fb,0px) !important;width:auto !important;max-width:none !important;height:auto !important;max-height:none !important;border-radius:0 !important;transform:none !important;z-index:99990 !important}
      html.fcpt-fill .fcpt-resize{display:none}
      /* ===== Design „Stadion“ (Schwarz/Gold, wie Manager-Spiele) ===== */
      #fcpt-panel.ufm{--bg:#060708;--bg2:#0e0f12;--bg3:#16171b;--line:#2a2618;--gold:#f0bf2e;--ink:#f4f1e8;--ink2:#b7b2a3;--ink3:#857f6f;background:#060708}
      #fcpt-panel.ufm .fcpt-body{background:radial-gradient(1200px 500px at 70% -10%,rgba(240,191,46,.07),transparent 60%),#060708}
      #fcpt-panel.ufm .fcpt-head{background:linear-gradient(180deg,#121212,#060708);border-bottom:1px solid #2a2618}
      #fcpt-panel.ufm .fcpt-brand .t,#fcpt-panel.ufm .fcpt-vtitle{font-family:'Barlow Condensed','IBM Plex Sans',sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
      #fcpt-panel .u-shield{display:none;width:34px;height:40px;flex:none}
      #fcpt-panel.ufm .u-shield{display:block}#fcpt-panel.ufm .fcpt-logo{display:none}
      #fcpt-panel .u-prog,#fcpt-panel .u-bdg{display:none}
      #fcpt-panel.ufm .u-prog{display:flex;align-items:center;gap:8px;margin-top:4px;font:700 11px 'Barlow Condensed',sans-serif;letter-spacing:.08em;color:#cfc8b2;text-transform:uppercase}
      #fcpt-panel.ufm .u-prog i{display:block;width:150px;height:7px;border-radius:4px;background:#25221a;overflow:hidden;box-shadow:inset 0 0 0 1px #3a3420}
      #fcpt-panel.ufm .u-prog i b{display:block;height:100%;background:linear-gradient(90deg,#b8860b,#f0bf2e,#ffe58a);border-radius:4px}
      #fcpt-panel.ufm .u-prog i b.full{background:linear-gradient(90deg,#c0392b,#ff6b6b)}
      #fcpt-panel.ufm .u-prog em{font-style:normal;color:#f4f1e8}
      #fcpt-panel.ufm .u-bdg{display:flex;gap:6px;align-items:center}
      #fcpt-panel.ufm .u-bdg button{position:relative;width:36px;height:36px;border-radius:10px;border:1px solid #2f2a1b;background:#121212;color:#f4f1e8;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
      #fcpt-panel.ufm .u-bdg button b{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 4px;box-sizing:border-box;border-radius:9px;background:#f0bf2e;color:#111;font:800 11px/18px 'Barlow Condensed',sans-serif;text-align:center}
      #fcpt-panel.ufm .u-bdg button b.z{display:none}
      #fcpt-panel.ufm .fcpt-icons .ic{background:#121212;border:1px solid #2f2a1b;color:#f4f1e8}
      #fcpt-panel.ufm .fcpt-qs>*{background:#111 !important;border-color:#2f2a1b !important}
      /* Leiste: kräftige weiße Symbole, Großbuchstaben, aktiver Punkt in Gold mit Pfeilen */
      #fcpt-panel.ufm .fcpt-rail{background:linear-gradient(180deg,#0b0b0c,#000);border-color:#211e15}
      #fcpt-panel.ufm .fcpt-rail button{color:#f4f1e8}
      #fcpt-panel.ufm .fcpt-rail button svg{stroke-width:2.1}
      #fcpt-panel.ufm .fcpt-rail .lb{font-family:'Barlow Condensed',sans-serif !important;font-weight:800 !important;text-transform:uppercase;letter-spacing:.06em}
      #fcpt-panel.ufm .fcpt-rail button.on{background:linear-gradient(90deg,rgba(240,191,46,.18),rgba(240,191,46,0));color:#f0bf2e;box-shadow:none}
      #fcpt-panel.ufm .fcpt-rail .lg{background:transparent}
      .u-hero{display:none}
      #fcpt-panel.ufm .u-hero{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .u-tile{position:relative;overflow:hidden;min-height:150px;border-radius:6px;border:1px solid #2c2717;background:#0d0d0f;color:#f4f1e8;text-align:left;padding:14px 16px;cursor:pointer;display:flex;flex-direction:column;justify-content:flex-end;font:inherit;transition:transform .12s,border-color .12s,box-shadow .12s;isolation:isolate}
      .u-tile::before{content:'';position:absolute;inset:0;z-index:-2;background:var(--ub,linear-gradient(135deg,#1d2a1a,#0b0d0b 70%))}
      .u-tile::after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.07) 45%,transparent 55%),linear-gradient(0deg,rgba(0,0,0,.85) 0%,rgba(0,0,0,.15) 55%,transparent 100%)}
      .u-tile .art{position:absolute;right:-18px;top:-6px;z-index:-1;color:rgba(255,255,255,.11);transform:rotate(-8deg)}
      .u-tile .art svg{width:150px;height:150px;stroke-width:1.4}
      .u-tile .u-t{font:italic 800 26px/0.95 'Barlow Condensed','IBM Plex Sans',sans-serif;text-transform:uppercase;letter-spacing:.01em;text-shadow:0 2px 10px rgba(0,0,0,.6)}
      .u-tile .u-s{margin-top:6px;font:600 12px 'IBM Plex Sans',system-ui,sans-serif;color:#cfc8b2}
      .u-tile .u-c{position:absolute;top:10px;right:10px;display:flex;gap:6px}
      .u-tile .u-c span{min-width:34px;height:28px;padding:0 9px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;border-radius:4px;background:rgba(0,0,0,.65);border:1px solid rgba(240,191,46,.55);font:800 15px 'Barlow Condensed',sans-serif;color:#f4f1e8}
      .u-tile .u-c span.g{background:#f0bf2e;color:#141006;border-color:#f0bf2e;font-size:12px;letter-spacing:.08em}
      .u-tile .u-c span.r{border-color:#ff6b6b;color:#ffb3b3}
      .u-tile::marker{content:''}
      .u-tile .bar{position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg,#b8860b,#f0bf2e,transparent)}
      @media (hover:hover){.u-tile:hover{transform:translateY(-2px);border-color:#f0bf2e;box-shadow:0 10px 30px rgba(240,191,46,.12)}}
      .u-tile.buy{--ub:linear-gradient(135deg,#25401f 0%,#0f1a0d 55%,#060806 100%)}
      .u-tile.sell{--ub:linear-gradient(135deg,#1f2c45 0%,#0c1220 55%,#05070b 100%)}
      .u-tile.club{--ub:linear-gradient(135deg,#40241f 0%,#1a0d0b 55%,#080505 100%)}
      .u-tile.mkt{--ub:linear-gradient(135deg,#3d3214 0%,#18130a 55%,#070605 100%)}
      .u-tile.sbc{--ub:linear-gradient(135deg,#2e1f40 0%,#130d1a 55%,#060508 100%)}
      .u-tile.hist{--ub:linear-gradient(135deg,#143a38 0%,#0a1817 55%,#050807 100%)}
      #fcpt-panel.ufm .u-tile:nth-child(-n+2){grid-column:span 2}
      @media (max-width:600px){#fcpt-panel.ufm .u-bdg{display:none}#fcpt-panel.ufm .u-prog i{width:90px}.u-tile{min-height:118px;padding:12px}.u-tile .u-t{font-size:21px}#fcpt-panel.ufm .u-tile:nth-child(-n+2) .u-t{font-size:30px}.u-tile .art svg{width:110px;height:110px}.u-tile .u-s{font-size:11px}}
      html.fcpt-fill #fcpt-panel.ufm .fcpt-head{background:linear-gradient(180deg,#141414,#060708)}
      #fcpt-panel.ufm .fcpt-ver{background:#1e1a10;color:#d9b54a}
      #fcpt-panel.ufm .d-t,#fcpt-panel.ufm .d-c{background:linear-gradient(180deg,#141414,#0b0b0c);border-color:#2a2618;border-radius:6px}
      #fcpt-panel.ufm .d-t .l,#fcpt-panel.ufm .d-ch{font-family:'Barlow Condensed',sans-serif;font-size:12.5px;letter-spacing:.1em;color:#d9b54a;border-color:#2a2618}
      #fcpt-panel.ufm .h-sec{font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
      #fcpt-panel.ufm .h-btns .pri{background:linear-gradient(180deg,#ffd75e,#e0a800);color:#141006;border:0;font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:.06em;font-size:15px}
      @media (min-width:900px){
        html.fcpt-fill #fcpt-panel.ufm .u-hero{grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
        html.fcpt-fill #fcpt-panel.ufm .u-tile{min-height:250px;padding:20px 22px}
        html.fcpt-fill #fcpt-panel.ufm .u-tile:nth-child(-n+2){grid-column:span 2;min-height:290px}
        html.fcpt-fill #fcpt-panel.ufm .u-tile .u-t{font-size:clamp(26px,2.5vw,44px);overflow-wrap:anywhere}
        html.fcpt-fill #fcpt-panel.ufm .u-tile:nth-child(-n+2) .u-t{font-size:56px}
        html.fcpt-fill #fcpt-panel.ufm .u-tile .art svg{width:260px;height:260px}
        html.fcpt-fill #fcpt-panel.ufm .u-tile .u-s{font-size:14px}
        html.fcpt-fill #fcpt-panel.ufm .u-tile .u-c span{height:36px;min-width:44px;font-size:20px}
        html.fcpt-fill #fcpt-panel.ufm .fcpt-rail{width:250px;padding:18px 0;gap:2px;background:linear-gradient(180deg,#0b0b0c,#000);border-right:1px solid #211e15}
        html.fcpt-fill #fcpt-panel.ufm .fcpt-rail .lg{margin:0 20px 22px}
        html.fcpt-fill #fcpt-panel.ufm .fcpt-rail .lg::before{background:linear-gradient(160deg,#ffe58a,#f0bf2e 45%,#a87600);clip-path:polygon(50% 0,100% 14%,100% 60%,50% 100%,0 60%,0 14%);border-radius:0;width:38px;height:44px}
        html.fcpt-fill #fcpt-panel.ufm .fcpt-rail .lg::after{content:'FC27 TOOL';font:italic 800 24px 'Barlow Condensed',sans-serif;letter-spacing:.03em;color:#f4f1e8}
        html.fcpt-fill #fcpt-panel.ufm .fcpt-rail button{height:62px;padding:0 26px;gap:16px;border-radius:0;color:#f4f1e8}
        html.fcpt-fill #fcpt-panel.ufm .fcpt-rail button svg{width:30px;height:30px}
        html.fcpt-fill #fcpt-panel.ufm .fcpt-rail button .lb{font-size:21px;letter-spacing:.07em}
        html.fcpt-fill #fcpt-panel.ufm .fcpt-rail button.on{color:#f0bf2e;background:linear-gradient(90deg,rgba(240,191,46,.2),rgba(240,191,46,0) 85%);box-shadow:inset 4px 0 0 #f0bf2e}
        html.fcpt-fill #fcpt-panel.ufm .fcpt-rail button.on .lb::before{content:'‹‹';margin-right:8px;color:#f0bf2e}
        html.fcpt-fill #fcpt-panel.ufm .fcpt-rail button.on .lb::after{content:'››';margin-left:8px;color:#f0bf2e}
        html.fcpt-fill #fcpt-panel.ufm .fcpt-rail button .bd{top:18px;right:18px;background:#f0bf2e;color:#141006}
        html.fcpt-fill #fcpt-panel.ufm .fcpt-head{padding:16px 36px 12px}
        html.fcpt-fill #fcpt-panel.ufm .fcpt-brand .t{font-size:30px}
        html.fcpt-fill #fcpt-panel.ufm .u-shield{width:42px;height:50px}
        html.fcpt-fill #fcpt-panel.ufm .u-prog{font-size:13px}html.fcpt-fill #fcpt-panel.ufm .u-prog i{width:240px;height:9px}
        html.fcpt-fill #fcpt-panel.ufm .u-bdg button{width:42px;height:42px}
      }
      /* ===== Großansicht (Web-App-Modus) – großflächiges Layout ===== */
      .by-colL,.by-colR{display:contents}
      html.fcpt-fill #fcpt-panel{font-size:15px;box-shadow:none;border-left:0;background:#0a0e15}
      @media (min-width:900px){
        html.fcpt-fill #fcpt-panel .fcpt-rail{order:-1;width:228px;align-items:stretch;padding:18px 14px;gap:4px;background:linear-gradient(180deg,#0f1420,#0a0e15);border-right:1px solid #1a2236}
        html.fcpt-fill #fcpt-panel .fcpt-rail .lg{width:auto;height:auto;background:transparent;color:var(--ink);justify-content:flex-start;gap:10px;font:800 17px 'IBM Plex Sans',system-ui,sans-serif;margin:0 6px 18px}
        html.fcpt-fill #fcpt-panel .fcpt-rail .lg::before{content:'FC';display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#f9d85a,#d99a00);color:#15120a;font-size:15px}
        html.fcpt-fill #fcpt-panel .fcpt-rail .lg{font-size:0}
        html.fcpt-fill #fcpt-panel .fcpt-rail .lg::after{content:'FC27 Tool';font:800 17px 'IBM Plex Sans',system-ui,sans-serif;color:var(--ink)}
        html.fcpt-fill #fcpt-panel .fcpt-rail button{width:100%;height:46px;flex-direction:row;justify-content:flex-start;gap:12px;padding:0 14px;border-radius:12px;color:#9aa5b9}
        html.fcpt-fill #fcpt-panel .fcpt-rail button .lb{display:block;font:600 14px 'IBM Plex Sans',system-ui,sans-serif}
        html.fcpt-fill #fcpt-panel .fcpt-rail button .tip{display:none}
        html.fcpt-fill #fcpt-panel .fcpt-rail button.on{background:linear-gradient(90deg,rgba(242,193,78,.16),rgba(242,193,78,.02));color:var(--gold);box-shadow:inset 3px 0 0 var(--gold)}
        html.fcpt-fill #fcpt-panel .fcpt-rail button .bd{top:13px;right:12px;left:auto}
        html.fcpt-fill #fcpt-panel .fcpt-rail [data-rail="mini"]{display:none}
        html.fcpt-fill #fcpt-panel .fcpt-body{border-right:0}
        html.fcpt-fill #fcpt-panel .fcpt-head{padding:20px 36px 14px;background:linear-gradient(180deg,#121a2a,#0a0e15)}
        html.fcpt-fill #fcpt-panel .fcpt-brand .t{font-size:24px;font-weight:700}
        html.fcpt-fill #fcpt-panel .fcpt-qs{font-size:13px;gap:10px}
        html.fcpt-fill #fcpt-panel .fcpt-qs>*{background:#121a29;border:1px solid #1f2a40;border-radius:999px;padding:4px 12px}
        html.fcpt-fill #fcpt-panel .fcpt-home,html.fcpt-fill #fcpt-panel .fcpt-settings,html.fcpt-fill #fcpt-panel .fcpt-trade{padding:24px 36px 60px}
        html.fcpt-fill #fcpt-panel .fcpt-home>*,html.fcpt-fill #fcpt-panel .fcpt-settings>*{max-width:1500px;width:100%;margin-left:auto;margin-right:auto}
        html.fcpt-fill #fcpt-panel .fcpt-home{gap:18px}
        html.fcpt-fill .d-grid{gap:16px}.d-t{transition:transform .12s,border-color .12s}
        html.fcpt-fill .d-t{padding:16px 18px 18px;border-radius:16px}html.fcpt-fill .d-t[data-dgo]:hover{transform:translateY(-2px)}
        html.fcpt-fill .d-t .l{font-size:12px}html.fcpt-fill .d-t .v{font-size:38px}html.fcpt-fill .d-t .s{font-size:12.5px}
        html.fcpt-fill .d-charts{gap:16px}html.fcpt-fill .d-c{padding:16px 18px;border-radius:16px}html.fcpt-fill .d-bars{height:200px}html.fcpt-fill .d-bar .bv,html.fcpt-fill .d-bar .bl{font-size:12px}
        html.fcpt-fill #fcpt-panel .fcpt-sgroup{padding:18px 20px;border-radius:16px;gap:14px}
        html.fcpt-fill #fcpt-panel .fcpt-sgroup h4{font-size:16px}
        /* Transferliste: breite Tabelle */
        html.fcpt-fill #fcpt-panel .fcpt-list{padding:0 36px 90px}
        html.fcpt-fill #fcpt-panel .fcpt-list>*{max-width:1500px;width:100%;margin-left:auto;margin-right:auto}
        html.fcpt-fill .tr-h,html.fcpt-fill .tr-row{grid-template-columns:44px minmax(0,1fr) 130px 130px 130px;gap:14px;padding:0 18px}
        html.fcpt-fill .tr-row{min-height:52px;font-size:15px}html.fcpt-fill .tr-h{font-size:11.5px;padding-top:14px;padding-bottom:10px}
        html.fcpt-fill #fcpt-panel .fcpt-sum,html.fcpt-fill #fcpt-panel .fcpt-toolbar{padding-left:36px;padding-right:36px}
        /* Kaufen & Bieten: links Einstellungen, rechts Treffer */
        html.fcpt-fill #fcpt-panel.v-buy .fcpt-buy{padding:24px 36px 0;gap:0}
        html.fcpt-fill .by-r{padding:12px 16px}html.fcpt-fill .by-n .nm{font-size:16px}
      }
      @media (min-width:1150px){
        html.fcpt-fill #fcpt-panel.v-buy .fcpt-buy{display:grid !important;grid-template-columns:minmax(400px,540px) minmax(0,1fr);grid-template-rows:1fr auto;column-gap:28px;align-items:start}
        html.fcpt-fill .by-colL,html.fcpt-fill .by-colR{display:flex;flex-direction:column;gap:14px;min-width:0;padding-bottom:20px}
        html.fcpt-fill .by-colR:empty{display:none}
        html.fcpt-fill .fcpt-buy>.by-bar{grid-column:1 / -1}
        html.fcpt-fill .by-colR .by-list{max-height:none}
        html.fcpt-fill #fcpt-panel .fcpt-subpane{column-count:2;column-gap:22px}
        html.fcpt-fill #fcpt-panel .fcpt-subpane>*{break-inside:avoid;margin-bottom:18px;display:block}
      }
      @media (min-width:1700px){html.fcpt-fill #fcpt-panel .fcpt-subpane{column-count:3}}
      .fcpt-navbtn{position:relative}.fcpt-navbtn .fcpt-navic{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#f9d85a,#e0a800);color:#1a1300;font:800 11px system-ui,sans-serif}
      .fcpt-navbtn .fcpt-navl{display:block;font-size:11px;margin-top:3px}
      .fcpt-navbtn.fcpt-on .fcpt-navic{box-shadow:0 0 0 2px #fff}
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
      /* ---------- PC-Design: größere Schrift, ruhigere Karten, beschriftete Leiste ---------- */
      .fcpt-rail .lb{display:none}
      @media (min-width: 701px){
        #fcpt-panel{font-size:14.5px}
        .fcpt-rail{width:76px}
        .fcpt-rail button{width:64px;height:58px;flex-direction:column;gap:4px;border-radius:14px}
        .fcpt-rail .lb{display:block;font:600 10.5px/1 system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:.01em}
        .fcpt-rail button .tip{display:none}
        #fcpt-panel .fcpt-sgroup{border-radius:16px;padding:14px 16px;gap:12px;background:#121a29;border-color:#1f2a40}
        #fcpt-panel .fcpt-sgroup > h4,#fcpt-panel .fcpt-sgroup > summary h4{font-size:15px;letter-spacing:0;text-transform:none;color:var(--ink);font-weight:700}
        #fcpt-panel .fcpt-bigbtn{min-height:44px;border-radius:12px;font-size:15px;font-weight:700}
        #fcpt-panel .fcpt-smallbtn{min-height:34px;border-radius:9px}
        #fcpt-panel .fcpt-set{min-height:40px}
        #fcpt-panel .fcpt-set > span{font-size:14px}
        #fcpt-panel .fcpt-set small{font-size:12px}
        #fcpt-panel .fcpt-stand{font-size:12.5px}
        .tr-row{min-height:46px}
      }
      /* Aufklappbare Bereiche + Erklärtexte hinter ⓘ */
      #fcpt-panel .fcpt-sgroup.sg-on > h4{cursor:pointer;display:flex;align-items:center;gap:8px;user-select:none}
      #fcpt-panel .fcpt-sgroup.sg-on > h4 .sg-chev{margin-left:auto;transition:transform .15s;color:var(--ink3);font-size:12px}
      #fcpt-panel .fcpt-sgroup.sg-c > h4 .sg-chev{transform:rotate(-90deg)}
      #fcpt-panel .fcpt-sgroup.sg-c > :not(h4){display:none !important}
      #fcpt-panel .fcpt-sgroup.sg-c{padding-bottom:12px}
      #fcpt-panel .fcpt-sgroup .sg-i{width:22px;height:22px;border-radius:11px;border:1px solid #33405e;background:transparent;color:var(--ink3);font:700 12px/1 system-ui,sans-serif;cursor:pointer;padding:0;display:inline-flex;align-items:center;justify-content:center}
      #fcpt-panel .fcpt-sgroup .sg-i.on{background:#24314d;color:var(--ink)}
      #fcpt-panel:not(.help-all) .fcpt-sgroup.sg-on:not(.sg-help) > .note{display:none}
      #fcpt-panel .sg-sum{font-size:12px;font-weight:600;color:var(--ink2)}
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
        /* Handy: ganze Seite scrollt als Einheit, statt Kopf fest + winziger Listenbereich */
        #fcpt-panel .fcpt-body{overflow-y:auto;-webkit-overflow-scrolling:touch}
        #fcpt-panel .fcpt-list{flex:none !important;overflow:visible !important;max-height:none !important}
        #fcpt-panel .fcpt-brand{min-width:0;overflow:hidden}
        #fcpt-panel .fcpt-brand .t{font-size:19px !important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #fcpt-panel .fcpt-brand .fcpt-ver{display:none}
        #fcpt-panel .fcpt-icons{flex:none}
        #fcpt-panel .fcpt-top{flex-wrap:nowrap;gap:8px}
        html.fcpt-fill #fcpt-panel.fcpt-ios .fcpt-rail{padding-bottom:6px}
        #fcpt-panel .fcpt-rail{position:relative;z-index:2;background:linear-gradient(180deg,var(--t1,#0b0b0c),var(--t0,#000)) !important}
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
    const SHORT = { home: 'Start', list: 'Liste', buy: 'Kaufen', 'trade:markt': 'Markt', 'trade:verein': 'Verein', hist: 'Historie', sbc: 'SBC' };
    rail.innerHTML = `<div class="lg" aria-hidden="true">FC</div>` +
      R.map(([k, ic, t]) => `<button data-rail="${k}" aria-label="${t}">${svg(ic)}<span class="bd"></span><span class="lb">${SHORT[k] || t}</span><span class="tip">${t}</span></button>`).join('') +
      `<div class="sp"></div>
       <button data-rail="settings" aria-label="Einstellungen">${svg('gear')}<span class="lb">Optionen</span><span class="tip">Einstellungen</span></button>
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
    // Design „Stadion“: Wappen, goldener Belegungsbalken, Zähler-Abzeichen
    panel.classList.toggle('ufm', settings.ufm !== false);
    const logoEl = panel.querySelector('.fcpt-logo');
    if (logoEl) logoEl.insertAdjacentHTML('afterend', '<svg class="u-shield" viewBox="0 0 34 40" aria-hidden="true"><defs><linearGradient id="fcptSg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe58a"/><stop offset=".5" stop-color="#f0bf2e"/><stop offset="1" stop-color="#9a6a00"/></linearGradient></defs><path d="M17 1l15 5v13c0 10-7 17-15 20C9 36 2 29 2 19V6z" fill="url(#fcptSg)" stroke="#2a2006" stroke-width="1.5"/><path d="M17 5l11 3.6V19c0 7.6-5 13-11 15.6C11 32 6 26.6 6 19V8.6z" fill="#0b0b0c"/><text x="17" y="24" text-anchor="middle" font-family="Barlow Condensed,sans-serif" font-weight="800" font-style="italic" font-size="13" fill="#f0bf2e">27</text></svg>');
    if (tEl) tEl.insertAdjacentHTML('afterend', '<div class="u-prog" title="Belegung der Transferliste"><span>Transferliste</span><i><b></b></i><em class="num">0/100</em></div>');
    const icons = panel.querySelector('.fcpt-icons');
    if (icons) icons.insertAdjacentHTML('afterbegin', `<div class="u-bdg"><button data-ub="home" aria-label="Alarme">${svg('star', 18)}<b class="z">0</b></button><button data-ub="trade:verein" aria-label="Nicht zugewiesene Items">${svg('list', 18)}<b class="z">0</b></button></div>`);
    panel.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('.u-bdg [data-ub]'); if (!b) return; e.stopPropagation(); const g = b.dataset.ub; if (g.startsWith('trade:')) { settings.tradeSub = g.slice(6); saveSettings(); go('trade:markt'); setTimeout(() => { const t = panel.querySelector(`[data-sub="${g.slice(6)}"]`); if (t) t.click(); }, 50); } else go(g); }, true);
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
        if (!w.paused && WATCH.hit(w)) A.push({ k: 'g', ic: 'star', t: `${w.rating ?? ''} ${w.name}: Ziel erreicht`, s: `Futbin ${fmt(w.last)} · Ziel ${w.dir === 'above' ? '≥' : '≤'} ${fmt(w.target)}`, go: 'trade:markt' });
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
      try {
        const n = items.length, pb = panel.querySelector('.u-prog b'), pe = panel.querySelector('.u-prog em');
        if (pb) { pb.style.width = Math.min(100, n) + '%'; pb.classList.toggle('full', n >= 95); }
        if (pe) pe.textContent = `${n}/100`;
        const setB = (k, v) => { const b = panel.querySelector(`.u-bdg [data-ub="${k}"] b`); if (b) { b.textContent = v > 99 ? '99+' : String(v || 0); b.classList.toggle('z', !v); } };
        setB('home', alarms().length);
        setB('trade:verein', NEWITEMS.count() || 0);
      } catch (e) { /* */ }
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
      // ---- Übersicht im Kachel-Stil ----
      const today = sumSince(d0.getTime());
      const dl = settings.dayLog[dayKey()] || { s: 0, b: 0, sp: 0 };
      const tg = typeof TARGETS !== 'undefined' && TARGETS.summary ? TARGETS.summary() : null;
      const coins = SBCUI.userCoins();
      const un = NEWITEMS.count();
      const tile = (cls, l, v, s, go2) => `<div class="d-t ${cls}"${go2 ? ` data-dgo="${go2}" role="button" tabindex="0"` : ''}><span class="l">${l}</span><span class="v num">${v}</span><span class="s">${s || '&nbsp;'}</span></div>`;
      // Profit pro Tag (7 Tage) und pro Monat (3 Monate) aus der Historie
      const days = [];
      for (let i = 6; i >= 0; i--) { const f = d0.getTime() - i * 864e5; const rows = history.filter((h) => h.t >= f && h.t < f + 864e5); days.push({ l: new Date(f).toLocaleDateString('de-DE', { weekday: 'short' }), v: rows.reduce((a, h) => a + (h.profit || 0), 0) }); }
      const months = [];
      for (let i = 2; i >= 0; i--) { const m = new Date(d0.getFullYear(), d0.getMonth() - i, 1), m2 = new Date(d0.getFullYear(), d0.getMonth() - i + 1, 1); const rows = history.filter((h) => h.t >= m.getTime() && h.t < m2.getTime()); months.push({ l: m.toLocaleDateString('de-DE', { month: 'short' }), v: rows.reduce((a, h) => a + (h.profit || 0), 0) }); }
      const bars = (arr) => {
        const max = Math.max(1, ...arr.map((x) => Math.abs(x.v)));
        return `<div class="d-bars">${arr.map((x) => `<div class="d-bar" title="${esc(x.l)}: ${signed(x.v)}"><span class="bv ${x.v < 0 ? 'neg' : ''}">${x.v ? (Math.abs(x.v) >= 1e6 ? (x.v / 1e6).toFixed(1).replace('.', ',') + ' M' : Math.abs(x.v) >= 1000 ? Math.round(x.v / 1000) + ' k' : x.v) : ''}</span><i class="${x.v < 0 ? 'neg' : ''}" style="height:${Math.round((Math.abs(x.v) / max) * 100)}%"></i><span class="bl">${esc(x.l)}</span></div>`).join('')}</div>`;
      };
      const nAct = items.filter((p) => p.active).length, nExp = items.filter((p) => p.expired).length;
      const hero = (cls, go2, ic, title, sub, cnt) => `<button class="u-tile ${cls}" data-dgo="${go2}"><span class="art">${svg(ic, 150)}</span><span class="u-c">${cnt}</span><span class="u-t">${title}</span><span class="u-s">${sub}</span><i class="bar"></i></button>`;
      const heroHtml = `<div class="u-hero">
          ${hero('buy', 'buy', 'buy', 'Spieler<br>kaufen', `${fmt(dl.s || 0)} Suchen heute${dl.sp ? ` · ${fmt(dl.sp)} ausgegeben` : ''}`, `<span title="heute gekauft">${fmt(dl.b || 0)}</span>${tg && tg.loaded && tg.outbid ? `<span class="r" title="überboten">${tg.outbid}</span>` : ''}`)}
          ${hero('sell', 'list', 'list', 'Spieler<br>verkaufen', `${nExp} abgelaufen · ${sold.length} verkauft${sold.length ? ` (${signed(soldP)})` : ''}`, `<span title="Belegung">${items.length}/100</span>${nAct ? `<span class="g">${nAct} AKTIV</span>` : ''}`)}
          ${hero('club', 'trade:verein', 'club', 'Verein &amp;<br>Futter', un ? 'Neue Items jetzt sortieren' : 'Alles sortiert', un ? `<span>${fmt(un)}</span>` : '')}
          ${hero('mkt', 'trade:markt', 'market', 'Markt &amp;<br>Icons', esc(TIMING.info().title || 'Marktlage'), '')}
          ${hero('sbc', 'sbc', 'sbc', 'SBC<br>lösen', 'SBC in der Web App öffnen – Solver startet hier', '')}
          ${hero('hist', 'hist', 'hist', 'Historie &amp;<br>Statistik', `Heute ${signed(today.profit)} · 7 Tage ${signed(wk)}`, '')}
        </div>`;
      home.innerHTML = `${heroHtml}
        <div class="d-grid">
          ${tile('gold', 'Profit heute', `<span class="${today.profit >= 0 ? 'fcpt-pos-v' : 'fcpt-neg-v'}">${signed(today.profit)}</span>`, `${today.n} verkauft`, 'hist')}
          ${tile('pink', 'Gekauft heute', fmt(dl.b || 0), dl.sp ? `${fmt(dl.sp)} Münzen ausgegeben` : 'per Snipe', 'buy')}
          ${tile('violet', 'Transferziele', tg && tg.loaded ? fmt(tg.lead + tg.outbid) : '–', tg && tg.loaded ? `${tg.lead} führend · ${tg.outbid} überboten` : 'in „Meine Gebote“ laden', 'buy')}
          ${tile('teal', 'Münzen', coins != null ? fmt(coins) : '–', tg && tg.tied ? `${fmt(tg.tied)} in Geboten` : '')}
          ${tile('orange', 'Suchen heute', fmt(dl.s || 0), (() => { try { const r = GUARD.stats(); return `${r.sMin}/Min · ${r.sHour}/Std`; } catch (e) { return ''; } })(), 'buy')}
          ${tile('purple', 'Nicht zugewiesen', un != null ? fmt(un) : '–', un ? 'jetzt sortieren' : 'alles sortiert', 'trade:verein')}
          ${tile('blue', 'Transferliste', fmt(items.length), `${open.length} offen${listVal ? ` · ${fmt(listVal)}` : ''}`, 'list')}
          ${tile('green', 'Verkauft (Liste)', sold.length ? signed(soldP) : '–', `${sold.length} Karten · 7 Tage ${signed(wk)}`, 'list')}
        </div>
        <div class="d-charts">
          <div class="d-c"><div class="d-ch">Profit – letzte 7 Tage</div>${bars(days)}</div>
          <div class="d-c"><div class="d-ch">Profit – letzte 3 Monate</div>${bars(months)}</div>
        </div>
        ${TIMING.html()}
        <div class="h-sec"><span>Alarme</span><span>${A.length}</span></div>
        ${A.length ? `<div class="h-al">${A.map((a, i) => `<button data-al="${i}"><span class="ic ${a.k}">${svg(a.ic, 16)}</span><span class="tx"><b>${esc(a.t)}</b><span>${esc(a.s)}</span></span><span class="cv">${svg('chev', 16)}</span></button>`).join('')}</div>`
          : `<div class="h-empty">${items.length ? 'Keine Alarme. Watchlist und Verkaufsziele findest du unter Markt und in der Transferliste.' : 'Noch keine Daten – lade deine Transferliste.'}</div>`}
        <div class="h-btns"><button class="pri" data-act="refresh">Transferliste laden</button><button data-act="reload">Preise neu holen</button></div>`;
      home.querySelectorAll('[data-al]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); go(A[+b.dataset.al].go); }));
      home.querySelectorAll('[data-dgo]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); const g = b.dataset.dgo; if (g.startsWith('trade:')) { settings.tradeSub = g.slice(6); saveSettings(); go('trade:markt'); setTimeout(() => { const t = panel.querySelector(`[data-sub="${g.slice(6)}"]`); if (t) t.click(); }, 50); } else go(g); }));
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
    // Gleiche Spieler (gleiche Karte) in einer Leiste zusammenfassen – aufklappen zeigt die einzelnen Karten
    if (settings.groupSame === undefined) settings.groupSame = true;
    const grpKey = (p) => (p.sold ? null : `${p.isCons ? 'c' : 'p'}${p.resourceId}`);
    if (settings.listFilter === undefined) settings.listFilter = 'all';
    const LF = { all: ['Alle', () => true], active: ['Aktiv', (p) => p.active], expired: ['Abgelaufen', (p) => p.expired], open: ['Nicht gelistet', (p) => !p.sold && !p.active && !p.expired], sold: ['Verkauft', (p) => p.sold] };
    function filterChips() {
      return Object.entries(LF).map(([k, [l, f]]) => { const n = items.filter(f).length; return `<button data-lf2="${k}" class="${settings.listFilter === k ? 'on' : ''}" ${n || k === 'all' ? '' : 'disabled'}>${l}<span>${n}</span></button>`; }).join('');
    }
    // ---------- Spalten-Ansicht (Aktiv · Abgelaufen · Nicht gelistet · Verkauft) ----------
    if (settings.listView === undefined) settings.listView = 'kanban';
    const KCOLS = [['active', 'Aktiv', '#5b9cff'], ['expired', 'Abgelaufen', '#ffae5c'], ['open', 'Nicht gelistet', '#94a3b8'], ['sold', 'Verkauft', '#3dd68c']];
    function kCard(g, k) {
      const p = g[0], key = g.length > 1 ? `g:${k}` : String(p.itemId ?? p.resourceId);
      const m = p.isPlayer ? marketPrice(p.resourceId) : CONS.price(p);
      const pfs = g.map((x) => profitValue(x, m)).filter((v) => v != null);
      const pf = pfs.length ? pfs.reduce((a, b) => a + b, 0) : null;
      const bins = g.map((x) => (x.sold ? x.soldFor : x.buyNow)).filter(Boolean);
      const lo = bins.length ? Math.min(...bins) : null;
      const nExp = p.expired ? Math.max(...g.map((x) => expiredCount(x.itemId) || 0)) : 0;
      const sub = p.sold ? `gekauft ${p.bought ? fmt(p.bought) : 'gezogen'}` : p.active ? `endet in ${fmtTime(Math.min(...g.map((x) => x.expires || 0)))}` : `Markt ${m ? fmt(m) : '…'}${nExp >= 2 ? ` · ${nExp}× abgel.` : ''}`;
      const fx = !p.sold && !p.active && settings.listPresets && settings.listPresets[p.resourceId];
      const open = openRows.has(key);
      return `<div class="tr kc ${p.sold ? 'sold' : p.expired ? 'expired' : p.active ? 'active' : ''}${nExp >= 2 ? ' lieg' : ''}${open ? ' open' : ''}" data-row="${esc(key)}" data-rid="${p.resourceId}"${g.length > 1 ? ` data-grp="${esc(grpKey(p))}"` : ''}>
        <button class="tr-row kc-b" data-trow="${esc(key)}" aria-expanded="${open}">
          <span class="num ovr">${p.isCons ? '🧪' : esc(p.rating ?? '')}</span>
          <span class="kc-x"><b class="nm">${esc(p.name)}${g.length > 1 ? ` <span class="gc">${g.length}×</span>` : ''}</b><small>${esc(sub)}${fx ? ` · <em class="fx">fest ${fmt(fx.bin)}</em>` : ''}</small></span>
          <span class="kc-r"><b class="num">${lo == null ? '–' : fmt(lo)}</b><span class="num" data-pf>${pf == null ? '<span class="fcpt-muted">–</span>' : `<span class="${profitCls(pf)}">${signed(pf)}</span>`}</span><span class="num mk" data-mk hidden>${m ? fmt(m) : ''}</span></span>
        </button>
        <div class="tr-det">${g.length > 1 ? g.map(rowHtml).join('') : cardHtml(p) + LIST.fixHtml(p)}</div>
      </div>`;
    }
    function kanbanHtml(sorted) {
      const show = settings.listFilter === 'all' ? KCOLS : KCOLS.filter((c) => c[0] === settings.listFilter);
      return `<div class="kan k${show.length}">${show.map(([k, t, col]) => {
        const L = sorted.filter(LF[k][1]);
        const groups = new Map(), order = [];
        for (const p of L) {
          const gk = settings.groupSame && !p.sold ? grpKey(p) : `i${p.itemId}`;
          if (!groups.has(gk)) { groups.set(gk, []); order.push(gk); }
          groups.get(gk).push(p);
        }
        const sum = L.reduce((a, p) => { const v = profitValue(p, p.isPlayer ? marketPrice(p.resourceId) : CONS.price(p)); return a + (v || 0); }, 0);
        return `<section class="kan-c" style="--kc:${col}"><h3><span>${t}</span><em>${L.length}</em></h3>${L.length ? `<div class="kan-s">${k === 'sold' ? 'Gewinn' : 'Profit'} <b class="${profitCls(sum)}">${signed(sum)}</b></div>` : ''}
          <div class="kan-l">${order.map((gk) => kCard(groups.get(gk), gk)).join('') || '<div class="kan-e">–</div>'}</div></section>`;
      }).join('')}</div>`;
    }
    function listHtml(sorted) {
      const chips = panel.querySelector('.lf-chips'); if (chips) chips.innerHTML = filterChips();
      if (settings.listView === 'kanban' && items.length) return kanbanHtml(sorted);
      const lf = (LF[settings.listFilter] || LF.all)[1];
      sorted = sorted.filter(lf);
      if (!sorted.length) return `<div class="lf-empty">${items.length ? `Keine Karten im Filter „${(LF[settings.listFilter] || LF.all)[0]}“.` : 'Transferliste ist leer – oben ↻ zum Laden.'}</div>`;
      if (!settings.groupSame) return sorted.map(rowHtml).join('');
      const groups = new Map(), order = [];
      for (const p of sorted) {
        const k = grpKey(p) || `i${p.itemId}`;
        if (!groups.has(k)) { groups.set(k, []); order.push(k); }
        groups.get(k).push(p);
      }
      return order.map((k) => { const g = groups.get(k); return g.length === 1 ? rowHtml(g[0]) : groupHtml(k, g); }).join('');
    }
    function grpCells(g) {
      const p = g[0];
      const m = p.isPlayer ? marketPrice(p.resourceId) : CONS.price(p);
      const pfs = g.map((x) => profitValue(x, m)).filter((v) => v != null);
      const pf = pfs.length ? pfs.reduce((a, b) => a + b, 0) : null;
      return {
        mk: m ? fmt(m) : p.isPlayer ? '…' : '–',
        pf: pf == null ? '<span class="fcpt-muted">–</span>' : `<span class="${profitCls(pf)}">${signed(pf)}</span>`,
      };
    }
    function groupHtml(k, g) {
      const p = g[0], key = `g:${k}`;
      const bins = g.map((x) => x.buyNow).filter(Boolean);
      const lo = bins.length ? Math.min(...bins) : null, hi = bins.length ? Math.max(...bins) : null;
      const nAct = g.filter((x) => x.active).length, nExp = g.filter((x) => x.expired).length, nOpen = g.length - nAct - nExp;
      const st = [nAct ? `${nAct} aktiv` : '', nExp ? `${nExp} abgel.` : '', nOpen ? `${nOpen} offen` : ''].filter(Boolean).join(' · ');
      const lieg = g.some((x) => x.expired && expiredCount(x.itemId) >= 2);
      const cls = nExp && !nAct ? 'expired' : nAct && !nExp ? 'active' : '';
      const c = grpCells(g);
      const fx = settings.listPresets && settings.listPresets[p.resourceId];
      return `<div class="tr grp ${cls}${lieg ? ' lieg' : ''}${openRows.has(key) ? ' open' : ''}" data-row="${esc(key)}" data-rid="${p.resourceId}" data-grp="${esc(k)}">
        <button class="tr-row" data-trow="${esc(key)}" aria-expanded="${openRows.has(key)}" title="${g.length} gleiche Karten – antippen zum Aufklappen">
          <span class="num ovr">${p.isCons ? '🧪' : esc(p.rating ?? '')}</span>
          <span class="nm"><span class="gc">${g.length}×</span>${esc(p.name)}<em class="st">${esc(st)}</em>${fx && nOpen + nExp ? `<em class="st fx">fest ${fmt(fx.bin)}</em>` : ''}</span>
          <span class="num r" title="${lo != null && lo !== hi ? `${fmt(lo)} bis ${fmt(hi)}` : ''}">${lo == null ? '–' : lo === hi ? fmt(lo) : `<small>ab </small>${fmt(lo)}`}</span>
          <span class="num r mk" data-mk>${c.mk}</span>
          <span class="num r" data-pf>${c.pf}</span>
        </button>
        <div class="tr-det grp-det">${g.map(rowHtml).join('')}</div>
      </div>`;
    }
    const headHtml = () => (settings.listView === 'kanban' && items.length ? '' : headHtml0());
    const headHtml0 = () => '<div class="tr-h"><span>OVR</span><span>Spieler</span><span>Sofortk.</span><span>Markt</span><span>Profit</span></div>';
    function updateRow(rid) {
      panel.querySelectorAll(`.tr[data-rid="${rid}"]`).forEach((r) => {
        if (r.dataset.grp) {
          const g = items.filter((x) => grpKey(x) === r.dataset.grp);
          if (!g.length) return;
          const c = grpCells(g);
          const mk = r.querySelector(':scope>.tr-row [data-mk]'), pf = r.querySelector(':scope>.tr-row [data-pf]');
          if (mk) mk.textContent = c.mk;
          if (pf) pf.innerHTML = c.pf;
          return;
        }
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
      const pcRow = document.createElement('div');
      pcRow.className = 'fcpt-set';
      pcRow.innerHTML = '<span>Neben der Web App andocken (PC)<small>Tool rechts, Web App daneben – nichts wird verdeckt. Breite mit dem Rand links am Tool ziehen.</small></span><select data-uib="dock"><option value="auto">Automatisch (großer Bildschirm)</option><option value="on">Immer</option><option value="off">Aus (Tool liegt über der Web App)</option></select>';
      grp.appendChild(pcRow);
      const hRow = document.createElement('div');
      hRow.className = 'fcpt-set';
      hRow.innerHTML = '<span>Erklärtexte immer anzeigen<small>Aus = nur über das kleine „i“ neben der Überschrift</small></span><input type="checkbox" class="fcpt-sw" data-uib="help">';
      grp.appendChild(hRow);
      const hc = hRow.querySelector('input');
      hc.checked = !!settings.helpAll;
      hc.addEventListener('change', (e) => { e.stopPropagation(); settings.helpAll = hc.checked; saveSettings(); panel.classList.toggle('help-all', settings.helpAll); });
      const eRow = document.createElement('div');
      eRow.className = 'fcpt-set';
      eRow.innerHTML = '<span>Menüpunkt „FC27 Tool“ in der Web App<small>Eigener Eintrag in EAs Navigation – das Tool öffnet sich dann direkt in der Inhaltsfläche der Web App</small></span><input type="checkbox" class="fcpt-sw" data-uib="embed">';
      grp.appendChild(eRow);
      const uRow = document.createElement('div');
      uRow.className = 'fcpt-set';
      uRow.innerHTML = '<span>Design „Stadion“<small>Schwarz/Gold mit großen Kacheln und kräftiger Menüleiste. Aus = bisheriges blaues Design</small></span><input type="checkbox" class="fcpt-sw" data-uib="ufm">';
      grp.appendChild(uRow);
      const uc = uRow.querySelector('input');
      uc.checked = settings.ufm !== false;
      uc.addEventListener('change', (e) => { e.stopPropagation(); settings.ufm = uc.checked; saveSettings(); panel.classList.toggle('ufm', settings.ufm); try { applyEaSkin(); } catch (x) { /* */ } quick(); if (cur === 'home') renderHome(); });
      const lRow = document.createElement('div');
      lRow.className = 'fcpt-set';
      lRow.innerHTML = '<span>EA-Layout „Manager“<small>Wie Manager-Spiele: Menü links mit großen Symbolen (auch am Handy), goldene Rahmen, Wappen und Transferlisten-Balken in der Kopfzeile</small></span><input type="checkbox" class="fcpt-sw" data-uib="ealay">';
      grp.appendChild(lRow);
      const lc = lRow.querySelector('input');
      lc.checked = settings.eaLayout !== false;
      lc.addEventListener('change', (e) => { e.stopPropagation(); settings.eaLayout = lc.checked; saveSettings(); try { layoutEa(); } catch (x) { /* */ } });
      const sRow = document.createElement('div');
      sRow.className = 'fcpt-set';
      sRow.innerHTML = '<span>„Stadion“ auch für EAs Web App<small>Färbt EAs Menü, Kopfzeile, Kacheln, Listen und Hauptknöpfe schwarz/gold. Nur Optik – Bedienung bleibt gleich</small></span><input type="checkbox" class="fcpt-sw" data-uib="easkin">';
      grp.appendChild(sRow);
      const sc = sRow.querySelector('input');
      sc.checked = settings.eaSkin !== false;
      sc.addEventListener('change', (e) => { e.stopPropagation(); settings.eaSkin = sc.checked; saveSettings(); try { applyEaSkin(); } catch (x) { /* */ } });
      const tRow = document.createElement('div');
      tRow.className = 'fcpt-set';
      tRow.innerHTML = '<span>Helligkeit des Designs<small>Für Tool und EAs Web App. Dunkel = Schwarz, Mittel = Graphit, Hell = helles Grau</small></span><select data-uib="tone"><option value="dark">Dunkel</option><option value="mid">Mittel</option><option value="light">Hell</option></select>';
      grp.appendChild(tRow);
      const ts = tRow.querySelector('select');
      ts.value = settings.uiTone;
      ts.addEventListener('change', (e) => { e.stopPropagation(); settings.uiTone = ts.value; saveSettings(); applyTone(); try { applyEaSkin(); } catch (x) { /* */ } });
      const fRow = document.createElement('div');
      fRow.className = 'fcpt-set';
      fRow.innerHTML = '<span>Schriftgröße in EAs Web App<small>Kleiner = mehr auf einen Blick. Gilt nur, wenn „Stadion“ für EA an ist</small></span><select data-uib="eafont"><option value="1">Normal (100 %)</option><option value="0.95">Etwas kleiner (95 %)</option><option value="0.9">Kompakt (90 %)</option><option value="0.85">Sehr kompakt (85 %)</option></select>';
      grp.appendChild(fRow);
      const fs = fRow.querySelector('select');
      fs.value = String(settings.eaFont);
      fs.addEventListener('change', (e) => { e.stopPropagation(); settings.eaFont = parseFloat(fs.value) || 1; saveSettings(); try { applyEaSkin(); } catch (x) { /* */ } });
      const cRow = document.createElement('div');
      cRow.className = 'fcpt-set';
      cRow.innerHTML = '<span>Kompakte Spielerliste im Verein<small>Verein → Spieler: kleinere Zeilen und mehrere Spalten nebeneinander, damit mehr Spieler auf einmal sichtbar sind</small></span><input type="checkbox" class="fcpt-sw" data-uib="clubc">';
      grp.appendChild(cRow);
      const cc = cRow.querySelector('input');
      cc.checked = settings.clubCompact !== false;
      cc.addEventListener('change', (e) => { e.stopPropagation(); settings.clubCompact = cc.checked; saveSettings(); try { markClubList(); } catch (x) { /* */ } });
      const bRow = document.createElement('div');
      bRow.className = 'fcpt-set';
      bRow.innerHTML = '<span>Großansicht<small>Tool füllt die ganze Inhaltsfläche der Web App (Menü links/unten bleibt sichtbar). Aus = schmales Seitenfenster wie früher</small></span><input type="checkbox" class="fcpt-sw" data-uib="big">';
      grp.appendChild(bRow);
      const bc = bRow.querySelector('input');
      bc.checked = settings.bigView !== false;
      bc.addEventListener('change', (e) => { e.stopPropagation(); settings.bigView = bc.checked; saveSettings(); setFill(bc.checked, { keepOpen: true }); });
      const ec = eRow.querySelector('input');
      ec.checked = settings.embed !== false;
      ec.addEventListener('change', (e) => { e.stopPropagation(); settings.embed = ec.checked; saveSettings(); injectNav(); });
      const ds = pcRow.querySelector('select');
      ds.value = settings.dock;
      ds.addEventListener('change', (e) => { e.stopPropagation(); settings.dock = ds.value; saveSettings(); applyDock(); });
    }

    // ---------- Bereiche aufklappbar machen (Zustand wird gemerkt) ----------
    if (!settings.sgCollapsed || typeof settings.sgCollapsed !== 'object') settings.sgCollapsed = {};
    if (settings.helpAll === undefined) settings.helpAll = false;
    const sgKey = (h) => (h.textContent || '').replace(/[\d.,()·]+/g, '').replace(/[^\p{L}\s-]/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
    function enhanceGroups(root) {
      root.querySelectorAll('.fcpt-sgroup').forEach((g) => {
        if (g.tagName === 'DETAILS') return;
        const h = g.querySelector(':scope > h4');
        if (!h || h.querySelector('.sg-chev')) return;
        const key = sgKey(h);
        if (!key) return;
        g.classList.add('sg-on');
        g.classList.toggle('sg-c', !!settings.sgCollapsed[key]);
        if (g.querySelector(':scope > .note')) {
          const i = document.createElement('button');
          i.className = 'sg-i'; i.textContent = 'i'; i.title = 'Erklärung anzeigen'; i.setAttribute('aria-label', 'Erklärung anzeigen');
          h.appendChild(i);
          i.addEventListener('click', (e) => { e.stopPropagation(); g.classList.toggle('sg-help'); i.classList.toggle('on', g.classList.contains('sg-help')); });
        }
        const c = document.createElement('span');
        c.className = 'sg-chev'; c.textContent = '▾'; c.setAttribute('aria-hidden', 'true');
        h.appendChild(c);
        h.setAttribute('role', 'button'); h.tabIndex = 0;
        const tog = (e) => { e.stopPropagation(); const now = !g.classList.contains('sg-c'); g.classList.toggle('sg-c', now); if (now) settings.sgCollapsed[key] = 1; else delete settings.sgCollapsed[key]; saveSettings(); };
        h.addEventListener('click', tog);
        h.addEventListener('keydown', (e) => { if (e.key === 'Enter') tog(e); });
      });
    }
    let sgPending = false;
    new MutationObserver(() => { if (sgPending) return; sgPending = true; requestAnimationFrame(() => { sgPending = false; enhanceGroups(panel); }); }).observe(panel, { childList: true, subtree: true });
    enhanceGroups(panel);
    panel.classList.toggle('help-all', !!settings.helpAll);

    // ---------- PC: Breite verstellen + neben der Web App andocken ----------
    if (settings.panelW === undefined) settings.panelW = 560;
    if (settings.dock === undefined) settings.dock = 'auto';   // 'auto' | 'on' | 'off'
    const isWide = () => W.innerWidth > 700;
    const isPC = () => !!(W.matchMedia && W.matchMedia('(hover: hover) and (pointer: fine)').matches);
    function applyWidth() {
      const w = Math.max(380, Math.min(settings.panelW, W.innerWidth - 480));
      if (isWide()) panel.style.width = w + 'px'; else panel.style.width = '';
      document.documentElement.style.setProperty('--fcpt-w', w + 'px');
    }
    function applyDock() {
      if (document.documentElement.classList.contains('fcpt-fill')) { document.documentElement.classList.remove('fcpt-dock'); if (panel.parentNode !== document.body) document.body.appendChild(panel); return; }
      const want = settings.dock === 'on' || (settings.dock === 'auto' && isPC() && W.innerWidth >= 1200);
      const on = want && isWide() && panel.classList.contains('open');
      if (on && panel.parentNode !== document.documentElement) document.documentElement.appendChild(panel);
      if (!on && panel.parentNode !== document.body) document.body.appendChild(panel);
      document.documentElement.classList.toggle('fcpt-dock', on);
      applyWidth();
      if (on !== applyDock.last) { applyDock.last = on; try { W.dispatchEvent(new Event('resize')); } catch (e) { /* */ } }
    }
    // ---------- Web-App-Modus: eigener Menüpunkt in EAs Navigation, das Tool füllt die Inhaltsfläche ----------
    if (settings.embed === undefined) settings.embed = true;

    // ---------- Design „Stadion“ auch für EAs Web App (nur Farben/Schrift – Bedienung bleibt unverändert) ----------
    if (settings.eaSkin === undefined) settings.eaSkin = true;
    GM_addStyle(`
      html.fcpt-easkin,html.fcpt-easkin body{background-color:#060708 !important}
      html.fcpt-easkin .ut-root-view,html.fcpt-easkin .ut-content,html.fcpt-easkin .ut-content-container,html.fcpt-easkin .ut-navigation-container-view,html.fcpt-easkin .ut-split-view{background-color:#060708 !important}
      /* Menüleiste */
      html.fcpt-easkin .ut-tab-bar,html.fcpt-easkin nav[class*="tab-bar"]{background:linear-gradient(180deg,#0b0b0c,#000) !important;border-color:#211e15 !important}
      html.fcpt-easkin .ut-tab-bar-item{color:#f4f1e8 !important;font-family:'Barlow Condensed','IBM Plex Sans',sans-serif !important;font-weight:800 !important;text-transform:uppercase !important;letter-spacing:.06em !important;background:transparent !important;transition:background .12s,color .12s}
      html.fcpt-easkin .ut-tab-bar-item:hover{color:#ffe58a !important}
      html.fcpt-easkin .ut-tab-bar-item.selected,html.fcpt-easkin .ut-tab-bar-item.fcpt-on{color:#f0bf2e !important;background:linear-gradient(90deg,rgba(240,191,46,.22),rgba(240,191,46,0) 90%) !important;box-shadow:inset 4px 0 0 #f0bf2e}
      @media (max-width:1023px){html.fcpt-easkin .ut-tab-bar-item.selected,html.fcpt-easkin .ut-tab-bar-item.fcpt-on{background:linear-gradient(0deg,rgba(240,191,46,.22),rgba(240,191,46,0)) !important;box-shadow:inset 0 -3px 0 #f0bf2e}}
      html.fcpt-easkin .ut-tab-bar-item::before,html.fcpt-easkin .ut-tab-bar-item *{color:inherit !important}
      /* Kopfzeile */
      html.fcpt-easkin .ut-navigation-bar-view,html.fcpt-easkin header.ut-navigation-bar-view{background:linear-gradient(180deg,#141414,#060708) !important;border-bottom:1px solid #2a2618 !important}
      html.fcpt-easkin .ut-navigation-bar-view h1,html.fcpt-easkin .ut-navigation-bar-view .title{font-family:'Barlow Condensed','IBM Plex Sans',sans-serif !important;font-weight:800 !important;font-style:italic;text-transform:uppercase;letter-spacing:.04em;color:#f4f1e8 !important}
      html.fcpt-easkin .view-navbar-currency-coins,html.fcpt-easkin .view-navbar-currency-coins *{color:#f0bf2e !important}
      html.fcpt-easkin .ut-navigation-button-control{color:#f0bf2e !important}
      /* Kacheln (Startseite, Transfers, Verein …) */
      html.fcpt-easkin .tile,html.fcpt-easkin .ut-tile-view{border:1px solid #2c2717 !important;border-radius:6px !important;box-shadow:inset 0 -3px 0 #c99a1c,0 8px 24px rgba(0,0,0,.45) !important;transition:transform .12s,border-color .12s}
      html.fcpt-easkin .tile:hover,html.fcpt-easkin .ut-tile-view:hover{border-color:#f0bf2e !important}
      html.fcpt-easkin .tile .tileHeader,html.fcpt-easkin .tile header h1,html.fcpt-easkin .ut-tile-view h1{font-family:'Barlow Condensed','IBM Plex Sans',sans-serif !important;font-weight:800 !important;font-style:italic;text-transform:uppercase;letter-spacing:.02em;color:#f4f1e8 !important;text-shadow:0 2px 10px rgba(0,0,0,.7)}
      /* Abschnitte, Listen, Filter */
      html.fcpt-easkin .ut-section-header-view,html.fcpt-easkin .section-header{background:#111 !important;color:#d9b54a !important;font-family:'Barlow Condensed','IBM Plex Sans',sans-serif !important;font-weight:800 !important;text-transform:uppercase;letter-spacing:.08em;border-color:#2a2618 !important}
      html.fcpt-easkin .listFUTItem{background-color:#0e0f12 !important;border-color:#2a2618 !important}
      html.fcpt-easkin .listFUTItem.selected{background-color:#16140c !important;box-shadow:inset 3px 0 0 #f0bf2e !important}
      html.fcpt-easkin .ut-pinned-list-container,html.fcpt-easkin .ut-pinned-list,html.fcpt-easkin .ut-quick-list-panel-view,html.fcpt-easkin .ut-item-search-view,html.fcpt-easkin .ut-club-search-filters-view,html.fcpt-easkin .ut-search-filter-control,html.fcpt-easkin .ut-navigation-container-view--content,html.fcpt-easkin .ut-no-results-view{background-color:#0b0b0d !important;border-color:#2a2618 !important}
      html.fcpt-easkin .ea-dialog-view{background:#0e0f12 !important;border:1px solid #3a3420 !important}
      /* Knöpfe: Hauptaktion in Gold */
      html.fcpt-easkin .btn-standard.call-to-action,html.fcpt-easkin .btn-standard.primary{background:linear-gradient(180deg,#ffd75e,#e0a800) !important;color:#141006 !important;border-color:#e0a800 !important;font-family:'Barlow Condensed','IBM Plex Sans',sans-serif !important;font-weight:800 !important;text-transform:uppercase;letter-spacing:.06em}
      html.fcpt-easkin .btn-standard.call-to-action:disabled,html.fcpt-easkin .btn-standard.call-to-action.disabled{opacity:.45}
      html.fcpt-easkin body,html.fcpt-easkin .ut-root-view{font-family:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif !important;-webkit-font-smoothing:antialiased}
      html.fcpt-easkin .ut-root-view ::-webkit-scrollbar{width:8px;height:8px}html.fcpt-easkin .ut-root-view ::-webkit-scrollbar-thumb{background:#3a3420;border-radius:4px}html.fcpt-easkin .ut-root-view ::-webkit-scrollbar-track{background:transparent}
      html.fcpt-easkin .listFUTItem .name{font-weight:700 !important;letter-spacing:.01em}
      html.fcpt-easkin .ut-navigation-bar-view h1,html.fcpt-easkin .ut-navigation-bar-view .title{font-size:1.15em !important}
      html.fcpt-easkin .ea-dialog-view--title,html.fcpt-easkin .ea-dialog-view h1{font-family:'Barlow Condensed','IBM Plex Sans',sans-serif !important;font-weight:800 !important;text-transform:uppercase;letter-spacing:.04em;color:#f0bf2e !important}
      html.fcpt-easkin input,html.fcpt-easkin select{accent-color:#f0bf2e}
      /* Kacheln: Graphit mit goldenem Schimmer, Symbole leuchten leicht */
      html.fcpt-easkin .tile,html.fcpt-easkin .ut-tile-view{background-color:#24262c !important;border-color:#3b3828 !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.07),inset 0 -3px 0 #d4a521,0 10px 26px rgba(0,0,0,.4) !important;border-radius:10px !important;overflow:hidden}
      html.fcpt-easkin .tile::after,html.fcpt-easkin .ut-tile-view::after{content:'';position:absolute;inset:0;pointer-events:none;border-radius:inherit;background:radial-gradient(120% 70% at 85% 0%,rgba(240,191,46,.13),transparent 55%),linear-gradient(180deg,rgba(255,255,255,.04),transparent 40%)}
      html.fcpt-easkin .tile,html.fcpt-easkin .ut-tile-view{position:relative}
      html.fcpt-easkin .tile img,html.fcpt-easkin .ut-tile-view img,html.fcpt-easkin .tile svg{filter:drop-shadow(0 6px 16px rgba(240,191,46,.22))}
      html.fcpt-easkin .tile .tileHeader,html.fcpt-easkin .tile header h1,html.fcpt-easkin .ut-tile-view h1{color:#f6d46a !important}
      html.fcpt-tone-mid.fcpt-easkin .tile,html.fcpt-tone-mid.fcpt-easkin .ut-tile-view{background-color:#2a2c33 !important}
      html.fcpt-tone-light.fcpt-easkin .tile,html.fcpt-tone-light.fcpt-easkin .ut-tile-view{background-color:#3a3d45 !important}
      /* Untere Menüleiste am Handy: gleich breite Punkte, kleinere Schrift, nichts abgeschnitten */
      @media (max-width:1023px){
        html.fcpt-easkin .ut-tab-bar{display:flex !important;justify-content:stretch !important}
        html.fcpt-easkin .ut-tab-bar-item{flex:1 1 0 !important;min-width:0 !important;padding-left:2px !important;padding-right:2px !important;font-size:9px !important;letter-spacing:0 !important;white-space:nowrap;overflow:hidden;text-overflow:clip}
        html.fcpt-easkin .ut-tab-bar-item *{font-size:inherit !important;max-width:100%;overflow:hidden;text-overflow:ellipsis}
        html.fcpt-easkin .ut-tab-bar-item::before{font-size:24px !important}
        html.fcpt-easkin .fcpt-navbtn .fcpt-nl-l{display:none}
        html.fcpt-easkin .fcpt-navbtn .fcpt-navl{margin-top:4px}
        html.fcpt-easkin .ut-tab-bar-item.selected,html.fcpt-easkin .ut-tab-bar-item.fcpt-on{border-radius:10px 10px 0 0}
      }
      /* Transfermarkt / Listen: Karte + Preiszeile als EIN Kasten, ruhiger und kompakter */
      html.fcpt-easkin .listFUTItem.fcpt-has-inline{background:var(--t2,#202226) !important;border:1px solid var(--tb,#3a3420) !important;border-radius:10px !important;padding:0 !important;margin:0 0 8px !important;box-shadow:0 4px 14px rgba(0,0,0,.25) !important;transition:border-color .12s}
      html.fcpt-easkin .listFUTItem.fcpt-has-inline:hover{border-color:#7a6424 !important}
      html.fcpt-easkin .listFUTItem.fcpt-has-inline.selected{border-color:#f0bf2e !important;box-shadow:0 0 0 1px #f0bf2e,0 6px 18px rgba(0,0,0,.35) !important}
      html.fcpt-easkin .listFUTItem.fcpt-has-inline > :not(.fcpt-inline):not(.fcpt-buybadge){background:transparent !important;border-color:transparent !important;box-shadow:none !important}
      html.fcpt-easkin .listFUTItem.fcpt-has-inline > .fcpt-inline{margin:0 !important;border:0 !important;border-top:1px solid rgba(255,255,255,.06) !important;border-radius:0 0 9px 9px !important;background:rgba(0,0,0,.22) !important;padding:5px 14px !important;font-size:11.5px !important;gap:2px 18px !important;font-family:'IBM Plex Sans',system-ui,sans-serif !important}
      html.fcpt-easkin .listFUTItem.fcpt-has-inline > .fcpt-inline .fcpt-chip{color:#a9a69c !important;font-weight:500 !important}
      html.fcpt-easkin .listFUTItem.fcpt-has-inline > .fcpt-inline .fcpt-chip b{color:#f4f1e8 !important;font-weight:700 !important}
      html.fcpt-easkin .listFUTItem.fcpt-has-inline > .fcpt-inline .fcpt-chip.profit b{color:#4ade80 !important}
      html.fcpt-easkin .listFUTItem.fcpt-has-inline > .fcpt-inline .fcpt-chip.loss,html.fcpt-easkin .listFUTItem.fcpt-has-inline > .fcpt-inline .fcpt-chip.loss b{color:#f8a3a3 !important}
      html.fcpt-easkin .SearchResults .listFUTItem,html.fcpt-easkin .ut-market-search-results-view .listFUTItem,html.fcpt-easkin .ut-search-results-view .listFUTItem{zoom:.84}
      /* Preis-Spalte rechts statt Leiste unten (PC): spart eine ganze Zeile pro Spieler */
      @media (min-width:900px){
        html.fcpt-easkin .listFUTItem.fcpt-has-inline{display:grid !important;grid-template-columns:minmax(0,1fr) 168px !important;align-items:stretch !important}
        html.fcpt-easkin .listFUTItem.fcpt-has-inline > :not(.fcpt-inline):not(.fcpt-buybadge){grid-column:1 !important;min-width:0}
        html.fcpt-easkin .listFUTItem.fcpt-has-inline > .fcpt-inline{grid-column:2 !important;grid-row:1 / span 9 !important;flex-direction:column !important;flex-wrap:nowrap !important;align-items:flex-start !important;justify-content:center !important;gap:5px !important;border-top:0 !important;border-left:1px solid rgba(255,255,255,.07) !important;border-radius:0 9px 9px 0 !important;padding:10px 14px !important;font-size:12.5px !important}
        html.fcpt-easkin .listFUTItem.fcpt-has-inline > .fcpt-inline .fcpt-chip{display:flex !important;justify-content:space-between;width:100%;gap:10px}
      }
      /* Farbiger Streifen links: grün = lohnt sich, rot = zu teuer */
      html.fcpt-easkin .listFUTItem.fcpt-has-inline.fcpt-bargain,html.fcpt-easkin .listFUTItem.fcpt-has-inline.fcpt-good{box-shadow:inset 4px 0 0 #3dd68c,0 4px 14px rgba(0,0,0,.25) !important}
      html.fcpt-easkin .listFUTItem.fcpt-has-inline.fcpt-bad{box-shadow:inset 4px 0 0 #e05252,0 4px 14px rgba(0,0,0,.25) !important}
      html.fcpt-easkin .listFUTItem.fcpt-has-inline.fcpt-meh{box-shadow:inset 4px 0 0 #8a8678,0 4px 14px rgba(0,0,0,.25) !important}
      html.fcpt-easkin .listFUTItem.fcpt-has-inline.fcpt-watchhit{box-shadow:inset 4px 0 0 #f0bf2e,0 4px 14px rgba(0,0,0,.25) !important}
      html.fcpt-easkin .listFUTItem.fcpt-has-inline:hover{transform:translateX(2px)}
      html:root.fcpt-easkin .listFUTItem.fcpt-has-inline.selected{background:linear-gradient(90deg,rgba(240,191,46,.13),rgba(240,191,46,.04)),var(--t2,#202226) !important}
      /* EAs Preisangaben in der Zeile: kleine graue Beschriftung, kräftige Zahl */
      html.fcpt-easkin .listFUTItem .auction .label,html.fcpt-easkin .listFUTItem .auctionValue .label,html.fcpt-easkin .listFUTItem .auctionStartPrice .label{font-size:10.5px !important;text-transform:uppercase;letter-spacing:.06em;color:#8f8b80 !important}
      html.fcpt-easkin .listFUTItem .auction .value,html.fcpt-easkin .listFUTItem .auctionValue .value,html.fcpt-easkin .listFUTItem .auctionStartPrice .value{font-weight:700 !important;color:#f4f1e8 !important}
      html.fcpt-easkin .listFUTItem .name{font-size:1.05em !important}
      /* Detail-Bereich rechts und „Nächste“-Leiste */
      html.fcpt-easkin .DetailPanel,html.fcpt-easkin .ut-navigation-container-view--content .DetailView,html.fcpt-easkin .ut-item-details-view{background:var(--t1,#18191c) !important;border:1px solid var(--tb,#3a3420) !important;border-radius:12px !important}
      html.fcpt-easkin .pagingContainer,html.fcpt-easkin .ut-pagination-control,html.fcpt-easkin .pagination{background:var(--t1,#18191c) !important;border:1px solid var(--tb,#3a3420) !important;border-radius:10px !important;box-shadow:0 -6px 18px rgba(0,0,0,.35)}
      html.fcpt-easkin .pagingContainer button,html.fcpt-easkin .pagination button{color:#f0bf2e !important;font-weight:700 !important}
      @media (max-width:700px){html.fcpt-easkin .SearchResults .listFUTItem,html.fcpt-easkin .ut-market-search-results-view .listFUTItem,html.fcpt-easkin .ut-search-results-view .listFUTItem{zoom:.92}}
      html.fcpt-easkin .fcpt-navbtn .fcpt-navic{clip-path:polygon(50% 0,100% 14%,100% 60%,50% 100%,0 60%,0 14%);border-radius:0;height:30px}
    `);

    // ---------- Verein → Spieler: kompakte Liste, mehrere Spalten (nur Optik) ----------
    if (settings.clubCompact === undefined) settings.clubCompact = true;
    GM_addStyle(`
      html.fcpt-clubc .fcpt-clubl{display:grid !important;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:6px;padding:8px !important;align-content:start}
      html.fcpt-clubc .fcpt-clubl>.listFUTItem{zoom:.8;margin:0 !important;border:1px solid #23262e !important;border-radius:8px !important;overflow:hidden;background-color:#0e0f12 !important;transition:border-color .12s,background-color .12s}
      html.fcpt-clubc .fcpt-clubl>.listFUTItem:nth-child(even){background-color:#121317 !important}
      html.fcpt-clubc .fcpt-clubl>.listFUTItem:hover{border-color:#8a6d1c !important}
      html.fcpt-clubc .fcpt-clubl>.listFUTItem.selected{border-color:#f0bf2e !important;background-color:#17150d !important;box-shadow:inset 3px 0 0 #f0bf2e !important}
      html.fcpt-clubc .fcpt-clubl>.listFUTItem .rowContent{padding-top:4px !important;padding-bottom:4px !important;min-height:0 !important}
      html.fcpt-clubc .fcpt-clubl>.listFUTItem .name{font-weight:700 !important}
      html.fcpt-clubc .fcpt-clubl>.listFUTItem .rating{color:#f0bf2e !important;font-weight:800 !important}
      @media (max-width:700px){
        html.fcpt-clubc .fcpt-clubl{grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;padding:5px !important}
        html.fcpt-clubc .fcpt-clubl>.listFUTItem{zoom:.56;border-radius:12px !important}
        html.fcpt-clubc .fcpt-clubl>.listFUTItem .fcpt-inline{font-size:15px !important;flex-wrap:wrap}
      }
      html.fcpt-easkin .ut-fifa-header-view,html.fcpt-easkin .ut-app-header{background:linear-gradient(180deg,#141414,#060708) !important}
    `);
    const CLUB_RX = /(spieler|players|profis|verein|club)/i, NOT_CLUB = /(transfer|sbc|markt|market|aufgabe|challenge)/i;
    function markClubList() {
      const de = document.documentElement;
      de.classList.toggle('fcpt-clubc', settings.clubCompact !== false);
      if (settings.clubCompact === false) return;
      let lists = [...document.querySelectorAll('.ut-club-search-results-view ul, .ut-club-items-view ul, [class*="club-search-results"] ul')];
      if (!lists.length) {
        const t = document.querySelector('.ut-navigation-bar-view h1, .ut-navigation-bar-view .title, h1.title');
        const tt = t ? (t.textContent || '').trim() : '';
        if (CLUB_RX.test(tt) && !NOT_CLUB.test(tt)) lists = [...new Set([...document.querySelectorAll('.listFUTItem')].map((li) => li.parentElement).filter((u) => u && !u.closest('#fcpt-panel')))];
      }
      document.querySelectorAll('.fcpt-clubl').forEach((u) => { if (!lists.includes(u)) u.classList.remove('fcpt-clubl'); });
      lists.forEach((u) => { if (u.querySelector(':scope > .listFUTItem')) u.classList.add('fcpt-clubl'); });
    }
    setInterval(() => { try { markClubList(); } catch (e) { /* */ } }, 800);

    // ---------- EA-Layout „Manager“: wie Manager-Spiele – Menü links mit großen Symbolen, goldene Rahmen,
    // Wappen + Belegungsbalken in der Kopfzeile, Hintergrund mit Goldschlieren. Nur Optik/Anordnung.
    if (settings.eaLayout === undefined) settings.eaLayout = true;
    const RAILW = 82;
    GM_addStyle(`
      html:root.fcpt-ufmx.fcpt-easkin,html:root.fcpt-ufmx.fcpt-easkin body{background:linear-gradient(118deg,transparent 0 34%,rgba(212,165,33,.10) 36%,transparent 41%,transparent 63%,rgba(212,165,33,.07) 65%,transparent 69%),radial-gradient(1100px 600px at 25% -5%,rgba(255,255,255,.07),transparent 60%),linear-gradient(180deg,#1d1e21,#0a0a0b) fixed !important}
      html:root.fcpt-ufmx.fcpt-easkin .ut-root-view,html:root.fcpt-ufmx.fcpt-easkin .ut-content,html:root.fcpt-ufmx.fcpt-easkin .ut-content-container,html:root.fcpt-ufmx.fcpt-easkin .ut-navigation-container-view,html:root.fcpt-ufmx.fcpt-easkin .ut-split-view{background:transparent !important}
      /* Menü: große helle Symbole, schmale Großschrift, aktiver Punkt dunkel abgesetzt + gold */
      html:root.fcpt-ufmx.fcpt-easkin .ut-tab-bar{background:linear-gradient(90deg,#0b0b0c,#161618) !important;border:0 !important;border-right:2px solid #2d2a20 !important;box-shadow:6px 0 24px rgba(0,0,0,.45)}
      html:root.fcpt-ufmx.fcpt-easkin .ut-tab-bar-item{font-family:'Barlow Condensed','Arial Narrow',sans-serif !important;font-weight:700 !important;font-style:normal !important;letter-spacing:.05em !important;color:#dcd8cc !important;text-shadow:0 2px 0 rgba(0,0,0,.6)}
      html:root.fcpt-ufmx.fcpt-easkin .ut-tab-bar-item::before{color:#f3f1ea !important;filter:drop-shadow(0 3px 0 rgba(0,0,0,.55))}
      html:root.fcpt-ufmx.fcpt-easkin .ut-tab-bar-item.selected,html:root.fcpt-ufmx.fcpt-easkin .ut-tab-bar-item.fcpt-on{background:linear-gradient(180deg,#24221b,#17160f) !important;color:#f0bf2e !important;box-shadow:inset 0 1px 0 #4a4128,inset 0 -1px 0 #4a4128 !important;border-radius:0 !important}
      html:root.fcpt-ufmx.fcpt-easkin .ut-tab-bar-item.selected::before,html:root.fcpt-ufmx.fcpt-easkin .ut-tab-bar-item.fcpt-on::before{color:#f0bf2e !important;filter:drop-shadow(0 0 10px rgba(240,191,46,.45)) drop-shadow(0 3px 0 rgba(0,0,0,.55))}
      /* Menü links am Handy */
      html.fcpt-vrail .ut-tab-bar{position:fixed !important;left:0 !important;right:auto !important;top:var(--fcpt-rt,0px) !important;bottom:0 !important;width:${RAILW}px !important;height:auto !important;flex-direction:column !important;justify-content:flex-start !important;align-items:stretch !important;overflow-y:auto !important;overflow-x:hidden !important;z-index:60 !important;padding:6px 0 calc(env(safe-area-inset-bottom,0px) + 6px) !important}
      html.fcpt-vrail .ut-tab-bar-item{flex:none !important;width:100% !important;max-width:none !important;min-width:0 !important;min-height:84px !important;display:flex !important;flex-direction:column !important;align-items:center !important;justify-content:center !important;gap:6px;font-size:10.5px !important;letter-spacing:.01em !important;padding:6px 1px !important;white-space:normal !important;word-break:break-word;text-align:center;border-bottom:1px solid rgba(255,255,255,.04) !important}
      html.fcpt-vrail .ut-tab-bar-item::before{font-size:34px !important;line-height:1 !important;margin:0 !important}
      html.fcpt-vrail .ut-tab-bar-item *{font-size:inherit !important;overflow:visible !important}
      html.fcpt-vrail .fcpt-navbtn .fcpt-navic{width:36px;height:42px;font-size:13px}
      html.fcpt-vrail .fcpt-navbtn .fcpt-nl-l{display:none}
      /* Kopfzeile: Wappen vor dem Titel, Münzen als Kästen, Belegungsbalken */
      html:root.fcpt-ufmx.fcpt-easkin .ut-navigation-bar-view{background:linear-gradient(180deg,rgba(40,40,44,.92),rgba(14,14,16,.92)) !important;border-bottom:1px solid #3a3420 !important;position:relative;padding-bottom:12px !important;box-sizing:content-box}
      html:root.fcpt-ufmx.fcpt-easkin .ut-navigation-bar-view h1,html:root.fcpt-ufmx.fcpt-easkin .ut-navigation-bar-view .title{font-family:'Barlow Condensed','Arial Narrow',sans-serif !important;font-style:normal !important;font-weight:800 !important;letter-spacing:.04em !important;color:#f6f4ee !important;display:inline-flex !important;align-items:center;gap:10px}
      html:root.fcpt-ufmx.fcpt-easkin .ut-navigation-bar-view h1::before,html:root.fcpt-ufmx.fcpt-easkin .ut-navigation-bar-view .title::before{content:'';flex:none;width:30px;height:36px;background:url("__SHIELD__") center/contain no-repeat;filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))}
      html:root.fcpt-ufmx.fcpt-easkin .fcpt-hud{position:absolute;left:50%;bottom:3px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;font:700 10px 'Barlow Condensed','Arial Narrow',sans-serif;letter-spacing:.08em;color:#cfc8b2;pointer-events:none;white-space:nowrap}
      html:root.fcpt-ufmx.fcpt-easkin .fcpt-hud i{display:block;width:110px;height:5px;border-radius:3px;background:#2a271d;overflow:hidden;box-shadow:inset 0 0 0 1px #3a3420}
      html:root.fcpt-ufmx.fcpt-easkin .fcpt-hud i b{display:block;height:100%;background:linear-gradient(90deg,#b8860b,#f0bf2e,#ffe58a)}
      html:root.fcpt-ufmx.fcpt-easkin .view-navbar-currency>*,html:root.fcpt-ufmx.fcpt-easkin .view-navbar-currency-coins,html:root.fcpt-ufmx.fcpt-easkin .view-navbar-currency-points{background:linear-gradient(180deg,#1c1c1f,#0d0d0e) !important;border:1px solid #3a3420 !important;border-radius:6px !important;padding:2px 8px !important;box-shadow:0 3px 8px rgba(0,0,0,.4);font-family:'Barlow Condensed','Arial Narrow',sans-serif !important;font-weight:700 !important}
      /* Kacheln: dünner Goldrahmen, eckig, Lichtschlieren, große schmale Großschrift */
      html:root.fcpt-ufmx.fcpt-easkin .tile,html:root.fcpt-ufmx.fcpt-easkin .ut-tile-view{background-color:#141416 !important;border:2px solid #a8873a !important;border-radius:3px !important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.7),0 0 0 1px #2c2717,0 14px 30px rgba(0,0,0,.55) !important}
      html:root.fcpt-ufmx.fcpt-easkin .tile::after,html:root.fcpt-ufmx.fcpt-easkin .ut-tile-view::after{border-radius:0;background:linear-gradient(118deg,transparent 30%,rgba(255,240,200,.10) 38%,transparent 46%),radial-gradient(90% 60% at 80% 10%,rgba(212,165,33,.20),transparent 60%),linear-gradient(0deg,rgba(0,0,0,.55),transparent 45%)}
      html:root.fcpt-ufmx.fcpt-easkin .tile header,html:root.fcpt-ufmx.fcpt-easkin .tile .tileHeader,html:root.fcpt-ufmx.fcpt-easkin .ut-tile-view h1{position:relative;z-index:2}
      html:root.fcpt-ufmx.fcpt-easkin .tile .tileHeader,html:root.fcpt-ufmx.fcpt-easkin .tile header h1,html:root.fcpt-ufmx.fcpt-easkin .ut-tile-view h1{font-family:'Barlow Condensed','Arial Narrow',sans-serif !important;font-style:normal !important;font-weight:800 !important;letter-spacing:.02em !important;color:#f6f4ee !important;font-size:1.6em !important;text-shadow:0 3px 0 rgba(0,0,0,.55),0 0 18px rgba(0,0,0,.6) !important}
      html:root.fcpt-ufmx.fcpt-easkin .tile img,html:root.fcpt-ufmx.fcpt-easkin .ut-tile-view img,html:root.fcpt-ufmx.fcpt-easkin .tile svg{filter:drop-shadow(0 8px 0 rgba(0,0,0,.35)) drop-shadow(0 0 22px rgba(240,191,46,.25))}
      html:root.fcpt-ufmx.fcpt-easkin .listFUTItem{border-radius:3px !important}
      html:root.fcpt-ufmx.fcpt-easkin .ut-section-header-view,html:root.fcpt-ufmx.fcpt-easkin .section-header{font-family:'Barlow Condensed','Arial Narrow',sans-serif !important;font-style:normal !important;background:linear-gradient(90deg,rgba(212,165,33,.16),transparent 70%) !important;border-left:3px solid #f0bf2e !important}
    `.replace('__SHIELD__', "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 34 40'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23ffe58a'/%3E%3Cstop offset='.5' stop-color='%23f0bf2e'/%3E%3Cstop offset='1' stop-color='%239a6a00'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M17 1l15 5v13c0 10-7 17-15 20C9 36 2 29 2 19V6z' fill='url(%23g)'/%3E%3Cpath d='M17 5l11 3.6V19c0 7.6-5 13-11 15.6C11 32 6 26.6 6 19V8.6z' fill='%230b0b0c'/%3E%3Ctext x='17' y='24' text-anchor='middle' font-family='Arial' font-weight='800' font-style='italic' font-size='13' fill='%23f0bf2e'%3E27%3C/text%3E%3C/svg%3E"));
    const shifted = new Map();   // Element -> ursprüngliche Inline-Styles
    function unshift() { shifted.forEach((v, el) => { el.style.marginLeft = v.ml; el.style.width = v.w; el.style.left = v.l; }); shifted.clear(); }
    function layoutEa() {
      const de = document.documentElement;
      const on = de.classList.contains('fcpt-easkin') && settings.eaLayout !== false;
      de.classList.toggle('fcpt-ufmx', on);
      const n = eaNav && eaNav();
      const mobile = W.innerWidth < 1024;
      let wantRail = on && mobile && !!n;
      if (wantRail && !de.classList.contains('fcpt-vrail')) {
        // nur wenn die Leiste wirklich unten liegt (sonst ist sie schon links)
        const r = n.getBoundingClientRect();
        if (!(r.top > W.innerHeight / 2 && r.width > r.height)) wantRail = false;
      }
      de.classList.toggle('fcpt-vrail', wantRail);
      if (!wantRail) { if (shifted.size) unshift(); }
      else {
        const hd = document.querySelector('.ut-fifa-header-view');
        const rt = hd ? Math.max(0, Math.round(hd.getBoundingClientRect().bottom)) : 0;
        de.style.setProperty('--fcpt-rt', rt + 'px');
        const host = n.parentElement;
        if (host) for (const el of host.children) {
          if (el === n || el.id === 'fcpt-panel' || el.id === 'fcpt-btn' || shifted.has(el)) continue;
          const cs = getComputedStyle(el);
          if (cs.display === 'none') continue;
          const r = el.getBoundingClientRect();
          if (r.bottom <= rt + 2) continue;   // EA-Banner oben bleibt volle Breite
          shifted.set(el, { ml: el.style.marginLeft, w: el.style.width, l: el.style.left });
          if (cs.position === 'absolute' || cs.position === 'fixed') el.style.left = (parseFloat(cs.left) || 0) + RAILW + 'px';
          else { el.style.marginLeft = RAILW + 'px'; el.style.width = `calc(100% - ${RAILW}px)`; }
        }
      }
      // Belegungsbalken in EAs Kopfzeile
      const nb = document.querySelector('.ut-navigation-bar-view');
      if (on && nb) {
        let h = nb.querySelector('.fcpt-hud');
        if (!h) { h = document.createElement('div'); h.className = 'fcpt-hud'; h.innerHTML = '<span>TRANSFERLISTE</span><i><b></b></i><em></em>'; nb.appendChild(h); }
        const c = items.length;
        h.style.display = c ? 'flex' : 'none';
        h.querySelector('b').style.width = Math.min(100, c) + '%';
        h.querySelector('em').textContent = `${c}/100`;
      } else document.querySelectorAll('.fcpt-hud').forEach((x) => x.remove());
      try { if (typeof placeFill === 'function' && document.documentElement.classList.contains('fcpt-fill')) placeFill(); } catch (e) { /* */ }
    }
    setInterval(() => { try { layoutEa(); } catch (e) { /* */ } }, 1000);
    W.addEventListener('resize', () => { try { unshift(); document.documentElement.classList.remove('fcpt-vrail'); layoutEa(); } catch (e) { /* */ } });
    // ---------- EA-Farben umschreiben: liest EAs eigene Stylesheets und ersetzt Blautöne durch Schwarz/Gold,
    // verkleinert Schriftgrößen. Zustände (Hover, Ausgewählt) bleiben erhalten, weil die Regeln selbst angepasst werden.
    if (settings.eaFont === undefined) settings.eaFont = 0.9;
    const EASK = (() => {
      const changed = [];            // [style, prop, alterWert, Priorität]
      let done = new WeakSet();
      const SKIP = /rare|rarity|item-?view|ut-item|\.item\b|card|pack|player-?pic|playeroverview|special|badge|crest|flag|fcpt|evolution|chemistry/i;
      const CRX = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi;
      const COLP = /^(background|background-color|background-image|border(-top|-right|-bottom|-left)?-color|outline-color|box-shadow|color|--.*)$/;
      function rgba(c) {
        c = c.trim().toLowerCase();
        if (c[0] === '#') {
          let h = c.slice(1);
          if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
          if (h.length !== 6 && h.length !== 8) return null;
          return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
        }
        const n = c.match(/[\d.]+%?/g);
        if (!n || n.length < 3) return null;
        const v = n.map((x) => parseFloat(x));
        if (c.startsWith('hsl')) {
          const h = v[0] / 360, sat = v[1] / 100, l = v[2] / 100;
          const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, pp = 2 * l - q;
          const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? pp + (q - pp) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? pp + (q - pp) * (2 / 3 - t) * 6 : pp; };
          return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255, n[3] != null ? (n[3].endsWith('%') ? v[3] / 100 : v[3]) : 1];
        }
        return [v[0], v[1], v[2], n[3] != null ? (n[3].endsWith('%') ? v[3] / 100 : v[3]) : 1];
      }
      function hsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
        if (!d) return [0, 0, l];
        const sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return [h * 60, sat, l];
      }
      const out = (h, sat, l, a) => `hsla(${Math.round(h)}, ${Math.round(sat * 100)}%, ${Math.round(l * 1000) / 10}%, ${Math.round(a * 1000) / 1000})`;
      function mapColor(c, textProp) {
        const v = rgba(c); if (!v) return null;
        const [h, sat, l] = hsl(v[0], v[1], v[2]);
        const blue = h >= 185 && h <= 268 && sat >= 0.12, teal = h >= 140 && h < 185 && sat >= 0.35 && l >= 0.3;
        if (!blue && !teal) return null;
        const accent = sat >= 0.5 && l >= 0.4 && l <= 0.8;
        if (textProp) return sat >= 0.6 && l >= 0.4 && l <= 0.7 ? out(44, 0.86, 0.56, v[3]) : blue && l >= 0.55 ? out(220, 0.08, Math.max(l, 0.72), v[3]) : null;
        if (accent) return out(44, 0.86, 0.56, v[3]);
        if (!blue) return null;
        if (l < 0.6) return out(225, 0.07, settings.uiTone === 'light' ? 0.17 + l * 0.55 : settings.uiTone === 'mid' ? 0.1 + l * 0.55 : l * 0.6, v[3]);
        return out(220, 0.08, l, v[3]);
      }
      function fixRule(rule) {
        const st = rule.style; if (!st) return;
        const sel = rule.selectorText || '';
        if (SKIP.test(sel)) return;
        for (let i = 0; i < st.length; i++) {
          const prop = st[i];
          const val = st.getPropertyValue(prop); if (!val) continue;
          const prio = st.getPropertyPriority(prop);
          let nv = null;
          if (COLP.test(prop)) {
            let hit = false;
            const r = val.replace(CRX, (m) => { const x = mapColor(m, prop === 'color'); if (x) { hit = true; return x; } return m; });
            if (hit) nv = r;
          } else if (prop === 'font-size' && settings.eaFont !== 1) {
            const m = val.trim().match(/^([\d.]+)(px|rem)$/);
            if (m) nv = `${Math.round(parseFloat(m[1]) * settings.eaFont * 100) / 100}${m[2]}`;
          }
          if (nv && nv !== val) { changed.push([st, prop, val, prio]); st.setProperty(prop, nv, prio); }
        }
      }
      function walk(list) {
        for (const rule of list) {
          try {
            if (rule.cssRules && !rule.style) walk(rule.cssRules);     // @media / @supports
            else if (rule.style && rule.type !== 7) fixRule(rule);       // keine @keyframes
          } catch (e) { /* */ }
        }
      }
      function scan() {
        if (!document.documentElement.classList.contains('fcpt-easkin')) return;
        for (const sh of document.styleSheets) {
          if (done.has(sh)) continue;
          done.add(sh);
          try {
            const own = sh.ownerNode;
            if (own && (own.id || '').startsWith('fcpt')) continue;
            if (own && own.textContent && own.textContent.includes('fcpt-')) continue;   // eigene Styles
            walk(sh.cssRules);
          } catch (e) { /* fremde Domain – nicht lesbar */ }
        }
      }
      function reset() {
        for (let i = changed.length - 1; i >= 0; i--) { const [st, p, v, pr] = changed[i]; try { st.setProperty(p, v, pr); } catch (e) { /* */ } }
        changed.length = 0; done = new WeakSet();
      }
      setInterval(() => { try { scan(); } catch (e) { /* */ } }, 2000);
      return { scan, reset, count: () => changed.length };
    })();

    // ---------- Helligkeit des Stadion-Designs (Dunkel / Mittel / Hell) ----------
    if (settings.uiTone === undefined) settings.uiTone = 'mid';
    GM_addStyle(`
      html.fcpt-tone-mid{--t0:#1b1c20;--t1:#222328;--t2:#2a2b31;--t3:#33353b;--tb:#3f3b2c;--tx:#f4f1e8;--tx2:#c9c4b6}
      html.fcpt-tone-light{--t0:#2c2e34;--t1:#35373e;--t2:#3e4048;--t3:#484b53;--tb:#5a5440;--tx:#fbf9f3;--tx2:#dcd7ca}
      html[class*="fcpt-tone-"] #fcpt-panel.ufm,html[class*="fcpt-tone-"] #fcpt-panel.ufm .fcpt-body{background:var(--t0) !important}
      html[class*="fcpt-tone-"] #fcpt-panel.ufm{--bg:var(--t0);--bg2:var(--t1);--bg3:var(--t2);--line:var(--tb);--ink2:var(--tx2)}
      html[class*="fcpt-tone-"] #fcpt-panel.ufm .fcpt-head{background:linear-gradient(180deg,var(--t2),var(--t0)) !important;border-color:var(--tb) !important}
      html[class*="fcpt-tone-"] #fcpt-panel.ufm .fcpt-rail{background:linear-gradient(180deg,var(--t1),var(--t0)) !important;border-color:var(--tb) !important}
      html[class*="fcpt-tone-"] #fcpt-panel.ufm .d-t,html[class*="fcpt-tone-"] #fcpt-panel.ufm .d-c,html[class*="fcpt-tone-"] #fcpt-panel.ufm .fcpt-sgroup{background:linear-gradient(180deg,var(--t2),var(--t1)) !important;border-color:var(--tb) !important}
      html[class*="fcpt-tone-"] #fcpt-panel.ufm .u-bdg button,html[class*="fcpt-tone-"] #fcpt-panel.ufm .fcpt-icons .ic,html[class*="fcpt-tone-"] #fcpt-panel.ufm .fcpt-qs>*{background:var(--t2) !important;border-color:var(--tb) !important}
      html[class*="fcpt-tone-"] #fcpt-panel.ufm .u-tile{border-color:var(--tb)}
      html[class*="fcpt-tone-"] #fcpt-panel.ufm .u-tile::after{background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.09) 45%,transparent 55%),linear-gradient(0deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,.05) 60%,transparent 100%)}
      html[class*="fcpt-tone-"].fcpt-easkin,html[class*="fcpt-tone-"].fcpt-easkin body,html[class*="fcpt-tone-"].fcpt-easkin .ut-root-view,html[class*="fcpt-tone-"].fcpt-easkin .ut-content,html[class*="fcpt-tone-"].fcpt-easkin .ut-content-container,html[class*="fcpt-tone-"].fcpt-easkin .ut-navigation-container-view,html[class*="fcpt-tone-"].fcpt-easkin .ut-split-view{background-color:var(--t0) !important}
      html[class*="fcpt-tone-"].fcpt-easkin .ut-tab-bar,html[class*="fcpt-tone-"].fcpt-easkin nav[class*="tab-bar"]{background:linear-gradient(180deg,var(--t1),var(--t0)) !important;border-color:var(--tb) !important}
      html[class*="fcpt-tone-"].fcpt-easkin .ut-navigation-bar-view,html[class*="fcpt-tone-"].fcpt-easkin .ut-fifa-header-view,html[class*="fcpt-tone-"].fcpt-easkin .ut-app-header{background:linear-gradient(180deg,var(--t3),var(--t1)) !important;border-color:var(--tb) !important}
      html[class*="fcpt-tone-"].fcpt-easkin .listFUTItem{background-color:var(--t2) !important;border-color:var(--tb) !important}
      html[class*="fcpt-tone-"].fcpt-easkin .listFUTItem.selected{background-color:#4a4330 !important}
      html[class*="fcpt-tone-"].fcpt-easkin .ut-section-header-view,html[class*="fcpt-tone-"].fcpt-easkin .section-header{background:var(--t1) !important;border-color:var(--tb) !important}
      html[class*="fcpt-tone-"].fcpt-easkin .ut-pinned-list-container,html[class*="fcpt-tone-"].fcpt-easkin .ut-pinned-list,html[class*="fcpt-tone-"].fcpt-easkin .ut-quick-list-panel-view,html[class*="fcpt-tone-"].fcpt-easkin .ut-item-search-view,html[class*="fcpt-tone-"].fcpt-easkin .ut-club-search-filters-view,html[class*="fcpt-tone-"].fcpt-easkin .ut-search-filter-control,html[class*="fcpt-tone-"].fcpt-easkin .ut-navigation-container-view--content,html[class*="fcpt-tone-"].fcpt-easkin .ut-no-results-view,html[class*="fcpt-tone-"].fcpt-easkin .ea-dialog-view{background-color:var(--t1) !important;border-color:var(--tb) !important}
      html[class*="fcpt-tone-"].fcpt-easkin .tile,html[class*="fcpt-tone-"].fcpt-easkin .ut-tile-view{border-color:var(--tb) !important}
      html[class*="fcpt-tone-"].fcpt-clubc .fcpt-clubl>.listFUTItem{background-color:var(--t2) !important;border-color:var(--tb) !important}
      html[class*="fcpt-tone-"].fcpt-clubc .fcpt-clubl>.listFUTItem:nth-child(even){background-color:var(--t3) !important}
      html[class*="fcpt-tone-"].fcpt-clubc .fcpt-clubl>.listFUTItem.selected{background-color:#4a4330 !important}
    `);
    function applyTone() { const de = document.documentElement; de.classList.remove('fcpt-tone-mid', 'fcpt-tone-light'); if (settings.uiTone === 'mid' || settings.uiTone === 'light') de.classList.add('fcpt-tone-' + settings.uiTone); }
    applyTone();
    function applyEaSkin() { document.documentElement.classList.toggle('fcpt-easkin', settings.ufm !== false && settings.eaSkin !== false); try { EASK.reset(); EASK.scan(); } catch (e) { /* */ } }
    applyEaSkin();
    let fill = false, navBtn = null;
    const eaNav = () => document.querySelector('.ut-tab-bar') || document.querySelector('nav[class*="tab-bar"]');
    function placeFill() {
      const n = eaNav(); const r = n ? n.getBoundingClientRect() : null;
      let l = 0, b = 0;
      if (r && r.width && r.height) {
        if (r.height > r.width && r.left < 40) l = Math.round(r.right);              // Navigation links (PC)
        else if (r.top > W.innerHeight / 2) b = Math.round(W.innerHeight - r.top);   // Navigation unten (Handy)
      }
      document.documentElement.style.setProperty('--fcpt-fl', l + 'px');
      document.documentElement.style.setProperty('--fcpt-fb', b + 'px');
    }
    function setFill(on, o2 = {}) {
      fill = on;
      document.documentElement.classList.toggle('fcpt-fill', on);
      if (navBtn) navBtn.classList.toggle('fcpt-on', on);
      if (on) {
        placeFill();
        if (!panel.classList.contains('open')) { panel.classList.add('open'); if (!items.length) { try { refresh(); } catch (e) { /* */ } } }
        if (o2.home) go('home');
      } else if (!o2.keepOpen && panel.classList.contains('open')) panel.classList.remove('open');
      applyDock();
    }
    function injectNav() {
      const n = eaNav();
      if (!settings.embed) { if (navBtn) { navBtn.remove(); navBtn = null; } if (fill) setFill(false); return; }
      if (!n || (navBtn && n.contains(navBtn))) return;
      const ref = n.querySelector('.ut-tab-bar-item') || n.querySelector('button');
      navBtn = document.createElement('button');
      navBtn.type = 'button';
      navBtn.className = (ref ? ref.className.split(/\s+/).filter((c) => c && !/^icon-|selected|active/.test(c)).join(' ') : 'ut-tab-bar-item') + ' fcpt-navbtn';
      navBtn.innerHTML = '<span class="fcpt-navic">FC</span><span class="fcpt-navl"><span class="fcpt-nl-l">FC27 </span>Tool</span>';
      navBtn.title = 'FC27 Preis-Tool öffnen';
      navBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setFill(!fill, { home: true }); }, true);
      n.appendChild(navBtn);
      if (!n.__fcptNav) {
        n.__fcptNav = true;
        // anderer Menüpunkt von EA angetippt -> Tool schließen, EA-Seite zeigen
        n.addEventListener('click', (e) => { if (fill && navBtn && !navBtn.contains(e.target)) setFill(false); }, true);
      }
    }
    setInterval(injectNav, 1500); injectNav();
    W.addEventListener('resize', () => { if (fill) placeFill(); });
    // Panel über ✕ geschlossen -> Web-App-Modus beenden · Großansicht: Tool öffnet sich immer großflächig
    if (settings.bigView === undefined) settings.bigView = true;
    new MutationObserver(() => {
      const o = panel.classList.contains('open');
      if (fill && !o) setFill(false);
      else if (!fill && o && settings.bigView) setFill(true);
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });
    const grip = document.createElement('div');
    grip.className = 'fcpt-resize';
    grip.title = 'Breite ziehen';
    panel.appendChild(grip);
    grip.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation(); grip.classList.add('on');
      const mv = (ev) => { settings.panelW = Math.round(W.innerWidth - ev.clientX); applyWidth(); };
      const up = () => { grip.classList.remove('on'); W.removeEventListener('mousemove', mv); W.removeEventListener('mouseup', up); saveSettings(); try { W.dispatchEvent(new Event('resize')); } catch (er) { /* */ } };
      W.addEventListener('mousemove', mv); W.addEventListener('mouseup', up);
    });
    W.addEventListener('resize', () => { if (!applyDock.inner) { applyDock.inner = true; applyWidth(); applyDock.inner = false; } });
    applyWidth();

    // Schwebende Knöpfe ausblenden, solange das Panel offen ist (sie lagen über der Leiste)
    const syncBtns = () => {
      const o = panel.classList.contains('open');
      btn.style.display = o ? 'none' : '';
      document.documentElement.classList.toggle('fcpt-open', o);
      applyDock();
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
          if (FAV.has(p.itemId, p.resourceId)) continue;   // geschützt -> nicht einstellen
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
          if (!p.expired || p.sold || !p.__raw || FAV.has(p.itemId, p.resourceId)) continue;
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

    // Schalter neben „Sortieren“
    try {
      const sel = panel.querySelector('[data-set="sort"]');
      if (sel && !panel.querySelector('[data-grpt]')) {
        sel.insertAdjacentHTML('beforebegin', `<div class="lv-sw" role="group" aria-label="Ansicht"><button data-lv="kanban" class="${settings.listView === 'kanban' ? 'on' : ''}" title="Spalten nach Status">▦ Spalten</button><button data-lv="table" class="${settings.listView !== 'kanban' ? 'on' : ''}" title="Tabelle">☰ Tabelle</button></div>`);
        sel.insertAdjacentHTML('afterend', `<label class="fcpt-grpt" title="Gleiche Spieler in einer Leiste zusammenfassen"><input type="checkbox" data-grpt ${settings.groupSame ? 'checked' : ''}> Gleiche zusammen</label>`);
        const tb0 = sel.closest('.fcpt-toolbar') || sel.parentElement;
        tb0.insertAdjacentHTML('afterbegin', `<div class="lf-chips" role="tablist" aria-label="Filter">${filterChips()}</div>`);
        tb0.addEventListener('click', (e) => {
          const v = e.target.closest && e.target.closest('[data-lv]');
          if (v) { e.stopPropagation(); settings.listView = v.dataset.lv; saveSettings(); tb0.querySelectorAll('[data-lv]').forEach((b) => b.classList.toggle('on', b === v)); try { render(); } catch (er) { /* */ } return; }
          const c = e.target.closest && e.target.closest('[data-lf2]');
          if (!c) return;
          e.stopPropagation(); settings.listFilter = c.dataset.lf2; saveSettings(); try { render(); } catch (er) { /* */ }
        });
        const cb = panel.querySelector('[data-grpt]');
        cb.addEventListener('change', (e) => { e.stopPropagation(); settings.groupSame = cb.checked; saveSettings(); try { if (items.length) render(); } catch (er) { /* */ } });
        cb.addEventListener('click', (e) => e.stopPropagation());
      }
    } catch (e) { /* */ }
    return { rowHtml, listHtml, headHtml, updateRow, after: () => { after(); LIST.drawBar(); }, go, renderHome };
  })();
