/**
 * Argument handling for `db:import-pack`.
 *
 * Split out of the script so the guard can be tested without a database
 * attached - the script itself imports `client.ts`, which wants a live
 * DATABASE_URL before any of this would run.
 */

/** Explicit consent to a destructive import. Whole word only. */
export const CONFIRM_FLAG = "--yes";

export interface ImportInvocation {
  packDir: string;
  /** True only when the operator passed CONFIRM_FLAG. */
  confirmed: boolean;
}

/**
 * @param argv `process.argv.slice(2)` - flags and the optional pack directory,
 *   in whatever order `pnpm run` forwarded them.
 * @param defaultPackDir used when no positional argument is supplied.
 */
export const parseImportInvocation = (
  argv: readonly string[],
  defaultPackDir: string,
): ImportInvocation => {
  // Anything flag-shaped is never a path. Without this an operator who typed
  // only flags would import the default pack while believing they had named a
  // directory - the quietest possible way to destroy the wrong database.
  const positional = argv.filter((arg) => !arg.startsWith("--"));

  return {
    packDir: positional[0] ?? defaultPackDir,
    confirmed: argv.includes(CONFIRM_FLAG),
  };
};
