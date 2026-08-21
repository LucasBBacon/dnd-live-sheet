import { describe, expect, it } from "vitest";
import path from "node:path";
import type { EquipmentGap } from "@project/shared";
import { assembleCoreRulePack } from "../corePackAssembler.js";

const SHIPPED_PACK = path.join(process.cwd(), "data/packs/core_2014_pack");

type PackEquipment = Awaited<
  ReturnType<typeof assembleCoreRulePack>
>["equipment"][number];

/**
 * What is *actually* absent from an item, derived from the data rather than
 * read off the marker. The cross-check below compares this against what each
 * item declares, which is what stops the marker drifting in either direction.
 */
const derivedGaps = (item: PackEquipment): EquipmentGap[] => {
  const gaps: EquipmentGap[] = [];

  if (item.type === "weapon" && !item.weapon) {
    gaps.push("weapon");
  }

  if (item.type === "armor") {
    const grantsArmorClass = (item.modifiers ?? []).some(
      (modifier) => modifier.target === "ARMOR_CLASS",
    );

    if (!grantsArmorClass) {
      gaps.push("armor_class");
    }

    // Body armour only. ArmorCategorySchema leaves shields out on purpose - a
    // shield is not body armour - so flagging one here would report a
    // deliberate absence as a gap.
    if (item.equipSlot === "body" && !item.armorCategory) {
      gaps.push("armor_category");
    }
  }

  return gaps;
};

describe("equipment declares its own gaps", () => {
  /**
   * The assertion this marker exists for.
   *
   * Equipment was the only section that could not say what it was missing,
   * which is how 23 weapons that roll no attack and 6 armours that grant no AC
   * sat in the pack looking finished. This runs both ways: an undeclared gap
   * fails, and so does a marker left behind after the gap is filled.
   */
  it("declares exactly the gaps its data actually has", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    const mismatches = pack.equipment
      .map((item) => ({
        id: item.id,
        derived: derivedGaps(item),
        declared: item.implementation?.gaps ?? [],
      }))
      .filter(
        ({ derived, declared }) =>
          [...derived].sort().join() !== [...declared].sort().join(),
      );

    expect(mismatches).toEqual([]);
  });

  it("still has the gaps #32 and #33 record, which this only marks", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    const withGap = (gap: EquipmentGap) =>
      pack.equipment.filter((item) => item.implementation?.gaps.includes(gap));

    expect(withGap("weapon")).toHaveLength(23);
    expect(withGap("armor_class")).toHaveLength(6);
    // the half of #33 the backlog did not record: the same six armours also
    // declare no category, which is what proficiency and Fast Movement gate on
    expect(withGap("armor_category")).toHaveLength(6);
  });

  it("leaves a finished item unmarked rather than marking it complete", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);
    const plate = pack.equipment.find((item) => item.id === "item_armor_plate");

    expect(plate).toBeDefined();
    expect(plate?.implementation).toBeUndefined();
  });

  it("does not ask a shield for a category it deliberately has no place for", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);
    const shield = pack.equipment.find(
      (item) => item.id === "item_armor_shield",
    );

    expect(shield?.armorCategory).toBeUndefined();
    expect(shield?.implementation).toBeUndefined();
  });
});
