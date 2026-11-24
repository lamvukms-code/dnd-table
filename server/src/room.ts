import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { nanoid } from 'nanoid';
import {
  abilityMod,
  createRoomState,
  createToken,
  defaultMap,
  normalizeSheet,
  DICE_TRAY_CAP,
  ROLL_LOG_CAP,
  SCHEMA_VERSION,
} from './factory.js';
import {
  clampToRange,
  concentrationDc,
  conditionAutoCrit,
  coverAcBonus,
  coverDexSaveBonus,
  derivedDefenses,
  externalRollResult,
  homebrewCritDamage,
  mergeDefenses,
  resolveAttack,
  tokenIsGrappled,
  walkSpeed,
  resolveDamageParts,
  damageWithTempHp,
  effectiveArmorClass,
  npcArmorClass,
  computeSpeed,
  emptyDefenses,
  grantTempHp,
  hitDicePools,
  bumpLevel,
  levelUpDie,
  levelUpHp,
  MAX_LEVEL,
  needsPityReroll,
  sheetClasses,
  totalLevelOf,
  spendHitDie,
  gridFeet,
  FEET_PER_CELL,
  abilityMod as abilityModOf,
  diceFacesOf,
  expendJaegerMomentum,
  legendaryActionCost,
  initiativeBonus,
  mergeSheetEdit,
  rollNotation,
  targetRiderParts,
  tokenConditions,
  tokenStatblockFrom,
  type Ability,
  type ActiveEffect,
  type AttackRange,
  type ClientAction,
  type DamagePart,
  type Defenses,
  type InitiativeEntry,
  type MultiDamageOutcome,
  type Participant,
  type RollLogEntry,
  type RollResult,
  type RoomState,
  type Statblock,
  type Token,
} from '@dnd-table/shared';

/** Prompt options need an id the DM's pick can name (imported stat-block actions often have none). */
function withOptionIds<T extends { id: string }>(list: T[], prefix: string): T[] {
  return list.map((a, i) => (a.id ? a : { ...a, id: `${prefix}-${i}` }));
}

/** Token fields a non-DM may change with `updateToken` (on a token they control). */
const PLAYER_TOKEN_FIELDS = new Set([
  'x', 'y', 'label', 'color', 'imageUrl', 'size', 'cover', 'currentHp', 'maxHp', 'tempHp', 'armorClass',
]);

export class Room {
  state: RoomState;
  private file: string;
  private bestiaryFile: string;

  constructor(file: string, bestiaryFile: string) {
    this.file = file;
    this.bestiaryFile = bestiaryFile;
    this.state = this.load();
    this.state.bestiary = this.loadBestiary();
    this.savedBestiary = this.state.bestiary; // just read from disk — nothing to rewrite until it changes
  }

  private load(): RoomState {
    try {
      if (existsSync(this.file)) {
        const raw = JSON.parse(readFileSync(this.file, 'utf8')) as RoomState;
        const migrated = migrateRoom(raw);
        if (migrated) {
          migrated.participants.forEach((p) => (p.connected = false));
          migrated.sheets = migrated.sheets.map(normalizeSheet);
          migrated.homebrew ??= []; // added after schema 6 — no version bump needed, just default it in
          for (const scene of migrated.scenes ?? []) {
            scene.zones ??= []; // added after schema 6 — default before aliasing, so `state.zones` isn't left undefined
            scene.tokens.forEach((t) => {
              t.effects ??= [];
              t.concentration ??= null;
              t.turnAnchor ??= null;
              t.extraMove ??= 0;
            });
          }
          syncSceneAliases(migrated);
          return migrated;
        }
        console.warn(`Room schema ${raw.version} unsupported; starting fresh.`);
      }
    } catch (err) {
      console.error('Failed to load room file, starting fresh:', err);
    }
    return createRoomState();
  }

  private loadBestiary(): Statblock[] {
    try {
      if (existsSync(this.bestiaryFile)) {
        const raw = JSON.parse(readFileSync(this.bestiaryFile, 'utf8'));
        if (Array.isArray(raw)) return raw as Statblock[];
        if (Array.isArray(raw?.bestiary)) return raw.bestiary as Statblock[];
      }
    } catch (err) {
      console.error('Failed to load bestiary file:', err);
    }
    return [];
  }

  /** Bestiary array last written to disk — it is large and changes only on an explicit edit (every
   *  bestiary action assigns a NEW array), so identity tells us when a rewrite is actually needed. */
  private savedBestiary: Statblock[] | null = null;

  /** Write via a temp file + rename so a crash mid-write can never leave a truncated JSON behind;
   *  falls back to an in-place write if the rename is refused (e.g. an antivirus lock on Windows). */
  private writeAtomic(file: string, json: string): void {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    try {
      writeFileSync(tmp, json);
      renameSync(tmp, file);
    } catch {
      writeFileSync(file, json);
    }
  }

  save(): void {
    try {
      // room.json never carries the bestiary (its own file); `map` / `tokens` / `zones`
      // are just live aliases of the active scene, so they're not persisted either.
      const { bestiary, map, tokens, zones, ...room } = this.state;
      void bestiary;
      void map;
      void tokens;
      void zones;
      this.writeAtomic(this.file, JSON.stringify(room));
    } catch (err) {
      console.error('Failed to persist room:', err);
    }
    if (this.savedBestiary !== this.state.bestiary) {
      try {
        this.writeAtomic(this.bestiaryFile, JSON.stringify(this.state.bestiary));
        this.savedBestiary = this.state.bestiary;
      } catch (err) {
        console.error('Failed to persist bestiary:', err);
      }
    }
  }

  private touch(): void {
    this.syncLinkedAc();
    this.state.rev++;
  }

  private linkedSheet(token: Token) {
    return this.state.sheets.find((s) => s.tokenId === token.id);
  }

  /** Effective AC of a token: linked sheet (armor, unarmored defense, spell effects) or NPC AC + effects. */
  private tokenAc(token: Token): number {
    const sheet = this.linkedSheet(token);
    return sheet
      ? effectiveArmorClass(sheet, token.effects).ac
      : npcArmorClass(token.armorClass ?? 10, token.effects);
  }

  /** Keep the printed AC of sheet-linked tokens in step with their sheet (derived, never typed). */
  private syncLinkedAc(): void {
    for (const sheet of this.state.sheets) {
      if (!sheet.tokenId) continue;
      const tk = this.tokenAnywhere(sheet.tokenId);
      if (tk) tk.armorClass = effectiveArmorClass(sheet, tk.effects).ac;
    }
  }

  /** Copy a linked sheet's HP pools onto its token (sheet is the source of truth). */
  private mirrorSheetToToken(sheet: { tokenId?: string; currentHp: number; maxHp: number; tempHp: number }): void {
    if (!sheet.tokenId) return;
    const tk = this.tokenAnywhere(sheet.tokenId);
    if (!tk) return;
    tk.currentHp = sheet.currentHp;
    tk.maxHp = sheet.maxHp;
    tk.tempHp = sheet.tempHp;
  }

  private tempOf(token: Token): number {
    return this.linkedSheet(token)?.tempHp ?? token.tempHp ?? 0;
  }

  /** Damage lands on temp HP first, then HP. Sheet-linked tokens are handled on the sheet. */
  private applyDamage(token: Token, amount: number): { applied: number; absorbed: number } {
    const sheet = this.linkedSheet(token);
    let r: { hp: number; temp: number; absorbed: number; applied: number };
    if (sheet) {
      r = damageWithTempHp(sheet.currentHp, sheet.tempHp ?? 0, amount);
      sheet.currentHp = r.hp;
      sheet.tempHp = r.temp;
      this.mirrorSheetToToken(sheet);
    } else if (typeof token.currentHp === 'number') {
      r = damageWithTempHp(token.currentHp, token.tempHp ?? 0, amount);
      token.currentHp = r.hp;
      token.tempHp = r.temp;
    } else {
      return { applied: 0, absorbed: 0 };
    }
    // Armor of Agathys-style effects end with the temp HP that fuel them.
    if (r.temp <= 0 && token.effects?.some((e) => e.retaliate && !e.retaliate.always)) {
      token.effects = token.effects.filter((e) => !e.retaliate || e.retaliate.always);
    }
    // Wood Wose & co.: end when the bearer drops to 0 HP
    if (r.hp <= 0) this.endDownEffects(token, 'còn 0 HP');
    return { applied: r.applied, absorbed: r.absorbed };
  }

  /** Remove effects flagged `endsWhenDown` (Wood Wose) with a log line. */
  private endDownEffects(token: Token, why: string): void {
    const ending = (token.effects ?? []).filter((e) => e.endsWhenDown);
    if (ending.length === 0) return;
    token.effects = (token.effects ?? []).filter((e) => !e.endsWhenDown);
    for (const e of ending) {
      this.pushRoll({
        id: nanoid(8),
        ts: Date.now(),
        actorId: 'system',
        actorName: 'Hệ thống',
        label: `${token.label}: ${e.name} kết thúc (${why})`,
        result: externalRollResult('', { total: 0, faces: [] }),
      });
    }
  }

  private applyHeal(token: Token, heal: number): number {
    const sheet = this.linkedSheet(token);
    if (sheet) {
      const before = sheet.currentHp;
      sheet.currentHp = Math.min(sheet.maxHp, sheet.currentHp + heal);
      this.mirrorSheetToToken(sheet);
      return sheet.currentHp - before;
    }
    if (typeof token.currentHp !== 'number') return 0;
    const before = token.currentHp;
    token.currentHp =
      typeof token.maxHp === 'number' ? Math.min(token.maxHp, token.currentHp + heal) : token.currentHp + heal;
    return token.currentHp - before;
  }

  /** Armor of Agathys: a creature adjacent to the bearer that hit it takes the retaliation damage. */
  private retaliate(
    target: Token,
    attackerId: string | undefined,
    hadTemp: number,
    eff: ActiveEffect | undefined,
    attackRange: AttackRange | undefined,
    actor: Participant,
  ): void {
    if (!attackerId || !eff?.retaliate || (hadTemp <= 0 && !eff.retaliate.always)) return;
    if (attackRange === 'ranged') return; // only melee hits trigger it, even at point-blank range
    const attacker = this.state.tokens.find((t) => t.id === attackerId);
    if (!attacker || attacker.id === target.id) return;
    const span = (t: Token) => ({ tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 })[t.size] ?? 1;
    // Melee-tagged: allow reach weapons (10 ft). Untagged legacy attacks: adjacency only.
    const reach = attackRange === 'melee' ? 10 : 5;
    if (gridFeet(attacker, target) > reach * Math.max(span(attacker), span(target))) return;
    let rolled: number;
    try {
      rolled = rollNotation(eff.retaliate.dice).total;
    } catch {
      return;
    }
    const out = resolveDamageParts([{ part: { dice: eff.retaliate.dice, type: eff.retaliate.type }, raw: rolled }], this.effectiveDefenses(attacker));
    const dealt = this.applyDamage(attacker, out.totalFinal);
    this.pushRoll({
      id: nanoid(8),
      ts: Date.now(),
      actorId: actor.id,
      actorName: actor.name,
      label: `${eff.name}: ${attacker.label} bị phản ${out.totalFinal} ${eff.retaliate.type}`,
      result: externalRollResult(eff.retaliate.dice, { total: rolled, faces: [] }),
      damage: {
        targetTokenId: attacker.id,
        targetName: attacker.label,
        amount: dealt.applied,
        raw: out.totalRaw,
        damageType: eff.retaliate.type,
        notes: damageBreakdownNotes(out),
      },
    });
  }

