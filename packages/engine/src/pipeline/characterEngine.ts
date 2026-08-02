import type {
  ActionGrant,
  CalculationResult,
  CharacterSave,
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
import { DerivedStatEngine } from "../calculators/derivedStats.js";

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

  // skills and saves
  skills: Record<string, DerivedSkill>; // keyed by skillId

  // executable actions (traits, spells, weapons)
  actions: ActionGrant[];

  // current environment
  activeStates: string[];
}

export class CharacterEngine {
  public static buildLiveSheet(
    save: CharacterSave,
    effectManager: EffectManager,
    resourceManager: ResourceManager,
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

    // 3 - merge static trait math with dynamic live math (spells, conditions)
    const activeStates = effectManager.getActiveStates();
    const liveModifiers = effectManager.getActiveModifiers();
    const allModifiers = [...staticModifiers, ...liveModifiers];

    // endregion

    // region Calculations

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
        activeStates,
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
      activeStates,
    );

    const armorClass = DerivedStatEngine.calculateAC(
      abilities.DEX.modifier,
      allModifiers,
      activeStates,
    );

    const initiative = DerivedStatEngine.calculateInitiative(
      abilities.DEX.modifier,
      profBonus,
      proficiencies,
      allModifiers,
      activeStates,
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
        activeStates,
      );
    }

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

      skills,
      actions,
      activeStates,
    };

    // endregion
  }
}
