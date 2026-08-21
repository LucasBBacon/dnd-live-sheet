import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CoreRulePackSchema,
  toRuleSnapshot,
  type EquipmentDefinition,
  type ItemDefinition,
  type WeaponDefinition,
} from "@project/shared";
import { toItemDefinition, toWeaponDefinition } from "@project/engine";

/**
 * The shipped pack, for suites that drive the store's rule lookups.
 *
 * The web app has no dependency on the database package and should not gain
 * one - a pack reaches the client over /rules/snapshot, not by being imported.
 * Tests are the exception: they need the real authored content, because a
 * hand-written stub would drift out of agreement with what ships.
 *
 * The relative read is deliberate, and confined to this file.
 */
const PACK_ROOT = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

const readSegment = (relativePath: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(PACK_ROOT, relativePath), "utf8"));

const SECTIONS = [
  "traits",
  "races",
  "classes",
  "subclasses",
  "resources",
  "equipment",
  "feats",
  "backgrounds",
  "spells",
];

let cached: ReturnType<typeof build> | undefined;

const build = () => {
  const { segments, ...packMeta } = readSegment("manifest.json") as {
    segments: string[];
  };

  const merged = segments.reduce<Record<string, unknown[]>>(
    (accumulator, segmentPath) => {
      const segment = readSegment(segmentPath);
      for (const key of SECTIONS) {
        const entries = segment[key];
        if (Array.isArray(entries)) {
          accumulator[key] = [...(accumulator[key] ?? []), ...entries];
        }
      }
      return accumulator;
    },
    {},
  );

  const pack = CoreRulePackSchema.parse({ pack: packMeta, ...merged });

  const equipmentById: Record<string, EquipmentDefinition> = {};
  const itemsById: Record<string, ItemDefinition> = {};
  const weaponsById: Record<string, WeaponDefinition> = {};

  for (const entry of pack.equipment) {
    const equipment = entry as EquipmentDefinition;
    equipmentById[entry.id] = equipment;
    itemsById[entry.id] = toItemDefinition(equipment);
    const weapon = toWeaponDefinition(equipment);
    if (weapon) weaponsById[entry.id] = weapon;
  }

  return {
    equipmentById,
    itemsById,
    weaponsById,
    resourcesById: Object.fromEntries(
      pack.resources.map((resource) => [resource.id, resource]),
    ),
    ...toRuleSnapshot(pack),
  };
};

/**
 * What the server serves on /rules/snapshot, built from the shipped pack.
 * @returns The rule snapshot the store hands to the engine
 */
export const packRuleSnapshot = () => {
  cached ??= build();
  return cached;
};
