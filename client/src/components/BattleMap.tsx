import { memo, useEffect, useRef, useState } from 'react';
import {
  attackRangeOf,
  addCurrency,
  COIN_TYPES,
  computeSpeed,
  coverAcBonus,
  currencyInGp,
  randomLootFor,
  aoeGeometry,
  aoeTokenIds,
  defaultAnchor,
  parseArea,
  ABILITIES,
  abilityMod,
  CONDITION_VI,
  CONDITIONS,
  d20Check,
  FEET_PER_CELL,
  findCantrip,
  fmtMod,
  gridFeet,
  HEALTH_TIER_VI,
  monsterSpellFrom,
  parseRangeFeet,
  RIDER_PRESETS,
  SRD_SPELLS,
  statblockDamageParts,
  statblockHiddenFromPlayers,
  statsHiddenFromPlayers,
  tokenIsGrappled,
  tokenSaveBonus,
  tokenStatblockFrom,
  walkSpeed,
  type ActiveEffect,
  type CharacterSheet,
  type ConditionType,
  type CoverLevel,
  type Currency,
  type MapZone,
  type Token,
  type TokenSize,
} from '@dnd-table/shared';
import { useStore } from '../store.js';
import { uploadImage } from '../upload.js';
import { statblockFromToken } from '../statblock.js';
import { nanoIdish } from '../util.js';
import { DddiceCanvas } from './DddiceCanvas.js';
import { DamageTypeSelect, DefensesEditor } from './DefensesEditor.js';
import { RollModeToggle, type RollMode } from './SheetDock.js';
import { ZonePopup, ZONE_LIBRARY, type ZonePopupState } from './ZonePopup.js';
import zoneLayoutsRaw from '../data/crookedMoonZoneLayouts.json';

