// Design "Elegant": everything on the centre axis: a letterspaced name, fine double rules, headings between hairlines.
#let design-elegant = (
  page: o => (margin: (left: 25mm, right: 25mm, top: 20mm, bottom: 18mm)),
  body: (m, o) => {
    set text(font: o.fonts, size: 9.5pt, fill: rgb("#1e293b"), lang: o.lang)
    let st = cv-style(o, sub-style: "italic", date-style: "italic", gap: 9.5pt)

    let heading(title) = keep-heading(above: 14pt, below: 7pt, grid(
      columns: (1fr, auto, 1fr),
      column-gutter: 10pt,
      align: horizon,
      line(length: 100%, stroke: 0.5pt + o.accent-rule),
      text(size: 10pt, tracking: 2.4pt, fill: o.accent-text)[#upper(title)],
      line(length: 100%, stroke: 0.5pt + o.accent-rule),
    ))

    align(center, {
      if m.photo != "" {
        cv-photo(m, o, width: 62pt, stroke: 0.75pt + o.accent-rule)
        v(8pt)
      }
      fit-name(upper(m.name), 24pt, tracking: 3pt, fill: rgb("#0f172a"))
      if m.job-title != "" { block(above: 10pt, below: 0pt, text(size: 10pt, tracking: 1.6pt, fill: o.accent-text)[#upper(m.job-title)]) }
      let contact = pick-contact(m, ("email", "phone", "address", "website", "linkedin", "github", "xing"))
      if contact.len() > 0 { block(above: 10pt, below: 0pt, text(size: 9.5pt, fill: rgb("#475569"), glued-join(contact-values(contact)))) }
      if m.personal.len() > 0 { block(above: 4pt, below: 0pt, text(size: 9.5pt, fill: rgb("#475569"), glued-join(m.personal))) }
      block(above: 11pt, below: 2pt, line(length: 100%, stroke: 0.5pt + o.accent-rule))
      block(above: 0pt, below: 0pt, line(length: 100%, stroke: 0.5pt + o.accent-rule))
    })

    if m.bio != "" {
      block(above: 12pt, below: 0pt, align(center, block(width: 88%, text(size: 10.5pt, style: "italic")[#multiline(m.bio)])))
    }

    cv-sections(pick-sections(m, ("experience", "education", "skills", "languages", "certificates", "interests", "custom")), (
      heading: heading,
      entry: e => entry-right(e, st),
      skills: sec => skill-lines(sec, st, label-width: 96pt, sep: "  ·  "),
      languages: sec => align(center, language-line(sec, st, sep: "  ·  ")),
      interests: sec => align(center, interest-list(sec, st, sep: "  ·  ")),
    ))
  },
)
