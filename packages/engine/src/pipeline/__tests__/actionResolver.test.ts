import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionGrant } from "@project/shared";
import { ActionResolver } from "../actionResolver.js";
import type { InventoryLedger } from "../inventoryLedger.js";
import type { RollContextPayload } from "../rollContextBuilder.js";
import { CombatContextManager } from "../../calculators/combatContext.js";
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

const arrow = (id: string, amount = 1) => [
  { type: "inventory_instance" as const, id, amount },
];

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
    const ledger = makeLedger([
      { id: "inv_plain", itemId: ARROW, quantity: 0 },
    ]);

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

describe("ActionResolver effect predicates", () => {
  let effectManager: EffectManager;
  let resourceManager: ResourceManager;

  beforeEach(() => {
    effectManager = new EffectManager();
    resourceManager = new ResourceManager();
  });

  it("skips apply_effect actions when required states are not met", () => {
    const gatedAction: ActionGrant = {
      id: "action_gated_state",
      name: "Gated State",
      activation: "special",
      effect: {
        type: "apply_effect",
        effectName: "Armor Worn",
        durationType: "manual",
        requiredStates: ["status_wearing_armor"],
        forbiddenStates: ["prone"],
        states: ["armor_worn"],
        modifiers: [],
        isSelfConcentration: false,
      },
    };

    const skipped = ActionResolver.execute(gatedAction, payload(), {
      effectManager,
      resourceManager,
      activeStates: [],
    });

    expect(skipped.executed).toBe(true);
    expect(effectManager.getActiveEffects()).toHaveLength(0);

    const applied = ActionResolver.execute(gatedAction, payload(), {
      effectManager,
      resourceManager,
      activeStates: ["status_wearing_armor"],
    });

    expect(applied.executed).toBe(true);
    expect(effectManager.getActiveEffects()).toHaveLength(1);
  });

  it("honours nested predicates for apply_effect actions", () => {
    const gatedAction: ActionGrant = {
      id: "action_gated_predicate",
      name: "Gated Predicate",
      activation: "special",
      effect: {
        type: "apply_effect",
        effectName: "Sneaking",
        durationType: "manual",
        predicates: {
          requiredStates: ["hidden"],
          forbiddenStates: ["seen"],
        },
        states: ["sneaking"],
        modifiers: [],
        isSelfConcentration: false,
        forbiddenStates: [],
        requiredStates: [],
      },
    };

    const skipped = ActionResolver.execute(gatedAction, payload(), {
      effectManager,
      resourceManager,
      activeStates: ["seen"],
    });

    expect(skipped.executed).toBe(true);
    expect(effectManager.getActiveEffects()).toHaveLength(0);

    const applied = ActionResolver.execute(gatedAction, payload(), {
      effectManager,
      resourceManager,
      activeStates: ["hidden"],
    });

    expect(applied.executed).toBe(true);
    expect(effectManager.getActiveEffects()).toHaveLength(1);
  });

  it("skips nested apply_effect predicates inside macros", () => {
    const macroAction: ActionGrant = {
      id: "action_macro_predicate",
      name: "Macro Predicate",
      activation: "special",
      effect: {
        type: "macro",
        effects: [
          {
            type: "apply_effect",
            effectName: "Sneaking",
            durationType: "manual",
            predicates: {
              requiredStates: ["hidden"],
              forbiddenStates: ["seen"],
            },
            states: ["sneaking"],
            modifiers: [],
            isSelfConcentration: false,
            forbiddenStates: [],
            requiredStates: [],
          },
        ],
      },
    };

    const skipped = ActionResolver.execute(macroAction, payload(), {
      effectManager,
      resourceManager,
      activeStates: ["seen"],
    });

    expect(skipped.executed).toBe(true);
    expect(effectManager.getActiveEffects()).toHaveLength(0);

    const applied = ActionResolver.execute(macroAction, payload(), {
      effectManager,
      resourceManager,
      activeStates: ["hidden"],
    });

    expect(applied.executed).toBe(true);
    expect(effectManager.getActiveEffects()).toHaveLength(1);
  });
});

