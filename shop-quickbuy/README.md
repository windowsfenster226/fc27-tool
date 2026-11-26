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
- 3.19.4: Discord-Bot sendet eine Bot-Kennung (User-Agent) mit – behebt Discord-Fehler 40333.
- 3.19.5: Amazon-Verkäufer richtig erkannt: „Verkauft und versandt von Amazon“ = Amazon; Business-Angebote „Verkauft … von Amazon. Versandt und bezogen von <Händler>“ = Händler (nicht kaufen); Amazon Retourenkauf/Seconde main zählt nicht als Amazon.
- 3.19.6: HTTP 429 (zu viele Abrufe) im Prüf-Zentrum → kein Kontroll-Tab mehr, sondern 2–15 Min. Pause für MediaMarkt+Saturn und Captcha-Bremse.
- 3.19.7: FNAC Pro – Lagerstatus aus „availabilityType“ der Seite (JSON-LD meldete bei „Bientôt en stock“ fälschlich verfügbar → Tab ging alle paar Minuten auf).
- 3.19.8: Klarere Meldung, wenn bei Prüf-Zentrum-Shops ein Treffer-/Kontroll-Tab hängt (statt „schlafen gelegt“).
- 3.19.9: Wächter erkennt Tabs, die leben, aber nicht prüfen (z. B. alter Amazon-Tab) → nach 5 Min. Neustart, danach Ersatz-Tab (der Vorrang hat; alter Tab beendet sich).
- 3.19.10: Ist die Produktseite kaufbar, der alte Warenkorb-Eintrag aber „nicht verfügbar“ (MediaMarkt: „Bitte entferne das Produkt …“), wird der Eintrag entfernt und sofort neu hinzugefügt.

## Neu in 3.20.0 – ⭐ Priorität
- In der Produkttabelle (Übersicht) per Klick auf ☆ markieren: ⭐-Produkte werden 3× so oft geprüft wie die anderen – bei gleicher Gesamtzahl an Abrufen (kein zusätzliches Captcha-Risiko). Gilt fürs Prüf-Zentrum und für Shops mit eigenem Tab (z. B. Amazon).
- „📋 Mehrere“: `⭐` oder `prio` in der Zeile setzt die Priorität direkt.
- 3.21.0: Spalte „Gefunden“ in der Produkttabelle – wie oft war das Produkt in den letzten 30 Tagen verfügbar (je Restock einmal), dazu wie oft nur teurer, und wann zuletzt. Zählt jetzt auch Funde des Prüf-Zentrums; Fehlalarme werden wieder herausgenommen.
- 3.22.0: 🔥 Auto-Priorität – Produkte, die in letzter Zeit öfter verfügbar waren (bzw. um die aktuelle Uhrzeit schon öfter kamen), werden automatisch 2–3× so oft geprüft. Manuelles ⭐ hat Vorrang. Abschaltbar unter Einstellungen.
- 3.22.1: Treffer-Tab öffnet sich im Vordergrund (MediaMarkt/Saturn bauen den Warenkorb im Hintergrund-Tab nicht fertig → „Warenkorb lädt nicht“). Vom Script geöffnete Treffer-Tabs schließen sich danach wieder. Abschaltbar unter Einstellungen.

## Neu in 3.23.0
- **📊 Tageszusammenfassung** an Discord (Standard 23:00, Einstellungen): je Shop Prüfungen, Restocks (+ zu teuer), Käufe, Probleme, Warnung wenn ein Shop > 1 Std. nicht geprüft hat; dazu die Produkte, die heute verfügbar waren. Knopf „Jetzt senden“, Discord-Befehl `!zusammenfassung`.
- **`!test <shop|alle>`** in Discord: prüft alle Produkte sofort (Prüf-Zentrum-Shops und Amazon inkl. Verkäufer) und antwortet mit dem Ergebnis.
- **Warenkorb aufräumen:** Liegt das Zielprodukt nicht kaufbar im Warenkorb (z. B. nach einem verpassten Restock), wird der Eintrag entfernt; beim nächsten Restock legt das Tool es frisch hinein. Abschaltbar.

