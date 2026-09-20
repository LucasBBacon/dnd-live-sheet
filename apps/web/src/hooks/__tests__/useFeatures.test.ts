import { beforeEach, describe, expect, it, vi } from "vitest";
import { packRuleSnapshot } from "../../store/__tests__/packFixture";

let mockStoreState: {
  resources: Array<{ id: string; current: number }>;
  level: number;
  classLevels: Record<string, number>;
  subclassIds: Record<string, string | null>;
  ruleSnapshot: unknown;
};

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    // evaluate the memo directly, as useCombat's test does
    useMemo: <T>(factory: () => T) => factory(),
  };
});

vi.mock("../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector: (state: typeof mockStoreState) => unknown) =>
    selector(mockStoreState),
}));

import { useFeatures } from "../useFeatures";

describe("useFeatures", () => {
  beforeEach(() => {
    mockStoreState = {
      resources: [],
      level: 11,
      classLevels: { class_barbarian: 11 },
      subclassIds: {},
      ruleSnapshot: packRuleSnapshot(),
    };
  });

  it("keeps a charges pool as it was", () => {
    mockStoreState.resources = [{ id: "resource_barbarian_rage", current: 2 }];

    expect(useFeatures()).toEqual([
      {
        kind: "charges",
        id: "resource_barbarian_rage",
        name: "Rage",
        current: 2,
        max: 4,
        resetCondition: "long_rest",
        isDepleted: false,
      },
    ]);
  });

  it("shows a uses pool, which has no maximum, as a count", () => {
    mockStoreState.resources = [{ id: "resource_relentless_rage", current: 2 }];

    expect(useFeatures()).toEqual([
      {
        kind: "uses",
        id: "resource_relentless_rage",
        name: "Relentless Rage Uses",
        used: 2,
        resetCondition: "short_rest",
      },
    ]);
  });

  it("still hides a charges pool the character has no uses of", () => {
    mockStoreState.level = 0;
    mockStoreState.classLevels = {};
    mockStoreState.resources = [{ id: "resource_barbarian_rage", current: 0 }];

    expect(useFeatures()).toEqual([]);
  });

  it("shows a level 5 wizard only the slot pools they can fill", () => {
    mockStoreState.level = 5;
    mockStoreState.classLevels = { class_wizard: 5 };
    mockStoreState.subclassIds = {};
    mockStoreState.resources = [
      { id: "spell_slots_1", current: 4 },
      { id: "spell_slots_2", current: 3 },
      { id: "spell_slots_3", current: 2 },
      { id: "spell_slots_4", current: 0 },
    ];

    const pools = useFeatures();

    // the fourth-level pool has a maximum of zero at caster level 5 and the
    // hook's own guard drops it
    expect(pools.map((pool) => pool.id)).toEqual([
      "spell_slots_1",
      "spell_slots_2",
      "spell_slots_3",
    ]);
    expect(pools[0]).toMatchObject({ kind: "charges", max: 4 });
    expect(pools[2]).toMatchObject({ kind: "charges", max: 2 });
  });

  it("does not render pact_slot_level as a spendable pool", () => {
    mockStoreState.level = 9;
    mockStoreState.classLevels = { class_warlock: 9 };
    mockStoreState.subclassIds = {};
    mockStoreState.resources = [
      { id: "pact_slots", current: 2 },
      { id: "pact_slot_level", current: 5 },
    ];

    const pools = useFeatures();

    expect(pools.map((pool) => pool.id)).toContain("pact_slots");
    expect(pools.map((pool) => pool.id)).not.toContain("pact_slot_level");
  });
});
