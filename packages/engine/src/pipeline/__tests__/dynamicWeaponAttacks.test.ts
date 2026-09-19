import { describe, expect, it } from "vitest";
import type { DynamicWeaponAttack } from "@project/shared";
import { resolveWeaponDefinition } from "../../rules/ruleLookup.js";
import { corePackLookup } from "./corePackFixture.js";
import {
  dynamicAttackApplies,
  dynamicAttackId,
} from "../dynamicWeaponAttacks.js";

const weapon = (itemId: string) => {
  const view = resolveWeaponDefinition(itemId, corePackLookup());
  if (!view) throw new Error(`${itemId} missing from the shipped pack`);
  return view;
};

/** Frenzied Strike's shape: melee weapons only, gated on the frenzy. */
const template = (
  overrides: Partial<DynamicWeaponAttack> = {},
): DynamicWeaponAttack => ({
  type: "dynamic_weapon_attack",
  requiredStates: [],
  forbiddenStates: [],
  requiredWeaponProperties: [],
  requiredWeaponCategory: ["simple_melee", "martial_melee"],
  ...overrides,
});

describe("dynamicAttackApplies", () => {
  it("offers a swing with a melee weapon while the predicate holds", () => {
    expect(
      dynamicAttackApplies(
        template({ requiredStates: ["status_frenzied"] }),
        weapon("item_weapon_greataxe"),
        ["status_frenzied"],
      ),
    ).toBe(true);
  });

  it("refuses while a required state is absent", () => {
    expect(
      dynamicAttackApplies(
        template({ requiredStates: ["status_frenzied"] }),
        weapon("item_weapon_greataxe"),
        [],
      ),
    ).toBe(false);
  });

  it("refuses while a forbidden state is present", () => {
    expect(
      dynamicAttackApplies(
        template({ forbiddenStates: ["status_wearing_heavy_armor"] }),
        weapon("item_weapon_greataxe"),
        ["status_wearing_heavy_armor"],
      ),
    ).toBe(false);
  });

  it("never offers a ranged weapon, whatever the category filter says", () => {
    expect(
      dynamicAttackApplies(
        template({ requiredWeaponCategory: [] }),
        weapon("item_weapon_longbow"),
        [],
      ),
    ).toBe(false);
  });

  it("requires every listed weapon property", () => {
    // the greataxe is heavy and two-handed, and not light
    expect(
      dynamicAttackApplies(
        template({ requiredWeaponProperties: ["light"] }),
        weapon("item_weapon_greataxe"),
        [],
      ),
    ).toBe(false);
    expect(
      dynamicAttackApplies(
        template({ requiredWeaponProperties: ["heavy"] }),
        weapon("item_weapon_greataxe"),
        [],
      ),
    ).toBe(true);
  });

  it("refuses a melee weapon outside the listed categories", () => {
    expect(
      dynamicAttackApplies(
        template({ requiredWeaponCategory: ["simple_melee"] }),
        weapon("item_weapon_greataxe"),
        [],
      ),
    ).toBe(false);
  });

  it("accepts any melee weapon when the category list is empty", () => {
    expect(
      dynamicAttackApplies(
        template({ requiredWeaponCategory: [] }),
        weapon("item_weapon_greataxe"),
        [],
      ),
    ).toBe(true);
  });
});

describe("dynamicAttackId", () => {
  it("joins the template and the hand, as the server resolves it", () => {
    expect(dynamicAttackId("action_frenzied_strike", "main_hand")).toBe(
      "action_frenzied_strike:main_hand",
    );
    expect(dynamicAttackId("action_retaliation", "off_hand")).toBe(
      "action_retaliation:off_hand",
    );
  });
});
