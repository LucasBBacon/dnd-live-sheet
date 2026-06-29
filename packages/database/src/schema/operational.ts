import {
  integer,
  jsonb,
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

// --------------------------------------------------------------
// CORE CHARACTER ENTITY
// --------------------------------------------------------------

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

  // TODO - INVENTORY
  temporaryInventory: jsonb("temporary_inventory").default([]),
});

// --------------------------------------------------------------
// MULTICLASSING & PROGRESSION TRACKER
// --------------------------------------------------------------

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

// --------------------------------------------------------------
// AD-HOC TRAITS
// --------------------------------------------------------------

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

// --------------------------------------------------------------
// INVENTORY
// --------------------------------------------------------------

export const characterInventory = pgTable(
  "character_inventory",
  {
    characterId: uuid("character_id")
      .references(() => characters.id, { onDelete: "cascade" })
      .notNull(),
    itemId: varchar("item_id", { length: 100 })
      .references(() => items.id)
      .notNull(),
    quantity: integer("quantity").notNull().default(1),
  },
  (table) => ({
    // composite pk prevents duplicate rows for the same item
    // UPDATE quantity instead
    pk: primaryKey({ columns: [table.characterId, table.itemId] }),
  }),
);
