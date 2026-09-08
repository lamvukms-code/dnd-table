# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/lamvukms-code/dnd-table/compare/v0.11.0...HEAD
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
