import { attacksPerAction, grappleDc, rogueLevel, skillBonus, type CharacterSheet, type RollMode, type Token } from '@dnd-table/shared';
import { useStore } from '../../store.js';

interface Props {
  sheet: CharacterSheet;
  token: Token | null;
  /** The sheet's current target (Help, Grapple). */
  targetId?: string;
  rollMode: RollMode;
}

/**
 * The standard actions anyone can take on their turn: Dash, Disengage, Dodge, Hide, Help, Grapple.
 * Each spends the turn's economy (Action; Grapple = one of the Attack action's attacks) and the server
 * applies the effect: Dodge / Help last until this token's next turn, Disengage until the end of this one,
 * Hide rolls Stealth vs DC 15. A Rogue's Cunning Action gets a "BA" button for Dash / Disengage / Hide.
 */
export function TurnActions({ sheet, token, targetId, rollMode }: Props) {
  const spendEconomy = useStore((s) => s.spendEconomy);
  const tokenDash = useStore((s) => s.tokenDash);
  const turnAction = useStore((s) => s.turnAction);
  const hideAction = useStore((s) => s.hideAction);
  const grapple = useStore((s) => s.grapple);
  const target = useStore((s) => (targetId ? s.room?.tokens.find((t) => t.id === targetId) : undefined));
  if (!token) return null;

  const cunning = rogueLevel(sheet) >= 2;
  const other = target && target.id !== token.id ? target : undefined;
  const grappling = !!other?.effects?.some((e) => e.condition === 'grappled' && e.sourceSheetId === sheet.id);
  const stealth = skillBonus(sheet, 'stealth');
  const dc = grappleDc(sheet);

  const pay = (kind: 'action' | 'bonus') => spendEconomy(token.id, kind);
  // Dash pays its own Action / Bonus Action (checked by the server); the others spend it first.
  const run: Record<'dash' | 'disengage' | 'hide', (cost: 'action' | 'bonus') => void> = {
    dash: (cost) => tokenDash(token.id, cost),
    disengage: (cost) => pay(cost) && turnAction(token.id, 'disengage'),
    hide: (cost) => pay(cost) && void hideAction(token.id, stealth, rollMode),
  };
  const btn = (key: 'dash' | 'disengage' | 'hide', label: string, title: string) => (
    <span key={key} className="ta-split">
      <button className="ta-btn" title={`${title} (Action)`} onClick={() => run[key]('action')}>
        {label}
      </button>
      {cunning && (
        <button className="ta-btn ta-ba" title={`${title} — Cunning Action (Bonus Action)`} onClick={() => run[key]('bonus')}>
          BA
        </button>
      )}
    </span>
  );

  return (
    <div className="turn-actions">
      <span className="ta-label">Trong lượt</span>
      {btn('dash', '⚡ Dash', 'Thêm quãng di chuyển bằng tốc độ của bạn trong lượt này')}
      {btn('disengage', '🏃 Disengage', 'Di chuyển không bị Opportunity Attack tới hết lượt')}
      <button
        className="ta-btn"
        title="Tới đầu lượt sau: đòn đánh vào bạn bị bất lợi, bạn lợi thế cứu DEX (Action)"
        onClick={() => pay('action') && turnAction(token.id, 'dodge')}
      >
        🛡 Dodge
      </button>
      {btn('hide', `👁 Hide ${stealth >= 0 ? '+' : ''}${stealth}`, 'Check Stealth DC 15 khi đang được che khuất / ngoài tầm nhìn; thành công = ẩn nấp (tàng hình) tới khi tấn công hoặc bị phát hiện')}
      <button
        className="ta-btn"
        disabled={!other}
        title={other ? `Đòn đánh kế tiếp của đồng minh vào ${other.label} có lợi thế, tới đầu lượt sau của bạn (Action; bạn phải ở trong 5 ft của nó)` : 'Chọn mục tiêu (kẻ địch) ở thanh 🎯 trước'}
        onClick={() => other && pay('action') && turnAction(token.id, 'help', other.id)}
      >
        🤝 Help
      </button>
      <button
        className={`ta-btn ${grappling ? 'on' : ''}`}
        disabled={!other}
        title={
          !other
            ? 'Chọn mục tiêu ở thanh 🎯 trước'
            : grappling
              ? `Thả ${other.label} (miễn phí)`
              : `Vật lộn ${other.label}: nó cứu STR/DEX vs DC ${dc}, trượt = Grappled (dùng 1 đòn của Attack)`
        }
        onClick={() => {
          if (!other) return;
          if (!grappling && !spendEconomy(token.id, 'action', { attack: true, maxAttacks: attacksPerAction(sheet) })) return;
          grapple({ targetTokenId: other.id, dc, label: `${sheet.name} · Vật lộn`, sourceSheetId: sheet.id, sourceTokenId: token.id, release: grappling });
        }}
      >
        ✊ {grappling ? 'Thả' : `Grapple DC ${dc}`}
      </button>
    </div>
  );
}
