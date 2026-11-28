import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LIGHT_PRESETS,
  buildVision,
  newlySeenCells,
  parseUvtt,
  pointSeen,
  tokenDarkvision,
  type BattleMap,
  type CharacterSheet,
  type MapLight,
  type SceneLight,
  type Token,
  type VisionModel,
  type Wall,
} from '@dnd-table/shared';
import { useStore } from '../store.js';
import { nanoIdish } from '../util.js';

/**
 * Dynamic fog & sight on the battle map: players see what their own tokens see (walls block it,
 * darkness needs a light or darkvision), seen areas stay greyed when the DM keeps explored memory.
 * The DM draws walls / doors / lights here and can preview the players' view.
 */

export type FogMode = 'none' | 'wall' | 'door' | 'light' | 'erase';
export interface FogTool {
  mode: FogMode;
  /** Light preset key for the light tool. */
  preset: string;
  /** DM: look at the map as the players do. */
  preview: boolean;
}

const PC = (t: Token, sheets: CharacterSheet[]) => !!t.controllerId || sheets.some((s) => s.tokenId === t.id);

/**
 * The vision model for whoever is looking: a player's own tokens (or, controlling none, the
 * whole party); the DM sees everything unless previewing (then the whole party's view).
 * Null = no fog (fog off, or the DM not previewing).
 */
export function useVision(map: BattleMap, tokens: Token[], sheets: CharacterSheet[], light: SceneLight | null | undefined, isDm: boolean, meId: string | null, preview: boolean): VisionModel | null {
  return useMemo(() => {
    if (!map.fog?.enabled || (isDm && !preview)) return null;
    const visible = tokens.filter((t) => !t.hidden);
    const mine = isDm ? [] : visible.filter((t) => t.controllerId === meId || sheets.some((s) => s.tokenId === t.id && s.ownerId === meId));
    const viewers = (mine.length ? mine : visible.filter((t) => PC(t, sheets))).map((t) => ({
      token: t,
      darkvisionFt: tokenDarkvision(t, sheets.find((s) => s.tokenId === t.id)),
    }));
    return buildVision(map, light, viewers, visible);
  }, [map, tokens, sheets, light, isDm, meId, preview]);
}

/** The fog itself: black where unseen, grey where explored, clear where seen now. */
export function FogCanvas({ map, vision, cell, isDm }: { map: BattleMap; vision: VisionModel; cell: number; isDm: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const send = useStore((s) => s.send);
  const W = map.cols * cell;
  const H = map.rows * cell;

  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'destination-out';
    // explored memory: partly see-through
    if (map.fog?.explore && map.explored) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      for (let i = 0; i < map.explored.length; i++) if (map.explored[i] === '1') ctx.fillRect((i % map.cols) * cell, Math.floor(i / map.cols) * cell, cell, cell);
    }
    // what is seen now
    ctx.fillStyle = 'rgba(0,0,0,1)';
    const path = (pts: { x: number; y: number }[]) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x * cell, p.y * cell) : ctx.moveTo(p.x * cell, p.y * cell)));
      ctx.closePath();
    };
    for (const v of vision.viewers) {
      ctx.save();
      path(v.poly);
      ctx.clip();
      if (vision.lit) ctx.fillRect(0, 0, W, H);
      else {
        if (v.dv > 0) {
          ctx.beginPath();
          ctx.arc(v.o.x * cell, v.o.y * cell, v.dv * cell, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const l of vision.lights) {
          ctx.save();
          path(l.poly);
          ctx.clip();
          ctx.beginPath();
          ctx.arc(l.o.x * cell, l.o.y * cell, l.r * cell, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  }, [vision, map.explored, map.fog?.explore, map.cols, cell, W, H]);

  // explored memory: tell the server which cells the party now sees (a player's view only)
  const pending = useRef<number | null>(null);
  useEffect(() => {
    if (isDm || !map.fog?.explore) return;
    if (pending.current) window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => {
      const cells = newlySeenCells(vision, map.cols, map.rows, map.explored);
      if (cells.length) send({ t: 'fogExplore', cells });
    }, 600);
    return () => {
      if (pending.current) window.clearTimeout(pending.current);
    };
  }, [vision, isDm, map.fog?.explore, map.cols, map.rows, map.explored, send]);

  return <canvas ref={ref} className={`fog-layer ${isDm ? 'preview' : ''}`} width={W} height={H} style={{ width: W, height: H }} />;
}

/** Nearest grid corner (walls run along grid lines); Shift = free placement. */
const snap = (v: number, free: boolean) => (free ? Math.round(v * 4) / 4 : Math.round(v));

function distToSeg(p: { x: number; y: number }, w: Wall): number {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - w.x1) * dx + (p.y - w.y1) * dy) / L));
  return Math.hypot(p.x - (w.x1 + t * dx), p.y - (w.y1 + t * dy));
}

