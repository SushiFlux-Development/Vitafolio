// The application dossier: cover sheet, cover letter, CV in the chosen design and the attachments - one PDF.
#let data = json(bytes(sys.inputs.at("data", default: "{}")))
#let raw-options = json(bytes(sys.inputs.at("options", default: "{}")))
#let letter = json(bytes(sys.inputs.at("coverLetter", default: "{}")))
#let photo = sys.inputs.at("photo", default: "")
#let signature = sys.inputs.at("signature", default: "")
#let o = make-options(raw-options)

#set document(title: tr(o, "Bewerbungsmappe", "Application Dossier"), author: full-name(data))

#if raw-options.at("includeCoverSheet", default: true) {
  cover-sheet(data, o, photo, s(raw-options, "targetJob"), s(raw-options, "targetCompany"), raw-options.at("contents", default: ()))
}

#if s(letter, "subject") != "" {
  cover-letter-pages(letter, o, signature, letter.at("includeFoldMarks", default: true))
}

#cv-document(raw-options.at("design", default: "classic"), data, o, photo)

#for att in raw-options.at("attachments", default: ()) {
  let pages = att.at("pages", default: 1)
  for n in range(1, pages + 1) {
    attachment-page(full-name(data), s(att, "title"), s(att, "filePath"), att.at("kind", default: "missing"), n, pages, o)
  }
}
