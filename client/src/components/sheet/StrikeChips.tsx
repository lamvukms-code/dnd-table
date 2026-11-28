import {
  BRUTAL_STRIKES,
  CUNNING_STRIKES,
  barbarianLevel,
  brutalStrikeDice,
  brutalStrikeLimit,
  cunningCost,
  cunningStrikeDc,
  cunningStrikeLimit,
  rogueLevel,
  sneakAttackDice,
  strikePickProblem,
  type CharacterSheet,
} from '@dnd-table/shared';
import { flashError } from '../../store.js';

/**
 * Cunning Strike (Rogue 5+, Devious Strikes at 14) and Brutal Strike (Barbarian 9+) options as
 * chips: picked before the attack, applied on its hit, cleared once the damage is rolled.
 */
export function StrikeChips({ draft, commit, kind }: { draft: CharacterSheet; commit: (s: CharacterSheet) => void; kind: 'cunning' | 'brutal' }) {
  const level = kind === 'cunning' ? rogueLevel(draft) : barbarianLevel(draft);
  const limit = kind === 'cunning' ? cunningStrikeLimit(draft) : brutalStrikeLimit(draft);
  if (!limit) return null;
  const opts = (kind === 'cunning' ? CUNNING_STRIKES : BRUTAL_STRIKES).filter((o) => o.minLevel <= level);
  const field = kind === 'cunning' ? 'cunningArmed' : 'brutalArmed';
  const picked = draft[field] ?? [];

  function toggle(key: string) {
    const next = picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key];
    const why = strikePickProblem(draft, kind, next);
    if (why) return flashError(why);
    commit({ ...draft, [field]: next });
  }

  return (
    <span className="strike-chips">
      <span className="cf-label">
        {kind === 'cunning'
          ? `Cunning Strike (DC ${cunningStrikeDc(draft)}, tối đa ${limit}):`
          : `Brutal Strike (+${brutalStrikeDice(draft)}, cần Reckless, tối đa ${limit}):`}
      </span>
      {opts.map((o) => (
        <button key={o.key} className={`cf-btn fr-chip ${picked.includes(o.key) ? 'on' : ''}`} title={o.vi} onClick={() => toggle(o.key)}>
          {o.name}
          {kind === 'cunning' ? ` (−${o.cost}d6)` : ''}
        </button>
      ))}
      {picked.length > 0 && (
        <span className="hint">
          {kind === 'cunning'
            ? draft.sneakAttackArmed
              ? `→ đòn kế: Sneak Attack còn ${sneakAttackDice(draft) - cunningCost(picked)}d6`
              : '→ bật Sneak Attack để dùng'
            : '→ đòn cận chiến kế (khi đang Reckless) bỏ lợi thế, +sát thương'}
        </span>
      )}
    </span>
  );
}
