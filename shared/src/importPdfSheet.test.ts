import { describe, expect, it } from 'vitest';
import { sheetFromPdfFields, type PdfField } from './importPdfSheet.js';

let n = 0;
const id = () => `id${++n}`;
const T = (name: string, value: string, page = 0, x = 0, y = 0, w = 60, h = 13): PdfField => ({ name, value, page, x, y, w, h });
const C = (name: string, checked: boolean): PdfField => ({ name, checked, page: 0, x: 0, y: 0, w: 6, h: 6 });

// Minimal Druid sheet in the "Sirindoodles" layout (field numbers as in the printed template).
const fields: PdfField[] = [
  T('Infos 12', 'Testroot'), T('Infos 13', 'Druid Circle of the old way'), T('Infos 4', '3'), T('Infos 15', '+2'),
  T('Infos 20', '14'), T('Infos 21', '15'), T('Infos 22', '16'), T('Infos 23', '10'), T('Infos 24', '16'), T('Infos 25', '10'),
  T('Infos 17', '20'), T('Infos 18', '28'), T('Infos 114', '15'), T('Infos 116', '30'), T('Infos 115', '+2'),
  T('Infos 119', '+2'), T('Infos 120', '+2'), T('Infos 121', '+3'), T('Infos 122', '0'), T('Infos 123', '+5'), T('Infos 124', '0'),
  T('Infos 136', '+5'), T('Infos 139', '_+2'), // Perception, Religion
  C('Check Box 19', true), C('Check Box 22', true),
  T('Infos 71', 'Quarterstaff'), T('Infos 79', '+4'), T('Infos 87', '1d6+2 bludgeoning'),
  T('Infos 93', 'Druidcraft\r\nPoison spray'),
  T('Infos 118', 'Wild Shape\r\nDruidic'),
  T('Infos 113', '15'),
  T('Infos 101048', '4 slot', 2, 87, 490, 21, 9), T('Infos 101050', '2 slot', 2, 87, 265, 21, 9),
  T('Infos 101033', 'Shield Faith', 2, 84, 457, 125, 9), // misspelt Shield of Faith
  T('Infos 101065', 'Barkskin', 2, 84, 241, 125, 9),
  T('Infos 101052', '3 slot', 2, 266, 632, 21, 9), T('Infos 101054', '', 2, 243, 433, 21, 9),
  T('Infos 101080', 'Fireball', 2, 261, 613, 108, 9), T('Infos 101091', 'Slow', 2, 239, 481, 130, 9),
];

describe('sheetFromPdfFields', () => {
  it('rejects PDFs that are not this template', () => {
    expect(sheetFromPdfFields([T('Text1', 'x')], 'o', id)).toBeNull();
  });
  const res = sheetFromPdfFields(fields, 'owner', id)!;
  const s = res.sheet;
  it('reads identity, class, abilities, HP, AC', () => {
    expect(s.name).toBe('Testroot');
    expect(s.className).toBe('Druid');
    expect(s.subclass).toBe('Circle of the old way');
    expect(s.level).toBe(3);
    expect(s.abilities).toEqual({ str: 14, dex: 15, con: 16, int: 10, wis: 16, cha: 10 });
    expect([s.maxHp, s.currentHp, s.armorClass, s.speed]).toEqual([28, 20, 15, 30]);
    expect(s.currency.gp).toBe(15);
  });
  it('infers proficiencies from bonuses / check boxes', () => {
    expect(s.saveProficiencies).toEqual(['wis']); // +5 = WIS +3 + PB 2
    expect(s.skillProficiencies.sort()).toEqual(['perception', 'religion']);
  });
  it('reads attacks and features', () => {
    expect(s.actions[0]).toMatchObject({ name: 'Quarterstaff', attackBonus: 4, damage: '1d6+2', damageType: 'bludgeoning' });
    expect(s.features.map((f) => f.name)).toEqual(['Wild Shape', 'Druidic']);
  });
  it('places spells by level, fuzzy-matching names to the SRD DB', () => {
    const byName = Object.fromEntries(s.spells.map((sp) => [sp.name, sp.level]));
    expect(byName['Druidcraft']).toBe(0);
    expect(byName['Shield of Faith']).toBe(1); // typo "Shield Faith" resolved
    expect(byName['Barkskin']).toBe(2);
    expect(byName['Fireball']).toBe(3);
    expect(byName['Slow']).toBe(3);
  });
  it('derives Druid slots from the class table', () => {
    expect(s.spellSlots.find((x) => x.level === 1)?.max).toBe(4);
    expect(s.spellSlots.find((x) => x.level === 2)?.max).toBe(2);
  });
});
