import { useMemo, useState } from 'react';
import { SRD_SPELLS } from '@dnd-table/shared';
import { SRD_ATTRIBUTION, SRD_CATEGORIES, SRD_ENTRIES, type SrdEntry } from '../data/srd.js';

const SPELL_CAT = 'Phép (SRD)';
const cats = [...SRD_CATEGORIES, SPELL_CAT];

const spellEntries: SrdEntry[] = SRD_SPELLS.map((s) => {
  const dmg = s.damageDie ?? s.fixedDamage ?? s.heal;
  const bits = [
    s.level ? `Cấp ${s.level}` : 'Cantrip',
    s.school,
    s.range && `tầm ${s.range}`,
    s.area && `vùng ${s.area}`,
    dmg && `${dmg}${s.damageType ? ` ${s.damageType}` : ''}`,
    s.save && `Save ${s.save.toUpperCase()}`,
    s.concentration && 'Concentration',
  ].filter(Boolean);
  return { cat: SPELL_CAT, name: s.name, text: `${bits.join(' · ')}. ${s.guidance}` };
});

export function SrdRef() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('');

  const shown = useMemo(() => {
    const all = [...SRD_ENTRIES, ...spellEntries];
    const term = q.trim().toLowerCase();
    return all
      .filter((e) => (!cat || e.cat === cat) && (!term || `${e.name} ${e.text}`.toLowerCase().includes(term)))
      .slice(0, 80);
  }, [q, cat]);

  return (
    <div className="lore">
      <div className="lore-bar">
        <input value={q} placeholder="Tìm: grappled, cover, fireball…" onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="lore-chips">
        <button className={!cat ? 'on' : ''} onClick={() => setCat('')}>
          Tất cả
        </button>
        {cats.map((c) => (
          <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(cat === c ? '' : c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="lore-list">
        {shown.map((e) => (
          <div key={e.cat + e.name} className="lore-hit static">
            <b>{e.name}</b> <span className="hint">{e.cat}</span>
            <div>{e.text}</div>
          </div>
        ))}
        {!shown.length && <p className="hint">Không thấy mục nào.</p>}
        <p className="hint srd-attr">{SRD_ATTRIBUTION}</p>
      </div>
    </div>
  );
}
