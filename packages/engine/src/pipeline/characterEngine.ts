import type {
  ActionGrant,
  CalculationResult,
  CharacterSave,
  InventoryInstance,
} from "@project/shared";
import {
  AbilityEngine,
  type DerivedAbility,
} from "../calculators/abilities.js";
import { SKILL_MAP, type Ability } from "../types/core.js";
import { SkillEngine, type DerivedSkill } from "../calculators/skills.js";
import type { EffectManager } from "../calculators/effects.js";
import type { ResourceManager } from "../calculators/resources.js";
import { CharacterBootstrapper } from "./characterBootstraper.js";
import { ModifierExtractor } from "./modifierExtractor.js";
import { ProficiencyExtractor } from "./proficiencyExtractor.js";
import { StateExtractor } from "./stateExtractor.js";
import { InventoryExtractor } from "./inventoryExtractor.js";
import { DerivedStatEngine } from "../calculators/derivedStats.js";
import { SpeedEngine } from "../calculators/speed.js";
import { InventoryWeightCalculator } from "../calculators/weight.js";
import {
  DEFAULT_ENCUMBRANCE_RULES,
  EncumbranceEngine,
  POWERFUL_BUILD_STATE,
  type EncumbranceResult,
  type EncumbranceRules,
} from "../calculators/encumbrance.js";
import {
  DEFAULT_WALKING_SPEED,
  RACE_DICTIONARY,
} from "../rules/raceDictionary.js";
import type { RuleSnapshotLookup } from "../rules/ruleLookup.js";

export interface LiveSheetOptions {
  /** Homebrew and imported rules, when the host app has a snapshot loaded. */
  snapshot?: RuleSnapshotLookup;
  /** Campaign setting. Defaults to standard 5e, where nothing slows you down. */
  encumbranceRules?: EncumbranceRules;
}

export interface LiveCharacterSheet {
  // core stats
  abilities: Record<Ability, DerivedAbility>;
  proficiencyBonus: number;

  // derived combat stats
  maxHp: CalculationResult;
  currentHp: number;
  tempHp: number;
  armorClass: CalculationResult;
  initiative: CalculationResult;
  speed: CalculationResult;

  // skills and saves
  skills: Record<string, DerivedSkill>; // keyed by skillId

  // load
  encumbrance: EncumbranceResult;

  // executable actions (traits, spells, weapons)
  actions: ActionGrant[];

  // current environment
  /**
   * Trait- and effect-granted states: everything true about the character
   * before the load in their pack is known. This is what stage one gates on.
   */
  baseStates: string[];
  /**
   * baseStates plus whatever encumbrance derived. The full picture, and what
   * the UI and the roll layer should read.
   */
  activeStates: string[];
}

