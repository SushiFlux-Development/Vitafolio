// Visual building blocks the designs share: how an entry is set, how skills are listed, the photo and the two-column frame. They
// take a style dictionary (cv-style) so a design only states what is different. A design file is layout and style, never data logic.

// The defaults of a design; a design overrides single values. st.body, the size of running text, stays at 9.5 pt or more.
#let cv-style(o, ..over) = (
  ink: rgb("#1e293b"),
  strong: rgb("#0f172a"),
  muted: rgb("#475569"),
  bullet: o.accent-rule,
  body: 9.5pt,
  title: 10.5pt,
  sub: 9.5pt,
  sub-fill: rgb("#334155"),
  sub-style: "normal",
  small: 9pt,
  date-fill: rgb("#475569"),
  date-weight: "regular",
  date-style: "normal",
  gap: 10pt,
  tight: 0.42em,
) + over.named()

// A section heading that stays on the page of the entry after it (sticky), so it never ends a page on its own.
#let keep-heading(above: 14pt, below: 6pt, body) = block(sticky: true, width: 100%, above: above, below: below, body)

// A short value that must not break inside, together with what follows it on the same line (a comma, a separator); longer ones may wrap.
// Inside the box the punctuation must not hang out at the end, or it would eat the space after the box.
#let unbroken(value, tail: [], limit: 40) = if value.clusters().len() <= limit { box(text(overhang: false)[#value#tail]) } else [#value#tail]

// The parts of an address in a running line ("Street, 12345 City, Country"): it only breaks between the parts, `tail` stays on the last one.
#let address-run(parts, tail: []) = {
  let run = []
  for (i, part) in parts.enumerate() {
    let last = i == parts.len() - 1
    let end = if last { tail } else [,]
    // Only postal code and city must stay together; street and country wrap like any text
    run += if part.match(regex("^\\d")) != none { unbroken(part, tail: end) } else [#part#end]
    if not last { run += " " }
  }
  run
}

// Items in one running line (contact details) that only breaks between items: a short item stays whole and the separator stays on
// the line of the item before it, so no line starts with a separator. An array stands for the parts of an address.
#let glued-join(items, sep: "·", limit: 40) = items.enumerate().map(((i, v)) => {
  let tail = if i < items.len() - 1 [\u{00A0}#sep] else { [] }
  if type(v) == array { address-run(v, tail: tail) } else { unbroken(v, tail: tail, limit: limit) }
}).join([ ], default: [])

// What glued-join needs for contact details: the address as its parts, everything else as text.
#let contact-values(contact) = contact.map(c => c.at("parts", default: c.value))

// One contact detail as content for a line of its own: the address never breaks inside "12345 City".
#let contact-value(c) = {
  let parts = c.at("parts", default: none)
  if parts != none { address-run(parts) } else { c.value }
}

// A value for a narrow column: an address (given as lines) line by line, anything else fitted to the column.
#let narrow-value(value, lines: none, st: (tight: 0.42em)) = {
  set par(leading: st.tight)
  if lines != none {
    for line in lines {
      block(above: 0pt, below: 3.5pt, if line.clusters().len() <= 26 { box(line) } else { fit-words(line) })
    }
  } else {
    fit-words(value)
  }
}

