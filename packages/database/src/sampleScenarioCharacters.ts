/**
 * Development fixture: eleven scenario characters, seeded beside the ten in
 * seedSampleCharacters.ts by the same `db:seed:samples`.
 *
 * The first ten are a coverage set - between them they fill every slot,
 * reset condition and hit point state. These eleven are each staged for a hand
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

/** A race the pack does not author, so the sheet meets one it cannot resolve. */
const SCENARIO_RACES: SampleRace[] = [
  {
    id: "race_goliath",
    name: "Goliath",
    speed: 30,
    shortDescription:
      "Mountain-born wanderers who keep score of everything, themselves included.",
  },
];

const SCENARIO_SUBCLASSES: SampleSubclass[] = [
  {
    id: "subclass_fighter_rune_knight",
    parentClassId: "class_fighter",
    name: "Rune Knight",
    shortDescription:
      "A fighter who carves giants' runes into their gear and grows to match them.",
  },
];

const SCENARIO_BACKGROUNDS: SampleBackground[] = [
  {
    id: "background_hermit",
    name: "Hermit",
    featureName: "Discovery",
    featureDescription:
      "The quiet of your seclusion gave you access to a unique and powerful discovery.",
    shortDescription: "You lived in seclusion for a formative part of your life.",
  },
];

/**
 * Two magic items the item schema cannot fully express: the greatsword's
 * cold rider is description only, and the belt has no slot to go in, so it
 * sits attuned in the backpack.
 */
