import {
  ActionResolver,
  ATTUNEMENT_LIMIT,
  CARRIED_SLOT,
  CharacterBootstrapper,
  CombatContextManager,
  EffectManager,
  ResourceManager,
  RestEngine,
  canEquipTo,
  resolveEquipmentDefinition,
  resolveItemDefinition,
  slotsConsumedBy,
  type Ability,
  type ActionRollResult,
  type OperationalResource,
  type ProficiencyLevel,
} from "@project/engine";
import {
  CombatContextSchema,
  CONDITION_MAP,
  type CombatContext,
  type CombatEventInput,
  type CombatRollSnapshotInput,
  type CombatTargetRelationship,
  type CombatRollSnapshot,
  CharacterSlotSchema,
  type ActionGrant,
  type ActionResolvedPayload,
  type CharacterSave,
  type CharacterSlot,
  type DamageType,
  type EngineEvent,
  type InventoryInstance,
  type RollResultsBroadcastPayload,
  type RuleSnapshot,
  type RuntimeModifier,
  // TraitDefinition moved to the shared schemas when traits were extracted
  type TraitDefinition,
} from "@project/shared";
import { create } from "zustand";
import { socketService } from "../services/socketService";

const isKnownSlot = (slot: string): slot is CharacterSlot =>
  CharacterSlotSchema.safeParse(slot).success;

/**
 * Slot names that existed before the body/ring model. Persisted rows still
 * carry them, so they are translated on the way in rather than with a
 * migration that would break any client still on the old build.
 */
const LEGACY_SLOT_ALIASES: Record<string, CharacterSlot> = {
  armor: "body", // collided with the *type* value "armor"
  ring: "ring_1", // a single ring slot became two
};

/**
 * Normalizes an inventory row arriving from the API or a socket broadcast.
 * The wire types slot as a bare string, so an unrecognized value degrades to
 * carried rather than corrupting the worn state.
 */
export const toInventoryInstance = (item: {
  id: string;
  itemId: string;
  quantity: number;
  slot: string;
  isAttuned: boolean;
  customName?: string;
}): InventoryInstance => {
  const aliased = LEGACY_SLOT_ALIASES[item.slot] ?? item.slot;

  return {
    id: item.id,
    itemId: item.itemId,
    quantity: item.quantity,
    slot: isKnownSlot(aliased) ? aliased : CARRIED_SLOT,
    isAttuned: item.isAttuned,
    ...(item.customName !== undefined && { customName: item.customName }),
  };
};

type SheetRuleSnapshot = Pick<
  RuleSnapshot,
  "equipmentById" | "itemsById" | "weaponsById" | "resourcesById"
>;

/**
 * Every character slot an item actually covers where it currently sits.
 * A two-handed weapon in the main hand also covers the off hand, so a shield
 * cannot slide in beside it.
 */
const occupiedSlots = (
  item: InventoryInstance,
  snapshot: SheetRuleSnapshot | null,
): CharacterSlot[] => {
  if (item.slot === CARRIED_SLOT) return [];

  const equipment = resolveEquipmentDefinition(
    item.itemId,
    snapshot ?? undefined,
  );

  return equipment ? slotsConsumedBy(equipment, item.slot) : [item.slot];
};

/** A worn row is one item: you wield a single dagger, not a stack of five. */
const WORN_QUANTITY = 1;

/**
 * Ids minted locally when a stack splits. Provisional: the row does not exist
 * server-side until the write is acknowledged.
 */
const newRowId = () => `inv_${crypto.randomUUID()}`;

const clampHealth = (currentHp: number, delta: number, maxHp: number) =>
  Math.min(Math.max(0, currentHp + delta), maxHp);

const toCharacterSave = (state: CharacterSheetState): CharacterSave => ({
  attributes: {
    str: state.baseScores.STR,
    dex: state.baseScores.DEX,
    con: state.baseScores.CON,
    int: state.baseScores.INT,
    wis: state.baseScores.WIS,
    cha: state.baseScores.CHA,
  },
  race: {
    baseRaceId: state.raceId ?? "race_human",
    hasSubraces: state.subraceId !== null,
    subraceId: state.subraceId,
  },
  classes:
    Object.entries(state.classLevels).length > 0
      ? Object.entries(state.classLevels).map(([classId, level]) => ({
          classId,
          level,
          selections: {},
        }))
      : [{ classId: "class_fighter", level: 1, selections: {} }],
  traitSelections: {},
  hp: {
    current: state.currentHp,
    temporary: 0,
    baseRolledHp: state.baseHpRolled,
    hitDiceSpent: {},
  },
});

