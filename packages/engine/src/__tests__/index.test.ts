import { describe, expect, it } from "vitest";
import * as engine from "../index";

describe("engine package entrypoint", () => {
  it("exports calculator, pipeline, rules, and types surface", () => {
    expect(engine.DerivedStatEngine).toBeDefined();
    expect(engine.InventoryBridge).toBeDefined();
    expect(engine.EQUIPMENT_RULES_MAP).toBeDefined();
  });
});
