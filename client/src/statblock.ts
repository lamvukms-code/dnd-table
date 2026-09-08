import { emptyDefenses, type Statblock } from '@dnd-table/shared';
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