const toActionRollResult = (
  payload: RollResultsBroadcastPayload["rollResults"][number],
): ActionRollResult => ({
  total: payload.total,
  rolls: payload.rolls,
  modifier: payload.modifier,
  target: payload.target,
  ...(payload.damageType !== undefined && {
    damageType: payload.damageType as DamageType,
  }),
  ...(payload.label !== undefined && { label: payload.label }),
  ...(payload.summary !== undefined && { summary: payload.summary }),
});

const appendRollResults = (
  state: Pick<CharacterSheetState, "latestRollResults">,
  nextResults: ActionRollResult[],
): ActionRollResult[] => [...state.latestRollResults.slice(-4), ...nextResults];

const createCombatManager = (initialContext?: Partial<CombatContext>) => {
  const manager = new CombatContextManager();
  manager.initialize(initialContext);
  return manager;
};

const ensureCombatManager = (
  state: Pick<CharacterSheetState, "runtimeCombat" | "combatContext">,
) => state.runtimeCombat ?? createCombatManager(state.combatContext);

const hydrateRuntimeEffectsFromResolved = (
  payload: ActionResolvedPayload,
): EffectManager => {
  const manager = new EffectManager();

  for (const effect of payload.effects) {
    manager.addEffect({
      instanceId: effect.instanceId,
      sourceName: effect.sourceName,
      durationType: effect.durationType,
      durationRemaining: effect.durationRemaining,
      isSelfConcentration: effect.isSelfConcentration,
      modifiers: effect.modifiers,
      grantedStates: effect.grantedStates,
      kind: effect.kind,
      durationHours: effect.durationHours,
      summonEntities: effect.summonEntities,
    });
  }

  manager.addActors(payload.actors);
  return manager;
};

const alignRuntimeResources = (
  manager: ResourceManager,
  targetResources: ActionResolvedPayload["resources"],
) => {
  const currentById = new Map(
    manager
      .getRuntimeResources()
      .map((resource) => [resource.id, resource.currentCharges] as const),
  );

  for (const target of targetResources) {
    const current = currentById.get(target.id);
    if (current === undefined) continue;

    if (current > target.currentCharges) {
      manager.consume(target.id, current - target.currentCharges);
    } else if (current < target.currentCharges) {
      manager.restore(target.id, target.currentCharges - current);
    }
  }
};

/**
 * The character's full state list, rebuilt from its three sources.
 *
 * Rebuilt rather than accumulated on purpose. Folding the effect manager's
 * states into the previous activeStates makes the list monotonic - it can only
 * ever grow - so an effect that expires stays visible forever and a one-turn
 * rule like Reckless Attack never switches off.
 *
 * The three sources are distinct in lifetime, which is why they stay separate:
 * baseStates is what holds regardless of anything temporary (worn armour,
 * encumbrance), conditions last until the player clears them, and effects
 * expire on their own timers. Composing here means every calculator gates on
 * conditions without any of them knowing conditions exist.
 */
const composeActiveStates = (
  baseStates: string[] | undefined,
  activeConditions: string[] | undefined,
  effectManager: EffectManager,
): string[] =>
  Array.from(
    new Set([
      ...(baseStates ?? []),
      ...(activeConditions ?? []),
      ...effectManager.getActiveStates(),
    ]),
  );

const dispatchAuthoredEvent = (
  state: CharacterSheetState,
  eventName: EngineEvent,
) => {
  const nextSave = toCharacterSave(state);
  const runtimeEffects = state.runtimeEffects ?? new EffectManager();
  const runtimeResources = state.runtimeResources ?? new ResourceManager();

  CharacterBootstrapper.hydrateRuntimeManagers(
    nextSave,
    runtimeEffects,
    runtimeResources,
  );

  const activeTraits = CharacterBootstrapper.compileActiveTraits(nextSave);
  const actionLookup = Object.fromEntries(
    activeTraits.flatMap((trait) =>
      (trait.actions ?? []).map((action) => [action.id, action]),
    ),
  );
  const triggerGrants = activeTraits.flatMap((trait) => trait.triggers ?? []);
  const diceRules = activeTraits.flatMap((trait) => trait.diceRules ?? []);

  const results = ActionResolver.dispatchEvent(
    eventName,
    triggerGrants,
    actionLookup,
    {
      effectManager: runtimeEffects,
      resourceManager: runtimeResources,
      activeStates: state.activeStates,
      diceRules,
    },
  );

  if (
    state.id &&
    results.some((result) => (result.rollResults?.length ?? 0) > 0)
  ) {
    const authoredRollResults = results.flatMap(
      (result) => result.rollResults ?? [],
    );
    if (authoredRollResults.length > 0) {
      socketService.emitRollResults({
        characterId: state.id,
        rollResults: authoredRollResults.map((result) => ({
          total: result.total,
          rolls: result.rolls,
          modifier: result.modifier,
          target: result.target,
          ...(result.damageType !== undefined && {
            damageType: result.damageType,
          }),
          ...(result.label !== undefined && { label: result.label }),
          ...(result.summary !== undefined && { summary: result.summary }),
        })),
        timestamp: Date.now(),
      });
    }
  }

  return {
    results,
    rollResults: results.flatMap((result) => result.rollResults ?? []),
    activeStates: composeActiveStates(state.baseStates, state.activeConditions, runtimeEffects),
    resources: runtimeResources.getRuntimeResources().map((resource) => ({
      id: resource.id,
      current: resource.currentCharges,
      currentCharges: resource.currentCharges,
    })),
    runtimeEffects,
    runtimeResources,
  };
};

