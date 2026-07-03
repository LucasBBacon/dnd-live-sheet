import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  backgrounds,
  classes,
  items,
  races,
  subclasses,
  subraces,
  traits,
} from "./reference.js";

// #region CORE CHARACTER ENTITY

export const characters = pgTable("character", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),

  // lineage links
  raceId: varchar("race_id", { length: 100 })
    .references(() => races.id)
    .notNull(),
  subraceId: varchar("race_id", { length: 100 })
    .references(() => subraces.id)
    .notNull(),

  // base ability scores (flattened for index and query)
  str: integer("str").notNull(),
  dex: integer("dex").notNull(),
  con: integer("con").notNull(),
  int: integer("int").notNull(),
  wis: integer("wis").notNull(),
  cha: integer("cha").notNull(),

  // identity & background
  alignment: varchar("alignment", { length: 50 }).notNull(),
  backgroundId: varchar("background_id", { length: 100 }).references(
    () => backgrounds.id,
  ),

  // stored as JSONB because it only applies to custom setups
  // odes not require relational joins
  customBackgroundData: jsonb("custom_background_data").$type<{
    name: string;
    featureName: string;
    featureDescription: string;
  } | null>(),

  // flavor text
  personalityTraits: text("personality_traits"),
  ideals: text("ideals"),
  bonds: text("bonds"),
  flaws: text("flaws"),

  currentHp: integer("current_hp"),

  // TODO - INVENTORY
  temporaryInventory: jsonb("temporary_inventory").default([]),
});

// #endregion

// #region MULTICLASSING & PROGRESSION TRACKER

/*
 * allows characters to have multiple classes,
 * composite primary key ensures characters can't have the same class twice
 */
export const characterClasses = pgTable(
  "character_classes",
  {
    characterId: uuid("character_id")
      .references(() => characters.id, { onDelete: "cascade" })
      .notNull(),
    classId: varchar("class_id", { length: 100 })
      .references(() => classes.id)
      .notNull(),
    subclassId: varchar("subclass_id", { length: 100 }).references(
      () => subclasses.id,
    ),

    level: integer("level").notNull().default(1),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.characterId, table.classId] }),
  }),
);

// #endregion

// #region AD-HOC TRAITS

/**
 * Use to store traits granted by custom backgrounds, specific DM rewards,
 * or one-off feats that don't fit into class progression pipeline.
 */
export const characterCustomTraits = pgTable("character_custom_traits", {
  id: uuid("id").primaryKey().defaultRandom(),
  characterId: uuid("character_id")
    .references(() => characters.id, { onDelete: "cascade" })
    .notNull(),
  traitId: varchar("trait_id", { length: 100 })
    .references(() => traits.id)
    .notNull(),

  // provenance stamp
  sourceOrigin: varchar("source_origin", { length: 255 }).notNull(),
});

// #endregion

// #region INVENTORY

export const EQUIPMENT_SLOTS = [
  "backpack",
  "main_hand",
  "off_hand",
  "armor",
  "head",
  "cloak",
  "ring_1",
  "ring_2",
  "amulet",
  "boots",
  "gloves",
] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

export const characterInventory = pgTable(
  "character_inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(), // unique instance id for this specific item
    characterId: uuid("character_id")
      .references(() => characters.id, { onDelete: "cascade" })
      .notNull(),
    itemId: varchar("item_id", { length: 100 })
      .references(() => items.id)
      .notNull(),

    quantity: integer("quantity").notNull().default(1),

    // operational slot placement
    slot: varchar("slot", { length: 50 }).notNull().default("backpack"),

    // attunement state tracker
    isAttuned: boolean("is_attuned").notNull().default(false),
  },
  (table) => ({
    // composite pk prevents duplicate rows for the same item
    // UPDATE quantity instead
    pk: primaryKey({ columns: [table.characterId, table.itemId] }),
  }),
);

// #endregion

// #region RESOURCES

export const restConditionEnum = pgEnum("rest_condition", [
  "short_rest",
  "long_rest",
  "long_rest_half",
  "dawn",
  "never",
]);

export const characterResources = pgTable(
  "character_resources",
  {
    id: varchar("id", { length: 100 }).notNull(),
    characterId: uuid("character_id")
      .references(() => characters.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    current: integer("current").notNull().default(0),
    max: integer("max").notNull().default(0),
    resetCondition: restConditionEnum("reset_condition")
      .notNull()
      .default("never"),
  },
  (table) => ({
    // a composite primary key ensures the character can never have duplicate
    // ledgers for the exact same trait. If engine attempts to grant a character
    // 'trait_action_surge' twice, database rejects it
    pk: primaryKey({ columns: [table.characterId, table.id] }),
  }),
);

// #endregion
