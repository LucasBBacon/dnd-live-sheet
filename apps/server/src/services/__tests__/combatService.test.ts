import { describe, expect, it, vi, beforeEach } from "vitest";
import { modifyCharacterHp } from "../combatService";
import type { CharacterEngineData } from "@project/shared";

// Mock the database module
vi.mock("@project/database", () => ({
  db: {
    transaction: vi.fn(),
  },
}));

// Import after mocking
import { db } from "@project/database";

describe("modifyCharacterHp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockCharacter = (hp = { current: 50, temporary: 0, max: 100 }) => ({
    id: "char123",
    name: "Test Character",
    engineData: {
      hp,
    } as CharacterEngineData,
  });

  const createMockTransaction = (character: any) => {
    const txMock = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      for: vi.fn().mockResolvedValue([character]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    };
    return txMock;
  };

  describe("healing", () => {
    it("increases current HP when healing", async () => {
      const character = createMockCharacter({ current: 50, temporary: 0, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", 25);

      expect(txMock.update).toHaveBeenCalled();
      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          engineData: expect.objectContaining({
            hp: { current: 75, temporary: 0, max: 100 },
          }),
        }),
      );
    });

    it("does not exceed maximum HP when healing", async () => {
      const character = createMockCharacter({ current: 90, temporary: 0, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", 50);

      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          engineData: expect.objectContaining({
            hp: { current: 100, temporary: 0, max: 100 },
          }),
        }),
      );
    });

    it("handles exact healing to maximum", async () => {
      const character = createMockCharacter({ current: 95, temporary: 0, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", 5);

      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          engineData: expect.objectContaining({
            hp: { current: 100, temporary: 0, max: 100 },
          }),
        }),
      );
    });

    it("handles zero healing (no change)", async () => {
      const character = createMockCharacter({ current: 75, temporary: 0, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", 0);

      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          engineData: expect.objectContaining({
            hp: { current: 75, temporary: 0, max: 100 },
          }),
        }),
      );
    });

    it("handles healing when temporary HP exists", async () => {
      const character = createMockCharacter({ current: 50, temporary: 20, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", 30);

      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          engineData: expect.objectContaining({
            hp: { current: 80, temporary: 20, max: 100 },
          }),
        }),
      );
    });
  });

  describe("damage - basic", () => {
    it("reduces current HP when taking damage", async () => {
      const character = createMockCharacter({ current: 50, temporary: 0, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", -25);

      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          engineData: expect.objectContaining({
            hp: { current: 25, temporary: 0, max: 100 },
          }),
        }),
      );
    });

    it("floors HP at 0 when taking fatal damage", async () => {
      const character = createMockCharacter({ current: 20, temporary: 0, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", -50);

      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          engineData: expect.objectContaining({
            hp: { current: 0, temporary: 0, max: 100 },
          }),
        }),
      );
    });

    it("handles exactly lethal damage", async () => {
      const character = createMockCharacter({ current: 30, temporary: 0, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", -30);

      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          engineData: expect.objectContaining({
            hp: { current: 0, temporary: 0, max: 100 },
          }),
        }),
      );
    });
  });

  describe("damage - temporary HP absorption", () => {
    it("temporary HP absorbs damage first", async () => {
      const character = createMockCharacter({ current: 50, temporary: 30, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", -20);

      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          engineData: expect.objectContaining({
            hp: { current: 50, temporary: 10, max: 100 },
          }),
        }),
      );
    });

    it("uses all temporary HP when damage exceeds it", async () => {
      const character = createMockCharacter({ current: 50, temporary: 15, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", -40);

      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          engineData: expect.objectContaining({
            hp: { current: 25, temporary: 0, max: 100 },
          }),
        }),
      );
    });

    it("removes all temporary HP when damage equals it", async () => {
      const character = createMockCharacter({ current: 50, temporary: 20, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", -20);

      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          engineData: expect.objectContaining({
            hp: { current: 50, temporary: 0, max: 100 },
          }),
        }),
      );
    });

    it("damage does not reduce current HP while temporary exists", async () => {
      const character = createMockCharacter({ current: 50, temporary: 100, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", -75);

      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          engineData: expect.objectContaining({
            hp: { current: 50, temporary: 25, max: 100 },
          }),
        }),
      );
    });

    it("excess damage carries over to current HP", async () => {
      const character = createMockCharacter({ current: 50, temporary: 10, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", -50);

      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          engineData: expect.objectContaining({
            hp: { current: 10, temporary: 0, max: 100 },
          }),
        }),
      );
    });

    it("damage exceeding total HP (current + temporary)", async () => {
      const character = createMockCharacter({ current: 30, temporary: 15, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", -100);

      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          engineData: expect.objectContaining({
            hp: { current: 0, temporary: 0, max: 100 },
          }),
        }),
      );
    });
  });

  describe("edge cases", () => {
    it("throws error when character not found", async () => {
      const txMock = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        for: vi.fn().mockResolvedValue([]),
      };

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await expect(modifyCharacterHp("nonexistent", -10)).rejects.toThrow(
        "Character nonexistent not found",
      );
    });

    it("updates currentHp top-level column after damage", async () => {
      const character = createMockCharacter({ current: 50, temporary: 0, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", -30);

      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          currentHp: 20,
          updatedAt: expect.any(Date),
        }),
      );
    });

    it("updates updatedAt timestamp", async () => {
      const character = createMockCharacter({ current: 50, temporary: 0, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      const beforeTime = new Date();
      await modifyCharacterHp("char123", -10);
      const afterTime = new Date();

      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          updatedAt: expect.any(Date),
        }),
      );

      const callArgs = (txMock.set as any).mock.calls[0][0];
      expect(callArgs.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(callArgs.updatedAt.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it("uses database transaction for atomicity", async () => {
      const character = createMockCharacter({ current: 50, temporary: 0, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", -25);

      expect(db.transaction).toHaveBeenCalled();
    });

    it("locks character row during transaction", async () => {
      const character = createMockCharacter({ current: 50, temporary: 0, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", -10);

      expect(txMock.for).toHaveBeenCalledWith("update");
    });

    it("returns updated HP object", async () => {
      const character = createMockCharacter({ current: 50, temporary: 0, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => {
        fn(txMock);
        return Promise.resolve({ current: 40, temporary: 0, max: 100 });
      });

      const result = await modifyCharacterHp("char123", -10);

      expect(result).toEqual({ current: 40, temporary: 0, max: 100 });
    });
  });

  describe("large values", () => {
    it("handles healing large amounts capped at max", async () => {
      const character = createMockCharacter({ current: 50, temporary: 0, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", 999999);

      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          engineData: expect.objectContaining({
            hp: { current: 100, temporary: 0, max: 100 },
          }),
        }),
      );
    });

    it("handles massive damage flooring at 0", async () => {
      const character = createMockCharacter({ current: 50, temporary: 0, max: 100 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", -999999);

      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          engineData: expect.objectContaining({
            hp: { current: 0, temporary: 0, max: 100 },
          }),
        }),
      );
    });

    it("handles high temporary HP", async () => {
      const character = createMockCharacter({ current: 10, temporary: 999, max: 1000 });
      const txMock = createMockTransaction(character);

      (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

      await modifyCharacterHp("char123", -500);

      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          engineData: expect.objectContaining({
            hp: { current: 10, temporary: 499, max: 1000 },
          }),
        }),
      );
    });
  });
});
