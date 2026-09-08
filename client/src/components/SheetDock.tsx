import { useEffect, useState } from 'react';
import {
  ABILITIES,
  SKILLS,
  abilityMod,
  allActions,
  applyLongRest,
  applyShortRest,
  computeArmorClass,
  d20Check,
  emptyCurrency,
  fmtMod,
  initiativeBonus,
  proficiencyByLevel,
  saveBonus,
  skillBonus,
  type Ability,
  type ActionType,
  type CharacterSheet,
  type SheetAction,
} from '@dnd-table/shared';
import { useStore } from '../store.js';
import { nanoIdish } from '../util.js';
import { FormulaHint } from './FormulaHint.js';
import { EquipmentTab } from './sheet/EquipmentTab.js';

const ABILITY_LABEL: Record<Ability, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
};
const ACTION_LABEL: Record<ActionType, string> = {
  action: 'Action',
  bonus: 'Bonus',
  reaction: 'Reaction',
  free: 'Free',
  other: 'Khác',
};

export function blankSheet(ownerId: string): CharacterSheet {
  return {
    id: nanoIdish(),
    ownerId,
    name: 'Nhân vật mới',
    className: '',
    level: 1,
    proficiencyBonus: 2,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saveProficiencies: [],
    skillProficiencies: [],
    skillExpertise: [],
    maxHp: 10,
    currentHp: 10,
    tempHp: 0,
    armorClass: 10,
    acOverride: null,
    speed: 30,
    initiativeMisc: 0,
    actions: [],
    resources: [],
    spellSlots: [],
    feats: [],
    features: [],
    inventory: [],
    currency: emptyCurrency(),
    notes: '',
  };
}

type SubTab = 'basic' | 'equipment' | 'feats' | 'abilities';

const DOCK_H_KEY = 'dnd-table.dockHeight';

