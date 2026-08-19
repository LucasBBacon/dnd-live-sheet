import { describe, expect, it } from "vitest";
import type { WeaponAttackContext, WeaponDefinition } from "@project/shared";
import { WeaponSynthesizer } from "../weaponSynthesizer.js";

const makeAttackContext = (
  overrides: Partial<WeaponAttackContext> = {},
): WeaponAttackContext => ({
  hand: "main_hand",
  attackUsage: "standard",
  isTwoHandedGrip: false,
  ...overrides,
});

describe("WeaponSynthesizer", () => {
  it("uses authored weapon ranges for ranged and thrown attacks", () => {
    const longbow: WeaponDefinition = {
      id: "item_weapon_longbow",
      name: "Longbow",
      category: "martial_ranged",
      damageDice: "1d8",
      damageType: "piercing",
      properties: ["ammunition", "heavy", "two_handed"],
      ammoItemId: "item_ammo_arrow",
      ammoTag: "arrow",
      range: 150,
      longRange: 600,
    };

    const rangedAction = WeaponSynthesizer.generateWeaponAction(longbow, "DEX");
    expect(rangedAction.effect.type).toBe("attack");
    if (rangedAction.effect.type !== "attack") {
      throw new Error("Expected ranged action to be an attack effect");
    }
    expect(rangedAction.effect.range).toBe(150);
    expect(rangedAction.effect.longRange).toBe(600);

    const dagger: WeaponDefinition = {
      id: "item_weapon_dagger",
      name: "Dagger",
      category: "simple_melee",
      damageDice: "1d4",
      damageType: "piercing",
      properties: ["finesse", "light", "thrown"],
      range: 20,
      longRange: 60,
    };

    const thrownActions = WeaponSynthesizer.generateThrownWeaponActions(
      dagger,
      "DEX",
    );
    const thrownAction = thrownActions[1];
    expect(thrownAction).toBeDefined();
    if (!thrownAction) {
      throw new Error("Expected thrown action to be present");
    }
    expect(thrownAction.effect.type).toBe("attack");
    if (thrownAction.effect.type !== "attack") {
      throw new Error("Expected thrown action to be an attack effect");
    }
    expect(thrownAction.effect.range).toBe(20);
    expect(thrownAction.effect.longRange).toBe(60);
  });

  it("marks an off-hand two-weapon attack as a bonus action and carries its context", () => {
    const shortsword: WeaponDefinition = {
      id: "item_weapon_shortsword",
      name: "Shortsword",
      category: "martial_melee",
      damageDice: "1d6",
      damageType: "piercing",
      properties: ["light", "finesse"],
      range: 5,
    };

    const action = WeaponSynthesizer.generateWeaponAction(
      shortsword,
      "DEX",
      makeAttackContext({
        hand: "off_hand",
        attackUsage: "two_weapon_bonus",
      }),
    );

    expect(action.id).toBe("action_weapon_item_weapon_shortsword_off_hand");
    expect(action.name).toBe("Shortsword (Off-Hand)");
    expect(action.activation).toBe("bonus_action");
    expect(action.effect.type).toBe("attack");
    if (action.effect.type !== "attack") {
      throw new Error("Expected off-hand action to be an attack effect");
    }
    expect(action.effect.weaponContext).toEqual({
      hand: "off_hand",
      attackUsage: "two_weapon_bonus",
      isTwoHandedGrip: false,
    });
  });
});

describe("WeaponSynthesizer activation", () => {
  const longsword: WeaponDefinition = {
    id: "item_weapon_longsword",
    name: "Longsword",
    category: "martial_melee",
    damageDice: "1d8",
    damageType: "slashing",
    properties: ["versatile"],
    versatileDamageDice: "1d10",
    range: 5,
  };

  const handaxe: WeaponDefinition = {
    id: "item_weapon_handaxe",
    name: "Handaxe",
    category: "simple_melee",
    damageDice: "1d6",
    damageType: "slashing",
    properties: ["light", "thrown"],
    range: 20,
    longRange: 60,
  };

  it("costs an attack rather than the whole action", () => {
    // one Attack action grants several swings, so a swing cannot cost an action
    const action = WeaponSynthesizer.generateWeaponAction(longsword, "STR");

    expect(action.activation).toBe("attack");
  });

  it("costs an attack for a ranged weapon too", () => {
    const longbow: WeaponDefinition = {
      id: "item_weapon_longbow",
      name: "Longbow",
      category: "martial_ranged",
      damageDice: "1d8",
      damageType: "piercing",
      properties: ["ammunition"],
      range: 150,
      longRange: 600,
    };

    expect(
      WeaponSynthesizer.generateWeaponAction(longbow, "DEX").activation,
    ).toBe("attack");
  });

  it("costs an attack for every variant of a thrown weapon", () => {
    const actions = WeaponSynthesizer.generateThrownWeaponActions(
      handaxe,
      "STR",
    );

    expect(actions).toHaveLength(2);
    for (const action of actions) {
      expect(action.activation, action.id).toBe("attack");
    }
  });

  it("still costs a bonus action for a two-weapon off-hand swing", () => {
    // two-weapon fighting is its own bonus action, not one of the Attack
    // action's swings
    const action = WeaponSynthesizer.generateWeaponAction(
      handaxe,
      "STR",
      makeAttackContext({ hand: "off_hand", attackUsage: "two_weapon_bonus" }),
    );

    expect(action.activation).toBe("bonus_action");
  });
});
