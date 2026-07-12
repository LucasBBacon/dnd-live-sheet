import type { EquipmentDefinition, ItemDefinition, WeaponDefinition } from "@project/shared";
import { EQUIPMENT_DICTIONARY, ITEM_DICTIONARY, toItemDefinition, toWeaponDefinition } from "./equipmentDictionary.js";
import { RESOURCE_DICTIONARY } from "./resourceDictionary.js";
import type { ResourceRule } from "@project/shared";

type RuleSnapshotLookup = {
  equipmentById?: Record<string, EquipmentDefinition>;
  // compatibility fields - still accepted while consumers migrate to equipmentById
  itemsById?: Record<string, ItemDefinition>;
  weaponsById?: Record<string, WeaponDefinition>;
  resourcesById?: Record<string, ResourceRule>;
};

export type { RuleSnapshotLookup };

type EquipmentResolutionMode = "static-only" | "snapshot-first";

/**
 * Temporary testing mode.
 * - static-only: ignores snapshot equipment/item/weapon maps for lookups.
 * - snapshot-first: restores the previous snapshot-preferred behaviour.
 */
export const EQUIPMENT_RESOLUTION_MODE: EquipmentResolutionMode = "static-only";

const resolveFromMap = <T>(
  id: string,
  byId: Record<string, T> | undefined,
): T | undefined => {
  if (!byId) return undefined;

  return byId[id];
};

export const resolveEquipmentDefinition = (
  equipmentId: string,
  snapshot?: RuleSnapshotLookup,
): EquipmentDefinition | undefined => {
  if (EQUIPMENT_RESOLUTION_MODE === "static-only") {
    return resolveFromMap(equipmentId, EQUIPMENT_DICTIONARY);
  }

  return (
    resolveFromMap(equipmentId, snapshot?.equipmentById) ??
    resolveFromMap(equipmentId, EQUIPMENT_DICTIONARY)
  );
};

export const resolveItemDefinition = (
  itemId: string,
  snapshot?: RuleSnapshotLookup,
): ItemDefinition | undefined => {
  if (EQUIPMENT_RESOLUTION_MODE === "static-only") {
    const fromStaticEquipment = resolveFromMap(itemId, EQUIPMENT_DICTIONARY);
    return fromStaticEquipment ? toItemDefinition(fromStaticEquipment) : undefined;
  }

  // 1 - explicit item snapshot (compatibility)
  const fromItemSnapshot = resolveFromMap(itemId, snapshot?.itemsById);
  if (fromItemSnapshot) return fromItemSnapshot;

  // 2 - derive from canonical equipment snapshot
  const fromEquipment = resolveFromMap(itemId, snapshot?.equipmentById);
  if (fromEquipment) return toItemDefinition(fromEquipment);

  // 3 - fall back to static canonical dictionary
  const fromStaticEquipment = resolveFromMap(itemId, EQUIPMENT_DICTIONARY);
  return fromStaticEquipment ? toItemDefinition(fromStaticEquipment) : undefined;
};

export const resolveWeaponDefinition = (
  weaponId: string,
  snapshot?: RuleSnapshotLookup,
): WeaponDefinition | undefined => {
  if (EQUIPMENT_RESOLUTION_MODE === "static-only") {
    const fromStaticEquipment = resolveFromMap(weaponId, EQUIPMENT_DICTIONARY);
    return fromStaticEquipment ? toWeaponDefinition(fromStaticEquipment) : undefined;
  }

  // 1 - explicit weapon snapshot (compatibility)
  const fromWeaponSnapshot = resolveFromMap(weaponId, snapshot?.weaponsById);
  if (fromWeaponSnapshot) return fromWeaponSnapshot;

  // 2 - derive from canonical equipment snapshot
  const fromEquipment = resolveFromMap(weaponId, snapshot?.equipmentById);
  if (fromEquipment) return toWeaponDefinition(fromEquipment);

  // 3 - fall back to static canonical dictionary
  const fromStaticEquipment = resolveFromMap(weaponId, EQUIPMENT_DICTIONARY);
  return fromStaticEquipment ? toWeaponDefinition(fromStaticEquipment) : undefined;
};

export const resolveResourceRule = (
  resourceId: string,
  snapshot?: RuleSnapshotLookup,
): ResourceRule | undefined => {
  return snapshot?.resourcesById?.[resourceId] ?? RESOURCE_DICTIONARY[resourceId];
};

export const resolveResourceRules = (
  snapshot?: RuleSnapshotLookup,
): Record<string, ResourceRule> => {
  return snapshot?.resourcesById ?? RESOURCE_DICTIONARY;
};
