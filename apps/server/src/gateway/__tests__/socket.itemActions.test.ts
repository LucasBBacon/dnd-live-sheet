import { afterEach, describe, expect, it } from "vitest";
import { SOCKET_EVENTS, type ActionResolvedPayload } from "@project/shared";
import {
  characterClasses,
  characterInventory,
  characters,
} from "@project/database/src/schema/operational.js";
import { renderSql } from "./fakeDb.js";
import {
  characterRow,
  inventoryRow,
  joinCampaign,
  setupGateway,
  type GatewayHarness,
} from "./socketHarness.js";

const ROOM = "campaign_camp-1";

/**
 * ACTION_INTENT with source: "item" - an action found on a carried inventory
 * stack rather than on the live sheet's action list. This is what wires the
 * server's first InventoryLedger: item actions resolve, spend the stack that
 * granted them, and persist the spend, all through the same intent event the
 * character and actor sources already use.
 */
describe("socket gateway - ACTION_INTENT (item source)", () => {
  let harness: GatewayHarness;
  let requestCounter = 0;

  afterEach(() => {
    harness?.restore();
  });

  const ready = async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterClasses, [
      { classId: "class_fighter", classLevel: 3 },
    ]);
    harness.db.seed(characterInventory, [
      inventoryRow({ id: "inv-vial", itemId: "item_acid_vial", quantity: 2 }),
      inventoryRow({
        id: "inv-caltrops",
        itemId: "item_caltrops_bag",
        quantity: 1,
      }),
      inventoryRow({
        id: "inv-fire",
        itemId: "item_alchemists_fire_flask",
        quantity: 1,
      }),
    ]);
  };

  /** The `data` half of the last authoritative broadcast. */
  const lastResolved = (h: GatewayHarness): ActionResolvedPayload | undefined =>
    (h.ioEmits.at(-1)?.payload as { data: ActionResolvedPayload } | undefined)
      ?.data;

  /**
   * Fires ACTION_INTENT and hands back what the client would adopt.
   *
   * An intent that is well formed but cannot be executed (character-not-found,
   * action-not-found) still resolves and broadcasts. One that is malformed at
   * the transport level (an item source with no instanceId) throws inside the
   * handler instead, which rolls back rather than resolving - so this reports
   * that case the same way a resolved "did not execute" would look, since
   * that is the distinction every one of these tests actually cares about.
   */
  const emitIntent = async (
    overrides: Record<string, unknown>,
  ): Promise<ActionResolvedPayload> => {
    requestCounter += 1;
    const before = harness.ioEmits.length;

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, {
      characterId: "char-1",
      requestId: `req-item-${requestCounter}`,
      source: "item",
      ...overrides,
    });

    if (harness.ioEmits.length > before) {
      return lastResolved(harness) as ActionResolvedPayload;
    }

    return { executed: false } as ActionResolvedPayload;
  };

  it("resolves an item action against the instance it was pressed on", async () => {
    await ready();

    const resolved = await emitIntent({
      actionId: "action_acid_vial_throw",
      instanceId: "inv-vial",
    });

    expect(resolved.executed).toBe(true);
    expect(resolved.rollResults.length).toBeGreaterThan(0);
  });

  it("carries a table note back to the client", async () => {
    await ready();

    const resolved = await emitIntent({
      actionId: "action_caltrops_bag_spread",
      instanceId: "inv-caltrops",
    });

    expect(resolved.notes?.[0]).toContain("DC 15");
  });

  // The spec calls this the proof of the whole design: one action that both
  // rolls and does not, reaching the player as both halves rather than having
  // either disguised as the other.
  it("returns both halves of a half-run rule", async () => {
    await ready();

    const resolved = await emitIntent({
      actionId: "action_alchemists_fire_flask_throw",
      instanceId: "inv-fire",
    });

    expect(resolved.executed).toBe(true);
    expect(resolved.rollResults.length).toBeGreaterThan(0);
    expect(resolved.notes?.[0]).toContain("DC 10 Dexterity");
  });

  it("refuses an item intent with no instance", async () => {
    await ready();

    const resolved = await emitIntent({
      actionId: "action_acid_vial_throw",
    });

    expect(resolved.executed).toBe(false);
  });

  it("spends the item, and persists the spend", async () => {
    await ready();

    await emitIntent({
      actionId: "action_acid_vial_throw",
      instanceId: "inv-vial",
    });

    // The fake db records statements rather than mutating seeded rows, so the
    // persisted spend is asserted the same way the ITEM_CONSUMED suite does:
    // at the statement level, against the exact atomic expression written.
    const updates = harness.db.opsFor(characterInventory, "update");
    expect(updates).toHaveLength(1);
    expect(renderSql(updates[0]?.set?.["quantity"])).toEqual({
      sql: '"character_inventory"."quantity" - $1',
      params: [1],
    });
    expect(harness.db.opsFor(characterInventory, "delete")).toEqual([]);
  });

  it("deletes the row instead of leaving a zero stack when the last one is spent", async () => {
    await ready();
    harness.db.seed(characterInventory, [
      inventoryRow({ id: "inv-vial", itemId: "item_acid_vial", quantity: 1 }),
    ]);

    await emitIntent({
      actionId: "action_acid_vial_throw",
      instanceId: "inv-vial",
    });

    expect(harness.db.opsFor(characterInventory, "delete")).toHaveLength(1);
    expect(harness.db.opsFor(characterInventory, "update")).toEqual([]);
  });

  it("broadcasts the spend to the room the same way ITEM_CONSUMED does", async () => {
    await ready();

    await emitIntent({
      actionId: "action_acid_vial_throw",
      instanceId: "inv-vial",
    });

    const consumedEmit = harness.ioEmits.find(
      (emit) => emit.event === SOCKET_EVENTS.ITEM_CONSUMED,
    );
    expect(consumedEmit).toMatchObject({
      room: ROOM,
      event: SOCKET_EVENTS.ITEM_CONSUMED,
      payload: {
        characterId: "char-1",
        inventoryId: "inv-vial",
        amount: 1,
      },
    });
  });

  it("does not spend anything when the instance does not carry the action", async () => {
    await ready();

    const resolved = await emitIntent({
      actionId: "action_caltrops_bag_spread",
      // The acid vial does not grant Spread Caltrops, so this must not fall
      // back to some other action found on the instance.
      instanceId: "inv-vial",
    });

    expect(resolved.executed).toBe(false);
    expect(harness.db.opsFor(characterInventory, "update")).toEqual([]);
    expect(harness.db.opsFor(characterInventory, "delete")).toEqual([]);
  });

  it("applies a positive HP delta and broadcasts it when the item action heals", async () => {
    await ready();
    // re-seed the character close to the derived cap so every possible roll
    // clamps to the same deterministic number (#78): the clamp is the
    // derived maximum, not the stored maxHp column, so it no longer sits at
    // characterRow()'s low 24. ready() seeds class_fighter level 3, and
    // race_dwarf grants CON +2 regardless of subrace (14 -> 16, +3;
    // characterRow()'s subraceId does not match a real pack subrace, so
    // Dwarven Toughness never applies): 24 + 3 x 3 = 33.
    harness.db.seed(characters, [characterRow({ currentHp: 31 })]);
    harness.db.seed(characterInventory, [
      inventoryRow({
        id: "inv-potion",
        itemId: "item_potion_of_healing",
        quantity: 1,
      }),
    ]);

    const resolved = await emitIntent({
      actionId: "action_potion_of_healing_drink",
      instanceId: "inv-potion",
    });

    expect(resolved.executed).toBe(true);
    expect(resolved.rollResults).toHaveLength(1);
    // labeled, so the sheet stops rendering healing under the damage heading
    expect(resolved.rollResults[0]?.label).toBe("Healing");

    // currentHp 31, derived max 33. 2d4+2 spans 4..10, and even the minimum
    // roll already reaches the cap, so the clamped result on both the write
    // and the broadcast is deterministic regardless of the roll.
    const hpUpdates = harness.db.opsFor(characters, "update");
    expect(hpUpdates).toHaveLength(1);
    expect(hpUpdates[0]?.set?.["currentHp"]).toBe(33);

    const hpEmit = harness.ioEmits.find(
      (emit) => emit.event === SOCKET_EVENTS.HP_MODIFIED,
    );
    expect(hpEmit).toMatchObject({
      room: ROOM,
      event: SOCKET_EVENTS.HP_MODIFIED,
      payload: {
        actorId: harness.socket.id,
        data: {
          characterId: "char-1",
          source: "Drink Potion of Healing",
        },
      },
    });

    const delta = (hpEmit?.payload as { data: { delta: number } }).data.delta;
    expect(delta).toBeGreaterThan(0);
  });

  it("broadcasts only the deductions the database actually wrote", async () => {
    await ready();
    // The first read is resolution's own inventory fetch, which has to see
    // the real row or the action cannot be found at all. The second is
    // flushInventoryLedger's own check before it writes - forcing that one
    // empty simulates the row having vanished between resolution and
    // persistence, the same case inventoryLedgerService's `continue` handles.
    harness.db.queue(characterInventory, [
      [inventoryRow({ id: "inv-vial", itemId: "item_acid_vial", quantity: 2 })],
      [],
    ]);

    await emitIntent({
      actionId: "action_acid_vial_throw",
      instanceId: "inv-vial",
    });

    // The database never touched this row, so the client must not be told to
    // delete it from the carried stack.
    expect(
      harness.ioEmits.filter(
        (emit) => emit.event === SOCKET_EVENTS.ITEM_CONSUMED,
      ),
    ).toEqual([]);
  });

  it("evicts the cached runtime when persisting a resolved action throws, so a retry rebuilds from the database", async () => {
    await ready();
    harness.db.seed(characterInventory, [
      inventoryRow({
        id: "inv-antitoxin",
        itemId: "item_antitoxin_vial",
        quantity: 1,
      }),
    ]);
    harness.db.failOn(characterInventory, "delete", new Error("disk full"));

    await emitIntent({
      actionId: "action_antitoxin_vial_drink",
      instanceId: "inv-antitoxin",
    });

    // A flush failure rolls back to the sender rather than resolving.
    expect(harness.senderEmits.at(-1)?.event).toBe("error:rollback");

    // ActionResolver.execute already added the Antitoxin effect to the
    // long-lived effectManager before the flush threw. A fresh, unrelated
    // action for the same character must not carry it forward - if the
    // cached runtime had survived the failure, it would.
    const resolved = await emitIntent({
      actionId: "action_dodge",
      source: "character",
    });

    expect(
      resolved.effects?.some((effect) => effect.sourceName === "Antitoxin"),
    ).toBe(false);
  });
});
