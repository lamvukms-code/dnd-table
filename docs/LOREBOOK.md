# Lore book & Homebrew tracker — plan

Two DM-only screens to cut down on flipping through a 600-page PDF mid-session.
Neither ships any book content in the repo — same rule as `subclasses.local.json`.

Status: **data pipeline done (0.34.0); screens are the next commit(s).**

---

## 1. PDF → text pipeline (done)

`scripts/extract-pdf.mjs` turns any PDF into per-page text with an OCR fallback
(Poppler `pdftotext` for the text layer; Ghostscript + Tesseract for pages that
are pure image). Generic — also works on the Monster Manual PDF.

```bash
node scripts/extract-pdf.mjs "<book>.pdf" --ocr \
  --json client/src/data/lorebook.local.json
```

For *The Crooked Moon (2024) – V2*: 638 pages → 601 with a usable text layer,
13 more recovered by OCR, 37 pure-art pages left empty. Full text + `pages.json`
also written next to the PDF (`extract/`). Output is git-ignored.

---

## 2. Lore book screen

**Goal:** type a name / place / keyword → jump to the passages, with page
numbers. Plus a pinned view for **Fate Weaving**, whose 13 *Threads of Fate*
(6 Narrative Touchpoints each) and "Fated Tarot Reading" call-outs are scattered
across every adventure chapter.

- **Data:** `lorebook.local.json` (`{ source, pageCount, pages: [{page,text}],
  threads? }`). Not bundled into the JS — the **server serves it** from
  `LOREBOOK_FILE` (default `client/src/data/lorebook.local.json`, git-ignored)
  at `GET /lorebook`, and the client fetches it lazily when the screen opens.
- **UI:** topbar "📖 Lore" (DM only) → panel with:
  - a search box → client-side ranked substring / token match over all page
    chunks; results show a snippet + `tr. N` + chapter guess, click to expand the
    whole page.
  - chapter filter (page-range map lives in the local JSON or a small config).
  - **Fate Weaving** tab: renders `threads[]` (hand-curated: per character —
    which Thread/Tarot card, a one-line summary, and each Touchpoint with its
    page + a short quote). If `threads` is absent, fall back to a saved search
    for "Thread of Fate" / "Fated Tarot Reading".
- **No editing** in-app — it is a read-only reference. Re-run the script to
  refresh.

## 3. Homebrew tracker

**Goal:** one place for the items / rules the DM invented for this table, so
nothing gets lost and players can look up what they were given.

- **Data:** `RoomState.homebrew: HomebrewEntry[]` — shared, persisted in
  `room.json`, DM-only to edit (like the bestiary). `homebrew.local.json` is an
  optional import seed.
  ```ts
  interface HomebrewEntry {
    id: string;
    name: string;
    kind: 'item' | 'rule' | 'feature' | 'note';
    forPlayer?: string;      // free text — which character it's for
    rarity?: string;         // items
    attunement?: boolean;
    status: 'draft' | 'live' | 'retired';
    description: string;
    mechanics?: string;      // the crunchy part
    secret?: boolean;        // true → hidden from players
    notes?: string;          // balance notes, reminders
    createdRound?: number;
  }
  ```
- **Protocol:** `homebrewUpsert` / `homebrewRemove` (DM only), mirroring
  `bestiaryUpsert` / `bestiaryRemove`.
- **UI:** topbar "🧪 Homebrew" → list grouped by `kind`, filter by player /
  status, inline editor for the DM. Players see the same list minus `secret`
  entries, read-only. A "gửi vào túi đồ" shortcut could push an `item` entry
  onto a linked character sheet's inventory later.

---

## 4. Copyright

`lorebook.local.json` and the `extract/` folder hold text from a book the DM
owns; they are git-ignored and never committed. The repo ships only the
extraction **script**, the JSON **schemas** (`*.example.json`), and this plan.
Homebrew entries are the DM's own creations.
