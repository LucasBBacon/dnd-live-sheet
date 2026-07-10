import type {
  ClassMulticlassPrerequisites,
  FeatPrerequisites,
  ItemDefinition,
  TraitEffect,
  WeaponDefinition,
} from "@project/shared";
import { sql } from "drizzle-orm";
import { index } from "drizzle-orm/gel-core";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const referenceSourceTypeEnum = pgEnum("reference_source_type", [
  "core",
  "homebrew",
]);

export const importRunStatusEnum = pgEnum("import_run_status", [
  "staged",
  "validated",
  "planned",
  "applied",
  "failed",
]);

export const importRowStatusEnum = pgEnum("import_row_status", [
  "pending",
  "validated",
  "applied",
  "failed",
  "skipped",
]);

export const importIssueSeverityEnum = pgEnum("import_issue_severity", [
  "info",
  "warning",
  "error",
]);

export const rollbackRunStatusEnum = pgEnum("rollback_run_status", [
  "planned",
  "applied",
  "failed",
]);

export const rollbackRowStatusEnum = pgEnum("rollback_row_status", [
  "pending",
  "planned",
  "applied",
  "failed",
  "skipped",
]);

export const rollbackIssueSeverityEnum = pgEnum("rollback_issue_severity", [
  "info",
  "warning",
  "error",
]);

const buildReferenceScopeChecks = (
  tableName: string,
  table: {
    sourceType: unknown;
    ownerCampaignId: unknown;
    ownerCharacterId: unknown;
    createdByUserId: unknown;
    isPublished: unknown;
  },
) => ({
  [`${tableName}_core_scope_check`]: check(
    `${tableName}_core_scope_check`,
    sql`(
      (${table.sourceType} = 'core' AND ${table.ownerCampaignId} IS NULL AND ${table.ownerCharacterId} IS NULL AND ${table.createdByUserId} IS NULL AND ${table.isPublished} = true)
      OR
      (${table.sourceType} = 'homebrew' AND ${table.createdByUserId} IS NOT NULL AND ${table.ownerCampaignId} IS NOT NULL)
    )`,
  ),
  [`${tableName}_character_scope_check`]: check(
    `${tableName}_character_scope_check`,
    sql`${table.ownerCharacterId} IS NULL OR ${table.ownerCampaignId} IS NOT NULL`,
  ),
});

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
  effects: jsonb("effects").$type<TraitEffect[]>().notNull(),

  isStartingProficiency: boolean("is_starting_proficiency")
    .default(false)
    .notNull(),
  sourceType: referenceSourceTypeEnum("source_type").default("core").notNull(),
  ownerCampaignId: uuid("owner_campaign_id"),
  ownerCharacterId: uuid("owner_character_id"),
  createdByUserId: varchar("created_by_user_id", { length: 255 }),
  isPublished: boolean("is_published").default(true).notNull(),
  supersedesId: varchar("supersedes_id", { length: 100 }),
  packId: varchar("pack_id", { length: 100 }),
  packVersion: integer("pack_version"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => ({
  ...buildReferenceScopeChecks("traits", table),
}));

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
  sourceType: referenceSourceTypeEnum("source_type").default("core").notNull(),
  ownerCampaignId: uuid("owner_campaign_id"),
  ownerCharacterId: uuid("owner_character_id"),
  createdByUserId: varchar("created_by_user_id", { length: 255 }),
  isPublished: boolean("is_published").default(true).notNull(),
  supersedesId: varchar("supersedes_id", { length: 100 }),
  packId: varchar("pack_id", { length: 100 }),
  packVersion: integer("pack_version"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => ({
  ...buildReferenceScopeChecks("feats", table),
}));

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
  sourceType: referenceSourceTypeEnum("source_type").default("core").notNull(),
  ownerCampaignId: uuid("owner_campaign_id"),
  ownerCharacterId: uuid("owner_character_id"),
  createdByUserId: varchar("created_by_user_id", { length: 255 }),
  isPublished: boolean("is_published").default(true).notNull(),
  supersedesId: varchar("supersedes_id", { length: 100 }),
  packId: varchar("pack_id", { length: 100 }),
  packVersion: integer("pack_version"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => ({
  ...buildReferenceScopeChecks("races", table),
}));

