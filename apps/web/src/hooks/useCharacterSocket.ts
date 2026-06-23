import type { GameAction } from "@project/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

const WS_URL = "http://localhost:3000";

export const useCharacterSocket = (characterId: string | undefined) => {
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!characterId) return;

    // connect to server
    socketRef.current = io(WS_URL);
    const socket = socketRef.current;

    // join the specific character room
    socket.emit("join_character", characterId);

    // listen to confirmed updates from server
    socket.on("state_updated", (actionType: string) => {
      console.log(
        `State updated via action: ${actionType}. Refetching sheet...`,
      );
      // immediately syncs the UI with newly calculated db state
      queryClient.invalidateQueries({ queryKey: ["character"] });
    });

    return () => {
      socket.disconnect();
    };
  }, [characterId, queryClient]);

  // expose a clean dispatch func for ui components to use
  const dispatch = (action: GameAction) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("dispatch_action", action);
    } else {
      console.error("Socket disconnected, cannot dispatch action.");
    }
  };

  return { dispatch };
};
