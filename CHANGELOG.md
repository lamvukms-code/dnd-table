# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/lamvukms-code/dnd-table/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/lamvukms-code/dnd-table/releases/tag/v0.1.0