describe("ActionResolver attack resolution", () => {
  let effectManager: EffectManager;
  let resourceManager: ResourceManager;

  beforeEach(() => {
    effectManager = new EffectManager();
    resourceManager = new ResourceManager();
  });

  it("applies authored damage dice rules while resolving attack effects", () => {
    const attackAction: ActionGrant = {
      ...bowShot,
      consumesAmmo: undefined,
      effect: {
        type: "attack",
        attackType: "ranged_weapon",
        attackStat: "DEX",
        range: 150,
        damage: [
          {
            sourceName: "Longbow",
            baseDice: "1d6",
            damageType: "piercing",
            scalingMode: "none",
            levelScaling: [],
          },
        ],
      },
    };

    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.9);

    const result = ActionResolver.execute(
      attackAction,
      { ...payload(), activeStates: ["status_wielding_two_handed"] },
      {
        effectManager,
        resourceManager,
        diceRules: [
          {
            target: "DAMAGE_ROLL",
            requiredStates: ["status_wielding_two_handed"],
            mutator: { type: "reroll_once", triggerOn: [1] },
          },
        ],
      },
    );

    expect(result.executed).toBe(true);
    expect(result.rollResults?.[1]?.total).toBe(6);

    randomSpy.mockRestore();
  });

  it("rolls maximized damage segments at their maximum values", () => {
    const attackAction: ActionGrant = {
      ...bowShot,
      consumesAmmo: undefined,
      effect: {
        type: "attack",
        attackType: "ranged_weapon",
        attackStat: "DEX",
        range: 150,
        damage: [
          {
            sourceName: "Longbow",
            baseDice: "2d6",
            maximized: true,
            damageType: "piercing",
            scalingMode: "none",
            levelScaling: [],
          },
        ],
      },
    };

    const result = ActionResolver.execute(attackAction, payload(), {
      effectManager,
      resourceManager,
    });

    expect(result.executed).toBe(true);
    expect(result.rollResults?.[1]).toMatchObject({
      total: 12,
      rolls: [6, 6],
      modifier: 0,
    });
  });

  it("maximizes flagged critical damage only on a natural 20", () => {
    const attackAction: ActionGrant = {
      ...bowShot,
      consumesAmmo: undefined,
      effect: {
        type: "attack",
        attackType: "ranged_weapon",
        attackStat: "DEX",
        range: 150,
        criticalDamageMaximized: true,
        damage: [
          {
            sourceName: "Longbow",
            baseDice: "1d6",
            damageType: "piercing",
            scalingMode: "none",
            levelScaling: [],
          },
        ],
      },
    };

    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.999)
      .mockReturnValueOnce(0);

    const result = ActionResolver.execute(attackAction, payload(), {
      effectManager,
      resourceManager,
    });

    expect(result.executed).toBe(true);
    expect(result.rollResults?.[1]?.rolls).toEqual([6]);

    randomSpy.mockRestore();
  });

  it("filters damage dice rules by required damage type", () => {
    const attackAction: ActionGrant = {
      ...bowShot,
      consumesAmmo: undefined,
      effect: {
        type: "attack",
        attackType: "ranged_weapon",
        attackStat: "DEX",
        range: 150,
        damage: [
          {
            sourceName: "Longbow",
            baseDice: "1d6",
            damageType: "piercing",
            scalingMode: "none",
            levelScaling: [],
          },
        ],
      },
    };

    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.9);

    const mismatched = ActionResolver.execute(attackAction, payload(), {
      effectManager,
      resourceManager,
      diceRules: [
        {
          target: "DAMAGE_ROLL",
          requiredStates: [],
          requiredDamageType: "fire",
          mutator: { type: "reroll_once", triggerOn: [1] },
        },
      ],
    });

    const matched = ActionResolver.execute(attackAction, payload(), {
      effectManager,
      resourceManager,
      diceRules: [
        {
          target: "DAMAGE_ROLL",
          requiredStates: [],
          requiredDamageType: "piercing",
          mutator: { type: "reroll_once", triggerOn: [1] },
        },
      ],
    });

    expect(mismatched.rollResults?.[1]?.total).toBe(1);
    expect(matched.rollResults?.[1]?.total).toBe(6);

    randomSpy.mockRestore();
  });

  it("emits both an attack roll and a damage roll for authored attack effects", () => {
    const attackAction: ActionGrant = {
      ...bowShot,
      consumesAmmo: undefined,
      effect: {
        type: "attack",
        attackType: "melee_weapon",
        attackStat: "STR",
        range: 5,
        damage: [
          {
            sourceName: "Sword",
            baseDice: "1d6",
            damageType: "slashing",
            scalingMode: "none",
            levelScaling: [],
          },
        ],
      },
    };

    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.9);

    const result = ActionResolver.execute(attackAction, payload(), {
      effectManager,
      resourceManager,
    });

    expect(result.executed).toBe(true);
    expect(result.rollResults).toHaveLength(2);
    expect(result.rollResults?.[0]).toMatchObject({
      target: "ATTACK_ROLL",
      total: 1,
    });
    expect(result.rollResults?.[1]).toMatchObject({
      target: "DAMAGE_ROLL",
      total: 6,
    });

    randomSpy.mockRestore();
  });

  it("applies embedded weapon attack bonuses and damage bonuses", () => {
    const weaponAction: ActionGrant = {
      ...bowShot,
      consumesAmmo: undefined,
      effect: {
        type: "attack",
        attackType: "melee_weapon",
        attackStat: "STR",
        attackBonus: 5,
        damageBonus: 3,
        range: 5,
        damage: [
          {
            sourceName: "Sword",
            baseDice: "1d6",
            damageType: "slashing",
            scalingMode: "none",
            levelScaling: [],
          },
        ],
      },
    };

    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.9);

    const result = ActionResolver.execute(weaponAction, payload(), {
      effectManager,
      resourceManager,
    });

    expect(result.executed).toBe(true);
    expect(result.rollResults?.[0]).toMatchObject({
      target: "ATTACK_ROLL",
      total: 6,
      modifier: 5,
    });
    expect(result.rollResults?.[1]).toMatchObject({
      target: "DAMAGE_ROLL",
      total: 9,
      modifier: 3,
    });

    randomSpy.mockRestore();
  });
});

