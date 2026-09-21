import type {
  BackgroundDefinition,
  ClassDefinition,
  CoreRulePackSnapshot,
  EquipmentDefinition,
  Resource,
  TraitDefinition,
} from "@project/shared";
import { toWeaponDefinition, type WeaponView } from "./equipmentProjection.js";
import type { RaceDefinition } from "./raceTypes.js";

/**
 * What a caller hands the resolvers.
 *
 * Every field spells out `| undefined` because the workspace runs
 * exactOptionalPropertyTypes: a caller assembling this from a partial - the
 * server's snapshot payload, the web store's nullable one - holds properties
 * that are present and undefined, not absent.
 */
type RuleSnapshotLookup = {
  equipmentById?: Record<string, EquipmentDefinition> | undefined;
  resourcesById?: Record<string, Resource> | undefined;
  /**
   * Rulebook content loaded from a core rule pack.
   *
   * The only source. The static dictionaries that once backed these are gone.
   */
  traitsById?: Record<string, TraitDefinition> | undefined;
  racesById?: Record<string, RaceDefinition> | undefined;
  classesById?: Record<string, ClassDefinition> | undefined;
  subclassesById?:
    | Record<string, CoreRulePackSnapshot["subclassesById"][string]>
    | undefined;
  backgroundsById?: Record<string, BackgroundDefinition> | undefined;
  featsById?: Record<string, FeatDefinition> | undefined;
};

/** A feat, keyed the way the pack authors it. */
type FeatDefinition = CoreRulePackSnapshot["featsById"][string];

export type { RuleSnapshotLookup };

const resolveFromMap = <T>(
  id: string,
  byId: Record<string, T> | undefined,
): T | undefined => {
  if (!byId) return undefined;

  return byId[id];
};

/**
 * A piece of equipment, from the pack.
 *
 * The static dictionaries are gone: rules content comes from packs and nothing
 * else. Equipment the pack does not define does not exist, and resolving to
 * undefined is the correct answer rather than a gap to paper over.
 * @param equipmentId The authored equipment id
 * @param snapshot Pack content, when the caller has any loaded
 * @returns The equipment definition, or undefined
 */
export const resolveEquipmentDefinition = (
  equipmentId: string,
  snapshot?: RuleSnapshotLookup,
): EquipmentDefinition | undefined =>
  resolveFromMap(equipmentId, snapshot?.equipmentById);

/**
 * The attack view of a piece of equipment.
 * @param weaponId The authored equipment id
 * @param snapshot Pack content, when the caller has any loaded
 * @returns The weapon view, or undefined if it is not a weapon
 */
export const resolveWeaponDefinition = (
  weaponId: string,
  snapshot?: RuleSnapshotLookup,
): WeaponView | undefined => {
  const fromEquipment = resolveFromMap(weaponId, snapshot?.equipmentById);
  return fromEquipment ? toWeaponDefinition(fromEquipment) : undefined;
};

export const resolveResourceRule = (
  resourceId: string,
  snapshot?: RuleSnapshotLookup,
): Resource | undefined => snapshot?.resourcesById?.[resourceId];

export const resolveResourceRules = (
  snapshot?: RuleSnapshotLookup,
): Record<string, Resource> => snapshot?.resourcesById ?? {};

/**
 * A trait, from the pack.
 *
 * The static dictionaries are gone: rules content comes from packs and nothing
 * else. A trait the pack does not define does not exist, and resolving to
 * undefined is the correct answer rather than a gap to paper over.
 * @param traitId The authored trait id
 * @param snapshot Pack content, when the caller has any loaded
 * @returns The trait definition, or undefined
 */
export const resolveTraitDefinition = (
  traitId: string,
  snapshot?: RuleSnapshotLookup,
): TraitDefinition | undefined => snapshot?.traitsById?.[traitId];

/**
 * A race, from the pack.
 * @param raceId The authored race id
 * @param snapshot Pack content, when the caller has any loaded
 * @returns The race definition, or undefined
 */
export const resolveRaceDefinition = (
  raceId: string,
  snapshot?: RuleSnapshotLookup,
): RaceDefinition | undefined => snapshot?.racesById?.[raceId];

export const resolveBackgroundDefinition = (
  backgroundId: string,
  snapshot?: RuleSnapshotLookup,
): BackgroundDefinition | undefined => snapshot?.backgroundsById?.[backgroundId];

/**
 * A feat, from the pack.
 * @param featId The authored feat id
 * @param snapshot Pack content, when the caller has any loaded
 * @returns The feat definition, or undefined
 */
export const resolveFeatDefinition = (
  featId: string,
  snapshot?: RuleSnapshotLookup,
): FeatDefinition | undefined => snapshot?.featsById?.[featId];

/**
 * A class blueprint, from the pack.
 * @param classId The authored class id
 * @param snapshot Pack content, when the caller has any loaded
 * @returns The class definition, or undefined
 */
export const resolveClassDefinition = (
  classId: string,
  snapshot?: RuleSnapshotLookup,
): ClassDefinition | undefined => snapshot?.classesById?.[classId];

/**
 * A subclass, from the pack.
 *
 * Resolved by id rather than by walking into its parent class, because a save
 * stores classId and subclassId independently.
 * @param subclassId The authored subclass id
 * @param snapshot Pack content, when the caller has any loaded
 * @returns The subclass definition, or undefined
 */
export const resolveSubclassDefinition = (
  subclassId: string,
  snapshot?: RuleSnapshotLookup,
): CoreRulePackSnapshot["subclassesById"][string] | undefined =>
  snapshot?.subclassesById?.[subclassId];
