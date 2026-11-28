import { useState } from 'react';
import { featFeatureDefs, featureRiders, replacedClassFeatureIds, subclassUsesMax, type CharacterSheet, type DamageRider } from '@dnd-table/shared';
import { SUBCLASS_DEFS } from '../../subclassData.js';
import { nanoIdish } from '../../util.js';
import { DamageTypeSelect } from '../DefensesEditor.js';

const SCOPE_VI: Record<string, string> = {
  weapon: 'đòn vũ khí',
  melee: 'đòn cận chiến',
  ranged: 'đòn tầm xa',
  unarmed: 'tay không',
  spell: 'đòn phép',
  any: 'mọi đòn',
};

/** Common sheet-level extra damage. Target marks (Hunter's Mark, Hex) live on the target bar instead. */
/** `featureId`: hidden when a subclass has replaced that class feature. */
const PRESETS: (Omit<DamageRider, 'id' | 'enabled'> & { note?: string; featureId?: string })[] = [
  { name: 'Divine Smite', dice: '2d8', type: 'radiant', scope: 'melee', once: true, note: '+1d8 mỗi cấp ô phép trên 1; +1d8 với fiend/undead', featureId: 'paladin-smite' },
  { name: 'Divine Favor', dice: '1d4', type: 'radiant', scope: 'weapon' },
  { name: 'Holy Weapon', dice: '2d8', type: 'radiant', scope: 'weapon' },
  { name: 'Elemental Weapon', dice: '1d4', type: 'fire', scope: 'weapon', note: 'đổi loại sát thương theo lựa chọn' },
  { name: 'Flame Tongue', dice: '2d6', type: 'fire', scope: 'melee' },
  { name: 'Frost Brand', dice: '1d6', type: 'cold', scope: 'melee' },
  { name: 'Dragon Slayer (vs rồng)', dice: '3d6', type: 'same', scope: 'weapon', once: true },
  { name: 'Giant Slayer (vs khổng lồ)', dice: '2d6', type: 'same', scope: 'weapon', once: true },
];

/**
 * "Sát thương thêm" above the attack rows, in one place:
 *  - your own riders (magic weapon, Divine Favor, Smite…) as on/off chips — "1 lần" ones switch
 *    themselves off once the next attack's damage is rolled, so nothing keeps adding by mistake;
 *  - class/subclass feature riders: standing ones listed as automatic, once-per-turn ones as toggles.
 * ✎ opens a compact manager with presets.
 */
