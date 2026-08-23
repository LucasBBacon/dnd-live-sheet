import { z } from "zod";
import { RaceConfigurationSchema } from "../content/character.js";
import { abilityScoresOf } from "../primitives/ability.js";

// #region Unified Character Engine Schema

export const CharacterClassStateSchema = z.object({
  classId: z.string().min(1),
  level: z.number().int().min(1).max(20),
  subclassId: z.string().optional(),

  // maps a choice id to selected option id(s)
  // e.g., {"fighter_fighting_style": ["archery"], "asi_level_4": ["feat_mobile"]}
  selections: z.record(z.string(), z.array(z.string())).default({}),
});

export const CharacterSaveSchema = z.object({
  // base attributes
  attributes: abilityScoresOf(1, 30),

  // progressions
  race: RaceConfigurationSchema,
  classes: z.array(CharacterClassStateSchema).min(1), // multiclass

  /**
   * Picks made inside a trait's own choice blocks, keyed by
   * ChoiceModifierGrant.id / ChoiceProficiencyGrant.id.
   *
   * Kept apart from CharacterClassState.selections because those are keyed by
   * the nodeId of a class progression grant, while a trait choice can just as
   * easily come from a race or subrace, which has no class to hang off.
   * e.g., {"half_elf_asi_choice": ["DEX", "CHA"], "skill_versatility_choice": ["stealth", "perception"]}
   */
  traitSelections: z.record(z.string(), z.array(z.string())).default({}),

  // live state
  hp: z.object({
    current: z.number().int().min(0),
    temporary: z.number().int().min(0).default(0),
    baseRolledHp: z.number().int().min(0),
    hitDiceSpent: z.record(z.string(), z.number()).default({}),
  }),
});

export type CharacterSave = z.infer<typeof CharacterSaveSchema>;

// #endregion
