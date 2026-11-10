// Design "Schlicht": pure typography in black: no lines, no colour, no date column. The date sits at the end of the title line and
// the reading order is exactly top to bottom, which suits automatic applicant portals.
#let design-plain = (
  page: o => (margin: (top: 2.2cm, bottom: 2.2cm, left: 2.4cm, right: 2.4cm)),
  body: (m, o) => {
    set text(font: o.fonts, size: 10pt, fill: black, lang: o.lang)
    set par(justify: false, leading: 0.6em)
    let st = cv-style(o, ink: black, strong: black, muted: black, bullet: black, title: 10.5pt, body: 10pt, sub: 10pt, sub-fill: black, sub-style: "italic", small: 10pt, date-fill: black, gap: 11pt)
    let heading(title) = keep-heading(above: 16pt, below: 7pt, text(size: 11.5pt, weight: "bold", tracking: 0.6pt)[#upper(title)])

    let has-photo = m.photo != ""
    grid(
      columns: if has-photo { (1fr, auto) } else { (1fr,) },
      gutter: 18pt,
      align: (left + top, right + top),
      [
        #fit-name(m.name, 22pt, weight: "bold")
        #if m.job-title != "" { block(above: 9pt, below: 0pt, text(size: 12pt)[#m.job-title]) }
        #let contact = pick-contact(m, ("email", "phone", "address", "website", "linkedin", "github", "xing"))
        #if contact.len() > 0 { block(above: 8pt, below: 0pt, text(size: 10pt, glued-join(contact-values(contact), sep: "|"))) }
        #if m.personal.len() > 0 { block(above: 4pt, below: 0pt, text(size: 10pt, glued-join(m.personal, sep: "|"))) }
      ],
      ..if has-photo { (cv-photo(m, o, width: 72pt, stroke: none, rounded: 0pt),) } else { () },
    )

    if m.bio != "" {
      heading(m.labels.summary)
      text(size: 10pt)[#multiline(m.bio)]
    }

    cv-sections(pick-sections(m, ("experience", "education", "skills", "languages", "certificates", "interests", "custom")), (
      heading: heading,
      entry: e => entry-right(e, st),
      skills: sec => skill-paragraphs(sec, st),
      languages: sec => language-line(sec, st, sep: ", "),
      interests: sec => interest-list(sec, st, sep: ", "),
    ))
  },
)
