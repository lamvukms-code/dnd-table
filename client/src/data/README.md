# Local subclass features

`subclasses.local.json` (git-ignored) holds subclass feature definitions for
non-SRD content **you own** (a published setting, homebrew, etc). The repo ships
none — see `subclasses.example.json` for the shape.

- One JSON array of `SubclassFeatureDef` (`{ id, class, subclass, level, name,
  description, uses? }`).
- `class` is a lowercase class name; `subclass` matches your sheet's subclass
  field loosely (case- and punctuation-insensitive).
- Features whose `level <= your class level` auto-populate the sheet's
  "Subclass features" section.
- `uses` (optional) renders a spend tracker: `max` is a number or
  `"cha-mod"` / `"wis-mod"` / `"con-mod"` / `"prof"`, `recharge` is
  `"short"` or `"long"`.

The file is bundled into the client build, so whoever runs the server ships it
to every player who connects.
