import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import express from 'express';
import compression from 'compression';
import { WebSocketServer, WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import { Room } from './room.js';
import { Recordings } from './recordings.js';
import {
  PROTOCOL_VERSION,
  type ClientEnvelope,
  type HomebrewEntry,
  type Participant,
  type RoomState,
  type Token,
  formatElapsed,
  rollLogForPlayers,
  sheetForStreamCard,
  sheetsForPlayer,
  statsHiddenFromPlayers,
  tokenForPlayers,
  type ServerEvent,
  type CustomClassDef,
  registerCustomClass,
  registerFeatureDefs,
  registerFeatDefs,
  registerMonsterMechanics,
  type MonsterMechanic,
  type LocalFeatDef,
  type SubclassFeatureDef,
} from '@dnd-table/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Machine-local settings (e.g. RECORDINGS_DIR) in the git-ignored server/.env.
try {
  process.loadEnvFile(join(__dirname, '..', '.env'));
} catch {
  /* no .env */
}
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
const DATA_FILE = process.env.ROOM_FILE ?? join(__dirname, '..', 'data', 'room.json');
// Point BESTIARY_FILE at a OneDrive folder to sync your monster library.
const BESTIARY_FILE =
  process.env.BESTIARY_FILE ?? join(__dirname, '..', 'data', 'bestiary.json');
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? join(__dirname, '..', 'data', 'uploads');
// Local, git-ignored book text (scripts/extract-pdf.mjs). Served to the DM only.
const LOREBOOK_FILE =
  process.env.LOREBOOK_FILE ??
  join(__dirname, '..', '..', 'client', 'src', 'data', 'lorebook.local.json');
// Imported map pack (scripts/import-maps.mjs): images + index.json, read-only, never bundled.
const MAPS_DIR = process.env.MAPS_DIR ?? join(__dirname, '..', 'data', 'maps');
// Local, git-ignored third-party classes (same file the client bundles). The server needs them for
// Hit Dice / level-up / Extra Attack, so register them before the Room starts handling messages.
const CLASSES_FILE =
  process.env.CLASSES_FILE ??
  join(__dirname, '..', '..', 'client', 'src', 'data', 'classes.local.json');
if (existsSync(CLASSES_FILE)) {
  try {
    const file = JSON.parse(readFileSync(CLASSES_FILE, 'utf8')) as { classes?: CustomClassDef[] };
    for (const c of Array.isArray(file.classes) ? file.classes : []) registerCustomClass(c);
  } catch (e) {
    console.warn(`Không đọc được ${CLASSES_FILE}:`, (e as Error).message);
  }
}
// Same for subclass features: their passive mechanics (AC formulas, resistances, damage riders,
// speed) feed the AC / defences / speed the server computes for attacks and movement.
const SUBCLASSES_FILE =
  process.env.SUBCLASSES_FILE ??
  join(__dirname, '..', '..', 'client', 'src', 'data', 'subclasses.local.json');
if (existsSync(SUBCLASSES_FILE)) {
  try {
    const defs = JSON.parse(readFileSync(SUBCLASSES_FILE, 'utf8')) as unknown;
    if (Array.isArray(defs)) registerFeatureDefs(defs as SubclassFeatureDef[]);
  } catch (e) {
    console.warn(`Không đọc được ${SUBCLASSES_FILE}:`, (e as Error).message);
  }
}
// Local feats with mechanics (passives such as AC / resistances must agree with the client).
const FEATS_FILE = process.env.FEATS_FILE ?? join(__dirname, '..', '..', 'client', 'src', 'data', 'feats.local.json');
if (existsSync(FEATS_FILE)) {
  try {
    const defs = JSON.parse(readFileSync(FEATS_FILE, 'utf8')) as unknown;
    if (Array.isArray(defs)) registerFeatDefs(defs as LocalFeatDef[]);
  } catch (e) {
    console.warn(`Không đọc được ${FEATS_FILE}:`, (e as Error).message);
  }
}
// Local monster mechanics per stat block name (setting content: git-ignored).
const MECH_FILE = process.env.MONSTER_MECH_FILE ?? join(__dirname, '..', '..', 'client', 'src', 'data', 'monsterMechanics.local.json');
if (existsSync(MECH_FILE)) {
  try {
    registerMonsterMechanics(JSON.parse(readFileSync(MECH_FILE, 'utf8')) as Record<string, MonsterMechanic[]>);
  } catch (e) {
    console.warn(`Không đọc được ${MECH_FILE}:`, (e as Error).message);
  }
}
const PARTICIPANT_TTL = 1000 * 60 * 60 * 6; // prune stale participants after 6h

const room = new Room(DATA_FILE, BESTIARY_FILE);
const app = express();
// gzip/deflate for JS/CSS/JSON (images are already compressed and skipped by the default filter).
app.use(compression());
app.use(express.json({ limit: '12mb' }));

mkdirSync(UPLOADS_DIR, { recursive: true });
app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    maxAge: '1y',
    immutable: true,
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }),
);