const resolveHealthTransition = (
  state: CharacterSheetState,
  targetHp: number,
  previousHp: number,
  delta: number,
) => {
  const shouldDispatchTrigger = delta < 0 && previousHp > 0 && targetHp === 0;
  const nextSave = toCharacterSave({ ...state, currentHp: targetHp });
  const runtimeEffects = state.runtimeEffects ?? new EffectManager();
  const runtimeResources = state.runtimeResources ?? new ResourceManager();

  if (!state.runtimeEffects || !state.runtimeResources) {
    CharacterBootstrapper.hydrateRuntimeManagers(
      nextSave,
      runtimeEffects,
      runtimeResources,
    );
  }

  let appliedHp = targetHp;
  let rollResults: ActionRollResult[] = [];
  let activeStates = composeActiveStates(state.baseStates, state.activeConditions, runtimeEffects);
  let resources = runtimeResources.getRuntimeResources().map((resource) => ({
    id: resource.id,
    current: resource.currentCharges,
    currentCharges: resource.currentCharges,
  }));

  if (shouldDispatchTrigger) {
    const dispatched = dispatchAuthoredEvent(
      { ...state, currentHp: targetHp },
      "ON_HP_REDUCED_TO_ZERO",
    );
    appliedHp = dispatched.results.some((result) => result.executed)
      ? 1
      : targetHp;
    activeStates = dispatched.activeStates;
    resources = dispatched.resources;
    rollResults = dispatched.rollResults;
    Object.assign(runtimeEffects, dispatched.runtimeEffects);
    Object.assign(runtimeResources, dispatched.runtimeResources);
  }

  return {
    appliedHp,
    rollResults,
    activeStates,
    resources,
    runtimeEffects,
    runtimeResources,
  };
};

/**
 * Whether two rows describe interchangeable items that can share one pile.
 *
 * Only carried rows pool. A worn row is a specific object in a specific slot,
 * and attunement binds to one instance, so neither can be folded into a stack
 * without losing the thing that makes it distinct.
 */
const canPoolTogether = (a: InventoryInstance, b: InventoryInstance): boolean =>
  a.itemId === b.itemId &&
  a.slot === CARRIED_SLOT &&
  b.slot === CARRIED_SLOT &&
  !a.isAttuned &&
  !b.isAttuned &&
  // a renamed item is a distinct thing to the player, however identical the
  // rules consider it
  a.customName === b.customName;

/**
 * Folds compatible carried piles together so stowing an item does not leave
 * the pack full of one-item rows.
 *
 * Merges into the earliest matching row and preserves order, so two clients
 * given the same inventory converge on the same result. Idempotent, which also
 * means it quietly repairs duplicate piles that arrived from an older client.
 */
const consolidateCarried = (
  inventory: InventoryInstance[],
): InventoryInstance[] => {
  const consolidated: InventoryInstance[] = [];

  for (const item of inventory) {
    const poolIndex =
      item.slot === CARRIED_SLOT
        ? consolidated.findIndex((candidate) =>
            canPoolTogether(candidate, item),
          )
        : -1;

    if (poolIndex === -1) {
      consolidated.push(item);
      continue;
    }

    const pool = consolidated[poolIndex];
    if (!pool) continue;

    // replace rather than mutate: the row is still referenced by the previous
    // state, and Zustand subscribers compare by identity
    consolidated[poolIndex] = {
      ...pool,
      quantity: pool.quantity + item.quantity,
    };
  }

  return consolidated;
};

/**
 * Moves an item into a slot, splitting and merging stacks as needed.
 *
 * Slot legality comes from the item's authored equipSlot via the engine, so
 * nothing here has to guess an item's kind from its id or special-case a
 * shield. Returns null when the move is illegal, leaving state untouched.
 */
