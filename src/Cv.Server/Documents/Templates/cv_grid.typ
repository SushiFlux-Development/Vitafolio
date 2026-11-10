// Design "Raster": a strict two-part grid: section titles in a column of their own on the left, content on the right, a thin line above each section.
#let design-grid = (
  page: o => (margin: (left: 16mm, right: 16mm, top: 16mm, bottom: 16mm)),
  body: (m, o) => {
    set text(font: o.fonts, size: 9.5pt, fill: rgb("#1e293b"), lang: o.lang)
    let st = cv-style(o, gap: 10pt, date-fill: o.accent-text)
    let label-width = 88pt
    let gutter = 14pt
    let has-photo = m.photo != ""

    // A row of the grid: its title stays with the first line of the content because both sit in the same row.
    let row(title, body) = block(
      width: 100%,
      above: 11pt,
      below: 0pt,
      stroke: (top: 0.75pt + rgb("#0f172a")),
      inset: (top: 6pt),
      grid(
        columns: (label-width, 1fr),
        column-gutter: gutter,
        text(size: 9.5pt, weight: "bold", fill: o.accent-text)[#soft-wrap(title, limit: 16)],
        body,
      ),
    )

    grid(
      columns: if has-photo { (1fr, auto) } else { (1fr,) },
      column-gutter: gutter,
      align: (left + bottom, right + bottom),
      {
        fit-name(m.name, 30pt, weight: "bold", fill: rgb("#0f172a"))
        if m.job-title != "" { block(above: 12pt, below: 0pt, text(size: 12.5pt, fill: rgb("#475569"))[#m.job-title]) }
      },
      ..if has-photo { (cv-photo(m, o, width: 76pt, stroke: none, rounded: 0pt),) } else { () },
    )
    v(4pt)

    let contact = pick-contact(m, ("email", "phone", "address", "website", "linkedin", "github", "xing"))
    if contact.len() > 0 or m.personal.len() > 0 {
      row(m.labels.contact, text(size: 9.5pt, {
        glued-join(contact-values(contact))
        if contact.len() > 0 and m.personal.len() > 0 { linebreak() }
        glued-join(m.personal)
      }))
    }
    if m.bio != "" { row(m.labels.profile, text(size: 9.5pt)[#multiline(m.bio)]) }

    for sec in pick-sections(m, ("experience", "education", "skills", "languages", "certificates", "interests", "custom")) {
      row(sec.title, if sec.kind == "entries" {
        for e in sec.entries { entry-right(e, st) }
      } else if sec.kind == "skills" {
        skill-paragraphs(sec, st)
      } else if sec.kind == "languages" {
        language-line(sec, st)
      } else {
        interest-list(sec, st)
      })
    }
  },
)
