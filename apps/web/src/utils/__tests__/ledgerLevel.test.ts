import { describe, expect, it } from "vitest";
import { ledgerTotalLevel } from "../ledgerLevel";

describe("ledgerTotalLevel", () => {
  it("sums every class's level", () => {
    expect(ledgerTotalLevel({ class_bard: 6, class_rogue: 1 })).toBe(7);
  });

  it("is 0 for a character with no class yet", () => {
    expect(ledgerTotalLevel({})).toBe(0);
  });
});
