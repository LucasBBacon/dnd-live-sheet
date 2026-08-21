import type { InferSelectModel } from "drizzle-orm";
import { CharacterSlotSchema, type InventoryInstance } from "@project/shared";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  EQUIPMENT_SLOTS,
  campaignMembers,
  campaigns,
  characterClasses,
  characterCustomTraits,
  characterInventory,
  characters,
} from "../schema/operational.js";

describe("operational schema", () => {
  it("defines core character fields and required constraints", () => {
    expect(Object.keys(characters)).toEqual(
      expect.arrayContaining([
        "id",
        "campaignId",
        "name",
        "raceId",
        "subraceId",
        "alignment",
        "backgroundId",
        "inventorySnapshot",
      ]),
    );

    expect(characters.id.primary).toBe(true);
    expect(characters.campaignId.notNull).toBe(true);
    expect(characters.name.notNull).toBe(true);
    expect(characters.raceId.notNull).toBe(true);
    // races without subraces (e.g. Human) store NULL here
    expect(characters.subraceId.notNull).toBe(false);
    expect(characters.customBackgroundData.dataType).toBe("json");
    expect(characters.inventorySnapshot.dataType).toBe("json");
  });

  it("stores inventory snapshots as typed inventory stacks", () => {
    type InventorySnapshotValue = InferSelectModel<typeof characters>["inventorySnapshot"];

    expectTypeOf<InventorySnapshotValue>().toEqualTypeOf<
      InventoryInstance[] | null
    >();
  });

  it("stores inventory snapshots as a non-null JSON payload by default", () => {
    expect(characters.inventorySnapshot.notNull).toBe(true);
  });

  it("keeps the database schema aligned with the shared inventory contract", () => {
    type InventorySnapshotValue = InferSelectModel<typeof characters>["inventorySnapshot"];

    expectTypeOf<InventorySnapshotValue>().toEqualTypeOf<
      InventoryInstance[] | null
    >();
  });

  it("defines campaign and membership tables", () => {
    expect(campaigns.id.primary).toBe(true);
    expect(campaigns.name.notNull).toBe(true);
    expect(campaigns.createdByUserId.notNull).toBe(true);

    expect(campaignMembers.campaignId.notNull).toBe(true);
    expect(campaignMembers.userId.notNull).toBe(true);
    expect(campaignMembers.role.notNull).toBe(true);
  });

  it("defines class progression and custom traits tables", () => {
    expect(characterClasses.characterId.notNull).toBe(true);
    expect(characterClasses.classId.notNull).toBe(true);
    expect(characterClasses.classLevel.notNull).toBe(true);

    expect(characterCustomTraits.id.primary).toBe(true);
    expect(characterCustomTraits.characterId.notNull).toBe(true);
    expect(characterCustomTraits.traitId.notNull).toBe(true);
    expect(characterCustomTraits.sourceOrigin.notNull).toBe(true);
  });

  it("defines inventory table with defaults and constraints", () => {
    expect(characterInventory.id.notNull).toBe(true);
    expect(characterInventory.characterId.notNull).toBe(true);
    expect(characterInventory.itemId.notNull).toBe(true);
    expect(characterInventory.quantity.notNull).toBe(true);
    expect(characterInventory.quantity.default).toBe(1);
    expect(characterInventory.slot.default).toBe("backpack");
    expect(characterInventory.isAttuned.default).toBe(false);
  });

  it("exposes all supported equipment slots", () => {
    expect(EQUIPMENT_SLOTS).toEqual([
      "backpack",
      "head",
      "amulet",
      "cloak",
      "body",
      "main_hand",
      "off_hand",
      "gloves",
      "ring_1",
      "ring_2",
      "boots",
    ]);
  });

  /**
   * These were once two hand-maintained lists and they drifted: this one
   * called the body slot "armor" and had no "body" at all, which is what made
   * every armour equip fail server-side while the client considered it legal.
   */
  it("stays in step with the slot vocabulary the client authors against", () => {
    expect(EQUIPMENT_SLOTS).toEqual(CharacterSlotSchema.options);
  });
});
