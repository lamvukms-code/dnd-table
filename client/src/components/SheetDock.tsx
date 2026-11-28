import { TopMenu } from './TopMenu.js';
import { Fragment, memo, useEffect, useRef, useState } from 'react';
import {
  ABILITIES,
  circletTempHp,
  HEALTH_TIER_VI,
  SKILLS,
  abilityMod,
  actionDamageParts,
  allActions,
  applyLongRest,
  applyShortRest,
  barbarianLevel,
  effectiveArmorClass,
  computeSpeed,
  hitDicePools,
  attackRangeOf,
  type AttackRange,
  d20Check,
  derivedClassFeatures,
  emptyCurrency,
  fmtMod,
  initiativeBonus,
  casterTypeForClass,
  casterTypeOf,
  CONDITION_VI,
  rescaleCantripSpell,
  CONDITIONS,
  derivedSubclassFeatures,
  druidLevel,
  grappleDc,
  hasFeat,
  martialArtsDie,
  monkDc,
  pendingRollBonus,
  monkFocusMax,
  monkLevel,
  monkBonusUnarmedMax,
  isExperimentBarbarian,
  classDefaults,
  proficiencyByLevel,
  rageDamageBonus,
  rageMax,
  RIDER_PRESETS,
  rogueLevel,
  saveBonus,
  MAX_LEVEL,
  sheetClasses,
  attacksPerAction,
  economyKindOf,
  effectSaveAdvantage,
  oldWaysClass,
  spellLimits,
  WOOD_WOSE,
  castingClassesOf,
  extraAttackClasses,
  multiclassIssues,
  skillBonus,
  sneakAttackDice,
  subclassUsesMax,
  applySpecies,
  derivedSpeciesFeatures,
  findSpecies,
  speciesUsesMax,
  syncSpeciesSpells,
  SPECIES_SPELL_ABILITIES,
  applyBackground,
  findBackground,
  warlockLevel,
  wildShapeMax,
  spellAttackBonus,
  spellcastingAbilityOf,
  spellSaveDc,
  totalLevelOf,
  type Ability,
  type ActionType,
  type CasterType,
  type CharacterSheet,
  type InventoryItem,
  type ClassEntry,
  type ConditionType,
  type DamagePart,
  type SheetAction,
  type Spell,
  type SpellSlots,
  type SpellRecast,
  type Token,
  canRecastNow,
  recastForm,
  recastOf,
} from '@dnd-table/shared';
import { flashError, useStore } from '../store.js';
import { TurnActions } from './sheet/TurnActions.js';
import { StatDiamond } from './InspectorParts.js';
import { nanoIdish } from '../util.js';
import { SUBCLASS_DEFS } from '../subclassData.js';
import { SPECIES_DEFS } from '../speciesData.js';
import { BACKGROUND_DEFS } from '../backgroundData.js';
import { FormulaHint } from './FormulaHint.js';
import { DamageTypeSelect, ExtraDamageEditor } from './DefensesEditor.js';
import { EquipmentTab } from './sheet/EquipmentTab.js';
import { ClassSetup } from './sheet/ClassSetup.js';
import { JaegerFeatures } from './sheet/JaegerFeatures.js';
import { CUSTOM_CLASS_NAMES, ENEMY_ONLY_CLASS_KEYS, PLAYER_CUSTOM_CLASS_NAMES } from '../campaignData.js';
import { mapViewCenterCell } from '../mapView.js';
import { useWideLayout } from '../useMediaQuery.js';
import { ExhaustionStepper } from './Exhaustion.js';
import { FeatureActions } from './sheet/FeatureActions.js';
import { FeatureRiderBar } from './sheet/FeatureRiderBar.js';
import { AbilitiesTab, FeatsTab } from './sheet/ListTabs.js';
import { SpellAdder } from './sheet/SpellAdder.js';
import { FirearmControls } from './sheet/FirearmControls.js';
import { MadnessPanel } from './sheet/MadnessPanel.js';
import { openCharacterBuilder, useCharacterBuilder } from '../characterBuilder.js';
import { afterShots, canFire, coverDexSaveBonus, exhaustionPenalty, expendJaegerMomentum, attackKindOf, featFeatureDefs, featureAttackMod, jaegerLevel } from '@dnd-table/shared';

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
  legendary: 'Legendary',
  lair: 'Lair',
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
    spells: [],
    feats: [],
    features: [],
    inventory: [],
    currency: emptyCurrency(),
    notes: '',
  };
}

type SubTab = 'basic' | 'skills' | 'equipment' | 'spells' | 'feats' | 'abilities';

const DOCK_H_KEY = 'dnd-table.dockHeight';
const DOCK_W_KEY = 'dnd-table.dockWidth';

const PLAY_KEY = 'dnd.sheetPlay';

/** Small round face for a sheet: its token art, else its initials on the token colour. */
function SheetFace({ sheet, token }: { sheet: CharacterSheet | null; token?: Token }) {
  if (!sheet) return <span className="sd-face empty">?</span>;
  return token?.imageUrl ? (
    <span className="sd-face" style={{ backgroundImage: `url(${token.imageUrl})` }} />
  ) : (
    <span className="sd-face" style={{ background: token?.color ?? '#7a5a3a' }}>
      {sheet.name.slice(0, 2)}
    </span>
  );
}

