import type { ClassProgression } from "../types/progression.js";

export const CLASS_PROGRESSION_DICTIONARY: Record<
  string,
  Record<number, ClassProgression>
> = {
  class_fighter: {
    1: {
      classId: "class_fighter",
      level: 1,
      grantedTraits: ["trait_fighter_proficiencies", "trait_second_wind"],
      decisions: [
        {
          id: "dec_fighter_skills",
          type: "trait_selection",
          description:
            "Choose two skills from Acrobatics, Animal Handling, Athletics, History, Insight, Intimidation, Perception, and Survival.",
          options: [
            "trait_prof_acrobatics",
            "trait_animal_handling",
            "trait_prof_athletics",
            "trait_history",
            "trait_insight",
            "trait_intimidation",
            "trait_perception",
            "trait_prof_survival",
          ],
          isRequired: true,
          quantity: 2,
        },
        {
          id: "dec_fighting_style",
          type: "trait_selection",
          description: "Choose a Fighting Style.",
          options: ["trait_fs_archery", "trait_fs_defense", "trait_fs_dueling"],
          isRequired: true,
          quantity: 1,
        },
      ],
    },
    2: {
      classId: "class_fighter",
      level: 2,
      grantedTraits: ["trait_action_surger"],
      decisions: [],
    },
    3: {
      classId: "class_fighter",
      level: 3,
      grantedTraits: [],
      decisions: [
        {
          id: "dec_martial_archetype",
          type: "subclass",
          description: "Choose a Martial Archetype",
          options: [
            "subclass_fighter_champion",
            "subclass_fighter_battle_master",
            "subclass_fighter_eldritch_knight",
          ],
          isRequired: true,
          quantity: 1,
        },
      ],
    },
    4: {
      classId: "class_fighter",
      level: 4,
      grantedTraits: [],
      decisions: [
        {
          id: "dec_fighter_asi_4",
          type: "asi_or_feat",
          description:
            "Increase one ability score by 2, or two ability scores by 1.",
          isRequired: true,
          quantity: 1,
        },
      ],
    },
  },
};
