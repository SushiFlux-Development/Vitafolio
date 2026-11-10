// Design "Welle": a head area with a flowing edge and a soft gradient, the photo sitting on the edge; a slim echo of the wave on the next pages.
#let wave-edge(h, W: 210mm) = (
  curve.line((W, h - 48pt)),
  curve.cubic((W * 0.62, h + 36pt), (W * 0.36, h - 86pt), (0pt, h - 12pt)),
)

#let wave-fill(p) = gradient.linear(p.solid, p.deep, angle: 18deg)

#let design-wave = (
  page: o => (
    margin: (left: 20mm, right: 18mm, top: 16mm, bottom: 13mm),
    background: {
      let p = shape-palette(o)
      place(top + left, curve(
        fill: wave-fill(p),
        curve.move((0pt, 0pt)),
        curve.line((210mm, 0pt)),
        curve.line((210mm, 12pt)),
        curve.cubic((210mm * 0.62, 34pt), (210mm * 0.36, -10pt), (0pt, 24pt)),
        curve.close(),
      ))
    },
  ),
  body: (m, o) => {
    set text(font: o.fonts, size: 9.5pt, fill: rgb("#1e293b"), lang: o.lang)
    let p = shape-palette(o)
    let on = p.ink
    let st = cv-style(o, gap: 8.5pt)
    let has-photo = m.photo != ""
    let (ml, mt) = (20mm, 16mm)
    let photo-w = 92pt

    let heading(title) = keep-heading(above: 15pt, below: 7pt, {
      text(size: 12.5pt, weight: "bold", fill: o.accent-text)[#title]
      h(8pt)
      box(baseline: 1pt, width: 30pt, height: 7pt, curve(
        stroke: 1.5pt + o.accent-rule,
        curve.move((0pt, 3pt)),
        curve.cubic((10pt, -1pt), (18pt, 7pt), (30pt, 3pt)),
      ))
    })

    let head = {
      set text(fill: on)
      fit-name(m.name, 30pt, weight: "bold", fill: on)
      if m.job-title != "" { block(above: 12pt, below: 0pt, text(size: 13pt)[#m.job-title]) }
      let contact = pick-contact(m, ("email", "phone", "address", "website", "linkedin", "github", "xing"))
      if contact.len() > 0 { block(above: 10pt, below: 0pt, text(size: 9.5pt, glued-join(contact-values(contact)))) }
      if m.personal.len() > 0 { block(above: 5pt, below: 0pt, text(size: 9.5pt, glued-join(m.personal))) }
    }

    layout(size => {
      let inner = block(width: size.width - if has-photo { photo-w + 22pt } else { 0pt }, head)
      let h = measure(inner).height
      let total = calc.max(mt + h + 50pt, 160pt)
      let photo-h = if o.photo-shape == "round" { photo-w } else { photo-w * 1.2 }
      block(width: 100%, height: total - mt + if has-photo { 26pt } else { 14pt }, {
        place(top + left, dx: -ml, dy: -mt, {
          curve(fill: wave-fill(p), curve.move((0pt, 0pt)), curve.line((210mm, 0pt)), ..wave-edge(total), curve.close())
          place(top + left, curve(stroke: 0.75pt + p.deep.transparentize(35%), curve.move((0pt, total - 3pt)), curve.cubic((210mm * 0.36, total - 77pt), (210mm * 0.62, total + 45pt), (210mm, total - 39pt))))
        })
        if has-photo {
          place(top + right, dy: total - mt - 44pt - photo-h / 2, cv-photo(m, o, width: photo-w, stroke: 2.5pt + white))
        }
        inner
      })
    })

    if m.bio != "" { block(above: 0pt, below: 4pt, text(size: 10.5pt, fill: rgb("#334155"))[#multiline(m.bio)]) }

    cv-sections(pick-sections(m, ("experience", "education", "skills", "languages", "certificates", "interests", "custom")), (
      heading: heading,
      entry: e => entry-right(e, st),
      skills: sec => skill-paragraphs(sec, st),
      languages: sec => language-line(sec, st),
      interests: sec => interest-list(sec, st),
    ))
  },
)
