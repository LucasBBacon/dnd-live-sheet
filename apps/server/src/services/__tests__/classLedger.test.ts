import { describe, expect, it } from "vitest";
import { renderSql } from "../../gateway/__tests__/fakeDb.js";
import { classLedgerOrder } from "../classLedger.js";

describe("classLedgerOrder", () => {
  it("orders by position, then class id as a deterministic tiebreak", () => {
    expect(classLedgerOrder.map((part) => renderSql(part).sql)).toEqual([
      '"character_classes"."position" asc',
      '"character_classes"."class_id" asc',
    ]);
  });
});
