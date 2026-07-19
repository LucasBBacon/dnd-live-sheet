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