interface ZoneLayoutRoom {
  code: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface ZoneLayout {
  chapter: string;
  rooms: ZoneLayoutRoom[];
}
const ZONE_LAYOUTS = zoneLayoutsRaw as Record<string, ZoneLayout>;

/** The imported map pack's own file id, e.g. "gl_12_1_the_crooked_house_1_21x24" — derived from
 *  `backgroundUrl` (`/maps/battlemaps/<id>.webp`, see MapLibrary.tsx) so a known zone layout can
 *  be looked up for whatever map is currently the scene's background. */
function mapIdFromBackgroundUrl(url: string | undefined): string | null {
  if (!url) return null;
  const file = url.split('/').pop();
  return file ? file.replace(/\.\w+$/, '') : null;
}

const CELL = 56; // display px per grid cell
const NO_ZONES: MapZone[] = [];

/** A token's walking speed for the client move tracker. */
function tokenWalkSpeed(token: Token, sheets: CharacterSheet[]): number {
  const sheet = sheets.find((s) => s.tokenId === token.id);
  return walkSpeed(sheet ? computeSpeed(sheet).speed : undefined, token.statblock?.speed, tokenIsGrappled(token));
}
const SIZE_CELLS: Record<TokenSize, number> = {
  tiny: 0.5,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};

function BattleMapImpl() {
  // Narrow selectors (not the whole `room`): with structural sharing in the store, a sheet/log/homebrew
  // change no longer re-renders the map, and a token drag no longer re-renders unrelated slices.
  const send = useStore((s) => s.send);
  const isDm = useStore((s) => s.isDm());
  const meId = useStore((s) => s.participantId);
  const me = useStore((s) => s.me());
  const castingSpell = useStore((s) => s.castingSpell);
  const castingMonsterSpell = useStore((s) => s.castingMonsterSpell);
  const resolveMonsterCastOnToken = useStore((s) => s.resolveMonsterCastOnToken);
  const cancelCast = useStore((s) => s.cancelCast);
  const aoe = useStore((s) => s.aoe);
  const confirmAoe = useStore((s) => s.confirmAoe);
  const [aoeAim, setAoeAim] = useState<{ x: number; y: number } | null>(null);
  const resolveCastOnToken = useStore((s) => s.resolveCastOnToken);
  const map = useStore((s) => s.room?.map)!;
  const tokens = useStore((s) => s.room?.tokens)!;
  const diceTray = useStore((s) => s.room?.diceTray)!;
  const zones = useStore((s) => s.room?.zones) ?? NO_ZONES;
  const sheets = useStore((s) => s.room?.sheets)!;
  const initiative = useStore((s) => s.room?.initiative)!;

  // --- movement tracker (active combatant) ---
  const activeEntry = initiative.running
    ? initiative.entries.find((e) => e.isActive)
    : undefined;
  const activeToken = activeEntry?.tokenId
    ? tokens.find((t) => t.id === activeEntry.tokenId)
    : undefined;
  const moveInfo = activeToken
    ? (() => {
        const anchor = activeToken.turnAnchor ?? { x: activeToken.x, y: activeToken.y };
        const budget = tokenWalkSpeed(activeToken, sheets) + (activeToken.extraMove ?? 0);
        const used = gridFeet(anchor, { x: activeToken.x, y: activeToken.y });
        return { anchor, budget, used, cells: budget / FEET_PER_CELL };
      })()
    : null;

  // --- spell range ring (while a cast is armed) ---
  const activeCastSpell = castingSpell?.spell ?? castingMonsterSpell?.spell;
  const castRing = activeCastSpell
    ? (() => {
        const casterTokenId = castingSpell
          ? sheets.find((s) => s.id === castingSpell.sheetId)?.tokenId
          : castingMonsterSpell?.tokenId;
        const tk = casterTokenId ? tokens.find((t) => t.id === casterTokenId) : undefined;
        // "how far does this reach": casting range, or the area for a Self spell
        const feet = Math.max(parseRangeFeet(activeCastSpell.range), parseRangeFeet(activeCastSpell.area));
        if (!tk || !feet) return null;
        return { tk, feet, radiusPx: (feet / FEET_PER_CELL) * CELL };
      })()
    : null;

  useEffect(() => {
    if (!castingSpell && !castingMonsterSpell && !aoe) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancelCast();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [castingSpell, castingMonsterSpell, aoe, cancelCast]);

  // AoE template placement: origin (caster centre or chosen grid point), aim, and who is inside.
  const aoeView = (() => {
    if (!aoe) return null;
    const caster = tokens.find((t) => t.id === aoe.casterTokenId);
    const cSpan = caster ? SIZE_CELLS[caster.size] : 1;
    const cCentre = caster ? { x: caster.x + cSpan / 2, y: caster.y + cSpan / 2 } : null;
    const aim = aoeAim ?? cCentre ?? { x: 0, y: 0 };
    const origin =
      aoe.anchor === 'self' && cCentre ? cCentre : { x: Math.round(aim.x), y: Math.round(aim.y) };
    const geo = aoeGeometry(aoe.spec, aoe.anchor, origin, aim, cSpan);
    const hitIds = aoeTokenIds(
      aoe.spec,
      aoe.anchor,
      origin,
      aim,
      tokens
        .filter((t) => isDm || !t.hidden)
        .map((t) => ({ id: t.id, x: t.x, y: t.y, span: SIZE_CELLS[t.size] })),
      aoe.casterTokenId,
    );
    return { geo, hitIds, cCentre };
  })();

  const [selected, setSelected] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState(false);
  const [groupSel, setGroupSel] = useState<Set<string>>(new Set());
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  // The dragger's own view of the token being moved: updated on every pointer move, no network
  // round-trip. Without this, a token's position came only from `room.tokens` (the server echo of
  // the last `updateToken` send), so every drag was as laggy as the connection's round-trip time,
  // and an older echo arriving after a newer one (out-of-order over a slower link, e.g. Tailscale
  // WAN vs LAN) visibly snapped the token back mid-drag. Cleared once the drag ends and the final
  // authoritative position has been sent (see `onPointerUp`). Other viewers still see this token
  // move via the throttled `send` in `onPointerMove` below — unaffected by this local state.
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const lastDragSendRef = useRef(0);
  // Free camera pan: click-drag empty board space to scroll the view, like most VTTs — previously
  // the only way to move the view was the browser's own scrollbars / mouse wheel, which read as
  // "the map is stuck" since there was no drag-to-pan at all. `moved` distinguishes an actual pan
  // (suppresses the board's own click-to-deselect below) from a plain click.
  const panDrag = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number; moved: boolean } | null>(
    null,
  );
  const suppressBoardClick = useRef(false);
  // --- DM zone tool: click-drag on empty board to draw a room/area rectangle, click an
  //     existing one to view its read-aloud/DM text (see ZonePopup). ---
  const [zoneDraw, setZoneDraw] = useState(false);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const zoneDragStart = useRef<{ x: number; y: number } | null>(null);
  const [zonePopup, setZonePopup] = useState<ZonePopupState>(null);
  const [zoom, setZoom] = useState(1);
  const ZOOM_MIN = 0.3;
  const ZOOM_MAX = 2.5;
  /** Empty scrollable margin (px, constant regardless of zoom) around the board so it isn't
   *  pinned to the top-left corner — lets the DM drag it away from the edge to re-centre it. */
  const PAN_PAD = 600;
  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  /** Zoom by `factor`, keeping the point under (clientX, clientY) — or the viewport centre
   *  if omitted — visually fixed, by adjusting the scroll container's scroll offset to match. */
  function zoomBy(factor: number, clientX?: number, clientY?: number) {
    const scroller = boardScrollRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const cx = clientX ?? rect.left + rect.width / 2;
    const cy = clientY ?? rect.top + rect.height / 2;
    const offsetX = cx - rect.left + scroller.scrollLeft;
    const offsetY = cy - rect.top + scroller.scrollTop;
    setZoom((prev) => {
      const next = clampZoom(prev * factor);
      const ratio = next / prev;
      requestAnimationFrame(() => {
        if (!boardScrollRef.current) return;
        boardScrollRef.current.scrollLeft = offsetX * ratio - (cx - rect.left);
        boardScrollRef.current.scrollTop = offsetY * ratio - (cy - rect.top);
      });
      return next;
    });
  }

  const selectedToken = tokens.find((t) => t.id === selected) ?? null;

  // Start scrolled past the pan padding so the board still opens flush top-left, same as before
  // PAN_PAD was added — but now there's room to scroll further to re-centre it. Deferred a frame
  // and keyed on the map's own size: right after mount the `.board-scroll` flex container hasn't
  // been laid out yet (height reads 0/wrong), so setting scrollTop synchronously here got clamped
  // to whatever tiny scroll range existed at that instant — visually pinning the board near the
  // BOTTOM of the viewport instead of flush top-left. Re-running once real dimensions land (and
  // once layout has actually settled, via rAF) fixes that.
  useEffect(() => {
    const el = boardScrollRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      const el2 = boardScrollRef.current;
      if (!el2) return;
      el2.scrollLeft = PAN_PAD;
      el2.scrollTop = PAN_PAD;
    });
    return () => cancelAnimationFrame(raf);
  }, [map.cols, map.rows]);

  // Native (non-passive) wheel listener: React's onWheel is registered passive, so
  // e.preventDefault() inside it silently does nothing and Ctrl+wheel still triggers the
  // BROWSER's own page zoom underneath our map zoom — the two stack, feel overly sensitive,
  // drift the whole page's zoom (affecting UI like the bestiary panel), and can't be reset from
  // our +/-/% controls since those only touch our own zoom state.
  useEffect(() => {
    const el = boardScrollRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // Scale the step to how hard the gesture was rather than a fixed multiplier per event —
      // a trackpad fires many more (and smaller) wheel events per physical gesture than a mouse
      // wheel notch, so a flat step compounded across those events zoomed far too fast. Capped so
      // one big jump (fast mouse-wheel spin) can't overshoot either.
      const raw = Math.exp(-e.deltaY * 0.0012);
      const factor = Math.min(1.05, Math.max(1 / 1.05, raw));
      zoomBy(factor, e.clientX, e.clientY);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Delete' || !selectedToken) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (!(isDm || selectedToken.controllerId === meId)) return;
      if (!window.confirm(`Xóa token "${selectedToken.label}"?`)) return;
      send({ t: 'removeToken', id: selectedToken.id });
      setSelected(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedToken, isDm, meId, send]);

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
    if (castingMonsterSpell) {
      void resolveMonsterCastOnToken(token.id);
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
      dx: e.clientX - rect.left - token.x * CELL * zoom,
      dy: e.clientY - rect.top - token.y * CELL * zoom,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onBoardPointerDown(e: React.PointerEvent) {
    if (zoneDraw && isDm) {
      if (e.target !== e.currentTarget || !boardRef.current) return; // only start on empty board
      const rect = boardRef.current.getBoundingClientRect();
      const gx = (e.clientX - rect.left) / (CELL * zoom);
      const gy = (e.clientY - rect.top) / (CELL * zoom);
      zoneDragStart.current = { x: gx, y: gy };
      setDrawRect({ x: gx, y: gy, w: 0, h: 0 });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    // Free camera pan (see `panDrag` above) — only when clicking truly empty board (not a token,
    // not while casting/AoE, where a click means something else).
    if (e.target !== e.currentTarget || !boardScrollRef.current) return;
    if (castingSpell || castingMonsterSpell || aoe) return;
    const scroller = boardScrollRef.current;
    panDrag.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop,
      moved: false,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (panDrag.current && boardScrollRef.current) {
      const dx = e.clientX - panDrag.current.x;
      const dy = e.clientY - panDrag.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panDrag.current.moved = true;
      boardScrollRef.current.scrollLeft = panDrag.current.scrollLeft - dx;
      boardScrollRef.current.scrollTop = panDrag.current.scrollTop - dy;
      return;
    }
    if (zoneDragStart.current && boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const gx = (e.clientX - rect.left) / (CELL * zoom);
      const gy = (e.clientY - rect.top) / (CELL * zoom);
      const start = zoneDragStart.current;
      setDrawRect({
        x: Math.min(start.x, gx),
        y: Math.min(start.y, gy),
        w: Math.abs(gx - start.x),
        h: Math.abs(gy - start.y),
      });
      return;
    }
    if (aoe && boardRef.current) {
      const r = boardRef.current.getBoundingClientRect();
      setAoeAim({ x: (e.clientX - r.left) / (CELL * zoom), y: (e.clientY - r.top) / (CELL * zoom) });
      return;
    }
    if (!drag.current) return;
    const rect = boardRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left - drag.current.dx) / (CELL * zoom);
    const y = (e.clientY - rect.top - drag.current.dy) / (CELL * zoom);
    // Instant local feedback for the dragger — never waits on the network.
    setDragPos({ id: drag.current.id, x, y });
    // Everyone else's view of this token still comes from the synced store, so keep sending —
    // just not on every single pointer-move tick (that's what made dragging feel slow and let a
    // stale echo overtake a newer one). ~20/s is smooth enough for other viewers to follow.
    const now = performance.now();
    if (now - lastDragSendRef.current >= 50) {
      lastDragSendRef.current = now;
      send({ t: 'updateToken', id: drag.current.id, patch: { x, y } });
    }
    if ((map.snap ?? true) && !e.shiftKey) setGhost({ x: Math.round(x), y: Math.round(y) });
    else setGhost(null);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (panDrag.current) {
      suppressBoardClick.current = panDrag.current.moved;
      panDrag.current = null;
      return;
    }
    if (zoneDragStart.current) {
      zoneDragStart.current = null;
      const r = drawRect;
      setDrawRect(null);
      if (r && r.w > 0.3 && r.h > 0.3) {
        setZonePopup({
          kind: 'new',
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.max(1, Math.round(r.w)),
          h: Math.max(1, Math.round(r.h)),
        });
      }
      return;
    }
    setGhost(null);
    if (!drag.current) return;
    // Use the dragger's own local position, not the (possibly up-to-50ms-stale, throttled) store
    // one, so the final snap lands where the cursor actually let go, not where the last network
    // send happened to land.
    const token = tokens.find((t) => t.id === drag.current!.id);
    const last = dragPos?.id === drag.current.id ? dragPos : token;
    if (last) {
      const snap = (map.snap ?? true) && !e.shiftKey;
      send({
        t: 'updateToken',
        id: drag.current.id,
        patch: snap
          ? { x: Math.max(0, Math.round(last.x)), y: Math.max(0, Math.round(last.y)) }
          : { x: Math.max(0, last.x), y: Math.max(0, last.y) },
      });
    }
    drag.current = null;
    setDragPos(null);
  }

  function onBoardDrop(e: React.DragEvent) {
    if (!boardRef.current) return;
    const sbId = e.dataTransfer.getData('text/statblock-id');
    const id = e.dataTransfer.getData('text/token-id');
    const sheetId = e.dataTransfer.getData('text/sheet-id');
    if (!id && !sbId && !sheetId) return;
    e.preventDefault();
    const rect = boardRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.round((e.clientX - rect.left) / (CELL * zoom) - 0.5));
    const y = Math.max(0, Math.round((e.clientY - rect.top) / (CELL * zoom) - 0.5));
    if (sbId) {
      if (isDm) send({ t: 'spawnStatblock', id: sbId, x, y, rollHp: e.shiftKey });
      return;
    }
    if (sheetId) {
      send({ t: 'placeSheetToken', sheetId, x, y });
      return;
    }
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
        {isDm && (
          <button
            className={`add-token-fab ${zoneDraw ? 'on' : ''}`}
            onClick={() => setZoneDraw((v) => !v)}
            title="Bấm-kéo lên bản đồ để vẽ 1 vùng phòng/khu vực; bấm vào vùng đã vẽ (khi tắt chế độ này) để xem mô tả"
          >
            {zoneDraw ? '✓ Đang vẽ vùng' : '📐 Vẽ vùng'}
          </button>
        )}
      </div>

      {isDm && <BestiaryPalette />}
      {isDm && <NpcPalette />}
      <CharacterPalette />

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

      {aoe && aoeView && (
        <div className="cover-warning cast-banner" onClick={cancelCast} title="Bấm để hủy">
          🔺 <strong>{aoe.label}</strong> · {aoe.spec.shape} {aoe.spec.size}ft —{' '}
          <strong>{aoeView.hitIds.length}</strong> mục tiêu trong vùng — bấm bản đồ để xác nhận
          (Esc / bấm đây để hủy)
        </div>
      )}

      {castingSpell && (
        <div className="cover-warning cast-banner" onClick={cancelCast} title="Bấm để hủy">
          🪄 Ra <strong>{castingSpell.spell.name}</strong>
          {castingSpell.spell.range ? ` · tầm ${castingSpell.spell.range}` : ''}
          {castingSpell.spell.area ? ` · vùng ${castingSpell.spell.area}` : ''} — bấm token mục
          tiêu (Esc / bấm đây để hủy)
        </div>
      )}

      {castingMonsterSpell && (
        <div className="cover-warning cast-banner" onClick={cancelCast} title="Bấm để hủy">
          🪄 Ra <strong>{castingMonsterSpell.spell.name}</strong>
          {castingMonsterSpell.spell.range ? ` · tầm ${castingMonsterSpell.spell.range}` : ''}
          {castingMonsterSpell.spell.area ? ` · vùng ${castingMonsterSpell.spell.area}` : ''} — bấm token mục
          tiêu (Esc / bấm đây để hủy)
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

      <div className="board-scroll" ref={boardScrollRef}>
        {/* Sized to the SCALED board so the native scrollbars cover the zoomed-out/in extent.
            Padded on all sides so the board isn't pinned to the top-left corner — scroll into
            the padding to drag the map away from the edge and re-centre it. */}
        <div
          style={{
            width: map.cols * CELL * zoom,
            height: map.rows * CELL * zoom,
            padding: PAN_PAD,
          }}
        >
        <div
          ref={boardRef}
          className="board"
          style={{
            width: map.cols * CELL,
            height: map.rows * CELL,
            backgroundImage: map.backgroundUrl ? `url(${map.backgroundUrl})` : undefined,
            backgroundSize: '100% 100%',
            transform: `scale(${zoom})`,
            transformOrigin: '0 0',
          }}
          onPointerDown={onBoardPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerDownCapture={(e) => {
            if (!aoe || !aoeView) return;
            e.stopPropagation();
            e.preventDefault();
            confirmAoe(aoeView.hitIds);
          }}
          onDragOver={(e) => {
            const types = e.dataTransfer.types;
            if (types.includes('text/token-id') || types.includes('text/statblock-id')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={onBoardDrop}
          onClick={(e) => {
            if (suppressBoardClick.current) {
              suppressBoardClick.current = false; // was a pan, not a click — don't deselect
              return;
            }
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

          {moveInfo && activeToken && (
            <>
              <div
                className={`move-range ${moveInfo.used > moveInfo.budget ? 'over' : ''}`}
                style={{
                  left: (moveInfo.anchor.x - moveInfo.cells) * CELL,
                  top: (moveInfo.anchor.y - moveInfo.cells) * CELL,
                  width: (SIZE_CELLS[activeToken.size] + moveInfo.cells * 2) * CELL,
                  height: (SIZE_CELLS[activeToken.size] + moveInfo.cells * 2) * CELL,
                }}
              />
              <div
                className="move-badge"
                style={{ left: activeToken.x * CELL, top: activeToken.y * CELL - 20 }}
              >
                {moveInfo.used}/{moveInfo.budget} ft
              </div>
            </>
          )}

          {aoe && aoeView && (
            <>
              {aoe.anchor === 'point' && aoe.rangeFeet && aoeView.cCentre ? (
                <div
                  className="cast-range"
                  style={{
                    left: aoeView.cCentre.x * CELL - (aoe.rangeFeet / FEET_PER_CELL) * CELL,
                    top: aoeView.cCentre.y * CELL - (aoe.rangeFeet / FEET_PER_CELL) * CELL,
                    width: (aoe.rangeFeet / FEET_PER_CELL) * CELL * 2,
                    height: (aoe.rangeFeet / FEET_PER_CELL) * CELL * 2,
                  }}
                />
              ) : null}
              <svg className="aoe-layer" width={map.cols * CELL} height={map.rows * CELL}>
                {aoeView.geo.kind === 'circle' ? (
                  <circle
                    className="aoe-shape"
                    cx={aoeView.geo.cx * CELL}
                    cy={aoeView.geo.cy * CELL}
                    r={aoeView.geo.r * CELL}
                  />
                ) : (
                  <polygon
                    className="aoe-shape"
                    points={aoeView.geo.pts.map((p) => `${p.x * CELL},${p.y * CELL}`).join(' ')}
                  />
                )}
              </svg>
            </>
          )}

          {castRing && (
            <div
              className="cast-range"
              style={{
                left:
                  (castRing.tk.x + SIZE_CELLS[castRing.tk.size] / 2) * CELL - castRing.radiusPx,
                top:
                  (castRing.tk.y + SIZE_CELLS[castRing.tk.size] / 2) * CELL - castRing.radiusPx,
                width: castRing.radiusPx * 2,
                height: castRing.radiusPx * 2,
              }}
            />
          )}

          {zones.map((z) => (
            <div
              key={z.id}
              className="zone-rect"
              style={{
                left: z.x * CELL,
                top: z.y * CELL,
                width: z.w * CELL,
                height: z.h * CELL,
                borderColor: z.color,
                background: `${z.color}22`,
                pointerEvents: zoneDraw ? 'none' : 'auto',
              }}
              onPointerDown={(e) => {
                // A zone sits on top of the board and would otherwise swallow the drag-to-pan
                // gesture whenever it starts over one — let it pan too, same as empty board (see
                // `panDrag`); `onClick` below only opens the popup when it wasn't actually a drag.
                if (zoneDraw || castingSpell || castingMonsterSpell || aoe || !boardScrollRef.current) return;
                e.stopPropagation();
                const scroller = boardScrollRef.current;
                panDrag.current = {
                  x: e.clientX,
                  y: e.clientY,
                  scrollLeft: scroller.scrollLeft,
                  scrollTop: scroller.scrollTop,
                  moved: false,
                };
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (suppressBoardClick.current) {
                  suppressBoardClick.current = false;
                  return;
                }
                if (castingSpell || groupMode || aoe) return;
                setZonePopup({ kind: 'existing', zone: z });
              }}
              title={`${z.code ? z.code + ' — ' : ''}${z.name}`}
            >
              {(z.code || z.name) && (
                <span className="zone-chip" style={{ background: z.color }}>
                  {z.code || z.name}
                </span>
              )}
            </div>
          ))}

          {drawRect && (
            <div
              className="zone-draw-rect"
              style={{
                left: drawRect.x * CELL,
                top: drawRect.y * CELL,
                width: drawRect.w * CELL,
                height: drawRect.h * CELL,
              }}
            />
          )}

          {tokens
            .filter((t) => isDm || !t.hidden)
            .map((t) => {
              const span = SIZE_CELLS[t.size];
              // While this token is the one being dragged, follow the local (instant) position
              // instead of the throttled store one — see `dragPos`.
              const px = dragPos?.id === t.id ? dragPos.x : t.x;
              const py = dragPos?.id === t.id ? dragPos.y : t.y;
              return (
                <div
                  key={t.id}
                  className={`token ${selected === t.id ? 'sel' : ''} ${
                    groupSel.has(t.id) ? 'group-sel' : ''
                  } ${t.hidden ? 'hidden' : ''} ${
                    t.cover === 'total' ? 'cover-total' : ''
                  } ${aoeView?.hitIds.includes(t.id) ? 'aoe-hit' : ''}`}
                  style={{
                    left: px * CELL,
                    top: py * CELL,
                    width: span * CELL - 4,
                    height: span * CELL - 4,
                    background: t.imageUrl ? `center/cover url(${t.imageUrl})` : t.color,
                  }}
                  onPointerDown={(e) => {
                    if (e.button === 2) return; // right-click handled by onContextMenu
                    onPointerDown(e, t);
                  }}
                  onContextMenu={(e) => {
                    // No browser menu on tokens: right-click just selects (inspector has Delete).
                    e.preventDefault();
                    if (!castingSpell && !groupMode) setSelected(t.id);
                  }}
                  onDragStart={(e) => e.preventDefault()}
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
                  {t.healthTier && HEALTH_TIER_VI[t.healthTier].icon && (
                    <span className="tk-tier" title={`Tình trạng: ${HEALTH_TIER_VI[t.healthTier].text}`}>
                      {HEALTH_TIER_VI[t.healthTier].icon}
                    </span>
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
      </div>
      <div className="zoom-controls">
        <button title="Thu nhỏ (Ctrl+cuộn chuột để zoom quanh con trỏ)" onClick={() => zoomBy(1 / 1.1)}>
          −
        </button>
        <button title="Đặt lại 100%" onClick={() => setZoom(1)}>
          {Math.round(zoom * 100)}%
        </button>
        <button title="Phóng to (Ctrl+cuộn chuột để zoom quanh con trỏ)" onClick={() => zoomBy(1.1)}>
          +
        </button>
      </div>
      <DddiceCanvas />

      {selectedToken && (
        <TokenInspector
          key={selectedToken.id}
          token={selectedToken}
          onClose={() => setSelected(null)}
          inGroup={groupSel.has(selectedToken.id)}
          onToggleGroup={() => toggleGroup(selectedToken.id)}
        />
      )}

      {isDm && (
        <ZonePopup
          key={zonePopup?.kind === 'existing' ? zonePopup.zone.id : zonePopup?.kind === 'new' ? 'new' : 'none'}
          state={zonePopup}
          onClose={() => setZonePopup(null)}
          onSave={(zone: MapZone) => {
            send({ t: 'zoneUpsert', zone });
            setZonePopup(null);
          }}
          onDelete={(id: string) => {
            send({ t: 'zoneRemove', id });
            setZonePopup(null);
          }}
        />
      )}
    </div>
  );
}

function MapToolbar() {
  const room = useStore((s) => s.room)!;
  const send = useStore((s) => s.send);
  const { map } = room;
  const zones = room.zones ?? [];
  const [aspect, setAspect] = useState<number | null>(null);

  const mapId = mapIdFromBackgroundUrl(map.backgroundUrl);
  const layout = mapId ? ZONE_LAYOUTS[mapId] : undefined;
  const missingRooms = layout ? layout.rooms.filter((r) => !zones.some((z) => z.code === r.code)) : [];

  /** One-click fill-in for a map we already have a book-keyed layout for (see
   *  `crookedMoonZoneLayouts.json`) — pulls each room's code/coords from the layout and its
   *  name/read-aloud/DM notes from the zone library (`ZONE_LIBRARY`), same source `ZonePopup`'s
   *  own search box uses. Coordinates are hand-estimated off the book's own numbered map, so
   *  they're close but not pixel-perfect — nudge a zone's X/Y/Rộng/Cao in its popup if needed. */
  function importKnownZones() {
    if (!layout) return;
    for (const r of missingRooms) {
      const lib = ZONE_LIBRARY.find((e) => e.code === r.code && e.chapter === layout.chapter);
      send({
        t: 'zoneUpsert',
        zone: {
          id: nanoIdish(),
          name: lib?.name ?? r.code,
          code: r.code,
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
          color: '#8a5a3b',
          readAloud: lib?.readAloud ?? '',
          dmNotes: lib?.dmNotes ?? '',
          source: lib?.source,
        },
      });
    }
  }

  // Auto grid: keep rows in step with the background's aspect ratio.
  function loadAspect(url: string | undefined) {
    if (!url) return setAspect(null);
    const img = new Image();
    img.onload = () => setAspect(img.naturalWidth / img.naturalHeight);
    img.src = url;
  }
  function setCols(cols: number) {
    const patch: { cols: number; rows?: number } = { cols };
    if (aspect) patch.rows = Math.max(2, Math.round(cols / aspect));
    send({ t: 'updateMap', patch });
  }

  return (
    <div className="map-toolbar">
      <ImageField
        label="Nền bản đồ"
        value={map.backgroundUrl}
        onChange={(url) => {
          send({ t: 'updateMap', patch: { backgroundUrl: url } });
          loadAspect(url);
        }}
      />
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
      {layout && missingRooms.length > 0 && (
        <button
          className="link"
          title="Tự tạo vùng H1, H2… theo tọa độ ước lượng từ bản đồ gốc trong sách — bấm vào từng vùng sau đó để chỉnh lại vị trí/kích thước nếu lệch"
          onClick={importKnownZones}
        >
          📥 Nạp {missingRooms.length} mã vùng có sẵn cho bản đồ này
        </button>
      )}
    </div>
  );
}

/** Image picker: upload a file to the server, or paste a URL. */
function ImageField({
  value,
  onChange,
  label = 'Ảnh',
}: {
  value: string | undefined;
  onChange: (url: string | undefined) => void;
  label?: string;
}) {
  const [url, setUrl] = useState(value ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setErr('');
    try {
      const u = await uploadImage(file);
      setUrl(u);
      onChange(u);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="image-field">
      <span className="if-label">{label}</span>
      <div className="if-row">
        {value && <span className="if-thumb" style={{ backgroundImage: `url(${value})` }} />}
        <label className="if-upload">
          {busy ? '…' : '⬆ Tải lên'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            disabled={busy}
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </label>
        <input
          className="if-url"
          value={url}
          placeholder="hoặc dán URL"
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => onChange(url || undefined)}
        />
        {value && (
          <button
            className="link"
            onClick={() => {
              setUrl('');
              onChange(undefined);
            }}
          >
            ✕
          </button>
        )}
      </div>
      {err && <span className="if-err">{err}</span>}
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
        <button
          className="link"
          title="Homebrew — Bracer of Brutality: Necrotic = WIS mod (tối thiểu 1), không thể giảm/tránh, nếu không gây sát thương lượt này"
          onClick={() =>
            add({ name: 'Nguyền: Vòng tay Bạo lực', cursedNoHitSelfDamage: { ability: 'wis' } })
          }
        >
          + nguyền Vòng tay Bạo lực
        </button>
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
  const bestiary = useStore((s) => s.room?.bestiary ?? []);
  const openBestiary = useStore((s) => s.openBestiary);
  const resetTokenMove = useStore((s) => s.resetTokenMove);
  const tokenDash = useStore((s) => s.tokenDash);
  const isDm = useStore((s) => s.isDm());
  const meId = useStore((s) => s.participantId);
  const tokens = useStore((s) => s.room?.tokens ?? []);
  const sheets = useStore((s) => s.room?.sheets ?? []);
  const initiative = useStore((s) => s.room?.initiative);
  const beginMonsterCast = useStore((s) => s.beginMonsterCast);
  const mySheets = sheets.filter((s) => isDm || s.ownerId === meId);
  const linkedSheet = sheets.find((s) => s.tokenId === token.id) ?? null;
  const [atkName, setAtkName] = useState('Đòn đánh');
  const [atkBonus, setAtkBonus] = useState('5');
  const [dmg, setDmg] = useState('1d8+3');
  const [dmgType, setDmgType] = useState<string | undefined>(undefined);
  const [attackerId, setAttackerId] = useState('');
  const [sbTargetId, setSbTargetId] = useState('');
  const [sbRollMode, setSbRollMode] = useState<RollMode>('normal');
  const [spellPickerOpen, setSpellPickerOpen] = useState(false);
  const [spellSearch, setSpellSearch] = useState('');
  const [rolledLoot, setRolledLoot] = useState<Currency | null>(null);
  const [lootTargetSheetId, setLootTargetSheetId] = useState('');
  const sbd20 = (mod: number) => d20Check(mod, sbRollMode);
  const mtag =
    sbRollMode === 'advantage' ? ' (lợi thế)' : sbRollMode === 'disadvantage' ? ' (bất lợi)' : '';

  useEffect(() => {
    if (!spellPickerOpen) return;
    function onDown(e: MouseEvent) {
      const el = e.target as HTMLElement;
      if (el.closest('.monster-spell-picker') || el.closest('.spell-picker-toggle')) return;
      setSpellPickerOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSpellPickerOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [spellPickerOpen]);

  const sb = token.statblock;
  const canSeeStatblock = sb && (isDm || token.controllerId === meId);
  const sbTargetName = tokens.find((t) => t.id === sbTargetId)?.label ?? '';

  const canControl = isDm || token.controllerId === meId;
  // Enemy numbers are stripped server-side for players (see `tokenForPlayers`); don't show empty editable boxes.
  const statsHidden = !isDm && statsHiddenFromPlayers(token);
  const statblockHidden = !isDm && statblockHiddenFromPlayers(token);
  const isActiveTurn =
    !!initiative?.running &&
    initiative.entries.find((e) => e.isActive)?.tokenId === token.id;
  const speed = tokenWalkSpeed(token, sheets);
  const moveBudget = speed + (token.extraMove ?? 0);
  const moveUsed = token.turnAnchor
    ? gridFeet(token.turnAnchor, { x: token.x, y: token.y })
    : 0;

  const linkedEntry = token.statblock?.fromId
    ? (bestiary.find((s) => s.id === token.statblock!.fromId) ?? null)
    : null;

  const beginAoe = useStore((s) => s.beginAoe);

  function startActionAoe(
    a: NonNullable<Token['statblock']>['actions'][number],
    base: string,
    parts: ReturnType<typeof statblockDamageParts>,
  ) {
    const desc = a.description ?? '';
    const spec = parseArea(desc);
    if (!spec || !a.save) return;
    const point = /point (?:you|it) choose|point within|within \d+ feet of (?:you|it)/i.test(desc);
    const rangeFeet = Number(/within (\d+) feet/i.exec(desc)?.[1] ?? 0);
    const half = /half damage/i.test(desc);
    const save = a.save;
    beginAoe({
      label: base,
      spec,
      anchor:
        point && (spec.shape === 'sphere' || spec.shape === 'cube')
          ? 'point'
          : defaultAnchor(spec, 0, true),
      casterTokenId: token.id,
      rangeFeet: point ? rangeFeet : 0,
      onConfirm: (ids, aoeId) =>
        ids.forEach((id) =>
          send({
            t: 'spellSave',
            targetTokenId: id,
            ability: save.ability,
            dc: save.dc,
            label: base,
            damageOnFail: parts.length ? parts : undefined,
            damageHalfOnSave: half,
            aoeId,
            sourceTokenId: token.id,
          }),
        ),
    });
  }

  function saveToBestiary() {
    const next = statblockFromToken(token, linkedEntry ?? undefined);
    send({ t: 'bestiaryUpsert', statblock: next });
    if (!linkedEntry) send({ t: 'updateToken', id: token.id, patch: { statblock: tokenStatblockFrom(next) } });
    openBestiary(next.id);
  }

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
        {canControl && (
          <button
            className="link danger"
            title="Xóa token (phím Delete)"
            onClick={() => {
              if (!window.confirm(`Xóa token "${token.label}"?`)) return;
              send({ t: 'removeToken', id: token.id });
              onClose();
            }}
          >
            🗑
          </button>
        )}
        <button className="link" onClick={onClose}>
          ✕
        </button>
      </div>
      {isDm && (
        <div className="insp-sb-link">
          {linkedEntry && (
            <button title="Mở stat block gốc trong Bestiary" onClick={() => openBestiary(linkedEntry.id)}>
              📖 Mở statblock
            </button>
          )}
          {linkedEntry && (
            <button
              title="Nạp lại statblock từ Bestiary vào token này (ghi đè chỉnh sửa riêng trên token, nếu có) — dùng khi Bestiary vừa được cập nhật (vd thêm DC/mod phép) sau khi token đã spawn"
              onClick={() => patch({ statblock: tokenStatblockFrom(linkedEntry) })}
            >
              🔄 Đồng bộ từ Bestiary
            </button>
          )}
          <button
            title={
              linkedEntry
                ? 'Ghi chỉnh sửa của token này ngược lại vào stat block gốc'
                : 'Tạo stat block mới trong Bestiary từ token này'
            }
            onClick={saveToBestiary}
          >
            {linkedEntry ? '💾 Cập nhật statblock' : '💾 Lưu vào Bestiary'}
          </button>
        </div>
      )}
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
      {canControl && (
        <div className={`insp-move ${moveUsed > moveBudget ? 'over' : ''}`}>
          <span title="Đã di chuyển trong lượt này / tốc độ">
            🏃 {isActiveTurn ? `${moveUsed}/${moveBudget} ft` : `Tốc độ ${speed} ft`}
            {tokenIsGrappled(token) ? ' · bị ghì (0)' : ''}
          </span>
          {isActiveTurn && (
            <>
              <button className="link" onClick={() => tokenDash(token.id)} title="Dùng action Dash">
                ⚡ Dash
              </button>
              <button
                className="link"
                onClick={() => resetTokenMove(token.id)}
                title="Trả token về vị trí đầu lượt"
              >
                ↺ Reset
              </button>
            </>
          )}
        </div>
      )}

      {statsHidden && token.healthTier && (
        <p className="hint insp-tier">
          {HEALTH_TIER_VI[token.healthTier].icon} Tình trạng: <strong>{HEALTH_TIER_VI[token.healthTier].text}</strong>
          <span> — AC / HP của kẻ địch được giấu</span>
        </p>
      )}
      <div className="insp-grid">
        {!statsHidden && (
          <>
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
          {/* Cover's +AC is applied automatically when an attack rolls to hit — it's kept off this
              field itself (so the printed/base AC doesn't drift), just previewed here. */}
          {typeof token.armorClass === 'number' && coverAcBonus(token.cover) > 0 && (
            <span className="hint">
              hiệu lực {token.armorClass + coverAcBonus(token.cover)} (do che chắn)
            </span>
          )}
        </label>
          </>
        )}
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
        <ImageField
          label="Ảnh token"
          value={token.imageUrl}
          onChange={(url) => patch({ imageUrl: url })}
        />
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
        {isDm && token.statblock && (
          <label className="chk" title="Mặc định người chơi KHÔNG thấy AC / HP / statblock của quái — chỉ thấy tình trạng (nguyên vẹn → gục ngã). Bật để lộ hết.">
            <input
              type="checkbox"
              checked={!!token.revealStats}
              onChange={(e) => patch({ revealStats: e.target.checked || undefined })}
            />
            Hiện AC / HP cho người chơi
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

      {!statblockHidden && (
        <details className="def-details">
          <summary>Phòng thủ (kháng / miễn / DR)</summary>
          <DefensesEditor
            defenses={token.defenses}
            onChange={(d) => patch({ defenses: d })}
          />
        </details>
      )}

      <EffectsPanel token={token} />

      {canSeeStatblock && sb && (
        <div className="sb-inspect">
          {sb.meta && <div className="sb-meta">{sb.meta}</div>}
          {isDm && linkedEntry && (
            <div className="loot-roller">
              <button
                className="roll-btn"
                title="Roll nhanh tiền rơi ra theo CR — homebrew, không phải bảng DMG, chỉ để đỡ tự set tay. Vật phẩm ma thuật vẫn do DM tự thêm."
                onClick={() => setRolledLoot(randomLootFor(linkedEntry.cr))}
              >
                🎲 random loot (CR {linkedEntry.cr})
              </button>
              {rolledLoot && (
                <div className="loot-result">
                  <span>
                    {COIN_TYPES.filter((c) => rolledLoot[c] > 0)
                      .map((c) => `${rolledLoot[c]} ${c}`)
                      .join(' · ') || '0'}
                    {' '}(≈ {currencyInGp(rolledLoot).toFixed(2)} gp)
                  </span>
                  <select value={lootTargetSheetId} onChange={(e) => setLootTargetSheetId(e.target.value)}>
                    <option value="">— cộng vào nhân vật —</option>
                    {sheets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="roll-btn strong"
                    disabled={!lootTargetSheetId}
                    onClick={() => {
                      const target = sheets.find((s) => s.id === lootTargetSheetId);
                      if (!target) return;
                      send({
                        t: 'upsertSheet',
                        sheet: { ...target, currency: addCurrency(target.currency, rolledLoot) },
                      });
                      setRolledLoot(null);
                      setLootTargetSheetId('');
                    }}
                  >
                    + cộng
                  </button>
                  <button className="link" onClick={() => setRolledLoot(null)}>
                    ✕
                  </button>
                </div>
              )}
            </div>
          )}
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
                        attackRange: attackRangeOf(a),
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
                {a.save && parseArea(a.description) && (
                  <button
                    className="roll-btn strong"
                    title="Đặt vùng AoE lên bản đồ, chọn mục tiêu rồi tự roll save"
                    onClick={() => startActionAoe(a, base, parts)}
                  >
                    🔺 vùng
                  </button>
                )}
                {a.save && !parseArea(a.description) && (
                  <button
                    className="roll-btn strong"
                    disabled={!sbTargetId}
                    title={
                      sbTargetId
                        ? 'Roll saving throw cho mục tiêu đã chọn, tự roll sát thương nếu fail'
                        : 'Chọn mục tiêu ở trên trước'
                    }
                    onClick={() =>
                      sbTargetId &&
                      send({
                        t: 'spellSave',
                        targetTokenId: sbTargetId,
                        ability: a.save!.ability,
                        dc: a.save!.dc,
                        label: `${base} → ${sbTargetName}`,
                        damageOnFail: parts.length ? parts : undefined,
                        damageHalfOnSave: /half damage/i.test(a.description ?? ''),
                        sourceTokenId: token.id,
                      })
                    }
                  >
                    🎯 save
                  </button>
                )}
                {parts.length > 0 && !a.save && (
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
          {(sb.legendaryActions?.length ?? 0) > 0 && (
            <details className="sb-traits-view" open>
              <summary>
                ⚡ Legendary actions ({token.legendaryActionsRemaining ?? sb.legendaryActionsPerRound ?? 0}/
                {sb.legendaryActionsPerRound})
              </summary>
              {sb.legendaryActions!.map((a, i) => (
                <p key={i}>
                  <strong>{a.name}.</strong> {a.description}
                </p>
              ))}
            </details>
          )}
          {sb.hasLairActions && (sb.lairActions?.length ?? 0) > 0 && (
            <details className="sb-traits-view">
              <summary>🏰 Lair actions</summary>
              {sb.lairActions!.map((a, i) => (
                <p key={i}>
                  <strong>{a.name}.</strong> {a.description}
                </p>
              ))}
            </details>
          )}
          {sb.spellcasting && (
            <details className="sb-traits-view" open>
              <summary>
                🔮 Phép (DC {sb.spellcasting.spellSaveDc} · {fmtMod(sb.spellcasting.spellAttackBonus)} đánh)
                {isDm && (
                  <button
                    className="roll-btn sm spell-picker-toggle"
                    title="Tìm & chọn phép bất kỳ trong SRD, cast bằng DC/mod của con quái này"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSpellPickerOpen((v) => !v);
                      setSpellSearch('');
                    }}
                  >
                    {spellPickerOpen ? '✕ đóng tìm phép' : '🔍 tìm phép khác'}
                  </button>
                )}
              </summary>
              {/* Inline, not a floating/fixed panel — avoids ever overlapping or fighting the
                  sidebar's own layout regardless of window width or scroll position. */}
              {spellPickerOpen && (
                <div className="monster-spell-picker">
                  <input
                    autoFocus
                    placeholder="Tìm phép (SRD)…"
                    value={spellSearch}
                    onChange={(e) => setSpellSearch(e.target.value)}
                  />
                  <div className="spell-picker-list">
                    {SRD_SPELLS.filter((d) =>
                      d.name.toLowerCase().includes(spellSearch.trim().toLowerCase()),
                    )
                      .slice(0, 60)
                      .map((def) => (
                        <button
                          key={def.id}
                          className="spell-picker-row"
                          onClick={() => {
                            const spell = monsterSpellFrom(def, sb.spellcasting!, `${token.id}-${def.id}-${Date.now()}`);
                            beginMonsterCast(token.id, spell, sb.spellcasting!.spellAttackBonus);
                            setSpellPickerOpen(false);
                          }}
                        >
                          <span className="spell-picker-name">{def.name}</span>
                          <span className="spell-picker-meta">
                            {def.level ? `lv${def.level}` : 'cantrip'}
                            {def.school ? ` · ${def.school}` : ''}
                          </span>
                        </button>
                      ))}
                    {SRD_SPELLS.filter((d) =>
                      d.name.toLowerCase().includes(spellSearch.trim().toLowerCase()),
                    ).length === 0 && <p className="hint">Không tìm thấy phép nào khớp.</p>}
                  </div>
                </div>
              )}
              {sb.spellcasting.spellNames.map((name) => {
                const def = findCantrip(name);
                if (!def) return <p key={name} className="hint">{name} — không tìm thấy trong database</p>;
                const spell = monsterSpellFrom(def, sb.spellcasting!, `${token.id}-${def.id}`);
                return (
                  <div key={name} className="sb-act">
                    <span className="sb-act-name" title={spell.notes}>
                      {spell.name}
                      <em> · lv{spell.level}{spell.school ? ` ${spell.school}` : ''}</em>
                    </span>
                    <span className="sb-act-detail">
                      {spell.range ?? ''}
                      {spell.area ? ` · ${spell.area}` : ''}
                    </span>
                    {isDm && (
                      <button
                        className="roll-btn strong"
                        title="Chọn mục tiêu như người chơi cast từ char sheet"
                        onClick={() => beginMonsterCast(token.id, spell, sb.spellcasting!.spellAttackBonus)}
                      >
                        🪄 ra phép
                      </button>
                    )}
                  </div>
                );
              })}
              {sb.spellcasting.spellNames.length === 0 && (
                <p className="hint">
                  Chưa gán tên phép cố định — bấm "🔍 tìm phép khác" để tra SRD và cast trực tiếp.
                </p>
              )}
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

/** DM-only: drag a stat block from the bestiary straight onto the map to spawn its token. */
function BestiaryPalette() {
  const bestiary = useStore((s) => s.room?.bestiary ?? []);
  const [q, setQ] = useState('');
  if (bestiary.length === 0) return null;
  const term = q.trim().toLowerCase();
  const list = bestiary
    .filter((s) => !term || `${s.name} ${s.cr} ${(s.tags ?? []).join(' ')}`.toLowerCase().includes(term))
    .slice(0, 40);
  return (
    <details className="token-palette bestiary-palette">
      <summary>⚔ Kéo quái vào bản đồ ({bestiary.length})</summary>
      <input
        className="bp-search"
        value={q}
        placeholder="Tìm quái… (giữ Shift khi thả = tung HP)"
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="tp-list">
        {list.map((s) => (
          <div
            key={s.id}
            className="tp-chip"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/statblock-id', s.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            title={`Kéo "${s.name}" (CR ${s.cr || '?'}, AC ${s.ac}, HP ${s.maxHp}) vào bản đồ`}
          >
            <span
              className="tp-dot"
              style={s.imageUrl ? { background: `center/cover url(${s.imageUrl})` } : { background: s.color }}
            />
            {s.name}
            {s.cr ? <small> · CR {s.cr}</small> : null}
          </div>
        ))}
        {list.length === 0 && <span className="hint">Không thấy.</span>}
      </div>
    </details>
  );
}

/** DM-only: drag an NPC (from `room.bestiary`, tag "npc") straight onto the map to spawn its
 *  token — same mechanism as BestiaryPalette, filtered to the story-NPC subset so they don't
 *  get lost in the monster list. Entries land here once opened/spawned from the NPC tab. */
function NpcPalette() {
  const bestiary = useStore((s) => s.room?.bestiary ?? []);
  const [q, setQ] = useState('');
  const npcs = bestiary.filter((s) => s.tags.includes('npc'));
  if (npcs.length === 0) return null;
  const term = q.trim().toLowerCase();
  const list = npcs
    .filter((s) => !term || `${s.name} ${s.cr} ${(s.tags ?? []).join(' ')}`.toLowerCase().includes(term))
    .slice(0, 40);
  return (
    <details className="token-palette npc-palette">
      <summary>🧑‍🤝‍🧑 Kéo NPC vào bản đồ ({npcs.length})</summary>
      <input
        className="bp-search"
        value={q}
        placeholder="Tìm NPC… (giữ Shift khi thả = tung HP)"
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="tp-list">
        {list.map((s) => (
          <div
            key={s.id}
            className="tp-chip"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/statblock-id', s.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            title={`Kéo "${s.name}" (CR ${s.cr || '?'}, AC ${s.ac}, HP ${s.maxHp}) vào bản đồ`}
          >
            <span
              className="tp-dot"
              style={s.imageUrl ? { background: `center/cover url(${s.imageUrl})` } : { background: s.color }}
            />
            {s.name}
            {s.cr ? <small> · CR {s.cr}</small> : null}
          </div>
        ))}
        {list.length === 0 && <span className="hint">Không thấy.</span>}
      </div>
    </details>
  );
}

/** Drag a character's chip onto the map — a "token bank" for player characters, mirroring
 *  BestiaryPalette's drag-to-spawn for monsters. Reuses the sheet's existing token if it's
 *  already on this scene, otherwise places (and links) a fresh one, e.g. after switching maps. */
function CharacterPalette() {
  const sheets = useStore((s) => s.room?.sheets ?? []);
  const isDm = useStore((s) => s.isDm());
  const meId = useStore((s) => s.participantId);
  const list = sheets.filter((s) => isDm || s.ownerId === meId);
  if (list.length === 0) return null;
  return (
    <details className="token-palette" open>
      <summary>🧑 Kéo nhân vật vào bản đồ ({list.length})</summary>
      <div className="tp-list">
        {list.map((s) => (
          <div
            key={s.id}
            className="tp-chip"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/sheet-id', s.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            title={`Kéo "${s.name}" vào bản đồ — đặt token đại diện tại đây (dùng lại token cũ nếu đã có trên map này)`}
          >
            <span className="tp-dot" style={{ background: '#c0392b' }} />
            {s.name}
          </div>
        ))}
      </div>
    </details>
  );
}

/** Memoised: takes no props, so it only re-renders when its own store selectors change. */
export const BattleMap = memo(BattleMapImpl);
