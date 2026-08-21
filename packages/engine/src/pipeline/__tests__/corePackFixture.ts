import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CoreRulePackSchema,
  toRuleSnapshot,
  type CoreRulePack,
  type CoreRulePackSnapshot,
  type EquipmentDefinition,
  type ItemDefinition,
  type WeaponDefinition,
} from "@project/shared";
import {
  toItemDefinition,
  toWeaponDefinition,
} from "../../rules/equipmentProjection.js";
import type { RuleSnapshotLookup } from "../../rules/ruleLookup.js";

/**
 * The shipped core rule pack, loaded once for the engine's suites.
 *
 * The engine has no runtime dependency on the database package and should not
 * gain one - a pack reaches production by being handed in, not by being
 * imported. Tests are the exception: they need the real authored content,
 * because these suites are the only place the engine and the rulebook meet,
 * and a hand-written stub would drift out of agreement with what ships.
 *
 * Hence the relative read rather than a package import. It is deliberate, and
 * confined to this file.
 */
const PACK_ROOT = path.join(
  process.cwd(),
  "../database/data/packs/core_2014_pack",
);

const readSegment = (relativePath: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(PACK_ROOT, relativePath), "utf8"));

let cachedPack: CoreRulePack | undefined;
let cached: CoreRulePackSnapshot | undefined;

/**
 * The whole shipped pack, merged and validated.
 *
 * Validated through CoreRulePackSchema rather than cast: a fixture that
 * accepted malformed content would let a broken pack pass the very suites
 * meant to catch it.
 * @returns Every section the manifest's segments carry
 */
export const corePack = (): CoreRulePack => {
  if (cachedPack) return cachedPack;

  // the manifest is the pack's identity block plus assembly metadata; only the
  // identity half may reach the pack, whose meta schema is strict
  const { segments, ...packMeta } = readSegment("manifest.json") as {
    segments: string[];
  };

  const merged = segments.reduce<Record<string, unknown[]>>(
    (accumulator, segmentPath) => {
      const segment = readSegment(segmentPath);

      for (const key of [
        "traits",
        "races",
        "classes",
        "subclasses",
        "resources",
        "equipment",
        "feats",
        "backgrounds",
        "spells",
      ]) {
        const entries = segment[key];
        if (Array.isArray(entries)) {
          accumulator[key] = [...(accumulator[key] ?? []), ...entries];
        }
      }

      return accumulator;
    },
    {},
  );

  cachedPack = CoreRulePackSchema.parse({ pack: packMeta, ...merged });
  return cachedPack;
};

/**
 * The pack keyed for the engine's resolvers.
 * @returns Traits, races, classes and subclasses from the shipped pack
 */
export const corePackSnapshot = (): CoreRulePackSnapshot => {
  cached ??= toRuleSnapshot(corePack());
  return cached;
};

/**
 * The pack's equipment, in the three shapes the engine resolves.
 *
 * CoreRulePackSnapshot deliberately carries only what resolves by id through
 * ruleLookup's rulebook path; equipment reaches the runtime as its own maps.
 * These stand in for the EQUIPMENT/ITEM/WEAPON dictionaries the suites used to
 * read, now that the pack is the only source.
 * @returns equipmentById, itemsById and weaponsById built from the pack
 */
export const corePackEquipment = (): {
  equipmentById: Record<string, EquipmentDefinition>;
  itemsById: Record<string, ItemDefinition>;
  weaponsById: Record<string, WeaponDefinition>;
} => {
  const equipment = corePack().equipment;

  const equipmentById = Object.fromEntries(
    equipment.map((entry) => [entry.id, entry as EquipmentDefinition]),
  );
  const itemsById = Object.fromEntries(
    equipment.map((entry) => [
      entry.id,
      toItemDefinition(entry as EquipmentDefinition),
    ]),
  );
  const weaponsById = Object.fromEntries(
    equipment.flatMap((entry) => {
      const weapon = toWeaponDefinition(entry as EquipmentDefinition);
      return weapon ? [[entry.id, weapon] as const] : [];
    }),
  );

  return { equipmentById, itemsById, weaponsById };
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
export const corePackLookup = (): RuleSnapshotLookup => ({
  ...corePackSnapshot(),
  ...corePackEquipment(),
  resourcesById: Object.fromEntries(
    corePack().resources.map((resource) => [resource.id, resource]),
  ),
});
