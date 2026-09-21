import { emptyDefenses, type Statblock, type Token } from '@dnd-table/shared';
import { nanoIdish } from './util.js';

export function blankStatblock(): Statblock {
  return {
    id: nanoIdish(),
    name: 'Kẻ địch mới',
    meta: '',
    cr: '',
    size: 'medium',
    ac: 12,
    maxHp: 10,
    hpFormula: '',
    speed: 30,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    proficiencyBonus: 2,
    saveProficiencies: [],
    skills: [],
    traits: [],
    actions: [],
    color: '#8e44ad',
    tags: [],
    notes: '',
  };
}

/** Fill in any missing fields on an imported stat block. */
export function normalizeStatblock(raw: Partial<Statblock>): Statblock {
  const base = blankStatblock();
  return {
    ...base,
    ...raw,
    id: raw.id || base.id,
    abilities: { ...base.abilities, ...(raw.abilities ?? {}) },
    saveProficiencies: raw.saveProficiencies ?? [],
    skills: raw.skills ?? [],
    traits: raw.traits ?? [],
    actions: (raw.actions ?? []).map((a) => ({
      ...a,
      actionType: a.actionType ?? 'action',
      source: 'manual' as const,
    })),
    tags: raw.tags ?? [],
    notes: raw.notes ?? '',
    defenses: raw.defenses
      ? { ...emptyDefenses(), ...raw.defenses }
      : undefined,
  };
}

export function mergeBestiary(current: Statblock[], incoming: Statblock[]): Statblock[] {
  const map = new Map(current.map((s) => [s.id, s]));
  for (const sb of incoming) map.set(sb.id, normalizeStatblock(sb));
  return [...map.values()];
}

/**
 * Build / refresh a bestiary stat block from a token on the map (the reverse of spawning).
 * With `existing` (the token's source entry) it updates that entry; otherwise it creates a new one.
 */
export function statblockFromToken(t: Token, existing?: Statblock): Statblock {
  const base = existing ?? blankStatblock();
  const tsb = t.statblock;
  return {
    ...base,
    name: existing ? base.name : t.label,
    meta: tsb?.meta ?? base.meta,
    size: t.size,
    color: t.color,
    imageUrl: t.imageUrl ?? base.imageUrl,
    ac: t.armorClass ?? base.ac,
    maxHp: t.maxHp ?? base.maxHp,
    speed: tsb?.speed ?? base.speed,
    abilities: tsb ? { ...tsb.abilities } : base.abilities,
    proficiencyBonus: tsb?.proficiencyBonus ?? base.proficiencyBonus,
    saveProficiencies: tsb ? [...tsb.saveProficiencies] : base.saveProficiencies,
    skills: tsb ? tsb.skills.map((s) => ({ ...s })) : base.skills,
    actions: tsb ? tsb.actions.map((a) => ({ ...a })) : base.actions,
    traits: tsb ? tsb.traits.map((x) => ({ ...x })) : base.traits,
    defenses: t.defenses ?? tsb?.defenses ?? base.defenses,
    notes: tsb?.notes ?? base.notes,
  };
}
