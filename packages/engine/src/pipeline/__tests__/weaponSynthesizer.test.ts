import { describe, expect, it } from "vitest";
import type { WeaponDefinition } from "@project/shared";
import { WeaponSynthesizer } from "../weaponSynthesizer.js";

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
});
