import { MULTICLASS_DICTIONARY } from "../rules/multiclassDictionary.js";
import { CLASS_PROGRESSION_DICTIONARY } from "../rules/progressionDictionary.js";
import type { ClassProgression } from "../types/progression.js";

export class ProgressionEngine {
  /**
   * Retrieves the progression definition for a specific class and target level.
   * @param classId The ID of the class for which the progression definition is being requested.
   * @param targetLevel The target level for which the progression definition is being requested.
   * @returns The ClassProgression object containing the progression details for the specified class and level, or undefined if no definition exists.
   */
  public static getLevelDefinition(
    classId: string,
    targetLevel: number,
  ): ClassProgression | undefined {
    return CLASS_PROGRESSION_DICTIONARY[classId]?.[targetLevel];
  }

  /**
   * Validates the level-up payload against the progression definitions for the specified class and target level.
   * @param classId The ID of the class for which the level-up is being validated.
   * @param targetLevel The target level the character is attempting to reach.
   * @param payload The level-up payload containing the user's selections for subclass, traits, ASI, and feats.
   */
  public static validateLevelUp(
    classId: string,
    targetLevel: number,
    payload: any,
  ): void {
    const definition = this.getLevelDefinition(classId, targetLevel);

    if (!definition) {
      throw new Error(
        `Progression definitions not found for ${classId} at level ${targetLevel}`,
      );
    }

    // evaluate all decisions defined for this level
    for (const decision of definition.decisions) {
      if (decision.isRequired) {
        // strict validation: subclass
        if (decision.type === "subclass" && !payload.subclassId) {
          throw new Error(`A subclass selection is required at this level`);
        }

        // strict validation: trait selection
        if (decision.type === "trait_selection") {
          const selectedTraits = payload.selectedTraits?.[decision.id] || [];
          if (selectedTraits.length !== decision.quantity) {
            throw new Error(
              `You must select exactly ${decision.quantity} option(s) for ${decision.description}.`,
            );
          }
        }

        // strict validation: ASI or Feat
        if (decision.type === "asi_or_feat") {
          const hasASI = payload.asiChoices && payload.asiChoices.length > 0;
          const hasFeat = !!payload.featId;

          if (!hasASI && !hasFeat) {
            throw new Error(
              `You must allocate Ability Score Improvements or select a Feat.`,
            );
          }
          if (hasASI && hasFeat) {
            throw new Error(
              `You cannot select both Ability Score Improvements and a Feat`,
            );
          }
        }
      }
    }
  }

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

  public static getGrantedTraitsForLevel(
    classId: string,
    targetLevel: number,
    isMulticlassDip: boolean, // true if taking lvl 1 in a class that isn't their primary
  ): string[] {
    const progression = CLASS_PROGRESSION_DICTIONARY[classId]?.[targetLevel]; // TODO: REMOVE THIS
    if (!progression) return [];

    // if taking lvl 1 of a new secondary class, override standard level 1 traits
    // with restricted multiclass traits
    if (targetLevel === 1 && isMulticlassDip) {
      return MULTICLASS_DICTIONARY[classId]?.grantedTraits || [];
    }

    return progression.grantedTraits;
  }
}
