import { db } from "@project/database";
import {
  EQUIPMENT_SLOTS,
  characterClasses,
  characterInventory,
  characterResources,
  characters,
} from "@project/database/src/schema/operational.js";
import { items } from "@project/database/src/schema/reference.js";
import {
  type ActionGrant,
  type ActionIntentPayload,
  type ActionResolvedPayload,
  type CharacterSlot,
  type InventorySyncPayload,
  type InventoryInstance,
  type RoomJoinPayload,
  SOCKET_EVENTS,
  type CharacterSave,
  type HpModifiedPayload,
  type ItemConsumedPayload,
  type ItemEquippedPayload,
  type ResourceConsumedPayload,
  type RuntimeEffectSyncPayload,
  type RollResultsBroadcastPayload,
  type TurnIntentPayload,
  type SurpriseDeclaredPayload,
  type SurpriseResolvedPayload,
} from "@project/shared";
import { Server, Socket } from "socket.io";
import { and, eq, inArray, not, sql } from "drizzle-orm";
import {
  CharacterEngine,
  ActionResolver,
  CharacterBootstrapper,
  CombatContextManager,
  EffectManager,
  ResourceManager,
  RestEngine,
  canEquipTo,
  slotsConsumedBy,
} from "@project/engine";
import { resolvePlayerTurn } from "../services/turnResolution.js";
import { getCachedRuleSnapshot } from "../services/ruleSnapshotCache.js";
import {
  getCampaignMembershipRole,
  getUserIdFromSocket,
} from "../services/campaignAccess.js";

const EQUIPMENT_SLOT_SET = new Set<string>(EQUIPMENT_SLOTS);

/**
 * Confirms a slot name off the wire is one this table can actually hold.
 *
 * `targetSlot` is typed `CharacterSlot`, but a socket payload is untrusted
 * input that no runtime validation has been past, so the type is a statement
 * about well-behaved clients rather than a guarantee. This is the boundary
 * that makes it true.
 */
const resolveTargetSlot = (targetSlot: string): CharacterSlot | null =>
  EQUIPMENT_SLOT_SET.has(targetSlot) ? (targetSlot as CharacterSlot) : null;

type SocketDataContext = {
  campaignId?: string;
  userId?: string;
};

const getSocketContext = (socket: Socket): SocketDataContext =>
  socket.data as SocketDataContext;

const setSocketContext = (
  socket: Socket,
  context: Partial<SocketDataContext>,
): void => {
  socket.data = { ...(socket.data as SocketDataContext), ...context };
};

const ensureCharacterInSocketCampaign = async (
  socket: Socket,
  characterId: string,
): Promise<string> => {
  const context = getSocketContext(socket);
  if (!context.campaignId) {
    throw new Error("Socket is not joined to a campaign context.");
  }

  const [character] = await db
    .select({ campaignId: characters.campaignId })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  if (!character || character.campaignId !== context.campaignId) {
    throw new Error("Character does not belong to the joined campaign.");
  }

  return context.campaignId;
};

const AUTHORITY_RUNTIME_TTL_MS = 1000 * 60 * 45;
const AUTHORITY_REQUEST_CACHE_LIMIT = 200;

interface AuthoritativeRuntimeContext {
  save: CharacterSave;
  effectManager: EffectManager;
  resourceManager: ResourceManager;
  /**
   * Turn state joins effects and resources here so a single owner expires
   * effects and refreshes the economy. A client-side copy would be overwritten
   * by the next sync from this one.
   */
  combatContext: CombatContextManager;
  responseByRequestId: Map<string, ActionResolvedPayload>;
  lastTouchedAt: number;
}

const authoritativeRuntimeByCharacter = new Map<
  string,
  AuthoritativeRuntimeContext
>();

const pruneAuthoritativeRuntime = () => {
  const now = Date.now();

  for (const [characterId, runtime] of authoritativeRuntimeByCharacter) {
    if (now - runtime.lastTouchedAt > AUTHORITY_RUNTIME_TTL_MS) {
      authoritativeRuntimeByCharacter.delete(characterId);
    }
  }
};

