// ==UserScript==
// @name         FC27 Transferliste – Preis- & Profit-Tool
// @namespace    fc27-preis-tool
// @version      1.9.0
// @description  Zeigt für deine Transferliste Startpreis, Sofortkauf, Verkaufspreis, Netto-Profit (nach 5 % EA-Steuer) und Futbin-Marktpreise.
// @match        https://www.ea.com/*ultimate-team/web-app*
// @match        https://ea.com/*ultimate-team/web-app*
// @match        https://*.ea.com/*ultimate-team/web-app*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        unsafeWindow
// @connect      futbin.com
// @connect      www.futbin.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const W = unsafeWindow;
  console.log('[FC27-Tool] Skript geladen – Version', GM_info && GM_info.script && GM_info.script.version);

  // ------------------------------------------------------------------
  // Grundeinstellungen
  // ------------------------------------------------------------------
  const CONFIG = {
    year: 27,              // Spieljahr in den URLs der Preisseiten
    taxRate: 0.05,         // EA-Steuer auf Verkäufe
    cacheMinutes: 15,      // wie lange ein Preis zwischengespeichert wird
    requestDelayMs: 800,   // Pause zwischen Anfragen an Futbin
    debug: false,          // true = Details in der Browser-Konsole (F12)
    overpriceTolerance: 0.10, // ab so viel über Marktpreis kommt die Warnung "verkauft evtl. nicht"
    historyMax: 5000,      // so viele Verkäufe werden höchstens gespeichert
    bidDelayMin: 1500,     // Pause zwischen zwei Geboten (ms) – zufällig zwischen Min und Max
    bidDelayMax: 3500,
    maxBidsPerRun: 20,     // höchstens so viele Gebote pro Klick auf "Alle bieten"
    minSecondsLeft: 5,     // Auktionen, die in weniger Sekunden enden, werden übersprungen
  };

  const SETTINGS_KEY = 'fcpt_settings';
  const DEFAULTS = {
    platform: 'ps',        // 'ps' = Konsole, 'pc' = PC
    mainSource: 'futbin',  // Quelle für die Spalte "Marktpreis"
    sources: { futbin: true },
  };
  const stored = GM_getValue(SETTINGS_KEY, {});
  const settings = Object.assign({}, DEFAULTS, stored);
  settings.mainSource = 'futbin';
  settings.sources = Object.assign({}, DEFAULTS.sources, stored.sources || {});
  const saveSettings = () => GM_setValue(SETTINGS_KEY, settings);

  const log = (...a) => CONFIG.debug && console.log('[FC27-Tool]', ...a);
  if (settings.inline === undefined) settings.inline = true;
  if (settings.minBargain === undefined) settings.minBargain = 500;
  if (settings.maxBid === undefined) settings.maxBid = 2000;
  if (settings.autoRefresh === undefined) settings.autoRefresh = true;
  if (settings.sort === undefined) settings.sort = 'status';
  if (settings.ampel === undefined) settings.ampel = true;
  if (settings.hotkeys === undefined) settings.hotkeys = true;
  if (settings.bumpMinBin === undefined) settings.bumpMinBin = true;
  settings.keys = Object.assign({ search: '1', buy: '2', confirm: '3', back: '4', up: '5', down: '6' }, settings.keys || {});
  if (settings.stepField === undefined) settings.stepField = 2;   // 0 Min.-Gebot, 1 Max.-Gebot, 2 Min.-Sofortkauf, 3 Max.-Sofortkauf
  if (settings.autoBack === undefined) settings.autoBack = true;

  // ------------------------------------------------------------------
  // Hilfsfunktionen
  // ------------------------------------------------------------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmt = (n) => (n == null ? '–' : Number(n).toLocaleString('de-DE'));
  const signed = (n) => (n == null ? '–' : (n > 0 ? '+' : '') + fmt(n));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toNum = (v) => {
    if (v == null) return null;
    if (typeof v === 'number') return v > 0 ? v : null;
    const n = parseInt(String(v).replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const afterTax = (n) => Math.floor(n * (1 - CONFIG.taxRate));
  const fmtTime = (sec) => {
    if (sec == null || sec < 0) return '–';
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h} Std ${m} Min` : `${m}:${String(s).padStart(2, '0')}`;
  };

  function gmGet(url, type = 'json') {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 15000,
        headers: { Accept: type === 'json' ? 'application/json' : 'text/html' },
        onload: (r) => {
          if (r.status < 200 || r.status >= 300) return reject(new Error('HTTP ' + r.status));
          if (type !== 'json') return resolve(r.responseText);
          try { resolve(JSON.parse(r.responseText)); } catch { reject(new Error('Antwort ist kein JSON')); }
        },
        onerror: () => reject(new Error('Netzwerkfehler')),
        ontimeout: () => reject(new Error('Zeitüberschreitung')),
      });
    });
  }

  // ------------------------------------------------------------------
  // Cache
  // ------------------------------------------------------------------
  const CACHE_KEY = 'fcpt_cache';
  const cache = GM_getValue(CACHE_KEY, {});
  const ttl = () => CONFIG.cacheMinutes * 60000;
  for (const k of Object.keys(cache)) if (Date.now() - cache[k].t > ttl()) delete cache[k];
  const cacheGet = (k) => (cache[k] && Date.now() - cache[k].t <= ttl() ? cache[k].v : undefined);
  let lastPriceFetch = Object.values(cache).reduce((m, c) => Math.max(m, c.t || 0), 0) || null;
  const cacheSet = (k, v) => { cache[k] = { t: Date.now(), v }; lastPriceFetch = Date.now(); GM_setValue(CACHE_KEY, cache); };
  const cacheClear = () => { for (const k of Object.keys(cache)) delete cache[k]; GM_setValue(CACHE_KEY, cache); };
  const agoText = (t) => {
    if (!t) return 'noch keine';
    const m = Math.floor((Date.now() - t) / 60000);
    return m < 1 ? 'gerade eben' : m === 1 ? 'vor 1 Min.' : m < 60 ? `vor ${m} Min.` : `vor ${Math.floor(m / 60)} Std.`;
  };

  // ------------------------------------------------------------------
  // Preisquellen – jede Quelle liefert eine Zahl (oder null)
  // Wenn eine Seite ihr Format ändert, muss nur der passende Block angepasst werden.
  // ------------------------------------------------------------------
  // Futbin hat keine offene Preis-Schnittstelle mehr. Das Skript liest deshalb die Futbin-Seiten
  // so, wie sie im Browser angezeigt werden: 1) Suche nach dem Namen -> Futbin-Spielerseite finden
  // (wird dauerhaft gemerkt), 2) Spielerseite -> niedrigster Preis für Konsole bzw. PC.
  // FUT.GG (Preise per Einmal-Schlüssel geschützt) und Futwiz (liefert für FC 27 keine Preise)
  // sind deshalb nicht mehr enthalten.
  const FB_KEY = 'fcpt_futbin_ids';
  const futbinIds = GM_getValue(FB_KEY, {});
  const futbinUrl = (rid) => (futbinIds[rid] ? `https://www.futbin.com${futbinIds[rid]}` : null);
  const isCfPage = (html) => /Just a moment|cf-challenge|challenge-platform\/h\/[a-z]\/orchestrate/i.test(html) && !/price-box/.test(html);

  async function futbinFind(p, query) {
    const html = await gmGet(`https://www.futbin.com/players?search=${encodeURIComponent(query)}`, 'text');
    if (isCfPage(html)) throw new Error('Futbin-Schutzseite – öffne futbin.com einmal in einem Tab, dann erneut versuchen');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const tr of doc.querySelectorAll('tbody tr')) {
      const img = tr.querySelector(`img[src*="/players/${p.resourceId}."], img[src*="/players/p${p.resourceId}."]`);
      const a = tr.querySelector('a[href*="/player/"]');
      if (img && a) return a.getAttribute('href');
    }
    return null;
  }

  const SOURCES = {
    futbin: {
      label: 'Futbin',
      async price(p) {
        let path = futbinIds[p.resourceId];
        if (!path) {
          path = await futbinFind(p, p.name);
          if (!path && p.fullName && p.fullName !== p.name) path = await futbinFind(p, p.fullName);
          if (!path) throw new Error('Karte bei Futbin nicht gefunden');
          futbinIds[p.resourceId] = path;
          GM_setValue(FB_KEY, futbinIds);
        }
        const html = await gmGet(`https://www.futbin.com${path}`, 'text');
        if (isCfPage(html)) throw new Error('Futbin-Schutzseite – öffne futbin.com einmal in einem Tab, dann erneut versuchen');
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const plat = settings.platform === 'pc' ? 'pc' : 'ps';
        const el = doc.querySelector(`.price-box.platform-${plat}-only .lowest-price-1`) ||
          doc.querySelector(`.platform-${plat}-only .lowest-price-1`);
        return toNum(el && el.textContent);
      },
    },
  };

  // Gemeinsamer Preis-Abruf: Cache, keine doppelten Anfragen, Pause zwischen Anfragen je Seite
  const inflight = {};
  const queues = {};
  function enqueue(key, fn) {
    const run = (queues[key] || Promise.resolve()).then(() => fn());
    queues[key] = run.catch(() => {}).then(() => sleep(CONFIG.requestDelayMs + Math.random() * 400));
    return run;
  }
  function getPrice(key, p) {
    const ck = `${key}:${settings.platform}:${p.resourceId}`;
    const cached = cacheGet(ck);
    if (cached !== undefined) return Promise.resolve(cached);
    if (inflight[ck]) return inflight[ck];
    const pr = enqueue(key, () => SOURCES[key].price(p))
      .then((v) => { cacheSet(ck, v); return v; })
      .finally(() => { delete inflight[ck]; });
    inflight[ck] = pr;
    return pr;
  }
  const enabledSources = () => Object.keys(SOURCES).filter((k) => settings.sources[k]);

  // ------------------------------------------------------------------
  // Daten aus der EA Web App lesen
  // ------------------------------------------------------------------
  function loadTransferList() {
    return new Promise((resolve, reject) => {
      const svc = W.services && W.services.Item;
      if (!svc || typeof svc.requestTransferItems !== 'function') {
        return reject(new Error('Web App noch nicht bereit. Bitte einloggen, kurz warten und erneut auf „Aktualisieren“ klicken.'));
      }
      svc.requestTransferItems().observe(W, function (observer, res) {
        if (observer && typeof observer.unobserve === 'function') observer.unobserve(W);
        if (!res || !res.success) return reject(new Error('EA hat die Transferliste nicht geliefert.'));
        resolve((res.response && res.response.items) || (res.data && res.data.items) || []);
      });
    });
  }

  // EA liefert die Position als Zahl -> deutsche Kürzel wie in der Web App
  const POS = ['TW', 'LIB', 'RAV', 'RV', 'IV', 'IV', 'IV', 'LV', 'LAV', 'ZDM', 'ZDM', 'ZDM', 'RM', 'ZM', 'ZM', 'ZM', 'LM',
    'ZOM', 'ZOM', 'ZOM', 'RS', 'MS', 'LS', 'RF', 'ST', 'ST', 'ST', 'LF'];
  const posName = (v) => (typeof v === 'number' ? POS[v] || '' : v || '');

  // Selbst eingetragene Kaufpreise (für gezogene Karten oder wenn EA keinen kennt), je Item-ID
  const BOUGHT_KEY = 'fcpt_bought';
  const manualBought = GM_getValue(BOUGHT_KEY, {});
  function setManualBought(itemId, price) {
    if (itemId == null) return;
    if (price) manualBought[itemId] = price; else delete manualBought[itemId];
    GM_setValue(BOUGHT_KEY, manualBought);
  }

  function mapItem(it) {
    try {
      const a = typeof it.getAuctionData === 'function' ? it.getAuctionData() : it._auction || {};
      const sd = typeof it.getStaticData === 'function' ? it.getStaticData() : it._staticData || {};
      const isPlayer = typeof it.isPlayer === 'function' ? it.isPlayer() : it.type === 'player';
      const state = a.tradeState;
      const sold = typeof a.isSold === 'function' ? a.isSold() : state === 'closed';
      const expired = !sold && (typeof a.isExpired === 'function' ? a.isExpired() : state === 'expired');
      const active = !sold && !expired && state === 'active';
      const manual = it.id != null ? toNum(manualBought[it.id]) : null;
      const bought = manual || toNum(it.lastSalePrice);
      const soldFor = sold ? toNum(a.currentBid) || toNum(a.buyNowPrice) : null;
      const buyNow = toNum(a.buyNowPrice);

      return {
        isPlayer,
        resourceId: it.resourceId || it.definitionId,
        name: sd.name || [sd.firstName, sd.lastName].filter(Boolean).join(' ') || `#${it.definitionId}`,
        rating: it.rating,
        position: posName(it.preferredPosition),
        fullName: [sd.firstName, sd.lastName].filter(Boolean).join(' '),
        startPrice: toNum(a.startingBid),
        buyNow,
        currentBid: toNum(a.currentBid),
        expires: a.expires,
        sold, expired, active,
        bought,
        soldFor,
        profit: soldFor ? afterTax(soldFor) - (bought || 0) : null,
        potentialProfit: !sold && buyNow ? afterTax(buyNow) - (bought || 0) : null,
        itemId: it.id,
        boughtManual: !!manual,
        tradeId: a.tradeId,
        tradeOwner: typeof a.tradeOwner === 'boolean' ? a.tradeOwner : null,
        bidState: a.bidState,
      };
    } catch (e) {
      log('Item konnte nicht gelesen werden', e);
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Profit-Historie: jeder erkannte Verkauf wird dauerhaft gespeichert
  // ------------------------------------------------------------------
  const HIST_KEY = 'fcpt_history';
  let history = GM_getValue(HIST_KEY, []);
  let onHistoryChange = () => {};
  function recordSale(p) {
    if (!p || !p.sold || !p.soldFor) return;
    if (p.itemId == null && p.tradeId == null) return;
    const k = `${p.itemId}:${p.tradeId}`;
    if (history.some((h) => h.k === k)) return;
    history.push({ k, t: Date.now(), name: p.name, rating: p.rating, bought: p.bought || 0, sold: p.soldFor, profit: p.profit });
    if (history.length > CONFIG.historyMax) history = history.slice(-CONFIG.historyMax);
    GM_setValue(HIST_KEY, history);
    onHistoryChange();
  }

  // ------------------------------------------------------------------
  // Warnung bei falschem Verkaufspreis (eigene Karten)
  // ------------------------------------------------------------------
  function listingWarn(p, market) {
    if (!market || !p.buyNow || p.sold || !(p.active || p.expired)) return '';
    if (p.buyNow < market) {
      return `<span class="fcpt-chip loss">⚠ Sofortkauf ${fmt(market - p.buyNow)} unter Marktpreis</span>`;
    }
    if (p.buyNow > market * (1 + CONFIG.overpriceTolerance)) {
      return `<span class="fcpt-chip warn">⚠ ${Math.round((p.buyNow / market - 1) * 100)} % über Marktpreis – verkauft evtl. nicht</span>`;
    }
    return '';
  }

  // ------------------------------------------------------------------
  // Oberfläche
  // ------------------------------------------------------------------
  GM_addStyle(`
    #fcpt-btn{position:fixed;right:24px;bottom:24px;z-index:100000;background:linear-gradient(135deg,#f9d85a,#e0a800);color:#1a1300;border:0;border-radius:999px;padding:11px 18px;font:700 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.4);transition:transform .12s}
    #fcpt-btn:hover{transform:translateY(-1px)}
    #fcpt-panel{--bg:#0b111c;--bg2:#121a28;--bg3:#1a2436;--line:#243149;--ink:#eef2f8;--ink2:#a7b3c6;--ink3:#7d8aa0;--gold:#f5c518;--pos:#22c55e;--neg:#ef4444;--warn:#f59e0b;--blue:#3b82f6;
      position:fixed;top:0;right:0;width:440px;max-width:100vw;height:100vh;z-index:99999;background:var(--bg);color:var(--ink);font:14px system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:-10px 0 30px rgba(0,0,0,.55);display:none;flex-direction:column;border-left:1px solid var(--line)}
    #fcpt-panel.open{display:flex;animation:fcptIn .18s ease-out}
    @keyframes fcptIn{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
    #fcpt-panel *{box-sizing:border-box}
    .fcpt-head{padding:14px 14px 10px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:10px;background:linear-gradient(180deg,#111a2a,var(--bg))}
    .fcpt-top{display:flex;align-items:center;gap:10px}
    .fcpt-brand{display:flex;align-items:center;gap:10px;flex:1;min-width:0}
    .fcpt-logo{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(135deg,#f9d85a,#e0a800);font-size:18px;flex:none}
    .fcpt-brand .t{font-weight:800;font-size:15px;letter-spacing:.2px}
    .fcpt-icons{display:flex;gap:6px}
    .fcpt-icons .ic{width:34px;height:34px;border-radius:10px;background:var(--bg3);border:1px solid var(--line);color:var(--ink);font:16px system-ui;cursor:pointer;display:grid;place-items:center}
    .fcpt-icons .ic:hover{border-color:var(--gold);color:var(--gold)}
    .fcpt-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    #fcpt-panel select{background:var(--bg3);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px 8px;font:inherit;font-size:13px;cursor:pointer}
    .fcpt-tabs{display:flex;gap:4px;background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:3px}
    .fcpt-tabs button{flex:1;background:transparent;color:var(--ink2);border:0;border-radius:8px;padding:7px 6px;font:600 13px system-ui,sans-serif;cursor:pointer}
    .fcpt-tabs button.on{background:var(--gold);color:#1a1300}
    .fcpt-sum{font-size:13px;color:var(--ink2)}
    .fcpt-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .fcpt-list{overflow:auto;padding:10px 12px 90px;display:flex;flex-direction:column;gap:8px;flex:1}
    .fcpt-settings{display:none;overflow:auto;padding:12px 14px 90px;flex:1;flex-direction:column;gap:12px}
    #fcpt-panel.v-settings .fcpt-settings{display:flex}
    #fcpt-panel.v-settings .fcpt-list,#fcpt-panel.v-settings .fcpt-sum,#fcpt-panel.v-settings .fcpt-toolbar,#fcpt-panel.v-hist .fcpt-toolbar{display:none}
    .fcpt-sgroup{background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:10px}
    .fcpt-sgroup h4{margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.6px;color:var(--ink3)}
    .fcpt-set{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;color:var(--ink)}
    .fcpt-set small{display:block;color:var(--ink3);font-size:11px}
    .fcpt-sw{appearance:none;-webkit-appearance:none;width:38px;height:22px;border-radius:999px;background:#334155;position:relative;cursor:pointer;flex:none;transition:background .15s;margin:0}
    .fcpt-sw::after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s}
    .fcpt-sw:checked{background:var(--pos)}.fcpt-sw:checked::after{left:19px}
    .fcpt-settings input[type=number]{width:96px;background:var(--bg3);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px 8px;font:inherit;text-align:right}
    .fcpt-card{position:relative;border:1px solid var(--line);border-left:4px solid #475569;border-radius:12px;padding:10px 12px;background:var(--bg2);transition:border-color .15s}
    .fcpt-card:hover{border-color:#34445f}
    .fcpt-card.sold{border-left-color:var(--pos)}.fcpt-card.expired{border-left-color:var(--warn)}.fcpt-card.active{border-left-color:var(--blue)}
    .c-top{display:flex;align-items:center;gap:10px}
    .c-badge{width:42px;height:48px;border-radius:8px;background:linear-gradient(160deg,#f6e08a,#c9a227);color:#241a00;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.5)}
    .c-badge b{font-size:17px;line-height:1}.c-badge small{font-size:10px;font-weight:700;opacity:.8}
    .c-main{flex:1;min-width:0}
    .c-name{font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .c-status{display:inline-block;margin-top:3px;font-size:11px;font-weight:600;border-radius:999px;padding:2px 8px;background:#1f2a3c;color:var(--ink2)}
    .c-status.sold{background:rgba(34,197,94,.15);color:#86efac}.c-status.expired{background:rgba(245,158,11,.15);color:#fcd34d}.c-status.active{background:rgba(59,130,246,.15);color:#93c5fd}
    .c-profit{text-align:right;flex:none}
    .c-profit .fcpt-profit{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums}
    .c-profit .c-plabel{font-size:11px;color:var(--ink3)}
    .c-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px}
    .c-stats>div{background:var(--bg3);border-radius:8px;padding:5px 7px}
    .c-stats span{display:block;font-size:10.5px;color:var(--ink3)}
    .c-stats b{font-size:13px;font-variant-numeric:tabular-nums}
    .fcpt-pos-v{color:var(--pos,#22c55e)}.fcpt-neg-v{color:var(--neg,#ef4444)}.fcpt-muted{color:var(--ink3,#8b98aa);font-weight:400}
    .fcpt-chips{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
    .fcpt-chip{background:#1f2b3d;border-radius:999px;padding:3px 9px;font-size:12px;color:#c7d0dc}
    .fcpt-chip b{color:#fff}
    .fcpt-msg{padding:24px 16px;color:var(--ink2);text-align:center}
    #fcpt-keyhint{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99998;display:none;gap:10px;align-items:center;background:rgba(11,17,28,.92);border:1px solid #243149;border-radius:12px;padding:7px 12px;font:12px system-ui,sans-serif;color:#a7b3c6;box-shadow:0 6px 18px rgba(0,0,0,.4);backdrop-filter:blur(4px)}
    #fcpt-keyhint.show{display:flex}
    #fcpt-keyhint kbd{display:inline-block;min-width:20px;text-align:center;background:#1a2436;border:1px solid #3a4a66;border-bottom-width:2px;border-radius:5px;padding:1px 5px;margin-right:4px;color:#f5c518;font:700 12px system-ui,sans-serif}
    @media (pointer:coarse){#fcpt-keyhint{display:none !important}}
    .fcpt-inline{flex-basis:100%;width:100%;display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0 2px;font:12px system-ui,sans-serif;color:#c7d0dc}
    .fcpt-inline .fcpt-chip.main{background:#2a3a14;color:#e7f5c8}
    .fcpt-inline .fcpt-chip.profit{background:#10301f}
    .fcpt-inline .fcpt-chip.loss,.fcpt-card .fcpt-chip.loss{background:#3a1515;color:#fecaca}
    .fcpt-inline .fcpt-chip.warn,.fcpt-card .fcpt-chip.warn{background:#3a2a0e;color:#fde68a}
    .fcpt-inline .fcpt-chip.deal{background:#15803d;color:#fff;font-weight:600}
    .fcpt-bargain{outline:3px solid #22c55e !important;outline-offset:-3px;border-radius:6px}
    .fcpt-head input[type=number]{width:80px;background:#1c2636;color:#e8ecf2;border:1px solid #33425a;border-radius:6px;padding:4px 6px;font:inherit}
    .fcpt-tiles{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
    .fcpt-tile{background:#172131;border:1px solid #243044;border-radius:10px;padding:10px 12px}
    .fcpt-tile .l{color:#8b98aa;font-size:12px}.fcpt-tile .v{font-size:20px;font-weight:700}.fcpt-tile .s{color:#8b98aa;font-size:12px}
    .fcpt-hist{width:100%;border-collapse:collapse;font-size:13px}
    .fcpt-hist th{text-align:left;color:#8b98aa;font-weight:500;padding:6px 4px;border-bottom:1px solid #243044}
    .fcpt-hist td{padding:6px 4px;border-bottom:1px solid #1c2636}
    .fcpt-hist td.n{text-align:right;font-variant-numeric:tabular-nums}
    .fcpt-actions{display:flex;gap:8px}
    .fcpt-actions button{background:#1c2636;color:#e8ecf2;border:1px solid #33425a;border-radius:6px;padding:6px 10px;font:inherit;cursor:pointer}
    .fcpt-warn:empty{display:none}.fcpt-warn{margin-top:6px;display:flex}
    a.fcpt-chip{text-decoration:none !important;cursor:pointer}a.fcpt-chip:hover{outline:1px solid #f5c518}
    #fcpt-bidbar .st:empty{display:none}
    .fcpt-keys{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;width:100%}
    .fcpt-keys label{flex-direction:column;align-items:flex-start !important;gap:2px !important}
    .fcpt-keys label{font-size:11px;color:var(--ink3);display:flex}
    .fcpt-keys input{width:100%;text-align:center;background:#1c2636;color:#f5c518;border:1px solid #33425a;border-radius:6px;padding:4px;font:600 13px system-ui,sans-serif;text-transform:uppercase}
    #fcpt-toast{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:100001;background:#0f1622;color:#e8ecf2;border:1px solid #33425a;border-left:4px solid #f5c518;border-radius:8px;padding:8px 14px;font:600 13px system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.5);opacity:0;transition:opacity .15s;pointer-events:none}
    #fcpt-toast.show{opacity:1}#fcpt-toast.err{border-left-color:#ef4444}
    button.fcpt-edit{border:1px dashed #4b5d78;cursor:pointer;font:inherit;font-size:12px}
    button.fcpt-edit:hover{border-color:#f5c518}
    .fcpt-boughtinput{width:110px;background:#1c2636;color:#e8ecf2;border:1px solid #f5c518;border-radius:999px;padding:3px 10px;font:12px system-ui,sans-serif}
    .fcpt-sec{margin-top:4px;font-size:13px;font-weight:600;color:#c7d0dc}
    .fcpt-chart{background:#172131;border:1px solid #243044;border-radius:10px;padding:8px}
    .fcpt-chart svg{width:100%;height:auto;display:block}
    .fcpt-chart .cap{font-size:11px;color:#8b98aa;margin-bottom:4px;display:flex;justify-content:space-between}
    .fcpt-2col{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .fcpt-mini{background:#172131;border:1px solid #243044;border-radius:10px;padding:8px 10px;font-size:12px}
    .fcpt-mini .h{color:#8b98aa;margin-bottom:4px}
    .fcpt-mini .r{display:flex;justify-content:space-between;gap:6px;padding:2px 0}
    .fcpt-mini .r span:first-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}a.fcpt-chip:hover{outline:1px solid #f5c518}
    .fcpt-good{box-shadow:inset 5px 0 0 #22c55e !important}
    .fcpt-bad{box-shadow:inset 5px 0 0 #ef4444 !important}
    .fcpt-meh{box-shadow:inset 5px 0 0 #f59e0b !important}
    .fcpt-overview{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
    .fcpt-overview>div{background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:7px 9px}
    .fcpt-overview .l{color:#8b98aa;font-size:11px}.fcpt-overview .v{font-weight:700;font-size:15px}
    .fcpt-stand{font-size:12px;color:#8b98aa}
    #fcpt-listbtn{margin:8px 0;width:100%;background:#f5c518;color:#111;border:0;border-radius:6px;padding:9px 12px;font:600 14px system-ui,sans-serif;cursor:pointer}
    #fcpt-listbtn[disabled]{opacity:.5;cursor:default}
    .fcpt-listhint{font:12px system-ui,sans-serif;color:#9aa7b8;margin-bottom:6px}
    #fcpt-bidbar{position:fixed;right:160px;bottom:20px;z-index:100000;display:none;align-items:center;gap:8px;background:#0f1622;border:1px solid #33425a;border-radius:999px;padding:6px 8px 6px 14px;font:13px system-ui,sans-serif;color:#e8ecf2;box-shadow:0 4px 14px rgba(0,0,0,.45)}
    #fcpt-bidbar.show{display:flex}
    #fcpt-bidbar input{width:90px;background:#1c2636;color:#e8ecf2;border:1px solid #33425a;border-radius:6px;padding:5px 6px;font:inherit}
    #fcpt-bidbar button{background:#3b82f6;color:#fff;border:0;border-radius:999px;padding:7px 14px;font:600 13px system-ui,sans-serif;cursor:pointer}
    #fcpt-bidbar button.stop{background:#ef4444}
    #fcpt-bidbar .st{color:#9aa7b8;max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .fcpt-inline .fcpt-chip.nb{background:#1e3a5f;color:#dbeafe}
    .fcpt-inline .fcpt-chip.nb.over{background:#1f2b3d;color:#8b98aa}
    .fcpt-inline .fcpt-chip.bidok{background:#1d4ed8;color:#fff;font-weight:600}
    .fcpt-inline .fcpt-chip.biderr{background:#7f1d1d;color:#fff}
    @media (max-width: 700px){
      #fcpt-panel{width:100vw;font-size:13px}
      #fcpt-btn{right:12px;bottom:88px;padding:9px 13px;font-size:13px}
      #fcpt-bidbar{left:8px;right:8px;bottom:140px;border-radius:14px;flex-wrap:wrap;font-size:12px;padding:6px 8px}
      #fcpt-bidbar input{width:72px}
      #fcpt-bidbar button{padding:6px 10px;font-size:12px}
      #fcpt-bidbar .st{max-width:100%}
      .c-stats{grid-template-columns:repeat(2,1fr)}
      .fcpt-overview{grid-template-columns:1fr 1fr 1fr}
      .fcpt-overview .v{font-size:13px}
      .fcpt-2col{grid-template-columns:1fr}
      .fcpt-inline{font-size:11px;gap:4px}

    }
  `);

  const btn = document.createElement('button');
  btn.id = 'fcpt-btn';
  btn.innerHTML = '💰 Preise';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'fcpt-panel';
  panel.innerHTML = `
    <div class="fcpt-head">
      <div class="fcpt-top">
        <div class="fcpt-brand"><span class="fcpt-logo">💰</span>
          <div><div class="t">FC27 Preis-Tool</div><div class="fcpt-stand"></div></div></div>
        <div class="fcpt-icons">
          <button class="ic" data-act="refresh" title="Transferliste neu laden">↻</button>
          <button class="ic" data-act="reload" title="Alle Preise sofort frisch von Futbin holen">⟳</button>
          <button class="ic" data-act="close" title="Schließen">✕</button>
        </div>
      </div>
      <div class="fcpt-tabs"><button data-tab="list" class="on">Transferliste</button><button data-tab="hist">Historie</button><button data-tab="settings">⚙ Einstellungen</button></div>
      <div class="fcpt-sum"></div>
      <div class="fcpt-toolbar">
        <select data-set="sort">
          <option value="status">Sortieren: Status</option>
          <option value="profitDesc">Profit – beste zuerst</option>
          <option value="profitAsc">Profit – schlechteste zuerst</option>
          <option value="marketDesc">Marktpreis – höchster zuerst</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>
    </div>
    <div class="fcpt-settings">
      <div class="fcpt-sgroup"><h4>Preise</h4>
        <div class="fcpt-set"><span>Plattform</span><select data-set="platform"><option value="ps">Konsole</option><option value="pc">PC</option></select></div>
        <div class="fcpt-set" style="display:none"><select data-set="mainSource">${Object.entries(SOURCES).map(([k, s2]) => `<option value="${k}">${s2.label}</option>`).join('')}</select>
          ${Object.entries(SOURCES).map(([k, s2]) => `<input type="checkbox" data-src="${k}">`).join('')}</div>
        <div class="fcpt-set"><span>Automatisch aktualisieren<small>Alle 15 Min. neue Preise, solange der Tab offen ist</small></span><input type="checkbox" class="fcpt-sw" data-opt="autoRefresh"></div>
      </div>
      <div class="fcpt-sgroup"><h4>Anzeige</h4>
        <div class="fcpt-set"><span>Preise in EAs Liste anzeigen</span><input type="checkbox" class="fcpt-sw" data-opt="inline"></div>
        <div class="fcpt-set"><span>Ampel-Farben<small>Grün = Gewinn, Rot = Verlust, Orange = Preis falsch</small></span><input type="checkbox" class="fcpt-sw" data-opt="ampel"></div>
        <div class="fcpt-set"><span>Schnäppchen ab<small>Mindest-Profit nach Steuer auf dem Transfermarkt</small></span><input type="number" min="0" step="100" data-num="minBargain"></div>
      </div>
      <div class="fcpt-sgroup"><h4>Tastenkürzel zum Snipen</h4>
        <div class="fcpt-set"><span>Tastenkürzel aktiv</span><input type="checkbox" class="fcpt-sw" data-opt="hotkeys"></div>
        <div class="fcpt-set"><span>Min.-Sofortkauf bei jeder Suche ändern<small>Sorgt für frische Suchergebnisse</small></span><input type="checkbox" class="fcpt-sw" data-opt="bumpMinBin"></div>
        <div class="fcpt-set"><span>Nach Bestätigen zurück zur Suche</span><input type="checkbox" class="fcpt-sw" data-opt="autoBack"></div>
        <div class="fcpt-set"><span>Preis-Tasten ändern</span>
          <select data-set="stepField">
            <option value="2">Min.-Sofortkauf</option><option value="3">Max.-Sofortkauf</option>
            <option value="0">Min.-Gebot</option><option value="1">Max.-Gebot</option>
          </select></div>
        <div class="fcpt-keys">
          <label>Suchen<input data-key="search" maxlength="12"></label>
          <label>Sofortkauf<input data-key="buy" maxlength="12"></label>
          <label>Bestätigen<input data-key="confirm" maxlength="12"></label>
          <label>Zurück<input data-key="back" maxlength="12"></label>
          <label>Preis hoch<input data-key="up" maxlength="12"></label>
          <label>Preis runter<input data-key="down" maxlength="12"></label>
        </div>
        <small style="color:#7d8aa0;font-size:11px">In ein Feld klicken und die neue Taste drücken.</small>
      </div>
    </div>
    <div class="fcpt-list"><div class="fcpt-msg">Klicke auf ↻, um deine Transferliste zu laden.</div></div>`;
  document.body.appendChild(panel);

  const listEl = panel.querySelector('.fcpt-list');
  const sumEl = panel.querySelector('.fcpt-sum');
  panel.querySelector('[data-set="platform"]').value = settings.platform;
  panel.querySelector('[data-set="mainSource"]').value = settings.mainSource;
  panel.querySelectorAll('[data-src]').forEach((cb) => { cb.checked = !!settings.sources[cb.dataset.src]; });
  panel.querySelector('[data-opt="inline"]').checked = !!settings.inline;
  panel.querySelector('[data-num="minBargain"]').value = settings.minBargain;
  panel.querySelector('[data-opt="autoRefresh"]').checked = !!settings.autoRefresh;
  panel.querySelector('[data-opt="ampel"]').checked = !!settings.ampel;
  panel.querySelector('[data-opt="hotkeys"]').checked = !!settings.hotkeys;
  panel.querySelector('[data-opt="bumpMinBin"]').checked = !!settings.bumpMinBin;
  panel.querySelector('[data-opt="autoBack"]').checked = !!settings.autoBack;
  panel.querySelector('[data-set="stepField"]').value = String(settings.stepField);
  const keyLabel = (k) => (k === ' ' ? 'Leertaste' : k.length === 1 ? k.toUpperCase() : k);
  panel.querySelectorAll('[data-key]').forEach((inp) => {
    inp.value = keyLabel(settings.keys[inp.dataset.key]);
    inp.addEventListener('keydown', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(ev.key)) return;
      settings.keys[inp.dataset.key] = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
      inp.value = keyLabel(ev.key);
      saveSettings(); inp.blur();
    });
  });
  panel.querySelector('[data-set="sort"]').value = settings.sort;
  const standEl = panel.querySelector('.fcpt-stand');
  const updateStand = () => { standEl.textContent = `Preise: ${agoText(lastPriceFetch)}`; };
  updateStand();
  let view = 'list';

  let items = [];
  const ownIds = new Set();   // Item-IDs deiner eigenen Transferliste
  let priceStore = {};
  let runId = 0;

  const setMsg = (m) => { listEl.innerHTML = `<div class="fcpt-msg">${esc(m)}</div>`; sumEl.textContent = ''; };

  function marketPrice(rid) {
    const ps = priceStore[rid] || {};
    if (settings.sources[settings.mainSource] && ps[settings.mainSource]?.v) return ps[settings.mainSource].v;
    for (const k of Object.keys(SOURCES)) if (settings.sources[k] && ps[k]?.v) return ps[k].v;
    return null;
  }

  function chipsHtml(rid) {
    const ps = priceStore[rid] || {};
    return Object.entries(SOURCES)
      .filter(([k]) => settings.sources[k])
      .map(([k, s]) => {
        const e = ps[k] || {};
        const val = e.loading || (!('v' in e) && !e.err) ? '…' : e.err ? '✕' : fmt(e.v);
        const url = k === 'futbin' ? futbinUrl(rid) : null;
        return url
          ? `<a class="fcpt-chip" href="${url}" target="_blank" rel="noopener" title="Futbin-Seite öffnen">${s.label}: <b>${val}</b> ↗</a>`
          : `<span class="fcpt-chip" title="${esc(e.err || '')}">${s.label}: <b>${val}</b></span>`;
      }).join('');
  }

  const profitCls = (n) => (n == null ? '' : n >= 0 ? 'fcpt-pos-v' : 'fcpt-neg-v');

  function profitValue(p, market) {
    if (p.sold) return p.profit;
    if (p.potentialProfit != null) return p.potentialProfit;
    if (market && p.bought) return afterTax(market) - p.bought;
    return null;
  }

  function overviewHtml() {
    const open = items.filter((p) => p.isPlayer && !p.sold);
    let value = 0, profit = 0, withPrice = 0;
    for (const p of open) {
      const m = marketPrice(p.resourceId);
      if (!m) continue;
      withPrice++; value += m;
      if (p.bought) profit += afterTax(m) - p.bought;
    }
    const sold = items.filter((p) => p.sold);
    const soldProfit = sold.reduce((s2, p) => s2 + (p.profit || 0), 0);
    return `<div class="fcpt-overview">
      <div><div class="l">Wert der Liste (Markt)</div><div class="v">${fmt(value)}</div></div>
      <div><div class="l">Profit bei Verkauf zum Markt</div><div class="v ${profitCls(profit)}">${signed(profit)}</div></div>
      <div><div class="l">Verkauft (${sold.length})</div><div class="v ${profitCls(soldProfit)}">${signed(soldProfit)}</div></div>
    </div><div class="fcpt-stand" style="margin-top:4px">${items.length} Karten · Preise für ${withPrice} von ${open.length} offenen Karten geladen</div>`;
  }
  let ovTimer = null;
  const updateOverview = () => {
    if (view !== 'list' || !items.length) return;
    clearTimeout(ovTimer);
    ovTimer = setTimeout(() => { sumEl.innerHTML = overviewHtml(); updateStand(); }, 150);
  };

  function profitCell(p, market) {
    const v = profitValue(p, market);
    return v == null ? '<span class="fcpt-muted">–</span>' : `<span class="${profitCls(v)}">${signed(v)}</span>`;
  }
  const profitLabel = (p) => (p.sold ? 'Netto-Profit' : p.potentialProfit != null ? 'bei Sofortkauf' : 'bei Marktpreis');

  function cardHtml(p) {
    const cls = p.sold ? 'sold' : p.expired ? 'expired' : p.active ? 'active' : '';
    const status = p.sold ? '✓ Verkauft' : p.expired ? 'Abgelaufen' : p.active ? `⏱ ${fmtTime(p.expires)}` : 'Nicht gelistet';
    const midLabel = p.sold ? 'Verkauft' : 'Gebot';
    const midVal = p.sold ? fmt(p.soldFor) : fmt(p.currentBid);
    const market = p.isPlayer ? marketPrice(p.resourceId) : null;
    const boughtChip = p.sold
      ? `<span class="fcpt-chip">Gekauft: <b>${p.bought ? fmt(p.bought) : 'gezogen'}</b></span>`
      : `<button class="fcpt-chip fcpt-edit" data-act="editBought" data-iid="${p.itemId ?? ''}" title="Kaufpreis eintragen/ändern">Gekauft: <b>${p.bought ? fmt(p.bought) : 'gezogen'}</b>${p.boughtManual ? ' (manuell)' : ''} ✎</button>`;
    return `
      <div class="fcpt-card ${cls}" data-rid="${p.resourceId}" data-iid="${p.itemId ?? ''}">
        <div class="c-top">
          <div class="c-badge"><b>${esc(p.rating ?? '')}</b><small>${esc(p.position)}</small></div>
          <div class="c-main"><div class="c-name">${esc(p.name)}</div><span class="c-status ${cls}">${esc(status)}</span></div>
          <div class="c-profit"><div class="fcpt-profit">${profitCell(p, market)}</div><div class="c-plabel">${profitLabel(p)}</div></div>
        </div>
        <div class="c-stats">
          <div><span>Start</span><b>${fmt(p.startPrice)}</b></div>
          <div><span>Sofortkauf</span><b>${fmt(p.buyNow)}</b></div>
          <div><span>${midLabel}</span><b>${midVal}</b></div>
          <div><span>Markt</span><b class="fcpt-market">${p.isPlayer ? fmt(market) : '–'}</b></div>
        </div>
        <div class="fcpt-chips">${boughtChip}<span class="fcpt-prices" style="display:contents">${p.isPlayer ? chipsHtml(p.resourceId) : ''}</span></div>
        <div class="fcpt-warn">${p.isPlayer ? listingWarn(p, market) : ''}</div>
      </div>`;
  }

  function render() {
    if (view === 'settings') return;
    if (view === 'hist') return renderHistory();
    if (!items.length) return setMsg('Deine Transferliste ist leer.');
    const order = (p) => (p.sold ? 0 : p.expired ? 1 : p.active ? 2 : 3);
    const pv = (p) => profitValue(p, p.isPlayer ? marketPrice(p.resourceId) : null);
    const cmp = {
      status: (a, b) => order(a) - order(b),
      profitDesc: (a, b) => (pv(b) ?? -1e12) - (pv(a) ?? -1e12),
      profitAsc: (a, b) => (pv(a) ?? 1e12) - (pv(b) ?? 1e12),
      marketDesc: (a, b) => (marketPrice(b.resourceId) || 0) - (marketPrice(a.resourceId) || 0),
      name: (a, b) => String(a.name).localeCompare(String(b.name), 'de'),
    }[settings.sort] || ((a, b) => order(a) - order(b));
    const sorted = [...items].sort(cmp);
    listEl.innerHTML = sorted.map(cardHtml).join('');
    sumEl.innerHTML = overviewHtml();
    updateStand();
  }

  function updatePrices(rid) {
    panel.querySelectorAll(`.fcpt-card[data-rid="${rid}"]`).forEach((card) => {
      card.querySelector('.fcpt-prices').innerHTML = chipsHtml(rid);
      card.querySelector('.fcpt-market').textContent = fmt(marketPrice(rid));
      const p = items.find((x) => card.dataset.iid !== '' && String(x.itemId) === card.dataset.iid) ||
        items.find((x) => String(x.resourceId) === card.dataset.rid);
      if (p) {
        card.querySelector('.fcpt-warn').innerHTML = listingWarn(p, marketPrice(rid));
        const pc = card.querySelector('.fcpt-profit');
        if (pc) pc.innerHTML = profitCell(p, marketPrice(rid));
      }
    });
    updateOverview();
  }

  function sumSince(ms) {
    const from = ms == null ? 0 : ms;
    const rows = history.filter((h) => h.t >= from);
    return { n: rows.length, profit: rows.reduce((s, h) => s + (h.profit || 0), 0) };
  }

  function renderHistory() {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const tiles = [
      ['Heute', sumSince(d0.getTime())],
      ['Letzte 7 Tage', sumSince(Date.now() - 7 * 864e5)],
      ['Letzte 30 Tage', sumSince(Date.now() - 30 * 864e5)],
      ['Gesamt', sumSince(null)],
    ].map(([l, x]) => `<div class="fcpt-tile"><div class="l">${l}</div><div class="v ${profitCls(x.profit)}">${signed(x.profit)}</div><div class="s">${x.n} Verkäufe</div></div>`).join('');
    const rows = [...history].sort((a, b) => b.t - a.t).slice(0, 200).map((h) => `
      <tr><td>${new Date(h.t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
      <td>${esc(h.rating ?? '')} ${esc(h.name)}</td><td class="n">${h.bought ? fmt(h.bought) : 'gezogen'}</td>
      <td class="n">${fmt(h.sold)}</td><td class="n ${profitCls(h.profit)}">${signed(h.profit)}</td></tr>`).join('');
    listEl.innerHTML = `
      <div class="fcpt-tiles">${tiles}</div>
      ${history.length ? statsHtml() : ''}
      <div class="fcpt-actions"><button data-act="csv">⬇ Als CSV exportieren</button><button data-act="clear">Historie löschen</button></div>
      ${history.length ? `<table class="fcpt-hist"><thead><tr><th>Erkannt</th><th>Spieler</th><th style="text-align:right">Gekauft</th><th style="text-align:right">Verkauft</th><th style="text-align:right">Profit</th></tr></thead><tbody>${rows}</tbody></table>`
        : '<div class="fcpt-msg">Noch keine Verkäufe gespeichert. Öffne die Transferliste, dann werden verkaufte Karten automatisch erfasst.</div>'}`;
    sumEl.textContent = `${history.length} gespeicherte Verkäufe`;
  }
  // Profit-Statistik: Tagesprofit der letzten 14 Tage + beste/schlechteste Trades + lohnendste Spieler
  function statsHtml() {
    const days = 14;
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const buckets = [];
    for (let i = days - 1; i >= 0; i--) {
      const from = d0.getTime() - i * 864e5;
      const rows = history.filter((h) => h.t >= from && h.t < from + 864e5);
      buckets.push({ from, n: rows.length, v: rows.reduce((a, h) => a + (h.profit || 0), 0) });
    }
    const W = 380, H = 130, padL = 4, padR = 4, padT = 10, padB = 18;
    const max = Math.max(1, ...buckets.map((b) => b.v)), min = Math.min(0, ...buckets.map((b) => b.v));
    const y = (v) => padT + (max - v) / (max - min) * (H - padT - padB);
    const bw = (W - padL - padR) / days;
    const bars = buckets.map((b, i) => {
      const x = padL + i * bw + bw * 0.2, w = bw * 0.6;
      const y0 = y(0), y1 = y(b.v);
      const top = Math.min(y0, y1), h = Math.max(b.v ? 2 : 0, Math.abs(y1 - y0));
      const col = b.v >= 0 ? '#22c55e' : '#ef4444';
      const lbl = new Date(b.from).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
      const tip = `${lbl}: ${signed(b.v)} (${b.n} Verkäufe)`;
      const showX = i % 2 === (days - 1) % 2;
      return `<g><title>${tip}</title>
        <rect x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padT - padB}" fill="transparent"></rect>
        ${h ? `<rect x="${x}" y="${top}" width="${w}" height="${h}" rx="3" fill="${col}"></rect>` : ''}
        ${showX ? `<text x="${x + w / 2}" y="${H - 5}" text-anchor="middle" font-size="9" fill="#8b98aa">${lbl}</text>` : ''}</g>`;
    }).join('');
    const zero = `<line x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}" stroke="#33425a" stroke-width="1"></line>`;
    const best = [...history].sort((a, b) => (b.profit || 0) - (a.profit || 0)).slice(0, 5);
    const worst = [...history].sort((a, b) => (a.profit || 0) - (b.profit || 0)).filter((h) => (h.profit || 0) < 0).slice(0, 5);
    const byPlayer = {};
    for (const h of history) {
      const k = `${h.rating ?? ''} ${h.name}`;
      const e = byPlayer[k] || (byPlayer[k] = { n: 0, v: 0 });
      e.n++; e.v += h.profit || 0;
    }
    const players = Object.entries(byPlayer).sort((a, b) => b[1].v - a[1].v).slice(0, 5);
    const row = (l, v, extra = '') => `<div class="r"><span>${esc(l)}${extra}</span><b class="${profitCls(v)}">${signed(v)}</b></div>`;
    const total14 = buckets.reduce((a, b) => a + b.v, 0);
    return `
      <div class="fcpt-sec">Statistik</div>
      <div class="fcpt-chart"><div class="cap"><span>Profit pro Tag – letzte 14 Tage</span><span class="${profitCls(total14)}">${signed(total14)}</span></div>
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Profit pro Tag der letzten 14 Tage">${zero}${bars}</svg></div>
      <div class="fcpt-2col">
        <div class="fcpt-mini"><div class="h">Beste Trades</div>${best.map((h) => row(`${h.rating ?? ''} ${h.name}`, h.profit || 0)).join('')}</div>
        <div class="fcpt-mini"><div class="h">Lohnendste Spieler</div>${players.map(([k, e]) => row(k, e.v, ` <span class="fcpt-muted">(${e.n}×)</span>`)).join('')}</div>
      </div>
      ${worst.length ? `<div class="fcpt-mini"><div class="h">Verlust-Trades</div>${worst.map((h) => row(`${h.rating ?? ''} ${h.name}`, h.profit || 0)).join('')}</div>` : ''}
      <div class="fcpt-sec">Alle Verkäufe</div>`;
  }

  onHistoryChange = () => { if (view === 'hist' && panel.classList.contains('open')) renderHistory(); };

  function exportCsv() {
    const head = 'Erkannt am;Spieler;Rating;Gekauft;Verkauft;Netto-Profit';
    const lines = history.map((h) => [new Date(h.t).toLocaleString('de-DE'), `"${String(h.name).replace(/"/g, '""')}"`, h.rating ?? '', h.bought || 0, h.sold, h.profit ?? ''].join(';'));
    const blob = new Blob(['\ufeff' + [head, ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fc27-verkaeufe-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  async function fetchSource(key, players, myRun) {
    const src = SOURCES[key];
    await Promise.all(players.map(async (p) => {
      const rid = p.resourceId;
      priceStore[rid] = priceStore[rid] || {};
      priceStore[rid][key] = { loading: true };
      updatePrices(rid);
      try {
        priceStore[rid][key] = { v: await getPrice(key, p) };
      } catch (e) {
        priceStore[rid][key] = { err: `${src.label}: ${e.message}` };
        log(key, p.name, e);
      }
      if (myRun === runId) updatePrices(rid);
    }));
  }

  async function refresh() {
    const myRun = ++runId;
    setMsg('Lade Transferliste …');
    try {
      items = (await loadTransferList()).map((raw) => { const x = mapItem(raw); if (x) x.__raw = raw; return x; }).filter(Boolean);
    } catch (e) {
      setMsg(e.message);
      return;
    }
    if (myRun !== runId) return;
    items.forEach(recordSale);
    items.forEach((x) => { if (x.itemId != null) ownIds.add(x.itemId); });
    priceStore = {};
    render();
    if (view === 'hist') return;
    const seen = new Set();
    const players = items.filter((p) => p.isPlayer && !seen.has(p.resourceId) && seen.add(p.resourceId));
    await Promise.all(enabledSources().map((k) => fetchSource(k, players, myRun)));
    lastRefresh = Date.now();
    if (myRun === runId && view === 'list' && settings.sort !== 'status') render();
  }
  let lastRefresh = 0;

  // Ereignisse
  btn.addEventListener('click', () => {
    const open = panel.classList.toggle('open');
    if (open && !items.length) refresh();
  });
  panel.addEventListener('click', (e) => {
    const actEl = e.target.closest && e.target.closest('[data-act]');
    const act = actEl && actEl.dataset.act;
    if (act === 'close') panel.classList.remove('open');
    if (act === 'refresh') refresh();
    if (act === 'reload') { cacheClear(); refresh(); redecorateAll(); }
    if (act === 'editBought') {
      const b = e.target.closest('[data-act="editBought"]');
      const it = items.find((x) => String(x.itemId) === b.dataset.iid);
      if (!it) return;
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.step = '50'; inp.className = 'fcpt-boughtinput';
      inp.placeholder = 'Kaufpreis'; inp.value = it.bought || '';
      b.replaceWith(inp); inp.focus(); inp.select();
      let done = false;
      const save = () => {
        if (done) return; done = true;
        const v = Math.max(0, parseInt(inp.value, 10) || 0);
        setManualBought(it.itemId, v || null);
        items = items.map((x) => (x.itemId === it.itemId && x.__raw ? mapItem(x.__raw) : x));
        render(); redecorateAll();
      };
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') save(); if (ev.key === 'Escape') { done = true; render(); } });
      inp.addEventListener('blur', save);
    }
    if (act === 'csv') exportCsv();
    if (act === 'clear' && confirm('Gesamte Profit-Historie löschen?')) { history = []; GM_setValue(HIST_KEY, history); renderHistory(); }
    const tab = e.target.dataset && e.target.dataset.tab;
    if (tab) {
      view = tab;
      panel.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      panel.classList.toggle('v-settings', tab === 'settings');
      panel.classList.toggle('v-hist', tab === 'hist');
      if (tab === 'settings') return;
      if (tab === 'hist') renderHistory(); else if (items.length) render(); else refresh();
    }
  });
  panel.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.set) settings[t.dataset.set] = t.value;
    if (t.dataset.src) settings.sources[t.dataset.src] = t.checked;
    if (t.dataset.opt === 'inline') { settings.inline = t.checked; saveSettings(); return; }
    if (t.dataset.opt === 'autoRefresh') { settings.autoRefresh = t.checked; saveSettings(); return; }
    if (t.dataset.opt === 'hotkeys') { settings.hotkeys = t.checked; saveSettings(); return; }
    if (t.dataset.opt === 'bumpMinBin') { settings.bumpMinBin = t.checked; saveSettings(); return; }
    if (t.dataset.opt === 'autoBack') { settings.autoBack = t.checked; saveSettings(); return; }
    if (t.dataset.set === 'stepField') { settings.stepField = parseInt(t.value, 10); saveSettings(); return; }
    if (t.dataset.key) return;
    if (t.dataset.opt === 'ampel') { settings.ampel = t.checked; saveSettings(); redecorateAll(); return; }
    if (t.dataset.set === 'sort') { settings.sort = t.value; saveSettings(); if (items.length) render(); return; }
    if (t.dataset.num) { settings[t.dataset.num] = Math.max(0, parseInt(t.value, 10) || 0); saveSettings(); return; }
    saveSettings();
    if (t.dataset.set === 'mainSource') { if (items.length) render(); Object.keys(priceStore).forEach(updatePrices); }
    else refresh();
  });

  // ------------------------------------------------------------------
  // Anzeige direkt in EAs Transferliste (wie Paletools / FC Enhancer)
  // ------------------------------------------------------------------
  const decorated = new Map();   // Zeile -> Item, für Auto-Aktualisieren und Ampel
  let lastSelected = null;       // zuletzt angeklickte Karte (für "Preis übernehmen")
  function redecorateAll() {
    for (const [root, raw] of decorated) {
      if (!root.isConnected) { decorated.delete(root); continue; }
      decorateRow(root, raw);
    }
  }

  function decorateRow(root, raw) {
    if (!root || !raw) return;
    const p = mapItem(raw);
    if (!p) return;
    decorated.set(root, raw);
    if (!root.__fcptClick) {
      root.__fcptClick = true;
      root.addEventListener('click', () => { lastSelected = decorated.get(root) || raw; updateListButton(); }, true);
    }
    recordSale(p);
    // Fremde Angebote (Transfermarkt-Suche, Transferziele) vs. eigene Karten
    const inSearch = !!(root.closest && root.closest('.SearchResults, .ut-market-search-results-view, .ut-search-results-view'));
    // Nicht gelistete eigene Karten haben keine Auktion (tradeId 0) – die zählen nie als Markt-Angebot
    const hasAuction = !!toNum(p.tradeId);
    const isMarket = !ownIds.has(p.itemId) && hasAuction && (p.tradeOwner === false || (p.tradeOwner == null && inSearch));
    if (isMarket && p.active && p.tradeId != null) marketRows.set(p.tradeId, { raw, root });
    root.classList.remove('fcpt-bargain', 'fcpt-good', 'fcpt-bad', 'fcpt-meh');
    root.querySelectorAll('.fcpt-inline').forEach((e) => e.remove());
    const box = document.createElement('div');
    box.className = 'fcpt-inline';
    root.appendChild(box);
    const prices = {};

    const draw = () => {
      const keys = enabledSources();
      const main = (prices[settings.mainSource] && prices[settings.mainSource].v) ||
        keys.map((k) => prices[k] && prices[k].v).find(Boolean) || null;
      let profitHtml = '';
      if (isMarket) {
        root.classList.remove('fcpt-bargain');
        if (main && p.buyNow) {
          const v = afterTax(main) - p.buyNow;
          if (v >= settings.minBargain) {
            root.classList.add('fcpt-bargain');
            profitHtml = `<span class="fcpt-chip deal">💰 Schnäppchen: ${signed(v)} nach Steuer</span>`;
          } else {
            profitHtml = `<span class="fcpt-chip ${v >= 0 ? 'profit' : 'loss'}">Bei Weiterverkauf: <b>${signed(v)}</b></span>`;
          }
        }
      } else if (p.sold && p.profit != null) {
        profitHtml = `<span class="fcpt-chip ${p.profit >= 0 ? 'profit' : 'loss'}">Profit: <b>${signed(p.profit)}</b></span>`;
      } else if (p.potentialProfit != null) {
        profitHtml = `<span class="fcpt-chip ${p.potentialProfit >= 0 ? 'profit' : 'loss'}">Bei Sofortkauf: <b>${signed(p.potentialProfit)}</b></span>`;
      } else if (main && p.bought) {
        const v = afterTax(main) - p.bought;
        profitHtml = `<span class="fcpt-chip ${v >= 0 ? 'profit' : 'loss'}">Bei Marktpreis: <b>${signed(v)}</b></span>`;
      }
      const chips = p.isPlayer ? keys.map((k) => {
        const e = prices[k];
        const val = !e ? '…' : e.err ? '✕' : fmt(e.v);
        const url = k === 'futbin' ? futbinUrl(p.resourceId) : null;
        return url
          ? `<a class="fcpt-chip" href="${url}" target="_blank" rel="noopener" title="Futbin-Seite öffnen">${SOURCES[k].label}: <b>${val}</b> ↗</a>`
          : `<span class="fcpt-chip" title="${esc((e && e.err) || '')}">${SOURCES[k].label}: <b>${val}</b></span>`;
      }).join('') : '';
      // Ampel: grün = Gewinn, rot = Verlust, orange = Preis falsch gesetzt
      root.classList.remove('fcpt-good', 'fcpt-bad', 'fcpt-meh');
      if (settings.ampel && !isMarket && p.isPlayer) {
        const warn = listingWarn(p, main);
        const v = profitValue(p, main);
        if (warn) root.classList.add('fcpt-meh');
        else if (v != null && v > 0) root.classList.add('fcpt-good');
        else if (v != null && v < 0) root.classList.add('fcpt-bad');
      }
      box.innerHTML = (p.isPlayer ? `<span class="fcpt-chip main">Markt: <b>${fmt(main)}</b></span>` : '') + chips + profitHtml +
        (!isMarket ? listingWarn(p, main) : '') + (isMarket && p.active ? bidChip(p) : '');
    };

    draw();
    box.addEventListener('click', (e) => { if (e.target.closest('a')) e.stopPropagation(); });
    if (!p.isPlayer) return;
    enabledSources().forEach((k) => {
      getPrice(k, p)
        .then((v) => { prices[k] = { v }; })
        .catch((e) => { prices[k] = { err: e.message }; log(k, p.name, e); })
        .finally(() => { if (box.isConnected) draw(); });
    });
  }

  // ------------------------------------------------------------------
  // Gebots-Helfer: auf alle aktuell angezeigten Suchergebnisse bis Max-Gebot bieten
  // Wird nur durch deinen Klick gestartet – keine automatische Suche.
  // ------------------------------------------------------------------
  const marketRows = new Map();   // tradeId -> { raw, root }
  const bidDone = {};             // tradeId -> { ok, amount, err }
  let bidRunning = false, bidStop = false;

  const bidStep = (v) => (v < 1000 ? 50 : v < 10000 ? 100 : v < 50000 ? 250 : v < 100000 ? 500 : 1000);
  const nextBid = (p) => (p.currentBid ? p.currentBid + bidStep(p.currentBid) : p.startPrice || null);

  function bidChip(p) {
    const d = bidDone[p.tradeId];
    if (d && d.ok && p.bidState !== 'outbid') return `<span class="fcpt-chip bidok">✓ Geboten: ${fmt(d.amount)}</span>`;
    if (d && d.err) return `<span class="fcpt-chip biderr" title="${esc(d.err)}">✕ Gebot fehlgeschlagen</span>`;
    if (p.bidState === 'highest') return `<span class="fcpt-chip bidok">✓ Du bist Höchstbietender</span>`;
    const nb = nextBid(p);
    if (!nb) return '';
    return `<span class="fcpt-chip nb ${nb > settings.maxBid ? 'over' : ''}">Nächstes Gebot: <b>${fmt(nb)}</b>${nb > settings.maxBid ? ' (über Max)' : ''}</span>`;
  }

  function eligibleBids() {
    const out = [];
    for (const [tid, r] of marketRows) {
      if (!r.root.isConnected) { marketRows.delete(tid); continue; }
      const p = mapItem(r.raw);
      if (!p || !p.active) continue;
      if (p.expires != null && p.expires >= 0 && p.expires < CONFIG.minSecondsLeft) continue;
      if (p.bidState === 'highest') continue;
      if (bidDone[tid] && bidDone[tid].ok && p.bidState !== 'outbid') continue;
      const nb = nextBid(p);
      if (nb && nb <= settings.maxBid) out.push({ tid, raw: r.raw, root: r.root, p, nb });
    }
    return out.sort((a, b) => (a.p.expires ?? 1e9) - (b.p.expires ?? 1e9));
  }

  function userCoins() {
    try {
      const u = W.services.User.getUser();
      return toNum(u.coins && (u.coins.amount ?? u.coins));
    } catch { return null; }
  }

  function placeBid(raw, amount) {
    return new Promise((resolve, reject) => {
      const svc = W.services && W.services.Item;
      if (!svc || typeof svc.bid !== 'function') return reject(new Error('Bieten-Funktion der Web App nicht gefunden'));
      try {
        svc.bid(raw, amount).observe(W, (obs, res) => {
          if (obs && typeof obs.unobserve === 'function') obs.unobserve(W);
          if (res && res.success) resolve();
          else reject(new Error('EA-Fehler ' + ((res && (res.status || (res.error && res.error.code))) || 'unbekannt')));
        });
      } catch (e) { reject(e); }
    });
  }

  const bidbar = document.createElement('div');
  bidbar.id = 'fcpt-bidbar';
  bidbar.innerHTML = `<span>Max-Gebot</span><input type="number" min="0" step="50" data-bid="max"><button data-bid="run">Alle bieten</button><span class="st"></span>`;
  document.body.appendChild(bidbar);
  const bidInput = bidbar.querySelector('[data-bid="max"]');
  const bidBtn = bidbar.querySelector('[data-bid="run"]');
  const bidStatus = bidbar.querySelector('.st');
  bidInput.value = settings.maxBid;
  const setBidStatus = (m) => { bidStatus.textContent = m; bidStatus.title = m; };

  function redrawRow(r) {
    // Chips der Zeile neu zeichnen, ohne neue Preisabrufe (Preise kommen aus dem Cache)
    if (r.root.isConnected) decorateRow(r.root, r.raw);
  }

  function updateBidBar() {
    for (const [tid, r] of marketRows) if (!r.root.isConnected) marketRows.delete(tid);
    bidbar.classList.toggle('show', marketRows.size > 0 || bidRunning);
    if (!bidRunning) bidBtn.textContent = `Alle bieten (${Math.min(eligibleBids().length, CONFIG.maxBidsPerRun)})`;
  }
  setInterval(updateBidBar, 1000);

  bidInput.addEventListener('change', () => {
    settings.maxBid = Math.max(0, parseInt(bidInput.value, 10) || 0);
    saveSettings();
    for (const r of marketRows.values()) redrawRow(r);
    updateBidBar();
  });

  bidBtn.addEventListener('click', async () => {
    if (bidRunning) { bidStop = true; setBidStatus('Wird nach dem laufenden Gebot gestoppt …'); return; }
    const list = eligibleBids().slice(0, CONFIG.maxBidsPerRun);
    if (!list.length) { setBidStatus(`Keine Karte mit nächstem Gebot bis ${fmt(settings.maxBid)}`); return; }
    const total = list.reduce((s, x) => s + x.nb, 0);
    const coins = userCoins();
    const msg = `${list.length} Gebote bis max. ${fmt(settings.maxBid)} Münzen abgeben?\n\n` +
      `Dafür werden bis zu ${fmt(total)} Münzen gebunden, bis du überboten wirst.` +
      (coins != null ? `\nDein Guthaben: ${fmt(coins)}` : '');
    if (!confirm(msg)) return;

    bidRunning = true; bidStop = false;
    bidBtn.textContent = '■ Stopp'; bidBtn.classList.add('stop');
    let ok = 0, failsInRow = 0, spent = 0, i = 0;
    for (const x of list) {
      i++;
      if (bidStop) break;
      if (!x.root.isConnected) continue;
      const c = userCoins();
      if (c != null && c < x.nb) { setBidStatus('Guthaben reicht nicht mehr – gestoppt'); break; }
      setBidStatus(`${i}/${list.length}: biete ${fmt(x.nb)} auf ${x.p.name} …`);
      try {
        await placeBid(x.raw, x.nb);
        bidDone[x.tid] = { ok: true, amount: x.nb };
        ok++; spent += x.nb; failsInRow = 0;
      } catch (e) {
        bidDone[x.tid] = { err: e.message };
        failsInRow++;
        log('Gebot fehlgeschlagen', x.p.name, e);
        if (failsInRow >= 3) { redrawRow(x); setBidStatus(`3 Fehler hintereinander – gestoppt (${e.message})`); break; }
      }
      redrawRow(x);
      await sleep(CONFIG.bidDelayMin + Math.random() * (CONFIG.bidDelayMax - CONFIG.bidDelayMin));
    }
    bidRunning = false;
    bidBtn.classList.remove('stop');
    if (!/gestoppt/.test(bidStatus.textContent) || bidStop) {
      setBidStatus(`${ok} Gebote abgegeben · ${fmt(spent)} Münzen gebunden${bidStop ? ' · abgebrochen' : ''}`);
    }
    updateBidBar();
  });

  // ------------------------------------------------------------------
  // Preis mit 1 Klick übernehmen (Schnellverkauf-/Anbieten-Bereich)
  // Füllt nur die Felder aus – anbieten musst du selbst.
  // ------------------------------------------------------------------
  const PRICE_STEPS = [[1000, 50], [10000, 100], [50000, 250], [100000, 500], [Infinity, 1000]];
  const stepFor = (v) => PRICE_STEPS.find(([lim]) => v < lim)[1];
  const roundPrice = (v) => { const st = stepFor(v); return Math.max(200, Math.round(v / st) * st); };
  const lowerStep = (v) => Math.max(150, v - stepFor(v - 1));

  function findListPanel() {
    const direct = document.querySelector('.ut-quick-list-panel-view, .QuickListPanel');
    if (direct) return direct;
    const btn = [...document.querySelectorAll('button')].find((b) => /auf transfermarkt anbieten|list on transfer market/i.test(b.textContent));
    return btn ? btn.closest('.ut-quick-list-panel-view, .panelActions, .DetailPanel, section, div') : null;
  }

  function setInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    input.focus();
    setter.call(input, String(value));
    ['input', 'keyup', 'change', 'blur'].forEach((ev) => input.dispatchEvent(new Event(ev, { bubbles: true })));
  }

  let listBtn = null;
  const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };  // verhindert Endlosschleife mit dem MutationObserver
  function updateListButton() {
    const host = findListPanel();
    if (!host) { if (listBtn) { listBtn.remove(); listBtn = null; } return; }
    if (!listBtn || !host.contains(listBtn)) {
      if (listBtn) listBtn.remove();
      listBtn = document.createElement('div');
      listBtn.innerHTML = `<button id="fcpt-listbtn">💰 Futbin-Preis übernehmen</button><div class="fcpt-listhint"></div>`;
      host.insertBefore(listBtn, host.firstChild);
      listBtn.querySelector('button').addEventListener('click', applyListPrice);
    }
    const hint = listBtn.querySelector('.fcpt-listhint');
    const b = listBtn.querySelector('button');
    const p = lastSelected && mapItem(lastSelected);
    if (!p || !p.isPlayer) { b.disabled = true; setText(hint, 'Karte in der Liste anklicken, dann hier übernehmen.'); return; }
    const m = cacheGet(`futbin:${settings.platform}:${p.resourceId}`);
    if (b.disabled !== !m) b.disabled = !m;
    if (!m) { setText(hint, `${p.name}: Futbin-Preis wird noch geladen …`); return; }
    const bin = roundPrice(m);
    const start = lowerStep(bin);
    const prof = p.bought ? afterTax(bin) - p.bought : null;
    setText(hint, `${p.name}: Start ${fmt(start)} · Sofortkauf ${fmt(bin)}` + (prof != null ? ` · Profit ${signed(prof)}` : ''));
  }

  function applyListPrice(e) {
    e.preventDefault(); e.stopPropagation();
    const host = findListPanel();
    const p = lastSelected && mapItem(lastSelected);
    if (!host || !p) return;
    const m = cacheGet(`futbin:${settings.platform}:${p.resourceId}`);
    if (!m) return;
    const bin = roundPrice(m);
    const start = lowerStep(bin);
    const inputs = [...host.querySelectorAll('input')].filter((i) => i.type !== 'checkbox' && i.offsetParent !== null);
    if (inputs.length < 2) { listBtn.querySelector('.fcpt-listhint').textContent = 'Preisfelder nicht gefunden – bitte „Schnellverkauf/Anbieten“ aufklappen.'; return; }
    setInputValue(inputs[0], start);
    setInputValue(inputs[1], bin);
    listBtn.querySelector('.fcpt-listhint').textContent = `Eingetragen: Start ${fmt(start)} · Sofortkauf ${fmt(bin)} – prüfen und selbst auf „Anbieten“ klicken.`;
  }

  let listObsPending = false;
  new MutationObserver(() => {
    if (listObsPending) return;
    listObsPending = true;
    requestAnimationFrame(() => { listObsPending = false; updateListButton(); });
  }).observe(document.body, { childList: true, subtree: true });

  // ------------------------------------------------------------------
  // Automatisch aktualisieren: alle 15 Min. neue Preise (nur wenn der Tab sichtbar ist)
  // ------------------------------------------------------------------
  setInterval(() => {
    updateStand();
    if (!settings.autoRefresh || document.visibilityState !== 'visible') return;
    if (Date.now() - (lastPriceFetch || 0) < CONFIG.cacheMinutes * 60000) return;
    if (Date.now() - lastRefresh < CONFIG.cacheMinutes * 60000) return;
    lastRefresh = Date.now();
    log('Auto-Aktualisieren');
    redecorateAll();
    if (panel.classList.contains('open') && view === 'list') refresh();
  }, 60000);

  // ------------------------------------------------------------------
  // Tastenkürzel zum Snipen: jede Taste = genau EIN Klick, den du sonst mit der Maus machst.
  // Nichts läuft von allein – ohne Tastendruck passiert nichts.
  // ------------------------------------------------------------------
  const toast = document.createElement('div');
  toast.id = 'fcpt-toast';
  document.body.appendChild(toast);
  let toastTimer = null;
  function showToast(msg, err) {
    toast.textContent = msg;
    toast.classList.toggle('err', !!err);
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1400);
  }

  // sichtbar? (offsetParent ist bei position:fixed immer null – EAs neue Dialoge sind fixed, daher über die Maße prüfen)
  const shown = (el) => {
    if (!el || !el.isConnected) return false;
    if (el.offsetParent !== null) return true;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  const visible = (el) => !!el && shown(el) && !el.disabled && !el.classList.contains('disabled');
  const btnText = (b) => (b.textContent || '').replace(/\s+/g, ' ').trim();
  const findButton = (re, root = document) =>
    [...root.querySelectorAll('button')].find((b) => visible(b) && !b.closest('#fcpt-panel, #fcpt-bidbar') && re.test(btnText(b)));

  // EA-Buttons reagieren auf Maus-/Touch-Ereignisse, nicht nur auf click()
  function pressButton(b) {
    const opts = { bubbles: true, cancelable: true, view: W };
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((t) => {
      const Ev = t.startsWith('pointer') && typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
      b.dispatchEvent(new Ev(t, opts));
    });
  }

  function findSearchButton() {
    return findButton(/^(suchen|search)$/i);
  }
  function findBackButton() {
    return [...document.querySelectorAll('.ut-navigation-button-control, button.ut-navigation-button-control')].find(visible);
  }
  function findBuyButton() {
    return [...document.querySelectorAll('button.buyButton')].find(visible) ||
      findButton(/^(sofortkauf|jetzt kaufen|buy now)\b/i);
  }
  function findConfirmButton() {
    const OK = /^(ok|okay|bestätigen|ja|yes|kaufen|jetzt kaufen|confirm)$/i;
    const dlg = [...document.querySelectorAll('.ea-dialog-view, .Dialog, .ut-dialog-view, [class*="dialog"], [class*="Dialog"], [class*="modal"], [class*="Modal"], [role="dialog"], [role="alertdialog"]')]
      .filter((d) => shown(d) && !d.closest('#fcpt-panel, #fcpt-sbc') && [...d.querySelectorAll('button')].some(visible)).pop();
    if (dlg) {
      const b = findButton(OK, dlg);
      if (b) return b;
    }
    // Rückfall: sichtbarer „Ok“-Knopf neben einem „Abbrechen“-Knopf (EAs Kauf-Bestätigung)
    const oks = [...document.querySelectorAll('button')].filter((b) => visible(b) && !b.closest('#fcpt-panel, #fcpt-bidbar, #fcpt-sbc') && OK.test(btnText(b)));
    const withCancel = oks.find((b) => { const box = b.parentElement && b.parentElement.parentElement; return box && [...box.querySelectorAll('button')].some((x) => /^(abbrechen|cancel|nein|no)$/i.test(btnText(x))); });
    return withCancel || (dlg ? [...dlg.querySelectorAll('button')].filter(visible).pop() : null);
  }

  // Min.-Sofortkauf abwechselnd eine Stufe hoch/runter -> EA liefert frische statt zwischengespeicherte Ergebnisse
  let bumpUp = true;
  function bumpMinBin() {
    const filters = [...document.querySelectorAll('.search-prices .price-filter, .price-filter')].filter((f) => f.offsetParent !== null);
    const minBin = filters[2];
    if (!minBin) return false;
    const up = minBin.querySelector('.increment-value, button[class*="increment"]');
    const down = minBin.querySelector('.decrement-value, button[class*="decrement"]');
    const input = minBin.querySelector('input');
    const cur = input ? toNum(input.value) || 0 : 0;
    const target = bumpUp || cur === 0 ? up : down;
    if (!target || !visible(target)) return false;
    pressButton(target);
    bumpUp = !bumpUp;
    return true;
  }

  const FIELD_NAMES = ['Min.-Gebot', 'Max.-Gebot', 'Min.-Sofortkauf', 'Max.-Sofortkauf'];
  function stepPrice(dir) {
    const filters = [...document.querySelectorAll('.search-prices .price-filter, .price-filter')].filter((f) => f.offsetParent !== null);
    const f = filters[settings.stepField];
    if (!f) return showToast('Preisfelder nicht gefunden – öffne die Transfermarkt-Suche', true);
    const b = f.querySelector(dir > 0 ? '.increment-value, button[class*="increment"]' : '.decrement-value, button[class*="decrement"]');
    if (!b || !visible(b)) return showToast(`${FIELD_NAMES[settings.stepField]}: Button nicht gefunden`, true);
    pressButton(b);
    setTimeout(() => {
      const inp = f.querySelector('input');
      showToast(`${dir > 0 ? '▲' : '▼'} ${FIELD_NAMES[settings.stepField]}: ${inp ? fmt(toNum(inp.value) || 0) : ''}`);
    }, 60);
  }

  function doSearch() {
    const s = findSearchButton();
    if (s) {
      if (settings.bumpMinBin) bumpMinBin();
      pressButton(s);
      showToast('🔍 Suche');
      return;
    }
    // Auf der Ergebnisseite: erst zurück, dann suchen
    const back = findBackButton();
    if (!back) return showToast('Kein Suchen-Button gefunden – öffne die Transfermarkt-Suche', true);
    pressButton(back);
    let tries = 0;
    const iv = setInterval(() => {
      const s2 = findSearchButton();
      if (s2) {
        clearInterval(iv);
        if (settings.bumpMinBin) bumpMinBin();
        pressButton(s2);
        showToast('🔍 Neue Suche');
      } else if (++tries > 20) { clearInterval(iv); showToast('Suchen-Button nicht gefunden', true); }
    }, 50);
  }

  function doBuy() {
    const b = findBuyButton();
    if (!b) return showToast('Kein Sofortkauf-Button – Karte in den Ergebnissen auswählen', true);
    pressButton(b);
    showToast('💰 ' + btnText(b));
  }

  function doConfirm() {
    const b = findConfirmButton();
    if (!b) return showToast('Kein Bestätigen-Dialog offen', true);
    pressButton(b);
    showToast('✔ Bestätigt');
    if (settings.autoBack) {
      // kurz warten, bis EA den Kauf verarbeitet hat, dann eine Seite zurück zur Suche
      let tries = 0;
      const iv = setInterval(() => {
        if (findConfirmButton() && ++tries < 30) return;       // Dialog noch offen
        clearInterval(iv);
        setTimeout(() => {
          if (findSearchButton()) return;                      // schon auf der Suchseite
          const back = findBackButton();
          if (back) { pressButton(back); showToast('✔ Bestätigt · ← zurück zur Suche'); }
        }, 250);
      }, 50);
    }
  }

  function doBack() {
    const b = findBackButton();
    if (!b) return showToast('Kein Zurück-Button gefunden', true);
    pressButton(b);
    showToast('← Zurück');
  }

  const keyhint = document.createElement('div');
  keyhint.id = 'fcpt-keyhint';
  document.body.appendChild(keyhint);
  const kb = (k) => `<kbd>${esc(keyLabel(settings.keys[k]))}</kbd>`;
  setInterval(() => {
    const onMarket = settings.hotkeys && !panel.classList.contains('open') && (findSearchButton() || findBuyButton() || findConfirmButton());
    keyhint.classList.toggle('show', !!onMarket);
    if (!onMarket) return;
    const html = `<span>${kb('search')}Suchen</span><span>${kb('buy')}Kaufen</span><span>${kb('confirm')}OK</span><span>${kb('back')}Zurück</span><span>${kb('up')}${kb('down')}Preis ±</span>`;
    if (keyhint.__html !== html) { keyhint.__html = html; keyhint.innerHTML = html; }
  }, 700);

  document.addEventListener('keydown', (ev) => {
    if (!settings.hotkeys || ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat) return;
    const a = document.activeElement;
    if (a && (/^(input|textarea|select)$/i.test(a.tagName) || a.isContentEditable)) return;
    const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    const k = settings.keys;
    const map = { [k.search]: doSearch, [k.buy]: doBuy, [k.confirm]: doConfirm, [k.back]: doBack,
      [k.up]: () => stepPrice(1), [k.down]: () => stepPrice(-1) };
    const fn = map[key];
    if (!fn) return;
    ev.preventDefault(); ev.stopPropagation();
    fn();
  }, true);

  function installHook() {
    const V = W.UTItemTableCellView;
    if (!V || !V.prototype || typeof V.prototype.render !== 'function') return false;
    if (V.prototype.__fcpt) return true;
    const orig = V.prototype.render;
    V.prototype.render = function () {
      const r = orig.apply(this, arguments);
      try {
        if (settings.inline) {
          const item = arguments[0] || this.data || this._data;
          const root = typeof this.getRootElement === 'function' ? this.getRootElement() : this.__root;
          decorateRow(root, item);
        }
      } catch (e) { log('Anzeige in der Liste fehlgeschlagen', e); }
      return r;
    };
    V.prototype.__fcpt = true;
    log('Listen-Anzeige aktiv');
    return true;
  }

  let hookTries = 0;
  const hookTimer = setInterval(() => {
    if (installHook()) return clearInterval(hookTimer);
    if (++hookTries > 120) {
      clearInterval(hookTimer);
      log('UTItemTableCellView nicht gefunden – Anzeige in der Liste nicht möglich, Seitenleiste funktioniert trotzdem.');
    }
  }, 1000);
})();
