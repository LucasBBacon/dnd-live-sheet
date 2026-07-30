import type { FeatureGrant } from "@project/shared";
import { BARBARIAN_SUBCLASSES } from "./classes/barbarianDictionary.js";
import { BARD_SUBCLASSES } from "./classes/bardDictionary.js";
import { CLERIC_SUBCLASSES } from "./classes/clericDictionary.js";
import { DRUID_SUBCLASSES } from "./classes/druidDictionary.js";
import { FIGHTER_SUBCLASSES } from "./classes/fighterDictionary.js";
import { MONK_SUBCLASSES } from "./classes/monkDictionary.js";
import { PALADIN_SUBCLASSES } from "./classes/paladinDictionary.js";
import { RANGER_SUBCLASSES } from "./classes/rangerDictionary.js";
import { ROGUE_SUBCLASSES } from "./classes/rogueDictionary.js";
import { SORCERER_SUBCLASSES } from "./classes/sorcererDictionary.js";
import { WARLOCK_SUBCLASSES } from "./classes/warlockDictionary.js";
import { WIZARD_SUBCLASSES } from "./classes/wizardDictionary.js";

/**
 * Subclasses are keyed in their own table because a character save stores
 * classId and subclassId independently - the bootstrapper resolves them as two
 * separate lookups rather than walking into the parent class.
 *
 * The definitions themselves live next to their parent class in ./classes, so
 * that a class and its subclasses stay in one file while the lookup tables stay
 * separate.
 */
export interface SubclassLevelFeature {
  level: number;
  grants: FeatureGrant[];
}

export interface SubclassDefinition {
  id: string;
  classId: string;
  name: string;
  // sparse: only levels that actually grant something are listed
  progression: SubclassLevelFeature[];
}

export const SUBCLASS_DICTIONARY: Record<string, SubclassDefinition> = {
  ...BARBARIAN_SUBCLASSES,
  ...BARD_SUBCLASSES,
  ...CLERIC_SUBCLASSES,
  ...DRUID_SUBCLASSES,
  ...FIGHTER_SUBCLASSES,
  ...MONK_SUBCLASSES,
  ...PALADIN_SUBCLASSES,
  ...RANGER_SUBCLASSES,
  ...ROGUE_SUBCLASSES,
  ...SORCERER_SUBCLASSES,
  ...WARLOCK_SUBCLASSES,
  ...WIZARD_SUBCLASSES,
};

export const resolveSubclassDefinition = (
  subclassId: string,
): SubclassDefinition | undefined => SUBCLASS_DICTIONARY[subclassId];

export const listSubclassesForClass = (classId: string): SubclassDefinition[] =>
  Object.values(SUBCLASS_DICTIONARY).filter((s) => s.classId === classId);
