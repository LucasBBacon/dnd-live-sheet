/**
 * Development fixture: ten varied sample characters on stable URLs.
 *
 * Purpose is live UI and socket testing, not content authoring. Every row it
 * writes is either operational (characters and their ledgers) or a clearly
 * tagged reference *stub* - a placeholder that exists only so the foreign keys
 * resolve while the real pack is still being written.
 *
 * Two rules keep it safe to run against a working database:
 *
 * 1. Reference stubs are inserted with onConflictDoNothing. If an id already
 *    exists - because the real pack now defines it, or because a previous run
 *    created it - the authored row wins and this script leaves it alone.
 * 2. Operational writes touch only the ten fixed ids in ROSTER. Child rows for
 *    those ids are cleared and rewritten so re-running is idempotent; no other
 *    character is read or modified.
 *
 * Trait ids on character_traits are deliberately a mix of ids the compendium
 * already defines and ids named by convention that it does not yet. That column
 * carries no foreign key, and an unresolved grant is exactly what the sheet has
 * to survive while the pack is incomplete.
 */
import * as dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import type {
  ItemDefinition,
  StartingEquipmentDefinition,
  WeaponDefinition,
} from "@project/shared";
import { backgrounds, items, subclasses } from "./schema/reference.js";
import {
  campaignMembers,
  campaigns,
  characterClasses,
  characterCustomTraits,
  characterInventory,
  characterResources,
  characterTraits,
  characters,
} from "./schema/operational.js";

dotenv.config({ path: "../../.env" });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is missing");

const client = postgres(connectionString);
const db = drizzle(client);

// #region Constants

/** The campaign `dev-user-1` already owns, so the mock auth header can read these. */
const CAMPAIGN_ID = "00000000-0000-0000-0000-000000000001";
const CAMPAIGN_NAME = "Dev Smoke Campaign";
const OWNER_USER_ID = "dev-user-1";

/**
 * Provenance stamp on every reference stub this script creates, so placeholders
 * can be listed - or deleted - without guessing which rows they are.
 */
const SAMPLE_PACK_ID = "dev_sample_pack";
const SAMPLE_PACK_VERSION = 1;

/** Where the live sheet serves a character. */
const SHEET_URL_BASE = "http://localhost:5173/character";

const EMPTY_STARTING_EQUIPMENT: StartingEquipmentDefinition = {
  given: [],
  choices: [],
};

// #endregion

// #region Reference Stubs - Subclasses

/**
 * Subclasses the roster needs that the pack has not reached yet. Ids follow the
 * `subclass_<class>_<archetype>` convention the imported rows already use.
 */
const SAMPLE_SUBCLASSES = [
  {
    id: "subclass_paladin_devotion",
    parentClassId: "class_paladin",
    name: "Oath of Devotion",
    shortDescription:
      "The paladin of the shining example, sworn to honesty and courage.",
  },
  {
    id: "subclass_monk_open_hand",
    parentClassId: "class_monk",
    name: "Way of the Open Hand",
    shortDescription: "Masters of unarmed combat who turn ki into leverage.",
  },
  {
    id: "subclass_wizard_evocation",
    parentClassId: "class_wizard",
    name: "School of Evocation",
    shortDescription:
      "Wizards who shape raw elemental energy and spare their allies from it.",
  },
  {
    id: "subclass_warlock_fiend",
    parentClassId: "class_warlock",
    name: "The Fiend",
    shortDescription: "A pact struck with something from the lower planes.",
  },
  {
    id: "subclass_ranger_hunter",
    parentClassId: "class_ranger",
    name: "Hunter",
    shortDescription: "A ranger who specialises against a chosen kind of prey.",
  },
  {
    id: "subclass_rogue_thief",
    parentClassId: "class_rogue",
    name: "Thief",
    shortDescription: "Fast hands and a climber's nerve.",
  },
  {
    id: "subclass_sorcerer_draconic",
    parentClassId: "class_sorcerer",
    name: "Draconic Bloodline",
    shortDescription: "Innate magic inherited from a draconic ancestor.",
  },
] as const;

// #endregion

// #region Reference Stubs - Backgrounds

/**
 * Backgrounds beyond the four the pack currently carries. Only the columns the
 * sheet reads carry anything meaningful; the inspiration tables are left empty
 * rather than half-authored, because the wizard is not what this fixture tests.
 */
const SAMPLE_BACKGROUNDS = [
  {
    id: "background_sage",
    name: "Sage",
    featureName: "Researcher",
    featureDescription:
      "When you attempt to learn or recall a piece of lore, you often know where and from whom you can obtain it.",
    shortDescription:
      "A life spent among books, questions and older, quieter people.",
  },
  {
    id: "background_folk_hero",
    name: "Folk Hero",
    featureName: "Rustic Hospitality",
    featureDescription:
      "Common folk shelter you from the law or anyone else searching for you, short of risking their lives.",
    shortDescription:
      "You come from the ranks of the ordinary, and did something that was not.",
  },
  {
    id: "background_outlander",
    name: "Outlander",
    featureName: "Wanderer",
    featureDescription:
      "You have an excellent memory for maps and geography, and can find food and fresh water for yourself and up to five others each day.",
    shortDescription:
      "You grew up in the wilds, far from civilisation and its comforts.",
  },
  {
    id: "background_charlatan",
    name: "Charlatan",
    featureName: "False Identity",
    featureDescription:
      "You have a second identity complete with documentation, established acquaintances and disguises.",
    shortDescription:
      "You have always had a way with people, and a way of getting their money.",
  },
] as const;

// #endregion

// #region Reference Stubs - Items

type ItemModifier = NonNullable<ItemDefinition["modifiers"]>[number];

/**
 * A modifier as authored below.
 *
 * `requiredStates` and `forbiddenStates` are gates - "only while raging", "not
 * while grappled" - and every modifier here is unconditional. The schema still
 * emits both as empty arrays, so they are filled in once at the write site
 * rather than repeated across a dozen literals that all say nothing.
 */
type AuthoredModifier = Omit<
  ItemModifier,
  "requiredStates" | "forbiddenStates"
>;

interface SampleItem {
  id: string;
  name: string;
  /** Pounds. Stored to the column in hundredths, as the projection expects. */
  pounds: number;
  description: string;
  itemRule: Omit<ItemDefinition, "id" | "name" | "weight" | "modifiers"> & {
    modifiers?: AuthoredModifier[];
  };
  weaponRule?: Omit<WeaponDefinition, "id" | "name">;
}

/**
 * Magic and consumable items the roster carries. The core pack is mundane gear
 * only today, and an inventory with nothing attunable, consumable or stackable
 * exercises almost none of the sheet.
 *
 * Ids extend the prefixes the imported items already use - `item_weapon_`,
 * `item_armor_` - and add `item_wondrous_`, `item_ring_`, `item_potion_`,
 * `item_scroll_` and `item_wand_` for categories the pack has not reached.
 *
 * Unlike the compendium's current rows these declare `equipSlot`, so the client
 * can tell a ring from a cloak.
 */
