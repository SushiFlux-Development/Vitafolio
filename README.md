<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="branding/wordmark-dark.svg">
    <img src="branding/wordmark.svg" alt="Vitafolio" height="64">
  </picture>
</p>

**[English](#english) · [Deutsch](#deutsch)**

---

<a name="english"></a>
## English

Vitafolio is a free, open-source app for writing job applications that look good. You enter your data **once** in a master
profile. From it you get a CV as PDF in 18 designs (from Classic to Aurora) or as a Word file, cover letters modelled on DIN 5008, and
a dossier of cover sheet, cover letter, CV and attachments as one PDF.

**What it can do**

- CV from building blocks (positions, education, skills, languages, certificates, interests, custom sections), a gap analysis,
  a step-by-step wizard, 14 bundled fonts, eight accent colours or a colour of your own, PDF and Word export, JSON Resume import and export.
- Cover letters with sender and recipient field, fold and punch marks and your signature; English or German.
- An application tracker (Kanban board and list, seven statuses, history, follow-up reminder after 14 days) and a dossier per
  application. The dossier you sent stays unchanged. Attachments (PDF and images) are checked when you upload them. For each
  application you choose what of the master profile goes into the CV (in full, short or left out); for a new application the app
  suggests this from your work experience and gives the reasons. A dashboard shows your applications as a board, and an export page downloads finished dossiers (several at once as a ZIP, named after company and job).
- A guide that asks a few questions and shows an application plan for your situation (rules of thumb, not legal advice), and a
  short introduction with hints on every page.
- Optional AI help (cover letter, job posting analysis, short profile, bullet points, translation): with your own API key, with a
  local model (Ollama, LM Studio), or by copying a ready-made prompt into the AI subscription you already have. Name, contact
  details and address from your profile are replaced by placeholders before anything is sent; the content of your CV is not.
- Backups with files, on a schedule, with download, upload and restore. The default keeps the newest two.
- English and German interface, light and dark theme, the manual (both languages) inside the app.

**Platforms**

- **Windows program** (own window, installer, no sign-in, updates with one click).
- **Docker image** for Unraid, NAS and Linux servers with a web interface, accounts, two-factor sign-in and an Unraid template
  (`unraid/vitafolio.xml`).

**Versions and channels**

| Channel | You get | Docker tag |
|---|---|---|
| Standard (default) | full releases only | `latest` |
| Beta (β) | betas and full releases | `beta` |
| Nightly (α) | nightlies and full releases | `nightly` |

**Status:** in development – the first beta is being prepared, there is no release yet.

**Manual:** [English](docs/handbuch/en/HANDBOOK.md) · [Deutsch](docs/handbuch/de/HANDBUCH.md)

**Licence:** [GNU Affero General Public License v3.0](LICENSE) · © 2026 SushiFlux Development

---

<a name="deutsch"></a>
## Deutsch

Vitafolio ist eine kostenlose Open-Source-App für Bewerbungen, die gut aussehen. Sie tragen Ihre Daten **einmal** im
Stammprofil ein. Daraus entstehen ein Lebenslauf als PDF in 18 Designs (von Klassisch bis Aurora) oder als Word-Datei, Anschreiben
angelehnt an DIN 5008 und eine Mappe aus Deckblatt, Anschreiben, Lebenslauf und Anlagen als eine PDF-Datei.

**Was sie kann**

- Lebenslauf aus Bausteinen (Berufserfahrung, Ausbildung, Kenntnisse, Sprachen, Zertifikate, Interessen, eigene Abschnitte),
  Lücken-Analyse, Assistent Schritt für Schritt, 14 mitgelieferte Schriften, acht Akzentfarben oder eine eigene Farbe, PDF- und Word-Export,
  Import und Export im Format JSON Resume.
- Anschreiben mit Absender- und Empfängerfeld, Falz- und Lochmarken und Ihrer Unterschrift, deutsch oder englisch.
- Ein Bewerbungs-Tracker (Tafel und Liste, sieben Status, Verlauf, Erinnerung ans Nachfassen nach 14 Tagen) und eine Mappe je
  Bewerbung. Die verschickte Mappe bleibt unverändert erhalten. Anlagen (PDF und Bilder) werden beim Hochladen geprüft. Je
  Bewerbung legt man fest, was aus dem Stammprofil in den Lebenslauf kommt (ausführlich, kurz oder weggelassen); bei einer neuen
  Bewerbung schlägt die App es nach der Berufserfahrung vor und nennt die Gründe. Eine Übersicht zeigt die Bewerbungen als Board, eine Export-Seite lädt fertige Mappen herunter (mehrere auf einmal als ZIP, benannt nach Unternehmen und Stelle).
- Ein Ratgeber, der wenige Fragen stellt und einen Bewerbungsplan für die eigene Lage zeigt (Faustregeln, keine Rechtsberatung),
  und eine kurze Einführung mit Hinweisen auf jeder Seite.
- Freiwillige KI-Hilfe (Anschreiben, Stellenanalyse, Kurzprofil, Stichpunkte, Übersetzung): mit eigenem API-Key, mit einem
  lokalen Modell (Ollama, LM Studio) oder indem man einen fertigen Prompt in das KI-Abo kopiert, das man schon hat. Name,
  Kontaktdaten und Anschrift aus dem Profil ersetzt Vitafolio vorher durch Platzhalter; der Inhalt des Lebenslaufs wird nicht ersetzt.
- Sicherungen mit Dateien, nach Zeitplan, mit Herunterladen, Hochladen und Wiederherstellen. Standard: die neuesten zwei bleiben.
- Oberfläche auf Deutsch und Englisch, helles und dunkles Farbschema, das Handbuch (beide Sprachen) in der App.

**Plattformen**

- **Windows-Programm** (eigenes Fenster, Installer, keine Anmeldung, Update mit einem Klick).
- **Docker-Image** für Unraid, NAS und Linux-Server mit Weboberfläche, Konten, Zwei-Faktor-Anmeldung und einer Unraid-Vorlage
  (`unraid/vitafolio.xml`).

**Versionen und Kanäle**

| Kanal | Sie bekommen | Docker-Kennung |
|---|---|---|
| Standard (Voreinstellung) | nur Voll-Releases | `latest` |
| Beta (β) | Betas und Voll-Releases | `beta` |
| Nightly (α) | Nightlies und Voll-Releases | `nightly` |

**Stand:** in Entwicklung – die erste Beta wird vorbereitet, es gibt noch keine Veröffentlichung.

**Handbuch:** [Deutsch](docs/handbuch/de/HANDBUCH.md) · [English](docs/handbuch/en/HANDBOOK.md)

**Lizenz:** [GNU Affero General Public License v3.0](LICENSE) · © 2026 SushiFlux Development
