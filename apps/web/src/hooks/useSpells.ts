import { useMemo } from "react";
import {
  synthesizeSpells,
  type Ability,
  type SpellSynthesis,
} from "@project/engine";
import {
  toCharacterSave,
  useCharacterSheetStore,
} from "../store/characterSheetStore";
import { useAbilities, useDerivedStats } from "./useCharacterStats";

/**
 * The character's spells, one entry per source, and the slot pools that pay
 * for them: the synthesis the server's live sheet runs, over the same save,
 * so the spell a row offers is the spell the server finds.
 */
export const useSpells = (): SpellSynthesis => {
  const classLevels = useCharacterSheetStore((state) => state.classLevels);
  const subclassIds = useCharacterSheetStore((state) => state.subclassIds);
  const raceId = useCharacterSheetStore((state) => state.raceId);
  const subraceId = useCharacterSheetStore((state) => state.subraceId);
  const backgroundId = useCharacterSheetStore((state) => state.backgroundId);
  const choices = useCharacterSheetStore((state) => state.choices);
  const ruleSnapshot = useCharacterSheetStore((state) => state.ruleSnapshot);

  const { finalAbilities, totalMods, activeStates } = useAbilities();
  const { profBonus } = useDerivedStats();

  return useMemo(
    () =>
      synthesizeSpells({
        // the save is built from the store's current state; the fields read
        // above are the parts of it that decide what a character can cast
        save: toCharacterSave(useCharacterSheetStore.getState()),
        snapshot: ruleSnapshot ?? undefined,
        abilityScores: Object.fromEntries(
          Object.entries(finalAbilities).map(([ability, derived]) => [
            ability,
            derived.score,
          ]),
        ) as Record<Ability, number>,
        proficiencyBonus: profBonus,
        modifiers: totalMods,
        activeStates,
      }),
    [
      classLevels,
      subclassIds,
      raceId,
      subraceId,
      backgroundId,
      choices,
      ruleSnapshot,
      finalAbilities,
      totalMods,
      activeStates,
      profBonus,
    ],
  );
};
