import { describe, expect, it } from "vitest";
import { TraitDefinitionSchema } from "@project/shared";
import { filterTraitsByCategory } from "../databaseReferenceProvider.js";

/**
 * `traits.definition` is a jsonb column declared `$type<TraitDefinition>()`,
 * which is a compile-time claim and no runtime check at all. Nothing in
 * `apps/server` or `packages/database` parsed a trait row through
 * `TraitDefinitionSchema`, so a row written before a schema change did not
 * error - it read as a trait with no proficiencies, and a category-filtered
 * query returned **nothing** rather than failing.
 *
 * The policy mirrors `projectEquipmentRows`, which is the only reason the
 * legacy `weapon_rule` breakage was ever visible: one bad row is named and
 * skipped, every row bad is a schema divergence and throws.
 */
describe("filterTraitsByCategory", () => {
  const trait = (id: string, category: string) => ({
    id,
    name: id,
    definition: TraitDefinitionSchema.parse({
      id,
      name: id,
      proficiencies: { fixed: [{ category, proficiencyId: `${id}_p` }] },
    }),
  });

  const skills = trait("trait_acrobatics", "skills");
  const tools = trait("trait_tinkerer", "tools");

  /** The shape a row written before the schema-layering rename still has. */
  const stale = { id: "trait_stale", name: "Stale", definition: { effects: [] } };

  it("returns only the traits whose definition matches the category", () => {
    const result = filterTraitsByCategory([skills, tools], "skills");

    expect(result.traits).toEqual([skills]);
    expect(result.malformedTraitIds).toEqual([]);
  });

  it("names a trait whose stored definition no longer parses", () => {
    // The defect this replaces: `stale` was cast, read as having no
    // proficiencies, and silently counted as a non-match - indistinguishable
    // from a trait that genuinely grants no skills.
    const result = filterTraitsByCategory([skills, stale], "skills");

    expect(result.malformedTraitIds).toEqual(["trait_stale"]);
    expect(result.traits).toEqual([skills]);
  });

  it("still returns the healthy traits alongside a malformed one", () => {
    // One bad row must not take down a browse endpoint and every request
    // that needs it.
    const result = filterTraitsByCategory([stale, tools], "tools_and_languages");

    expect(result.traits).toEqual([tools]);
  });

  it("throws when every stored definition fails to parse", () => {
    // Every row failing is not bad data, it is a schema no stored payload
    // satisfies. Returning an empty list there is the silent failure.
    expect(() =>
      filterTraitsByCategory([stale, { ...stale, id: "trait_stale_2" }], "skills"),
    ).toThrow(/diverged/);
  });

  it("does not treat an empty trait set as a divergence", () => {
    // Zero of zero failing is an empty table, not a break.
    expect(filterTraitsByCategory([], "skills")).toEqual({
      traits: [],
      malformedTraitIds: [],
    });
  });
});
