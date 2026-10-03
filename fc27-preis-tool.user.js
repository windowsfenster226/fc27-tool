// ==UserScript==
// @name         FC27 Transferliste – Preis- & Profit-Tool
// @namespace    fc27-preis-tool
// @version      2.20.0
// @description  SBC-Solver, Trading-Finder, Snipe-Tastenkürzel und Preis-/Profit-Anzeige. Zeigt für deine Transferliste Startpreis, Sofortkauf, Verkaufspreis, Netto-Profit (nach 5 % EA-Steuer) und Futbin-Marktpreise.
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
// @connect      ntfy.sh
// @run-at       document-idle
// @homepageURL  https://github.com/windowsfenster226/fc27-tool
// @updateURL    https://raw.githubusercontent.com/windowsfenster226/fc27-tool/main/fc27-preis-tool.user.js
// @downloadURL  https://raw.githubusercontent.com/windowsfenster226/fc27-tool/main/fc27-preis-tool.user.js
// ==/UserScript==

(function () {
  'use strict';

  const W = unsafeWindow;
  const TOOL_VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '?';

// ==========================================================================
// SBC-Solver-Kern (reine Logik, keine EA-/DOM-Zugriffe)
// Anforderungen dekodieren · Teambewertung · Chemie (FC27) · heuristische Suche
// Datenformat der Anforderungen (elgReq) laut dokumentierter FC27-Web-App-Aufzeichnung
// aus dem MIT-lizenzierten Projekt "fut-squad-lab" (B. S. Knudsen) – Code hier ist eigenständig.
// ==========================================================================
const SBC = (function () {
  'use strict';

  // --- EA-Schlüssel (Fallback, falls window.SBCEligibilityKey fehlt) ---
  const KEY_FALLBACK = {
    0: 'TEAM_STAR_RATING', 2: 'PLAYER_COUNT', 3: 'PLAYER_QUALITY', 4: 'SAME_NATION_COUNT',
    5: 'SAME_LEAGUE_COUNT', 6: 'SAME_CLUB_COUNT', 7: 'NATION_COUNT', 8: 'LEAGUE_COUNT',
    9: 'CLUB_COUNT', 10: 'NATION_ID', 11: 'LEAGUE_ID', 12: 'CLUB_ID', 13: 'SCOPE',
    15: 'LEGEND_COUNT', 16: 'NUM_TROPHY_REQUIRED', 17: 'PLAYER_LEVEL', 18: 'PLAYER_RARITY',
    19: 'TEAM_RATING_1_TO_100', 21: 'PLAYER_COUNT_COMBINED', 25: 'PLAYER_RARITY_GROUP',
    26: 'PLAYER_MIN_OVR', 27: 'PLAYER_EXACT_OVR', 28: 'PLAYER_MAX_OVR',
    30: 'FIRST_OWNER_PLAYERS_COUNT', 33: 'PLAYER_TRADABILITY', 35: 'CHEMISTRY_POINTS',
    36: 'ALL_PLAYERS_CHEMISTRY_POINTS',
  };
  const SCOPE = { 0: 'MIN', 1: 'MAX', 2: 'EXACT', 3: 'RANGE' };

  // Spielerbezogene Filter (zusammen mit PLAYER_COUNT: "mind. X Spieler mit …")
  const MATCH = {
    NATION_ID: { field: 'nationId', label: 'aus Nation' },
    LEAGUE_ID: { field: 'leagueId', label: 'aus Liga' },
    CLUB_ID: { field: 'clubId', label: 'aus Verein' },
    PLAYER_LEVEL: { field: 'level', label: 'Qualität' },
    PLAYER_RARITY: { field: 'rarity', label: 'Seltenheit' },
    PLAYER_MIN_OVR: { field: 'minOvr', label: 'Rating mind.' },
    PLAYER_EXACT_OVR: { field: 'exactOvr', label: 'Rating genau' },
    PLAYER_MAX_OVR: { field: 'maxOvr', label: 'Rating max.' },
    PLAYER_TRADABILITY: { field: 'tradability', label: 'Handelbarkeit' },
    PLAYER_RARITY_GROUP: { field: 'rarityGroup', label: 'Kartengruppe' },
  };
  const LEVEL_NAME = { 1: 'Bronze', 2: 'Silber', 3: 'Gold' };

  // Formationen: Slot-Positionen in Payload-Reihenfolge (nur verifizierte Codes;
  // bevorzugt werden die Positionen direkt aus EAs Squad gelesen)
  const FORMATIONS = {
    f343: ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CM', 'LW', 'ST', 'RW'],
    f442: ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'],
    f4141: ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'LM', 'CM', 'CM', 'RM', 'ST'],
    f451: ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'CM', 'RM', 'ST'],
    f532: ['GK', 'LB', 'CB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CM', 'ST', 'ST'],
    f5212: ['GK', 'LB', 'CB', 'CB', 'CB', 'RB', 'CDM', 'CDM', 'CAM', 'ST', 'ST'],
    f3142: ['GK', 'CB', 'CB', 'CB', 'CDM', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'],
  };

  // EA-Positions-IDs -> allgemeine Position
  const POS_BY_ID = ['GK', 'CB', 'RWB', 'RB', 'CB', 'CB', 'CB', 'LB', 'LWB', 'CDM', 'CDM', 'CDM', 'RM',
    'CM', 'CM', 'CM', 'LM', 'CAM', 'CAM', 'CAM', 'CF', 'CF', 'CF', 'RW', 'ST', 'ST', 'ST', 'LW'];
  const POS_ALIAS = { RCB: 'CB', LCB: 'CB', SW: 'CB', RDM: 'CDM', LDM: 'CDM', RCM: 'CM', LCM: 'CM',
    RAM: 'CAM', LAM: 'CAM', RF: 'CF', LF: 'CF', RS: 'ST', LS: 'ST' };
  function normPos(p) {
    if (p == null) return null;
    if (typeof p === 'number') return POS_BY_ID[p] || null;
    const s = String(p).toUpperCase().trim();
    if (/^\d+$/.test(s)) return POS_BY_ID[+s] || null;
    return POS_ALIAS[s] || s;
  }

  const ICON_LEAGUE = 2118;
  const ICON_RARITY = 12;
  const HERO_RARITIES = new Set([72]);
  const levelOf = (rating) => (rating >= 75 ? 3 : rating >= 65 ? 2 : 1);

  // ---------- Anforderungen dekodieren ----------
  function keyName(key, liveEnum) {
    if (liveEnum && typeof liveEnum[key] === 'string') return liveEnum[key];
    return KEY_FALLBACK[key] || `KEY_${key}`;
  }

  // EA benutzt für dieselbe Anforderung teils andere Namen – auf einen Namen vereinheitlichen
  const ALIAS = {
    PLAYER_OVERALL_RATING_MIN: 'PLAYER_MIN_OVR', PLAYER_OVERALL_RATING_MAX: 'PLAYER_MAX_OVR',
    PLAYER_OVERALL_RATING_EXACT: 'PLAYER_EXACT_OVR', PLAYER_OVR_MIN: 'PLAYER_MIN_OVR', PLAYER_OVR_MAX: 'PLAYER_MAX_OVR',
    TEAM_RATING: 'TEAM_RATING_1_TO_100', TEAM_CHEMISTRY: 'CHEMISTRY_POINTS',
  };
  const KNOWN_NAMES = new Set([...Object.values(KEY_FALLBACK), ...Object.keys(MATCH)]);
  function canonical(e, liveEnum) {
    let n = typeof e.type === 'string' && e.type ? e.type : keyName(e.eligibilityKey, liveEnum);
    if (ALIAS[n]) n = ALIAS[n];
    if (!KNOWN_NAMES.has(n) && KEY_FALLBACK[e.eligibilityKey]) n = KEY_FALLBACK[e.eligibilityKey];
    return n;
  }

  function decodeRequirements(elgReq, liveEnum) {
    const slots = new Map();
    for (const e of elgReq || []) {
      if (!e || typeof e !== 'object') continue;
      const slot = e.eligibilitySlot ?? 0;
      const name = canonical(e, liveEnum);
      if (!slots.has(slot)) slots.set(slot, []);
      slots.get(slot).push({ name, value: e.eligibilityValue, count: e.count, label: e.label });
    }
    const constraints = [];
    const unsupported = [];
    for (const [slot, entries] of [...slots.entries()].sort((a, b) => a[0] - b[0])) {
      const scopeEntry = entries.find((x) => x.name === 'SCOPE');
      const scope = scopeEntry ? SCOPE[scopeEntry.value] || 'MIN' : 'MIN';
      const rest = entries.filter((x) => x.name !== 'SCOPE');
      const count = rest.find((x) => x.name === 'PLAYER_COUNT' || x.name === 'PLAYER_COUNT_COMBINED');
      const matches = rest.filter((x) => MATCH[x.name]);
      const scalars = rest.filter((x) => x !== count && !MATCH[x.name]);
      if (count || matches.length) {
        if (!matches.length) {
          const c = { id: slot, kind: 'SQUAD_SIZE', value: count.value, scope };
          // weitere, unbekannte Angaben im selben Block -> nicht raten, sondern markieren
          if (scalars.length) { c.unsupported = true; c.extra = scalars.map((x) => `${x.name}=${x.value}`).join(', '); unsupported.push(c); }
          constraints.push(c);
          continue;
        }
        const m = MATCH[matches[0].name];
        const n = count ? (count.value > 0 ? count.value : count.count) : 11;
        const values = matches.map((x) => x.value);
        const c = { id: slot, kind: 'COUNT', field: m.field, fieldName: matches[0].name, values, n, scope };
        if (m.field === 'rarityGroup') { c.unsupported = true; unsupported.push(c); }
        constraints.push(c);
        continue;
      }
      for (const s of scalars) {
        const c = { id: slot, kind: s.name, value: s.value, scope, label: s.label };
        const known = ['TEAM_RATING_1_TO_100', 'CHEMISTRY_POINTS', 'ALL_PLAYERS_CHEMISTRY_POINTS',
          'PLAYER_QUALITY', 'SAME_NATION_COUNT', 'SAME_LEAGUE_COUNT', 'SAME_CLUB_COUNT',
          'NATION_COUNT', 'LEAGUE_COUNT', 'CLUB_COUNT', 'LEGEND_COUNT', 'FIRST_OWNER_PLAYERS_COUNT'];
        if (!known.includes(s.name)) { c.unsupported = true; unsupported.push(c); }
        constraints.push(c);
      }
    }
    return { constraints, unsupported };
  }

  const scopeWord = (scope) => (scope === 'MAX' ? 'max.' : scope === 'EXACT' ? 'genau' : 'mind.');

  function describe(c, names = {}) {
    const nm = (field, v) => (names[field] && names[field][v]) || `#${v}`;
    switch (c.kind) {
      case 'SQUAD_SIZE': return c.extra ? `${scopeWord(c.scope)} ${c.value} Spieler – ${c.extra}` : `Spieler im Team: ${scopeWord(c.scope)} ${c.value}`;
      case 'TEAM_RATING_1_TO_100': return `Teambewertung: ${scopeWord(c.scope)} ${c.value}`;
      case 'CHEMISTRY_POINTS': return `Chemie gesamt: ${scopeWord(c.scope)} ${c.value}`;
      case 'ALL_PLAYERS_CHEMISTRY_POINTS': return `Chemie pro Spieler: ${scopeWord(c.scope)} ${c.value}`;
      case 'PLAYER_QUALITY': return `Spielerqualität: ${c.scope === 'MAX' ? 'max.' : c.scope === 'EXACT' ? 'genau' : 'mind.'} ${LEVEL_NAME[c.value] || c.value}`;
      case 'SAME_NATION_COUNT': return `Spieler derselben Nation: ${scopeWord(c.scope)} ${c.value}`;
      case 'SAME_LEAGUE_COUNT': return `Spieler derselben Liga: ${scopeWord(c.scope)} ${c.value}`;
      case 'SAME_CLUB_COUNT': return `Spieler desselben Vereins: ${scopeWord(c.scope)} ${c.value}`;
      case 'NATION_COUNT': return `Nationen: ${scopeWord(c.scope)} ${c.value}`;
      case 'LEAGUE_COUNT': return `Ligen: ${scopeWord(c.scope)} ${c.value}`;
      case 'CLUB_COUNT': return `Vereine: ${scopeWord(c.scope)} ${c.value}`;
      case 'LEGEND_COUNT': return `Icons: ${scopeWord(c.scope)} ${c.value}`;
      case 'FIRST_OWNER_PLAYERS_COUNT': return `Spieler aus erster Hand: ${scopeWord(c.scope)} ${c.value}`;
      case 'COUNT': {
        const v = c.values.map((x) => {
          if (c.field === 'level') return LEVEL_NAME[x] || x;
          if (c.field === 'rarity') return x === 1 ? 'Selten' : x === 0 ? 'Gewöhnlich' : `Seltenheit ${x}`;
          if (c.field === 'tradability') return x === 1 ? 'nicht handelbar' : 'handelbar';
          if (c.field === 'minOvr' || c.field === 'exactOvr' || c.field === 'maxOvr') return x;
          return nm(c.field, x);
        }).join(' / ');
        const what = MATCH[c.fieldName] ? MATCH[c.fieldName].label : c.fieldName;
        return `${scopeWord(c.scope)} ${c.n} Spieler – ${what}: ${v}`;
      }
      default: return `${c.kind}: ${scopeWord(c.scope)} ${c.value}`;
    }
  }

  // ---------- Teambewertung (EA-Formel) ----------
  function teamRatingRaw(ratings) {
    const r = ratings.slice(0, 11);
    while (r.length < 11) r.push(0);
    const sum = r.reduce((a, b) => a + b, 0);
    const mean = sum / 11;
    const total = r.reduce((a, x) => a + (x <= mean ? x : 2 * x - mean), 0);
    return Math.round((total / 11) * 100) / 100;
  }
  function teamRating(ratings) {
    const raw = teamRatingRaw(ratings);
    const base = Math.floor(raw);
    return raw - base >= 0.96 - 1e-9 ? base + 1 : base;
  }

  // ---------- Chemie (FC27-Regeln) ----------
  const CLUB_T = [[7, 3], [4, 2], [2, 1]];
  const LEAGUE_T = [[8, 3], [5, 2], [3, 1]];
  const NATION_T = [[8, 3], [5, 2], [2, 1]];
  const pts = (n, table) => { for (const [need, p] of table) if (n >= need) return p; return 0; };
  const isIcon = (p) => p.rarity === ICON_RARITY || p.leagueId === ICON_LEAGUE;
  const isHero = (p) => HERO_RARITIES.has(p.rarity);

  // players: Array (Länge = Slots) von Spielerobjekten oder null; positions: Slot-Positionen (oder null = unbekannt)
  function chemistry(players, positions) {
    const inPos = players.map((p, i) => {
      if (!p) return false;
      const slot = positions && positions[i];
      if (!slot) return true;
      return (p.positions || []).includes(slot);
    });
    const club = new Map(), league = new Map(), nation = new Map();
    const add = (m, k, n = 1) => { if (k == null) return; m.set(k, (m.get(k) || 0) + n); };
    const leaguesPresent = new Set();
    players.forEach((p, i) => {
      if (!p || !inPos[i]) return;
      if (isIcon(p)) { add(nation, p.nationId, 1); return; }
      if (isHero(p)) { add(league, p.leagueId, 1); add(nation, p.nationId, 1); leaguesPresent.add(p.leagueId); return; }
      add(club, p.clubId); add(league, p.leagueId); add(nation, p.nationId);
      leaguesPresent.add(p.leagueId);
    });
    const iconCount = players.filter((p, i) => p && inPos[i] && isIcon(p)).length;
    if (iconCount) for (const l of leaguesPresent) add(league, l, iconCount);
    const per = players.map((p, i) => {
      if (!p || !inPos[i]) return 0;
      if (isIcon(p) || isHero(p)) return 3;
      return Math.min(3, pts(club.get(p.clubId) || 0, CLUB_T) + pts(league.get(p.leagueId) || 0, LEAGUE_T) +
        pts(nation.get(p.nationId) || 0, NATION_T));
    });
    return { per, total: per.reduce((a, b) => a + b, 0), inPos };
  }

  // ---------- Bewertung einer Aufstellung ----------
  function cmpScope(val, target, scope) {
    // gibt Fehlbetrag (0 = erfüllt) zurück
    if (scope === 'MAX') return Math.max(0, val - target);
    if (scope === 'EXACT') return Math.abs(val - target);
    return Math.max(0, target - val);
  }

  function matchesValue(p, field, values) {
    switch (field) {
      case 'nationId': return values.includes(p.nationId);
      case 'leagueId': return values.includes(p.leagueId);
      case 'clubId': return values.includes(p.clubId);
      case 'level': return values.includes(levelOf(p.rating));
      case 'rarity': return values.some((v) => (v === 1 ? p.rarity >= 1 : v === 0 ? p.rarity === 0 : p.rarity === v));
      case 'minOvr': return values.some((v) => p.rating >= v);
      case 'exactOvr': return values.includes(p.rating);
      case 'maxOvr': return values.some((v) => p.rating <= v);
      case 'tradability': return values.some((v) => (v === 1 ? p.untradeable : !p.untradeable));
      default: return true;
    }
  }

  function groupSizes(players, key) {
    const m = new Map();
    for (const p of players) if (p && p[key] != null) m.set(p[key], (m.get(p[key]) || 0) + 1);
    return m;
  }

  function evaluate(players, positions, constraints) {
    const present = players.filter(Boolean);
    const ratings = players.map((p) => (p ? p.rating : 0));
    const rRaw = teamRatingRaw(ratings);
    const rating = teamRating(ratings);
    const chem = chemistry(players, positions);
    const results = [];
    let penalty = 0;
    for (const c of constraints) {
      if (c.unsupported) { results.push({ c, ok: null, miss: 0 }); continue; }
      let miss = 0, val = null;
      switch (c.kind) {
        case 'SQUAD_SIZE': val = present.length; miss = cmpScope(val, c.value, c.scope); break;
        case 'TEAM_RATING_1_TO_100': val = rating;
          miss = c.scope === 'MAX' ? Math.max(0, rating - c.value) : Math.max(0, c.value - rRaw);
          if (c.scope !== 'MAX' && rating >= c.value) miss = 0;
          break;
        case 'CHEMISTRY_POINTS': val = chem.total; miss = cmpScope(val, c.value, c.scope); break;
        case 'ALL_PLAYERS_CHEMISTRY_POINTS':
          miss = chem.per.reduce((a, x, i) => a + (players[i] ? Math.max(0, c.value - x) : 0), 0);
          val = Math.min(...chem.per.filter((x, i) => players[i]));
          break;
        case 'PLAYER_QUALITY': {
          const lv = present.map((p) => levelOf(p.rating));
          miss = lv.reduce((a, l) => a + cmpScope(l, c.value, c.scope), 0);
          val = c.scope === 'MAX' ? Math.max(...lv) : Math.min(...lv);
          break;
        }
        case 'SAME_NATION_COUNT': case 'SAME_LEAGUE_COUNT': case 'SAME_CLUB_COUNT': {
          const key = c.kind === 'SAME_NATION_COUNT' ? 'nationId' : c.kind === 'SAME_LEAGUE_COUNT' ? 'leagueId' : 'clubId';
          const sizes = [...groupSizes(present, key).values()];
          val = sizes.length ? Math.max(...sizes) : 0;
          miss = c.scope === 'MAX' ? sizes.reduce((a, s) => a + Math.max(0, s - c.value), 0) : cmpScope(val, c.value, c.scope);
          break;
        }
        case 'NATION_COUNT': case 'LEAGUE_COUNT': case 'CLUB_COUNT': {
          const key = c.kind === 'NATION_COUNT' ? 'nationId' : c.kind === 'LEAGUE_COUNT' ? 'leagueId' : 'clubId';
          val = groupSizes(present, key).size; miss = cmpScope(val, c.value, c.scope); break;
        }
        case 'LEGEND_COUNT': val = present.filter(isIcon).length; miss = cmpScope(val, c.value, c.scope); break;
        case 'FIRST_OWNER_PLAYERS_COUNT': val = present.filter((p) => p.owners === 1).length; miss = cmpScope(val, c.value, c.scope); break;
        case 'COUNT': {
          val = present.filter((p) => matchesValue(p, c.field, c.values)).length;
          miss = cmpScope(val, c.n, c.scope); break;
        }
        default: break;
      }
      penalty += miss;
      results.push({ c, ok: miss === 0, miss, val });
    }
    // gleicher Spieler (assetId) darf nicht doppelt vorkommen
    const seen = new Set();
    let dup = 0;
    for (const p of present) { if (seen.has(p.assetId)) dup++; seen.add(p.assetId); }
    penalty += dup * 5;
    return { rating, ratingRaw: rRaw, chem, results, penalty, feasible: penalty === 0 };
  }

  // ---------- Suche ----------
  function solve(pool, slots, constraints, opts = {}) {
    const timeMs = opts.timeMs ?? 3000;
    const now = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();
    const t0 = now();
    const n = slots.length;
    const positions = slots.map((s) => s.position || null);
    const fixed = slots.map((s) => s.fixed || null);
    const open = slots.map((s, i) => i).filter((i) => !fixed[i] && !slots[i].blocked);
    const cand = pool.filter((p) => !fixed.some((f) => f && f.assetId === p.assetId));
    if (cand.length < open.length) return { error: `Zu wenige passende Spieler im Verein (${cand.length}).` };

    const byRating = [...cand].sort((a, b) => a.rating - b.rating || a.cost - b.cost);
    const cheapest = [...cand].sort((a, b) => a.cost - b.cost);
    const hasChem = constraints.some((c) => !c.unsupported && (c.kind === 'CHEMISTRY_POINTS' || c.kind === 'ALL_PLAYERS_CHEMISTRY_POINTS'));
    const W = 1e6;
    const score = (arr) => {
      const ev = evaluate(arr, positions, constraints);
      let cost = 0;
      for (const i of open) if (arr[i]) cost += arr[i].cost;
      return { s: cost + ev.penalty * W, cost, ev };
    };
    const rnd = (k) => Math.floor(Math.random() * k);
    const fitsPos = (p, i) => !positions[i] || (p.positions || []).includes(positions[i]);

    function initial() {
      const arr = fixed.slice();
      const used = new Set(fixed.filter(Boolean).map((p) => p.assetId));
      for (const i of open) {
        let pick = null;
        const src = cheapest.slice(0, Math.min(cheapest.length, 400));
        const pref = hasChem ? src.filter((p) => fitsPos(p, i)) : src;
        const list = pref.length ? pref : src;
        for (let t = 0; t < 40 && !pick; t++) {
          const p = list[rnd(Math.min(list.length, 60))];
          if (p && !used.has(p.assetId)) pick = p;
        }
        if (!pick) pick = cand.find((p) => !used.has(p.assetId));
        arr[i] = pick; used.add(pick.assetId);
      }
      return arr;
    }

    // Kandidaten, die eine verletzte Bedingung verbessern könnten
    function targeted(ev, i) {
      const bad = ev.results.filter((r) => r.ok === false);
      if (!bad.length || Math.random() < 0.35) return cand[rnd(cand.length)];
      const r = bad[rnd(bad.length)].c;
      if (r.kind === 'TEAM_RATING_1_TO_100') {
        const lo = byRating.findIndex((p) => p.rating >= r.value - 3);
        const from = lo < 0 ? byRating.length - 30 : lo;
        return byRating[Math.max(0, from + rnd(Math.max(1, Math.min(60, byRating.length - from))))];
      }
      if (r.kind === 'COUNT') {
        const m = cand.filter((p) => matchesValue(p, r.field, r.values));
        if (m.length && r.scope !== 'MAX') return m[rnd(m.length)];
      }
      if (r.kind === 'CHEMISTRY_POINTS' || r.kind === 'ALL_PLAYERS_CHEMISTRY_POINTS' || r.kind.startsWith('SAME_')) {
        // Spieler, die Nation/Liga/Verein mit bereits gesetzten teilen
        const other = ev.__arr.filter(Boolean);
        const ref = other[rnd(other.length)];
        const keys = ['clubId', 'leagueId', 'nationId'];
        const k = keys[rnd(3)];
        const m = cand.filter((p) => p[k] === ref[k] && fitsPos(p, i));
        if (m.length) return m[rnd(m.length)];
      }
      if (r.kind === 'PLAYER_QUALITY') {
        const m = cand.filter((p) => cmpScope(levelOf(p.rating), r.value, r.scope) === 0);
        if (m.length) return m[rnd(Math.min(m.length, 200))];
      }
      if (hasChem) { const m = cand.filter((p) => fitsPos(p, i)); if (m.length) return m[rnd(m.length)]; }
      return cand[rnd(cand.length)];
    }

    let best = null, bestAny = null;
    let iters = 0, restarts = 0;
    // Ohne gültige Lösung bis zum Zeitlimit: automatisch bis zum 2,5-fachen weitersuchen
    const limit = () => (best ? timeMs : timeMs * 2.5);
    while (now() - t0 < limit()) {
      restarts++;
      // Neustart: abwechselnd frisch oder vom bisher besten Stand (leicht verändert) aus
      let cur;
      if (bestAny && restarts % 2 === 0) {
        cur = bestAny.players.slice();
        for (let k = 0; k < 3; k++) {
          const i = open[rnd(open.length)];
          const p = cand[rnd(cand.length)];
          if (!cur.some((q) => q && q.assetId === p.assetId)) cur[i] = p;
        }
      } else cur = initial();
      let cs = score(cur); cs.ev.__arr = cur;
      let temp = 1;
      const restartBudget = Math.max(400, timeMs / 6);
      const rt0 = now();
      while (now() - rt0 < restartBudget && now() - t0 < limit()) {
        iters++;
        const next = cur.slice();
        const mv = Math.random();
        if (mv < 0.2 && open.length > 1) {
          const a = open[rnd(open.length)], b = open[rnd(open.length)];
          [next[a], next[b]] = [next[b], next[a]];
        } else {
          const i = open[rnd(open.length)];
          const p = targeted(cs.ev, i);
          if (!p || next.some((q) => q && q.assetId === p.assetId)) continue;
          next[i] = p;
        }
        const ns = score(next); ns.ev.__arr = next;
        const d = ns.s - cs.s;
        const dp = ns.ev.penalty - cs.ev.penalty;
        // Kosten-Verschlechterung gelegentlich erlauben; kleine Regel-Verschlechterung selten erlauben,
        // damit die Suche aus Sackgassen herausfindet (v. a. bei Chemie)
        const accept = d <= 0 || (dp <= 0 && Math.random() < Math.exp(-d / (temp * 500))) || (dp > 0 && dp <= 2 && Math.random() < 0.03 * temp);
        if (accept) { cur = next; cs = ns; }
        if (!bestAny || cs.ev.penalty < bestAny.pen || (cs.ev.penalty === bestAny.pen && cs.cost < bestAny.cost)) bestAny = { players: cur.slice(), pen: cs.ev.penalty, cost: cs.cost };
        temp *= 0.9995;
        if (cs.ev.feasible && (!best || cs.cost < best.cost)) best = { players: cur.slice(), cost: cs.cost, ev: cs.ev };
      }
      if (!best && restarts > 50) break;
    }
    if (!best) {
      // bestes Nicht-Ergebnis zurückgeben (zur Anzeige, was fehlt)
      const cur = initial();
      const cs = score(cur);
      return { players: cur, cost: cs.cost, ev: cs.ev, feasible: false, iters, restarts };
    }
    return { ...best, feasible: true, iters, restarts, positions };
  }

  // ---------- Günstigste Rating-Kombination für eine Teambewertung ----------
  // prices: { rating: preis } ; fixed: bereits vorhandene Ratings (z. B. eigene Spieler)
  function cheapestCombo(prices, target, n = 11, fixed = []) {
    const rs = Object.keys(prices).map(Number).filter((r) => prices[r] > 0).sort((a, b) => a - b);
    const need = n - fixed.length;
    if (!rs.length || need <= 0) return null;
    const minP = Math.min(...rs.map((r) => prices[r]));
    let best = null;
    const pick = [];
    (function rec(start, cost) {
      if (best && cost + (need - pick.length) * minP >= best.cost) return;
      if (pick.length === need) {
        if (teamRating([...fixed, ...pick]) >= target) best = { ratings: [...pick].sort((a, b) => b - a), cost };
        return;
      }
      for (let i = start; i < rs.length; i++) { pick.push(rs[i]); rec(i, cost + prices[rs[i]]); pick.pop(); }
    })(0, 0);
    return best;
  }

  return { cheapestCombo, KEY_FALLBACK, FORMATIONS, normPos, decodeRequirements, describe, teamRating, teamRatingRaw,
    chemistry, evaluate, solve, levelOf, isIcon, isHero };
})();

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
    sources: { futbin: true, ea: true },
  };
  const stored = GM_getValue(SETTINGS_KEY, {});
  const settings = Object.assign({}, DEFAULTS, stored);
  settings.mainSource = 'futbin';
  if (settings.sources.ea === undefined) settings.sources.ea = true;
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
  if (settings.bumpField === undefined) settings.bumpField = 'minBin';     // 'minBin' = Min.-Sofortkauf hoch/runter, 'maxBid' = Max.-Gebot hochzählen
  if (settings.bumpStart === undefined) settings.bumpStart = 1000000;
  if (settings.bumpMinMax === undefined) settings.bumpMinMax = 1000;
  settings.keys = Object.assign({ search: '1', buy: '2', confirm: '3', back: '4', up: '5', down: '6', snipe: '7' }, settings.keys || {});
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
  // Mindest-Verkaufspreis ohne Verlust (nach Steuer), auf gültige EA-Preisstufe aufgerundet
  const breakEven = (b) => {
    const v = Math.ceil(b / (1 - CONFIG.taxRate));
    const st = v < 1000 ? 50 : v < 10000 ? 100 : v < 50000 ? 250 : v < 100000 ? 500 : 1000;
    return Math.ceil(v / st) * st;
  };
  const fmtTime = (sec) => {
    if (sec == null || sec < 0) return '–';
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h} Std ${m} Min` : `${m}:${String(s).padStart(2, '0')}`;
  };

  let futbinBlockedUntil = 0;
  const BLOCK_MSG = 'Futbin bremst gerade (zu viele Abrufe). Bitte 5–10 Min. warten.';
  const CHECK_MSG = 'Futbin hat die Anfrage abgelehnt (Sicherheitsprüfung). Öffne futbin.com einmal in diesem Browser – am iPhone in Safari –, bestätige ggf. die Prüfung und versuch es dann erneut.';
  const isFutbinBlock = (e) => !!e && (e.message === BLOCK_MSG || e.message === CHECK_MSG);
  const futbinBlocked = () => Date.now() < futbinBlockedUntil;
  function gmGet(url, type = 'json') {
    if (/futbin\.com/.test(url) && futbinBlocked()) return Promise.reject(new Error(BLOCK_MSG));
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 15000,
        headers: { Accept: type === 'json' ? 'application/json' : 'text/html' },
        onload: (r) => {
          if (r.status === 429 && /futbin\.com/.test(url)) {
            futbinBlockedUntil = Date.now() + 5 * 60000;   // echte Drosselung -> 5 Min. Pause
            return reject(new Error(BLOCK_MSG));
          }
          if (r.status === 403 && /futbin\.com/.test(url)) {
            futbinBlockedUntil = Date.now() + 60000;       // Sicherheitsprüfung -> nur kurz pausieren
            return reject(new Error(CHECK_MSG));
          }
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
    ea: {
      label: 'EA-Ø',
      async price(p) {
        // EAs eigener Marktdurchschnitt aus den Daten, die die Web App ohnehin lädt
        const cap = typeof SBCUI !== 'undefined' ? SBCUI.CAP : null;
        if (!cap) return null;
        let raw = p.itemId != null ? cap.raw.get(p.itemId) : null;
        if (!raw || !raw.marketAverage) {
          for (const r of cap.raw.values()) { if (r.resourceId === p.resourceId && r.marketAverage) { raw = r; break; } }
        }
        return raw && raw.marketAverage > 0 ? raw.marketAverage : null;
      },
    },
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
  function loadTransferListOnce() {
    return new Promise((resolve, reject) => {
      const svc = W.services && W.services.Item;
      if (!svc || typeof svc.requestTransferItems !== 'function') {
        return reject(new Error('Web App noch nicht bereit. Bitte einloggen, kurz warten und erneut auf „Aktualisieren“ klicken.'));
      }
      const t = setTimeout(() => reject(Object.assign(new Error('EA antwortet nicht.'), { status: 'timeout' })), 15000);
      svc.requestTransferItems().observe(W, function (observer, res) {
        clearTimeout(t);
        if (observer && typeof observer.unobserve === 'function') observer.unobserve(W);
        if (!res || !res.success) {
          const st = res && (res.status || (res.error && res.error.code));
          const hint = st === 429 || st === 512 || st === 521 ? ' EA bremst gerade (zu viele Anfragen, z. B. nach vielen Suchen) – ein paar Minuten warten.'
            : st === 458 || st === 459 ? ' EA verlangt eine Bestätigung – in der Web App die Prüfung abschließen (ggf. Seite neu laden).'
              : st === 401 || st === 403 ? ' Sitzung abgelaufen – Web App neu laden und neu einloggen.'
                : ' Öffne einmal Transfers › Transferliste in der Web App und versuche es erneut.';
          return reject(Object.assign(new Error(`EA hat die Transferliste nicht geliefert${st ? ` (Code ${st})` : ''}.${hint}`), { status: st }));
        }
        resolve((res.response && res.response.items) || (res.data && res.data.items) || []);
      });
    });
  }
  // Ein Fehlschlag kommt oft nur kurz vor -> einmal nach 2 Sek. wiederholen (nicht bei Drosselung)
  async function loadTransferList() {
    try { return await loadTransferListOnce(); } catch (e) {
      if ([429, 458, 459, 512, 521, 401, 403].includes(e.status) || /bereit/.test(e.message)) throw e;
      await sleep(2000);
      return loadTransferListOnce();
    }
  }

  // EA liefert die Position als Zahl -> deutsche Kürzel wie in der Web App
  const POS = ['TW', 'LIB', 'RAV', 'RV', 'IV', 'IV', 'IV', 'LV', 'LAV', 'ZDM', 'ZDM', 'ZDM', 'RM', 'ZM', 'ZM', 'ZM', 'LM',
    'ZOM', 'ZOM', 'ZOM', 'RS', 'MS', 'LS', 'RF', 'ST', 'ST', 'ST', 'LF'];
  const posName = (v) => (typeof v === 'number' ? POS[v] || '' : v || '');

  // Selbst eingetragene Kaufpreise (für gezogene Karten oder wenn EA keinen kennt), je Item-ID
  const BOUGHT_KEY = 'fcpt_bought';
  const manualBought = GM_getValue(BOUGHT_KEY, {});
  const AUTO_KEY = 'fcpt_bought_auto';
  const autoBought = GM_getValue(AUTO_KEY, {});
  function recordBuy(itemId, price) {
    price = toNum(price);
    if (itemId == null || !price || autoBought[itemId]) return;
    autoBought[itemId] = price;
    const keys = Object.keys(autoBought);
    if (keys.length > 3000) keys.slice(0, keys.length - 3000).forEach((k) => delete autoBought[k]);
    GM_setValue(AUTO_KEY, autoBought);
    log('Kauf erfasst', itemId, price);
  }
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
      const autoB = it.id != null ? toNum(autoBought[it.id]) : null;
      const bought = manual || autoB || toNum(it.lastSalePrice);
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
        boughtAuto: !manual && !!autoB,
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
  const EXP_KEY = 'fcpt_expired';
  const expiredLog = GM_getValue(EXP_KEY, {});
  // Zählt, wie oft eine Karte schon abgelaufen ist (jede Auktion hat eine eigene tradeId)
  function noteExpired(p) {
    if (!p || !p.expired || p.itemId == null || !p.tradeId) return expiredCount(p && p.itemId);
    const e = expiredLog[p.itemId] || { trades: [] };
    if (!e.trades.includes(p.tradeId)) {
      e.trades = e.trades.concat(p.tradeId).slice(-12);
      expiredLog[p.itemId] = e;
      const ks = Object.keys(expiredLog);
      if (ks.length > 2000) ks.slice(0, ks.length - 2000).forEach((k) => delete expiredLog[k]);
      GM_setValue(EXP_KEY, expiredLog);
    }
    return e.trades.length;
  }
  const expiredCount = (id) => (id != null && expiredLog[id] ? expiredLog[id].trades.length : 0);
  // Preisvorschlag fürs (Neu-)Einstellen: Marktpreis; nach 2+ Mal abgelaufen 3 % darunter – nie unter "ohne Verlust"
  function listSuggest(p, market) {
    const n = expiredCount(p.itemId);
    let bin = roundPrice(market);
    if (n >= 2) {
      const v = market * 0.97;
      const st = v < 1000 ? 50 : v < 10000 ? 100 : v < 50000 ? 250 : v < 100000 ? 500 : 1000;
      bin = Math.max(Math.floor(v / st) * st, p.bought ? breakEven(p.bought) : 0, 200);
    }
    return { bin, n };
  }
  function expiredChip(p, market) {
    const n = expiredCount(p.itemId);
    if (n < 2 || p.sold) return '';
    const sug = market ? listSuggest(p, market).bin : null;
    return `<span class="fcpt-chip loss" title="Diese Karte ist schon ${n}× ohne Käufer abgelaufen">⏳ ${n}× abgelaufen${sug ? ` · Vorschlag <b>${fmt(sug)}</b>` : ''}</span>`;
  }

  function recordSale(p) {
    if (!p || !p.sold || !p.soldFor) return;
    if (p.itemId != null && expiredLog[p.itemId]) { delete expiredLog[p.itemId]; GM_setValue(EXP_KEY, expiredLog); }
    if (p.itemId != null && typeof SELLALERT !== 'undefined') SELLALERT.sold(p.itemId);
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
    .fcpt-ver{display:inline-block;margin-left:6px;font-size:10.5px;font-weight:700;color:#1a1300;background:#f5c518;border-radius:999px;padding:1px 7px;vertical-align:middle}
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
    .fcpt-trade{display:none;overflow:auto;padding:12px 14px 90px;flex:1;flex-direction:column;gap:12px}
    #fcpt-panel.v-trade .fcpt-trade{display:flex}
    #fcpt-panel.v-trade .fcpt-list,#fcpt-panel.v-trade .fcpt-sum,#fcpt-panel.v-trade .fcpt-toolbar{display:none}
    .fcpt-tabs button[data-tab="settings"]{flex:0 0 42px}
    .fcpt-bigbtn{width:100%;background:linear-gradient(135deg,#f9d85a,#e0a800);color:#1a1300;border:0;border-radius:10px;padding:10px 12px;font:700 14px system-ui,sans-serif;cursor:pointer}
    .fcpt-trade input[type=number]{width:96px;background:var(--bg3);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px 8px;font:inherit;text-align:right}
    .ttab{font-size:12px}.ttab td{vertical-align:top}.ttab td.n{white-space:nowrap}.ttab a{color:var(--ink);text-decoration:none}.ttab a:hover{color:var(--gold)}
    .tsig{font-size:11.5px;font-weight:700;white-space:nowrap;color:var(--ink2);background:#1f2a3c;border-radius:999px;padding:3px 9px}
    .tsig.good{color:#86efac;background:rgba(34,197,94,.15)}.tsig.hot{color:#fca5a5;background:rgba(239,68,68,.15)}.tsig.bad{color:#fcd34d;background:rgba(245,158,11,.15)}
    .tbar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px}
    .tchk{font-size:12px;color:var(--ink2);display:flex;gap:5px;align-items:center;cursor:pointer}
    .tlist{display:flex;flex-direction:column;gap:8px}
    .tcard{background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
    .tc-top{display:flex;align-items:center;gap:10px}
    .tc-ovr{background:linear-gradient(160deg,#f6e08a,#c9a227);color:#241a00;font-weight:800;border-radius:6px;padding:3px 7px;font-size:13px;flex:none}
    .tc-name{flex:1;min-width:0;color:var(--ink);font-weight:700;font-size:15px;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tc-name:hover{color:var(--gold)}
    .tc-profit{text-align:right;flex:none}.tc-profit b{display:block;color:var(--pos);font-size:18px;font-variant-numeric:tabular-nums}.tc-profit small{color:var(--ink3);font-size:11px}
    .tc-sig{display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap}
    .trel{font-size:11px;font-weight:700;border-radius:999px;padding:3px 8px;white-space:nowrap}
    .trel.good{background:rgba(34,197,94,.15);color:#86efac}.trel.mid{background:rgba(245,158,11,.15);color:#fcd34d}.trel.bad{background:rgba(239,68,68,.15);color:#fca5a5}
    .tc-trend{font-size:11.5px;color:var(--ink3)}.tc-trend.up{color:#86efac}.tc-trend.down{color:#fca5a5}
    .tspark{width:100%;height:46px;display:block;margin-top:8px}
    .tspark .pl{fill:none;stroke:#f5c518;stroke-width:2;vector-effect:non-scaling-stroke}
    .tspark .lb{stroke:#22c55e;stroke-width:1;stroke-dasharray:4 3;vector-effect:non-scaling-stroke}
    .tspark .ls{stroke:#ef4444;stroke-width:1;stroke-dasharray:4 3;vector-effect:non-scaling-stroke}
    .tspark .pt{fill:#f5c518}
    .tc-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}
    .tc-stats>div{background:var(--bg3);border-radius:8px;padding:5px 8px}
    .tc-stats span{display:block;font-size:10.5px;color:var(--ink3)}.tc-stats b{font-size:14px;font-variant-numeric:tabular-nums}
    .tc-stats .buy b{color:#86efac}.tc-stats .sell b{color:#fca5a5}
    .cv-bands{display:flex;flex-direction:column;gap:5px;margin:4px 0}
    .cv-band{display:grid;grid-template-columns:62px 1fr 78px 34px;align-items:center;gap:8px;font-size:12px;color:var(--ink2)}
    .cv-band b{text-align:right;color:var(--ink);font-variant-numeric:tabular-nums}.cv-band small{color:var(--ink3);text-align:right}
    .cv-bar{height:8px;background:var(--bg3);border-radius:4px;overflow:hidden}.cv-bar i{display:block;height:100%;background:#f5c518;border-radius:4px}
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
    .fcpt-chip.be{background:#1d2a44;color:#bfdbfe}
    .fcpt-chip.watch{background:#6d28d9;color:#fff;font-weight:700}
    .fcpt-watchhit{outline:3px solid #a855f7 !important;outline-offset:-3px;border-radius:6px}
    .tc-star{background:none;border:0;color:#f5c518;font-size:20px;cursor:pointer;padding:0 2px;line-height:1;flex:none}
    .tc-star:not(.on){color:#7d8aa0}.tc-star:hover{color:#f5c518}
    .wl-row{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;background:var(--bg3);border-radius:8px;padding:6px 8px;border-left:3px solid transparent}
    .wl-row.hit{border-left-color:#a855f7;background:rgba(168,85,247,.12)}
    .pg-list{display:flex;flex-direction:column;gap:4px;margin-top:6px}
    .pg-item{display:flex;gap:6px;align-items:center;text-align:left;background:var(--bg3);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:7px 9px;font:13px system-ui,sans-serif;cursor:pointer}
    .pg-item small{color:var(--ink3)}.pg-item span{margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums}
    .pg-res{margin-top:8px;border-radius:10px;padding:10px 12px;background:var(--bg3);border-left:4px solid var(--ink3)}
    .pg-res.up{border-left-color:var(--pos)}.pg-res.down{border-left-color:var(--neg)}.pg-res.flat{border-left-color:var(--warn)}
    .pg-h{display:flex;gap:6px;align-items:baseline;font-size:13px}.pg-h small{color:var(--ink3)}.pg-h span{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--ink2)}
    .pg-v{font-size:19px;font-weight:800;margin:6px 0 2px}.pg-res.up .pg-v{color:var(--pos)}.pg-res.down .pg-v{color:var(--neg)}.pg-res.flat .pg-v{color:var(--warn)}
    .pg-c{font-size:11.5px;color:var(--ink2)}
    .pg-w{list-style:none;margin:8px 0;padding:0;font-size:12px;display:flex;flex-direction:column;gap:3px}.pg-w li.p{color:#86efac}.pg-w li.n{color:#fca5a5}.pg-w li{color:var(--ink2)}
    .pg-tip{font-size:12.5px;background:rgba(245,197,24,.08);border-radius:8px;padding:6px 8px;margin-bottom:6px}
    .fcpt-subtabs{display:flex;gap:4px;margin:0 0 8px;position:sticky;top:0;z-index:2;background:var(--bg);padding:2px 0}
    .fcpt-subtabs button{flex:1;background:var(--bg3);color:var(--ink2);border:1px solid var(--line);border-radius:999px;padding:6px 4px;font:600 12px system-ui,sans-serif;cursor:pointer}
    .fcpt-subtabs button.on{background:#f5c518;color:#111;border-color:#f5c518}
    .wl-name b{display:block;font-size:13px}.wl-name small{font-size:11px;color:var(--ink3)}
    .wl-t{font-size:11px;color:var(--ink3);display:flex;align-items:center;gap:4px}
    .wl-t input{width:84px !important}
    .wl-x{background:none;border:1px solid var(--line);color:var(--ink2);border-radius:6px;cursor:pointer;padding:2px 7px}
    .wl-x:hover{border-color:#ef4444;color:#fca5a5}
    .tim{display:flex;flex-direction:column;gap:2px;border-radius:12px;padding:9px 12px;border:1px solid var(--line);background:var(--bg2);font-size:12.5px;color:var(--ink2)}
    .tim b{font-size:13.5px;color:var(--ink)}.tim.buy{border-color:rgba(34,197,94,.5);background:rgba(34,197,94,.08)}
    .tim.sell{border-color:rgba(239,68,68,.5);background:rgba(239,68,68,.08)}.tim.warn{border-color:rgba(245,158,11,.6);background:rgba(245,158,11,.1)}
    .rp-list{display:grid;grid-template-columns:1fr;gap:4px}
    .rp-row{display:grid;grid-template-columns:34px 80px 1fr;gap:8px;align-items:center;background:var(--bg3);border-radius:8px;padding:5px 8px;font-size:13px}
    .rp-r{background:linear-gradient(160deg,#f6e08a,#c9a227);color:#241a00;font-weight:800;border-radius:6px;text-align:center;padding:1px 0}
    .rp-row b{text-align:right;font-variant-numeric:tabular-nums}.rp-row small{color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .combo{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline;background:var(--bg3);border-radius:8px;padding:8px 10px;font-size:13px}
    .combo span{margin-left:auto;color:var(--ink2)}
    .sa-list{display:flex;flex-direction:column;gap:5px}
    .sa-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;background:var(--bg3);border-radius:8px;padding:6px 9px}
    .sa-n b{display:block;font-size:13px}.sa-n small,.sa-p small,.sa-p span{display:block;font-size:11px;color:var(--ink3)}
    .sa-p{text-align:right}.sa-p b{font-size:13px;font-variant-numeric:tabular-nums}
    .ntfy-row{display:flex;gap:6px}.ntfy-row input{flex:1;min-width:0;background:var(--bg3);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px 8px;font:12px system-ui,sans-serif}
    .fcpt-smallbtn{background:var(--bg3);border:1px solid var(--line);color:var(--ink2);border-radius:8px;padding:6px 10px;font:12px system-ui,sans-serif;cursor:pointer}
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
          <div><div class="t">FC27 Preis-Tool <span class="fcpt-ver" title="Installierte Version">v${TOOL_VERSION}</span></div><div class="fcpt-stand"></div></div></div>
        <div class="fcpt-icons">
          <button class="ic" data-act="refresh" title="Transferliste neu laden">↻</button>
          <button class="ic" data-act="reload" title="Alle Preise sofort frisch von Futbin holen">⟳</button>
          <button class="ic" data-act="close" title="Schließen">✕</button>
        </div>
      </div>
      <div class="fcpt-tabs"><button data-tab="list" class="on">Transferliste</button><button data-tab="hist">Historie</button><button data-tab="trade">📈 Trading</button><button data-tab="settings" title="Einstellungen">⚙</button></div>
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
        <div class="fcpt-set"><span>Bei jeder Suche einen Preis ändern<small>Sorgt für frische Suchergebnisse</small></span><input type="checkbox" class="fcpt-sw" data-opt="bumpMinBin"></div>
        <div class="fcpt-set"><span>Welchen Preis?</span><select data-set="bumpField"><option value="minBin">Min.-Sofortkauf (hoch/runter)</option><option value="minBinUp">Min.-Sofortkauf hochzählen</option><option value="maxBid">Max.-Gebot hochzählen</option></select></div>
        <div class="fcpt-set"><span>Min.-Sofortkauf bis<small>Zählt je Suche eine Stufe hoch, danach von vorne</small></span><input type="number" min="200" step="50" data-num="bumpMinMax"></div>
        <div class="fcpt-set"><span>Max.-Gebot Startwert<small>Startet hier und steigt je Suche um eine Stufe</small></span><input type="number" min="1000" step="1000" data-num="bumpStart"></div>
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
          <label>Snipe (Suchen + Kaufen)<input data-key="snipe" maxlength="12"></label>
        </div>
        <small style="color:#7d8aa0;font-size:11px">In ein Feld klicken und die neue Taste drücken.</small>
      </div>
    </div>
    <div class="fcpt-trade"></div>
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
  panel.querySelector('[data-set="bumpField"]').value = settings.bumpField;
  panel.querySelector('[data-num="bumpStart"]').value = settings.bumpStart;
  panel.querySelector('[data-num="bumpMinMax"]').value = settings.bumpMinMax;
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
      <div><div class="l">Listenwert</div><div class="v">${fmt(value)}</div></div>
      <div><div class="l">Möglicher Profit</div><div class="v ${profitCls(profit)}">${signed(profit)}</div></div>
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
      : `<button class="fcpt-chip fcpt-edit" data-act="editBought" data-iid="${p.itemId ?? ''}" title="Kaufpreis eintragen/ändern">Gekauft: <b>${p.bought ? fmt(p.bought) : 'gezogen'}</b>${p.boughtManual ? ' (manuell)' : p.boughtAuto ? ' (erfasst)' : ''} ✎</button>`;
    const beChip = !p.sold && p.bought ? `<span class="fcpt-chip be" title="Mindestpreis, damit du nach 5 % Steuer keinen Verlust machst">Ohne Verlust ab <b>${fmt(breakEven(p.bought))}</b></span>` : '';
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
        <div class="fcpt-chips">${boughtChip}${beChip}${p.isPlayer ? expiredChip(p, market) : ''}${p.isPlayer && !p.sold ? `<button class="fcpt-chip fcpt-edit" data-act="target" data-iid="${p.itemId ?? ''}" title="Verkaufs-Alarm: melden, wenn der Futbin-Preis dein Ziel erreicht">${SELLALERT.has(p.itemId) ? '🎯 Ziel ' + fmt(SELLALERT.get(p.itemId).target) : '🎯 Verkaufsziel'}</button>` : ''}<span class="fcpt-prices" style="display:contents">${p.isPlayer ? chipsHtml(p.resourceId) : ''}</span></div>
        <div class="fcpt-warn">${p.isPlayer ? listingWarn(p, market) : ''}</div>
      </div>`;
  }

  function render() {
    if (view === 'settings' || view === 'trade') return;
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
    listEl.innerHTML = UIB.headHtml() + sorted.map(UIB.rowHtml).join('');
    sumEl.innerHTML = overviewHtml();
    updateStand();
    UIB.after();
  }

  function updatePrices(rid) {
    UIB.updateRow(rid);
    if (view === 'home') UIB.after();
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
    items.forEach(noteExpired);
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
    if (act === 'target') {
      const b = e.target.closest('[data-act="target"]');
      const it = items.find((x) => String(x.itemId) === b.dataset.iid);
      if (it) { SELLALERT.toggle(it, marketPrice(it.resourceId)); render(); }
      return;
    }
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
      panel.classList.toggle('v-trade', tab === 'trade');
      if (tab === 'settings') return;
      if (tab === 'trade') { const tr = panel.querySelector('.fcpt-trade'); if (!tr.__mounted) { TRADE.mount(tr); tr.__mounted = true; } return; }
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
    if (t.dataset.set === 'bumpField') { saveSettings(); return; }
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
    noteExpired(p);
    // Fremde Angebote (Transfermarkt-Suche, Transferziele) vs. eigene Karten
    const inSearch = !!(root.closest && root.closest('.SearchResults, .ut-market-search-results-view, .ut-search-results-view'));
    // Nicht gelistete eigene Karten haben keine Auktion (tradeId 0) – die zählen nie als Markt-Angebot
    const hasAuction = !!toNum(p.tradeId);
    const isMarket = !ownIds.has(p.itemId) && hasAuction && (p.tradeOwner === false || (p.tradeOwner == null && inSearch));
    if (isMarket && p.active && p.tradeId != null) marketRows.set(p.tradeId, { raw, root });
    root.classList.remove('fcpt-bargain', 'fcpt-good', 'fcpt-bad', 'fcpt-meh', 'fcpt-watchhit');
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
        (!isMarket ? listingWarn(p, main) : '') + (isMarket && p.active ? bidChip(p) : '') +
        (!isMarket && p.isPlayer && p.bought && !p.sold ? `<span class="fcpt-chip be">Ohne Verlust ab <b>${fmt(breakEven(p.bought))}</b></span>` : '') +
        (isMarket && p.isPlayer ? WATCH.marketChip(p, root) : '') +
        (!isMarket && p.isPlayer ? expiredChip(p, main) : '');
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
    const sugg = listSuggest(p, m);
    const bin = sugg.bin;
    const start = lowerStep(bin);
    const prof = p.bought ? afterTax(bin) - p.bought : null;
    setText(hint, `${p.name}: Start ${fmt(start)} · Sofortkauf ${fmt(bin)}` + (sugg.n >= 2 ? ` · ${sugg.n}× abgelaufen → günstiger` : '') + (prof != null ? ` · Profit ${signed(prof)}` : '') +
      (p.bought && bin < breakEven(p.bought) ? ` · ⚠ unter „ohne Verlust“ (${fmt(breakEven(p.bought))})` : ''));
  }

  function applyListPrice(e) {
    e.preventDefault(); e.stopPropagation();
    const host = findListPanel();
    const p = lastSelected && mapItem(lastSelected);
    if (!host || !p) return;
    const m = cacheGet(`futbin:${settings.platform}:${p.resourceId}`);
    if (!m) return;
    const sugg = listSuggest(p, m);
    const bin = sugg.bin;
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
  // Wert in ein EA-Preisfeld schreiben (wie getippt)
  function setPriceInput(input, v) {
    try {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, String(v));
      ['input', 'change', 'keyup'].forEach((t) => input.dispatchEvent(new Event(t, { bubbles: true })));
      input.blur();
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    } catch (e) { return false; }
  }
  // Max.-Gebot je Suche eine Stufe höher (ab Startwert, oben angekommen wieder von vorn)
  function bumpMaxBid() {
    const filters = [...document.querySelectorAll('.search-prices .price-filter, .price-filter')].filter((f) => shown(f));
    const f = filters[1];
    if (!f) return false;
    const input = f.querySelector('input');
    const up = f.querySelector('.increment-value, button[class*="increment"]');
    const cur = input ? toNum(input.value) || 0 : 0;
    const start = Math.max(1000, settings.bumpStart || 1000000);
    if (cur < start || cur >= 14900000 || !up || !visible(up)) {
      return input ? setPriceInput(input, start) : false;
    }
    pressButton(up);
    return true;
  }
  // Min.-Sofortkauf je Suche eine Stufe höher bis zur Grenze (z. B. 1.000), dann wieder von vorn (leer)
  function bumpMinBinUp() {
    const filters = [...document.querySelectorAll('.search-prices .price-filter, .price-filter')].filter((f) => shown(f));
    const f = filters[2];
    if (!f) return false;
    const input = f.querySelector('input');
    const up = f.querySelector('.increment-value, button[class*="increment"]');
    const cur = input ? toNum(input.value) || 0 : 0;
    if (cur >= Math.max(200, settings.bumpMinMax || 1000)) {
      const down = f.querySelector('.clear-value, button[class*="clear"]');
      if (down && visible(down)) { pressButton(down); return true; }
      return input ? setPriceInput(input, '') : false;
    }
    if (!up || !visible(up)) return false;
    pressButton(up);
    return true;
  }
  function bumpMinBin() {
    if (settings.bumpField === 'maxBid') return bumpMaxBid();
    if (settings.bumpField === 'minBinUp') return bumpMinBinUp();
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

  // SNIPE: EIN Tastendruck = neu suchen, günstigstes Angebot wählen, Sofortkauf drücken.
  // Stoppt immer beim Bestätigen-Dialog – den Kauf bestätigst DU (Taste „OK“ oder Klick).
  // Keine Schleife: nichts passiert ohne deinen nächsten Tastendruck.
  let snipeBusy = false;
  const waitFor = (fn, ms = 3000, step = 60) => new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => { let v = null; try { v = fn(); } catch (e) { /* */ } if (v || Date.now() - t0 > ms) resolve(v || null); else setTimeout(tick, step); };
    tick();
  });
  const noResults = () => [...document.querySelectorAll('.ut-no-results-view, .no-results, [class*="no-results"]')].some(shown);
  function marketOffers() {
    const out = [];
    for (const [, r] of marketRows) {
      if (!r.root.isConnected || !shown(r.root)) continue;
      const p = mapItem(r.raw);
      if (p && p.active && p.buyNow) out.push({ p, root: r.root });
    }
    return out;
  }
  async function doSnipe() {
    if (snipeBusy) return;
    if (findConfirmButton()) return showToast(`Kauf-Dialog ist offen – bestätigen mit ${keyLabel(settings.keys.confirm)} oder „Ok“`);
    snipeBusy = true;
    try {
      // 1) neu suchen (von der Ergebnisseite erst zurück)
      let s = findSearchButton();
      if (!s) {
        const back = findBackButton();
        if (!back) { showToast('Öffne zuerst die Transfermarkt-Suche', true); return; }
        pressButton(back);
        s = await waitFor(findSearchButton, 1500, 40);
        if (!s) { showToast('Suchen-Button nicht gefunden', true); return; }
      }
      for (const [tid, r] of marketRows) if (!r.root.isConnected) marketRows.delete(tid);
      const before = new Set(marketRows.keys());
      if (settings.bumpMinBin) bumpMinBin();
      pressButton(s);
      // 2) auf Ergebnisse warten
      const got = await waitFor(() => (noResults() ? 'none' : marketOffers().some((o) => !before.has(o.p.tradeId)) ? 'rows' : null), 4000, 50);
      if (got !== 'rows') { showToast(got === 'none' ? '🔍 Nichts gefunden – nochmal drücken' : 'Keine Ergebnisse erkannt – nochmal drücken', got !== 'none'); return; }
      await new Promise((r) => setTimeout(r, 120));   // Liste fertig aufbauen lassen
      const offers = marketOffers().sort((a, b) => a.p.buyNow - b.p.buyNow);
      const best = offers[0];
      if (!best) { showToast('🔍 Nichts gefunden – nochmal drücken'); return; }
      // 3) günstigstes Angebot auswählen
      pressButton(best.root.querySelector('.rowContent') || best.root);
      const buy = await waitFor(findBuyButton, 1500, 40);
      if (!buy) { showToast(`${best.p.name} ${fmt(best.p.buyNow)} gewählt – Sofortkauf-Button nicht gefunden`, true); return; }
      // 4) Sofortkauf drücken -> EA fragt nach. Hier ist Schluss: bestätigen musst du.
      pressButton(buy);
      const dlg = await waitFor(findConfirmButton, 1500, 40);
      showToast(dlg ? `💰 ${best.p.rating ?? ''} ${best.p.name} für ${fmt(best.p.buyNow)} – bestätigen mit ${keyLabel(settings.keys.confirm)} oder „Ok“` : `💰 ${best.p.name} für ${fmt(best.p.buyNow)} gewählt`);
    } catch (e) { log('Snipe', e); showToast('Snipe fehlgeschlagen: ' + e.message, true); } finally { snipeBusy = false; }
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
    const html = `<span>${kb('snipe')}Snipe</span><span>${kb('search')}Suchen</span><span>${kb('buy')}Kaufen</span><span>${kb('confirm')}OK</span><span>${kb('back')}Zurück</span><span>${kb('up')}${kb('down')}Preis ±</span>`;
    if (keyhint.__html !== html) { keyhint.__html = html; keyhint.innerHTML = html; }
  }, 700);

  document.addEventListener('keydown', (ev) => {
    if (!settings.hotkeys || ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat) return;
    const a = document.activeElement;
    if (a && (/^(input|textarea|select)$/i.test(a.tagName) || a.isContentEditable)) return;
    const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    const k = settings.keys;
    const map = { [k.snipe]: doSnipe, [k.search]: doSearch, [k.buy]: doBuy, [k.confirm]: doConfirm, [k.back]: doBack,
      [k.up]: () => stepPrice(1), [k.down]: () => stepPrice(-1) };
    const fn = map[key];
    if (!fn) return;
    ev.preventDefault(); ev.stopPropagation();
    fn();
  }, true);

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
      const SUBS = [['markt', '📈 Markt'], ['verein', '💼 Verein'], ['futter', '📊 Futter']];
      if (!SUBS.some((x) => x[0] === settings.tradeSub)) settings.tradeSub = 'markt';
      root.innerHTML = '<div class="fcpt-subtabs">' + SUBS.map(([k, l]) => `<button data-sub="${k}">${l}</button>`).join('') + '</div>' +
        '<div class="fcpt-subpane" data-pane="markt"><div data-el="timing"></div><div data-el="targets"></div><div data-el="prognose"></div>' + html() + '<div data-el="watch"></div></div>' +
        '<div class="fcpt-subpane" data-pane="verein"><div data-el="newitems"></div><div data-el="squadopt"></div>' + clubValueHtml() + '<div data-el="points"></div><div data-el="sell"></div><div data-el="sellalert"></div></div>' +
        '<div class="fcpt-subpane" data-pane="futter"><div data-el="ratings"></div></div>';
      const showSub = () => {
        root.querySelectorAll('[data-sub]').forEach((b) => b.classList.toggle('on', b.dataset.sub === settings.tradeSub));
        root.querySelectorAll('[data-pane]').forEach((d) => { d.style.display = d.dataset.pane === settings.tradeSub ? '' : 'none'; });
      };
      root.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); settings.tradeSub = b.dataset.sub; saveSettings(); showSub(); }));
      showSub();
      SELLALERT.mount(root.querySelector('[data-el="sellalert"]'));
      POINTS.mount(root.querySelector('[data-el="points"]'));
      NEWITEMS.mount(root.querySelector('[data-el="newitems"]'));
      SQUADOPT.mount(root.querySelector('[data-el="squadopt"]'));
      TARGETS.mount(root.querySelector('[data-el="targets"]'));
      PROGNOSE.mount(root.querySelector('[data-el="prognose"]'));
      const tim = root.querySelector('[data-el="timing"]');
      const drawTiming = () => { tim.innerHTML = TIMING.html(); };
      drawTiming(); setInterval(drawTiming, 5 * 60000);
      SELL.mount(root.querySelector('[data-el="sell"]'));
      RATINGS.mount(root.querySelector('[data-el="ratings"]'));
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


  // ==================================================================
  // WATCHLIST + PREIS-ALARM
  // Karten mit Wunsch-Kaufpreis merken. Alarm (Ton + Meldung), wenn
  //  a) eine passende Karte in deinen Transfermarkt-Suchergebnissen darunter auftaucht
  //  b) der Futbin-Preis auf/unter dein Ziel fällt (Prüfung alle 10 Min., schonend)
  // Kauft nichts – du entscheidest.
  // ==================================================================
  const WATCH = (() => {
    if (!Array.isArray(settings.watch)) settings.watch = [];
    if (settings.watchCheck === undefined) settings.watchCheck = true;
    if (settings.watchSound === undefined) settings.watchSound = true;
    if (settings.ntfyTopic === undefined) settings.ntfyTopic = '';

    // Push aufs Handy über ntfy.sh (kostenlose App „ntfy“, Thema abonnieren)
    function push(msg, title = 'FC27 Watchlist') {
      const topic = String(settings.ntfyTopic || '').trim();
      if (!topic) return Promise.resolve(false);
      return new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: 'POST', url: 'https://ntfy.sh/' + encodeURIComponent(topic), data: msg, timeout: 10000,
          headers: { Title: title, Tags: 'soccer,star', Priority: 'high' },
          onload: (r) => resolve(r.status >= 200 && r.status < 300), onerror: () => resolve(false), ontimeout: () => resolve(false),
        });
      });
    }
    const alerted = {};
    let box = null;

    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

    function add(r) {
      if (settings.watch.some((w) => w.path === r.path)) return false;
      settings.watch.push({ path: r.path, name: r.name, rating: r.rating, target: r.buy, sell: r.sell, last: r.current, lastAt: Date.now() });
      saveSettings(); render();
      showToast(`⭐ ${r.name} beobachtet – Alarm ab ${fmt(r.buy)}`);
      return true;
    }
    function remove(path) { settings.watch = settings.watch.filter((w) => w.path !== path); saveSettings(); render(); }
    const has = (path) => settings.watch.some((w) => w.path === path);

    function beep() {
      if (!settings.watchSound) return;
      try {
        const Ctx = W.AudioContext || W.webkitAudioContext;
        const ctx = new Ctx();
        [0, 0.18].forEach((t, i) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.frequency.value = i ? 1320 : 880; o.type = 'sine';
          g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
          g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.16);
          o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.17);
        });
        setTimeout(() => ctx.close(), 800);
      } catch (e) { /* kein Ton möglich */ }
    }
    function alarm(key, msg, minGapMs) {
      if (alerted[key] && Date.now() - alerted[key] < minGapMs) return;
      alerted[key] = Date.now();
      showToast('⭐ ' + msg);
      beep();
      try { if (W.Notification && W.Notification.permission === 'granted') new W.Notification('FC27 Watchlist', { body: msg }); } catch (e) { /* */ }
      push(msg);
    }

    // EA-Karte (aus mapItem) einer Watchlist-Karte zuordnen: gleiches Rating + Name passt
    function match(p) {
      if (!settings.watch.length || !p || !p.name) return null;
      const en = norm(p.name);
      const last = en.split(' ').pop();
      return settings.watch.find((w) => {
        if (w.rating != null && p.rating != null && w.rating !== p.rating) return false;
        const wn = norm(w.name);
        return wn === en || wn.includes(en) || (last.length > 2 && wn.split(' ').includes(last));
      }) || null;
    }

    // Aufruf aus der Listen-Anzeige für fremde Angebote (Transfermarkt/Transferziele)
    function marketChip(p, root) {
      const w = match(p);
      if (!w) return '';
      const nb = p.currentBid ? p.currentBid + (p.currentBid < 1000 ? 50 : p.currentBid < 10000 ? 100 : p.currentBid < 50000 ? 250 : p.currentBid < 100000 ? 500 : 1000) : p.startPrice;
      const binOk = p.buyNow && p.buyNow <= w.target;
      const bidOk = nb && nb <= w.target;
      if (binOk || bidOk) {
        root.classList.add('fcpt-watchhit');
        alarm(`m${p.tradeId}`, `${w.name}: ${binOk ? `Sofortkauf ${fmt(p.buyNow)}` : `Gebot ab ${fmt(nb)}`} – dein Ziel ${fmt(w.target)}`, 10 * 60000);
        return `<span class="fcpt-chip watch">⭐ Unter deinem Ziel (${fmt(w.target)})</span>`;
      }
      return `<span class="fcpt-chip">⭐ Watchlist · Ziel ${fmt(w.target)}</span>`;
    }

    // Futbin-Prüfung: pro Minute höchstens EINE Karte, jede alle 10 Min. -> schonend
    setInterval(async () => {
      if (!settings.watchCheck || !settings.watch.length || document.visibilityState !== 'visible' || futbinBlocked()) return;
      const due = settings.watch.filter((w) => Date.now() - (w.lastAt || 0) > 10 * 60000).sort((a, b) => (a.lastAt || 0) - (b.lastAt || 0))[0];
      if (!due) return;
      try {
        const d = await TRADE.analyse(due, 9 * 60000);
        if (!d) return;
        due.last = d.current; due.lastAt = Date.now(); due.sell = d.sell; saveSettings(); render();
        if (d.current <= due.target) alarm(`f${due.path}`, `${due.name} liegt bei ${fmt(d.current)} (Futbin) – dein Ziel ${fmt(due.target)}. Jetzt suchen!`, 60 * 60000);
      } catch (e) { log('Watch', e); due.lastAt = Date.now(); }
    }, 60000);

    function render() {
      if (!box) return;
      const L = settings.watch;
      box.innerHTML = `
        <div class="fcpt-sgroup"><h4>⭐ Watchlist & Preis-Alarm</h4>
          ${L.length ? L.map((w) => {
            const hit = w.last != null && w.last <= w.target;
            return `<div class="wl-row ${hit ? 'hit' : ''}">
              <div class="wl-name"><b>${esc(w.rating ?? '')} ${esc(w.name)}</b><small>Futbin: ${w.last != null ? fmt(w.last) : '–'} · ${w.lastAt ? agoText(w.lastAt) : ''}</small></div>
              <label class="wl-t">Ziel ≤<input type="number" step="50" min="0" data-wt="${esc(w.path)}" value="${w.target}"></label>
              <button class="wl-x" data-wx="${esc(w.path)}" title="Entfernen">✕</button></div>`;
          }).join('') : '<div class="note" style="font-size:12px;color:#7d8aa0">Noch leer. Im Trading-Finder bei einer Karte auf ☆ klicken – das Ziel wird auf „Kaufen bis“ gesetzt.</div>'}
          <div class="fcpt-set"><span>Futbin-Preis alle 10 Min. prüfen<small>Nur solange die Web App offen ist · 1 Abruf pro Minute</small></span><input type="checkbox" class="fcpt-sw" data-wo="watchCheck"></div>
          <div class="fcpt-set"><span>Ton bei Alarm</span><input type="checkbox" class="fcpt-sw" data-wo="watchSound"></div>
          <button class="fcpt-smallbtn" data-wa="notify">🔔 Browser-Benachrichtigungen erlauben</button>
          <div class="fcpt-set"><span>📱 Push aufs Handy (ntfy)<small>App „ntfy“ installieren und dieses Thema abonnieren</small></span></div>
          <div class="ntfy-row"><input type="text" data-wn="topic" placeholder="Thema, z. B. fc27-abc123" value="${esc(settings.ntfyTopic)}"><button class="fcpt-smallbtn" data-wa="gen">Erzeugen</button><button class="fcpt-smallbtn" data-wa="test">Test senden</button></div>
        </div>`;
      box.querySelectorAll('[data-wt]').forEach((i) => i.addEventListener('change', () => {
        const w = settings.watch.find((x) => x.path === i.dataset.wt);
        if (w) { w.target = Math.max(0, parseInt(i.value, 10) || 0); saveSettings(); }
      }));
      box.querySelectorAll('[data-wx]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); remove(b.dataset.wx); }));
      box.querySelectorAll('[data-wo]').forEach((c) => { c.checked = !!settings[c.dataset.wo]; c.addEventListener('change', () => { settings[c.dataset.wo] = c.checked; saveSettings(); }); });
      const tp = box.querySelector('[data-wn="topic"]');
      if (tp) tp.addEventListener('change', () => { settings.ntfyTopic = tp.value.trim().replace(/[^A-Za-z0-9_-]/g, ''); tp.value = settings.ntfyTopic; saveSettings(); });
      const gen = box.querySelector('[data-wa="gen"]');
      if (gen) gen.addEventListener('click', (e) => {
        e.stopPropagation();
        settings.ntfyTopic = 'fc27-' + Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
        saveSettings(); render();
      });
      const tb = box.querySelector('[data-wa="test"]');
      if (tb) tb.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!settings.ntfyTopic) { showToast('Erst ein Thema eintragen oder erzeugen', true); return; }
        const ok = await push('Test: Watchlist-Alarme kommen hier an ✅', 'FC27 Tool');
        showToast(ok ? '📱 Test gesendet – kam die Nachricht an?' : 'Senden fehlgeschlagen – Tampermonkey muss ntfy.sh erlauben', !ok);
      });
      const nb = box.querySelector('[data-wa="notify"]');
      if (nb) nb.addEventListener('click', (e) => {
        e.stopPropagation();
        try { W.Notification.requestPermission().then((r) => showToast(r === 'granted' ? '🔔 Benachrichtigungen erlaubt' : 'Benachrichtigungen nicht erlaubt')); } catch (err) { showToast('Dein Browser unterstützt das nicht', true); }
      });
    }
    function mount(el) { box = el; render(); }
    return { add, remove, has, match, marketChip, mount, render, alarm, push };
  })();


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


  // ---------- Verkaufs-Alarm ----------
  // Für eigene Karten ein Verkaufsziel setzen. Meldung (Ton, Toast, Handy-Push),
  // sobald der Futbin-Preis das Ziel erreicht. Stellt nichts selbst ein.
  const SELLALERT = (() => {
    if (!Array.isArray(settings.sellTargets)) settings.sellTargets = [];
    let box = null;
    const find = (iid) => settings.sellTargets.find((t) => String(t.itemId) === String(iid));
    const has = (iid) => iid != null && !!find(iid);
    const get = (iid) => find(iid) || null;
    function toggle(p, market) {
      if (p.itemId == null) return;
      if (has(p.itemId)) { remove(p.itemId); showToast(`🎯 Verkaufsziel für ${p.name} entfernt`); return; }
      const base = Math.max(market ? market * 1.05 : 0, p.bought ? breakEven(p.bought) * 1.05 : 0);
      if (!base) { showToast('Noch kein Preis bekannt – erst Preise laden', true); return; }
      const target = roundPrice(base);
      settings.sellTargets.push({ itemId: p.itemId, resourceId: p.resourceId, name: p.name, fullName: p.fullName, rating: p.rating,
        bought: p.bought || 0, target, last: market || null, lastAt: market ? Date.now() : 0 });
      saveSettings(); render();
      showToast(`🎯 Verkaufsziel ${fmt(target)} für ${p.name} – Alarm, sobald Futbin das erreicht (Ziel im Trading-Reiter › Verein änderbar)`);
    }
    function remove(iid) { settings.sellTargets = settings.sellTargets.filter((t) => String(t.itemId) !== String(iid)); saveSettings(); render(); }
    function sold(iid) { if (has(iid)) remove(iid); }

    setInterval(async () => {
      if (!settings.sellTargets.length || document.visibilityState !== 'visible' || futbinBlocked()) return;
      const due = settings.sellTargets.filter((t) => Date.now() - (t.lastAt || 0) > 10 * 60000).sort((a, b) => (a.lastAt || 0) - (b.lastAt || 0))[0];
      if (!due) return;
      due.lastAt = Date.now();
      try {
        const v = await getPrice('futbin', { resourceId: due.resourceId, name: due.name, fullName: due.fullName, rating: due.rating, isPlayer: true });
        if (v) {
          due.last = v; saveSettings(); render();
          if (v >= due.target) WATCH.alarm(`s${due.itemId}`, `${due.name} steht bei ${fmt(v)} (Futbin) – dein Verkaufsziel ${fmt(due.target)} ist erreicht. Jetzt einstellen!`, 60 * 60000);
        } else saveSettings();
      } catch (e) { log('SellAlert', e); saveSettings(); }
    }, 60000);

    function render() {
      if (!box) return;
      const L = settings.sellTargets;
      box.innerHTML = `
        <div class="fcpt-sgroup"><h4>🎯 Verkaufs-Alarm</h4>
          ${L.length ? L.map((t) => {
            const hit = t.last != null && t.last >= t.target;
            const prof = t.bought ? afterTax(t.target) - t.bought : null;
            return `<div class="wl-row ${hit ? 'hit' : ''}">
              <div class="wl-name"><b>${esc(t.rating ?? '')} ${esc(t.name)}</b><small>Futbin: ${t.last != null ? fmt(t.last) : '–'}${t.lastAt ? ' · ' + agoText(t.lastAt) : ''}${prof != null ? ` · Profit am Ziel ${signed(prof)}` : ''}</small></div>
              <label class="wl-t">Ziel ≥<input type="number" step="50" min="0" data-st="${esc(t.itemId)}" value="${t.target}"></label>
              <button class="wl-x" data-sx="${esc(t.itemId)}" title="Entfernen">✕</button></div>`;
          }).join('') : '<div class="note" style="font-size:12px;color:#7d8aa0">Noch leer. In der Transferliste (Panel) bei einer eigenen Karte auf „🎯 Verkaufsziel“ tippen.</div>'}
          <div class="note" style="font-size:11px;color:#7d8aa0">Prüft jede Karte alle 10 Min. bei Futbin, solange die Web App offen ist. Alarm per Ton, Meldung und – falls eingerichtet – Push aufs Handy (ntfy, siehe Markt › Watchlist).</div>
        </div>`;
      box.querySelectorAll('[data-st]').forEach((i) => i.addEventListener('change', () => {
        const t = find(i.dataset.st);
        if (t) { t.target = Math.max(0, parseInt(i.value, 10) || 0); saveSettings(); render(); }
      }));
      box.querySelectorAll('[data-sx]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); remove(b.dataset.sx); }));
    }
    function mount(el) { box = el; render(); }
    return { has, get, toggle, remove, sold, mount };
  })();

  // ---------- Preis-Einschätzung: steigt / fällt? ----------
  // Regeln aus Futbin-Verlauf (Trend, Lage in der Spanne, Kartenalter, Futter-Boden, Wochentag).
  // Keine Garantie – die Trefferquote der Regeln für genau diese Karte wird mit angezeigt.
  const PROGNOSE = (() => {
    let box = null, state = { q: '', list: null, pick: null, res: null, msg: '' };
    const DAY = 86400000;
    const slope = (a) => {   // Steigung von log(Preis) pro Tag
      const n = a.length; if (n < 2) return 0;
      const ys = a.map((v) => Math.log(Math.max(1, v)));
      const mx = (n - 1) / 2, my = ys.reduce((s, v) => s + v, 0) / n;
      let num = 0, den = 0;
      ys.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) * (i - mx); });
      return den ? num / den : 0;
    };
    const P = (x) => `${x > 0 ? '+' : ''}${Math.round(x * 100)} %`;

    // Bewertung nur aus Tageswerten (für den Rückblick-Test wiederverwendbar)
    function dailyScore(d) {
      const n = d.length, cur = d[n - 1];
      const out = { s: 0, why: [] };
      const add = (v, t) => { out.s += v; out.why.push({ v, t }); };
      if (n < 7) add(-2, `Neue Karte (erst ${n} Tage auf dem Markt) – neue Karten fallen meist in den ersten 1–2 Wochen`);
      else if (n < 14) add(-1, `Noch recht neue Karte (${n} Tage) – oft noch leicht fallend`);
      const w = d.slice(-7), sl = slope(w);
      const wk = Math.exp(sl * (w.length - 1)) - 1;
      if (sl > 0.02) add(1, `Trend 7 Tage steigend (${P(wk)})`);
      else if (sl < -0.02) add(-1, `Trend 7 Tage fallend (${P(wk)})`);
      else out.why.push({ v: 0, t: `Trend 7 Tage flach (${P(wk)})` });
      const r = d.slice(-30), lo = Math.min(...r), hi = Math.max(...r);
      if (hi > lo * 1.08 && n >= 10) {
        const pos = (cur - lo) / (hi - lo);
        if (pos <= 0.2) add(1, `Liegt nahe am ${r.length}-Tage-Tief (${fmt(lo)}) – Luft nach oben`);
        else if (pos >= 0.85) add(-1, `Liegt nahe am ${r.length}-Tage-Hoch (${fmt(hi)}) – Rücksetzer wahrscheinlich`);
      }
      if (n >= 3) {
        const d3 = cur / d[n - 3] - 1;
        if (d3 < -0.2) add(1, `In 2 Tagen um ${P(d3)} gefallen – nach starkem Absturz oft Gegenbewegung`);
        if (d3 > 0.25) add(-1, `In 2 Tagen um ${P(d3)} gestiegen – nach Sprüngen oft Gewinnmitnahmen`);
      }
      return out;
    }

    function forecast(daily, hourly, rating, floor, now = new Date()) {
      const d = daily.map((x) => x[1]).filter((v) => v > 0);
      const h = (hourly || []).map((x) => x[1]).filter((v) => v > 0);
      const cur = h.length ? h[h.length - 1] : d[d.length - 1];
      if (d.length) d[d.length - 1] = cur;
      const base = dailyScore(d);
      let s = base.s; const why = base.why.slice();
      const add = (v, t) => { s += v; why.push({ v, t }); };
      if (h.length >= 30) {
        const ch = cur / h[Math.max(0, h.length - 25)] - 1;
        if (ch > 0.05) add(0.5, `Letzte 24 Std. ${P(ch)} – Schwung nach oben`);
        else if (ch < -0.05) add(-0.5, `Letzte 24 Std. ${P(ch)} – Schwung nach unten`);
      }
      if (floor && rating >= 82) {
        if (cur <= floor * 1.15) add(1, `Kostet kaum mehr als die günstigste ${rating}er (${fmt(floor)}) – SBC-Futter, viel tiefer geht es kaum`);
        const dow = now.getDay(), hr = now.getHours();
        if ((dow === 3 && hr >= 19) || dow === 4 || (dow === 5 && hr < 19)) add(0.5, 'Vor neuen SBCs/Promo (Do/Fr) steigen Futter-Preise oft');
      }
      const dow = now.getDay(), hr = now.getHours();
      if (dow === 5 && hr >= 12 && hr < 19) add(-1, 'Freitag vor 19 Uhr: neue Promo-Karten drücken die Preise oft');
      else if ((dow === 4 || dow === 5) && hr >= 19 || dow === 6 || dow === 0) {
        if (!floor || rating < 82) add(0.5, 'Weekend League (Do–So): mehr Nachfrage nach guten Spielern');
      }
      // Rückblick: Wie oft lagen die Tagesregeln bei DIESER Karte richtig (3 Tage später)?
      let bt = null;
      if (d.length >= 20) {
        let ok = 0, tot = 0;
        for (let i = 14; i < d.length - 3; i++) {
          const sc = dailyScore(d.slice(0, i + 1)).s;
          if (Math.abs(sc) < 1) continue;
          const fut = d[i + 3] / d[i] - 1;
          if (Math.abs(fut) < 0.02) continue;
          tot++; if (Math.sign(fut) === Math.sign(sc)) ok++;
        }
        if (tot >= 5) bt = { ok, tot };
      }
      const rets = []; for (let i = Math.max(1, d.length - 14); i < d.length; i++) rets.push(d[i] / d[i - 1] - 1);
      const vol = rets.length ? Math.sqrt(rets.reduce((a, r) => a + r * r, 0) / rets.length) : 0;
      const verdict = s >= 1.5 ? 'up' : s <= -1.5 ? 'down' : 'flat';
      let conf = Math.abs(s) >= 3 ? 'mittel' : 'niedrig';
      if (bt && bt.ok / bt.tot >= 0.62 && Math.abs(s) >= 1.5) conf = Math.abs(s) >= 3 ? 'hoch' : 'mittel';
      if (bt && bt.ok / bt.tot < 0.5) conf = 'niedrig';
      const last3 = h.slice(-72);
      return { cur, s, verdict, conf, why, bt, vol, lo3: last3.length ? roundPrice(Math.min(...last3)) : null, hi3: last3.length ? roundPrice(Math.max(...last3)) : null, days: d.length };
    }

    async function search(q) {
      const html = await gmGet('https://www.futbin.com/players?search=' + encodeURIComponent(q), 'text');
      if (isCfPage(html)) throw new Error(CHECK_MSG);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const out = [];
      for (const tr of doc.querySelectorAll('tbody tr')) {
        const a = tr.querySelector('a[href*="/player/"]');
        if (!a) continue;
        const path = a.getAttribute('href').split('?')[0];
        if (!/^\/27\/player\//.test(path) || out.some((x) => x.path === path)) continue;
        const nameEl = tr.querySelector('.table-player-name, .player-name') || a;
        const name = (nameEl.textContent || '').replace(/\s+/g, ' ').trim();
        const rating = toNum((tr.querySelector('.table-rating, .rating') || {}).textContent) || toNum((tr.textContent.match(/\b([4-9]\d)\b/) || [])[1]);
        const ver = ((tr.querySelector('.table-player-revision, .player-revision, .revision') || {}).textContent || '').replace(/\s+/g, ' ').trim();
        const plat = settings.platform === 'pc' ? 'pc' : 'ps';
        const pt = String((tr.querySelector(`.platform-${plat}-only`) || {}).textContent || '').replace(/\s/g, '');
        const pm = pt.match(/([\d.,]+)([KkMm])?/);
        const price = pm ? Math.round(parseFloat(pm[2] ? pm[1].replace(',', '.') : pm[1].replace(/[.,]/g, '')) * (pm[2] ? (/k/i.test(pm[2]) ? 1000 : 1e6) : 1)) : null;
        out.push({ path, name: name || path.split('/').pop(), rating, ver, price });
        if (out.length >= 10) break;
      }
      return out;
    }

    async function market(path) {
      const html = await gmGet(`https://www.futbin.com${path}/market`, 'text');
      if (isCfPage(html)) throw new Error(CHECK_MSG);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const plat = settings.platform === 'pc' ? 'pc' : 'ps';
      const series = [...doc.querySelectorAll(`[data-${plat}-data]`)].map((e) => {
        try { return JSON.parse(e.getAttribute(`data-${plat}-data`)); } catch (err) { return []; }
      }).filter((a) => Array.isArray(a) && a.length > 1);
      const hourly = series.filter((a) => a[1][0] - a[0][0] <= 3600000 * 1.5).sort((a, b) => b.length - a.length)[0] || [];
      const daily = series.find((a) => a[1][0] - a[0][0] >= 3600000 * 20) || [];
      if (!daily.length && !hourly.length) throw new Error('Kein Preisverlauf bei Futbin gefunden');
      return { daily, hourly };
    }

    async function pick(c) {
      state.pick = c; state.res = null; state.msg = `Lade Preisverlauf von ${c.name} …`; render();
      try {
        const m = await market(c.path);
        let floor = null;
        try { const rp = RATINGS.get() || (c.rating >= 82 ? await RATINGS.load() : null); floor = rp && rp.prices[c.rating]; } catch (e) { /* ohne Futter-Boden */ }
        const daily = m.daily.length ? m.daily : [];
        state.res = forecast(daily.length ? daily : m.hourly.filter((x, i) => i % 24 === 0), m.hourly, c.rating, floor);
        state.msg = '';
      } catch (e) { state.msg = 'Fehler: ' + e.message; }
      render();
    }

    async function doSearch() {
      const q = state.q.trim();
      if (q.length < 3) { state.msg = 'Mindestens 3 Buchstaben eingeben'; render(); return; }
      state.list = null; state.pick = null; state.res = null; state.msg = 'Suche bei Futbin …'; render();
      try {
        state.list = await search(q);
        state.msg = state.list.length ? '' : 'Nichts gefunden – Schreibweise prüfen (z. B. „Mbappe“)';
        if (state.list.length === 1) { render(); return pick(state.list[0]); }
      } catch (e) { state.msg = 'Fehler: ' + e.message; }
      render();
    }

    function resHtml() {
      const r = state.res, c = state.pick;
      if (!r || !c) return '';
      const V = { up: ['up', '📈 Wird eher steigen'], down: ['down', '📉 Wird eher fallen'], flat: ['flat', '➡️ Eher seitwärts'] }[r.verdict];
      const tip = r.verdict === 'up' ? `Kaufen lohnt eher jetzt${r.lo3 ? ` (Tief der letzten 3 Tage: ${fmt(r.lo3)})` : ''}. Besitzt du sie: noch halten.`
        : r.verdict === 'down' ? `Nicht kaufen – abwarten. Besitzt du sie: eher bald verkaufen${r.hi3 ? ` (Hoch der letzten 3 Tage: ${fmt(r.hi3)})` : ''}.`
          : `Kein klarer Trend. Nur mit Spanne handeln: unter ${r.lo3 ? fmt(r.lo3) : '–'} kaufen, bei ${r.hi3 ? fmt(r.hi3) : '–'} verkaufen.`;
      return `<div class="pg-res ${V[0]}">
          <div class="pg-h"><b>${esc(c.rating ?? '')} ${esc(c.name)}</b>${c.ver ? ` <small>${esc(c.ver)}</small>` : ''}<span>jetzt ${fmt(r.cur)}</span></div>
          <div class="pg-v">${V[1]}</div>
          <div class="pg-c">Sicherheit: <b>${r.conf}</b> · Zeitraum: nächste 1–3 Tage${r.bt ? ` · Diese Regeln lagen bei der Karte ${r.bt.ok} von ${r.bt.tot} Mal richtig` : ''}</div>
          <ul class="pg-w">${r.why.map((w) => `<li class="${w.v > 0 ? 'p' : w.v < 0 ? 'n' : ''}">${w.v > 0 ? '▲' : w.v < 0 ? '▼' : '•'} ${esc(w.t)}</li>`).join('')}</ul>
          <div class="pg-tip">💡 ${esc(tip)}</div>
          <div class="btns"><button class="fcpt-smallbtn" data-pg="watch">${WATCH.has(c.path) ? '⭐ Auf der Watchlist' : '☆ Auf Watchlist (Alarm)'}</button></div>
          <div class="note" style="font-size:11px;color:#7d8aa0">Schätzung aus dem Futbin-Verlauf – keine Garantie. Promos, neue SBCs oder Content können alles schnell drehen.</div>
        </div>`;
    }

    function render() {
      if (!box) return;
      const L = state.list;
      box.innerHTML = `
        <div class="fcpt-sgroup"><h4>🔮 Preis-Einschätzung</h4>
          <div class="note" style="font-size:12px;color:#a7b3c6">Spielername eingeben – das Tool sagt, ob der Preis eher steigt oder fällt, und warum.</div>
          <div class="ntfy-row"><input type="text" data-pg="q" placeholder="z. B. Wirtz" value="${esc(state.q)}"><button class="fcpt-smallbtn" data-pg="go">🔮 Einschätzen</button></div>
          ${state.msg ? `<div class="fcpt-stand">${esc(state.msg)}</div>` : ''}
          ${L && L.length > 1 && !state.res ? `<div class="pg-list">${L.map((c, i) => `<button class="pg-item${state.pick === c ? ' on' : ''}" data-pi="${i}"><b>${esc(c.rating ?? '')}</b> ${esc(c.name)}${c.ver ? ` <small>${esc(c.ver)}</small>` : ''}${c.price ? `<span>${fmt(c.price)}</span>` : ''}</button>`).join('')}</div>` : ''}
          ${resHtml()}
          ${state.res && L && L.length > 1 ? '<button class="fcpt-smallbtn" data-pg="back">← andere Version wählen</button>' : ''}
        </div>`;
      const q = box.querySelector('[data-pg="q"]');
      q.addEventListener('input', () => { state.q = q.value; });
      q.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') doSearch(); });
      box.querySelector('[data-pg="go"]').addEventListener('click', (e) => { e.stopPropagation(); doSearch(); });
      box.querySelectorAll('[data-pi]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); pick(state.list[+b.dataset.pi]); }));
      const bk = box.querySelector('[data-pg="back"]');
      if (bk) bk.addEventListener('click', (e) => { e.stopPropagation(); state.res = null; state.pick = null; render(); });
      const wb = box.querySelector('[data-pg="watch"]');
      if (wb) wb.addEventListener('click', (e) => {
        e.stopPropagation();
        const c = state.pick, r = state.res;
        if (WATCH.has(c.path)) return;
        WATCH.add({ path: c.path, name: c.name, rating: c.rating, buy: roundPrice(r.lo3 || r.cur * 0.95), sell: r.hi3 || r.cur, current: r.cur });
        render();
      });
    }
    function mount(el) { box = el; render(); }
    return { mount, forecast };
  })();

  // ==================================================================
  // PUNKTE-SBC („Streamlined SBC“, Diamanten / Item Score) – FC 27
  // Keine Chemie/Positionen: Karten abgeben, bis die Punktzahl erreicht ist.
  // Rechner: günstigste Auswahl aus deinem Verein + optional Futter kaufen.
  // Punkte je Rating laut Community-Messungen (EA veröffentlicht keine Tabelle).
  // ==================================================================
  const POINTS = (() => {
    const TABLE = { 99: 100000, 98: 90000, 97: 85000, 96: 55000, 95: 40000, 94: 30000, 93: 25000, 92: 20000, 91: 19000, 90: 14000,
      89: 11000, 88: 8300, 87: 5500, 86: 4100, 85: 2100, 84: 830, 83: 410, 82: 340, 81: 280, 80: 180, 79: 160, 78: 140, 77: 120, 76: 100, 75: 90 };
    const base = (r) => (r == null ? 0 : r >= 75 ? (TABLE[Math.min(99, r)] || 0) : r >= 65 ? 35 : 20);
    if (settings.ptsTarget === undefined) settings.ptsTarget = 10000;
    if (settings.ptsMinOvr === undefined) settings.ptsMinOvr = 0;
    if (settings.ptsBuy === undefined) settings.ptsBuy = true;

    // Punkte einer Karte: falls EA den Wert mitliefert, den nehmen, sonst Tabelle
    function scoreOf(p) {
      const raw = (SBCUI.CAP && SBCUI.CAP.raw && SBCUI.CAP.raw.get(p.id)) || {};
      // EA liefert den Diamanten-Wert als „gradingScore“ (per Diagnose bestätigt: 88 = 8.300, 84 = 830 …)
      if (typeof raw.gradingScore === 'number' && raw.gradingScore > 0) return { v: raw.gradingScore, live: true };
      return { v: base(p.rating), live: false };
    }

    // Ziel aus der geöffneten Aufgabe erkennen (Anforderung mit „SCORE“ im Namen)
    function detectTarget() {
      try {
        // FC 27: die Aufgabe selbst hat „scoreRequirement“ und „submittedScore“ (bereits abgegeben)
        const ctx = SBCUI.findSbcContext();
        const c = ctx && ctx.challenge;
        const req = c && Number(c.scoreRequirement);
        if (req > 0) {
          let done = Number(c.submittedScore) || 0;
          // Wiederholbare SBC schon abgeschlossen -> die nächste Runde beginnt wieder bei 0
          if (c.repeatable && (String(c.status).toUpperCase() === 'COMPLETED' || done >= req)) done = 0;
          return Object.assign({ v: Math.max(1, req - done), total: req, done, name: c.name || 'SBC', oneClick: c.type === 'ONE_CLICK_CHALLENGE', id: c.id }, ovrBounds(c.id));
        }
        const id = SBCUI.CAP.currentId;
        const ch = id != null ? SBCUI.CAP.challenges.get(id) : null;
        if (ch && Number(ch.scoreRequirement) > 0) return { v: Math.max(1, ch.scoreRequirement - (Number(ch.submittedScore) || 0)), total: ch.scoreRequirement, done: Number(ch.submittedScore) || 0, name: ch.name };
        if (!ch || !Array.isArray(ch.elgReq)) return null;
        const e = ch.elgReq.find((x) => /SCORE|POINT|GEM/i.test(String(x.type || '')));
        return e && e.eligibilityValue > 0 ? { v: e.eligibilityValue, name: ch.name } : null;
      } catch (e) { return null; }
    }

    // OVR-Grenzen der Aufgabe (Eintrag „ACADEMY_PLAYER_SLOTTING“ mit SCOPE: 0 = mind., 1 = max., 2 = genau)
    // z. B. „Bronze- und Silber-Neu-Ziehung“: max. 74
    function ovrBounds(id) {
      const ch = SBCUI.CAP.challenges.get(id);
      const L = (ch && ch.elgReq) || [];
      const e = L.find((x) => x.type === 'ACADEMY_PLAYER_SLOTTING' || x.eligibilityKey === 40);
      if (!e) return {};
      const sc = L.find((x) => x.eligibilitySlot === e.eligibilitySlot && (x.type === 'SCOPE' || x.eligibilityKey === 13));
      const scope = sc ? sc.eligibilityValue : 0;
      const v = e.eligibilityValue;
      if (scope === 1) return { maxOvr: v };
      if (scope === 2) return { minOvr: v, maxOvr: v };
      return v > 45 ? { minOvr: v } : {};
    }

    // Günstigste Auswahl: 0/1-Rucksack über den Verein + beliebig viele Kauf-Karten je Rating
    function solve(club, buys, target, U = 5) {
      const cap = Math.max(1, Math.ceil(target / U));
      const INF = 1e15;
      const dp = new Float64Array(cap + 1).fill(INF); dp[0] = 0;
      const words = Math.ceil((cap + 1) / 32);
      const take = [], capFrom = new Int32Array(club.length).fill(-1), W = [];
      club.forEach((it, i) => {
        const w = Math.max(1, Math.floor(it.score / U)); W.push(w);
        const bits = new Uint32Array(words);
        for (let s = cap - 1; s >= 0; s--) {
          if (dp[s] >= INF) continue;
          const ns = Math.min(cap, s + w), v = dp[s] + it.cost;
          if (v < dp[ns]) { dp[ns] = v; bits[ns >> 5] |= 1 << (ns & 31); if (ns === cap) capFrom[i] = s; }
        }
        take.push(bits);
      });
      const bPrev = new Int32Array(cap + 1).fill(-1), bItem = new Int16Array(cap + 1).fill(-1);
      const bw = buys.map((b) => Math.max(1, Math.floor(b.score / U)));
      for (let s = 0; s < cap; s++) {
        if (dp[s] >= INF) continue;
        buys.forEach((b, j) => {
          const ns = Math.min(cap, s + bw[j]), v = dp[s] + b.price;
          if (v < dp[ns]) { dp[ns] = v; bPrev[ns] = s; bItem[ns] = j; }
        });
      }
      if (dp[cap] >= INF) return null;
      let s = cap;
      const bought = [];
      while (bItem[s] >= 0) { bought.push(buys[bItem[s]]); s = bPrev[s]; }
      const used = [];
      for (let i = club.length - 1; i >= 0 && s > 0; i--) {
        if (take[i][s >> 5] & (1 << (s & 31))) { used.push(club[i]); s = s === cap ? capFrom[i] : s - W[i]; }
      }
      return { cost: dp[cap], used, bought };
    }

    let box = null, state = { msg: '', res: null, busy: false };
    async function run() {
      if (state.busy) return;
      const target = Math.max(1, parseInt(settings.ptsTarget, 10) || 0);
      state.busy = true; state.res = null; state.msg = 'Lade Verein …'; render();
      try {
        const c = await SBCUI.loadClub((m) => { state.msg = m; render(); }, !!state.reload);
        state.reload = false; state.club = c;
        let act = new Set();
        if (settings.sbcProtectActive !== false) { state.msg = 'Lese aktive Mannschaft …'; render(); act = await SBCUI.activeSquadIds(); }
        const locked = new Set((settings.sbcLocked || []).map((x) => x.id));
        const d = detectTarget() || {};
        const minO = Math.max(settings.ptsMinOvr || 0, d.minOvr || 0);
        const maxO = d.maxOvr || 99;
        let pool = c.players.filter((p) => !(p.loans > 0) && !locked.has(p.id) && !act.has(p.id) && (settings.sbcSpecials || !p.special) && (p.rating || 0) >= minO && (p.rating || 0) <= maxO)
          .map((p) => { const sc = scoreOf(p); return { p, score: sc.v, live: sc.live, cost: Math.max(1, p.cost) }; })
          .filter((x) => x.score > 0);
        // große Vereine: nur die günstigsten pro Punkt behalten (Rechner bleibt schnell)
        pool.sort((a, b) => a.cost / a.score - b.cost / b.score);
        if (pool.length > 1200) pool = pool.slice(0, 1200);
        let buys = [];
        if (settings.ptsBuy) {
          let rp = RATINGS.get();
          if (!rp) { state.msg = 'Lade Rating-Preise von Futbin …'; render(); try { rp = await RATINGS.load(); } catch (e) { rp = null; } }
          if (rp) buys = Object.keys(rp.prices).map(Number).filter((r) => r >= minO && r <= maxO && base(r) > 0).map((r) => ({ rating: r, price: rp.prices[r], score: base(r) }));
        }
        state.msg = `Rechne mit ${pool.length} Karten${buys.length ? ` + Kauf-Futter (${buys.length} Ratings)` : ''} …`; render();
        await sleep(30);
        const res = solve(pool, buys, target);
        const onlyBuy = buys.length ? solve([], buys, target) : null;
        if (!res) { state.msg = 'Ziel nicht erreichbar – Futter kaufen einschalten oder Min. OVR senken.'; }
        else {
          const pts = res.used.reduce((a, x) => a + x.score, 0) + res.bought.reduce((a, b) => a + b.score, 0);
          const own = res.used.reduce((a, x) => a + x.p.value, 0);
          const buy = res.bought.reduce((a, b) => a + b.price, 0);
          state.res = { target, pts, own, buy, challengeId: d.id, oneClick: !!d.oneClick, ownPts: res.used.reduce((a, x) => a + x.score, 0), bounds: d.maxOvr || d.minOvr ? `${d.minOvr ? `mind. ${d.minOvr}` : ''}${d.minOvr && d.maxOvr ? ', ' : ''}${d.maxOvr ? `max. ${d.maxOvr}` : ''} OVR` : '', used: res.used.sort((a, b) => b.score - a.score), bought: res.bought, onlyBuy: onlyBuy ? onlyBuy.cost : null, live: pool.some((x) => x.live) };
          state.msg = '';
        }
      } catch (e) { state.msg = 'Fehler: ' + e.message; } finally { state.busy = false; render(); }
    }

    function resHtml() {
      const r = state.res;
      if (!r) return '';
      const grp = {};
      r.bought.forEach((b) => { const g = grp[b.rating] || (grp[b.rating] = { n: 0, price: b.price, score: b.score }); g.n++; });
      const buyRows = Object.keys(grp).map(Number).sort((a, b) => b - a).map((k) => `<div class="pt-r"><span>${grp[k].n}× ${k}er kaufen</span><span>je ≈ ${fmt(grp[k].price)} · ${fmt(grp[k].score)} 💎</span></div>`).join('');
      const own = r.used.map((x) => `<div class="pt-r"><span><b>${esc(x.p.rating)}</b> ${esc(x.p.name)}${x.p.untradeable ? ' <em>NH</em>' : ''}${x.p.dup ? ' <em>Dup</em>' : ''}</span><span>${fmt(x.score)} 💎 · ${fmt(Math.round(x.p.value))}</span></div>`).join('');
      const save = r.onlyBuy != null ? r.onlyBuy - (r.own + r.buy) : null;
      return `<div class="pt-res">
        <div class="pt-sum"><div><span>Punkte</span><b>${fmt(r.pts)} / ${fmt(r.target)}</b></div><div><span>Eigene Karten</span><b>${fmt(Math.round(r.own))}</b></div><div><span>Kaufen</span><b>${fmt(Math.round(r.buy))}</b></div></div>
        ${save != null && save > 0 ? `<div class="pt-note">Komplett mit Kauf-Futter ≈ <b>${fmt(Math.round(r.onlyBuy))}</b> – mit deinem Verein sparst du ≈ <b class="fcpt-pos-v">${fmt(Math.round(save))}</b>.</div>` : ''}
        ${buyRows ? `<div class="pt-h">🛒 Futter kaufen</div>${buyRows}` : ''}
        ${own ? `<div class="pt-h">Aus deinem Verein (${r.used.length})</div><div class="pt-list">${own}</div>` : ''}
        ${r.bounds ? `<div class="pt-note">Vorgabe der Aufgabe beachtet: ${esc(r.bounds)}</div>` : ''}
        <div class="pt-note">${r.live ? 'Punkte direkt von EA gelesen.' : 'Punkte laut Community-Tabelle.'} Teilabgaben sind erlaubt.</div>
        ${submitHtml(r)}
      </div>`;
    }

    // ---------- Abgeben (nur auf deinen Klick + Bestätigung) ----------
    function submitHtml(r) {
      if (!r.oneClick || !r.used.length) return r.used.length ? '<div class="pt-note">Karten in der SBC selbst auswählen und abgeben.</div>' : '';
      const cur = detectTarget();
      if (!cur || cur.id !== r.challengeId) return '<div class="pt-note">Öffne die passende SBC, um direkt abzugeben.</div>';
      if (state.confirm) {
        return `<div class="pt-confirm"><b>${r.used.length} Karte(n) mit ${fmt(r.ownPts)} 💎 abgeben?</b>
          <span>Wert zusammen ≈ ${fmt(Math.round(r.own))} Münzen${r.used.some((x) => !x.p.untradeable) ? ' · enthält handelbare Karten' : ''}. Die Karten sind danach weg – das lässt sich nicht rückgängig machen.</span>
          <div class="btns2"><button class="fcpt-smallbtn go" data-pt="yes">Ja, abgeben</button><button class="fcpt-smallbtn" data-pt="no">Abbrechen</button></div></div>`;
      }
      return `<button class="fcpt-bigbtn" data-pt="submit" ${state.busy ? 'disabled' : ''}>💎 Diese ${r.used.length} Karte(n) abgeben (${fmt(r.ownPts)} Punkte)</button>
        ${r.bought.length ? '<div class="pt-note">Die Kauf-Karten fehlen noch – erst kaufen, dann neu berechnen. Du kannst die eigenen Karten aber schon jetzt abgeben (Teilabgabe).</div>' : ''}`;
    }
    const obs = (o, ms = 15000) => new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Zeitüberschreitung')), ms);
      o.observe(box, (ob, ev) => { clearTimeout(t); try { ob.unobserve(box); } catch (e) { /* */ } resolve(ev); });
    });
    function findSet(setId) {
      try {
        const sets = W.services.SBC.repository.sets;
        const vals = sets instanceof Map ? [...sets.values()] : Array.isArray(sets) ? sets : Object.values(sets || {});
        return vals.find((x) => x && x.id === setId) || null;
      } catch (e) { return null; }
    }
    async function submit() {
      const r = state.res;
      const ctx = SBCUI.findSbcContext();
      const ch = ctx && ctx.challenge;
      const S = W.services && W.services.SBC;
      if (!ch || ch.id !== r.challengeId || !S || typeof S.submitOneClickChallenge !== 'function') { state.msg = 'SBC nicht gefunden – Aufgabe neu öffnen.'; render(); return; }
      const ents = r.used.map((x) => state.club && state.club.ents.get(x.p.id)).filter(Boolean);
      if (ents.length !== r.used.length) { state.msg = 'Karten nicht mehr gefunden – bitte neu berechnen.'; render(); return; }
      state.busy = true; state.msg = 'Gebe ab …'; render();
      try {
        if (typeof ch.hasNotStarted === 'function' && ch.hasNotStarted() && typeof S.initiateOneClickChallenge === 'function') {
          const e0 = await obs(S.initiateOneClickChallenge(ch));
          if (e0 && e0.success === false) throw new Error(`EA hat den Start abgelehnt (${e0.status || '?'})`);
        }
        const set = findSet(ch.setId) || { id: ch.setId, totalSubmittedScore: 0 };
        let ev;
        try { ev = await obs(S.submitOneClickChallenge(ch, set, ents)); } catch (e) { ev = { success: false, error: e }; }
        // Falls EA IDs statt Karten erwartet: einmal mit IDs versuchen (nur wenn der erste Versuch abgelehnt wurde)
        if (ev && ev.success === false && ev.status !== 409 && ev.status >= 400 && ev.status < 500) {
          ev = await obs(S.submitOneClickChallenge(ch, set, ents.map((x) => x.id)));
        }
        if (ev && ev.success !== false) {
          const d = ev.data || {};
          showToast(d.challengeCompleted ? '💎 SBC abgeschlossen!' : `💎 Abgegeben – jetzt ${fmt(d.submittedScore ?? ch.submittedScore)} Punkte`);
          state.msg = d.challengeCompleted ? (ch.repeatable ? '✓ Runde abgeschlossen – Belohnung einsammeln. Für die nächste Runde einfach neu berechnen.' : '✓ SBC abgeschlossen – Belohnung einsammeln.') : `✓ Abgegeben. Stand: ${fmt(d.submittedScore ?? ch.submittedScore)} von ${fmt(ch.scoreRequirement)}.`;
          state.res = null; state.reload = true;
        } else if (ev && ev.status === 409) {
          state.msg = 'Einige Karten stecken noch in anderen SBC-Aufstellungen – dort entfernen oder sperren und neu berechnen.';
        } else {
          state.msg = `EA hat die Abgabe abgelehnt (${(ev && ev.status) || '?'}). Bitte „Diagnose kopieren“ schicken.`;
          log('Abgabe', ev);
        }
      } catch (e) { state.msg = 'Fehler: ' + e.message; } finally { state.busy = false; state.confirm = false; render(); }
    }

    function render() {
      if (!box) return;
      const d = detectTarget();
      if (d && d.id != null && state.autoFor !== `${d.id}:${d.v}`) { state.autoFor = `${d.id}:${d.v}`; settings.ptsTarget = d.v; saveSettings(); }
      const collapsed = !!box.closest('#fcpt-sbc') && !d && !state.res && !state.busy && !state.msg;
      box.innerHTML = `<details class="fcpt-sgroup pt-det" ${collapsed ? '' : 'open'}><summary><h4 style="display:inline">💎 Punkte-SBC (Diamanten)</h4></summary>
        <div class="note" style="font-size:12px;color:var(--ink2)">Neue FC-27-SBCs ohne Chemie: Karten abgeben, bis die Diamanten-Punkte erreicht sind. Das Tool sucht die günstigste Kombination aus deinem Verein – und rechnet Kauf-Futter mit ein.</div>
        <div class="fcpt-set"><span>Ziel-Punkte${d ? `<small>Aus „${esc(d.name)}“ erkannt: ${d.total ? `noch ${fmt(d.v)} von ${fmt(d.total)}` : fmt(d.v)}</small>` : '<small>Die Zahl neben dem Diamanten in der SBC</small>'}</span><input type="number" min="1" step="100" data-pt="target" value="${settings.ptsTarget}"></div>
        <div class="fcpt-set"><span>Min. OVR pro Karte<small>0 = keine Vorgabe</small></span><input type="number" min="0" max="99" data-pt="min" value="${settings.ptsMinOvr}"></div>
        <div class="fcpt-set"><span>Futter kaufen einrechnen<small>Günstigste Karte je Rating laut Futbin</small></span><input type="checkbox" class="fcpt-sw" data-pt="buy" ${settings.ptsBuy ? 'checked' : ''}></div>
        ${d && d.v !== settings.ptsTarget ? `<button class="fcpt-smallbtn" data-pt="use">Erkanntes Ziel ${fmt(d.v)} übernehmen</button>` : ''}
        <button class="fcpt-bigbtn" data-pt="run" ${state.busy ? 'disabled' : ''}>💎 Günstigste Auswahl berechnen</button>
        ${state.msg ? `<div class="fcpt-stand">${esc(state.msg)}</div>` : ''}
        ${resHtml()}
        ${cheapHtml()}
      </details>`;
      const on = (sel, ev, fn) => { const x = box.querySelector(sel); if (x) x.addEventListener(ev, (e) => { e.stopPropagation(); fn(x); }); };
      on('[data-pt="target"]', 'change', (x) => { settings.ptsTarget = Math.max(1, parseInt(x.value, 10) || 1); saveSettings(); });
      on('[data-pt="min"]', 'change', (x) => { settings.ptsMinOvr = Math.max(0, Math.min(99, parseInt(x.value, 10) || 0)); saveSettings(); });
      on('[data-pt="buy"]', 'change', (x) => { settings.ptsBuy = x.checked; saveSettings(); });
      on('[data-pt="use"]', 'click', () => { settings.ptsTarget = d.v; saveSettings(); render(); });
      on('[data-pt="run"]', 'click', () => { state.confirm = false; run(); });
      on('[data-pt="submit"]', 'click', () => { state.confirm = true; render(); });
      on('[data-pt="no"]', 'click', () => { state.confirm = false; render(); });
      on('[data-pt="yes"]', 'click', () => submit());
    }

    // Welches Rating ist gerade das günstigste Futter pro Punkt?
    function cheapHtml() {
      const rp = typeof RATINGS !== 'undefined' ? RATINGS.get() : null;
      if (!rp) return '<div class="pt-note">Tipp: Unter Verein › Rating-Preise laden, dann siehst du hier das günstigste Futter pro Punkt.</div>';
      const L = Object.keys(rp.prices).map(Number).filter((r) => base(r) > 0).map((r) => ({ r, per: rp.prices[r] / base(r) * 1000 })).sort((a, b) => a.per - b.per).slice(0, 4);
      if (!L.length) return '';
      return `<div class="pt-h">Günstigstes Futter pro 1.000 💎</div>${L.map((x, i) => `<div class="pt-r"><span>${i === 0 ? '⭐ ' : ''}${x.r}er</span><span>≈ ${fmt(Math.round(x.per))} Münzen</span></div>`).join('')}`;
    }

    function mount(el) { box = el; render(); }
    return { mount, solve, base, render };
  })();

  // ==================================================================
  // „NEUE ITEMS“-SORTIERER
  // Nach dem Pack-Öffnen: jede Karte bewerten und auf Klick verteilen
  // (Transferliste, SBC-Lager, Verein, Schnellverkauf). Nichts passiert ohne Bestätigung.
  // ==================================================================
  const NEWITEMS = (() => {
    if (settings.niSellMin === undefined) settings.niSellMin = 1000;   // ab diesem Wert: verkaufen
    let box = null;
    const st = { items: null, msg: '', busy: false, confirm: false, count: null, choice: {} };
    const ACT = { tl: 'Transferliste', store: 'SBC-Lager', club: 'Verein', qs: 'Schnellverkauf', keep: 'Liegen lassen' };

    const obs = (o, ms = 12000) => new Promise((resolve, reject) => {
      if (!o || typeof o.observe !== 'function') return reject(new Error('Keine EA-Antwort'));
      const sub = {};
      const t = setTimeout(() => reject(new Error('Zeitüberschreitung bei EA')), ms);
      o.observe(sub, (ob, ev) => { clearTimeout(t); try { ob.unobserve(sub); } catch (e) { /* */ } resolve(ev || {}); });
    });
    // EAs Stapel-Konstanten (z. B. ItemPile.TRANSFER) – je nach Version verschieden benannt
    function pile(kind) {
      const P = W.ItemPile || {};
      const keys = Object.keys(P);
      const find = (re) => { const k = keys.find((x) => re.test(x)); return k != null ? P[k] : null; };
      if (kind === 'tl') return find(/^TRANSFER$/) ?? find(/TRANSFER/);
      if (kind === 'club') return find(/^CLUB$/) ?? find(/CLUB/);
      if (kind === 'store') return find(/STORAGE/) ?? find(/SBC/);
      return null;
    }
    const canQS = () => !!(W.services && W.services.Item && typeof W.services.Item.discard === 'function');

    function info(ent) {
      const raw = (SBCUI.CAP.raw.get(ent.id)) || {};
      const isPl = typeof ent.isPlayer === 'function' ? ent.isPlayer() : ent.type === 'player';
      let sd = {};
      try { sd = typeof ent.getStaticData === 'function' ? ent.getStaticData() || {} : {}; } catch (e) { /* */ }
      const name = sd.name || [sd.firstName, sd.lastName].filter(Boolean).join(' ') || (isPl ? `#${ent.definitionId}` : 'Gegenstand');
      const rating = ent.rating ?? raw.rating ?? null;
      const untr = !!(ent.untradeable ?? raw.untradeable ?? (ent.tradable === false));
      let dup = false;
      try { dup = (typeof ent.isDuplicate === 'function' && ent.isDuplicate()) || !!(ent.duplicateId && ent.duplicateId > 0); } catch (e) { /* */ }
      const rid = ent.resourceId ?? ent.definitionId;
      const fb = isPl && rid != null ? cacheGet(`futbin:${settings.platform}:${rid}`) : null;
      const value = fb || raw.marketAverage || ent._marketAverage || null;
      const qs = raw.discardValue ?? ent.discardValue ?? 0;
      const pts = raw.gradingScore || null;
      return { ent, id: ent.id, isPl, name, rating, untr, dup, value, src: fb ? 'Futbin' : value ? 'EA' : '', qs, pts };
    }

    // Vorschlag: teure handelbare Karten verkaufen, Duplikate ins SBC-Lager, sonst Verein
    function suggest(x) {
      if (!x.isPl) return 'club';
      if (!x.untr && x.value && x.value >= settings.niSellMin) return 'tl';
      if (!x.untr && x.value && afterTax(x.value) < x.qs) return 'qs';
      if (x.dup) return pile('store') != null ? 'store' : (x.untr ? 'qs' : 'tl');
      return 'club';
    }

    async function load() {
      const S = W.services && W.services.Item;
      if (!S || typeof S.requestUnassignedItems !== 'function') { st.msg = 'EA-Funktion für „Neue Items“ nicht gefunden.'; render(); return; }
      st.busy = true; st.msg = 'Lade neue Items …'; render();
      try {
        const ev = await obs(S.requestUnassignedItems());
        const L = ((ev.response || ev.data || {}).items || []).map(info);
        L.sort((a, b) => (b.value || 0) - (a.value || 0) || (b.rating || 0) - (a.rating || 0));
        st.items = L; st.count = L.length; st.choice = {};
        L.forEach((x) => { st.choice[x.id] = suggest(x); });
        st.msg = L.length ? '' : 'Keine neuen Items – alles sortiert. 👍';
      } catch (e) { st.msg = 'Fehler: ' + e.message; } finally { st.busy = false; render(); }
    }

    async function apply() {
      const S = W.services.Item;
      const L = st.items.filter((x) => st.choice[x.id] && st.choice[x.id] !== 'keep');
      st.busy = true; st.confirm = false;
      let ok = 0, fail = 0;
      const errs = {};
      for (let i = 0; i < L.length; i++) {
        const x = L[i], a = st.choice[x.id];
        st.msg = `${i + 1}/${L.length}: ${x.name} → ${ACT[a]} …`; render();
        try {
          let ev;
          if (a === 'qs') {
            if (!canQS()) throw new Error('Schnellverkauf nicht verfügbar');
            ev = await obs(S.discard([x.ent]));
          } else {
            const p = pile(a);
            if (p == null) throw new Error(`Ziel „${ACT[a]}“ unbekannt`);
            ev = await obs(S.move(x.ent, p));
          }
          if (ev && ev.success === false) { fail++; errs[ev.status || '?'] = (errs[ev.status || '?'] || 0) + 1; } else ok++;
        } catch (e) { fail++; errs[e.message] = (errs[e.message] || 0) + 1; }
        await sleep(350 + Math.random() * 400);
      }
      const why = Object.entries(errs).map(([k, n]) => `${n}× ${k}`).join(', ');
      st.busy = false;
      showToast(`📦 ${ok} verteilt${fail ? ` · ${fail} fehlgeschlagen` : ''}`, fail > 0);
      await load();
      if (fail) st.msg = `${ok} verteilt, ${fail} fehlgeschlagen (${why}). Häufigster Grund: Transferliste oder SBC-Lager voll.`;
      render();
    }

    function sum() {
      const L = st.items || [];
      const by = {};
      L.forEach((x) => { const a = st.choice[x.id]; by[a] = (by[a] || 0) + 1; });
      const qsCoins = L.filter((x) => st.choice[x.id] === 'qs').reduce((a, x) => a + (x.qs || 0), 0);
      const tlVal = L.filter((x) => st.choice[x.id] === 'tl').reduce((a, x) => a + (x.value ? afterTax(x.value) : 0), 0);
      return { by, qsCoins, tlVal };
    }

    function render() {
      if (!box) return;
      const L = st.items;
      const s = L ? sum() : null;
      const opts = (x) => Object.keys(ACT).filter((k) => (k !== 'qs' || canQS()) && (k !== 'store' || pile('store') != null) && (k !== 'tl' || !x.untr))
        .map((k) => `<option value="${k}" ${st.choice[x.id] === k ? 'selected' : ''}>${ACT[k]}</option>`).join('');
      const rows = L ? L.map((x) => `<div class="ni-r">
          <span class="ni-n"><b>${esc(x.rating ?? '')}</b> ${esc(x.name)}${x.untr ? ' <em>NH</em>' : ''}${x.dup ? ' <em class="d">Dup</em>' : ''}
            <small>${x.value ? `Wert ${fmt(x.value)}` : 'Wert –'}${x.qs ? ` · Schnell ${fmt(x.qs)}` : ''}${x.pts ? ` · ${fmt(x.pts)} 💎` : ''}</small></span>
          <select data-ni="${x.id}" aria-label="Ziel für ${esc(x.name)}">${opts(x)}</select></div>`).join('') : '';
      box.innerHTML = `<div class="fcpt-sgroup"><h4>📦 Neue Items sortieren</h4>
        <div class="note" style="font-size:12px;color:var(--ink2)">Nach dem Pack-Öffnen: das Tool schlägt für jede Karte ein Ziel vor – du kannst alles ändern und bestätigst am Ende.</div>
        <div class="fcpt-set"><span>Verkaufen ab Wert<small>Handelbare Karten ab diesem Marktwert → Transferliste</small></span><input type="number" min="0" step="250" data-ni-min value="${settings.niSellMin}"></div>
        <button class="fcpt-bigbtn" data-ni-load ${st.busy ? 'disabled' : ''}>📦 Neue Items laden${st.count != null ? ` (${st.count})` : ''}</button>
        ${st.msg ? `<div class="fcpt-stand">${esc(st.msg)}</div>` : ''}
        ${L && L.length ? `
          <div class="ni-sum">${Object.entries(s.by).map(([k, n]) => `<span>${n}× ${ACT[k]}</span>`).join('')}</div>
          ${s.tlVal ? `<div class="pt-note">Transferliste bringt ca. <b>${fmt(s.tlVal)}</b> nach Steuer${s.qsCoins ? ` · Schnellverkauf <b>${fmt(s.qsCoins)}</b> sofort` : ''}.</div>` : s.qsCoins ? `<div class="pt-note">Schnellverkauf bringt sofort <b>${fmt(s.qsCoins)}</b>.</div>` : ''}
          <div class="ni-list">${rows}</div>
          ${st.confirm ? `<div class="pt-confirm"><b>${L.filter((x) => st.choice[x.id] !== 'keep').length} Items verteilen?</b>
              <span>${s.by.qs ? `${s.by.qs}× Schnellverkauf ist endgültig. ` : ''}Verschieben lässt sich in der Web App wieder ändern.</span>
              <div class="btns2"><button class="fcpt-smallbtn go" data-ni-yes>Ja, verteilen</button><button class="fcpt-smallbtn" data-ni-no>Abbrechen</button></div></div>`
            : `<button class="fcpt-bigbtn" data-ni-go ${st.busy ? 'disabled' : ''}>✓ Alle verteilen</button>`}` : ''}
      </div>`;
      const q = (sel) => box.querySelector(sel);
      const on = (el, ev, fn) => el && el.addEventListener(ev, (e) => { e.stopPropagation(); fn(e); });
      on(q('[data-ni-load]'), 'click', () => load());
      on(q('[data-ni-go]'), 'click', () => { st.confirm = true; render(); });
      on(q('[data-ni-no]'), 'click', () => { st.confirm = false; render(); });
      on(q('[data-ni-yes]'), 'click', () => apply());
      on(q('[data-ni-min]'), 'change', (e) => {
        settings.niSellMin = Math.max(0, parseInt(e.target.value, 10) || 0); saveSettings();
        if (st.items) { st.items.forEach((x) => { st.choice[x.id] = suggest(x); }); render(); }
      });
      box.querySelectorAll('[data-ni]').forEach((sel) => on(sel, 'change', () => { st.choice[sel.dataset.ni] = sel.value; render(); }));
    }

    // Anzahl im Hintergrund nachsehen (für die Übersicht) – höchstens alle 5 Min., nur wenn das Panel offen ist
    let lastCount = 0;
    async function peek() {
      if (Date.now() - lastCount < 5 * 60000 || st.busy) return st.count;
      lastCount = Date.now();
      try {
        const S = W.services && W.services.Item;
        if (!S || typeof S.requestUnassignedItems !== 'function') return null;
        const ev = await obs(S.requestUnassignedItems());
        st.count = ((ev.response || ev.data || {}).items || []).length;
        render();
      } catch (e) { /* */ }
      return st.count;
    }

    function mount(el) { box = el; render(); }
    const diag = () => ({ itemPileKeys: Object.keys(W.ItemPile || {}), move: !!(W.services && W.services.Item && W.services.Item.move), discard: canQS(), count: st.count });
    return { mount, peek, count: () => st.count, diag };
  })();

  // ==================================================================
  // KADER-OPTIMIERER: stärkste Elf mit möglichst hoher Chemie aus deinem Verein
  // (+ optional günstige Upgrades vom Markt). Setzt nichts automatisch ein.
  // ==================================================================
  const SQUADOPT = (() => {
    if (settings.soFormation === undefined) settings.soFormation = '';
    if (settings.soMinChem === undefined) settings.soMinChem = 24;
    let box = null;
    const st = { msg: '', busy: false, res: null, ups: null, active: null };

    const formations = () => {
      const all = Object.assign({}, SBC.FORMATIONS, settings.sbcFormations || {});
      return Object.keys(all).filter((k) => Array.isArray(all[k]) && all[k].length === 11).sort();
    };
    const posOf = (f) => (settings.sbcFormations && settings.sbcFormations[f]) || SBC.FORMATIONS[f] || null;
    const label = (f) => String(f).replace(/^f/, '').replace(/[^0-9]/g, '').split('').join('-');

    async function run() {
      st.busy = true; st.res = null; st.ups = null; st.msg = 'Lade Verein …'; render();
      try {
        const c = await SBCUI.loadClub((m) => { st.msg = m; render(); }, false);
        if (!st.active) st.active = await SBCUI.activeSquadInfo();
        let f = settings.soFormation;
        if (!f && st.active && st.active.formation && posOf(st.active.formation)) f = st.active.formation;
        if (!f || !posOf(f)) f = formations().includes('f4231') ? 'f4231' : 'f442';
        const positions = posOf(f);
        const pool = c.players.filter((p) => !p.storage && !p.unassigned && p.rating)
          .map((p) => Object.assign({}, p, { cost: Math.pow(100 - p.rating, 2) }));   // Ziel: hohe Ratings
        const slots = positions.map((position) => ({ position }));
        const variants = [];
        for (const t of [33, 30, 27, settings.soMinChem]) {
          st.msg = `Suche beste Elf (${label(f)}) mit Chemie ≥ ${t} …`; render();
          await sleep(30);
          const sol = SBC.solve(pool, slots, [{ id: 1, kind: 'CHEMISTRY_POINTS', value: t, scope: 'MIN' }], { timeMs: 2500 });
          if (!sol.error && sol.feasible) variants.push({ t, sol });
          if (variants.length && t <= settings.soMinChem) break;
        }
        if (!variants.length) { st.msg = 'Keine Elf mit genug Chemie gefunden – Mindest-Chemie senken.'; return; }
        // Varianten: höchste Chemie und höchstes Rating (falls verschieden)
        const byChem = variants[0];
        const byRating = [...variants].sort((a, b) => b.sol.ev.ratingRaw - a.sol.ev.ratingRaw || b.sol.ev.chem.total - a.sol.ev.chem.total)[0];
        st.res = { f, positions, pool, list: byRating === byChem ? [byChem] : [byChem, byRating] };
        st.msg = '';
      } catch (e) { st.msg = 'Fehler: ' + e.message; } finally { st.busy = false; render(); }
    }

    // Upgrades: Konzept-Spieler gleicher Position, besser bewertet, gleiche Liga oder Nation (Chemie bleibt ähnlich)
    async function upgrades() {
      const r = st.res && st.res.list[0];
      if (!r) return;
      st.busy = true; st.msg = 'Lade Marktspieler (einmal pro Sitzung, ca. 1–2 Min.) …'; render();
      try {
        if (typeof RATINGS !== 'undefined' && !RATINGS.get()) { try { await RATINGS.load(); } catch (e) { /* */ } }
        const con = await SBCUI.loadConcepts((m) => { st.msg = m; render(); });
        const out = [];
        r.sol.players.forEach((cur, i) => {
          if (!cur) return;
          const pos = st.res.positions[i];
          let best = null;
          for (const p of con.players) {
            if (p.rating <= cur.rating || !(p.positions || []).includes(pos)) continue;
            if (p.leagueId !== cur.leagueId && p.nationId !== cur.nationId) continue;
            SBCUI.conceptPrice(p);
            const gain = p.rating - cur.rating;
            const per = p.value / gain;
            if (!best || per < best.per) best = { p, gain, per, pos, cur };
          }
          if (best) out.push(best);
        });
        out.sort((a, b) => a.per - b.per);
        st.ups = out.slice(0, 6);
        st.msg = out.length ? '' : 'Keine passenden Upgrades gefunden.';
      } catch (e) { st.msg = 'Fehler: ' + e.message; } finally { st.busy = false; render(); }
    }

    function solHtml(v, i) {
      const ev = v.sol.ev;
      const rows = v.sol.players.map((p, k) => p ? `<div class="so-r"><span class="so-p">${esc(st.res.positions[k])}</span><span class="so-n"><b>${esc(p.rating)}</b> ${esc(p.name)}${p.untradeable ? ' <em>NH</em>' : ''}</span><span class="ch ch${ev.chem.per[k]}">${ev.chem.per[k]}</span></div>` : '').join('');
      return `<div class="so-v"><div class="so-h"><b>${i === 0 ? 'Beste Chemie' : 'Bestes Rating'}</b><span>Rating <b>${ev.rating}</b> · Chemie <b>${ev.chem.total}</b>/33</span></div>${rows}</div>`;
    }

    function render() {
      if (!box) return;
      const fs = formations();
      const cur = settings.soFormation;
      box.innerHTML = `<div class="fcpt-sgroup"><h4>⚽ Kader-Optimierer</h4>
        <div class="note" style="font-size:12px;color:var(--ink2)">Baut aus deinem Verein die stärkste Elf mit möglichst hoher Chemie. Setzt nichts ein – du stellst die Mannschaft in der Web App selbst auf.</div>
        <div class="fcpt-set"><span>Formation${st.active && st.active.formation ? `<small>Aktive Mannschaft: ${esc(label(st.active.formation))}</small>` : ''}</span>
          <select data-so="f"><option value="">Automatisch${st.active && st.active.formation && posOf(st.active.formation) ? ' (wie aktive)' : ''}</option>${fs.map((f) => `<option value="${f}" ${cur === f ? 'selected' : ''}>${esc(label(f))}</option>`).join('')}</select></div>
        <div class="fcpt-set"><span>Mindest-Chemie<small>Für die Variante „Bestes Rating“</small></span><input type="number" min="0" max="33" data-so="c" value="${settings.soMinChem}"></div>
        <button class="fcpt-bigbtn" data-so="run" ${st.busy ? 'disabled' : ''}>⚽ Beste Elf berechnen</button>
        ${st.msg ? `<div class="fcpt-stand">${esc(st.msg)}</div>` : ''}
        ${st.res ? `<div class="pt-note">Formation ${esc(label(st.res.f))} · aus ${fmt(st.res.pool.length)} Spielern</div>${st.res.list.map(solHtml).join('')}
          <button class="fcpt-smallbtn" data-so="ups" ${st.busy ? 'disabled' : ''}>💡 Günstige Upgrades vom Markt suchen</button>` : ''}
        ${st.ups && st.ups.length ? `<div class="pt-h">Günstigste Upgrades (Chemie bleibt ähnlich)</div>${st.ups.map((u) => `<div class="pt-r"><span>${esc(u.pos)}: ${esc(u.cur.rating)} ${esc(u.cur.name)} → <b>${esc(u.p.rating)} ${esc(u.p.name)}</b></span><span>+${u.gain} · ≈ ${fmt(Math.round(u.p.value))}</span></div>`).join('')}
          <div class="pt-note">Preise teils geschätzt (Futbin, günstigste Karte je Rating) – vor dem Kauf prüfen.</div>` : ''}
      </div>`;
      const on = (sel, ev, fn) => { const x = box.querySelector(sel); if (x) x.addEventListener(ev, (e) => { e.stopPropagation(); fn(x); }); };
      on('[data-so="f"]', 'change', (x) => { settings.soFormation = x.value; saveSettings(); });
      on('[data-so="c"]', 'change', (x) => { settings.soMinChem = Math.max(0, Math.min(33, parseInt(x.value, 10) || 0)); saveSettings(); });
      on('[data-so="run"]', 'click', () => run());
      on('[data-so="ups"]', 'click', () => upgrades());
    }
    function mount(el) { box = el; render(); }
    return { mount };
  })();

  // ==================================================================
  // TRANSFERZIELE-MANAGER: deine Gebote im Blick – überboten? lohnt Nachbieten?
  // Geboten wird nur, wenn du auf „Nachbieten“ klickst.
  // ==================================================================
  const TARGETS = (() => {
    if (settings.tgMinProfit === undefined) settings.tgMinProfit = 200;
    if (settings.tgAuto === undefined) settings.tgAuto = false;
    let box = null, timer = null;
    const st = { list: null, msg: '', busy: false };
    const obs = (o, ms = 12000) => new Promise((resolve, reject) => {
      if (!o || typeof o.observe !== 'function') return reject(new Error('Keine EA-Antwort'));
      const sub = {};
      const t = setTimeout(() => reject(new Error('Zeitüberschreitung bei EA')), ms);
      o.observe(sub, (ob, ev) => { clearTimeout(t); try { ob.unobserve(sub); } catch (e) { /* */ } resolve(ev || {}); });
    });
    const nextBid = (cur, start) => (cur ? cur + stepFor(cur) : start || 150);

    function row(ent) {
      const p = mapItem(ent);
      if (!p) return null;
      let a = {};
      try { a = ent.getAuctionData ? ent.getAuctionData() : ent._auction || {}; } catch (e) { /* */ }
      const bidState = String(a.bidState || '').toLowerCase();
      const trade = String(a.tradeState || '').toLowerCase();
      const lead = bidState === 'highest';
      const status = trade === 'closed' ? (lead ? 'won' : 'lost') : trade === 'expired' ? (lead ? 'won' : 'lost') : lead ? 'lead' : bidState === 'outbid' ? 'outbid' : 'watch';
      const market = p.isPlayer ? (marketPrice(p.resourceId) || cacheGet(`futbin:${settings.platform}:${p.resourceId}`) || null) : null;
      const maxBid = market ? Math.floor((afterTax(market) - settings.tgMinProfit) / stepFor(market)) * stepFor(market) : null;
      const nb = nextBid(a.currentBid, a.startingBid);
      return { ent, p, status, cur: a.currentBid || 0, bin: a.buyNowPrice, exp: a.expires, market, maxBid, nb, worth: maxBid != null && nb <= maxBid };
    }

    async function load(quiet) {
      const S = W.services && W.services.Item;
      if (!S || typeof S.requestWatchedItems !== 'function') { st.msg = 'EA-Funktion für Transferziele nicht gefunden.'; render(); return; }
      if (!quiet) { st.busy = true; st.msg = 'Lade Transferziele …'; render(); }
      try {
        const ev = await obs(S.requestWatchedItems());
        const items = (ev.response || ev.data || {}).items || [];
        st.list = items.map(row).filter(Boolean);
        const order = { outbid: 0, lead: 1, watch: 2, won: 3, lost: 4 };
        st.list.sort((a, b) => order[a.status] - order[b.status] || (a.exp || 0) - (b.exp || 0));
        st.msg = st.list.length ? '' : 'Keine Transferziele.';
        // fehlende Futbin-Preise nachladen (gedrosselt)
        st.list.filter((r) => r.p.isPlayer && !r.market).slice(0, 8).forEach((r) => {
          getPrice('futbin', r.p).then(() => { const n = row(r.ent); if (n) Object.assign(r, n); render(); }).catch(() => {});
        });
      } catch (e) { st.msg = 'Fehler: ' + e.message; } finally { st.busy = false; render(); }
    }

    async function bid(i) {
      const r = st.list[i];
      if (!r) return;
      const S = W.services.Item;
      r.busy = true; render();
      try {
        const ev = await obs(S.bid(r.ent, r.nb));
        showToast(ev && ev.success === false ? `Gebot abgelehnt (${ev.status || '?'})` : `✓ ${r.p.name}: ${fmt(r.nb)} geboten`, ev && ev.success === false);
      } catch (e) { showToast('Gebot fehlgeschlagen: ' + e.message, true); }
      r.busy = false;
      await load(true);
    }

    const LBL = { outbid: ['Überboten', 'bad'], lead: ['Führend', 'good'], watch: ['Beobachtet', ''], won: ['Gewonnen', 'good'], lost: ['Verloren', 'mid'] };
    function render() {
      if (!box) return;
      const L = st.list || [];
      const cnt = (s) => L.filter((r) => r.status === s).length;
      box.innerHTML = `<div class="fcpt-sgroup"><h4>🎯 Transferziele</h4>
        <div class="note" style="font-size:12px;color:var(--ink2)">Deine Gebote: wo du überboten wurdest und bis wohin Nachbieten noch Profit bringt (Futbin-Preis nach Steuer minus Mindest-Profit).</div>
        <div class="fcpt-set"><span>Mindest-Profit beim Weiterverkauf</span><input type="number" min="0" step="50" data-tg="min" value="${settings.tgMinProfit}"></div>
        <div class="fcpt-set"><span>Alle 20 Sek. aktualisieren<small>Nur solange dieser Bereich offen ist</small></span><input type="checkbox" class="fcpt-sw" data-tg="auto" ${settings.tgAuto ? 'checked' : ''}></div>
        <button class="fcpt-bigbtn" data-tg="load" ${st.busy ? 'disabled' : ''}>🎯 Transferziele laden</button>
        ${st.msg ? `<div class="fcpt-stand">${esc(st.msg)}</div>` : ''}
        ${L.length ? `<div class="ni-sum"><span>${cnt('outbid')}× überboten</span><span>${cnt('lead')}× führend</span><span>${cnt('won')}× gewonnen</span></div>
        <div class="ni-list">${L.map((r, i) => `<div class="ni-r tg-${r.status}">
          <span class="ni-n"><b>${esc(r.p.rating ?? '')}</b> ${esc(r.p.name)} <span class="trel ${LBL[r.status][1]}">${LBL[r.status][0]}</span>
            <small>Gebot ${fmt(r.cur)}${r.bin ? ` · SK ${fmt(r.bin)}` : ''}${r.market ? ` · Futbin ${fmt(r.market)}` : ''}${r.maxBid != null ? ` · lohnt bis <b>${fmt(r.maxBid)}</b>` : ''}${r.status === 'outbid' || r.status === 'lead' || r.status === 'watch' ? ` · ${fmtTime(r.exp)}` : ''}</small></span>
          ${r.status === 'outbid' || r.status === 'watch' ? (r.worth ? `<button class="fcpt-smallbtn go" data-tg-bid="${i}" ${r.busy ? 'disabled' : ''}>Bieten ${fmt(r.nb)}</button>` : `<span class="tg-no">${r.maxBid != null ? 'lohnt nicht mehr' : 'Preis fehlt'}</span>`) : ''}
        </div>`).join('')}</div>` : ''}
      </div>`;
      const on = (sel, ev, fn) => box.querySelectorAll(sel).forEach((x) => x.addEventListener(ev, (e) => { e.stopPropagation(); fn(x); }));
      on('[data-tg="load"]', 'click', () => load());
      on('[data-tg="min"]', 'change', (x) => { settings.tgMinProfit = Math.max(0, parseInt(x.value, 10) || 0); saveSettings(); if (st.list) { st.list = st.list.map((r) => row(r.ent) || r); render(); } });
      on('[data-tg="auto"]', 'change', (x) => { settings.tgAuto = x.checked; saveSettings(); });
      on('[data-tg-bid]', 'click', (x) => bid(+x.dataset.tgBid));
    }

    timer = setInterval(() => {
      if (!settings.tgAuto || !box || !st.list || st.busy || document.visibilityState !== 'visible') return;
      const visible = box.offsetParent !== null && panel.classList.contains('open');
      if (visible) load(true);
    }, 20000);

    function mount(el) { box = el; render(); }
    return { mount };
  })();

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
      .tr-fix{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:8px;padding:8px 10px;border-radius:10px;background:#0f1420;border:1px solid var(--line)}
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
      const DUR = [[3600, '1 Std.'], [10800, '3 Std.'], [21600, '6 Std.'], [43200, '12 Std.'], [86400, '1 Tag'], [259200, '3 Tage']];
      let running = false, stop = false, confirmN = 0;
      let group = null;   // resourceId der gewählten Kartenversion (nur gleiche Karten einstellen) oder 'all'
      const preset = (p) => settings.listPresets[p.resourceId] || null;
      function priceFor(p) {
        const ps = preset(p);
        if (ps) return { bin: ps.bin, start: ps.start || lowerStep(ps.bin), src: 'Festpreis' };
        if (!settings.listFallback || !p.isPlayer) return null;
        const m = marketPrice(p.resourceId);
        if (!m) return null;
        const bin = listSuggest(p, m).bin;
        return { bin, start: lowerStep(bin), src: 'Futbin-Vorschlag' };
      }
      // Karten, die gerade eingestellt werden können: in der Transferliste, nicht aktiv, nicht verkauft
      function candidates(only) {
        const out = [], skipped = [];
        for (const p of items) {
          if (p.sold || p.active || !p.__raw) continue;
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
      function fixHtml(p) {
        if (!p.isPlayer || p.sold) return '';
        const ps = preset(p);
        const m = marketPrice(p.resourceId);
        const sug = m ? listSuggest(p, m).bin : null;
        return `<div class="tr-fix"><span class="lb">Festpreis</span>
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
        if (confirmN) {
          const nr = out.filter((c) => c.raised).length;
          bar.innerHTML = `<span class="st">${confirmN}× ${esc(gName)} für ${esc(DUR.find((d) => d[0] === settings.listDuration)?.[1] || '')} einstellen?${nr ? ` (${nr}× zum Ohne-Verlust-Preis, weil teurer gekauft)` : ''}</span><button data-la="yes" class="go">Ja, einstellen</button><button data-la="no">Nein</button>`;
          return;
        }
        const sel = G.length ? `<select data-la="grp" aria-label="Welche Karten einstellen">${G.map((g) => `<option value="${g.k}" ${String(group) === g.k ? 'selected' : ''}>${g.n}× ${esc(g.rating ?? '')} ${esc(g.name)} · ${fmt(g.bin)}${g.raised ? ` (${g.raised}× höher, ohne Verlust)` : ''}</option>`).join('')}${G.length > 1 ? `<option value="all" ${group === 'all' ? 'selected' : ''}>Alle mit Festpreis (${G.reduce((a, g) => a + g.n, 0)})</option>` : ''}</select>` : '';
        bar.innerHTML = `${sel}<button data-la="ask" class="go" ${out.length ? '' : 'disabled'} title="${skipped.length ? `${skipped.length} Karte(n) übersprungen: Festpreis unter „ohne Verlust“` : 'Stellt die gewählten gleichen Karten nacheinander ein'}">▶ Einstellen (${out.length})</button>${msg ? `<span class="st">${esc(msg)}</span>` : skipped.length ? `<span class="st">${skipped.length} Karte(n) übersprungen: Festpreis unter „ohne Verlust“ – in den Einstellungen änderbar</span>` : (G.length ? '' : '<span class="st">Festpreis in einer Zeile festlegen, dann hier einstellen</span>')}`;
      }
      async function runAll() {
        const { out } = candidates(group);
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
          <div class="fcpt-set"><span>Festpreis unter „ohne Verlust“<small>Wenn eine Karte teurer gekauft wurde als der Festpreis zurückbringt</small></span><select data-lo="loss"><option value="be">zum Ohne-Verlust-Preis einstellen</option><option value="skip">überspringen</option><option value="allow">trotzdem zum Festpreis</option></select></div>`;
        grp.appendChild(box);
        const d = box.querySelector('[data-lo="dur"]'), f = box.querySelector('[data-lo="fb"]'), l = box.querySelector('[data-lo="loss"]');
        d.value = String(settings.listDuration); f.checked = !!settings.listFallback; l.value = settings.listLossMode;
        box.addEventListener('change', (e) => {
          e.stopPropagation();
          settings.listDuration = parseInt(d.value, 10) || 3600; settings.listFallback = f.checked; settings.listLossMode = l.value;
          saveSettings(); drawBar();
        });
      }
      drawBar();
      return { fixHtml, drawBar };
    })();

    return { rowHtml, headHtml, updateRow, after: () => { after(); LIST.drawBar(); }, go, renderHome };
  })();

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
