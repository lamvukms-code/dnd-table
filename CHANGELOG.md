# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/lamvukms-code/dnd-table/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/lamvukms-code/dnd-table/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/lamvukms-code/dnd-table/releases/tag/v0.1.0
