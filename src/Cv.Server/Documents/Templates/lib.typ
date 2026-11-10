// Shared building blocks of all document templates. The renderer puts this file in front of every template, so it only holds
// definitions and produces no output. User data arrives as JSON (sys.inputs) and is only ever read as values, never as markup.

// A text field of a record: trimmed, and "" when the field is missing, null or not text.
#let s(record, key) = {
  let v = record.at(key, default: none)
  if v == none { "" } else if type(v) == str { v.trim() } else { str(v) }
}

// The non-empty parts joined with a separator ("" when there is none; join() of an empty array would give none).
#let join-parts(parts, sep) = parts.filter(p => p != none and p != "").join(sep, default: "")

// Adds " (extra)" to a line, but only when there is an extra text.
#let with-paren(base, extra) = if extra == "" { base } else if base == "" { "(" + extra + ")" } else { base + " (" + extra + ")" }

// Text with line breaks: a "\n" inside a data string becomes a real line break.
#let multiline(value) = {
  if value == "" { return [] }
  value.replace("\r\n", "\n").replace("\r", "\n").split("\n").join(linebreak())
}

// Colour helpers. A freely chosen accent can be anything from near-white to near-black, so nothing here assumes a dark accent.

// Relative luminance by the WCAG formula: 0 is black, 1 is white.
#let luminance(c) = {
  let (r, g, b) = rgb(c).components(alpha: false)
  let channel(x) = {
    let v = x / 100%
    if v <= 0.04045 { v / 12.92 } else { calc.pow((v + 0.055) / 1.055, 2.4) }
  }
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

// WCAG contrast ratio of two colours, from 1 (identical) to 21 (black on white).
#let contrast(a, b) = {
  let (x, y) = (luminance(a), luminance(b))
  (calc.max(x, y) + 0.05) / (calc.min(x, y) + 0.05)
}

// The colour itself when it is readable on the background, otherwise the nearest darker (light background) or lighter (dark
// background) shade that reaches the required contrast.
#let readable-on(fg, bg, min: 4.5) = {
  if contrast(fg, bg) >= min { return rgb(fg) }
  let on-light = luminance(bg) > 0.4
  for pct in range(5, 100, step: 5) {
    let shade = if on-light { rgb(fg).darken(pct * 1%) } else { rgb(fg).lighten(pct * 1%) }
    if contrast(shade, bg) >= min { return shade }
  }
  if on-light { black } else { white }
}

// Text colour for a filled area: white when that is readable, otherwise a near-black; on a middle tone the better of the two.
#let ink-on(bg) = {
  let (light, dark) = (white, rgb("#111827"))
  let (w, d) = (contrast(light, bg), contrast(dark, bg))
  if w >= 4.5 { light } else if d >= 4.5 { dark } else if w >= d { light } else { dark }
}

// The options every design reads: language, accent colour with its readable variants, font list (the chosen one first, the
// bundled default as fallback) and photo. `accent` is for filled areas, `accent-text` for text on white (4.5:1), `accent-rule`
// for lines and marks on white (3:1), `on-accent` for text on a filled area, `accent-tint` for a pale background.
#let make-options(raw) = {
  let accent = rgb(raw.at("accentColor", default: "#14213D"))
  (
    lang: raw.at("language", default: "de"),
    accent: accent,
    accent-text: readable-on(accent, white),
    accent-rule: readable-on(accent, white, min: 3),
    on-accent: ink-on(accent),
    accent-tint: accent.lighten(88%),
    fonts: (raw.at("font", default: "Liberation Sans"), "Liberation Sans"),
    show-photo: raw.at("showPhoto", default: true),
    photo-shape: raw.at("photoShape", default: "rounded"),
  )
}

#let tr(o, de, en) = if o.lang == "en" { en } else { de }

// An ISO date as stored ("2018", "2018-01", "1985-09-20") shown the way the document language writes it: "2018", "01/2018",
// "20.09.1985" (German) or "20 Sep 1985" (English). Anything else (older entries, free text, impossible dates) stays as typed.
// The same rules live in DocumentDates.Format for the Word export.
#let fmt-date(value, o) = {
  let m = value.match(regex("^(\\d{4})(?:-(\\d{2})(?:-(\\d{2}))?)?$"))
  if m == none { return value }
  let (year-text, month-text, day-text) = m.captures
  if month-text == none { return year-text }
  let month = int(month-text)
  if month < 1 or month > 12 { return value }
  if day-text == none { return month-text + "/" + year-text }
  let year = int(year-text)
  let day = int(day-text)
  let leap = calc.rem(year, 4) == 0 and (calc.rem(year, 100) != 0 or calc.rem(year, 400) == 0)
  let days = (31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31).at(month - 1)
  if day < 1 or day > days { return value }
  if o.lang == "en" {
    let names = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    str(day) + " " + names.at(month - 1) + " " + year-text
  } else {
    day-text + "." + month-text + "." + year-text
  }
}

