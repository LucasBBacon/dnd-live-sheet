import { describe, expect, it } from "vitest";
import { ImportEntityEntrySchema } from "@project/shared";
import {
  parseImportRowPayload,
  parseLedgerRow,
} from "../importPipeline.js";

/**
 * The import side of the defect already fixed on the rollback side, and in two
 * places worse. Both files stage rows to jsonb in one phase and re-read them
 * with `.parse()` in a later one, so any schema change between the two makes a
 * stale row throw - and `planImportRun` and `publishImportRun` had no
 * `try`/`catch` at all, meaning an uncaught ZodError escaped before the run's
 * status and issues were ever written. The run recorded nothing about why it
 * stopped.
 *
 * `applyImportRun` was caught, but only by an outer transaction handler that
 * reported a bare Zod message naming no row.
 */

const validData = {
  name: "Darkvision",
  lore: { shortDescription: "See in dim light." },
  definition: { id: "trait_darkvision", name: "Darkvision" },
  isStartingProficiency: false,
};

/** The shape a row staged before the `effects` -> `definition` rename still has. */
const legacyData = {
  name: "Darkvision",
  lore: { shortDescription: "See in dim light." },
  effects: [],
  isStartingProficiency: false,
};

const row = (payload: unknown, overrides: Record<string, unknown> = {}) =>
  ({
    rowIndex: 3,
    rowType: "entity",
    kind: "trait",
    op: "insert",
    entityId: "trait_darkvision",
    payload,
    status: "pending",
    errorMessage: null,
    ...overrides,
  }) as never;

describe("parseImportRowPayload", () => {
  it("returns the parsed payload when it still matches the schema", () => {
    const parsed = parseImportRowPayload(
      ImportEntityEntrySchema,
      row({ kind: "trait", id: "trait_darkvision", op: "insert", data: validData }),
    );

    expect(parsed).toMatchObject({ kind: "trait", id: "trait_darkvision" });
  });

  it("names the row, kind and entity when a staged row predates a schema rename", () => {
    expect(() =>
      parseImportRowPayload(
        ImportEntityEntrySchema,
        row({
          kind: "trait",
          id: "trait_darkvision",
          op: "insert",
          data: legacyData,
        }),
      ),
    ).toThrow(
      "Import row 3 (entity:trait, entityId=trait_darkvision) failed to parse its stored payload:",
    );
  });

  it("keeps the original error reachable as the cause", () => {
    // Losing the ZodError would trade one legibility problem for another.
    try {
      parseImportRowPayload(
        ImportEntityEntrySchema,
        row({
          kind: "trait",
          id: "trait_darkvision",
          op: "insert",
          data: legacyData,
        }),
      );
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).cause).toBeDefined();
    }
  });
});

describe("parseLedgerRow", () => {
  it("returns the parsed entity for a healthy row", () => {
    const result = parseLedgerRow(
      row({ kind: "trait", id: "trait_darkvision", op: "insert", data: validData }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parsed.entity).toMatchObject({ id: "trait_darkvision" });
    }
  });

  it("returns the parsed relation for a relation row", () => {
    const result = parseLedgerRow(
      row(
        {
          kind: "feat_trait",
          op: "add",
          featId: "feat_alert",
          traitId: "trait_darkvision",
        },
        { rowType: "relation", kind: "feat_trait", entityId: null },
      ),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parsed.relation).toMatchObject({ op: "add" });
    }
  });

  /**
   * The half that matters most. Planning collects issues, marks the run
   * failed and then throws - so a parse failure has to arrive as an *issue*
   * rather than as an exception thrown past all of that, which is what left
   * the run with no record of why it stopped.
   */
  it("reports a stale row as a blocking issue rather than throwing", () => {
    const result = parseLedgerRow(
      row({ kind: "trait", id: "trait_darkvision", op: "insert", data: legacyData }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issue.severity).toBe("error");
      expect(result.issue.rowIndex).toBe(3);
      expect(result.issue.code).toBe("ROW_PAYLOAD_UNPARSABLE");
      expect(result.issue.message).toContain("trait_darkvision");
    }
  });
});
