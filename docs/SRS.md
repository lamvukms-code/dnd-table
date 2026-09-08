# Software Requirements Specification — dnd-table

- **Version:** 0.6.0
- **Status:** Living document
- **Last updated:** 2026-09-08
- **Owner:** lamvukms (personal project)

---

## 1. Introduction

### 1.1 Purpose

`dnd-table` is a self-hosted web application for playing **Dungeons & Dragons 5e
(2024 rules)** online with a small, private group. One machine runs a server on
the local network; players open the site in a browser on their own devices and
share a single game session in real time.

It is **not** a public product. There are no accounts, no payment, no
multi-tenant support, and no requirement to work outside a trusted LAN.

### 1.2 Scope

The application provides, on one page:

- A shared **dice roller** with D&D dice notation, advantage/disadvantage, and a
  synchronized roll log.
- A **battle map** with a grid, an optional background image, and draggable
  tokens carrying HP / AC / size.
- **Virtual dice on the battle map** — every roll surfaces briefly as dice on the
  map (comparable to the dddice overlay in Owlbear Rodeo).
- **Automatic attack resolution** — roll d20 + modifiers, compare to a target
  token's AC, and report hit / miss / critical automatically, then roll (and, on
  a crit, double) damage dice — in the spirit of D&D Beyond.
- An **initiative tracker** with round counter and turn advancement.
- **Character sheets** for the 5e 2024 core: abilities, proficiency, skills,
  saves, AC, HP, attacks — with one-click rolls that post to the shared log.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| Room | The single shared game session held by the server. |
| Participant | A connected user, either **DM** or **player**. |
| Token | A piece on the battle map. |
| Sheet | A character sheet, owned by one participant. |
| Roll log | The append-only, capped list of dice results shared with everyone. |
| Dice tray | The transient set of dice shown on the battle map after recent rolls. |

### 1.4 References

- D&D 5e (2024) Player's Handbook — rules reference (user-owned; not bundled).
- Keep a Changelog 1.1.0; Semantic Versioning 2.0.0.

---

## 2. Overall description

### 2.1 Architecture

```
 client (React + Vite + Zustand)  ──WebSocket (/ws)──►  server (Node + ws + express)
        presentational UI                                   authoritative RoomState
        mirrors RoomState                                   room.ts reducer
        dispatches ClientAction                             persists room.json
                    ▲                                              │
                    └───────── full-state ServerEvent ◄────────────┘
        shared/ (@dnd-table/shared): dice, rules, types, protocol — pure TS, used by both
```

- **Authoritative server.** All game state lives in one `RoomState` on the
  server. Clients send intents (`ClientAction`); the server validates, applies,
  and broadcasts a new snapshot. Clients render from snapshots.
- **Full-state sync.** For a group this size the whole room is broadcast on every
  change. `rev` increments per mutation. Delta sync is a future optimization.
- **Persistence.** `RoomState` is written to `server/data/room.json` (debounced
  ~1 s and on SIGINT). On restart it reloads; a schema-version mismatch starts
  fresh.
- **No build for the server.** It runs under `tsx`. The client builds to static
  files that the same server can serve in production.

### 2.2 User roles

| Role | Can |
|---|---|
| **DM** | Everything: edit the map, add/remove/hide tokens, move any token, run initiative, roll privately, clear the log, view and edit every sheet, change participant roles. |
| **Player** | Roll dice, deal damage to a target, move tokens they control, create/view/edit **only their own** sheets, run attacks, view non-hidden tokens. |

The server assigns the role (room creator → DM; see FR-1a). Ownership and
DM-only checks are enforced server-side in `room.ts`, never only in the UI.

### 2.3 Constraints

- Modern evergreen browser with WebSocket and pointer events.
- Server: Node.js ≥ 20 (developed on 24).
- Client UI language: **Vietnamese**. Code/docs: English.
- No external network calls at runtime. No third-party analytics.
- No bundled copyrighted game text.

### 2.4 Assumptions

- All participants are on the same LAN or trusted VPN.
- One room per server process. Running multiple games means multiple processes
  on different ports.
- Background map images are supplied by the user as URLs they trust.

---

## 3. Functional requirements