/**
 * Walls, doors and fixed lights drawn over the map. The DM sees and edits them (in a drawing mode
 * the layer takes the clicks); players only get door buttons for doors they can see.
 */
export function WallLayer({ map, cell, isDm, tool, vision }: { map: BattleMap; cell: number; isDm: boolean; tool: FogTool; vision: VisionModel | null }) {
  const send = useStore((s) => s.send);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const walls = map.walls ?? [];
  const lights = map.lights ?? [];
  const editing = isDm && tool.mode !== 'none';
  useEffect(() => {
    if (tool.mode !== 'wall' && tool.mode !== 'door') setStart(null);
  }, [tool.mode]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setStart(null);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const toGrid = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * map.cols, y: ((e.clientY - r.top) / r.height) * map.rows };
  };
  const setWalls = (w: Wall[]) => send({ t: 'updateMap', patch: { walls: w } });
  const setLights = (l: MapLight[]) => send({ t: 'updateMap', patch: { lights: l } });

  function onDown(e: React.PointerEvent) {
    if (!editing) return;
    e.stopPropagation();
    e.preventDefault();
    if (e.button === 2) return setStart(null);
    const g = toGrid(e);
    if (tool.mode === 'erase') {
      const w = walls.map((x) => ({ x, d: distToSeg(g, x) })).sort((a, b) => a.d - b.d)[0];
      const l = lights.map((x) => ({ x, d: Math.hypot(g.x - x.x, g.y - x.y) })).sort((a, b) => a.d - b.d)[0];
      if (l && l.d < 0.5 && (!w || l.d <= w.d)) setLights(lights.filter((x) => x.id !== l.x.id));
      else if (w && w.d < 0.4) setWalls(walls.filter((x) => x.id !== w.x.id));
      return;
    }
    if (tool.mode === 'light') {
      const p = LIGHT_PRESETS.find((x) => x.key === tool.preset) ?? LIGHT_PRESETS[1];
      setLights([...lights, { id: nanoIdish(), x: snap(g.x * 2, false) / 2, y: snap(g.y * 2, false) / 2, bright: p.bright, dim: p.dim }]);
      return;
    }
    const p = { x: snap(g.x, e.shiftKey), y: snap(g.y, e.shiftKey) };
    if (!start) return setStart(p);
    if (p.x === start.x && p.y === start.y) return setStart(null);
    setWalls([...walls, { id: nanoIdish(), x1: start.x, y1: start.y, x2: p.x, y2: p.y, ...(tool.mode === 'door' ? { door: true, open: false } : {}) }]);
    // walls chain on from the last point; a door is a single segment
    setStart(tool.mode === 'door' ? null : p);
  }

  const showWalls = isDm && (map.fog?.enabled || editing);
  const doorsForPlayers = !isDm ? walls.filter((w) => w.door && (!vision || pointSeen(vision, { x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 }))) : [];
  return (
    <>
      {(showWalls || editing) && (
        <svg
          className={`wall-layer ${editing ? 'editing' : ''}`}
          width={map.cols * cell}
          height={map.rows * cell}
          viewBox={`0 0 ${map.cols} ${map.rows}`}
          onPointerDown={onDown}
          onPointerMove={(e) => editing && start && setHover(toGrid(e))}
          onContextMenu={(e) => {
            if (editing) {
              e.preventDefault();
              setStart(null);
            }
          }}
        >
          {walls.map((w) => (
            <line key={w.id} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} className={w.door ? (w.open ? 'door open' : 'door') : 'wall'} />
          ))}
          {lights.map((l) => (
            <g key={l.id} className="map-light">
              <circle cx={l.x} cy={l.y} r={(l.bright + l.dim) / 5} className="ml-range" />
              <circle cx={l.x} cy={l.y} r={0.25} className="ml-dot" />
            </g>
          ))}
          {editing && start && (
            <>
              <circle cx={start.x} cy={start.y} r={0.15} className="wall-start" />
              {hover && <line x1={start.x} y1={start.y} x2={snap(hover.x, false)} y2={snap(hover.y, false)} className="wall-ghost" />}
            </>
          )}
        </svg>
      )}
      {/* door buttons: the DM always (outside a drawing mode), players for doors they can see */}
      {!editing &&
        (isDm ? walls.filter((w) => w.door) : doorsForPlayers).map((w) => (
          <button
            key={`door-${w.id}`}
            className={`door-btn ${w.open ? 'open' : ''}`}
            style={{ left: ((w.x1 + w.x2) / 2) * cell - 11, top: ((w.y1 + w.y2) / 2) * cell - 11 }}
            title={w.open ? 'Cửa đang mở — bấm để đóng' : 'Cửa đang đóng — bấm để mở'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              send({ t: 'toggleDoor', wallId: w.id });
            }}
          >
            🚪
          </button>
        ))}
    </>
  );
}

