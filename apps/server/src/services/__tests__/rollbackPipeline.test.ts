import { describe, expect, it } from "vitest";
import {
  buildRollbackPlanRows,
  preflightRollbackPlanRows,
} from "../rollbackPipeline.js";

describe("rollback pipeline planning", () => {
  it("builds inverse rollback rows from applied source rows", () => {
    const sourceRows = [
      {
        rowIndex: 10,
        rowType: "relation",
        kind: "feat_trait",
        op: "add",
        entityId: null,
        payload: {
          kind: "feat_trait",
          op: "add",
          featId: "feat_alert",
          traitId: "trait_darkvision",
        },
      },
      {
        rowIndex: 9,
        rowType: "entity",
        kind: "trait",
        op: "insert",
        entityId: "trait_darkvision",
        payload: {
          kind: "trait",
          id: "trait_darkvision",
          op: "insert",
          data: {
            name: "Darkvision",
            lore: { shortDescription: "See in dim light." },
            effects: [],
            isStartingProficiency: false,
          },
        },
      },
    ] as any;

    const result = buildRollbackPlanRows(sourceRows);

    expect(result.issues).toEqual([]);
    expect(result.plannedRows).toHaveLength(2);

    expect(result.plannedRows[0]).toMatchObject({
      sourceRowIndex: 10,
      rowType: "relation",
      kind: "feat_trait",
      op: "remove",
    });

    expect(result.plannedRows[1]).toMatchObject({
      sourceRowIndex: 9,
      rowType: "entity",
      kind: "trait",
      op: "archive",
      entityId: "trait_darkvision",
    });
  });

  it("emits blocking issue for entity rows that cannot be inverted safely", () => {
    const sourceRows = [
      {
        rowIndex: 1,
        rowType: "entity",
        kind: "trait",
        op: "archive",
        entityId: "trait_a",
        payload: {
          kind: "trait",
          id: "trait_a",
          op: "archive",
          data: {
            name: "Trait A",
            lore: { shortDescription: "A" },
            effects: [],
            isStartingProficiency: false,
          },
        },
      },
    ] as any;

    const result = buildRollbackPlanRows(sourceRows);

    expect(result.plannedRows).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      severity: "error",
      code: "UNSUPPORTED_ROLLBACK_INVERSE",
    });
  });

  it("fails preflight when rollback add relations reference missing entities", async () => {
    const plannedRows = [
      {
        sourceRowIndex: 5,
        rowType: "relation",
        kind: "feat_trait",
        op: "add",
        entityId: null,
        payload: {
          kind: "feat_trait",
          op: "add",
          featId: "feat_missing",
          traitId: "trait_missing",
        },
      },
    ] as any;

    const issues = await preflightRollbackPlanRows(plannedRows, () => false);

    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.code)).toEqual([
      "ROLLBACK_PREFLIGHT_MISSING_REFERENCE",
      "ROLLBACK_PREFLIGHT_MISSING_REFERENCE",
    ]);
  });
});