IDs are stable. **P0** = required for 0.1.0, **P1** = planned, **P2** = maybe.

### 3.1 Session & participants

- **FR-1 (P0):** A user joins by entering a display name only. Identity is
  remembered in `localStorage`; a returning user rejoins the same participant via
  a stored id.
- **FR-1a (P0):** **The server assigns roles.** The first participant to join a
  room with no DM becomes the **DM** (the room creator); everyone else joins as a
  **player**. The client's role hint is ignored, so a player cannot self-promote.
  A room always keeps at least one DM (covers migrated rooms / all DMs pruned).
- **FR-1b (P0):** The DM can promote/demote any participant from the Settings
  "Người trong phòng" panel (`setRole`); demoting the last DM is refused.
- **FR-2 (P0):** The participant list shows who is connected and their role.
  Disconnected participants are marked and pruned after a TTL (role persists
  while they exist).
- **FR-3 (P0):** The client auto-reconnects on WebSocket drop and re-syncs; a
  reconnecting participant keeps the role the server gave them.
- **FR-4 (P1):** A participant can change their display name after joining.

### 3.1a Screen layout (0.5.0)

- **FR-5 (P0):** One screen, no top-level tabs. The **battle map is the permanent
  main area**. The **character sheet is docked as a horizontal panel below it**
  (default ≈ 1/4 of the stage height), resizable by dragging its top edge (height
  persists in `localStorage`) and hideable from the top bar. A player manages
  their character without leaving the map.
- **FR-6 (P0):** The **dice window** — manual rolling + shared roll history — is a
  small floating panel at the bottom-left of the map, collapsible to a 🎲 button.
  Private (DM) rolls are not shown to players there.
- **FR-7 (P0):** The **initiative strip** is pinned to the top of the map: a thin
  always-visible bar (order, round, ◀/▶ turn) that expands for the DM's
  roll-all / add / reset controls.
- **FR-8 (P0):** The dddice 3D canvas overlays the whole map area (FR-32);
  pointer events pass through it to the map and the floating panels.

### 3.2 Dice roller

- **FR-10 (P0):** Parse and evaluate dice notation — **convention `xdy`** = x
  dice of y faces: `xdy`, `+`/`-` chains, multiple dice terms, flat modifiers,
  `d%`, `khX` / `klX` (keep highest/lowest). Reject malformed input with a clear
  Vietnamese message.
- **FR-10a (P0):** Player input is normalised before parsing — whitespace
  removed (`"2d6 + 8"` → `"2d6+8"`), lowercased, an implied leading 1 filled in
  (`"d20"` → `"1d20"`), en/em dashes treated as minus. The same normalisation is
  applied on the dddice path.
- **FR-10b (P0):** `describeNotation` gives live feedback while a player types a
  formula — canonical form, exact min/max, and average (advantage/disadvantage
  averages computed exactly) — surfaced by a `FormulaHint` next to damage fields.
  Structural parsing (`parseTerms` / `rollStats`) never rolls.
- **FR-11 (P0):** Quick-roll buttons for d20, d12, d10, d8, d6, d4, d100.
- **FR-12 (P0):** d20 check helper with Normal / Advantage / Disadvantage
  (advantage = `2d20kh1`, disadvantage = `2d20kl1`).
- **FR-13 (P0):** Detect natural 20 / natural 1 on a lone d20 roll and flag
  critical / fumble.
- **FR-14 (P0):** Every roll produces a `RollLogEntry` broadcast to all clients:
  actor, label, per-die values (kept vs dropped shown), total, timestamp.
- **FR-15 (P0):** The roll log is newest-first in the UI, capped server-side
  (200). The DM can clear it.
- **FR-16 (P0):** The DM can mark a roll **private** (visible only to the DM).
  Players cannot make private rolls.
- **FR-17 (P1):** Re-roll / roll-again on a log entry.

### 3.3 Battle map & tokens

- **FR-20 (P0):** A grid map with configurable columns, rows, and grid
  visibility. DM-editable.
