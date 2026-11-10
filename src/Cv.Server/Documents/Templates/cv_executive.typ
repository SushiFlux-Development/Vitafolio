// Design "Führung": the summary as a highlighted block in the accent colour, core competencies in a row of three, then the career.
#let design-executive = (
  page: o => (margin: (left: 20mm, right: 20mm, top: 18mm, bottom: 16mm)),
  body: (m, o) => {
    set text(font: o.fonts, size: 9.5pt, fill: rgb("#1e293b"), lang: o.lang)
    let on = o.on-accent
    let st = cv-style(o, title: 11pt, gap: 10pt)
    let has-photo = m.photo != ""
    let contact = pick-contact(m, ("email", "phone", "address", "website", "linkedin", "github", "xing"))

    let heading(title) = keep-heading(above: 15pt, below: 7pt, block(
      width: 100%,
      stroke: (bottom: 0.5pt + rgb("#94a3b8")),
      inset: (bottom: 4pt),
      text(size: 11pt, weight: "bold", fill: rgb("#0f172a"))[#title],
    ))

    grid(
      columns: if has-photo { (1fr, 36%, auto) } else { (1fr, 36%) },
      column-gutter: 16pt,
      align: horizon,
      {
        fit-name(m.name, 28pt, weight: "bold", fill: rgb("#0f172a"))
        if m.job-title != "" { block(above: 11pt, below: 0pt, text(size: 13pt, weight: "bold", fill: o.accent-text)[#m.job-title]) }
      },
      align(right, text(size: 9.5pt, fill: rgb("#475569"))[#contact.map(contact-value).join(linebreak(), default: [])]),
      ..if has-photo { (cv-photo(m, o, width: 66pt, stroke: 1.5pt + o.accent-rule),) } else { () },
    )
    if m.personal.len() > 0 { block(above: 7pt, below: 0pt, text(size: 9pt, fill: rgb("#475569"))[#m.personal.join("  ·  ")]) }

    if m.bio != "" {
      block(above: 13pt, below: 0pt, width: 100%, fill: o.accent, inset: 14pt, radius: 2pt, {
        set text(fill: on)
        text(size: 9.5pt, weight: "bold", tracking: 1.2pt)[#upper(m.labels.about)]
        block(above: 5pt, below: 0pt, text(size: 11pt)[#multiline(m.bio)])
      })
    }

    if m.skills.items.len() > 0 {
      heading(m.labels.core)
      grid(
        columns: (1fr, 1fr, 1fr),
        column-gutter: 14pt,
        row-gutter: 5pt,
        ..m.skills.items.map(sk => text(size: 9.5pt)[#text(fill: o.accent-rule)[▪] #soft-wrap(skill-label(sk), limit: 24)]),
      )
    }

    cv-sections(pick-sections(m, ("experience", "education", "languages", "certificates", "interests", "custom")), (
      heading: heading,
      entry: e => entry-right(e, st),
      languages: sec => language-line(sec, st),
      interests: sec => interest-list(sec, st),
    ))
  },
)
