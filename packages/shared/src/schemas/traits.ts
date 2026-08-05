import z from "zod";
import { BaseModifierSchema, ChoiceModifierGrantSchema } from "./modifiers.js";
import {
  ChoiceAffinityGrantSchema,
  FixedAffinityGrantSchema,
} from "./affinities.js";
import { ResourceGrantSchema } from "./resources.js";
import { TriggerGrantSchema } from "./triggers.js";
import {
  ChoiceProficiencyGrantSchema,
  FixedProficiencyGrantSchema,
} from "./proficiencies.js";
import { CriticalHitModifierSchema, DiceRuleSchema } from "./dice.js";
import { ActionGrantSchema } from "./actions.js";
import { SpellGrantBlockSchema } from "./spells.js";

export const TraitDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),

  modifiers: z
    .object({
      fixed: z.array(BaseModifierSchema).default([]),
      choices: z.array(ChoiceModifierGrantSchema).default([]),
    })
    .default({ fixed: [], choices: [] }),

  /**
   * Persistent flags this trait puts on the character, e.g. "powerful_build".
   *
   * Distinct from ActiveEffect.grantedStates, which are temporary: these hold
   * for as long as the character has the trait, so they belong to the
   * blueprint rather than to the EffectManager.
   *
   * Optional rather than defaulted on purpose - a default would make the field
   * required on the inferred type and every authored trait literal would need
   * to declare it.
   */
  grantedStates: z.array(z.string()).optional(),

  proficiencies: z
    .object({
      fixed: z.array(FixedProficiencyGrantSchema).default([]),
      choices: z.array(ChoiceProficiencyGrantSchema).default([]),
    })
    .optional(),

  affinities: z
    .object({
      fixed: z.array(FixedAffinityGrantSchema).default([]),
      choices: z.array(ChoiceAffinityGrantSchema).default([]),
    })
    .optional(),

  // spells this trait knows or lets you pick (e.g., Infernal Legacy, domain
  // spells). Resource-limited entries point at an id in `resources` below.
  spells: SpellGrantBlockSchema.optional(),

  // reactive blocks
  resources: z.array(ResourceGrantSchema).default([]),
  triggers: z.array(TriggerGrantSchema).default([]),
  diceRules: z.array(DiceRuleSchema).default([]),
  criticalHitModifiers: z.array(CriticalHitModifierSchema).default([]),

  // proactive capabilities
  actions: z.array(ActionGrantSchema).default([]),
});

export type TraitDefinition = z.infer<typeof TraitDefinitionSchema>;

export const ResolvedTraitChoiceSchema = z.object({
  traitId: z.string(),
  choiceId: z.string(), // maps to ChoiceProficiencyGrantSchema.id
  selectedProficiencyIds: z.array(z.string()),
});

export type ResolvedTraitChoice = z.infer<typeof ResolvedTraitChoiceSchema>;