const IMG_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

if (existsSync(MAPS_DIR)) {
  app.use(
    '/maps',
    express.static(MAPS_DIR, {
      maxAge: '7d',
      setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
    }),
  );
}

/** Player/DM image upload (token portraits, map backgrounds). Kept on the server. */
app.post('/upload', (req, res) => {
  const dataUrl = (req.body as { dataUrl?: string })?.dataUrl;
  const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(dataUrl ?? '');
  if (!m) return res.status(400).json({ error: 'Expected { dataUrl: "data:<mime>;base64,…" }' });
  const ext = IMG_EXT[m[1].toLowerCase()];
  if (!ext) return res.status(415).json({ error: 'Chỉ nhận PNG / JPEG / WebP / GIF' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 6 * 1024 * 1024) return res.status(413).json({ error: 'Ảnh quá lớn (tối đa 6MB)' });
  const name = `${nanoid(12)}.${ext}`;
  try {
    writeFileSync(join(UPLOADS_DIR, name), buf);
  } catch (err) {
    console.error('upload write failed:', err);
    return res.status(500).json({ error: 'Không lưu được ảnh' });
  }
  res.json({ url: `/uploads/${name}` });
});

// --- Session recording (the DM's recording window uploads its video here; see recordings.ts) ---
const RECORDINGS_DIR = process.env.RECORDINGS_DIR ?? join(__dirname, '..', 'data', 'recordings');
const recordings = new Recordings(process.env.RECORDINGS_TMP ?? join(__dirname, '..', 'data', 'recordings-tmp'), RECORDINGS_DIR);

/** The request comes from a DM holding that DM's secret (participant ids are public, secrets aren't). */
function dmFromRequest(req: express.Request): Participant | undefined {
  const who = getParticipant(req.header('x-participant-id') ?? '');
  const secret = req.header('x-participant-secret');
  return who && who.role === 'dm' && who.secret && secret === who.secret ? who : undefined;
}

function setRecordingState(since: number | null): void {
  room.state.recording = since == null ? null : { since };
  room.state.rev++;
  broadcastState();
  scheduleSave();
}

function stopRecording(reason: string): { folder: string } | null {
  const done = recordings.stop();
  if (!done) return null;
  room.announce(`⏹ Đã dừng ghi hình (${formatElapsed(done.ms)})${reason}`);
  setRecordingState(null);
  console.log(`recording saved: ${done.folder} (${(done.bytes / 1e6).toFixed(1)} MB)`);
  return done;
}

app.post('/recordings/start', (req, res) => {
  if (!dmFromRequest(req)) return res.status(403).json({ error: 'Chỉ DM được ghi hình' });
  const ext = String((req.body as { ext?: string })?.ext ?? '');
  const rec = recordings.start(ext);
  if (typeof rec === 'string') return res.status(409).json({ error: rec });
  room.announce('🔴 DM bắt đầu ghi hình buổi chơi');
  setRecordingState(rec.since);
  res.json({ id: rec.id, since: rec.since, dir: RECORDINGS_DIR });
});

app.post('/recordings/:id/chunk', express.raw({ type: 'application/octet-stream', limit: '64mb' }), (req, res) => {
  if (!dmFromRequest(req)) return res.status(403).json({ error: 'Chỉ DM được ghi hình' });
  const seq = Number(req.query.seq);
  if (!Number.isInteger(seq) || seq < 0 || !Buffer.isBuffer(req.body)) return res.status(400).json({ error: 'Đoạn video không hợp lệ' });
  try {
    const err = recordings.append(req.params.id, seq, req.body);
    if (err) return res.status(409).json({ error: err });
  } catch (err) {
    console.error('recording write failed:', err);
    return res.status(500).json({ error: 'Không ghi được file (ổ đầy?)' });
  }
  res.json({ ok: true });
});

app.post('/recordings/:id/stop', (req, res) => {
  if (!dmFromRequest(req)) return res.status(403).json({ error: 'Chỉ DM được ghi hình' });
  if (recordings.active?.id !== req.params.id) return res.status(404).json({ error: 'Không có bản ghi này' });
  const done = stopRecording('');
  res.json({ folder: done?.folder });
});

// A recording window that died (closed, crashed, lost the network) stops sending chunks: close it off.
setInterval(() => {
  const rec = recordings.active;
  if (rec && Date.now() - rec.lastChunk > 90_000) stopRecording(' — khung quay mất kết nối');
}, 15_000).unref();

/** DM-only lore book (spoiler guard, not security — the app has no auth). */
app.get('/lorebook', (req, res) => {
  const pid = req.header('x-participant-id');
  const who = pid ? getParticipant(pid) : undefined;
  if (!who || who.role !== 'dm') return res.status(403).json({ error: 'Chỉ DM xem được Lore Book' });
  if (!existsSync(LOREBOOK_FILE)) {
    return res.status(404).json({ error: 'Chưa có lorebook.local.json (chạy scripts/extract-pdf.mjs)' });
  }
  res.setHeader('Cache-Control', 'no-store');
  res.type('json').sendFile(LOREBOOK_FILE);
});

app.get('/health', (_req, res) => res.json({ ok: true, rev: room.state.rev }));

const clientDist = process.env.CLIENT_DIST ?? join(__dirname, '..', '..', 'client', 'dist');
if (existsSync(clientDist)) {
  // Vite emits content-hashed files under /assets — safe to cache forever; index.html must always revalidate.
  app.use(
    express.static(clientDist, {
      setHeaders: (res, filePath) => {
        if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(clientDist, 'index.html'));
  });
}

const httpServer = createServer(app);
const wss = new WebSocketServer({
  server: httpServer,
  path: '/ws',
  maxPayload: 2 * 1024 * 1024,
  // State pushes are repetitive JSON (tokens, sheets, log) — deflate shrinks them ~6-10x, which matters
  // most over a WAN/Tailscale link. Small frames skip it; no context takeover keeps per-socket memory flat.
  perMessageDeflate: {
    threshold: 1024,
    zlibDeflateOptions: { level: 3 },
    serverNoContextTakeover: true,
    clientNoContextTakeover: true,
    concurrencyLimit: 4,
  },
});

const sockets = new Map<WebSocket, string>(); // socket -> participantId
/** The DM's recording / stream windows: player view, read-only, not a "connection" of the DM. */
const streamSockets = new Set<WebSocket>();
/** Who is talking (voice activity from each person's own mic). Ephemeral: never saved. */
const speaking = new Set<string>();
function broadcastSpeaking(): void {
  const msg = JSON.stringify({ t: 'speaking', ids: [...speaking] } satisfies ServerEvent);
  for (const ws of sockets.keys()) if (ws.readyState === WebSocket.OPEN) ws.send(msg);
}

function send(ws: WebSocket, event: ServerEvent): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
}

/**
 * What a client gets in each `state` push. The bestiary and map zones are DM-only — players never
 * get them (zones often hold spoilers: traps, secrets, DCs). The two big, slow-changing collections
 * (bestiary, homebrew) are left EMPTY here and shipped separately by `staticEventFor` — only when
 * they change — so a token drag no longer drags ~1MB of monster library across the wire 20x/second.
 */
function stateFor(isDm: boolean, participantId?: string): RoomState {
  if (isDm) return { ...room.state, bestiary: [], homebrew: [], participants: publicParticipants() };
  return playerStateFor(participantId ?? '', playerView());
}

/** The shared player view plus the one thing that differs per player: sheets. A player gets their
 *  own character sheet(s) in full and only blank stubs for everyone else's. */
/** Participants as clients see them — everything except the server-only `secret`. */
function publicParticipants(): Participant[] {
  return room.state.participants.map(({ secret: _secret, ...p }) => (void _secret, p));
}

function playerStateFor(participantId: string, base: RoomState): RoomState {
  return { ...base, sheets: sheetsForPlayer(room.state.sheets, participantId) };
}

/**
 * Everything a PLAYER may see. Beyond the DM-only collections it also hides what would otherwise
 * spoil the game: DM-hidden tokens are removed, NPC/monster tokens lose AC / HP / defenses / statblock
 * (they get a coarse `healthTier` instead — see `tokenForPlayers`), attack log entries against such
 * targets lose `targetAc`, and the per-scene copies of tokens and map zones (`scenes[]` also carries
 * every scene's tokens and the DM's room notes) get the same treatment — redacting only the top-level
 * `tokens` / `zones` would leave all of it readable in the network traffic.
 */
function playerView(): RoomState {
  const st = room.state;
  const cache = new Map<Token, Token | null>();
  const conv = (t: Token): Token | null => {
    if (!cache.has(t)) cache.set(t, tokenForPlayers(t));
    return cache.get(t) ?? null;
  };
  const redact = (ts: Token[]): Token[] => ts.map(conv).filter((t): t is Token => t !== null);
  const visibleIds = new Set<string>();
  for (const sc of st.scenes ?? []) {
    for (const t of sc.tokens) if (!statsHiddenFromPlayers(t)) visibleIds.add(t.id);
  }
  return {
    ...st,
    bestiary: [],
    zones: [],
    homebrew: [],
    participants: publicParticipants(),
    dmPrompt: null,
    tokens: redact(st.tokens),
    scenes: (st.scenes ?? []).map((sc) => ({ ...sc, zones: [], tokens: redact(sc.tokens) })),
    rollLog: rollLogForPlayers(st.rollLog, visibleIds),
    shops: (st.shops ?? []).filter((sh) => sh.open).map((sh) => ({ ...sh, dmNote: undefined })),
  };
}

// Homebrew as a player may see it (no `secret` entries, no DM `notes`), rebuilt only when the
// source array is replaced (homebrewUpsert/Remove always assign a new array — see room.ts).
let playerHomebrewSrc: HomebrewEntry[] | undefined;
let playerHomebrewCache: HomebrewEntry[] = [];
function playerHomebrew(): HomebrewEntry[] {
  if (room.state.homebrew !== playerHomebrewSrc) {
    playerHomebrewSrc = room.state.homebrew;
    playerHomebrewCache = room.state.homebrew.filter((h) => !h.secret).map((h) => ({ ...h, notes: undefined }));
  }
  return playerHomebrewCache;
}

// Per-socket record of which bestiary/homebrew arrays (by identity) that client already holds.
interface StaticSent {
  bestiary: unknown;
  homebrew: unknown;
  dm: boolean;
}
const staticSent = new WeakMap<WebSocket, StaticSent>();
const EMPTY_BESTIARY: unknown[] = [];

/** The `static` event this socket still needs (or null if it is up to date). Role changes count:
 *  a promoted player needs the bestiary + unfiltered homebrew, a demoted DM must drop them. */
function staticEventFor(ws: WebSocket, isDm: boolean): string | null {
  const sent = staticSent.get(ws);
  const wantBestiary: unknown = isDm ? room.state.bestiary : EMPTY_BESTIARY;
  const wantHomebrew: unknown = isDm ? room.state.homebrew : playerHomebrew();
  const needBestiary = !sent || sent.bestiary !== wantBestiary;
  const needHomebrew = !sent || sent.homebrew !== wantHomebrew || sent.dm !== isDm;
  if (!needBestiary && !needHomebrew) return null;
  staticSent.set(ws, { bestiary: wantBestiary, homebrew: wantHomebrew, dm: isDm });
  // Skip the (large) bestiary entirely for players who never had one.
  const bestiaryField = needBestiary && (isDm || sent) ? `"bestiary":${isDm ? bestiaryJson() : '[]'}` : '';
  const homebrewField = needHomebrew ? `"homebrew":${JSON.stringify(wantHomebrew)}` : '';
  return `{"t":"static"${bestiaryField ? ',' + bestiaryField : ''}${homebrewField ? ',' + homebrewField : ''}}`;
}

// JSON of the bestiary, rebuilt only when the array is replaced (bestiaryUpsert/Remove/ReplaceAll).
let bestiaryJsonCache = '';
let bestiaryRefCache: unknown = undefined;
function bestiaryJson(): string {
  if (room.state.bestiary !== bestiaryRefCache) {
    bestiaryRefCache = room.state.bestiary;
    bestiaryJsonCache = JSON.stringify(room.state.bestiary);
  }
  return bestiaryJsonCache;
}

/** What the stream window shows: the player view, with just enough of each sheet for the speaker cards. */
function streamState(base: RoomState = playerView()): RoomState {
  return { ...base, sheets: room.state.sheets.map(sheetForStreamCard) };
}

function sendStateNow(): void {
  recordings.captureLog(room.state.rollLog);
  const dmPayload = JSON.stringify({ t: 'state', state: stateFor(true) } satisfies ServerEvent);
  // Tokens / scenes / log are redacted once per broadcast; only `sheets` differs per player.
  let playerBase: RoomState | null = null;
  let streamPayload: string | null = null;
  const playerPayloads = new Map<string, string>();
  for (const [ws, pid] of sockets) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (streamSockets.has(ws)) {
      const extra = staticEventFor(ws, false);
      if (extra) ws.send(extra);
      playerBase ??= playerView();
      streamPayload ??= JSON.stringify({ t: 'state', state: streamState(playerBase) } satisfies ServerEvent);
      ws.send(streamPayload);
      continue;
    }
    const isDm = getParticipant(pid)?.role === 'dm';
    const extra = staticEventFor(ws, isDm);
    if (extra) ws.send(extra);
    if (isDm) {
      ws.send(dmPayload);
      continue;
    }
    let payload = playerPayloads.get(pid);
    if (!payload) {
      playerBase ??= playerView();
      payload = JSON.stringify({ t: 'state', state: playerStateFor(pid, playerBase) } satisfies ServerEvent);
      playerPayloads.set(pid, payload);
    }
    ws.send(payload);
  }
}

