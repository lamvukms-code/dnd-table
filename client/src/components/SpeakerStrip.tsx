import { memo, useMemo } from 'react';
import { speakerCards, type SpeakerCard } from '@dnd-table/shared';
import { useStore } from '../store.js';

/**
 * Actual-play style speaker cards along the bottom of the DM screen / the recording window: the
 * character's token as a round portrait, character name, player name (unless they chose to stay
 * anonymous) and "species · class · level". Dimmed while quiet, lit while that person talks.
 */
function SpeakerStripImpl({ variant, onCard }: { variant: 'dock' | 'stream'; onCard?: (c: SpeakerCard) => void }) {
  const participants = useStore((s) => s.room?.participants);
  const sheets = useStore((s) => s.room?.sheets);
  const tokens = useStore((s) => s.room?.tokens);
  const speaking = useStore((s) => s.speaking);
  const cards = useMemo(
    () => (participants && sheets && tokens ? speakerCards({ participants, sheets, tokens }) : []),
    [participants, sheets, tokens],
  );
  if (!cards.length) return null;
  const talking = new Set(speaking);
  return (
    <div className={`speaker-strip speaker-${variant}`}>
      {cards.map((c) => {
        const on = talking.has(c.participantId);
        return (
          <div
            key={c.participantId}
            className={`speaker-card ${on ? 'talking' : ''} ${c.connected ? '' : 'away'} ${c.role === 'dm' ? 'dm' : ''}`}
            style={{ ['--speaker' as string]: c.color }}
            onClick={onCard ? () => onCard(c) : undefined}
            title={onCard && c.sheetId ? 'Mở sheet' : undefined}
          >
            <span className="speaker-ava">
              {c.imageUrl ? <img src={c.imageUrl} alt="" draggable={false} /> : <span>{c.role === 'dm' ? 'DM' : c.title.trim().slice(0, 1).toUpperCase()}</span>}
            </span>
            <span className="speaker-text">
              <span className="speaker-title">{c.title}</span>
              {c.playerName && c.playerName !== c.title && <span className="speaker-player">{c.playerName}</span>}
              {c.info && <span className="speaker-info">{c.info}</span>}
              {!c.connected && <span className="speaker-info">vắng</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const SpeakerStrip = memo(SpeakerStripImpl);
