import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CharacterSheet, Participant } from '@dnd-table/shared';
import { Room } from './room.js';

const dm: Participant = { id: 'dm', name: 'DM', role: 'dm', connected: true } as Participant;
const p1: Participant = { id: 'p1', name: 'An', role: 'player', connected: true } as Participant;

function sheet(feats: string[] = []): CharacterSheet {
  return {
    id: 'pc', ownerId: 'p1', name: 'Pc', className: 'Fighter', level: 3, classes: [{ name: 'Fighter', level: 3 }],
    abilities: { str: 10, dex: 18, con: 10, int: 10, wis: 10, cha: 10 }, proficiencyBonus: 2, saveProficiencies: [],
    skillProficiencies: [], skillExpertise: [], currentHp: 20, maxHp: 20, tempHp: 0, speed: 30, acOverride: null, inventory: [],
    actions: [], damageRiders: [], resources: [], spellSlots: [], spells: [], features: [],
    feats: feats.map((name, i) => ({ id: `f${i}`, name, description: '' })),
    currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, notes: '',
  } as unknown as CharacterSheet;
}
function setup(feats: string[] = []) {
  const room = new Room(join(mkdtempSync(join(tmpdir(), 'room-free-')), 'room.json'), join(tmpdir(), 'none-bestiary.json'));
  room.state.participants.push(dm, p1);
  room.state.sheets.push(sheet(feats));
  return room;
}
const d20 = (nat: number, bonus = 6) => ({ attack: { total: nat + bonus, faces: [nat], d20Natural: nat, source: 'dddice' as const } });
const shoot = (room: Room, nat: number) =>
  room.apply(p1, { t: 'attack', label: 'Pc · Rifle (đánh)', attackNotation: '1d20+6', damageParts: [{ dice: '1d10+4', type: 'piercing' }], attackerSheetId: 'pc', attackRange: 'ranged', attackKind: 'weapon', external: d20(nat) });
const last = (room: Room, n = 1) => room.state.rollLog.slice(-n);

describe('attack with no target picked', () => {
  it('rolls the attack and its damage "if it hits"; a natural 20 is the house crit (dice maxed + one more)', () => {
    const room = setup();
    expect(shoot(room, 12)).toBeNull();
    const [atk, dmg] = last(room, 2);
    expect(atk.result.total).toBe(18);
    expect(dmg.label).toContain('sát thương nếu trúng');
    expect(dmg.result.terms.filter((t) => t.kind === 'dice').reduce((n, t) => n + (t.rolls?.length ?? 0), 0)).toBe(1);
    shoot(room, 20);
    const [crit, critDmg] = last(room, 2);
    expect(crit.label).toContain('CHÍ MẠNG');
    expect(critDmg.label).toContain('chí mạng');
    // 1d10+4 → 1d10 + 14 (the d10 maxed + the +4, one more d10 rolled): 15..24
    expect(critDmg.result.total).toBeGreaterThanOrEqual(15);
    expect(critDmg.result.total).toBeLessThanOrEqual(24);
  });

  it('a natural 1 rolls no damage (control: the log grows by one entry only)', () => {
    const room = setup();
    const before = room.state.rollLog.length;
    shoot(room, 1);
    expect(room.state.rollLog.length).toBe(before + 1);
    expect(last(room)[0].label).toContain('trượt');
  });

  it('Savage Attacker: every attack out of combat; once per turn in combat', () => {
    const room = setup(['Savage Attacker']);
    shoot(room, 12);
    expect(last(room)[0].label).toContain('Savage Attacker');
    shoot(room, 12);
    expect(last(room)[0].label).toContain('Savage Attacker'); // no turns out of combat
    // in combat, with a token: the second attack of the turn has no Savage
    room.apply(p1, { t: 'addToken', token: { label: 'Pc', x: 0, y: 0, color: '#fff' } });
    const tk = room.state.tokens[0];
    room.apply(p1, { t: 'upsertSheet', sheet: { ...room.state.sheets[0], tokenId: tk.id } });
    room.state.initiative.running = true;
    shoot(room, 12);
    expect(last(room)[0].label).toContain('Savage Attacker');
    shoot(room, 12);
    expect(last(room)[0].label).not.toContain('Savage Attacker');
  });

  it('a damage roll with no target can be rolled twice, keeping the higher (Savage on the dmg button)', () => {
    const room = setup(['Savage Attacker']);
    room.apply(p1, { t: 'roll', label: 'Pc · Rifle (sát thương)', notation: '1d10+4', best2: { why: 'Savage Attacker', sheetId: 'pc' } });
    const e = last(room)[0];
    const m = /Savage Attacker: (\d+) \/ (\d+) → lấy (\d+)/.exec(e.label);
    expect(m).not.toBeNull();
    expect(Number(m![3])).toBe(Math.max(Number(m![1]), Number(m![2])));
    expect(e.result.total).toBe(Number(m![3]));
  });
});