const placeItem = (
  inventory: InventoryInstance[],
  inventoryId: string,
  targetSlot: string,
  snapshot: SheetRuleSnapshot | null,
): InventoryInstance[] | null => {
  if (!isKnownSlot(targetSlot)) return null;

  const moving = inventory.find((item) => item.id === inventoryId);
  if (!moving) return null;

  // nothing to do, and returning null keeps a no-op from emitting a broadcast
  if (moving.slot === targetSlot) return null;

  const definition = resolveItemDefinition(
    moving.itemId,
    snapshot ?? undefined,
  );
  if (!definition || !canEquipTo(definition, targetSlot)) return null;

  const equipment = resolveEquipmentDefinition(
    moving.itemId,
    snapshot ?? undefined,
  );
  const incoming = new Set(
    targetSlot === CARRIED_SLOT
      ? []
      : equipment
        ? slotsConsumedBy(equipment, targetSlot)
        : [targetSlot],
  );

  const next: InventoryInstance[] = [];

  for (const item of inventory) {
    if (item.id === inventoryId) {
      // wearing one arrow out of a quiver of twenty splits the pile: the stack
      // stays put and a new single-item row goes into the slot
      if (targetSlot !== CARRIED_SLOT && item.quantity > WORN_QUANTITY) {
        next.push({ ...item, quantity: item.quantity - WORN_QUANTITY });
        next.push({
          ...item,
          id: newRowId(),
          quantity: WORN_QUANTITY,
          slot: targetSlot,
          // attunement is earned per instance and never inherited from a pile
          isAttuned: false,
        });
        continue;
      }

      next.push({ ...item, slot: targetSlot });
      continue;
    }

    // evict any item whose own footprint overlaps the incoming one's.
    // attunement survives: the item is still carried, just not worn
    const collides = occupiedSlots(item, snapshot).some((slot) =>
      incoming.has(slot),
    );

    next.push(collides ? { ...item, slot: CARRIED_SLOT } : item);
  }

  // stowed and evicted rows both land in the pack, so one pass folds them all
  return consolidateCarried(next);
};

export interface CharacterSheetState {
  id: string;
  campaignId: string | null;
  level: number;
  classLevels: Record<string, number>;
  raceId: string | null;
  subraceId: string | null;

  currentHp: number;
  maxHp: number;
  baseHpRolled: number;

  // base attributes (no items or buffs)
  baseScores: Record<Ability, number>;

  // skill and save proficiencies (mapped by id)
  proficiencies: Record<string, ProficiencyLevel>;

  traits: TraitDefinition[];
  traitGrants: Array<{
    id: string;
    traitId: string;
    source: string;
  }>;

  // operational inventory
  inventory: InventoryInstance[];
  inventoryError: string | null;

  // transient or spell based mods
  activeModifiers: RuntimeModifier[];

  resources: OperationalResource[];
  /**
   * What is true of the character regardless of any active effect: worn armour,
   * encumbrance, and anything the sheet was hydrated with. Kept apart from
   * activeStates so effect expiry can be seen - see composeActiveStates.
   */
  baseStates: string[];
  /**
   * Conditions the player has declared on themselves. Ids from CONDITION_MAP;
   * each one becomes a state that authored rules gate on.
   */
  activeConditions: string[];
  activeStates: string[];
  selectedActorInstanceId: string | null;
  latestRollResults: ActionRollResult[];
  runtimeEffects: EffectManager | null;
  runtimeResources: ResourceManager | null;
  combatContext: CombatContext;
  runtimeCombat: CombatContextManager | null;
  ruleSnapshot: Pick<
    RuleSnapshot,
    "equipmentById" | "itemsById" | "weaponsById" | "resourcesById"
  > | null;

  // actions
  initialize: (payload: Partial<CharacterSheetState>) => void;

  applyHealthDelta: (delta: number, source: string) => void;
  syncRemoteHealthDelta: (delta: number) => void;

  equipItem: (inventoryId: string, targetSlot: string) => void;
  toggleAttunement: (inventoryId: string) => void;
  syncRemoteAttunement: (inventoryId: string, isAttuned: boolean) => void;
  // takes the wire shape: slot arrives as an invalidated string
  syncInventorySnapshot: (
    inventory: Array<Parameters<typeof toInventoryInstance>[0]>,
  ) => void;
  syncRemoteEquipment: (inventoryId: string, targetSlot: string) => void;
  consumeItem: (inventoryId: string, amount: number) => void;
  syncRemoteConsumption: (inventoryId: string, amount: number) => void;
  setInventoryError: (message: string | null) => void;

  consumeResource: (resourceId: string, amount?: number) => void;
  syncRemoteResource: (resourceId: string, amount: number) => void;

