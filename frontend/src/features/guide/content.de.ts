import type { GuideContent } from './content'

/**
 * German wording of the guide. The advice is taken from chapter 22 of the manual and its research notes; where a source is
 * named in a text it is the one the manual names. Do not add advice here that the manual does not hold.
 */
export const contentDe: GuideContent = {
  title: 'Ratgeber',
  subtitle: 'Fünf kurze Fragen, dann bekommen Sie einen Bewerbungsplan, der zu Ihrer Lage passt: was hineingehört, wie der Lebenslauf aufgebaut ist und was Sie kürzen können.',
  loading: 'Der Ratgeber wird geladen …',
  loadFailed: 'Ihre gespeicherten Antworten konnten nicht geladen werden.',
  retry: 'Erneut versuchen',

  intro: {
    heading: 'Für jede Lage der passende Rat',
    text: 'Ob Sie gerade die Schule beendet haben, seit Jahren im Beruf stehen oder nach einer Pause zurückkehren: Der Ratgeber zeigt nur, was für Sie gilt. Die Antworten bleiben in Ihrem Konto gespeichert, und Sie können sie jederzeit ändern.',
    points: ['Etwa eine Minute', 'Jederzeit abbrechbar', 'Keine Rechtsberatung, sondern Orientierung'],
    start: 'Ratgeber starten',
    overview: 'Alle Situationen zum Nachlesen',
  },

  wizard: {
    label: 'Ratgeber-Assistent',
    cancel: 'Abbrechen',
    back: 'Zurück',
    next: 'Weiter',
    finish: 'Plan erstellen',
    finishing: 'Wird gespeichert …',
    stepOf: (current, total) => `Frage ${current} von ${total}`,
    stepFirst: 'Frage 1',
    saveFailed: 'Ihre Antworten konnten nicht gespeichert werden.',
    situation: {
      title: 'Wo stehen Sie gerade?',
      hint: 'Wählen Sie, was am besten passt.',
      options: {
        school: { label: 'Schule gerade abgeschlossen', description: 'Sie suchen Ihre erste Ausbildung oder Stelle.' },
        training_or_studies: { label: 'Ausbildung oder Studium gerade abgeschlossen', description: 'Sie haben einen Abschluss und suchen Ihre erste Stelle.' },
        working: { label: 'Im Berufsleben', description: 'Sie arbeiten oder haben schon gearbeitet.' },
        returning: { label: 'Wiedereinstieg nach einer Pause', description: 'Sie kehren nach längerer Zeit zurück, zum Beispiel nach einer Familienphase.' },
      },
    },
    years: {
      title: { working: 'Wie lange sind Sie schon im Berufsleben?', returning: 'Wie lange waren Sie vor der Pause im Berufsleben?' },
      hint: { working: 'Wählen Sie eine Schnellwahl oder geben Sie die Jahre selbst ein. Ungefähr genügt.', returning: 'Wählen Sie eine Schnellwahl oder geben Sie die Jahre selbst ein. Ungefähr genügt.' },
      choices: { none: 'Keine', under2: 'Unter 2 Jahre', from2: '2 bis 5 Jahre', from5: '5 bis 10 Jahre', from10: '10 bis 15 Jahre', over15: 'Über 15 Jahre' },
      choicesLabel: 'Schnellwahl',
      fieldLabel: 'Oder genaue Zahl',
      fieldHint: 'Ganze Jahre, von 0 bis 60.',
      unit: 'Jahre',
      invalid: 'Bitte nur eine ganze Zahl eingeben, zum Beispiel 7.',
      range: (max) => `Zu groß: höchstens ${max} Jahre.`,
      required: 'Bitte eine Schnellwahl treffen oder eine Zahl eingeben.',
    },
    plan: {
      title: 'Was haben Sie vor?',
      hint: 'Wählen Sie, was zu Ihrer nächsten Bewerbung passt.',
      options: {
        same_field: { label: 'Im selben Beruf bleiben', description: 'Sie bewerben sich auf eine ähnliche Stelle wie bisher.' },
        new_field: { label: 'In einen anderen Beruf wechseln', description: 'Sie wollen künftig etwas anderes machen.' },
      },
    },
    explain: {
      title: 'Gibt es etwas zu erklären?',
      hint: 'Wählen Sie alles, was zutrifft. Zu jedem Punkt bekommen Sie einen kurzen Hinweis.',
      options: {
        none: { label: 'Nichts Besonderes', description: 'Mein Lebenslauf ist ohne Auffälligkeiten.' },
        gap: { label: 'Lücke im Lebenslauf', description: 'Zeiten ohne Eintrag.' },
        parental_leave: { label: 'Elternzeit', description: 'Eine Familienphase.' },
        illness: { label: 'Längere Krankheit', description: 'Eine Auszeit aus gesundheitlichen Gründen.' },
        unemployment: { label: 'Arbeitslosigkeit', description: 'Eine Zeit der Jobsuche.' },
        dropped_out: { label: 'Abgebrochene Ausbildung oder Studium', description: 'Etwas wurde nicht abgeschlossen.' },
        frequent_changes: { label: 'Häufige Wechsel', description: 'Mehrere kurze Stationen.' },
      },
    },
    region: {
      title: 'Wohin bewerben Sie sich?',
      hint: 'Lebenslauf und Anschreiben unterscheiden sich von Land zu Land.',
      options: {
        de: { label: 'Deutschland', description: 'Bewerbung nach deutschen Gepflogenheiten.' },
        uk: { label: 'Großbritannien', description: 'Ein „CV“ auf Englisch.' },
        us: { label: 'USA', description: 'Ein „Resume“ auf Englisch.' },
      },
    },
  },

  plan: {
    heading: 'Ihr Bewerbungsplan',
    changeAnswers: 'Antworten ändern',
    overview: 'Alle Situationen',
    answersLabel: 'Ihre Antworten',
    legendTitle: 'So lesen Sie die Markierungen',
    disclaimerTitle: 'Orientierung, keine Rechtsberatung',
    disclaimer:
      'Für Bewerbungen gibt es keine Vorschrift, wie sie aussehen müssen. Ratgeber, zum Beispiel der Bundesagentur für Arbeit (BA), sind sich nicht immer einig; wo sie sich widersprechen, steht das hier. Zeitangaben wie „nach zehn Jahren“ sind Faustregeln. Maßgeblich sind die Anzeige und die Wünsche des Arbeitgebers.',
    sourcesTitle: 'Woher die Hinweise stammen',
    sources:
      'Grundlage ist Kapitel 22 des Handbuchs. Dort stehen die Quellen: Bundesagentur für Arbeit, Bitkom, StepStone, Karrierebibel, Hays, get-in-it, Randstad, ingenieur.de, National Careers Service, Prospects und UC Berkeley. Viele Ratgeber haben eigene Interessen, zum Beispiel Werbung für Bewerbungstools.',
    goTo: 'Gleich umsetzen',
    externalHint: 'Öffnet im Browser',
  },

  overview: {
    heading: 'Alle Situationen im Überblick',
    intro: 'Zum Nachlesen: Zu jeder Lage steht hier der Plan, wie er für typische Antworten aussieht. Ihren eigenen Plan bekommen Sie mit dem Assistenten.',
    back: 'Zurück',
    tabsLabel: 'Situation',
    tabs: {
      school: 'Schule abgeschlossen',
      training: 'Ausbildung / Studium abgeschlossen',
      some: 'Einige Jahre Erfahrung',
      long: 'Lange Berufserfahrung',
      switch: 'Berufswechsel',
      returning: 'Wiedereinstieg',
      sensitive: 'Heikle Punkte',
      uk: 'Großbritannien',
      us: 'USA',
    },
    note: 'Diese Antworten sind nur ein Beispiel und nicht Ihre.',
    exampleLabel: 'Angenommene Antworten',
    examples: {
      school: 'Schule abgeschlossen, erste Stelle, Deutschland',
      training: 'Ausbildung oder Studium abgeschlossen, erste Stelle, Deutschland',
      some: '3 Jahre Berufserfahrung, im selben Beruf, Deutschland',
      long: '12 Jahre Berufserfahrung, im selben Beruf, Deutschland',
      switch: '3 Jahre Berufserfahrung, Wechsel in einen anderen Beruf, Deutschland',
      returning: 'Wiedereinstieg nach 7 Jahren im Beruf, im selben Beruf, Deutschland',
      sensitive: 'Alle sechs heiklen Punkte zugleich; gezeigt wird nur dieser Block',
      uk: '3 Jahre Berufserfahrung, im selben Beruf, Großbritannien; gezeigt wird nur der Block für das Ausland',
      us: '3 Jahre Berufserfahrung, im selben Beruf, USA; gezeigt wird nur der Block für das Ausland',
    },
  },

  summary: {
    situation: {
      school: 'Schule abgeschlossen',
      training_or_studies: 'Ausbildung oder Studium abgeschlossen',
      working: 'Im Berufsleben',
      returning: 'Wiedereinstieg',
    },
    plan: { same_field: 'Im selben Beruf bleiben', new_field: 'Berufswechsel', first_job: 'Erste Stelle' },
    region: { de: 'Deutschland', uk: 'Großbritannien', us: 'USA' },
    years: (years) => (years === 1 ? '1 Jahr Berufserfahrung' : `${years} Jahre Berufserfahrung`),
    explainNone: 'Nichts zu erklären',
    explain: {
      gap: 'Lücke',
      parental_leave: 'Elternzeit',
      illness: 'Krankheit',
      unemployment: 'Arbeitslosigkeit',
      dropped_out: 'Abbruch',
      frequent_changes: 'Häufige Wechsel',
    },
  },

  kinds: {
    rule: 'Quellen einig',
    ruleOfThumb: 'Faustregel',
    recommendation: 'Empfehlung',
    disputed: 'Quellen uneinig',
    thin: 'Dünne Quellenlage',
    unproven: 'Nicht belegt',
    app: 'In der App',
    example: 'Beispiel',
  },
  kindHelp: {
    rule: 'Die Quellen sagen dasselbe. Auch das ist eine Orientierung und keine Vorschrift.',
    ruleOfThumb: 'Eine Zahl oder Grenze, die Ratgeber nennen. Sie gilt nicht für jeden Fall.',
    recommendation: 'Eine Empfehlung aus dem Handbuch, die sich aus den Quellen ergibt. Sie ist ein Vorschlag, kein Muss.',
    disputed: 'Die Quellen widersprechen sich. Beide Seiten stehen im Text.',
    thin: 'Es gibt nur eine Quelle oder wenige. Nehmen Sie den Hinweis als eine Meinung.',
    unproven: 'Dazu wurde keine Quelle gefunden. Der Text sagt das offen.',
    app: 'Was die App an dieser Stelle für Sie tut.',
    example: 'Ein erfundenes Beispiel, keine Vorgabe.',
  },

  blocks: {
    contents: { title: 'Was in die Bewerbung gehört', intro: 'Die Bestandteile und ihre Reihenfolge.' },
    region: { title: 'Besonderheiten im Ausland', intro: 'Was sich gegenüber Deutschland unterscheidet.' },
    cvStructure: { title: 'Aufbau des Lebenslaufs', intro: 'Form, Abschnitte und Länge.' },
    trim: { title: 'Was Sie kürzen oder weglassen können', intro: 'Nicht Ihr Alter entscheidet, sondern die Relevanz.' },
    attachments: { title: 'Anlagen: welche und wie viele', intro: 'Mehr Erfahrung, weniger Zeugnisse.' },
    coverLetter: { title: 'Worauf es beim Anschreiben ankommt', intro: 'Es erzählt nicht den Lebenslauf nach, sondern macht einen Vorschlag.' },
    sensitive: { title: 'Heikle Punkte', intro: 'Zu den Punkten, die Sie angekreuzt haben.' },
    findData: { title: 'Wo finde ich meine Daten?', intro: 'Wenn Sie Zeiträume nicht mehr genau wissen.' },
  },

  items: {
    'contents.order': {
      text: 'Anschreiben, Lebenslauf, Zeugnisse: In dieser Reihenfolge legen Sie die Unterlagen idealerweise an (Bundesagentur für Arbeit, BA). Das Anschreiben steht vorn, dann folgt der Lebenslauf, danach die Zeugnisse.',
    },
    'contents.coverLetter': {
      text: 'Nicht jeder Arbeitgeber will ein Anschreiben. Lesen Sie die Anzeige: Verlangt sie eines oder bietet sie ein Textfeld an, lohnt es sich. Bei Online-Bewerbungen wollen manche Firmen keines mehr, prüfen Sie das vorher (BA).',
    },
    'contents.coverSheet': {
      text: 'Ein Deckblatt ist freiwillig. Die BA nennt es „kein Pflichtbestandteil“, es „kann aber sinnvoll sein“; eine andere Quelle hält es für „nicht mehr relevant“. Gibt es ein Deckblatt, gehört das Foto dorthin.',
    },
    'contents.thirdPageEntry': {
      text: 'Eine dritte Seite mit Zusatzinfos (zum Beispiel ein Projekt oder ein Blog) ist für Berufseinsteiger laut BA eher nicht nötig.',
    },
    'contents.thirdPage': {
      text: 'Eine dritte Seite mit Zusatzinfos (zum Beispiel ein Projekt oder ein Blog) ist freiwillig und unter Fachleuten umstritten.',
    },
    'contents.samples': { text: 'Arbeitsproben und ein Motivationsschreiben legen Sie nur bei, wenn der Arbeitgeber sie verlangt.' },
    'contents.digital': {
      text: 'In Deutschland nehmen fast alle Arbeitgeber Bewerbungen digital an, per E-Mail oder über ein Online-Portal (Umfrage 2025 unter 852 Unternehmen: alle). Jedes Dokument sollte als PDF vorliegen.',
    },
    'contents.files': {
      text: 'Ein Gesamt-PDF oder mehrere Dateien? Per E-Mail schicken Sie meist ein einziges PDF, in Portalen laden Sie die Dokumente oft einzeln hoch. Die BA nennt in einem Merkblatt auch eine Aufteilung in bis zu drei Dateien (Lebenslauf, alle Zeugnisse, Anschreiben). Die Ratgeber sind sich nicht einig. Empfehlung: Richten Sie sich nach der Anzeige. Steht dort nichts, ist ein Gesamt-PDF der übliche Weg.',
    },
    'contents.abroad': {
      text: 'Diese Hinweise stammen überwiegend aus deutschen Quellen. Für Großbritannien und die USA nennen die Quellen nur die Besonderheiten im nächsten Block. Maßgeblich ist immer die Anzeige.',
    },

    'region.language': {
      text: 'Stellen Sie die Dokument-Sprache auf Englisch: Überschriften und feste Wörter sind dann englisch, Daten stehen zum Beispiel als „23 Apr 1990“. Ihre eigenen Texte übersetzt die App nicht, dafür gibt es die KI-Übersetzung. Das Anschreiben erstellen Sie ebenfalls mit der Sprache Englisch.',
    },
    'region.ukTerm': { text: 'In Großbritannien heißt der Lebenslauf „CV“, in den USA und Kanada „Resume“.' },
    'region.ukPrivate': {
      text: 'Nicht hinein gehören laut National Careers Service Alter, Geburtsdatum, Familienstand und Staatsangehörigkeit. Ein Foto ist nicht nötig, außer bei Schauspiel und Modeln (Prospects).',
    },
    'region.ukSections': {
      text: 'Übliche Abschnitte: Kontaktdaten, eine Einleitung (persönliches Profil) oben, Ausbildung, Berufsweg und Referenzen („auf Anfrage“). Wer viel Erfahrung hat, stellt den Berufsweg vor die Ausbildung.',
    },
    'region.ukApp': {
      text: 'In der App schalten Sie das Foto aus und lassen Geburtsdatum, Familienstand und Staatsangehörigkeit leer. Zeugnisse werden laut einer Ratgeberseite nicht beigefügt: Wählen Sie dann bei der Bewerbung keine Anlagen aus.',
    },
    'region.ukUnknown': { text: 'Zur Unterschrift fanden sich in den Quellen keine Angaben.' },
    'region.usTerm': {
      text: 'In den USA und Kanada heißt der Lebenslauf „Resume“. Ein „CV“ ist dort ein langes, akademisches Dokument. Fragt ein Arbeitgeber nach einem „CV“, meint er oft ein Resume. Fragen Sie nach.',
    },
    'region.usUnknown': {
      text: 'Zu Foto, Geburtsdatum, Familienstand, Unterschrift, Zeugnissen und Kurzprofil in den USA fand sich keine Quelle. Richten Sie sich nach der Anzeige.',
    },

    'cv.form': {
      text: 'Der Lebenslauf ist tabellarisch (Zeiträume links, Beschreibung rechts) und antichronologisch: Die neueste Station steht zuerst. Zeiträume stehen mit Monat und Jahr, zum Beispiel 03/2021 bis 08/2024. Je aktueller und wichtiger eine Lebensphase, desto weiter oben steht sie.',
    },
    'cv.sections': {
      text: 'Die üblichen Abschnitte:',
      points: [
        'Persönliche Daten: Name, Anschrift, Telefon, E-Mail',
        'Kurzprofil (freiwillig): wenige Sätze zu Ihren Schwerpunkten',
        'Berufserfahrung: Position, Arbeitgeber, Zeitraum und das Wichtigste, was Sie getan und erreicht haben',
        'Ausbildung und Studium: Abschluss, Einrichtung, Zeitraum',
        'Weiterbildung und Zertifikate: nur, was zur Stelle passt',
        'Kenntnisse und Sprachen',
        'Ehrenamt und Interessen: nur, wenn es zur Stelle passt oder etwas über Sie zeigt',
      ],
    },
    'cv.profileEntry': {
      text: 'Ein Kurzprofil (wenige Sätze zu Ihren Schwerpunkten) ist freiwillig. Am nützlichsten ist es laut Karrierebibel für Berufseinsteiger, Berufswechsler und Führungskräfte.',
    },
    'cv.profileSwitch': {
      text: 'Ein Kurzprofil, das den Wechsel in einem Satz erklärt, hilft. Es ist freiwillig, aber laut Karrierebibel für Berufswechsler am nützlichsten.',
    },
    'cv.profileOptional': {
      text: 'Ein Kurzprofil (wenige Sätze zu Ihren Schwerpunkten) ist freiwillig. Am nützlichsten ist es laut Karrierebibel für Berufseinsteiger, Berufswechsler und Führungskräfte.',
    },
    'cv.lengthEntry': { text: 'Länge: eine bis zwei A4-Seiten (BA). Berufseinsteiger kommen meist mit einer Seite aus.' },
    'cv.lengthSome': {
      text: 'Länge: Die BA nennt eine bis zwei A4-Seiten. Empfehlung: Zwei Seiten sind ein guter Rahmen. Wird es länger, kürzen Sie nach den Hinweisen weiter unten.',
    },
    'cv.lengthLong': {
      text: 'Länge: Die BA nennt eine bis zwei A4-Seiten, andere Ratgeber erlauben bei langer Berufserfahrung bis zu drei (Hays: zwei bis höchstens drei). Empfehlung: Zwei Seiten sind ein guter Rahmen. Wird es länger, kürzen Sie nach den Hinweisen weiter unten.',
    },
    'cv.lengthUk': { text: 'Länge: bis zu zwei A4-Seiten, bei einer langen Laufbahn sind drei möglich (Prospects).' },
    'cv.lengthUsEntry': { text: 'Länge: Ein Resume für Studierende und Berufseinsteiger passt meist auf eine Seite (UC Berkeley).' },
    'cv.lengthUsMore': { text: 'Länge: Für längere Laufbahnen in den USA fand sich keine geprüfte Quelle.' },
    'cv.template': {
      text: 'Vorlage: Für die meisten Bewerbungen ist eine ruhige Vorlage die sichere Wahl, vor allem in klassischen Branchen. Ausdrucksstarke Vorlagen passen eher zu kreativen oder weniger förmlichen Stellen. Das ist eine Empfehlung, keine Vorschrift.',
    },
    'cv.ats': {
      text: 'Bewerbermanagement-Systeme (Programme, die Bewerbungen sammeln und sortierbar machen): Panik ist nicht angebracht. Empfehlung: ein klares, einfaches Layout, normale Überschriften, Wörter aus der Anzeige nur dort, wo sie wirklich zu Ihnen passen, und ein PDF, das als Datei lesbar ist.',
    },
    'cv.personalCore': { text: 'Persönliche Daten: Name, Anschrift, Telefon und eine seriöse E-Mail-Adresse mit Ihrem Namen gehören hinein.' },
    'cv.personalOptional': {
      text: 'Alles Weitere ist üblich oder freiwillig, aber keine Pflicht. Die Quellen sind sich in Einzelheiten nicht einig. Eine ausdrückliche Aussage, dass Foto, Geburtsdatum oder Familienstand wegzulassen sind, gibt es nicht; ob das Weglassen Ihre Chancen verbessert oder verschlechtert, ist nicht belegt. Empfehlung: Nehmen Sie nur auf, was der Stelle dient und womit Sie sich wohlfühlen. Fragt der Arbeitgeber ausdrücklich nach einer Angabe, tragen Sie sie ein.',
      points: [
        'Foto: freiwillig („kein Muss mehr“, BA). In Deutschland ist es dennoch verbreitet. Wenn, dann aktuell (höchstens ein Jahr alt).',
        'Geburtsdatum und -ort: Die BA zählt beides zu den persönlichen Angaben, andere Ratgeber nennen es freiwillig.',
        'Familienstand, Kinder, Staatsangehörigkeit: freiwillig.',
        'Unterschrift, Ort und Datum am Ende: freiwillig. Eine Webseite nennt die Unterschrift Pflicht, ohne ein Gesetz zu nennen; ein Gesetz dafür wurde nicht gefunden.',
      ],
    },

    'trim.relevance': {
      text: 'Nicht Ihr Alter entscheidet, sondern die Relevanz: Was für die Stelle wichtig ist, steht ausführlich. Was lange zurückliegt oder nichts mit der Stelle zu tun hat, wird kürzer oder fällt weg. „Kürzen heißt nicht, Erfahrung zu verstecken“ (Hays). Alle Zeiträume hier sind Faustregeln von Ratgebern, keine Vorgabe. Auszeiten von mehr als zwei Monaten sollten Sie nennen.',
    },
    'trim.entrySchool': {
      text: 'Faustregeln für den Einstieg:',
      points: [
        'Ausführlich: Praktika, Projekte, Ehrenamt',
        'Zusammenfassen: mehrere Nebenjobs bündeln',
        'Meist weglassen: Praktika unter sechs Wochen, wenn sie nicht zur Stelle passen',
      ],
    },
    'trim.entryTraining': {
      text: 'Faustregeln für den Einstieg:',
      points: [
        'Ausführlich: Ausbildung oder Studium, Praktika, Projekte, Ehrenamt',
        'Kürzer: Schule, meist nur der Abschluss; mehrere Nebenjobs bündeln',
        'Meist weglassen: Praktika unter sechs Wochen, wenn sie nicht zur Stelle passen',
      ],
    },
    'trim.some': {
      text: 'Faustregeln bei einigen Jahren Erfahrung (bis etwa 10):',
      points: ['Ausführlich: die letzten drei Stationen', 'Kürzer: frühere Stationen kurz halten, Nebenjobs bündeln'],
    },
    'trim.someDegree': { text: 'Nach fünf bis zehn Jahren Berufserfahrung zählt laut Karrierebibel nur noch der höchste Abschluss mit Gesamtnote.' },
    'trim.someInternships': { text: 'Meist weglassen: Praktika, die älter als fünf Jahre sind und kaum Bezug zur Stelle haben (Karrierebibel).' },
    'trim.long': {
      text: 'Faustregeln bei langer Berufserfahrung (10 bis 20 Jahre und mehr):',
      points: [
        'Ausführlich: die letzten Stationen mit Aufgaben und Erfolgen',
        'Kürzer: ältere Stationen komprimieren; eine Sammelüberschrift wie „Frühere Positionen“ hilft',
        'Schule: Das Jahr des Abschlusses genügt',
      ],
    },
    'trim.long20': { text: 'Bei über 20 Jahren Berufserfahrung: auf Schwerpunkte, Erfolge und Meilensteine beschränken.' },
    'trim.long30': { text: 'Bei über 30 Jahren Berufserfahrung: wenige Schlüsselstationen.' },
    'trim.longDrop': {
      text: 'Meist weglassen: Schüler- und Nebenjobs, frühe Praktika, veraltete Software und Zertifikate, Aufgabenlisten aus Einstiegsjobs und frühere Abschlüsse neben einem höheren.',
    },
    'trim.newField': {
      text: 'Berufswechsel (Empfehlung, aus dem Grundsatz der Relevanz abgeleitet; eine eigene Quelle gibt es dafür nicht): Stationen und Weiterbildungen, die zum neuen Ziel passen, stehen ausführlich. Alles ohne Bezug zum Ziel wird kürzer.',
    },
    'trim.returning': {
      text: 'Wiedereinstieg (die Quellenlage ist dünn, die Hinweise stützen sich auf einen einzelnen Ratgeber): Benennen Sie die Zeit der Pause, bei einer Familienphase zum Beispiel als „Familienphase“, und nennen Sie Weiterbildung oder Ehrenamt in dieser Zeit. Ältere Stationen kürzen Sie nach den Regeln oben.',
    },
    'trim.personalNever': {
      text: 'Gehört nicht in den Lebenslauf: Beruf der Eltern und Geschwister (BA). Die Religion nennen Sie nur, wenn der Arbeitgeber danach fragt.',
    },
    'trim.interests': {
      text: 'Hobbys und Interessen nur, wenn sie zur Stelle passen: zwei bis vier, mit Bezug zur Stelle oder zu Ihrer Person. „Hobbys beweisen nichts“ (BA). Ehrenämter geben Sie an.',
    },
    'trim.interestsUs': {
      text: 'In den USA sind Interessen und Hobbys im Resume optional und gehören laut UC Berkeley zu den ersten Abschnitten, die man streicht (die Meinung einer einzelnen Hochschule).',
    },
    'trim.app': {
      text: 'In der App legen Sie beim Anlegen einer Bewerbung unter „Inhalt des Lebenslaufs“ fest, was in dieser Bewerbung steht: Einträge ausführlich, kurz oder weglassen. Die App schlägt vor und nennt den Grund, Sie entscheiden. Ihr Stammprofil bleibt dabei unverändert.',
    },

    'att.school': {
      text: 'Üblich sind die letzten beiden Schulzeugnisse (BA) und relevante Zertifikate. Haben Sie Praktika gemacht und fehlt Berufserfahrung, kommen ein bis zwei Praktikumszeugnisse dazu.',
    },
    'att.training': {
      text: 'Üblich sind:',
      points: [
        'das Abschlusszeugnis; bei einer Ausbildung auch die Zeugnisse des Betriebs, der Kammer und der Berufsschule, bei einem Studium die Urkunde des höchsten Abschlusses',
        'ein bis zwei Praktikumszeugnisse, wenn Berufserfahrung fehlt',
        'relevante Zertifikate',
      ],
    },
    'att.schoolReports': {
      text: 'Schulzeugnisse sind umstritten: Die BA nennt die letzten beiden als üblich (sie wendet sich an Schüler und Berufseinsteiger). Andere Ratgeber sagen: nur für Schulabgänger ohne Berufserfahrung, mit Hochschulabschluss oder langer Erfahrung weglassen. Empfehlung: Mit Berufserfahrung weglassen.',
    },
    'att.some': {
      text: 'Üblich sind:',
      points: [
        'der höchste Abschluss',
        'Arbeitszeugnisse der letzten Stationen; StepStone nennt höchstens drei aktuelle',
        'relevante Zertifikate',
      ],
    },
    'att.long': {
      text: 'Üblich sind der höchste Abschluss plus ein bis zwei aktuelle Arbeitszeugnisse sowie aktuelle, relevante Fortbildungen. Ältere Zertifikate ohne Bezug zur Stelle lassen Sie weg (Hays). Faustregel: Mehr Erfahrung, weniger Zeugnisse.',
    },
    'att.noSchool': {
      text: 'Schulzeugnisse lassen Sie bei Berufserfahrung weg (Empfehlung; StepStone: mit Hochschulabschluss oder langjähriger Erfahrung weglassen).',
    },
    'att.never': {
      text: 'Nie: Zeugnisse aus der Grundschule. Führungszeugnis, Gesundheitszeugnis und Führerschein nur, wenn der Arbeitgeber sie verlangt.',
    },
    'att.count': { text: 'Insgesamt nennt ein Ratgeber etwa fünf bis sieben Dokumente und sechs bis sieben Seiten.' },
    'att.order': {
      text: 'Reihenfolge: Die meisten Quellen (BA und andere) sagen: die aktuellsten oben. Ein Ratgeber rät zur umgekehrten Reihenfolge. Empfehlung: Die aktuellsten oben.',
    },
    'att.list': {
      text: 'Ein Anlagenverzeichnis wird uneinheitlich gesehen: Eine BA-Seite hält es bei vielen Dokumenten für sinnvoll, ein BA-Merkblatt sagt, Anlagen würden heute nicht mehr einzeln aufgelistet. Im Anschreiben genügt das Wort „Anlagen“.',
    },
    'att.file': {
      text: 'Dateigröße: Hier gibt der Arbeitgeber den Rahmen vor. Ohne Vorgabe nennen die Quellen zwei bis fünf Megabyte (MB) insgesamt, das BA-Merkblatt höchstens 2 MB; 2 MB ist der sicherste Wert. Scans reichen in Schwarz-Weiß mit 200 Punkten pro Zoll. Dateiname: sprechend, mit Ihrem Namen, zum Beispiel Vorname_Nachname_Lebenslauf.pdf.',
    },
    'att.email': {
      text: 'E-Mail: seriöse Adresse mit Ihrem Namen, im Betreff die Stelle (und die Kennziffer, wenn es eine gibt). Schicken Sie sich die Mail zuerst selbst. Prüfen Sie, wie die Unterlagen in Schwarz-Weiß aussehen, denn im Personalbereich wird oft nicht in Farbe gedruckt (BA).',
    },
    'att.uk': {
      text: 'In Großbritannien nennen die Quellen Referenzen „auf Anfrage“. Zeugnisse werden laut einer Ratgeberseite nicht beigefügt: Wählen Sie dann bei der Bewerbung keine Anlagen aus.',
    },
    'att.us': { text: 'Zu Anlagen in den USA fand sich keine Quelle. Richten Sie sich nach der Anzeige.' },

    'cl.purpose': {
      text: 'Das Anschreiben ist keine Beschreibung Ihres Werdegangs, sondern ein Vorschlag an den Arbeitgeber: Was bringen Sie mit, was die Stelle braucht? Der Lebenslauf zeigt die Stationen, das Anschreiben das „Warum“.',
    },
    'cl.length': {
      text: 'Länge: höchstens eine Seite. Die BA nennt 1.600 bis 2.000 Zeichen (etwa 250 bis 300 Wörter), Ratgeber nennen 250 bis 350 Wörter. Empfehlung: rund 250 bis 330 Wörter in höchstens fünf Absätzen.',
    },
    'cl.paragraphs': {
      text: 'Ein möglicher Aufbau (Empfehlung):',
      points: [
        'Einstieg, 2 bis 3 Sätze: ein konkreter Bezug zur Anzeige und ein Satz, was Sie heute tun',
        'Beweggründe, 3 bis 4 Sätze: warum Sie sich für diese Stelle entschieden haben, und ein Beleg, dass Sie schon losgegangen sind (Kurs, Zertifikat, Projekt)',
        'Stärken mit Belegen, 4 bis 5 Sätze: zwei bis drei Stärken, jede mit einem Beispiel, am besten mit Zahl oder Ergebnis',
        'Passung zur Firma, 2 bis 3 Sätze: warum gerade diese Firma, und was Sie beitragen',
        'Schluss, 2 Sätze: frühester Eintrittstermin (bei bestehender Stelle: nach der Kündigungsfrist) und die Bitte um ein Gespräch',
      ],
    },
    'cl.musts': {
      text: 'Was hineingehört:',
      points: [
        'Eine Ansprechperson mit Namen in der Anrede; „Sehr geehrte Damen und Herren“ ist nur der Notfall',
        'Ein Einstieg ohne „Hiermit bewerbe ich mich“ (die BA nennt das langweilig)',
        'Belegte Stärken: „Belastbar, flexibel, teamfähig“ ist laut BA unbeweisbar',
        'Ein sachlicher, selbstbewusster Ton in der Sie-Form mit kurzen Sätzen',
        'Am Ende genügt das Wort „Anlagen“, eine Aufzählung ist überflüssig (BA)',
      ],
    },
    'cl.never': {
      text: 'Was nicht hineingehört:',
      points: [
        'der nacherzählte Lebenslauf',
        'Entschuldigungen, zum Beispiel „obwohl mein Weg nicht klassisch ist“',
        'eine Liste dessen, was Ihnen noch fehlt',
        'ein Projekt in allen Einzelheiten (ein Satz und ein Link genügen)',
        'Privates und Gesundheitliches',
        'ein Gehaltswunsch, es sei denn, die Anzeige fragt danach',
      ],
    },
    'cl.switchReason': {
      text: 'Bei einem Berufswechsel ist der Beweggrund Ihr Ziel. Nennen Sie den Grund kurz, sonst bleibt die Frage offen, die jeder stellt. Die Ratgeber sind sich in der Richtung einig: nach vorn, nicht weg.',
      points: [
        'Nennen Sie, wohin Sie wollen, warum, und womit Sie das schon belegen (Kurs, Zertifikat, Projekt).',
        'Nicht: was Sie am alten Beruf stört. Streichen Sie Gründe wie „mehr Geld“, „mehr Freizeit“ oder „Langeweile“.',
        'Sprechen Sie nie schlecht über frühere Arbeitgeber.',
        'Schreiben Sie nur, was stimmt. Im Gespräch werden Sie danach gefragt.',
      ],
    },
    'cl.switchExample': {
      text: 'Beispiel für ein „Hin zu“ (erfunden): „Ich möchte künftig verstärkt Kunden beraten. Dafür habe ich im vergangenen Jahr einen Kurs belegt und begleite seitdem Kundengespräche in meiner Abteilung.“',
    },
    'cl.entry': { text: 'Eine eigene Regel für das Anschreiben beim Berufseinstieg nennen die Quellen nicht. Es gelten die Hinweise oben für alle.' },
    'cl.sensitive': {
      text: 'Die heiklen Punkte, die Sie angekreuzt haben, gehören kurz in den Lebenslauf (siehe unten). Im Anschreiben entschuldigen Sie sich nicht für Ihren Weg, und Privates und Gesundheitliches gehören nicht hinein. Ein abgebrochenes Studium nennen Sie dort nur, wenn es Ihren Weg erklärt.',
    },
    'cl.language': { text: 'Stellen Sie auch beim Anschreiben die Sprache auf Englisch.' },
    'cl.abroadNote': { text: 'Die Hinweise zum Anschreiben stammen aus deutschen Quellen. Zu Großbritannien und den USA fand sich dazu keine eigene Quelle.' },

    'sens.honest': {
      text: 'Grundsatz: Bleiben Sie ehrlich, und benennen Sie die Dinge kurz. Lücken zu verschleiern ist riskant: Falsche Angaben können nach Ratgebern später zur Kündigung führen. (Zu den rechtlichen Folgen wurde nichts geprüft.)',
    },
    'sens.gap': {
      text: 'Lücke im Lebenslauf: Nennen Sie, was Sie in der Zeit getan haben. Ab welcher Länge, ist nicht einheitlich: Die BA und StepStone nennen etwa zwei Monate als Richtwert, kritisch werde es ab etwa drei Monaten, andere Ratgeber sehen es erst ab drei bis vier Monaten so. Empfehlung: Erklären Sie Lücken ab etwa zwei bis drei Monaten mit einem Stichwort. Die Lücken-Analyse im Stammprofil meldet jede Lücke ab einem vollen Kalendermonat. Sie weist nur hin und urteilt nicht.',
    },
    'sens.unemployment': {
      text: 'Arbeitslosigkeit: nicht verschleiern. Schreiben Sie „arbeitssuchend“ oder „in Jobsuche“ statt „arbeitslos“ und nennen Sie Weiterbildung oder Projekte. Drei Ratgeber sind sich hier einig.',
    },
    'sens.parental_leave': {
      text: 'Elternzeit: Schreiben Sie einfach „Elternzeit“ oder „Familienphase“. Details brauchen Sie nicht. Die Ratgeber sind sich einig.',
    },
    'sens.illness': {
      text: 'Längere Krankheit: keine Diagnose. Der Zeitraum genügt, zum Beispiel „Auszeit aus gesundheitlichen Gründen“. Ob man „private Gründe“ schreibt oder die vollständige Genesung erwähnt, sehen die Ratgeber unterschiedlich.',
    },
    'sens.dropped_out': {
      text: 'Abgebrochene Ausbildung oder abgebrochenes Studium: Ein Studium müssen Sie nicht angeben. Es lohnt sich, wenn es eine Lücke erklärt oder Kenntnisse brachte, zum Beispiel: „10/2020 – 03/2022, Bachelorstudium Biologie (nicht abgeschlossen)“. Keine emotionalen Begründungen. Das sagt ein einzelner Anbieter. Zu einer abgebrochenen Ausbildung fand sich keine Quelle.',
    },
    'sens.frequent_changes': {
      text: 'Häufige Wechsel: Nennen Sie Monat und Jahr, nie nur Jahre. Die Ratgeber sind uneins: Einer erlaubt, sehr kurze Stationen unter „Orientierungsphase“ zusammenzufassen, wenn danach mindestens zwei Jahre folgen. Ein anderer rät, offen zu erklären. Beide sind Einzelmeinungen.',
    },
    'sens.abroadNote': { text: 'Diese Hinweise stammen aus deutschen Quellen. Für Großbritannien und die USA fand sich dazu keine eigene Quelle.' },

    'find.dates': {
      text: 'Bei der Schule genügt in der Regel das Jahr des Abschlusses. Die App nimmt auch nur eine Jahreszahl, und bei einer Ausbildung genügt künftig der Beginn oder das Ende. Für die übrigen Stationen schreiben Sie Monat und Jahr.',
    },
    'find.documents': { text: 'Die Daten stehen in Ihren Zeugnissen und Arbeitsverträgen.' },
    'find.drv': {
      text: 'Nur für Deutschland: Die Deutsche Rentenversicherung schickt Ihnen kostenlos den Versicherungsverlauf, eine zeitliche Übersicht aller Zeiten, die für die Rente zählen. Das kann helfen, wenn Sie Zeiträume nicht mehr genau wissen. Sie fordern ihn ohne Anmeldung per Post an (mit Ihrer Versicherungsnummer) oder registrieren sich im Kundenportal. Ob und welche Schulzeiten darin stehen, ist hier nicht belegt.',
    },
  },

  links: {
    profilePersonal: 'Stammprofil: Persönliches',
    profileExperiences: 'Stammprofil: Berufserfahrung',
    profileEducations: 'Stammprofil: Ausbildung',
    profilePreview: 'Stammprofil: Vorschau & Export',
    coverLetters: 'Zu den Anschreiben',
    applications: 'Zu den Bewerbungen',
  },
  externalLinks: {
    drvRequest: 'Versicherungsverlauf anfordern (Deutsche Rentenversicherung)',
    drvGlossary: 'Was ist ein Versicherungsverlauf? (Deutsche Rentenversicherung)',
  },
}