// "01/2018 – 12/2021", "01/2022 – heute" for a current position. Only one date when the other is missing: just the start, or - for an education whose
// beginning is not known (a school: the year of graduation is enough) - just the end, without a dash. A current entry without a start says "laufend".
#let period(item, o) = {
  let start = fmt-date(s(item, "startDate"), o)
  let current = item.at("isCurrent", default: false) == true
  let end = if current { if start == "" { tr(o, "laufend", "ongoing") } else { tr(o, "heute", "Present") } } else { fmt-date(s(item, "endDate"), o) }
  join-parts((start, end), " – ")
}

// Corner radius of a photo frame: "round" is a full circle, "rect" has square corners, everything else is softly rounded.
#let photo-radius(shape, rounded: 8pt) = if shape == "round" { 50% } else if shape == "rect" { 0pt } else { rounded }

#let full-name(data) = join-parts((s(data, "academicTitle"), s(data, "firstName"), s(data, "lastName")), " ")

// "Street, 12345 City, Country" as the parts of an address that exist.
#let address-parts(data, with-country: true) = {
  let town = join-parts((s(data, "postalCode"), s(data, "city")), " ")
  let parts = (s(data, "street"), town)
  if with-country { parts.push(s(data, "country")) }
  parts.filter(p => p != "")
}

// The "born on ..." details of the personal data.
#let personal-details(data, o, born: none) = {
  let dob = fmt-date(s(data, "dateOfBirth"), o)
  let pob = s(data, "placeOfBirth")
  let nat = s(data, "nationality")
  let ms = s(data, "maritalStatus")
  let parts = ()
  if dob != "" {
    let label = if born == none { tr(o, "Geboren am ", "Born on ") } else { born }
    parts.push(label + dob + if pob != "" { " in " + pob } else { "" })
  } else if pob != "" {
    parts.push(tr(o, "Geburtsort: ", "Place of birth: ") + pob)
  }
  if nat != "" { parts.push(tr(o, "Staatsangehörigkeit: ", "Nationality: ") + nat) }
  if ms != "" { parts.push(tr(o, "Familienstand: ", "Marital status: ") + ms) }
  parts
}

// The photo frame, or nothing when the photo is off or missing. The round shape is always a true circle, whatever frame the caller
// asks for: the shorter side is the diameter. Its picture is cut to a taller format and aligned at the top, so the crop keeps the
// head in the circle (a portrait photo has it in the upper part).
#let photo-box(photo, o, width: 80pt, height: 96pt, stroke: 1.5pt + rgb("#cbd5e1"), rounded: 8pt) = {
  if o.show-photo and photo != "" {
    if o.photo-shape == "round" {
      let side = calc.min(width, height)
      box(width: side, height: side, radius: 50%, clip: true, stroke: stroke, image(photo, width: 100%, height: 125%, fit: "cover"))
    } else {
      box(width: width, height: height, radius: photo-radius(o.photo-shape, rounded: rounded), clip: true, stroke: stroke)[
        #image(photo, width: 100%, height: 100%, fit: "cover")
      ]
    }
  }
}

// Lines of "Label: value" for the pairs that have a value, one per line.
#let labeled-lines(pairs, label-weight: "medium") = {
  let shown = pairs.filter(p => p.at(1) != "")
  shown.map(p => [#text(weight: label-weight)[#p.at(0)] #p.at(1)]).join(linebreak(), default: [])
}

// The mark of a break chance inside a word (a private-use character). cv-document turns it into an invisible empty box; a real
// zero-width space would end up in the text of the PDF and disturb copying.
#let cv-break-mark = "\u{E000}"

// Typst lets a word run over the column edge when it has no break chance, and data can hold such words (long links, made-up
// names). Words longer than `limit` characters get invisible break chances: after an @, then every `limit` characters.
#let soft-wrap(value, limit: 48) = value.replace(regex("\\S{" + str(limit + 1) + ",}"), m => {
  let zw = cv-break-mark
  m.text.replace("@", "@" + zw).split(zw).map(part => {
    if part.clusters().len() <= limit { part } else { part.clusters().chunks(limit).map(c => c.join("")).join(zw) }
  }).join(zw)
})

