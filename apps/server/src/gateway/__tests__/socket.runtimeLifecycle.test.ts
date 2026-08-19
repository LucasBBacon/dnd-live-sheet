import { afterEach, describe, expect, it, vi } from "vitest";
import { SOCKET_EVENTS } from "@project/shared";
import {
  characterClasses,
  characterInventory,
  characters,
} from "@project/database/src/schema/operational.js";
import {
  characterRow,
  joinCampaign,
  setupGateway,
  type GatewayHarness,
} from "./socketHarness.js";

/**
 * The gateway keeps authoritative runtime in a module-level Map keyed by
 * character. That is the right call - the alternative is a client-owned copy
 * that the next sync overwrites - but a process-lifetime map needs both a
 * bound and an expiry, and neither is exercised by ordinary play.
 */
describe("socket gateway - runtime lifecycle", () => {
  let harness: GatewayHarness;

  afterEach(() => {
    vi.useRealTimers();
    harness?.restore();
  });

  const intent = (overrides: Record<string, unknown> = {}) => ({
    characterId: "char-1",
    requestId: "req-1",
    actionId: "action_dodge",
    source: "character",
    ...overrides,
  });

  const ready = async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterClasses, [
      { classId: "class_fighter", classLevel: 3 },
    ]);
    harness.db.seed(characterInventory, []);
  };

  const lastResolved = (h: GatewayHarness) =>
    (h.ioEmits.at(-1)?.payload as { data: Record<string, unknown> }).data;

  it("acknowledges a disconnect without throwing", async () => {
    harness = await setupGateway();

    await expect(harness.emit("disconnect")).resolves.toBeUndefined();
  });

  it("discards a character's runtime once it has gone idle past the TTL", async () => {
    vi.useFakeTimers();
    await ready();

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());
    expect(lastResolved(harness)["effects"]).toHaveLength(1);

    // The TTL is 45 minutes and pruning is triggered by the next intent, so
    // another character has to act for char-1's runtime to be swept.
    vi.setSystemTime(Date.now() + 46 * 60 * 1000);
    await harness.emit(
      SOCKET_EVENTS.ACTION_INTENT,
      intent({ characterId: "char-2", requestId: "req-2" }),
    );

    await harness.emit(
      SOCKET_EVENTS.ACTION_INTENT,
      intent({ requestId: "req-3" }),
    );

    // Effect count, not state names: activeStates dedupes, so a surviving
    // runtime and a rebuilt one would look identical there. A runtime that
    // was never pruned would be carrying two stacked Dodge effects by now.
    expect(lastResolved(harness)["effects"]).toHaveLength(1);
  });

  it("keeps a runtime that is still being used", async () => {
    vi.useFakeTimers();
    await ready();

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());

    // Well inside the TTL.
    vi.setSystemTime(Date.now() + 10 * 60 * 1000);
    await harness.emit(
      SOCKET_EVENTS.ACTION_INTENT,
      intent({ requestId: "req-2", actionId: "action_dash" }),
    );

    expect(lastResolved(harness)["activeStates"]).toEqual(
      expect.arrayContaining(["status_dodging", "status_dashing"]),
    );
  });

  it("evicts the oldest cached response once the request cache is full", async () => {
    await ready();

    // The cache trims when it grows past 200, so the 201st request is what
    // pushes the first one out.
    for (let index = 0; index < 201; index += 1) {
      await harness.emit(
        SOCKET_EVENTS.ACTION_INTENT,
        intent({ requestId: `req-${index}`, actionId: "action_missing" }),
      );
    }
    expect(harness.ioEmits).toHaveLength(201);
    harness.senderEmits.length = 0;

    // req-0 was evicted, so this re-resolves and broadcasts instead of
    // replaying to the sender.
    await harness.emit(
      SOCKET_EVENTS.ACTION_INTENT,
      intent({ requestId: "req-0", actionId: "action_missing" }),
    );
    expect(harness.senderEmits).toEqual([]);
    expect(harness.ioEmits).toHaveLength(202);

    // A recent one is still cached and replays to the sender alone.
    await harness.emit(
      SOCKET_EVENTS.ACTION_INTENT,
      intent({ requestId: "req-200", actionId: "action_missing" }),
    );
    expect(harness.senderEmits).toHaveLength(1);
    expect(harness.ioEmits).toHaveLength(202);
  });
});

/**
 * Item type is normally carried on items.item_rule. When that column is null
 * the gateway falls back to reading the id prefix, which decides which slots
 * the item is allowed into - so the fallback is a permission check, not a
 * cosmetic default.
 */
describe("socket gateway - item type inference fallback", () => {
  let harness: GatewayHarness;

  afterEach(() => {
    harness?.restore();
  });

  const equip = async (
    itemId: string,
    targetSlot: string,
  ): Promise<GatewayHarness> => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterInventory, [{ itemId, itemRule: null }]);

    await harness.emit(SOCKET_EVENTS.ITEM_EQUIPPED, {
      characterId: "char-1",
      inventoryId: "inv-1",
      targetSlot,
    });

    return harness;
  };

  it("treats an item_armor_ prefix as armor", async () => {
    const h = await equip("item_armor_breastplate", "armor");

    expect(h.senderEmits).toEqual([]);
    expect(h.db.opsFor(characterInventory, "update")).toHaveLength(2);
  });

  it("refuses armor in a weapon hand", async () => {
    const h = await equip("item_armor_breastplate", "main_hand");

    expect(h.senderEmits[0]?.event).toBe("action_error");
  });

  it("treats an unprefixed id as gear, which only the backpack accepts", async () => {
    const h = await equip("item_rope_hempen", "backpack");

    expect(h.senderEmits).toEqual([]);
    expect(h.db.opsFor(characterInventory, "update")).toHaveLength(1);
  });

  it("refuses gear in an equipment slot", async () => {
    const h = await equip("item_rope_hempen", "main_hand");

    expect(h.senderEmits[0]?.event).toBe("action_error");
  });
});
