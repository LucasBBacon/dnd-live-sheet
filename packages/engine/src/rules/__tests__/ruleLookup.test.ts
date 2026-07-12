import { describe, expect, it } from "vitest";
import {
  resolveEquipmentDefinition,
  resolveItemDefinition,
  resolveResourceRule,
  resolveResourceRules,
  resolveWeaponDefinition,
} from "../ruleLookup.js";

describe("ruleLookup", () => {
  it("resolves canonical item ids via static dictionary", () => {
    const shield = resolveItemDefinition("item_armor_shield");
    expect(shield?.name).toBe("Shield");
  });

  it("prefers snapshot item definitions over static dictionary entries", () => {
    const item = resolveItemDefinition("item_armor_shield", {
      itemsById: {
        item_armor_shield: {
          id: "item_armor_shield",
          name: "Snapshot Shield",
          type: "armor",
          modifiers: [
            {
              target: "ARMOR_CLASS",
              type: "add",
              value: 3,
              scalingFactor: "none",
            },
          ],
        },
      },
    });

    expect(item?.name).toBe("Shield");
    expect(item?.modifiers?.[0]?.value).toBe(2);
  });

  it("resolves item definition from equipmentById snapshot", () => {
    const item = resolveItemDefinition("item_armor_shield", {
      equipmentById: {
        item_armor_shield: {
          id: "item_armor_shield",
          name: "Canonical Shield",
          type: "armor",
          modifiers: [
            {
              target: "ARMOR_CLASS",
              type: "add",
              value: 3,
              scalingFactor: "none",
            },
          ],
        },
      },
    });

    expect(item?.name).toBe("Shield");
    expect(item?.modifiers?.[0]?.value).toBe(2);
  });

  it("itemsById snapshot takes priority over equipmentById snapshot", () => {
    const item = resolveItemDefinition("item_armor_shield", {
      itemsById: {
        item_armor_shield: {
          id: "item_armor_shield",
          name: "Compat Shield",
          type: "armor",
        },
      },
      equipmentById: {
        item_armor_shield: {
          id: "item_armor_shield",
          name: "Canonical Shield",
          type: "armor",
        },
      },
    });

    expect(item?.name).toBe("Shield");
  });

  it("resolves canonical weapon ids via static dictionary", () => {
    const weapon = resolveWeaponDefinition("item_weapon_longsword");
    expect(weapon?.name).toBe("Longsword");
    expect(weapon?.category).toBe("martial_melee");
  });

  it("resolves canonical weapon ids via snapshot", () => {
    const weapon = resolveWeaponDefinition("item_weapon_longsword", {
      weaponsById: {
        item_weapon_longsword: {
          id: "item_weapon_longsword",
          name: "Snapshot Longsword",
          category: "martial_melee",
          damageDice: "1d8",
          damageType: "slashing",
          properties: ["versatile"],
        },
      },
    });

    expect(weapon?.name).toBe("Longsword");
    expect(weapon?.damageDice).toBe("1d8");
  });

  it("resolves weapon definition from equipmentById snapshot", () => {
    const weapon = resolveWeaponDefinition("item_weapon_longsword", {
      equipmentById: {
        item_weapon_longsword: {
          id: "item_weapon_longsword",
          name: "Canonical Longsword",
          type: "weapon",
          weapon: {
            category: "martial_melee",
            damageDice: "1d10",
            damageType: "slashing",
            properties: ["versatile"],
          },
        },
      },
    });

    expect(weapon?.name).toBe("Longsword");
    expect(weapon?.damageDice).toBe("1d8");
  });

  it("returns undefined for equipment without weapon capability when resolving weapon", () => {
    const weapon = resolveWeaponDefinition("item_armor_shield", {
      equipmentById: {
        item_armor_shield: {
          id: "item_armor_shield",
          name: "Shield",
          type: "armor",
          modifiers: [
            { target: "ARMOR_CLASS", type: "add", value: 2, scalingFactor: "none" },
          ],
        },
      },
    });

    expect(weapon).toBeUndefined();
  });

  it("resolves equipment definition via static dictionary", () => {
    const equipment = resolveEquipmentDefinition("item_weapon_longsword");
    expect(equipment?.name).toBe("Longsword");
    expect(equipment?.weapon?.category).toBe("martial_melee");
  });

  it("resolves equipment definition via snapshot", () => {
    const equipment = resolveEquipmentDefinition("item_weapon_longsword", {
      equipmentById: {
        item_weapon_longsword: {
          id: "item_weapon_longsword",
          name: "Snapshot Longsword",
          type: "weapon",
          weapon: {
            category: "martial_melee",
            damageDice: "1d12",
            damageType: "slashing",
            properties: ["versatile"],
          },
        },
      },
    });

    expect(equipment?.name).toBe("Longsword");
    expect(equipment?.weapon?.damageDice).toBe("1d8");
  });

  it("prefers snapshot resource rules over static dictionary entries", () => {
    const resource = resolveResourceRule("trait_action_surge", {
      resourcesById: {
        trait_action_surge: {
          id: "trait_action_surge",
          name: "Snapshot Action Surge",
          resetCondition: "short_rest",
          maxRule: {
            kind: "fixed",
            value: 3,
          },
        },
      },
    });

    expect(resource?.name).toBe("Snapshot Action Surge");
  });

  it("returns snapshot resource map when present", () => {
    const rules = resolveResourceRules({
      resourcesById: {
        trait_custom_rule: {
          id: "trait_custom_rule",
          name: "Custom Rule",
          resetCondition: "long_rest",
          maxRule: {
            kind: "fixed",
            value: 1,
          },
        },
      },
    });

    expect(rules.trait_custom_rule?.name).toBe("Custom Rule");
  });
});
