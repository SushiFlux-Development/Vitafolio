// Parts of the application dossier that also exist on their own: cover sheet, cover letter (loosely based on DIN 5008) and attachment pages.
// Each part sets up its own page(s), so they can follow each other in one document.

// ==========================================
// Cover sheet
// ==========================================
#let cover-sheet(data, o, photo, target-job, target-company, contents) = [
  #set page(paper: "a4", margin: (top: 0cm, bottom: 2.5cm, left: 0cm, right: 0cm), header: none, footer: none, background: none, numbering: none)
  #set text(font: o.fonts, size: 10pt, fill: rgb("#1e293b"), lang: o.lang)
  #let t(de, en) = tr(o, de, en)
  #let accent = o.accent-text
  #let has-photo = o.show-photo and photo != ""

  #block(width: 100%, height: 22mm, fill: accent, outset: 0pt, above: 0pt, below: 0pt)[]

  // The cover sheet is always exactly one page: the layout is tried from airy to compact (tighter spacing, a smaller photo, the contents
  // in two columns, smaller type) and the first one that fits is used; as a last resort the whole thing is scaled down.
  #let tiers = (
    (top: 20mm, gap-a: 12mm, gap-b: 14mm, gap-toc: 22mm, cols: 1, row-gap: 6mm, item: 12pt, photo: (150pt, 193pt)),
    (top: 15mm, gap-a: 8mm, gap-b: 10mm, gap-toc: 15mm, cols: 1, row-gap: 4.5mm, item: 10.5pt, photo: (140pt, 180pt)),
    (top: 15mm, gap-a: 8mm, gap-b: 10mm, gap-toc: 15mm, cols: 1, row-gap: 2.5mm, item: 10.5pt, photo: (140pt, 180pt)),
    (top: 12mm, gap-a: 6mm, gap-b: 8mm, gap-toc: 10mm, cols: 2, row-gap: 3mm, item: 10.5pt, photo: (140pt, 180pt)),
    (top: 8mm, gap-a: 4mm, gap-b: 6mm, gap-toc: 7mm, cols: 2, row-gap: 2mm, item: 10pt, photo: (105pt, 135pt)),
    (top: 6mm, gap-a: 2mm, gap-b: 4mm, gap-toc: 5mm, cols: 2, row-gap: 1.5mm, item: 9pt, photo: (80pt, 103pt)),
  )

  #let sheet-body(k) = pad(x: 30mm, top: k.top)[
    #text(size: 13pt, weight: "bold", tracking: 3pt, fill: rgb("#64748b"))[#upper(t("Bewerbung", "Application"))]
    #v(3mm)

    #if target-job != "" [
      #text(size: 24pt, weight: "bold", fill: accent)[#target-job]
      #v(2mm)
    ]
    #if target-company != "" [
      #text(size: 13pt, weight: "medium", fill: rgb("#475569"))[#t("bei", "at") #target-company]
      #v(4mm)
    ]

    #v(k.gap-a)
    #line(length: 100%, stroke: 1.5pt + rgb("#e2e8f0"))
    #v(k.gap-b)

    // Photo and candidate details
    #grid(
      columns: if has-photo { (auto, 1fr) } else { (1fr,) },
      gutter: 25mm,
      align: (horizon + center, horizon + left),
      ..if has-photo { (photo-box(photo, o, width: k.photo.at(0), height: k.photo.at(1), stroke: 2pt + rgb("#ffffff"), rounded: 16pt),) } else { () },
      [
        #text(size: 20pt, weight: "bold", fill: rgb("#0f172a"))[#full-name(data)]
        #if s(data, "professionalTitle") != "" [
          #v(1mm)
          #text(size: 11pt, weight: "medium", fill: rgb("#64748b"))[#s(data, "professionalTitle")]
        ]

        #let address = join-parts(address-parts(data), "\n")
        #let rows = (
          (t("Adresse:", "Address:"), if address == "" { "" } else { multiline(address) }),
          ("E-Mail:", s(data, "email")),
          (t("Telefon:", "Phone:"), s(data, "phone")),
          ("Web:", s(data, "website")),
        ).filter(r => r.at(1) != "")
        #if rows.len() > 0 [
          #v(6mm)
          #block(fill: rgb("#f8fafc"), inset: 12pt, radius: 8pt, stroke: 1pt + rgb("#e2e8f0"), width: 100%)[
            #set text(size: 9.5pt, fill: rgb("#334155"))
            // All labels on top, also next to a multi-line address
            #grid(
              columns: (auto, 1fr),
              column-gutter: 10pt,
              row-gutter: 5pt,
              align: left + top,
              ..rows.map(r => (text(weight: "bold", fill: accent)[#r.at(0)], r.at(1))).flatten(),
            )
          ]
        ]
      ],
    )

    // Table of contents: only what the dossier really contains
    #if contents.len() > 0 [
      #v(k.gap-toc)
      #block(width: 100%)[
        #text(size: 11pt, weight: "bold", fill: accent)[#upper(t("Inhalt der Bewerbungsunterlagen", "Application Contents"))]
        #v(3mm)
        #line(length: 100%, stroke: 1pt + accent)
        #v(4mm)
        #let entry(idx, item) = grid(
          columns: (25pt, 1fr),
          gutter: 8pt,
          align: left + top,
          [#box(fill: accent, radius: 4pt, inset: (x: 5pt, y: 3pt))[#text(size: 8.5pt, weight: "bold", fill: rgb("#ffffff"))[#(idx + 1)]]],
          [#v(1.5pt)#text(size: k.item, weight: "medium", fill: rgb("#1e293b"))[#item]],
        )
        // Two columns run top to bottom: the first half left, the rest right
        #let rows-per-col = calc.ceil(contents.len() / k.cols)
        #grid(
          columns: (1fr,) * k.cols,
          column-gutter: 12mm,
          align: left + top,
          ..range(k.cols).map(c => stack(
            dir: ttb,
            spacing: k.row-gap,
            ..contents.enumerate().filter(((idx, _)) => calc.quo(idx, rows-per-col) == c).map(((idx, item)) => entry(idx, item)),
          )),
        )
      ]
    ]
  ]

  // The height that is left under the banner (layout() would report the whole page area): A4 minus bottom margin minus banner, with a little reserve
  #layout(size => {
    let room = 297mm - 2.5cm - 22mm - 3mm
    let fit = tiers.find(k => measure(width: size.width, sheet-body(k)).height <= room)
    if fit != none { return sheet-body(fit) }
    // Even the most compact layout is too tall: scale it down to the page
    let k = tiers.last()
    let natural = measure(width: size.width, sheet-body(k))
    scale(calc.max(room / natural.height * 100%, 40%), origin: top + left, reflow: true, sheet-body(k))
  })
]

