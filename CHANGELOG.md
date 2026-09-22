# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.52.0] - 2026-09-22

### Added

- **Multiclass: secondary-class proficiencies** ("Điền theo class"), per each class' own SRD 5.2.1 "As a
  Multiclass Character" text — a smaller grant than starting that class fresh, and never saving throws:
  armor/shield training, weapon training, a tool/instrument (Bard, Rogue), and a limited skill pick (Bard 1 any,
  Ranger/Rogue 1 from their list) where the class grants one. Armor/weapon/tool have no dedicated sheet field, so
  they're recorded as a "Đa nghề: <Class>" entry under Năng lực for the player to mark the matching gear
  proficient; skill picks go straight into the sheet's skill proficiencies. New: `multiclassProficiencies()`.

### Fixed

- **Agonizing Blast (2024)**: the app claimed it auto-applied to Eldritch Blast but never actually added the
  Charisma modifier. It's now a per-spell "⚡ Agonizing Blast" toggle on any prepared damage-dealing cantrip
  (shown once the sheet has Warlock levels) — matching the SRD 5.2.1 wording, which lets you pick **any one**
  known damage-dealing Warlock cantrip (repeatable for more), not only Eldritch Blast. Adds the spellcasting
  modifier once per cast, for both attack-roll and saving-throw cantrips (`Spell.agonizingBlast`,
  `spellAttackParts(sheet, damage, spell)`).

## [0.51.0] - 2026-09-22

### Added

- **PDF import: the newer "Sirindoodles" sheet revision** (the one the "Phil Jacques" sheet uses — fields numbered +1,
  boxes moved). Fields are mapped back onto the known template by column + row order, then nearest box
  (`remapSirindoodlesV2`; geometry only in `sirindoodlesGeometry.ts`). Also: a CLASS box holding just a subclass
  ("Sinner") resolves to its class from the local subclass data; the AC printed on the sheet is kept as an override
  when it differs from 10 + DEX (armor is plain text in the PDF). `scripts/dump-pdf-fields.mjs` dumps a template's
  fields for mapping a further revision.
- **Circle of the Old Ways — Wood Wose, fully wired** (`woodWoseEffect`): Bark Bulwark AC, **Rampant Growth** temp
  HP (WIS mod + PB) now and at the start of each of your turns (server, never stacks), Oaken Resolve advantage on
  STR / CON saves, level 6 Gnarled Thorns (+1d6 piercing on melee weapon hits, added to the damage roll), level 10
  Bramblebark (1d8 piercing to melee attackers — no temp HP needed), level 14 Mighty Trunk (resist bludgeoning +
  piercing). Ends after 10 minutes, at 0 HP, on an incapacitating condition, or when dismissed (the button toggles).
  Casting Shillelagh as an Old Ways druid offers to switch it on for 1 Wild Shape without a second action.
- **Action economy per turn**: Action / Bonus Action / Reaction pips (plus Extra Attack progress) for the sheet's token
  while initiative runs; reset when the token's turn starts. Attack rows, spells (by their action type), Rage,
  Wild Shape and Wood Wose spend the matching resource and warn — never block — when it is already spent. Extra Attack
  does not stack across classes (Fighter scales 2 → 3 → 4).
- **Multiclass: prepared-spell limits per casting class** (SRD 5.2.1 class tables): "chuẩn bị 5/6 · cantrip 3/3" per
  class, counted from each spell's casting class; red when over.

### Fixed

- The server no longer crashes on a well-formed JSON message that has no `action`.

## [0.50.0] - 2026-09-22

### Added

- **Delete a character sheet**: "🗑 Xóa" in the sheet dock (with confirmation; owner or DM).
- **Multiclass, end to end** (SRD 5.2.1 rules):
  - The class list (name / subclass / level per class) now lives in the Basic header — "+ nghề phụ" turns a
    single-class sheet into a multiclass one; total level and proficiency bonus follow it.
  - Multiclass prerequisites: warns when any class' primary ability is below 13 (Fighter: STR or DEX;
    Monk / Ranger: DEX + WIS; Paladin: STR + CHA…), and that Extra Attack from several classes does not stack.
  - **Per-spell casting class**: each spell can be tied to one of the sheet's casting classes and then uses that
    class' spellcasting ability for its save DC / attack bonus / damage modifier (`Spell.castingClass`,
    `spellSaveDc(sheet, spell)`, `spellAttackBonus(sheet, spell)`). Spells added from the SRD list are tagged
    automatically when there are two or more casting classes.
  - "Điền theo class" adds the features of **every** class up to that class' own level (saves / starting skills
    still come from the first class only; recommended HP already covered all classes).
- **Damage rider scope "đánh tay không"** — a rider that applies to unarmed strikes only (weapon-scope riders keep
  applying to them too, so nothing is counted twice).

### Fixed

- Multiclass spell slots: Paladin / Ranger levels count **half rounded up** (was rounded down), per SRD 5.2.1
  (Ranger 4 / Sorcerer 3 = caster level 5).
- The "+ rider" button was centred and borderless; it is now a left-aligned bordered button.

## [0.49.0] - 2026-09-22

### Added

- **Scanned-rulebook OCR pipeline (local, personal use)** for 2024-format Monster Manuals whose PDF has no
  usable text layer: `scripts/ocr-book.mjs` (Ghostscript render, left/right column crop, Tesseract),
  `scripts/mm-clean.mjs` (repairs the ability table, headings and names via the table of contents, re-reads
  garbled AC/HP lines at 300 dpi), `scripts/mm-finalize.mjs` (drops SRD duplicates, validates HP / damage
  averages / PB, writes an importable bestiary JSON + a Markdown review checklist).
  `extract-monsters.mjs` gained `--text` and `--id-prefix`. All output is book content: it stays in the
  git-ignored `.srd-src/` folder and must never be committed.

## [0.48.0] - 2026-09-22

### Added

- **Shillelagh now reshapes the caster's weapon attacks.** Casting it puts a 10-round effect on the
  caster's token; while it lasts, club / quarterstaff attacks use the spellcasting ability + proficiency
  to hit and the scaled die (d8 → d10 at level 5, d12 at 11, 2d6 at 17) + spellcasting modifier for
  damage. If no club/staff is equipped, a ready-made attack row appears. (New `weaponImbue` on
  `ActiveEffect`; `allActions(sheet, effects)`.) Shillelagh spells added earlier work without re-adding.
- **Circle of the Old Ways — Wood Wose button** on the Druid features row (−1 Wild Shape): unarmored
  AC = 10 + DEX + WIS (Bark Bulwark) for 10 minutes and temp HP = WIS mod + PB (Rampant Growth).
- `link-token-art.mjs`: understands Forgotten Adventures file names, a SRD-2024 → token name alias
  table (Goblin Warrior → Goblin, Adult dragons → Young dragon art…), and `--only-prefix srd-`.

### Changed

- `link-token-art.mjs` typo tolerance tightened (long names only) after short names matched wrongly.

### Docs

- README: personal-use terms for privately shared rulebook PDFs (non-commercial, never committed).

## [0.47.1] - 2026-09-22

### Added

- **SRD 5.2.1 monsters: the last 6 stat blocks** — 336 in `client/public/srd/monsters.json`
  (was 330). These are the ones that live outside the Monsters chapter and depend on the
  caster / spell level: Animated Object (Animate Objects), Otherworldly Steed (Find Steed),
  Giant Insect, Draconic Spirit (Summon Dragon), plus Giant Fly (Figurine of Wondrous Power)
  and Avatar of Death (Deck of Many Things). Tagged `variable`; their formulas ("AC 11 + the
  spell's level") are kept in the description / notes.
- `extract-monsters.mjs` now reads summon-style blocks ("CR None", "HP" without a number).

## [0.47.0] - 2026-09-22

### Added

- **🗺 Map library (DM)**. `scripts/import-maps.mjs "<pack folder>"` copies a purchased map pack
  into the server's `data/maps/` (light **gridless WebP** by default, plus region maps and
  cutaways) and writes `index.json`, grouping every map by **chapter** (titles via `--titles`).
  A **🗺 Bản đồ** button in the top bar opens the library: chapters as collapsible groups,
  search, 👁 preview, **Dùng cho cảnh này** (swap the current scene's background, tokens
  stay) or **+ Cảnh mới** (new scene). The board is sized from the map's `W×H` grid squares in
  its file name, so tokens land on the printed squares. The server serves `/maps` (env
  `MAPS_DIR`, `/data/maps` in Docker); images are git-ignored, never bundled.
