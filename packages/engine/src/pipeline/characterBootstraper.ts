import type { CharacterSave } from "@project/shared";
import { CLASS_DICTIONARY } from "../rules/classDictionary.js";

// these now live with the data they describe
export type { RaceDefinition } from "../rules/raceDictionary.js";
export type { SubclassDefinition } from "../rules/subclassDictionary.js";

export class CharacterBootstrapper {
  /**
   * Validates a character save file against the static rulebook before building the sheet.
   * @param save The character save file to validate.
   */
  public static validateSave(save: CharacterSave): void {
    let totalLevel = 0;

    for (const classState of save.classes) {
      totalLevel += classState.level;
      const blueprint = CLASS_DICTIONARY[classState.classId];

      if (!blueprint) {
        throw new Error(`Invalid Class ID: ${classState.classId}`);
      }

      // dynamic guardrail (used to be superRefine)
      if (
        classState.level >= blueprint.subclassUnlockLevel &&
        !classState.subclassId
      ) {
        throw new Error(
          `${blueprint.name} requires a subclass selection at level ${blueprint.subclassUnlockLevel}`,
        );
      }
    }

    if (totalLevel >= 20) {
      throw new Error(
        `Total character level cannot exceed 20. Current: ${totalLevel}`,
      );
    }
  }

  // TODO: build array of active trait ids based on class level
  // TODO: hydrate EffectManager
  // TODO: hydrate ResourceManager
}
