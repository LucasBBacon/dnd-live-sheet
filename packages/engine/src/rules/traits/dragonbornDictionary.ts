import type { TraitDefinition } from "@project/shared";

export const DRAGONBORN_TRAITS: Record<string, TraitDefinition> = {
  race_dragonborn_asi: {
    id: "race_dragonborn_asi",
    name: "(Dragonborn) Ability Score Increase",
    description:
      "Your Strength score increases by 2, and your Charisma score increases by 1.",
    modifiers: {
      fixed: [
        {
          target: "STR",
          type: "add",
          value: 2,
          scalingFactor: "none",
          requiredStates: [],
          forbiddenStates: [],
        },
        {
          target: "CHA",
          type: "add",
          value: 1,
          scalingFactor: "none",
          requiredStates: [],
          forbiddenStates: [],
        },
      ],
      choices: [],
    },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  subrace_dragonborn_black: {
    id: "subrace_dragonborn_black",
    name: "Black Dragon Ancestry",
    description:
      "Your lineage traces back to a Black Dragon, granting you resistance to acid damage and an acid breath weapon.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "acid",
          level: "resistance",
          bypassedBy: [],
          requiredStates: [],
        },
      ],
      choices: [],
    },
    resources: [
      {
        id: "dragonborn_breath_charge",
        name: "Breath Weapon",
        maxCharges: 1,
        resetOn: "short_rest",
      },
    ],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [
      {
        id: "action_black_breath",
        name: "Acid Breath",
        activation: "action",
        consumesResource: "dragonborn_breath_charge",
        effect: {
          type: "save",
          areaOfEffect: {
            shape: "line",
            size: 30,
          },
          savingThrow: {
            targetStat: "DEX",
            dcCalculation: {
              base: 8,
              scalingStat: "CON",
              includeProficiency: true,
            },
            saveEffect: "half_damage",
          },
          damage: [
            {
              sourceName: "Black Dragon Breath",
              baseDice: "2d6",
              damageType: "acid",
              scalingMode: "total_level",
              levelScaling: [
                {
                  levelRequired: 6,
                  newDice: "3d6",
                },
                {
                  levelRequired: 11,
                  newDice: "4d6",
                },
                {
                  levelRequired: 16,
                  newDice: "5d6",
                },
              ],
            },
          ],
        },
      },
    ],
  },
  subrace_dragonborn_blue: {
    id: "subrace_dragonborn_blue",
    name: "Blue Dragon Ancestry",
    description:
      "Your lineage traces back to a Blue Dragon, granting you resistance to lightning damage and a lightning breath weapon.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "lightning",
          level: "resistance",
          bypassedBy: [],
          requiredStates: [],
        },
      ],
      choices: [],
    },
    resources: [
      {
        id: "dragonborn_breath_charge",
        name: "Breath Weapon",
        maxCharges: 1,
        resetOn: "short_rest",
      },
    ],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [
      {
        id: "action_blue_breath",
        name: "Lightning Breath",
        activation: "action",
        consumesResource: "dragonborn_breath_charge",
        effect: {
          type: "save",
          areaOfEffect: {
            shape: "line",
            size: 30,
          },
          savingThrow: {
            targetStat: "DEX",
            dcCalculation: {
              base: 8,
              scalingStat: "CON",
              includeProficiency: true,
            },
            saveEffect: "half_damage",
          },
          damage: [
            {
              sourceName: "Blue Dragon Breath",
              baseDice: "2d6",
              damageType: "lightning",
              scalingMode: "total_level",
              levelScaling: [
                {
                  levelRequired: 6,
                  newDice: "3d6",
                },
                {
                  levelRequired: 11,
                  newDice: "4d6",
                },
                {
                  levelRequired: 16,
                  newDice: "5d6",
                },
              ],
            },
          ],
        },
      },
    ],
  },
  subrace_dragonborn_brass: {
    id: "subrace_dragonborn_brass",
    name: "Brass Dragon Ancestry",
    description:
      "Your lineage traces back to a Brass Dragon, granting you resistance to fire damage and a fire breath weapon.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "fire",
          level: "resistance",
          bypassedBy: [],
          requiredStates: [],
        },
      ],
      choices: [],
    },
    resources: [
      {
        id: "dragonborn_breath_charge",
        name: "Breath Weapon",
        maxCharges: 1,
        resetOn: "short_rest",
      },
    ],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [
      {
        id: "action_brass_breath",
        name: "Fire Breath",
        activation: "action",
        consumesResource: "dragonborn_breath_charge",
        effect: {
          type: "save",
          areaOfEffect: {
            shape: "line",
            size: 30,
          },
          savingThrow: {
            targetStat: "DEX",
            dcCalculation: {
              base: 8,
              scalingStat: "CON",
              includeProficiency: true,
            },
            saveEffect: "half_damage",
          },
          damage: [
            {
              sourceName: "Brass Dragon Breath",
              baseDice: "2d6",
              damageType: "fire",
              scalingMode: "total_level",
              levelScaling: [
                {
                  levelRequired: 6,
                  newDice: "3d6",
                },
                {
                  levelRequired: 11,
                  newDice: "4d6",
                },
                {
                  levelRequired: 16,
                  newDice: "5d6",
                },
              ],
            },
          ],
        },
      },
    ],
  },
  subrace_dragonborn_bronze: {
    id: "subrace_dragonborn_bronze",
    name: "Bronze Dragon Ancestry",
    description:
      "Your lineage traces back to a Bronze Dragon, granting you resistance to lightning damage and a lightning breath weapon.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "lightning",
          level: "resistance",
          bypassedBy: [],
          requiredStates: [],
        },
      ],
      choices: [],
    },
    resources: [
      {
        id: "dragonborn_breath_charge",
        name: "Breath Weapon",
        maxCharges: 1,
        resetOn: "short_rest",
      },
    ],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [
      {
        id: "action_bronze_breath",
        name: "Lightning Breath",
        activation: "action",
        consumesResource: "dragonborn_breath_charge",
        effect: {
          type: "save",
          areaOfEffect: {
            shape: "line",
            size: 30,
          },
          savingThrow: {
            targetStat: "DEX",
            dcCalculation: {
              base: 8,
              scalingStat: "CON",
              includeProficiency: true,
            },
            saveEffect: "half_damage",
          },
          damage: [
            {
              sourceName: "Bronze Dragon Breath",
              baseDice: "2d6",
              damageType: "lightning",
              scalingMode: "total_level",
              levelScaling: [
                {
                  levelRequired: 6,
                  newDice: "3d6",
                },
                {
                  levelRequired: 11,
                  newDice: "4d6",
                },
                {
                  levelRequired: 16,
                  newDice: "5d6",
                },
              ],
            },
          ],
        },
      },
    ],
  },
  subrace_dragonborn_copper: {
    id: "subrace_dragonborn_copper",
    name: "Copper Dragon Ancestry",
    description:
      "Your lineage traces back to a Copper Dragon, granting you resistance to acid damage and an acid breath weapon.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "acid",
          level: "resistance",
          bypassedBy: [],
          requiredStates: [],
        },
      ],
      choices: [],
    },
    resources: [
      {
        id: "dragonborn_breath_charge",
        name: "Breath Weapon",
        maxCharges: 1,
        resetOn: "short_rest",
      },
    ],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [
      {
        id: "action_copper_breath",
        name: "Acid Breath",
        activation: "action",
        consumesResource: "dragonborn_breath_charge",
        effect: {
          type: "save",
          areaOfEffect: {
            shape: "line",
            size: 30,
          },
          savingThrow: {
            targetStat: "DEX",
            dcCalculation: {
              base: 8,
              scalingStat: "CON",
              includeProficiency: true,
            },
            saveEffect: "half_damage",
          },
          damage: [
            {
              sourceName: "Copper Dragon Breath",
              baseDice: "2d6",
              damageType: "acid",
              scalingMode: "total_level",
              levelScaling: [
                {
                  levelRequired: 6,
                  newDice: "3d6",
                },
                {
                  levelRequired: 11,
                  newDice: "4d6",
                },
                {
                  levelRequired: 16,
                  newDice: "5d6",
                },
              ],
            },
          ],
        },
      },
    ],
  },
  subrace_dragonborn_gold: {
    id: "subrace_dragonborn_gold",
    name: "Gold Dragon Ancestry",
    description:
      "Your lineage traces back to a Gold Dragon, granting you resistance to fire damage and a fiery breath weapon.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "fire",
          level: "resistance",
          bypassedBy: [],
          requiredStates: [],
        },
      ],
      choices: [],
    },
    resources: [
      {
        id: "dragonborn_breath_charge",
        name: "Breath Weapon",
        maxCharges: 1,
        resetOn: "short_rest",
      },
    ],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [
      {
        id: "action_gold_breath",
        name: "Fire Breath",
        activation: "action",
        consumesResource: "dragonborn_breath_charge",
        effect: {
          type: "save",
          areaOfEffect: {
            shape: "cone",
            size: 15,
          },
          savingThrow: {
            targetStat: "DEX",
            dcCalculation: {
              base: 8,
              scalingStat: "CON",
              includeProficiency: true,
            },
            saveEffect: "half_damage",
          },
          damage: [
            {
              sourceName: "Gold Dragon Breath",
              baseDice: "2d6",
              damageType: "fire",
              scalingMode: "total_level",
              levelScaling: [
                {
                  levelRequired: 6,
                  newDice: "3d6",
                },
                {
                  levelRequired: 11,
                  newDice: "4d6",
                },
                {
                  levelRequired: 16,
                  newDice: "5d6",
                },
              ],
            },
          ],
        },
      },
    ],
  },
  subrace_dragonborn_green: {
    id: "subrace_dragonborn_green",
    name: "Green Dragon Ancestry",
    description:
      "Your lineage traces back to a Green Dragon, granting you resistance to poison damage and a poison breath weapon.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "poison",
          level: "resistance",
          bypassedBy: [],
          requiredStates: [],
        },
      ],
      choices: [],
    },
    resources: [
      {
        id: "dragonborn_breath_charge",
        name: "Breath Weapon",
        maxCharges: 1,
        resetOn: "short_rest",
      },
    ],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [
      {
        id: "action_green_breath",
        name: "Poison Breath",
        activation: "action",
        consumesResource: "dragonborn_breath_charge",
        effect: {
          type: "save",
          areaOfEffect: {
            shape: "cone",
            size: 15,
          },
          savingThrow: {
            targetStat: "CON",
            dcCalculation: {
              base: 8,
              scalingStat: "CON",
              includeProficiency: true,
            },
            saveEffect: "half_damage",
          },
          damage: [
            {
              sourceName: "Green Dragon Breath",
              baseDice: "2d6",
              damageType: "poison",
              scalingMode: "total_level",
              levelScaling: [
                {
                  levelRequired: 6,
                  newDice: "3d6",
                },
                {
                  levelRequired: 11,
                  newDice: "4d6",
                },
                {
                  levelRequired: 16,
                  newDice: "5d6",
                },
              ],
            },
          ],
        },
      },
    ],
  },
  subrace_dragonborn_red: {
    id: "subrace_dragonborn_red",
    name: "Red Dragon Ancestry",
    description:
      "Your lineage traces back to a Red Dragon, granting you resistance to fire damage and a fire breath weapon.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "fire",
          level: "resistance",
          bypassedBy: [],
          requiredStates: [],
        },
      ],
      choices: [],
    },
    resources: [
      {
        id: "dragonborn_breath_charge",
        name: "Breath Weapon",
        maxCharges: 1,
        resetOn: "short_rest",
      },
    ],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [
      {
        id: "action_red_breath",
        name: "Fire Breath",
        activation: "action",
        consumesResource: "dragonborn_breath_charge",
        effect: {
          type: "save",
          areaOfEffect: {
            shape: "cone",
            size: 15,
          },
          savingThrow: {
            targetStat: "DEX",
            dcCalculation: {
              base: 8,
              scalingStat: "CON",
              includeProficiency: true,
            },
            saveEffect: "half_damage",
          },
          damage: [
            {
              sourceName: "Red Dragon Breath",
              baseDice: "2d6",
              damageType: "fire",
              scalingMode: "total_level",
              levelScaling: [
                {
                  levelRequired: 6,
                  newDice: "3d6",
                },
                {
                  levelRequired: 11,
                  newDice: "4d6",
                },
                {
                  levelRequired: 16,
                  newDice: "5d6",
                },
              ],
            },
          ],
        },
      },
    ],
  },
  subrace_dragonborn_silver: {
    id: "subrace_dragonborn_silver",
    name: "Silver Dragon Ancestry",
    description:
      "Your lineage traces back to a Silver Dragon, granting you resistance to cold damage and a cold breath weapon.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "cold",
          level: "resistance",
          bypassedBy: [],
          requiredStates: [],
        },
      ],
      choices: [],
    },
    resources: [
      {
        id: "dragonborn_breath_charge",
        name: "Breath Weapon",
        maxCharges: 1,
        resetOn: "short_rest",
      },
    ],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [
      {
        id: "action_silver_breath",
        name: "Cold Breath",
        activation: "action",
        consumesResource: "dragonborn_breath_charge",
        effect: {
          type: "save",
          areaOfEffect: {
            shape: "cone",
            size: 15,
          },
          savingThrow: {
            targetStat: "CON",
            dcCalculation: {
              base: 8,
              scalingStat: "CON",
              includeProficiency: true,
            },
            saveEffect: "half_damage",
          },
          damage: [
            {
              sourceName: "Silver Dragon Breath",
              baseDice: "2d6",
              damageType: "cold",
              scalingMode: "total_level",
              levelScaling: [
                {
                  levelRequired: 6,
                  newDice: "3d6",
                },
                {
                  levelRequired: 11,
                  newDice: "4d6",
                },
                {
                  levelRequired: 16,
                  newDice: "5d6",
                },
              ],
            },
          ],
        },
      },
    ],
  },
  subrace_dragonborn_white: {
    id: "subrace_dragonborn_white",
    name: "White Dragon Ancestry",
    description:
      "Your lineage traces back to a White Dragon, granting you resistance to cold damage and a cold breath weapon.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "cold",
          level: "resistance",
          bypassedBy: [],
          requiredStates: [],
        },
      ],
      choices: [],
    },
    resources: [
      {
        id: "dragonborn_breath_charge",
        name: "Breath Weapon",
        maxCharges: 1,
        resetOn: "short_rest",
      },
    ],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [
      {
        id: "action_silver_breath",
        name: "Cold Breath",
        activation: "action",
        consumesResource: "dragonborn_breath_charge",
        effect: {
          type: "save",
          areaOfEffect: {
            shape: "cone",
            size: 15,
          },
          savingThrow: {
            targetStat: "CON",
            dcCalculation: {
              base: 8,
              scalingStat: "CON",
              includeProficiency: true,
            },
            saveEffect: "half_damage",
          },
          damage: [
            {
              sourceName: "White Dragon Breath",
              baseDice: "2d6",
              damageType: "cold",
              scalingMode: "total_level",
              levelScaling: [
                {
                  levelRequired: 6,
                  newDice: "3d6",
                },
                {
                  levelRequired: 11,
                  newDice: "4d6",
                },
                {
                  levelRequired: 16,
                  newDice: "5d6",
                },
              ],
            },
          ],
        },
      },
    ],
  },
  race_dragonborn_languages: {
    id: "race_dragonborn_languages",
    name: "(Dragonborn) Languages",
    description:
      "You can speak, read, and write Common and Draconic. Draconic is thought to be one of the oldest languages and is often used in the study of magic. The language sounds harsh to most other creatures and includes numerous hard consonants and sibilants.",
    modifiers: { fixed: [], choices: [] },
    proficiencies: {
      fixed: [
        {
          category: "languages",
          proficiencyId: "common",
          level: "proficient",
          requiredStates: [],
        },
        {
          category: "languages",
          proficiencyId: "draconic",
          level: "proficient",
          requiredStates: [],
        },
      ],
      choices: [],
    },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
};
