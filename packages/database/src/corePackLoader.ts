import { readFile } from "node:fs/promises";
import {
  CoreRulePackSchema,
  type CoreRulePack,
  validateCoreRulePack,
} from "@project/shared";

export class CoreRulePackLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CoreRulePackLoadError";
  }
}

/**
 * Schema and semantic validation for a pack already in memory.
 *
 * Split out of loadCoreRulePack so the assembler, which builds a pack from
 * many files, validates through exactly the same path as a single-file load.
 * @param source The candidate pack
 * @param label How to name the source in an error, e.g. a file path
 * @returns The validated pack
 */
export const parseCoreRulePack = (
  source: unknown,
  label: string,
): CoreRulePack => {
  const parsed = CoreRulePackSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    throw new CoreRulePackLoadError(
      `Core rule pack '${label}' failed schema validation: ${details}`,
    );
  }

  const validation = validateCoreRulePack(parsed.data);
  if (!validation.ok) {
    const details = validation.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new CoreRulePackLoadError(
      `Core rule pack '${label}' failed semantic validation: ${details}`,
    );
  }

  return parsed.data;
};

export const loadCoreRulePack = async (
  filePath: string,
): Promise<CoreRulePack> => {
  let source: unknown;

  try {
    source = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new CoreRulePackLoadError(
      `Could not read core rule pack '${filePath}'.`,
      { cause: error },
    );
  }

  return parseCoreRulePack(source, filePath);
};
