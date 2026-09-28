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

    let best = null;
    let iters = 0, restarts = 0;
    while (now() - t0 < timeMs) {
      restarts++;
      let cur = initial();
      let cs = score(cur); cs.ev.__arr = cur;
      let temp = 1;
      const restartBudget = Math.max(400, timeMs / 6);
      const rt0 = now();
      while (now() - rt0 < restartBudget && now() - t0 < timeMs) {
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
        if (d <= 0 || Math.random() < Math.exp(-d / (temp * 500))) { cur = next; cs = ns; }
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

  return { KEY_FALLBACK, FORMATIONS, normPos, decodeRequirements, describe, teamRating, teamRatingRaw,
    chemistry, evaluate, solve, levelOf, isIcon, isHero };
})();
if (typeof module !== 'undefined') module.exports = SBC;