- **FR-21 (P0):** An optional background image by URL, sized to cover the grid.
- **FR-22 (P0):** **Anyone** can add a token (a "+ Token" button on the map).
  Each token has a label, grid position, size (tiny–gargantuan), colour, optional
  image URL, optional current / max HP, optional AC, a hidden flag, an optional
  `controllerId`, and an optional embedded `statblock` (NPCs). A player's added
  token gets them as `controllerId` and cannot be hidden; only the DM adds hidden
  tokens or toggles `hidden`.
- **FR-23 (P0):** Tokens are moved by dragging; on release the position snaps to
  the grid. The DM moves any token; a player moves only tokens where
  `controllerId` is theirs.
- **FR-23a (P0):** The DM removes any token; a player removes only tokens they
  control.
- **FR-24 (P0):** Hidden tokens are invisible to players and shown dimmed to the
  DM.
- **FR-25 (P0):** A token inspector lets the authorised user edit HP / AC / size
  / colour / label; the DM can toggle hidden. When the token has a `statblock`,
  the DM (and its controller) also see the stat block — traits and an action
  list with a target picker and per-action attack / damage / roll buttons.
- **FR-26 (P0):** A token with current+max HP shows a small HP bar.
- **FR-27 (P1):** Upload a background or token image as a file (stored as a data
  URL or on the server) instead of a URL.
- **FR-28 (P2):** Fog of war / measurement tools / drawing.

### 3.4 Virtual dice on the map

- **FR-30 (P0):** After any roll, a **dice tray** entry appears on the battle map
  showing the individual die faces and the total, labelled with the roller. This
  is the always-on fallback and works with no external service.
- **FR-31 (P0):** The tray is capped (most recent ~6 shown, 12 kept) and shared
  across all clients.
- **FR-32 (P0):** **dddice 3D dice integration.** When `RoomState.dddice.enabled`
  and the local client has an API key and the room has a `roomSlug`:
  - A transparent `<canvas>` overlays the battle-map viewport running the
    `dddice-js` engine (`ThreeDDice`), connected to the shared dddice room.
  - Every roll path in the app (FR-11/12/14, FR-40, FR-63) is routed through
    `dddice.roll(parseRollEquation(notation, theme))` instead of the server RNG.
    All connected clients see the same 3D roll via the dddice websocket.
  - The initiating client reads back `total_value` / `values` and forwards them to
    our server as an `external` payload; the server records them in the shared
    roll log and drives game logic (FR-13, FR-41–43) from those values without
    re-rolling.
  - **Auth:** each participant stores their own dddice API key in `localStorage`;
    it is never sent to our server or placed in `RoomState`. A guest key can be
    minted in-app (`api.user.guest()`) for players without an account. The DM
    sets the shared `roomSlug` (or creates one via `api.room.create()`), stored
    in `RoomState`.
  - `dddice-js` (and three.js) is lazy-loaded only when the feature is on.
  - Degradation: any dddice error falls back to a server roll for that action and
    surfaces a toast; the app is fully usable with dddice off.
- **FR-33 (P1):** Per-character default dice theme, stored on the sheet.
- **FR-34 (P2):** Show whose turn it is by auto-selecting their dice theme colour.

### 3.5 Automatic attack resolution

- **FR-40 (P0):** From the token inspector, an authorised user launches an attack
  against the selected target token: choose an optional source token, an attack
  bonus, and a damage notation.
- **FR-41 (P0):** The server rolls `1d20 + bonus`, compares to the target token's
  AC (default 10 if unset), and determines the outcome per 5e 2024:
  - natural 20 → automatic hit **and** critical;
  - natural 1 → automatic miss;
  - otherwise hit iff total ≥ AC.
- **FR-42 (P0):** On a hit, the server rolls the damage notation; on a critical
  it doubles the **dice counts** (not flat modifiers) before rolling.
- **FR-43 (P0):** On a hit against a token with current HP, the server subtracts
  the damage total (floored at 0).
- **FR-44 (P0):** Attack and damage results are written to the roll log with the
  target name, target AC, and hit/crit/miss verdict; the map shows the dice
  (dddice 3D when enabled, else the 2D tray).
- **FR-47 (P0):** When dddice is enabled the attack flow orchestrates on the
  client — roll the d20 in 3D, determine hit vs the known AC, then roll (doubled
  on a crit) damage in 3D — and sends both resolved rolls to the server, which
  re-checks the verdict against its authoritative AC and applies HP.
