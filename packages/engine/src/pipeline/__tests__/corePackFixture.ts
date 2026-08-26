import path from "node:path";
import { assembleCoreRulePackSync } from "@project/database/pack";
import type {
  CoreRulePack,
  CoreRulePackSnapshot,
  EquipmentDefinition,
} from "@project/shared";
import { toRuleSnapshot } from "@project/shared";
import { packToRuleLookup } from "../../rules/packLookup.js";
import type { WeaponView } from "../../rules/equipmentProjection.js";
import type { RuleSnapshotLookup } from "../../rules/ruleLookup.js";

/**
 * The shipped core rule pack, loaded once for the engine's suites.
 *
 * The engine has no *runtime* dependency on the database package and still
 * should not gain one - a pack reaches production by being handed in, not by
 * being imported. `@project/database` is a devDependency, and
 * `@project/database/pack` is a subpath that imports only node builtins and
 * `@project/shared`, so nothing here drags a driver in.
 *
 * This file used to reimplement the assembler rather than call it, and had
 * drifted from it in two ways at once: it omitted the `proficiencies` section,
 * and it validated with a bare `CoreRulePackSchema.parse`, skipping the
 * semantic validation the real loader runs. Adding one key to `manifest.json`
 * broke it, and the suite reported *fewer tests* rather than failures.
 */
const PACK_ROOT = path.join(
  process.cwd(),
  "../database/data/packs/core_2014_pack",
);

let cachedPack: CoreRulePack | undefined;
let cachedSnapshot: CoreRulePackSnapshot | undefined;
let cachedLookup: RuleSnapshotLookup | undefined;

/**
 * The whole shipped pack, merged and validated.
 * @returns Every section the manifest's segments carry
 */
export const corePack = (): CoreRulePack => {
  cachedPack ??= assembleCoreRulePackSync(PACK_ROOT);
  return cachedPack;
};

/**
 * The pack keyed for the engine's resolvers.
 * @returns Traits, races, classes and subclasses from the shipped pack
 */
export const corePackSnapshot = (): CoreRulePackSnapshot => {
  cachedSnapshot ??= toRuleSnapshot(corePack());
  return cachedSnapshot;
};

/**
 * The pack's equipment, keyed by id, plus the weapon view every
 * weapon-capable entry projects.
 * @returns equipmentById and weaponsById built from the pack
 */
export const corePackEquipment = (): {
  equipmentById: Record<string, EquipmentDefinition>;
  weaponsById: Record<string, WeaponView>;
} => {
  const { equipmentById, weaponsById } = packToRuleLookup(corePack());
  return { equipmentById, weaponsById };
};

/**
 * Everything ruleLookup can resolve, in one object.
 *
 * What production hands the engine: rulebook content keyed by id plus the
 * equipment and resource maps. Before the cutover the dictionaries backed all
 * of this implicitly, so a suite could omit the snapshot and still resolve a
 * longsword; now nothing resolves without it, which is the point.
 * @returns A RuleSnapshotLookup covering every section the pack carries
 */
export const corePackLookup = (): RuleSnapshotLookup => {
  cachedLookup ??= packToRuleLookup(corePack());
  return cachedLookup;
};