export const subraces = pgTable("subraces", {
  id: varchar("id", { length: 100 }).primaryKey(), //e.g., 'subrace_dwarf_hill'
  parentRaceId: varchar("parent_race_id", { length: 100 })
    .references(() => races.id)
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  lore: jsonb("lore")
    .$type<{ shortDescription: string; fullText?: string }>()
    .notNull(),
  sourceType: referenceSourceTypeEnum("source_type").default("core").notNull(),
  ownerCampaignId: uuid("owner_campaign_id"),
  ownerCharacterId: uuid("owner_character_id"),
  createdByUserId: varchar("created_by_user_id", { length: 255 }),
  isPublished: boolean("is_published").default(true).notNull(),
  supersedesId: varchar("supersedes_id", { length: 100 }),
  packId: varchar("pack_id", { length: 100 }),
  packVersion: integer("pack_version"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => ({
  ...buildReferenceScopeChecks("subraces", table),
}));

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
  multiclassPrerequisites:
    jsonb("multiclass_prerequisites").$type<ClassMulticlassPrerequisites>(),
  sourceType: referenceSourceTypeEnum("source_type").default("core").notNull(),
  ownerCampaignId: uuid("owner_campaign_id"),
  ownerCharacterId: uuid("owner_character_id"),
  createdByUserId: varchar("created_by_user_id", { length: 255 }),
  isPublished: boolean("is_published").default(true).notNull(),
  supersedesId: varchar("supersedes_id", { length: 100 }),
  packId: varchar("pack_id", { length: 100 }),
  packVersion: integer("pack_version"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => ({
  ...buildReferenceScopeChecks("classes", table),
}));

export const subclasses = pgTable("subclasses", {
  id: varchar("id", { length: 100 }).primaryKey(),
  parentClassId: varchar("parent_class_id", { length: 100 })
    .references(() => classes.id)
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  lore: jsonb("lore")
    .$type<{ shortDescription: string; fullText?: string }>()
    .notNull(),
  sourceType: referenceSourceTypeEnum("source_type").default("core").notNull(),
  ownerCampaignId: uuid("owner_campaign_id"),
  ownerCharacterId: uuid("owner_character_id"),
  createdByUserId: varchar("created_by_user_id", { length: 255 }),
  isPublished: boolean("is_published").default(true).notNull(),
  supersedesId: varchar("supersedes_id", { length: 100 }),
  packId: varchar("pack_id", { length: 100 }),
  packVersion: integer("pack_version"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => ({
  ...buildReferenceScopeChecks("subclasses", table),
}));

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
    sourceType: referenceSourceTypeEnum("source_type").default("core").notNull(),
    ownerCampaignId: uuid("owner_campaign_id"),
    ownerCharacterId: uuid("owner_character_id"),
    createdByUserId: varchar("created_by_user_id", { length: 255 }),
    isPublished: boolean("is_published").default(true).notNull(),
    packId: varchar("pack_id", { length: 100 }),
    packVersion: integer("pack_version"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.classId, table.level, table.traitId] }),
    ...buildReferenceScopeChecks("class_progressions", table),
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
    sourceType: referenceSourceTypeEnum("source_type").default("core").notNull(),
    ownerCampaignId: uuid("owner_campaign_id"),
    ownerCharacterId: uuid("owner_character_id"),
    createdByUserId: varchar("created_by_user_id", { length: 255 }),
    isPublished: boolean("is_published").default(true).notNull(),
    packId: varchar("pack_id", { length: 100 }),
    packVersion: integer("pack_version"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.subclassId, table.level, table.traitId] }),
    ...buildReferenceScopeChecks("subclass_progressions", table),
  }),
);

// --------------------------------------------------------------
// BACKGROUNDS
// --------------------------------------------------------------

