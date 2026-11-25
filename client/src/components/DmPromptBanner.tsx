import { useEffect, useState } from 'react';
import {
  attackKindOf,
  attackRangeOf,
  failCondition,
  gridFeet,
  legendaryActionCost,
  statblockDamageParts,
  type SheetAction,
  type Token,
} from '@dnd-table/shared';
import { useStore } from '../store.js';

/** The stat-block action a legendary / lair option means: itself if it rolls, else the attack it names. */
function resolveOption(o: SheetAction, sbActions: SheetAction[]): { action: SheetAction; count: number } | null {
  if (typeof o.attackBonus === 'number' || o.save) return { action: o, count: 1 };
  const m = /makes (one|a|two|three|an) ([\w' -]+?) attacks?\b/i.exec(o.description ?? '') ?? /\b(one|a|an) ([\w' -]+?) attack\b/i.exec(o.description ?? '');
  if (!m) return null;
  const want = m[2].toLowerCase().replace(/s$/, '');
  const a = sbActions.find((x) => typeof x.attackBonus === 'number' && x.name.toLowerCase().replace(/\s*\(.*?\)/g, '').replace(/s$/, '') === want);
  return a ? { action: a, count: { two: 2, three: 3 }[m[1].toLowerCase()] ?? 1 } : null;
}

/**
 * DM-only banner: "a legendary/lair action is available — use it now?" Raised by the server
 * (see room.ts `checkDmPrompts`) right after a turn/round change. Picking an option spends it and,
 * when the option is (or names) an attack or a save, rolls it against the chosen target right away.
 */
export function DmPromptBanner() {
  const prompt = useStore((s) => s.room?.dmPrompt);
  const tokens = useStore((s) => s.room?.tokens);
  const sheets = useStore((s) => s.room?.sheets);
  const isDm = useStore((s) => s.isDm());
  const send = useStore((s) => s.send);
  const attackRoll = useStore((s) => s.attackRoll);
  const [targetId, setTargetId] = useState('');
  const me = tokens?.find((t) => t.id === prompt?.tokenId);
  const playerSide = (t: Token) => !!t.controllerId || !!sheets?.some((s) => s.tokenId === t.id);
  const foes = (tokens ?? []).filter((t) => t.id !== me?.id && !t.hidden && playerSide(t) && !(typeof t.currentHp === 'number' && t.currentHp <= 0));
  useEffect(() => {
    if (!me || (targetId && foes.some((f) => f.id === targetId))) return;
    const near = foes.reduce<Token | undefined>((a, b) => (!a || gridFeet(me, b) < gridFeet(me, a) ? b : a), undefined);
    setTargetId(near?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt?.tokenId, prompt?.kind]);
  if (!prompt || !isDm) return null;

  const title =
    prompt.kind === 'legendaryAction'
      ? `⚡ ${prompt.tokenName} còn ${prompt.remaining} legendary action — dùng luôn không?`
      : `🏰 Lượt hang ổ (initiative 20) — ${prompt.tokenName} dùng lair action nào?`;
  const target = tokens?.find((t) => t.id === targetId);

  async function run(o: SheetAction) {
    send({ t: 'dmPromptUse', actionId: o.id });
    if (!me?.statblock || !target) return;
    const r = resolveOption(o, me.statblock.actions);
    if (!r) return;
    const a = r.action;
    const parts = statblockDamageParts(a, me.statblock);
    if (typeof a.attackBonus === 'number') {
      for (let i = 0; i < r.count; i++) {
        await attackRoll({
          label: `${me.label} · ${a.name} → ${target.label} (${prompt?.kind === 'legendaryAction' ? 'legendary' : 'lair'})`,
          attackBonus: a.attackBonus,
          damageParts: parts,
          targetTokenId: target.id,
          attackerTokenId: me.id,
          attackRange: attackRangeOf(a),
          attackKind: attackKindOf(a),
          rangeText: a.range ?? a.description,
          actionName: a.name,
        });
      }
    } else if (a.save) {
      const cond = failCondition(a.description);
      send({
        t: 'spellSave',
        targetTokenId: target.id,
        ability: a.save.ability,
        dc: a.save.dc,
        label: `${me.label} · ${a.name} → ${target.label}`,
        damageOnFail: parts.length ? parts : undefined,
        damageHalfOnSave: /half (?:as much )?damage/i.test(a.description ?? ''),
        sourceTokenId: me.id,
        effectOnFail: cond ? { id: '', name: a.name, sourceTokenId: me.id, condition: cond, note: 'Từ legendary/lair action; thời hạn xem mô tả' } : undefined,
      });
    }
  }

  return (
    <div className="dm-prompt">
      <span className="dm-prompt-title">{title}</span>
      {foes.length > 0 && (
        <label className="dm-prompt-target">
          Mục tiêu{' '}
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {foes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
                {me ? ` (${gridFeet(me, f)} ft)` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="dm-prompt-opts">
        {prompt.options.length === 0 && (
          <button onClick={() => send({ t: 'dmPromptUse' })}>Dùng (chưa có danh sách cụ thể)</button>
        )}
        {prompt.options.map((o) => {
          const cost = prompt.kind === 'legendaryAction' ? legendaryActionCost(o) : 1;
          const short = prompt.kind === 'legendaryAction' && cost > prompt.remaining;
          const rolls = !!(me?.statblock && resolveOption(o, me.statblock.actions));
          return (
            <button
              key={o.id}
              disabled={short}
              title={short ? `Cần ${cost} legendary action, chỉ còn ${prompt.remaining}` : o.description}
              onClick={() => void run(o)}
            >
              {rolls ? '🎲 ' : ''}
              {o.name}
            </button>
          );
        })}
        <button className="link" onClick={() => send({ t: 'dmPromptDismiss' })}>
          Bỏ qua
        </button>
      </div>
    </div>
  );
}

/** DM-only: a monster's reaction just became available (its trigger fired). "Dùng" runs its save / damage. */
export function ReactPromptBanner() {
  const prompts = useStore((s) => s.room?.reactPrompts);
  const tokens = useStore((s) => s.room?.tokens);
  const isDm = useStore((s) => s.isDm());
  const send = useStore((s) => s.send);
  if (!isDm || !prompts?.length) return null;
  return (
    <div className="oa-prompts react-prompts">
      {prompts.map((p) => {
        const a = tokens?.find((t) => t.id === p.tokenId)?.statblock?.actions.find((x) => x.id === p.actionId);
        return (
          <div key={p.id} className="oa-prompt react">
            <span title={a?.description}>
              ⚡ <b>{p.tokenName}</b> có thể dùng reaction <b>{p.actionName}</b> ({p.why}
              {p.triggerName && !p.why.includes(p.triggerName) ? ` · ${p.triggerName}` : ''})
            </span>
            <button className="primary" title={a?.description} onClick={() => send({ t: 'reactResolve', id: p.id, use: true })}>
              {a?.save && p.triggerName ? `🎲 Dùng lên ${p.triggerName}` : 'Dùng'}
            </button>
            <button className="link" onClick={() => send({ t: 'reactResolve', id: p.id, use: false })}>
              Bỏ qua
            </button>
          </div>
        );
      })}
    </div>
  );
}
