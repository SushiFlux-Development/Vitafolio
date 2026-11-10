// Design "Kompakt": tight margins for long careers. The career runs over the full width, everything else in two columns below it.
#let design-compact = (
  page: o => (margin: (left: 12mm, right: 12mm, top: 11mm, bottom: 12mm)),
  body: (m, o) => {
    set text(font: o.fonts, size: 9.5pt, fill: rgb("#1e293b"), lang: o.lang)
    set par(leading: 0.55em)
    let st = cv-style(o, title: 10pt, gap: 8pt)
    let on-tint = readable-on(o.accent, o.accent-tint)
    let has-photo = m.photo != ""
    let contact = pick-contact(m, ("email", "phone", "address", "website", "linkedin", "github", "xing"))

    let heading(title) = keep-heading(above: 9pt, below: 4pt, block(
      width: 100%,
      fill: o.accent-tint,
      inset: (x: 5pt, y: 3pt),
      text(size: 9.5pt, weight: "bold", tracking: 0.8pt, fill: on-tint)[#upper(title)],
    ))

    grid(
      columns: if has-photo { (auto, 1fr, 40%) } else { (1fr, 40%) },
      column-gutter: 10pt,
      align: horizon,
      ..if has-photo { (cv-photo(m, o, width: 46pt, stroke: 1pt + o.accent-rule, rounded: 4pt),) } else { () },
      {
        fit-name(m.name, 20pt, weight: "bold", fill: o.accent-text)
        if m.job-title != "" { block(above: 8pt, below: 0pt, text(size: 11pt, fill: rgb("#475569"))[#m.job-title]) }
      },
      align(right, text(size: 9pt, fill: rgb("#475569"), glued-join(contact-values(contact)))),
    )
    if m.personal.len() > 0 { block(above: 5pt, below: 0pt, text(size: 9pt, fill: rgb("#475569"), glued-join(m.personal))) }
    if m.bio != "" { block(above: 7pt, below: 0pt, text(size: 9.5pt)[#multiline(m.bio)]) }

    let renderers = (
      heading: heading,
      entry: e => entry-right(e, st),
      skills: sec => skill-stack(sec, st),
      languages: sec => language-line(sec, st, sep: " · "),
      interests: sec => interest-list(sec, st, sep: " · "),
    )

    cv-sections(pick-sections(m, ("experience",)), renderers)

    // Two fixed columns instead of flowing ones: they are filled side by side from the top, however short the content is.
    let left-sections = pick-sections(m, ("education", "certificates", "custom"))
    let right-sections = pick-sections(m, ("skills", "languages", "interests"))
    if left-sections.len() + right-sections.len() > 0 {
      grid(
        columns: if left-sections.len() > 0 and right-sections.len() > 0 { (1fr, 1fr) } else { (1fr,) },
        column-gutter: 14pt,
        ..if left-sections.len() > 0 { (cv-sections(left-sections, renderers),) } else { () },
        ..if right-sections.len() > 0 { (cv-sections(right-sections, renderers),) } else { () },
      )
    }
  },
)
