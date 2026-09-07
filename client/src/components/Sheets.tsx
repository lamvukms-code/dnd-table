import { useEffect, useState } from 'react';
import {
  ABILITIES,
  COIN_TYPES,
  SKILLS,
  abilityMod,
  allAttacks,
  carriedWeight,
  carryCapacity,
  computeArmorClass,
  currencyInGp,
  d20Check,
  emptyCurrency,
  fmtMod,
  initiativeBonus,
  proficiencyByLevel,
  saveBonus,
  skillBonus,
  type Ability,
  type CharacterSheet,
  type ArmorCategory,
  type InventoryItem,
  type ItemType,
  type WeaponAbility,
} from '@dnd-table/shared';
import { useStore } from '../store.js';
import { nanoIdish } from '../util.js';

const ABILITY_LABEL: Record<Ability, string> = {
  str: 'Sức mạnh',
  dex: 'Nhanh nhẹn',
  con: 'Thể chất',
  int: 'Trí tuệ',
  wis: 'Tinh thần',
  cha: 'Sức hút',
};

const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  weapon: 'Vũ khí',
  armor: 'Giáp',
  shield: 'Khiên',
  gear: 'Đồ dùng',
};

const COIN_LABEL: Record<string, string> = {
  pp: 'PP',
  gp: 'GP',
  ep: 'EP',
  sp: 'SP',
  cp: 'CP',
};

function blankSheet(ownerId: string): CharacterSheet {
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
    attacks: [],
    inventory: [],
    currency: emptyCurrency(),
    notes: '',
  };
}

function blankItem(type: ItemType): InventoryItem {
  const base: InventoryItem = {
    id: nanoIdish(),
    name: type === 'weapon' ? 'Vũ khí mới' : type === 'armor' ? 'Giáp mới' : type === 'shield' ? 'Khiên' : 'Vật phẩm',
    type,
    quantity: 1,
    weight: 0,
    equipped: false,
    notes: '',
  };
  if (type === 'weapon') {
    return { ...base, weaponAbility: 'str', damage: '1d6', damageType: 'chém', proficient: true, attackBonusMisc: 0, damageBonusMisc: 0 };
  }
  if (type === 'armor') {
    return { ...base, armorBase: 14, armorCategory: 'medium', stealthDisadvantage: false };
  }
  if (type === 'shield') {
    return { ...base, armorBase: 2, weight: 6 };
  }
  return base;
}