// Text for a narrow column. Every word that fits stays as it is. A word that is wider than the column is hyphenated when it is a
// normal word, otherwise (links, addresses, long codes) it breaks at its separators and, if needed, inside the pieces. Measured in the
// real font and size, so a word is only touched when it really does not fit.
#let fit-words(value) = layout(area => {
  let words = value.split(" ").filter(word => word != "").map(word => {
    let plain = word.replace(cv-break-mark, "")
    let wide = measure([#plain]).width
    if wide <= area.width { return word }
    let count = plain.clusters().len()
    if plain.match(regex("^\\p{L}+$")) != none and count <= 40 { return text(hyphenate: true, plain) }
    let limit = calc.max(1, int(area.width / (wide / count)))
    let separators = if plain.contains("@") { regex("@") } else { regex("[/._-]") }
    plain.replace(separators, m => m.text + cv-break-mark).split(cv-break-mark).map(piece => {
      if piece.clusters().len() <= limit { piece } else { piece.clusters().chunks(limit).map(c => c.join("")).join(cv-break-mark) }
    }).join(cv-break-mark)
  })
  [#words.join(" ", default: [])]
})

// A name in a large size: as large as asked, but never wider than the column, even for one very long word.
#let fit-name(name, size, ..args) = layout(area => {
  let style = args.named()
  let longest = name.split(regex("\\s+")).sorted(key: w => w.len()).last()
  let wide = measure(text(size: size, ..style, longest)).width
  let actual = if wide > area.width and wide > 0pt { calc.max(size * (area.width / wide) * 0.98, size * 0.6) } else { size }
  // Beyond that limit the word is broken instead of shrinking further
  let shown = if actual == size * 0.6 { soft-wrap(name, limit: calc.max(1, int(area.width / (wide / longest.clusters().len() * (actual / size))))) } else { name }
  set par(leading: 0.3em)
  text(size: actual, ..style, shown)
})

// The language level as stored by the app ("native" or a CEFR code like "C1") in the document language; free text stays as typed.
#let language-level(value, o) = if lower(value) == "native" { tr(o, "Muttersprache", "Native speaker") } else { value }

// The lines of a description without blank lines and without list markers the user typed at the start of a line.
#let description-lines(value) = {
  let marker = regex("^(?:[-–—*]\\s+|[•·▪‣]\\s*)")
  value.replace("\r\n", "\n").replace("\r", "\n").split("\n").map(line => line.trim().replace(marker, "").trim()).filter(line => line != "")
}

