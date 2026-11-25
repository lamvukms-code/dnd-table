import { useState } from 'react';
import {
  findFeatDraft,
  SRD_FEATS_DRAFT,
  warlockLevel,
  WARLOCK_INVOCATIONS_DRAFT,
  type CharacterSheet,
  type Feature,
  type FeatDef,
} from '@dnd-table/shared';
import { nanoIdish } from '../../util.js';
import { EntryCard } from './EntryCard.js';
import { SearchPicker, type PickItem } from './SearchPicker.js';

interface Ctx {
  draft: CharacterSheet;
  commit: (s: CharacterSheet) => void;
}

const FEAT_CAT: Record<FeatDef['category'], { label: string; mark: string }> = {
  origin: { label: 'Origin', mark: '◆' },
  general: { label: 'General', mark: '•' },
  'fighting-style': { label: 'Fighting Style', mark: '⚔' },
  'epic-boon': { label: 'Epic Boon', mark: '✦' },
};

/* ------------------------------------------------------------------ Feats */

/** Feats: readable cards (✎ to edit one), and one picker for the PHB 2024 list with category chips. */
export function FeatsTab({ draft, commit }: Ctx) {
  const [fresh, setFresh] = useState<string | null>(null);
  const upd = (id: string, patch: Partial<CharacterSheet['feats'][number]>) =>
    commit({ ...draft, feats: draft.feats.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const have = new Set(draft.feats.map((f) => f.name.toLowerCase()));
  const items: PickItem[] = SRD_FEATS_DRAFT.map((f) => ({
    key: f.id,
    name: f.name,
    mark: FEAT_CAT[f.category].mark,
    hint: [(f as { source?: string }).source, f.prerequisite ?? FEAT_CAT[f.category].label].filter(Boolean).join(' · '),
    detail: f.guidance + (f.prerequisite ? ` (Yêu cầu: ${f.prerequisite})` : ''),
    tags: [f.category, ...((f as { source?: string }).source ? ['setting'] : [])],
    keywords: [(f as { source?: string }).source ?? ''],
    disabled: have.has(f.name.toLowerCase()),
  }));

  function add(it: PickItem) {
    const f = SRD_FEATS_DRAFT.find((x) => x.id === it.key)!;
    commit({
      ...draft,
      feats: [...draft.feats, { id: nanoIdish(), name: f.name, description: f.prerequisite ? `${f.guidance} (Yêu cầu: ${f.prerequisite})` : f.guidance }],
    });
  }

  return (
    <div className="list-tab">
      {draft.feats.length === 0 && <p className="empty">Chưa có feat.</p>}
      {draft.feats.map((f) => {
        const def = findFeatDraft(f.name);
        return (
          <EntryCard
            key={f.id}
            name={f.name}
            badge={f.fromBackground ? `từ ${f.fromBackground}` : def ? FEAT_CAT[def.category].label : 'tự nhập'}
            description={f.description}
            startEditing={fresh === f.id}
            onDelete={() => commit({ ...draft, feats: draft.feats.filter((x) => x.id !== f.id) })}
            editor={
              <>
                <input className="lt-name" value={f.name} placeholder="Tên feat" onChange={(e) => upd(f.id, { name: e.target.value })} />
                <textarea value={f.description} placeholder="Mô tả" rows={3} onChange={(e) => upd(f.id, { description: e.target.value })} />
              </>
            }
          />
        );
      })}
      <SearchPicker
        title="+ Thêm feat"
        items={items}
        chips={[
          ...(SRD_FEATS_DRAFT.some((f) => (f as { source?: string }).source) ? [{ value: 'setting', label: 'Setting' }] : []),
          ...(Object.keys(FEAT_CAT) as FeatDef['category'][]).map((c) => ({ value: c, label: FEAT_CAT[c].label })),
        ]}
        onPick={add}
        footer={
          <button
            className="link"
            onClick={() => {
              const id = nanoIdish();
              setFresh(id);
              commit({ ...draft, feats: [...draft.feats, { id, name: '', description: '' }] });
            }}
          >
            + Feat tự nhập (homebrew / setting)
          </button>
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ Features */

const RECHARGE_VI: Record<string, string> = { short: 'nghỉ ngắn', long: 'nghỉ dài', other: 'khác' };

function UsePips({ uses, onChange }: { uses: NonNullable<Feature['uses']>; onChange: (used: number) => void }) {
  const left = uses.max - uses.used;
  if (uses.max > 10) {
    return (
      <span className="pips">
        <button className="link" onClick={() => onChange(uses.used + 1)}>−</button>
        {left}/{uses.max}
        <button className="link" onClick={() => onChange(uses.used - 1)}>+</button>
      </span>
    );
  }
  return (
    <span className="pips" title={`Còn ${left}/${uses.max} · hồi khi ${RECHARGE_VI[uses.recharge] ?? uses.recharge}`}>
      {Array.from({ length: uses.max }, (_, i) => (
        <button key={i} className={`pip ${i < left ? 'full' : ''}`} onClick={() => onChange(i < left ? uses.max - i : uses.max - i - 1)} />
      ))}
    </span>
  );
}

/** Custom features / abilities: cards with their uses pips always at hand; ✎ edits name, source,
 *  uses and text. Warlocks also get the invocation picker here. */
export function AbilitiesTab({ draft, commit }: Ctx) {
  const [fresh, setFresh] = useState<string | null>(null);
  const upd = (id: string, patch: Partial<Feature>) =>
    commit({ ...draft, features: draft.features.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const clampUsed = (f: Feature, used: number) => Math.max(0, Math.min(f.uses!.max, used));
  const wl = warlockLevel(draft);
  const have = new Set(draft.features.map((f) => f.name.toLowerCase()));

  function addNew(template?: Partial<Feature>) {
    const id = nanoIdish();
    setFresh(id);
    commit({ ...draft, features: [...draft.features, { id, name: '', source: '', description: '', ...template }] });
  }

  return (
    <div className="list-tab">
      {draft.features.length === 0 && <p className="empty">Chưa có năng lực tự thêm. (Năng lực class / subclass / chủng tộc hiện ở tab Cơ bản.)</p>}
      {draft.features.map((f) => (
        <EntryCard
          key={f.id}
          name={f.name}
          badge={f.source || undefined}
          description={f.description}
          startEditing={fresh === f.id}
          extra={f.uses ? <UsePips uses={f.uses} onChange={(u) => upd(f.id, { uses: { ...f.uses!, used: clampUsed(f, u) } })} /> : undefined}
          onDelete={() => commit({ ...draft, features: draft.features.filter((x) => x.id !== f.id) })}
          editor={
            <>
              <div className="lt-line">
                <input className="lt-name" value={f.name} placeholder="Tên năng lực" onChange={(e) => upd(f.id, { name: e.target.value })} />
                <input className="lt-src" value={f.source} placeholder="Nguồn (Fighter 3, vật phẩm…)" onChange={(e) => upd(f.id, { source: e.target.value })} />
              </div>
              <div className="lt-line">
                <label className="chk">
                  <input
                    type="checkbox"
                    checked={!!f.uses}
                    onChange={(e) => upd(f.id, { uses: e.target.checked ? { max: 1, used: 0, recharge: 'long' } : undefined })}
                  />
                  Có lượt dùng
                </label>
                {f.uses && (
                  <>
                    <label className="ec-inline">
                      tối đa
                      <input type="number" className="res-max" min={1} value={f.uses.max} onChange={(e) => upd(f.id, { uses: { ...f.uses!, max: Math.max(1, Number(e.target.value)) } })} />
                    </label>
                    <label className="ec-inline">
                      hồi khi
                      <select value={f.uses.recharge} onChange={(e) => upd(f.id, { uses: { ...f.uses!, recharge: e.target.value as never } })}>
                        <option value="short">nghỉ ngắn</option>
                        <option value="long">nghỉ dài</option>
                        <option value="other">khác (tự hồi)</option>
                      </select>
                    </label>
                  </>
                )}
              </div>
              <textarea value={f.description} placeholder="Mô tả" rows={3} onChange={(e) => upd(f.id, { description: e.target.value })} />
            </>
          }
        />
      ))}
      <div className="ec-add">
        <button onClick={() => addNew()}>+ Năng lực</button>
        <button onClick={() => addNew({ uses: { max: 1, used: 0, recharge: 'long' } })} title="Năng lực có lượt dùng, hồi khi nghỉ dài">
          + Năng lực có lượt dùng
        </button>
      </div>
      {wl > 0 && (
        <SearchPicker
          title="+ Eldritch Invocation"
          items={WARLOCK_INVOCATIONS_DRAFT.map((inv) => ({
            key: inv.id,
            name: inv.name,
            mark: '✦',
            hint: inv.prerequisite ?? 'Không yêu cầu',
            detail: inv.guidance,
            disabled: !inv.repeatable && have.has(inv.name.toLowerCase()),
          }))}
          onPick={(it) => {
            const inv = WARLOCK_INVOCATIONS_DRAFT.find((x) => x.id === it.key)!;
            commit({
              ...draft,
              features: [
                ...draft.features,
                { id: nanoIdish(), name: inv.name, source: 'Eldritch Invocation', description: inv.prerequisite ? `${inv.guidance} (Yêu cầu: ${inv.prerequisite})` : inv.guidance },
              ],
            });
          }}
        />
      )}
    </div>
  );
}
