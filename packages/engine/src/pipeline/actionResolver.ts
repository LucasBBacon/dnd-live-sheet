import {
  costsAttack,
  costsCombatEconomy,
  type ActionGrant,
  type AreaOfEffect,
  type AttackEffect,
  type DamageSegment,
  type DamageType,
  type DiceRule,
  type EngineEvent,
  type TriggerGrant,
  type Ability,
} from "@project/shared";
import type { ActiveEffect, EffectManager } from "../calculators/effects.js";
import type { CombatContextManager } from "../calculators/combatContext.js";
import type { ResourceManager } from "../calculators/resources.js";
import { resolveSelfSaveDc, selfSaveCounterId } from "../calculators/saveDc.js";
import { DiceEngine } from "../utils/diceParser.js";
import {
  resolveEquipmentDefinition,
  type RuleSnapshotLookup,
} from "../rules/ruleLookup.js";
import { upcastDice } from "./actionScaling.js";
import type { InventoryLedger } from "./inventoryLedger.js";
import type {
  ConsumedResource,
  RollContextPayload,
} from "./rollContextBuilder.js";
import { createSummonActorInstances } from "../rules/summonActorDictionary.js";

const generateId = () => Math.random().toString(36).substring(2, 9);

export type ActionFailureReason =
  | "insufficient_resource"
  | "action_unavailable"
  | "bonus_action_unavailable"
  | "reaction_unavailable"
  | "missing_stack"
  | "insufficient_stack"
  | "wrong_ammo"
  | "ammo_not_selected"
  | "no_ledger"
  | "unrequested_cost"
  | "summon_limit_reached";

export interface ActionRollResult {
  total: number;
  rolls: number[];
  modifier: number;
  target: "DAMAGE_ROLL" | "ATTACK_ROLL" | "SAVING_THROW" | "ABILITY_CHECK";
  damageType?: DamageType;
  label?: string;
  summary?: string;
}

/**
 * A saving throw an action asks of its targets: the ability, the caster's DC,
 * what a success does, and where. The sheet models one character, so the
 * roll belongs to the table; this is what the table needs to make it.
 */
export interface TargetSave {
  ability: Ability;
  dc: number;
  onSuccess: "half_damage" | "no_damage" | "negates_effect";
  area?: AreaOfEffect;
  label: string;
}

export interface ActionResult {
  executed: boolean;
  reason?: ActionFailureReason;
  /** Which cost failed, for a message the player can act on. */
  offendingId?: string;
  rollResults?: ActionRollResult[];
  /**
   * Set when the action ran despite its activation already being spent.
   *
   * Only possible under economyPolicy "track". The action still happened - the
   * flag exists so the sheet can say so rather than pretend the turn was legal.
   */
  economyOverdrawn?: boolean;
  /**
   * Rules the engine could not enforce, for the sheet to show the player.
   *
   * On the result rather than on an ActionRollResult because the note belongs
   * to the action: a net has no damage roll to hang one on.
   */
  notes?: string[];
  /**
   * Saving throws this action asks of its targets. On the result rather than
   * as an ActionRollResult because nothing was rolled: the DC is the
   * caster's, and the roll belongs to whoever is caught in it.
   */
  targetSaves?: TargetSave[];
}

/**
 * What to do when an action costs an activation the character has already used.
 *
 * "enforce" refuses it. "track" runs it anyway and reports the overdraft, which
 * is what a live sheet wants: tables bend the economy constantly - a DM grants
 * a free action, a reaction is retconned - and a sheet that refuses becomes
 * something the player fights rather than uses.
 *
 * Policy belongs to the caller. The resolver reports; it does not decide how
 * strict the table is.
 */
export type EconomyPolicy = "enforce" | "track";

export interface ActionExecutionContext {
  effectManager: EffectManager;
  resourceManager: ResourceManager;
  combatContext?: CombatContextManager;
  /** Required only for actions that spend ammunition. */
  inventoryLedger?: InventoryLedger;
  /**
   * The stack an item action was invoked from.
   *
   * Required only when the action declares `consumesSelf`. It is not part of
   * the roll payload because there is nothing for the player to choose: the
   * server found this action *on* this instance, so the instance is already
   * decided by the time the roll is prepared.
   */
  selfInstanceId?: string;
  snapshot?: RuleSnapshotLookup;
  activeStates?: string[];
  diceRules?: DiceRule[];
  /** Defaults to "enforce", preserving strict behaviour for existing callers. */
  economyPolicy?: EconomyPolicy;
  /**
   * How many attacks one Attack action grants, from
   * DerivedStatEngine.calculateAttacksPerAction. Defaults to one.
   */
  attacksPerAction?: number;
  saveModifiers?: Record<Ability, number>;
  abilityScores?: Record<Ability, number>;
  proficiencyBonus?: number;
  /**
   * The spell being cast and the slot paying for it. Each damage segment with
   * `perSlotAbove` adds that expression once per level the slot sits above
   * the spell. Absent for anything a slot did not pay for.
   */
  spellCast?: { spellLevel: number; castLevel: number };
}

