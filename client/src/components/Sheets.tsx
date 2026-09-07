import { useEffect, useState } from 'react';
import {
  ABILITIES,
  SKILLS,
  abilityMod,
  d20Check,
  fmtMod,
  initiativeBonus,
  proficiencyByLevel,
  saveBonus,
  skillBonus,
  type Ability,
  type CharacterSheet,
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
    speed: 30,
    initiativeMisc: 0,
    attacks: [],
    notes: '',
  };
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
          <button
            key={s.id}
            className={s.id === openId ? 'on' : ''}
            onClick={() => setOpenId(s.id)}
          >
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

function SheetEditor({ sheet }: { sheet: CharacterSheet }) {
  const send = useStore((s) => s.send);
  const tokens = useStore((s) => s.room?.tokens ?? []);
  const [draft, setDraft] = useState<CharacterSheet>(sheet);

  // Adopt server updates unless this editor currently has focus (mid-typing).
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
    send({ t: 'roll', label: `${draft.name} · ${label}`, notation: d20Check(mod) });
  }

  return (
    <div className="sheet-editor">
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

      <div className="se-row">
        <label>
          AC
          <input
            type="number"
            value={draft.armorClass}
            onChange={(e) => set('armorClass', Number(e.target.value))}
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
          HP tối đa
          <input
            type="number"
            value={draft.maxHp}
            onChange={(e) => set('maxHp', Number(e.target.value))}
          />
        </label>
        <label>
          HP tạm
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
      </div>

      <label className="se-row">
        Token liên kết
        <select
          value={draft.tokenId ?? ''}
          onChange={(e) => set('tokenId', e.target.value || undefined)}
        >
          <option value="">— không —</option>
          {tokens.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

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
                  commit({
                    ...draft,
                    abilities: { ...draft.abilities, [ab]: Number(e.target.value) },
                  })
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

      <details className="attacks-block" open>
        <summary>Đòn tấn công</summary>
        {draft.attacks.map((atk) => (
          <div key={atk.id} className="attack-edit">
            <input
              value={atk.name}
              placeholder="Tên"
              onChange={(e) =>
                commit({
                  ...draft,
                  attacks: draft.attacks.map((a) =>
                    a.id === atk.id ? { ...a, name: e.target.value } : a,
                  ),
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
                  attacks: draft.attacks.map((a) =>
                    a.id === atk.id ? { ...a, damage: e.target.value } : a,
                  ),
                })
              }
            />
            <button
              className="roll-btn"
              onClick={() =>
                send({
                  t: 'roll',
                  label: `${draft.name} · ${atk.name} (đánh)`,
                  notation: d20Check(atk.attackBonus),
                })
              }
            >
              đánh
            </button>
            <button
              className="roll-btn"
              onClick={() =>
                send({
                  t: 'roll',
                  label: `${draft.name} · ${atk.name} (sát thương)`,
                  notation: atk.damage,
                })
              }
            >
              dmg
            </button>
            <button
              className="link"
              onClick={() =>
                commit({ ...draft, attacks: draft.attacks.filter((a) => a.id !== atk.id) })
              }
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            commit({
              ...draft,
              attacks: [
                ...draft.attacks,
                { id: nanoIdish(), name: 'Đòn mới', attackBonus: 0, damage: '1d6', damageType: '' },
              ],
            })
          }
        >
          + Thêm đòn
        </button>
      </details>

      <label className="notes">
        Ghi chú
        <textarea value={draft.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
      </label>

      <div className="se-footer">
        <button
          className="danger"
          onClick={() => send({ t: 'removeSheet', id: draft.id })}
        >
          Xóa nhân vật
        </button>
        {dirty && <span className="dirty">đang lưu…</span>}
      </div>
    </div>
  );
}
