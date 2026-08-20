import type {
  ClassDefinition,
  EquipmentDefinition,
  ItemDefinition,
  TraitDefinition,
  WeaponDefinition,
} from "@project/shared";
import { EQUIPMENT_DICTIONARY, toItemDefinition, toWeaponDefinition } from "./equipmentDictionary.js";
import { RESOURCE_DICTIONARY } from "./resourceDictionary.js";
import { RACE_DICTIONARY, type RaceDefinition } from "./raceDictionary.js";
import { TRAIT_DICTIONARY } from "./traitDictionary.js";
import { CLASS_DICTIONARY } from "./classDictionary.js";
import type { ResourceRule } from "@project/shared";

type RuleSnapshotLookup = {
  equipmentById?: Record<string, EquipmentDefinition>;
  // compatibility fields - still accepted while consumers migrate to equipmentById
  itemsById?: Record<string, ItemDefinition>;
  weaponsById?: Record<string, WeaponDefinition>;
  resourcesById?: Record<string, ResourceRule>;
  /**
   * Rulebook content loaded from a core rule pack.
   *
   * These three take precedence over the static dictionaries, and the
   * dictionaries remain as the fallback rather than as legacy: the pack is
   * filled in incrementally, so at any moment some content lives in one source
   * and some in the other.
   */
  traitsById?: Record<string, TraitDefinition>;
  racesById?: Record<string, RaceDefinition>;
  classesById?: Record<string, ClassDefinition>;
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

/**
 * A trait, from the pack if it carries one and the dictionary otherwise.
 *
 * Both sources are live. Race and class content has moved into packs, while
 * fighting styles, metamagic, maneuvers and the rest are still authored as
 * dictionaries, so neither can be dropped.
 * @param traitId The authored trait id
 * @param snapshot Pack content, when the caller has any loaded
 * @returns The trait definition, or undefined if neither source defines it
 */
export const resolveTraitDefinition = (
  traitId: string,
  snapshot?: RuleSnapshotLookup,
): TraitDefinition | undefined =>
  snapshot?.traitsById?.[traitId] ?? TRAIT_DICTIONARY[traitId];

/**
 * A race, from the pack if it carries one and the dictionary otherwise.
 * @param raceId The authored race id
 * @param snapshot Pack content, when the caller has any loaded
 * @returns The race definition, or undefined if neither source defines it
 */
export const resolveRaceDefinition = (
  raceId: string,
  snapshot?: RuleSnapshotLookup,
): RaceDefinition | undefined =>
  snapshot?.racesById?.[raceId] ?? RACE_DICTIONARY[raceId];

/**
 * A class blueprint, from the pack if it carries one and the dictionary
 * otherwise.
 * @param classId The authored class id
 * @param snapshot Pack content, when the caller has any loaded
 * @returns The class definition, or undefined if neither source defines it
 */
export const resolveClassDefinition = (
  classId: string,
  snapshot?: RuleSnapshotLookup,
): ClassDefinition | undefined =>
  snapshot?.classesById?.[classId] ?? CLASS_DICTIONARY[classId];
