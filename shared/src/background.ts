import type { CharacterSheet, Feat } from './types.js';

/**
 * Background data (2024 rules — Background is where the Origin Feat and starting ability score
 * increases come from, not Species). The repo ships none of its own; a campaign's
 * backgrounds live in the git-ignored `client/src/data/backgrounds.local.json` (this campaign's
 * own content, paraphrased from the book — not verbatim PHB/setting-book text).
 *
 * Each background is also thematically paired 1:1 with one of the book's "Threads of Fate"
 * (`threadOfFate`/`threadGoal`) — see `docs/LOREBOOK.md` and the Lore Book's "🧵 Fate Weaving" tab
 * for the full 6-touchpoint arc (DM-only: touchpoint *triggers* are spoilers, so only the thread's
 * name + one-line goal are surfaced on the player-facing sheet).
 */
export interface BackgroundDef {
  id: string;
  name: string;
  /** Free text, e.g. "+2/+1 hoặc +1/+1/+1 vào 3 chỉ số bất kỳ (tối đa 20)". */
  abilityScores: string;
  featName: string;
  /** Vietnamese paraphrase of the Origin Feat's full rules text. */
  featText: string;
  /** Skill keys matching `SKILLS` (e.g. 'arcana', 'sleight-of-hand'). */
  skillProficiencies: string[];
  /** Free text — tool proficiency and/or bonus language(s) granted. */
  toolOrLanguage?: string;
  equipmentA: string;
  equipmentB: string;
  /** 1d6 backstory prompts, as printed. */
  storyThreads?: string[];
  /** 1d6 starting trinket table, as printed. */
  trinkets?: string[];
  /** Name of the paired Thread of Fate (matches a `threads[].name` in lorebook.local.json). */
  threadOfFate?: string;
  /** One-line goal of that thread — safe to show the player; full touchpoints stay DM-only. */
  threadGoal?: string;
}

const norm = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export function findBackground(defs: BackgroundDef[], name: string | undefined): BackgroundDef | undefined {
  const n = norm(name);
  return n ? defs.find((d) => norm(d.name) === n || norm(d.id) === n) : undefined;
}

/**
 * Choose (or clear) a background: grants its skill proficiencies and Origin Feat, cleanly
 * swapping out whatever the previously chosen background granted (mirrors `applySpecies`).
 * Ability score increases and equipment are left for the player to apply by hand — the choice
 * of which score(s) to raise, and which equipment option, is theirs to make.
 */
export function applyBackground(
  sheet: CharacterSheet,
  def: BackgroundDef | undefined,
  newId: () => string,
): CharacterSheet {
  const prevSkills = sheet.backgroundSkills ?? [];
  const skillProficiencies = sheet.skillProficiencies.filter((s) => !prevSkills.includes(s));
  const nextSkills = def?.skillProficiencies ?? [];
  for (const s of nextSkills) if (!skillProficiencies.includes(s)) skillProficiencies.push(s);

  const feats: Feat[] = sheet.feats.filter((f) => !f.fromBackground);
  if (def) feats.push({ id: newId(), name: def.featName, description: def.featText, fromBackground: def.name });

  return {
    ...sheet,
    background: def?.name,
    backgroundSkills: nextSkills,
    skillProficiencies,
    feats,
  };
}
