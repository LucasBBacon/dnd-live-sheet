import { describe, expect, it } from "vitest";
import { TraitDefinitionSchema } from "../content/traits.js";

const trait = (extra: Record<string, unknown>) => ({
  id: "trait_example",
  name: "Example",
  ...extra,
});

describe("TraitDefinitionSchema.tableNotes", () => {
  it("parses a gated note and defaults the half of the predicate it omits", () => {
    const parsed = TraitDefinitionSchema.parse(
      trait({
        tableNotes: [{ text: "While raging, x.", requiredStates: ["status_raging"] }],
      }),
    );

    expect(parsed.tableNotes).toEqual([
      { text: "While raging, x.", requiredStates: ["status_raging"], forbiddenStates: [] },
    ]);
  });

  it("stays absent when a trait authors none", () => {
    expect(TraitDefinitionSchema.parse(trait({})).tableNotes).toBeUndefined();
  });

  it("rejects an empty note", () => {
    expect(
      TraitDefinitionSchema.safeParse(trait({ tableNotes: [{ text: "" }] })).success,
    ).toBe(false);
  });

  it("rejects a note longer than 240 characters", () => {
    expect(
      TraitDefinitionSchema.safeParse(
        trait({ tableNotes: [{ text: "x".repeat(241) }] }),
      ).success,
    ).toBe(false);
  });
});
