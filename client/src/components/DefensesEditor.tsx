import {
  DAMAGE_TYPES,
  DAMAGE_TYPE_VI,
  emptyDefenses,
  type DamageType,
  type Defenses,
} from '@dnd-table/shared';

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
