import { describe, expect, it } from "vitest";
import { CONDITION_MAP, CONDITION_IDS } from "../index.js";

describe("CONDITION_MAP", () => {
  it("exposes canonical condition metadata from the shared package", () => {
    expect(CONDITION_MAP.blinded).toMatchObject({
      id: "blinded",
      name: "Blinded",
    });
    expect(CONDITION_MAP.blinded?.summary.length).toBeGreaterThan(10);
  });

  it("keys conditions by the bare state id that authored rules already gate on", () => {
    // trait_aura_of_protection and the save calculator tests both gate on the
    // unprefixed name; a condition_ prefix here would orphan them.
    expect(CONDITION_MAP.incapacitated?.id).toBe("incapacitated");
    expect(CONDITION_MAP.condition_incapacitated).toBeUndefined();
  });

  it("covers the fourteen flag conditions", () => {
    expect(CONDITION_IDS).toEqual([
      "blinded",
      "charmed",
      "deafened",
      "frightened",
      "grappled",
      "incapacitated",
      "invisible",
      "paralyzed",
      "petrified",
      "poisoned",
      "prone",
      "restrained",
      "stunned",
      "unconscious",
    ]);
  });

  it("omits exhaustion, which is a six-level track rather than a flag", () => {
    expect(CONDITION_MAP.exhaustion).toBeUndefined();
  });

  it("keeps every id identical to its map key", () => {
    for (const [key, condition] of Object.entries(CONDITION_MAP)) {
      expect(condition.id).toBe(key);
    }
  });
});
