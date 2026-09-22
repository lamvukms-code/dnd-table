import { create } from 'zustand';
import {
  abilityMod,
  combineRollModes,
  conditionAttackMode,
  coverAcBonus,
  d20Check,
  derivedDefenses,
  homebrewCritDamage,
  mergeDefenses,
  rollNotation,
  spellAttackBonus,
  spellAttackParts,
  spellcastingAbilityOf,
  spellSaveDc,
  inferAttackRange,
  rangedAtCloseQuarters,
  gridFeet,
  type AttackRange,
  effectiveArmorClass,
  npcArmorClass,
  parseArea,
  defaultAnchor,
  parseRangeFeet,
  type AreaAnchor,
  type AreaSpec,
  tokenConditions,
  type ActiveEffect,
  type ClientAction,
  type DamagePart,
  type ExternalRoll,
  type Participant,
  type RollMode,
  type RoomState,
  type ServerEvent,
  type Spell,
  findCantrip,
  economyKindOf,
  spendEconomy as spendEconomyRule,
  woodWoseEffect,
  oldWaysClass,
  wildShapeMax,
  WOOD_WOSE,
  type CharacterSheet,
  type EconomyKind,
} from '@dnd-table/shared';
import {
  getLocalKey,
  rollEquation as dddiceRollEquation,
  setLocalKey as persistDddiceKey,
} from './dddice.js';

const PID_KEY = 'dnd-table.participantId';
const IDENTITY_KEY = 'dnd-table.identity';

interface Identity {
  name: string;
}

function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { name?: string };
    return parsed.name ? { name: parsed.name } : null;
  } catch {
    return null;
  }
}

interface AttackParams {
  label: string;
  /** Pre-built notation (freeform box). Ignored when `attackBonus` is given. */
  attackNotation?: string;
  /** When given, the notation is built here, folding in condition advantage/disadvantage. */
  attackBonus?: number;
  rollMode?: RollMode;
  damageParts: DamagePart[];
  targetTokenId: string;
  attackerSheetId?: string;
  attackerTokenId?: string;
  /** Melee / ranged tag of the attack (ranged at ≤5 ft ⇒ Disadvantage). */
  attackRange?: AttackRange;
}

export interface AoeMode {
  label: string;
  spec: AreaSpec;
  anchor: AreaAnchor;
  /** Token the template is anchored on / measured from (never hit by its own template). */
  casterTokenId?: string;
  /** Casting range for point-anchored templates (0 = none). */
  rangeFeet?: number;
  onConfirm: (targetIds: string[], aoeId: string) => void;
}

