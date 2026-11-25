// ==UserScript==
// @name         Shop QuickBuy
// @namespace    snkrsxlove.shop.quickbuy
// @version      3.19.5
// @description  Otto, MediaMarkt, Saturn, Microsoft, PlayStation, Amazon, FNAC Pro, Alternate, Cyberport, NBB, Galaxus, Proshop, Euronics, expert, Müller, Smyths, Kaufland, Lidl, GameStop, Zalando, Nike, Snipes, Solebox & Shopify – überwacht Artikel, lädt bei "ausverkauft" neu, legt bei Verfügbarkeit in den Warenkorb, geht zur Kasse und startet bei OOS im Warenkorb/an der Kasse neu.
// @match        https://www.otto.de/*
// @match        https://www.mediamarkt.de/*
// @match        https://www.saturn.de/*
// @match        https://www.amazon.de/*
// @match        https://www.fnacpro.com/*
// @match        https://fnacpro.com/*
// @match        https://secure.fnacpro.com/*
// @match        https://www.microsoft.com/de-de/*
// @match        https://www.playstation.com/de-de/*
// @match        https://checkout.playstation.com/*
// @match        https://www.alternate.de/*
// @match        https://www.cyberport.de/*
// @match        https://www.notebooksbilliger.de/*
// @match        https://www.galaxus.de/*
// @match        https://www.proshop.de/*
// @match        https://www.euronics.de/*
// @match        https://www.expert.de/*
// @match        https://www.mueller.de/*
// @match        https://www.smythstoys.com/*
// @match        https://www.kaufland.de/*
// @match        https://www.lidl.de/*
// @match        https://www.gamestop.de/*
// @match        https://www.zalando.de/*
// @match        https://www.nike.com/*
// @match        https://www.snipes.com/*
// @match        https://www.solebox.com/*
// @match        *://*/products/*
// @match        https://example.com/*
// @match        https://www.example.com/*
// @match        *://*/*/products/*
// @match        https://*.queue-it.net/*
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
// @grant        window.close
// @connect      discord.com
// @connect      discordapp.com
// @connect      otto.de
// @connect      mediamarkt.de
// @connect      saturn.de
// @connect      amazon.de
// @connect      fnacpro.com
// @connect      microsoft.com
// @connect      playstation.com
// @connect      alternate.de
// @connect      cyberport.de
// @connect      notebooksbilliger.de
// @connect      galaxus.de
// @connect      proshop.de
// @connect      euronics.de
// @connect      expert.de
// @connect      mueller.de
// @connect      smythstoys.com
// @connect      kaufland.de
// @connect      lidl.de
// @connect      gamestop.de
// @connect      zalando.de
// @connect      nike.com
// @connect      snipes.com
// @connect      solebox.com
// @connect      *
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
      declineWarranty: true,   // Garantie-Angebot nach "In den Warenkorb" ablehnen
      cartUncheck: /garantie|versicherung|schutz|absicherung|service|aufbau|montage|einrichtung/i,
      defaultPay: 'prepay',
      host: /(^|\.)otto\.de$/,
      productUrl: /^https:\/\/www\.otto\.de\/p\//,
      productHint: 'https://www.otto.de/p/…',
      productKey: (u) => { const m = stripUrl(u).match(/-(\d{6,})\/?$/); return m ? m[1] : stripUrl(u).split('/').filter(Boolean).pop(); },
      basketUrl: 'https://www.otto.de/order/basket',
      // Warenkorb (live geprüft 24.11.2026): jede Position ist [data-qa="item"], Preis steckt im Shadow-DOM → Attribut retail-price (Cent)
      cartReady: () => !!document.querySelector('[data-qa="item"]') || /ganz\s+schön\s+leer|warenkorb\s+ist\s+leer/i.test(document.body.innerText),
      cartItems: () => [...document.querySelectorAll('[data-qa="item"]')].map((box) => {
        const link = box.querySelector('[data-qa="articleNameLink"]');
        const qd = box.querySelector('[data-qa="changeQuantity"]');
        const pr = box.querySelector('[data-qa="pricingItem"]');
        const cents = pr ? parseInt(pr.getAttribute('retail-price'), 10) : NaN;
        return {
          box, href: link ? link.href : '',
          remove: box.querySelector('[data-qa="deleteBasketItemButton"], [data-qa="deleteButton"]'),
          title: norm((link && (link.getAttribute('aria-label') || link.innerText)) || box.innerText.slice(0, 80)),
          qty: qd ? parseInt(qd.getAttribute('value'), 10) || 1 : 1,
          unitPrice: cents > 0 ? cents / 100 : 0, minus: null,
        };
      }),
      isBasket: (p) => /\/order\/basket/i.test(p),
      // Lagerstatus im Hintergrund (live geprüft 24.11.2026): ausverkauft = „leider ausverkauft“, Button disabled, AvailabilityMin 0.0;
      // lieferbar = JSON-LD InStock bzw. AvailabilityMin > 0. Unklar → Seite neu laden.
      bgCheck: true,
      bgParse: (html) => {
        if (/leider\s+ausverkauft/i.test(html) || /<oc-button-v1[^>]*\bdisabled\b[^>]*>\s*In den Warenkorb/i.test(html)) return 'out';
        const am = html.match(/product_AvailabilityMin\\?"\s*:\s*\\?"([\d.]+)/);
        if (am) return parseFloat(am[1]) > 0 ? 'in' : 'out';
        return null;
      },
      // Kasse (live geprüft): eine Seite „Prüfen & Absenden“, Beträge ohne €-Zeichen → Gesamtsumme über data-qa
      totalSelector: '[data-qa="grandTotalAmount"]',
      isCheckout: (p) => /\/order\/(checkout|ordering|payment|summary)|kasse|checkout/i.test(p),
      addToCart: [/^in\s+den\s+warenkorb$/i, /^in\s+den\s+warenkorb\s+legen$/i],
      oos: [new RegExp(NOT_FAST + 'ausverkauft', 'i'), /nicht\s+(mehr\s+)?lieferbar/i,
            /derzeit\s+nicht\s+verfügbar/i, /momentan\s+nicht\s+verfügbar/i, /benachrichtigen,?\s+wenn/i,
            /seite\s+(wurde\s+)?nicht\s+gefunden/i, /nicht\s+mehr\s+(im\s+sortiment|verfügbar)/i, /artikel\s+(wurde\s+)?nicht\s+gefunden/i],
      toCheckout: [/^zur\s+kasse$/i, /weiter\s+zur\s+kasse/i],
      finalOrder: [/zahlungspflichtig\s+bestellen/i, /^jetzt\s+kaufen$/i, /kaufen$/i],
    },
    mediamarkt: {
      rateGroup: 'mms',      // MediaMarkt + Saturn: gleicher Bot-Schutz (DataDome) → Abrufe zählen zusammen
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
      retryAdd: true,
      // Lagerstatus im Hintergrund (live geprüft 24.11.2026): das erste JSON-LD-Produkt ist der Hauptartikel
      // (PS5 Pro/Xbox: OutOfStock, Kabel: InStock). Nur Marktplatz-Angebot („onlineStatus“: MP_OFFER) zählt als nicht verfügbar,
      // wenn „Nur Shop selbst“ an ist. Prüfung dauerte live 70–140 ms statt >10 s Neuladen.
      bgCheck: true,
      bgParse: (html, get = (k) => S.get(k)) => {
        if (get('onlyOwn') && /\\?"onlineStatus\\?"\s*:\s*\\?"MP_OFFER/.test(html) && !/\\?"onlineStatus\\?"\s*:\s*\\?"AVAILABLE/.test(html)) return 'out';
        // Produktdaten stecken als escaptes JSON im Seitenzustand (kein eigenes JSON-LD-Skript) → erstes Vorkommen = Hauptartikel
        const m = html.match(/\\?"availability\\?"\s*:\s*\\?"https?:\/\/schema\.org\/(\w+)/);
        if (!m) return null;
        return /InStock|PreOrder|LimitedAvailability|OnlineOnly/i.test(m[1]) ? 'in' : /OutOfStock|SoldOut|Discontinued/i.test(m[1]) ? 'out' : null;
      },
      totalSelector: '[data-test="checkout-total"]',   // Übersicht (live): Gesamtsumme inkl. Versand
      // Marktplatz-Händler erkennen ("Verkauf und Versand durch <Händler>")
      sellerOf: () => { const m = pageText().match(/verkauf\s+und\s+versand\s+durch:?\s+(.{2,40}?)(?=\s+(finanzierung|in\s+den\s+warenkorb|inkl|\d|$))/i); return m ? norm(m[1]) : null; },
      ownSeller: /media\s*markt/i,
      // Warenkorb (geprüft im echten MediaMarkt-Warenkorb)
      cartReady: () => !!document.querySelector('[data-test="delete-item-button"]') || /warenkorb\s+ist\s+leer|befinden\s+sich\s+keine\s+produkte/i.test(document.body.innerText),
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
      payValue: { card: 'CRECA', paypal: 'PAYPAL', invoice: 'KLARNA', prepay: 'PIA' },   // live: Vorkasse = PIA
      payConfirmSelector: '[data-test="start-select-payment"]',   // Zahlungsfenster auf der Übersicht: „Zahlungsmethode auswählen“
      // Live gemessen: Übersicht direkt aufrufen ~2,5 s statt Warenkorb → Versand → Übersicht (~6–10 s inkl. Wartezeiten)
      directSummary: () => `${location.origin}/de/checkout/summary`,
      // Übersicht (gesehen): Button aria-label "Bezahlmethode ändern" – daneben steht die gewählte Zahlungsart
      summaryPay: {
        change: () => deepAll().find((e) => e.tagName === 'BUTTON' && /bezahlmethode\s+ändern/i.test(e.getAttribute('aria-label') || '') && visible(e)),
        text: () => {
          const b = deepAll().find((e) => e.tagName === 'BUTTON' && /bezahlmethode\s+ändern/i.test(e.getAttribute('aria-label') || ''));
          let n = b;
          for (let i = 0; i < 6 && n; i++) {
            n = n.parentElement; if (!n) break;
            const t = norm(n.innerText || '').replace(/\bändern\b/gi, '').trim();
            if (t.length > 8 && t.length < 300) return t;
          }
          return null;
        },
      },
      // Letzter Schritt auf /checkout/summary (gesehen): "Fortfahren und bezahlen"
      finalOrder: [/^fortfahren\s+und\s+bezahlen$/i, /zahlungspflichtig\s+bestellen/i, /^jetzt\s+kaufen$/i, /^kaufen$/i],
      // Overlay nach "In den Warenkorb" (Versicherungsangebot etc.) wegklicken
      dismiss: [/^nein,?\s+danke$/i, /ohne\s+(versicherung|schutz|garantie)/i, /^weiter\s+ohne/i],
      // Fenster "Sichere dein Gerät ab" (gesehen): immer "Ich verzichte auf den zusätzlichen Schutz" → "Weiter"
      declineWarranty: true,
      // Im Warenkorb nie bezahlte Zusatzleistungen angehakt lassen
      cartUncheck: /plusgarantie|geräteschutz|garantie|versicherung|ersteinrichtung|einrichtung|aufbau|hausbesuch|service/i,
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
      // Lagerstatus aus dem fertig gerenderten Kauf-Bereich im Seitencode (live geprüft 25.11.): dort steht entweder der Preis
      // oder „Nicht zum Kauf erhältlich“. Das JSON-LD meldet auf Konsolen-Seiten fälschlich „InStock“ → nicht verwenden.
      bgParse: (html) => {
        const m = html.match(/data-qa=\\?"mfeCtaMain#offer0#finalPrice\\?"[^>]*>([^<]{1,80})</);
        if (!m) return null;
        if (/nicht\s+zum\s+kauf|ausverkauft|nicht\s+(verfügbar|vorrätig|erhältlich)/i.test(m[1])) return 'out';
        return /\d/.test(m[1]) && /mfeCtaMain#cta#action/.test(html) ? 'in' : null;   // Preis + Button „In den Einkaufswagen“
      },
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
  // Amazon (live geprüft 24.11.2026, auch mit Business-Konto). NUR „In den Einkaufswagen“ – nie „Jetzt kaufen“ (1-Click bestellt sofort!)
  SHOPS.amazon = {
    name: 'Amazon',
    // nur amazon.de (Links anderer Amazon-Länder werden auf amazon.de/dp/<ASIN> umgestellt)
    host: /(^|\.)amazon\.de$/,
    productUrl: /^https:\/\/www\.amazon\.de\/(?:[^?#]*\/)?(?:dp|gp\/product)\/[A-Z0-9]{10}/i,
    productHint: 'https://www.amazon.de/dp/XXXXXXXXXX',
    productKey: (u) => { const m = u.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i); return m ? m[1].toLowerCase() : stripUrl(u); },
    addToCart: [/^in\s+den\s+einkaufswagen$/i],
    buyFilter: (el) => el.id === 'add-to-cart-button' || !!el.closest('#addToCart_feature_div, #add-to-cart-button'),
    // (live gesehen: im Privatkonto hat der Button weder Text noch value → nur über die ID auffindbar)
    buySelector: '#add-to-cart-button',
    availableFn: () => !!document.querySelector('#add-to-cart-button') &&
      !/derzeit\s+nicht\s+verfügbar|nicht\s+auf\s+lager|currently\s+unavailable|temporarily\s+out\s+of\s+stock|actuellement\s+indisponible|temporairement\s+en\s+rupture/i.test((document.querySelector('#availability') || {}).innerText || ''),
    oos: [/derzeit\s+nicht\s+verfügbar/i, /nicht\s+auf\s+lager/i, /currently\s+unavailable/i, /temporarily\s+out\s+of\s+stock/i, /actuellement\s+indisponible/i, /temporairement\s+en\s+rupture\s+de\s+stock/i],
    // Preis immer inkl. MwSt. (Business-Konten zeigen groß den Nettopreis)
    priceFn: () => {
      const inp = document.getElementById('items[0.base][customerVisiblePrice][amount]');
      const v = inp && parseFloat(inp.value);
      if (v > 0) return v;
      const el = document.querySelector('#corePrice_feature_div .a-offscreen, #corePriceDisplay_desktop_feature_div .a-offscreen, #apex_desktop .a-offscreen');
      return el ? parsePrice(norm(el.textContent)) : null;
    },
    sellerOf: () => {
      const t = norm([...document.querySelectorAll('#merchant-info, #merchantInfoFeature_feature_div, #tabular-buybox, #shipsFromSoldByODF_feature_div, #offerDisplayFeatures_desktop, [offer-display-feature-name="desktop-merchant-info"]')]
        .map((e) => e.innerText || '').join(' '));
      if (!t) return null;
      // Amazon Business (live 25.11.): „Verkauft und in Rechnung gestellt von Amazon. Versandt und bezogen von resupplied.“
      // → Ware kommt von einem Händler (oft zu Wucherpreisen) → Verkäufer = dieser Händler, NICHT Amazon
      const src = t.match(/bezogen\s+von\s+([^.]{2,40}?)\s*(?:\.|$)/i);
      if (src && !/^amazon\b/i.test(norm(src[1]))) return norm(src[1]);
      // „Verkauf und Versand durch Amazon“, „Verkauft und versandt von Amazon“, „Verkäufer: Amazon“, englisch/französisch;
      // „Amazon Seconde main / Retourenkauf / Warehouse“ = gebrauchte Ware → NICHT als Amazon werten
      if (/(?:verkauft?\b[^.]{0,60}?(?:durch|von)|verkäufer\s*:?|sold\s+by|shipper\s*\/\s*seller|vendu\s+par|expéditeur\s*\/\s*vendeur|vendeur\s*:?)\s*amazon(?!\s*(?:seconde|retourenkauf|warehouse|resale|renewed))/i.test(t)) return 'Amazon';
      const m = t.match(/(?:verkäufer|verkauft?\b[^.]{0,40}?\s(?:von|durch)|sold\s+by|shipper\s*\/\s*seller|vendu\s+par|vendeur)\s*:?\s*([^\n.]{2,40}?)(?=\s{2,}|\s+(rückgaben|zahlung|versand|und|returns|payment|and|retours|paiement|et)\b|\.|$)/i);
      return m ? norm(m[1]) : null;
    },
    sellerRequired: true,     // Verkäufer nicht erkennbar → nicht kaufen
    limitText: /mengenbegrenzung[^.]{0,60}erreicht|maximale\s+(bestell)?menge[^.]{0,40}erreicht|kauflimit[^.]{0,30}erreicht|quantity\s+limit[^.]{0,40}(reached|exceeded)|limite\s+de\s+quantité[^.]{0,40}atteinte/i,
    // Fehlerseite nach „In den Einkaufswagen“/„Jetzt kaufen“ (gesehen): „Ein Problem ist aufgetreten. Leider ist der Artikel … nicht mehr
    // über den von dir gewählten Anbieter erhältlich.“ → von vorne beginnen
    failText: /ein\s+problem\s+ist\s+aufgetreten|nicht\s+mehr\s+über\s+den\s+von\s+(dir|ihnen)\s+gewählten\s+anbieter\s+erhältlich|there\s+was\s+a\s+problem|no\s+longer\s+available\s+from\s+the\s+seller|un\s+problème\s+est\s+survenu|n['’]est\s+plus\s+disponible\s+auprès\s+du\s+vendeur/i,
    ownSeller: /^amazon(?!\s*(?:seconde|retourenkauf|warehouse|resale|renewed))/i,   // gebrauchte Amazon-Ware zählt nicht
    declineWarranty: true,    // „Schutzplan hinzufügen?“ → „Nein, danke“
    cartCount: () => { const e = document.querySelector('#nav-cart-count'); const n = e && parseInt(e.innerText, 10); return Number.isFinite(n) ? n : null; },
    basketUrl: 'https://www.amazon.de/gp/cart/view.html',
    basketRedirect: (p) => /\/cart\/smart-wagon|\/cart\/add-to-cart|\/gp\/huc\//i.test(p),   // Zwischenseite nach dem Hinzufügen
    isBasket: (p) => /^\/gp\/cart\/view|^\/cart\/?$|\/cart\/smart-wagon|\/gp\/huc\//i.test(p),
    isCheckout: (p) => /^\/checkout\/|\/gp\/buy\//i.test(p),
    cartReady: () => !!document.querySelector('#sc-active-cart'),
    // (gelöschte Positionen bleiben als „wurde entfernt“ stehen → data-removed)
    cartItems: () => [...document.querySelectorAll('#sc-active-cart [data-itemtype="active"][data-asin]')].filter((b) => b.getAttribute('data-removed') !== 'true' && !/wurde\s+entfernt/i.test(b.innerText || '')).map((box) => ({
      box, href: `https://www.amazon.de/dp/${box.getAttribute('data-asin')}`,
      title: norm(box.getAttribute('data-producttitle') || ''),
      qty: parseInt(box.getAttribute('data-quantity'), 10) || 1,
      unitPrice: parseFloat(box.getAttribute('data-price')) || 0,
      remove: box.querySelector('input[data-feature-id="item-delete-button"], input[name^="submit.delete-active"], input[name^="submit.delete"]'),
      // „−“ löscht bei Menge 1 den Artikel → nur bei Menge > 1 anbieten
      minus: (parseInt(box.getAttribute('data-quantity'), 10) || 1) > 1 ? box.querySelector('button[data-action="a-stepper-decrement"]') : null,
    })),
    checkoutSelector: '[name="proceedToRetailCheckout"]',
    // Zwischenseite „Benötigst du noch etwas?“ (/checkout/byg) → „Zur Kasse gehen“
    nextSelector: '[name="checkout-byg-ptc-button"]',
    nextStep: [/^zur\s+kasse\s+gehen$/i, /^weiter\s+zur\s+kasse$/i, /^proceed\s+to\s+checkout$/i, /^passer\s+la\s+commande$/i, /^use\s+this\s+(address|payment\s+method)$/i, /^utiliser\s+cette\s+(adresse|méthode\s+de\s+paiement)$/i],
    toCheckout: [/^zur\s+kasse(\s+gehen)?$/i, /^proceed\s+to\s+checkout$/i, /^passer\s+la\s+commande$/i, /^valider\s+mon\s+panier$/i],
    // Kasse (eine Seite, /checkout/p/…/spc): Button input#placeOrder „Jetzt kaufen“
    // (nur auf der Kassen-Seite gesucht – „Jetzt kaufen“/„Buy now“ auf der Produktseite wird nie benutzt)
    finalOrder: [/^jetzt\s+kaufen$/i, /^bestellung\s+aufgeben$/i, /^bestellung\s+abschicken$/i, /^place\s+your\s+order$/i, /^buy\s+now$/i, /^passer\s+(votre|la)\s+commande$/i, /^acheter\s+maintenant$/i, /^valider\s+(votre|la)\s+commande$/i],
    minInterval: 30,
    beta: true,
  };

  // FNAC Pro (Beta): Seitenaufbau noch unbekannt (Captcha-Schutz) → erst einmal Alarm-Modus
  SHOPS.fnacpro = {
    name: 'FNAC Pro',
    host: /(^|\.)fnacpro\.com$/,
    productUrl: /^https:\/\/(www\.)?fnacpro\.com\/(?:[^?#]*\/)?(?:a|mp)\d{5,}/i,
    productHint: 'https://www.fnacpro.com/…/a12345678/…',
    productKey: (u) => { const m = u.match(/\/(a|mp)(\d{5,})/i); return m ? m[2] : stripUrl(u).replace(/^https:\/\/(www\.)?fnacpro\.com\//i, '').replace(/\/+$/, '').toLowerCase(); },
    /* Kasse auf secure.fnacpro.com (live geprüft 25.11.): 1 Panier → „Choisir ma livraison“ → 2 Livraison (Adresse/Versand
     * vorausgewählt) → „Passer à l'étape suivante“ → 3 Paiement. Beide Buttons: data-testid="basketSubmitBtn".
     * Bezahlt wird mit Karte, die bei FNAC eingegeben werden muss → das Script hält auf der Zahlungsseite an (gibt nie Kartendaten ein).
     * Achtung: Nicht lieferbare Artikel im Warenkorb blockieren „Choisir ma livraison“ (Seite lädt nur neu).
     * Warenkorb immer über „?pipe=pop&reset=1“ öffnen – die direkte /panier-Adresse zeigte einen veralteten Stand. */
    basketUrl: 'https://secure.fnacpro.com/orderpipe?pipe=pop&reset=1',
    isBasket: (p) => /^\/orderpipe(\/pop\/panier)?\/?$/i.test(p),
    isCheckout: (p) => /^\/orderpipe\/pop\/(livraison|paiement)/i.test(p),
    cartReady: () => !!document.querySelector('button[data-testid^="remove"], button[data-testid="btn-delete-product"]') || /panier\s+est\s+(tristement\s+)?vide/i.test(document.body.innerText),
    // <li> je Artikel; Löschen: data-testid="btn-delete-product" (lieferbar) bzw. "remove-unavailable-item"
    cartItems: () => [...document.querySelectorAll('button[data-testid="btn-delete-product"], button[data-testid^="remove"]')].map((del) => {
      const box = del.closest('li') || del.parentElement;
      const link = [...box.querySelectorAll('a')].find((a) => /\/(a|mp)\d{5,}/i.test(a.href));
      const pr = box.querySelector('[data-testid="product-price-value"]');
      const qs = box.querySelector('select[data-testid="productQuantityDropdown"]');
      return { box, href: link ? link.href : '', remove: del, title: norm(link ? link.innerText : box.innerText.slice(0, 80)),
        qty: qs ? parseInt(qs.value, 10) || 1 : 1, unitPrice: pr ? parsePrice(pr.innerText) || 0 : 0, minus: null };
    }),
    totalSelector: '[data-testid="summaryTotal"]',
    checkoutSelector: '[data-testid="basketSubmitBtn"]',
    nextSelector: '[data-testid="basketSubmitBtn"]',
    nextStep: [/^passer\s+à\s+l['’]étape\s+suivante$/i, /^choisir\s+ma\s+livraison$/i],
    toCheckout: [/^choisir\s+ma\s+livraison$/i],
    // Zahlungsseite: „Carte bancaire“ wählen, dann anhalten – Karte + „Payer“ macht der Nutzer
    manualPay: {
      at: () => /^\/orderpipe\/pop\/paiement/i.test(location.pathname) && !!document.querySelector('[data-testid="summaryPaymentBtn"]'),
      prepare: () => { const r = document.querySelector('input[name="payment-method"][value="Carte bancaire"]'); if (r && !r.checked) clickEl(r.closest('label') || r); },
      msg: 'Karte eingeben und auf „Payer“ klicken',
    },
    // Lagerstatus im Seitencode (JSON-LD) – live geprüft: InStock ↔ „Ajouter au panier“ vorhanden, OutOfStock ↔ kein Button
    bgCheck: true,
    addToCart: [/^ajouter\s+au\s+panier$/i],
    // Mengenfeld der Produktseite (gesehen: name="products[<Artikelnr>].Quantity")
    qtyInput: () => document.querySelector('input[name^="products["][name$="].Quantity"]'),
    // Warenkorb-Zähler oben ("Mon panier 0 articles dans Mon panier")
    // (live: nach dem Hinzufügen steht zusätzlich „Voir mon panier“ im Popup → nur Links mit Zahl werten)
    cartCount: () => { for (const x of document.querySelectorAll('a')) { const m = /mon\s+panier/i.test(x.innerText || '') && (x.innerText || '').match(/(\d+)\s+articles?/i); if (m) return parseInt(m[1], 10); } return null; },
    signInButton: () => [...document.querySelectorAll('a, button')].find((e) => /^me\s+connecter$/i.test(norm(e.innerText)) && visible(e)),
    oos: [/rupture\s+de\s+stock/i, /indisponible/i, /épuisé/i, /plus\s+disponible/i, /ausverkauft/i, /nicht\s+verfügbar/i, /out\s+of\s+stock/i],
    hardOos: [/rupture\s+de\s+stock/i, /article\s+indisponible/i, /produit\s+indisponible/i, /stock\s+en\s+ligne\s+épuisé/i],
    finalOrder: [/^payer$/i],
    unavailBlocks: /article\s+indisponible/i,
    minInterval: 45,
    beta: true,
  };

  /* ================================================================== *
   *  WEITERE SHOPS (Beta) – Universal-Erkennung
   *  Lagerstatus aus dem Seitencode (JSON-LD): meldet die Seite "ausverkauft",
   *  wird NIE etwas in den Warenkorb gelegt (verhindert Zubehör-Fehlkäufe).
   * ================================================================== */
  const BUY_TEXTS = [/^in\s+den\s+warenkorb(\s+legen)?$/i, /^in\s+den\s+einkaufswagen$/i, /^zum\s+warenkorb\s+hinzufügen$/i, /^jetzt\s+kaufen$/i, /^warenkorb$/i, /^vorbestellen$/i];
  const OOS_TEXTS = [new RegExp(NOT_FAST + 'ausverkauft', 'i'), /nicht\s+(mehr\s+)?(lieferbar|verfügbar|vorrätig)/i, /derzeit\s+nicht/i, /benachrichtig(en|ung)/i, /out\s+of\s+stock/i];
  // Button nicht in Empfehlungs-/Zubehör-Leisten
  const notInCarousel = (el) => !el.closest('[class*="carousel" i], [class*="slider" i], [class*="recommend" i], [class*="reco-" i], [class*="teaser" i], [class*="cross-sell" i], [class*="crosssell" i], [class*="accessor" i]');
  function std(id, name, domain, extra) {
    const esc2 = domain.replace(/\./g, '\\.');
    return Object.assign({
      name,
      host: new RegExp(`(^|\\.)${esc2}$`),
      productUrl: new RegExp(`^https:\\/\\/(www\\.)?${esc2}\\/.+`, 'i'),
      productHint: `https://www.${domain}/…`,
      basketUrl: '', isBasket: () => false, isCheckout: () => false,
      addToCart: BUY_TEXTS, oos: OOS_TEXTS, toCheckout: [], finalOrder: [],
      buyFilter: notInCarousel, useBoundary: true,
      ldStock: true, bgCheck: true,
      stopAfterAdd: true, minInterval: 20, beta: true, genericUrl: true,
      declineWarranty: true, cartUncheck: /garantie|versicherung|geräteschutz|absicherung|ersteinrichtung|hausbesuch/i,
    }, extra || {});
  }
  Object.assign(SHOPS, {
    alternate: std('alternate', 'Alternate', 'alternate.de', {
      productUrl: /^https:\/\/www\.alternate\.de\/.+\/html\/product\/\d+/i,
      productHint: 'https://www.alternate.de/…/html/product/123456',
      productKey: (u) => { const m = u.match(/\/product\/(\d+)/); return m ? m[1] : stripUrl(u); },
      // live geprüft: Button "In den Warenkorb" im Formular add-to-cart-form
      buyFilter: (el) => /add-to-cart-form/.test(el.id || '') || /add-to-cart/.test(String(el.className || '')),
      ownSeller: /alternate/i,
    }),
    cyberport: std('cyberport', 'Cyberport', 'cyberport.de'),
    notebooksbilliger: std('notebooksbilliger', 'notebooksbilliger', 'notebooksbilliger.de'),
    galaxus: std('galaxus', 'Galaxus', 'galaxus.de', { minInterval: 30 }),
    proshop: std('proshop', 'Proshop', 'proshop.de'),
    euronics: std('euronics', 'Euronics', 'euronics.de'),
    expert: std('expert', 'expert', 'expert.de'),
    mueller: std('mueller', 'Müller', 'mueller.de'),
    smyths: std('smyths', 'Smyths Toys', 'smythstoys.com', { productUrl: /^https:\/\/www\.smythstoys\.com\/de\/.+/i, productHint: 'https://www.smythstoys.com/de/de-de/…' }),
    kaufland: std('kaufland', 'Kaufland', 'kaufland.de', { productUrl: /^https:\/\/www\.kaufland\.de\/product\/\d+/i, productHint: 'https://www.kaufland.de/product/123456/' }),
    lidl: std('lidl', 'Lidl', 'lidl.de'),
    gamestop: std('gamestop', 'GameStop', 'gamestop.de'),
    // Sneaker/Mode: Raffles & starker Bot-Schutz → nur Alarm
    zalando: std('zalando', 'Zalando', 'zalando.de', { alertOnly: true, stopAfterAdd: false, minInterval: 30, bgCheck: false }),
    nike: std('nike', 'Nike', 'nike.com', { productUrl: /^https:\/\/www\.nike\.com\/de\/.+/i, productHint: 'https://www.nike.com/de/t/…', alertOnly: true, stopAfterAdd: false, minInterval: 30, bgCheck: false }),
    snipes: std('snipes', 'Snipes', 'snipes.com', { alertOnly: true, stopAfterAdd: false, minInterval: 30, bgCheck: false }),
    solebox: std('solebox', 'Solebox', 'solebox.com', { alertOnly: true, stopAfterAdd: false, minInterval: 30, bgCheck: false }),
  });

  /* ---------- Shopify (ein Modul für alle Shopify-Shops) ---------- */
  SHOPS.shopify = {
    name: 'Shopify',
    host: /^$/,              // wird über den Seitenaufbau erkannt, nicht über die Domain
    productUrl: /^https?:\/\/[^/]+\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:collections\/[^/]+\/)?products\/[^/?#]+/i,
    productHint: 'https://shop.de/products/…',
    productKey: (u) => { const m = u.match(/^https?:\/\/([^/]+)\/.*products\/([^/?#]+)/i); return m ? `${m[1]}/${m[2]}`.toLowerCase() : stripUrl(u); },
    basketUrl: '', isBasket: (p) => /^\/cart\/?$/.test(p), isCheckout: () => false,
    addToCart: BUY_TEXTS, oos: OOS_TEXTS, toCheckout: [], finalOrder: [],
    shopify: true, bgCheck: true, stopAfterAdd: true, minInterval: 15, beta: true,
  };
  const isShopifyPage = () => !!document.querySelector('link[href*="cdn.shopify.com"], script[src*="cdn.shopify.com"], meta[name="shopify-checkout-api-token"], meta[name="shopify-digital-wallet"]');

  // Gemeinsame Texte für alle Shops
  const COMMON = {
    cartOos: [new RegExp(NOT_FAST + 'ausverkauft', 'i'), /nicht\s+(mehr\s+)?lieferbar/i, /nicht\s+(mehr\s+)?verfügbar/i, /nicht\s+mehr\s+(über\s+[^.]{0,60}\s+)?erhältlich/i,
              /leider\s+nicht\s+mehr/i, /bestand\s+reicht\s+nicht/i, /nicht\s+in\s+der\s+gewünschten\s+menge/i],
    remove: [/^entfernen$/i, /^löschen$/i, /^entferne\b/i, /(artikel|produkt)\s+entfernen/i, /aus\s+dem\s+warenkorb\s+entfernen/i],
    confirmRemove: [/^entfernen$/i, /^ja/i, /^löschen$/i],
    success: /vielen\s+dank|danke\s+für\s+deine\s+bestellung|bestellung\s+(ist\s+)?(eingegangen|bestätigt|aufgegeben)|bestellbestätigung|bestellnummer|order\s+placed|thank\s+you,?\s+your\s+order|commande\s+(validée|confirmée|passée)|merci,?\s+votre\s+commande/i,
    variantOpener: [/größe\s+wählen/i, /variante\s+wählen/i, /bitte\s+wählen/i],
  };

  // Eigenständiges Dashboard (eigener Tab, lädt nie neu): https://example.com/?quickbuy
  const DASH_URL = 'https://example.com/?quickbuy';
  const STANDALONE = /^(www\.)?example\.com$/.test(location.hostname) && /quickbuy/i.test(location.search + location.hash);
  SHOPS.__dash = { name: 'Dashboard', internal: true, host: /^$/, productUrl: /^$/, productHint: '', basketUrl: '', isBasket: () => false, isCheckout: () => false, addToCart: [], oos: [], toCheckout: [], finalOrder: [] };
  const QUEUE_HOST = /(^|\.)queue-it\.net$/i.test(location.hostname);
  SHOPS.__queue = { ...SHOPS.__dash, name: 'Warteschlange' };
  const SHOP_IDS = () => Object.keys(SHOPS).filter((id) => !SHOPS[id].internal);
  const SHOP_ID = STANDALONE ? '__dash' : QUEUE_HOST ? '__queue' : (SHOP_IDS().find((id) => SHOPS[id].host.test(location.hostname)) || (isShopifyPage() ? 'shopify' : null));
  if (!SHOP_ID) return;
  const SHOP = SHOPS[SHOP_ID];
  if (SHOP_ID === 'shopify') SHOP.name = `Shopify · ${location.hostname.replace(/^www\./, '')}`;

  /* ================================================================== *
   *  Zustand – getrennt pro Shop, damit Otto + MediaMarkt parallel laufen
   * ================================================================== */
  const DEFAULTS = {
    running: false, products: [], idx: 0, stepDelaySec: 3, continueAfterBuy: true,
    dryRun: false, dryProduct: null, dropAt: '', dropIntervalSec: 5, dropReloaded: false, heartbeat: 0,
    targetUrl: '', variant: '', intervalSec: 15, jitterSec: 5,
    maxAttempts: 0, maxPrice: 0, autoOrder: false, autoLogin: true, loginWait: 0, onlyOwn: true, payMethod: SHOP.defaultPay || 'default', payOk: false, inCart: {}, justAdded: false, owner: null, sleeps: [], loginCheck: true, removeOthers: false, curTotal: 0, minimized: false, logOpen: false, curTitle: '', attempts: 0, stage: 'product', log: [],
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
    while (/^(w-\d+|a\d{5,}|mp\d{5,}|buy-now|kaufen|product|p)$/i.test(slug) && parts.length > 2) slug = parts.pop();   // FNAC /a123/w-4 · Sony /ps5-pro/buy-now/
    if (/^[a-z0-9]{10,14}$/i.test(slug) && parts.length) {   // Microsoft: /d/<name>/<id> · Amazon: /<name>/dp/<ASIN>
      const id = slug; slug = parts.pop();
      if (/^(dp|product)$/i.test(slug)) { if (parts[parts.length - 1] === 'gp') parts.pop(); slug = parts.length > 2 && !/^(-|[a-z]{2})$/i.test(parts[parts.length - 1]) ? parts.pop() : `Amazon ${id}`; }   // amazon.fr/-/en/dp/<ASIN>
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

  // Kurzzeit-Cache: viele Prüfungen pro Durchlauf laufen über denselben DOM-Stand.
  // Nach jedem Klick wird der Cache verworfen, damit nie mit veraltetem DOM gearbeitet wird.
  let deepCache = null, deepAt = 0;
  const DEEP_TTL = 250;
  function deepAll(root = document) {
    if (root === document) {
      const now = performance.now();
      if (deepCache && now - deepAt < DEEP_TTL) return deepCache;
      deepCache = deepWalk(document); deepAt = performance.now();
      return deepCache;
    }
    return deepWalk(root);
  }
  function deepWalk(root) {
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

  const elText = (el) => norm(el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || el.getAttribute('title'));

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
    deepCache = null;
    const inner = el.shadowRoot && el.shadowRoot.querySelector('button, a');
    (inner || el).click();
  }

  const noHashUrl = (u) => String(u).split('#')[0];
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
    if (SHOP.priceFn) { const v = SHOP.priceFn(); if (v) return { price: v, src: 'Anzeige' }; }
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
    if (SHOP.totalSelector) {
      const el = document.querySelector(SHOP.totalSelector);
      const m = el && norm(el.innerText || el.textContent || '').match(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/);
      if (m) return parseFloat(m[1].replace(/\./g, '') + '.' + m[2]);
    }
    const t = pageText();
    // erst die eindeutigen Begriffe, „Summe“ nur als letzte Möglichkeit (sonst wird die Zwischensumme ohne Versand gelesen)
    for (const word of ['gesamtsumme|gesamtbetrag|gesamtpreis|zu\\s+zahlen(?:der\\s+betrag)?|total', '(?<!zwischen)summe']) {
      const m = t.match(new RegExp(`(${word})[^€]{0,40}?((\\d{1,3}(?:\\.\\d{3})*|\\d+)(,\\d{2}|,-{1,2})?\\s*€)`, 'i'));
      if (m) return parsePrice(m[2]);
    }
    return null;
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
    // Shop-spezifischer, eindeutiger Button (z. B. Amazon: <input id="add-to-cart-button"> ohne sichtbaren Text)
    if (SHOP.buySelector) {
      const b = [...document.querySelectorAll(SHOP.buySelector)].find((x) => visible(x) && !x.closest('#qb-panel'));
      if (b) return b;
    }
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

  // Lagerstatus aus dem JSON-LD der aktuellen Seite: 'in' | 'out' | null
  function pageLdAvailability() {
    for (const sc of document.querySelectorAll('script[type="application/ld+json"]')) {
      let d; try { d = JSON.parse(sc.textContent); } catch (e) { continue; }
      for (const it of [].concat(d, (d && d['@graph']) || [])) {
        if (!it || !/product/i.test([].concat(it['@type']).join())) continue;
        const offers = [].concat(it.offers || []).flatMap((o) => [o].concat((o && o.offers) || []));
        const av = offers.map((o) => String((o && o.availability) || '')).join(' ');
        if (/InStock|PreOrder|LimitedAvailability|OnlineOnly/i.test(av)) return 'in';
        if (/OutOfStock|SoldOut|Discontinued/i.test(av)) return 'out';
      }
    }
    return null;
  }
  function isOOS() {
    if (SHOP.availableFn) return !SHOP.availableFn();
    if (SHOP.ldStock) {
      const av = pageLdAvailability();
      if (av === 'out') return true;                 // Seite meldet ausverkauft → niemals kaufen
      if (av === 'in' && SHOP.alertOnly) return false;
    }
    if (SHOP.hardOos && matchText(SHOP.hardOos)) return true;
    const btn = findBuyButton();
    return !(btn && !isDisabled(btn));
  }
  const oosReason = () => (SHOP.ldStock && pageLdAvailability() === 'out' && 'Seite meldet „ausverkauft“') || (SHOP.hardOos && matchText(SHOP.hardOos)) || matchText(SHOP.oos) || 'kein aktiver Warenkorb-Button';
  // „nicht verfügbar“ nur werten, wenn es um den Artikel selbst geht – nicht um Sofort-Lieferung, Abholung oder Adresse
  // (live bei MediaMarkt: „Für die eingegebene Adresse ist die Sofort-Lieferung nicht verfügbar …“ stand in JEDER Artikelzeile)
  const DELIVERY_NOISE = /sofort-?lieferung|abholung|abholen|liefermethode|lieferart|lieferadresse|adresse|im\s+markt|naheliegende|express|same\s*day|uber/i;
  function oosIn(text) {
    for (const sent of String(text || '').split(/(?<=[.!?])\s+|\n+/)) {
      if (DELIVERY_NOISE.test(sent)) continue;
      const p = COMMON.cartOos.find((r) => r.test(sent));
      if (p) return sent.match(p)[0];
    }
    return null;
  }
  const cartOosText = () => oosIn((document.querySelector('main') || document.body).innerText);

  /* ---------- Discord-Webhook (gilt für alle Shops) ---------- */
  const G = {
    get: (k, d) => GM_getValue(`global:${k}`, d),
    set: (k, v) => GM_setValue(`global:${k}`, v),
  };
  const DC_DEFAULTS = { webhook: '', dcSuccess: true, dcCheckout: true, dcAvailable: false, dcError: true, dcPing: false, dcListing: true, dcReport: true };
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
    queue:     { flag: 'dcCheckout',  color: 0x9b59b6, title: '⏳ Warteschlange' },
    listing:   { flag: 'dcListing',   color: 0x1abc9c, title: '🆕 Neu gelistet' },
    report:    { flag: 'dcReport',    color: 0x95a5a6, title: '🩺 QuickBuy Selbsttest' },
    login:     { flag: 'dcError',     color: 0xe67e22, title: '🔑 Nicht angemeldet?' },
  };

  function discord(kind, description, o) {
    o = o || {};
    const k = DC_KIND[kind];
    const url = dc('webhook');
    if (!k || !WEBHOOK_RE.test(url) || (k.flag && !dc(k.flag))) return Promise.resolve(false);
    const p = o.title !== undefined ? { url: o.url || '' } : cur();
    const price = o.title !== undefined ? 0 : S.get('curPrice');
    const fields = [{ name: 'Shop', value: o.shop || SHOP.name, inline: true }];
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
        description: `${o.title === '' ? '' : `**${(o.title || S.get('curTitle') || shortName(p.url || location.href)).replace(/[*_`]/g, '')}**`}${description ? (o.title === '' ? '' : '\n') + description : ''}`.slice(0, 4000),
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: `Shop QuickBuy · ${o.shop || SHOP.name}` },
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


  /* ================================================================== *
   *  Warteschlange (Queue-it / Warteraum) – NIE neu laden, sonst ist der Platz weg
   * ================================================================== */
  const QUEUE_RE = /warteschlange|warteraum|waiting\s*room|you\s+are\s+(now\s+)?in\s+(the\s+)?(line|queue)|sie\s+sind\s+(jetzt\s+)?in\s+der\s+(schlange|warteschlange)|file\s+d['’]attente/i;
  function queuePresent() {
    if (QUEUE_HOST) return true;
    if (document.querySelector('#MainPart_divProgressbar, #queue-it_log, #lbQueueNumber, #MainPart_lbQueueNumberText')) return true;
    const head = norm(document.title + ' ' + [...document.querySelectorAll('h1, h2')].slice(0, 4).map((e) => e.innerText).join(' '));
    return QUEUE_RE.test(head) && !findBuyButton();
  }
  function queueAlert(shopName, text) {
    if (Date.now() - (GM_getValue('global:queueAlertAt', 0) || 0) < 30 * 60000) return;
    GM_setValue('global:queueAlertAt', Date.now());
    notify('QuickBuy – Warteschlange', text);
    discord('queue', text, { title: shopName, shop: shopName });
  }
  let queueWatch = false;
  function handleQueue() {
    if (queueWatch) return; queueWatch = true;
    busy = true;
    if (!S.get('queueSince')) S.set('queueSince', Date.now());
    log('Warteschlange erkannt – Seite wird NICHT neu geladen, damit dein Platz erhalten bleibt', 'warn');
    queueAlert(SHOP.name, `Du bist bei **${SHOP.name}** in der Warteschlange. Tab offen lassen und **nicht neu laden** – danach geht es automatisch weiter.`);
    const iv = setInterval(() => {
      if (!S.get('running')) { clearInterval(iv); queueWatch = false; return; }
      if (queuePresent()) return;
      clearInterval(iv); queueWatch = false; busy = false;
      queuePassed();
      setTimeout(() => { if (S.get('running') && !busy) { busy = true; main(); } }, 1500);
    }, 4000);
  }
  function queuePassed() {
    const since = S.get('queueSince'); if (!since) return;
    S.set('queueSince', 0);
    const min = Math.round((Date.now() - since) / 60000);
    log(`Warteschlange geschafft ✔ (${min} Min.) – weiter geht’s`, 'ok');
    discord('queue', `Warteschlange bei **${SHOP.name}** geschafft (${min} Min.) – Script macht weiter.`);
  }
  // Läuft auf *.queue-it.net (eigene Seite des Warteschlangen-Anbieters)
  function queueTargetShop() {
    const hosts = [];
    try { const q = new URLSearchParams(location.search); for (const k of ['t', 'target']) if (q.get(k)) hosts.push(new URL(q.get(k)).hostname); } catch (e) {}
    try { if (document.referrer) hosts.push(new URL(document.referrer).hostname); } catch (e) {}
    for (const h of hosts) { const id = SHOP_IDS().find((x) => SHOPS[x].host.test(h)); if (id) return id; }
    // sonst: der laufende Shop, der zuletzt eine Seite aufgerufen hat
    return SHOP_IDS().filter((x) => GM_getValue(`${x}:running`, false))
      .sort((a, b) => (GM_getValue(`${b}:navAt`, 0) || 0) - (GM_getValue(`${a}:navAt`, 0) || 0))[0] || null;
  }
  function queuePage() {
    if (window.top !== window) return;
    const id = queueTargetShop();
    const name = id ? SHOPS[id].name : 'Shop';
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;background:#1d1f25;color:#fff;border:2px solid #9b59b6;border-radius:12px;padding:12px 16px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5)';
    bar.innerHTML = `⏳ <b>QuickBuy:</b> Du bist in der Warteschlange${id ? ` von <b>${name}</b>` : ''}. Tab offen lassen, <b>nicht neu laden</b> – danach macht das Script automatisch weiter.`;
    (document.body || document.documentElement).appendChild(bar);
    if (!id) return;
    if (!GM_getValue(`${id}:queueSince`, 0)) GM_setValue(`${id}:queueSince`, Date.now());
    pushLog(id, 'Warteschlange (Queue-it) – warte, ohne neu zu laden', 'warn');
    queueAlert(name, `Du bist bei **${name}** in der Warteschlange. Tab offen lassen und **nicht neu laden** – danach geht es automatisch weiter.`);
    // Herzschlag für den Shop, damit das Dashboard den Tab nicht für abgestürzt hält
    const beat = () => GM_setValue(`${id}:heartbeat`, Date.now());
    beat(); setInterval(beat, 3000);
  }

  /* ---------- Anmeldung im Hintergrund prüfen ---------- */
  const LOGIN_TXT = /^(anmelden|einloggen|login|log\s*in|sign\s*in|se\s+connecter|identifiez-vous|anmelden\s*(\/|oder)\s*registrieren)$/i;
  function loggedOutHint() {
    if (SHOP.loginState) return SHOP.loginState();
    const zones = [...document.querySelectorAll('header, [role="banner"], nav')].slice(0, 8);
    for (const z of zones) {
      for (const el of z.querySelectorAll('a, button, [role="button"]')) {
        const t = elText(el);
        if (t.length < 40 && LOGIN_TXT.test(t) && visible(el)) return t;
      }
    }
    return null;
  }
  function checkLogin() {
    if (!S.get('loginCheck') || SHOP.needLogin || SHOP.alertOnly || SHOP.shopify || S.get('dryRun')) return;
    if (Date.now() - (S.get('loginCheckedAt') || 0) < 5 * 60000) return;
    S.set('loginCheckedAt', Date.now());
    const t = loggedOutHint();
    if (!t) {
      if (S.get('loggedOut')) { S.set('loggedOut', 0); log('Anmeldung ok ✔', 'ok'); }
      return;
    }
    const n = (S.get('loggedOut') || 0) + 1; S.set('loggedOut', n);
    if (n < 2) return;                                   // zweimal hintereinander → kein Fehlalarm durch Ladezustände
    log(`Vermutlich nicht angemeldet (oben steht „${t}“) – bitte bei ${SHOP.name} anmelden, sonst scheitert die Kasse`, 'warn');
    if (Date.now() - (S.get('loginAlertAt') || 0) > 2 * 3600e3) {
      S.set('loginAlertAt', Date.now());
      notify(`QuickBuy ${SHOP.name}`, 'Vermutlich abgemeldet – bitte anmelden');
      discord('login', `Bei **${SHOP.name}** steht oben „${t}“ – du bist vermutlich **abgemeldet**. Bitte im Tab anmelden, sonst scheitert die Kasse beim Restock.`);
    }
  }

  /* ---------- Tagesbudget (alle Shops zusammen) ---------- */
  function spentToday() {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    return GM_getValue('global:history', []).filter((h) => h.result === 'success' && h.ts >= d0.getTime())
      .reduce((a, h) => a + (Number(h.total) || Number(h.price) || 0), 0);
  }
  // null = ok, sonst Grund
  function budgetBlock(amount) {
    const b = Number(G.get('budgetDay', 0)) || 0;
    if (!b) return null;
    const spent = spentToday();
    if (spent >= b) return `Tagesbudget ${fmtEur(b)} € erreicht (heute ${fmtEur(spent)} €)`;
    if (!amount) return `Betrag nicht erkannt – Tagesbudget ${fmtEur(b)} € kann nicht geprüft werden`;
    if (spent + amount > b) return `Tagesbudget ${fmtEur(b)} € würde überschritten (heute ${fmtEur(spent)} € + ${fmtEur(amount)} €)`;
    return null;
  }
  function budgetStop(msg, btn) {
    if (btn) { btn.style.outline = '4px solid #e60000'; btn.scrollIntoView({ block: 'center' }); }
    notify(`QuickBuy ${SHOP.name}`, `${msg} – NICHT bestellt`);
    discord('error', `**${msg}** – nicht bestellt. Budget in den Dashboard-Einstellungen anpassen.`);
    return stop(`${msg} – nicht bestellt`);
  }

  /* ---------- Selbsttest: wird die Produktseite noch erkannt? ---------- */
  function recordDiag() {
    const h1 = document.querySelector('h1, #productTitle');
    const d = {
      t: Date.now(), url: cur().url,
      title: !!(h1 && norm(h1.innerText)), price: !!getProductPrice(), btn: !!findBuyButton(),
      oosText: !!(matchText(SHOP.oos) || (SHOP.hardOos && matchText(SHOP.hardOos))), ld: pageLdAvailability() || '',
    };
    S.set('diag', d);
    const bad = !d.title && !d.btn && !d.price && !d.ld;
    const n = bad ? (S.get('diagBad') || 0) + 1 : 0;
    S.set('diagBad', n);
    if (n === 10) {
      log('Selbsttest: Produktseite wird seit 10 Prüfungen nicht erkannt (kein Titel, Preis, Button) – Layout geändert, gesperrt oder Fehlerseite?', 'err');
      discord('error', `**Selbsttest:** Die Produktseite bei ${SHOP.name} wird seit 10 Prüfungen nicht mehr erkannt (kein Titel, Preis oder Button). Shop hat evtl. das Layout geändert oder blockiert – bitte Tab ansehen.`);
    }
  }

  /* ---------- Restock-Statistik ---------- */
  function recordRestock() {
    const k = keyOf(cur().url);
    const seen = S.get('restockSeen') || {};
    const now = Date.now();
    if (now - (seen[k] || 0) < 15 * 60000) return;
    for (const x of Object.keys(seen)) if (now - seen[x] > 86400e3) delete seen[x];
    seen[k] = now; S.set('restockSeen', seen);
    const r = GM_getValue('global:restocks', []);
    r.unshift({ t: now, shopId: SHOP_ID, title: S.get('curTitle') || shortName(cur().url), url: cur().url, price: Number(S.get('curPrice')) || 0 });
    GM_setValue('global:restocks', r.slice(0, 1500));
  }

  /* ---------- Bestellnummer von der Bestätigungsseite ---------- */
  const ORDER_RE = /(?:bestell(?:ungs)?(?:nummer|-?nr\.?)|auftrags(?:nummer|-?nr\.?)|order\s*(?:number|no\.?|#|id)|numéro\s+de\s+commande)\s*[:#]?\s*(?:lautet|ist|is)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,30})/gi;
  function findOrderNo(text) {
    for (const m of String(text || '').matchAll(ORDER_RE)) if (/\d{3,}/.test(m[1])) return m[1];
    return '';
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
    let base = effRoundSec(SHOP_ID);      // Pause + gemeinsames Limit (MediaMarkt/Saturn) + Captcha-Bremse
    // Kurz nach einem „Fast-Treffer“ (Artikel war kurz da, Shop hat beim Hinzufügen abgelehnt) → 3 Min. schneller nachsehen
    if (Date.now() >= (S.get('slowUntil') || 0) && Date.now() < (S.get('burstUntil') || 0)) base = Math.min(base, Math.max(8, SHOP.rateGroup ? SHOP.minInterval || 8 : 8));
    return Math.round((base + jitter) * 1000);
  }

  /* ---------- Hintergrund-Prüfung (ohne Neuladen) ---------- */
  async function bgStatus(url) {
    if (SHOP.shopify) {
      try {
        const p = await shopifyInfo(url); if (!p) return 'err';
        const item = S.get('products').find((x) => x.url === url) || {};
        const v = shopifyPickVariant(p, item.variant);
        return v && v.available ? 'in' : 'out';
      } catch (e) { return 'err'; }
    }
    try {
      const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (r.status === 404 || r.status === 410) return 'out';   // Artikel (vorerst) aus dem Sortiment – live bei Saturn gesehen (410)
      if (!r.ok) return 'err';
      const html = await r.text();
      lastBgHtml = html;
      // Weiterleitung auf eine andere Seite (Suche, anderes Produkt) → Seite laden und dort entscheiden
      if (r.redirected && keyOf(r.url) !== keyOf(url)) return 'err';
      return parseStock(SHOP, html) || 'err';
    } catch (e) { return 'err'; }
  }
  // Lagerstatus aus dem HTML einer Produktseite: erst der Shop-eigene Parser, dann JSON-LD. null = unklar
  function parseStock(sh, html, get) {
    if (sh.bgParse) { const v = sh.bgParse(html, get); if (v) return v; }
    const doc = new DOMParser().parseFromString(html, 'text/html');
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
    return null;
  }
  let lastBgHtml = '';
  // Preis aus dem Hintergrund-Abruf (erstes Angebot = Hauptartikel; auch als escaptes JSON) – nur zur Vorab-Prüfung,
  // die echte Preisprüfung passiert weiterhin auf der Produktseite
  function bgPrice(html) {
    const m = String(html || '').match(/\\?"offers\\?"\s*:\s*\{[^}]*?\\?"price\\?"\s*:\s*\\?"?(\d+(?:\.\d+)?)/);
    const v = m ? parseFloat(m[1]) : NaN;
    return v > 0 ? v : null;
  }
  let bgActive = false;
  async function bgLoop() {
    if (bgActive) return; bgActive = true;
    let rounds = 0;
    try {
      while (S.get('running') && !yielded) {
        if (centralOK(SHOP_ID)) { park('Prüf-Zentrum übernimmt die Prüfung'); return; }
        if (dropActive() && !S.get('dropReloaded')) {
          S.set('dropReloaded', true);
          log('Drop-Modus aktiv – lade Seite neu (Login prüfen) und prüfe ab jetzt schneller', 'buy');
          S.set('navAt', Date.now()); location.href = cur().url; return;
        }
        rounds++;
        const r = S.get('attempts') + 1; S.set('attempts', r);
        const max = S.get('maxAttempts');
        if (max > 0 && r >= max) { bgActive = false; return stop(`Maximale Runden (${max}) erreicht`); }
        if (rounds % 10 === 0) { log('Kontroll-Neuladen (Login & Status) …', 'info'); S.set('navAt', Date.now()); location.href = cur().url; return; }
        const list = S.get('products');
        // Abrufe gleichmäßig über die Runde verteilen (kein Schwall direkt hintereinander → weniger Captchas)
        const step = Math.max(2000, Math.round(currentIntervalMs() / Math.max(1, list.length)));
        for (let i = 0; i < list.length; i++) {
          if (!S.get('running')) break;
          countdown(step);
          await wait(step);
          if (!S.get('running') || yielded) break;
          const st = await bgStatus(list[i].url);
          const tag = `[${i + 1}/${list.length} ${shortName(list[i].url)}]`;
          if (st === 'in') {
            const bp = SHOP.shopify ? null : bgPrice(lastBgHtml);
            const mx = Number(list[i].maxPrice) || 0;
            if (bp && mx && bp > mx * 1.02) {      // deutlich über dem Höchstpreis → Seite gar nicht erst laden
              log(`${tag} Hintergrund: verfügbar, aber ${fmtEur(bp)} € > Max ${fmtEur(mx)} €`, 'oos');
              continue;
            }
            log(`${tag} Hintergrund: verfügbar! → öffne Seite`, 'ok');
            S.set('idx', i); S.set('navAt', Date.now()); location.href = list[i].url; return;
          }
          if (st === 'err') {
            log(`${tag} Hintergrund-Prüfung nicht möglich → lade Seite`, 'warn');
            S.set('idx', i); S.set('navAt', Date.now()); location.href = list[i].url; return;
          }
          log(`${tag} OOS (Hintergrund)`, 'oos');
        }
      }
    } finally { bgActive = false; }
  }

  function scheduleReload(reason) {
    if (S.get('dryRun')) return stop(`Probelauf: ${reason || 'Artikel gerade nicht kaufbar'} – nimm einen lieferbaren Artikel`);
    const list = S.get('products');
    const n = Math.max(1, list.length);
    log(`[${(S.get('idx') % n) + 1}/${n} ${shortName(cur().url)}] ${reason || 'OOS (' + oosReason() + ')'}`);
    if (centralOK(SHOP_ID)) return handBack();
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
    later(wait, () => { if (S.get('running') && !yielded) { S.set('navAt', Date.now()); location.href = cur().url; } });
  }

  // Nach erfolgreicher Bestellung: stoppen oder mit restlichen Produkten weitermachen
  // Merkt sich, welches Produkt bereits im Warenkorb liegt → nie doppelt hinzufügen
  const inCartKey = () => keyOf(cur().url);
  const isInCart = () => !!S.get('inCart')[inCartKey()];
  function setInCart(v) { const m = { ...S.get('inCart') }; if (v) m[inCartKey()] = true; else delete m[inCartKey()]; S.set('inCart', m); }

  /* ---------- Kaufhistorie (gilt für alle Shops) ---------- */
  function recordHistory(result, extra) {
    const h = GM_getValue('global:history', []);
    h.unshift({ ts: Date.now(), shop: SHOP.name, shopId: SHOP_ID, title: S.get('curTitle') || shortName(cur().url),
      price: Number(S.get('curPrice')) || 0, url: cur().url, result, ...(extra || {}) });
    GM_setValue('global:history', h.slice(0, 300));
  }

  // Nach erfolgreichem Kauf: gleiches Produkt erneut (bis Stückzahl), dann nächstes Produkt, sonst stoppen
  function finishSuccess(msg) {
    setInCart(false);
    let txt = ''; try { txt = SHOP.psFlow ? psText() : (document.body.innerText || ''); } catch (e) {}
    const orderNo = findOrderNo(txt);
    const pm = PAY[S.get('payMethod')];
    recordHistory('success', { total: Number(S.get('curTotal')) || 0, orderNo, pay: pm && S.get('payMethod') !== 'default' ? pm.label : '' });
    S.set('curTotal', 0);
    if (orderNo) log(`Bestellnummer: ${orderNo}`, 'ok');
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
  /* ---------- Shopify: Produktdaten über die offizielle Schnittstelle (/products/<handle>.js) ---------- */
  function shopifyJsUrl(url) {
    const u = new URL(stripUrl(url));
    const m = u.pathname.match(/^(.*\/products\/[^/]+)/);
    return m ? `${u.origin}${m[1].replace(/^\/collections\/[^/]+/, '')}.js` : null;
  }
  async function shopifyInfo(url) {
    const j = shopifyJsUrl(url); if (!j) return null;
    const r = await fetch(j, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) return null;
    return r.json();
  }
  function shopifyPickVariant(p, wanted) {
    const vs = p.variants || [];
    if (wanted) {
      const w = norm(wanted).toLowerCase();
      return vs.find((v) => [v.title, v.option1, v.option2, v.option3].filter(Boolean).some((o) => norm(String(o)).toLowerCase() === w)) || null;
    }
    return vs.find((v) => v.available) || vs[0] || null;
  }
  async function runShopify() {
    await sleep(800);
    let p;
    try { p = await shopifyInfo(cur().url); } catch (e) { p = null; }
    if (!p) return scheduleReload('Shopify-Produktdaten nicht abrufbar');
    S.set('curTitle', String(p.title || '').slice(0, 60));
    const v = shopifyPickVariant(p, cur().variant);
    if (cur().variant && !v) return scheduleReload(`Variante „${cur().variant}“ gibt es nicht`);
    if (!v || !v.available) return scheduleReload(`OOS${v ? ` (${v.title})` : ''}`);
    const price = (Number(v.price) || 0) / 100;
    S.set('curPrice', price);
    const max = Number(cur().maxPrice) || 0;
    if (max && price > max) return scheduleReload(`Preis ${fmtEur(price)} € > Max ${fmtEur(max)} €`);
    const q = Number(cur().qty === undefined ? 1 : cur().qty) || 1;
    log(`Verfügbar! ${v.title !== 'Default Title' ? `Variante „${v.title}“, ` : ''}${fmtEur(price)} € → in den Warenkorb (${q} Stk.)`, 'ok');
    if (S.get('dryRun')) log('🧪 Probelauf: lege trotzdem in den Warenkorb (Kasse wird bei Shopify nie automatisch bezahlt)', 'buy');
    const origin = new URL(cur().url).origin;
    const r = await fetch(`${origin}/cart/add.js`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: [{ id: v.id, quantity: q }] }),
    }).catch(() => null);
    if (!r || !r.ok) {
      discord('error', `Shopify: In den Warenkorb legen fehlgeschlagen (${r ? r.status : 'Netzwerk'}) – bitte manuell versuchen.`);
      return stop(`In den Warenkorb fehlgeschlagen (${r ? r.status : 'Netzwerk'}) – bitte manuell versuchen`);
    }
    notify(`QuickBuy ${new URL(origin).hostname}`, 'Im Warenkorb – jetzt selbst zur Kasse!');
    await discord('added', `Liegt im Warenkorb bei **${new URL(origin).hostname}** – **jetzt zur Kasse:** ${origin}/checkout`);
    stop('Im Warenkorb – öffne Kasse, bitte selbst bezahlen');
    location.href = `${origin}/checkout`;
  }

  /* ---------- Geräteschutz / Garantie-Angebote immer ablehnen ---------- */
  const DECLINE_RE = /ich\s+verzichte|kein(en)?\s+(zusätzlichen\s+)?schutz|ohne\s+(zusätzlichen\s+)?(schutz|garantie|versicherung)|nein,?\s+danke|^no,?\s+thanks?$|^non,?\s+merci$/i;
  // Angehakte Garantie-/Service-Kästchen auf der aktuellen Seite abwählen
  async function uncheckAddons(where) {
    if (!SHOP.cartUncheck) return 0;
    let n = 0;
    for (const cb of deepAll().filter((e) => e.tagName === 'INPUT' && e.type === 'checkbox' && e.checked && !e.closest('#qb-panel'))) {
      const t = radioLabel(cb);
      if (SHOP.cartUncheck.test(t) && !DECLINE_RE.test(t) && !/newsletter|e-mail|agb|datenschutz/i.test(t)) {
        clickEl((cb.labels && cb.labels[0]) || cb);
        if (cb.checked) cb.click();
        n++; log(`${where}: Zusatzleistung abgewählt – ${t.slice(0, 50)}`, 'info');
        await sleep(1000);
      }
    }
    return n;
  }
  async function declineWarranty(doneFn) {
    const BAD = /mit\s+garantie|plusgarantie|\+\s*\d|\d+,\d{2}\s*€|hinzufügen/i;
    let doneAt = 0;
    const opt = await waitFor(() => {
      // Shop hat das Hinzufügen schon bestätigt und nach 1 s kam keine Garantie-Frage → nicht weiter warten (spart bis zu 4 s)
      if (doneFn && doneFn()) { if (!doneAt) doneAt = Date.now(); else if (Date.now() - doneAt > 1000) return 'none'; }
      const c = deepAll().filter((e) => /^(LABEL|INPUT|DIV|SPAN|BUTTON|A|P)$/.test(e.tagName) && visible(e) && !e.closest('#qb-panel') &&
        elText(e).length < 90 && DECLINE_RE.test(elText(e)) && !BAD.test(elText(e)));
      // Buttons/Labels bevorzugen, dann das Element mit dem kürzesten Text (= am genauesten)
      c.sort((a, b) => (/^(BUTTON|LABEL|A|INPUT)$/.test(b.tagName) - /^(BUTTON|LABEL|A|INPUT)$/.test(a.tagName)) || elText(a).length - elText(b).length);
      return c[0] || null;
    }, 4500, 250);
    if (!opt || opt === 'none') return false;
    const target = opt.closest('label') || opt;
    clickEl(target);
    await sleep(600);
    const radio = (target.querySelector && target.querySelector('input[type="radio"],input[type="checkbox"]')) || (opt.tagName === 'INPUT' ? opt : null);
    if (radio && !radio.checked) { radio.click(); await sleep(400); }
    // Sicherheitscheck: keine Garantie ausgewählt
    const wrong = deepAll().find((e) => e.tagName === 'INPUT' && /radio|checkbox/.test(e.type) && e.checked && /plusgarantie|garantie|absicherung/i.test(radioLabel(e)) && !DECLINE_RE.test(radioLabel(e)));
    if (wrong) { clickEl(wrong); await sleep(400); }
    const box = opt.closest('[role="dialog"], [aria-modal="true"], [class*="modal" i], [class*="dialog" i], [class*="layer" i], [class*="overlay" i]') || document;
    const next = [...box.querySelectorAll('button')].find((b) => /^(weiter|fortfahren|ok|übernehmen)$/i.test(elText(b)) && visible(b) && !isDisabled(b));
    if (next) { clickEl(next); await sleep(1200); }
    log(`Garantie/Geräteschutz abgelehnt („${elText(opt).slice(0, 45)}“)`, 'info');
    return true;
  }

  /* ---------- Warenkorb-Zähler oben im Shop (allgemein) & Bestätigung "hinzugefügt" ---------- */
  function cartCountAny() {
    if (SHOP.cartCount) { const c = SHOP.cartCount(); if (c !== null) return c; }
    const els = deepAll().filter((e) => /^(A|BUTTON|SPAN|DIV)$/.test(e.tagName) && !e.closest('#qb-panel') &&
      (/warenkorb|basket|cart|einkaufswagen|panier/i.test(e.getAttribute('href') || '') || /warenkorb|einkaufswagen|panier/i.test(e.getAttribute('aria-label') || '') || /basket|cart/i.test(e.getAttribute('data-qa') || e.getAttribute('data-test') || '')));
    for (const e of els) {
      const m = ((e.getAttribute('aria-label') || '') + ' ' + (e.innerText || '')).match(/(\d{1,3})/);
      if (m) return parseInt(m[1], 10);
    }
    return null;
  }
  const ADDED_RE = /(wurde|wurden|ist)\s+(erfolgreich\s+)?(in\s+den|zum|dem)\s+(warenkorb|einkaufswagen)|zum\s+(warenkorb|einkaufswagen)\s+hinzugefügt|in\s+den\s+warenkorb\s+gelegt|artikel\s+hinzugefügt|added\s+to\s+(cart|basket)|ajouté\s+au\s+panier|c['’]est\s+dans\s+votre\s+panier/i;

  async function runProduct() {
    if (SHOP.shopify) return runShopify();
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
    if (queuePresent()) return handleQueue();
    S.set('curTotal', 0); S.set('skipDirect', false);
    recordDiag();
    checkLogin();
    if (S.get('autoOrder') && !SHOP.alertOnly && !S.get('dryRun')) {
      const b = Number(G.get('budgetDay', 0)) || 0;
      if (b && spentToday() >= b) {
        discord('error', `**Tagesbudget ${fmtEur(b)} € erreicht** – ${SHOP.name} gestoppt.`);
        return stop(`Tagesbudget ${fmtEur(b)} € erreicht (heute ${fmtEur(spentToday())} €) – keine weiteren Bestellungen`);
      }
    }
    // Kauflimit des Shops (live bei Amazon gesehen: „Die Mengenbegrenzung für diesen Verkäufer ist erreicht.“) → nicht kaufbar, melden
    if (SHOP.limitText) {
      const lt = (document.querySelector('#desktop_buybox, #buybox, #rightCol') || document.body).innerText || '';
      if (SHOP.limitText.test(lt)) {
        if (Date.now() - (S.get('limitAlertAt') || 0) > 6 * 3600e3) {
          S.set('limitAlertAt', Date.now());
          notify(`QuickBuy ${SHOP.name}`, 'Kauflimit erreicht – Kauf nicht möglich');
          discord('error', `**${SHOP.name} meldet ein Kauflimit** („Mengenbegrenzung erreicht“) – mit diesem Konto kann der Artikel gerade nicht gekauft werden.`);
        }
        return scheduleReload('Kauflimit des Shops erreicht („Mengenbegrenzung“) – nicht kaufbar');
      }
    }
    if (isOOS()) return scheduleReload();

    if (SHOP.sellerOf && S.get('onlyOwn')) {
      const seller = SHOP.sellerOf();
      if (seller && !SHOP.ownSeller.test(seller)) return scheduleReload(`Marktplatz-Händler „${seller}“ – übersprungen`);
      if (!seller && SHOP.sellerRequired) return scheduleReload('Verkäufer nicht erkennbar – sicherheitshalber übersprungen');
    }

    const pc = priceOk();
    if (!pc.ok) return scheduleReload(pc.msg);
    if (pc.msg) log(pc.msg, 'info');
    const gp = getProductPrice();
    S.set('curPrice', gp ? gp.price : 0);
    { const h1 = document.querySelector('h1, #productTitle'); S.set('curTitle', h1 ? norm(h1.innerText).slice(0, 60) : ''); }
    recordRestock();

    if (SHOP.alertOnly) {
      notify(`QuickBuy ${SHOP.name}`, 'Verfügbar – jetzt selbst kaufen!');
      await discord('restock', `Bei **${SHOP.name}** verfügbar${gp ? ` für **${fmtEur(gp.price)} €**` : ''} – **jetzt selbst kaufen!**`);
      recordHistory('alert');
      return stop('Verfügbar – Alarm gesendet, bitte selbst kaufen');
    }

    if (isInCart() && SHOP.stopAfterAdd && !SHOP.psFlow) {
      return stop('Produkt liegt laut Script schon im Einkaufswagen – Einkaufswagen prüfen. (Zum erneuten Hinzufügen Produkt entfernen und neu eintragen.)');
    }
    if (isInCart() && cartCountAny() === 0) {
      setInCart(false);
      log('Merker „liegt im Warenkorb“ war veraltet (Warenkorb ist leer) → lege direkt hinein', 'info');
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
    if (SHOP.declineWarranty) await uncheckAddons('Produktseite');
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
    // Button direkt vor dem Klick neu suchen (SPA kann ihn inzwischen neu gerendert haben)
    deepCache = null;
    const btnNow = findBuyButton() || btn;
    if (!btnNow || isDisabled(btnNow) || !btnNow.isConnected) {
      S.set('stage', 'product'); S.set('justAdded', false);
      return scheduleReload('Warenkorb-Button ist gerade verschwunden – neuer Versuch');
    }
    const countBefore = cartCountAny();
    clickEl(btnNow);

    const addConfirmed = () => {
      const c = cartCountAny();
      return (countBefore !== null && c !== null && c > countBefore) || ADDED_RE.test(document.body.innerText || '');
    };
    await sleep(SHOP.declineWarranty ? 700 : 1500);
    if (SHOP.declineWarranty) await declineWarranty(addConfirmed);
    // Warten, bis der Shop das Hinzufügen bestätigt (Zähler steigt oder Meldung) – sonst ist der Warenkorb evtl. noch leer
    if (!SHOP.psFlow) {
      const ok = await waitFor(() => {
        const c = cartCountAny();
        if (countBefore !== null && c !== null && c > countBefore) return `Zähler ${countBefore} → ${c}`;
        if (ADDED_RE.test(document.body.innerText || '')) return 'Bestätigung angezeigt';
        return null;
      }, 10000, 300);
      let ok2 = ok;
      // MediaMarkt/Saturn (live gesehen): solange die Seite noch nachlädt, verpufft der Klick → einmal erneut klicken.
      // Eine doppelte Menge wird im Warenkorb automatisch auf 1 korrigiert.
      if (!ok2 && SHOP.retryAdd && noHashUrl(location.href) === noHashUrl(before)) {
        const again = findBuyButton();
        if (again && !isDisabled(again)) {
          log('Klick ist nicht angekommen (Seite lud noch) – klicke erneut', 'warn');
          clickEl(again);
          ok2 = await waitFor(() => {
            const c = cartCountAny();
            if (countBefore !== null && c !== null && c > countBefore) return `Zähler ${countBefore} → ${c}`;
            if (ADDED_RE.test(document.body.innerText || '')) return 'Bestätigung angezeigt';
            return null;
          }, 12000, 300);
        }
      }
      if (ok2) log(`Hinzufügen bestätigt (${ok2})`, 'ok');
      else { log('Keine Bestätigung vom Shop gesehen – warte zur Sicherheit noch 3 s', 'warn'); await sleep(3000); }
    }
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
    // (nur echte Seitenwechsel zählen – Otto hängt z. B. nur „#oc-sheet…“ für die Hinzugefügt-Ebene an)
    const moved = await waitFor(() => noHashUrl(location.href) !== noHashUrl(before), 4000);
    if (moved && SHOP.isBasket(location.pathname)) return runBasket();
    if (moved && SHOP.isCheckout(location.pathname)) { S.set('stage', 'checkout'); return runCheckout(); }
    if (!moved || !(SHOP.isBasket(location.pathname) || SHOP.isCheckout(location.pathname))) location.href = SHOP.basketUrl;
  }

  async function restartLoop(reason, tryRemove, item) {
    log(`${reason} → starte Loop neu`);
    if (tryRemove) {
      const many = (cartCountAny() || 0) > 1;
      const rm = item ? item.remove : (many ? null : findClickable(COMMON.remove));
      if (rm) {
        clickEl(rm);
        await sleep(1500);
        const c = findClickable(COMMON.confirmRemove);
        if (c && !(item && c === item.remove)) { clickEl(c); await sleep(1500); }
        setInCart(false);
        log('Nicht lieferbaren Artikel aus dem Warenkorb entfernt', 'info');
      } else {
        log('Artikel wird nicht entfernt (Knopf nicht eindeutig) – bleibt im Warenkorb und wird nicht erneut hinzugefügt', 'warn');
      }
    }
    S.set('stage', 'product');
    scheduleReload(reason);
  }

  // Passenden Warenkorb-Eintrag zum aktuellen Produkt finden
  function findCartItem(items) {
    const key = keyOf(cur().url);
    const title = (S.get('curTitle') || '').toLowerCase().slice(0, 25);
    // zuerst über die Artikelnummer im Link (eindeutig), erst dann über den Titel
    return (key && key.length >= 5 && items.find((it) => (it.href || it.box.innerHTML).toLowerCase().includes(key)))
      || items.find((it) => title && it.title.toLowerCase().includes(title)) || null;
  }

  function targetInCartGeneric() {
    const key = keyOf(cur().url);
    const main = (document.querySelector('main') || document.body);
    if (key && key.length >= 5 && main.innerHTML.toLowerCase().includes(key)) return true;
    const title = (S.get('curTitle') || '').toLowerCase();
    return !!title && pageText().toLowerCase().includes(title.slice(0, 25));
  }

  // Container des Zielprodukts im Warenkorb (für Shops ohne eigene Warenkorb-Erkennung)
  function targetCartBox() {
    const key = keyOf(cur().url);
    const title = (S.get('curTitle') || '').toLowerCase().slice(0, 25);
    const main = document.querySelector('main') || document.body;
    let anchor = null;
    if (key && key.length >= 5) anchor = [...main.querySelectorAll('a[href]')].find((a) => a.href.toLowerCase().includes(key));
    if (!anchor && title) anchor = [...main.querySelectorAll('a, h2, h3, h4, p, span')].find((e) => e.childElementCount < 4 && norm(e.innerText || '').toLowerCase().includes(title));
    if (!anchor) return null;
    let n = anchor;
    for (let i = 0; i < 12 && n && n !== main; i++) {
      n = n.parentElement;
      if (!n || n === main || norm(n.innerText || '').length > 4000) break;
      if ([...n.querySelectorAll('button, a, [role="button"]')].some((b) => COMMON.remove.some((r) => r.test(elText(b)) || r.test(b.getAttribute('aria-label') || '')))) return n;
    }
    return null;
  }

  function wrongItemStop() {
    // Erster Fehlversuch: Shop war evtl. nur zu langsam → einmal erneut versuchen
    if (!S.get('addRetry')) {
      S.set('addRetry', 1); setInCart(false);
      log('Produkt noch nicht im Warenkorb – Shop war evtl. zu langsam, versuche es einmal erneut', 'warn');
      S.set('stage', 'product');
      later(2500, () => { if (S.get('running')) { S.set('navAt', Date.now()); location.href = cur().url; } });
      return;
    }
    S.set('addRetry', 0);
    notify(`QuickBuy ${SHOP.name}`, 'Gesuchtes Produkt NICHT im Warenkorb – gestoppt, bitte prüfen');
    discord('error', 'Gesuchtes Produkt ist **nicht im Warenkorb** – Script gestoppt. Bitte Warenkorb prüfen.');
    return stop('Zielprodukt nicht im Warenkorb gefunden (evtl. falscher Artikel hinzugefügt) – bitte Warenkorb prüfen');
  }

  async function runBasket() {
    if (SHOP.basketRedirect && SHOP.basketRedirect(location.pathname)) {
      log('Zwischenseite nach dem Hinzufügen → öffne Einkaufswagen', 'info');
      location.href = SHOP.basketUrl;
      return;
    }
    log(`Warenkorb geladen (${location.pathname})`, 'info');
    const justAdded = S.get('justAdded');
    S.set('justAdded', false);

    // Warten bis der Warenkorb wirklich geladen ist (MediaMarkt lädt langsam nach)
    if (SHOP.cartReady) {
      const ready = await waitFor(() => SHOP.cartReady(), 60000, 300);   // MediaMarkt-Warenkorb brauchte live bis zu 30 s
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
        return readdNow('Produkt nicht mehr im Warenkorb');   // wurde extern entfernt / Merker war veraltet
      }
      setInCart(true); S.set('addRetry', 0);

      // Bezahlte Zusatzleistungen (PlusGarantie, Einrichtung …) abwählen
      await uncheckAddons('Warenkorb');

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
      const itemPrice = item.unitPrice ? item.unitPrice * Math.max(1, item.qty) : parsePrice(norm(item.box.innerText));
      if (maxP && itemPrice && itemPrice / Math.max(1, item.qty) > maxP) {
        log(`Preis im Warenkorb ${fmtEur(itemPrice)} € > Max ${fmtEur(maxP)} € – entferne Artikel`, 'err');
        discord('error', `Preis im Warenkorb **${fmtEur(itemPrice)} €** über Limit **${fmtEur(maxP)} €** – Artikel entfernt.`);
        return restartLoop('Preis im Warenkorb über Limit', true, item);
      }

      // Weitere Artikel im Warenkorb? Optional automatisch entfernen, sonst bei Auto-Bestellung nicht riskieren
      let others = SHOP.cartItems().filter((it) => it.box !== (item && item.box));
      if (others.length && S.get('removeOthers')) {
        for (let round = 0; round < 6 && others.length; round++) {
          const o = others[0];
          if (!o.remove) break;
          log(`Entferne fremden Artikel aus dem Warenkorb: ${o.title.slice(0, 50)}`, 'buy');
          clickEl(o.remove);
          await sleep(1500);
          const c = findClickable(COMMON.confirmRemove);
          if (c && c !== o.remove && !(item && item.box.contains(c))) { clickEl(c); await sleep(1500); }
          await sleep(800);
          item = findCartItem(SHOP.cartItems());
          if (!item) return restartLoop('Zielprodukt nach dem Aufräumen nicht mehr im Warenkorb', false);
          others = SHOP.cartItems().filter((it) => it.box !== item.box);
        }
        if (!others.length) log('Warenkorb aufgeräumt – nur noch das Zielprodukt drin ✔', 'ok');
      }
      // FNAC: ein nicht lieferbarer Artikel im Warenkorb blockiert den Weg zur Kasse
      if (SHOP.unavailBlocks) {
        const bad = others.filter((o) => SHOP.unavailBlocks.test(o.box.innerText || ''));
        if (bad.length) {
          const names = bad.map((o) => o.title.slice(0, 40)).join(', ');
          discord('error', `Im Warenkorb liegt ein nicht lieferbarer Artikel (${names}) – damit lässt ${SHOP.name} nicht zur Kasse. **Bitte entfernen und selbst weitermachen.**`);
          notify(`QuickBuy ${SHOP.name}`, `Nicht lieferbarer Artikel blockiert die Kasse: ${names}`);
          return stop(`Nicht lieferbarer Artikel im Warenkorb blockiert die Kasse: ${names} – bitte entfernen`);
        }
      }
      if (others.length) {
        const names = others.map((o) => o.title.slice(0, 40)).join(', ');
        if (S.get('autoOrder')) {
          discord('error', `Warenkorb enthält weitere Artikel (${names}) – Auto-Bestellung abgebrochen.`);
          return stop(`Warenkorb enthält weitere Artikel: ${names} – bitte entfernen`);
        }
        log(`Achtung: weitere Artikel im Warenkorb: ${names}`, 'warn');
      }

      // Nur den Eintrag des Zielprodukts auf "nicht verfügbar" prüfen
      const hit = oosIn(item.box.innerText);
      if (hit) {
        // Artikel bleibt im Warenkorb (wird NICHT entfernt und NICHT erneut hinzugefügt) – weiter beobachten
        return restartLoop(`Im Warenkorb noch „${hit}“`, false);
      }
    } else {
      await uncheckAddons('Warenkorb');
      if (!targetInCartGeneric()) {
        if (justAdded) return wrongItemStop();
        return readdNow('Produkt nicht mehr im Warenkorb');
      }
      setInCart(true); S.set('addRetry', 0);
      {
        const c = cartCountAny();
        const want = SHOP.qtyInput ? Math.max(1, Number(cur().qty) || 1) : 1;
        if (c !== null && c > want) {
          log(`Warenkorb-Zähler zeigt ${c} Artikel – evtl. liegen fremde Artikel drin (Gesamtsummen-Prüfung schützt trotzdem)`, 'warn');
          if (S.get('autoOrder') && Date.now() - (S.get('othersAlertAt') || 0) > 3600e3) {
            S.set('othersAlertAt', Date.now());
            discord('error', `Warenkorb bei ${SHOP.name} zeigt **${c} Artikel** – bitte prüfen, ob dort fremde Artikel liegen.`);
          }
        }
      }
      const box = targetCartBox();
      if (box) {
        const hit = oosIn(box.innerText);
        if (hit) {
          const rm = [...box.querySelectorAll('button, a, [role="button"]')].find((b) => COMMON.remove.some((r) => r.test(elText(b)) || r.test(b.getAttribute('aria-label') || '')));
          return restartLoop(`Warenkorb meldet „${hit}“`, true, { remove: rm || null });
        }
      } else {
        const oos = cartOosText();
        const c = cartCountAny();
        if (oos && c !== null && c > 1) log(`Warenkorb meldet „${oos}“ – steht vermutlich bei einem anderen Artikel, wird ignoriert`, 'warn');
        else if (oos) return restartLoop(`Warenkorb meldet „${oos}“`, true);
      }
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
    S.set('stage', 'checkout'); S.set('payOk', false);
    // Direkt zur Übersicht springen (Versand-Schritt überspringen) – Lieferadresse/Zahlung sind im Konto gespeichert.
    // Fehlt etwas, leitet der Shop selbst auf den passenden Schritt um und der normale Ablauf übernimmt.
    if (SHOP.directSummary && !S.get('skipDirect') && SHOP.host.test(location.hostname)) {
      log('Warenkorb ok → direkt zur Übersicht', 'buy');
      location.href = SHOP.directSummary();
      return;
    }
    log('Warenkorb ok → Zur Kasse', 'buy');
    clickEl(btn);
    // Viele Shops (z. B. MediaMarkt) wechseln zur Kasse, ohne die Seite neu zu laden → hier selbst weitermachen
    const inCheckout = await waitFor(() => SHOP.isCheckout(location.pathname), 10000, 250);
    if (inCheckout) return runCheckout();
  }

  // Script dachte, der Artikel liegt schon im Warenkorb – stimmt nicht (mehr) → ohne Pause zurück und hinzufügen
  function readdNow(msg) {
    setInCart(false);
    log(`${msg} → sofort zurück zur Produktseite und hinzufügen`, 'buy');
    S.set('stage', 'product'); S.set('justAdded', false); S.set('navAt', Date.now());
    location.href = cur().url;
  }

  function backToBasket(msg) {
    S.set('stage', 'basket'); log(`${msg} → zurück zum Warenkorb`);
    location.href = SHOP.basketUrl;
  }

  const NEXT_STEP = [/^(zahlungsart|auswahl|lieferart)\s+übernehmen$/i, /^übernehmen$/i, /^weiter$/i, /^weiter\s+zur\s+(zahlung|zahlungsart|übersicht|bestellübersicht|prüfung)$/i,
    /^zur\s+(bestellübersicht|übersicht|zahlung)$/i, /^weiter\s+zum\s+(bezahlen|nächsten\s+schritt)$/i, /^bestellung\s+prüfen$/i];

  let checkoutRunning = false;
  async function runCheckout() {
    if (checkoutRunning) return; checkoutRunning = true;
    try { return await runCheckoutInner(); } finally { checkoutRunning = false; }
  }
  async function runCheckoutInner() {
    await sleep(2000);
    const oos = cartOosText();
    if (oos) return backToBasket(`Kasse meldet „${oos}“`);
    const wantPay = S.get('payMethod') !== 'default' && PAY[S.get('payMethod')] && PAY[S.get('payMethod')].re;

    // Mehrstufige Kasse: Zahlungsart wählen, "Weiter" klicken, bis der Bestell-Button da ist
    let btn = null;
    const deadline = Date.now() + 90000;
    log(`Kasse: Seite ${location.pathname}`, 'info');
    let lastPathSeen = location.pathname;
    let lastNext = null; let lastNextAt = 0; let nextTries = 0; let nextPath = ''; let payChangeTries = 0;
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
      if (location.pathname !== lastPathSeen) { lastPathSeen = location.pathname; log(`Kasse: Seite ${lastPathSeen}`, 'info'); }
      // Shops, bei denen die Karte auf der Seite eingegeben werden muss (FNAC Pro): hier anhalten, nie selbst bezahlen
      if (SHOP.manualPay && SHOP.manualPay.at()) {
        await sleep(1500);
        try { SHOP.manualPay.prepare(); } catch (e) {}
        const pb = document.querySelector('[data-testid="summaryPaymentBtn"]');
        if (pb) { pb.style.outline = '4px solid #e60000'; pb.scrollIntoView({ block: 'center' }); }
        const total = getTotalPrice();
        if (S.get('dryRun')) return stop('🧪 Probelauf erfolgreich – bis zur Zahlungsseite ✔ (Artikel bitte wieder aus dem Warenkorb nehmen)');
        notify(`QuickBuy ${SHOP.name}`, `Zahlungsseite erreicht – ${SHOP.manualPay.msg}!`);
        discord('checkout', `Artikel liegt bereit${total ? ` (Gesamt ${fmtEur(total)} €)` : ''} – jetzt nur noch **${SHOP.manualPay.msg}**!`);
        return stop(`Zahlungsseite erreicht – ${SHOP.manualPay.msg}`);
      }
      const f = findClickable(SHOP.finalOrder);
      if (f && !isDisabled(f)) {
        // Zahlungsseite wurde übersprungen (Shop merkt sich die letzte Zahlungsart) → auf der Übersicht prüfen
        // Letzte Kontrolle IMMER auf der Übersicht: dort steht, womit wirklich bezahlt wird
        // (live gesehen: Auswahl im Zahlungsfenster ohne „Zahlungsmethode auswählen“ blieb unwirksam)
        if (wantPay && SHOP.summaryPay) {
          const want = PAY[S.get('payMethod')];
          await sleep(800);
          const t = SHOP.summaryPay.text();
          if (t && want.re.test(t) && !NEW_PAY.test(t)) {
            if (!S.get('payOk') || payChangeTries) log(`Zahlungsart auf der Übersicht bestätigt: ${want.label} („${t.slice(0, 50)}“)`, 'info');
            S.set('payOk', true);
          } else if (t) S.set('payOk', false);
          if (t && !S.get('payOk') && payChangeTries < 2) {
            const c = SHOP.summaryPay.change();
            if (c) {
              payChangeTries++;
              log(`Übersicht zeigt andere Zahlungsart („${(t || '?').slice(0, 50)}“) → ändere auf ${want.label}`, 'buy');
              clickEl(c); await sleep(2500); continue;
            }
          } else if (!S.get('payOk')) {
            log(`Zahlungsart auf der Übersicht: „${(t || 'nicht lesbar').slice(0, 60)}“`, 'warn');
          }
        }
        btn = f; break;
      }
      const n = (SHOP.nextSelector && [...document.querySelectorAll(SHOP.nextSelector)].find((x) => visible(x) && !isDisabled(x))) || findClickable(SHOP.nextStep ? NEXT_STEP.concat(SHOP.nextStep) : NEXT_STEP);
      if (n && !isDisabled(n)) {
        // Neuer Button/neue Seite → klicken. Gleicher Button auf gleicher Seite nach 6 s erneut (Klick wurde ignoriert)
        const samePage = n === lastNext && location.pathname === nextPath;
        if (!samePage) nextTries = 0;
        if (!samePage || (Date.now() - lastNextAt > 6000 && nextTries < 5)) {
          nextTries++;
          log(`Kasse: „${elText(n)}“${nextTries > 1 ? ` (Versuch ${nextTries})` : ''} auf ${location.pathname}`, 'buy');
          lastNext = n; lastNextAt = Date.now(); nextPath = location.pathname;
          n.scrollIntoView({ block: 'center' });
          await sleep(300);
          clickEl(n);
          await sleep(2500);
          continue;
        }
      }
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

    {
      const amount = getTotalPrice() || Number(S.get('curPrice')) || 0;
      const bb = budgetBlock(amount);
      if (bb) return budgetStop(bb, btn);
      S.set('curTotal', amount);
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
    prepay:   { label: 'Vorkasse / Überweisung', re: /vorkasse|(?<!direkt)überweisung/i },
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
  // (live PlayStation: gespeicherte Karten stehen nur als „****5822 Standardzahlungsmethode“ da – Marke nur als Logo)
  const ANY_PAY = /visa|mastercard|kreditkarte|rechnung|klarna|paypal|vorkasse|überweisung|lastschrift|ratenkauf|raten|apple\s*pay|google\s*pay|sofort|[*•·]{2,}\s*\d{4}/i;
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
    if (pb && ANY_PAY.test(pb.text)) {
      // Stehen mehrere Zahlungsarten im Bereich (Auswahlliste ohne erkennbare Markierung), ist unklar, welche gewählt ist
      const kinds = Object.values(PAY).filter((v) => v.re && v.re.test(pb.text)).length;
      if (kinds > 1) return null;
      return want.re.test(pb.text);
    }
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
    const confirmBtn = (SHOP.payConfirmSelector && [...document.querySelectorAll(SHOP.payConfirmSelector)].find((x) => visible(x) && !isDisabled(x)))
      || findClickable([/^(übernehmen|bestätigen|auswählen|speichern|fertig)$/i, /^zahlungs(methode|art)\s+(auswählen|übernehmen|bestätigen|speichern)$/i]);
    if (confirmBtn) { clickEl(confirmBtn); await sleep(1500); }
    if (paySelected(want) === true) return { ok: true, msg: `Zahlungsart gewählt: ${want.label}` };
    // Zahlungsfenster auf der Übersicht ist nach dem Bestätigen zu → dort steht jetzt die gewählte Zahlungsart
    if (SHOP.summaryPay) {
      await sleep(800);
      const t = SHOP.summaryPay.text();
      if (t && want.re.test(t) && !NEW_PAY.test(t)) return { ok: true, msg: `Zahlungsart gewählt: ${want.label} (Übersicht: „${t.slice(0, 40)}“)` };
    }
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
          {
            const amount = i.total || Number(S.get('curPrice')) || 0;
            const bb = budgetBlock(amount);
            if (bb) return budgetStop(bb, b2);
            S.set('curTotal', amount);
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
    let brake = '';
    if (!S.get('captchaSince')) {
      S.set('captchaSince', Date.now());
      const f = capRecord(SHOP_ID);
      const who = SHOP.rateGroup ? RATE_GROUPS[SHOP.rateGroup].name : SHOP.name;
      brake = ` Ab jetzt prüft ${who} ${String(f).replace('.', ',')}× langsamer (geht nach 24 Std. ohne Captcha stufenweise zurück).`;
      log(`Captcha-Bremse: ${who} prüft jetzt ${String(f).replace('.', ',')}× langsamer`, 'warn');
    }
    const last = S.get('captchaAt') || 0;
    if (Date.now() - last > 30 * 60000) {                       // höchstens alle 30 Min. erinnern
      S.set('captchaAt', Date.now());
      notify(`QuickBuy ${SHOP.name}`, 'Captcha – bitte im Tab lösen, danach geht es automatisch weiter');
      discord('error', `**Captcha bei ${SHOP.name}** – bitte im offenen Tab lösen. Das Script wartet und macht danach automatisch weiter.${brake}`);
    }
    log('Captcha erkannt – warte, bis es gelöst ist (wird nie automatisch gelöst)', 'warn');
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (!S.get('running')) { clearInterval(iv); return; }
      if (!captchaPresent()) {
        clearInterval(iv);
        S.set('captchaSince', 0);
        S.set('slowUntil', Date.now() + 60 * 60000);               // 1 Std. langsamer prüfen
        log('Captcha weg ✔ – prüfe die nächste Stunde langsamer, damit der Shop nicht erneut sperrt', 'ok');
        setTimeout(() => { S.set('navAt', Date.now()); location.href = cur().url || location.href; }, 2500);
      } else if (Date.now() - (S.get('captchaSince') || t0) > 3 * 3600000) {
        clearInterval(iv); S.set('captchaSince', 0);
        discord('error', `Captcha bei ${SHOP.name} seit 3 Std. nicht gelöst – Script gestoppt.`);
        stop('Captcha seit 3 Std. nicht gelöst – gestoppt');
      } else if (Date.now() - t0 > 15 * 60000) {
        // Sperre ist oft nach einer Weile von selbst weg → Seite einmal neu laden
        clearInterval(iv);
        log('Captcha noch da – lade die Seite neu (Sperre ist oft von selbst weg)', 'info');
        S.set('navAt', Date.now()); location.href = cur().url || location.href;
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
    if (PREFLIGHT) return runPreflight();
    renderPanel();
    if (!S.get('running')) return;
    busy = true;
    if (otherOwner()) return retireTab('Shop läuft schon in einem anderen Tab');
    if (centralOK(SHOP_ID) && S.get('stage') === 'product' && !S.get('loginWait')) {
      const hit = S.get('cHit');
      if (!(hit && Date.now() - hit.at < 60000)) return park('Prüf-Zentrum prüft im Hintergrund – dieser Tab wartet auf einen Treffer');
    }
    claimOwner();
    if (captchaPresent()) return handleCaptcha();
    if (queuePresent()) return handleQueue();
    if (S.get('queueSince')) queuePassed();
    const path = location.pathname;
    const stage = S.get('stage');

    // Shop-Fehlerseite (z. B. Amazon: „Artikel nicht mehr über den gewählten Anbieter erhältlich“) → nicht hängen bleiben, von vorne
    if (SHOP.failText && stage !== 'product' && stage !== 'done' && SHOP.failText.test(pageText())) {
      log('Shop meldet „Ein Problem ist aufgetreten / nicht mehr erhältlich“ → starte von vorne', 'warn');
      setInCart(false); S.set('justAdded', false); S.set('stage', 'product');
      S.set('burstUntil', Date.now() + 3 * 60000);   // Angebote flackern bei Drops oft → 3 Min. alle ~8 s prüfen
      return scheduleReload('Artikel beim Hinzufügen/Bezahlen nicht mehr erhältlich – prüfe 3 Min. schneller');
    }

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
    if (stage === 'checkout' && SHOP.isCheckout(path)) return runCheckout();
    // Shops ohne automatische Kasse (z. B. FNAC Pro): Warenkorb/Kasse nie anfassen
    if (SHOP.stopAfterAdd && (SHOP.isBasket(path) || SHOP.isCheckout(path))) return;
    if (SHOP.isBasket(path)) {
      if (stage === 'checkout') { log(`Shop hat von der Kasse zurück zum Warenkorb geleitet (${path})`, 'warn'); S.set('skipDirect', true); }
      return runBasket();
    }
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
    #qb-panel .qb-ver{font-size:10px;color:#6b6e78}
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
    if (STANDALONE) return;
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
        <span class="qb-title">🛒 QuickBuy</span><span class="qb-shop">${SHOP.name}</span><span class="qb-ver">v${(typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '?'}</span>
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
      S.set('loginWait', 0); S.set('loginAlerted', false); S.set('addRetry', 0);
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

  /* ---------- Captcha-Schutz: gemeinsames Abruf-Limit + dauerhafte Bremse nach Captchas ---------- */
  const RATE_GROUPS = { mms: { name: 'MediaMarkt + Saturn', def: 4 } };
  const BOOST_STEPS = [1, 1.5, 2, 3];
  const capKey = (id) => (SHOPS[id] && SHOPS[id].rateGroup) || id;
  function capInfo(id) {
    const s = G.get(`cap:${capKey(id)}`, null) || { lvl: 0, last: 0, hits: [] };
    // je 24 Std. ohne Captcha eine Stufe zurück
    const lvl = Math.max(0, (s.lvl || 0) - Math.floor((Date.now() - (s.last || 0)) / 86400e3));
    const hits = (s.hits || []).filter((t) => Date.now() - t < 7 * 86400e3);
    return { lvl, factor: BOOST_STEPS[lvl], hits, h24: hits.filter((t) => Date.now() - t < 86400e3).length };
  }
  function capRecord(id) {
    const i = capInfo(id);
    const lvl = Math.min(BOOST_STEPS.length - 1, i.lvl + 1);
    G.set(`cap:${capKey(id)}`, { lvl, last: Date.now(), hits: [...i.hits, Date.now()].slice(-50) });
    return BOOST_STEPS[lvl];
  }
  function groupLimit(g) { const v = G.get(`rateMax:${g}`, null); return v === null || v === undefined || v === '' ? RATE_GROUPS[g].def : Math.max(0, Number(v) || 0); }
  // Shops der Gruppe, die gerade wirklich prüfen
  function groupShops(g) {
    return SHOP_IDS().filter((id) => SHOPS[id].rateGroup === g && gv(id, 'running', false) && gv(id, 'products', []).length
      && (centralOK(id) || Date.now() - (gv(id, 'heartbeat', 0) || 0) < 60000));
  }
  // Sekunden zwischen zwei Runden (eine Runde = jedes Produkt einmal prüfen) – inkl. Gruppen-Limit und Captcha-Bremse
  function effRoundSec(id) {
    const sh = SHOPS[id];
    let base = Math.max(sh.minInterval || 5, Number(gv(id, 'intervalSec', 15)) || 15);
    const g = sh.rateGroup; const lim = g ? groupLimit(g) : 0;
    if (lim > 0) {
      const ids = groupShops(g); if (!ids.includes(id)) ids.push(id);
      base = Math.max(base, (60 * ids.reduce((a, x) => a + gv(x, 'products', []).length, 0)) / lim);
    }
    base *= capInfo(id).factor;
    if (Date.now() < (gv(id, 'slowUntil', 0) || 0)) base *= 2;      // direkt nach einem Captcha 1 Std. zusätzlich langsamer
    return base;
  }
  /* ---------- Prüf-Zentrum ----------
   * Ein einziger Tab (das Dashboard, sonst ein Shop-Tab) prüft alle Shops im Hintergrund. Shop-Tabs öffnen sich erst bei einem
   * Treffer, legen in den Warenkorb, gehen zur Kasse und schließen sich danach wieder. Bei Problemen (Captcha, Seite nicht
   * lesbar) öffnet sich der Shop-Tab zur Kontrolle; klappt es 3× hintereinander nicht, prüft der Shop 6 Std. im eigenen Tab. */
  const centralCapable = (id) => !!(SHOPS[id] && SHOPS[id].bgCheck && !SHOPS[id].shopify && !SHOPS[id].internal);
  const dropOn = (id) => { const t = Date.parse(gv(id, 'dropAt', '') || ''); const now = Date.now(); return !isNaN(t) && now >= t - 3 * 60000 && now <= t + 20 * 60000; };
  // Drop-Modus läuft weiter im eigenen Tab (schnelle Abfragen + frische Anmeldung)
  function centralOK(id) { return !!G.get('central', true) && centralCapable(id) && !gv(id, 'dryRun', false) && Date.now() >= (gv(id, 'centralOff', 0) || 0) && !dropOn(id); }
  const ownerFresh = (id) => { const o = gv(id, 'owner', null); return !!(o && Date.now() - o.at < 15000); };
  // Ein Shop-Tab kümmert sich gerade (Treffer, Captcha, Warenkorb, Kasse) → das Prüf-Zentrum wartet so lange
  function handledByTab(id) {
    const hitAge = Date.now() - ((gv(id, 'cHit', null) || {}).at || 0);
    if (hitAge < 30000) return true;                 // Shop-Tab öffnet sich gerade
    if (!ownerFresh(id)) return false;
    if (String(gv(id, 'stage', 'product')) !== 'product') return true;
    if (gv(id, 'captchaSince', 0) || gv(id, 'queueSince', 0) || gv(id, 'loginWait', 0)) return true;
    return hitAge < 120000;
  }
  function gmFetch(url, anon) {
    return new Promise((res) => {
      try {
        GM_xmlhttpRequest({ method: 'GET', url, timeout: 20000, anonymous: !!anon, headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
          onload: (r) => res(r), onerror: () => res(null), ontimeout: () => res(null), onabort: () => res(null) });
      } catch (e) { res(null); }
    });
  }
  async function centralStatus(id, url) {
    let anon = !!gv(id, 'cAnon', false);
    let r = await gmFetch(url, anon);
    // HTTP 400/431: manche Shops (z. B. Otto) lehnen die Anfrage mit allen Cookies ab → ohne Cookies wiederholen und merken.
    // Für den Lagerstatus ist keine Anmeldung nötig.
    if (r && (r.status === 400 || r.status === 431) && !anon) {
      const r2 = await gmFetch(url, true);
      if (r2 && r2.status >= 200 && r2.status < 300) { sv(id, 'cAnon', true); anon = true; r = r2; }
    }
    if (!r) return { st: 'err', why: 'keine Antwort' };
    if (r.status === 404 || r.status === 410) return { st: 'out' };
    const html = String(r.responseText || '');
    const captcha = html.length < 80000 && /captcha-delivery\.com|px-captcha|cf-chl-|\/errors\/validateCaptcha/i.test(html);
    if (r.status === 403 || r.status === 429 || captcha) return { st: 'block', why: captcha ? 'Captcha' : `HTTP ${r.status}` };
    if (r.status < 200 || r.status >= 300) return { st: 'err', why: `HTTP ${r.status}` };
    if (r.finalUrl && keyOf2(id, r.finalUrl) !== keyOf2(id, url)) return { st: 'err', why: 'Weiterleitung' };
    let v = null; try { v = parseStock(SHOPS[id], html, (k) => gv(id, k)); } catch (e) {}
    return v ? { st: v, html } : { st: 'err', why: 'Lagerstatus nicht lesbar' };
  }
  // Treffer → Shop-Tab übernimmt (Bereitschafts-Tab im Hintergrund, sonst neuer Tab)
  function centralHit(id, i, msg, type) {
    const it = gv(id, 'products', [])[i]; if (!it) return;
    sv(id, 'idx', i); sv(id, 'stage', 'product'); sv(id, 'navAt', Date.now()); sv(id, 'owner', null);
    sv(id, 'cHit', { at: Date.now(), url: it.url });
    pushLog(id, msg, type);
    const open = () => { if (!ownerFresh(id)) openTab(it.url); };
    if (Date.now() - (gv(id, 'parkBeat', 0) || 0) < 6000) later(1500, open); else open();
  }
  async function centralCheck(id, i) {
    const list = gv(id, 'products', []); const it = list[i]; if (!it) return;
    const tag = `[${i + 1}/${list.length} ${shortName(it.url)}]`;
    const t0 = Date.now();
    const r = await centralStatus(id, it.url);
    sv(id, 'cBeat', Date.now());
    if (!gv(id, 'running', false) || handledByTab(id)) return;
    // Abruf klappt und kein Tab hängt im Captcha → alten Captcha-Merker löschen (sonst bleibt „Captcha“ stehen)
    if ((r.st === 'out' || r.st === 'in') && gv(id, 'captchaSince', 0) && !ownerFresh(id)) sv(id, 'captchaSince', 0);
    if (r.st === 'out') { sv(id, 'cFails', 0); pushLog(id, `${tag} OOS (Prüf-Zentrum, ${Date.now() - t0} ms)`, 'oos'); return; }
    if (r.st === 'in') {
      sv(id, 'cFails', 0);
      const bp = bgPrice(r.html); const mx = Number(it.maxPrice) || 0;
      if (bp && mx && bp > mx * 1.02) { pushLog(id, `${tag} verfügbar, aber ${fmtEur(bp)} € > Max ${fmtEur(mx)} €`, 'oos'); return; }
      // Schon 2× „verfügbar“ gemeldet, aber die Shop-Seite sagte „nicht kaufbar“ → 10 Min. nur jede 5. Meldung nachsehen
      { const fh = (gv(id, 'falseHits', {}) || {})[keyOf2(id, it.url)];
        if (fh && fh.n >= 2 && Date.now() - fh.at < 600000 && (gv(id, 'attempts', 0) || 0) % 5) {
          pushLog(id, `${tag} Abruf meldet verfügbar, Shop-Seite zuletzt ${fh.n}× nicht kaufbar → nächste Kontrolle später`, 'oos'); return;
        } }
      return centralHit(id, i, `${tag} Prüf-Zentrum: verfügbar! → Shop-Tab legt in den Warenkorb`, 'ok');
    }
    const f = (gv(id, 'cFails', 0) || 0) + 1; sv(id, 'cFails', f);
    if (f >= 3) {
      sv(id, 'cFails', 0); sv(id, 'centralOff', Date.now() + 6 * 3600e3);
      pushLog(id, `Prüf-Zentrum klappt bei ${SHOPS[id].name} gerade nicht (${r.why}) → prüft 6 Std. wieder im eigenen Tab`, 'warn');
      return;
    }
    centralHit(id, i, `${tag} Prüf-Zentrum: ${r.why} → öffne Shop-Tab zur Kontrolle`, 'warn');
  }
  const cBusy = {}; const cMode = {}; let cLastTick = 0;
  function centralTick() {
    const now = Date.now();
    const slept = cLastTick && now - cLastTick > 60000; cLastTick = now;
    for (const id of SHOP_IDS()) {
      if (!gv(id, 'running', false)) { delete cMode[id]; continue; }
      const list = gv(id, 'products', []); if (!list.length) continue;
      const central = centralOK(id);
      if (slept && central) pushLog(id, `Prüf-Zentrum hat geschlafen (${Math.round((now - (gv(id, 'cBeat', 0) || now)) / 60000)} Min. ohne Prüfung) – Dashboard-Tab im Browser auf „immer aktiv“ stellen`, 'warn');
      // Shop wechselt in den eigenen Tab (Drop-Modus oder Zentrale klappt nicht) → Tab bereitstellen
      if (cMode[id] === true && !central && !tabOpen(id)) { pushLog(id, 'Prüft jetzt im eigenen Tab', 'info'); openTab(list[gv(id, 'idx', 0) % list.length].url); }
      cMode[id] = central;
      if (!central || cBusy[id] || handledByTab(id)) continue;
      if (ownerFresh(id)) {      // ein Tab prüft noch selbst / hängt nach einem Treffer → abmelden, Zentrale übernimmt
        sv(id, 'owner', null); sv(id, 'kick', now);
      }
      const step = Math.max(2000, (effRoundSec(id) * 1000) / list.length);
      if (now - (gv(id, 'cLast', 0) || 0) < step) continue;
      sv(id, 'cLast', now);
      const i = (gv(id, 'cIdx', 0) || 0) % list.length;
      sv(id, 'cIdx', i + 1);
      if (i === list.length - 1) {
        const r = (gv(id, 'attempts', 0) || 0) + 1; sv(id, 'attempts', r);
        const mx = Number(gv(id, 'maxAttempts', 0)) || 0;
        if (mx > 0 && r >= mx) { sv(id, 'running', false); pushLog(id, `Gestoppt: Maximale Runden (${mx}) erreicht`, 'warn'); continue; }
      }
      cBusy[id] = true;
      centralCheck(id, i).catch((e) => console.error('[QuickBuy] Prüf-Zentrum:', e)).finally(() => { cBusy[id] = false; });
    }
  }
  // Genau ein Tab führt das Prüf-Zentrum: das Dashboard, sonst ein Shop-Tab (Absprache über GM-Storage, 6 s gültig)
  function centralLeader() {
    const now = Date.now(); const L = GM_getValue('global:centralLease', null);
    const fresh = !!(L && now - L.at < 6000);
    const mine = fresh && L.id === TAB_ID;
    if (mine || !fresh || (STANDALONE && !L.dash)) GM_setValue('global:centralLease', { id: TAB_ID, at: now, dash: !!STANDALONE });
    return mine;          // nach der Übernahme erst im nächsten Durchgang handeln (gleichzeitiger Zugriff)
  }
  let centralStarted = false;
  function startCentral() {
    if (centralStarted) return; centralStarted = true;
    const t = () => later(1000, () => { try { if (centralLeader()) centralTick(); } catch (e) { console.error('[QuickBuy] Prüf-Zentrum:', e); } t(); });
    t();
  }

  // Abrufe pro Minute (ungefähr) – für die Anzeige im Dashboard
  function ratePerMin(ids) { return ids.reduce((a, id) => a + (gv(id, 'products', []).length * 60) / Math.max(1, effRoundSec(id)), 0); }
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
    sv(id, 'cLast', 0); sv(id, 'cIdx', 0); sv(id, 'cFails', 0); sv(id, 'centralOff', 0); sv(id, 'cHit', null);
    if (!tabOpen(id) && !centralOK(id)) { sv(id, 'heartbeat', Date.now()); openTab(list[0].url); }   // Herzschlag vorstellen: Wächter gibt dem neuen Tab 2,5 Min.
    return true;
  }
  // Tampermonkey-Tab (wird nicht vom Popup-Blocker gestoppt, auch bei "Alle starten")
  function openTab(url, active) {
    // #qb-auto markiert Tabs, die das Script selbst öffnet → darf sie später auch wieder schließen
    const u = url === DASH_URL ? url : `${String(url).split('#')[0]}#qb-auto`;
    try { GM_openInTab(u, { active: !!active, insert: true, setParent: true }); } catch (e) { window.open(u, '_blank'); }
  }
  function dashStop(id) { sv(id, 'running', false); sv(id, 'stage', 'product'); sv(id, 'dryRun', false); pushLog(id, 'Gestoppt: vom Dashboard', 'warn'); }

  /* ---------- Export / Import ---------- */
  function exportAll() {
    const data = {};
    for (const k of GM_listValues()) if (!/:heartbeat$|^global:botToken$/.test(k)) data[k] = GM_getValue(k);
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
    #qb-dash{--bg:#0a0b0f;--s1:#111319;--s2:#161922;--s3:#1d212c;--bd:#232733;--bd2:#2e3342;--tx:#e9ebf1;--mu:#8a90a2;--ac:#6d8bff;--ac2:#8a5cff;
      --gr:#34d399;--rd:#f43f5e;--am:#f59e0b;--pu:#a78bfa;
      position:fixed;inset:0;z-index:2147483647;overflow:auto;background:var(--bg);color:var(--tx);
      font:13px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
    #qb-dash *{box-sizing:border-box}
    #qb-dash ::-webkit-scrollbar{width:10px;height:10px}#qb-dash ::-webkit-scrollbar-thumb{background:#262a36;border-radius:10px;border:2px solid var(--bg)}
    #qb-dash a{color:var(--tx);text-decoration:none}#qb-dash a:hover{color:#fff;text-decoration:underline}
    #qb-dash .app{display:grid;grid-template-columns:236px minmax(0,1fr);min-height:100vh}
    /* Seitenleiste */
    #qb-dash .nav{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:4px;padding:18px 12px;background:linear-gradient(180deg,#0f1117,#0b0c11);border-right:1px solid var(--bd)}
    #qb-dash .brand{display:flex;align-items:center;gap:10px;padding:4px 8px 16px}
    #qb-dash .brand .lg{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;font-size:18px;background:linear-gradient(135deg,var(--ac),var(--ac2));box-shadow:0 6px 20px rgba(109,139,255,.35)}
    #qb-dash .brand b{display:block;font-size:15px;letter-spacing:.2px}#qb-dash .brand small{color:var(--mu);font-size:11px}
    #qb-dash .tb{all:unset;display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:9px;color:#aeb3c2;font-weight:600;font-size:13px;cursor:pointer}
    #qb-dash .tb:hover{background:var(--s2);color:#fff}
    #qb-dash .tb.act{background:linear-gradient(90deg,rgba(109,139,255,.18),rgba(109,139,255,.04));color:#fff;box-shadow:inset 2px 0 0 var(--ac)}
    #qb-dash .tb .ic{width:20px;text-align:center}
    #qb-dash .tb .nb{margin-left:auto;font-size:10.5px;font-weight:700;background:var(--s3);color:#cfd3df;border-radius:999px;padding:1px 7px}
    #qb-dash .nav-sec{margin:18px 10px 6px;font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#5f6578}
    #qb-dash .mini{display:flex;flex-direction:column;gap:2px;overflow:auto;min-height:0}
    #qb-dash .mi{display:flex;align-items:center;gap:8px;padding:5px 10px;border-radius:8px;font-size:12px;color:#c3c7d3;cursor:pointer}
    #qb-dash .mi:hover{background:var(--s2)}
    #qb-dash .mi .mt{margin-left:auto;font-size:10.5px;color:var(--mu)}
    #qb-dash .nav-foot{margin-top:auto;padding:12px 10px 0;border-top:1px solid var(--bd);font-size:11.5px;color:var(--mu);display:flex;align-items:center;gap:6px}
    #qb-dash .live i{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--gr);margin-right:5px;box-shadow:0 0 0 0 rgba(52,211,153,.6);animation:qbpulse 2s infinite}
    @keyframes qbpulse{0%{box-shadow:0 0 0 0 rgba(52,211,153,.55)}70%{box-shadow:0 0 0 7px rgba(52,211,153,0)}100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}}
    /* Hauptbereich */
    #qb-dash .mainc{min-width:0;display:flex;flex-direction:column}
    #qb-dash .hdr{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:12px;padding:16px 28px;background:rgba(10,11,15,.82);backdrop-filter:blur(10px);border-bottom:1px solid var(--bd)}
    #qb-dash h1{all:unset;display:block;font-size:20px;font-weight:800;letter-spacing:-.2px}
    #qb-dash .sub{color:var(--mu);font-size:12px;margin-top:1px}
    #qb-dash .d-body{padding:22px 28px 40px;max-width:1500px;width:100%}
    #qb-dash .sp{flex:1}
    #qb-dash h3{all:unset;display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px;margin:24px 0 10px}
    #qb-dash h3 .muted{font-weight:500}
    #qb-dash .muted{color:var(--mu);font-size:12px}
    #qb-dash .red{color:#ff7a90}#qb-dash .green{color:var(--gr)}
    /* Buttons & Eingaben */
    #qb-dash button{font:600 12.5px Inter,system-ui,sans-serif;border:1px solid var(--bd2);border-radius:9px;padding:7px 12px;cursor:pointer;background:var(--s2);color:#d9dce6;transition:background .12s,border-color .12s,transform .05s}
    #qb-dash button:hover{background:var(--s3);border-color:#3a4052}
    #qb-dash button:active{transform:translateY(1px)}
    #qb-dash button:disabled{opacity:.45;cursor:default}
    #qb-dash button.go{background:linear-gradient(180deg,#3be3a2,#22c08a);border-color:transparent;color:#05261a}
    #qb-dash button.stop{background:linear-gradient(180deg,#ff5d74,#e23a55);border-color:transparent;color:#fff}
    #qb-dash button.big{padding:10px 18px;font-size:13.5px;border-radius:11px;box-shadow:0 6px 18px rgba(0,0,0,.35)}
    #qb-dash button.sm{padding:5px 10px;font-size:12px}
    #qb-dash button.lnk{background:none;border:0;padding:0 4px;color:var(--ac);font-weight:600}
    #qb-dash button.x2{background:none;border-color:transparent;color:#8a90a2;padding:4px 8px}
    #qb-dash button.x2:hover{color:#ff7a90;background:rgba(244,63,94,.1)}
    #qb-dash input[type=text],#qb-dash input[type=password],#qb-dash input[type=time],#qb-dash input[type=datetime-local],#qb-dash select{background:#0d0f14;border:1px solid var(--bd2);color:#fff;border-radius:9px;padding:8px 10px;font:12.5px Inter,system-ui,sans-serif;outline:none;color-scheme:dark;min-width:0}
    #qb-dash input:focus,#qb-dash select:focus{border-color:var(--ac);box-shadow:0 0 0 3px rgba(109,139,255,.18)}
    #qb-dash input.cell{width:84px;padding:5px 8px;text-align:right;background:transparent;border-color:transparent}
    #qb-dash input.cell:hover{border-color:var(--bd2)}#qb-dash input.cell:focus{background:#0d0f14}
    #qb-dash input.cell.c{width:56px;text-align:center}
    #qb-dash input[type=checkbox]{accent-color:var(--ac);width:15px;height:15px;cursor:pointer}
    #qb-dash textarea{width:100%;height:160px;background:#0d0f14;border:1px solid var(--bd2);color:#fff;border-radius:9px;padding:8px;font:11px ui-monospace,Consolas,monospace}
    #qb-dash .tog{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:600;cursor:pointer;padding:5px 9px;border-radius:999px;background:var(--s2);border:1px solid var(--bd2)}
    #qb-dash .tog.on{border-color:rgba(244,63,94,.6);background:rgba(244,63,94,.12);color:#ffb3c0}
    #qb-dash .sw{width:30px;height:17px;border-radius:999px;background:#3a3f4f;position:relative;flex:none}
    #qb-dash .sw::after{content:'';position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:#fff;transition:.15s}
    #qb-dash .tog.on .sw{background:var(--rd)}#qb-dash .tog.on .sw::after{left:15px}
    /* Karten / Panels */
    #qb-dash .panel{background:var(--s1);border:1px solid var(--bd);border-radius:14px}
    #qb-dash .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:18px}
    #qb-dash .kpi{position:relative;overflow:hidden;background:linear-gradient(180deg,var(--s1),#0f1117);border:1px solid var(--bd);border-radius:14px;padding:14px 16px}
    #qb-dash .kpi::before{content:'';position:absolute;inset:0 0 auto 0;height:2px;background:var(--kc,var(--ac));opacity:.85}
    #qb-dash .kl{font-size:11.5px;color:var(--mu);font-weight:600;display:flex;align-items:center;gap:6px}
    #qb-dash .kv{font-size:26px;font-weight:800;letter-spacing:-.5px;margin-top:4px;font-variant-numeric:tabular-nums}
    #qb-dash .kv span{font-size:14px;color:var(--mu);font-weight:600;margin-left:4px}
    #qb-dash .ks{font-size:11.5px;color:var(--mu);margin-top:2px}
    #qb-dash .meter{height:6px;border-radius:99px;background:#22263a;margin-top:8px;overflow:hidden}
    #qb-dash .meter i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--gr),#a3e635)}
    #qb-dash .meter.hi i{background:linear-gradient(90deg,var(--am),var(--rd))}
    #qb-dash .cols{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:start}
    @media (max-width:1250px){#qb-dash .cols{grid-template-columns:1fr}}
    /* Achtung */
    #qb-dash .att{background:linear-gradient(180deg,rgba(245,158,11,.10),rgba(245,158,11,.03));border:1px solid rgba(245,158,11,.35);border-radius:14px;padding:12px 14px;margin-bottom:18px}
    #qb-dash .atth{display:flex;align-items:center;gap:8px;font-weight:800;color:#fcd34d;margin-bottom:6px}
    #qb-dash .atth .lnk{margin-left:auto}
    #qb-dash .atti{font-size:12.5px;padding:5px 0;border-top:1px dashed rgba(245,158,11,.18)}
    #qb-dash .atti.t-err{color:#ffb3c0}
    /* Produkt hinzufügen */
    #qb-dash .add{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px;background:var(--s1);border:1px solid var(--bd);border-radius:14px}
    #qb-dash .add input[type=text]{flex:1 1 280px}
    #qb-dash .hint{min-height:18px;font-size:12px;color:var(--mu);margin:6px 4px 0}
    #qb-dash .hint.ok{color:var(--gr)}#qb-dash .hint.bad{color:#ff7a90}
    /* Shop-Karten */
    #qb-dash .shops{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px}
    #qb-dash .sh{background:var(--s1);border:1px solid var(--bd);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;transition:border-color .15s}
    #qb-dash .sh:hover{border-color:var(--bd2)}
    #qb-dash .sh.s-on{border-color:rgba(52,211,153,.35);box-shadow:0 0 0 1px rgba(52,211,153,.08),0 10px 30px -18px rgba(52,211,153,.5)}
    #qb-dash .sh.s-buy{border-color:rgba(109,139,255,.55)}
    #qb-dash .sh.s-warn{border-color:rgba(245,158,11,.45)}#qb-dash .sh.s-queue{border-color:rgba(167,139,250,.5)}
    #qb-dash .sh-top{display:flex;align-items:center;gap:10px}
    #qb-dash .logo{width:34px;height:34px;flex:none;border-radius:10px;display:grid;place-items:center;font-weight:800;font-size:14px;color:#fff}
    #qb-dash .shn{font-weight:800;font-size:14px}
    #qb-dash .shs{font-size:11.5px;color:var(--mu)}
    #qb-dash .pill{margin-left:auto;flex:none;font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;background:var(--s3);color:var(--mu)}
    #qb-dash .p-on{background:rgba(52,211,153,.14);color:var(--gr)}#qb-dash .p-buy{background:rgba(109,139,255,.16);color:#a9b9ff}
    #qb-dash .p-warn{background:rgba(245,158,11,.15);color:#fcd34d}#qb-dash .p-queue{background:rgba(167,139,250,.16);color:var(--pu)}
    #qb-dash .badges{display:flex;gap:6px;flex-wrap:wrap;min-height:0}
    #qb-dash .b{font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:6px;background:var(--s3);color:#c3c7d3}
    #qb-dash .b.red{background:rgba(244,63,94,.15);color:#ff8ea2}#qb-dash .b.warn{background:rgba(245,158,11,.15);color:#fcd34d}
    #qb-dash .shl{font-size:12px;color:#b9bdca;background:#0d0f14;border:1px solid var(--bd);border-left:3px solid #3a3f4f;border-radius:9px;padding:7px 9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #qb-dash .shl.t-ok{border-left-color:var(--gr)}#qb-dash .shl.t-err{border-left-color:var(--rd)}#qb-dash .shl.t-warn{border-left-color:var(--am)}#qb-dash .shl.t-buy{border-left-color:var(--ac)}
    #qb-dash .shl .ago{color:#6b7184;font-size:11px;margin-left:4px}
    #qb-dash .sha{display:flex;gap:6px}#qb-dash .sha button{flex:1}
    /* Tabellen */
    #qb-dash table{width:100%;border-collapse:collapse;font-size:12.5px}
    #qb-dash td,#qb-dash th{padding:9px 12px;text-align:left;border-bottom:1px solid var(--bd)}
    #qb-dash th{color:#7d8396;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.5px;background:#0e1016;white-space:nowrap}
    #qb-dash td.r,#qb-dash th.r{text-align:right}#qb-dash td.c,#qb-dash th.c{text-align:center}
    #qb-dash .pt{background:var(--s1);border:1px solid var(--bd);border-radius:14px;overflow:hidden;border-collapse:separate;border-spacing:0}
    #qb-dash .pt tbody tr{transition:background .1s}#qb-dash .pt tbody tr:hover{background:#151821}
    #qb-dash .pt tbody tr:last-child td{border-bottom:0}
    #qb-dash .pt tr.cur{background:rgba(52,211,153,.06)}#qb-dash .pt tr.cur td:first-child{box-shadow:inset 3px 0 0 var(--gr)}
    #qb-dash .pt td{vertical-align:middle}
    #qb-dash .pn{max-width:380px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #qb-dash .tag{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;background:var(--s3);color:#d2d6e2;white-space:nowrap}
    #qb-dash .st{font-size:11.5px;font-weight:700;white-space:nowrap}
    #qb-dash .st.on{color:var(--gr)}#qb-dash .st.wait{color:#a9b9ff}#qb-dash .st.off{color:#6b7184}
    #qb-dash .set td{padding:8px 10px}
    #qb-dash .set th{white-space:normal;line-height:1.3;vertical-align:bottom}
    #qb-dash .set input[type=datetime-local]{width:200px}
    #qb-dash .set select{max-width:200px}
    #qb-dash .scroll{overflow-x:auto;border-radius:14px}
    #qb-dash .cols > *{min-width:0}
    #qb-dash .howto{margin-top:8px;font-size:12.5px;color:#c3c7d3;background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:10px 14px}
    #qb-dash .howto summary{cursor:pointer;font-weight:700;color:#fff}
    #qb-dash .howto ol{margin:8px 0 2px 18px;padding:0;line-height:1.75}
    #qb-dash .howto code,#qb-dash .cmds code{background:#0d0f14;border:1px solid var(--bd);border-radius:5px;padding:0 5px;font-size:11.5px}
    #qb-dash .cmds{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:4px 16px;font-size:12px;color:#aeb3c2;margin-top:8px}
    #qb-dash .d-body > h3:first-child{margin-top:0}
    /* Leisten, Chips, leere Zustände */
    #qb-dash .bar{display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
    #qb-dash .chip{font-size:12px;background:var(--s2);border:1px solid var(--bd2);border-radius:999px;padding:4px 11px;color:#c3c7d3}
    #qb-dash .chip b{color:#fff}
    #qb-dash .empty{padding:18px;color:#6b7184;font-size:12.5px;text-align:center}
    #qb-dash .empty.big{padding:46px 20px;font-size:13px;background:var(--s1);border:1px dashed var(--bd2);border-radius:14px}
    #qb-dash .dcg{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;background:var(--s1);border:1px solid var(--bd);border-radius:14px;padding:14px}
    #qb-dash .dcg input[type=text]#d-wh{flex:1 1 420px}
    #qb-dash .ck{font-size:12.5px;display:inline-flex;gap:7px;align-items:center;cursor:pointer}
    /* Feed */
    #qb-dash .feed{display:flex;flex-direction:column;background:var(--s1);border:1px solid var(--bd);border-radius:14px;overflow:hidden}
    #qb-dash .feed.tall{max-height:none}
    #qb-dash .fe{display:grid;grid-template-columns:auto auto minmax(0,1fr);gap:10px;align-items:baseline;font-size:12.5px;padding:8px 12px;border-bottom:1px solid #191c25}
    #qb-dash .fe:last-child{border-bottom:0}
    #qb-dash .fe .s{font-weight:700;font-size:10.5px;background:var(--s3);border-radius:5px;padding:1px 6px;white-space:nowrap}
    #qb-dash .fe .t{color:#6b7184;font-size:11px;font-variant-numeric:tabular-nums}
    #qb-dash .fe .m{min-width:0;word-break:break-word;color:#c9cdd8}
    #qb-dash .fe.t-ok .m{color:#6ee7b7}#qb-dash .fe.t-err .m{color:#ff8ea2}#qb-dash .fe.t-warn .m{color:#fcd34d}#qb-dash .fe.t-oos .m{color:#7d8396}#qb-dash .fe.t-buy .m{color:#b7c4ff}
    #qb-dash .aside h3:first-child{margin-top:0}
    #qb-dash .aside .fe{grid-template-columns:auto minmax(0,1fr);font-size:12px}
    #qb-dash .aside .fe .s{grid-column:1}#qb-dash .aside .fe .t{display:none}
    /* Statistik */
    #qb-dash .hm{overflow:auto;background:var(--s1);border:1px solid var(--bd);border-radius:14px;padding:12px;margin-bottom:6px}
    #qb-dash .hm table{border-collapse:separate;border-spacing:3px;font-size:11px;width:auto}
    #qb-dash .hm th{color:#7d8396;font-weight:600;padding:0 4px;text-align:center;background:none;border:0;text-transform:none;letter-spacing:0}
    #qb-dash .hm th:first-child{width:30px}
    #qb-dash .hm td{width:28px;height:26px;border-radius:6px;text-align:center;color:#fff;border:0;padding:0}
    #qb-dash .stl{background:#0d0f14;border:1px solid var(--bd);border-radius:10px;padding:10px 14px;margin:8px 0;line-height:1.8}
    /* Toast */
    #qb-dash .toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:9;background:#171a23;border:1px solid var(--bd2);border-radius:12px;padding:11px 15px;font-size:12.5px;box-shadow:0 18px 50px rgba(0,0,0,.6);animation:qbin .18s ease-out}
    @keyframes qbin{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
    @media (max-width:900px){
      #qb-dash .app{grid-template-columns:1fr}
      #qb-dash .nav{position:static;height:auto;flex-direction:row;flex-wrap:wrap;align-items:center;padding:10px}
      #qb-dash .brand{padding:0 8px 0 0}#qb-dash .nav-sec,#qb-dash .mini,#qb-dash .nav-foot{display:none}
      #qb-dash .hdr,#qb-dash .d-body{padding-left:14px;padding-right:14px}
    }
  `;
  const DICON = { ok: '✅', err: '⛔', warn: '⚠️', oos: '💤', buy: '🛒', info: 'ℹ️' };
  function dashToast(msg) {
    const d = document.getElementById('qb-dash'); if (!d) return;
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; d.appendChild(t);
    setTimeout(() => t.remove(), 4500);
  }
  // 📊 in einem Shop-Tab → eigenen Dashboard-Tab öffnen (oder Hinweis, wenn schon offen)
  function openStandaloneDashboard() {
    if (Date.now() - (GM_getValue('global:dashBeat', 0) || 0) < 6000) {
      alert('Das QuickBuy-Dashboard ist bereits in einem anderen Tab geöffnet.\n\n(Adresse: ' + DASH_URL + ')');
      return;
    }
    openTab(DASH_URL, true);
  }
  function openDashboard() {
    if (!STANDALONE) return openStandaloneDashboard();
    if (window.top !== window) return;
    if (document.getElementById('qb-dash')) return;
    if (!document.getElementById('qb-dash-css')) {
      addCss(DASH_CSS, 'qb-dash-css');
    }
    const d = document.createElement('div'); d.id = 'qb-dash'; d.className = 'page'; document.body.appendChild(d);
    renderDash(true);
    setInterval(() => { if (!document.hidden) renderDash(false); }, 1500);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderDash(false); });
  }
  function closeDashboard() { if (STANDALONE) window.close(); }

  let dashTab = 'home';
  let logShop = 'all'; let logImportant = false;
  // Amazon läuft nur auf amazon.de: Links aus anderen Amazon-Ländern (amazon.fr, .it, .es, .com …) → amazon.de/dp/<ASIN>
  function amazonToDe(u) {
    const m = String(u || '').match(/^https?:\/\/(?:www\.)?amazon\.(?!de\/)[a-z.]{2,6}\/(?:[^?#]*\/)?(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    return m ? `https://www.amazon.de/dp/${m[1].toUpperCase()}` : null;
  }
  function shopOfUrl(url) { return SHOP_IDS().find((id) => SHOPS[id].productUrl.test(url)) || null; }
  // einmalig beim Dashboard-Start: vorhandene Amazon-Produkte anderer Länder umstellen (Duplikate fallen weg)
  function migrateAmazonDe() {
    const l = gv('amazon', 'products', []); let n = 0; const seen = new Set(); const out = [];
    for (const x of l) {
      const de = amazonToDe(x.url); if (de) { x.url = de; n++; }
      const k = keyOf2('amazon', x.url); if (seen.has(k)) continue; seen.add(k); out.push(x);
    }
    if (n || out.length !== l.length) { sv('amazon', 'products', out); pushLog('amazon', `${n} Amazon-Link(s) aus anderen Ländern auf amazon.de umgestellt`, 'warn'); }
  }
  function attentionItems() {
    const dismissed = GM_getValue('global:dismissed', 0);
    const out = [];
    for (const id of SHOP_IDS()) {
      for (const e of logFor(id).slice(0, 15)) {
        const isNeed = /kasse erreicht|bitte selbst|anmeldung klappt nicht|manuell|nicht bestätigt|über limit|nicht im warenkorb|weitere artikel|nicht angemeldet|verfügbar – alarm|schlafen gelegt|captcha-bremse|prüf-zentrum klappt|prüf-zentrum hat geschlafen/i.test(e.msg);
        if (!(e.type === 'err' || (e.type === 'warn' && isNeed) || isNeed)) continue;
        if (/gestoppt:\s*(manuell|vom dashboard)|probelauf erfolgreich/i.test(e.msg)) continue;   // selbst gestoppt = kein Problem
        if (!e.at || e.at <= dismissed || Date.now() - e.at > 3 * 3600e3) continue;
        out.push({ ...e, id });
      }
    }
    return out.slice(0, 6);
  }

  /* ---------- Selbsttest (Dashboard) ---------- */
  function selfTest() {
    const rows = [];
    for (const id of SHOP_IDS()) {
      const list = gv(id, 'products', []); const run = gv(id, 'running', false);
      if (!list.length && !run) continue;
      const p = [];
      const dg = gv(id, 'diag', null);
      if (run) {
        const cen = centralOK(id) && !handledByTab(id);
        if (cen && Date.now() - (gv(id, 'cBeat', 0) || 0) > 300000) p.push('Prüf-Zentrum prüft nicht (Dashboard zu oder eingeschlafen?)');
        if (!cen && Date.now() - (gv(id, 'heartbeat', 0) || 0) > 180000) p.push('Tab reagiert nicht');
        if (gv(id, 'captchaSince', 0)) p.push('Captcha offen');
        { const sl = (gv(id, 'sleeps', []) || []).filter((t) => Date.now() - t < 86400e3).length; if (sl) p.push(`Tab ${sl}× schlafen gelegt (24 Std.)`); }
        { const ci = capInfo(id); if (ci.h24) p.push(`${ci.h24}× Captcha (24 Std.)`); }
        if (gv(id, 'queueSince', 0)) p.push('in der Warteschlange');
        if (!dg && !cen) p.push('noch keine Produktprüfung');
        else {
          if (Date.now() - dg.t > 3600e3) p.push(`letzte Produktprüfung vor ${Math.round((Date.now() - dg.t) / 60000)} Min.`);
          if ((gv(id, 'diagBad', 0) || 0) >= 3) p.push('Produktseite wird nicht erkannt');
          else if (!dg.title) p.push('Produkttitel nicht erkannt');
        }
      }
      if ((gv(id, 'loggedOut', 0) || 0) >= 2) p.push('vermutlich abgemeldet');
      let txt;
      if (!run) txt = 'gestoppt';
      else if (p.length) txt = p.join(', ');
      else txt = `ok – Titel ✔ · Preis ${dg.price ? '✔' : '–'} · ${dg.btn ? 'kaufbar' : (dg.oosText || dg.ld === 'out') ? 'ausverkauft erkannt' : 'kein Button (gilt als ausverkauft)'}`;
      rows.push({ id, run, ok: !p.length, text: txt });
    }
    const b = Number(G.get('budgetDay', 0)) || 0;
    return { rows, budget: b ? `Heute ${fmtEur(spentToday())} € von ${fmtEur(b)} € ausgegeben` : `Heute ${fmtEur(spentToday())} € ausgegeben (kein Tagesbudget)` };
  }
  function selfTestText(r) {
    if (!r.rows.length) return 'Keine Shops mit Produkten eingetragen.';
    return r.rows.map((x) => `${!x.run ? '⏸️' : x.ok ? '✅' : '⚠️'} **${SHOPS[x.id].name}:** ${x.text}`).join('\n') + `\n💶 ${r.budget}`;
  }
  function reportTick() {
    if (!G.get('reportOn', true)) return;
    const now = new Date();
    const key = now.toDateString();
    if (G.get('reportDay', '') === key) return;
    const [hh, mm] = String(G.get('reportTime', '09:00')).split(':').map(Number);
    if (now.getHours() * 60 + now.getMinutes() < (hh || 0) * 60 + (mm || 0)) return;
    G.set('reportDay', key);
    const r = selfTest();
    if (!r.rows.length) return;
    discord('report', selfTestText(r), { title: '', shop: 'Alle Shops' });
  }

  /* ---------- Abgestürzte Shop-Tabs neu öffnen ---------- */
  let watchLast = 0; let watchGrace = 0;
  function watchdog() {
    const now = Date.now();
    if (watchLast && now - watchLast > 60000) watchGrace = now + 90000;   // war selbst eingeschlafen → 90 s Schonfrist
    watchLast = now;
    if (now < watchGrace) return;
    if (!G.get('autoReopen', true)) return;
    for (const id of SHOP_IDS()) {
      if (!gv(id, 'running', false)) continue;
      const list = gv(id, 'products', []); if (!list.length) continue;
      if (centralOK(id) && !handledByTab(id)) continue;          // Prüf-Zentrum prüft – kein Tab nötig
      if (Date.now() - (gv(id, 'heartbeat', 0) || 0) < 150000) continue;      // 2,5 Min. kein Lebenszeichen (Herzschlag läuft im Worker, wird nicht gedrosselt)
      if (Date.now() - (gv(id, 'reopenAt', 0) || 0) < 600000) continue;       // höchstens alle 10 Min.
      sv(id, 'reopenAt', Date.now()); sv(id, 'stage', 'product');
      sv(id, 'owner', null);
      openTab(list[gv(id, 'idx', 0) % list.length].url);
      pushLog(id, 'Tab reagierte 2,5 Min. nicht (geschlafen/abgestürzt) – vom Dashboard neu geöffnet', 'warn');
      discord('error', `Der Tab von **${SHOPS[id].name}** reagierte nicht mehr (vom Browser schlafen gelegt oder abgestürzt) und wurde neu geöffnet. Tipp: Shop-Seiten im Browser auf „immer aktiv“ stellen – Anleitung im Dashboard unter Einstellungen.`, { title: '', shop: SHOPS[id].name });
    }
  }

  /* ---------- Radar: neue Listungen in Suche/Kategorie ---------- */
  function gmGet(url) {
    return new Promise((res, rej) => {
      try {
        GM_xmlhttpRequest({
          method: 'GET', url, timeout: 25000, headers: { Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
          onload: (r) => (r.status >= 200 && r.status < 300 ? res(r.responseText || '') : rej(new Error(`HTTP ${r.status}`))),
          onerror: () => rej(new Error('nicht erreichbar (Tampermonkey-Erlaubnis?)')),
          ontimeout: () => rej(new Error('Zeitüberschreitung')),
        });
      } catch (e) { rej(e); }
    });
  }
  function radarShop(url) { try { const h = new URL(url).hostname; return SHOP_IDS().find((x) => !SHOPS[x].shopify && SHOPS[x].host.test(h)) || null; } catch (e) { return null; } }
  function radarIsProduct(id, u) {
    if (!id) return SHOPS.shopify.productUrl.test(u);
    if (!SHOPS[id].productUrl.test(u)) return false;
    if (SHOPS[id].genericUrl) {
      const path = new URL(u).pathname;
      return /\d{5,}|\/(p|product|produkt|products|artikel|dp|item)\/|\.html?$/i.test(path)
        && !/\/(search|suche|kategorie|category|c|brand|marke|marken|service|hilfe|help|account|konto|cart|warenkorb|checkout|filiale|stores?)\//i.test(path);
    }
    return true;
  }
  const safeDecode = (u) => { try { return decodeURIComponent(u); } catch (e) { return u; } };
  async function radarScan(w) {
    const base = new URL(w.url);
    const id = radarShop(w.url);
    const items = new Map();
    const add = (u, t) => {
      let abs;
      try { abs = stripUrl(new URL(String(u).replace(/\\\//g, '/'), base).href); } catch (e) { return; }
      try { if (new URL(abs).hostname !== base.hostname) return; } catch (e) { return; }
      if (!radarIsProduct(id, abs)) return;
      const prev = items.get(abs);
      if (prev === undefined || (t && t.length > prev.length)) items.set(abs, t || prev || '');
    };
    if (!id) {   // Shopify-Shop: offizielle Produktliste
      try {
        const j = JSON.parse(await gmGet(`${base.origin}/products.json?limit=250`));
        for (const pr of j.products || []) items.set(`${base.origin}/products/${pr.handle}`, norm(pr.title || ''));
      } catch (e) { /* kein Shopify → normale Seite lesen */ }
    }
    if (!items.size) {
      const html = await gmGet(w.url);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      for (const a of doc.querySelectorAll('a[href]')) add(a.getAttribute('href'), norm(a.textContent).slice(0, 140));
      for (const m of html.matchAll(/"((?:https?:)?(?:\\?\/){2}[^"\s<>]{4,300}|\\?\/[^"\s<>]{4,300})"/g)) add(m[1], '');
    }
    const words = norm(w.kw).toLowerCase().split(' ').filter(Boolean);
    const all = [...items].map(([url, title]) => ({ url, title }));
    return { total: all.length, items: all.filter((x) => !words.length || words.every((wd) => (x.title + ' ' + safeDecode(x.url)).toLowerCase().includes(wd))) };
  }
  let radarBusy = false;
  async function radarTick(forceId) {
    if (radarBusy) return; radarBusy = true;
    try {
      const list = G.get('radar', []);
      const w = forceId ? list.find((x) => x.id === forceId) : list.find((x) => Date.now() - (x.lastAt || 0) >= Math.max(2, Number(x.every) || 5) * 60000);
      if (!w) return;
      const upd = (fn) => { const l = G.get('radar', []); const x = l.find((y) => y.id === w.id); if (x) { fn(x); G.set('radar', l); } };
      let res;
      try { res = await radarScan(w); } catch (e) { upd((x) => { x.lastAt = Date.now(); x.err = e.message || String(e); }); return; }
      const wasSeeded = !!w.seeded;
      const seen = new Set(w.seen || []);
      const fresh = res.items.filter((x) => !seen.has(x.url));
      upd((x) => {
        x.lastAt = Date.now(); x.lastN = res.items.length; x.total = res.total;
        x.err = res.total ? '' : 'Keine Produkt-Links gefunden – der Shop lädt die Liste evtl. erst im Browser nach';
        x.seen = [...new Set([...(x.seen || []), ...res.items.map((i) => i.url)])].slice(-3000);
        if (!x.seeded) x.seeded = true;
      });
      if (!wasSeeded || !fresh.length) return;
      const hits = G.get('radarHits', []);
      const shopName = w.shopId ? SHOPS[w.shopId].name : new URL(w.url).hostname.replace(/^www\./, '');
      for (const f of fresh.slice(0, 10)) hits.unshift({ t: Date.now(), url: f.url, title: f.title || shortName(f.url), shop: shopName, kw: w.kw });
      G.set('radarHits', hits.slice(0, 100));
      const lines = fresh.slice(0, 8).map((f) => `• [${(f.title || shortName(f.url)).replace(/[[\]*_`]/g, '').slice(0, 80)}](${f.url})`).join('\n');
      notify('QuickBuy – neu gelistet', `${fresh.length} neue(s) Produkt(e) bei ${shopName}`);
      discord('listing', `${fresh.length} neue(s) Produkt(e)${w.kw ? ` für „${w.kw}“` : ''}:\n${lines}`, { title: shopName, url: w.url, shop: shopName });
      if (document.getElementById('qb-dash')) dashToast(`🆕 ${fresh.length} neu gelistet bei ${shopName}`);
    } finally { radarBusy = false; }
  }

  /* ---------- Export der Bestellungen (CSV, z. B. für die Buchhaltung) ---------- */
  function exportCsv() {
    const h = GM_getValue('global:history', []).filter((x) => x.result === 'success' || x.result === 'unclear');
    if (!h.length) { dashToast('Noch keine Bestellungen zum Exportieren.'); return; }
    const q = (v) => `"${String(v === undefined || v === null ? '' : v).replace(/"/g, '""')}"`;
    const num = (n) => (Number(n) ? Number(n).toFixed(2).replace('.', ',') : '');
    const rows = [['Datum', 'Uhrzeit', 'Shop', 'Produkt', 'Bestellnummer', 'Artikelpreis (EUR)', 'Gesamt (EUR)', 'Zahlungsart', 'Ergebnis', 'Link']];
    for (const x of h.slice().reverse()) {
      const d = new Date(x.ts);
      rows.push([d.toLocaleDateString('de-DE'), d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), x.shop, x.title, x.orderNo || '',
        num(x.price), num(x.total || x.price), x.pay || '', x.result === 'success' ? 'gekauft' : 'unklar', x.url]);
    }
    const csv = '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `quickbuy-bestellungen-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    dashToast(`${h.length} Bestellung(en) als CSV exportiert`);
  }

  /* ---------- Statistik ---------- */
  let statShop = 'all';
  const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  function statsHtml() {
    const all = GM_getValue('global:restocks', []);
    const shopsWith = [...new Set(all.map((r) => r.shopId))].filter((id) => SHOPS[id]);
    const rs = statShop === 'all' ? all : all.filter((r) => r.shopId === statShop);
    const grid = DOW.map(() => Array(24).fill(0));
    const byHour = Array(24).fill(0);
    for (const r of rs) { const d = new Date(r.t); grid[(d.getDay() + 6) % 7][d.getHours()]++; byHour[d.getHours()]++; }
    const max = Math.max(1, ...grid.flat());
    const top = grid.flatMap((row, di) => row.map((n, h) => ({ n, di, h }))).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 5);
    const sel = `<select id="st-shop"><option value="all">Alle Shops (${all.length})</option>${shopsWith.map((id) => `<option value="${id}" ${statShop === id ? 'selected' : ''}>${esc(SHOPS[id].name)} (${all.filter((r) => r.shopId === id).length})</option>`).join('')}</select>`;
    if (!rs.length) return `<div class="bar">${sel}</div><div class="empty big">Noch keine Restocks aufgezeichnet. Sobald ein überwachter Artikel verfügbar wird, erscheint er hier – mit Wochentag und Uhrzeit.</div>`;
    return `<div class="bar">${sel}<span class="chip">Restocks: <b>${rs.length}</b></span><span class="chip">seit <b>${new Date(rs[rs.length - 1].t).toLocaleDateString('de-DE')}</b></span></div>
      ${top.length ? `<div class="bar"><span class="muted">Häufigste Zeitfenster:</span>${top.map((x) => `<span class="chip"><b>${DOW[x.di]} ${String(x.h).padStart(2, '0')}–${String(x.h + 1).padStart(2, '0')} Uhr</b> · ${x.n}×</span>`).join('')}</div>` : ''}
      <div class="hm"><table><thead><tr><th></th>${Array.from({ length: 24 }, (_, h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
        ${grid.map((row, di) => `<tr><th>${DOW[di]}</th>${row.map((n, h) => `<td title="${DOW[di]} ${h}–${h + 1} Uhr: ${n} Restock(s)" style="background:${n ? `rgba(91,140,255,${(0.18 + 0.82 * n / max).toFixed(2)})` : '#1b1d23'}">${n || ''}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <h3>Letzte Restocks</h3>
      <table class="pt"><thead><tr><th>Wann</th><th>Shop</th><th>Produkt</th><th class="r">Preis</th></tr></thead><tbody>
        ${rs.slice(0, 30).map((r) => `<tr><td>${new Date(r.t).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td><span class="tag">${esc(SHOPS[r.shopId] ? SHOPS[r.shopId].name : r.shopId)}</span></td><td class="pn"><a href="${esc(r.url)}" target="_blank">${esc(String(r.title).slice(0, 70))}</a></td><td class="r">${r.price ? fmtEur(r.price) + ' €' : '–'}</td></tr>`).join('')}
      </tbody></table>`;
  }
  function radarHtml() {
    const list = G.get('radar', []); const hits = G.get('radarHits', []);
    const ago = (t) => (t ? `vor ${Math.max(0, Math.round((Date.now() - t) / 60000))} Min.` : 'noch nie');
    return `<h3>🆕 Neue Listungen überwachen</h3>
      <div class="add">
        <input type="text" id="r-url" placeholder="Such- oder Kategorie-URL, z. B. https://www.otto.de/suche/ps5%20pro">
        <input type="text" id="r-kw" placeholder="Stichwörter (alle müssen vorkommen)" style="width:230px;flex:none">
        <input type="text" id="r-min" placeholder="Min." value="5" title="Alle X Minuten prüfen (min. 2)" style="width:60px;flex:none">
        <button class="go" data-g="radd">Überwachen</button>
      </div>
      <div class="hint">Meldet Produkte, die neu in der Suche/Kategorie auftauchen (erste Prüfung merkt sich nur den Ist-Stand). Funktioniert, solange dieser Dashboard-Tab offen ist. Tampermonkey fragt beim ersten Abruf pro Shop nach Erlaubnis → <b>„Immer erlauben“</b>. Bei Shopify-Shops reicht die Startseite.</div>
      ${list.length ? `<table class="pt"><thead><tr><th>Seite</th><th>Stichwörter</th><th class="c">Alle</th><th>Status</th><th>Zuletzt</th><th></th></tr></thead><tbody>
        ${list.map((w) => `<tr data-rid="${esc(w.id)}"><td class="pn"><a href="${esc(w.url)}" target="_blank" title="${esc(w.url)}">${esc(w.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60))}</a></td>
          <td>${esc(w.kw || '– alle –')}</td><td class="c">${esc(w.every)} Min.</td>
          <td>${w.err ? `<span class="red">✖ ${esc(w.err)}</span>` : w.lastAt ? `✔ ${w.lastN} passende von ${w.total || w.lastN} Produkten` : '<span class="muted">wartet …</span>'}</td>
          <td class="muted">${ago(w.lastAt)}</td>
          <td class="r"><button class="sm" data-r="now" title="Jetzt prüfen">↻</button><button class="x2" data-r="del" title="Entfernen">✕</button></td></tr>`).join('')}
      </tbody></table>` : '<div class="empty">Noch keine Seite eingetragen.</div>'}
      <h3>Funde ${hits.length ? `<button class="lnk" data-g="rclear">leeren</button>` : ''}</h3>
      ${hits.length ? `<table class="pt"><thead><tr><th>Wann</th><th>Shop</th><th>Produkt</th><th></th></tr></thead><tbody>
        ${hits.slice(0, 60).map((h, i) => `<tr data-hit="${i}"><td>${new Date(h.t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td><span class="tag">${esc(h.shop)}</span></td>
          <td class="pn"><a href="${esc(h.url)}" target="_blank" title="${esc(h.url)}">${esc(String(h.title).slice(0, 80))}</a></td>
          <td class="r">${shopOfUrl(h.url) ? '<button class="sm go" data-h="add">➕ Überwachen</button>' : ''}</td></tr>`).join('')}
      </tbody></table>` : '<div class="empty">Noch keine neuen Produkte gefunden.</div>'}`;
  }

  /* ================================================================== *
   *  Discord-Befehle: ein eigener Discord-Bot liest einen Kanal mit,
   *  das Dashboard führt die Befehle aus und antwortet dort.
   * ================================================================== */
  const BOT_API = 'https://discord.com/api/v10';
  let botState = { ok: null, msg: 'aus', at: 0 };
  let botBackoff = 0; let botBusy = false; let botPending = null;
  function botReq(method, path, body) {
    const token = String(G.get('botToken', '')).trim();
    return new Promise((res) => {
      try {
        GM_xmlhttpRequest({
          method, url: BOT_API + path, timeout: 15000,
          // Discord blockt Bot-Anfragen mit Browser-Kennung teils mit Fehler 40333 → eigene Bot-Kennung mitsenden
          headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (https://github.com/windowsfenster226/fc27-tool, 3.19)' },
          data: body ? JSON.stringify(body) : undefined,
          onload: (r) => { let j = null; try { j = JSON.parse(r.responseText); } catch (e) {} res({ status: r.status, json: j }); },
          onerror: () => res({ status: 0, json: null }),
          ontimeout: () => res({ status: 0, json: null }),
        });
      } catch (e) { res({ status: 0, json: null }); }
    });
  }
  // Webhook-Infos (ohne Anmeldung abrufbar): in welchem Kanal/Server landen die Meldungen?
  function webhookInfo() {
    const url = String(dc('webhook') || '').trim();
    if (!WEBHOOK_RE.test(url)) return Promise.resolve(null);
    return new Promise((res) => {
      try {
        GM_xmlhttpRequest({ method: 'GET', url, timeout: 15000,
          onload: (r) => { let j = null; try { j = JSON.parse(r.responseText); } catch (e) {} res(r.status === 200 ? j : null); },
          onerror: () => res(null), ontimeout: () => res(null) });
      } catch (e) { res(null); }
    });
  }
  // „Verbindung testen“: prüft Token und Kanal; ist der Kanal falsch, wird die Kanal-ID des Webhooks übernommen
  async function botTest() {
    let ch = String(G.get('botChannel', '')).trim();
    if (!G.get('botToken', '')) { alert('Bitte den Bot-Token eintragen.'); return; }
    botBackoff = 0;
    const u = await botReq('GET', '/users/@me');
    if (u.status !== 200) return dashToast(`✖ ${botErr(u)}`);
    const name = u.json.username;
    let c = ch ? await botReq('GET', `/channels/${ch}`) : { status: 404, json: null };
    if (c.status !== 200) {
      const wh = await webhookInfo();
      if (wh && wh.channel_id && wh.channel_id !== ch) {
        G.set('botChannel', wh.channel_id); G.set('botLast', ''); ch = wh.channel_id;
        c = await botReq('GET', `/channels/${ch}`);
        if (c.status === 200) { botState = { ok: true, msg: 'verbunden', at: Date.now() }; renderDash(true); return dashToast(`✔ Kanal-ID war falsch – übernommen aus deinem Webhook: #${c.json.name}. Bot „${name}“ ist verbunden.`); }
        renderDash(true);
      }
      if (c.status !== 200) {
        let hint = '';
        if (wh && wh.guild_id) {
          const gq = await botReq('GET', `/guilds/${wh.guild_id}`);
          const gcode = gq.json && gq.json.code;
          if (gcode === 40333 || c.json && c.json.code === 40333) hint = ' – Discord blockt die Anfrage (Fehler 40333, keine Rechte-Frage) – bitte Claude Bescheid geben';
          else if (gq.status !== 200) hint = ' – der Bot ist NICHT auf dem Server, in den deine Meldungen gehen (Einladungslink erneut öffnen und diesen Server wählen)';
          else hint = ` – Bot ist auf „${gq.json.name}“, aber der Kanal sperrt ihn (Kanal-Rechte für den Bot speichern)`;
        }
        botState = { ok: false, msg: botErr(c), at: Date.now() }; renderDash(true);
        return dashToast(`✖ Bot „${name}“ ok, aber Kanal ${ch}: ${botErr(c)}${hint}`);
      }
    }
    botState = { ok: true, msg: 'verbunden', at: Date.now() }; renderDash(true);
    dashToast(`✔ Bot „${name}“ sieht den Kanal #${c.json.name}`);
  }

  function botErr(r) {
    if (r.status === 401) return 'Bot-Token ungültig';
    if (r.status === 403) return `Bot darf den Kanal nicht lesen/schreiben (Rechte prüfen)${r.json && r.json.code ? ` [Discord ${r.json.code}]` : ''}`;
    if (r.status === 404) return 'Kanal nicht gefunden (Kanal-ID prüfen, Bot auf dem Server?)';
    if (r.status === 0) return 'Discord nicht erreichbar (Tampermonkey-Erlaubnis?)';
    return `Discord-Fehler HTTP ${r.status}`;
  }
  async function botSend(text, replyTo) {
    const ch = String(G.get('botChannel', '')).trim();
    const parts = []; let cur2 = '';
    for (const line of String(text).split('\n')) {
      if ((cur2 + '\n' + line).length > 1900) { parts.push(cur2); cur2 = line; } else cur2 = cur2 ? cur2 + '\n' + line : line;
    }
    if (cur2) parts.push(cur2);
    for (let i = 0; i < parts.length; i++) {
      const body = { content: parts[i], allowed_mentions: { parse: [] } };
      if (replyTo && i === 0) body.message_reference = { message_id: replyTo, fail_if_not_exists: false };
      const r = await botReq('POST', `/channels/${ch}/messages`, body);
      if (r.status === 429) { await sleep(((r.json && r.json.retry_after) || 1) * 1000 + 200); i--; continue; }
      if (r.status >= 300) { botState = { ok: false, msg: botErr(r), at: Date.now() }; return false; }
    }
    return true;
  }
  const idCmp = (a, b) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0);
  async function botPoll() {
    if (!G.get('botOn', false) || botBusy || Date.now() < botBackoff) return;
    const ch = String(G.get('botChannel', '')).trim();
    if (!String(G.get('botToken', '')).trim() || !/^\d{15,22}$/.test(ch)) { botState = { ok: false, msg: 'Token oder Kanal-ID fehlt', at: Date.now() }; return; }
    botBusy = true;
    try {
      let last = G.get('botLast', '');
      if (!last || G.get('botLastCh', '') !== ch) {
        const r = await botReq('GET', `/channels/${ch}/messages?limit=1`);
        if (r.status !== 200) { botState = { ok: false, msg: botErr(r), at: Date.now() }; botBackoff = Date.now() + 30000; return; }
        last = (r.json[0] && r.json[0].id) || '0';
        G.set('botLast', last); G.set('botLastCh', ch);
        botState = { ok: true, msg: 'verbunden', at: Date.now() };
        await botSend('⚡ **QuickBuy ist verbunden.** Schreib `!hilfe` für alle Befehle.');
        return;
      }
      const r = await botReq('GET', `/channels/${ch}/messages?after=${last}&limit=20`);
      if (r.status === 429) { botBackoff = Date.now() + ((r.json && r.json.retry_after) || 5) * 1000; return; }
      if (r.status !== 200) { botState = { ok: false, msg: botErr(r), at: Date.now() }; botBackoff = Date.now() + 30000; return; }
      botState = { ok: true, msg: 'verbunden', at: Date.now() };
      const msgs = (r.json || []).slice().sort((a, b) => idCmp(a.id, b.id));
      const allowed = String(G.get('botUsers', '')).split(/[\s,;]+/).filter(Boolean);
      for (const m of msgs) {
        G.set('botLast', m.id);
        if (!m.author || m.author.bot) continue;
        const text = String(m.content || '').trim();
        if (!text && !(m.attachments || []).length && !(m.embeds || []).length && allowed.includes(m.author.id)) {
          botState = { ok: false, msg: 'Nachrichten sind leer → im Discord-Entwicklerportal „Message Content Intent“ einschalten', at: Date.now() };
          continue;
        }
        if (!/^[!?]/.test(text)) continue;
        if (!allowed.includes(m.author.id)) { await botSend('⛔ Du darfst QuickBuy nicht steuern.', m.id); continue; }
        let out;
        try { out = await botCommand(text.slice(1).trim(), m); } catch (e) { out = `⚠️ Fehler: ${e && e.message}`; console.error('[QuickBuy] Befehl:', e); }
        if (out) await botSend(out, m.id);
        renderDash(true);
      }
    } finally { botBusy = false; }
  }

  // ---- Hilfsfunktionen für Befehle ----
  const SHOP_ALIAS = { mm: 'mediamarkt', media: 'mediamarkt', ps: 'playstation', ps5: 'playstation', psdirect: 'playstation', sony: 'playstation',
    ms: 'microsoft', xbox: 'microsoft', nbb: 'notebooksbilliger', fnac: 'fnacpro', amz: 'amazon', sat: 'saturn' };
  function botShop(w) {
    const k = String(w || '').toLowerCase().replace(/[^a-z0-9äöü]/g, '');
    if (!k) return null;
    if (SHOP_ALIAS[k] && SHOPS[SHOP_ALIAS[k]]) return SHOP_ALIAS[k];
    return SHOP_IDS().find((id) => id === k) || SHOP_IDS().find((id) => SHOPS[id].name.toLowerCase().replace(/[^a-z0-9äöü]/g, '').startsWith(k)) || null;
  }
  const usedShops = () => SHOP_IDS().filter((id) => gv(id, 'products', []).length || gv(id, 'running', false));
  function botShops(arg) {
    if (/^(alle|all|\*)$/i.test(arg || '')) return usedShops();
    const id = botShop(arg); return id ? [id] : [];
  }
  const autoOn = (id) => gv(id, 'autoOrder', false) && !SHOPS[id].alertOnly && !SHOPS[id].stopAfterAdd;
  function shopStateOf(id) {
    if (!gv(id, 'running', false)) return { k: 'off', t: 'Gestoppt' };
    if (gv(id, 'captchaSince', 0) && (!centralOK(id) || ownerFresh(id))) return { k: 'warn', t: 'Captcha' };
    if (gv(id, 'queueSince', 0)) return { k: 'queue', t: 'Warteschlange' };
    if (centralOK(id) && !handledByTab(id)) {
      const n = Math.max(1, gv(id, 'products', []).length);
      const late = Date.now() - (gv(id, 'cBeat', 0) || gv(id, 'cLast', 0) || Date.now()) > Math.max(90000, (effRoundSec(id) * 3000) / n + 30000);
      return late ? { k: 'warn', t: 'Zentrale steht?' } : { k: 'on', t: 'Aktiv · Zentrale' };
    }
    { const age = Date.now() - (gv(id, 'heartbeat', 0) || 0);
      if (age > 150000) return { k: 'warn', t: 'Kein Tab' };
      if (age > 20000) return { k: 'warn', t: 'Tab schläft?' }; }
    const st = String(gv(id, 'stage', 'product'));
    if (st === 'basket' || st === 'ps-cart') return { k: 'buy', t: 'Warenkorb' };
    if (st !== 'product') return { k: 'buy', t: 'Kasse' };
    return { k: 'on', t: 'Aktiv' };
  }
  function agoText(t) {
    if (!t) return '';
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    return s < 60 ? `vor ${s} s` : s < 3600 ? `vor ${Math.round(s / 60)} Min.` : s < 86400 ? `vor ${Math.round(s / 3600)} Std.` : new Date(t).toLocaleDateString('de-DE');
  }
  const STATE_ICON = { on: '🟢', buy: '🛒', warn: '🟠', queue: '⏳', off: '⏸️' };
  const dmd = (s) => String(s || '').replace(/([*_`~|>])/g, '\\$1');
  function parseDrop(arg) {
    const a = norm(arg).toLowerCase();
    const tm = a.match(/(\d{1,2})[:.](\d{2})\s*(uhr)?$/);
    if (!tm) return null;
    const d = new Date(); d.setSeconds(0, 0);
    if (/^morgen/.test(a)) d.setDate(d.getDate() + 1);
    else if (!/^heute/.test(a)) {
      const dm = a.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?/);
      if (!dm) return null;
      const y = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : d.getFullYear();
      d.setFullYear(y, Number(dm[2]) - 1, Number(dm[1]));
    }
    d.setHours(Number(tm[1]), Number(tm[2]));
    if (isNaN(d)) return null;
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function needConfirm(m, text, fn) {
    botPending = { user: m.author.id, until: Date.now() + 90000, fn, text };
    return `${text}\n➡️ Bestätigen mit \`!ja\` (90 s gültig) – abbrechen mit \`!nein\``;
  }
  const BOT_HELP = [
    '**QuickBuy-Befehle** (Shop: z. B. `otto`, `mm`, `saturn`, `ps`, `xbox`, `fnac` oder `alle`)',
    '`!status` – Überblick aller Shops',
    '`!start <shop|alle>` · `!stop <shop|alle>`',
    '`!produkte [shop]` – überwachte Produkte mit Nummer',
    '`!add <link> [max €] [stück]` – Produkt hinzufügen (Shop wird erkannt)',
    '`!max <shop> <nr> <preis>` · `!entfernen <shop> <nr>`',
    '`!auto <shop> an|aus` – Auto-Bestellung',
    '`!zahlung <shop> karte|paypal|rechnung|vorkasse|standard`',
    '`!drop <shop> <25.11. 10:00 | morgen 9:00 | aus>`',
    '`!pause <shop> <sekunden>` – Prüfintervall',
    '`!budget [betrag|aus]` – Tagesbudget',
    '`!heute` – heutige Käufe · `!log [shop]` – letzte Meldungen',
    '`!radar` · `!radar add <such-link> [stichwörter]`',
    '`!selbsttest` · `!hilfe`',
  ].join('\n');

  async function botCommand(raw, m) {
    const [cmd0, ...rest] = raw.split(/\s+/);
    const cmd = (cmd0 || '').toLowerCase();
    const args = rest;
    const arg = rest.join(' ');
    // Bestätigung
    if (/^(ja|yes|ok|bestätigen)$/.test(cmd)) {
      if (!botPending || botPending.user !== m.author.id || Date.now() > botPending.until) { botPending = null; return 'Nichts zu bestätigen.'; }
      const p = botPending; botPending = null;
      return p.fn();
    }
    if (/^(nein|no|abbrechen)$/.test(cmd)) { const had = !!botPending; botPending = null; return had ? '❎ Abgebrochen.' : 'Nichts offen.'; }

    if (/^(hilfe|help|befehle|\?)$/.test(cmd) || cmd === '') return BOT_HELP;

    if (/^(status|s)$/.test(cmd)) {
      const ids = usedShops();
      if (!ids.length) return 'Noch keine Shops mit Produkten. Füge eins hinzu mit `!add <link> <max €>`.';
      const lines = ids.map((id) => {
        const st = shopStateOf(id); const run = gv(id, 'running', false);
        const n = gv(id, 'products', []).length;
        const last = logFor(id)[0];
        return `${STATE_ICON[st.k]} **${SHOPS[id].name}** – ${st.t}${run ? ` · Runde ${gv(id, 'attempts', 0) + 1}` : ''} · ${n} Produkt${n === 1 ? '' : 'e'}${autoOn(id) ? ' · 🔴 Auto' : ''}` +
          (last ? `\n  └ ${DICON[last.type] || ''} ${dmd(last.msg).slice(0, 110)} _(${agoText(last.at)})_` : '');
      });
      const b = Number(G.get('budgetDay', 0)) || 0;
      return `**📊 QuickBuy-Status** · ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}\n${lines.join('\n')}\n💶 Heute ${fmtEur(spentToday())} €${b ? ` von ${fmtEur(b)} € Budget` : ''}`;
    }

    if (/^(start|starten)$/.test(cmd)) {
      const ids = botShops(arg).filter((id) => !gv(id, 'running', false));
      if (!arg) return 'Welcher Shop? z. B. `!start otto` oder `!start alle`';
      const withP = ids.filter((id) => gv(id, 'products', []).length);
      if (!withP.length) return botShops(arg).length ? 'Läuft schon bzw. keine Produkte eingetragen.' : `Shop „${dmd(arg)}“ nicht erkannt.`;
      const go = () => { withP.forEach((id) => dashStart(id)); return `▶️ Gestartet: ${withP.map((id) => SHOPS[id].name).join(', ')}`; };
      const autos = withP.filter(autoOn);
      if (autos.length) return needConfirm(m, `⚠️ **Auto-Bestellung ist AN** bei: ${autos.map((id) => SHOPS[id].name).join(', ')} – es wird verbindlich bestellt.`, go);
      return go();
    }
    if (/^(stop|stopp|stoppen)$/.test(cmd)) {
      if (!arg) return 'Welcher Shop? z. B. `!stop mm` oder `!stop alle`';
      const ids = botShops(arg).filter((id) => gv(id, 'running', false));
      if (!ids.length) return botShops(arg).length ? 'Läuft gerade nicht.' : `Shop „${dmd(arg)}“ nicht erkannt.`;
      ids.forEach((id) => dashStop(id));
      return `⏹️ Gestoppt: ${ids.map((id) => SHOPS[id].name).join(', ')}`;
    }

    if (/^(produkte|p|liste)$/.test(cmd)) {
      const ids = arg ? botShops(arg) : usedShops();
      if (!ids.length) return arg ? `Shop „${dmd(arg)}“ nicht erkannt.` : 'Keine Produkte eingetragen.';
      return ids.map((id) => {
        const l = gv(id, 'products', []);
        return `**${SHOPS[id].name}**\n` + (l.length ? l.map((x, i) => `\`${i + 1}\` ${dmd(shortName(x.url)).slice(0, 70)} · max ${x.maxPrice ? fmtEur(x.maxPrice) + ' €' : '–'} · ${Number(x.qty) === 0 ? '∞' : (x.qty === undefined ? 1 : x.qty)} Stk.${x.bought ? ` · ✅ ${x.bought} gekauft` : ''}`).join('\n') : '_keine_');
      }).join('\n');
    }

    if (/^(add|hinzufügen|neu)$/.test(cmd)) {
      const u = stripUrl(String(args[0] || '').replace(/^<|>$/g, ''));
      const id = shopOfUrl(u);
      if (!id) return '✖ Das ist kein Produkt-Link eines unterstützten Shops.';
      const l = gv(id, 'products', []);
      if (l.some((x) => keyOf2(id, x.url) === keyOf2(id, u))) return `Schon bei ${SHOPS[id].name} eingetragen.`;
      const max = parseEur(args[1] || '');
      const qv = String(args[2] || '');
      const qty = qv === '' ? 1 : /^(∞|0|alle)$/i.test(qv) ? 0 : Math.max(1, parseInt(qv, 10) || 1);
      l.push({ url: u, variant: '', maxPrice: max, qty, bought: 0 });
      sv(id, 'products', l); pushLog(id, `Produkt per Discord hinzugefügt: ${shortName(u)}`, 'info');
      return `➕ Bei **${SHOPS[id].name}** hinzugefügt: ${dmd(shortName(u))} · max ${max ? fmtEur(max) + ' €' : '– (kein Limit!)'} · ${qty || '∞'} Stk.${gv(id, 'running', false) ? '' : `\nStarten mit \`!start ${id}\``}`;
    }

    if (/^(max|preis)$/.test(cmd) || /^(entfernen|del|löschen|rm)$/.test(cmd)) {
      const id = botShop(args[0]); const i = parseInt(args[1], 10) - 1;
      if (!id) return 'Shop nicht erkannt – z. B. `!max otto 1 499`';
      const l = gv(id, 'products', []);
      if (!l[i]) return `Nummer gibt es nicht – siehe \`!produkte ${id}\``;
      if (/^(max|preis)$/.test(cmd)) {
        const v = parseEur(args[2] || '');
        l[i].maxPrice = v; sv(id, 'products', l);
        return `✏️ ${SHOPS[id].name} #${i + 1}: Max. ${v ? fmtEur(v) + ' €' : 'aufgehoben'}`;
      }
      const [x] = l.splice(i, 1); sv(id, 'products', l);
      pushLog(id, `Produkt per Discord entfernt: ${shortName(x.url)}`, 'info');
      return `🗑️ Entfernt: ${dmd(shortName(x.url))}${!l.length && gv(id, 'running', false) ? ' (keine Produkte mehr – Shop stoppt)' : ''}`;
    }

    if (/^auto$/.test(cmd)) {
      const id = botShop(args[0]); const v = String(args[1] || '').toLowerCase();
      if (!id) return 'z. B. `!auto mm an`';
      if (SHOPS[id].alertOnly || SHOPS[id].stopAfterAdd) return `${SHOPS[id].name} kann nicht automatisch bestellen.`;
      if (/^(aus|off|0)$/.test(v)) { sv(id, 'autoOrder', false); pushLog(id, 'Auto-Bestellung aus (Discord)', 'info'); return `🟢 Auto-Bestellung bei ${SHOPS[id].name} **aus**.`; }
      if (/^(an|on|1)$/.test(v)) return needConfirm(m, `⚠️ Auto-Bestellung bei **${SHOPS[id].name}** einschalten? Dann wird verbindlich bestellt.`, () => { sv(id, 'autoOrder', true); pushLog(id, 'Auto-Bestellung AN (Discord)', 'warn'); return `🔴 Auto-Bestellung bei ${SHOPS[id].name} **AN**.`; });
      return `Auto-Bestellung bei ${SHOPS[id].name} ist ${autoOn(id) ? '**AN**' : 'aus'}. Ändern mit \`!auto ${id} an|aus\``;
    }

    if (/^(zahlung|zahlart|pay)$/.test(cmd)) {
      const id = botShop(args[0]);
      const map = { karte: 'card', kreditkarte: 'card', card: 'card', paypal: 'paypal', rechnung: 'invoice', klarna: 'invoice', vorkasse: 'prepay', überweisung: 'prepay', standard: 'default' };
      const k = map[String(args[1] || '').toLowerCase()];
      if (!id || !k) return 'z. B. `!zahlung mm karte` (karte, paypal, rechnung, vorkasse, standard)';
      sv(id, 'payMethod', k); return `💳 ${SHOPS[id].name}: Zahlungsart **${PAY[k].label}**`;
    }

    if (/^drop$/.test(cmd)) {
      const id = botShop(args[0]); const rest2 = args.slice(1).join(' ');
      if (!id) return 'z. B. `!drop ps 25.11. 10:00` oder `!drop ps aus`';
      if (/^(aus|off|weg)$/i.test(rest2)) { sv(id, 'dropAt', ''); return `⏰ Drop-Zeit bei ${SHOPS[id].name} entfernt.`; }
      const v = parseDrop(rest2);
      if (!v) return 'Zeit nicht verstanden – z. B. `25.11. 10:00`, `morgen 9:00`, `heute 18:30`';
      sv(id, 'dropAt', v); sv(id, 'dropReloaded', false);
      return `⏰ ${SHOPS[id].name}: Drop **${new Date(v).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}** – ab 3 Min. vorher wird schneller geprüft.`;
    }

    if (/^(pause|intervall)$/.test(cmd)) {
      const id = botShop(args[0]); const n = parseInt(args[1], 10);
      if (!id || !n) return 'z. B. `!pause otto 20`';
      const v = Math.max(SHOPS[id].minInterval || 5, n); sv(id, 'intervalSec', v);
      return `⏱️ ${SHOPS[id].name}: alle **${v} s**${v !== n ? ` (Minimum ${v} s)` : ''}`;
    }

    if (/^budget$/.test(cmd)) {
      const old = Number(G.get('budgetDay', 0)) || 0;
      if (!arg) return `💶 Tagesbudget: ${old ? fmtEur(old) + ' €' : 'aus'} · heute ausgegeben ${fmtEur(spentToday())} €`;
      const v = /^(aus|off|0)$/i.test(arg) ? 0 : parseEur(arg);
      if (!v && !/^(aus|off|0)$/i.test(arg)) return 'z. B. `!budget 1500` oder `!budget aus`';
      const set = () => { G.set('budgetDay', v); return `💶 Tagesbudget: **${v ? fmtEur(v) + ' €' : 'aus'}**`; };
      if (old && (!v || v > old)) return needConfirm(m, `⚠️ Tagesbudget von ${fmtEur(old)} € auf **${v ? fmtEur(v) + ' €' : 'aus'}** ${v ? 'erhöhen' : 'stellen'}?`, set);
      return set();
    }

    if (/^(heute|käufe|kaeufe)$/.test(cmd)) {
      const d0 = new Date(); d0.setHours(0, 0, 0, 0);
      const h = GM_getValue('global:history', []).filter((x) => x.ts >= d0.getTime());
      if (!h.length) return 'Heute noch keine Käufe oder Alarme.';
      return `**Heute**\n${h.map((x) => `${x.result === 'success' ? '✅' : x.result === 'alert' ? '🔔' : '❓'} ${new Date(x.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} **${dmd(x.shop)}** ${dmd(x.title).slice(0, 60)} · ${fmtEur(x.total || x.price)} €${x.orderNo ? ` · Nr. ${dmd(x.orderNo)}` : ''}`).join('\n')}\n💶 Summe: ${fmtEur(spentToday())} €`;
    }

    if (/^(log|protokoll)$/.test(cmd)) {
      const ids = arg ? botShops(arg) : usedShops();
      const feed = ids.flatMap((id) => logFor(id).slice(0, 30).map((e) => ({ ...e, id }))).filter((e) => e.type !== 'oos')
        .sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 12);
      if (!feed.length) return 'Keine wichtigen Meldungen.';
      return feed.map((e) => `\`${e.ts}\` **${SHOPS[e.id].name}** ${DICON[e.type] || ''} ${dmd(e.msg).slice(0, 140)}`).join('\n');
    }

    if (/^radar$/.test(cmd)) {
      if (/^(add|neu)$/i.test(args[0] || '')) {
        const u = String(args[1] || '').replace(/^<|>$/g, '');
        let ok = false; try { ok = /^https?:$/.test(new URL(u).protocol); } catch (e) {}
        if (!ok) return 'z. B. `!radar add https://www.otto.de/suche/ps5 ps5 pro`';
        const l = G.get('radar', []);
        const w = { id: Math.random().toString(36).slice(2, 9), url: u, kw: args.slice(2).join(' '), every: 5, shopId: radarShop(u), seen: [], seeded: false, lastAt: 0 };
        l.push(w); G.set('radar', l);
        radarTick(w.id);
        return `📡 Radar überwacht jetzt ${dmd(u)}${w.kw ? ` (Stichwörter: ${dmd(w.kw)})` : ''} – alle 5 Min.`;
      }
      const l = G.get('radar', []); const hits = G.get('radarHits', []);
      return `**📡 Radar** – ${l.length} Seite(n)\n${l.map((w) => `• ${dmd(w.url.replace(/^https?:\/\/(www\.)?/, '')).slice(0, 60)}${w.kw ? ` „${dmd(w.kw)}“` : ''} – ${w.err ? '✖ ' + dmd(w.err) : `${w.lastN || 0} Treffer`}`).join('\n') || '_keine_'}` +
        (hits.length ? `\n**Letzte Funde**\n${hits.slice(0, 5).map((h) => `• ${dmd(h.title).slice(0, 60)} (${dmd(h.shop)}) <${h.url}>`).join('\n')}` : '');
    }

    if (/^(selbsttest|test|check)$/.test(cmd)) return `**🩺 Selbsttest**\n${selfTestText(selfTest())}`;

    return `Unbekannter Befehl \`${dmd(cmd)}\` – \`!hilfe\` zeigt alle Befehle.`;
  }

  /* ---------- Dashboard: Captcha-Schutz & schlafende Tabs ---------- */
  /* ---------- Mehrere Produkte auf einmal ----------
   * Je Zeile: Link, dahinter optional Höchstpreis und Stückzahl – in beliebiger Schreibweise, z. B.
   *   https://…/ps5-123   449,99   2
   *   https://…/xbox-456 ; 399 € ; x1        (auch direkt aus Excel/Google Sheets kopiert, mit Tab getrennt)
   * Mehrere Links in einer Zeile bekommen denselben Preis. */
  function parseBulk(text, defMax, defQty) {
    const out = [];
    for (const line of String(text || '').split(/\r?\n/)) {
      const urls = line.match(/https?:\/\/[^\s;"'<>|]+/gi);
      if (!urls) continue;
      const rest = line.replace(/https?:\/\/[^\s;"'<>|]+/gi, ' ');
      let max = null; let qty = null;
      for (const tok of rest.split(/[\s;\t|]+/).map((t) => t.trim()).filter(Boolean)) {
        let m;
        if ((m = tok.match(/^(?:x|×)(\d+)$/i) || tok.match(/^(\d+)(?:x|×|stk\.?|stück)$/i))) { qty = parseInt(m[1], 10); continue; }
        if (/^(∞|alle)$/i.test(tok)) { qty = 0; continue; }
        if (/^(€|eur|euro|max\.?|preis:?|stk\.?|stück)$/i.test(tok)) continue;
        const v = parseEur(tok.replace(/€|eur$/i, ''));
        if (!(v > 0)) continue;
        if (max === null) max = v;                                    // erste Zahl = Höchstpreis
        else if (qty === null && /^\d{1,3}$/.test(tok)) qty = parseInt(tok, 10);   // zweite (ganze) Zahl = Stückzahl
      }
      for (const raw of urls) {
        let u = stripUrl(raw.replace(/[),.]+$/, '')); let conv = false;
        const de = amazonToDe(u); if (de) { u = de; conv = true; }
        out.push({ url: u, id: shopOfUrl(u), maxPrice: max !== null ? max : defMax, qty: qty !== null ? qty : defQty, conv });
      }
    }
    return out;
  }
  function bulkAddDialog(d) {
    const box = document.createElement('div'); box.className = 'toast'; box.style.width = 'min(760px,94vw)'; box.style.maxHeight = '86vh'; box.style.overflow = 'auto';
    box.innerHTML = `<div style="margin-bottom:6px;font-weight:700">📋 Mehrere Produkte einfügen</div>
      <div class="muted" style="margin-bottom:6px">Je Zeile ein Link, dahinter optional Höchstpreis und Stückzahl, z. B. <code>https://…/ps5 449,99 2</code> – auch direkt aus Excel kopierbar.</div>
      <textarea id="bk-t" style="min-height:160px" placeholder="https://www.mediamarkt.de/de/product/_…  449,99  1&#10;https://www.saturn.de/de/product/_…  449,99&#10;https://www.fnacpro.com/…/a20901133/…  ; 420 € ; x2"></textarea>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0">
        <span class="muted">Ohne Angabe:</span>
        <input type="text" id="bk-max" placeholder="Max. €" style="width:90px"> <input type="text" id="bk-qty" placeholder="Stück" value="1" style="width:64px">
        <label class="ck"><input type="checkbox" id="bk-upd" checked> schon eingetragene Produkte: Preis/Stück aktualisieren</label>
      </div>
      <div id="bk-prev"></div>
      <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px"><button data-x>Abbrechen</button><button class="go" data-ok disabled>Hinzufügen</button></div>`;
    d.appendChild(box);
    const ta = box.querySelector('#bk-t'); const prev = box.querySelector('#bk-prev'); const ok = box.querySelector('[data-ok]');
    let items = [];
    const qOf = (v) => { const t = norm(v); return t === '' ? 1 : /^(∞|0|alle)$/i.test(t) ? 0 : Math.max(1, parseInt(t, 10) || 1); };
    const refresh = () => {
      const defMax = parseEur(box.querySelector('#bk-max').value) || 0;
      const defQty = qOf(box.querySelector('#bk-qty').value);
      const upd = box.querySelector('#bk-upd').checked;
      const seen = new Set();
      items = parseBulk(ta.value, defMax, defQty).map((it) => {
        if (!it.id) return { ...it, st: 'bad', note: 'kein unterstützter Shop / keine Produktseite' };
        const k = `${it.id}|${keyOf2(it.id, it.url)}`;
        if (seen.has(k)) return { ...it, st: 'skip', note: 'doppelt in der Liste' };
        seen.add(k);
        const ex = gv(it.id, 'products', []).find((x) => keyOf2(it.id, x.url) === keyOf2(it.id, it.url));
        if (ex) return { ...it, st: upd ? 'upd' : 'skip', note: upd ? `vorhanden → ${ex.maxPrice ? fmtEur(ex.maxPrice) : '–'} € wird ${it.maxPrice ? fmtEur(it.maxPrice) : '–'} €` : 'schon eingetragen' };
        return { ...it, st: 'new', note: it.conv ? 'neu (auf amazon.de umgestellt)' : 'neu' };
      });
      const nNew = items.filter((x) => x.st === 'new').length; const nUpd = items.filter((x) => x.st === 'upd').length;
      prev.innerHTML = items.length ? `<div class="scroll"><table class="pt set"><thead><tr><th>Shop</th><th>Produkt</th><th class="r">Max. €</th><th class="c">Stück</th><th></th></tr></thead><tbody>${items.map((x) => `<tr>
          <td>${x.id ? esc(SHOPS[x.id].name) : '<span class="red">?</span>'}</td><td>${esc(shortName(x.url))}</td>
          <td class="r">${x.maxPrice ? fmtEur(x.maxPrice) : '<span class="muted">egal</span>'}</td><td class="c">${x.qty === 0 ? '∞' : x.qty}</td>
          <td class="${x.st === 'bad' ? 'red' : x.st === 'skip' ? 'muted' : 'green'}">${esc(x.note)}</td></tr>`).join('')}</tbody></table></div>
        ${items.some((x) => x.st === 'new' && !x.maxPrice) ? '<div class="hint bad">Mindestens ein Produkt hat keinen Höchstpreis – es würde zu jedem Preis gekauft.</div>' : ''}` : '';
      ok.disabled = !(nNew + nUpd);
      ok.textContent = nNew + nUpd ? `${nNew ? `${nNew} hinzufügen` : ''}${nNew && nUpd ? ' + ' : ''}${nUpd ? `${nUpd} aktualisieren` : ''}` : 'Hinzufügen';
    };
    ta.oninput = refresh; box.querySelector('#bk-max').oninput = refresh; box.querySelector('#bk-qty').oninput = refresh; box.querySelector('#bk-upd').onchange = refresh;
    box.querySelector('[data-x]').onclick = () => box.remove();
    ok.onclick = () => {
      let a = 0; let u = 0; const shops = new Set();
      for (const it of items) {
        if (it.st !== 'new' && it.st !== 'upd') continue;
        const l = gv(it.id, 'products', []);
        const ex = l.find((x) => keyOf2(it.id, x.url) === keyOf2(it.id, it.url));
        if (ex) { ex.maxPrice = it.maxPrice; ex.qty = it.qty; u++; } else { l.push({ url: it.url, variant: '', maxPrice: it.maxPrice, qty: it.qty, bought: 0 }); a++; }
        sv(it.id, 'products', l); shops.add(it.id);
      }
      shops.forEach((id) => pushLog(id, 'Produkte per Liste eingefügt/aktualisiert (Dashboard)', 'info'));
      box.remove();
      dashToast(`${a ? `${a} Produkt(e) hinzugefügt` : ''}${a && u ? ', ' : ''}${u ? `${u} aktualisiert` : ''} – ${[...shops].map((id) => SHOPS[id].name).join(', ')}`);
      renderDash(true);
    };
    ta.focus();
  }

  /* ---------- Startklar-Check (Dashboard) ---------- */
  let skRunning = false; let skAt = 0;
  async function startklar() {
    if (skRunning) return; skRunning = true; skAt = Date.now();
    const ids = SHOP_IDS().filter((id) => gv(id, 'products', []).length && !SHOPS[id].internal);
    const out = {};
    for (const id of ids) {
      out[id] = { central: null, why: '' };
      if (SHOPS[id].basketUrl) { sv(id, 'preflightRes', null); sv(id, 'preflight', { at: Date.now() }); openTab(SHOPS[id].basketUrl); await sleep(800); }
    }
    G.set('startklar', { at: skAt, out }); renderDash(true);
    await Promise.all(ids.filter(centralCapable).map(async (id) => {
      const r = await centralStatus(id, gv(id, 'products', [])[0].url);
      out[id] = { central: r.st, why: r.why || '' };
      G.set('startklar', { at: skAt, out });
    }));
    const t0 = Date.now();
    while (Date.now() - t0 < 70000 && ids.some((id) => SHOPS[id].basketUrl && !((gv(id, 'preflightRes', null) || {}).at > skAt))) { await sleep(1500); renderDash(true); }
    skRunning = false; renderDash(true);
  }
  function startklarBlock() {
    const sk = G.get('startklar', null);
    const yes = '<span class="green">✔</span>'; const no = (t) => `<span class="red">✖ ${esc(t)}</span>`; const wait = skRunning ? '<span class="muted">prüft …</span>' : '<span class="muted">–</span>';
    let rows = '';
    if (sk) {
      for (const id of Object.keys(sk.out || {})) {
        if (!SHOPS[id]) continue;
        const o = sk.out[id] || {};
        const pf = gv(id, 'preflightRes', null); const pfOk = pf && pf.at > sk.at;
        const cen = !centralCapable(id) ? '<span class="muted">eigener Tab</span>' : o.central === null ? wait
          : o.central === 'in' || o.central === 'out' ? `${yes} ${o.central === 'in' ? 'verfügbar' : 'ausverkauft'}` : no(o.why || 'klappt nicht');
        const login = !SHOPS[id].basketUrl ? '<span class="muted">–</span>' : !pfOk ? wait : pf.login === false ? no('nicht angemeldet') : yes;
        const cart = !SHOPS[id].basketUrl ? '<span class="muted">–</span>' : !pfOk ? wait
          : pf.foreign.length ? no(`fremd: ${pf.foreign.join(', ')}`) : `${yes} ${pf.n === null ? '' : pf.n ? `${pf.n} eigene(r)` : 'leer'}${pf.note ? ` <span class="muted">(${esc(pf.note)})</span>` : ''}`;
        const pm = PAY[gv(id, 'payMethod', SHOPS[id].defaultPay || 'default')];
        rows += `<tr><td><b>${esc(SHOPS[id].name)}</b></td><td>${cen}</td><td class="c">${login}</td><td>${cart}</td><td>${esc(pm ? pm.label : 'Standard')}${gv(id, 'autoOrder', false) ? ' · <span class="red">Auto</span>' : ''}</td></tr>`;
      }
    }
    return `
      <h3>🚦 Startklar-Check</h3>
      <div class="row" style="gap:10px;align-items:center"><button class="sm" id="d-sk" ${skRunning ? 'disabled' : ''}>${skRunning ? '⏳ prüft …' : '▶ Jetzt prüfen'}</button>
        <span class="muted">${sk ? `zuletzt ${agoText(sk.at)}` : 'Vor einem Drop einmal prüfen: Abruf, Anmeldung, Warenkorb.'}</span></div>
      ${rows ? `<div class="scroll"><table class="pt set"><thead><tr><th>Shop</th><th>Abruf (Prüf-Zentrum)</th><th class="c">Angemeldet</th><th>Warenkorb</th><th>Zahlung</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
      <div class="hint">Öffnet je Shop kurz den Warenkorb im Hintergrund, liest ihn nur aus und schließt ihn wieder. Fremde Artikel bitte selbst entfernen, sonst stoppt der Kauf an der Kasse.</div>`;
  }

  function protectBlock() {
    const used = SHOP_IDS().filter((id) => gv(id, 'products', []).length || gv(id, 'running', false));
    const f = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
    const rows = [];
    for (const g of Object.keys(RATE_GROUPS)) {
      const members = used.filter((id) => SHOPS[id].rateGroup === g);
      if (!members.length) continue;
      const run = groupShops(g); const ci = capInfo(members[0]); const lim = groupLimit(g);
      const rate = ratePerMin(run);
      rows.push(`<tr><td><b>${esc(RATE_GROUPS[g].name)}</b></td>
        <td class="c"><input type="text" class="cell c" data-rate="${g}" value="${lim || ''}" placeholder="aus" style="width:60px" title="Höchstens so viele Abrufe pro Minute – beide Shops zusammen. Leer/0 = aus"></td>
        <td class="c">${run.length ? `≈ ${f(rate)}` : '<span class="muted">–</span>'}</td>
        <td class="c">${ci.h24} / ${ci.hits.length}</td>
        <td class="c">${ci.factor > 1 ? `<span class="red">× ${f(ci.factor)}</span> <button class="sm" data-capreset="${g}">zurücksetzen</button>` : '<span class="muted">–</span>'}</td></tr>`);
    }
    for (const id of used) {
      if (SHOPS[id].rateGroup) continue;
      const ci = capInfo(id); if (!ci.hits.length && ci.factor === 1) continue;
      rows.push(`<tr><td><b>${esc(SHOPS[id].name)}</b></td><td class="c"><span class="muted">–</span></td>
        <td class="c">${gv(id, 'running', false) ? `≈ ${f(ratePerMin([id]))}` : '<span class="muted">–</span>'}</td><td class="c">${ci.h24} / ${ci.hits.length}</td>
        <td class="c">${ci.factor > 1 ? `<span class="red">× ${f(ci.factor)}</span> <button class="sm" data-capreset="${id}">zurücksetzen</button>` : '<span class="muted">–</span>'}</td></tr>`);
    }
    const sleeps = used.map((id) => ({ id, n: (gv(id, 'sleeps', []) || []).filter((t) => Date.now() - t < 7 * 86400e3).length })).filter((x) => x.n);
    const hosts = [...new Set(used.map((id) => (id === 'shopify' ? '' : (gv(id, 'products', [])[0] || {}).url)).filter(Boolean).map((u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }).filter(Boolean))];
    return `
      <h3>🧩 Captcha-Schutz</h3>
      ${rows.length ? `<div class="scroll"><table class="pt set"><thead><tr><th>Shop</th><th class="c">Max. Abrufe/Min</th><th class="c">aktuell/Min</th><th class="c">Captchas 24 Std. / 7 Tage</th><th class="c">Bremse</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>` : '<div class="muted">Noch keine Shops mit Captcha-Schutz aktiv.</div>'}
      <div class="hint">MediaMarkt und Saturn haben denselben Bot-Schutz – ihre Abrufe zählen zusammen. Das Limit verteilt sich automatisch auf alle laufenden Produkte (z. B. 4/Min bei 4 Produkten = jedes Produkt einmal pro Minute). Nach jedem Captcha prüft der Shop dauerhaft langsamer (× 1,5 → × 2 → × 3); je 24 Std. ohne Captcha geht es eine Stufe zurück. Abrufe einer Runde werden gleichmäßig verteilt statt direkt hintereinander.</div>
      <h3>😴 Schlafende Tabs</h3>
      ${sleeps.length ? `<div class="hint" style="border-color:#e0a63a"><b class="red">Schlafen gelegt (7 Tage):</b> ${sleeps.map((x) => `${esc(SHOPS[x.id].name)} ${x.n}×`).join(' · ')} – in dieser Zeit wurde nicht geprüft.</div>` : '<div class="muted">Bisher wurde kein Shop-Tab schlafen gelegt ✔</div>'}
      <div class="hint">Damit Chrome/Edge die Shop-Tabs nie einfrieren:<br>
        <b>Chrome:</b> Einstellungen → <i>Leistung</i> → bei „Speicher sparen“ unter <i>Diese Websites immer aktiv lassen</i> auf <i>Hinzufügen</i> und die Shops eintragen.<br>
        <b>Edge:</b> Einstellungen → <i>System und Leistung</i> → <i>Schlafende Tabs</i> → <i>Diese Websites nie in den Standbymodus versetzen</i> → Hinzufügen.<br>
        Einzutragen: <code>example.com</code> (das Dashboard – wichtig fürs Prüf-Zentrum)${hosts.length ? ` <code>${hosts.map(esc).join('</code> <code>')}</code>` : ''}<br>
        Außerdem: Energiesparmodus/Standby des PCs aus, solange das Tool läuft. Erkennt das Script eine Pause, meldet es sich im Protokoll und in Discord; reagiert ein Tab 2,5 Min. nicht, öffnet das Dashboard ihn neu.</div>`;
  }

  function renderDash(force) {
    const d = document.getElementById('qb-dash'); if (!d) return;
    const ae = document.activeElement;
    if (!force && d.contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return;
    if (!force && d.querySelector('textarea')) return;
    const ids = SHOP_IDS();
    const used = ids.filter((id) => gv(id, 'products', []).length || gv(id, 'running', false));
    const hist = GM_getValue('global:history', []);
    const bought = hist.filter((h) => h.result === 'success');
    const spent = bought.reduce((a, h) => a + (Number(h.price) || 0), 0);
    const runIds = ids.filter((id) => gv(id, 'running', false));
    const anyRun = runIds.length > 0;
    const att = attentionItems();
    const scrollY = d.scrollTop;
    const keepToasts = [...d.querySelectorAll(':scope > .toast')];

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
    const ago = (t) => {
      if (!t) return '';
      const s = Math.max(0, Math.round((Date.now() - t) / 1000));
      return s < 60 ? `vor ${s} s` : s < 3600 ? `vor ${Math.round(s / 60)} Min.` : s < 86400 ? `vor ${Math.round(s / 3600)} Std.` : new Date(t).toLocaleDateString('de-DE');
    };
    const shopState = shopStateOf;
    const hue = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
    const logo = (id) => `<span class="logo" style="background:linear-gradient(135deg,hsl(${hue(id)} 70% 52%),hsl(${(hue(id) + 40) % 360} 70% 42%))">${esc(SHOPS[id].name.replace(/[^A-Za-zÄÖÜ]/g, '').slice(0, 1).toUpperCase() || '?')}</span>`;
    const shopStrip = used.map((id) => {
      const run = gv(id, 'running', false);
      const st = shopState(id);
      const last = logFor(id)[0];
      const n = gv(id, 'products', []).length;
      const pm = gv(id, 'payMethod', SHOPS[id].defaultPay || 'default');
      const auto = gv(id, 'autoOrder', false) && !SHOPS[id].alertOnly && !SHOPS[id].stopAfterAdd;
      const badges = [
        auto ? '<span class="b red">Auto-Bestellung</span>' : '',
        SHOPS[id].alertOnly ? '<span class="b">nur Alarm</span>' : '',
        auto && PAY[pm] && pm !== 'default' ? `<span class="b">${esc(PAY[pm].label)}</span>` : '',
        gv(id, 'dropAt', '') ? `<span class="b">⏰ ${esc(new Date(gv(id, 'dropAt', '')).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</span>` : '',
        (gv(id, 'loggedOut', 0) || 0) >= 2 ? '<span class="b warn">🔑 abgemeldet?</span>' : '',
      ].join('');
      return `<div class="sh s-${st.k}" data-id="${id}">
        <div class="sh-top">${logo(id)}<div><div class="shn">${esc(SHOPS[id].name)}</div><div class="shs">${n} Produkt${n === 1 ? '' : 'e'}${run ? ` · Runde ${gv(id, 'attempts', 0) + 1}` : ''}</div></div><span class="pill p-${st.k}">${st.t}</span></div>
        ${badges ? `<div class="badges">${badges}</div>` : ''}
        <div class="shl t-${last ? last.type : ''}" title="${esc(last ? last.msg : '')}">${last ? `${DICON[last.type] || ''} ${esc(last.msg)}<span class="ago">${esc(ago(last.at))}</span>` : '<span class="muted">Noch keine Meldung</span>'}</div>
        <div class="sha"><button class="${run ? 'stop' : 'go'} sm" data-shop="${run ? 'stop' : 'start'}">${run ? '■ Stoppen' : '▶ Starten'}</button><button class="sm" data-shop="tab" title="Shop-Tab öffnen">↗ Tab</button></div>
      </div>`;
    }).join('');

    const budget = Number(G.get('budgetDay', 0)) || 0;
    const today = spentToday();
    const pct = budget ? Math.min(100, Math.round(today / budget * 100)) : 0;
    const rs = GM_getValue('global:restocks', []);
    const r24 = rs.filter((r) => Date.now() - r.t < 86400e3).length;
    const spentAll = bought.reduce((a, h) => a + (Number(h.total) || Number(h.price) || 0), 0);
    const kpis = `<div class="kpis">
      <div class="kpi" style="--kc:var(--gr)"><div class="kl">🟢 Aktive Shops</div><div class="kv">${runIds.length}<span>/ ${used.length}</span></div><div class="ks">${rows.length} Produkt${rows.length === 1 ? '' : 'e'} in der Überwachung</div></div>
      <div class="kpi" style="--kc:var(--am)"><div class="kl">💶 Heute ausgegeben</div><div class="kv">${fmtEur(today)} €</div>${budget ? `<div class="meter ${pct >= 80 ? 'hi' : ''}"><i style="width:${pct}%"></i></div><div class="ks">${pct} % von ${fmtEur(budget)} € Tagesbudget</div>` : '<div class="ks">kein Tagesbudget gesetzt</div>'}</div>
      <div class="kpi" style="--kc:var(--ac)"><div class="kl">🛒 Käufe</div><div class="kv">${bought.length}</div><div class="ks">${fmtEur(spentAll)} € insgesamt</div></div>
      <div class="kpi" style="--kc:var(--pu)"><div class="kl">🔔 Restocks (24 Std.)</div><div class="kv">${r24}</div><div class="ks">${rs.length ? `zuletzt ${esc(ago(rs[0].t))}` : 'noch keine aufgezeichnet'}</div></div>
    </div>`;
    const recent = ids.flatMap((id) => logFor(id).slice(0, 12).map((e) => ({ ...e, id })))
      .filter((e) => e.type !== 'oos').sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 14);

    const home = `
      ${kpis}
      ${att.length ? `<div class="att"><div class="atth">⚠️ Braucht deine Aufmerksamkeit <button class="lnk" data-g="dismiss">alles erledigt ✓</button></div>
        ${att.map((e) => `<div class="atti t-${e.type}"><b>${esc(SHOPS[e.id].name)}</b> · ${esc(e.msg)} <span class="muted">${esc(e.ts)}</span></div>`).join('')}</div>` : ''}
      <div class="cols"><div>
        <div class="add">
          <input type="text" id="d-url" placeholder="➕ Produkt-URL einfügen – Shop wird automatisch erkannt">
          <input type="text" id="d-max" placeholder="Max. €" style="width:96px;flex:none">
          <input type="text" id="d-qty" placeholder="Stück" title="Stückzahl (∞ = so viele wie möglich)" style="width:72px;flex:none">
          <button class="go" data-g="add">Hinzufügen</button>
          <button data-g="bulk" title="Viele Links auf einmal einfügen – mit Preis und Stückzahl je Zeile">📋 Mehrere</button>
        </div>
        <div class="hint" id="d-hint"></div>
        ${used.length ? `<h3>Shops <span class="muted">${runIds.length} von ${used.length} aktiv</span></h3><div class="shops">${shopStrip}</div>` : ''}
        ${rows.length ? `<h3>Produkte <span class="muted">${rows.length}</span></h3><table class="pt"><thead><tr><th>Shop</th><th>Produkt</th><th>Status</th><th class="r">Max. €</th><th class="c">Stück</th><th class="c">Gekauft</th><th></th></tr></thead><tbody>
          ${rows.map((r) => `<tr class="${r.active ? 'cur' : ''}" data-id="${r.id}" data-i="${r.i}">
            <td><span class="tag">${esc(SHOPS[r.id].name)}</span></td>
            <td class="pn"><a href="${esc(r.x.url)}" target="_blank" title="${esc(r.x.url)}">${esc(shortName(r.x.url))}</a>${r.x.variant ? ` <span class="muted">· ${esc(r.x.variant)}</span>` : ''}</td>
            <td>${status(r)}</td>
            <td class="r"><input type="text" class="cell" data-f="maxPrice" value="${r.x.maxPrice ? fmtEur(r.x.maxPrice) : ''}" placeholder="–"></td>
            <td class="c"><input type="text" class="cell c" data-f="qty" value="${Number(r.x.qty) === 0 ? '∞' : (r.x.qty === undefined ? 1 : r.x.qty)}"></td>
            <td class="c">${r.x.bought ? `<b class="green">${r.x.bought}</b>` : '<span class="muted">0</span>'}</td>
            <td class="r"><button class="x2" data-p="del" title="Entfernen">✕</button></td></tr>`).join('')}
        </tbody></table>` : `<div class="empty big" style="margin-top:18px">🚀 Noch keine Produkte.<br>Füge oben eine Produkt-URL ein – der Shop wird automatisch erkannt (23 Shops + alle Shopify-Shops).</div>`}
      </div>
      <div class="aside">
        <h3>Live-Aktivität <span class="sp"></span><button class="lnk" data-tab="log">alle →</button></h3>
        <div class="feed">${recent.length ? recent.map((e) => `<div class="fe t-${e.type}"><span class="s">${esc(SHOPS[e.id].name)}</span><span class="t">${esc(e.ts)}</span><span class="m">${DICON[e.type] || ''} ${esc(e.msg)} <span class="muted">${esc(ago(e.at))}</span></span></div>`).join('') : '<div class="empty">Noch nichts passiert</div>'}</div>
      </div></div>`;

    // ---------- Protokoll ----------
    const logIds = ids.filter((id) => logFor(id).length);
    const feed = ids.filter((id) => logShop === 'all' || id === logShop).flatMap((id) => logFor(id).slice(0, 60).map((e) => ({ ...e, id })))
      .filter((e) => !logImportant || e.type !== 'oos')
      .sort((a, b) => (b.at || 0) - (a.at || 0) || String(b.ts).localeCompare(String(a.ts))).slice(0, 150);
    const logTab = `<div class="bar"><select id="lg-shop"><option value="all">Alle Shops</option>${logIds.map((id) => `<option value="${id}" ${logShop === id ? 'selected' : ''}>${esc(SHOPS[id].name)}</option>`).join('')}</select>
      <label class="ck"><input type="checkbox" id="lg-imp" ${logImportant ? 'checked' : ''}> nur Wichtiges (ohne „ausverkauft“)</label>
      <span class="sp"></span><span class="muted">gleiche Meldungen werden zusammengefasst</span><button class="sm" data-g="clearlogs">Leeren</button></div>
      <div class="feed">${feed.length ? feed.map((e) => `<div class="fe t-${e.type}"><span class="s">${esc(SHOPS[e.id].name)}</span><span class="t">${esc(e.ts)}</span><span class="m">${DICON[e.type] || ''} ${e.n > 1 ? `<b>×${e.n}</b> ` : ''}${esc(e.msg)}</span></div>`).join('') : '<div class="empty">Noch keine Einträge</div>'}</div>`;

    // ---------- Historie ----------
    const histTab = `<div class="bar"><span class="chip">Käufe: <b>${bought.length}</b></span><span class="chip">Ausgegeben: <b>${fmtEur(spent)} €</b></span><span class="sp"></span><button class="sm" data-g="csv" title="Datum, Shop, Produkt, Bestellnummer, Preise, Zahlungsart – öffnet sich in Excel">📄 CSV exportieren</button><button class="sm" data-g="clearhist">Leeren</button></div>
      ${hist.length ? `<table class="pt"><thead><tr><th>Wann</th><th>Shop</th><th>Produkt</th><th>Ergebnis</th><th>Bestellnr.</th><th class="r">Preis</th><th class="r">Gesamt</th></tr></thead><tbody>
        ${hist.slice(0, 200).map((h) => `<tr><td>${new Date(h.ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td><span class="tag">${esc(h.shop)}</span></td>
          <td class="pn"><a href="${esc(h.url)}" target="_blank">${esc(String(h.title).slice(0, 60))}</a></td>
          <td>${h.result === 'success' ? '✅ gekauft' : h.result === 'alert' ? '🔔 Alarm' : '❓ unklar'}</td>
          <td>${h.orderNo ? esc(h.orderNo) : '<span class="muted">–</span>'}</td>
          <td class="r">${h.price ? fmtEur(h.price) + ' €' : '–'}</td>
          <td class="r">${h.total ? fmtEur(h.total) + ' €' : '–'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty big">Noch keine Käufe</div>'}`;

    // ---------- Einstellungen ----------
    const CORE = ['otto', 'mediamarkt', 'saturn', 'microsoft', 'playstation', 'amazon', 'fnacpro'];
    const setIds = ids.filter((id) => CORE.includes(id) || used.includes(id));
    const setRows = setIds.map((id) => {
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
        <td class="c">${!sh.alertOnly && !sh.needLogin && !sh.shopify ? `<input type="checkbox" data-s="loginCheck" ${gv(id, 'loginCheck', true) ? 'checked' : ''}>` : '<span class="muted">–</span>'}</td>
        <td class="c">${sh.cartItems ? `<input type="checkbox" data-s="removeOthers" ${gv(id, 'removeOthers', false) ? 'checked' : ''}>` : '<span class="muted">–</span>'}</td>
      </tr>`;
    }).join('');
    const setTab = `
      <h3>Shops <span class="muted" style="font-weight:400;font-size:12px">– weitere Shops erscheinen hier, sobald du dort ein Produkt einträgst</span></h3>
      <div class="scroll"><table class="pt set"><thead><tr><th>Shop</th><th>Auto-Bestellung</th><th>Zahlungsart</th><th class="c">Pause (s)</th><th>⏰ Drop-Zeit</th><th class="c">Nur Shop selbst</th><th class="c">Nach Kauf weiter</th><th class="c" title="Warnt, wenn du im Shop abgemeldet bist">Login prüfen</th><th class="c" title="Entfernt andere Artikel aus dem Warenkorb, bevor zur Kasse gegangen wird">Fremde Artikel entfernen</th></tr></thead><tbody>${setRows}</tbody></table></div>
      <h3>🛡️ Sicherheit & Überwachung</h3>
      <div class="dcg">
        <label class="ck">Tagesbudget (alle Shops zusammen): <input type="text" id="g-budget" style="width:90px;flex:none" value="${Number(G.get('budgetDay', 0)) ? fmtEur(G.get('budgetDay', 0)) : ''}" placeholder="aus"> €</label>
        <span class="muted">heute ausgegeben: ${fmtEur(spentToday())} €</span>
<label class="ck" title="Ein Tab (das Dashboard) prüft alle Shops im Hintergrund; Shop-Tabs öffnen sich nur bei einem Treffer. Gilt für Otto, MediaMarkt, Saturn, PlayStation, Microsoft, FNAC – Amazon prüft weiter im eigenen Tab."><input type="checkbox" data-gs="central" ${G.get('central', true) ? 'checked' : ''}> Prüf-Zentrum (nur ein Tab prüft, Shop-Tabs nur bei Treffer)</label>
        <label class="ck"><input type="checkbox" data-gs="autoReopen" ${G.get('autoReopen', true) ? 'checked' : ''}> Abgestürzte Shop-Tabs automatisch neu öffnen</label>
        <label class="ck"><input type="checkbox" data-gs="reportOn" ${G.get('reportOn', true) ? 'checked' : ''}> Täglicher Selbsttest an Discord um</label>
        <input type="time" id="g-rtime" value="${esc(G.get('reportTime', '09:00'))}" style="flex:none">
        <button class="sm" data-g="selftest">🩺 Selbsttest jetzt</button>
      </div>
      ${startklarBlock()}
      ${protectBlock()}
      <div class="hint">Budget: Ist es erreicht, bestellt kein Shop mehr automatisch (zählt erfolgreiche Käufe seit 0 Uhr). Selbsttest, Tab-Wächter und Radar laufen, solange dieser Dashboard-Tab offen ist.</div>
      <h3>🔔 Discord</h3>
      <div class="dcg">
        <input type="text" id="d-wh" placeholder="https://discord.com/api/webhooks/…" value="${esc(dc('webhook'))}">
        <button class="sm" data-g="dctest">Test senden</button>
        ${[['dcSuccess', 'Kauf erfolgreich'], ['dcCheckout', 'Kasse erreicht / Alarm'], ['dcError', 'Probleme'], ['dcAvailable', 'Artikel verfügbar'], ['dcListing', 'Neu gelistet (Radar)'], ['dcReport', 'Täglicher Selbsttest'], ['dcPing', '@everyone']].map(([k, l]) => `<label class="ck"><input type="checkbox" data-dc="${k}" ${dc(k) ? 'checked' : ''}> ${l}</label>`).join('')}
      </div>
      <h3>🤖 Steuerung per Discord</h3>
      <div class="dcg">
        <label class="ck"><input type="checkbox" id="b-on" ${G.get('botOn', false) ? 'checked' : ''}> Befehle aus Discord annehmen</label>
        <input type="password" id="b-token" style="flex:1 1 240px" placeholder="${G.get('botToken', '') ? 'Bot-Token gespeichert ✔ (zum Ändern neu einfügen)' : 'Bot-Token'}" autocomplete="off">
        <input type="text" id="b-ch" style="width:200px;flex:none" placeholder="Kanal-ID" value="${esc(G.get('botChannel', ''))}">
        <input type="text" id="b-users" style="width:230px;flex:none" placeholder="Deine Discord-Nutzer-ID" value="${esc(G.get('botUsers', ''))}">
        <button class="sm" data-g="bottest">Verbindung testen</button>
        <span class="${botState.ok ? 'green' : botState.ok === false ? 'red' : 'muted'}" style="font-size:12px">● ${esc(G.get('botOn', false) ? botState.msg : 'aus')}</span>
      </div>
      <details class="howto"><summary>So richtest du den Bot ein (ca. 5 Minuten)</summary><ol>
        <li><a href="https://discord.com/developers/applications" target="_blank">discord.com/developers/applications</a> → <b>New Application</b> → Name z. B. „QuickBuy“.</li>
        <li>Links <b>Bot</b> → <b>Reset Token</b> → Token kopieren und oben einfügen. Darunter <b>Message Content Intent</b> einschalten → <b>Save Changes</b>.</li>
        <li>Links <b>OAuth2 → URL Generator</b>: Haken bei <code>bot</code>, darunter <code>View Channels</code>, <code>Send Messages</code>, <code>Read Message History</code>. Link unten öffnen → deinen Server wählen → <b>Autorisieren</b>.</li>
        <li>In Discord: <b>Einstellungen → Erweitert → Entwicklermodus</b> an. Dann Rechtsklick auf deinen Kanal → <b>Kanal-ID kopieren</b>, Rechtsklick auf deinen Namen → <b>Benutzer-ID kopieren</b> → oben eintragen.</li>
        <li>Haken „Befehle aus Discord annehmen“ setzen → im Kanal erscheint „QuickBuy ist verbunden“. Dann <code>!hilfe</code> schreiben.</li>
      </ol><div class="muted">Am besten einen eigenen, privaten Kanal nehmen. Nur die eingetragene Nutzer-ID darf Befehle geben. Der Token bleibt nur in deinem Browser und ist nicht im Backup enthalten. Befehle funktionieren, solange dieser Dashboard-Tab offen ist.</div>
      <div class="cmds">${BOT_HELP.split('\n').slice(1).map((l) => `<div>${esc(l).replace(/`([^`]+)`/g, '<code>$1</code>')}</div>`).join('')}</div></details>
      <h3>💾 Sichern</h3>
      <div class="bar"><button class="sm" data-g="export">⬇ Backup herunterladen</button><button class="sm" data-g="import">⬆ Backup einspielen</button><span class="muted">Enthält Produkte, Einstellungen, Historie und die Discord-URL.</span></div>`;

    const ver = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '';
    const radarN = G.get('radar', []).length;
    const tabs = [['home', 'Übersicht', '🏠', att.length ? `⚠ ${att.length}` : ''], ['log', 'Protokoll', '📜', ''], ['hist', 'Historie', '🧾', bought.length || ''],
      ['radar', 'Radar', '📡', radarN || ''], ['stats', 'Statistik', '📈', ''], ['set', 'Einstellungen', '⚙️', '']];
    const TITLES = { home: ['Übersicht', anyRun ? `${runIds.length} Shop${runIds.length > 1 ? 's' : ''} aktiv · aktualisiert ${new Date().toLocaleTimeString('de-DE')}` : 'Alles gestoppt – starte einzelne Shops oder alle auf einmal'],
      log: ['Protokoll', 'Alle Meldungen aller Shops, neueste zuerst'], hist: ['Historie', 'Käufe und Alarme – als CSV exportierbar'],
      radar: ['Radar', 'Neu gelistete Produkte in Suchen und Kategorien finden'], stats: ['Statistik', 'Wann wird nachgefüllt? Restocks nach Wochentag und Uhrzeit'],
      set: ['Einstellungen', 'Shops, Sicherheit, Discord und Backup'] };
    const [ttl, sub] = TITLES[dashTab] || TITLES.home;
    d.innerHTML = `<div class="app">
      <aside class="nav">
        <div class="brand"><span class="lg">⚡</span><div><b>QuickBuy</b><small>Dashboard${ver ? ` · v${esc(ver)}` : ''}</small></div></div>
        ${tabs.map(([k, l, ic, nb]) => `<button class="tb ${dashTab === k ? 'act' : ''}" data-tab="${k}"><span class="ic">${ic}</span>${l}${nb !== '' ? `<span class="nb">${esc(nb)}</span>` : ''}</button>`).join('')}
        ${used.length ? `<div class="nav-sec">Shops</div><div class="mini">${used.map((id) => { const st = shopState(id); return `<div class="mi" data-tab="home" title="${esc(st.t)}"><span class="dot2" style="width:8px;height:8px;border-radius:50%;flex:none;background:${{ on: 'var(--gr)', buy: 'var(--ac)', warn: 'var(--am)', queue: 'var(--pu)', off: '#3a3f4f' }[st.k]}"></span>${esc(SHOPS[id].name)}<span class="mt">${esc(st.t)}</span></div>`; }).join('')}</div>` : ''}
        <div class="nav-foot" style="flex-direction:column;align-items:flex-start;gap:4px"><div><span class="live"><i></i>Live</span> · eigener Tab, lädt nie neu</div>${G.get('botOn', false) ? `<div title="${esc(botState.msg)}">🤖 Discord: <span class="${botState.ok ? 'green' : botState.ok === false ? 'red' : ''}">${botState.ok ? 'verbunden' : botState.ok === false ? 'Fehler' : 'verbinde …'}</span></div>` : ''}</div>
      </aside>
      <main class="mainc">
        <header class="hdr">
          <div><h1>${ttl}</h1><div class="sub">${esc(sub)}</div></div>
          <span class="sp"></span>
          <span class="chip" title="Heute ausgegeben${budget ? ' / Tagesbudget' : ''}">💶 heute <b>${fmtEur(today)} €</b>${budget ? ` / ${fmtEur(budget)} €` : ''}</span>
          <button class="${anyRun ? 'stop' : 'go'} big" data-g="${anyRun ? 'stopall' : 'startall'}">${anyRun ? '■ Alle stoppen' : '▶ Alle starten'}</button>
        </header>
        <div class="d-body">${dashTab === 'home' ? home : dashTab === 'log' ? logTab : dashTab === 'hist' ? histTab : dashTab === 'radar' ? radarHtml() : dashTab === 'stats' ? statsHtml() : setTab}</div>
      </main>
    </div>`;
    for (const t of keepToasts) d.appendChild(t);   // offene Meldungen/Dialoge bleiben beim Aktualisieren erhalten
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
        let u = stripUrl(norm(d.querySelector('#d-url').value)); { const de = amazonToDe(u); if (de) { u = de; dashToast('Amazon-Link auf amazon.de umgestellt'); } }
        const id = shopOfUrl(u);
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
      if (g === 'bulk') return bulkAddDialog(d);
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
      if (g === 'csv') return exportCsv();
      if (g === 'bottest') { botTest(); return; }
      if (g === 'selftest') {
        const r = selfTest();
        const box = document.createElement('div'); box.className = 'toast'; box.style.width = 'min(640px,92vw)';
        box.innerHTML = `<div style="font-weight:800;margin-bottom:6px">🩺 Selbsttest</div><div class="stl">${esc(selfTestText(r)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')}</div><div style="display:flex;gap:6px;justify-content:flex-end"><button data-x>Schließen</button><button class="go" data-ok>An Discord senden</button></div>`;
        d.appendChild(box);
        box.querySelector('[data-x]').onclick = () => box.remove();
        box.querySelector('[data-ok]').onclick = () => { discord('report', selfTestText(r), { title: '', shop: 'Alle Shops' }).then((ok) => dashToast(ok ? 'Selbsttest an Discord gesendet ✔' : 'Discord nicht eingerichtet oder Fehler')); box.remove(); };
        return;
      }
      if (g === 'radd') {
        const u = norm(d.querySelector('#r-url').value);
        let ok = false; try { ok = /^https?:$/.test(new URL(u).protocol); } catch (e) {}
        if (!ok) { alert('Bitte eine vollständige Such- oder Kategorie-URL eintragen (mit https://).'); return; }
        const l = G.get('radar', []);
        l.push({ id: Math.random().toString(36).slice(2, 9), url: u, kw: norm(d.querySelector('#r-kw').value), every: Math.max(2, parseInt(d.querySelector('#r-min').value, 10) || 5), shopId: radarShop(u), seen: [], seeded: false, lastAt: 0 });
        G.set('radar', l);
        dashToast('Wird überwacht – erste Prüfung merkt sich den aktuellen Stand');
        radarTick(l[l.length - 1].id).then(() => renderDash(true));
      }
      if (g === 'rclear') G.set('radarHits', []);
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
    // Radar
    d.querySelectorAll('tr[data-rid] [data-r]').forEach((b) => b.onclick = () => {
      const rid = b.closest('tr').dataset.rid;
      if (b.dataset.r === 'del') { if (!confirm('Überwachung entfernen?')) return; G.set('radar', G.get('radar', []).filter((x) => x.id !== rid)); renderDash(true); }
      if (b.dataset.r === 'now') { b.textContent = '…'; radarTick(rid).then(() => renderDash(true)); }
    });
    d.querySelectorAll('tr[data-hit] [data-h="add"]').forEach((b) => b.onclick = () => {
      const h = G.get('radarHits', [])[Number(b.closest('tr').dataset.hit)]; if (!h) return;
      const id = shopOfUrl(h.url); if (!id) return;
      const l = gv(id, 'products', []);
      if (l.some((x) => keyOf2(id, x.url) === keyOf2(id, h.url))) return dashToast('Schon eingetragen');
      const mx = prompt(`„${h.title}“ bei ${SHOPS[id].name} überwachen.\n\nMaximalpreis in € (leer = ohne Limit):`, '');
      if (mx === null) return;
      l.push({ url: stripUrl(h.url), variant: '', maxPrice: parseEur(mx), qty: 1, bought: 0 });
      sv(id, 'products', l); pushLog(id, `Produkt aus dem Radar hinzugefügt: ${shortName(h.url)}`, 'info');
      dashToast(`Zu ${SHOPS[id].name} hinzugefügt`); renderDash(true); renderPanel();
    });
    const lgSel = d.querySelector('#lg-shop');
    if (lgSel) lgSel.onchange = () => { logShop = lgSel.value; renderDash(true); };
    const lgImp = d.querySelector('#lg-imp');
    if (lgImp) lgImp.onchange = () => { logImportant = lgImp.checked; renderDash(true); };
    const stSel = d.querySelector('#st-shop');
    if (stSel) stSel.onchange = () => { statShop = stSel.value; renderDash(true); };
    // Globale Einstellungen
    const gb = d.querySelector('#g-budget');
    if (gb) gb.onchange = () => { G.set('budgetDay', parseEur(gb.value) || 0); dashToast(Number(G.get('budgetDay', 0)) ? `Tagesbudget: ${fmtEur(G.get('budgetDay', 0))} €` : 'Tagesbudget aus'); renderDash(true); };
    const rt = d.querySelector('#g-rtime');
    if (rt) rt.onchange = () => { G.set('reportTime', rt.value || '09:00'); };
    d.querySelectorAll('[data-gs]').forEach((c) => { c.onchange = () => G.set(c.dataset.gs, c.checked); });
    d.querySelectorAll('[data-rate]').forEach((c) => { c.onchange = () => { const v = Math.max(0, Math.round(parseEur(c.value) || 0)); G.set(`rateMax:${c.dataset.rate}`, v); dashToast(v ? `${RATE_GROUPS[c.dataset.rate].name}: max. ${v} Abrufe/Min` : 'Gemeinsames Limit aus'); renderDash(true); }; });
    { const b = d.querySelector('#d-sk'); if (b) b.onclick = () => { startklar().catch((e) => { skRunning = false; console.error('[QuickBuy] Startklar:', e); }); }; }
    d.querySelectorAll('[data-capreset]').forEach((b) => { b.onclick = () => { const k = b.dataset.capreset; const o = G.get(`cap:${k}`, null) || {}; G.set(`cap:${k}`, { lvl: 0, last: 0, hits: o.hits || [] }); dashToast('Captcha-Bremse zurückgesetzt'); renderDash(true); }; });
    // Discord-Bot
    const bTok = d.querySelector('#b-token');
    if (bTok) bTok.onchange = () => { const v = norm(bTok.value); if (v) { G.set('botToken', v); G.set('botLast', ''); bTok.value = ''; dashToast('Bot-Token gespeichert'); renderDash(true); } };
    const bCh = d.querySelector('#b-ch');
    if (bCh) bCh.onchange = () => { const v = norm(bCh.value); if (v && !/^\d{15,22}$/.test(v)) { alert('Die Kanal-ID besteht nur aus Ziffern (Rechtsklick auf den Kanal → Kanal-ID kopieren).'); return; } G.set('botChannel', v); G.set('botLast', ''); };
    const bUs = d.querySelector('#b-users');
    if (bUs) bUs.onchange = () => { const v = norm(bUs.value).replace(/[^\d,; ]/g, ''); G.set('botUsers', v); bUs.value = v; };
    const bOn = d.querySelector('#b-on');
    if (bOn) bOn.onchange = () => {
      if (bOn.checked && (!G.get('botToken', '') || !/^\d{15,22}$/.test(String(G.get('botChannel', ''))) || !/\d{15,22}/.test(String(G.get('botUsers', ''))))) {
        alert('Bitte zuerst Bot-Token, Kanal-ID und deine Nutzer-ID eintragen.'); bOn.checked = false; return;
      }
      G.set('botOn', bOn.checked); if (bOn.checked) { G.set('botLast', ''); botState = { ok: null, msg: 'verbinde …', at: Date.now() }; botPoll(); }
      renderDash(true);
    };
    const wh = d.querySelector('#d-wh');
    if (wh) wh.onchange = () => { const v = norm(wh.value); if (v && !WEBHOOK_RE.test(v)) { alert('Keine gültige Discord-Webhook-URL.'); return; } G.set('webhook', v); };
    d.querySelectorAll('[data-dc]').forEach((c) => { c.onchange = () => G.set(c.dataset.dc, c.checked); });
  }
  const keyOf2 = (id, u) => String(SHOPS[id].productKey ? SHOPS[id].productKey(u) : stripUrl(u)).toLowerCase();


  /* ---------- Fernsteuerung: dieser Tab reagiert auf Start/Stop aus dem Dashboard ---------- */
  const TAB_START = Date.now();

  /* ---------- Hintergrundaufgaben ohne Dashboard ----------
   * Discord-Befehle, Radar, Tab-Wächter und Selbsttest laufen im Dashboard-Tab. Ist der zu, übernimmt GENAU EIN Shop-Tab
   * (Absprache über eine „Leitung“ in GM-Storage, 20 s gültig). Die Tab-Kennung bleibt über Neuladen erhalten (sessionStorage),
   * damit ein Shop, der jede Runde neu lädt, seine Leitung behält. */
  const TAB_ID = (() => { try { let v = sessionStorage.getItem('qbTabId'); if (!v) { v = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('qbTabId', v); } return v; } catch (e) { return Math.random().toString(36).slice(2, 10); } })();
  let choreTicks = 0;
  function choresTick() {
    if (Date.now() - (GM_getValue('global:dashBeat', 0) || 0) < 10000) { choreTicks = 0; return; }   // Dashboard offen → macht es selbst
    const lease = GM_getValue('global:choresLease', null);
    if (lease && lease.id !== TAB_ID && Date.now() - lease.at < 20000) { choreTicks = 0; return; }
    GM_setValue('global:choresLease', { id: TAB_ID, at: Date.now(), shop: SHOP_ID });
    // erst ab dem zweiten Durchgang handeln – so gewinnt bei gleichzeitigem Zugriff nur ein Tab
    if (choreTicks++ === 0) return;
    const mine = GM_getValue('global:choresLease', null);
    if (!mine || mine.id !== TAB_ID) { choreTicks = 0; return; }
    botPoll().catch((e) => console.error('[QuickBuy] Discord:', e));
    if (choreTicks % 5 === 0) {
      try { watchdog(); } catch (e) { console.error('[QuickBuy] Wächter:', e); }
      try { reportTick(); } catch (e) { console.error('[QuickBuy] Selbsttest:', e); }
      radarTick().catch((e) => console.error('[QuickBuy] Radar:', e));
    }
  }

  /* ---------- Schlafende Tabs ----------
   * Chrome („Speicher sparen“) und Edge („Schlafende Tabs“) frieren Hintergrund-Tabs ein oder entladen sie → keine Prüfung.
   * Erkennung: Lücke im Herzschlag (läuft im Worker, wird also nicht gedrosselt), document.wasDiscarded, freeze/resume. */
  let yielded = false; let lastBeat = 0;
  const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} };
  if (/#qb-auto$/.test(location.hash)) { ssSet('qbAuto', '1'); try { history.replaceState(null, '', location.href.replace(/#qb-auto$/, '')); } catch (e) {} }
  // Darf dieser Tab sich selbst schließen? Nur Tabs, die das Script geöffnet hat oder die schon für den Shop geprüft haben
  const isWorkerTab = () => ssGet('qbAuto') === '1' || ssGet('qbWorker') === SHOP_ID;
  function claimOwner() { S.set('owner', { id: TAB_ID, at: Date.now() }); ssSet('qbWorker', SHOP_ID); }

  /* Prüf-Zentrum aktiv → Shop-Tab prüft nicht selbst, sondern „parkt“. Vom Script geöffnete Hintergrund-Tabs schließen sich;
   * ein Tab, den du selbst offen hast, bleibt und dient als Bereitschafts-Tab (übernimmt Treffer sofort, solange er im Hintergrund liegt). */
  let parked = false; let kickSeen = 0;
  function closeSelf() {
    yielded = true; busy = true;
    setTimeout(() => { try { window.close(); } catch (e) {} setTimeout(() => { if (document.hidden) location.replace('about:blank'); }, 1500); }, 300);
  }
  function park(msg) {
    const o = S.get('owner'); if (o && o.id === TAB_ID) S.set('owner', null);
    if (parked) return;
    parked = true; busy = true;
    if (msg) log(msg, 'info');
    // nur schließen, wenn ein anderer Tab das Prüf-Zentrum führt (sonst würde am Ende niemand mehr prüfen)
    { const L = GM_getValue('global:centralLease', null);
      if (isWorkerTab() && document.hidden && L && L.id !== TAB_ID && Date.now() - L.at < 6000) return closeSelf(); }
    const st = document.getElementById('qb-cd'); if (st) st.textContent = '🛰️ Prüf-Zentrum prüft im Hintergrund – dieser Tab steht bereit';
    const poll = () => later(400, () => {
      if (!parked) return;
      if (!S.get('running')) { parked = false; busy = false; renderPanel(); return; }
      if (document.hidden) S.set('parkBeat', Date.now());
      const hit = S.get('cHit');
      const mustRun = !centralOK(SHOP_ID);
      if (!ownerFresh(SHOP_ID) && (mustRun || (document.hidden && hit && Date.now() - hit.at < 10000))) {
        parked = false; claimOwner(); S.set('navAt', Date.now());
        log(mustRun ? 'Shop prüft wieder im eigenen Tab – dieser Tab übernimmt' : 'Treffer vom Prüf-Zentrum → Bereitschafts-Tab übernimmt', mustRun ? 'info' : 'buy');
        location.href = (hit && !mustRun && hit.url) || cur().url;
        return;
      }
      poll();
    });
    poll();
  }
  /* ---------- Startklar-Check (Shop-Tab) ----------
   * Das Dashboard öffnet die Warenkorb-Seite im Hintergrund; der Tab prüft Anmeldung und fremde Artikel, meldet das Ergebnis
   * und schließt sich. Er kauft nichts und ändert nichts. */
  const PREFLIGHT = (() => {
    if (window.top !== window || !SHOP || SHOP.internal || !SHOP.isBasket || !SHOP.isBasket(location.pathname)) return false;
    const pf = S.get('preflight');
    return !!(pf && Date.now() - pf.at < 120000 && ssGet('qbAuto') === '1');
  })();
  async function runPreflight() {
    yielded = true; busy = true;           // prüft nicht mit, beansprucht den Shop nicht
    const t0 = Date.now();
    const ready = () => (SHOP.cartReady ? SHOP.cartReady() : document.readyState === 'complete' && Date.now() - t0 > 6000);
    while (Date.now() - t0 < 45000 && !ready()) await sleep(1000);
    await sleep(1500);
    const res = { at: Date.now(), login: null, n: null, foreign: [], note: '' };
    try { res.login = !loggedOutHint(); } catch (e) {}
    try {
      if (SHOP.cartItems) {
        const items = SHOP.cartItems();
        const keys = (S.get('products') || []).map((x) => keyOf(x.url)).filter((k) => k && k.length >= 5);
        res.n = items.length;
        res.foreign = items.filter((it) => !keys.some((k) => (it.href || (it.box && it.box.innerHTML) || '').toLowerCase().includes(k))).map((it) => it.title || '?').slice(0, 5);
      } else {
        const c = cartCountAny(); res.n = c === null || c === undefined ? null : c;
      }
    } catch (e) { res.note = 'Warenkorb nicht lesbar'; }
    if (!ready()) res.note = 'Warenkorb lud nicht vollständig';
    S.set('preflightRes', res); S.set('preflight', null);
    log(`Startklar-Check: ${res.login === false ? 'NICHT angemeldet' : 'angemeldet'}, Warenkorb ${res.n === null ? '?' : res.n} Artikel${res.foreign.length ? ` (fremd: ${res.foreign.join(', ')})` : ''}`, res.login === false || res.foreign.length ? 'warn' : 'ok');
    setTimeout(() => { try { window.close(); } catch (e) {} setTimeout(() => { if (document.hidden) location.replace('about:blank'); }, 1500); }, 300);
  }

  // Treffer-Tab ist fertig (nicht kaufbar o. Ä.) → zurück an das Prüf-Zentrum
  function handBack() {
    // Prüf-Zentrum meldete „verfügbar“, die Shop-Seite aber nicht → merken (verhindert, dass jede Runde ein Tab aufgeht)
    const hit = S.get('cHit');
    if (hit && hit.url && Date.now() - hit.at < 300000) {
      const fh = { ...(S.get('falseHits') || {}) }; const k = keyOf(hit.url);
      const o = fh[k] && Date.now() - fh[k].at < 1800e3 ? fh[k] : { n: 0 };
      fh[k] = { n: o.n + 1, at: Date.now() }; S.set('falseHits', fh);
    }
    S.set('stage', 'product'); S.set('cHit', null); S.set('cLast', Date.now());
    S.set('captchaSince', 0);          // Seite lud normal → kein Captcha (mehr)
    park('Zurück an das Prüf-Zentrum');
  }
  // Ein anderer Tab prüft diesen Shop schon → dieser hört auf (Hintergrund-Tab des Scripts: schließt sich ganz)
  function retireTab(why) {
    if (yielded) return;
    if (isWorkerTab() && document.hidden) {
      yielded = true; busy = true;
      log(`${why} – doppelter Tab schließt sich`, 'info');
      setTimeout(() => { try { window.close(); } catch (e) {} setTimeout(() => { if (!document.hidden) return; location.replace('about:blank'); }, 1500); }, 300);
      return;
    }
    yieldTab();
  }
  function sleepDetected(gapMs, how) {
    if (!S.get('running')) return;
    const l = (S.get('sleeps') || []).filter((t) => Date.now() - t < 7 * 86400e3);
    l.push(Date.now()); S.set('sleeps', l.slice(-50));
    const mins = gapMs ? Math.round(gapMs / 60000) : 0;
    log(`Tab wurde schlafen gelegt (${how}${mins ? `, ${mins} Min. keine Prüfung` : ''}) – im Browser „immer aktiv lassen“ einstellen (Dashboard → Einstellungen)`, 'warn');
    if (Date.now() - (S.get('sleepDcAt') || 0) > 3600e3) {
      S.set('sleepDcAt', Date.now());
      discord('error', `Der Tab von **${SHOP.name}** wurde vom Browser oder PC schlafen gelegt${mins ? ` (${mins} Min. ohne Prüfung)` : ''}. Er läuft wieder – damit das nicht erneut passiert: Browser-Einstellung „Diese Websites immer aktiv lassen“ (Anleitung im Dashboard unter Einstellungen).`);
    }
  }
  function beatTick() {
    const now = Date.now();
    if (lastBeat && now - lastBeat > 60000) sleepDetected(now - lastBeat, 'Pause erkannt');
    lastBeat = now;
    if (yielded || PREFLIGHT) return;
    if (parked) { S.set('heartbeat', now); return; }
    // Prüf-Zentrum hat diesen Tab abgemeldet (prüfte noch selbst oder hing nach einem Treffer)
    { const k = S.get('kick') || 0;
      if (k > kickSeen && k > TAB_START && S.get('running') && S.get('stage') === 'product') { kickSeen = k; return park('Prüf-Zentrum übernimmt die Prüfung'); } }
    if (S.get('running') && otherOwner()) {
      // Zwei Tabs prüfen denselben Shop (z. B. alter Tab ist nach dem Schlafen wieder aufgewacht) → dieser tritt zurück.
      // Mitten im Bezahlen nie abbrechen.
      if (/^(product|basket)$/.test(S.get('stage'))) return retireTab('Shop läuft schon in einem anderen Tab');
      return;
    }
    S.set('heartbeat', now);
    if (S.get('running')) claimOwner();
  }
  // Läuft der Shop schon in einem anderen Tab? Dann wartet dieser hier, statt doppelt zu prüfen
  function otherOwner() { const o = S.get('owner'); return !!(o && o.id !== TAB_ID && Date.now() - o.at < 15000); }
  function yieldTab() {
    yielded = true; busy = true;
    const worker = isWorkerTab();
    log(worker ? 'Shop läuft schon in einem anderen Tab – dieser Tab wartet (übernimmt, falls der andere ausfällt)'
      : 'Shop läuft schon in einem anderen Tab – dieser Tab bleibt normal bedienbar und prüft nicht mit', 'info');
    if (!worker) return;          // von dir selbst geöffneter Tab: nichts tun, nie wegnavigieren
    const poll = () => later(5000, () => {
      if (!S.get('running')) { yielded = false; busy = false; return; }
      if (otherOwner()) return poll();
      yielded = false; claimOwner();
      log('Anderer Tab antwortet nicht mehr – dieser Tab übernimmt', 'info');
      S.set('navAt', Date.now()); location.href = cur().url || location.href;
    });
    poll();
  }

  function startRemoteWatch() {
    if (window.top !== window) return;
    { const hb = () => later(5000, () => { try { beatTick(); } catch (e) { console.error('[QuickBuy]', e); } hb(); }); beatTick(); hb(); }
    try { if (document.wasDiscarded) setTimeout(() => sleepDetected(0, 'vom Browser entladen'), 1500); } catch (e) {}
    { let frozenAt = 0;
      document.addEventListener('freeze', () => { frozenAt = Date.now(); });
      document.addEventListener('resume', () => { if (frozenAt) sleepDetected(Date.now() - frozenAt, 'vom Browser eingefroren'); frozenAt = 0; lastBeat = Date.now(); }); }
    { const tick = () => later(4000, () => { try { choresTick(); } catch (e) { console.error('[QuickBuy]', e); } tick(); }); setTimeout(tick, 1500 + Math.random() * 1500); }
    S.set('heartbeat', Date.now());
    let snap = '';
    let lastPath = location.pathname;
    setInterval(() => {
      // Das Dashboard hat diesen Tab für abgestürzt gehalten und einen neuen geöffnet → dieser Tab tritt zurück (sonst laufen zwei)
      if ((S.get('reopenAt') || 0) > TAB_START && S.get('running') && /^(product|basket)$/.test(S.get('stage'))) {
        if (!yielded) { log('Ersatz-Tab ist aktiv – dieser alte Tab beendet sich', 'info'); yielded = true; busy = true; setTimeout(() => { try { window.close(); } catch (e) {} setTimeout(() => location.replace('about:blank'), 1500); }, 300); }
        return;
      }
      if (!yielded) S.set('heartbeat', Date.now());
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
      // Seite hat ohne Neuladen gewechselt (Single-Page-App) → Ablauf für die neue Seite starten
      if (running && location.pathname !== lastPath) {
        lastPath = location.pathname;
        const st = S.get('stage');
        if (st === 'checkout' && SHOP.isCheckout(location.pathname) && !checkoutRunning) runCheckout();
        else if (st === 'basket' && SHOP.isBasket(location.pathname)) runBasket();
      }
      // Panel aktualisieren, wenn im Dashboard etwas geändert wurde
      const p = document.getElementById('qb-panel');
      const now = JSON.stringify([running, S.get('autoOrder'), S.get('products').length, S.get('payMethod'), S.get('dropAt')]);
      if (now !== snap) {
        if (snap && p && !(p.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) renderPanel();
        snap = now;
      }
    }, 3000);
  }

  try { GM_registerMenuCommand('📊 QuickBuy Dashboard öffnen', openStandaloneDashboard); } catch (e) {}
  if (STANDALONE) {
    // example.com komplett durch das Dashboard ersetzen
    if (window.top !== window) return;
    document.title = '📊 QuickBuy Dashboard';
    document.documentElement.innerHTML = '<head><meta charset="utf-8"><title>📊 QuickBuy Dashboard</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#0b0c0f"></body>';
    const beat = () => GM_setValue('global:dashBeat', Date.now());
    beat(); setInterval(beat, 2000);
    openDashboard();
    // Hintergrundaufgaben des Dashboards: Tab-Wächter, Radar, täglicher Selbsttest
    const chores = () => {
      try { watchdog(); } catch (e) { console.error('[QuickBuy] Wächter:', e); }
      try { reportTick(); } catch (e) { console.error('[QuickBuy] Selbsttest:', e); }
      radarTick().catch((e) => console.error('[QuickBuy] Radar:', e));
    };
    const loop = (ms, fn) => { const tick = () => later(ms, () => { Promise.resolve().then(fn).catch((e) => console.error('[QuickBuy]', e)).finally(tick); }); tick(); };
    setTimeout(chores, 5000); loop(20000, chores);
    loop(4000, botPoll);
    try { migrateAmazonDe(); } catch (e) { console.error('[QuickBuy] Amazon-Umstellung:', e); }
    startCentral();
    console.log('[QuickBuy] Dashboard-Tab aktiv');
    return;
  }
  if (SHOP_ID === '__queue') { queuePage(); return; }
  startRemoteWatch();
  if (window.top === window) startCentral();      // übernimmt nur, wenn kein Dashboard offen ist

  console.log(`[QuickBuy] Version ${(GM_info && GM_info.script && GM_info.script.version) || '?'} aktiv auf ${location.hostname} → Shop: ${SHOP.name}`);
  main().catch((e) => { console.error('[QuickBuy] Fehler:', e); try { log(`Interner Fehler: ${e && e.message}`, 'err'); } catch (e2) {} });

})();
