import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, useEffect } from "react";
import { useAbilities, useDerivedStats } from "../useCharacterStats";
import { useCharacterSheetStore } from "../../store/characterSheetStore";
import { packRuleSnapshot } from "../../store/__tests__/packFixture";

// zustand's store subscription goes through useSyncExternalStore, which
// warns "not configured to support act(...)" on an external-store-driven
// re-render unless this is set, even when the triggering call is itself
// wrapped in act() below - DashboardLayout.test.tsx never hits this because
// it mocks the store as a plain selector call rather than a real
// subscription.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/*
 * useCharacterStats.test.ts mocks useMemo as `factory()` and mocks the store
 * entirely, so its memo always "recomputes" and it cannot see a real React
 * bailout. This suite renders the real hooks against the real store with
 * real React instead - createRoot/act, the same pattern
 * DashboardLayout.test.tsx and CombatWidget.test.tsx use, since
 * `@testing-library/react` is not a dependency of apps/web - so a dependency
 * missing from useAbilities' memo shows up exactly as it would on a live
 * sheet: the component never re-renders with the new value.
 */

let captured: {
  activeStates: string[];
  saves: ReturnType<typeof useDerivedStats>["saves"];
} | null = null;

const Harness = () => {
  const { activeStates } = useAbilities();
  const { saves } = useDerivedStats();
  // Reassigning a module-level variable during render is a side effect
  // (react-hooks/globals refuses it), so the capture runs in an effect
  // instead, after the commit it describes.
  useEffect(() => {
    captured = { activeStates, saves };
  });
  return null;
};

describe("useAbilities recomputes when a condition changes (#73 regression)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    captured = null;

    // A level-6 paladin with no subclass chosen has Aura of Protection
    // (trait_aura_of_protection, packages/database/data/packs/core_2014_pack
    // /traits/ported.json), granted purely by class progression - no choice
    // node to answer. It adds the CHA modifier to every save
    // (target: "ALL_SAVES", valueSource: "cha_modifier") unless
    // forbiddenStates: ["incapacitated"] is active. CHA 16 => +3, and the
    // paladin is not proficient in STR saves, so STR's totalModifier is a
    // clean, isolated read of whether the aura is currently applying.
    useCharacterSheetStore.getState().initialize({
      id: "char_1",
      level: 6,
      classLevels: { class_paladin: 6 },
      subclassIds: { class_paladin: null },
      traitGrants: [],
      raceId: "race_human",
      subraceId: null,
      backgroundId: null,
      baseScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 16 },
      inventory: [],
      activeModifiers: [],
      activeConditions: [],
      activeStates: [],
      runtimeEffects: null,
      ruleSnapshot: packRuleSnapshot(),
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(<Harness />);
    });
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it("picks up a toggled condition instead of staying stale", () => {
    expect(captured?.activeStates).not.toContain("incapacitated");
    expect(captured?.saves.STR.totalModifier).toBe(3);

    act(() => {
      useCharacterSheetStore.getState().toggleCondition("incapacitated");
    });

    expect(captured?.activeStates).toContain("incapacitated");
    expect(captured?.saves.STR.totalModifier).toBe(0);
  });
});
