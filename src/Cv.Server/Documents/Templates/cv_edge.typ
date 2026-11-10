// Design "Kante": a narrow accent strip at the page edge on every page and a very large name; dates above the titles, no rules at all.
#let design-edge = (
  page: o => (
    margin: (left: 26mm, right: 16mm, top: 18mm, bottom: 16mm),
    background: place(top + left, rect(width: 7mm, height: 100%, fill: o.accent)),
  ),
  body: (m, o) => {
    set text(font: o.fonts, size: 9.5pt, fill: rgb("#1e293b"), lang: o.lang)
    let st = cv-style(o, title: 11pt, gap: 10pt)
    let has-photo = m.photo != ""

    let heading(title) = keep-heading(above: 15pt, below: 6pt, text(size: 14pt, weight: "bold", fill: o.accent-text)[#title])

    grid(
      columns: if has-photo { (1fr, auto) } else { (1fr,) },
      column-gutter: 16pt,
      align: (left + top, right + top),
      {
        set par(leading: 0.35em)
        fit-name(m.name, 38pt, weight: "bold", fill: rgb("#0f172a"))
        if m.job-title != "" { block(above: 14pt, below: 0pt, text(size: 14pt, fill: o.accent-text)[#m.job-title]) }
      },
      ..if has-photo { (cv-photo(m, o, width: 82pt, stroke: none, rounded: 0pt),) } else { () },
    )

    let contact = pick-contact(m, ("email", "phone", "address", "website", "linkedin", "github", "xing"))
    if contact.len() > 0 {
      block(above: 11pt, below: 0pt, text(size: 9.5pt, fill: rgb("#475569"), glued-join(contact-values(contact), sep: "/")))
    }
    if m.personal.len() > 0 { block(above: 4pt, below: 0pt, text(size: 9.5pt, fill: rgb("#475569"), glued-join(m.personal, sep: "/"))) }
    if m.bio != "" { block(above: 15pt, below: 0pt, text(size: 11pt)[#multiline(m.bio)]) }

    cv-sections(pick-sections(m, ("experience", "education", "skills", "languages", "certificates", "interests", "custom")), (
      heading: heading,
      entry: e => entry-date-above(e, st),
      skills: sec => skill-paragraphs(sec, st),
      languages: sec => language-line(sec, st),
      interests: sec => interest-list(sec, st),
    ))
  },
)
