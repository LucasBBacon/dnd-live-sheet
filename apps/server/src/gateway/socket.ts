import { db } from "@project/database";
import {
  characterInventory,
  characters,
} from "@project/database/src/schema/operational.js";
import {
  SOCKET_EVENTS,
  type HpModifiedPayload,
  type ItemEquippedPayload,
} from "@project/shared";
import { Server, Socket } from "socket.io";
import { and, eq, not, sql } from "drizzle-orm";

export function initializeWebSocketGateway(httpServer: any) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL, methods: ["GET", "POST"] },
  });

  io.on("connection", (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // ROOM ORCHESTRATION
    
    socket.on(SOCKET_EVENTS.ROOM_JOIN, (campaignId: string) => {
      socket.join(`campaign_${campaignId}`);
      console.log(`Socket ${socket.id} joined campaign_${campaignId}`);
    });

    // ATOMIC EVENT HANDLERS

    socket.on(SOCKET_EVENTS.HP_MODIFIED, async (payload: HpModifiedPayload) => {
      try {
        // 1 - persist the delta immediately using an atomic SQL update
        // this prevents race conditions if 2 sources damage the character at the exact same millisecond
        await db
          .update(characters)
          .set({ currentHp: sql`${characters.currentHp} + ${payload.delta}` })
          .where(eq(characters.id, payload.characterId));

        // 2 - broadcast to everyone in the room EXCEPT sender
        // sender already updated UI optimistically
        socket
          .to(`campaign_${getCampaignId(socket)}`)
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

    socket.on(
      SOCKET_EVENTS.ITEM_EQUIPPED,
      async (payload: ItemEquippedPayload) => {
        try {
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
            .to(`campaign_${getCampaignId(socket)}`)
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

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}

function getCampaignId(socket: Socket): string {
  const rooms = Array.from(socket.rooms);
  const campaignRoom = rooms.find((r) => r.startsWith("campaign_"));
  return campaignRoom ? campaignRoom.replace("campaign_", "") : "";
}
