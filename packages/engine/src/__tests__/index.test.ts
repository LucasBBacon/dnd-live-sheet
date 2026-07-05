import { describe, expect, it } from "vitest";
import * as engine from "../index.js";

describe("engine package entrypoint", () => {
  it("exports calculator, pipeline, rules, and types surface", () => {
    expect(engine.DerivedStatEngine).toBeDefined();
    expect(engine.AbilityEngine).toBeDefined();
    expect(engine.InventoryBridge).toBeDefined();
    expect(engine.ITEM_DICTIONARY).toBeDefined();
  });

  it("calculates proficiency bonus using 5e level breakpoints", () => {
    expect(engine.AbilityEngine.getProficiencyBonus(1)).toBe(2);
    expect(engine.AbilityEngine.getProficiencyBonus(4)).toBe(2);
    expect(engine.AbilityEngine.getProficiencyBonus(5)).toBe(3);
    expect(engine.AbilityEngine.getProficiencyBonus(9)).toBe(4);
    expect(engine.AbilityEngine.getProficiencyBonus(13)).toBe(5);
    expect(engine.AbilityEngine.getProficiencyBonus(17)).toBe(6);
    expect(engine.AbilityEngine.getProficiencyBonus(20)).toBe(6);
  });
});
