import { describe, expect, it } from "vitest";
import type { InventoryInstance } from "@project/shared";
import {
  InventoryWeightCalculator,
  hundredthsToPounds,
  poundsToHundredths,
} from "../weight.js";

const row = (
  overrides: Partial<InventoryInstance> & Pick<InventoryInstance, "itemId">,
): InventoryInstance => ({
  id: `inv_${overrides.itemId}`,
  quantity: 1,
  slot: "backpack",
  isAttuned: false,
  ...overrides,
});

describe("pound and hundredth conversion", () => {
  it("round-trips a whole number of pounds", () => {
    expect(poundsToHundredths(65)).toBe(6500);
    expect(hundredthsToPounds(6500)).toBe(65);
  });

  it("rounds a fractional pound to the nearest hundredth", () => {
    expect(poundsToHundredths(0.05)).toBe(5);
  });
});

describe("InventoryWeightCalculator.totalHundredths", () => {
  it("weighs an empty pack as nothing", () => {
    expect(InventoryWeightCalculator.totalHundredths([])).toBe(0);
  });

  it("reads the authored weight of a single item", () => {
    // plate armour is 65 lb in EQUIPMENT_DICTIONARY
    expect(
      InventoryWeightCalculator.totalHundredths([row({ itemId: "item_armor_plate" })]),
    ).toBe(6500);
  });

  it("scales by the quantity in the stack", () => {
    expect(
      InventoryWeightCalculator.totalHundredths([
        row({ itemId: "item_armor_plate", quantity: 3 }),
      ]),
    ).toBe(19500);
  });

  it("counts worn items exactly like carried ones", () => {
    const worn = InventoryWeightCalculator.totalHundredths([
      row({ itemId: "item_armor_plate", slot: "body" }),
    ]);
    const carried = InventoryWeightCalculator.totalHundredths([
      row({ itemId: "item_armor_plate", slot: "backpack" }),
    ]);

    expect(worn).toBe(carried);
  });

  it("contributes nothing for an item with no rule behind it", () => {
    expect(
      InventoryWeightCalculator.totalHundredths([row({ itemId: "item_homebrew_gone" })]),
    ).toBe(0);
  });

  it("sums a mixed pack", () => {
    expect(
      InventoryWeightCalculator.totalHundredths([
        row({ itemId: "item_armor_plate" }), // 65
        row({ itemId: "item_weapon_dagger" }), // 1
        row({ itemId: "item_ammo_arrow", quantity: 20 }), // 0.05 x 20
      ]),
    ).toBe(6700);
  });
});

describe("InventoryWeightCalculator.totalPounds", () => {
  it("gives twenty arrows an exact pound rather than a float artefact", () => {
    const pounds = InventoryWeightCalculator.totalPounds([
      row({ itemId: "item_ammo_arrow", quantity: 20 }),
    ]);

    // the whole reason the sum happens in hundredths: 0.05 x 20 in floats is
    // 1.0000000000000002
    expect(pounds).toBe(1);
  });
});
