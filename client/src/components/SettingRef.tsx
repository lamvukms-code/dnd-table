import { useMemo, useState } from 'react';
import type { ReferenceCard, SettingReference } from '@dnd-table/shared';
import { MiniMarkdown } from './MiniMarkdown.js';

/** Lower-case, no Vietnamese accents: "Phép" matches "phep". */
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');

interface Row {
  section: string;
  group: string;
  card: ReferenceCard;
  hay: string;
}

/**
 * The setting reference tab (the DM's own notes, served by the server; see settingReference.ts):
 * search across every card, or browse one section group by group; a card opens in place.
 */
export function SettingRef({ data }: { data: SettingReference }) {
  const [q, setQ] = useState('');
  const [section, setSection] = useState(data.sections[0]?.title ?? '');
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo<Row[]>(
    () =>
      data.sections.flatMap((s) =>
        s.groups.flatMap((g) => g.cards.map((card) => ({ section: s.title, group: g.title, card, hay: fold(`${card.title} ${g.title} ${card.body}`) }))),
      ),
    [data],
  );

  const terms = fold(q).split(/\s+/).filter((t) => t.length > 1);
  const hits = useMemo(() => {
    if (!terms.length) return null;
    return rows
      .filter((r) => terms.every((t) => r.hay.includes(t)))
      .map((r) => ({ r, score: terms.reduce((n, t) => n + (fold(r.card.title).includes(t) ? 10 : 1), 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 60)
      .map((x) => x.r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q]);

  const card = (r: Row, showWhere: boolean) => {
    const id = `${r.section}/${r.group}/${r.card.title}`;
    const isOpen = open === id;
    return (
      <div key={id} className={`lore-hit ref-card ${isOpen ? 'open' : ''}`}>
        <button className="ref-card-head" onClick={() => setOpen(isOpen ? null : id)}>
          <b>{r.card.title}</b>
          {showWhere && <span className="hint"> {r.section} · {r.group}</span>}
        </button>
        {isOpen && <MiniMarkdown text={r.card.body} />}
      </div>
    );
  };

  const current = data.sections.find((s) => s.title === section) ?? data.sections[0];
  return (
    <div className="lore">
      <div className="lore-bar">
        <input value={q} placeholder={`Tìm trong ${data.title}… (gõ không dấu cũng được)`} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!hits && (
        <div className="lore-chips">
          {data.sections.map((s) => (
            <button key={s.title} className={current?.title === s.title ? 'on' : ''} onClick={() => setSection(s.title)}>
              {s.title}
            </button>
          ))}
        </div>
      )}
      <div className="lore-list">
        {hits ? (
          <>
            {hits.map((r) => card(r, true))}
            {!hits.length && <p className="hint">Không thấy mục nào.</p>}
          </>
        ) : (
          current?.groups.map((g) => (
            <div key={g.title} className="ref-group">
              <h4>{g.title}</h4>
              {rows.filter((r) => r.section === current.title && r.group === g.title).map((r) => card(r, false))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
