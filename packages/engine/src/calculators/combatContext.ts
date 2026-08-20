import {
  CombatContextSchema,
  CombatEventSchema,
  type CombatContext,
  type CombatEvent,
  type CombatEventInput,
  type CombatEventStatus,
  type CombatRollSnapshot,
  type CombatTurnOwner,
} from "@project/shared";

const MAX_RECENT_EVENTS = 10;

/**
 * Clones a CombatContext object, ensuring that nested objects and arrays are also cloned to prevent unintended mutations.
 * @param context The CombatContext object to clone
 * @returns A deep clone of the provided CombatContext object
 */
const cloneContext = (context: CombatContext): CombatContext =>
  CombatContextSchema.parse({
    ...context,
    activeTurnOwner:
      context.activeTurnOwner === null ? null : { ...context.activeTurnOwner },
    economy: { ...context.economy },
    turnFlags: { ...context.turnFlags },
    pendingEvents: context.pendingEvents.map((event) => ({
      ...event,
      rollSnapshot:
        event.rollSnapshot === undefined
          ? undefined
          : {
              ...event.rollSnapshot,
              rawRolls: [...event.rollSnapshot.rawRolls],
            },
    })),
    recentEvents: context.recentEvents.map((event) => ({
      ...event,
      rollSnapshot:
        event.rollSnapshot === undefined
          ? undefined
          : {
              ...event.rollSnapshot,
              rawRolls: [...event.rollSnapshot.rawRolls],
            },
    })),
  });

/**
 * CombatContextManager is responsible for managing the state of combat, including turn order, action economy, and event tracking.
 * It provides methods to initialize combat, begin and end turns, spend and refund actions, and manage combat events.
 */
export class CombatContextManager {
  private context: CombatContext = CombatContextSchema.parse({});

  /**
   * Initializes the combat context with optional initial values.
   * @param initialContext Optional initial values to set in the combat context.
   */
  public initialize(initialContext?: Partial<CombatContext>): void {
    this.context = CombatContextSchema.parse(initialContext ?? {});
  }

  /**
   * Retrieves a deep clone of the current combat context to prevent external mutations.
   * @returns A deep clone of the current CombatContext.
   */
  public getContext(): CombatContext {
    return cloneContext(this.context);
  }

  // region Combat Lifecycle

  /**
   * Begins combat, setting the inCombat flag to true and initializing the round number.
   * @param roundNumber Optional round number to start combat with (default is 1).
   * @returns The updated CombatContext after beginning combat.
   */
  public beginCombat(roundNumber = 1): CombatContext {
    this.context.inCombat = true;
    this.context.roundNumber = roundNumber;
    return this.getContext();
  }

  /**
   * Ends combat, resetting the inCombat flag, round number, active turn owner, and economy to their default states.
   * @returns The updated CombatContext after ending combat.
   */
  /**
   * Records whether the character was surprised at the start of this combat.
   *
   * Declared rather than derived: surprise is settled by the DM comparing
   * Stealth against passive Perception across the whole table, which is not
   * something a single-character sheet can ever work out for itself.
   * @param surprised True if the character was surprised.
   */
  public setSurprised(surprised: boolean): CombatContext {
    this.context.surprised = surprised;
    return this.getContext();
  }

  public endCombat(): CombatContext {
    this.context.inCombat = false;
    this.context.surprised = false;
    this.context.roundNumber = null;
    this.context.activeTurnOwner = null;
    this.context.economy = CombatContextSchema.parse({}).economy;
    this.context.turnFlags = {};
    this.context.pendingEvents = [];
    return this.getContext();
  }

  // endregion

  // region Turn Management

  /**
   * Begins a new turn for the specified owner, updating the active turn owner and resetting turn flags.
   * @param owner The owner of the turn (player or actor).
   * @returns The updated CombatContext after beginning the turn.
   */
  public beginTurn(owner: CombatTurnOwner): CombatContext {
    // If combat hasn't started yet, initialize it
    if (!this.context.inCombat) {
      this.context.inCombat = true;
      this.context.roundNumber = 0;
    }

    // If the turn is already active for the same owner,
    // do not reset the economy or increment the round number
    this.context.activeTurnOwner = owner;
    this.context.turnFlags = {};

    // If the owner is a player, increment the round number and reset the action economy
    if (owner.kind === "player") {
      this.context.roundNumber = (this.context.roundNumber ?? 0) + 1;
      // rebuilt from the schema rather than an object literal: a literal here
      // silently drops any field added to the economy later, which is exactly
      // how an attack allowance would fail to reset
      this.context.economy = CombatContextSchema.parse({}).economy;
    }

    return this.getContext();
  }

