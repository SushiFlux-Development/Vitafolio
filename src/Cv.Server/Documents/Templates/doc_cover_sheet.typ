// The cover sheet on its own.
#let data = json(bytes(sys.inputs.at("data", default: "{}")))
#let raw-options = json(bytes(sys.inputs.at("options", default: "{}")))
#let photo = sys.inputs.at("photo", default: "")
#let o = make-options(raw-options)

#set document(title: tr(o, "Deckblatt", "Cover Sheet"), author: full-name(data))

#cover-sheet(data, o, photo, s(data, "targetJob"), s(data, "targetCompany"), data.at("contents", default: ()))
