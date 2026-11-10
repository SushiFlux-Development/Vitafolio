// Design "Facette": delicate triangles in tints of the accent colour along the right edge, thinning out towards the text.
#let facet-strip(o, rows) = {
  let base = o.accent-rule
  let (s, W) = (28pt, 210mm)
  let shades = (90%, 86%, 94%, 82%, 88%, 96%, 84%)
  // Column 0 is at the page edge and solid, column 2 faces the text and is sparse. The pattern is fixed, so a document looks the same every time.
  for r in range(rows) {
    for c in range(3) {
      let (x, y) = (W - s * (c + 1), s * r)
      for half in (0, 1) {
        let n = r * 13 + c * 7 + half * 5
        if c == 2 and calc.rem(n, 3) != 0 { continue }
        if c == 1 and calc.rem(n, 5) == 1 { continue }
        let tone = shades.at(calc.rem(n, shades.len()))
        let flip = calc.rem(r + c, 2) == 0
        let points = if flip {
          if half == 0 { ((0pt, 0pt), (s, 0pt), (0pt, s)) } else { ((s, 0pt), (s, s), (0pt, s)) }
        } else {
          if half == 0 { ((0pt, 0pt), (s, 0pt), (s, s)) } else { ((0pt, 0pt), (s, s), (0pt, s)) }
        }
        place(top + left, dx: x, dy: y, polygon(fill: base.lighten(tone), ..points))
      }
    }
  }
}

#let design-facet = (
  page: o => (
    margin: (left: 20mm, right: 34mm, top: 18mm, bottom: 15mm),
    background: first-or-later(facet-strip(o, 31), facet-strip(o, 7)),
  ),
  body: (m, o) => {
    set text(font: o.fonts, size: 9.5pt, fill: rgb("#1e293b"), lang: o.lang)
    cv-start-mark
    let st = cv-style(o)
    let has-photo = m.photo != ""

    let heading(title) = keep-heading(above: 16pt, below: 7pt, grid(
      columns: (auto, 1fr),
      column-gutter: 7pt,
      align: horizon,
      polygon(fill: o.accent-rule, (0pt, 0pt), (9pt, 5pt), (0pt, 10pt)),
      text(size: 12pt, weight: "bold", fill: rgb("#0f172a"))[#title],
    ))

    grid(
      columns: if has-photo { (1fr, auto) } else { (1fr,) },
      column-gutter: 16pt,
      align: (left + bottom, right + bottom),
      {
        fit-name(m.name, 30pt, weight: "bold", fill: rgb("#0f172a"))
        if m.job-title != "" { block(above: 12pt, below: 0pt, text(size: 13pt, fill: o.accent-text)[#m.job-title]) }
      },
      ..if has-photo { (cv-photo(m, o, width: 80pt, stroke: 1.5pt + o.accent-rule),) } else { () },
    )
    let contact = pick-contact(m, ("email", "phone", "address", "website", "linkedin", "github", "xing"))
    if contact.len() > 0 { block(above: 12pt, below: 0pt, text(size: 9.5pt, fill: rgb("#475569"), glued-join(contact-values(contact)))) }
    if m.personal.len() > 0 { block(above: 5pt, below: 0pt, text(size: 9.5pt, fill: rgb("#475569"), glued-join(m.personal))) }
    if m.bio != "" { block(above: 12pt, below: 0pt, text(size: 10.5pt, fill: rgb("#334155"))[#multiline(m.bio)]) }

    cv-sections(pick-sections(m, ("experience", "education", "skills", "languages", "certificates", "interests", "custom")), (
      heading: heading,
      entry: e => entry-right(e, st),
      skills: sec => skill-paragraphs(sec, st),
      languages: sec => language-line(sec, st),
      interests: sec => interest-list(sec, st),
    ))
  },
)
