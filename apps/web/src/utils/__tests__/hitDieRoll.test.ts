import { describe, expect, it } from "vitest";
import { buildHitDieHealingExpression } from "../hitDieRoll.js";

describe("buildHitDieHealingExpression", () => {
  it("uses a plus sign for positive Constitution modifiers", () => {
    expect(buildHitDieHealingExpression(8, 2)).toBe("1d8+2");
  });

  it("uses a minus sign for negative Constitution modifiers", () => {
    expect(buildHitDieHealingExpression(10, -2)).toBe("1d10-2");
  });

  it("omits the modifier when the Constitution modifier is zero", () => {
    expect(buildHitDieHealingExpression(6, 0)).toBe("1d6");
  });
});
