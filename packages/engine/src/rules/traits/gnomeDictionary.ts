import type { TraitDefinition } from "@project/shared";

export const GNOME_TRAITS: Record<string, TraitDefinition> = {
  race_gnome_asi: {
    id: "race_gnome_asi",
    name: "(Gnome) Ability Score Increase",
    description: "Your Intelligence score increases by 2.",
    modifiers: {
      fixed: [
        {
          target: "INT",
          type: "add",
          value: 2,
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
  race_gnome_darkvision: {
    id: "race_gnome_darkvision",
    name: "(Gnome) Darkvision",
    description:
      "Accustomed to life underground, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.",
    modifiers: {
      fixed: [
        {
          target: "SENSE_DARKVISION",
          type: "set_base",
          value: 60,
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
  gnome_cunning: {
    id: "gnome_cunning",
    name: "Gnome Cunning",
    description:
      "You have advantage on all Intelligence, Wisdom, and Charisma saving throws against magic.",
    modifiers: {
      fixed: [
        {
          target: "INT_SAVE",
          type: "advantage",
          value: 0,
          requiredStates: ["source_is_target"],
          scalingFactor: "none",
          forbiddenStates: [],
        },
        {
          target: "WIS_SAVE",
          type: "advantage",
          value: 0,
          requiredStates: ["source_is_target"],
          scalingFactor: "none",
          forbiddenStates: [],
        },
        {
          target: "CHA_SAVE",
          type: "advantage",
          value: 0,
          requiredStates: ["source_is_target"],
          scalingFactor: "none",
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
  race_gnome_languages: {
    id: "race_gnome_languages",
    name: "(Gnome) Languages",
    description:
      "You can speak, read, and write Common and Gnomish. The Gnomish language, which uses the Dwarvish script, is renowned for its technical treatises and its catalogs of knowledge about the natural world.",
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
          proficiencyId: "gnomish",
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
  subrace_gnome_forest_asi: {
    id: "subrace_gnome_forest_asi",
    name: "(Forest Gnome) Ability Score Increase",
    description: "Your Dexterity score increases by 1.",
    modifiers: {
      fixed: [
        {
          target: "DEX",
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
  natural_illusionist: {
    id: "natural_illusionist",
    name: "Natural Illusionist",
    description:
      "You know the minor illusion cantrip, Intelligence is your spellcasting ability for it.",
    modifiers: {
      fixed: [],
      choices: [],
      // TODO: Add cantrip / spells mechanics!!!!
    },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  speak_with_small_beasts: {
    id: "speak_with_small_beasts",
    name: "Speak with Small Beasts",
    description:
      "Through sounds and gestures, you can communicate simple ideas with Small or smaller beasts. Forest gnomes love animals and often keep squirrels, badges, rabbits, moles, woodpeckers, and other creatures as beloved pets.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  subrace_gnome_rock_asi: {
    id: "subrace_gnome_rock_asi",
    name: "(Rock Gnome) Ability Score Increase",
    description: "Your Constitution score increases by 1.",
    modifiers: {
      fixed: [
        {
          target: "CON",
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
  artificers_lore: {
    id: "artificers_lore",
    name: "Artificer's Lore",
    description:
      "Whenever you make an Intelligence (History) check related to magic items, alchemical objects, or technological devices, you can add twice your proficiency bonus instead of any proficiency bonus you normally apply.",
    modifiers: { fixed: [], choices: [] },
    proficiencies: {
      fixed: [
        {
          category: "ability_check",
          proficiencyId: "int_history",
          level: "expertise",
          requiredStates: ["history_artificer_lore"],
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
  tinker: {
    id: "tinker",
    name: "Tinker",
    description:
      "You have proficiency with artisan's tools (tinker's tools). Using those tools, you can spend 1 hour and 10 gp worth of materials to construct a Tiny clockwork device (AC 5, 1 hp). The device ceases to function after 24 hours (unless you spend 1 hour repairing it to keep the device functioning), or when you use your action to dismantle it; at that time, you can reclaim the materials used to create it. You can have up to three such devices active at a time.\nWhen you create a device, choose one of the following options:\nClockwork Toy. This toy is a clockwork animal, monster, or person, such as a frog, mouse, bird, dragon, or soldier. When placed on the ground, the toy moves 5 feet across the ground on each of your turns in a random direction. It makes noises as appropriate to the creature it represents.\nFire Starter. The device produces a miniature flame, which you can use to light a candle, torch, or campfire. Using the device requires your action.\nMusic Box. When opened, this music box plays a single song at a moderate volume. The box stops playing when it reaches the song's end or when it is closed.",
    modifiers: { fixed: [], choices: [] }, // TODO: Tinker toys addition (may tracking different entities?)
    proficiencies: {
      fixed: [
        {
          category: "tools",
          proficiencyId: "artisans_tools",
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
    actions: [
      {
        id: "action_tinker_construct",
        name: "Construct CLockwork Device",
        activation: "hour",
        effect: {
          type: "summon",
          entityTemplateIds: [
            "actor_clockwork_toy",
            "actor_fire_starter",
            "actor_music_box",
          ],
          maxActive: 3,
          durationHours: 24,
          materialCostGP: 10,
          // TODO: Dismantle action in the toy's actor sheet
        },
      },
    ],
  },
};
