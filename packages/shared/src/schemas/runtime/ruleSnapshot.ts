import { z } from "zod";
import type { CoreRulePack } from "../content/coreRulePack.js";
import { EquipmentDefinitionSchema } from "../content/equipment.js";
import { ResourceSchema } from "../content/resources.js";
import type { Resource } from "../content/resources.js";
import { TraitDefinitionSchema } from "../content/traits.js";

// #region Resource Rules

/**
 * Equipment, keyed by id — the single authored item shape, both the item and
 * weapon view the engine used to resolve separately now live on one entry.
 * itemsById and weaponsById used to sit beside this as compatibility fields
 * for phased migration; retiring ItemDefinition and WeaponDefinition is what
 * that migration was waiting for.
 */
export const RuleSnapshotSchema = z
  .object({
    equipmentById: z.record(z.string(), EquipmentDefinitionSchema),
    resourcesById: z.record(z.string(), ResourceSchema),
    traitsById: z.record(z.string(), TraitDefinitionSchema),
  })
  .strict();

// #endregion

// #region Type Exports

export type RuleSnapshot = z.infer<typeof RuleSnapshotSchema>;

// #endregion

/**
 * The rulebook content a loaded pack contributes to the engine's lookups.
 *
 * Deliberately only the four the engine resolves by id. Everything else in a
 * pack - feats, backgrounds, spells, proficiencies - reaches the runtime by
 * other routes, and adding them here before anything reads them would be the
 * dead-data pattern this project keeps having to unpick.
 */
export interface CoreRulePackSnapshot {
  traitsById: Record<string, CoreRulePack["traits"][number]>;
  racesById: Record<string, CoreRulePack["races"][number]>;
  classesById: Record<string, CoreRulePack["classes"][number]>;
  /**
   * Keyed separately from their parent class because a save stores classId
   * and subclassId independently, so the bootstrapper resolves them as two
   * lookups rather than walking into the class.
   */
  subclassesById: Record<string, CoreRulePack["subclasses"][number]>;
  /**
   * Every resource a character can hold, keyed by id: the pack's own section
   * plus every pool a trait declares. Trait pools were missing from every
   * hand-built copy of this map, so Rage resolved to no rule at runtime and
   * never reset on a long rest.
   */
  resourcesById: Record<string, Resource>;
}

const byId = <T extends { id: string }>(entries: T[]): Record<string, T> =>
  Object.fromEntries(entries.map((entry) => [entry.id, entry]));

/**
 * Reshapes a validated pack into the maps the engine's resolvers read.
 *
 * Pure: no file access and no validation, because the pack arrived through
 * CoreRulePackSchema already. No reshaping either - packs already author
 * subraces keyed by id, exactly as the engine reads them.
 * @param pack A pack that has already passed schema and semantic validation
 * @returns Content keyed by id, ready to hand to a RuleSnapshotLookup
 */
export const toRuleSnapshot = (pack: CoreRulePack): CoreRulePackSnapshot => ({
  traitsById: byId(pack.traits),
  racesById: byId(pack.races),
  classesById: byId(pack.classes),
  subclassesById: byId(pack.subclasses),
  resourcesById: byId([
    ...pack.resources,
    ...pack.traits.flatMap((trait) => trait.resources),
  ]),
});
