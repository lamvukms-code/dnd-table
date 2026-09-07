import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import { Room } from './room.js';
import {
  PROTOCOL_VERSION,
  type ClientEnvelope,
  type Participant,
  type ServerEvent,
} from '@dnd-table/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
const DATA_FILE = process.env.ROOM_FILE ?? join(__dirname, '..', 'data', 'room.json');
const PARTICIPANT_TTL = 1000 * 60 * 60 * 6; // prune stale participants after 6h

const room = new Room(DATA_FILE);
const app = express();

app.get('/health', (_req, res) => res.json({ ok: true, rev: room.state.rev }));

const clientDist = join(__dirname, '..', '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
}

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

const sockets = new Map<WebSocket, string>(); // socket -> participantId

function send(ws: WebSocket, event: ServerEvent): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
}

function broadcastState(): void {
  const event: ServerEvent = { t: 'state', state: room.state };
  const payload = JSON.stringify(event);
  for (const ws of sockets.keys()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
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
        participant = {
          id: nanoid(10),
          name: action.name || 'Người chơi',
          role: action.role,
          color: pickColor(room.state.participants.length),
          connected: true,
          lastSeen: Date.now(),
        };
        room.state.participants.push(participant);
      } else {
        participant.name = action.name || participant.name;
        participant.role = action.role;
        participant.connected = true;
        participant.lastSeen = Date.now();
      }
      room.state.rev++;
      sockets.set(ws, participant.id);
      send(ws, {
        t: 'welcome',
        participantId: participant.id,
        protocol: PROTOCOL_VERSION,
        state: room.state,
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
});

process.on('SIGINT', () => {
  room.save();
  process.exit(0);
});
