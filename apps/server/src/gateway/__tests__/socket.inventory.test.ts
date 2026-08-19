import { afterEach, describe, expect, it } from "vitest";
import { SOCKET_EVENTS } from "@project/shared";
import {
  characterInventory,
  characterResources,
  characters,
} from "@project/database/src/schema/operational.js";
import { renderSql } from "./fakeDb.js";
import {
  characterRow,
  joinCampaign,
  setupGateway,
  type GatewayHarness,
} from "./socketHarness.js";

const ROOM = "campaign_camp-1";

describe("socket gateway - ITEM_EQUIPPED", () => {
  let harness: GatewayHarness;

  afterEach(() => {
    harness?.restore();
  });

  const equipPayload = (overrides: Record<string, unknown> = {}) => ({
    characterId: "char-1",
    inventoryId: "inv-1",
    targetSlot: "main_hand",
    ...overrides,
  });

  const readyToEquip = async (
    itemRow: Record<string, unknown> = {
      itemId: "item_weapon_longsword",
      itemRule: { type: "weapon" },
    },
  ) => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterInventory, [itemRow]);
  };

  it("sweeps the contended slot to the backpack before committing the new slot", async () => {
    await readyToEquip();

    await harness.emit(SOCKET_EVENTS.ITEM_EQUIPPED, equipPayload());

    const updates = harness.db.opsFor(characterInventory, "update");
    expect(updates).toHaveLength(2);
    // Order is the whole point: committing first would leave two items in one
    // slot for the width of the transaction.
    expect(updates[0]?.set).toEqual({ slot: "backpack" });
    expect(updates[1]?.set).toEqual({ slot: "main_hand" });
    expect(updates.every((op) => op.inTransaction)).toBe(true);
  });

  it("scopes the sweep to the acting character", async () => {
    await readyToEquip();

    await harness.emit(SOCKET_EVENTS.ITEM_EQUIPPED, equipPayload());

    // Without the character_id predicate the sweep would unequip that slot for
    // every character in the database.
    const [sweep] = harness.db.opsFor(characterInventory, "update");
    expect(renderSql(sweep?.where).sql).toContain(
      '"character_inventory"."character_id"',
    );
  });

  it("skips the sweep when moving an item back to the backpack", async () => {
    await readyToEquip();

    await harness.emit(
      SOCKET_EVENTS.ITEM_EQUIPPED,
      equipPayload({ targetSlot: "backpack" }),
    );

    const updates = harness.db.opsFor(characterInventory, "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.set).toEqual({ slot: "backpack" });
  });

  it("broadcasts the change to the room excluding the sender", async () => {
    await readyToEquip();
    const payload = equipPayload();

    await harness.emit(SOCKET_EVENTS.ITEM_EQUIPPED, payload);

    expect(harness.roomEmits).toEqual([
      {
        room: ROOM,
        event: SOCKET_EVENTS.ITEM_EQUIPPED,
        payload: { actorId: harness.socket.id, data: payload },
      },
    ]);
    expect(harness.senderEmits).toEqual([]);
  });

  it("rejects a slot name that is not a real equipment slot", async () => {
    await readyToEquip();
    const payload = equipPayload({ targetSlot: "hat" });

    await harness.emit(SOCKET_EVENTS.ITEM_EQUIPPED, payload);

    expect(harness.senderEmits).toEqual([
      {
        event: "action_error",
        payload: {
          event: SOCKET_EVENTS.ITEM_EQUIPPED,
          error: "Slot contention failure. Rolling back state.",
          payload,
        },
      },
    ]);
    expect(harness.db.opsFor(characterInventory, "update")).toEqual([]);
    expect(harness.roomEmits).toEqual([]);
  });

  it("rejects a weapon aimed at the armor slot", async () => {
    await readyToEquip();

    await harness.emit(
      SOCKET_EVENTS.ITEM_EQUIPPED,
      equipPayload({ targetSlot: "armor" }),
    );

    expect(harness.senderEmits[0]?.event).toBe("action_error");
    expect(harness.db.opsFor(characterInventory, "update")).toEqual([]);
  });

  it("routes a shield to the off hand and refuses it in the armor slot", async () => {
    await readyToEquip({
      itemId: "item_armor_shield",
      itemRule: { type: "armor" },
    });

    await harness.emit(
      SOCKET_EVENTS.ITEM_EQUIPPED,
      equipPayload({ targetSlot: "off_hand" }),
    );
    expect(harness.senderEmits).toEqual([]);
    expect(harness.db.opsFor(characterInventory, "update")).toHaveLength(2);

    await harness.emit(
      SOCKET_EVENTS.ITEM_EQUIPPED,
      equipPayload({ targetSlot: "armor" }),
    );
    expect(harness.senderEmits[0]?.event).toBe("action_error");
  });

  it("infers the item type from the id prefix when itemRule carries none", async () => {
    await readyToEquip({ itemId: "item_weapon_dagger", itemRule: null });

    await harness.emit(SOCKET_EVENTS.ITEM_EQUIPPED, equipPayload());

    expect(harness.senderEmits).toEqual([]);
    expect(harness.db.opsFor(characterInventory, "update")).toHaveLength(2);
  });

  it("rejects an inventory row that does not belong to the character", async () => {
    await readyToEquip();
    harness.db.seed(characterInventory, []);

    await harness.emit(SOCKET_EVENTS.ITEM_EQUIPPED, equipPayload());

    expect(harness.senderEmits[0]?.event).toBe("action_error");
    expect(harness.db.opsFor(characterInventory, "update")).toEqual([]);
  });

  /**
   * Characterisation. EQUIPMENT_SLOTS advertises head/cloak/boots/gloves/rings
   * and amulet, but isValidTargetSlotForItem only ever returns true for
   * backpack, the two hands and armor - so those six slots are unreachable for
   * every item type. Recorded so the limitation is visible rather than
   * discovered by a player.
   */
  it("cannot equip anything to head, cloak, boots, gloves, rings or amulet", async () => {
    for (const slot of [
      "head",
      "cloak",
      "boots",
      "gloves",
      "ring_1",
      "ring_2",
      "amulet",
    ]) {
      await readyToEquip({
        itemId: "item_armor_helm",
        itemRule: { type: "armor" },
      });

      await harness.emit(
        SOCKET_EVENTS.ITEM_EQUIPPED,
        equipPayload({ targetSlot: slot }),
      );

      expect(harness.senderEmits[0]?.event, `slot ${slot}`).toBe(
        "action_error",
      );
      harness.restore();
    }
  });
});

