import {
  afterShots,
  canFire,
  fanFireShots,
  firearmLoaded,
  firearmSaveDc,
  parseArea,
  reloadCosts,
  reloaded,
  skillBonus,
  stepUpDie,
  d20Check,
  type CharacterSheet,
  type DamagePart,
  type InventoryItem,
  type SheetAction,
} from '@dnd-table/shared';
import { flashError, useStore } from '../../store.js';

interface Props {
  sheet: CharacterSheet;
  item: InventoryItem;
  action: SheetAction;
  parts: DamagePart[];
  targetId?: string;
  targetName?: string;
  commitItem: (it: InventoryItem) => void;
  /** Spend the action economy for one attack (same rule as the weapon row's own ⚔). */
  trySpend: (attack: boolean) => boolean;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Firearm row extras: shots left, reload, Fan Fire, Twinned, Spread Fire, Steady, clearing a jam. */
export function FirearmControls({ sheet, item, action, parts, targetId, targetName, commitItem, trySpend }: Props) {
  const attackRoll = useStore((s) => s.attackRoll);
  const beginAoe = useStore((s) => s.beginAoe);
  const spendEconomy = useStore((s) => s.spendEconomy);
  const rollDice = useStore((s) => s.rollDice);
  const send = useStore((s) => s.send);
  const fa = item.firearm!;
  const left = firearmLoaded(item);
  const err = (m: string) => flashError(m);
  const base = `${sheet.name} · ${item.name}`;
  const latest = (): InventoryItem =>
    useStore.getState().room?.sheets.find((s) => s.id === sheet.id)?.inventory.find((x) => x.id === item.id) ?? item;
  const attackOpts = (label: string, bonus: number, dmg: DamagePart[]) => ({
    label,
    attackBonus: bonus,
    rollMode: 'normal' as const,
    damageParts: dmg,
    targetTokenId: targetId!,
    attackerSheetId: sheet.id,
    attackerTokenId: sheet.tokenId || undefined,
    attackRange: 'ranged' as const,
    attackKind: 'weapon' as const,
  });

  async function fanFire() {
    if (!targetId) return err('Chọn mục tiêu trước.');
    const n = fanFireShots(sheet, item);
    const c = canFire(item, Math.max(1, n));
    if (!c.ok) return err(c.reason);
    if (!spendEconomy(sheet.tokenId || undefined, 'action')) return;
    commitItem(afterShots(item, n));
    const before = useStore.getState().room?.rollLog.length ?? 0;
    // only the first shot adds the ability modifier to damage
    const noMod: DamagePart[] = [{ ...parts[0], dice: item.damage || parts[0]?.dice || '1d6' }, ...parts.slice(1)];
    for (let i = 0; i < n; i++) {
      await attackRoll(attackOpts(`${base} → ${targetName} (Fan Fire ${i + 1}/${n}${i ? `, −${3 * i}` : ', speed về 0 tới hết lượt'})`, (action.attackBonus ?? 0) - 3 * i, i === 0 ? parts : noMod));
    }
    await wait(700);
    const fresh = (useStore.getState().room?.rollLog ?? []).slice(before);
    if (fresh.some((e) => e.attack && e.result.d20?.isFumble && e.label.includes(item.name))) {
      commitItem({ ...latest(), firearm: { ...latest().firearm!, jammed: true } });
      err(`${item.name} bị KẸT (ra 1 khi Fan Fire). Gỡ kẹt: action, Sleight of Hand DC 15.`);
    }
  }

  function twinned() {
    if (!targetId) return err('Chọn mục tiêu trước.');
    const c = canFire(item, 2);
    if (!c.ok) return err(c.reason);
    if (!trySpend(true)) return;
    commitItem(afterShots(item, left));
    const dmg = parts.map((p, i) => (i === 0 ? { ...p, dice: stepUpDie(p.dice) } : p));
    void attackRoll(attackOpts(`${base} → ${targetName} (2 nòng)`, action.attackBonus ?? 0, dmg));
  }

  function spread() {
    const c = canFire(item);
    if (!c.ok) return err(c.reason);
    const spec = parseArea(`${fa.spreadFire}-foot cone`);
    if (!spec || !sheet.tokenId) return err('Nhân vật cần token trên bản đồ để phun.');
    const dc = firearmSaveDc(sheet, item);
    beginAoe({
      label: `${base} (Spread Fire)`,
      spec,
      anchor: 'self',
      casterTokenId: sheet.tokenId,
      // the shot and the attack are only spent once the cone is confirmed (Esc = nothing spent)
      onConfirm: (ids, aoeId) => {
        if (!trySpend(true)) return;
        commitItem(afterShots(latest()));
        ids.forEach((id) =>
          send({ t: 'spellSave', targetTokenId: id, ability: 'dex', dc, label: `${base} (Spread Fire)`, damageOnFail: parts, aoeId, sourceSheetId: sheet.id }),
        );
      },
    });
  }

  function reload(cost: 'bonus' | 'action') {
    if (left >= fa.barrel) return err('Nòng đã đầy.');
    if (!spendEconomy(sheet.tokenId || undefined, cost)) return;
    commitItem(reloaded(item));
  }

  function steady() {
    if (!spendEconomy(sheet.tokenId || undefined, 'bonus')) return;
    commitItem({ ...item, firearm: { ...fa, steadyArmed: true } });
  }

  function clearJam() {
    if (!spendEconomy(sheet.tokenId || undefined, 'action')) return;
    void rollDice(`${base}: gỡ kẹt (Sleight of Hand, DC 15)`, d20Check(skillBonus(sheet, 'sleight-of-hand')));
    setTimeout(() => {
      if (window.confirm('Gỡ kẹt thành công (tổng ≥ 15)? Thất bại thì súng hỏng, phải mang đi sửa.')) {
        commitItem({ ...latest(), firearm: { ...latest().firearm!, jammed: false } });
      }
    }, 600);
  }

  return (
    <div className="firearm-controls">
      <span className={`fa-ammo ${left ? '' : 'empty'}`} title={`Barrel ${fa.barrel} (${fa.reload === 'fast' ? 'nạp nhanh' : fa.reload === 'slow' ? 'nạp chậm' : 'pháo'})`}>
        🔫 {left}/{fa.barrel}
        {fa.jammed && <strong className="fa-jam"> KẸT</strong>}
        {fa.steadyArmed && <em> · Steady +{sheet.proficiencyBonus}</em>}
        {fa.noise && <em title="Tiếng nổ nghe thấy xa: bất lợi/tự trượt Stealth để ẩn tới đầu lượt sau"> · {fa.noise === 'booming' ? 'nổ 500 ft' : 'nổ 100 ft'}</em>}
      </span>
      {fa.jammed ? (
        <button className="roll-btn sm" onClick={clearJam}>
          🔧 Gỡ kẹt
        </button>
      ) : (
        <>
          {reloadCosts(item).map((c) => (
            <button key={c} className="roll-btn sm" disabled={left >= fa.barrel} onClick={() => reload(c)}>
              ⟳ Nạp ({c === 'bonus' ? 'bonus' : 'action'})
            </button>
          ))}
          {fa.fanFire && targetId && (
            <button className="roll-btn sm" disabled={!left} onClick={() => void fanFire()} title="Action: bắn liên tiếp số viên = DEX mod (ít nhất 2), mỗi phát sau −3; ra 1 là kẹt">
              Fan Fire ×{fanFireShots(sheet, item)}
            </button>
          )}
          {fa.twinned && targetId && (
            <button className="roll-btn sm" disabled={left < 2} onClick={twinned} title="Xả cả nòng trong 1 đòn, xúc xắc sát thương lên 1 bậc">
              Bắn 2 nòng
            </button>
          )}
          {fa.spreadFire ? (
            <button className="roll-btn sm" disabled={!left} onClick={spread} title={`Nón ${fa.spreadFire} ft, DEX save DC ${firearmSaveDc(sheet, item)}`}>
              🔺 Phun ({fa.spreadFire} ft)
            </button>
          ) : null}
          {fa.steady && !fa.steadyArmed && (
            <button className="roll-btn sm" onClick={steady} title="Bonus action, khi chưa di chuyển: phát kế tiếp +PB, không bất lợi tầm xa; sau đó speed giảm nửa">
              Steady
            </button>
          )}
        </>
      )}
    </div>
  );
}