const ok: ActionResult = { executed: true };

const fail = (
  reason: ActionFailureReason,
  offendingId?: string,
): ActionResult => ({
  executed: false,
  reason,
  ...(offendingId !== undefined && { offendingId }),
});

const getStatePredicate = (
  effect: ActionGrant["effect"],
): {
  requiredStates: string[];
  forbiddenStates: string[];
} => {
  const topLevelRequiredStates =
    "requiredStates" in effect && Array.isArray(effect.requiredStates)
      ? effect.requiredStates
      : [];
  const topLevelForbiddenStates =
    "forbiddenStates" in effect && Array.isArray(effect.forbiddenStates)
      ? effect.forbiddenStates
      : [];

  const predicateGroup =
    "predicates" in effect &&
    effect.predicates &&
    typeof effect.predicates === "object"
      ? effect.predicates
      : undefined;

  const requiredStates = [
    ...topLevelRequiredStates,
    ...(predicateGroup?.requiredStates ?? []),
  ];
  const forbiddenStates = [
    ...topLevelForbiddenStates,
    ...(predicateGroup?.forbiddenStates ?? []),
  ];

  return { requiredStates, forbiddenStates };
};

const hasStatePredicate = (effect: ActionGrant["effect"]): boolean => {
  const { requiredStates, forbiddenStates } = getStatePredicate(effect);
  return requiredStates.length > 0 || forbiddenStates.length > 0;
};

/**
 * Whether an action may be used in these states.
 *
 * Exported because the sheet gates on the same rule: the web app decides
 * whether to offer an action, the resolver decides whether to apply it, and
 * both must agree about what an effect's states mean (#76).
 * @param effect The action's effect, whose predicate may be top level or in a predicates group
 * @param activeStates The states that currently hold
 * @returns True when every required state holds and no forbidden one does
 */
export const matchesStatePredicate = (
  effect: ActionGrant["effect"],
  activeStates: string[],
): boolean => {
  const { requiredStates, forbiddenStates } = getStatePredicate(effect);

  const meetsRequired = requiredStates.every((state) =>
    activeStates.includes(state),
  );
  const hasForbidden = forbiddenStates.some((state) =>
    activeStates.includes(state),
  );

  return meetsRequired && !hasForbidden;
};

const activationFailureReason = (
  activation: ActionGrant["activation"],
): ActionFailureReason | null => {
  switch (activation) {
    // an attack that cannot be made is an Attack action that could not be
    // afforded, so it reports as the action it would have cost
    case "action":
    case "attack":
      return "action_unavailable";
    case "bonus_action":
      return "bonus_action_unavailable";
    case "reaction":
      return "reaction_unavailable";
    default:
      return null;
  }
};

/**
 * ActionResolver handles the execution of proactive abilities, translating
 * static data blueprints into live engine state.
 */
export class ActionResolver {
  /**
   * Executes an action.
   *
   * Costs are settled before the effect fires, in two phases: everything the
   * roll spends is validated first, and only then committed. A roll that
   * spends both ki and a +1 arrow must not swallow the arrow and then discover
   * the ki pool is empty.
   *
   * @param action The action being executed.
   * @param payload What the player chose in the roll preparation step —
   *   notably *which* stack of ammunition, when they carry more than one kind.
   * @param context Injected managers, plus the inventory ledger for ammunition.
   */
  public static execute(
    action: ActionGrant,
    payload: RollContextPayload,
    context: ActionExecutionContext,
  ): ActionResult {
    const requested = payload.consumedResources ?? [];
    const activeStates =
      payload.activeStates.length > 0
        ? payload.activeStates
        : (context.activeStates ?? []);

    if (
      hasStatePredicate(action.effect) &&
      !matchesStatePredicate(action.effect, activeStates)
    ) {
      return ok;
    }

    // 1 - settle every cost, or none of them
    const settlement = this.settleCosts(action, requested, context);
    if (!settlement.executed) return settlement;

    // 2 - route the effect to correct handler
    const outcome = this.executeEffect(
      action.effect,
      action,
      context,
      payload.activeStates,
    );

    // 3 - a table note belongs to the action, so it rides out regardless of
    // which effect ran - or whether any of them rolled anything
    const withNote =
      action.tableNote === undefined
        ? outcome
        : { ...outcome, notes: [...(outcome.notes ?? []), action.tableNote] };

    // an overdraft is settled at cost time but only meaningful once the action
    // has actually happened, so it rides out on the effect's result
    return settlement.economyOverdrawn
      ? { ...withNote, economyOverdrawn: true }
      : withNote;
  }

