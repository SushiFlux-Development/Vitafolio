// The CV on its own (preview and export).
#let data = json(bytes(sys.inputs.at("data", default: "{}")))
#let raw-options = json(bytes(sys.inputs.at("options", default: "{}")))
#let photo = sys.inputs.at("photo", default: "")
#let o = make-options(raw-options)

#set document(title: tr(o, "Lebenslauf", "Curriculum Vitae"), author: full-name(data))

#cv-document(raw-options.at("design", default: "classic"), data, o, photo, numbering: "1 / 1")
