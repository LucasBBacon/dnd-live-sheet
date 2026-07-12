import { describe, expect, it } from "vitest";
import {
  EQUIPMENT_DICTIONARY,
  ITEM_DICTIONARY,
  WEAPON_DICTIONARY,
} from "../equipmentDictionary.js";

describe("equipmentDictionary projections", () => {
  it("keeps item projections aligned with canonical equipment entries", () => {
    for (const [id, equipment] of Object.entries(EQUIPMENT_DICTIONARY)) {
      const item = ITEM_DICTIONARY[id];
      expect(item).toBeDefined();
      expect(item.id).toBe(equipment.id);
      expect(item.name).toBe(equipment.name);
      expect(item.type).toBe(equipment.type);
    }
  });

  it("includes only weapon-capable entries in weapon projection", () => {
    for (const [id, equipment] of Object.entries(EQUIPMENT_DICTIONARY)) {
      const weapon = WEAPON_DICTIONARY[id];

      if (!equipment.weapon) {
        expect(weapon).toBeUndefined();
        continue;
      }

      expect(weapon).toBeDefined();
      expect(weapon.id).toBe(equipment.id);
      expect(weapon.name).toBe(equipment.name);
      expect(weapon.category).toBe(equipment.weapon.category);
      expect(weapon.damageDice).toBe(equipment.weapon.damageDice);
      expect(weapon.damageType).toBe(equipment.weapon.damageType);
      expect(weapon.properties).toEqual(equipment.weapon.properties);
      expect(weapon.ammoItemId).toBe(equipment.weapon.ammoItemId);
    }
  });
});
