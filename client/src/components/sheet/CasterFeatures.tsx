import { useEffect, useState } from 'react';
import {
  ARCANE_RECOVERY_ID,
  INNATE_SORCERY,
  INNATE_SORCERY_ID,
  METAMAGIC,
  SLOT_CREATE_COST,
  TRANSMUTE_TYPES,
  applyWildShape,
  arcaneRecovery,
  arcaneRecoveryBudget,
  beastFormProblem,
  crValue,
  druidLevel,
  endWildShape,
  fmtCr,
  freeSpellbookSpells,
  metamagicCost,
  metamagicDef,
  metamagicKnownMax,
  metamagicProblem,
  pointsToSlot,
  slotToPoints,
  sorcererLevel,
  sorcerousRestoration,
  sorceryPointsLeft,
  sorceryPointsMax,
  spellbookCounts,
  wildShapeLimits,
  wildShapeMax,
  type CharacterSheet,
  type MetamagicKey,
  type Statblock,
  type Token,
} from '@dnd-table/shared';
import { flashError, useStore } from '../../store.js';

type Commit = (s: CharacterSheet) => void;
const applyOr = (r: CharacterSheet | string, commit: Commit) => (typeof r === 'string' ? flashError(r) : commit(r));

/** Sorcery Points as a row of pips (filled = left). */
function PointPips({ max, left }: { max: number; left: number }) {
  return (
    <span className="sp-pips" title={`${left}/${max} Sorcery Points`}>
      {left}/{max}
    </span>
  );
}

/** Innate Sorcery active on the linked token. */
const innateOn = (tok: Token | undefined) => !!tok?.effects?.some((e) => e.name === INNATE_SORCERY);

// ---------------------------------------------------------------------------------------------
// Sorcerer (class features block): Sorcery Points, Font of Magic, Innate Sorcery, Metamagic known
// ---------------------------------------------------------------------------------------------

