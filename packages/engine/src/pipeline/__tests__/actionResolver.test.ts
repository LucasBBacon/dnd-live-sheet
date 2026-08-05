import { beforeEach, describe, expect, it } from "vitest";
import type { ActionGrant } from "@project/shared";
import { ActionResolver } from "../actionResolver.js";
import type { InventoryLedger } from "../inventoryLedger.js";
import type { RollContextPayload } from "../rollContextBuilder.js";
import { EffectManager } from "../../calculators/effects.js";
import { ResourceManager } from "../../calculators/resources.js";

const ARROW = "item_ammo_arrow";
const MAGIC_ARROW = "item_ammo_arrow_plus_one";

/** An in-memory ledger standing in for the web store's inventory. */
const makeLedger = (
  stacks: Array<{ id: string; itemId: string; quantity: number }>,
): InventoryLedger & { stacks: typeof stacks } => ({
  stacks,
  getStack(instanceId) {
    return stacks.find((stack) => stack.id === instanceId);
  },
  consumeStack(instanceId, amount) {
    const stack = stacks.find((entry) => entry.id === instanceId);
    if (stack) stack.quantity -= amount;
  },
});

const bowShot: ActionGrant = {
  id: "action_weapon_item_weapon_longbow",
  name: "Longbow",
  activation: "action",
  consumesAmmo: "arrow",
  effect: {
    type: "attack",
    attackType: "ranged_weapon",
    attackStat: "DEX",
    range: 150,
    damage: [
      {
        sourceName: "Longbow",
        baseDice: "1d8",
        damageType: "piercing",
        scalingMode: "none",
        levelScaling: [],
      },
    ],
  },
};

const payload = (
  consumedResources?: RollContextPayload["consumedResources"],
): RollContextPayload => ({
  actionId: bowShot.id,
  activeStates: [],
  ...(consumedResources && { consumedResources }),
});

const arrow = (id: string, amount = 1) =>
  [{ type: "inventory_instance" as const, id, amount }];

describe("ActionResolver ammunition", () => {
  let effectManager: EffectManager;
  let resourceManager: ResourceManager;

  beforeEach(() => {
    effectManager = new EffectManager();
    resourceManager = new ResourceManager();
  });

  const run = (
    action: ActionGrant,
    context: RollContextPayload,
    ledger?: InventoryLedger,
  ) =>
    ActionResolver.execute(action, context, {
      effectManager,
      resourceManager,
      ...(ledger && { inventoryLedger: ledger }),
    });

  it("spends the exact stack the player selected", () => {
    const ledger = makeLedger([
      { id: "inv_plain", itemId: ARROW, quantity: 20 },
      { id: "inv_magic", itemId: MAGIC_ARROW, quantity: 5 },
    ]);

    const result = run(bowShot, payload(arrow("inv_magic")), ledger);

    expect(result.executed).toBe(true);
    // the +1 arrows are spent, the ordinary quiver is untouched
    expect(ledger.stacks[1]?.quantity).toBe(4);
    expect(ledger.stacks[0]?.quantity).toBe(20);
  });

  it("accepts a magical variant because it shares the weapon's ammo tag", () => {
    const ledger = makeLedger([
      { id: "inv_magic", itemId: MAGIC_ARROW, quantity: 1 },
    ]);

    expect(run(bowShot, payload(arrow("inv_magic")), ledger).executed).toBe(
      true,
    );
  });

  it("refuses to fire when no ammunition was chosen", () => {
    const ledger = makeLedger([
      { id: "inv_plain", itemId: ARROW, quantity: 20 },
    ]);

    const result = run(bowShot, payload(), ledger);

    expect(result.executed).toBe(false);
    expect(result.reason).toBe("ammo_not_selected");
    expect(ledger.stacks[0]?.quantity).toBe(20);
  });

  it("refuses a stack the character does not carry", () => {
    const ledger = makeLedger([]);

    const result = run(bowShot, payload(arrow("inv_ghost")), ledger);

    expect(result.executed).toBe(false);
    expect(result.reason).toBe("missing_stack");
  });

  it("refuses an empty quiver", () => {
    const ledger = makeLedger([{ id: "inv_plain", itemId: ARROW, quantity: 0 }]);

    const result = run(bowShot, payload(arrow("inv_plain")), ledger);

    expect(result.executed).toBe(false);
    expect(result.reason).toBe("insufficient_stack");
  });

  it("refuses to fire something that is not ammunition for this weapon", () => {
    const ledger = makeLedger([
      { id: "inv_plate", itemId: "item_armor_plate", quantity: 1 },
    ]);

    const result = run(bowShot, payload(arrow("inv_plate")), ledger);

    expect(result.executed).toBe(false);
    expect(result.reason).toBe("wrong_ammo");
    // a crafted payload must not be able to spend armour as an arrow
    expect(ledger.stacks[0]?.quantity).toBe(1);
  });

  it("refuses an inventory cost the action never asked for", () => {
    const meleeSwing: ActionGrant = { ...bowShot, consumesAmmo: undefined };
    const ledger = makeLedger([
      { id: "inv_plain", itemId: ARROW, quantity: 20 },
    ]);

    const result = run(meleeSwing, payload(arrow("inv_plain")), ledger);

    expect(result.executed).toBe(false);
    expect(result.reason).toBe("unrequested_cost");
    expect(ledger.stacks[0]?.quantity).toBe(20);
  });

  it("reports a missing ledger rather than firing for free", () => {
    const result = run(bowShot, payload(arrow("inv_plain")));

    expect(result.executed).toBe(false);
    expect(result.reason).toBe("no_ledger");
  });

  it("rejects a non-positive amount", () => {
    const ledger = makeLedger([
      { id: "inv_plain", itemId: ARROW, quantity: 20 },
    ]);

    const result = run(bowShot, payload(arrow("inv_plain", 0)), ledger);

    expect(result.executed).toBe(false);
    expect(ledger.stacks[0]?.quantity).toBe(20);
  });
});

