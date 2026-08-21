import { z } from "zod";
import {
  BackgroundDefinitionSchema,
  ClassDefinitionSchema,
  ClassLevelFeatureSchema,
  traitIdOfOption,
} from "./character.js";
import { EquipmentDefinitionSchema } from "./equipment.js";
import { StartingEquipmentDefinitionSchema } from "./items.js";
import { FeatPrerequisitesSchema } from "./prerequisites.js";
import { ResourceRuleSchema } from "./rules.js";
import { SpellDefinitionSchema } from "./spells.js";
import { TraitDefinitionSchema } from "./traits.js";
import { LoreSchema } from "./lore.js";

const CoreRuleIdSchema = z
  .string()
  .min(3)
  .max(100)
  .regex(/^[a-z0-9_]+$/, "Use lowercase snake_case ids.");

const CoreSubraceSchema = z
  .object({
    id: CoreRuleIdSchema,
    name: z.string().min(1).max(255),
    // Descriptive, not mechanical. Optional because the packs are being filled
    // in incrementally and no rule depends on it - tighten this once the PHB
    // content is complete.
    lore: LoreSchema.optional(),
    grantedTraitIds: z.array(CoreRuleIdSchema).default([]),
  })
  .strict();

const CoreRaceSchema = z
  .object({
    id: CoreRuleIdSchema,
    name: z.string().min(1).max(255),
    size: z.enum(["tiny", "small", "medium", "large", "huge", "gargantuan"]),
    speed: z.number().int().min(0).max(120),
    // see CoreSubraceSchema - descriptive, and the packs are incomplete
    lore: LoreSchema.optional(),
    grantedTraitIds: z.array(CoreRuleIdSchema).default([]),
    hasSubraces: z.boolean(),
    // Keyed by subrace id, matching both the authored packs and the engine's
    // RaceDefinition. This was declared as an array and never agreed with
    // either, which is why no pack has ever validated.
    subraces: z.record(z.string(), CoreSubraceSchema).default({}),
  })
  .strict();

const CoreClassSchema = ClassDefinitionSchema.extend({
  id: CoreRuleIdSchema,
  lore: LoreSchema,
}).strict();

const CoreSubclassSchema = z
  .object({
    id: CoreRuleIdSchema,
    classId: CoreRuleIdSchema,
    name: z.string().min(1).max(255),
    lore: LoreSchema,
    progression: z.array(ClassLevelFeatureSchema).default([]),
  })
  .strict();

const CoreFeatSchema = z
  .object({
    id: CoreRuleIdSchema,
    name: z.string().min(1).max(255),
    category: z.string().min(1).max(50),
    source: z.string().min(1).max(100).optional(),
    repeatable: z.boolean().default(false),
    lore: LoreSchema,
    prerequisites: FeatPrerequisitesSchema.optional(),
    grantedTraitIds: z.array(CoreRuleIdSchema).default([]),
    tags: z.array(z.string().min(1).max(100)).default([]),
  })
  .strict();

const CoreTraitSchema = TraitDefinitionSchema.extend({
  id: CoreRuleIdSchema,
  lore: LoreSchema,
  isStartingProficiency: z.boolean().default(false),
}).strict();

const CoreEquipmentSchema = EquipmentDefinitionSchema.extend({
  id: CoreRuleIdSchema,
  lore: LoreSchema,
  isBundle: z.boolean().default(false),
  bundleContents: z
    .array(
      z
        .object({
          itemId: CoreRuleIdSchema,
          quantity: z.number().int().min(1).max(1000),
        })
        .strict(),
    )
    .default([]),
}).strict();

const CoreProficiencySchema = z
  .object({
    id: CoreRuleIdSchema,
    name: z.string().min(1).max(255),
    category: z.enum([
      "armor",
      "weapons",
      "tools",
      "saving_throws",
      "skills",
      "languages",
      "ability_check",
    ]),
  })
  .strict();

/**
 * The content sections a pack can claim to be complete for.
 *
 * Wider than CoreRulePackSchema's array fields because ownership is about
 * what a consumer may merge beneath this pack, not about pack arrays:
 * subraces are authored inside their race but are owned on their own terms.
 */
export const PackSectionSchema = z.enum([
  "traits",
  "resources",
  "races",
  "subraces",
  "classes",
  "subclasses",
  "feats",
  "backgrounds",
  "equipment",
  "spells",
  "proficiencies",
]);