export function Sheets() {
  const room = useStore((s) => s.room)!;
  const send = useStore((s) => s.send);
  const isDm = useStore((s) => s.isDm());
  const meId = useStore((s) => s.participantId)!;

  const mine = room.sheets.filter((s) => s.ownerId === meId || isDm);
  const [openId, setOpenId] = useState<string | null>(mine[0]?.id ?? null);
  const sheet = room.sheets.find((s) => s.id === openId) ?? null;

  return (
    <div className="sheets">
      <div className="sheet-tabs">
        {mine.map((s) => (
          <button key={s.id} className={s.id === openId ? 'on' : ''} onClick={() => setOpenId(s.id)}>
            {s.name}
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
          + Tạo
        </button>
      </div>
      {sheet ? (
        <SheetEditor key={sheet.id} sheet={sheet} />
      ) : (
        <p className="empty">Chưa có character sheet. Bấm “+ Tạo”.</p>
      )}
    </div>
  );
}

type Section = 'stats' | 'combat' | 'inventory';

function SheetEditor({ sheet }: { sheet: CharacterSheet }) {
  const send = useStore((s) => s.send);
  const rollDice = useStore((s) => s.rollDice);
  const tokens = useStore((s) => s.room?.tokens ?? []);
  const [draft, setDraft] = useState<CharacterSheet>(sheet);
  const [section, setSection] = useState<Section>('stats');

  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || !active.closest('.sheet-editor')) setDraft(sheet);
  }, [sheet]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(sheet);

  function commit(next: CharacterSheet) {
    setDraft(next);
    send({ t: 'upsertSheet', sheet: next });
  }
  function set<K extends keyof CharacterSheet>(k: K, v: CharacterSheet[K]) {
    commit({ ...draft, [k]: v });
  }
  function roll(label: string, mod: number) {
    void rollDice(`${draft.name} · ${label}`, d20Check(mod));
  }
  const ctx = { draft, commit, set, roll, rollDice, tokens };

  return (
    <div className="sheet-editor">
      <nav className="sheet-sections">
        <button className={section === 'stats' ? 'on' : ''} onClick={() => setSection('stats')}>
          Chỉ số
        </button>
        <button className={section === 'combat' ? 'on' : ''} onClick={() => setSection('combat')}>
          Chiến đấu
        </button>
        <button className={section === 'inventory' ? 'on' : ''} onClick={() => setSection('inventory')}>
          Túi đồ
        </button>
      </nav>

      {section === 'stats' && <StatsSection {...ctx} />}
      {section === 'combat' && <CombatSection {...ctx} />}
      {section === 'inventory' && <InventorySection {...ctx} />}

      <div className="se-footer">
        <button className="danger" onClick={() => send({ t: 'removeSheet', id: draft.id })}>
          Xóa nhân vật
        </button>
        {dirty && <span className="dirty">đang lưu…</span>}
      </div>
    </div>
  );
}

interface SectionProps {
  draft: CharacterSheet;
  commit: (next: CharacterSheet) => void;
  set: <K extends keyof CharacterSheet>(k: K, v: CharacterSheet[K]) => void;
  roll: (label: string, mod: number) => void;
  rollDice: (label: string, notation: string) => Promise<void>;
  tokens: { id: string; label: string }[];
}

function StatsSection({ draft, commit, set, roll }: SectionProps) {
  return (
    <>
      <div className="se-row">
        <label className="grow">
          Tên
          <input value={draft.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label>
          Lớp
          <input value={draft.className} onChange={(e) => set('className', e.target.value)} />
        </label>
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
        <label>
          Thành thạo
          <input
            type="number"
            value={draft.proficiencyBonus}
            onChange={(e) => set('proficiencyBonus', Number(e.target.value))}
          />
        </label>
      </div>

      <div className="abilities">
        {ABILITIES.map((ab) => {
          const mod = abilityMod(draft.abilities[ab]);
          const hasSave = draft.saveProficiencies.includes(ab);
          return (
            <div key={ab} className="ability">
              <strong>{ABILITY_LABEL[ab]}</strong>
              <input
                type="number"
                value={draft.abilities[ab]}
                onChange={(e) =>
                  commit({ ...draft, abilities: { ...draft.abilities, [ab]: Number(e.target.value) } })
                }
              />
              <button className="roll-btn" onClick={() => roll(`${ab.toUpperCase()} check`, mod)}>
                {fmtMod(mod)}
              </button>
              <label className="save-line">
                <input
                  type="checkbox"
                  checked={hasSave}
                  onChange={(e) =>
                    commit({
                      ...draft,
                      saveProficiencies: e.target.checked
                        ? [...draft.saveProficiencies, ab]
                        : draft.saveProficiencies.filter((x) => x !== ab),
                    })
                  }
                />
                <button
                  className="roll-btn sm"
                  onClick={() => roll(`${ab.toUpperCase()} save`, saveBonus(draft, ab))}
                >
                  save {fmtMod(saveBonus(draft, ab))}
                </button>
              </label>
            </div>
          );
        })}
      </div>

      <details className="skills-block" open>
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
    </>
  );
}

function CombatSection({ draft, commit, set, roll, rollDice, tokens }: SectionProps) {
  const ac = computeArmorClass(draft);
  const attacks = allAttacks(draft);

  return (
    <>
      <div className="combat-top">
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
          <input type="number" value={draft.currentHp} onChange={(e) => set('currentHp', Number(e.target.value))} />
        </label>
        <label>
          HP tối đa
          <input type="number" value={draft.maxHp} onChange={(e) => set('maxHp', Number(e.target.value))} />
        </label>
        <label>
          HP tạm
          <input type="number" value={draft.tempHp} onChange={(e) => set('tempHp', Number(e.target.value))} />
        </label>
        <label>
          Tốc độ
          <input type="number" value={draft.speed} onChange={(e) => set('speed', Number(e.target.value))} />
        </label>
        <button className="roll-btn" onClick={() => roll('Initiative', initiativeBonus(draft))}>
          Init {fmtMod(initiativeBonus(draft))}
        </button>
      </div>

      <label className="se-row">
        Token liên kết
        <select value={draft.tokenId ?? ''} onChange={(e) => set('tokenId', e.target.value || undefined)}>
          <option value="">— không —</option>
          {tokens.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <h4>Đòn tấn công</h4>
      <div className="attacks-list">
        {attacks.map((atk) => {
          const derived = atk.source === 'weapon';
          return (
            <div key={atk.id} className={`attack-row-view ${derived ? 'derived' : ''}`}>
              <span className="atk-name">
                {atk.name}
                {derived && <em> · trang bị</em>}
              </span>
              <span className="atk-detail">
                {fmtMod(atk.attackBonus)} đánh · {atk.damage}
                {atk.damageType ? ` ${atk.damageType}` : ''}
              </span>
              <button
                className="roll-btn"
                onClick={() => rollDice(`${draft.name} · ${atk.name} (đánh)`, d20Check(atk.attackBonus))}
              >
                đánh
              </button>
              <button
                className="roll-btn"
                onClick={() => rollDice(`${draft.name} · ${atk.name} (sát thương)`, atk.damage)}
              >
                dmg
              </button>
              {!derived && (
                <button
                  className="link"
                  onClick={() =>
                    commit({ ...draft, attacks: draft.attacks.filter((a) => a.id !== atk.id) })
                  }
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
        {attacks.length === 0 && <p className="empty">Chưa có đòn nào. Trang bị vũ khí ở tab Túi đồ, hoặc thêm thủ công.</p>}
      </div>

      <details className="manual-attacks">
        <summary>Sửa đòn thủ công</summary>
        {draft.attacks.map((atk) => (
          <div key={atk.id} className="attack-edit">
            <input
              value={atk.name}
              placeholder="Tên"
              onChange={(e) =>
                commit({
                  ...draft,
                  attacks: draft.attacks.map((a) => (a.id === atk.id ? { ...a, name: e.target.value } : a)),
                })
              }
            />
            <input
              type="number"
              value={atk.attackBonus}
              title="+ đánh"
              onChange={(e) =>
                commit({
                  ...draft,
                  attacks: draft.attacks.map((a) =>
                    a.id === atk.id ? { ...a, attackBonus: Number(e.target.value) } : a,
                  ),
                })
              }
            />
            <input
              value={atk.damage}
              placeholder="1d8+3"
              onChange={(e) =>
                commit({
                  ...draft,
                  attacks: draft.attacks.map((a) => (a.id === atk.id ? { ...a, damage: e.target.value } : a)),
                })
              }
            />
          </div>
        ))}
        <button
          onClick={() =>
            commit({
              ...draft,
              attacks: [
                ...draft.attacks,
                { id: nanoIdish(), name: 'Đòn mới', attackBonus: 0, damage: '1d6', damageType: '', source: 'manual' },
              ],
            })
          }
        >
          + Thêm đòn thủ công
        </button>
      </details>

      <label className="notes">
        Ghi chú
        <textarea value={draft.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
      </label>
    </>
  );
}

function InventorySection({ draft, commit }: SectionProps) {
  const weight = carriedWeight(draft);
  const capacity = carryCapacity(draft);
  const over = weight > capacity;

  function setItem(id: string, patch: Partial<InventoryItem>) {
    commit({
      ...draft,
      inventory: draft.inventory.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    });
  }
  function removeItem(id: string) {
    commit({ ...draft, inventory: draft.inventory.filter((it) => it.id !== id) });
  }
  function addItem(type: ItemType) {
    commit({ ...draft, inventory: [...draft.inventory, blankItem(type)] });
  }

  return (
    <>
      <div className="currency-row">
        {COIN_TYPES.map((coin) => (
          <label key={coin}>
            {COIN_LABEL[coin]}
            <input
              type="number"
              min={0}
              value={draft.currency[coin]}
              onChange={(e) =>
                commit({
                  ...draft,
                  currency: { ...draft.currency, [coin]: Math.max(0, Number(e.target.value)) },
                })
              }
            />
          </label>
        ))}
        <span className="currency-total">≈ {currencyInGp(draft.currency).toFixed(2)} gp</span>
      </div>

      <div className={`weight-bar ${over ? 'over' : ''}`}>
        Trọng lượng: {weight} / {capacity} lb {over && '· quá tải'}
      </div>

      <div className="add-item-row">
        {(['weapon', 'armor', 'shield', 'gear'] as ItemType[]).map((t) => (
          <button key={t} onClick={() => addItem(t)}>
            + {ITEM_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="inventory-list">
        {draft.inventory.map((it) => (
          <details key={it.id} className={`inv-item ${it.equipped ? 'equipped' : ''}`}>
            <summary>
              <input
                type="checkbox"
                checked={it.equipped}
                title="Trang bị"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setItem(it.id, { equipped: e.target.checked })}
              />
              <span className="inv-name">{it.name}</span>
              <span className="inv-meta">
                {ITEM_TYPE_LABEL[it.type]}
                {it.quantity > 1 ? ` ×${it.quantity}` : ''}
              </span>
            </summary>

            <div className="inv-fields">
              <label className="grow">
                Tên
                <input value={it.name} onChange={(e) => setItem(it.id, { name: e.target.value })} />
              </label>
              <label>
                Loại
                <select
                  value={it.type}
                  onChange={(e) => setItem(it.id, { type: e.target.value as ItemType })}
                >
                  {(['weapon', 'armor', 'shield', 'gear'] as ItemType[]).map((t) => (
                    <option key={t} value={t}>
                      {ITEM_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                SL
                <input
                  type="number"
                  min={1}
                  value={it.quantity}
                  onChange={(e) => setItem(it.id, { quantity: Math.max(1, Number(e.target.value)) })}
                />
              </label>
              <label>
                Nặng (lb)
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={it.weight}
                  onChange={(e) => setItem(it.id, { weight: Math.max(0, Number(e.target.value)) })}
                />
              </label>

              {it.type === 'weapon' && (
                <>
                  <label>
                    Chỉ số
                    <select
                      value={it.weaponAbility ?? 'str'}
                      onChange={(e) => setItem(it.id, { weaponAbility: e.target.value as WeaponAbility })}
                    >
                      <option value="str">STR</option>
                      <option value="dex">DEX</option>
                      <option value="finesse">Linh hoạt</option>
                    </select>
                  </label>
                  <label>
                    Sát thương
                    <input
                      value={it.damage ?? ''}
                      placeholder="1d8"
                      onChange={(e) => setItem(it.id, { damage: e.target.value })}
                    />
                  </label>
                  <label>
                    Loại dmg
                    <input
                      value={it.damageType ?? ''}
                      onChange={(e) => setItem(it.id, { damageType: e.target.value })}
                    />
                  </label>
                  <label className="chk">
                    <input
                      type="checkbox"
                      checked={it.proficient ?? false}
                      onChange={(e) => setItem(it.id, { proficient: e.target.checked })}
                    />
                    Thành thạo
                  </label>
                  <label>
                    +đánh phụ
                    <input
                      type="number"
                      value={it.attackBonusMisc ?? 0}
                      onChange={(e) => setItem(it.id, { attackBonusMisc: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    +dmg phụ
                    <input
                      type="number"
                      value={it.damageBonusMisc ?? 0}
                      onChange={(e) => setItem(it.id, { damageBonusMisc: Number(e.target.value) })}
                    />
                  </label>
                </>
              )}

              {it.type === 'armor' && (
                <>
                  <label>
                    AC nền
                    <input
                      type="number"
                      value={it.armorBase ?? 10}
                      onChange={(e) => setItem(it.id, { armorBase: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Hạng giáp
                    <select
                      value={it.armorCategory ?? 'medium'}
                      onChange={(e) => setItem(it.id, { armorCategory: e.target.value as ArmorCategory })}
                    >
                      <option value="light">Nhẹ (full DEX)</option>
                      <option value="medium">Vừa (DEX tối đa +2)</option>
                      <option value="heavy">Nặng (không DEX)</option>
                    </select>
                  </label>
                  <label className="chk">
                    <input
                      type="checkbox"
                      checked={it.stealthDisadvantage ?? false}
                      onChange={(e) => setItem(it.id, { stealthDisadvantage: e.target.checked })}
                    />
                    Bất lợi Ẩn nấp
                  </label>
                </>
              )}

              {it.type === 'shield' && (
                <label>
                  Bonus AC
                  <input
                    type="number"
                    value={it.armorBase ?? 2}
                    onChange={(e) => setItem(it.id, { armorBase: Number(e.target.value) })}
                  />
                </label>
              )}

              <label className="grow">
                Ghi chú
                <input value={it.notes} onChange={(e) => setItem(it.id, { notes: e.target.value })} />
              </label>
              <button className="danger" onClick={() => removeItem(it.id)}>
                Xóa
              </button>
            </div>
          </details>
        ))}
        {draft.inventory.length === 0 && <p className="empty">Túi đồ trống.</p>}
      </div>
    </>
  );
}
