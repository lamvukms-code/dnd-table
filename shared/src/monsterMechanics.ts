import type { Ability, SceneLight, SheetAction, StatblockTrait, TokenSize } from './types.js';

/**
 * Monster mechanics as data. Each entry is one rule the engine applies at a fixed hook (attack roll,
 * saving throw, effect application, damage). Two sources, merged:
 *  - `detectMechanics`: standard stat-block wording (SRD-style) read from trait / action text;
 *  - `registerMonsterMechanics`: hand-written entries per stat block name, from a git-ignored local file
 *    (setting content is never committed).
 * `from` names the trait / action the rule came from (the "⚙ tự động" badge in the monster card).
 */
export type AttackAdvantageWhen =
  | 'allyAdjacentToTarget' // Pack Tactics
  | 'targetAdjacentToItsAlly' // "within 5 feet of one of that creature's allies"
  | 'targetGrappledBySelf'
  | 'targetDamaged' // the target doesn't have all its hit points
  | `targetCondition:${string}`;

export type MonsterMechanic =
  | { kind: 'conditionImmunity'; conditions: string[]; from?: string }
  /** Advantage on saves: against spells / magical effects, against some conditions, or on some abilities. */
  | { kind: 'saveAdvantage'; vsMagic?: boolean; vsConditions?: string[]; abilities?: Ability[]; from?: string }
  | { kind: 'evasion'; from?: string }
  | { kind: 'attackAdvantage'; when: AttackAdvantageWhen[]; meleeOnly?: boolean; from?: string }
  /** Critical hit on a natural `min`+ (only these actions when `actions` is set). */
  | { kind: 'critRange'; min: number; actions?: string[]; from?: string }
  /** The attack is a critical hit when the condition holds. */
  | { kind: 'autoCrit'; when: 'targetGrappledBySelf'; actions?: string[]; from?: string }
  /** Extra damage dice added when the monster scores a critical hit. */
  | { kind: 'critExtraDamage'; dice: string; type?: string; meleeOnly?: boolean; from?: string }
  /** A hit grapples the target (escape DC), if it is no bigger than `maxSize`. */
  | { kind: 'onHitGrapple'; actions: string[]; escapeDc: number; maxSize?: TokenSize; from?: string }
  /** A hit heals the monster by the damage dealt (only damage of `type` when set). */
  | { kind: 'lifesteal'; actions: string[]; type?: string; ifTargetCondition?: string; from?: string }
  /** Heals at the start of its turn; `suppressedBy` damage types / traits (fire, acid, moongilded…) taken since its
   *  last turn stop it once. `diesOnlyAtTurnStart`: at 0 HP it isn't dead until a turn starts without regenerating. */
  | { kind: 'regeneration'; hp: string; needsHp?: boolean; suppressedBy?: string[]; diesOnlyAtTurnStart?: boolean; from?: string }
  /** Creatures (hostile to it) starting their turn within `radiusFt` — or entering it, with `trigger: 'startOrEnter'` —
   *  make the save; on a failure: a condition for `rounds`, a madness, and/or damage. */
  | {
      kind: 'aura';
      radiusFt: number;
      trigger: 'startTurn' | 'startOrEnter' | 'endTurn';
      save?: { ability: Ability; dc: number };
      onFail: { condition?: string; rounds?: number; madness?: 'short' | 'long' | 'indefinite'; damage?: { dice: string; type: string } };
      halfOnSave?: boolean;
      immuneOnSave?: boolean;
      from?: string;
    }
  /** Damage at the start / end of a turn: to creatures it grapples (on their turns, and on its own with
   *  `alsoOwnTurn`), or to every other creature within `radiusFt` on its own turn. */
  | {
      kind: 'turnDamage';
      when: 'start' | 'end';
      targets: 'grappled' | 'nearby';
      radiusFt?: number;
      dice: string;
      type: string;
      save?: { ability: Ability; dc: number };
      halfOnSave?: boolean;
      alsoOwnTurn?: boolean;
      ifBelowHalfHp?: boolean;
      suppressedBy?: string[];
      from?: string;
    }
  /** At 0 HP: a save-for-half burst around it. */
  | { kind: 'deathBurst'; radiusFt: number; save: { ability: Ability; dc: number }; damage: { dice: string; type: string }[]; halfOnSave?: boolean; from?: string }
  /** At 0 HP: an effect on its allies within `radiusFt` (e.g. empowered for 2 rounds). */
  | { kind: 'deathAllyEffect'; radiusFt: number; effect: { name: string; note?: string; rounds?: number; condition?: string }; from?: string }
  /** At 0 HP: it comes back with `hp` (dice or 'full'), `uses` times per day, maybe with a burst. */
  | {
      kind: 'reviveAtZero';
      hp: string;
      uses?: number;
      burst?: { radiusFt: number; save: { ability: Ability; dc: number }; damage: { dice: string; type: string }[]; halfOnSave?: boolean };
      from?: string;
    }
  /** At 0 HP: a reminder line (it reforms elsewhere, curses end…). */
  | { kind: 'deathNote'; from?: string }
  /** Reaction: +`ac` against one melee attack that would hit (used only when it turns the hit into a miss). */
  | { kind: 'parry'; ac: number; actionId?: string; from?: string }
  /** Reaction: a DEX save against the attack roll's total; a success makes the attack miss. */
  | { kind: 'dodgeSave'; meleeOnly?: boolean; actionId?: string; from?: string }
  /** Reaction: the hit's damage is reduced by `dice`. */
  | { kind: 'reduceDamage'; dice: string; actionId?: string; from?: string }
  /** Passive: a creature within `radiusFt` that hits it with a melee attack takes damage. */
  | { kind: 'thorns'; radiusFt: number; dice: string; type: string; from?: string }
  /** It may take a reaction on every turn, not once per round. */
  | { kind: 'reactive'; from?: string }
  /** Doesn't provoke opportunity attacks when it flies out of reach. */
  | { kind: 'flyby'; from?: string }
  /** Extra damage on every hit (while it lasts, e.g. from a stance). */
  | { kind: 'hitExtraDamage'; dice: string; type: string; meleeOnly?: boolean; from?: string }
  /** A stance / transformation: by hand, or by itself when it takes `damageType` damage or drops to `hpAtMost`. */
  | {
      kind: 'stance';
      name: string;
      trigger?: 'manual' | 'onDamageType' | 'hpAtMost';
      damageType?: string;
      hpAtMost?: number;
      actionId?: string;
      uses?: number;
      rounds?: number;
      patch: { size?: TokenSize; tempHp?: number; diceBump?: number; acBonus?: number; note?: string; mechanics?: MonsterMechanic[] };
      endOn?: { type: string; over: number };
      from?: string;
    }
  /** A hit (or a failed save) puts the target inside it: restrained (+ blinded), total cover, damage each turn. */
  | {
      kind: 'engulf';
      actions: string[];
      label: string;
      requiresGrappled?: boolean;
      maxSize?: TokenSize;
      blinded?: boolean;
      turnDamage?: { dice: string; type: string };
      escapeDamage?: number;
      escapeDc?: number;
      from?: string;
    }
  /** It loses a limb whenever one hit deals more than `loseOver` damage. */
  | { kind: 'limbs'; count: number; loseOver: number; from?: string }
  /**
   * Depends on light where it stands: `sun` = in sunlight, `notMoon` = anywhere but moonlight,
   * `dimOrDark` = dim light / darkness / moonlight. Damage at the start of its turn, disadvantage on its
   * d20s, conditions while it holds, or just a reminder.
   */
  | {
      kind: 'light';
      when: 'sun' | 'notMoon' | 'dimOrDark';
      startDamage?: { dice: string; type: string };
      disadvantage?: ('attack' | 'check' | 'save')[];
      conditions?: string[];
      note?: string;
      from?: string;
    }
  /** Taking `damageType` damage gives it disadvantage until the end of its next turn. */
  | { kind: 'aversion'; damageType: string; disadvantage: ('attack' | 'check' | 'save')[]; from?: string }
  /** Seeing a creature holding one of these weapons at the start of its turn gives it a condition until its next turn. */
  | { kind: 'weaponAversion'; weapons: string[]; condition: string; from?: string }
  /** Advantage on its initiative roll — unless it has one of `unless`, or only near another of its kind. */
  | { kind: 'initiativeAdvantage'; unless?: string[]; nearSameFt?: number; from?: string }
  /** +1 to attack and damage per other creature of its kind within `radiusFt` (at most `max`). */
  | { kind: 'hiveBonus'; radiusFt: number; max: number; from?: string }
  /** Attack rolls against it have disadvantage: ranged weapon attacks only, or all. */
  | { kind: 'defenseDisadvantage'; vs: 'rangedWeapon' | 'all'; from?: string }
  /** Hitting a creature with an attack heals it (not when the target is one of `notTypes`). */
  | { kind: 'healOnHit'; dice: string; notTypes?: string[]; from?: string }
  /** AC bonus while its HP is under thresholds (highest bonus that applies). */
  | { kind: 'acByHp'; steps: { below: number; bonus: number }[]; from?: string }
  /** Any other reaction: offered to the DM when its trigger happens (one click runs its save / damage). */
  | {
      kind: 'reaction';
      trigger: 'selfDamaged' | 'selfAttacked' | 'allyDamaged' | 'nearStart' | 'healCast' | 'spellCast';
      radiusFt?: number;
      enters?: boolean;
      actionId?: string;
      from?: string;
    };

