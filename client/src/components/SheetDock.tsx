import { useEffect, useState } from 'react';
import {
  ABILITIES,
  SKILLS,
  abilityMod,
  actionDamageParts,
  allActions,
  applyLongRest,
  applyShortRest,
  computeArmorClass,
  d20Check,
  emptyCurrency,
  fmtMod,
  initiativeBonus,
  proficiencyByLevel,
  RIDER_PRESETS,
  saveBonus,
  skillBonus,
  type Ability,
  type ActionType,
  type CharacterSheet,
  type DamagePart,
  type SheetAction,
} from '@dnd-table/shared';
import { useStore } from '../store.js';
import { nanoIdish } from '../util.js';
import { FormulaHint } from './FormulaHint.js';
import { DamageRidersEditor, DamageTypeSelect, ExtraDamageEditor } from './DefensesEditor.js';
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

export const SKILL_LABEL_VI: Record<string, string> = {
  acrobatics: 'Nhào lộn',
  'animal-handling': 'Thuần thú',
  arcana: 'Huyền bí',
  athletics: 'Điền kinh',
  deception: 'Lừa dối',
  history: 'Lịch sử',
  insight: 'Thấu hiểu',
  intimidation: 'Đe dọa',
  investigation: 'Điều tra',
  medicine: 'Y thuật',
  nature: 'Tự nhiên',
  perception: 'Quan sát',
  performance: 'Trình diễn',
  persuasion: 'Thuyết phục',
  religion: 'Tôn giáo',
  'sleight-of-hand': 'Tay nghề',
  stealth: 'Ẩn nấp',
  survival: 'Sinh tồn',
};

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export function RollModeToggle({
  mode,
  onChange,
}: {
  mode: RollMode;
  onChange: (m: RollMode) => void;
}) {
  return (
    <div className="roll-mode">
      {(
        [
          ['disadvantage', 'Bất lợi'],
          ['normal', 'Thường'],
          ['advantage', 'Lợi thế'],
        ] as [RollMode, string][]
      ).map(([m, label]) => (
        <button key={m} className={mode === m ? 'on' : ''} onClick={() => onChange(m)}>
          {label}
        </button>
      ))}
    </div>
  );
}

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
    damageRiders: [],
    resources: [],
    spellSlots: [],
    feats: [],
    features: [],
    inventory: [],
    currency: emptyCurrency(),
    notes: '',
  };
}

type SubTab = 'basic' | 'skills' | 'equipment' | 'feats' | 'abilities';

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
                ['skills', 'Kỹ năng'],
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
      {sub === 'skills' && <SkillsTab {...ctx} />}
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

function TokenAvatar({
  token,
  active,
}: {
  token: { label: string; color: string; imageUrl?: string; currentHp?: number; maxHp?: number } | null;
  active: boolean;
}) {
  if (!token) {
    return (
      <div className="bt-avatar empty" title="Chưa gán token">
        ?
      </div>
    );
  }
  const hpPct =
    typeof token.currentHp === 'number' && typeof token.maxHp === 'number' && token.maxHp > 0
      ? Math.max(0, Math.min(100, (token.currentHp / token.maxHp) * 100))
      : null;
  return (
    <div
      className={`bt-avatar ${active ? 'active' : ''}`}
      style={
        token.imageUrl
          ? { backgroundImage: `url(${token.imageUrl})` }
          : { background: token.color }
      }
      title={token.label}
    >
      {!token.imageUrl && <span>{token.label.slice(0, 2)}</span>}
      {hpPct !== null && (
        <div className="bt-avatar-hp">
          <div style={{ width: `${hpPct}%` }} />
        </div>
      )}
    </div>
  );
}

