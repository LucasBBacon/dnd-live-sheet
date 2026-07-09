import { db } from "@project/database";
import {
  characterInventory,
  characterResources,
  characters,
} from "@project/database/src/schema/operational.js";
import {
  type RoomJoinPayload,
  SOCKET_EVENTS,
  type HpModifiedPayload,
  type ItemConsumedPayload,
  type ItemEquippedPayload,
  type ResourceConsumedPayload,
} from "@project/shared";
import { Server, Socket } from "socket.io";
import { and, eq, not, sql } from "drizzle-orm";
import { RestEngine } from "@project/engine";
import {
  getCampaignMembershipRole,
  getUserIdFromSocket,
} from "../services/campaignAccess.js";

type SocketDataContext = {
  campaignId?: string;
  userId?: string;
};

const getSocketContext = (socket: Socket): SocketDataContext =>
  (socket.data as SocketDataContext);

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
        const campaignId =
          typeof payload === "string" ? payload : payload.campaignId;

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
        socket
          .to(`campaign_${campaignId}`)
          .emit(SOCKET_EVENTS.HP_MODIFIED, {
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
