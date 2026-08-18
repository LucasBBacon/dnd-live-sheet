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
  traitGrants: Array<{
    id: string;
    traitId: string;
    source: string;
  }>;
  activeStates: string[];
  classLevels: Record<string, number>;
  ruleSnapshot: {
    equipmentById?: Record<string, unknown>;
    weaponsById: Record<string, unknown>;
  } | null;
};

let mockTotalMods: unknown[] = [];

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    // Keep the hook test lightweight by evaluating memoized values directly.
    useMemo: <T>(factory: () => T) => factory(),
  };
});

vi.mock("../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (
    selector: (state: typeof mockStoreState) => unknown,
  ) => selector(mockStoreState),
}));

vi.mock("../useCharacterStats", () => ({
  useAbilities: () => ({
    finalAbilities: {
      STR: { score: 16, modifier: 3 },
      DEX: { score: 12, modifier: 1 },
      WIS: { score: 14, modifier: 2 },
    },
    totalMods: mockTotalMods,
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
      traitGrants: [],
      activeStates: [],
      classLevels: {},
      ruleSnapshot: null,
    };
    mockTotalMods = [];
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

  it("surfaces critical damage expressions granted by active traits", () => {
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
    mockStoreState.traitGrants = [
      {
        id: "grant_savage_attacks",
        traitId: "savage_attacks",
        source: "test",
      },
    ];

    const { attacks } = useCombat();

    expect(attacks).toHaveLength(1);
    expect(attacks[0].criticalDamageExpression).toContain("2d8");
    expect(attacks[0].criticalDamageExpression).toContain("slashing");
  });

  it("uses active states when resolving the governing stat for an attack", () => {
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
    mockStoreState.activeStates = ["shillelagh"];

    const { attacks } = useCombat();

    expect(attacks).toHaveLength(1);
    expect(attacks[0].breakdown.governingStat).toBe("WIS");
    expect(attacks[0].attackBonus).toBe(4);
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

describe("useCombat class-level scaling", () => {
  const ragingBarbarian = () => {
    mockStoreState.inventory = [
      {
        id: "inv_2",
        itemId: "item_weapon_longsword",
        quantity: 1,
        slot: "main_hand",
        isAttuned: false,
      },
    ];
    mockStoreState.proficiencies = { martial_melee: "proficient" };
    mockStoreState.activeStates = ["status_raging"];
    mockTotalMods = [
      {
        id: "mod_rage",
        target: "DAMAGE_BONUS",
        type: "add",
        value: 2,
        scalingFactor: "class_level_thresholds",
        scalingClassId: "class_barbarian",
        scalingThresholds: [
          { minimumLevel: 1, value: 2 },
          { minimumLevel: 9, value: 3 },
          { minimumLevel: 16, value: 4 },
        ],
        requiredStates: [
          "status_raging",
          "action_melee_attack",
          "action_using_str",
        ],
        forbiddenStates: [],
        sourceName: "Rage",
        sourceOrigin: "trait:trait_rage",
        isActive: true,
      },
    ];
  };

  it("resolves a class-level threshold damage bonus at the character's actual level", () => {
    ragingBarbarian();
    mockStoreState.classLevels = { class_barbarian: 9 };

    const { attacks } = useCombat();

    expect(attacks[0].damageBonus).toBe(6);
    expect(attacks[0].breakdown.damage).toContain("Rage (+3)");
  });

  it("scales the same bonus down at a lower barbarian level", () => {
    ragingBarbarian();
    mockStoreState.classLevels = { class_barbarian: 5 };

    const { attacks } = useCombat();

    expect(attacks[0].damageBonus).toBe(5);
    expect(attacks[0].breakdown.damage).toContain("Rage (+2)");
  });
});