describe("socket gateway - ITEM_CONSUMED", () => {
  let harness: GatewayHarness;

  afterEach(() => {
    harness?.restore();
  });

  const consumePayload = (overrides: Record<string, unknown> = {}) => ({
    characterId: "char-1",
    inventoryId: "inv-1",
    amount: 1,
    ...overrides,
  });

  const readyToConsume = async (quantity: number) => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterInventory, [{ quantity }]);
  };

  it("decrements atomically while stock remains", async () => {
    await readyToConsume(3);

    await harness.emit(SOCKET_EVENTS.ITEM_CONSUMED, consumePayload({ amount: 2 }));

    const updates = harness.db.opsFor(characterInventory, "update");
    expect(updates).toHaveLength(1);
    expect(renderSql(updates[0]?.set?.["quantity"])).toEqual({
      sql: '"character_inventory"."quantity" - $1',
      params: [2],
    });
    expect(harness.db.opsFor(characterInventory, "delete")).toEqual([]);
  });

  it("deletes the row when the last one is consumed", async () => {
    await readyToConsume(1);

    await harness.emit(SOCKET_EVENTS.ITEM_CONSUMED, consumePayload({ amount: 1 }));

    expect(harness.db.opsFor(characterInventory, "delete")).toHaveLength(1);
    expect(harness.db.opsFor(characterInventory, "update")).toEqual([]);
  });

  it("deletes rather than going negative when the amount overdraws", async () => {
    await readyToConsume(1);

    await harness.emit(SOCKET_EVENTS.ITEM_CONSUMED, consumePayload({ amount: 5 }));

    expect(harness.db.opsFor(characterInventory, "delete")).toHaveLength(1);
    expect(harness.db.opsFor(characterInventory, "update")).toEqual([]);
  });

  it("broadcasts to the room excluding the sender", async () => {
    await readyToConsume(3);
    const payload = consumePayload();

    await harness.emit(SOCKET_EVENTS.ITEM_CONSUMED, payload);

    expect(harness.roomEmits).toEqual([
      {
        room: ROOM,
        event: SOCKET_EVENTS.ITEM_CONSUMED,
        payload: { actorId: harness.socket.id, data: payload },
      },
    ]);
  });

  it("reports an error and writes nothing when the item is not the character's", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterInventory, []);
    const payload = consumePayload();

    await harness.emit(SOCKET_EVENTS.ITEM_CONSUMED, payload);

    expect(harness.senderEmits).toEqual([
      {
        event: "action_error",
        payload: {
          event: SOCKET_EVENTS.ITEM_CONSUMED,
          error: "Inventory sync failure. Rolling back state.",
          payload,
        },
      },
    ]);
    expect(harness.db.opsFor(characterInventory, "delete")).toEqual([]);
    expect(harness.db.opsFor(characterInventory, "update")).toEqual([]);
    expect(harness.roomEmits).toEqual([]);
  });
});

