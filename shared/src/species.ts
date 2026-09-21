import type { Ability, CharacterSheet, Spell } from './types.js';
import { totalLevelOf, casterTypeOf } from './rules.js';
import { SRD_SPELLS, spellFromCantrip } from './cantrips.js';

/**
 * Species (race) data. The repo ships none — species from a published setting you own live in
 * a git-ignored `client/src/data/species.local.json` (see species.example.json for the shape).
 * A sheet stores only the species *name*; features are derived from the definition at render
 * time (like subclass features), so changing species swaps them in place.
 */
export interface SpeciesFeatureDef {
  id: string;
  name: string;
  description: string;
  /** Character level at which the trait is gained (default 1). */
  level?: number;
  /** A limited-use pool (rendered as a pip tracker). */
  uses?: { max: number | 'prof'; recharge: 'short' | 'long' };
}

export interface SpeciesSpellDef {
  /** Spell name (looked up in the built-in spell DB; unknown names become a note entry). */
  name: string;
  /** Spell level (0 = cantrip). */
  level: number;
  /** Character level from which it is always available (default 1). */
  minLevel?: number;
}

export interface SpeciesDef {
  id: string;
  name: string;
  /** Free text, e.g. "Chernabos (imp-like)". */
  blurb?: string;
  creatureType?: string;
  size?: string;
  speed: number;
  /** Extra movement modes as free text: "Fly = your Speed", "Swim = your Speed". */
  movement?: string;
  darkvision?: number;
  spells?: SpeciesSpellDef[];
  features: SpeciesFeatureDef[];
}

const norm = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export function findSpecies(defs: SpeciesDef[], name: string | undefined): SpeciesDef | undefined {
  const n = norm(name);
  return n ? defs.find((d) => norm(d.name) === n || norm(d.id) === n) : undefined;
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Like findSpecies but forgives typos ("Gnallborn" → Gnarlborn); used when reading a PDF. */
export function matchSpecies(defs: SpeciesDef[], text: string | undefined): SpeciesDef | undefined {
  const exact = findSpecies(defs, text);
  if (exact) return exact;
  const n = norm(text);
  if (n.length < 4) return undefined;
  const best = defs.map((d) => ({ d, k: lev(norm(d.name), n) })).sort((a, b) => a.k - b.k)[0];
  return best && best.k <= Math.max(2, Math.floor(n.length * 0.25)) ? best.d : undefined;
}

/** Traits the character has earned at its level. */
export function derivedSpeciesFeatures(sheet: CharacterSheet, def: SpeciesDef): SpeciesFeatureDef[] {
  const lvl = totalLevelOf(sheet);
  return def.features.filter((f) => (f.level ?? 1) <= lvl);
}

export function speciesUsesMax(spec: NonNullable<SpeciesFeatureDef['uses']>['max'], sheet: CharacterSheet): number {
  return typeof spec === 'number' ? spec : sheet.proficiencyBonus;
}

/** Ability used for species spells when the class has no spellcasting of its own. */
export const SPECIES_SPELL_ABILITIES: Ability[] = ['int', 'wis', 'cha'];

/**
 * Add the species' granted spells the character has reached (cantrip at 1, "always prepared"
 * spells at their level) and drop the ones a previously chosen species granted. Spells are
 * tagged `fromSpecies` so they can be swapped cleanly.
 */
export function syncSpeciesSpells(sheet: CharacterSheet, def: SpeciesDef | undefined, newId: () => string): CharacterSheet {
  const lvl = totalLevelOf(sheet);
  let spells: Spell[] = sheet.spells.filter((s) => !s.fromSpecies || (def && s.fromSpecies === def.name));
  if (def) {
    for (const g of def.spells ?? []) {
      if ((g.minLevel ?? 1) > lvl) {
        spells = spells.filter((s) => !(s.fromSpecies === def.name && norm(s.name) === norm(g.name)));
        continue;
      }
      if (spells.some((s) => norm(s.name) === norm(g.name))) continue;
      const found = SRD_SPELLS.find(
        (c) => (c.level ?? 0) === g.level && [c.name, ...(c.aliases ?? [])].some((n) => norm(n) === norm(g.name)),
      );
      const sp: Spell = found
        ? spellFromCantrip(found, sheet, newId())
        : { id: newId(), name: g.name, level: g.level, prepared: true, castKind: 'utility', notes: 'Từ species — chưa có dữ liệu tự động.' };
      spells.push({ ...sp, prepared: true, fromSpecies: def.name });
    }
  }
  return { ...sheet, spells };
}

/** Choose (or clear) a species: sets base speed, spells and resets its use trackers. */
export function applySpecies(sheet: CharacterSheet, def: SpeciesDef | undefined, newId: () => string): CharacterSheet {
  let next: CharacterSheet = { ...sheet, species: def?.name, speciesUses: {} };
  if (def) {
    next.speed = def.speed;
    // Species spells need a casting ability; if the class has none, use the chosen one (default WIS).
    if ((def.spells?.length ?? 0) > 0 && casterTypeOf(next) === 'none' && !next.spellcastingAbility) {
      next.spellcastingAbility = next.speciesSpellAbility ?? 'wis';
    }
  }
  next = syncSpeciesSpells(next, def, newId);
  return next;
}
