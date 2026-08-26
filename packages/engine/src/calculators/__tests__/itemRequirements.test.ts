import { describe, expect, it } from "vitest";
import type { CharacterSlot, InventoryInstance } from "@project/shared";
import {
  ItemRequirementEngine,
  REQUIREMENT_UNMET_STATE,
} from "../itemRequirements.js";
import type { Ability } from "../../types/core.js";
import { corePackLookup } from "../../pipeline/__tests__/corePackFixture.js";

const PACK = corePackLookup();

const PLATE = "item_armor_plate";
const CHAIN_MAIL = "item_armor_chain_mail";
const LEATHER = "item_armor_leather";

const scores = (overrides: Partial<Record<Ability, number>> = {}): Record<
  Ability,
  number
> => ({
  STR: 10,
  DEX: 10,
  CON: 10,
  INT: 10,
  WIS: 10,
  CHA: 10,
  ...overrides,
});

const instance = (
  id: string,
  itemId: string,
  slot: CharacterSlot,
  overrides: Partial<InventoryInstance> = {},
): InventoryInstance => ({
  id,
  itemId,
  quantity: 1,
  slot,
  isAttuned: false,
  ...overrides,
});

const evaluate = (
  items: InventoryInstance[],
  abilityScores = scores(),
) =>
  ItemRequirementEngine.evaluate({ items, abilityScores, snapshot: PACK });

describe("ItemRequirementEngine.evaluate", () => {
  it("charges nothing for an empty bag", () => {
    const result = evaluate([]);

    expect(result.unmet).toEqual([]);
    expect(result.speedPenaltyFeet).toBe(0);
    expect(result.states).toEqual([]);
  });

  it("charges the authored penalty when the wearer falls short", () => {
    const result = evaluate([instance("inv_1", PLATE, "body")], scores({ STR: 13 }));

    expect(result.speedPenaltyFeet).toBe(10);
    expect(result.unmet[0]).toMatchObject({
      itemId: PLATE,
      ability: "STR",
      requiredScore: 15,
      actualScore: 13,
    });
    expect(result.states).toEqual([REQUIREMENT_UNMET_STATE]);
  });

  it("charges nothing once the wearer meets the minimum exactly", () => {
    const result = evaluate([instance("inv_1", PLATE, "body")], scores({ STR: 15 }));

    expect(result.unmet).toEqual([]);
    expect(result.speedPenaltyFeet).toBe(0);
  });

  it("reads the lowercase key packs author against the uppercase score record", () => {
    // the one place the two ability vocabularies meet: a mismapping here would
    // silently read undefined and charge nobody, which no total would reveal
    const met = evaluate([instance("inv_1", PLATE, "body")], scores({ STR: 20 }));
    const unmet = evaluate([instance("inv_1", PLATE, "body")], scores({ STR: 8 }));

    expect(met.speedPenaltyFeet).toBe(0);
    expect(unmet.speedPenaltyFeet).toBe(10);
  });

  it("asks nothing of armour left in the pack", () => {
    const result = evaluate(
      [instance("inv_1", PLATE, "backpack")],
      scores({ STR: 8 }),
    );

    expect(result.unmet).toEqual([]);
    expect(result.speedPenaltyFeet).toBe(0);
  });

  it("ignores an item that declares no requirement", () => {
    const result = evaluate([instance("inv_1", LEATHER, "body")], scores({ STR: 3 }));

    expect(result.unmet).toEqual([]);
  });

  it("tolerates an item with no rule behind it", () => {
    const result = evaluate([instance("inv_1", "item_ghost", "body")]);

    expect(result.unmet).toEqual([]);
    expect(result.speedPenaltyFeet).toBe(0);
  });

  it("charges each unmet item once, and sums across items", () => {
    // not a legal loadout - one body slot - but the summing rule should not
    // depend on the equip layer refusing it
    const result = evaluate(
      [
        instance("inv_1", PLATE, "body"),
        instance("inv_2", CHAIN_MAIL, "body"),
      ],
      scores({ STR: 8 }),
    );

    expect(result.charges).toHaveLength(2);
    expect(result.speedPenaltyFeet).toBe(20);
  });

  it("prefers the player's custom name when labelling the charge", () => {
    const result = evaluate(
      [instance("inv_1", PLATE, "body", { customName: "Dented Plate" })],
      scores({ STR: 8 }),
    );

    expect(result.charges[0]?.label).toContain("Dented Plate");
  });

  it("holds chain mail to a lower bar than plate", () => {
    const strength14 = scores({ STR: 14 });

    expect(
      evaluate([instance("inv_1", CHAIN_MAIL, "body")], strength14)
        .speedPenaltyFeet,
    ).toBe(0);
    expect(
      evaluate([instance("inv_1", PLATE, "body")], strength14).speedPenaltyFeet,
    ).toBe(10);
  });
});
