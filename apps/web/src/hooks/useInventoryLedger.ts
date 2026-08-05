import { useMemo } from "react";
import type { InventoryLedger } from "@project/engine";
import { useCharacterSheetStore } from "../store/characterSheetStore";

/**
 * Adapts the character sheet store to the engine's InventoryLedger port.
 *
 * Deliberately goes through the store's own actions rather than writing state:
 * consumeItem carries the optimistic update *and* the socket broadcast, so a
 * spent arrow reaches the rest of the table. Reads go through getState() so a
 * roll always settles against the inventory as it stands at the moment the
 * player confirms, not whatever was captured when the modal opened.
 */
export const useInventoryLedger = (): InventoryLedger =>
  useMemo(
    () => ({
      getStack: (instanceId) =>
        useCharacterSheetStore
          .getState()
          .inventory.find((row) => row.id === instanceId),

      consumeStack: (instanceId, amount) => {
        useCharacterSheetStore.getState().consumeItem(instanceId, amount);
      },
    }),
    [],
  );
