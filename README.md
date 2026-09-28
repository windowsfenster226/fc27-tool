# fc27-tool

Userscript für die EA SPORTS FC 27 Web App (Tampermonkey): Preis- & Profit-Anzeige, Trading-Finder, Watchlist, SBC-Solver, Snipe-Tastenkürzel.

**Installieren / Aktualisieren:** [fc27-preis-tool.user.js](https://raw.githubusercontent.com/windowsfenster226/fc27-tool/main/fc27-preis-tool.user.js) öffnen → in Tampermonkey „Installieren“.

Updates kommen danach automatisch über Tampermonkey.

## Entwicklung
`src/` enthält die Bausteine. Neu bauen: `python3 src/build.py <version>` → schreibt `fc27-preis-tool.user.js`. Tests des SBC-Solvers: `node src/test.js`.