interface StoreState {
  status: 'idle' | 'connecting' | 'open' | 'closed';
  participantId: string | null;
  identity: Identity | null;
  room: RoomState | null;
  error: string | null;
  dddiceKey: string | null;
  dddiceConnected: boolean;
  join: (identity: Identity) => void;
  send: (action: ClientAction) => void;
  setDddiceKey: (key: string | null) => void;
  setDddiceConnected: (connected: boolean) => void;
  /** Roll dice — via the dddice 3D engine when enabled, else server RNG. */
  rollDice: (label: string, notation: string, opts?: { private?: boolean }) => Promise<void>;
  /** Attack a token — rolls (dddice or server) then lets the server resolve vs AC. */
  attackRoll: (params: AttackParams) => Promise<void>;
  /** Roll damage parts and subtract the (post-defence) total from a target's HP. */
  damageRoll: (
    label: string,
    damageParts: DamagePart[],
    targetTokenId: string,
    attacker?: { sheetId?: string; tokenId?: string },
  ) => Promise<void>;
  /** Roll a healing formula and add the (clamped) total to a target token's HP. */
  healRoll: (
    label: string,
    notation: string,
    targetTokenId: string,
    sourceSheetId?: string,
  ) => Promise<void>;
  /** Put a spell/feature effect on a target token (condition, rider, save). */
  applyEffect: (targetTokenId: string, effect: ActiveEffect) => void;
  removeEffect: (tokenId: string, effectId: string) => void;
  clearConcentration: (tokenId: string) => void;
  /** Point-click spell casting: arm a spell, then click a token on the map. */
  castingSpell: { sheetId: string; spell: Spell } | null;
  beginCast: (sheetId: string, spell: Spell) => void;
  /**
   * Spend Action / Bonus Action / Reaction for a token (only while initiative is running). Returns false when the
   * player declines to go on after a "already spent" warning. Attack rows count against Extra Attack.
   */
  spendEconomy: (tokenId: string | undefined, kind: EconomyKind, opts?: { attack?: boolean; maxAttacks?: number }) => boolean;
  /** Circle of the Old Ways: turn on Wood Wose (effect + Rampant Growth temp HP). Pays 1 Wild Shape when asked to. */
  activateWoodWose: (sheet: CharacterSheet, opts?: { spendWildShape?: boolean }) => boolean;
  cancelCast: () => void;
  /** Bestiary entry the DM asked to open from a token (null = none). */
  bestiaryFocus: string | null;
  openBestiary: (id: string | null) => void;
  resolveCastOnToken: (targetTokenId: string, opts?: { aoeId?: string; skipConc?: boolean }) => Promise<void>;
  /** Armed AoE template awaiting placement on the map. */
  aoe: AoeMode | null;
  beginAoe: (mode: AoeMode) => void;
  cancelAoe: () => void;
  confirmAoe: (targetIds: string[]) => void;
  /** Roll initiative (via dddice) and put the result on the top initiative bar. */
  rollInitiativeForMe: (
    name: string,
    mod: number,
    tokenId?: string,
    mode?: 'normal' | 'advantage' | 'disadvantage',
  ) => Promise<void>;
  /** DM: silently roll initiative for a group of tokens straight onto the bar. */
  rollInitiativeGroup: (tokenIds: string[]) => void;
  setRole: (participantId: string, role: 'dm' | 'player') => void;
  /** Snap a token back to where it was at the start of its turn. */
  resetTokenMove: (id: string) => void;
  /** Grant the token an extra Speed of movement this turn (Dash). */
  tokenDash: (id: string) => void;
  /** 2024 Unarmed Strike Grapple: server rolls the target's save, applies Grappled. */
  grapple: (p: {
    targetTokenId: string;
    dc: number;
    label: string;
    sourceSheetId?: string;
    sourceTokenId?: string;
    release?: boolean;
  }) => void;
  me: () => Participant | undefined;
  isDm: () => boolean;
  dddiceActive: () => boolean;
}

let socket: WebSocket | null = null;
let reconnectTimer: number | undefined;

