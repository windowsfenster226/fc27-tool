  // ==================================================================
  // VERBRAUCHSOBJEKTE: Chemie-Styles – Preise von Futbin (1 Abruf, 30 Min. gespeichert)
  // Zuordnung über den Namen (Englisch/Deutsch) oder EAs ID im Futbin-Bild.
  // ==================================================================
  // eslint-disable-next-line no-var
  var CONS = (() => {
    const KEY = 'fcpt_cons_prices';
    let data = GM_getValue(KEY, null);   // { t, plat, rows: [{ name, key, price, min, max, ids: [] }] }
    let loading = null, box = null, msg = '';
    const canon = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z]/g, '');
    // Deutsch -> Englisch (Futbin listet englisch); mehrere Varianten, falls EA anders übersetzt
    const DE = {
      basis: 'basic', grundlage: 'basic', scharfschutze: 'sniper', vollstrecker: 'finisher', prazision: 'deadeye', prazisionsschutze: 'deadeye', adlerauge: 'deadeye',
      torjager: 'marksman', schutze: 'marksman', falke: 'hawk', kunstler: 'artist', architekt: 'architect', kraftpaket: 'powerhouse', maestro: 'maestro',
      motor: 'engine', wachposten: 'sentinel', wachter: 'guardian', beschutzer: 'guardian', gladiator: 'gladiator', ruckgrat: 'backbone',
      anker: 'anchor', jager: 'hunter', katalysator: 'catalyst', schatten: 'shadow', mauer: 'wall', schild: 'shield', katze: 'cat', handschuh: 'glove',
    };
    const CHEM_EN = { 250: 'Basic', 251: 'Sniper', 252: 'Finisher', 253: 'Deadeye', 254: 'Marksman', 255: 'Hawk', 256: 'Artist', 257: 'Architect',
      258: 'Powerhouse', 259: 'Maestro', 260: 'Engine', 261: 'Sentinel', 262: 'Guardian', 263: 'Gladiator', 264: 'Backbone', 265: 'Anchor',
      266: 'Hunter', 267: 'Catalyst', 268: 'Shadow', 269: 'Wall', 270: 'Shield', 271: 'Cat', 272: 'Glove', 273: 'GK Basic' };
    const fresh = () => data && data.plat === settings.platform && Date.now() - data.t < 30 * 60000;
    const parseK = (t) => {
      const m = String(t || '').replace(/\s/g, '').match(/([\d.,]+)([KkMm])?/);
      if (!m) return null;
      const v = m[2] ? parseFloat(m[1].replace(',', '.')) * (/k/i.test(m[2]) ? 1000 : 1e6) : parseFloat(m[1].replace(/[.,]/g, ''));
      return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
    };

    function parse(html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const plat = settings.platform === 'pc' ? 'pc' : 'ps';
      const rows = [];
      for (const tr of doc.querySelectorAll('tbody tr, .consumable-row, [class*="consumable"] tr')) {
        const a = tr.querySelector('a') || tr.querySelector('td');
        let name = ((tr.querySelector('.table-name, .name, [class*="name"]') || a || {}).textContent || '').replace(/\s+/g, ' ').trim();
        if (!name) continue;
        name = name.replace(/\s*(Chemistry Style|Chem Style)$/i, '');
        const platEls = [...tr.querySelectorAll(`.platform-${plat}-only`)].map((e) => parseK(e.textContent)).filter(Boolean);
        const nums = [...tr.querySelectorAll('td')].slice(1).map((td) => parseK(td.textContent)).filter(Boolean);
        const price = platEls[0] || nums[0] || null;
        if (!price) continue;
        const ids = [...tr.querySelectorAll('img')].map((im) => ((im.getAttribute('src') || '').match(/(\d{2,})\.(png|webp|jpg)/) || [])[1]).filter(Boolean).map(Number);
        rows.push({ name, key: canon(name), price, min: platEls[1] || nums[1] || null, max: platEls[2] || nums[2] || null, ids });
      }
      // doppelte Namen: niedrigsten Preis behalten
      const by = {};
      rows.forEach((r) => { if (!by[r.key] || r.price < by[r.key].price) by[r.key] = r; });
      return Object.values(by);
    }

    function load(force) {
      if (!force && fresh()) return Promise.resolve(data);
      if (loading) return loading;
      msg = 'Lade Chemie-Style-Preise von Futbin …'; drawBox();
      loading = gmGet('https://www.futbin.com/27/consumables', 'text').then((html) => {
        if (isCfPage(html)) throw new Error(CHECK_MSG);
        const rows = parse(html);
        if (!rows.length) throw new Error('Futbin-Seite konnte nicht gelesen werden (Aufbau geändert?)');
        data = { t: Date.now(), plat: settings.platform, rows };
        GM_setValue(KEY, data);
        msg = '';
        // Transferliste und EA-Listen mit den neuen Preisen neu zeichnen
        setTimeout(() => { try { if (items.length) render(); redecorateAll(); } catch (e) { /* */ } }, 0);
        return data;
      }).catch((e) => { msg = 'Fehler: ' + e.message; throw e; }).finally(() => { loading = null; drawBox(); });
      return loading;
    }

    // Ist das ein Chemie-Style? Preis dazu (Futbin, sonst EA-Durchschnitt)
    function match(p) {
      if (!p || p.isPlayer || !data) return null;
      // zuerst über den englischen Namen zur Style-ID, dann über die ID im Futbin-Bild, dann über den Namen
      if (p.playStyle != null) {
        const en = canon(CHEM_EN[p.playStyle]);
        const byEn = en && data.rows.find((x) => x.key === en);
        if (byEn) return byEn;
        const byId = data.rows.find((x) => x.ids.includes(Number(p.playStyle)));
        if (byId) return byId;
      }
      const k = canon(p.name);
      const en = DE[k] || k;
      let r = data.rows.find((x) => x.key === en || x.key === k);
      if (!r && p.defId) r = data.rows.find((x) => x.ids.includes(p.defId) || x.ids.includes(p.defId % 1000));
      return r || null;
    }
    let autoTried = 0;
    function price(p) {
      if (!p || p.isPlayer) return null;
      if (!fresh() && Date.now() - autoTried > 5 * 60000) { autoTried = Date.now(); load().catch(() => {}); }
      const r = match(p);
      return r ? r.price : (p.marketAverage || null);
    }

    function drawBox() {
      if (!box) return;
      const rows = data ? [...data.rows].sort((a, b) => b.price - a.price) : [];
      box.innerHTML = `<div class="fcpt-sgroup"><h4>🧪 Chemie-Styles</h4>
        <div class="note" style="font-size:12px;color:var(--ink2)">Aktuelle Futbin-Preise. Chemie-Styles in deiner Transferliste bekommen automatisch Marktpreis, Profit und Festpreis-Vorschlag – und lassen sich mit „Alle einstellen“ verkaufen.</div>
        <button class="fcpt-bigbtn" data-cs="load" ${loading ? 'disabled' : ''}>🧪 Preise laden</button>
        <div class="fcpt-stand">${esc(msg || (data ? `Stand: ${agoText(data.t)} · ${data.rows.length} Styles` : ''))}</div>
        ${rows.length ? `<div class="ni-list">${rows.map((r) => `<div class="pt-r"><span>${esc(r.name)}</span><span><b>${fmt(r.price)}</b>${r.min && r.max ? ` <small>(EA ${fmt(r.min)}–${fmt(r.max)})</small>` : ''} · netto ${fmt(afterTax(r.price))}</span></div>`).join('')}</div>` : ''}
      </div>`;
      const b = box.querySelector('[data-cs="load"]');
      if (b) b.addEventListener('click', (e) => { e.stopPropagation(); load(true).catch(() => {}); });
    }
    function mount(el) { box = el; drawBox(); }
    return { load, price, match, mount, get: () => data, parse };
  })();
