import type { ActiveEffect, CharacterSheet, ClassEntry, SheetAction, Spell, TurnUsed } from './types.js';
import { abilityMod, castingClassesOf, classLevelOf, sheetClasses } from './rules.js';

// ---------------------------------------------------------------------------
// Action economy (Action / Bonus Action / Reaction) + Extra Attack
// ---------------------------------------------------------------------------

export type EconomyKind = 'action' | 'bonus' | 'reaction';

/** Which slice of the action economy an action type spends (free / other actions cost nothing). */
export function economyKindOf(actionType: SheetAction['actionType'] | Spell['actionType'] | undefined): EconomyKind | null {
  if (actionType === 'action' || actionType === undefined) return 'action';
  if (actionType === 'bonus') return 'bonus';
  if (actionType === 'reaction') return 'reaction';
  return null;
}

/** Classes that grant Extra Attack (level → attacks). Several classes do not stack: the best one applies. */
const EXTRA_ATTACK: { classes: string[]; table: [number, number][] }[] = [
  { classes: ['barbarian', 'monk', 'paladin', 'ranger'], table: [[5, 2]] },
  { classes: ['fighter'], table: [[5, 2], [11, 3], [20, 4]] },
];

/**
 * Attacks per Attack action (SRD 5.2.1 multiclassing: Extra Attack from more than one class does not stack — the
 * highest wins; Fighter's Two/Three Extra Attacks replace it).
 */
export function attacksPerAction(sheet: CharacterSheet): number {
  let best = 1;
  for (const c of sheetClasses(sheet)) {
    const name = (c.name ?? '').trim().toLowerCase();
    for (const grp of EXTRA_ATTACK) {
      if (!grp.classes.includes(name)) continue;
      for (const [lvl, n] of grp.table) if (c.level >= lvl && n > best) best = n;
    }
  }
  return best;
}

/**
 * Spend part of a turn's action economy. Returns the new tracker plus what (if anything) was already spent, so the
 * caller can warn. An attack-type action row (`attack: true`) is the Attack action: it spends the Action once and then
 * counts attacks against `attacksPerAction`.
 */
export function spendEconomy(
  used: TurnUsed | undefined,
  kind: EconomyKind,
  opts?: { attack?: boolean; maxAttacks?: number },
): { used: TurnUsed; warning?: string } {
  const cur: TurnUsed = { ...(used ?? {}) };
  let warning: string | undefined;
  if (opts?.attack && kind === 'action') {
    const n = (cur.attacks ?? 0) + 1;
    const max = opts.maxAttacks ?? 1;
    if (cur.action && !cur.attacks) warning = 'Action lượt này đã dùng cho việc khác';
    else if (n > max) warning = `Đã đủ ${max} đòn từ hành động Attack (Extra Attack)`;
    cur.attacks = n;
    cur.action = true;
    return { used: cur, warning };
  }
  if (cur[kind]) {
    warning = kind === 'action' ? 'Action lượt này đã dùng' : kind === 'bonus' ? 'Bonus Action lượt này đã dùng' : 'Reaction đã dùng (hồi ở đầu lượt của bạn)';
  }
  cur[kind] = true;
  return { used: cur, warning };
}

// ---------------------------------------------------------------------------
// Spellcasting limits per class (SRD 5.2.1 class tables)
// ---------------------------------------------------------------------------