- **FR-45 (P1):** Saving-throw workflow (DC vs. d20 + save bonus) with
  half-damage-on-success.
- **FR-46 (P0):** **Attack from the character sheet.** The Chiến đấu section has a
  target picker. With a target selected, each attack offers a full-resolution
  button (to-hit vs AC → damage on hit → HP, via `attackRoll`) and a
  damage-only button that rolls the attack's damage formula and subtracts the
  result from the target token's HP (`damage` action). Anyone may deal damage to
  a token; the server clamps the subtraction to the token's remaining HP and logs
  it as `RollLogEntry.damage`.

### 3.6 Initiative tracker

- **FR-50 (P0):** DM adds entries manually (name + initiative value) or rolls
  initiative for every token at once (`1d20 + DEX mod + misc` where a linked
  sheet exists, else `1d20`).
- **FR-51 (P0):** Entries are ordered by initiative descending; the DM can edit
  values and remove entries.
- **FR-52 (P0):** DM controls: start, next turn, previous turn, reset. Next past
  the last entry increments the round and clears "has gone" flags.
- **FR-53 (P0):** The active entry is highlighted for all participants; the
  header shows the round number.
- **FR-54 (P1):** Tie-breaking by DEX; drag-to-reorder.
- **FR-55 (P1):** Condition / status tags with a duration counter per entry.

### 3.7 Character sheets

- **FR-60 (P0):** A participant creates one or more sheets. A player sees and
  edits only their own; the DM sees and edits all.
- **FR-61 (P0):** Fields: name, class, level, proficiency bonus (auto-suggested
  from level, editable), six ability scores, save proficiencies, skill
  proficiency and expertise, AC (`armorClass` fallback + `acOverride`),
  current/max/temp HP, speed, initiative misc bonus, `actions`, `resources`,
  `spellSlots`, `feats`, `features`, inventory, currency, notes, token link.
- **FR-61a (P0):** The dock sheet has four sub-tabs:
  - **Cơ bản** — identity, a compact ability strip (score + a save-proficiency
    checkbox per stat; a **▾ roll & save** toggle reveals the modifier and the
    check / save roll buttons), skills, the combat block (AC badge + override,
    HP/temp, speed, initiative), **class resources** and **spell slots**,
    **Nghỉ ngắn / Nghỉ dài**, and the **action economy** (Action / Bonus /
    Reaction groups) with a target picker.
  - **Trang bị** — inventory + currency (3.7.1).
  - **Đặc điểm** — `feats` (name + description).
  - **Năng lực** — `features` (name, source, description, optional limited-use
    tracker).
- **FR-61b (P0):** **Class resources** (`ClassResource`) and **spell slots**
  (`SpellSlots` per level) are pip trackers with a `recharge` type
  (`short`/`long`/`other`). **Short rest** resets `short` resources / feature
  uses; **long rest** resets HP to max, temp HP, all slots, and every
  `short`/`long` resource and feature use (`applyShortRest` / `applyLongRest`,
  pure helpers).
- **FR-62 (P0):** Derived values are computed live: ability modifiers, save
  bonuses, skill bonuses (expertise = 2× proficiency), initiative bonus,
  effective AC, equipped-weapon actions, carried weight.
- **FR-63 (P0):** One-click roll buttons for each ability check, each save, each
  skill, initiative, each action's roll(s) — all posting to the shared log
  labelled with the character name, and through dddice when enabled.
- **FR-63h (P0):** An **action** (`SheetAction`) is an attack (`attackBonus` +
  `damage`), a utility roll (`notation`), a save-forcer (`save`), or a note
  (`description` only), tagged `actionType` (action/bonus/reaction/free/other).
  Equipped weapons appear as derived `action` entries. Attack actions drive the
  same target flow as the map (to-hit vs AC → damage → HP).
- **FR-64 (P0):** A sheet can be linked to a map token (`tokenId`) so initiative
  rolls and, later, attacks can use its stats.

#### 3.7.1 Inventory, currency & derived combat

- **FR-63a (P0):** Each sheet has an `inventory` of `InventoryItem`s of type
  `weapon | armor | shield | gear`, each with name, quantity, per-unit weight, an
  `equipped` flag and notes, plus type-specific fields.