function SheetDockImpl({ onClose }: { onClose?: () => void }) {
  const sheets = useStore((s) => s.room?.sheets)!;
  const send = useStore((s) => s.send);
  const isDm = useStore((s) => s.isDm());
  const meId = useStore((s) => s.participantId)!;

  const mine = sheets.filter((s) => s.ownerId === meId || isDm);
  const [openId, setOpenId] = useState<string | null>(mine[0]?.id ?? null);
  const [sub, setSub] = useState<SubTab>('basic');
  const sheet = sheets.find((s) => s.id === openId) ?? mine[0] ?? null;
  // Play mode (default): the sheet reads like a card — set-up fields turn into plain text, hints
  // and editor-only controls hide. "✏ Sửa" brings every field back. Remembered per viewer.
  const [play, setPlay] = useState(() => {
    try {
      return localStorage.getItem(PLAY_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const togglePlay = () =>
    setPlay((v) => {
      try {
        localStorage.setItem(PLAY_KEY, v ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !v;
    });
  const [pickOpen, setPickOpen] = useState(false);
  const tokens = useStore((s) => s.room?.tokens);
  const avatarOf = (s: CharacterSheet) => tokens?.find((t) => t.id === s.tokenId);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const hasBuilder = useCharacterBuilder();

  /** Read a filled-in character-sheet PDF in the browser and create the sheet from it. */
  async function importPdf(file: File) {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setImportNote('❌ Chỉ nhận file .pdf');
      return;
    }
    setImportNote('Đang đọc PDF…');
    try {
      const { importPdfSheet } = await import('../pdfSheet.js');
      const res = await importPdfSheet(file, meId, nanoIdish);
      send({ t: 'upsertSheet', sheet: res.sheet });
      setOpenId(res.sheet.id);
      setImportNote('✅ Đã nhập từ PDF\n' + res.report.join('\n'));
    } catch (e) {
      setImportNote('❌ ' + (e as Error).message);
    }
  }

  // Wide screens (≥1000px, incl. iPad landscape): the sheet floats as a right-hand panel with its own width;
  // narrower (iPad portrait): it floats along the bottom of the map with its own height. Each size is remembered.
  // 260px is the shortest height that still fits the ability strip + AC/HP row without
  // clipping CHA (the last ability cell) — see the "CHA bị AC/HP đè" bug: a saved dock
  // height below this, from an older/narrower layout, silently clips the last ability cell.
  const wide = useWideLayout();
  const MIN_DOCK_H = 260;
  const MIN_DOCK_W = 340;
  const [height, setHeight] = useState(() => {
    const v = Number(localStorage.getItem(DOCK_H_KEY));
    return v >= MIN_DOCK_H && v <= 900 ? v : Math.max(MIN_DOCK_H, Math.round(window.innerHeight * 0.27));
  });
  const [width, setWidth] = useState(() => {
    const v = Number(localStorage.getItem(DOCK_W_KEY));
    return v >= MIN_DOCK_W && v <= 900 ? v : 400;
  });
  // The dock floats over the map (Owlbear-style panel). Publish how much of the map it covers so
  // the zoom bar, token inspector, roll toasts and lookup panel can sit beside it.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--sheet-right', wide ? `${width + 16}px` : '0px');
    root.setProperty('--sheet-bottom', wide ? '0px' : `${height + 16}px`);
    return () => {
      root.removeProperty('--sheet-right');
      root.removeProperty('--sheet-bottom');
    };
  }, [wide, width, height]);
  const drag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const start = wide ? width : height;
    let last = start;
    const move = (ev: PointerEvent) => {
      if (wide) {
        // Leave the map at least ~45% of the window.
        last = Math.max(MIN_DOCK_W, Math.min(Math.round(window.innerWidth * 0.55), start + (startX - ev.clientX)));
        setWidth(last);
      } else {
        last = Math.max(MIN_DOCK_H, Math.min(window.innerHeight - 140, start + (startY - ev.clientY)));
        setHeight(last);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try {
        localStorage.setItem(wide ? DOCK_W_KEY : DOCK_H_KEY, String(Math.round(last)));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      className={`${wide ? 'sheet-dock side' : 'sheet-dock'}${play ? ' play' : ''}`}
      style={wide ? { width } : { height }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDrop={(e) => {
        const file = e.dataTransfer.files?.[0];
        if (file) {
          e.preventDefault();
          void importPdf(file);
        }
      }}
    >
      <div className="sd-resize" onPointerDown={drag} title="Kéo để đổi cỡ" />
      {importNote && (
        <div className="sd-import-note" onClick={() => setImportNote(null)} title="Bấm để ẩn">
          {importNote}
        </div>
      )}
      <div className="sd-tabs">
        <div className="sd-chars">
          <div className="sd-picker">
            <button
              className="sd-current"
              title={mine.length > 1 ? 'Đổi nhân vật' : undefined}
              onClick={() => mine.length > 1 && setPickOpen((v) => !v)}
            >
              <SheetFace sheet={sheet} token={sheet ? avatarOf(sheet) : undefined} />
              <span className="sd-current-name">{sheet?.name ?? 'Chưa có nhân vật'}</span>
              {mine.length > 1 && <span className="sd-caret">▾</span>}
            </button>
            {pickOpen && (
              <div className="sd-pick-list" onPointerLeave={() => setPickOpen(false)}>
                {mine.map((s) => (
                  <button
                    key={s.id}
                    className={s.id === (sheet?.id ?? '') ? 'on' : ''}
                    onClick={() => {
                      setOpenId(s.id);
                      setPickOpen(false);
                    }}
                  >
                    <SheetFace sheet={s} token={avatarOf(s)} />
                    <span>
                      {s.name}
                      {s.ownerId !== meId ? ' *' : ''}
                    </span>
                    <small>
                      {s.className} {s.level}
                    </small>
                  </button>
                ))}
              </div>
            )}
          </div>
          {sheet && (
            <button
              className={`sd-mode ${play ? '' : 'on'}`}
              title={play ? 'Đang ở chế độ Chơi — bấm để sửa sheet (hiện mọi ô nhập)' : 'Đang sửa — bấm để về chế độ Chơi gọn gàng'}
              onClick={togglePlay}
            >
              {play ? '✏ Sửa' : '✔ Xong'}
            </button>
          )}
          <TopMenu
            label="⋯"
            caret={false}
            title="Thêm / nhập / xóa nhân vật"
            items={[
              {
                label: '+ Nhân vật trống',
                onClick: () => {
                  const s = blankSheet(meId);
                  send({ t: 'upsertSheet', sheet: s });
                  setOpenId(s.id);
                  setPlay(false);
                },
              },
              { label: '📄 Nhập từ PDF', title: 'Nhập phiếu nhân vật từ file PDF (hoặc kéo thả PDF vào đây)', onClick: () => pdfRef.current?.click() },
              ...(hasBuilder
                ? [{ label: '🧙 Trang tạo nhân vật', title: 'Mở trang tạo nhân vật (tab mới), xuất PDF rồi nhập lại vào đây', onClick: openCharacterBuilder }]
                : []),
              ...(sheet
                ? [
                    {
                      label: `🗑 Xóa "${sheet.name}"`,
                      title: 'Xóa nhân vật này khỏi bàn chơi',
                      onClick: () => {
                        if (!window.confirm(`Xóa nhân vật "${sheet.name}"? Không hoàn tác được.`)) return;
                        send({ t: 'removeSheet', id: sheet.id });
                        setOpenId(null);
                      },
                    },
                  ]
                : []),
            ]}
          />
          {onClose && (
            <button className="sd-close" title="Ẩn character sheet (mở lại bằng nút 📜 Sheet trên thanh trên cùng)" onClick={onClose}>
              ✕
            </button>
          )}
          <input
            ref={pdfRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importPdf(file);
            }}
          />
        </div>
        {sheet && (
          <div className="sd-subtabs">
            {(
              [
                ['basic', '⚔', 'Chiến đấu'],
                ['skills', '🎯', 'Kỹ năng'],
                ['equipment', '🎒', 'Trang bị'],
                ['spells', '✨', 'Phép'],
                ['feats', '📜', 'Đặc điểm'],
                ['abilities', '⭐', 'Năng lực'],
              ] as [SubTab, string, string][]
            ).map(([key, icon, label]) => (
              <button key={key} className={sub === key ? 'on' : ''} title={label} onClick={() => setSub(key)}>
                <span className="sdt-icon">{icon}</span>
                <span className="sdt-label">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sd-body">
        {!sheet ? (
          <div className="empty">
            <p>Chưa có nhân vật. Bấm “⋯” ở trên để tạo sheet trống hoặc nhập từ PDF; bấm ✕ để ẩn ô này.</p>
            {hasBuilder && (
              <button className="primary" onClick={openCharacterBuilder}>
                🧙 Mở trang tạo nhân vật
              </button>
            )}
          </div>
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
  // The server copy the draft was last synced from — sent with each edit so the server only applies the
  // fields this player actually changed (no stale draft undoing damage or a disarmed rider).
  const base = useRef<CharacterSheet>(sheet);

  useEffect(() => {
    // Only hold back server updates while the player is actually typing in a field. Focus sitting on a
    // button (the last thing they clicked) must NOT freeze the draft: server-side changes such as a
    // level-up or a rider the server disarmed on a hit would otherwise stay invisible and then be overwritten by
    // the next edit, which commits the whole stale draft.
    const active = document.activeElement as HTMLElement | null;
    const typing =
      !!active &&
      !!active.closest('.sheet-dock') &&
      ((active.tagName === 'INPUT' &&
        !['checkbox', 'radio', 'button', 'range', 'color', 'file'].includes((active as HTMLInputElement).type)) ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable);
    if (!typing) {
      setDraft(sheet);
      base.current = sheet;
    }
  }, [sheet]);

  function commit(next: CharacterSheet) {
    setDraft(next);
    send({ t: 'upsertSheet', sheet: next, base: base.current });
    base.current = next;
  }
  const ctx: EditorCtx = { draft, commit };

  const meId = useStore((st) => st.participantId);
  const round = useStore((st) => st.room?.levelUp);
  const pending = useStore((st) => st.levelUpPending);
  const claimLevelUp = useStore((st) => st.claimLevelUp);
  const [classIdx, setClassIdx] = useState(0);
  const lvlClasses = sheetClasses(draft);
  const canLevelUp =
    !!round &&
    sheet.ownerId === meId &&
    !round.claimed.includes(sheet.id) &&
    !pending.includes(`${round.id}:${sheet.id}`) &&
    totalLevelOf(draft) < MAX_LEVEL;

  return (
    <div className="sheet-editor">
      {canLevelUp && (
        <div className="levelup-banner">
          <button className="levelup-btn" onClick={() => void claimLevelUp(sheet.id, Math.min(classIdx, lvlClasses.length - 1))}>
            ⬆ LÊN CẤP {totalLevelOf(draft)} → {totalLevelOf(draft) + 1}
          </button>
          {lvlClasses.length > 1 && (
            <select className="play-keep" value={classIdx} onChange={(e) => setClassIdx(Number(e.target.value))} title="Chọn class sẽ tăng cấp">
              {lvlClasses.map((c, i) => (
                <option key={i} value={i}>
                  {c.name || '?'} {c.level}
                </option>
              ))}
            </select>
          )}
          <span className="hint">
            DM đã mở thăng cấp — tự roll Hit Die + CON để tăng máu (ra 1 thì roll lại, lấy kết quả sau).
          </span>
        </div>
      )}
      {sub === 'basic' && <BasicTab {...ctx} />}
      {sub === 'skills' && <SkillsTab {...ctx} />}
      {sub === 'equipment' && <EquipmentTab {...ctx} />}
      {sub === 'spells' && <SpellsTab {...ctx} />}
      {sub === 'feats' && <FeatsTab {...ctx} />}
      {sub === 'abilities' && <AbilitiesTab {...ctx} />}
    </div>
  );
}

/** Shown while the character is at 0 HP: the server rolls the death saves at the start of each
 *  turn; the tally can be nudged by hand (Spare the Dying, a Medicine check, DM rulings). */
function DeathSaveBanner({ draft, commit }: EditorCtx) {
  const ds = draft.deathSaves ?? { success: 0, fail: 0 };
  const set = (patch: Partial<typeof ds>) => commit({ ...draft, deathSaves: { ...ds, ...patch } });
  const pips = (n: number, key: 'success' | 'fail', mark: string) =>
    [0, 1, 2].map((i) => (
      <button
        key={i}
        className={`ds-pip ${key} ${i < n ? 'on' : ''}`}
        title="Bấm để chỉnh tay"
        onClick={() => {
          const v = i < n ? i : i + 1;
          set(key === 'fail' ? { fail: v, dead: v >= 3 || undefined } : { success: v, stable: v >= 3 || undefined });
        }}
      >
        {i < n ? mark : '○'}
      </button>
    ));
  return (
    <div className={`death-banner ${ds.dead ? 'dead' : ds.stable ? 'stable' : ''}`}>
      <strong>{ds.dead ? '☠ Đã chết' : ds.stable ? '😮‍💨 Ổn định (0 HP)' : '☠ Đang hấp hối'}</strong>
      <span className="ds-row">Thành công {pips(ds.success, 'success', '✓')}</span>
      <span className="ds-row">Thất bại {pips(ds.fail, 'fail', '✗')}</span>
      {!ds.dead && !ds.stable && (
        <button className="link" title="Spare the Dying, Medicine DC 10 của đồng đội…" onClick={() => set({ stable: true })}>
          Ổn định
        </button>
      )}
      <span className="hint">Tự tung death save đầu mỗi lượt · hồi máu bất kỳ là tỉnh lại</span>
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
  const spendEconomy = useStore((s) => s.spendEconomy);
  const removeEffect = useStore((s) => s.removeEffect);
  const grapple = useStore((s) => s.grapple);
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
  // 2024 RAW: a plain grapple attempt (no feat) spends one of your attacks like any other attack
  // roll, and deals no damage. Grappler feat: "Punch and Grab" — hitting with an Unarmed Strike
  // lets you deal damage AND grapple on that same swing, once per turn (separate combo button).
  const hasGrappler = hasFeat(draft, 'Grappler');
  const grapplerComboUsed = Boolean(initiative?.running && linkedToken?.turnUsed?.grapplerComboUsed);
  function markGrapplerComboUsed() {
    if (!linkedToken || !initiative?.running) return;
    send({ t: 'setTurnUsed', tokenId: linkedToken.id, patch: { grapplerComboUsed: true } });
  }
  const [targetId, setTargetId] = useState(draft.tokenId ?? '');
  const [showRolls, setShowRolls] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const multiClass = (draft.classes?.length ?? 0) > 0;
  const [rollMode, setRollMode] = useState<RollMode>('normal');
  const targetToken = tokens.find((t) => t.id === targetId);
  const targetName = targetToken?.label ?? '';

  // Bug: attacking a target token that was removed/replaced from the map (e.g. the DM re-dragged
  // a fresh copy from the Bestiary) sent `attack` with a dangling targetTokenId. The server
  // rightly rejected it ("Target token not found") before ever rolling — but the Action/Bonus had
  // already been marked spent client-side by `onSpend`, which fires before the roll. Net effect:
  // no attack roll, no damage roll, action gone. Clearing the stale selection here means the
  // dropdown falls back to "— không —" and the target-less "đánh" button (no server round trip
  // to a token id) before the player can ever click into that state.
  useEffect(() => {
    if (targetId && !tokens.some((t) => t.id === targetId)) setTargetId('');
  }, [targetId, tokens]);

  function toggleSaveProf(ab: Ability, on: boolean) {
    commit({
      ...draft,
      saveProficiencies: on
        ? [...draft.saveProficiencies, ab]
        : draft.saveProficiencies.filter((x) => x !== ab),
    });
  }

  const ac = effectiveArmorClass(draft, linkedToken?.effects);
  const speedInfo = computeSpeed(draft);
  const actions = allActions(draft, linkedToken?.effects);
  const roll = (label: string, mod: number, kind: 'check' | 'save' | 'other' = 'other', ab?: Ability) => {
    // Oaken Resolve (Wood Wose): Advantage on STR / CON saves — cancels a Disadvantage
    const effMode: RollMode =
      kind === 'save' && ab && effectSaveAdvantage(linkedToken?.effects, ab) ? (rollMode === 'disadvantage' ? 'normal' : 'advantage') : rollMode;
    // plain ability checks don't go through skillBonus/saveBonus, so add Exhaustion here
    let notation = d20Check(mod + (kind === 'check' ? exhaustionPenalty(draft.exhaustion) : 0), effMode);
    let extra = '';
    const gb = kind === 'check' ? pendingRollBonus(linkedToken ?? undefined, 'check') : undefined;
    if (gb) {
      notation = `${notation}+${gb.dice}`;
      extra = ` +${gb.dice} (${gb.name})`;
    }
    rollDice(`${draft.name} · ${label}${effMode === 'advantage' ? ' (lợi thế)' : effMode === 'disadvantage' ? ' (bất lợi)' : ''}${extra}`, notation);
    if (gb && draft.tokenId) removeEffect(draft.tokenId, gb.id);
  };

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
            {multiClass && <ClassListEditor draft={draft} commit={commit} />}
            {!multiClass && (
              <input
                className="bt-class"
                placeholder="Lớp"
                value={draft.className}
                onChange={(e) => set('className', e.target.value)}
              />
            )}
            {!multiClass && (
              <>
                <input
                  className="bt-subclass"
                  list={`subclass-list-${draft.id}`}
                  placeholder="Subclass"
                  title="Subclass — features của subclass tự hiện bên dưới (gõ hoặc chọn từ gợi ý)"
                  value={draft.subclass ?? ''}
                  onChange={(e) => set('subclass', e.target.value || undefined)}
                />
                <datalist id={`subclass-list-${draft.id}`}>
                  {Array.from(
                    new Set(
                      SUBCLASS_DEFS.filter(
                        (d) => d.class.toLowerCase() === draft.className.trim().toLowerCase(),
                      ).map((d) => d.subclass),
                    ),
                  ).map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </>
            )}
            {SPECIES_DEFS.length > 0 && (
              <select
                className="bt-species"
                title="Species — đổi ở đây sẽ đổi luôn racial features, tốc độ và phép chủng tộc"
                value={draft.species ?? ''}
                onChange={(e) =>
                  commit(applySpecies(draft, findSpecies(SPECIES_DEFS, e.target.value), nanoIdish))
                }
              >
                <option value="">— Species —</option>
                {SPECIES_DEFS.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
            {BACKGROUND_DEFS.length > 0 && (
              <select
                className="bt-background"
                title="Background — đổi ở đây sẽ đổi luôn skill proficiency và Origin Feat được cấp"
                value={draft.background ?? ''}
                onChange={(e) =>
                  commit(applyBackground(draft, findBackground(BACKGROUND_DEFS, e.target.value), nanoIdish))
                }
              >
                <option value="">— Background —</option>
                {BACKGROUND_DEFS.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
            <label>
              Cấp
              <input
                type="number"
                min={1}
                max={20}
                value={draft.level}
                disabled={multiClass}
                title={multiClass ? 'Đa nghề: cấp tổng = tổng cấp các nghề (sửa ở danh sách nghề)' : undefined}
                onChange={(e) => {
                  const level = Number(e.target.value);
                  const leveled = { ...draft, level, proficiencyBonus: proficiencyByLevel(level) };
                  commit(
                    draft.species
                      ? syncSpeciesSpells(leveled, findSpecies(SPECIES_DEFS, draft.species), nanoIdish)
                      : leveled,
                  );
                }}
              />
            </label>
            {!multiClass && (
              <button
                className="bt-multi edit-only"
                title="Thêm nghề thứ hai (đa nghề / multiclass)"
                onClick={() =>
                  commit({
                    ...draft,
                    classes: [
                      { name: draft.className, subclass: draft.subclass, level: draft.level },
                      { name: '', level: 1 },
                    ],
                    subclass: undefined,
                  })
                }
              >
                + nghề phụ
              </button>
            )}
            <span className="bt-prof">
              {multiClass ? `Tổng cấp ${totalLevelOf(draft)} · ` : ''}Thành thạo {fmtMod(draft.proficiencyBonus)}
            </span>
            <button
              className="bt-setup edit-only"
              title="Tự điền save, kỹ năng class, HP và feature theo class + cấp"
              onClick={() => setShowSetup(true)}
            >
              ✨ Điền theo class
            </button>
            {showSetup && (
              <ClassSetup draft={draft} commit={commit} onClose={() => setShowSetup(false)} />
            )}
          </div>
          {!linkedToken && (
            <button
              className="bt-place"
              title="Đặt token nhân vật vào giữa khung bản đồ đang xem"
              onClick={() => {
                const c = mapViewCenterCell() ?? { x: 0, y: 0 };
                send({ t: 'placeSheetToken', sheetId: draft.id, x: c.x, y: c.y });
              }}
            >
              📍 Đặt lên bản đồ
            </button>
          )}
          <label className="bt-tokenlink edit-only">
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

      {draft.currentHp <= 0 && <DeathSaveBanner draft={draft} commit={commit} />}
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
                      className="ab-saveprof edit-only"
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
                        onClick={() => roll(`${ab.toUpperCase()} check`, mod, 'check')}
                      >
                        check
                      </button>
                      <button
                        className={`roll-btn sm ${prof ? 'prof' : ''}`}
                        title={ab === 'dex' && coverDexSaveBonus(linkedToken?.cover) ? 'Đã cộng che chắn của token vào save DEX' : undefined}
                        onClick={() => {
                          const cov = ab === 'dex' ? coverDexSaveBonus(linkedToken?.cover) : 0;
                          roll(`${ab.toUpperCase()} save${cov ? ` (+${cov} che chắn)` : ''}`, saveBonus(draft, ab) + cov, 'save', ab);
                        }}
                      >
                        save {fmtMod(saveBonus(draft, ab) + (ab === 'dex' ? coverDexSaveBonus(linkedToken?.cover) : 0))}
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
            <button
              className={`insp-badge ${draft.heroicInspiration ? 'on' : ''}`}
              title={
                draft.heroicInspiration
                  ? 'Đang có Heroic Inspiration — dùng cho 1 D20 Test bất kỳ (tự chọn Lợi thế khi tung), rồi bấm lại để tắt.'
                  : 'Chưa có Heroic Inspiration — bấm khi DM cấp.'
              }
              onClick={() => set('heroicInspiration', !draft.heroicInspiration)}
            >
              ✨
            </button>
            {/* AC / HP / speed in the same diamond frames as the token statblock */}
            <div className="sbx-core sheet-core">
              <StatDiamond label="AC" width={72} title={`Armor Class: ${ac.source}`}>
                {ac.ac}
              </StatDiamond>
              <StatDiamond
                label="HP"
                width={124}
                title="Hit Points hiện tại / tối đa · dòng dưới: HP tạm"
                unit={
                  <label className="sheet-temp" title="HP tạm">
                    tạm
                    <input
                      type="number"
                      className="play-keep"
                      aria-label="HP tạm"
                      value={draft.tempHp}
                      onChange={(e) => set('tempHp', Number(e.target.value))}
                    />
                  </label>
                }
              >
                <input
                  type="number"
                  className="play-keep sbx-hp"
                  aria-label="HP"
                  value={draft.currentHp}
                  onChange={(e) => set('currentHp', Number(e.target.value))}
                />
                <span className="sbx-slash">/</span>
                <span className="sheet-hpmax">{draft.maxHp}</span>
              </StatDiamond>
              <StatDiamond label="Tốc độ" width={96} unit="ft" title={speedInfo.notes.length ? speedInfo.notes.join(', ') : 'Tốc độ đi bộ'}>
                {speedInfo.speed}
              </StatDiamond>
            </div>
            <label className="edit-only">
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
            <label className="edit-only">
              HP tối đa
              <input
                type="number"
                value={draft.maxHp}
                onChange={(e) => set('maxHp', Number(e.target.value))}
              />
            </label>
            <label className="edit-only">
              Tốc độ gốc
              <input
                type="number"
                value={draft.speed}
                onChange={(e) => set('speed', Number(e.target.value))}
              />
              {speedInfo.notes.length > 0 && (
                <span className="hint" title={speedInfo.notes.join(', ')}>
                  = {speedInfo.speed} ft ({speedInfo.notes.join(', ')})
                </span>
              )}
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
            <button
              className="rest"
              onClick={() => commit(withSpeciesRest(withSubclassRest(applyShortRest(draft), 'short'), 'short'))}
            >
              Nghỉ ngắn
            </button>
            <button className="rest" onClick={() => commit(applyLongRest(draft))}>
              Nghỉ dài
            </button>
            <button
              className="rest edit-only"
              title="Test-only: hồi hết Action/Bonus/Reaction của token + toàn bộ tài nguyên nhân vật (như Nghỉ dài), để tiện thử lại một tình huống mà không cần đợi qua lượt/qua đêm thật"
              onClick={() => {
                commit({ ...applyLongRest(draft), sneakAttackArmed: false, boomingBladeArmed: false });
                if (linkedToken) send({ t: 'resetTurnUsed', tokenId: linkedToken.id });
              }}
            >
              🔧 Reset (test)
            </button>
            <ExhaustionStepper value={draft.exhaustion} onChange={(v) => commit({ ...draft, exhaustion: v })} />
          </div>
          <MadnessPanel sheet={draft} commit={commit} />

          <HitDice draft={draft} />
          <Resources draft={draft} commit={commit} />
        </div>
      </div>

      {/* actions economy — kept right after stats, above the reference text below, since this is
          what gets used every turn */}
      <div className="bt-actions">
        <h4 className="bta-title">Hành động</h4>
        {/* Target bar: big, always visible (sticky while the sheet scrolls) — every attack/spell
            row below aims at this, so it must be impossible to miss. */}
        <div className={`target-bar ${targetId ? 'has' : ''}`}>
          <span className="tb-title">🎯 Mục tiêu</span>
          <select
            className="tb-select play-keep"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            title="Chọn token mục tiêu cho các nút đánh / phép bên dưới"
          >
            <option value="">— chưa chọn mục tiêu —</option>
            {tokens.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          {targetToken && (
            <span className="tb-stats">
              {typeof targetToken.armorClass === 'number' && <span>🛡 AC {targetToken.armorClass}</span>}
              {targetToken.healthTier && (
                <span title="AC / HP của kẻ địch được giấu — chỉ thấy tình trạng">
                  {HEALTH_TIER_VI[targetToken.healthTier].icon} {HEALTH_TIER_VI[targetToken.healthTier].text}
                </span>
              )}
              {typeof targetToken.currentHp === 'number' && typeof targetToken.maxHp === 'number' && (
                <span>
                  ♥ {targetToken.currentHp}/{targetToken.maxHp}
                </span>
              )}
            </span>
          )}
          {targetId && (
            <label className="tb-mark">
              Đánh dấu
              <select
                className="play-keep"
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

        <FeatureRiderBar sheet={draft} commit={commit} />
        <EconomyBar token={linkedToken} sheet={draft} />
        <TurnActions sheet={draft} token={linkedToken} targetId={targetId} rollMode={rollMode} />

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
              {rows.map((a) => {
                const flurryActive = Boolean(linkedToken?.turnUsed?.monkFlurryActive);
                const trySpend = (attack: boolean) => {
                  const kind = economyKindOf(a.actionType);
                  if (!kind) return true;
                  const maxAttacks =
                    a.id === 'monk-unarmed-bonus' ? monkBonusUnarmedMax(draft, flurryActive) : a.id.startsWith('offhand:') ? 1 : attacksPerAction(draft);
                  return spendEconomy(draft.tokenId || undefined, kind, { attack, maxAttacks });
                };
                // Firearms: an empty / jammed gun can't fire; each shot spends a round from the barrel.
                const gun = a.id.startsWith('weapon:') ? draft.inventory.find((it) => `weapon:${it.id}` === a.id && it.firearm) : undefined;
                const commitItem = (it: InventoryItem) => commit({ ...draft, inventory: draft.inventory.map((x) => (x.id === it.id ? it : x)) });
                const steady = gun?.firearm?.steadyArmed ? { ...a, name: `${a.name} (Steady)`, attackBonus: (a.attackBonus ?? 0) + draft.proficiencyBonus } : a;
                // armed feature riders that change the attack roll (e.g. −5 to hit / +10 damage)
                const atkMod = typeof steady.attackBonus === 'number' ? featureAttackMod(draft, attackKindOf(steady), steady) : 0;
                const rowAction = atkMod ? { ...steady, name: `${steady.name} (${atkMod > 0 ? '+' : ''}${atkMod})`, attackBonus: steady.attackBonus! + atkMod } : steady;
                const rowParts = actionDamageParts(draft, a, linkedToken?.effects, { monkFlurryActive: flurryActive });
                const spendRow = (attack: boolean) => {
                  if (gun && attack) {
                    if (gun.firearm!.spreadFire) {
                      flashError(`${gun.name} không bắn thường được: dùng nút 🔺 Phun.`);
                      return false;
                    }
                    const c = canFire(gun);
                    if (!c.ok) {
                      flashError(`${gun.name}: ${c.reason}`);
                      return false;
                    }
                  }
                  if (!trySpend(attack)) return false;
                  if (gun && attack) commitItem(afterShots(gun));
                  return true;
                };
                return (
                <Fragment key={a.id}>
                <ActionRow
                  key={a.id}
                  action={rowAction}
                  parts={rowParts}
                  onSpend={spendRow}
                  sheetName={draft.name}
                  attacker={{ sheetId: draft.id, tokenId: draft.tokenId || undefined }}
                  targetId={targetId}
                  targetName={targetName}
                  rollMode={rollMode}
                  rollDice={rollDice}
                  attackRoll={attackRoll}
                  damageRoll={damageRoll}
                  onFired={() => {
                    const jaegerArmed = !!draft.jaeger?.armedFinisher;
                    const featArmed = (draft.featureRidersArmed ?? []).length > 0;
                    const onceOn = draft.damageRiders.some((r) => r.once && r.enabled);
                    if (!draft.sneakAttackArmed && !draft.boomingBladeArmed && !jaegerArmed && !featArmed && !onceOn) return;
                    commit({
                      ...draft,
                      featureRidersArmed: [],
                      // one-shot riders (Smite…) switch off once their damage has been rolled
                      damageRiders: draft.damageRiders.map((r) => (r.once && r.enabled ? { ...r, enabled: false } : r)),
                      sneakAttackArmed: false,
                      boomingBladeArmed: false,
                      // an armed Jaeger Finisher expends all Momentum dice once its damage is rolled
                      ...(jaegerArmed ? { jaeger: expendJaegerMomentum(draft) } : {}),
                    });
                  }}
                  grapple={
                    (a.id === 'unarmed' || a.id === 'monk-unarmed') && targetId
                      ? {
                          dc: grappleDc(draft),
                          grappling: (
                            tokens.find((t) => t.id === targetId)?.effects ?? []
                          ).some(
                            (e) => e.sourceSheetId === draft.id && e.condition === 'grappled',
                          ),
                          onToggle: (release: boolean) => {
                            // A plain grapple attempt spends an attack, same as any other swing
                            // (2024 RAW) — releasing an existing grapple is free.
                            if (!release && !trySpend(true)) return;
                            grapple({
                              targetTokenId: targetId,
                              dc: grappleDc(draft),
                              label: `${draft.name} · Vật lộn`,
                              sourceSheetId: draft.id,
                              sourceTokenId: draft.tokenId || undefined,
                              release,
                            });
                          },
                        }
                      : undefined
                  }
                  grapplerCombo={
                    hasGrappler && (a.id === 'unarmed' || a.id === 'monk-unarmed') && targetId
                      ? {
                          dc: grappleDc(draft),
                          used: grapplerComboUsed,
                          onFire: () => {
                            if (!trySpend(true)) return;
                            markGrapplerComboUsed();
                            void attackRoll({
                              label: `${draft.name} · ${a.name} (Punch and Grab)`,
                              attackBonus: a.attackBonus!,
                              rollMode,
                              damageParts: actionDamageParts(draft, a, linkedToken?.effects),
                              targetTokenId: targetId,
                              attackerSheetId: draft.id,
                              attackerTokenId: draft.tokenId || undefined,
                              attackRange: attackRangeOf(a),
                              attackKind: attackKindOf(a),
                              grappleOnHit: { dc: grappleDc(draft) },
                            });
                          },
                        }
                      : undefined
                  }
                  cleaveReady={!!linkedToken?.turnUsed?.cleaveReady && !linkedToken?.turnUsed?.cleaveUsed}
                  onToggleRange={
                    a.id === 'unarmed' || a.id === 'monk-unarmed' || a.id.startsWith('offhand:')
                      ? undefined
                      : () => {
                          const next: AttackRange = attackRangeOf(a) === 'melee' ? 'ranged' : 'melee';
                          if (a.id.startsWith('weapon:')) {
                            const itemId = a.id.slice('weapon:'.length);
                            commit({
                              ...draft,
                              inventory: draft.inventory.map((it) =>
                                it.id === itemId ? { ...it, attackRange: next } : it,
                              ),
                            });
                          } else {
                            commit({
                              ...draft,
                              actions: draft.actions.map((x) => (x.id === a.id ? { ...x, attackRange: next } : x)),
                            });
                          }
                        }
                  }
                  onDelete={
                    a.source === 'weapon'
                      ? undefined
                      : () => commit({ ...draft, actions: draft.actions.filter((x) => x.id !== a.id) })
                  }
                />
                {gun && (
                  <FirearmControls
                    sheet={draft}
                    item={gun}
                    action={rowAction}
                    parts={rowParts}
                    targetId={targetId || undefined}
                    targetName={targetName}
                    commitItem={commitItem}
                    trySpend={trySpend}
                  />
                )}
                </Fragment>
                );
              })}
            </div>
          );
        })}
        {actions.length === 0 && (
          <p className="empty">Chưa có hành động. Trang bị vũ khí hoặc thêm bên dưới.</p>
        )}

        <ActionEditor draft={draft} commit={commit} />

      </div>

      {/* reference text — class/species/background/subclass; collapsed by default below the
          quick-action toggles and the action list, so they don't push actual gameplay out of view */}
      <div className="cf-reference">
        {jaegerLevel(draft) > 0 && (
          <div className="cf-quick">
            <JaegerFeatures draft={draft} commit={commit} />
          </div>
        )}
        <ClassFeatures draft={draft} commit={commit} />
        <SpeciesFeatures draft={draft} commit={commit} />
        <BackgroundFeatures draft={draft} />
        <SubclassFeatures draft={draft} commit={commit} targetId={targetId} />
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
  onFired,
  onSpend,
  grapple,
  grapplerCombo,
  onToggleRange,
  onDelete,
  cleaveReady,
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
    attackNotation?: string;
    damageParts: DamagePart[];
    targetTokenId: string;
    attackBonus?: number;
    rollMode?: RollMode;
    attackerSheetId?: string;
    attackerTokenId?: string;
    attackRange?: AttackRange;
    attackKind?: 'weapon' | 'spell';
    rangeText?: string;
    mastery?: SheetAction['mastery'];
    cleave?: boolean;
  }) => Promise<void>;
  damageRoll: (
    label: string,
    parts: DamagePart[],
    targetTokenId: string,
    attacker?: { sheetId?: string; tokenId?: string },
  ) => Promise<void>;
  /** Called before the row's primary roll; false = the player cancelled (economy already spent). */
  onSpend?: (attack: boolean) => boolean;
  onFired?: () => void;
  grapple?: {
    dc: number;
    grappling: boolean;
    /** A plain grapple attempt (release=false) spends an attack like any other swing. */
    onToggle: (release: boolean) => void;
  };
  /** Grappler feat "Punch and Grab": one button that rolls to hit and, on a hit, deals damage
   *  AND attempts the grapple — capped to once per turn. */
  grapplerCombo?: {
    dc: number;
    used: boolean;
    onFire: () => void;
  };
  onToggleRange?: () => void;
  onDelete?: () => void;
  /** Cleave mastery earned an extra attack this turn: fire it at the current target. */
  cleaveReady?: boolean;
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
        {action.range ? <em className="ar-range"> · tầm {action.range}</em> : null}
      </span>
      {isAttack && (
        <button
          className={`range-tag ${attackRangeOf(action)}`}
          disabled={!onToggleRange}
          title={
            attackRangeOf(action) === 'melee'
              ? 'Cận chiến — bấm để đổi sang tầm xa (tầm xa đánh sát địch bị bất lợi)'
              : 'Tầm xa — bấm để đổi sang cận chiến'
          }
          onClick={onToggleRange}
        >
          {attackRangeOf(action) === 'melee' ? '⚔ cận' : '🏹 xa'}
        </button>
      )}
      {isAttack && targetId && (
        <button
          className="roll-btn strong"
          onClick={() => {
            if (onSpend && !onSpend(true)) return;
            void attackRoll({
              label: `${base} → ${targetName}`,
              attackBonus: action.attackBonus!,
              rollMode,
              damageParts: parts,
              targetTokenId: targetId,
              attackerSheetId: attacker.sheetId,
              attackerTokenId: attacker.tokenId,
              attackRange: attackRangeOf(action),
              attackKind: attackKindOf(action),
              rangeText: action.range ?? action.description,
              mastery: action.mastery,
            });
            // Armed riders (Sneak Attack, Booming Blade, Finishers…) are disarmed by the server on a hit.
          }}
        >
          ⚔ {targetName}
        </button>
      )}
      {isAttack && targetId && cleaveReady && action.mastery?.kind === 'cleave' && action.baseDamage && (
        <button
          className="roll-btn"
          title="Cleave: đòn thêm vào 1 kẻ khác trong 5 ft của mục tiêu đầu (trong tầm với), không cộng điểm chỉ số vào sát thương. 1 lần/lượt, không tốn đòn."
          onClick={() =>
            void attackRoll({
              label: `${base} · Cleave → ${targetName}`,
              attackBonus: action.attackBonus!,
              rollMode,
              // the weapon's own dice without the ability modifier; the other parts stay
              damageParts: parts.map((p, i) => (i === 0 ? { ...p, dice: action.baseDamage! } : p)),
              targetTokenId: targetId,
              attackerSheetId: attacker.sheetId,
              attackerTokenId: attacker.tokenId,
              attackRange: 'melee',
              attackKind: 'weapon',
              cleave: true,
            })
          }
        >
          🪓 Cleave → {targetName}
        </button>
      )}
      {isAttack && !targetId && (
        <button
          className="roll-btn"
          onClick={() => {
            if (onSpend && !onSpend(true)) return;
            void rollDice(`${base} (đánh)`, atkNotation(action.attackBonus!));
          }}
        >
          đánh
        </button>
      )}
      {parts.length > 0 && (
        <button
          className="roll-btn"
          onClick={() => {
            if (!isAttack && onSpend && !onSpend(false)) return; // damage-only rows spend on their roll
            if (targetId) void damageRoll(`${base} → ${targetName}`, parts, targetId, attacker);
            else {
              // No target: the server can't see the hit, so disarm the riders here.
              void rollDice(`${base} (sát thương)`, combinedDamage);
              onFired?.();
            }
          }}
        >
          {targetId ? 'sát thương' : 'dmg'}
        </button>
      )}
      {action.notation && !action.damage && (
        <button className="roll-btn" onClick={() => { if (onSpend && !onSpend(false)) return; void rollDice(base, action.notation!); }}>
          tung
        </button>
      )}
      {grapple && (
        <button
          className={`roll-btn grapple ${grapple.grappling ? 'on' : ''}`}
          title={
            grapple.grappling
              ? `Thả ${targetName}`
              : `Vật lộn ${targetName} (tốn 1 đòn tấn công, không gây sát thương — mục tiêu cứu STR/DEX vs DC ${grapple.dc})`
          }
          onClick={() => grapple.onToggle(grapple.grappling)}
        >
          {grapple.grappling ? '✋ thả' : `🤼 vật lộn DC${grapple.dc}`}
        </button>
      )}
      {grapplerCombo && targetId && (
        <button
          className="roll-btn strong"
          disabled={grapplerCombo.used}
          title={
            grapplerCombo.used
              ? 'Punch and Grab (Grappler) đã dùng lượt này'
              : `Punch and Grab: trúng thì vừa gây sát thương vừa vật lộn ${targetName} (DC ${grapplerCombo.dc}) — 1 lần/lượt`
          }
          onClick={grapplerCombo.onFire}
        >
          🥊 Punch &amp; Grab
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
          <input
            className="ae-range"
            placeholder="tầm"
            value={a.range ?? ''}
            onChange={(e) => upd(a.id, { range: e.target.value || undefined })}
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
  const caster = casterTypeOf(draft);
  // Vancian slots for full / half / third casters; pact slots for Warlock only.
  const showVancian = caster === 'full' || caster === 'half' || caster === 'third';
  const showPact = caster === 'pact';

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

      {showVancian &&
        draft.spellSlots
          .slice()
          .sort((a, b) => a.level - b.level)
          .map((s) => (
            <div key={s.level} className="res-row">
              <span className="res-name slot">Ô {s.level}</span>
              <Pips max={s.max} used={s.used} onChange={(u) => setSlot(s.level, u)} />
              <span className="res-max ro">/{s.max}</span>
            </div>
          ))}

      {showPact && draft.pactSlots && (
        <div className="res-row">
          <span className="res-name slot pact" title="Warlock Pact Magic — hồi khi nghỉ ngắn hoặc dài">
            Pact ô {draft.pactSlots.level}
          </span>
          <Pips
            max={draft.pactSlots.max}
            used={draft.pactSlots.used}
            onChange={(u) => setPact({ used: Math.max(0, Math.min(draft.pactSlots!.max, u)) })}
          />
          <span className="res-max ro">/{draft.pactSlots.max}</span>
        </div>
      )}

      {caster !== 'none' && (
        <p className="hint">Ô phép tự tính theo class &amp; cấp (5e 2024) — chỉnh cấp/nghề ở tab Phép.</p>
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
      </div>
    </div>
  );
}

/* ------------------------------------------------------ Class features */

function FocusPips({
  max,
  used,
  onChange,
}: {
  max: number;
  used: number;
  onChange: (u: number) => void;
}) {
  return (
    <span className="cf-pips">
      {Array.from({ length: max }).map((_, i) => (
        <button
          key={i}
          className={`cf-pip ${i < used ? 'used' : ''}`}
          title="Dùng / hồi điểm"
          onClick={() => onChange(i < used ? i : i + 1)}
        >
          ●
        </button>
      ))}
      <em>
        {max - used}/{max}
      </em>
    </span>
  );
}

function ClassFeatures({ draft, commit }: EditorCtx) {
  const send = useStore((s) => s.send);
  const room = useStore((s) => s.room);
  const linkedToken = room?.tokens.find((t) => t.id === draft.tokenId);
  const activateWoodWose = useStore((s) => s.activateWoodWose);
  const spendEconomy = useStore((s) => s.spendEconomy);
  const spendTurn = (kind: 'action' | 'bonus' | 'reaction') => spendEconomy(draft.tokenId || undefined, kind);
  const feats = derivedClassFeatures(draft);
  const hasBoomingBlade = draft.spells.some((sp) => sp.name === 'Booming Blade');
  if (feats.length === 0 && !hasBoomingBlade) return null;
  const rl = rogueLevel(draft);
  const bl = barbarianLevel(draft);
  const ml = monkLevel(draft);
  const wl = warlockLevel(draft);
  const dl = druidLevel(draft);
  const set = (patch: Partial<CharacterSheet>) => commit({ ...draft, ...patch });
  const wsMax = wildShapeMax(draft);
  const wsUsed = Math.min(draft.wildShapeUsed ?? 0, wsMax);
  // Circlet of Natural Rejuvenation: each Wild Shape use spent grants temp HP (never stacks — larger wins).
  const circletHp = circletTempHp(draft);
  const spendWildShape = (used: number) =>
    set({ wildShapeUsed: used, ...(circletHp > 0 ? { tempHp: Math.max(draft.tempHp ?? 0, circletHp) } : {}) });

  const sneakDice = sneakAttackDice(draft);
  const boomingBladeTier =
    totalLevelOf(draft) >= 17 ? 4 : totalLevelOf(draft) >= 11 ? 3 : totalLevelOf(draft) >= 5 ? 2 : 1;
  const rMax = rageMax(draft);
  const rUsed = Math.min(draft.rageUsed ?? 0, rMax);
  const rBonus = rageDamageBonus(draft);
  const fMax = monkFocusMax(draft);
  const fUsed = Math.min(draft.focusUsed ?? 0, fMax);
  const spendFocus = (n = 1) => set({ focusUsed: Math.min(fMax, fUsed + n) });
  const flurryActive = Boolean(linkedToken?.turnUsed?.monkFlurryActive);
  // Flurry of Blows: spend 1 Focus Point to raise this turn's Bonus Action Unarmed Strike (see
  // `allActions`'s 'monk-unarmed-bonus' row, in the action list below) from 1 free strike to 2 (3
  // from level 10). The strikes themselves are rolled from that row, same as any other attack —
  // this button only pays the cost and flags the turn; `monkFlurryActive` clears automatically
  // with the rest of `turnUsed` when this token's next turn starts.
  const spendFlurry = () => {
    if (fUsed >= fMax) return;
    spendFocus();
    if (linkedToken) send({ t: 'setTurnUsed', tokenId: linkedToken.id, patch: { monkFlurryActive: true } });
  };

  // Circle of the Old Ways — Wood Wose (SRD-independent local subclass text): 1 Wild Shape, Bonus Action (or while
  // casting Shillelagh), 10 minutes. The effect itself (Bark Bulwark AC, Oaken Resolve, Rampant Growth temp HP at the
  // start of each turn, level 6/10/14 upgrades) is built by woodWoseEffect() and runs on the server.
  const woodTok = room?.tokens.find((t) => t.id === draft.tokenId);
  const isOldWays = !!oldWaysClass(draft);
  const woseEffect = woodTok?.effects?.find((e) => e.name === WOOD_WOSE);
  const woseActive = !!woseEffect;
  function toggleWoodWose() {
    if (!woodTok) return;
    if (woseEffect) {
      send({ t: 'removeEffect', tokenId: woodTok.id, effectId: woseEffect.id }); // dismiss early
      return;
    }
    if (wsUsed >= wsMax) return;
    if (!spendTurn('bonus')) return;
    spendWildShape(wsUsed + 1);
    activateWoodWose({ ...draft, wildShapeUsed: wsUsed + 1 });
  }

  const activeSerum = linkedToken?.effects?.find((e) => e.name.startsWith('Serum: '));
  const SERUM_DEFS: Record<'ferocity' | 'monstrosity' | 'reconstruction', { label: string; note: string }> = {
    ferocity: {
      label: 'Ferocity',
      note:
        'Bỏ qua Difficult Terrain. Khi trúng đòn cận chiến/không vũ khí, kích hoạt thêm mastery Cleave ' +
        '(đánh thêm 1 kẻ trong 5 ft mục tiêu) — app chưa mô phỏng weapon mastery/địa hình, tự áp dụng tay.',
    },
    monstrosity: {
      label: 'Monstrosity',
      note:
        'Reach +5 ft; nếu nhỏ hơn Large thì coi như Large. 1 lần/lượt khi trượt đòn STR: có thể cộng Rage ' +
        `Damage bonus (+${rBonus}) vào roll đó — app chưa tự động hoá phần cộng ngược này, tự áp dụng tay.`,
    },
    reconstruction: {
      label: 'Reconstruction',
      note:
        'Khi tiêm & đầu mỗi lượt của bạn: tự tiêu 1 Hit Die, hồi HP = tung + CON mod (không tự chuyển phần ' +
        'dư thành HP tạm). Ngưng lặng lẽ nếu hết Hit Die.',
    },
  };
  function pickSerum(kind: keyof typeof SERUM_DEFS) {
    if (!linkedToken) return;
    const def = SERUM_DEFS[kind];
    if (activeSerum?.name === `Serum: ${def.label}`) return;
    // The first pick (entering Rage) is free; switching serum afterward costs a Bonus Action.
    if (activeSerum && !spendTurn('bonus')) return;
    if (activeSerum) send({ t: 'removeEffect', tokenId: linkedToken.id, effectId: activeSerum.id });
    send({
      t: 'applyEffect',
      targetTokenId: linkedToken.id,
      effect: {
        id: '',
        name: `Serum: ${def.label}`,
        sourceSheetId: draft.id,
        note: def.note,
        ...(kind === 'reconstruction' ? { hitDieHeal: { die: classDefaults('barbarian')?.hitDie ?? 12 } } : {}),
      },
    });
  }

  function toggleRage() {
    if (draft.raging) {
      if (linkedToken && activeSerum) send({ t: 'removeEffect', tokenId: linkedToken.id, effectId: activeSerum.id });
      return set({ raging: false });
    }
    if (!spendTurn('bonus')) return; // entering a Rage is a Bonus Action
    set(rUsed < rMax ? { raging: true, rageUsed: rUsed + 1 } : { raging: true });
  }

  const hasQuickActions = bl > 0 || ml > 0 || wl > 0 || dl > 0 || rl > 0 || hasBoomingBlade;

  return (
    <div className="cf-block">
      {hasQuickActions && (
      <div className="cf-quick">
      {bl > 0 && (
        <div className="cf-auto">
          <button className={`cf-btn ${draft.raging ? 'on' : ''}`} onClick={toggleRage}>
            🔥{' '}
            {draft.raging
              ? `Đang Rage — +${rBonus} dmg cận chiến · kháng đâm/chém/đập · lợi thế STR`
              : 'Vào Rage'}
          </button>
          <span className="cf-label">Rage charge:</span>
          <FocusPips max={rMax} used={rUsed} onChange={(u) => set({ rageUsed: u })} />
        </div>
      )}

      {bl > 0 && draft.raging && isExperimentBarbarian(draft) && (
        <div className="cf-auto">
          <span className="cf-label">Volatile Serum:</span>
          {(Object.keys(SERUM_DEFS) as (keyof typeof SERUM_DEFS)[]).map((kind) => (
            <button
              key={kind}
              className={`cf-btn ${activeSerum?.name === `Serum: ${SERUM_DEFS[kind].label}` ? 'on' : ''}`}
              title={SERUM_DEFS[kind].note}
              onClick={() => pickSerum(kind)}
            >
              {SERUM_DEFS[kind].label}
            </button>
          ))}
        </div>
      )}

      {ml > 0 && (
        <div className="cf-auto cf-monk">
          <span className="cf-btn static">🥋 Martial Arts die: {martialArtsDie(draft)}</span>
          {fMax > 0 && (
            <>
              <span className="cf-label">Focus:</span>
              <FocusPips max={fMax} used={fUsed} onChange={(u) => set({ focusUsed: u })} />
              <button
                className={`cf-btn ${flurryActive ? 'on' : ''}`}
                disabled={fUsed >= fMax || flurryActive}
                onClick={spendFlurry}
                title="Nâng Đánh không vũ khí (Bonus Action) trong danh sách Action bên dưới lên 2 đòn (3 từ cấp 10), thay vì 1 đòn miễn phí"
              >
                {flurryActive ? '✓ Flurry đang bật' : 'Flurry of Blows −1'}
              </button>
              <button className="cf-btn" disabled={fUsed >= fMax} onClick={() => spendFocus()}
                title="Disengage bonus action">
                Patient Defense −1
              </button>
              <button className="cf-btn" disabled={fUsed >= fMax} onClick={() => spendFocus()}
                title="Dash + Disengage; nhảy xa gấp đôi">
                Step of the Wind −1
              </button>
              {ml >= 5 && (
                <button
                  className="cf-btn"
                  disabled={fUsed >= fMax}
                  onClick={() => spendFocus()}
                  title="Khi trúng đòn: mục tiêu save CON hoặc Stunned — DM/hệ thống roll save qua panel Hiệu ứng"
                >
                  Stunning Strike −1 (DC {monkDc(draft)})
                </button>
              )}
            </>
          )}
        </div>
      )}

      {wl > 0 && (
        <div className="cf-auto">
          <span className="hint">
            Pact Magic: quản lý ô phép, spell save DC & spell attack ở tab <strong>Phép</strong> (tự
            theo cấp Warlock). Invocations / Mystic Arcanum: xem danh sách dưới.
          </span>
        </div>
      )}

      {dl > 0 && (
        <div className="cf-auto">
          {wsMax > 0 ? (
            <>
              <span className="cf-label">Wild Shape:</span>
              <FocusPips max={wsMax} used={wsUsed} onChange={(u) => set({ wildShapeUsed: u })} />
              <button
                className="cf-btn"
                disabled={wsUsed >= wsMax}
                onClick={() => {
                  if (!spendTurn('bonus')) return;
                  spendWildShape(Math.min(wsMax, wsUsed + 1));
                }}
                title="Dùng 1 lần Wild Shape (hồi 1 khi nghỉ ngắn, hết khi nghỉ dài)"
              >
                Wild Shape −1{circletHp > 0 ? ` (+${circletHp} HP tạm)` : ''}
              </button>
              {isOldWays && (
                <button
                  className={`cf-btn ${woseActive ? 'on' : ''}`}
                  disabled={(!woseActive && wsUsed >= wsMax) || !woodTok}
                  onClick={toggleWoodWose}
                  title={
                    woseActive
                      ? 'Bấm để tắt Wood Wose (tự tắt khi hết 10 phút, về 0 HP hoặc mất khả năng hành động)'
                      : 'Bonus Action (hoặc khi đúc Shillelagh — lúc đó hỏi luôn): tốn 1 Wild Shape → AC = 10 + DEX + WIS (không giáp), HP tạm = WIS + PB (và mỗi đầu lượt), lợi thế save STR/CON, 10 phút'
                  }
                >
                  🌳 Wood Wose {woseActive ? '— ĐANG BẬT (bấm để tắt)' : '(−1 Wild Shape)'}
                </button>
              )}
              <span className="hint">Dùng stat block quái từ Bestiary cho hình dạng thú.</span>
            </>
          ) : (
            <span className="hint">Wild Shape từ cấp Druid 2.</span>
          )}
          <span className="hint">
            Phép: tab <strong>Phép</strong> (full caster WIS — ô phép, DC, spell attack tự tính).
          </span>
        </div>
      )}

      {rl > 0 && (
        <div className="cf-auto">
          <button
            className={`cf-btn ${draft.sneakAttackArmed ? 'on' : ''}`}
            onClick={() => set({ sneakAttackArmed: !draft.sneakAttackArmed })}
          >
            ⚔ Sneak Attack {draft.sneakAttackArmed ? `— SẴN SÀNG (+${sneakDice}d6)` : `(+${sneakDice}d6)`}
          </button>
          <span className="hint">
            Gạt trước khi tung đòn finesse/tầm xa; tự cộng vào damage rồi tự tắt. Cunning Action:
            Bonus Action Dash / Disengage / Hide.
          </span>
        </div>
      )}

      {hasBoomingBlade && (
        <div className="cf-auto">
          <button
            className={`cf-btn ${draft.boomingBladeArmed ? 'on' : ''}`}
            onClick={() => set({ boomingBladeArmed: !draft.boomingBladeArmed })}
          >
            💥 Booming Blade{' '}
            {draft.boomingBladeArmed ? `— SẴN SÀNG (+${boomingBladeTier}d8)` : `(+${boomingBladeTier}d8)`}
          </button>
          <span className="hint">
            Gạt trước khi tung đòn vũ khí cận chiến; tự cộng Thunder vào damage rồi tự tắt. Nếu
            mục tiêu tự di chuyển trước lượt kế của bạn, app tự gây thêm đúng số dice đó 1 lần khi
            mục tiêu bị kéo trên bản đồ.
          </span>
        </div>
      )}
      </div>
      )}

      {feats.length > 0 && (
        <details className="class-features">
          <summary>
            📖 Class features
            <span className="cf-count">{feats.length}</span>
            {rl > 0 && <em> · Rogue {rl}</em>}
            {bl > 0 && <em> · Barbarian {bl}</em>}
            {ml > 0 && <em> · Monk {ml}</em>}
            {wl > 0 && <em> · Warlock {wl}</em>}
            {dl > 0 && <em> · Druid {dl}</em>}
          </summary>
          <div className="cf-list">
            {feats.map((f) => (
              <div key={f.id} className="cf-row">
                <span className="cf-lvl">L{f.level}</span>
                <span className="cf-body">
                  <strong>{f.name}.</strong> {f.description}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** Reset subclass-feature use pools that recharge on the given rest. */
export function withSubclassRest(sheet: CharacterSheet, kind: 'short' | 'long'): CharacterSheet {
  const used = { ...(sheet.subclassUses ?? {}) };
  let changed = false;
  for (const f of [...derivedSubclassFeatures(sheet, SUBCLASS_DEFS), ...featFeatureDefs(sheet)]) {
    if (f.uses && (kind === 'long' || f.uses.recharge === 'short') && used[f.id]) {
      delete used[f.id];
      changed = true;
    }
  }
  return changed ? { ...sheet, subclassUses: used } : sheet;
}

/** Hit dice per die size; on a short rest the player spends one to roll + CON and heal. */
function HitDice({ draft }: { draft: CharacterSheet }) {
  const send = useStore((s) => s.send);
  const pools = hitDicePools(draft);
  if (pools.length === 0) return null;
  return (
    <div className="hit-dice">
      <span className="hd-label" title="Nghỉ dài: hồi tối đa một nửa tổng số Hit Dice (làm tròn xuống, tối thiểu 1)">
        Hit Dice
      </span>
      {pools.map((p) => (
        <span key={p.die} className="hd-pool">
          <strong>
            d{p.die} {p.left}/{p.max}
          </strong>
          <button
            className="roll-btn"
            disabled={p.left <= 0 || draft.currentHp >= draft.maxHp}
            title="Dùng 1 Hit Die: tung dX + CON và hồi máu (nghỉ ngắn)"
            onClick={() => send({ t: 'spendHitDie', sheetId: draft.id, die: p.die })}
          >
            ♥ dùng
          </button>
        </span>
      ))}
    </div>
  );
}

/** Reset species-trait use pools that recharge on the given rest. */
export function withSpeciesRest(sheet: CharacterSheet, kind: 'short' | 'long'): CharacterSheet {
  const def = findSpecies(SPECIES_DEFS, sheet.species);
  if (!def) return sheet;
  const used = { ...(sheet.speciesUses ?? {}) };
  let changed = false;
  for (const f of derivedSpeciesFeatures(sheet, def)) {
    if (f.uses && (kind === 'long' || f.uses.recharge === 'short') && used[f.id]) {
      delete used[f.id];
      changed = true;
    }
  }
  return changed ? { ...sheet, speciesUses: used } : sheet;
}

/** Racial traits of the chosen species (from the local species data), with use trackers. */
function SpeciesFeatures({ draft, commit }: EditorCtx) {
  const def = findSpecies(SPECIES_DEFS, draft.species);
  if (!def) return null;
  const feats = derivedSpeciesFeatures(draft, def);
  const used = draft.speciesUses ?? {};
  const setUse = (id: string, n: number) =>
    commit({ ...draft, speciesUses: { ...used, [id]: Math.max(0, n) } });
  const meta = [
    def.creatureType,
    def.size,
    `Speed ${def.speed} ft`,
    def.movement,
    def.darkvision ? `Darkvision ${def.darkvision} ft` : null,
  ].filter(Boolean);

  return (
    <details className="class-features species-features">
      <summary>
        🧬 Species — {def.name}
        {def.blurb ? ` (${def.blurb})` : ''}
      </summary>
      <p className="hint">{meta.join(' · ')}</p>
      {(def.spells?.length ?? 0) > 0 && (
        <label className="sf-ability">
          Chỉ số ra phép của species
          <select
            value={draft.speciesSpellAbility ?? draft.spellcastingAbility ?? 'wis'}
            onChange={(e) => {
              const a = e.target.value as (typeof SPECIES_SPELL_ABILITIES)[number];
              commit({ ...draft, speciesSpellAbility: a, spellcastingAbility: draft.spellcastingAbility ?? a });
            }}
          >
            {SPECIES_SPELL_ABILITIES.map((a) => (
              <option key={a} value={a}>
                {a.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="cf-list">
        {feats.map((f) => {
          const max = f.uses ? speciesUsesMax(f.uses.max, draft) : 0;
          const u = Math.min(used[f.id] ?? 0, max);
          return (
            <div key={f.id} className="cf-row">
              <span className="cf-lvl">{f.level && f.level > 1 ? `L${f.level}` : '•'}</span>
              <span className="cf-body">
                <strong>{f.name}.</strong> {f.description}
                {f.uses && (
                  <span className="cf-uses">
                    <FocusPips max={max} used={u} onChange={(n) => setUse(f.id, n)} />
                    <em>hồi khi nghỉ {f.uses.recharge === 'short' ? 'ngắn' : 'dài'}</em>
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </details>
  );
}

/**
 * Chosen background's granted Origin Feat + reference info (skills/tools/equipment/story
 * threads), plus a teaser for its paired Thread of Fate. Read-only — the feat itself already
 * lives (editable) in the Feats tab via `applyBackground`; this is just the "why". Only the
 * thread's name + one-line goal are shown here (never the touchpoints — those are DM-only
 * spoilers, see the Lore Book's "🧵 Fate Weaving" tab).
 */
function BackgroundFeatures({ draft }: { draft: CharacterSheet }) {
  const def = findBackground(BACKGROUND_DEFS, draft.background);
  if (!def) return null;
  return (
    <details className="class-features background-features">
      <summary>📜 Background — {def.name}</summary>
      <p className="hint">Chỉ số: {def.abilityScores}</p>
      <div className="cf-list">
        <div className="cf-row">
          <span className="cf-lvl">•</span>
          <span className="cf-body">
            <strong>{def.featName}.</strong> {def.featText}
          </span>
        </div>
      </div>
      {def.toolOrLanguage && <p className="hint">Thành thạo: {def.toolOrLanguage}</p>}
      <p className="hint">
        Trang bị: (A) {def.equipmentA} — hoặc (B) {def.equipmentB}
      </p>
      {def.threadOfFate && (
        <p className="hint">
          🧵 Thread of Fate: <b>{def.threadOfFate}</b>
          {def.threadGoal ? ` — ${def.threadGoal}` : ''}
        </p>
      )}
      {(def.storyThreads?.length ?? 0) > 0 && (
        <details>
          <summary>Gợi ý cốt truyện (1d6)</summary>
          <ul className="bg-flavor-list">
            {def.storyThreads!.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </details>
      )}
      {(def.trinkets?.length ?? 0) > 0 && (
        <details>
          <summary>Vật kỷ niệm khởi đầu (1d6)</summary>
          <ul className="bg-flavor-list">
            {def.trinkets!.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </details>
      )}
    </details>
  );
}

/** Subclass features, from the DM's local subclass data file. Separate from class features. */
function SubclassFeatures({ draft, commit, targetId }: EditorCtx & { targetId?: string }) {
  // subclass features + local feats that carry buttons / uses (setting feats…)
  const feats = [...derivedSubclassFeatures(draft, SUBCLASS_DEFS), ...featFeatureDefs(draft)];
  if (feats.length === 0) return null;
  const used = draft.subclassUses ?? {};
  const setUse = (id: string, n: number) =>
    commit({ ...draft, subclassUses: { ...used, [id]: Math.max(0, n) } });

  return (
    <details className="class-features subclass-features">
      <summary>
        ✦ Subclass & feat
        <span className="cf-count">{feats.length}</span>
      </summary>
      <div className="cf-list">
        {feats.map((f) => {
          const max = f.uses ? subclassUsesMax(f.uses.max, draft) : 0;
          const u = Math.min(used[f.id] ?? 0, max);
          return (
            <div key={f.id} className="cf-row">
              <span className="cf-lvl">L{f.level}</span>
              <span className="cf-body">
                <strong>{f.name}.</strong> {f.description}
                {f.uses && (
                  <span className="cf-uses">
                    <FocusPips max={max} used={u} onChange={(n) => setUse(f.id, n)} />
                    <em>hồi khi nghỉ {f.uses.recharge === 'short' ? 'ngắn' : 'dài'}</em>
                  </span>
                )}
                {f.actions && f.actions.length > 0 && (
                  <FeatureActions
                    sheet={draft}
                    classKey={f.class}
                    featureName={f.name}
                    actions={f.actions}
                    targetId={targetId}
                    onWeaponFired={() => {
                      if (!(draft.featureRidersArmed ?? []).length && !draft.damageRiders.some((r) => r.once && r.enabled)) return;
                      commit({
                        ...draft,
                        featureRidersArmed: [],
                        damageRiders: draft.damageRiders.map((r) => (r.once && r.enabled ? { ...r, enabled: false } : r)),
                      });
                    }}
                    spendUse={
                      f.uses
                        ? () => {
                            if (u >= max && !window.confirm(`${f.name}: đã hết lượt dùng. Vẫn dùng?`)) return false;
                            setUse(f.id, u + 1);
                            return true;
                          }
                        : undefined
                    }
                  />
                )}
              </span>
            </div>
          );
        })}
      </div>
    </details>
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
  const removeEffect = useStore((s) => s.removeEffect);
  const myToken = useStore((s) => s.room?.tokens ?? []).find((t) => t.id === draft.tokenId);
  const [rollMode, setRollMode] = useState<RollMode>('normal');
  const modeTag =
    rollMode === 'advantage' ? ' (lợi thế)' : rollMode === 'disadvantage' ? ' (bất lợi)' : '';

  function rollSkill(sk: string, bonus: number) {
    const gb = pendingRollBonus(myToken, 'check');
    let notation = d20Check(bonus, rollMode);
    let extra = '';
    if (gb) {
      notation = `${notation}+${gb.dice}`;
      extra = ` +${gb.dice} (${gb.name})`;
    }
    rollDice(`${draft.name} · ${SKILL_LABEL_VI[sk] ?? sk}${modeTag}${extra}`, notation);
    if (gb && draft.tokenId) removeEffect(draft.tokenId, gb.id);
  }

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
                  <button className="roll-btn sm" onClick={() => rollSkill(sk, bonus)}>
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

/* ------------------------------------------------------------------ Spells */

const CASTER_LABEL: Record<CasterType, string> = {
  full: 'Full caster',
  half: 'Half caster',
  third: 'Third caster (subclass)',
  pact: 'Pact Magic (Warlock)',
  none: 'Không phải caster',
};
const CAST_KIND_LABEL: Record<Spell['castKind'], string> = {
  attack: 'Đòn đánh phép',
  save: 'Bắt cứu nguy (save)',
  heal: 'Hồi máu (heal)',
  damage: 'Sát thương thẳng (tự trúng)',
  rider: 'Cộng dmg (rider)',
  utility: 'Tiện ích / hiệu ứng',
};

function SpellsTab({ draft, commit }: EditorCtx) {
  const beginCast = useStore((s) => s.beginCast);
  // what the linked token concentrates on — lasting spells (Call Lightning…) re-use without a slot while it holds
  const concOn = useStore((s) => s.room?.tokens.find((t) => t.id === draft.tokenId)?.concentration?.name);
  const casting = useStore((s) => s.castingSpell);
  const caster = casterTypeOf(draft);
  const ability = spellcastingAbilityOf(draft);
  const dc = spellSaveDc(draft);
  const atk = spellAttackBonus(draft);
  const spells = draft.spells ?? [];
  const prepared = spells.filter((s) => s.level === 0 || s.prepared).length;
  const wl = warlockLevel(draft);

  const set = (patch: Partial<CharacterSheet>) => commit({ ...draft, ...patch });
  const upd = (id: string, patch: Partial<Spell>) =>
    set({ spells: spells.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const byLevel = new Map<number, Spell[]>();
  for (const s of spells) byLevel.set(s.level, [...(byLevel.get(s.level) ?? []), s]);

  const multi = (draft.classes?.length ?? 0) > 0;

  return (
    <div className="spells-tab">
      <ClassListEditor draft={draft} commit={commit} />

      <div className="spell-head">
        {!multi && (
          <label>
            Loại caster
            <select
              value={draft.casterTypeOverride ?? ''}
              onChange={(e) =>
                set({ casterTypeOverride: (e.target.value || null) as CasterType | null })
              }
            >
              <option value="">tự nhận ({CASTER_LABEL[caster]})</option>
              {(['full', 'half', 'third', 'pact', 'none'] as CasterType[]).map((c) => (
                <option key={c} value={c}>
                  {CASTER_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Ability
          <select
            value={draft.spellcastingAbility ?? ''}
            onChange={(e) => set({ spellcastingAbility: (e.target.value || null) as Ability | null })}
          >
            <option value="">tự nhận{ability ? ` (${ABILITY_LABEL[ability]})` : ''}</option>
            {ABILITIES.map((a) => (
              <option key={a} value={a}>
                {ABILITY_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {caster === 'none' ? (
        <p className="hint">
          Class này không phải spellcaster. Nếu sai, chọn "Loại caster" ở trên.
        </p>
      ) : (
        <p className="spell-stats">
          <strong>Spell save DC {dc ?? '—'}</strong> · Spell atk {atk == null ? '—' : fmtMod(atk)} ·
          đã chuẩn bị {prepared} phép
        </p>
      )}

      {casting && (
        <p className="hint cast-armed">
          🪄 Đang ra <strong>{casting.spell.name}</strong> — bấm token địch trên bản đồ. (Esc để hủy)
        </p>
      )}

      {[...byLevel.keys()]
        .sort((a, b) => a - b)
        .map((lvl) => (
          <div key={lvl} className="spell-group">
            <span className="sg-label">{lvl === 0 ? 'Cantrip' : `Cấp ${lvl}`}</span>
            {byLevel.get(lvl)!.map((sp) => (
              <SpellRow
                key={sp.id}
                sp={sp}
                canCast={caster !== 'none'}
                onCast={(castAtLevel) => beginCast(draft.id, sp, castAtLevel)}
                onRecast={
                  canRecastNow(sp, concOn)
                    ? () => {
                        const rc = recastOf(sp)!;
                        const lvl = sp.lastCastLevel && sp.lastCastLevel > sp.level ? sp.lastCastLevel : undefined;
                        beginCast(draft.id, recastForm(sp, rc), rc.dice ? undefined : lvl, true);
                      }
                    : undefined
                }
                recastHint={recastOf(sp)}
                caster={caster}
                spellSlots={draft.spellSlots}
                showAgonizingBlast={wl > 0}
                castingClasses={castingClassesOf(draft).map((c) => c.name)}
                onChange={(p) => upd(sp.id, p)}
                onRescale={
                  sp.level === 0 && rescaleCantripSpell(sp, draft)
                    ? () => upd(sp.id, rescaleCantripSpell(sp, draft)!)
                    : undefined
                }
                onDelete={() => set({ spells: spells.filter((x) => x.id !== sp.id) })}
              />
            ))}
          </div>
        ))}

      <div className="edit-only">
        <SpellAdder draft={draft} onAdd={(sp) => set({ spells: [...spells, sp] })} />
      </div>
      {spells.length === 0 && <p className="empty">Chưa có phép nào.</p>}
    </div>
  );
}

function SpellRow({
  sp,
  canCast,
  castingClasses,
  showAgonizingBlast,
  caster,
  spellSlots,
  onCast,
  onRecast,
  recastHint,
  onChange,
  onRescale,
  onDelete,
}: {
  sp: Spell;
  canCast: boolean;
  /** Multiclass: the sheet's casting classes (a spell picks one → its ability / DC). */
  castingClasses: string[];
  /** Has Warlock levels: offer the Agonizing Blast / Repelling Blast toggles on damage cantrips
   *  (2024 — any one, not just Eldritch Blast). */
  showAgonizingBlast?: boolean;
  /** Vancian casters (full/half/third) can pick a higher slot to "Nâng ô" (upcast) — Pact Magic
   *  always auto-casts at its single slot level, so no picker for those. */
  caster?: CasterType;
  spellSlots?: SpellSlots[];
  onCast: (castAtLevel?: number) => void;
  /** Lasting spell still up (Call Lightning while concentrating): re-use it without a slot. */
  onRecast?: () => void;
  recastHint?: SpellRecast;
  onChange: (p: Partial<Spell>) => void;
  onRescale?: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [castLevel, setCastLevel] = useState(sp.level);
  useEffect(() => setCastLevel(sp.level), [sp.level]);
  const eligibleForAgonizingBlast = sp.level === 0 && (sp.damage?.length ?? 0) > 0;
  // Repelling Blast pushes on a HIT, so — unlike Agonizing Blast — it only makes sense on an
  // attack-roll cantrip, not a save-based damaging one.
  const eligibleForRepellingBlast =
    sp.level === 0 && sp.castKind === 'attack' && (sp.damage?.length ?? 0) > 0;
  const upcastLevels =
    sp.level > 0 && caster && caster !== 'pact' && caster !== 'none'
      ? (spellSlots ?? []).filter((s) => s.level >= sp.level).sort((a, b) => a.level - b.level)
      : [];
  return (
    <div className="spell-row">
      <div className="sr-line">
        {sp.level > 0 && (
          <input
            type="checkbox"
            checked={sp.prepared}
            title="Đã chuẩn bị"
            onChange={(e) => onChange({ prepared: e.target.checked })}
          />
        )}
        <input
          className="sr-name"
          value={sp.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <input
          className="sr-lvl"
          type="number"
          min={0}
          max={9}
          value={sp.level}
          title="Cấp phép (0 = cantrip)"
          onChange={(e) => onChange({ level: Math.max(0, Math.min(9, Number(e.target.value))) })}
        />
        {sp.concentration && <span className="sr-tag" title="Cần tập trung">C</span>}
        {showAgonizingBlast && eligibleForAgonizingBlast && (
          <button
            className={`sr-agonizing ${sp.agonizingBlast ? 'on' : ''}`}
            title={
              'Agonizing Blast (2024): chọn MỘT cantrip Warlock gây sát thương để cộng CHA mod vào sát thương — ' +
              'không chỉ Eldritch Blast, và lặp lại invocation này để chọn thêm cantrip khác. Bấm để bật/tắt cho phép này.'
            }
            onClick={() => onChange({ agonizingBlast: !sp.agonizingBlast })}
          >
            ⚡ Agonizing Blast
          </button>
        )}
        {showAgonizingBlast && eligibleForRepellingBlast && (
          <button
            className={`sr-agonizing ${sp.repellingBlast ? 'on' : ''}`}
            title={
              'Repelling Blast (2024): chọn MỘT cantrip Warlock gây sát thương (phải là đòn tấn công, không phải save) — ' +
              'khi trúng, đẩy mục tiêu 10ft, 1 lần mỗi lượt của bạn. Không chỉ Eldritch Blast. Bấm để bật/tắt cho phép này.'
            }
            onClick={() => onChange({ repellingBlast: !sp.repellingBlast })}
          >
            💨 Repelling Blast
          </button>
        )}
        {castingClasses.length > 1 && (
          <select
            className="sr-class"
            value={sp.castingClass ?? ''}
            title="Nghề ra phép: dùng chỉ số ra phép + DC của nghề này (đa nghề)"
            onChange={(e) => onChange({ castingClass: e.target.value || undefined })}
          >
            <option value="">nghề?</option>
            {castingClasses.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
        {onRescale && (
          <button
            className="link"
            title="Cập nhật số dice sát thương theo cấp hiện tại"
            onClick={onRescale}
          >
            ⟳
          </button>
        )}
        {canCast && upcastLevels.length > 0 && (
          <select
            className="sr-upcast play-keep"
            value={castLevel}
            title="Nâng ô: chọn Spell Slot cấp cao hơn để trừ khi ra phép này (sát thương/hiệu ứng vẫn chỉnh tay như thường)"
            onChange={(e) => setCastLevel(Number(e.target.value))}
          >
            {upcastLevels.map((s) => (
              <option key={s.level} value={s.level} disabled={s.used >= s.max}>
                Cấp {s.level} ({Math.max(0, s.max - s.used)}/{s.max})
              </option>
            ))}
          </select>
        )}
        {canCast && (
          <button
            className="roll-btn strong"
            onClick={() => onCast(upcastLevels.length > 0 ? castLevel : undefined)}
            title="Ra phép (chọn mục tiêu)"
          >
            🪄
          </button>
        )}
        {canCast && onRecast && (
          <button
            className="roll-btn"
            onClick={onRecast}
            title={`Lặp lại phép đang duy trì — không tốn ô phép${
              recastHint?.economy === 'action' ? ', tốn 1 action' : recastHint?.economy === 'bonus' ? ', tốn 1 bonus action' : ''
            }${recastHint?.dice ? ` (${recastHint.dice})` : ''}${sp.lastCastLevel && sp.lastCastLevel > sp.level ? `, giữ ô cấp ${sp.lastCastLevel}` : ''}`}
          >
            🔁
          </button>
        )}
        <button className="link" onClick={() => setOpen(!open)}>
          {open ? '▲' : '▾'}
        </button>
        <button className="link" onClick={onDelete}>
          ✕
        </button>
      </div>
      {open && (
        <div className="sr-detail">
          <label>
            Kiểu
            <select
              value={sp.castKind}
              onChange={(e) => onChange({ castKind: e.target.value as Spell['castKind'] })}
            >
              {(Object.keys(CAST_KIND_LABEL) as Spell['castKind'][]).map((k) => (
                <option key={k} value={k}>
                  {CAST_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="chk">
            <input
              type="checkbox"
              checked={sp.concentration ?? false}
              onChange={(e) => onChange({ concentration: e.target.checked })}
            />
            Tập trung
          </label>

          {sp.castKind === 'rider' && (
            <label>
              Dmg cộng
              <input
                className="xd-dice"
                placeholder="1d6"
                value={sp.rider?.dice ?? ''}
                onChange={(e) =>
                  onChange({ rider: { dice: e.target.value, type: sp.rider?.type ?? 'force' } })
                }
              />
              <DamageTypeSelect
                value={sp.rider?.type}
                onChange={(v) => onChange({ rider: { dice: sp.rider?.dice ?? '1d6', type: v ?? '' } })}
              />
            </label>
          )}

          {sp.castKind === 'heal' && (
            <label>
              Hồi máu (cộng mod tự động)
              <input
                className="xd-dice"
                placeholder="2d4"
                value={sp.heal ?? ''}
                onChange={(e) => onChange({ heal: e.target.value || undefined })}
              />
            </label>
          )}

          {(sp.castKind === 'attack' || sp.castKind === 'save' || sp.castKind === 'damage') && (
            <label className="grow">
              {sp.castKind === 'save'
                ? 'Sát thương khi fail save'
                : sp.castKind === 'damage'
                  ? 'Sát thương (tự trúng)'
                  : 'Sát thương'}
              <ExtraDamageEditor
                parts={sp.damage}
                onChange={(parts) => onChange({ damage: parts })}
              />
            </label>
          )}

          {sp.castKind === 'save' && (
            <>
              <label>
                Cứu bằng
                <select
                  value={sp.save?.ability ?? 'wis'}
                  onChange={(e) =>
                    onChange({
                      save: { ...(sp.save ?? { ability: 'wis' }), ability: e.target.value as Ability },
                    })
                  }
                >
                  {ABILITIES.map((a) => (
                    <option key={a} value={a}>
                      {ABILITY_LABEL[a]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                DC ép
                <input
                  className="sr-lvl"
                  type="number"
                  placeholder="tự"
                  value={sp.save?.dcOverride ?? ''}
                  onChange={(e) =>
                    onChange({
                      save: {
                        ...(sp.save ?? { ability: 'wis' }),
                        dcOverride: e.target.value ? Number(e.target.value) : undefined,
                      },
                    })
                  }
                />
              </label>
              <label>
                Cứu lại mỗi lượt
                <select
                  value={sp.save?.repeat ?? 'none'}
                  onChange={(e) =>
                    onChange({
                      save: {
                        ...(sp.save ?? { ability: 'wis' }),
                        repeat: e.target.value as 'none' | 'start-of-turn' | 'end-of-turn',
                      },
                    })
                  }
                >
                  <option value="none">không</option>
                  <option value="end-of-turn">cuối lượt</option>
                  <option value="start-of-turn">đầu lượt</option>
                </select>
              </label>
              <label className="chk">
                <input
                  type="checkbox"
                  checked={sp.save?.halfOnSave ?? false}
                  onChange={(e) =>
                    onChange({
                      save: { ...(sp.save ?? { ability: 'wis' }), halfOnSave: e.target.checked || undefined },
                    })
                  }
                />
                Nửa dmg khi save thành công
              </label>
            </>
          )}

          {(sp.castKind === 'save' || sp.castKind === 'utility') && (
            <>
              <label>
                Hiệu ứng
                <input
                  value={sp.effect?.name ?? ''}
                  placeholder="tên hiệu ứng"
                  onChange={(e) =>
                    onChange({ effect: { ...(sp.effect ?? { name: '' }), name: e.target.value } })
                  }
                />
              </label>
              <label>
                Trạng thái
                <select
                  value={sp.effect?.condition ?? ''}
                  onChange={(e) =>
                    onChange({
                      effect: {
                        ...(sp.effect ?? { name: sp.name }),
                        condition: (e.target.value || undefined) as ConditionType | undefined,
                      },
                    })
                  }
                >
                  <option value="">— không —</option>
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {CONDITION_VI[c]}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label>
            Tầm
            <input
              className="sr-range"
              value={sp.range ?? ''}
              placeholder="150ft / Chạm"
              onChange={(e) => onChange({ range: e.target.value || undefined })}
            />
          </label>
          <label>
            Vùng (AoE)
            <input
              className="sr-range"
              value={sp.area ?? ''}
              placeholder="cầu 20ft / nón 15ft"
              onChange={(e) => onChange({ area: e.target.value || undefined })}
            />
          </label>

          <label className="grow">
            Ghi chú / hướng dẫn
            <textarea
              className="sr-notes"
              rows={2}
              value={sp.notes ?? ''}
              placeholder="cách hoạt động, hiệu ứng phụ…"
              onChange={(e) => onChange({ notes: e.target.value || undefined })}
            />
          </label>
        </div>
      )}
    </div>
  );
}

const CLASS_NAMES = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'];

/**
 * Class list of a (multiclass) character: one row per class with its own subclass + level. Total level, proficiency
 * bonus, hit dice pools, spell slots, class features and subclass features all derive from it. Also warns about the
 * SRD multiclass prerequisites (13+ in each class' primary ability) and non-stacking Extra Attack.
 */
function ClassListEditor({ draft, commit }: EditorCtx) {
  const isDm = useStore((s) => s.isDm());
  const classes = sheetClasses(draft);
  const enemyOnly = classes.filter((c) => ENEMY_ONLY_CLASS_KEYS.has((c.name ?? '').trim().toLowerCase())).map((c) => c.name);
  const multi = (draft.classes?.length ?? 0) > 0;
  const total = totalLevelOf(draft);
  const issues = multiclassIssues(draft);
  const extra = extraAttackClasses(draft);
  const set = (patch: Partial<CharacterSheet>) => {
    const next = { ...draft, ...patch };
    // total level + proficiency bonus follow the class list right away (the server derives them too)
    if (next.classes?.length) {
      next.level = Math.max(1, totalLevelOf(next));
      next.proficiencyBonus = proficiencyByLevel(next.level);
    }
    commit(next);
  };

  function setClass(i: number, patch: Partial<ClassEntry>) {
    set({ classes: classes.map((c, j) => (j === i ? { ...c, ...patch } : c)), subclass: undefined });
  }
  function removeClass(i: number) {
    const list = classes.filter((_, j) => j !== i);
    // back to one class: restore the plain single-class fields (the multiclass label "A 3 / B 2" is derived)
    if (list.length <= 1) {
      const only = list[0];
      set({ classes: undefined, className: only?.name ?? '', level: only?.level ?? 1, subclass: only?.subclass });
    } else set({ classes: list });
  }

  return (
    <div className="mc-editor">
      <span className="sg-label">Nghề {multi ? `· tổng cấp ${total}` : ''}</span>
      {classes.map((c, i) => (
        <div key={i} className="mc-row">
          <input
            className="mc-name"
            list="mc-class-names"
            value={c.name}
            placeholder="Wizard"
            onChange={(e) => setClass(i, { name: e.target.value })}
          />
          <input
            className="mc-sub"
            list={`mc-sub-${i}-${draft.id}`}
            value={c.subclass ?? ''}
            placeholder="subclass"
            onChange={(e) => setClass(i, { subclass: e.target.value || undefined })}
          />
          <datalist id={`mc-sub-${i}-${draft.id}`}>
            {Array.from(
              new Set(
                SUBCLASS_DEFS.filter((d) => d.class.toLowerCase() === (c.name ?? '').trim().toLowerCase()).map(
                  (d) => d.subclass,
                ),
              ),
            ).map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <input
            className="mc-lvl"
            type="number"
            min={1}
            max={Math.max(1, 20 - (total - c.level))}
            value={c.level}
            title="Cấp của nghề này (tổng tối đa 20)"
            onChange={(e) => setClass(i, { level: Math.max(1, Math.min(20 - (total - c.level), Number(e.target.value))) })}
          />
          <span className="mc-type">{casterTypeForClass(c.name, c.subclass)}</span>
          {classes.length > 1 && (
            <button className="link edit-only" title="Bỏ nghề này" onClick={() => removeClass(i)}>
              ✕
            </button>
          )}
        </div>
      ))}
      <datalist id="mc-class-names">
        {[...CLASS_NAMES, ...(isDm ? CUSTOM_CLASS_NAMES : PLAYER_CUSTOM_CLASS_NAMES)].map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <button
        className="link edit-only"
        disabled={total >= 20}
        onClick={() => set({ classes: [...classes, { name: '', level: 1 }], subclass: undefined })}
      >
        + nghề phụ (đa nghề)
      </button>
      {enemyOnly.length > 0 && (
        <p className="hint mc-warn">
          ⚠ {enemyOnly.join(', ')}: bàn chơi chỉ dùng cho kẻ địch / NPC, người chơi không chọn được.
        </p>
      )}
      {issues.length > 0 && (
        <p className="hint mc-warn">
          ⚠ Chưa đủ điều kiện đa nghề (cần 13+ ở chỉ số chính của <em>mọi</em> nghề): {issues.join(' · ')}
        </p>
      )}
      {extra.length > 1 && (
        <p className="hint">
          ℹ Extra Attack từ {extra.join(' + ')} <strong>không cộng dồn</strong> (tối đa 2 đòn từ feature này).
        </p>
      )}
      {spellLimits(draft).length > 0 && (
        <div className="mc-limits">
          {spellLimits(draft).map((l) => (
            <span key={l.cls} className={l.preparedUsed > l.preparedMax || l.cantripsUsed > l.cantripsMax ? 'over' : ''}>
              {l.cls} {l.level}: chuẩn bị {l.preparedUsed}/{l.preparedMax}
              {l.cantripsMax > 0 ? ' · cantrip ' + l.cantripsUsed + '/' + l.cantripsMax : ''}
            </span>
          ))}
        </div>
      )}
      {multi && (
        <p className="hint">
          Đa nghề: cấp tổng, Thành thạo (PB), hit dice (gộp theo loại d), ô phép (nghề caster cộng dồn — half caster
          làm tròn lên) đều tự tính. Save / kỹ năng khởi đầu chỉ lấy từ nghề đầu tiên.
        </p>
      )}
    </div>
  );
}

/**
 * Action / Bonus Action / Reaction of the sheet's token this turn (reset when its turn starts) plus Extra Attack
 * progress. Click a pip to spend / refund by hand. Shown only while initiative is running.
 */
function EconomyBar({ token, sheet }: { token: Token | null; sheet: CharacterSheet }) {
  const send = useStore((s) => s.send);
  const running = useStore((s) => s.room?.initiative.running);
  if (!token || !running) return null;
  const used = token.turnUsed ?? {};
  const max = attacksPerAction(sheet);
  const flip = (k: 'action' | 'bonus' | 'reaction') =>
    send({ t: 'setTurnUsed', tokenId: token.id, patch: k === 'action' && used.action ? { action: false, attacks: 0 } : { [k]: !used[k] } });
  const pip = (k: 'action' | 'bonus' | 'reaction', label: string, title: string) => (
    <button key={k} className={'eco-pip ' + (used[k] ? 'spent' : 'ready')} title={title} onClick={() => flip(k)}>
      {used[k] ? '○' : '●'} {label}
    </button>
  );
  return (
    <div className="economy-bar">
      {pip('action', 'Action', 'Action lượt này (đánh, ra phép, Dash…) — bấm để đổi trạng thái')}
      {pip('bonus', 'Bonus', 'Bonus Action lượt này')}
      {pip('reaction', 'Reaction', 'Reaction — hồi ở đầu lượt của bạn')}
      {max > 1 && (
        <span className="eco-attacks" title="Extra Attack không cộng dồn giữa các nghề">
          Đòn: {used.attacks ?? 0}/{max}
        </span>
      )}
    </div>
  );
}

/** Memoised: takes no props, so it only re-renders when its own store selectors change. */
export const SheetDock = memo(SheetDockImpl);
