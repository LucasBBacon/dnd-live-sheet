import type { ItemDefinition, WeaponDefinition } from "@project/shared";
import { ITEM_DICTIONARY } from "./itemDictionary.js";
import { RESOURCE_DICTIONARY } from "./resourceDictionary.js";
import { WEAPON_DICTIONARY } from "./weaponDictionary.js";
import type { ResourceRule } from "@project/shared";

type RuleSnapshotLookup = {
  itemsById?: Record<string, ItemDefinition>;
  weaponsById?: Record<string, WeaponDefinition>;
  resourcesById?: Record<string, ResourceRule>;
};

const resolveFromMap = <T>(
  id: string,
  byId: Record<string, T> | undefined,
): T | undefined => {
  if (!byId) return undefined;

  return byId[id];
};

export const resolveItemDefinition = (
  itemId: string,
  snapshot?: RuleSnapshotLookup,
): ItemDefinition | undefined => {
  return (
    resolveFromMap(itemId, snapshot?.itemsById) ??
    resolveFromMap(itemId, ITEM_DICTIONARY)
  );
};

export const resolveWeaponDefinition = (
  weaponId: string,
  snapshot?: RuleSnapshotLookup,
): WeaponDefinition | undefined => {
  return (
    resolveFromMap(weaponId, snapshot?.weaponsById) ??
    resolveFromMap(weaponId, WEAPON_DICTIONARY)
  );
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