## Neu in 3.29.1
- Amazon-Produkte, die nicht in der eingetragenen Wunschliste stehen, bekommen im Dashboard den Hinweis „fehlt in Wunschliste“ (Link zur Produktseite → „Auf die Liste“ → QuickBuy).
- PlayStation-Sammelabfrage untersucht (26.11.): Kaufbutton wird je Produktseite serverseitig gerendert, keine Übersichtsseite mit Status mehrerer Produkte → nicht umgesetzt.

## Neu in 3.29.0 – Amazon-Sammelabfrage über eine Wunschliste
- Einstellungen → „📋 Amazon-Wunschliste“: Link einer Liste mit allen Amazon-Produkten eintragen. Ein Abruf liefert für alle Artikel den Preis im Kaufkasten (`data-price`, „-Infinity“ = kein Angebot; live geprüft 26.11.: 21/21 Artikel, 4× gleich).
- Kein Angebot oder deutlich über dem Höchstpreis → ausverkauft. Preis ≤ Höchstpreis → Gegenprüfung über die Angebotsliste (Versand + Verkauf durch Amazon) und Produktseite.
- Mit Wunschliste prüft Amazon alle Produkte gemeinsam alle 10–15 s (vorher je Produkt ca. alle 85 s). Produkte, die nicht in der Liste stehen, werden einzeln geprüft (nach 1 Std. neuer Versuch).
- Die Liste muss im selben Amazon-Konto liegen, das in Chrome angemeldet ist.

## Neu in 3.28.0 – Leichter Amazon-Abruf
- Das Prüf-Zentrum fragt bei Amazon zuerst die kleine Angebotsliste ab („aodAjaxMain“, 9–130 KB statt 2–2,5 MB Produktseite, live geprüft 26.11.). Maßgeblich ist das Angebot im Kaufkasten: nur „Versand Amazon“ + „Verkäufer Amazon“ zählt als verfügbar.
- Treffer werden mit der ganzen Produktseite gegengeprüft (Kaufkasten, Preis). Liefert die Angebotsliste 5× nichts Lesbares, nutzt das Tool 1 Std. wieder die ganze Produktseite.
- Abschaltbar in den Einstellungen („⚡ Amazon: leichter Abruf“).

## Neu in 3.27.0 – Zeitmessung & täglicher Startklar-Check
- ⏱ Zeitmessung: Nach jedem Kauf (oder wenn die Kasse für die Bestätigung bereitsteht) eine Zeile im Log, z. B. „Treffer (Prüf-Zentrum) → Produktseite verfügbar 1,8 s → im Warenkorb 3,1 s → zur Kasse 4,0 s → Bestellen geklickt 9,2 s → bestellt 11,5 s“.
- 🚦 Täglicher Startklar-Check (Standard 08:00, einstellbar): prüft für alle gestarteten Shops Anmeldung, fremde Artikel im Warenkorb und den Abruf und meldet das Ergebnis an Discord. Läuft nur im Zeitfenster bis 2 Std. nach der eingestellten Uhrzeit und nie während eines Kaufs.
- Zwischenspeicher geprüft (26.11.): PlayStation, Amazon, FNAC Pro, Microsoft, Galaxus, Alternate liefern frische Seiten – nur MediaMarkt/Saturn brauchten die Cache-Umgehung (3.26.0).
- Amazon-Sammelabfrage über die Suche getestet und verworfen: liefert je nach ASIN-Kombination unzuverlässige Treffer.