- **Subclass field on single-class sheets** (next to the class): free text with autocomplete
  from the local subclass data — previously it could only be set through the multiclass editor
  or a PDF import. PDF import now snaps a typed subclass ("Circle of the old way") to the official
  name in the local data.

## [0.46.0] - 2026-09-22

### Added

- **Melee / ranged tag on attacks** (`SheetAction.attackRange`, `InventoryItem.attackRange`,
  `attack.attackRange`). Every attack row shows a **⚔ cận / 🏹 xa** chip you can flip (a thrown
  dagger stabbed in melee, a bow fired point-blank); untagged attacks are inferred from their
  range ("5 ft" / "Chạm" → melee, "80/320 ft" → ranged) and stat-block wording ("Ranged Attack
  Roll"). It works whatever the distance, so a ranged attack made at close quarters is still
  *ranged*:
  - a ranged attack against a target within 5 ft automatically has **Disadvantage** (noted in
    the roll label);
  - **Armor of Agathys** retaliation now needs a *melee*-tagged hit (reach weapons count),
    so a bow shot from an adjacent enemy no longer triggers it.

### Fixed

- The client-side movement ring used the sheet's raw speed; it now uses the computed speed
  (Fast Movement / Unarmored Movement) like the server.

## [0.45.0] - 2026-09-22

### Added

- **Temporary hit points, end to end.** Temp HP now absorb damage before HP (attacks, direct
  damage and AoE saves), never stack (a new grant only replaces a smaller pool), and show in
  the damage log ("HP tạm hấp thụ N"). New `grantTempHp` action; spells can declare
  `tempHp` (**False Life** 2d4+4, new **Armor of Agathys** 5). Armor of Agathys also
  **retaliates**: while its temp HP last, an adjacent creature that hits the bearer takes
  5 cold, and the effect ends when the temp HP run out.
- **Automatic AC** (`effectiveArmorClass`): armor / shield, plus **Unarmored Defense** for
  Barbarian (10 + DEX + CON) and Monk (10 + DEX + WIS), plus spell effects — **Mage Armor**
  (13 + DEX, no armor), **Shield of Faith** (+2), **Shield** (+5, one round), **Barkskin**
  (at least 17). NPC tokens get the same effects.
- **Automatic speed** (`computeSpeed`): species base speed + Barbarian Fast Movement (+10,
  not in heavy armor) + Monk Unarmored Movement; the movement tracker uses it.
- **Hit Dice**: pools per die size from class levels, a "♥ dùng" button spends one (server
  rolls dX + CON and heals), and a **long rest regains half the total** (min 1, largest
  first). Multiclass keeps separate die sizes.
- **Proficiency bonus is always derived from level** (server normalises every sheet, incl.
  PDF imports).

### Changed

- **Sheet-linked tokens now share HP with their sheet** (previously the token and the sheet
  kept two separate HP values, so damage on the map never reached the sheet): damage / heal /
  temp HP / hit dice go through the sheet and are mirrored onto the token, editing the
  token's HP edits the sheet, and the token's AC is derived from the sheet (and can no
  longer be typed over).

## [0.44.0] - 2026-09-21

### Added

- **Species on the character sheet.** A **Species** dropdown next to the class (Cơ bản tab)
  lists species from a local, git-ignored `client/src/data/species.local.json` (the repo ships
  none; see `species.example.json` and the data README). Choosing one:
  - sets the base Speed and shows type / size / movement (Fly = Speed…) / Darkvision;
  - adds the spells it grants — the cantrip at level 1 and "always prepared" ones once the
    character reaches their level (tagged so they are removed cleanly if the species changes);
  - lists the racial traits under **Species features**, level-gated, with pip trackers for
    limited-use traits (1/short, PB/long…) that reset on short / long rest;
  - a casting-ability picker (INT/WIS/CHA) for species spells.
  Changing species swaps everything in place. PDF import reads the sheet's RACE box and
  applies the matching species (typos forgiven). `shared/src/species.ts` + tests (invented
  test species only).

## [0.43.0] - 2026-09-21

### Added

- **SRD 5.2.1 spell database is now complete for cantrips, level 1 and level 2** (checked
  against the SRD's own spell list; a test fails if any is missing): +19 level-1 spells
  (Alarm, Animal Friendship, Dissonant Whispers, **Divine Smite**, Ensnaring Strike,
  Searing Smite, Ice Knife, Identify, Fog Cloud, …) and +24 level-2 spells (**Barkskin**,
  **Spike Growth**, Gust of Wind, Mind Spike, Shining Smite, Flame Blade, Find Steed,
  Phantasmal Force, Alter Self, …). Combat ones are wired for semi-automatic casting
  (damage / save / smite), the rest carry a Vietnamese summary. 2014 ↔ 2024 names work
  through `aliases` (Acid Arrow / Melf's Acid Arrow, Hideous Laughter, Tiny Hut).
- `client/public/srd/spells.json`: SRD spell index (name, level, school, classes).

### Changed

- **Spell pickers are searchable dropdowns, one per level** (cantrip / 1 / 2 / 3), like the
  per-level boxes on the paper sheet: type to filter (name, alias, school, class), click or
  Enter to add. A picker only ever lists spells of its own level; the caster's class list
  comes first. PDF import understands aliases too.

## [0.42.0] - 2026-09-21

### Added

- **✨ Điền theo class** (Cơ bản tab). For players who only wrote down ability scores: once
  class + level are set, one dialog fills in the class saving-throw proficiencies, lets
  you tick the class's skill picks (right count and list per class), suggests HP (max
  die at level 1, average after, + CON each level) and adds the class features of every
  level up to the character's from the SRD. Save / skill totals were already computed
  from ability scores + proficiency; this supplies the missing proficiencies.
  `shared/src/classDefaults.ts` (SRD 5.2.1 hit die / saves / skill lists) + tests.
- PDF import now also fills the class saving-throw proficiencies.
- `classes.json` marks subclass entries (`sub: true`).

## [0.41.0] - 2026-09-21

### Added

- **Import a character sheet from PDF.** In the character dock, **📄 PDF** (or drag a PDF
  onto the dock) reads a filled-in fillable "Sirindoodles" 5e sheet **in the browser**
  (nothing is uploaded; `pdf-lib` is lazy-loaded) and creates the sheet: name, class +
  subclass, level, ability scores, save / skill proficiencies (from check boxes or the
  printed bonuses, incl. expertise), HP, AC, speed, initiative, attacks, features, gear,
  coins, notes (race, background, personality, backstory…), and spells by level — each
  spell fuzzy-matched to the built-in DB (typos and mis-filed cantrips handled) so it
  is wired for semi-automatic casting; unknown spells become note entries. Spell slots
  come from the class table. `shared/src/importPdfSheet.ts` + tests.

## [0.40.0] - 2026-09-21

### Added

- **AoE templates on the map.** `shared/src/aoe.ts` parses "30-foot Cone" / "20-foot
  Emanation" / "cầu 20ft" text and computes which tokens a cone / line / cube /
  sphere / emanation catches (`parseArea`, `aoeGeometry`, `aoeTokenIds`).
  - Monster actions that force a save and describe an area get a **🔺 vùng** button:
    the template follows the cursor (anchored on the monster, or on a chosen point
    with a range ring), tokens inside are outlined red, the banner counts them; click
    to confirm and the server silently rolls each target's save + damage.
  - Save spells that have an `area` (Fireball, Burning Hands, Fear, Hypnotic
    Pattern, …) use the same placement instead of picking a single token.
  - AoE damage dice are rolled **once** per cast and shared by all targets
    (`spellSave.aoeId`); a multi-target concentration effect no longer wipes the
    previous targets' effect.
- `scripts/link-token-art.mjs`: match a token-art folder to bestiary entries by name
  (typo-tolerant), copy the images into the uploads folder and set `imageUrl`.

## [0.39.0] - 2026-09-21

### Added

- **Stat block ⇄ token wiring.**
  - Drag a monster from the new **⚔ Kéo quái vào bản đồ** palette (DM, searchable)
    onto the map to spawn its fully-stat'd token there (`spawnStatblock`; hold
    Shift while dropping to roll HP from the formula instead of the average).
  - Token inspector (DM): **📖 Mở statblock** jumps to the token's source entry in the
    Bestiary; **💾 Cập nhật statblock** writes the token's edits back to that entry;
    on a plain token **💾 Lưu vào Bestiary** creates a new entry and links the token to it.

### Changed

- The bestiary is DM-only and can be very large (SRD import = 330 blocks), so the
  server no longer sends it to players in `welcome` / `state` broadcasts.

## [0.38.0] - 2026-09-21

### Added

- **SRD 5.2.1 monsters (330 stat blocks)** bundled as `client/public/srd/monsters.json`
  (CC BY 4.0, © Wizards of the Coast). Bestiary panel → **Nạp SRD** merges them into
  the bestiary, ready to spawn as tokens.
- **SRD 5.2.1 classes** (12 classes, 244 entries: core traits + every class/subclass
  feature by level) as `client/public/srd/classes.json`; searchable in the Tra cứu →
  SRD tab under "Class (SRD)".
- `scripts/extract-monsters.mjs`: PDF → bestiary JSON for 2024-format stat blocks
  (AC/HP/Speed, ability scores + save proficiencies, skills, resistances/immunities,
  traits, actions / bonus / reactions / legendary with parsed attack bonus, damage,
  extra damage and save DC). Handles both the Crooked Moon (local, git-ignored output)
  and SRD layouts. Import via the Bestiary panel ("Nhập file").
- `scripts/build-srd-classes.mjs`: SRD PDF → `classes.json`.

## [0.37.0] - 2026-09-21

### Added

- **Tra cứu panel is now tabbed**: 📚 SRD, 📖 Lore Book (DM only), 🌐 Web. The
  SRD tab is a searchable Vietnamese paraphrase of SRD 5.2.1 (conditions,
  actions, combat rules, weapon properties + mastery, skills, rests, environment)
  plus every spell in the built-in DB (level, range, area, damage). CC BY 4.0
  attribution shown in the panel.
- **Lore Book**: full-text search over the locally extracted book
  (`lorebook.local.json`), ranked, with snippets and full-page expand, plus a
  🧵 Fate Weaving tab (quick searches, or curated `threads[]` if present). Served
  by `GET /lorebook` to the DM only (`x-participant-id`); never bundled.
- **Delete token**: 🗑 button in the token inspector and the Delete key (DM: any
  token; players: their own). Deleting unlinks any character sheet bound to it.

### Changed

- Right-click on a token no longer opens the browser menu (it selects the token);
  native image dragging of tokens is disabled.
- `.dockerignore` excludes `client/src/data/*.local.json`.
- Hardened VPS deploy (ufw, fail2ban, non-root container, headers) and added
  `docs/TAILSCALE.md` (no-public-server remote play).

## [0.36.0] - 2026-09-10

### Changed

- **Spell range vs. area of effect are now separate.** `Spell.area` /
  `CantripDef.area` holds the AoE template ("cầu 20ft", "nón 15ft", "tia dài
  100ft"); `range` is purely the casting range. ~40 spell defs updated: Lightning
  Bolt / Burning Hands / Thunderwave / Fear / Spirit Guardians / … are now
  `range: 'Bản thân'` with the template in `area`; Beacon of Hope fixed to 30 ft;
  Fireball etc. keep their real casting range plus a template. The cast banner
  and the spell picker show both; the range ring on the map uses whichever is
  larger (casting range, or the area for a Self spell). The Spell tab exposes
  editable **Tầm** / **Vùng (AoE)** fields.

## [0.35.0] - 2026-09-10

### Added

- **Level-3 spells, semi-automatic** — a "+ Phép cấp 3 SRD" picker (~55 spells,
  2024 mechanics paraphrased), same wiring as levels 1–2:
  - Save + half-on-hit AoE: **Fireball**, **Lightning Bolt**, Call Lightning,
    **Spirit Guardians**, Conjure Animals, Conjure Barrage, Wind Wall, Thunder
    Step.
  - Save + condition: **Fear** (Frightened), **Hypnotic Pattern**, Slow,
    Stinking Cloud, Bestow Curse, Sleet Storm — with end-of-turn re-saves.
  - Attack / auto damage: Vampiric Touch, Hunger of Hadar.
  - Healing: Mass Healing Word, Aura of Vitality (bonus-action, concentration).
  - Smite riders: Blinding Smite, Lightning Arrow.
  - Buffs (Haste, Fly, Blink, Protection from Energy, …) and the utility long
    tail (Counterspell, Dispel Magic, Tongues, Summon Fey/Undead, …) as guidance
    entries. `SRD_L3_SPELLS` / `l3SpellsForSheet`.

## [0.34.0] - 2026-09-10

### Added

- **PDF → text extraction pipeline** (`scripts/extract-pdf.mjs`): per-page text
  via Poppler `pdftotext`, with an OCR fallback (Ghostscript + Tesseract) for
  image-only pages. Emits a full `.txt`, a `pages.json` manifest, and a
  `lorebook.json` (`{ source, pageCount, pages: [{page,text}], threads? }`).
  Groundwork for the DM-only **Lore book** (fast search over a setting book you
  own, with a pinned Fate Weaving / Threads-of-Fate view) and **Homebrew
  tracker** screens — see `docs/LOREBOOK.md`. Book text stays out of the repo
  (`client/src/data/lorebook.local.json` / `homebrew.local.json` git-ignored);
  the repo ships only the script + JSON schemas (`*.example.json`).

## [0.33.0] - 2026-09-10

### Added

- **One-command remote hosting.** `Dockerfile` (client build + server in one
  image), `deploy/docker-compose.yml` + `deploy/Caddyfile.template` — Caddy does
  automatic HTTPS on a `<ip>.sslip.io` address (no domain needed) and gates the
  **whole room** behind one shared HTTP Basic-Auth password (the app itself stays
  auth-free). `deploy/setup.sh` is a `curl … | sudo bash` installer/updater for a
  fresh Ubuntu VPS: installs Docker + git, adds swap, clones the repo, prompts
  for the shared password, `docker compose up -d --build`; re-run to update.
  Step-by-step Vietnamese guide in `docs/HOSTING.md`. Server reads `CLIENT_DIST`
  for the static-file path. Optional prebuilt-image path (GHCR + GitHub Actions)
  documented in `deploy/optional-ghcr-workflow.yml`.

## [0.32.0] - 2026-09-09

### Added

- **Grappling (2024 rules).** A **🤼 vật lộn** toggle next to the unarmed-strike
  row (needs a target). The server rolls the target's save **silently**, using
  the *better* of its STR / DEX modifier vs. DC `8 + grappler STR mod + PB`
  (`grappleDc`; a Monk may use DEX). On a failure the target gains the
  **Grappled** condition from the grappler (Speed 0 — the movement tracker
  enforces it), with an escape note (action + STR/DEX check vs. the same DC).
  The button flips to **✋ thả** to release. New `grapple` protocol action with
  a `release` flag.

## [0.31.0] - 2026-09-09

### Added

- **Movement tracker.** When initiative is running, the active token shows a
  green reach square from where it started its turn and a "used/budget ft"
  badge. On a player's turn the server **clamps** their token's move to its
  Speed (`walkSpeed` — linked sheet, else stat block, else 30; Grappled → 0);
  off-turn moves in combat are blocked. The token inspector has **⚡ Dash**
  (grant one more Speed of movement this turn) and **↺ Reset** (snap the token
  back to its turn-start position). New `Token.turnAnchor` / `Token.extraMove`,
  actions `tokenDash` / `resetTokenMove`, `TokenStatblock.speed`.
- **Range display.** Arming a spell cast (🪄) draws a dashed range circle around
  the caster's token and shows the range in the cast banner (`parseRangeFeet`).
  Weapon / action rows show their reach ("· tầm 5 ft"); weapons get a `rangeText`
  field, `SheetAction` a `range` field, editable in the Equipment / action editors.

## [0.30.0] - 2026-09-09

### Added

- **Attunement counter.** `InventoryItem.attuned` + `attunementCount(sheet)` /
  `ATTUNEMENT_SLOTS` (3). The Equipment tab shows a "⚡ Điều hợp N/3" badge and a
  per-item "⚡ Điều hợp" checkbox; once 3 items are attuned the checkbox on the
  rest is disabled ("hết slot"), so a character can't exceed the 5e limit.
  Attuned items are marked "· ⚡" in the item list.

## [0.29.0] - 2026-09-09

### Added

- **Level-2 combat spells, semi-automatic** — a "+ Phép cấp 2 SRD" picker
  alongside the cantrip / level-1 ones:
  - Attack: Scorching Ray, Melf's Acid Arrow, **Spiritual Weapon** (the casting
    modifier is baked into the damage via the new `addSpellMod` flag).
  - Auto-hit: Cloud of Daggers, Heat Metal.
  - Save + half-on-hit: Shatter, Moonbeam, Flaming Sphere.
  - Save + condition: **Hold Person** (Paralyzed — wired: auto-crit in melee),
    Blindness/Deafness, Web (Restrained), Crown of Madness / Suggestion (Charmed),
    with end-of-turn re-saves.
  - Healing: Prayer of Healing. Plus ~20 common level-2 utility spells
    (Misty Step, Invisibility, Blur, Darkness, Silence, Pass without Trace,
    Enhance Ability, Lesser Restoration, Aid, …) as guidance entries.
- **Concentration is now tracked for pure damage / attack concentration spells.**
  Casting Witch Bolt, Moonbeam, Flaming Sphere, Cloud of Daggers, Heat Metal, …
  places a "Đang tập trung: X" marker on the caster's own token, so casting a
  second concentration spell correctly drops the first (and its effects).
- **`rider` cast kind in the spell DB** — Hex and Hunter's Mark are now in the
  picker (they place a target-bound damage rider, same as the quick "Đánh dấu"
  control).
- Spell reactions (`actionType: 'reaction'` — Hellish Rebuke, Feather Fall,
  Shield).

### Changed

- **Cantrip + level-1 spell lists filled out** — cantrips: added Sorcerous Burst,
  Thunderclap, Elementalism, Blade Ward, Friends (34 total). Level 1: added
  Inflict Wounds, Hellish Rebuke, Arms of Hadar, Color Spray, Tasha's Hideous
  Laughter, Command, Entangle, Grease, Hex, Hunter's Mark, Charm Person, and the
  common utility spells (Detect Magic, Feather Fall, Longstrider, Jump, Speak
  with Animals, Disguise Self, Silent Image, Find Familiar, …) — 40 total. The
  long tail of rare utility spells is still added by hand with "+ Thêm phép".

## [0.28.0] - 2026-09-09

### Added

- **Level-1 combat spells, semi-automatic** — a "+ Phép cấp 1 SRD" picker in the
  Spell tab (mechanics paraphrased from SRD 5.2 / 2024, no spell text):
  - **Healing** (`castKind: 'heal'`): Healing Word, Cure Wounds — the caster's
    spellcasting modifier is added automatically; the new `heal` action adds HP
    to the target token, clamped to its max, logged.
  - **Attack**: Guiding Bolt, Chromatic Orb, Witch Bolt, Ray of Sickness.
  - **Auto-hit** (`castKind: 'damage'`): Magic Missile — no attack roll, damage
    applied straight to the target.
  - **Save with half-on-hit** (`Spell.save.halfOnSave`): Burning Hands,
    Thunderwave — the server rolls the save silently and applies full damage on a
    failure, **half on a success** (level 1+, unlike cantrips). Sleep, Bane,
    Faerie Fire wire their conditions/notes.
  - Bless / Shield / Mage Armor are added with guidance text only (persistent
    buffs aren't auto-applied yet).
- **Basic unarmed strike for everyone** — `unarmedAction` (5e 2024: 1 + STR mod
  bludgeoning, proficient). `allActions` always offers it; Monks keep their
  stronger Martial Arts version instead.

### Changed

- **Damage-rider mechanism reworked around the weapon/spell tag.** `SheetAction`
  gained `attackKind` ('weapon' default / 'spell'); a single `riderParts(sheet,
  kind)` decides rider scoping for both weapon rows and spell attacks
  (`actionDamageParts` and `spellAttackParts` both route through it). Spell-tagged
  attack rows no longer pick up weapon-only riders, Rage or Sneak Attack.
  `derivedActions` / `monkUnarmedAction` are tagged `attackKind: 'weapon'`.

## [0.27.0] - 2026-09-09

### Added

- **Weapon-attack vs. spell-attack tag on damage riders.** `DamageRider.scope`
  = `weapon` (default — the action-economy rows), `spell` (spell attacks only),
  or `any` (both), pickable per rider in the editor. Weapon rows now skip
  spell-only riders; **spell attacks now pick up `spell` / `any` riders**
  (`spellRiderParts` / `spellAttackParts`), which they never did before.
- **Guidance is semi-automatic.** Cast it (🪄) on an ally token: their next
  ability check / skill roll from the sheet automatically gets **+1d4**, shown in
  the roll label, and the effect clears itself (one-shot, like the spell). No
  manual dice. Backed by `ActiveEffect.rollBonus` + `pendingRollBonus(token,
  'check')`; consumed in the Cơ bản and Kỹ năng tabs. Saving throws are
  unaffected (Guidance is checks only).

### Changed

- Point-and-click spell attacks are labelled "(phép)" and fold in the caster's
  spell-scoped riders.

## [0.26.0] - 2026-09-09

### Added

- **Cantrip database (SRD 5e 2024)** — `shared/src/cantrips.ts` with paraphrased
  mechanics (SRD 5.2, CC-BY-4.0; no spell text reproduced) and a short Vietnamese
  guidance line per cantrip.
- **Semi-automatic combat cantrips.** The Spell tab has a "**+ Cantrip SRD**"
  picker, grouped by the sheet's class spell list vs. the rest and by
  combat / utility. Picking a combat cantrip fills in the cast kind, the damage
  dice **scaled to the character's level** (1 / 2 / 3 / 4 dice at levels
  1 / 5 / 11 / 17), and — for save cantrips — the saving throw, so the existing
  point-and-click cast flow just works: Fire Bolt / Eldritch Blast / Ray of
  Frost / Shocking Grasp / Chill Touch / Produce Flame / Thorn Whip (attack),
  Sacred Flame / Toll the Dead / Poison Spray / Acid Splash / Vicious Mockery /
  Mind Sliver / Starry Wisp / Word of Radiance (save).
- **Save cantrips deal damage on a failed save** — the server rolls the target's
  save silently and, on a failure, rolls and applies the cantrip damage
  (`spellSave` gained `damageOnFail`); 2024 cantrips deal nothing on a success.
- A **⟳ rescale** button on cantrip rows re-rolls the damage dice count to the
  character's current level.
- Utility cantrips (Guidance, Mage Hand, Light, Shillelagh, …) are added with
  their guidance text and an editable notes field; no automatic rolls.

## [0.25.0] - 2026-09-08

### Changed

- Subclass-feature support verified for **Druid Circle of the Old Ways** (levels
  3, 6, 10 and 14) — its Wood Wose feature ties to the existing Wild Shape use
  tracker. With this, the whole subclass set the table is currently using is
  covered by the "Subclass features" section. Content stays in the DM's
  git-ignored `client/src/data/subclasses.local.json`.

## [0.24.0] - 2026-09-08

### Changed

- Subclass-feature support verified for **Warlock Great Fool Patron** (levels 3,
  6, 10 and 14), with per-feature use pools (Killing Joke = CHA-mod / short rest;
  Jester's Japes and Mocking Banter = 1 / short rest; Send in the Clowns = 1 /
  long rest). As before, the content is not in the repo — it lives in the DM's
  git-ignored `client/src/data/subclasses.local.json`.

## [0.23.0] - 2026-09-08

### Changed

- Subclass-feature support verified for **Barbarian Path of the Experiment** (all
  of levels 3–14) and **Monk Warrior of the Pestilent Haze** (levels 3, 6, 11
  and 17 — the level-11 Miasmic Contagion feature was missing from the first
  pass and is now included). No repo content — these live in the DM's
  git-ignored `client/src/data/subclasses.local.json`; the app just derives and
  displays whatever is in that file.

## [0.22.0] - 2026-09-08

### Added

- **Subclass features.** A separate **"Subclass features"** section on the sheet
  (below "Class features") that auto-populates by class level from
  `SubclassFeatureDef` data. Features with a limited-use pool render a spend
  tracker (`max` = a number or `cha-mod` / `wis-mod` / `con-mod` / `prof`;
  recharge short / long — a short rest resets short-recharge pools, a long rest
  resets all).
- **Local subclass data.** The repo ships **no** subclass content — non-SRD
  subclasses (a setting you own, homebrew) go in a git-ignored
  `client/src/data/subclasses.local.json`, loaded via `import.meta.glob` and
  bundled into the client build (so the server ships it to every player). Format
  in `client/src/data/subclasses.example.json` + `README.md`.

### Changed

- `CharacterSheet.subclassUses?: Record<string, number>`. Shared:
  `SubclassFeatureDef`, `derivedSubclassFeatures`, `subclassUsesMax` (+ tests,
  78 total). No protocol/schema change.

## [0.21.0] - 2026-09-08

### Added

- **Class features — Druid** (base class). Feature list 1–20; full WIS caster
  (already wired). **Wild Shape** semi-automatic: uses tracker (max 2 → 3 at
  level 6 → 4 at level 17; a short rest recovers one, a long rest all) with a
  spend button. The Spells tab handles slots / DC / spell attack.

### Changed

- `CharacterSheet.wildShapeUsed?`. Shared: `druidLevel`, `wildShapeMax` (+ tests,
  77 total). No protocol/schema change.

## [0.20.0] - 2026-09-08

### Added

- **Class features — Monk & Warlock** (base class; subclasses later), same
  data-driven "Class features" section as Rogue/Barbarian.
- **Monk semi-automatic:**
  - **Martial Arts** — a derived **"Đánh không vũ khí" action** (attack + damage
    using the Martial Arts die 1d6 → 1d8 (5) → 1d10 (11) → 1d12 (17), DEX or STR
    whichever is higher) shows up in the action list automatically.
  - **Focus Points** — pip tracker (max = Monk level from level 2; all return on
    a short or long rest) with one-tap spend buttons for Flurry of Blows,
    Patient Defense, Step of the Wind, and Stunning Strike (shows the Monk DC
    `8 + PB + WIS`).
- **Warlock** — feature list incl. Mystic Arcanum; Pact Magic points to the
  existing Phép tab (slots / DC / attack already auto-computed from Warlock
  level since 0.15).

### Changed

- `CharacterSheet.focusUsed?`. Shared: `monkLevel`, `warlockLevel`,
  `martialArtsDie`, `monkFocusMax`, `monkDc`, `monkUnarmedAction` (folded into
  `allActions`) (+ tests, 76 total). No protocol/schema change.

## [0.19.0] - 2026-09-08

### Added

- **Class features — Rogue & Barbarian** (base class; subclasses later). A
  `CLASS_FEATURES` table (levels 1–20, mechanics paraphrased from SRD 5.2,
  CC-BY-4.0) drives a **"Class features" section** on the character sheet that
  fills itself in from the character's class + level — no manual entry.
- **Semi-automatic mechanics:**
  - **Rogue — Sneak Attack.** A toggle arms `+⌈level/2⌉d6` for the next attack;
    `actionDamageParts` adds it to that weapon attack's damage, then the sheet
    disarms it. Cunning Action is surfaced as a reminder.
  - **Barbarian — Rage.** Toggle on the sheet, with a Rage-charge pip tracker
    (max 2–6 by level; a short rest recovers one, a long rest all). While
    raging: rage damage (+2 / +3 at 9 / +4 at 16) is added to weapon attacks
    automatically, and `derivedDefenses` grants resistance to bludgeoning /
    piercing / slashing (so the barbarian's token takes half from those).
    Rage never auto-ends — the player toggles it off.

### Changed

- `CharacterSheet` gains `raging?`, `rageUsed?`, `sneakAttackArmed?`. Shared:
  `classFeatures.ts` (`CLASS_FEATURES`, `derivedClassFeatures`), `classLevelOf`,
  `rogueLevel`, `barbarianLevel`, `sneakAttackDice`, `rageDamageBonus`,
  `rageMax` (+ tests, 74 total). No protocol/schema change.

## [0.18.0] - 2026-09-08

### Added

- **5etools-JSON monster import.** Bestiary → "Dán 5etools JSON": paste a
  5etools creature object, an array, or a `{ "monster": [...] }` file and it
  converts to the app's `Statblock` — AC, HP + formula, ability scores, saves,
  skills, senses/passive, CR → proficiency bonus, `resist`/`immune`/`vulnerable`
  → `Defenses`, and traits / actions / bonus actions / reactions / legendary
  actions with their entry text de-tagged (`{@dice}`, `{@hit}`, `{@condition}`,
  …). Attack and saving-throw actions are parsed into `attackBonus` / `damage` /
  `save` where the 2014 or 2024 wording is recognisable. `_copy` entries are
  skipped with a warning. Imports land in the DM's **git-ignored local
  bestiary** — nothing WotC/3rd-party ships in the repo.
- **Reference panel** ("Tra cứu" in the top bar). A resizable right-side panel
  that embeds a URL you configure (your own self-hosted 5etools mirror, a rules
  wiki, D&D Beyond…). The URL is per-browser (`localStorage`); the app hosts
  nothing. Sites that block framing get an "↗ open in a tab" button.

### Changed

- Shared: `parse5eToolsBestiary`, `convert5eToolsMonster`, `stripTags`,
  `flattenEntries`, `crToProficiency` (+ tests, 67 total).

## [0.17.0] - 2026-09-08

### Added

- **Image upload, kept on the server.** `POST /upload` accepts a base64 data URL
  (PNG / JPEG / WebP / GIF, ≤ 6 MB), writes it under `UPLOADS_DIR`
  (`server/data/uploads`, git-ignored) and serves it from `/uploads/…`. The
  token inspector and the map-background field now have an "⬆ Tải lên" picker
  (`ImageField`) alongside the paste-a-URL box — **players can upload their own
  token art**, and it lives on the server rather than a third-party URL. Vite
  dev-proxies `/upload` and `/uploads`.

## [0.16.0] - 2026-09-08

### Added

- **Scenes.** `RoomState.scenes: Scene[]` + `activeSceneId` — each scene keeps
  its own battle map and token layout. The DM's "⚙ Bản đồ & cảnh" toolbar has a
  scene bar: activate (click), rename (double-click), duplicate (⧉), delete (✕),
  "+ cảnh". `RoomState.map` / `RoomState.tokens` are live aliases of the active
  scene, so all existing map/token code is unchanged; `room.json` stores the
  scenes and rebuilds the aliases on load. Migration v5 → v6 wraps the old
  single map + token list in "Cảnh 1".
- **Character-sheet and stat-block data never resets on a scene change.** Sheets
  and the bestiary are room-global; a token's HP / effects are stored in its
  scene and are exactly as you left them when you switch back (verified — damage
  a token, bounce scenes, reload: unchanged).
- **Auto grid.** Setting a background loads its aspect ratio; entering the number
  of columns recomputes rows to keep cells square (⤢ "tự chia ô"). The map
  background now fills the board so the grid always divides it evenly.
- **Snap to grid (Owlbear-style).** Tokens snap to cells on drop with a dashed
  snap-preview cell shown while dragging; hold **Shift** to place freely, or turn
  snapping off per-map.

### Changed

- Protocol v5: `sceneCreate` / `sceneActivate` / `sceneRename` /
  `sceneDuplicate` / `sceneDelete`. Room schema v6. `BattleMap.snap?`,
  `Scene` type.

## [0.15.0] - 2026-09-08

Commit C of the spellcasting work: multiclass + automatic spell-slot progression.

### Added

- **Multiclass.** `CharacterSheet.classes: ClassEntry[]` — a list of
  `{ name, subclass?, level }`. When set it is the source of truth: total
  `level`, `proficiencyBonus` and the display `className` ("Wizard 5 / Cleric 1")
  are kept in sync (server-side, in `normalizeSheet`). Editor in the Spells tab
  ("+ nghề phụ").
- **Automatic spell-slot progression (5e 2024).** Slot maxima are computed from
  the class levels and re-applied on every save (`applySpellProgression`,
  keeping the `used` counts):
  - full casters (Bard/Cleric/Druid/Sorcerer/Wizard) — standard table;
  - half casters (Paladin/Ranger) — 2024 half-caster table (slots from level 1);
  - third casters (Eldritch Knight / Arcane Trickster) — from level 3;
  - Warlock — Pact Magic table (count + slot level);
  - multiclass — full + ⌊half/2⌋ + ⌊third/3⌋ indexes the full-caster table;
    Warlock pact slots are always computed separately.
  The manual "+ Spell slot" / max / delete controls are gone for casters — the
  slot rows are read-only maxima with spend-tracking pips.

### Changed

- Shared: `ClassEntry`, `sheetClasses`, `totalLevelOf`, `casterTypeForClass`,
  `computeSpellSlots`, `computePactSlots`, `applySpellProgression`; `casterTypeOf`
  / `spellcastingAbilityOf` are multiclass-aware (+ tests, 60 total).

## [0.14.0] - 2026-09-08

Release B of the effects work — the spellcasting layer and the point-click cast
UI. Next up (commit C): multiclass + auto spell-slot progression on level-up.

### Added

- **Spells tab** on the character sheet. Known spells; level-1+ spells have a
  **prepared** checkbox (cantrips are always available). Each spell has a cast
  kind — *attack / save / rider / utility* — and kind-specific fields (damage
  parts, save ability + DC override + "save ends" cadence, rider die, effect
  condition).
- **Caster type** is derived from class, then subclass, then a manual override
  (`casterTypeOf`): full (Wizard/Cleric/Druid/Bard/Sorcerer), half
  (Paladin/Ranger — 2024: slots from level 1), third (Eldritch Knight / Arcane
  Trickster), pact (Warlock), or none. The **spell-slot section only appears
  for a caster** — Vancian slots for full/half/third, Pact Magic for Warlock.
- **Auto spell save DC & spell attack** (5e 2024): `8 + proficiency + ability
  mod` / `proficiency + ability mod`, ability derived from class (override
  available). Shown in the Spells tab.
- **Point-click casting.** Click 🪄 on a spell → a banner arms the cast → click
  an enemy token on the map. Rider spells place a concentration rider; save
  spells send `spellSave` (server rolls the target's save vs the DC and, on a
  failure, applies the effect — a "save ends" effect re-rolls at the chosen
  turn boundary); attack spells roll the spell attack. `Esc` cancels.
- **Thin-auto conditions.** The attack pipeline now folds in advantage /
  disadvantage from the ~7 combat-critical conditions (`conditionAttackMode`,
  combined with the manual roll mode the 5e way) and auto-crits melee hits on a
  paralyzed / unconscious target. Other conditions stay advisory badges.
- **Turn-boundary effect processing.** Ending a turn runs "save ends" re-saves
  (server-rolled, silent) on the ending and starting token and clears expired
  effects.

### Changed

- Protocol v4 gains `spellSave`. `attack` builds its notation from
  `attackBonus` + `rollMode` client-side so conditions can fold in.
- Shared: `CasterType`, `Spell`, `RollMode`, `casterTypeOf`,
  `spellcastingAbilityOf`, `spellSaveDc`, `spellAttackBonus`,
  `conditionAttackMode`, `conditionAutoCrit`, `combineRollModes`,
  `tokenConditions` (+ tests, 54 total).
- `CharacterSheet` gains `spells`, `subclass?`, `casterTypeOverride?`,
  `spellcastingAbility?` (optional, backfilled by `normalizeSheet`).

## [0.13.0] - 2026-09-08

Release A of the effects work (concentration engine + riders); Release B (spell
tab, point-click cast, condition auto-effects, save-ends spells) follows.

### Added

- **Adamantine crit immunity from gear.** An inventory armour item can be tagged
  "Adamantine (miễn chí mạng khi mặc)"; while equipped, the wearer's linked
  token can't be crit. `derivedDefenses(sheet)` merges into the token's own
  `defenses` at resolve time (`mergeDefenses`) — the DM still ticks crit
  immunity directly on monster tokens as before.
- **Concentration.** A token holds one concentration at a time
  (`Token.concentration`). Casting a second concentration effect drops the
  first (and removes every effect it placed). Taking damage triggers a **silent
  CON save** — DC `max(10, ⌊damage/2⌋)` (5e 2024) — rolled by the server for
  players and monsters alike; on a failure the concentration and its effects
  drop, with a line in the roll log.
- **Active effects on tokens** (`Token.effects: ActiveEffect[]`): spell
  conditions (the 14 5e conditions, advisory badges for now), damage **riders**
  (extra damage when the source hits this token), recurring-save and note
  fields. Editor in the token inspector; a token badge (`🧠` / `✦n`) on the map.
- **Hex / Hunter's Mark.** Preset riders (`RIDER_PRESETS`) castable from the
  character sheet's target picker ("Đánh dấu → chiêu"); they're concentration
  effects bound to the target token and add their die to every hit the caster
  lands on that token, resolved per-part against the target's defences and
  through the homebrew crit rule.

### Changed

- Protocol v4: `attack` / `damage` carry `attackerSheetId` / `attackerTokenId`;
  new `applyEffect` / `removeEffect` / `clearConcentration` actions.
- Shared: `ActiveEffect`, `Concentration`, `CONDITIONS` / `CONDITION_VI`,
  `derivedDefenses`, `mergeDefenses`, `targetRiderParts`, `concentrationDc`,
  `RIDER_PRESETS` (+ tests, 49 total).

## [0.12.0] - 2026-09-08

### Added

- **Warlock Pact Magic slots.** `CharacterSheet.pactSlots` — a single pool of
  same-level slots kept separate from the Vancian `spellSlots`. Recharges on a
  **short or long** rest (`applyShortRest` now resets it too). Editor row under
  Resources with a level field, pips and a `+ Pact Magic` / `✕` toggle.

## [0.11.0] - 2026-09-08

### Added

- **Multi-source damage.** An attack can now carry several damage components,
  each with its own dice and damage type:
  - per-action **extra damage** parts (sheet action editor + stat-block action
    editor);
  - per-weapon **extra damage** (`weaponExtraDamage`, e.g. Flame Tongue's +2d6
    fire);
  - sheet-level **damage riders** (`DamageRider`) — a standing effect like a
    magic ring that adds `1d4` fire to every attack, toggleable, applied to
    weapon and manual attacks automatically.
  - Each part is resolved against the target's defences **independently** (so a
    fire-resistant target halves only the fire part) and the homebrew crit rule
    treats each part as its own source. The roll log shows the per-part
    breakdown.

### Fixed / verified

- **Crit immunity is strictly per-token.** Confirmed with tests: a target with
  no `defenses` always crits; `critImmune` (adamantine) downgrades the crit to a
  normal hit for that token only; a later attack on a normal target still crits
  (no shared state, no leak).

### Changed

- Protocol: `attack` / `damage` carry `damageParts: DamagePart[]` (+ per-part
  `partTotals`) instead of a single `damageNotation` / `damageType`.
- Shared: `actionDamageParts`, `statblockDamageParts`, `resolveDamageParts`,
  `DamagePart`, `DamageRider` (+ tests, 45 total).

## [0.10.0] - 2026-09-08

### Changed (homebrew rules — replace 5e RAW on this server)

- **Skill / ability / save checks crit & fail.** A natural 20 shows
  "THÀNH CÔNG TUYỆT ĐỐI", a natural 1 "THẤT BẠI THẢM HẠI" in the roll log
  (`RollLogEntry.checkNat`); the DM adjudicates the effect.
- **Modified critical damage.** Instead of doubling dice, a crit auto-maxes the
  character's original dice and adds **one extra die per damage source**.
  Rogue dagger + lv3 sneak attack: `1d4+2d6+4` → **`1d4+1d6+20`**
  (`homebrewCritDamage`, replaces `doubleDiceCounts` in the attack flow).

### Added

- **Damage types + resistances.** Actions carry a `damageType` (13 5e types via a
  dropdown, on sheet actions, weapons, stat-block actions and the map attack
  box). Tokens and stat blocks get a **Defenses** block — resistance (÷2),
  immunity (×0), vulnerability (×2), flat **damage reduction**, and
  **crit immunity (adamantine)** — applied server-side; the roll log shows the
  breakdown ("gốc 40 · fire · kháng Lửa (÷2) · giảm 3 (DR)").
- **Cover.** A cover state on each token (none / half +2 AC / 3/4 +5 AC / total).
  The AC bonus is added automatically when resolving attacks; a badge shows on
  the token; **the DM gets a warning listing every token in total cover** ("đừng
  đánh tầm xa"). Range attacks are *not* blocked — the warning is the mechanism.
- Shared: `homebrewCritDamage`, `applyDamageDefenses`, `coverAcBonus`,
  `emptyDefenses`, `DAMAGE_TYPES` / `DAMAGE_TYPE_VI`, `Defenses`, `CoverLevel`;
  `docs/bestiary-srd-starter.json` gains real damage types + Skeleton/Zombie
  defenses. Tests for the new helpers.

## [0.9.0] - 2026-09-08

### Added

- **Advantage / disadvantage** toggle on the character sheet (Cơ bản and Kỹ năng
  tabs) and the token stat-block inspector. Every d20 roll from there — checks,
  saves, skills, initiative, attack to-hits — becomes `2d20kh1` / `2d20kl1` and
  animates as two dice on dddice, per D&D 5e (2024).
- **Skills tab** on the character sheet: all 18 skills with a **proficient** and
  an **expertise** checkbox each (expertise = 2× proficiency bonus; ticking it
  implies proficiency), the governing ability, a roll button, and passive
  Perception.
- **Duplicate a token** — a "⧉ Kéo để nhân bản" palette on the map (drag a token
  onto the board to drop an independent copy) and a ⧉ button in the token
  inspector. A copied NPC token deep-copies its stat block so HP / actions track
  separately (two goblins, two HP pools). `copyToken` action.

### Changed

- **A token backs exactly one character sheet.** Linking a sheet to a token that
  already has a sheet, or to an NPC (stat-blocked) token, is refused with a hint
  to duplicate the token instead. The link pickers only list eligible tokens.

### Notes

- Critical miss was already handled: a natural 1 on an attack is an automatic
  miss (`resolveAttack`), shown as "HỎNG" in the log; natural 20 auto-hits and
  crits. 5e RAW has no crit-fail on ability checks / saves.

## [0.8.0] - 2026-09-08

### Added

- **Link a map token to a character sheet** — a "Token đại diện" picker in the
  sheet header, and a "Gán token này cho nhân vật" picker in the token inspector
  (a player links their own sheet, the DM any sheet).
- **Character portrait.** A circular avatar on the left of the sheet header shows
  the linked token (its image, or its colour + initials), with a small HP bar and
  a glow when it's that character's turn — Warcraft-style.
- **End turn button** — on the initiative strip for the DM ("Kết thúc lượt ▶")
  and at the top-right of the character sheet for the player (enabled only on
  their turn; the server checks the active entry belongs to them).
- **Prominent round counter** — a "Vòng N" badge on the initiative strip while
  combat is running.

### Changed

- **Initiative is now a rotating queue.** Ending a turn moves the active
  combatant to the **back** of the strip; the next one becomes active; a full
  cycle ticks the round and clears the "has gone" marks. A mid-combat initiative
  roll appends (acts at end of round) instead of re-sorting the live order.
- `initNext` is allowed for the DM **or** whoever controls the active combatant.

## [0.7.0] - 2026-09-08

### Added

- **Roll initiative from the character sheet.** The Chiến đấu section's
  **⚔ Init** button rolls initiative (through dddice when enabled), logs it, and
  puts the result straight onto the top **initiative bar** — linked to the
  sheet's token when it has one (`rollInitiative` action).
- **DM group-initiative roll.** A **⊕ Chọn nhóm init** mode on the map: click
  tokens (or tick "Thêm vào nhóm tung initiative" in a token's inspector), then
  **Tung initiative nhóm** rolls `1d20 + init mod` for every selected token
  **silently** — no dddice, no roll-log entries — and drops the results on the
  initiative bar (`rollInitiativeGroup` action, DM only). "Chọn hết NPC" selects
  every stat-blocked token.
- Both add or update entries (matched by token, else by name) without clearing
  the rest, so players self-roll and the DM batches the enemies into one list.

## [0.6.1] - 2026-09-08

### Added

- **Roll a monster's stats, saves, skills and attacks from its stat block**
  (D&D-Beyond style). The token inspector's stat-block section now has a
  clickable check + save button per ability, a button per skill, an initiative
  button, plus the existing action attack/damage buttons — all posting to the
  shared log as "<monster> · …" and through dddice when enabled.
- The Bestiary editor gets a **🎲 Roll thử** bar (ability checks, save
  proficiencies, skills, attack to-hits) so the DM can roll while browsing or
  building a stat block.
- `TokenStatblock` now carries `skills`; shared tests for
  `tokenStatblockFrom` / `tokenSaveBonus` / `statblockInitiativeMod`.

## [0.6.0] - 2026-09-08

### Added

- **Anyone can add a token** — a "+ Token" button on the map for every
  participant. A player's token gets them as `controllerId` (so they can move and
  remove it) and is always visible; only the DM can hide tokens or add hidden
  ones.
- **Bestiary** — the DM's NPC / monster stat block library (topbar → Bestiary,
  DM only). Each `Statblock` has AC, HP (+ dice formula), speed, abilities, save
  proficiencies, traits, and an action list. Search by name / type / tag,
  edit inline, **⤵ Spawn lên map** (optionally roll HP, spawn hidden), import /
  export as JSON.
- **Spawned NPC tokens carry their stats.** AC / HP / size / colour come from the
  stat block; a `TokenStatblock` (abilities, save profs, initiative mod, actions,
  traits) rides on the token. The token inspector shows the stat block with a
  target picker and per-action attack / damage / roll buttons (DM and the token's
  controller only). `initRollAll` uses the stat block's initiative modifier.
- **`docs/bestiary-srd-starter.json`** — 8 SRD 5.1 creatures (Goblin, Orc, Wolf,
  Giant Rat, Skeleton, Zombie, Bandit, Guard; CC-BY-4.0, attributed) to import.
- Shared: `tokenStatblockFrom`, `statblockInitiativeMod`, `tokenSaveBonus`.

### Changed

- Room schema **v5**; v2–v4 rooms migrate in place.
- **The bestiary is persisted to its own file** (`BESTIARY_FILE`, default
  `server/data/bestiary.json`) — **point it at a OneDrive folder to sync your
  library across sessions and machines.** It is never written into `room.json`.

## [0.5.2] - 2026-09-08

### Changed

- **Shorter character sheet.** The ability strip is compact by default — a single
  6-wide row of just the ability score and a **save-proficiency checkbox** next to
  each stat. A **▾ roll & save** toggle reveals the modifier and the check / save
  roll buttons. (Save proficiency was previously a hidden right-click.)

## [0.5.1] - 2026-09-08

### Added

- Settings reads back what a dddice API key can actually use: a **theme
  dropdown** (from the key's `dice-box`) and a **"Room có sẵn"** dropdown (from
  the key's rooms), so a free/guest key works without guessing slugs.
- `createRoom` now reports the `402` from free accounts with a clear message
  (create the room on dddice.com and paste the slug, or pick an existing one)
  instead of a raw error.

### Notes

- Verified end-to-end with a real guest key: 3D dice render on the battle map
  and results feed the shared log. Free/guest keys **cannot** create rooms via
  the API and **cannot** use the `dddice-standard` theme — hence the pickers.

## [0.5.0] - 2026-09-08

### Changed

- **New screen layout.** The three top tabs are gone. The battle map is the
  permanent main area; the character sheet lives in a **resizable horizontal dock
  below it** (drag the top edge; height persists) so a player manages their
  character without leaving the map. The dock can be toggled from the top bar.
- **dddice roll history + manual rolling** moved into a small floating window at
  the **bottom-left of the map**, collapsible to a 🎲 button. Private (DM) rolls
  are now hidden from players in that window.
- **Initiative** is a thin collapsible strip pinned to the top of the map (order,
  round, ◀/▶ turn controls; expand for roll-all / add / reset).
- The DM map controls collapsed into a small **⚙ Bản đồ** popover.

### Added

- **Sectioned character sheet** in the dock: **Cơ bản** (abilities + saves +
  skills, AC/HP/speed/initiative, class resources, spell slots, and the
  action / bonus action / reaction economy with a target picker), **Trang bị**
  (inventory + currency), **Đặc điểm** (feats), **Năng lực** (class/racial
  features with limited-use trackers).
- **Class resources & spell slots**: pip trackers (Ki, Rage, Bardic Inspiration,
  spell slots by level…), each with a recharge type. **Nghỉ ngắn / Nghỉ dài**
  buttons restore the right resources / HP / slots (`applyShortRest` /
  `applyLongRest`).
- **Action economy**: `SheetAction` (attack / utility roll / save / note),
  grouped by `actionType`. Equipped-weapon attacks appear as derived actions.
  Each attack action drives the same target flow as the map (to-hit vs AC →
  damage → HP).
- Shared: `derivedActions`, `allActions`, `applyShortRest`, `applyLongRest`
  (replacing `derivedAttacks` / `allAttacks`).

### Migration

- Room schema **v4**. v2/v3 rooms migrate in place: each sheet's `attacks[]`
  becomes `actions[]` (`actionType: 'action'`), and `resources`, `spellSlots`,
  `feats`, `features` are initialised.

## [0.4.0] - 2026-09-08

### Added

- **Role-based permissions.** The first person to join a room (its creator)
  becomes the **DM**; everyone after joins as a **player**. The client can no
  longer self-assign a role — the server decides, and always keeps at least one
  DM. Players see and edit only the character sheets they created; the DM sees
  all. A new **Người trong phòng** panel in Settings lets the DM promote/demote
  participants (`setRole` action).
- **Attack a target straight from the character sheet.** The Chiến đấu section
  has a **Mục tiêu** picker. With a target chosen, each attack shows **⚔ đánh
  <target>** (full flow: to-hit vs AC → damage on hit → HP) and **sát thương**
  (roll the damage formula and subtract it from the target's HP). New `damage`
  action; damage-to-target is shown in the roll log as “→ <target>: −N HP”.
- **Live dice-formula understanding.** `normalizeNotation` (trims, drops spaces,
  fixes `d20`→`1d20`, `–`→`-`), `parseTerms` (structured parse, Vietnamese
  errors), `rollStats` (exact min/max, average — advantage/disadvantage
  computed exactly), and `describeNotation`. A `FormulaHint` under damage fields
  shows e.g. `2d6+8 · 10–20 (tb 15)` or flags an invalid formula as you type.
  So a player who writes “2d6 + 8” for a greatsword gets exactly `2d6+8` rolled
  on dddice and subtracted from the target. Convention: **xdy** = x dice of y
  faces. 15 more shared tests.

### Changed

- `rollNotation` now normalises input and shares one parser with `rollStats`.
- Protocol v3: `join.role` is an ignored hint; new `setRole` and `damage`
  actions; `RollLogEntry.damage?` added (additive, no room-schema bump).
- Join screen drops the role dropdown.

## [0.3.0] - 2026-09-08

### Added

- **D&D-Beyond-style character sheet management.** The sheet editor is now split
  into **Chỉ số** (abilities, saves, skills), **Chiến đấu** (AC, HP, speed,
  initiative, attacks, token link, notes) and **Túi đồ** (inventory) sections.
- **Inventory & currency.** Each sheet holds an item list (weapon / armor /
  shield / gear) with quantity, weight, an equipped toggle and notes, plus a
  pp/gp/ep/sp/cp purse with a live gold-value total and a carried-weight vs
  STR×15 capacity bar.
- **Auto AC from equipped armor.** Effective AC is computed: explicit override →
  equipped armor base + DEX (capped by armor category) + shield → unarmored
  `10 + DEX`. Shown as a badge with its source; a manual override field remains
  for cases like Unarmored Defense.
- **Auto attacks from equipped weapons.** Equipped weapons generate attack
  entries — to-hit = ability mod (STR / DEX / finesse-better-of) + proficiency +
  magic bonus, damage = base dice + ability/magic mod — listed alongside manual
  attacks, each with 3D/2D roll buttons.
- Shared helpers `computeArmorClass`, `derivedAttacks`, `allAttacks`,
  `carriedWeight`, `carryCapacity`, `currencyInGp`, `emptyCurrency`, with tests.

### Changed

- Room schema bumped to **v3**; `RoomState` from v2 is migrated in place
  (character sheets gain `inventory`, `currency`, `acOverride`). Sheets are
  normalised on load and on every `upsertSheet`.

## [0.2.0] - 2026-09-08

### Added

- **dddice 3D dice integration.** When enabled for the room, every roll — quick
  dice, the notation box, d20 checks, character-sheet checks/saves/skills/
  initiative/attacks, and the battle-map attack flow — is rolled through the
  [dddice](https://dddice.com) engine and animates as 3D dice on a transparent
  overlay above the battle map for every connected client.
  - dddice results are authoritative for the numbers; the server still resolves
    hit / crit / fumble against its own AC copy and applies HP damage, and still
    doubles damage dice on a crit.
  - Per-client API keys held only in `localStorage` (never sent to our server or
    stored in room state); a shared dddice room slug is kept in room state so
    everyone sees the same roll. A one-click **guest key** button covers players
    without a dddice account.
  - New Settings modal (gear icon) to enable dddice, paste/generate a key, create
    or set the room slug, and choose a dice theme.
  - `dddice-js` is loaded lazily, so the base bundle is unchanged (~174 kB) and
    three.js only downloads when 3D dice are switched on.
- Shared helpers `doubleDiceCounts` and `externalRollResult`, with tests.

### Changed

- Wire protocol bumped to **v2**: `roll` and `attack` actions carry an optional
  `external` payload of pre-rolled values; new `updateDddice` action. Room schema
  bumped to **v2** (`RoomState.dddice`); older `room.json` files start fresh.

## [0.1.0] - 2026-09-08

First working slice: a LAN-synced D&D 5e (2024) tabletop on one page.

### Added

- **Shared rules package** (`@dnd-table/shared`): dice-notation parser/roller
  (`NdM`, chained terms, flat modifiers, `d%`, `kh`/`kl`), advantage/
  disadvantage helper, natural-20/1 detection, attack resolution vs. AC, crit
  dice-doubling, and 5e helpers (ability/save/skill/initiative bonuses,
  proficiency-by-level). Vitest coverage for the dice engine.
- **Authoritative WebSocket server** (`express` + `ws`): single `RoomState`,
  action reducer with DM / ownership permission checks, debounced JSON
  persistence with schema-version guard, participant lifecycle and pruning,
  optional static serving of the built client.
- **React client** (Vite + Zustand): join screen with remembered identity and
  auto-reconnect; shared dice panel with quick dice, notation input, adv/dis
  d20 check, private DM rolls, and a live roll log; battle map with configurable
  grid, background image, drag-to-move tokens (grid snap), hidden tokens, HP
  bars, a token inspector, and an on-map dice tray; initiative tracker with
  roll-all, round counter, and turn advancement; 5e 2024 character sheets with
  live-derived modifiers and one-click rolls for checks, saves, skills,
  initiative, and attacks.
- **Docs**: software requirements specification (`docs/SRS.md`), `README.md`,
  and the `dndcoder` build/version-management agent.

[Unreleased]: https://github.com/lamvukms-code/dnd-table/compare/v0.52.0...HEAD
[0.52.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.51.0...v0.52.0
[0.51.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.50.0...v0.51.0
[0.50.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.49.0...v0.50.0
[0.49.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.48.0...v0.49.0
[0.48.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.47.1...v0.48.0
[0.47.1]: https://github.com/lamvukms-code/dnd-table/compare/v0.47.0...v0.47.1
[0.47.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.46.0...v0.47.0
[0.46.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.45.0...v0.46.0
[0.45.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.44.0...v0.45.0
[0.44.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.43.0...v0.44.0
[0.43.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.42.0...v0.43.0
[0.42.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.41.0...v0.42.0
[0.41.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.40.0...v0.41.0
[0.40.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.39.0...v0.40.0
[0.39.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.38.0...v0.39.0
[0.38.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.37.0...v0.38.0
[0.37.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.36.0...v0.37.0
[0.36.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.35.0...v0.36.0
[0.35.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.34.0...v0.35.0
[0.34.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.33.0...v0.34.0
[0.33.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.32.0...v0.33.0
[0.32.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.31.0...v0.32.0
[0.31.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.30.0...v0.31.0
[0.30.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.29.0...v0.30.0
[0.29.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.28.0...v0.29.0
[0.28.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.27.0...v0.28.0
[0.27.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.26.0...v0.27.0
[0.26.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.25.0...v0.26.0
[0.25.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.24.0...v0.25.0
[0.24.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.23.0...v0.24.0
[0.23.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.22.0...v0.23.0
[0.22.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.19.0...v0.20.0
[0.19.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/lamvukms-code/dnd-table/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/lamvukms-code/dnd-table/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/lamvukms-code/dnd-table/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/lamvukms-code/dnd-table/releases/tag/v0.1.0