let broadcastTimer: NodeJS.Timeout | null = null;
let broadcastQueued = false;
// Matches the client's own ~20/s drag-send throttle (see BattleMap.tsx `lastDragSendRef`).
const BROADCAST_THROTTLE_MS = 50;

/**
 * Coalesces rapid-fire state pushes (a throttled token drag, or several players/rolls landing
 * in the same tick) into at most one broadcast per BROADCAST_THROTTLE_MS. Without this, every
 * single action re-serialized and resent the FULL room state — including the DM's whole
 * bestiary (megabyte-scale once the library grows) — so a drag alone could re-stringify+resend
 * that payload ~20x/second, blocking Node's single event loop and making both dragging and dice
 * rolling feel laggy for everyone connected, not just whoever triggered the action.
 */
function broadcastState(): void {
  if (broadcastTimer) {
    broadcastQueued = true;
    return;
  }
  sendStateNow();
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    if (broadcastQueued) {
      broadcastQueued = false;
      broadcastState();
    }
  }, BROADCAST_THROTTLE_MS);
}

let saveTimer: NodeJS.Timeout | null = null;
function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    room.save();
  }, 1000);
}

function getParticipant(id: string): Participant | undefined {
  return room.state.participants.find((p) => p.id === id);
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let envelope: ClientEnvelope;
    try {
      envelope = JSON.parse(raw.toString());
    } catch {
      send(ws, { t: 'error', message: 'Bad JSON' });
      return;
    }
    const action = envelope.action;
    // a well-formed JSON message without an action must not take the whole server down
    if (!action || typeof action.t !== 'string') {
      send(ws, { t: 'error', message: 'Bad message' });
      return;
    }

    if (action.t === 'join' && action.stream) {
      // The DM's recording window: same identity (proved by the secret), player view, no actions.
      const dm = action.participantId ? getParticipant(action.participantId) : undefined;
      if (!dm || dm.role !== 'dm' || !dm.secret || dm.secret !== action.secret) {
        send(ws, { t: 'error', message: 'Khung quay chỉ mở được từ máy DM' });
        return;
      }
      sockets.set(ws, dm.id);
      streamSockets.add(ws);
      staticSent.delete(ws);
      const joinStatic = staticEventFor(ws, false);
      if (joinStatic) ws.send(joinStatic);
      send(ws, { t: 'welcome', participantId: dm.id, protocol: PROTOCOL_VERSION, state: streamState() });
      send(ws, { t: 'speaking', ids: [...speaking] });
      return;
    }

    if (action.t === 'join') {
      const claimedId = action.participantId;
      let participant = claimedId ? getParticipant(claimedId) : undefined;
      // Once a participant holds a secret, only the client that holds it may resume that identity.
      if (participant?.secret && participant.secret !== action.secret) participant = undefined;
      if (!participant) {
        // The server decides the role: the first person into a room without a DM
        // becomes the DM; everyone else joins as a player. The client's `role`
        // hint is ignored so a player cannot self-promote.
        const hasDm = room.state.participants.some((p) => p.role === 'dm');
        participant = {
          // Re-use the id the browser already had (e.g. after the participant list was pruned or the
          // server restarted) so it keeps owning its character sheets; only a free, well-formed id.
          id: claimedId && /^[\w-]{6,32}$/.test(claimedId) && !getParticipant(claimedId) ? claimedId : nanoid(10),
          secret: nanoid(16),
          name: action.name || 'Người chơi',
          role: hasDm ? 'player' : 'dm',
          color: pickColor(room.state.participants.length),
          connected: true,
          lastSeen: Date.now(),
        };
        room.state.participants.push(participant);
      } else {
        // Reconnect: keep the role the server previously assigned.
        participant.name = action.name || participant.name;
        participant.connected = true;
        participant.lastSeen = Date.now();
        participant.secret ??= nanoid(16);
      }
      // A room must always have at least one DM (covers older rooms / all DMs pruned).
      if (!room.state.participants.some((p) => p.role === 'dm')) {
        participant.role = 'dm';
      }
      room.state.rev++;
      sockets.set(ws, participant.id);
      staticSent.delete(ws); // a (re)join always starts from "client holds nothing"
      const joinStatic = staticEventFor(ws, participant.role === 'dm');
      if (joinStatic) ws.send(joinStatic);
      send(ws, {
        t: 'welcome',
        participantId: participant.id,
        secret: participant.secret,
        protocol: PROTOCOL_VERSION,
        state: stateFor(participant.role === 'dm', participant.id),
      });
      broadcastState();
      scheduleSave();
      send(ws, { t: 'speaking', ids: [...speaking] });
      return;
    }

    if (streamSockets.has(ws)) {
      send(ws, { t: 'error', message: 'Khung quay chỉ để xem' });
      return;
    }
    const participantId = sockets.get(ws);
    const actor = participantId ? getParticipant(participantId) : undefined;
    if (!actor) {
      send(ws, { t: 'error', message: 'Chưa join phòng' });
      return;
    }
    actor.lastSeen = Date.now();

    if (action.t === 'setName') {
      actor.name = action.name || actor.name;
      room.state.rev++;
      broadcastState();
      scheduleSave();
      return;
    }

    if (action.t === 'speaking') {
      const was = speaking.has(actor.id);
      if (!!action.on === was) return;
      if (action.on) speaking.add(actor.id);
      else speaking.delete(actor.id);
      broadcastSpeaking();
      return;
    }

    if (action.t === 'setAnon') {
      actor.anon = action.anon ? true : undefined;
      room.state.rev++;
      broadcastState();
      scheduleSave();
      return;
    }

    // Drag preview: relayed as a few bytes to everyone else, no state change, no full broadcast.
    if (action.t === 'dragPreview') {
      const p = room.previewMove(actor, action.id, action.x, action.y);
      if (!p) return;
      const msg = JSON.stringify({ t: 'dragPreview', id: p.token.id, x: p.x, y: p.y } satisfies ServerEvent);
      for (const [other, pid] of sockets) {
        if (other === ws || other.readyState !== WebSocket.OPEN) continue;
        if (p.token.hidden && (streamSockets.has(other) || getParticipant(pid)?.role !== 'dm')) continue;
        // a far-away / slow socket still flushing earlier data skips this frame instead of queueing it
        if (other.bufferedAmount > 64 * 1024) continue;
        other.send(msg);
      }
      return;
    }

    const err = room.apply(actor, action);
    if (err) {
      send(ws, { t: 'error', message: err });
      return;
    }
    broadcastState();
    scheduleSave();
  });

  ws.on('close', () => {
    const id = sockets.get(ws);
    sockets.delete(ws);
    if (streamSockets.delete(ws)) return; // the DM's own connection is unaffected
    if (id && speaking.delete(id)) broadcastSpeaking();
    if (id) {
      const p = getParticipant(id);
      if (p) {
        p.connected = false;
        p.lastSeen = Date.now();
        room.state.rev++;
        broadcastState();
        scheduleSave();
      }
    }
  });
});