describe("ActionResolver ability-check resolution", () => {
  let effectManager: EffectManager;
  let resourceManager: ResourceManager;

  beforeEach(() => {
    effectManager = new EffectManager();
    resourceManager = new ResourceManager();
  });

  it("rerolls a natural 1 for authored ability checks", () => {
    const abilityCheckAction: ActionGrant = {
      ...bowShot,
      consumesAmmo: undefined,
      effect: {
        type: "ability_check",
      } as ActionGrant["effect"],
    };

    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.9);

    const result = ActionResolver.execute(abilityCheckAction, payload(), {
      effectManager,
      resourceManager,
      diceRules: [
        {
          target: "ABILITY_CHECK",
          requiredStates: [],
          mutator: { type: "reroll_once", triggerOn: [1] },
        },
      ],
    });

    expect(result.executed).toBe(true);
    expect(result.rollResults?.[0]?.target).toBe("ABILITY_CHECK");
    expect(result.rollResults?.[0]?.total).toBe(19);

    randomSpy.mockRestore();
  });
});

describe("ActionResolver save resolution", () => {
  let effectManager: EffectManager;
  let resourceManager: ResourceManager;

  beforeEach(() => {
    effectManager = new EffectManager();
    resourceManager = new ResourceManager();
  });

  it("rolls a saving throw when the action effect is a save", () => {
    const saveAction: ActionGrant = {
      ...bowShot,
      consumesAmmo: undefined,
      effect: {
        type: "save",
        areaOfEffect: { shape: "single_target", size: 1 },
        savingThrow: {
          targetStat: "CON",
          dcCalculation: {
            base: 10,
            scalingStat: "CON",
            includeProficiency: false,
          },
          saveEffect: "half_damage",
        },
        damage: [
          {
            sourceName: "Fireball",
            baseDice: "1d6",
            damageType: "fire",
            scalingMode: "none",
            levelScaling: [],
          },
        ],
      },
    };

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.999);

    const result = ActionResolver.execute(saveAction, payload(), {
      effectManager,
      resourceManager,
    });

    expect(result.executed).toBe(true);
    expect(result.rollResults?.[0]?.target).toBe("SAVING_THROW");
    expect(result.rollResults?.[0]?.total).toBe(20);

    randomSpy.mockRestore();
  });
});

