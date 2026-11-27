import type { ReactNode } from 'react';
import {
  ABILITIES,
  CONDITION_VI,
  DAMAGE_TYPE_VI,
  abilityMod,
  initiativeBonus,
  saveBonus,
  skillBonus,
  type CharacterSheet,
  type ConditionType,
  type DamageType,
  type Defenses,
  type Token,
} from '@dnd-table/shared';

/**
 * Pieces of the statblock-style token inspector (see the `.sbx` rules in statblock-card.css): the diamond
 * stat badges, the defences line and the player-character statblock.
 */

const fmtMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * The diamond frame: double rule, dark centre for the numbers, an ornament (a filled wedge with chevrons
 * pointing in) only in each side corner. Drawn for a viewBox `w` units wide so a wider diamond gets more
 * room in the middle instead of stretched ornaments.
 */
function DiamondFrame({ w }: { w: number }) {
  const k = 41.5 / (w / 2 - 9.5); // slope of the inner rule → how tall the ornament can be at its x
  const y = (dx: number) => (dx * k).toFixed(2);
  const tip = (
    <>
      <path d={`M10 50 L26 ${50 - +y(16.5)} L26 ${50 + +y(16.5)} Z`} className="sbx-df-wedge" />
      <path
        d={`M14.5 ${50 - +y(6.7)} L19.5 50 L14.5 ${50 + +y(6.7)} M19 ${50 - +y(10.9)} L24.5 50 L19 ${50 + +y(10.9)}`}
        className="sbx-df-cut"
      />
      <path d={`M29 ${50 - +y(12.8)} L34 50 L29 ${50 + +y(12.8)}`} className="sbx-df-line" />
    </>
  );
  return (
    <svg className="sbx-diamond-frame" viewBox={`0 0 ${w} 100`} preserveAspectRatio="none" aria-hidden>
      <path d={`M${w / 2} 2 L${w - 2} 50 L${w / 2} 98 L2 50 Z`} className="sbx-df-outer" />
      <path d={`M${w / 2} 8.5 L${w - 9.5} 50 L${w / 2} 91.5 L9.5 50 Z`} className="sbx-df-inner" />
      {tip}
      <g transform={`matrix(-1 0 0 1 ${w} 0)`}>{tip}</g>
    </svg>
  );
}

/**
 * A stat in the sheet's diamond frame: label above, value (or inputs) in the middle, an optional unit
 * ("ft") as small text under it. `width` in px; the ornaments keep one size, so a wider diamond just
 * gets a wider clear middle.
 */
export function StatDiamond({
  label,
  title,
  children,
  unit,
  width = 76,
}: {
  label: string;
  title?: string;
  children: ReactNode;
  unit?: ReactNode;
  width?: number;
}) {
  const clear = Math.round(width - 68 * (84 / 120)); // px left between the two side ornaments
  return (
    <div className="sbx-diamond" title={title} style={{ width }}>
      <DiamondFrame w={(width * 120) / 84} />
      <span className="sbx-diamond-label">{label}</span>
      <span className="sbx-diamond-value" style={{ maxWidth: clear }}>
        <span className="sbx-diamond-main">{children}</span>
        {unit && <span className="sbx-diamond-unit">{unit}</span>}
      </span>
    </div>
  );
}

const typeVi = (t: string) => DAMAGE_TYPE_VI[t as DamageType] ?? t;

/** "Kháng: lửa, lạnh · Miễn: độc · Dễ tổn thương: radiant · Giảm 3" — null when there is nothing. */
export function DefenseLine({ defenses }: { defenses?: Defenses }) {
  if (!defenses) return null;
  const rows: [string, string][] = [];
  if (defenses.resistances.length) rows.push(['Kháng', defenses.resistances.map(typeVi).join(', ')]);
  if (defenses.immunities.length) rows.push(['Miễn', defenses.immunities.map(typeVi).join(', ')]);
  if (defenses.vulnerabilities.length) rows.push(['Dễ tổn thương', defenses.vulnerabilities.map(typeVi).join(', ')]);
  if (defenses.damageReduction) rows.push(['Giảm sát thương', String(defenses.damageReduction)]);
  if (defenses.critImmune) rows.push(['Chí mạng', 'tính như đòn thường']);
  for (const c of defenses.conditional ?? []) {
    const kind = c.kind === 'resist' ? 'Kháng' : c.kind === 'immune' ? 'Miễn' : 'Dễ tổn thương';
    rows.push([`${kind} (có điều kiện)`, c.text || c.types.map(typeVi).join(', ')]);
  }
  if (!rows.length) return null;
  return (
    <div className="sbx-lines">
      {rows.map(([k, v]) => (
        <div key={k + v}>
          <b>{k}</b> {v}
        </div>
      ))}
    </div>
  );
}

/** Conditions / effects on the token as small chips (the full editor lives in the status panel). */
export function EffectChips({ token, onOpen }: { token: Token; onOpen: () => void }) {
  const effects = token.effects ?? [];
  if (!effects.length && !token.concentration) return null;
  return (
    <div className="sbx-chips" onClick={onOpen} title="Bấm để mở Trạng thái">
      {token.concentration && <span className="sbx-chip conc">🧠 {token.concentration.name || 'Tập trung'}</span>}
      {effects.map((e) => (
        <span key={e.id} className="sbx-chip">
          {e.condition ? (CONDITION_VI[e.condition as ConditionType] ?? e.name) : e.name}
        </span>
      ))}
    </div>
  );
}

/** A player character in statblock form (from the linked sheet): abilities, saves, the numbers people ask for. */
export function PcStatblock({ sheet }: { sheet: CharacterSheet }) {
  const profSaves = new Set(sheet.saveProficiencies);
  const skills = [...new Set([...sheet.skillProficiencies, ...sheet.skillExpertise])];
  return (
    <div className="sbx-body">
      <div className="sbx-abilities">
        {ABILITIES.map((ab) => (
          <div key={ab} className={`sbx-ab ${profSaves.has(ab) ? 'prof' : ''}`} title={`${ab.toUpperCase()} save ${fmtMod(saveBonus(sheet, ab))}`}>
            <span className="sbx-ab-name">{ab.toUpperCase()}</span>
            <span className="sbx-ab-score">{sheet.abilities[ab]}</span>
            <span className="sbx-ab-mod">{fmtMod(abilityMod(sheet.abilities[ab]))}</span>
            <span className="sbx-ab-save">save {fmtMod(saveBonus(sheet, ab))}</span>
          </div>
        ))}
      </div>
      <div className="sbx-lines">
        <div>
          <b>Proficiency</b> {fmtMod(sheet.proficiencyBonus)} · <b>Initiative</b> {fmtMod(initiativeBonus(sheet))}
          {!sheet.className && <> · <b>Cấp</b> {sheet.level}</>}
        </div>
        <div>
          <b>Quan sát bị động</b> {10 + skillBonus(sheet, 'perception')} · <b>Insight</b> {10 + skillBonus(sheet, 'insight')} · <b>Investigation</b>{' '}
          {10 + skillBonus(sheet, 'investigation')}
        </div>
        {skills.length > 0 && (
          <div>
            <b>Kỹ năng</b> {skills.map((s) => `${s.charAt(0).toUpperCase()}${s.slice(1)} ${fmtMod(skillBonus(sheet, s))}`).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}
