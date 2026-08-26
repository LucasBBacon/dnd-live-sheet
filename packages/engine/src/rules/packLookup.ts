import { toRuleSnapshot, type CoreRulePack } from "@project/shared";
import type { CoreRulePackSnapshot, EquipmentDefinition } from "@project/shared";
import { toWeaponDefinition, type WeaponView } from "./equipmentProjection.js";

/**
 * Everything `ruleLookup` can resolve, built from one pack.
 *
 * Built on `CoreRulePackSnapshot` rather than on `RuleSnapshotLookup`, even
 * though the latter is what the engine consumes. `RuleSnapshotLookup` widens
 * every map to accept a partial snapshot from any source, and typing this as
 * that would throw away what the pack actually guarantees - which the web
 * store noticed immediately, because its own snapshot type is narrower than
 * the widened one. This is assignable to `RuleSnapshotLookup` where the engine
 * wants it, and precise everywhere else.
 *
 * `weaponsById` is a convenience view: the attack-facing fields of every
 * weapon-capable entry, derived from `equipmentById` rather than authored
 * separately, so the two cannot disagree.
 */
export type PackRuleLookup = CoreRulePackSnapshot & {
  equipmentById: Record<string, EquipmentDefinition>;
  weaponsById: Record<string, WeaponView>;
  resourcesById: Record<string, CoreRulePack["resources"][number]>;
};

/**
 * Projects a pack into what production hands the engine.
 *
 * This existed twice - once in the engine's test fixture and once in the web's
 * - as the same idea written out separately, which is the projection half of
 * the duplication #37 records. One implementation now, imported by both.
 *
 * `ruleSnapshotCache` on the server is deliberately not folded in and is not a
 * third copy of *this*: it builds equipment from the relational `items` table
 * through `projectEquipmentRows`, so it projects a different source that
 * happens to land on the same shape. Merging them would mean pretending the
 * two sources are one.
 *
 * @param pack An assembled, validated pack.
 * @returns Rulebook maps keyed by id, plus equipment, weapons and resources.
 */
export const packToRuleLookup = (pack: CoreRulePack): PackRuleLookup => {
  const equipmentById: Record<string, EquipmentDefinition> = {};
  const weaponsById: Record<string, WeaponView> = {};

  for (const entry of pack.equipment) {
    const equipment = entry as EquipmentDefinition;
    equipmentById[entry.id] = equipment;

    const weapon = toWeaponDefinition(equipment);
    if (weapon) weaponsById[entry.id] = weapon;
  }

  return {
    ...toRuleSnapshot(pack),
    equipmentById,
    weaponsById,
    resourcesById: Object.fromEntries(
      pack.resources.map((resource) => [resource.id, resource]),
    ),
  };
};