  beginCombat: () => void;
  endCombat: () => void;
  triggerRest: (restType: "short" | "long") => void;
  dispatchAuthoredEvent: (eventName: EngineEvent) => void;
  getCharacterActions: () => ActionGrant[];
  executeCharacterAction: (actionId: string) => void;
  selectActorInstance: (actorInstanceId: string | null) => void;
  executeActorAction: (actionId: string, actorInstanceId?: string) => void;
  syncRemoteActionExecution: (payload: ActionResolvedPayload) => void;
  recordRollResult: (payload: RollResultsBroadcastPayload) => void;
  pushCombatEvent: (event: CombatEventInput) => void;
  resolveCombatEvent: (
    eventId: string,
    resolution?: {
      summary?: string;
      reactionSourceId?: string;
      rollSnapshot?: CombatRollSnapshot;
      status?: "resolved" | "dismissed";
    },
  ) => void;
  openHostileAttackReactionWindow: (options?: {
    sourceLabel?: string;
    targetLabel?: string;
    relationship?: CombatTargetRelationship;
    rollSnapshot?: CombatRollSnapshotInput;
  }) => string;
  spendReaction: (sourceId: string) => boolean;
  beginTurn: () => void;
  endTurn: () => void;
  toggleCondition: (conditionId: string) => void;
  handleSaveOutcome: (succeeded: boolean) => void;

  toggleModifier: (modifierId: string, isActive: boolean) => void;
}

