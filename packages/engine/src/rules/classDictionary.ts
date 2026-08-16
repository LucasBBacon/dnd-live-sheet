import type { ClassDefinition } from "@project/shared";
import { BARD_CLASS } from "./classes/bardDictionary.js";
import { CLERIC_CLASS } from "./classes/clericDictionary.js";
import { DRUID_CLASS } from "./classes/druidDictionary.js";
import { FIGHTER_CLASS } from "./classes/fighterDictionary.js";
import { MONK_CLASS } from "./classes/monkDictionary.js";
import { PALADIN_CLASS } from "./classes/paladinDictionary.js";
import { RANGER_CLASS } from "./classes/rangerDictionary.js";
import { ROGUE_CLASS } from "./classes/rogueDictionary.js";
import { SORCERER_CLASS } from "./classes/sorcererDictionary.js";
import { WARLOCK_CLASS } from "./classes/warlockDictionary.js";
import { WIZARD_CLASS } from "./classes/wizardDictionary.js";

/**
 * Canonical class blueprints, one file per class in ./classes.
 *
 * Class ids, level features and trait ids are transcribed from the database
 * seed at packages/database/data/classes.json, so the two stay in sync. Two
 * deliberate differences:
 *
 * 1. `trait_ability_score_improvement` is dropped in favour of the schema's own
 *    `grantsASI` flag.
 * 2. Spell progression (cantrips known, spells known, the wizard spellbook,
 *    Magical Secrets, Mystic Arcanum) is added as `spell_choice` nodes. The
 *    seed carries no spell data at all.
 * 3. Features that are really a choice become `trait_choice` nodes over the
 *    traits you can pick, so `trait_fighting_style` is replaced by a node
 *    listing the styles that class offers. Same for the druid's circle land.
 *
 * Everything else is verbatim, including trait ids repeated across levels
 * (`trait_rage` at 3/9/12/16/17/20) - those mark levels where a feature scales,
 * and the engine, not this dictionary, decides how to fold them.
 */
export const CLASS_DICTIONARY: Record<string, ClassDefinition> = {
  class_bard: BARD_CLASS,
  class_cleric: CLERIC_CLASS,
  class_druid: DRUID_CLASS,
  class_fighter: FIGHTER_CLASS,
  class_monk: MONK_CLASS,
  class_paladin: PALADIN_CLASS,
  class_ranger: RANGER_CLASS,
  class_rogue: ROGUE_CLASS,
  class_sorcerer: SORCERER_CLASS,
  class_warlock: WARLOCK_CLASS,
  class_wizard: WIZARD_CLASS,
};

export const resolveClassDefinition = (
  classId: string,
): ClassDefinition | undefined => CLASS_DICTIONARY[classId];