  private facesOf(result: ReturnType<typeof rollNotation>): number[] {
    const faces: number[] = [];
    for (const term of result.terms) {
      if (term.rolls) for (const r of term.rolls) faces.push(r.value);
    }
    return faces;
  }

  private pushRoll(entry: RollLogEntry): void {
    this.state.rollLog.push(entry);
    if (this.state.rollLog.length > ROLL_LOG_CAP) {
      this.state.rollLog.splice(0, this.state.rollLog.length - ROLL_LOG_CAP);
    }
    this.state.diceTray.entries.push({
      id: nanoid(6),
      ts: entry.ts,
      actorName: entry.actorName,
      notation: entry.result.notation,
      faces: this.facesOf(entry.result),
      total: entry.result.total,
    });
    if (this.state.diceTray.entries.length > DICE_TRAY_CAP) {
      this.state.diceTray.entries.splice(
        0,
        this.state.diceTray.entries.length - DICE_TRAY_CAP,
      );
    }
  }

  /** Grapple attempt (2024 Unarmed Strike Grapple): the target rolls the better of its STR/DEX
   *  save vs `dc`; on a failure it gains the Grappled condition from this source. Shared by the
   *  standalone 'grapple' action and the Grappler feat's "Punch and Grab" (grapple-on-hit). */
  private applyGrappleAttempt(
    target: Token,
    dc: number,
    sourceSheetId: string | undefined,
    sourceTokenId: string | undefined,
    actor: Participant,
    label: string,
  ): void {
    const isMine = (e: ActiveEffect) =>
      (sourceSheetId && e.sourceSheetId === sourceSheetId) || (sourceTokenId && e.sourceTokenId === sourceTokenId);
    const strB = this.tokenSaveBonus(target, 'str');
    const dexB = this.tokenSaveBonus(target, 'dex');
    const ability: Ability = dexB > strB ? 'dex' : 'str';
    const { d20, total, pass, bonus } = this.rollTokenSave(target, ability, dc);
    this.pushRoll({
      id: nanoid(8),
      ts: Date.now(),
      actorId: actor.id,
      actorName: actor.name,
      label: `${label} → ${target.label}: ${ability.toUpperCase()} cứu ${total} vs DC ${dc} — ${
        pass ? 'THOÁT' : 'BỊ GHÌ'
      }`,
      result: externalRollResult(`1d20${bonus >= 0 ? '+' : ''}${bonus}`, { total, faces: [d20] }),
    });
    if (!pass && !(target.effects ?? []).some((e) => e.condition === 'grappled' && isMine(e))) {
      target.effects = [
        ...(target.effects ?? []),
        {
          id: nanoid(8),
          name: 'Bị ghì (Grapple)',
          sourceSheetId,
          sourceTokenId,
          condition: 'grappled',
          note: `Tốc độ 0. Thoát: action + kiểm tra STR (Athletics) hoặc DEX (Acrobatics) vs DC ${dc}`,
        },
      ];
    }
  }

  /** Roll every damage part (homebrew-crit each on a crit) using dddice totals
   *  where supplied, and synthesise a combined RollResult for the log. */
  /** Damage rolled once per AoE cast (`aoeId`), reused for every creature in the area. */
  /** Imported stat blocks keep "resistant to non-magical / non-silvered weapons" as a trait the server can't
   *  apply (it doesn't know what the weapon is made of). When physical damage hits such a creature, say so
   *  in the log so the DM can halve / zero it by hand. */
  private conditionalDefenseNote(target: Token, parts: DamagePart[]): string[] {
    const trait = target.statblock?.traits?.find((t) => t.name.startsWith('⚠ Kháng có điều kiện'));
    // Stat blocks imported with structured conditional defences are applied automatically.
    if (!trait || this.effectiveDefenses(target)?.conditional?.length) return [];
    const text = (trait.description ?? '').toLowerCase();
    const physical = parts.some((p) => ['bludgeoning', 'piercing', 'slashing'].includes(p.type) && text.includes(p.type));
    return physical ? [`⚠ Mục tiêu ${text} — DM tự trừ nếu vũ khí không đủ điều kiện`] : [];
  }

  /** A hit landed: disarm the one-shot riders whose damage parts it carried (Sneak Attack,
   *  Booming Blade, an armed Jaeger Finisher — which expends all held Momentum). Done here, after the hit
   *  is known, so a miss keeps them armed for the next swing (Extra Attack) instead of wasting them. */
  private consumeHitRiders(sheetId: string | undefined, parts: DamagePart[], actorId: string, isDm: boolean): void {
    if (!sheetId) return;
    const sheet = this.state.sheets.find((x) => x.id === sheetId);
    if (!sheet || (sheet.ownerId !== actorId && !isDm)) return;
    const has = (label: string) => parts.some((p) => p.label === label);
    if (sheet.sneakAttackArmed && has('Sneak Attack')) sheet.sneakAttackArmed = false;
    if (sheet.boomingBladeArmed && has('Booming Blade')) sheet.boomingBladeArmed = false;
    if (sheet.jaeger?.armedFinisher && (has('Brutal Finisher') || has('Chasing Finisher') || has('Opportunistic Shot'))) {
      sheet.jaeger = expendJaegerMomentum(sheet);
    }
  }

  private aoeRolls = new Map<string, ReturnType<Room['rollDamageParts']>>();

  private rollDamageParts(
    parts: DamagePart[],
    crit: boolean,
    externals: { total: number; faces: number[] }[] | undefined,
  ): { rolled: { part: DamagePart; raw: number }[]; combined: RollResult; notation: string } {
    const rolled: { part: DamagePart; raw: number }[] = [];
    const bits: string[] = [];
    const faces: number[] = [];
    parts.forEach((p, i) => {
      const n = crit ? homebrewCritDamage(p.dice) : p.dice;
      bits.push(n);
      const ext = externals?.[i];
      let raw: number;
      if (ext) {
        raw = ext.total;
        faces.push(...ext.faces);
      } else {
        const r = rollNotation(n);
        raw = r.total;
        faces.push(...diceFacesOf(r));
      }
      rolled.push({ part: p, raw });
    });
    const total = rolled.reduce((s, r) => s + r.raw, 0);
    const notation = bits.join(' + ');
    return { rolled, notation, combined: externalRollResult(notation, { total, faces }) };
  }

  /** The currently active scene (its map / tokens are aliased on state). */
  private activeScene(): RoomState['scenes'][number] {
    return (
      this.state.scenes.find((s) => s.id === this.state.activeSceneId) ?? this.state.scenes[0]
    );
  }

  /** Find a token in any scene (a sheet may link a token on a scene that isn't active). */
  private tokenAnywhere(id: string): Token | undefined {
    for (const scene of this.state.scenes) {
      const t = scene.tokens.find((tk) => tk.id === id);
      if (t) return t;
    }
    return undefined;
  }

  /** A token's damage defences merged with anything its linked sheet grants (adamantine). */
  private effectiveDefenses(token: Token): Defenses | undefined {
    const sheet = this.state.sheets.find((s) => s.tokenId === token.id);
    const base = mergeDefenses(token.defenses, sheet ? derivedDefenses(sheet) : undefined);
    const fromEffects = [...new Set((token.effects ?? []).flatMap((e) => e.resist ?? []))];
    if (fromEffects.length === 0) return base;
    return mergeDefenses(base, { ...emptyDefenses(), resistances: fromEffects });
  }

  /** Saving-throw bonus for a token in one ability (linked sheet, else stat block, else 0). */
  private tokenSaveBonus(token: Token, ability: Ability): number {
    const sheet = this.state.sheets.find((s) => s.tokenId === token.id);
    if (sheet) {
      return (
        abilityMod(sheet.abilities[ability]) +
        (sheet.saveProficiencies.includes(ability) ? sheet.proficiencyBonus : 0)
      );
    }
    const sb = token.statblock;
    if (sb) {
      return (
        abilityMod(sb.abilities[ability]) +
        (sb.saveProficiencies.includes(ability) ? sb.proficiencyBonus : 0)
      );
    }
    return 0;
  }

  /** Roll a d20 save for a token (nat 20 auto-pass, nat 1 auto-fail — homebrew). `withCover`: the save
   *  is against an effect from another creature, so the token's cover adds to a DEX save (SRS §2.5). */
  private rollTokenSave(
    token: Token,
    ability: Ability,
    dc: number,
    withCover = false,
  ): { d20: number; total: number; pass: boolean; bonus: number } {
    const bonus =
      this.tokenSaveBonus(token, ability) + (withCover && ability === 'dex' ? coverDexSaveBonus(token.cover) : 0);
    const d20 = 1 + Math.floor(Math.random() * 20);
    const total = d20 + bonus;
    const pass = d20 === 20 ? true : d20 === 1 ? false : total >= dc;
    return { d20, total, pass, bonus };
  }

  /** The token id that a rider/effect source resolves to (for concentration). */
  private sourceTokenId(effect: Pick<ActiveEffect, 'sourceTokenId' | 'sourceSheetId'>): string | undefined {
    if (effect.sourceTokenId) return effect.sourceTokenId;
    if (effect.sourceSheetId) {
      return this.state.sheets.find((s) => s.id === effect.sourceSheetId)?.tokenId;
    }
    return undefined;
  }

  /** Drop `token`'s concentration: clear its marker and every concentration effect it placed. */
  private dropConcentration(token: Token, reason: string, actor?: Participant): void {
    if (!token.concentration) return;
    const spell = token.concentration.name;
    token.concentration = null;
    for (const t of this.state.tokens) {
      t.effects = (t.effects ?? []).filter(
        (e) => !(e.concentration && this.sourceTokenId(e) === token.id),
      );
    }
    this.pushRoll({
      id: nanoid(8),
      ts: Date.now(),
      actorId: actor?.id ?? 'system',
      actorName: actor?.name ?? 'Hệ thống',
      label: `${token.label}: mất tập trung — ${spell} (${reason})`,
      result: externalRollResult('', { total: 0, faces: [] }),
    });
  }

  /** After a token takes `damage`, roll a silent CON save to keep concentration. */
  private maybeBreakConcentration(token: Token, damage: number): void {
    if (!token.concentration || damage <= 0) return;
    const dc = concentrationDc(damage);
    const { d20, total, pass: kept, bonus } = this.rollTokenSave(token, 'con', dc);
    this.pushRoll({
      id: nanoid(8),
      ts: Date.now(),
      actorId: 'system',
      actorName: 'Hệ thống',
      label: `${token.label}: CON giữ tập trung ${total} vs DC ${dc} — ${
        kept ? 'giữ được' : `MẤT (${token.concentration.name})`
      }`,
      result: externalRollResult(`1d20${bonus >= 0 ? '+' : ''}${bonus}`, {
        total,
        faces: [d20],
      }),
    });
    if (!kept) this.dropConcentration(token, `thất bại CON save DC ${dc}`);
  }

