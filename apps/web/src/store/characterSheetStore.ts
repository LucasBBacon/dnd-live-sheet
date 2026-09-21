import {
  ActionResolver,
  ATTUNEMENT_LIMIT,
  CARRIED_SLOT,
  CharacterBootstrapper,
  CombatContextManager,
  EffectManager,
  ResourceManager,
  RestEngine,
  buildLevelContext,
  gatherBaseStates,
  gatherSheetModifiers,
  canEquipTo,
  suppressConditions,
  resolveEquipmentDefinition,
  collectGrantedResources,
  getResourceMaxUses,
  materialiseMissingPools,
  ProficiencyExtractor,
  RELENTLESS_RAGE_ACTION_ID,
  resolveResourceRule,
  slotsConsumedBy,
  type Ability,
  type ActionRollResult,
  type ItemActionGrant,
  type LevelContext,
  type OperationalResource,
  type RuntimeResource,
  type SuspendedCondition,
} from "@project/engine";
import {
  CombatContextSchema,
  CONDITION_MAP,
  STANDARD_ACTIONS,
  emptyCharacterChoices,
  type CharacterChoices,
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
  type CoreRulePackSnapshot,
  type DamageType,
  type EngineEvent,
  type FixedProficiencyGrant,
  type HpModifiedPayload,
  type InventoryInstance,
  type RollResultsBroadcastPayload,
  type RuleSnapshot,
  type RuntimeModifier,
  // TraitDefinition moved to the shared schemas when traits were extracted
  type TraitDefinition,
  type TurnResolvedPayload,
  type SurpriseResolvedPayload,
} from "@project/shared";
import { create } from "zustand";
import { socketService } from "../services/socketService";

const isKnownSlot = (slot: string): slot is CharacterSlot =>
  CharacterSlotSchema.safeParse(slot).success;

/**
 * Normalizes an inventory row arriving from the API or a socket broadcast.
 * The wire types slot as a bare string, so an unrecognized value degrades to
 * carried rather than corrupting the worn state.
 *
 * The pre-migration "armor" and "ring" names were once translated here.
 * Migration 0008 rewrote every stored row, so a value still carrying one is
 * not a slot from an older model but data from nowhere, and gets the same
 * treatment as any other unrecognized slot.
 */
export const toInventoryInstance = (item: {
  id: string;
  itemId: string;
  quantity: number;
  slot: string;
  isAttuned: boolean;
  customName?: string;
}): InventoryInstance => {
  return {
    id: item.id,
    itemId: item.itemId,
    quantity: item.quantity,
    slot: isKnownSlot(item.slot) ? item.slot : CARRIED_SLOT,
    isAttuned: item.isAttuned,
    ...(item.customName !== undefined && { customName: item.customName }),
  };
};

/**
 * Actions granted by carried items, keyed by the inventory instance rather
 * than the item id.
 *
 * Two stacks of the same item are two rows on the sheet, and Use has to spend
 * the one the player pressed - so a lookup keyed by itemId could not tell them
 * apart. Mirrors the gather `CharacterEngine.buildLiveSheet` performs
 * server-side; kept here rather than sourced from a broadcast because the
 * inputs it reads - inventory and the rule snapshot - are already the ones
 * the store keeps live.
 */
const computeItemActions = (
  inventory: InventoryInstance[],
  snapshot: SheetRuleSnapshot | null,
): ItemActionGrant[] => {
  const itemActions: ItemActionGrant[] = [];

  for (const instance of inventory) {
    const definition = resolveEquipmentDefinition(
      instance.itemId,
      snapshot ?? undefined,
    );

    for (const action of definition?.actions ?? []) {
      itemActions.push({ instanceId: instance.id, itemId: instance.itemId, action });
    }
  }

  return itemActions;
};

/**
 * The rule content the sheet hands to the engine.
 *
 * Pack content rides alongside the equipment maps rather than inside
 * RuleSnapshot, because RuleSnapshot has no fields for races, classes or
 * subclasses, and its traitsById entries are not guaranteed to carry the
 * isStartingProficiency and lore that CoreRulePackSnapshot requires. Partial:
 * a deployment with no imported pack serves none of it.
 */
