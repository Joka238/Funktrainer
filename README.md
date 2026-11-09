# BOS Funktrainer 📻

Ein Trainingssimulator für den **BOS-Sprechfunk** mit Fokus auf den THW-Einsatzdienst. Er läuft auf **macOS und Windows**.

Gegenstellen wie Zugtrupp und Leitstelle rufen dich per Sprachausgabe an. Du antwortest wie in echt **über das Mikrofon und die Sprechtaste** eines simulierten Handfunkgeräts. Jede Sendung wird laufend nach den Regeln der Sprechfunk-Dienstvorschrift bewertet.

## Funktionen

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

## Installation

### Fertige Version herunterladen

Unter **GitHub → Actions → Build** (oder bei Releases) liegen fertige Pakete:

- **macOS:** `BOS Funktrainer-x.y.z-universal.dmg` (Apple Silicon & Intel)
- **Windows:** Installer (`BOS Funktrainer Setup x.y.z.exe`) oder portable `.exe`

> **macOS:** Die App ist nicht von Apple signiert. Beim ersten Start mit **Rechtsklick → Öffnen** starten, oder unter *Systemeinstellungen → Datenschutz & Sicherheit → Trotzdem öffnen*.
> **Windows:** Bei der SmartScreen-Warnung auf *Weitere Informationen → Trotzdem ausführen* klicken.

Ein neues Release erzeugst du mit einem Versions-Tag (z. B. `git tag v1.0.0 && git push --tags`). Die Pakete werden dann automatisch an das GitHub-Release angehängt.

### Selbst bauen / entwickeln

Voraussetzung: [Node.js](https://nodejs.org) 20 oder neuer.

```bash
npm install
```

```bash
npm start
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

## Erster Start

1. **Mikrofonzugriff erlauben**, wenn das System fragt.
2. **Sprachmodell:** Beim ersten Start lädt die App das Whisper-Modell einmalig herunter (Standard „Base“, ca. 80 MB). Danach funktioniert die Erkennung offline. In den Einstellungen kannst du zwischen *Tiny* (schnell), *Base* und *Small* (am genauesten, ca. 250 MB) wählen.
3. **Deutsche Systemstimme:** macOS hat in der Regel „Anna“ installiert. Unter Windows ist bei deutscher Systemsprache „Hedda“/„Katja“ dabei, sonst unter *Einstellungen → Zeit und Sprache → Sprache → Deutsch → Sprachausgabe* nachinstallieren. Weitere Stimmen machen die Gegenstellen unterscheidbarer.
4. Übung wählen, Funkgerät mit **⏻** einschalten und die angezeigte **Gesprächsgruppe** einstellen. Dann geht's los.

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
