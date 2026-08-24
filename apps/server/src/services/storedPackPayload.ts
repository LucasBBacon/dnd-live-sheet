import { CoreRulePackSchema, type CoreRulePack } from "@project/shared";

/**
 * Validates a pack payload read back out of `core_rule_packs.payload`.
 *
 * The column is jsonb declared `$type<CoreRulePack>()` - a compile-time claim
 * and no runtime check - and both readers handed it straight to
 * `toRuleSnapshot`. A payload written before a schema change therefore did not
 * error: the id-keyed maps came out short or empty and every rules lookup
 * resolved to nothing, which is indistinguishable from a pack that simply does
 * not define the thing being looked up.
 *
 * There is exactly one payload, so unlike the per-row equipment and trait
 * paths there is no "name it and skip it" option: if it does not parse, the
 * server has no rules, and failing loudly beats serving an empty rulebook.
 *
 * Shape only. Semantic validation - id uniqueness, spell references - ran at
 * import time against this same payload and is not worth re-running on every
 * read; what changes underneath a stored blob is the schema, not the content.
 *
 * @param payload The stored value, untrusted regardless of its declared type.
 * @param source Where it was read from, named in the error.
 * @returns The validated pack.
 */
export const parseStoredPackPayload = (
  payload: unknown,
  source: string,
): CoreRulePack => {
  const parsed = CoreRulePackSchema.safeParse(payload);

  if (parsed.success) {
    return parsed.data;
  }

  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");

  throw new Error(
    `[storedPackPayload] '${source}' failed schema validation, so the stored pack and the schema have diverged: ${details}`,
  );
};
