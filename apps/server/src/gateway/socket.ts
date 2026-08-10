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
} from "@project/shared";
import { Server, Socket } from "socket.io";
import { and, eq, not, sql } from "drizzle-orm";
import {
  CharacterEngine,
  ActionResolver,
  CharacterBootstrapper,
  EffectManager,
  ResourceManager,
  RestEngine,
} from "@project/engine";
import {
  getCampaignMembershipRole,
  getUserIdFromSocket,
} from "../services/campaignAccess.js";

const EQUIPMENT_SLOT_SET = new Set(EQUIPMENT_SLOTS);

const inferItemTypeFromId = (
  itemId: string,
): "armor" | "weapon" | "consumable" | "gear" => {
  if (itemId.startsWith("item_weapon_")) return "weapon";
  if (itemId.startsWith("item_armor_")) return "armor";
  return "gear";
};

const isValidTargetSlotForItem = (
  itemId: string,
  itemType: "armor" | "weapon" | "consumable" | "gear",
  targetSlot: string,
): boolean => {
  if (targetSlot === "backpack") return true;

  if (itemType === "weapon") {
    return targetSlot === "main_hand" || targetSlot === "off_hand";
  }

  if (itemType === "armor") {
    if (itemId === "item_armor_shield") {
      return targetSlot === "off_hand";
    }
    return targetSlot === "armor";
  }

  return false;
};

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
    subraceId: string;
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
    hasSubraces: true,
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
): Promise<{ action: ActionGrant | null; diceRules: Array<any> }> => {
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

  return { action, diceRules };
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

    // #region ITEM EQUIPPED

    socket.on(
      SOCKET_EVENTS.ITEM_EQUIPPED,
      async (payload: ItemEquippedPayload) => {
        try {
          const campaignId = await ensureCharacterInSocketCampaign(
            socket,
            payload.characterId,
          );

          await db.transaction(async (tx) => {
            if (!EQUIPMENT_SLOT_SET.has(payload.targetSlot as any)) {
              throw new Error("Invalid equipment slot target.");
            }

            const [inventoryItem] = await tx
              .select({
                itemId: characterInventory.itemId,
                itemRule: items.itemRule,
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

            const itemType =
              (inventoryItem.itemRule as { type?: string } | null)?.type ??
              inferItemTypeFromId(inventoryItem.itemId);

            if (
              !isValidTargetSlotForItem(
                inventoryItem.itemId,
                itemType as "armor" | "weapon" | "consumable" | "gear",
                payload.targetSlot,
              )
            ) {
              throw new Error(
                `Invalid slot '${payload.targetSlot}' for item '${inventoryItem.itemId}'.`,
              );
            }

            // 1 - resolve contention
            // if equipping to an active body slot (not just unequip from backpack)
            // automatically sweep any existing item in that slot back to the backpack
            if (payload.targetSlot !== "backpack") {
              await tx
                .update(characterInventory)
                .set({ slot: "backpack" })
                .where(
                  and(
                    eq(characterInventory.characterId, payload.characterId), // security boundary
                    eq(characterInventory.slot, payload.targetSlot),
                    not(eq(characterInventory.id, payload.inventoryId)), // don't unequip item trying to be equipped
                  ),
                );
            }

            // 2 - commit new state
            // move target item into newly cleared slot
            await tx
              .update(characterInventory)
              .set({ slot: payload.targetSlot })
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

            // 2 - calculate the swept state
            const updatedResources = RestEngine.applyRest(
              currentResources,
              payload.restType,
              1,
              {},
            );

            // 3 - batch update the changed resources
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
