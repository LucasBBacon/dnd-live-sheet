export interface MulticlassDefinition {
  classId: string;
  /**
   * Evaluates the character's base ability scores against the 5e prerequisite rules.
   * @param baseScores Character's base ability scores.
   * @returns If character meets requirements to take this class as multiclass.
   */
  meetsPrerequisites: (baseScores: Record<string, number>) => boolean;
  /**
   * Traits granted specifically when taking this class as a secondary class.
   * (Usually restricted to a subset of the lvl 1 starting traits)
   */
  grantedTraits: string[];
}

export const MULTICLASS_DICTIONARY: Record<string, MulticlassDefinition> = {
  class_fighter: {
    classId: "class_fighter",
    meetsPrerequisites: (scores) =>
      (scores.str ?? 0) >= 13 || (scores.dex ?? 0) >= 13,
    grantedTraits: [
      "trait_prof_light_armor",
      "trait_prof_medium_armor",
      "trait_prof_shields",
      "trait_prof_simple_weapons",
      "trait_prof_martial_weapons",
    ],
  },
  class_rogue: {
    classId: "class_rogue",
    meetsPrerequisites: (scores) => (scores.dex ?? 0) >= 13,
    grantedTraits: [
      "trait_prof_light_armor",
      "trait_prof_thieves_tools",
      "trait_prof_rogue_multiclass_skill",
    ],
  },
};
