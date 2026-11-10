// The cover letter on its own.
#let letter = json(bytes(sys.inputs.at("data", default: "{}")))
#let raw-options = json(bytes(sys.inputs.at("options", default: "{}")))
#let signature = sys.inputs.at("signature", default: "")
#let o = make-options(raw-options)

#set document(
  title: if s(letter, "subject") != "" { s(letter, "subject") } else { tr(o, "Anschreiben", "Cover Letter") },
  author: s(letter, "senderName"),
)

#cover-letter-pages(letter, o, signature, raw-options.at("includeFoldMarks", default: true))