export const CoreRulePackSchema = z
  .object({
    pack: z
      .object({
        packId: CoreRuleIdSchema,
        version: z.number().int().positive(),
        /**
         * The rules system this pack belongs to.
         *
         * No longer a literal: a pack may define an entirely different system,
         * and the database column has always been varchar. Packs whose
         * rulesets differ must never compose - that is what stops a homebrew
         * system silently falling back on the standard rules.
         */
        ruleset: z.string().min(1).max(100),
        publishedAt: z.iso.datetime({ offset: true }),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
        /**
         * Packs this one layers on top of, in precedence order.
         *
         * An empty list means the pack stands alone. Absent means the same,
         * but says nothing deliberate about it.
         */
        extends: z.array(CoreRuleIdSchema).optional(),
        /**
         * Sections this pack is complete for, and therefore authoritative over.
         *
         * Nothing beneath an owned section merges into it. A supplement owns
         * nothing; a standalone system owns everything.
         *
         * Optional rather than defaulted: a `.default()` would make the field
         * required on the inferred output type, forcing every hand-written
         * pack literal in the tests to restate it.
         */
        owns: z.array(PackSectionSchema).optional(),
      })
      .strict(),
    traits: z.array(CoreTraitSchema).default([]),
    resources: z.array(ResourceRuleSchema).default([]),
    races: z.array(CoreRaceSchema).default([]),
    classes: z.array(CoreClassSchema).default([]),
    subclasses: z.array(CoreSubclassSchema).default([]),
    feats: z.array(CoreFeatSchema).default([]),
    backgrounds: z.array(BackgroundDefinitionSchema).default([]),
    equipment: z.array(CoreEquipmentSchema).default([]),
    spells: z.array(SpellDefinitionSchema).default([]),
    proficiencies: z.array(CoreProficiencySchema).default([]),
  })
  .strict();

export type CoreRulePack = z.infer<typeof CoreRulePackSchema>;
export type CoreRulePackInput = z.input<typeof CoreRulePackSchema>;
export type PackSection = z.infer<typeof PackSectionSchema>;
export type CoreRulePackIssueCode =
  | "duplicate_id"
  | "unknown_class_reference"
  | "unknown_equipment_reference"
  | "unknown_feat_reference"
  | "unknown_race_reference"
  | "unknown_resource_reference"
  | "unknown_spell_reference"
  | "unknown_subclass_reference"
  | "unknown_subrace_reference"
  | "unknown_trait_reference"
  | "incompatible_ammunition_reference"
  | "invalid_choice_count"
  | "invalid_progression_order"
  | "missing_subrace"
  | "unexpected_subrace";

export type CoreRulePackValidationIssue = {
  code: CoreRulePackIssueCode;
  path: Array<string | number>;
  message: string;
};

export type CoreRulePackValidationResult = {
  ok: boolean;
  issues: CoreRulePackValidationIssue[];
};

type FeatureGrant = CoreRulePack["classes"][number]["progression"][number]["grants"][number];

const pushReferenceIssue = (
  issues: CoreRulePackValidationIssue[],
  code: Extract<CoreRulePackIssueCode, `unknown_${string}_reference`>,
  path: Array<string | number>,
  id: string,
) => {
  issues.push({
    code,
    path,
    message: `Unknown ${code.slice("unknown_".length, -"_reference".length).replaceAll("_", " ")} '${id}'.`,
  });
};