const SAMPLE_ITEMS: SampleItem[] = [
  {
    id: "item_potion_healing",
    name: "Potion of Healing",
    pounds: 0.5,
    description:
      "A vial of red liquid that glimmers when agitated. Drinking it restores 2d4 + 2 hit points.",
    itemRule: { type: "consumable", requiresAttunement: false, categoryTags: [] },
  },
  {
    id: "item_potion_greater_healing",
    name: "Potion of Greater Healing",
    pounds: 0.5,
    description:
      "A larger vial of the same red liquid. Drinking it restores 4d4 + 4 hit points.",
    itemRule: { type: "consumable", requiresAttunement: false, categoryTags: [] },
  },
  {
    id: "item_scroll_fireball",
    name: "Scroll of Fireball",
    pounds: 0,
    description:
      "A spell scroll bearing Fireball at 3rd level. The scroll crumbles once the spell is cast.",
    itemRule: { type: "consumable", requiresAttunement: false, categoryTags: [] },
  },
  {
    id: "item_weapon_longsword_plus_1",
    name: "Longsword +1",
    pounds: 3,
    description:
      "A longsword with a faint silver line along the fuller. You have a +1 bonus to attack and damage rolls made with it.",
    itemRule: {
      type: "weapon",
      equipSlot: "main_hand",
      requiresAttunement: false,
      categoryTags: ["category_weapon_martial", "category_weapon_martial_melee"],
      modifiers: [
        { target: "ATTACK_BONUS", type: "add", value: 1, scalingFactor: "none" },
        { target: "DAMAGE_BONUS", type: "add", value: 1, scalingFactor: "none" },
      ],
    },
    weaponRule: {
      category: "martial_melee",
      damageDice: "1d8",
      versatileDamageDice: "1d10",
      damageType: "slashing",
      properties: ["versatile"],
      range: 5,
    },
  },
  {
    id: "item_armor_half_plate_plus_1",
    name: "Half Plate +1",
    pounds: 40,
    description:
      "Shaped plates over leather, chased with gold. You have a +1 bonus to AC beyond the armour's own.",
    itemRule: {
      type: "armor",
      armorCategory: "medium",
      equipSlot: "body",
      requiresAttunement: false,
      categoryTags: [],
      modifiers: [
        {
          target: "ARMOR_CLASS",
          type: "set_base",
          value: 16,
          scalingFactor: "none",
          maxDexCap: 2,
        },
        {
          target: "STEALTH_CHECK",
          type: "disadvantage",
          value: 0,
          scalingFactor: "none",
        },
      ],
    },
  },
  {
    id: "item_wondrous_cloak_of_protection",
    name: "Cloak of Protection",
    pounds: 1,
    description:
      "You gain a +1 bonus to AC and saving throws while you wear this cloak.",
    itemRule: {
      type: "wondrous",
      equipSlot: "cloak",
      requiresAttunement: true,
      categoryTags: [],
      modifiers: [
        { target: "ARMOR_CLASS", type: "add", value: 1, scalingFactor: "none" },
        { target: "ALL_SAVES", type: "add", value: 1, scalingFactor: "none" },
      ],
    },
  },
  {
    id: "item_ring_protection",
    name: "Ring of Protection",
    pounds: 0,
    description:
      "You gain a +1 bonus to AC and saving throws while you wear this ring.",
    itemRule: {
      type: "wondrous",
      equipSlot: "ring",
      requiresAttunement: true,
      categoryTags: [],
      modifiers: [
        { target: "ARMOR_CLASS", type: "add", value: 1, scalingFactor: "none" },
        { target: "ALL_SAVES", type: "add", value: 1, scalingFactor: "none" },
      ],
    },
  },
  {
    id: "item_wondrous_bag_of_holding",
    name: "Bag of Holding",
    pounds: 15,
    description:
      "The interior is far larger than the outside. It holds up to 500 pounds, and always weighs 15.",
    itemRule: {
      type: "wondrous",
      requiresAttunement: false,
      categoryTags: [],
      container: { capacityPounds: 500 },
    },
  },
  {
    id: "item_wondrous_boots_of_elvenkind",
    name: "Boots of Elvenkind",
    pounds: 1,
    description:
      "Your steps make no sound. You have advantage on Stealth checks made to move silently.",
    itemRule: {
      type: "wondrous",
      equipSlot: "boots",
      requiresAttunement: true,
      categoryTags: [],
      modifiers: [
        {
          target: "STEALTH_CHECK",
          type: "advantage",
          value: 0,
          scalingFactor: "none",
        },
      ],
    },
  },
  {
    id: "item_wondrous_amulet_of_health",
    name: "Amulet of Health",
    pounds: 1,
    description:
      "Your Constitution score is 19 while you wear this amulet, unless it is already higher.",
    itemRule: {
      type: "wondrous",
      equipSlot: "amulet",
      requiresAttunement: true,
      categoryTags: [],
      modifiers: [
        { target: "CON", type: "set_base", value: 19, scalingFactor: "none" },
      ],
    },
  },
  {
    id: "item_wondrous_headband_of_intellect",
    name: "Headband of Intellect",
    pounds: 1,
    description:
      "Your Intelligence score is 19 while you wear this headband, unless it is already higher.",
    itemRule: {
      type: "wondrous",
      equipSlot: "head",
      requiresAttunement: true,
      categoryTags: [],
      modifiers: [
        { target: "INT", type: "set_base", value: 19, scalingFactor: "none" },
      ],
    },
  },
  {
    id: "item_wondrous_gauntlets_of_ogre_power",
    name: "Gauntlets of Ogre Power",
    pounds: 1,
    description:
      "Your Strength score is 19 while you wear these gauntlets, unless it is already higher.",
    itemRule: {
      type: "wondrous",
      equipSlot: "gloves",
      requiresAttunement: true,
      categoryTags: [],
      modifiers: [
        { target: "STR", type: "set_base", value: 19, scalingFactor: "none" },
      ],
    },
  },
  {
    id: "item_wand_of_magic_missiles",
    name: "Wand of Magic Missiles",
    pounds: 1,
    description:
      "The wand has 7 charges and regains 1d6 + 1 of them daily at dawn.",
    itemRule: {
      type: "wondrous",
      equipSlot: "main_hand",
      requiresAttunement: false,
      categoryTags: [],
    },
  },
];

// #endregion

// #region Roster

interface SampleInventoryRow {
  itemId: string;
  quantity?: number;
  slot?: string;
  isAttuned?: boolean;
  customName?: string;
  /** itemId of another row in this character's list that contains this stack. */
  insideItemId?: string;
}

interface SampleResourceRow {
  id: string;
  name: string;
  current: number;
  max: number;
  resetCondition:
    | "short_rest"
    | "long_rest"
    | "long_rest_half"
    | "dawn"
    | "never";
}

interface SampleCharacter {
  id: string;
  name: string;
  raceId: string;
  subraceId?: string;
  classes: Array<{ classId: string; classLevel: number; subclassId?: string }>;
  backgroundId?: string;
  customBackgroundData?: {
    name: string;
    featureName: string;
    featureDescription: string;
  };
  /** Real trait ids only - this table does carry a foreign key. */
  customTraitIds?: string[];
  alignment: string;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  maxHp: number;
  currentHp: number;
  /** One line on what this character is here to exercise. */
  testFocus: string;
  personalityTraits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  traits: Array<{ traitId: string; source: string }>;
  inventory: SampleInventoryRow[];
  resources: SampleResourceRow[];
}

