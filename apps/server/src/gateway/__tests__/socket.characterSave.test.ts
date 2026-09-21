import { afterEach, describe, expect, it } from "vitest";
import {
  characterRow,
  setupGateway,
  type GatewayHarness,
} from "./socketHarness.js";

/**
 * The authoritative runtime builds its save from the characters row, so a
 * background the row carries must reach the save or its grants never reach
 * the server's live sheet (#68).
 */
describe("socket gateway - toCharacterSave", () => {
  let harness: GatewayHarness | undefined;

  afterEach(() => {
    harness?.restore();
  });

  it("carries the character's background into the save", async () => {
    harness = await setupGateway();
    const { toCharacterSave } = await import("../socket.js");

    const save = toCharacterSave(
      { ...characterRow(), backgroundId: "background_criminal" },
      [],
    );

    expect(save.backgroundId).toBe("background_criminal");
  });

  it("leaves the background off a character that has none", async () => {
    harness = await setupGateway();
    const { toCharacterSave } = await import("../socket.js");

    const save = toCharacterSave({ ...characterRow(), backgroundId: null }, []);

    expect("backgroundId" in save).toBe(false);
  });
});
