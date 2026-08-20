import type {
  CharacterSave,
  FeatureGrant,
  SpellChoiceNode,
  TraitChoiceNode,
  TraitChoiceOption,
  TraitDefinition,
} from "@project/shared";
import { traitIdOfOption } from "@project/shared";
import { EffectManager } from "../calculators/effects.js";
import { ResourceManager } from "../calculators/resources.js";
import { CLASS_DICTIONARY } from "../rules/classDictionary.js";
import { SUBCLASS_DICTIONARY } from "../rules/subclassDictionary.js";
import { RACE_DICTIONARY } from "../rules/raceDictionary.js";
import { TRAIT_DICTIONARY } from "../rules/traitDictionary.js";
import {
  resolveClassDefinition,
  resolveRaceDefinition,
  resolveTraitDefinition,
  type RuleSnapshotLookup,
} from "../rules/ruleLookup.js";
import { ModifierExtractor } from "./modifierExtractor.js";
import { ProficiencyExtractor } from "./proficiencyExtractor.js";
import type {
  ChoiceRejection,
  ChoiceRejectionReason,
  ChoiceResolution,
} from "./choiceResolution.js";

// these now live with the data they describe
export type { RaceDefinition } from "../rules/raceDictionary.js";
export type { SubclassDefinition } from "../rules/subclassDictionary.js";

const MAX_TOTAL_LEVEL = 20;

type ClassState = CharacterSave["classes"][number];

export type SaveValidationCode =
  | "unknown_class"
  | "duplicate_class"
  | "missing_subclass"
  | "unknown_subclass"
  | "subclass_class_mismatch"
  | "unknown_race"
  | "subrace_flag_mismatch"
  | "missing_subrace"
  | "unknown_subrace"
  | "unexpected_subrace"
  | "total_level_exceeded"
  | "missing_selection"
  | "wrong_selection_count"
  | "invalid_option"
  | "duplicate_selection"
  | "unmet_prerequisite"
  | "orphan_selection"
  | "redundant_selection";

export interface SaveValidationIssue {
  code: SaveValidationCode;
  message: string;
  classId?: string;
  /** the class progression nodeId, or the trait choice block id */
  nodeId?: string;
  /** set when the issue came from a trait's own choice block */
  traitId?: string;
}

/**
 * How an extractor's refusal reads as a validation issue. `over_limit` maps to
 * nothing because the selection count check already covers it, and reporting
 * both would name the same mistake twice.
 */
const REJECTION_CODES: Record<
  ChoiceRejectionReason,
  SaveValidationCode | undefined
> = {
  not_an_option: "invalid_option",
  already_held: "redundant_selection",
  duplicate: "duplicate_selection",
  over_limit: undefined,
};

/**
 * Problems that leave whole branches missing from the compiled trait set, so
 * that checking trait choices on top would report cascade noise rather than
 * anything the player can act on.
 */
const FOUNDATION_CODES = new Set<SaveValidationCode>([
  "unknown_race",
  "subrace_flag_mismatch",
  "missing_subrace",
  "unknown_subrace",
  "unexpected_subrace",
  "unknown_class",
  "missing_subclass",
  "unknown_subclass",
  "subclass_class_mismatch",
]);

const rejectionMessage = (
  resolution: ChoiceResolution,
  { selectedId, reason }: ChoiceRejection,
): string => {
  const where = `${resolution.traitName}: ${resolution.choiceId}`;

  switch (reason) {
    case "not_an_option":
      return `${where} does not offer ${selectedId}`;
    case "already_held":
      return `${where} picked ${selectedId}, which this character already has - the pick buys nothing`;
    case "duplicate":
      return `${where} has ${selectedId} selected twice`;
    case "over_limit":
      return `${where} cannot honour ${selectedId}`;
  }
};

const isTraitChoice = (grant: FeatureGrant): grant is TraitChoiceNode =>
  typeof grant !== "string" && grant.type === "trait_choice";

const isSpellChoice = (grant: FeatureGrant): grant is SpellChoiceNode =>
  typeof grant !== "string" && grant.type === "spell_choice";

/**
 * Every grant a class state has unlocked: the class track plus, once a subclass
 * is chosen, its track too. Levels above the character's are ignored.
 */
