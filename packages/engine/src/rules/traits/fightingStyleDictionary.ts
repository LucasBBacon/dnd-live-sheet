import type { TraitDefinition } from "@project/shared";

/**
 * Fighting styles, shared by fighter, paladin and ranger (and handed out a
 * second time by the Champion at level 10). Each class offers a different
 * subset, so the options live on the trait_choice node in each class file
 * rather than here.
 *
 * Ids follow the ones the old progression dictionary already referenced
 * (trait_fs_archery, trait_fs_defense, trait_fs_dueling).
 *
 * These introduce four new state strings - action_ranged_attack,
 * status_wearing_armor, status_wielding_one_handed_only and
 * status_wielding_two_handed - alongside the existing action_melee_attack.
 */
export const FIGHTING_STYLE_TRAITS: Record<string, TraitDefinition> = {
  trait_fs_archery: {
    id: "trait_fs_archery",
    name: "Fighting Style: Archery",
    description:
      "You gain a +2 bonus to attack rolls you make with ranged weapons.",
    modifiers: {
      fixed: [
        {
          target: "ATTACK_BONUS",
          type: "add",
          value: 2,
          scalingFactor: "none",
          requiredStates: ["action_ranged_attack"],
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
  trait_fs_defense: {
    id: "trait_fs_defense",
    name: "Fighting Style: Defense",
    description: "While you are wearing armor, you gain a +1 bonus to AC.",
    modifiers: {
      fixed: [
        {
          target: "ARMOR_CLASS",
          type: "add",
          value: 1,
          scalingFactor: "none",
          requiredStates: ["status_wearing_armor"],
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
  trait_fs_dueling: {
    id: "trait_fs_dueling",
    name: "Fighting Style: Dueling",
    description:
      "When you are wielding a melee weapon in one hand and no other weapons, you gain a +2 bonus to damage rolls with that weapon.",
    modifiers: {
      fixed: [
        {
          target: "DAMAGE_BONUS",
          type: "add",
          value: 2,
          scalingFactor: "none",
          requiredStates: [
            "action_melee_attack",
            "status_wielding_one_handed_only",
          ],
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
  trait_fs_great_weapon_fighting: {
    id: "trait_fs_great_weapon_fighting",
    name: "Fighting Style: Great Weapon Fighting",
    description:
      "When you roll a 1 or 2 on a damage die for an attack you make with a melee weapon that you are wielding with two hands, you can reroll the die and must use the new roll, even if the new roll is a 1 or a 2. The weapon must have the two-handed or versatile property for you to gain this benefit.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [
      {
        target: "DAMAGE_ROLL",
        requiredStates: ["action_melee_attack", "status_wielding_two_handed"],
        mutator: { type: "reroll_once", triggerOn: [1, 2] },
      },
    ],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_fs_protection: {
    id: "trait_fs_protection",
    name: "Fighting Style: Protection",
    description:
      "When a creature you can see attacks a target other than you that is within 5 feet of you, you can use your reaction to impose disadvantage on the attack roll. You must be wielding a shield.",
    // TODO: needs a reaction that targets someone else's attack roll; neither
    // triggers nor actions can point at another creature's roll yet.
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_fs_two_weapon_fighting: {
    id: "trait_fs_two_weapon_fighting",
    name: "Fighting Style: Two-Weapon Fighting",
    description:
      "When you engage in two-weapon fighting, you can add your ability modifier to the damage of the second attack.",
    modifiers: {
      fixed: [
        {
          target: "DAMAGE_BONUS",
          type: "add",
          value: 0,
          valueSource: "governing_stat_modifier",
          scalingFactor: "none",
          requiredStates: ["offhand_attack", "two_weapon_fighting_style"],
          forbiddenStates: [],
          attackContext: "off_hand",
        },
      ],
      choices: [],
    },
    grantedStates: ["two_weapon_fighting_style"],
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
};
