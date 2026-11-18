# BOS Funktrainer 📻

Ein Trainingssimulator für den **BOS-Sprechfunk** mit Fokus auf den THW-Einsatzdienst. Er läuft auf **macOS und Windows**.

Gegenstellen wie Zugtrupp und Leitstelle rufen dich per Sprachausgabe an. Du antwortest wie in echt **über das Mikrofon und die Sprechtaste** eines simulierten Handfunkgeräts. Jede Sendung wird laufend nach den Regeln der Sprechfunk-Dienstvorschrift bewertet.

## Installation (2 Minuten)

### Windows
1. **[BOS-Funktrainer-Setup.exe herunterladen](https://github.com/Joka238/Funktrainer/releases/latest/download/BOS-Funktrainer-Setup.exe)**
2. Doppelklick auf die Datei. Falls Windows „Der Computer wurde durch Windows geschützt“ meldet: **Weitere Informationen → Trotzdem ausführen**.
3. Fertig – der Funktrainer startet automatisch und liegt danach auf dem Desktop und im Startmenü.

Keine Installation gewünscht? Die [portable Version](https://github.com/Joka238/Funktrainer/releases/latest/download/BOS-Funktrainer-Portable.exe) läuft direkt, z. B. vom USB-Stick.

### macOS (Apple Silicon & Intel) – empfohlen: ein Befehl, keine Warnung
1. **Terminal** öffnen: ⌘ + Leertaste drücken, „Terminal“ eingeben, Enter.
2. Diese Zeile hineinkopieren und Enter drücken:

   ```bash
   curl -fsSL https://github.com/Joka238/Funktrainer/releases/latest/download/install-mac.sh | bash
   ```

3. Fertig – der Funktrainer wird heruntergeladen, in „Programme“ installiert und gestartet. Keine Apple-Warnung, keine Systemeinstellungen.
   Für ein Update einfach denselben Befehl nochmal ausführen.

<details>
<summary>Alternative: DMG-Datei herunterladen</summary>

1. [BOS-Funktrainer.dmg herunterladen](https://github.com/Joka238/Funktrainer/releases/latest/download/BOS-Funktrainer.dmg), öffnen und die App in „Programme“ ziehen.
2. Beim ersten Start erscheint „Apple konnte nicht überprüfen …“, weil die App nicht kostenpflichtig bei Apple registriert ist: **Fertig** klicken → **Systemeinstellungen → Datenschutz & Sicherheit** → ganz unten **Dennoch öffnen**. Nur einmal nötig.

</details>

### Updates
In der App unter **Einstellungen → Nach Updates suchen**: Die neue Version wird mit einem Klick heruntergeladen, installiert und die App startet neu (Mac und Windows-Installer; die portable Windows-Version öffnet die Download-Seite). Beim Start prüft die App außerdem still, ob es ein Update gibt, und weist dann darauf hin.

**Privates Repository:** Solange das Repository privat ist, braucht die App für Updates einen persönlichen GitHub-Zugangsschlüssel (nur Lesen). Einrichten unter *Einstellungen → Updates → Zugang für privates Repository* – dort steht eine Schritt-für-Schritt-Anleitung mit vorausgefülltem Link. Der Schlüssel wird verschlüsselt nur auf dem eigenen Rechner gespeichert.

### Beim ersten Start
- **Mikrofon erlauben**, wenn gefragt wird.
- Das **Sprachmodell ist bereits enthalten** – die Spracherkennung funktioniert sofort und komplett offline.
- Der Funktrainer bietet dir das **Tutorial** an – empfohlen, auch wenn du schon länger funkst.
- Eine **deutsche Systemstimme** ist auf macOS („Anna“) und deutschem Windows („Hedda“/„Katja“) vorinstalliert. Falls nicht: unter Windows *Einstellungen → Zeit und Sprache → Sprache → Deutsch → Sprachausgabe* hinzufügen.
- Tipp: Ein **Headset** verbessert die Spracherkennung deutlich.

## Funktionen

- **Tutorial mit Ausbilder:** 6 kurze Lektionen führen Schritt für Schritt durch Gerätebedienung, Anruf, Meldung, Wiederholen/Warten, Buchstabieren und Lagemeldung. Erklärung → Beispiel → sofort selbst am Gerät ausprobieren. Das jeweils benötigte Bedienelement wird am Funkgerät hervorgehoben, und Fehler werden direkt erklärt und so lange wiederholt, bis es klappt.
- **Simuliertes Handfunkgerät (HRT)** mit Display und Ein-/Ausschalter. Gesprächsgruppe wählst du per Drehknopf oder ◀ ▶, außerdem gibt es Lautstärke, Statustasten (Ziffer + ✓), Notruftaste, Sende-/Empfangs-LED und eine Pegelanzeige beim Senden.
- **Sprechtaste:** PTT-Knopf am Gerät gedrückt halten oder die **Leertaste**. Im Digitalfunk-Modus ertönt ein Sendeerlaubniston.
- **Sprachausgabe** der Gegenstellen über die Systemstimmen von macOS bzw. Windows. Mehrere Stationen haben unterschiedliche Stimmlagen.
- **Offline-Spracherkennung** (Whisper) läuft lokal auf deinem Rechner, nichts wird in die Cloud geschickt.
- **Funkatmosphäre:** Digitalfunk (TETRA) mit Sendeerlaubnis-/Besetzt-/Statustönen oder Analogfunk mit Rauschen und Rauschfahne. Dazu gibt es gestörte Übertragungen.
- **Live-Bewertung** jeder Sendung (0–100 Punkte) mit konkreten Hinweisen und Musterlösung.
- **Funkprotokoll** mit optionalem „Mitlesen“. Standardmäßig ist es aus, damit du hörend trainierst.
- **Fremdverkehr:** Auf dem Kanal funken auch andere Einheiten (Zugtrupp, Fachgruppen, Nachbar-OV mit ähnlichem Rufnamen, Feuerwehr und Rettungsdienst bei der Leitstelle). Du musst Gespräche abwarten und darfst nur auf deinen eigenen Rufnamen reagieren. Menge einstellbar: Aus / Wenig / Normal / Viel.
- **Statusmeldungen optional:** Wer keine Status üben will, schaltet sie in den Einstellungen ab – alle Status-Aufgaben entfallen dann.
- **Statistik** mit Verlauf, Bestwerten und deinen häufigsten Fehlern.
- **Merkblatt** mit Gesprächsablauf, Betriebsworten, Statustabelle und Buchstabiertafel (DIN 5009 neu/traditionell und NATO).
- **Texteingabe als Alternative**, falls kein Mikrofon verfügbar ist.

### Übungen

| Übung | Inhalt |
|---|---|
| Einsatzauftrag empfangen | Anruf beantworten, Auftrag mit Wiederholung der Eckdaten quittieren |
| Eintreffen melden | Status 4 setzen, Zugtrupp anrufen, Eintreffen melden, Gespräch beenden |
| Lagemeldung abgeben | Erkundungsergebnis vollständig und knapp übermitteln (wechselnde Lagen) |
| Nachforderung | Material mit Menge, Art und Ort nachfordern |
| Buchstabieren | Schwierige Namen nach DIN 5009 buchstabieren |
| Verstümmelte Nachricht | Gestörte Sendung erkennen und „Wiederholen“ anfordern statt raten |
| Funkprobe | Funkprobe durchführen und beantworten |
| Leitstelle: „Warten“ | „Warten“ einhalten, bis man gerufen wird |
| Status & Sprechwunsch | Status 3/4/5 setzen, auf Sprechaufforderung „J“ reagieren |
| Hörbereitschaft & Fremdverkehr | Nicht auf fremde Anrufe reagieren (Vorsicht bei ähnlichen Rufnamen!) |
| Einsatzende & Einrücken | Auftrag quittieren, Status 1 und 2 |
| Erkundung mit Rückfragen | Erstmeldung und drei Rückfragen des Zugtrupps (Personen, Statik, Dauer/Bedarf) |
| Stärkemeldung & Abmarsch | Stärke 0/1/7/8 melden, Auftrag und Abmarschzeit, Abmarsch melden |
| Marsch zum Einsatzort | Marschauftrag, Kontrollpunkt, Stau mit Umleitung, Ankunft – drei Gespräche |
| Unfall eines Helfers | Notfallmeldung, Rückfragen zu Zustand und Zufahrt, Einweiser stellen |
| Alarmierung durch die Leitstelle | Einsatzauftrag aufnehmen, Ausrücken und Eintreffen per Sprechfunk melden |
| **Einsatzdienst (Zufall)** | Vier zufällige Übungen hintereinander |

Rufnamen, Orte, Adressen und Lagen werden bei jedem Durchlauf zufällig erzeugt. So lernst du keine festen Antworten auswendig.

**Eigener Ortsverband:** Unter *Einstellungen → Ortsverband* trägst du deinen OV ein (z. B. „Bad Kreuznach“) – dann funkst du in allen Übungen, im freien Modus und im Tutorial als „Heros Bad Kreuznach …“. Optional bekommt die Leitstelle einen eigenen Ort (z. B. „Florian Main-Kinzig“). Leer lassen = zufälliger Ort wie bisher.

### Freier Modus

Im freien Modus gibt es keinen vorgegebenen Gesprächsablauf. Du bekommst nur eine Anweisung, z. B. „Euch geht der Kraftstoff aus, ihr braucht 40 Liter Diesel“, und eine **Übersicht der Funkteilnehmer** mit Rufname, Zuständigkeit und Gesprächsgruppe (Zugtrupp, Nachbargruppe, Fachgruppen Notversorgung und Logistik, Einsatzleitung Feuerwehr, Rettungswagen, Leitstelle). Wen du rufst und wie du die Nachricht formulierst, entscheidest du selbst.

- **30 Aufgabentypen** mit zufälligen Werten in vier Arten (einzeln abwählbar): *Mitteilen*, *Anfordern*, *Erfragen* und *Angerufen werden*. Pro Durchlauf 3 bis 12 zufällige Aufgaben im selben Einsatz.
- **Die Gegenstellen reagieren auf das, was du sendest:** Rufst du eine nicht zuständige Stelle, verweist sie dich weiter. Fehlen Angaben (Menge, Ort …), kommt eine Rückfrage („Welche Menge, kommen.“). Fehlt dein Rufname, fragt sie „Wer ruft?“. Anruf und Nachricht in einer Sendung werden erkannt. Ab und zu heißt es auch „warten“.
- Die **Leitstelle** ist nur auf ihrer eigenen Gesprächsgruppe erreichbar – vorher umschalten.
- Fremdverkehr und Statusmeldungen laufen wie in den anderen Übungen mit.

### Was wird bewertet?

- Gesprächsaufbau: „[Gerufene Stelle] **von** [eigener Rufname], **kommen**“ bzw. „**Hier** [eigener Rufname], **kommen**“
- Richtige und vollständige Rufnamen in der richtigen Reihenfolge
- Abschluss jeder Sendung mit „kommen“ bzw. „Ende“, und wer das Gespräch beendet
- Quittieren mit „Verstanden“ und Wiederholen wichtiger Eckdaten (Adresse, Zahlen)
- Inhaltliche Vollständigkeit von Meldungen
- Buchstabieren nach DIN 5009 (neu oder traditionell) oder NATO-Alphabet – alle werden erkannt, die Tafel für Musterlösungen ist einstellbar
- „Wiederholen“ bei gestörtem Empfang
- Funkdisziplin: „Warten“ einhalten, nicht in fremde Gespräche senden, nicht während einer laufenden Sendung drücken, richtige Gesprächsgruppe
- Sprechweise: keine Höflichkeitsformeln, Grüße oder Füllwörter („bitte“, „danke“, „okay“, „äh“, „Roger“), „zwo“ statt „zwei“, nicht zu lang
- Sprechtechnik: zu früh gesprochen (vor dem Sendeerlaubniston) oder Sprechtaste zu früh losgelassen
- Statusmeldungen über das Funkgerät

## Für Entwickler

Neue Versionen: Version in `package.json` erhöhen und auf den Standard-Branch pushen – GitHub Actions baut die Pakete für macOS und Windows und veröffentlicht sie als Release (die Download-Links oben zeigen immer auf die neueste Version).

### Selbst bauen / entwickeln

Voraussetzung: [Node.js](https://nodejs.org) 20 oder neuer.

```bash
npm install
```

```bash
npm start
```

Sprachmodell zum Einbauen in die App herunterladen (sonst lädt die App es beim ersten Start):

```bash
npm run fetch-model
```

Installationspakete bauen (auf dem jeweiligen Betriebssystem):

```bash
npm run dist:mac
```

```bash
npm run dist:win
```

Tests der Bewertungslogik:

```bash
npm test
```

Ohne Electron im Browser (Chrome/Edge) starten, dann `http://localhost:5173` öffnen:

```bash
npm run web
```

## Bedienung

| Aktion | Maus | Tastatur |
|---|---|---|
| Sprechen | PTT-Taste links am Gerät gedrückt halten | Leertaste gedrückt halten |
| Gesprächsgruppe | Linker Drehknopf (links/rechts klicken, scrollen) oder ◀ ▶ | Pfeil links/rechts |
| Lautstärke | Rechter Drehknopf | – |
| Status senden | Ziffer, dann ✓ oder Softkey „Senden“ | Ziffer, dann Enter |
| Ein/Aus | ⏻ | – |

Tipp: Nach dem Drücken der Sprechtaste kurz den Ton abwarten, deutlich sprechen und erst nach dem letzten Wort loslassen.

## Hinweise

- Alle Rufnamen und Lagen sind **fiktiv**. Die Rufnamensystematik („Heros [Ort] 21/52“) ist an die THW-Praxis angelehnt, kann regional aber abweichen. Das gilt auch für Statusbedeutungen und Gesprächsgruppen.
- Der Trainer ersetzt keine Ausbildung nach der Sprechfunk-Dienstvorschrift (DV 810) bzw. den THW-Ausbildungsunterlagen. Er hilft dabei, die Routine zu halten.
- Die Spracherkennung ist nicht perfekt. Wenn ein Wort falsch erkannt wurde, siehst du in der Bewertung, was verstanden wurde („…“). Deutlich sprechen hilft – wie im echten Funk.

## Technik

- [Electron](https://www.electronjs.org/) für macOS/Windows
- Spracherkennung: [transformers.js](https://github.com/huggingface/transformers.js) mit OpenAI Whisper (ONNX/WebAssembly, optional WebGPU), läuft in einem Web Worker
- Sprachausgabe: Web Speech API (Systemstimmen)
- Funkgeräte-Klänge: Web Audio API (synthetisch erzeugt)
- Bewertungslogik: `src/js/evaluator.js`, Szenarien: `src/js/scenarios.js`, Ablauf: `src/js/engine.js`
- Freier Modus: Aufgaben und Funkteilnehmer in `src/js/free.js`, dialogbasierter Ablauf in `src/js/free-engine.js`

Eigene Übungen lassen sich in `src/js/scenarios.js` ergänzen. Ein Szenario ist eine Folge von Schritten (`rx` = Gegenstelle spricht, `tx` = du sendest mit Erwartung, `status`, `task`, `silence` …). Die Tests in `tests/engine.test.mjs` prüfen automatisch, dass jede Musterlösung volle Punktzahl erreicht.