const unlockedGrants = (
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
    ? SUBCLASS_DICTIONARY[classState.subclassId]
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
const classTraitIds = (
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

const raceTraitIds = (
  race: CharacterSave["race"],
  snapshot?: RuleSnapshotLookup,
): string[] => {
  const definition = resolveRaceDefinition(race.baseRaceId, snapshot);
  if (!definition) return [];

  const ids = [...definition.grantedTraitIds];
  const subrace = race.subraceId
    ? definition.subraces[race.subraceId]
    : undefined;
  if (subrace) ids.push(...subrace.grantedTraitIds);

  return ids;
};

const knownSpellIds = (
  classState: ClassState,
  traitIds: Iterable<string>,
): Set<string> => {
  const ids = new Set<string>();

  for (const traitId of traitIds) {
    for (const spell of TRAIT_DICTIONARY[traitId]?.spells?.fixed ?? []) {
      ids.add(spell.spellId);
    }
  }
  for (const grant of unlockedGrants(classState)) {
    if (!isSpellChoice(grant)) continue;
    for (const id of classState.selections[grant.nodeId] ?? []) ids.add(id);
  }

  return ids;
};

/**
 * Prerequisites are checked against the character as they stand now, not
 * against the level the node first appeared at. That matches how the rules
 * work in practice - a warlock who swaps an invocation on level up is judged
 * on their current pact and level, not on what they had at level 2.
 */
const unmetPrerequisites = (
  option: TraitChoiceOption,
  classState: ClassState,
  traitIds: Set<string>,
  spellIds: Set<string>,
): string[] => {
  if (typeof option === "string") return [];

  const reasons: string[] = [];
  const { minimumLevel, requiredTraitIds, requiredSpellIds } =
    option.prerequisites;

  if (minimumLevel !== undefined && classState.level < minimumLevel) {
    reasons.push(`needs ${classState.classId} level ${minimumLevel}`);
  }
  for (const required of requiredTraitIds ?? []) {
    if (!traitIds.has(required)) reasons.push(`needs ${required}`);
  }
  for (const required of requiredSpellIds ?? []) {
    if (!spellIds.has(required)) reasons.push(`needs ${required}`);
  }

  return reasons;
};

export class CharacterBootstrapper {
  /**
   * Every trait the save resolves to: race and subrace, each class's starting
   * proficiencies, the features unlocked at its level, and whatever was picked
   * at each trait_choice node.
   */
  public static resolveGrantedTraitIds(
    save: CharacterSave,
    snapshot?: RuleSnapshotLookup,
  ): string[] {
    const ids = [
      ...raceTraitIds(save.race, snapshot),
      ...save.classes.flatMap((classState, index) =>
        classTraitIds(classState, index === 0, snapshot),
      ),
    ];

    return [...new Set(ids)];
  }

  /**
   * Checks a save against the static rulebook without throwing, so callers can
   * surface every problem at once instead of one per round trip.
   */
  public static collectSaveIssues(save: CharacterSave): SaveValidationIssue[] {
    const issues: SaveValidationIssue[] = [];
    const add = (issue: SaveValidationIssue) => issues.push(issue);

    // #region race
    const race = RACE_DICTIONARY[save.race.baseRaceId];
    if (!race) {
      add({
        code: "unknown_race",
        message: `Unknown race: ${save.race.baseRaceId}`,
      });
    } else {
      if (race.hasSubraces !== save.race.hasSubraces) {
        add({
          code: "subrace_flag_mismatch",
          message: `${race.name} ${race.hasSubraces ? "has" : "has no"} subraces, but the save says otherwise`,
        });
      }
      if (race.hasSubraces && !save.race.subraceId) {
        add({
          code: "missing_subrace",
          message: `${race.name} requires a subrace selection`,
        });
      }
      if (!race.hasSubraces && save.race.subraceId) {
        add({
          code: "unexpected_subrace",
          message: `${race.name} has no subraces, but ${save.race.subraceId} was selected`,
        });
      }
      if (save.race.subraceId && !race.subraces[save.race.subraceId]) {
        add({
          code: "unknown_subrace",
          message: `${save.race.subraceId} is not a subrace of ${race.name}`,
        });
      }
    }
    // #endregion

    let totalLevel = 0;
    const seenClassIds = new Set<string>();

    for (const [classIndex, classState] of save.classes.entries()) {
      totalLevel += classState.level;

      const blueprint = CLASS_DICTIONARY[classState.classId];
      if (!blueprint) {
        add({
          code: "unknown_class",
          message: `Invalid Class ID: ${classState.classId}`,
          classId: classState.classId,
        });
        continue;
      }

      if (seenClassIds.has(classState.classId)) {
        add({
          code: "duplicate_class",
          message: `${blueprint.name} appears more than once`,
          classId: classState.classId,
        });
      }
      seenClassIds.add(classState.classId);

      // #region subclass
      if (
        classState.level >= blueprint.subclassUnlockLevel &&
        !classState.subclassId
      ) {
        add({
          code: "missing_subclass",
          message: `${blueprint.name} requires a subclass selection at level ${blueprint.subclassUnlockLevel}`,
          classId: classState.classId,
        });
      }
      if (classState.subclassId) {
        const subclass = SUBCLASS_DICTIONARY[classState.subclassId];
        if (!subclass) {
          add({
            code: "unknown_subclass",
            message: `Unknown subclass: ${classState.subclassId}`,
            classId: classState.classId,
          });
        } else if (subclass.classId !== classState.classId) {
          add({
            code: "subclass_class_mismatch",
            message: `${subclass.name} belongs to ${subclass.classId}, not ${classState.classId}`,
            classId: classState.classId,
          });
        }
      }
      // #endregion

      // #region choice nodes
      const grants = unlockedGrants(classState);
      const traitIds = new Set([
        ...raceTraitIds(save.race),
        ...classTraitIds(classState, classIndex === 0),
      ]);
      const spellIds = knownSpellIds(classState, traitIds);
      const knownNodeIds = new Set<string>();

      for (const grant of grants) {
        if (typeof grant === "string") continue;
        knownNodeIds.add(grant.nodeId);

        const selected = classState.selections[grant.nodeId];
        const where = { classId: classState.classId, nodeId: grant.nodeId };

        if (!selected || selected.length === 0) {
          add({
            ...where,
            code: "missing_selection",
            message: `${blueprint.name}: nothing selected for ${grant.nodeId}`,
          });
          continue;
        }

        if (selected.length !== grant.pickCount) {
          add({
            ...where,
            code: "wrong_selection_count",
            message: `${blueprint.name}: ${grant.nodeId} takes ${grant.pickCount} selection(s), got ${selected.length}`,
          });
        }

        if (new Set(selected).size !== selected.length) {
          add({
            ...where,
            code: "duplicate_selection",
            message: `${blueprint.name}: ${grant.nodeId} has the same option selected twice`,
          });
        }

        // a spell_choice can only be checked for shape: there is no spell list
        // data yet to check membership against
        if (!isTraitChoice(grant)) continue;

        const optionsById = new Map(
          grant.options.map((option) => [traitIdOfOption(option), option]),
        );

        for (const choice of selected) {
          const option = optionsById.get(choice);
          if (!option) {
            add({
              ...where,
              code: "invalid_option",
              message: `${blueprint.name}: ${choice} is not an option for ${grant.nodeId}`,
            });
            continue;
          }

          const unmet = unmetPrerequisites(
            option,
            classState,
            traitIds,
            spellIds,
          );
          if (unmet.length > 0) {
            add({
              ...where,
              code: "unmet_prerequisite",
              message: `${blueprint.name}: ${choice} ${unmet.join(", ")}`,
            });
          }
        }
      }

      for (const nodeId of Object.keys(classState.selections)) {
        if (knownNodeIds.has(nodeId)) continue;
        add({
          code: "orphan_selection",
          message: `${blueprint.name}: selection for ${nodeId}, which this character has not unlocked`,
          classId: classState.classId,
          nodeId,
        });
      }
      // #endregion
    }

    // trait choice blocks are skipped outright when the character's race,
    // subrace, class or subclass did not resolve: the trait set is then missing
    // whole branches, and every pick into one of them would be reported as an
    // orphan. The real problem is already in the list; this would only bury it
    if (!issues.some((issue) => FOUNDATION_CODES.has(issue.code))) {
      issues.push(...CharacterBootstrapper.collectTraitChoiceIssues(save));
    }

    if (totalLevel > MAX_TOTAL_LEVEL) {
      add({
        code: "total_level_exceeded",
        message: `Total character level cannot exceed ${MAX_TOTAL_LEVEL}. Current: ${totalLevel}`,
      });
    }

    return issues;
  }

  /**
   * Checks the choice blocks that live on traits rather than on a class
   * progression track - a half-elf's two ability bumps, a dwarf's artisan tool,
   * a bonus language.
   *
   * The rules are not re-implemented here. Both extractors already decide which
   * picks they will honour, and report the ones they refuse; this only turns
   * those refusals into issues, so validation and the live sheet can never
   * disagree about what a pick does.
   */
  private static collectTraitChoiceIssues(
    save: CharacterSave,
  ): SaveValidationIssue[] {
    const issues: SaveValidationIssue[] = [];

    const activeTraits = CharacterBootstrapper.compileActiveTraits(save);
    const selections = CharacterBootstrapper.resolveSelections(save);
    const resolutions: ChoiceResolution[] = [
      ...ModifierExtractor.resolveChoices(activeTraits, selections),
      ...ProficiencyExtractor.resolveChoices(activeTraits, selections),
    ];

    for (const resolution of resolutions) {
      const where = {
        nodeId: resolution.choiceId,
        traitId: resolution.traitId,
      };
      const selected = selections[resolution.choiceId] ?? [];

      if (selected.length === 0) {
        issues.push({
          ...where,
          code: "missing_selection",
          message: `${resolution.traitName}: nothing selected for ${resolution.choiceId}`,
        });
        continue;
      }

      if (selected.length !== resolution.chooseAmount) {
        issues.push({
          ...where,
          code: "wrong_selection_count",
          message: `${resolution.traitName}: ${resolution.choiceId} takes ${resolution.chooseAmount} selection(s), got ${selected.length}`,
        });
      }

      for (const rejection of resolution.rejected) {
        // over_limit gets no issue of its own - the count check above already
        // said the block was handed more picks than it hands out
        const code = REJECTION_CODES[rejection.reason];
        if (!code) continue;

        issues.push({
          ...where,
          code,
          message: rejectionMessage(resolution, rejection),
        });
      }
    }

    const knownChoiceIds = new Set(resolutions.map((r) => r.choiceId));
    for (const choiceId of Object.keys(save.traitSelections)) {
      if (knownChoiceIds.has(choiceId)) continue;
      issues.push({
        code: "orphan_selection",
        nodeId: choiceId,
        message: `Selection for ${choiceId}, which no trait on this character offers`,
      });
    }

    return issues;
  }

  /**
   * Validates a character save file against the static rulebook before building the sheet.
   * @param save The character save file to validate.
   * @throws if the save breaks any rulebook constraint, listing every problem.
   */
  public static validateSave(save: CharacterSave): void {
    const issues = CharacterBootstrapper.collectSaveIssues(save);
    if (issues.length === 0) return;

    throw new Error(
      issues.length === 1
        ? issues[0]!.message
        : `Invalid character save:\n- ${issues.map((i) => i.message).join("\n- ")}`,
    );
  }

  public static hydrateRuntimeManagers(
    save: CharacterSave,
    effectManager: EffectManager,
    resourceManager: ResourceManager,
    snapshot?: RuleSnapshotLookup,
  ): TraitDefinition[] {
    const activeTraits = CharacterBootstrapper.compileActiveTraits(
      save,
      snapshot,
    );

    for (const effect of [...effectManager.getActiveEffects()]) {
      if (effect.instanceId.startsWith("trait_state_")) {
        effectManager.removeEffect(effect.instanceId);
      }
    }

    for (const trait of activeTraits) {
      if ((trait.grantedStates ?? []).length === 0) continue;

      effectManager.addEffect({
        instanceId: `trait_state_${trait.id}`,
        sourceName: trait.name,
        durationType: "manual",
        isSelfConcentration: false,
        modifiers: [],
        grantedStates: trait.grantedStates ?? [],
        kind: "trait_state",
      });
    }

    resourceManager.initializeFromGrants(
      activeTraits.flatMap((trait) => trait.resources ?? []),
      {
        classes: Object.fromEntries(
          save.classes.map((classState) => [classState.classId, classState.level]),
        ),
      },
    );

    return activeTraits;
  }

  /**
   * Turns the ids from resolveGrantedTraitIds into the trait definitions the
   * extractors and calculators actually consume.
   *
   * Ids with no entry in TRAIT_DICTIONARY are skipped rather than thrown on: a
   * blueprint referencing a trait that has not been authored yet is a rulebook
   * gap, not a broken save, and validateSave is where saves get judged.
   */
  public static compileActiveTraits(
    save: CharacterSave,
    snapshot?: RuleSnapshotLookup,
  ): TraitDefinition[] {
    return CharacterBootstrapper.resolveGrantedTraitIds(save, snapshot)
      .map((traitId) => resolveTraitDefinition(traitId, snapshot))
      .filter((trait): trait is TraitDefinition => trait !== undefined);
  }

  /**
   * The picks the extractors need, in one lookup table. Trait choice blocks are
   * keyed by their own id in save.traitSelections; class progression nodes are
   * keyed by nodeId per class. They share a flat namespace here because a
   * compiled trait no longer remembers which class unlocked it.
   */
  public static resolveSelections(
    save: CharacterSave,
  ): Record<string, string[]> {
    const selections: Record<string, string[]> = { ...save.traitSelections };

    for (const classState of save.classes) {
      for (const [nodeId, picks] of Object.entries(classState.selections)) {
        selections[nodeId] = [...(selections[nodeId] ?? []), ...picks];
      }
    }

    return selections;
  }
}
