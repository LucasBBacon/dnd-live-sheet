import { describe, expect, it } from "vitest";
import type { CharacterSlot, InventoryInstance } from "@project/shared";
import { RollContextBuilder } from "../rollContextBuilder.js";
import { corePackEquipment, corePackLookup } from "./corePackFixture.js";

const { weaponsById } = corePackEquipment();

// ammunition is matched by resolving each inventory row against the pack
const PACK = corePackLookup();

const buildAmmoOptions = (
  weapon: Parameters<typeof RollContextBuilder.buildAmmoOptions>[0],
  inventory: InventoryInstance[],
) => RollContextBuilder.buildAmmoOptions(weapon, inventory, PACK);

const longbow = weaponsById.item_weapon_longbow;
if (!longbow) throw new Error("the pack is missing the longbow");

const row = (
  id: string,
  itemId: string,
  quantity: number,
  overrides: Partial<InventoryInstance> = {},
): InventoryInstance => ({
  id,
  itemId,
  quantity,
  slot: "backpack" as CharacterSlot,
  isAttuned: false,
  ...overrides,
});

describe("RollContextBuilder.buildAmmoOptions", () => {
  it("offers every kind of arrow the character carries", () => {
    const options = buildAmmoOptions(longbow, [
      row("inv_123", "item_ammo_arrow", 20),
      row("inv_456", "item_ammo_arrow_plus_one", 5),
    ]);

    expect(options).toEqual([
      {
        instanceId: "inv_123",
        itemId: "item_ammo_arrow",
        label: "Arrow",
        quantity: 20,
      },
      {
        instanceId: "inv_456",
        itemId: "item_ammo_arrow_plus_one",
        label: "+1 Arrow",
        quantity: 5,
      },
    ]);
  });

  it("leaves out anything the bow cannot fire", () => {
    const options = buildAmmoOptions(longbow, [
      row("inv_1", "item_ammo_arrow", 20),
      row("inv_2", "item_armor_plate", 1),
      row("inv_3", "item_weapon_dagger", 2),
    ]);

    expect(options.map((option) => option.instanceId)).toEqual(["inv_1"]);
  });

  it("skips an exhausted stack", () => {
    const options = buildAmmoOptions(longbow, [
      row("inv_empty", "item_ammo_arrow", 0),
    ]);

    expect(options).toEqual([]);
  });

  it("prefers a custom name so the player recognises their own quiver", () => {
    const options = buildAmmoOptions(longbow, [
      row("inv_1", "item_ammo_arrow", 3, { customName: "Signal Arrows" }),
    ]);

    expect(options[0]?.label).toBe("Signal Arrows");
  });

  it("ignores an unknown item id", () => {
    const options = buildAmmoOptions(longbow, [
      row("inv_ghost", "item_from_a_deleted_pack", 10),
    ]);

    expect(options).toEqual([]);
  });

  it("returns nothing for a weapon that needs no ammunition", () => {
    const dagger = weaponsById.item_weapon_dagger;
    if (!dagger) throw new Error("the pack is missing the dagger");

    const options = buildAmmoOptions(dagger, [
      row("inv_1", "item_ammo_arrow", 20),
    ]);

    expect(options).toEqual([]);
  });

  it("still matches an untagged item the weapon names outright", () => {
    const options = buildAmmoOptions(
      // a weapon from older content: a default item id and no tag
      { ammoItemId: "item_weapon_dagger" },
      [row("inv_1", "item_weapon_dagger", 2)],
    );

    expect(options.map((option) => option.instanceId)).toEqual(["inv_1"]);
  });

  it("keeps inventory order so the list does not jump between rolls", () => {
    const options = buildAmmoOptions(longbow, [
      row("inv_b", "item_ammo_arrow_plus_one", 5),
      row("inv_a", "item_ammo_arrow", 20),
    ]);

    expect(options.map((option) => option.instanceId)).toEqual([
      "inv_b",
      "inv_a",
    ]);
  });
});
