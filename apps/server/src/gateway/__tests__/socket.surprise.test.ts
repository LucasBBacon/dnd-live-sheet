import { afterEach, describe, expect, it } from "vitest";
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

const ROOM = "campaign_camp-1";

/**
 * Surprise is declared by the player and settled by the DM, so the server can
 * never derive it - but it must own it, or two clients on the same character
 * disagree. The handler is a thin adapter over CombatContextManager; what is
 * only testable here is that the declaration reaches the whole room and lands
 * on the same runtime the turn handler mutates.
 */
describe("socket gateway - surprise", () => {
  let harness: GatewayHarness;

  afterEach(() => {
    harness?.restore();
  });

  const declaration = (overrides: Record<string, unknown> = {}) => ({
    characterId: "char-1",
    surprised: true,
    ...overrides,
  });

  const ready = async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterClasses, [
      { classId: "class_barbarian", classLevel: 7 },
    ]);
    harness.db.seed(characterInventory, []);
  };

  const lastResolved = (h: GatewayHarness) =>
    (h.ioEmits.at(-1)?.payload as { data: Record<string, unknown> }).data;

  it("answers on its own channel, to the whole room", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.SURPRISE_DECLARED, declaration());

    expect(harness.ioEmits).toHaveLength(1);
    expect(harness.ioEmits[0]?.room).toBe(ROOM);
    expect(harness.ioEmits[0]?.event).toBe(SOCKET_EVENTS.SURPRISE_RESOLVED);
    expect(harness.senderEmits).toEqual([]);
  });

  it("wraps the reply the way every other broadcast is wrapped", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.SURPRISE_DECLARED, declaration());

    expect(harness.ioEmits[0]?.payload).toMatchObject({
      actorId: harness.socket.id,
    });
  });

  it("records the declaration on the combat context it returns", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.SURPRISE_DECLARED, declaration());

    expect(lastResolved(harness)).toMatchObject({
      characterId: "char-1",
      combatContext: expect.objectContaining({ surprised: true }),
    });
  });

  it("takes it back when the player unticks the box", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.SURPRISE_DECLARED, declaration());
    await harness.emit(
      SOCKET_EVENTS.SURPRISE_DECLARED,
      declaration({ surprised: false }),
    );

    expect(lastResolved(harness)).toMatchObject({
      combatContext: expect.objectContaining({ surprised: false }),
    });
  });

  it("retires the declaration when the player's turn ends", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.SURPRISE_DECLARED, declaration());
    await harness.emit(SOCKET_EVENTS.TURN_STARTED, {
      characterId: "char-1",
      requestId: "turn-1",
    });
    await harness.emit(SOCKET_EVENTS.TURN_ENDED, {
      characterId: "char-1",
      requestId: "turn-2",
    });

    // proves both handlers share one runtime: the turn lifecycle expires a
    // declaration the surprise handler made
    expect(lastResolved(harness)).toMatchObject({
      combatContext: expect.objectContaining({ surprised: false }),
    });
  });
});
