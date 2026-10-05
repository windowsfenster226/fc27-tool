  // ==================================================================
  // EVOLUTIONS-HELFER: welche Vereinsspieler passen in welche Evolution?
  // Liest nur mit (Netzwerk + EA-Objekte), startet/bezahlt keine Evolution.
  // ==================================================================
  // eslint-disable-next-line no-var
  var EVO = (() => {
    const KEY = 'fcpt_evo';
    const saved = GM_getValue(KEY, null);   // { t, evos }
    const st = { evos: saved ? saved.evos : [], t: saved ? saved.t : 0, urls: [], msg: '', busy: false, open: null, res: {}, eligCap: {}, svcInfo: null };
    let box = null;

    // ---------- Hilfen ----------
    const obsOnce = (obs, ms = 10000) => new Promise((resolve, reject) => {
      if (!obs || typeof obs.observe !== 'function') { resolve(obs); return; }
      const t = setTimeout(() => reject(new Error('Zeitüberschreitung')), ms);
      const ctx = {};
      obs.observe(ctx, (o, ev) => { clearTimeout(t); try { o.unobserve(ctx); } catch (e) { /* */ } resolve(ev); });
    });
    const plain = (o) => { try { return JSON.parse(JSON.stringify(o, (k, v) => (k.startsWith('_') && k.length > 1 && typeof v === 'function' ? undefined : v))); } catch (e) { return null; } };
    const pick = (o, re) => { for (const k of Object.keys(o || {})) if (re.test(k)) return o[k]; return undefined; };
    const enumOf = (re) => { for (const k of Object.keys(W)) { if (!re.test(k)) continue; const v = W[k]; if (v && typeof v === 'object' && !Array.isArray(v)) return v; } return null; };
    function keyNameOf(n) {
      const E = enumOf(/^(Academy|Evolution).*Eligib.*Key$/i) || enumOf(/^(Academy|Evolution).*(Key|Requirement)/i);
      if (E) { if (typeof E[n] === 'string') return E[n]; const hit = Object.keys(E).find((k) => E[k] === n); if (hit) return hit; }
      return (typeof SBC !== 'undefined' && SBC.KEY_FALLBACK && SBC.KEY_FALLBACK[n]) || `KEY_${n}`;
    }

    // ---------- Evolutionen in beliebigem JSON erkennen ----------
    const isEvoObj = (o) => o && typeof o === 'object' && !Array.isArray(o)
      && (o.slotId != null || o.academySlotId != null || o.id != null)
      && typeof (o.slotName || o.name || o.title || o.displayName) === 'string'
      && Object.keys(o).some((k) => /elig|requir|criteria|levels|award|upgrade/i.test(k));
    function findEvos(data, out = [], depth = 0) {
      if (!data || typeof data !== 'object' || depth > 7) return out;
      if (Array.isArray(data)) { data.forEach((x) => findEvos(x, out, depth + 1)); return out; }
      if (isEvoObj(data)) { out.push(data); return out; }
      Object.values(data).forEach((v) => findEvos(v, out, depth + 1));
      return out;
    }
    // Anforderungen in eine einheitliche Form bringen: { key, scope, values, raw }
    function normReqs(o) {
      const arr = [];
      const src = pick(o, /^(eligibility|elgReq|requirements|eligibilityRequirements|criteria)/i);
      const walk = (x) => {
        if (!x) return;
        if (Array.isArray(x)) { x.forEach(walk); return; }
        if (typeof x !== 'object') return;
        const k = x.type ?? x.eligibilityKey ?? x.key ?? x.attribute ?? x.requirementType ?? x.name;
        const v = x.eligibilityValue ?? x.value ?? x.values ?? x.eligibilityValues ?? x.threshold;
        if (k != null && v != null && typeof v !== 'object' || (k != null && Array.isArray(v))) {
          arr.push({ key: typeof k === 'number' ? keyNameOf(k) : String(k), slot: x.eligibilitySlot ?? x.slot ?? null, scope: x.scope ?? x.eligibilityScope ?? null, values: Array.isArray(v) ? v : [v], raw: x });
        } else Object.values(x).forEach(walk);
      };
      walk(src);
      // SBC-ähnliches Format: SCOPE-Einträge im selben Slot anwenden
      const scopeBySlot = {};
      arr.filter((r) => /^SCOPE$/i.test(r.key)).forEach((r) => { scopeBySlot[r.slot] = r.values[0]; });
      return arr.filter((r) => !/^SCOPE$/i.test(r.key)).map((r) => Object.assign(r, { scope: r.scope ?? scopeBySlot[r.slot] ?? null }));
    }
    function normUpgrades(o) {
      const out = [];
      const src = pick(o, /^(levels|awards|upgrades|rewards|boosts)/i);
      const walk = (x, lvl) => {
        if (!x) return;
        if (Array.isArray(x)) { x.forEach((y, i) => walk(y, lvl ?? (y && (y.level ?? y.levelId)) ?? i + 1)); return; }
        if (typeof x !== 'object') return;
        const k = x.statType ?? x.attribute ?? x.stat ?? x.awardType ?? x.type;
        const v = x.value ?? x.boost ?? x.amount;
        if (k != null && typeof v === 'number') out.push({ lvl, key: String(k), v });
        else Object.values(x).forEach((y) => walk(y, lvl));
      };
      walk(src);
      return out;
    }
    function toEvo(o) {
      const id = o.slotId ?? o.academySlotId ?? o.id;
      const end = o.endTime ?? o.expiryTime ?? o.endDate ?? o.expires ?? null;
      const cost = o.coinCost ?? o.coins ?? o.price ?? (o.cost && typeof o.cost === 'object' ? o.cost.coins : o.cost) ?? null;
      const pts = o.pointsCost ?? o.points ?? (o.cost && typeof o.cost === 'object' ? o.cost.points : null) ?? null;
      return { id, name: o.slotName || o.name || o.title || o.displayName, end, cost, pts, status: o.status ?? o.slotStatus ?? null, reqs: normReqs(o), ups: normUpgrades(o), keys: Object.keys(o).slice(0, 40) };
    }
    function addEvos(list, from) {
      if (!list.length) return false;
      const by = new Map(st.evos.map((e) => [String(e.id), e]));
      list.map(toEvo).forEach((e) => { e.from = from; by.set(String(e.id), e); });
      st.evos = [...by.values()];
      st.t = Date.now();
      GM_setValue(KEY, { t: st.t, evos: st.evos.slice(0, 60) });
      return true;
    }

    // ---------- 1) Mitlesen: alles mit „academy“/„evolution“ in der Adresse ----------
    SBCUI.CAP.hooks.push((url, method, status, text) => {
      if (!/academy|evolution/i.test(url) || status !== 200 || !text) return;
      st.urls.push(`${method} ${url.replace(/^https?:\/\/[^/]+/, '').slice(0, 90)}`); if (st.urls.length > 12) st.urls.shift();
      let j; try { j = JSON.parse(text); } catch (e) { return; }
      if (addEvos(findEvos(j), 'Netz')) render();
      // Liste geeigneter Spieler zu einer Evolution? (z. B. …/slot/123/… mit itemData)
      const items = (j && (j.itemData || j.items || (j.data && j.data.items))) || null;
      const m = url.match(/(?:slot|evolution)s?\/(\d+)/i);
      if (Array.isArray(items) && m) { st.eligCap[m[1]] = items.map((x) => x.id).filter((x) => x != null); render(); }
    });

    // ---------- 2) EA-Objekte/Service direkt fragen (falls vorhanden) ----------
    function services() {
      const S = W.services || {};
      return Object.keys(S).filter((k) => /academy|evolution/i.test(k)).map((k) => [k, S[k]]);
    }
    function discover() {
      const svc = services().map(([k, s]) => {
        const ms = new Set();
        let o = s; for (let i = 0; o && i < 3; i++, o = Object.getPrototypeOf(o)) Object.getOwnPropertyNames(o).forEach((n) => { try { if (typeof s[n] === 'function') ms.add(n); } catch (e) { /* */ } });
        return { k, methods: [...ms].filter((n) => n !== 'constructor').slice(0, 40), repo: s && s.repository ? Object.keys(s.repository).slice(0, 20) : null };
      });
      const globals = Object.keys(W).filter((k) => /academy|evolution/i.test(k)).slice(0, 30).map((k) => {
        const v = W[k];
        const pm = v && v.prototype ? Object.getOwnPropertyNames(v.prototype).filter((n) => /elig|requir|valid|check|can/i.test(n)).slice(0, 12) : null;
        return pm && pm.length ? `${k}(${pm.join(',')})` : k;
      });
      return { svc, globals };
    }
    async function loadFromService() {
      let found = false;
      for (const [k, s] of services()) {
        // a) bereits geladene Daten im Repository
        try { if (s.repository) { const p = plain(s.repository); if (addEvos(findEvos(p), `${k}.repository`)) found = true; } } catch (e) { /* */ }
        // b) Methoden ohne Parameter, die nach „hub/slots“ klingen
        const names = [];
        let o = s; for (let i = 0; o && i < 3; i++, o = Object.getPrototypeOf(o)) Object.getOwnPropertyNames(o).forEach((n) => { if (/^(request|get|load|fetch).*(hub|slots?|academ|evolution)/i.test(n)) names.push(n); });
        for (const n of [...new Set(names)].slice(0, 4)) {
          try {
            if (typeof s[n] !== 'function' || s[n].length > 1) continue;
            const ev = await obsOnce(s[n].call(s));
            const p = plain(ev && (ev.response || ev.data || ev));
            if (addEvos(findEvos(p), `${k}.${n}`)) found = true;
            // Entitäten mit Prüf-Methode merken
            const ents = ev && (ev.response || ev.data);
            if (ents) st.svcRaw = ents;
          } catch (e) { log('Evo', n, e); }
          await sleep(400);
        }
      }
      return found;
    }

    // ---------- 3) Spieler prüfen ----------
    const STAT_IDX = { PAC: 0, PACE: 0, SHO: 1, SHOOTING: 1, PAS: 2, PASSING: 2, DRI: 3, DRIBBLING: 3, DEF: 4, DEFENDING: 4, PHY: 5, PHYSICAL: 5, PHYSICALITY: 5 };
    function checkReq(r, p, raw) {
      const K = r.key.toUpperCase();
      const v = r.values.map(Number);
      const sc = String(r.scope ?? '').toUpperCase();
      const isMax = sc === '1' || sc === 'MAX' || /MAX/.test(K), isExact = sc === '2' || sc === 'EXACT' || /EXACT/.test(K);
      const cmp = (x) => (x == null ? null : isExact ? v.includes(x) : isMax ? x <= v[0] : x >= v[0]);
      if (/OVR|OVERALL|RATING/.test(K) && !/TEAM/.test(K)) return cmp(p.rating);
      if (/POSITION/.test(K)) { const want = r.values.map((x) => SBC.normPos(x)); return p.positions.some((x) => want.includes(x)); }
      if (/RARITY/.test(K)) return v.includes(Number(p.rarity));
      if (/NATION/.test(K)) return v.includes(Number(p.nationId));
      if (/LEAGUE/.test(K)) return v.includes(Number(p.leagueId));
      if (/CLUB_ID|TEAM_ID/.test(K)) return v.includes(Number(p.clubId));
      if (/TRADAB|UNTRADE/.test(K)) return true;   // Evolutionen verlangen meist nicht handelbar – EA prüft selbst
      if (/PLAYSTYLE.*PLUS|TRAIT.*PLUS/.test(K)) { const n = Array.isArray(raw.iconTraits) ? raw.iconTraits.length : null; return n == null ? null : cmp(n); }
      if (/SKILL/.test(K)) return cmp(raw.skillmoves != null ? raw.skillmoves + 1 : null);
      if (/WEAK|WEAKFOOT/.test(K)) return cmp(raw.weakfootabilitytypecode ?? null);
      const s = Object.keys(STAT_IDX).find((x) => K.includes(x));
      if (s && Array.isArray(raw.attributeArray)) return cmp(raw.attributeArray[STAT_IDX[s]]);
      return null;   // unbekannt -> nicht geprüft
    }
    const reqText = (r) => {
      const sc = String(r.scope ?? '').toUpperCase();
      const op = sc === '1' || sc === 'MAX' || /MAX/i.test(r.key) ? '≤' : sc === '2' || sc === 'EXACT' ? '=' : (sc === '0' || sc === 'MIN' || /MIN/i.test(r.key) ? '≥' : '');
      return `${r.key.replace(/^PLAYER_|_/g, (m) => (m === '_' ? ' ' : '')).toLowerCase()} ${op} ${r.values.slice(0, 6).join(', ')}`;
    };

    async function candidates(evo) {
      st.busy = true; st.msg = 'Lade Verein …'; render();
      try {
        const c = await SBCUI.loadClub((m) => { st.msg = m; render(); }, false);
        const capIds = st.eligCap[String(evo.id)];
        let pool = c.players.filter((p) => !p.unassigned);
        let mode = 'geprüft';
        if (capIds && capIds.length) { const S = new Set(capIds.map(String)); pool = pool.filter((p) => S.has(String(p.id))); mode = 'von EA'; }
        const rows = [];
        for (const p of pool) {
          const raw = SBCUI.CAP.raw.get(p.id) || {};
          let ok = true, unk = 0;
          if (mode !== 'von EA') for (const r of evo.reqs) { const x = checkReq(r, p, raw); if (x === false) { ok = false; break; } if (x == null) unk++; }
          if (ok) rows.push({ p, unk });
        }
        rows.sort((a, b) => (b.p.untradeable - a.p.untradeable) || (a.unk - b.unk) || (b.p.rating - a.p.rating) || (a.p.value - b.p.value));
        const unknownReqs = evo.reqs.filter((r) => rows.length && rows.every((x) => checkReq(r, x.p, SBCUI.CAP.raw.get(x.p.id) || {}) == null));
        st.res[evo.id] = { rows: rows.slice(0, 25), total: rows.length, mode, unknownReqs };
        st.msg = '';
      } catch (e) { st.msg = 'Fehler: ' + e.message; } finally { st.busy = false; render(); }
    }

    async function refresh() {
      st.busy = true; st.msg = 'Suche Evolutionen …'; render();
      try {
        const ok = await loadFromService();
        st.msg = ok ? '' : 'Keine Evolutionen gefunden. Öffne in der Web App einmal „Evolutionen“ – das Tool liest dann automatisch mit.';
      } catch (e) { st.msg = 'Fehler: ' + e.message; } finally { st.busy = false; render(); }
    }

    // ---------- Oberfläche ----------
    const endText = (e) => { if (!e) return ''; const t = e > 1e12 ? e : e > 1e9 ? e * 1000 : Date.now() + e * 1000; const d = Math.round((t - Date.now()) / 36e5); return d > 48 ? `noch ${Math.round(d / 24)} Tage` : d > 0 ? `noch ${d} Std.` : ''; };
    function evoHtml(e) {
      const open = st.open === String(e.id);
      const r = st.res[e.id];
      const ups = e.ups.length ? `<div class="ev-ups">${e.ups.slice(0, 16).map((u) => `<span>${u.lvl ? `L${esc(u.lvl)} ` : ''}${esc(u.key)} +${esc(u.v)}</span>`).join('')}</div>` : '';
      const reqs = e.reqs.length ? `<div class="ev-req">${e.reqs.map((x) => `<span>${esc(reqText(x))}</span>`).join('')}</div>` : '<div class="pt-note">Anforderungen nicht im erkannten Format – siehe Diagnose.</div>';
      const res = r ? `<div class="pt-h">${r.total} passende Spieler (${esc(r.mode)})${r.total > r.rows.length ? ` · zeige ${r.rows.length}` : ''}</div>
        ${r.rows.map(({ p, unk }) => `<div class="pt-r"><span><b>${esc(p.rating)}</b> ${esc(p.name)} <small>${esc((p.positions || []).join('/'))}</small>${p.untradeable ? ' <em>NH</em>' : ''}${unk ? ` <small title="${unk} Bedingung(en) konnte das Tool nicht prüfen">?</small>` : ''}</span><span>${p.untradeable ? '' : `≈ ${fmt(Math.round(p.value))}`}</span></div>`).join('')}
        ${r.unknownReqs.length ? `<div class="pt-note">Nicht geprüft: ${r.unknownReqs.map((x) => esc(reqText(x))).join(' · ')} – EA prüft beim Einsetzen selbst.</div>` : ''}` : '';
      return `<div class="ev ${open ? 'open' : ''}"><div class="ev-h" data-ev="${esc(e.id)}"><b>${esc(e.name)}</b><span>${e.cost ? `${fmt(e.cost)} 🪙 ` : ''}${e.pts ? `${fmt(e.pts)} FP ` : ''}<small>${esc(endText(e.end))}</small></span></div>
        ${open ? `<div class="ev-b">${reqs}${ups}<button class="fcpt-smallbtn" data-evc="${esc(e.id)}" ${st.busy ? 'disabled' : ''}>🔎 Passende Spieler aus meinem Verein</button>${res}</div>` : ''}</div>`;
    }
    function render() {
      if (!box) return;
      box.innerHTML = `<div class="fcpt-sgroup"><h4>🧬 Evolutionen</h4>
        <div class="note" style="font-size:12px;color:var(--ink2)">Zeigt deine verfügbaren Evolutionen und welche Vereinsspieler die Bedingungen erfüllen – nicht handelbare zuerst. Startet und bezahlt nichts.</div>
        <button class="fcpt-bigbtn" data-evr="1" ${st.busy ? 'disabled' : ''}>🧬 Evolutionen laden</button>
        <div class="fcpt-stand">${esc(st.msg || (st.evos.length ? `${st.evos.length} Evolution(en) · Stand: ${agoText(st.t)}` : 'Tipp: In der Web App einmal „Evolutionen“ öffnen, dann hier laden.'))}</div>
        ${st.evos.map(evoHtml).join('')}
      </div>`;
      box.querySelector('[data-evr]').addEventListener('click', (ev) => { ev.stopPropagation(); refresh(); });
      box.querySelectorAll('[data-ev]').forEach((h) => h.addEventListener('click', (ev) => { ev.stopPropagation(); st.open = st.open === h.dataset.ev ? null : h.dataset.ev; render(); }));
      box.querySelectorAll('[data-evc]').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); const e = st.evos.find((x) => String(x.id) === b.dataset.evc); if (e) candidates(e); }));
    }
    function mount(el) { box = el; render(); }
    const diag = () => {
      let d = {}; try { d = discover(); } catch (e) { d = { err: String(e) }; }
      return Object.assign(d, { urls: st.urls, n: st.evos.length, sample: st.evos.slice(0, 2).map((e) => ({ id: e.id, name: e.name, keys: e.keys, reqs: e.reqs.slice(0, 8).map((r) => ({ key: r.key, scope: r.scope, values: r.values.slice(0, 5), raw: JSON.stringify(r.raw).slice(0, 160) })), ups: e.ups.slice(0, 6) })), eligCap: Object.keys(st.eligCap) });
    };
    return { mount, diag, findEvos, toEvo, checkReq };
  })();
