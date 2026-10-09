  // ==================================================================
  // FUT-GALERIE-HELFER: Sets, Stand, nächste Note und günstigste Wege dorthin.
  // Liest EAs Galerie-Daten mit (Netzwerk + EA-Objekte). Kauft und setzt nichts.
  // Karten bleiben in der Galerie, auch wenn du sie danach verkaufst.
  // ==================================================================
  // eslint-disable-next-line no-var
  var GALLERY = (() => {
    const KEY = 'fcpt_gallery';
    const saved = GM_getValue(KEY, null);
    const st = { sets: saved ? saved.sets : [], t: saved ? saved.t : 0, urls: [], msg: '', busy: false, open: null, res: {}, raw: null };
    let box = null;
    const GR = ['D', 'C', 'B', 'A', 'S'];

    const obsOnce = (obs, ms = 10000) => new Promise((resolve, reject) => {
      if (!obs || typeof obs.observe !== 'function') { resolve(obs); return; }
      const t = setTimeout(() => reject(new Error('Zeitüberschreitung')), ms);
      const ctx = {};
      obs.observe(ctx, (o, ev) => { clearTimeout(t); try { o.unobserve(ctx); } catch (e) { /* */ } resolve(ev); });
    });
    const plain = (o) => { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return null; } };
    const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? +v : null);
    const pickK = (o, re) => Object.keys(o).find((k) => re.test(k));

    // ---------- Sets in beliebigem JSON erkennen ----------
    const looksLikeSet = (o) => o && typeof o === 'object' && !Array.isArray(o)
      && typeof (o.name || o.setName || o.title || o.displayName) === 'string'
      && Object.keys(o).some((k) => /score|grade|threshold|token/i.test(k));
    function findSets(d, out = [], depth = 0) {
      if (!d || typeof d !== 'object' || depth > 7) return out;
      if (Array.isArray(d)) { d.forEach((x) => findSets(x, out, depth + 1)); return out; }
      if (looksLikeSet(d)) { out.push(d); return out; }
      Object.values(d).forEach((v) => findSets(v, out, depth + 1));
      return out;
    }
    // Notenschwellen: Liste von Zahlen oder Objekten {grade, score/threshold, tokens}
    function thresholds(o) {
      const out = [];
      const walk = (x, depth) => {
        if (!x || depth > 3) return;
        if (Array.isArray(x)) { x.forEach((y, i) => { if (typeof y === 'number') out.push({ g: GR[i] || String(i), need: y, tok: null }); else walk(y, depth + 1); }); return; }
        if (typeof x !== 'object') return;
        const nk = pickK(x, /^(threshold|score|requiredScore|minScore|points|value)$/i);
        const gk = pickK(x, /^(grade|gradeName|tier|level|name)$/i);
        if (nk && num(x[nk]) != null && gk) { const tk = pickK(x, /token/i); out.push({ g: String(x[gk]), need: num(x[nk]), tok: tk ? num(x[tk]) : null }); return; }
        Object.values(x).forEach((y) => walk(y, depth + 1));
      };
      Object.keys(o).filter((k) => /grade|threshold|tier|reward|level/i.test(k) && o[k] && typeof o[k] === 'object').forEach((k) => walk(o[k], 0));
      const seen = new Set();
      return out.filter((x) => x.need > 0 && !seen.has(x.need) && seen.add(x.need)).sort((a, b) => a.need - b.need);
    }
    function toSet(o) {
      const sk = pickK(o, /^(current)?(total)?(grading)?score$/i) || pickK(o, /score/i);
      const filt = {};
      for (const [re, f] of [[/league/i, 'leagueId'], [/club|team/i, 'clubId'], [/nation|country/i, 'nationId'], [/rarit/i, 'rarity']]) {
        const k = Object.keys(o).find((x) => re.test(x) && (num(o[x]) != null || Array.isArray(o[x])));
        if (k) filt[f] = Array.isArray(o[k]) ? o[k].map(num).filter((v) => v != null) : [num(o[k])];
      }
      const tkE = pickK(o, /^(earned|collected|current)?tokens?(earned|collected)?$/i);
      const tkM = pickK(o, /^(max|total)tokens?$/i);
      const gk = pickK(o, /^(current)?grade$/i);
      return {
        id: o.id ?? o.setId ?? o.galleryId ?? o.name, name: o.name || o.setName || o.title || o.displayName,
        cat: o.category || o.type || o.setType || '', score: sk ? num(o[sk]) : null, grade: gk ? String(o[gk]) : '',
        tokE: tkE ? num(o[tkE]) : null, tokM: tkM ? num(o[tkM]) : null, th: thresholds(o), filt, keys: Object.keys(o).slice(0, 40),
      };
    }
    function addSets(list, from) {
      if (!list.length) return false;
      const by = new Map(st.sets.map((x) => [String(x.id), x]));
      list.map(toSet).forEach((x) => { x.from = from; by.set(String(x.id), x); });
      st.sets = [...by.values()];
      st.t = Date.now();
      try { GM_setValue(KEY, { t: st.t, sets: st.sets.slice(0, 200) }); } catch (e) { /* */ }
      return true;
    }
    // Nächste Note: erste Schwelle über dem aktuellen Stand
    function next(s) {
      if (s.score == null || !s.th.length) return null;
      const n = s.th.find((x) => x.need > s.score);
      return n ? Object.assign({ gap: n.need - s.score }, n) : null;
    }

    // ---------- 1) Mitlesen ----------
    SBCUI.CAP.hooks.push((url, method, status, text) => {
      if (!/galler|collection|album/i.test(url) || status !== 200 || !text) return;
      st.urls.push(`${method} ${url.replace(/^https?:\/\/[^/]+/, '').slice(0, 90)}`); if (st.urls.length > 12) st.urls.shift();
      let j; try { j = JSON.parse(text); } catch (e) { return; }
      st.raw = st.raw || JSON.stringify(j).slice(0, 1500);
      if (addSets(findSets(j), 'Netz')) render();
    });

    // ---------- 2) EA-Service fragen (falls vorhanden) ----------
    const services = () => Object.keys(W.services || {}).filter((k) => /galler|collection|album/i.test(k)).map((k) => [k, W.services[k]]);
    async function loadFromService() {
      let found = false;
      for (const [k, s] of services()) {
        try { if (s.repository && addSets(findSets(plain(s.repository)), `${k}.repository`)) found = true; } catch (e) { /* */ }
        const names = new Set();
        let o = s; for (let i = 0; o && i < 3; i++, o = Object.getPrototypeOf(o)) Object.getOwnPropertyNames(o).forEach((n) => { if (/^(request|get|load|fetch)/i.test(n) && /(set|galler|hub|overview|collection)/i.test(n)) names.add(n); });
        for (const n of [...names].slice(0, 4)) {
          try {
            if (typeof s[n] !== 'function' || s[n].length > 1) continue;
            const ev = await obsOnce(s[n].call(s));
            if (addSets(findSets(plain(ev && (ev.response || ev.data || ev))), `${k}.${n}`)) found = true;
          } catch (e) { log('Galerie', n, e); }
          await sleep(400);
        }
      }
      return found;
    }
    async function refresh() {
      st.busy = true; st.msg = 'Suche Galerie-Daten …'; render();
      try {
        const ok = await loadFromService();
        st.msg = ok || st.sets.length ? '' : 'Noch keine Galerie-Daten. Öffne in der Web App einmal die Galerie (FUT Gallery) – das Tool liest dann automatisch mit.';
      } catch (e) { st.msg = 'Fehler: ' + e.message; } finally { st.busy = false; render(); }
    }

    // ---------- 3) Günstigster Weg zur nächsten Note ----------
    const scoreOf = (p) => { const r = SBCUI.CAP.raw.get(p.id) || {}; return typeof r.gradingScore === 'number' && r.gradingScore > 0 ? r.gradingScore : POINTS.baseScore(p.rating); };
    const fits = (s, p) => Object.entries(s.filt).every(([f, vals]) => !vals.length || vals.includes(Number(p[f])));
    async function plan(s) {
      const n = next(s);
      if (!n) return;
      if (!Object.keys(s.filt).length) { st.res[s.id] = { err: 'Für dieses Set kennt das Tool die Bedingung (Liga/Verein/Nation) noch nicht – bitte Diagnose schicken.' }; render(); return; }
      st.busy = true; st.msg = 'Lade Marktspieler (einmal pro Sitzung) …'; render();
      try {
        if (typeof RATINGS !== 'undefined' && !RATINGS.get()) { try { await RATINGS.load(); } catch (e) { /* */ } }
        const con = await SBCUI.loadConcepts((m) => { st.msg = m; render(); });
        const pool = con.players.filter((p) => fits(s, p)).map((p) => { SBCUI.conceptPrice(p); const sc = scoreOf(p); return { p, sc, cost: p.value, per: p.value / Math.max(1, sc) }; }).filter((x) => x.sc > 0 && x.cost > 0);
        // gierig: bestes Preis/Punkt-Verhältnis, am Ende die günstigste Karte, die den Rest schließt
        pool.sort((a, b) => a.per - b.per);
        let gap = n.gap; const pick = [];
        for (const x of pool) {
          if (gap <= 0) break;
          const closer = pool.filter((y) => y.sc >= gap && !pick.includes(y)).sort((a, b) => a.cost - b.cost)[0];
          if (closer && closer.cost <= x.cost * Math.ceil(gap / x.sc)) { pick.push(closer); gap -= closer.sc; break; }
          pick.push(x); gap -= x.sc;
          if (pick.length > 30) break;
        }
        const cost = pick.reduce((a, x) => a + x.cost, 0);
        // Weiterverkauf: Karte bleibt in der Galerie – echte Kosten ≈ 5 % Steuer + Spanne
        const net = pick.reduce((a, x) => a + (x.cost - afterTax(x.cost)), 0);
        st.res[s.id] = gap > 0 ? { err: 'Mit Marktkarten nicht erreichbar.' } : { pick, cost, net, n };
        st.msg = '';
      } catch (e) { st.res[s.id] = { err: e.message }; st.msg = ''; } finally { st.busy = false; render(); }
    }

    // ---------- Oberfläche ----------
    function setHtml(s) {
      const n = next(s);
      const r = st.res[s.id];
      const open = st.open === String(s.id);
      return `<div class="ev ${open ? 'open' : ''}"><div class="ev-h" data-gl="${esc(s.id)}"><b>${esc(s.name)}</b><span>${s.grade ? `Note <b>${esc(s.grade)}</b> · ` : ''}${s.score != null ? fmt(s.score) : '–'}${n ? ` → ${esc(n.g)} bei ${fmt(n.need)}` : ''}${s.tokM ? ` · 🪙 ${s.tokE ?? 0}/${s.tokM}` : ''}</span></div>
        ${open ? `<div class="ev-b">
          ${n ? `<div class="pt-note">Bis Note <b>${esc(n.g)}</b> fehlen <b>${fmt(n.gap)}</b> Punkte${n.tok ? ` (+${n.tok} Tokens)` : ''}.</div>
            <button class="fcpt-smallbtn" data-glp="${esc(s.id)}" ${st.busy ? 'disabled' : ''}>💰 Günstigste Karten dafür berechnen</button>` : '<div class="pt-note">Keine nächste Note erkannt (schon S oder Schwellen unbekannt).</div>'}
          ${r && r.err ? `<div class="pt-note">${esc(r.err)}</div>` : ''}
          ${r && r.pick ? `<div class="pt-h">${r.pick.length} Karte(n) kaufen ≈ <b>${fmt(Math.round(r.cost))}</b> · nach Wiederverkauf nur ≈ <b>${fmt(Math.round(r.net))}</b> Verlust (Steuer)</div>
            ${r.pick.map((x) => `<div class="pt-r"><span><b>${esc(x.p.rating)}</b> ${esc(x.p.name)}</span><span>${fmt(x.sc)} 💎 · ≈ ${fmt(Math.round(x.cost))}</span></div>`).join('')}
            <div class="pt-note">Karten zählen in der Galerie weiter, auch wenn du sie danach verkaufst. Bonus-Tags (gleiche Liga, Erstbesitzer …) sind nicht eingerechnet – oft reicht weniger.</div>` : ''}
        </div>` : ''}</div>`;
    }
    function render() {
      if (!box) return;
      const withNext = st.sets.map((s) => ({ s, n: next(s) })).filter((x) => x.n).sort((a, b) => a.n.gap - b.n.gap);
      const rest = st.sets.filter((s) => !next(s));
      box.innerHTML = `<div class="fcpt-sgroup"><h4>🖼️ FUT-Galerie</h4>
        <div class="note" style="font-size:12px;color:var(--ink2)">Zeigt deine Galerie-Sets, wie weit es bis zur nächsten Note ist und welche Marktkarten dich am günstigsten hinbringen. Karten bleiben in der Galerie auch nach dem Verkauf. Setzt und kauft nichts.</div>
        <button class="fcpt-bigbtn" data-glr="1" ${st.busy ? 'disabled' : ''}>🖼️ Galerie laden</button>
        <div class="fcpt-stand">${esc(st.msg || (st.sets.length ? `${st.sets.length} Sets · Stand: ${agoText(st.t)}` : 'Tipp: In der Web App einmal die Galerie öffnen, dann hier laden.'))}</div>
        ${withNext.length ? `<div class="pt-h">Am nächsten an der nächsten Note</div>${withNext.map((x) => setHtml(x.s)).join('')}` : ''}
        ${rest.length ? `<details class="gl-rest"><summary>Weitere Sets (${rest.length})</summary>${rest.map(setHtml).join('')}</details>` : ''}
        ${st.sets.length || st.urls.length ? '<button class="fcpt-smallbtn" data-gld="1">📋 Diagnose kopieren</button>' : ''}
      </div>`;
      box.querySelector('[data-glr]').addEventListener('click', (e) => { e.stopPropagation(); refresh(); });
      box.querySelectorAll('[data-gl]').forEach((h) => h.addEventListener('click', (e) => { e.stopPropagation(); st.open = st.open === h.dataset.gl ? null : h.dataset.gl; render(); }));
      box.querySelectorAll('[data-glp]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); const s = st.sets.find((x) => String(x.id) === b.dataset.glp); if (s) plan(s); }));
      const d = box.querySelector('[data-gld]');
      if (d) d.addEventListener('click', (e) => { e.stopPropagation(); try { SBCUI.diagnose(); showToast('📋 Diagnose kopiert – im Chat einfügen'); } catch (er) { showToast('Diagnose fehlgeschlagen', true); } });
    }
    function mount(el) { box = el; render(); }
    const diag = () => ({
      services: services().map(([k, s]) => { const ms = new Set(); let o = s; for (let i = 0; o && i < 3; i++, o = Object.getPrototypeOf(o)) Object.getOwnPropertyNames(o).forEach((n) => ms.add(n)); return { k, methods: [...ms].slice(0, 40) }; }),
      globals: Object.keys(W).filter((k) => /galler|collection|album/i.test(k)).slice(0, 20),
      urls: st.urls, n: st.sets.length, raw: st.raw,
      sample: st.sets.slice(0, 3).map((s) => ({ name: s.name, score: s.score, grade: s.grade, th: s.th.slice(0, 5), filt: s.filt, keys: s.keys })),
    });
    return { mount, diag, findSets, toSet };
  })();