function BasicTab({ draft, commit }: EditorCtx) {
  const send = useStore((s) => s.send);
  const rollDice = useStore((s) => s.rollDice);
  const attackRoll = useStore((s) => s.attackRoll);
  const damageRoll = useStore((s) => s.damageRoll);
  const rollInitiativeForMe = useStore((s) => s.rollInitiativeForMe);
  const applyEffect = useStore((s) => s.applyEffect);
  const removeEffect = useStore((s) => s.removeEffect);
  const tokens = useStore((s) => s.room?.tokens ?? []);
  const allSheets = useStore((s) => s.room?.sheets ?? []);
  const initiative = useStore((s) => s.room?.initiative);
  const linkableTokens = tokens.filter(
    (t) =>
      !t.statblock &&
      (t.id === draft.tokenId || !allSheets.some((s) => s.id !== draft.id && s.tokenId === t.id)),
  );
  const linkedToken = tokens.find((t) => t.id === draft.tokenId) ?? null;
  const activeEntry = initiative?.entries.find((e) => e.isActive) ?? null;
  const myTurn = Boolean(
    initiative?.running &&
      activeEntry &&
      ((draft.tokenId && activeEntry.tokenId === draft.tokenId) ||
        activeEntry.name === draft.name),
  );
  const [targetId, setTargetId] = useState(draft.tokenId ?? '');
  const [showRolls, setShowRolls] = useState(false);
  const [rollMode, setRollMode] = useState<RollMode>('normal');
  const targetName = tokens.find((t) => t.id === targetId)?.label ?? '';

  function toggleSaveProf(ab: Ability, on: boolean) {
    commit({
      ...draft,
      saveProficiencies: on
        ? [...draft.saveProficiencies, ab]
        : draft.saveProficiencies.filter((x) => x !== ab),
    });
  }

  const ac = computeArmorClass(draft);
  const actions = allActions(draft);
  const modeTag =
    rollMode === 'advantage' ? ' (lợi thế)' : rollMode === 'disadvantage' ? ' (bất lợi)' : '';
  const roll = (label: string, mod: number) =>
    rollDice(`${draft.name} · ${label}${modeTag}`, d20Check(mod, rollMode));

  function set<K extends keyof CharacterSheet>(k: K, v: CharacterSheet[K]) {
    commit({ ...draft, [k]: v });
  }

  return (
    <div className="basic-tab">
      <div className="bt-header">
        <TokenAvatar token={linkedToken} active={myTurn} />
        <div className="bt-header-mid">
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
          <label className="bt-tokenlink">
            Token đại diện
            <select
              value={draft.tokenId ?? ''}
              onChange={(e) => set('tokenId', e.target.value || undefined)}
            >
              <option value="">— chưa gán —</option>
              {linkableTokens.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          className={`end-turn-btn ${myTurn ? 'my-turn' : ''}`}
          disabled={!myTurn}
          title={myTurn ? 'Kết thúc lượt của bạn' : 'Chưa tới lượt bạn'}
          onClick={() => send({ t: 'initNext' })}
        >
          Kết thúc lượt
        </button>
      </div>

      <div className="bt-rollmode">
        <span>Kiểu tung d20:</span>
        <RollModeToggle mode={rollMode} onChange={setRollMode} />
      </div>

      <div className="bt-cols">
        {/* abilities */}
        <div className="bt-col">

          <div className="ability-head">
            <span>Chỉ số</span>
            <button className="link" onClick={() => setShowRolls((v) => !v)}>
              {showRolls ? '▴ ẩn roll & save' : '▾ roll & save'}
            </button>
          </div>
          <div className={`ability-strip ${showRolls ? 'expanded' : ''}`}>
            {ABILITIES.map((ab) => {
              const mod = abilityMod(draft.abilities[ab]);
              const prof = draft.saveProficiencies.includes(ab);
              return (
                <div key={ab} className="ab-cell">
                  <div className="ab-top">
                    <span className="ab-key">{ABILITY_LABEL[ab]}</span>
                    <input
                      type="checkbox"
                      className="ab-saveprof"
                      checked={prof}
                      title="Thành thạo cứu nguy (saving throw)"
                      onChange={(e) => toggleSaveProf(ab, e.target.checked)}
                    />
                  </div>
                  <div className="ab-mid">
                    <input
                      type="number"
                      className="ab-score"
                      value={draft.abilities[ab]}
                      onChange={(e) =>
                        commit({
                          ...draft,
                          abilities: { ...draft.abilities, [ab]: Number(e.target.value) },
                        })
                      }
                    />
                    {showRolls && (
                      <span className="ab-mod" title="Modifier">
                        {fmtMod(mod)}
                      </span>
                    )}
                  </div>
                  {showRolls && (
                    <div className="ab-rolls">
                      <button
                        className="roll-btn sm"
                        onClick={() => roll(`${ab.toUpperCase()} check`, mod)}
                      >
                        check
                      </button>
                      <button
                        className={`roll-btn sm ${prof ? 'prof' : ''}`}
                        onClick={() => roll(`${ab.toUpperCase()} save`, saveBonus(draft, ab))}
                      >
                        save {fmtMod(saveBonus(draft, ab))}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="hint">Kỹ năng chuyển sang tab “Kỹ năng”.</p>
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
            <button
              className="roll-btn"
              title="Tung initiative và đưa lên thanh initiative"
              onClick={() =>
                rollInitiativeForMe(draft.name, initiativeBonus(draft), draft.tokenId, rollMode)
              }
            >
              ⚔ Init {fmtMod(initiativeBonus(draft))}
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
          {targetId && (
            <label className="target-pick">
              Đánh dấu
              <select
                value=""
                onChange={(e) => {
                  const p = RIDER_PRESETS.find((x) => x.name === e.target.value);
                  if (!p) return;
                  applyEffect(targetId, {
                    id: '',
                    name: p.name,
                    sourceSheetId: draft.id,
                    concentration: p.concentration,
                    rider: p.rider,
                  });
                }}
                title="Áp Hex / Hunter's Mark lên mục tiêu (tự lo concentration)"
              >
                <option value="">— chiêu —</option>
                {RIDER_PRESETS.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.rider.dice})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {(() => {
          const mine = (tokens.find((t) => t.id === targetId)?.effects ?? []).filter(
            (e) => e.sourceSheetId === draft.id,
          );
          if (mine.length === 0) return null;
          return (
            <div className="my-effects">
              {mine.map((e) => (
                <span key={e.id} className="eff-chip">
                  {e.name}
                  {e.rider ? ` +${e.rider.dice}` : ''}
                  {e.concentration ? ' 🧠' : ''}
                  <button className="link" onClick={() => removeEffect(targetId, e.id)}>
                    ✕
                  </button>
                </span>
              ))}
            </div>
          );
        })()}

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
                  parts={actionDamageParts(draft, a)}
                  sheetName={draft.name}
                  attacker={{ sheetId: draft.id, tokenId: draft.tokenId || undefined }}
                  targetId={targetId}
                  targetName={targetName}
                  rollMode={rollMode}
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

        <details className="rider-details">
          <summary>
            Nguồn sát thương thêm — rider ({draft.damageRiders.filter((r) => r.enabled).length})
          </summary>
          <p className="hint">
            Hiệu ứng cộng dmg không thuộc vũ khí nào (vd nhẫn +1d4 lửa cho đòn vũ khí).
          </p>
          <DamageRidersEditor
            riders={draft.damageRiders}
            onChange={(r) => set('damageRiders', r)}
          />
        </details>
      </div>
    </div>
  );
}

function ActionRow({
  action,
  parts,
  sheetName,
  attacker,
  targetId,
  targetName,
  rollMode,
  rollDice,
  attackRoll,
  damageRoll,
  onDelete,
}: {
  action: SheetAction;
  parts: DamagePart[];
  sheetName: string;
  attacker: { sheetId?: string; tokenId?: string };
  targetId: string;
  targetName: string;
  rollMode: RollMode;
  rollDice: (label: string, notation: string) => Promise<void>;
  attackRoll: (p: {
    label: string;
    attackNotation: string;
    damageParts: DamagePart[];
    targetTokenId: string;
    attackerSheetId?: string;
    attackerTokenId?: string;
  }) => Promise<void>;
  damageRoll: (
    label: string,
    parts: DamagePart[],
    targetTokenId: string,
    attacker?: { sheetId?: string; tokenId?: string },
  ) => Promise<void>;
  onDelete?: () => void;
}) {
  const base = `${sheetName} · ${action.name}`;
  const isAttack = typeof action.attackBonus === 'number' && parts.length > 0;
  const atkNotation = (bonus: number) => d20Check(bonus, rollMode);
  const combinedDamage = parts.map((p) => p.dice).join(' + ');
  const damageLabel = parts
    .map((p) => `${p.dice}${p.type ? ' ' + p.type : ''}`)
    .join(' + ');
  return (
    <div className={`action-row ${action.source === 'weapon' ? 'derived' : ''}`}>
      <span className="ar-name" title={action.description}>
        {action.name}
        {action.source === 'weapon' && <em> · trang bị</em>}
      </span>
      <span className="ar-detail">
        {isAttack
          ? `${fmtMod(action.attackBonus!)} · ${damageLabel}`
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
              attackNotation: atkNotation(action.attackBonus!),
              damageParts: parts,
              targetTokenId: targetId,
              attackerSheetId: attacker.sheetId,
              attackerTokenId: attacker.tokenId,
            })
          }
        >
          ⚔ {targetName}
        </button>
      )}
      {isAttack && !targetId && (
        <button
          className="roll-btn"
          onClick={() => rollDice(`${base} (đánh)`, atkNotation(action.attackBonus!))}
        >
          đánh
        </button>
      )}
      {parts.length > 0 && (
        <button
          className="roll-btn"
          onClick={() =>
            targetId
              ? damageRoll(`${base} → ${targetName}`, parts, targetId, attacker)
              : rollDice(`${base} (sát thương)`, combinedDamage)
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
        <div key={a.id} className="ae-row-wrap">
        <div className="ae-row">
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
          <DamageTypeSelect
            value={a.damageType}
            onChange={(v) => upd(a.id, { damageType: v })}
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
        <ExtraDamageEditor
          parts={a.extraDamage}
          onChange={(parts) => upd(a.id, { extraDamage: parts })}
        />
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
  function setPact(patch: Partial<NonNullable<typeof draft.pactSlots>>) {
    if (!draft.pactSlots) return;
    commit({ ...draft, pactSlots: { ...draft.pactSlots, ...patch } });
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

      {draft.pactSlots && (
        <div className="res-row">
          <span className="res-name slot pact" title="Warlock Pact Magic — hồi khi nghỉ ngắn hoặc dài">
            Pact lv
            <input
              type="number"
              className="res-lvl"
              min={1}
              max={5}
              value={draft.pactSlots.level}
              onChange={(e) =>
                setPact({ level: Math.max(1, Math.min(5, Number(e.target.value))) })
              }
            />
          </span>
          <Pips
            max={draft.pactSlots.max}
            used={draft.pactSlots.used}
            onChange={(u) =>
              setPact({ used: Math.max(0, Math.min(draft.pactSlots!.max, u)) })
            }
          />
          <input
            type="number"
            className="res-max"
            value={draft.pactSlots.max}
            onChange={(e) => setPact({ max: Math.max(0, Number(e.target.value)) })}
          />
          <button
            className="link"
            onClick={() => commit({ ...draft, pactSlots: null })}
          >
            ✕
          </button>
        </div>
      )}

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
        {!draft.pactSlots && (
          <button
            onClick={() =>
              commit({ ...draft, pactSlots: { level: 1, max: 1, used: 0 } })
            }
          >
            + Pact Magic
          </button>
        )}
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

function SkillsTab({ draft, commit }: EditorCtx) {
  const rollDice = useStore((s) => s.rollDice);
  const [rollMode, setRollMode] = useState<RollMode>('normal');
  const modeTag =
    rollMode === 'advantage' ? ' (lợi thế)' : rollMode === 'disadvantage' ? ' (bất lợi)' : '';

  function toggle(list: 'skillProficiencies' | 'skillExpertise', sk: string, on: boolean) {
    let prof = new Set(draft.skillProficiencies);
    let exp = new Set(draft.skillExpertise);
    if (list === 'skillProficiencies') {
      if (on) prof.add(sk);
      else {
        prof.delete(sk);
        exp.delete(sk); // no expertise without proficiency
      }
    } else {
      if (on) {
        exp.add(sk);
        prof.add(sk); // expertise implies proficiency
      } else exp.delete(sk);
    }
    commit({ ...draft, skillProficiencies: [...prof], skillExpertise: [...exp] });
  }

  const perceptionPassive = 10 + skillBonus(draft, 'perception');

  return (
    <div className="skills-tab">
      <div className="st-head">
        <RollModeToggle mode={rollMode} onChange={setRollMode} />
        <span className="hint">Quan sát bị động: {perceptionPassive}</span>
      </div>
      <table className="skill-table">
        <thead>
          <tr>
            <th />
            <th title="Thành thạo">TT</th>
            <th title="Tinh thông (x2 thành thạo)">TT×2</th>
            <th>Kỹ năng</th>
            <th>Bonus</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(SKILLS).map(([sk, ability]) => {
            const prof = draft.skillProficiencies.includes(sk);
            const exp = draft.skillExpertise.includes(sk);
            const bonus = skillBonus(draft, sk);
            return (
              <tr key={sk}>
                <td className="st-abil">{ABILITY_LABEL[ability]}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={prof}
                    onChange={(e) => toggle('skillProficiencies', sk, e.target.checked)}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={exp}
                    onChange={(e) => toggle('skillExpertise', sk, e.target.checked)}
                  />
                </td>
                <td className="st-name">
                  {SKILL_LABEL_VI[sk] ?? sk} <span className="st-en">{sk}</span>
                </td>
                <td>
                  <button
                    className="roll-btn sm"
                    onClick={() =>
                      rollDice(
                        `${draft.name} · ${SKILL_LABEL_VI[sk] ?? sk}${modeTag}`,
                        d20Check(bonus, rollMode),
                      )
                    }
                  >
                    {fmtMod(bonus)}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

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
