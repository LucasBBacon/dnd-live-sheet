import { useMemo } from "react";
import { useCharacterSheetStore } from "../store/characterSheetStore";
import {
  AbilityEngine,
  DerivedStatEngine,
  InventoryExtractor,
  SaveEngine,
  SkillEngine,
  type Ability,
} from "@project/engine";
import { SKILL_MAP, type FixedProficiencyGrant } from "@project/shared";

const ABILITY_KEYS: Ability[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

/**
 * A custom React hook that calculates the character's final ability scores, modifiers, and total active modifiers based on base scores, active modifiers, and equipped inventory items.
 * @returns An object containing the final ability scores and modifiers for each ability, as well as an array of all active modifiers affecting the character.
 */
export const useAbilities = () => {
  const baseScores = useCharacterSheetStore((state) => state.baseScores);
  const activeModifiers = useCharacterSheetStore(
    (state) => state.activeModifiers,
  );
  const inventory = useCharacterSheetStore((state) => state.inventory);
  const activeStates = useCharacterSheetStore((state) => state.activeStates);
  const ruleSnapshot = useCharacterSheetStore((state) => state.ruleSnapshot);

  return useMemo(() => {
    // 1 - compile modifiers from equipped items
    const equipmentMods = InventoryExtractor.extractModifiers(
      inventory,
      ruleSnapshot ?? undefined,
    );
    const totalMods = [...activeModifiers, ...equipmentMods];

    const finalAbilities = {} as Record<
      Ability,
      { score: number; modifier: number }
    >;

    // 2 - run raw scores through engine
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
  }, [baseScores, activeModifiers, inventory, activeStates, ruleSnapshot]);
};

export const useDerivedStats = () => {
  const level = useCharacterSheetStore((state) => state.level);
  const classLevels = useCharacterSheetStore((state) => state.classLevels);
  const proficiencies = useCharacterSheetStore((state) => state.proficiencies);
  const baseHpRolled = useCharacterSheetStore((state) => state.baseHpRolled);
  const activeStates = useCharacterSheetStore((state) => state.activeStates);

  const { finalAbilities, totalMods } = useAbilities();

  return useMemo(() => {
    const profBonus = AbilityEngine.getProficiencyBonus(level);
    const skillAndInitiativeProficiencies: FixedProficiencyGrant[] =
      Object.entries(proficiencies)
        .filter(([, value]) => value !== "none")
        .map(([proficiencyId, value]) => ({
          category: "skills",
          proficiencyId,
          level: value as FixedProficiencyGrant["level"],
          requiredStates: [],
        }));

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

    // the store keeps proficiencies as a flat id -> level record with no
    // category, so saving-throw grants are recovered by matching ability names;
    // this is the same recovery useCombat performs for weapon proficiencies
    const saveProficiencies: FixedProficiencyGrant[] = ABILITY_KEYS.flatMap(
      (ability) => {
        const level =
          proficiencies[ability] ?? proficiencies[ability.toLowerCase()];

        if (level === undefined || level === "none") return [];

        return [
          {
            category: "saving_throws" as const,
            proficiencyId: ability,
            level: level as FixedProficiencyGrant["level"],
            requiredStates: [],
          },
        ];
      },
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

    return { profBonus, maxHp, initiative, armorClass, skills, saves };
  }, [
    level,
    baseHpRolled,
    proficiencies,
    classLevels,
    finalAbilities,
    totalMods,
    activeStates,
  ]);
};