## Neu in 3.26.0 – Sammelabfrage MediaMarkt/Saturn
- Eine Kategorieseite (z. B. „PS5 Konsolen“) liefert den Lagerstatus aller ihrer Produkte (`CofrOnlineStatusFeature`, live geprüft 26.11.) → **1 Anfrage statt 1 je Produkt**. Die Kategorie lernt das Tool automatisch aus der Brotkrumen-Navigation der Produktseite; Produkte, die nicht auf Seite 1 der Kategorie stehen, werden weiter einzeln geprüft.
- Treffer aus der Sammelabfrage werden vor dem Öffnen auf der Produktseite gegengeprüft (Preis + Bestätigung).
- **Cache-Umgehung:** MediaMarkt/Saturn liefern Seiten bis zu 2 Min. aus dem Cloudflare-Cache. Abrufe und Treffer-Tabs umgehen den Cache jetzt (frischer Stand, weniger Fehlalarme).
- Abruf-Limit MediaMarkt+Saturn zählt jetzt Anfragen statt Produkte.
- `!muster`: „1 Tag“ statt „1 Tage“.

## Neu in 3.25.0 – Restock-Muster
- Statistik-Tab: Tabelle „Restock-Muster je Shop“ (letzte 60 Tage, gezählt nach Tagen) mit typischen Wochentagen und Uhrzeit, z. B. „meist Do 09–11 Uhr“. Fehlalarme zählen nicht.
- ⏰ Vorwarnung: 15 Min. vor einem typischen Restock-Fenster (an mind. 2 verschiedenen Tagen gleiche Wochentag+Stunde) kommt eine Discord-Nachricht – je Fenster 1× am Tag, nur für gestartete Shops. Abschaltbar in den Einstellungen.
- Discord: `!muster` (alle Shops) bzw. `!muster saturn`.

## Neu in 3.24.3 – Fix
- Behoben (seit 3.24.1): der neue Prüfstand für `!test` nutzte denselben Speicher-Schlüssel wie der Takt des Prüf-Zentrums → gelegentlich ein Abruf zu früh. Jetzt eigener Schlüssel.
- Treffer-Tab schließt sich wieder: Im Log steht jetzt, warum (z. B. „Shop-Seite: nicht kaufbar – …“).

## Neu in 3.24.2 – Prüf-Zentrum sparsamer
- JSON-LD-Lagerstatus (Microsoft, Alternate, Galaxus u. a.) per Regex statt kompletter DOM-Aufbau der Seite → weniger CPU im Dashboard.
- Letzter Prüfstand je Produkt bleibt im Speicher und wird nur alle 30 s gesichert.

## Neu in 3.24.1 – `!test` ohne Nebenwirkungen
- `!test alle` prüft nur gestartete Shops (gestoppte wie Otto werden übersprungen, einzeln weiter mit `!test otto`).
- MediaMarkt/Saturn: `!test` nimmt den frischen Stand des Prüf-Zentrums (≤ 5 Min.) statt neu abzurufen → keine zusätzlichen HTTP 429. Läuft gerade eine 429-Pause, wird nicht extra abgerufen.
- Alternate: aus dem Sortiment genommene Artikel („Der Artikel ist zur Zeit leider nicht verfügbar“) zählen als ausverkauft statt „Lagerstatus nicht lesbar“.

## Neu in 3.24.0 – weniger CPU & Speicher
- **Amazon im Prüf-Zentrum:** Produktseiten werden nur noch als Text abgerufen (Warenkorb-Button + Verkäufer = Amazon, Preis inkl. MwSt.), statt jede Seite komplett zu laden. Live geprüft (Amazon-Artikel = verfügbar, Business-Händlerangebote = nicht). Eigenes Limit 15 Abrufe/Min.
- **Dashboard zeichnet nur noch neu, wenn sich etwas Wichtiges ändert** (sonst alle 10 s) statt alle 1,5 s.
- Einzelne Abruf-Fehler öffnen keinen Tab mehr; erst beim 2. Mal hintereinander einen Kontroll-Tab im Hintergrund.
- Behoben: Selbsttest/täglicher Bericht brach seit dem Prüf-Zentrum ab.
