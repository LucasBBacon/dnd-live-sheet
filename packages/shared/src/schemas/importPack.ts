import { z } from "zod";
import { TraitEffectSchema } from "./effects.js";
import {
  ClassMulticlassPrerequisitesSchema,
  FeatPrerequisitesSchema,
} from "./prerequisites.js";
import { ItemDefinitionSchema } from "./items.js";
import { WeaponDefinitionSchema } from "./weapons.js";

// #region Import Pack Schemas

const ImportIdSchema = z
  .string()
  .min(3)
  .max(100)
  .regex(/^[a-z0-9_]+$/, "Use lowercase snake_case ids.");

const LoreSchema = z.object({
  shortDescription: z.string().min(1).max(280),
  fullText: z.string().max(8000).optional(),
});

export const ImportSourceTypeSchema = z.enum(["core", "homebrew"]);
export const ImportPublishModeSchema = z.enum(["draft", "published"]);
export const ImportConflictPolicySchema = z.enum([
  "fail",
  "skip_existing",
  "upsert",
  "supersede",
]);
export const ImportIdPolicySchema = z.enum(["stable", "auto_suffix"]);

export const ImportPackMetadataSchema = z
  .object({
    packId: ImportIdSchema,
    name: z.string().min(1).max(255),
    description: z.string().max(2000).optional(),
    schemaVersion: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, "Use semver format x.y.z."),
    sourceType: ImportSourceTypeSchema,
    ownerCampaignId: z.uuid().optional(),
    ownerCharacterId: z.uuid().optional(),
    createdByUserId: z.string().min(1).max(255).optional(),
    publishMode: ImportPublishModeSchema.default("draft"),
    conflictPolicy: ImportConflictPolicySchema.default("upsert"),
    idPolicy: ImportIdPolicySchema.default("stable"),
  })
  .superRefine((data, ctx) => {
    if (data.ownerCharacterId && !data.ownerCampaignId) {
      ctx.addIssue({
        code: "custom",
        path: ["ownerCharacterId"],
        message: "ownerCharacterId requires ownerCampaignId.",
      });
    }

    if (data.sourceType === "core") {
      if (data.ownerCampaignId || data.ownerCharacterId) {
        ctx.addIssue({
          code: "custom",
          path: ["sourceType"],
          message:
            "Core imports cannot declare campaign or character ownership.",
        });
      }

      if (data.publishMode !== "published") {
        ctx.addIssue({
          code: "custom",
          path: ["publishMode"],
          message:
            "Core imports must be published to satisfy reference scope constraints.",
        });
      }
    }

    if (data.sourceType === "homebrew") {
      if (!data.ownerCampaignId) {
        ctx.addIssue({
          code: "custom",
          path: ["ownerCampaignId"],
          message: "Homebrew imports require ownerCampaignId.",
        });
      }

      if (!data.createdByUserId) {
        ctx.addIssue({
          code: "custom",
          path: ["createdByUserId"],
          message: "Homebrew imports require createdByUserId.",
        });
      }
    }
  });

// #endregion

// #region Import Entity Schemas

export const ImportEntityOperationSchema = z.enum([
  "insert",
  "upsert",
  "supersede",
  "archive",
]);

export const ImportRelationOperationSchema = z.enum(["add", "remove"]);

// #endregion

// #region Import Data Schemas

const TraitImportDataSchema = z.object({
  name: z.string().min(1).max(255),
  lore: LoreSchema,
  effects: z.array(TraitEffectSchema),
  isStartingProficiency: z.boolean().default(false),
});

const FeatImportDataSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.string().min(1).max(50),
  source: z.string().min(1).max(100).optional(),
  repeatable: z.boolean().default(false),
  lore: LoreSchema,
  prerequisites: FeatPrerequisitesSchema.optional(),
});

const RaceImportDataSchema = z.object({
  name: z.string().min(1).max(255),
  speed: z.number().int().min(0).max(120),
  requiresSubrace: z.boolean().default(false),
  displayLabel: z.string().max(255).optional(),
  lore: LoreSchema,
});

const SubraceImportDataSchema = z.object({
  parentRaceId: ImportIdSchema,
  name: z.string().min(1).max(255),
  lore: LoreSchema,
});

const ClassImportDataSchema = z.object({
  name: z.string().min(1).max(255),
  hitDie: z.number().int().min(1).max(20),
  subclassRequirementLevel: z.number().int().min(1).max(20),
  startingEquipment: z.record(z.string(), z.unknown()).default({}),
  multiclassPrerequisites: ClassMulticlassPrerequisitesSchema.optional(),
  lore: LoreSchema,
});

const SubclassImportDataSchema = z.object({
  parentClassId: ImportIdSchema,
  name: z.string().min(1).max(255),
  lore: LoreSchema,
});

const BackgroundImportDataSchema = z.object({
  name: z.string().min(1).max(255),
  featureName: z.string().min(1).max(255),
  featureDescription: z.string().min(1).max(8000),
  ideals: z.array(z.string()),
  bonds: z.array(z.string()),
  flaws: z.array(z.string()),
  personalityTraits: z.array(z.string()),
  startingEquipment: z.record(z.string(), z.unknown()).default({}),
  lore: LoreSchema,
});

const ItemImportDataSchema = z.object({
  name: z.string().min(1).max(255),
  weight: z.number().int().min(0).max(100_000),
  description: z.string().min(1).max(8000),
  isBundle: z.boolean().default(false),
  itemRule: ItemDefinitionSchema,
  weaponRule: WeaponDefinitionSchema.optional(),
});

