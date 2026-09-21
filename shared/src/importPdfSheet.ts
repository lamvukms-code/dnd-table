import { SKILLS } from './types.js';
import type { Ability, CharacterSheet, Feature, InventoryItem, SheetAction, Spell } from './types.js';
import { computeSpellSlots, abilityMod, emptyCurrency } from './rules.js';
import { withClassSaves } from './classDefaults.js';
import { SRD_SPELLS, spellFromCantrip } from './cantrips.js';
import { SIRINDOODLES_GEOMETRY } from './sirindoodlesGeometry.js';

/**
 * Read a filled-in fillable-PDF character sheet ("Sirindoodles" 5e layout: text fields named
 * "Infos N", check boxes "Check Box N") into a CharacterSheet. The PDF's field *names* carry no
 * meaning, so the mapping is by field number / on-page position for this specific template.
 * Extraction of the raw fields from the PDF file happens in the client (pdf-lib).
 */
export interface PdfField {
  name: string;
  value?: string;
  checked?: boolean;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfSheetResult {
  sheet: CharacterSheet;
  /** What was read / what could not be matched, for showing to the player. */
  report: string[];
}

const ABIL: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
/** Skill order printed on the sheet (alphabetical). */
const SKILL_ORDER = [
  'acrobatics', 'animal-handling', 'arcana', 'athletics', 'deception', 'history', 'insight',
  'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion',
  'religion', 'sleight-of-hand', 'stealth', 'survival',
];
const CLASSES = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard', 'Artificer'];

/** Spell-level header boxes ("4 slot"): field name → level, and the column the list sits in. */
const LEVEL_HEADERS: { level: number; field: string; col: 'A' | 'B' | 'C' }[] = [
  { level: 1, field: 'Infos 101048', col: 'A' },
  { level: 2, field: 'Infos 101050', col: 'A' },
  { level: 3, field: 'Infos 101052', col: 'B' },
  { level: 4, field: 'Infos 101054', col: 'B' },
  { level: 5, field: 'Infos 101056', col: 'B' },
  { level: 6, field: 'Infos 101058', col: 'C' },
  { level: 7, field: 'Infos 101060', col: 'C' },
  { level: 8, field: 'Infos 101062', col: 'C' },
  { level: 9, field: 'Infos 101064', col: 'C' },
];
const COL_X: Record<'A' | 'B' | 'C', [number, number]> = { A: [70, 225], B: [230, 380], C: [385, 540] };

export function isSirindoodlesSheet(fields: PdfField[]): boolean {
  const names = new Set(fields.map((f) => f.name));
  return names.has('Infos 12') && names.has('Infos 20') && names.has('Infos 101048') && names.has('Infos 119');
}

const geoName = (k: string) => (k.startsWith('I') ? `Infos ${k.slice(1)}` : `Check Box ${k.slice(1)}`);

/**
 * A newer revision of the same template (players' "Phil Jacques" sheet): same boxes, but the layout was reworked —
 * fields are numbered +1 in most lists and some boxes moved by up to ~50 points, so neither the numbers nor absolute
 * positions can be trusted. Two passes map every field back onto the names the importer knows:
 *  1. vertical lists (saves, skills, ability scores, check-box columns…): same column + same number of rows →
 *     k-th from the top ↔ k-th from the top;
 *  2. everything else: nearest box on the same page (best pair first).
 * The fields keep their own on-page rectangle (the spell-column logic reads it). Returns null when the sheet doesn't
 * resemble the template (fewer than 85% of fields map).
 */
export function remapSirindoodlesV2(fields: PdfField[]): PdfField[] | null {
  type Ref = { name: string; page: number; x: number; y: number; w: number; h: number; chk: boolean };
  const refs: Ref[] = SIRINDOODLES_GEOMETRY.map(([k, page, x, y, w, h]) => ({ name: geoName(k), page, x, y, w, h, chk: k[0] === 'C' }));
  const chkOf = (f: PdfField) => f.checked !== undefined;
  const cluster = <T extends { page: number; x: number; w: number; h: number }>(items: T[], chk: (t: T) => boolean) => {
    const cl: { page: number; chk: boolean; x: number; w: number; h: number; items: T[] }[] = [];
    for (const it of items) {
      const c = cl.find((k) => k.page === it.page && k.chk === chk(it) && Math.abs(k.x - it.x) <= 3 && Math.abs(k.w - it.w) <= 3 && Math.abs(k.h - it.h) <= 3);
      if (c) c.items.push(it);
      else cl.push({ page: it.page, chk: chk(it), x: it.x, w: it.w, h: it.h, items: [it] });
    }
    return cl;
  };
  const cf = cluster(fields, chkOf);
  const cr = cluster(refs, (r) => r.chk);
  for (const c of [...cf, ...cr]) c.items.sort((p, q) => q.y - p.y);

  const mapped = new Map<PdfField, Ref>();
  const usedRef = new Set<Ref>();
  const usedCl = new Set<(typeof cr)[number]>();
  for (const c of cf.filter((k) => k.items.length >= 3)) {
    const cand = cr
      .filter((k) => !usedCl.has(k) && k.page === c.page && k.chk === c.chk && k.items.length === c.items.length)
      .map((k) => ({ k, d: Math.abs(k.x - c.x) + Math.abs(k.w - c.w) + Math.abs(k.h - c.h) + Math.abs(k.items[0].y - c.items[0].y) / 10 }))
      .sort((p, q) => p.d - q.d)[0];
    if (!cand || cand.d >= 40) continue;
    usedCl.add(cand.k);
    c.items.forEach((fl, i) => {
      mapped.set(fl, cand.k.items[i]);
      usedRef.add(cand.k.items[i]);
    });
  }
  const pairs: [number, PdfField, Ref][] = [];
  for (const fl of fields) {
    if (mapped.has(fl)) continue;
    for (const r of refs) {
      if (usedRef.has(r) || r.page !== fl.page || r.chk !== chkOf(fl)) continue;
      const d = Math.abs(r.x - fl.x) + Math.abs(r.y - fl.y) + Math.abs(r.w - fl.w) + Math.abs(r.h - fl.h);
      if (d <= 45) pairs.push([d, fl, r]);
    }
  }
  pairs.sort((p, q) => p[0] - q[0]);
  for (const [, fl, r] of pairs) {
    if (mapped.has(fl) || usedRef.has(r)) continue;
    mapped.set(fl, r);
    usedRef.add(r);
  }
  const out = [...mapped].map(([fl, r]) => ({ ...fl, name: r.name }));
  return out.length >= fields.length * 0.85 && out.length >= refs.length * 0.85 ? out : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Find the SRD spell def a player's (possibly misspelt) entry refers to. */
function findSpellDef(name: string, level: number) {
  const key = norm(name);
  if (!key) return undefined;
  const tol = Math.max(2, Math.floor(key.length * 0.2));
  const best = (pool: typeof SRD_SPELLS) => {
    const exact = pool.find((s) => [s.name, ...(s.aliases ?? [])].some((n) => norm(n) === key));
    if (exact) return exact;
    const near = pool.map((s) => ({ s, d: lev(norm(s.name), key) })).sort((a, b) => a.d - b.d)[0];
    return near && near.d <= tol ? near.s : undefined;
  };
  // Prefer the level the player wrote it under; players sometimes file a cantrip under level 1.
  return best(SRD_SPELLS.filter((s) => (s.level ?? 0) === level)) ?? best(SRD_SPELLS);
}

const num = (s: string | undefined): number | null => {
  if (!s) return null;
  const m = /[+-]?\s*\d+/.exec(s.replace(/[−–]/g, '-').replace(/_/g, ''));
  return m ? Number(m[0].replace(/\s/g, '')) : null;
};
const lines = (s: string | undefined): string[] =>
  (s ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const pbForLevel = (lvl: number) => 2 + Math.floor((Math.max(1, lvl) - 1) / 4);

export function sheetFromPdfFields(
  fields: PdfField[],
  ownerId: string,
  newId: () => string,
): PdfSheetResult | null {
  let remapped = false;
  if (!isSirindoodlesSheet(fields)) {
    const re = remapSirindoodlesV2(fields);
    if (!re || !isSirindoodlesSheet(re)) return null;
    fields = re;
    remapped = true;
  }
  const byName = new Map(fields.map((f) => [f.name, f]));
  const t = (n: number | string): string => (byName.get(typeof n === 'number' ? `Infos ${n}` : n)?.value ?? '').trim();
  const checked = (n: number) => !!byName.get(`Check Box ${n}`)?.checked;
  const report: string[] = remapped ? ['Mẫu phiếu bản mới (số ô lệch +1) — đã ánh xạ theo vị trí ô về mẫu chuẩn'] : [];

  // --- identity / class ---
  const name = t(12) || 'Nhân vật nhập từ PDF';
  const classText = t(13);
  const cls = CLASSES.find((c) => classText.toLowerCase().startsWith(c.toLowerCase()));
  const className = cls ?? classText;
  const subclass = cls ? classText.slice(cls.length).replace(/^[\s\-–(),:]+|[\s)]+$/g, '') : '';
  const level = Math.max(1, Math.min(20, num(t(4)) ?? 1));
  const proficiencyBonus = num(t(15)) ?? pbForLevel(level);

  const abilities = {} as Record<Ability, number>;
  ABIL.forEach((a, i) => {
    abilities[a] = num(t(20 + i)) ?? 10;
  });

  const saveProficiencies: Ability[] = [];
  ABIL.forEach((a, i) => {
    const bonus = num(t(119 + i));
    const mod = abilityMod(abilities[a]);
    if (checked(2 + i) || (bonus !== null && bonus >= mod + proficiencyBonus)) saveProficiencies.push(a);
  });

  const skillProficiencies: string[] = [];
  const skillExpertise: string[] = [];
  SKILL_ORDER.forEach((sk, i) => {
    const bonus = num(t(125 + i));
    const mod = abilityMod(abilities[SKILLS[sk]]);
    const isChecked = checked(8 + i);
    if (bonus !== null && bonus >= mod + 2 * proficiencyBonus && proficiencyBonus > 0) {
      skillProficiencies.push(sk);
      skillExpertise.push(sk);
    } else if (isChecked || (bonus !== null && bonus >= mod + proficiencyBonus)) skillProficiencies.push(sk);
  });

  const maxHp = num(t(18)) ?? num(t(17)) ?? 10;
  const currentHp = num(t(17)) ?? maxHp;
  const dexMod = abilityMod(abilities.dex);
  const initTotal = num(t(115));
  const printedAc = num(t(114));

  // --- attacks (4 rows: name / bonus / damage) ---
  const actions: SheetAction[] = [];
  [71, 72, 73, 74].forEach((nameId, i) => {
    const an = t(nameId);
    if (!an) return;
    const atk = num(t(79 + i));
    const dmgText = t(87 + i);
    const dm = /(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*([A-Za-z]*)/.exec(dmgText);
    actions.push({
      id: newId(),
      name: an,
      actionType: 'action',
      attackBonus: atk ?? undefined,
      damage: dm ? dm[1].replace(/\s+/g, '') : undefined,
      damageType: dm && dm[2] ? dm[2].toLowerCase() : undefined,
      description: dm ? undefined : dmgText || undefined,
      source: 'manual',
    });
  });

  // --- features, equipment, coins ---
  const features: Feature[] = lines(t(118)).map((l) => ({
    id: newId(),
    name: l.length > 60 ? `${l.slice(0, 57)}…` : l,
    source: 'PDF',
    description: l.length > 60 ? l : '',
  }));
  const inventory: InventoryItem[] = lines(t(117)).map((l) => ({
    id: newId(),
    name: l,
    type: 'gear',
    quantity: 1,
    weight: 0,
    equipped: false,
    notes: '',
  }));
  const currency = emptyCurrency();
  currency.cp = num(t(32)) ?? 0;
  currency.sp = num(t(111)) ?? 0;
  currency.ep = num(t(112)) ?? 0;
  currency.gp = num(t(113)) ?? 0;
  currency.pp = num(t(149)) ?? 0;

  // --- notes: everything else worth keeping ---
  const noteBits: [string, string][] = [
    ['Chủng tộc', t(2)],
    ['Xuất thân', t(7)],
    ['Người chơi', t(3)],
    ['Alignment', t(5)],
    ['Mắt & tóc', t(8)],
    ['Tuổi', t(10)],
    ['Cao & nặng', t(9)],
    ['Nét tính cách', t(143)],
    ['Lý tưởng', t(144)],
    ['Ràng buộc', t(145)],
    ['Khuyết điểm', t(146)],
    ['Ngôn ngữ & thành thạo khác', t(94)],
    ['Tiểu sử', t(38)],
    ['Ngoại hình', t(40)],
    ['Đồng minh & tổ chức', t(41)],
    ['Kho báu', t(43)],
    ['Ghi chú', t(42)],
    ['Đặc điểm bổ sung', t(91)],
  ];
  const notes = noteBits
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const sheet: CharacterSheet = {
    id: newId(),
    ownerId,
    name,
    className,
    level,
    proficiencyBonus,
    subclass: subclass || undefined,
    abilities,
    saveProficiencies,
    skillProficiencies,
    skillExpertise,
    maxHp,
    currentHp: Math.min(currentHp, maxHp),
    tempHp: num(t(19)) ?? 0,
    armorClass: num(t(114)) ?? 10,
    // the AC printed on the sheet wins: the inventory is plain text, so armor / shield / spells can't be derived from it
    acOverride: printedAc !== null && printedAc !== 10 + dexMod ? printedAc : null,
    speed: num(t(116)) ?? 30,
    initiativeMisc: initTotal === null ? 0 : initTotal - dexMod,
    actions,
    damageRiders: [],
    resources: [],
    spellSlots: [],
    spells: [],
    feats: [],
    features,
    inventory,
    currency,
    notes,
  };
  // The player's printed "SP CASTING ABILITY" (if it names an ability) wins over the class default.
  const ab = ABIL.find((a) => {
    const v = t('Infos 10101033').toLowerCase();
    return v.startsWith(a) || v.startsWith({ str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma' }[a]);
  });
  if (ab) sheet.spellcastingAbility = ab;

  // Players rarely tick their saves: the class defines them, so fill those in.
  const withSaves = withClassSaves(sheet);
  if (withSaves.length !== sheet.saveProficiencies.length) {
    sheet.saveProficiencies = withSaves;
    report.push("Save thành thạo lấy theo class: " + withSaves.map((a) => a.toUpperCase()).join(", "));
  }

  // --- spells ---
  const addSpell = (spellName: string, lvl: number) => {
    const nm = spellName.trim();
    if (!nm) return;
    const def = findSpellDef(nm, lvl);
    if (!def && (nm.length > 32 || / (per|long rest|short rest)( |$)/i.test(nm))) {
      // a remark the player typed into a spell box, not a spell name
      sheet.notes += (sheet.notes ? String.fromCharCode(10) : '') + 'Ghi chú (ô phép): ' + nm;
      return;
    }
    const sp: Spell = def
      ? spellFromCantrip(def, sheet, newId())
      : { id: newId(), name: nm, level: lvl, prepared: true, castKind: 'utility', notes: 'Nhập từ PDF — chưa có dữ liệu tự động.' };
    sheet.spells.push(sp);
    if (!def) report.push(`Phép "${nm}" chưa có trong DB → thêm dạng ghi chú`);
  };
  lines(t(93)).forEach((l) => addSpell(l, 0));

  const spellSlotsFromPdf: { level: number; max: number }[] = [];
  for (const h of LEVEL_HEADERS) {
    const head = byName.get(h.field);
    if (!head) continue;
    const slots = num(head.value);
    if (slots && slots > 0) spellSlotsFromPdf.push({ level: h.level, max: slots });
    const [x0, x1] = COL_X[h.col];
    const nextY = LEVEL_HEADERS.filter((o) => o.col === h.col && byName.get(o.field) && byName.get(o.field)!.y < head.y)
      .map((o) => byName.get(o.field)!.y)
      .sort((a, b) => b - a)[0] ?? -Infinity;
    for (const f of fields) {
      if (f.page !== head.page || !f.value || f.h > 10 || f.w < 100) continue;
      if (f.x < x0 || f.x > x1) continue;
      if (Math.abs(f.y - head.y) < 4) continue; // header row itself
      if (f.y < head.y && f.y > nextY) addSpell(f.value, h.level);
    }
  }

  const derived = computeSpellSlots(sheet);
  if (derived.length) sheet.spellSlots = derived;
  else if (spellSlotsFromPdf.length) sheet.spellSlots = spellSlotsFromPdf.map((s) => ({ level: s.level, max: s.max, used: 0 }));

  report.unshift(
    `${name} — ${className || '?'}${subclass ? ` (${subclass})` : ''} cấp ${level}`,
    `HP ${sheet.currentHp}/${maxHp} · AC ${sheet.armorClass} · Speed ${sheet.speed}`,
    `${saveProficiencies.length} save, ${skillProficiencies.length} kỹ năng thành thạo, ${sheet.spells.length} phép, ${actions.length} đòn, ${features.length} đặc điểm, ${inventory.length} món đồ`,
  );
  return { sheet, report };
}
