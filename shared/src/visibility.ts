import type { CharacterSheet, HealthTier, RollLogEntry, Token } from './types.js';
import { emptyCurrency } from './rules.js';

/** Rough condition from real HP: full → hurt (>50%) → bloodied (≤50%) → critical (≤25%) → down. */
export function healthTierOf(current?: number, max?: number): HealthTier | undefined {
  if (typeof current !== 'number' || typeof max !== 'number' || max <= 0) return undefined;
  if (current <= 0) return 'down';
  if (current >= max) return 'full';
  const r = current / max;
  if (r <= 0.25) return 'critical';
  if (r <= 0.5) return 'bloodied';
  return 'hurt';
}

/** An NPC/monster token (has a statblock) nobody controls and the DM has not revealed: players
 *  must not learn its AC, HP, defenses or statblock. PC tokens and player-controlled ones are never hidden. */
export function statsHiddenFromPlayers(t: Token): boolean {
  return !!t.statblock && !t.controllerId && !t.revealStats;
}

/** An NPC/monster token whose statblock (actions, abilities, defenses, type…) players never get —
 *  true even when the DM reveals its AC/HP. Player-controlled NPCs (a pet, a summon) keep theirs. */
export function statblockHiddenFromPlayers(t: Token): boolean {
  return !!t.statblock && !t.controllerId;
}

/** The copy of a token that goes to PLAYERS: DM-hidden tokens vanish entirely, stat-hidden ones lose
 *  every number a player could use to learn AC/HP (and the whole statblock) but keep what the table
 *  can see anyway — position, name, art, conditions — plus a coarse `healthTier`. */
export function tokenForPlayers(t: Token): Token | null {
  if (t.hidden) return null;
  if (!statblockHiddenFromPlayers(t)) return t;
  const sb = t.statblock!;
  // Kept only so "is this an NPC" checks and the movement tracker (speed) keep working client-side.
  const stub: Token['statblock'] = {
    name: t.label,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    proficiencyBonus: 0,
    saveProficiencies: [],
    skills: [],
    initiativeMod: 0,
    speed: sb.speed,
    actions: [],
    traits: [],
  };
  if (t.revealStats) {
    // DM chose to show AC / HP — the numbers stay, the statblock and defenses still do not.
    return { ...t, statblock: stub, defenses: undefined, legendaryActionsRemaining: undefined };
  }
  const {
    currentHp,
    maxHp,
    tempHp: _tempHp,
    armorClass: _armorClass,
    defenses: _defenses,
    legendaryActionsRemaining: _legendary,
    ...rest
  } = t;
  void _tempHp;
  void _armorClass;
  void _defenses;
  void _legendary;
  return { ...rest, healthTier: healthTierOf(currentHp, maxHp), statblock: stub };
}

const sheetStubCache = new WeakMap<CharacterSheet, CharacterSheet>();

/** What a player gets for somebody ELSE's character sheet: just enough for the app to know the sheet
 *  exists and which token it drives (initiative drag-swap, token↔sheet links) — no class, level,
 *  stats, HP, spells, inventory or notes. */
export function sheetStubForPlayers(sheet: CharacterSheet): CharacterSheet {
  let stub = sheetStubCache.get(sheet);
  if (!stub) {
    stub = {
      id: sheet.id,
      ownerId: sheet.ownerId,
      name: sheet.name,
      className: '',
      level: 1,
      proficiencyBonus: 2,
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      saveProficiencies: [],
      skillProficiencies: [],
      skillExpertise: [],
      maxHp: 1,
      currentHp: 1,
      tempHp: 0,
      armorClass: 10,
      acOverride: null,
      speed: sheet.speed,
      initiativeMisc: 0,
      actions: [],
      damageRiders: [],
      resources: [],
      spellSlots: [],
      spells: [],
      feats: [],
      features: [],
      inventory: [],
      currency: emptyCurrency(),
      notes: '',
      tokenId: sheet.tokenId,
      redacted: true,
    };
    sheetStubCache.set(sheet, stub);
  }
  return stub;
}

/** What the stream / recording window may know of a sheet: a stub plus the table-public identity
 *  shown on the speaker cards (species, class, subclass, level). */
export function sheetForStreamCard(sheet: CharacterSheet): CharacterSheet {
  return {
    ...sheetStubForPlayers(sheet),
    className: sheet.className,
    subclass: sheet.subclass,
    classes: sheet.classes,
    level: sheet.level,
    species: sheet.species,
  };
}

/** A player's view of the party's sheets: their own in full, everyone else's as blank stubs; sheets the
 *  DM keeps hidden (an unrevealed NPC / companion) are left out entirely. */
export function sheetsForPlayer(sheets: CharacterSheet[], participantId: string): CharacterSheet[] {
  return sheets
    .filter((s) => s.ownerId === participantId || !s.hiddenFromPlayers)
    .map((s) => (s.ownerId === participantId ? s : sheetStubForPlayers(s)));
}

/** Sheets the stream / recording window may show (hidden ones never). */
export function sheetsForStream(sheets: CharacterSheet[]): CharacterSheet[] {
  return sheets.filter((s) => !s.hiddenFromPlayers).map(sheetForStreamCard);
}

/** Player copy of the roll log: DM-private rolls are dropped; an attack against a stat-hidden (or no-longer-present) target keeps
 *  its hit/miss result but drops `targetAc`. `visibleTargetIds` = tokens whose stats players may see. */
export function rollLogForPlayers(log: RollLogEntry[], visibleTargetIds: Set<string>): RollLogEntry[] {
  return log
    .filter((e) => !e.private) // the DM's secret rolls never leave the server
    .map((e) =>
    e.attack && e.attack.targetAc !== undefined && !(e.attack.targetTokenId && visibleTargetIds.has(e.attack.targetTokenId))
      ? { ...e, attack: { ...e.attack, targetAc: undefined } }
      : e,
  );
}

/** How a tier reads on screen (Vietnamese UI) — short badge glyph + full phrase. */
export const HEALTH_TIER_VI: Record<HealthTier, { icon: string; text: string }> = {
  full: { icon: '', text: 'Nguyên vẹn' },
  hurt: { icon: '🩹', text: 'Bị thương' },
  bloodied: { icon: '🩸', text: 'Bị thương nặng' },
  critical: { icon: '☠', text: 'Nguy kịch' },
  down: { icon: '💀', text: 'Gục ngã' },
};
