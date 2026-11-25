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

## Neu in 3.13.0 – Steuerung per Discord

Eigener Discord-Bot, das Dashboard liest einen Kanal mit und führt Befehle aus (`!status`, `!start`, `!stop`, `!add`, `!max`, `!entfernen`, `!auto`, `!zahlung`, `!drop`, `!pause`, `!budget`, `!heute`, `!log`, `!radar`, `!selbsttest`, `!hilfe`). Kritische Änderungen (Auto-Bestellung an, Budget erhöhen, Start mit Auto-Bestellung) brauchen `!ja`. Nur eingetragene Nutzer-IDs dürfen steuern; der Bot-Token bleibt im Browser und ist nicht im Backup.

## Neu in 3.14.0 – Amazon-Kaufprozess

Amazon bestellt jetzt wie die anderen Shops (live geprüft bis vor „Jetzt kaufen“): nur „In den Einkaufswagen“ (nie 1-Click), nur „Verkauf durch Amazon“, Preis immer inkl. MwSt. (auch bei Business-Konten), Zwischenseiten werden übersprungen, Höchstpreis wird auf Produktseite, im Einkaufswagen und bei der Gesamtsumme geprüft.

## Neu in 3.16.0 – Captcha-Schutz & schlafende Tabs
- **MediaMarkt + Saturn teilen sich ein Abruf-Limit** (Standard 4 Abrufe/Min zusammen, im Dashboard unter Einstellungen → Captcha-Schutz änderbar).
- **Captcha-Bremse:** nach jedem Captcha prüft der Shop dauerhaft langsamer (× 1,5 → × 2 → × 3), je 24 Std. ohne Captcha eine Stufe zurück.
- Abrufe einer Runde werden gleichmäßig verteilt statt direkt hintereinander.
- **Schlafende Tabs** werden erkannt (Protokoll + Discord), Anleitung für Chrome/Edge im Dashboard; der Tab-Wächter greift nach 2,5 statt 5 Min.
- Läuft ein Shop schon in einem anderen Tab, wartet ein zweiter Tab und übernimmt nur, wenn der erste ausfällt (kein doppeltes Prüfen mehr).
- 3.16.1: Doppelte Shop-Tabs (z. B. nach nächtlichem Standby) schließen sich selbst; nur ein Tab prüft pro Shop. Tab-Wächter wartet nach dem Aufwachen 90 s, bevor er Tabs neu öffnet.

## Neu in 3.17.0 – Prüf-Zentrum & Startklar-Check
- **Prüf-Zentrum:** Nur noch das Dashboard prüft (Otto, MediaMarkt, Saturn, PlayStation, Microsoft, FNAC) im Hintergrund. Ein Shop-Tab öffnet sich erst bei einem Treffer, legt in den Warenkorb, geht zur Kasse und schließt sich danach. Ein Shop-Tab, den du selbst offen lässt, dient als Bereitschafts-Tab (übernimmt Treffer ohne Öffnen). Amazon und Drop-Modus prüfen weiter im eigenen Tab. Klappt der zentrale Abruf 3× nicht, prüft der Shop 6 Std. wieder im eigenen Tab. Abschaltbar unter Einstellungen.
- **Startklar-Check** (Einstellungen): prüft je Shop den zentralen Abruf, die Anmeldung und fremde Artikel im Warenkorb – ohne etwas zu ändern.
- Das Dashboard (example.com) sollte im Browser auf „immer aktiv“ stehen.
- 3.17.1: Shop-Domains als @connect eingetragen → keine Tampermonkey-Rückfrage mehr beim Prüf-Zentrum.
- 3.17.2: Prüf-Zentrum wiederholt bei HTTP 400/431 ohne Cookies (Otto) und merkt sich das je Shop.
- 3.17.3: FNAC Pro im Prüf-Zentrum (JSON-LD, live geprüft) und im Startklar-Check (Warenkorb auf secure.fnacpro.com). Kasse bei FNAC weiterhin nur Alarm.

## Neu in 3.18.0
- **FNAC Pro: automatische Kasse** bis zur Zahlungsseite (Warenkorb → Lieferung → Zahlung, live getestet). Dort wählt das Script „Carte bancaire“ und hält an – Karte eingeben und „Payer“ machst du (das Script gibt nie Kartendaten ein). Ein nicht lieferbarer Artikel im Warenkorb blockiert bei FNAC die Kasse → klare Meldung.
- **📋 Mehrere Produkte auf einmal** einfügen (Übersicht → „Mehrere“): je Zeile Link + optional Höchstpreis + Stückzahl, auch aus Excel kopierbar; vorhandene Produkte können dabei aktualisiert werden.
- 3.18.1: PlayStation – Lagerstatus aus dem Kauf-Bereich der Seite statt JSON-LD (JSON-LD meldete fälschlich „InStock“ → Tab ging jede Runde auf). Fehlalarm-Schutz: meldet der Abruf 2× „verfügbar“, die Shop-Seite aber nicht, wird 10 Min. nur noch jede 5. Runde nachgesehen.
- 3.19.0: Amazon.fr (auch englische/französische Oberfläche) – Prüfung, Verkäufer-Erkennung (inkl. Ausschluss „Amazon Seconde main“), Warenkorb, Kasse. Neuer Tab bekommt nach „Starten“ 2,5 Min. Schonfrist (kein doppelter Tab mehr).
- 3.19.1: Amazon wieder nur amazon.de. Links anderer Amazon-Länder (amazon.fr, .it, .co.uk …) werden beim Einfügen und einmal beim Dashboard-Start automatisch auf amazon.de/dp/<ASIN> umgestellt.
- 3.19.2: Veralteter Captcha-Status wird gelöscht, sobald der Abruf wieder klappt (FNAC blieb sonst auf „Captcha“ stehen).
- 3.19.3: „Verbindung testen“ (Discord-Bot) übernimmt die richtige Kanal-ID automatisch aus dem Webhook und sagt, ob der Bot auf dem richtigen Server ist.
