import { useState } from 'react';
import type { CharacterSheet, JaegerState } from '@dnd-table/shared';
import {
  BASE_FINISHER,
  BASE_FOCUS_ARTS,
  adjustJaegerMomentum,
  breakingBlowOptions,
  CONDITION_VI,
  expendJaegerMomentum,
  jaegerBleedDc,
  jaegerBloodMagicDc,
  jaegerFinisherDc,
  jaegerFinishersKnown,
  jaegerFocusArtsKnown,
  jaegerFocusLeft,
  jaegerFocusMax,
  jaegerKnownArts,
  jaegerKnownFinishers,
  jaegerLevel,
  jaegerMomentum,
  jaegerMomentumDice,
  jaegerMomentumDie,
  jaegerMomentumMax,
  jaegerVolleyDc,
  piercingGazeAlwaysOn,
  piercingGazeSenses,
  jaegerCanRegain,
  regainJaegerFocus,
  spendJaegerFocus,
  viciousCritMin,
  viciousFinisherAttackBonus,
  viciousFinisherDamage,
} from '@dnd-table/shared';
import { useStore } from '../../store.js';
import { CLASS_OPTIONS, type ClassOptionDef } from '../../campaignData.js';

/**
 * Jaeger sheet controls: Focus Points, Momentum dice, Focus Arts, Finishers, Piercing Gaze and the
 * choices (Fighting Style, learned Arts/Finishers). Numbers come from shared/jaeger.ts; names and
 * descriptions come from the DM's local `classes.local.json` (`options.jaeger`) — without that file
 * the controls still work, labelled by id.
 */

const ACTION_VI: Record<string, string> = { action: 'hành động', bonus: 'bonus', reaction: 'phản ứng', special: 'đặc biệt' };
/** Turn-economy cost of the built-in Focus Arts, used when the local file doesn't say. */
const ART_ACTION: Record<string, ClassOptionDef['action']> = {
  'weapon-parry': 'reaction',
  'dodge-step': 'reaction',
  'aerial-vault': 'special',
  'elemental-art': 'bonus',
  'focus-mind': 'reaction',
  flourish: 'bonus',
  'i-dont-want-to-be-eaten-today': 'reaction',
  'jaegers-rush': 'bonus',
  'jaegers-assessment': 'bonus',
  'spell-flurry': 'bonus',
  'prayer-of-salvation': 'bonus',
  'blood-craze': 'reaction',
};
const FINISHER_ACTION: Record<string, ClassOptionDef['action']> = {
  brutal: 'special',
  breaking: 'special',
  chasing: 'bonus',
  hemorrhaging: 'special',
  opportunistic: 'reaction',
  vicious: 'bonus',
  volley: 'bonus',
  'great-cleave': 'special',
  'blood-drain': 'bonus',
};
/** Arts / Finishers only a chapter teaches — never offered in the "learn more" pickers. */
const CHAPTER_ONLY = new Set(['spell-flurry', 'prayer-of-salvation', 'blood-craze', 'great-cleave', 'blood-drain']);
const STYLE_IDS = ['dueling', 'great-weapon', 'flexible', 'focused', 'two-weapon'];
/** Finishers that add the held dice to the next weapon damage roll (armed, then rolled from the action list). */
const ARMABLE = new Set(['brutal', 'chasing', 'opportunistic']);

