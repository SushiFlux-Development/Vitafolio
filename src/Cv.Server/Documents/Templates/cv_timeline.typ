// Design "Zeitleiste": stations along a vertical line with a dot each, the date in colour above the title.
#let design-timeline = (
  page: o => (margin: (left: 18mm, right: 18mm, top: 16mm, bottom: 16mm)),
  body: (m, o) => {
    set text(font: o.fonts, size: 9.5pt, fill: rgb("#1e293b"), lang: o.lang)
    let st = cv-style(o, date-fill: o.accent-text, date-weight: "bold", gap: 0pt)
    let list-st = cv-style(o)
    let has-photo = m.photo != ""
    let contact = pick-contact(m, ("email", "phone", "address", "website", "linkedin", "github", "xing"))

    let heading(title) = keep-heading(above: 15pt, below: 8pt, text(size: 12pt, weight: "bold", fill: o.accent-text)[#title])

    grid(
      columns: if has-photo { (auto, 1fr, 34%) } else { (1fr, 34%) },
      column-gutter: 14pt,
      align: horizon,
      ..if has-photo { (cv-photo(m, o, width: 64pt, stroke: 1.5pt + o.accent-rule),) } else { () },
      {
        fit-name(m.name, 26pt, weight: "bold", fill: rgb("#0f172a"))
        if m.job-title != "" { block(above: 10pt, below: 0pt, text(size: 12pt, fill: o.accent-text)[#m.job-title]) }
      },
      align(right, text(size: 9pt, fill: rgb("#475569"))[#contact.map(contact-value).join(linebreak(), default: [])]),
    )
    if m.personal.len() > 0 { block(above: 8pt, below: 0pt, text(size: 9pt, fill: rgb("#475569"))[#m.personal.join("  ·  ")]) }
    if m.bio != "" { block(above: 11pt, below: 0pt, text(size: 10pt)[#multiline(m.bio)]) }

    // One grid per section: the line is the right border of the narrow first column, so it runs through page breaks as well.
    let stations(entries) = grid(
      columns: (12pt, 1fr),
      stroke: (x, y) => if x == 0 { (right: 1.25pt + o.accent-rule) },
      ..entries.map(e => (
        place(top + right, dx: 4.25pt, dy: -0.5pt, circle(radius: 3.5pt, fill: o.accent-rule, stroke: 1.5pt + white)),
        pad(left: 13pt, bottom: 12pt, entry-date-above(e, st)),
      )).flatten(),
    )

    for sec in pick-sections(m, ("experience", "education", "certificates", "custom")) {
      heading(sec.title)
      stations(sec.entries)
    }
    for sec in pick-sections(m, ("skills", "languages", "interests")) {
      heading(sec.title)
      if sec.kind == "skills" {
        skill-lines(sec, list-st, label-width: 96pt)
      } else if sec.kind == "languages" {
        language-line(sec, list-st)
      } else {
        interest-list(sec, list-st)
      }
    }
  },
)