  /** Flags that `tokenId` dealt damage this turn — checked at end-of-turn by
   *  `ActiveEffect.cursedNoHitSelfDamage` (Bracer of Brutality). Call after any damage that
   *  actually landed (`applied > 0`) with the attacking/casting token's id, if any. */
  private markDealtDamage(tokenId: string | undefined): void {
    if (!tokenId) return;
    const attacker = this.state.tokens.find((t) => t.id === tokenId);
    if (attacker) attacker.turnUsed = { ...attacker.turnUsed, dealtDamageThisTurn: true };
  }

  /**
   * Path of the Experiment's Reconstruction serum: spend 1 Hit Die of `e.hitDieHeal.die`, roll
   * it + CON mod, heal for the total (clamped to max HP, same formula as the plain "dùng Hit
   * Die" button — no temp-HP overflow). Called once immediately when the effect is applied
   * ("khi tiêm") and again every start-of-turn while it's active. Silently no-ops once Hit Dice
   * run out, rather than ending the effect — switching serum or leaving Rage still removes it.
   */
  private applyHitDieHealTick(token: Token, e: ActiveEffect): void {
    if (!e.hitDieHeal) return;
    const sheet = this.linkedSheet(token);
    if (!sheet) return;
    const die = e.hitDieHeal.die;
    const pool = hitDicePools(sheet).find((p) => p.die === die);
    if (!pool || pool.left <= 0) return;
    const spent = spendHitDie(sheet, die);
    if (!spent) return;
    sheet.hitDiceUsed = spent.hitDiceUsed;
    const conMod = abilityMod(sheet.abilities.con);
    let result: RollResult;
    try {
      result = rollNotation(`1d${die}${conMod >= 0 ? '+' : ''}${conMod}`);
    } catch {
      return;
    }
    const before = sheet.currentHp;
    sheet.currentHp = Math.min(sheet.maxHp, sheet.currentHp + Math.max(0, result.total));
    this.mirrorSheetToToken(sheet);
    this.pushRoll({
      id: nanoid(8),
      ts: Date.now(),
      actorId: 'system',
      actorName: 'Hệ thống',
      label: `${token.label}: ${e.name} → dùng Hit Die d${die}, +${sheet.currentHp - before} HP`,
      result,
    });
  }

