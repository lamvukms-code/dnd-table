import { fmtDuration, MADNESS_TIER_VI, type CharacterSheet, type MadnessTier } from '@dnd-table/shared';
import { useStore } from '../../store.js';

/** Madness effects on a sheet: tier, effect, time left; the DM can roll a new one or clear one. */
export function MadnessPanel({ sheet, commit }: { sheet: CharacterSheet; commit: (s: CharacterSheet) => void }) {
  const isDm = useStore((s) => s.isDm());
  const send = useStore((s) => s.send);
  const now = useStore((s) => s.room?.worldSeconds ?? 0);
  const list = sheet.madness ?? [];
  if (!list.length && !isDm) return null;
  return (
    <div className="madness-panel">
      <span className="mp-title">🌀 Madness</span>
      {list.length === 0 && <span className="hint">không có</span>}
      {list.map((m) => (
        <span key={m.id} className={`mp-entry ${m.tier}`} title={`${m.roll}${m.expiresAt !== undefined ? ` · còn ${fmtDuration(Math.max(0, m.expiresAt - now))}` : ''}`}>
          <strong>{MADNESS_TIER_VI[m.tier]}</strong> · {m.theme}: {m.text}
          {m.expiresAt !== undefined && <em> (còn {fmtDuration(Math.max(0, m.expiresAt - now))})</em>}
          <button className="link" title="Gỡ (đã chữa / hết)" onClick={() => commit({ ...sheet, madness: list.filter((x) => x.id !== m.id) })}>
            ✕
          </button>
        </span>
      ))}
      {isDm && (
        <span className="mp-add">
          {(['short', 'long', 'indefinite'] as MadnessTier[]).map((t) => (
            <button key={t} className="roll-btn sm" title={`Tung bảng madness ${MADNESS_TIER_VI[t]} cho nhân vật này (không save)`} onClick={() => send({ t: 'madnessRoll', sheetId: sheet.id, tier: t })}>
              + {MADNESS_TIER_VI[t]}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
