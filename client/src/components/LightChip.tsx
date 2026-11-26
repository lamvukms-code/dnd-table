import { memo } from 'react';
import { SCENE_LIGHTS, SCENE_LIGHT_VI, type SceneLight } from '@dnd-table/shared';
import { useStore } from '../store.js';

export const LIGHT_ICON: Record<SceneLight, string> = { sun: '☀', bright: '💡', moon: '🌙', dim: '🌗', dark: '🌑' };

/**
 * Top-bar chip for the light across the scene. The DM sets it (light-dependent monster traits —
 * sunlight sensitivity, lunar invisibility — then run by themselves); players just see it.
 * Unset with a moon in the sky counts as moonlight.
 */
function LightChipImpl() {
  const light = useStore((s) => s.room?.light ?? null);
  const moonUp = useStore((s) => !!s.room?.moon);
  const isDm = useStore((s) => s.isDm());
  const send = useStore((s) => s.send);
  const eff: SceneLight | null = light ?? (moonUp ? 'moon' : null);
  if (!isDm && !eff) return null;
  if (!isDm) {
    return (
      <div className="light-chip" title="Ánh sáng của cảnh">
        {LIGHT_ICON[eff!]} {SCENE_LIGHT_VI[eff!]}
      </div>
    );
  }
  return (
    <label className={`light-chip ${eff ? 'on' : ''}`} title="Ánh sáng của cảnh: quái nhạy nắng / trăng / bóng tối tự áp theo đây">
      {eff ? LIGHT_ICON[eff] : '💡'}
      <select value={light ?? ''} onChange={(e) => send({ t: 'setLight', light: (e.target.value || null) as SceneLight | null })}>
        <option value="">{moonUp ? 'Theo trăng (ánh trăng)' : 'Không theo dõi'}</option>
        {SCENE_LIGHTS.map((l) => (
          <option key={l} value={l}>
            {LIGHT_ICON[l]} {SCENE_LIGHT_VI[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

export const LightChip = memo(LightChipImpl);
