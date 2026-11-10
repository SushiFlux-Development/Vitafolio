// One attachment on its own: used to check that a file can be embedded in a dossier (upload, and the retry after a failed dossier).
#let raw-options = json(bytes(sys.inputs.at("options", default: "{}")))
#let att = json(bytes(sys.inputs.at("attachment", default: "{}")))
#let o = make-options(raw-options)

#for n in range(1, att.at("pages", default: 1) + 1) {
  attachment-page("", s(att, "title"), s(att, "filePath"), att.at("kind", default: "missing"), n, att.at("pages", default: 1), o)
}
