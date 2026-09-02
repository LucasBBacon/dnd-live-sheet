import { describe, expect, it } from "vitest";
import path from "node:path";
import { assembleCoreRulePack } from "../corePackAssembler.js";

const SHIPPED_PACK = path.join(process.cwd(), "data/packs/core_2014_pack");

type Pack = Awaited<ReturnType<typeof assembleCoreRulePack>>;
type PackTrait = Pack["traits"][number];
type PackSpell = Pack["spells"][number];

/** A `{ fixed, choices }` grant block that actually grants something. */
const grants = (block: unknown): boolean => {
  const b = block as { fixed?: unknown[]; choices?: unknown[] } | undefined;
  return (b?.fixed?.length ?? 0) > 0 || (b?.choices?.length ?? 0) > 0;
};

/**
 * Whether a trait carries any rule at all, derived from its data rather than
 * read off its marker - the same shape as `derivedGaps` in equipmentGaps.test,
 * and for the same reason: a marker compared against itself proves nothing.
 *
 * Every rule-bearing channel `TraitDefinitionSchema` offers is listed. A new
 * channel added to the schema and forgotten here would make a trait look
 * rule-free, so this list is load-bearing.
 */
const carriesRules = (trait: PackTrait): boolean => {
  const t = trait as Record<string, unknown>;
  const len = (key: string) => (t[key] as unknown[] | undefined)?.length ?? 0;

  return (
    grants(t["modifiers"]) ||
    grants(t["proficiencies"]) ||
    grants(t["affinities"]) ||
    grants(t["spells"]) ||
    len("grantedStates") > 0 ||
    len("resources") > 0 ||
    len("triggers") > 0 ||
    len("diceRules") > 0 ||
    len("criticalHitModifiers") > 0 ||
    len("actions") > 0
  );
};

const isStub = (spell: PackSpell): boolean =>
  (spell as { action?: { effect?: { type?: string } } }).action?.effect?.type ===
  "no_effect";

/**
 * Equipment got a cross-check when it learned to declare its own gaps (E3).
 * Traits and spells have carried their markers far longer and never got one -
 * every assertion on them was a spot-check, which is exactly the state the two
 * slot vocabularies were in before they drifted apart and cost E1.
 *
 * 567 markers ride on these two sections. This is the check that keeps them
 * honest.
 */
describe("trait and spell implementation markers match their data", () => {
  it("never marks a trait unimplemented while it carries rules", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    // The stale-marker direction: rules get authored, the marker gets left
    // behind, and the burndown counts a finished trait as outstanding forever.
    const stale = pack.traits
      .filter(
        (trait) =>
          trait.implementation?.mode === "unimplemented" && carriesRules(trait),
      )
      .map((trait) => trait.id);

    expect(stale).toEqual([]);
  });

  it("never claims engine delivery for a trait that carries no rules", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    // The opposite lie: "engine" means the rule reaches the player through the
    // engine, which cannot be true of a trait with no rule to deliver.
    const hollow = pack.traits
      .filter(
        (trait) =>
          trait.implementation?.mode === "engine" && !carriesRules(trait),
      )
      .map((trait) => trait.id);

    expect(hollow).toEqual([]);
  });

  it("marks every stubbed spell and stubs every marked spell", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    const markedButReal = pack.spells
      .filter((spell) => spell.implementation && !isStub(spell))
      .map((spell) => spell.id);
    const realButUnmarked = pack.spells
      .filter((spell) => !spell.implementation && isStub(spell))
      .map((spell) => spell.id);

    expect({ markedButReal, realButUnmarked }).toEqual({
      markedButReal: [],
      realButUnmarked: [],
    });
  });

  it("keeps the spell section's placeholders as placeholders", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    // The marker's summary says level and school are placeholders too. If a
    // second level or school ever appears, some spell has had real data
    // authored and the claim has stopped being true for the whole section.
    expect([...new Set(pack.spells.map((spell) => spell.level))]).toEqual([0]);
    expect([...new Set(pack.spells.map((spell) => spell.school))]).toEqual([
      "evocation",
    ]);
  });

  /**
   * Was a characterisation test pinning 119 silent stubs. They are marked now
   * (#51), so it asserts the invariant instead of recording the gap.
   *
   * The silence this breaks was real: `trait_dragon_ancestor_black` grants no
   * acid resistance, no Draconic and no Charisma-check doubling, and while it
   * carried no marker it was indistinguishable from a trait that deliberately
   * grants nothing. Every rule-free trait now says which it is.
   */
  it("leaves no rule-free trait unmarked", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    const unmarked = pack.traits
      .filter((trait) => !trait.implementation && !carriesRules(trait))
      .map((trait) => trait.id);

    expect(unmarked).toEqual([]);
  });

  it("records how much of the trait section carries no rules", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    // 463 of 587: 343 marked unimplemented, 119 unmarked, and
    // trait_fs_protection marked as a sheet helper because the modifier
    // vocabulary cannot express it (#23). Was 576 of 700 until #57 deleted
    // 113 stubs that no progression referenced.
    expect(pack.traits.filter((trait) => !carriesRules(trait))).toHaveLength(
      463,
    );
    expect(pack.traits).toHaveLength(587);
  });
});
