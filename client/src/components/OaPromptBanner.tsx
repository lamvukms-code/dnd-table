import { memo } from 'react';
import {
  actionDamageParts,
  allActions,
  attackKindOf,
  attackRangeOf,
  statblockDamageParts,
  type OaPrompt,
  type RoomState,
  type SheetAction,
} from '@dnd-table/shared';
import { useStore } from '../store.js';

/** The melee attack a reactor uses for an Opportunity Attack, with its damage. */
function oaAttack(room: RoomState, p: OaPrompt) {
  const tok = room.tokens.find((t) => t.id === p.reactorTokenId);
  if (!tok) return null;
  const sheet = room.sheets.find((s) => s.tokenId === tok.id);
  const melee = (a: SheetAction) => typeof a.attackBonus === 'number' && attackRangeOf(a) === 'melee' && a.actionType === 'action';
  if (sheet) {
    const acts = allActions(sheet, tok.effects).filter(melee);
    // an equipped weapon beats the bare unarmed strike
    const a = acts.find((x) => x.id.startsWith('weapon:')) ?? acts[0];
    if (!a) return null;
    return { action: a, parts: actionDamageParts(sheet, a, tok.effects), sheetId: sheet.id, tokenId: tok.id };
  }
  const sb = tok.statblock;
  const a = sb?.actions.find(melee);
  if (!sb || !a) return null;
  return { action: a, parts: statblockDamageParts(a, sb), sheetId: undefined, tokenId: tok.id };
}

/**
 * "X left Y's reach — Opportunity Attack?" One line per open offer, shown to whoever controls the
 * reacting creature (the DM for monsters). "⚔" makes the attack with its first melee attack and
 * spends the reaction; "Bỏ qua" lets it go. Offers lapse when the turn changes.
 */
function OaPromptBannerImpl() {
  const room = useStore((s) => s.room);
  const isDm = useStore((s) => s.isDm());
  const me = useStore((s) => s.participantId);
  const send = useStore((s) => s.send);
  const attackRoll = useStore((s) => s.attackRoll);
  if (!room?.oaPrompts?.length) return null;
  const mine = room.oaPrompts.filter((p) => {
    const tok = room.tokens.find((t) => t.id === p.reactorTokenId);
    if (!tok) return false;
    const sheet = room.sheets.find((s) => s.tokenId === tok.id);
    if (sheet) return sheet.ownerId === me || isDm; // the DM can answer for an absent player
    if (tok.controllerId) return tok.controllerId === me;
    return isDm;
  });
  if (!mine.length) return null;
  return (
    <div className="oa-prompts">
      {mine.map((p) => {
        const atk = oaAttack(room, p);
        return (
          <div key={p.id} className="oa-prompt">
            <span>
              ⚔ <b>{p.moverName}</b> rời tầm với của <b>{p.reactorName}</b> — Opportunity Attack?
            </span>
            {atk ? (
              <button
                className="primary"
                title="Dùng reaction: 1 đòn cận chiến (bỏ qua nếu mục tiêu đã Disengage)"
                onClick={() => {
                  send({ t: 'oaResolve', id: p.id, used: true });
                  void attackRoll({
                    label: `${p.reactorName} · ${atk.action.name} → ${p.moverName} (Opportunity Attack)`,
                    attackBonus: atk.action.attackBonus!,
                    damageParts: atk.parts,
                    targetTokenId: p.moverTokenId,
                    attackerSheetId: atk.sheetId,
                    attackerTokenId: atk.tokenId,
                    attackRange: 'melee',
                    attackKind: attackKindOf(atk.action),
                  });
                }}
              >
                ⚔ {atk.action.name}
              </button>
            ) : (
              <button title="Không tìm thấy đòn cận chiến — đánh tay rồi bấm để trừ reaction" onClick={() => send({ t: 'oaResolve', id: p.id, used: true })}>
                Đã dùng reaction
              </button>
            )}
            <button className="link" onClick={() => send({ t: 'oaResolve', id: p.id, used: false })}>
              Bỏ qua
            </button>
          </div>
        );
      })}
    </div>
  );
}

export const OaPromptBanner = memo(OaPromptBannerImpl);
