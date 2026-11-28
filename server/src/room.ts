import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { nanoid } from 'nanoid';
import { addShopPurchase, formatCp, payFromPurse, shopPriceCp } from '@dnd-table/shared';
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
  minDieBonus,
  rerollLowDice,
  rerollLowestDice,
  endWildShape,
  passiveHas,
  passiveReactions,
  passiveSaveAdvantage,
  passiveCheckFloor,
  exploredMark,
  auraSaveBonusFor,
  barbarianLevel,
  subclassUsesMax,
  resolveFeatureFormula,
  spellAttackBonus,
  hasStyle,
  shieldEquipped,
  hasProp,
  weaponInfo,
  expendJaegerMomentum,
  legendaryActionCost,
  legendaryInfo,
  legendaryOncePerTurn,
  d20Check,
  initiativeBonus,
  mergeSheetEdit,
  rollNotation,
  targetRiderParts,
  tokenConditions,
  tokenStatblockFrom,
  applyGodsBaneOp,
  baneAttackPenalty,
  baneMindSaveBonus,
  baneReducedDamage,
  baneStripLayer,
  baneTurnKey,
  bladeAttackHits,
  BLADE_DAMAGE,
  BLADE_INITIATIVE,
  BLADE_LABEL,
  BLADE_SPEED,
  findBladeToken,
  inBladeAura,
  insertInitiativeEntry,
  isDivineAttack,
  isGodsBaneRoomOp,
  sortInitiative,
  undyingOutcome,
  withDisadvantage,
  withinFiveFeet,
  type GodsBaneRoomOp,
  consumeCausality,
  forceD20,
  isGodsBaneAttack,
  markPeoplesWillUsed,
  normalizeGodsBane,
  peoplesWillDamage,
  type BaneTag,
  type ConditionType,
  type GodsBaneState,
  type Ability,
  type ActiveEffect,
  type AttackRange,
  type ClientAction,
  type DamagePart,
  type Defenses,
  type InitiativeEntry,
  type MultiDamageOutcome,
  type Participant,
  type ReactPrompt,
  type RollLogEntry,
  type RollResult,
  type RoomState,
  type Statblock,
  type Token,
  actionLimit,
  rechargeSucceeds,
  exhaustionPenalty,
  saveBonus,
  madnessEffect,
  madnessDuration,
  expireMadness,
  madnessEscalation,
  fmtDuration,
  MADNESS_TIER_VI,
  type MadnessTables,
  type CharacterSheet,
  type MadnessTier,
  effectSaveAdvantage,
  passiveRangedCover,
  type RollMode,
  type RollFx,
  DOWNED_EFFECT_NAME,
  freshDeathSaves,
  onDamageWhileDown,
  onDrop,
  rollDeathSave,
  rollsDeathSaves,
  type DeathSaves,
  meleeReach,
  opportunityReactors,
  edgeFeet,
  tokenSpan,
  passiveExtraAttackOnCritOrKill,
  aoeTokenIds,
  type Hazard,
  monsterMechanics,
  immuneConditions,
  mechanicSaveAdvantage,
  lightAt,
  activeLightRules,
  SCENE_LIGHTS,
  SCENE_LIGHT_VI,
  hasEvasion,
  critMin,
  mechanicAutoCrit,
  critExtraParts,
  onHitGrappleFor,
  lifestealFor,
  initiativeAdvantageWhy,
  acBonusByHp,
  sizeIndex,
  skillBonus,
  type MonsterMechanic,
  mechanicsOfKind,
  imposesAttackDisadvantage,
  regenSuppressed,
  actionAvailable,
  failCondition,
  statblockDamageParts,
  attackRangeOf,
} from '@dnd-table/shared';

/** Prompt options need an id the DM's pick can name (imported stat-block actions often have none). */
function withOptionIds<T extends { id: string }>(list: T[], prefix: string): T[] {
  return list.map((a, i) => (a.id ? a : { ...a, id: `${prefix}-${i}` }));
}

/** Token fields a non-DM may change with `updateToken` (on a token they control). */
const PLAYER_TOKEN_FIELDS = new Set([
  'x', 'y', 'label', 'color', 'imageUrl', 'size', 'cover', 'currentHp', 'maxHp', 'tempHp', 'armorClass', 'actionUses',
  // a torch they light, their own darkvision (dynamic fog)
  'lightSource', 'darkvision',
]);

/** Damage types plus attack traits (magical, silvered, moongilded…) of damage parts. */
const partTypes = (parts: { type?: string; traits?: string[] }[]): string[] =>
  [...new Set(parts.flatMap((p) => [p.type ?? '', ...(p.traits ?? [])]).filter(Boolean).map((x) => x.toLowerCase()))];

/** Interception taken before the roll: reduces the damage if the attack hits. */
interface Intercept {
  tokenId: string;
  by: string;
  dice: string;
}

/** The target's own damage cut taken before the roll (Uncanny Dodge halves, Deflect Attacks reduces). */
/** Defensive Duelist chosen before the roll: + AC against this attack. */
interface Parry {
  tokenId: string;
  by: string;
  ac: number;
}