export class CharacterEngine {
  public static buildLiveSheet(
    save: CharacterSave,
    inventory: InventoryInstance[],
    effectManager: EffectManager,
    resourceManager: ResourceManager,
    options: LiveSheetOptions = {},
  ): LiveCharacterSheet {
    // region Aggregation and Extraction

    // 1- compile active traits from blueprints
    const activeTraits = CharacterBootstrapper.compileActiveTraits(save);

    // 2 - extract static math and proficiencies
    // both extractors read from the same flattened pick table: trait choice
    // blocks and class progression nodes share one namespace once the traits
    // have been compiled and no longer remember who granted them
    const selections = CharacterBootstrapper.resolveSelections(save);
    const staticModifiers = ModifierExtractor.extractModifiers(
      activeTraits,
      selections,
    );
    const proficiencies = ProficiencyExtractor.extractProficiencies(
      activeTraits,
      selections,
    );

    // 3 - merge static trait math with worn equipment and dynamic live math
    // (spells, conditions)
    const baseStates = Array.from(
      new Set([
        ...StateExtractor.extractStates(activeTraits),
        ...effectManager.getActiveStates(),
      ]),
    );
    const inventoryModifiers = InventoryExtractor.extractModifiers(
      inventory,
      options.snapshot,
    );
    const liveModifiers = effectManager.getActiveModifiers();
    const allModifiers = [
      ...staticModifiers,
      ...inventoryModifiers,
      ...liveModifiers,
    ];

    // endregion

    // region Calculations (stage one)
    //
    // Everything below reads baseStates. Nothing here may read the states
    // encumbrance derives further down - see the note on that region.

    // 1 - base level & proficiency
    const totalLevel = save.classes.reduce((sum, cls) => sum + cls.level, 0);
    const profBonus = AbilityEngine.getProficiencyBonus(totalLevel);

    // 2 - ability scores
    const abilities = {} as Record<Ability, DerivedAbility>;
    const abilityKeys: Ability[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

    for (const key of abilityKeys) {
      abilities[key] = AbilityEngine.calculateScore(
        save.attributes[key.toLowerCase() as keyof typeof save.attributes],
        key,
        allModifiers,
        baseStates,
      );
    }

    // 3 - derived stats
    const levelProfile = {
      total: totalLevel,
      classes: save.classes.reduce(
        (acc, cls) => {
          acc[cls.classId] = cls.level;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };

    const maxHp = DerivedStatEngine.calculateMaxHp(
      // the UI/Bootstrapper calculates the flat base rolled HP during level up
      save.hp.baseRolledHp,
      abilities.CON.modifier,
      levelProfile,
      allModifiers,
      baseStates,
    );

    const armorClass = DerivedStatEngine.calculateAC(
      abilities.DEX.modifier,
      allModifiers,
      baseStates,
    );

    const initiative = DerivedStatEngine.calculateInitiative(
      abilities.DEX.modifier,
      profBonus,
      proficiencies,
      allModifiers,
      baseStates,
    );

    // 4  - skills

    const skills = {} as Record<string, DerivedSkill>;
    const skillList = Object.keys(SKILL_MAP);

    for (const skillId of skillList) {
      const governingStat = SKILL_MAP[skillId]?.ability as Ability;
      skills[skillId] = SkillEngine.calculateSkill(
        skillId,
        abilities[governingStat].score,
        profBonus,
        proficiencies,
        allModifiers,
        baseStates,
      );
    }

    // endregion

    // region Load (stage two)
    //
    // The pipeline's one two-phase dependency. Encumbrance needs the *final*
    // STR score, so it cannot run until stage one is done - and its own output
    // must never flow back into stage one, or a belt of giant strength would
    // change the capacity that changed the state that changed the score.
    //
    // The invariant, stated once because everything here rests on it: nothing
    // above this line may read sheetStates.

    const race = RACE_DICTIONARY[save.race.baseRaceId];

    const encumbrance = EncumbranceEngine.calculate({
      totalHundredths: InventoryWeightCalculator.totalHundredths(
        inventory,
        options.snapshot,
      ),
      strScore: abilities.STR.score,
      // a save can name a race the loaded rulebook no longer has; medium is the
      // assumption that changes the least
      size: race?.size ?? "medium",
      hasPowerfulBuild: baseStates.includes(POWERFUL_BUILD_STATE),
      rules: options.encumbranceRules ?? DEFAULT_ENCUMBRANCE_RULES,
    });

    const sheetStates = [...baseStates, ...encumbrance.states];

    const speed = SpeedEngine.calculateSpeed(
      race?.speed ?? DEFAULT_WALKING_SPEED,
      allModifiers,
      sheetStates,
      encumbrance.tier,
    );

    // endregion

    // region State Synthesis

    // 1 - hydrate resources
    // engine extracts ResourceGrants from traits and feeds to manager
    // manager retains current charges, but updates max limits automatically
    const resourceGrants = activeTraits.flatMap((t) => t.resources || []);
    resourceManager.initializeFromGrants(resourceGrants);

    // 2 - synthesize actions
    // aggregate static actions from traits
    const actions: ActionGrant[] = activeTraits.flatMap((t) => t.actions || []);

    // TODO: synthesize weapon actions from the character's inventory (future implementation)

    // endregion

    // region Snapshot

    return {
      abilities,
      proficiencyBonus: profBonus,

      maxHp,
      currentHp: save.hp.current,
      tempHp: save.hp.temporary,
      armorClass,
      initiative,
      speed,

      skills,
      encumbrance,
      actions,
      baseStates,
      activeStates: sheetStates,
    };

    // endregion
  }
}
