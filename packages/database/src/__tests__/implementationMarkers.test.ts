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
    len("tableNotes") > 0 ||
    len("conditionSuppressions") > 0 ||
    len("resources") > 0 ||
    len("triggers") > 0 ||
    len("diceRules") > 0 ||
    len("criticalHitModifiers") > 0 ||
    len("actions") > 0
  );
};

/**
 * A stub is an action that does nothing and tells the table nothing:
 * `effect.type === "no_effect"` and no `tableNote`.
 *
 * `effect.type === "no_effect"` alone stopped being the signal once
 * narrative spells were authored - Minor Illusion, Augury and their kin are
 * real, and `no_effect` by design (the authoring guide: a spell that "does
 * what only the table can see" is "no_effect otherwise; the rest in a
 * tableNote"). What tells a stub apart from one of those is exactly that
 * note: a stub has none, because there is no rule yet to hand the table:
 * every authored narrative spell carries one, and no stub does.
 *
 * `lore === undefined` was tried as the proxy instead, but `validateSpells`
 * already enforces that pairing (`incomplete_spell`: unmarked means all of
 * `lore`/`range`/`components`/`duration`, marked means none) for every pack
 * that assembles at all - checking it again here can never fail, so it is
 * not this test's cross-check. The table note is: nothing else guarantees a
 * narrative spell's `no_effect` action carries one.
 */
const isStub = (spell: PackSpell): boolean =>
  spell.action.effect.type === "no_effect" && !spell.action.tableNote;

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
    const stubs = pack.spells.filter((spell) => spell.implementation);

    // The marker's summary says level and school are placeholders too, so the
    // claim is checked on the stubs alone: an authored spell has real ones.
    expect([...new Set(stubs.map((spell) => spell.level))]).toEqual([0]);
    expect([...new Set(stubs.map((spell) => spell.school))]).toEqual([
      "evocation",
    ]);
  });

  it("records which spells carry rules", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    // 24 of 111 since feat/spells-third-ten (#31). Add each spell as it is
    // authored; one leaving this list is a regression.
    expect(
      pack.spells
        .filter((spell) => !spell.implementation)
        .map((spell) => spell.id)
        .sort(),
    ).toEqual([
      "spell_animal_friendship",
      "spell_augury",
      "spell_bane",
      "spell_banishment",
      "spell_bless",
      "spell_blight",
      "spell_burning_hands",
      "spell_charm_person",
      "spell_command",
      "spell_cone_of_cold",
      "spell_confusion",
      "spell_create_food_and_water",
      "spell_dancing_lights",
      "spell_darkness",
      "spell_daylight",
      "spell_eldritch_blast",
      "spell_faerie_fire",
      "spell_hellish_rebuke",
      "spell_identify",
      "spell_minor_illusion",
      "spell_nondetection",
      "spell_speak_with_dead",
      "spell_suggestion",
      "spell_thaumaturgy",
    ]);
    expect(pack.spells).toHaveLength(111);
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

    // 362 of 584. The subclass bonus grants task authored eight traits: five
    // fixed-or-mixed armour/weapon grants on the cleric's Life, War, Tempest
    // and Nature domains, a language-and-expertise-skills choice block on the
    // cleric's Knowledge domain (Blessings of Knowledge), a three-skill
    // choice block on the bard's College of Lore, a fixed armour/weapon grant
    // on the bard's College of Valor, and a fixed two-tool grant on the
    // rogue's Assassin archetype - eight traits total, each replacing an
    // "unimplemented" stub of the same id (deleted from
    // traits/unimplemented.json, upserted with a real grant or choice block
    // into classes/{bard,cleric,rogue}.json) - a wash on the total count,
    // eight fewer rule-free.
    expect(pack.traits.filter((trait) => !carriesRules(trait))).toHaveLength(
      362,
    );
    expect(pack.traits).toHaveLength(584);
  });
});
