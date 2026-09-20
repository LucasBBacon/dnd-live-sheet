import type { TraitProficiencyCategory } from "@project/shared";
import { SKILL_MAP } from "@project/shared";

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

export interface ToolDefinition {
  id: string;
  name: string;
}

const tool = (id: string, name: string): ToolDefinition => ({ id, name });

/**
 * Every tool a character can be proficient with.
 *
 * Specific tools only. The PHB never grants "artisan's tools" as a blanket
 * proficiency - it grants "one type of artisan's tools of your choice", which
 * is a choice block whose options are listed. A category id in here would make
 * the wrong thing authorable, and the wrong thing was already authored: the
 * gnome's Tinker granted `artisans_tools` while its own lore says tinker's
 * tools.
 *
 * Tools sit beside languages rather than beside weapons and armour because
 * they are the same shape as languages: a closed set with no catalogue entry
 * behind it. Weapons and armour resolve against the equipment catalogue
 * instead - see itemProficiency.ts.
 */
export const TOOL_DICTIONARY: Record<string, ToolDefinition> = {
  // artisan's tools
  alchemists_supplies: tool("alchemists_supplies", "Alchemist's Supplies"),
  brewers_supplies: tool("brewers_supplies", "Brewer's Supplies"),
  calligraphers_supplies: tool("calligraphers_supplies", "Calligrapher's Supplies"),
  carpenters_tools: tool("carpenters_tools", "Carpenter's Tools"),
  cartographers_tools: tool("cartographers_tools", "Cartographer's Tools"),
  cobblers_tools: tool("cobblers_tools", "Cobbler's Tools"),
  cooks_utensils: tool("cooks_utensils", "Cook's Utensils"),
  glassblowers_tools: tool("glassblowers_tools", "Glassblower's Tools"),
  jewelers_tools: tool("jewelers_tools", "Jeweler's Tools"),
  leatherworkers_tools: tool("leatherworkers_tools", "Leatherworker's Tools"),
  masons_tools: tool("masons_tools", "Mason's Tools"),
  painters_supplies: tool("painters_supplies", "Painter's Supplies"),
  potters_tools: tool("potters_tools", "Potter's Tools"),
  smiths_tools: tool("smiths_tools", "Smith's Tools"),
  tinkers_tools: tool("tinkers_tools", "Tinker's Tools"),
  weavers_tools: tool("weavers_tools", "Weaver's Tools"),
  woodcarvers_tools: tool("woodcarvers_tools", "Woodcarver's Tools"),

  // gaming sets
  dice_set: tool("dice_set", "Dice Set"),
  dragonchess_set: tool("dragonchess_set", "Dragonchess Set"),
  playing_card_set: tool("playing_card_set", "Playing Card Set"),
  three_dragon_ante_set: tool("three_dragon_ante_set", "Three-Dragon Ante Set"),

  // musical instruments
  bagpipes: tool("bagpipes", "Bagpipes"),
  drum: tool("drum", "Drum"),
  dulcimer: tool("dulcimer", "Dulcimer"),
  flute: tool("flute", "Flute"),
  horn: tool("horn", "Horn"),
  lute: tool("lute", "Lute"),
  lyre: tool("lyre", "Lyre"),
  pan_flute: tool("pan_flute", "Pan Flute"),
  shawm: tool("shawm", "Shawm"),
  viol: tool("viol", "Viol"),

  // kits and standalone tools
  disguise_kit: tool("disguise_kit", "Disguise Kit"),
  forgery_kit: tool("forgery_kit", "Forgery Kit"),
  herbalism_kit: tool("herbalism_kit", "Herbalism Kit"),
  navigators_tools: tool("navigators_tools", "Navigator's Tools"),
  poisoners_kit: tool("poisoners_kit", "Poisoner's Kit"),
  thieves_tools: tool("thieves_tools", "Thieves' Tools"),

  // vehicles
  vehicles_land: tool("vehicles_land", "Vehicles (Land)"),
  vehicles_water: tool("vehicles_water", "Vehicles (Water)"),
};

/**
 * Every proficiency a category can offer, or undefined when the category has no
 * roster yet. Weapons and armour have no roster here and do not need one: an item names
 * its own proficiency ids, so the catalogue is the vocabulary - see
 * itemProficiency.ts. Tools and languages have no catalogue behind them, so
 * they are enumerated here.
 */
export const listProficiencyOptions = (
  category: TraitProficiencyCategory,
): string[] | undefined => {
  switch (category) {
    case "languages":
      return [...CHOOSABLE_LANGUAGE_IDS];
    case "skills":
      return Object.keys(SKILL_MAP);
    case "tools":
      return Object.keys(TOOL_DICTIONARY);
    default:
      return undefined;
  }
};
