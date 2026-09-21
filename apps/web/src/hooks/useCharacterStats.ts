import { useMemo } from "react";
import { useCharacterSheetStore } from "../store/characterSheetStore";
import {
  AbilityEngine,
  DerivedStatEngine,
  SaveEngine,
  SkillEngine,
  SpellcastingEngine,
  collectCastingSources,
  type Ability,
  type DerivedSpellcasting,
} from "@project/engine";
import { SKILL_MAP } from "@project/shared";

const ABILITY_KEYS: Ability[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

/**
 * A custom React hook that calculates the character's final ability scores
 * and modifiers from every modifier the sheet applies - traits, equipment
 * and live effects, via the store's getSheetModifiers (#73).
 * @returns An object containing the final ability scores and modifiers for each ability, as well as an array of all active modifiers affecting the character.
 */
export const useAbilities = () => {
  const baseScores = useCharacterSheetStore((state) => state.baseScores);
  const activeStates = useCharacterSheetStore((state) => state.activeStates);
  const getSheetModifiers = useCharacterSheetStore(
    (state) => state.getSheetModifiers,
  );
  // getSheetModifiers is a stable reference, so subscribe to everything it
  // reads - otherwise the memo below would never recompute (#73)
  const raceId = useCharacterSheetStore((state) => state.raceId);
  const subraceId = useCharacterSheetStore((state) => state.subraceId);
  const backgroundId = useCharacterSheetStore((state) => state.backgroundId);
  const classLevels = useCharacterSheetStore((state) => state.classLevels);
  const subclassIds = useCharacterSheetStore((state) => state.subclassIds);
  const choices = useCharacterSheetStore((state) => state.choices);
  const inventory = useCharacterSheetStore((state) => state.inventory);
  const activeModifiers = useCharacterSheetStore(
    (state) => state.activeModifiers,
  );
  const runtimeEffects = useCharacterSheetStore((state) => state.runtimeEffects);
  const ruleSnapshot = useCharacterSheetStore((state) => state.ruleSnapshot);

  return useMemo(() => {
    const totalMods = getSheetModifiers();

    const finalAbilities = {} as Record<
      Ability,
      { score: number; modifier: number }
    >;

    (Object.keys(baseScores) as Ability[]).forEach((stat) => {
      const derived = AbilityEngine.calculateScore(
        baseScores[stat],
        stat,
        totalMods,
        activeStates,
      );
      finalAbilities[stat] = {
        score: derived.score,
        modifier: derived.modifier,
      };
    });

    return { finalAbilities, totalMods };
  }, [
    baseScores,
    activeStates,
    getSheetModifiers,
    raceId,
    subraceId,
    backgroundId,
    classLevels,
    subclassIds,
    choices,
    inventory,
    activeModifiers,
    runtimeEffects,
    ruleSnapshot,
  ]);
};

export const useDerivedStats = () => {
  const level = useCharacterSheetStore((state) => state.level);
  const classLevels = useCharacterSheetStore((state) => state.classLevels);
  const getProficiencyGrants = useCharacterSheetStore(
    (state) => state.getProficiencyGrants,
  );
  const baseHpRolled = useCharacterSheetStore((state) => state.baseHpRolled);
  const activeStates = useCharacterSheetStore((state) => state.activeStates);

  const { finalAbilities, totalMods } = useAbilities();

  return useMemo(() => {
    const profBonus = AbilityEngine.getProficiencyBonus(level);
    const grants = getProficiencyGrants();
    const skillAndInitiativeProficiencies = grants.filter(
      (grant) => grant.category === "skills",
    );

    // hp calc
    const maxHp = DerivedStatEngine.calculateMaxHp(
      baseHpRolled,
      finalAbilities.CON.modifier,
      {
        total: level,
        classes: classLevels,
      },
      totalMods,
      activeStates,
    );

    // initiative
    const initiative = DerivedStatEngine.calculateInitiative(
      finalAbilities.DEX.modifier,
      profBonus,
      skillAndInitiativeProficiencies,
      totalMods,
      activeStates,
    );

    // ac calc
    const armorClass = DerivedStatEngine.calculateAC(
      Object.fromEntries(
        Object.entries(finalAbilities).map(([ability, derived]) => [
          ability,
          derived.modifier,
        ]),
      ) as Record<Ability, number>,
      totalMods,
      activeStates,
    );

    // skills calc
    const skills = Object.values(SKILL_MAP).map((skillDef) => {
      return SkillEngine.calculateSkill(
        skillDef.id,
        finalAbilities[skillDef.ability].score,
        profBonus,
        skillAndInitiativeProficiencies,
        totalMods,
        activeStates,
      );
    });

    const saveProficiencies = grants.filter(
      (grant) => grant.category === "saving_throws",
    );

    const saves = SaveEngine.calculateSaves(
      Object.fromEntries(
        ABILITY_KEYS.map((ability) => [ability, finalAbilities[ability].score]),
      ) as Record<Ability, number>,
      profBonus,
      saveProficiencies,
      totalMods,
      activeStates,
    );

    const attacksPerAction = DerivedStatEngine.calculateAttacksPerAction(
      totalMods,
      { total: level, classes: classLevels },
      activeStates,
    );

    return {
      profBonus,
      maxHp,
      initiative,
      armorClass,
      skills,
      saves,
      attacksPerAction,
    };
  }, [
    level,
    baseHpRolled,
    getProficiencyGrants,
    classLevels,
    finalAbilities,
    totalMods,
    activeStates,
  ]);
};

/**
 * The save DC and attack bonus for each class the character casts with.
 * Empty for a character that casts nothing, which is what lets the widget
 * render nothing at all rather than an empty panel.
 */
export const useSpellcasting = (): DerivedSpellcasting[] => {
  const classLevels = useCharacterSheetStore((state) => state.classLevels);
  const subclassIds = useCharacterSheetStore((state) => state.subclassIds);
  const ruleSnapshot = useCharacterSheetStore((state) => state.ruleSnapshot);
  const activeStates = useCharacterSheetStore((state) => state.activeStates);

  const { finalAbilities, totalMods } = useAbilities();
  const { profBonus } = useDerivedStats();

  return useMemo(() => {
    const sources = collectCastingSources(
      classLevels,
      subclassIds,
      ruleSnapshot ?? undefined,
    );

    return SpellcastingEngine.calculate(
      sources,
      Object.fromEntries(
        Object.entries(finalAbilities).map(([ability, derived]) => [
          ability,
          derived.score,
        ]),
      ) as Record<Ability, number>,
      profBonus,
      totalMods,
      activeStates,
    );
  }, [
    classLevels,
    subclassIds,
    ruleSnapshot,
    finalAbilities,
    profBonus,
    totalMods,
    activeStates,
  ]);
};
