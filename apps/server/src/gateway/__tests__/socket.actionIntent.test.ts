import { afterEach, describe, expect, it } from "vitest";
import { SOCKET_EVENTS } from "@project/shared";
import {
  characterClasses,
  characterInventory,
  characterResources,
  characterTraits,
  characters,
} from "@project/database/src/schema/operational.js";
import {
  characterRow,
  joinCampaign,
  setupGateway,
  type GatewayHarness,
} from "./socketHarness.js";

const ROOM = "campaign_camp-1";

/**
 * The authoritative handler. Unlike the relay handlers this one owns state:
 * the effect, resource and combat-context managers for a character live in a
 * module-level map and are reused across events. Most of what is worth
 * asserting here is about that ownership.
 *
 * The engine runs for real, so the action ids below (Dodge, Dash) are the
 * genuine action-economy grants rather than fixtures.
 */
describe("socket gateway - ACTION_INTENT", () => {
  let harness: GatewayHarness;

  afterEach(() => {
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

  /** The `data` half of the last authoritative broadcast. */
  const lastResolved = (h: GatewayHarness) => {
    const last = h.ioEmits.at(-1);
    return (last?.payload as { actorId: string; data: Record<string, unknown> })
      .data;
  };

  it("broadcasts the resolution to the whole room, sender included", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());

    // io.to, not socket.to: the sender needs the authoritative result too,
    // because unlike an hp tick it could not have computed this itself.
    expect(harness.ioEmits).toHaveLength(1);
    expect(harness.ioEmits[0]?.room).toBe(ROOM);
    expect(harness.ioEmits[0]?.event).toBe(SOCKET_EVENTS.ACTION_RESOLVED);
    expect(harness.roomEmits).toEqual([]);
    expect(harness.senderEmits).toEqual([]);
  });

  it("returns the runtime snapshot the client is expected to adopt", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());
    const resolved = lastResolved(harness);

    expect(resolved).toMatchObject({
      characterId: "char-1",
      requestId: "req-1",
      actionId: "action_dodge",
      source: "character",
      executed: true,
    });
    expect(resolved["activeStates"]).toContain("status_dodging");
    expect(resolved["rollResults"]).toEqual([]);
    expect(resolved["combatContext"]).toMatchObject({
      inCombat: false,
      economy: expect.objectContaining({ actionAvailable: expect.any(Boolean) }),
    });
    expect(typeof resolved["timestamp"]).toBe("number");

    // Every key the client reads has to be present even when empty, or the
    // sheet's sync would treat a missing key as "no change".
    for (const key of [
      "activeStates",
      "resources",
      "effects",
      "actors",
      "combatContext",
      "rollResults",
    ]) {
      expect(resolved, `missing ${key}`).toHaveProperty(key);
    }
  });

  it("seeds runtime pools from the durable table, at their persisted charges", async () => {
    await ready();
    // Action Surge already spent: the table is the truth, and hydrating from
    // trait grants instead would hand it back at full charges.
    harness.db.seed(characterResources, [
      {
        id: "trait_action_surge",
        characterId: "char-1",
        name: "Action Surge",
        current: 0,
        max: 1,
        resetCondition: "short_rest",
      },
    ]);

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());

    // Not an exact array: a level-3 fighter also materialises Second Wind,
    // which this fixture never seeded. That pool is orthogonal to what this
    // test checks - that a persisted, already-spent charge is not reset.
    expect(lastResolved(harness)["resources"]).toContainEqual(
      expect.objectContaining({ id: "trait_action_surge", currentCharges: 0 }),
    );
  });

  it("writes a spent resource back to the durable table", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterClasses, [
      { classId: "class_barbarian", classLevel: 3 },
    ]);
    harness.db.seed(characterInventory, []);
    harness.db.seed(characterResources, [
      {
        id: "resource_barbarian_rage",
        characterId: "char-1",
        name: "Rage",
        current: 2,
        max: 3,
        resetCondition: "long_rest",
      },
    ]);

    await harness.emit(
      SOCKET_EVENTS.ACTION_INTENT,
      intent({ actionId: "action_rage" }),
    );

    expect(lastResolved(harness)).toMatchObject({ executed: true });

    // The runtime manager spending a charge is not enough: without a write the
    // charge returns on the next request, when the table re-seeds the manager.
    const updates = harness.db.opsFor(characterResources, "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.set?.["current"]).toBe(1);
  });

  it("reports an unresolvable action without failing the request", async () => {
    await ready();

    await harness.emit(
      SOCKET_EVENTS.ACTION_INTENT,
      intent({ actionId: "action_does_not_exist" }),
    );

    expect(lastResolved(harness)).toMatchObject({
      executed: false,
      reason: "action_not_found",
    });
    // Still a broadcast, not a rollback - the request was well formed.
    expect(harness.ioEmits).toHaveLength(1);
    expect(harness.senderEmits).toEqual([]);
  });

  it("reuses one authoritative runtime across intents instead of rebuilding it", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());
    await harness.emit(
      SOCKET_EVENTS.ACTION_INTENT,
      intent({ requestId: "req-2", actionId: "action_dash" }),
    );

    // The Dodge state survives into the Dash resolution. A runtime rebuilt per
    // call would have lost it, and the sheet would flicker back and forth.
    const second = lastResolved(harness);
    expect(second["activeStates"]).toEqual(
      expect.arrayContaining(["status_dodging", "status_dashing"]),
    );
  });

  it("shares one runtime between two sockets acting for the same character", async () => {
    await ready();
    const second = harness.connect({ socketId: "socket-b", userId: "user-2" });
    await joinCampaign(harness, "camp-1", second);
    harness.ioEmits.length = 0;

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());
    await second.dispatch(
      SOCKET_EVENTS.ACTION_INTENT,
      intent({ requestId: "req-2", actionId: "action_dash" }),
    );

    // Authoritative means one runtime per character, not per connection.
    expect(lastResolved(harness)["activeStates"]).toEqual(
      expect.arrayContaining(["status_dodging", "status_dashing"]),
    );
  });

  it("keeps separate runtimes for separate characters", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());
    await harness.emit(
      SOCKET_EVENTS.ACTION_INTENT,
      intent({ characterId: "char-2", requestId: "req-2", actionId: "action_dash" }),
    );

    expect(lastResolved(harness)["activeStates"]).not.toContain(
      "status_dodging",
    );
  });

  it("replays a duplicate requestId to the sender without re-broadcasting", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());
    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());

    // A retried request must not apply the action twice for the whole room.
    expect(harness.ioEmits).toHaveLength(1);
    expect(harness.senderEmits).toHaveLength(1);
    expect(harness.senderEmits[0]?.event).toBe(SOCKET_EVENTS.ACTION_RESOLVED);
  });

  it("does not re-run the action on replay", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());
    const afterFirst = lastResolved(harness)["effects"] as unknown[];
    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());

    const replayed = (harness.senderEmits[0]?.payload as { data: Record<string, unknown> }).data;
    // Same effects, not a second stacked Dodge.
    expect(replayed["effects"]).toEqual(afterFirst);
  });

  /**
   * One channel, one shape.
   *
   * The replay used to emit the bare `resolvedPayload` while the fresh path
   * wrapped it, so `character:action_resolved` carried two shapes depending on
   * whether the request was a retry. The client survived that on an unwrap
   * helper, which made the divergence invisible until something read `.data`
   * or `actorId` directly - and then only on a retry.
   */
  it("replays the same shape the fresh broadcast uses", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());
    const fresh = harness.ioEmits[0]?.payload as Record<string, unknown>;
    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());
    const replayed = harness.senderEmits[0]?.payload as Record<string, unknown>;

    expect(fresh).toHaveProperty("actorId");
    expect(fresh).toHaveProperty("data");

    expect(replayed).toHaveProperty("actorId", harness.socket.id);
    expect(replayed["data"]).toEqual(fresh["data"]);
  });

  it("rolls back an actor intent that names no actor instance", async () => {
    await ready();
    const payload = intent({ source: "actor" });

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, payload);

    expect(harness.ioEmits).toEqual([]);
    expect(harness.senderEmits).toEqual([
      {
        event: "error:rollback",
        payload: { event: SOCKET_EVENTS.ACTION_INTENT, payload },
      },
    ]);
  });

  it("rolls back an actor intent naming an actor that does not exist", async () => {
    await ready();
    const payload = intent({
      source: "actor",
      actorInstanceId: "actor-nope",
    });

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, payload);

    expect(harness.ioEmits).toEqual([]);
    expect(harness.senderEmits[0]?.event).toBe("error:rollback");
    expect(harness.consoleError).toHaveBeenCalledWith(
      "Failed to process authoritative action intent:",
      expect.any(Error),
    );
  });

  it("rolls back when the socket never joined a campaign", async () => {
    harness = await setupGateway();
    const payload = intent();

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, payload);

    expect(harness.ioEmits).toEqual([]);
    expect(harness.senderEmits).toEqual([
      {
        event: "error:rollback",
        payload: { event: SOCKET_EVENTS.ACTION_INTENT, payload },
      },
    ]);
  });

  it("rolls back when the character belongs to another campaign", async () => {
    await ready();
    harness.db.seed(characters, [characterRow({ campaignId: "camp-other" })]);

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());

    expect(harness.ioEmits).toEqual([]);
    expect(harness.senderEmits[0]?.event).toBe("error:rollback");
  });

  it("rolls back when the character has vanished from the database", async () => {
    await ready();
    // Present for the ownership check, absent for the runtime build.
    harness.db.queue(characters, [[characterRow()], []]);

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());

    expect(harness.ioEmits).toEqual([]);
    expect(harness.senderEmits[0]?.event).toBe("error:rollback");
  });

  it("reads the class ledger when building the runtime", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());

    // The save the engine runs on is assembled from character_classes, not
    // from a level stored on the character row.
    expect(harness.db.opsFor(characterClasses, "select")).toHaveLength(1);
  });

  it("tracks the economy rather than refusing when it is overdrawn", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());
    await harness.emit(
      SOCKET_EVENTS.ACTION_INTENT,
      intent({ requestId: "req-2" }),
    );

    // economyPolicy is "track" on purpose: tables bend the action economy
    // constantly, so the server records the overdraw instead of blocking it.
    expect(lastResolved(harness)["executed"]).toBe(true);
  });

  /**
   * Regression test: resolveCharacterAction builds a sheet purely to look an
   * action up, but that sheet-build used to re-hydrate the authoritative,
   * long-lived resourceManager on every single intent.
   * ResourceManager.initializeFromGrants is deliberately additive for a
   * resource id it has already seen - that is what lets multiclass
   * spellcasting accumulate slots correctly - so re-running it against the
   * same instance a second time doubled every limited-use pool's max and
   * refilled it to full. Ki, rages, spell slots: all free after the first
   * action. A barbarian's Rage (2 charges at level 1) is the fixture here
   * because it is a real trait-granted resource in the shipped pack.
   */
  it("does not touch a resource pool's charges on a second intent for the same character", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterClasses, [
      { classId: "class_barbarian", classLevel: 1 },
    ]);
    harness.db.seed(characterInventory, []);

    const findRage = (h: GatewayHarness) => {
      const resources = lastResolved(h)["resources"] as Array<{
        id: string;
        current: number;
        currentCharges: number;
      }>;
      return resources.find(
        (resource) => resource.id === "resource_barbarian_rage",
      );
    };

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());
    const afterFirst = findRage(harness);

    await harness.emit(
      SOCKET_EVENTS.ACTION_INTENT,
      intent({ requestId: "req-2", actionId: "action_dash" }),
    );
    const afterSecond = findRage(harness);

    // Whatever the first intent produced (whether Rage is even present, or
    // present at its correct un-doubled charges), a second intent for the
    // same character must leave it completely alone. Before the fix this
    // failed with afterFirst = { current: 2, currentCharges: 2 } and
    // afterSecond = { current: 4, currentCharges: 4 }.
    expect(afterSecond).toEqual(afterFirst);
  });

  it("materialises a granted pool the table has no row for", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterClasses, [
      { classId: "class_barbarian", classLevel: 3, subclassId: null },
    ]);
    harness.db.seed(characterInventory, []);
    harness.db.seed(characterTraits, []);
    harness.db.seed(characterResources, []);

    await harness.emit(
      SOCKET_EVENTS.ACTION_INTENT,
      intent({ actionId: "action_rage" }),
    );

    // Only the sample seeder ever wrote this table. A real barbarian had no
    // Rage row, and every rage failed insufficient_resource.
    const inserts = harness.db.opsFor(characterResources, "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.values).toEqual([
      expect.objectContaining({
        id: "resource_barbarian_rage",
        characterId: "char-1",
        current: 3,
        max: 3,
        resetCondition: "long_rest",
      }),
    ]);
    expect(lastResolved(harness)).toMatchObject({ executed: true });
  });

  it("leaves an existing pool row alone", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterClasses, [
      { classId: "class_barbarian", classLevel: 3, subclassId: null },
    ]);
    harness.db.seed(characterInventory, []);
    harness.db.seed(characterTraits, []);
    harness.db.seed(characterResources, [
      {
        id: "resource_barbarian_rage",
        characterId: "char-1",
        name: "Rage",
        current: 1,
        max: 3,
        resetCondition: "long_rest",
      },
    ]);

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());

    expect(harness.db.opsFor(characterResources, "insert")).toEqual([]);
  });

  it("resolves a subclass action for a Totem Warrior whose totem was a player choice", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterClasses, [
      {
        classId: "class_barbarian",
        classLevel: 3,
        subclassId: "subclass_barbarian_totem_warrior",
      },
    ]);
    harness.db.seed(characterTraits, [
      { traitId: "trait_totem_spirit_eagle", source: "player_choice" },
    ]);
    harness.db.seed(characterInventory, []);
    harness.db.seed(characterResources, [
      {
        id: "resource_barbarian_rage",
        characterId: "char-1",
        name: "Rage",
        current: 3,
        max: 3,
        resetCondition: "long_rest",
      },
    ]);

    await harness.emit(
      SOCKET_EVENTS.ACTION_INTENT,
      intent({ actionId: "action_rage", requestId: "req-rage" }),
    );
    await harness.emit(
      SOCKET_EVENTS.ACTION_INTENT,
      intent({ actionId: "action_eagle_dash", requestId: "req-dash" }),
    );

    const resolved = lastResolved(harness);
    expect(resolved).toMatchObject({ executed: true, actionId: "action_eagle_dash" });
    expect(resolved["activeStates"]).toContain("status_dashing");
  });
});