describe("ActionResolver damage rider resolution", () => {
  let effectManager: EffectManager;
  let resourceManager: ResourceManager;

  beforeEach(() => {
    effectManager = new EffectManager();
    resourceManager = new ResourceManager();
  });

  it("rolls damage for a damage rider effect", () => {
    const riderAction: ActionGrant = {
      ...bowShot,
      consumesAmmo: undefined,
      effect: {
        type: "damage_rider",
        requiredWeaponProperties: [],
        damage: [
          {
            sourceName: "Fireball",
            baseDice: "1d6",
            damageType: "fire",
            scalingMode: "none",
            levelScaling: [],
          },
        ],
      },
    };

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.95);

    const result = ActionResolver.execute(riderAction, payload(), {
      effectManager,
      resourceManager,
    });

    expect(result.executed).toBe(true);
    expect(result.rollResults?.[0]?.target).toBe("DAMAGE_ROLL");
    expect(result.rollResults?.[0]?.total).toBe(6);

    randomSpy.mockRestore();
  });
});

describe("ActionResolver macro actions", () => {
  let effectManager: EffectManager;
  let resourceManager: ResourceManager;

  beforeEach(() => {
    effectManager = new EffectManager();
    resourceManager = new ResourceManager();
  });

  it("executes nested apply_effect handlers inside a macro action", () => {
    const macroAction: ActionGrant = {
      ...bowShot,
      consumesAmmo: undefined,
      id: "action_macro_drop_to_one_hp",
      effect: {
        type: "macro",
        effects: [
          {
            type: "apply_effect",
            effectName: "Drop to One HP",
            durationType: "manual",
            states: ["drop_to_one_hp"],
            modifiers: [],
            isSelfConcentration: false,
            requiredStates: [],
            forbiddenStates: [],
          },
        ],
      },
    };

    const result = ActionResolver.execute(macroAction, payload(), {
      effectManager,
      resourceManager,
    });

    expect(result.executed).toBe(true);
    expect(effectManager.getActiveStates()).toContain("drop_to_one_hp");
  });
});

