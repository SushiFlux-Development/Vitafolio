// Design "Kopfband": a full-width coloured band on the first page with name, title and contact; below it one column with skills in a row.
#let design-banner = (
  page: o => (margin: (left: 18mm, right: 18mm, top: 14mm, bottom: 14mm)),
  body: (m, o) => {
    set text(font: o.fonts, size: 9.5pt, fill: rgb("#1e293b"), lang: o.lang)
    let on = o.on-accent
    let st = cv-style(o)
    let has-photo = m.photo != ""

    let heading(title) = keep-heading(above: 15pt, below: 6pt, grid(
      columns: (auto, 1fr),
      column-gutter: 7pt,
      align: horizon,
      box(width: 9pt, height: 9pt, fill: o.accent-rule),
      text(size: 12pt, weight: "bold", fill: rgb("#0f172a"))[#title],
    ))

    full-bleed(18mm, 18mm, 14mm, o.accent, 14pt, grid(
      columns: if has-photo { (1fr, auto) } else { (1fr,) },
      column-gutter: 16pt,
      align: (left + horizon, right + horizon),
      {
        set text(fill: on)
        fit-name(m.name, 28pt, weight: "bold", fill: on)
        if m.job-title != "" { block(above: 11pt, below: 0pt, text(size: 13pt)[#m.job-title]) }
        let contact = pick-contact(m, ("email", "phone", "address", "website", "linkedin", "github", "xing"))
        if contact.len() > 0 { block(above: 9pt, below: 0pt, text(size: 9.5pt, glued-join(contact-values(contact)))) }
        if m.personal.len() > 0 { block(above: 4pt, below: 0pt, text(size: 9.5pt, glued-join(m.personal))) }
      },
      ..if has-photo { (cv-photo(m, o, width: 78pt, stroke: 2pt + on),) } else { () },
    ))
    v(4pt)

    if m.bio != "" {
      heading(m.labels.profile)
      text(size: 10pt)[#multiline(m.bio)]
    }

    cv-sections(pick-sections(m, ("experience", "education", "skills", "languages", "certificates", "interests", "custom")), (
      heading: heading,
      entry: e => entry-right(e, st),
      skills: sec => {
        let n = calc.min(3, sec.groups.len())
        grid(
          columns: (1fr,) * n,
          column-gutter: 16pt,
          row-gutter: 8pt,
          ..sec.groups.map(g => [
            #if sec.has-categories { text(size: st.small, weight: "bold", fill: o.accent-text)[#g.name]; linebreak() }
            #text(size: st.body)[#g.items.map(skill-label).join(", ")]
          ]),
        )
      },
      languages: sec => language-line(sec, st),
      interests: sec => interest-list(sec, st),
    ))
  },
)
