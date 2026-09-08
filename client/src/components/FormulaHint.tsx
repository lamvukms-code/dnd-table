import { describeNotation } from '@dnd-table/shared';

/** Live feedback for a dice formula a player is typing (e.g. "2d6+8"). */
export function FormulaHint({ notation }: { notation: string }) {
  const trimmed = (notation ?? '').trim();
  if (!trimmed) return null;
  const info = describeNotation(trimmed);
  if (!info.valid) {
    return <span className="formula-hint bad">⚠ {info.error}</span>;
  }
  const range =
    info.min === info.max ? `${info.min}` : `${info.min}–${info.max}`;
  return (
    <span className="formula-hint ok">
      {info.canonical} · {range} (tb {info.average})
    </span>
  );
}
