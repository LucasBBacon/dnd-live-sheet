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
      // deliberately the real implementation: the attack count is the thing
      // under test, and a stub would only prove the stub works
      calculateAttacksPerAction:
        actual.DerivedStatEngine.calculateAttacksPerAction.bind(
          actual.DerivedStatEngine,
        ),
    },
    InventoryExtractor: {
      extractModifiers: () => [],
    },
    SkillEngine: {
      calculateSkill: () => ({ id: "skill_test", totalModifier: 0 }),
    },
  };
});

import { useAbilities, useDerivedStats } from "../useCharacterStats";
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

describe("useDerivedStats saving throws", () => {
  beforeEach(() => {
    mockStoreState = {
      baseScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      activeModifiers: [],
      inventory: [],
      activeStates: [],
      ruleSnapshot: null,
      level: 2,
      classLevels: { class_barbarian: 2 },
      proficiencies: {},
      baseHpRolled: 1,
    };
  });

  it("derives a saving throw for every ability", () => {
    const { saves } = useDerivedStats();

    expect(Object.keys(saves).sort()).toEqual([
      "CHA",
      "CON",
      "DEX",
      "INT",
      "STR",
      "WIS",
    ]);
  });

  it("uses the ability modifier when the save is not proficient", () => {
    const { saves } = useDerivedStats();

    expect(saves.DEX.totalModifier).toBe(2);
    expect(saves.DEX.isProficient).toBe(false);
  });

  it("adds the proficiency bonus for a save the character is proficient in", () => {
    mockStoreState.proficiencies = { STR: "proficient", CON: "proficient" };

    const { saves } = useDerivedStats();

    expect(saves.STR.isProficient).toBe(true);
    expect(saves.STR.totalModifier).toBe(5);
    expect(saves.DEX.isProficient).toBe(false);
  });

  it("does not mistake a skill proficiency for a saving throw proficiency", () => {
    mockStoreState.proficiencies = { athletics: "proficient" };

    const { saves } = useDerivedStats();

    expect(saves.STR.isProficient).toBe(false);
  });

  it("reports advantage granted by an unconditional modifier", () => {
    mockStoreState.activeModifiers = [
      {
        id: "mod_fey",
        target: "DEX_SAVE",
        type: "advantage",
        value: 0,
        scalingFactor: "none",
        requiredStates: [],
        forbiddenStates: [],
        sourceName: "Fey Ancestry",
        sourceOrigin: "trait:trait_fey_ancestry",
        isActive: true,
      },
    ];

    const { saves } = useDerivedStats();

    expect(saves.DEX.rollState).toBe("advantage");
  });

  it("reports a Danger Sense rider as a note rather than as advantage", () => {
    mockStoreState.activeModifiers = [
      {
        id: "mod_danger_sense",
        target: "DEX_SAVE",
        type: "advantage",
        value: 0,
        scalingFactor: "none",
        appliesWhen: "against effects that you can see",
        requiredStates: [],
        forbiddenStates: ["blinded", "deafened", "incapacitated"],
        sourceName: "Danger Sense",
        sourceOrigin: "trait:trait_danger_sense",
        isActive: true,
      },
    ];

    const { saves } = useDerivedStats();

    expect(saves.DEX.rollState).toBe("normal");
    expect(saves.DEX.conditionalNotes).toEqual([
      {
        source: "Danger Sense",
        appliesWhen: "against effects that you can see",
        type: "advantage",
      },
    ]);
  });

  it("drops the Danger Sense note while the character is blinded", () => {
    mockStoreState.activeModifiers = [
      {
        id: "mod_danger_sense",
        target: "DEX_SAVE",
        type: "advantage",
        value: 0,
        scalingFactor: "none",
        appliesWhen: "against effects that you can see",
        requiredStates: [],
        forbiddenStates: ["blinded", "deafened", "incapacitated"],
        sourceName: "Danger Sense",
        sourceOrigin: "trait:trait_danger_sense",
        isActive: true,
      },
    ];
    mockStoreState.activeStates = ["blinded"];

    const { saves } = useDerivedStats();

    expect(saves.DEX.conditionalNotes).toEqual([]);
  });
});

describe("useDerivedStats attacks per action", () => {
  const extraAttackModifier = {
    id: "mod_extra_attack",
    target: "ATTACKS_PER_ACTION",
    type: "set_base",
    value: 2,
    scalingFactor: "class_level_thresholds",
    scalingClassId: "class_barbarian",
    scalingThresholds: [{ minimumLevel: 5, value: 2 }],
    requiredStates: [],
    forbiddenStates: [],
    sourceName: "Extra Attack",
    sourceOrigin: "trait:trait_extra_attack",
    isActive: true,
  };

  beforeEach(() => {
    mockStoreState = {
      baseScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      activeModifiers: [],
      inventory: [],
      activeStates: [],
      ruleSnapshot: null,
      level: 5,
      classLevels: { class_barbarian: 5 },
      proficiencies: {},
      baseHpRolled: 1,
    };
  });

  it("reports a single attack for a character without Extra Attack", () => {
    const { attacksPerAction } = useDerivedStats();

    expect(attacksPerAction.total).toBe(1);
  });

  it("reports two attacks for a fifth-level barbarian who has it", () => {
    mockStoreState.activeModifiers = [extraAttackModifier];

    const { attacksPerAction } = useDerivedStats();

    expect(attacksPerAction.total).toBe(2);
  });

  it("still reports one attack at fourth level", () => {
    mockStoreState.activeModifiers = [extraAttackModifier];
    mockStoreState.level = 4;
    mockStoreState.classLevels = { class_barbarian: 4 };

    const { attacksPerAction } = useDerivedStats();

    expect(attacksPerAction.total).toBe(1);
  });

  it("names the source so the panel can explain where the attack came from", () => {
    mockStoreState.activeModifiers = [extraAttackModifier];

    const { attacksPerAction } = useDerivedStats();

    expect(attacksPerAction.breakdown).toEqual([
      { name: "Extra Attack", value: 2 },
    ]);
  });
});