export const backgrounds = pgTable("backgrounds", {
  id: varchar("id", { length: 100 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),

  // roleplay focused feature
  featureName: varchar("feature_name", { length: 255 }).notNull(),
  featureDescription: text("feature_description").notNull(),

  // inspiration tables
  ideals: jsonb("ideals").$type<string[]>().notNull(),
  bonds: jsonb("bonds").$type<string[]>().notNull(),
  flaws: jsonb("flaws").$type<string[]>().notNull(),
  personalityTraits: jsonb("personality_traits").$type<string[]>().notNull(),

  // TODO: INVENTORY PARSING
  startingEquipment: jsonb("starting_equipment").notNull(),

  lore: jsonb("lore")
    .$type<{ shortDescription: string; fullText?: string }>()
    .notNull(),
  sourceType: referenceSourceTypeEnum("source_type").default("core").notNull(),
  ownerCampaignId: uuid("owner_campaign_id"),
  ownerCharacterId: uuid("owner_character_id"),
  createdByUserId: varchar("created_by_user_id", { length: 255 }),
  isPublished: boolean("is_published").default(true).notNull(),
  supersedesId: varchar("supersedes_id", { length: 100 }),
  packId: varchar("pack_id", { length: 100 }),
  packVersion: integer("pack_version"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => ({
  ...buildReferenceScopeChecks("backgrounds", table),
}));

// Junction table linking the background to the universal traits table
export const backgroundTraits = pgTable(
  "background_traits",
  {
    backgroundId: varchar("background_id", { length: 100 })
      .references(() => backgrounds.id)
      .notNull(),
    traitId: varchar("trait_id", { length: 100 })
      .references(() => traits.id)
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.backgroundId, table.traitId] }),
  }),
);

// --------------------------------------------------------------
// ITEMS AND INVENTORY
// --------------------------------------------------------------

export const items = pgTable(
  "items",
  {
    id: varchar("id", { length: 100 }).primaryKey(), // e.g., 'item_longbow', 'item_pack_explorers'
    name: varchar("name", { length: 255 }).notNull(),

    // weight stored in ounces or fractions to avoid floating point math errors
    // e.g., 1.5lbs = 150 (assuming 2 decimal places of precision)
    weight: integer("weight").notNull().default(0),

    description: text("description").notNull(),

    // canonical rule payload used by runtime rule snapshots
    itemRule: jsonb("item_rule").$type<ItemDefinition>(),
    weaponRule: jsonb("weapon_rule").$type<WeaponDefinition>(),

    // flag to tell API that this item contains other items
    isBundle: boolean("is_bundle").default(false).notNull(),
    sourceType: referenceSourceTypeEnum("source_type").default("core").notNull(),
    ownerCampaignId: uuid("owner_campaign_id"),
    ownerCharacterId: uuid("owner_character_id"),
    createdByUserId: varchar("created_by_user_id", { length: 255 }),
    isPublished: boolean("is_published").default(true).notNull(),
    supersedesId: varchar("supersedes_id", { length: 100 }),
    packId: varchar("pack_id", { length: 100 }),
    packVersion: integer("pack_version"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => ({
    // GIN index for high-performance ILIKE text search across compendium
    searchIdx: index("item_search_idx").using(
      "gin",
      sql`to_tsvector('english', ${table.name} || ' ' || ${table.description})`,
    ),
    ...buildReferenceScopeChecks("items", table),
  }),
);

// Bill of Materials (BOM) for bundles
export const bundleContents = pgTable(
  "bundle_contents",
  {
    bundleId: varchar("bundle_id", { length: 100 })
      .references(() => items.id)
      .notNull(),
    itemId: varchar("item_id", { length: 100 })
      .references(() => items.id)
      .notNull(),
    quantity: integer("quantity").notNull().default(1),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.bundleId, table.itemId] }),
  }),
);

// --------------------------------------------------------------
// IMPORT RUN LEDGER
// --------------------------------------------------------------

