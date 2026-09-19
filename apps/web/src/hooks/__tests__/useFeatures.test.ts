import { beforeEach, describe, expect, it, vi } from "vitest";
import { packRuleSnapshot } from "../../store/__tests__/packFixture";

let mockStoreState: {
  resources: Array<{ id: string; current: number }>;
  level: number;
  classLevels: Record<string, number>;
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
});