describe("socket gateway - RESOURCE_CONSUMED", () => {
  let harness: GatewayHarness;

  afterEach(() => {
    harness?.restore();
  });

  const payload = {
    characterId: "char-1",
    resourceId: "res-1",
    amount: 2,
  };

  const ready = async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
  };

  it("clamps at zero in SQL rather than trusting the client", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.RESOURCE_CONSUMED, payload);

    const updates = harness.db.opsFor(characterResources, "update");
    expect(updates).toHaveLength(1);
    expect(renderSql(updates[0]?.set?.["current"])).toEqual({
      sql: 'GREATEST("character_resources"."current" - $1, 0)',
      params: [2],
    });
  });

  it("scopes the decrement to the acting character", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.RESOURCE_CONSUMED, payload);

    const [update] = harness.db.opsFor(characterResources, "update");
    expect(renderSql(update?.where).sql).toContain(
      '"character_resources"."character_id"',
    );
  });

  it("broadcasts to the room excluding the sender", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.RESOURCE_CONSUMED, payload);

    expect(harness.roomEmits).toEqual([
      {
        room: ROOM,
        event: SOCKET_EVENTS.RESOURCE_CONSUMED,
        payload: { actorId: harness.socket.id, data: payload },
      },
    ]);
  });

  it("reports an error and does not broadcast when the write fails", async () => {
    await ready();
    harness.db.failOn(characterResources, "update", new Error("deadlock"));

    await harness.emit(SOCKET_EVENTS.RESOURCE_CONSUMED, payload);

    expect(harness.roomEmits).toEqual([]);
    expect(harness.senderEmits).toEqual([
      {
        event: "action_error",
        payload: {
          event: SOCKET_EVENTS.RESOURCE_CONSUMED,
          error: "Resource async failure. Rolling back state.",
          payload,
        },
      },
    ]);
  });
});

describe("socket gateway - REST_COMPLETED", () => {
  let harness: GatewayHarness;

  afterEach(() => {
    harness?.restore();
  });

  const ready = async (resources: Record<string, unknown>[] = []) => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterResources, resources);
  };

  it("resets hp to the character's own max column on a long rest", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.REST_COMPLETED, {
      characterId: "char-1",
      restType: "long",
    });

    const updates = harness.db.opsFor(characters, "update");
    expect(updates).toHaveLength(1);
    // Column-to-column, so the server never has to know the computed max.
    expect(renderSql(updates[0]?.set?.["currentHp"]).sql).toBe(
      '"characters"."max_hp"',
    );
  });

  it("leaves hp alone on a short rest", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.REST_COMPLETED, {
      characterId: "char-1",
      restType: "short",
    });

    expect(harness.db.opsFor(characters, "update")).toEqual([]);
  });

  it("broadcasts to the room excluding the sender", async () => {
    await ready();
    const payload = { characterId: "char-1", restType: "long" as const };

    await harness.emit(SOCKET_EVENTS.REST_COMPLETED, payload);

    expect(harness.roomEmits).toEqual([
      {
        room: ROOM,
        event: SOCKET_EVENTS.REST_COMPLETED,
        payload: { actorId: harness.socket.id, data: payload },
      },
    ]);
  });

  it("writes nothing for a resource whose value the rest did not change", async () => {
    await ready([{ id: "res-unknown", current: 1, characterId: "char-1" }]);

    await harness.emit(SOCKET_EVENTS.REST_COMPLETED, {
      characterId: "char-1",
      restType: "short",
    });

    // No rule behind the id, so applyRest returns it untouched and the
    // handler's change check correctly skips the write.
    expect(harness.db.opsFor(characterResources, "update")).toEqual([]);
  });

  /**
   * DEFECT, characterised rather than endorsed.
   *
   * socket.ts calls RestEngine.applyRest(resources, restType, 1, {}) - the
   * total level is hardcoded to 1 and the class ledger is passed empty. Every
   * resource in RESOURCE_DICTIONARY sizes itself with class_level_thresholds,
   * so an empty ledger resolves their maximum to 0, and a "restore to max"
   * reset writes 0.
   *
   * The player-visible effect is that a short rest *drains* Second Wind and
   * Action Surge instead of restoring them.
   *
   * The data to fix it is already at hand: getAuthoritativeRuntimeContext
   * reads character_classes a few lines away. Until that is threaded through,
   * this test pins the broken behaviour so the fix has something to flip.
   */
  it("zeroes a fighter's short-rest resources because class levels are hardcoded empty", async () => {
    await ready([
      { id: "trait_second_wind", current: 1, characterId: "char-1" },
    ]);

    await harness.emit(SOCKET_EVENTS.REST_COMPLETED, {
      characterId: "char-1",
      restType: "short",
    });

    const updates = harness.db.opsFor(characterResources, "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.set).toEqual({ current: 0 });
  });

  it("reports an error and does not broadcast when the rest transaction fails", async () => {
    await ready();
    harness.db.failNextTransaction(new Error("rest failed"));
    const payload = { characterId: "char-1", restType: "long" as const };

    await harness.emit(SOCKET_EVENTS.REST_COMPLETED, payload);

    expect(harness.roomEmits).toEqual([]);
    expect(harness.senderEmits).toEqual([
      {
        event: "action_error",
        payload: {
          event: SOCKET_EVENTS.REST_COMPLETED,
          error: "Rest async failure. Rolling back state.",
          payload,
        },
      },
    ]);
  });
});
