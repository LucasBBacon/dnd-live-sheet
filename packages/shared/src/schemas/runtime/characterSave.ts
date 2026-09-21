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

/**
 * Every answer a character has given, keyed by the question it answers.
 *
 * The two maps CharacterSave consumes, stored as-is: class progression picks
 * by class and then by the grant's nodeId, and trait choice-block picks by the
 * block's id. Persisting the question with the answer is the point - the
 * database used to keep chosen traits as bare rows and guess the node back,
 * crediting a pick to every node that offered it (#69).
 */
export const CharacterChoicesSchema = z.object({
  classSelections: z
    .record(z.string(), z.record(z.string(), z.array(z.string())))
    .default({}),
  traitSelections: z.record(z.string(), z.array(z.string())).default({}),
});

export type CharacterChoices = z.infer<typeof CharacterChoicesSchema>;

/** A character that has not answered anything yet. */
export const emptyCharacterChoices = (): CharacterChoices => ({
  classSelections: {},
  traitSelections: {},
});

export const CharacterSaveSchema = z.object({
  // base attributes
  attributes: abilityScoresOf(1, 30),

  // progressions
  race: RaceConfigurationSchema,
  /**
   * The preset background, by id. Optional: a custom background carries its
   * traits as character_custom_traits rows instead, and saves built before
   * backgrounds reached the engine have none.
   */
  backgroundId: z.string().min(1).optional(),
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
