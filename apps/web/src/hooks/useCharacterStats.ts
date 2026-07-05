import { useMemo } from "react";
import { useCharacterSheetStore } from "../store/characterSheetStore";
import {
  AbilityEngine,
  DerivedStatEngine,
  InventoryBridge,
  SKILL_MAP,
  SkillEngine,
  type Ability,
} from "@project/engine";

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

  return useMemo(() => {
    // 1 - compile modifiers from equipped items
    const equipmentMods = InventoryBridge.compileEquipmentModifiers(inventory);
    const totalMods = [...activeModifiers, ...equipmentMods];

    const finalAbilities = {} as Record<
      Ability,
      { score: number; modifier: number }
    >;

    // 2 - run raw scores through engine
    (Object.keys(baseScores) as Ability[]).forEach((stat) => {
      const score = AbilityEngine.calculateScore(
        baseScores[stat],
        stat,
        totalMods,
      );
      finalAbilities[stat] = {
        score,
        modifier: AbilityEngine.getModifier(score),
      };
    });

    return { finalAbilities, totalMods };
  }, [baseScores, activeModifiers, inventory]);
};

export const useDerivedStats = () => {
  const level = useCharacterSheetStore((state) => state.level);
  const proficiencies = useCharacterSheetStore((state) => state.proficiencies);
  const baseHpRolled = useCharacterSheetStore((state) => state.baseHpRolled);
  const traits = useCharacterSheetStore((state) => state.traits || []);

  const activeTraitIds = useMemo(() => traits.map((t) => t.id), [traits]);

  const { finalAbilities, totalMods } = useAbilities();

  return useMemo(() => {
    const profBonus = AbilityEngine.getProficiencyBonus(level);
    const dexMod = finalAbilities.dex.modifier;

    // hp calc
    const maxHp = DerivedStatEngine.calculateMaxHp(
      baseHpRolled,
      finalAbilities.con.modifier,
      level,
      activeTraitIds,
    );

    // initiative
    const initiative = DerivedStatEngine.calculateInitiative(
      finalAbilities.dex.modifier,
      activeTraitIds,
    );

    // ac calc
    const armorClass = DerivedStatEngine.calculateAC(dexMod, totalMods);

    // skills calc
    const skills = Object.values(SKILL_MAP).map((skillDef) => {
      const governingScore = finalAbilities[skillDef.ability].score;
      const profLevel = proficiencies[skillDef.id] || "none";

      return SkillEngine.calculateSkill(
        skillDef.id,
        governingScore,
        profLevel,
        profBonus,
      );
    });

    return { profBonus, maxHp, initiative, armorClass, skills };
  }, [
    level,
    baseHpRolled,
    activeTraitIds,
    proficiencies,
    finalAbilities,
    totalMods,
  ]);
};