/** DM flyout: fog switches, drawing tools, explored reset, Universal VTT import. */
export function FogTools({ map, tool, setTool }: { map: BattleMap; tool: FogTool; setTool: (t: FogTool) => void }) {
  const send = useStore((s) => s.send);
  const [note, setNote] = useState('');
  const fog = map.fog ?? { enabled: false };
  const setFog = (f: Partial<NonNullable<BattleMap['fog']>>) => send({ t: 'updateMap', patch: { fog: { ...fog, ...f } } });
  const modes: [FogMode, string][] = [
    ['none', '✋ Thôi vẽ'],
    ['wall', '🧱 Tường'],
    ['door', '🚪 Cửa'],
    ['light', '🔥 Đèn'],
    ['erase', '🧽 Xoá'],
  ];
  async function importUvtt(f: File) {
    try {
      const j = JSON.parse(await f.text());
      const r = parseUvtt(j, nanoIdish);
      send({
        t: 'updateMap',
        patch: {
          walls: [...(map.walls ?? []), ...r.walls],
          lights: [...(map.lights ?? []), ...r.lights.map((l) => ({ id: nanoIdish(), x: l.x, y: l.y, bright: Math.round(l.feet / 2), dim: Math.round(l.feet / 2) }))],
          ...(r.size && !map.backgroundUrl ? { cols: Math.round(r.size.x), rows: Math.round(r.size.y) } : {}),
        },
      });
      setNote(`Đã nhập ${r.walls.length} tường/cửa, ${r.lights.length} đèn.`);
    } catch (e) {
      setNote(`Không đọc được file: ${(e as Error).message}`);
    }
  }
  return (
    <div className="fog-tools">
      <div className="mt-flyout-title">🌫 Fog & tầm nhìn</div>
      <label className="chk">
        <input type="checkbox" checked={!!fog.enabled} onChange={(e) => setFog({ enabled: e.target.checked })} />
        Bật fog (người chơi chỉ thấy trong tầm nhìn token của mình)
      </label>
      <label className="chk">
        <input type="checkbox" checked={!!fog.explore} onChange={(e) => setFog({ explore: e.target.checked })} />
        Nhớ vùng đã khám phá (hiện xám, không thấy token)
      </label>
      <label className="chk">
        <input type="checkbox" checked={tool.preview} onChange={(e) => setTool({ ...tool, preview: e.target.checked })} />
        Xem như người chơi
      </label>
      <div className="fog-modes">
        {modes.map(([m, l]) => (
          <button key={m} className={`cf-btn ${tool.mode === m ? 'on' : ''}`} onClick={() => setTool({ ...tool, mode: m })}>
            {l}
          </button>
        ))}
      </div>
      {tool.mode === 'light' && (
        <select value={tool.preset} onChange={(e) => setTool({ ...tool, preset: e.target.value })}>
          {LIGHT_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label} ({p.bright}/{p.dim} ft)
            </option>
          ))}
        </select>
      )}
      <p className="hint">
        {tool.mode === 'wall'
          ? 'Bấm các góc ô để vẽ tường nối tiếp; Esc / chuột phải để dừng; giữ Shift để đặt lệch lưới.'
          : tool.mode === 'door'
            ? 'Bấm 2 điểm để đặt 1 cửa. Bấm 🚪 trên bản đồ để đóng/mở.'
            : tool.mode === 'light'
              ? 'Bấm để đặt đèn cố định (lò lửa, đèn treo…).'
              : tool.mode === 'erase'
                ? 'Bấm gần tường / cửa / đèn để xoá.'
                : `${(map.walls ?? []).length} tường/cửa · ${(map.lights ?? []).length} đèn. Ánh sáng chung theo nút ngày/đêm ở thanh trên (Tối = cần đèn hoặc darkvision).`}
      </p>
      <div className="fog-modes">
        <button className="cf-btn" onClick={() => send({ t: 'updateMap', patch: { explored: '' } })} title="Xoá trí nhớ vùng đã khám phá">
          Xoá vùng đã khám phá
        </button>
        <button
          className="cf-btn"
          onClick={() => window.confirm('Xoá hết tường, cửa và đèn của bản đồ này?') && send({ t: 'updateMap', patch: { walls: [], lights: [] } })}
        >
          Xoá hết tường/đèn
        </button>
        <label className="cf-btn" title="Nhập tường, cửa, đèn từ file Universal VTT (.dd2vtt / .uvtt — Dungeondraft, Dungeon Alchemist…)">
          📥 Nhập .dd2vtt
          <input
            type="file"
            accept=".dd2vtt,.uvtt,.df2vtt,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importUvtt(f);
            }}
          />
        </label>
      </div>
      {note && <p className="hint">{note}</p>}
    </div>
  );
}

