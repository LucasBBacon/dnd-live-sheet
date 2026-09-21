import type {
  CharacterSave,
  FeatureGrant,
  SpellChoiceNode,
  TraitChoiceNode,
} from "@project/shared";
// Classes, races, subclasses and traits all come from the loaded pack, which
// is the only source of rules content.
import {
  resolveBackgroundDefinition,
  resolveClassDefinition,
  resolveFeatDefinition,
  resolveRaceDefinition,
  resolveSubclassDefinition,
  type RuleSnapshotLookup,
} from "../rules/ruleLookup.js";

export type ClassState = CharacterSave["classes"][number];

export const isTraitChoice = (grant: FeatureGrant): grant is TraitChoiceNode =>
  typeof grant !== "string" && grant.type === "trait_choice";

export const isSpellChoice = (grant: FeatureGrant): grant is SpellChoiceNode =>
  typeof grant !== "string" && grant.type === "spell_choice";

/**
 * Every grant a class state has unlocked: the class track plus, once a subclass
 * is chosen, its track too. Levels above the character's are ignored.
 */
export const unlockedGrants = (
  classState: ClassState,
  snapshot?: RuleSnapshotLookup,
): FeatureGrant[] => {
  const grants: FeatureGrant[] = [];

  const blueprint = resolveClassDefinition(classState.classId, snapshot);
  if (blueprint) {
    for (const level of blueprint.progression) {
      if (level.level <= classState.level) grants.push(...level.grants);
    }
  }

  const subclass = classState.subclassId
    ? resolveSubclassDefinition(classState.subclassId, snapshot)
    : undefined;
  if (subclass?.classId === classState.classId) {
    for (const level of subclass.progression) {
      if (level.level <= classState.level) grants.push(...level.grants);
    }
  }

  return grants;
};

/**
 * The first class in the array is the one the character started at level 1, so
 * it hands out the full starting proficiency set. Every class after it was
 * multiclassed into and only grants the reduced dip set.
 */
export const classTraitIds = (
  classState: ClassState,
  isPrimary: boolean,
  snapshot?: RuleSnapshotLookup,
): string[] => {
  const blueprint = resolveClassDefinition(classState.classId, snapshot);
  const ids: string[] = blueprint
    ? [
        ...(isPrimary
          ? blueprint.startingProficiencyTraitIds
          : blueprint.multiclassTraitIds),
      ]
    : [];

  for (const grant of unlockedGrants(classState, snapshot)) {
    if (typeof grant === "string") ids.push(grant);
    else if (isTraitChoice(grant)) {
      ids.push(...(classState.selections[grant.nodeId] ?? []));
    }
  }

  return ids;
};

/** The subrace's own granted traits. Empty when the race has none selected. */
export const subraceTraitIds = (
  race: CharacterSave["race"],
  snapshot?: RuleSnapshotLookup,
): string[] => {
  const definition = resolveRaceDefinition(race.baseRaceId, snapshot);
  if (!definition || !race.subraceId) return [];

  const subrace = definition.subraces[race.subraceId];
  return subrace ? [...subrace.grantedTraitIds] : [];
};

/** The base race's own granted traits, without its subrace. */
export const baseRaceTraitIds = (
  race: CharacterSave["race"],
  snapshot?: RuleSnapshotLookup,
): string[] => {
  const definition = resolveRaceDefinition(race.baseRaceId, snapshot);
  return definition ? [...definition.grantedTraitIds] : [];
};

export const raceTraitIds = (
  race: CharacterSave["race"],
  snapshot?: RuleSnapshotLookup,
): string[] => [
  ...baseRaceTraitIds(race, snapshot),
  ...subraceTraitIds(race, snapshot),
];

/**
 * The traits a preset background grants. An id the pack does not define
 * grants nothing, exactly as an unknown race does - a rulebook gap, not a
 * broken save.
 */
export const backgroundTraitIds = (
  backgroundId: string | undefined,
  snapshot?: RuleSnapshotLookup,
): string[] =>
  backgroundId === undefined
    ? []
    : (resolveBackgroundDefinition(backgroundId, snapshot)?.backgroundTraitIds ??
      []);

/** The traits of every feat taken. An unknown feat grants nothing (#75). */
export const featTraitIds = (
  featIds: string[],
  snapshot?: RuleSnapshotLookup,
): string[] =>
  featIds.flatMap(
    (featId) => resolveFeatDefinition(featId, snapshot)?.grantedTraitIds ?? [],
  );