// ==========================================
// Cover letter (loosely based on DIN 5008, form B)
// ==========================================
// The heading words an attachment note may already start with: then the heading is not printed a second time.
#let attachments-heading-regex = regex("^(anlagen?|attachments?|enclosures?|encl\\.)(\\s|:|$)")

#let cover-letter-pages(letter, o, signature, marks) = [
  // The page margins are the tightest ones; roomier tiers add inner padding (right, and bottom for the single-page fit test).
  #set page(
    paper: "a4",
    margin: (top: 20mm, bottom: 12mm, left: 25mm, right: 15mm),
    header: none,
    footer: none,
    numbering: none,
    background: if marks {
      // fold marks at 105 mm and 210 mm, punch mark at 148.5 mm
      place(top + left, dx: 5mm, dy: 105mm, line(length: 4mm, stroke: 0.35pt + rgb("#94a3b8")))
      place(top + left, dx: 5mm, dy: 148.5mm, line(length: 6mm, stroke: 0.45pt + rgb("#94a3b8")))
      place(top + left, dx: 5mm, dy: 210mm, line(length: 4mm, stroke: 0.35pt + rgb("#94a3b8")))
    } else { none },
  )
  #let t(de, en) = tr(o, de, en)
  #let accent = o.accent-text

  #let sender-name = s(letter, "senderName")
  #let sender-town = join-parts((s(letter, "senderPostalCode"), s(letter, "senderCity")), " ")
  #let return-line = join-parts((sender-name, s(letter, "senderStreet"), sender-town), " · ")
  #let recipient-country = s(letter, "recipientCountry")
  #let recipient-lines = (
    s(letter, "recipientDepartment"),
    s(letter, "recipientContactPerson"),
    s(letter, "recipientStreet"),
    join-parts((s(letter, "recipientPostalCode"), s(letter, "recipientCity")), " "),
    if recipient-country != "Deutschland" and recipient-country != "Germany" { recipient-country } else { "" },
  ).filter(x => x != "")
  // Body: blank lines separate paragraphs, single line breaks stay line breaks
  #let paragraphs = s(letter, "body").replace("\r\n", "\n").split("\n\n").map(p => p.trim()).filter(p => p != "")
  #let note = s(letter, "attachmentsNote")
  #let has-note = note != ""
  // A note that already starts with the heading word ("Anlagen", "Anlagen: ...") stands alone, otherwise the heading is put in front
  #let note-has-heading = has-note and lower(note).match(attachments-heading-regex) != none

  // The letter is set airy first (normal line spacing, clearly visible paragraph gaps, normal margins); only a text that does not fit on
  // one page that way is set tighter, step by step. The last tier is the most compact one and may run over several pages.
  // gap: space between paragraphs and after the greeting; right/bottom: extra margin on top of the tightest page margins.
  #let tiers = (
    (leading: 0.62em, gap: 1.5em, right: 5mm, bottom: 8mm, head-a: 5mm, head-b: 6mm, sig: 14mm, sig-blank: 10mm, note-gap: 4mm),
    (leading: 0.58em, gap: 1.3em, right: 5mm, bottom: 5mm, head-a: 5mm, head-b: 5mm, sig: 14mm, sig-blank: 10mm, note-gap: 4mm),
    (leading: 0.52em, gap: 1.1em, right: 3mm, bottom: 3mm, head-a: 4mm, head-b: 4mm, sig: 14mm, sig-blank: 10mm, note-gap: 3mm),
    (leading: 0.46em, gap: 0.9em, right: 0mm, bottom: 0mm, head-a: 4mm, head-b: 3mm, sig: 14mm, sig-blank: 10mm, note-gap: 3mm),    (leading: 0.58em, gap: 1.3em, right: 5mm, bottom: 5mm, head-a: 5mm, head-b: 5mm, sig: 14mm, sig-blank: 10mm, note-gap: 4mm),    (leading: 0.52em, gap: 1.1em, right: 3mm, bottom: 3mm, head-a: 4mm, head-b: 4mm, sig: 14mm, sig-blank: 10mm, note-gap: 3mm),    (leading: 0.46em, gap: 0.9em, right: 0mm, bottom: 0mm, head-a: 4mm, head-b: 3mm, sig: 14mm, sig-blank: 10mm, note-gap: 3mm),
  )

  #let letter-body(k) = [
    // Ragged right without hyphenation: no split words, nothing sticks out over the right margin
    #set text(font: o.fonts, size: 10.5pt, fill: rgb("#1e293b"), lang: o.lang, hyphenate: false)
    #set par(justify: false, leading: k.leading)

    // Sender at the top
    #grid(
      columns: (1fr, auto),
      align: (left + top, right + top),
      [#if sender-name != "" [#text(size: 16pt, weight: "bold", fill: accent)[#sender-name]]],
      [
        #set text(size: 8pt, fill: rgb("#64748b"))
        #set par(leading: 0.5em)
        #(s(letter, "senderStreet"), sender-town, s(letter, "senderPhone"), s(letter, "senderEmail")).filter(x => x != "").join(linebreak(), default: [])
      ],
    )

    #v(k.head-a)

    // Address field and date line
    #grid(
      columns: (85mm, 1fr),
      gutter: 15mm,
      align: (left + top, right + bottom),
      [
        #block(width: 85mm)[
          #text(size: 7.5pt, fill: rgb("#64748b"))[#return-line]
          #v(1.5mm)
          #line(length: 85mm, stroke: 0.35pt + rgb("#cbd5e1"))
        ]
        #v(2.5mm)
        #block(width: 85mm)[
          #set text(size: 10pt, fill: rgb("#0f172a"))
          #set par(leading: 0.5em)
          #if s(letter, "recipientCompany") != "" [#text(weight: "medium")[#s(letter, "recipientCompany")]#if recipient-lines.len() > 0 [ \ ]]
          #recipient-lines.join(linebreak(), default: [])
        ]
      ],
      [
        #set text(size: 10pt, fill: rgb("#334155"))
        #join-parts((s(letter, "place"), fmt-date(s(letter, "date"), o)), ", ")
      ],
    )

    #v(k.head-b)

    // The gap after the subject and the greeting is the paragraph gap, so the text starts with the same rhythm it continues in
    #if s(letter, "subject") != "" [
      #text(size: 12pt, weight: "bold", fill: accent)[#s(letter, "subject")]
      #v(k.gap)
    ]
    #if s(letter, "salutation") != "" [
      #text(size: 10.5pt, weight: "medium")[#s(letter, "salutation")]
      #v(k.gap)
    ]

    #[
      #set par(spacing: k.gap)
      #set block(spacing: k.gap)
      #for (i, p) in paragraphs.enumerate() [
        // The last paragraph sticks to the closing, so greeting and signature are never alone on a page
        #if i == paragraphs.len() - 1 [
          #block(sticky: true, above: k.gap, below: k.gap)[#multiline(p)]
        ] else [
          #multiline(p)
          #parbreak()
        ]
      ]
    ]

    #if paragraphs.len() == 0 { v(3mm) }

    // Closing and signature in one piece; with an attachment note it sticks to that note
    #block(breakable: false, sticky: has-note)[
      #text(size: 10.5pt)[#if s(letter, "closing") != "" { s(letter, "closing") } else { t("Mit freundlichen Grüßen", "Sincerely,") }]
      #v(2mm)
      #if signature != "" [
        #image(signature, height: k.sig, fit: "contain")
        #v(1mm)
      ] else [
        #v(k.sig-blank)
      ]
      #let sig-name = if s(letter, "signatureName") != "" { s(letter, "signatureName") } else { sender-name }
      #if sig-name != "" [#text(size: 10.5pt, weight: "medium", fill: rgb("#0f172a"))[#sig-name]]
    ]

    #if has-note [
      #v(k.note-gap)
      #block(breakable: false)[
        #set par(leading: 0.5em)
        #if note-has-heading [
          #text(size: 9.5pt, fill: rgb("#475569"))[#multiline(note)]
        ] else [
          #text(size: 9.5pt, weight: "bold", fill: rgb("#475569"))[#t("Anlagen", "Attachments")]
          #v(1mm)
          #text(size: 9.5pt, fill: rgb("#475569"))[#multiline(note)]
        ]
      ]
    ]
  ]

  // First tier whose whole letter is no taller than one page with that tier's margins (1 mm reserve)
  #context {
    let fits(k) = measure(width: 170mm - k.right, letter-body(k)).height <= 297mm - 20mm - 12mm - k.bottom - 1mm
    let k = tiers.find(fits)
    if k == none { k = tiers.last() }
    pad(right: k.right, letter-body(k))
  }
]