const ClassLevelImportDataSchema = z.object({
  classId: ImportIdSchema,
  level: z.number().int().min(1).max(20),
  classSpecificScaling: z.record(z.string(), z.unknown()).nullable().optional(),
  spellcastingProgression: z
    .record(z.string(), z.unknown())
    .nullable()
    .optional(),
});

const SubclassLevelImportDataSchema = z.object({
  subclassId: ImportIdSchema,
  level: z.number().int().min(1).max(20),
  subclassSpecificScaling: z
    .record(z.string(), z.unknown())
    .nullable()
    .optional(),
  bonusSpells: z.array(z.string()).nullable().optional(),
  spellsAddedToList: z.array(z.string()).nullable().optional(),
});

// #endregion

// #region Import Entity Schemas

const ImportEntityBaseSchema = z.object({
  id: ImportIdSchema,
  op: ImportEntityOperationSchema.default("upsert"),
  supersedesId: ImportIdSchema.optional(),
});

export const ImportEntityEntrySchema = z.discriminatedUnion("kind", [
  ImportEntityBaseSchema.extend({
    kind: z.literal("trait"),
    data: TraitImportDataSchema,
  }),
  ImportEntityBaseSchema.extend({
    kind: z.literal("feat"),
    data: FeatImportDataSchema,
  }),
  ImportEntityBaseSchema.extend({
    kind: z.literal("race"),
    data: RaceImportDataSchema,
  }),
  ImportEntityBaseSchema.extend({
    kind: z.literal("subrace"),
    data: SubraceImportDataSchema,
  }),
  ImportEntityBaseSchema.extend({
    kind: z.literal("class"),
    data: ClassImportDataSchema,
  }),
  ImportEntityBaseSchema.extend({
    kind: z.literal("subclass"),
    data: SubclassImportDataSchema,
  }),
  ImportEntityBaseSchema.extend({
    kind: z.literal("background"),
    data: BackgroundImportDataSchema,
  }),
  ImportEntityBaseSchema.extend({
    kind: z.literal("item"),
    data: ItemImportDataSchema,
  }),
  ImportEntityBaseSchema.extend({
    kind: z.literal("class_level"),
    data: ClassLevelImportDataSchema,
  }),
  ImportEntityBaseSchema.extend({
    kind: z.literal("subclass_level"),
    data: SubclassLevelImportDataSchema,
  }),
]);

// #endregion

// #region Import Relation Schemas Cont

export const ImportRelationEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("feat_trait"),
    op: ImportRelationOperationSchema.default("add"),
    featId: ImportIdSchema,
    traitId: ImportIdSchema,
  }),
  z.object({
    kind: z.literal("feat_prerequisite"),
    op: ImportRelationOperationSchema.default("add"),
    featId: ImportIdSchema,
    requiredFeatId: ImportIdSchema,
  }),
  z.object({
    kind: z.literal("race_trait"),
    op: ImportRelationOperationSchema.default("add"),
    raceId: ImportIdSchema,
    traitId: ImportIdSchema,
  }),
  z.object({
    kind: z.literal("subrace_trait"),
    op: ImportRelationOperationSchema.default("add"),
    subraceId: ImportIdSchema,
    traitId: ImportIdSchema,
  }),
  z.object({
    kind: z.literal("class_multiclass_trait"),
    op: ImportRelationOperationSchema.default("add"),
    classId: ImportIdSchema,
    traitId: ImportIdSchema,
  }),
  z.object({
    kind: z.literal("class_progression"),
    op: ImportRelationOperationSchema.default("add"),
    classId: ImportIdSchema,
    level: z.number().int().min(1).max(20),
    traitId: ImportIdSchema,
  }),
  z.object({
    kind: z.literal("subclass_progression"),
    op: ImportRelationOperationSchema.default("add"),
    subclassId: ImportIdSchema,
    level: z.number().int().min(1).max(20),
    traitId: ImportIdSchema,
  }),
  z.object({
    kind: z.literal("background_trait"),
    op: ImportRelationOperationSchema.default("add"),
    backgroundId: ImportIdSchema,
    traitId: ImportIdSchema,
  }),
  z.object({
    kind: z.literal("bundle_content"),
    op: ImportRelationOperationSchema.default("add"),
    bundleId: ImportIdSchema,
    itemId: ImportIdSchema,
    quantity: z.number().int().min(1).max(1000),
  }),
]);

// #endregion

// #region Import Pack Schema Cont

export const ImportPackSchema = z.object({
  pack: ImportPackMetadataSchema,
  entries: z.array(ImportEntityEntrySchema).default([]),
  relations: z.array(ImportRelationEntrySchema).default([]),
});

// #endregion

// #region Type Exports

export type ImportSourceType = z.infer<typeof ImportSourceTypeSchema>;
export type ImportPublishMode = z.infer<typeof ImportPublishModeSchema>;
export type ImportConflictPolicy = z.infer<typeof ImportConflictPolicySchema>;
export type ImportIdPolicy = z.infer<typeof ImportIdPolicySchema>;
export type ImportEntityOperation = z.infer<typeof ImportEntityOperationSchema>;
export type ImportRelationOperation = z.infer<
  typeof ImportRelationOperationSchema
>;
export type ImportPackMetadata = z.infer<typeof ImportPackMetadataSchema>;
export type ImportEntityEntry = z.infer<typeof ImportEntityEntrySchema>;
export type ImportRelationEntry = z.infer<typeof ImportRelationEntrySchema>;
export type ImportPack = z.infer<typeof ImportPackSchema>;

// #endregion