- **FR-63b (P0):** A `currency` purse of pp/gp/ep/sp/cp with a live total gold
  value, and a carried-weight readout against a STR × 15 lb capacity (coins at
  50/lb), flagged when over.
- **FR-63c (P0):** **Effective AC** = `acOverride` if set, else equipped armor
  `armorBase` + DEX (light: full, medium: max +2, heavy: none) + equipped shield
  bonus, else `10 + DEX` (+ shield). The computed value and its source are shown;
  the override covers Unarmored Defense and other special cases.
- **FR-63d (P0):** Each **equipped weapon** contributes a derived attack:
  to-hit = ability mod (STR, DEX, or the better of the two for *finesse*) +
  proficiency bonus (if `proficient`) + `attackBonusMisc`; damage = base dice +
  ability mod + `damageBonusMisc`. Derived attacks are listed with manual ones
  and are read-only (edit the item instead).
- **FR-63e (P1):** Attunement slots; item rarity; container grouping.
- **FR-63f (P1):** The map attack flow (FR-40) can pick a linked sheet's attack.
- **FR-63g (P2):** A starting-equipment / weapon presets picker.
- **FR-65 (P0):** Edits sync to all clients; a client mid-edit is not clobbered
  by an incoming snapshot.
- **FR-66 (P1):** Spell slots and a spell list.
- **FR-67 (P1):** Sync sheet HP ↔ linked token HP automatically; equipped-armor
  AC → linked token AC.
- **FR-68 (P2):** Import/export a sheet as JSON; import from a common format.
- **FR-69 (P1):** Species / background / alignment, personality (traits, ideals,
  bonds, flaws), appearance, backstory, features & traits, languages, hit dice,
  death saves, short/long rest.

### 3.8 Persistence

- **FR-70 (P0):** Room state survives a server restart via `room.json`.
- **FR-71 (P0):** Incompatible schema versions start a fresh room rather than
  crashing; migratable ones (v2+) upgrade in place.
- **FR-72 (P1):** Named save slots / manual snapshots the DM can restore.
- **FR-73 (P2):** Export the whole room as a downloadable file.

### 3.9 Bestiary (NPC / monster stat blocks)

- **FR-80 (P0):** The DM maintains a library of `Statblock`s (name, meta, CR,
  size, AC, HP + optional `hpFormula`, speed, abilities, `proficiencyBonus`,
  `saveProficiencies`, `skills`, `traits`, `actions`, colour, image, tags,
  notes). Search by name / meta / tag; edit inline. DM-only.
- **FR-81 (P0):** **Spawn** a stat block onto the map: creates a token with the
  stat block's AC / HP (optionally rolled from `hpFormula`) / size / colour /
  image and an embedded `TokenStatblock` (abilities, save profs, initiative mod,
  actions, traits). Optionally spawn hidden.
- **FR-82 (P0):** The token inspector renders the embedded stat block for the DM
  and the token's controller — actions become attack / damage / roll buttons
  with a target picker (same resolution as FR-40/46). `initRollAll` uses the
  stat block's initiative modifier for un-linked NPC tokens.
- **FR-83 (P0):** Import / export the bestiary as a JSON array (merged by `id` on
  import). A `docs/bestiary-srd-starter.json` (SRD 5.1, CC-BY-4.0) ships for the
  DM to import — nothing is auto-loaded.
- **FR-84 (P0):** The bestiary is **persisted to its own file**
  (`BESTIARY_FILE`, default `server/data/bestiary.json`) so it is
  session/room-independent and can be pointed at a synced folder (OneDrive). It
  is broadcast in `RoomState` for simplicity but only the DM sees the panel; it
  is never written into `room.json`.
- **FR-85 (P1):** Multi-select spawn; spawn N copies; drag-from-panel placement.
- **FR-86 (P2):** A read-only shared bestiary players can browse (known monsters).

---

## 4. Non-functional requirements

- **NFR-1 Performance:** State broadcast and re-render within ~100 ms on a LAN
  for a room with < 10 participants, < 100 tokens, < 200 log entries.
- **NFR-2 Reliability:** A client crash or reload never corrupts server state.
  The server debounces disk writes and flushes on exit.