export function SheetDock() {
  const room = useStore((s) => s.room)!;
  const send = useStore((s) => s.send);
  const isDm = useStore((s) => s.isDm());
  const meId = useStore((s) => s.participantId)!;

  const mine = room.sheets.filter((s) => s.ownerId === meId || isDm);
  const [openId, setOpenId] = useState<string | null>(mine[0]?.id ?? null);
  const [sub, setSub] = useState<SubTab>('basic');
  const sheet = room.sheets.find((s) => s.id === openId) ?? mine[0] ?? null;

  const [height, setHeight] = useState(() => {
    const v = Number(localStorage.getItem(DOCK_H_KEY));
    return v >= 160 && v <= 900 ? v : Math.round(window.innerHeight * 0.27);
  });
  const drag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    let lastH = height;
    const move = (ev: PointerEvent) => {
      lastH = Math.max(160, Math.min(window.innerHeight - 140, startH + (startY - ev.clientY)));
      setHeight(lastH);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try {
        localStorage.setItem(DOCK_H_KEY, String(Math.round(lastH)));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="sheet-dock" style={{ height }}>
      <div className="sd-resize" onPointerDown={drag} title="Kéo để đổi cỡ" />
      <div className="sd-tabs">
        <div className="sd-chars">
          {mine.map((s) => (
            <button
              key={s.id}
              className={s.id === (sheet?.id ?? '') ? 'on' : ''}
              onClick={() => setOpenId(s.id)}
            >
              {s.name}
              {s.ownerId !== meId ? ' *' : ''}
            </button>
          ))}
          <button
            className="add"
            onClick={() => {
              const s = blankSheet(meId);
              send({ t: 'upsertSheet', sheet: s });
              setOpenId(s.id);
            }}
          >
            +
          </button>
        </div>
        {sheet && (
          <div className="sd-subtabs">
            {(
              [
                ['basic', 'Cơ bản'],
                ['equipment', 'Trang bị'],
                ['feats', 'Đặc điểm'],
                ['abilities', 'Năng lực'],
              ] as [SubTab, string][]
            ).map(([key, label]) => (
              <button key={key} className={sub === key ? 'on' : ''} onClick={() => setSub(key)}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sd-body">
        {!sheet ? (
          <p className="empty">Chưa có nhân vật. Bấm “+”.</p>
        ) : (
          <SheetEditor key={sheet.id} sheet={sheet} sub={sub} />
        )}
      </div>
    </div>
  );
}

function SheetEditor({ sheet, sub }: { sheet: CharacterSheet; sub: SubTab }) {
  const send = useStore((s) => s.send);
  const [draft, setDraft] = useState<CharacterSheet>(sheet);

  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || !active.closest('.sheet-dock')) setDraft(sheet);
  }, [sheet]);

  function commit(next: CharacterSheet) {
    setDraft(next);
    send({ t: 'upsertSheet', sheet: next });
  }
  const ctx: EditorCtx = { draft, commit };

  return (
    <div className="sheet-editor">
      {sub === 'basic' && <BasicTab {...ctx} />}
      {sub === 'equipment' && <EquipmentTab {...ctx} />}
      {sub === 'feats' && <FeatsTab {...ctx} />}
      {sub === 'abilities' && <AbilitiesTab {...ctx} />}
    </div>
  );
}

export interface EditorCtx {
  draft: CharacterSheet;
  commit: (next: CharacterSheet) => void;
}

/* ------------------------------------------------------------------ Basic */

function BasicTab({ draft, commit }: EditorCtx) {
  const rollDice = useStore((s) => s.rollDice);
  const attackRoll = useStore((s) => s.attackRoll);
  const damageRoll = useStore((s) => s.damageRoll);
  const tokens = useStore((s) => s.room?.tokens ?? []);
  const [targetId, setTargetId] = useState(draft.tokenId ?? '');
  const targetName = tokens.find((t) => t.id === targetId)?.label ?? '';

  const ac = computeArmorClass(draft);
  const actions = allActions(draft);
  const roll = (label: string, mod: number) => rollDice(`${draft.name} · ${label}`, d20Check(mod));

  function set<K extends keyof CharacterSheet>(k: K, v: CharacterSheet[K]) {
    commit({ ...draft, [k]: v });
  }

  return (
    <div className="basic-tab">
      <div className="bt-cols">
        {/* header + abilities */}
        <div className="bt-col">
          <div className="bt-ident">
            <input
              className="bt-name"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
            />
            <input
              className="bt-class"
              placeholder="Lớp"
              value={draft.className}
              onChange={(e) => set('className', e.target.value)}
            />
            <label>
              Cấp
              <input
                type="number"
                min={1}
                max={20}
                value={draft.level}
                onChange={(e) => {
                  const level = Number(e.target.value);
                  commit({ ...draft, level, proficiencyBonus: proficiencyByLevel(level) });
                }}
              />
            </label>
            <span className="bt-prof">Thành thạo {fmtMod(draft.proficiencyBonus)}</span>
          </div>

          <div className="ability-strip">
            {ABILITIES.map((ab) => {
              const mod = abilityMod(draft.abilities[ab]);
              return (
                <div key={ab} className="ab-cell">
                  <span className="ab-key">{ABILITY_LABEL[ab]}</span>
                  <input
                    type="number"
                    value={draft.abilities[ab]}
                    onChange={(e) =>
                      commit({
                        ...draft,
                        abilities: { ...draft.abilities, [ab]: Number(e.target.value) },
                      })
                    }
                  />
                  <button className="roll-btn sm" onClick={() => roll(`${ab.toUpperCase()} check`, mod)}>
                    {fmtMod(mod)}
                  </button>
                  <button
                    className={`roll-btn sm ${draft.saveProficiencies.includes(ab) ? 'prof' : ''}`}
                    onClick={() => roll(`${ab.toUpperCase()} save`, saveBonus(draft, ab))}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      commit({
                        ...draft,
                        saveProficiencies: draft.saveProficiencies.includes(ab)
                          ? draft.saveProficiencies.filter((x) => x !== ab)
                          : [...draft.saveProficiencies, ab],
                      });
                    }}
                    title="Chuột phải để bật/tắt thành thạo save"
                  >
                    save {fmtMod(saveBonus(draft, ab))}
                  </button>
                </div>
              );
            })}
          </div>

          <details className="skills-block">
            <summary>Kỹ năng</summary>
            <div className="skills">
              {Object.keys(SKILLS).map((sk) => {
                const prof = draft.skillProficiencies.includes(sk);
                const exp = draft.skillExpertise.includes(sk);
                return (
                  <div key={sk} className="skill">
                    <input
                      type="checkbox"
                      checked={prof}
                      title="Thành thạo"
                      onChange={(e) =>
                        commit({
                          ...draft,
                          skillProficiencies: e.target.checked
                            ? [...draft.skillProficiencies, sk]
                            : draft.skillProficiencies.filter((x) => x !== sk),
                        })
                      }
                    />
                    <input
                      type="checkbox"
                      checked={exp}
                      title="Tinh thông"
                      onChange={(e) =>
                        commit({
                          ...draft,
                          skillExpertise: e.target.checked
                            ? [...draft.skillExpertise, sk]
                            : draft.skillExpertise.filter((x) => x !== sk),
                        })
                      }
                    />
                    <button className="roll-btn wide" onClick={() => roll(sk, skillBonus(draft, sk))}>
                      {sk} {fmtMod(skillBonus(draft, sk))}
                    </button>
                  </div>
                );
              })}
            </div>
          </details>
        </div>

        {/* combat + resources */}
        <div className="bt-col">
          <div className="bt-combat">
            <div className="ac-badge">
              <span className="ac-num">{ac.ac}</span>
              <span className="ac-label">AC</span>
              <span className="ac-src">{ac.source}</span>
            </div>
            <label>
              AC ghi đè
              <input
                type="number"
                placeholder="—"
                value={draft.acOverride ?? ''}
                onChange={(e) =>
                  set('acOverride', e.target.value === '' ? null : Number(e.target.value))
                }
              />
            </label>
            <label>
              HP
              <input
                type="number"
                value={draft.currentHp}
                onChange={(e) => set('currentHp', Number(e.target.value))}
              />
            </label>
            <label>
              / tối đa
              <input
                type="number"
                value={draft.maxHp}
                onChange={(e) => set('maxHp', Number(e.target.value))}
              />
            </label>
            <label>
              tạm
              <input
                type="number"
                value={draft.tempHp}
                onChange={(e) => set('tempHp', Number(e.target.value))}
              />
            </label>
            <label>
              Tốc độ
              <input
                type="number"
                value={draft.speed}
                onChange={(e) => set('speed', Number(e.target.value))}
              />
            </label>
            <button className="roll-btn" onClick={() => roll('Initiative', initiativeBonus(draft))}>
              Init {fmtMod(initiativeBonus(draft))}
            </button>
            <button className="rest" onClick={() => commit(applyShortRest(draft))}>
              Nghỉ ngắn
            </button>
            <button className="rest" onClick={() => commit(applyLongRest(draft))}>
              Nghỉ dài
            </button>
          </div>

          <Resources draft={draft} commit={commit} />
        </div>
      </div>

      {/* actions economy */}
      <div className="bt-actions">
        <div className="bta-head">
          <h4>Hành động</h4>
          <label className="target-pick">
            Mục tiêu
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">— không —</option>
              {tokens.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {(['action', 'bonus', 'reaction'] as ActionType[]).map((type) => {
          const list = actions.filter((a) => a.actionType === type);
          const others = actions.filter(
            (a) => (a.actionType === 'free' || a.actionType === 'other') && type === 'action',
          );
          const rows = type === 'action' ? [...list, ...others] : list;
          if (rows.length === 0) return null;
          return (
            <div key={type} className="action-group">
              <span className="ag-label">{ACTION_LABEL[type]}</span>
              {rows.map((a) => (
                <ActionRow
                  key={a.id}
                  action={a}
                  sheetName={draft.name}
                  targetId={targetId}
                  targetName={targetName}
                  rollDice={rollDice}
                  attackRoll={attackRoll}
                  damageRoll={damageRoll}
                  onDelete={
                    a.source === 'weapon'
                      ? undefined
                      : () => commit({ ...draft, actions: draft.actions.filter((x) => x.id !== a.id) })
                  }
                />
              ))}
            </div>
          );
        })}
        {actions.length === 0 && (
          <p className="empty">Chưa có hành động. Trang bị vũ khí hoặc thêm bên dưới.</p>
        )}

        <ActionEditor draft={draft} commit={commit} />
      </div>
    </div>
  );
}

function ActionRow({
  action,
  sheetName,
  targetId,
  targetName,
  rollDice,
  attackRoll,
  damageRoll,
  onDelete,
}: {
  action: SheetAction;
  sheetName: string;
  targetId: string;
  targetName: string;
  rollDice: (label: string, notation: string) => Promise<void>;
  attackRoll: (p: {
    label: string;
    attackNotation: string;
    damageNotation: string;
    targetTokenId: string;
  }) => Promise<void>;
  damageRoll: (label: string, notation: string, targetTokenId: string) => Promise<void>;
  onDelete?: () => void;
}) {
  const base = `${sheetName} · ${action.name}`;
  const isAttack = typeof action.attackBonus === 'number' && !!action.damage;
  return (
    <div className={`action-row ${action.source === 'weapon' ? 'derived' : ''}`}>
      <span className="ar-name" title={action.description}>
        {action.name}
        {action.source === 'weapon' && <em> · trang bị</em>}
      </span>
      <span className="ar-detail">
        {isAttack
          ? `${fmtMod(action.attackBonus!)} · ${action.damage}${action.damageType ? ' ' + action.damageType : ''}`
          : action.save
            ? `DC ${action.save.dc} ${action.save.ability.toUpperCase()}`
            : action.notation || action.description || ''}
      </span>
      {isAttack && targetId && (
        <button
          className="roll-btn strong"
          onClick={() =>
            attackRoll({
              label: `${base} → ${targetName}`,
              attackNotation: d20Check(action.attackBonus!),
              damageNotation: action.damage!,
              targetTokenId: targetId,
            })
          }
        >
          ⚔ {targetName}
        </button>
      )}
      {isAttack && !targetId && (
        <button className="roll-btn" onClick={() => rollDice(`${base} (đánh)`, d20Check(action.attackBonus!))}>
          đánh
        </button>
      )}
      {action.damage && (
        <button
          className="roll-btn"
          onClick={() =>
            targetId
              ? damageRoll(`${base} → ${targetName}`, action.damage!, targetId)
              : rollDice(`${base} (sát thương)`, action.damage!)
          }
        >
          {targetId ? 'sát thương' : 'dmg'}
        </button>
      )}
      {action.notation && !action.damage && (
        <button className="roll-btn" onClick={() => rollDice(base, action.notation!)}>
          tung
        </button>
      )}
      {onDelete && (
        <button className="link" onClick={onDelete}>
          ✕
        </button>
      )}
    </div>
  );
}

function ActionEditor({ draft, commit }: EditorCtx) {
  function upd(id: string, patch: Partial<SheetAction>) {
    commit({ ...draft, actions: draft.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  }
  return (
    <details className="action-editor">
      <summary>Sửa / thêm hành động</summary>
      {draft.actions.map((a) => (
        <div key={a.id} className="ae-row">
          <input value={a.name} placeholder="Tên" onChange={(e) => upd(a.id, { name: e.target.value })} />
          <select
            value={a.actionType}
            onChange={(e) => upd(a.id, { actionType: e.target.value as ActionType })}
          >
            <option value="action">Action</option>
            <option value="bonus">Bonus</option>
            <option value="reaction">Reaction</option>
            <option value="free">Free</option>
            <option value="other">Khác</option>
          </select>
          <input
            type="number"
            placeholder="+đánh"
            value={a.attackBonus ?? ''}
            title="Để trống nếu không phải đòn đánh"
            onChange={(e) =>
              upd(a.id, { attackBonus: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
          <input
            placeholder="dmg 2d6+8"
            value={a.damage ?? ''}
            onChange={(e) => upd(a.id, { damage: e.target.value || undefined })}
          />
          <input
            placeholder="roll khác"
            value={a.notation ?? ''}
            onChange={(e) => upd(a.id, { notation: e.target.value || undefined })}
          />
          <FormulaHint notation={a.damage || a.notation || ''} />
          <button className="link" onClick={() => commit({ ...draft, actions: draft.actions.filter((x) => x.id !== a.id) })}>
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          commit({
            ...draft,
            actions: [
              ...draft.actions,
              { id: nanoIdish(), name: 'Hành động mới', actionType: 'action', source: 'manual' },
            ],
          })
        }
      >
        + Thêm
      </button>
    </details>
  );
}

/* -------------------------------------------------------------- Resources */

function Resources({ draft, commit }: EditorCtx) {
  function setRes(id: string, used: number) {
    commit({
      ...draft,
      resources: draft.resources.map((r) =>
        r.id === id ? { ...r, used: Math.max(0, Math.min(r.max, used)) } : r,
      ),
    });
  }
  function setSlot(level: number, used: number) {
    commit({
      ...draft,
      spellSlots: draft.spellSlots.map((s) =>
        s.level === level ? { ...s, used: Math.max(0, Math.min(s.max, used)) } : s,
      ),
    });
  }
  const nextSlotLevel = [1, 2, 3, 4, 5, 6, 7, 8, 9].find(
    (l) => !draft.spellSlots.some((s) => s.level === l),
  );

  return (
    <div className="resources">
      {draft.resources.map((r) => (
        <div key={r.id} className="res-row">
          <input
            className="res-name"
            value={r.name}
            onChange={(e) =>
              commit({
                ...draft,
                resources: draft.resources.map((x) =>
                  x.id === r.id ? { ...x, name: e.target.value } : x,
                ),
              })
            }
          />
          <Pips max={r.max} used={r.used} onChange={(u) => setRes(r.id, u)} />
          <input
            type="number"
            className="res-max"
            value={r.max}
            title="Tối đa"
            onChange={(e) =>
              commit({
                ...draft,
                resources: draft.resources.map((x) =>
                  x.id === r.id ? { ...x, max: Math.max(0, Number(e.target.value)) } : x,
                ),
              })
            }
          />
          <select
            value={r.recharge}
            title="Hồi khi"
            onChange={(e) =>
              commit({
                ...draft,
                resources: draft.resources.map((x) =>
                  x.id === r.id ? { ...x, recharge: e.target.value as never } : x,
                ),
              })
            }
          >
            <option value="short">ngắn</option>
            <option value="long">dài</option>
            <option value="other">khác</option>
          </select>
          <button
            className="link"
            onClick={() =>
              commit({ ...draft, resources: draft.resources.filter((x) => x.id !== r.id) })
            }
          >
            ✕
          </button>
        </div>
      ))}

      {draft.spellSlots
        .slice()
        .sort((a, b) => a.level - b.level)
        .map((s) => (
          <div key={s.level} className="res-row">
            <span className="res-name slot">Slot {s.level}</span>
            <Pips max={s.max} used={s.used} onChange={(u) => setSlot(s.level, u)} />
            <input
              type="number"
              className="res-max"
              value={s.max}
              onChange={(e) =>
                commit({
                  ...draft,
                  spellSlots: draft.spellSlots.map((x) =>
                    x.level === s.level ? { ...x, max: Math.max(0, Number(e.target.value)) } : x,
                  ),
                })
              }
            />
            <button
              className="link"
              onClick={() =>
                commit({
                  ...draft,
                  spellSlots: draft.spellSlots.filter((x) => x.level !== s.level),
                })
              }
            >
              ✕
            </button>
          </div>
        ))}

      <div className="res-add">
        <button
          onClick={() =>
            commit({
              ...draft,
              resources: [
                ...draft.resources,
                { id: nanoIdish(), name: 'Tài nguyên', max: 3, used: 0, recharge: 'short' },
              ],
            })
          }
        >
          + Tài nguyên
        </button>
        {nextSlotLevel && (
          <button
            onClick={() =>
              commit({
                ...draft,
                spellSlots: [...draft.spellSlots, { level: nextSlotLevel, max: 2, used: 0 }],
              })
            }
          >
            + Spell slot
          </button>
        )}
      </div>
    </div>
  );
}

function Pips({ max, used, onChange }: { max: number; used: number; onChange: (u: number) => void }) {
  if (max > 12) {
    return (
      <span className="pips">
        <button className="link" onClick={() => onChange(used - 1)}>
          −
        </button>
        {max - used}/{max}
        <button className="link" onClick={() => onChange(used + 1)}>
          +
        </button>
      </span>
    );
  }
  return (
    <span className="pips">
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          className={`pip ${i < max - used ? 'full' : ''}`}
          title={i < max - used ? 'còn' : 'đã dùng'}
          onClick={() => onChange(i < max - used ? max - i : max - i - 1)}
        />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------- Feats / Abilities */

function FeatsTab({ draft, commit }: EditorCtx) {
  return (
    <div className="list-tab">
      {draft.feats.map((f) => (
        <div key={f.id} className="lt-row">
          <input
            className="lt-name"
            value={f.name}
            placeholder="Tên feat"
            onChange={(e) =>
              commit({
                ...draft,
                feats: draft.feats.map((x) => (x.id === f.id ? { ...x, name: e.target.value } : x)),
              })
            }
          />
          <textarea
            value={f.description}
            placeholder="Mô tả"
            rows={2}
            onChange={(e) =>
              commit({
                ...draft,
                feats: draft.feats.map((x) =>
                  x.id === f.id ? { ...x, description: e.target.value } : x,
                ),
              })
            }
          />
          <button
            className="link"
            onClick={() => commit({ ...draft, feats: draft.feats.filter((x) => x.id !== f.id) })}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          commit({
            ...draft,
            feats: [...draft.feats, { id: nanoIdish(), name: 'Feat mới', description: '' }],
          })
        }
      >
        + Thêm feat
      </button>
      {draft.feats.length === 0 && <p className="empty">Chưa có feat.</p>}
    </div>
  );
}

function AbilitiesTab({ draft, commit }: EditorCtx) {
  function upd(id: string, patch: Partial<CharacterSheet['features'][number]>) {
    commit({
      ...draft,
      features: draft.features.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    });
  }
  return (
    <div className="list-tab">
      {draft.features.map((f) => (
        <div key={f.id} className="lt-row">
          <div className="lt-line">
            <input
              className="lt-name"
              value={f.name}
              placeholder="Tên năng lực"
              onChange={(e) => upd(f.id, { name: e.target.value })}
            />
            <input
              className="lt-src"
              value={f.source}
              placeholder="Nguồn (Fighter 3…)"
              onChange={(e) => upd(f.id, { source: e.target.value })}
            />
            {f.uses ? (
              <span className="lt-uses">
                <Pips
                  max={f.uses.max}
                  used={f.uses.used}
                  onChange={(u) =>
                    upd(f.id, {
                      uses: { ...f.uses!, used: Math.max(0, Math.min(f.uses!.max, u)) },
                    })
                  }
                />
                <input
                  type="number"
                  className="res-max"
                  value={f.uses.max}
                  onChange={(e) => upd(f.id, { uses: { ...f.uses!, max: Number(e.target.value) } })}
                />
                <select
                  value={f.uses.recharge}
                  onChange={(e) =>
                    upd(f.id, { uses: { ...f.uses!, recharge: e.target.value as never } })
                  }
                >
                  <option value="short">ngắn</option>
                  <option value="long">dài</option>
                  <option value="other">khác</option>
                </select>
              </span>
            ) : (
              <button
                className="link"
                onClick={() => upd(f.id, { uses: { max: 1, used: 0, recharge: 'long' } })}
              >
                + lượt dùng
              </button>
            )}
            <button
              className="link"
              onClick={() =>
                commit({ ...draft, features: draft.features.filter((x) => x.id !== f.id) })
              }
            >
              ✕
            </button>
          </div>
          <textarea
            value={f.description}
            placeholder="Mô tả"
            rows={2}
            onChange={(e) => upd(f.id, { description: e.target.value })}
          />
        </div>
      ))}
      <button
        onClick={() =>
          commit({
            ...draft,
            features: [
              ...draft.features,
              { id: nanoIdish(), name: 'Năng lực mới', source: '', description: '' },
            ],
          })
        }
      >
        + Thêm năng lực
      </button>
      {draft.features.length === 0 && <p className="empty">Chưa có năng lực.</p>}
    </div>
  );
}