export const useCharacterSheetStore = create<CharacterSheetState>(
  (set, get) => ({
    id: "",
    campaignId: null,
    level: 1,
    classLevels: {},
    raceId: null,
    subraceId: null,
    currentHp: 10,
    maxHp: 10,
    baseHpRolled: 1,

    baseScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    proficiencies: {},
    traits: [],
    traitGrants: [],
    inventory: [],
    inventoryError: null,
    activeModifiers: [],
    resources: [],
    baseStates: [],
    activeConditions: [],
    activeStates: [],
    selectedActorInstanceId: null,
    latestRollResults: [],
    runtimeEffects: null,
    runtimeResources: null,
    combatContext: CombatContextSchema.parse({}),
    runtimeCombat: null,
    ruleSnapshot: null,

    initialize: (payload) => set((state) => ({ ...state, ...payload })),

    applyHealthDelta: (delta, source) => {
      const state = get();
      const previousHp = state.currentHp;
      const nextHp = clampHealth(previousHp, delta, state.maxHp);

      const {
        appliedHp,
        rollResults,
        activeStates,
        resources,
        runtimeEffects,
        runtimeResources,
      } = resolveHealthTransition(state, nextHp, previousHp, delta);

      set({
        currentHp: appliedHp,
        activeStates,
        latestRollResults: rollResults,
        resources,
        runtimeEffects,
        runtimeResources,
      });

      // fire and forget network req
      socketService.emitHpModification({
        characterId: state.id,
        delta,
        source,
        timestamp: Date.now(),
      });
    },

    syncRemoteHealthDelta: (delta) => {
      const state = get();
      const previousHp = state.currentHp;
      const nextHp = clampHealth(previousHp, delta, state.maxHp);

      const {
        appliedHp,
        rollResults,
        activeStates,
        resources,
        runtimeEffects,
        runtimeResources,
      } = resolveHealthTransition(state, nextHp, previousHp, delta);

      set({
        currentHp: appliedHp,
        activeStates,
        latestRollResults: rollResults,
        resources,
        runtimeEffects,
        runtimeResources,
      });
    },

    equipItem: (inventoryId, targetSlot) => {
      const state = get();

      // optimistically resolve slot contention locally
      const updatedInventory = placeItem(
        state.inventory,
        inventoryId,
        targetSlot,
        state.ruleSnapshot,
      );

      if (!updatedInventory) {
        return;
      }

      // update local state instantly 0-latency
      set({ inventory: updatedInventory, inventoryError: null });

      // dispatch to backend for persistence and broadcasting
      const movedItem = state.inventory.find((row) => row.id === inventoryId);
      const splitPayload =
        movedItem && movedItem.quantity > 1 && targetSlot !== "backpack"
          ? {
              movedQuantity: 1,
              newInventoryId: updatedInventory.find(
                (row) => row.slot === targetSlot && row.id !== inventoryId,
              )?.id,
            }
          : undefined;

      socketService.emitInventoryUpdate({
        characterId: state.id,
        inventoryId,
        targetSlot,
        ...(splitPayload?.movedQuantity !== undefined && {
          movedQuantity: splitPayload.movedQuantity,
        }),
        ...(splitPayload?.newInventoryId && {
          newInventoryId: splitPayload.newInventoryId,
        }),
        timestamp: Date.now(),
      });
    },

    toggleAttunement: (inventoryId) => {
      const state = get();
      const item = state.inventory.find((row) => row.id === inventoryId);
      if (!item) return;

      const definition = resolveItemDefinition(
        item.itemId,
        state.ruleSnapshot ?? undefined,
      );

      if (!definition?.requiresAttunement) {
        return;
      }

      if (item.isAttuned) {
        // breaking attunement can free the row to rejoin a carried pile
        set({
          inventory: consolidateCarried(
            state.inventory.map((row) =>
              row.id === inventoryId ? { ...row, isAttuned: false } : row,
            ),
          ),
          inventoryError: null,
        });

        socketService.emitAttunementUpdate({
          characterId: state.id,
          inventoryId,
          isAttuned: false,
          timestamp: Date.now(),
        });
        return;
      }

      // attunement is formed while the item is worn or held, so a stowed item
      // cannot begin it
      if (item.slot === CARRIED_SLOT) {
        set({
          inventoryError: `${definition.name} must be equipped before you can attune to it.`,
        });
        return;
      }

      const attunedCount = state.inventory.filter(
        (row) => row.isAttuned,
      ).length;

      if (attunedCount >= ATTUNEMENT_LIMIT) {
        set({
          inventoryError: `Already attuned to ${ATTUNEMENT_LIMIT} items. Break an attunement first.`,
        });
        return;
      }

      set({
        inventory: state.inventory.map((row) =>
          row.id === inventoryId ? { ...row, isAttuned: true } : row,
        ),
        inventoryError: null,
      });

      socketService.emitAttunementUpdate({
        characterId: state.id,
        inventoryId,
        isAttuned: true,
        timestamp: Date.now(),
      });
    },

    syncRemoteAttunement: (inventoryId, isAttuned) => {
      const state = get();
      const item = state.inventory.find((row) => row.id === inventoryId);
      if (!item || item.isAttuned === isAttuned) return;

      // the broadcast is authoritative on intent but not on legality: a stale
      // client could push a fourth attunement, so the cap is re-checked here
      if (isAttuned) {
        const attunedCount = state.inventory.filter(
          (row) => row.isAttuned,
        ).length;

        if (attunedCount >= ATTUNEMENT_LIMIT) return;
      }

      const updated = state.inventory.map((row) =>
        row.id === inventoryId ? { ...row, isAttuned } : row,
      );

      // breaking attunement can free the row to rejoin a carried pile
      set({ inventory: isAttuned ? updated : consolidateCarried(updated) });
    },

    syncInventorySnapshot: (inventory) => {
      set({ inventory: inventory.map(toInventoryInstance) });
    },

    syncRemoteEquipment: (inventoryId, targetSlot) => {
      const state = get();

      // a broadcast carries an invalidated slot string, so it goes through the
      // same legality check as a local move rather than being trusted
      const updatedInventory = placeItem(
        state.inventory,
        inventoryId,
        targetSlot,
        state.ruleSnapshot,
      );

      if (!updatedInventory) {
        return;
      }

      set({ inventory: updatedInventory });
    },

    consumeItem: (inventoryId, amount = 1) => {
      const state = get();

      // find the item and ensure it exists
      const targetItem = state.inventory.find((i) => i.id === inventoryId);
      if (!targetItem) return;

      // optimistically update the array
      const updatedInventory = state.inventory
        .map((item) => {
          if (item.id === inventoryId) {
            return { ...item, quantity: item.quantity - amount };
          }
          return item;
        })
        .filter((item) => item.quantity > 0); // strip it out if it hits 0

      set({ inventory: updatedInventory, inventoryError: null });

      socketService.emitInventoryConsumed({
        characterId: state.id,
        inventoryId,
        amount,
        timestamp: Date.now(),
      });
    },

    syncRemoteConsumption: (inventoryId, amount) => {
      const state = get();
      const updatedInventory = state.inventory
        .map((item) =>
          item.id === inventoryId
            ? { ...item, quantity: item.quantity - amount }
            : item,
        )
        .filter((item) => item.quantity > 0);

      set({ inventory: updatedInventory });
    },

    setInventoryError: (message) => {
      set({ inventoryError: message });
    },

    consumeResource: (resourceId, amount = 1) => {
      const state = get();

      const targetResource = state.resources.find((r) => r.id === resourceId);
      if (!targetResource || targetResource.current < amount) return;

      // optimistically decrement, clamp 0
      const updatedResources = state.resources.map((res) => {
        if (res.id === resourceId) {
          return { ...res, current: Math.max(0, res.current - amount) };
        }
        return res;
      });

      set({ resources: updatedResources });

      // fire network transaction
      socketService.emitResourceConsumed({
        characterId: state.id,
        resourceId,
        amount,
        timestamp: Date.now(),
      });
    },

    syncRemoteResource: (resourceId, amount) => {
      const state = get();
      const updatedResources = state.resources.map((res) => {
        if (res.id === resourceId) {
          return { ...res, current: Math.max(0, res.current - amount) };
        }
        return res;
      });
      set({ resources: updatedResources });
    },

    beginCombat: () => {
      const state = get();
      const runtimeCombat = ensureCombatManager(state);

      set({
        runtimeCombat,
        combatContext: runtimeCombat.beginCombat(),
      });
    },

    endCombat: () => {
      const state = get();
      const runtimeCombat = ensureCombatManager(state);

      set({
        runtimeCombat,
        combatContext: runtimeCombat.endCombat(),
      });
    },

    triggerRest: (restType: "short" | "long") => {
      const state = get();
      const restEvent = restType === "short" ? "ON_SHORT_REST" : "ON_LONG_REST";
      const dispatched = dispatchAuthoredEvent(state, restEvent);
      const runtimeEffects = dispatched.runtimeEffects;
      const runtimeResources = dispatched.runtimeResources;

      const updatedResources = RestEngine.applyRest(
        runtimeResources.getRuntimeResources().map((resource) => ({
          id: resource.id,
          current: resource.currentCharges,
          currentCharges: resource.currentCharges,
        })),
        restType,
        state.level,
        state.classLevels,
        state.ruleSnapshot ?? undefined,
      );
      const updatedHp = restType === "long" ? state.maxHp : state.currentHp;

      set({
        resources: updatedResources,
        currentHp: updatedHp,
        activeStates: dispatched.activeStates,
        latestRollResults: dispatched.rollResults,
        runtimeEffects,
        runtimeResources,
      });

      socketService.emitRestCompleted({
        characterId: state.id,
        restType,
        timestamp: Date.now(),
      });
    },

    dispatchAuthoredEvent: (eventName) => {
      const state = get();
      const dispatched = dispatchAuthoredEvent(state, eventName);

      set({
        activeStates: dispatched.activeStates,
        latestRollResults: dispatched.rollResults,
        resources: dispatched.resources,
        runtimeEffects: dispatched.runtimeEffects,
        runtimeResources: dispatched.runtimeResources,
      });
    },

    getCharacterActions: () => {
      const state = get();
      const nextSave = toCharacterSave(state);
      const runtimeEffects = state.runtimeEffects ?? new EffectManager();
      const runtimeResources = state.runtimeResources ?? new ResourceManager();

      CharacterBootstrapper.hydrateRuntimeManagers(
        nextSave,
        runtimeEffects,
        runtimeResources,
      );

      const activeTraits = CharacterBootstrapper.compileActiveTraits(nextSave);
      return activeTraits.flatMap((trait) => trait.actions ?? []);
    },

    executeCharacterAction: (actionId) => {
      const state = get();
      if (state.id) {
        socketService.emitActionIntent({
          characterId: state.id,
          requestId: crypto.randomUUID(),
          actionId,
          source: "character",
          timestamp: Date.now(),
        });
      }
    },

    selectActorInstance: (actorInstanceId) => {
      set({ selectedActorInstanceId: actorInstanceId });
    },

    executeActorAction: (actionId, actorInstanceId) => {
      const state = get();
      const runtimeEffects = state.runtimeEffects ?? new EffectManager();

      const resolvedActorInstanceId =
        actorInstanceId ?? state.selectedActorInstanceId;
      if (!resolvedActorInstanceId) {
        return;
      }

      const actor = runtimeEffects
        .getActiveActors()
        .find((entry) => entry.instanceId === resolvedActorInstanceId);

      if (!actor) {
        return;
      }

      const action = actor.availableActions.find(
        (entry: ActionGrant) => entry.id === actionId,
      );

      if (!action) {
        return;
      }

      if (state.id) {
        socketService.emitActionIntent({
          characterId: state.id,
          requestId: crypto.randomUUID(),
          actionId,
          source: "actor",
          actorInstanceId: resolvedActorInstanceId,
          timestamp: Date.now(),
        });
      }
    },

    syncRemoteActionExecution: (payload) => {
      const state = get();
      const nextSave = toCharacterSave(state);
      const runtimeEffects = hydrateRuntimeEffectsFromResolved(payload);
      const runtimeResources = state.runtimeResources ?? new ResourceManager();

      CharacterBootstrapper.hydrateRuntimeManagers(
        nextSave,
        runtimeEffects,
        runtimeResources,
      );

      alignRuntimeResources(runtimeResources, payload.resources);

      set((previous) => ({
        // the payload carries the server's effect states only, so the states
        // that do not come from effects have to be folded back in here
        activeStates: composeActiveStates(previous.baseStates, previous.activeConditions, runtimeEffects),
        resources: payload.resources,
        latestRollResults:
          payload.rollResults.length > 0
            ? appendRollResults(
                previous,
                payload.rollResults.map(toActionRollResult),
              )
            : previous.latestRollResults,
        runtimeEffects,
        runtimeResources,
        selectedActorInstanceId:
          payload.actorInstanceId ?? previous.selectedActorInstanceId,
      }));
    },

    recordRollResult: (payload) => {
      set((state) => ({
        latestRollResults: appendRollResults(
          state,
          payload.rollResults.map(toActionRollResult),
        ),
      }));
    },

    pushCombatEvent: (event) => {
      const state = get();
      const runtimeCombat = ensureCombatManager(state);

      set({
        runtimeCombat,
        combatContext: runtimeCombat.pushEvent(event),
      });
    },

    resolveCombatEvent: (eventId, resolution) => {
      const state = get();
      const runtimeCombat = ensureCombatManager(state);

      set({
        runtimeCombat,
        combatContext: runtimeCombat.resolveEvent(eventId, resolution),
      });
    },

    openHostileAttackReactionWindow: (options) => {
      const state = get();
      const runtimeCombat = ensureCombatManager(state);
      const eventId = `evt_${crypto.randomUUID()}`;
      const current = runtimeCombat.getContext();

      if (!current.inCombat) {
        runtimeCombat.beginCombat();
      }

      const combatContext = runtimeCombat.pushEvent({
        id: eventId,
        type: "reaction_window_opened",
        relationship: options?.relationship ?? "adjacent_ally",
        ...(options?.sourceLabel !== undefined && {
          sourceLabel: options.sourceLabel,
        }),
        ...(options?.targetLabel !== undefined && {
          targetLabel: options.targetLabel,
        }),
        ...(options?.rollSnapshot !== undefined && {
          rollSnapshot: options.rollSnapshot,
        }),
      });

      set({ runtimeCombat, combatContext });
      return eventId;
    },

    spendReaction: (sourceId) => {
      const state = get();
      const runtimeCombat = ensureCombatManager(state);
      const spent = runtimeCombat.spendReaction(sourceId);

      set({
        runtimeCombat,
        combatContext: runtimeCombat.getContext(),
      });

      return spent;
    },

    beginTurn: () => {
      const state = get();
      const runtimeCombat = ensureCombatManager(state);
      const combatContext = runtimeCombat.beginTurn({ kind: "player" });

      // expire first, dispatch second: an ON_START_OF_TURN trigger can raise a
      // fresh effect, and ticking afterwards would sweep away the very thing it
      // just created
      state.runtimeEffects?.tickTurnStart();

      const dispatched = dispatchAuthoredEvent(state, "ON_START_OF_TURN");

      set({
        activeStates: dispatched.activeStates,
        latestRollResults: dispatched.rollResults,
        resources: dispatched.resources,
        runtimeEffects: dispatched.runtimeEffects,
        runtimeResources: dispatched.runtimeResources,
        runtimeCombat,
        combatContext,
      });
    },

    endTurn: () => {
      const state = get();
      const runtimeCombat = ensureCombatManager(state);
      const combatContext = runtimeCombat.endTurn({ kind: "player" });

      // same ordering as beginTurn, for the same reason
      state.runtimeEffects?.tickTurnEnd();

      const dispatched = dispatchAuthoredEvent(state, "ON_END_OF_TURN");

      set({
        activeStates: dispatched.activeStates,
        latestRollResults: dispatched.rollResults,
        resources: dispatched.resources,
        runtimeEffects: dispatched.runtimeEffects,
        runtimeResources: dispatched.runtimeResources,
        runtimeCombat,
        combatContext,
      });
    },

    toggleCondition: (conditionId) => {
      // an unknown id would mint a state no authored rule can ever match, and
      // would sit in the list looking like it worked
      if (!CONDITION_MAP[conditionId]) return;

      set((state) => {
        const activeConditions = state.activeConditions.includes(conditionId)
          ? state.activeConditions.filter((id) => id !== conditionId)
          : [...state.activeConditions, conditionId];

        return {
          activeConditions,
          activeStates: composeActiveStates(
            state.baseStates,
            activeConditions,
            state.runtimeEffects ?? new EffectManager(),
          ),
        };
      });
    },

    handleSaveOutcome: (succeeded) => {
      if (!succeeded) {
        get().dispatchAuthoredEvent("ON_SAVING_THROW_FAILED");
      }
    },

    toggleModifier: (modId, isActive) =>
      set((state) => ({
        activeModifiers: state.activeModifiers.map((mod) =>
          mod.id === modId ? { ...mod, isActive } : mod,
        ),
      })),
  }),
);
