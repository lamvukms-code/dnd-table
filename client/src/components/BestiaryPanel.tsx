import { useMemo, useRef, useState } from 'react';
import {
  ABILITIES,
  abilityMod,
  d20Check,
  fmtMod,
  type SheetAction,
  type Statblock,
  type TokenSize,
} from '@dnd-table/shared';
import { useStore } from '../store.js';
import { nanoIdish } from '../util.js';
import { blankStatblock, mergeBestiary, normalizeStatblock } from '../statblock.js';
import { FormulaHint } from './FormulaHint.js';

const SIZES: TokenSize[] = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];

export function BestiaryPanel({ onClose }: { onClose: () => void }) {
  const send = useStore((s) => s.send);
  const bestiary = useStore((s) => s.room?.bestiary ?? []);
  const [selId, setSelId] = useState<string | null>(bestiary[0]?.id ?? null);
  const [q, setQ] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return bestiary;
    return bestiary.filter(
      (b) =>
        b.name.toLowerCase().includes(s) ||
        b.meta.toLowerCase().includes(s) ||
        b.tags.some((t) => t.toLowerCase().includes(s)),
    );
  }, [bestiary, q]);

  const selected = bestiary.find((b) => b.id === selId) ?? null;

  function create() {
    const sb = blankStatblock();
    send({ t: 'bestiaryUpsert', statblock: sb });
    setSelId(sb.id);
  }

  function exportFile() {
    const blob = new Blob([JSON.stringify(bestiary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bestiary-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File) {
    try {
      const raw = JSON.parse(await file.text());
      const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.bestiary) ? raw.bestiary : null;
      if (!arr) throw new Error('File không phải danh sách statblock');
      const merged = mergeBestiary(bestiary, arr.map(normalizeStatblock));
      send({ t: 'bestiaryReplaceAll', entries: merged });
      setNote(`Đã nhập ${arr.length} statblock (gộp theo id).`);
    } catch (e) {
      setNote(`Lỗi nhập file: ${(e as Error).message}`);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal bestiary" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Bestiary — NPC & kẻ địch</h2>
          <button className="link" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="bestiary-body">
          <div className="be-list">
            <input
              placeholder="Tìm tên / loại / tag…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="be-list-scroll">
              {filtered.map((b) => (
                <button
                  key={b.id}
                  className={`be-item ${b.id === selId ? 'on' : ''}`}
                  onClick={() => setSelId(b.id)}
                >
                  <span className="be-dot" style={{ background: b.color }} />
                  <span className="be-name">{b.name}</span>
                  {b.cr && <span className="be-cr">CR {b.cr}</span>}
                </button>
              ))}
              {filtered.length === 0 && <p className="empty">Trống.</p>}
            </div>
            <div className="be-list-actions">
              <button onClick={create}>+ Mới</button>
              <button onClick={() => fileRef.current?.click()}>Nhập file</button>
              <button onClick={exportFile} disabled={bestiary.length === 0}>
                Xuất file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importFile(f);
                  e.target.value = '';
                }}
              />
            </div>
            {note && <p className="note">{note}</p>}
          </div>

          <div className="be-editor">
            {selected ? (
              <StatblockEditor key={selected.id} sb={selected} onDeleted={() => setSelId(null)} />
            ) : (
              <p className="empty">Chọn hoặc tạo một statblock.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatblockEditor({ sb, onDeleted }: { sb: Statblock; onDeleted: () => void }) {
  const send = useStore((s) => s.send);
  const rollDice = useStore((s) => s.rollDice);
  const map = useStore((s) => s.room!.map);
  const [rollHp, setRollHp] = useState(true);
  const [hidden, setHidden] = useState(false);

  const commit = (next: Statblock) => send({ t: 'bestiaryUpsert', statblock: next });
  const set = <K extends keyof Statblock>(k: K, v: Statblock[K]) => commit({ ...sb, [k]: v });
  const roll = (label: string, mod: number) => rollDice(`${sb.name} · ${label}`, d20Check(mod));

  function spawn() {
    send({
      t: 'spawnStatblock',
      id: sb.id,
      x: Math.floor(map.cols / 2),
      y: Math.floor(map.rows / 2),
      rollHp,
      hidden,
    });
  }

  const saveBonus = (ab: (typeof ABILITIES)[number]) =>
    abilityMod(sb.abilities[ab]) + (sb.saveProficiencies.includes(ab) ? sb.proficiencyBonus : 0);

  return (
    <div className="sb-editor">
      <div className="sb-rollbar">
        <span className="sb-rollbar-label">🎲 Roll thử:</span>
        {ABILITIES.map((ab) => (
          <button
            key={ab}
            className="roll-btn sm"
            onClick={() => roll(`${ab.toUpperCase()} check`, abilityMod(sb.abilities[ab]))}
            title={`${ab.toUpperCase()} check`}
          >
            {ab.toUpperCase()}
          </button>
        ))}
        {sb.saveProficiencies.map((ab) => (
          <button
            key={`s-${ab}`}
            className="roll-btn sm prof"
            onClick={() => roll(`${ab.toUpperCase()} save`, saveBonus(ab))}
          >
            {ab.toUpperCase()} save
          </button>
        ))}
        {sb.skills.map((sk) => (
          <button key={sk.skill} className="roll-btn sm" onClick={() => roll(sk.skill, sk.bonus)}>
            {sk.skill} {fmtMod(sk.bonus)}
          </button>
        ))}
        {sb.actions
          .filter((a) => typeof a.attackBonus === 'number')
          .map((a) => (
            <button
              key={`a-${a.id}`}
              className="roll-btn sm"
              onClick={() => roll(`${a.name} (đánh)`, a.attackBonus!)}
            >
              {a.name} đánh
            </button>
          ))}
      </div>

      <div className="sb-row">
        <label className="grow">
          Tên
          <input value={sb.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label>
          CR
          <input value={sb.cr} onChange={(e) => set('cr', e.target.value)} />
        </label>
        <label>
          Cỡ
          <select value={sb.size} onChange={(e) => set('size', e.target.value as TokenSize)}>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Màu
          <input type="color" value={sb.color} onChange={(e) => set('color', e.target.value)} />
        </label>
      </div>

      <label>
        Loại / mô tả ngắn
        <input
          value={sb.meta}
          placeholder="Small humanoid (goblinoid), neutral evil"
          onChange={(e) => set('meta', e.target.value)}
        />
      </label>

      <div className="sb-row">
        <label>
          AC
          <input type="number" value={sb.ac} onChange={(e) => set('ac', Number(e.target.value))} />
        </label>
        <label>
          HP
          <input
            type="number"
            value={sb.maxHp}
            onChange={(e) => set('maxHp', Number(e.target.value))}
          />
        </label>
        <label>
          HP formula
          <input
            value={sb.hpFormula ?? ''}
            placeholder="2d6"
            onChange={(e) => set('hpFormula', e.target.value)}
          />
          <FormulaHint notation={sb.hpFormula ?? ''} />
        </label>
        <label>
          Tốc độ
          <input
            type="number"
            value={sb.speed}
            onChange={(e) => set('speed', Number(e.target.value))}
          />
        </label>
        <label>
          Thành thạo
          <input
            type="number"
            value={sb.proficiencyBonus}
            onChange={(e) => set('proficiencyBonus', Number(e.target.value))}
          />
        </label>
      </div>

      <div className="sb-abilities">
        {ABILITIES.map((ab) => {
          const prof = sb.saveProficiencies.includes(ab);
          return (
            <div key={ab} className="sb-ab">
              <span>{ab.toUpperCase()}</span>
              <input
                type="number"
                value={sb.abilities[ab]}
                onChange={(e) =>
                  commit({ ...sb, abilities: { ...sb.abilities, [ab]: Number(e.target.value) } })
                }
              />
              <span className="sb-mod">{fmtMod(abilityMod(sb.abilities[ab]))}</span>
              <label className="sb-save" title="Thành thạo save">
                <input
                  type="checkbox"
                  checked={prof}
                  onChange={(e) =>
                    commit({
                      ...sb,
                      saveProficiencies: e.target.checked
                        ? [...sb.saveProficiencies, ab]
                        : sb.saveProficiencies.filter((x) => x !== ab),
                    })
                  }
                />
                save
              </label>
            </div>
          );
        })}
      </div>

      <ActionsEditor
        actions={sb.actions}
        onChange={(actions) => set('actions', actions)}
        label="Hành động / đòn tấn công"
      />

      <TraitsEditor traits={sb.traits} onChange={(traits) => set('traits', traits)} />

      <div className="sb-row">
        <label className="grow">
          Tags (phẩy)
          <input
            value={sb.tags.join(', ')}
            onChange={(e) =>
              set(
                'tags',
                e.target.value
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
              )
            }
          />
        </label>
        <label>
          Ảnh (URL)
          <input value={sb.imageUrl ?? ''} onChange={(e) => set('imageUrl', e.target.value || undefined)} />
        </label>
      </div>

      <label>
        Ghi chú (giác quan, ngôn ngữ, kháng/miễn…)
        <textarea value={sb.notes} rows={2} onChange={(e) => set('notes', e.target.value)} />
      </label>
      {sb.source && <p className="hint">Nguồn: {sb.source}</p>}

      <div className="sb-footer">
        <button className="primary" onClick={spawn}>
          ⤵ Spawn lên map
        </button>
        <label className="chk">
          <input type="checkbox" checked={rollHp} onChange={(e) => setRollHp(e.target.checked)} />
          tung HP
        </label>
        <label className="chk">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          ẩn
        </label>
        <button
          className="danger"
          onClick={() => {
            send({ t: 'bestiaryRemove', id: sb.id });
            onDeleted();
          }}
        >
          Xóa
        </button>
      </div>
    </div>
  );
}

export function ActionsEditor({
  actions,
  onChange,
  label,
}: {
  actions: SheetAction[];
  onChange: (a: SheetAction[]) => void;
  label: string;
}) {
  const upd = (id: string, patch: Partial<SheetAction>) =>
    onChange(actions.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  return (
    <div className="sb-actions">
      <div className="sb-actions-head">{label}</div>
      {actions.map((a) => (
        <div key={a.id} className="sb-action-row">
          <input value={a.name} placeholder="Tên" onChange={(e) => upd(a.id, { name: e.target.value })} />
          <select
            value={a.actionType}
            onChange={(e) => upd(a.id, { actionType: e.target.value as SheetAction['actionType'] })}
          >
            <option value="action">Action</option>
            <option value="bonus">Bonus</option>
            <option value="reaction">Reaction</option>
            <option value="free">Free</option>
            <option value="other">Khác</option>
          </select>
          <input
            type="number"
            placeholder="+hit"
            title="+ đánh (để trống nếu không phải đòn đánh)"
            value={a.attackBonus ?? ''}
            onChange={(e) =>
              upd(a.id, { attackBonus: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
          <input
            placeholder="dmg 1d6+2"
            value={a.damage ?? ''}
            onChange={(e) => upd(a.id, { damage: e.target.value || undefined })}
          />
          <input
            placeholder="roll khác"
            value={a.notation ?? ''}
            onChange={(e) => upd(a.id, { notation: e.target.value || undefined })}
          />
          <input
            placeholder="mô tả / rider"
            value={a.description ?? ''}
            onChange={(e) => upd(a.id, { description: e.target.value || undefined })}
          />
          <button className="link" onClick={() => onChange(actions.filter((x) => x.id !== a.id))}>
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          onChange([
            ...actions,
            { id: nanoIdish(), name: 'Đòn mới', actionType: 'action', source: 'manual' },
          ])
        }
      >
        + Thêm
      </button>
    </div>
  );
}

function TraitsEditor({
  traits,
  onChange,
}: {
  traits: { name: string; description: string }[];
  onChange: (t: { name: string; description: string }[]) => void;
}) {
  return (
    <div className="sb-traits">
      <div className="sb-actions-head">Đặc điểm (traits)</div>
      {traits.map((t, i) => (
        <div key={i} className="sb-trait-row">
          <input
            value={t.name}
            placeholder="Tên"
            onChange={(e) => onChange(traits.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
          />
          <input
            value={t.description}
            placeholder="Mô tả"
            onChange={(e) =>
              onChange(traits.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))
            }
          />
          <button className="link" onClick={() => onChange(traits.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...traits, { name: '', description: '' }])}>+ Trait</button>
    </div>
  );
}
