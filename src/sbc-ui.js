  // ==================================================================
  // SBC-SOLVER – Anbindung an die EA Web App + Oberfläche
  // ==================================================================
  const SBCUI = (() => {
    // ---------- 1) Netzwerk mitlesen (nur lesen): Anforderungen, Squad, Vereinsdaten ----------
    const NETHOOKS = [];   // weitere Module hängen sich hier an (Sperren-Schutz, Pack-Auswertung)
    const emitNet = (url, method, status, text, body) => {
      if (!url || !/\/ut\/game\//.test(url)) return;
      for (const h of NETHOOKS) { try { h(String(url), String(method || 'GET').toUpperCase(), status, text, body); } catch (e) { /* */ } }
    };
    const CAP = { hooks: NETHOOKS, challenges: new Map(), currentId: null, currentAt: 0, squads: new Map(), raw: new Map(), urls: [], activeIds: null };

    function findChallengeObjects(data, out = [], depth = 0) {
      if (!data || typeof data !== 'object' || depth > 5) return out;
      if (Array.isArray(data)) { data.forEach((x) => findChallengeObjects(x, out, depth + 1)); return out; }
      if (Array.isArray(data.elgReq) && data.challengeId != null) out.push(data);
      else Object.values(data).forEach((v) => findChallengeObjects(v, out, depth + 1));
      return out;
    }

    function capture(url, text) {
      if (!url || !text || !/\/ut\/game\//.test(url)) return;
      let data;
      try { data = JSON.parse(text); } catch { return; }
      const u = String(url).split('?')[0];
      if (CAP.urls.length > 40) CAP.urls.shift();
      CAP.urls.push(u.replace(/^.*\/ut\/game\/[^/]+/, ''));
      const setM = u.match(/\/sbs\/setId\/(\d+)\/challenges/);
      for (const c of findChallengeObjects(data)) { if (setM) c.__setId = +setM[1]; CAP.challenges.set(c.challengeId, c); }
      const m = u.match(/\/sbs\/challenge\/(\d+)(\/squad)?$/);
      if (m) {
        CAP.currentId = +m[1]; CAP.currentAt = Date.now();
        if (data && data.squad) CAP.squads.set(+m[1], data.squad);
      }
      if (/\/squad\/active$/.test(u) || (/\/squad\/\d+$/.test(u) && data && data.squadType === 'CLUB')) {
        const pl = (data && (data.players || (data.squad && data.squad.players))) || [];
        const ids = pl.map((x) => x && x.itemData && x.itemData.id).filter((x) => x);
        if (ids.length) CAP.activeIds = ids;
      }
      const arr = data && (Array.isArray(data.itemData) ? data.itemData : Array.isArray(data.items) ? data.items : null);
      // Transferliste / Beobachtungsliste / Suchergebnisse: Items stecken in auctionInfo[].itemData
      if (data && Array.isArray(data.auctionInfo)) {
        for (const ai of data.auctionInfo) {
          const it = ai && ai.itemData;
          if (it && it.id != null) CAP.raw.set(it.id, Object.assign({}, CAP.raw.get(it.id) || {}, it));
          // Kauf erkannt (Sofortkauf oder gewonnenes Gebot) -> Kaufpreis automatisch merken
          if (it && it.id != null && ai.tradeState === 'closed' && ai.bidState === 'highest' && ai.tradeOwner === false) {
            recordBuy(it.id, ai.currentBid || ai.buyNowPrice);
          }
        }
      }
      if (arr && /\/(club|purchased\/items|storagepile|item)/.test(u)) {
        const dupSrc = /purchased\/items/.test(u);
        for (const it of arr) if (it && it.id != null) CAP.raw.set(it.id, Object.assign({}, it, dupSrc ? { __unassigned: true } : {}));
      }
    }

    try {
      const XP = W.XMLHttpRequest && W.XMLHttpRequest.prototype;
      if (XP && !XP.__fcptSbc) {
        const oOpen = XP.open, oSend = XP.send;
        XP.open = function (m, url) { this.__fcptUrl = url; this.__fcptMethod = m; return oOpen.apply(this, arguments); };
        XP.send = function (body) {
          try {
            this.__fcptBody = body;
            this.addEventListener('load', function () {
              try {
                const txt = !this.responseType || this.responseType === 'text' ? this.responseText : this.responseType === 'json' ? JSON.stringify(this.response) : null;
                emitNet(this.__fcptUrl, this.__fcptMethod, this.status, txt, this.__fcptBody);
              } catch (e) { /* */ }
              try {
                if (!this.responseType || this.responseType === 'text') capture(this.__fcptUrl, this.responseText);
                else if (this.responseType === 'json') capture(this.__fcptUrl, JSON.stringify(this.response));
              } catch (e) { /* ignorieren */ }
            });
          } catch (e) { /* ignorieren */ }
          return oSend.apply(this, arguments);
        };
        XP.__fcptSbc = true;
      }
      if (typeof W.fetch === 'function' && !W.fetch.__fcptSbc) {
        const oFetch = W.fetch;
        const wrapped = function (input, init) {
          const url = typeof input === 'string' ? input : input && input.url;
          return oFetch.apply(this, arguments).then((res) => {
            try { if (/\/ut\/game\//.test(url || '')) res.clone().text().then((t) => { capture(url, t); emitNet(url, (init && init.method) || (input && input.method), res.status, t, init && init.body); }).catch(() => {}); } catch (e) { /* */ }
            return res;
          });
        };
        wrapped.__fcptSbc = true;
        W.fetch = wrapped;
      }
    } catch (e) { log('Netzwerk-Mitschnitt nicht möglich', e); }

    // ---------- 2) EA-Objekte finden ----------
    const observeOnce = (obs, ms = 10000) => new Promise((resolve, reject) => {
      if (!obs || typeof obs.observe !== 'function') return reject(new Error('Keine EA-Antwort (kein Observable)'));
      const sub = {};
      const t = setTimeout(() => reject(new Error('Zeitüberschreitung bei EA')), ms);
      obs.observe(sub, (o, ev) => { clearTimeout(t); try { o && o.unobserve && o.unobserve(sub); } catch (e) { /* */ } resolve(ev || {}); });
    });

    const isChallenge = (o) => !!o && typeof o === 'object' && ((W.UTSBCChallengeEntity && o instanceof W.UTSBCChallengeEntity) || ('elgReq' in o && 'squad' in o));
    const isSquad = (o) => !!o && typeof o === 'object' && ((W.UTSquadEntity && o instanceof W.UTSquadEntity) || (typeof o.getPlayers === 'function' && 'formation' in o));

    function scanFor(obj, depth, want, seen = new Set()) {
      if (!obj || typeof obj !== 'object' || seen.has(obj) || depth < 0) return null;
      seen.add(obj);
      if (want(obj)) return obj;
      let vals = [];
      try {
        if (obj instanceof Map || obj instanceof Set) vals = [...obj.values()];
        else vals = Object.keys(obj).map((k) => { try { return obj[k]; } catch (e) { return null; } });
      } catch (e) { return null; }
      for (const v of vals) {
        if (!v || typeof v !== 'object' || v === W || (v.nodeType && v.nodeType > 0)) continue;
        if (Array.isArray(v) && v.length > 300) continue;
        const r = scanFor(v, depth - 1, want, seen);
        if (r) return r;
      }
      return null;
    }

    function contextFromRepository(id) {
      if (id == null) return null;
      const repo = W.services && W.services.SBC && (W.services.SBC.repository || W.services.SBC.sbcDAO);
      const ch = scanFor(repo, 6, (o) => isChallenge(o) && (o.id === id || o.challengeId === id));
      if (!ch) return null;
      return { controller: null, challenge: ch, squad: isSquad(ch.squad) ? ch.squad : null, via: 'repository' };
    }

    // Nur lesen, nichts an EA verändern: erst EAs SBC-Daten, dann die Navigation durchsuchen
    function findSbcContext() {
      const w = findSbcContextWalk();
      if (w && w.squad) return w;
      const r = contextFromRepository(CAP.currentId);
      if (r && r.squad) return Object.assign(r, { controller: (w && w.controller) || null });
      return w || r || null;
    }

    function findSbcContextWalk() {
      let root = null;
      try { root = W.getAppMain && W.getAppMain().getRootViewController(); } catch (e) { /* */ }
      if (!root) return null;
      const seen = new Set();
      const queue = [[root, 0]];
      const kids = ['_leftController', '_rightController', '_currentController', '_childViewControllers', '_viewControllers',
        '_presentedViewController', '_navigationController', '_rootController', '_controllers', '_tabController'];
      const getters = ['getPresentedViewController', 'getCurrentViewController', 'getCurrentController'];
      while (queue.length) {
        const [o, d] = queue.shift();
        if (!o || typeof o !== 'object' || seen.has(o) || d > 9) continue;
        seen.add(o);
        if (o._challenge && (o._squad || o._challenge.squad)) return { controller: o, challenge: o._challenge, squad: o._squad || o._challenge.squad, via: 'walk' };
        for (const k of kids) {
          const v = o[k];
          if (Array.isArray(v)) v.forEach((x) => queue.push([x, d + 1]));
          else if (v) queue.push([v, d + 1]);
        }
        for (const g of getters) {
          if (typeof o[g] === 'function') { try { const v = o[g](); if (v) queue.push([v, d + 1]); } catch (e) { /* */ } }
        }
      }
      return null;
    }

    function slotList(squad) {
      if (!squad) return [];
      let arr = null;
      for (const fn of ['getPlayers', 'getFieldPlayers', 'getSlots']) {
        if (typeof squad[fn] === 'function') { try { arr = squad[fn](); } catch (e) { /* */ } if (Array.isArray(arr) && arr.length) break; }
      }
      if (!Array.isArray(arr)) arr = squad._players || squad.players || [];
      return arr;
    }
    const slotItem = (s) => (s && (typeof s.getItem === 'function' ? s.getItem() : s.item || s._item)) || null;
    function slotPos(s) {
      if (!s) return null;
      const p = typeof s.getPosition === 'function' ? s.getPosition() : s.position || s._position;
      if (p == null) return null;
      if (typeof p === 'object') return SBC.normPos(p.typeName || p.typeId);
      return SBC.normPos(p);
    }
    const slotBlocked = (s) => { try { return !!(s && ((typeof s.isBrick === 'function' && s.isBrick()) || s.isLocked === true || s.locked === true)); } catch (e) { return false; } };

    // ---------- 3) Verein laden ----------
    let club = null; // { at, players: [], ents: Map }

    const PRICE_EST = { 83: 1800, 84: 3200, 85: 5500, 86: 9500, 87: 14000, 88: 20000, 89: 30000, 90: 45000 };
    function estValue(rating, rarity) {
      if (rating < 65) return 150;
      if (rating < 75) return 250;
      if (rating < 80) return 350 + (rating - 75) * 80 + (rarity ? 100 : 0);
      if (rating < 83) return 700 + (rating - 80) * 200 + (rarity ? 150 : 0);
      if (PRICE_EST[rating]) return PRICE_EST[rating];
      return Math.round(45000 * Math.pow(1.45, rating - 90));
    }

    function toPlayer(ent, extra) {
      const raw = CAP.raw.get(ent.id) || {};
      const g = (...v) => v.find((x) => x !== undefined && x !== null);
      const isPl = typeof ent.isPlayer === 'function' ? ent.isPlayer() : (raw.itemType || ent.type) === 'player';
      if (!isPl) return null;
      const rating = g(raw.rating, ent.rating);
      const rarity = g(raw.rareflag, ent.rareflag, 0);
      const def = g(ent.definitionId, raw.resourceId, ent.resourceId);
      let posList = g(raw.possiblePositions, ent.possiblePositions, []);
      if (!Array.isArray(posList) || !posList.length) posList = [g(raw.preferredPosition, ent.preferredPosition)];
      const positions = [...new Set(posList.map(SBC.normPos).filter(Boolean))];
      const sd = typeof ent.getStaticData === 'function' ? ent.getStaticData() : ent._staticData || {};
      const untradeable = !!g(raw.untradeable, ent.untradeable, false);
      const loans = g(raw.loans, ent.loans, 0);
      const resId = g(ent.resourceId, raw.resourceId, def);
      const futbin = cacheGet(`futbin:${settings.platform}:${resId}`);
      const value = g(futbin, raw.marketAverage, estValue(rating, rarity));
      const unassigned = !!(extra && extra.unassigned) || !!raw.__unassigned;
      const storage = !!(extra && extra.dup && !extra.unassigned);
      const dup = !!(extra && extra.dup) || !!raw.__unassigned || (typeof ent.isDuplicate === 'function' && (() => { try { return ent.isDuplicate(); } catch (e) { return false; } })());
      const mult = untradeable ? (dup ? 0.1 : settings.sbcPreferUntradeable ? 0.6 : 1) : 1;
      return {
        id: ent.id, def, resId, fullName: [sd.firstName, sd.lastName].filter(Boolean).join(' '), assetId: g(raw.assetId, ent.assetId, def != null ? def % 16777216 : ent.id),
        name: sd.name || [sd.firstName, sd.lastName].filter(Boolean).join(' ') || `#${def}`,
        rating, rarity, nationId: g(raw.nation, ent.nationId, ent.nation), leagueId: g(raw.leagueId, ent.leagueId),
        clubId: g(raw.teamid, ent.teamId, ent.teamid), positions, untradeable, loans, owners: g(raw.owners, ent.owners, 1),
        dup, unassigned, storage, value, priceSrc: futbin != null ? 'Futbin' : raw.marketAverage ? 'EA' : 'Schätzung',
        cost: Math.round(value * mult) + rating * 0.01,
        special: rarity > 1,
      };
    }

    async function pagedSearch(fnName, service, label, setStatus, extra, maxPages = 50) {
      const VM = W.UTBucketedItemSearchViewModel;
      const crit = VM ? new VM().searchCriteria : null;
      if (!crit) throw new Error('EA-Suchobjekt nicht gefunden (UTBucketedItemSearchViewModel)');
      try { if (W.SearchType && W.SearchType.PLAYER) crit.type = W.SearchType.PLAYER; } catch (e) { /* */ }
      crit.count = 91;
      const ents = [];
      for (let page = 0, offset = 0; page < maxPages; page++, offset += 91) {
        crit.offset = offset;
        setStatus(`${label}: Seite ${page + 1} … (${ents.length} Karten)`);
        const ev = await observeOnce(service[fnName](crit));
        const payload = ev.response || ev.data || {};
        const items = payload.items || payload.itemData || [];
        items.forEach((it) => ents.push([it, extra]));
        if (!items.length || payload.retrievedAll === true || payload.endOfList === true) break;
        await sleep(300 + Math.random() * 300);
      }
      return ents;
    }

    async function loadClub(setStatus, force) {
      if (club && !force && Date.now() - club.at < 10 * 60000) return club;
      const S = W.services;
      if (!S || !S.Club || typeof S.Club.search !== 'function') throw new Error('EA-Vereinssuche nicht gefunden');
      const all = await pagedSearch('search', S.Club, 'Verein', setStatus);
      if (S.Item && typeof S.Item.searchStorageItems === 'function') {
        try { (await pagedSearch('searchStorageItems', S.Item, 'SBC-Lager', setStatus, { dup: true })).forEach((x) => all.push(x)); } catch (e) { log('Lager', e); }
      }
      if (S.Item && typeof S.Item.requestUnassignedItems === 'function') {
        try {
          setStatus('Nicht zugewiesene Karten …');
          const ev = await observeOnce(S.Item.requestUnassignedItems());
          const items = (ev.response || ev.data || {}).items || [];
          items.forEach((it) => all.push([it, { dup: true, unassigned: true }]));
        } catch (e) { log('Unzugewiesen', e); }
      }
      const ents = new Map();
      const players = [];
      for (const [ent, extra] of all) {
        if (!ent || ents.has(ent.id)) continue;
        const p = toPlayer(ent, extra);
        if (!p) continue;
        ents.set(ent.id, ent);
        players.push(p);
      }
      club = { at: Date.now(), players, ents };
      return club;
    }

    // ---------- 3b) Konzept-Spieler (Karten, die du NICHT besitzt) ----------
    // Werden nur eingeplant, wenn „Konzept-Spieler nutzen“ an ist. EA lässt sie in die SBC einsetzen,
    // einreichen geht erst, wenn du sie gekauft hast.
    if (settings.sbcConcepts === undefined) settings.sbcConcepts = false;
    let concept = null; // { at, players, ents }
    const nrm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, ' ').trim();

    async function loadConcepts(setStatus) {
      if (concept && Date.now() - concept.at < 3 * 3600000) return concept;
      const S = W.services;
      if (!S || !S.Item || typeof S.Item.searchConceptItems !== 'function') throw new Error('EA-Konzeptsuche nicht gefunden – bitte „Diagnose kopieren“ schicken');
      const owned = new Set((club ? club.players : []).map((p) => p.def).filter((x) => x != null));
      const all = await pagedSearch('searchConceptItems', S.Item, 'Konzept-Spieler laden (einmal pro Sitzung, ca. 1–2 Min.)', setStatus, null, 320);
      const ents = new Map(), players = [];
      for (const [ent] of all) {
        if (!ent) continue;
        try { if (typeof ent.isTimeLimited === 'function' && ent.isTimeLimited()) continue; } catch (e) { /* */ }
        const p = toPlayer(ent);
        if (!p || p.special || p.rating == null) continue;          // nur normale Gold/Silber/Bronze-Karten – Sonderkarten-Preise sind nicht schätzbar
        if (p.def != null && owned.has(p.def)) continue;             // hast du schon
        const key = 'c' + (p.def != null ? p.def : ent.id);
        if (ents.has(key)) continue;
        Object.assign(p, { id: key, concept: true, untradeable: false, dup: false, loans: 0 });
        ents.set(key, ent);
        players.push(p);
      }
      concept = { at: Date.now(), players, ents };
      return concept;
    }

    // Kaufpreis schätzen: Futbin-Preis (falls schon geprüft) > günstigste Karte des Ratings (Futbin) > Schätzung
    const conceptFail = new Set();
    // Aus geprüften Preisen lernen: Verhältnis echter Preis / Schätzung je Rating (Median)
    const ratios = {};
    const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
    function factorFor(r) {
      const own = ratios[r];
      if (own && own.length) return median(own);
      const all = Object.values(ratios).flat();
      return all.length >= 2 ? median(all) : 1;
    }
    function priceConcept(p) {
      const fb = cacheGet(`futbin:${settings.platform}:${p.resId}`);
      let v, src;
      if (fb) {
        v = fb; src = 'Futbin';
        if (p.estBase && !p.ratioDone) { (ratios[p.rating] = ratios[p.rating] || []).push(Math.max(0.3, Math.min(5, fb / p.estBase))); p.ratioDone = true; }
      } else {
        const rp = typeof RATINGS !== 'undefined' ? RATINGS.get() : null;
        const floor = rp && rp.prices[p.rating];
        if (floor) {
          const last = nrm(p.name).split(' ').pop();
          const listed = (rp.names[p.rating] || []).some((n) => nrm(n).split(' ').includes(last));
          v = listed ? floor : Math.round(floor * 1.35); src = listed ? 'Futbin (günstigste)' : 'geschätzt';
        } else { v = Math.round(estValue(p.rating, p.rarity) * 1.2); src = 'geschätzt'; }
        p.estBase = v;
        v = Math.round(v * factorFor(p.rating));
        if (conceptFail.has(p.id)) v *= 3;   // bei Futbin nicht gefunden -> eher meiden
      }
      p.value = v; p.priceSrc = src; p.verified = !!fb;
      p.cost = Math.round(v * 1.05) + 50 + p.rating * 0.01;   // bei gleichem Preis lieber eigene Karten
    }

    // Auswahl verkleinern (Solver bleibt schnell): pro Rating je Liga/Nation/Verein nur die günstigsten
    function conceptPool(constraints, excludeIds) {
      if (!concept) return [];
      const tr = constraints.find((c) => c.kind === 'TEAM_RATING_1_TO_100' && !c.unsupported);
      const maxR = Math.min(settings.sbcMaxRating > 0 ? settings.sbcMaxRating : 99, tr ? tr.value + 5 : 99);
      const L = concept.players.filter((p) => p.rating <= maxR && !excludeIds.has(p.id));
      L.forEach(priceConcept);
      L.sort((a, b) => a.cost - b.cost);
      const cnt = {}, keep = [];
      const bump = (k, max) => { cnt[k] = (cnt[k] || 0) + 1; return cnt[k] <= max; };
      for (const p of L) {
        const a = bump(`l${p.rating}:${p.leagueId}`, 4), b = bump(`n${p.rating}:${p.nationId}`, 3), c = bump(`c${p.rating}:${p.clubId}`, 2), d = bump(`p${p.rating}:${p.positions[0]}`, 3);
        if (a || b || c || d || p.verified) keep.push(p);
      }
      return keep;
    }

    // Für gewählte Konzept-Spieler echte Futbin-Preise holen (max. 11 Abrufe)
    async function verifyConcepts(players, setStatus) {
      let n = 0;
      for (const p of players) {
        if (!p || !p.concept || p.verified || conceptFail.has(p.id)) continue;
        if (typeof futbinBlocked === 'function' && futbinBlocked()) return { n, blocked: true };
        setStatus(`Prüfe Futbin-Preis: ${p.name} (${p.rating}) …`);
        try {
          const v = await getPrice('futbin', { resourceId: p.resId, name: p.name, fullName: p.fullName, rating: p.rating, isPlayer: true });
          if (!v) conceptFail.add(p.id);
        } catch (e) { conceptFail.add(p.id); if (typeof futbinBlocked === 'function' && futbinBlocked()) return { n, blocked: true }; }
        priceConcept(p); n++;
      }
      return { n, blocked: false };
    }
    const findPlayer = (id) => (club && club.players.find((p) => p.id === id)) || (concept && concept.players.find((p) => p.id === id)) || null;
    const entOf = (id) => (club && club.ents.get(id)) || (concept && concept.ents.get(id)) || null;

    // ---------- 4) Challenge lesen ----------
    function readChallenge() {
      const ctx = findSbcContext();
      const ch = ctx && ctx.challenge;
      const id = (ch && (ch.id ?? ch.challengeId)) ?? CAP.currentId;
      const cap = id != null ? CAP.challenges.get(id) : null;
      const elgReq = (cap && cap.elgReq) || (ch && Array.isArray(ch.elgReq) && ch.elgReq) || null;
      const formation = (cap && cap.formation) || (ch && ch.formation) || null;
      const name = (cap && cap.name) || (ch && (ch.name || ch.title)) || 'SBC';
      const squadEnt = ctx && (ctx.squad || (ctx.challenge && ctx.challenge.squad));
      const slots = slotList(squadEnt);
      let positions = slots.slice(0, 11).map(slotPos);
      if (positions.length === 11 && positions.every(Boolean) && formation) {
        // Positions-Reihenfolge direkt von EA merken -> auch für andere Aufgaben (Gruppen-Lösung) nutzbar
        settings.sbcFormations = settings.sbcFormations || {};
        if (JSON.stringify(settings.sbcFormations[formation]) !== JSON.stringify(positions)) { settings.sbcFormations[formation] = positions; saveSettings(); }
      }
      if (!positions.length || positions.some((p) => !p)) positions = formationPositions(formation);
      const liveEnum = W.SBCEligibilityKey;
      const decoded = elgReq ? SBC.decodeRequirements(elgReq, liveEnum) : null;
      return { ctx, id, name, formation, elgReq, decoded, slots, positions };
    }

    function formationPositions(formation) {
      const learned = settings.sbcFormations && settings.sbcFormations[formation];
      if (learned) return learned.slice();
      const f = formation && SBC.FORMATIONS[formation];
      return f ? f.slice() : null;
    }

    // ---------- 5) Einsetzen ----------
    let lastApplyError = null;
    async function apply(info, sol) {
      const ctx = findSbcContext() || info.ctx;
      const squad = ctx && (ctx.squad || (ctx.challenge && ctx.challenge.squad));
      if (!squad) throw new Error('SBC-Aufstellung nicht gefunden – geh einmal zurück, öffne die Aufgabe neu und versuche es erneut.');
      const slots = slotList(squad);
      const arr = slots.map((s, i) => {
        const p = sol.players[i];
        if (p && entOf(p.id)) return entOf(p.id);
        return slotItem(s);
      });
      let done = false;
      if (typeof squad.setPlayers === 'function') { squad.setPlayers(arr, true); done = true; }
      else {
        slots.forEach((s, i) => {
          for (const fn of ['setItem', 'setItemData', 'setPlayer']) if (typeof s[fn] === 'function' && arr[i]) { s[fn](arr[i]); done = true; break; }
        });
      }
      if (!done) throw new Error('EA-Funktion zum Setzen der Spieler nicht gefunden');
      const S = W.services && W.services.SBC;
      if (S && typeof S.saveChallenge === 'function' && ctx.challenge) {
        let ev = null;
        try { ev = await observeOnce(S.saveChallenge(ctx.challenge), 12000); } catch (e) { throw new Error('EA hat beim Speichern nicht geantwortet (' + e.message + ')'); }
        if (ev && ev.success === false) {
          const hint = ev.status === 404 ? ' – EA kennt eine der Karten an dieser Stelle nicht (z. B. noch unter „Neue Items“ oder inzwischen verkauft/verschoben). Bitte „Verein neu laden“ und erneut lösen'
            : ev.status === 409 ? ' – eine Karte steckt schon in einer anderen SBC-Aufstellung' : '';
          throw new Error('EA hat das Speichern abgelehnt' + (ev.status ? ` (Code ${ev.status})` : '') + hint);
        }
      }
      const c = ctx.controller;
      for (const fn of ['_pushSquadToView', 'refreshSquad', '_updateSquad', 'onDataChange', 'render']) {
        try { if (c && typeof c[fn] === 'function') c[fn](squad); } catch (e) { /* */ }
      }
      try { if (squad.onDataUpdated && typeof squad.onDataUpdated.notify === 'function') squad.onDataUpdated.notify(); } catch (e) { /* */ }
      // So aktualisiert EA selbst die Ansicht nach dem Laden einer Aufgabe (aus EAs Code: challenge.onDataChange.notify({squad}))
      try { const ch = ctx.challenge; if (ch && ch.onDataChange && typeof ch.onDataChange.notify === 'function') ch.onDataChange.notify({ squad }); } catch (e) { /* */ }
      return true;
    }

    // ---------- 6) Oberfläche ----------
    if (settings.sbcSpecials === undefined) settings.sbcSpecials = false;
    if (settings.sbcMaxRating === undefined) settings.sbcMaxRating = 0;
    if (settings.sbcPreferUntradeable === undefined) settings.sbcPreferUntradeable = true;
    if (settings.sbcKeep === undefined) settings.sbcKeep = false;
    if (settings.sbcTime === undefined) settings.sbcTime = 4;
    if (settings.sbcProtectActive === undefined) settings.sbcProtectActive = true;
    if (!Array.isArray(settings.sbcLocked)) settings.sbcLocked = [];   // [{id, name, rating}]
    const lockedIds = () => new Set(settings.sbcLocked.map((x) => x.id));

    async function activeSquadIds() {
      const ids = new Set(CAP.activeIds || []);
      try {
        const S = W.services && W.services.Squad;
        if (S && typeof S.getActiveSquad === 'function') {
          const ev = await observeOnce(S.getActiveSquad(), 6000);
          const pay = ev.response || ev.data || {};
          const sq = pay.squad || pay;
          slotList(sq).forEach((s2) => { const it = slotItem(s2); if (it && it.id) ids.add(it.id); });
        }
      } catch (e) { log('Aktive Mannschaft', e); }
      return ids;
    }

    GM_addStyle(`
      #fcpt-sbcbtn{position:fixed;right:24px;bottom:84px;z-index:100000;display:none;background:linear-gradient(135deg,#60a5fa,#2563eb);color:#fff;border:0;border-radius:999px;padding:11px 18px;font:700 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.45)}
      #fcpt-sbcbtn.show{display:block}
      #fcpt-sbc{--bg:#0b111c;--bg2:#121a28;--bg3:#1a2436;--line:#243149;--ink:#eef2f8;--ink2:#a7b3c6;--ink3:#7d8aa0;--gold:#f5c518;--pos:#22c55e;--neg:#ef4444;
        position:fixed;top:0;right:0;width:480px;max-width:100vw;height:100vh;z-index:100002;background:var(--bg);color:var(--ink);font:14px system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:-10px 0 30px rgba(0,0,0,.55);display:none;flex-direction:column;border-left:1px solid var(--line)}
      #fcpt-sbc.open{display:flex}
      #fcpt-sbc *{box-sizing:border-box}
      #fcpt-sbc .hd{padding:14px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px}
      #fcpt-sbc .hd .lg{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(135deg,#60a5fa,#2563eb);font-size:18px}
      #fcpt-sbc .hd .t{font-weight:800;font-size:15px}#fcpt-sbc .hd .s{font-size:12px;color:var(--ink3)}
      #fcpt-sbc .hd .x{margin-left:auto;width:34px;height:34px;border-radius:10px;background:var(--bg3);border:1px solid var(--line);color:var(--ink);cursor:pointer}
      #fcpt-sbc .bd{overflow:auto;padding:12px 14px 40px;display:flex;flex-direction:column;gap:12px;flex:1}
      #fcpt-sbc .grp{background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
      #fcpt-sbc h4{margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.6px;color:var(--ink3)}
      #fcpt-sbc .req{display:flex;gap:8px;align-items:flex-start;font-size:13px}
      #fcpt-sbc .req .ic{width:18px;flex:none;text-align:center}
      #fcpt-sbc .req.ok .ic{color:var(--pos)}#fcpt-sbc .req.bad .ic{color:var(--neg)}#fcpt-sbc .req.na .ic{color:#f59e0b}
      #fcpt-sbc .req .v{margin-left:auto;color:var(--ink3);font-variant-numeric:tabular-nums}
      #fcpt-sbc .opt{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px}
      #fcpt-sbc .opt small{display:block;color:var(--ink3);font-size:11px}
      #fcpt-sbc input[type=number]{width:80px;background:var(--bg3);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px 8px;font:inherit;text-align:right}
      #fcpt-sbc .btns{display:flex;gap:8px;flex-wrap:wrap}
      #fcpt-sbc .btn{flex:1;border:0;border-radius:10px;padding:11px 12px;font:700 14px system-ui,sans-serif;cursor:pointer;background:var(--bg3);color:var(--ink);border:1px solid var(--line)}
      #fcpt-sbc .btn.pri{background:linear-gradient(135deg,#60a5fa,#2563eb);border:0;color:#fff}
      #fcpt-sbc .btn.go{background:linear-gradient(135deg,#4ade80,#16a34a);border:0;color:#04120a}
      #fcpt-sbc .btn[disabled]{opacity:.5;cursor:default}
      #fcpt-sbc .st{font-size:12px;color:var(--ink2);min-height:16px}
      #fcpt-sbc .st.err{color:#fca5a5}
      #fcpt-sbc .sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(72px,1fr));gap:6px}
      #fcpt-sbc .sum>div{background:var(--bg3);border-radius:10px;padding:7px 9px}
      #fcpt-sbc .sum .l{font-size:11px;color:var(--ink3)}#fcpt-sbc .sum .v{font-size:17px;font-weight:800}
      #fcpt-sbc table{width:100%;border-collapse:collapse;font-size:12.5px}
      #fcpt-sbc th{text-align:left;color:var(--ink3);font-weight:500;padding:5px 4px;border-bottom:1px solid var(--line)}
      #fcpt-sbc td{padding:6px 4px;border-bottom:1px solid #1a2436}
      #fcpt-sbc td.n{text-align:right;font-variant-numeric:tabular-nums}
      #fcpt-sbc .tag{font-size:10px;font-weight:700;border-radius:4px;padding:1px 4px;margin-left:4px;background:#1f2b3d;color:#a7b3c6}
      #fcpt-sbc .tag.buy{background:rgba(59,130,246,.18);color:#93c5fd}
      #fcpt-sbc .buybox{background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.35);border-radius:10px;padding:8px 10px;margin:8px 0}
      #fcpt-sbc .buyrow{display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:2px 0;border-bottom:1px dashed rgba(255,255,255,.08)}
      #fcpt-sbc .tag.nh{background:rgba(34,197,94,.15);color:#86efac}#fcpt-sbc .tag.dup{background:rgba(245,197,24,.15);color:#fde68a}
      #fcpt-sbc .ch{display:inline-block;min-width:18px;text-align:center;border-radius:4px;font-weight:700}
      #fcpt-sbc .ch0{background:#3a1515;color:#fca5a5}#fcpt-sbc .ch3{background:rgba(34,197,94,.18);color:#86efac}
      #fcpt-sbc .note{font-size:12px;color:var(--ink3)}
      #fcpt-sbc .lk{background:none;border:1px solid var(--line);border-radius:6px;color:var(--ink2);cursor:pointer;padding:1px 6px;font-size:12px}
      #fcpt-sbc .lk:hover{border-color:#ef4444;color:#fca5a5}
      #fcpt-sbc tr.locked td{opacity:.45;text-decoration:line-through}
      #fcpt-sbc .lockrow{display:flex;align-items:center;gap:8px;font-size:13px}
      #fcpt-sbc .lockrow button{margin-left:auto}
    `);

    const sbcBtn = document.createElement('button');
    sbcBtn.id = 'fcpt-sbcbtn';
    sbcBtn.textContent = '🧩 SBC';
    sbcBtn.setAttribute('aria-label', 'SBC lösen');
    document.body.appendChild(sbcBtn);

    const pane = document.createElement('div');
    pane.id = 'fcpt-sbc';
    pane.innerHTML = `
      <div class="hd"><span class="lg">🧩</span><div><div class="t">SBC-Solver <span class="fcpt-ver">v${TOOL_VERSION}</span></div><div class="s" data-el="name">–</div></div><button class="x" data-a="close">✕</button></div>
      <div class="bd">
        <div class="grp"><h4>Anforderungen</h4><div data-el="reqs"><div class="note">Öffne eine SBC-Aufgabe.</div></div></div>
        <div data-el="points" class="pts-in-sbc"></div>
        <div class="grp"><h4>Optionen</h4>
          <div class="opt"><span>🛒 Konzept-Spieler nutzen<small>Günstigste Variante: fehlende Karten als Konzept einsetzen – du kaufst sie danach selbst</small></span><input type="checkbox" class="fcpt-sw" data-o="sbcConcepts"></div>
          <div class="opt"><span>Sonderkarten erlauben<small>TOTW, Promos usw. – aus = nur normale Karten</small></span><input type="checkbox" class="fcpt-sw" data-o="sbcSpecials"></div>
          <div class="opt"><span>Nicht handelbare bevorzugen<small>Doppelte/Lager-Karten werden immer zuerst genommen</small></span><input type="checkbox" class="fcpt-sw" data-o="sbcPreferUntradeable"></div>
          <div class="opt"><span>Aktive Mannschaft schützen<small>Spieler aus deiner aktiven Mannschaft werden nie verwendet</small></span><input type="checkbox" class="fcpt-sw" data-o="sbcProtectActive"></div>
          <div class="opt"><span>Bereits eingesetzte Spieler behalten</span><input type="checkbox" class="fcpt-sw" data-o="sbcKeep"></div>
          <div class="opt"><span>Max. Rating pro Spieler<small>0 = keine Grenze · schützt deine Top-Spieler</small></span><input type="number" min="0" max="99" data-n="sbcMaxRating"></div>
          <div class="opt"><span>Rechenzeit (Sekunden)<small>Länger = oft günstigere Lösung</small></span><input type="number" min="1" max="30" data-n="sbcTime"></div>
        </div>
        <div class="grp" data-el="lockgrp"><h4>Gesperrte Spieler</h4><div data-el="locks"></div></div>
        <div class="btns"><button class="btn pri" data-a="solve">Verein laden &amp; lösen</button><button class="btn" data-a="group" title="Alle offenen Aufgaben dieser SBC-Gruppe planen – ohne doppelte Spieler">🧩 Ganze Gruppe</button></div>
        <div data-el="group"></div>
        <div class="st" data-el="status"></div>
        <div data-el="result"></div>
        <div class="btns"><button class="btn" data-a="reload">↻ Verein neu laden</button><button class="btn" data-a="diag">Diagnose kopieren</button></div>
        <div class="note">Der Solver setzt die Spieler nur ein – einreichen musst du selbst. Prüfe die Aufstellung vor dem Einreichen.</div>
      </div>`;
    document.body.appendChild(pane);
    const el = (n) => pane.querySelector(`[data-el="${n}"]`);
    setTimeout(() => { try { POINTS.mount(el('points')); } catch (e) { log('Punkte-SBC', e); } }, 0);
    pane.querySelectorAll('[data-o]').forEach((i) => { i.checked = !!settings[i.dataset.o]; });
    pane.querySelectorAll('[data-n]').forEach((i) => { i.value = settings[i.dataset.n]; });
    pane.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.o) { settings[t.dataset.o] = t.checked; saveSettings(); }
      if (t.dataset.n) { settings[t.dataset.n] = Math.max(0, parseInt(t.value, 10) || 0); saveSettings(); }
      if (t.dataset.o === 'sbcPreferUntradeable') club = null;
    });

    let info = null, lastSol = null;
    const setStatus = (m, err) => { const s = el('status'); s.textContent = m || ''; s.classList.toggle('err', !!err); };

    function renderReqs(results) {
      if (!info || !info.decoded) {
        el('reqs').innerHTML = `<div class="note">Anforderungen noch nicht erkannt. Gehe einmal zurück zur SBC-Übersicht und öffne die Aufgabe erneut – das Tool liest die Anforderungen mit, wenn EA sie lädt.</div>`;
        return;
      }
      const res = results || info.decoded.constraints.map((c) => ({ c, ok: c.unsupported ? null : undefined }));
      el('reqs').innerHTML = res.map((r) => {
        const cls = r.ok === true ? 'ok' : r.ok === false ? 'bad' : r.c.unsupported ? 'na' : '';
        const ic = r.ok === true ? '✓' : r.ok === false ? '✕' : r.c.unsupported ? '!' : '•';
        const extra = r.c.unsupported ? ' <span class="tag">nicht unterstützt – selbst prüfen</span>' : '';
        return `<div class="req ${cls}"><span class="ic">${ic}</span><span>${esc(SBC.describe(r.c))}${extra}</span>${r.val != null ? `<span class="v">${esc(r.val)}</span>` : ''}</div>`;
      }).join('') + (info.positions ? '' : '<div class="note">⚠ Positionen der Formation unbekannt – Chemie wird ohne Positionsprüfung berechnet.</div>');
    }

    function renderLocks() {
      const L = settings.sbcLocked;
      el('locks').innerHTML = L.length
        ? L.map((x) => `<div class="lockrow">🔒 <span>${esc(x.rating ?? '')} ${esc(x.name)}</span><button class="lk" data-a="unlock" data-id="${x.id}" title="Wieder freigeben">✕ freigeben</button></div>`).join('')
        : '<div class="note">Keine. Klicke in einer Lösung auf 🔒, um einen Spieler dauerhaft für SBCs zu sperren.</div>';
    }
    renderLocks();

    // Vergleich: was würde die SBC kosten, wenn man alle Spieler kauft? (nur Teambewertung, laut Futbin-Rating-Preisen)
    function buyCostHtml(clubValue) {
      const tr = info && info.decoded && info.decoded.constraints.find((c) => c.kind === 'TEAM_RATING_1_TO_100' && !c.unsupported);
      const rp = typeof RATINGS !== 'undefined' ? RATINGS.get() : null;
      if (!tr) return '';
      if (!rp) return '<div class="note">💰 Kaufkosten-Vergleich: im Trading-Reiter einmal „Rating-Preise laden“.</div>';
      const c = SBC.cheapestCombo(rp.prices, tr.value);
      if (!c) return '';
      const save = c.cost - Math.round(clubValue);
      return `<div class="note">💰 Komplett gekauft ≈ <b>${fmt(c.cost)}</b> (Teambewertung ${tr.value}, günstigste Ratings) · deine Lösung nutzt Karten im Wert von ${fmt(Math.round(clubValue))}${save > 0 ? ` – du sparst ≈ <b class="fcpt-pos-v">${fmt(save)}</b>` : ''}.</div>`;
    }

    function renderResult(sol) {
      if (!sol) { el('result').innerHTML = ''; return; }
      const ev = sol.ev;
      const okCount = ev.results.filter((r) => r.ok === true).length;
      const total = ev.results.filter((r) => r.ok !== null).length;
      const rows = sol.players.map((p, i) => {
        const pos = (info.positions && info.positions[i]) || '–';
        if (!p) return `<tr><td>${pos}</td><td colspan="4" class="note">leer</td></tr>`;
        const ch = ev.chem.per[i];
        const isLocked = lockedIds().has(p.id);
        return `<tr class="${isLocked ? 'locked' : ''}"><td>${esc(pos)}</td><td><button class="lk" data-a="lock" data-i="${i}" title="Diesen Spieler nie für SBCs verwenden">🔒</button> ${esc(p.name)}${p.untradeable ? '<span class="tag nh">NH</span>' : ''}${p.dup ? '<span class="tag dup">Dup</span>' : ''}${p.concept ? '<span class="tag buy" title="Nicht in deinem Verein – musst du kaufen">🛒 kaufen</span>' : ''}</td>
          <td class="n">${p.rating}</td><td class="n"><span class="ch ch${ch}">${ch}</span></td><td class="n" title="${esc(p.priceSrc)}">${fmt(Math.round(p.value))}${p.concept && !p.verified ? '<small>≈</small>' : ''}</td></tr>`;
      }).join('');
      const value = sol.players.reduce((a, p) => a + (p && !p.concept ? p.value : 0), 0);
      const buyL = sol.players.filter((p) => p && p.concept);
      const buy = buyL.reduce((a, p) => a + p.value, 0);
      const buyHtml = buyL.length ? `<div class="buybox"><b>🛒 Zu kaufen: ${buyL.length} Spieler ≈ ${fmt(Math.round(buy))} Münzen</b>
          ${buyL.map((p) => `<div class="buyrow"><span>${esc(p.rating)} ${esc(p.name)}</span><span>${p.verified ? 'Futbin' : 'geschätzt'} <b>${fmt(Math.round(p.value))}</b></span></div>`).join('')}
          <div class="note">Werden als Konzept eingesetzt. Einreichen geht erst, wenn du sie gekauft hast (Transfermarkt → Spieler suchen, dann in die SBC tauschen).${buyL.some((p) => !p.verified) ? ' „geschätzt“ = Preis nicht geprüft, echter Preis kann abweichen.' : ''}</div></div>` : '';
      const anyLocked = sol.players.some((p) => p && lockedIds().has(p.id));
      el('result').innerHTML = `
        <div class="grp"><h4>${sol.feasible ? 'Lösung' : 'Keine vollständige Lösung gefunden'}</h4>
          <div class="sum">
            <div><div class="l">Teambewertung</div><div class="v">${ev.rating}</div></div>
            <div><div class="l">Chemie</div><div class="v">${ev.chem.total}</div></div>
            <div><div class="l">${buyL.length ? 'Eigene Karten' : 'Wert der Karten'}</div><div class="v">${fmt(Math.round(value))}</div></div>
            ${buyL.length ? `<div><div class="l">Kaufen</div><div class="v">${fmt(Math.round(buy))}</div></div>` : ''}
          </div>
          <div class="note">${okCount} von ${total} Anforderungen erfüllt · ${fmt(sol.iters || 0)} Kombinationen geprüft</div>
          ${buyHtml}${buyCostHtml(value + buy)}
          <table><thead><tr><th>Pos</th><th>Spieler</th><th style="text-align:right">OVR</th><th style="text-align:right">Chem</th><th style="text-align:right">Wert</th></tr></thead><tbody>${rows}</tbody></table>
          ${anyLocked ? '<div class="note" style="color:#fcd34d">🔒 Gesperrte Spieler in der Lösung – bitte „Nochmal lösen“.</div>' : ''}
          <div class="btns"><button class="btn go" data-a="apply" ${sol.feasible && !anyLocked ? '' : 'disabled'}>✓ In SBC einsetzen</button><button class="btn" data-a="solve">Nochmal lösen</button></div>
          <div class="st" data-el="applyst"></div>
        </div>`;
    }

    function refreshInfo() {
      info = readChallenge();
      el('name').textContent = info.name + (info.formation ? ` · ${info.formation.replace(/^f/, '')}` : '');
      renderReqs(lastSol && lastSol.challengeId === info.id ? lastSol.ev.results : null);
      if (!lastSol || lastSol.challengeId !== info.id) renderResult(null);
      renderGroup();
    }

    // ---------- Gruppenplan: alle offenen Aufgaben einer SBC-Gruppe ohne doppelte Spieler ----------
    const PLAN_KEY = 'fcpt_sbc_plan';
    let plan = GM_getValue(PLAN_KEY, null);   // { setId, at, items: { [challengeId]: {...} } }
    const savePlan = () => GM_setValue(PLAN_KEY, plan);
    const planValid = () => plan && Date.now() - plan.at < 6 * 3600000;
    // Spieler, die im Plan für ANDERE Aufgaben reserviert sind
    function reservedIds(exceptId) {
      const r = new Set();
      if (!planValid()) return r;
      for (const [cid, it] of Object.entries(plan.items)) if (+cid !== exceptId && !it.done) (it.players || []).forEach((x) => r.add(x.id));
      return r;
    }

    async function buildPool(c, statusFn, constraints) {
      const locked = lockedIds();
      let pool = c.players.filter((p) => !(p.loans > 0) && !locked.has(p.id));
      let protectedN = 0, activeWarn = false;
      if (settings.sbcProtectActive) {
        statusFn('Lese aktive Mannschaft …');
        const act = await activeSquadIds();
        if (!act.size) activeWarn = true;
        const before = pool.length;
        pool = pool.filter((p) => !act.has(p.id));
        protectedN = before - pool.length;
      }
      if (!settings.sbcSpecials) pool = pool.filter((p) => !p.special);
      // „Neue Items“ (noch nicht zugewiesen) lehnt EA beim Speichern der SBC ab (Code 404) -> nicht verwenden
      pool = pool.filter((p) => !p.unassigned);
      if (settings.sbcMaxRating > 0) pool = pool.filter((p) => p.rating <= settings.sbcMaxRating);
      let conceptN = 0;
      if (settings.sbcConcepts && constraints) {
        if (typeof RATINGS !== 'undefined' && !RATINGS.get()) { statusFn('Lade Rating-Preise von Futbin …'); try { await RATINGS.load(); } catch (e) { log('Ratings', e); } }
        await loadConcepts(statusFn);
        const cp = conceptPool(constraints, locked);
        conceptN = cp.length;
        pool = pool.concat(cp);
      }
      return { pool, protectedN, activeWarn, locked, conceptN };
    }

    // Lösen; gewählte Konzept-Spieler bei Futbin nachprüfen und ggf. mit echten Preisen neu rechnen
    const conceptSum = (sol) => sol.players.reduce((a, p) => a + (p && p.concept ? p.value : 0), 0);
    async function solveSmart(pool, slots, constraints, setStatus) {
      const t = Math.min(30, Math.max(1, settings.sbcTime)) * 1000;
      let sol = SBC.solve(pool, slots, constraints, { timeMs: t });
      let blocked = false, rounds = 0;
      const open = (x) => x.players.some((p) => p && p.concept && !p.verified && !conceptFail.has(p.id));
      while (!sol.error && sol.feasible && open(sol) && rounds < 6) {
        rounds++;
        const before = conceptSum(sol);
        const r = await verifyConcepts(sol.players, setStatus);
        if (r.blocked) { blocked = true; break; }
        if (conceptSum(sol) <= before * 1.1 && !sol.players.some((p) => p && conceptFail.has(p.id))) break;   // Schätzung passte
        pool.forEach((p) => { if (p.concept && !p.verified) priceConcept(p); });
        setStatus(`Echte Preise weichen ab – rechne neu (${rounds}) …`);
        await sleep(30);
        sol = SBC.solve(pool, slots, constraints, { timeMs: t });
      }
      sol.unverified = sol.players.filter((p) => p && p.concept && !p.verified).length;
      sol.futbinBlocked = blocked;
      return sol;
    }

    async function runGroup() {
      refreshInfo();
      const cur = CAP.challenges.get(info.id);
      const setId = cur && cur.__setId;
      if (setId == null) { setStatus('Gruppe nicht erkannt – geh zurück zur SBC-Gruppe und öffne die Aufgabe neu.', true); return; }
      const list = [...CAP.challenges.values()].filter((c) => c.__setId === setId && String(c.status || '').toUpperCase() !== 'COMPLETED')
        .sort((a, b) => (a.challengeId === info.id ? -1 : b.challengeId === info.id ? 1 : a.challengeId - b.challengeId));
      if (!list.length) { setStatus('Keine offenen Aufgaben in dieser Gruppe.', true); return; }
      pane.querySelectorAll('[data-a="solve"],[data-a="group"]').forEach((b) => { b.disabled = true; });
      try {
        const c = await loadClub(setStatus, false);
        const base = await buildPool(c, setStatus, null);
        if (settings.sbcConcepts) {
          if (typeof RATINGS !== 'undefined' && !RATINGS.get()) { try { await RATINGS.load(); } catch (e) { log('Ratings', e); } }
          await loadConcepts(setStatus);
        }
        const used = new Set();
        plan = { setId, at: Date.now(), items: {} };
        let i = 0;
        for (const ch of list) {
          i++;
          setStatus(`Löse ${i}/${list.length}: ${ch.name} …`);
          await sleep(30);
          const dec = SBC.decodeRequirements(ch.elgReq || [], W.SBCEligibilityKey);
          const pos = formationPositions(ch.formation);
          const slots = Array.from({ length: 11 }, (_, k) => ({ position: pos ? pos[k] : null }));
          let pool = base.pool.filter((p) => !used.has(p.id));
          if (settings.sbcConcepts) pool = pool.concat(conceptPool(dec.constraints, new Set([...base.locked, ...used])));
          const sol = await solveSmart(pool, slots, dec.constraints, setStatus);
          const ok = !sol.error && sol.feasible;
          if (ok) sol.players.forEach((p) => p && used.add(p.id));
          plan.items[ch.challengeId] = {
            name: ch.name, feasible: ok, formation: ch.formation, posKnown: !!pos, unsupported: dec.unsupported.length,
            rating: sol.ev ? sol.ev.rating : null, chem: sol.ev ? sol.ev.chem.total : null,
            value: ok ? Math.round(sol.players.reduce((a, p) => a + (p && !p.concept ? p.value : 0), 0)) : 0,
            buy: ok ? Math.round(conceptSum(sol)) : 0, buyN: ok ? sol.players.filter((p) => p && p.concept).length : 0,
            players: ok ? sol.players.map((p, k) => p && { id: p.id, name: p.name, rating: p.rating, pos: pos ? pos[k] : null, concept: !!p.concept }).filter(Boolean) : [],
          };
        }
        savePlan();
        renderGroup();
        const okN = Object.values(plan.items).filter((x) => x.feasible).length;
        setStatus(`Gruppe geplant: ${okN} von ${list.length} Aufgaben lösbar. Öffne jede Aufgabe und klicke „Verein laden & lösen“ – der Plan wird dann automatisch verwendet.`, okN < list.length);
      } catch (e) { setStatus('Fehler: ' + e.message, true); log('SBC Gruppe', e); } finally {
        pane.querySelectorAll('[data-a="solve"],[data-a="group"]').forEach((b) => { b.disabled = false; });
      }
    }

    function renderGroup() {
      const el2 = el('group');
      if (!el2) return;
      if (!planValid() || !info || !CAP.challenges.get(info.id) || plan.setId !== CAP.challenges.get(info.id).__setId) { el2.innerHTML = ''; return; }
      const items = Object.entries(plan.items);
      const total = items.reduce((a, [, x]) => a + (x.value || 0), 0);
      const buyT = items.reduce((a, [, x]) => a + (x.done ? 0 : x.buy || 0), 0);
      el2.innerHTML = `<div class="grp"><h4>📋 Gruppenplan</h4>
        ${items.map(([cid, x]) => `<div class="req ${x.done ? 'ok' : x.feasible ? '' : 'bad'}"><span class="ic">${x.done ? '✓' : x.feasible ? (+cid === info.id ? '▶' : '•') : '✕'}</span>
          <span>${esc(x.name)}${+cid === info.id ? ' <b>(offen)</b>' : ''}${x.posKnown ? '' : ' <span class="tag" title="Positionen dieser Formation noch unbekannt – Chemie ohne Positionsprüfung">Pos.?</span>'}${x.unsupported ? ' <span class="tag">!</span>' : ''}</span>
          <span class="v">${x.feasible ? `${x.rating} · ${x.chem} Chem · ${fmt(x.value)}${x.buyN ? ` · 🛒 ${x.buyN}× ≈ ${fmt(x.buy)}` : ''}` : 'keine Lösung'}</span></div>`).join('')}
        <div class="note">Gesamtwert der verplanten Vereinskarten: <b>${fmt(total)}</b>${buyT ? ` · zu kaufen ≈ <b>${fmt(buyT)}</b> Münzen` : ''} · Kein Spieler wird doppelt verwendet. Plan gilt 6 Std.</div>
        <div class="btns"><button class="btn" data-a="planclear">Plan verwerfen</button></div></div>`;
    }

    async function runSolve(force) {
      refreshInfo();
      if (!info.decoded) { setStatus('Anforderungen nicht erkannt – Aufgabe neu öffnen.', true); return; }
      pane.querySelectorAll('[data-a="solve"]').forEach((b) => { b.disabled = true; });
      try {
        const c = await loadClub(setStatus, force);
        const bp = await buildPool(c, setStatus, info.decoded.constraints);
        const { protectedN, activeWarn, locked } = bp;
        const reserved = reservedIds(info.id);
        let pool = bp.pool.filter((p) => !reserved.has(p.id));   // für andere Gruppen-Aufgaben verplante Spieler nicht anrühren
        const planned = planValid() && plan.items[info.id] && plan.items[info.id].feasible ? plan.items[info.id].players : null;
        const n = Math.max(info.slots.length ? Math.min(11, info.slots.length) : 11, 11);
        const slots = [];
        for (let i = 0; i < n; i++) {
          const s = info.slots[i];
          const it = slotItem(s);
          const keep = settings.sbcKeep && it && it.id && c.ents.has(it.id) ? c.players.find((p) => p.id === it.id) : null;
          slots.push({ position: info.positions ? info.positions[i] : null, fixed: keep || null, blocked: slotBlocked(s) });
        }
        // Gruppenplan: geplante Spieler passend zu den echten EA-Positionen einsetzen
        let usedPlan = false;
        if (planned && !slots.some((x) => x.fixed)) {
          const avail = planned.map((x) => findPlayer(x.id) && Object.assign({}, x, { p: findPlayer(x.id) })).filter(Boolean);
          if (avail.length === planned.length) {
            const rest = avail.slice();
            slots.forEach((sl) => { if (sl.blocked) return; const k = rest.findIndex((x) => x.pos && x.pos === sl.position); if (k >= 0) sl.fixed = rest.splice(k, 1)[0].p; });
            slots.forEach((sl) => { if (!sl.fixed && !sl.blocked && rest.length) sl.fixed = rest.shift().p; });
            usedPlan = true;
          }
        }
        setStatus(`Suche Lösung aus ${fmt(pool.length)} Spielern …`);
        await sleep(30);
        let sol = await solveSmart(pool, slots, info.decoded.constraints, setStatus);
        if (usedPlan && !sol.feasible) {   // Plan passt nicht (z. B. andere Positionen) -> normal lösen
          usedPlan = false;
          slots.forEach((sl) => { sl.fixed = null; });
          sol = await solveSmart(pool, slots, info.decoded.constraints, setStatus);
        }
        if (sol.error) { setStatus(sol.error, true); return; }
        sol.challengeId = info.id;
        lastSol = sol;
        renderReqs(sol.ev.results);
        renderResult(sol);
        const prot = activeWarn ? ' ⚠ Aktive Mannschaft konnte nicht gelesen werden – prüfe selbst, ob Stammspieler dabei sind.' : settings.sbcProtectActive ? ` (${protectedN} Spieler der aktiven Mannschaft geschützt${locked.size ? `, ${locked.size} gesperrt` : ''})` : (locked.size ? ` (${locked.size} gesperrt)` : '');
        const buyN = sol.players.filter((p) => p && p.concept).length;
        const buyInfo = buyN ? ` · 🛒 ${buyN} Konzept-Spieler zu kaufen${sol.unverified ? (sol.futbinBlocked ? ' (Futbin pausiert – Preise teils geschätzt)' : ' (Preise teils geschätzt – „Nochmal lösen“ prüft weitere)') : ''}` : '';
        setStatus(sol.feasible ? (usedPlan ? '✓ Lösung aus dem Gruppenplan – prüfen und einsetzen.' : '✓ Lösung gefunden – prüfen und einsetzen.') + buyInfo + prot + (reserved.size ? ` · ${reserved.size} Spieler für andere Gruppen-Aufgaben reserviert` : '') : (settings.sbcConcepts ? 'Keine Lösung gefunden – auch nicht mit Konzept-Spielern. Mehr Rechenzeit versuchen.' : 'Keine Lösung mit deinem Verein gefunden. Tipp: „🛒 Konzept-Spieler nutzen“ einschalten, mehr Rechenzeit, Sonderkarten erlauben oder Max. Rating erhöhen.'), !sol.feasible);
      } catch (e) {
        setStatus('Fehler: ' + e.message, true);
        log('SBC', e);
      } finally {
        pane.querySelectorAll('[data-a="solve"]').forEach((b) => { b.disabled = false; });
      }
    }

    // Rückmeldung direkt unter dem Knopf (der Status oben ist beim Scrollen oft nicht sichtbar)
    const applyMsg = (m, err) => {
      setStatus(m, err);
      const a = el('applyst');
      if (a) { a.textContent = m; a.classList.toggle('err', !!err); }
      if (err) showToast(m.length > 140 ? m.slice(0, 137) + '…' : m, true);
    };
    async function runApply() {
      if (!lastSol || !lastSol.feasible) { applyMsg('Keine gültige Lösung – bitte zuerst lösen.', true); return; }
      if (lastSol.players.some((p) => p && lockedIds().has(p.id))) { applyMsg('Lösung enthält gesperrte Spieler – bitte neu lösen.', true); return; }
      const btn = pane.querySelector('[data-a="apply"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Setze ein …'; }
      try {
        applyMsg('Setze Spieler ein …');
        await apply(info, lastSol);
        applyMsg('✓ Eingesetzt. Falls die Aufstellung nicht sofort erscheint: einmal zurück und die Aufgabe neu öffnen. Dann prüfen und selbst einreichen.');
        if (planValid() && plan.items[info.id]) { plan.items[info.id].done = true; plan.items[info.id].players = lastSol.players.filter(Boolean).map((p) => ({ id: p.id, name: p.name, rating: p.rating })); savePlan(); }
        // Fenster schließen, damit „Absenden“ und EAs Bestätigung nicht verdeckt werden
        setTimeout(() => { pane.classList.remove('open'); showToast('✓ Spieler eingesetzt – prüfen und selbst „Absenden“'); }, 700);
      } catch (e) {
        applyMsg('Einsetzen fehlgeschlagen: ' + e.message + ' – bitte „Diagnose kopieren“ und mir schicken.', true);
        lastApplyError = String(e && (e.stack || e.message) || e).slice(0, 600);
        if (/Code 404|Code 409/.test(e.message)) club = null;   // Vereinsdaten veraltet -> beim nächsten Lösen frisch laden
        log('SBC apply', e);
      } finally {
        if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = '✓ In SBC einsetzen'; }
      }
    }

    function diagnose() {
      const ctx = findSbcContext();
      const sl = ctx ? slotList(ctx.squad || (ctx.challenge && ctx.challenge.squad)) : [];
      if (ctx && !ctx.squad && ctx.challenge) ctx.squad = ctx.challenge.squad;
      const methods = (o) => { const s = new Set(); let p = o; for (let d = 0; p && d < 4; d++, p = Object.getPrototypeOf(p)) Object.getOwnPropertyNames(p).forEach((k) => s.add(k)); return [...s].filter((k) => !k.startsWith('__')).slice(0, 120); };
      const sampleEnt = club && club.ents.size ? club.ents.values().next().value : null;
      const d = {
        version: GM_info && GM_info.script && GM_info.script.version,
        capturedChallenges: CAP.challenges.size, currentId: CAP.currentId, recentUrls: CAP.urls.slice(-15),
        info: info && { id: info.id, name: info.name, formation: info.formation, positions: info.positions, elgReq: info.elgReq },
        classes: ['UTSBCChallengeEntity', 'UTSquadEntity', 'UTSBCSquadOverviewViewController'].map((n) => ({ n, exists: !!W[n] })),
        repoKeys: (() => { try { const r = W.services.SBC.repository; return r ? Object.keys(r).slice(0, 30) : null; } catch (e) { return String(e); } })(),
        context: ctx ? { via: ctx.via, controllerKeys: ctx.controller ? Object.keys(ctx.controller).slice(0, 60) : null, challengeKeys: Object.keys(ctx.challenge || {}).slice(0, 60), squadMethods: ctx.squad ? methods(ctx.squad) : null, slots: sl.length, slot0Keys: sl[0] ? Object.keys(sl[0]).slice(0, 30) : null, slot0Pos: sl[0] ? slotPos(sl[0]) : null, slot0PosRaw: sl[0] ? (() => { try { const p = typeof sl[0].getPosition === 'function' ? sl[0].getPosition() : sl[0].position || sl[0]._position; return p && typeof p === 'object' ? Object.keys(p).slice(0, 15).reduce((a, k) => { const v = p[k]; if (typeof v !== 'object' && typeof v !== 'function') a[k] = v; return a; }, {}) : p; } catch (e) { return String(e); } })() : null } : null,
        sbcService: W.services && W.services.SBC ? methods(W.services.SBC) : null,
        club: club ? { players: club.players.length, sample: club.players.slice(0, 2) } : null,
        rawCaptured: CAP.raw.size, sampleRawKeys: CAP.raw.size ? Object.keys(CAP.raw.values().next().value).slice(0, 60) : null,
        sampleEntityKeys: sampleEnt ? Object.keys(sampleEnt).slice(0, 60) : null,
        concept: { fn: !!(W.services && W.services.Item && typeof W.services.Item.searchConceptItems === 'function'), loaded: concept ? concept.players.length : 0, sample: concept && concept.players[0] ? (({ name, rating, leagueId, nationId, clubId, positions, def }) => ({ name, rating, leagueId, nationId, clubId, positions, def }))(concept.players[0]) : null },
        points: (() => {
          const c = ctx && ctx.challenge;
          const pick = (o, ks) => ks.reduce((a2, k) => { try { const v = o && o[k]; if (v == null || typeof v !== 'object') a2[k] = v; else a2[k] = JSON.stringify(v).slice(0, 300); } catch (e) { a2[k] = String(e); } return a2; }, {});
          const src = (fn) => { try { const f = W.services.SBC[fn]; return f ? String(f).replace(/\s+/g, ' ').slice(0, 700) : null; } catch (e) { return String(e); } };
          const samples = [...CAP.raw.values()].filter((r) => r && r.rating).slice(0, 12).map((r) => ({ rating: r.rating, rareflag: r.rareflag, gradingScore: r.gradingScore, untradeable: r.untradeable, isCollected: r.isCollected }));
          return {
            challenge: c ? pick(c, ['id', 'name', 'type', 'status', 'formation', 'scoreRequirement', 'submittedScore', 'eligibilityOperation', 'timesCompleted', 'repeatable']) : null,
            squadType: c && c.squad ? (c.squad.constructor && c.squad.constructor.name) : null,
            samples,
            initiateOneClick: src('initiateOneClickChallenge'),
            submitOneClick: src('submitOneClickChallenge'),
            applyOneClick: src('_applyOneClickSubmission'),
            loadChallenge: src('loadChallenge'),
          };
        })(),
        lastApplyError,
        newItems: (() => { try { return NEWITEMS.diag(); } catch (e) { return String(e); } })(),
        lastSolutionItems: lastSol ? lastSol.players.filter(Boolean).map((p) => ({ id: p.id, r: p.rating, nh: p.untradeable, dup: p.dup, st: p.storage, un: p.unassigned, c: !!p.concept })) : null,
        lastSolution: lastSol ? { feasible: lastSol.feasible, rating: lastSol.ev.rating, chem: lastSol.ev.chem.total } : null,
      };
      const text = JSON.stringify(d, null, 1);
      const done = () => setStatus('Diagnose kopiert – füge sie im Chat ein (Strg + V).');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
      else fallbackCopy(text, done);
    }
    function fallbackCopy(text, done) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { setStatus('Kopieren nicht möglich', true); }
      ta.remove();
    }

    pane.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('[data-a]');
      if (!a) return;
      const act = a.dataset.a;
      if (act === 'close') pane.classList.remove('open');
      if (act === 'solve') runSolve(false);
      if (act === 'group') runGroup();
      if (act === 'planclear') { plan = null; savePlan(); renderGroup(); setStatus('Gruppenplan verworfen.'); }
      if (act === 'reload') { club = null; runSolve(true); }
      if (act === 'apply') runApply();
      if (act === 'diag') diagnose();
      if (act === 'lock' && lastSol) {
        const p = lastSol.players[+a.dataset.i];
        if (p && !lockedIds().has(p.id)) { settings.sbcLocked.push({ id: p.id, name: p.name, rating: p.rating }); saveSettings(); }
        renderLocks(); renderResult(lastSol);
      }
      if (act === 'unlock') {
        settings.sbcLocked = settings.sbcLocked.filter((x) => String(x.id) !== a.dataset.id); saveSettings();
        renderLocks(); if (lastSol) renderResult(lastSol);
      }
    });
    sbcBtn.addEventListener('click', () => {
      const open = pane.classList.toggle('open');
      if (open) { panel.classList.remove('open'); refreshInfo(); setStatus(''); }
    });

    // Button nur auf SBC-Aufgaben zeigen
    setInterval(() => {
      let on = false;
      on = CAP.currentId != null && Date.now() - CAP.currentAt < 30 * 60000;
      sbcBtn.classList.toggle('show', on || pane.classList.contains('open'));
    }, 1500);

    // Aktive Mannschaft komplett (für den Kader-Optimierer): Formation + Spieler-IDs
    async function activeSquadInfo() {
      try {
        const S = W.services && W.services.Squad;
        if (!S || typeof S.getActiveSquad !== 'function') return null;
        const ev = await observeOnce(S.getActiveSquad(), 6000);
        const pay = ev.response || ev.data || {};
        const sq = pay.squad || pay;
        let f = null;
        try { f = typeof sq.getFormation === 'function' ? sq.getFormation() : sq._formation || sq.formation; } catch (e) { /* */ }
        if (f && typeof f === 'object') f = f.name || f.id || f.formation || null;
        const ids = slotList(sq).slice(0, 11).map((s2) => { const it = slotItem(s2); return it && it.id; });
        return { formation: f ? String(f) : null, ids };
      } catch (e) { return null; }
    }
    return { activeSquadInfo, loadConcepts, conceptPrice: (p) => { priceConcept(p); return p; }, CAP, readChallenge, findSbcContext, loadClub, activeSquadIds, userCoins: () => { try { const u = W.services.User.getUser(); return toNum(u.coins && (u.coins.amount ?? u.coins)); } catch (e) { return null; } } };
  })();

