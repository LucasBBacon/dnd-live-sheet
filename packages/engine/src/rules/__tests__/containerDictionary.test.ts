import { describe, expect, it } from "vitest";
import { EQUIPMENT_DICTIONARY } from "../equipmentDictionary.js";
import { resolveItemDefinition } from "../ruleLookup.js";

/**
 * The PHB states a pounds-of-gear capacity for exactly these five. Barrels and
 * buckets are measured in gallons and quivers in arrows, which are different
 * axes, not weight limits - they are deliberately absent.
 */
const PHB_CONTAINERS: Array<{
  id: string;
  name: string;
  weight: number;
  capacityPounds: number;
}> = [
  { id: "item_backpack", name: "Backpack", weight: 5, capacityPounds: 30 },
  { id: "item_sack", name: "Sack", weight: 0.5, capacityPounds: 30 },
  { id: "item_pouch", name: "Pouch", weight: 1, capacityPounds: 6 },
  { id: "item_basket", name: "Basket", weight: 2, capacityPounds: 40 },
  { id: "item_chest", name: "Chest", weight: 25, capacityPounds: 300 },
];

describe("the authored PHB containers", () => {
  for (const { id, name, weight, capacityPounds } of PHB_CONTAINERS) {
    it(`authors ${name} at its printed weight and capacity`, () => {
      const equipment = EQUIPMENT_DICTIONARY[id];

      expect(equipment).toBeDefined();
      expect(equipment!.name).toBe(name);
      expect(equipment!.weight).toBe(weight);
      expect(equipment!.container).toEqual({ capacityPounds });
    });

    it(`resolves ${name}'s capacity through the lookup the engine uses`, () => {
      // EQUIPMENT_RESOLUTION_MODE is "static-only", so this is the only path
      // ContainerEngine has to a capacity. asserting the dictionary alone
      // would not prove the projection carries it
      expect(resolveItemDefinition(id)?.container).toEqual({ capacityPounds });
    });
  }

  it("gives a non-container no capacity at all", () => {
    expect(resolveItemDefinition("item_weapon_dagger")?.container).toBeUndefined();
  });
});
