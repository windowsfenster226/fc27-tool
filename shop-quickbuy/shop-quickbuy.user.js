// ==UserScript==
// @name         Shop QuickBuy
// @namespace    snkrsxlove.shop.quickbuy
// @version      3.5.1
// @description  Otto, MediaMarkt, Saturn, Microsoft, PlayStation, Amazon & FNAC Pro – überwacht Artikel, lädt bei "ausverkauft" neu, legt bei Verfügbarkeit in den Warenkorb, geht zur Kasse und startet bei OOS im Warenkorb/an der Kasse neu.
// @match        https://www.otto.de/*
// @match        https://www.mediamarkt.de/*
// @match        https://www.saturn.de/*
// @match        https://www.amazon.de/*
// @match        https://www.fnacpro.com/*
// @match        https://fnacpro.com/*
// @match        https://www.microsoft.com/de-de/*
// @match        https://www.playstation.com/de-de/*
// @match        https://checkout.playstation.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_listValues
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_info
// @grant        GM_openInTab
// @grant        GM_addStyle
// @connect      discord.com
// @connect      discordapp.com
// @updateURL    https://raw.githubusercontent.com/windowsfenster226/fc27-tool/quickbuy/shop-quickbuy/shop-quickbuy.user.js
// @downloadURL  https://raw.githubusercontent.com/windowsfenster226/fc27-tool/quickbuy/shop-quickbuy/shop-quickbuy.user.js
// @homepageURL  https://github.com/windowsfenster226/fc27-tool/tree/quickbuy/shop-quickbuy
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  function stripUrl(u) { return (u || '').split('#')[0].split('?')[0]; }

  /* ================================================================== *
   *  SHOP-KONFIGURATION – hier werden weitere Shops ergänzt
   * ================================================================== */
  const NOT_FAST = '(?<!fast\\s)(?<!bald\\s)(?<!fast\\s)';
  const SHOPS = {
    otto: {
      name: 'OTTO',
      defaultPay: 'prepay',
      host: /(^|\.)otto\.de$/,
      productUrl: /^https:\/\/www\.otto\.de\/p\//,
      productHint: 'https://www.otto.de/p/…',
      productKey: (u) => { const m = stripUrl(u).match(/-(\d{6,})\/?$/); return m ? m[1] : stripUrl(u).split('/').filter(Boolean).pop(); },
      basketUrl: 'https://www.otto.de/order/basket',
      isBasket: (p) => /\/order\/basket/i.test(p),
      isCheckout: (p) => /\/order\/(checkout|ordering|payment|summary)|kasse|checkout/i.test(p),
      addToCart: [/^in\s+den\s+warenkorb$/i, /^in\s+den\s+warenkorb\s+legen$/i],
      oos: [new RegExp(NOT_FAST + 'ausverkauft', 'i'), /nicht\s+(mehr\s+)?lieferbar/i,
            /derzeit\s+nicht\s+verfügbar/i, /momentan\s+nicht\s+verfügbar/i, /benachrichtigen,?\s+wenn/i,
            /seite\s+(wurde\s+)?nicht\s+gefunden/i, /nicht\s+mehr\s+(im\s+sortiment|verfügbar)/i, /artikel\s+(wurde\s+)?nicht\s+gefunden/i],
      toCheckout: [/^zur\s+kasse$/i, /weiter\s+zur\s+kasse/i],
      finalOrder: [/zahlungspflichtig\s+bestellen/i, /^jetzt\s+kaufen$/i, /kaufen$/i],
    },
    mediamarkt: {
      name: 'MediaMarkt',
      defaultPay: 'card',
      host: /(^|\.)mediamarkt\.de$/,
      productUrl: /^https:\/\/www\.mediamarkt\.de\/de\/product\//,
      productHint: 'https://www.mediamarkt.de/de/product/…',
      productKey: (u) => { const m = u.match(/-(\d+)\.html/); return m ? m[1] : stripUrl(u); },
      // Echter Kaufbutton sitzt immer im CTA-Bereich (oben + Sticky-Leiste), Zubehör-Kacheln nicht
      buyFilter: (el) => !!el.closest('[data-test="mms-cta-basket-wishlist"]') && !el.closest('[data-test*="slider"]'),
      // Produktseite zeigt Button, obwohl keine Lieferung möglich ist → als OOS werten
      hardOos: [/leider\s+keine\s+lieferung\s+möglich/i],
      priceSelector: '[data-test="mms-product-price"]',
      // Marktplatz-Händler erkennen ("Verkauf und Versand durch <Händler>")
      sellerOf: () => { const m = pageText().match(/verkauf\s+und\s+versand\s+durch:?\s+(.{2,40}?)(?=\s+(finanzierung|in\s+den\s+warenkorb|inkl|\d|$))/i); return m ? norm(m[1]) : null; },
      ownSeller: /media\s*markt/i,
      // Warenkorb (geprüft im echten MediaMarkt-Warenkorb)
      cartReady: () => !!document.querySelector('[data-test="delete-item-button"]') || /warenkorb\s+ist\s+leer/i.test(document.body.innerText),
      cartItems: () => [...document.querySelectorAll('[data-test="delete-item-button"]')].map((del) => {
        let box = del;
        for (let i = 0; i < 12 && box; i++) { box = box.parentElement; if (box && box.querySelector('[data-test="amount-picker-minus"]')) break; }
        box = box || del.parentElement;
        const qtyInput = box.querySelector('input[type="number"]');
        return {
          box, remove: del,
          title: norm(del.innerText).replace(/^entferne\s+/i, '').replace(/\s+button$/i, ''),
          qty: qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1,
          minus: box.querySelector('[data-test="amount-picker-minus"]'),
        };
      }),
      basketUrl: 'https://www.mediamarkt.de/checkout',
      isBasket: (p) => /^\/checkout\/?$/i.test(p) || /\/de\/checkout\/?$/i.test(p) || /warenkorb|basket|cart/i.test(p),
      isCheckout: (p) => /\/checkout\/.+/i.test(p),
      addToCart: [/^in\s+den\s+warenkorb$/i, /^in\s+den\s+warenkorb\s+legen$/i, /^zum\s+warenkorb\s+hinzufügen$/i],
      oos: [new RegExp(NOT_FAST + 'ausverkauft', 'i'), /online\s+nicht\s+(mehr\s+)?(verfügbar|lieferbar)/i,
            /(aktuell|derzeit|momentan)\s+nicht\s+(verfügbar|lieferbar)/i, /nicht\s+mehr\s+verfügbar/i,
            /benachrichtigen,?\s+(sobald|wenn)/i],
      toCheckout: [/^zur\s+kasse$/i, /^zur\s+kasse\s+gehen$/i, /weiter\s+zur\s+kasse/i],
      checkoutSelector: '[data-test="checkout-continue-button"]',
      // Zahlungsarten auf /checkout/payment (gesehen): Radio-Werte statt Texte
      payValue: { card: 'CRECA', paypal: 'PAYPAL', invoice: 'KLARNA' },
      // Letzter Schritt auf /checkout/summary (gesehen): "Fortfahren und bezahlen"
      finalOrder: [/^fortfahren\s+und\s+bezahlen$/i, /zahlungspflichtig\s+bestellen/i, /^jetzt\s+kaufen$/i, /^kaufen$/i],
      // Overlay nach "In den Warenkorb" (Versicherungsangebot etc.) wegklicken
      dismiss: [/^nein,?\s+danke$/i, /ohne\s+(versicherung|schutz|garantie)/i, /^weiter\s+ohne/i],
    },
    microsoft: {
      name: 'Microsoft Store',
      host: /(^|\.)microsoft\.com$/,
      productUrl: /^https:\/\/www\.microsoft\.com\/de-de\/d\/[^/]+\/[a-z0-9]+/i,
      productHint: 'https://www.microsoft.com/de-de/d/…/…',
      productKey: (u) => { const m = u.match(/\/d\/[^/]+\/([a-z0-9]+)/i); return m ? m[1].toLowerCase() : stripUrl(u); },
      useBoundary: true,
      bgCheck: true,         // Lagerstatus per Hintergrund-Abruf (JSON-LD) prüfen – kein Neuladen nötig
      basketUrl: 'https://www.microsoft.com/de-de/store/cart',
      isBasket: (p) => /\/store\/cart/i.test(p),
      isCheckout: (p) => /checkout|\/store\/buy|kasse/i.test(p),
      addToCart: [/^jetzt\s+kaufen$/i, /^in\s+den\s+warenkorb$/i, /^zum\s+warenkorb\s+hinzufügen$/i],
      oos: [/nicht\s+vorrätig/i, /(?<!fast\s)ausverkauft/i, /derzeit\s+nicht\s+verfügbar/i, /nicht\s+verfügbar/i],
      toCheckout: [/^zur\s+kasse$/i, /^auschecken$/i, /^kasse$/i, /weiter\s+zur\s+kasse/i, /^bezahlen$/i],
      finalOrder: [/bestellung\s+aufgeben/i, /zahlungspflichtig\s+bestellen/i, /^kaufen$/i, /^jetzt\s+kaufen$/i],
    },
    playstation: {
      name: 'PlayStation',
      host: /(^|\.)playstation\.com$/,
      // Produktseiten (…/product/…) UND Konsolen-Übersichtsseiten (z. B. /de-de/ps5/digital-edition-825-gb/)
      productUrl: /^https:\/\/www\.playstation\.com\/de-de\/(ps5|ps4|ps-vr2|playstation-portal|accessories|merchandise|consoles)\/[^?#]+/i,
      productHint: 'https://www.playstation.com/de-de/ps5/…',
      productKey: (u) => stripUrl(u).replace(/^https:\/\/www\.playstation\.com\/de-de\//i, '').replace(/\/+$/, '').toLowerCase(),
      // Angezeigter Preis (eingeloggt evtl. mit Rabatt) statt Preis aus dem Seitencode
      priceSelector: '[data-qa="mfeCtaMain#offer0#finalPrice"]',
      // Button-Text, wenn man nicht eingeloggt ist
      needLogin: /zum\s+bestellen\s+anmelden|anmelden\s+zum\s+bestellen/i,
      // "Anmelden"-Button oben in der Leiste (gesehen auf playstation.com) → abgemeldet, unabhängig vom Lagerstatus
      signInButton: () => deepAll().find((e) => /signin-button$/i.test(e.getAttribute('data-qa') || '') && visible(e)),
      basketUrl: '',
      isBasket: () => false,
      isCheckout: () => false,
      addToCart: [/^in\s+den\s+einkaufswagen$/i, /^vorbestellen$/i, /^in\s+den\s+warenkorb$/i, /^angebot\s+erhalten$/i, /^jetzt\s+kaufen$/i, /^jetzt\s+vorbestellen$/i],
      // Nur der Haupt-Kaufbutton (geprüft auf playstation.com), nicht der versteckte Duplikat-Button
      buyFilter: (el) => el.getAttribute('data-qa') === 'mfeCtaMain#cta#action',
      oos: [/nicht\s+zum\s+kauf\s+erhältlich/i, /ausverkauft/i, /nicht\s+vorrätig/i],
      toCheckout: [/^zur\s+kasse$/i],
      finalOrder: [],
      // Sony: Einkaufswagen + Kasse laufen in einer Seitenleiste (ggf. iFrame) → eigener Ablauf
      psFlow: true,
      bgCheck: true,
      psCheckout: [/^weiter\s+zur\s+kasse$/i, /^zur\s+kasse$/i],
      psOrder: [/^bestellen\s+und\s+bezahlen$/i, /^jetzt\s+bezahlen$/i, /^zahlungspflichtig\s+bestellen$/i],
      minInterval: 30,
    },
  };

  // Saturn = gleiche Technik wie MediaMarkt
  SHOPS.saturn = {
    ...SHOPS.mediamarkt,
    name: 'Saturn',
    host: /(^|\.)saturn\.de$/,
    productUrl: /^https:\/\/www\.saturn\.de\/de\/product\//,
    productHint: 'https://www.saturn.de/de/product/…',
    basketUrl: 'https://www.saturn.de/checkout',
    ownSeller: /saturn/i,
  };

  // Amazon: nur Alarm (Amazon-Kasse wird nicht automatisiert)
  SHOPS.amazon = {
    name: 'Amazon',
    host: /(^|\.)amazon\.de$/,
    productUrl: /^https:\/\/www\.amazon\.de\/(?:[^?#]*\/)?(?:dp|gp\/product)\/[A-Z0-9]{10}/i,
    productHint: 'https://www.amazon.de/dp/XXXXXXXXXX',
    productKey: (u) => { const m = u.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i); return m ? m[1].toLowerCase() : stripUrl(u); },
    basketUrl: '', isBasket: () => false, isCheckout: () => false,
    addToCart: [/^in\s+den\s+einkaufswagen$/i, /^jetzt\s+kaufen$/i],
    availableFn: () => !!document.querySelector('#add-to-cart-button, #buy-now-button') &&
      !/derzeit\s+nicht\s+verfügbar|nicht\s+auf\s+lager|currently\s+unavailable/i.test((document.querySelector('#availability') || {}).innerText || ''),
    oos: [/derzeit\s+nicht\s+verfügbar/i, /nicht\s+auf\s+lager/i],
    priceSelector: '#corePrice_feature_div .a-offscreen, #corePriceDisplay_desktop_feature_div .a-offscreen, #apex_desktop .a-offscreen',
    sellerOf: () => {
      const box = document.querySelector('#merchantInfoFeature_feature_div, #tabular-buybox, #merchant-info');
      const t = box ? norm(box.innerText) : '';
      if (!t) return null;
      if (/verkäufer\s*:?\s*amazon|verkauf\s+(und\s+versand\s+)?durch\s+amazon/i.test(t)) return 'Amazon';
      const m = t.match(/verkäufer\s*:?\s*([^\n]{2,40}?)(?=\s{2,}|\s+(rückgaben|zahlung|versand|$))/i);
      return m ? norm(m[1]) : null;
    },
    ownSeller: /amazon/i,
    toCheckout: [], finalOrder: [],
    alertOnly: true,
    minInterval: 30,
  };

  // FNAC Pro (Beta): Seitenaufbau noch unbekannt (Captcha-Schutz) → erst einmal Alarm-Modus
  SHOPS.fnacpro = {
    name: 'FNAC Pro',
    host: /(^|\.)fnacpro\.com$/,
    productUrl: /^https:\/\/(www\.)?fnacpro\.com\/(?:[^?#]*\/)?(?:a|mp)\d{5,}/i,
    productHint: 'https://www.fnacpro.com/…/a12345678/…',
    productKey: (u) => { const m = u.match(/\/(a|mp)(\d{5,})/i); return m ? m[2] : stripUrl(u).replace(/^https:\/\/(www\.)?fnacpro\.com\//i, '').replace(/\/+$/, '').toLowerCase(); },
    basketUrl: '', isBasket: (p) => /panier|basket|cart|warenkorb/i.test(p), isCheckout: (p) => /commande|checkout|kasse|paiement/i.test(p),
    addToCart: [/^ajouter\s+au\s+panier$/i],
    // Mengenfeld der Produktseite (gesehen: name="products[<Artikelnr>].Quantity")
    qtyInput: () => document.querySelector('input[name^="products["][name$="].Quantity"]'),
    // Warenkorb-Zähler oben ("Mon panier 0 articles dans Mon panier")
    cartCount: () => { const a = [...document.querySelectorAll('a')].find((x) => /mon\s+panier/i.test(x.innerText || '')); const m = a && (a.innerText || '').match(/(\d+)\s+articles?/i); return m ? parseInt(m[1], 10) : null; },
    signInButton: () => [...document.querySelectorAll('a, button')].find((e) => /^me\s+connecter$/i.test(norm(e.innerText)) && visible(e)),
    oos: [/rupture\s+de\s+stock/i, /indisponible/i, /épuisé/i, /plus\s+disponible/i, /ausverkauft/i, /nicht\s+verfügbar/i, /out\s+of\s+stock/i],
    hardOos: [/rupture\s+de\s+stock/i, /article\s+indisponible/i, /produit\s+indisponible/i, /stock\s+en\s+ligne\s+épuisé/i],
    toCheckout: [], finalOrder: [],
    stopAfterAdd: true,    // in den Warenkorb + Alarm (Kasse folgt, sobald Warenkorb/Kasse analysiert sind)
    minInterval: 30,
    beta: true,
  };

  // Gemeinsame Texte für alle Shops
  const COMMON = {
    cartOos: [new RegExp(NOT_FAST + 'ausverkauft', 'i'), /nicht\s+(mehr\s+)?lieferbar/i, /nicht\s+(mehr\s+)?verfügbar/i,
              /leider\s+nicht\s+mehr/i, /bestand\s+reicht\s+nicht/i, /nicht\s+in\s+der\s+gewünschten\s+menge/i],
    remove: [/^entfernen$/i, /^löschen$/i, /^entferne\b/i, /(artikel|produkt)\s+entfernen/i, /aus\s+dem\s+warenkorb\s+entfernen/i],
    confirmRemove: [/^entfernen$/i, /^ja/i, /^löschen$/i],
    success: /vielen\s+dank|danke\s+für\s+deine\s+bestellung|bestellung\s+(ist\s+)?(eingegangen|bestätigt|aufgegeben)|bestellbestätigung|bestellnummer/i,
    variantOpener: [/größe\s+wählen/i, /variante\s+wählen/i, /bitte\s+wählen/i],
  };

  const SHOP_ID = Object.keys(SHOPS).find((id) => SHOPS[id].host.test(location.hostname));
  if (!SHOP_ID) return;
  const SHOP = SHOPS[SHOP_ID];

  /* ================================================================== *
   *  Zustand – getrennt pro Shop, damit Otto + MediaMarkt parallel laufen
   * ================================================================== */
  const DEFAULTS = {
    running: false, products: [], idx: 0, stepDelaySec: 3, continueAfterBuy: true,
    dryRun: false, dryProduct: null, dropAt: '', dropIntervalSec: 5, dropReloaded: false, heartbeat: 0,
    targetUrl: '', variant: '', intervalSec: 15, jitterSec: 5,
    maxAttempts: 0, maxPrice: 0, autoOrder: false, autoLogin: true, loginWait: 0, onlyOwn: true, payMethod: SHOP.defaultPay || 'default', payOk: false, inCart: {}, justAdded: false, minimized: false, logOpen: false, curTitle: '', attempts: 0, stage: 'product', log: [],
  };
  const S = {
    get: (k) => GM_getValue(`${SHOP_ID}:${k}`, DEFAULTS[k]),
    set: (k, v) => GM_setValue(`${SHOP_ID}:${k}`, v),
  };

  let busy = false;   // läuft in DIESEM Tab gerade ein Durchgang?

  // Aktuelles Produkt aus der Liste
  function cur() {
    if (S.get('dryRun') && S.get('dryProduct')) return S.get('dryProduct');
    const l = S.get('products');
    if (!l.length) return { url: '', variant: '', maxPrice: 0 };
    return l[S.get('idx') % l.length];
  }
  const shortName = (u) => {
    const parts = stripUrl(u || '').split('/').filter(Boolean);
    let slug = parts.pop() || '';
    while (/^(w-\d+|a\d{5,}|mp\d{5,})$/i.test(slug) && parts.length > 2) slug = parts.pop();   // FNAC: /<Name>/a12345678/w-4
    if (/^[a-z0-9]{10,14}$/i.test(slug) && parts.length) {   // Microsoft: /d/<name>/<id> · Amazon: /<name>/dp/<ASIN>
      const id = slug; slug = parts.pop();
      if (/^(dp|product)$/i.test(slug)) { if (parts[parts.length - 1] === 'gp') parts.pop(); slug = parts.length > 2 ? parts.pop() : `Amazon ${id}`; }
    }
    if (/^[A-Z0-9_-]{14,}$/.test(slug) && parts.length) { slug = parts.pop(); if (/^product$/i.test(slug) && parts.length) slug = parts.pop(); }   // PlayStation: /<name>/product/<ID>
    return decodeURIComponent(slug).replace(/\.html$/, '').replace(/^_/, '').replace(/-\d{5,}$/, '').replace(/[-_]+/g, ' ').slice(0, 42);
  };

  /* ================================================================== *
   *  Hilfsfunktionen
   * ================================================================== */
  function fmtEur(n) { return (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

  /* ---------- Protokoll (strukturiert, gleiche OOS-Meldungen werden zusammengefasst) ---------- */
  function logType(msg) {
    if (/nicht im warenkorb|abgelehnt|über limit|> max .*nicht bestellt|fehler/i.test(msg)) return 'err';
    if (/bestellung erfolgreich|✅|verfügbar!|→ ✅/i.test(msg)) return 'ok';
    if (/kasse erreicht|warenkorb ok|zur kasse|lege in den warenkorb|auto-bestellung/i.test(msg)) return 'buy';
    if (/oos|nicht wählbar|nicht kaufbar|preis .* > max|ausverkauft|marktplatz-händler|nicht gefunden \(weitergeleitet|weitergeleitet auf anderes/i.test(msg)) return 'oos';
    if (/gestoppt|nicht gefunden|nicht erkannt|unklar|hinweis|❌|maximale/i.test(msg)) return 'warn';
    return 'info';
  }
  function getLog() {
    return S.get('log').map((e) => typeof e === 'string'
      ? { ts: e.slice(0, 8), msg: e.replace(/^[\d:]+\s+–\s+/, ''), type: logType(e), n: 1 } : e);
  }
  function log(msg, type) {
    type = type || logType(msg);
    console.log(`[QuickBuy ${SHOP.name}]`, msg);
    const l = getLog();
    const ts = new Date().toLocaleTimeString('de-DE');
    const key = msg.replace(/[\d.,]+/g, '#');
    if (type === 'oos') {
      const i = l.slice(0, 8).findIndex((e) => e.type === 'oos' && e.msg.replace(/[\d.,]+/g, '#') === key);
      if (i >= 0) { const e = l.splice(i, 1)[0]; l.unshift({ ...e, ts, at: Date.now(), msg, n: (e.n || 1) + 1 }); S.set('log', l.slice(0, 60)); return renderLog(); }
    }
    l.unshift({ ts, at: Date.now(), msg, type, n: 1 });
    S.set('log', l.slice(0, 60));
    renderLog();
  }

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  }

  function isDisabled(el) {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled')) return true;
    const inner = el.shadowRoot && el.shadowRoot.querySelector('button');
    if (inner && (inner.disabled || inner.getAttribute('aria-disabled') === 'true')) return true;
    return [...(el.classList || [])].some((c) => /(^|[-_])disabled$/i.test(c));
  }

  function deepAll(root = document) {
    const out = [];
    const walk = (node) => {
      for (const el of node.querySelectorAll('*')) { out.push(el); if (el.shadowRoot) walk(el.shadowRoot); }
    };
    walk(root);
    return out;
  }

  function isClickableEl(el) {
    const tag = el.tagName;
    return tag === 'BUTTON' || tag === 'A' || /BUTTON/.test(tag) ||
      el.getAttribute('role') === 'button' || (tag === 'INPUT' && el.type === 'submit');
  }

  const elText = (el) => norm(el.innerText || el.textContent || el.value || el.getAttribute('aria-label'));

  function findClickable(patterns) {
    for (const el of deepAll()) {
      if (!isClickableEl(el) || el.closest('#qb-panel')) continue;
      const t = elText(el);
      if (!t || t.length > 60) continue;
      if (patterns.some((p) => p.test(t)) && visible(el)) return el;
    }
    return null;
  }

  function clickEl(el) {
    const inner = el.shadowRoot && el.shadowRoot.querySelector('button, a');
    (inner || el).click();
  }

  async function waitFor(fn, timeout = 10000, step = 200) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const r = fn(); if (r) return r; await sleep(step); }
    return null;
  }

  const pageText = () => norm((document.querySelector('main') || document.body).innerText);

  function matchText(patterns) {
    const t = pageText(); const hit = patterns.find((p) => p.test(t));
    return hit ? t.match(hit)[0] : null;
  }

  /* ---------- Preis ---------- */
  const PRICE_RE = /(\d{1,3}(?:\.\d{3})*|\d+)(?:,\s?(\d{2}|-{1,2}))?\s*€/;
  function parsePrice(str) {
    if (str == null) return null;
    str = String(str).trim();
    if (/^\d+(\.\d+)?$/.test(str)) return parseFloat(str);              // 599.99 (JSON/Meta)
    const m = str.match(PRICE_RE);
    if (!m) return null;
    const cents = m[2] && /\d/.test(m[2]) ? m[2] : '00';
    return parseFloat(m[1].replace(/\./g, '') + '.' + cents);
  }

  function getProductPrice() {
    if (SHOP.priceSelector) {
      const cands = deepAll().filter((e) => e.matches && e.matches(SHOP.priceSelector));
      const el = cands.find(visible) || cands[0];
      const t = el ? elText(el) : '';
      const pr = el && (parsePrice(t) || parsePrice(t.replace(/^€\s*/, '') + ' €'));
      if (pr) return { price: pr, src: 'Anzeige' };
    }
    // 1) Strukturierte Daten (JSON-LD) – am zuverlässigsten
    for (const sc of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(sc.textContent);
        const items = [].concat(data, data['@graph'] || []);
        for (const it of items) {
          if (!it || !/product/i.test([].concat(it['@type']).join())) continue;
          const offers = [].concat(it.offers || []);
          for (const o of offers) {
            const v = o.price ?? o.lowPrice ?? (o.priceSpecification && o.priceSpecification.price);
            const pr = parsePrice(v);
            if (pr) return { price: pr, src: 'JSON-LD' };
          }
        }
      } catch (e) {}
    }
    // 2) Meta-/itemprop-Angaben
    const meta = document.querySelector('meta[itemprop="price"], meta[property="product:price:amount"], [itemprop="price"]');
    if (meta) {
      const pr = parsePrice(meta.getAttribute('content') || meta.textContent);
      if (pr) return { price: pr, src: 'itemprop' };
    }
    // 3) Fallback: nächster Preis in der Nähe des Warenkorb-Buttons (nicht Werbung/Ratenpreis)
    const btn = findBuyButton();
    let node = btn;
    for (let i = 0; node && i < 12; i++) {
      node = node.parentElement || (node.getRootNode && node.getRootNode().host);
      if (!node) break;
      const t = norm(node.innerText).replace(/[\d.,]+\s*€\s*mtl\.?/gi, '');
      const pr = parsePrice(t);
      if (pr) return { price: pr, src: 'Text' };
    }
    return null;
  }

  function priceOk() {
    const max = Number(cur().maxPrice) || 0;
    if (!max) return { ok: true };
    const p = getProductPrice();
    if (!p) return { ok: false, msg: 'Preis nicht erkannt – kaufe sicherheitshalber nicht' };
    if (p.price > max) return { ok: false, msg: `Preis ${p.price.toFixed(2)} € > Max ${max.toFixed(2)} €` };
    return { ok: true, msg: `Preis ${p.price.toFixed(2)} € ≤ Max ${max.toFixed(2)} € (${p.src})` };
  }

  function getTotalPrice() {
    const t = pageText();
    const m = t.match(/(gesamtsumme|gesamtbetrag|gesamtpreis|zu\s+zahlen(?:der\s+betrag)?|summe)[^€]{0,40}?((\d{1,3}(?:\.\d{3})*|\d+)(,\d{2}|,-{1,2})?\s*€)/i);
    return m ? parsePrice(m[2]) : null;
  }

  /* ---------- Echten Kauf-Button finden (nicht Zubehör/Empfehlungen!) ---------- */
  const BOUNDARY = /^(produktbeschreibung|artikelbeschreibung|beschreibung|technische\s+daten|produktdetails|(passendes\s+)?zubehör|wird\s+oft\s+zusammen\s+gekauft|häufig\s+zusammen\s+gekauft|das\s+könnte\s+dir(\s+auch)?\s+gefallen|kunden\s+kauften\s+auch|ähnliche\s+(produkte|artikel)|alternativen(\s+im\s+vergleich)?|produkt\s+vervollständigen|weitere\s+produkte(\s+anzeigen)?|empfohlen(e\s+produkte)?|unsere\s+empfehlungen?)$/i;

  const keyOf = (u) => String(SHOP.productKey ? SHOP.productKey(u) : stripUrl(u)).toLowerCase();
  const isProductLink = (h) => SHOP.productUrl.test(h);

  function inProductTile(el) {
    const self = keyOf(cur().url || location.href);
    let n = el;
    for (let i = 0; i < 7 && n; i++) {
      n = n.parentElement;
      if (!n) break;
      const others = new Set([...n.querySelectorAll('a[href]')].map((a) => a.href)
        .filter(isProductLink).map(keyOf).filter((k) => k !== self));
      if (!others.size) continue;
      return others.size <= 2 && !!n.querySelector('img');   // kleine Kachel mit fremdem Produkt
    }
    return false;
  }

  function findBuyButton() {
    const all = deepAll();
    const h1 = document.querySelector('h1');
    const boundary = SHOP.useBoundary && all.find((el) => /^(H2|H3|H4|BUTTON|A)$/.test(el.tagName) || el.getAttribute('role') === 'tab'
      ? (BOUNDARY.test(elText(el)) && (!h1 || (h1.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)))
      : false);
    for (const el of all) {
      if (!isClickableEl(el) || el.closest('#qb-panel')) continue;
      const t = elText(el);
      if (!t || t.length > 60 || !SHOP.addToCart.some((p) => p.test(t)) || !visible(el)) continue;
      if (SHOP.buyFilter && !SHOP.buyFilter(el)) continue;
      if (boundary && (boundary.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      if (!SHOP.buyFilter && inProductTile(el)) continue;   // exakter Shop-Filter ist zuverlässiger
      return el;
    }
    return null;
  }

  function isOOS() {
    if (SHOP.availableFn) return !SHOP.availableFn();
    if (SHOP.hardOos && matchText(SHOP.hardOos)) return true;
    const btn = findBuyButton();
    return !(btn && !isDisabled(btn));
  }
  const oosReason = () => (SHOP.hardOos && matchText(SHOP.hardOos)) || matchText(SHOP.oos) || 'kein aktiver Warenkorb-Button';
  const cartOosText = () => matchText(COMMON.cartOos);

  /* ---------- Discord-Webhook (gilt für alle Shops) ---------- */
  const G = {
    get: (k, d) => GM_getValue(`global:${k}`, d),
    set: (k, v) => GM_setValue(`global:${k}`, v),
  };
  const DC_DEFAULTS = { webhook: '', dcSuccess: true, dcCheckout: true, dcAvailable: false, dcError: true, dcPing: false };
  const dc = (k) => G.get(k, DC_DEFAULTS[k]);
  const WEBHOOK_RE = /^https:\/\/(?:ptb\.|canary\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/;

  const DC_KIND = {
    success:   { flag: 'dcSuccess',   color: 0x2ecc71, title: '✅ Kauf erfolgreich' },
    unclear:   { flag: 'dcSuccess',   color: 0xf1c40f, title: '❓ Bestellung abgeschickt – Ergebnis prüfen' },
    checkout:  { flag: 'dcCheckout',  color: 0xf39c12, title: '🧾 Kasse erreicht – jetzt bestätigen!' },
    available: { flag: 'dcAvailable', color: 0x3498db, title: '🔔 Artikel verfügbar' },
    added:     { flag: 'dcCheckout',  color: 0xf39c12, title: '🛒 Im Einkaufswagen – jetzt zur Kasse!' },
    restock:   { flag: 'dcCheckout',  color: 0x3498db, title: '🔔 Verfügbar – jetzt selbst kaufen!' },
    error:     { flag: 'dcError',     color: 0xe74c3c, title: '⚠️ QuickBuy braucht dich' },
    test:      { flag: null,          color: 0x9b59b6, title: '🧪 Test-Nachricht von QuickBuy' },
  };

  function discord(kind, description) {
    const k = DC_KIND[kind];
    const url = dc('webhook');
    if (!k || !WEBHOOK_RE.test(url) || (k.flag && !dc(k.flag))) return Promise.resolve(false);
    const p = cur();
    const price = S.get('curPrice');
    const fields = [{ name: 'Shop', value: SHOP.name, inline: true }];
    if (price) fields.push({ name: 'Preis', value: `${fmtEur(price)} €`, inline: true });
    if (p.maxPrice) fields.push({ name: 'Höchstpreis', value: `${fmtEur(p.maxPrice)} €`, inline: true });
    if (p.variant) fields.push({ name: 'Variante', value: p.variant, inline: true });
    const ping = dc('dcPing') && kind !== 'test' && kind !== 'available';
    const body = {
      username: 'Shop QuickBuy',
      content: ping ? '@everyone' : '',
      allowed_mentions: { parse: ping ? ['everyone'] : [] },
      embeds: [{
        title: k.title,
        url: p.url || location.href,
        color: k.color,
        description: `**${(S.get('curTitle') || shortName(p.url || location.href)).replace(/[*_`]/g, '')}**${description ? '\n' + description : ''}`,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: `Shop QuickBuy · ${SHOP.name}` },
      }],
    };
    return new Promise((resolve) => {
      try {
        GM_xmlhttpRequest({
          method: 'POST', url, headers: { 'Content-Type': 'application/json' }, data: JSON.stringify(body),
          onload: (r) => { const ok = r.status >= 200 && r.status < 300; if (!ok) log(`Discord-Fehler (HTTP ${r.status})`, 'warn'); resolve(ok); },
          onerror: () => { log('Discord nicht erreichbar', 'warn'); resolve(false); },
        });
      } catch (e) { log('Discord-Versand fehlgeschlagen', 'warn'); resolve(false); }
    });
  }

  function notify(title, text) {
    try { GM_notification({ title, text, timeout: 15000 }); } catch (e) {}
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((d) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        g.gain.value = 0.15; o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.15);
      });
    } catch (e) {}
  }

  function stop(reason) {
    S.set('running', false); S.set('stage', 'product');
    S.set('dryRun', false); busy = false;
    log(`Gestoppt: ${reason}`); renderPanel();
  }

  /* ---------- Timer, der auch im Hintergrund-Tab pünktlich läuft (Web-Worker) ---------- */
  let worker = null; const wcb = {}; let wid = 0; let lastDriftWarn = 0;
  function later(ms, fn) {
    let done = false;
    const t0 = Date.now();
    const run = () => {
      if (done) return; done = true;
      const late = Date.now() - t0 - ms;
      if (late > Math.max(3000, ms * 0.5) && Date.now() - lastDriftWarn > 10 * 60000) {
        lastDriftWarn = Date.now();
        log(`Browser bremst diesen Tab (${Math.round(late / 1000)} s zu spät) – Fenster nicht minimieren, Tab nicht schlafen lassen`, 'warn');
      }
      fn();
    };
    if (worker !== false) {
      try {
        if (!worker) {
          const src = 'onmessage=function(e){setTimeout(function(){postMessage(e.data.id)},e.data.ms)}';
          worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
          worker.onmessage = (e) => { const f = wcb[e.data]; delete wcb[e.data]; if (f) f(); };
          worker.onerror = () => { worker = false; };
        }
        const id = ++wid; wcb[id] = run; worker.postMessage({ id, ms });
      } catch (e) { worker = false; }
    }
    setTimeout(run, ms + (worker ? 1500 : 0));   // Sicherheitsnetz, falls der Worker blockiert ist
  }
  const wait = (ms) => new Promise((r) => later(ms, r));

  /* ---------- Drop-Modus ---------- */
  function dropTime() { const t = Date.parse(S.get('dropAt') || ''); return isNaN(t) ? 0 : t; }
  function dropActive() { const t = dropTime(); const now = Date.now(); return !!t && now >= t - 3 * 60000 && now <= t + 20 * 60000; }
  function currentIntervalMs() {
    const jitter = Math.random() * (Number(S.get('jitterSec')) || 0);
    if (dropActive()) return Math.round((Math.max(3, Number(S.get('dropIntervalSec')) || 5) + Math.min(jitter, 2)) * 1000);
    const base = Math.max(SHOP.minInterval || 5, Number(S.get('intervalSec')) || 15);
    return Math.round((base + jitter) * 1000);
  }

  /* ---------- Hintergrund-Prüfung (ohne Neuladen) ---------- */
  async function bgStatus(url) {
    try {
      const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!r.ok) return 'err';
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      for (const sc of doc.querySelectorAll('script[type="application/ld+json"]')) {
        let d; try { d = JSON.parse(sc.textContent); } catch (e) { continue; }
        for (const it of [].concat(d, (d && d['@graph']) || [])) {
          if (!it || !/product/i.test([].concat(it['@type']).join())) continue;
          const offers = [].concat(it.offers || []).flatMap((o) => [o].concat((o && o.offers) || []));
          const av = offers.map((o) => String((o && o.availability) || '')).join(' ');
          if (/InStock|PreOrder|LimitedAvailability|OnlineOnly/i.test(av)) return 'in';
          if (/OutOfStock|SoldOut|Discontinued/i.test(av)) return 'out';
        }
      }
      return 'err';
    } catch (e) { return 'err'; }
  }
  let bgActive = false;
  async function bgLoop() {
    if (bgActive) return; bgActive = true;
    let rounds = 0;
    try {
      while (S.get('running')) {
        if (dropActive() && !S.get('dropReloaded')) {
          S.set('dropReloaded', true);
          log('Drop-Modus aktiv – lade Seite neu (Login prüfen) und prüfe ab jetzt schneller', 'buy');
          S.set('navAt', Date.now()); location.href = cur().url; return;
        }
        const ms = currentIntervalMs();
        countdown(ms);
        await wait(ms);
        if (!S.get('running')) break;
        rounds++;
        const r = S.get('attempts') + 1; S.set('attempts', r);
        const max = S.get('maxAttempts');
        if (max > 0 && r >= max) { bgActive = false; return stop(`Maximale Runden (${max}) erreicht`); }
        if (rounds % 10 === 0) { log('Kontroll-Neuladen (Login & Status) …', 'info'); S.set('navAt', Date.now()); location.href = cur().url; return; }
        const list = S.get('products');
        for (let i = 0; i < list.length; i++) {
          if (!S.get('running')) break;
          const st = await bgStatus(list[i].url);
          const tag = `[${i + 1}/${list.length} ${shortName(list[i].url)}]`;
          if (st === 'in') {
            log(`${tag} Hintergrund: verfügbar! → öffne Seite`, 'ok');
            S.set('idx', i); S.set('navAt', Date.now()); location.href = list[i].url; return;
          }
          if (st === 'err') {
            log(`${tag} Hintergrund-Prüfung nicht möglich → lade Seite`, 'warn');
            S.set('idx', i); S.set('navAt', Date.now()); location.href = list[i].url; return;
          }
          log(`${tag} OOS (Hintergrund)`, 'oos');
          if (i < list.length - 1) await sleep(700 + Math.random() * 800);
        }
      }
    } finally { bgActive = false; }
  }

  function scheduleReload(reason) {
    if (S.get('dryRun')) return stop(`Probelauf: ${reason || 'Artikel gerade nicht kaufbar'} – nimm einen lieferbaren Artikel`);
    const list = S.get('products');
    const n = Math.max(1, list.length);
    log(`[${(S.get('idx') % n) + 1}/${n} ${shortName(cur().url)}] ${reason || 'OOS (' + oosReason() + ')'}`);
    if (SHOP.bgCheck) return bgLoop();          // Sony/Microsoft: im Hintergrund weiterprüfen, nicht neu laden
    if (dropActive() && !S.get('dropReloaded')) { S.set('dropReloaded', true); log('Drop-Modus aktiv – prüfe ab jetzt schneller', 'buy'); }

    const next = (S.get('idx') + 1) % n;
    S.set('idx', next);
    let wait;
    if (next === 0) {                       // Runde durch alle Produkte fertig
      const rounds = S.get('attempts') + 1; S.set('attempts', rounds);
      const max = S.get('maxAttempts');
      if (max > 0 && rounds >= max) return stop(`Maximale Runden (${max}) erreicht`);
      wait = currentIntervalMs();
    } else {                                // nächstes Produkt in der Liste
      wait = Math.round((Math.max(2, Number(S.get('stepDelaySec')) || 3) + Math.random() * 2) * 1000);
    }
    countdown(wait);
    later(wait, () => { if (S.get('running')) { S.set('navAt', Date.now()); location.href = cur().url; } });
  }

  // Nach erfolgreicher Bestellung: stoppen oder mit restlichen Produkten weitermachen
  // Merkt sich, welches Produkt bereits im Warenkorb liegt → nie doppelt hinzufügen
  const inCartKey = () => keyOf(cur().url);
  const isInCart = () => !!S.get('inCart')[inCartKey()];
  function setInCart(v) { const m = { ...S.get('inCart') }; if (v) m[inCartKey()] = true; else delete m[inCartKey()]; S.set('inCart', m); }

  /* ---------- Kaufhistorie (gilt für alle Shops) ---------- */
  function recordHistory(result) {
    const h = GM_getValue('global:history', []);
    h.unshift({ ts: Date.now(), shop: SHOP.name, shopId: SHOP_ID, title: S.get('curTitle') || shortName(cur().url),
      price: Number(S.get('curPrice')) || 0, url: cur().url, result });
    GM_setValue('global:history', h.slice(0, 300));
  }

  // Nach erfolgreichem Kauf: gleiches Produkt erneut (bis Stückzahl), dann nächstes Produkt, sonst stoppen
  function finishSuccess(msg) {
    setInCart(false);
    recordHistory('success');
    const done = cur();
    const list = S.get('products');
    const k = S.get('idx') % Math.max(1, list.length);
    let more = false;
    if (list[k]) {
      const item = { ...list[k], bought: (Number(list[k].bought) || 0) + 1 };
      const qty = item.qty === undefined ? 1 : Number(item.qty) || 0;
      more = qty === 0 || item.bought < qty;
      if (more) list[k] = item; else list.splice(k, 1);
      S.set('products', list);
      log(`${msg}: ${shortName(done.url)} (${item.bought}/${qty || '∞'} gekauft)`, 'ok');
    }
    if (!list.length) { S.set('idx', 0); return stop(`${msg} – alle Produkte erledigt`); }
    if (!S.get('continueAfterBuy')) { S.set('idx', 0); return stop(`${msg} (${shortName(done.url)})`); }
    if (!more) S.set('idx', k % list.length);
    S.set('stage', 'product');
    log(more ? 'Kaufe dasselbe Produkt erneut …' : `Weiter mit ${list.length} Produkt(en) …`, 'buy');
    renderPanel();
    later(4000, () => { if (S.get('running')) { S.set('navAt', Date.now()); location.href = cur().url; } });
  }

  /* ================================================================== *
   *  Variante wählen
   * ================================================================== */
  async function selectVariant() {
    const v = norm(cur().variant);
    if (!v) return true;
    for (const sel of document.querySelectorAll('select')) {
      const opt = [...sel.options].find((o) => norm(o.textContent).toLowerCase() === v.toLowerCase());
      if (opt) {
        if (opt.disabled) { log(`Variante "${v}" ist ausverkauft`); return false; }
        sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
        log(`Variante "${v}" gewählt (Dropdown)`); await sleep(800); return true;
      }
    }
    const cands = deepAll().filter((el) => isClickableEl(el) ||
      ['LI', 'LABEL'].includes(el.tagName) || ['option', 'radio'].includes(el.getAttribute('role')));
    for (const el of cands) {
      if (el.closest('#qb-panel')) continue;
      if (elText(el).toLowerCase() === v.toLowerCase() && visible(el)) {
        if (isDisabled(el)) { log(`Variante "${v}" ist ausverkauft`); return false; }
        clickEl(el); log(`Variante "${v}" gewählt`); await sleep(800); return true;
      }
    }
    const opener = findClickable(COMMON.variantOpener);
    if (opener && !opener.dataset.qbOpened) {
      opener.dataset.qbOpened = '1'; clickEl(opener); await sleep(1000); return selectVariant();
    }
    log(`Variante "${v}" nicht gefunden`);
    return false;
  }

  /* ---------- Seite analysieren (für neue Shops / Kassenseiten) ---------- */
  function analyzePage() {
    const mask = (t) => String(t || '').replace(/\d[\d\s-]{3,}\d/g, '••••').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<mail>');
    const items = [];
    for (const el of deepAll()) {
      if (el.closest('#qb-panel') || !visible(el)) continue;
      const tag = el.tagName;
      const clickable = isClickableEl(el) || ['INPUT', 'SELECT', 'LABEL'].includes(tag) || el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'checkbox';
      if (!clickable) continue;
      const t = mask(elText(el)).slice(0, 80);
      if (tag === 'INPUT' && !['checkbox', 'radio', 'submit', 'button'].includes(el.type)) {
        items.push({ tag, type: el.type, name: el.name || '', label: mask(el.getAttribute('aria-label') || '').slice(0, 60) });
        continue;
      }
      if (!t && !el.getAttribute('data-qa') && !el.getAttribute('data-test')) continue;
      items.push({
        tag, t,
        qa: el.getAttribute('data-qa') || el.getAttribute('data-test') || undefined,
        aria: mask(el.getAttribute('aria-label') || '').slice(0, 60) || undefined,
        dis: isDisabled(el) || undefined,
        checked: (el.checked || el.getAttribute('aria-checked') === 'true') || undefined,
      });
    }
    const heads = [...document.querySelectorAll('h1,h2,h3')].filter(visible).map((h) => mask(norm(h.innerText)).slice(0, 60)).filter(Boolean).slice(0, 15);
    const out = {
      shop: SHOP.name, url: location.origin + location.pathname, title: document.title.slice(0, 80), heads,
      items: items.slice(0, 120),
    };
    const txt = '```json\n' + JSON.stringify(out) + '\n```';
    try { GM_setClipboard(txt, 'text'); log(`Seitenanalyse kopiert (${items.length} Elemente) – jetzt im Chat einfügen`, 'ok'); }
    catch (e) { console.log(txt); log('Kopieren fehlgeschlagen – Analyse steht in der Konsole (F12)', 'warn'); }
  }

  /* ================================================================== *
   *  Ablauf
   * ================================================================== */
  async function runProduct() {
    await sleep(1500);
    if (cur().variant && !(await selectVariant())) return scheduleReload(`Variante „${cur().variant}“ nicht wählbar`);
    if (SHOP.needLogin) {
      const ctaEl = deepAll().find((e) => SHOP.buyFilter && SHOP.buyFilter(e) && visible(e));
      const ctaNeedsLogin = ctaEl && SHOP.needLogin.test(elText(ctaEl));
      const headerBtn = SHOP.signInButton && SHOP.signInButton();
      const cta = ctaNeedsLogin ? ctaEl : headerBtn;   // vorab anmelden, auch wenn noch nichts kaufbar ist
      if (cta) {
        const since = S.get('loginWait') || 0;
        if (!S.get('autoLogin')) {
          discord('error', `Bei ${SHOP.name} nicht angemeldet („${elText(cta)}“) – bitte anmelden und neu starten.`);
          notify(`QuickBuy ${SHOP.name}`, 'Nicht angemeldet – bitte anmelden');
          return stop(`Nicht angemeldet („${elText(cta)}“) – bitte bei ${SHOP.name} anmelden und neu starten`);
        }
        if (since && Date.now() - since > 10 * 60000) {
          S.set('loginWait', 0);
          discord('error', `Seit 10 Minuten nicht bei ${SHOP.name} angemeldet – Script gestoppt.`);
          return stop('Anmeldung nicht abgeschlossen (10 Min.) – bitte anmelden und neu starten');
        }
        if (!since) S.set('loginWait', Date.now());
        // Normalerweise meldet Sony dich nach dem Klick automatisch an. Alarm nur, wenn das nach 90 s nicht geklappt hat.
        if (since && Date.now() - since > 90000 && !S.get('loginAlerted')) {
          S.set('loginAlerted', true);
          notify(`QuickBuy ${SHOP.name}`, 'Automatische Anmeldung klappt nicht – bitte manuell anmelden');
          discord('error', '**Sony-Anmeldung klappt nicht automatisch** – bitte manuell anmelden, danach macht das Script weiter.');
        }
        log(since ? 'Immer noch nicht angemeldet → klicke erneut „Anmelden“' : 'Nicht angemeldet → klicke „Anmelden“ (Sony meldet automatisch an)', since ? 'warn' : 'info');
        S.set('navAt', Date.now());
        clickEl(cta);
        return;
      }
      if (S.get('loginWait')) { S.set('loginWait', 0); S.set('loginAlerted', false); log('Angemeldet ✔ – weiter geht’s', 'ok'); }
    }
    if (captchaPresent()) return handleCaptcha();
    if (isOOS()) return scheduleReload();

    if (SHOP.sellerOf && S.get('onlyOwn')) {
      const seller = SHOP.sellerOf();
      if (seller && !SHOP.ownSeller.test(seller)) return scheduleReload(`Marktplatz-Händler „${seller}“ – übersprungen`);
    }

    const pc = priceOk();
    if (!pc.ok) return scheduleReload(pc.msg);
    if (pc.msg) log(pc.msg, 'info');
    const gp = getProductPrice();
    S.set('curPrice', gp ? gp.price : 0);
    { const h1 = document.querySelector('h1, #productTitle'); S.set('curTitle', h1 ? norm(h1.innerText).slice(0, 60) : ''); }

    if (SHOP.alertOnly) {
      notify(`QuickBuy ${SHOP.name}`, 'Verfügbar – jetzt selbst kaufen!');
      await discord('restock', `Bei **${SHOP.name}** verfügbar${gp ? ` für **${fmtEur(gp.price)} €**` : ''} – **jetzt selbst kaufen!**`);
      recordHistory('alert');
      return stop('Verfügbar – Alarm gesendet, bitte selbst kaufen');
    }

    if (isInCart() && SHOP.stopAfterAdd && !SHOP.psFlow) {
      return stop('Produkt liegt laut Script schon im Einkaufswagen – Einkaufswagen prüfen. (Zum erneuten Hinzufügen Produkt entfernen und neu eintragen.)');
    }
    if (isInCart()) {
      log('Produkt liegt schon im Warenkorb – prüfe dort statt erneut hinzuzufügen', 'buy');
      S.set('justAdded', false); S.set('stage', 'basket');
      location.href = SHOP.basketUrl;
      return;
    }

    const btn = findBuyButton();
    log('Verfügbar! Lege in den Warenkorb …');
    notify(`QuickBuy ${SHOP.name}`, 'Artikel verfügbar – wird in den Warenkorb gelegt');
    const h1 = document.querySelector('h1');
    S.set('curTitle', h1 ? norm(h1.innerText).slice(0, 40) : '');
    discord('available', 'Wird gerade in den Warenkorb gelegt …');
    S.set('stage', 'basket'); S.set('justAdded', true);
    const before = location.href;
    const cartBefore = SHOP.cartCount ? SHOP.cartCount() : null;
    if (SHOP.qtyInput) {
      const q = Number(cur().qty === undefined ? 1 : cur().qty);
      const inp = SHOP.qtyInput();
      if (inp && q > 1) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(inp, String(q));
        inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
        log(`Menge auf ${q} gesetzt`, 'buy');
        await sleep(400);
      }
    }
    clickEl(btn);

    await sleep(1500);
    if (SHOP.dismiss) {
      const d = findClickable(SHOP.dismiss);
      if (d) { clickEl(d); log('Zusatzangebot abgelehnt'); await sleep(800); }
    }
    if (SHOP.psFlow) {
      S.set('stage', 'ps-cart'); S.set('psSince', Date.now());
      log('Im Einkaufswagen – suche „Weiter zur Kasse“ …', 'buy');
      return psWatcher();
    }

    if (SHOP.stopAfterAdd) {
      setInCart(true);
      await sleep(2500);
      if (SHOP.cartCount && cartBefore !== null) {
        const after = await waitFor(() => { const c = SHOP.cartCount(); return c !== null && c > cartBefore ? c : null; }, 6000);
        if (!after) {
          discord('error', `Klick auf „In den Warenkorb“ bei ${SHOP.name}, aber der Warenkorb-Zähler hat sich nicht erhöht – bitte prüfen.`);
          return stop('Warenkorb-Zähler unverändert – Hinzufügen nicht bestätigt, bitte prüfen');
        }
        log(`Warenkorb bestätigt (${cartBefore} → ${after} Artikel)`, 'ok');
      }
      notify(`QuickBuy ${SHOP.name}`, 'Im Einkaufswagen – jetzt selbst zur Kasse!');
      await discord('added', 'Liegt im Einkaufswagen – **jetzt selbst zur Kasse gehen** (Login / Warteschlange beachten).');
      window.scrollTo(0, 0);
      return stop('Im Einkaufswagen – bitte jetzt selbst zur Kasse gehen');
    }

    // Shop leitet evtl. selbst weiter (z. B. Microsoft "Jetzt kaufen") – kurz abwarten
    const moved = await waitFor(() => location.href !== before, 4000);
    if (moved && SHOP.isBasket(location.pathname)) return runBasket();
    if (moved && SHOP.isCheckout(location.pathname)) { S.set('stage', 'checkout'); return runCheckout(); }
    if (!moved) location.href = SHOP.basketUrl;
  }

  async function restartLoop(reason, tryRemove, item) {
    log(`${reason} → starte Loop neu`);
    if (tryRemove) {
      const rm = (item && item.remove) || findClickable(COMMON.remove);
      if (rm) {
        clickEl(rm);
        await sleep(1500);
        const c = findClickable(COMMON.confirmRemove);
        if (c && !(item && c === item.remove)) { clickEl(c); await sleep(1500); }
        setInCart(false);
        log('Nicht lieferbaren Artikel aus dem Warenkorb entfernt', 'info');
      } else {
        log('Entfernen-Button nicht gefunden – Artikel bleibt im Warenkorb (wird nicht erneut hinzugefügt)', 'warn');
      }
    }
    S.set('stage', 'product');
    scheduleReload(reason);
  }

  // Passenden Warenkorb-Eintrag zum aktuellen Produkt finden
  function findCartItem(items) {
    const key = keyOf(cur().url);
    const title = (S.get('curTitle') || '').toLowerCase().slice(0, 25);
    return items.find((it) => (title && it.title.toLowerCase().includes(title)) ||
      (key && key.length >= 5 && it.box.innerHTML.toLowerCase().includes(key))) || null;
  }

  function targetInCartGeneric() {
    const key = keyOf(cur().url);
    const main = (document.querySelector('main') || document.body);
    if (key && key.length >= 5 && main.innerHTML.toLowerCase().includes(key)) return true;
    const title = (S.get('curTitle') || '').toLowerCase();
    return !!title && pageText().toLowerCase().includes(title.slice(0, 25));
  }

  function wrongItemStop() {
    notify(`QuickBuy ${SHOP.name}`, 'Gesuchtes Produkt NICHT im Warenkorb – gestoppt, bitte prüfen');
    discord('error', 'Gesuchtes Produkt ist **nicht im Warenkorb** – Script gestoppt. Bitte Warenkorb prüfen.');
    return stop('Zielprodukt nicht im Warenkorb gefunden (evtl. falscher Artikel hinzugefügt) – bitte Warenkorb prüfen');
  }

  async function runBasket() {
    const justAdded = S.get('justAdded');
    S.set('justAdded', false);

    // Warten bis der Warenkorb wirklich geladen ist (MediaMarkt lädt langsam nach)
    if (SHOP.cartReady) {
      const ready = await waitFor(() => SHOP.cartReady(), 30000, 300);
      if (!ready) return restartLoop('Warenkorb lädt nicht', false);
      await sleep(800);
    } else {
      await sleep(2500);
    }

    let item = null;
    if (SHOP.cartItems) {
      const items = SHOP.cartItems();
      item = findCartItem(items);
      if (!item) {
        if (justAdded) return wrongItemStop();
        setInCart(false);                       // wurde extern entfernt → beim nächsten Mal wieder hinzufügen
        return restartLoop('Produkt nicht mehr im Warenkorb', false);
      }
      setInCart(true);

      // Menge auf 1 korrigieren
      if (item.qty > 1 && item.minus) {
        log(`Menge im Warenkorb ist ${item.qty} → setze auf 1`, 'buy');
        for (let i = 0; i < 10 && item && item.qty > 1; i++) {
          clickEl(item.minus);
          await sleep(1800);
          item = findCartItem(SHOP.cartItems());
        }
        if (item && item.qty > 1) {
          discord('error', `Menge im Warenkorb ist **${item.qty}** und ließ sich nicht auf 1 setzen – gestoppt.`);
          return stop(`Menge ließ sich nicht auf 1 setzen (aktuell ${item.qty}) – bitte manuell korrigieren`);
        }
      }

      // Preis im Warenkorb nochmal prüfen (letzte Sicherung vor der Kasse)
      const maxP = Number(cur().maxPrice) || 0;
      const itemPrice = parsePrice(norm(item.box.innerText));
      if (maxP && itemPrice && itemPrice / Math.max(1, item.qty) > maxP) {
        log(`Preis im Warenkorb ${fmtEur(itemPrice)} € > Max ${fmtEur(maxP)} € – entferne Artikel`, 'err');
        discord('error', `Preis im Warenkorb **${fmtEur(itemPrice)} €** über Limit **${fmtEur(maxP)} €** – Artikel entfernt.`);
        return restartLoop('Preis im Warenkorb über Limit', true, item);
      }

      // Weitere Artikel im Warenkorb? Bei Auto-Bestellung nicht riskieren
      const others = SHOP.cartItems().filter((it) => it.box !== (item && item.box));
      if (others.length) {
        const names = others.map((o) => o.title.slice(0, 40)).join(', ');
        if (S.get('autoOrder')) {
          discord('error', `Warenkorb enthält weitere Artikel (${names}) – Auto-Bestellung abgebrochen.`);
          return stop(`Warenkorb enthält weitere Artikel: ${names} – bitte entfernen`);
        }
        log(`Achtung: weitere Artikel im Warenkorb: ${names}`, 'warn');
      }

      // Nur den Eintrag des Zielprodukts auf "nicht verfügbar" prüfen
      const t = norm(item.box.innerText);
      const hit = COMMON.cartOos.find((p) => p.test(t));
      if (hit) {
        // Artikel bleibt im Warenkorb (wird NICHT entfernt und NICHT erneut hinzugefügt) – weiter beobachten
        return restartLoop(`Im Warenkorb noch „${t.match(hit)[0]}“`, false);
      }
    } else {
      if (!targetInCartGeneric()) {
        if (justAdded) return wrongItemStop();
        setInCart(false);
        return restartLoop('Produkt nicht mehr im Warenkorb', false);
      }
      setInCart(true);
      const oos = cartOosText();
      if (oos) return restartLoop(`Warenkorb meldet „${oos}“`, true);
    }

    const btn = await waitFor(() => {
      const b = (SHOP.checkoutSelector && [...document.querySelectorAll(SHOP.checkoutSelector)].find((x) => visible(x) && !isDisabled(x)))
        || findClickable(SHOP.toCheckout);
      return b && visible(b) && !isDisabled(b) ? b : null;
    }, 15000);
    if (!btn) {
      const o = cartOosText();
      return restartLoop(o ? `Warenkorb meldet „${o}“` : '„Zur Kasse“ nicht verfügbar', false);
    }
    log('Warenkorb ok → Zur Kasse', 'buy');
    S.set('stage', 'checkout'); S.set('payOk', false);
    clickEl(btn);
  }

  function backToBasket(msg) {
    S.set('stage', 'basket'); log(`${msg} → zurück zum Warenkorb`);
    location.href = SHOP.basketUrl;
  }

  const NEXT_STEP = [/^weiter$/i, /^weiter\s+zur\s+(zahlung|zahlungsart|übersicht|bestellübersicht|prüfung)$/i,
    /^zur\s+(bestellübersicht|übersicht|zahlung)$/i, /^weiter\s+zum\s+(bezahlen|nächsten\s+schritt)$/i, /^bestellung\s+prüfen$/i];

  async function runCheckout() {
    await sleep(2000);
    const oos = cartOosText();
    if (oos) return backToBasket(`Kasse meldet „${oos}“`);
    const wantPay = S.get('payMethod') !== 'default' && PAY[S.get('payMethod')] && PAY[S.get('payMethod')].re;

    // Mehrstufige Kasse: Zahlungsart wählen, "Weiter" klicken, bis der Bestell-Button da ist
    let btn = null;
    const deadline = Date.now() + 45000;
    let lastNext = null;
    while (Date.now() < deadline) {
      if (cartOosText()) return backToBasket(`Kasse meldet „${cartOosText()}“`);
      if (wantPay) {
        const pay = await ensurePayment();
        if (!pay.ok) {
          discord('error', `Zahlungsart: ${pay.msg} – **nicht bestellt**, bitte manuell abschließen.`);
          notify(`QuickBuy ${SHOP.name}`, `Zahlungsart: ${pay.msg}`);
          return stop(`Zahlungsart: ${pay.msg} – nicht bestellt, bitte manuell abschließen`);
        }
        if (pay.msg && !pay.none) { if (!S.get('payOk')) log(pay.msg, 'info'); S.set('payOk', true); }
      }
      const f = findClickable(SHOP.finalOrder);
      if (f && !isDisabled(f)) { btn = f; break; }
      const n = findClickable(NEXT_STEP);
      if (n && !isDisabled(n) && n !== lastNext) { log(`Kasse: „${elText(n)}“`, 'buy'); lastNext = n; clickEl(n); await sleep(2500); continue; }
      await sleep(600);
    }

    if (btn && wantPay && !S.get('payOk')) {
      discord('error', `Zahlungsart „${PAY[S.get('payMethod')].label}“ konnte nicht bestätigt werden – **nicht bestellt**.`);
      return stop(`Zahlungsart „${PAY[S.get('payMethod')].label}“ nicht bestätigt – nicht bestellt, bitte manuell abschließen`);
    }
    if (!btn) {
      notify(`QuickBuy ${SHOP.name}`, 'Kasse erreicht – bitte manuell prüfen (Login/Adresse/Zahlart/Lieferart?)');
      discord('error', 'Kasse erreicht, aber Bestell-Button nicht gefunden (Login / Adresse / Zahlart / Lieferart?). **Bitte manuell abschließen.**');
      return stop('Bestell-Button nicht gefunden – bitte manuell abschließen');
    }
    if (S.get('dryRun')) {
      btn.style.outline = '4px solid #e60000'; btn.scrollIntoView({ block: 'center' });
      return stop('🧪 Probelauf erfolgreich – bis vor den letzten Klick ✔ (Artikel bitte wieder aus dem Warenkorb nehmen)');
    }
    if (!S.get('autoOrder')) {
      btn.style.outline = '4px solid #e60000'; btn.scrollIntoView({ block: 'center' });
      notify(`QuickBuy ${SHOP.name}`, 'Kasse erreicht – jetzt nur noch "Zahlungspflichtig bestellen" klicken!');
      discord('checkout', 'Artikel liegt bereit – jetzt nur noch **„Zahlungspflichtig bestellen“** klicken!');
      return stop('Kasse erreicht – Bestellung bitte selbst bestätigen');
    }

    const max = Number(cur().maxPrice) || 0;
    if (max) {
      const total = getTotalPrice();
      const limit = max + 15; // Puffer für Versandkosten
      if (total && total > limit) {
        btn.style.outline = '4px solid #e60000'; btn.scrollIntoView({ block: 'center' });
        notify(`QuickBuy ${SHOP.name}`, `Gesamtsumme ${total.toFixed(2)} € über Limit – NICHT bestellt`);
        discord('error', `Gesamtsumme **${fmtEur(total)} €** liegt über dem Limit – **nicht bestellt**.`);
        return stop(`Gesamtsumme ${total.toFixed(2)} € > Max ${max.toFixed(2)} € + 15 € Versandpuffer – nicht bestellt`);
      }
      log(total ? `Gesamtsumme ${total.toFixed(2)} € ok` : 'Gesamtsumme nicht erkannt – Artikelpreis wurde bereits geprüft');
    }

    log(`Auto-Bestellung: klicke „${elText(btn)}“`, 'buy');
    S.set('stage', 'done');
    clickEl(btn);
    setTimeout(() => {
      if (S.get('stage') === 'done' && !COMMON.success.test(pageText())) {
        notify(`QuickBuy ${SHOP.name}`, 'Bitte Zahlung bestätigen (Banking-App / Prüfnummer)');
        discord('checkout', '**Zahlung bestätigen!** Bestellung ist abgeschickt – bitte in der Banking-App bzw. auf der Seite bestätigen.');
      }
    }, 12000);
    const result = await waitFor(() => (COMMON.success.test(pageText()) ? 'ok' : cartOosText() ? 'oos' : null), 120000, 500);
    if (result === 'oos') return backToBasket(`Bestellung abgelehnt („${cartOosText()}“)`);
    if (result === 'ok') { notify(`QuickBuy ${SHOP.name}`, '✅ Bestellung erfolgreich!'); await discord('success', 'Bestellung wurde aufgegeben 🎉'); return finishSuccess('Bestellung erfolgreich'); }
    notify(`QuickBuy ${SHOP.name}`, 'Bestellung abgeschickt – Ergebnis unklar, bitte prüfen');
    discord('unclear', 'Bestellung wurde abgeschickt, Bestätigung aber nicht erkannt – bitte im Kundenkonto prüfen.');
    stop('Kein eindeutiges Ergebnis – bitte manuell prüfen');
  }

  /* ---------- PlayStation: Einkaufswagen-Leiste → Kasse → Bestellen ----------
   * Läuft in jedem Frame (Seite + evtl. iFrame der Leiste). Der Zustand liegt im gemeinsamen
   * Tampermonkey-Speicher, deshalb handelt immer der Frame, der den Button gerade sieht. */
  let psRunning = false;
  function psText() {
    let t = document.body ? document.body.innerText : '';
    for (const el of deepAll()) if (el.shadowRoot) t += ' ' + el.shadowRoot.textContent;
    return norm(t);
  }
  function psInfo() {
    const t = psText();
    const m = t.match(/gesamt\s*\((\d+)\s*objekt[e]?\)\s*([\d.]+,\d{2}\s*€)/i);
    return { count: m ? parseInt(m[1], 10) : null, total: m ? parsePrice(m[2]) : null,
      hasTitle: !S.get('curTitle') || t.toLowerCase().includes(S.get('curTitle').toLowerCase().slice(0, 25)) };
  }
  function psProblem(msg) {
    discord('error', msg);
    notify(`QuickBuy ${SHOP.name}`, msg.replace(/\*/g, ''));
    return stop(msg.replace(/\*/g, ''));
  }
  /* ---------- Zahlungsmethode wählen + prüfen ---------- */
  const PAY = {
    default:  { label: 'Wie im Konto (Standard)' },
    card:     { label: 'Kreditkarte', re: /\b(visa|mastercard|master\s*card|amex|american\s+express|kreditkarte|kartenzahlung|click\s+to\s+pay)\b|[*•·]{2,}\s*\d{4}/i },
    invoice:  { label: 'Rechnung (Klarna)', re: /rechnung|klarna/i },
    prepay:   { label: 'Vorkasse / Überweisung', re: /vorkasse|überweisung/i },
    paypal:   { label: 'PayPal', re: /paypal/i },
  };
  const PAY_HEAD = /^(zahlungsmethoden?|zahlungsart(en)?|bezahlart|bezahlmethode|zahlung|zahlungsoptionen|wie\s+möchtest\s+du\s+(be)?zahlen\??)$/i;
  // Bereich unter der Überschrift "Zahlungsmethode/Zahlungsart" → Text = aktuelle Auswahl (Aufklapp-Variante)
  function payBox() {
    const head = deepAll().find((e) => visible(e) && PAY_HEAD.test(elText(e)) && e.children.length <= 2);
    if (!head) return null;
    let box = head.parentElement;
    for (let i = 0; i < 4 && box; i++) {
      const rest = norm(box.innerText || '').replace(elText(head), '').trim();
      if (rest.length > 3) return { head, box, text: rest.slice(0, 200) };
      box = box.parentElement;
    }
    return null;
  }
  const ANY_PAY = /visa|mastercard|kreditkarte|rechnung|klarna|paypal|vorkasse|überweisung|lastschrift|ratenkauf|raten|apple\s*pay|google\s*pay|sofort/i;
  function radioLabel(r) {
    if (r.getAttribute('role') === 'radio') return elText(r);
    const l = (r.labels && r.labels[0]) || r.closest('label');
    return norm((l && l.innerText) || r.getAttribute('aria-label') || (r.parentElement && r.parentElement.innerText) || '');
  }
  const isChecked = (r) => r.checked || r.getAttribute('aria-checked') === 'true';
  function payRadios() {
    return deepAll().filter((e) => ((e.tagName === 'INPUT' && e.type === 'radio') || e.getAttribute('role') === 'radio') &&
      !e.closest('#qb-panel') && ANY_PAY.test(radioLabel(e)));
  }
  // Ist die gewünschte Zahlungsart ausgewählt? true/false, null = keine Zahlungsauswahl auf dieser Seite
  function paySelected(want) {
    if (SHOP.payValue) {
      const v = SHOP.payValue[S.get('payMethod')];
      const radios = deepAll().filter((e) => e.tagName === 'INPUT' && e.type === 'radio' && Object.values(SHOP.payValue).concat(['APPLEPAY', 'AMAZONPAY', 'OPAY']).includes(e.value));
      if (radios.length) {
        if (!v) return false;                                   // gewünschte Zahlungsart gibt es hier nicht
        const r = radios.find((x) => x.value === v);
        return !!(r && r.checked);
      }
    }
    const radios = payRadios();
    if (radios.length) return radios.some((r) => isChecked(r) && want.re.test(radioLabel(r)));
    const pb = payBox();
    if (pb && ANY_PAY.test(pb.text)) return want.re.test(pb.text);
    return null;
  }
  const NEW_PAY = /\b(neue|neuen|new)\b|hinzufügen|ajouter|eingeben/i;   // "Neue Kreditkarte verwenden" → würde Kartendaten verlangen
  function payRadioByValue() {
    const v = SHOP.payValue && SHOP.payValue[S.get('payMethod')];
    return v ? deepAll().find((e) => e.tagName === 'INPUT' && e.type === 'radio' && e.value === v) : null;
  }
  function findPayOption(want, exclude) {
    const rv = payRadioByValue();
    if (rv) return (rv.labels && rv.labels[0]) || rv.closest('label') || rv;
    const r = payRadios().find((x) => want.re.test(radioLabel(x)) && !NEW_PAY.test(radioLabel(x)));
    if (r) return (r.labels && r.labels[0]) || r.closest('label') || r;
    return deepAll().find((e) => visible(e) && e !== exclude && !(exclude && exclude.contains(e)) && !e.closest('#qb-panel') &&
      (['option', 'radio', 'menuitem', 'menuitemradio'].includes(e.getAttribute('role')) || ['LI', 'LABEL'].includes(e.tagName) || isClickableEl(e)) &&
      elText(e).length < 120 && want.re.test(elText(e)) && !NEW_PAY.test(elText(e))) || null;
  }
  async function ensurePayment() {
    const want = PAY[S.get('payMethod')];
    if (!want || !want.re) return { ok: true };
    const sel = paySelected(want);
    if (sel === true) return { ok: true, msg: `Zahlungsart ok: ${want.label}` };
    if (sel === null) return { ok: true, none: true };        // auf dieser Seite keine Zahlungsauswahl

    log(`Wähle Zahlungsart „${want.label}“ …`, 'buy');
    let opener = null;
    if (SHOP.payValue && !SHOP.payValue[S.get('payMethod')]) return { ok: false, msg: `„${want.label}“ wird von ${SHOP.name} nicht angeboten` };
    let opt = payRadioByValue() || (payRadios().length ? findPayOption(want) : null);
    if (!opt) {
      const pb = payBox();
      if (!pb) return { ok: false, msg: 'Zahlungsauswahl nicht gefunden' };
      opener = [...pb.box.querySelectorAll('button, [role="button"], [role="combobox"], select, a')].find(visible) || pb.box;
      if (opener.tagName === 'SELECT') {
        const o = [...opener.options].find((x) => want.re.test(x.textContent));
        if (!o) return { ok: false, msg: `„${want.label}“ steht nicht zur Auswahl` };
        opener.value = o.value; opener.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        clickEl(opener);
        await sleep(1200);
        opt = findPayOption(want, opener);
        if (!opt) return { ok: false, msg: `„${want.label}“ steht nicht zur Auswahl` };
      }
    }
    if (opt) clickEl(opt);
    await sleep(2000);
    const confirmBtn = findClickable([/^(übernehmen|bestätigen|auswählen|speichern|fertig)$/i]);
    if (confirmBtn) { clickEl(confirmBtn); await sleep(1500); }
    if (paySelected(want) === true) return { ok: true, msg: `Zahlungsart gewählt: ${want.label}` };
    return { ok: false, msg: `Auswahl „${want.label}“ nicht bestätigt` };
  }

  async function psWatcher() {
    if (psRunning) return; psRunning = true;
    const deadline = (S.get('psSince') || Date.now()) + 120000;   // max. 2 Minuten für den ganzen Checkout
    let cartOpened = false;
    while (S.get('running') && String(S.get('stage')).startsWith('ps-')) {
      const stage = S.get('stage');
      if (Date.now() > deadline) {
        if (stage === 'ps-done') {
          await discord('unclear', 'Bestellung abgeschickt, aber keine Bestätigung erkannt – evtl. Zahlung in der **Banking-App bestätigen** und Bestellstatus prüfen.');
          return stop('Bestellung abgeschickt – Bestätigung nicht erkannt (Banking-App / Bestellstatus prüfen)');
        }
        return psProblem(`Kasse nicht abgeschlossen (Stand: ${stage}) – **bitte manuell weitermachen**.`);
      }

      if (stage === 'ps-cart') {
        const b = findClickable(SHOP.psCheckout);
        if (b && !isDisabled(b)) {
          await sleep(600);
          const i = psInfo();
          if (i.count != null && i.count !== 1) return psProblem(`Einkaufswagen enthält **${i.count} Objekte** statt 1 – abgebrochen.`);
          if (!i.hasTitle) return psProblem('Gesuchtes Produkt nicht im Einkaufswagen gefunden – abgebrochen.');
          log('Einkaufswagen ok → Weiter zur Kasse', 'buy');
          S.set('stage', 'ps-pay');
          clickEl(b);
          await sleep(1500);
          continue;
        }
        // Leiste nach 5 s nicht offen → Einkaufswagen-Symbol oben anklicken (nur im Hauptfenster)
        if (!cartOpened && window.top === window && Date.now() - (S.get('psSince') || 0) > 5000) {
          const icon = deepAll().find((e) => /cart#show$/i.test(e.getAttribute('data-qa') || '') && visible(e));
          if (icon) { cartOpened = true; log('Öffne Einkaufswagen …', 'buy'); clickEl(icon); }
        }
      }

      if (stage === 'ps-pay') {
        const b = findClickable(SHOP.psOrder);
        if (b && !isDisabled(b)) {
          await sleep(1200);                         // Preise/Lieferart fertig laden lassen
          const pay = await ensurePayment();
          if (!pay.ok) return psProblem(`Zahlungsmethode: ${pay.msg} – **nicht bestellt**, bitte manuell abschließen.`);
          if (pay.none && S.get('payMethod') !== 'default') return psProblem('Zahlungsauswahl nicht gefunden – **nicht bestellt**, bitte manuell abschließen.');
          if (pay.msg) log(pay.msg, 'info');
          const b2 = findClickable(SHOP.psOrder);
          if (!b2 || isDisabled(b2)) { await sleep(800); continue; }
          const i = psInfo();
          const max = Number(cur().maxPrice) || 0;
          if (i.count != null && i.count !== 1) return psProblem(`Kasse zeigt **${i.count} Objekte** statt 1 – nicht bestellt.`);
          if (!i.hasTitle) return psProblem('Gesuchtes Produkt nicht in der Bestellübersicht – nicht bestellt.');
          if (max && !i.total) return psProblem('Gesamtsumme nicht erkannt – sicherheitshalber **nicht bestellt**.');
          if (max && i.total > max + 15) return psProblem(`Gesamtsumme **${fmtEur(i.total)} €** über Limit (${fmtEur(max)} € + 15 €) – **nicht bestellt**.`);
          if (i.total) S.set('curPrice', i.total);

          if (S.get('dryRun')) {
            b2.style.outline = '4px solid #e60000'; b2.scrollIntoView({ block: 'center' });
            return stop('🧪 Probelauf erfolgreich – bis vor „Bestellen und bezahlen“ ✔ (Artikel bitte wieder aus dem Einkaufswagen nehmen)');
          }
          if (!S.get('autoOrder')) {
            b2.style.outline = '4px solid #e60000'; b2.scrollIntoView({ block: 'center' });
            notify(`QuickBuy ${SHOP.name}`, 'Kasse erreicht – jetzt nur noch „Bestellen und bezahlen“ klicken!');
            await discord('checkout', `Gesamt **${i.total ? fmtEur(i.total) + ' €' : '?'}** – jetzt nur noch **„Bestellen und bezahlen“** klicken!`);
            return stop('Kasse erreicht – bitte selbst „Bestellen und bezahlen“ klicken');
          }
          log(`Auto-Bestellung: „Bestellen und bezahlen“ (Gesamt ${i.total ? fmtEur(i.total) + ' €' : '?'})`, 'buy');
          S.set('stage', 'ps-done');
          clickEl(b2);
          await sleep(2000);
          continue;
        }
      }

      if (stage === 'ps-done' && COMMON.success.test(psText())) {
        notify(`QuickBuy ${SHOP.name}`, '✅ Bestellung erfolgreich!');
        await discord('success', 'Bestellung wurde aufgegeben 🎉');
        return finishSuccess('Bestellung erfolgreich');
      }
      await sleep(500);
    }
    psRunning = false;
  }

  /* ---------- Captcha (DataDome, Amazon, reCAPTCHA, Cloudflare) – wird NIE automatisch gelöst ---------- */
  function captchaPresent() {
    return !!document.querySelector('iframe[src*="captcha-delivery.com"], script[src*="captcha-delivery.com"], form[action*="validateCaptcha"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"], #challenge-form, iframe[src*="challenges.cloudflare.com"]');
  }
  let captchaWatch = false;
  function handleCaptcha() {
    if (captchaWatch) return; captchaWatch = true;
    busy = true;
    const last = S.get('captchaAt') || 0;
    if (Date.now() - last > 10 * 60000) {
      S.set('captchaAt', Date.now());
      notify(`QuickBuy ${SHOP.name}`, 'Captcha – bitte im Tab lösen, danach geht es automatisch weiter');
      discord('error', `**Captcha bei ${SHOP.name}** – bitte im offenen Tab lösen. Danach macht das Script automatisch weiter.`);
    }
    log('Captcha erkannt – warte, bis du es gelöst hast (wird nie automatisch gelöst)', 'warn');
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (!S.get('running')) { clearInterval(iv); return; }
      if (!captchaPresent()) {
        clearInterval(iv); log('Captcha gelöst ✔ – weiter geht’s', 'ok');
        setTimeout(() => { S.set('navAt', Date.now()); location.href = cur().url || location.href; }, 2500);
      } else if (Date.now() - t0 > 15 * 60000) {
        clearInterval(iv); stop('Captcha seit 15 Min. nicht gelöst – gestoppt');
      }
    }, 3000);
  }

  async function main() {
    if (SHOP.psFlow) {
      // Jeder Frame (auch die Einkaufswagen-Leiste) schaut regelmäßig, ob ein Checkout läuft
      setInterval(() => { if (S.get('running') && String(S.get('stage')).startsWith('ps-')) psWatcher(); }, 1000);
      if (S.get('running') && String(S.get('stage')).startsWith('ps-')) { busy = true; renderPanel(); return psWatcher(); }
    }
    if (window.top !== window) return;   // in iFrames sonst nichts tun
    renderPanel();
    if (!S.get('running')) return;
    busy = true;
    if (captchaPresent()) return handleCaptcha();
    const path = location.pathname;
    const stage = S.get('stage');

    // Nach "Bestellen" wurde die Seite gewechselt → auswerten, NIE erneut kaufen
    if (stage === 'done') {
      await sleep(2000);
      const ok = COMMON.success.test(pageText());
      if (!ok && cartOosText()) return backToBasket(`Bestellung abgelehnt („${cartOosText()}“)`);
      notify(`QuickBuy ${SHOP.name}`, ok ? '✅ Bestellung erfolgreich!' : 'Bestellung abgeschickt – bitte prüfen');
      await discord(ok ? 'success' : 'unclear', ok ? 'Bestellung wurde aufgegeben 🎉' : 'Bestellung wurde abgeschickt, Bestätigung aber nicht erkannt – bitte im Kundenkonto prüfen.');
      return ok ? finishSuccess('Bestellung erfolgreich') : stop('Bestellung abgeschickt – Ergebnis unklar, Loop beendet');
    }
    if (stripUrl(location.href) === stripUrl(cur().url)) return runProduct();
    if (SHOP.productUrl.test(location.href)) {   // Produktseite, aber nicht das aktuelle Listenprodukt
      const i = S.get('products').findIndex((x) => stripUrl(x.url) === stripUrl(location.href));
      if (i >= 0) { S.set('idx', i); return runProduct(); }
      // Shop hat unsere Produkt-URL umgeleitet. Original-URL bleibt IMMER gespeichert.
      if (stage === 'product' && Date.now() - (S.get('navAt') || 0) < 60000 && cur().url) {
        if (keyOf(location.href) === keyOf(cur().url)) {
          log('Weiterleitung auf dieselbe Artikelnummer – prüfe Seite (Original-URL bleibt gespeichert)', 'info');
          return runProduct();
        }
        return scheduleReload(`Weitergeleitet auf anderes Produkt (${shortName(location.href)}) – nicht gekauft, Original-URL wird weiter aufgerufen`);
      }
    }
    // Produktseite nicht mehr erreichbar (Weiterleitung auf Suche/Startseite/Fehlerseite) → als "nicht verfügbar" werten
    if (stage === 'product' && Date.now() - (S.get('navAt') || 0) < 60000 && cur().url && !SHOP.isBasket(path) && !SHOP.isCheckout(path)
        && !(SHOP.needLogin && S.get('loginWait'))) {
      return scheduleReload(`Produktseite nicht gefunden (weitergeleitet auf ${path}) – Original-URL wird weiter aufgerufen`);
    }
    if (SHOP.isBasket(path)) return runBasket();
    if (SHOP.isCheckout(path) || stage === 'checkout') return runCheckout();
    // Nach dem Sony-Login auf einer anderen Seite gelandet → zurück zum Produkt
    if (SHOP.needLogin && S.get('loginWait')) {
      log('Zurück vom Login → öffne Produktseite …', 'info');
      setTimeout(() => { if (S.get('running')) { S.set('navAt', Date.now()); location.href = cur().url; } }, 2500);
      return;
    }
    log(`Unbekannte Seite (${path}) – warte. Ggf. einloggen/Queue abwarten und Start erneut drücken.`);
  }

  /* ================================================================== *
   *  Panel
   * ================================================================== */
  let cdTimer = null;
  function countdown(ms) {
    const el = document.getElementById('qb-cd'); if (!el) return;
    const end = Date.now() + ms; clearInterval(cdTimer);
    cdTimer = setInterval(() => {
      const left = Math.max(0, end - Date.now());
      el.textContent = `⏱ Nächste Prüfung in ${(left / 1000).toFixed(0)} s · Runde ${S.get('attempts') + 1}`;
      if (!left) clearInterval(cdTimer);
    }, 250);
  }

  const LOG_ICON = { ok: '✅', err: '⛔', warn: '⚠️', oos: '💤', buy: '🛒', info: 'ℹ️' };
  function renderLog() {
    const box = document.getElementById('qb-log');
    const cnt = document.getElementById('qb-logcnt');
    const l = getLog();
    if (cnt) cnt.textContent = l.length ? l.length : '';
    if (!box) return;
    if (!l.length) { box.innerHTML = '<div class="qb-empty">Noch keine Einträge</div>'; return; }
    box.innerHTML = l.map((e) => {
      const m = String(e.msg).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/^\[(\d+\/\d+) ([^\]]+)\]\s*/, '<span class="qb-tag">$1</span><span class="qb-prod">$2</span><br>');
      return `<div class="qb-le t-${e.type}">
        <span class="qb-ic">${LOG_ICON[e.type] || 'ℹ️'}</span>
        <div class="qb-tx"><div class="qb-m">${m}</div>
        <div class="qb-meta">${e.ts}${e.n > 1 ? ` · <b>×${e.n}</b>` : ''}</div></div></div>`;
    }).join('');
  }

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const parseEur = (v) => {
    v = String(v || '').replace('€', '').trim();
    if (!v) return 0;
    return parseFloat(v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v) || 0;
  };

  const CSS = `
    #qb-panel{position:fixed;bottom:16px;right:16px;z-index:2147483647;width:340px;max-height:calc(100vh - 32px);
      display:flex;flex-direction:column;font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:#e8e8ea;
      background:#16171b;border:1px solid #2a2c33;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.45);overflow:hidden}
    #qb-panel *{box-sizing:border-box}
    #qb-panel .qb-head{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#1d1f25;border-bottom:1px solid #2a2c33;cursor:move;user-select:none}
    #qb-panel .qb-title{font-weight:700;font-size:14px}
    #qb-panel .qb-shop{font-size:11px;padding:2px 7px;border-radius:999px;background:#2a2d36;color:#c9cbd3}
    #qb-panel .qb-pill{margin-left:auto;font-size:11px;font-weight:600;padding:3px 8px;border-radius:999px}
    #qb-panel .qb-pill.on{background:rgba(29,185,84,.15);color:#3ddc7a}
    #qb-panel .qb-pill.off{background:#2a2d36;color:#9a9ca6}
    #qb-panel .qb-icon{background:none;border:0;color:#9a9ca6;font-size:16px;cursor:pointer;padding:0 2px;line-height:1}
    #qb-panel .qb-body{padding:12px;overflow:auto;display:flex;flex-direction:column;gap:12px}
    #qb-panel.min .qb-body{display:none}
    #qb-panel .qb-sec{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8b8e99;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center}
    #qb-panel .qb-card{background:#1d1f25;border:1px solid #2a2c33;border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:6px}
    #qb-panel .qb-card.active{border-color:#3ddc7a}
    #qb-panel .qb-card .qb-name{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;gap:6px;align-items:center}
    #qb-panel .qb-num{flex:none;width:18px;height:18px;border-radius:50%;background:#2a2d36;font-size:10px;display:grid;place-items:center}
    #qb-panel .qb-row{display:flex;gap:6px;align-items:center}
    #qb-panel input[type=text]{width:100%;background:#111215;border:1px solid #2f323a;color:#fff;border-radius:7px;padding:6px 8px;font:12px system-ui,sans-serif;outline:none}
    #qb-panel input[type=text]:focus{border-color:#5b8cff}
    #qb-panel input:disabled{opacity:.55}
    #qb-panel .qb-del{flex:none;width:28px;height:28px;border-radius:7px;border:1px solid #2f323a;background:#111215;color:#ff6b6b;cursor:pointer}
    #qb-panel .qb-add{display:flex;gap:6px}
    #qb-panel .qb-btn{border:0;border-radius:9px;padding:9px 10px;font-weight:700;font-size:13px;cursor:pointer;width:100%}
    #qb-panel .qb-btn.sm{padding:6px 8px;font-size:12px;font-weight:600;background:#23262d;color:#c9cbd3;border:1px dashed #3a3d46}
    #qb-panel .qb-btn.go{background:#1db954;color:#06210f}
    #qb-panel .qb-btn.stop{background:#e5484d;color:#fff}
    #qb-panel .qb-btn.ghost{background:#23262d;color:#c9cbd3;font-weight:600}
    #qb-panel details{background:#1d1f25;border:1px solid #2a2c33;border-radius:10px}
    #qb-panel summary{cursor:pointer;padding:8px 10px;font-weight:600;font-size:12px;color:#c9cbd3;list-style:none}
    #qb-panel summary::-webkit-details-marker{display:none}
    #qb-panel summary::before{content:'▸ ';color:#8b8e99}
    #qb-panel details[open] summary::before{content:'▾ '}
    #qb-panel .qb-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 10px 10px}
    #qb-panel .qb-grid label,#qb-panel .qb-lbl{font-size:11px;color:#8b8e99;display:block;margin-bottom:3px}
    #qb-panel .qb-check{display:flex;gap:8px;align-items:center;font-size:12px;color:#c9cbd3;padding:0 10px 10px;cursor:pointer}
    #qb-panel .qb-auto{display:flex;gap:10px;align-items:center;padding:10px;border-radius:10px;border:1px solid #2a2c33;background:#1d1f25;cursor:pointer}
    #qb-panel .qb-auto.on{border-color:#e5484d;background:rgba(229,72,77,.1)}
    #qb-panel .qb-switch{flex:none;width:34px;height:20px;border-radius:999px;background:#3a3d46;position:relative;transition:.15s}
    #qb-panel .qb-switch::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.15s}
    #qb-panel .qb-auto.on .qb-switch{background:#e5484d}
    #qb-panel .qb-auto.on .qb-switch::after{left:16px}
    #qb-panel .qb-auto b{display:block;font-size:12px}
    #qb-panel .qb-auto small{color:#8b8e99;font-size:11px}
    #qb-panel .qb-status{font-size:12px;color:#9a9ca6;text-align:center}
    #qb-log{max-height:220px;overflow:auto;padding:0 8px 8px;display:flex;flex-direction:column;gap:4px}
    #qb-log::-webkit-scrollbar{width:6px}#qb-log::-webkit-scrollbar-thumb{background:#33363f;border-radius:3px}
    #qb-panel .qb-le{display:flex;gap:8px;align-items:flex-start;padding:6px 8px;border-radius:8px;background:#16171b;border-left:3px solid #3a3d46}
    #qb-panel .qb-le .qb-ic{flex:none;font-size:13px;line-height:18px}
    #qb-panel .qb-le .qb-tx{min-width:0;flex:1}
    #qb-panel .qb-le .qb-m{font-size:12px;color:#d7d9e0;word-break:break-word}
    #qb-panel .qb-le .qb-meta{font-size:10.5px;color:#7d808b;margin-top:1px}
    #qb-panel .qb-le .qb-meta b{color:#c9cbd3;background:#2a2d36;border-radius:4px;padding:0 4px;font-weight:600}
    #qb-panel .qb-le .qb-tag{font-size:10px;font-weight:700;background:#2a2d36;color:#c9cbd3;border-radius:4px;padding:1px 5px;margin-right:5px}
    #qb-panel .qb-le .qb-prod{font-size:11px;color:#9a9ca6}
    #qb-panel .qb-le.t-ok{border-left-color:#3ddc7a;background:rgba(61,220,122,.07)}
    #qb-panel .qb-le.t-buy{border-left-color:#5b8cff;background:rgba(91,140,255,.07)}
    #qb-panel .qb-le.t-err{border-left-color:#e5484d;background:rgba(229,72,77,.09)}
    #qb-panel .qb-le.t-warn{border-left-color:#f5a524;background:rgba(245,165,36,.07)}
    #qb-panel .qb-le.t-oos{border-left-color:#4a4d57}
    #qb-panel .qb-le.t-oos .qb-m{color:#9a9ca6}
    #qb-panel .qb-empty{font-size:12px;color:#7d808b;text-align:center;padding:8px}
    #qb-panel .qb-logbar{display:flex;justify-content:flex-end;padding:0 8px 6px}
    #qb-panel .qb-link{background:none;border:0;color:#8b8e99;font-size:11px;cursor:pointer;text-decoration:underline}
    #qb-panel .qb-badge{display:inline-block;min-width:18px;font-size:10px;font-weight:700;text-align:center;background:#2a2d36;color:#c9cbd3;border-radius:999px;padding:1px 6px;margin-left:6px}
    #qb-panel .qb-badge:empty{display:none}
    #qb-panel .qb-dc{padding:0 10px 10px;display:flex;flex-direction:column;gap:6px}
    #qb-panel .qb-dc .qb-check{padding:0}
    #qb-panel .qb-dcok{color:#3ddc7a;font-size:11px}
    #qb-panel .qb-hint{font-size:11px;color:#8b8e99}
    #qb-panel .qb-name > span:nth-child(2){min-width:0;overflow:hidden;text-overflow:ellipsis}
    #qb-panel .qb-bought{margin-left:auto;flex:none;font-size:10px;font-weight:700;color:#3ddc7a;background:rgba(61,220,122,.12);border-radius:999px;padding:1px 7px}
  `;

  function saveProductsFromDom(p) {
    const rows = [...p.querySelectorAll('.qb-card[data-i]')];
    const old = S.get('products');
    const list = rows.map((r) => {
      const url = stripUrl(norm(r.querySelector('.qb-url').value));
      const qv = norm(r.querySelector('.qb-qty').value);
      const qty = qv === '' ? 1 : /^(∞|0|unendlich|max)$/i.test(qv) ? 0 : Math.max(0, parseInt(qv, 10) || 1);
      const prev = old.find((o) => o.url === url);
      return { url, variant: norm(r.querySelector('.qb-var').value), maxPrice: parseEur(r.querySelector('.qb-pr').value), qty, bought: prev ? prev.bought || 0 : 0 };
    });
    S.set('products', list);
    return list;
  }

  // Styles über Tampermonkey einfügen (funktioniert auch auf Seiten mit strenger CSP)
  function addCss(css, id) {
    if (document.getElementById(id)) return;
    try { const el = GM_addStyle(css); if (el && el.setAttribute) el.id = id; if (el) return; } catch (e) {}
    const st = document.createElement('style'); st.id = id; st.textContent = css; (document.head || document.documentElement).appendChild(st);
  }

  function renderPanel() {
    if (window.top !== window) return;
    if (!document.body) return;
    let p = document.getElementById('qb-panel');
    if (!p) {
      p = document.createElement('div'); p.id = 'qb-panel'; document.body.appendChild(p);
      addCss(CSS, 'qb-panel-css');
      try { const pos = JSON.parse(localStorage.getItem('qb-pos') || 'null');
        if (pos) Object.assign(p.style, { left: pos.l + 'px', top: pos.t + 'px', right: 'auto', bottom: 'auto' }); } catch (e) {}
      if (S.get('minimized')) p.classList.add('min');
    }
    const running = S.get('running');
    let list = S.get('products');
    if (!list.length && SHOP.productUrl.test(location.href)) list = [{ url: stripUrl(location.href), variant: '', maxPrice: 0 }];
    if (!list.length) list = [{ url: '', variant: '', maxPrice: 0 }];
    const n = list.length;
    const idx = S.get('idx') % Math.max(1, n);
    const dis = running ? 'disabled' : '';
    const onThisPage = SHOP.productUrl.test(location.href) && !list.some((x) => x.url === stripUrl(location.href));

    p.innerHTML = `
      <div class="qb-head">
        <span class="qb-title">🛒 QuickBuy</span><span class="qb-shop">${SHOP.name}</span>
        <span class="qb-pill ${running ? 'on' : 'off'}">${running ? `● Läuft · ${idx + 1}/${n}` : 'Gestoppt'}</span>
        <button class="qb-icon" id="qb-dashbtn" title="Dashboard (alle Shops)">📊</button>
        <button class="qb-icon" id="qb-min" title="Ein-/Ausklappen">${p.classList.contains('min') ? '▴' : '▾'}</button>
      </div>
      <div class="qb-body">
        <div>
          <div class="qb-sec"><span>Produkte (${n})</span></div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${list.map((x, i) => `
              <div class="qb-card ${running && i === idx ? 'active' : ''}" data-i="${i}">
                <div class="qb-name"><span class="qb-num">${i + 1}</span><span>${esc(x.url ? shortName(x.url) : 'Neues Produkt')}</span>${x.bought ? `<span class="qb-bought">✔ ${x.bought}× gekauft</span>` : ''}</div>
                <input type="text" class="qb-url" placeholder="${esc(SHOP.productHint)}" value="${esc(x.url)}" ${dis}>
                <div class="qb-row">
                  <input type="text" class="qb-var" placeholder="Variante (optional)" value="${esc(x.variant)}" ${dis}>
                  <input type="text" class="qb-pr" placeholder="Max. €" style="width:82px;flex:none;text-align:right" value="${x.maxPrice ? fmtEur(x.maxPrice) : ''}" ${dis}>
                  <input type="text" class="qb-qty" title="Stückzahl: so oft kaufen (0 = so viele wie möglich)" placeholder="Stk." style="width:44px;flex:none;text-align:center" value="${x.qty === undefined ? 1 : (Number(x.qty) === 0 ? '∞' : x.qty)}" ${dis}>
                  <button class="qb-del" data-del="${i}" title="Entfernen" ${dis}>✕</button>
                </div>
              </div>`).join('')}
          </div>
          ${running ? '' : `<div class="qb-add" style="margin-top:8px">
            ${onThisPage ? '<button class="qb-btn sm" id="qb-addcur">+ Diese Seite</button>' : ''}
            <button class="qb-btn sm" id="qb-addrow">+ Produkt</button>
          </div>`}
        </div>

        ${SHOP.alertOnly ? `<div class="qb-auto" style="cursor:default">
          <span style="font-size:18px">🔔</span>
          <span><b>Modus: Nur Alarm${SHOP.beta ? ' (Beta)' : ''}</b><small>Bei ${SHOP.name} meldet das Script Verfügbarkeit (Ton + Discord) – kaufen machst du selbst${SHOP.beta ? '. Bitte einmal 🔍 Test + 🧩 Seite analysieren und an Claude schicken.' : ''}</small></span>
        </div>` : ''}
        ${SHOP.stopAfterAdd ? `<div class="qb-auto" style="cursor:default">
          <span style="font-size:18px">🛒</span>
          <span><b>Modus: In den Einkaufswagen + Alarm</b><small>Bei ${SHOP.name} stoppt das Script nach dem Hinzufügen – Kasse, Login &amp; Warteschlange machst du selbst</small></span>
        </div>` : ''}
        <div class="qb-auto ${S.get('autoOrder') ? 'on' : ''}" id="qb-auto" ${SHOP.stopAfterAdd || SHOP.alertOnly ? 'style="display:none"' : ''}>
          <span class="qb-switch"></span>
          <span><b>Automatisch bestellen</b><small>${S.get('autoOrder') ? 'AN – klickt „Zahlungspflichtig bestellen“ selbst' : 'AUS – stoppt an der Kasse, du bestätigst selbst'}</small></span>
        </div>

        <details id="qb-dcbox">
          <summary>🔔 Discord ${WEBHOOK_RE.test(dc('webhook')) ? '<span class="qb-dcok">● verbunden</span>' : ''}</summary>
          <div class="qb-dc">
            <div><span class="qb-lbl">Webhook-URL (Server-Einstellungen → Integrationen → Webhooks)</span>
              <input type="text" id="qb-wh" placeholder="https://discord.com/api/webhooks/…" value="${esc(dc('webhook'))}"></div>
            <label class="qb-check"><input type="checkbox" data-dc="dcSuccess" ${dc('dcSuccess') ? 'checked' : ''}> Kauf erfolgreich</label>
            <label class="qb-check"><input type="checkbox" data-dc="dcCheckout" ${dc('dcCheckout') ? 'checked' : ''}> Kasse erreicht (du musst bestätigen)</label>
            <label class="qb-check"><input type="checkbox" data-dc="dcError" ${dc('dcError') ? 'checked' : ''}> Probleme (falscher Artikel, über Limit, Button fehlt)</label>
            <label class="qb-check"><input type="checkbox" data-dc="dcAvailable" ${dc('dcAvailable') ? 'checked' : ''}> Artikel verfügbar</label>
            <label class="qb-check"><input type="checkbox" data-dc="dcPing" ${dc('dcPing') ? 'checked' : ''}> @everyone erwähnen</label>
            <button class="qb-btn ghost" id="qb-dctest">Test-Nachricht senden</button>
          </div>
        </details>

        <details id="qb-set">
          <summary>⚙ Einstellungen</summary>
          <div class="qb-grid">
            <div><label>Runden-Pause (s)</label><input type="text" id="qb-int" value="${S.get('intervalSec')}" ${dis}></div>
            <div><label>+ Zufall (s)</label><input type="text" id="qb-jit" value="${S.get('jitterSec')}" ${dis}></div>
            <div><label>Pause zw. Produkten (s)</label><input type="text" id="qb-step" value="${S.get('stepDelaySec')}" ${dis}></div>
            <div><label>Max. Runden (0 = ∞)</label><input type="text" id="qb-max" value="${S.get('maxAttempts')}" ${dis}></div>
            <div style="grid-column:1/-1"><label>Standard-Höchstpreis € (wenn bei Produkt leer, 0 = egal)</label><input type="text" id="qb-price" value="${S.get('maxPrice') ? fmtEur(S.get('maxPrice')) : ''}" placeholder="0" ${dis}></div>
            <div><label>⏰ Drop-Zeit (optional)</label><input type="datetime-local" id="qb-drop" value="${esc(S.get('dropAt'))}" style="width:100%;background:#111215;border:1px solid #2f323a;color:#fff;border-radius:7px;padding:5px 6px;font:12px system-ui,sans-serif;color-scheme:dark"></div>
            <div><label>Pause im Drop (s, min. 3)</label><input type="text" id="qb-dropint" value="${S.get('dropIntervalSec')}"></div>
            <div style="grid-column:1/-1" class="qb-hint">Drop-Modus: 3 Min. vorher Login prüfen, dann bis 20 Min. danach im kurzen Takt prüfen.${dropActive() ? ' <b style="color:#3ddc7a">● gerade aktiv</b>' : ''}</div>
          </div>
          ${SHOP.finalOrder && SHOP.finalOrder.length || SHOP.psFlow ? `<div style="padding:0 10px 10px"><span class="qb-lbl">Zahlungsart an der Kasse</span>
            <select id="qb-pay" ${dis} style="width:100%;background:#111215;border:1px solid #2f323a;color:#fff;border-radius:7px;padding:6px 8px;font:12px system-ui,sans-serif">
              ${Object.entries(PAY).map(([k, v]) => `<option value="${k}" ${S.get('payMethod') === k ? 'selected' : ''}>${v.label}</option>`).join('')}
            </select></div>` : ''}
          ${SHOP.needLogin ? `<label class="qb-check"><input type="checkbox" id="qb-login" ${S.get('autoLogin') ? 'checked' : ''} ${dis}> Bei Abmeldung Login öffnen + Alarm, danach automatisch weiter</label>` : ''}
          ${SHOP.sellerOf ? `<label class="qb-check"><input type="checkbox" id="qb-own" ${S.get('onlyOwn') ? 'checked' : ''} ${dis}> Nur Verkauf durch ${SHOP.name} (keine Marktplatz-Händler)</label>` : ''}
          <label class="qb-check"><input type="checkbox" id="qb-after" ${S.get('continueAfterBuy') ? 'checked' : ''} ${dis}> Nach Kauf weitermachen (gleiches Produkt bis zur Stückzahl, dann nächstes)</label>
          <div style="padding:0 10px 10px"><button class="qb-btn ghost" id="qb-analyze">🧩 Seite analysieren (kopiert Aufbau für Claude)</button></div>
        </details>

        <div style="display:flex;gap:8px">
          <button class="qb-btn ${running ? 'stop' : 'go'}" id="qb-toggle">${running ? '■ Stop' : '▶ Start'}</button>
          <button class="qb-btn ghost" id="qb-diag" style="width:auto;flex:none" title="Prüft die Seite, klickt nichts">🔍 Test</button>
          ${!running && !SHOP.alertOnly && SHOP.productUrl.test(location.href) ? '<button class="qb-btn ghost" id="qb-dry" style="width:auto;flex:none" title="Probelauf mit diesem Artikel bis vor den letzten Klick – es wird NIE bestellt">🧪</button>' : ''}
        </div>
        <div class="qb-status" id="qb-cd">${running ? `Runde ${S.get('attempts') + 1}` : 'Bereit'}</div>

        <details id="qb-logbox" ${S.get('logOpen') ? 'open' : ''}>
          <summary>📋 Protokoll<span class="qb-badge" id="qb-logcnt"></span></summary>
          <div class="qb-logbar"><button class="qb-link" id="qb-logclear">Leeren</button></div>
          <div id="qb-log"></div>
        </details>
      </div>`;
    renderLog();

    // Einklappen
    p.querySelector('#qb-min').onclick = (e) => {
      e.stopPropagation(); p.classList.toggle('min'); S.set('minimized', p.classList.contains('min'));
      e.target.textContent = p.classList.contains('min') ? '▴' : '▾';
    };
    p.querySelector('#qb-logbox').ontoggle = (e) => S.set('logOpen', e.target.open);
    p.querySelector('#qb-logclear').onclick = () => { S.set('log', []); renderLog(); };

    // Discord
    const wh = p.querySelector('#qb-wh');
    wh.onchange = () => {
      const v = norm(wh.value);
      if (v && !WEBHOOK_RE.test(v)) { alert('Das sieht nicht nach einer Discord-Webhook-URL aus.\nFormat: https://discord.com/api/webhooks/…'); return; }
      G.set('webhook', v); renderPanel(); p.querySelector('#qb-dcbox').open = true;
    };
    p.querySelectorAll('[data-dc]').forEach((c) => { c.onchange = () => G.set(c.dataset.dc, c.checked); });
    p.querySelector('#qb-dctest').onclick = async () => {
      const v = norm(wh.value);
      if (!WEBHOOK_RE.test(v)) return alert('Bitte zuerst eine gültige Webhook-URL eintragen.');
      G.set('webhook', v);
      const ok = await discord('test', 'Wenn du das siehst, funktioniert die Verbindung 👍');
      log(ok ? 'Discord-Test gesendet ✅' : 'Discord-Test fehlgeschlagen', ok ? 'ok' : 'warn');
    };

    // Verschieben per Drag am Kopf
    const head = p.querySelector('.qb-head');
    head.onmousedown = (e) => {
      if (e.target.closest('button')) return;
      const r = p.getBoundingClientRect(); const dx = e.clientX - r.left; const dy = e.clientY - r.top;
      const move = (ev) => Object.assign(p.style, { left: Math.max(0, ev.clientX - dx) + 'px', top: Math.max(0, ev.clientY - dy) + 'px', right: 'auto', bottom: 'auto' });
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
        try { const b = p.getBoundingClientRect(); localStorage.setItem('qb-pos', JSON.stringify({ l: b.left, t: b.top })); } catch (e2) {} };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    };

    // Produkte bearbeiten
    p.querySelectorAll('.qb-card input').forEach((inp) => { inp.onchange = () => saveProductsFromDom(p); });
    p.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
      const l = saveProductsFromDom(p); l.splice(Number(b.dataset.del), 1); S.set('products', l); renderPanel();
    });
    const addRow = p.querySelector('#qb-addrow');
    if (addRow) addRow.onclick = () => { const l = saveProductsFromDom(p); l.push({ url: '', variant: '', maxPrice: 0, qty: 1, bought: 0 }); S.set('products', l); renderPanel(); };
    const addCur = p.querySelector('#qb-addcur');
    if (addCur) addCur.onclick = () => {
      const l = saveProductsFromDom(p).filter((x) => x.url);
      l.push({ url: stripUrl(location.href), variant: '', maxPrice: 0, qty: 1, bought: 0 }); S.set('products', l); renderPanel();
    };

    // Auto-Bestellung umschalten
    p.querySelector('#qb-auto').onclick = () => {
      const v = !S.get('autoOrder');
      if (v && !confirm('Automatisch bestellen aktivieren?\n\nDas Script klickt dann selbst „Zahlungspflichtig bestellen“ – die Bestellung ist verbindlich.')) return;
      S.set('autoOrder', v); renderPanel();
    };

    // Start / Stop
    p.querySelector('#qb-toggle').onclick = () => {
      if (S.get('running')) return stop('manuell');
      const defMax = parseEur(p.querySelector('#qb-price').value);
      const products = [];
      for (const x of saveProductsFromDom(p)) {
        if (!x.url) continue;
        if (!SHOP.productUrl.test(x.url)) { alert(`Keine gültige ${SHOP.name}-Produkt-URL:\n${x.url}\n\nFormat: ${SHOP.productHint}`); return; }
        // Preis versehentlich ins Variantenfeld geschrieben?
        if (x.variant && /^\d+(?:[.,]\d{3})*(?:[.,]\d{2})?\s*€$|^\d+(?:\.\d{3})*[.,]\d{2}$/.test(x.variant)) {
          if (!x.maxPrice) x.maxPrice = parseEur(x.variant);
          x.variant = '';
        }
        if (!x.maxPrice) x.maxPrice = defMax;
        if (!products.some((y) => y.url === x.url)) products.push(x);
      }
      if (!products.length) { alert('Bitte mindestens eine Produkt-URL eintragen.'); return; }
      S.set('products', products); S.set('idx', 0); S.set('maxPrice', defMax);
      const minInt = SHOP.minInterval || 5;
      const iv = parseEur(p.querySelector('#qb-int').value) || 15;
      if (iv < minInt) log(`${SHOP.name}: Runden-Pause auf mindestens ${minInt} s gesetzt (Bot-Schutz)`, 'warn');
      S.set('intervalSec', Math.max(minInt, iv));
      S.set('jitterSec', Math.max(0, parseEur(p.querySelector('#qb-jit').value)));
      S.set('maxAttempts', Math.max(0, Math.floor(parseEur(p.querySelector('#qb-max').value))));
      S.set('stepDelaySec', Math.max(2, parseEur(p.querySelector('#qb-step').value) || 3));
      S.set('continueAfterBuy', p.querySelector('#qb-after').checked);
      S.set('dryRun', false); busy = true;
      // PlayStation: Einkaufswagen kann nicht geprüft werden → jeder Start beginnt frisch
      if (SHOP.stopAfterAdd || SHOP.psFlow) S.set('inCart', {});
      S.set('loginWait', 0); S.set('loginAlerted', false);
      S.set('attempts', 0); S.set('stage', 'product'); S.set('running', true);
      log(`Gestartet mit ${products.length} Produkt(en)${S.get('autoOrder') ? ' – AUTO-BESTELLUNG AN' : ''}`);
      if (stripUrl(location.href) !== products[0].url) { S.set('navAt', Date.now()); location.href = products[0].url; } else { renderPanel(); main(); }
    };

    p.querySelector('#qb-dashbtn').onclick = (e) => { e.stopPropagation(); openDashboard(); };
    const dropEl = p.querySelector('#qb-drop');
    dropEl.onchange = () => { S.set('dropAt', dropEl.value); S.set('dropReloaded', false); log(dropEl.value ? `Drop-Zeit gesetzt: ${new Date(dropEl.value).toLocaleString('de-DE')}` : 'Drop-Zeit entfernt', 'info'); };
    const dropInt = p.querySelector('#qb-dropint');
    dropInt.onchange = () => S.set('dropIntervalSec', Math.max(3, parseEur(dropInt.value) || 5));
    const dryBtn = p.querySelector('#qb-dry');
    if (dryBtn) dryBtn.onclick = () => {
      if (!confirm('🧪 Probelauf starten?\n\nDas Script legt DIESEN Artikel in den Warenkorb und geht durch die Kasse bis vor den letzten Klick. Es wird NIE bestellt.\n\nTipp: Nimm einen günstigen, lieferbaren Artikel und entferne ihn danach wieder.')) return;
      S.set('dryProduct', { url: stripUrl(location.href), variant: '', maxPrice: 0, qty: 1 });
      S.set('dryRun', true); S.set('stage', 'product'); S.set('running', true); S.set('payOk', false);
      if (SHOP.stopAfterAdd || SHOP.psFlow) S.set('inCart', {});
      busy = true;
      log('🧪 Probelauf gestartet – es wird nicht bestellt', 'buy');
      renderPanel(); main();
    };
    const loginChk = p.querySelector('#qb-login');
    if (loginChk) loginChk.onchange = () => S.set('autoLogin', loginChk.checked);
    const ownChk = p.querySelector('#qb-own');
    if (ownChk) ownChk.onchange = () => S.set('onlyOwn', ownChk.checked);
    const paySel = p.querySelector('#qb-pay');
    if (paySel) paySel.onchange = () => S.set('payMethod', paySel.value);
    p.querySelector('#qb-analyze').onclick = () => { p.querySelector('#qb-logbox').open = true; analyzePage(); };

    // Test / Diagnose
    p.querySelector('#qb-diag').onclick = () => {
      const lb = p.querySelector('#qb-logbox'); lb.open = true; S.set('logOpen', true);
      if (!SHOP.productUrl.test(location.href)) return log('Test: Bitte auf einer Produktseite ausführen');
      const raw = findClickable(SHOP.addToCart);
      const btn = findBuyButton();
      if (raw && raw !== btn) log('Test: Zubehör-/Empfehlungs-Button erkannt und ignoriert ✔');
      if (SHOP.signInButton && !SHOP.buyFilter) log(`Test: Bei ${SHOP.name} ${SHOP.signInButton() ? 'NICHT angemeldet („Me connecter“ sichtbar)' : 'angemeldet ✔'}`, SHOP.signInButton() ? 'warn' : 'ok');
      if (SHOP.buyFilter) {
        const cta = deepAll().find((e) => SHOP.buyFilter(e) && visible(e));
        if (SHOP.signInButton) log(`Test: Bei ${SHOP.name} ${SHOP.signInButton() ? 'NICHT angemeldet („Anmelden“ oben sichtbar)' : 'angemeldet ✔'}`, SHOP.signInButton() ? 'warn' : 'ok');
        if (cta) log(`Test: Kaufbereich zeigt „${elText(cta)}“`, SHOP.needLogin && SHOP.needLogin.test(elText(cta)) ? 'warn' : 'info');
      }
      log(btn ? `Test: Kauf-Button gefunden – ${isDisabled(btn) ? 'deaktiviert' : 'aktiv'}` : 'Test: Kauf-Button nicht gefunden');
      const gp = getProductPrice();
      log(`Test: Preis ${gp ? fmtEur(gp.price) + ' €' : 'nicht erkannt'}`);
      log(`Test: Ergebnis → ${isOOS() ? '❌ nicht kaufbar (OOS)' : '✅ VERFÜGBAR'}`, isOOS() ? 'warn' : 'ok');
    };
  }


  /* ================================================================== *
   *  GESAMT-DASHBOARD – steuert alle Shops (öffnet sich in jedem Shop-Tab)
   * ================================================================== */
  const gv = (id, k, d) => GM_getValue(`${id}:${k}`, d !== undefined ? d : DEFAULTS[k]);
  const sv = (id, k, v) => GM_setValue(`${id}:${k}`, v);
  const tabOpen = (id) => Date.now() - (gv(id, 'heartbeat', 0) || 0) < 12000;
  function logFor(id) {
    return gv(id, 'log', []).map((e) => typeof e === 'string'
      ? { ts: e.slice(0, 8), msg: e.replace(/^[\d:]+\s+–\s+/, ''), type: logType(e), n: 1 } : e);
  }
  function pushLog(id, msg, type) {
    const l = logFor(id);
    l.unshift({ ts: new Date().toLocaleTimeString('de-DE'), at: Date.now(), msg, type: type || 'info', n: 1 });
    sv(id, 'log', l.slice(0, 60));
  }
  function dashStart(id) {
    const list = gv(id, 'products', []);
    if (!list.length) { alert(`${SHOPS[id].name}: Keine Produkte eingetragen.`); return false; }
    sv(id, 'idx', 0); sv(id, 'attempts', 0); sv(id, 'stage', 'product'); sv(id, 'dryRun', false);
    sv(id, 'loginWait', 0); sv(id, 'loginAlerted', false); sv(id, 'payOk', false);
    if (SHOPS[id].stopAfterAdd || SHOPS[id].psFlow) sv(id, 'inCart', {});
    sv(id, 'running', true);
    pushLog(id, `Vom Dashboard gestartet${gv(id, 'autoOrder', false) ? ' – AUTO-BESTELLUNG AN' : ''}`, 'buy');
    if (!tabOpen(id)) openTab(list[0].url);
    return true;
  }
  // Tampermonkey-Tab (wird nicht vom Popup-Blocker gestoppt, auch bei "Alle starten")
  function openTab(url) {
    try { GM_openInTab(url, { active: false, insert: true, setParent: true }); } catch (e) { window.open(url, '_blank'); }
  }
  function dashStop(id) { sv(id, 'running', false); sv(id, 'stage', 'product'); sv(id, 'dryRun', false); pushLog(id, 'Gestoppt: vom Dashboard', 'warn'); }

  /* ---------- Export / Import ---------- */
  function exportAll() {
    const data = {};
    for (const k of GM_listValues()) if (!/:heartbeat$/.test(k)) data[k] = GM_getValue(k);
    const json = JSON.stringify({ app: 'shop-quickbuy', version: GM_info && GM_info.script ? GM_info.script.version : '', exportedAt: new Date().toISOString(), data }, null, 1);
    try { GM_setClipboard(json, 'text'); } catch (e) {}
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `quickbuy-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    dashToast('Backup heruntergeladen (und in die Zwischenablage kopiert). Enthält deine Discord-Webhook-URL – nicht öffentlich teilen.');
  }
  function importAll(text) {
    let obj; try { obj = JSON.parse(text); } catch (e) { alert('Das ist keine gültige Backup-Datei.'); return; }
    if (!obj || obj.app !== 'shop-quickbuy' || !obj.data) { alert('Das ist kein QuickBuy-Backup.'); return; }
    if (!confirm(`Backup vom ${new Date(obj.exportedAt).toLocaleString('de-DE')} einspielen?\n\nAlle aktuellen Einstellungen, Produkte und die Historie werden ersetzt. Alle Shops werden gestoppt.`)) return;
    for (const k of GM_listValues()) GM_deleteValue(k);
    for (const [k, v] of Object.entries(obj.data)) GM_setValue(k, /:running$/.test(k) ? false : v);
    dashToast('Backup eingespielt ✔');
    renderDash(true); renderPanel();
  }

  /* ---------- UI ---------- */
  const DASH_CSS = `
    #qb-dash{position:fixed;inset:0;z-index:2147483647;background:rgba(8,9,12,.72);backdrop-filter:blur(4px);
      display:flex;align-items:flex-start;justify-content:center;padding:28px 18px;overflow:auto;
      font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#e8e8ea}
    #qb-dash *{box-sizing:border-box}
    #qb-dash .d-wrap{width:100%;max-width:1240px;background:#121317;border:1px solid #2a2c33;border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.6)}
    #qb-dash .d-top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:16px 20px;border-bottom:1px solid #22242b;position:sticky;top:0;background:#121317;border-radius:16px 16px 0 0;z-index:2}
    #qb-dash h1{all:unset;font-size:18px;font-weight:800;margin-right:8px}
    #qb-dash .chip{font-size:12px;background:#1d1f25;border:1px solid #2a2c33;border-radius:999px;padding:4px 10px;color:#c9cbd3}
    #qb-dash .chip b{color:#fff}
    #qb-dash .sp{flex:1}
    #qb-dash button{font:600 12px system-ui,sans-serif;border:0;border-radius:8px;padding:7px 11px;cursor:pointer;background:#23262d;color:#d7d9e0}
    #qb-dash button:hover{filter:brightness(1.15)}
    #qb-dash button:disabled{opacity:.45;cursor:default;filter:none}
    #qb-dash .go{background:#1db954;color:#06210f}
    #qb-dash .stop{background:#e5484d;color:#fff}
    #qb-dash .x{background:none;font-size:20px;padding:2px 8px;color:#9a9ca6}
    #qb-dash .d-body{padding:18px 20px;display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:18px}
    @media (max-width:1000px){#qb-dash .d-body{grid-template-columns:1fr}}
    #qb-dash .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px;align-content:start}
    #qb-dash .card{background:#181a1f;border:1px solid #2a2c33;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:9px}
    #qb-dash .card.run{border-color:#2f7a4c;box-shadow:inset 0 0 0 1px rgba(61,220,122,.15)}
    #qb-dash .ch{display:flex;align-items:center;gap:8px}
    #qb-dash .ch .nm{font-weight:800;font-size:14px}
    #qb-dash .pill{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px}
    #qb-dash .pill.on{background:rgba(61,220,122,.14);color:#3ddc7a}
    #qb-dash .pill.off{background:#2a2d36;color:#9a9ca6}
    #qb-dash .tab{margin-left:auto;font-size:11px;color:#8b8e99}
    #qb-dash .tab.ok{color:#3ddc7a}
    #qb-dash .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    #qb-dash .muted{color:#8b8e99;font-size:12px}
    #qb-dash .tog{display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;padding:6px 8px;border-radius:8px;background:#1d1f25;border:1px solid #2a2c33}
    #qb-dash .tog.on{border-color:#e5484d;background:rgba(229,72,77,.1)}
    #qb-dash .sw{width:30px;height:17px;border-radius:999px;background:#3a3d46;position:relative;flex:none}
    #qb-dash .sw::after{content:'';position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:#fff;transition:.15s}
    #qb-dash .tog.on .sw{background:#e5484d}#qb-dash .tog.on .sw::after{left:15px}
    #qb-dash .pl{display:flex;flex-direction:column;gap:4px}
    #qb-dash .pi{display:flex;align-items:center;gap:8px;font-size:12px;background:#121317;border:1px solid #23252c;border-radius:8px;padding:5px 8px}
    #qb-dash .pi.cur{border-color:#3ddc7a}
    #qb-dash .pi a{color:#d7d9e0;text-decoration:none;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #qb-dash .pi a:hover{text-decoration:underline}
    #qb-dash .pi .meta{flex:none;color:#8b8e99;font-size:11px}
    #qb-dash .pi .bt{flex:none;font-size:10px;font-weight:700;color:#3ddc7a}
    #qb-dash .pi button{padding:2px 7px;background:none;color:#ff6b6b}
    #qb-dash input[type=text]{flex:1;min-width:0;background:#0f1013;border:1px solid #2f323a;color:#fff;border-radius:7px;padding:6px 8px;font:12px system-ui,sans-serif;outline:none}
    #qb-dash input[type=text]:focus{border-color:#5b8cff}
    #qb-dash .last{font-size:11.5px;color:#a7aab3;background:#121317;border-radius:8px;padding:6px 8px;border-left:3px solid #3a3d46;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #qb-dash .last.t-ok{border-left-color:#3ddc7a}#qb-dash .last.t-err{border-left-color:#e5484d}#qb-dash .last.t-warn{border-left-color:#f5a524}#qb-dash .last.t-buy{border-left-color:#5b8cff}
    #qb-dash .side{display:flex;flex-direction:column;gap:14px}
    #qb-dash .box{background:#181a1f;border:1px solid #2a2c33;border-radius:12px;overflow:hidden}
    #qb-dash .bh{display:flex;align-items:center;gap:8px;padding:10px 12px;font-weight:700;border-bottom:1px solid #22242b}
    #qb-dash .bh .sp{flex:1}
    #qb-dash .bh button{padding:3px 8px;font-size:11px}
    #qb-dash .feed{max-height:360px;overflow:auto;padding:6px;display:flex;flex-direction:column;gap:3px}
    #qb-dash .fe{display:flex;gap:7px;font-size:11.5px;padding:4px 6px;border-radius:6px}
    #qb-dash .fe:nth-child(odd){background:#15161a}
    #qb-dash .fe .s{flex:none;font-weight:700;font-size:10px;background:#2a2d36;border-radius:4px;padding:1px 5px;height:fit-content}
    #qb-dash .fe .t{flex:none;color:#7d808b;font-size:10.5px}
    #qb-dash .fe .m{min-width:0;word-break:break-word;color:#c9cbd3}
    #qb-dash .fe.t-ok .m{color:#3ddc7a}#qb-dash .fe.t-err .m{color:#ff8a8d}#qb-dash .fe.t-warn .m{color:#f5c26b}#qb-dash .fe.t-oos .m{color:#8b8e99}
    #qb-dash table{width:100%;border-collapse:collapse;font-size:12px}
    #qb-dash td,#qb-dash th{padding:6px 10px;text-align:left;border-bottom:1px solid #22242b}
    #qb-dash th{color:#8b8e99;font-weight:600;font-size:11px}
    #qb-dash td.r,#qb-dash th.r{text-align:right}
    #qb-dash .empty{padding:14px;color:#7d808b;font-size:12px;text-align:center}
    #qb-dash .toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#1d1f25;border:1px solid #3a3d46;border-radius:10px;padding:10px 14px;font-size:12.5px;box-shadow:0 8px 30px rgba(0,0,0,.5)}
    #qb-dash textarea{width:100%;height:160px;background:#0f1013;border:1px solid #2f323a;color:#fff;border-radius:8px;padding:8px;font:11px ui-monospace,Consolas,monospace}

    #qb-dash .d-wrap{max-width:1100px}
    #qb-dash .d-top{flex-wrap:nowrap}
    #qb-dash .sum{font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;background:#23262d;color:#9a9ca6}
    #qb-dash .sum.on{background:rgba(61,220,122,.14);color:#3ddc7a}
    #qb-dash .sum.warn{background:rgba(245,165,36,.15);color:#f5c26b}
    #qb-dash button.big{padding:9px 16px;font-size:13px}
    #qb-dash button.sm{padding:5px 9px;font-size:11.5px}
    #qb-dash .tabs{display:flex;gap:4px;padding:0 20px;border-bottom:1px solid #22242b;position:sticky;top:64px;background:#121317;z-index:1}
    #qb-dash .tb{background:none;border-radius:0;padding:10px 12px;color:#8b8e99;border-bottom:2px solid transparent}
    #qb-dash .tb.act{color:#fff;border-bottom-color:#5b8cff}
    #qb-dash .d-body{display:block;padding:18px 20px}
    #qb-dash .add{display:flex;gap:8px}
    #qb-dash .add input{padding:10px 12px;font-size:13px}
    #qb-dash .hint{font-size:12px;min-height:18px;margin:6px 2px 12px;color:#8b8e99}
    #qb-dash .hint.ok{color:#3ddc7a}#qb-dash .hint.bad{color:#ff8a8d}
    #qb-dash .att{background:rgba(245,165,36,.08);border:1px solid rgba(245,165,36,.35);border-radius:12px;padding:10px 12px;margin-bottom:14px}
    #qb-dash .atth{font-weight:800;margin-bottom:6px;display:flex;justify-content:space-between}
    #qb-dash .atti{font-size:12.5px;padding:4px 0;border-top:1px solid rgba(245,165,36,.15)}
    #qb-dash .atti.t-err{color:#ff8a8d}
    #qb-dash .lnk{background:none;padding:0;color:#c9cbd3;text-decoration:underline;font-weight:500}
    #qb-dash .shops{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;margin-bottom:16px}
    #qb-dash .sh{background:#181a1f;border:1px solid #2a2c33;border-radius:10px;padding:9px 10px;display:grid;grid-template-columns:1fr auto;gap:2px 8px}
    #qb-dash .sh.run{border-color:#2f7a4c}
    #qb-dash .shn{font-weight:800;display:flex;align-items:center;gap:7px}
    #qb-dash .dot{width:8px;height:8px;border-radius:50%;background:#4a4d57}#qb-dash .dot.on{background:#3ddc7a;box-shadow:0 0 8px #3ddc7a}
    #qb-dash .shs{font-size:11px;color:#8b8e99;grid-column:1}
    #qb-dash .shl{font-size:11px;color:#a7aab3;grid-column:1/-1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #qb-dash .sha{grid-row:1/3;grid-column:2;display:flex;gap:4px;align-items:center}
    #qb-dash .red{color:#ff8a8d}#qb-dash .green{color:#3ddc7a}
    #qb-dash .pt{background:#181a1f;border:1px solid #2a2c33;border-radius:12px;overflow:hidden;border-collapse:separate;border-spacing:0}
    #qb-dash .pt td{vertical-align:middle}
    #qb-dash .pt tr.cur td{background:rgba(61,220,122,.06)}
    #qb-dash .pt td.c,#qb-dash .pt th.c{text-align:center}
    #qb-dash .pn{max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #qb-dash .pn a{color:#e8e8ea;text-decoration:none}#qb-dash .pn a:hover{text-decoration:underline}
    #qb-dash .tag{font-size:10.5px;font-weight:700;background:#2a2d36;border-radius:5px;padding:2px 6px;white-space:nowrap}
    #qb-dash .st{font-size:11.5px;white-space:nowrap}#qb-dash .st.on{color:#3ddc7a}#qb-dash .st.wait{color:#c9cbd3}#qb-dash .st.off{color:#7d808b}
    #qb-dash input.cell{width:84px;flex:none;text-align:right;padding:4px 6px;background:#0f1013;border:1px solid #2f323a;color:#fff;border-radius:6px;font:12px system-ui,sans-serif;outline:none}
    #qb-dash input.cell:focus{border-color:#5b8cff}
    #qb-dash input.cell.c{width:52px;text-align:center}
    #qb-dash .x2{background:none;color:#ff6b6b;padding:2px 6px}
    #qb-dash .empty.big{padding:40px 20px;font-size:13px}
    #qb-dash .bar{display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap}
    #qb-dash .feed{max-height:none;background:#181a1f;border:1px solid #2a2c33;border-radius:12px}
    #qb-dash h3{all:unset;display:block;font-weight:800;font-size:14px;margin:18px 0 8px}
    #qb-dash h3:first-child{margin-top:0}
    #qb-dash .set select,#qb-dash .set input[type=datetime-local]{background:#0f1013;border:1px solid #2f323a;color:#fff;border-radius:7px;padding:5px 6px;font:12px system-ui,sans-serif;color-scheme:dark}
    #qb-dash .dcg{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;background:#181a1f;border:1px solid #2a2c33;border-radius:12px;padding:12px}
    #qb-dash .dcg input[type=text]{flex:1 1 420px}
    #qb-dash .ck{font-size:12px;display:flex;gap:5px;align-items:center;cursor:pointer}
  `;
  const DICON = { ok: '✅', err: '⛔', warn: '⚠️', oos: '💤', buy: '🛒', info: 'ℹ️' };
  let dashTimer = null;
  function dashToast(msg) {
    const d = document.getElementById('qb-dash'); if (!d) return;
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; d.appendChild(t);
    setTimeout(() => t.remove(), 4500);
  }
  function openDashboard() {
    if (window.top !== window) return;
    GM_setValue('global:dashOpen', true);
    if (document.getElementById('qb-dash')) return;
    if (!document.getElementById('qb-dash-css')) {
      addCss(DASH_CSS, 'qb-dash-css');
    }
    const d = document.createElement('div'); d.id = 'qb-dash'; document.body.appendChild(d);
    d.addEventListener('mousedown', (e) => { if (e.target === d) closeDashboard(); });
    if (!window.__qbEsc) { window.__qbEsc = true; document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('qb-dash')) closeDashboard(); }); }
    renderDash(true);
    dashTimer = setInterval(() => renderDash(false), 1500);
  }
  function closeDashboard() {
    GM_setValue('global:dashOpen', false);
    clearInterval(dashTimer);
    const d = document.getElementById('qb-dash'); if (d) d.remove();
  }

  let dashTab = 'home';
  function shopOfUrl(url) { return Object.keys(SHOPS).find((id) => SHOPS[id].productUrl.test(url)) || null; }
  function attentionItems() {
    const dismissed = GM_getValue('global:dismissed', 0);
    const out = [];
    for (const id of Object.keys(SHOPS)) {
      for (const e of logFor(id).slice(0, 15)) {
        const isNeed = /kasse erreicht|bitte selbst|anmeldung klappt nicht|manuell|nicht bestätigt|über limit|nicht im warenkorb|weitere artikel|nicht angemeldet|verfügbar – alarm/i.test(e.msg);
        if (!(e.type === 'err' || (e.type === 'warn' && isNeed) || isNeed)) continue;
        if (!e.at || e.at <= dismissed || Date.now() - e.at > 3 * 3600e3) continue;
        out.push({ ...e, id });
      }
    }
    return out.slice(0, 6);
  }

  function renderDash(force) {
    const d = document.getElementById('qb-dash'); if (!d) return;
    const ae = document.activeElement;
    if (!force && d.contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return;
    if (!force && d.querySelector('textarea')) return;
    const ids = Object.keys(SHOPS);
    const used = ids.filter((id) => gv(id, 'products', []).length || gv(id, 'running', false));
    const hist = GM_getValue('global:history', []);
    const bought = hist.filter((h) => h.result === 'success');
    const spent = bought.reduce((a, h) => a + (Number(h.price) || 0), 0);
    const runIds = ids.filter((id) => gv(id, 'running', false));
    const anyRun = runIds.length > 0;
    const att = attentionItems();
    const scrollY = d.scrollTop;

    // ---------- Übersicht ----------
    const rows = used.flatMap((id) => {
      const list = gv(id, 'products', []);
      const run = gv(id, 'running', false);
      const idx = gv(id, 'idx', 0) % Math.max(1, list.length);
      return list.map((x, i) => ({ id, i, x, run, active: run && i === idx }));
    });
    const status = (r) => {
      if (r.active) return '<span class="st on">● prüft gerade</span>';
      if (r.run) return '<span class="st wait">○ in der Schleife</span>';
      return '<span class="st off">pausiert</span>';
    };
    const shopStrip = used.map((id) => {
      const run = gv(id, 'running', false); const open = tabOpen(id);
      const last = logFor(id)[0];
      return `<div class="sh ${run ? 'run' : ''}" data-id="${id}">
        <div class="shn"><span class="dot ${run ? 'on' : ''}"></span>${esc(SHOPS[id].name)}</div>
        <div class="shs">${run ? `Runde ${gv(id, 'attempts', 0) + 1}` : 'gestoppt'}${open ? '' : ' · kein Tab'}${gv(id, 'autoOrder', false) && !SHOPS[id].alertOnly && !SHOPS[id].stopAfterAdd ? ' · <b class="red">Auto</b>' : ''}</div>
        <div class="shl" title="${esc(last ? last.msg : '')}">${last ? `${DICON[last.type] || ''} ${esc(last.msg)}` : '–'}</div>
        <div class="sha"><button class="${run ? 'stop' : 'go'} sm" data-shop="${run ? 'stop' : 'start'}">${run ? '■' : '▶'}</button><button class="sm" data-shop="tab" title="Tab öffnen">↗</button></div>
      </div>`;
    }).join('');

    const home = `
      ${att.length ? `<div class="att"><div class="atth">⚠️ Braucht dich <button class="lnk" data-g="dismiss">alles erledigt</button></div>
        ${att.map((e) => `<div class="atti t-${e.type}"><b>${esc(SHOPS[e.id].name)}</b> ${esc(e.msg)} <span class="muted">${esc(e.ts)}</span></div>`).join('')}</div>` : ''}
      <div class="add">
        <input type="text" id="d-url" placeholder="➕ Produkt-URL einfügen – Otto, MediaMarkt, Saturn, Microsoft, PlayStation oder Amazon">
        <input type="text" id="d-max" placeholder="Max. €" style="width:90px;flex:none">
        <input type="text" id="d-qty" placeholder="Stk." title="Stückzahl (∞ = so viele wie möglich)" style="width:60px;flex:none">
        <button class="go" data-g="add">Hinzufügen</button>
      </div>
      <div class="hint" id="d-hint"></div>
      ${used.length ? `<div class="shops">${shopStrip}</div>` : ''}
      ${rows.length ? `<table class="pt"><thead><tr><th>Shop</th><th>Produkt</th><th>Status</th><th class="r">Max. €</th><th class="c">Stück</th><th class="c">Gekauft</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr class="${r.active ? 'cur' : ''}" data-id="${r.id}" data-i="${r.i}">
          <td><span class="tag">${esc(SHOPS[r.id].name)}</span></td>
          <td class="pn"><a href="${esc(r.x.url)}" target="_blank" title="${esc(r.x.url)}">${esc(shortName(r.x.url))}</a>${r.x.variant ? ` <span class="muted">· ${esc(r.x.variant)}</span>` : ''}</td>
          <td>${status(r)}</td>
          <td class="r"><input type="text" class="cell" data-f="maxPrice" value="${r.x.maxPrice ? fmtEur(r.x.maxPrice) : ''}" placeholder="–"></td>
          <td class="c"><input type="text" class="cell c" data-f="qty" value="${Number(r.x.qty) === 0 ? '∞' : (r.x.qty === undefined ? 1 : r.x.qty)}"></td>
          <td class="c">${r.x.bought ? `<b class="green">${r.x.bought}</b>` : '<span class="muted">0</span>'}</td>
          <td class="r"><button class="x2" data-p="del" title="Entfernen">✕</button></td></tr>`).join('')}
      </tbody></table>` : `<div class="empty big">Noch keine Produkte. Füge oben eine Produkt-URL ein – der Shop wird automatisch erkannt.</div>`}`;

    // ---------- Protokoll ----------
    const feed = ids.flatMap((id) => logFor(id).slice(0, 40).map((e) => ({ ...e, id })))
      .sort((a, b) => (b.at || 0) - (a.at || 0) || String(b.ts).localeCompare(String(a.ts))).slice(0, 120);
    const logTab = `<div class="bar"><span class="muted">Neueste zuerst · gleiche Meldungen zusammengefasst</span><span class="sp"></span><button class="sm" data-g="clearlogs">Leeren</button></div>
      <div class="feed">${feed.length ? feed.map((e) => `<div class="fe t-${e.type}"><span class="s">${esc(SHOPS[e.id].name)}</span><span class="t">${esc(e.ts)}</span><span class="m">${DICON[e.type] || ''} ${e.n > 1 ? `<b>×${e.n}</b> ` : ''}${esc(e.msg)}</span></div>`).join('') : '<div class="empty">Noch keine Einträge</div>'}</div>`;

    // ---------- Historie ----------
    const histTab = `<div class="bar"><span class="chip">Käufe: <b>${bought.length}</b></span><span class="chip">Ausgegeben: <b>${fmtEur(spent)} €</b></span><span class="sp"></span><button class="sm" data-g="clearhist">Leeren</button></div>
      ${hist.length ? `<table class="pt"><thead><tr><th>Wann</th><th>Shop</th><th>Produkt</th><th>Ergebnis</th><th class="r">Preis</th></tr></thead><tbody>
        ${hist.slice(0, 200).map((h) => `<tr><td>${new Date(h.ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td><span class="tag">${esc(h.shop)}</span></td>
          <td class="pn"><a href="${esc(h.url)}" target="_blank">${esc(String(h.title).slice(0, 60))}</a></td>
          <td>${h.result === 'success' ? '✅ gekauft' : h.result === 'alert' ? '🔔 Alarm' : '❓ unklar'}</td>
          <td class="r">${h.price ? fmtEur(h.price) + ' €' : '–'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty big">Noch keine Käufe</div>'}`;

    // ---------- Einstellungen ----------
    const setRows = ids.map((id) => {
      const sh = SHOPS[id];
      const canAuto = !sh.alertOnly && !sh.stopAfterAdd;
      const canPay = sh.finalOrder && sh.finalOrder.length || sh.psFlow;
      const pm = gv(id, 'payMethod', sh.defaultPay || 'default');
      return `<tr data-id="${id}">
        <td><b>${esc(sh.name)}</b>${sh.alertOnly ? '<div class="muted">nur Alarm</div>' : ''}</td>
        <td>${canAuto ? `<span class="tog ${gv(id, 'autoOrder', false) ? 'on' : ''}" data-s="auto"><span class="sw"></span>${gv(id, 'autoOrder', false) ? 'AN' : 'aus'}</span>` : '<span class="muted">–</span>'}</td>
        <td>${canPay ? `<select data-s="payMethod">${Object.entries(PAY).map(([k, v]) => `<option value="${k}" ${pm === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>` : '<span class="muted">–</span>'}</td>
        <td class="c"><input type="text" class="cell c" data-s="intervalSec" value="${Math.max(sh.minInterval || 5, Number(gv(id, 'intervalSec', 15)) || 15)}" title="Sekunden zwischen den Runden${sh.minInterval ? ` (min. ${sh.minInterval})` : ''}"></td>
        <td><input type="datetime-local" data-s="dropAt" value="${esc(gv(id, 'dropAt', ''))}"></td>
        <td class="c">${sh.sellerOf ? `<input type="checkbox" data-s="onlyOwn" ${gv(id, 'onlyOwn', true) ? 'checked' : ''}>` : '<span class="muted">–</span>'}</td>
        <td class="c"><input type="checkbox" data-s="continueAfterBuy" ${gv(id, 'continueAfterBuy', true) ? 'checked' : ''}></td>
      </tr>`;
    }).join('');
    const setTab = `
      <h3>Shops</h3>
      <table class="pt set"><thead><tr><th>Shop</th><th>Auto-Bestellung</th><th>Zahlungsart</th><th class="c">Pause (s)</th><th>⏰ Drop-Zeit</th><th class="c">Nur Shop selbst</th><th class="c">Nach Kauf weiter</th></tr></thead><tbody>${setRows}</tbody></table>
      <h3>🔔 Discord</h3>
      <div class="dcg">
        <input type="text" id="d-wh" placeholder="https://discord.com/api/webhooks/…" value="${esc(dc('webhook'))}">
        <button class="sm" data-g="dctest">Test senden</button>
        ${[['dcSuccess', 'Kauf erfolgreich'], ['dcCheckout', 'Kasse erreicht / Alarm'], ['dcError', 'Probleme'], ['dcAvailable', 'Artikel verfügbar'], ['dcPing', '@everyone']].map(([k, l]) => `<label class="ck"><input type="checkbox" data-dc="${k}" ${dc(k) ? 'checked' : ''}> ${l}</label>`).join('')}
      </div>
      <h3>💾 Sichern</h3>
      <div class="bar"><button class="sm" data-g="export">⬇ Backup herunterladen</button><button class="sm" data-g="import">⬆ Backup einspielen</button><span class="muted">Enthält Produkte, Einstellungen, Historie und die Discord-URL.</span></div>`;

    const tabs = [['home', 'Übersicht'], ['log', 'Protokoll'], ['hist', `Historie${bought.length ? ` (${bought.length})` : ''}`], ['set', 'Einstellungen']];
    d.innerHTML = `<div class="d-wrap">
      <div class="d-top">
        <h1>📊 QuickBuy</h1>
        <span class="sum ${anyRun ? 'on' : ''}">${anyRun ? `● ${runIds.length} Shop${runIds.length > 1 ? 's' : ''} aktiv` : '○ alles gestoppt'}</span>
        ${att.length ? `<span class="sum warn">⚠️ ${att.length}</span>` : ''}
        <span class="sp"></span>
        <button class="${anyRun ? 'stop' : 'go'} big" data-g="${anyRun ? 'stopall' : 'startall'}">${anyRun ? '■ Alle stoppen' : '▶ Alle starten'}</button>
        <button class="x" data-g="close" title="Schließen (Esc)">✕</button>
      </div>
      <div class="tabs">${tabs.map(([k, l]) => `<button class="tb ${dashTab === k ? 'act' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="d-body">${dashTab === 'home' ? home : dashTab === 'log' ? logTab : dashTab === 'hist' ? histTab : setTab}</div>
    </div>`;
    d.scrollTop = scrollY;
    bindDash(d, ids);
  }

  function bindDash(d, ids) {
    d.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { dashTab = b.dataset.tab; renderDash(true); });
    // URL-Erkennung live anzeigen
    const urlIn = d.querySelector('#d-url');
    if (urlIn) urlIn.oninput = () => {
      const u = stripUrl(norm(urlIn.value)); const id = shopOfUrl(u); const h = d.querySelector('#d-hint');
      h.innerHTML = !u ? '' : id ? `✔ erkannt: <b>${esc(SHOPS[id].name)}</b> – ${esc(shortName(u))}` : '✖ Diese URL gehört zu keinem unterstützten Shop bzw. ist keine Produktseite';
      h.className = 'hint ' + (!u ? '' : id ? 'ok' : 'bad');
    };
    d.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => {
      const g = b.dataset.g;
      if (g === 'close') return closeDashboard();
      if (g === 'add') {
        const u = stripUrl(norm(d.querySelector('#d-url').value)); const id = shopOfUrl(u);
        if (!id) { alert('Keine Produkt-URL eines unterstützten Shops erkannt.'); return; }
        const l = gv(id, 'products', []);
        if (l.some((x) => keyOf2(id, x.url) === keyOf2(id, u))) { alert(`Dieses Produkt ist bei ${SHOPS[id].name} schon eingetragen.`); return; }
        const qv = norm(d.querySelector('#d-qty').value);
        l.push({ url: u, variant: '', maxPrice: parseEur(d.querySelector('#d-max').value), qty: qv === '' ? 1 : /^(∞|0)$/.test(qv) ? 0 : Math.max(1, parseInt(qv, 10) || 1), bought: 0 });
        sv(id, 'products', l); pushLog(id, `Produkt hinzugefügt (Dashboard): ${shortName(u)}`, 'info');
        dashToast(`Zu ${SHOPS[id].name} hinzugefügt${gv(id, 'running', false) ? ' – wird ab der nächsten Runde geprüft' : ''}`);
      }
      if (g === 'startall') {
        const todo = ids.filter((id) => !gv(id, 'running', false) && gv(id, 'products', []).length);
        if (!todo.length) return dashToast('Keine Produkte eingetragen.');
        const autos = todo.filter((id) => gv(id, 'autoOrder', false) && !SHOPS[id].alertOnly && !SHOPS[id].stopAfterAdd).map((id) => SHOPS[id].name);
        if (autos.length && !confirm(`Starten – mit AUTO-BESTELLUNG bei: ${autos.join(', ')}.\n\nFortfahren?`)) return;
        todo.forEach(dashStart);
      }
      if (g === 'stopall') ids.forEach((id) => { if (gv(id, 'running', false)) dashStop(id); });
      if (g === 'dismiss') GM_setValue('global:dismissed', Date.now());
      if (g === 'export') return exportAll();
      if (g === 'import') {
        const box = document.createElement('div'); box.className = 'toast'; box.style.width = 'min(560px,90vw)';
        box.innerHTML = '<div style="margin-bottom:6px;font-weight:700">Backup einspielen</div><input type="file" accept=".json,application/json" style="margin-bottom:6px"><textarea placeholder="…oder Backup-Inhalt hier einfügen"></textarea><div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px"><button data-x>Abbrechen</button><button class="go" data-ok>Einspielen</button></div>';
        d.appendChild(box);
        box.querySelector('input').onchange = async (e) => { const f = e.target.files[0]; if (f) box.querySelector('textarea').value = await f.text(); };
        box.querySelector('[data-x]').onclick = () => box.remove();
        box.querySelector('[data-ok]').onclick = () => { const t = box.querySelector('textarea').value; box.remove(); importAll(t); };
        return;
      }
      if (g === 'dctest') {
        const v = norm(d.querySelector('#d-wh').value);
        if (!WEBHOOK_RE.test(v)) { alert('Bitte eine gültige Discord-Webhook-URL eintragen.'); return; }
        G.set('webhook', v);
        discord('test', 'Test aus dem Dashboard 👍').then((ok) => dashToast(ok ? 'Discord-Test gesendet ✔' : 'Discord-Test fehlgeschlagen'));
        return;
      }
      if (g === 'clearlogs') { if (!confirm('Protokolle aller Shops leeren?')) return; ids.forEach((id) => sv(id, 'log', [])); }
      if (g === 'clearhist') { if (!confirm('Kaufhistorie wirklich leeren?')) return; GM_setValue('global:history', []); }
      renderDash(true); renderPanel();
    });
    // Shop-Leiste
    d.querySelectorAll('.sh [data-shop]').forEach((b) => b.onclick = () => {
      const id = b.closest('.sh').dataset.id; const a = b.dataset.shop;
      if (a === 'start') { if (gv(id, 'autoOrder', false) && !SHOPS[id].alertOnly && !SHOPS[id].stopAfterAdd && !confirm(`${SHOPS[id].name} mit AUTO-BESTELLUNG starten?`)) return; dashStart(id); }
      if (a === 'stop') dashStop(id);
      if (a === 'tab') { const l = gv(id, 'products', []); if (l.length) openTab(l[gv(id, 'idx', 0) % l.length].url); }
      renderDash(true); renderPanel();
    });
    // Produkttabelle: Inline-Bearbeitung
    d.querySelectorAll('tr[data-i]').forEach((tr) => {
      const id = tr.dataset.id; const i = Number(tr.dataset.i);
      const upd = (fn) => { const l = gv(id, 'products', []); if (!l[i]) return; fn(l, l[i]); sv(id, 'products', l); renderPanel(); };
      tr.querySelectorAll('input[data-f]').forEach((inp) => inp.onchange = () => upd((l, x) => {
        if (inp.dataset.f === 'maxPrice') x.maxPrice = parseEur(inp.value);
        else { const q = norm(inp.value); x.qty = /^(∞|0)$/.test(q) ? 0 : Math.max(1, parseInt(q, 10) || 1); }
      }));
      const del = tr.querySelector('[data-p="del"]');
      if (del) del.onclick = () => { if (!confirm(`„${shortName(gv(id, 'products', [])[i].url)}“ entfernen?`)) return; upd((l) => l.splice(i, 1)); renderDash(true); };
    });
    // Einstellungen
    d.querySelectorAll('tr[data-id] [data-s]').forEach((el) => {
      const id = el.closest('tr').dataset.id; const k = el.dataset.s;
      if (k === 'auto') return el.onclick = () => {
        const v = !gv(id, 'autoOrder', false);
        if (v && !confirm(`Auto-Bestellung bei ${SHOPS[id].name} einschalten?\n\nDas Script bestellt dann verbindlich selbst.`)) return;
        sv(id, 'autoOrder', v); pushLog(id, `Auto-Bestellung ${v ? 'AN' : 'aus'} (Dashboard)`, v ? 'warn' : 'info'); renderDash(true); renderPanel();
      };
      el.onchange = () => {
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if (k === 'intervalSec') v = Math.max(SHOPS[id].minInterval || 5, parseEur(v) || 15);
        if (k === 'dropAt') sv(id, 'dropReloaded', false);
        sv(id, k, v); renderPanel();
        if (k === 'intervalSec') el.value = v;
      };
    });
    const wh = d.querySelector('#d-wh');
    if (wh) wh.onchange = () => { const v = norm(wh.value); if (v && !WEBHOOK_RE.test(v)) { alert('Keine gültige Discord-Webhook-URL.'); return; } G.set('webhook', v); };
    d.querySelectorAll('[data-dc]').forEach((c) => { c.onchange = () => G.set(c.dataset.dc, c.checked); });
  }
  const keyOf2 = (id, u) => String(SHOPS[id].productKey ? SHOPS[id].productKey(u) : stripUrl(u)).toLowerCase();


  /* ---------- Fernsteuerung: dieser Tab reagiert auf Start/Stop aus dem Dashboard ---------- */
  function startRemoteWatch() {
    if (window.top !== window) return;
    S.set('heartbeat', Date.now());
    let snap = '';
    setInterval(() => {
      S.set('heartbeat', Date.now());
      // Seite hat das Panel/Styles entfernt (z. B. Neuaufbau durch die Shop-App) → wiederherstellen
      if (!document.getElementById('qb-panel') && document.body) { try { renderPanel(); } catch (e) { console.error('[QuickBuy] Panel-Fehler:', e); } }
      const running = S.get('running');
      if (running && !busy) {
        busy = true;
        renderPanel();
        const u = cur().url;
        if (u) {
          if (stripUrl(location.href) === stripUrl(u)) main();
          else { S.set('navAt', Date.now()); location.href = u; }
        }
      }
      if (!running && busy && !bgActive) busy = false;
      // Panel aktualisieren, wenn im Dashboard etwas geändert wurde
      const p = document.getElementById('qb-panel');
      const now = JSON.stringify([running, S.get('autoOrder'), S.get('products').length, S.get('payMethod'), S.get('dropAt')]);
      if (now !== snap) {
        if (snap && p && !(p.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) renderPanel();
        snap = now;
      }
    }, 3000);
  }

  try { GM_registerMenuCommand('📊 QuickBuy Dashboard öffnen', openDashboard); } catch (e) {}
  startRemoteWatch();
  if (window.top === window && GM_getValue('global:dashOpen', false)) setTimeout(openDashboard, 800);

  console.log(`[QuickBuy] Version ${(GM_info && GM_info.script && GM_info.script.version) || '?'} aktiv auf ${location.hostname} → Shop: ${SHOP.name}`);
  main().catch((e) => { console.error('[QuickBuy] Fehler:', e); try { log(`Interner Fehler: ${e && e.message}`, 'err'); } catch (e2) {} });

})();
