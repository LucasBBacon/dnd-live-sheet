import { describe, expect, it } from "vitest";
import path from "node:path";
import { CONDITION_IDS, STANDARD_ACTIONS, type ActionGrant } from "@project/shared";
import { assembleCoreRulePackSync } from "../corePackAssembler.js";

const SHIPPED_PACK = path.join(process.cwd(), "data/packs/core_2014_pack");

/**
 * States the engine derives itself rather than reading from a trait or an
 * effect: worn armour and held weapons from InventoryExtractor, load from
 * EncumbranceEngine, unmet requirements from ItemRequirementEngine.
 */
const ENGINE_BASE_STATES = [
  "status_wearing_armor",
  "status_wearing_light_armor",
  "status_wearing_heavy_armor",
  "status_wielding_two_handed",
  "status_wielding_one_handed_only",
  "status_item_requirement_unmet",
  "encumbered",
  "heavily_encumbered",
  "over_capacity",
];

const statesGrantedByEffect = (effect: ActionGrant["effect"]): string[] => {
  if (effect.type === "apply_effect") return effect.states;
  if (effect.type === "macro") return effect.effects.flatMap(statesGrantedByEffect);
  return [];
};

/**
 * A marker with no note is the invisibility this panel exists to end: a trait
 * marked manual_sheet_helper and carrying no text reaches nobody.
 */
describe("table notes in the shipped pack", () => {
  it("gives every sheet helper at least one note", () => {
    const pack = assembleCoreRulePackSync(SHIPPED_PACK);

    const silentHelpers = pack.traits
      .filter(
        (trait) =>
          trait.implementation?.mode === "manual_sheet_helper" &&
          (trait.tableNotes ?? []).length === 0,
      )
      .map((trait) => trait.id);

    expect(silentHelpers).toEqual([]);
  });

  it("gates every note on a state something actually emits", () => {
    const pack = assembleCoreRulePackSync(SHIPPED_PACK);

    const emitted = new Set<string>([
      ...CONDITION_IDS,
      ...ENGINE_BASE_STATES,
      ...STANDARD_ACTIONS.flatMap((action) => statesGrantedByEffect(action.effect)),
      ...pack.traits.flatMap((trait) => [
        ...(trait.grantedStates ?? []),
        ...trait.actions.flatMap((action) => statesGrantedByEffect(action.effect)),
      ]),
    ]);

    const unknown = pack.traits.flatMap((trait) =>
      (trait.tableNotes ?? []).flatMap((note) =>
        [...note.requiredStates, ...note.forbiddenStates]
          .filter((state) => !emitted.has(state))
          .map((state) => `${trait.id}: ${state}`),
      ),
    );

    expect(unknown).toEqual([]);
  });
});
