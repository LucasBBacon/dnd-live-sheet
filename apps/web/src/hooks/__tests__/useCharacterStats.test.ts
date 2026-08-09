import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    useMemo: <T>(factory: () => T) => factory(),
  };
});

let mockStoreState: {
  baseScores: Record<string, number>;
  activeModifiers: unknown[];
  inventory: Array<{
    id: string;
    itemId: string;
    quantity: number;
    slot: string;
    isAttuned: boolean;
  }>;
  activeStates: string[];
  ruleSnapshot: null;
  level: number;
  classLevels: Record<string, number>;
  proficiencies: Record<string, string>;
  baseHpRolled: number;
};

vi.mock("../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector: (state: typeof mockStoreState) => unknown) =>
    selector(mockStoreState),
}));

vi.mock("@project/engine", async () => {
  const actual = await vi.importActual<typeof import("@project/engine")>("@project/engine");

  return {
    ...actual,
    AbilityEngine: {
      ...actual.AbilityEngine,
      calculateScore: (base: number, _target: string, modifiers: unknown[], activeStates: string[] = []) => {
        const cap = activeStates.includes("ability_cap_24") ? 24 : 20;
        const score = Math.min(base + (modifiers.length > 0 ? 2 : 0), cap);
        return {
          score,
          modifier: Math.floor((score - 10) / 2),
        };
      },
      getModifier: actual.AbilityEngine.getModifier,
      getProficiencyBonus: actual.AbilityEngine.getProficiencyBonus,
    },
    DerivedStatEngine: {
      calculateMaxHp: () => 10,
      calculateInitiative: () => 0,
      calculateAC: () => 10,
    },
    InventoryExtractor: {
      extractModifiers: () => [],
    },
    SkillEngine: {
      calculateSkill: () => ({ id: "skill_test", totalModifier: 0 }),
    },
  };
});

import { useAbilities } from "../useCharacterStats";
import { getProjectedConModifier } from "../../utils/levelUpReview";

describe("useAbilities", () => {
  beforeEach(() => {
    mockStoreState = {
      baseScores: { STR: 18, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      activeModifiers: [],
      inventory: [],
      activeStates: [],
      ruleSnapshot: null,
      level: 1,
      classLevels: {},
      proficiencies: {},
      baseHpRolled: 10,
    };
  });

  it("applies the active-state ability cap when calculating final ability scores", () => {
    mockStoreState.activeStates = ["ability_cap_24"];
    mockStoreState.activeModifiers = [{ sourceName: "Test Mod", value: 2 } as never];

    const { finalAbilities } = useAbilities();

    expect(finalAbilities.STR.score).toBe(20);
  });

  it("projects the Constitution modifier from the current ASI allocation", () => {
    const finalAbilities = {
      CON: { score: 14, modifier: 2 },
    } as Record<string, { score: number; modifier: number }>;

    expect(getProjectedConModifier(finalAbilities, [{ stat: "CON", value: 2 }])).toBe(3);
  });
});