// Periodic prune of long-gone participants.
setInterval(() => {
  const now = Date.now();
  const before = room.state.participants.length;
  room.state.participants = room.state.participants.filter(
    (p) => p.connected || now - p.lastSeen < PARTICIPANT_TTL,
  );
  if (room.state.participants.length !== before) {
    room.state.rev++;
    broadcastState();
    scheduleSave();
  }
}, 1000 * 60 * 10).unref();

function pickColor(i: number): string {
  const palette = [
    '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12',
    '#1abc9c', '#e67e22', '#34495e', '#fd79a8', '#00b894',
  ];
  return palette[i % palette.length];
}

// A recording cut off by a crash / restart: finalise the leftover file, clear the REC badge.
for (const folder of recordings.recoverLeftovers()) console.log(`recovered unfinished recording: ${folder}`);
if (room.state.recording) room.state.recording = null;

httpServer.listen(PORT, HOST, () => {
  console.log(`dnd-table server on http://${HOST}:${PORT}  (ws: /ws)`);
  console.log(`room file: ${DATA_FILE}`);
  console.log(`bestiary file: ${BESTIARY_FILE} (${room.state.bestiary.length} statblocks)`);
  console.log(`recordings dir: ${RECORDINGS_DIR}`);
});

process.on('SIGINT', () => {
  room.save();
  process.exit(0);
});
