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

---

# Local lore book  (`lorebook.local.json`, git-ignored)

Plain-text extraction of a setting/campaign PDF **you own**, for the DM-only
**Lore book** search screen. Generate it from your PDF:

```bash
node scripts/extract-pdf.mjs "path/to/your book.pdf" --ocr \
  --json client/src/data/lorebook.local.json
```

Shape (`lorebook.example.json`): `{ source, generatedAt, pageCount,
pages: [{ page, text }], threads?: [...] }`. `pages` is one chunk per PDF page;
`threads` is optional hand-curated per-character story threads (Fate Weaving).
The repo ships no book text — see [`docs/LOREBOOK.md`](../../../docs/LOREBOOK.md).

# Local homebrew  (`homebrew.local.json`, git-ignored — optional seed)

Homebrew items / rules **you created** for your players, for the **Homebrew
tracker**. Shape (`homebrew.example.json`): array of
`{ id, name, kind: 'item'|'rule'|'feature'|'note', forPlayer?, rarity?,
attunement?, status: 'draft'|'live'|'retired', description, mechanics?, secret?,
notes? }`. `secret: true` = DM-only. Normally the DM edits these in-app (they
live in the room state); this file is just an optional starting seed.
