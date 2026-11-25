import { registerExtraSpells, registerFeatDefs, registerMonsterMechanics, type CantripDef, type LocalFeatDef, type MonsterMechanic } from '@dnd-table/shared';

/**
 * A setting's own spells and feats (published, non-SRD content) live in git-ignored local files:
 *   client/src/data/spells.local.json  — CantripDef[] (same shape as the SRD spell DB entries)
 *   client/src/data/feats.local.json   — LocalFeatDef[] (FeatDef + optional passive / actions / uses)
 * The repo ships neither. Registered once at startup, before anything looks a spell or feat up.
 */
const spellMods = import.meta.glob('./data/spells.local.json', { eager: true });
const featMods = import.meta.glob('./data/feats.local.json', { eager: true });

const arr = <T,>(mods: Record<string, unknown>): T[] =>
  Object.values(mods).flatMap((m) => {
    const a = (m as { default?: unknown }).default;
    return Array.isArray(a) ? (a as T[]) : [];
  });

registerExtraSpells(arr<CantripDef>(spellMods));
registerFeatDefs(arr<LocalFeatDef>(featMods));

// Hand-written monster mechanics per stat block name (client/src/data/monsterMechanics.local.json).
const mechMods = import.meta.glob('./data/monsterMechanics.local.json', { eager: true });
for (const m of Object.values(mechMods)) {
  const d = (m as { default?: unknown }).default;
  if (d && typeof d === 'object' && !Array.isArray(d)) registerMonsterMechanics(d as Record<string, MonsterMechanic[]>);
}
