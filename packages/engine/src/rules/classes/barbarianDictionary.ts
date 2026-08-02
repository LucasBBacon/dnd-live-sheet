import type { ClassDefinition } from "@project/shared";
import type { SubclassDefinition } from "../subclassDictionary.js";

export const BARBARIAN_CLASS: ClassDefinition = {
  id: "class_barbarian",
  name: "Barbarian",
  hitDie: 12,
  subclassUnlockLevel: 3,
  multiclassTraitIds: [
    "trait_barbarian_mult_prof_armor",
    "trait_barbarian_mult_prof_weapons",
  ],
  multiclassPrerequisites: { abilityMinimums: { str: 13 } },
  startingProficiencyTraitIds: [
    "trait_barbarian_prof_armor",
    "trait_barbarian_prof_weapons",
    "trait_barbarian_prof_saving_throw",
    "trait_barbarian_prof_skills",
  ],
  progression: [
    {
      level: 1,
      grants: ["trait_rage", "trait_unarmored_defense_barbarian"],
      grantsASI: false,
    },
    {
      level: 2,
      grants: ["trait_reckless_attack", "trait_danger_sense"],
      grantsASI: false,
    },
    {
      level: 3,
      grants: ["trait_rage", "trait_primal_path"],
      grantsASI: false,
    },
    { level: 4, grants: [], grantsASI: true },
    {
      level: 5,
      grants: ["trait_extra_attack", "trait_fast_movement"],
      grantsASI: false,
    },
    {
      level: 6,
      grants: ["trait_primal_path_feature"],
      grantsASI: false,
    },
    {
      level: 7,
      grants: ["trait_feral_instinct"],
      grantsASI: false,
    },
    { level: 8, grants: [], grantsASI: true },
    {
      level: 9,
      grants: ["trait_rage", "trait_brutal_critical"],
      grantsASI: false,
    },
    {
      level: 10,
      grants: ["trait_primal_path_feature"],
      grantsASI: false,
    },
    {
      level: 11,
      grants: ["trait_relentless_rage"],
      grantsASI: false,
    },
    {
      level: 12,
      grants: ["trait_rage"],
      grantsASI: true,
    },
    {
      level: 13,
      grants: ["trait_brutal_critical"],
      grantsASI: false,
    },
    {
      level: 14,
      grants: ["trait_primal_path_feature"],
      grantsASI: false,
    },
    {
      level: 15,
      grants: ["trait_persistent_rage"],
      grantsASI: false,
    },
    {
      level: 16,
      grants: ["trait_rage"],
      grantsASI: true,
    },
    {
      level: 17,
      grants: ["trait_rage", "trait_brutal_critical"],
      grantsASI: false,
    },
    {
      level: 18,
      grants: ["trait_indomitable_might"],
      grantsASI: false,
    },
    { level: 19, grants: [], grantsASI: true },
    {
      level: 20,
      grants: ["trait_rage", "trait_primal_champion"],
      grantsASI: false,
    },
  ],
};

export const BARBARIAN_SUBCLASSES: Record<string, SubclassDefinition> = {
  subclass_barbarian_berserker: {
    id: "subclass_barbarian_berserker",
    classId: "class_barbarian",
    name: "Path of the Berserker",
    progression: [
      {
        level: 3,
        grants: ["trait_berserker_frenzy"],
      },
      {
        level: 6,
        grants: ["trait_berserker_mindless_rage"],
      },
      {
        level: 10,
        grants: ["trait_berserker_intimidating_presence"],
      },
      {
        level: 14,
        grants: ["trait_berserker_retaliation"],
      },
    ],
  },
  subclass_barbarian_totem_warrior: {
    id: "subclass_barbarian_totem_warrior",
    classId: "class_barbarian",
    name: "Path of the Totem Warrior",
    progression: [
      {
        level: 3,
        grants: [
          "trait_spirit_seeker",
          {
            type: "trait_choice",
            nodeId: "barbarian_totem_level_3_totem_spirit",
            options: [
              "trait_totem_spirit_bear",
              "trait_totem_spirit_eagle",
              "trait_totem_spirit_wolf",
            ],
            pickCount: 1,
          },
        ],
      },
      {
        level: 6,
        grants: [
          {
            type: "trait_choice",
            nodeId: "barbarian_totem_level_6_aspect",
            options: [
              "trait_aspect_of_the_beast_bear",
              "trait_aspect_of_the_beast_eagle",
              "trait_aspect_of_the_beast_wolf",
            ],
            pickCount: 1,
          },
        ],
      },
      {
        level: 10,
        grants: ["trait_spirit_walker"],
      },
      {
        level: 14,
        grants: [
          {
            type: "trait_choice",
            nodeId: "barbarian_totem_level_14_attunement",
            options: [
              "trait_totemic_attunement_bear",
              "trait_totemic_attunement_eagle",
              "trait_totemic_attunement_wolf",
            ],
            pickCount: 1,
          },
        ],
      },
    ],
  },
};
