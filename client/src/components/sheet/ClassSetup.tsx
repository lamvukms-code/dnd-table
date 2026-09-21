import { useEffect, useMemo, useState } from 'react';
import {
  SKILLS,
  abilityMod,
  classDefaults,
  recommendedHp,
  sheetClasses,
  type CharacterSheet,
  type Feature,
} from '@dnd-table/shared';
import { nanoIdish } from '../../util.js';

interface SrdClassEntry {
  class: string;
  level: number;
  name: string;
  text: string;
  sub?: boolean;
}

const SKILL_VI: Record<string, string> = {
  acrobatics: 'Acrobatics (DEX)',
  'animal-handling': 'Animal Handling (WIS)',
  arcana: 'Arcana (INT)',
  athletics: 'Athletics (STR)',
  deception: 'Deception (CHA)',
  history: 'History (INT)',
  insight: 'Insight (WIS)',
  intimidation: 'Intimidation (CHA)',
  investigation: 'Investigation (INT)',
  medicine: 'Medicine (WIS)',
  nature: 'Nature (INT)',
  perception: 'Perception (WIS)',
  performance: 'Performance (CHA)',
  persuasion: 'Persuasion (CHA)',
  religion: 'Religion (INT)',
  'sleight-of-hand': 'Sleight of Hand (DEX)',
  stealth: 'Stealth (DEX)',
  survival: 'Survival (WIS)',
};

/**
 * "Điền theo class": fills in what a player left blank once the class + level are known —
 * saving-throw proficiencies, class skill picks, recommended HP, and the class features of
 * every level up to the character's (SRD 5.2.1 text). Nothing is applied until confirmed.
 */
export function ClassSetup({
  draft,
  commit,
  onClose,
}: {
  draft: CharacterSheet;
  commit: (next: CharacterSheet) => void;
  onClose: () => void;
}) {
  const primary = sheetClasses(draft)[0];
  const def = classDefaults(primary?.name);
  const [srd, setSrd] = useState<SrdClassEntry[] | null>(null);
  useEffect(() => {
    fetch('/srd/classes.json')
      .then((r) => (r.ok ? r.json() : []))
      .then(setSrd)
      .catch(() => setSrd([]));
  }, []);

  const options = useMemo(
    () => (def ? (def.skillOptions ?? Object.keys(SKILLS)) : []),
    [def],
  );
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(draft.skillProficiencies.filter((s) => options.includes(s))),
  );
  const hp = recommendedHp(draft);
  const hpIsDefault = draft.maxHp <= 10;
  const [doSaves, setDoSaves] = useState(true);
  const [doSkills, setDoSkills] = useState(true);
  const [doHp, setDoHp] = useState(hpIsDefault && hp !== null);
  const [doFeatures, setDoFeatures] = useState(true);

  const newFeatures: Feature[] = useMemo(() => {
    if (!srd || !primary) return [];
    const have = new Set(draft.features.map((f) => f.name.toLowerCase()));
    return srd
      .filter(
        (e) =>
          !e.sub &&
          e.level > 0 &&
          e.level <= primary.level &&
          e.class.toLowerCase() === primary.name.trim().toLowerCase() &&
          !have.has(e.name.toLowerCase()),
      )
      .map((e) => ({
        id: nanoIdish(),
        name: e.name,
        source: `${e.class} ${e.level}`,
        description: e.text,
      }));
  }, [srd, primary, draft.features]);

  if (!def || !primary) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2>Điền theo class</h2>
            <button className="link" onClick={onClose}>
              ✕
            </button>
          </div>
          <p>
            Chưa nhận ra class “{draft.className || '(trống)'}”. Hãy nhập một trong: Barbarian, Bard,
            Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard.
          </p>
        </div>
      </div>
    );
  }

  const toggle = (sk: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(sk)) next.delete(sk);
      else if (next.size < def.skillPick) next.add(sk);
      return next;
    });

  function apply() {
    const next: CharacterSheet = { ...draft };
    if (doSaves) next.saveProficiencies = Array.from(new Set([...draft.saveProficiencies, ...def!.saves]));
    if (doSkills) next.skillProficiencies = Array.from(new Set([...draft.skillProficiencies, ...picked]));
    if (doHp && hp !== null) {
      next.maxHp = hp;
      next.currentHp = hp;
    }
    if (doFeatures && newFeatures.length) next.features = [...draft.features, ...newFeatures];
    commit(next);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal class-setup" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>
            Điền theo class — {primary.name} cấp {primary.level}
          </h2>
          <button className="link" onClick={onClose}>
            ✕
          </button>
        </div>

        <label className="chk">
          <input type="checkbox" checked={doSaves} onChange={(e) => setDoSaves(e.target.checked)} />
          Thành thạo save: <strong>{def.saves.map((a) => a.toUpperCase()).join(' + ')}</strong>
        </label>

        <label className="chk">
          <input type="checkbox" checked={doHp} onChange={(e) => setDoHp(e.target.checked)} />
          HP khuyến nghị (d{def.hitDie}, CON {abilityMod(draft.abilities.con) >= 0 ? '+' : ''}
          {abilityMod(draft.abilities.con)}): <strong>{hp ?? '?'}</strong> — hiện đang {draft.maxHp}
        </label>

        <label className="chk">
          <input type="checkbox" checked={doFeatures} onChange={(e) => setDoFeatures(e.target.checked)} />
          Thêm <strong>{newFeatures.length}</strong> feature của class (cấp 1–{primary.level}, từ SRD)
          {srd === null ? ' — đang tải…' : ''}
        </label>

        <label className="chk">
          <input type="checkbox" checked={doSkills} onChange={(e) => setDoSkills(e.target.checked)} />
          Chọn kỹ năng class: <strong>{picked.size}/{def.skillPick}</strong>
          {def.skillOptions === null ? ' (Bard: bất kỳ)' : ''}
        </label>
        <div className="cs-skills">
          {options.map((sk) => (
            <label key={sk} className="chk">
              <input
                type="checkbox"
                checked={picked.has(sk)}
                disabled={!doSkills || (!picked.has(sk) && picked.size >= def.skillPick)}
                onChange={() => toggle(sk)}
              />
              {SKILL_VI[sk] ?? sk}
            </label>
          ))}
        </div>
        <p className="hint">
          Kỹ năng từ xuất thân (background) hãy tích thêm ở tab Kỹ năng. Tổng save / kỹ năng tự tính từ
          chỉ số + thành thạo — không cần gõ tay.
        </p>

        <div className="cs-actions">
          <button className="primary" onClick={apply}>
            Áp dụng
          </button>
          <button onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}
