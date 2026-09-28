import os
D=os.path.dirname(os.path.abspath(__file__))
import sys
ver=sys.argv[1]
s=open(os.path.join(D,'base.js')).read()
core=open(os.path.join(D,'sbc-core.js')).read().replace("if (typeof module !== 'undefined') module.exports = SBC;\n","")
ui=open(os.path.join(D,'sbc-ui.js')).read()
trade=open(os.path.join(D,'trade.js')).read()
watch=open(os.path.join(D,'watch.js')).read()
def rep(a,b):
    global s
    assert s.count(a)==1, a[:80]
    s=s.replace(a,b)
rep("@version      1.9.0","@version      "+ver)
rep("// @description  Zeigt für deine Transferliste","// @description  SBC-Solver, Trading-Finder, Snipe-Tastenkürzel und Preis-/Profit-Anzeige. Zeigt für deine Transferliste")
rep("  const W = unsafeWindow;\n","  const W = unsafeWindow;\n\n"+core+"\n")
rep("  function installHook() {", ui+"\n"+trade+"\n"+watch+"\n  function installHook() {")
# Trading-Tab
rep("""<div class="fcpt-tabs"><button data-tab="list" class="on">Transferliste</button><button data-tab="hist">Historie</button><button data-tab="settings">⚙ Einstellungen</button></div>""",
    """<div class="fcpt-tabs"><button data-tab="list" class="on">Transferliste</button><button data-tab="hist">Historie</button><button data-tab="trade">📈 Trading</button><button data-tab="settings" title="Einstellungen">⚙</button></div>""")
rep("""    <div class="fcpt-list"><div class="fcpt-msg">Klicke auf ↻, um deine Transferliste zu laden.</div></div>`;""",
    """    <div class="fcpt-trade"></div>
    <div class="fcpt-list"><div class="fcpt-msg">Klicke auf ↻, um deine Transferliste zu laden.</div></div>`;""")
rep("""    #fcpt-panel.v-settings .fcpt-settings{display:flex}""","""    #fcpt-panel.v-settings .fcpt-settings{display:flex}
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
    .cv-bar{height:8px;background:var(--bg3);border-radius:4px;overflow:hidden}.cv-bar i{display:block;height:100%;background:#f5c518;border-radius:4px}""")
rep("""      panel.classList.toggle('v-hist', tab === 'hist');
      if (tab === 'settings') return;""","""      panel.classList.toggle('v-hist', tab === 'hist');
      panel.classList.toggle('v-trade', tab === 'trade');
      if (tab === 'settings') return;
      if (tab === 'trade') { const tr = panel.querySelector('.fcpt-trade'); if (!tr.__mounted) { TRADE.mount(tr); tr.__mounted = true; } return; }""")
rep("""  function render() {
    if (view === 'settings') return;""","""  function render() {
    if (view === 'settings' || view === 'trade') return;""")

# --- Futbin-Sperren (403/429) sauber behandeln + Pause fuer alle Futbin-Abrufe ---
rep("""          if (r.status < 200 || r.status >= 300) return reject(new Error('HTTP ' + r.status));""",
"""          if (r.status === 429 && /futbin\\.com/.test(url)) {
            futbinBlockedUntil = Date.now() + 5 * 60000;   // echte Drosselung -> 5 Min. Pause
            return reject(new Error(BLOCK_MSG));
          }
          if (r.status === 403 && /futbin\\.com/.test(url)) {
            futbinBlockedUntil = Date.now() + 60000;       // Sicherheitsprüfung -> nur kurz pausieren
            return reject(new Error(CHECK_MSG));
          }
          if (r.status < 200 || r.status >= 300) return reject(new Error('HTTP ' + r.status));""")
rep("""  function gmGet(url, type = 'json') {""","""  let futbinBlockedUntil = 0;
  const BLOCK_MSG = 'Futbin bremst gerade (zu viele Abrufe). Bitte 5–10 Min. warten.';
  const CHECK_MSG = 'Futbin hat die Anfrage abgelehnt (Sicherheitsprüfung). Öffne futbin.com einmal in diesem Browser – am iPhone in Safari –, bestätige ggf. die Prüfung und versuch es dann erneut.';
  const isFutbinBlock = (e) => !!e && (e.message === BLOCK_MSG || e.message === CHECK_MSG);
  const futbinBlocked = () => Date.now() < futbinBlockedUntil;
  function gmGet(url, type = 'json') {
    if (/futbin\\.com/.test(url) && futbinBlocked()) return Promise.reject(new Error(BLOCK_MSG));""")


# --- EA-Durchschnittspreis als zweite Quelle (kann nicht von Futbin gesperrt werden) ---
rep("""    sources: { futbin: true },""","""    sources: { futbin: true, ea: true },""")
rep("""  settings.mainSource = 'futbin';""","""  settings.mainSource = 'futbin';
  if (settings.sources.ea === undefined) settings.sources.ea = true;""")
rep("""  const SOURCES = {
    futbin: {""","""  const SOURCES = {
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
    futbin: {""")


# --- Trade-Tracker: automatisch erfasste Kaufpreise + Break-even ---
rep("""  const manualBought = GM_getValue(BOUGHT_KEY, {});""","""  const manualBought = GM_getValue(BOUGHT_KEY, {});
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
  }""")
rep("""      const bought = manual || toNum(it.lastSalePrice);""","""      const autoB = it.id != null ? toNum(autoBought[it.id]) : null;
      const bought = manual || autoB || toNum(it.lastSalePrice);""")
rep("""        boughtManual: !!manual,""","""        boughtManual: !!manual,
        boughtAuto: !manual && !!autoB,""")
