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
 * ACTION_INTENT for a weapon that spends ammunition.
 *
 * The resolver takes the ammunition choice as input and validates the chosen
 * stack against its pack definition, so a shot only leaves the bow when the
 * gateway supplies both: a pick, and the snapshot the pick is checked against.
 * Missing either one refuses the shot outright - `ammo_not_selected` without a
 * pick, `wrong_ammo` without the snapshot - which is what these cover.
 */
describe("socket gateway - ACTION_INTENT (ammunition)", () => {
  let harness: GatewayHarness;
  let requestCounter = 0;

  afterEach(() => {
    harness?.restore();
  });

  const bow = () =>
    inventoryRow({
      id: "inv-bow",
      itemId: "item_weapon_longbow",
      slot: "main_hand",
    });

  /** Seeds the character, then whatever quiver the test wants beside the bow. */
  const ready = async (...ammo: Array<Record<string, unknown>>) => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterClasses, [
      { classId: "class_fighter", classLevel: 3 },
    ]);
    harness.db.seed(characterInventory, [bow(), ...ammo]);
  };

  const arrows = (overrides: Record<string, unknown> = {}) =>
    inventoryRow({
      id: "inv-arrows",
      itemId: "item_ammo_arrow",
      quantity: 20,
      ...overrides,
    });

  /** The `data` half of the last authoritative broadcast. */
  const lastResolved = (h: GatewayHarness): ActionResolvedPayload | undefined =>
    (h.ioEmits.at(-1)?.payload as { data: ActionResolvedPayload } | undefined)
      ?.data;

  const shoot = async (): Promise<ActionResolvedPayload> => {
    requestCounter += 1;
    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, {
      characterId: "char-1",
      requestId: `req-ammo-${requestCounter}`,
      actionId: "action_weapon_item_weapon_longbow",
      source: "character",
    });

    return lastResolved(harness) as ActionResolvedPayload;
  };

  it("fires a bow the character carries arrows for", async () => {
    await ready(arrows());

    const resolved = await shoot();

    expect(resolved).toMatchObject({ executed: true });
    expect(resolved.rollResults?.length).toBeGreaterThan(0);
  });

  // The gateway picks by ammo tag rather than by the bow's ammoItemId, so the
  // magic quiver feeds the longbow the same way the plain one does. This is
  // also the case that proves the snapshot is reaching settleCosts: the tag
  // lives on the pack definition, and an unresolved definition fails closed.
  it("accepts a quiver of +1 arrows the bow does not name outright", async () => {
    await ready(
      arrows({ id: "inv-magic", itemId: "item_ammo_arrow_plus_one" }),
    );

    expect(await shoot()).toMatchObject({ executed: true });
  });

  it("spends one arrow, and persists the spend", async () => {
    await ready(arrows());
    // Two reads happen per shot: resolution's own inventory fetch, then
    // flushInventoryLedger's check before it writes. The fake db answers a read
    // with every seeded row for the table rather than applying the `where`, so
    // the second is queued explicitly - left to the seed it would hand the
    // flush the bow's row, and a full quiver would look like a last arrow.
    harness.db.queue(characterInventory, [[bow(), arrows()], [arrows()]]);

    await shoot();

    // The fake db records statements rather than mutating seeded rows, so the
    // spend is asserted at the statement level against the exact atomic
    // expression written - the same way the item-action suite does it.
    const updates = harness.db.opsFor(characterInventory, "update");
    expect(updates).toHaveLength(1);
    expect(renderSql(updates[0]?.set?.["quantity"])).toEqual({
      sql: '"character_inventory"."quantity" - $1',
      params: [1],
    });
  });

  it("broadcasts the spent arrow to the room", async () => {
    await ready(arrows());

    await shoot();

    expect(
      harness.ioEmits.find(
        (emit) => emit.event === SOCKET_EVENTS.ITEM_CONSUMED,
      ),
    ).toMatchObject({
      room: ROOM,
      event: SOCKET_EVENTS.ITEM_CONSUMED,
      payload: {
        characterId: "char-1",
        inventoryId: "inv-arrows",
        amount: 1,
      },
    });
  });

  it("leaves the last arrow's row swept rather than at zero", async () => {
    await ready(arrows({ quantity: 1 }));
    // Queued for the same reason as the spend above.
    harness.db.queue(characterInventory, [
      [bow(), arrows({ quantity: 1 })],
      [arrows({ quantity: 1 })],
    ]);

    await shoot();

    expect(harness.db.opsFor(characterInventory, "delete")).toHaveLength(1);
    expect(harness.db.opsFor(characterInventory, "update")).toEqual([]);
  });

  it("refuses the shot, and spends nothing, when the quiver is empty", async () => {
    await ready();

    const resolved = await shoot();

    expect(resolved).toMatchObject({
      executed: false,
      reason: "ammo_not_selected",
    });
    expect(harness.db.opsFor(characterInventory, "update")).toEqual([]);
    expect(harness.db.opsFor(characterInventory, "delete")).toEqual([]);
  });

  // A bolt is ammunition, but not ammunition a longbow fires. The pick has to
  // fail to find one rather than settle for the nearest stack.
  it("does not draw from a quiver the bow cannot fire", async () => {
    await ready(arrows({ id: "inv-bolts", itemId: "item_ammo_bolt" }));

    expect(await shoot()).toMatchObject({
      executed: false,
      reason: "ammo_not_selected",
    });
    expect(harness.db.opsFor(characterInventory, "update")).toEqual([]);
  });

  it("spends no ammunition for a weapon that needs none", async () => {
    await ready(arrows());
    harness.db.seed(characterInventory, [
      inventoryRow({ id: "inv-sword", slot: "main_hand" }),
      arrows(),
    ]);

    requestCounter += 1;
    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, {
      characterId: "char-1",
      requestId: `req-ammo-${requestCounter}`,
      actionId: "action_weapon_item_weapon_longsword",
      source: "character",
    });

    expect(lastResolved(harness)).toMatchObject({ executed: true });
    expect(harness.db.opsFor(characterInventory, "update")).toEqual([]);
    expect(harness.db.opsFor(characterInventory, "delete")).toEqual([]);
  });
});
