// Design "Bogen": large circle segments and fine concentric rings running over the upper right corner; the name stands free on white.
#let arc-art(o, big: true) = {
  let p = shape-palette(o)
  let W = 210mm
  // Everything is centred slightly outside the corner, so the circles run off the page
  let at(r, shape) = place(top + left, dx: W + 6pt - r, dy: -14pt - r, shape)
  if big {
    at(176pt, circle(radius: 176pt, fill: p.tint))
    at(112pt, circle(radius: 112pt, fill: gradient.linear(p.solid, p.deep, angle: 45deg)))
    for (r, weight) in ((132pt, 0.5pt), (150pt, 0.75pt), (196pt, 0.5pt), (216pt, 0.4pt)) {
      at(r, circle(radius: r, stroke: weight + o.accent-rule))
    }
  } else {
    for (r, weight) in ((34pt, 0.75pt), (48pt, 0.5pt), (62pt, 0.4pt)) {
      at(r, circle(radius: r, stroke: weight + o.accent-rule))
    }
  }
}

#let design-arc = (
  page: o => (
    margin: (left: 20mm, right: 18mm, top: 18mm, bottom: 15mm),
    background: first-or-later(arc-art(o), arc-art(o, big: false)),
  ),
  body: (m, o) => {
    set text(font: o.fonts, size: 9.5pt, fill: rgb("#1e293b"), lang: o.lang)
    cv-start-mark
    let p = shape-palette(o)
    let st = cv-style(o, gap: 10pt)
    let has-photo = m.photo != ""
    let (mt, reserve) = (18mm, 190pt)

    let heading(title) = keep-heading(above: 15pt, below: 7pt, text(size: 12pt, weight: "bold", fill: o.accent-text)[#title])

    let head = {
      fit-name(m.name, 30pt, weight: "bold", fill: rgb("#0f172a"))
      if m.job-title != "" { block(above: 12pt, below: 0pt, text(size: 13pt, fill: o.accent-text)[#m.job-title]) }
      let contact = pick-contact(m, ("email", "phone", "address", "website", "linkedin", "github", "xing"))
      if contact.len() > 0 { block(above: 10pt, below: 0pt, text(size: 9.5pt, fill: rgb("#475569"), glued-join(contact-values(contact)))) }
      if m.personal.len() > 0 { block(above: 6pt, below: 0pt, text(size: 9.5pt, fill: rgb("#475569"), glued-join(m.personal))) }
    }

    layout(size => {
      let inner = block(width: size.width - reserve, head)
      let h = measure(inner).height
      block(width: 100%, height: calc.max(h + 14pt, 200pt - mt), {
        if has-photo { place(top + right, dx: -10pt, dy: 18pt, cv-photo(m, o, width: 86pt, stroke: 2.5pt + white)) }
        inner
      })
    })

    if m.bio != "" { block(above: 0pt, below: 4pt, text(size: 10pt, fill: rgb("#334155"))[#multiline(m.bio)]) }

    cv-sections(pick-sections(m, ("experience", "education", "skills", "languages", "certificates", "interests", "custom")), (
      heading: heading,
      entry: e => entry-right(e, st),
      skills: sec => skill-lines(sec, st, label-width: 104pt),
      languages: sec => language-line(sec, st),
      interests: sec => interest-list(sec, st),
    ))
  },
)