describe("ActionResolver summon resolution", () => {
  let effectManager: EffectManager;
  let resourceManager: ResourceManager;

  beforeEach(() => {
    effectManager = new EffectManager();
    resourceManager = new ResourceManager();
  });

  it("creates active summon state from the authored entity templates", () => {
    const summonAction: ActionGrant = {
      ...bowShot,
      consumesAmmo: undefined,
      id: "action_tinker_construct",
      name: "Construct Clockwork Device",
      effect: {
        type: "summon",
        entityTemplateIds: ["actor_clockwork_toy", "actor_music_box"],
        maxActive: 3,
        durationHours: 24,
      } as ActionGrant["effect"],
    };

    const result = ActionResolver.execute(summonAction, payload(), {
      effectManager,
      resourceManager,
    });

    expect(result.executed).toBe(true);
    expect(effectManager.getActiveStates()).toEqual(
      expect.arrayContaining(["actor_clockwork_toy", "actor_music_box"]),
    );
    expect(effectManager.getActiveActors()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          templateId: "actor_clockwork_toy",
          displayLabel: "Clockwork Toy",
          controller: "player",
          lifecycleState: "active",
          availableActions: expect.arrayContaining([
            expect.objectContaining({
              id: "action_actor_clockwork_toy_scuttle",
            }),
          ]),
          sourceEffectInstanceId: expect.any(String),
        }),
        expect.objectContaining({
          templateId: "actor_music_box",
          displayLabel: "Music Box",
          controller: "player",
          lifecycleState: "active",
          availableActions: expect.arrayContaining([
            expect.objectContaining({ id: "action_actor_music_box_play" }),
          ]),
          sourceEffectInstanceId: expect.any(String),
        }),
      ]),
    );
  });

  it("stops a summon action once the active limit has been reached", () => {
    const summonAction: ActionGrant = {
      ...bowShot,
      consumesAmmo: undefined,
      id: "action_tinker_construct",
      name: "Construct Clockwork Device",
      effect: {
        type: "summon",
        effectTag: "clockwork_toy_summon",
        entityTemplateIds: ["actor_clockwork_toy"],
        maxActive: 1,
      } as ActionGrant["effect"],
    };

    const first = ActionResolver.execute(summonAction, payload(), {
      effectManager,
      resourceManager,
    });
    const second = ActionResolver.execute(
      {
        ...summonAction,
        effect: {
          ...(summonAction.effect as Extract<
            ActionGrant["effect"],
            { type: "summon" }
          >),
          entityTemplateIds: ["actor_music_box"],
        },
      },
      payload(),
      { effectManager, resourceManager },
    );

    expect(first.executed).toBe(true);
    expect(second.executed).toBe(false);
    expect(second.reason).toBe("summon_limit_reached");
    expect(effectManager.getActiveStates()).toEqual(["actor_clockwork_toy"]);
  });

  it("removes a summon from the active state when it is dismissed", () => {
    const summarizeAction: ActionGrant = {
      ...bowShot,
      consumesAmmo: undefined,
      id: "action_tinker_construct",
      name: "Construct Clockwork Device",
      effect: {
        type: "summon",
        effectTag: "clockwork_toy_summon",
        entityTemplateIds: ["actor_clockwork_toy"],
      },
    };

    const result = ActionResolver.execute(summarizeAction, payload(), {
      effectManager,
      resourceManager,
    });

    expect(result.executed).toBe(true);

    const activeEffects = effectManager.getActiveEffects();
    expect(activeEffects).toHaveLength(1);

    effectManager.removeEffect(activeEffects[0]!.instanceId);

    expect(effectManager.getActiveStates()).toEqual([]);
    expect(effectManager.getActiveActors()).toEqual([]);
  });

  it("dismisses an active summon when the action targets an existing summon effect", () => {
    const summonAction: ActionGrant = {
      ...bowShot,
      consumesAmmo: undefined,
      id: "action_tinker_construct",
      name: "Construct Clockwork Device",
      effect: {
        type: "summon",
        effectTag: "clockwork_toy_summon",
        entityTemplateIds: ["actor_clockwork_toy"],
      },
    };

    const dismissAction: ActionGrant = {
      ...bowShot,
      consumesAmmo: undefined,
      id: "action_dismiss_summon",
      name: "Dismiss Summon",
      effect: {
        type: "remove_effect",
        effectTag: "clockwork_toy_summon",
      },
    };

    const summonResult = ActionResolver.execute(summonAction, payload(), {
      effectManager,
      resourceManager,
    });
    expect(summonResult.executed).toBe(true);

    const dismissResult = ActionResolver.execute(dismissAction, payload(), {
      effectManager,
      resourceManager,
    });

    expect(dismissResult.executed).toBe(true);
    expect(effectManager.getActiveStates()).toEqual([]);
    expect(effectManager.getActiveActors()).toEqual([]);
  });

  it("removes a summon when its authored duration has elapsed", () => {
    const summonAction: ActionGrant = {
      ...bowShot,
      consumesAmmo: undefined,
      id: "action_tinker_construct",
      name: "Construct Clockwork Device",
      effect: {
        type: "summon",
        entityTemplateIds: ["actor_clockwork_toy"],
        durationHours: 24,
      },
    };

    const summonResult = ActionResolver.execute(summonAction, payload(), {
      effectManager,
      resourceManager,
    });

    expect(summonResult.executed).toBe(true);

    for (let index = 0; index < 60; index += 1) {
      effectManager.tickTurnStart();
    }

    expect(effectManager.getActiveStates()).toEqual([]);
    expect(effectManager.getActiveActors()).toEqual([]);
  });
});

describe("ActionResolver trigger dispatch", () => {
  let effectManager: EffectManager;
  let resourceManager: ResourceManager;

  beforeEach(() => {
    effectManager = new EffectManager();
    resourceManager = new ResourceManager();
    resourceManager.initializeFromGrants([
      {
        id: "resource_relentless_endurance",
        name: "Relentless Endurance",
        maxCharges: 1,
        resetOn: "long_rest",
      },
    ]);
  });

  it("dispatches a trigger to a macro action and spends its resource", () => {
    const macroAction: ActionGrant = {
      id: "action_macro_drop_to_one_hp",
      name: "Drop to One HP",
      activation: "special",
      effect: {
        type: "macro",
        effects: [
          {
            type: "apply_effect",
            effectName: "Drop to One HP",
            durationType: "manual",
            states: ["drop_to_one_hp"],
            modifiers: [],
            isSelfConcentration: false,
            requiredStates: [],
            forbiddenStates: [],
          },
        ],
      },
    };

    const results = ActionResolver.dispatchEvent(
      "ON_HP_REDUCED_TO_ZERO",
      [
        {
          listenFor: "ON_HP_REDUCED_TO_ZERO",
          executeAction: "action_macro_drop_to_one_hp",
          consumeResource: "resource_relentless_endurance",
        },
      ],
      { action_macro_drop_to_one_hp: macroAction },
      { effectManager, resourceManager },
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.executed).toBe(true);
    expect(effectManager.getActiveStates()).toContain("drop_to_one_hp");
    expect(resourceManager.consume("resource_relentless_endurance", 1)).toBe(
      false,
    );
  });
});