/**
 * Ten characters spanning level 1 to 20, chosen so that between them they cover
 * every branch the sheet has: single class and multiclass, subrace and none,
 * preset and custom background, full health through zero, empty and crowded
 * equipment slots, attunement below and at the cap of three, stacked
 * consumables, a container holding other stacks, and all five reset conditions.
 */
const ROSTER: SampleCharacter[] = [
  {
    id: "00000000-0000-0000-0000-000000000110",
    name: "Pip Underbough",
    raceId: "race_halfling",
    subraceId: "subrace_halfling_lightfoot",
    classes: [{ classId: "class_rogue", classLevel: 1 }],
    backgroundId: "background_criminal",
    alignment: "Chaotic Neutral",
    str: 8,
    dex: 17,
    con: 14,
    int: 12,
    wis: 10,
    cha: 13,
    maxHp: 10,
    currentHp: 10,
    testFocus:
      "Floor case: level 1, no subclass yet, untouched hit points, sparse slots.",
    personalityTraits:
      "I never pass up a chance to pick something up that nobody is watching.",
    ideals: "Freedom. Chains are meant to be broken, especially other people's.",
    bonds: "I owe a debt to the fence who kept me out of the stocks.",
    flaws: "I cannot resist a locked box, however bad the timing.",
    traits: [
      { traitId: "trait_rogue_prof_armor", source: "class_rogue_level_1" },
      { traitId: "trait_rogue_prof_weapons", source: "class_rogue_level_1" },
      { traitId: "trait_rogue_prof_skills", source: "class_rogue_level_1" },
      { traitId: "trait_rogue_prof_tools", source: "class_rogue_level_1" },
      {
        traitId: "trait_rogue_prof_saving_throw",
        source: "class_rogue_level_1",
      },
      { traitId: "trait_expertise", source: "class_rogue_level_1" },
      { traitId: "trait_sneak_attack", source: "class_rogue_level_1" },
      { traitId: "trait_thieves_cant", source: "class_rogue_level_1" },
      { traitId: "trait_lucky", source: "race_halfling" },
      { traitId: "trait_brave", source: "race_halfling" },
      { traitId: "trait_halfling_nimbleness", source: "race_halfling" },
      {
        traitId: "trait_naturally_stealthy",
        source: "subrace_halfling_lightfoot",
      },
      { traitId: "trait_criminal_prof_skills", source: "background_criminal" },
      { traitId: "trait_criminal_prof_tools", source: "background_criminal" },
    ],
    inventory: [
      { itemId: "item_armor_leather", slot: "body" },
      { itemId: "item_weapon_dagger", quantity: 2, slot: "main_hand" },
      { itemId: "item_weapon_shortbow" },
      { itemId: "item_ammo_arrow", quantity: 20 },
      { itemId: "item_rope_hempen" },
      { itemId: "item_torch", quantity: 3 },
      { itemId: "item_rations", quantity: 5 },
      { itemId: "item_pouch" },
      { itemId: "item_tinderbox" },
    ],
    resources: [
      {
        id: "resource_inspiration",
        name: "Inspiration",
        current: 1,
        max: 1,
        resetCondition: "never",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000111",
    name: "Sister Aveline Cor",
    raceId: "race_human",
    classes: [
      {
        classId: "class_cleric",
        classLevel: 3,
        subclassId: "subclass_cleric_life",
      },
    ],
    backgroundId: "background_acolyte",
    alignment: "Lawful Good",
    str: 13,
    dex: 10,
    con: 15,
    int: 11,
    wis: 17,
    cha: 12,
    maxHp: 24,
    currentHp: 17,
    testFocus:
      "Subrace-less race, a fully spent short-rest resource, sword-and-board slots.",
    personalityTraits:
      "I quote scripture more often than anyone finds comfortable.",
    ideals: "Charity. The wounded do not have to earn my hands.",
    bonds: "The infirmary at Candlemere raised me. I send back what I can.",
    flaws: "I trust the order's word over the evidence in front of me.",
    traits: [
      { traitId: "trait_cleric_prof_armor", source: "class_cleric_level_1" },
      { traitId: "trait_cleric_prof_weapons", source: "class_cleric_level_1" },
      { traitId: "trait_cleric_prof_skills", source: "class_cleric_level_1" },
      {
        traitId: "trait_cleric_prof_saving_throw",
        source: "class_cleric_level_1",
      },
      { traitId: "trait_divine_domain", source: "class_cleric_level_1" },
      {
        traitId: "trait_cleric_life_prof_bonus",
        source: "subclass_cleric_life_level_1",
      },
      {
        traitId: "trait_cleric_life_domain_spells",
        source: "subclass_cleric_life_level_1",
      },
      {
        traitId: "trait_disciple_of_life",
        source: "subclass_cleric_life_level_1",
      },
      { traitId: "trait_channel_divinity", source: "class_cleric_level_2" },
      { traitId: "trait_preserve_life", source: "subclass_cleric_life_level_2" },
      { traitId: "trait_human_languages", source: "race_human" },
      { traitId: "trait_acolyte_prof_skills", source: "background_acolyte" },
      { traitId: "trait_acolyte_languages", source: "background_acolyte" },
    ],
    inventory: [
      { itemId: "item_armor_chain_shirt", slot: "body" },
      { itemId: "item_weapon_mace", slot: "main_hand" },
      { itemId: "item_armor_shield", slot: "off_hand" },
      { itemId: "item_focus_amulet", slot: "amulet" },
      { itemId: "item_pack_priests" },
      { itemId: "item_potion_healing", quantity: 2 },
      { itemId: "item_vestments" },
      { itemId: "item_incense", quantity: 4 },
    ],
    resources: [
      {
        id: "trait_channel_divinity",
        name: "Channel Divinity",
        current: 0,
        max: 1,
        resetCondition: "short_rest",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000112",
    name: "Grimnar Stonefist",
    raceId: "race_dwarf",
    subraceId: "subrace_dwarf_mountain",
    classes: [
      {
        classId: "class_barbarian",
        classLevel: 5,
        subclassId: "subclass_barbarian_berserker",
      },
    ],
    backgroundId: "background_soldier",
    alignment: "Chaotic Good",
    str: 18,
    dex: 14,
    con: 17,
    int: 8,
    wis: 12,
    cha: 10,
    maxHp: 55,
    currentHp: 22,
    testFocus:
      "Bloodied below half, attuned gloves, renamed weapon, body slot left empty for unarmoured defence.",
    personalityTraits:
      "I answer questions with the shortest true sentence available.",
    ideals: "Might. The strong protect the rest, or they are not strong.",
    bonds: "My shield-band died at Kar Duum. I carry their axe.",
    flaws: "Once the red comes down I do not hear anyone calling me off.",
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
        traitId: "trait_barbarian_prof_skills",
        source: "class_barbarian_level_1",
      },
      {
        traitId: "trait_barbarian_prof_saving_throw",
        source: "class_barbarian_level_1",
      },
      { traitId: "trait_rage", source: "class_barbarian_level_1" },
      {
        traitId: "trait_unarmored_defense_barbarian",
        source: "class_barbarian_level_1",
      },
      { traitId: "trait_reckless_attack", source: "class_barbarian_level_2" },
      { traitId: "trait_danger_sense", source: "class_barbarian_level_2" },
      {
        traitId: "trait_berserker_frenzy",
        source: "subclass_barbarian_berserker_level_3",
      },
      { traitId: "trait_extra_attack", source: "class_barbarian_level_5" },
      { traitId: "trait_fast_movement", source: "class_barbarian_level_5" },
      { traitId: "trait_darkvision_60", source: "race_dwarf" },
      { traitId: "trait_dwarven_resilience", source: "race_dwarf" },
      { traitId: "trait_dwarf_languages", source: "race_dwarf" },
      {
        traitId: "trait_dwarven_armor_training",
        source: "subrace_dwarf_mountain",
      },
      { traitId: "trait_soldier_prof_skills", source: "background_soldier" },
    ],
    inventory: [
      {
        itemId: "item_weapon_greataxe",
        slot: "main_hand",
        customName: "Skullcleaver",
      },
      {
        itemId: "item_wondrous_gauntlets_of_ogre_power",
        slot: "gloves",
        isAttuned: true,
      },
      { itemId: "item_weapon_handaxe", quantity: 2 },
      { itemId: "item_weapon_javelin", quantity: 4 },
      { itemId: "item_armor_hide" },
      { itemId: "item_pack_explorers" },
      { itemId: "item_potion_healing" },
      { itemId: "item_rations", quantity: 10 },
    ],
    resources: [
      {
        id: "trait_rage",
        name: "Rage",
        current: 1,
        max: 3,
        resetCondition: "long_rest",
      },
      {
        id: "resource_hit_dice_d12",
        name: "Hit Dice (d12)",
        current: 2,
        max: 5,
        resetCondition: "long_rest_half",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000113",
    name: "Lyra Silverstring",
    raceId: "race_half_elf",
    classes: [
      { classId: "class_bard", classLevel: 6, subclassId: "subclass_bard_lore" },
      {
        classId: "class_rogue",
        classLevel: 1,
        subclassId: "subclass_rogue_thief",
      },
    ],
    backgroundId: "background_noble",
    alignment: "Chaotic Good",
    str: 9,
    dex: 16,
    con: 13,
    int: 12,
    wis: 10,
    cha: 18,
    maxHp: 45,
    currentHp: 45,
    testFocus:
      "Multiclass ledger, attuned cloak, partially spent short-rest pool, renamed instrument.",
    personalityTraits:
      "I can talk my way into any room and usually out of it.",
    ideals: "Beauty. A thing worth remembering is worth writing down properly.",
    bonds: "My family name opens doors I would rather have picked.",
    flaws: "I will trade a secret I should have kept for a better story.",
    traits: [
      { traitId: "trait_bard_prof_armor", source: "class_bard_level_1" },
      { traitId: "trait_bard_prof_weapons", source: "class_bard_level_1" },
      { traitId: "trait_bard_prof_skills", source: "class_bard_level_1" },
      { traitId: "trait_bard_prof_tools", source: "class_bard_level_1" },
      { traitId: "trait_bard_prof_saving_throw", source: "class_bard_level_1" },
      { traitId: "trait_bardic_inspiration", source: "class_bard_level_1" },
      { traitId: "trait_jack_of_all_trades", source: "class_bard_level_2" },
      { traitId: "trait_song_of_rest", source: "class_bard_level_2" },
      { traitId: "trait_bard_college", source: "class_bard_level_3" },
      {
        traitId: "trait_bard_lore_prof_bonus",
        source: "subclass_bard_lore_level_3",
      },
      { traitId: "trait_cutting_words", source: "subclass_bard_lore_level_3" },
      { traitId: "trait_expertise", source: "class_bard_level_3" },
      { traitId: "trait_font_of_inspiration", source: "class_bard_level_5" },
      { traitId: "trait_countercharm", source: "class_bard_level_6" },
      {
        traitId: "trait_rogue_prof_armor",
        source: "multiclass_grant:class_rogue:level_1",
      },
      {
        traitId: "trait_sneak_attack",
        source: "multiclass_grant:class_rogue:level_1",
      },
      {
        traitId: "trait_thieves_cant",
        source: "multiclass_grant:class_rogue:level_1",
      },
      { traitId: "trait_fey_ancestry", source: "race_half_elf" },
      { traitId: "trait_darkvision_60", source: "race_half_elf" },
      { traitId: "trait_skill_versatility", source: "race_half_elf" },
      { traitId: "trait_noble_prof_skills", source: "background_noble" },
      { traitId: "trait_noble_prof_tools", source: "background_noble" },
    ],
    inventory: [
      { itemId: "item_armor_studded_leather", slot: "body" },
      { itemId: "item_weapon_rapier", slot: "main_hand" },
      { itemId: "item_weapon_dagger", slot: "off_hand" },
      {
        itemId: "item_wondrous_cloak_of_protection",
        slot: "cloak",
        isAttuned: true,
      },
      { itemId: "item_musical_instrument_lute", customName: "Silverstring" },
      { itemId: "item_pack_entertainers" },
      { itemId: "item_clothes_fine" },
      { itemId: "item_perfume", quantity: 2 },
      { itemId: "item_potion_healing", quantity: 2 },
    ],
    resources: [
      {
        id: "trait_bardic_inspiration",
        name: "Bardic Inspiration",
        current: 2,
        max: 4,
        resetCondition: "short_rest",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000114",
    name: "Vaerix the Ashen",
    raceId: "race_dragonborn",
    subraceId: "subrace_dragonborn_red",
    classes: [
      {
        classId: "class_paladin",
        classLevel: 9,
        subclassId: "subclass_paladin_devotion",
      },
    ],
    backgroundId: "background_noble",
    alignment: "Lawful Good",
    str: 18,
    dex: 10,
    con: 16,
    int: 10,
    wis: 12,
    cha: 16,
    maxHp: 85,
    currentHp: 61,
    testFocus:
      "Two magic items across two slots, one very large partial pool, three resources at once.",
    personalityTraits: "I speak slowly, because I mean everything I say.",
    ideals:
      "Duty. An oath given is a debt owed regardless of who is watching.",
    bonds: "The village of Emberfall took me in when my clan would not.",
    flaws: "I hold others to a standard I set for myself and never explained.",
    traits: [
      { traitId: "trait_paladin_prof_armor", source: "class_paladin_level_1" },
      { traitId: "trait_paladin_prof_weapons", source: "class_paladin_level_1" },
      { traitId: "trait_paladin_prof_skills", source: "class_paladin_level_1" },
      {
        traitId: "trait_paladin_prof_saving_throw",
        source: "class_paladin_level_1",
      },
      { traitId: "trait_divine_sense", source: "class_paladin_level_1" },
      { traitId: "trait_lay_on_hands", source: "class_paladin_level_1" },
      { traitId: "trait_fighting_style", source: "class_paladin_level_2" },
      { traitId: "trait_divine_smite", source: "class_paladin_level_2" },
      { traitId: "trait_divine_health", source: "class_paladin_level_3" },
      { traitId: "trait_sacred_oath", source: "class_paladin_level_3" },
      {
        traitId: "trait_channel_divinity",
        source: "subclass_paladin_devotion_level_3",
      },
      {
        traitId: "trait_sacred_weapon",
        source: "subclass_paladin_devotion_level_3",
      },
      { traitId: "trait_extra_attack", source: "class_paladin_level_5" },
      { traitId: "trait_aura_of_protection", source: "class_paladin_level_6" },
      {
        traitId: "trait_aura_of_devotion",
        source: "subclass_paladin_devotion_level_7",
      },
      { traitId: "trait_darkvision_60", source: "race_dragonborn" },
      {
        traitId: "trait_draconic_ancestry_red",
        source: "subrace_dragonborn_red",
      },
      { traitId: "trait_breath_weapon_fire", source: "subrace_dragonborn_red" },
      {
        traitId: "trait_damage_resistance_fire",
        source: "subrace_dragonborn_red",
      },
      { traitId: "trait_dragonborn_languages", source: "race_dragonborn" },
      { traitId: "trait_noble_prof_skills", source: "background_noble" },
    ],
    inventory: [
      { itemId: "item_armor_half_plate_plus_1", slot: "body" },
      { itemId: "item_weapon_longsword_plus_1", slot: "main_hand" },
      { itemId: "item_armor_shield", slot: "off_hand" },
      { itemId: "item_ring_protection", slot: "ring_1", isAttuned: true },
      { itemId: "item_focus_emblem", slot: "amulet" },
      { itemId: "item_potion_greater_healing", quantity: 2 },
      { itemId: "item_pack_explorers" },
      { itemId: "item_weapon_javelin", quantity: 3 },
    ],
    resources: [
      {
        id: "trait_lay_on_hands",
        name: "Lay on Hands",
        current: 27,
        max: 45,
        resetCondition: "long_rest",
      },
      {
        id: "trait_divine_sense",
        name: "Divine Sense",
        current: 2,
        max: 4,
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
  {
    id: "00000000-0000-0000-0000-000000000115",
    name: "Nyx Vale",
    raceId: "race_tiefling",
    classes: [
      {
        classId: "class_warlock",
        classLevel: 8,
        subclassId: "subclass_warlock_fiend",
      },
      {
        classId: "class_sorcerer",
        classLevel: 3,
        subclassId: "subclass_sorcerer_draconic",
      },
    ],
    backgroundId: "background_charlatan",
    alignment: "Neutral Evil",
    str: 8,
    dex: 14,
    con: 14,
    int: 13,
    wis: 10,
    cha: 19,
    maxHp: 77,
    currentHp: 1,
    testFocus:
      "One hit point from death, two fully drained pools, and a container holding other stacks.",
    personalityTraits:
      "I am always the calmest person in a room that is going badly.",
    ideals: "Power. Everything else is a story people tell about who has it.",
    bonds: "The thing I signed with still has the other half of the page.",
    flaws: "I cannot leave an insult unanswered, however expensive the answer.",
    traits: [
      { traitId: "trait_warlock_prof_armor", source: "class_warlock_level_1" },
      { traitId: "trait_warlock_prof_weapons", source: "class_warlock_level_1" },
      { traitId: "trait_warlock_prof_skills", source: "class_warlock_level_1" },
      {
        traitId: "trait_warlock_prof_saving_throw",
        source: "class_warlock_level_1",
      },
      { traitId: "trait_pact_magic", source: "class_warlock_level_1" },
      {
        traitId: "trait_dark_ones_blessing",
        source: "subclass_warlock_fiend_level_1",
      },
      { traitId: "trait_eldritch_invocations", source: "class_warlock_level_2" },
      { traitId: "trait_pact_boon", source: "class_warlock_level_3" },
      {
        traitId: "trait_dark_ones_own_luck",
        source: "subclass_warlock_fiend_level_6",
      },
      {
        traitId: "trait_font_of_magic",
        source: "multiclass_grant:class_sorcerer:level_1",
      },
      { traitId: "trait_metamagic", source: "class_sorcerer_level_3" },
      {
        traitId: "trait_draconic_resilience",
        source: "subclass_sorcerer_draconic_level_1",
      },
      { traitId: "trait_darkvision_60", source: "race_tiefling" },
      { traitId: "trait_hellish_resistance", source: "race_tiefling" },
      { traitId: "trait_infernal_legacy", source: "race_tiefling" },
      {
        traitId: "trait_charlatan_prof_skills",
        source: "background_charlatan",
      },
      { traitId: "trait_charlatan_prof_tools", source: "background_charlatan" },
    ],
    inventory: [
      { itemId: "item_armor_studded_leather", slot: "body" },
      { itemId: "item_weapon_quarterstaff", slot: "main_hand" },
      { itemId: "item_wondrous_bag_of_holding" },
      { itemId: "item_weapon_dagger", quantity: 2 },
      {
        itemId: "item_scroll_fireball",
        insideItemId: "item_wondrous_bag_of_holding",
      },
      {
        itemId: "item_potion_healing",
        quantity: 3,
        insideItemId: "item_wondrous_bag_of_holding",
      },
      {
        itemId: "item_clothes_costume",
        quantity: 2,
        insideItemId: "item_wondrous_bag_of_holding",
      },
      { itemId: "item_disguise_kit" },
      { itemId: "item_pouch" },
    ],
    resources: [
      {
        id: "trait_pact_magic",
        name: "Pact Magic Slots",
        current: 0,
        max: 2,
        resetCondition: "short_rest",
      },
      {
        id: "trait_font_of_magic",
        name: "Sorcery Points",
        current: 0,
        max: 3,
        resetCondition: "long_rest",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000116",
    name: "Master Ko Shen",
    raceId: "race_human",
    classes: [
      {
        classId: "class_monk",
        classLevel: 12,
        subclassId: "subclass_monk_open_hand",
      },
    ],
    backgroundId: "background_folk_hero",
    alignment: "Lawful Neutral",
    str: 12,
    dex: 20,
    con: 16,
    int: 10,
    wis: 18,
    cha: 8,
    maxHp: 99,
    currentHp: 99,
    testFocus:
      "No armour at all, a large half-spent pool, attuned boots, and one unattuned magic item waiting.",
    personalityTraits: "I finish my tea before I answer.",
    ideals:
      "Balance. Force applied early is force you do not need later.",
    bonds:
      "The monastery gate is still open to me. I have not walked back through it.",
    flaws: "I mistake my own stillness for other people's agreement.",
    traits: [
      { traitId: "trait_monk_prof_weapons", source: "class_monk_level_1" },
      { traitId: "trait_monk_prof_skills", source: "class_monk_level_1" },
      { traitId: "trait_monk_prof_tools", source: "class_monk_level_1" },
      { traitId: "trait_monk_prof_saving_throw", source: "class_monk_level_1" },
      {
        traitId: "trait_unarmored_defense_monk",
        source: "class_monk_level_1",
      },
      { traitId: "trait_martial_arts", source: "class_monk_level_1" },
      { traitId: "trait_ki", source: "class_monk_level_2" },
      { traitId: "trait_unarmored_movement", source: "class_monk_level_2" },
      {
        traitId: "trait_open_hand_technique",
        source: "subclass_monk_open_hand_level_3",
      },
      { traitId: "trait_deflect_missiles", source: "class_monk_level_3" },
      { traitId: "trait_slow_fall", source: "class_monk_level_4" },
      { traitId: "trait_extra_attack", source: "class_monk_level_5" },
      { traitId: "trait_stunning_strike", source: "class_monk_level_5" },
      { traitId: "trait_ki_empowered_strikes", source: "class_monk_level_6" },
      {
        traitId: "trait_wholeness_of_body",
        source: "subclass_monk_open_hand_level_6",
      },
      { traitId: "trait_evasion", source: "class_monk_level_7" },
      { traitId: "trait_stillness_of_mind", source: "class_monk_level_7" },
      { traitId: "trait_purity_of_body", source: "class_monk_level_10" },
      {
        traitId: "trait_tranquility",
        source: "subclass_monk_open_hand_level_11",
      },
      { traitId: "trait_human_languages", source: "race_human" },
      {
        traitId: "trait_folk_hero_prof_skills",
        source: "background_folk_hero",
      },
      { traitId: "trait_folk_hero_prof_tools", source: "background_folk_hero" },
    ],
    inventory: [
      { itemId: "item_weapon_quarterstaff", slot: "main_hand" },
      {
        itemId: "item_wondrous_boots_of_elvenkind",
        slot: "boots",
        isAttuned: true,
      },
      { itemId: "item_weapon_shortsword" },
      { itemId: "item_weapon_dart", quantity: 10 },
      { itemId: "item_vestments" },
      { itemId: "item_pack_explorers" },
      { itemId: "item_potion_greater_healing" },
      { itemId: "item_wondrous_headband_of_intellect" },
    ],
    resources: [
      {
        id: "trait_ki",
        name: "Ki Points",
        current: 6,
        max: 12,
        resetCondition: "short_rest",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000117",
    name: "Thistle Quickfoot",
    raceId: "race_gnome",
    subraceId: "subrace_gnome_rock",
    classes: [
      {
        classId: "class_wizard",
        classLevel: 14,
        subclassId: "subclass_wizard_evocation",
      },
    ],
    customBackgroundData: {
      name: "Guild Artificer",
      featureName: "Guild Membership",
      featureDescription:
        "The Tinkers' Concord vouches for you. Its halls will shelter you, and its members will speak on your behalf to local authorities.",
    },
    customTraitIds: ["trait_extra_language", "trait_noble_prof_tools"],
    alignment: "Neutral Good",
    str: 8,
    dex: 14,
    con: 14,
    int: 20,
    wis: 13,
    cha: 10,
    maxHp: 86,
    currentHp: 52,
    testFocus:
      "Custom background instead of a preset, ad-hoc granted traits, a dawn-recharging item pool.",
    personalityTraits:
      "I explain things at exactly the length they deserve, which is always too long.",
    ideals: "Knowledge. A question left unanswered is a debt.",
    bonds: "My workshop burned. The notebooks did not, and they are all I kept.",
    flaws: "I would rather be interesting than safe.",
    traits: [
      { traitId: "trait_wizard_prof_weapons", source: "class_wizard_level_1" },
      { traitId: "trait_wizard_prof_skills", source: "class_wizard_level_1" },
      {
        traitId: "trait_wizard_prof_saving_throw",
        source: "class_wizard_level_1",
      },
      { traitId: "trait_spellcasting_wizard", source: "class_wizard_level_1" },
      { traitId: "trait_arcane_recovery", source: "class_wizard_level_1" },
      {
        traitId: "trait_sculpt_spells",
        source: "subclass_wizard_evocation_level_2",
      },
      {
        traitId: "trait_evocation_savant",
        source: "subclass_wizard_evocation_level_2",
      },
      {
        traitId: "trait_potent_cantrip",
        source: "subclass_wizard_evocation_level_6",
      },
      {
        traitId: "trait_empowered_evocation",
        source: "subclass_wizard_evocation_level_10",
      },
      { traitId: "trait_darkvision_60", source: "race_gnome" },
      { traitId: "trait_gnome_cunning", source: "race_gnome" },
      { traitId: "trait_gnome_languages", source: "race_gnome" },
      { traitId: "trait_artificers_lore", source: "subrace_gnome_rock" },
      { traitId: "trait_tinker", source: "subrace_gnome_rock" },
    ],
    inventory: [
      { itemId: "item_wand_of_magic_missiles", slot: "main_hand" },
      {
        itemId: "item_wondrous_headband_of_intellect",
        slot: "head",
        isAttuned: true,
      },
      { itemId: "item_weapon_quarterstaff" },
      { itemId: "item_weapon_dagger" },
      { itemId: "item_scroll_fireball", quantity: 2 },
      { itemId: "item_potion_greater_healing" },
      { itemId: "item_case_map_or_scroll" },
      { itemId: "item_ink" },
      { itemId: "item_ink_pen" },
      { itemId: "item_paper", quantity: 20 },
    ],
    resources: [
      {
        id: "trait_arcane_recovery",
        name: "Arcane Recovery",
        current: 0,
        max: 1,
        resetCondition: "long_rest",
      },
      {
        id: "resource_wand_of_magic_missiles_charges",
        name: "Wand of Magic Missiles",
        current: 3,
        max: 7,
        resetCondition: "dawn",
      },
      {
        id: "resource_hit_dice_d6",
        name: "Hit Dice (d6)",
        current: 5,
        max: 14,
        resetCondition: "long_rest_half",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000118",
    name: "Kaelen Duskwarden",
    raceId: "race_elf",
    subraceId: "subrace_elf_wood",
    classes: [
      {
        classId: "class_ranger",
        classLevel: 12,
        subclassId: "subclass_ranger_hunter",
      },
      {
        classId: "class_druid",
        classLevel: 5,
        subclassId: "subclass_druid_land",
      },
    ],
    backgroundId: "background_outlander",
    alignment: "True Neutral",
    str: 14,
    dex: 18,
    con: 16,
    int: 10,
    wis: 18,
    cha: 8,
    maxHp: 152,
    currentHp: 0,
    testFocus:
      "Downed at zero hit points, high-level multiclass, big ammunition stack, drained wild shape.",
    personalityTraits:
      "I go quiet long before anyone else notices there is a reason to.",
    ideals: "Preservation. The wood was here first and will be here after.",
    bonds:
      "Something crossed the border under my watch. I am still following it.",
    flaws: "I trust animals faster than I have ever trusted a person.",
    traits: [
      { traitId: "trait_ranger_prof_armor", source: "class_ranger_level_1" },
      { traitId: "trait_ranger_prof_weapons", source: "class_ranger_level_1" },
      { traitId: "trait_ranger_prof_skills", source: "class_ranger_level_1" },
      {
        traitId: "trait_ranger_prof_saving_throw",
        source: "class_ranger_level_1",
      },
      { traitId: "trait_favored_enemy", source: "class_ranger_level_1" },
      { traitId: "trait_natural_explorer", source: "class_ranger_level_1" },
      { traitId: "trait_fighting_style", source: "class_ranger_level_2" },
      { traitId: "trait_ranger_archetype", source: "class_ranger_level_3" },
      { traitId: "trait_primeval_awareness", source: "class_ranger_level_3" },
      {
        traitId: "trait_hunters_prey",
        source: "subclass_ranger_hunter_level_3",
      },
      { traitId: "trait_extra_attack", source: "class_ranger_level_5" },
      { traitId: "trait_lands_stride", source: "class_ranger_level_8" },
      { traitId: "trait_hide_in_plain_sight", source: "class_ranger_level_10" },
      {
        traitId: "trait_hunters_defensive_tactics",
        source: "subclass_ranger_hunter_level_11",
      },
      {
        traitId: "trait_druidic",
        source: "multiclass_grant:class_druid:level_1",
      },
      {
        traitId: "trait_druid_prof_armor",
        source: "multiclass_grant:class_druid:level_1",
      },
      { traitId: "trait_wild_shape", source: "class_druid_level_2" },
      { traitId: "trait_druid_circle", source: "class_druid_level_2" },
      {
        traitId: "trait_natural_recovery",
        source: "subclass_druid_land_level_2",
      },
      { traitId: "trait_darkvision_60", source: "race_elf" },
      { traitId: "trait_keen_senses", source: "race_elf" },
      { traitId: "trait_fey_ancestry", source: "race_elf" },
      { traitId: "trait_trance", source: "race_elf" },
      { traitId: "trait_mask_of_the_wild", source: "subrace_elf_wood" },
      {
        traitId: "trait_outlander_prof_skills",
        source: "background_outlander",
      },
    ],
    inventory: [
      { itemId: "item_armor_studded_leather", slot: "body" },
      { itemId: "item_weapon_longbow", slot: "main_hand" },
      { itemId: "item_weapon_shortsword", quantity: 2, slot: "off_hand" },
      {
        itemId: "item_wondrous_cloak_of_protection",
        slot: "cloak",
        isAttuned: true,
      },
      { itemId: "item_ammo_arrow", quantity: 40 },
      { itemId: "item_focus_reliquary" },
      { itemId: "item_pack_explorers" },
      { itemId: "item_potion_greater_healing", quantity: 2 },
      { itemId: "item_rope_hempen" },
    ],
    resources: [
      {
        id: "trait_wild_shape",
        name: "Wild Shape",
        current: 0,
        max: 2,
        resetCondition: "short_rest",
      },
      {
        id: "trait_natural_recovery",
        name: "Natural Recovery",
        current: 1,
        max: 1,
        resetCondition: "long_rest",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000119",
    name: "Dame Sable Orrin",
    raceId: "race_half_orc",
    classes: [
      {
        classId: "class_fighter",
        classLevel: 20,
        subclassId: "subclass_fighter_battle_master",
      },
    ],
    backgroundId: "background_soldier",
    alignment: "Lawful Neutral",
    str: 20,
    dex: 14,
    con: 20,
    int: 10,
    wis: 12,
    cha: 14,
    maxHp: 224,
    currentHp: 224,
    testFocus:
      "Ceiling case: level 20, every slot filled, attunement at the cap of three, four resources.",
    personalityTraits:
      "I give orders as questions and expect them followed anyway.",
    ideals:
      "Discipline. The line holds because everybody in it decided it would.",
    bonds:
      "Twelve of mine came home. I know all of their names and all of the others.",
    flaws: "I have never once said the thing I actually meant to say.",
    traits: [
      { traitId: "trait_fighter_prof_armor", source: "class_fighter_level_1" },
      { traitId: "trait_fighter_prof_weapons", source: "class_fighter_level_1" },
      { traitId: "trait_fighter_prof_skills", source: "class_fighter_level_1" },
      {
        traitId: "trait_fighter_prof_saving_throw",
        source: "class_fighter_level_1",
      },
      { traitId: "trait_fighting_style", source: "class_fighter_level_1" },
      { traitId: "trait_second_wind", source: "class_fighter_level_1" },
      { traitId: "trait_action_surge", source: "class_fighter_level_2" },
      {
        traitId: "trait_combat_superiority",
        source: "subclass_fighter_battle_master_level_3",
      },
      {
        traitId: "trait_student_of_war",
        source: "subclass_fighter_battle_master_level_3",
      },
      { traitId: "trait_extra_attack", source: "class_fighter_level_5" },
      {
        traitId: "trait_know_your_enemy",
        source: "subclass_fighter_battle_master_level_7",
      },
      { traitId: "trait_indomitable", source: "class_fighter_level_9" },
      {
        traitId: "trait_relentless",
        source: "subclass_fighter_battle_master_level_15",
      },
      { traitId: "trait_darkvision_60", source: "race_half_orc" },
      { traitId: "trait_relentless_endurance", source: "race_half_orc" },
      { traitId: "trait_savage_attacks", source: "race_half_orc" },
      { traitId: "trait_half_orc_languages", source: "race_half_orc" },
      { traitId: "trait_soldier_prof_skills", source: "background_soldier" },
    ],
    inventory: [
      { itemId: "item_armor_plate", slot: "body" },
      {
        itemId: "item_weapon_longsword_plus_1",
        slot: "main_hand",
        customName: "Oathkeeper",
      },
      { itemId: "item_armor_shield", slot: "off_hand" },
      {
        itemId: "item_wondrous_cloak_of_protection",
        slot: "cloak",
        isAttuned: true,
      },
      { itemId: "item_ring_protection", slot: "ring_1", isAttuned: true },
      {
        itemId: "item_wondrous_amulet_of_health",
        slot: "amulet",
        isAttuned: true,
      },
      { itemId: "item_wondrous_boots_of_elvenkind", slot: "boots" },
      { itemId: "item_weapon_greatsword" },
      { itemId: "item_weapon_javelin", quantity: 6 },
      { itemId: "item_potion_greater_healing", quantity: 3 },
      { itemId: "item_pack_explorers" },
    ],
    resources: [
      {
        id: "trait_action_surge",
        name: "Action Surge",
        current: 0,
        max: 2,
        resetCondition: "short_rest",
      },
      {
        id: "trait_second_wind",
        name: "Second Wind",
        current: 1,
        max: 1,
        resetCondition: "short_rest",
      },
      {
        id: "trait_combat_superiority",
        name: "Superiority Dice",
        current: 2,
        max: 6,
        resetCondition: "short_rest",
      },
      {
        id: "trait_indomitable",
        name: "Indomitable",
        current: 1,
        max: 3,
        resetCondition: "long_rest",
      },
    ],
  },
];

// #endregion

// #region Seeding

const totalLevelOf = (character: SampleCharacter): number =>
  character.classes.reduce((sum, entry) => sum + entry.classLevel, 0);

const packStamp = {
  packId: SAMPLE_PACK_ID,
  packVersion: SAMPLE_PACK_VERSION,
  publishedAt: new Date(),
};

/** The authored item as the column stores it, with the state gates filled in. */
const toItemRule = (item: SampleItem): ItemDefinition => {
  const { modifiers, ...rule } = item.itemRule;

  return {
    ...rule,
    id: item.id,
    name: item.name,
    weight: item.pounds,
    ...(modifiers && {
      modifiers: modifiers.map((modifier) => ({
        requiredStates: [],
        forbiddenStates: [],
        ...modifier,
      })),
    }),
  };
};

/**
 * Writes the placeholder reference rows the roster points at.
 *
 * Every insert is onConflictDoNothing: an id the compendium already defines
 * keeps its authored row, so running this after the real pack lands is a no-op
 * for that entity rather than a regression.
 */
const seedReferenceStubs = async () => {
  await db
    .insert(subclasses)
    .values(
      SAMPLE_SUBCLASSES.map((subclass) => ({
        id: subclass.id,
        parentClassId: subclass.parentClassId,
        name: subclass.name,
        lore: { shortDescription: subclass.shortDescription },
        ...packStamp,
      })),
    )
    .onConflictDoNothing({ target: subclasses.id });

  await db
    .insert(backgrounds)
    .values(
      SAMPLE_BACKGROUNDS.map((background) => ({
        id: background.id,
        name: background.name,
        featureName: background.featureName,
        featureDescription: background.featureDescription,
        ideals: [],
        bonds: [],
        flaws: [],
        personalityTraits: [],
        startingEquipment: EMPTY_STARTING_EQUIPMENT,
        lore: { shortDescription: background.shortDescription },
        ...packStamp,
      })),
    )
    .onConflictDoNothing({ target: backgrounds.id });

  await db
    .insert(items)
    .values(
      SAMPLE_ITEMS.map((item) => ({
        id: item.id,
        name: item.name,
        // the column is hundredths of a pound; the rule payload is pounds
        weight: Math.round(item.pounds * 100),
        description: item.description,
        itemRule: toItemRule(item),
        weaponRule: item.weaponRule
          ? ({ id: item.id, name: item.name, ...item.weaponRule } satisfies WeaponDefinition)
          : null,
        isBundle: false,
        ...packStamp,
      })),
    )
    .onConflictDoNothing({ target: items.id });
};

/** Makes sure the campaign the mock auth user owns exists before characters join it. */
const seedCampaign = async () => {
  await db
    .insert(campaigns)
    .values({
      id: CAMPAIGN_ID,
      name: CAMPAIGN_NAME,
      createdByUserId: OWNER_USER_ID,
    })
    .onConflictDoNothing({ target: campaigns.id });

  await db
    .insert(campaignMembers)
    .values({ campaignId: CAMPAIGN_ID, userId: OWNER_USER_ID, role: "owner" })
    .onConflictDoNothing();
};

/**
 * Rewrites one character and its ledgers inside a single transaction.
 *
 * Child rows are cleared first so a second run cannot double up inventory or
 * trait grants. Every delete is keyed on this character's id alone, which is
 * one of the ten this file declares.
 */
const seedCharacter = async (character: SampleCharacter) => {
  const level = totalLevelOf(character);

  const columns = {
    campaignId: CAMPAIGN_ID,
    name: character.name,
    level,
    raceId: character.raceId,
    subraceId: character.subraceId ?? null,
    str: character.str,
    dex: character.dex,
    con: character.con,
    int: character.int,
    wis: character.wis,
    cha: character.cha,
    alignment: character.alignment,
    backgroundId: character.backgroundId ?? null,
    customBackgroundData: character.customBackgroundData ?? null,
    personalityTraits: character.personalityTraits,
    ideals: character.ideals,
    bonds: character.bonds,
    flaws: character.flaws,
    currentHp: character.currentHp,
    maxHp: character.maxHp,
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(characters)
      .values({ id: character.id, ...columns, inventorySnapshot: [] })
      .onConflictDoUpdate({ target: characters.id, set: columns });

    // clear this character's ledgers so the run is repeatable
    await tx
      .delete(characterInventory)
      .where(eq(characterInventory.characterId, character.id));
    await tx
      .delete(characterResources)
      .where(eq(characterResources.characterId, character.id));
    await tx
      .delete(characterTraits)
      .where(eq(characterTraits.characterId, character.id));
    await tx
      .delete(characterCustomTraits)
      .where(eq(characterCustomTraits.characterId, character.id));
    await tx
      .delete(characterClasses)
      .where(eq(characterClasses.characterId, character.id));

    await tx.insert(characterClasses).values(
      character.classes.map((entry) => ({
        characterId: character.id,
        classId: entry.classId,
        classLevel: entry.classLevel,
        subclassId: entry.subclassId ?? null,
      })),
    );

    if (character.traits.length > 0) {
      await tx.insert(characterTraits).values(
        character.traits.map((grant) => ({
          characterId: character.id,
          traitId: grant.traitId,
          source: grant.source,
        })),
      );
    }

    if (character.customTraitIds && character.customTraitIds.length > 0) {
      const origin = character.customBackgroundData?.name ?? "Custom";
      await tx.insert(characterCustomTraits).values(
        character.customTraitIds.map((traitId) => ({
          characterId: character.id,
          traitId,
          sourceOrigin: `Background: Custom (${origin})`,
        })),
      );
    }

    if (character.inventory.length > 0) {
      // row ids are minted here so a stack can name the container it sits in
      const rowIdByItemId = new Map(
        character.inventory.map((row) => [row.itemId, randomUUID()] as const),
      );

      await tx.insert(characterInventory).values(
        character.inventory.map((row) => ({
          id: rowIdByItemId.get(row.itemId),
          characterId: character.id,
          itemId: row.itemId,
          quantity: row.quantity ?? 1,
          slot: row.slot ?? "backpack",
          isAttuned: row.isAttuned ?? false,
          customName: row.customName ?? null,
          containerId: row.insideItemId
            ? (rowIdByItemId.get(row.insideItemId) ?? null)
            : null,
        })),
      );
    }

    if (character.resources.length > 0) {
      await tx.insert(characterResources).values(
        character.resources.map((resource) => ({
          id: resource.id,
          characterId: character.id,
          name: resource.name,
          current: resource.current,
          max: resource.max,
          resetCondition: resource.resetCondition,
        })),
      );
    }
  });
};

// #endregion

const run = async () => {
  console.log(
    `Seeding ${ROSTER.length} sample characters into campaign ${CAMPAIGN_ID}.`,
  );
  console.log(
    `Reference stubs are tagged pack_id='${SAMPLE_PACK_ID}' and never overwrite an existing row.`,
  );

  await seedReferenceStubs();
  await seedCampaign();

  for (const character of ROSTER) {
    await seedCharacter(character);
  }

  console.table(
    ROSTER.map((character) => ({
      Name: character.name,
      Lvl: totalLevelOf(character),
      Build: character.classes
        .map((entry) => `${entry.classId.replace("class_", "")} ${entry.classLevel}`)
        .join(" / "),
      HP: `${character.currentHp}/${character.maxHp}`,
      Items: character.inventory.length,
      Res: character.resources.length,
    })),
  );

  console.log("\nSheet URLs:");
  for (const character of ROSTER) {
    console.log(
      `  ${character.name.padEnd(20)} ${SHEET_URL_BASE}/${character.id}`,
    );
  }
  console.log(
    `\nAll ten sit in campaign ${CAMPAIGN_ID}, owned by '${OWNER_USER_ID}' - the id the web client sends as x-tester-id.`,
  );
};

run()
  .catch((error) => {
    console.error("Sample character seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });

export { ROSTER, SAMPLE_ITEMS, SAMPLE_PACK_ID, SHEET_URL_BASE };