export function FeatureRiderBar({ sheet, commit }: { sheet: CharacterSheet; commit: (s: CharacterSheet) => void }) {
  const [managing, setManaging] = useState(false);
  const feats = featureRiders(sheet);
  const mine = sheet.damageRiders ?? [];
  const armed = new Set(sheet.featureRidersArmed ?? []);
  const used = sheet.subclassUses ?? {};
  const setRiders = (r: DamageRider[]) => commit({ ...sheet, damageRiders: r });
  const upd = (id: string, patch: Partial<DamageRider>) => setRiders(mine.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function toggleFeat(id: string, featureId: string, spendsUse?: boolean, spendsPactSlot?: boolean) {
    const on = armed.has(id);
    // a smite fed by a Pact Magic slot: arming spends one, un-arming before the swing gives it back
    let pactSlots = sheet.pactSlots;
    if (spendsPactSlot && pactSlots) {
      if (!on && pactSlots.used >= pactSlots.max && !window.confirm('Hết ô Pact Magic. Vẫn bật?')) return;
      pactSlots = { ...pactSlots, used: Math.max(0, Math.min(pactSlots.max, pactSlots.used + (on ? -1 : 1))) };
    }
    const next = on ? [...armed].filter((x) => x !== id) : [...armed, id];
    let uses = used;
    if (spendsUse) {
      const def = SUBCLASS_DEFS.find((d) => d.id === featureId) ?? featFeatureDefs(sheet).find((d) => d.id === featureId);
      const max = def?.uses ? subclassUsesMax(def.uses.max, sheet) : 0;
      const u = used[featureId] ?? 0;
      if (!on && max && u >= max && !window.confirm(`${def?.name}: đã hết lượt dùng. Vẫn bật?`)) return;
      // arming spends a use, un-arming before the swing gives it back
      uses = { ...used, [featureId]: Math.max(0, u + (on ? -1 : 1)) };
    }
    commit({ ...sheet, featureRidersArmed: next, subclassUses: uses, ...(spendsPactSlot ? { pactSlots } : {}) });
  }

  const typeText = (t: string) => (t && t !== 'same' ? ` ${t}` : '');

  return (
    <div className="rider-bar">
      <div className="feature-riders">
        <span className="rb-title">Sát thương thêm</span>
        {mine.map((r) => (
          <button
            key={r.id}
            className={`cf-btn fr-chip ${r.enabled ? 'on' : ''}`}
            title={`${SCOPE_VI[r.scope ?? 'weapon']}${r.once ? ' · 1 lần: tự tắt sau đòn kế' : ' · cộng mọi đòn khi bật'}`}
            onClick={() => upd(r.id, { enabled: !r.enabled })}
          >
            {r.once ? '⚔' : '✦'} {r.name} +{r.dice}
            {typeText(r.type)}
            {r.once && <em className="fr-once"> 1 lần</em>}
          </button>
        ))}
        {feats.map((r) => {
          const cond = [SCOPE_VI[r.rider.scope ?? 'weapon'], r.rider.whileRaging ? 'khi Rage' : ''].filter(Boolean).join(', ');
          if (!r.rider.armed) {
            const inactive = r.rider.whileRaging && !sheet.raging;
            return (
              <span key={r.id} className={`fr-chip auto ${inactive ? 'off' : ''}`} title={`Năng lực: tự cộng vào ${cond}`}>
                ✦ {r.label} +{r.dice}
                {typeText(r.type)}
                <em> · tự động{inactive ? ' (chưa Rage)' : ''}</em>
              </span>
            );
          }
          const on = armed.has(r.id);
          return (
            <button
              key={r.id}
              className={`cf-btn fr-chip ${on ? 'on' : ''}`}
              title={`Năng lực, 1 lần/lượt: bật trước khi tung ${cond}${r.rider.spendsUse ? ' (tốn 1 lượt dùng)' : ''}`}
              onClick={() => toggleFeat(r.id, r.featureId, r.rider.spendsUse, r.rider.spendsPactSlot)}
            >
              ⚔ {r.label}
              {r.rider.attackMod ? ` ${r.rider.attackMod > 0 ? '+' : ''}${r.rider.attackMod} trúng /` : ''} +{r.dice}
              {typeText(r.type)}
              <em className="fr-once"> 1 lần</em>
            </button>
          );
        })}
        {mine.length === 0 && feats.length === 0 && <span className="hint">không có</span>}
        <button className="link rb-manage" onClick={() => setManaging((v) => !v)} title="Thêm / sửa nguồn sát thương thêm của bạn">
          {managing ? '✓ xong' : '✎ quản lý'}
        </button>
      </div>

      {managing && (
        <div className="rb-manager">
          <p className="hint">
            Bật chip ở trên trước khi đánh. “1 lần” = tự tắt sau khi tung sát thương đòn kế (Smite, đòn đặc biệt); bỏ chọn = cộng mọi đòn
            khi đang bật (vũ khí phép, Divine Favor). Dấu ấn lên mục tiêu (Hunter's Mark, Hex) đặt ở ô 🎯 Mục tiêu.
          </p>
          {mine.map((r) => (
            <div key={r.id} className="rb-row">
              <input className="rider-name" value={r.name} placeholder="Tên" onChange={(e) => upd(r.id, { name: e.target.value })} />
              <input className="xd-dice" value={r.dice} placeholder="1d4" onChange={(e) => upd(r.id, { dice: e.target.value })} />
              <DamageTypeSelect value={r.type === 'same' ? '' : r.type} onChange={(v) => upd(r.id, { type: v ?? 'same' })} />
              <select value={r.scope ?? 'weapon'} onChange={(e) => upd(r.id, { scope: e.target.value as DamageRider['scope'] })} title="Đòn nào được cộng">
                {Object.entries(SCOPE_VI).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <label className="chk" title="Tự tắt sau đòn kế">
                <input type="checkbox" checked={!!r.once} onChange={(e) => upd(r.id, { once: e.target.checked })} />1 lần
              </label>
              <button className="link" title="Xóa" onClick={() => setRiders(mine.filter((x) => x.id !== r.id))}>
                ✕
              </button>
            </div>
          ))}
          <div className="rb-add">
            <select
              value=""
              onChange={(e) => {
                const p = PRESETS.find((x) => x.name === e.target.value);
                if (!p) return;
                const { note: _n, featureId: _f, ...rest } = p;
                setRiders([...mine, { id: nanoIdish(), enabled: !p.once, ...rest }]);
              }}
            >
              <option value="">+ Thêm từ mẫu…</option>
              {PRESETS.filter((p) => !p.featureId || !replacedClassFeatureIds(sheet).has(p.featureId)).map((p) => (
                <option key={p.name} value={p.name} title={p.note}>
                  {p.name} (+{p.dice}
                  {typeText(p.type)}
                  {p.once ? ', 1 lần' : ''})
                </option>
              ))}
            </select>
            <button onClick={() => setRiders([...mine, { id: nanoIdish(), name: 'Nguồn mới', dice: '1d4', type: 'same', scope: 'weapon', enabled: true }])}>
              + Tự nhập
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
