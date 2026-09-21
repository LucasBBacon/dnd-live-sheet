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
  const getSheetModifiers = useCharacterSheetStore(
    (state) => state.getSheetModifiers,
  );
  const getSheetStates = useCharacterSheetStore(
    (state) => state.getSheetStates,
  );
  // getSheetModifiers and getSheetStates are stable references, so subscribe
  // to everything they read - otherwise the memo below would never recompute
  // (#73)
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
  // toggleCondition only changes activeConditions/activeStates, and an
  // effect dispatch mutates runtimeEffects in place while setting a new
  // activeStates array - neither is otherwise read above, so without this
  // subscription the memo below never recomputes when either happens (#73)
  const storeActiveStates = useCharacterSheetStore((state) => state.activeStates);

  return useMemo(() => {
    const totalMods = getSheetModifiers();
    const activeStates = getSheetStates();

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

    return { finalAbilities, totalMods, activeStates };
    // getSheetModifiers and getSheetStates are stable store-method
    // references, so react-hooks/exhaustive-deps cannot see what they
    // actually read - the getters read raceId, subraceId, backgroundId,
    // classLevels, subclassIds, choices, inventory, activeModifiers,
    // runtimeEffects, ruleSnapshot and activeStates, which is why those are
    // listed below instead. Keep this list in sync with what the getters
    // read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    baseScores,
    getSheetModifiers,
    getSheetStates,
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
    storeActiveStates,
  ]);
};

export const useDerivedStats = () => {
  const level = useCharacterSheetStore((state) => state.level);
  const classLevels = useCharacterSheetStore((state) => state.classLevels);
  const getProficiencyGrants = useCharacterSheetStore(
    (state) => state.getProficiencyGrants,
  );
  const baseHpRolled = useCharacterSheetStore((state) => state.baseHpRolled);

  const { finalAbilities, totalMods, activeStates } = useAbilities();

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

  const { finalAbilities, totalMods, activeStates } = useAbilities();
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
