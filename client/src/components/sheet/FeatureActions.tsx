import {
  defaultAnchor,
  parseArea,
  resolveFeatureAttack,
  resolveFeatureDc,
  resolveFeatureFormula,
  type ActiveEffect,
  type CharacterSheet,
  type FeatureAction,
} from '@dnd-table/shared';
import { useStore } from '../../store.js';

interface Props {
  sheet: CharacterSheet;
  /** Class key the feature belongs to ("fighter", "jaeger"…) — `lvl` in formulas is the level in it. */
  classKey?: string;
  featureName: string;
  actions: FeatureAction[];
  /** The sheet's current target (the "🎯 Mục tiêu" bar). */
  targetId?: string;
  /** Spend one use of the feature's own pool; false = cancelled (no use left and the player declined). */
  spendUse?: () => boolean;
}

/** Buttons a feature declares in local data, run through the app's usual attack / save / area flows. */
export function FeatureActions({ sheet, classKey, featureName, actions, targetId, spendUse }: Props) {
  const send = useStore((s) => s.send);
  const attackRoll = useStore((s) => s.attackRoll);
  const damageRoll = useStore((s) => s.damageRoll);
  const healRoll = useStore((s) => s.healRoll);
  const beginAoe = useStore((s) => s.beginAoe);
  const spendEconomy = useStore((s) => s.spendEconomy);
  const round = useStore((s) => s.room?.initiative.round ?? 1);
  const tokens = useStore((s) => s.room?.tokens ?? []);
  if (!actions.length) return null;

  function run(a: FeatureAction) {
    const self = sheet.tokenId;
    const tgt = a.target === 'self' ? self : targetId || undefined;
    const needsTarget = a.kind === 'attack' || a.kind === 'damage' || a.kind === 'save' || ((a.kind === 'effect' || a.kind === 'heal' || a.kind === 'tempHp') && a.target !== 'self');
    if (needsTarget && !tgt) {
      useStore.setState({ error: 'Chọn mục tiêu ở ô 🎯 Mục tiêu trước.' });
      return;
    }
    if (a.kind !== 'aoe' && !self && (a.kind === 'attack' || a.target === 'self')) {
      useStore.setState({ error: 'Nhân vật chưa có token trên bản đồ.' });
      return;
    }
    if ((a.spendsUse ?? true) && spendUse && !spendUse()) return;
    if (a.cost && !spendEconomy(self, a.cost)) return;

    const label = `${sheet.name} · ${a.label}`;
    const tgtName = tokens.find((t) => t.id === tgt)?.label;
    const dice = a.dice ? resolveFeatureFormula(a.dice, sheet, classKey) : '';
    const parts = dice ? [{ dice, type: a.type ?? '' }] : [];
    const effect = (): ActiveEffect | undefined =>
      a.effect
        ? {
            id: '',
            name: a.effect.name ?? a.label,
            sourceSheetId: sheet.id,
            condition: a.effect.condition,
            note: a.effect.note ?? `${featureName}`,
            acBonus: a.effect.acBonus,
            expiresRound: a.effect.rounds ? round + a.effect.rounds : undefined,
            save:
              a.effect.repeat && a.save
                ? { ability: a.save.ability, dc: resolveFeatureDc(a.save.dc, sheet), repeat: a.effect.repeat }
                : undefined,
          }
        : undefined;

    switch (a.kind) {
      case 'attack':
        void attackRoll({
          label: `${label}${tgtName ? ` → ${tgtName}` : ''}`,
          attackBonus: resolveFeatureAttack(a.attack, sheet),
          rollMode: 'normal',
          damageParts: parts,
          targetTokenId: tgt!,
          attackerSheetId: sheet.id,
          attackerTokenId: self,
          attackRange: a.range ?? 'melee',
        });
        break;
      case 'damage':
        void damageRoll(`${label}${tgtName ? ` → ${tgtName}` : ''}`, parts, tgt!, { sheetId: sheet.id, tokenId: self });
        break;
      case 'heal':
        void healRoll(label, dice || '0', tgt!, sheet.id);
        break;
      case 'tempHp':
        send({ t: 'grantTempHp', targetTokenId: tgt!, notation: dice || '0', label, sourceSheetId: sheet.id });
        {
          const fx = effect();
          if (fx) send({ t: 'applyEffect', targetTokenId: tgt!, effect: fx });
        }
        break;
      case 'effect': {
        const fx = effect();
        if (fx) send({ t: 'applyEffect', targetTokenId: tgt!, effect: fx });
        break;
      }
      case 'save':
        send({
          t: 'spellSave',
          targetTokenId: tgt!,
          ability: a.save!.ability,
          dc: resolveFeatureDc(a.save!.dc, sheet),
          label: `${label}${tgtName ? ` → ${tgtName}` : ''}`,
          damageOnFail: parts.length ? parts : undefined,
          damageHalfOnSave: a.save!.halfOnSave,
          sourceSheetId: sheet.id,
          effectOnFail: effect(),
        });
        break;
      case 'aoe': {
        const spec = parseArea(a.area);
        if (!spec || !a.save) {
          useStore.setState({ error: `${a.label}: dữ liệu vùng chưa đúng ("${a.area ?? ''}").` });
          return;
        }
        const save = a.save;
        const dc = resolveFeatureDc(save.dc, sheet);
        beginAoe({
          label,
          spec,
          anchor: defaultAnchor(spec, a.rangeFeet ?? 0, !a.rangeFeet),
          casterTokenId: self,
          rangeFeet: a.rangeFeet ?? 0,
          onConfirm: (ids, aoeId) =>
            ids.forEach((id) =>
              send({
                t: 'spellSave',
                targetTokenId: id,
                ability: save.ability,
                dc,
                label,
                damageOnFail: parts.length ? parts : undefined,
                damageHalfOnSave: save.halfOnSave,
                aoeId,
                sourceSheetId: sheet.id,
                effectOnFail: effect(),
              }),
            ),
        });
        break;
      }
    }
  }

  return (
    <span className="feature-actions">
      {actions.map((a, i) => (
        <button
          key={i}
          className="roll-btn sm"
          title={[a.cost ? `tốn ${a.cost === 'action' ? 'action' : a.cost === 'bonus' ? 'bonus action' : 'reaction'}` : '', a.dice ? resolveFeatureFormula(a.dice, sheet, classKey) + (a.type ? ` ${a.type}` : '') : '', a.save ? `${a.save.ability.toUpperCase()} save DC ${resolveFeatureDc(a.save.dc, sheet)}` : ''].filter(Boolean).join(' · ')}
          onClick={() => run(a)}
        >
          {a.kind === 'attack' ? '⚔' : a.kind === 'aoe' ? '🔺' : a.kind === 'save' ? '🎯' : a.kind === 'heal' ? '✚' : a.kind === 'tempHp' ? '🛡' : '✦'} {a.label}
        </button>
      ))}
    </span>
  );
}