  /** At a turn boundary: run "save ends" effects on `token` and clear expired ones. */
  private processTurnEffects(token: Token, phase: 'start-of-turn' | 'end-of-turn'): void {
    const round = this.state.initiative.round;
    const keep: ActiveEffect[] = [];
    if (phase === 'start-of-turn') token.turnUsed = undefined; // a new turn: Action / Bonus / Reaction available again
    const INCAPACITATING = ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'];
    if (tokenConditions(token).some((c) => INCAPACITATING.includes(c))) this.endDownEffects(token, 'mất khả năng hành động');
    if (phase === 'start-of-turn') {
      // Reconstruction: auto-heal via Hit Die at the start of each of the bearer's turns.
      for (const e of token.effects ?? []) this.applyHitDieHealTick(token, e);
      // Rampant Growth: temp HP at the start of each of the bearer's turns (never stacks)
      for (const e of token.effects ?? []) {
        if (!e.turnTempHp) continue;
        const sheet = this.linkedSheet(token);
        const before = this.tempOf(token);
        const next = grantTempHp(before, e.turnTempHp);
        if (next > before) {
          if (sheet) {
            sheet.tempHp = next;
            this.mirrorSheetToToken(sheet);
          } else token.tempHp = next;
        }
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: 'system',
          actorName: 'Hệ thống',
          label: `${token.label}: ${e.name} → ${next > before ? `HP tạm ${before} → ${next}` : `giữ ${before} HP tạm`}`,
          result: externalRollResult('', { total: e.turnTempHp, faces: [] }),
        });
      }
    }
    if (phase === 'end-of-turn') {
      // Bracer of Brutality: Necrotic self-damage if the bearer dealt no damage this turn —
      // unreduced (no resistance/immunity applied, straight to HP/temp HP).
      for (const e of token.effects ?? []) {
        if (!e.cursedNoHitSelfDamage || token.turnUsed?.dealtDamageThisTurn) continue;
        const sheet = this.linkedSheet(token);
        const mod = sheet ? abilityMod(sheet.abilities[e.cursedNoHitSelfDamage.ability]) : 0;
        const dmg = Math.max(1, mod);
        const took = this.applyDamage(token, dmg);
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: 'system',
          actorName: 'Hệ thống',
          label: `${token.label}: ${e.name} — không gây sát thương lượt này → chịu ${took.applied} Necrotic (nguyền)`,
          result: externalRollResult('', { total: dmg, faces: [] }),
        });
      }
    }
    for (const e of token.effects ?? []) {
      if (typeof e.expiresRound === 'number' && round >= e.expiresRound) {
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: 'system',
          actorName: 'Hệ thống',
          label: `${token.label}: hết hiệu ứng ${e.name}`,
          result: externalRollResult('', { total: 0, faces: [] }),
        });
        continue;
      }
      if (e.save && e.save.repeat === phase) {
        const { d20, total, pass, bonus } = this.rollTokenSave(token, e.save.ability, e.save.dc);
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: 'system',
          actorName: 'Hệ thống',
          label: `${token.label}: ${e.save.ability.toUpperCase()} cứu (${e.name}) ${total} vs DC ${e.save.dc} — ${
            pass ? 'THOÁT' : 'vẫn dính'
          }`,
          result: externalRollResult(`1d20${bonus >= 0 ? '+' : ''}${bonus}`, { total, faces: [d20] }),
        });
        if (pass) {
          if (e.concentration) {
            const srcId = this.sourceTokenId(e);
            const src = srcId && this.state.tokens.find((t) => t.id === srcId);
            if (src && src.concentration?.name === e.name) src.concentration = null;
          }
          continue;
        }
      }
      keep.push(e);
    }
    token.effects = keep;
  }

  /** A token's walking speed (ft): linked sheet, else stat block, else 30. Grappled → 0. */
  private tokenSpeed(token: Token): number {
    const sheet = this.state.sheets.find((s) => s.tokenId === token.id);
    return walkSpeed(sheet ? computeSpeed(sheet).speed : undefined, token.statblock?.speed, tokenIsGrappled(token));
  }

  /** After an initiative change: anchor the active token's position for the move tracker. */
  private syncTurnAnchors(): void {
    const active = this.state.initiative.entries.find((e) => e.isActive);
    for (const scene of this.state.scenes) {
      for (const t of scene.tokens) {
        if (this.state.initiative.running && active?.tokenId === t.id) {
          if (!t.turnAnchor) t.turnAnchor = { x: t.x, y: t.y };
        } else if (t.turnAnchor) {
          t.turnAnchor = null;
          t.extraMove = 0;
        }
      }
    }
  }

  /**
   * After a turn/round change: raise a `dmPrompt` if a legendary or lair action is available.
   * Lair actions fire once per round, the instant the active initiative count drops below 20
   * (matching "on initiative count 20, losing ties" without needing a fake count-20 entry).
   * Legendary actions fire whenever another creature's turn just ended and a legendary token —
   * neither the one whose turn just ended nor the one whose turn is now starting, since a
   * creature can never use legendary actions during its own turn — still has uses left this
   * round. Only one prompt shows at a time — lair wins the tie, since it's the rarer/more
   * consequential of the two; the DM can trigger the skipped legendary action again on the next
   * `initNext` if it's still relevant. `includeLegendary: false` from `initStart`: combat hasn't
   * had a first turn yet, so there's no "between turns" moment for a legendary action, only the
   * lair check (which can legitimately fire before anyone has acted, if nobody rolled 20+).
   */
  private checkDmPrompts(ctx?: { endingId?: string; prevActiveInit?: number; includeLegendary?: boolean }): void {
    if (this.state.dmPrompt) return; // don't clobber an unanswered prompt
    const init = this.state.initiative;
    if (!init.running) return;
    const alive = (t: Token) => typeof t.currentHp !== 'number' || t.currentHp > 0;
    const active = init.entries.find((e) => e.isActive);
    const activeInit = active?.initiative;

    // Lair action: crossed below count 20 this round (or the round opens already below 20).
    if (
      typeof activeInit === 'number' &&
      activeInit < 20 &&
      init.lastLairRound !== init.round &&
      (ctx?.prevActiveInit === undefined || ctx.prevActiveInit >= 20)
    ) {
      const lairToken = this.state.tokens.find((t) => t.statblock?.hasLairActions && alive(t));
      if (lairToken) {
        init.lastLairRound = init.round;
        this.state.dmPrompt = {
          kind: 'lairAction',
          tokenId: lairToken.id,
          tokenName: lairToken.label,
          options: withOptionIds(lairToken.statblock?.lairActions ?? [], 'lair'),
          round: init.round,
        };
        return;
      }
      init.lastLairRound = init.round; // no lair owner on the map — don't re-check all round
    }

    // Legendary action: any other legendary creature still has uses left this round.
    if (ctx?.includeLegendary === false) return;
    const legendaryToken = this.state.tokens.find(
      (t) =>
        t.id !== ctx?.endingId &&
        t.id !== active?.tokenId &&
        (t.legendaryActionsRemaining ?? 0) > 0 &&
        t.statblock?.legendaryActions?.length &&
        alive(t),
    );
    if (legendaryToken) {
      this.state.dmPrompt = {
        kind: 'legendaryAction',
        tokenId: legendaryToken.id,
        tokenName: legendaryToken.label,
        remaining: legendaryToken.legendaryActionsRemaining ?? 0,
        options: withOptionIds(legendaryToken.statblock?.legendaryActions ?? [], 'leg'),
        round: init.round,
      };
    }
  }

  /** Whether `actor` may move `token` right now, and (for players in combat) how far. */
  private moveGate(
    actor: Participant,
    token: Token,
    next: { x: number; y: number },
  ): { ok: true; pos: { x: number; y: number } } | { ok: false; msg: string } {
    if (actor.role === 'dm') return { ok: true, pos: next };
    if (!this.state.initiative.running) return { ok: true, pos: next };
    const active = this.state.initiative.entries.find((e) => e.isActive);
    if (!active || active.tokenId !== token.id) {
      return { ok: false, msg: 'Chưa tới lượt token này — không di chuyển được' };
    }
    const anchor = token.turnAnchor ?? { x: token.x, y: token.y };
    const budget = this.tokenSpeed(token) + (token.extraMove ?? 0);
    return { ok: true, pos: clampToRange(anchor, next, budget) };
  }

  /** Initiative modifier for a token: linked sheet, else stat block, else 0. */
  private tokenInitMod(token: RoomState['tokens'][number]): number {
    const sheet = this.state.sheets.find((s) => s.tokenId === token.id);
    if (sheet) return abilityMod(sheet.abilities.dex) + (sheet.initiativeMisc ?? 0);
    if (token.statblock) return token.statblock.initiativeMod;
    return 0;
  }

  /** Whether `actor` controls the combatant whose turn is currently active. */
  private actorOwnsActiveTurn(actor: Participant): boolean {
    const active = this.state.initiative.entries.find((e) => e.isActive);
    if (!active) return false;
    if (active.tokenId) {
      const token = this.state.tokens.find((t) => t.id === active.tokenId);
      if (token?.controllerId === actor.id) return true;
      if (this.state.sheets.some((s) => s.ownerId === actor.id && s.tokenId === active.tokenId)) {
        return true;
      }
    }
    return this.state.sheets.some((s) => s.ownerId === actor.id && s.name === active.name);
  }

  /** Add or update an initiative entry (matched by tokenId, else by name). */
  private upsertInitEntry(name: string, value: number, tokenId?: string): void {
    const init = this.state.initiative;
    const match = init.entries.find((e) =>
      tokenId ? e.tokenId === tokenId : !e.tokenId && e.name === name,
    );
    if (match) {
      match.initiative = value;
      match.name = name;
    } else {
      init.entries.push({
        id: nanoid(8),
        name,
        initiative: value,
        tokenId,
        isActive: false,
        hasGone: false,
      });
    }
    // Out of combat: keep the list sorted by initiative. In combat the list is
    // in turn (rotation) order, so a new roll just appends and acts at round end.
    if (!init.running) init.entries = sortInit(init.entries);
    markActive(init);
  }

  /** Apply an action from `actor`. Returns an error string or null. */
  apply(actor: Participant, action: ClientAction): string | null {
    const isDm = actor.role === 'dm';
    switch (action.t) {
      case 'join':
      case 'setName':
        // handled in index.ts (participant lifecycle)
        break;

      case 'setRole': {
        if (!isDm) return 'Chỉ DM được đổi vai trò';
        const target = this.state.participants.find((p) => p.id === action.participantId);
        if (!target) return 'Không tìm thấy người này trong phòng';
        if (target.role === 'dm' && action.role === 'player') {
          const dmCount = this.state.participants.filter((p) => p.role === 'dm').length;
          if (dmCount <= 1) return 'Phòng phải còn ít nhất 1 DM';
        }
        target.role = action.role;
        this.touch();
        break;
      }

      case 'damage': {
        const target = this.state.tokens.find((tk) => tk.id === action.targetTokenId);
        if (!target) return 'Không tìm thấy token mục tiêu';
        if (!action.damageParts?.length) return 'Không có nguồn sát thương';
        const dmgParts = [
          ...action.damageParts,
          ...targetRiderParts(target, {
            sheetId: action.attackerSheetId,
            tokenId: action.attackerTokenId,
          }),
        ];
        let rd;
        try {
          rd = this.rollDamageParts(dmgParts, false, action.external);
        } catch (err) {
          return (err as Error).message;
        }
        const out = resolveDamageParts(rd.rolled, this.effectiveDefenses(target));
        // A plain damage roll against a target is a hit the player resolved themselves.
        this.consumeHitRiders(action.attackerSheetId, dmgParts, actor.id, isDm);
        const took = this.applyDamage(target, out.totalFinal);
        const amount = took.applied;
        // "Dealt damage" includes what temp HP soaked up (a hit is a hit even if HP didn't move).
        if (amount + took.absorbed > 0) this.markDealtDamage(action.attackerTokenId);
        this.maybeBreakConcentration(target, out.totalFinal);
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label: action.label || 'Sát thương',
          result: rd.combined,
          damage: {
            targetTokenId: target.id,
            targetName: target.label,
            amount,
            raw: out.totalRaw,
            damageType: damagePartsSummary(dmgParts),
            notes: [
              ...(damageBreakdownNotes(out) ?? []),
              ...(took.absorbed ? [`HP tạm hấp thụ ${took.absorbed}`] : []),
              ...this.conditionalDefenseNote(target, dmgParts),
            ],
          },
        });
        this.touch();
        break;
      }

      case 'heal': {
        const target = this.state.tokens.find((tk) => tk.id === action.targetTokenId);
        if (!target) return 'Không tìm thấy token mục tiêu';
        let result: RollResult;
        if (typeof action.external === 'number') {
          result = externalRollResult(action.notation, { total: action.external, faces: [] });
        } else {
          try {
            result = rollNotation(action.notation);
          } catch (err) {
            return (err as Error).message;
          }
        }
        const heal = Math.max(0, result.total);
        const restored = this.applyHeal(target, heal);
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label: `${action.label} → ${target.label}: +${restored} HP`,
          result,
        });
        this.touch();
        break;
      }

      case 'grantTempHp': {
        const target = this.state.tokens.find((tk) => tk.id === action.targetTokenId);
        if (!target) return 'Không tìm thấy token mục tiêu';
        let result: RollResult;
        try {
          result =
            typeof action.external === 'number'
              ? externalRollResult(action.notation, { total: action.external, faces: [] })
              : rollNotation(action.notation);
        } catch (err) {
          return (err as Error).message;
        }
        const amount = Math.max(0, result.total);
        const sheet = this.linkedSheet(target);
        const before = this.tempOf(target);
        const next = grantTempHp(before, amount);
        if (sheet) {
          sheet.tempHp = next;
          this.mirrorSheetToToken(sheet);
        } else {
          target.tempHp = next;
        }
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label: `${action.label} → ${target.label}: ${next > before ? `HP tạm ${before} → ${next}` : `giữ ${before} HP tạm (không cộng dồn)`}`,
          result,
        });
        this.touch();
        break;
      }

      case 'levelUpOpen': {
        if (!isDm) return 'Chỉ DM được mở đợt thăng cấp';
        this.state.levelUp = { id: nanoid(8), ts: Date.now(), claimed: [] };
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: 'system',
          actorName: 'Hệ thống',
          label: '⬆ DM đã mở thăng cấp — người chơi bấm nút "Lên cấp" trên character sheet',
          result: externalRollResult('', { total: 0, faces: [] }),
        });
        this.touch();
        break;
      }

      case 'levelUpClose': {
        if (!isDm) return 'Chỉ DM được đóng đợt thăng cấp';
        this.state.levelUp = null;
        this.touch();
        break;
      }

      case 'levelUp': {
        const round = this.state.levelUp;
        if (!round) return 'Chưa có đợt thăng cấp nào đang mở';
        const sheet = this.state.sheets.find((x) => x.id === action.sheetId);
        if (!sheet) return 'Không tìm thấy nhân vật';
        if (sheet.ownerId !== actor.id && !isDm) return 'Bạn không sở hữu nhân vật này';
        if (round.claimed.includes(sheet.id)) return 'Nhân vật này đã lên cấp trong đợt này rồi';
        if (totalLevelOf(sheet) >= MAX_LEVEL) return `Đã đạt cấp tối đa (${MAX_LEVEL})`;
        const classIndex = Math.max(0, Math.min(sheetClasses(sheet).length - 1, action.classIndex ?? 0));
        const die = levelUpDie(sheet, classIndex);
        if (!die) return 'Nhân vật chưa chọn class có Hit Die — chọn class trước khi lên cấp';
        // Claim first (before any rolling) so a double click / race can never grant two levels.
        round.claimed = [...round.claimed, sheet.id];

        const pick = (ext: { total: number } | undefined): number => {
          // dddice reports its own totals; accept only a legal face of this die, else roll on the server.
          if (ext && Number.isInteger(ext.total) && ext.total >= 1 && ext.total <= die) return ext.total;
          return rollNotation(`1d${die}`).total;
        };
        const first = pick(action.external?.first);
        const second = needsPityReroll(first) ? pick(action.external?.second) : undefined;
        const hp = levelUpHp(die, sheet.abilities.con, first, second);

        const before = totalLevelOf(sheet);
        const grown = bumpLevel(sheet, classIndex);
        const leveled = normalizeSheet({ ...grown, maxHp: sheet.maxHp + hp.gain, currentHp: sheet.currentHp + hp.gain });
        this.state.sheets = this.state.sheets.map((x) => (x.id === leveled.id ? leveled : x));
        this.mirrorSheetToToken(leveled);

        const className = sheetClasses(leveled)[classIndex]?.name || leveled.className;
        const conTxt = `${hp.conMod >= 0 ? '+' : '−'}${Math.abs(hp.conMod)}`;
        const pityTxt = hp.second !== undefined ? ` — ra 1 → roll lại (luật pity): ${hp.second}` : '';
        const toughGain = (leveled.toughBonus ?? 0) - (sheet.toughBonus ?? 0);
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label: `⬆ ${leveled.name} lên cấp ${before} → ${before + 1} (${className}): d${die}=${hp.first}${pityTxt}, CON ${conTxt} → +${hp.gain} HP${toughGain > 0 ? ` (+${toughGain} Tough)` : ''} · tối đa ${leveled.maxHp}`,
          result: externalRollResult(`1d${die}${hp.conMod >= 0 ? '+' : ''}${hp.conMod}`, {
            total: hp.gain,
            faces: hp.second !== undefined ? [hp.first, hp.second] : [hp.first],
          }),
        });
        this.touch();
        break;
      }

      case 'spendHitDie': {
        const sheet = this.state.sheets.find((s) => s.id === action.sheetId);
        if (!sheet) return 'Không tìm thấy nhân vật';
        if (sheet.ownerId !== actor.id && !isDm) return 'Bạn không sở hữu nhân vật này';
        const spent = spendHitDie(sheet, action.die);
        if (!spent) return `Hết Hit Die d${action.die}`;
        const conMod = abilityModOf(sheet.abilities.con);
        let result: RollResult;
        try {
          result = rollNotation(`1d${action.die}${conMod >= 0 ? '+' : ''}${conMod}`);
        } catch (err) {
          return (err as Error).message;
        }
        sheet.hitDiceUsed = spent.hitDiceUsed;
        const before = sheet.currentHp;
        sheet.currentHp = Math.min(sheet.maxHp, sheet.currentHp + Math.max(0, result.total));
        this.mirrorSheetToToken(sheet);
        const pool = hitDicePools(sheet).find((p) => p.die === action.die);
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label: `${sheet.name}: dùng Hit Die d${action.die} → +${sheet.currentHp - before} HP (còn ${pool?.left ?? 0}/${pool?.max ?? 0})`,
          result,
        });
        this.touch();
        break;
      }

      case 'roll': {
        let result: RollResult;
        if (action.external) {
          result = externalRollResult(action.notation, action.external);
        } else {
          try {
            result = rollNotation(action.notation);
          } catch (err) {
            return (err as Error).message;
          }
        }
        // Homebrew: skill / ability / save checks crit on nat 20 and fail on nat 1.
        const checkNat = result.d20?.isCrit
          ? ('success' as const)
          : result.d20?.isFumble
            ? ('fail' as const)
            : undefined;
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label: action.label || 'Roll',
          result,
          checkNat,
          private: action.private && isDm ? true : undefined,
        });
        this.touch();
        break;
      }

      case 'attack': {
        const target = this.state.tokens.find((tk) => tk.id === action.targetTokenId);
        if (!target) return 'Target token not found';
        // Cover benefit is added to the target's AC automatically (homebrew).
        const baseAc = this.tokenAc(target);
        const cover = target.cover ?? 'none';
        const ac = baseAc + coverAcBonus(cover);
        let attackRoll: RollResult;
        if (action.external) {
          attackRoll = externalRollResult(action.attackNotation, action.external.attack);
        } else {
          try {
            attackRoll = rollNotation(action.attackNotation);
          } catch (err) {
            return (err as Error).message;
          }
        }
        const res = resolveAttack(attackRoll, ac);
        // Adamantine / crit-immune (token's own defences OR its linked sheet's
        // equipped gear): a crit lands as an ordinary hit.
        const def = this.effectiveDefenses(target);
        const critImmune = def?.critImmune ?? false;
        // Thin-auto: a paralyzed / unconscious target is auto-crit when hit.
        const attackerTok = action.attackerTokenId
          ? this.state.tokens.find((tk) => tk.id === action.attackerTokenId)
          : undefined;
        const autoCrit =
          res.hit &&
          conditionAutoCrit(tokenConditions(target), {
            range: action.attackRange,
            distanceFeet: attackerTok ? gridFeet(attackerTok, target) : undefined,
          });
        const effectiveCrit = (res.crit || autoCrit) && !critImmune;

        // Target-bound riders (Hex / Hunter's Mark placed on this token by the attacker).
        const dmgParts = [
          ...(action.damageParts ?? []),
          ...targetRiderParts(target, {
            sheetId: action.attackerSheetId,
            tokenId: action.attackerTokenId,
          }),
        ];

        let damageResult: RollResult | undefined;
        let outcome: MultiDamageOutcome | undefined;
        if (res.hit) {
          if (!dmgParts.length) return 'Không có nguồn sát thương';
          let rd;
          try {
            rd = this.rollDamageParts(dmgParts, effectiveCrit, action.external?.partTotals);
          } catch (err) {
            return (err as Error).message;
          }
          damageResult = rd.combined;
          outcome = resolveDamageParts(rd.rolled, def);
          this.consumeHitRiders(action.attackerSheetId, dmgParts, actor.id, isDm);
        }

        const coverNote =
          cover === 'total'
            ? ' · ⚠ mục tiêu che hoàn toàn'
            : cover !== 'none'
              ? ` · ${cover === 'half' ? 'nửa che' : '3/4 che'} (+${coverAcBonus(cover)} AC)`
              : '';

        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label: `${action.label || 'Attack'}${coverNote}`,
          result: attackRoll,
          attack: {
            targetTokenId: target.id,
            targetName: target.label,
            targetAc: ac,
            hit: res.hit,
            crit: effectiveCrit,
            fumble: res.fumble,
          },
        });
        if (damageResult && outcome) {
          const hadTemp = this.tempOf(target);
          const retEff = target.effects?.find((e) => e.retaliate); // captured before the temp HP (and effect) are used up
          const took = this.applyDamage(target, outcome.totalFinal);
          const applied = took.applied;
          // Temp HP soaking the hit still counts as dealing damage (Booming Blade, Bracers).
          const dealt = applied + took.absorbed;
          if (dealt > 0) this.markDealtDamage(action.attackerTokenId);
          // Booming Blade: a hit that carried the cantrip's Thunder rider (see `dmgParts`, tagged
          // by the client when the sheet has it armed) leaves the target primed — one Thunder hit
          // if it willingly moves before the caster's next turn (see `case 'updateToken'`).
          const boomingPart = dmgParts.find((p) => p.label === 'Booming Blade');
          if (dealt > 0 && boomingPart) {
            target.effects = [
              ...(target.effects ?? []),
              {
                id: nanoid(8),
                name: 'Booming Blade',
                sourceSheetId: action.attackerSheetId,
                sourceTokenId: action.attackerTokenId,
                boomingBladeMoveTrigger: { dice: boomingPart.dice },
                expiresRound: this.state.initiative.round + 1,
              },
            ];
          }
          this.maybeBreakConcentration(target, outcome.totalFinal);
          const critTag = effectiveCrit
            ? autoCrit && !res.crit
              ? ' (chí mạng — mục tiêu tê liệt/bất tỉnh)'
              : ' (chí mạng homebrew)'
            : res.crit && critImmune
              ? ' (chí mạng bị chặn — adamantine)'
              : '';
          this.pushRoll({
            id: nanoid(8),
            ts: Date.now(),
            actorId: actor.id,
            actorName: actor.name,
            label: `${action.label || 'Attack'} — sát thương${critTag}`,
            result: damageResult,
            damage: {
              targetTokenId: target.id,
              targetName: target.label,
              amount: applied,
              raw: outcome.totalRaw,
              damageType: damagePartsSummary(dmgParts),
              notes: [
                ...(damageBreakdownNotes(outcome) ?? []),
                ...(took.absorbed ? [`HP tạm hấp thụ ${took.absorbed}`] : []),
                ...this.conditionalDefenseNote(target, dmgParts),
              ],
            },
          });
          this.retaliate(target, action.attackerTokenId, hadTemp, retEff, action.attackRange, actor);
        }
        // Repelling Blast (2024): once on the attacker's own turn, push a hit target straight
        // away along the attacker→target line.
        if (res.hit && action.pushFeetOnHit && action.attackerTokenId) {
          const attacker = this.state.tokens.find((tk) => tk.id === action.attackerTokenId);
          if (attacker && !attacker.turnUsed?.repellingPush) {
            const dx = target.x - attacker.x;
            const dy = target.y - attacker.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.01) {
              const cells = action.pushFeetOnHit / FEET_PER_CELL;
              target.x = Math.max(0, Math.min(this.state.map.cols, target.x + (dx / dist) * cells));
              target.y = Math.max(0, Math.min(this.state.map.rows, target.y + (dy / dist) * cells));
              attacker.turnUsed = { ...attacker.turnUsed, repellingPush: true };
              this.pushRoll({
                id: nanoid(8),
                ts: Date.now(),
                actorId: actor.id,
                actorName: actor.name,
                label: `${action.label || 'Attack'} · Repelling Blast — đẩy ${target.label} ${action.pushFeetOnHit}ft`,
                result: externalRollResult('', { total: 0, faces: [] }),
              });
            }
          }
        }
        // Grappler feat "Punch and Grab" (2024): damage + grapple on the same hit.
        if (res.hit && action.grappleOnHit) {
          this.applyGrappleAttempt(
            target,
            action.grappleOnHit.dc,
            action.attackerSheetId,
            action.attackerTokenId,
            actor,
            action.label || 'Attack',
          );
        }
        this.touch();
        break;
      }

      case 'clearLog': {
        if (!isDm) return 'Chỉ DM được xóa nhật ký roll';
        this.state.rollLog = [];
        this.state.diceTray.entries = [];
        this.touch();
        break;
      }

      case 'updateMap': {
        if (!isDm) return 'Chỉ DM được sửa bản đồ';
        Object.assign(this.state.map, action.patch);
        this.activeScene().map = this.state.map;
        this.touch();
        break;
      }

      case 'sceneCreate': {
        if (!isDm) return 'Chỉ DM được tạo cảnh';
        const scene = {
          id: nanoid(8),
          name: action.name?.trim() || `Cảnh ${this.state.scenes.length + 1}`,
          map: defaultMap(action.name?.trim() || 'Bản đồ mới'),
          tokens: [],
          zones: [],
        };
        this.state.scenes.push(scene);
        this.state.activeSceneId = scene.id;
        syncSceneAliases(this.state);
        this.touch();
        break;
      }

      case 'sceneActivate': {
        if (!isDm) return 'Chỉ DM được đổi cảnh';
        if (!this.state.scenes.some((s) => s.id === action.id)) return 'Không tìm thấy cảnh';
        this.state.activeSceneId = action.id;
        syncSceneAliases(this.state);
        this.touch();
        break;
      }

      case 'sceneRename': {
        if (!isDm) return 'Chỉ DM được đổi tên cảnh';
        const scene = this.state.scenes.find((s) => s.id === action.id);
        if (!scene) return 'Không tìm thấy cảnh';
        scene.name = action.name.trim() || scene.name;
        this.touch();
        break;
      }

      case 'sceneDuplicate': {
        if (!isDm) return 'Chỉ DM được nhân bản cảnh';
        const src = this.state.scenes.find((s) => s.id === action.id);
        if (!src) return 'Không tìm thấy cảnh';
        const copy = {
          id: nanoid(8),
          name: `${src.name} (bản sao)`,
          map: { ...src.map },
          tokens: src.tokens.map((t) => ({ ...JSON.parse(JSON.stringify(t)), id: nanoid(8) })),
          zones: src.zones.map((z) => ({ ...z, id: nanoid(8) })),
        };
        this.state.scenes.push(copy);
        this.touch();
        break;
      }

      case 'sceneDelete': {
        if (!isDm) return 'Chỉ DM được xóa cảnh';
        if (this.state.scenes.length <= 1) return 'Phải còn ít nhất 1 cảnh';
        this.state.scenes = this.state.scenes.filter((s) => s.id !== action.id);
        if (!this.state.scenes.some((s) => s.id === this.state.activeSceneId)) {
          this.state.activeSceneId = this.state.scenes[0].id;
        }
        syncSceneAliases(this.state);
        this.touch();
        break;
      }

      case 'updateDddice': {
        if (!isDm) return 'Chỉ DM được cấu hình dddice';
        Object.assign(this.state.dddice, action.patch);
        this.touch();
        break;
      }

      case 'addToken': {
        // Anyone can add a token; a player becomes its controller so they can
        // move it, and it stays visible (only the DM can hide tokens).
        const token = createToken({
          ...action.token,
          hidden: isDm ? action.token.hidden ?? false : false,
          controllerId: isDm ? action.token.controllerId : actor.id,
        });
        this.state.tokens.push(token);
        this.touch();
        break;
      }

      case 'copyToken': {
        const src = this.state.tokens.find((tk) => tk.id === action.id);
        if (!src) return 'Token không tồn tại';
        if (!isDm && src.controllerId !== actor.id) return 'Bạn không điều khiển token này';
        this.state.tokens.push(
          createToken({
            label: src.label,
            x: action.x,
            y: action.y,
            size: src.size,
            color: src.color,
            imageUrl: src.imageUrl,
            armorClass: src.armorClass,
            currentHp: src.currentHp,
            maxHp: src.maxHp,
            hidden: isDm ? src.hidden : false,
            controllerId: isDm ? src.controllerId : actor.id,
            cover: src.cover,
            // deep copy so the two tokens track HP / actions independently
            statblock: src.statblock ? JSON.parse(JSON.stringify(src.statblock)) : undefined,
            defenses: src.defenses ? JSON.parse(JSON.stringify(src.defenses)) : undefined,
          }),
        );
        this.touch();
        break;
      }

      case 'updateToken': {
        const token = this.state.tokens.find((tk) => tk.id === action.id);
        if (!token) return 'Token không tồn tại';
        const canMove = isDm || token.controllerId === actor.id;
        if (!canMove) return 'Bạn không điều khiển token này';
        let patch = { ...action.patch };
        if (!isDm) {
          // A player may move and restyle a token they control, and keep its HP / cover; everything the
          // server uses for rules or turn bookkeeping (movement budget, effects, defences, statblock,
          // visibility, controller) is DM-only.
          patch = Object.fromEntries(
            Object.entries(patch).filter(([k]) => PLAYER_TOKEN_FIELDS.has(k)),
          ) as typeof patch;
        }
        // Movement tracker: on their turn a player can only move up to Speed
        // (+ Dash); off-turn moves in combat are blocked. The server clamps.
        const movingPos = typeof patch.x === 'number' || typeof patch.y === 'number';
        if (movingPos && !isDm) {
          const next = { x: patch.x ?? token.x, y: patch.y ?? token.y };
          const gate = this.moveGate(actor, token, next);
          if (!gate.ok) return gate.msg;
          patch.x = gate.pos.x;
          patch.y = gate.pos.y;
        }
        const beforeX = token.x;
        const beforeY = token.y;
        const linked = this.linkedSheet(token);
        if (linked) delete patch.armorClass; // derived from the sheet
        Object.assign(token, patch);
        if (linked) {
          if (typeof patch.currentHp === 'number') linked.currentHp = patch.currentHp;
          if (typeof patch.maxHp === 'number') linked.maxHp = patch.maxHp;
          if (typeof patch.tempHp === 'number') linked.tempHp = patch.tempHp;
        }
        // Booming Blade: this token actually changed position (a simplification of "willingly
        // moves" — see the field's doc comment) while primed from an earlier hit.
        if (movingPos && (token.x !== beforeX || token.y !== beforeY)) {
          const trig = token.effects?.find((e) => e.boomingBladeMoveTrigger);
          if (trig) {
            token.effects = (token.effects ?? []).filter((e) => e.id !== trig.id);
            let rolled = 0;
            try {
              rolled = rollNotation(trig.boomingBladeMoveTrigger!.dice).total;
            } catch {
              rolled = 0;
            }
            const out = resolveDamageParts(
              [{ part: { dice: trig.boomingBladeMoveTrigger!.dice, type: 'thunder' }, raw: rolled }],
              this.effectiveDefenses(token),
            );
            const took = this.applyDamage(token, out.totalFinal);
            this.pushRoll({
              id: nanoid(8),
              ts: Date.now(),
              actorId: 'system',
              actorName: 'Hệ thống',
              label: `${token.label}: Booming Blade — di chuyển → chịu ${took.applied} Thunder`,
              result: externalRollResult(trig.boomingBladeMoveTrigger!.dice, { total: out.totalFinal, faces: [] }),
            });
          }
        }
        this.touch();
        break;
      }

      case 'resetTokenMove': {
        const token = this.state.tokens.find((tk) => tk.id === action.id);
        if (!token) return 'Token không tồn tại';
        if (!isDm && token.controllerId !== actor.id) return 'Bạn không điều khiển token này';
        if (token.turnAnchor) {
          token.x = token.turnAnchor.x;
          token.y = token.turnAnchor.y;
          this.touch();
        }
        break;
      }

      case 'tokenDash': {
        const token = this.state.tokens.find((tk) => tk.id === action.id);
        if (!token) return 'Token không tồn tại';
        if (!isDm && token.controllerId !== actor.id) return 'Bạn không điều khiển token này';
        token.extraMove = (token.extraMove ?? 0) + this.tokenSpeed(token);
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label: `${token.label}: Dash (+${this.tokenSpeed(token)} ft di chuyển lượt này)`,
          result: externalRollResult('', { total: 0, faces: [] }),
        });
        this.touch();
        break;
      }

      case 'removeToken': {
        const target = this.state.tokens.find((tk) => tk.id === action.id);
        if (target && !isDm && target.controllerId !== actor.id) {
          return 'Bạn chỉ xóa được token của mình';
        }
        // Mutate in place so the active-scene alias stays valid.
        const idx = this.state.tokens.findIndex((tk) => tk.id === action.id);
        if (idx >= 0) this.state.tokens.splice(idx, 1);
        this.state.initiative.entries = this.state.initiative.entries.filter(
          (e) => e.tokenId !== action.id,
        );
        for (const sh of this.state.sheets) if (sh.tokenId === action.id) sh.tokenId = undefined;
        this.touch();
        break;
      }

      case 'zoneUpsert': {
        if (!isDm) return 'Chỉ DM được sửa vùng bản đồ';
        const idx = this.state.zones.findIndex((z) => z.id === action.zone.id);
        // Mutate in place (index assign / push) so the active-scene alias stays valid.
        if (idx >= 0) this.state.zones[idx] = action.zone;
        else this.state.zones.push(action.zone);
        this.touch();
        break;
      }

      case 'zoneRemove': {
        if (!isDm) return 'Chỉ DM được xóa vùng bản đồ';
        const idx = this.state.zones.findIndex((z) => z.id === action.id);
        if (idx >= 0) this.state.zones.splice(idx, 1);
        this.touch();
        break;
      }

      case 'applyEffect': {
        const target = this.state.tokens.find((tk) => tk.id === action.targetTokenId);
        if (!target) return 'Không tìm thấy token mục tiêu';
        const eff = action.effect;
        const ownsSheet =
          eff.sourceSheetId &&
          this.state.sheets.some((s) => s.id === eff.sourceSheetId && s.ownerId === actor.id);
        const ownsToken =
          eff.sourceTokenId &&
          this.state.tokens.find((t) => t.id === eff.sourceTokenId)?.controllerId === actor.id;
        if (!isDm && !ownsSheet && !ownsToken) {
          return 'Bạn chỉ áp hiệu ứng từ nhân vật / token của mình';
        }
        const effect: ActiveEffect = { ...eff, id: nanoid(8) };
        if (effect.concentration) {
          const srcId = this.sourceTokenId(effect);
          const src = srcId && this.state.tokens.find((t) => t.id === srcId);
          if (src) {
            this.dropConcentration(src, `chuyển sang ${effect.name}`, actor);
            src.concentration = { name: effect.name, since: this.state.initiative.round };
          }
        }
        target.effects = [...(target.effects ?? []), effect];
        // Reconstruction: "khi tiêm & đầu mỗi lượt" — the start-of-turn loop covers the
        // recurring half, this covers the immediate one-shot heal on injection.
        if (effect.hitDieHeal) this.applyHitDieHealTick(target, effect);
        if (effect.condition && ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'].includes(effect.condition)) {
          this.endDownEffects(target, effect.name);
        }
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label: `${target.label} chịu hiệu ứng: ${effect.name}`,
          result: externalRollResult('', { total: 0, faces: [] }),
        });
        this.touch();
        break;
      }

      case 'setTurnUsed': {
        const token = this.state.tokens.find((tk) => tk.id === action.tokenId);
        if (!token) return 'Token không tồn tại';
        if (!isDm && token.controllerId !== actor.id) return 'Bạn không điều khiển token này';
        const next = { ...(token.turnUsed ?? {}), ...action.patch };
        // Any truthy field (not just the original action/bonus/reaction/attacks) means the
        // tracker is meaningful — a hardcoded field list here silently drops newer fields
        // (e.g. unarmedChoice) the moment they're the only thing set.
        const hasAnyUsed = Object.values(next).some((v) => v);
        token.turnUsed = hasAnyUsed ? next : undefined;
        this.touch();
        break;
      }

      case 'resetTurnUsed': {
        const token = this.state.tokens.find((tk) => tk.id === action.tokenId);
        if (!token) return 'Token không tồn tại';
        if (!isDm && token.controllerId !== actor.id) return 'Bạn không điều khiển token này';
        token.turnUsed = undefined;
        this.touch();
        break;
      }

      case 'removeEffect': {
        const token = this.state.tokens.find((tk) => tk.id === action.tokenId);
        if (!token) return 'Token không tồn tại';
        const effect = (token.effects ?? []).find((e) => e.id === action.effectId);
        if (!effect) return null;
        const ownsSource =
          (effect.sourceSheetId &&
            this.state.sheets.some(
              (s) => s.id === effect.sourceSheetId && s.ownerId === actor.id,
            )) ||
          (effect.sourceTokenId &&
            this.state.tokens.find((t) => t.id === effect.sourceTokenId)?.controllerId ===
              actor.id) ||
          token.controllerId === actor.id;
        if (!isDm && !ownsSource) return 'Bạn không gỡ được hiệu ứng này';
        token.effects = (token.effects ?? []).filter((e) => e.id !== action.effectId);
        if (effect.concentration) {
          const srcId = this.sourceTokenId(effect);
          const src = srcId && this.state.tokens.find((t) => t.id === srcId);
          if (src && src.concentration?.name === effect.name) src.concentration = null;
        }
        this.touch();
        break;
      }

      case 'clearConcentration': {
        const token = this.state.tokens.find((tk) => tk.id === action.tokenId);
        if (!token) return 'Token không tồn tại';
        if (!isDm && token.controllerId !== actor.id) {
          return 'Bạn chỉ hủy tập trung của token mình';
        }
        this.dropConcentration(token, 'tự hủy', actor);
        this.touch();
        break;
      }

      case 'grapple': {
        const target = this.state.tokens.find((tk) => tk.id === action.targetTokenId);
        if (!target) return 'Không tìm thấy token mục tiêu';
        const ownsSource =
          (action.sourceSheetId &&
            this.state.sheets.some(
              (s) => s.id === action.sourceSheetId && s.ownerId === actor.id,
            )) ||
          (action.sourceTokenId &&
            this.state.tokens.find((t) => t.id === action.sourceTokenId)?.controllerId ===
              actor.id);
        if (!isDm && !ownsSource) return 'Bạn chỉ vật lộn từ nhân vật của mình';

        const isMine = (e: ActiveEffect) =>
          (action.sourceSheetId && e.sourceSheetId === action.sourceSheetId) ||
          (action.sourceTokenId && e.sourceTokenId === action.sourceTokenId);

        if (action.release) {
          const had = (target.effects ?? []).some(
            (e) => (e.condition === 'grappled' || /grapple|bị ghì/i.test(e.name)) && isMine(e),
          );
          target.effects = (target.effects ?? []).filter(
            (e) => !((e.condition === 'grappled' || /grapple|bị ghì/i.test(e.name)) && isMine(e)),
          );
          if (had) {
            this.pushRoll({
              id: nanoid(8),
              ts: Date.now(),
              actorId: actor.id,
              actorName: actor.name,
              label: `${action.label} — thả ${target.label}`,
              result: externalRollResult('', { total: 0, faces: [] }),
            });
          }
          this.touch();
          break;
        }

        this.applyGrappleAttempt(target, action.dc, action.sourceSheetId, action.sourceTokenId, actor, action.label);
        this.touch();
        break;
      }

      case 'spellSave': {
        const target = this.state.tokens.find((tk) => tk.id === action.targetTokenId);
        if (!target) return 'Không tìm thấy token mục tiêu';
        const ownsSource =
          (action.sourceSheetId &&
            this.state.sheets.some(
              (s) => s.id === action.sourceSheetId && s.ownerId === actor.id,
            )) ||
          (action.sourceTokenId &&
            this.state.tokens.find((t) => t.id === action.sourceTokenId)?.controllerId ===
              actor.id);
        if (!isDm && !ownsSource) return 'Bạn chỉ ra phép từ nhân vật của mình';
        const { d20, total, pass, bonus } = this.rollTokenSave(
          target,
          action.ability,
          action.dc,
          true,
        );
        const coverSave = action.ability === 'dex' ? coverDexSaveBonus(target.cover) : 0;
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label: `${action.label} → ${target.label}: ${action.ability.toUpperCase()} cứu ${total} vs DC ${action.dc}${
            coverSave ? ` (gồm +${coverSave} che chắn)` : ''
          } — ${pass ? 'THOÁT' : 'DÍNH'}`,
          result: externalRollResult(`1d20${bonus >= 0 ? '+' : ''}${bonus}`, {
            total,
            faces: [d20],
          }),
        });
        // Damage: full on a failed save, half on a success if `damageHalfOnSave`
        // (level 1+ AoE); 2024 cantrips deal nothing on a success.
        const takesDamage = action.damageOnFail?.length && (!pass ? true : !!action.damageHalfOnSave);
        if (takesDamage) {
          // AoE: damage is rolled ONCE and shared by every creature in the area.
          let rd = action.aoeId ? this.aoeRolls.get(action.aoeId) : undefined;
          if (!rd) {
            try {
              // A save effect (spell, breath) is never a mundane weapon attack: count it as magical
              // so "non-magical attacks" resistances don't apply.
              rd = this.rollDamageParts(
                action.damageOnFail!.map((p) => (p.traits ? p : { ...p, traits: ['magical' as const] })),
                false,
                undefined,
              );
            } catch (err) {
              return (err as Error).message;
            }
            if (action.aoeId) {
              this.aoeRolls.set(action.aoeId, rd);
              if (this.aoeRolls.size > 20) this.aoeRolls.delete(this.aoeRolls.keys().next().value!);
            }
          }
          const out = resolveDamageParts(rd.rolled, this.effectiveDefenses(target));
          const dealt = pass ? Math.floor(out.totalFinal / 2) : out.totalFinal;
          const took = this.applyDamage(target, dealt);
          const applied = took.applied;
          if (applied + took.absorbed > 0) this.markDealtDamage(action.sourceTokenId);
          this.pushRoll({
            id: nanoid(8),
            ts: Date.now(),
            actorId: actor.id,
            actorName: actor.name,
            label: `${action.label} — sát thương${pass ? ' (nửa, save thành công)' : ''}`,
            result: rd.combined,
            damage: {
              targetTokenId: target.id,
              targetName: target.label,
              amount: applied,
              raw: out.totalRaw,
              damageType: damagePartsSummary(action.damageOnFail!),
              notes: [...(damageBreakdownNotes(out) ?? []), ...(took.absorbed ? [`HP tạm hấp thụ ${took.absorbed}`] : [])],
            },
          });
          this.maybeBreakConcentration(target, dealt);
        }
        if (!pass && action.effectOnFail) {
          const effect: ActiveEffect = { ...action.effectOnFail, id: nanoid(8) };
          if (effect.concentration) {
            const srcId = this.sourceTokenId(effect);
            const src = srcId && this.state.tokens.find((t) => t.id === srcId);
            if (src && src.concentration?.name !== effect.name) {
              this.dropConcentration(src, `chuyển sang ${effect.name}`, actor);
              src.concentration = { name: effect.name, since: this.state.initiative.round };
            }
          }
          target.effects = [...(target.effects ?? []), effect];
        }
        this.touch();
        break;
      }

      case 'initSet': {
        if (!isDm) return 'Chỉ DM được sửa initiative';
        this.state.initiative.entries = sortInit(action.entries);
        this.touch();
        break;
      }

      case 'initRollAll': {
        if (!isDm) return 'Chỉ DM được tung initiative';
        const entries: InitiativeEntry[] = this.state.tokens.map((token) => {
          const roll = rollNotation(initNotation(this.tokenInitMod(token)));
          return {
            id: nanoid(8),
            name: token.label,
            initiative: roll.total,
            tokenId: token.id,
            isActive: false,
            hasGone: false,
          };
        });
        this.state.initiative.entries = sortInit(entries);
        this.state.initiative.round = 1;
        this.state.initiative.turnIndex = 0;
        this.state.initiative.running = entries.length > 0;
        markActive(this.state.initiative);
        this.syncTurnAnchors();
        this.touch();
        break;
      }

      case 'rollInitiative': {
        let { name, mod } = action;
        if (!isDm) {
          // A player rolls only for their own character: the entry must be their sheet's (by token or
          // by name), and the modifier comes from that sheet, not from the client.
          const mine = this.state.sheets.filter((s) => s.ownerId === actor.id);
          const sheet = action.tokenId
            ? mine.find((s) => s.tokenId === action.tokenId)
            : mine.find((s) => s.name === action.name);
          if (!sheet) return 'Chỉ tung initiative được cho nhân vật của bạn';
          name = sheet.name;
          mod = initiativeBonus(sheet);
        }
        let result: RollResult;
        if (action.external) {
          result = externalRollResult(`1d20${mod >= 0 ? '+' : ''}${mod}`, action.external);
        } else {
          result = rollNotation(initNotation(mod));
        }
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label: `${name} · Initiative`,
          result,
        });
        this.upsertInitEntry(name, result.total, action.tokenId);
        this.touch();
        break;
      }

      case 'rollInitiativeGroup': {
        if (!isDm) return 'Chỉ DM được tung initiative cho nhóm';
        for (const tokenId of action.tokenIds) {
          const token = this.state.tokens.find((tk) => tk.id === tokenId);
          if (!token) continue;
          // silent: no pushRoll, no dddice
          const total = rollNotation(initNotation(this.tokenInitMod(token))).total;
          this.upsertInitEntry(token.label, total, token.id);
        }
        this.touch();
        break;
      }

      case 'initStart': {
        if (!isDm) return 'Chỉ DM được bắt đầu initiative';
        this.state.initiative.running = this.state.initiative.entries.length > 0;
        this.state.initiative.round = 1;
        this.state.initiative.turnIndex = 0;
        this.state.initiative.lastLairRound = undefined;
        this.state.dmPrompt = null;
        for (const tk of this.state.tokens) {
          tk.turnUsed = undefined;
          tk.legendaryActionsRemaining = tk.statblock?.legendaryActionsPerRound ?? undefined;
        }
        markActive(this.state.initiative);
        this.syncTurnAnchors();
        this.checkDmPrompts({ includeLegendary: false });
        this.touch();
        break;
      }

      case 'initNext': {
        if (!isDm && !this.actorOwnsActiveTurn(actor)) {
          return 'Chỉ DM hoặc người đang tới lượt được kết thúc lượt';
        }
        const prevActiveInit = this.state.initiative.entries.find((e) => e.isActive)?.initiative;
        const endingId = this.state.initiative.entries.find((e) => e.isActive)?.tokenId;
        advanceTurn(this.state.initiative, 1);
        const startingId = this.state.initiative.entries.find((e) => e.isActive)?.tokenId;
        const ending = endingId && this.state.tokens.find((t) => t.id === endingId);
        if (ending) this.processTurnEffects(ending, 'end-of-turn');
        const starting = startingId && this.state.tokens.find((t) => t.id === startingId);
        if (starting) {
          if (starting.statblock?.legendaryActionsPerRound) {
            starting.legendaryActionsRemaining = starting.statblock.legendaryActionsPerRound;
          }
          this.processTurnEffects(starting, 'start-of-turn');
        }
        this.syncTurnAnchors();
        this.checkDmPrompts({ endingId, prevActiveInit });
        this.touch();
        break;
      }

      case 'initPrev': {
        if (!isDm) return 'Chỉ DM được lùi lượt';
        advanceTurn(this.state.initiative, -1);
        this.syncTurnAnchors();
        this.touch();
        break;
      }

      case 'initReset': {
        if (!isDm) return 'Chỉ DM được reset initiative';
        this.state.initiative = { entries: [], round: 1, turnIndex: 0, running: false };
        this.state.dmPrompt = null;
        for (const tk of this.state.tokens) {
          tk.turnUsed = undefined;
          tk.legendaryActionsRemaining = undefined;
        }
        this.syncTurnAnchors();
        this.touch();
        break;
      }

      case 'initSwapAdjacent': {
        const entries = this.state.initiative.entries;
        const i = entries.findIndex((e) => e.id === action.entryIdA);
        const j = entries.findIndex((e) => e.id === action.entryIdB);
        if (i < 0 || j < 0) return 'Không tìm thấy entry initiative';
        if (Math.abs(i - j) !== 1) return 'Chỉ đổi được 2 lượt liền kề nhau';
        const isPlayerEntry = (e: (typeof entries)[number]) =>
          !!e.tokenId && this.state.sheets.some((s) => s.tokenId === e.tokenId);
        if (!isPlayerEntry(entries[i]) || !isPlayerEntry(entries[j])) {
          return 'Chỉ đổi được lượt giữa 2 nhân vật người chơi, không được có quái chen giữa';
        }
        [entries[i], entries[j]] = [entries[j], entries[i]];
        // isActive travels with its entry object; turnIndex is a plain array index, so re-derive
        // it after reordering to keep pointing at whichever entry is actually flagged active.
        const activeIdx = entries.findIndex((e) => e.isActive);
        if (activeIdx >= 0) this.state.initiative.turnIndex = activeIdx;
        this.touch();
        break;
      }

      case 'dmPromptUse': {
        if (!isDm) return 'Chỉ DM được dùng legendary/lair action';
        const prompt = this.state.dmPrompt;
        if (!prompt) break;
        const chosen = action.actionId ? prompt.options.find((o) => o.id === action.actionId) : undefined;
        const cost = prompt.kind === 'legendaryAction' && chosen ? legendaryActionCost(chosen) : 1;
        if (prompt.kind === 'legendaryAction') {
          const token = this.state.tokens.find((t) => t.id === prompt.tokenId);
          const left = token?.legendaryActionsRemaining ?? 0;
          if (cost > left) return `Không đủ legendary action: cần ${cost}, còn ${left}`;
          if (token) token.legendaryActionsRemaining = left - cost;
        }
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label:
            prompt.kind === 'legendaryAction'
              ? `${prompt.tokenName} · Legendary Action${chosen ? ` — ${chosen.name}` : ''}${cost > 1 ? ` (−${cost})` : ''}`
              : `${prompt.tokenName} · Lair Action${chosen ? ` — ${chosen.name}` : ''}`,
          result: { notation: '', terms: [], total: 0 },
        });
        this.state.dmPrompt = null;
        this.checkDmPrompts();
        this.touch();
        break;
      }

      case 'dmPromptDismiss': {
        if (!isDm) return 'Chỉ DM được bỏ qua legendary/lair action';
        this.state.dmPrompt = null;
        this.touch();
        break;
      }

      case 'upsertSheet': {
        const existing = this.state.sheets.find((s) => s.id === action.sheet.id);
        if (existing && existing.ownerId !== actor.id && !isDm) {
          return 'Bạn không sở hữu character sheet này';
        }
        // Three-way merge against the copy the client started from: fields it didn't touch keep the
        // server's current value (damage, disarmed riders, level-up) instead of a stale draft's.
        const incoming = normalizeSheet({
          ...(existing && action.base ? mergeSheetEdit(existing, action.base, action.sheet) : action.sheet),
        });
        if (!existing) incoming.ownerId = incoming.ownerId || actor.id;
        // A token can back exactly one sheet, and NPC (stat-blocked) tokens can't
        // be linked to a character sheet — copy the token instead.
        if (incoming.tokenId && incoming.tokenId !== existing?.tokenId) {
          const tk = this.tokenAnywhere(incoming.tokenId);
          if (!tk) return 'Token không tồn tại';
          if (tk.statblock) {
            return 'Token này đã có stat block. Nhân bản token (kéo-thả) nếu cần token giống nhau.';
          }
          if (this.state.sheets.some((s) => s.id !== incoming.id && s.tokenId === incoming.tokenId)) {
            return 'Token này đã gán cho nhân vật khác. Nhân bản token nếu cần token giống nhau.';
          }
        }
        this.state.sheets = existing
          ? this.state.sheets.map((s) => (s.id === incoming.id ? incoming : s))
          : [...this.state.sheets, incoming];
        this.mirrorSheetToToken(incoming);
        this.touch();
        break;
      }

      case 'removeSheet': {
        const sheet = this.state.sheets.find((s) => s.id === action.id);
        if (!sheet) return null;
        if (sheet.ownerId !== actor.id && !isDm) return 'Bạn không sở hữu sheet này';
        this.state.sheets = this.state.sheets.filter((s) => s.id !== action.id);
        // Deleting the sheet should take its token off the map/initiative too — otherwise a
        // "ghost" token with no owning sheet lingers in combat (e.g. still shown on the init bar).
        if (sheet.tokenId) {
          const tIdx = this.state.tokens.findIndex((tk) => tk.id === sheet.tokenId);
          if (tIdx >= 0) this.state.tokens.splice(tIdx, 1);
          this.state.initiative.entries = this.state.initiative.entries.filter(
            (e) => e.tokenId !== sheet.tokenId,
          );
        }
        this.touch();
        break;
      }

      case 'bestiaryUpsert': {
        if (!isDm) return 'Chỉ DM được sửa bestiary';
        const existing = this.state.bestiary.find((s) => s.id === action.statblock.id);
        this.state.bestiary = existing
          ? this.state.bestiary.map((s) => (s.id === action.statblock.id ? action.statblock : s))
          : [...this.state.bestiary, action.statblock];
        this.touch();
        break;
      }

      case 'bestiaryRemove': {
        if (!isDm) return 'Chỉ DM được sửa bestiary';
        this.state.bestiary = this.state.bestiary.filter((s) => s.id !== action.id);
        this.touch();
        break;
      }

      case 'bestiaryReplaceAll': {
        if (!isDm) return 'Chỉ DM được sửa bestiary';
        if (!Array.isArray(action.entries)) return 'Dữ liệu bestiary không hợp lệ';
        this.state.bestiary = action.entries;
        this.touch();
        break;
      }

      case 'homebrewUpsert': {
        if (!isDm) return 'Chỉ DM được sửa homebrew';
        const existing = this.state.homebrew.find((h) => h.id === action.entry.id);
        this.state.homebrew = existing
          ? this.state.homebrew.map((h) => (h.id === action.entry.id ? action.entry : h))
          : [...this.state.homebrew, action.entry];
        this.touch();
        break;
      }

      case 'homebrewRemove': {
        if (!isDm) return 'Chỉ DM được sửa homebrew';
        this.state.homebrew = this.state.homebrew.filter((h) => h.id !== action.id);
        this.touch();
        break;
      }

      case 'spawnStatblock': {
        if (!isDm) return 'Chỉ DM được spawn NPC';
        const sb = this.state.bestiary.find((s) => s.id === action.id);
        if (!sb) return 'Không tìm thấy statblock';
        let hp = sb.maxHp;
        if (action.rollHp && sb.hpFormula) {
          try {
            hp = Math.max(1, rollNotation(sb.hpFormula).total);
          } catch {
            hp = sb.maxHp;
          }
        }
        this.state.tokens.push(
          createToken({
            label: sb.name,
            x: action.x,
            y: action.y,
            size: sb.size,
            color: sb.color,
            imageUrl: sb.imageUrl,
            armorClass: sb.ac,
            currentHp: hp,
            maxHp: hp,
            hidden: action.hidden ?? false,
            statblock: tokenStatblockFrom(sb),
            defenses: sb.defenses ? { ...sb.defenses } : undefined,
          }),
        );
        this.touch();
        break;
      }

      case 'placeSheetToken': {
        const sheet = this.state.sheets.find((s) => s.id === action.sheetId);
        if (!sheet) return 'Không tìm thấy nhân vật';
        if (!isDm && sheet.ownerId !== actor.id) return 'Bạn không sở hữu nhân vật này';
        // Only counts as "already placed" if the token is on the ACTIVE scene — a token left
        // behind on a different map doesn't get moved, a fresh one is placed here instead.
        const existing = sheet.tokenId ? this.state.tokens.find((tk) => tk.id === sheet.tokenId) : undefined;
        if (existing) {
          // Re-placing a token already on the map is a move: same combat gate as dragging it.
          const gate = this.moveGate(actor, existing, { x: action.x, y: action.y });
          if (!gate.ok) return gate.msg;
          existing.x = gate.pos.x;
          existing.y = gate.pos.y;
        } else {
          const owner = this.state.participants.find((p) => p.id === sheet.ownerId);
          const token = createToken({
            label: sheet.name,
            x: action.x,
            y: action.y,
            color: owner?.color ?? '#c0392b',
            controllerId: sheet.ownerId,
          });
          this.state.tokens.push(token);
          sheet.tokenId = token.id;
          this.mirrorSheetToToken(sheet);
          this.syncLinkedAc();
        }
        this.touch();
        break;
      }

      default: {
        const _exhaustive: never = action;
        return `Unknown action: ${JSON.stringify(_exhaustive)}`;
      }
    }
    return null;
  }
}

