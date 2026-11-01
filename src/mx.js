  // ==================================================================
  // MARKTINDEX: Preise der beliebtesten Spieler (Futbin „Popular“) über die Zeit.
  // Kettenindex (Start 1.000): je Abruf zählt nur, wer in beiden Abrufen einen Preis hat.
  // Holt Preise nur bei geöffnetem Tool – auf Knopfdruck oder höchstens alle 60 Min.
  // ==================================================================
  // eslint-disable-next-line no-var
  var MX = (() => {
    if (!Array.isArray(settings.mxPl)) settings.mxPl = [];      // [{ rid, name, path }]
    if (!Array.isArray(settings.mxHist)) settings.mxHist = [];  // [{ t, px: { rid: preis } }]
    if (settings.mxAuto === undefined) settings.mxAuto = true;
    if (settings.mxN === undefined) settings.mxN = 25;
    const st = { busy: false, msg: '', done: 0, total: 0 };
    let box = null;
    const MAXH = 160;

    // Futbin „Popular“-Seite lesen: jeder Link zu einer Spielerseite mit Kartenbild = ein Spieler
    async function loadPopular() {
      const html = await gmGet('https://www.futbin.com/popular', 'text');
      if (isCfPage(html)) throw new Error('Futbin-Schutzseite – öffne futbin.com einmal in einem Tab, dann erneut versuchen');
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const out = [], seen = new Set();
      for (const a of doc.querySelectorAll('a[href*="/player/"]')) {
        const box2 = a.querySelector('img[src*="/players/"]') ? a : a.closest('div, li, tr') || a;
        const img = box2.querySelector('img[src*="/players/"]');
        const m = img && (img.getAttribute('src') || '').match(/\/players\/p?(\d+)\./);
        if (!m || seen.has(m[1])) continue;
        let href = a.getAttribute('href') || '';
        try { href = new URL(href, 'https://www.futbin.com').pathname; } catch (e) { continue; }
        const name = (img.getAttribute('alt') || a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) || `#${m[1]}`;
        seen.add(m[1]);
        out.push({ rid: m[1], name, path: href });
        if (out.length >= Math.max(10, settings.mxN)) break;
      }
      return out;
    }

    function index() {
      const H = settings.mxHist;
      const series = [];
      let I = 1000;
      for (let i = 0; i < H.length; i++) {
        if (i > 0) {
          const a = H[i - 1].px, b = H[i].px;
          let sa = 0, sb = 0;
          for (const k of Object.keys(b)) if (a[k] && b[k]) { sa += a[k]; sb += b[k]; }
          if (sa > 0 && sb > 0) I *= sb / sa;
        }
        series.push([H[i].t, I]);
      }
      return series;
    }
    function at(series, t) { let v = null; for (const [ts, x] of series) { if (ts <= t) v = x; else break; } return v; }
    function change(series, ms) {
      if (series.length < 2) return null;
      const now = series[series.length - 1];
      const then = at(series, now[0] - ms);
      return then ? (now[1] / then - 1) * 100 : null;
    }
    function priceAt(rid, ms) {
      const H = settings.mxHist; if (!H.length) return null;
      const t = H[H.length - 1].t - ms;
      let v = null; for (const h of H) { if (h.t <= t && h.px[rid]) v = h.px[rid]; } return v;
    }
    function summary() {
      const s = index();
      if (!s.length) return null;
      return { v: s[s.length - 1][1], d24: change(s, 24 * 3600000), d1: change(s, 3600000), t: s[s.length - 1][0] };
    }

    async function refresh(reloadList) {
      if (st.busy) return;
      st.busy = true; st.msg = ''; render();
      try {
        if (reloadList || !settings.mxPl.length) {
          st.msg = 'Lade beliebte Spieler von Futbin …'; render();
          const L = await loadPopular();
          if (L.length < 5) throw new Error(`Futbin-Seite „Popular“ nicht lesbar (${L.length} Spieler erkannt) – bitte Screenshot an Claude`);
          settings.mxPl = L;
          L.forEach((x) => { if (!futbinIds[x.rid]) futbinIds[x.rid] = x.path; });
          GM_setValue(FB_KEY, futbinIds);
        }
        const px = {};
        st.done = 0; st.total = settings.mxPl.length;
        for (const x of settings.mxPl) {
          try {
            // frisch holen (nicht aus dem 10-Min-Cache), damit der Index echte Bewegung zeigt
            delete cache[`futbin:${settings.platform}:${x.rid}`];
            const v = await getPrice('futbin', { resourceId: x.rid, name: x.name, fullName: x.name, isPlayer: true }, 'futbin:mx');
            if (v) px[x.rid] = v;
          } catch (e) { if (/Schutzseite/.test(e.message)) { st.msg = e.message; break; } }
          st.done++; if (st.done % 4 === 0) render();
        }
        if (Object.keys(px).length >= 3) {
          const H = settings.mxHist, last = H[H.length - 1];
          if (last && Date.now() - last.t < 15 * 60000) H[H.length - 1] = { t: Date.now(), px };
          else H.push({ t: Date.now(), px });
          // ältere Einträge ausdünnen: über 2 Tage alt -> höchstens einer pro 6 Std.
          for (let i = H.length - 2; i > 0; i--) if (Date.now() - H[i].t > 2 * 864e5 && H[i + 1].t - H[i - 1].t < 6 * 3600000) H.splice(i, 1);
          if (H.length > MAXH) H.splice(0, H.length - MAXH);
          saveSettings();
          if (!st.msg) st.msg = `${Object.keys(px).length} von ${settings.mxPl.length} Preisen aktualisiert.`;
        } else if (!st.msg) st.msg = 'Zu wenige Preise erhalten – später erneut versuchen.';
      } catch (e) { st.msg = 'Fehler: ' + e.message; } finally { st.busy = false; render(); }
    }

    const pct = (v) => (v == null ? '–' : `${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1).replace('.', ',')} %`);
    const pcls = (v) => (v == null ? '' : v >= 0 ? 'pos' : 'neg');
    function spark(series) {
      if (series.length < 2) return '<div class="mx-empty">Verlauf erscheint ab dem zweiten Abruf.</div>';
      const W2 = 560, H2 = 90, t0 = series[0][0], t1 = series[series.length - 1][0] || t0 + 1;
      const vs = series.map((x) => x[1]), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
      const pts = series.map(([t, v]) => `${((t - t0) / (t1 - t0 || 1) * W2).toFixed(1)},${(H2 - 6 - (v - lo) / span * (H2 - 12)).toFixed(1)}`).join(' ');
      const up = vs[vs.length - 1] >= vs[0];
      return `<svg class="mx-sp" viewBox="0 0 ${W2} ${H2}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${up ? '#3dd68c' : '#ff6b6b'}" stroke-width="2.2" vector-effect="non-scaling-stroke"/></svg>`;
    }

    function render() {
      if (!box) return;
      const s = index(), sm = summary();
      const H = settings.mxHist, last = H[H.length - 1];
      const rows = settings.mxPl.map((x) => {
        const v = last && last.px[x.rid];
        const v24 = priceAt(x.rid, 24 * 3600000) || (H.length > 1 ? H[H.length - 2].px[x.rid] : null);
        return { ...x, v, d: v && v24 ? (v / v24 - 1) * 100 : null };
      });
      rows.sort((a, b) => Math.abs(b.d || 0) - Math.abs(a.d || 0) || (b.v || 0) - (a.v || 0));
      box.innerHTML = `<div class="fcpt-sgroup mx"><h4>📈 Marktindex – beliebte Spieler</h4>
        <div class="note" style="font-size:12px;color:var(--ink2)">Preise der ${settings.mxPl.length || settings.mxN} meistgesuchten Spieler auf Futbin. Start = 1.000 – steigt der Index, werden gefragte Spieler teurer (eher verkaufen), fällt er, wird der Markt billiger (eher kaufen).</div>
        <div class="mx-top">
          <div class="mx-v"><span>Index</span><b class="num">${sm ? fmt(Math.round(sm.v)) : '–'}</b></div>
          <div class="mx-d"><span>1 Std.</span><b class="${pcls(sm && sm.d1)}">${pct(sm && sm.d1)}</b></div>
          <div class="mx-d"><span>24 Std.</span><b class="${pcls(sm && sm.d24)}">${pct(sm && sm.d24)}</b></div>
          <div class="mx-d"><span>7 Tage</span><b class="${pcls(change(s, 7 * 864e5))}">${pct(change(s, 7 * 864e5))}</b></div>
        </div>
        ${spark(s)}
        <div class="mx-b"><button class="fcpt-bigbtn" data-mx="run" ${st.busy ? 'disabled' : ''}>${st.busy ? `Lade … ${st.done}/${st.total}` : '↻ Index aktualisieren'}</button>
          <button class="fcpt-smallbtn" data-mx="list" ${st.busy ? 'disabled' : ''}>Spielerliste neu von Futbin</button>
          <label class="mx-a"><input type="checkbox" data-mx="auto" ${settings.mxAuto ? 'checked' : ''}> stündlich automatisch (nur bei offenem Tool)</label></div>
        ${st.msg || last ? `<div class="fcpt-stand">${esc(st.msg || '')}${last ? `${st.msg ? ' · ' : ''}Stand ${new Date(last.t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</div>` : ''}
        ${rows.length ? `<div class="mx-l">${rows.map((r) => `<div class="mx-r"><span class="mx-n">${esc(r.name)}</span><span class="num">${r.v ? fmt(r.v) : '…'}</span><span class="${pcls(r.d)}">${pct(r.d)}</span><button class="fcpt-smallbtn" data-mxadd="${esc(r.rid)}" title="In „📋 Meine Liste“ zum Snipen">＋</button></div>`).join('')}</div>` : ''}
      </div>`;
      box.querySelector('[data-mx="run"]').addEventListener('click', (e) => { e.stopPropagation(); refresh(false); });
      box.querySelector('[data-mx="list"]').addEventListener('click', (e) => { e.stopPropagation(); refresh(true); });
      box.querySelector('[data-mx="auto"]').addEventListener('change', (e) => { e.stopPropagation(); settings.mxAuto = e.target.checked; saveSettings(); });
      box.querySelectorAll('[data-mxadd]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = rows.find((x) => x.rid === b.dataset.mxadd); if (!r) return;
        const max = r.v ? Math.floor((r.v * 0.9) / stepFor(r.v)) * stepFor(r.v) : 0;
        if (BUY.addList({ asset: Number(r.rid) % 16777216, rid: r.rid, name: r.name, rating: 0, max, fb: r.v || 0 })) showToast(`＋ ${r.name} in „Meine Liste“${max ? ` – Snipe-Preis ${fmt(max)} (10 % unter Futbin)` : ''}`);
        else showToast(`${r.name} steht schon in „Meine Liste“`);
      }));
    }
    GM_addStyle(`
      .mx-top{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:8px;margin:10px 0 6px}
      .mx-top>div{background:rgba(0,0,0,.25);border:1px solid var(--line);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:2px}
      .mx-top span{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}
      .mx-top .mx-v b{font-size:26px;color:var(--gold)}.mx-top .mx-d b{font-size:14px}
      .mx .pos{color:#3dd68c}.mx .neg{color:#ff6b6b}
      .mx-sp{width:100%;height:90px;display:block;background:rgba(0,0,0,.18);border-radius:10px;margin:4px 0 8px}
      .mx-empty{font-size:12px;color:var(--ink3);padding:10px 0}
      .mx-b{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.mx-a{font-size:12px;color:var(--ink2);display:flex;gap:6px;align-items:center}
      .mx-l{display:flex;flex-direction:column;gap:3px;margin-top:8px;max-height:420px;overflow:auto}
      .mx-r{display:grid;grid-template-columns:minmax(0,1fr) 84px 84px 30px;gap:8px;align-items:center;background:rgba(0,0,0,.2);border:1px solid var(--line);border-radius:8px;padding:4px 8px;font-size:13px}
      .mx-r>span:nth-child(2),.mx-r>span:nth-child(3){text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
      .mx-n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      @media (max-width:520px){.mx-top{grid-template-columns:1fr 1fr}}
    `);
    setInterval(() => {
      try {
        const H = settings.mxHist, last = H[H.length - 1];
        if (settings.mxAuto && !st.busy && panel.classList.contains('open') && (!last || Date.now() - last.t > 60 * 60000)) refresh(false);
      } catch (e) { /* */ }
    }, 5 * 60000);
    function mount(el) { box = el; render(); }
    return { mount, summary, refresh };
  })();