// ==========================================
// Attachment pages
// ==========================================
// One attachment page: the title (with the page number of a multi-page PDF), then the image or PDF page, scaled to fit.
// kind: "pdf", "image" or "missing" (a note instead of the document)
#let attachment-page(owner, title, path, kind, page-no, pages, o) = [
  #set page(
    paper: "a4",
    margin: 2cm,
    header: align(right, text(size: 8.5pt, fill: rgb("#94a3b8"), font: o.fonts, lang: o.lang)[#owner · #tr(o, "Anlage", "Attachment")]),
    footer: none,
    background: none,
    numbering: none,
  )
  #set text(font: o.fonts, size: 10pt, fill: rgb("#1e293b"), lang: o.lang)
  #block(width: 100%, height: 100%)[
    #grid(
      rows: (auto, 1fr),
      row-gutter: 5mm,
      [
        #text(size: 13pt, weight: "bold", fill: o.accent-text)[#title#if pages > 1 [ (#page-no / #pages)]]
        #v(3mm)
        #line(length: 100%, stroke: 1pt + rgb("#cbd5e1"))
      ],
      if kind == "missing" {
        align(center + horizon, text(fill: rgb("#64748b"))[#tr(o, "Diese Anlage konnte nicht eingebunden werden.", "This attachment could not be included.")])
      } else if kind == "pdf" {
        align(center + horizon, image(path, page: page-no, width: 100%, height: 100%, fit: "contain"))
      } else {
        align(center + horizon, image(path, width: 100%, height: 100%, fit: "contain"))
      },
    )
  ]
]
