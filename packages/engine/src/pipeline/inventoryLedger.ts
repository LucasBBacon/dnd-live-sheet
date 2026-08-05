/**
 * The engine's view of a character's carried stacks.
 *
 * A port, not an implementation: the inventory lives in whatever store the
 * host app uses, and the engine must not reach into it. The web layer supplies
 * an adapter so its own consume path still runs — optimistic update first,
 * then the socket broadcast — rather than the engine writing state behind it.
 */
export interface InventoryLedger {
  /**
   * The stack, or undefined when the character is not carrying it.
   * Read-only: the resolver uses it to validate before committing anything.
   */
  getStack(
    instanceId: string,
  ): { id: string; itemId: string; quantity: number } | undefined;

  /**
   * Deducts from a stack. Only called once the resolver has confirmed the
   * stack exists and holds enough, so this does not need to re-check.
   *
   * There is deliberately no restore counterpart: the resolver settles every
   * unpredictable cost before it touches the inventory, so a deduction here is
   * always the last thing to happen and never has to be unwound.
   */
  consumeStack(instanceId: string, amount: number): void;
}