  public static dispatchEvent(
    eventName: EngineEvent,
    triggerGrants: TriggerGrant[],
    actionLookup: Record<string, ActionGrant>,
    context: ActionExecutionContext,
    payload: RollContextPayload = { actionId: "", activeStates: [] },
  ): ActionResult[] {
    const results: ActionResult[] = [];

    for (const trigger of triggerGrants) {
      if (trigger.listenFor !== eventName) continue;

      const actionId = actionLookup[trigger.executeAction]
        ? trigger.executeAction
        : trigger.executeAction.toLowerCase();
      const action = actionLookup[actionId];
      if (!action) {
        results.push(ok);
        continue;
      }

      if (trigger.consumeResource) {
        const consumed = context.resourceManager.consume(
          trigger.consumeResource,
          1,
        );
        if (!consumed) {
          results.push(fail("insufficient_resource", trigger.consumeResource));
          continue;
        }
      }

      const result = this.execute(action, payload, context);
      if (!result.executed && trigger.consumeResource) {
        context.resourceManager.restore(trigger.consumeResource, 1);
      }

      results.push(result);
    }

    return results;
  }

  private static resolveTargetRoll(
    roll: {
      total: number;
      rolls: number[];
      modifier: number;
    },
    target: "DAMAGE_ROLL" | "ATTACK_ROLL" | "SAVING_THROW" | "ABILITY_CHECK",
    context: ActionExecutionContext,
    activeStates: string[] = [],
    sides: number,
    requiredDamageType?: DamageType,
  ) {
    return DiceEngine.applyDiceRulesToRollResult(
      roll,
      context.diceRules ?? [],
      target,
      {
        activeStates,
        sides,
        ...(context.abilityScores !== undefined && {
          abilityScores: context.abilityScores,
        }),
        ...(requiredDamageType !== undefined ? { requiredDamageType } : {}),
        rollFn: (nextSides) => DiceEngine.rollDigital(`1d${nextSides}`).total,
      },
    );
  }

  /**
   * One damage segment, rolled: upcast dice added, maximised when the segment
   * or the critical rule says so, and passed through the character's dice
   * rules.
   */
  private static rollDamageSegment(
    segment: DamageSegment,
    context: ActionExecutionContext,
    activeStates: string[],
    options: { maximize?: boolean; bonus?: number; label?: string } = {},
  ): ActionRollResult {
    const dice = upcastDice(segment, context.spellCast);
    const { sides } = DiceEngine.parse(dice);
    const roll =
      segment.maximized || options.maximize
        ? DiceEngine.rollMaximized(dice)
        : DiceEngine.rollDigital(dice);
    const resolvedRoll = this.resolveTargetRoll(
      roll,
      "DAMAGE_ROLL",
      context,
      activeStates,
      sides,
      segment.damageType,
    );

    return {
      total: resolvedRoll.total + (options.bonus ?? 0),
      rolls: resolvedRoll.rolls,
      modifier: options.bonus !== undefined ? options.bonus : roll.modifier,
      target: "DAMAGE_ROLL",
      damageType: segment.damageType,
      ...(options.label !== undefined && { label: options.label }),
    };
  }