- **NFR-3 Usability:** Playable on a laptop screen; the DM view works on a
  tablet. Vietnamese throughout the UI, patient wording for non-technical users.
- **NFR-4 Portability:** `npm install && npm run dev` on Windows, macOS, or
  Linux with Node ≥ 20. No native modules.
- **NFR-5 Security/Privacy:** No auth by design; MUST only be exposed on a
  trusted network. No outbound network calls. No secrets in the repo.
- **NFR-6 Maintainability:** All rules logic is pure and unit-tested in
  `shared/`. `npm run typecheck` and `npm run test` pass on every commit.
- **NFR-7 Testability:** The dice/rules layer has Vitest coverage; the protocol
  is a single typed union so client and server cannot drift.

---

## 5. Data model (summary)

See `shared/src/types.ts` for the authoritative definitions.

- `RoomState { version, rev, name, participants[], map, tokens[], initiative,
  sheets[], rollLog[], diceTray, dddice, bestiary: Statblock[] }` — `bestiary`
  is broadcast but persisted separately (FR-84), not in `room.json`.
- `DddiceConfig { enabled, roomSlug?, theme? }` — **no API keys**; keys are
  per-client in `localStorage` only.
- `ExternalRoll { total, faces[], d20Natural?, source, rollUuid? }` — values
  rolled outside the server (dddice) that ride along a `roll` / `attack` action.
- `Participant { id, name, role, color, connected, lastSeen }`
- `BattleMap { name, backgroundUrl?, gridSize, cols, rows, showGrid }`
- `Token { id, label, x, y, size, color, imageUrl?, currentHp?, maxHp?,
  armorClass?, hidden, controllerId?, statblock?: TokenStatblock }`
- `Statblock { id, name, meta, cr, size, ac, acNote?, maxHp, hpFormula?, speed,
  speedNote?, abilities, proficiencyBonus, saveProficiencies[], skills[], senses?,
  languages?, traits[], actions[], color, imageUrl?, tags[], notes, source? }`
- `TokenStatblock { name, meta?, abilities, proficiencyBonus, saveProficiencies[],
  initiativeMod, actions[], traits[], notes?, fromId? }` — the combat-relevant
  subset copied onto a spawned token.
- `Initiative { entries[], round, turnIndex, running }`
- `InitiativeEntry { id, name, initiative, tokenId?, isActive, hasGone }`
- `CharacterSheet { id, ownerId, name, className, level, proficiencyBonus,
  abilities, saveProficiencies[], skillProficiencies[], skillExpertise[], maxHp,
  currentHp, tempHp, armorClass, acOverride?, speed, initiativeMisc, actions[],
  resources[], spellSlots[], feats[], features[], inventory[], currency, notes,
  tokenId? }`
- `SheetAction { id, name, actionType: action|bonus|reaction|free|other,
  attackBonus?, damage?, damageType?, save?: {ability, dc}, notation?,
  description?, source? }` — `source: 'weapon'` = derived, read-only.
- `ClassResource { id, name, max, used, recharge: short|long|other }`
- `SpellSlots { level, max, used }`
- `Feat { id, name, description }`
- `Feature { id, name, source, description, uses?: { max, used, recharge } }`
- `InventoryItem { id, name, type: weapon|armor|shield|gear, quantity, weight,
  equipped, notes, weaponAbility?, damage?, damageType?, proficient?,
  attackBonusMisc?, damageBonusMisc?, armorBase?, armorCategory?,
  stealthDisadvantage? }`
- `Currency { pp, gp, ep, sp, cp }`
- `RollLogEntry { id, ts, actorId, actorName, label, result, attack?, damage?,
  private? }` — `damage: { targetTokenId?, targetName, amount }` records HP removed.
- Notation helpers in `shared/src/dice.ts`: `normalizeNotation`, `parseTerms`,
  `rollStats`, `describeNotation` (+ `NotationInfo`, `ParsedTerm`).

Wire protocol: `ClientAction` (client→server) and `ServerEvent` (server→client)
unions in `shared/src/protocol.ts`. `PROTOCOL_VERSION` guards compatibility.

---

## 6. Out of scope (0.1.0)

