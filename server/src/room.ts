import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { nanoid } from 'nanoid';
import {
  abilityMod,
  createRoomState,
  createToken,
  normalizeSheet,
  DICE_TRAY_CAP,
  ROLL_LOG_CAP,
  SCHEMA_VERSION,
} from './factory.js';
import {
  coverAcBonus,
  externalRollResult,
  homebrewCritDamage,
  resolveAttack,
  resolveDamageParts,
  rollNotation,
  tokenStatblockFrom,
  type ClientAction,
  type DamagePart,
  type InitiativeEntry,
  type MultiDamageOutcome,
  type Participant,
  type RollLogEntry,
  type RollResult,
  type RoomState,
  type Statblock,
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
      // room.json never carries the bestiary — that lives in its own file.
      const { bestiary, ...room } = this.state;
      void bestiary;
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
        let rd;
        try {
          rd = this.rollDamageParts(action.damageParts, false, action.external);
        } catch (err) {
          return (err as Error).message;
        }
        const out = resolveDamageParts(rd.rolled, target.defenses);
        let amount = 0;
        if (typeof target.currentHp === 'number') {
          amount = Math.min(target.currentHp, out.totalFinal);
          target.currentHp -= amount;
        }
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
            damageType: damagePartsSummary(action.damageParts),
            notes: damageBreakdownNotes(out),
          },
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
        // Adamantine / crit-immune (this token only): a crit lands as an ordinary hit.
        const critImmune = target.defenses?.critImmune ?? false;
        const effectiveCrit = res.crit && !critImmune;

        let damageResult: RollResult | undefined;
        let outcome: MultiDamageOutcome | undefined;
        if (res.hit) {
          if (!action.damageParts?.length) return 'Không có nguồn sát thương';
          let rd;
          try {
            rd = this.rollDamageParts(action.damageParts, effectiveCrit, action.external?.partTotals);
          } catch (err) {
            return (err as Error).message;
          }
          damageResult = rd.combined;
          outcome = resolveDamageParts(rd.rolled, target.defenses);
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
          const critTag = effectiveCrit
            ? ' (chí mạng homebrew)'
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
              damageType: damagePartsSummary(action.damageParts),
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
        this.state.tokens = this.state.tokens.filter((tk) => tk.id !== action.id);
        this.state.initiative.entries = this.state.initiative.entries.filter(
          (e) => e.tokenId !== action.id,
        );
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
        advanceTurn(this.state.initiative, 1);
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
          const tk = this.state.tokens.find((t) => t.id === incoming.tokenId);
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
    s.version = SCHEMA_VERSION;
  }

  return s.version === SCHEMA_VERSION ? s : null;
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