describe("ActionResolver cost settlement", () => {
  let effectManager: EffectManager;
  let resourceManager: ResourceManager;

  beforeEach(() => {
    effectManager = new EffectManager();
    resourceManager = new ResourceManager();
    resourceManager.initializeFromGrants([
      { id: "pool_ki", name: "Ki", maxCharges: 2, resetOn: "short_rest" },
    ]);
  });

  const kiShot: ActionGrant = { ...bowShot, consumesResource: "pool_ki" };

  it("spends a pool and a stack together", () => {
    const ledger = makeLedger([
      { id: "inv_plain", itemId: ARROW, quantity: 20 },
    ]);

    const result = ActionResolver.execute(
      kiShot,
      payload([
        { type: "trait_pool", id: "pool_ki", amount: 1 },
        { type: "inventory_instance", id: "inv_plain", amount: 1 },
      ]),
      { effectManager, resourceManager, inventoryLedger: ledger },
    );

    expect(result.executed).toBe(true);
    expect(ledger.stacks[0]?.quantity).toBe(19);
  });

  it("never takes the arrow when the pool turns out to be empty", () => {
    resourceManager.consume("pool_ki", 2); // drain it first
    const ledger = makeLedger([
      { id: "inv_plain", itemId: ARROW, quantity: 20 },
    ]);

    const result = ActionResolver.execute(
      kiShot,
      payload([
        { type: "trait_pool", id: "pool_ki", amount: 1 },
        { type: "inventory_instance", id: "inv_plain", amount: 1 },
      ]),
      { effectManager, resourceManager, inventoryLedger: ledger },
    );

    expect(result.executed).toBe(false);
    expect(result.reason).toBe("insufficient_resource");
    // the shot never happened, so the arrow is still in the quiver
    expect(ledger.stacks[0]?.quantity).toBe(20);
  });

  it("refuses a pool the action never declared", () => {
    const ledger = makeLedger([
      { id: "inv_plain", itemId: ARROW, quantity: 20 },
    ]);

    const result = ActionResolver.execute(
      kiShot,
      payload([
        { type: "trait_pool", id: "pool_someone_elses", amount: 1 },
        { type: "inventory_instance", id: "inv_plain", amount: 1 },
      ]),
      { effectManager, resourceManager, inventoryLedger: ledger },
    );

    expect(result.executed).toBe(false);
    expect(result.reason).toBe("unrequested_cost");
  });

  it("still charges a declared pool the payload left out", () => {
    const kiOnly: ActionGrant = {
      ...bowShot,
      consumesAmmo: undefined,
      consumesResource: "pool_ki",
    };

    const result = ActionResolver.execute(kiOnly, payload(), {
      effectManager,
      resourceManager,
    });

    expect(result.executed).toBe(true);
    // omitting the cost must not make the action free
    expect(resourceManager.consume("pool_ki", 2)).toBe(false);
  });
});
