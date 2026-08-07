import { describe, expect, it } from "vitest";
import * as pipeline from "../index.js";

describe("pipeline entrypoint", () => {
  it("exports InventoryExtractor", () => {
    expect(pipeline.InventoryExtractor).toBeDefined();
  });
});