  /**
   * One attack roll and its damage. A critical hit rolls the pool resolved for
   * it ahead of the roll - already doubled, carrying whatever critical-hit
   * modifiers matched - and an action with none falls back to its base dice.
   */
  private static rollAttack(
    effect: AttackEffect,
    context: ActionExecutionContext,
    activeStates: string[],
    label: string | undefined,
  ): ActionRollResult[] {
    const attackBonus = effect.attackBonus ?? 0;
    const damageBonus = effect.damageBonus ?? 0;

    const attackRoll = DiceEngine.rollDigital("1d20");
    const isCriticalHit = attackRoll.rolls[0] === 20;
    const resolvedAttackRoll = this.resolveTargetRoll(
      attackRoll,
      "ATTACK_ROLL",
      context,
      activeStates,
      20,
    );

    const results: ActionRollResult[] = [
      {
        total: resolvedAttackRoll.total + attackBonus,
        rolls: resolvedAttackRoll.rolls,
        modifier: attackBonus,
        target: "ATTACK_ROLL",
        ...(label !== undefined && { label }),
      },
    ];

    const segments =
      isCriticalHit && effect.criticalDamage?.length
        ? effect.criticalDamage
        : effect.damage;

    segments.forEach((segment, index) => {
      results.push(
        this.rollDamageSegment(segment, context, activeStates, {
          ...(isCriticalHit &&
            effect.criticalDamageMaximized === true && { maximize: true }),
          ...(index === 0 && { bonus: damageBonus }),
          ...(label !== undefined && { label }),
        }),
      );
    });

    return results;
  }

