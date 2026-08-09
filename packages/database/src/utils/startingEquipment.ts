import type { StartingEquipmentDefinition } from "@project/shared";
import { StartingEquipmentDefinitionSchema } from "@project/shared";

export const normalizeStartingEquipment = (
  value: unknown,
): StartingEquipmentDefinition => {
  if (!value || typeof value !== "object") {
    return { given: [], choices: [] };
  }

  try {
    return StartingEquipmentDefinitionSchema.parse(value);
  } catch {
    return { given: [], choices: [] };
  }
};
