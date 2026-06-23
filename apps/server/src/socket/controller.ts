import { GameActionSchema } from "@project/shared";
import type { Server, Socket } from "socket.io";

export const initializeWebSockets = (io: Server) => {
  io.on("connection", (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // join a specific character's room
    socket.on("join_character", (characterId: string) => {
      socket.join(`char_${characterId}`);
      console.log(`[Socket] Client joined room: char_${characterId}`);
    });

    // listen for game mechanics actions
    socket.on("dispatch_action", async (rawPayload: unknown) => {
      // immediate gatekeeper validation
      const validation = GameActionSchema.safeParse(rawPayload);

      if (!validation.success) {
        return socket.emit("action_error", {
          message: "Malformed action payload.",
        });
      }

      const action = validation.data;

      try {
        // process specific action type
        if (action.type === "MODIFY_HP") {
          // TODO: run core math reducer here (e.g., check temp hp overflow)
          // TODO: execute db transaction to update characters.engineData

          console.log(`Processing HP modification for ${action.characterId}`);
        }

        // broadcast the validated result back to the room
        // tells the frontend to invalidate its cache and pull fresh sheet
        io.to(`char_${action.characterId}`).emit("state_updated", action.type);
      } catch (error) {
        console.error(`[Socket] Action processing failed`, error);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });
};
