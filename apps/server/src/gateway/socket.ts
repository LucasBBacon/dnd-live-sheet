import { db } from "@project/database";
import { characters } from "@project/database/src/schema/operational.js";
import { SOCKET_EVENTS, type HpModifiedPayload } from "@project/shared";
import { Server, Socket } from "socket.io";
import { eq, sql } from "drizzle-orm";

export function initializeWebSocketGateway(httpServer: any) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL, methods: ["GET", "POST"] },
  });

  io.on("connection", (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // 1 - room orchestration
    socket.on(SOCKET_EVENTS.ROOM_JOIN, (campaignId: string) => {
      socket.join(`campaign_${campaignId}`);
      console.log(`Socket ${socket.id} joined campaign_${campaignId}`);
    });

    // 2 - atomic event handlers
    socket.on(SOCKET_EVENTS.HP_MODIFIED, async (payload: HpModifiedPayload) => {
      try {
        // A - persist the delta immediately using an atomic SQL update
        // this prevents race conditions if 2 sources damage the character at the exact same millisecond
        await db
          .update(characters)
          .set({ currentHp: sql`${characters.currentHp} + ${payload.delta}` })
          .where(eq(characters.id, payload.characterId));

        // B - broadcast to everyone in the room EXCEPT sender
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
