import { describe, expect, it } from "vitest";
import path from "node:path";
import { assembleCoreRulePack } from "../corePackAssembler.js";

const SHIPPED_PACK = path.join(process.cwd(), "data/packs/core_2014_pack");

/**
 * Segments merge last-wins, so an id authored in two files resolves to
 * whichever the manifest lists later and says nothing about it. Every armour
 * in the pack was once shadowed this way by a weight-0 stub.
 */
describe("the shipped pack authors every id exactly once", () => {
  it("has no duplicate equipment ids across segments", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const item of pack.equipment) {
      if (seen.has(item.id)) duplicates.push(item.id);
      seen.add(item.id);
    }

    expect(duplicates).toEqual([]);
  });

  it("never lists the same item twice inside one bundle", async () => {
    // bundle_contents is keyed (bundle_id, item_id), so a repeat is not merely
    // untidy - it aborts db:import-pack on a duplicate-key violation, and that
    // was the only thing catching it. The scholar's pack carried item_ink twice
    // where its own lore says "a bottle of ink, an ink pen".
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    const repeated = pack.equipment.flatMap((entry) => {
      const ids = entry.bundleContents.map((content) => content.itemId);
      return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].map(
        (id) => `${entry.id}/${id}`,
      );
    });

    expect(repeated).toEqual([]);
  });

  it("loads the armour segment the equipment tables depend on", async () => {
    // the manifest is a hand-maintained list, so a segment file can exist and
    // simply never be read - which is how armour went missing entirely
    const pack = await assembleCoreRulePack(SHIPPED_PACK);
    const plate = pack.equipment.find((item) => item.id === "item_armor_plate");

    expect(plate?.type).toBe("armor");
    expect(plate?.armorCategory).toBe("heavy");
  });
});
