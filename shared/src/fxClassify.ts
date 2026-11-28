import type { RollLogEntry } from './types.js';

/**
 * Sound / visual effect classification for the table: what an attack, spell or heal in the roll log
 * looks and sounds like (bite, claw, slam, slash, pierce, arrow, thrown, punch, spell element, heal).
 */

export type Cue = 'bite' | 'claw' | 'slam' | 'slash' | 'pierce' | 'arrow' | 'thrown' | 'punch' | 'spell' | 'heal';
export const ELEMENTS = ['fire', 'cold', 'lightning', 'thunder', 'acid', 'poison', 'necrotic', 'radiant', 'force', 'psychic'] as const;
export type Element = (typeof ELEMENTS)[number];

export interface FxEvent {
  id: string;
  cue: Cue;
  element?: Element;
  /** 'launch' = the swing / shot / cast (attack roll), 'impact' = it lands (damage / failed save / heal). */
  phase: 'launch' | 'impact';
  hit?: boolean;
  crit?: boolean;
  from?: string;
  to?: string;
  amount?: number;
  heal?: boolean;
}

// --- classification ---------------------------------------------------------------------------

const has = (s: string, re: RegExp) => re.test(s);

/** What an attack / spell looks and sounds like, from its name, range, kind and damage types. */
export function classify(fx: NonNullable<RollLogEntry['fx']>): { cue: Cue; element?: Element } {
  const n = (fx.name ?? '').toLowerCase();
  const types = (fx.types ?? []).map((t) => t.toLowerCase());
  const elementOf = (): Element | undefined => {
    const byType = types.find((t) => (ELEMENTS as readonly string[]).includes(t)) as Element | undefined;
    if (byType) return byType;
    if (has(n, /fire|flame|burn|scorch|lửa|hỏa/)) return 'fire';
    if (has(n, /frost|ice|cold|chill|băng|giá/)) return 'cold';
    if (has(n, /lightning|shock|thunderbolt|sét|điện/)) return 'lightning';
    if (has(n, /thunder|thunderwave|shatter|sấm/)) return 'thunder';
    if (has(n, /acid|axit/)) return 'acid';
    if (has(n, /poison|venom|độc/)) return 'poison';
    if (has(n, /necro|chill touch|toll the dead|blight|hoại tử/)) return 'necrotic';
    if (has(n, /radiant|sacred|guiding|holy|smite|thánh/)) return 'radiant';
    if (has(n, /psychic|mind|tâm/)) return 'psychic';
    return undefined;
  };
  if (fx.heal) return { cue: 'heal' };
  if (fx.kind === 'spell') return { cue: 'spell', element: elementOf() ?? 'force' };
  if (has(n, /bite|fang|jaws|maw|cắn|nanh/)) return { cue: 'bite' };
  if (has(n, /claw|talon|rake|vuốt|cào/)) return { cue: 'claw' };
  if (has(n, /unarmed|punch|kick|tay không|đấm|martial arts|flurry/)) return { cue: 'punch' };
  if (has(n, /bow|crossbow|sling|blowgun|cung|nỏ|shot|firearm|pistol|musket|rifle|gun/)) return { cue: 'arrow' };
  if (fx.range === 'ranged' && has(n, /dart|javelin|handaxe|throw|ném|spear|dagger/)) return { cue: 'thrown' };
  if (has(n, /slam|fist|tail|hoof|ram|tentacle|club|mace|hammer|maul|staff|flail|morningstar|đập|búa/)) return { cue: 'slam' };
  // magic damage on a weapon (a flame tongue): still the weapon's sound, plus the element
  const el = elementOf();
  if (fx.range === 'ranged') return { cue: 'arrow', element: el };
  if (types.includes('slashing')) return { cue: 'slash', element: el };
  if (types.includes('piercing')) return { cue: 'pierce', element: el };
  if (types.includes('bludgeoning')) return { cue: 'slam', element: el };
  if (el) return { cue: 'spell', element: el };
  return { cue: 'slash' };
}

/** The effect events one new log entry stands for (none for plain rolls). */
export function eventsFor(entry: RollLogEntry): FxEvent[] {
  if (!entry.fx) return [];
  const { cue, element } = classify(entry.fx);
  const base = { cue, element, from: entry.fx.from, to: entry.fx.to };
  if (entry.attack) return [{ ...base, id: `${entry.id}:l`, phase: 'launch', hit: entry.attack.hit, crit: entry.attack.crit }];
  if (entry.damage) return [{ ...base, id: `${entry.id}:i`, phase: 'impact', hit: true, amount: entry.damage.amount }];
  if (entry.fx.heal) {
    const m = /\+(\d+)\s*HP/.exec(entry.label);
    return [{ ...base, id: `${entry.id}:h`, phase: 'impact', heal: true, amount: m ? Number(m[1]) : undefined }];
  }
  return [];
}

