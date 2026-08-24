import { describe, expect, it } from "vitest";
import { ImportEntityEntrySchema } from "@project/shared";
import {
  buildRollbackPlanRows,
  parseRollbackRowPayload,
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
            definition: { id: "trait_darkvision", name: "Darkvision" },
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
            definition: { id: "trait_a", name: "Trait A" },
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

describe("parseRollbackRowPayload", () => {
  const row = (payload: unknown) =>
    ({
      rowIndex: 3,
      rowType: "entity",
      kind: "trait",
      op: "archive",
      entityId: "trait_darkvision",
      payload,
      status: "pending",
      errorMessage: null,
    }) as any;

  it("returns the parsed payload when it still matches the schema", () => {
    const parsed = parseRollbackRowPayload(
      ImportEntityEntrySchema,
      row({
        kind: "trait",
        id: "trait_darkvision",
        op: "archive",
        data: {
          name: "Darkvision",
          lore: { shortDescription: "See in dim light." },
          definition: { id: "trait_darkvision", name: "Darkvision" },
          isStartingProficiency: false,
        },
      }),
    );

    expect(parsed).toMatchObject({ kind: "trait", id: "trait_darkvision" });
  });

  it("names the row, kind and reason when a ledger row predates a schema rename", () => {
    // the exact defect the final whole-branch review reproduced: a
    // rollback_rows payload captured before Task 14 renamed
    // TraitImportDataSchema.effects to definition no longer parses, and a
    // raw ZodError does not say which of the run's rows failed
    const legacyShapedRow = row({
      kind: "trait",
      id: "trait_darkvision",
      op: "archive",
      data: {
        name: "Darkvision",
        lore: { shortDescription: "See in dim light." },
        effects: [],
        isStartingProficiency: false,
      },
    });

    expect(() =>
      parseRollbackRowPayload(ImportEntityEntrySchema, legacyShapedRow),
    ).toThrow(
      "Rollback row 3 (entity:trait, entityId=trait_darkvision) failed to parse its stored payload:",
    );
  });
});