const validateProgression = (
  progression: Array<{ level: number; grants: FeatureGrant[] }>,
  path: Array<string | number>,
  traitIds: Set<string>,
  spellIds: Set<string>,
  issues: CoreRulePackValidationIssue[],
) => {
  let previousLevel = 0;

  progression.forEach((entry, levelIndex) => {
    const entryPath = [...path, levelIndex];
    if (entry.level <= previousLevel) {
      issues.push({
        code: "invalid_progression_order",
        path: [...entryPath, "level"],
        message: "Progression levels must be strictly ascending without duplicates.",
      });
    }
    previousLevel = entry.level;

    entry.grants.forEach((grant, grantIndex) => {
      const grantPath = [...entryPath, "grants", grantIndex];
      if (typeof grant === "string") {
        if (!traitIds.has(grant)) {
          pushReferenceIssue(
            issues,
            "unknown_trait_reference",
            grantPath,
            grant,
          );
        }
        return;
      }

      if (grant.type === "trait_choice") {
        if (grant.pickCount > grant.options.length) {
          issues.push({
            code: "invalid_choice_count",
            path: [...grantPath, "pickCount"],
            message: "Trait-choice pickCount cannot exceed its option count.",
          });
        }

        grant.options.forEach((option, optionIndex) => {
          const traitId = traitIdOfOption(option);
          if (!traitIds.has(traitId)) {
            pushReferenceIssue(
              issues,
              "unknown_trait_reference",
              [...grantPath, "options", optionIndex],
              traitId,
            );
          }

          if (typeof option !== "string") {
            option.prerequisites.requiredTraitIds?.forEach(
              (requiredTraitId, prerequisiteIndex) => {
                if (!traitIds.has(requiredTraitId)) {
                  pushReferenceIssue(
                    issues,
                    "unknown_trait_reference",
                    [
                      ...grantPath,
                      "options",
                      optionIndex,
                      "prerequisites",
                      "requiredTraitIds",
                      prerequisiteIndex,
                    ],
                    requiredTraitId,
                  );
                }
              },
            );
            option.prerequisites.requiredSpellIds?.forEach(
              (requiredSpellId, prerequisiteIndex) => {
                if (!spellIds.has(requiredSpellId)) {
                  pushReferenceIssue(
                    issues,
                    "unknown_spell_reference",
                    [
                      ...grantPath,
                      "options",
                      optionIndex,
                      "prerequisites",
                      "requiredSpellIds",
                      prerequisiteIndex,
                    ],
                    requiredSpellId,
                  );
                }
              },
            );
          }
        });
      }
    });
  });
};

const validateStartingEquipment = (
  startingEquipment: z.infer<typeof StartingEquipmentDefinitionSchema>,
  path: Array<string | number>,
  equipmentIds: Set<string>,
  issues: CoreRulePackValidationIssue[],
) => {
  const validateGrant = (
    grant: z.infer<typeof StartingEquipmentDefinitionSchema>["given"][number],
    grantPath: Array<string | number>,
  ) => {
    if (grant.kind === "item" && !equipmentIds.has(grant.refId)) {
      pushReferenceIssue(
        issues,
        "unknown_equipment_reference",
        [...grantPath, "refId"],
        grant.refId,
      );
    }
  };

  startingEquipment.given.forEach((grant, grantIndex) =>
    validateGrant(grant, [...path, "given", grantIndex]),
  );
  startingEquipment.choices.forEach((choice, choiceIndex) => {
    if (choice.choose > choice.options.length) {
      issues.push({
        code: "invalid_choice_count",
        path: [...path, "choices", choiceIndex, "choose"],
        message: "Starting-equipment choose count cannot exceed its option count.",
      });
    }
    choice.options.forEach((option, optionIndex) => {
      option.equipmentBundle.forEach((grant, grantIndex) =>
        validateGrant(grant, [
          ...path,
          "choices",
          choiceIndex,
          "options",
          optionIndex,
          "equipmentBundle",
          grantIndex,
        ]),
      );
    });
  });
};

