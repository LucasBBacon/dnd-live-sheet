import { describe, expect, it } from "vitest";
import type { CharacterSave, RuntimeModifier } from "@project/shared";
import { EffectManager } from "../../calculators/effects.js";
import { CharacterBootstrapper } from "../characterBootstrapper.js";
import { gatherSheetModifiers } from "../sheetModifiers.js";
import { corePackLookup } from "./corePackFixture.js";

const halfElfBard: CharacterSave = {
  attributes: { str: 9, dex: 15, con: 12, int: 12, wis: 10, cha: 16 },
  race: { baseRaceId: "race_half_elf", hasSubraces: false, subraceId: null },
  classes: [{ classId: "class_bard", level: 1, selections: {} }],
  traitSelections: { half_elf_asi_choice: ["DEX", "CON"] },
  hp: { current: 8, temporary: 0, baseRolledHp: 8, hitDiceSpent: {} },
};

const liveBlessing: RuntimeModifier = {
  id: "mod_live",
  target: "ARMOR_CLASS",
  type: "add",
  value: 1,
  scalingFactor: "none",
  requiredStates: [],
  forbiddenStates: [],
  sourceName: "Shield of Faith",
  sourceOrigin: "spell",
  isActive: true,
};

describe("gatherSheetModifiers", () => {
  const gather = (effectManager = new EffectManager()) =>
    gatherSheetModifiers({
      activeTraits: CharacterBootstrapper.compileActiveTraits(
        halfElfBard,
        corePackLookup(),
      ),
      selections: CharacterBootstrapper.resolveSelections(halfElfBard),
      inventory: [
        {
          id: "inv-shield",
          itemId: "item_armor_shield",
          quantity: 1,
          slot: "off_hand",
          isAttuned: false,
        },
      ],
      effectManager,
      snapshot: corePackLookup(),
    });

  it("includes a trait's fixed and chosen ability modifiers", () => {
    const abilityAdds = gather()
      .filter(
        (modifier) =>
          modifier.type === "add" &&
          ["STR", "DEX", "CON", "INT", "WIS", "CHA"].includes(modifier.target),
      )
      .map((modifier) => `${modifier.target}+${modifier.value}`)
      .sort();

    expect(abilityAdds).toEqual(["CHA+2", "CON+1", "DEX+1"]);
  });

  it("includes an equipped item's modifiers", () => {
    // InventoryExtractor stamps sourceOrigin as `item:${itemId}`, not a bare
    // "item" (see inventoryExtractor.ts's extract()), so assert on the field
    // it actually produces for this fixture's shield.
    expect(
      gather().some(
        (modifier) =>
          modifier.target === "ARMOR_CLASS" &&
          modifier.sourceOrigin === "item:item_armor_shield",
      ),
    ).toBe(true);
  });

  it("includes live effect modifiers, after traits and equipment", () => {
    const effectManager = new EffectManager();
    effectManager.addEffect({
      instanceId: "effect_1",
      sourceName: "Shield of Faith",
      durationType: "manual",
      durationRemaining: undefined,
      isSelfConcentration: false,
      modifiers: [liveBlessing],
      grantedStates: [],
    });

    const modifiers = gather(effectManager);

    expect(modifiers.at(-1)).toEqual(
      expect.objectContaining({ id: "mod_live", instanceId: "effect_1" }),
    );
  });
});
