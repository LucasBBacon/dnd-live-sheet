import { CLASS_PROGRESSION_DICTIONARY } from "../rules/progressionDictionary.js";
import type { ClassProgression } from "../types/progression.js";

export class ProgressionEngine {
  public static getLevelDefinition(
    classId: string,
    targetLevel: number,
  ): ClassProgression | undefined {
    return CLASS_PROGRESSION_DICTIONARY[classId]?.[targetLevel];
  }

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
}