  private static executeEffect(
    effect: ActionGrant["effect"],
    action: ActionGrant,
    context: ActionExecutionContext,
    activeStates: string[] = [],
  ): ActionResult {
    if (hasStatePredicate(effect)) {
      const resolvedActiveStates =
        activeStates.length > 0 ? activeStates : (context.activeStates ?? []);
      if (!matchesStatePredicate(effect, resolvedActiveStates)) {
        return ok;
      }
    }

    switch (effect.type) {
      case "remove_effect":
        context.effectManager.removeEffectsByTag(effect.effectTag);
        return ok;

      case "end_concentration":
        context.effectManager.dropConcentration();
        return ok;

      case "apply_effect": {
        const blueprint = effect;
        const instanceId = `effect_${generateId()}`;
        const sourceName = blueprint.effectName || action.name;

        // translate static blueprint into live ActiveEffect
        const newEffect: ActiveEffect = {
          instanceId,
          sourceName,
          durationType: blueprint.durationType,
          durationRemaining: blueprint.durationRounds,
          isSelfConcentration: blueprint.isSelfConcentration,
          ...(blueprint.effectTag === undefined
            ? {}
            : { effectTag: blueprint.effectTag }),
          // an authored blueprint carries a BaseModifier, but the calculators
          // consume RuntimeModifiers: without the identity fields stamped on
          // here, every one of these would be dropped by the `!isActive` guard
          // and any that survived would attribute itself to "undefined".
          // Cloned rather than spread in place so the static pack data the
          // blueprint points at is never written through.
          modifiers: blueprint.modifiers.map((modifier, index) => ({
            ...structuredClone(modifier),
            id: `${instanceId}:${index}`,
            sourceName,
            sourceOrigin: `action:${action.id}`,
            isActive: true,
          })),
          grantedStates: [...blueprint.states],
        };

        context.effectManager.addEffect(newEffect);
        return ok;
      }
      case "attack": {
        const resolvedActiveStates =
          activeStates.length > 0 ? activeStates : (context.activeStates ?? []);
        // a repeat rolls whole attacks - Eldritch Blast's beams - each with
        // its own d20, its own critical check and its own damage
        const count = effect.repeatCount ?? 1;
        const rollResults: ActionRollResult[] = [];
        for (let beam = 1; beam <= count; beam += 1) {
          rollResults.push(
            ...this.rollAttack(
              effect,
              context,
              resolvedActiveStates,
              effect.repeat ? `${effect.repeat.label} ${beam}` : undefined,
            ),
          );
        }

        return { ...ok, rollResults };
      }

      case "summon": {
        const activeSummons = context.effectManager
          .getActiveEffects()
          .filter((entry) => entry.kind === "summon");

        if (
          effect.maxActive !== undefined &&
          activeSummons.length >= effect.maxActive
        ) {
          return fail("summon_limit_reached");
        }

        const effectInstanceId = `effect_${generateId()}`;
        const summonEntities = createSummonActorInstances(
          effectInstanceId,
          undefined,
          effect.entityTemplateIds,
        );

        const newEffect: ActiveEffect = {
          instanceId: effectInstanceId,
          sourceName: action.name,
          ...(effect.effectTag === undefined
            ? {}
            : { effectTag: effect.effectTag }),
          durationType:
            effect.durationHours !== undefined ? "rounds" : "manual",
          durationRemaining:
            effect.durationHours !== undefined
              ? Math.max(1, Math.ceil((effect.durationHours * 60) / 24))
              : undefined,
          isSelfConcentration: false,
          modifiers: [],
          grantedStates: [...effect.entityTemplateIds],
          kind: "summon",
          summonEntities: summonEntities.map(
            ({ templateId, displayLabel }) => ({
              templateId,
              label: displayLabel,
            }),
          ),
        };

        if (effect.durationHours !== undefined) {
          newEffect.durationHours = effect.durationHours;
        }

        context.effectManager.addEffect(newEffect);
        context.effectManager.addActors(summonEntities);
        return ok;
      }

      case "macro": {
        // a macro is one action, so what its parts produced is the action's:
        // Faerie Fire's save line and its concentration are one cast
        const rollResults: ActionRollResult[] = [];
        const targetSaves: TargetSave[] = [];
        const notes: string[] = [];

        for (const nestedEffect of effect.effects) {
          const nestedResult = this.executeEffect(
            nestedEffect,
            action,
            context,
            activeStates,
          );
          if (!nestedResult.executed) return nestedResult;

          rollResults.push(...(nestedResult.rollResults ?? []));
          targetSaves.push(...(nestedResult.targetSaves ?? []));
          notes.push(...(nestedResult.notes ?? []));
        }

        return {
          ...ok,
          ...(rollResults.length > 0 && { rollResults }),
          ...(targetSaves.length > 0 && { targetSaves }),
          ...(notes.length > 0 && { notes }),
        };
      }

      case "damage_rider": {
        const resolvedActiveStates =
          activeStates.length > 0 ? activeStates : (context.activeStates ?? []);

        return {
          ...ok,
          rollResults: effect.damage.map((segment) =>
            this.rollDamageSegment(segment, context, resolvedActiveStates),
          ),
        };
      }

      case "save": {
        const resolvedActiveStates =
          activeStates.length > 0 ? activeStates : (context.activeStates ?? []);
        const { targetStat, dcCalculation, saveEffect, dc: resolvedDc } =
          effect.savingThrow;

        // the targets make this save, not the character. It used to roll the
        // character's own save modifier against their own DC - for every
        // breath weapon and for Intimidating Presence - and roll no damage
        const scalingScore =
          context.abilityScores?.[dcCalculation.scalingStat as Ability] ?? 10;
        const dc =
          resolvedDc ??
          dcCalculation.base +
            Math.floor((scalingScore - 10) / 2) +
            (dcCalculation.includeProficiency
              ? (context.proficiencyBonus ?? 0)
              : 0);

        const targetSave: TargetSave = {
          ability: targetStat as Ability,
          dc,
          onSuccess: saveEffect,
          label: action.name,
          ...(effect.areaOfEffect !== undefined && { area: effect.areaOfEffect }),
        };
        const rollResults = (effect.damage ?? []).map((segment) =>
          this.rollDamageSegment(segment, context, resolvedActiveStates),
        );

        return {
          ...ok,
          targetSaves: [targetSave],
          ...(rollResults.length > 0 && { rollResults }),
        };
      }

      case "ability_check": {
        const abilityCheckRoll = DiceEngine.rollDigital("1d20");
        const resolvedRoll = this.resolveTargetRoll(
          abilityCheckRoll,
          "ABILITY_CHECK",
          context,
          activeStates.length > 0 ? activeStates : (context.activeStates ?? []),
          20,
        );

        const total = resolvedRoll.total;

        return {
          ...ok,
          rollResults: [
            {
              total,
              rolls: resolvedRoll.rolls,
              modifier: abilityCheckRoll.modifier,
              target: "ABILITY_CHECK",
            },
          ],
        };
      }

      case "heal": {
        const roll = DiceEngine.rollDigital(effect.dice);

        // No HP is written here. This resolver returns rolls and never mutates
        // character state; the server owns the HP-delta path the total is
        // applied through, and it is the only writer.
        return {
          ...ok,
          rollResults: [
            {
              total: roll.total,
              rolls: roll.rolls,
              modifier: roll.modifier,
              // healing is a dice pool, so it reports as one. No damageType is
              // what tells it apart from damage downstream - that, and the
              // label below, which is what lets the sheet stop rendering it
              // as damage.
              target: "DAMAGE_ROLL",
              label: "Healing",
            },
          ],
        };
      }

      case "self_save": {
        const ability = effect.ability as Ability;
        // the count before this attempt sets the DC; the Rules panel reads
        // the same helper, so the DC the player saw is the DC rolled against
        const counterId = selfSaveCounterId(effect.dcRule);
        const uses = counterId
          ? context.resourceManager.getRuntimeResources().find(
              (resource) => resource.id === counterId,
            )?.currentCharges ?? 0
          : 0;
        const dc = resolveSelfSaveDc(effect.dcRule, uses);
        const roll = DiceEngine.rollDigital("1d20");
        const modifier = context.saveModifiers?.[ability] ?? 0;
        const total = roll.total + modifier;
        if (counterId) {
          context.resourceManager.consume(counterId, 1);
        }
        const results: ActionRollResult[] = [{
          total,
          rolls: roll.rolls,
          modifier,
          target: "SAVING_THROW",
          label: action.name,
          summary: `${ability} saving throw, DC ${dc}: ${total >= dc ? "success" : "failure"}`,
        }];
        if (total >= dc && effect.onSuccess) {
          const healing = DiceEngine.rollDigital(effect.onSuccess.dice);
          results.push({
            total: healing.total,
            rolls: healing.rolls,
            modifier: healing.modifier,
            target: "DAMAGE_ROLL",
            label: "Healing",
          });
        }
        return { ...ok, rollResults: results };
      }

      default:
        return ok;
    }
  }

