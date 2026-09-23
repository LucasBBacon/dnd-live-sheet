/**
 * Development fixture: ten scenario characters, seeded beside the ten in
 * seedSampleCharacters.ts by the same `db:seed:samples`.
 *
 * The first ten are a coverage set - between them they fill every slot,
 * reset condition and hit point state. These ten are each staged for a hand
 * check a unit test cannot reach: a level-up one level away, a divergence
 * that needs two tabs, a Tier 2 pass that has nothing to verify against yet,
 * or data the UI cannot create. docs/development/sample-characters.md holds
 * the script for each one, and every `testFocus` names the backlog items it
 * exercises.
 *
 * Two are broken on purpose. Brother Mote's level column disagrees with his
 * ledger and several of his totals sit above their maxima; Orrik Stonehide's
 * race and subclass are content the pack does not author. Neither is a
 * mistake to tidy up.
 *
 * Ability scores are stored pre-racial (#73) and include every ability score
 * increase already taken. maxHp is base rolled hit points (#78): the first
 * level's full die, then the average after it.
 */
import type {
  SampleBackground,
  SampleCharacter,
  SampleItem,
  SampleRace,
  SampleSubclass,
} from "./seedSampleCharacters.js";

// #region Reference Stubs

const SCENARIO_RACES: SampleRace[] = [];

const SCENARIO_SUBCLASSES: SampleSubclass[] = [];

const SCENARIO_BACKGROUNDS: SampleBackground[] = [];

const SCENARIO_ITEMS: SampleItem[] = [];

// #endregion

// #region Roster

