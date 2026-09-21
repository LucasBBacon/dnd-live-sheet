import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { characters } from "../schema/operational.js";

describe("characters.choices", () => {
  it("is a non-null jsonb column defaulting to two empty maps", () => {
    const column = getTableConfig(characters).columns.find(
      (candidate) => candidate.name === "choices",
    );

    expect(column?.getSQLType()).toBe("jsonb");
    expect(column?.notNull).toBe(true);
    expect(column?.default).toEqual({ classSelections: {}, traitSelections: {} });
  });
});
