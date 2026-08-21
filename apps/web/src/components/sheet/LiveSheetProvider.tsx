import type React from "react";
import { useCharacterSheetStore } from "../../store/characterSheetStore";
import { useEffect } from "react";
import { socketService } from "../../services/socketService";
import { SHEET_ERROR_EVENTS } from "./sheetErrorEvents";

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
  const syncRemoteAttunement = useCharacterSheetStore(
    (state) => state.syncRemoteAttunement,
  );
  const setInventoryError = useCharacterSheetStore(
    (state) => state.setInventoryError,
  );
  const recordRollResult = useCharacterSheetStore(
    (state) => state.recordRollResult,
  );
  const syncRemoteActionExecution = useCharacterSheetStore(
    (state) => state.syncRemoteActionExecution,
  );
  const syncRemoteTurnResolution = useCharacterSheetStore(
    (state) => state.syncRemoteTurnResolution,
  );
  const syncRemoteSurprise = useCharacterSheetStore(
    (state) => state.syncRemoteSurprise,
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

    socketService.subscribeToAttunementUpdates((broadcast) => {
      syncRemoteAttunement(broadcast.inventoryId, broadcast.isAttuned);
    });

    socketService.subscribeToItemConsumed((broadcast) => {
      syncRemoteConsumption(broadcast.inventoryId, broadcast.amount);
    });

    socketService.subscribeToRollResults((broadcast) => {
      recordRollResult(broadcast);
    });

    socketService.subscribeToActionResolved((broadcast) => {
      syncRemoteActionExecution(broadcast);
    });

    socketService.subscribeToTurnResolved((broadcast) => {
      syncRemoteTurnResolution(broadcast);
    });

    socketService.subscribeToSurpriseResolved((broadcast) => {
      syncRemoteSurprise(broadcast);
    });

    socketService.subscribeToActionErrors((payload) => {
      // `event` is optional on the wire, and an error that names no event
      // cannot be matched against the list at all.
      if (payload.event && SHEET_ERROR_EVENTS.includes(payload.event)) {
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
    syncRemoteAttunement,
    setInventoryError,
    recordRollResult,
    syncRemoteActionExecution,
    syncRemoteTurnResolution,
    syncRemoteSurprise,
  ]);

  return <>{children}</>;
};
