import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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
  concentrationDc,
  conditionAutoCrit,
  coverAcBonus,
  derivedDefenses,
  externalRollResult,
  homebrewCritDamage,
  mergeDefenses,
  resolveAttack,
  resolveDamageParts,
  rollNotation,
  targetRiderParts,
  tokenConditions,
  tokenStatblockFrom,
  type Ability,
  type ActiveEffect,
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

export class Room {
  state: RoomState;
  private file: string;
  private bestiaryFile: string;

  constructor(file: string, bestiaryFile: string) {
    this.file = file;
    this.bestiaryFile = bestiaryFile;
    this.state = this.load();
    this.state.bestiary = this.loadBestiary();
  }

  private load(): RoomState {
    try {
      if (existsSync(this.file)) {
        const raw = JSON.parse(readFileSync(this.file, 'utf8')) as RoomState;
        const migrated = migrateRoom(raw);
        if (migrated) {
          migrated.participants.forEach((p) => (p.connected = false));
          migrated.sheets = migrated.sheets.map(normalizeSheet);
          syncSceneAliases(migrated);
          for (const scene of migrated.scenes) {
            scene.tokens.forEach((t) => {
              t.effects ??= [];
              t.concentration ??= null;
            });
          }
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

  save(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      // room.json never carries the bestiary (its own file); `map` / `tokens`
      // are just live aliases of the active scene, so they're not persisted either.
      const { bestiary, map, tokens, ...room } = this.state;
      void bestiary;
      void map;
      void tokens;
      writeFileSync(this.file, JSON.stringify(room, null, 2));
    } catch (err) {
      console.error('Failed to persist room:', err);
    }
    try {
      mkdirSync(dirname(this.bestiaryFile), { recursive: true });
      writeFileSync(this.bestiaryFile, JSON.stringify(this.state.bestiary, null, 2));
    } catch (err) {
      console.error('Failed to persist bestiary:', err);
    }
  }

  private touch(): void {
    this.state.rev++;
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

  /** Roll every damage part (homebrew-crit each on a crit) using dddice totals
   *  where supplied, and synthesise a combined RollResult for the log. */
  private rollDamageParts(
    parts: DamagePart[],
    crit: boolean,
    externals: number[] | undefined,
  ): { rolled: { part: DamagePart; raw: number }[]; combined: RollResult; notation: string } {
    const rolled: { part: DamagePart; raw: number }[] = [];
    const bits: string[] = [];
    parts.forEach((p, i) => {
      const n = crit ? homebrewCritDamage(p.dice) : p.dice;
      bits.push(n);
      const raw =
        externals && typeof externals[i] === 'number'
          ? externals[i]
          : rollNotation(n).total;
      rolled.push({ part: p, raw });
    });
    const total = rolled.reduce((s, r) => s + r.raw, 0);
    const notation = bits.join(' + ');
    return { rolled, notation, combined: externalRollResult(notation, { total, faces: [] }) };
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
    return mergeDefenses(token.defenses, sheet ? derivedDefenses(sheet) : undefined);
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

  /** Roll a d20 save for a token (nat 20 auto-pass, nat 1 auto-fail — homebrew). */
  private rollTokenSave(
    token: Token,
    ability: Ability,
    dc: number,
  ): { d20: number; total: number; pass: boolean; bonus: number } {
    const bonus = this.tokenSaveBonus(token, ability);
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

  /** At a turn boundary: run "save ends" effects on `token` and clear expired ones. */
  private processTurnEffects(token: Token, phase: 'start-of-turn' | 'end-of-turn'): void {
    const round = this.state.initiative.round;
    const keep: ActiveEffect[] = [];
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
        let amount = 0;
        if (typeof target.currentHp === 'number') {
          amount = Math.min(target.currentHp, out.totalFinal);
          target.currentHp -= amount;
        }
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
            notes: damageBreakdownNotes(out),
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
        let restored = 0;
        if (typeof target.currentHp === 'number' && typeof target.maxHp === 'number') {
          const before = target.currentHp;
          target.currentHp = Math.min(target.maxHp, target.currentHp + heal);
          restored = target.currentHp - before;
        } else if (typeof target.currentHp === 'number') {
          target.currentHp += heal;
          restored = heal;
        }
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
        const baseAc = target.armorClass ?? 10;
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
        const autoCrit = res.hit && conditionAutoCrit(tokenConditions(target));
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
          const applied = typeof target.currentHp === 'number' ? outcome.totalFinal : 0;
          if (typeof target.currentHp === 'number') {
            target.currentHp = Math.max(0, target.currentHp - applied);
          }
          this.maybeBreakConcentration(target, applied);
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
              notes: damageBreakdownNotes(outcome),
            },
          });
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
        const patch = { ...action.patch };
        if (!isDm) delete patch.hidden;
        Object.assign(token, patch);
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
        );
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label: `${action.label} → ${target.label}: ${action.ability.toUpperCase()} cứu ${total} vs DC ${action.dc} — ${
            pass ? 'THOÁT' : 'DÍNH'
          }`,
          result: externalRollResult(`1d20${bonus >= 0 ? '+' : ''}${bonus}`, {
            total,
            faces: [d20],
          }),
        });
        // Damage: full on a failed save, half on a success if `damageHalfOnSave`
        // (level 1+ AoE); 2024 cantrips deal nothing on a success.
        const takesDamage = action.damageOnFail?.length && (!pass ? true : !!action.damageHalfOnSave);
        if (takesDamage) {
          let rd;
          try {
            rd = this.rollDamageParts(action.damageOnFail!, false, undefined);
          } catch (err) {
            return (err as Error).message;
          }
          const out = resolveDamageParts(rd.rolled, this.effectiveDefenses(target));
          const dealt = pass ? Math.floor(out.totalFinal / 2) : out.totalFinal;
          let applied = 0;
          if (typeof target.currentHp === 'number') {
            applied = Math.min(target.currentHp, dealt);
            target.currentHp -= applied;
          }
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
              notes: damageBreakdownNotes(out),
            },
          });
          this.maybeBreakConcentration(target, dealt);
        }
        if (!pass && action.effectOnFail) {
          const effect: ActiveEffect = { ...action.effectOnFail, id: nanoid(8) };
          if (effect.concentration) {
            const srcId = this.sourceTokenId(effect);
            const src = srcId && this.state.tokens.find((t) => t.id === srcId);
            if (src) {
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
        this.touch();
        break;
      }

      case 'rollInitiative': {
        let result: RollResult;
        if (action.external) {
          result = externalRollResult(`1d20${action.mod >= 0 ? '+' : ''}${action.mod}`, action.external);
        } else {
          result = rollNotation(initNotation(action.mod));
        }
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label: `${action.name} · Initiative`,
          result,
        });
        this.upsertInitEntry(action.name, result.total, action.tokenId);
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
        markActive(this.state.initiative);
        this.touch();
        break;
      }

      case 'initNext': {
        if (!isDm && !this.actorOwnsActiveTurn(actor)) {
          return 'Chỉ DM hoặc người đang tới lượt được kết thúc lượt';
        }
        const endingId = this.state.initiative.entries.find((e) => e.isActive)?.tokenId;
        advanceTurn(this.state.initiative, 1);
        const startingId = this.state.initiative.entries.find((e) => e.isActive)?.tokenId;
        const ending = endingId && this.state.tokens.find((t) => t.id === endingId);
        if (ending) this.processTurnEffects(ending, 'end-of-turn');
        const starting = startingId && this.state.tokens.find((t) => t.id === startingId);
        if (starting) this.processTurnEffects(starting, 'start-of-turn');
        this.touch();
        break;
      }

      case 'initPrev': {
        if (!isDm) return 'Chỉ DM được lùi lượt';
        advanceTurn(this.state.initiative, -1);
        this.touch();
        break;
      }

      case 'initReset': {
        if (!isDm) return 'Chỉ DM được reset initiative';
        this.state.initiative = { entries: [], round: 1, turnIndex: 0, running: false };
        this.touch();
        break;
      }

      case 'upsertSheet': {
        const existing = this.state.sheets.find((s) => s.id === action.sheet.id);
        if (existing && existing.ownerId !== actor.id && !isDm) {
          return 'Bạn không sở hữu character sheet này';
        }
        const incoming = normalizeSheet({ ...action.sheet });
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
        this.touch();
        break;
      }

      case 'removeSheet': {
        const sheet = this.state.sheets.find((s) => s.id === action.id);
        if (!sheet) return null;
        if (sheet.ownerId !== actor.id && !isDm) return 'Bạn không sở hữu sheet này';
        this.state.sheets = this.state.sheets.filter((s) => s.id !== action.id);
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
    const scene = { id: nanoid(8), name: 'Cảnh 1', map: defaultMap(), tokens: [] };
    state.scenes = [scene];
    state.activeSceneId = scene.id;
  }
  const active =
    state.scenes.find((s) => s.id === state.activeSceneId) ?? state.scenes[0];
  state.activeSceneId = active.id;
  state.map = active.map;
  state.tokens = active.tokens;
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
