import type { SpellDefinition } from "@project/shared";

export const SPELL_DICTIONARY: Record<string, SpellDefinition> = {
  spell_fire_bolt: {
    id: "spell_fire_bolt",
    name: "Fire Bolt",
    level: 0,
    school: "evocation",
    isRitual: false,
    action: {
      id: "action_spell_fire_bolt",
      name: "Fire Bolt",
      activation: "action",
      effect: {
        type: "attack",
        attackType: "ranged_spell",
        attackStat: "SPELLCASTING_MOD",
        range: 120,
        damage: [
          {
            sourceName: "Fire Bolt",
            baseDice: "1d10",
            damageType: "fire",
            scalingMode: "total_level",
            levelScaling: [
              { levelRequired: 5, newDice: "2d10" },
              { levelRequired: 11, newDice: "3d10" },
              { levelRequired: 17, newDice: "4d10" },
            ],
          },
        ],
      },
    },
  },

  spell_burning_hands: {
    id: "spell_burning_hands",
    name: "Burning Hands",
    level: 1,
    school: "evocation",
    isRitual: false,
    action: {
      id: "action_spell_burning_hands",
      name: "Burning Hands",
      activation: "action",
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
            scalingStat: "SPELLCASTING_MOD",
            includeProficiency: true,
          },
          saveEffect: "half_damage",
        },
        damage: [
          {
            sourceName: "Burning Hands",
            baseDice: "3d6",
            damageType: "fire",
            scalingMode: "none",
            levelScaling: [],
          },
        ],
      },
    },
  },
  
  spell_cone_of_cold: {
    id: "spell_cone_of_cold",
    name: "Cone of Cold",
    level: 5,
    school: "evocation",
    isRitual: false,
    action: {
      id: "action_spell_cone_of_cold",
      name: "Cone of Cold",
      activation: "action",
      effect: {
        type: "save",
        areaOfEffect: {
          shape: "cone",
          size: 60,
        },
        savingThrow: {
          targetStat: "CON",
          dcCalculation: {
            base: 8,
            scalingStat: "SPELLCASTING_MOD",
            includeProficiency: true,
          },
          saveEffect: "half_damage",
        },
        damage: [
          {
            sourceName: "Cone of Cold",
            baseDice: "8d8",
            damageType: "cold",
            scalingMode: "none",
            levelScaling: [],
          },
        ],
      },
    },
  },
};