/** Bring an older room file up to the current schema, or null if unsupported. */
function migrateRoom(raw: RoomState): RoomState | null {
  const s = raw as RoomState & Record<string, unknown>;
  if (typeof s.version !== 'number') return null;

  // v1: pre-dddice, dev-only — not worth migrating.
  if (s.version === 1) return null;

  // v2 -> v3: character-sheet inventory / currency / AC override.
  // v3 -> v4: action economy, class resources, spell slots, feats, features.
  // v4 -> v5: bestiary (loaded from its own file) + token stat blocks.
  if (s.version >= 2 && s.version <= 4) {
    s.sheets = (s.sheets ?? []).map((sheet) => normalizeSheet(sheet));
    s.bestiary = [];
    s.version = 5;
  }

  // v5 -> v6: multi-scene. Wrap the single map + token list in "Cảnh 1".
  if (s.version === 5) {
    const legacyMap = (s.map as RoomState['map']) ?? defaultMap();
    legacyMap.snap ??= true;
    const scene = {
      id: nanoid(8),
      name: legacyMap.name || 'Cảnh 1',
      map: legacyMap,
      tokens: (s.tokens as RoomState['tokens']) ?? [],
      zones: [] as RoomState['zones'],
    };
    s.scenes = [scene];
    s.activeSceneId = scene.id;
    s.version = 6;
  }

  return s.version === SCHEMA_VERSION ? s : null;
}

