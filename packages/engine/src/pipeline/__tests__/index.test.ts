import { describe, expect, it } from "vitest";
import * as pipeline from "../index";

describe("pipeline entrypoint", () => {
  it("exports InventoryBridge", () => {
    expect(pipeline.InventoryBridge).toBeDefined();
  });
});