// A label with its value for a narrow column. The two sit close together and the pairs clearly apart, so each pair reads as one group.
#let side-pair(label, value, lines: none, label-fill: auto, gap: 8pt) = if value != "" or lines != none {
  block(above: 0pt, below: gap, {
    let style = if label-fill == auto { (:) } else { (fill: label-fill) }
    block(above: 0pt, below: 3.5pt, text(size: 8.5pt, weight: "bold", ..style)[#label])
    narrow-value(value, lines: lines)
  })
}

// A contact detail as a side-pair; the address goes line by line (street, postal code and city, country).
#let contact-pair(c, ..args) = side-pair(c.label, c.value, lines: c.at("parts", default: none), ..args)

// The description of an entry. One line stays running text; several lines become a list with a hanging indent, one point per line.
#let description(value, st) = {
  let lines = description-lines(value)
  if lines.len() == 1 {
    block(above: 5.5pt, below: 0pt, text(size: st.body)[#lines.at(0)])
  } else if lines.len() > 1 {
    block(above: 5.5pt, below: 0pt, {
      set par(leading: 0.48em)
      text(size: st.body, list(
        marker: text(fill: st.bullet)[•],
        indent: 0pt,
        body-indent: 5pt,
        tight: false,
        spacing: 6.5pt,
        ..lines.map(line => [#line]),
      ))
    })
  }
}

// The title of an entry, with the lines of a wrapped title as close as the rest of the document. Certificates and own sections carry
// their second part on the same line ("Title — Issuer (ID: x)") when it fits; otherwise it goes on a line of its own, so no dash is left hanging.
#let entry-head(e, st) = {
  set par(leading: st.tight)
  let title = text(size: st.title, weight: "bold", fill: st.strong)[#e.title]
  let issuer = if e.inline and e.sub != "" { text(size: st.sub, fill: st.muted)[#e.sub] }
  let note = if e.note != "" { text(size: st.small, fill: st.muted)[#e.note] }
  if issuer == none and note == none {
    block(above: 0pt, below: 0pt, title)
  } else {
    layout(area => {
      let line = [#title#if issuer != none [ — #issuer]#if note != none [ #note]]
      if measure(line).width <= area.width {
        block(above: 0pt, below: 0pt, line)
      } else {
        block(above: 0pt, below: 0pt, title)
        block(above: 5pt, below: 0pt, [#issuer#if issuer != none and note != none [ ]#note])
      }
    })
  }
}

// The employer or school line of an entry.
#let entry-sub(e, st) = if not e.inline and e.sub != "" {
  block(above: 5pt, below: 0pt, {
    set par(leading: st.tight)
    text(size: st.sub, fill: st.sub-fill, style: st.sub-style)[#e.sub]
  })
}

// What follows the title: the employer or school line, then the description.
#let entry-rest(e, st) = {
  entry-sub(e, st)
  if e.desc != "" { description(e.desc, st) }
}

#let entry-date(e, st) = text(size: st.small, fill: st.date-fill, weight: st.date-weight, style: st.date-style)[#e.period]

// One entry with its space below. Above is zero: the heading before it or the entry before it sets the distance.
#let entry-block(st, body) = block(width: 100%, above: 0pt, below: st.gap, body)

// The date in a column of its own on the left.
#let entry-left(e, st, date-width: 110pt) = entry-block(st, grid(
  columns: (date-width, 1fr),
  column-gutter: 14pt,
  entry-date(e, st),
  { entry-head(e, st); entry-rest(e, st) },
))

// The date on the right of the title line. The date keeps its width, a long title wraps beside it.
#let entry-right(e, st) = entry-block(st, {
  block(above: 0pt, below: 0pt, sticky: true, grid(columns: (1fr, auto), column-gutter: 10pt, entry-head(e, st), entry-date(e, st)))
  entry-rest(e, st)
})

// The date on its own line above the title; the two stay on one page.
#let entry-date-above(e, st) = entry-block(st, {
  block(above: 0pt, below: 0pt, breakable: false, sticky: true, {
    if e.period != "" { block(above: 0pt, below: 4pt, entry-date(e, st)) }
    entry-head(e, st)
  })
  entry-rest(e, st)
})

// A skill's name with its level written out.
#let skill-label(sk) = sk.name + if sk.level > 0 { " (" + str(sk.level) + "/5)" } else { "" }

// Skills as lines: the category in a column of its own, the skills next to it.
#let skill-lines(sec, st, label-width: 110pt, sep: "  •  ") = for group in sec.groups {
  block(above: 0pt, below: 4pt, grid(
    columns: (label-width, 1fr),
    column-gutter: 14pt,
    text(size: st.small, weight: "bold", fill: st.date-fill)[#group.name],
    text(size: st.body)[#group.items.map(skill-label).join(sep)],
  ))
}

// Skills as one paragraph per category; for designs without a label column.
#let skill-paragraphs(sec, st, sep: ", ") = for group in sec.groups {
  block(above: 0pt, below: 4pt, text(size: st.body)[#text(weight: "bold")[#group.name:] #group.items.map(skill-label).join(sep)])
}

// Skills as a stack for narrow columns; the group title is left out when no skill has a category.
#let skill-stack(sec, st, sep: ", ") = for group in sec.groups {
  block(above: 0pt, below: 5pt, {
    if sec.has-categories { text(size: st.small, weight: "bold", fill: st.date-fill)[#group.name]; linebreak() }
    text(size: st.body)[#group.items.map(skill-label).join(sep)]
  })
}

// Five marks for a level from 1 to 5.
#let level-dots(level, on, off) = box(baseline: -0.5pt, for i in range(1, 6) {
  box(width: 4.8pt, height: 4.8pt, radius: 2.4pt, fill: if i <= level { on } else { off })
  if i < 5 { h(1.6pt) }
})

// The width of the five level marks.
#let level-dots-width = 5 * 4.8pt + 4 * 1.6pt

// Skills as rows for a sidebar: the name has a column of its own and the level marks another, so a long name wraps and never reaches the
// marks. Rows are the same distance apart whether a name takes one line or two. Group titles only when skills have categories.
#let skill-rows(sec, st, on, off) = for group in sec.groups {
  if sec.has-categories {
    block(above: 7pt, below: 4.5pt, {
      set par(leading: st.tight)
      text(size: st.small, weight: "bold", fill: st.date-fill, fit-words(group.name))
    })
  }
  for sk in group.items {
    block(above: 0pt, below: 5.5pt, grid(
      columns: (1fr, level-dots-width),
      column-gutter: 6pt,
      { set par(leading: st.tight); text(size: st.body, fit-words(sk.name)) },
      if sk.level > 0 { level-dots(sk.level, on, off) },
    ))
  }
}

// Languages as one line.
#let language-line(sec, st, sep: "  •  ") = text(size: st.body)[#sec.items.map(l => l.text).join(sep)]

// Languages as rows of name and level for a sidebar.
#let language-rows(sec, st) = for l in sec.items {
  block(above: 0pt, below: 5.5pt, grid(
    columns: (1fr, auto),
    column-gutter: 6pt,
    { set par(leading: st.tight); text(size: st.body, fit-words(l.name)) },
    text(size: st.small, weight: "bold")[#l.level],
  ))
}

// Interests: one line while nothing has a description; otherwise one below the other, the description on a line of its own.
#let interest-list(sec, st, sep: "  •  ") = {
  if sec.items.all(i => i.desc == "") {
    text(size: st.body, fit-words(sec.items.map(i => i.text).join(sep)))
  } else {
    for i in sec.items {
      block(above: 0pt, below: 7pt, {
        set par(leading: st.tight)
        if i.text != "" { text(size: st.body, weight: "bold", fit-words(i.text)) }
        if i.desc != "" { block(above: if i.text != "" { 3.5pt } else { 0pt }, below: 0pt, text(size: st.body, fit-words(i.desc))) }
      })
    }
  }
}

// The photo of a design in portrait format, or a circle for the round shape (the frame takes the shape from the options).
#let cv-photo(m, o, width: 80pt, stroke: 1.5pt + rgb("#cbd5e1"), rounded: 8pt) = {
  if m.photo != "" { photo-box(m.photo, o, width: width, height: width * 1.2, stroke: stroke, rounded: rounded) }
}

// Sets the sections in order: a heading, then entries or the matching list. `r` holds the design's heading and renderers.
#let cv-sections(sections, r) = for sec in sections {
  (r.heading)(sec.title)
  if sec.kind == "entries" {
    for e in sec.entries { (r.entry)(e) }
  } else {
    (r.at(sec.kind))(sec)
  }
}

// Two columns with the sidebar on the LEFT but the main column written FIRST into the PDF, so the text is read and selected in
// the order main column, sidebar. Typst lays out grid columns from right to left in a right-to-left context; both columns set
// their own content left-to-right again.
#let main-first(main-width, side-width, gutter, main, side) = {
  set text(dir: rtl)
  grid(
    columns: (main-width, side-width),
    column-gutter: gutter,
    align(left, { set text(dir: ltr); main }),
    align(left, { set text(dir: ltr); side }),
  )
}

// A filled block as wide as the page: the fill reaches past the given margins, the content stays inside them.
#let full-bleed(left, right, top, fill, inset-y, body) = block(width: 100%, fill: fill, outset: (left: left, right: right, top: top), inset: (bottom: inset-y), body)

// ==========================================
// Shapes of the expressive designs
// ==========================================
// Colours for filled shapes that carry text: `ink` is readable on the whole shape. `solid` is the accent, moved just far enough that
// the ink reaches 4.5:1; `deep` is the other end of a gradient and lies further away from the ink, so the worst point of a gradient is
// `solid` itself. `tint` is a pale companion for shapes without text.
#let shape-palette(o) = {
  let visible = readable-on(o.accent, white, min: 1.25)
  let ink = ink-on(visible)
  let solid = readable-on(visible, ink)
  let deep = if ink == white { solid.darken(22%) } else { solid.lighten(18%) }
  (ink: ink, solid: solid, deep: deep, tint: solid.lighten(82%))
}

// The mark a design sets at the start of its content, so a page background can tell the first page of the CV from the later ones
// (in a dossier the CV does not start on page 1).
#let cv-start-mark = [#metadata("cv-start") <cv-start>]

// A page background with one form for the first page of the CV and a quieter one for the pages after it.
#let first-or-later(first, later) = context {
  let start = query(<cv-start>)
  if start.len() > 0 and here().page() == start.first().location().page() { first } else { later }
}

