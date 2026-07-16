import { describe, expect, it } from "vitest";
import { TraitBridge } from "../traitBridge";

describe("TraitBridge.compileTraitBenefits", () => {
  it("returns empty outputs for unknown trait ids", () => {
    const result = TraitBridge.compileTraitBenefits(["trait_unknown"]);

    expect(result).toEqual({
      modifiers: [],
      fixedProficiencyGrants: [],
      proficiencyChoices: [],
      proficiencyGrants: [],
    });
  });

  it("compiles modifiers from known traits", () => {
    const result = TraitBridge.compileTraitBenefits(["feat_tough"]);

    expect(result.modifiers).toEqual([
      expect.objectContaining({
        id: "feat_tough_0",
        sourceName: "Tough",
        sourceOrigin: "trait:feat_tough",
        isActive: true,
        target: "MAX_HP",
        type: "add",
        value: 2,
        scalingFactor: "total_level",
      }),
    ]);
    expect(result.fixedProficiencyGrants).toEqual([]);
    expect(result.proficiencyChoices).toEqual([]);
    expect(result.proficiencyGrants).toEqual([]);
  });

  it("compiles fixed dwarf weapon proficiencies using canonical item ids", () => {
    const result = TraitBridge.compileTraitBenefits([
      "trait_dwarven_combat_training",
    ]);

    expect(result.modifiers).toEqual([]);
    expect(result.fixedProficiencyGrants).toEqual([
      {
        category: "weapons",
        proficiencyId: "item_weapon_battleaxe",
        level: "proficient",
      },
      {
        category: "weapons",
        proficiencyId: "item_weapon_handaxe",
        level: "proficient",
      },
      {
        category: "weapons",
        proficiencyId: "item_weapon_light_hammer",
        level: "proficient",
      },
      {
        category: "weapons",
        proficiencyId: "item_weapon_warhammer",
        level: "proficient",
      },
    ]);
    expect(result.proficiencyGrants).toEqual([
      {
        category: "weapons",
        proficiencyId: "item_weapon_battleaxe",
        level: "proficient",
      },
      {
        category: "weapons",
        proficiencyId: "item_weapon_handaxe",
        level: "proficient",
      },
      {
        category: "weapons",
        proficiencyId: "item_weapon_light_hammer",
        level: "proficient",
      },
      {
        category: "weapons",
        proficiencyId: "item_weapon_warhammer",
        level: "proficient",
      },
    ]);
  });

  it("de-duplicates proficiency grants by category and proficiency id", () => {
    const result = TraitBridge.compileTraitBenefits([
      "trait_dwarven_combat_training",
      "trait_dwarven_combat_training",
    ]);

    expect(result.proficiencyGrants).toHaveLength(4);
  });

  it("surfaces unresolved proficiency choice blocks", () => {
    const result = TraitBridge.compileTraitBenefits(["trait_dwarf_prof_tools"]);

    expect(result.fixedProficiencyGrants).toEqual([]);
    expect(result.proficiencyGrants).toEqual([]);
    expect(result.proficiencyChoices).toEqual([
      {
        traitId: "trait_dwarf_prof_tools",
        id: "dwarf_artisan_tools",
        category: "tools",
        chooseAmount: 1,
        options: ["smiths_tools", "brewers_supplies", "mason_tools"],
        level: "proficient",
      },
    ]);
  });

  it("applies resolved proficiency choices and filters invalid selections", () => {
    const result = TraitBridge.compileTraitBenefits(
      ["trait_dwarf_prof_tools"],
      [
        {
          traitId: "trait_dwarf_prof_tools",
          choiceId: "dwarf_artisan_tools",
          selectedProficiencyIds: ["mason_tools", "invalid_tool"],
        },
      ],
    );

    expect(result.proficiencyGrants).toEqual([
      {
        category: "tools",
        proficiencyId: "mason_tools",
        level: "proficient",
      },
    ]);
  });
});
