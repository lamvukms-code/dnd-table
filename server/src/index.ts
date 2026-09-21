import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import { Room } from './room.js';
import {
  PROTOCOL_VERSION,
  type ClientEnvelope,
  type Participant,
  type RoomState,
  type ServerEvent,
} from '@dnd-table/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
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
const PARTICIPANT_TTL = 1000 * 60 * 60 * 6; // prune stale participants after 6h

const room = new Room(DATA_FILE, BESTIARY_FILE);
const app = express();
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
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
}

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 2 * 1024 * 1024 });

const sockets = new Map<WebSocket, string>(); // socket -> participantId

function send(ws: WebSocket, event: ServerEvent): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
}

/** The bestiary is DM-only and can be huge (hundreds of stat blocks) — players never get it. */
function stateFor(isDm: boolean): RoomState {
  return isDm ? room.state : { ...room.state, bestiary: [] };
}

function broadcastState(): void {
  const dmPayload = JSON.stringify({ t: 'state', state: stateFor(true) } satisfies ServerEvent);
  let playerPayload: string | null = null;
  for (const [ws, pid] of sockets) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (getParticipant(pid)?.role === 'dm') ws.send(dmPayload);
    else ws.send((playerPayload ??= JSON.stringify({ t: 'state', state: stateFor(false) } satisfies ServerEvent)));
  }
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

    if (action.t === 'join') {
      let participant = action.participantId ? getParticipant(action.participantId) : undefined;
      if (!participant) {
        // The server decides the role: the first person into a room without a DM
        // becomes the DM; everyone else joins as a player. The client's `role`
        // hint is ignored so a player cannot self-promote.
        const hasDm = room.state.participants.some((p) => p.role === 'dm');
        participant = {
          id: nanoid(10),
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
      }
      // A room must always have at least one DM (covers older rooms / all DMs pruned).
      if (!room.state.participants.some((p) => p.role === 'dm')) {
        participant.role = 'dm';
      }
      room.state.rev++;
      sockets.set(ws, participant.id);
      send(ws, {
        t: 'welcome',
        participantId: participant.id,
        protocol: PROTOCOL_VERSION,
        state: stateFor(participant.role === 'dm'),
      });
      broadcastState();
      scheduleSave();
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

httpServer.listen(PORT, HOST, () => {
  console.log(`dnd-table server on http://${HOST}:${PORT}  (ws: /ws)`);
  console.log(`room file: ${DATA_FILE}`);
  console.log(`bestiary file: ${BESTIARY_FILE} (${room.state.bestiary.length} statblocks)`);
});

process.on('SIGINT', () => {
  room.save();
  process.exit(0);
});