Public hosting, user accounts, multiple concurrent rooms, voice/video, a
compendium of monsters/spells/items, automated rules enforcement beyond attack
resolution, mobile-first layout, offline mode, hosting our own 3D dice physics
(dddice covers this), and any distribution of copyrighted content.

---

## 7. Open questions / decisions log

| Date | Question | Decision |
|---|---|---|
| 2026-09-08 | Ruleset | D&D 5e **2024**. Crit doubles dice only; nat 20 always hits+crits; nat 1 always misses. |
| 2026-09-08 | Sync strategy | Full-state broadcast for now; revisit if rooms grow. |
| 2026-09-08 | Auth | None. LAN-trust model, documented as a hard constraint. |
| 2026-09-08 | 3D dice | Deferred in 0.1.0 (2D tray). **0.2.0:** integrate dddice (`dddice-js`) as an optional 3D layer that is authoritative for die values when on. |
| 2026-09-08 | dddice auth | Per-client API keys in `localStorage`, never in `RoomState` or on our server. Shared room slug in `RoomState`. Guest keys minted in-app. |
| 2026-09-08 | dddice vs server RNG | When dddice is enabled it is the source of the numbers; our server still owns all rule outcomes (hit/crit/HP). Server RNG is the fallback. |
| 2026-09-08 | Sheet scope (0.3.0) | Ship sectioned layout + inventory/currency + auto AC and auto attacks from equipped gear. Spellcasting, description/background, rests and death saves deferred (FR-69). |
| 2026-09-08 | AC computation | Covers light/medium/heavy armor + shield + unarmored. Unarmored Defense and other edge cases handled via the manual `acOverride` field, not special-cased. |
| 2026-09-08 | Schema upgrades | Migrate in place where feasible (v2→v3 backfills sheet fields) instead of discarding `room.json`. |
| 2026-09-08 | Roles | Server-assigned, not self-selected: room creator (first joiner into a DM-less room) is DM, rest are players; DM can re-assign; a room always keeps ≥1 DM. Trusted-LAN model still holds — this is convenience + accident-prevention, not a security boundary. |
| 2026-09-08 | Sheet ownership | Players view/edit only sheets they created (server-enforced in `upsertSheet` / `removeSheet`); DM sees and edits all. |
| 2026-09-08 | Formula convention | `xdy` = x dice, y faces. Player input is normalised (spaces, case, implied 1, dashes) so "2d6 + 8" works. `describeNotation` gives typed feedback without rolling. |
| 2026-09-08 | Damage from sheet | New `damage` action rolls a formula (dddice or server) and subtracts from a target token's HP, clamped, logged. Any participant may use it; hit/AC logic stays in the `attack` action. |
| 2026-09-08 | Layout (0.5.0) | No top-level tabs. Battle map is the permanent stage; character sheet is a resizable dock beneath it; dice history/manual-roll is a floating bottom-left window; initiative is a top strip. Goal: manage a character without switching away from the map. |
| 2026-09-08 | Sheet model | `attacks[]` generalised to `actions[]` (`SheetAction` with `actionType`). Added `resources`, `spellSlots`, `feats`, `features`. Rests are pure helpers. No spell *list* / compendium yet (FR-66). |
| 2026-09-08 | Private rolls | Now filtered from players in the dice window (client-side). Full state is still broadcast — consistent with the trusted-LAN model; a server-side per-client filter is deferred. |
| 2026-09-08 | Add token | Opened to everyone (was DM-only). Player tokens get `controllerId` = the player and can't be hidden. Removal: DM or controller. |
| 2026-09-08 | Bestiary storage | Its own file (`BESTIARY_FILE`) so it is room/session-independent and OneDrive-syncable; broadcast in `RoomState` (DM-only UI) rather than a new event stream, matching the private-rolls trade-off. Excluded from `room.json`. |
| 2026-09-08 | NPC stats | Embedded on the token as `TokenStatblock` (denormalised at spawn) rather than a hidden character sheet — no sheet-list clutter, and the map inspector is the single place NPC combat happens. |
| 2026-09-08 | Bundled content | `docs/bestiary-srd-starter.json` uses SRD 5.1 under CC-BY-4.0 with attribution; it is import-only, never auto-loaded — the bundle itself ships no stat blocks. |
