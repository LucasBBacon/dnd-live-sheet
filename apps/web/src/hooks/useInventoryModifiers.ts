import { useMemo } from "react";
import { InventoryExtractor, type InventoryExtraction } from "@project/engine";
import { useCharacterSheetStore } from "../store/characterSheetStore";

/**
 * Subscribes the extractor to the inventory.
 *
 * useCharacterStats only needs the modifiers; this exposes the full extraction
 * so the inventory screen can also explain *why* a worn item contributes
 * nothing — unattuned, or past the three-item attunement cap.
 */
export const useInventoryModifiers = (): InventoryExtraction => {
  const inventory = useCharacterSheetStore((state) => state.inventory);
  const ruleSnapshot = useCharacterSheetStore((state) => state.ruleSnapshot);

  return useMemo(
    () => InventoryExtractor.extract(inventory, ruleSnapshot ?? undefined),
    [inventory, ruleSnapshot],
  );
};
