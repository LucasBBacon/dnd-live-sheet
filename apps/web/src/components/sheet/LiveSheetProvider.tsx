import type React from "react";
import { useCharacterSheetStore } from "../../store/characterSheetStore";
import { useEffect } from "react";
import { socketService } from "../../services/socketService";

export const LiveSheetProvider = ({
  campaignId,
  userId,
  characterId,
  children,
}: {
  campaignId: string;
  userId: string;
  characterId: string;
  children: React.ReactNode;
}) => {
  const syncRemoteHealthDelta = useCharacterSheetStore(
    (state) => state.syncRemoteHealthDelta,
  );
  const syncRemoteEquipment = useCharacterSheetStore(
    (state) => state.syncRemoteEquipment,
  );
  const syncInventorySnapshot = useCharacterSheetStore(
    (state) => state.syncInventorySnapshot,
  );
  const syncRemoteConsumption = useCharacterSheetStore(
    (state) => state.syncRemoteConsumption,
  );
  const setInventoryError = useCharacterSheetStore(
    (state) => state.setInventoryError,
  );

  useEffect(() => {
    // 1 - establish connection and join room
    socketService.connect(campaignId, userId, characterId);

    // 2. Bind remote events to zustand state mutations
    socketService.subscribeToHpUpdates((broadcast) => {
      // broadcast.data contains the payload
      syncRemoteHealthDelta(broadcast.delta);
    });

    socketService.subscribeToInventoryUpdates((broadcast) => {
      syncRemoteEquipment(broadcast.inventoryId, broadcast.targetSlot);
    });

    socketService.subscribeToInventorySnapshot((payload) => {
      syncInventorySnapshot(payload.inventory);
    });

    socketService.subscribeToItemConsumed((broadcast) => {
      syncRemoteConsumption(broadcast.inventoryId, broadcast.amount);
    });

    socketService.subscribeToActionErrors((payload) => {
      if (
        payload.event === "character:item_equipped" ||
        payload.event === "character:item_consumed"
      ) {
        setInventoryError(payload.error);
      }
    });

    // cleanup on dismount
    return () => {
      socketService.disconnect();
    };
  }, [
    campaignId,
    userId,
    characterId,
    syncRemoteHealthDelta,
    syncRemoteEquipment,
    syncInventorySnapshot,
    syncRemoteConsumption,
    setInventoryError,
  ]);

  return <>{children}</>;
};
