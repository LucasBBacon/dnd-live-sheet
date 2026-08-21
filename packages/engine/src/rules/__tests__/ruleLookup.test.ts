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
  it("resolves nothing without a snapshot to read", () => {
    // the static dictionaries are gone; an item the caller supplies no pack
    // for does not exist, and undefined is the correct answer
    expect(resolveItemDefinition("item_armor_shield")).toBeUndefined();
    expect(resolveWeaponDefinition("item_weapon_longsword")).toBeUndefined();
    expect(resolveEquipmentDefinition("item_weapon_longsword")).toBeUndefined();
  });

  it("resolves item definitions from the snapshot", () => {
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

    expect(item?.name).toBe("Snapshot Shield");
    expect(item?.modifiers?.[0]?.value).toBe(3);
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

    expect(item?.name).toBe("Canonical Shield");
    expect(item?.modifiers?.[0]?.value).toBe(3);
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

    expect(item?.name).toBe("Compat Shield");
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

    expect(weapon?.name).toBe("Snapshot Longsword");
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

    expect(weapon?.name).toBe("Canonical Longsword");
    expect(weapon?.damageDice).toBe("1d10");
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

    expect(equipment?.name).toBe("Snapshot Longsword");
    expect(equipment?.weapon?.damageDice).toBe("1d12");
  });

  it("resolves a resource rule from the snapshot", () => {
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
    it("finds a race the pack defines", () => {
      expect(
        resolveRaceDefinition("race_dwarf", {
          racesById: { race_dwarf: packRace },
        })?.name,
      ).toBe("Dwarf");
    });

    it("returns nothing when the pack has no such race", () => {
      expect(resolveRaceDefinition("race_dwarf")).toBeUndefined();
    });

    it("reads the race's own speed from the pack", () => {
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

    it("resolves nothing for a trait the snapshot omits", () => {
      // fighting styles used to come from a dictionary the pack could not
      // shadow. they are pack content now, so a snapshot without one has none
      expect(
        resolveTraitDefinition("trait_fs_defense", {
          traitsById: { trait_rage: packTrait },
        }),
      ).toBeUndefined();
    });

    it("returns nothing for a trait the pack does not define", () => {
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

    it("returns nothing for a class the pack does not define", () => {
      expect(resolveClassDefinition("class_barbarian")).toBeUndefined();
    });
  });
});
