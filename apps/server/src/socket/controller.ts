import {
  GameActionSchema,
  type RoomJoinPayload,
  SOCKET_EVENTS,
  type HpModifiedPayload,
} from "@project/shared";
import type { Server, Socket } from "socket.io";
import { modifyCharacterHp } from "../services/combatService.js";

export const initializeWebSockets = (io: Server) => {
  io.on("connection", (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    const joinRooms = (payload: string | RoomJoinPayload) => {
      const roomPayload =
        typeof payload === "string"
          ? { campaignId: payload, characterId: payload }
          : payload;
      const { campaignId, characterId } = roomPayload;

      if (characterId) {
        socket.join(`char_${characterId}`);
      }
      socket.join(`campaign_${campaignId}`);
      console.log(
        `[Socket] Client joined rooms: campaign_${campaignId}${characterId ? `, char_${characterId}` : ""}`,
      );
    };

    // join aliases during migration to a single event protocol
    socket.on("join_character", joinRooms);
    socket.on(SOCKET_EVENTS.ROOM_JOIN, joinRooms);

    const handleModifyHp = async (
      characterId: string,
      amount: number,
      onError: () => void,
    ) => {
      try {
        const newHpState = await modifyCharacterHp(characterId, amount);

        console.log(
          `[Combat] Character ${characterId} HP updated to ${newHpState.current}`,
        );
        io.to(`char_${characterId}`).emit("state_updated", "MODIFY_HP");
      } catch (error) {
        console.error(`[Socket] Action processing failed`, error);
        onError();
      }
    };

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

      // process specific action type
      if (action.type === "MODIFY_HP") {
        await handleModifyHp(action.characterId, action.payload.amount, () => {
          socket.emit("action_error", {
            message: "Server failed to process action",
          });
        });
      }
    });

    // shared event compatibility path
    socket.on(SOCKET_EVENTS.HP_MODIFIED, async (payload: HpModifiedPayload) => {
      await handleModifyHp(payload.characterId, payload.delta, () => {
        socket.emit("action_error", {
          event: SOCKET_EVENTS.HP_MODIFIED,
          message: "Server failed to process action",
          payload,
        });
      });
    });

    socket.on("disconnect", () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });
};
