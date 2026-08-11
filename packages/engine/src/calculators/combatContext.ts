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

export class CombatContextManager {
  private context: CombatContext = CombatContextSchema.parse({});

  public initialize(initialContext?: Partial<CombatContext>): void {
    this.context = CombatContextSchema.parse(initialContext ?? {});
  }

  public getContext(): CombatContext {
    return cloneContext(this.context);
  }

  public beginCombat(roundNumber = 1): CombatContext {
    this.context.inCombat = true;
    this.context.roundNumber = roundNumber;
    return this.getContext();
  }

  public endCombat(): CombatContext {
    this.context.inCombat = false;
    this.context.roundNumber = null;
    this.context.activeTurnOwner = null;
    this.context.economy = CombatContextSchema.parse({}).economy;
    this.context.turnFlags = {};
    this.context.pendingEvents = [];
    return this.getContext();
  }

  public beginTurn(owner: CombatTurnOwner): CombatContext {
    if (!this.context.inCombat) {
      this.context.inCombat = true;
      this.context.roundNumber = 0;
    }

    this.context.activeTurnOwner = owner;
    this.context.turnFlags = {};

    if (owner.kind === "player") {
      this.context.roundNumber = (this.context.roundNumber ?? 0) + 1;
      this.context.economy = {
        actionAvailable: true,
        bonusActionAvailable: true,
        reactionAvailable: true,
      };
    }

    return this.getContext();
  }

  public endTurn(owner?: CombatTurnOwner): CombatContext {
    if (
      owner &&
      this.context.activeTurnOwner &&
      owner.kind !== this.context.activeTurnOwner.kind
    ) {
      return this.getContext();
    }

    if (
      owner?.kind === "actor" &&
      this.context.activeTurnOwner?.kind === "actor" &&
      owner.actorInstanceId !== this.context.activeTurnOwner.actorInstanceId
    ) {
      return this.getContext();
    }

    this.context.activeTurnOwner = null;
    return this.getContext();
  }

  public spendAction(sourceId: string): boolean {
    if (!this.context.economy.actionAvailable) return false;
    this.context.economy.actionAvailable = false;
    this.context.economy.spentActionSourceId = sourceId;
    return true;
  }

  public spendBonusAction(sourceId: string): boolean {
    if (!this.context.economy.bonusActionAvailable) return false;
    this.context.economy.bonusActionAvailable = false;
    this.context.economy.spentBonusActionSourceId = sourceId;
    return true;
  }

  public spendReaction(sourceId: string): boolean {
    if (!this.context.economy.reactionAvailable) return false;
    this.context.economy.reactionAvailable = false;
    this.context.economy.spentReactionSourceId = sourceId;
    return true;
  }

  public setTurnFlag(flagId: string): void {
    this.context.turnFlags[flagId] = true;
  }

  public hasTurnFlag(flagId: string): boolean {
    return this.context.turnFlags[flagId] === true;
  }

  public pushEvent(event: CombatEventInput): CombatContext {
    const parsed = CombatEventSchema.parse(event);
    if (parsed.status === "pending") {
      this.context.pendingEvents.push(parsed);
      return this.getContext();
    }

    this.pushRecentEvent(parsed);
    return this.getContext();
  }

  public resolveEvent(
    eventId: string,
    resolution: {
      status?: Exclude<CombatEventStatus, "pending">;
      summary?: string;
      reactionSourceId?: string;
      rollSnapshot?: CombatRollSnapshot;
    } = {},
  ): CombatContext {
    const index = this.context.pendingEvents.findIndex(
      (event) => event.id === eventId,
    );

    if (index < 0) return this.getContext();

    const [current] = this.context.pendingEvents.splice(index, 1);
    if (!current) return this.getContext();

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

  private pushRecentEvent(event: CombatEvent): void {
    this.context.recentEvents = [...this.context.recentEvents, event].slice(
      -MAX_RECENT_EVENTS,
    );
  }
}
