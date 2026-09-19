import { describe, expect, it } from "vitest";
import { resolveSelfSaveDc, selfSaveCounterId } from "../saveDc.js";

const escalating = {
  kind: "escalating_per_use" as const,
  base: 10,
  increasePerUse: 5,
  resourceId: "resource_relentless_rage",
};

describe("resolveSelfSaveDc", () => {
  it("returns a fixed DC whatever the count", () => {
    expect(resolveSelfSaveDc({ kind: "fixed", value: 13 }, 4)).toBe(13);
  });

  it("raises an escalating DC by its step for each use so far", () => {
    expect(resolveSelfSaveDc(escalating, 0)).toBe(10);
    expect(resolveSelfSaveDc(escalating, 1)).toBe(15);
    expect(resolveSelfSaveDc(escalating, 2)).toBe(20);
  });
});

describe("selfSaveCounterId", () => {
  it("names the pool an escalating rule counts", () => {
    expect(selfSaveCounterId(escalating)).toBe("resource_relentless_rage");
  });

  it("names none for a fixed DC", () => {
    expect(selfSaveCounterId({ kind: "fixed", value: 13 })).toBeUndefined();
  });
});
