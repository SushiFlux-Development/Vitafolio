// Design "Farbspalte": a solid accent column over the full height of every page with name, photo, contact and skills; the career on white.
#let design-sidebar = (
  page: o => (
    margin: (left: 9mm, right: 14mm, top: 14mm, bottom: 14mm),
    background: place(top + left, rect(width: 68mm, height: 100%, fill: o.accent)),
  ),
  body: (m, o) => {
    set text(font: o.fonts, size: 9.5pt, fill: rgb("#1e293b"), lang: o.lang)
    let on = o.on-accent
    let st = cv-style(o)
    let side-st = cv-style(o, ink: on, strong: on, muted: on, sub-fill: on, date-fill: on)

    let heading(title) = keep-heading(above: 15pt, below: 7pt, text(size: 13pt, weight: "bold", fill: o.accent-text)[#title])
    let side-heading(title) = keep-heading(above: 14pt, below: 5pt, block(
      width: 100%,
      stroke: (bottom: 0.75pt + on.transparentize(50%)),
      inset: (bottom: 3pt),
      text(size: 9.5pt, weight: "bold", tracking: 1pt)[#upper(title)],
    ))
    let side-item(label, value) = side-pair(label, value)

    let side = {
      set text(fill: on)
      if m.photo != "" {
        align(center, cv-photo(m, o, width: 96pt, stroke: 2pt + on))
        v(10pt)
      }
      fit-name(m.name, 20pt, weight: "bold", fill: on)
      if m.job-title != "" { block(above: 9pt, below: 0pt, text(size: 11pt, { set par(leading: 0.45em); fit-words(m.job-title) })) }
      let contact = pick-contact(m, ("email", "phone", "address", "website", "linkedin", "github", "xing"))
      if contact.len() > 0 {
        side-heading(m.labels.contact)
        for c in contact { contact-pair(c) }
      }
      let b = m.birth
      if b.date != "" or b.place != "" or b.nationality != "" or b.marital != "" {
        side-heading(m.labels.personal)
        side-item(m.labels.birth-date, with-paren(b.date, b.place))
        side-item(m.labels.nationality, b.nationality)
        side-item(m.labels.marital, b.marital)
      }
      if m.skills.items.len() > 0 {
        side-heading(m.labels.skills)
        skill-rows(m.skills, side-st, on, on.transparentize(70%))
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

    let main = {
      if m.bio != "" {
        block(above: 0pt, below: 8pt, text(size: 10.5pt, fill: rgb("#334155"))[#multiline(m.bio)])
      }
      cv-sections(pick-sections(m, ("experience", "education", "certificates", "custom")), (
        heading: heading,
        entry: e => entry-right(e, st),
      ))
    }

    grid(columns: (50mm, 1fr), column-gutter: 18mm, side, main)
  },
)