// The CV as data: everything a design may show, cleaned up once and in the document language. A design is only layout and style
// on top of this and never reads the raw data, so empty values, date ranges, skill grouping and headings are the same in all of them.
#let cv-model(data, o, photo) = {
  let t(de, en) = tr(o, de, en)
  let field(record, key) = soft-wrap(s(record, key))
  let entries(items, map) = items.map(map).filter(e => e.title != "" or e.sub != "" or e.desc != "")

  let experience = entries(data.at("experiences", default: ()), e => (
    title: field(e, "jobTitle"),
    sub: with-paren(join-parts((field(e, "employer"), field(e, "city")), ", "), field(e, "employmentType")),
    period: period(e, o),
    desc: field(e, "description"),
    note: "",
    inline: false,
  ))
  let education = entries(data.at("educations", default: ()), e => (
    title: join-parts((field(e, "degree"), field(e, "fieldOfStudy")), " – "),
    sub: with-paren(
      join-parts((field(e, "institution"), field(e, "city")), ", "),
      if s(e, "grade") != "" { t("Note: ", "Grade: ") + field(e, "grade") } else { "" },
    ),
    period: period(e, o),
    desc: field(e, "description"),
    note: "",
    inline: false,
  ))
  let certificates = entries(data.at("certificates", default: ()), c => (
    title: field(c, "title"),
    sub: field(c, "issuer"),
    period: fmt-date(s(c, "issueDate"), o),
    desc: "",
    note: if s(c, "credentialId") != "" { "(ID: " + field(c, "credentialId") + ")" } else { "" },
    inline: true,
  ))
  let custom = data.at("customSections", default: ()).map(sec => (
    kind: "entries",
    id: "custom",
    title: if s(sec, "title") != "" { field(sec, "title") } else { t("Zusatzabschnitt", "Custom section") },
    entries: entries(sec.at("items", default: ()), it => (
      title: field(it, "title"),
      sub: field(it, "subtitle"),
      period: field(it, "dateRange"),
      desc: field(it, "description"),
      note: "",
      inline: true,
    )),
  )).filter(sec => sec.entries.len() > 0)

  // Skills as a flat list and grouped by category; skills without a category form the group "General"
  let skills = data.at("skills", default: ()).map(sk => {
    let level = sk.at("level", default: 0)
    (name: field(sk, "name"), level: if type(level) == int { level } else { 0 }, category: field(sk, "category"))
  }).filter(sk => sk.name != "")
  let skill-groups = {
    let groups = (:)
    for sk in skills {
      let cat = if sk.category == "" { t("Allgemein", "General") } else { sk.category }
      if cat not in groups { groups.insert(cat, ()) }
      groups.at(cat).push(sk)
    }
    groups.pairs().map(((name, items)) => (name: name, items: items))
  }
  let languages = data.at("languages", default: ()).map(l => {
    let level = language-level(field(l, "level"), o)
    (name: field(l, "language"), level: level, text: with-paren(field(l, "language"), level))
  }).filter(l => l.text != "")
  let interests = data.at("interests", default: ()).map(i => (
    text: with-paren(field(i, "name"), field(i, "category")),
    desc: field(i, "description"),
  )).filter(i => i.text != "" or i.desc != "")

  let section(id, title, kind, payload) = (id: id, title: title, kind: kind) + payload
  (
    name: full-name(data),
    initials: (s(data, "firstName"), s(data, "lastName")).filter(x => x != "").map(x => upper(x.clusters().first())).join("", default: ""),
    job-title: field(data, "professionalTitle"),
    photo: if o.show-photo and photo != "" { photo } else { "" },
    contact: (
      email: (label: "E-Mail", value: field(data, "email")),
      phone: (label: t("Telefon", "Phone"), value: field(data, "phone")),
      address: (label: t("Adresse", "Address"), value: join-parts(address-parts(data), ", "), parts: address-parts(data)),
      website: (label: "Web", value: field(data, "website")),
      linkedin: (label: "LinkedIn", value: field(data, "linkedIn")),
      github: (label: "GitHub", value: field(data, "gitHub")),
      xing: (label: "Xing", value: field(data, "xing")),
    ),
    address-lines: address-parts(data),
    personal: personal-details(data, o),
    birth: (
      date: fmt-date(s(data, "dateOfBirth"), o),
      place: field(data, "placeOfBirth"),
      nationality: field(data, "nationality"),
      marital: field(data, "maritalStatus"),
    ),
    bio: field(data, "bio"),
    labels: (
      skills: t("Kenntnisse", "Skills"),
      languages: t("Sprachen", "Languages"),
      interests: t("Interessen", "Interests"),
      personal: t("Persönliches", "Personal"),
      contact: t("Kontakt", "Contact"),
      links: t("Links & Profile", "Links & profiles"),
      profile: t("Profil", "Profile"),
      about: t("Kurzprofil", "About me"),
      summary: t("Profil", "Summary"),
      language-skills: t("Sprachkenntnisse", "Language skills"),
      birth-date: t("Geburtsdatum", "Date of birth"),
      nationality: t("Nationalität", "Nationality"),
      marital: t("Familienstand", "Marital status"),
      core: t("Kernkompetenzen", "Core competencies"),
    ),
    experience: section("experience", t("Berufserfahrung", "Work experience"), "entries", (entries: experience)),
    education: section("education", t("Ausbildung", "Education"), "entries", (entries: education)),
    certificates: section("certificates", t("Zertifikate & Weiterbildung", "Certificates & training"), "entries", (entries: certificates)),
    custom: custom,
    skills: section("skills", t("Kenntnisse", "Skills"), "skills", (items: skills, groups: skill-groups, has-categories: skills.any(sk => sk.category != ""))),
    languages: section("languages", t("Sprachen", "Languages"), "languages", (items: languages)),
    interests: section("interests", t("Interessen & Aktivitäten", "Interests & activities"), "interests", (items: interests)),
  )
}

// The sections of a model that have content, in the given order ("custom" stands for all own sections).
#let pick-sections(m, order) = {
  let result = ()
  for id in order {
    if id == "custom" { result += m.custom; continue }
    let sec = m.at(id)
    if (if sec.kind == "entries" { sec.entries.len() } else { sec.items.len() }) > 0 { result.push(sec) }
  }
  result
}

// The filled contact details for the given keys, in that order, as (label:, value:).
#let pick-contact(m, keys) = keys.map(k => m.contact.at(k)).filter(c => c.value != "")
