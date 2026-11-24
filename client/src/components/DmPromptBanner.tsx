import { legendaryActionCost } from '@dnd-table/shared';
import { useStore } from '../store.js';

/**
 * DM-only banner: "a legendary/lair action is available — use it now?" Raised by the server
 * (see room.ts `checkDmPrompts`) right after a turn/round change, cleared by picking an option
 * (or "Bỏ qua") — either way it logs to the roll log so the table can see what happened.
 */
export function DmPromptBanner() {
  const prompt = useStore((s) => s.room?.dmPrompt);
  const isDm = useStore((s) => s.isDm());
  const send = useStore((s) => s.send);
  if (!prompt || !isDm) return null;

  const title =
    prompt.kind === 'legendaryAction'
      ? `⚡ ${prompt.tokenName} còn ${prompt.remaining} legendary action — dùng luôn không?`
      : `🏰 Lượt hang ổ (initiative 20) — ${prompt.tokenName} dùng lair action nào?`;

  return (
    <div className="dm-prompt">
      <span className="dm-prompt-title">{title}</span>
      <div className="dm-prompt-opts">
        {prompt.options.length === 0 && (
          <button onClick={() => send({ t: 'dmPromptUse' })}>Dùng (chưa có danh sách cụ thể)</button>
        )}
        {prompt.options.map((o) => {
          const cost = prompt.kind === 'legendaryAction' ? legendaryActionCost(o) : 1;
          const short = prompt.kind === 'legendaryAction' && cost > prompt.remaining;
          return (
            <button
              key={o.id}
              disabled={short}
              title={short ? `Cần ${cost} legendary action, chỉ còn ${prompt.remaining}` : o.description}
              onClick={() => send({ t: 'dmPromptUse', actionId: o.id })}
            >
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