export const importRuns = pgTable("import_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  packId: varchar("pack_id", { length: 100 }).notNull(),
  packVersion: integer("pack_version").notNull().default(1),
  schemaVersion: varchar("schema_version", { length: 32 }).notNull(),
  sourceType: referenceSourceTypeEnum("source_type").notNull(),
  ownerCampaignId: uuid("owner_campaign_id"),
  ownerCharacterId: uuid("owner_character_id"),
  createdByUserId: varchar("created_by_user_id", { length: 255 }),
  publishMode: varchar("publish_mode", { length: 32 }).notNull(),
  conflictPolicy: varchar("conflict_policy", { length: 32 }).notNull(),
  idPolicy: varchar("id_policy", { length: 32 }).notNull(),
  checksum: varchar("checksum", { length: 128 }),
  status: importRunStatusEnum("status").notNull().default("staged"),
  stagedAt: timestamp("staged_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  totalEntityRows: integer("total_entity_rows").notNull().default(0),
  totalRelationRows: integer("total_relation_rows").notNull().default(0),
  totalIssues: integer("total_issues").notNull().default(0),
  validateDurationMs: integer("validate_duration_ms"),
  planDurationMs: integer("plan_duration_ms"),
  applyDurationMs: integer("apply_duration_ms"),
  publishDurationMs: integer("publish_duration_ms"),
  totalDurationMs: integer("total_duration_ms"),
  appliedRowCountsByKind: jsonb("applied_row_counts_by_kind").notNull().default(sql`'{}'::jsonb`),
});

export const importRows = pgTable(
  "import_rows",
  {
    runId: uuid("run_id")
      .references(() => importRuns.id, { onDelete: "cascade" })
      .notNull(),
    rowIndex: integer("row_index").notNull(),
    rowType: varchar("row_type", { length: 16 }).notNull(),
    kind: varchar("kind", { length: 64 }).notNull(),
    op: varchar("op", { length: 32 }).notNull(),
    entityId: varchar("entity_id", { length: 100 }),
    payload: jsonb("payload").notNull(),
    status: importRowStatusEnum("status").notNull().default("pending"),
    errorMessage: text("error_message"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.runId, table.rowIndex] }),
  }),
);

export const importIssues = pgTable("import_issues", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id")
    .references(() => importRuns.id, { onDelete: "cascade" })
    .notNull(),
  rowIndex: integer("row_index"),
  severity: importIssueSeverityEnum("severity").notNull(),
  code: varchar("code", { length: 100 }).notNull(),
  message: text("message").notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rollbackRuns = pgTable("rollback_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceRunId: uuid("source_run_id")
    .references(() => importRuns.id, { onDelete: "cascade" })
    .notNull(),
  status: rollbackRunStatusEnum("status").notNull().default("planned"),
  initiatedByUserId: varchar("initiated_by_user_id", { length: 255 }),
  plannedAt: timestamp("planned_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  totalRows: integer("total_rows").notNull().default(0),
  totalIssues: integer("total_issues").notNull().default(0),
  planDurationMs: integer("plan_duration_ms"),
  applyDurationMs: integer("apply_duration_ms"),
  totalDurationMs: integer("total_duration_ms"),
  appliedRowCountsByKind: jsonb("applied_row_counts_by_kind").notNull().default(sql`'{}'::jsonb`),
});

export const rollbackRows = pgTable(
  "rollback_rows",
  {
    runId: uuid("run_id")
      .references(() => rollbackRuns.id, { onDelete: "cascade" })
      .notNull(),
    rowIndex: integer("row_index").notNull(),
    sourceRowIndex: integer("source_row_index"),
    rowType: varchar("row_type", { length: 16 }).notNull(),
    kind: varchar("kind", { length: 64 }).notNull(),
    op: varchar("op", { length: 32 }).notNull(),
    entityId: varchar("entity_id", { length: 100 }),
    payload: jsonb("payload").notNull(),
    status: rollbackRowStatusEnum("status").notNull().default("pending"),
    errorMessage: text("error_message"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.runId, table.rowIndex] }),
  }),
);

export const rollbackIssues = pgTable("rollback_issues", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id")
    .references(() => rollbackRuns.id, { onDelete: "cascade" })
    .notNull(),
  rowIndex: integer("row_index"),
  severity: rollbackIssueSeverityEnum("severity").notNull(),
  code: varchar("code", { length: 100 }).notNull(),
  message: text("message").notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
