import type React from "react";
import { useCharacterSheetStore } from "../../store/characterSheetStore";
import { useEffect } from "react";
import { socketService } from "../../services/socketService";

export const LiveSheetProvider = ({
  campaignId,
  children,
}: {
  campaignId: string;
  children: React.ReactNode;
}) => {
  const syncRemoteHealthDelta = useCharacterSheetStore(
    (state) => state.syncRemoteHealthDelta,
  );
  const syncRemoteEquipment = useCharacterSheetStore(
    (state) => state.syncRemoteEquipment,
  );

  useEffect(() => {
    // 1 - establish connection and join room
    socketService.connect(campaignId);

    // 2. Bind remote events to zustand state mutations
    socketService.subscribeToHpUpdates((broadcast) => {
      // broadcast.data contains the payload
      syncRemoteHealthDelta(broadcast.delta);
    });

    socketService.subscribeToInventoryUpdates((broadcast) => {
      syncRemoteEquipment(broadcast.inventoryId, broadcast.targetSlot);
    });

    // cleanup on dismount
    return () => {
      socketService.disconnect();
    };
  }, [campaignId, syncRemoteHealthDelta, syncRemoteEquipment]);

  return <>{children}</>;
};
