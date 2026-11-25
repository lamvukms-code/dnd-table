import { useMemo, useState, type ReactNode } from 'react';

export interface PickItem {
  key: string;
  name: string;
  /** Small right-hand hint (school / prerequisite / damage…). */
  hint?: string;
  /** Longer text shown in the preview under the list. */
  detail?: string;
  mark?: string;
  /** Section header the item sits under (e.g. "Theo nghề của bạn"). Items keep their order. */
  group?: string;
  /** Matched by the search box besides the name. */
  keywords?: string[];
  /** Filter chip value(s) this item belongs to. */
  tags?: string[];
  disabled?: boolean;
}

/**
 * One searchable picker for the sheet (spells, feats, invocations): a search box, optional filter
 * chips, a list grouped by section, and a preview of the highlighted entry with an "Thêm" button.
 * Stays open while you add several entries; arrow keys + Enter work.
 */
export function SearchPicker({
  title,
  items,
  chips,
  onPick,
  footer,
  placeholder,
  initialChip = '',
}: {
  title: string;
  items: PickItem[];
  chips?: { value: string; label: string }[];
  onPick: (item: PickItem) => void;
  footer?: ReactNode;
  placeholder?: string;
  initialChip?: string;
}) {
  const [q, setQ] = useState('');
  const [chip, setChip] = useState(initialChip);
  const [sel, setSel] = useState(0);
  const term = q.trim().toLowerCase();
  const list = useMemo(
    () =>
      items.filter(
        (it) =>
          !it.disabled &&
          (!chip || it.tags?.includes(chip)) &&
          (!term || [it.name, ...(it.keywords ?? [])].some((x) => x.toLowerCase().includes(term))),
      ),
    [items, chip, term],
  );
  const cur = list[Math.min(sel, list.length - 1)];

  function pick(it: PickItem | undefined) {
    if (!it) return;
    onPick(it);
    setSel((s) => Math.max(0, Math.min(s, list.length - 2)));
  }

  let lastGroup: string | undefined;
  return (
    <div className="search-picker">
      <div className="spk-head">
        <strong>{title}</strong>
        <input
          value={q}
          placeholder={placeholder ?? `Tìm… (${items.filter((i) => !i.disabled).length})`}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((s) => Math.min(list.length - 1, s + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            } else if (e.key === 'Enter') pick(cur);
          }}
        />
      </div>
      {chips && chips.length > 0 && (
        <div className="spk-chips">
          {[{ value: '', label: 'Tất cả' }, ...chips].map((c) => (
            <button
              key={c.value || 'all'}
              className={chip === c.value ? 'on' : ''}
              onClick={() => {
                setChip(c.value);
                setSel(0);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <ul className="spk-list">
        {list.length === 0 && <li className="spk-empty">Không thấy mục nào.</li>}
        {list.map((it, i) => {
          const header = it.group && it.group !== lastGroup ? it.group : null;
          lastGroup = it.group;
          return (
            <li key={it.key}>
              {header && <div className="spk-group">{header}</div>}
              <button
                type="button"
                className={`spk-opt ${cur?.key === it.key ? 'cur' : ''}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => setSel(i)}
                onDoubleClick={() => pick(it)}
              >
                <span className="spk-mark">{it.mark ?? '•'}</span>
                <span className="spk-name">{it.name}</span>
                {it.hint && <span className="spk-hint">{it.hint}</span>}
                <span
                  className="spk-add"
                  role="button"
                  title="Thêm"
                  onClick={(e) => {
                    e.stopPropagation();
                    pick(it);
                  }}
                >
                  ＋
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {cur?.detail && (
        <div className="spk-preview">
          <strong>{cur.name}</strong> {cur.detail}
        </div>
      )}
      {footer && <div className="spk-footer">{footer}</div>}
    </div>
  );
}