const SCENARIO_ITEMS: SampleItem[] = [
  {
    id: "item_weapon_frost_brand_greatsword",
    name: "Frost Brand Greatsword",
    pounds: 6,
    description:
      "A hit deals an extra 1d6 cold damage, and you have resistance to fire damage while you hold it.",
    itemRule: {
      type: "weapon",
      equipSlot: "main_hand",
      requiresAttunement: true,
      categoryTags: ["category_weapon_martial", "category_weapon_martial_melee"],
    },
    weaponRule: {
      category: "martial_melee",
      damageDice: "2d6",
      damageType: "slashing",
      properties: ["heavy", "two_handed"],
      range: 5,
    },
  },
  {
    id: "item_wondrous_belt_of_hill_giant_strength",
    name: "Belt of Hill Giant Strength",
    pounds: 1,
    description:
      "Your Strength score is 21 while you wear this belt, unless it is already higher.",
    itemRule: {
      type: "wondrous",
      requiresAttunement: true,
      categoryTags: [],
      modifiers: [
        { target: "STR", type: "set_base", value: 21, scalingFactor: "none" },
      ],
    },
  },
];

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
      "Staging: level to 3 for Arcane Trickster (#65b, #31a); Expertise (#66) and Sneak Attack (#62) absent; Folk Hero grants nothing (#70).",
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
          // real warlock cantrips; Eldritch Blast is what #31b's live check
          // casts, one beam at 4 and two after her level-up to 5
          warlock_level_1_cantrips: ["spell_eldritch_blast", "spell_minor_illusion"],
          warlock_level_2_invocations: [
            "trait_invocation_beast_speech",
            "trait_invocation_eldritch_sight",
          ],
          warlock_level_3_pact_boon: ["trait_pact_of_the_chain"],
        },
      },
      traitSelections: {
        elf_high_choice_extra_lang: ["sylvan"],
        // a wizard cantrip with a material component, which the pouch she
        // carries covers: Dancing Lights casts without asking
        high_elf_cantrip: ["spell_dancing_lights"],
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
      "Staging: level to 5 for invocation prerequisites against Pact of the Chain (#81) and Eldritch Blast's second beam (#31b); a wizard dip that only final INT allows (#77); Alert reaches initiative; no familiar actor (#36).",
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
  {
    id: "00000000-0000-0000-0000-000000000123",
    name: "Ursk Gravemaw",
    raceId: "race_half_orc",
    classes: [
      {
        classId: "class_paladin",
        classLevel: 5,
        subclassId: "subclass_paladin_vengeance",
      },
    ],
    backgroundId: "background_criminal",
    choices: {
      // the level-4 increase, taken as a feat
      feats: ["feat_tough"],
      classSelections: {
        class_paladin: {
          paladin_level_2_fighting_style: ["trait_fs_great_weapon_fighting"],
        },
      },
      traitSelections: {
        criminal_gaming_set: ["three_dragon_ante_set"],
        paladin_starting_skills: ["athletics", "insight"],
      },
    },
    alignment: "Lawful Neutral",
    str: 15,
    dex: 10,
    con: 13,
    int: 8,
    wis: 10,
    cha: 14,
    maxHp: 34,
    currentHp: 6,
    testFocus:
      "Two tabs: low hit points with Relentless Endurance unspent (#92, #93); Tough per level.",
    personalityTraits: "I apologise to people after I have hit them, sincerely.",
    ideals: "Retribution. The ledger balances, one way or the other.",
    bonds: "The gang that raised me is the first name on my oath's list.",
    flaws: "I remember every slight, and I keep the list in order.",
    traits: [
      {
        traitId: "trait_paladin_prof_saving_throw",
        source: "class_paladin_level_1",
      },
      { traitId: "trait_paladin_prof_armor", source: "class_paladin_level_1" },
      {
        traitId: "trait_paladin_prof_weapons",
        source: "class_paladin_level_1",
      },
      { traitId: "trait_paladin_prof_skills", source: "class_paladin_level_1" },
      { traitId: "trait_divine_sense", source: "class_paladin_level_1" },
      { traitId: "trait_lay_on_hands", source: "class_paladin_level_1" },
      { traitId: "trait_divine_smite", source: "class_paladin_level_2" },
      { traitId: "trait_spellcasting_paladin", source: "class_paladin_level_2" },
      { traitId: "trait_divine_health", source: "class_paladin_level_3" },
      { traitId: "trait_sacred_oath", source: "class_paladin_level_3" },
      { traitId: "trait_extra_attack", source: "class_paladin_level_5" },
      {
        traitId: "trait_vengeance_oath_spells",
        source: "subclass_paladin_vengeance_level_3",
      },
      {
        traitId: "trait_cd_abjure_enemy",
        source: "subclass_paladin_vengeance_level_3",
      },
      {
        traitId: "trait_cd_vow_of_enmity",
        source: "subclass_paladin_vengeance_level_3",
      },
      { traitId: "race_half_orc_asi", source: "race_half_orc" },
      { traitId: "race_half_orc_darkvision", source: "race_half_orc" },
      { traitId: "menacing", source: "race_half_orc" },
      { traitId: "relentless_endurance", source: "race_half_orc" },
      { traitId: "savage_attacks", source: "race_half_orc" },
      { traitId: "race_half_orc_languages", source: "race_half_orc" },
    ],
    inventory: [
      { itemId: "item_armor_chain_mail", slot: "body" },
      { itemId: "item_weapon_greatsword", slot: "main_hand" },
      { itemId: "item_weapon_javelin", quantity: 5 },
      { itemId: "item_focus_emblem" },
      { itemId: "item_pack_explorers" },
      // the pack's potion, which carries a drink action that heals
      { itemId: "item_potion_of_healing", quantity: 2 },
    ],
    resources: [
      {
        // unspent on purpose: #92 needs the charge to fire once in each tab
        id: "resource_relentless_endurance",
        name: "Relentless Endurance Use",
        current: 1,
        max: 1,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_1",
        name: "1st-Level Spell Slots",
        current: 2,
        max: 4,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_2",
        name: "2nd-Level Spell Slots",
        current: 2,
        max: 2,
        resetCondition: "long_rest",
      },
      {
        id: "resource_hit_dice_d10",
        name: "Hit Dice (d10)",
        current: 3,
        max: 5,
        resetCondition: "long_rest_half",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000124",
    name: "Tamsin Burrowdeep",
    raceId: "race_halfling",
    subraceId: "subrace_halfling_stout",
    classes: [
      {
        classId: "class_barbarian",
        classLevel: 6,
        subclassId: "subclass_barbarian_totem_warrior",
      },
    ],
    backgroundId: "background_outlander",
    choices: {
      feats: [],
      classSelections: {
        class_barbarian: {
          barbarian_totem_level_3_totem_spirit: ["trait_totem_spirit_eagle"],
          barbarian_totem_level_6_aspect: ["trait_aspect_of_the_beast_eagle"],
        },
      },
      traitSelections: {
        barbarian_starting_skills: ["athletics", "perception"],
      },
    },
    alignment: "Chaotic Good",
    str: 16,
    dex: 14,
    con: 15,
    int: 8,
    wis: 12,
    cha: 8,
    maxHp: 47,
    currentHp: 30,
    testFocus:
      "Plate carried, not worn: Eagle Dash gated by heavy armour (#76, #97, #99); a second tab's equip and attune recompose the first (#101).",
    personalityTraits: "I climb whatever is tallest, then report back.",
    ideals: "Freedom. The sky does not ask anyone's leave.",
    bonds: "An eagle took my brother's lamb once. I have been chasing it since.",
    flaws: "I treat every closed door as a personal challenge.",
    traits: [
      {
        traitId: "trait_barbarian_prof_armor",
        source: "class_barbarian_level_1",
      },
      {
        traitId: "trait_barbarian_prof_weapons",
        source: "class_barbarian_level_1",
      },
      {
        traitId: "trait_barbarian_prof_saving_throw",
        source: "class_barbarian_level_1",
      },
      {
        traitId: "trait_barbarian_prof_skills",
        source: "class_barbarian_level_1",
      },
      { traitId: "trait_rage", source: "class_barbarian_level_1" },
      {
        traitId: "trait_unarmored_defense_barbarian",
        source: "class_barbarian_level_1",
      },
      { traitId: "trait_reckless_attack", source: "class_barbarian_level_2" },
      { traitId: "trait_danger_sense", source: "class_barbarian_level_2" },
      { traitId: "trait_extra_attack", source: "class_barbarian_level_5" },
      { traitId: "trait_fast_movement", source: "class_barbarian_level_5" },
      {
        traitId: "trait_spirit_seeker",
        source: "subclass_barbarian_totem_warrior_level_3",
      },
      { traitId: "race_halfling_asi", source: "race_halfling" },
      { traitId: "lucky", source: "race_halfling" },
      { traitId: "brave", source: "race_halfling" },
      { traitId: "halfling_nimbleness", source: "race_halfling" },
      { traitId: "race_halfling_languages", source: "race_halfling" },
      {
        traitId: "subrace_halfling_stout_asi",
        source: "subrace_halfling_stout",
      },
      { traitId: "stout_resilience", source: "subrace_halfling_stout" },
    ],
    inventory: [
      // body slot empty: Unarmoured Defence, and Eagle Dash while raging
      // a heavy weapon on a Small creature, which nothing models
      { itemId: "item_weapon_maul", slot: "main_hand" },
      // carried, not worn: equipping it is the live check
      { itemId: "item_armor_plate" },
      // worn but not attuned: attuning it from a second tab is the #101 check
      { itemId: "item_wondrous_cloak_of_protection", slot: "cloak" },
      { itemId: "item_weapon_javelin", quantity: 4 },
      { itemId: "item_pack_explorers" },
      { itemId: "item_potion_healing" },
    ],
    resources: [
      {
        id: "resource_barbarian_rage",
        name: "Rage",
        current: 2,
        max: 4,
        resetCondition: "long_rest",
      },
      {
        id: "resource_hit_dice_d12",
        name: "Hit Dice (d12)",
        current: 4,
        max: 6,
        resetCondition: "long_rest_half",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000125",
    name: "Hesk Mossgather",
    raceId: "race_human",
    classes: [
      {
        classId: "class_druid",
        classLevel: 8,
        subclassId: "subclass_druid_moon",
      },
    ],
    customBackgroundData: {
      name: "Grove Warden",
      featureName: "Standing Stones",
      featureDescription:
        "The keepers of the old groves know your face, and will hide you in the one place their hunters will not follow.",
    },
    // both carry a choice block no question ever asks (#80)
    customTraitIds: ["trait_acolyte_languages", "trait_soldier_prof_tools"],
    choices: {
      feats: [],
      classSelections: {},
      traitSelections: {
        human_language_choice: ["sylvan"],
        druid_starting_skills: ["animal_handling", "nature"],
      },
    },
    alignment: "True Neutral",
    str: 10,
    dex: 12,
    con: 14,
    int: 10,
    wis: 17,
    cha: 8,
    maxHp: 43,
    currentHp: 41,
    testFocus:
      "Wild Shape preview: its pool is stored but has no rule to show it (#62); slots with no spells listed (#83); an unasked custom-background choice (#80).",
    personalityTraits: "I talk to the weather as if it owed me money.",
    ideals: "Balance. The forest takes back what the town forgets it borrowed.",
    bonds: "The oak at Gallowmere is older than the kingdom and I am its keeper.",
    flaws: "I trust a wolf's word over a mayor's.",
    traits: [
      { traitId: "trait_druid_prof_saving_throw", source: "class_druid_level_1" },
      { traitId: "trait_druid_prof_armor", source: "class_druid_level_1" },
      { traitId: "trait_druid_prof_weapons", source: "class_druid_level_1" },
      { traitId: "trait_druid_prof_tools", source: "class_druid_level_1" },
      { traitId: "trait_druid_prof_skills", source: "class_druid_level_1" },
      { traitId: "trait_druidic", source: "class_druid_level_1" },
      { traitId: "trait_spellcasting_druid", source: "class_druid_level_1" },
      { traitId: "trait_wild_shape", source: "class_druid_level_2" },
      { traitId: "trait_druid_circle", source: "class_druid_level_2" },
      {
        traitId: "trait_wild_shape_improvement",
        source: "class_druid_level_4",
      },
      { traitId: "trait_druid_circle_feature", source: "class_druid_level_6" },
      {
        traitId: "trait_combat_wild_shape",
        source: "subclass_druid_moon_level_2",
      },
      { traitId: "trait_wild_form", source: "subclass_druid_moon_level_2" },
      { traitId: "trait_primal_strike", source: "subclass_druid_moon_level_6" },
      { traitId: "race_human_asi", source: "race_human" },
      { traitId: "race_human_languages", source: "race_human" },
    ],
    inventory: [
      { itemId: "item_armor_hide", slot: "body" },
      { itemId: "item_weapon_scimitar", slot: "main_hand" },
      { itemId: "item_armor_shield", slot: "off_hand" },
      { itemId: "item_focus_sprig_of_mistletoe" },
      { itemId: "item_healers_kit" },
      { itemId: "item_pack_explorers" },
    ],
    resources: [
      {
        // no rule behind it yet (#62), so the sheet does not show it
        id: "trait_wild_shape",
        name: "Wild Shape",
        current: 1,
        max: 2,
        resetCondition: "short_rest",
      },
      {
        id: "spell_slots_1",
        name: "1st-Level Spell Slots",
        current: 2,
        max: 4,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_2",
        name: "2nd-Level Spell Slots",
        current: 3,
        max: 3,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_3",
        name: "3rd-Level Spell Slots",
        current: 1,
        max: 3,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_4",
        name: "4th-Level Spell Slots",
        current: 2,
        max: 2,
        resetCondition: "long_rest",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000126",
    name: "Seraphine Dusk",
    raceId: "race_elf",
    subraceId: "subrace_elf_dark",
    classes: [
      {
        classId: "class_wizard",
        classLevel: 9,
        subclassId: "subclass_wizard_divination",
      },
    ],
    backgroundId: "background_sage",
    choices: {
      feats: [],
      classSelections: {},
      traitSelections: {
        wizard_starting_skills: ["arcana", "history"],
      },
    },
    alignment: "Lawful Neutral",
    str: 8,
    dex: 14,
    con: 8,
    int: 18,
    wis: 12,
    cha: 10,
    maxHp: 38,
    currentHp: 21,
    testFocus:
      "Wizard preview: CON 8, a negative modifier the maximum counts (#86); a spellbook that lists nothing (#31a, #83); Drow Magic at dawn.",
    personalityTraits:
      "I annotate other people's sentences while they are still saying them.",
    ideals: "Knowledge. The future is only a text nobody has read carefully.",
    bonds: "I stole my first spellbook from a matron who still wants it back.",
    flaws: "I would rather be right in private than useful in public.",
    traits: [
      {
        traitId: "trait_wizard_prof_saving_throw",
        source: "class_wizard_level_1",
      },
      { traitId: "trait_wizard_prof_weapons", source: "class_wizard_level_1" },
      { traitId: "trait_wizard_prof_skills", source: "class_wizard_level_1" },
      { traitId: "trait_spellcasting_wizard", source: "class_wizard_level_1" },
      { traitId: "trait_arcane_recovery", source: "class_wizard_level_1" },
      { traitId: "trait_arcane_tradition", source: "class_wizard_level_2" },
      {
        traitId: "trait_arcane_tradition_feature",
        source: "class_wizard_level_6",
      },
      {
        traitId: "trait_divination_savant",
        source: "subclass_wizard_divination_level_2",
      },
      { traitId: "trait_portent", source: "subclass_wizard_divination_level_2" },
      {
        traitId: "trait_expert_divination",
        source: "subclass_wizard_divination_level_6",
      },
      { traitId: "race_elf_asi", source: "race_elf" },
      { traitId: "race_elf_darkvision", source: "race_elf" },
      { traitId: "keen_senses", source: "race_elf" },
      { traitId: "fey_ancestry", source: "race_elf" },
      { traitId: "trance", source: "race_elf" },
      { traitId: "race_elf_languages", source: "race_elf" },
      { traitId: "subrace_elf_dark_asi", source: "subrace_elf_dark" },
      {
        traitId: "subrace_elf_dark_superior_darkvision",
        source: "subrace_elf_dark",
      },
      { traitId: "sunlight_sensitivity", source: "subrace_elf_dark" },
      { traitId: "drow_magic", source: "subrace_elf_dark" },
      { traitId: "drow_weapon_training", source: "subrace_elf_dark" },
    ],
    inventory: [
      { itemId: "item_robe", slot: "body" },
      { itemId: "item_weapon_crossbow_hand", slot: "main_hand" },
      { itemId: "item_ammo_bolt", quantity: 20 },
      { itemId: "item_magic_item_spellbook" },
      { itemId: "item_focus_crystal" },
      { itemId: "item_pack_scholars" },
      { itemId: "item_ink" },
      { itemId: "item_ink_pen" },
    ],
    resources: [
      {
        id: "drow_magic_faerie_fire",
        name: "Faerie Fire (Drow Magic)",
        current: 0,
        max: 1,
        resetCondition: "dawn",
      },
      {
        id: "drow_magic_darkness",
        name: "Darkness (Drow Magic)",
        current: 1,
        max: 1,
        resetCondition: "dawn",
      },
      {
        // stubs: stored, but with no rule the sheet does not show them (#30)
        id: "trait_portent",
        name: "Portent",
        current: 2,
        max: 2,
        resetCondition: "long_rest",
      },
      {
        id: "trait_arcane_recovery",
        name: "Arcane Recovery",
        current: 1,
        max: 1,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_1",
        name: "1st-Level Spell Slots",
        current: 3,
        max: 4,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_2",
        name: "2nd-Level Spell Slots",
        current: 1,
        max: 3,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_3",
        name: "3rd-Level Spell Slots",
        current: 2,
        max: 3,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_4",
        name: "4th-Level Spell Slots",
        current: 3,
        max: 3,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_5",
        name: "5th-Level Spell Slots",
        current: 0,
        max: 1,
        resetCondition: "long_rest",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000127",
    name: "Kestrel Vey",
    raceId: "race_dragonborn",
    subraceId: "subrace_dragonborn_silver",
    classes: [
      {
        classId: "class_sorcerer",
        classLevel: 7,
        subclassId: "subclass_sorcerer_wild_magic",
      },
    ],
    backgroundId: "background_charlatan",
    choices: {
      feats: [],
      classSelections: {
        class_sorcerer: {
          sorcerer_level_3_metamagic: [
            "trait_metamagic_careful_spell",
            "trait_metamagic_extended_spell",
          ],
        },
      },
      traitSelections: {
        sorcerer_starting_skills: ["arcana", "persuasion"],
      },
    },
    alignment: "Chaotic Neutral",
    str: 8,
    dex: 14,
    con: 14,
    int: 10,
    wis: 12,
    cha: 17,
    maxHp: 30,
    currentHp: 44,
    testFocus:
      "Sorcery-points preview: the pool is stored but has no rule to show it (#62); Tides of Chaos and Wild Magic Surge stubs; a spent cold breath.",
    personalityTraits: "Things go slightly wrong around me, and I apologise in advance.",
    ideals: "Change. Nothing should stay the shape it was born in.",
    bonds: "My clan sold their silver to pay for my silence. I owe it back.",
    flaws: "I cannot resist finding out what happens if.",
    traits: [
      {
        traitId: "trait_sorcerer_prof_saving_throw",
        source: "class_sorcerer_level_1",
      },
      {
        traitId: "trait_sorcerer_prof_weapons",
        source: "class_sorcerer_level_1",
      },
      {
        traitId: "trait_sorcerer_prof_skills",
        source: "class_sorcerer_level_1",
      },
      {
        traitId: "trait_spellcasting_sorcerer",
        source: "class_sorcerer_level_1",
      },
      { traitId: "trait_sorcerous_origin", source: "class_sorcerer_level_1" },
      { traitId: "trait_font_of_magic", source: "class_sorcerer_level_2" },
      {
        traitId: "trait_sorcerous_origin_feature",
        source: "class_sorcerer_level_6",
      },
      {
        traitId: "trait_wild_magic_surge",
        source: "subclass_sorcerer_wild_magic_level_1",
      },
      {
        traitId: "trait_tides_of_chaos",
        source: "subclass_sorcerer_wild_magic_level_1",
      },
      {
        traitId: "trait_bend_luck",
        source: "subclass_sorcerer_wild_magic_level_6",
      },
      { traitId: "race_dragonborn_asi", source: "race_dragonborn" },
      { traitId: "race_dragonborn_languages", source: "race_dragonborn" },
      {
        traitId: "subrace_dragonborn_silver",
        source: "subrace_dragonborn_silver",
      },
    ],
    inventory: [
      { itemId: "item_weapon_dagger", quantity: 2, slot: "main_hand" },
      { itemId: "item_gear_component_pouch" },
      { itemId: "item_disguise_kit" },
      { itemId: "item_clothes_fine" },
      { itemId: "item_pack_explorers" },
    ],
    resources: [
      {
        // no rule behind it yet (#62), so the sheet does not show it
        id: "trait_font_of_magic",
        name: "Sorcery Points",
        current: 3,
        max: 7,
        resetCondition: "long_rest",
      },
      {
        id: "trait_tides_of_chaos",
        name: "Tides of Chaos",
        current: 0,
        max: 1,
        resetCondition: "long_rest",
      },
      {
        id: "dragonborn_breath_charge",
        name: "Breath Weapon",
        current: 0,
        max: 1,
        resetCondition: "short_rest",
      },
      {
        id: "spell_slots_1",
        name: "1st-Level Spell Slots",
        current: 4,
        max: 4,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_2",
        name: "2nd-Level Spell Slots",
        current: 2,
        max: 3,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_3",
        name: "3rd-Level Spell Slots",
        current: 1,
        max: 3,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_4",
        name: "4th-Level Spell Slots",
        current: 1,
        max: 1,
        resetCondition: "long_rest",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000128",
    name: "Brother Mote",
    raceId: "race_half_elf",
    classes: [
      {
        classId: "class_cleric",
        classLevel: 11,
        subclassId: "subclass_cleric_tempest_subclass",
      },
    ],
    // the ledger sums to 11: every level-up is refused (#95)
    levelColumn: 12,
    backgroundId: "background_acolyte",
    choices: {
      feats: [],
      classSelections: {},
      traitSelections: {
        half_elf_asi_choice: ["WIS", "CON"],
        skill_versatility_choice: ["medicine", "perception"],
        half_elf_language_choice: ["dwarvish"],
        acolyte_languages: ["celestial", "infernal"],
        cleric_starting_skills: ["history", "persuasion"],
      },
    },
    alignment: "Lawful Good",
    str: 14,
    dex: 10,
    con: 13,
    int: 10,
    wis: 19,
    cha: 11,
    maxHp: 58,
    // above the derived maximum of 80: the next hit point write clamps it
    currentHp: 95,
    testFocus:
      "Broken on purpose: level column 12 against an 11 ledger (#95), a slot pool above its maximum (#98), hit points above theirs, four attuned items.",
    personalityTraits: "I bless the sick, the storm, and the cook, in that order.",
    ideals: "Faith. The thunder answers; I only have to ask properly.",
    bonds: "The lighthouse temple at Saltmarch keeps my vows in its bell.",
    flaws: "I cannot admit the ledger might be wrong, even when it is.",
    traits: [
      {
        traitId: "trait_cleric_prof_saving_throw",
        source: "class_cleric_level_1",
      },
      { traitId: "trait_cleric_prof_armor", source: "class_cleric_level_1" },
      { traitId: "trait_cleric_prof_weapons", source: "class_cleric_level_1" },
      { traitId: "trait_cleric_prof_skills", source: "class_cleric_level_1" },
      { traitId: "trait_spellcasting_cleric", source: "class_cleric_level_1" },
      { traitId: "trait_divine_domain", source: "class_cleric_level_1" },
      { traitId: "trait_channel_divinity", source: "class_cleric_level_2" },
      {
        traitId: "trait_divine_domain_feature",
        source: "class_cleric_level_2",
      },
      { traitId: "trait_destroy_undead", source: "class_cleric_level_5" },
      { traitId: "trait_divine_intervention", source: "class_cleric_level_10" },
      {
        traitId: "trait_tempest_domain_spells",
        source: "subclass_cleric_tempest_subclass_level_1",
      },
      {
        traitId: "trait_cleric_tempest_prof_bonus",
        source: "subclass_cleric_tempest_subclass_level_1",
      },
      {
        traitId: "trait_wrath_of_the_storm",
        source: "subclass_cleric_tempest_subclass_level_1",
      },
      {
        traitId: "trait_cd_destructive_wrath",
        source: "subclass_cleric_tempest_subclass_level_2",
      },
      {
        traitId: "trait_thunderous_strike",
        source: "subclass_cleric_tempest_subclass_level_6",
      },
      {
        traitId: "trait_divine_strike",
        source: "subclass_cleric_tempest_subclass_level_8",
      },
      { traitId: "race_half_elf_asi", source: "race_half_elf" },
      { traitId: "race_half_elf_darkvision", source: "race_half_elf" },
      { traitId: "fey_ancestry", source: "race_half_elf" },
      { traitId: "skill_versatility", source: "race_half_elf" },
      { traitId: "race_half_elf_languages", source: "race_half_elf" },
    ],
    inventory: [
      { itemId: "item_armor_plate", slot: "body" },
      { itemId: "item_weapon_warhammer", slot: "main_hand" },
      { itemId: "item_armor_shield", slot: "off_hand" },
      // four attuned against a cap of three: the UI cannot make this
      {
        itemId: "item_wondrous_cloak_of_protection",
        slot: "cloak",
        isAttuned: true,
      },
      { itemId: "item_ring_protection", slot: "ring_1", isAttuned: true },
      {
        itemId: "item_wondrous_headband_of_intellect",
        slot: "head",
        isAttuned: true,
      },
      {
        itemId: "item_wondrous_boots_of_elvenkind",
        slot: "boots",
        isAttuned: true,
      },
      { itemId: "item_focus_emblem" },
      { itemId: "item_pack_priests" },
      { itemId: "item_potion_healing", quantity: 2 },
    ],
    resources: [
      {
        // 6 of 4: the sheet clamps the display to 4, so the next two genuine
        // spends move nothing the player can see (#98)
        id: "spell_slots_1",
        name: "1st-Level Spell Slots",
        current: 6,
        max: 4,
        resetCondition: "long_rest",
      },
      {
        id: "resource_hit_dice_d8",
        name: "Hit Dice (d8)",
        current: 11,
        max: 11,
        resetCondition: "long_rest_half",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000129",
    name: "Orrik Stonehide",
    // neither the race nor the subclass is authored by the pack
    raceId: "race_goliath",
    classes: [
      {
        classId: "class_fighter",
        classLevel: 13,
        subclassId: "subclass_fighter_rune_knight",
      },
    ],
    backgroundId: "background_hermit",
    choices: {
      feats: [],
      classSelections: {
        class_fighter: {
          fighter_level_1_fighting_style: ["trait_fs_great_weapon_fighting"],
        },
      },
      traitSelections: {
        fighter_starting_skills: ["athletics", "survival"],
      },
    },
    expectedIssues: ["unknown_race", "unknown_subclass"],
    alignment: "Lawful Neutral",
    str: 20,
    dex: 12,
    con: 18,
    int: 8,
    wis: 12,
    cha: 10,
    maxHp: 82,
    currentHp: 134,
    testFocus:
      "Unknown content: a race, subclass, background and two items the pack does not author, and race traits that resolve to nothing; a slotless attuned belt (#102).",
    personalityTraits: "I keep a tally of every favour, mine and everyone's.",
    ideals: "Fairness. Everyone climbs the same mountain.",
    bonds: "The runes on my sword were carved by a giant who called me small.",
    flaws: "I will turn any task into a contest, and I will win it.",
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
      { traitId: "trait_extra_attack", source: "class_fighter_level_5" },
      {
        traitId: "trait_martial_archetype_feature",
        source: "class_fighter_level_7",
      },
      { traitId: "trait_indomitable", source: "class_fighter_level_9" },
      // none of these resolve: the pack has no Rune Knight and no Goliath
      {
        traitId: "trait_rune_carver",
        source: "subclass_fighter_rune_knight_level_3",
      },
      {
        traitId: "trait_giants_might",
        source: "subclass_fighter_rune_knight_level_3",
      },
      {
        traitId: "trait_runic_shield",
        source: "subclass_fighter_rune_knight_level_7",
      },
      {
        traitId: "trait_great_stature",
        source: "subclass_fighter_rune_knight_level_10",
      },
      { traitId: "trait_stones_endurance", source: "race_goliath" },
      { traitId: "trait_natural_athlete", source: "race_goliath" },
      { traitId: "trait_mountain_born", source: "race_goliath" },
    ],
    inventory: [
      { itemId: "item_armor_splint", slot: "body" },
      {
        itemId: "item_weapon_frost_brand_greatsword",
        slot: "main_hand",
        isAttuned: true,
      },
      // attuned, with no slot to wear it in
      {
        itemId: "item_wondrous_belt_of_hill_giant_strength",
        isAttuned: true,
      },
      { itemId: "item_weapon_javelin", quantity: 4 },
      { itemId: "item_pack_explorers" },
    ],
    resources: [
      {
        id: "trait_second_wind",
        name: "Second Wind",
        current: 0,
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
      {
        // a pool whose trait the pack does not author
        id: "trait_giants_might",
        name: "Giant's Might",
        current: 2,
        max: 2,
        resetCondition: "long_rest",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000130",
    name: "Maren Solace",
    raceId: "race_human",
    classes: [
      {
        classId: "class_cleric",
        classLevel: 3,
        subclassId: "subclass_cleric_light",
      },
    ],
    backgroundId: "background_acolyte",
    choices: {
      feats: [],
      classSelections: {},
      traitSelections: {
        human_language_choice: ["celestial"],
        acolyte_languages: ["draconic", "dwarvish"],
        cleric_starting_skills: ["medicine", "persuasion"],
      },
    },
    alignment: "Neutral Good",
    // Sister Aveline's numbers, so both pinned expectations are known: the
    // human's +1 makes WIS 17 (+3), a spell save DC of 13 and +5 to hit
    str: 12,
    dex: 9,
    con: 14,
    int: 10,
    wis: 16,
    cha: 11,
    maxHp: 18,
    currentHp: 24,
    testFocus:
      "Spell casting (#31b, #83): Burning Hands from a 1st- and then a 2nd-level slot (3d6, then 4d6) against WIS DC 13; the spent 1st-level slot leaves the picker; Faerie Fire's concentration ended from Active effects.",
    personalityTraits: "I narrate sunrises to people who did not ask for one.",
    ideals: "Hope. Every dark room has a window someone forgot to open.",
    bonds: "The lighthouse-temple at Greyhaven kept me alive through one long winter.",
    flaws: "I treat every shadow as a problem to solve, including other people's.",
    traits: [
      { traitId: "trait_cleric_prof_armor", source: "class_cleric_level_1" },
      { traitId: "trait_cleric_prof_weapons", source: "class_cleric_level_1" },
      { traitId: "trait_cleric_prof_skills", source: "class_cleric_level_1" },
      {
        traitId: "trait_cleric_prof_saving_throw",
        source: "class_cleric_level_1",
      },
      { traitId: "trait_spellcasting_cleric", source: "class_cleric_level_1" },
      { traitId: "trait_divine_domain", source: "class_cleric_level_1" },
      {
        traitId: "trait_light_domain_spells",
        source: "subclass_cleric_light_level_1",
      },
      {
        traitId: "trait_cleric_light_bonus_cantrip",
        source: "subclass_cleric_light_level_1",
      },
      { traitId: "trait_warding_flare", source: "subclass_cleric_light_level_1" },
      { traitId: "trait_channel_divinity", source: "class_cleric_level_2" },
      { traitId: "trait_divine_domain_feature", source: "class_cleric_level_2" },
      {
        traitId: "trait_cd_radiance_of_the_dawn",
        source: "subclass_cleric_light_level_2",
      },
      { traitId: "trait_human_languages", source: "race_human" },
      { traitId: "trait_acolyte_prof_skills", source: "background_acolyte" },
      { traitId: "trait_acolyte_languages", source: "background_acolyte" },
    ],
    inventory: [
      { itemId: "item_armor_chain_shirt", slot: "body" },
      { itemId: "item_weapon_mace", slot: "main_hand" },
      { itemId: "item_armor_shield", slot: "off_hand" },
      { itemId: "item_focus_emblem" },
      { itemId: "item_pack_priests" },
      { itemId: "item_clothes_vestments" },
    ],
    resources: [
      {
        id: "spell_slots_1",
        name: "1st-Level Spell Slots",
        current: 1,
        max: 4,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_2",
        name: "2nd-Level Spell Slots",
        current: 2,
        max: 2,
        resetCondition: "long_rest",
      },
      {
        id: "trait_channel_divinity",
        name: "Channel Divinity",
        current: 1,
        max: 1,
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
