import type {
  FeatPrerequisites,
  ModifiersListData,
  TraitEffect,
} from "@project/shared";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  varchar,
} from "drizzle-orm/pg-core";

// --------------------------------------------------------------
// CORE REFERENCE ENTITIES
// --------------------------------------------------------------

export const traits = pgTable("traits", {
  id: varchar("id", { length: 100 }).primaryKey(), // e.g., 'trait_dwarf_speed'
  name: varchar("name", { length: 255 }).notNull(),
  lore: jsonb("lore")
    .$type<{ shortDescription: string; fullText?: string }>()
    .notNull(), // keep lore as JSONB, strictly UI

  // effects are kept as JSONB because structure is highly variable
  // it's evaluated entirely in memory during math calcs
  effects: jsonb("effects").$type<TraitEffect>().notNull(),

  isStartingProficiency: boolean("is_starting_proficiency")
    .default(false)
    .notNull(),
});

export const feats = pgTable("feats", {
  id: varchar("id", { length: 100 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(), // original, general, epic
  source: varchar("source", { length: 100 }),
  repeatable: boolean("repeatable").default(false).notNull(),

  lore: jsonb("lore")
    .$type<{ shortDescription: string; fullText?: string }>()
    .notNull(), // keep lore as JSONB, strictly UI

  // complex logical prerequisites remain jsonb they're evaluated in the ui wizard
  prerequisites: jsonb("prerequisites").$type<FeatPrerequisites>(),
});

// --------------------------------------------------------------
// RELATIONAL JUNCTION TABLES
// --------------------------------------------------------------

// replaces 'grantedTraits' array
// enforces strict referential integrity
export const featTraits = pgTable(
  "feat_traits",
  {
    featId: varchar("feat_id", { length: 100 })
      .references(() => feats.id)
      .notNull(),
    traitId: varchar("trait_id", { length: 100 })
      .references(() => traits.id)
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.featId, table.traitId] }),
  }),
);

// replaces 'requiredFeatIds array inside prerequisites
export const featPrerequisiteFeats = pgTable(
  "feat_prerequisites",
  {
    featId: varchar("feat_id", { length: 100 })
      .references(() => feats.id)
      .notNull(),
    requiredFeatId: varchar("required_feat_id", { length: 100 })
      .references(() => feats.id)
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.featId, table.requiredFeatId] }),
  }),
);

// --------------------------------------------------------------
// RACE AND SUBRACE ARCHITECTURE
// --------------------------------------------------------------

export const races = pgTable("races", {
  id: varchar("id", { length: 100 }).primaryKey(), // e.g., 'race_dwarf'
  name: varchar("name", { length: 255 }).notNull(),
  speed: integer("speed").notNull(),
  requiresSubrace: boolean("requires_subrace").default(false).notNull(),
  displayLabel: varchar("display_label", { length: 255 }),
  lore: jsonb("lore")
    .$type<{ shortDescription: string; fullText?: string }>()
    .notNull(),
});

export const subraces = pgTable("subraces", {
  id: varchar("id", { length: 100 }).primaryKey(), //e.g., 'subrace_dwarf_hill'
  parentRaceId: varchar("parent_race_id", { length: 100 })
    .references(() => races.id)
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  lore: jsonb("lore")
    .$type<{ shortDescription: string; fullText?: string }>()
    .notNull(),
});

export const raceTraits = pgTable(
  "race_traits",
  {
    raceId: varchar("race_id", { length: 100 })
      .references(() => races.id)
      .notNull(),
    traitId: varchar("trait_id", { length: 100 })
      .references(() => traits.id)
      .notNull(),
  },
  (table) => ({ pk: primaryKey({ columns: [table.raceId, table.traitId] }) }),
);

export const subraceTraits = pgTable(
  "subrace_traits",
  {
    subraceId: varchar("subrace_id", { length: 100 })
      .references(() => subraces.id)
      .notNull(),
    traitId: varchar("trait_id", { length: 100 })
      .references(() => traits.id)
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.subraceId, table.traitId] }),
  }),
);

// --------------------------------------------------------------
// CLASS AND SUBCLASS ARCHITECTURE
// --------------------------------------------------------------

export const classes = pgTable("classes", {
  id: varchar("id", { length: 100 }).primaryKey(), // e.g., class_fighter
  name: varchar("name", { length: 255 }).notNull(),
  hitDie: integer("hit_die").notNull(), // e.g., 10 for Fighter

  // enforce when a subclass should be chosen
  subclassRequirementLevel: integer("subclass_req_level").notNull(),

  lore: jsonb("lore")
    .$type<{ shortDescription: string; fullText?: string }>()
    .notNull(),

  // starting equipment/wealth options can be stored as jsonb as they're only used once
  startingEquipment: jsonb("starting_equipment").notNull(),
});

export const subclasses = pgTable("subclasses", {
  id: varchar("id", { length: 100 }).primaryKey(),
  parentClassId: varchar("parent_class_id", { length: 100 })
    .references(() => classes.id)
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  lore: jsonb("lore")
    .$type<{ shortDescription: string; fullText?: string }>()
    .notNull(),
});

export const classMulticlassTraits = pgTable(
  "class_multiclass_traits",
  {
    classId: varchar("class_id", { length: 100 })
      .references(() => classes.id)
      .notNull(),
    traitId: varchar("trait_id", { length: 100 })
      .references(() => traits.id)
      .notNull(),
  },
  (table) => ({ pk: primaryKey({ columns: [table.classId, table.traitId] }) }),
);

// --------------------------------------------------------------
// THE EXPLODED PROGRESSION ENGINE
// --------------------------------------------------------------

export const classLevels = pgTable(
  "class_levels",
  {
    classId: varchar("class_id", { length: 100 })
      .references(() => classes.id)
      .notNull(),
    level: integer("level").notNull(),

    classSpecificScaling: jsonb("class_specific_scaling"),
    spellcastingProgression: jsonb("spellcasting_progression"),
  },
  (table) => ({ pk: primaryKey({ columns: [table.classId, table.level] }) }),
);

export const subclassLevels = pgTable(
  "subclass_levels",
  {
    subclassId: varchar("subclass_id", { length: 100 })
      .references(() => subclasses.id)
      .notNull(),
    level: integer("level").notNull(),
    subclassSpecificScaling: jsonb("subclass_specific_scaling"),
    bonusSpells: jsonb("bonus_spells"),
    spellsAddedToList: jsonb("spells_added_to_list"),
  },
  (table) => ({ pk: primaryKey({ columns: [table.subclassId, table.level] }) }),
);

export const classProgressions = pgTable(
  "class_progressions",
  {
    classId: varchar("class_id", { length: 100 })
      .references(() => classes.id)
      .notNull(),
    level: integer("level").notNull(),
    traitId: varchar("trait_id", { length: 100 })
      .references(() => traits.id)
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.classId, table.level, table.traitId] }),
  }),
);

export const subclassProgressions = pgTable(
  "subclass_progressions",
  {
    subclassId: varchar("subclass_id", { length: 100 })
      .references(() => subclasses.id)
      .notNull(),
    level: integer("level").notNull(),
    traitId: varchar("trait_id", { length: 100 })
      .references(() => traits.id)
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.subclassId, table.level, table.traitId] }),
  }),
);
