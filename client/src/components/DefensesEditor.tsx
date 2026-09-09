import {
  DAMAGE_TYPES,
  DAMAGE_TYPE_VI,
  emptyDefenses,
  type DamagePart,
  type DamageRider,
  type DamageType,
  type Defenses,
} from '@dnd-table/shared';
import { nanoIdish } from '../util.js';
import { FormulaHint } from './FormulaHint.js';

/** A damage-type <select> (13 5e types + free text passthrough). */
export function DamageTypeSelect({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const known = (DAMAGE_TYPES as readonly string[]).includes((value ?? '').toLowerCase());
  return (
    <select
      className="dmg-type-select"
      value={known ? (value ?? '').toLowerCase() : value ? '__other' : ''}
      onChange={(e) => {
        if (e.target.value === '__other') return;
        onChange(e.target.value || undefined);
      }}
      title="Loại sát thương (để tính kháng/miễn)"
    >
      <option value="">— loại dmg —</option>
      {DAMAGE_TYPES.map((t) => (
        <option key={t} value={t}>
          {DAMAGE_TYPE_VI[t]}
        </option>
      ))}
      {!known && value ? <option value="__other">{value}</option> : null}
    </select>
  );
}

/** Editor for a list of extra damage parts (each: dice + type + optional label). */
export function ExtraDamageEditor({
  parts,
  onChange,
  labelPlaceholder = 'nguồn (tùy chọn)',
}: {
  parts: DamagePart[] | undefined;
  onChange: (p: DamagePart[]) => void;
  labelPlaceholder?: string;
}) {
  const list = parts ?? [];
  const upd = (i: number, patch: Partial<DamagePart>) =>
    onChange(list.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="extra-dmg">
      {list.map((p, i) => (
        <div key={i} className="xd-row">
          <input
            className="xd-dice"
            placeholder="1d4"
            value={p.dice}
            onChange={(e) => upd(i, { dice: e.target.value })}
          />
          <DamageTypeSelect value={p.type} onChange={(v) => upd(i, { type: v ?? '' })} />
          <input
            className="xd-label"
            placeholder={labelPlaceholder}
            value={p.label ?? ''}
            onChange={(e) => upd(i, { label: e.target.value || undefined })}
          />
          <FormulaHint notation={p.dice} />
          <button className="link" onClick={() => onChange(list.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button
        className="link"
        onClick={() => onChange([...list, { dice: '1d6', type: 'fire' }])}
      >
        + nguồn sát thương
      </button>
    </div>
  );
}

/** Editor for standing damage riders on a character sheet (magic ring, feature…). */
export function DamageRidersEditor({
  riders,
  onChange,
}: {
  riders: DamageRider[];
  onChange: (r: DamageRider[]) => void;
}) {
  const upd = (id: string, patch: Partial<DamageRider>) =>
    onChange(riders.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <div className="riders">
      {riders.map((r) => (
        <div key={r.id} className="rider-row">
          <input
            type="checkbox"
            checked={r.enabled}
            title="Bật/tắt"
            onChange={(e) => upd(r.id, { enabled: e.target.checked })}
          />
          <input
            className="rider-name"
            placeholder="Tên (Ring of fire…)"
            value={r.name}
            onChange={(e) => upd(r.id, { name: e.target.value })}
          />
          <input
            className="xd-dice"
            placeholder="1d4"
            value={r.dice}
            onChange={(e) => upd(r.id, { dice: e.target.value })}
          />
          <DamageTypeSelect value={r.type} onChange={(v) => upd(r.id, { type: v ?? '' })} />
          <select
            className="rider-scope"
            value={r.scope ?? 'weapon'}
            title="Đòn nào được cộng: vũ khí, phép, hay cả hai"
            onChange={(e) => upd(r.id, { scope: e.target.value as DamageRider['scope'] })}
          >
            <option value="weapon">đòn vũ khí</option>
            <option value="spell">đòn phép</option>
            <option value="any">cả hai</option>
          </select>
          <button className="link" onClick={() => onChange(riders.filter((x) => x.id !== r.id))}>
            ✕
          </button>
        </div>
      ))}
      <button
        className="link"
        onClick={() =>
          onChange([
            ...riders,
            { id: nanoIdish(), name: 'Nguồn mới', dice: '1d4', type: 'fire', enabled: true },
          ])
        }
      >
        + rider
      </button>
    </div>
  );
}

const ROWS: { key: 'resistances' | 'immunities' | 'vulnerabilities'; label: string }[] = [
  { key: 'resistances', label: 'Kháng (÷2)' },
  { key: 'immunities', label: 'Miễn (×0)' },
  { key: 'vulnerabilities', label: 'Yếu điểm (×2)' },
];

export function DefensesEditor({
  defenses,
  onChange,
}: {
  defenses: Defenses | undefined;
  onChange: (d: Defenses) => void;
}) {
  const d = defenses ?? emptyDefenses();

  function toggle(key: (typeof ROWS)[number]['key'], t: DamageType) {
    const set = new Set(d[key]);
    if (set.has(t)) set.delete(t);
    else set.add(t);
    onChange({ ...d, [key]: [...set] });
  }

  return (
    <div className="defenses-editor">
      <div className="def-line">
        <label className="chk">
          <input
            type="checkbox"
            checked={d.critImmune}
            onChange={(e) => onChange({ ...d, critImmune: e.target.checked })}
          />
          Miễn chí mạng (adamantine)
        </label>
        <label>
          Giảm sát thương (DR)
          <input
            type="number"
            min={0}
            value={d.damageReduction}
            onChange={(e) =>
              onChange({ ...d, damageReduction: Math.max(0, Number(e.target.value)) })
            }
          />
        </label>
      </div>
      {ROWS.map((row) => (
        <div key={row.key} className="def-row">
          <span className="def-label">{row.label}</span>
          <div className="def-chips">
            {DAMAGE_TYPES.map((t) => (
              <button
                key={t}
                className={`def-chip ${d[row.key].includes(t) ? 'on' : ''}`}
                onClick={() => toggle(row.key, t)}
              >
                {DAMAGE_TYPE_VI[t]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
