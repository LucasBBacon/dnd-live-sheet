import { describe, expect, it } from "vitest";
import { SKILL_MAP } from "../index.js";

describe("SKILL_MAP", () => {
  it("exposes canonical skill metadata from the shared package", () => {
    expect(SKILL_MAP.athletics).toEqual({
      id: "athletics",
      name: "Athletics",
      ability: "STR",
    });
    expect(SKILL_MAP.perception).toMatchObject({
      id: "perception",
      name: "Perception",
      ability: "WIS",
    });
  });
});
