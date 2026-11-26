import type { ReactNode } from 'react';

/**
 * The small Markdown subset of the reference notes, rendered as React elements (never raw HTML):
 * paragraphs, `- ` bullets with one nested level, tables, **bold** and *italic*.
 */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <b key={i}>{part.slice(2, -2)}</b>;
    if (/^\*[^*]+\*$/.test(part)) return <i key={i}>{part.slice(1, -1)}</i>;
    return part;
  });
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

export function MiniMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trimStart().startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('|')) rows.push(lines[i++]);
      const body = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
      const [head, ...rest] = body;
      out.push(
        <div className="md-table" key={key++}>
          <table>
            {head && (
              <thead>
                <tr>
                  {cells(head).map((c, j) => (
                    <th key={j}>{inline(c)}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {rest.map((r, ri) => (
                <tr key={ri}>
                  {cells(r).map((c, j) => (
                    <td key={j}>{inline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: { text: string; sub: string[] }[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const l = lines[i++];
        const t = l.replace(/^\s*[-*]\s+/, '');
        if (l.length - l.trimStart().length >= 2 && items.length) items[items.length - 1].sub.push(t);
        else items.push({ text: t, sub: [] });
      }
      out.push(
        <ul key={key++}>
          {items.map((it, j) => (
            <li key={j}>
              {inline(it.text)}
              {it.sub.length > 0 && (
                <ul>
                  {it.sub.map((s, k) => (
                    <li key={k}>{inline(s)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*[-*]\s+/.test(lines[i]) && !lines[i].trimStart().startsWith('|')) para.push(lines[i++].trim());
    out.push(<p key={key++}>{inline(para.join(' '))}</p>);
  }
  return <div className="md">{out}</div>;
}
