import type { TraitProficiencyCategory } from "@project/shared";
import { SKILL_MAP } from "../types/core.js";

/**
 * The rosters behind an open choice block.
 *
 * A ChoiceProficiencyGrant with no `options` means "anything from this
 * category", which is only answerable if the category has a roster to draw
 * from. Traits state the rule ("one extra language of your choice"); the
 * roster says what exists; the engine subtracts what the character already
 * holds. None of those three belong in the other's file.
 */

export interface LanguageDefinition {
  id: string;
  name: string;
  /**
   * Exotic languages are still offered, because whether one is available is a
   * table ruling rather than a rule. The flag lets a UI group or gate them.
   */
  isExotic: boolean;
  /**
   * Druidic and Thieves' Cant are granted by a class feature and can never be
   * taken as a free pick, so they are excluded from open choice blocks.
   */
  isSecret: boolean;
}

const language = (
  id: string,
  name: string,
  { isExotic = false, isSecret = false } = {},
): LanguageDefinition => ({ id, name, isExotic, isSecret });

/** Ids are bare (`dwarvish`), matching the trait dictionaries. */
export const LANGUAGE_DICTIONARY: Record<string, LanguageDefinition> = {
  // standard
  common: language("common", "Common"),
  dwarvish: language("dwarvish", "Dwarvish"),
  elvish: language("elvish", "Elvish"),
  giant: language("giant", "Giant"),
  gnomish: language("gnomish", "Gnomish"),
  goblin: language("goblin", "Goblin"),
  halfling: language("halfling", "Halfling"),
  orc: language("orc", "Orc"),

  // exotic
  abyssal: language("abyssal", "Abyssal", { isExotic: true }),
  celestial: language("celestial", "Celestial", { isExotic: true }),
  deep_speech: language("deep_speech", "Deep Speech", { isExotic: true }),
  draconic: language("draconic", "Draconic", { isExotic: true }),
  infernal: language("infernal", "Infernal", { isExotic: true }),
  primordial: language("primordial", "Primordial", { isExotic: true }),
  sylvan: language("sylvan", "Sylvan", { isExotic: true }),
  undercommon: language("undercommon", "Undercommon", { isExotic: true }),

  // secret - granted by a feature, never chosen
  druidic: language("druidic", "Druidic", { isSecret: true }),
  thieves_cant: language("thieves_cant", "Thieves' Cant", { isSecret: true }),
};

const CHOOSABLE_LANGUAGE_IDS = Object.values(LANGUAGE_DICTIONARY)
  .filter((entry) => !entry.isSecret)
  .map((entry) => entry.id);

/**
 * Every proficiency a category can offer, or undefined when the category has no
 * roster yet. Tools, weapons and armour are still enumerated by hand on each
 * choice block; until they have dictionaries of their own, a block in those
 * categories must carry explicit `options`.
 */
export const listProficiencyOptions = (
  category: TraitProficiencyCategory,
): string[] | undefined => {
  switch (category) {
    case "languages":
      return [...CHOOSABLE_LANGUAGE_IDS];
    case "skills":
      return Object.keys(SKILL_MAP);
    default:
      return undefined;
  }
};