const SIZES: TokenSize[] = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
export const sizeIndex = (s: TokenSize | undefined) => SIZES.indexOf(s ?? 'medium');

const CONDITIONS = [
  'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed',
  'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious', 'exhaustion', 'madness',
];
const ABIL: Record<string, Ability> = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };

const DICE = String.raw`\d+d\d+(?:\s?[+-]\s?\d+)?`;
const ROUNDS = (t: string) => (/until the (?:start|end) of (?:its|the target's|their) next turn/i.test(t) ? 1 : /for 1 minute/i.test(t) ? 10 : /for 1 hour/i.test(t) ? 600 : 1);
const madnessIn = (t: string): 'short' | 'long' | 'indefinite' | undefined =>
  /indefinite madness/i.test(t) ? 'indefinite' : /long-term madness/i.test(t) ? 'long' : /short-term madness/i.test(t) ? 'short' : undefined;
const dmgIn = (t: string) => {
  const out: { dice: string; type: string }[] = [];
  for (const m of t.matchAll(new RegExp(String.raw`\d+ \((${DICE})\) (\w+) damage`, 'gi'))) out.push({ dice: m[1].replace(/\s/g, ''), type: m[2].toLowerCase() });
  return out;
};
const saveIn = (t: string): { ability: Ability; dc: number } | undefined => {
  const a = /DC (\d+) (strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw/i.exec(t);
  if (a) return { ability: ABIL[a[2].toLowerCase()], dc: Number(a[1]) };
  const b = /(strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw: DC (\d+)/i.exec(t);
  if (b) return { ability: ABIL[b[1].toLowerCase()], dc: Number(b[2]) };
  return undefined;
};
const splitTypes = (t: string) =>
  t.toLowerCase().split(/,|\bor\b|\band\b/).map((x) => x.trim()).filter(Boolean);

const condsIn = (text: string) => CONDITIONS.filter((c) => new RegExp(`\\b${c}\\b`, 'i').test(text));
const textOf = (x: { description?: string; text?: string }) => x.description ?? x.text ?? '';

/** Mechanics recognisable from standard stat-block wording. */
export function detectMechanics(sb: { traits?: StatblockTrait[]; actions?: SheetAction[] }): MonsterMechanic[] {
  const out: MonsterMechanic[] = [];
  for (const t of sb.traits ?? []) {
    const name = t.name ?? '';
    const d = textOf(t as { description?: string });

    if (/^condition immunities/i.test(name)) {
      const c = condsIn(d);
      if (c.length) out.push({ kind: 'conditionImmunity', conditions: c, from: name });
      continue;
    }
    if (/^magic resistance/i.test(name) || /(?<!dis)advantage on saving throws against spells and other magical effects/i.test(d)) {
      out.push({ kind: 'saveAdvantage', vsMagic: true, from: name });
    }
    const vs = /(?<!dis)advantage on saving throws against being ([a-z ,]+?)(?:\.|,? and (?!magic)|$)/i.exec(d);
    if (vs) {
      const c = condsIn(vs[1]);
      if (c.length) out.push({ kind: 'saveAdvantage', vsConditions: c, from: name });
    }
    // "advantage on Strength checks and Strength saving throws" — never "disadvantage on …"
    const abilSaves = [...d.matchAll(/(?<!dis)advantage on ((?:(?:strength|dexterity|constitution|intelligence|wisdom|charisma)(?: checks)?(?:,? and |,? or |, )?)+)\s*saving throws/gi)]
      .flatMap((m) => [...m[1].matchAll(/(strength|dexterity|constitution|intelligence|wisdom|charisma)(?! checks)/gi)].map((x) => ABIL[x[1].toLowerCase()]));
    if (abilSaves.length && !vs) out.push({ kind: 'saveAdvantage', abilities: [...new Set(abilSaves)], from: name });
    if (/^evasion/i.test(name)) out.push({ kind: 'evasion', from: name });

    // light: sunlight hypersensitivity / weakness, lunar invisibility, shadow stealth
    const sunDmg = /takes (\d+)(?: \((\d+d\d+(?:\s*[+-]\s*\d+)?)\))? (\w+) damage if (?:it|he|she|they) starts? (?:its|his|her|their) turn in sunlight/i.exec(d);
    const sunDis = /while in sunlight[^.]*?disadvantage on ([^.]+)/i.exec(d);
    if (sunDmg || sunDis) {
      const what = sunDis?.[1] ?? '';
      const dis: ('attack' | 'check' | 'save')[] = /d20 tests/i.test(what)
        ? ['attack', 'check', 'save']
        : [...(/attack rolls/i.test(what) ? ['attack' as const] : []), ...(/ability checks|perception/i.test(what) ? ['check' as const] : [])];
      out.push({
        kind: 'light',
        when: 'sun',
        startDamage: sunDmg ? { dice: (sunDmg[2] ?? sunDmg[1]).replace(/\s/g, ''), type: sunDmg[3].toLowerCase() } : undefined,
        disadvantage: dis.length ? dis : undefined,
        from: name,
      });
    }
    const lunar = /while not in moonlight, ([^.]+)/i.exec(d);
    if (lunar && condsIn(lunar[1]).length) out.push({ kind: 'light', when: 'notMoon', conditions: condsIn(lunar[1]), from: name });
    if (/while in dim light or darkness[^.]*hide action as a bonus action/i.test(d))
      out.push({ kind: 'light', when: 'dimOrDark', note: 'Hide được bằng bonus action', from: name });
    const avers =
      /if (?:it|the [\w' -]+?) takes (\w+) damage, (?:it|the [\w' -]+?) has disadvantage on ([^.]+?) until the end of its next turn/i.exec(d) ??
      /(?:when|if) (?:it|the [\w' -]+?) [^.]*?,? or takes (\w+) damage, (?:it|the [\w' -]+?) has disadvantage on ([^.]+?) until the end of its next turn/i.exec(d);
    if (avers) {
      const dis: ('attack' | 'check' | 'save')[] = /d20 tests/i.test(avers[2]) ? ['attack', 'check', 'save'] : [
        ...(/attack rolls/i.test(avers[2]) ? ['attack' as const] : []),
        ...(/ability checks/i.test(avers[2]) ? ['check' as const] : []),
        ...(/saving throws/i.test(avers[2]) ? ['save' as const] : []),
      ];
      if (dis.length) out.push({ kind: 'aversion', damageType: avers[1].toLowerCase(), disadvantage: dis, from: name });
    }
    // initiative advantage: "has advantage on its initiative roll" (unless blinded / near another of its kind)
    if (/(?:has|have|gains?) advantage on (?:its |their )?initiative rolls?/i.test(d)) {
      const un = /if (?:it|the [\w' -]+?) (?:is not|isn't) ([a-z]+)/i.exec(d);
      const near = /within (\d+) feet of at least one other/i.exec(d);
      out.push({ kind: 'initiativeAdvantage', unless: un && condsIn(un[1]).length ? condsIn(un[1]) : undefined, nearSameFt: near ? Number(near[1]) : undefined, from: name });
    }
    const hive = /bonus to (?:its )?attack and damage rolls equal to the number of [\w' -]+? within (\d+) feet of it \(maximum \+(\d+)\)/i.exec(d);
    if (hive) out.push({ kind: 'hiveBonus', radiusFt: Number(hive[1]), max: Number(hive[2]), from: name });
    if (/ranged weapon attacks? (?:rolls? )?against (?:it|the [\w' -]+?) (?:are made with|have) disadvantage/i.test(d))
      out.push({ kind: 'defenseDisadvantage', vs: 'rangedWeapon', from: name });
    else if (/(?:^|\. )attack rolls against (?:it|the [\w' -]+?) (?:are made with|have) disadvantage\./i.test(d))
      out.push({ kind: 'defenseDisadvantage', vs: 'all', from: name });
    const hoh = new RegExp(String.raw`after hitting an? (non-?(\w+) )?creature with an attack,[^.]*?regain(?:s|ing) \d+ \((${DICE})\) hit points`, 'i').exec(d);
    if (hoh) out.push({ kind: 'healOnHit', dice: hoh[3].replace(/\s/g, ''), notTypes: hoh[2] ? [hoh[2].toLowerCase()] : undefined, from: name });
    const acHp = /while (?:it|the [\w' -]+?|\w+) has fewer than ([\d, ]+?(?:,? or \d+)?) hit points, (?:it|he|she) gains an? ([+\d, ]+?(?:,? or \+\d+)?) bonus to (?:its|his|her) AC/i.exec(d);
    if (acHp) {
      const hp = acHp[1].match(/\d+/g)!.map(Number);
      const bonus = acHp[2].match(/\d+/g)!.map(Number);
      if (hp.length === bonus.length) out.push({ kind: 'acByHp', steps: hp.map((below, i) => ({ below, bonus: bonus[i] })), from: name });
    }
    const wav = /at the start of (?:its|the [\w' -]+?'s) turn, if it can see a creature holding an? ([^,]+(?:, an? [^,]+)*,? or an? [\w -]+?), it has the (\w+) condition until the start of its next turn/i.exec(d);
    if (wav && condsIn(wav[2]).length) {
      const weapons = wav[1].split(/,\s*(?:or\s+)?|\s+or\s+/).map((w) => w.replace(/^an?\s+/i, '').trim().toLowerCase()).filter(Boolean);
      out.push({ kind: 'weaponAversion', weapons, condition: condsIn(wav[2])[0], from: name });
    }

    const when: AttackAdvantageWhen[] = [];
    if (/pack tactics/i.test(name) || /if at least one of (its|the \w+'s) allies is within 5 feet of the creature/i.test(d)) when.push('allyAdjacentToTarget');
    if (/(?<!dis)advantage on (?:melee )?attack rolls? against .*within 5 feet of one of that creature's allies/i.test(d)) when.push('targetAdjacentToItsAlly');
    if (/(?<!dis)advantage on (?:melee )?attack rolls? against (?:any creature|a creature|creatures)?.*(?:it is grappling|grappled by it|that it is grappling)/i.test(d)) when.push('targetGrappledBySelf');
    if (/(?<!dis)advantage on (?:melee )?attack rolls? against any creature that doesn't have all its hit points/i.test(d)) when.push('targetDamaged');
    const vsCond = /(?<!dis)advantage on (?:melee )?attack rolls? against (blinded|deafened|frightened|poisoned|prone|restrained|charmed|stunned|paralyzed|incapacitated) creatures/i.exec(d);
    if (vsCond) when.push(`targetCondition:${vsCond[1].toLowerCase()}`);
    if (when.length) out.push({ kind: 'attackAdvantage', when, meleeOnly: /melee attack rolls/i.test(d) || undefined, from: name });

    // --- wave 2: turn hooks and death
    const regen = /regains (\d+)(?: \((\d+d\d+(?: ?[+-] ?\d+)?)\))? hit points at the start of (?:each of )?its turns?/i.exec(d);
    if (regen) {
      const sup: string[] = [];
      const t1 = /takes ([a-z, ]+?) damage[^.]*?(?:doesn't|does not|don't) function/i.exec(d);
      if (t1) sup.push(...splitTypes(t1[1]));
      if (/moongilded/i.test(d)) sup.push('moongilded');
      if (/silvered/i.test(d) && /doesn't function|does not function/i.test(d)) sup.push('silvered');
      out.push({
        kind: 'regeneration',
        hp: regen[2] ? regen[2].replace(/\s/g, '') : regen[1],
        needsHp: /at least 1 hit point/i.test(d) || undefined,
        suppressedBy: sup.length ? [...new Set(sup)] : undefined,
        diesOnlyAtTurnStart: /dies only if it starts its turn with 0 hit points/i.test(d) || undefined,
        from: name,
      });
    }
    const revive = /(?:when|if) (?:the|it)[\w' -]*? is reduced to 0 hit points[^.]*?(?:\.\s*instead, it)?[^.]*?regain(?:s|ing) (all (?:of )?its hit points|(\d+)(?: \((\d+d\d+(?: ?[+-] ?\d+)?)\))? hit points)/i.exec(d);
    const startAura =
      /starts? (?:its|their) turn within (\d+) feet of/i.exec(d) ??
      /that starts its turn within (\d+) feet of/i.exec(d) ??
      /(?:starts|ends) its turn in an? (\d+)-?\s?foot emanation/i.exec(d) ??
      /an? (\d+)-?\s?foot emanation[^.]*\.[^]*?(?:starts|ends) its turn in th/i.exec(d) ??
      /an? (\d+)-foot-radius sphere[^.]*centered on itself[^]*?(?:starts|ends) its turn there/i.exec(d);
    const inSpace = /(?:starts|ends) its turn in (?:the [\w' -]+?'s|its) space/i.test(d);
    if (revive) {
      const uses = /\((\d+)\/day\)/i.exec(name);
      const after = d.slice((revive.index ?? 0) + revive[0].length);
      const bs = saveIn(after);
      const br = /within (\d+) feet/i.exec(after);
      out.push({
        kind: 'reviveAtZero',
        hp: /^all/i.test(revive[1]) ? 'full' : (revive[3] ?? revive[2]).replace(/\s/g, ''),
        uses: uses ? Number(uses[1]) : 1,
        burst: bs && br && dmgIn(after).length ? { radiusFt: Number(br[1]), save: bs, damage: dmgIn(after), halfOnSave: /half/i.test(after) || undefined } : undefined,
        from: name,
      });
    } else if (/(?:explodes when it dies|when (?:the|it)[\w' -]*? dies|is reduced to 0 hit points)/i.test(d) && /each creature (?:within (\d+) feet|in an? \d+-foot emanation)/i.test(d)) {
      const r = /each creature (?:within (\d+) feet|in an? (\d+)-foot emanation)/i.exec(d)!;
      const sv = saveIn(d);
      const dm = dmgIn(d);
      if (sv && dm.length) out.push({ kind: 'deathBurst', radiusFt: Number(r[1] ?? r[2]), save: sv, damage: dm, halfOnSave: /half/i.test(d) || undefined, from: name });
    } else if (/restoration|rejuvenation/i.test(name) && /dies|destroyed/i.test(d)) {
      out.push({ kind: 'deathNote', from: name });
    } else if ((startAura || inSpace) && !/^innate spellcasting|^spellcasting/i.test(name)) {
      const sv = saveIn(d);
      const fail = /failure:\s*([^.]*(?:\.[^.]*)?)/i.exec(d)?.[1] ?? d;
      // "…an effect that ends the Poisoned condition" names a condition it doesn't give
      const cond = condsIn(fail.replace(/ends? the \w+ condition/gi, '')).find((c) => c !== 'exhaustion' && c !== 'madness');
      const dm = dmgIn(fail);
      const mad = madnessIn(fail);
      // no save: plain damage to whoever ends / starts its turn there (Blighted Aura)
      if ((sv && (cond || dm.length || mad)) || (!sv && dm.length && !cond && !mad)) {
        out.push({
          kind: 'aura',
          radiusFt: startAura ? Number(startAura[1]) : 0,
          trigger: /ends its turn (?:in|within|there)/i.test(d) && !/starts? its turn/i.test(d) ? 'endTurn' : /enters? (?:that|the) (?:[\w']+ )?area/i.test(d) ? 'startOrEnter' : 'startTurn',
          save: sv,
          onFail: { condition: cond, rounds: ROUNDS(fail), madness: mad, damage: dm[0] },
          halfOnSave: /half/i.test(d) || undefined,
          immuneOnSave: /immune to/i.test(d) || undefined,
          from: name,
        });
      }
    }
    const grip = new RegExp(String.raw`(?:creature|target) (?:that )?(?:the [\w' -]+|it) is grappling takes \d+ \((${DICE})\) (\w+) damage at the start of each of its turns( and (?:the [\w' -]+'s|its) turns)?`, 'i').exec(d);
    if (grip) out.push({ kind: 'turnDamage', when: 'start', targets: 'grappled', dice: grip[1].replace(/\s/g, ''), type: grip[2].toLowerCase(), alsoOwnTurn: !!grip[3] || undefined, from: name });
    const ring = new RegExp(String.raw`at the (start|end) of each of (?:its|the [\w' -]+'s) turns,? each creature within (\d+) feet of (?:it|the [\w' -]+) takes \d+ \((${DICE})\) (\w+) damage`, 'i').exec(d);
    // a ring that only burns while some state lasts ("when reduced to N hit points or fewer … for the next minute") is a stance, not always-on
    if (ring && !/reduced to \d+ hit points or fewer|for the next minute/i.test(d)) out.push({ kind: 'turnDamage', when: ring[1].toLowerCase() as 'start' | 'end', targets: 'nearby', radiusFt: Number(ring[2]), dice: ring[3].replace(/\s/g, ''), type: ring[4].toLowerCase(), from: name });

    const th = new RegExp(String.raw`whenever a creature within (\d+) feet of (?:it|the [\w' -]+) hits it with a melee attack,? (?:that|the) creature takes \d+ \((${DICE})\) (\w+) damage`, 'i').exec(d);
    if (th) out.push({ kind: 'thorns', radiusFt: Number(th[1]), dice: th[2].replace(/\s/g, ''), type: th[3].toLowerCase(), from: name });
    if (/can take one reaction on every turn/i.test(d)) out.push({ kind: 'reactive', from: name });
    const limb = /takes more than (\d+) damage, one of its limbs/i.exec(d);
    if (limb) out.push({ kind: 'limbs', count: /two arms[^.]*two legs/i.test(d) ? 4 : 4, loseOver: Number(limb[1]), from: name });
    if (/^flyby/i.test(name) || /doesn't provoke opportunity attacks when it flies out of an enemy's reach/i.test(d)) out.push({ kind: 'flyby', from: name });

    const crit = /(?:additional|extra) \d+ \((\d+d\d+)\) ?(\w+)? damage when determining the extra damage for a critical hit|scores a critical hit .*?takes an additional \d+ \((\d+d\d+)\) (\w+) damage/i.exec(d);
    if (crit) out.push({ kind: 'critExtraDamage', dice: crit[1] ?? crit[3], type: crit[2] ?? crit[4], meleeOnly: /melee/i.test(d) || undefined, from: name });
  }
  for (const a of sb.actions ?? []) {
    const d = a.description ?? '';
    // swallowed / devoured / trapped inside it
    const inside = /\b(swallowed|devoured|trapped in (?:the|its) [\w' -]+|entombed|engulfed)\b/i.exec(d);
    if (inside && /restrained/i.test(d) && (typeof a.attackBonus === 'number' || a.save || /saving throw|attack hits|bite attack/i.test(d))) {
      const td = new RegExp(String.raw`takes \d+ \((${DICE})\) (\w+) damage at the start of each of`, 'i').exec(d);
      const esc = /takes (\d+) damage or more on a single turn from a creature inside/i.exec(d);
      const dc = /DC (\d+) (?:Strength \()?(?:Athletics|Strength)/i.exec(d);
      const size = /(tiny|small|medium|large|huge) or smaller/i.exec(d);
      out.push({
        kind: 'engulf',
        actions: [a.name],
        label: inside[1].split(' ')[0].toLowerCase(),
        requiresGrappled: /(?:it is|is) grappling|grappled by (?:the|it)/i.test(d) || undefined,
        maxSize: size ? (size[1].toLowerCase() as TokenSize) : undefined,
        blinded: /blinded/i.test(d) || undefined,
        turnDamage: td ? { dice: td[1].replace(/\s/g, ''), type: td[2].toLowerCase() } : undefined,
        escapeDamage: esc ? Number(esc[1]) : undefined,
        escapeDc: dc ? Number(dc[1]) : undefined,
        from: a.name,
      });
    }
    if (a.actionType === 'reaction') {
      const parry = /adds (\d+) to its AC against (?:one melee attack|that attack|a melee attack)/i.exec(d);
      const red = new RegExp(String.raw`reduces? (?:the attack's |the )?damage[^.]*?by \d+ \((${DICE})\)`, 'i').exec(d);
      const trig = (/^trigger:\s*([^.]*)/i.exec(d)?.[1] ?? d).toLowerCase();
      if (parry) out.push({ kind: 'parry', ac: Number(parry[1]), actionId: a.id, from: a.name });
      else if (/saving throw with a DC equal to the attack/i.test(d))
        out.push({ kind: 'dodgeSave', meleeOnly: /melee attack/i.test(trig) || undefined, actionId: a.id, from: a.name });
      else if (red) out.push({ kind: 'reduceDamage', dice: red[1].replace(/\s/g, ''), actionId: a.id, from: a.name });
      else if (!/reduced to 0 hit points/i.test(trig)) {
        const near = /within (\d+) feet/i.exec(trig);
        const trigger =
          /starts? its turn within/.test(trig) ? 'nearStart'
          : /spell that restores hit points|casts a spell that restores/.test(trig) ? 'healCast'
          : /casts? a spell/.test(trig) ? 'spellCast'
          : /another creature|an ally|a creature (?:the [\w' -]+ )?can see within \d+ feet[^.]*takes damage/.test(trig) && /takes damage/.test(trig) ? 'allyDamaged'
          : /after being hit|is hit by|takes damage|hits (?:it|the [\w' -]+) with/.test(trig) ? 'selfDamaged'
          : /targets? (?:it|the [\w' -]+) with an? (?:attack|spell)|is targeted by|is attacked by|attacks (?:it|the [\w' -]+)/.test(trig) ? 'selfAttacked'
          : undefined;
        if (trigger)
          out.push({ kind: 'reaction', trigger, radiusFt: near ? Number(near[1]) : undefined, enters: /enters? (?:the|that) area/.test(trig) || undefined, actionId: a.id, from: a.name });
      }
    }
    const rv = /(?:when|if) (?:the|it)[\w' -]*? is reduced to 0 hit points[^.]*?regain(?:s|ing) (all (?:of )?its hit points|(\d+)(?: \((\d+d\d+(?: ?[+-] ?\d+)?)\))? hit points)/i.exec(d);
    if (rv) {
      const uses = /\((\d+)\/day\)/i.exec(a.name);
      const after = d.slice((rv.index ?? 0) + rv[0].length);
      const bs = saveIn(after);
      const br = /within (\d+) feet/i.exec(after);
      out.push({
        kind: 'reviveAtZero',
        hp: /^all/i.test(rv[1]) ? 'full' : (rv[3] ?? rv[2]).replace(/\s/g, ''),
        uses: uses ? Number(uses[1]) : 1,
        burst: bs && br && dmgIn(after).length ? { radiusFt: Number(br[1]), save: bs, damage: dmgIn(after), halfOnSave: /half/i.test(after) || undefined } : undefined,
        from: a.name,
      });
    }
    const range = /critical hit on a roll of (\d+) or 20/i.exec(d);
    if (range) out.push({ kind: 'critRange', min: Number(range[1]), actions: [a.name], from: a.name });
    if (/if the target is grappled by (?:the|it)[^.]*?, the attack is a critical hit/i.test(d)) out.push({ kind: 'autoCrit', when: 'targetGrappledBySelf', actions: [a.name], from: a.name });
    const g = /grappled \(escape DC (\d+)\)/i.exec(d);
    if (g && typeof a.attackBonus === 'number' && !/instead of dealing damage/i.test(d)) {
      const size = /if (?:it is|the target is|it's) an? (tiny|small|medium|large|huge) or smaller/i.exec(d);
      out.push({ kind: 'onHitGrapple', actions: [a.name], escapeDc: Number(g[1]), maxSize: size ? (size[1].toLowerCase() as TokenSize) : undefined, from: a.name });
    }
    const ls = /regains hit points equal to the (?:(\w+) )?damage dealt/i.exec(d);
    if (ls && typeof a.attackBonus === 'number') {
      // "If the target is frightened, … regains hit points equal to the damage dealt" — only then
      const cond = new RegExp(`if the target is (${CONDITIONS.join('|')})[^.]*regains hit points equal`, 'i').exec(d);
      out.push({ kind: 'lifesteal', actions: [a.name], type: ls[1] && ls[1] !== 'the' ? ls[1].toLowerCase() : undefined, ifTargetCondition: cond?.[1].toLowerCase(), from: a.name });
    }
  }
  return out;
}

const REGISTRY = new Map<string, MonsterMechanic[]>();
/** Hand-written mechanics per stat block name (local file). Replaces detection for the same `from`. */
export function registerMonsterMechanics(map: Record<string, MonsterMechanic[]>): void {
  for (const [k, v] of Object.entries(map ?? {})) if (Array.isArray(v)) REGISTRY.set(k.trim().toLowerCase(), v);
}

/** All mechanics of a stat block: detected + registered (registered wins for the same feature). */
export function monsterMechanics(
  sb: { name?: string; id?: string; fromId?: string; traits?: StatblockTrait[]; actions?: SheetAction[] } | undefined,
): MonsterMechanic[] {
  if (!sb) return [];
  // "id:<stat block id>" entries win (two stat blocks may share a name), then the name
  const id = (sb.fromId ?? sb.id ?? '').trim().toLowerCase();
  const local = (id && REGISTRY.get(`id:${id}`)) || REGISTRY.get((sb.name ?? '').trim().toLowerCase()) || [];
  const covered = new Set(local.map((m) => m.from).filter(Boolean));
  return [...detectMechanics(sb).filter((m) => !m.from || !covered.has(m.from)), ...local];
}

const forAction = (m: { actions?: string[] }, actionName: string | undefined) =>
  !m.actions?.length || (!!actionName && m.actions.some((x) => x.toLowerCase() === actionName.toLowerCase()));

export function immuneConditions(mechs: MonsterMechanic[]): string[] {
  return mechs.flatMap((m) => (m.kind === 'conditionImmunity' ? m.conditions : []));
}

/** Advantage on this save from the monster's mechanics? */
export function mechanicSaveAdvantage(
  mechs: MonsterMechanic[],
  ctx: { ability: Ability; magical?: boolean; vsCondition?: string },
): string | null {
  for (const m of mechs) {
    if (m.kind !== 'saveAdvantage') continue;
    if (m.vsMagic && ctx.magical) return m.from ?? 'Magic Resistance';
    if (m.vsConditions?.length && ctx.vsCondition && m.vsConditions.includes(ctx.vsCondition)) return m.from ?? 'lợi thế save';
    if (m.abilities?.includes(ctx.ability)) return m.from ?? 'lợi thế save';
  }
  return null;
}

export const hasEvasion = (mechs: MonsterMechanic[]) => mechs.some((m) => m.kind === 'evasion');

/** Which attack-advantage rules hold, given the battlefield facts the caller worked out. */
export function mechanicAttackAdvantage(
  mechs: MonsterMechanic[],
  facts: { melee: boolean; allyAdjacentToTarget: boolean; targetAdjacentToItsAlly: boolean; targetGrappledBySelf: boolean; targetDamaged: boolean; targetConditions: string[] },
): string[] {
  const why: string[] = [];
  for (const m of mechs) {
    if (m.kind !== 'attackAdvantage' || (m.meleeOnly && !facts.melee)) continue;
    const ok = m.when.some((w) =>
      w === 'allyAdjacentToTarget' ? facts.allyAdjacentToTarget
      : w === 'targetAdjacentToItsAlly' ? facts.targetAdjacentToItsAlly
      : w === 'targetGrappledBySelf' ? facts.targetGrappledBySelf
      : w === 'targetDamaged' ? facts.targetDamaged
      : w.startsWith('targetCondition:') ? facts.targetConditions.includes(w.slice(16))
      : false,
    );
    if (ok) why.push(m.from ?? 'đặc tính');
  }
  return why;
}

export function critMin(mechs: MonsterMechanic[], actionName: string | undefined): number {
  return mechs.reduce((min, m) => (m.kind === 'critRange' && forAction(m, actionName) ? Math.min(min, m.min) : min), 20);
}

export function mechanicAutoCrit(mechs: MonsterMechanic[], actionName: string | undefined, facts: { targetGrappledBySelf: boolean }): string | null {
  const m = mechs.find((x) => x.kind === 'autoCrit' && forAction(x, actionName) && x.when === 'targetGrappledBySelf' && facts.targetGrappledBySelf);
  return m ? (m.from ?? 'tự chí mạng') : null;
}

export function critExtraParts(mechs: MonsterMechanic[], melee: boolean, primaryType: string): { dice: string; type: string; label: string }[] {
  return mechs.flatMap((m) =>
    m.kind === 'critExtraDamage' && (!m.meleeOnly || melee) ? [{ dice: m.dice, type: m.type ?? primaryType, label: m.from ?? 'chí mạng' }] : [],
  );
}

export function onHitGrappleFor(mechs: MonsterMechanic[], actionName: string | undefined) {
  const m = mechs.find((x) => x.kind === 'onHitGrapple' && forAction(x, actionName));
  return m && m.kind === 'onHitGrapple' ? m : null;
}

export function lifestealFor(mechs: MonsterMechanic[], actionName: string | undefined) {
  const m = mechs.find((x) => x.kind === 'lifesteal' && forAction(x, actionName));
  return m && m.kind === 'lifesteal' ? m : null;
}

/** Feature names (traits / actions) some mechanic covers — the "⚙" badge. */
export function automatedFeatures(mechs: MonsterMechanic[]): Set<string> {
  return new Set(mechs.map((m) => (m.from ?? '').toLowerCase()).filter(Boolean));
}

export function mechanicsOfKind<K extends MonsterMechanic['kind']>(mechs: MonsterMechanic[], kind: K): Extract<MonsterMechanic, { kind: K }>[] {
  return mechs.filter((m): m is Extract<MonsterMechanic, { kind: K }> => m.kind === kind);
}

/** Has the regeneration been stopped by damage taken since the creature's last turn? */
export function regenSuppressed(r: { suppressedBy?: string[] }, tookSinceTurn: string[] | undefined): boolean {
  const took = new Set((tookSinceTurn ?? []).map((x) => x.toLowerCase()));
  return !!r.suppressedBy?.some((x) => took.has(x.toLowerCase()));
}


// ---------------------------------------------------------------- light

/** Light where a token stands: its own override, else the scene's; a moon in the sky with no light set = moonlight. */
export function lightAt(room: { light?: SceneLight | null; moon?: unknown }, token: { light?: SceneLight | null } | undefined): SceneLight | undefined {
  return token?.light ?? room.light ?? (room.moon ? 'moon' : undefined);
}

/** Does this light rule hold in `light`? Untracked light (undefined) never triggers anything. */
export function lightRuleHolds(m: { when: 'sun' | 'notMoon' | 'dimOrDark' }, light: SceneLight | undefined): boolean {
  if (!light) return false;
  return m.when === 'sun' ? light === 'sun' : m.when === 'notMoon' ? light !== 'moon' : light === 'dim' || light === 'dark' || light === 'moon';
}

/** The light rules active for a creature, and the d20 kinds they put at disadvantage (with the trait names). */
export function activeLightRules(mechs: MonsterMechanic[], light: SceneLight | undefined) {
  const rules = mechanicsOfKind(mechs, 'light').filter((m) => lightRuleHolds(m, light));
  const dis = (k: 'attack' | 'check' | 'save') => rules.filter((m) => m.disadvantage?.includes(k)).map((m) => m.from ?? 'ánh sáng');
  return { rules, attack: dis('attack'), check: dis('check'), save: dis('save') };
}


// ---------------------------------------------------------------- wave 7

/** Why it rolls initiative with advantage (trait names), given its conditions and whether another of its kind is near. */
export function initiativeAdvantageWhy(mechs: MonsterMechanic[], ctx: { conditions: string[]; sameKindWithin: (ft: number) => boolean }): string[] {
  return mechanicsOfKind(mechs, 'initiativeAdvantage')
    .filter((m) => !m.unless?.some((c) => ctx.conditions.includes(c)) && (!m.nearSameFt || ctx.sameKindWithin(m.nearSameFt)))
    .map((m) => m.from ?? 'initiative');
}

/** AC bonus from its HP thresholds ("fewer than N hit points: +X AC"). */
export function acBonusByHp(mechs: MonsterMechanic[], hp: number | undefined): number {
  if (typeof hp !== 'number') return 0;
  let best = 0;
  for (const m of mechanicsOfKind(mechs, 'acByHp')) for (const s of m.steps) if (hp < s.below && s.bonus > best) best = s.bonus;
  return best;
}

/** Disadvantage on an attack against a creature with these mechanics (trait names). */
export function defenseDisadvantageWhy(mechs: MonsterMechanic[], attack: { ranged: boolean; spell: boolean }): string[] {
  return mechanicsOfKind(mechs, 'defenseDisadvantage')
    .filter((m) => m.vs === 'all' || (m.vs === 'rangedWeapon' && attack.ranged && !attack.spell))
    .map((m) => m.from ?? 'phòng thủ');
}
