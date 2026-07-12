import { beforeEach, describe, expect, it, vi } from "vitest";

let mockStoreState: {
  inventory: Array<{
    id: string;
    itemId: string;
    quantity: number;
    slot: string;
    isAttuned: boolean;
  }>;
  proficiencies: Record<string, string>;
  ruleSnapshot: {
    equipmentById?: Record<string, unknown>;
    weaponsById: Record<string, unknown>;
  } | null;
};

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    // Keep the hook test lightweight by evaluating memoized values directly.
    useMemo: <T>(factory: () => T) => factory(),
  };
});

vi.mock("../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector: (state: typeof mockStoreState) => unknown) =>
    selector(mockStoreState),
}));

vi.mock("../useCharacterStats", () => ({
  useAbilities: () => ({
    finalAbilities: {
      str: { score: 16, modifier: 3 },
      dex: { score: 12, modifier: 1 },
    },
    totalMods: [],
  }),
  useDerivedStats: () => ({
    profBonus: 2,
  }),
}));

import { useCombat } from "../useCombat";

describe("useCombat", () => {
  beforeEach(() => {
    mockStoreState = {
      inventory: [],
      proficiencies: {},
      ruleSnapshot: null,
    };
  });

  it("derives an attack for an equipped main-hand longsword", () => {
    mockStoreState.inventory = [
      {
        id: "inv_2",
        itemId: "item_weapon_longsword",
        quantity: 1,
        slot: "main_hand",
        isAttuned: false,
      },
    ];
    mockStoreState.proficiencies = {
      martial_melee: "proficient",
    };

    const { attacks } = useCombat();

    expect(attacks).toHaveLength(1);
    expect(attacks[0]).toMatchObject({
      weaponId: "item_weapon_longsword",
      name: "Longsword",
      slot: "main_hand",
      requiresAmmo: false,
      currentAmmo: 0,
      ammoInventoryId: null,
    });
    expect(attacks[0].attackBonus).toBe(5);
  });

  it("does not derive attacks for non-weapon equipped items", () => {
    mockStoreState.inventory = [
      {
        id: "inv_1",
        itemId: "item_armor_chain_mail",
        quantity: 1,
        slot: "main_hand",
        isAttuned: false,
      },
    ];

    const { attacks } = useCombat();

    expect(attacks).toEqual([]);
  });
});