interface SelfCut {
  tokenId: string;
  by: string;
  halve?: boolean;
  dice?: string;
}

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
          migrated.godsBane = normalizeGodsBane(migrated.godsBane); // optional homebrew block, absent = off
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
    this.processDowns();
    for (const t of this.state.tokens) if (t.stance && !t.effects?.some((e) => e.id === t.stance!.effectId)) this.stanceOff(t, 'hết thời hạn');
    this.syncLinkedAc();
    this.syncLightConditions();
    this.enforceConditionImmunity();
    // God's Bane undying / permanent-kill notes queued during damage, logged after the damage lines.
    for (const label of this.pendingBaneLogs.splice(0)) this.systemLog(label);
    this.state.rev++;
  }

  private pendingBaneLogs: string[] = [];

  private linkedSheet(token: Token) {
    return this.state.sheets.find((s) => s.tokenId === token.id);
  }

  /** Effective AC of a token: linked sheet (armor, unarmored defense, spell effects) or NPC AC + effects. */
  private tokenAc(token: Token): number {
    const sheet = this.linkedSheet(token);
    return sheet
      ? effectiveArmorClass(sheet, token.effects).ac
      : npcArmorClass(token.armorClass ?? 10, token.effects) + acBonusByHp(this.mechOf(token), token.currentHp);
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

  /**
   * Crusher / Slasher on a weapon hit (once per turn each): a bludgeoning hit pushes the target 5 ft, a
   * slashing hit cuts its speed by 10 ft until the attacker's next turn. On a crit, Crusher gives the
   * next attack against the target advantage and Slasher gives the target disadvantage on attacks.
   */
  private featHitEffects(action: Extract<ClientAction, { t: 'attack' }>, target: Token, attackerTok: Token | undefined, crit: boolean): void {
    if (!attackerTok || action.attackKind === 'spell') return;
    const sheet = this.linkedSheet(attackerTok);
    if (!sheet) return;
    const types = (action.damageParts ?? []).map((p) => (p.type || '').toLowerCase());
    const used = attackerTok.turnUsed?.featOnce ?? [];
    const mark = (k: string) => (attackerTok.turnUsed = { ...(attackerTok.turnUsed ?? {}), featOnce: [...(attackerTok.turnUsed?.featOnce ?? []), k] });
    const round = this.state.initiative.round;
    if (passiveHas(sheet, 'crusher') && types.includes('bludgeoning')) {
      if (!used.includes('crusher')) {
        mark('crusher');
        const fm = this.forceMove(target, attackerTok, 'push', 5);
        if (fm.feet) this.pendingBaneLogs.push(`🔨 Crusher: đẩy ${target.label} ${fm.feet} ft`);
      }
      if (crit) {
        target.effects = [...(target.effects ?? []), { id: nanoid(8), name: 'Crusher (chí mạng)', sourceTokenId: attackerTok.id, attackersAdvantage: true, untilSourceTurnStart: true, expiresRound: round + 1 } as ActiveEffect];
      }
    }
    if (passiveHas(sheet, 'slasher') && types.includes('slashing')) {
      if (!used.includes('slasher')) {
        mark('slasher');
        target.effects = [...(target.effects ?? []), { id: nanoid(8), name: 'Slasher', sourceTokenId: attackerTok.id, speedPenalty: 10, untilSourceTurnStart: true, expiresRound: round + 1 } as ActiveEffect];
        this.pendingBaneLogs.push(`🗡 Slasher: ${target.label} −10 ft tốc độ đến lượt kế của ${attackerTok.label}`);
      }
      if (crit) {
        target.effects = [...(target.effects ?? []), { id: nanoid(8), name: 'Slasher (chí mạng)', sourceTokenId: attackerTok.id, rollDisadvantage: ['attack'], untilSourceTurnStart: true, expiresRound: round + 1 } as ActiveEffect];
      }
    }
  }

  /** The best save aura (Aura of Protection) covering this token, from the characters on the map. */
  private auraSave(token: Token): { bonus: number; name: string } | null {
    const sources = this.state.sheets.flatMap((s) => {
      const t = s.tokenId ? this.state.tokens.find((x) => x.id === s.tokenId) : undefined;
      return t ? [{ sheet: s, token: t }] : [];
    });
    if (!sources.length) return null;
    return auraSaveBonusFor(token, sources, (a, b) => edgeFeet(a, tokenSpan(a), b, tokenSpan(b)), (a, b) => this.isPlayerSide(a) === this.isPlayerSide(b));
  }

  /** Effects an attack carries for a hit (Cunning Strike, Brutal Strike): each maybe behind a save. */
  private applyOnHit(list: NonNullable<Extract<ClientAction, { t: 'attack' }>['onHit']>, target: Token, attackerTok: Token | undefined): void {
    for (const o of list) {
      let failed = true;
      let note = '';
      if (o.save) {
        const s = this.rollTokenSave(target, o.save.ability, o.save.dc);
        failed = !s.pass;
        note = ` · ${o.save.ability.toUpperCase()} save ${s.total} vs DC ${o.save.dc}${s.modeNote} — ${s.pass ? 'đỗ' : 'TRƯỢT'}`;
      }
      if (failed && o.effect) target.effects = [...(target.effects ?? []), { ...o.effect, id: nanoid(8) }];
      if (failed && o.pushFeet && attackerTok) {
        const fm = this.forceMove(target, attackerTok, 'push', o.pushFeet);
        note += ` · đẩy ${fm.feet} ft`;
      }
      this.pendingBaneLogs.push(`✦ ${o.label}${note}${o.note ? ` · ${o.note}` : ''}`);
    }
  }

  /** A token that can't take actions or reactions right now. */
  private incapacitated(token: Token): boolean {
    return (token.effects ?? []).some((e) => e.condition && ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'].includes(e.condition));
  }

  /**
   * Relentless Rage: a raging Barbarian dropped to 0 HP makes a DC 10 CON save (+5 for each earlier
   * success, reset by a short or long rest) and on a success stays up at 2 × Barbarian level HP.
   */
  private relentlessRage(token: Token, sheet: CharacterSheet): boolean {
    if (!sheet.raging || !passiveHas(sheet, 'relentlessRage')) return false;
    const key = 'barb-relentless-rage';
    const times = sheet.subclassUses?.[key] ?? 0;
    const dc = 10 + 5 * times;
    const s = this.rollTokenSave(token, 'con', dc);
    if (!s.pass) {
      this.pendingBaneLogs.push(`🔥 ${sheet.name} · Relentless Rage: CON ${s.total} vs DC ${dc} — thất bại`);
      return false;
    }
    sheet.currentHp = 2 * barbarianLevel(sheet);
    sheet.subclassUses = { ...(sheet.subclassUses ?? {}), [key]: times + 1 };
    this.mirrorSheetToToken(sheet);
    this.pendingBaneLogs.push(`🔥 ${sheet.name} · Relentless Rage: CON ${s.total} vs DC ${dc} — trụ lại với ${sheet.currentHp} HP (lần sau DC ${dc + 5})`);
    return true;
  }

  /** Boon of Recovery: once per long rest, 0 HP becomes 1 HP plus half the maximum. */
  private lastStand(sheet: CharacterSheet): boolean {
    const key = 'boon-recovery-last-stand';
    if (!passiveHas(sheet, 'lastStand') || sheet.subclassUses?.[key]) return false;
    sheet.currentHp = Math.min(sheet.maxHp, 1 + Math.floor(sheet.maxHp / 2));
    sheet.subclassUses = { ...(sheet.subclassUses ?? {}), [key]: 1 };
    this.mirrorSheetToToken(sheet);
    this.pendingBaneLogs.push(`✨ ${sheet.name} · Boon of Recovery: trụ lại, hồi lên ${sheet.currentHp} HP`);
    return true;
  }

  /** Wild Shape changes the linked token's size; leaving the form puts the old size back. */
  private syncWildShapeSize(before: CharacterSheet | undefined, after: CharacterSheet): void {
    if (!after.tokenId) return;
    const tk = this.tokenAnywhere(after.tokenId);
    if (!tk) return;
    if (after.wildShape) {
      if (tk.size !== after.wildShape.size) tk.size = after.wildShape.size;
    } else if (before?.wildShape?.prev.size) {
      tk.size = before.wildShape.prev.size;
    }
  }

  private tempOf(token: Token): number {
    return this.linkedSheet(token)?.tempHp ?? token.tempHp ?? 0;
  }

  /** Damage lands on temp HP first, then HP. Sheet-linked tokens are handled on the sheet. */
  private applyDamage(token: Token, amount: number, opts?: { godsBane?: boolean; crit?: boolean; types?: string[] }): { applied: number; absorbed: number } {
    if (amount > 0 && opts?.types?.length) token.tookSinceTurn = [...new Set([...(token.tookSinceTurn ?? []), ...opts.types.map((x) => x.toLowerCase())])];
    if (token.godsBaneBlade) return { applied: 0, absorbed: 0 }; // the blade cannot be damaged
    const sheet = this.linkedSheet(token);
    const hpBefore = sheet ? sheet.currentHp : token.currentHp;
    let r: { hp: number; temp: number; absorbed: number; applied: number };
    if (sheet) {
      r = damageWithTempHp(sheet.currentHp, sheet.tempHp ?? 0, amount);
      sheet.currentHp = r.hp;
      sheet.tempHp = r.temp;
      this.mirrorSheetToToken(sheet);
      const throughTemp = amount - r.absorbed;
      if (sheet.currentHp <= 0 && (hpBefore ?? 0) > 0 && (this.relentlessRage(token, sheet) || this.lastStand(sheet))) {
        // stayed on its feet
      } else if (sheet.currentHp <= 0 && (hpBefore ?? 0) > 0) {
        if (sheet.wildShape) {
          // Wild Shape ends on 0 HP: the character's own numbers come back
          const size = sheet.wildShape.prev.size;
          this.pendingBaneLogs.push(`🐾 ${sheet.name}: hết Wild Shape (${sheet.wildShape.name}) — về 0 HP`);
          Object.assign(sheet, endWildShape(sheet));
          if (size) token.size = size;
        }
        sheet.deathSaves = onDrop(throughTemp - (hpBefore ?? 0), sheet.maxHp);
        this.setDowned(token, true);
        this.pendingBaneLogs.push(
          sheet.deathSaves.dead
            ? `☠ ${sheet.name} chết ngay (sát thương dư ≥ HP tối đa)`
            : `⚠ ${sheet.name} gục xuống 0 HP — bất tỉnh, tự tung death save đầu mỗi lượt`,
        );
      } else if ((hpBefore ?? 0) <= 0 && throughTemp > 0 && !sheet.deathSaves?.dead) {
        sheet.deathSaves = onDamageWhileDown(sheet.deathSaves, throughTemp, sheet.maxHp, !!opts?.crit);
        this.pendingBaneLogs.push(
          sheet.deathSaves.dead
            ? `☠ ${sheet.name} bị đánh khi đang gục — chết`
            : `${sheet.name} bị đánh khi đang gục → ${opts?.crit ? '2 lần' : '1 lần'} death save thất bại (${this.deathTally(sheet.deathSaves)})`,
        );
      }
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
    if (!sheet && amount > 0 && typeof hpBefore === 'number') this.undyingCheck(token, hpBefore, r.hp, !!opts?.godsBane);
    if (!sheet && typeof hpBefore === 'number' && hpBefore > 0 && r.hp <= 0 && !token.downedUndying) this.pendingDowns.push(token.id);
    if (!sheet && token.statblock && amount > 0) {
      const mechs = this.mechOf(token);
      const limb = mechanicsOfKind(mechs, 'limbs')[0];
      if (limb && amount > limb.loseOver && (token.limbs ?? limb.count) > 0) {
        token.limbs = (token.limbs ?? limb.count) - 1;
        this.pendingBaneLogs.push(`🦴 ${token.label}: ${limb.from} — mất một chi (còn ${token.limbs}/${limb.count})`);
      }
      const types = (opts?.types ?? []).map((x) => x.toLowerCase());
      // Aversion to Fire / Needles…: disadvantage until the end of its next turn
      for (const av of mechanicsOfKind(mechs, 'aversion')) {
        if (!types.includes(av.damageType) || r.hp <= 0) continue;
        const own = this.state.initiative.running && this.state.initiative.entries.find((e) => e.isActive)?.tokenId === token.id;
        const id = `aversion:${av.from ?? av.damageType}`;
        const had = token.effects?.some((e) => e.id === id);
        token.effects = [
          ...(token.effects ?? []).filter((e) => e.id !== id),
          { id, name: av.from ?? `Sợ ${av.damageType}`, rollDisadvantage: av.disadvantage, endsAfterOwnTurns: own ? 2 : 1, note: `bất lợi ${av.disadvantage.map((k) => (k === 'attack' ? 'đánh' : k === 'check' ? 'kiểm tra' : 'cứu')).join(', ')} đến hết lượt sau` },
        ];
        if (!had) this.pendingBaneLogs.push(`😖 ${token.label}: ${av.from} — dính ${av.damageType}, bất lợi đến hết lượt sau`);
      }
      if (token.stance?.endOn && types.includes(token.stance.endOn.type.toLowerCase()) && amount > token.stance.endOn.over) {
        this.stanceOff(token, `nhận hơn ${token.stance.endOn.over} sát thương ${token.stance.endOn.type}`);
      }
      if (!token.stance && r.hp > 0) {
        for (const st of mechanicsOfKind(mechs, 'stance')) {
          const fire =
            (st.trigger === 'onDamageType' && st.damageType && types.includes(st.damageType.toLowerCase())) ||
            (st.trigger === 'hpAtMost' && st.hpAtMost != null && r.hp <= st.hpAtMost);
          if (fire && !this.stanceOn(token, st, st.trigger === 'onDamageType' ? `dính ${st.damageType}` : `còn ≤ ${st.hpAtMost} HP`)) break;
        }
      }
    }
    if (amount > 0 && this.state.initiative.running && !this.offeringReactions) {
      this.offeringReactions = true;
      try {
        if (r.hp > 0) this.offerReactionsOf('selfDamaged', token, undefined, 'vừa nhận sát thương', { self: token });
        this.offerReactionsOf('allyDamaged', token, token, `${token.label} nhận sát thương`);
      } finally {
        this.offeringReactions = false;
      }
    }
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

  /** "✓✓○ ✗○○" tally for logs. */
  private deathTally(ds: DeathSaves | undefined): string {
    const s = ds?.success ?? 0;
    const f = ds?.fail ?? 0;
    return `${'✓'.repeat(s)}${'○'.repeat(3 - s)} ${'✗'.repeat(f)}${'○'.repeat(3 - f)}`;
  }

  /** Put on / take off the Unconscious "downed" effect of a character at 0 HP. */
  private setDowned(token: Token, down: boolean): void {
    const has = token.effects?.some((e) => e.name === DOWNED_EFFECT_NAME);
    if (down && !has) {
      token.effects = [
        ...(token.effects ?? []),
        { id: nanoid(8), name: DOWNED_EFFECT_NAME, condition: 'unconscious', note: 'Bất tỉnh ở 0 HP — death save đầu mỗi lượt' },
      ];
    } else if (!down && has) {
      token.effects = (token.effects ?? []).filter((e) => e.name !== DOWNED_EFFECT_NAME);
    }
  }

  /** After any HP change made outside damage/heal (sheet edit, long rest, token patch): keep the
   *  downed state and the death-save tally in step with the HP. */
  private syncDowned(sheet: CharacterSheet): void {
    const tk = sheet.tokenId ? this.tokenAnywhere(sheet.tokenId) : undefined;
    if (sheet.currentHp > 0) {
      if (sheet.deathSaves || tk?.effects?.some((e) => e.name === DOWNED_EFFECT_NAME)) {
        sheet.deathSaves = undefined;
        if (tk) this.setDowned(tk, false);
        this.systemLog(`💗 ${sheet.name} tỉnh lại (${sheet.currentHp} HP)`);
      }
    } else if (tk && !tk.effects?.some((e) => e.name === DOWNED_EFFECT_NAME)) {
      sheet.deathSaves ??= freshDeathSaves();
      this.setDowned(tk, true);
    }
  }

  /** Start of a downed character's turn: the death saving throw. */
  private deathSaveTick(token: Token): void {
    const sheet = this.linkedSheet(token);
    if (!sheet || !rollsDeathSaves(sheet.currentHp, sheet.deathSaves)) return;
    const adv = !!token.effects?.some((e) => e.deathSaveAdvantage) || passiveHas(sheet, 'deathSaveAdvantage');
    const a1 = 1 + Math.floor(Math.random() * 20);
    const a2 = 1 + Math.floor(Math.random() * 20);
    const d20 = adv ? Math.max(a1, a2) : a1;
    const r = rollDeathSave(sheet.deathSaves, d20);
    sheet.deathSaves = r.ds;
    const what =
      r.outcome === 'revive'
        ? 'nat 20 — hồi 1 HP, tỉnh lại!'
        : r.outcome === 'double-fail'
          ? 'nat 1 — 2 lần thất bại'
          : r.outcome === 'success'
            ? 'thành công'
            : 'thất bại';
    const tail = r.ds.dead ? ' → ☠ CHẾT' : r.ds.stable ? ' → ổn định (không tung nữa)' : '';
    this.pushRoll({
      id: nanoid(8),
      ts: Date.now(),
      actorId: 'system',
      actorName: 'Hệ thống',
      label: `☠ ${sheet.name}: death save ${r.total}${adv ? ` (lợi thế ${a1}/${a2})` : ''} — ${what} (${this.deathTally(r.ds)})${tail}`,
      result: externalRollResult('1d20', { total: r.total, faces: [d20] }),
    });
    if (r.outcome === 'revive') this.applyHeal(token, 1);
  }

  private applyHeal(token: Token, heal: number): number {
    const sheet = this.linkedSheet(token);
    if (sheet) {
      const before = sheet.currentHp;
      sheet.currentHp = Math.min(sheet.maxHp, sheet.currentHp + heal);
      this.mirrorSheetToToken(sheet);
      if (before <= 0 && sheet.currentHp > 0) this.syncDowned(sheet);
      return sheet.currentHp - before;
    }
    if (typeof token.currentHp !== 'number') return 0;
    const before = token.currentHp;
    token.currentHp =
      typeof token.maxHp === 'number' ? Math.min(token.maxHp, token.currentHp + heal) : token.currentHp + heal;
    if (token.currentHp > 0) token.downedUndying = undefined;
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
    out.totalFinal = this.baneReduce(attacker, target.id, out.totalFinal);
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
    if (eff.charges != null) this.spendEffectCharge(target, eff);
  }

  /** One use of a charged effect; it ends by itself when none are left. */
  private spendEffectCharge(token: Token, eff: ActiveEffect): void {
    const live = token.effects?.find((e) => e.id === eff.id);
    if (!live || live.charges == null) return;
    live.charges -= 1;
    if (live.note) live.note = live.note.replace(/còn \d+ lần/, `còn ${live.charges} lần`);
    if (live.charges > 0) return;
    token.effects = (token.effects ?? []).filter((e) => e.id !== live.id);
    this.systemLog(`${token.label}: ${live.name} hết lượt dùng — tự kết thúc`);
  }

  /** Start-of-turn damage from an effect. */
  private applyTurnDamage(token: Token, e: ActiveEffect): void {
    if (!e.turnDamage) return;
    let rolled: number;
    try {
      rolled = rollNotation(e.turnDamage.dice).total;
    } catch {
      return;
    }
    const out = resolveDamageParts([{ part: { dice: e.turnDamage.dice, type: e.turnDamage.type }, raw: rolled }], this.effectiveDefenses(token));
    const took = this.applyDamage(token, out.totalFinal);
    this.pushRoll({
      id: nanoid(8),
      ts: Date.now(),
      actorId: 'system',
      actorName: 'Hệ thống',
      label: `${token.label}: ${e.name} → ${out.totalFinal} ${e.turnDamage.type} đầu lượt`,
      result: externalRollResult(e.turnDamage.dice, { total: rolled, faces: [] }),
      damage: {
        targetTokenId: token.id,
        targetName: token.label,
        amount: took.applied,
        raw: out.totalRaw,
        damageType: e.turnDamage.type,
        notes: damageBreakdownNotes(out),
      },
    });
    this.maybeBreakConcentration(token, out.totalFinal);
  }

  // ---- God's Bane (homebrew party artifact, see shared/src/godsBane.ts). Every hook below returns early
  // unless the DM switched it on for this room, so other tables are unaffected. ----

  /** The God's Bane state while the feature is on, else undefined. */
  private godsBane(): GodsBaneState | undefined {
    return this.state.godsBane?.enabled ? this.state.godsBane : undefined;
  }

  /** A creature token's God's Bane tag — player-character (sheet-linked) tokens are never targets. */
  private baneTagOf(token: Token | undefined): BaneTag | undefined {
    if (!token || this.linkedSheet(token)) return undefined;
    return token.baneTag ?? undefined;
  }

  /** A system line in the log from outside an action (recording start / stop). */
  announce(label: string): void {
    this.systemLog(label);
    this.state.rev++;
  }

  private systemLog(label: string, actor?: { id: string; name: string }): void {
    this.pushRoll({
      id: nanoid(8),
      ts: Date.now(),
      actorId: actor?.id ?? 'system',
      actorName: actor?.name ?? 'Hệ thống',
      label,
      result: externalRollResult('', { total: 0, faces: [] }),
    });
  }

  /** Protection: damage from a tagged creature to a sworn, non-rejected PC is cut by N (per instance). */
  private baneReduce(target: Token, sourceTokenId: string | undefined, amount: number): number {
    const gb = this.godsBane();
    if (!gb || !sourceTokenId) return amount;
    const src = this.tokenAnywhere(sourceTokenId);
    const sheet = this.linkedSheet(target);
    const r = baneReducedDamage(gb, { targetSheetId: sheet?.id, sourceTag: this.baneTagOf(src) }, amount);
    if (r.reduced > 0) this.systemLog(`🛡 Lời thề nhân dân: ${target.label} chịu ít hơn ${r.reduced} sát thương (${amount} → ${r.final})`);
    return r.final;
  }

  /** Cleaving Causality armed for this d20: the sworn PC's own roll → natural 20, or (for an enemy roll)
   *  the first armed "enemy → natural 1". Consumes one pool point; returns a log note. */
  private causalityD20(side: { sheetId?: string; enemy: boolean }): { natural: 1 | 20; note: string } | undefined {
    const gb = this.godsBane();
    if (!gb?.armed?.length) return undefined;
    const pick = side.sheetId
      ? gb.armed.find((a) => a.sheetId === side.sheetId && a.mode === 'crit')
      : side.enemy
        ? gb.armed.find((a) => a.mode === 'fumble')
        : undefined;
    if (!pick) return undefined;
    this.state.godsBane = consumeCausality(gb, pick.sheetId, pick.mode);
    const who = this.state.sheets.find((x) => x.id === pick.sheetId)?.name ?? '?';
    const natural = pick.mode === 'crit' ? 20 : 1;
    return {
      natural,
      note: ` · ⚡ Cleaving Causality (${who}) → d20 tự nhiên ${natural} (quỹ còn ${this.state.godsBane.causality})`,
    };
  }

  /** The awakened blade's token on the active scene (feature on + awakened), else undefined. */
  private bladeToken(): Token | undefined {
    return findBladeToken(this.godsBane(), this.state.tokens);
  }

  /** The token a PC fights from: the attacker token, else the sheet's token on the active scene. */
  private attackerTokenOf(sheetId: string | undefined, tokenId: string | undefined): Token | undefined {
    if (tokenId) return this.state.tokens.find((t) => t.id === tokenId);
    const sheet = sheetId ? this.state.sheets.find((x) => x.id === sheetId) : undefined;
    return sheet?.tokenId ? this.state.tokens.find((t) => t.id === sheet.tokenId) : undefined;
  }

  /** Undying creatures: down (not dead) at 0 HP unless a God's Bane attack landed the killing blow. */
  private undyingCheck(token: Token, hpBefore: number, hpAfter: number, godsBane: boolean): void {
    if (!this.godsBane()) return;
    const o = undyingOutcome(token, hpBefore, hpAfter, godsBane);
    if (o === 'slain') {
      token.baneSlain = true;
      token.downedUndying = undefined;
      this.pendingBaneLogs.push(`☠ ${token.label} bị God's Bane hạ — chết vĩnh viễn${token.undying ? ' (bất diệt bị phá)' : ''}`);
    } else if (o === 'downed') {
      token.downedUndying = true;
      this.pendingBaneLogs.push(`💀 ${token.label} gục xuống nhưng BẤT DIỆT — chưa chết hẳn, sẽ hồi lại khi nghỉ dài (chỉ God's Bane giết vĩnh viễn được)`);
    }
  }

  /** Strip one divinity layer off a greatOne (3 per round cap while initiative runs). */
  private stripLayer(target: Token, actor: { id: string; name: string }, who: string): void {
    const round = this.state.initiative.running ? this.state.initiative.round : undefined;
    const patch = baneStripLayer(target, round);
    if (!patch) return;
    if (patch === 'capped') {
      this.systemLog(`🗡 ${target.label}: đã bóc đủ 3 tầng thần tính trong vòng này — không bóc thêm (${who})`, actor);
      return;
    }
    Object.assign(target, patch);
    this.systemLog(
      `🗡 ${who} bóc thần tính ${target.label}: tầng ${patch.baneLayers}${patch.baneStripCount ? ` (${patch.baneStripCount}/3 vòng này)` : ''}`,
      actor,
    );
  }

  /**
   * After damage / an attack by a PC resolved: People's Will force damage (sworn + non-rejected, from the
   * blade's aura or with the God's Bane weapon), one divinity layer off a greatOne, and — for a God's Bane
   * attack — the mortal flag on a hit.
   */
  private afterBaneAttack(
    target: Token,
    attacker: { sheetId?: string; tokenId?: string },
    withGodsBane: boolean,
    hit: boolean,
    actor: { id: string; name: string },
  ): void {
    const gb = this.godsBane();
    if (!gb) return;
    const tag = this.baneTagOf(target);
    if (!tag) return;
    const attackerSheetId = attacker.sheetId;
    const sheetName = this.state.sheets.find((x) => x.id === attackerSheetId)?.name ?? actor.name;
    const turnKey = baneTurnKey(this.state.initiative);
    const inAura = inBladeAura(gb, this.state.tokens, this.attackerTokenOf(attackerSheetId, attacker.tokenId));
    const will = peoplesWillDamage(gb, { attackerSheetId, targetTag: tag, hit, turnKey, inAura, withGodsBane });
    let stripped = false;
    if (will && attackerSheetId) {
      this.state.godsBane = markPeoplesWillUsed(gb, attackerSheetId, turnKey);
      // Straight to HP: no resistance / immunity / damage reduction applies.
      const took = this.applyDamage(target, will, { godsBane: withGodsBane });
      if (took.applied + took.absorbed > 0) this.maybeBreakConcentration(target, will);
      this.pushRoll({
        id: nanoid(8),
        ts: Date.now(),
        actorId: actor.id,
        actorName: actor.name,
        label: `✊ Ý chí nhân dân (${sheetName}${inAura ? ', trong hào quang God\'s Bane' : ", đòn God's Bane"}) → ${target.label}: +${will} Lực${hit ? '' : ' (dù trượt)'} — bỏ qua kháng/miễn`,
        result: externalRollResult(String(will), { total: will, faces: [] }),
        damage: { targetTokenId: target.id, targetName: target.label, amount: took.applied, raw: will, damageType: 'force' },
      });
      if (tag === 'greatOne') {
        this.stripLayer(target, actor, sheetName);
        stripped = true;
      }
    }
    if (withGodsBane && tag === 'greatOne') {
      if (!stripped) this.stripLayer(target, actor, `${sheetName} (God's Bane)`);
      if (hit && !target.baneMortal) {
        target.baneMortal = true;
        this.systemLog(`🗡 ${target.label}: BẤT TỬ BỊ PHÁ (có thể chết vĩnh viễn)`, actor);
      }
    }
  }

  /** Divine weapon vs a creature within 5 ft of the blade token: the attack has disadvantage. */
  private divineDisadvantage(target: Token, parts: DamagePart[] | undefined): boolean {
    const blade = this.bladeToken();
    return !!blade && blade.id !== target.id && isDivineAttack(parts) && withinFiveFeet(blade, target);
  }

  /** The blade's own attack (DM-triggered on its turn): 1d8, auto-hit + People's Will vs tagged creatures. */
  private bladeAttack(target: Token, actor: Participant): string | null {
    const gb = this.godsBane();
    const blade = this.bladeToken();
    if (!gb || !blade) return "God's Bane chưa thức tỉnh / chưa có token trên bản đồ";
    if (target.godsBaneBlade) return "God's Bane không thể tự đánh mình";
    const tag = this.baneTagOf(target);
    const notes: string[] = [];
    const active = this.state.initiative.running ? this.state.initiative.entries.find((e) => e.isActive) : undefined;
    if (active && active.tokenId !== blade.id) notes.push('⚠ không phải lượt God\'s Bane');
    if (!withinFiveFeet(blade, target)) notes.push('⚠ mục tiêu ngoài 5 ft');
    const ac = this.tokenAc(target) + coverAcBonus(target.cover ?? 'none');
    let roll: RollResult | undefined;
    if (!tag) roll = rollNotation('1d20');
    const res = bladeAttackHits(tag, roll, ac);
    this.pushRoll({
      id: nanoid(8),
      ts: Date.now(),
      actorId: actor.id,
      actorName: actor.name,
      label: `🗡 ${BLADE_LABEL} tấn công ${target.label}${res.auto ? ' — tự trúng (mục tiêu mang dấu)' : ` (+0 vs AC ${ac})`}${notes.length ? ` · ${notes.join(' · ')}` : ''}`,
      result: roll ?? externalRollResult('', { total: 0, faces: [] }),
      attack: res.auto
        ? undefined
        : { targetTokenId: target.id, targetName: target.label, targetAc: ac, hit: res.hit, crit: res.crit, fumble: !!roll?.d20?.isFumble },
    });
    if (res.hit) {
      const parts: DamagePart[] = [{ dice: BLADE_DAMAGE, type: 'force', label: BLADE_LABEL, traits: ['godsBane', 'magical'] }];
      const rd = this.rollDamageParts(parts, res.crit && !this.effectiveDefenses(target)?.critImmune, undefined);
      const out = resolveDamageParts(rd.rolled, this.effectiveDefenses(target));
      const took = this.applyDamage(target, out.totalFinal, { godsBane: true });
      this.maybeBreakConcentration(target, out.totalFinal);
      this.pushRoll({
        id: nanoid(8),
        ts: Date.now(),
        actorId: actor.id,
        actorName: actor.name,
        label: `🗡 ${BLADE_LABEL} — sát thương${res.crit ? ' (chí mạng homebrew)' : ''}`,
        result: rd.combined,
        damage: {
          targetTokenId: target.id,
          targetName: target.label,
          amount: took.applied,
          raw: out.totalRaw,
          damageType: 'force',
          notes: [...(damageBreakdownNotes(out) ?? []), ...(took.absorbed ? [`HP tạm hấp thụ ${took.absorbed}`] : [])],
        },
      });
    }
    if (tag && gb.will > 0) {
      const took = this.applyDamage(target, gb.will, { godsBane: true });
      if (took.applied + took.absorbed > 0) this.maybeBreakConcentration(target, gb.will);
      this.pushRoll({
        id: nanoid(8),
        ts: Date.now(),
        actorId: actor.id,
        actorName: actor.name,
        label: `✊ Ý chí nhân dân (đòn của ${BLADE_LABEL}) → ${target.label}: +${gb.will} Lực — bỏ qua kháng/miễn`,
        result: externalRollResult(String(gb.will), { total: gb.will, faces: [] }),
        damage: { targetTokenId: target.id, targetName: target.label, amount: took.applied, raw: gb.will, damageType: 'force' },
      });
    }
    if (tag === 'greatOne') {
      this.stripLayer(target, actor, BLADE_LABEL);
      if (!target.baneMortal) {
        target.baneMortal = true;
        this.systemLog(`🗡 ${target.label}: BẤT TỬ BỊ PHÁ (có thể chết vĩnh viễn)`, actor);
      }
    }
    return null;
  }

  /** Map / initiative God's Bane operations (DM only). */
  private godsBaneRoomOp(op: GodsBaneRoomOp, actor: Participant): string | null {
    if (actor.role !== 'dm') return "Chỉ DM được điều khiển God's Bane";
    const gb = this.godsBane();
    if (!gb) return "God's Bane chưa bật";
    if (op.op === 'reviveUndying') {
      const revived: string[] = [];
      for (const scene of this.state.scenes) {
        for (const t of scene.tokens) {
          if (!t.downedUndying || t.baneSlain) continue;
          t.downedUndying = undefined;
          if (typeof t.maxHp === 'number') t.currentHp = t.maxHp;
          revived.push(t.label);
        }
      }
      this.systemLog(
        revived.length ? `🌙 Nghỉ dài: sinh vật bất diệt hồi sinh, đầy HP — ${revived.join(', ')}` : '🌙 Nghỉ dài: không có sinh vật bất diệt nào đang gục',
        actor,
      );
      return null;
    }
    if (!gb.awakened) return "God's Bane chưa thức tỉnh — bật \"Đã thức tỉnh\" trước";
    const blade = this.bladeToken();
    switch (op.op) {
      case 'placeBlade': {
        if (blade) return "God's Bane đã có trên bản đồ này";
        let x = typeof op.x === 'number' ? op.x : undefined;
        let y = typeof op.y === 'number' ? op.y : undefined;
        if (x === undefined || y === undefined) {
          // Next to the first sworn PC on this map, else the middle of the map.
          const pc = Object.keys(gb.members)
            .map((id) => this.attackerTokenOf(id, undefined))
            .find((t): t is Token => !!t);
          x = pc ? Math.min(this.state.map.cols - 1, pc.x + 1) : Math.floor(this.state.map.cols / 2);
          y = pc ? pc.y : Math.floor(this.state.map.rows / 2);
        }
        const token = createToken({ label: BLADE_LABEL, x, y, size: 'medium', color: '#d4af37' });
        token.godsBaneBlade = true;
        this.state.tokens.push(token);
        this.systemLog(`🗡 ${BLADE_LABEL} xuất hiện trên bản đồ`, actor);
        return null;
      }
      case 'removeBlade': {
        if (!blade) return "Không có God's Bane trên bản đồ này";
        this.removeBladeToken(blade.id);
        this.systemLog(`🗡 ${BLADE_LABEL} rời bản đồ`, actor);
        return null;
      }
      case 'bladeInit': {
        if (!blade) return "Đặt God's Bane lên bản đồ trước";
        const init = this.state.initiative;
        const has = init.entries.some((e) => e.tokenId === blade.id);
        if (op.on && !has) {
          insertInitiativeEntry(init, {
            id: nanoid(8),
            name: BLADE_LABEL,
            initiative: BLADE_INITIATIVE,
            tokenId: blade.id,
            isActive: false,
            hasGone: false,
            loseTies: true,
          });
          markActive(init);
        } else if (!op.on && has) {
          this.removeInitEntryFor(blade.id);
        }
        return null;
      }
      case 'bladeAttack': {
        const target = this.state.tokens.find((t) => t.id === op.targetTokenId);
        if (!target) return 'Không tìm thấy token mục tiêu';
        return this.bladeAttack(target, actor);
      }
    }
    return null;
  }

  /** Drop a token's initiative entry, keeping the rotation / active marker consistent. */
  private removeInitEntryFor(tokenId: string): void {
    const init = this.state.initiative;
    const idx = init.entries.findIndex((e) => e.tokenId === tokenId);
    if (idx < 0) return;
    const [gone] = init.entries.splice(idx, 1);
    if (init.running && gone.hasGone) init.turnIndex = Math.max(0, init.turnIndex - 1);
    if (init.entries.length === 0) init.running = false;
    markActive(init);
    this.syncTurnAnchors();
  }

  private removeBladeToken(id: string): void {
    this.removeInitEntryFor(id);
    for (const scene of this.state.scenes) {
      const i = scene.tokens.findIndex((t) => t.id === id);
      if (i >= 0) scene.tokens.splice(i, 1);
    }
  }

  private facesOf(result: ReturnType<typeof rollNotation>): number[] {
    const faces: number[] = [];
    for (const term of result.terms) {
      if (term.rolls) for (const r of term.rolls) faces.push(r.value);
    }
    return faces;
  }

  private pushRoll(entry: RollLogEntry): void {
    // sound / visual effect hints for the attack, its damage, a spell's save, a heal
    if (this.fxCtx && !entry.fx && (entry.attack || entry.damage || (this.fxCtx.heal && /HP/.test(entry.label)))) entry.fx = { ...this.fxCtx };
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
  /** Madness tables from the DM's local data (`MADNESS_FILE`, default client/public/campaign/madness.json). */
  private madnessTables(): MadnessTables | null {
    try {
      const file = process.env.MADNESS_FILE ?? new URL('../../client/public/campaign/madness.json', import.meta.url);
      return JSON.parse(readFileSync(file, 'utf8')) as MadnessTables;
    } catch {
      return null;
    }
  }

  /** Roll a madness effect of `tier` onto `sheet` (stun is handled by the caller). */
  private inflictMadness(sheet: CharacterSheet, tier: MadnessTier, actor: Participant): string | null {
    const tables = this.madnessTables();
    if (!tables?.[tier]?.length) return 'Chưa có bảng madness (client/public/campaign/madness.json)';
    const d100 = rollNotation('1d100').total;
    const d10 = rollNotation('1d10').total;
    const d4 = rollNotation('1d4').total;
    const eff = madnessEffect(tables[tier], d100, d10);
    if (!eff) return 'Bảng madness không khớp kết quả d100';
    const now = this.state.worldSeconds ?? 0;
    const dur = madnessDuration(tier, d4);
    const entry = { id: nanoid(8), tier, theme: eff.theme, text: eff.text, roll: `d100 ${d100} · d10 ${d10}`, startedAt: now, expiresAt: dur === undefined ? undefined : now + dur };
    sheet.madness = [...(sheet.madness ?? []), entry];
    sheet.madnessHistory = [...(sheet.madnessHistory ?? []), entry].slice(-40);
    this.pushRoll({
      id: nanoid(8),
      ts: Date.now(),
      actorId: actor.id,
      actorName: actor.name,
      label: `${sheet.name}: madness ${MADNESS_TIER_VI[tier]} — ${eff.theme}: ${eff.text}${dur ? ` (${fmtDuration(dur)})` : ''}`,
      result: externalRollResult('1d100', { total: d100, faces: [d100] }),
    });
    const up = madnessEscalation(sheet.madnessHistory, now);
    if (up && up !== tier) this.systemLog(`${sheet.name}: đã đủ ngưỡng → nên chịu thêm madness ${MADNESS_TIER_VI[up]} (DM quyết)`);
    return null;
  }

  /** Advance the in-world clock and expire timed madness. */
  private passTime(seconds: number): void {
    if (seconds <= 0) return;
    const now = (this.state.worldSeconds ?? 0) + seconds;
    this.state.worldSeconds = now;
    for (const sh of this.state.sheets) {
      if (!sh.madness?.length) continue;
      const { kept, expired } = expireMadness(sh.madness, now);
      if (!expired.length) continue;
      sh.madness = kept;
      for (const e of expired) this.systemLog(`${sh.name}: hết madness ${MADNESS_TIER_VI[e.tier]} — ${e.theme}`);
    }
  }

  /** A label for one more monster of `name` in this scene: "Hunter" while it's alone; once a second
   *  one arrives the first becomes "Hunter 1" and the new one "Hunter 2", and so on — so targets,
   *  initiative and the roll log can tell them apart (initiative shows the token's label). */
  private nextMonsterLabel(name: string): string {
    const base = name.replace(/\s+\d+$/, '').trim() || name;
    const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^${esc}(?: (\\d+))?$`);
    const same = this.state.tokens.filter((t) => re.test(t.label));
    if (!same.length) return base;
    let max = 0;
    for (const t of same) {
      const n = Number(re.exec(t.label)![1] ?? 0);
      max = Math.max(max, n);
    }
    const plain = same.find((t) => t.label === base);
    if (plain) {
      const n = max + 1;
      plain.label = `${base} ${n}`;
      max = n;
    }
    return `${base} ${max + 1}`;
  }

  /** Start of a monster's turn: d6 for every spent "Recharge X–6" action; X or more brings it back.
   *  The rolls are DM-only (they'd tell players when the breath weapon is coming). */
  private rollRecharges(token: Token): void {
    const uses = token.actionUses;
    const sb = token.statblock;
    if (!uses || !sb) return;
    for (const a of sb.actions) {
      const lim = actionLimit(a);
      if (!lim || lim.kind !== 'recharge' || !((uses[a.id] ?? 0) > 0)) continue;
      const d6 = rollNotation('1d6').total;
      const ok = rechargeSucceeds(lim, d6);
      if (ok) delete uses[a.id];
      this.pushRoll({
        id: nanoid(8),
        ts: Date.now(),
        actorId: 'system',
        actorName: 'Hệ thống',
        label: `${token.label}: ${a.name} — tung Recharge ${d6} → ${ok ? 'đã hồi, dùng lại được' : 'chưa hồi'}`,
        result: externalRollResult('1d6', { total: d6, faces: [d6] }),
        private: true,
      });
    }
  }

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
      let mine: number[];
      if (ext) {
        raw = ext.total;
        mine = ext.faces;
      } else {
        const r = rollNotation(n);
        raw = r.total;
        mine = diceFacesOf(r);
      }
      // low dice rolled again once, the new roll stands
      if (p.rerollBelow) {
        const rr = rerollLowDice(n, mine, p.rerollBelow);
        raw += rr.delta;
        mine = rr.faces;
      }
      // Empowered Spell: the lowest few dice rolled again once
      if (p.rerollLowest) {
        const rr = rerollLowestDice(n, mine, p.rerollLowest);
        raw += rr.delta;
        mine = rr.faces;
      }
      faces.push(...mine);
      // Great Weapon Fighting: a 1 or 2 on a damage die counts as 3
      if (p.minDie) raw += minDieBonus(mine, p.minDie);
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
    if (sheet) return saveBonus(sheet, ability); // includes the sheet's Exhaustion
    const sb = token.statblock;
    const pen = exhaustionPenalty(token.exhaustion);
    if (sb) {
      return (
        abilityMod(sb.abilities[ability]) +
        (sb.saveProficiencies.includes(ability) ? sb.proficiencyBonus : 0) +
        pen
      );
    }
    return pen;
  }

  /** Exhaustion level of whoever stands behind a token (the linked sheet, else the token). */
  private tokenExhaustion(token: Token | undefined): number {
    if (!token) return 0;
    const sheet = this.state.sheets.find((s) => s.tokenId === token.id);
    return (sheet ? sheet.exhaustion : token.exhaustion) ?? 0;
  }

  /** Roll a d20 save for a token (nat 20 auto-pass, nat 1 auto-fail — homebrew). `withCover`: the save
   *  is against an effect from another creature, so the token's cover adds to a DEX save (SRS §2.5). */
  private rollTokenSave(
    token: Token,
    ability: Ability,
    dc: number,
    withCover = false,
    vsCondition?: ConditionType,
    forced?: RollMode,
    magical?: boolean,
  ): { d20: number; total: number; pass: boolean; bonus: number; modeNote: string } {
    const sheet = this.linkedSheet(token);
    const bonus =
      this.tokenSaveBonus(token, ability) +
      (withCover && ability === 'dex' ? coverDexSaveBonus(token.cover) : 0) +
      // God's Bane: sworn PCs add N against mind-altering conditions.
      baneMindSaveBonus(this.godsBane(), sheet?.id, vsCondition) +
      // Aura of Protection reaching this token
      (this.auraSave(token)?.bonus ?? 0);
    // advantage from the bearer's effects (effect save advantage) and a forced mode
    // (close-range disadvantage) cancel each other like any 5e advantage/disadvantage
    const featAdv = this.incapacitated(token) ? null : passiveSaveAdvantage(sheet, ability);
    const mechAdv = mechanicSaveAdvantage(this.mechOf(token), { ability, magical, vsCondition }) ?? featAdv ?? undefined;
    const adv = forced === 'advantage' || effectSaveAdvantage(token.effects, ability) || !!mechAdv;
    // Sunlight Weakness & co. (light where it stands) and Aversion-style effects: disadvantage on its saves
    const lightDis = activeLightRules(this.mechOf(token), lightAt(this.state, token)).save;
    const fxDis = token.effects?.some((e) => e.rollDisadvantage?.includes('save'));
    const dis = forced === 'disadvantage' || lightDis.length > 0 || !!fxDis;
    const mode: RollMode = adv && !dis ? 'advantage' : dis && !adv ? 'disadvantage' : 'normal';
    const r1 = 1 + Math.floor(Math.random() * 20);
    const r2 = 1 + Math.floor(Math.random() * 20);
    let d20 = mode === 'advantage' ? Math.max(r1, r2) : mode === 'disadvantage' ? Math.min(r1, r2) : r1;
    const modeNote = mode === 'normal' ? '' : ` (${mode === 'advantage' ? `lợi thế${mechAdv ? ` · ${mechAdv}` : ''}` : 'bất lợi'} ${r1}/${r2})`;
    const causality = this.causalityD20({ sheetId: sheet?.id, enemy: !sheet });
    if (causality) {
      d20 = causality.natural;
      this.systemLog(`${token.label}: cứu ${ability.toUpperCase()}${causality.note}`);
    }
    // Indomitable Might: a STR save total below the STR score uses the score
    const floor = passiveCheckFloor(sheet, ability, { save: true }).totalMin ?? 0;
    const total = Math.max(d20 + bonus, floor);
    const pass = d20 === 20 ? true : d20 === 1 ? false : total >= dc;
    return { d20, total, pass, bonus, modeNote };
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
  private maybeBreakConcentration(token: Token, damage: number, disBy?: string): void {
    if (!token.concentration || damage <= 0) return;
    const dc = concentrationDc(damage);
    const sheet = this.linkedSheet(token);
    const adv0 = passiveHas(sheet, 'concentrationAdvantage') || token.concentration.advantage;
    // Mage Slayer on the attacker: the save is made with disadvantage (cancels an advantage)
    const adv: RollMode | undefined = adv0 && disBy ? undefined : adv0 ? 'advantage' : disBy ? 'disadvantage' : undefined;
    const { d20, total, pass: kept, bonus } = this.rollTokenSave(token, 'con', dc, false, undefined, adv);
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
  /** A new turn begins: last turn's offers lapse, once-per-turn lists reset, "Reactive" monsters get their reaction back. */
  private resetTurnScoped(): void {
    this.state.oaPrompts = [];
    // an attack still waiting for its reaction answer keeps its prompts (else it would never resolve)
    this.state.reactPrompts = (this.state.reactPrompts ?? []).filter((p) => p.holdsAttack && this.heldAttacks.has(p.holdsAttack));
    for (const h of this.state.hazards ?? []) h.hitThisTurn = [];
    for (const t of this.state.tokens) {
      if (t.engulfDmgTurn) t.engulfDmgTurn = 0;
      if (t.auraHitTurn?.length) t.auraHitTurn = [];
      if (t.turnUsed?.reaction && mechanicsOfKind(this.mechOf(t), 'reactive').length) t.turnUsed = { ...t.turnUsed, reaction: false };
    }
  }

  private processTurnEffects(token: Token, phase: 'start-of-turn' | 'end-of-turn'): void {
    if (phase === 'start-of-turn') this.resetTurnScoped();
    const round = this.state.initiative.round;
    const keep: ActiveEffect[] = [];
    if (phase === 'start-of-turn') token.turnUsed = undefined; // a new turn: Action / Bonus / Reaction available again
    const INCAPACITATING = ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'];
    if (tokenConditions(token).some((c) => INCAPACITATING.includes(c))) this.endDownEffects(token, 'mất khả năng hành động');
    this.monsterTurnHooks(token, phase === 'start-of-turn' ? 'start' : 'end');
    if (phase === 'start-of-turn') {
      // Dodge / Help last until the turn of whoever took them comes round again
      for (const t of this.state.tokens) {
        const gone = (t.effects ?? []).filter((e) => e.untilSourceTurnStart && e.sourceTokenId === token.id);
        if (!gone.length) continue;
        t.effects = (t.effects ?? []).filter((e) => !gone.includes(e));
        for (const e of gone) this.systemLog(`${t.label}: hết ${e.name}`);
      }
      const ending = (this.state.hazards ?? []).filter((h) => h.sourceTokenId === token.id);
      if (ending.length) {
        this.state.hazards = (this.state.hazards ?? []).filter((h) => h.sourceTokenId !== token.id);
        for (const h of ending) this.systemLog(`${h.label}: vùng tan (đầu lượt ${token.label})`);
      }
      this.deathSaveTick(token);
      // Reconstruction: auto-heal via Hit Die at the start of each of the bearer's turns.
      for (const e of token.effects ?? []) this.applyHitDieHealTick(token, e);
      // damage at the start of the bearer's turn
      for (const e of [...(token.effects ?? [])]) this.applyTurnDamage(token, e);
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
      // effects that last until the end of their SOURCE's (next) turn (Vex)
      for (const t of this.state.tokens) {
        if (!(t.effects ?? []).some((e) => e.untilSourceTurnEnds != null && e.sourceTokenId === token.id)) continue;
        const left: ActiveEffect[] = [];
        for (const e of t.effects ?? []) {
          if (e.untilSourceTurnEnds == null || e.sourceTokenId !== token.id) left.push(e);
          else if (e.untilSourceTurnEnds > 1) left.push({ ...e, untilSourceTurnEnds: e.untilSourceTurnEnds - 1 });
          else this.systemLog(`${t.label}: hết ${e.name}`);
        }
        t.effects = left;
      }
      // effects lasting "until the end of its next turn"
      if (token.effects?.some((e) => e.endsAfterOwnTurns != null)) {
        const left: ActiveEffect[] = [];
        for (const e of token.effects) {
          if (e.endsAfterOwnTurns == null) left.push(e);
          else if (e.endsAfterOwnTurns > 1) left.push({ ...e, endsAfterOwnTurns: e.endsAfterOwnTurns - 1 });
          else this.systemLog(`${token.label}: hết ${e.name}`);
        }
        token.effects = left;
      }
      for (const h of this.state.hazards ?? []) if (this.inHazard(token, h)) this.hazardHit(token, h, 'kết thúc lượt trong vùng');
      // Charged effects (retaliation + uses) also discharge into creatures the bearer is grappling.
      for (const e of [...(token.effects ?? [])]) {
        if (e.charges == null || !e.retaliate) continue;
        const sheetId = this.linkedSheet(token)?.id;
        const held = this.state.tokens.filter((t) =>
          t.effects?.some(
            (g) => (g.condition === 'grappled' || /grapple|bị ghì/i.test(g.name)) && (g.sourceTokenId === token.id || (!!sheetId && g.sourceSheetId === sheetId)),
          ),
        );
        for (const victim of held) {
          if (!token.effects?.some((x) => x.id === e.id)) break; // spent
          let rolled = 0;
          try {
            rolled = rollNotation(e.retaliate.dice).total;
          } catch {
            continue;
          }
          const out = resolveDamageParts([{ part: { dice: e.retaliate.dice, type: e.retaliate.type }, raw: rolled }], this.effectiveDefenses(victim));
          const took = this.applyDamage(victim, out.totalFinal);
          this.pushRoll({
            id: nanoid(8),
            ts: Date.now(),
            actorId: 'system',
            actorName: 'Hệ thống',
            label: `${e.name}: ${token.label} kết thúc lượt khi đang ghì ${victim.label} → ${out.totalFinal} ${e.retaliate.type}`,
            result: externalRollResult(e.retaliate.dice, { total: rolled, faces: [] }),
            damage: { targetTokenId: victim.id, targetName: victim.label, amount: took.applied, raw: out.totalRaw, damageType: e.retaliate.type, notes: damageBreakdownNotes(out) },
          });
          this.spendEffectCharge(token, e);
        }
      }
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
        const { d20, total, pass, bonus } = this.rollTokenSave(token, e.save.ability, e.save.dc, false, e.condition);
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
  /** Weapon Mastery (SRD 5.2.1) of a character's weapon attack, after it hit or missed. */
  private applyMastery(action: Extract<ClientAction, { t: 'attack' }>, target: Token, hit: boolean, dealt: boolean, actor: Participant): void {
    const m = action.mastery!;
    const attacker = action.attackerTokenId
      ? this.state.tokens.find((t) => t.id === action.attackerTokenId)
      : this.state.tokens.find((t) => this.state.sheets.some((x) => x.id === action.attackerSheetId && x.tokenId === t.id));
    const who = attacker?.label ?? 'Đòn đánh';
    const add = (e: Omit<ActiveEffect, 'id'>) => {
      target.effects = [...(target.effects ?? []), { id: nanoid(8), ...e }];
    };
    const own = !!attacker && this.state.initiative.entries.some((e) => e.isActive && e.tokenId === attacker.id);
    switch (m.kind) {
      case 'graze': {
        if (hit || m.mod <= 0) return;
        const type = action.damageParts[0]?.type ?? '';
        const out = resolveDamageParts([{ part: { dice: String(m.mod), type }, raw: m.mod }], this.effectiveDefenses(target));
        const took = this.applyDamage(target, out.totalFinal, { types: [type] });
        if (took.applied + took.absorbed > 0) this.markDealtDamage(attacker?.id);
        this.maybeBreakConcentration(target, out.totalFinal);
        this.systemLog(`🗡 ${who} · Graze: trượt nhưng vẫn gây ${out.totalFinal} sát thương cho ${target.label}`);
        return;
      }
      case 'vex':
        if (!hit || !dealt || !attacker) return;
        add({ name: `Vex (${who})`, vexBy: attacker.id, sourceTokenId: attacker.id, untilSourceTurnEnds: own ? 2 : 1, note: `${who} có Lợi thế ở đòn kế tiếp vào mục tiêu này` });
        this.systemLog(`🎯 ${who} · Vex: Lợi thế ở đòn kế tiếp vào ${target.label}`);
        return;
      case 'sap':
        if (!hit) return;
        add({ name: `Sap (${who})`, rollDisadvantage: ['attack'], consumeOnAttack: true, sourceTokenId: attacker?.id, untilSourceTurnStart: !!attacker, note: 'Bất lợi ở đòn tấn công kế tiếp' });
        this.systemLog(`🔨 ${who} · Sap: ${target.label} bị Bất lợi ở đòn tấn công kế tiếp`);
        return;
      case 'slow':
        if (!hit || !dealt) return;
        if (target.effects?.some((e) => e.speedPenalty)) return; // does not stack
        add({ name: `Slow (${who})`, speedPenalty: 10, sourceTokenId: attacker?.id, untilSourceTurnStart: !!attacker, note: 'Speed −10 ft' });
        this.systemLog(`🐌 ${who} · Slow: ${target.label} −10 ft Speed đến đầu lượt sau của ${who}`);
        return;
      case 'topple': {
        if (!hit || tokenConditions(target).includes('prone')) return;
        const sv = this.rollTokenSave(target, 'con', m.dc);
        if (!sv.pass) add({ name: `Ngã (Topple · ${who})`, condition: 'prone' });
        this.systemLog(`🤸 ${who} · Topple: ${target.label} cứu CON ${sv.total}${sv.modeNote} vs DC ${m.dc} — ${sv.pass ? 'đứng vững' : 'ngã Prone'}`);
        return;
      }
      case 'push': {
        if (!hit || !attacker) return;
        if (sizeIndex(target.size) > sizeIndex('large')) {
          this.systemLog(`↔ ${who} · Push: ${target.label} quá lớn, không đẩy được`);
          return;
        }
        const fm = this.forceMove(target, attacker, 'push', 10);
        this.systemLog(`↔ ${who} · Push: đẩy ${target.label} ${fm.feet} ft${fm.collided ? ' (vướng vật cản)' : ''}`);
        return;
      }
      case 'cleave':
        if (!hit || action.cleave || action.attackRange !== 'melee' || !attacker || attacker.turnUsed?.cleaveUsed || attacker.turnUsed?.cleaveReady) return;
        attacker.turnUsed = { ...(attacker.turnUsed ?? {}), cleaveReady: true };
        this.systemLog(`🪓 ${who} · Cleave: được đánh thêm 1 kẻ khác trong 5 ft của ${target.label} (nút 🪓 trên sheet, không cộng điểm chỉ số)`);
        return;
      case 'nick':
        return; // the off-hand row itself costs no Bonus Action (client)
    }
    void actor;
  }

  private tokenSpeed(token: Token): number {
    if (token.godsBaneBlade) return BLADE_SPEED;
    const sheet = this.state.sheets.find((s) => s.tokenId === token.id);
    const walk = walkSpeed(sheet ? computeSpeed(sheet).speed : undefined, token.statblock?.speed, tokenIsGrappled(token), this.tokenExhaustion(token));
    // Slow mastery: −10 ft (does not stack: the biggest penalty counts)
    const slow = Math.max(0, ...(token.effects ?? []).map((e) => e.speedPenalty ?? 0));
    return Math.max(0, walk - slow);
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

    // Legendary action, "at the end of another creature's turn": any legendary creature except the one
    // whose turn just ended. The creature whose turn starts next may use it too — it is still the end
    // of the previous turn — spending what it had left BEFORE its own turn refilled it.
    if (ctx?.includeLegendary === false) return;
    const endingId = this.legendaryEndingId;
    for (const t of this.state.tokens) {
      if (t.id === endingId || !alive(t) || !legendaryInfo(t.statblock)) continue;
      const pool = this.legendaryPool(t);
      const options = this.legendaryOptions(t, pool);
      if (pool.left <= 0 || !options.length) continue;
      this.state.dmPrompt = {
        kind: 'legendaryAction',
        tokenId: t.id,
        tokenName: t.label,
        remaining: pool.left,
        options: withOptionIds(options, 'leg'),
        round: init.round,
      };
      return;
    }
  }

  /** The token whose turn just ended — it can't take a legendary action at the end of its own turn. */
  private legendaryEndingId: string | undefined;
  /** The starting creature's legendary uses as they were at the end of the previous turn (before refill). */
  private preTurnLegendary: { tokenId: string; left: number; locks: string[] } | null = null;

  /** Legendary uses left right now (and options locked until its next turn). Unset count = full: the
   *  token joined the map after combat started. */
  private legendaryPool(t: Token): { left: number; locks: string[] } {
    if (this.preTurnLegendary?.tokenId === t.id) return this.preTurnLegendary;
    return { left: t.legendaryActionsRemaining ?? legendaryInfo(t.statblock)?.perRound ?? 0, locks: t.legendaryLocks ?? [] };
  }

  /**
   * Forced movement along the line from `from` to `target`: push away / pull toward by `feet`, or pull
   * until adjacent. A pull never goes past the square next to `from`. Returns the feet actually moved.
   */
  private forceMove(target: Token, from: Token, dir: 'push' | 'pull' | 'adjacent', feet = 0): { feet: number; collided: boolean } {
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const dist = Math.max(Math.abs(dx), Math.abs(dy)); // cells (Chebyshev)
    if (dist < 0.01) return { feet: 0, collided: false };
    const gap = Math.max(0, edgeFeet(target, tokenSpan(target), from, tokenSpan(from)) / FEET_PER_CELL - 1); // free cells between
    const cells = Math.floor(dir === 'push' ? feet / FEET_PER_CELL : dir === 'pull' ? Math.min(feet / FEET_PER_CELL, gap) : gap);
    if (cells <= 0) return { feet: 0, collided: false };
    const sign = dir === 'push' ? 1 : -1;
    const ux = dx / dist;
    const uy = dy / dist;
    const span = tokenSpan(target);
    const sx = target.x;
    const sy = target.y;
    // a square is blocked by the map edge or another creature's footprint
    const blocked = (x: number, y: number) =>
      x < 0 || y < 0 || x + span > this.state.map.cols || y + span > this.state.map.rows ||
      this.state.tokens.some((t) => t.id !== target.id && !t.godsBaneBlade && edgeFeet({ x, y }, span, t, tokenSpan(t)) === 0);
    let moved = 0;
    let collided = false;
    for (let step = 1; step <= cells; step++) {
      const nx = Math.round(sx + sign * ux * step);
      const ny = Math.round(sy + sign * uy * step);
      if (blocked(nx, ny)) {
        collided = dir === 'push';
        break;
      }
      target.x = nx;
      target.y = ny;
      moved = Math.max(Math.abs(nx - sx), Math.abs(ny - sy));
    }
    return { feet: moved * FEET_PER_CELL, collided };
  }

  /** Is the token inside the hazard circle (any part of its footprint)? */
  private inHazard(t: Token, h: Hazard): boolean {
    return aoeTokenIds({ shape: 'sphere', size: h.radiusFt }, 'point', { x: h.cx, y: h.cy }, { x: h.cx, y: h.cy }, [
      { id: t.id, x: t.x, y: t.y, span: tokenSpan(t) },
    ]).includes(t.id);
  }

  /** A creature caught by a lingering area: its save, then the damage (half on a success if the area says so). */
  private hazardHit(t: Token, h: Hazard, why: string): void {
    if (t.godsBaneBlade || (h.hitThisTurn ?? []).includes(t.id)) return;
    h.hitThisTurn = [...(h.hitThisTurn ?? []), t.id];
    const s = this.rollTokenSave(t, h.save, h.dc, false, undefined, undefined, h.magical);
    let rolled = 0;
    try {
      rolled = rollNotation(h.dice).total;
    } catch {
      return;
    }
    const out = resolveDamageParts([{ part: { dice: h.dice, type: h.type }, raw: rolled }], this.effectiveDefenses(t));
    const dealt = s.pass ? (h.halfOnSave ? Math.floor(out.totalFinal / 2) : 0) : out.totalFinal;
    const took = dealt > 0 ? this.applyDamage(t, dealt, { types: [h.type] }) : { applied: 0, absorbed: 0 };
    this.pushRoll({
      id: nanoid(8),
      ts: Date.now(),
      actorId: 'system',
      actorName: 'Hệ thống',
      label: `${h.label} (${why}) → ${t.label}: ${h.save.toUpperCase()} cứu ${s.total}${s.modeNote} vs DC ${h.dc} ${s.pass ? '✔' : '✘'} — ${dealt} ${h.type}`,
      result: externalRollResult(h.dice, { total: rolled, faces: [] }),
      damage: { targetTokenId: t.id, targetName: t.label, amount: took.applied, raw: out.totalRaw, damageType: h.type, notes: damageBreakdownNotes(out) },
    });
  }

  private mechCache = new WeakMap<object, MonsterMechanic[]>();
  /** A monster token's mechanics (stat block wording + the local file). Characters have none. */
  private mechOf(t: Token | undefined): MonsterMechanic[] {
    if (!t?.statblock || this.linkedSheet(t)) return [];
    let m = this.mechCache.get(t.statblock);
    if (!m) {
      m = monsterMechanics(t.statblock);
      this.mechCache.set(t.statblock, m);
    }
    return t.stance?.mechanics?.length ? [...m, ...(t.stance.mechanics as MonsterMechanic[])] : m;
  }

  /** Bump the number of damage dice in "2d8+8" by `n`. */
  private bumpDice(dice: string, n: number): string {
    return dice.replace(/(\d+)d(\d+)/, (_m, c, f) => `${Number(c) + n}d${f}`);
  }

  /** Turn a stance on: an effect for its duration plus size / temp HP / damage dice changes, remembered for the revert. */
  private stanceOn(t: Token, st: Extract<MonsterMechanic, { kind: 'stance' }>, why: string): string | null {
    if (t.stance) return `${t.label} đang ở trạng thái ${t.stance.name}`;
    const key = st.actionId ?? `mech:${st.from ?? st.name}`;
    const a = st.actionId ? t.statblock?.actions.find((x) => x.id === st.actionId) : undefined;
    const lim = a ? actionLimit(a) : st.uses ? ({ kind: 'perDay', max: st.uses } as const) : null;
    if (lim && !actionAvailable(lim, t.actionUses?.[key] ?? 0)) return `${st.name}: hết lượt dùng`;
    if (lim) t.actionUses = { ...(t.actionUses ?? {}), [key]: (t.actionUses?.[key] ?? 0) + 1 };
    const effectId = nanoid(8);
    t.effects = [
      ...(t.effects ?? []),
      {
        id: effectId,
        name: st.name,
        note: st.patch.note,
        acBonus: st.patch.acBonus,
        expiresRound: st.rounds ? this.state.initiative.round + st.rounds : undefined,
      },
    ];
    const damage: Record<string, string> = {};
    if (st.patch.diceBump && t.statblock) {
      for (const x of t.statblock.actions) {
        if (typeof x.attackBonus === 'number' && x.damage && attackRangeOf(x) === 'melee') {
          damage[x.id] = x.damage;
          x.damage = this.bumpDice(x.damage, st.patch.diceBump);
        }
      }
    }
    t.stance = { name: st.name, effectId, before: { size: t.size, damage }, mechanics: st.patch.mechanics, endOn: st.endOn };
    if (st.patch.size) t.size = st.patch.size;
    if (st.patch.tempHp) t.tempHp = Math.max(t.tempHp ?? 0, st.patch.tempHp);
    this.mechCache.delete(t.statblock!);
    this.systemLog(`🔥 ${t.label}: ${st.name}${why ? ` (${why})` : ''}${st.patch.note ? ` — ${st.patch.note}` : ''}`);
    return null;
  }

  /** Turn the active stance off (its effect ended or was removed): put size and damage dice back. */
  private stanceOff(t: Token, why: string): void {
    const st = t.stance;
    if (!st) return;
    t.size = st.before.size;
    if (t.statblock) for (const x of t.statblock.actions) if (st.before.damage[x.id]) x.damage = st.before.damage[x.id];
    t.effects = (t.effects ?? []).filter((e) => e.id !== st.effectId);
    t.stance = undefined;
    if (t.statblock) this.mechCache.delete(t.statblock);
    this.systemLog(`${t.label}: hết ${st.name} (${why})`);
  }

  /** Put `victim` inside `holder` (swallowed / devoured / trapped). */
  private engulf(holder: Token, victim: Token, m: Extract<MonsterMechanic, { kind: 'engulf' }>): void {
    if (victim.effects?.some((e) => e.engulfedBy)) return;
    if (m.maxSize && sizeIndex(victim.size) > sizeIndex(m.maxSize)) return;
    // the grapple that held it ends
    victim.effects = (victim.effects ?? []).filter((e) => !((e.condition === 'grappled' || /grapple|bị ghì/i.test(e.name)) && e.sourceTokenId === holder.id));
    const tag = { swallowed: 'nuốt', devoured: 'ăn', trapped: 'nhốt', entombed: 'chôn', engulfed: 'nuốt' }[m.label] ?? 'nuốt';
    victim.effects = [
      ...victim.effects,
      {
        id: nanoid(8),
        name: `Bị ${tag} (${holder.label})`,
        condition: 'restrained',
        sourceTokenId: holder.id,
        engulfedBy: holder.id,
        turnDamage: m.turnDamage,
        escapeDc: m.escapeDc,
        note: `Total cover với bên ngoài${m.escapeDamage ? ` · ${holder.label} nhận ${m.escapeDamage}+ sát thương từ bên trong trong 1 lượt thì nhả ra` : ''}`,
      },
      ...(m.blinded ? [{ id: nanoid(8), name: `Bị ${tag} — mù`, condition: 'blinded' as ConditionType, engulfedBy: holder.id, sourceTokenId: holder.id }] : []),
    ];
    victim.x = holder.x;
    victim.y = holder.y;
    this.pendingBaneLogs.push(`🫦 ${holder.label} ${tag} ${victim.label}${m.turnDamage ? ` (${m.turnDamage.dice} ${m.turnDamage.type} mỗi lượt)` : ''}`);
  }

  /** Free everything `holder` holds (or just `only`): out to a free square next to it, prone unless it escaped. */
  private releaseEngulfed(holder: Token, why: string, only?: Token, prone = true): void {
    const held = this.state.tokens.filter((v) => (!only || v.id === only.id) && v.effects?.some((e) => e.engulfedBy === holder.id));
    for (const v of held) {
      v.effects = (v.effects ?? []).filter((e) => e.engulfedBy !== holder.id);
      const span = tokenSpan(holder);
      const spots: { x: number; y: number }[] = [];
      for (let dx = -1; dx <= span; dx++) for (let dy = -1; dy <= span; dy++) if (dx < 0 || dy < 0 || dx >= span || dy >= span) spots.push({ x: holder.x + dx, y: holder.y + dy });
      const free = spots.find(
        (p) => p.x >= 0 && p.y >= 0 && p.x < this.state.map.cols && p.y < this.state.map.rows && !this.state.tokens.some((t) => t.id !== v.id && edgeFeet(p, tokenSpan(v), t, tokenSpan(t)) === 0),
      );
      if (free) {
        v.x = free.x;
        v.y = free.y;
      }
      if (prone) v.effects = [...(v.effects ?? []), { id: nanoid(8), name: 'Ngã (vừa thoát ra)', condition: 'prone' }];
      this.pendingBaneLogs.push(`↩ ${v.label} thoát khỏi ${holder.label} (${why})`);
    }
  }

  /** Can this monster use this reaction now (reaction unspent, alive, able, uses left)? */
  private canReact(t: Token, m: { actionId?: string }): boolean {
    if (t.turnUsed?.reaction || !this.alive(t)) return false;
    if (tokenConditions(t).some((c) => ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'].includes(c))) return false;
    const a = m.actionId ? t.statblock?.actions.find((x) => x.id === m.actionId) : undefined;
    const lim = a ? actionLimit(a) : null;
    return !lim || actionAvailable(lim, t.actionUses?.[a!.id] ?? 0);
  }

  private spendReaction(t: Token, m: { actionId?: string }): void {
    t.turnUsed = { ...(t.turnUsed ?? {}), reaction: true };
    const a = m.actionId ? t.statblock?.actions.find((x) => x.id === m.actionId) : undefined;
    if (a && actionLimit(a)) t.actionUses = { ...(t.actionUses ?? {}), [a.id]: (t.actionUses?.[a.id] ?? 0) + 1 };
  }

  /** Offer a monster reaction to the DM (deduped per reactor + action + trigger). */
  private offerReaction(r: Token, m: { actionId?: string; from?: string }, trigger: Token | undefined, why: string): void {
    if (!m.actionId || !this.canReact(r, m)) return;
    const list = (this.state.reactPrompts ??= []);
    if (list.some((p) => p.tokenId === r.id && p.actionId === m.actionId && p.triggerTokenId === trigger?.id)) return;
    list.push({ id: nanoid(8), tokenId: r.id, tokenName: r.label, actionId: m.actionId, actionName: m.from ?? 'Reaction', triggerTokenId: trigger?.id, triggerName: trigger?.label, why });
  }

  /** Attacks waiting for the DM's answer to a reaction that comes before the roll (by hold id). */
  private heldAttacks = new Map<string, { actor: Participant; action: Extract<ClientAction, { t: 'attack' }>; dis?: string; intercept?: Intercept; selfCut?: SelfCut; parry?: Parry }>();
  /** Set just before a held attack is run again: skip the hold, apply the disadvantage / Interception if any. */
  private resumingAttack: { dis?: string; intercept?: Intercept; selfCut?: SelfCut; parry?: Parry } | null = null;
  /** Attacks sent while another one waits for its reaction answer — run in order once it resolves. */
  private attackQueue: { actor: Participant; action: Extract<ClientAction, { t: 'attack' }> }[] = [];

  /**
   * Before an attack is rolled: monsters that may react to it being made — the target itself ("when it
   * is attacked / targeted by an attack") or a nearby ally ("when a creature … within 30 feet is
   * targeted by an attack"). If any can, the attack is parked and one prompt per reactor goes to the
   * DM; the attack runs once every prompt of the hold is answered. Returns true when held.
   */
  private holdAttackForReactions(actor: Participant, action: Extract<ClientAction, { t: 'attack' }>, target: Token): boolean {
    const attacker = action.attackerTokenId
      ? this.state.tokens.find((t) => t.id === action.attackerTokenId)
      : this.state.tokens.find((t) => this.state.sheets.some((x) => x.id === action.attackerSheetId && x.tokenId === t.id));
    const found: { r: Token; m: Extract<MonsterMechanic, { kind: 'reaction' }> }[] = [];
    const monster = (t: Token) => !!t.statblock && !this.linkedSheet(t);
    if (monster(target)) {
      for (const m of mechanicsOfKind(this.mechOf(target), 'reaction')) {
        if (m.trigger !== 'selfAttacked' || !m.actionId || !this.canReact(target, m)) continue;
        if (m.radiusFt && attacker && edgeFeet(attacker, tokenSpan(attacker), target, tokenSpan(target)) > m.radiusFt) continue;
        found.push({ r: target, m });
      }
    }
    const summoner = this.state.initiative.entries.find((e) => e.tokenId === target.id)?.summonedBy;
    for (const r of this.state.tokens) {
      if (r.id === target.id || r.id === attacker?.id || !monster(r)) continue;
      for (const m of mechanicsOfKind(this.mechOf(r), 'reaction')) {
        if (m.trigger !== 'allyAttacked' || !m.actionId || !this.canReact(r, m)) continue;
        if (m.summonedOnly ? summoner !== r.id : this.isPlayerSide(r) !== this.isPlayerSide(target)) continue;
        if (edgeFeet(r, tokenSpan(r), target, tokenSpan(target)) > (m.radiusFt ?? 5)) continue;
        found.push({ r, m });
      }
    }
    // characters with the Protection / Interception fighting style next to the target (player side only)
    const styles: { r: Token; sheet: CharacterSheet; style: 'protection' | 'interception' }[] = [];
    if (this.isPlayerSide(target) && !(attacker && this.isPlayerSide(attacker))) {
      for (const r of this.state.tokens) {
        const sheet = this.linkedSheet(r);
        if (!sheet || r.id === target.id || r.id === attacker?.id || !this.canReact(r, {})) continue;
        if (edgeFeet(r, tokenSpan(r), target, tokenSpan(target)) > 5) continue;
        const shield = shieldEquipped(sheet);
        const weapon = sheet.inventory.some((it) => it.type === 'weapon' && it.equipped);
        if (hasStyle(sheet, 'protection') && shield) styles.push({ r, sheet, style: 'protection' });
        else if (hasStyle(sheet, 'interception') && (shield || weapon)) styles.push({ r, sheet, style: 'interception' });
      }
    }
    // the target's own reactions to a melee attack (a counter-attack, a step away), from its features
    const own: { featureId: string; name: string; style: 'counter' | 'stepAway' | 'halve' | 'reduce' | 'parry'; sheet: CharacterSheet }[] = [];
    const tSheet = this.linkedSheet(target);
    if (tSheet && attacker && this.canReact(target, {})) {
      const types = (action.damageParts ?? []).map((p) => (p.type || '').toLowerCase());
      for (const r of passiveReactions(tSheet)) {
        const k = r.reaction.kind;
        // a counter / step away answers melee attacks only; Deflect-style cuts need a matching damage type
        if ((k === 'counter' || k === 'stepAway' || k === 'parry') && action.attackRange !== 'melee') continue;
        // a parry needs a Finesse weapon in hand
        if (k === 'parry' && !tSheet.inventory.some((it) => it.type === 'weapon' && it.equipped && hasProp(weaponInfo(it), 'finesse'))) continue;
        if (k === 'reduce' && r.reaction.types && !passiveHas(tSheet, 'deflectAnyType') && !types.some((t) => r.reaction.types!.includes(t))) continue;
        const max = r.uses ? subclassUsesMax(r.uses.max, tSheet) : Infinity;
        if ((tSheet.subclassUses?.[r.featureId] ?? 0) >= max) continue;
        own.push({ featureId: r.featureId, name: r.name, style: k, sheet: tSheet });
      }
    }
    if (!found.length && !styles.length && !own.length) return false;
    const holdId = nanoid(8);
    this.heldAttacks.set(holdId, { actor, action });
    const list = (this.state.reactPrompts ??= []);
    const by = attacker?.label ?? 'Đòn đánh';
    for (const o of own) {
      list.push({
        id: nanoid(8),
        tokenId: target.id,
        tokenName: o.sheet.name || target.label,
        actionId: o.featureId,
        actionName: o.name,
        triggerTokenId: attacker?.id,
        triggerName: attacker?.label,
        why:
          o.style === 'counter'
            ? `${by} đang đánh cận chiến bạn — phản đòn trước khi đòn trúng`
            : o.style === 'stepAway'
              ? `${by} đang đánh cận chiến bạn — lùi ra trước khi đòn trúng`
              : o.style === 'parry'
                ? `${by} đang đánh cận chiến bạn — nếu trúng, +${o.sheet.proficiencyBonus} AC cho đòn này (tốn reaction khi đòn lẽ ra trúng)`
                : o.style === 'halve'
                ? `${by} đang tấn công bạn — nếu trúng, chỉ nhận nửa sát thương (tốn reaction khi trúng)`
                : `${by} đang tấn công bạn — nếu trúng, giảm sát thương (tốn reaction khi trúng)`,
        holdsAttack: holdId,
        style: o.style,
        ownerId: o.sheet.ownerId,
        featureId: o.featureId,
      });
    }
    for (const { r, sheet, style } of styles) {
      list.push({
        id: nanoid(8),
        tokenId: r.id,
        tokenName: sheet.name || r.label,
        actionId: style,
        actionName: style === 'protection' ? 'Protection' : 'Interception',
        triggerTokenId: attacker?.id,
        triggerName: attacker?.label,
        why:
          style === 'protection'
            ? `${by} đang tấn công ${target.label} — dùng khiên để đòn này bị Bất lợi`
            : `${by} đang tấn công ${target.label} — nếu trúng, giảm 1d10 + ${sheet.proficiencyBonus} sát thương`,
        holdsAttack: holdId,
        style,
        ownerId: sheet.ownerId,
      });
    }
    for (const { r, m } of found) {
      list.push({
        id: nanoid(8),
        tokenId: r.id,
        tokenName: r.label,
        actionId: m.actionId!,
        actionName: m.from ?? 'Reaction',
        triggerTokenId: attacker?.id,
        triggerName: attacker?.label,
        why: r.id === target.id ? `${by} đang tấn công nó` : `${by} đang tấn công ${target.label}`,
        holdsAttack: holdId,
      });
    }
    this.systemLog(`⏸ ${action.label || 'Đòn đánh'}: chờ ${(styles.length || own.length) && !found.length ? 'người chơi' : 'DM'} quyết định reaction trước khi tung`);
    return true;
  }

  /**
   * A character's own reaction to a melee attack, taken before the roll. Returns why the attack
   * now fails (it is then dropped), or null when it still goes ahead.
   */
  private ownReaction(p: ReactPrompt, me: Token, held: { action: Extract<ClientAction, { t: 'attack' }> }): string | null {
    const sheet = this.linkedSheet(me);
    const attacker = held.action.attackerTokenId ? this.state.tokens.find((t) => t.id === held.action.attackerTokenId) : undefined;
    const r = sheet ? passiveReactions(sheet).find((x) => x.featureId === p.featureId) : undefined;
    if (!sheet || !attacker || !r) return null;
    const spendUse = () => {
      if (r.uses) sheet.subclassUses = { ...(sheet.subclassUses ?? {}), [r.featureId]: (sheet.subclassUses?.[r.featureId] ?? 0) + 1 };
    };
    this.spendReaction(me, {});
    if (r.reaction.kind === 'stepAway') {
      spendUse();
      const fm = this.forceMove(me, attacker, 'push', r.reaction.feet ?? 5);
      const out = edgeFeet(attacker, tokenSpan(attacker), me, tokenSpan(me)) > 5;
      this.systemLog(`💨 ${sheet.name} · ${r.name}: lùi ${fm.feet} ft (không bị đòn cơ hội)${out ? ' — ra khỏi tầm với, đòn hụt' : ''}`);
      return out ? `${sheet.name} đã lùi ra khỏi tầm (${r.name})` : null;
    }
    // counter-attack: a spell attack against the attacker
    if (!r.reaction.spendUseOnDamage) spendUse();
    const bonus = spellAttackBonus(sheet) ?? sheet.proficiencyBonus;
    const roll = rollNotation(`1d20+${bonus}`);
    const res = resolveAttack(roll, this.tokenAc(attacker));
    let note = `${sheet.name} · ${r.name}: đánh trả ${roll.total} vs AC ${this.tokenAc(attacker)} — ${res.hit ? 'TRÚNG' : 'trượt'}`;
    if (res.hit && r.reaction.dice) {
      const dice = resolveFeatureFormula(r.reaction.dice, sheet, r.classKey);
      const out = resolveDamageParts([{ part: { dice, type: r.reaction.type ?? 'force' }, raw: rollNotation(dice).total }], this.effectiveDefenses(attacker));
      const took = this.applyDamage(attacker, out.totalFinal, { types: [r.reaction.type ?? 'force'] });
      if (took.applied + took.absorbed > 0 && r.reaction.spendUseOnDamage) spendUse();
      this.maybeBreakConcentration(attacker, out.totalFinal);
      note += ` · ${out.totalFinal} sát thương ${r.reaction.type ?? 'force'}`;
    }
    if (res.hit && r.reaction.stunOnHit) {
      attacker.effects = [...(attacker.effects ?? []), { id: nanoid(8), name: `Choáng (${r.name})`, condition: 'stunned', endsAfterOwnTurns: 1, note: 'Đến hết lượt hiện tại của nó' }];
      note += ` · ${attacker.label} bị Stunned, đòn của nó thất bại`;
    }
    this.systemLog(`⚔ ${note}`);
    return res.hit && r.reaction.stunOnHit ? `${attacker.label} bị phản đòn (${r.name})` : null;
  }

  /** A parked attack that no longer happens (the target stepped away, a counter stopped it). */
  private cancelHeldAttack(holdId: string, why: string): void {
    const held = this.heldAttacks.get(holdId);
    this.heldAttacks.delete(holdId);
    this.state.reactPrompts = (this.state.reactPrompts ?? []).filter((p) => p.holdsAttack !== holdId);
    this.systemLog(`✖ ${held?.action.label || 'Đòn đánh'}: không thành — ${why}`);
    while (this.attackQueue.length && !this.heldAttacks.size) {
      const next = this.attackQueue.shift()!;
      const e = this.apply(next.actor, next.action);
      if (e) this.systemLog(`⚠ Đòn xếp hàng không chạy được: ${e}`);
    }
  }

  /** Every prompt of a hold answered: run the parked attack (with disadvantage if a reaction imposed it). */
  private releaseHeldAttack(holdId: string): void {
    if ((this.state.reactPrompts ?? []).some((p) => p.holdsAttack === holdId)) return;
    const held = this.heldAttacks.get(holdId);
    if (!held) return;
    this.heldAttacks.delete(holdId);
    this.resumingAttack = { dis: held.dis, intercept: held.intercept, selfCut: held.selfCut, parry: held.parry };
    const err = this.apply(held.actor, held.action);
    this.resumingAttack = null;
    if (err) this.systemLog(`⚠ Đòn chờ reaction không chạy được: ${err}`);
    // then the attacks that lined up behind it, until one of them has to wait in turn
    while (this.attackQueue.length && !this.heldAttacks.size) {
      const next = this.attackQueue.shift()!;
      const e = this.apply(next.actor, next.action);
      if (e) this.systemLog(`⚠ Đòn xếp hàng không chạy được: ${e}`);
    }
  }

  /** Reactions of every monster whose trigger is `kind`, filtered by distance to `near`. */
  private offerReactionsOf(kind: 'selfDamaged' | 'selfAttacked' | 'allyDamaged' | 'nearStart' | 'healCast' | 'spellCast', near: Token, trigger: Token | undefined, why: string, opts?: { self?: Token; enter?: boolean }): void {
    for (const r of opts?.self ? [opts.self] : this.state.tokens) {
      for (const m of mechanicsOfKind(this.mechOf(r), 'reaction')) {
        if (m.trigger !== kind) continue;
        if (opts?.enter && !m.enters) continue;
        if (!opts?.self) {
          if (r.id === near.id) continue;
          if (kind === 'allyDamaged' ? this.isPlayerSide(r) !== this.isPlayerSide(near) : this.isPlayerSide(r) === this.isPlayerSide(near)) continue;
          if (edgeFeet(r, tokenSpan(r), near, tokenSpan(near)) > (m.radiusFt ?? 5)) continue;
        }
        this.offerReaction(r, m, trigger, why);
      }
    }
  }

  /** Monsters that dropped to 0 HP during this action — their death triggers run in `touch()`. */
  private pendingDowns: string[] = [];
  private offeringReactions = false;

  /** Roll damage dice of one or more parts against `t` (its defences), apply, log. Returns damage dealt. */
  private mechDamage(t: Token, parts: { dice: string; type: string }[], label: string, opts?: { save?: { ability: Ability; dc: number }; halfOnSave?: boolean; magical?: boolean }): number {
    let saveNote = '';
    let pass = false;
    if (opts?.save) {
      const s = this.rollTokenSave(t, opts.save.ability, opts.save.dc, false, undefined, undefined, opts.magical);
      pass = s.pass;
      saveNote = ` · ${opts.save.ability.toUpperCase()} cứu ${s.total}${s.modeNote} vs DC ${opts.save.dc} ${pass ? '✔' : '✘'}`;
    }
    let rolled: { part: DamagePart; raw: number }[] = [];
    try {
      rolled = parts.map((p) => ({ part: { dice: p.dice, type: p.type }, raw: rollNotation(p.dice).total }));
    } catch {
      return 0;
    }
    const out = resolveDamageParts(rolled, this.effectiveDefenses(t));
    const dealt = pass ? (opts?.halfOnSave ? Math.floor(out.totalFinal / 2) : 0) : out.totalFinal;
    const took = dealt > 0 ? this.applyDamage(t, dealt, { types: parts.map((p) => p.type) }) : { applied: 0, absorbed: 0 };
    this.pushRoll({
      id: nanoid(8),
      ts: Date.now(),
      actorId: 'system',
      actorName: 'Hệ thống',
      label: `${label} → ${t.label}${saveNote} — ${dealt} ${parts.map((p) => p.type).join(' + ')}`,
      result: externalRollResult(parts.map((p) => p.dice).join(' + '), { total: rolled.reduce((n, r) => n + r.raw, 0), faces: [] }),
      damage: { targetTokenId: t.id, targetName: t.label, amount: took.applied, raw: out.totalRaw, damageType: parts[0]?.type ?? '', notes: damageBreakdownNotes(out) },
    });
    return dealt;
  }

  /** Everyone within `radiusFt` of `c` (edge to edge), except `c`. */
  private tokensNear(c: Token, radiusFt: number, pred: (t: Token) => boolean = () => true): Token[] {
    return this.state.tokens.filter((t) => t.id !== c.id && !t.godsBaneBlade && edgeFeet(c, tokenSpan(c), t, tokenSpan(t)) <= radiusFt && pred(t));
  }

  private alive = (t: Token) => !(typeof t.currentHp === 'number' && t.currentHp <= 0);

  /** A monster just dropped to 0 HP: revive (N/day), else bursts, effects on allies, reminder lines. */
  private processDowns(): void {
    let guard = 0;
    while (this.pendingDowns.length && guard++ < 20) {
      const id = this.pendingDowns.shift()!;
      const t = this.state.tokens.find((x) => x.id === id);
      if (!t || this.alive(t)) continue;
      const mechs = this.mechOf(t);
      const rv = mechanicsOfKind(mechs, 'reviveAtZero').find((m) => (t.actionUses?.[`mech:${m.from}`] ?? 0) < (m.uses ?? 1));
      if (rv) {
        t.actionUses = { ...(t.actionUses ?? {}), [`mech:${rv.from}`]: (t.actionUses?.[`mech:${rv.from}`] ?? 0) + 1 };
        const hp = rv.hp === 'full' ? (t.maxHp ?? 1) : (() => { try { return rollNotation(rv.hp).total; } catch { return 1; } })();
        t.currentHp = Math.min(t.maxHp ?? hp, hp);
        this.systemLog(`♻ ${t.label}: ${rv.from} — không chết, hồi ${t.currentHp} HP`);
        if (rv.burst) for (const v of this.tokensNear(t, rv.burst.radiusFt)) this.mechDamage(v, rv.burst.damage, `${t.label} · ${rv.from}`, { save: rv.burst.save, halfOnSave: rv.burst.halfOnSave });
        continue;
      }
      this.releaseEngulfed(t, `${t.label} gục`);
      // Regeneration that keeps it alive until a turn starts without regenerating: not dead yet.
      if (mechanicsOfKind(mechs, 'regeneration').some((r) => r.diesOnlyAtTurnStart)) {
        this.systemLog(`${t.label} gục ở 0 HP — chỉ chết nếu đầu lượt sau không tái sinh được`);
        continue;
      }
      for (const b of mechanicsOfKind(mechs, 'deathBurst')) {
        for (const v of this.tokensNear(t, b.radiusFt)) this.mechDamage(v, b.damage, `${t.label} · ${b.from}`, { save: b.save, halfOnSave: b.halfOnSave });
      }
      for (const a of mechanicsOfKind(mechs, 'deathAllyEffect')) {
        const allies = this.tokensNear(t, a.radiusFt, (v) => this.isPlayerSide(v) === this.isPlayerSide(t) && this.alive(v));
        for (const v of allies) {
          v.effects = [
            ...(v.effects ?? []),
            { id: nanoid(8), name: a.effect.name, note: a.effect.note, condition: a.effect.condition as ConditionType | undefined, sourceTokenId: t.id, expiresRound: a.effect.rounds ? this.state.initiative.round + a.effect.rounds : undefined },
          ];
        }
        if (allies.length) this.systemLog(`${t.label} · ${a.from}: ${allies.map((v) => v.label).join(', ')} nhận "${a.effect.name}"`);
      }
      for (const n of mechanicsOfKind(mechs, 'deathNote')) this.systemLog(`📜 ${t.label}: ${n.from} (xem statblock)`);
    }
  }

  /** One aura reaching one creature: save, then condition / madness / damage; a success may grant immunity. */
  private applyAura(bearer: Token, t: Token, a: Extract<MonsterMechanic, { kind: 'aura' }>, why: string): void {
    const key = a.from ?? 'aura';
    if (bearer.auraImmune?.[key]?.includes(t.id) || bearer.auraHitTurn?.includes(t.id)) return;
    bearer.auraHitTurn = [...(bearer.auraHitTurn ?? []), t.id];
    const s = a.save ? this.rollTokenSave(t, a.save.ability, a.save.dc, false, a.onFail.condition as ConditionType | undefined) : { pass: false, total: 0, modeNote: '' };
    const head = `${bearer.label} · ${key} (${why}) → ${t.label}${a.save ? `: ${a.save.ability.toUpperCase()} cứu ${s.total}${s.modeNote} vs DC ${a.save.dc}` : ''}`;
    if (s.pass) {
      if (a.immuneOnSave) bearer.auraImmune = { ...(bearer.auraImmune ?? {}), [key]: [...(bearer.auraImmune?.[key] ?? []), t.id] };
      if (a.onFail.damage && a.halfOnSave) this.mechDamage(t, [a.onFail.damage], head + ' ✔ (nửa)');
      else this.systemLog(`${head} ✔${a.immuneOnSave ? ' — miễn nhiễm hào quang này' : ''}`);
      return;
    }
    const bits: string[] = [];
    if (a.onFail.condition) {
      t.effects = [
        ...(t.effects ?? []),
        { id: nanoid(8), name: `${key} (${bearer.label})`, condition: a.onFail.condition as ConditionType, sourceTokenId: bearer.id, expiresRound: this.state.initiative.round + (a.onFail.rounds ?? 1) },
      ];
      bits.push(a.onFail.condition);
    }
    if (a.onFail.madness) {
      const sh = this.linkedSheet(t);
      if (sh) {
        const err = this.inflictMadness(sh, a.onFail.madness, { id: 'system', name: 'Hệ thống', role: 'dm' } as Participant);
        bits.push(err ? `madness (${err})` : `${a.onFail.madness}-term madness`);
      }
    }
    if (a.onFail.damage) {
      this.mechDamage(t, [a.onFail.damage], head + ' ✘');
      if (!bits.length) return;
    }
    this.systemLog(`${head} ✘ — ${bits.join(', ') || 'trượt'}`);
  }

  /** Start / end of `t`'s turn: regeneration, turn damage, auras reaching it. */
  private monsterTurnHooks(t: Token, phase: 'start' | 'end'): void {
    const mechs = this.mechOf(t);
    if (phase === 'start') {
      for (const r of mechanicsOfKind(mechs, 'regeneration')) {
        const hp = t.currentHp ?? 0;
        const stopped = regenSuppressed(r, t.tookSinceTurn);
        if (hp <= 0 && r.diesOnlyAtTurnStart && stopped) {
          this.systemLog(`☠ ${t.label}: ${r.from} bị chặn (${r.suppressedBy?.join('/')}) — chết hẳn`);
          continue;
        }
        if (stopped) {
          this.systemLog(`${t.label}: ${r.from} không hoạt động lượt này (vừa dính ${r.suppressedBy?.join('/')})`);
          continue;
        }
        if ((r.needsHp && hp <= 0) || hp >= (t.maxHp ?? 0)) continue;
        let heal = 0;
        try {
          heal = rollNotation(r.hp).total;
        } catch {
          continue;
        }
        const got = this.applyHeal(t, heal);
        if (got > 0) this.systemLog(`💚 ${t.label}: ${r.from} hồi ${got} HP${hp <= 0 ? ' — đứng dậy' : ''}`);
      }
      t.tookSinceTurn = [];
      const light = lightAt(this.state, t);
      for (const m of activeLightRules(mechs, light).rules) {
        if (m.startDamage && this.alive(t)) this.mechDamage(t, [m.startDamage], `${t.label} · ${m.from} (${SCENE_LIGHT_VI[light!]})`);
        if (m.note) this.systemLog(`🌑 ${t.label}: ${m.from} — ${m.note} (${SCENE_LIGHT_VI[light!]})`);
      }
      // Aversion to Axes: frightened until the start of its next turn while it sees one of those weapons
      const wavs = mechanicsOfKind(mechs, 'weaponAversion');
      if (wavs.length) {
        t.effects = (t.effects ?? []).filter((e) => !e.id.startsWith('wav:'));
        for (const w of wavs) {
          const holder = this.state.tokens.find((o) => {
            if (o.id === t.id || o.hidden || !this.alive(o)) return false;
            const items = this.linkedSheet(o)?.inventory ?? [];
            return items.some((it) => it.equipped && w.weapons.some((n) => it.name.toLowerCase().includes(n)));
          });
          if (!holder) continue;
          t.effects.push({ id: `wav:${w.from ?? w.condition}`, name: w.from ?? 'Sợ vũ khí', condition: w.condition as ActiveEffect['condition'], sourceTokenId: holder.id, note: 'đến đầu lượt sau' });
          this.systemLog(`😨 ${t.label}: ${w.from} — thấy ${holder.label} cầm vũ khí đó → ${w.condition} đến đầu lượt sau`);
        }
      }
    }
    // its own turn damage (rings around it; creatures it grapples on its turn)
    for (const d of mechanicsOfKind(mechs, 'turnDamage')) {
      if (d.when !== phase || !this.alive(t)) continue;
      if (d.ifBelowHalfHp && !((t.currentHp ?? 0) < (t.maxHp ?? 0) / 2)) continue;
      if (regenSuppressed(d, t.tookSinceTurn)) continue;
      const victims =
        d.targets === 'nearby'
          ? this.tokensNear(t, d.radiusFt ?? 5)
          : d.alsoOwnTurn
            ? this.state.tokens.filter((v) => v.id !== t.id && this.grappledBy(v, t))
            : [];
      for (const v of victims) this.mechDamage(v, [{ dice: d.dice, type: d.type }], `${t.label} · ${d.from}`, { save: d.save, halfOnSave: d.halfOnSave });
    }
    if (phase === 'start') {
      // grapplers whose grip hurts at the start of the held creature's turn
      for (const g of this.state.tokens) {
        if (g.id === t.id || !this.grappledBy(t, g) || !this.alive(g)) continue;
        for (const d of mechanicsOfKind(this.mechOf(g), 'turnDamage')) {
          if (d.targets === 'grappled' && d.when === 'start') this.mechDamage(t, [{ dice: d.dice, type: d.type }], `${g.label} · ${d.from}`, { save: d.save, halfOnSave: d.halfOnSave });
        }
      }
      this.offerReactionsOf('nearStart', t, t, `${t.label} bắt đầu lượt cạnh`);
      // auras: hostile creatures with an aura reach this creature
      for (const b of this.state.tokens) {
        if (b.id === t.id || !this.alive(b) || this.isPlayerSide(b) === this.isPlayerSide(t)) continue;
        for (const a of mechanicsOfKind(this.mechOf(b), 'aura')) {
          if (a.trigger !== 'endTurn' && edgeFeet(b, tokenSpan(b), t, tokenSpan(t)) <= a.radiusFt) this.applyAura(b, t, a, 'đầu lượt');
        }
      }
    }
    if (phase === 'end') {
      for (const b of this.state.tokens) {
        if (b.id === t.id || !this.alive(b) || !this.alive(t) || this.isPlayerSide(b) === this.isPlayerSide(t)) continue;
        for (const a of mechanicsOfKind(this.mechOf(b), 'aura')) {
          if (a.trigger === 'endTurn' && edgeFeet(b, tokenSpan(b), t, tokenSpan(t)) <= a.radiusFt) this.applyAura(b, t, a, 'cuối lượt');
        }
      }
    }
  }

  /** Light-dependent conditions (Lunar Invisibility): kept in step with the light where each creature stands. */
  private syncLightConditions(): void {
    for (const t of this.state.tokens) {
      if (!t.statblock) continue;
      const mechs = this.mechOf(t);
      if (!mechs.some((m) => m.kind === 'light')) continue;
      const light = lightAt(this.state, t);
      const want = activeLightRules(mechs, light).rules.flatMap((m) => (m.conditions ?? []).map((c) => ({ id: `light:${m.from}:${c}`, name: m.from ?? 'ánh sáng', c })));
      const have = (t.effects ?? []).filter((e) => e.id.startsWith('light:'));
      const drop = have.filter((e) => !want.some((w) => w.id === e.id));
      const add = want.filter((w) => !have.some((e) => e.id === w.id));
      if (!drop.length && !add.length) continue;
      t.effects = [
        ...(t.effects ?? []).filter((e) => !drop.includes(e)),
        ...add.map((w) => ({ id: w.id, name: w.name, condition: w.c as ActiveEffect['condition'], note: `do ánh sáng (${light ? SCENE_LIGHT_VI[light] : '—'})` })),
      ];
      const names = [...new Set([...add, ...drop].map((x) => x.name))].join(', ');
      this.systemLog(
        add.length
          ? `🌘 ${t.label}: ${names} → ${add.map((w) => w.c).join(', ')}`
          : `🌕 ${t.label}: ${names} hết hiệu lực (${light ? SCENE_LIGHT_VI[light] : 'không theo dõi ánh sáng'})`,
      );
    }
  }

  /** Condition immunities: an effect carrying a condition the creature is immune to never sticks. */
  private enforceConditionImmunity(): void {
    for (const t of this.state.tokens) {
      if (!t.effects?.length || !t.statblock) continue;
      const immune = immuneConditions(this.mechOf(t));
      if (!immune.length) continue;
      const blocked = t.effects.filter((e) => e.condition && immune.includes(e.condition));
      if (!blocked.length) continue;
      t.effects = t.effects.filter((e) => !blocked.includes(e));
      for (const e of blocked) this.systemLog(`🛡 ${t.label} miễn nhiễm ${e.condition} — bỏ "${e.name}"`);
    }
  }

  /** Is `target` grappled by `by`? */
  private grappledBy(target: Token, by: Token | undefined): boolean {
    if (!by) return false;
    const sid = this.linkedSheet(by)?.id;
    return !!target.effects?.some(
      (e) => (e.condition === 'grappled' || /grapple|bị ghì/i.test(e.name)) && (e.sourceTokenId === by.id || (!!sid && e.sourceSheetId === sid)),
    );
  }

  /** Player side = a token linked to a character sheet or handed to a player; everything else is the DM's. */
  private isPlayerSide(t: Token): boolean {
    return !!this.linkedSheet(t) || !!t.controllerId;
  }

  /** The active combatant moved from `from`: offer an Opportunity Attack to every hostile it left. */
  private offerOpportunityAttacks(mover: Token, from: { x: number; y: number }): void {
    const init = this.state.initiative;
    if (!init.running) return;
    const active = init.entries.find((e) => e.isActive);
    if (!active || active.tokenId !== mover.id) return;
    const reachOf = (t: Token) => {
      const sh = this.linkedSheet(t);
      const reachWeapon = !!sh?.inventory.some((it) => it.type === 'weapon' && it.equipped && /glaive|halberd|lance|pike|whip/i.test(it.name));
      return meleeReach(t, reachWeapon);
    };
    if (mechanicsOfKind(this.mechOf(mover), 'flyby').length) return; // flies out of reach without provoking
    if (mover.effects?.some((e) => e.noOpportunityAttacks)) return; // Disengage
    const reactors = opportunityReactors(mover, from, mover, this.state.tokens, (t) => this.isPlayerSide(t), reachOf);
    for (const r of reactors) {
      const list = (this.state.oaPrompts ??= []);
      if (list.some((p) => p.reactorTokenId === r.id && p.moverTokenId === mover.id)) continue;
      list.push({ id: nanoid(8), reactorTokenId: r.id, reactorName: r.label, moverTokenId: mover.id, moverName: mover.label, ts: Date.now() });
      this.systemLog(`⚔ ${mover.label} rời tầm với của ${r.label} — ${r.label} có thể đánh Opportunity Attack (nếu ${mover.label} không Disengage)`);
    }
  }

  /** A drag preview `actor` may show for this token (same rights and turn gate as a real move), or null. */
  previewMove(actor: Participant, id: string, x: number, y: number): { token: Token; x: number; y: number } | null {
    const token = this.state.tokens.find((tk) => tk.id === id);
    if (!token || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const isDm = actor.role === 'dm';
    if (!isDm && (token.controllerId !== actor.id || token.godsBaneBlade)) return null;
    if (isDm) return { token, x, y };
    const gate = this.moveGate(actor, token, { x, y });
    return gate.ok ? { token, x: gate.pos.x, y: gate.pos.y } : null;
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

  /** Legendary options it can take now: not locked since its last turn, affordable with the uses left. */
  private legendaryOptions(t: Token, pool = this.legendaryPool(t)) {
    return (legendaryInfo(t.statblock)?.options ?? []).filter((o) => !pool.locks.includes(o.name) && legendaryActionCost(o) <= pool.left);
  }

  /** Initiative roll for a token: advantage from its traits. */
  private initRollNotation(token: Token): { notation: string; why: string[] } {
    const mod = this.tokenInitMod(token);
    if (!token.statblock || this.linkedSheet(token)) return { notation: initNotation(mod), why: [] };
    const why = initiativeAdvantageWhy(this.mechOf(token), {
      conditions: tokenConditions(token),
      sameKindWithin: (ft) =>
        this.state.tokens.some((o) => o.id !== token.id && this.alive(o) && o.statblock?.name === token.statblock?.name && edgeFeet(o, tokenSpan(o), token, tokenSpan(token)) <= ft),
    });
    return { notation: why.length ? d20Check(mod, 'advantage') : initNotation(mod), why };
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
  /** Effect hints for the action being applied (attached to its attack / damage / heal log entries). */
  private fxCtx: RollFx | null = null;

  apply(actor: Participant, action: ClientAction): string | null {
    const prev = this.fxCtx;
    this.fxCtx = this.fxFor(action);
    try {
      return this.applyInner(actor, action);
    } finally {
      this.fxCtx = prev;
    }
  }

  private fxFor(action: ClientAction): RollFx | null {
    const tokOfSheet = (id?: string) => (id ? this.state.sheets.find((s) => s.id === id)?.tokenId : undefined);
    const types = (parts?: { type?: string }[]) => [...new Set((parts ?? []).map((p) => (p.type || '').toLowerCase()).filter(Boolean))];
    // the action name without the "Actor · " prefix and the trailing notes
    const name = (label: string) => label.replace(/^[^·]*·\s*/, '').replace(/\s*[(\[—].*$/, '').trim();
    switch (action.t) {
      case 'attack':
        return {
          from: action.attackerTokenId ?? tokOfSheet(action.attackerSheetId),
          to: action.targetTokenId,
          range: action.attackRange,
          kind: action.attackKind ?? 'weapon',
          name: action.actionName ?? name(action.label),
          types: types(action.damageParts),
        };
      case 'damage':
        return { from: action.attackerTokenId ?? tokOfSheet(action.attackerSheetId), to: action.targetTokenId, name: name(action.label), types: types(action.damageParts) };
      case 'spellSave':
        return {
          from: action.sourceTokenId ?? tokOfSheet(action.sourceSheetId),
          to: action.targetTokenId,
          kind: action.fromSpell ? 'spell' : undefined,
          name: action.actionName ?? name(action.label),
          types: types(action.damageOnFail),
          aoe: action.aoeId,
        };
      case 'heal':
        return { from: tokOfSheet(action.sourceSheetId), to: action.targetTokenId, heal: true, name: name(action.label) };
      default:
        return null;
    }
  }

  private applyInner(actor: Participant, action: ClientAction): string | null {
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

      case 'removeParticipant': {
        if (!isDm) return 'Chỉ DM được xóa người khỏi phòng';
        const target = this.state.participants.find((p) => p.id === action.participantId);
        if (!target) return 'Không tìm thấy người này trong phòng';
        if (target.id === actor.id) return 'Không tự xóa mình được';
        if (target.connected) return 'Người này đang online, chỉ xóa được người đã thoát';
        this.state.participants = this.state.participants.filter((p) => p.id !== target.id);
        this.touch();
        break;
      }

      case 'damage': {
        const target = this.state.tokens.find((tk) => tk.id === action.targetTokenId);
        if (!target) return 'Không tìm thấy token mục tiêu';
        if (target.godsBaneBlade) return "God's Bane không thể bị nhắm tới / gây sát thương";
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
        out.totalFinal = this.baneReduce(target, action.attackerTokenId, out.totalFinal);
        // A plain damage roll against a target is a hit the player resolved themselves.
        this.consumeHitRiders(action.attackerSheetId, dmgParts, actor.id, isDm);
        const took = this.applyDamage(target, out.totalFinal, { godsBane: !!this.godsBane() && isGodsBaneAttack(action.damageParts), types: partTypes(dmgParts) });
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
        {
          const atkTok = action.attackerTokenId ? this.state.tokens.find((tk) => tk.id === action.attackerTokenId) : undefined;
          const sheetId = action.attackerSheetId ?? (atkTok ? this.linkedSheet(atkTok)?.id : undefined);
          this.afterBaneAttack(target, { sheetId, tokenId: atkTok?.id }, isGodsBaneAttack(action.damageParts), true, actor);
        }
        this.touch();
        break;
      }

      case 'heal': {
        const target = this.state.tokens.find((tk) => tk.id === action.targetTokenId);
        if (!target) return 'Không tìm thấy token mục tiêu';
        {
          const healer = action.sourceSheetId ? this.state.tokens.find((t) => t.id === this.state.sheets.find((x) => x.id === action.sourceSheetId)?.tokenId) : undefined;
          if (healer && this.state.initiative.running) this.offerReactionsOf('healCast', healer, healer, `${healer.label} ra phép hồi máu`);
        }
        if (target.godsBaneBlade) return "God's Bane không thể bị nhắm tới";
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
        if (target.godsBaneBlade) return "God's Bane không thể bị nhắm tới";
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

      case 'setLight': {
        if (!isDm) return 'Chỉ DM được đổi ánh sáng';
        if (action.light !== null && !SCENE_LIGHTS.includes(action.light)) return 'Ánh sáng không hợp lệ';
        if (action.tokenId) {
          const tk = this.state.tokens.find((x) => x.id === action.tokenId);
          if (!tk) return 'Không tìm thấy token';
          tk.light = action.light ?? undefined;
          this.systemLog(`💡 ${tk.label}: ánh sáng ${action.light ? SCENE_LIGHT_VI[action.light] : 'theo cảnh'}`);
        } else {
          this.state.light = action.light;
          this.systemLog(`💡 Ánh sáng cảnh: ${action.light ? SCENE_LIGHT_VI[action.light] : 'không theo dõi'}`);
        }
        this.touch();
        break;
      }

      case 'stance': {
        if (!isDm) return 'Chỉ DM đổi trạng thái của quái';
        const tk = this.state.tokens.find((t) => t.id === action.tokenId);
        if (!tk) return 'Không tìm thấy token';
        if (!action.on) {
          if (tk.stance?.name === action.name) this.stanceOff(tk, 'DM tắt');
        } else {
          const st = mechanicsOfKind(this.mechOf(tk), 'stance').find((x) => x.name === action.name);
          if (!st) return 'Quái không có trạng thái này';
          const err = this.stanceOn(tk, st, '');
          if (err) return err;
        }
        this.touch();
        break;
      }

      case 'setLimbs': {
        if (!isDm) return 'Chỉ DM chỉnh chi của quái';
        const tk = this.state.tokens.find((t) => t.id === action.tokenId);
        if (!tk) return 'Không tìm thấy token';
        tk.limbs = Math.max(0, Math.round(action.limbs));
        this.touch();
        break;
      }

      case 'reactResolve': {
        const list = this.state.reactPrompts ?? [];
        const p = list.find((x) => x.id === action.id);
        if (!p) return null;
        if (p.style) {
          // a character's Protection / Interception: its owner (or the DM) answers
          if (!isDm && actor.id !== p.ownerId) return 'Reaction này của người chơi khác';
          this.state.reactPrompts = list.filter((x) => x.id !== p.id);
          const r = this.state.tokens.find((t) => t.id === p.tokenId);
          const held = p.holdsAttack ? this.heldAttacks.get(p.holdsAttack) : undefined;
          if (action.use && r && held && this.canReact(r, {}) && p.style === 'parry') {
            held.parry = { tokenId: r.id, by: `${p.tokenName} · ${p.actionName}`, ac: this.linkedSheet(r)?.proficiencyBonus ?? 2 };
          } else if (action.use && r && held && this.canReact(r, {}) && (p.style === 'halve' || p.style === 'reduce')) {
            // paid only if the attack hits (see the damage step)
            const sheet = this.linkedSheet(r);
            const rx = sheet ? passiveReactions(sheet).find((x) => x.featureId === p.featureId) : undefined;
            held.selfCut = {
              tokenId: r.id,
              by: `${p.tokenName} · ${p.actionName}`,
              halve: p.style === 'halve',
              dice: rx?.reaction.dice && sheet ? resolveFeatureFormula(rx.reaction.dice, sheet, rx.classKey) : undefined,
            };
          } else if (action.use && r && held && this.canReact(r, {}) && (p.style === 'counter' || p.style === 'stepAway')) {
            const cancelled = this.ownReaction(p, r, held);
            if (cancelled && p.holdsAttack) {
              this.cancelHeldAttack(p.holdsAttack, cancelled);
              this.touch();
              break;
            }
          } else if (action.use && r && held && this.canReact(r, {})) {
            if (p.style === 'protection') {
              this.spendReaction(r, {});
              held.dis = `${p.tokenName} · Protection`;
              this.systemLog(`🛡 ${p.tokenName} dùng Protection: đòn của ${p.triggerName ?? 'kẻ tấn công'} bị BẤT LỢI`);
            } else if (!held.intercept) {
              const sheet = this.linkedSheet(r);
              held.intercept = { tokenId: r.id, by: p.tokenName, dice: `1d10+${sheet?.proficiencyBonus ?? 2}` };
            }
          }
          if (p.holdsAttack) this.releaseHeldAttack(p.holdsAttack);
          this.touch();
          break;
        }
        if (!isDm) return 'Chỉ DM trả lời reaction của quái';
        this.state.reactPrompts = list.filter((x) => x.id !== p.id);
        const r = this.state.tokens.find((t) => t.id === p.tokenId);
        const a = r?.statblock?.actions.find((x) => x.id === p.actionId);
        const held = p.holdsAttack ? this.heldAttacks.get(p.holdsAttack) : undefined;
        if (!action.use || !r || !a || (held && !this.canReact(r, { actionId: a.id }))) {
          if (p.holdsAttack) this.releaseHeldAttack(p.holdsAttack);
          this.touch();
          break;
        }
        this.spendReaction(r, { actionId: a.id });
        const victim = p.triggerTokenId ? this.state.tokens.find((t) => t.id === p.triggerTokenId) : undefined;
        const disOnly = !!held && imposesAttackDisadvantage(a.description);
        if (disOnly) {
          held!.dis = `${r.label} · ${a.name}`;
          this.systemLog(`⚡ ${r.label} dùng ${a.name}: đòn của ${victim?.label ?? 'kẻ tấn công'} bị BẤT LỢI (hiệu ứng thêm nếu có: DM xử lý)`);
        } else if (a.save && victim) {
          const s = this.rollTokenSave(victim, a.save.ability, a.save.dc, false, failCondition(a.description));
          const parts = statblockDamageParts(a, r.statblock).map((x) => ({ dice: x.dice, type: x.type }));
          const half = /half (?:as much )?damage/i.test(a.description ?? '');
          if (!s.pass || half) {
            if (parts.length) this.mechDamage(victim, parts, `${r.label} · ${a.name}`, { halfOnSave: half });
          }
          const sw = mechanicsOfKind(this.mechOf(r), 'engulf').find((m) => m.actions.some((n) => n.toLowerCase() === a.name.toLowerCase()));
          if (!s.pass && sw) this.engulf(r, victim, sw);
          const cond = sw ? undefined : failCondition(a.description);
          if (!s.pass && cond) {
            victim.effects = [...(victim.effects ?? []), { id: nanoid(8), name: `${a.name} (${r.label})`, condition: cond, sourceTokenId: r.id, note: 'Từ reaction của quái; thời hạn xem mô tả' }];
          }
          this.systemLog(`⚡ ${r.label} dùng ${a.name} lên ${victim.label}: ${a.save.ability.toUpperCase()} cứu ${s.total}${s.modeNote} vs DC ${a.save.dc} — ${s.pass ? 'đỗ' : `trượt${cond ? ` → ${cond}` : ''}`}`);
        } else {
          this.systemLog(`⚡ ${r.label} dùng reaction: ${a.name}${victim ? ` (vì ${victim.label})` : ''} — DM xử lý phần còn lại`);
        }
        if (p.holdsAttack) this.releaseHeldAttack(p.holdsAttack);
        this.touch();
        break;
      }

      case 'escapeGrapple': {
        const tk = this.state.tokens.find((t) => t.id === action.tokenId);
        const eff = tk?.effects?.find((e) => e.id === action.effectId);
        if (!tk || !eff?.escapeDc) return 'Không có cú ghì để thoát';
        const sheet = this.linkedSheet(tk);
        if (!isDm && tk.controllerId !== actor.id && sheet?.ownerId !== actor.id) return 'Không phải token của bạn';
        // the better of Athletics / Acrobatics
        let bonus: number;
        let skill: string;
        if (sheet) {
          const ath = skillBonus(sheet, 'athletics');
          const acr = skillBonus(sheet, 'acrobatics');
          bonus = Math.max(ath, acr);
          skill = ath >= acr ? 'Athletics' : 'Acrobatics';
        } else {
          const sb = tk.statblock;
          const find = (n: string) => sb?.skills.find((s) => s.skill.toLowerCase() === n.toLowerCase())?.bonus;
          const ath = find('Athletics') ?? abilityMod(sb?.abilities.str ?? 10);
          const acr = find('Acrobatics') ?? abilityMod(sb?.abilities.dex ?? 10);
          bonus = Math.max(ath, acr) + exhaustionPenalty(tk.exhaustion);
          skill = ath >= acr ? 'Athletics' : 'Acrobatics';
        }
        const d20 = 1 + Math.floor(Math.random() * 20);
        const total = d20 + bonus;
        const ok = total >= eff.escapeDc;
        if (ok && eff.engulfedBy) {
          const holder = this.state.tokens.find((t) => t.id === eff.engulfedBy);
          if (holder) this.releaseEngulfed(holder, 'tự thoát', tk, false);
          else tk.effects = (tk.effects ?? []).filter((e) => e.engulfedBy !== eff.engulfedBy);
        } else if (ok) tk.effects = (tk.effects ?? []).filter((e) => e.id !== eff.id);
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label: `${tk.label} thoát ghì: ${skill} ${total} vs DC ${eff.escapeDc} — ${ok ? 'THOÁT' : 'vẫn bị ghì'}`,
          result: externalRollResult('1d20', { total, faces: [d20] }),
        });
        this.touch();
        break;
      }

      case 'resolvePick': {
        const list = this.state.pickPrompts ?? [];
        const p = list.find((x) => x.id === action.id);
        if (!p) return null;
        if (!isDm && p.ownerId !== actor.id) return 'Không phải lựa chọn của bạn';
        const tk = this.state.tokens.find((t) => t.id === p.tokenId);
        const anchor = this.state.tokens.find((t) => t.id === p.anchorTokenId);
        if (!action.skip && tk && typeof action.x === 'number' && typeof action.y === 'number') {
          const x = Math.round(action.x);
          const y = Math.round(action.y);
          if (x < 0 || y < 0 || x >= this.state.map.cols || y >= this.state.map.rows) return 'Điểm nằm ngoài bản đồ';
          if (anchor && gridFeet(anchor, { x, y }) > p.maxFeet) return `Quá ${p.maxFeet}ft tính từ ${anchor.label}`;
          tk.x = x;
          tk.y = y;
          this.systemLog(`${p.label} — ${tk.label} bị dịch chuyển tới ô (${x}, ${y})`);
        }
        this.state.pickPrompts = list.filter((x) => x.id !== p.id);
        this.touch();
        break;
      }

      case 'addHazard': {
        const h = action.hazard;
        if (!h || typeof h.radiusFt !== 'number' || !h.dice) return 'Vùng không hợp lệ';
        const src = h.sourceTokenId ? this.state.tokens.find((t) => t.id === h.sourceTokenId) : undefined;
        if (!isDm && src && src.controllerId !== actor.id && this.linkedSheet(src)?.ownerId !== actor.id) return 'Không phải phép của bạn';
        (this.state.hazards ??= []).push({ ...h, id: nanoid(8), hitThisTurn: [] });
        this.systemLog(`🌀 ${h.label}: vùng ${h.radiusFt}ft tồn tại tới đầu lượt sau của người ra phép (vào hoặc kết thúc lượt trong vùng: save ${h.save.toUpperCase()} DC ${h.dc})`);
        this.touch();
        break;
      }

      case 'removeHazard': {
        this.state.hazards = (this.state.hazards ?? []).filter((h) => h.id !== action.id);
        this.touch();
        break;
      }

      case 'oaResolve': {
        const list = this.state.oaPrompts ?? [];
        const p = list.find((x) => x.id === action.id);
        if (!p) return null;
        const reactor = this.state.tokens.find((t) => t.id === p.reactorTokenId);
        const sheet = reactor ? this.linkedSheet(reactor) : undefined;
        if (!isDm && reactor?.controllerId !== actor.id && sheet?.ownerId !== actor.id) return 'Không phải lượt phản ứng của bạn';
        this.state.oaPrompts = list.filter((x) => x.id !== p.id);
        if (action.used && reactor) reactor.turnUsed = { ...(reactor.turnUsed ?? {}), reaction: true };
        if (!action.used) this.systemLog(`${p.reactorName} bỏ qua Opportunity Attack lên ${p.moverName}`);
        this.touch();
        break;
      }

      case 'setMoon': {
        if (!isDm) return 'Chỉ DM được đổi trăng';
        const m = action.moon;
        if (m && (typeof m.key !== 'string' || typeof m.name !== 'string' || m.key.length > 40 || m.name.length > 80))
          return 'Trăng không hợp lệ';
        const prev = this.state.moon;
        this.state.moon = m ? { key: m.key, name: m.name, since: Date.now() } : null;
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: 'system',
          actorName: 'Hệ thống',
          label: m ? `🌕 Eldritch Moon mọc: ${m.name}` : `🌑 ${prev?.name ?? 'Trăng'} đã lặn`,
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
        // God's Bane Cleaving Causality: a sworn player's own next d20 becomes a natural 20.
        let causalityNote = '';
        if (result.d20) {
          const own = this.godsBane()?.armed?.find(
            (a) => a.mode === 'crit' && this.state.sheets.some((x) => x.id === a.sheetId && x.ownerId === actor.id),
          );
          const c = own ? this.causalityD20({ sheetId: own.sheetId, enemy: false }) : undefined;
          if (c) {
            result = forceD20(result, c.natural);
            causalityNote = c.note;
          }
        }
        // Reliable Talent: a low d20 counts as the floor; Indomitable Might: a low total counts as the score
        if (action.d20Min && result.d20 && result.d20.natural < action.d20Min) {
          const from = result.d20.natural;
          result = forceD20Value(result, action.d20Min);
          causalityNote += ` · ${action.floorWhy ?? 'sàn'}: d20 ${from} → ${action.d20Min}`;
        }
        if (action.totalMin && result.total < action.totalMin) {
          causalityNote += ` · ${action.floorWhy ?? 'sàn'}: tổng ${result.total} → ${action.totalMin}`;
          result = { ...result, total: action.totalMin };
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
          label: (action.label || 'Roll') + causalityNote,
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
        if (target.godsBaneBlade) return "God's Bane không thể bị nhắm tới";
        // A reaction that answers "is targeted by an attack" (impose disadvantage…) must come BEFORE the
        // roll: the attack waits here until the DM has answered, then runs again via `reactResolve`.
        const resume = this.resumingAttack;
        this.resumingAttack = null;
        if (!resume && this.heldAttacks.size) {
          // the rest of a Multiattack lines up behind the attack that is waiting: order is kept
          this.attackQueue.push({ actor, action });
          this.touch();
          break;
        }
        if (!resume && this.holdAttackForReactions(actor, action, target)) {
          this.touch();
          break;
        }
        {
          // Help is spent by the first ally attack on its target; attacking gives a hidden attacker away.
          const attacker = action.attackerTokenId
            ? this.state.tokens.find((t) => t.id === action.attackerTokenId)
            : this.state.tokens.find((t) => this.state.sheets.some((x) => x.id === action.attackerSheetId && x.tokenId === t.id));
          const help = target.effects?.find((e) => e.attackersAdvantage && !e.attackersAdvantageKeep && e.sourceTokenId !== attacker?.id);
          if (help) target.effects = target.effects!.filter((e) => e !== help);
          // Sap: disadvantage on the bearer's next attack only. Vex: advantage on this attacker's next attack on it.
          if (attacker?.effects?.some((e) => e.consumeOnAttack)) attacker.effects = attacker.effects.filter((e) => !e.consumeOnAttack);
          if (attacker && target.effects?.some((e) => e.vexBy === attacker.id)) target.effects = target.effects.filter((e) => e.vexBy !== attacker.id);
          if (action.cleave) {
            if (!attacker?.turnUsed?.cleaveReady || attacker.turnUsed.cleaveUsed) return 'Cleave: cần một đòn cận chiến trúng trước đó trong lượt (1 lần/lượt)';
            attacker.turnUsed = { ...attacker.turnUsed, cleaveUsed: true };
          }
          const hid = attacker?.effects?.find((e) => e.hiddenStealth != null);
          if (attacker && hid) {
            attacker.effects = attacker.effects!.filter((e) => e !== hid);
            this.systemLog(`${attacker.label}: lộ vị trí (tấn công khi đang ẩn nấp)`);
          }
        }
        // God's Bane: a divine weapon attacking a creature within 5 ft of the blade has disadvantage.
        const godsBaneDis = this.divineDisadvantage(target, action.damageParts);
        // the reason for disadvantage: God's Bane near a divine weapon, or a reaction the DM just used
        const disWhy = godsBaneDis ? "vũ khí thần thánh gần God's Bane" : resume?.dis;
        const divineDis = !!disWhy;
        let divineNote = '';
        if (divineDis && !action.external) {
          const d = withDisadvantage(action.attackNotation);
          if (d) {
            action.attackNotation = d.notation;
            divineNote = d.cancelled ? ` · ⚖ ${disWhy}: bất lợi triệt tiêu lợi thế` : ` · ⬇ ${disWhy}: BẤT LỢI`;
          } else divineNote = ` · ⚠ ${disWhy}: bất lợi (công thức không có d20 — tự xử lý)`;
        }
        // Cover benefit is added to the target's AC automatically (homebrew).
        const baseAc = this.tokenAc(target);
        const rawCover = target.cover ?? 'none';
        // cover-reducing feat: ranged WEAPON attacks ignore half cover, three-quarters counts as half
        const atkSheetForCover = action.attackerSheetId ? this.state.sheets.find((s) => s.id === action.attackerSheetId) : undefined;
        const cover =
          action.attackRange === 'ranged' && action.attackKind !== 'spell'
            ? passiveRangedCover(atkSheetForCover, rawCover)
            : action.attackKind === 'spell' && (rawCover === 'half' || rawCover === 'threequarters') && passiveHas(atkSheetForCover, 'spellIgnoreCover')
              ? 'none'
              : action.attackRange === 'ranged' && action.attackKind === 'spell' && rawCover === 'half' && passiveHas(atkSheetForCover, 'spellIgnoreHalfCover')
                ? 'none'
                : rawCover;
        let ac = baseAc + coverAcBonus(cover);
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
        if (divineDis && action.external) {
          // dddice already rolled: a straight d20 gets a second, server-rolled d20 and keeps the lower.
          const plain = /^(1?d20)(?![0-9])/i.test(action.attackNotation.trim()) && attackRoll.d20;
          if (plain && attackRoll.d20) {
            const second = rollNotation('1d20').total;
            if (second < attackRoll.d20.natural) attackRoll = forceD20Value(attackRoll, second);
            divineNote = ` · ⬇ ${disWhy}: BẤT LỢI (d20 thứ hai ${second})`;
          } else divineNote = ` · ⚠ ${disWhy}: BẤT LỢI — xúc xắc ngoài có lợi thế, DM tự xử lý`;
        }
        // God's Bane: −N for a rejected wielder, Cleaving Causality on this d20.
        const baneAtkTok = action.attackerTokenId ? this.state.tokens.find((tk) => tk.id === action.attackerTokenId) : undefined;
        const baneSheetId = action.attackerSheetId ?? (baneAtkTok ? this.linkedSheet(baneAtkTok)?.id : undefined);
        const withGodsBane = isGodsBaneAttack(action.damageParts);
        let baneNote = divineNote;
        const banePenalty = baneAttackPenalty(this.godsBane(), baneSheetId, withGodsBane);
        if (banePenalty) {
          attackRoll = { ...attackRoll, total: attackRoll.total - banePenalty };
          baneNote += ` · kiếm chối bỏ −${banePenalty}`;
        }
        // 2024 Exhaustion: −2 × level on the attacker's attack roll (any source: PC, monster, spell).
        const exhLevel = baneAtkTok
          ? this.tokenExhaustion(baneAtkTok)
          : (this.state.sheets.find((s) => s.id === action.attackerSheetId)?.exhaustion ?? 0);
        const exhPen = -exhaustionPenalty(exhLevel);
        if (exhPen) {
          attackRoll = { ...attackRoll, total: attackRoll.total - exhPen };
          baneNote += ` · Exhaustion ${exhLevel} −${exhPen}`;
        }
        const baneCausality = attackRoll.d20 ? this.causalityD20({ sheetId: baneSheetId, enemy: !baneSheetId && !!baneAtkTok }) : undefined;
        if (baneCausality) {
          attackRoll = forceD20(attackRoll, baneCausality.natural);
          baneNote += baneCausality.note;
        }
        // The client pre-rolled damage for the outcome it saw; a changed roll means the server re-rolls it.
        if (baneNote && action.external) action.external = { ...action.external, partTotals: undefined };
        // Defensive Duelist: the parry chosen before the roll is spent only on an attack that would hit
        if (resume?.parry && resolveAttack(attackRoll, ac).hit) {
          const me = this.state.tokens.find((t) => t.id === resume.parry!.tokenId);
          if (me && this.canReact(me, {})) {
            this.spendReaction(me, {});
            ac += resume.parry.ac;
            this.pendingBaneLogs.push(`🤺 ${resume.parry.by}: +${resume.parry.ac} AC trước đòn này (AC ${ac})`);
          }
        }
        // Seeking Spell: a missed spell attack rolls its d20 once more (the new roll stands)
        if (action.rerollMiss && attackRoll.d20 && !resolveAttack(attackRoll, ac).hit) {
          const again = rollNotation('1d20').total;
          attackRoll = forceD20Value(attackRoll, again);
          if (action.external) action.external = { ...action.external, partTotals: undefined };
          this.pendingBaneLogs.push(`✨ Seeking Spell: trượt → đổ lại d20 = ${again}`);
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
        // Monster mechanics on this attack: a wider crit range, or an automatic crit (target grappled by it).
        const atkMechs = this.mechOf(attackerTok);
        const nat = attackRoll.d20?.natural;
        // Boon of Combat Prowess: once per turn a miss becomes a hit
        const prowessSheet = attackerTok ? this.linkedSheet(attackerTok) : undefined;
        if (!res.hit && attackerTok && passiveHas(prowessSheet, 'missToHit') && !(attackerTok.turnUsed?.featOnce ?? []).includes('prowess')) {
          Object.assign(res, { hit: true, fumble: false });
          attackerTok.turnUsed = { ...(attackerTok.turnUsed ?? {}), featOnce: [...(attackerTok.turnUsed?.featOnce ?? []), 'prowess'] };
          if (action.external) action.external = { ...action.external, partTotals: undefined };
          this.pendingBaneLogs.push(`⚔ ${prowessSheet!.name} · Boon of Combat Prowess: trượt → TRÚNG`);
        }
        // a wider crit range: monster mechanics, or an effect on the attacker (a minute of 19–20…)
        const fxCrit = Math.min(20, ...(attackerTok?.effects ?? []).map((e) => e.critMin ?? 20));
        const critFrom = Math.min(atkMechs.length ? critMin(atkMechs, action.actionName) : 20, fxCrit);
        if (nat && nat < 20 && nat >= critFrom) {
          Object.assign(res, { hit: true, crit: true, fumble: false });
          if (action.external) action.external = { ...action.external, partTotals: undefined }; // re-roll as a crit
          this.pendingBaneLogs.push(`💥 ${attackerTok?.label}: chí mạng với ${nat} (${critFrom}–20)`);
        }
        // The target's automatic reactions (monsters): Parry when it turns the hit into a miss, a DEX-save dodge.
        const tgtMechs = this.mechOf(target);
        if (res.hit && tgtMechs.length && target.autoReactions !== false) {
          const parry = mechanicsOfKind(tgtMechs, 'parry').find((p) => this.canReact(target, p));
          if (parry && action.attackRange === 'melee' && !res.crit && attackRoll.total < ac + parry.ac) {
            this.spendReaction(target, parry);
            Object.assign(res, { hit: false });
            this.pendingBaneLogs.push(`🛡 ${target.label}: ${parry.from} (+${parry.ac} AC → ${ac + parry.ac}) — đòn trượt`);
          }
          const dodge = res.hit ? mechanicsOfKind(tgtMechs, 'dodgeSave').find((p) => this.canReact(target, p) && (!p.meleeOnly || action.attackRange === 'melee')) : undefined;
          if (dodge) {
            this.spendReaction(target, dodge);
            const s = this.rollTokenSave(target, 'dex', attackRoll.total);
            if (s.pass) Object.assign(res, { hit: false, crit: false });
            this.pendingBaneLogs.push(`💨 ${target.label}: ${dodge.from} — DEX cứu ${s.total}${s.modeNote} vs ${attackRoll.total} ${s.pass ? '✔ né được, đòn trượt' : '✘ không né kịp'} (lùi 5–10 ft: dời tay)`);
          }
        }
        if (action.attackKind === 'spell' && attackerTok) this.offerReactionsOf('spellCast', attackerTok, attackerTok, `${attackerTok.label} ra phép`);
        const mechCrit = res.hit && atkMechs.length ? mechanicAutoCrit(atkMechs, action.actionName, { targetGrappledBySelf: this.grappledBy(target, attackerTok) }) : null;
        if (mechCrit && !res.crit) {
          if (action.external) action.external = { ...action.external, partTotals: undefined };
          this.pendingBaneLogs.push(`💥 ${mechCrit}: mục tiêu đang bị ghì → chí mạng`);
        }
        const autoCrit =
          !!mechCrit ||
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

        if (res.hit && atkMechs.length)
          for (const x of mechanicsOfKind(atkMechs, 'hitExtraDamage'))
            if (!x.meleeOnly || action.attackRange === 'melee') dmgParts.push({ dice: x.dice, type: x.type, label: x.from });
        if (effectiveCrit && atkMechs.length) dmgParts.push(...critExtraParts(atkMechs, action.attackRange === 'melee', dmgParts[0]?.type ?? ''));
        let damageResult: RollResult | undefined;
        let outcome: MultiDamageOutcome | undefined;
        if (res.hit) {
          if (!dmgParts.length) return 'Không có nguồn sát thương';
          let rd;
          const atkSheetF = action.attackerSheetId ? this.state.sheets.find((s) => s.id === action.attackerSheetId) : attackerTok ? this.linkedSheet(attackerTok) : undefined;
          const weaponHit = action.attackKind !== 'spell';
          const once = (k: string) => !!attackerTok && !(attackerTok.turnUsed?.featOnce ?? []).includes(k);
          const markOnce = (k: string) => {
            if (attackerTok) attackerTok.turnUsed = { ...(attackerTok.turnUsed ?? {}), featOnce: [...(attackerTok.turnUsed?.featOnce ?? []), k] };
          };
          // Piercer: once per turn the lowest piercing die is rolled again; a crit adds one more die
          const pi = weaponHit && passiveHas(atkSheetF, 'piercer') ? dmgParts.findIndex((p) => p.type === 'piercing' && /\d*d\d+/.test(p.dice)) : -1;
          if (pi >= 0) {
            if (once('piercer')) {
              dmgParts[pi] = { ...dmgParts[pi], rerollLowest: Math.max(1, dmgParts[pi].rerollLowest ?? 0) };
              markOnce('piercer');
              this.pendingBaneLogs.push(`🗡 Piercer: đổ lại 1 xúc xắc thấp nhất`);
            }
            if (effectiveCrit) {
              const die = /d(\d+)/.exec(dmgParts[pi].dice)?.[1];
              if (die) dmgParts.push({ dice: `1d${die}`, type: 'piercing', label: 'Piercer (chí mạng)' });
            }
          }
          // Boon of Irresistible Offense: B/P/S ignore resistance; a natural 20 adds the STR/DEX score
          if (weaponHit && passiveHas(atkSheetF, 'irresistibleOffense')) {
            for (let i = 0; i < dmgParts.length; i++)
              if (['bludgeoning', 'piercing', 'slashing'].includes((dmgParts[i].type || '').toLowerCase())) dmgParts[i] = { ...dmgParts[i], ignoreResist: true };
            if (nat === 20 && atkSheetF) dmgParts.push({ dice: String(Math.max(atkSheetF.abilities.str, atkSheetF.abilities.dex)), type: dmgParts[0]?.type ?? '', label: 'Irresistible Offense', ignoreResist: true });
          }
          try {
            rd = this.rollDamageParts(dmgParts, effectiveCrit, action.external?.partTotals);
            // Savage Attacker: once per turn the weapon's damage is rolled twice, the higher one stands
            if (weaponHit && passiveHas(atkSheetF, 'savageAttacker') && once('savage')) {
              const again = this.rollDamageParts(dmgParts, effectiveCrit, undefined);
              markOnce('savage');
              this.pendingBaneLogs.push(`🪓 Savage Attacker: ${rd.combined.total} / ${again.combined.total} → lấy ${Math.max(rd.combined.total, again.combined.total)}`);
              if (again.combined.total > rd.combined.total) rd = again;
            }
          } catch (err) {
            return (err as Error).message;
          }
          damageResult = rd.combined;
          outcome = resolveDamageParts(rd.rolled, def);
          this.consumeHitRiders(action.attackerSheetId, dmgParts, actor.id, isDm);
        }

        const coverNote =
          (cover === 'total'
            ? ' · ⚠ mục tiêu che hoàn toàn'
            : cover !== 'none'
              ? ` · ${cover === 'half' ? 'nửa che' : '3/4 che'} (+${coverAcBonus(cover)} AC)`
              : '') + (cover !== rawCover ? ' · feat giảm che chắn' : '');

        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label: `${action.label || 'Attack'}${coverNote}${baneNote}`,
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
        if (outcome) outcome = { ...outcome, totalFinal: this.baneReduce(target, action.attackerTokenId, outcome.totalFinal) };
        // Interception (fighting style): the reaction is taken once the hit is known
        if (outcome && resume?.intercept) {
          const r = this.state.tokens.find((t) => t.id === resume.intercept!.tokenId);
          if (r && this.canReact(r, {}) && outcome.totalFinal > 0) {
            this.spendReaction(r, {});
            const red = rollNotation(resume.intercept.dice).total;
            const before = outcome.totalFinal;
            outcome = { ...outcome, totalFinal: Math.max(0, before - red) };
            this.pendingBaneLogs.push(`🛡 ${resume.intercept.by} · Interception: giảm ${red} sát thương (${resume.intercept.dice}) — ${before} → ${outcome.totalFinal}`);
          }
        }
        // Heavy Armor Master: bludgeoning / piercing / slashing from an attack is lower by the Proficiency Bonus
        const hamSheet = this.linkedSheet(target);
        if (
          outcome &&
          outcome.totalFinal > 0 &&
          hamSheet &&
          passiveHas(hamSheet, 'heavyArmorReduce') &&
          hamSheet.inventory.some((it) => it.type === 'armor' && it.equipped && it.armorCategory === 'heavy') &&
          dmgParts.some((p) => ['bludgeoning', 'piercing', 'slashing'].includes((p.type || '').toLowerCase()))
        ) {
          const before = outcome.totalFinal;
          outcome = { ...outcome, totalFinal: Math.max(0, before - hamSheet.proficiencyBonus) };
          this.pendingBaneLogs.push(`🛡 ${hamSheet.name} · Heavy Armor Master: −${hamSheet.proficiencyBonus} (${before} → ${outcome.totalFinal})`);
        }
        // the target's own cut taken before the roll: Uncanny Dodge halves, Deflect Attacks reduces
        if (outcome && resume?.selfCut) {
          const me = this.state.tokens.find((t) => t.id === resume.selfCut!.tokenId);
          if (me && this.canReact(me, {}) && outcome.totalFinal > 0) {
            this.spendReaction(me, {});
            const before = outcome.totalFinal;
            const red = resume.selfCut.halve ? Math.ceil(before / 2) : resume.selfCut.dice ? rollNotation(resume.selfCut.dice).total : 0;
            outcome = { ...outcome, totalFinal: Math.max(0, before - red) };
            this.pendingBaneLogs.push(
              `🛡 ${resume.selfCut.by}: ${resume.selfCut.halve ? 'nửa sát thương' : `giảm ${red} (${resume.selfCut.dice})`} — ${before} → ${outcome.totalFinal}`,
            );
          }
        }
        if (outcome && damageResult && tgtMechs.length && target.autoReactions !== false) {
          const cut = mechanicsOfKind(tgtMechs, 'reduceDamage').find((p) => this.canReact(target, p));
          if (cut && outcome.totalFinal > 0) {
            this.spendReaction(target, cut);
            let red = 0;
            try {
              red = rollNotation(cut.dice).total;
            } catch {
              red = 0;
            }
            const before = outcome.totalFinal;
            outcome = { ...outcome, totalFinal: Math.max(0, before - red) };
            this.pendingBaneLogs.push(`🛡 ${target.label}: ${cut.from} — giảm ${red} sát thương (${before} → ${outcome.totalFinal})`);
          }
        }
        // Spiked bodies: a melee hit from close by hurts the attacker.
        if (res.hit && action.attackRange === 'melee' && attackerTok && tgtMechs.length) {
          for (const th of mechanicsOfKind(tgtMechs, 'thorns')) {
            if (edgeFeet(attackerTok, tokenSpan(attackerTok), target, tokenSpan(target)) <= th.radiusFt) this.mechDamage(attackerTok, [{ dice: th.dice, type: th.type }], `${target.label} · ${th.from}`);
          }
        }
        if (damageResult && outcome) {
          const hadTemp = this.tempOf(target);
          const retEff = target.effects?.find((e) => e.retaliate); // captured before the temp HP (and effect) are used up
          const took = this.applyDamage(target, outcome.totalFinal, { godsBane: !!this.godsBane() && withGodsBane, crit: effectiveCrit, types: partTypes(dmgParts) });
          const applied = took.applied;
          // a creature held inside the target hurting it from within: enough in one turn and it's spat out
          if (attackerTok?.effects?.some((e) => e.engulfedBy === target.id)) {
            target.engulfDmgTurn = (target.engulfDmgTurn ?? 0) + applied + took.absorbed;
            const esc = mechanicsOfKind(tgtMechs, 'engulf').find((m) => m.escapeDamage);
            if (esc?.escapeDamage && target.engulfDmgTurn >= esc.escapeDamage) this.releaseEngulfed(target, `nhận ${target.engulfDmgTurn} sát thương từ bên trong`);
          }
          if (attackerTok && atkMechs.length) {
            const sw = mechanicsOfKind(atkMechs, 'engulf').find((m) => m.actions.some((n) => n.toLowerCase() === (action.actionName ?? '').toLowerCase()));
            if (sw && (!sw.requiresGrappled || this.grappledBy(target, attackerTok))) this.engulf(attackerTok, target, sw);
            // A hit that grapples (escape DC), if the target isn't too big and isn't already held by it.
            const g = onHitGrappleFor(atkMechs, action.actionName);
            if (g && !this.grappledBy(target, attackerTok) && (!g.maxSize || sizeIndex(target.size) <= sizeIndex(g.maxSize))) {
              target.effects = [
                ...(target.effects ?? []),
                { id: nanoid(8), name: `Bị ghì (${attackerTok.label})`, condition: 'grappled', sourceTokenId: attackerTok.id, escapeDc: g.escapeDc, note: `Thoát: Athletics/Acrobatics DC ${g.escapeDc} (action)` },
              ];
              this.pendingBaneLogs.push(`🤼 ${attackerTok.label} ghì ${target.label} (thoát DC ${g.escapeDc})`);
            }
            // Life drain: heals by the damage dealt (of one type when the text says so).
            const ls = lifestealFor(atkMechs, action.actionName);
            if (ls && (!ls.ifTargetCondition || tokenConditions(target).includes(ls.ifTargetCondition as ConditionType))) {
              const amount = ls.type
                ? outcome.parts.filter((p) => p.type.toLowerCase() === ls.type).reduce((n, p) => n + p.final, 0)
                : applied + took.absorbed;
              const healed = amount > 0 ? this.applyHeal(attackerTok, amount) : 0;
              if (healed > 0) this.pendingBaneLogs.push(`🩸 ${attackerTok.label} hút ${healed} HP (${ls.from ?? 'hút máu'})`);
            }
            // A hit heals it ("after hitting … regaining N hit points") (not off constructs etc. when the text says so)
            for (const h of mechanicsOfKind(atkMechs, 'healOnHit')) {
              const kind = (target.statblock?.meta ?? '').toLowerCase();
              if (h.notTypes?.some((x) => kind.includes(x))) continue;
              const healed = this.applyHeal(attackerTok, rollNotation(h.dice).total);
              if (healed > 0) this.pendingBaneLogs.push(`🍖 ${attackerTok.label} hồi ${healed} HP (${h.from ?? 'đánh trúng'})`);
            }
          }
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
          this.maybeBreakConcentration(target, outcome.totalFinal, passiveHas(attackerTok ? this.linkedSheet(attackerTok) : undefined, 'mageSlayer') ? 'Mage Slayer' : undefined);
          if (outcome.totalFinal > 0) this.featHitEffects(action, target, attackerTok, effectiveCrit);
          if (action.onHit?.length) this.applyOnHit(action.onHit, target, attackerTok);
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
          // charged attack riders spend a use on every hit they added to
          const atkTok = action.attackerTokenId ? this.state.tokens.find((t) => t.id === action.attackerTokenId) : undefined;
          if (atkTok && res.hit) {
            const labels = new Set(dmgParts.map((p) => p.label));
            for (const e of [...(atkTok.effects ?? [])]) {
              if (e.charges != null && e.attackRiders?.some((r) => labels.has(r.label))) this.spendEffectCharge(atkTok, e);
            }
          }
        }
        this.afterBaneAttack(target, { sheetId: baneSheetId, tokenId: baneAtkTok?.id }, withGodsBane, res.hit, actor);
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
        // Spell attacks that move the target on a hit (pull toward / push away, maybe behind a save).
        if (res.hit && action.moveOnHit && action.attackerTokenId) {
          const from = this.state.tokens.find((tk) => tk.id === action.attackerTokenId);
          const mv = action.moveOnHit;
          let moves = !!from;
          let saveNote = '';
          if (from && mv.save) {
            const large = ['large', 'huge', 'gargantuan'].includes(target.size);
            const s = this.rollTokenSave(target, mv.save.ability, mv.save.dc, false, undefined, mv.save.largeAdvantage && large ? 'advantage' : undefined, true);
            moves = !s.pass;
            saveNote = ` · ${mv.save.ability.toUpperCase()} cứu ${s.total}${s.modeNote} vs DC ${mv.save.dc} ${s.pass ? '✔' : '✘'}`;
          }
          const fm = moves && from ? this.forceMove(target, from, mv.dir, mv.feet) : { feet: 0, collided: false };
          const ft = fm.feet;
          const crash = fm.collided && !!mv.collideCondition;
          if (crash) {
            target.effects = [
              ...(target.effects ?? []),
              { id: nanoid(8), name: `Đâm vật cản (${(action.label || 'Attack').replace(/\s*\[.*?\]/g, '')})`, condition: mv.collideCondition, expiresRound: this.state.initiative.round + 1 },
            ];
          }
          this.systemLog(
            `${action.label || 'Attack'}${saveNote} — ${ft > 0 || fm.collided ? `${mv.dir === 'push' ? 'đẩy' : 'kéo'} ${target.label} ${ft}ft${fm.collided ? ' · đâm vật cản' : ''}${crash ? ` → ${mv.collideCondition}` : ''}` : `${target.label} không bị dời`}`,
          );
        }
        // An effect placed on a critical hit (stunned until the caster's next turn…).
        if (effectiveCrit && action.effectOnCrit) {
          target.effects = [...(target.effects ?? []), { ...action.effectOnCrit, id: nanoid(8) }];
          this.systemLog(`💥 Chí mạng — ${target.label}: ${action.effectOnCrit.name}`);
        }
        // Once per turn: a melee crit or a kill earns one more melee attack (feat reminder).
        {
          const atkSheet = action.attackerSheetId ? this.state.sheets.find((s) => s.id === action.attackerSheetId) : undefined;
          const atkTok = action.attackerTokenId ? this.state.tokens.find((tk) => tk.id === action.attackerTokenId) : undefined;
          const dropped = typeof target.currentHp === 'number' && target.currentHp <= 0;
          if (
            res.hit &&
            action.attackRange === 'melee' &&
            (effectiveCrit || dropped) &&
            atkTok &&
            !atkTok.turnUsed?.bonusAttackReminder &&
            passiveExtraAttackOnCritOrKill(atkSheet)
          ) {
            atkTok.turnUsed = { ...(atkTok.turnUsed ?? {}), bonusAttackReminder: true };
            this.systemLog(`⚔ ${atkSheet?.name ?? atkTok.label} ${effectiveCrit ? 'chí mạng' : 'hạ gục mục tiêu'} — được đánh thêm 1 đòn cận chiến (không tốn action, 1 lần/lượt)`);
          }
        }
        if (action.mastery) this.applyMastery(action, target, res.hit, !!outcome && outcome.totalFinal > 0, actor);
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

      case 'fogExplore': {
        const m = this.state.map;
        if (!m.fog?.enabled || !m.fog.explore) return null;
        const n = m.cols * m.rows;
        const cells = (action.cells ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < n).slice(0, n);
        if (!cells.length) return null;
        const next = exploredMark(m.explored, m.cols, m.rows, cells);
        if (next === m.explored) return null;
        m.explored = next;
        this.activeScene().map = m;
        this.touch();
        break;
      }

      case 'toggleDoor': {
        const w = (this.state.map.walls ?? []).find((x) => x.id === action.wallId && x.door);
        if (!w) return 'Không có cửa này';
        this.state.map.walls = (this.state.map.walls ?? []).map((x) => (x.id === w.id ? { ...x, open: !x.open } : x));
        this.activeScene().map = this.state.map;
        this.systemLog(`🚪 ${actor.name} ${w.open ? 'đóng' : 'mở'} cửa`);
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
        if (src.godsBaneBlade) return "Chỉ có một God's Bane";
        this.state.tokens.push(
          createToken({
            // a cloned monster gets the next number; a cloned PC/prop keeps its name
            label: src.statblock ? this.nextMonsterLabel(src.label) : src.label,
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
            baneTag: src.baneTag,
            undying: src.undying,
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
        if (token.godsBaneBlade && !isDm) return "Chỉ DM di chuyển được God's Bane";
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
        if (token.godsBaneBlade) {
          // No AC / HP, and it stays the blade.
          delete patch.currentHp;
          delete patch.maxHp;
          delete patch.tempHp;
          delete patch.armorClass;
          delete patch.godsBaneBlade;
        }
        Object.assign(token, patch);
        if (typeof patch.currentHp === 'number' && patch.currentHp > 0 && !linked) token.downedUndying = undefined;
        if (linked) {
          if (typeof patch.currentHp === 'number') linked.currentHp = patch.currentHp;
          if (typeof patch.maxHp === 'number') linked.maxHp = patch.maxHp;
          if (typeof patch.tempHp === 'number') linked.tempHp = patch.tempHp;
          if (typeof patch.currentHp === 'number') this.syncDowned(linked);
        }
        if (movingPos && (token.x !== beforeX || token.y !== beforeY)) {
          for (const v of this.state.tokens) {
            if (v.id !== token.id && v.effects?.some((e) => e.engulfedBy === token.id)) {
              v.x = token.x;
              v.y = token.y;
            }
          }
          this.offerOpportunityAttacks(token, { x: beforeX, y: beforeY });
          for (const h of this.state.hazards ?? []) {
            const was = this.inHazard({ ...token, x: beforeX, y: beforeY }, h);
            if (!was && this.inHazard(token, h)) this.hazardHit(token, h, 'đi vào vùng');
          }
          for (const b of this.state.tokens) {
            if (b.id === token.id || !this.alive(b) || this.isPlayerSide(b) === this.isPlayerSide(token)) continue;
            for (const m of mechanicsOfKind(this.mechOf(b), 'reaction')) {
              if (m.trigger !== 'nearStart' || !m.enters) continue;
              const r = m.radiusFt ?? 5;
              const was = edgeFeet({ x: beforeX, y: beforeY }, tokenSpan(token), b, tokenSpan(b)) <= r;
              if (!was && edgeFeet(token, tokenSpan(token), b, tokenSpan(b)) <= r) this.offerReaction(b, m, token, `${token.label} đi vào cạnh`);
            }
            for (const a of mechanicsOfKind(this.mechOf(b), 'aura')) {
              if (a.trigger !== 'startOrEnter') continue;
              const was = edgeFeet({ x: beforeX, y: beforeY }, tokenSpan(token), b, tokenSpan(b)) <= a.radiusFt;
              if (!was && edgeFeet(token, tokenSpan(token), b, tokenSpan(b)) <= a.radiusFt) this.applyAura(b, token, a, 'đi vào vùng');
            }
          }
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
        if (!isDm && token.controllerId !== actor.id && this.linkedSheet(token)?.ownerId !== actor.id) return 'Bạn không điều khiển token này';
        const cost = action.cost ?? 'action';
        if (this.state.initiative.running) {
          // Dash is an Action (a Bonus Action with Cunning Action & co.): one per turn, not free.
          if (token.turnUsed?.[cost] && !isDm) return `${cost === 'action' ? 'Action' : 'Bonus Action'} lượt này đã dùng — không Dash được nữa`;
          token.turnUsed = { ...(token.turnUsed ?? {}), [cost]: true };
        }
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

      case 'turnAction': {
        const token = this.state.tokens.find((tk) => tk.id === action.tokenId);
        if (!token) return 'Token không tồn tại';
        if (!isDm && token.controllerId !== actor.id && this.linkedSheet(token)?.ownerId !== actor.id) return 'Bạn không điều khiển token này';
        const log = (label: string, result = externalRollResult('', { total: 0, faces: [] })) =>
          this.pushRoll({ id: nanoid(8), ts: Date.now(), actorId: actor.id, actorName: actor.name, label, result });
        const effects = (token.effects ??= []);
        if (action.kind === 'dodge') {
          token.effects = effects.filter((e) => !(e.attackersDisadvantage && e.sourceTokenId === token.id));
          token.effects.push({
            id: nanoid(8),
            name: 'Dodge',
            sourceTokenId: token.id,
            attackersDisadvantage: true,
            saveAdvantage: ['dex'],
            untilSourceTurnStart: true,
            note: 'Đòn đánh vào bạn bị bất lợi, bạn lợi thế cứu DEX, tới đầu lượt sau (mất nếu bị mất khả năng hành động)',
          });
          log(`🛡 ${token.label}: Dodge — đòn đánh vào ${token.label} bị bất lợi, lợi thế cứu DEX tới đầu lượt sau`);
        } else if (action.kind === 'disengage') {
          if (!effects.some((e) => e.noOpportunityAttacks)) {
            effects.push({ id: nanoid(8), name: 'Disengage', sourceTokenId: token.id, noOpportunityAttacks: true, endsAfterOwnTurns: 1, note: 'Di chuyển không bị Opportunity Attack tới hết lượt' });
          }
          log(`🏃 ${token.label}: Disengage — di chuyển không bị Opportunity Attack tới hết lượt`);
        } else if (action.kind === 'hide') {
          const notation = action.notation || '1d20';
          let result: RollResult;
          try {
            result = action.external ? externalRollResult(notation, action.external) : rollNotation(notation);
          } catch (err) {
            return (err as Error).message;
          }
          const ok = result.total >= 15;
          token.effects = effects.filter((e) => e.hiddenStealth == null);
          if (ok) {
            token.effects.push({
              id: nanoid(8),
              name: 'Ẩn nấp (Hide)',
              sourceTokenId: token.id,
              condition: 'invisible',
              hiddenStealth: result.total,
              note: `Stealth ${result.total}: kẻ tìm cần Perception (Search) ≥ ${result.total}. Lộ khi tấn công, ra phép có lời hoặc gây tiếng động lớn`,
            });
          }
          log(
            `👁 ${token.label}: Hide — Stealth ${result.total} vs DC 15 ${ok ? `✔ ẩn nấp (kẻ tìm cần Perception ≥ ${result.total})` : '✘ không ẩn được (cần chỗ che khuất / ngoài tầm nhìn)'}`,
            result,
          );
        } else if (action.kind === 'help') {
          const target = this.state.tokens.find((tk) => tk.id === action.targetTokenId);
          if (!target) return 'Chọn mục tiêu để Help';
          target.effects = (target.effects ?? []).filter((e) => !(e.attackersAdvantage && e.sourceTokenId === token.id));
          target.effects.push({
            id: nanoid(8),
            name: `Bị Help nhắm (${token.label})`,
            sourceTokenId: token.id,
            attackersAdvantage: true,
            untilSourceTurnStart: true,
            note: `Đòn đánh kế tiếp của đồng minh ${token.label} vào mục tiêu này có lợi thế (tới đầu lượt sau của ${token.label})`,
          });
          log(`🤝 ${token.label}: Help — đòn đánh kế tiếp của đồng minh vào ${target.label} có lợi thế`);
        }
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
        if (target.godsBaneBlade) return "God's Bane không thể bị nhắm tới";
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
            src.concentration = { name: effect.name, since: this.state.initiative.round, ...(effect.concAdvantage ? { advantage: true } : {}) };
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
        if (target.godsBaneBlade) return "God's Bane không thể bị nhắm tới";
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
        if (action.fromSpell && this.state.initiative.running) {
          const caster = action.sourceTokenId ? this.state.tokens.find((t) => t.id === action.sourceTokenId) : action.sourceSheetId ? this.state.tokens.find((t) => t.id === this.state.sheets.find((x) => x.id === action.sourceSheetId)?.tokenId) : undefined;
          if (caster) this.offerReactionsOf('spellCast', caster, caster, `${caster.label} ra phép`);
        }
        if (target.godsBaneBlade) break; // never a target: an area spell just skips the blade
        const ownsSource =
          (action.sourceSheetId &&
            this.state.sheets.some(
              (s) => s.id === action.sourceSheetId && s.ownerId === actor.id,
            )) ||
          (action.sourceTokenId &&
            this.state.tokens.find((t) => t.id === action.sourceTokenId)?.controllerId ===
              actor.id);
        if (!isDm && !ownsSource) return 'Bạn chỉ ra phép từ nhân vật của mình';
        const { d20, total, pass, bonus, modeNote } = this.rollTokenSave(
          target,
          action.ability,
          action.dc,
          true,
          action.effectOnFail?.condition,
          action.rollMode,
          action.fromSpell,
        );
        const coverSave = action.ability === 'dex' ? coverDexSaveBonus(target.cover) : 0;
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label: `${action.label} → ${target.label}: ${action.ability.toUpperCase()} cứu ${total}${modeNote} vs DC ${action.dc}${
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
          // Evasion: a DEX save for half takes none on a success and half on a failure
          const evade =
            action.ability === 'dex' &&
            !!action.damageHalfOnSave &&
            (hasEvasion(this.mechOf(target)) || (passiveHas(this.linkedSheet(target), 'evasion') && !this.incapacitated(target)));
          // Shield Master (Interpose Shield): with a shield, a successful DEX save for half takes none
          const sm = this.linkedSheet(target);
          const interpose = !evade && pass && action.ability === 'dex' && !!action.damageHalfOnSave && !!sm && passiveHas(sm, 'shieldInterpose') && shieldEquipped(sm) && this.canReact(target, {});
          if (interpose) {
            this.spendReaction(target, {});
            this.pendingBaneLogs.push(`🛡 ${sm!.name} · Shield Master: chắn bằng khiên — không nhận sát thương`);
          }
          const base = interpose ? 0 : evade ? (pass ? 0 : Math.floor(out.totalFinal / 2)) : pass ? Math.floor(out.totalFinal / 2) : out.totalFinal;
          if (evade) this.pendingBaneLogs.push(`${target.label}: Evasion — ${pass ? 'không nhận sát thương' : 'chỉ nhận nửa'}`);
          const dealt = this.baneReduce(target, action.sourceTokenId, base);
          const took = this.applyDamage(target, dealt, { types: partTypes(action.damageOnFail ?? []) });
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
        if (action.damageOnFail?.length && this.godsBane()) {
          // People's Will on save-spell damage (a pass that deals nothing counts as a miss).
          const srcTok = action.sourceTokenId ? this.state.tokens.find((t) => t.id === action.sourceTokenId) : undefined;
          const srcSheetId = action.sourceSheetId ?? (srcTok ? this.linkedSheet(srcTok)?.id : undefined);
          const dealtAny = !!takesDamage;
          this.afterBaneAttack(target, { sheetId: srcSheetId, tokenId: srcTok?.id }, false, dealtAny, actor);
        }
        if (!pass && action.effectOnFail) {
          const effect: ActiveEffect = { ...action.effectOnFail, id: nanoid(8) };
          if (effect.concentration) {
            const srcId = this.sourceTokenId(effect);
            const src = srcId && this.state.tokens.find((t) => t.id === srcId);
            if (src && src.concentration?.name !== effect.name) {
              this.dropConcentration(src, `chuyển sang ${effect.name}`, actor);
              src.concentration = { name: effect.name, since: this.state.initiative.round, ...(effect.concAdvantage ? { advantage: true } : {}) };
            }
          }
          target.effects = [...(target.effects ?? []), effect];
        }
        if (!pass && action.moveOnFail) {
          const from = this.state.tokens.find((tk) => tk.id === action.moveOnFail!.fromTokenId);
          const ft = from ? this.forceMove(target, from, action.moveOnFail.dir, action.moveOnFail.feet).feet : 0;
          if (ft > 0) this.systemLog(`${action.label} — ${action.moveOnFail.dir === 'push' ? 'đẩy' : 'kéo'} ${target.label} ${ft}ft`);
        }
        if (!pass && action.actionName && action.sourceTokenId) {
          const src = this.state.tokens.find((t) => t.id === action.sourceTokenId);
          const sw = src ? mechanicsOfKind(this.mechOf(src), 'engulf').find((m) => m.actions.some((n) => n.toLowerCase() === action.actionName!.toLowerCase())) : undefined;
          if (src && sw && (!sw.requiresGrappled || this.grappledBy(target, src))) this.engulf(src, target, sw);
        }
        if (!pass && action.teleportOnFail) {
          (this.state.pickPrompts ??= []).push({
            id: nanoid(8),
            kind: 'teleport',
            tokenId: target.id,
            tokenName: target.label,
            anchorTokenId: action.teleportOnFail.fromTokenId,
            maxFeet: action.teleportOnFail.maxFeet,
            ownerId: actor.id,
            label: action.label,
          });
        }
        this.touch();
        break;
      }

      case 'madnessSave': {
        if (!isDm) return 'Chỉ DM được bắt save madness';
        if (!this.madnessTables()) return 'Chưa có bảng madness (client/public/campaign/madness.json)';
        for (const id of action.targetTokenIds) {
          const tk = this.state.tokens.find((t) => t.id === id);
          if (!tk) continue;
          const sheet = this.linkedSheet(tk);
          // book: creatures add their INT modifier to saves against madness (WIS save by table decision)
          const intMod = sheet ? abilityMod(sheet.abilities.int) : tk.statblock ? abilityMod(tk.statblock.abilities.int) : 0;
          const { d20, total, pass, bonus } = this.rollTokenSave(tk, 'wis', action.dc - intMod);
          const shown = total + intMod;
          this.pushRoll({
            id: nanoid(8),
            ts: Date.now(),
            actorId: actor.id,
            actorName: actor.name,
            label: `${action.label ?? 'Madness'} → ${tk.label}: WIS cứu ${shown} (gồm INT ${intMod >= 0 ? '+' : ''}${intMod}) vs DC ${action.dc} — ${pass ? 'VỮNG' : 'DÍNH'}`,
            result: externalRollResult(`1d20${bonus + intMod >= 0 ? '+' : ''}${bonus + intMod}`, { total: shown, faces: [d20] }),
          });
          if (pass) continue;
          // stunned until the start of its next turn — only meaningful (and only auto-expiring) in combat
          if (this.state.initiative.running) {
            tk.effects = [
              ...(tk.effects ?? []),
              { id: nanoid(8), name: 'Madness (choáng)', condition: 'stunned', note: 'Choáng tới đầu lượt sau, rồi hiệu ứng madness có tác dụng', expiresRound: this.state.initiative.round + 1 },
            ];
          }
          if (sheet) {
            const err = this.inflictMadness(sheet, action.tier, actor);
            if (err) return err;
          } else this.systemLog(`${tk.label}: dính madness ${MADNESS_TIER_VI[action.tier]} (token không có sheet — DM tự tung bảng)`);
        }
        this.touch();
        break;
      }

      case 'madnessRoll': {
        if (!isDm) return 'Chỉ DM được tung madness';
        const sheet = this.state.sheets.find((s) => s.id === action.sheetId);
        if (!sheet) return 'Không tìm thấy nhân vật';
        const err = this.inflictMadness(sheet, action.tier, actor);
        if (err) return err;
        this.touch();
        break;
      }

      case 'passTime': {
        if (!isDm) return 'Chỉ DM được cho thời gian trôi';
        this.passTime(Math.max(0, Math.min(365 * 86400, Math.round(action.seconds))));
        this.systemLog(`Thời gian trôi ${fmtDuration(action.seconds)}`);
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
        const blade = this.bladeToken();
        const entries: InitiativeEntry[] = this.state.tokens.filter((tk) => !tk.godsBaneBlade || tk === blade).map((token) => {
          if (token.godsBaneBlade) {
            return { id: nanoid(8), name: token.label, initiative: BLADE_INITIATIVE, tokenId: token.id, isActive: false, hasGone: false, loseTies: true };
          }
          const ir = this.initRollNotation(token);
          const roll = rollNotation(ir.notation);
          if (ir.why.length) this.systemLog(`${token.label}: initiative có lợi thế (${ir.why.join(', ')})`);
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
          if (!token || token.godsBaneBlade) continue; // the blade's count is fixed (God's Bane panel)
          // silent: no pushRoll, no dddice
          const total = rollNotation(this.initRollNotation(token).notation).total;
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
        this.legendaryEndingId = undefined;
        this.preTurnLegendary = null;
        for (const tk of this.state.tokens) {
          tk.turnUsed = undefined;
          tk.legendaryActionsRemaining = legendaryInfo(tk.statblock)?.perRound ?? undefined;
          tk.legendaryLocks = undefined;
        }
        markActive(this.state.initiative);
        // the first creature's turn starts now too (regeneration, recharge, start-of-turn damage…)
        const firstId = this.state.initiative.entries.find((e) => e.isActive)?.tokenId;
        const first = firstId && this.state.tokens.find((t) => t.id === firstId);
        if (first) {
          this.processTurnEffects(first, 'start-of-turn');
          this.rollRecharges(first);
        }
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
        const roundBefore = this.state.initiative.round;
        advanceTurn(this.state.initiative, 1);
        if (this.state.initiative.round > roundBefore) this.passTime(6); // a combat round is 6 seconds
        const startingId = this.state.initiative.entries.find((e) => e.isActive)?.tokenId;
        const ending = endingId && this.state.tokens.find((t) => t.id === endingId);
        if (ending) this.processTurnEffects(ending, 'end-of-turn');
        const starting = startingId && this.state.tokens.find((t) => t.id === startingId);
        this.preTurnLegendary = null;
        this.legendaryEndingId = endingId;
        if (starting) {
          const li = legendaryInfo(starting.statblock);
          // what it may still spend at the end of the turn that just ended, before its own refill
          if (li && startingId !== endingId) this.preTurnLegendary = { tokenId: starting.id, ...this.legendaryPool(starting) };
          if (li) starting.legendaryActionsRemaining = li.perRound;
          starting.legendaryLocks = undefined;
          this.processTurnEffects(starting, 'start-of-turn');
          this.rollRecharges(starting);
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
        this.legendaryEndingId = undefined;
        this.preTurnLegendary = null;
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
          if (token) {
            const pool = this.legendaryPool(token);
            if (cost > pool.left) return `Không đủ legendary action: cần ${cost}, còn ${pool.left}`;
            if (chosen && pool.locks.includes(chosen.name)) return `${chosen.name}: đã dùng, chờ tới lượt sau của ${token.label}`;
            const locks = chosen && legendaryOncePerTurn(chosen) ? [...pool.locks, chosen.name] : pool.locks;
            if (this.preTurnLegendary?.tokenId === token.id) {
              // spent at the end of the previous turn: its own turn's fresh uses stay untouched
              this.preTurnLegendary = { tokenId: token.id, left: pool.left - cost, locks };
            } else {
              token.legendaryActionsRemaining = pool.left - cost;
              token.legendaryLocks = locks.length ? locks : undefined;
            }
          }
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
        this.syncWildShapeSize(existing, incoming);
        this.syncDowned(incoming);
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

      case 'shopUpsert': {
        if (!isDm) return 'Chỉ DM được sửa cửa hàng';
        const shop = { ...action.shop, id: action.shop.id || nanoid(8), items: action.shop.items.map((i) => ({ ...i, id: i.id || nanoid(8) })) };
        const list = this.state.shops ?? [];
        this.state.shops = list.some((x) => x.id === shop.id) ? list.map((x) => (x.id === shop.id ? shop : x)) : [...list, shop];
        this.touch();
        break;
      }

      case 'shopRemove': {
        if (!isDm) return 'Chỉ DM được xoá cửa hàng';
        this.state.shops = (this.state.shops ?? []).filter((x) => x.id !== action.id);
        this.touch();
        break;
      }

      case 'shopRestock': {
        if (!isDm) return 'Chỉ DM được nhập hàng';
        const shop = (this.state.shops ?? []).find((x) => x.id === action.id);
        if (!shop) return 'Không tìm thấy cửa hàng';
        shop.items = shop.items.map((i) => (i.restock != null ? { ...i, stock: i.restock } : i));
        this.state.shops = [...(this.state.shops ?? [])];
        this.systemLog(`🛒 ${shop.name} đã nhập hàng mới`);
        this.touch();
        break;
      }

      case 'shopBuy': {
        const shop = (this.state.shops ?? []).find((x) => x.id === action.shopId);
        if (!shop || (!shop.open && !isDm)) return 'Cửa hàng đang đóng';
        const item = shop.items.find((i) => i.id === action.itemId);
        if (!item) return 'Món này không còn bán';
        const sheet = this.state.sheets.find((x) => x.id === action.sheetId);
        if (!sheet || (sheet.ownerId !== actor.id && !isDm)) return 'Chỉ mua cho nhân vật của mình';
        const qty = Math.max(1, Math.floor(action.qty || 1));
        if (item.stock != null && item.stock < qty) return `Chỉ còn ${item.stock} món`;
        const cost = shopPriceCp(shop, item) * qty;
        const purse = payFromPurse(sheet.currency, cost);
        if (!purse) return `Không đủ tiền (cần ${formatCp(cost)})`;
        sheet.currency = purse;
        sheet.inventory = addShopPurchase(sheet.inventory, item, qty, () => nanoid(8));
        if (item.stock != null) item.stock -= qty;
        shop.items = [...shop.items];
        this.state.shops = [...(this.state.shops ?? [])];
        this.systemLog(`🛒 ${sheet.name} mua ${qty > 1 ? `${qty} × ` : ''}${item.preset.name} ở ${shop.name} (${formatCp(cost)})`);
        this.touch();
        break;
      }

      case 'godsBane': {
        const op = action.op;
        if (isGodsBaneRoomOp(op)) {
          const err = this.godsBaneRoomOp(op, actor);
          if (err) return err;
          this.touch();
          break;
        }
        const prev = this.state.godsBane;
        const next = applyGodsBaneOp(prev, op, {
          isDm,
          ownSheetIds: this.state.sheets.filter((x) => x.ownerId === actor.id).map((x) => x.id),
          initiative: this.state.initiative,
        });
        if (typeof next === 'string') return next;
        this.state.godsBane = next;
        const name = (id?: string) => this.state.sheets.find((x) => x.id === id)?.name ?? '?';
        if (op.op === 'config' && typeof op.awakened === 'boolean' && op.awakened !== !!prev?.awakened) {
          if (op.awakened) this.systemLog(`🗡 ${BLADE_LABEL} THỨC TỈNH — có token, hào quang 5 ft và lượt riêng (initiative 20)`, actor);
          else {
            // Back to dormant: the blade leaves every map and the initiative order.
            for (const scene of this.state.scenes) for (const t of scene.tokens.filter((x) => x.godsBaneBlade)) this.removeBladeToken(t.id);
            this.systemLog(`🗡 ${BLADE_LABEL} trở lại trạng thái ngủ (chỉ còn là vũ khí)`, actor);
          }
        } else if (op.op === 'reject') {
          const m = next.members[op.sheetId];
          this.systemLog(
            m?.oathbroken
              ? `🗡 Kiếm chối bỏ ${name(op.sheetId)} lần thứ 4 — PHÁ THỀ vĩnh viễn`
              : `🗡 Kiếm chối bỏ ${name(op.sheetId)} (lần ${m?.rejections ?? '?'}/3)`,
            actor,
          );
        } else if (op.op === 'atone') this.systemLog(`🗡 ${name(op.sheetId)} đã chuộc lỗi — kiếm chấp nhận lại`, actor);
        else if (op.op === 'arm')
          this.systemLog(
            `⚡ ${name(op.sheetId)} chuẩn bị Cleaving Causality: ${op.mode === 'crit' ? 'd20 kế tiếp của mình → 20 tự nhiên' : 'd20 kế tiếp của kẻ địch → 1 tự nhiên'}`,
            actor,
          );
        this.touch();
        break;
      }

      case 'summon': {
        if (!isDm) return 'Chỉ DM được triệu hồi';
        const caller = this.state.tokens.find((tk) => tk.id === action.tokenId);
        const sb = this.state.bestiary.find((s) => s.id === action.statblockId);
        if (!caller || !sb) return 'Không tìm thấy quái / statblock';
        let n = 1;
        try {
          n = /d/i.test(action.count) ? rollNotation(action.count).total : Number(action.count);
        } catch {
          n = 1;
        }
        n = Math.max(1, Math.min(12, Math.floor(n) || 1));
        const made: Token[] = [];
        for (let i = 0; i < n; i++) {
          const tok = createToken({
            label: this.nextMonsterLabel(sb.name),
            x: caller.x,
            y: caller.y,
            size: sb.size,
            color: sb.color,
            imageUrl: sb.imageUrl,
            armorClass: sb.ac,
            currentHp: sb.maxHp,
            maxHp: sb.maxHp,
            hidden: action.hidden ?? caller.hidden ?? false,
            statblock: tokenStatblockFrom(sb),
            defenses: sb.defenses ? { ...sb.defenses } : undefined,
            baneTag: sb.baneTag,
            undying: sb.undying,
          });
          // nearest free squares in rings around the summoner
          const span = tokenSpan(tok);
          const cs = tokenSpan(caller);
          let spot: { x: number; y: number } | undefined;
          for (let r = 1; r <= 12 && !spot; r++) {
            for (let dy = -r - span + 1; dy <= cs + r - 1 && !spot; dy++)
              for (let dx = -r - span + 1; dx <= cs + r - 1 && !spot; dx++) {
                const p = { x: caller.x + dx, y: caller.y + dy };
                if (p.x < 0 || p.y < 0 || p.x + span > this.state.map.cols || p.y + span > this.state.map.rows) continue;
                if (this.state.tokens.some((t) => !t.godsBaneBlade && edgeFeet(p, span, t, tokenSpan(t)) === 0)) continue;
                spot = p;
              }
          }
          if (spot) {
            tok.x = spot.x;
            tok.y = spot.y;
          }
          this.state.tokens.push(tok);
          made.push(tok);
        }
        const init = this.state.initiative;
        const at = init.entries.findIndex((e) => e.tokenId === caller.id);
        if (init.running && at >= 0) {
          // shares the summoner's initiative and acts right after it (and after earlier summons)
          const me = init.entries[at];
          let k = at + 1;
          while (k < init.entries.length && init.entries[k].initiative === me.initiative && init.entries[k].summonedBy === caller.id) k++;
          init.entries.splice(
            k,
            0,
            ...made.map((tk) => ({ id: nanoid(8), name: tk.label, initiative: me.initiative, tokenId: tk.id, isActive: false, hasGone: me.hasGone, summonedBy: caller.id })),
          );
          if (me.hasGone) init.turnIndex += made.length; // turnIndex counts turns already taken this round
        }
        this.systemLog(`${caller.label} · ${action.label ?? 'triệu hồi'}: ${made.length}× ${sb.name}${init.running && at >= 0 ? ' (chung initiative, đi ngay sau)' : ''}`);
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
            label: this.nextMonsterLabel(sb.name),
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
            baneTag: sb.baneTag,
            undying: sb.undying,
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

      case 'speaking':
      case 'setAnon':
      case 'dragPreview':
        // relayed by the socket layer (index.ts) without touching the state
        return null;

      case 'sbPlay':
      case 'sbStop':
      case 'sbUpdate':
      case 'sbRemove':
      case 'sbMove':
      case 'sbSettings':
        // the soundboard is handled by the socket layer (index.ts → soundboard.ts)
        return null;

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
  return sortInitiative(entries); // ties: `loseTies` entries (the God's Bane blade) act last
}

/** A roll's d20 replaced by another natural value (disadvantage on an already-rolled d20). */
function forceD20Value(result: RollResult, natural: number): RollResult {
  if (!result.d20) return result;
  return {
    ...result,
    total: result.total + (natural - result.d20.natural),
    d20: { natural, isCrit: natural === 20, isFumble: natural === 1 },
  };
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
