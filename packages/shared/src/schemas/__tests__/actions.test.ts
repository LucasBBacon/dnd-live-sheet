import { describe, expect, it } from "vitest";
import { GameActionSchema, ModifyHpActionSchema } from "../actions.js";

describe("Modify HP Action Schema", () => {
  const validAction = {
    characterId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    timestamp: 1625097600,
    type: "MODIFY_HP",
    payload: {
      amount: -5,
      isTemporary: false,
    },
  };

  it("accepts valid HP modification action", () => {
    expect(ModifyHpActionSchema.parse(validAction)).toEqual(validAction);
  });

  it("accepts positive amount (healing)", () => {
    const healing = { ...validAction, payload: { amount: 10, isTemporary: false } };
    expect(ModifyHpActionSchema.parse(healing)).toBeDefined();
  });

  it("accepts negative amount (damage)", () => {
    const damage = { ...validAction, payload: { amount: -15, isTemporary: false } };
    expect(ModifyHpActionSchema.parse(damage)).toBeDefined();
  });

  it("accepts zero amount", () => {
    const zero = { ...validAction, payload: { amount: 0, isTemporary: false } };
    expect(ModifyHpActionSchema.parse(zero)).toBeDefined();
  });

  it("accepts temporary HP flag true", () => {
    const temp = { ...validAction, payload: { amount: 5, isTemporary: true } };
    expect(ModifyHpActionSchema.parse(temp)).toBeDefined();
  });

  it("accepts temporary HP flag false", () => {
    const perm = { ...validAction, payload: { amount: 5, isTemporary: false } };
    expect(ModifyHpActionSchema.parse(perm)).toBeDefined();
  });

  it("defaults isTemporary to false", () => {
    const noTemp = {
      characterId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      timestamp: 1625097600,
      type: "MODIFY_HP",
      payload: {
        amount: 5,
      },
    };
    const result = ModifyHpActionSchema.parse(noTemp);
    expect(result.payload.isTemporary).toBe(false);
  });

  it("requires characterId", () => {
    const noId = { ...validAction, characterId: undefined };
    expect(() => ModifyHpActionSchema.parse(noId)).toThrow();
  });

  it("requires valid UUID for characterId", () => {
    const badId = { ...validAction, characterId: "not-a-uuid" };
    expect(() => ModifyHpActionSchema.parse(badId)).toThrow();
  });

  it("requires timestamp", () => {
    const noTimestamp = { ...validAction, timestamp: undefined };
    expect(() => ModifyHpActionSchema.parse(noTimestamp)).toThrow();
  });

  it("requires integer timestamp", () => {
    const floatTimestamp = { ...validAction, timestamp: 1625097600.5 };
    expect(() => ModifyHpActionSchema.parse(floatTimestamp)).toThrow();
  });

  it("accepts large timestamp values", () => {
    const largeTs = { ...validAction, timestamp: 9999999999 };
    expect(ModifyHpActionSchema.parse(largeTs)).toBeDefined();
  });

  it("requires correct type literal", () => {
    const wrongType = { ...validAction, type: "WRONG_TYPE" };
    expect(() => ModifyHpActionSchema.parse(wrongType)).toThrow();
  });

  it("requires amount in payload", () => {
    const noAmount = { ...validAction, payload: { isTemporary: false } };
    expect(() => ModifyHpActionSchema.parse(noAmount)).toThrow();
  });

  it("rejects non-integer amount", () => {
    const floatAmount = { ...validAction, payload: { amount: 5.5, isTemporary: false } };
    expect(() => ModifyHpActionSchema.parse(floatAmount)).toThrow();
  });

  it("accepts very large amounts", () => {
    const large = { ...validAction, payload: { amount: 999999, isTemporary: false } };
    expect(ModifyHpActionSchema.parse(large)).toBeDefined();
  });

  it("accepts very negative amounts", () => {
    const veryNeg = { ...validAction, payload: { amount: -999999, isTemporary: false } };
    expect(ModifyHpActionSchema.parse(veryNeg)).toBeDefined();
  });
});

describe("Game Action Schema (discriminated union)", () => {
  const validModifyHpAction = {
    characterId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    timestamp: 1625097600,
    type: "MODIFY_HP",
    payload: {
      amount: -5,
      isTemporary: false,
    },
  };

  it("accepts MODIFY_HP action through union", () => {
    expect(GameActionSchema.parse(validModifyHpAction)).toBeDefined();
  });

  it("discriminates on type field", () => {
    const wrongType = { ...validModifyHpAction, type: "UNKNOWN" };
    expect(() => GameActionSchema.parse(wrongType)).toThrow();
  });

  it("rejects action with correct type but invalid payload", () => {
    const badPayload = {
      ...validModifyHpAction,
      payload: { amount: "not-a-number", isTemporary: false },
    };
    expect(() => GameActionSchema.parse(badPayload)).toThrow();
  });

  it("currently only supports MODIFY_HP action type", () => {
    // This is a placeholder test documenting the current state
    // More action types can be added in the future
    expect(() =>
      GameActionSchema.parse({
        characterId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        timestamp: 1625097600,
        type: "EQUIP_ITEM",
        payload: {},
      })
    ).toThrow();
  });
});
