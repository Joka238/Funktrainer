# BOS Funktrainer 📻

Ein Trainingssimulator für den **BOS-Sprechfunk** mit Fokus auf den THW-Einsatzdienst. Er läuft auf **macOS und Windows**.

Gegenstellen wie Zugtrupp und Leitstelle rufen dich per Sprachausgabe an. Du antwortest wie in echt **über das Mikrofon und die Sprechtaste** eines simulierten Handfunkgeräts. Jede Sendung wird laufend nach den Regeln der Sprechfunk-Dienstvorschrift bewertet.

## Installation (2 Minuten)

### Windows
1. **[BOS-Funktrainer-Setup.exe herunterladen](https://github.com/Joka238/Funktrainer/releases/latest/download/BOS-Funktrainer-Setup.exe)**
2. Doppelklick auf die Datei. Falls Windows „Der Computer wurde durch Windows geschützt“ meldet: **Weitere Informationen → Trotzdem ausführen**.
3. Fertig – der Funktrainer startet automatisch und liegt danach auf dem Desktop und im Startmenü.

Keine Installation gewünscht? Die [portable Version](https://github.com/Joka238/Funktrainer/releases/latest/download/BOS-Funktrainer-Portable.exe) läuft direkt, z. B. vom USB-Stick.

### macOS (Apple Silicon & Intel)
1. **[BOS-Funktrainer.dmg herunterladen](https://github.com/Joka238/Funktrainer/releases/latest/download/BOS-Funktrainer.dmg)**
2. Datei öffnen und **BOS Funktrainer** in den Ordner **Programme** ziehen.
3. Beim ersten Start meldet macOS „Apple konnte nicht überprüfen, ob ‚BOS Funktrainer‘ frei von Schadsoftware ist“ (die App ist nicht kostenpflichtig bei Apple registriert). So öffnest du sie trotzdem – nur einmal nötig:
   1. Auf **Fertig** klicken (nicht „In den Papierkorb legen“).
   2. **Systemeinstellungen → Datenschutz & Sicherheit** öffnen.
   3. Ganz nach unten scrollen und bei „BOS Funktrainer“ auf **Dennoch öffnen** klicken, mit Passwort/Touch ID bestätigen.

   Diese Anleitung steht auch im Installationsfenster der DMG-Datei.
   Falls „Dennoch öffnen“ nicht erscheint, im Terminal eingeben: `xattr -dr com.apple.quarantine "/Applications/BOS Funktrainer.app"`

Danach startet die App ganz normal per Doppelklick.

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
- **Statistik** mit Verlauf, Bestwerten und deinen häufigsten Fehlern.
- **Merkblatt** mit Gesprächsablauf, Betriebsworten, Statustabelle und Buchstabiertafel (DIN 5009 neu und traditionell).
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
| **Einsatzdienst (Zufall)** | Vier zufällige Übungen hintereinander |

Rufnamen, Orte, Adressen und Lagen werden bei jedem Durchlauf zufällig erzeugt. So lernst du keine festen Antworten auswendig.

### Was wird bewertet?

- Gesprächsaufbau: „[Gerufene Stelle] **von** [eigener Rufname], **kommen**“ bzw. „**Hier** [eigener Rufname], **kommen**“
- Richtige und vollständige Rufnamen in der richtigen Reihenfolge
- Abschluss jeder Sendung mit „kommen“ bzw. „Ende“, und wer das Gespräch beendet
- Quittieren mit „Verstanden“ und Wiederholen wichtiger Eckdaten (Adresse, Zahlen)
- Inhaltliche Vollständigkeit von Meldungen
- Buchstabieren nach DIN 5009. Das NATO-Alphabet wird bemängelt.
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

Eigene Übungen lassen sich in `src/js/scenarios.js` ergänzen. Ein Szenario ist eine Folge von Schritten (`rx` = Gegenstelle spricht, `tx` = du sendest mit Erwartung, `status`, `task`, `silence` …). Die Tests in `tests/engine.test.mjs` prüfen automatisch, dass jede Musterlösung volle Punktzahl erreicht.