describe("ActionResolver cost settlement", () => {
  let effectManager: EffectManager;
  let resourceManager: ResourceManager;
  let combatContext: CombatContextManager;

  beforeEach(() => {
    effectManager = new EffectManager();
    resourceManager = new ResourceManager();
    combatContext = new CombatContextManager();
    combatContext.beginTurn({ kind: "player" });
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
      {
        effectManager,
        resourceManager,
        inventoryLedger: ledger,
        combatContext,
      },
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
      {
        effectManager,
        resourceManager,
        inventoryLedger: ledger,
        combatContext,
      },
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
      {
        effectManager,
        resourceManager,
        inventoryLedger: ledger,
        combatContext,
      },
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
      combatContext,
    });

    expect(result.executed).toBe(true);
    // omitting the cost must not make the action free
    expect(resourceManager.consume("pool_ki", 2)).toBe(false);
  });

  it("spends reaction economy for a reaction action during combat", () => {
    const reactionAction: ActionGrant = {
      ...bowShot,
      id: "action_reactive_parry",
      name: "Reactive Parry",
      activation: "reaction",
      consumesAmmo: undefined,
    };

    const result = ActionResolver.execute(reactionAction, payload(), {
      effectManager,
      resourceManager,
      combatContext,
    });

    expect(result.executed).toBe(true);
    expect(combatContext.getContext().economy.reactionAvailable).toBe(false);
    expect(combatContext.getContext().economy.spentReactionSourceId).toBe(
      "action_reactive_parry",
    );
  });

  it("rejects a second reaction action after the reaction is spent", () => {
    const reactionAction: ActionGrant = {
      ...bowShot,
      id: "action_reactive_parry",
      name: "Reactive Parry",
      activation: "reaction",
      consumesAmmo: undefined,
    };

    const first = ActionResolver.execute(reactionAction, payload(), {
      effectManager,
      resourceManager,
      combatContext,
    });
    const second = ActionResolver.execute(reactionAction, payload(), {
      effectManager,
      resourceManager,
      combatContext,
    });

    expect(first.executed).toBe(true);
    expect(second.executed).toBe(false);
    expect(second.reason).toBe("reaction_unavailable");
  });

  it("refunds reaction economy if a later resource cost aborts the action", () => {
    const reactionKiAction: ActionGrant = {
      ...bowShot,
      id: "action_reactive_ki_guard",
      name: "Reactive Ki Guard",
      activation: "reaction",
      consumesAmmo: undefined,
      consumesResource: "pool_ki",
    };

    resourceManager.consume("pool_ki", 2);

    const result = ActionResolver.execute(reactionKiAction, payload(), {
      effectManager,
      resourceManager,
      combatContext,
    });

    expect(result.executed).toBe(false);
    expect(result.reason).toBe("insufficient_resource");
    expect(combatContext.getContext().economy.reactionAvailable).toBe(true);
    expect(
      combatContext.getContext().economy.spentReactionSourceId,
    ).toBeUndefined();
  });

  it("spends bonus action economy for bonus actions during combat", () => {
    const bonusAction: ActionGrant = {
      ...bowShot,
      id: "action_offhand_strike",
      name: "Offhand Strike",
      activation: "bonus_action",
      consumesAmmo: undefined,
    };

    const first = ActionResolver.execute(bonusAction, payload(), {
      effectManager,
      resourceManager,
      combatContext,
    });
    const second = ActionResolver.execute(bonusAction, payload(), {
      effectManager,
      resourceManager,
      combatContext,
    });

    expect(first.executed).toBe(true);
    expect(second.executed).toBe(false);
    expect(second.reason).toBe("bonus_action_unavailable");
  });
});
