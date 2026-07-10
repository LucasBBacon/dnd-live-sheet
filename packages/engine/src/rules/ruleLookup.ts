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

const LEGACY_ITEM_ALIASES: Record<string, string> = {
  item_shield: "item_armor_shield",
  item_chain_mail: "item_armor_chain_mail",
  item_arrow: "item_ammo_arrow",
};

const LEGACY_WEAPON_ALIASES: Record<string, string> = {
  item_longsword: "item_weapon_longsword",
  item_longbow: "item_weapon_longbow",
  item_dagger: "item_weapon_dagger",
};

const resolveWithAlias = <T>(
  id: string,
  byId: Record<string, T> | undefined,
  aliases: Record<string, string>,
): T | undefined => {
  if (!byId) return undefined;

  const direct = byId[id];
  if (direct) return direct;

  const canonicalId = aliases[id];
  if (!canonicalId) return undefined;

  return byId[canonicalId];
};

export const resolveItemDefinition = (
  itemId: string,
  snapshot?: RuleSnapshotLookup,
): ItemDefinition | undefined => {
  return (
    resolveWithAlias(itemId, snapshot?.itemsById, LEGACY_ITEM_ALIASES) ??
    resolveWithAlias(itemId, ITEM_DICTIONARY, LEGACY_ITEM_ALIASES)
  );
};

export const resolveWeaponDefinition = (
  weaponId: string,
  snapshot?: RuleSnapshotLookup,
): WeaponDefinition | undefined => {
  return (
    resolveWithAlias(weaponId, snapshot?.weaponsById, LEGACY_WEAPON_ALIASES) ??
    resolveWithAlias(weaponId, WEAPON_DICTIONARY, LEGACY_WEAPON_ALIASES)
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
