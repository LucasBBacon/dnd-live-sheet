import { getTableName, sql, SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { vi } from "vitest";

/**
 * A stand-in for the drizzle `db` export that records what the gateway asked
 * for and answers reads from seeded rows.
 *
 * The gateway's queries terminate at either `.where(...)` or `.limit(1)`, so
 * the builder is a thenable rather than a class with a `execute()` - awaiting
 * any point in the chain resolves the seeded rows for whichever table the
 * statement addressed.
 */

const dialect = new PgDialect();

export type Row = Record<string, unknown>;

export type DbOperation = {
  kind: "select" | "update" | "delete" | "insert";
  /** Table name from drizzle, e.g. "character_inventory". Null if unresolved. */
  table: string | null;
  /** Additional tables pulled in by innerJoin/leftJoin, in call order. */
  joins: string[];
  /** The object handed to `.set(...)`, unrendered. Use `renderSql` on values. */
  set: Row | null;
  /** The values handed to `.values(...)`. */
  values: unknown;
  /** The predicate handed to `.where(...)`, unrendered. Use `renderSql`. */
  where: unknown;
  /** True when the statement was issued against a transaction handle. */
  inTransaction: boolean;
  /** True once the statement has actually been awaited. */
  executed: boolean;
};

/**
 * Renders a drizzle `SQL` fragment or bare column into its Postgres text and
 * bound parameters, so a test can assert that an update is a single atomic
 * expression rather than a read-modify-write.
 */
export const renderSql = (value: unknown): { sql: string; params: unknown[] } => {
  const fragment = value instanceof SQL ? value : sql`${value}`;
  const query = dialect.sqlToQuery(fragment);
  return { sql: query.sql, params: query.params };
};

const resolveTableName = (candidate: unknown): string | null => {
  try {
    return getTableName(candidate as Parameters<typeof getTableName>[0]);
  } catch {
    return null;
  }
};

/** Table identity as a name, accepting either a drizzle table or its name. */
export type TableRef = string | Parameters<typeof getTableName>[0];

const asTableName = (table: TableRef): string =>
  typeof table === "string" ? table : getTableName(table);

export class FakeDb {
  /** Standing rows returned for every read of a table. */
  private standing = new Map<string, Row[]>();

  /** Positional overrides, consumed one read at a time before falling back. */
  private queued = new Map<string, Row[][]>();

  /** Every statement the gateway built, in construction order. */
  public readonly ops: DbOperation[] = [];

  /** Error to throw the next time `transaction` is entered. */
  private transactionFailure: Error | null = null;

  /** Statement-level failures, matched on table and optionally kind. */
  private failures: Array<{
    table: string;
    kind?: DbOperation["kind"];
    error: Error;
  }> = [];

  public readonly transaction = vi.fn(
    async <T,>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
      if (this.transactionFailure) {
        const failure = this.transactionFailure;
        this.transactionFailure = null;
        throw failure;
      }
      // A real transaction would roll back here; the fake just lets the throw
      // escape, which is what the gateway's catch blocks actually react to.
      return callback(this.handle(true));
    },
  );

  public readonly select = vi.fn((..._args: unknown[]) =>
    this.chain("select", true, null),
  );
  public readonly update = vi.fn((table: unknown) =>
    this.chain("update", false, table),
  );
  public readonly delete = vi.fn((table: unknown) =>
    this.chain("delete", false, table),
  );
  public readonly insert = vi.fn((table: unknown) =>
    this.chain("insert", false, table),
  );

  /** Rows returned for every read of `table` until re-seeded. */
  public seed(table: TableRef, rows: Row[]): this {
    this.standing.set(asTableName(table), rows);
    return this;
  }

  /**
   * Rows returned for the next N reads of `table`, in order, before falling
   * back to whatever `seed` holds. Use only where a handler must see the table
   * change between two reads.
   */
  public queue(table: TableRef, resultSets: Row[][]): this {
    this.queued.set(asTableName(table), [...resultSets]);
    return this;
  }

  public failNextTransaction(error: Error): this {
    this.transactionFailure = error;
    return this;
  }

  /**
   * Makes the next matching statement reject, so the gateway's catch blocks
   * can be exercised without contriving the data into an invalid shape.
   */
  public failOn(
    table: TableRef,
    kind: DbOperation["kind"] | undefined,
    error: Error,
  ): this {
    this.failures.push({
      table: asTableName(table),
      ...(kind !== undefined && { kind }),
      error,
    });
    return this;
  }

  private takeFailure(op: DbOperation): Error | null {
    const index = this.failures.findIndex(
      (failure) =>
        failure.table === op.table &&
        (failure.kind === undefined || failure.kind === op.kind),
    );
    if (index === -1) return null;

    const [failure] = this.failures.splice(index, 1);
    return failure?.error ?? null;
  }

  /** Operations against `table`, optionally narrowed to one statement kind. */
  public opsFor(table: TableRef, kind?: DbOperation["kind"]): DbOperation[] {
    const name = asTableName(table);
    return this.ops.filter(
      (op) => op.table === name && (kind === undefined || op.kind === kind),
    );
  }

  public reset(): void {
    this.standing.clear();
    this.queued.clear();
    this.ops.length = 0;
    this.transactionFailure = null;
    this.failures = [];
    this.transaction.mockClear();
    this.select.mockClear();
    this.update.mockClear();
    this.delete.mockClear();
    this.insert.mockClear();
  }

  private read(table: string | null): Row[] {
    if (table === null) return [];

    const pending = this.queued.get(table);
    if (pending && pending.length > 0) {
      return pending.shift() ?? [];
    }

    return this.standing.get(table) ?? [];
  }

  /** The `tx` object handed to a transaction callback. */
  private handle(inTransaction: boolean) {
    return {
      select: (..._args: unknown[]) =>
        this.chain("select", inTransaction, null),
      update: (table: unknown) => this.chain("update", inTransaction, table),
      delete: (table: unknown) => this.chain("delete", inTransaction, table),
      insert: (table: unknown) => this.chain("insert", inTransaction, table),
    };
  }

  private chain(
    kind: DbOperation["kind"],
    inTransaction: boolean,
    table: unknown,
  ) {
    const op: DbOperation = {
      kind,
      table: table === null ? null : resolveTableName(table),
      joins: [],
      set: null,
      values: undefined,
      where: undefined,
      inTransaction,
      executed: false,
    };
    this.ops.push(op);

    const builder: Record<string, unknown> = {};

    const passthrough = (name: string) => {
      builder[name] = (...args: unknown[]) => {
        if (name === "from") {
          op.table = resolveTableName(args[0]);
        } else if (name === "innerJoin" || name === "leftJoin") {
          const joined = resolveTableName(args[0]);
          if (joined !== null) op.joins.push(joined);
        } else if (name === "where") {
          op.where = args[0];
        } else if (name === "set") {
          op.set = (args[0] ?? null) as Row | null;
        } else if (name === "values") {
          op.values = args[0];
        }
        return builder;
      };
    };

    for (const name of [
      "from",
      "where",
      "limit",
      "offset",
      "orderBy",
      "groupBy",
      "innerJoin",
      "leftJoin",
      "set",
      "values",
      "returning",
      "onConflictDoNothing",
      "onConflictDoUpdate",
    ]) {
      passthrough(name);
    }

    // Thenable: the gateway awaits the chain wherever it happens to stop.
    builder["then"] = (
      onFulfilled?: (rows: Row[]) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      op.executed = true;
      const failure = this.takeFailure(op);
      const settled = failure
        ? Promise.reject(failure)
        : Promise.resolve(this.read(op.table));
      return settled.then(onFulfilled, onRejected);
    };

    return builder;
  }
}