rep("""  const afterTax = (n) => Math.floor(n * (1 - CONFIG.taxRate));""","""  const afterTax = (n) => Math.floor(n * (1 - CONFIG.taxRate));
  // Mindest-Verkaufspreis ohne Verlust (nach Steuer), auf gültige EA-Preisstufe aufgerundet
  const breakEven = (b) => {
    const v = Math.ceil(b / (1 - CONFIG.taxRate));
    const st = v < 1000 ? 50 : v < 10000 ? 100 : v < 50000 ? 250 : v < 100000 ? 500 : 1000;
    return Math.ceil(v / st) * st;
  };""")
rep("""${p.boughtManual ? ' (manuell)' : ''} ✎</button>`;""","""${p.boughtManual ? ' (manuell)' : p.boughtAuto ? ' (erfasst)' : ''} ✎</button>`;
    const beChip = !p.sold && p.bought ? `<span class="fcpt-chip be" title="Mindestpreis, damit du nach 5 % Steuer keinen Verlust machst">Ohne Verlust ab <b>${fmt(breakEven(p.bought))}</b></span>` : '';""")
rep("""        <div class="fcpt-chips">${boughtChip}<span""","""        <div class="fcpt-chips">${boughtChip}${beChip}<span""")
rep("""        (!isMarket ? listingWarn(p, main) : '') + (isMarket && p.active ? bidChip(p) : '');""","""        (!isMarket ? listingWarn(p, main) : '') + (isMarket && p.active ? bidChip(p) : '') +
        (!isMarket && p.isPlayer && p.bought && !p.sold ? `<span class="fcpt-chip be">Ohne Verlust ab <b>${fmt(breakEven(p.bought))}</b></span>` : '') +
        (isMarket && p.isPlayer ? WATCH.marketChip(p, root) : '');""")
rep("""    root.classList.remove('fcpt-bargain', 'fcpt-good', 'fcpt-bad', 'fcpt-meh');""","""    root.classList.remove('fcpt-bargain', 'fcpt-good', 'fcpt-bad', 'fcpt-meh', 'fcpt-watchhit');""")
rep("""    setText(hint, `${p.name}: Start ${fmt(start)} · Sofortkauf ${fmt(bin)}` + (prof != null ? ` · Profit ${signed(prof)}` : ''));""",
"""    setText(hint, `${p.name}: Start ${fmt(start)} · Sofortkauf ${fmt(bin)}` + (prof != null ? ` · Profit ${signed(prof)}` : '') +
      (p.bought && bin < breakEven(p.bought) ? ` · ⚠ unter „ohne Verlust“ (${fmt(breakEven(p.bought))})` : ''));""")
rep("""    .fcpt-inline .fcpt-chip.deal{""","""    .fcpt-chip.be{background:#1d2a44;color:#bfdbfe}
    .fcpt-chip.watch{background:#6d28d9;color:#fff;font-weight:700}
    .fcpt-watchhit{outline:3px solid #a855f7 !important;outline-offset:-3px;border-radius:6px}
    .tc-star{background:none;border:0;color:#f5c518;font-size:20px;cursor:pointer;padding:0 2px;line-height:1;flex:none}
    .tc-star:not(.on){color:#7d8aa0}.tc-star:hover{color:#f5c518}
    .wl-row{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;background:var(--bg3);border-radius:8px;padding:6px 8px;border-left:3px solid transparent}
    .wl-row.hit{border-left-color:#a855f7;background:rgba(168,85,247,.12)}
    .wl-name b{display:block;font-size:13px}.wl-name small{font-size:11px;color:var(--ink3)}
    .wl-t{font-size:11px;color:var(--ink3);display:flex;align-items:center;gap:4px}
    .wl-t input{width:84px !important}
    .wl-x{background:none;border:1px solid var(--line);color:var(--ink2);border-radius:6px;cursor:pointer;padding:2px 7px}
    .wl-x:hover{border-color:#ef4444;color:#fca5a5}
    .fcpt-smallbtn{background:var(--bg3);border:1px solid var(--line);color:var(--ink2);border-radius:8px;padding:6px 10px;font:12px system-ui,sans-serif;cursor:pointer}
    .fcpt-inline .fcpt-chip.deal{""")


# --- Versionsanzeige ---
rep("""          <div><div class="t">FC27 Preis-Tool</div><div class="fcpt-stand"></div></div></div>""",
"""          <div><div class="t">FC27 Preis-Tool <span class="fcpt-ver" title="Installierte Version">v${TOOL_VERSION}</span></div><div class="fcpt-stand"></div></div></div>""")
rep("""  const W = unsafeWindow;""","""  const W = unsafeWindow;
  const TOOL_VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '?';""")
rep("""    .fcpt-brand .t{font-weight:800;font-size:15px;letter-spacing:.2px}""","""    .fcpt-brand .t{font-weight:800;font-size:15px;letter-spacing:.2px}
    .fcpt-ver{display:inline-block;margin-left:6px;font-size:10.5px;font-weight:700;color:#1a1300;background:#f5c518;border-radius:999px;padding:1px 7px;vertical-align:middle}""")


# --- Automatische Updates über GitHub ---
rep("""// @run-at       document-idle""","""// @run-at       document-idle
// @homepageURL  https://github.com/windowsfenster226/fc27-tool
// @updateURL    https://raw.githubusercontent.com/windowsfenster226/fc27-tool/main/fc27-preis-tool.user.js
// @downloadURL  https://raw.githubusercontent.com/windowsfenster226/fc27-tool/main/fc27-preis-tool.user.js""")

open(os.path.join(D,'..','fc27-preis-tool.user.js'),'w').write(s)
print('built', ver)
