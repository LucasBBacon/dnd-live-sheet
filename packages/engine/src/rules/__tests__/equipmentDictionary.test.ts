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

  it("gives the longsword its two-handed damage die", () => {
    // combat.ts gates the versatile die on this field being present, so a
    // weapon flagged versatile without it silently deals its one-handed die
    const longsword = EQUIPMENT_DICTIONARY.item_weapon_longsword;

    expect(longsword?.weapon?.properties).toContain("versatile");
    expect(longsword?.weapon?.versatileDamageDice).toBe("1d10");
  });
});
