import { describe, expect, it } from "vitest";
import type { WeaponAttackContext } from "@project/shared";
import { WeaponSynthesizer } from "../weaponSynthesizer.js";
import type { WeaponView } from "../../rules/equipmentProjection.js";
import { corePackEquipment } from "./corePackFixture.js";

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
    const longbow: WeaponView = {
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

    const dagger: WeaponView = {
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
    const shortsword: WeaponView = {
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
  const longsword: WeaponView = {
    id: "item_weapon_longsword",
    name: "Longsword",
    category: "martial_melee",
    damageDice: "1d8",
    damageType: "slashing",
    properties: ["versatile"],
    versatileDamageDice: "1d10",
    range: 5,
  };

  const handaxe: WeaponView = {
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
    const longbow: WeaponView = {
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

describe("WeaponSynthesizer carries unenforced weapon rules to the player", () => {
  it("puts a weapon's specialNote on the action as tableNote", () => {
    const net: WeaponView = {
      id: "item_weapon_net",
      name: "Net",
      category: "martial_ranged",
      damageDice: "1d4",
      damageType: "bludgeoning",
      properties: ["special", "thrown"],
      range: 5,
      longRange: 15,
      specialNote: "Target is restrained (Large or smaller).",
    };

    const action = WeaponSynthesizer.generateWeaponAction(net, "DEX");
    if (action.effect.type !== "attack") {
      throw new Error("Expected an attack effect");
    }

    expect(action.tableNote).toBe("Target is restrained (Large or smaller).");
    expect(action.effect).not.toHaveProperty("specialNote");
  });

  it("omits tableNote entirely when the weapon has none", () => {
    const club: WeaponView = {
      id: "item_weapon_club",
      name: "Club",
      category: "simple_melee",
      damageDice: "1d4",
      damageType: "bludgeoning",
      properties: ["light"],
      range: 5,
    };

    const action = WeaponSynthesizer.generateWeaponAction(club, "STR");
    if (action.effect.type !== "attack") {
      throw new Error("Expected an attack effect");
    }

    expect("tableNote" in action).toBe(false);
    expect("specialNote" in action.effect).toBe(false);
  });

  it("puts the weapon's special rule on the action, not inside the effect", () => {
    const pack = corePackEquipment();
    const net = pack.weaponsById["item_weapon_net"];
    expect(net).toBeDefined();

    // generateWeaponAction returns ONE ActionGrant, not an array
    const action = WeaponSynthesizer.generateWeaponAction(net!, "DEX");

    expect(action.tableNote).toContain("restrained");
    expect(action.effect).not.toHaveProperty("specialNote");
  });
});

describe("WeaponSynthesizer handles weapons that deal no damage", () => {
  it("emits an empty damage pool for a weapon with no damage dice", () => {
    const net: WeaponView = {
      id: "item_weapon_net",
      name: "Net",
      category: "martial_ranged",
      properties: ["special", "thrown"],
      range: 5,
      longRange: 15,
      specialNote: "Target is restrained (Large or smaller).",
    };

    const action = WeaponSynthesizer.generateWeaponAction(net, "DEX");
    if (action.effect.type !== "attack") {
      throw new Error("Expected an attack effect");
    }

    // it still attacks - a net rolls to hit, it just deals nothing
    expect(action.effect.attackType).toBe("ranged_weapon");
    expect(action.effect.damage).toEqual([]);
  });

  it("emits one flat segment for a weapon that deals a fixed amount", () => {
    const blowgun: WeaponView = {
      id: "item_weapon_blowgun",
      name: "Blowgun",
      category: "simple_ranged",
      damageDice: "1",
      damageType: "piercing",
      properties: ["ammunition", "loading"],
      range: 25,
      longRange: 100,
    };

    const action = WeaponSynthesizer.generateWeaponAction(blowgun, "DEX");
    if (action.effect.type !== "attack") {
      throw new Error("Expected an attack effect");
    }

    expect(action.effect.damage).toHaveLength(1);
    expect(action.effect.damage[0]?.baseDice).toBe("1");
    expect(action.effect.damage[0]?.damageType).toBe("piercing");
  });
});
