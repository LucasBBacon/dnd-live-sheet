import { describe, expect, it } from "vitest";
import path from "node:path";
import { collectReferencedTraitIds } from "@project/shared";
import { assembleCoreRulePackSync } from "../corePackAssembler.js";

const SHIPPED_PACK = path.join(process.cwd(), "data/packs/core_2014_pack");

/**
 * Every trait must be reachable.
 *
 * `validateCoreRulePack` has always checked that a referenced trait exists.
 * Nothing checked the reverse, and 112 of the pack's 700 traits were reached
 * by nothing at all - no race, subrace, class, subclass, feat or background.
 *
 * The stated reason a rule-free stub is allowed to exist is that "it exists so
 * progressions can reference it", which `TraitImplementationMetadataSchema`
 * says in as many words. A trait no progression references has no reason at
 * all, and 23 of them were duplicates of traits that already worked - authored
 * under a `trait_`-prefixed id beside the id the content actually grants.
 *
 * The guard is deliberately a test over the shipped pack rather than a rule in
 * `validateCoreRulePack`: a *library* pack that ships traits for campaigns to
 * draw from would be legitimate, and that is a decision about packs in general
 * rather than about this one. See #57 and #58.
 */
/**
 * The one trait deliberately allowed to be unreachable.
 *
 * `trait_powerful_build` is the only grantor of the `powerful_build` state,
 * which `encumbrance.ts` reads and says it reads "here and nowhere else". No
 * core-2014 race has Powerful Build - it belongs to Goliath, which this pack
 * does not carry - so the trait is authored, working content waiting for a
 * race to grant it. Deleting it would remove the only source of a state the
 * engine explicitly supports.
 */
const DELIBERATELY_UNREACHABLE = ["trait_powerful_build"];

describe("trait reachability in the shipped pack", () => {
  it("reaches every trait it defines, bar one documented exception", async () => {
    const pack = assembleCoreRulePackSync(SHIPPED_PACK);
    const referenced = collectReferencedTraitIds(pack);

    const unreachable = pack.traits
      .map((trait) => trait.id)
      .filter((id) => !referenced.has(id));

    expect(unreachable.sort()).toEqual([...DELIBERATELY_UNREACHABLE].sort());
  });

  /**
   * The live defect this guard found. Every other race defines its language
   * trait as `race_<race>_languages` in its own file, carrying the actual
   * proficiencies. The elf's was authored as `elf_languages` - no prefix - so
   * a stub took the conventional id, and the race granted the stub. Elves got
   * no languages at all.
   */
  it("gives the elf the language proficiencies its race grants", async () => {
    const pack = assembleCoreRulePackSync(SHIPPED_PACK);
    const elfLanguages = pack.traits.find(
      (trait) => trait.id === "race_elf_languages",
    );

    const languages = (elfLanguages?.proficiencies?.fixed ?? []).map(
      (grant) => grant.proficiencyId,
    );

    expect(languages).toEqual(["common", "elvish"]);
    // the id it was authored under, which nothing granted
    expect(pack.traits.some((trait) => trait.id === "elf_languages")).toBe(false);
  });

  /**
   * The specific trap #57 removed. Half-orc grants `relentless_endurance`,
   * which carries a resource, an ON_HP_REDUCED_TO_ZERO trigger and a
   * drop-to-one-hp macro. `trait_relentless_endurance` was a rule-free stub
   * beside it that nothing granted - so authoring the rule onto the stub
   * would have produced a complete, tested trait that reached no character.
   */
  it("keeps the granted trait and not a prefixed twin of it", async () => {
    const pack = assembleCoreRulePackSync(SHIPPED_PACK);
    const ids = new Set(pack.traits.map((trait) => trait.id));

    for (const granted of ["relentless_endurance", "lucky", "savage_attacks"]) {
      expect(ids.has(granted)).toBe(true);
      expect(ids.has(`trait_${granted}`)).toBe(false);
    }
  });
});
