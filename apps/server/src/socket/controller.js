import { GameActionSchema } from "@project/shared";
import { modifyCharacterHp } from "../services/combatService.js";
export const initializeWebSockets = (io) => {
    io.on("connection", (socket) => {
        console.log(`[Socket] Client connected: ${socket.id}`);
        // join a specific character's room
        socket.on("join_character", (characterId) => {
            socket.join(`char_${characterId}`);
            console.log(`[Socket] Client joined room: char_${characterId}`);
        });
        // listen for game mechanics actions
        socket.on("dispatch_action", async (rawPayload) => {
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
                    const newHpState = await modifyCharacterHp(action.characterId, action.payload.amount);
                    console.log(`[Combat] Character ${action.characterId} HP updated to ${newHpState.current}`);
                }
                // broadcast the validated result back to the room
                // tells the frontend to invalidate its cache and pull fresh sheet
                io.to(`char_${action.characterId}`).emit("state_updated", action.type);
            }
            catch (error) {
                console.error(`[Socket] Action processing failed`, error);
                socket.emit("action_error", {
                    message: "Server failed to process action",
                });
            }
        });
        socket.on("disconnect", () => {
            console.log(`[Socket] Client disconnected: ${socket.id}`);
        });
    });
};
//# sourceMappingURL=controller.js.map