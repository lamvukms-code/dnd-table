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
  doubleDiceCounts,
  externalRollResult,
  resolveAttack,
  rollNotation,
  type ClientAction,
  type InitiativeEntry,
  type Participant,
  type RollLogEntry,
  type RollResult,
  type RoomState,
} from '@dnd-table/shared';

export class Room {
  state: RoomState;
  private file: string;

  constructor(file: string) {
    this.file = file;
    this.state = this.load();
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

  save(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error('Failed to persist room:', err);
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
        let amount = 0;
        if (typeof target.currentHp === 'number') {
          amount = Math.min(target.currentHp, Math.max(0, Math.round(result.total)));
          target.currentHp -= amount;
        }
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label: action.label || 'Sát thương',
          result,
          damage: { targetTokenId: target.id, targetName: target.label, amount },
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
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label: action.label || 'Roll',
          result,
          private: action.private && isDm ? true : undefined,
        });
        this.touch();
        break;
      }

      case 'attack': {
        const target = this.state.tokens.find((tk) => tk.id === action.targetTokenId);
        if (!target) return 'Target token not found';
        const ac = target.armorClass ?? 10;
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
        // Server is authoritative for hit/crit vs its own AC copy, from whatever
        // die values it was handed (dddice or its own RNG).
        const res = resolveAttack(attackRoll, ac);
        let damageResult: RollResult | undefined;
        if (res.hit) {
          const dmgNotation = res.crit
            ? doubleDiceCounts(action.damageNotation)
            : action.damageNotation;
          if (action.external?.damage) {
            damageResult = externalRollResult(dmgNotation, action.external.damage);
          } else {
            try {
              damageResult = rollNotation(dmgNotation);
            } catch (err) {
              return (err as Error).message;
            }
          }
        }
        this.pushRoll({
          id: nanoid(8),
          ts: Date.now(),
          actorId: actor.id,
          actorName: actor.name,
          label: action.label || 'Attack',
          result: attackRoll,
          attack: {
            targetTokenId: target.id,
            targetName: target.label,
            targetAc: ac,
            hit: res.hit,
            crit: res.crit,
            fumble: res.fumble,
          },
        });
        if (damageResult) {
          this.pushRoll({
            id: nanoid(8),
            ts: Date.now(),
            actorId: actor.id,
            actorName: actor.name,
            label: `${action.label || 'Attack'} — sát thương${res.crit ? ' (chí mạng)' : ''}`,
            result: damageResult,
          });
          if (typeof target.currentHp === 'number') {
            target.currentHp = Math.max(0, target.currentHp - damageResult.total);
          }
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
        if (!isDm) return 'Chỉ DM được thêm token';
        this.state.tokens.push(createToken(action.token));
        this.touch();
        break;
      }

      case 'updateToken': {
        const token = this.state.tokens.find((tk) => tk.id === action.id);
        if (!token) return 'Token không tồn tại';
        const canMove = isDm || token.controllerId === actor.id;
        if (!canMove) return 'Bạn không điều khiển token này';
        Object.assign(token, action.patch);
        this.touch();
        break;
      }

      case 'removeToken': {
        if (!isDm) return 'Chỉ DM được xóa token';
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
        const entries: InitiativeEntry[] = [];
        for (const token of this.state.tokens) {
          const sheet = this.state.sheets.find((s) => s.tokenId === token.id);
          const dexMod = sheet ? abilityMod(sheet.abilities.dex) : 0;
          const misc = sheet?.initiativeMisc ?? 0;
          const roll = rollNotation(`1d20+${dexMod + misc}`);
          entries.push({
            id: nanoid(8),
            name: token.label,
            initiative: roll.total,
            tokenId: token.id,
            isActive: false,
            hasGone: false,
          });
        }
        this.state.initiative.entries = sortInit(entries);
        this.state.initiative.round = 1;
        this.state.initiative.turnIndex = 0;
        this.state.initiative.running = entries.length > 0;
        markActive(this.state.initiative);
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
        if (!isDm) return 'Chỉ DM được chuyển lượt';
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
  if (s.version === 2 || s.version === 3) {
    s.sheets = (s.sheets ?? []).map((sheet) => normalizeSheet(sheet));
    s.version = SCHEMA_VERSION;
  }

  return s.version === SCHEMA_VERSION ? s : null;
}

function sortInit(entries: InitiativeEntry[]): InitiativeEntry[] {
  return [...entries].sort((a, b) => b.initiative - a.initiative);
}

function markActive(init: RoomState['initiative']): void {
  init.entries.forEach((e, i) => (e.isActive = i === init.turnIndex && init.running));
}

function advanceTurn(init: RoomState['initiative'], dir: 1 | -1): void {
  if (init.entries.length === 0) return;
  init.running = true;
  let next = init.turnIndex + dir;
  if (next >= init.entries.length) {
    next = 0;
    init.round++;
    init.entries.forEach((e) => (e.hasGone = false));
  } else if (next < 0) {
    next = init.entries.length - 1;
    init.round = Math.max(1, init.round - 1);
  }
  if (dir === 1 && init.entries[init.turnIndex]) {
    init.entries[init.turnIndex].hasGone = true;
  }
  init.turnIndex = next;
  markActive(init);
}
