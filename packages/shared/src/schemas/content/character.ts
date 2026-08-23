import { z } from "zod";
import { StartingEquipmentDefinitionSchema } from "./items.js";
import { SpellChoiceNodeSchema } from "./spells.js";
import { ClassMulticlassPrerequisitesSchema } from "./prerequisites.js";
import { LoreSchema } from "../primitives/lore.js";

// #region Core Primitives Schemas

// Flavor data: updates here do not trigger engine recalculations
export const CharacterFlavorSchema = z.object({
  name: z.string().min(1).max(100),
  alignment: z.string().optional(),
  eyeColor: z.string().optional(),
  backstory: z.string().max(5000).optional(),
});

export type CharacterFlavorData = z.infer<typeof CharacterFlavorSchema>;

export const TraitGrantSchema = z.string();

/**
 * "Choose one of these features." Options are plain trait ids because a trait
 * already composes everything a feature can be - spells, modifiers,
 * proficiencies, resources and actions - so one node covers fighting styles,
 * druid land types, totems, metamagic and pact boons alike.
 *
 * nodeId is the key this choice is stored under in
 * CharacterClassState.selections.
 */
/**
 * Gates on a single option. Deliberately narrower than FeatPrerequisitesSchema:
 * the things that gate a pick are a level, another feature you took, or a spell
 * you know - e.g. Thirsting Blade needs Pact of the Blade and warlock 5.
 * minimumLevel counts against the class that granted the choice.
 */
export const TraitChoicePrerequisiteSchema = z
  .object({
    minimumLevel: z.number().int().min(1).max(20).optional(),
    requiredTraitIds: z.array(z.string()).optional(),
    requiredSpellIds: z.array(z.string()).optional(),
  })
  .strict();

// a bare string is an option with no strings attached
export const TraitChoiceOptionSchema = z.union([
  z.string(),
  z
    .object({
      traitId: z.string(),
      prerequisites: TraitChoicePrerequisiteSchema,
    })
    .strict(),
]);

export const TraitChoiceNodeSchema = z.object({
  type: z.literal("trait_choice"),
  nodeId: z.string(), // e.g., "fighter_level_1_fighting_style"
  options: z.array(TraitChoiceOptionSchema).min(1),
  pickCount: z.number().int().min(1).default(1),
});

export const traitIdOfOption = (
  option: z.infer<typeof TraitChoiceOptionSchema>,
): string => (typeof option === "string" ? option : option.traitId);

/**
 * What a class or subclass level can hand out.
 *
 * Note there is no fixed_spell here: a level track answers "how many spells do
 * I pick at this level", while a specific always-known spell always comes from
 * a feature, so it lives on that feature's trait (TraitDefinition.spells).
 */
export const FeatureGrantUnion = z.union([
  SpellChoiceNodeSchema,
  TraitChoiceNodeSchema,
  TraitGrantSchema,
]);

export type TraitChoiceNode = z.infer<typeof TraitChoiceNodeSchema>;
export type TraitChoiceOption = z.infer<typeof TraitChoiceOptionSchema>;
export type TraitChoicePrerequisite = z.infer<
  typeof TraitChoicePrerequisiteSchema
>;

// #endregion

// #region Progression and Options Schemas

export const RaceConfigurationSchema = z
  .object({
    baseRaceId: z.string().min(1),
    hasSubraces: z.boolean(),
    subraceId: z.string().nullable().default(null),
  })
  .superRefine((data, ctx) => {
    // strictly require subrace selection where applicable guardrail
    if (data.hasSubraces && !data.subraceId) {
      ctx.addIssue({
        code: "custom",
        message: "A subrace must be explicitly selected for this base race.",
        path: ["subraceId"],
      });
    }
  });

export const ClassLevelFeatureSchema = z.object({
  level: z.number().int().min(1).max(20),
  // array of trait ids granted at this level (e.g., ["rogue_sneak_attack"])
  grants: z.array(FeatureGrantUnion).default([]),
  // true if this level grants an asi or feat
  grantsASI: z.boolean().default(false),
});

export const ClassDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  hitDie: z.number(), // e.g., 8 for d8
  subclassUnlockLevel: z.number().int().min(1).max(3),

  startingEquipment: StartingEquipmentDefinitionSchema.default({
    given: [],
    choices: [],
  }),

  // what the class grants at lvl 1 (e.g., light armor, simple weapons)
  startingProficiencyTraitIds: z.array(z.string()).default([]),

  // the reduced proficiency set granted when this class is taken as a dip
  multiclassTraitIds: z.array(z.string()).default([]),

  // ability minimums required to multiclass into this class
  multiclassPrerequisites: ClassMulticlassPrerequisitesSchema.optional(),

  // 1-20 progression track
  progression: z.array(ClassLevelFeatureSchema),
});

export type FeatureGrant = z.infer<typeof FeatureGrantUnion>;
export type ClassLevelFeature = z.infer<typeof ClassLevelFeatureSchema>;
export type ClassDefinition = z.infer<typeof ClassDefinitionSchema>;

export const BackgroundDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  featureName: z.string(),
  featureDescription: z.string(),
  ideals: z.array(z.string()).default([]),
  bonds: z.array(z.string()).default([]),
  flaws: z.array(z.string()).default([]),
  personalityTraits: z.array(z.string()).default([]),
  backgroundTraitIds: z.array(z.string()).default([]),
  startingEquipment: StartingEquipmentDefinitionSchema.default({
    given: [],
    choices: [],
  }),
  lore: LoreSchema,
});

export type BackgroundDefinition = z.infer<typeof BackgroundDefinitionSchema>;

// #endregion
