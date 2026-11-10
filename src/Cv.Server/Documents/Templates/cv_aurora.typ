// Design "Aurora": a soft glow from one corner, sections as gently rounded pale surfaces.
#let aurora-glow(o, size, corner) = {
  let glow = o.accent-rule.lighten(68%)
  let (cx, cy) = corner
  rect(width: size, height: size, fill: gradient.radial((glow, 0%), (glow.lighten(35%), 42%), (white, 100%), center: (cx, cy), radius: 100%))
}

#let design-aurora = (
  page: o => (
    margin: (left: 17mm, right: 17mm, top: 16mm, bottom: 15mm),
    background: first-or-later(
      place(top + right, aurora-glow(o, 440pt, (100%, 0%))),
      place(bottom + left, aurora-glow(o, 170pt, (0%, 100%))),
    ),
  ),
  body: (m, o) => {
    set text(font: o.fonts, size: 9.5pt, fill: rgb("#1e293b"), lang: o.lang)
    cv-start-mark
    let card = o.accent-rule.lighten(93%)
    let head-ink = rgb("#0f172a")
    let on-card = readable-on(o.accent, card)
    let st = cv-style(o, date-fill: rgb("#334155"), gap: 8pt)
    let has-photo = m.photo != ""
    let contact = pick-contact(m, ("email", "phone", "address", "website", "linkedin", "github", "xing"))

    grid(
      columns: if has-photo { (1fr, auto) } else { (1fr,) },
      column-gutter: 16pt,
      align: (left + horizon, right + horizon),
      {
        fit-name(m.name, 30pt, weight: "bold", fill: head-ink)
        if m.job-title != "" { block(above: 12pt, below: 0pt, text(size: 13pt, fill: readable-on(o.accent, o.accent-rule.lighten(68%)))[#m.job-title]) }
        if contact.len() > 0 { block(above: 11pt, below: 0pt, text(size: 9.5pt, fill: rgb("#1e293b"), glued-join(contact-values(contact)))) }
        if m.personal.len() > 0 { block(above: 5pt, below: 0pt, text(size: 9.5pt, fill: rgb("#1e293b"), glued-join(m.personal))) }
      },
      ..if has-photo { (cv-photo(m, o, width: 88pt, stroke: 2pt + white),) } else { () },
    )

    // A section is one rounded pale surface: heading and content together
    let surface(title, body) = block(above: 7pt, below: 0pt, width: 100%, fill: card, radius: 10pt, inset: (x: 13pt, y: 9pt), {
      keep-heading(above: 0pt, below: 7pt, text(size: 11.5pt, weight: "bold", fill: on-card)[#title])
      body
    })

    if m.bio != "" { block(above: 13pt, below: 0pt, width: 100%, inset: (x: 13pt), text(size: 10.5pt, fill: rgb("#334155"))[#multiline(m.bio)]) }

    for sec in pick-sections(m, ("experience", "education", "skills", "languages", "certificates", "interests", "custom")) {
      surface(sec.title, if sec.kind == "entries" {
        let last = sec.entries.len() - 1
        for (i, e) in sec.entries.enumerate() { entry-right(e, if i == last { st + (gap: 0pt) } else { st }) }
      } else if sec.kind == "skills" {
        skill-paragraphs(sec, st)
      } else if sec.kind == "languages" {
        language-line(sec, st)
      } else {
        interest-list(sec, st)
      })
    }
  },
)
