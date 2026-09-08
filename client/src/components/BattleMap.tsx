import { useEffect, useRef, useState } from 'react';
import {
  ABILITIES,
  abilityMod,
  CONDITION_VI,
  CONDITIONS,
  d20Check,
  fmtMod,
  RIDER_PRESETS,
  statblockDamageParts,
  tokenSaveBonus,
  type ActiveEffect,
  type ConditionType,
  type CoverLevel,
  type Token,
  type TokenSize,
} from '@dnd-table/shared';
import { useStore } from '../store.js';
import { DddiceCanvas } from './DddiceCanvas.js';
import { DamageTypeSelect, DefensesEditor } from './DefensesEditor.js';
import { RollModeToggle, type RollMode } from './SheetDock.js';

const CELL = 56; // display px per grid cell
const SIZE_CELLS: Record<TokenSize, number> = {
  tiny: 0.5,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};

export function BattleMap() {
  const room = useStore((s) => s.room)!;
  const send = useStore((s) => s.send);
  const isDm = useStore((s) => s.isDm());
  const meId = useStore((s) => s.participantId);
  const me = useStore((s) => s.me());
  const castingSpell = useStore((s) => s.castingSpell);
  const cancelCast = useStore((s) => s.cancelCast);
  const resolveCastOnToken = useStore((s) => s.resolveCastOnToken);
  const { map, tokens, diceTray } = room;

  useEffect(() => {
    if (!castingSpell) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancelCast();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [castingSpell, cancelCast]);

  const [selected, setSelected] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState(false);
  const [groupSel, setGroupSel] = useState<Set<string>>(new Set());
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const selectedToken = tokens.find((t) => t.id === selected) ?? null;

  function toggleGroup(id: string) {
    setGroupSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function exitGroup() {
    setGroupMode(false);
    setGroupSel(new Set());
  }

  function onPointerDown(e: React.PointerEvent, token: Token) {
    if (castingSpell) {
      void resolveCastOnToken(token.id);
      return;
    }
    if (groupMode && isDm) {
      toggleGroup(token.id);
      return;
    }
    const canMove = isDm || token.controllerId === meId;
    setSelected(token.id);
    if (!canMove) return;
    const rect = boardRef.current!.getBoundingClientRect();
    drag.current = {
      id: token.id,
      dx: e.clientX - rect.left - token.x * CELL,
      dy: e.clientY - rect.top - token.y * CELL,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const rect = boardRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left - drag.current.dx) / CELL;
    const y = (e.clientY - rect.top - drag.current.dy) / CELL;
    send({ t: 'updateToken', id: drag.current.id, patch: { x, y } });
    if ((map.snap ?? true) && !e.shiftKey) setGhost({ x: Math.round(x), y: Math.round(y) });
    else setGhost(null);
  }

  function onPointerUp(e: React.PointerEvent) {
    setGhost(null);
    if (!drag.current) return;
    const token = tokens.find((t) => t.id === drag.current!.id);
    if (token) {
      const snap = (map.snap ?? true) && !e.shiftKey;
      send({
        t: 'updateToken',
        id: token.id,
        patch: snap
          ? { x: Math.max(0, Math.round(token.x)), y: Math.max(0, Math.round(token.y)) }
          : { x: Math.max(0, token.x), y: Math.max(0, token.y) },
      });
    }
    drag.current = null;
  }

  function onBoardDrop(e: React.DragEvent) {
    const id = e.dataTransfer.getData('text/token-id');
    if (!id || !boardRef.current) return;
    e.preventDefault();
    const rect = boardRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.round((e.clientX - rect.left) / CELL - 0.5));
    const y = Math.max(0, Math.round((e.clientY - rect.top) / CELL - 0.5));
    send({ t: 'copyToken', id, x, y });
  }

  function addToken() {
    send({
      t: 'addToken',
      token: {
        label: isDm ? 'Token' : (me?.name ?? 'Token'),
        x: Math.floor(map.cols / 2),
        y: Math.floor(map.rows / 2),
        color: me?.color,
      },
    });
  }

  return (
    <div className="battlemap">
      <div className="map-top-controls">
        <button className="add-token-fab" onClick={addToken} title="Thêm token">
          + Token
        </button>
        {isDm && (
          <button
            className={`add-token-fab ${groupMode ? 'on' : ''}`}
            onClick={() => (groupMode ? exitGroup() : setGroupMode(true))}
            title="Chọn nhiều token để tung initiative"
          >
            {groupMode ? '✓ Đang chọn nhóm' : '⊕ Chọn nhóm init'}
          </button>
        )}
      </div>

      {tokens.length > 0 && (
        <details className="token-palette">
          <summary>⧉ Kéo để nhân bản</summary>
          <div className="tp-list">
            {tokens
              .filter((t) => isDm || !t.hidden)
              .map((t) => (
                <div
                  key={t.id}
                  className="tp-chip"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/token-id', t.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  title={`Kéo "${t.label}" vào bản đồ để tạo bản sao`}
                >
                  <span
                    className="tp-dot"
                    style={
                      t.imageUrl
                        ? { background: `center/cover url(${t.imageUrl})` }
                        : { background: t.color }
                    }
                  />
                  {t.label}
                </div>
              ))}
          </div>
        </details>
      )}

      {castingSpell && (
        <div className="cover-warning cast-banner" onClick={cancelCast} title="Bấm để hủy">
          🪄 Ra <strong>{castingSpell.spell.name}</strong> — bấm token mục tiêu (Esc / bấm đây để hủy)
        </div>
      )}

      {isDm && tokens.some((t) => t.cover === 'total') && (
        <div className="cover-warning">
          ⚠ Che hoàn toàn (đừng đánh tầm xa):{' '}
          {tokens
            .filter((t) => t.cover === 'total')
            .map((t) => t.label)
            .join(', ')}
        </div>
      )}

      {isDm && groupSel.size > 0 && (
        <div className="group-init-bar">
          <span>{groupSel.size} token</span>
          <button
            onClick={() => {
              const npcIds = tokens.filter((t) => t.statblock).map((t) => t.id);
              setGroupSel(new Set(npcIds));
            }}
          >
            Chọn hết NPC
          </button>
          <button
            className="primary"
            onClick={() => {
              send({ t: 'rollInitiativeGroup', tokenIds: [...groupSel] });
              exitGroup();
            }}
          >
            Tung initiative nhóm
          </button>
          <button className="link" onClick={exitGroup}>
            Bỏ chọn
          </button>
        </div>
      )}

      {isDm && (
        <details className="map-toolbar-wrap">
          <summary>⚙ Bản đồ &amp; cảnh</summary>
          <SceneBar />
          <MapToolbar />
        </details>
      )}

      <div className="board-scroll">
        <div
          ref={boardRef}
          className="board"
          style={{
            width: map.cols * CELL,
            height: map.rows * CELL,
            backgroundImage: map.backgroundUrl ? `url(${map.backgroundUrl})` : undefined,
            backgroundSize: '100% 100%',
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('text/token-id')) e.preventDefault();
          }}
          onDrop={onBoardDrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          {map.showGrid && (
            <div
              className="grid-overlay"
              style={{ backgroundSize: `${CELL}px ${CELL}px` }}
            />
          )}

          {ghost && (
            <div
              className="snap-ghost"
              style={{ left: ghost.x * CELL, top: ghost.y * CELL, width: CELL, height: CELL }}
            />
          )}

          {tokens
            .filter((t) => isDm || !t.hidden)
            .map((t) => {
              const span = SIZE_CELLS[t.size];
              return (
                <div
                  key={t.id}
                  className={`token ${selected === t.id ? 'sel' : ''} ${
                    groupSel.has(t.id) ? 'group-sel' : ''
                  } ${t.hidden ? 'hidden' : ''} ${
                    t.cover === 'total' ? 'cover-total' : ''
                  }`}
                  style={{
                    left: t.x * CELL,
                    top: t.y * CELL,
                    width: span * CELL - 4,
                    height: span * CELL - 4,
                    background: t.imageUrl ? `center/cover url(${t.imageUrl})` : t.color,
                  }}
                  onPointerDown={(e) => onPointerDown(e, t)}
                  title={t.label}
                >
                  {!t.imageUrl && <span className="tk-initial">{t.label.slice(0, 2)}</span>}
                  {t.cover && t.cover !== 'none' && (
                    <span
                      className="tk-cover"
                      title={
                        t.cover === 'total'
                          ? 'Che hoàn toàn'
                          : t.cover === 'half'
                            ? 'Nửa che (+2 AC)'
                            : '3/4 che (+5 AC)'
                      }
                    >
                      {t.cover === 'total' ? '🛡!' : t.cover === 'half' ? '🛡½' : '🛡¾'}
                    </span>
                  )}
                  {(t.effects?.length || t.concentration) && (
                    <span
                      className="tk-effects"
                      title={[
                        t.concentration ? `🧠 ${t.concentration.name}` : '',
                        ...(t.effects ?? []).map((e) => e.name),
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    >
                      {t.concentration ? '🧠' : ''}
                      {t.effects?.length ? `✦${t.effects.length}` : ''}
                    </span>
                  )}
                  {typeof t.currentHp === 'number' && typeof t.maxHp === 'number' && (
                    <div className="tk-hpbar">
                      <div
                        style={{
                          width: `${Math.max(0, Math.min(100, (t.currentHp / t.maxHp) * 100))}%`,
                        }}
                      />
                    </div>
                  )}
                  <span className="tk-label">{t.label}</span>
                </div>
              );
            })}

          {diceTray.entries.length > 0 && (
            <div className="dice-tray">
              {diceTray.entries.slice(-6).map((d) => (
                <div key={d.id} className="tray-die" title={`${d.actorName}: ${d.notation}`}>
                  <span className="tray-faces">{d.faces.join(' ')}</span>
                  <strong>{d.total}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <DddiceCanvas />

      {selectedToken && (
        <TokenInspector
          token={selectedToken}
          onClose={() => setSelected(null)}
          inGroup={groupSel.has(selectedToken.id)}
          onToggleGroup={() => toggleGroup(selectedToken.id)}
        />
      )}
    </div>
  );
}

function MapToolbar() {
  const room = useStore((s) => s.room)!;
  const send = useStore((s) => s.send);
  const { map } = room;
  const [bg, setBg] = useState(map.backgroundUrl ?? '');
  const [aspect, setAspect] = useState<number | null>(null);

  // Auto grid: keep rows in step with the background's aspect ratio.
  function loadAspect(url: string) {
    if (!url) return setAspect(null);
    const img = new Image();
    img.onload = () => setAspect(img.naturalWidth / img.naturalHeight);
    img.src = url;
  }
  function applyBg() {
    send({ t: 'updateMap', patch: { backgroundUrl: bg || undefined } });
    loadAspect(bg);
  }
  function setCols(cols: number) {
    const patch: { cols: number; rows?: number } = { cols };
    if (aspect) patch.rows = Math.max(2, Math.round(cols / aspect));
    send({ t: 'updateMap', patch });
  }

  return (
    <div className="map-toolbar">
      <label>
        Nền (URL / upload)
        <input
          value={bg}
          onChange={(e) => setBg(e.target.value)}
          onBlur={applyBg}
          placeholder="https://…/map.jpg"
        />
      </label>
      <label>
        Ô ngang
        <input
          type="number"
          min={4}
          max={80}
          value={map.cols}
          onChange={(e) => setCols(Number(e.target.value))}
        />
      </label>
      <label>
        Ô dọc
        <input
          type="number"
          min={4}
          max={80}
          value={map.rows}
          onChange={(e) => send({ t: 'updateMap', patch: { rows: Number(e.target.value) } })}
        />
      </label>
      {aspect && (
        <button
          className="link"
          title="Tính lại số ô dọc theo tỉ lệ ảnh nền"
          onClick={() => setCols(map.cols)}
        >
          ⤢ tự chia ô
        </button>
      )}
      <label className="chk">
        <input
          type="checkbox"
          checked={map.showGrid}
          onChange={(e) => send({ t: 'updateMap', patch: { showGrid: e.target.checked } })}
        />
        Lưới
      </label>
      <label className="chk">
        <input
          type="checkbox"
          checked={map.snap ?? true}
          onChange={(e) => send({ t: 'updateMap', patch: { snap: e.target.checked } })}
        />
        Snap (giữ Shift để tắt tạm)
      </label>
    </div>
  );
}

/** DM scene switcher: create / rename / duplicate / delete / activate scenes. */
function SceneBar() {
  const scenes = useStore((s) => s.room?.scenes ?? []);
  const activeId = useStore((s) => s.room?.activeSceneId);
  const send = useStore((s) => s.send);
  return (
    <div className="scene-bar">
      {scenes.map((sc) => (
        <div key={sc.id} className={`scene-chip ${sc.id === activeId ? 'on' : ''}`}>
          <button
            className="scene-name"
            onClick={() => send({ t: 'sceneActivate', id: sc.id })}
            onDoubleClick={() => {
              const name = prompt('Tên cảnh', sc.name);
              if (name) send({ t: 'sceneRename', id: sc.id, name });
            }}
            title="Bấm để mở · bấm đúp để đổi tên"
          >
            {sc.name} <em>({sc.tokens.length})</em>
          </button>
          <button
            className="link"
            title="Nhân bản"
            onClick={() => send({ t: 'sceneDuplicate', id: sc.id })}
          >
            ⧉
          </button>
          {scenes.length > 1 && (
            <button
              className="link"
              title="Xóa cảnh"
              onClick={() => {
                if (confirm(`Xóa cảnh "${sc.name}"?`)) send({ t: 'sceneDelete', id: sc.id });
              }}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button className="link" onClick={() => send({ t: 'sceneCreate' })}>
        + cảnh
      </button>
    </div>
  );
}

/** Active-effects editor on a token: conditions, spell riders, concentration. */
function EffectsPanel({ token }: { token: Token }) {
  const applyEffect = useStore((s) => s.applyEffect);
  const removeEffect = useStore((s) => s.removeEffect);
  const clearConcentration = useStore((s) => s.clearConcentration);
  const [cond, setCond] = useState<ConditionType | ''>('');
  const [name, setName] = useState('');
  const effects = token.effects ?? [];

  function add(e: Partial<ActiveEffect> & { name: string }) {
    applyEffect(token.id, {
      id: '',
      sourceTokenId: undefined,
      ...e,
    } as ActiveEffect);
    setName('');
    setCond('');
  }

  return (
    <details className="def-details" open={effects.length > 0 || !!token.concentration}>
      <summary>
        Hiệu ứng {effects.length > 0 ? `(${effects.length})` : ''}
        {token.concentration ? ' · 🧠' : ''}
      </summary>

      {token.concentration && (
        <p className="hint">
          Đang tập trung: <strong>{token.concentration.name}</strong>{' '}
          <button className="link" onClick={() => clearConcentration(token.id)}>
            hủy
          </button>
        </p>
      )}

      <div className="eff-list">
        {effects.map((e) => (
          <span key={e.id} className="eff-chip">
            {e.name}
            {e.condition ? ` · ${CONDITION_VI[e.condition]}` : ''}
            {e.rider ? ` +${e.rider.dice} ${e.rider.type}` : ''}
            {e.concentration ? ' 🧠' : ''}
            {e.save ? ` · save ${e.save.ability.toUpperCase()} DC${e.save.dc}` : ''}
            <button className="link" onClick={() => removeEffect(token.id, e.id)}>
              ✕
            </button>
          </span>
        ))}
      </div>

      <div className="eff-add">
        <select
          value=""
          onChange={(e) => {
            const p = RIDER_PRESETS.find((x) => x.name === e.target.value);
            if (p) add({ name: p.name, rider: p.rider, concentration: p.concentration });
          }}
        >
          <option value="">+ chiêu có sẵn…</option>
          {RIDER_PRESETS.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name} ({p.rider.dice})
            </option>
          ))}
        </select>
        <select value={cond} onChange={(e) => setCond(e.target.value as ConditionType | '')}>
          <option value="">+ trạng thái…</option>
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {CONDITION_VI[c]}
            </option>
          ))}
        </select>
        {cond && (
          <button
            className="link"
            onClick={() => add({ name: CONDITION_VI[cond], condition: cond })}
          >
            thêm {CONDITION_VI[cond]}
          </button>
        )}
        <span className="eff-custom">
          <input
            placeholder="hiệu ứng tự đặt"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {name.trim() && (
            <button className="link" onClick={() => add({ name: name.trim() })}>
              thêm
            </button>
          )}
        </span>
      </div>
    </details>
  );
}

function TokenInspector({
  token,
  onClose,
  inGroup,
  onToggleGroup,
}: {
  token: Token;
  onClose: () => void;
  inGroup: boolean;
  onToggleGroup: () => void;
}) {
  const send = useStore((s) => s.send);
  const attackRoll = useStore((s) => s.attackRoll);
  const damageRoll = useStore((s) => s.damageRoll);
  const rollDice = useStore((s) => s.rollDice);
  const isDm = useStore((s) => s.isDm());
  const meId = useStore((s) => s.participantId);
  const tokens = useStore((s) => s.room?.tokens ?? []);
  const sheets = useStore((s) => s.room?.sheets ?? []);
  const mySheets = sheets.filter((s) => isDm || s.ownerId === meId);
  const linkedSheet = sheets.find((s) => s.tokenId === token.id) ?? null;
  const [atkName, setAtkName] = useState('Đòn đánh');
  const [atkBonus, setAtkBonus] = useState('5');
  const [dmg, setDmg] = useState('1d8+3');
  const [dmgType, setDmgType] = useState<string | undefined>(undefined);
  const [attackerId, setAttackerId] = useState('');
  const [sbTargetId, setSbTargetId] = useState('');
  const [sbRollMode, setSbRollMode] = useState<RollMode>('normal');
  const sbd20 = (mod: number) => d20Check(mod, sbRollMode);
  const mtag =
    sbRollMode === 'advantage' ? ' (lợi thế)' : sbRollMode === 'disadvantage' ? ' (bất lợi)' : '';

  const sb = token.statblock;
  const canSeeStatblock = sb && (isDm || token.controllerId === meId);
  const sbTargetName = tokens.find((t) => t.id === sbTargetId)?.label ?? '';

  function patch(p: Partial<Token>) {
    send({ t: 'updateToken', id: token.id, patch: p });
  }

  return (
    <div className="inspector">
      <div className="insp-head">
        <input value={token.label} onChange={(e) => patch({ label: e.target.value })} />
        <button
          className="link"
          title="Nhân bản token (bản sao độc lập)"
          onClick={() => send({ t: 'copyToken', id: token.id, x: token.x + 1, y: token.y })}
        >
          ⧉
        </button>
        <button className="link" onClick={onClose}>
          ✕
        </button>
      </div>
      {isDm && (
        <label className="chk insp-group">
          <input type="checkbox" checked={inGroup} onChange={onToggleGroup} />
          Thêm vào nhóm tung initiative
        </label>
      )}
      {token.statblock && (
        <p className="hint insp-npc-note">
          Token NPC (có stat block) — không gán được vào character sheet. Nhân bản (⧉) nếu cần
          token giống nhau.
        </p>
      )}
      {!token.statblock && mySheets.length > 0 && (
        <label className="insp-link">
          Gán token này cho nhân vật
          <select
            value={linkedSheet && mySheets.some((s) => s.id === linkedSheet.id) ? linkedSheet.id : ''}
            onChange={(e) => {
              const sheet = sheets.find((s) => s.id === e.target.value);
              // unlink whatever this sheet pointed at, then link this token
              if (linkedSheet && (!sheet || sheet.id !== linkedSheet.id)) {
                send({ t: 'upsertSheet', sheet: { ...linkedSheet, tokenId: undefined } });
              }
              if (sheet) send({ t: 'upsertSheet', sheet: { ...sheet, tokenId: token.id } });
            }}
          >
            <option value="">— không —</option>
            {mySheets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="insp-grid">
        <label>
          HP
          <input
            type="number"
            value={token.currentHp ?? ''}
            onChange={(e) =>
              patch({ currentHp: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
        </label>
        <label>
          HP tối đa
          <input
            type="number"
            value={token.maxHp ?? ''}
            onChange={(e) =>
              patch({ maxHp: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
        </label>
        <label>
          AC
          <input
            type="number"
            value={token.armorClass ?? ''}
            onChange={(e) =>
              patch({ armorClass: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
        </label>
        <label>
          Cỡ
          <select
            value={token.size}
            onChange={(e) => patch({ size: e.target.value as TokenSize })}
          >
            {['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Màu
          <input
            type="color"
            value={token.color}
            onChange={(e) => patch({ color: e.target.value })}
          />
        </label>
        {isDm && (
          <label className="chk">
            <input
              type="checkbox"
              checked={token.hidden}
              onChange={(e) => patch({ hidden: e.target.checked })}
            />
            Ẩn với người chơi
          </label>
        )}
        <label>
          Che chắn (cover)
          <select
            value={token.cover ?? 'none'}
            onChange={(e) => patch({ cover: e.target.value as CoverLevel })}
          >
            <option value="none">Không che</option>
            <option value="half">Nửa che (+2 AC)</option>
            <option value="threequarters">3/4 che (+5 AC)</option>
            <option value="total">Che hoàn toàn</option>
          </select>
        </label>
      </div>

      {token.cover === 'total' && (
        <p className="hint cover-total-note">
          ⚠ Mục tiêu đang <strong>che hoàn toàn</strong> — không thể bị nhắm bởi đòn tầm xa.
        </p>
      )}

      <details className="def-details">
        <summary>Phòng thủ (kháng / miễn / DR)</summary>
        <DefensesEditor
          defenses={token.defenses}
          onChange={(d) => patch({ defenses: d })}
        />
      </details>

      <EffectsPanel token={token} />

      {canSeeStatblock && sb && (
        <div className="sb-inspect">
          {sb.meta && <div className="sb-meta">{sb.meta}</div>}
          <RollModeToggle mode={sbRollMode} onChange={setSbRollMode} />

          <div className="sb-ability-roll">
            {ABILITIES.map((ab) => {
              const mod = abilityMod(sb.abilities[ab]);
              const save = tokenSaveBonus(sb, ab);
              return (
                <div key={ab} className="sb-abr">
                  <button
                    className="roll-btn sm"
                    title={`${sb.name} — ${ab.toUpperCase()} check`}
                    onClick={() =>
                      rollDice(`${sb.name} · ${ab.toUpperCase()} check${mtag}`, sbd20(mod))
                    }
                  >
                    {ab.toUpperCase()} {fmtMod(mod)}
                  </button>
                  <button
                    className={`roll-btn sm ${sb.saveProficiencies.includes(ab) ? 'prof' : ''}`}
                    title={`${sb.name} — ${ab.toUpperCase()} save`}
                    onClick={() =>
                      rollDice(`${sb.name} · ${ab.toUpperCase()} save${mtag}`, sbd20(save))
                    }
                  >
                    save {fmtMod(save)}
                  </button>
                </div>
              );
            })}
          </div>

          {(sb.skills ?? []).length > 0 && (
            <div className="sb-skill-roll">
              {(sb.skills ?? []).map((sk) => (
                <button
                  key={sk.skill}
                  className="roll-btn sm"
                  onClick={() => rollDice(`${sb.name} · ${sk.skill}${mtag}`, sbd20(sk.bonus))}
                >
                  {sk.skill} {fmtMod(sk.bonus)}
                </button>
              ))}
            </div>
          )}

          <div className="sb-quick-roll">
            <button
              className="roll-btn sm"
              onClick={() => rollDice(`${sb.name} · Initiative${mtag}`, sbd20(sb.initiativeMod))}
            >
              Init {fmtMod(sb.initiativeMod)}
            </button>
          </div>

          <label className="sb-target">
            {sb.name} tấn công →
            <select value={sbTargetId} onChange={(e) => setSbTargetId(e.target.value)}>
              <option value="">— mục tiêu —</option>
              {tokens
                .filter((t) => t.id !== token.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
            </select>
          </label>
          {sb.actions.map((a) => {
            const parts = statblockDamageParts(a);
            const isAttack = typeof a.attackBonus === 'number' && parts.length > 0;
            const base = `${sb.name} · ${a.name}`;
            const combined = parts.map((p) => p.dice).join(' + ');
            const dmgLabel = parts
              .map((p) => `${p.dice}${p.type ? ' ' + p.type : ''}`)
              .join(' + ');
            return (
              <div key={a.id} className="sb-act">
                <span className="sb-act-name" title={a.description}>
                  {a.name}
                </span>
                <span className="sb-act-detail">
                  {isAttack ? `${fmtMod(a.attackBonus!)} · ${dmgLabel}` : a.notation || a.description || ''}
                </span>
                {isAttack && sbTargetId && (
                  <button
                    className="roll-btn strong"
                    onClick={() =>
                      attackRoll({
                        label: `${base} → ${sbTargetName}${mtag}`,
                        attackBonus: a.attackBonus!,
                        rollMode: sbRollMode,
                        damageParts: parts,
                        targetTokenId: sbTargetId,
                        attackerTokenId: token.id,
                      })
                    }
                  >
                    ⚔
                  </button>
                )}
                {isAttack && !sbTargetId && (
                  <button
                    className="roll-btn"
                    onClick={() => rollDice(`${base} (đánh)${mtag}`, sbd20(a.attackBonus!))}
                  >
                    đánh
                  </button>
                )}
                {parts.length > 0 && (
                  <button
                    className="roll-btn"
                    onClick={() =>
                      sbTargetId
                        ? damageRoll(`${base} → ${sbTargetName}`, parts, sbTargetId, {
                            tokenId: token.id,
                          })
                        : rollDice(`${base} (dmg)`, combined)
                    }
                  >
                    dmg
                  </button>
                )}
                {a.notation && !a.damage && (
                  <button className="roll-btn" onClick={() => rollDice(base, a.notation!)}>
                    tung
                  </button>
                )}
              </div>
            );
          })}
          {sb.traits.length > 0 && (
            <details className="sb-traits-view">
              <summary>Đặc điểm ({sb.traits.length})</summary>
              {sb.traits.map((t, i) => (
                <p key={i}>
                  <strong>{t.name}.</strong> {t.description}
                </p>
              ))}
            </details>
          )}
          {sb.notes && <p className="hint">{sb.notes}</p>}
        </div>
      )}

      <fieldset className="attack-box">
        <legend>Tấn công vào {token.label}</legend>
        <div className="attack-row">
          <select value={attackerId} onChange={(e) => setAttackerId(e.target.value)}>
            <option value="">— nguồn —</option>
            {tokens
              .filter((t) => t.id !== token.id)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
          </select>
          <input value={atkName} onChange={(e) => setAtkName(e.target.value)} placeholder="Tên đòn" />
        </div>
        <div className="attack-row">
          <label>
            +Đánh
            <input value={atkBonus} onChange={(e) => setAtkBonus(e.target.value)} />
          </label>
          <label>
            Sát thương
            <input value={dmg} onChange={(e) => setDmg(e.target.value)} />
          </label>
          <DamageTypeSelect value={dmgType} onChange={setDmgType} />
        </div>
        <button
          className="primary"
          onClick={() =>
            attackRoll({
              label: attackerId
                ? `${tokens.find((t) => t.id === attackerId)?.label ?? ''} · ${atkName}`
                : atkName,
              attackBonus: Number(atkBonus) || 0,
              rollMode: sbRollMode,
              damageParts: [{ dice: dmg, type: dmgType ?? '' }],
              targetTokenId: token.id,
              attackerTokenId: attackerId || undefined,
            })
          }
        >
          Tung đòn tấn công
        </button>
      </fieldset>
    </div>
  );
}
