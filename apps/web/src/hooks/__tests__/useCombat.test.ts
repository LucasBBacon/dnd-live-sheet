import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CharacterEngine,
  EffectManager,
  ResourceManager,
} from "@project/engine";
import type { FixedProficiencyGrant } from "@project/shared";
import { packRuleSnapshot } from "../../store/__tests__/packFixture";

const weaponGrant = (proficiencyId: string): FixedProficiencyGrant => ({
  category: "weapons",
  proficiencyId,
  level: "proficient",
  requiredStates: [],
});

let mockStoreState: {
  inventory: Array<{
    id: string;
    itemId: string;
    quantity: number;
    slot: string;
    isAttuned: boolean;
  }>;
  getProficiencyGrants: () => FixedProficiencyGrant[];
  traitGrants: Array<{
    id: string;
    traitId: string;
    source: string;
  }>;
  activeStates: string[];
  classLevels: Record<string, number>;
  ruleSnapshot: {
    equipmentById?: Record<string, unknown>;
  } | null;
  getActiveTraits: () => unknown[];
  subclassIds: Record<string, string | null>;
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
      getProficiencyGrants: () => [],
      traitGrants: [],
      activeStates: [],
      classLevels: {},
      // weapons resolve from the pack now; a null snapshot yields no attacks
      ruleSnapshot: packRuleSnapshot(),
      getActiveTraits: () => [],
      subclassIds: {},
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
    mockStoreState.getProficiencyGrants = () => [
      weaponGrant("category_weapon_martial"),
    ];

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
    mockStoreState.getProficiencyGrants = () => [
      weaponGrant("category_weapon_martial"),
    ];
    mockStoreState.traitGrants = [
      {
        id: "grant_savage_attacks",
        traitId: "savage_attacks",
        source: "test",
      },
    ];

    const { attacks } = useCombat();

    expect(attacks).toHaveLength(1);
    // 1d8 longsword, doubled to 2d8 by the crit, plus the one extra base die
    // Savage Attacks adds. It used to read 2d8 because the half-orc trait
    // dictionary was emptied by the race migration and the trait resolved to
    // nothing - the pack defines it, so it finally contributes.
    expect(attacks[0].criticalDamageExpression).toContain("3d8");
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
    mockStoreState.getProficiencyGrants = () => [
      weaponGrant("category_weapon_martial"),
    ];
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

  it("adds the proficiency bonus to a weapon a grant covers", () => {
    mockStoreState.inventory = [
      {
        id: "inv_axe",
        itemId: "item_weapon_greataxe",
        quantity: 1,
        slot: "main_hand",
        isAttuned: false,
      },
    ];
    mockStoreState.getProficiencyGrants = () => [
      weaponGrant("category_weapon_martial"),
    ];

    const { attacks } = useCombat();

    expect(attacks[0].isProficient).toBe(true);
    expect(attacks[0].breakdown.attack).toContain("Proficiency (+2)");
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
    mockStoreState.getProficiencyGrants = () => [
      weaponGrant("category_weapon_martial"),
    ];
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

describe("useCombat and dynamic weapon attacks", () => {
  const packTrait = (id: string) => {
    const trait = packRuleSnapshot().traitsById?.[id];
    if (!trait) throw new Error(`${id} missing from the shipped pack`);
    return trait;
  };

  const hold = (itemId: string) => {
    mockStoreState.inventory = [
      { id: "inv_1", itemId, quantity: 1, slot: "main_hand", isAttuned: false },
    ];
    mockStoreState.getProficiencyGrants = () => [
      weaponGrant("category_weapon_martial"),
    ];
  };

  beforeEach(() => {
    const traits = [
      packTrait("trait_berserker_frenzy"),
      packTrait("trait_berserker_retaliation"),
    ];
    mockStoreState.getActiveTraits = () => traits;
  });

  it("adds a Frenzied Strike card for a held greataxe while frenzied", () => {
    hold("item_weapon_greataxe");
    mockStoreState.activeStates = ["status_frenzied"];

    const card = useCombat().attacks.find(
      (attack) => attack.actionId === "action_frenzied_strike:main_hand",
    );

    expect(card).toMatchObject({
      name: "Frenzied Strike: Greataxe",
      activation: "bonus_action",
      slot: "main_hand",
    });
  });

  it("adds no Frenzied Strike card once the frenzy is over", () => {
    hold("item_weapon_greataxe");
    mockStoreState.activeStates = [];

    expect(
      useCombat().attacks.some((attack) =>
        String(attack.actionId).startsWith("action_frenzied_strike"),
      ),
    ).toBe(false);
  });

  it("adds no card of either kind for a bow", () => {
    hold("item_weapon_longbow");
    mockStoreState.activeStates = ["status_frenzied"];

    expect(
      useCombat().attacks.filter((attack) =>
        String(attack.actionId).includes(":"),
      ),
    ).toEqual([]);
  });

  it("offers Retaliation as a reaction with the weapon card's own numbers", () => {
    hold("item_weapon_greataxe");
    mockStoreState.activeStates = [];

    const { attacks } = useCombat();
    const own = attacks.find(
      (attack) => attack.actionId === "action_weapon_item_weapon_greataxe",
    );
    const retaliation = attacks.find(
      (attack) => attack.actionId === "action_retaliation:main_hand",
    );

    expect(retaliation).toMatchObject({
      name: "Retaliation: Greataxe",
      activation: "reaction",
      attackBonus: own.attackBonus,
      damageExpression: own.damageExpression,
    });
  });

  it("keys a card on the hand, so a row the server never saw still names the server's swing", () => {
    // equipping one axe from a stack mints this row id on the sheet alone;
    // the server still holds the weapon under the original row
    mockStoreState.inventory = [
      {
        id: "inv_3c9e2a70-split",
        itemId: "item_weapon_greataxe",
        quantity: 1,
        slot: "main_hand",
        isAttuned: false,
      },
    ];
    mockStoreState.getProficiencyGrants = () => [
      weaponGrant("category_weapon_martial"),
    ];
    mockStoreState.activeStates = ["status_raging", "status_frenzied"];

    const frenzied = new EffectManager();
    frenzied.addEffect({
      instanceId: "rage",
      sourceName: "Frenzied Rage",
      durationType: "manual",
      isSelfConcentration: false,
      modifiers: [],
      grantedStates: ["status_raging", "status_frenzied"],
    });
    const serverSwingIds = CharacterEngine.buildLiveSheet(
      {
        attributes: { str: 16, dex: 12, con: 14, int: 10, wis: 14, cha: 8 },
        race: { baseRaceId: "race_human", hasSubraces: false, subraceId: null },
        classes: [
          {
            classId: "class_barbarian",
            level: 3,
            subclassId: "subclass_barbarian_berserker",
            selections: {},
          },
        ],
        traitSelections: {},
        hp: { current: 30, temporary: 0, baseRolledHp: 12, hitDiceSpent: {} },
      },
      [
        {
          id: "row-original",
          itemId: "item_weapon_greataxe",
          quantity: 1,
          slot: "main_hand",
          isAttuned: false,
        },
      ],
      frenzied,
      new ResourceManager(),
      { snapshot: packRuleSnapshot() },
    )
      .actions.map((action) => action.id)
      .filter((id) => id.startsWith("action_frenzied_strike:"));

    const cardIds = useCombat()
      .attacks.map((attack) => String(attack.actionId))
      .filter((id) => id.startsWith("action_frenzied_strike:"));

    expect(cardIds).toEqual(["action_frenzied_strike:main_hand"]);
    expect(serverSwingIds).toEqual(cardIds);
  });

  it("makes an off-hand swing an ordinary attack, keeping the ability modifier", () => {
    mockStoreState.inventory = [
      {
        id: "inv_axe",
        itemId: "item_weapon_handaxe",
        quantity: 1,
        slot: "off_hand",
        isAttuned: false,
      },
    ];
    mockStoreState.getProficiencyGrants = () => [
      weaponGrant("category_weapon_simple"),
    ];
    mockStoreState.activeStates = ["status_frenzied"];

    const { attacks } = useCombat();
    const offHand = attacks.find(
      (attack) => attack.actionId === "action_weapon_item_weapon_handaxe_off_hand",
    );
    const frenziedStrike = attacks.find(
      (attack) => attack.actionId === "action_frenzied_strike:off_hand",
    );

    // the weapon card is two-weapon fighting: no STR in its damage
    expect(offHand).toMatchObject({
      damageBonus: 0,
      context: { attackUsage: "two_weapon_bonus" },
    });
    // Frenzied Strike is "a melee weapon attack": STR 16's +3 stays, and the
    // card carries no two-weapon usage for the widget's banner to key on
    expect(frenziedStrike).toMatchObject({
      name: "Frenzied Strike: Handaxe",
      activation: "bonus_action",
      slot: "off_hand",
      damageBonus: 3,
      context: { hand: "off_hand", attackUsage: "standard" },
    });
  });
});
