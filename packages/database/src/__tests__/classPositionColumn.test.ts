import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { characterClasses } from "../schema/operational.js";

describe("character_classes.position", () => {
  it("is a non-null integer defaulting to 0, the class taken at creation", () => {
    const column = getTableConfig(characterClasses).columns.find(
      (candidate) => candidate.name === "position",
    );

    expect(column?.getSQLType()).toBe("integer");
    expect(column?.notNull).toBe(true);
    expect(column?.default).toBe(0);
  });
});