  /**
   * Ends the current turn, resetting the active turn owner and preserving the combat context.
   * @param owner Optional owner of the turn to end. If provided, ensures that the turn being ended matches the active turn owner.
   * @returns The updated CombatContext after ending the turn.
   */
  public endTurn(owner?: CombatTurnOwner): CombatContext {
    // if an owner is provided, ensure that it matches the active turn owner before ending the turn
    if (
      owner &&
      this.context.activeTurnOwner &&
      owner.kind !== this.context.activeTurnOwner.kind
    ) {
      return this.getContext();
    }

    // if the owner is an actor and does not match the active turn owner, do not end the turn
    if (
      owner?.kind === "actor" &&
      this.context.activeTurnOwner?.kind === "actor" &&
      owner.actorInstanceId !== this.context.activeTurnOwner.actorInstanceId
    ) {
      return this.getContext();
    }

    // surprise lasts exactly "until that turn ends", so the player's own turn
    // ending is what retires it. another combatant's turn ending must not,
    // or the restriction would lapse before the player ever acted
    if (this.context.activeTurnOwner?.kind === "player") {
      this.context.surprised = false;
    }

    // reset the active turn owner to null, effectively ending the turn
    this.context.activeTurnOwner = null;
    return this.getContext();
  }

  // endregion

  // region Action Economy

  /**
   * Attempts to spend an action for the current turn.
   * If an action is available, it marks the action as spent and records the source of the action.
   * @param sourceId The identifier of the source that is spending the action (e.g., an ability or item).
   * @returns True if the action was successfully spent; false if no action was available.
   */
  public spendAction(sourceId: string): boolean {
    if (!this.context.economy.actionAvailable) return false;
    this.context.economy.actionAvailable = false;
    this.context.economy.spentActionSourceId = sourceId;
    return true;
  }

  /**
   * Refunds a previously spent action, making it available again for the current turn.
   * This method resets the action availability and clears the source of the spent action.
   * It does not check if an action was previously spent; it simply resets the state.
   */
  public refundAction(): void {
    this.context.economy.actionAvailable = true;
    this.context.economy.spentActionSourceId = undefined;
  }

  /**
   * Attempts to spend a bonus action for the current turn.
   * If a bonus action is available, it marks the bonus action as spent and records the source of the bonus action.
   * @param sourceId The identifier of the source that is spending the bonus action (e.g., an ability or item).
   * @returns True if the bonus action was successfully spent; false if no bonus action was available.
   */
  public spendBonusAction(sourceId: string): boolean {
    if (!this.context.economy.bonusActionAvailable) return false;
    this.context.economy.bonusActionAvailable = false;
    this.context.economy.spentBonusActionSourceId = sourceId;
    return true;
  }

  /**
   * Refunds a previously spent bonus action, making it available again for the current turn.
   * This method resets the bonus action availability and clears the source of the spent bonus action.
   * It does not check if a bonus action was previously spent; it simply resets the state.
   */
  public refundBonusAction(): void {
    this.context.economy.bonusActionAvailable = true;
    this.context.economy.spentBonusActionSourceId = undefined;
  }

  /**
   * Attempts to spend a reaction for the current turn.
   * If a reaction is available, it marks the reaction as spent and records the source of the reaction.
   * @param sourceId The identifier of the source that is spending the reaction (e.g., an ability or item).
   * @returns True if the reaction was successfully spent; false if no reaction was available.
   */
  public spendReaction(sourceId: string): boolean {
    if (!this.context.economy.reactionAvailable) return false;
    this.context.economy.reactionAvailable = false;
    this.context.economy.spentReactionSourceId = sourceId;
    return true;
  }

  /**
   * Refunds a previously spent reaction, making it available again for the current turn.
   * This method resets the reaction availability and clears the source of the spent reaction.
   * It does not check if a reaction was previously spent; it simply resets the state.
   */
  public refundReaction(): void {
    this.context.economy.reactionAvailable = true;
    this.context.economy.spentReactionSourceId = undefined;
  }

  /**
   * Takes the Attack action, spending the action and opening its allowance.
   *
   * The allowance is what Extra Attack raises. Declaring is separate from
   * attacking because one Attack action grants several attacks, and the sheet
   * needs somewhere to hold "how many are left".
   * @param sourceId What declared the Attack action
   * @param attackCount How many attacks the Attack action grants
   * @returns True if the action was available to spend; false if it was not
   */
  public declareAttackAction(sourceId: string, attackCount: number): boolean {
    if (!this.spendAction(sourceId)) return false;

    this.context.economy.attacksRemaining = attackCount;
    this.context.economy.attackActionSourceId = sourceId;
    return true;
  }

