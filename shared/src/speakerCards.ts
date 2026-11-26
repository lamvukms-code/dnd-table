import type { CharacterSheet, Participant, RoomState } from './types.js';

/**
 * Speaker cards: the actual-play style strip along the bottom of the DM screen and the recording
 * window. One card per player (their character's token portrait, character name, the player's
 * name unless they chose to stay anonymous, a one-line "species · class · level") plus one for
 * the DM. Lit while that person is talking (see the client's mic voice detector).
 */
export interface SpeakerCard {
  participantId: string;
  role: 'dm' | 'player';
  color: string;
  connected: boolean;
  /** Real name, or null when the person asked to stay anonymous. */
  playerName: string | null;
  /** Big name on the card: the character for players, "DM" for the DM. */
  title: string;
  /** "Human · Fighter 3 / Wizard 2" — empty for the DM or a player without a sheet. */
  info: string;
  imageUrl?: string;
  sheetId?: string;
}

/** "Fighter (Champion) 5" or "Fighter 3 / Wizard 2" for multiclass sheets. */
export function classLine(sheet: Pick<CharacterSheet, 'className' | 'subclass' | 'level' | 'classes'>): string {
  const cls = sheet.classes?.filter((c) => c.name) ?? [];
  if (cls.length > 1) return cls.map((c) => `${c.name} ${c.level}`).join(' / ');
  const one = cls[0];
  const name = (one?.name ?? sheet.className ?? '').trim();
  const sub = (one?.subclass ?? sheet.subclass ?? '').trim();
  const lvl = one?.level ?? sheet.level;
  if (!name) return lvl ? `Cấp ${lvl}` : '';
  return `${name}${sub ? ` (${sub})` : ''} ${lvl}`;
}

/** The sheet a player is "playing" right now: one whose token is on the active map, else their first. */
function sheetOf(room: Pick<RoomState, 'sheets' | 'tokens'>, ownerId: string): CharacterSheet | undefined {
  const own = room.sheets.filter((s) => s.ownerId === ownerId);
  const onMap = new Set(room.tokens.map((t) => t.id));
  return own.find((s) => s.tokenId && onMap.has(s.tokenId)) ?? own[0];
}

export function speakerCards(room: Pick<RoomState, 'participants' | 'sheets' | 'tokens'>): SpeakerCard[] {
  const byName = (a: Participant, b: Participant) => a.name.localeCompare(b.name);
  const players = room.participants.filter((p) => p.role === 'player' && (p.connected || room.sheets.some((s) => s.ownerId === p.id)));
  const dms = room.participants.filter((p) => p.role === 'dm');
  const cards: SpeakerCard[] = [...players].sort(byName).map((p) => {
    const sheet = sheetOf(room, p.id);
    const token = sheet?.tokenId ? room.tokens.find((t) => t.id === sheet.tokenId) : undefined;
    const info = sheet ? [sheet.species?.trim(), classLine(sheet)].filter(Boolean).join(' · ') : '';
    return {
      participantId: p.id,
      role: 'player',
      color: p.color,
      connected: p.connected,
      playerName: p.anon ? null : p.name,
      title: sheet?.name?.trim() || (p.anon ? 'Người chơi' : p.name),
      info,
      imageUrl: token?.imageUrl,
      sheetId: sheet?.id,
    };
  });
  // the DM card closes the row (several DMs: only the connected ones, or the first)
  const shownDms = dms.filter((d) => d.connected);
  for (const d of shownDms.length ? shownDms : dms.slice(0, 1)) {
    cards.push({
      participantId: d.id,
      role: 'dm',
      color: d.color,
      connected: d.connected,
      playerName: d.anon ? null : d.name,
      title: 'DM',
      info: '',
    });
  }
  return cards;
}

/** "1:02:03" / "4:05" for an elapsed recording time in ms. */
export function formatElapsed(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/**
 * Speech detector with hysteresis, fed one loudness reading (dBFS) per audio frame: talking starts
 * after `attackFrames` loud frames in a row and stops only after `releaseMs` of quiet, so a voice
 * doesn't flicker between words. Returns the new state when it changes, else null.
 */
export function createVoiceGate(opts: { thresholdDb: number; attackFrames?: number; releaseMs?: number }) {
  let on = false;
  let loud = 0;
  let quietSince: number | null = null;
  const attack = opts.attackFrames ?? 2;
  const release = opts.releaseMs ?? 450;
  return {
    get on() {
      return on;
    },
    setThreshold(db: number) {
      opts.thresholdDb = db;
    },
    /** Back to "quiet" at once (the mic was switched off). */
    reset() {
      on = false;
      loud = 0;
      quietSince = null;
    },
    push(db: number, now: number): boolean | null {
      if (db >= opts.thresholdDb) {
        loud++;
        quietSince = null;
        if (!on && loud >= attack) {
          on = true;
          return true;
        }
      } else {
        loud = 0;
        if (on) {
          quietSince ??= now;
          if (now - quietSince >= release) {
            on = false;
            quietSince = null;
            return false;
          }
        }
      }
      return null;
    },
  };
}