export function SorcererPanel({
  draft,
  commit,
  token,
  spendBonus,
}: {
  draft: CharacterSheet;
  commit: Commit;
  token?: Token;
  spendBonus: () => boolean;
}) {
  const send = useStore((s) => s.send);
  const round = useStore((s) => s.room?.initiative.round ?? 1);
  const sl = sorcererLevel(draft);
  const max = sorceryPointsMax(draft);
  const left = sorceryPointsLeft(draft);
  const innateUsed = draft.subclassUses?.[INNATE_SORCERY_ID] ?? 0;
  const active = innateOn(token);
  const known = draft.metamagic ?? [];
  const knownMax = metamagicKnownMax(draft);
  const [slotLvl, setSlotLvl] = useState(1);

  function innate() {
    if (!token) return flashError('Nhân vật chưa gắn token trên bản đồ');
    if (active) {
      const e = token.effects?.find((x) => x.name === INNATE_SORCERY);
      if (e) send({ t: 'removeEffect', tokenId: token.id, effectId: e.id });
      return;
    }
    let patch: Partial<CharacterSheet>;
    if (innateUsed < 2) patch = { subclassUses: { ...(draft.subclassUses ?? {}), [INNATE_SORCERY_ID]: innateUsed + 1 } };
    else if (sl >= 7 && left >= 2 && window.confirm('Hết lượt Innate Sorcery. Sorcery Incarnate: tốn 2 Sorcery Points để bật?'))
      patch = { sorceryUsed: (draft.sorceryUsed ?? 0) + 2 };
    else return flashError('Hết lượt Innate Sorcery (hồi khi nghỉ dài)');
    if (!spendBonus()) return;
    commit({ ...draft, ...patch });
    send({
      t: 'applyEffect',
      targetTokenId: token.id,
      effect: {
        id: '',
        name: INNATE_SORCERY,
        sourceSheetId: draft.id,
        spellAttackAdvantage: true,
        spellDcBonus: 1,
        expiresRound: round + 10,
        note: 'Lợi thế đòn phép Sorcerer, +1 spell save DC (1 phút)' + (sl >= 7 ? ' · Sorcery Incarnate: tối đa 2 Metamagic mỗi phép' : ''),
      },
    });
  }

  const slotsWithLeft = draft.spellSlots.filter((s) => s.used < s.max);
  const creatable = Object.entries(SLOT_CREATE_COST).filter(([, r]) => sl >= r.minLevel);

  return (
    <div className="cf-auto sorc-panel">
      <button className={`cf-btn ${active ? 'on' : ''}`} onClick={innate} title="Bonus Action, 1 phút: lợi thế đòn phép Sorcerer, +1 spell save DC. 2 lần mỗi nghỉ dài">
        ✨ Innate Sorcery {active ? '— ĐANG BẬT (bấm để tắt)' : `(${Math.max(0, 2 - innateUsed)}/2)`}
      </button>
      {max > 0 && (
        <>
          <span className="cf-label">Sorcery Points:</span>
          <PointPips max={max} left={left} />
          <span className="font-of-magic">
            {slotsWithLeft.length > 0 && (
              <select
                value=""
                title="Font of Magic: đổi 1 ô phép thành Sorcery Points bằng cấp ô (không tốn action)"
                onChange={(e) => e.target.value && applyOr(slotToPoints(draft, Number(e.target.value)), commit)}
              >
                <option value="">Ô → điểm…</option>
                {slotsWithLeft.map((s) => (
                  <option key={s.level} value={s.level}>
                    Ô cấp {s.level} → +{s.level} điểm
                  </option>
                ))}
              </select>
            )}
            {creatable.length > 0 && (
              <>
                <select value={slotLvl} onChange={(e) => setSlotLvl(Number(e.target.value))} title="Cấp ô muốn tạo">
                  {creatable.map(([lvl, r]) => (
                    <option key={lvl} value={lvl}>
                      Ô cấp {lvl} ({r.cost} điểm)
                    </option>
                  ))}
                </select>
                <button
                  className="cf-btn"
                  disabled={left < (SLOT_CREATE_COST[slotLvl]?.cost ?? 99)}
                  title="Font of Magic: Bonus Action, đổi Sorcery Points thành ô phép (biến mất khi nghỉ dài)"
                  onClick={() => {
                    const r = pointsToSlot(draft, slotLvl);
                    if (typeof r === 'string') return flashError(r);
                    if (!spendBonus()) return;
                    commit(r);
                  }}
                >
                  Điểm → ô
                </button>
              </>
            )}
            {sl >= 5 && (
              <button
                className="cf-btn"
                disabled={!!draft.sorcRestoreUsed || !draft.sorceryUsed}
                title={`Sorcerous Restoration: khi nghỉ ngắn, hồi ${Math.floor(sl / 2)} điểm. 1 lần mỗi nghỉ dài`}
                onClick={() => applyOr(sorcerousRestoration(draft), commit)}
              >
                Restoration +{Math.floor(sl / 2)}
                {draft.sorcRestoreUsed ? ' (đã dùng)' : ''}
              </button>
            )}
          </span>
        </>
      )}
      {knownMax > 0 && (
        <details className="mm-known">
          <summary>
            Metamagic đã biết {known.length}/{knownMax}
            {known.length ? `: ${known.map((k) => metamagicDef(k)?.name.replace(' Spell', '')).join(', ')}` : ''}
          </summary>
          {METAMAGIC.map((m) => {
            const on = known.includes(m.key);
            return (
              <label key={m.key} className="chk mm-opt" title={m.vi}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && known.length >= knownMax}
                  onChange={() =>
                    commit({
                      ...draft,
                      metamagic: on ? known.filter((k) => k !== m.key) : [...known, m.key],
                      metamagicArmed: (draft.metamagicArmed ?? []).filter((k) => k !== m.key || !on),
                    })
                  }
                />
                {m.name} ({m.cost} điểm) — <span className="hint">{m.vi}</span>
              </label>
            );
          })}
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Metamagic chips in the Spells tab: armed before casting, spent on the next cast
// ---------------------------------------------------------------------------------------------

export function MetamagicBar({ draft, commit }: { draft: CharacterSheet; commit: Commit }) {
  const token = useStore((s) => s.room?.tokens.find((t) => t.id === draft.tokenId));
  const known = draft.metamagic ?? [];
  if (sorceryPointsMax(draft) === 0) return null;
  const armed = draft.metamagicArmed ?? [];
  const incarnate = sorcererLevel(draft) >= 7 && innateOn(token);
  const cost = metamagicCost(armed);
  const left = sorceryPointsLeft(draft);

  function toggle(k: MetamagicKey) {
    const next = armed.includes(k) ? armed.filter((x) => x !== k) : [...armed, k];
    const why = metamagicProblem(next, { incarnate });
    if (why) return flashError(why);
    commit({ ...draft, metamagicArmed: next });
  }

  return (
    <div className="metamagic-bar">
      <span className="rb-title">
        ✨ Metamagic · {left}/{sorceryPointsMax(draft)} điểm
      </span>
      {known.length === 0 && <span className="hint">chưa chọn Metamagic (phần Sorcerer ở tab Cơ bản)</span>}
      {known.map((k) => {
        const d = metamagicDef(k)!;
        return (
          <button key={k} className={`cf-btn fr-chip ${armed.includes(k) ? 'on' : ''}`} title={d.vi} onClick={() => toggle(k)}>
            {d.name.replace(' Spell', '')} ({d.cost})
          </button>
        );
      })}
      {armed.includes('transmuted') && (
        <select
          value={draft.metamagicTransmute ?? ''}
          title="Transmuted Spell: đổi sang loại sát thương này"
          onChange={(e) => commit({ ...draft, metamagicTransmute: e.target.value || undefined })}
        >
          <option value="">đổi thành…</option>
          {TRANSMUTE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}
      {armed.length > 0 && (
        <span className={`hint ${cost > left ? 'over' : ''}`}>
          → phép kế tiếp: −{cost} điểm{incarnate ? ' · Sorcery Incarnate: tối đa 2' : ''}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Wizard: Arcane Recovery (class features block) and the spellbook line in the Spells tab
// ---------------------------------------------------------------------------------------------

export function ArcaneRecoveryPanel({ draft, commit }: { draft: CharacterSheet; commit: Commit }) {
  const [pick, setPick] = useState<number[]>([]);
  const used = !!draft.subclassUses?.[ARCANE_RECOVERY_ID];
  const budget = arcaneRecoveryBudget(draft);
  const sum = pick.reduce((a, b) => a + b, 0);
  const spent = draft.spellSlots.filter((s) => s.level < 6 && s.used > 0);
  const takenOf = (l: number) => pick.filter((x) => x === l).length;
  return (
    <div className="cf-auto">
      <span className="cf-label">Arcane Recovery{used ? ' (đã dùng)' : ` (tổng cấp ≤ ${budget})`}:</span>
      {!used &&
        spent.map((s) => (
          <button
            key={s.level}
            className="cf-btn"
            disabled={sum + s.level > budget || takenOf(s.level) >= s.used}
            onClick={() => setPick([...pick, s.level])}
            title={`Chọn hồi 1 ô cấp ${s.level}`}
          >
            +ô {s.level}
          </button>
        ))}
      {!used && pick.length > 0 && (
        <>
          <span className="hint">
            hồi: {pick.join(' + ')} = {sum}/{budget}
          </span>
          <button
            className="cf-btn on"
            onClick={() => {
              const r = arcaneRecovery(draft, pick);
              if (typeof r === 'string') return flashError(r);
              commit(r);
              setPick([]);
            }}
          >
            Hồi ô
          </button>
          <button className="link" onClick={() => setPick([])}>
            ✕
          </button>
        </>
      )}
      {!used && spent.length === 0 && <span className="hint">chưa có ô phép cấp 1–5 nào đã dùng</span>}
      <span className="hint">Sau nghỉ ngắn, 1 lần mỗi nghỉ dài.</span>
    </div>
  );
}

export type ScribeMode = 'free' | 'copied' | 'none';

export function SpellbookBar({ draft, mode, setMode }: { draft: CharacterSheet; mode: ScribeMode; setMode: (m: ScribeMode) => void }) {
  const c = spellbookCounts(draft);
  return (
    <div className="spellbook-bar">
      <span className="rb-title">📖 Sổ phép</span>
      <span>
        {c.total} phép cấp 1+ · miễn phí khi lên cấp {c.free}/{freeSpellbookSpells(draft)} · chép thêm {c.copied}
      </span>
      <label className="edit-only" title="Phép cấp 1+ thêm vào từ giờ được ghi vào sổ thế nào">
        Thêm phép cấp 1+:
        <select value={mode} onChange={(e) => setMode(e.target.value as ScribeMode)}>
          <option value="free">Miễn phí (lên cấp){c.freeLeft ? ` — còn ${c.freeLeft}` : ' — hết'}</option>
          <option value="copied">Chép từ cuộn / sổ khác (50 gp + 2 giờ mỗi cấp)</option>
          <option value="none">Không ghi vào sổ (phép từ nguồn khác)</option>
        </select>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Druid: Wild Shape forms
// ---------------------------------------------------------------------------------------------

let beastList: Promise<Statblock[]> | null = null;
function loadBeasts(): Promise<Statblock[]> {
  beastList ??= fetch('/srd/monsters.json')
    .then((r) => (r.ok ? (r.json() as Promise<Statblock[]>) : []))
    .then((all) => all.filter((b) => /\bbeast\b/i.test(b.meta ?? '')).sort((a, b) => crValue(a.cr) - crValue(b.cr) || a.name.localeCompare(b.name)))
    .catch(() => {
      beastList = null;
      return [];
    });
  return beastList;
}

export function WildShapePanel({
  draft,
  commit,
  token,
  spendBonus,
  extraTempHp,
}: {
  draft: CharacterSheet;
  commit: Commit;
  token?: Token;
  spendBonus: () => boolean;
  /** Temp HP another source grants whenever a use is spent (Circlet of Natural Rejuvenation). */
  extraTempHp: number;
}) {
  const [beasts, setBeasts] = useState<Statblock[]>([]);
  const [adding, setAdding] = useState('');
  useEffect(() => {
    let live = true;
    void loadBeasts().then((b) => live && setBeasts(b));
    return () => {
      live = false;
    };
  }, []);
  const lim = wildShapeLimits(draft);
  const max = wildShapeMax(draft);
  const used = Math.min(draft.wildShapeUsed ?? 0, max);
  const forms = draft.wildShapeForms ?? [];
  const byId = new Map(beasts.map((b) => [b.id, b]));
  const ws = draft.wildShape;
  const eligible = beasts.filter((b) => !forms.includes(b.id) && !beastFormProblem(draft, b));

  function shift(b: Statblock) {
    const why = beastFormProblem(draft, b);
    if (why && !window.confirm(`${b.name}: ${why}. Vẫn biến?`)) return;
    if (used >= max && !window.confirm('Hết lượt Wild Shape. Vẫn biến (không trừ lượt)?')) return;
    if (!spendBonus()) return;
    const paid = used < max ? { wildShapeUsed: used + 1, tempHp: Math.max(draft.tempHp ?? 0, extraTempHp) } : {};
    commit(applyWildShape({ ...draft, ...paid }, b, token?.size));
  }

  return (
    <div className="wild-shape">
      {ws ? (
        <div className="ws-active">
          <strong>
            🐾 Đang là {ws.name} (CR {ws.cr})
          </strong>
          <span className="hint">
            AC {draft.acOverride} · tốc độ {draft.speed} ft{ws.speedNote ? `, ${ws.speedNote}` : ''} · STR {draft.abilities.str} DEX {draft.abilities.dex} CON{' '}
            {draft.abilities.con} · đòn của thú ở mục Hành động · không đúc phép được
          </span>
          {ws.traits.length > 0 && (
            <ul className="ws-traits">
              {ws.traits.map((t) => (
                <li key={t.name}>
                  <strong>{t.name}.</strong> {t.description}
                </li>
              ))}
            </ul>
          )}
          <button className="cf-btn on" onClick={() => commit(endWildShape(draft))} title="Thôi hình thú (không tốn action). Tự hết khi về 0 HP">
            Trở lại hình người
          </button>
        </div>
      ) : (
        <span className="hint">
          Bonus Action biến thành 1 hình dạng đã biết · HP tạm +{lim.tempHp} · CR ≤ {fmtCr(lim.maxCr)}
          {lim.fly ? '' : ', chưa bay'} · kéo dài {Math.max(1, Math.floor(druidLevel(draft) / 2))} giờ
        </span>
      )}
      <div className="ws-forms">
        <span className="cf-label">
          Hình dạng đã biết {forms.length}/{lim.known}:
        </span>
        {forms.map((id) => {
          const b = byId.get(id);
          return (
            <span key={id} className="ws-form">
              <button className="cf-btn" disabled={!b} onClick={() => b && shift(b)} title={b ? `${b.meta} · AC ${b.ac} · ${b.speed} ft${b.speedNote ? `, ${b.speedNote}` : ''}` : 'đang tải…'}>
                🐾 {b?.name ?? id}
                {b ? ` (CR ${b.cr})` : ''}
              </button>
              <button className="link edit-only" title="Bỏ hình dạng này" onClick={() => commit({ ...draft, wildShapeForms: forms.filter((x) => x !== id) })}>
                ✕
              </button>
            </span>
          );
        })}
        {forms.length < lim.known && (
          <select
            value={adding}
            title="Học hình dạng mới (Beast hợp lệ theo cấp)"
            onChange={(e) => {
              setAdding('');
              if (e.target.value) commit({ ...draft, wildShapeForms: [...forms, e.target.value] });
            }}
          >
            <option value="">+ Học hình dạng…</option>
            {eligible.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} (CR {b.cr}, {b.size}
                {b.speedNote ? `, ${b.speedNote}` : ''})
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