  /**
   * Validates the whole bill, then pays it.
   *
   * The payload arrives from the client, so it is treated as a request rather
   * than an instruction: each entry has to correspond to something the action
   * actually declared, and an ammunition pick has to be ammunition the weapon
   * can fire. Otherwise a crafted payload could shoot for free, or spend a
   * healing potion as an arrow.
   */
  /**
   * Draws one attack, taking the Attack action first if it has not been taken.
   *
   * Swinging is how a player says "I take the Attack action" - nobody declares
   * it separately at the table - so the first swing of a turn opens the
   * allowance and immediately spends one of it. Later swings only draw down.
   * @param action The attack being made, which is also what took the Attack action
   * @param context The execution context, carrying the combat context and attack count
   * @returns True if an attack was available to spend
   */
  private static settleAttack(
    action: ActionGrant,
    context: ActionExecutionContext,
  ): { spent: boolean; declared: boolean } {
    const combatContext = context.combatContext;
    if (!combatContext) return { spent: false, declared: false };

    if (combatContext.getContext().economy.attacksRemaining === null) {
      const declared = combatContext.declareAttackAction(
        action.id,
        context.attacksPerAction ?? 1,
      );

      return {
        spent: declared && combatContext.spendAttack(),
        declared,
      };
    }

    return { spent: combatContext.spendAttack(), declared: false };
  }

