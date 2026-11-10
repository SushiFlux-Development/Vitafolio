// Design "Klassisch": single column, a date column on the left, accent-coloured headings with a rule below.
#let design-classic = (
  page: o => (margin: (top: 2cm, bottom: 2cm, left: 2.2cm, right: 2.2cm)),
  body: (m, o) => {
    set text(font: o.fonts, size: 9.5pt, fill: rgb("#1e293b"), lang: o.lang)
    let st = cv-style(o, title: 10pt)
    let heading(title) = keep-heading(above: 15pt, below: 6pt, block(
      width: 100%,
      stroke: (bottom: 1pt + o.accent-rule),
      inset: (bottom: 3pt),
      text(size: 11.5pt, weight: "bold", fill: o.accent-text)[#upper(title)],
    ))
    let has-photo = m.photo != ""

    // Header: name, title, contact details and the photo
    grid(
      columns: if has-photo { (1fr, auto) } else { (1fr,) },
      gutter: 20pt,
      align: (left + horizon, right + horizon),
      [
        #fit-name(m.name, 20pt, weight: "bold", fill: o.accent-text)
        #if m.job-title != "" {
          block(above: 9pt, below: 0pt, text(size: 12pt, fill: rgb("#475569"))[#m.job-title])
        }
        #block(above: 8pt, below: 0pt, grid(
          align: top,
          columns: (auto, auto),
          column-gutter: 14pt,
          text(size: 9pt, fill: rgb("#475569"), labeled-lines(pick-contact(m, ("email", "phone", "address")).map(c => (c.label + ":", contact-value(c))), label-weight: "regular")),
          text(size: 9pt, fill: rgb("#475569"), labeled-lines(pick-contact(m, ("website", "linkedin", "github", "xing")).map(c => (c.label + ":", contact-value(c))), label-weight: "regular")),
        ))
      ],
      ..if has-photo { (cv-photo(m, o, width: 80pt),) } else { () },
    )

    if m.personal.len() > 0 { block(above: 5pt, below: 0pt, text(size: 9pt, fill: rgb("#475569"))[#m.personal.join("  |  ")]) }

    if m.bio != "" {
      heading(m.labels.about)
      text(size: 9.5pt, style: "italic")[#multiline(m.bio)]
    }

    cv-sections(pick-sections(m, ("experience", "education", "skills", "languages", "certificates", "interests", "custom")), (
      heading: heading,
      entry: e => entry-left(e, st),
      skills: sec => skill-lines(sec, st),
      languages: sec => block(above: 0pt, below: 4pt, grid(
        columns: (110pt, 1fr),
        column-gutter: 14pt,
        text(size: st.small, weight: "bold", fill: st.date-fill)[#m.labels.language-skills],
        language-line(sec, st),
      )),
      interests: sec => interest-list(sec, st),
    ))
  },
)
