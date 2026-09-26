import { afterEach, describe, expect, it } from "vitest";
import { SOCKET_EVENTS } from "@project/shared";
import {
  characterClasses,
  characterInventory,
  characterResources,
  characters,
} from "@project/database/src/schema/operational.js";
import {
  characterRow,
  inventoryRow,
  joinCampaign,
  setupGateway,
  type GatewayHarness,
} from "./socketHarness.js";

/**
 * Casting through ACTION_INTENT, against the real shipped pack: the checks
 * settleSpellCast makes before anything is spent, and what the resolution
 * carries back. A spell's action id is `${action id}@${source}`.
 */
describe("socket gateway - casting a spell", () => {
  let harness: GatewayHarness;
  let request = 0;

  afterEach(() => {
    harness?.restore();
  });

  const cast = (actionId: string, extra: Record<string, unknown> = {}) =>
    harness.emit(SOCKET_EVENTS.ACTION_INTENT, {
      characterId: "char-1",
      requestId: `req-${++request}`,
      actionId,
      source: "character",
      timestamp: Date.now(),
      ...extra,
    });

  const lastResolved = () =>
    (harness.ioEmits.at(-1)?.payload as { data: Record<string, unknown> }).data;

  const chargesOf = (id: string) =>
    (lastResolved()["resources"] as Array<{ id: string; currentCharges: number }>).find(
      (resource) => resource.id === id,
    )?.currentCharges;

  const slot = (id: string, level: number, current: number, max: number) => ({
    id,
    characterId: "char-1",
    name: `Level ${level} slots`,
    current,
    max,
    resetCondition: "long_rest",
  });

  const lightCleric = async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    // stored WIS 16 + the human's 1 = 17 (+3); proficiency +2: DC 13
    harness.db.seed(characters, [
      characterRow({ raceId: "race_human", subraceId: null, wis: 16 }),
    ]);
    harness.db.seed(characterClasses, [
      { classId: "class_cleric", classLevel: 3, subclassId: "subclass_cleric_light" },
    ]);
    harness.db.seed(characterInventory, []);
    harness.db.seed(characterResources, [
      slot("spell_slots_1", 1, 1, 4),
      slot("spell_slots_2", 2, 2, 2),
    ]);
  };

  const drowWizard = async (
    inventory: Record<string, unknown>[] = [],
    faerieFire = 1,
  ) => {
    harness = await setupGateway();
    await joinCampaign(harness);
    // stored CHA 10 + the drow's 1 = 11 (+0); proficiency +2: DC 10
    harness.db.seed(characters, [
      characterRow({ raceId: "race_elf", subraceId: "subrace_elf_dark", cha: 10 }),
    ]);
    harness.db.seed(characterClasses, [{ classId: "class_wizard", classLevel: 3 }]);
    harness.db.seed(characterInventory, inventory);
    harness.db.seed(characterResources, [
      {
        id: "drow_magic_faerie_fire",
        characterId: "char-1",
        name: "Faerie Fire (Drow Magic)",
        current: faerieFire,
        max: 1,
        resetCondition: "dawn",
      },
    ]);
  };

  it("casts Burning Hands from a 2nd-level slot: 4d6 fire, the targets' DC, the slot spent", async () => {
    await lightCleric();

    await cast("action_spell_burning_hands@class_cleric", {
      cast: { slotResourceId: "spell_slots_2" },
    });
    const resolved = lastResolved();

    expect(resolved["executed"]).toBe(true);
    expect(
      (resolved["rollResults"] as Array<{ rolls: number[] }>)[0]?.rolls,
    ).toHaveLength(4);
    expect(resolved["targetSaves"]).toEqual([
      expect.objectContaining({
        ability: "DEX",
        dc: 13,
        onSuccess: "half_damage",
        area: { shape: "cone", size: 15 },
      }),
    ]);
    expect(chargesOf("spell_slots_2")).toBe(1);
  });

  it("refuses a slot spell cast without a slot, and spends nothing", async () => {
    await lightCleric();

    await cast("action_spell_burning_hands@class_cleric");

    expect(lastResolved()).toMatchObject({ executed: false, reason: "slot_required" });
    expect(chargesOf("spell_slots_1")).toBe(1);
    expect(chargesOf("spell_slots_2")).toBe(2);
  });

  it("refuses a slot with no charges left", async () => {
    await lightCleric();

    await cast("action_spell_burning_hands@class_cleric", {
      cast: { slotResourceId: "spell_slots_1" },
    });
    // getAuthoritativeRuntimeContext re-reads character_resources on every
    // intent and re-hydrates the runtime pool from it - correct against a
    // real database, where the first cast's write already landed. The fake
    // db never applies an update to what a later read returns, so the second
    // read is queued explicitly with the slot spent, or this cast would see
    // the seeded (unspent) charge again.
    harness.db.queue(characterResources, [
      [slot("spell_slots_1", 1, 0, 4), slot("spell_slots_2", 2, 2, 2)],
    ]);
    await cast("action_spell_burning_hands@class_cleric", {
      cast: { slotResourceId: "spell_slots_1" },
    });

    expect(lastResolved()).toMatchObject({ executed: false, reason: "slot_empty" });
  });

  it("asks for Dancing Lights' material when nothing covers it", async () => {
    await drowWizard();

    await cast("action_spell_dancing_lights@drow_magic");

    expect(lastResolved()).toMatchObject({
      executed: false,
      reason: "materials_required",
    });
  });

  it("casts it once the player confirms, and concentrates on it", async () => {
    await drowWizard();

    await cast("action_spell_dancing_lights@drow_magic", {
      cast: { materialsConfirmed: true },
    });

    expect(lastResolved()["executed"]).toBe(true);
    // the list also carries trait states, which are permanent; only the
    // concentration effect is this cast's
    expect(lastResolved()["effects"]).toContainEqual(
      expect.objectContaining({ sourceName: "Dancing Lights", isSelfConcentration: true }),
    );
  });

  it("casts it unasked with a component pouch", async () => {
    await drowWizard([inventoryRow({ itemId: "item_gear_component_pouch" })]);

    await cast("action_spell_dancing_lights@drow_magic");

    expect(lastResolved()["executed"]).toBe(true);
  });

  // a wizard's focus serves wizard spells; Drow Magic is the drow's
  it("does not let a wizard's arcane focus stand in for a racial spell's material", async () => {
    await drowWizard([inventoryRow({ itemId: "item_focus_crystal" })]);

    await cast("action_spell_dancing_lights@drow_magic");

    expect(lastResolved()).toMatchObject({
      executed: false,
      reason: "materials_required",
    });
  });

  it("spends Drow Magic's Faerie Fire, and refuses it once spent", async () => {
    await drowWizard();

    await cast("action_spell_faerie_fire@drow_magic");

    expect(lastResolved()["executed"]).toBe(true);
    expect(lastResolved()["targetSaves"]).toEqual([
      expect.objectContaining({ ability: "DEX", dc: 10, onSuccess: "negates_effect" }),
    ]);
    expect(chargesOf("drow_magic_faerie_fire")).toBe(0);

    // Same fake-db caveat as the slot test above: queue the spent charge for
    // the read this second intent triggers, or it would see the seeded row.
    harness.db.queue(characterResources, [
      [
        {
          id: "drow_magic_faerie_fire",
          characterId: "char-1",
          name: "Faerie Fire (Drow Magic)",
          current: 0,
          max: 1,
          resetCondition: "dawn",
        },
      ],
    ]);
    await cast("action_spell_faerie_fire@drow_magic");

    expect(lastResolved()).toMatchObject({
      executed: false,
      reason: "insufficient_resource",
    });
  });

  it("ends concentration with the standard action, and the broadcast carries the effects without it", async () => {
    await drowWizard();
    await cast("action_spell_dancing_lights@drow_magic", {
      cast: { materialsConfirmed: true },
    });

    await cast("action_end_concentration");

    expect(lastResolved()["executed"]).toBe(true);
    expect(
      (lastResolved()["effects"] as Array<{ isSelfConcentration: boolean }>).some(
        (effect) => effect.isSelfConcentration,
      ),
    ).toBe(false);
  });
});
