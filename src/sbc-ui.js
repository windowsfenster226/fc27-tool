  // ==================================================================
  // SBC-SOLVER – Anbindung an die EA Web App + Oberfläche
  // ==================================================================
  const SBCUI = (() => {
    // ---------- 1) Netzwerk mitlesen (nur lesen): Anforderungen, Squad, Vereinsdaten ----------
    const CAP = { challenges: new Map(), currentId: null, currentAt: 0, squads: new Map(), raw: new Map(), urls: [], activeIds: null };

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
        XP.open = function (m, url) { this.__fcptUrl = url; return oOpen.apply(this, arguments); };
        XP.send = function () {
          try {
            this.addEventListener('load', function () {
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
            try { if (/\/ut\/game\//.test(url || '')) res.clone().text().then((t) => capture(url, t)).catch(() => {}); } catch (e) { /* */ }
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
      const dup = !!(extra && extra.dup) || !!raw.__unassigned || (typeof ent.isDuplicate === 'function' && (() => { try { return ent.isDuplicate(); } catch (e) { return false; } })());
      const mult = untradeable ? (dup ? 0.1 : settings.sbcPreferUntradeable ? 0.6 : 1) : 1;
      return {
        id: ent.id, assetId: g(raw.assetId, ent.assetId, def != null ? def % 16777216 : ent.id),
        name: sd.name || [sd.firstName, sd.lastName].filter(Boolean).join(' ') || `#${def}`,
        rating, rarity, nationId: g(raw.nation, ent.nationId, ent.nation), leagueId: g(raw.leagueId, ent.leagueId),
        clubId: g(raw.teamid, ent.teamId, ent.teamid), positions, untradeable, loans, owners: g(raw.owners, ent.owners, 1),
        dup, value, priceSrc: futbin != null ? 'Futbin' : raw.marketAverage ? 'EA' : 'Schätzung',
        cost: Math.round(value * mult) + rating * 0.01,
        special: rarity > 1,
      };
    }

    async function pagedSearch(fnName, service, label, setStatus, extra) {
      const VM = W.UTBucketedItemSearchViewModel;
      const crit = VM ? new VM().searchCriteria : null;
      if (!crit) throw new Error('EA-Suchobjekt nicht gefunden (UTBucketedItemSearchViewModel)');
      try { if (W.SearchType && W.SearchType.PLAYER) crit.type = W.SearchType.PLAYER; } catch (e) { /* */ }
      crit.count = 91;
      const ents = [];
      for (let page = 0, offset = 0; page < 50; page++, offset += 91) {
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
          items.forEach((it) => all.push([it, { dup: true }]));
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
    async function apply(info, sol) {
      const ctx = findSbcContext() || info.ctx;
      const squad = ctx && (ctx.squad || (ctx.challenge && ctx.challenge.squad));
      if (!squad) throw new Error('SBC-Aufstellung nicht gefunden – geh einmal zurück, öffne die Aufgabe neu und versuche es erneut.');
      const slots = slotList(squad);
      const arr = slots.map((s, i) => {
        const p = sol.players[i];
        if (p && club && club.ents.get(p.id)) return club.ents.get(p.id);
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
        const ev = await observeOnce(S.saveChallenge(ctx.challenge));
        if (ev && ev.success === false) throw new Error('EA hat das Speichern abgelehnt' + (ev.status ? ` (${ev.status})` : ''));
      }
      const c = ctx.controller;
      for (const fn of ['_pushSquadToView', 'refreshSquad', '_updateSquad', 'onDataChange', 'render']) {
        try { if (c && typeof c[fn] === 'function') c[fn](squad); } catch (e) { /* */ }
      }
      try { if (squad.onDataUpdated && typeof squad.onDataUpdated.notify === 'function') squad.onDataUpdated.notify(); } catch (e) { /* */ }
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
      #fcpt-sbc .sum{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
      #fcpt-sbc .sum>div{background:var(--bg3);border-radius:10px;padding:7px 9px}
      #fcpt-sbc .sum .l{font-size:11px;color:var(--ink3)}#fcpt-sbc .sum .v{font-size:17px;font-weight:800}
      #fcpt-sbc table{width:100%;border-collapse:collapse;font-size:12.5px}
      #fcpt-sbc th{text-align:left;color:var(--ink3);font-weight:500;padding:5px 4px;border-bottom:1px solid var(--line)}
      #fcpt-sbc td{padding:6px 4px;border-bottom:1px solid #1a2436}
      #fcpt-sbc td.n{text-align:right;font-variant-numeric:tabular-nums}
      #fcpt-sbc .tag{font-size:10px;font-weight:700;border-radius:4px;padding:1px 4px;margin-left:4px;background:#1f2b3d;color:#a7b3c6}
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
    sbcBtn.textContent = '🧩 SBC lösen';
    document.body.appendChild(sbcBtn);

    const pane = document.createElement('div');
    pane.id = 'fcpt-sbc';
    pane.innerHTML = `
      <div class="hd"><span class="lg">🧩</span><div><div class="t">SBC-Solver <span class="fcpt-ver">v${TOOL_VERSION}</span></div><div class="s" data-el="name">–</div></div><button class="x" data-a="close">✕</button></div>
      <div class="bd">
        <div class="grp"><h4>Anforderungen</h4><div data-el="reqs"><div class="note">Öffne eine SBC-Aufgabe.</div></div></div>
        <div class="grp"><h4>Optionen</h4>
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
        return `<tr class="${isLocked ? 'locked' : ''}"><td>${esc(pos)}</td><td><button class="lk" data-a="lock" data-i="${i}" title="Diesen Spieler nie für SBCs verwenden">🔒</button> ${esc(p.name)}${p.untradeable ? '<span class="tag nh">NH</span>' : ''}${p.dup ? '<span class="tag dup">Dup</span>' : ''}</td>
          <td class="n">${p.rating}</td><td class="n"><span class="ch ch${ch}">${ch}</span></td><td class="n" title="${esc(p.priceSrc)}">${fmt(Math.round(p.value))}</td></tr>`;
      }).join('');
      const value = sol.players.reduce((a, p) => a + (p ? p.value : 0), 0);
      const anyLocked = sol.players.some((p) => p && lockedIds().has(p.id));
      el('result').innerHTML = `
        <div class="grp"><h4>${sol.feasible ? 'Lösung' : 'Keine vollständige Lösung gefunden'}</h4>
          <div class="sum">
            <div><div class="l">Teambewertung</div><div class="v">${ev.rating}</div></div>
            <div><div class="l">Chemie</div><div class="v">${ev.chem.total}</div></div>
            <div><div class="l">Wert der Karten</div><div class="v">${fmt(Math.round(value))}</div></div>
          </div>
          <div class="note">${okCount} von ${total} Anforderungen erfüllt · ${fmt(sol.iters || 0)} Kombinationen geprüft</div>
          ${buyCostHtml(value)}
          <table><thead><tr><th>Pos</th><th>Spieler</th><th style="text-align:right">OVR</th><th style="text-align:right">Chem</th><th style="text-align:right">Wert</th></tr></thead><tbody>${rows}</tbody></table>
          ${anyLocked ? '<div class="note" style="color:#fcd34d">🔒 Gesperrte Spieler in der Lösung – bitte „Nochmal lösen“.</div>' : ''}
          <div class="btns"><button class="btn go" data-a="apply" ${sol.feasible && !anyLocked ? '' : 'disabled'}>✓ In SBC einsetzen</button><button class="btn" data-a="solve">Nochmal lösen</button></div>
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

    async function buildPool(c, statusFn) {
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
      if (settings.sbcMaxRating > 0) pool = pool.filter((p) => p.rating <= settings.sbcMaxRating);
      return { pool, protectedN, activeWarn, locked };
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
        const base = await buildPool(c, setStatus);
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
          const pool = base.pool.filter((p) => !used.has(p.id));
          const sol = SBC.solve(pool, slots, dec.constraints, { timeMs: Math.min(30, Math.max(1, settings.sbcTime)) * 1000 });
          const ok = !sol.error && sol.feasible;
          if (ok) sol.players.forEach((p) => p && used.add(p.id));
          plan.items[ch.challengeId] = {
            name: ch.name, feasible: ok, formation: ch.formation, posKnown: !!pos, unsupported: dec.unsupported.length,
            rating: sol.ev ? sol.ev.rating : null, chem: sol.ev ? sol.ev.chem.total : null,
            value: ok ? Math.round(sol.players.reduce((a, p) => a + (p ? p.value : 0), 0)) : 0,
            players: ok ? sol.players.map((p, k) => p && { id: p.id, name: p.name, rating: p.rating, pos: pos ? pos[k] : null }).filter(Boolean) : [],
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
      el2.innerHTML = `<div class="grp"><h4>📋 Gruppenplan</h4>
        ${items.map(([cid, x]) => `<div class="req ${x.done ? 'ok' : x.feasible ? '' : 'bad'}"><span class="ic">${x.done ? '✓' : x.feasible ? (+cid === info.id ? '▶' : '•') : '✕'}</span>
          <span>${esc(x.name)}${+cid === info.id ? ' <b>(offen)</b>' : ''}${x.posKnown ? '' : ' <span class="tag" title="Positionen dieser Formation noch unbekannt – Chemie ohne Positionsprüfung">Pos.?</span>'}${x.unsupported ? ' <span class="tag">!</span>' : ''}</span>
          <span class="v">${x.feasible ? `${x.rating} · ${x.chem} Chem · ${fmt(x.value)}` : 'keine Lösung'}</span></div>`).join('')}
        <div class="note">Gesamtwert der verplanten Karten: <b>${fmt(total)}</b> · Kein Spieler wird doppelt verwendet. Plan gilt 6 Std.</div>
        <div class="btns"><button class="btn" data-a="planclear">Plan verwerfen</button></div></div>`;
    }

    async function runSolve(force) {
      refreshInfo();
      if (!info.decoded) { setStatus('Anforderungen nicht erkannt – Aufgabe neu öffnen.', true); return; }
      pane.querySelectorAll('[data-a="solve"]').forEach((b) => { b.disabled = true; });
      try {
        const c = await loadClub(setStatus, force);
        const bp = await buildPool(c, setStatus);
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
          const avail = planned.map((x) => c.players.find((p) => p.id === x.id) && Object.assign({}, x, { p: c.players.find((p) => p.id === x.id) })).filter(Boolean);
          if (avail.length === planned.length) {
            const rest = avail.slice();
            slots.forEach((sl) => { if (sl.blocked) return; const k = rest.findIndex((x) => x.pos && x.pos === sl.position); if (k >= 0) sl.fixed = rest.splice(k, 1)[0].p; });
            slots.forEach((sl) => { if (!sl.fixed && !sl.blocked && rest.length) sl.fixed = rest.shift().p; });
            usedPlan = true;
          }
        }
        setStatus(`Suche Lösung aus ${fmt(pool.length)} Spielern …`);
        await sleep(30);
        let sol = SBC.solve(pool, slots, info.decoded.constraints, { timeMs: Math.min(30, Math.max(1, settings.sbcTime)) * 1000 });
        if (usedPlan && !sol.feasible) {   // Plan passt nicht (z. B. andere Positionen) -> normal lösen
          usedPlan = false;
          slots.forEach((sl) => { sl.fixed = null; });
          sol = SBC.solve(pool, slots, info.decoded.constraints, { timeMs: Math.min(30, Math.max(1, settings.sbcTime)) * 1000 });
        }
        if (sol.error) { setStatus(sol.error, true); return; }
        sol.challengeId = info.id;
        lastSol = sol;
        renderReqs(sol.ev.results);
        renderResult(sol);
        const prot = activeWarn ? ' ⚠ Aktive Mannschaft konnte nicht gelesen werden – prüfe selbst, ob Stammspieler dabei sind.' : settings.sbcProtectActive ? ` (${protectedN} Spieler der aktiven Mannschaft geschützt${locked.size ? `, ${locked.size} gesperrt` : ''})` : (locked.size ? ` (${locked.size} gesperrt)` : '');
        setStatus(sol.feasible ? (usedPlan ? '✓ Lösung aus dem Gruppenplan – prüfen und einsetzen.' : '✓ Lösung gefunden – prüfen und einsetzen.') + prot + (reserved.size ? ` · ${reserved.size} Spieler für andere Gruppen-Aufgaben reserviert` : '') : 'Keine Lösung mit deinem Verein gefunden. Mehr Rechenzeit, Sonderkarten erlauben oder Max. Rating erhöhen.', !sol.feasible);
      } catch (e) {
        setStatus('Fehler: ' + e.message, true);
        log('SBC', e);
      } finally {
        pane.querySelectorAll('[data-a="solve"]').forEach((b) => { b.disabled = false; });
      }
    }

    async function runApply() {
      if (!lastSol || !lastSol.feasible) return;
      if (lastSol.players.some((p) => p && lockedIds().has(p.id))) { setStatus('Lösung enthält gesperrte Spieler – bitte neu lösen.', true); return; }
      try {
        setStatus('Setze Spieler ein …');
        await apply(info, lastSol);
        setStatus('✓ Eingesetzt. Falls die Aufstellung nicht sofort erscheint: einmal zurück und die Aufgabe neu öffnen. Dann prüfen und selbst einreichen.');
        if (planValid() && plan.items[info.id]) { plan.items[info.id].done = true; plan.items[info.id].players = lastSol.players.filter(Boolean).map((p) => ({ id: p.id, name: p.name, rating: p.rating })); savePlan(); }
        // Fenster schließen, damit „Absenden“ und EAs Bestätigung nicht verdeckt werden
        setTimeout(() => { pane.classList.remove('open'); showToast('✓ Spieler eingesetzt – prüfen und selbst „Absenden“'); }, 700);
      } catch (e) {
        setStatus('Einsetzen fehlgeschlagen: ' + e.message + ' – bitte „Diagnose kopieren“ und mir schicken.', true);
        log('SBC apply', e);
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

    return { CAP, readChallenge, findSbcContext, loadClub, activeSquadIds, userCoins: () => { try { const u = W.services.User.getUser(); return toNum(u.coins && (u.coins.amount ?? u.coins)); } catch (e) { return null; } } };
  })();

