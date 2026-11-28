import {
  actionDamageParts,
  buildFeatureEffect,
  defaultAnchor,
  featureActionDice,
  parseArea,
  resolveFeatureAttack,
  resolveFeatureDc,
  resolveFeatureNumber,
  type CharacterSheet,
  type FeatureAction,
  type SheetAction,
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
  /** A weapon-style feature attack was rolled (armed riders it carried are now spent). */
  onWeaponFired?: () => void;
  /** Put the character in a form (or out of it: undefined) — a 'form' button. */
  setForm?: (form: string | undefined) => void;
}

/** Buttons a feature declares in local data, run through the app's usual attack / save / area flows. */
export function FeatureActions({ sheet, classKey, featureName, actions, targetId, spendUse, onWeaponFired, setForm }: Props) {
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
    if (a.kind === 'form') {
      const on = !!a.form && (sheet.activeForm ?? '').toLowerCase() === a.form.toLowerCase();
      if (!on && (a.spendsUse ?? true) && spendUse && !spendUse()) return;
      if (!on && a.cost && !spendEconomy(sheet.tokenId, a.cost)) return;
      setForm?.(on ? undefined : a.form);
      return;
    }
    const self = sheet.tokenId;
    const tgt = a.target === 'self' ? self : targetId || undefined;
    const needsTarget = a.kind !== 'summon' && (a.kind === 'attack' || a.kind === 'damage' || a.kind === 'save' || ((a.kind === 'effect' || a.kind === 'heal' || a.kind === 'tempHp') && a.target !== 'self'));
    if (needsTarget && !tgt) {
      useStore.setState({ error: 'Chọn mục tiêu ở ô 🎯 Mục tiêu trước.' });
      return;
    }
    if (a.kind !== 'aoe' && !self && (a.kind === 'attack' || a.kind === 'summon' || a.target === 'self')) {
      useStore.setState({ error: 'Nhân vật chưa có token trên bản đồ.' });
      return;
    }
    if ((a.spendsUse ?? true) && spendUse && !spendUse()) return;
    if (a.cost && !spendEconomy(self, a.cost)) return;

    const label = `${sheet.name} · ${a.label}`;
    const tgtName = tokens.find((t) => t.id === tgt)?.label;
    const dice = featureActionDice(a, sheet, classKey);
    const parts = dice ? [{ dice, type: a.type ?? '' }] : [];
    const effect = () => buildFeatureEffect(a, sheet, classKey, round, featureName);
    const selfToken = tokens.find((t) => t.id === self);

    switch (a.kind) {
      case 'attack': {
        const bonus = resolveFeatureAttack(a.attack, sheet);
        // A weapon-style strike (claws, mutated arms…) picks up Rage, feature riders and armed riders
        // exactly like an equipped weapon row does.
        const row: SheetAction = {
          id: `feat:${a.label}`,
          name: a.label,
          actionType: a.cost === 'bonus' ? 'bonus' : 'action',
          attackBonus: bonus,
          damage: dice,
          damageType: a.type ?? '',
          attackKind: 'weapon',
          attackRange: a.range ?? 'melee',
          source: 'weapon',
        } as SheetAction;
        void attackRoll({
          label: `${label}${tgtName ? ` → ${tgtName}` : ''}`,
          attackBonus: bonus,
          rollMode: 'normal',
          damageParts: a.weapon ? actionDamageParts(sheet, row, selfToken?.effects) : parts,
          targetTokenId: tgt!,
          attackerSheetId: sheet.id,
          attackerTokenId: self,
          attackRange: a.range ?? 'melee',
          attackKind: 'weapon',
        });
        if (a.weapon) onWeaponFired?.();
        break;
      }
      case 'summon': {
        const s = a.summon;
        if (!s) return;
        const hp = Math.max(1, resolveFeatureNumber(s.hp, sheet, classKey));
        send({
          t: 'addToken',
          token: {
            label: s.label,
            x: (selfToken?.x ?? 0) + 1,
            y: selfToken?.y ?? 0,
            color: s.color ?? '#d8c27a',
            armorClass: resolveFeatureNumber(s.ac, sheet, classKey),
            maxHp: hp,
            currentHp: hp,
          },
        });
        break;
      }
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
          title={[a.cost ? `tốn ${a.cost === 'action' ? 'action' : a.cost === 'bonus' ? 'bonus action' : 'reaction'}` : '', featureActionDice(a, sheet, classKey) ? featureActionDice(a, sheet, classKey) + (a.type ? ` ${a.type}` : '') : '', a.summon ? `AC ${resolveFeatureNumber(a.summon.ac, sheet, classKey)}, HP ${resolveFeatureNumber(a.summon.hp, sheet, classKey)}` : '', a.save ? `${a.save.ability.toUpperCase()} save DC ${resolveFeatureDc(a.save.dc, sheet)}` : ''].filter(Boolean).join(' · ')}
          onClick={() => run(a)}
        >
          {a.kind === 'form' ? ((sheet.activeForm ?? '').toLowerCase() === (a.form ?? '').toLowerCase() ? '◉' : '○') : a.kind === 'attack' ? '⚔' : a.kind === 'aoe' ? '🔺' : a.kind === 'save' ? '🎯' : a.kind === 'heal' ? '✚' : a.kind === 'tempHp' ? '🛡' : a.kind === 'summon' ? '👼' : '✦'} {a.label}
        </button>
      ))}
    </span>
  );
}
