import { beforeEach, describe, expect, it, vi } from "vitest";
import { modifyCharacterHp } from "../combatService";

vi.mock("@project/database", () => ({
  db: {
    transaction: vi.fn(),
  },
}));

import { db } from "@project/database";

const createMockCharacter = (currentHp = 50, maxHp = 100) => ({
  id: "char123",
  currentHp,
  maxHp,
});

const createMockTransaction = (character: unknown) => {
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

describe("modifyCharacterHp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("increases current HP on healing and clamps to max HP", async () => {
    const txMock = createMockTransaction(createMockCharacter(90, 100));
    (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

    const hp = await modifyCharacterHp("char123", 25);

    expect(txMock.update).toHaveBeenCalled();
    expect(txMock.set).toHaveBeenCalledWith(
      expect.objectContaining({
        currentHp: 100,
      }),
    );
    expect(hp).toEqual({ current: 100, temporary: 0, max: 100 });
  });

  it("reduces current HP on damage and floors at zero", async () => {
    const txMock = createMockTransaction(createMockCharacter(20, 100));
    (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

    const hp = await modifyCharacterHp("char123", -999);

    expect(txMock.set).toHaveBeenCalledWith(
      expect.objectContaining({
        currentHp: 0,
      }),
    );
    expect(hp).toEqual({ current: 0, temporary: 0, max: 100 });
  });

  it("uses row locking during transaction", async () => {
    const txMock = createMockTransaction(createMockCharacter(50, 100));
    (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

    await modifyCharacterHp("char123", -10);

    expect(txMock.for).toHaveBeenCalledWith("update");
  });

  it("throws when character does not exist", async () => {
    const txMock = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      for: vi.fn().mockResolvedValue([]),
    };
    (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

    await expect(modifyCharacterHp("missing", -5)).rejects.toThrow(
      "Character missing not found",
    );
  });
});

