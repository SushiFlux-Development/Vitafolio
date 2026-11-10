// Design "Randspalte": a pale tinted column on the right over the full height of every page; a large dark name opens the main column.
#let design-rail = (
  page: o => (
    margin: (left: 16mm, right: 8mm, top: 16mm, bottom: 14mm),
    background: place(top + right, rect(width: 63mm, height: 100%, fill: o.accent-tint, stroke: (left: 1pt + o.accent-rule))),
  ),
  body: (m, o) => {
    set text(font: o.fonts, size: 9.5pt, fill: rgb("#1e293b"), lang: o.lang)
    let side-accent = readable-on(o.accent, o.accent-tint)
    let st = cv-style(o)
    let side-st = cv-style(o, date-fill: rgb("#334155"))

    let heading(title) = keep-heading(above: 15pt, below: 7pt, text(size: 9.5pt, weight: "bold", tracking: 1.4pt, fill: o.accent-text)[#upper(title)])
    let side-heading(title) = keep-heading(above: 13pt, below: 5pt, text(size: 9.5pt, weight: "bold", tracking: 1.4pt, fill: side-accent)[#upper(title)])
    let side-item(value, lines: none) = block(above: 0pt, below: 6pt, narrow-value(value, lines: lines))

    let main = {
      fit-name(m.name, 30pt, weight: "bold", fill: rgb("#0f172a"))
      if m.job-title != "" { block(above: 12pt, below: 0pt, text(size: 13pt, fill: o.accent-text)[#m.job-title]) }
      if m.bio != "" { block(above: 12pt, below: 4pt, text(size: 10pt)[#multiline(m.bio)]) }
      cv-sections(pick-sections(m, ("experience", "education", "certificates", "custom")), (
        heading: heading,
        entry: e => entry-right(e, st),
      ))
    }

    let side = {
      if m.photo != "" {
        align(center, cv-photo(m, o, width: 100pt, stroke: 2pt + white))
        v(4pt)
      }
      let contact = pick-contact(m, ("email", "phone", "address", "website", "linkedin", "github", "xing"))
      if contact.len() > 0 {
        side-heading(m.labels.contact)
        for c in contact { side-item(c.value, lines: c.at("parts", default: none)) }
      }
      if m.personal.len() > 0 {
        side-heading(m.labels.personal)
        for p in m.personal { side-item(p) }
      }
      if m.skills.items.len() > 0 {
        side-heading(m.labels.skills)
        skill-rows(m.skills, side-st, side-accent, side-accent.transparentize(75%))
      }
      if m.languages.items.len() > 0 {
        side-heading(m.labels.languages)
        language-rows(m.languages, side-st)
      }
      if m.interests.items.len() > 0 {
        side-heading(m.labels.interests)
        interest-list(m.interests, side-st)
      }
    }

    grid(columns: (1fr, 47mm), column-gutter: 16mm, main, side)
  },
)
