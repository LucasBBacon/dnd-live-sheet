import { describe, expect, it } from "vitest";
import {
  resolveEquipmentDefinition,
  resolveItemDefinition,
  resolveResourceRule,
  resolveResourceRules,
  resolveWeaponDefinition,
  resolveRaceDefinition,
  resolveTraitDefinition,
  resolveClassDefinition,
} from "../ruleLookup.js";

const acBonusModifier = {
  target: "ARMOR_CLASS" as const,
  type: "add" as const,
  value: 3,
  scalingFactor: "none" as const,
  requiredStates: [],
  forbiddenStates: [],
};

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
          weight: 6,
          requiresAttunement: false,
          categoryTags: ["category_armor_shield"],
          modifiers: [acBonusModifier],
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
          weight: 6,
          requiresAttunement: false,
          categoryTags: ["category_armor_shield"],
          modifiers: [acBonusModifier],
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
          weight: 6,
          requiresAttunement: false,
          categoryTags: ["category_armor_shield"],
        },
      },
      equipmentById: {
        item_armor_shield: {
          id: "item_armor_shield",
          name: "Canonical Shield",
          type: "armor",
          weight: 6,
          requiresAttunement: false,
          categoryTags: ["category_armor_shield"],
          modifiers: [acBonusModifier],
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
          range: 5,
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
          weight: 3,
          requiresAttunement: false,
          categoryTags: [
            "category_weapon_martial",
            "category_weapon_martial_melee",
          ],
          weapon: {
            category: "martial_melee",
            damageDice: "1d10",
            damageType: "slashing",
            properties: ["versatile"],
            range: 5,
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
          weight: 6,
          requiresAttunement: false,
          categoryTags: ["category_armor_shield"],
          modifiers: [{ ...acBonusModifier, value: 2 }],
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
          weight: 3,
          requiresAttunement: false,
          categoryTags: [
            "category_weapon_martial",
            "category_weapon_martial_melee",
          ],
          weapon: {
            category: "martial_melee",
            damageDice: "1d12",
            damageType: "slashing",
            properties: ["versatile"],
            range: 5,
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

describe("ruleLookup pack resolution", () => {
  const packRace = {
    id: "race_dwarf",
    name: "Dwarf",
    size: "medium" as const,
    speed: 25,
    grantedTraitIds: ["trait_darkvision"],
    hasSubraces: true,
    subraces: {},
  };

  const packTrait = {
    id: "trait_rage",
    name: "Rage",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  };

  const packClass = {
    id: "class_barbarian",
    name: "Barbarian",
    hitDie: 12,
    subclassUnlockLevel: 3,
    startingEquipment: { given: [], choices: [] },
    startingProficiencyTraitIds: [],
    multiclassTraitIds: [],
    progression: [{ level: 1, grants: ["trait_rage"], grantsASI: false }],
  };

  describe("races", () => {
    it("finds a race the pack defines but the dictionary does not", () => {
      expect(
        resolveRaceDefinition("race_dwarf", {
          racesById: { race_dwarf: packRace },
        })?.name,
      ).toBe("Dwarf");
    });

    it("returns nothing when neither source has the race", () => {
      expect(resolveRaceDefinition("race_dwarf")).toBeUndefined();
    });

    it("prefers the pack over the dictionary for the same id", () => {
      // the snapshot is the newer authority; a stale dictionary entry must not
      // shadow content the rulebook was updated with
      expect(
        resolveRaceDefinition("race_dwarf", {
          racesById: { race_dwarf: { ...packRace, speed: 30 } },
        })?.speed,
      ).toBe(30);
    });
  });

  describe("traits", () => {
    it("finds a trait the pack defines", () => {
      expect(
        resolveTraitDefinition("trait_rage", {
          traitsById: { trait_rage: packTrait },
        })?.name,
      ).toBe("Rage");
    });

    it("still finds a trait only the dictionary defines", () => {
      // fighting styles, metamagic and maneuvers are dictionary-only while the
      // pack is filled in, so the fallback is the architecture, not a stopgap
      expect(resolveTraitDefinition("trait_fs_defense")).toBeDefined();
    });

    it("keeps the dictionary reachable even when a snapshot is supplied", () => {
      expect(
        resolveTraitDefinition("trait_fs_defense", {
          traitsById: { trait_rage: packTrait },
        }),
      ).toBeDefined();
    });

    it("returns nothing for a trait neither source defines", () => {
      expect(resolveTraitDefinition("trait_invented")).toBeUndefined();
    });
  });

  describe("classes", () => {
    it("finds a class the pack defines but the dictionary does not", () => {
      expect(
        resolveClassDefinition("class_barbarian", {
          classesById: { class_barbarian: packClass },
        })?.name,
      ).toBe("Barbarian");
    });

    it("still finds a class only the dictionary defines", () => {
      expect(resolveClassDefinition("class_fighter")).toBeDefined();
    });

    it("returns nothing for a class neither source defines", () => {
      expect(resolveClassDefinition("class_barbarian")).toBeUndefined();
    });
  });
});