export const validateCoreRulePack = (
  pack: CoreRulePack,
): CoreRulePackValidationResult => {
  const issues: CoreRulePackValidationIssue[] = [];
  const allIds = new Set<string>();
  const registerId = (id: string, path: Array<string | number>) => {
    if (allIds.has(id)) {
      issues.push({
        code: "duplicate_id",
        path,
        message: `Duplicate core-rule id '${id}'.`,
      });
      return;
    }
    allIds.add(id);
  };

  pack.traits.forEach((entry, index) => registerId(entry.id, ["traits", index, "id"]));
  pack.resources.forEach((entry, index) => registerId(entry.id, ["resources", index, "id"]));
  pack.races.forEach((entry, index) => {
    registerId(entry.id, ["races", index, "id"]);
    Object.entries(entry.subraces).forEach(([key, subrace]) =>
      registerId(subrace.id, ["races", index, "subraces", key, "id"]),
    );
  });
  pack.classes.forEach((entry, index) => registerId(entry.id, ["classes", index, "id"]));
  pack.subclasses.forEach((entry, index) => registerId(entry.id, ["subclasses", index, "id"]));
  pack.feats.forEach((entry, index) => registerId(entry.id, ["feats", index, "id"]));
  pack.backgrounds.forEach((entry, index) => registerId(entry.id, ["backgrounds", index, "id"]));
  pack.equipment.forEach((entry, index) => registerId(entry.id, ["equipment", index, "id"]));
  pack.spells.forEach((entry, index) => registerId(entry.id, ["spells", index, "id"]));
  pack.proficiencies.forEach((entry, index) => registerId(entry.id, ["proficiencies", index, "id"]));

  const traitIds = new Set(pack.traits.map((entry) => entry.id));
  const resourceIds = new Set([
    ...pack.resources.map((entry) => entry.id),
    ...pack.traits.flatMap((entry) => entry.resources.map((resource) => resource.id)),
  ]);
  const raceIds = new Set(pack.races.map((entry) => entry.id));
  const subraceIds = new Set(
    pack.races.flatMap((entry) =>
      Object.values(entry.subraces).map((subrace) => subrace.id),
    ),
  );
  const classIds = new Set(pack.classes.map((entry) => entry.id));
  const subclassIds = new Set(pack.subclasses.map((entry) => entry.id));
  const featIds = new Set(pack.feats.map((entry) => entry.id));
  const equipmentIds = new Set(pack.equipment.map((entry) => entry.id));
  const spellIds = new Set(pack.spells.map((entry) => entry.id));

  pack.races.forEach((race, raceIndex) => {
    if (race.hasSubraces && Object.keys(race.subraces).length === 0) {
      issues.push({
        code: "missing_subrace",
        path: ["races", raceIndex, "subraces"],
        message: "A race that has subraces must declare at least one subrace.",
      });
    }
    if (!race.hasSubraces && Object.keys(race.subraces).length > 0) {
      issues.push({
        code: "unexpected_subrace",
        path: ["races", raceIndex, "subraces"],
        message: "A race without subraces cannot declare subrace records.",
      });
    }
    [race, ...Object.values(race.subraces)].forEach((record, recordIndex) => {
      record.grantedTraitIds.forEach((traitId, traitIndex) => {
        if (!traitIds.has(traitId)) {
          pushReferenceIssue(
            issues,
            "unknown_trait_reference",
            recordIndex === 0
              ? ["races", raceIndex, "grantedTraitIds", traitIndex]
              : [
                  "races",
                  raceIndex,
                  "subraces",
                  recordIndex - 1,
                  "grantedTraitIds",
                  traitIndex,
                ],
            traitId,
          );
        }
      });
    });
  });

  pack.classes.forEach((entry, index) => {
    entry.startingProficiencyTraitIds.forEach((traitId, traitIndex) => {
      if (!traitIds.has(traitId)) {
        pushReferenceIssue(issues, "unknown_trait_reference", ["classes", index, "startingProficiencyTraitIds", traitIndex], traitId);
      }
    });
    entry.multiclassTraitIds.forEach((traitId, traitIndex) => {
      if (!traitIds.has(traitId)) {
        pushReferenceIssue(issues, "unknown_trait_reference", ["classes", index, "multiclassTraitIds", traitIndex], traitId);
      }
    });
    validateProgression(entry.progression, ["classes", index, "progression"], traitIds, spellIds, issues);
    validateStartingEquipment(entry.startingEquipment, ["classes", index, "startingEquipment"], equipmentIds, issues);
  });

  pack.subclasses.forEach((entry, index) => {
    if (!classIds.has(entry.classId)) {
      pushReferenceIssue(issues, "unknown_class_reference", ["subclasses", index, "classId"], entry.classId);
    }
    validateProgression(entry.progression, ["subclasses", index, "progression"], traitIds, spellIds, issues);
  });

  pack.feats.forEach((entry, index) => {
    entry.grantedTraitIds.forEach((traitId, traitIndex) => {
      if (!traitIds.has(traitId)) {
        pushReferenceIssue(issues, "unknown_trait_reference", ["feats", index, "grantedTraitIds", traitIndex], traitId);
      }
    });
    entry.prerequisites?.requiredClassIds?.forEach((classId, referenceIndex) => {
      if (!classIds.has(classId)) {
        pushReferenceIssue(issues, "unknown_class_reference", ["feats", index, "prerequisites", "requiredClassIds", referenceIndex], classId);
      }
    });
    entry.prerequisites?.requiredSubclassIds?.forEach((subclassId, referenceIndex) => {
      if (!subclassIds.has(subclassId)) {
        pushReferenceIssue(issues, "unknown_subclass_reference", ["feats", index, "prerequisites", "requiredSubclassIds", referenceIndex], subclassId);
      }
    });
    entry.prerequisites?.requiredRaceIds?.forEach((raceId, referenceIndex) => {
      if (!raceIds.has(raceId)) {
        pushReferenceIssue(issues, "unknown_race_reference", ["feats", index, "prerequisites", "requiredRaceIds", referenceIndex], raceId);
      }
    });
    entry.prerequisites?.requiredSubraceIds?.forEach((subraceId, referenceIndex) => {
      if (!subraceIds.has(subraceId)) {
        pushReferenceIssue(issues, "unknown_subrace_reference", ["feats", index, "prerequisites", "requiredSubraceIds", referenceIndex], subraceId);
      }
    });
    entry.prerequisites?.requiredFeatIds?.forEach((featId, referenceIndex) => {
      if (!featIds.has(featId)) {
        pushReferenceIssue(issues, "unknown_feat_reference", ["feats", index, "prerequisites", "requiredFeatIds", referenceIndex], featId);
      }
    });
  });

  pack.backgrounds.forEach((entry, index) => {
    entry.backgroundTraitIds.forEach((traitId, traitIndex) => {
      if (!traitIds.has(traitId)) {
        pushReferenceIssue(issues, "unknown_trait_reference", ["backgrounds", index, "backgroundTraitIds", traitIndex], traitId);
      }
    });
    validateStartingEquipment(entry.startingEquipment, ["backgrounds", index, "startingEquipment"], equipmentIds, issues);
  });

  pack.equipment.forEach((entry, index) => {
    entry.bundleContents.forEach((content, contentIndex) => {
      if (!equipmentIds.has(content.itemId)) {
        pushReferenceIssue(issues, "unknown_equipment_reference", ["equipment", index, "bundleContents", contentIndex, "itemId"], content.itemId);
      }
    });
    if (entry.weapon?.ammoItemId && !equipmentIds.has(entry.weapon.ammoItemId)) {
      pushReferenceIssue(issues, "unknown_equipment_reference", ["equipment", index, "weapon", "ammoItemId"], entry.weapon.ammoItemId);
    }
    if (entry.weapon?.ammoItemId && entry.weapon.ammoTag) {
      const ammunition = pack.equipment.find((item) => item.id === entry.weapon?.ammoItemId);
      if (ammunition?.ammoTag !== entry.weapon.ammoTag) {
        issues.push({
          code: "incompatible_ammunition_reference",
          path: ["equipment", index, "weapon", "ammoItemId"],
          message: `Ammunition '${entry.weapon.ammoItemId}' does not carry ammo tag '${entry.weapon.ammoTag}'.`,
        });
      }
    }
  });

  pack.resources.forEach((entry, index) => {
    if (entry.maxRule.kind === "class_level_thresholds" && !classIds.has(entry.maxRule.classId)) {
      pushReferenceIssue(issues, "unknown_class_reference", ["resources", index, "maxRule", "classId"], entry.maxRule.classId);
    }
  });

  pack.traits.forEach((entry, index) => {
    entry.spells?.fixed.forEach((grant, grantIndex) => {
      if (!spellIds.has(grant.spellId)) {
        pushReferenceIssue(issues, "unknown_spell_reference", ["traits", index, "spells", "fixed", grantIndex, "spellId"], grant.spellId);
      }
      if (grant.usage.kind === "resource" && !resourceIds.has(grant.usage.resourceId!)) {
        pushReferenceIssue(issues, "unknown_resource_reference", ["traits", index, "spells", "fixed", grantIndex, "usage", "resourceId"], grant.usage.resourceId!);
      }
    });
  });

  return { ok: issues.length === 0, issues };
};
/**
 * The rulebook content a loaded pack contributes to the engine's lookups.
 *
 * Deliberately only the three the engine resolves by id. Everything else in a
 * pack - feats, backgrounds, spells, proficiencies - reaches the runtime by
 * other routes, and adding them here before anything reads them would be the
 * dead-data pattern this project keeps having to unpick.
 */
export interface CoreRulePackSnapshot {
  traitsById: Record<string, CoreRulePack["traits"][number]>;
  racesById: Record<string, CoreRulePack["races"][number]>;
  classesById: Record<string, CoreRulePack["classes"][number]>;
}

const byId = <T extends { id: string }>(entries: T[]): Record<string, T> =>
  Object.fromEntries(entries.map((entry) => [entry.id, entry]));

/**
 * Reshapes a validated pack into the maps the engine's resolvers read.
 *
 * Pure: no file access and no validation, because the pack arrived through
 * CoreRulePackSchema already. No reshaping either - packs already author
 * subraces keyed by id, exactly as the engine reads them.
 * @param pack A pack that has already passed schema and semantic validation
 * @returns Content keyed by id, ready to hand to a RuleSnapshotLookup
 */
export const toRuleSnapshot = (pack: CoreRulePack): CoreRulePackSnapshot => ({
  traitsById: byId(pack.traits),
  racesById: byId(pack.races),
  classesById: byId(pack.classes),
});
