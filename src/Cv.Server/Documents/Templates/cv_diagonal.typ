// Design "Diagonale": a colour plane with a slanted right edge carrying the name, a fine parallel sliver beside it, dates in a column of their own.
#let design-diagonal = (
  page: o => (
    margin: (left: 20mm, right: 18mm, top: 18mm, bottom: 15mm),
    background: {
      let p = shape-palette(o)
      place(top + left, polygon(fill: p.solid, (0pt, 0pt), (64pt, 0pt), (0pt, 40pt)))
      place(top + left, polygon(fill: p.tint, (70pt, 0pt), (80pt, 0pt), (0pt, 50pt), (0pt, 44pt)))
    },
  ),
  body: (m, o) => {
    set text(font: o.fonts, size: 9.5pt, fill: rgb("#1e293b"), lang: o.lang)
    let p = shape-palette(o)
    let on = p.ink
    let st = cv-style(o, date-fill: o.accent-text, date-weight: "bold")
    let has-photo = m.photo != ""
    let (ml, mt) = (20mm, 18mm)
    let text-width = 100mm
    let photo-w = 98pt

    let heading(title) = keep-heading(above: 16pt, below: 7pt, grid(
      columns: (auto, 1fr),
      column-gutter: 7pt,
      align: horizon,
      polygon(fill: o.accent-rule, (3pt, 0pt), (10pt, 0pt), (7pt, 10pt), (0pt, 10pt)),
      text(size: 12pt, weight: "bold", fill: rgb("#0f172a"))[#title],
    ))

    let head = block(width: text-width, {
      set text(fill: on)
      fit-name(m.name, 27pt, weight: "bold", fill: on)
      if m.job-title != "" { block(above: 11pt, below: 0pt, text(size: 12.5pt)[#m.job-title]) }
      let contact = pick-contact(m, ("email", "phone", "address", "website", "linkedin", "github", "xing"))
      if contact.len() > 0 { block(above: 10pt, below: 0pt, text(size: 9.5pt, glued-join(contact-values(contact)))) }
      if m.personal.len() > 0 { block(above: 5pt, below: 0pt, text(size: 9.5pt, glued-join(m.personal))) }
    })

    layout(size => {
      let h = measure(head).height
      let total = calc.max(mt + h + 26pt, if has-photo { 170pt } else { 150pt })
      let W = 210mm
      block(width: 100%, height: total - mt + 16pt, {
        place(top + left, dx: -ml, dy: -mt, {
          polygon(fill: p.tint, (0pt, 0pt), (W * 0.92, 0pt), (W * 0.68, total + 4pt), (0pt, total + 4pt))
          place(top + left, polygon(fill: gradient.linear(p.solid, p.deep, angle: 30deg), (0pt, 0pt), (W * 0.86, 0pt), (W * 0.63, total), (0pt, total)))
        })
        if has-photo { place(top + right, dy: 2pt, cv-photo(m, o, width: photo-w, stroke: 2.5pt + white)) }
        head
      })
    })

    if m.bio != "" { block(above: 0pt, below: 4pt, text(size: 10.5pt, fill: rgb("#334155"))[#multiline(m.bio)]) }

    cv-sections(pick-sections(m, ("experience", "education", "skills", "languages", "certificates", "interests", "custom")), (
      heading: heading,
      entry: e => entry-left(e, st, date-width: 92pt),
      skills: sec => skill-lines(sec, st, label-width: 92pt),
      languages: sec => block(above: 0pt, below: 4pt, grid(columns: (92pt, 1fr), column-gutter: 14pt, text(size: st.small, weight: "bold", fill: st.date-fill)[#m.labels.language-skills], language-line(sec, st))),
      interests: sec => interest-list(sec, st),
    ))
  },
)