/** Token panel: the light it carries and its darkvision. */
export function TokenSightFields({ token, sheet, canEdit }: { token: Token; sheet?: CharacterSheet; canEdit: boolean }) {
  const send = useStore((s) => s.send);
  const cur = token.lightSource ? LIGHT_PRESETS.find((p) => p.bright === token.lightSource!.bright && p.dim === token.lightSource!.dim)?.key ?? 'custom' : '';
  const auto = tokenDarkvision({ darkvision: null }, sheet);
  if (!canEdit) return null;
  return (
    <div className="sight-fields">
      <label title="Nguồn sáng token mang theo (fog: chiếu sáng vùng tối, tường chặn)">
        🔥
        <select
          value={cur}
          onChange={(e) => {
            const p = LIGHT_PRESETS.find((x) => x.key === e.target.value);
            send({ t: 'updateToken', id: token.id, patch: { lightSource: p ? { bright: p.bright, dim: p.dim } : null } });
          }}
        >
          <option value="">Không mang đèn</option>
          {LIGHT_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label} ({p.bright}/{p.dim} ft)
            </option>
          ))}
          {cur === 'custom' && <option value="custom">Tuỳ chỉnh</option>}
        </select>
      </label>
      <label title="Darkvision (ft). Bỏ trống = tự lấy từ sheet (chủng tộc, năng lực, Devil's Sight)">
        👁 Darkvision
        <input
          type="number"
          min={0}
          step={30}
          placeholder={auto ? `tự: ${auto}` : 'không'}
          value={typeof token.darkvision === 'number' ? token.darkvision : ''}
          onChange={(e) => send({ t: 'updateToken', id: token.id, patch: { darkvision: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) } })}
        />
        ft
      </label>
    </div>
  );
}