const SCENARIO_ROSTER: SampleCharacter[] = [
  {
    id: "00000000-0000-0000-0000-000000000120",
    name: "Quill Ashgrove",
    raceId: "race_gnome",
    subraceId: "subrace_gnome_forest",
    classes: [{ classId: "class_rogue", classLevel: 2 }],
    backgroundId: "background_folk_hero",
    choices: {
      feats: [],
      classSelections: {},
      traitSelections: {
        rogue_starting_skills: [
          "deception",
          "investigation",
          "perception",
          "stealth",
        ],
      },
    },
    alignment: "Neutral Good",
    str: 8,
    dex: 15,
    con: 14,
    int: 13,
    wis: 12,
    cha: 10,
    maxHp: 13,
    currentHp: 17,
    testFocus:
      "Staging: level to 3 for Arcane Trickster (#65b, #31a); Expertise and Sneak Attack absent (#66); Folk Hero grants nothing (#70).",
    personalityTraits:
      "I narrate my own heists under my breath, with footnotes.",
    ideals: "Curiosity. A lock is a question somebody forgot to answer.",
    bonds: "The village that hid me from the reeve still leaves a lamp lit.",
    flaws: "I will open the one door everybody agreed to leave shut.",
    traits: [
      {
        traitId: "trait_rogue_prof_saving_throw",
        source: "class_rogue_level_1",
      },
      { traitId: "trait_rogue_prof_armor", source: "class_rogue_level_1" },
      { traitId: "trait_rogue_prof_weapons", source: "class_rogue_level_1" },
      { traitId: "trait_rogue_prof_tools", source: "class_rogue_level_1" },
      { traitId: "trait_rogue_prof_skills", source: "class_rogue_level_1" },
      { traitId: "trait_expertise", source: "class_rogue_level_1" },
      { traitId: "trait_sneak_attack", source: "class_rogue_level_1" },
      { traitId: "trait_thieves_cant", source: "class_rogue_level_1" },
      { traitId: "trait_cunning_action", source: "class_rogue_level_2" },
      { traitId: "race_gnome_asi", source: "race_gnome" },
      { traitId: "race_gnome_darkvision", source: "race_gnome" },
      { traitId: "gnome_cunning", source: "race_gnome" },
      { traitId: "race_gnome_languages", source: "race_gnome" },
      { traitId: "subrace_gnome_forest_asi", source: "subrace_gnome_forest" },
      { traitId: "natural_illusionist", source: "subrace_gnome_forest" },
      { traitId: "speak_with_small_beasts", source: "subrace_gnome_forest" },
    ],
    inventory: [
      { itemId: "item_armor_leather", slot: "body" },
      { itemId: "item_weapon_shortsword", slot: "main_hand" },
      { itemId: "item_weapon_shortbow" },
      { itemId: "item_ammo_arrow", quantity: 20 },
      { itemId: "item_tool_thieves_tools" },
      { itemId: "item_pack_burglars" },
      { itemId: "item_potion_healing" },
    ],
    resources: [
      {
        id: "resource_hit_dice_d8",
        name: "Hit Dice (d8)",
        current: 2,
        max: 2,
        resetCondition: "long_rest_half",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000121",
    name: "Brannoc Hale",
    raceId: "race_dwarf",
    subraceId: "subrace_dwarf_hill",
    classes: [
      {
        classId: "class_fighter",
        classLevel: 3,
        subclassId: "subclass_fighter_champion",
      },
    ],
    backgroundId: "background_soldier",
    choices: {
      feats: [],
      classSelections: {
        class_fighter: { fighter_level_1_fighting_style: ["trait_fs_dueling"] },
      },
      traitSelections: {
        dwarf_artisan_tools: ["masons_tools"],
        soldier_gaming_set: ["playing_card_set"],
        fighter_starting_skills: ["perception", "survival"],
      },
    },
    alignment: "Lawful Good",
    str: 16,
    dex: 12,
    con: 13,
    int: 10,
    wis: 12,
    cha: 8,
    maxHp: 22,
    currentHp: 31,
    testFocus:
      "Staging: level to 4 with +1 CON for the review-step gap (#88) and a double-clicked submit (#94); Dueling never applies (#24).",
    personalityTraits: "I count everything twice: exits, coins, friends.",
    ideals: "Responsibility. I do what I said, then I say what I did.",
    bonds: "My company's banner hangs in a hall I have not been back to.",
    flaws: "I take an order from anyone who sounds like a sergeant.",
    traits: [
      {
        traitId: "trait_fighter_prof_saving_throw",
        source: "class_fighter_level_1",
      },
      { traitId: "trait_fighter_prof_armor", source: "class_fighter_level_1" },
      {
        traitId: "trait_fighter_prof_weapons",
        source: "class_fighter_level_1",
      },
      { traitId: "trait_fighter_prof_skills", source: "class_fighter_level_1" },
      { traitId: "trait_second_wind", source: "class_fighter_level_1" },
      { traitId: "trait_action_surge", source: "class_fighter_level_2" },
      { traitId: "trait_martial_archetype", source: "class_fighter_level_3" },
      {
        traitId: "trait_improved_critical",
        source: "subclass_fighter_champion_level_3",
      },
      { traitId: "race_dwarf_asi", source: "race_dwarf" },
      { traitId: "race_dwarf_darkvision", source: "race_dwarf" },
      { traitId: "dwarven_resilience", source: "race_dwarf" },
      { traitId: "dwarven_combat_training", source: "race_dwarf" },
      { traitId: "tool_proficiency", source: "race_dwarf" },
      { traitId: "stonecutting", source: "race_dwarf" },
      { traitId: "race_dwarf_languages", source: "race_dwarf" },
      { traitId: "subrace_dwarf_hill_asi", source: "subrace_dwarf_hill" },
      { traitId: "dwarven_toughness", source: "subrace_dwarf_hill" },
    ],
    inventory: [
      { itemId: "item_armor_chain_mail", slot: "body" },
      // the off hand stays empty: Dueling asks for one weapon and nothing else
      { itemId: "item_weapon_longsword", slot: "main_hand" },
      { itemId: "item_weapon_crossbow_light" },
      { itemId: "item_ammo_bolt", quantity: 20 },
      { itemId: "item_pack_dungeoneers" },
      { itemId: "item_potion_healing" },
    ],
    resources: [
      {
        id: "trait_second_wind",
        name: "Second Wind",
        current: 1,
        max: 1,
        resetCondition: "short_rest",
      },
      {
        id: "trait_action_surge",
        name: "Action Surge",
        current: 1,
        max: 1,
        resetCondition: "short_rest",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000122",
    name: "Isolde Varn",
    raceId: "race_elf",
    subraceId: "subrace_elf_high",
    classes: [
      {
        classId: "class_warlock",
        classLevel: 4,
        subclassId: "subclass_warlock_archfey",
      },
    ],
    backgroundId: "background_noble",
    choices: {
      // the level-4 increase, taken as a feat: the first on any sample
      feats: ["feat_alert"],
      classSelections: {
        class_warlock: {
          warlock_level_2_invocations: [
            "trait_invocation_beast_speech",
            "trait_invocation_eldritch_sight",
          ],
          warlock_level_3_pact_boon: ["trait_pact_of_the_chain"],
        },
      },
      traitSelections: {
        elf_high_choice_extra_lang: ["sylvan"],
        // a pack spell that stays a wizard cantrip once #31a gives spells levels
        high_elf_cantrip: ["spell_minor_illusion"],
        noble_gaming_set: ["three_dragon_ante_set"],
        noble_language: ["celestial"],
        warlock_starting_skills: ["arcana", "deception"],
      },
    },
    alignment: "Chaotic Neutral",
    str: 8,
    dex: 14,
    con: 14,
    int: 12,
    wis: 10,
    cha: 15,
    maxHp: 23,
    currentHp: 20,
    testFocus:
      "Staging: level to 5 for invocation prerequisites against Pact of the Chain (#81); Alert reaches initiative; no familiar actor (#36).",
    personalityTraits: "I thank the air before I speak to it, and it answers.",
    ideals: "Freedom. A bargain is only as good as the way out of it.",
    bonds: "The Summer Court holds a promise I made at nine years old.",
    flaws: "I cannot refuse a wager, least of all one I should.",
    traits: [
      {
        traitId: "trait_warlock_prof_saving_throw",
        source: "class_warlock_level_1",
      },
      { traitId: "trait_warlock_prof_armor", source: "class_warlock_level_1" },
      {
        traitId: "trait_warlock_prof_weapons",
        source: "class_warlock_level_1",
      },
      { traitId: "trait_warlock_prof_skills", source: "class_warlock_level_1" },
      { traitId: "trait_otherworldly_patron", source: "class_warlock_level_1" },
      { traitId: "trait_pact_magic", source: "class_warlock_level_1" },
      {
        traitId: "trait_archfey_expanded_spells",
        source: "subclass_warlock_archfey_level_1",
      },
      {
        traitId: "trait_fey_presence",
        source: "subclass_warlock_archfey_level_1",
      },
      { traitId: "race_elf_asi", source: "race_elf" },
      { traitId: "race_elf_darkvision", source: "race_elf" },
      { traitId: "keen_senses", source: "race_elf" },
      { traitId: "fey_ancestry", source: "race_elf" },
      { traitId: "trance", source: "race_elf" },
      { traitId: "race_elf_languages", source: "race_elf" },
      { traitId: "subrace_elf_high_asi", source: "subrace_elf_high" },
      { traitId: "elf_weapon_training", source: "subrace_elf_high" },
      { traitId: "subrace_elf_high_cantrip", source: "subrace_elf_high" },
      {
        traitId: "subrace_elf_high_extra_language",
        source: "subrace_elf_high",
      },
    ],
    inventory: [
      { itemId: "item_armor_leather", slot: "body" },
      { itemId: "item_weapon_dagger", slot: "main_hand" },
      { itemId: "item_focus_rod" },
      { itemId: "item_gear_component_pouch" },
      { itemId: "item_clothes_fine" },
      { itemId: "item_ring_signet" },
      { itemId: "item_scroll_pedigree" },
    ],
    resources: [
      {
        id: "pact_slots",
        name: "Pact Magic Slots",
        current: 1,
        max: 2,
        resetCondition: "short_rest",
      },
    ],
  },
];

// #endregion

export {
  SCENARIO_BACKGROUNDS,
  SCENARIO_ITEMS,
  SCENARIO_RACES,
  SCENARIO_ROSTER,
  SCENARIO_SUBCLASSES,
};
