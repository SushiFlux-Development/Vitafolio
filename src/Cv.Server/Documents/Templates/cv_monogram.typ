// Design "Monogramm": large initials in a fine ring, hairlines only, a quiet side column. Calm and complete even without a photo.
#let monogram-ring(m, o, d: 92pt) = box(width: d, height: d, {
  place(center + horizon, circle(radius: d / 2, stroke: 0.75pt + o.accent-rule))
  place(center + horizon, circle(radius: d / 2 - 5pt, stroke: 0.3pt + o.accent-rule))
})

#let monogram-letters(m, o, d: 92pt) = box(width: d, height: d, align(center + horizon, text(font: o.fonts, size: d * 0.42, fill: o.accent-text)[#m.initials]))

#let design-monogram = (
  // The initials are an ornament: set in the foreground of the first page, so in the PDF they come after all of the text
  foreground: (m, o) => first-or-later(place(top + left, dx: 20mm, dy: 20mm, monogram-letters(m, o)), []),
  page: o => (
    margin: (left: 20mm, right: 20mm, top: 20mm, bottom: 16mm),
    background: first-or-later([], place(top + right, dx: -20mm, dy: 9mm, circle(radius: 8pt, stroke: 0.6pt + o.accent-rule))),
  ),
  body: (m, o) => {
    set text(font: o.fonts, size: 9.5pt, fill: rgb("#1e293b"), lang: o.lang)
    cv-start-mark
    let st = cv-style(o, sub-fill: rgb("#475569"), date-fill: o.accent-text, gap: 11pt)
    let side-st = cv-style(o)
    let has-photo = m.photo != ""

    let main-heading(title) = keep-heading(above: 16pt, below: 7pt, text(size: 10.5pt, tracking: 1.8pt, fill: o.accent-text)[#upper(title)])
    let side-heading(title) = keep-heading(above: 15pt, below: 6pt, text(size: 9.5pt, tracking: 1.4pt, fill: o.accent-text)[#upper(title)])

    grid(
      columns: if has-photo { (auto, 1fr, auto) } else { (auto, 1fr) },
      column-gutter: 18pt,
      align: if has-photo { (top, horizon, horizon) } else { (top, horizon) },
      monogram-ring(m, o),
      {
        fit-name(m.name, 28pt, fill: rgb("#0f172a"))
        if m.job-title != "" { block(above: 12pt, below: 0pt, text(size: 11pt, tracking: 1.2pt, fill: rgb("#475569"))[#upper(m.job-title)]) }
      },
      ..if has-photo { (cv-photo(m, o, width: 78pt, stroke: 0.75pt + o.accent-rule),) } else { () },
    )
    block(above: 14pt, below: 12pt, line(length: 100%, stroke: 0.5pt + o.accent-rule))

    let side = {
      let contact = pick-contact(m, ("email", "phone", "address", "website", "linkedin", "github", "xing"))
      if contact.len() > 0 {
        side-heading(m.labels.contact)
        for c in contact { contact-pair(c, label-fill: rgb("#475569"), gap: 7pt) }
      }
      if m.personal.len() > 0 {
        side-heading(m.labels.personal)
        for item in m.personal { block(above: 0pt, below: 6pt, narrow-value(item)) }
      }
      if m.skills.items.len() > 0 {
        side-heading(m.labels.skills)
        skill-rows(m.skills, side-st, o.accent-rule, o.accent-rule.transparentize(75%))
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
      if m.bio != "" { block(above: 0pt, below: 4pt, text(size: 10.5pt, style: "italic", fill: rgb("#334155"))[#multiline(m.bio)]) }
      cv-sections(pick-sections(m, ("experience", "education", "certificates", "custom")), (
        heading: main-heading,
        entry: e => entry-right(e, st),
      ))
    }

    // The hairline between the columns is the column's border, so it follows the text over page breaks
    set text(dir: rtl)
    grid(
      columns: (1fr, 46mm),
      column-gutter: 0pt,
      stroke: (x, y) => if x == 0 { (right: 0.5pt + o.accent-rule) },
      align(left, { set text(dir: ltr); pad(left: 16pt, main) }),
      align(left, { set text(dir: ltr); pad(right: 16pt, side) }),
    )
  },
)