const toCharacterSave = (
  character: {
    raceId: string;
    subraceId: string | null;
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
    currentHp: number | null;
    maxHp: number | null;
  },
  classes: Array<{ classId: string; classLevel: number }>,
): CharacterSave => ({
  attributes: {
    str: character.str,
    dex: character.dex,
    con: character.con,
    int: character.int,
    wis: character.wis,
    cha: character.cha,
  },
  race: {
    baseRaceId: character.raceId,
    hasSubraces: character.subraceId !== null,
    subraceId: character.subraceId,
  },
  classes:
    classes.length > 0
      ? classes.map((entry) => ({
          classId: entry.classId,
          level: entry.classLevel,
          selections: {},
        }))
      : [{ classId: "class_fighter", level: 1, selections: {} }],
  traitSelections: {},
  hp: {
    current: character.currentHp ?? character.maxHp ?? 1,
    temporary: 0,
    baseRolledHp: character.maxHp ?? 1,
    hitDiceSpent: {},
  },
});

const toRuntimeEffectsPayload = (
  effectManager: EffectManager,
): RuntimeEffectSyncPayload[] =>
  effectManager.getActiveEffects().map((effect) => ({
    instanceId: effect.instanceId,
    sourceName: effect.sourceName,
    durationType: effect.durationType,
    ...(effect.durationRemaining !== undefined && {
      durationRemaining: effect.durationRemaining,
    }),
    isSelfConcentration: effect.isSelfConcentration,
    modifiers: effect.modifiers,
    grantedStates: effect.grantedStates,
    ...(effect.kind !== undefined && { kind: effect.kind }),
    ...(effect.durationHours !== undefined && {
      durationHours: effect.durationHours,
    }),
    ...(effect.summonEntities !== undefined && {
      summonEntities: effect.summonEntities,
    }),
  }));

const getAuthoritativeRuntimeContext = async (
  characterId: string,
): Promise<AuthoritativeRuntimeContext> => {
  const [character] = await db
    .select({
      raceId: characters.raceId,
      subraceId: characters.subraceId,
      str: characters.str,
      dex: characters.dex,
      con: characters.con,
      int: characters.int,
      wis: characters.wis,
      cha: characters.cha,
      currentHp: characters.currentHp,
      maxHp: characters.maxHp,
    })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  if (!character) {
    throw new Error("Character not found for authoritative action resolution.");
  }

  const classRows = await db
    .select({
      classId: characterClasses.classId,
      classLevel: characterClasses.classLevel,
    })
    .from(characterClasses)
    .where(eq(characterClasses.characterId, characterId));

  const nextSave = toCharacterSave(character, classRows);
  const existing = authoritativeRuntimeByCharacter.get(characterId);

  if (existing) {
    existing.save = nextSave;
    existing.lastTouchedAt = Date.now();
    CharacterBootstrapper.hydrateRuntimeManagers(
      existing.save,
      existing.effectManager,
      existing.resourceManager,
    );
    return existing;
  }

  const effectManager = new EffectManager();
  const resourceManager = new ResourceManager();
  CharacterBootstrapper.hydrateRuntimeManagers(
    nextSave,
    effectManager,
    resourceManager,
  );

  const runtime: AuthoritativeRuntimeContext = {
    save: nextSave,
    effectManager,
    resourceManager,
    combatContext: new CombatContextManager(),
    responseByRequestId: new Map(),
    lastTouchedAt: Date.now(),
  };

  authoritativeRuntimeByCharacter.set(characterId, runtime);
  return runtime;
};

const resolveCharacterAction = async (
  runtime: AuthoritativeRuntimeContext,
  characterId: string,
  actionId: string,
): Promise<{
  action: ActionGrant | null;
  diceRules: Array<any>;
  attacksPerAction: number;
}> => {
  const inventoryRows = await db
    .select({
      id: characterInventory.id,
      itemId: characterInventory.itemId,
      quantity: characterInventory.quantity,
      slot: characterInventory.slot,
      isAttuned: characterInventory.isAttuned,
      customName: characterInventory.customName,
    })
    .from(characterInventory)
    .where(eq(characterInventory.characterId, characterId));

  const inventory = inventoryRows as InventoryInstance[];
  const liveSheet = CharacterEngine.buildLiveSheet(
    runtime.save,
    inventory,
    runtime.effectManager,
    runtime.resourceManager,
  );

  const activeTraits = CharacterBootstrapper.compileActiveTraits(runtime.save);
  const diceRules = activeTraits.flatMap((trait) => trait.diceRules ?? []);
  const action =
    liveSheet.actions.find((entry) => entry.id === actionId) ?? null;

  return {
    action,
    diceRules,
    attacksPerAction: liveSheet.attacksPerAction.total,
  };
};

