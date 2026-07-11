import { describe, expect, it } from "vitest";
import {
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

    expect(item?.name).toBe("Snapshot Shield");
    expect(item?.modifiers?.[0]?.value).toBe(3);
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

    expect(weapon?.name).toBe("Snapshot Longsword");
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
