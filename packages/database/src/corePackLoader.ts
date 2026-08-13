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

  const parsed = CoreRulePackSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    throw new CoreRulePackLoadError(
      `Core rule pack '${filePath}' failed schema validation: ${details}`,
    );
  }

  const validation = validateCoreRulePack(parsed.data);
  if (!validation.ok) {
    const details = validation.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new CoreRulePackLoadError(
      `Core rule pack '${filePath}' failed semantic validation: ${details}`,
    );
  }

  return parsed.data;
};