  /**
   * Draws one attack from the current Attack action's allowance.
   * @returns True if an attack was available; false if none remained or the Attack action was never declared
   */
  public spendAttack(): boolean {
    const remaining = this.context.economy.attacksRemaining;
    if (remaining === null || remaining <= 0) return false;

    this.context.economy.attacksRemaining = remaining - 1;
    return true;
  }

  /**
   * Puts one attack back, for a swing that was settled and then aborted.
   */
  public refundAttack(): void {
    const remaining = this.context.economy.attacksRemaining;
    if (remaining === null) return;

    this.context.economy.attacksRemaining = remaining + 1;
  }

  /**
   * Untakes the Attack action, as though it had never been declared.
   *
   * Used when the swing that implicitly declared it turns out to be
   * unaffordable: the allowance has to go back to "not taken this turn" rather
   * than to a full allowance, or the player would keep an Attack action they
   * never managed to make.
   */
  public undoAttackAction(): void {
    this.context.economy.attacksRemaining = null;
    this.context.economy.attackActionSourceId = undefined;
  }

  // endregion

  // region Turn Flags

  /**
   * Sets a turn-specific flag in the combat context,
   * allowing for tracking of temporary states or conditions that are relevant only for the duration of the current turn.
   * @param flagId The identifier of the flag to set. This can be any string that represents a temporary state or condition.
   */
  public setTurnFlag(flagId: string): void {
    this.context.turnFlags[flagId] = true;
  }

  /**
   * Checks if a specific turn flag is set in the combat context.
   * This can be used to determine if a temporary state or condition is currently active for the turn.
   * @param flagId The identifier of the flag to check. This should match the string used when setting the flag.
   * @returns True if the flag is set; false otherwise.
   */
  public hasTurnFlag(flagId: string): boolean {
    return this.context.turnFlags[flagId] === true;
  }

  // endregion

  // region Combat Events

  /**
   * Pushes a new combat event into the context. If the event is marked as "pending", it is added to the pending events queue.
   * Otherwise, it is added to the recent events list, maintaining a maximum number of recent events.
   * @param event The combat event to push into the context, which can be either a pending or resolved event.
   * @returns The updated CombatContext after the event has been processed.
   * @remarks This method ensures that the combat context remains valid and consistent by validating the event against the CombatEventSchema.
   */
  public pushEvent(event: CombatEventInput): CombatContext {
    const parsed = CombatEventSchema.parse(event);
    if (parsed.status === "pending") {
      this.context.pendingEvents.push(parsed);
      return this.getContext();
    }

    this.pushRecentEvent(parsed);
    return this.getContext();
  }

  /**
   * Resolves a pending combat event by its ID, updating its status and optionally providing a summary, reaction source, or roll snapshot.
   * @param eventId The unique identifier of the pending combat event to resolve.
   * @param resolution An object containing optional resolution details, including the new status, summary, reaction source ID, and roll snapshot.
   * @returns The updated CombatContext after the event has been resolved, or the current context if the event ID was not found among pending events.
   * @remarks This method ensures that the combat context remains valid and consistent by validating the resolved event against the CombatEventSchema.
   */
  public resolveEvent(
    eventId: string,
    resolution: {
      status?: Exclude<CombatEventStatus, "pending">;
      summary?: string;
      reactionSourceId?: string;
      rollSnapshot?: CombatRollSnapshot;
    } = {},
  ): CombatContext {
    // 1 - find the index of the pending event with the given ID
    const index = this.context.pendingEvents.findIndex(
      (event) => event.id === eventId,
    );

    if (index < 0) return this.getContext();

    // 2 - remove the pending event from the queue and update its status and optional properties
    const [current] = this.context.pendingEvents.splice(index, 1);
    if (!current) return this.getContext();

    // 3 - push the resolved event into the recent events list, maintaining a maximum number of recent events
    this.pushRecentEvent({
      ...current,
      status: resolution.status ?? "resolved",
      ...(resolution.summary !== undefined && { summary: resolution.summary }),
      ...(resolution.reactionSourceId !== undefined && {
        reactionSourceId: resolution.reactionSourceId,
      }),
      ...(resolution.rollSnapshot !== undefined && {
        rollSnapshot: resolution.rollSnapshot,
      }),
    });

    return this.getContext();
  }

  /**
   * Adds a combat event to the recent events list, ensuring that the list does not exceed the maximum number of recent events.
   * If the list exceeds the maximum, the oldest events are removed to maintain the limit.
   * @param event The combat event to add to the recent events list.
   */
  private pushRecentEvent(event: CombatEvent): void {
    this.context.recentEvents = [...this.context.recentEvents, event].slice(
      -MAX_RECENT_EVENTS,
    );
  }
  // endregion
}
