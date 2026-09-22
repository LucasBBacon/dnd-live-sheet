import type { CharacterSave, TraitChoiceOption } from "@project/shared";
import {
  resolveTraitDefinition,
  type RuleSnapshotLookup,
} from "../rules/ruleLookup.js";
import {
  classTraitIds,
  isSpellChoice,
  raceTraitIds,
  unlockedGrants,
  type ClassState,
} from "./grantSources.js";

/** One gate on a trait-choice option that the character does not pass. */
export type UnmetPrerequisite =
  | { kind: "level"; classId: string; level: number }
  | { kind: "trait"; traitId: string }
  | { kind: "spell"; spellId: string };

/**
 * What one class's trait-choice options are checked against: the class's own
 * level, the traits the character has through their race and this class, and
 * the spells they know.
 */
export interface PrerequisiteContext {
  classState: ClassState;
  traitIds: Set<string>;
  spellIds: Set<string>;
}

/** Every fixed spell of the given traits, and the class's own spell picks. */
const knownSpellIds = (
  classState: ClassState,
  traitIds: Iterable<string>,
  snapshot?: RuleSnapshotLookup,
): Set<string> => {
  const ids = new Set<string>();

  for (const traitId of traitIds) {
    const spells = resolveTraitDefinition(traitId, snapshot)?.spells;
    for (const spell of spells?.fixed ?? []) ids.add(spell.spellId);
  }
  for (const grant of unlockedGrants(classState, snapshot)) {
    if (!isSpellChoice(grant)) continue;
    for (const id of classState.selections[grant.nodeId] ?? []) ids.add(id);
  }

  return ids;
};

/**
 * The context one class's trait-choice options are checked against - the one
 * construction save validation and listChoiceQuestions share, so a picker and
 * the server can never disagree about whether an option is available.
 * @param save The character
 * @param classIndex The class's position in save.classes; the first class
 *   grants the full starting proficiency set, a later one the multiclass set
 * @param traitSpellPicks Every trait spell block's picks (a High Elf's cantrip,
 *   a feat's), known wherever they came from
 * @param snapshot Pack content, when the caller has any loaded
 * @returns The class state, and the traits and spells it is checked against
 */
export const prerequisiteContext = (
  save: CharacterSave,
  classIndex: number,
  traitSpellPicks: string[],
  snapshot?: RuleSnapshotLookup,
): PrerequisiteContext => {
  const classState = save.classes[classIndex];
  if (!classState) {
    throw new Error(`No class at index ${classIndex} of the save`);
  }

  const traitIds = new Set([
    ...raceTraitIds(save.race, snapshot),
    ...classTraitIds(classState, classIndex === 0, snapshot),
  ]);

  return {
    classState,
    traitIds,
    spellIds: new Set([
      ...knownSpellIds(classState, traitIds, snapshot),
      ...traitSpellPicks,
    ]),
  };
};

/**
 * The gates an option does not pass: a level too low, then each missing
 * trait, then each unknown spell.
 *
 * Prerequisites are checked against the character as they stand now, not
 * against the level the node first appeared at. That matches how the rules
 * work in practice - a warlock who swaps an invocation on level up is judged
 * on their current pact and level, not on what they had at level 2.
 * @param option A trait-choice option; a bare string has no prerequisites
 * @param context prerequisiteContext for the class the choice belongs to
 * @returns Every unmet prerequisite, empty when the option can be taken
 */
export const unmetPrerequisites = (
  option: TraitChoiceOption,
  context: PrerequisiteContext,
): UnmetPrerequisite[] => {
  if (typeof option === "string") return [];

  const unmet: UnmetPrerequisite[] = [];
  const { minimumLevel, requiredTraitIds, requiredSpellIds } =
    option.prerequisites;
  const { classState, traitIds, spellIds } = context;

  if (minimumLevel !== undefined && classState.level < minimumLevel) {
    unmet.push({ kind: "level", classId: classState.classId, level: minimumLevel });
  }
  for (const traitId of requiredTraitIds ?? []) {
    if (!traitIds.has(traitId)) unmet.push({ kind: "trait", traitId });
  }
  for (const spellId of requiredSpellIds ?? []) {
    if (!spellIds.has(spellId)) unmet.push({ kind: "spell", spellId });
  }

  return unmet;
};
