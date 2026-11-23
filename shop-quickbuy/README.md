# Shop QuickBuy

Tampermonkey-Userscript: Restock-Überwachung und Schnell-Checkout für Otto, MediaMarkt, Saturn, Microsoft Store, PlayStation, Amazon (Alarm), FNAC Pro, Alternate, Cyberport, notebooksbilliger, Galaxus, Proshop, Euronics, expert, Müller, Smyths Toys, Kaufland, Lidl, GameStop, Zalando/Nike/Snipes/Solebox (Alarm) und alle Shopify-Shops – mit Gesamt-Dashboard.

## Installation / Updates

1. Tampermonkey installieren.
2. Diese Adresse im Browser öffnen und in Tampermonkey auf **Installieren** klicken:
   https://raw.githubusercontent.com/windowsfenster226/fc27-tool/quickbuy/shop-quickbuy/shop-quickbuy.user.js
3. Updates holt Tampermonkey danach automatisch, sobald hier eine neue Version liegt.

Einstellungen, Produkte, Kaufhistorie und Discord-Webhook werden nur lokal im Browser gespeichert, nicht in diesem Repository.

## Neu in 3.11.0

- **Warteschlange (Queue-it / Warteraum):** wird erkannt, die Seite wird nicht neu geladen, Discord-Meldung beim Eintritt und wenn du durch bist.
- **Login-Prüfung:** warnt, wenn du in einem Shop vermutlich abgemeldet bist (pro Shop abschaltbar).
- **Tagesbudget:** Obergrenze für alle automatischen Bestellungen zusammen pro Tag.
- **Selbsttest:** meldet, wenn eine Produktseite nicht mehr erkannt wird; täglicher Bericht an Discord.
- **Fremde Artikel im Warenkorb:** optional automatisch entfernen (MediaMarkt/Saturn), sonst Stopp bzw. Warnung.
- **Tab-Wächter:** Das Dashboard öffnet Shop-Tabs neu, die 5 Min. nicht reagieren.
- **Radar:** überwacht Such-/Kategorieseiten auf neu gelistete Produkte.
- **Statistik:** Restocks nach Wochentag und Uhrzeit.
- **CSV-Export** der Bestellungen inkl. Bestellnummer.