  private static settleCosts(
    action: ActionGrant,
    requested: ConsumedResource[],
    context: ActionExecutionContext,
  ): ActionResult {
    const pools = requested.filter((cost) => cost.type === "trait_pool");
    const stacks = requested.filter(
      (cost) => cost.type === "inventory_instance",
    );

    // region validate

    for (const cost of requested) {
      if (cost.amount <= 0) return fail("unrequested_cost", cost.id);
    }

    // a pool cost is only legitimate if this action declared it
    for (const cost of pools) {
      if (cost.id !== action.consumesResource) {
        return fail("unrequested_cost", cost.id);
      }
    }

    if (action.consumesResource && pools.length === 0) {
      // the action's own declaration stands in for an unstated pick
      pools.push({
        type: "trait_pool",
        id: action.consumesResource,
        amount: 1,
      });
    }

    if (action.consumesAmmo) {
      if (!context.inventoryLedger) return fail("no_ledger");
      if (stacks.length === 0) return fail("ammo_not_selected");
    }

    if (action.consumesSelf) {
      const ledger = context.inventoryLedger;
      if (!ledger) return fail("no_ledger", action.id);
      if (!context.selfInstanceId) return fail("missing_stack", action.id);

      const stack = ledger.getStack(context.selfInstanceId);
      if (!stack) return fail("missing_stack", context.selfInstanceId);
      if (stack.quantity < 1) {
        return fail("insufficient_stack", context.selfInstanceId);
      }
    }

    // an unrequested stack cost has nothing to justify it
    if (!action.consumesAmmo && stacks.length > 0) {
      return fail("unrequested_cost", stacks[0]?.id);
    }

    for (const cost of stacks) {
      const ledger = context.inventoryLedger;
      if (!ledger) return fail("no_ledger", cost.id);

      const stack = ledger.getStack(cost.id);
      if (!stack) return fail("missing_stack", cost.id);
      if (stack.quantity < cost.amount) {
        return fail("insufficient_stack", cost.id);
      }

      // the chosen stack has to actually be ammunition this weapon fires
      const definition = resolveEquipmentDefinition(
        stack.itemId,
        context.snapshot,
      );
      if (!definition) return fail("wrong_ammo", cost.id);

      // consumesAmmo is `ammoTag ?? ammoItemId` (WeaponSynthesizer), so an
      // untagged weapon names its ammunition by item id and no definition's
      // tag can ever equal it. Checking the tag alone failed every shot from
      // such a weapon with wrong_ammo - on the very stack
      // RollContextBuilder.buildAmmoOptions had just offered the player,
      // whose matching accepts the named item id for the same reason.
      const matchesTag = definition.ammoTag === action.consumesAmmo;
      const matchesDefault = stack.itemId === action.consumesAmmo;

      if (!matchesTag && !matchesDefault) {
        return fail("wrong_ammo", cost.id);
      }
    }

    // endregion

    // region commit
    //
    // pools go first. ResourceManager checks and spends in the same call, so
    // its failure is only discoverable by trying, whereas the stacks above are
    // fully validated already. Settling the unpredictable cost first means a
    // failure here has never touched the inventory, and the only thing needing
    // an unwind is other pools — which restore in memory.

    const spentPools: ConsumedResource[] = [];
    let spentActivation: ActionGrant["activation"] | null = null;
    let economyOverdrawn = false;
    // whether this swing was the one that took the Attack action, which decides
    // how far an abort has to unwind
    let attackDeclared = false;

    if (
      (costsCombatEconomy(action.activation) ||
        costsAttack(action.activation)) &&
      context.combatContext?.getContext().inCombat
    ) {
      let activationSpent = false;

      switch (action.activation) {
        case "action":
          activationSpent = context.combatContext.spendAction(action.id);
          break;
        case "bonus_action":
          activationSpent = context.combatContext.spendBonusAction(action.id);
          break;
        case "reaction":
          activationSpent = context.combatContext.spendReaction(action.id);
          break;
        case "attack": {
          const outcome = this.settleAttack(action, context);
          activationSpent = outcome.spent;
          attackDeclared = outcome.declared;
          break;
        }
      }

      if (!activationSpent) {
        if ((context.economyPolicy ?? "enforce") === "enforce") {
          return fail(
            activationFailureReason(action.activation) ?? "unrequested_cost",
            action.id,
          );
        }

        // tracking: the action goes ahead and the sheet is told it went over.
        // spentActivation stays null deliberately - nothing was taken, so a
        // later abort has nothing to refund
        economyOverdrawn = true;
      } else {
        spentActivation = action.activation;
      }
    }

    for (const cost of pools) {
      if (context.resourceManager.consume(cost.id, cost.amount)) {
        spentPools.push(cost);
        continue;
      }

      if (spentActivation && context.combatContext) {
        switch (spentActivation) {
          case "action":
            context.combatContext.refundAction();
            break;
          case "bonus_action":
            context.combatContext.refundBonusAction();
            break;
          case "reaction":
            context.combatContext.refundReaction();
            break;
          case "attack":
            // a swing that took the Attack action has to untake it, not just
            // hand back the one attack, or the player keeps an Attack action
            // they never managed to make
            if (attackDeclared) {
              context.combatContext.undoAttackAction();
              context.combatContext.refundAction();
            } else {
              context.combatContext.refundAttack();
            }
            break;
        }
      }

      for (const spent of spentPools) {
        context.resourceManager.restore(spent.id, spent.amount);
      }

      return fail("insufficient_resource", cost.id);
    }

    // validated above, so these cannot fail and nothing after them can
    for (const cost of stacks) {
      context.inventoryLedger?.consumeStack(cost.id, cost.amount);
    }

    if (action.consumesSelf && context.selfInstanceId) {
      context.inventoryLedger?.consumeStack(context.selfInstanceId, 1);
    }

    // endregion

    return economyOverdrawn ? { ...ok, economyOverdrawn: true } : ok;
  }
}
