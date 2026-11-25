import { describe, expect, it } from 'vitest';
import type { SheetAction } from './types.js';
import { parseMultiattack, multiattackOptions, multiTargetSpec, parseSpellList, summonSpec } from './monsterActions.js';

const act = (id: string, name: string, description = '', attackBonus?: number): SheetAction =>
  ({ id, name, description, attackBonus, actionType: 'action' }) as SheetAction;

describe('multiattack options, multi-target, summons', () => {
  const bite = act('b', 'Bite', '', 5);
  const claw = act('c', 'Claw', '', 5);
  const roar = act('r', 'Frightful Roar', 'Each creature of its choice must make a DC 13 Wisdom saving throw.');
  const tent = act('t', 'Tentacle', '', 6);

  it('reads swaps and pre-steps', () => {
    const multi = act('m', 'Multiattack', 'The beast uses its Frightful Roar. It then makes two Claw attacks. It can replace one attack with a Bite attack.');
    const o = multiattackOptions(multi.description, [multi, bite, claw, roar]);
    expect(o.swaps.map((a) => a.name)).toEqual(['Bite']);
    expect(o.pre.map((a) => a.name)).toEqual(['Frightful Roar']);
  });

  it('"only one of which can be with its bite" + free choice', () => {
    const multi = act('m', 'Multiattack', 'The hound makes three attacks, only one of which can be with its bite.');
    expect(parseMultiattack(multi.description, [multi, bite, tent]).map((x) => [x.name, x.count])).toEqual([['Bite', 1], ['Tentacle', 2]]);
    expect(multiattackOptions(multi.description, [multi, bite, tent]).swaps.map((a) => a.name)).toEqual(['Bite', 'Tentacle']);
  });

  it('finds a multi-target attack', () => {
    const lash = act('l', 'Lashing Tendrils', 'The creature makes a tentacle attack against up to four creatures it can see.');
    expect(multiTargetSpec(lash, [lash, tent])).toEqual({ attack: tent, max: 4 });
    expect(multiTargetSpec(bite, [bite])).toBeNull();
  });

  it('matches summons to bestiary names', () => {
    const names = ['Wolf', 'Wight', "Will-o'-Wisp", 'Raven'];
    expect(summonSpec(act('s', 'Call Hounds', 'It summons three hunting hounds (use the Wolf stat block) that appear within 30 feet.'), names)).toEqual({ count: '3', name: 'Wolf' });
    expect(summonSpec(act('s', 'Raise', 'It summons two wights in unoccupied spaces.'), names)).toEqual({ count: '2', name: 'Wight' });
    expect(summonSpec(act('s', 'Lure', "It lets out 1d4 will-o'-wisps."), names)).toEqual({ count: '1d4', name: "Will-o'-Wisp" });
    expect(summonSpec(act('s', 'Shriek', 'It creates a burst of sound.'), names)).toBeNull();
  });
});

describe('monster spell lists', () => {
  const db = new Set(['detect magic', 'hold person', 'fireball', 'polymorph', 'cure wounds', 'bless', 'mage hand']);
  const isSpell = (n: string) => db.has(n.toLowerCase());

  it('reads at will / per day with DC and attack', () => {
    const r = parseSpellList(
      'The mage casts one of the following spells (spell save DC 15, +7 to hit with spell attacks): At Will: Detect Magic, Mage Hand 2/Day Each: Fireball, Hold Person 1/Day: Polymorph. Afterward it rests.',
      isSpell,
    );
    expect(r.dc).toBe(15);
    expect(r.attack).toBe(7);
    expect(r.entries).toEqual([
      { name: 'Detect Magic' },
      { name: 'Mage Hand' },
      { name: 'Fireball', perDay: 2 },
      { name: 'Hold Person', perDay: 2 },
      { name: 'Polymorph', perDay: 1 },
    ]);
  });

  it('reads slots and keeps short homebrew names', () => {
    const r = parseSpellList('1st level (4 slots): cure wounds, bless, Grave Whisper', isSpell);
    expect(r.entries).toEqual([
      { name: 'cure wounds', slotLevel: 1, slots: 4 },
      { name: 'bless', slotLevel: 1, slots: 4 },
      { name: 'Grave Whisper', slotLevel: 1, slots: 4 },
    ]);
  });
  it('reads the Vietnamese wording', () => {
    const r = parseSpellList('INT (spell save DC 14, +6 to hit). Cantrips: mage hand. Cấp 1 (4 slot): cure wounds, bless. 2/ngày mỗi phép: fireball, hold person ("Quỳ!").', isSpell);
    expect(r.dc).toBe(14);
    expect(r.attack).toBe(6);
    expect(r.entries.map((e) => [e.name, e.perDay ?? e.slotLevel ?? 0])).toEqual([
      ['mage hand', 0],
      ['cure wounds', 1],
      ['bless', 1],
      ['fireball', 2],
      ['hold person', 2],
    ]);
  });
});
