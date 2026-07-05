import { useMemo } from "react";
import { useCharacterSheetStore } from "../store/characterSheetStore";
import { useAbilities } from "./useCharacterStats";
import type { RuntimeModifier } from "@project/shared";
import {
  DerivedStatEngine,
  ITEM_DICTIONARY,
  TRAIT_DICTIONARY,
} from "@project/engine";

export const useDerivedStats = () => {
  const level = useCharacterSheetStore((state) => state.level);
  const baseHpRolled = useCharacterSheetStore((state) => state.baseHpRolled);
  const traits = useCharacterSheetStore((state) => state.traits || []);
  const inventory = useCharacterSheetStore((state) => state.inventory || []);

  const { finalAbilities } = useAbilities();

  // 1 - aggregator: map all sources into RuntimeModifiers
  const activeModifiers = useMemo<RuntimeModifier[]>(() => {
    const mods: RuntimeModifier[] = [];

    // map traits
    traits.forEach((traitRecord) => {
      const def = TRAIT_DICTIONARY[traitRecord.id];
      if (!def) return;

      def.modifiers.forEach((m, idx) => {
        let finalValue = m.value;
        if (m.scalingFactor === "total_level") finalValue *= level;

        mods.push({
          id: `${traitRecord.id}_mod_${idx}`,
          target: m.target,
          type: m.type,
          value: finalValue,
          scalingFactor: m.scalingFactor,
          sourceName: def.name,
          sourceOrigin: "trait",
          isActive: true,
        });
      });
    });

    // map equipped items
    const equippedItems = inventory.filter(
      (i) =>
        i.slot === "armor" || i.slot === "main_hand" || i.slot === "off_hand",
    );

    for (const itemRecord of equippedItems) {
      const def = ITEM_DICTIONARY[itemRecord.id];
      if (!def || !def.modifiers) continue;

      for (let i = 0; i < def.modifiers.length; i++) {
        const mod = def.modifiers[i];

        mods.push({
          target: mod.target,
          type: mod.type,
          value: mod.value,
          maxDexCap: mod.maxDexCap,
          scalingFactor: mod.scalingFactor,
          // injecting runtime metadata
          id: `${itemRecord.id}_mod_${i}`,
          sourceName: def.name,
          sourceOrigin: "item",
          isActive: true,
        });
      }
    }

    return mods;
  }, [traits, inventory, level]);

  // 2- feed the mapped modifiers into the pure math engine
  return useMemo(() => {
    const profBonus = DerivedStatEngine.calculateProficiencyBonus(level);

    const hpResult = DerivedStatEngine.calculateMaxHp(
      baseHpRolled,
      finalAbilities.con.modifier,
      level,
      activeModifiers,
    );

    const acResult = DerivedStatEngine.calculateAC(
      finalAbilities.dex.modifier,
      activeModifiers,
    );

    const initiativeResult = DerivedStatEngine.calculateInitiative(
      finalAbilities.dex.modifier,
      activeModifiers,
    );

    return {
      profBonus,
      hpResult,
      acResult,
      initiativeResult,
    };
  }, [level, baseHpRolled, activeModifiers, finalAbilities]);
};