/** Cantrips known / spells prepared by class level 1..20 (SRD 5.2.1 "Features" tables). */
export const SPELLCASTING_TABLES: Record<string, { cantrips: number[]; prepared: number[] }> = {
  bard: {
    cantrips: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    prepared: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  },
  cleric: {
    cantrips: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    prepared: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  },
  druid: {
    cantrips: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    prepared: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  },
  sorcerer: {
    cantrips: [4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
    prepared: [2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  },
  wizard: {
    cantrips: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    prepared: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25],
  },
  paladin: {
    cantrips: Array(20).fill(0),
    prepared: [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15],
  },
  ranger: {
    cantrips: Array(20).fill(0),
    prepared: [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15],
  },
  warlock: {
    cantrips: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    prepared: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
  },
};

export interface SpellLimit {
  cls: string;
  level: number;
  cantripsMax: number;
  preparedMax: number;
  cantripsUsed: number;
  preparedUsed: number;
}

/**
 * Per casting class: how many cantrips / prepared spells its level allows, and how many the sheet has assigned to it
 * (a spell's `castingClass`; with a single casting class every spell counts). Multiclass: "you determine what spells
 * you can prepare for each class individually, as if you were a single-classed member of that class."
 */
export function spellLimits(sheet: CharacterSheet): SpellLimit[] {
  const casters = castingClassesOf(sheet);
  return casters.flatMap((c: ClassEntry) => {
    const t = SPELLCASTING_TABLES[(c.name ?? '').trim().toLowerCase()];
    if (!t) return [];
    const mine = (sp: Spell) =>
      casters.length === 1 || (sp.castingClass ?? '').trim().toLowerCase() === (c.name ?? '').trim().toLowerCase();
    const idx = Math.max(0, Math.min(19, c.level - 1));
    return [
      {
        cls: c.name,
        level: c.level,
        cantripsMax: t.cantrips[idx],
        preparedMax: t.prepared[idx],
        cantripsUsed: sheet.spells.filter((s) => s.level === 0 && mine(s)).length,
        preparedUsed: sheet.spells.filter((s) => s.level > 0 && s.prepared && mine(s)).length,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Circle of the Old Ways: Wood Wose
// ---------------------------------------------------------------------------

/** The Old Ways druid entry of a sheet (subclass name contains "old way"), or undefined. */
export function oldWaysClass(sheet: CharacterSheet): ClassEntry | undefined {
  return sheetClasses(sheet).find(
    (c) => /old way/i.test(c.subclass ?? '') && (c.name ?? '').toLowerCase().includes('druid'),
  );
}

export const WOOD_WOSE = 'Wood Wose';

/**
 * The effect (and initial temp HP) of Wood Wose for an Old Ways druid — cost: 1 Wild Shape use, Bonus Action (or
 * while casting Shillelagh), 10 minutes (= 100 rounds):
 *  · Bark Bulwark: no armor → AC 10 + DEX + WIS;  · Oaken Resolve: Advantage on STR & CON saves;
 *  · Rampant Growth: temp HP = WIS mod + PB now and at the start of each of your turns;
 *  · level 6 Gnarled Thorns +1d6 piercing on melee weapon hits · level 10 Bramblebark 1d8 piercing to melee attackers ·
 *    level 14 Mighty Trunk resist bludgeoning + piercing.
 * Ends early when the druid drops to 0 HP or is incapacitated (server), or when dismissed.
 */
export function woodWoseEffect(sheet: CharacterSheet, round: number): { effect: Omit<ActiveEffect, 'id'>; tempHp: number } | null {
  const cls = oldWaysClass(sheet);
  if (!cls) return null;
  const wis = abilityMod(sheet.abilities.wis);
  const tempHp = Math.max(1, wis + sheet.proficiencyBonus);
  const lvl = classLevelOf(sheet, 'druid');
  const effect: Omit<ActiveEffect, 'id'> = {
    name: WOOD_WOSE,
    sourceSheetId: sheet.id,
    acBase: 10 + wis,
    expiresRound: round + 100,
    turnTempHp: tempHp,
    saveAdvantage: ['str', 'con'],
    endsWhenDown: true,
    note:
      'Bark Bulwark: AC = 10 + DEX + WIS khi không giáp · Oaken Resolve: lợi thế save STR/CON · ' +
      `Rampant Growth: +${tempHp} HP tạm mỗi đầu lượt · 10 phút` +
      (lvl >= 6 ? ' · Oakenfist: đánh 2 lần khi dùng Attack' : '') +
      (lvl >= 14 ? ' · Old Growth: cỡ Large, reach +5ft' : ''),
  };
  if (lvl >= 6) effect.attackRiders = [{ dice: '1d6', type: 'piercing', label: 'Gnarled Thorns', melee: true }];
  if (lvl >= 10) effect.retaliate = { dice: '1d8', type: 'piercing', always: true };
  if (lvl >= 14) effect.resist = ['bludgeoning', 'piercing'];
  return { effect, tempHp };
}