const pretty = (id: string) => id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function JaegerFeatures({ draft, commit }: { draft: CharacterSheet; commit: (s: CharacterSheet) => void }) {
  const room = useStore((s) => s.room);
  const rollDice = useStore((s) => s.rollDice);
  const spendEconomy = useStore((s) => s.spendEconomy);
  const [breakRow, setBreakRow] = useState(1);
  const lvl = jaegerLevel(draft);
  if (lvl <= 0) return null;
  // in combat, Focus comes back at most once per round (house rule)
  const round = room?.initiative.running ? room.initiative.round : undefined;

  const opts = CLASS_OPTIONS.jaeger ?? {};
  const find = (list: ClassOptionDef[] | undefined, id: string, fallback?: ClassOptionDef['action']): ClassOptionDef =>
    list?.find((o) => o.id === id) ?? { id, name: pretty(id), action: fallback, description: '' };
  const js: JaegerState = draft.jaeger ?? {};
  const setJ = (j: JaegerState) => commit({ ...draft, jaeger: j });
  const token = room?.tokens.find((t) => t.id === draft.tokenId);
  const spendTurn = (kind?: ClassOptionDef['action']) => {
    if (kind === 'action' || kind === 'bonus' || kind === 'reaction') spendEconomy(token?.id, kind);
  };

  const fMax = jaegerFocusMax(draft);
  const fLeft = jaegerFocusLeft(draft);
  const mDie = jaegerMomentumDie(draft);
  const mMax = jaegerMomentumMax(draft);
  const m = jaegerMomentum(draft);
  const mDice = jaegerMomentumDice(draft);

  const useArt = (id: string) => {
    const def = find(opts.focusArts, id, ART_ACTION[id]);
    const next = spendJaegerFocus(draft, 1, id === 'flourish' ? 1 : 0);
    if (!next) return;
    spendTurn(def.action ?? ART_ACTION[id]);
    setJ(next);
    // Salvation: you and one creature within 60 ft regain 1d6 HP (1d12 from 14) + equal temp HP.
    if (id === 'prayer-of-salvation') void rollDice(`${draft.name} · ${def.name}: hồi HP + HP tạm bằng nhau (bạn và 1 đồng minh)`, lvl >= 14 ? '1d12' : '1d6');
  };
  const spendFocusOnly = (label: string) => {
    const next = spendJaegerFocus(draft);
    if (next) setJ(next);
    void label;
  };
  const expend = () => setJ(expendJaegerMomentum(draft));

  const knownArts = jaegerKnownArts(draft);
  const knownFin = jaegerKnownFinishers(draft);
  const artPool = (opts.focusArts?.map((o) => o.id) ?? Object.keys(ART_ACTION)).filter(
    (id) => !BASE_FOCUS_ARTS.includes(id as never) && !CHAPTER_ONLY.has(id),
  );
  const finPool = (opts.finishers?.map((o) => o.id) ?? Object.keys(FINISHER_ACTION)).filter(
    (id) => id !== BASE_FINISHER && !CHAPTER_ONLY.has(id),
  );
  const artSlots = jaegerFocusArtsKnown(draft) - BASE_FOCUS_ARTS.length;
  const finSlots = Math.max(0, jaegerFinishersKnown(draft) - 1);
  const chosenArts = (js.focusArts ?? []).filter((a) => artPool.includes(a));
  const chosenFin = (js.finishers ?? []).filter((f) => finPool.includes(f));
  const toggleIn = (list: string[], id: string, cap: number) =>
    list.includes(id) ? list.filter((x) => x !== id) : list.length < cap ? [...list, id] : list;

  const dc = jaegerFinisherDc(draft);
  const rows = breakingBlowOptions(m);
  const row = rows.find((r) => r.dice === Math.min(breakRow, m)) ?? rows.at(-1);
  const gazeSenses = piercingGazeSenses(draft);

  return (
    <div className="cf-auto cf-jaeger">
      <span className="cf-label">🗡 Jaeger {lvl}</span>

      {/* Focus */}
      <span className="cf-label">Focus:</span>
      <span className="cf-pips">
        {Array.from({ length: fMax }).map((_, i) => (
          <button
            key={i}
            className={`cf-pip ${i < fMax - fLeft ? 'used' : ''}`}
            title="Dùng / hồi Focus Point (không cộng Momentum)"
            onClick={() => setJ({ ...js, focusUsed: i < fMax - fLeft ? i : i + 1 })}
          >
            ●
          </button>
        ))}
        <em>
          {fLeft}/{fMax}
        </em>
      </span>
      <button
        className="cf-btn"
        disabled={!jaegerCanRegain(draft, round)}
        title={`Hồi 1 Focus: tung 20 khi tấn công/save với kẻ địch · phần thưởng của Finisher · tính năng chapter.\nHouse rule: trong trận tối đa 1 lần mỗi round, gộp mọi nguồn.${round != null && js.regainRound === round ? '\nRound này đã hồi rồi.' : ''}`}
        onClick={() => setJ(regainJaegerFocus(draft, 1, round))}
      >
        ↺ +1 Focus
      </button>
      {round != null && fLeft === 0 && (
        <button
          className="cf-btn"
          title="Vào initiative khi đã hết Focus: hồi 1 (không tính vào giới hạn 1 lần/round)"
          onClick={() => setJ(regainJaegerFocus(draft))}
        >
          ↺ vào initiative
        </button>
      )}

      {/* Momentum */}
      {mDie && (
        <>
          <span className="cf-label">Momentum:</span>
          <span className="cf-btn static" title="Giữ đến hết lượt sau nếu: vừa nhận thêm die, đã tấn công kẻ địch, hoặc kết thúc lượt cạnh kẻ địch">
            {m}/{mMax} × {mDie}
          </span>
          <button className="cf-btn" disabled={m <= 0} onClick={() => setJ(adjustJaegerMomentum(draft, -1))}>
            −
          </button>
          <button className="cf-btn" disabled={m >= mMax} onClick={() => setJ(adjustJaegerMomentum(draft, 1))}>
            +
          </button>
          <button className="cf-btn" disabled={m <= 0} title="Mất hết Momentum (hết hạn giữ)" onClick={expend}>
            ✕ hết hạn
          </button>
        </>
      )}

      {/* Focus Arts */}
      <span className="cf-break" />
      <span className="cf-label">Focus Art:</span>
      {knownArts.map((id) => {
        const def = find(opts.focusArts, id, ART_ACTION[id]);
        const act = def.action ?? ART_ACTION[id];
        return (
          <button
            key={id}
            className="cf-btn"
            disabled={fLeft <= 0}
            title={`${def.name}${act ? ` (${ACTION_VI[act]})` : ''} — tốn 1 Focus${mDie ? `, +${id === 'flourish' ? 2 : 1} Momentum` : ''}.\n${def.description}`}
            onClick={() => useArt(id)}
          >
            {def.name}
          </button>
        );
      })}
      {lvl >= 6 && (
        <button
          className="cf-btn"
          disabled={fLeft <= 0}
          title={`Hunter's Pursuit (đầu lượt): tốn 1 Focus → di chuyển nửa tốc độ, không tính vào di chuyển, không bị đòn cơ hội.${lvl >= 13 ? ' Relentless Pursuit: dừng cạnh kẻ địch → hồi lại Focus đó (bấm ↺, tính vào giới hạn 1 lần/round).' : ''}`}
          onClick={() => spendFocusOnly("Hunter's Pursuit")}
        >
          🏃 Hunter's Pursuit
        </button>
      )}
      {lvl >= 15 && (
        <button className="cf-btn" disabled={fLeft <= 0} title="Inured to Madness: trượt save chống madness → tốn 1 Focus để tung lại." onClick={() => spendFocusOnly('Inured to Madness')}>
          🧠 Tung lại save madness
        </button>
      )}

      {/* Finishers */}
      {knownFin.length > 0 && (
        <>
          <span className="cf-break" />
          <span className="cf-label">Finisher{m > 0 ? ` (xả ${mDice})` : ' (cần Momentum)'}:</span>
          {knownFin.map((id) => {
            const def = find(opts.finishers, id, FINISHER_ACTION[id]);
            const act = def.action ?? FINISHER_ACTION[id];
            const tip = `${def.name}${act ? ` (${ACTION_VI[act]})` : ''}\n${def.description}`;
            if (ARMABLE.has(id)) {
              const on = js.armedFinisher === id;
              return (
                <button
                  key={id}
                  className={`cf-btn ${on ? 'on' : ''}`}
                  disabled={m <= 0 && !on}
                  title={`${tip}\n\nBật rồi tung sát thương vũ khí ở danh sách hành động: cộng ${mDice || 'Momentum dice'} vào sát thương, sau đó Momentum tự xả.`}
                  onClick={() => {
                    if (!on) spendTurn(act);
                    setJ({ ...js, armedFinisher: on ? null : (id as JaegerState['armedFinisher']) });
                  }}
                >
                  {def.name}
                  {on ? ' — SẴN SÀNG' : ''}
                </button>
              );
            }
            if (id === 'vicious')
              return (
                <button
                  key={id}
                  className="cf-btn"
                  disabled={m <= 0}
                  title={`${tip}\n\nTấn công +${viciousFinisherAttackBonus(draft)}, chí mạng khi ra ${viciousCritMin(m)}–20, sát thương ${viciousFinisherDamage(draft)} chém (phép).`}
                  onClick={async () => {
                    spendTurn(act);
                    await rollDice(`${draft.name} · ${def.name} — tấn công (chí mạng ${viciousCritMin(m)}+)`, `1d20+${viciousFinisherAttackBonus(draft)}`);
                    await rollDice(`${draft.name} · ${def.name} — sát thương chém`, viciousFinisherDamage(draft));
                    expend();
                  }}
                >
                  {def.name} ({viciousCritMin(m)}+)
                </button>
              );
            if (id === 'volley')
              return (
                <button
                  key={id}
                  className="cf-btn"
                  disabled={m <= 0}
                  title={`${tip}\n\nNón 30ft, save DEX DC ${jaegerVolleyDc(draft)}, trượt nhận ${mDice} xuyên. Trúng ≥2 sinh vật → hồi 1 Focus.`}
                  onClick={async () => {
                    spendTurn(act);
                    await rollDice(`${draft.name} · ${def.name} — DEX DC ${jaegerVolleyDc(draft)}, nón 30ft (xuyên)`, mDice);
                    expend();
                  }}
                >
                  {def.name} (DC {jaegerVolleyDc(draft)})
                </button>
              );
            if (id === 'breaking')
              return (
                <span key={id} className="cf-inline">
                  <button
                    className="cf-btn"
                    disabled={m <= 0 || !row}
                    title={`${tip}\n\nSau khi đánh trúng: mục tiêu save ${row?.save.toUpperCase()} DC ${dc} hoặc bị ${row ? (CONDITION_VI[row.condition as keyof typeof CONDITION_VI] ?? row.condition) : ''} ${row && row.dice >= 3 ? 'đến hết lượt sau của nó (house rule, không save lặp)' : '1 phút (save lại cuối mỗi lượt)'}. Mỗi sinh vật chỉ bị 1 lần mỗi nghỉ ngắn. Trượt save → hồi 1 Focus (tính vào giới hạn 1 lần/round).`}
                    onClick={expend}
                  >
                    {def.name}
                  </button>
                  {rows.length > 1 && (
                    <select value={row?.dice} onChange={(e) => setBreakRow(Number(e.target.value))} title="Chọn hiệu ứng (có thể chọn mức thấp hơn số dice)">
                      {rows.map((r) => (
                        <option key={r.dice} value={r.dice}>
                          {r.dice}: {r.save.toUpperCase()} → {CONDITION_VI[r.condition as keyof typeof CONDITION_VI] ?? r.condition}
                        </option>
                      ))}
                    </select>
                  )}
                </span>
              );
            if (id === 'blood-drain')
              return (
                <button
                  key={id}
                  className="cf-btn"
                  disabled={m <= 0}
                  title={`${tip}

Sinh vật trong 5ft save CON DC ${jaegerBloodMagicDc(draft)}: trượt nhận ${mDice} hoại tử, đỗ nhận một nửa; bạn hồi HP bằng nửa sát thương gây ra.`}
                  onClick={async () => {
                    spendTurn(act);
                    await rollDice(`${draft.name} · ${def.name}: CON DC ${jaegerBloodMagicDc(draft)} (hoại tử, đỗ = ½; hồi ½ sát thương)`, mDice);
                    expend();
                  }}
                >
                  {def.name} (DC {jaegerBloodMagicDc(draft)})
                </button>
              );
            if (id === 'hemorrhaging')
              return (
                <button
                  key={id}
                  className="cf-btn"
                  disabled={m <= 0}
                  title={`${tip}\n\nCuối mỗi lượt mục tiêu mất ${mDice} HP (giảm 1 die mỗi lần), save CON DC ${jaegerBleedDc(draft, m - 1)} sau khi nhận để cầm máu.`}
                  onClick={() => {
                    void rollDice(`${draft.name} · ${def.name}: chảy máu ${mDice}, CON DC ${jaegerBleedDc(draft, m - 1)}`, mDice);
                    expend();
                  }}
                >
                  {def.name}
                </button>
              );
            return (
              <button key={id} className="cf-btn" disabled={m <= 0} title={tip} onClick={expend}>
                {def.name}
              </button>
            );
          })}
        </>
      )}

      {/* Piercing Gaze */}
      {gazeSenses.length > 0 && (
        <>
          <span className="cf-break" />
          <button
            className={`cf-btn ${piercingGazeAlwaysOn(draft) || js.gazeUsed ? 'on' : ''}`}
            disabled={piercingGazeAlwaysOn(draft)}
            title={`Piercing Gaze (1 giờ, 1 lần/nghỉ dài): ${gazeSenses.join(', ')}`}
            onClick={() => setJ({ ...js, gazeUsed: !js.gazeUsed })}
          >
            👁 Piercing Gaze{piercingGazeAlwaysOn(draft) ? ' (luôn bật)' : js.gazeUsed ? ' — đã dùng' : ''}
          </button>
        </>
      )}

      {/* Choices */}
      <details className="cf-jaeger-choices">
        <summary>⚙ Lựa chọn Jaeger</summary>
        {lvl >= 2 && (
          <label>
            Fighting Style{' '}
            <select value={js.fightingStyle ?? ''} onChange={(e) => setJ({ ...js, fightingStyle: e.target.value || undefined })}>
              <option value="">— chưa chọn —</option>
              {(opts.fightingStyles?.map((o) => o.id) ?? STYLE_IDS).map((id) => {
                const def = find(opts.fightingStyles, id);
                return (
                  <option key={id} value={id} title={def.description}>
                    {def.name}
                  </option>
                );
              })}
            </select>
          </label>
        )}
        <div className="cf-label">
          Focus Art học thêm ({chosenArts.length}/{artSlots}) — luôn biết {BASE_FOCUS_ARTS.map((id) => find(opts.focusArts, id).name).join(', ')}
        </div>
        <div className="cf-choice-list">
          {artPool.map((id) => {
            const def = find(opts.focusArts, id);
            const on = chosenArts.includes(id);
            return (
              <label key={id} title={def.description}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && chosenArts.length >= artSlots}
                  onChange={() => setJ({ ...js, focusArts: toggleIn(chosenArts, id, artSlots) })}
                />{' '}
                {def.name}
              </label>
            );
          })}
        </div>
        {lvl >= 2 && (
          <>
            <div className="cf-label">
              Finisher học thêm ({chosenFin.length}/{finSlots}) — luôn biết {find(opts.finishers, BASE_FINISHER).name}
            </div>
            <div className="cf-choice-list">
              {finPool.map((id) => {
                const def = find(opts.finishers, id);
                const on = chosenFin.includes(id);
                return (
                  <label key={id} title={def.description}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!on && chosenFin.length >= finSlots}
                      onChange={() => setJ({ ...js, finishers: toggleIn(chosenFin, id, finSlots) })}
                    />{' '}
                    {def.name}
                  </label>
                );
              })}
            </div>
          </>
        )}
      </details>
    </div>
  );
}