export function initializeWebSocketGateway(httpServer: any) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL, methods: ["GET", "POST"] },
  });

  io.on("connection", (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // ROOM ORCHESTRATION

    socket.on(
      SOCKET_EVENTS.ROOM_JOIN,
      async (payload: string | RoomJoinPayload) => {
        const roomJoinPayload: RoomJoinPayload =
          typeof payload === "string" ? { campaignId: payload } : payload;
        const { campaignId, characterId } = roomJoinPayload;

        const userId = getUserIdFromSocket(socket);
        if (!userId) {
          socket.emit("action_error", {
            event: SOCKET_EVENTS.ROOM_JOIN,
            error: "Missing socket auth user context.",
            payload: { campaignId },
          });
          return;
        }

        const membershipRole = await getCampaignMembershipRole(
          userId,
          campaignId,
        );

        if (!membershipRole) {
          socket.emit("action_error", {
            event: SOCKET_EVENTS.ROOM_JOIN,
            error: "Not authorized for campaign room.",
            payload: { campaignId },
          });
          return;
        }

        socket.join(`campaign_${campaignId}`);
        setSocketContext(socket, { campaignId, userId });
        console.log(`Socket ${socket.id} joined campaign_${campaignId}`);

        // Emit an authoritative inventory snapshot to the joining client.
        // Runtime inventory source-of-truth is operational character_inventory.
        if (characterId) {
          const scopedCampaignId = await ensureCharacterInSocketCampaign(
            socket,
            characterId,
          );
          const inventory = await db
            .select({
              id: characterInventory.id,
              itemId: characterInventory.itemId,
              quantity: characterInventory.quantity,
              slot: characterInventory.slot,
              isAttuned: characterInventory.isAttuned,
              customName: characterInventory.customName,
              containerId: characterInventory.containerId,
            })
            .from(characterInventory)
            .where(eq(characterInventory.characterId, characterId));

          const inventorySyncPayload: InventorySyncPayload = {
            characterId,
            inventory,
          };

          socket.emit(SOCKET_EVENTS.INVENTORY_SYNC, inventorySyncPayload);
          console.log(
            `Socket ${socket.id} synced inventory for ${characterId} in campaign_${scopedCampaignId}`,
          );
        }
      },
    );

    // ATOMIC EVENT HANDLERS

    // #region HP MODIFIED

    socket.on(SOCKET_EVENTS.HP_MODIFIED, async (payload: HpModifiedPayload) => {
      try {
        const campaignId = await ensureCharacterInSocketCampaign(
          socket,
          payload.characterId,
        );

        // 1 - persist the delta immediately using an atomic SQL update
        // this prevents race conditions if 2 sources damage the character at the exact same millisecond
        await db
          .update(characters)
          .set({ currentHp: sql`${characters.currentHp} + ${payload.delta}` })
          .where(eq(characters.id, payload.characterId));

        // 2 - broadcast to everyone in the room EXCEPT sender
        // sender already updated UI optimistically
        socket.to(`campaign_${campaignId}`).emit(SOCKET_EVENTS.HP_MODIFIED, {
          actorId: socket.id,
          data: payload,
        });
      } catch (error) {
        console.error("Failed to process HP modification:", error);
        // dispatch an error rollback event back to sender if DB transaction fails
        socket.emit("error:rollback", {
          event: SOCKET_EVENTS.HP_MODIFIED,
          payload,
        });
      }
    });

    // #endregion

    // #region ROLL RESULTS

    socket.on(
      SOCKET_EVENTS.ROLL_RESULTS,
      async (payload: RollResultsBroadcastPayload) => {
        try {
          const campaignId = await ensureCharacterInSocketCampaign(
            socket,
            payload.characterId,
          );

          socket.to(`campaign_${campaignId}`).emit(SOCKET_EVENTS.ROLL_RESULTS, {
            actorId: socket.id,
            data: payload,
          });
        } catch (error) {
          console.error("Failed to process roll results broadcast:", error);
          socket.emit("error:rollback", {
            event: SOCKET_EVENTS.ROLL_RESULTS,
            payload,
          });
        }
      },
    );

    // #endregion

    // #region ACTION INTENT

    socket.on(
      SOCKET_EVENTS.ACTION_INTENT,
      async (payload: ActionIntentPayload) => {
        try {
          pruneAuthoritativeRuntime();

          const campaignId = await ensureCharacterInSocketCampaign(
            socket,
            payload.characterId,
          );

          const runtime = await getAuthoritativeRuntimeContext(
            payload.characterId,
          );
          runtime.lastTouchedAt = Date.now();

          const cached = runtime.responseByRequestId.get(payload.requestId);
          if (cached) {
            socket.emit(SOCKET_EVENTS.ACTION_RESOLVED, cached);
            return;
          }

          let action: ActionGrant | null = null;
          let diceRules: Array<unknown> = [];
          // one, unless the character has Extra Attack; the resolver needs it
          // to size the Attack action's allowance on the first swing
          let attacksPerAction = 1;
          let actorInstanceId: string | undefined = payload.actorInstanceId;
          let actionStates = runtime.effectManager.getActiveStates();

          if (payload.source === "character") {
            const resolved = await resolveCharacterAction(
              runtime,
              payload.characterId,
              payload.actionId,
            );
            action = resolved.action;
            diceRules = resolved.diceRules;
            attacksPerAction = resolved.attacksPerAction;
          } else {
            if (!payload.actorInstanceId) {
              throw new Error("Actor action intent missing actorInstanceId.");
            }

            const actor = runtime.effectManager
              .getActiveActors()
              .find((entry) => entry.instanceId === payload.actorInstanceId);

            if (!actor) {
              throw new Error("Actor action intent references unknown actor.");
            }

            action =
              actor.availableActions.find(
                (entry) => entry.id === payload.actionId,
              ) ?? null;
            actionStates = actor.currentStates;
            actorInstanceId = actor.instanceId;
          }

          const execution =
            action !== null
              ? ActionResolver.execute(
                  action,
                  {
                    actionId: payload.actionId,
                    activeStates: actionStates,
                  },
                  {
                    effectManager: runtime.effectManager,
                    resourceManager: runtime.resourceManager,
                    combatContext: runtime.combatContext,
                    attacksPerAction,
                    // the sheet tracks the economy rather than policing it:
                    // tables bend it constantly, and a refusal here would be
                    // something the player fights instead of uses
                    economyPolicy: "track",
                    activeStates: runtime.effectManager.getActiveStates(),
                    diceRules: diceRules as any,
                  },
                )
              : { executed: false, reason: "action_not_found" as const };

          const executionRollResults =
            "rollResults" in execution ? execution.rollResults : [];

          const resolvedPayload: ActionResolvedPayload = {
            characterId: payload.characterId,
            requestId: payload.requestId,
            actionId: payload.actionId,
            source: payload.source,
            ...(actorInstanceId !== undefined && { actorInstanceId }),
            executed: execution.executed,
            ...(execution.reason !== undefined && { reason: execution.reason }),
            ...("economyOverdrawn" in execution &&
              execution.economyOverdrawn === true && {
                economyOverdrawn: true,
              }),
            rollResults: executionRollResults.map((result) => ({
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
            activeStates: runtime.effectManager.getActiveStates(),
            resources: runtime.resourceManager
              .getRuntimeResources()
              .map((resource) => ({
                id: resource.id,
                current: resource.currentCharges,
                currentCharges: resource.currentCharges,
              })),
            effects: toRuntimeEffectsPayload(runtime.effectManager),
            actors: runtime.effectManager.getActiveActors(),
            combatContext: runtime.combatContext.getContext(),
            timestamp: Date.now(),
          };

          runtime.responseByRequestId.set(payload.requestId, resolvedPayload);

          if (
            runtime.responseByRequestId.size > AUTHORITY_REQUEST_CACHE_LIMIT
          ) {
            const oldestKey = runtime.responseByRequestId.keys().next().value;
            if (oldestKey) {
              runtime.responseByRequestId.delete(oldestKey);
            }
          }

          io.to(`campaign_${campaignId}`).emit(SOCKET_EVENTS.ACTION_RESOLVED, {
            actorId: socket.id,
            data: resolvedPayload,
          });
        } catch (error) {
          console.error(
            "Failed to process authoritative action intent:",
            error,
          );
          socket.emit("error:rollback", {
            event: SOCKET_EVENTS.ACTION_INTENT,
            payload,
          });
        }
      },
    );

    // #endregion

    // #region TURN LIFECYCLE
    //
    // Thin adapters. Everything that decides what a turn transition means lives
    // in resolvePlayerTurn and TurnLifecycle, both of which are unit tested
    // without a socket.

    const handleTurnIntent = async (
      payload: TurnIntentPayload,
      transition: "started" | "ended",
      event: string,
    ) => {
      try {
        pruneAuthoritativeRuntime();

        const campaignId = await ensureCharacterInSocketCampaign(
          socket,
          payload.characterId,
        );

        const runtime = await getAuthoritativeRuntimeContext(
          payload.characterId,
        );
        runtime.lastTouchedAt = Date.now();

        const resolved = resolvePlayerTurn(runtime, transition, {
          characterId: payload.characterId,
          requestId: payload.requestId,
        });

        io.to(`campaign_${campaignId}`).emit(SOCKET_EVENTS.TURN_RESOLVED, {
          actorId: socket.id,
          data: resolved,
        });
      } catch (error) {
        console.error(`Failed to process turn ${transition}:`, error);
        socket.emit("error:rollback", { event, payload });
      }
    };

    socket.on(SOCKET_EVENTS.TURN_STARTED, (payload: TurnIntentPayload) =>
      handleTurnIntent(payload, "started", SOCKET_EVENTS.TURN_STARTED),
    );

    socket.on(SOCKET_EVENTS.TURN_ENDED, (payload: TurnIntentPayload) =>
      handleTurnIntent(payload, "ended", SOCKET_EVENTS.TURN_ENDED),
    );

    /**
     * Records whether the character was surprised as combat began.
     *
     * The server can never derive this - the DM settles surprise by comparing
     * Stealth against passive Perception across the whole table - but it has to
     * own it, or two clients on the same character disagree. It expires on the
     * same runtime the turn handler mutates, so TurnLifecycle retires it with
     * no help from here.
     */
    socket.on(
      SOCKET_EVENTS.SURPRISE_DECLARED,
      async (payload: SurpriseDeclaredPayload) => {
        try {
          pruneAuthoritativeRuntime();

          const campaignId = await ensureCharacterInSocketCampaign(
            socket,
            payload.characterId,
          );

          const runtime = await getAuthoritativeRuntimeContext(
            payload.characterId,
          );
          runtime.lastTouchedAt = Date.now();

          const resolved: SurpriseResolvedPayload = {
            characterId: payload.characterId,
            combatContext: runtime.combatContext.setSurprised(
              payload.surprised,
            ),
            timestamp: Date.now(),
          };

          io.to(`campaign_${campaignId}`).emit(
            SOCKET_EVENTS.SURPRISE_RESOLVED,
            { actorId: socket.id, data: resolved },
          );
        } catch (error) {
          console.error("Failed to record surprise:", error);
          socket.emit("error:rollback", {
            event: SOCKET_EVENTS.SURPRISE_DECLARED,
            payload,
          });
        }
      },
    );

    // #endregion

    // #region ITEM EQUIPPED

    socket.on(
      SOCKET_EVENTS.ITEM_EQUIPPED,
      async (payload: ItemEquippedPayload) => {
        try {
          const campaignId = await ensureCharacterInSocketCampaign(
            socket,
            payload.characterId,
          );

          const targetSlot = resolveTargetSlot(payload.targetSlot);

          if (!targetSlot) {
            throw new Error("Invalid equipment slot target.");
          }

          await db.transaction(async (tx) => {
            const [inventoryItem] = await tx
              .select({
                itemId: characterInventory.itemId,
                itemRule: items.itemRule,
                weaponRule: items.weaponRule,
              })
              .from(characterInventory)
              .innerJoin(items, eq(characterInventory.itemId, items.id))
              .where(
                and(
                  eq(characterInventory.id, payload.inventoryId),
                  eq(characterInventory.characterId, payload.characterId),
                ),
              )
              .limit(1);

            if (!inventoryItem) {
              throw new Error("Inventory item not found for character.");
            }

            // Legality comes from the item's authored equipSlot, the same rule
            // the client applies. An item with no rule attached has no slot to
            // read, so it cannot be worn rather than being guessed at from its
            // id - but the backpack is the null slot, so stowing one still
            // works. Refusing that would strand an item in a slot forever.
            if (!canEquipTo(inventoryItem.itemRule ?? {}, targetSlot)) {
              throw new Error(
                `Invalid slot '${targetSlot}' for item '${inventoryItem.itemId}'.`,
              );
            }

            // 1 - resolve contention
            // if equipping to an active body slot (not just unequip from backpack)
            // automatically sweep any existing item in those slots back to the
            // backpack. A two-handed weapon covers the off hand as well, so the
            // sweep clears every slot the item will actually occupy.
            const occupiedSlots = slotsConsumedBy(
              { weapon: inventoryItem.weaponRule ?? undefined },
              targetSlot,
            );

            if (occupiedSlots.length > 0) {
              await tx
                .update(characterInventory)
                .set({ slot: "backpack" })
                .where(
                  and(
                    eq(characterInventory.characterId, payload.characterId), // security boundary
                    inArray(characterInventory.slot, occupiedSlots),
                    not(eq(characterInventory.id, payload.inventoryId)), // don't unequip item trying to be equipped
                  ),
                );
            }

            // 2 - commit new state
            // move target item into newly cleared slot
            await tx
              .update(characterInventory)
              .set({ slot: targetSlot })
              .where(
                and(
                  eq(characterInventory.id, payload.inventoryId),
                  eq(characterInventory.characterId, payload.characterId), // security boundary
                ),
              );
          });

          // 3 - broadcast to campaign room
          // sender already updated zustand store optimistically, so exclude them
          socket
            .to(`campaign_${campaignId}`)
            .emit(SOCKET_EVENTS.ITEM_EQUIPPED, {
              actorId: socket.id,
              data: payload,
            });
        } catch (error) {
          console.error("Failed to process equipment transaction:", error);
          // instruct sender's ui to rollback
          socket.emit("action_error", {
            event: SOCKET_EVENTS.ITEM_EQUIPPED,
            error: "Slot contention failure. Rolling back state.",
            payload,
          });
        }
      },
    );

    // #endregion

    // #region ITEM CONSUMED

    socket.on(
      SOCKET_EVENTS.ITEM_CONSUMED,
      async (payload: ItemConsumedPayload) => {
        try {
          const campaignId = await ensureCharacterInSocketCampaign(
            socket,
            payload.characterId,
          );

          await db.transaction(async (tx) => {
            // 1 - fetch the current item state securely
            const [item] = await tx
              .select({ quantity: characterInventory.quantity })
              .from(characterInventory)
              .where(
                and(
                  eq(characterInventory.id, payload.inventoryId),
                  eq(characterInventory.characterId, payload.characterId),
                ),
              );

            if (!item) throw new Error("Item not found or authorized");

            const remaining = item.quantity - payload.amount;

            // 2 - route the operation based on remaining quantity
            if (remaining <= 0) {
              // sweep empty container from the database
              await tx
                .delete(characterInventory)
                .where(eq(characterInventory.id, payload.inventoryId));
            } else {
              // decrement the value automatically
              await tx
                .update(characterInventory)
                .set({
                  quantity: sql`${characterInventory.quantity} - ${payload.amount}`,
                })
                .where(eq(characterInventory.id, payload.inventoryId));
            }
          });

          // 3 - broadcast delta to campaign room
          socket
            .to(`campaign_${campaignId}`)
            .emit(SOCKET_EVENTS.ITEM_CONSUMED, {
              actorId: socket.id,
              data: payload,
            });
        } catch (error) {
          console.error("Failed to process item consumption:", error);
          socket.emit("action_error", {
            event: SOCKET_EVENTS.ITEM_CONSUMED,
            error: "Inventory sync failure. Rolling back state.",
            payload,
          });
        }
      },
    );

    // #endregion

    // region RESOURCE CONSUMED

    socket.on(
      SOCKET_EVENTS.RESOURCE_CONSUMED,
      async (payload: ResourceConsumedPayload) => {
        try {
          const campaignId = await ensureCharacterInSocketCampaign(
            socket,
            payload.characterId,
          );

          await db.transaction(async (tx) => {
            // decrement resource automatically, prevent neg values
            await tx
              .update(characterResources)
              .set({
                current: sql`GREATEST(${characterResources.current} - ${payload.amount}, 0)`,
              })
              .where(
                and(
                  eq(characterResources.id, payload.resourceId),
                  eq(characterResources.characterId, payload.characterId),
                ),
              );
          });

          // broadcast to room
          socket
            .to(`campaign_${campaignId}`)
            .emit(SOCKET_EVENTS.RESOURCE_CONSUMED, {
              actorId: socket.id,
              data: payload,
            });
        } catch (error) {
          console.error("Failed to process resource consumption:", error);
          socket.emit("action_error", {
            event: SOCKET_EVENTS.RESOURCE_CONSUMED,
            error: "Resource async failure. Rolling back state.",
            payload,
          });
        }
      },
    );

    // #endregion

    // #region REST COMPLETED
    socket.on(
      SOCKET_EVENTS.REST_COMPLETED,
      async (payload: { characterId: string; restType: "short" | "long" }) => {
        try {
          const campaignId = await ensureCharacterInSocketCampaign(
            socket,
            payload.characterId,
          );

          await db.transaction(async (tx) => {
            // 1 - fetch current resources
            const currentResources = await tx
              .select()
              .from(characterResources)
              .where(eq(characterResources.characterId, payload.characterId));

            // 2 - read the class ledger the resource maximums size themselves
            // against. Without it every class_level_thresholds resource
            // resolves its maximum to 0, and "restore to max" writes 0 -
            // draining Second Wind and Action Surge instead of refilling them.
            const classRows = await tx
              .select({
                classId: characterClasses.classId,
                classLevel: characterClasses.classLevel,
              })
              .from(characterClasses)
              .where(eq(characterClasses.characterId, payload.characterId));

            const classLevels = Object.fromEntries(
              classRows.map((row) => [row.classId, row.classLevel]),
            );
            const totalLevel = classRows.reduce(
              (sum, row) => sum + row.classLevel,
              0,
            );

            // 3 - calculate the swept state
            // the snapshot carries pack.resources; without it every resource
            // resolves to no rule and applyRest returns it untouched, so a
            // rest would silently restore nothing
            const { snapshot } = await getCachedRuleSnapshot();
            const updatedResources = RestEngine.applyRest(
              currentResources,
              payload.restType,
              totalLevel,
              classLevels,
              snapshot,
            );

            // 4 - batch update the changed resources
            for (const res of updatedResources) {
              const original = currentResources.find((r) => r.id === res.id);
              // only update if value changed to save db cycles
              if (original && original.current !== res.current) {
                await tx
                  .update(characterResources)
                  .set({ current: res.current })
                  .where(
                    and(
                      eq(characterResources.id, res.id),
                      eq(characterResources.characterId, payload.characterId),
                    ),
                  );
              }
            }

            // 4 - long rest hp reset
            if (payload.restType === "long") {
              // in drizzle, doing an update with self-referencing column requires sql''
              // or simply relying on the UI's maxHp calculation if stored directly
              await tx
                .update(characters)
                .set({ currentHp: characters.maxHp })
                .where(eq(characters.id, payload.characterId));
            }
          });

          // 5 - broadcast to room
          socket
            .to(`campaign_${campaignId}`)
            .emit(SOCKET_EVENTS.REST_COMPLETED, {
              actorId: socket.id,
              data: payload,
            });
        } catch (error) {
          console.error("Failed to process rest:", error);
          socket.emit("action_error", {
            event: SOCKET_EVENTS.REST_COMPLETED,
            error: "Rest async failure. Rolling back state.",
            payload,
          });
        }
      },
    );
    // #endregion

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}