export const useStore = create<StoreState>((set, get) => {
  function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    set({ status: 'connecting' });
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${proto}://${location.host}/ws`);

    socket.onopen = () => {
      set({ status: 'open' });
      const identity = get().identity;
      if (identity) {
        const stored = localStorage.getItem(PID_KEY) ?? undefined;
        rawSend({ t: 'join', name: identity.name, participantId: stored });
      }
    };

    socket.onmessage = (ev) => {
      let event: ServerEvent;
      try {
        event = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (event.t === 'welcome') {
        localStorage.setItem(PID_KEY, event.participantId);
        set({ participantId: event.participantId, room: event.state, error: null });
      } else if (event.t === 'state') {
        set({ room: event.state });
      } else if (event.t === 'error') {
        set({ error: event.message });
      }
    };

    socket.onclose = () => {
      set({ status: 'closed' });
      window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(connect, 1500);
    };

    socket.onerror = () => socket?.close();
  }

  function rawSend(action: ClientAction) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ action }));
    }
  }

  function dddiceActive(): boolean {
    const { room, dddiceKey } = get();
    return Boolean(room?.dddice.enabled && room.dddice.roomSlug && dddiceKey);
  }

  async function externalRoll(notation: string): Promise<ExternalRoll | null> {
    if (!dddiceActive()) return null;
    try {
      return await dddiceRollEquation(notation);
    } catch (err) {
      set({ error: `dddice: ${(err as Error).message} — dùng xúc xắc server` });
      return null;
    }
  }

  return {
    status: 'idle',
    participantId: null,
    identity: loadIdentity(),
    room: null,
    error: null,
    dddiceKey: getLocalKey(),
    dddiceConnected: false,
    castingSpell: null,

    join: (identity) => {
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
      set({ identity });
      if (get().status === 'open') {
        rawSend({
          t: 'join',
          name: identity.name,
          participantId: localStorage.getItem(PID_KEY) ?? undefined,
        });
      } else {
        connect();
      }
    },

    send: (action) => rawSend(action),

    setRole: (participantId, role) => rawSend({ t: 'setRole', participantId, role }),
    resetTokenMove: (id) => rawSend({ t: 'resetTokenMove', id }),
    tokenDash: (id) => rawSend({ t: 'tokenDash', id }),
    grapple: (p) => rawSend({ t: 'grapple', ...p }),

    damageRoll: async (label, damageParts, targetTokenId, attacker) => {
      let external: number[] | undefined;
      if (dddiceActive()) {
        external = [];
        for (const p of damageParts) {
          const ext = await externalRoll(p.dice);
          external.push(ext ? ext.total : rollNotation(p.dice).total);
        }
      }
      rawSend({
        t: 'damage',
        label,
        damageParts,
        targetTokenId,
        external,
        attackerSheetId: attacker?.sheetId,
        attackerTokenId: attacker?.tokenId,
      });
    },

    healRoll: async (label, notation, targetTokenId, sourceSheetId) => {
      const ext = await externalRoll(notation);
      rawSend({
        t: 'heal',
        label,
        notation,
        targetTokenId,
        external: ext ? ext.total : undefined,
        sourceSheetId,
      });
    },

    rollInitiativeForMe: async (name, mod, tokenId, mode = 'normal') => {
      const external = await externalRoll(d20Check(mod, mode));
      rawSend({ t: 'rollInitiative', name, mod, tokenId, external: external ?? undefined });
    },

    rollInitiativeGroup: (tokenIds) => rawSend({ t: 'rollInitiativeGroup', tokenIds }),

    setDddiceKey: (key) => {
      persistDddiceKey(key);
      set({ dddiceKey: key, dddiceConnected: false });
    },

    setDddiceConnected: (connected) => set({ dddiceConnected: connected }),

    rollDice: async (label, notation, opts) => {
      const external = await externalRoll(notation);
      rawSend({ t: 'roll', label, notation, private: opts?.private, external: external ?? undefined });
    },

    attackRoll: async ({
      label,
      attackNotation,
      attackBonus,
      rollMode,
      damageParts,
      targetTokenId,
      attackerSheetId,
      attackerTokenId,
      attackRange,
    }) => {
      const room = get().room;
      // Fold condition-implied advantage/disadvantage into the manual roll mode.
      let notation = attackNotation ?? '1d20';
      let condNote = '';
      if (typeof attackBonus === 'number') {
        const atkTok = attackerTokenId
          ? room?.tokens.find((t) => t.id === attackerTokenId)
          : attackerSheetId
            ? room?.tokens.find(
                (t) => room?.sheets.find((s) => s.id === attackerSheetId)?.tokenId === t.id,
              )
            : undefined;
        const tgtTok = room?.tokens.find((t) => t.id === targetTokenId);
        const cm = conditionAttackMode(tokenConditions(atkTok), tokenConditions(tgtTok));
        const reasons = [...cm.reasons];
        let mode = cm.mode;
        // Ranged attack made at close quarters (target within 5 ft): Disadvantage.
        if (attackRange === 'ranged' && atkTok && tgtTok && rangedAtCloseQuarters('ranged', gridFeet(atkTok, tgtTok))) {
          mode = combineRollModes(mode, 'disadvantage');
          reasons.push('tầm xa trong tầm cận chiến');
        }
        const finalMode = combineRollModes(rollMode ?? 'normal', mode);
        notation = d20Check(attackBonus, finalMode);
        if (mode !== 'normal') condNote = ` [${mode === 'advantage' ? 'lợi thế' : 'bất lợi'}: ${reasons.join(', ')}]`;
      }
      const finalLabel = label + condNote;
      const plain = () =>
        rawSend({
          t: 'attack',
          label: finalLabel,
          attackNotation: notation,
          damageParts,
          targetTokenId,
          attackerSheetId,
          attackerTokenId,
          attackRange,
        });
      if (!dddiceActive()) return plain();
      const attack = await externalRoll(notation);
      if (!attack) return plain();

      const token = room?.tokens.find((tk) => tk.id === targetTokenId);
      const linked = room?.sheets.find((s) => s.tokenId === targetTokenId);
      const ac =
        (linked ? effectiveArmorClass(linked, token?.effects).ac : npcArmorClass(token?.armorClass ?? 10, token?.effects)) +
        coverAcBonus(token?.cover);
      const def = mergeDefenses(
        token?.defenses,
        linked ? derivedDefenses(linked) : undefined,
      );
      const critImmune = def?.critImmune ?? false;
      const targetConds = tokenConditions(token);
      const autoCrit =
        targetConds.includes('paralyzed') || targetConds.includes('unconscious');
      const nat20 = attack.d20Natural === 20;
      const fumble = attack.d20Natural === 1;
      const hit = nat20 || (!fumble && attack.total >= ac);
      const effectiveCrit = (nat20 || (hit && autoCrit)) && !critImmune;
      let partTotals: number[] | undefined;
      if (hit) {
        partTotals = [];
        for (const p of damageParts) {
          const n = effectiveCrit ? homebrewCritDamage(p.dice) : p.dice;
          const ext = await externalRoll(n);
          partTotals.push(ext ? ext.total : rollNotation(n).total);
        }
      }
      rawSend({
        t: 'attack',
        label: finalLabel,
        attackNotation: notation,
        damageParts,
        targetTokenId,
        attackerSheetId,
        attackerTokenId,
        external: { attack, crit: effectiveCrit, partTotals },
      });
    },

    applyEffect: (targetTokenId, effect) =>
      rawSend({ t: 'applyEffect', targetTokenId, effect }),
    removeEffect: (tokenId, effectId) => rawSend({ t: 'removeEffect', tokenId, effectId }),
    clearConcentration: (tokenId) => rawSend({ t: 'clearConcentration', tokenId }),

    spendEconomy: (tokenId, kind, opts) => {
      const room = get().room;
      const tok = tokenId ? room?.tokens.find((t) => t.id === tokenId) : undefined;
      if (!room || !tok || !room.initiative.running) return true; // economy only matters in combat
      const r = spendEconomyRule(tok.turnUsed, kind, opts);
      if (r.warning && !window.confirm(r.warning + '. Vẫn thực hiện?')) return false;
      rawSend({ t: 'setTurnUsed', tokenId: tok.id, patch: r.used });
      return true;
    },
    activateWoodWose: (sheet, opts) => {
      const room = get().room;
      const tok = room?.tokens.find((t) => t.id === sheet.tokenId);
      const ww = room ? woodWoseEffect(sheet, room.initiative.round ?? 1) : null;
      if (!room || !tok || !ww) {
        set({ error: 'Wood Wose cần nhân vật Circle of the Old Ways gắn với token trên bản đồ.' });
        return false;
      }
      if ((tok.effects ?? []).some((e) => e.name === WOOD_WOSE)) return false;
      const used = sheet.wildShapeUsed ?? 0;
      if (opts?.spendWildShape) {
        if (used >= wildShapeMax(sheet)) {
          set({ error: 'Hết lần Wild Shape.' });
          return false;
        }
        rawSend({ t: 'upsertSheet', sheet: { ...sheet, wildShapeUsed: used + 1 } });
      }
      rawSend({ t: 'applyEffect', targetTokenId: tok.id, effect: { id: '', ...ww.effect } });
      rawSend({ t: 'grantTempHp', targetTokenId: tok.id, notation: String(ww.tempHp), label: 'Rampant Growth (HP tạm)', sourceSheetId: sheet.id });
      return true;
    },
    beginCast: (sheetId, spell) => {
      // Save spells with a parseable template: place the area on the map instead of clicking one target.
      const spec = spell.castKind === 'save' ? parseArea(spell.area) : null;
      const casterTokenId = get().room?.sheets.find((s) => s.id === sheetId)?.tokenId;
      if (spec && casterTokenId) {
        const selfRange = /bản thân|self/i.test(spell.range ?? '');
        const rangeFeet = selfRange ? 0 : parseRangeFeet(spell.range);
        set({
          castingSpell: null,
          aoe: {
            label: spell.name,
            spec,
            anchor: defaultAnchor(spec, rangeFeet, selfRange),
            casterTokenId,
            rangeFeet,
            onConfirm: (ids, aoeId) => {
              ids.forEach((id, i) => {
                set({ castingSpell: { sheetId, spell } });
                void get().resolveCastOnToken(id, { aoeId, skipConc: i > 0 });
              });
            },
          },
        });
        return;
      }
      set({ castingSpell: { sheetId, spell } });
    },
    cancelCast: () => set({ castingSpell: null, aoe: null }),
    aoe: null,
    beginAoe: (mode) => set({ aoe: mode, castingSpell: null }),
    cancelAoe: () => set({ aoe: null }),
    confirmAoe: (targetIds) => {
      const mode = get().aoe;
      if (!mode) return;
      set({ aoe: null });
      if (targetIds.length === 0) {
        set({ error: 'Không có token nào trong vùng — hủy.' });
        return;
      }
      mode.onConfirm(targetIds, `aoe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
    },
    bestiaryFocus: null,
    openBestiary: (id) => set({ bestiaryFocus: id }),
    resolveCastOnToken: async (targetTokenId, opts) => {
      const cast = get().castingSpell;
      const room = get().room;
      if (!cast || !room) return;
      const { sheetId, spell } = cast;
      const sheet = room.sheets.find((s) => s.id === sheetId);
      set({ castingSpell: null });
      if (!sheet) return;
      const label = `${sheet.name} · ${spell.name}`;
      const econ = economyKindOf(spell.actionType);
      if (econ && !get().spendEconomy(sheet.tokenId, econ)) return;
      const atkBonus = spellAttackBonus(sheet, spell) ?? 0;
      const dc = spell.save?.dcOverride ?? spellSaveDc(sheet, spell) ?? 10;
      const castAbil = spellcastingAbilityOf(sheet, spell);
      const castMod = castAbil ? abilityMod(sheet.abilities[castAbil]) : 0;

      // Concentration spells whose branch places the concentration effect on the
      // TARGET establish concentration there; the rest (pure damage / attack /
      // saved-with-no-effect) need a marker on the CASTER's own token.
      const placesConcOnTarget =
        spell.castKind === 'rider' ||
        ((spell.castKind === 'save' || spell.castKind === 'utility') && !!spell.effect);
      if (spell.concentration && !placesConcOnTarget && sheet.tokenId && !opts?.skipConc) {
        rawSend({
          t: 'applyEffect',
          targetTokenId: sheet.tokenId,
          effect: {
            id: '',
            name: `Đang tập trung: ${spell.name}`,
            sourceSheetId: sheetId,
            concentration: true,
            note: spell.notes,
          },
        });
      }

      if (spell.castKind === 'heal' && spell.heal) {
        const mod = castMod >= 0 ? `+${castMod}` : `${castMod}`;
        await get().healRoll(`${label} (hồi máu)`, `${spell.heal}${castMod ? mod : ''}`, targetTokenId, sheetId);
        return;
      }
      if (spell.castKind === 'damage') {
        // Auto-hit damage spell (Magic Missile): no attack roll.
        await get().damageRoll(
          `${label} (phép)`,
          spellAttackParts(sheet, spell.damage, spell),
          targetTokenId,
          { sheetId, tokenId: sheet.tokenId },
        );
        return;
      }

      if (spell.castKind === 'rider' && spell.rider) {
        rawSend({
          t: 'applyEffect',
          targetTokenId,
          effect: {
            id: '',
            name: spell.name,
            sourceSheetId: sheetId,
            concentration: spell.concentration,
            rider: spell.rider,
          },
        });
        return;
      }
      if (spell.castKind === 'save' && spell.save) {
        rawSend({
          t: 'spellSave',
          targetTokenId,
          ability: spell.save.ability,
          dc,
          label,
          sourceSheetId: sheetId,
          damageOnFail:
            spell.damage && spell.damage.length
              ? spell.agonizingBlast && castMod
                ? [...spell.damage, { dice: String(castMod), type: spell.damage[0].type, label: 'Agonizing Blast' }]
                : spell.damage
              : undefined,
          damageHalfOnSave: spell.save.halfOnSave,
          aoeId: opts?.aoeId,
          effectOnFail: spell.effect
            ? {
                id: '',
                name: spell.effect.name || spell.name,
                sourceSheetId: sheetId,
                concentration: spell.concentration,
                condition: spell.effect.condition,
                note: spell.effect.note,
                save:
                  spell.save.repeat && spell.save.repeat !== 'none'
                    ? { ability: spell.save.ability, dc, repeat: spell.save.repeat }
                    : undefined,
                expiresRound: spell.effect.expiresInRounds
                  ? (room.initiative.round ?? 1) + spell.effect.expiresInRounds
                  : undefined,
              }
            : undefined,
        });
        return;
      }
      if (spell.castKind === 'attack') {
        await get().attackRoll({
          label: `${label} (phép)`,
          attackBonus: atkBonus,
          rollMode: 'normal',
          damageParts: spellAttackParts(sheet, spell.damage, spell),
          targetTokenId,
          attackerSheetId: sheetId,
          attackerTokenId: sheet.tokenId,
          attackRange: inferAttackRange(spell.range),
        });
        return;
      }
      // utility: temp HP (False Life, Armor of Agathys) and/or a plain effect (Mage Armor, Shield of Faith…)
      if (spell.tempHp) {
        rawSend({
          t: 'grantTempHp',
          targetTokenId,
          notation: spell.tempHp,
          label: `${label} (HP tạm)`,
          sourceSheetId: sheetId,
        });
      }
      // Circle of the Old Ways: Shillelagh can also switch on Wood Wose (1 Wild Shape, no extra action)
      if (
        spell.name === 'Shillelagh' &&
        sheet.tokenId === targetTokenId &&
        oldWaysClass(sheet) &&
        (sheet.wildShapeUsed ?? 0) < wildShapeMax(sheet) &&
        !(room.tokens.find((t) => t.id === targetTokenId)?.effects ?? []).some((e) => e.name === WOOD_WOSE) &&
        window.confirm('Circle of the Old Ways: tốn 1 lần Wild Shape để bật Wood Wose luôn (AC = 10 + DEX + WIS, HP tạm, lợi thế save STR/CON)?')
      ) {
        get().activateWoodWose(sheet, { spendWildShape: true });
      }
      // Spells added before an effect was wired (e.g. Shillelagh) fall back to the DB definition.
      const fx: Spell['effect'] = spell.effect ?? (spell.name === 'Shillelagh' ? findCantrip('Shillelagh')?.effect : undefined);
      if (fx) {
        rawSend({
          t: 'applyEffect',
          targetTokenId,
          effect: {
            id: '',
            name: fx.name || spell.name,
            sourceSheetId: sheetId,
            concentration: spell.concentration,
            condition: fx.condition,
            note: fx.note,
            rollBonus: fx.rollBonus,
            acBonus: fx.acBonus,
            acMin: fx.acMin,
            acBase: fx.acBase,
            retaliate: fx.retaliate,
            weaponImbue: fx.weaponImbue,
            expiresRound: fx.expiresInRounds
              ? (room.initiative.round ?? 1) + fx.expiresInRounds
              : undefined,
          },
        });
      }
    },

    me: () => {
      const { room, participantId } = get();
      return room?.participants.find((p) => p.id === participantId);
    },

    isDm: () => get().me()?.role === 'dm',
    dddiceActive,
  };
});

// auto-connect if identity already known
if (loadIdentity()) {
  useStore.getState().join(loadIdentity()!);
}
