import { z } from "zod";
import { StartingEquipmentDefinitionSchema } from "../content/items.js";
import { abilityScoresOf } from "../primitives/ability.js";
import { CharacterChoicesSchema } from "../runtime/characterSave.js";

// #region Character Creation Payload

export const CreateCharacterPayloadSchema = z.object({
  campaignId: z.uuid().optional(),
  name: z.string().min(1, "Character name is required"),
  raceId: z.string(),
  subraceId: z.string().nullable(),

  // class configuration for lvl 1
  classId: z.string(),
  subclassId: z.string().nullable(),

  baseAbilityScores: abilityScoresOf(3, 18),

  alignment: z.string(),

  background: z.object({
    type: z.enum(["PRESET", "CUSTOM"]),
    presetId: z.string().nullable(),
    customData: z
      .object({
        name: z.string(),
        featureName: z.string(),
        featureDescription: z.string(),
        skillTraitIds: z.array(z.string()),
        toolLanguageTraitIds: z.array(z.string()),
      })
      .nullable(),
  }),

  personality: z.object({
    traits: z.string(),
    ideals: z.string(),
    bonds: z.string(),
    flaws: z.string(),
  }),

  // resolved starting equipment for a character build, expressed in the shared
  // grant schema rather than the legacy flat item-id array
  startingEquipment: StartingEquipmentDefinitionSchema.default({
    given: [],
    choices: [],
  }),

  // the answers to the questions level 1 asks - class picks by node, trait
  // choice-block picks by block id; omitted until the wizard asks them
  choices: CharacterChoicesSchema.optional(),
});

// #endregion

// #region Type Exports

export type CreateCharacterPayload = z.infer<
  typeof CreateCharacterPayloadSchema
>;

// #endregion
