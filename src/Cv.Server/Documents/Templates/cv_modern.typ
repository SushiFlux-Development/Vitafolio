// Design "Modern": a tinted card on the left (photo, contact, skills, languages, interests) next to the main column with the name.
#let design-modern = (
  page: o => (margin: 1.4cm),
  body: (m, o) => {
    set text(font: o.fonts, size: 9.5pt, fill: rgb("#1e293b"), lang: o.lang)
    let accent = o.accent-text
    let st = cv-style(o, title: 10.5pt, date-fill: accent, date-weight: "bold")

    let main-heading(title) = keep-heading(above: 12pt, below: 5pt, block(
      width: 100%,
      stroke: (bottom: 1.5pt + o.accent-rule),
      inset: (bottom: 2.5pt),
      text(size: 11pt, weight: "bold", fill: accent)[#upper(title)],
    ))
    let side-heading(title) = keep-heading(above: 10pt, below: 4pt, block(
      width: 100%,
      stroke: (bottom: 0.75pt + rgb("#cbd5e1")),
      inset: (bottom: 2pt),
      text(size: 9.5pt, weight: "bold", fill: accent)[#upper(title)],
    ))
    let label-fill = rgb("#475569")
    let side-item(label, value) = side-pair(label, value, label-fill: label-fill)

    let side = block(fill: rgb("#f8fafc"), inset: (x: 10pt, y: 12pt), radius: 6pt, stroke: 0.5pt + rgb("#e2e8f0"), width: 100%, {
      if m.photo != "" {
        align(center, cv-photo(m, o, width: 85pt, stroke: 2pt + o.accent-rule))
        v(8pt)
      }
      let contact = pick-contact(m, ("email", "phone", "address"))
      if contact.len() > 0 {
        side-heading(m.labels.contact)
        for c in contact { contact-pair(c, label-fill: label-fill) }
      }
      let links = pick-contact(m, ("website", "linkedin", "github", "xing"))
      if links.len() > 0 {
        side-heading(m.labels.links)
        for c in links { contact-pair(c, label-fill: label-fill) }
      }
      let b = m.birth
      if b.date != "" or b.place != "" or b.nationality != "" or b.marital != "" {
        side-heading(m.labels.personal)
        side-item(m.labels.birth-date, with-paren(b.date, b.place))
        side-item(m.labels.nationality, b.nationality)
        side-item(m.labels.marital, b.marital)
      }
      if m.skills.items.len() > 0 {
        side-heading(m.labels.skills)
        skill-rows(m.skills, st, o.accent-rule, rgb("#e2e8f0"))
      }
      if m.languages.items.len() > 0 {
        side-heading(m.labels.languages)
        language-rows(m.languages, st)
      }
      if m.interests.items.len() > 0 {
        side-heading(m.labels.interests)
        interest-list(m.interests, st)
      }
    })

    let main = {
      fit-name(m.name, 22pt, weight: "bold", fill: accent)
      if m.job-title != "" { block(above: 9pt, below: 0pt, text(size: 13pt, fill: rgb("#475569"))[#m.job-title]) }
      block(above: 6pt, below: 0pt, line(length: 100%, stroke: 2pt + o.accent-rule))
      if m.bio != "" {
        main-heading(m.labels.profile)
        text(size: 9.5pt, style: "italic", fill: rgb("#334155"))[#multiline(m.bio)]
      }
      cv-sections(pick-sections(m, ("experience", "education", "certificates", "custom")), (
        heading: main-heading,
        entry: e => entry-right(e, st),
      ))
    }

    main-first(1fr, 165pt, 20pt, main, side)
  },
)
