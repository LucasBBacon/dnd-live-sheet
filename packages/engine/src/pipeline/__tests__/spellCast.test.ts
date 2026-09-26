import { describe, expect, it } from "vitest";
import type { ActionGrant, InventoryInstance } from "@project/shared";
import { materialCoverage, settleSpellCast } from "../spellCast.js";
import type { CastableSpell } from "../spellSynthesizer.js";
import { corePackLookup } from "./corePackFixture.js";

const carried = (itemId: string): InventoryInstance => ({
  id: `inv_${itemId}`,
  itemId,
  quantity: 1,
  slot: "backpack",
  isAttuned: false,
});

const spell = (overrides: Partial<CastableSpell> = {}): CastableSpell => ({
  spellId: "spell_burning_hands",
  name: "Burning Hands",
  level: 1,
  school: "evocation",
  components: {
    verbal: true,
    somatic: true,
    material: false,
    goldCost: 0,
    isConsumed: false,
  },
  activation: "action",
  source: { kind: "class", classId: "class_cleric", label: "Cleric" },
  ability: "WIS",
  attackBonus: 5,
  saveDc: 13,
  payment: { kind: "slot" },
  preparationTracked: true,
  focusCategories: ["category_holy_symbol"],
  actionId: "action_spell_burning_hands@class_cleric",
  ...overrides,
});

const lights = (focusCategories: CastableSpell["focusCategories"] = []) =>
  spell({
    spellId: "spell_dancing_lights",
    level: 0,
    payment: { kind: "at_will" },
    focusCategories,
    components: {
      verbal: true,
      somatic: true,
      material: true,
      materialDescription: "a bit of phosphorus or wychwood, or a glowworm",
      goldCost: 0,
      isConsumed: false,
    },
  });

const action: ActionGrant = {
  id: "action_spell_burning_hands@class_cleric",
  name: "Burning Hands",
  activation: "action",
  effect: { type: "no_effect" },
};

const slotPools = [
  { resourceId: "spell_slots_1", level: 1 },
  { resourceId: "spell_slots_2", level: 2 },
];

const settle = (
  overrides: Partial<Parameters<typeof settleSpellCast>[0]> = {},
) =>
  settleSpellCast({
    spell: spell(),
    action,
    request: {},
    slotPools,
    charges: [
      { id: "spell_slots_1", currentCharges: 0 },
      { id: "spell_slots_2", currentCharges: 1 },
    ],
    inventory: [],
    snapshot: corePackLookup(),
    ...overrides,
  });

describe("materialCoverage", () => {
  it("covers a spell with no material component", () => {
    expect(materialCoverage(spell(), [])).toEqual({ covered: true });
  });

  it("covers a material component with a component pouch", () => {
    expect(
      materialCoverage(lights(), [carried("item_gear_component_pouch")], corePackLookup()),
    ).toEqual({ covered: true, by: "Component Pouch" });
  });

  it("covers it with a focus the source can use", () => {
    expect(
      materialCoverage(
        lights(["category_arcane_focus"]),
        [carried("item_focus_crystal")],
        corePackLookup(),
      ).covered,
    ).toBe(true);
  });

  // a focus serves its class's spells; Drow Magic is nobody's class
  it("does not cover it with a focus the source cannot use", () => {
    expect(
      materialCoverage(lights([]), [carried("item_focus_crystal")], corePackLookup()),
    ).toEqual({ covered: false });
  });

  it("does not cover it with nothing", () => {
    expect(materialCoverage(lights(), [], corePackLookup())).toEqual({ covered: false });
  });
});

describe("settleSpellCast", () => {
  it("lets an at-will spell through as it is", () => {
    const at = spell({ level: 0, payment: { kind: "at_will" } });

    expect(settle({ spell: at })).toEqual({ ok: true, action });
  });

  it("asks which slot pays for a slot spell", () => {
    expect(settle()).toEqual({ ok: false, reason: "slot_required" });
    expect(settle({ request: { slotResourceId: "spell_slots_7" } })).toEqual({
      ok: false,
      reason: "slot_required",
    });
  });

  it("refuses a slot below the spell's level", () => {
    expect(
      settle({
        spell: spell({ level: 2 }),
        request: { slotResourceId: "spell_slots_1" },
      }),
    ).toEqual({ ok: false, reason: "slot_too_low", offendingId: "spell_slots_1" });
  });

  it("refuses an empty slot", () => {
    expect(settle({ request: { slotResourceId: "spell_slots_1" } })).toEqual({
      ok: false,
      reason: "slot_empty",
      offendingId: "spell_slots_1",
    });
  });

  it("spends the chosen slot through the action, and casts at its level", () => {
    expect(settle({ request: { slotResourceId: "spell_slots_2" } })).toEqual({
      ok: true,
      action: { ...action, consumesResource: "spell_slots_2" },
      spellCast: { spellLevel: 1, castLevel: 2 },
    });
  });

  it("refuses an uncovered material component the player has not confirmed", () => {
    expect(settle({ spell: lights() })).toEqual({
      ok: false,
      reason: "materials_required",
      offendingId: "spell_dancing_lights",
    });
  });

  it("casts it once the player confirms they have the material", () => {
    expect(
      settle({ spell: lights(), request: { materialsConfirmed: true } }).ok,
    ).toBe(true);
  });

  it("asks for the slot before the material", () => {
    expect(
      settle({ spell: { ...lights(), level: 1, payment: { kind: "slot" } } }),
    ).toEqual({ ok: false, reason: "slot_required" });
  });
});
