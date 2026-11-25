import { useEffect, useMemo, useState } from 'react';
import {
  SRD_SPELLS,
  sheetClasses,
  spellDefsForSheet,
  spellFromCantrip,
  type CantripDef,
  type CharacterSheet,
  type Spell,
} from '@dnd-table/shared';
import { nanoIdish } from '../../util.js';
import { SearchPicker, type PickItem } from './SearchPicker.js';

/** Names / levels / schools / classes of every SRD spell (levels 0–9), for spells the app has no
 *  automation for yet — they're added as plain entries the player can fill in. */
interface SrdSpellRow {
  name: string;
  level: number;
  school?: string;
  classes?: string[];
}
let srdList: Promise<SrdSpellRow[]> | null = null;
function loadSrdList(): Promise<SrdSpellRow[]> {
  srdList ??= fetch('/srd/spells.json')
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  return srdList;
}

const LEVEL_VI = (n: number) => (n === 0 ? 'Cantrip' : `Cấp ${n}`);

function defHint(c: CantripDef): string {
  const dmg = c.fixedDamage ?? c.damageDie;
  if (c.castKind === 'heal') return c.heal ? `hồi ${c.heal}+mod` : 'hồi máu';
  if (c.castKind === 'rider' && c.rider) return `+${c.rider.dice} ${c.rider.type}`;
  if (dmg) return `${dmg}${c.damageType ? ' ' + c.damageType : ''}${c.area ? ' · ' + c.area : ''}`;
  return c.save ? `save ${c.save.toUpperCase()}${c.area ? ' · ' + c.area : ''}` : c.area ?? '';
}

/**
 * One spell picker for every level (was: four separate cantrip / 1 / 2 / 3 boxes and a bare
 * "+ Thêm phép"). Search by name, school or class; level chips; your classes' spells first.
 * Spells with automation (damage, save, healing wired up) are marked ⚔; SRD spells above level 3
 * come in as plain entries (○) to fill in by hand. "Phép tự chế" adds a blank one at the chosen level.
 */
export function SpellAdder({ draft, onAdd }: { draft: CharacterSheet; onAdd: (sp: Spell) => void }) {
  const [srd, setSrd] = useState<SrdSpellRow[]>([]);
  useEffect(() => {
    let live = true;
    void loadSrdList().then((l) => live && setSrd(l));
    return () => {
      live = false;
    };
  }, []);

  const have = new Set((draft.spells ?? []).map((s) => s.name.toLowerCase()));
  const myClasses = sheetClasses(draft).map((c) => (c.name ?? '').toLowerCase().trim()).filter(Boolean);

  const items = useMemo(() => {
    const { own, others } = spellDefsForSheet(draft, SRD_SPELLS);
    // automated entries, by name and alias ("Acid Arrow" = "Melf's Acid Arrow"), so none shows twice
    const known = new Set(SRD_SPELLS.flatMap((d) => [d.name, ...(d.aliases ?? [])].map((n) => n.toLowerCase())));
    const auto = (d: CantripDef, mine: boolean): PickItem => ({
      key: `def:${d.id}`,
      name: d.name,
      mark: d.combat ? '⚔' : '•',
      hint: `${LEVEL_VI(d.level ?? 0)} · ${d.school}${defHint(d) ? ' · ' + defHint(d) : ''}`,
      detail: d.guidance,
      group: mine ? 'Theo nghề của bạn' : 'Nghề khác',
      keywords: [d.school, ...d.classes, ...(d.aliases ?? [])],
      tags: [String(d.level ?? 0)],
      disabled: have.has(d.name.toLowerCase()),
    });
    const plain = srd
      .filter((r) => !known.has(r.name.toLowerCase()))
      .map((r) => {
        const cls = (r.classes ?? []).map((c) => c.toLowerCase());
        const mine = cls.some((c) => myClasses.some((m) => m.includes(c) || c.includes(m)));
        return {
          mine,
          item: {
            key: `srd:${r.name}`,
            name: r.name,
            mark: '○',
            hint: `${LEVEL_VI(r.level)}${r.school ? ' · ' + r.school : ''} · tự điền`,
            detail: `Chưa có tự động hóa: thêm vào danh sách, rồi bấm ✎ để điền sát thương / save nếu cần. Class: ${(r.classes ?? []).join(', ') || '—'}.`,
            group: mine ? 'Theo nghề của bạn' : 'Nghề khác',
            keywords: [r.school ?? '', ...(r.classes ?? [])],
            tags: [String(r.level)],
            disabled: have.has(r.name.toLowerCase()),
          } as PickItem,
        };
      });
    const byLevel = (a: PickItem, b: PickItem) => Number(a.tags![0]) - Number(b.tags![0]) || a.name.localeCompare(b.name);
    const mine = [...own.map((d) => auto(d, true)), ...plain.filter((p) => p.mine).map((p) => p.item)].sort(byLevel);
    const rest = [...others.map((d) => auto(d, false)), ...plain.filter((p) => !p.mine).map((p) => p.item)].sort(byLevel);
    return [...mine, ...rest];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, srd]);

  function pick(it: PickItem) {
    if (it.key.startsWith('def:')) {
      const d = SRD_SPELLS.find((x) => `def:${x.id}` === it.key)!;
      onAdd(spellFromCantrip(d, draft, nanoIdish()));
      return;
    }
    const r = srd.find((x) => `srd:${x.name}` === it.key)!;
    onAdd({ id: nanoIdish(), name: r.name, level: r.level, school: r.school, prepared: r.level === 0, castKind: 'utility', concentration: false });
  }

  return (
    <SearchPicker
      title="+ Thêm phép"
      items={items}
      placeholder="Tìm tên, trường phái, class…"
      chips={Array.from({ length: 10 }, (_, n) => ({ value: String(n), label: n === 0 ? 'Cantrip' : String(n) }))}
      onPick={pick}
      footer={
        <span className="hint">
          ⚔ có tự động hóa · • tiện ích · ○ chỉ có tên (tự điền).{' '}
          <button
            className="link"
            onClick={() => onAdd({ id: nanoIdish(), name: 'Phép tự chế', level: 1, prepared: false, castKind: 'utility', concentration: false })}
          >
            + Phép tự chế
          </button>
        </span>
      }
    />
  );
}
