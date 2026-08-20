import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionGrant, DamageSegment } from "@project/shared";
import { ActionResolver } from "../actionResolver.js";
import type { RollContextPayload } from "../rollContextBuilder.js";
import { EffectManager } from "../../calculators/effects.js";
import { ResourceManager } from "../../calculators/resources.js";

const segment = (
  baseDice: string,
  damageType: DamageSegment["damageType"],
  sourceName = "Greataxe",
): DamageSegment => ({
  sourceName,
  baseDice,
  damageType,
  scalingMode: "none",
  levelScaling: [],
});

const greataxe = (criticalDamage?: DamageSegment[]): ActionGrant => ({
  id: "action_weapon_item_weapon_greataxe",
  name: "Greataxe",
  activation: "action",
  effect: {
    type: "attack",
    attackType: "melee_weapon",
    attackStat: "STR",
    range: 5,
    damage: [segment("1d12", "slashing")],
    ...(criticalDamage && { criticalDamage }),
  },
});

const payload: RollContextPayload = {
  actionId: "action_weapon_item_weapon_greataxe",
  activeStates: [],
};

/** Every die shows its highest face, so a d20 attack roll is a natural 20. */
const forceMaxRolls = () => vi.spyOn(Math, "random").mockReturnValue(0.999);

describe("ActionResolver critical damage", () => {
  let effectManager: EffectManager;
  let resourceManager: ResourceManager;

  beforeEach(() => {
    effectManager = new EffectManager();
    resourceManager = new ResourceManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const damageRolls = (action: ActionGrant) => {
    const result = ActionResolver.execute(action, payload, {
      effectManager,
      resourceManager,
    });

    return (result.rollResults ?? []).filter(
      (roll) => roll.target === "DAMAGE_ROLL",
    );
  };

  it("rolls the critical pool rather than the base dice on a natural 20", () => {
    forceMaxRolls();

    const rolls = damageRolls(greataxe([segment("2d12", "slashing")]));

    expect(rolls).toHaveLength(1);
    expect(rolls[0]?.rolls).toEqual([12, 12]);
    expect(rolls[0]?.total).toBe(24);
  });

  it("rolls each critical segment separately, keeping its own damage type", () => {
    forceMaxRolls();

    const rolls = damageRolls(
      greataxe([
        segment("2d12", "slashing"),
        segment("1d6", "fire", "Flame Tongue"),
      ]),
    );

    expect(rolls).toHaveLength(2);
    expect(rolls[0]?.damageType).toBe("slashing");
    expect(rolls[0]?.total).toBe(24);
    expect(rolls[1]?.damageType).toBe("fire");
    expect(rolls[1]?.total).toBe(6);
  });

  it("falls back to the base dice when the action carries no critical pool", () => {
    forceMaxRolls();

    const rolls = damageRolls(greataxe());

    expect(rolls).toHaveLength(1);
    expect(rolls[0]?.total).toBe(12);
  });

  it("maximizes a critical segment that asks for it", () => {
    // a natural 20 to reach the critical pool, then the lowest possible face on
    // every damage die - so a maximized segment is the only way to score above 2
    vi.spyOn(Math, "random").mockReturnValueOnce(0.999).mockReturnValue(0);

    const rolls = damageRolls(
      greataxe([{ ...segment("2d12", "slashing"), maximized: true }]),
    );

    expect(rolls).toHaveLength(1);
    expect(rolls[0]?.total).toBe(24);
  });

  it("rolls an unmaximized critical segment normally", () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0.999).mockReturnValue(0);

    const rolls = damageRolls(greataxe([segment("2d12", "slashing")]));

    expect(rolls[0]?.total).toBe(2);
  });
});
