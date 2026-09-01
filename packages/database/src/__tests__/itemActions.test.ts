import { describe, expect, it } from "vitest";
import path from "node:path";
import { assembleCoreRulePack } from "../corePackAssembler.js";

const SHIPPED_PACK = path.join(process.cwd(), "data/packs/core_2014_pack");

/** Every item the design authors an action for, and what it must cost. */
const AUTHORED: Array<{ id: string; consumesSelf: boolean; rolls: boolean }> = [
  { id: "item_acid_vial", consumesSelf: true, rolls: true },
  { id: "item_alchemists_fire_flask", consumesSelf: true, rolls: true },
  { id: "item_holy_water_flask", consumesSelf: true, rolls: true },
  { id: "item_oil_flask", consumesSelf: true, rolls: true },
  { id: "item_antitoxin_vial", consumesSelf: true, rolls: true },
  { id: "item_potion_of_healing", consumesSelf: true, rolls: true },
  { id: "item_caltrops_bag", consumesSelf: true, rolls: false },
  { id: "item_ball_bearings_bag", consumesSelf: true, rolls: false },
  { id: "item_poison_basic_vial", consumesSelf: true, rolls: false },
  { id: "item_hunting_trap", consumesSelf: false, rolls: false },
  { id: "item_healers_kit", consumesSelf: false, rolls: false },
  { id: "item_climbers_kit", consumesSelf: false, rolls: false },
  { id: "item_ram_portable", consumesSelf: false, rolls: false },
  { id: "item_lantern_hooded", consumesSelf: false, rolls: false },
];

describe("authored item actions", () => {
  it("gives each of the fourteen items exactly one action", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    for (const expected of AUTHORED) {
      const item = pack.equipment.find((entry) => entry.id === expected.id);
      expect(item, expected.id).toBeDefined();
      const actions = item!.actions ?? [];
      expect(actions, expected.id).toHaveLength(1);
      expect(actions[0]!.consumesSelf, expected.id).toBe(
        expected.consumesSelf,
      );
    }
  });

  it("declares delivery by effect type: what rolls nothing says so, and says why", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    for (const expected of AUTHORED) {
      const action = (pack.equipment.find((e) => e.id === expected.id)!
        .actions ?? [])[0]!;

      expect(action.effect.type === "no_effect", expected.id).toBe(
        !expected.rolls,
      );

      if (!expected.rolls) {
        expect(action.tableNote, expected.id).toBeTruthy();
      }
    }
  });

  it("never lets an item action roll nothing and say nothing", async () => {
    // This is the whole guarantee, and it lives here rather than in the schema.
    // A Zod refine on ActionGrantSchema would also gate Disengage, Help and
    // Ready - which are no_effect and need no note, their name being the rule -
    // and the 111 no_effect spell stubs marked "unimplemented". The rule is
    // true of *item* actions only, so it is enforced against item data.
    // Deliberately not limited to AUTHORED: a future item cannot skip its note.
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    const silent = pack.equipment.flatMap((entry) =>
      (entry.actions ?? [])
        .filter(
          (action) => action.effect.type === "no_effect" && !action.tableNote,
        )
        .map((action) => `${entry.id}/${action.id}`),
    );

    expect(silent).toEqual([]);
  });

  it("gives every item action a unique id across the whole pack", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);
    const ids = pack.equipment.flatMap((entry) =>
      (entry.actions ?? []).map((action) => action.id),
    );

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no item action that spends an activation the sheet cannot track", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    for (const entry of pack.equipment) {
      for (const action of entry.actions ?? []) {
        expect(["action", "bonus_action", "minute"], action.id).toContain(
          action.activation,
        );
      }
    }
  });

  // The suite above checks shape - one action, the right consumesSelf, the
  // right effect type, a note where one is required - but never a single die,
  // DC or range. A wrong 2d4 where 2d6 belongs would still pass every test
  // above. These pin the actual authored values so a rules error is caught
  // here rather than only by a human reviewer.
  it("gives each engine-run item action the exact dice, range and damage the design specifies", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    const firstAction = (itemId: string) => {
      const item = pack.equipment.find((entry) => entry.id === itemId);
      expect(item, itemId).toBeDefined();
      const [action] = item!.actions ?? [];
      expect(action, itemId).toBeDefined();
      return action!;
    };

    const acid = firstAction("item_acid_vial");
    if (acid.effect.type !== "attack") {
      throw new Error("item_acid_vial's action did not author an attack");
    }
    expect(acid.effect.range).toBe(20);
    expect(acid.effect.damage).toEqual([
      expect.objectContaining({ baseDice: "2d6", damageType: "acid" }),
    ]);

    const fire = firstAction("item_alchemists_fire_flask");
    if (fire.effect.type !== "attack") {
      throw new Error(
        "item_alchemists_fire_flask's action did not author an attack",
      );
    }
    expect(fire.effect.range).toBe(20);
    expect(fire.effect.damage).toEqual([]);

    const holyWater = firstAction("item_holy_water_flask");
    if (holyWater.effect.type !== "attack") {
      throw new Error("item_holy_water_flask's action did not author an attack");
    }
    expect(holyWater.effect.range).toBe(20);
    expect(holyWater.effect.damage).toEqual([
      expect.objectContaining({ baseDice: "2d6", damageType: "radiant" }),
    ]);

    const oil = firstAction("item_oil_flask");
    if (oil.effect.type !== "attack") {
      throw new Error("item_oil_flask's action did not author an attack");
    }
    expect(oil.effect.range).toBe(20);
    expect(oil.effect.damage).toEqual([]);

    const antitoxin = firstAction("item_antitoxin_vial");
    if (antitoxin.effect.type !== "apply_effect") {
      throw new Error(
        "item_antitoxin_vial's action did not author apply_effect",
      );
    }
    expect(antitoxin.effect.modifiers).toEqual([
      expect.objectContaining({ target: "POISON_SAVE", type: "advantage" }),
    ]);

    const potion = firstAction("item_potion_of_healing");
    if (potion.effect.type !== "heal") {
      throw new Error("item_potion_of_healing's action did not author heal");
    }
    expect(potion.effect.dice).toBe("2d4+2");
  });

  it("pins the DC or key number each no_effect item's tableNote turns on", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    const noteOf = (itemId: string) => {
      const item = pack.equipment.find((entry) => entry.id === itemId);
      expect(item, itemId).toBeDefined();
      const [action] = item!.actions ?? [];
      expect(action, itemId).toBeDefined();
      return action!.tableNote;
    };

    expect(noteOf("item_caltrops_bag")).toContain("DC 15");
    expect(noteOf("item_ball_bearings_bag")).toContain("DC 10");
    expect(noteOf("item_poison_basic_vial")).toContain("DC 10");
    expect(noteOf("item_hunting_trap")).toContain("DC 13");
    expect(noteOf("item_healers_kit")).toContain("ten uses");
    expect(noteOf("item_climbers_kit")).toContain("25 feet");
    expect(noteOf("item_ram_portable")).toContain("+4");
    expect(noteOf("item_lantern_hooded")).toContain("5-foot radius");
  });
});
