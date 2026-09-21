import express, { type Request } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  characterClasses,
  characterResources,
  characters,
} from "@project/database/src/schema/operational.js";
import { FakeDb, renderSql } from "../../gateway/__tests__/fakeDb.js";
import { globalErrorHandler } from "../../middleware/errorHandler.js";

/**
 * The sheet hydrates its resource pools from this payload. Without the
 * persisted rows it rebuilt every pool at full, so a spent slot came back on
 * reload even though character_resources held the spend (#63).
 */
describe("GET /api/character/:characterId", () => {
  const setupApp = async (db: FakeDb) => {
    vi.resetModules();
    vi.doMock("@project/database", () => ({ db }));
    vi.doMock("../../services/campaignAccess.js", () => ({
      isUserCampaignMember: vi.fn().mockResolvedValue(true),
    }));

    const { default: characterRoutes } = await import("../character.js");

    const app = express();
    app.use((req, _res, next) => {
      (req as Request & { user?: { id: string } }).user = { id: "user-1" };
      next();
    });
    app.use("/api/character", characterRoutes);
    app.use(globalErrorHandler);
    return app;
  };

  const seededDb = () =>
    new FakeDb()
      .seed(characters, [{ id: "char-1", campaignId: "camp-1" }])
      .seed(characterResources, [
        { id: "spell_slots_1", name: "1st-Level Spell Slots", current: 3 },
      ]);

  it("returns the character's persisted resource counts", async () => {
    const app = await setupApp(seededDb());

    const response = await request(app).get("/api/character/char-1");

    expect(response.status).toBe(200);
    expect(response.body.character.resources).toEqual([
      { id: "spell_slots_1", name: "1st-Level Spell Slots", current: 3 },
    ]);
  });

  it("reads resources for the requested character only", async () => {
    const db = seededDb();
    const app = await setupApp(db);

    await request(app).get("/api/character/char-1");

    const [read] = db.opsFor(characterResources, "select");
    expect(renderSql(read?.where).sql).toContain(
      '"character_resources"."character_id"',
    );
  });

  it("orders the resources select by id, so an updated row does not jump the list", async () => {
    const db = seededDb();
    const app = await setupApp(db);

    await request(app).get("/api/character/char-1");

    const [read] = db.opsFor(characterResources, "select");
    const orderBy = read?.orderBy ?? [];
    expect(
      orderBy.some((clause) =>
        renderSql(clause).sql.includes('"character_resources"."id"'),
      ),
    ).toBe(true);
  });

  it("returns the class ledger in the order the classes were taken (#74)", async () => {
    const db = seededDb();
    const app = await setupApp(db);

    await request(app).get("/api/character/char-1");

    const [ledgerRead] = db.opsFor(characterClasses, "select");
    expect(ledgerRead?.orderBy.map((part) => renderSql(part).sql)).toEqual([
      '"character_classes"."position" asc',
      '"character_classes"."class_id" asc',
    ]);
  });
});