/** Point `state.map` / `state.tokens` at the active scene's live objects. */
function syncSceneAliases(state: RoomState): void {
  if (!state.scenes || state.scenes.length === 0) {
    const scene = { id: nanoid(8), name: 'Cảnh 1', map: defaultMap(), tokens: [], zones: [] };
    state.scenes = [scene];
    state.activeSceneId = scene.id;
  }
  const active =
    state.scenes.find((s) => s.id === state.activeSceneId) ?? state.scenes[0];
  state.activeSceneId = active.id;
  state.map = active.map;
  state.tokens = active.tokens;
  state.zones = active.zones;
}

function initNotation(mod: number): string {
  return `1d20${mod >= 0 ? '+' : ''}${mod}`;
}

function damagePartsSummary(parts: DamagePart[]): string | undefined {
  const types = [...new Set(parts.map((p) => p.type).filter(Boolean))];
  if (types.length === 0) return undefined;
  return types.join(' + ');
}

/** Per-part breakdown lines for the roll log (only when it adds information). */
function damageBreakdownNotes(out: MultiDamageOutcome): string[] | undefined {
  const anyChange = out.parts.some((p) => p.raw !== p.final || p.notes.length);
  if (out.parts.length <= 1 && !anyChange) return undefined;
  return out.parts.map((p) => {
    if (p.raw === p.final && !p.notes.length) return `${p.label}: ${p.raw}`;
    return `${p.label}: ${p.raw} → ${p.final}${p.notes.length ? ` (${p.notes.join(', ')})` : ''}`;
  });
}

function sortInit(entries: InitiativeEntry[]): InitiativeEntry[] {
  return [...entries].sort((a, b) => b.initiative - a.initiative);
}

// Rotation model: entries[0] is the active combatant; ending a turn moves the
// front entry to the back. `turnIndex` counts turns taken in the current round.
function markActive(init: RoomState['initiative']): void {
  init.entries.forEach((e, i) => (e.isActive = i === 0 && init.running));
}

function advanceTurn(init: RoomState['initiative'], dir: 1 | -1): void {
  const n = init.entries.length;
  if (n === 0) return;
  init.running = true;

  if (dir === 1) {
    const done = init.entries.shift()!;
    done.hasGone = true;
    init.entries.push(done);
    init.turnIndex += 1;
    if (init.turnIndex >= n) {
      init.turnIndex = 0;
      init.round += 1;
      init.entries.forEach((e) => (e.hasGone = false));
    }
  } else {
    const back = init.entries.pop()!;
    init.entries.unshift(back);
    back.hasGone = false;
    if (init.turnIndex > 0) {
      init.turnIndex -= 1;
    } else if (init.round > 1) {
      init.round -= 1;
      init.turnIndex = n - 1;
    }
  }
  markActive(init);
}
