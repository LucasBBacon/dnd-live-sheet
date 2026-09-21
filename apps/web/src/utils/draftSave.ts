import type { CharacterChoices, CharacterSave } from "@project/shared";
import type { WizardState } from "../store/wizardStore";

/**
 * The exact slice of `WizardState` that `buildDraftSave` reads - named so a
 * caller (the Choices step) can select just these fields from the store
 * instead of subscribing to the whole thing, which would rebuild the draft
 * save - and re-run `listChoiceQuestions` - on every unrelated store change
 * app-wide (e.g. a keystroke in the character name at step 1).
 */
export type DraftSaveInputs = Pick<
  WizardState,
  | "raceId"
  | "subraceId"
  | "raceRequiresSubrace"
  | "classId"
  | "subclassId"
  | "backgroundType"
  | "backgroundId"
  | "baseAbilityScores"
  | "choiceAnswers"
>;

/**
 * A placeholder hp block for a save that only exists to ask
 * `listChoiceQuestions` what is left to answer - the wizard has not rolled hp
 * yet at this point in character creation, and nothing choice-question
 * related reads it.
 */
const DRAFT_HP: CharacterSave["hp"] = {
  current: 1,
  temporary: 0,
  baseRolledHp: 1,
  hitDiceSpent: {},
};

/**
 * Splits the wizard's flat `choiceAnswers` map into the two shapes
 * `CharacterChoices` keeps them in: class progression picks nested by
 * classId and then by node id, and trait choice-block picks keyed directly
 * by block id.
 */
export const choicesFromAnswers = (
  answers: WizardState["choiceAnswers"],
): CharacterChoices => {
  const classSelections: CharacterChoices["classSelections"] = {};
  const traitSelections: CharacterChoices["traitSelections"] = {};

  for (const [questionId, answer] of Object.entries(answers)) {
    if (answer.target === "class" && answer.classId) {
      classSelections[answer.classId] ??= {};
      classSelections[answer.classId][questionId] = answer.selected;
    } else {
      traitSelections[questionId] = answer.selected;
    }
  }

  return { classSelections, traitSelections, feats: [] };
};

/**
 * Projects the wizard's in-progress state into a `CharacterSave` -
 * everything `listChoiceQuestions` needs to say what is still unanswered.
 *
 * `null` until a race and class are both chosen: before that, there is no
 * character to ask questions about yet.
 */
export const buildDraftSave = (
  state: DraftSaveInputs,
): CharacterSave | null => {
  if (!state.raceId || !state.classId) return null;

  const { classSelections, traitSelections } = choicesFromAnswers(
    state.choiceAnswers,
  );

  return {
    attributes: {
      str: state.baseAbilityScores.STR,
      dex: state.baseAbilityScores.DEX,
      con: state.baseAbilityScores.CON,
      int: state.baseAbilityScores.INT,
      wis: state.baseAbilityScores.WIS,
      cha: state.baseAbilityScores.CHA,
    },
    race: {
      baseRaceId: state.raceId,
      subraceId: state.subraceId,
      hasSubraces: state.raceRequiresSubrace,
    },
    ...(state.backgroundType === "PRESET" && state.backgroundId
      ? { backgroundId: state.backgroundId }
      : {}),
    feats: [],
    classes: [
      {
        classId: state.classId,
        level: 1,
        ...(state.subclassId ? { subclassId: state.subclassId } : {}),
        selections: classSelections[state.classId] ?? {},
      },
    ],
    traitSelections,
    hp: DRAFT_HP,
  };
};
