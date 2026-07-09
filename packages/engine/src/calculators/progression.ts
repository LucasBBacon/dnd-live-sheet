import { MULTICLASS_DICTIONARY } from "../rules/multiclassDictionary.js";

export class ProgressionEngine {
  /**
   * Validates that the character meets the prerequisites to multiclass into the target class.
   * @param targetClassId The ID of the class the character is attempting to multiclass into.
   * @param currentBaseScores A record of the character's current base ability scores (e.g., { STR: 15, DEX: 12, ... }).
   * @throws Will throw an error if the character does not meet the prerequisites for multiclassing into the target class.
   */
  public static validateMulticlassPrerequisites(
    targetClassId: string,
    currentBaseScores: Record<string, number>,
  ): void {
    const requirements = MULTICLASS_DICTIONARY[targetClassId]; // TODO: Fetch this data from the database or a service instead of relying on a static dictionary

    if (!requirements) {
      throw new Error(`Multiclass definitions not found for ${targetClassId}`);
    }

    if (!requirements.meetsPrerequisites(currentBaseScores)) {
      throw new Error(
        `You do not meet the ability score prerequisites to multiclass into this class.`,
      );
    }
  }
}