type SheetRuleSnapshot = Pick<
  RuleSnapshot,
  "equipmentById" | "resourcesById"
> &
  Partial<CoreRulePackSnapshot>;

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
  ...(state.backgroundId ? { backgroundId: state.backgroundId } : {}),
  classes:
    Object.entries(state.classLevels).length > 0
      ? Object.entries(state.classLevels).map(([classId, level]) => ({
          classId,
          level,
          ...(state.subclassIds[classId] !== null &&
            state.subclassIds[classId] !== undefined && {
              subclassId: state.subclassIds[classId],
            }),
          selections: state.choices.classSelections[classId] ?? {},
        }))
      : [{ classId: "class_fighter", level: 1, selections: {} }],
  traitSelections: state.choices.traitSelections,
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

/**
 * Rebuilds the local effect mirror from whatever the server just reported.
 *
 * Typed on the two fields it reads rather than on a whole payload, so both the
 * action and turn replies can use it.
 */
const hydrateRuntimeEffectsFromResolved = (
  payload: Pick<ActionResolvedPayload, "effects" | "actors">,
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

/**
 * Puts the store's durable counts into the runtime resource manager.
 *
 * hydrateRuntimeManagers seeds pools from the trait grants at their defaults
 * (a charges pool full, a uses pool at 0), and onto a manager that already
 * holds a pool it adds the grant's maximum again and refills it. The counts
 * the server sent are the record, so they have to win: seeded from grants, an
 * hp change refilled a spent Rage and reset Relentless Rage's count, and a
 * count could not be raised afterwards because restore clamps to a maximum
 * a uses pool does not have. The server does the same with
 * hydrateFromPersisted (getAuthoritativeRuntimeContext); the store keeps only
 * the count, so name, maximum, reset and mode come from the rule snapshot,
 * and from the grant for a pool the snapshot does not know.
 *
 * A granted pool the store does not hold yet keeps its default. A stored row
 * with neither a rule nor a grant behind it stays out of the manager, and
 * withRuntimeCounts leaves it as it is.
 */
const adoptStoredResources = (
  manager: ResourceManager,
  stored: readonly OperationalResource[],
  snapshot: SheetRuleSnapshot | null,
  levels: LevelContext,
): void => {
  const granted = new Map(
    manager.getRuntimeResources().map((pool) => [pool.id, pool] as const),
  );
  const counts = new Map(
    stored.map((resource) => [resource.id, resource.current] as const),
  );

  const pools: RuntimeResource[] = [];
  for (const id of new Set([...counts.keys(), ...granted.keys()])) {
    const rule = resolveResourceRule(id, snapshot ?? undefined);
    const grant = granted.get(id);
    if (rule) {
      const maxCharges = getResourceMaxUses(rule, levels);
      pools.push({
        id,
        name: rule.name,
        maxCharges,
        currentCharges:
          counts.get(id) ?? (rule.mode === "uses" ? 0 : maxCharges),
        resetOn: rule.resetCondition,
        ...(rule.mode !== undefined && { mode: rule.mode }),
      });
    } else if (grant) {
      pools.push({
        ...grant,
        currentCharges: counts.get(id) ?? grant.currentCharges,
      });
    }
  }

  manager.hydrateFromPersisted(pools);
};

/**
 * The store's resources with the runtime manager's counts written back, and
 * any pool the manager holds that the store did not yet, appended.
 */
const withRuntimeCounts = (
  stored: readonly OperationalResource[],
  manager: ResourceManager,
): OperationalResource[] => {
  const runtime = manager.getRuntimeResources();
  const countById = new Map(
    runtime.map((pool) => [pool.id, pool.currentCharges] as const),
  );
  const storedIds = new Set(stored.map((resource) => resource.id));

  return [
    ...stored.map((resource) => {
      const count = countById.get(resource.id);
      return count === undefined
        ? resource
        : { ...resource, current: count, currentCharges: count };
    }),
    ...runtime
      .filter((pool) => !storedIds.has(pool.id))
      .map((pool) => ({
        id: pool.id,
        current: pool.currentCharges,
        currentCharges: pool.currentCharges,
      })),
  ];
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
  suppressions: Array<{ condition: string; requiredStates: string[]; forbiddenStates: string[]; source?: string }> = [],
): string[] => {
  const effectStates = effectManager.getActiveStates();
  const gatingStates = [...(baseStates ?? []), ...effectStates];
  const active = suppressConditions(
    activeConditions ?? [],
    suppressions,
    gatingStates,
  ).active;

  return Array.from(new Set([...gatingStates, ...active]));
};

const getConditionSuppressions = (state: Pick<CharacterSheetState, "ruleSnapshot" | "classLevels" | "subclassIds" | "baseScores" | "raceId" | "subraceId" | "backgroundId" | "choices" | "currentHp" | "baseHpRolled" | "traitGrants" | "activeConditions">): Array<{ condition: string; requiredStates: string[]; forbiddenStates: string[]; source?: string }> => {
  if (!state.ruleSnapshot) return [];
  return CharacterBootstrapper.compileActiveTraits(
    toCharacterSave(state as CharacterSheetState),
    state.ruleSnapshot,
  ).flatMap((trait) =>
    (trait.conditionSuppressions ?? []).map((suppression) => ({
      ...suppression,
      requiredStates: suppression.requiredStates ?? [],
      forbiddenStates: suppression.forbiddenStates ?? [],
      source: trait.name,
    })),
  );
};

const dispatchAuthoredEvent = (
  state: CharacterSheetState,
  eventName: EngineEvent,
) => {
  const nextSave = toCharacterSave(state);
  const runtimeEffects = state.runtimeEffects ?? new EffectManager();
  const runtimeResources = state.runtimeResources ?? new ResourceManager();

  // the pack is the only source a trait can resolve from; without it no trait
  // compiles, so no trigger ever fires
  const snapshot = state.ruleSnapshot ?? undefined;

  CharacterBootstrapper.hydrateRuntimeManagers(
    nextSave,
    runtimeEffects,
    runtimeResources,
    snapshot,
  );
  adoptStoredResources(
    runtimeResources,
    state.resources,
    state.ruleSnapshot,
    buildLevelContext(state.classLevels, state.subclassIds, snapshot),
  );

  const activeTraits = CharacterBootstrapper.compileActiveTraits(
    nextSave,
    snapshot,
  );
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
    activeStates: composeActiveStates(
      state.baseStates,
      state.activeConditions,
      runtimeEffects,
      getConditionSuppressions(state),
    ),
    resources: withRuntimeCounts(state.resources, runtimeResources),
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
      state.ruleSnapshot ?? undefined,
    );
  }
  // a manager kept from an earlier hydration may hold counts the store has
  // since moved past, so the store's are adopted either way
  adoptStoredResources(
    runtimeResources,
    state.resources,
    state.ruleSnapshot,
    buildLevelContext(
      state.classLevels,
      state.subclassIds,
      state.ruleSnapshot ?? undefined,
    ),
  );

  let appliedHp = targetHp;
  let rollResults: ActionRollResult[] = [];
  let activeStates = composeActiveStates(
    state.baseStates,
    state.activeConditions,
    runtimeEffects,
    getConditionSuppressions(state),
  );
  let resources = withRuntimeCounts(state.resources, runtimeResources);

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

  const equipment = resolveEquipmentDefinition(
    moving.itemId,
    snapshot ?? undefined,
  );
  if (!equipment || !canEquipTo(equipment, targetSlot)) return null;

  const incoming = new Set(
    targetSlot === CARRIED_SLOT ? [] : slotsConsumedBy(equipment, targetSlot),
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
  subclassIds: Record<string, string | null>;
  raceId: string | null;
  subraceId: string | null;
  /** The preset background, by id; null for none or a custom background. */
  backgroundId: string | null;
  /** Every answer the character has given, keyed by the question it answers. */
  choices: CharacterChoices;

  currentHp: number;
  maxHp: number;
  baseHpRolled: number;

  // base attributes (no items or buffs)
  baseScores: Record<Ability, number>;

  traits: TraitDefinition[];
  traitGrants: Array<{
    id: string;
    traitId: string;
    source: string;
  }>;

  // operational inventory
  inventory: InventoryInstance[];
  inventoryError: string | null;
  /**
   * Actions granted by carried items, recomputed alongside `inventory` and
   * `ruleSnapshot` - see computeItemActions. Read from the inventory row so a
   * carried vial offers "Throw Acid" beside the plain "Use" button.
   */
  itemActions: ItemActionGrant[];

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
  /**
   * Rules the engine could not enforce on the last resolved action, for the
   * sheet to show the player - mirrors ActionResolvedPayload.notes. Kept
   * alongside latestRollResults rather than in its own slice so both surfaces
   * that already read the last resolution can read this too.
   */
  latestNotes: string[];
  runtimeEffects: EffectManager | null;
  runtimeResources: ResourceManager | null;
  combatContext: CombatContext;
  runtimeCombat: CombatContextManager | null;
  ruleSnapshot: SheetRuleSnapshot | null;

  // actions
  initialize: (payload: Partial<CharacterSheetState>) => void;

  applyHealthDelta: (delta: number, source: string) => void;
  syncRemoteHealthDelta: (payload: HpModifiedPayload) => void;

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
  useItemAction: (instanceId: string, actionId: string) => void;

  consumeResource: (resourceId: string, amount?: number) => void;
  syncRemoteResource: (resourceId: string, amount: number) => void;

  beginCombat: () => void;
  endCombat: () => void;
  setSurprised: (surprised: boolean) => void;
  syncRemoteSurprise: (payload: SurpriseResolvedPayload) => void;
  triggerRest: (restType: "short" | "long") => void;
  dispatchAuthoredEvent: (eventName: EngineEvent) => void;
  /**
   * The traits the character actually has, compiled from the save against the
   * loaded pack. The single place the sheet resolves "what do I have" so the
   * panel, the action list and the trigger dispatch cannot disagree.
   */
  getActiveTraits: () => TraitDefinition[];
  /**
   * Every modifier the sheet applies - traits with their choices, equipment,
   * live effects - plus the dev TraitWidget's activeModifiers on top. The
   * same gather the server's buildLiveSheet uses (#73).
   */
  getSheetModifiers: () => RuntimeModifier[];
  /**
   * The states the sheet's calculators gate on: whatever activeStates the
   * store has composed (conditions, effects, server replies) plus the states
   * the character's traits and worn equipment always put on it. activeStates
   * alone is only composed on events, so worn armour was invisible (#73).
   */
  getSheetStates: () => string[];
  /**
   * Every proficiency the character's traits grant, choice blocks resolved.
   *
   * The same call characterEngine.ts makes. The store used to keep a flat
   * `proficiencies` record instead, hydrated from an API field that does not
   * exist - the characters table has no such column - so it was `{}` for every
   * character and no skill, save or attack ever gained a proficiency bonus.
   */
  getProficiencyGrants: () => FixedProficiencyGrant[];
  /**
   * Toggled conditions a trait is holding off, and what holds them.
   * composeActiveStates already leaves these out of activeStates; this is the
   * half it computes and discards, for the widgets that have to say so.
   */
  getSuspendedConditions: () => SuspendedCondition[];
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
  syncRemoteTurnResolution: (payload: TurnResolvedPayload) => void;
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
    subclassIds: {},
    raceId: null,
    subraceId: null,
    backgroundId: null,
    choices: emptyCharacterChoices(),
    currentHp: 10,
    maxHp: 10,
    baseHpRolled: 1,

    baseScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    traits: [],
    traitGrants: [],
    inventory: [],
    inventoryError: null,
    itemActions: [],
    activeModifiers: [],
    resources: [],
    baseStates: [],
    activeConditions: [],
    activeStates: [],
    selectedActorInstanceId: null,
    latestRollResults: [],
    latestNotes: [],
    runtimeEffects: null,
    runtimeResources: null,
    combatContext: CombatContextSchema.parse({}),
    runtimeCombat: null,
    ruleSnapshot: null,

    initialize: (payload) =>
      set((state) => {
        const next = { ...state, ...payload };
        const itemActions = computeItemActions(next.inventory, next.ruleSnapshot);

        // No pack, nothing to compile against: every resolver in ruleLookup
        // answers undefined without a snapshot, so the walk below could only
        // ever return an empty list. The sheet hydrates twice - once bare,
        // then again with the snapshot - and this is the bare pass.
        if (!next.ruleSnapshot) return { ...next, itemActions };

        const activeTraits = CharacterBootstrapper.compileActiveTraits(
          toCharacterSave(next),
          next.ruleSnapshot,
        );
        // the server counts the same way (getAuthoritativeRuntimeContext), so
        // the two materialisations agree on a class_level_thresholds pool
        const levels = buildLevelContext(
          next.classLevels,
          next.subclassIds,
          next.ruleSnapshot,
        );
        const missingPools = materialiseMissingPools(
          next.resources.map((resource) => resource.id),
          collectGrantedResources(activeTraits, next.ruleSnapshot),
          levels,
        );

        // Hand back the same array when nothing was added. useFeatures and
        // RestModal select `resources` under zustand's default Object.is, and
        // TraitWidget calls initialize from an effect on every modifier
        // change, so a fresh array here re-renders them both for nothing.
        if (missingPools.length === 0) return { ...next, itemActions };

        return {
          ...next,
          resources: [
            ...next.resources,
            ...missingPools.map((pool) => ({
              id: pool.id,
              name: pool.name,
              current: pool.current,
              currentCharges: pool.current,
            })),
          ],
          itemActions,
        };
      }),

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
        // an hp change is a new moment superseding whatever the roll display
        // was showing, and it never carries a note of its own - so a stale
        // note from an earlier action must not survive it either
        latestNotes: [],
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

    syncRemoteHealthDelta: (payload) => {
      const state = get();
      // HP_MODIFIED broadcasts to the whole campaign room, not just the
      // character it applies to - so without this, another player's heal or
      // damage silently changes this sheet's displayed hp too, and only a
      // reload would reveal the divergence from the database.
      if (payload.characterId !== state.id) return;

      const { delta } = payload;
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
        latestNotes: [],
        resources,
        runtimeEffects,
        runtimeResources,
      });
    },

    equipItem: (inventoryId, targetSlot) => {
      const state = get();

      // `placeItem` checks this too, but narrowing here is what lets the slot
      // reach the socket payload as a CharacterSlot rather than a bare string.
      // The UI sources it from a <select> value, so this is where it stops
      // being arbitrary text.
      if (!isKnownSlot(targetSlot)) return;

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

      const definition = resolveEquipmentDefinition(
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
      const nextInventory = inventory.map(toInventoryInstance);
      set((state) => ({
        inventory: nextInventory,
        itemActions: computeItemActions(nextInventory, state.ruleSnapshot),
      }));
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

      set({
        inventory: updatedInventory,
        itemActions: computeItemActions(updatedInventory, state.ruleSnapshot),
        inventoryError: null,
      });

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

      set({
        inventory: updatedInventory,
        itemActions: computeItemActions(updatedInventory, state.ruleSnapshot),
      });
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

    /**
     * Asks the server to record whether the character was surprised.
     *
     * Emitted rather than set locally, unlike beginCombat and endCombat: the
     * server owns turn state, and two clients on one character have to agree
     * about it. Nothing changes here until the broadcast comes back, for the
     * same reason an action's outcome is not guessed at locally.
     */
    setSurprised: (surprised: boolean) => {
      socketService.emitSurpriseDeclared({
        characterId: get().id,
        surprised,
        timestamp: Date.now(),
      });
    },

    syncRemoteSurprise: (payload) => {
      set({
        runtimeCombat: createCombatManager(payload.combatContext),
        combatContext: payload.combatContext,
      });
    },

    triggerRest: (restType: "short" | "long") => {
      const state = get();
      const restEvent = restType === "short" ? "ON_SHORT_REST" : "ON_LONG_REST";
      const dispatched = dispatchAuthoredEvent(state, restEvent);
      const runtimeEffects = dispatched.runtimeEffects;
      const runtimeResources = dispatched.runtimeResources;

      const updatedResources = RestEngine.applyRest(
        dispatched.resources,
        restType,
        buildLevelContext(
          state.classLevels,
          state.subclassIds,
          state.ruleSnapshot ?? undefined,
        ),
        state.ruleSnapshot ?? undefined,
      );
      const updatedHp = restType === "long" ? state.maxHp : state.currentHp;

      set({
        resources: updatedResources,
        currentHp: updatedHp,
        activeStates: dispatched.activeStates,
        latestRollResults: dispatched.rollResults,
        // a rest is a new moment, and this dispatch path carries no note of
        // its own - clear whatever the last resolved action left behind
        latestNotes: [],
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
        // this dispatch path carries no note of its own, so a note left by
        // an earlier resolved action must not survive it
        latestNotes: [],
        resources: dispatched.resources,
        runtimeEffects: dispatched.runtimeEffects,
        runtimeResources: dispatched.runtimeResources,
      });
    },

    getActiveTraits: () => {
      const state = get();
      return CharacterBootstrapper.compileActiveTraits(
        toCharacterSave(state),
        state.ruleSnapshot ?? undefined,
      );
    },

    getSheetModifiers: () => {
      const state = get();
      const save = toCharacterSave(state);
      return [
        ...gatherSheetModifiers({
          activeTraits: CharacterBootstrapper.compileActiveTraits(
            save,
            state.ruleSnapshot ?? undefined,
          ),
          selections: CharacterBootstrapper.resolveSelections(save),
          inventory: state.inventory,
          effectManager: state.runtimeEffects ?? new EffectManager(),
          ...(state.ruleSnapshot ? { snapshot: state.ruleSnapshot } : {}),
        }),
        ...state.activeModifiers,
      ];
    },

    getSheetStates: () => {
      const state = get();
      return Array.from(
        new Set([
          ...state.activeStates,
          ...gatherBaseStates({
            activeTraits: CharacterBootstrapper.compileActiveTraits(
              toCharacterSave(state),
              state.ruleSnapshot ?? undefined,
            ),
            inventory: state.inventory,
            ...(state.ruleSnapshot ? { snapshot: state.ruleSnapshot } : {}),
          }),
        ]),
      );
    },

    getProficiencyGrants: () => {
      const state = get();
      const save = toCharacterSave(state);

      return ProficiencyExtractor.extractProficiencies(
        CharacterBootstrapper.compileActiveTraits(
          save,
          state.ruleSnapshot ?? undefined,
        ),
        CharacterBootstrapper.resolveSelections(save),
      );
    },

    getSuspendedConditions: () => {
      const state = get();
      // the gates composeActiveStates uses: base states and effect states,
      // never the conditions themselves
      const gatingStates = [
        ...state.baseStates,
        ...(state.runtimeEffects?.getActiveStates() ?? []),
      ];
      return suppressConditions(
        state.activeConditions,
        getConditionSuppressions(state),
        gatingStates,
      ).suspended;
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
        state.ruleSnapshot ?? undefined,
      );

      const activeTraits = get().getActiveTraits();
      // the standard actions are not granted by anything - Dodge is a rule, not
      // a trait - so they are always present, ahead of what traits add
      return [
        ...STANDARD_ACTIONS,
        ...activeTraits.flatMap((trait) => trait.actions ?? []),
      ].filter(
        // A dynamic_weapon_attack is a template: useCombat draws its concrete
        // swings as attack cards. Relentless Rage answers a moment the Rules
        // panel reports - 0 hit points while raging - and lives there, not as
        // a button that can be pressed at full health. Dropped by id, not as
        // every self_save: the panel offers only this one, and any other
        // self-save would otherwise be reachable from nowhere.
        (action) =>
          action.effect.type !== "dynamic_weapon_attack" &&
          action.id !== RELENTLESS_RAGE_ACTION_ID,
      );
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
      // ACTION_RESOLVED broadcasts to the whole campaign room, not just the
      // character it resolved for - so without this, another player's action
      // paints into this sheet: their tableNote fills this sheet's "rules the
      // engine could not run" panel, and a no-roll resolution wipes this
      // sheet's roll display out from under it.
      if (payload.characterId !== state.id) return;

      const nextSave = toCharacterSave(state);
      const runtimeEffects = hydrateRuntimeEffectsFromResolved(payload);
      const runtimeResources = state.runtimeResources ?? new ResourceManager();

      CharacterBootstrapper.hydrateRuntimeManagers(
        nextSave,
        runtimeEffects,
        runtimeResources,
        state.ruleSnapshot ?? undefined,
      );

      adoptStoredResources(
        runtimeResources,
        payload.resources,
        state.ruleSnapshot,
        buildLevelContext(
          state.classLevels,
          state.subclassIds,
          state.ruleSnapshot ?? undefined,
        ),
      );

      set((previous) => ({
        // the payload carries the server's effect states only, so the states
        // that do not come from effects have to be folded back in here
        activeStates: composeActiveStates(
          previous.baseStates,
          previous.activeConditions,
          runtimeEffects,
          getConditionSuppressions(previous),
        ),
        resources: payload.resources,
        // one ACTION_RESOLVED reply is one action, so latestRollResults
        // and latestNotes are always decided together from this payload -
        // an empty payload.rollResults legitimately means this action
        // rolled nothing, not "keep showing whatever the last action rolled"
        latestRollResults:
          payload.rollResults.length > 0
            ? appendRollResults(
                previous,
                payload.rollResults.map(toActionRollResult),
              )
            : [],
        latestNotes: payload.notes ?? [],
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
        // this always records a fresh, unrelated roll - an ability check, a
        // save, the Protection reaction - so a note from whatever action
        // resolved last must not linger beside it. Only ACTION_RESOLVED ever
        // supplies a real note; every other roll source clears it.
        latestNotes: [],
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

    // The server settles the cost, including spending the item itself, so this
    // must not also call consumeItem - that would spend two.
    useItemAction: (instanceId, actionId) => {
      socketService.emitActionIntent({
        characterId: get().id,
        requestId: crypto.randomUUID(),
        actionId,
        source: "item",
        instanceId,
        timestamp: Date.now(),
      });
    },

    // Turn transitions are requested, not performed. The server owns effect
    // expiry and the action economy; a local tick here would be undone by the
    // very next sync from it, which is the bug this replaced.
    beginTurn: () => {
      socketService.emitTurnIntent("started", {
        characterId: get().id,
        requestId: crypto.randomUUID(),
        timestamp: Date.now(),
      });
    },

    endTurn: () => {
      socketService.emitTurnIntent("ended", {
        characterId: get().id,
        requestId: crypto.randomUUID(),
        timestamp: Date.now(),
      });
    },

    syncRemoteTurnResolution: (payload) => {
      const state = get();
      const runtimeEffects = hydrateRuntimeEffectsFromResolved(payload);
      const runtimeResources = state.runtimeResources ?? new ResourceManager();

      CharacterBootstrapper.hydrateRuntimeManagers(
        toCharacterSave(state),
        runtimeEffects,
        runtimeResources,
        state.ruleSnapshot ?? undefined,
      );

      adoptStoredResources(
        runtimeResources,
        payload.resources,
        state.ruleSnapshot,
        buildLevelContext(
          state.classLevels,
          state.subclassIds,
          state.ruleSnapshot ?? undefined,
        ),
      );

      set((previous) => ({
        // conditions and base states are the player's, not the server's, so
        // they are composed back in rather than taken from the payload
        activeStates: composeActiveStates(
          previous.baseStates,
          previous.activeConditions,
          runtimeEffects,
          getConditionSuppressions(previous),
        ),
        resources: payload.resources,
        latestRollResults:
          payload.rollResults.length > 0
            ? appendRollResults(
                previous,
                payload.rollResults.map(toActionRollResult),
              )
            : previous.latestRollResults,
        // TurnResolvedPayload carries no note of its own. When it does add a
        // roll, that roll is not the one any prior note described, so the
        // note must go with it; when it adds nothing, latestRollResults is
        // untouched and latestNotes follows the same rule
        latestNotes: payload.rollResults.length > 0 ? [] : previous.latestNotes,
        runtimeEffects,
        runtimeResources,
        runtimeCombat: createCombatManager(payload.combatContext),
        combatContext: payload.combatContext,
      }));
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
            getConditionSuppressions({ ...state, activeConditions }),
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
