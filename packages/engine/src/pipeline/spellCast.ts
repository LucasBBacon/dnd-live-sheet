import type { ActionGrant, InventoryInstance } from "@project/shared";
import {
  resolveEquipmentDefinition,
  type RuleSnapshotLookup,
} from "../rules/ruleLookup.js";
import type { CastableSpell, SlotPool } from "./spellSynthesizer.js";

/**
 * Whether the character can supply a spell's material component without
 * being asked: a component pouch, or a focus the spell's source can use,
 * anywhere in the inventory. No item can be held in a hand yet, so carried is
 * enough (#121). A spell with no material component is always covered.
 *
 * The sheet asks it to decide whether to prompt; the server asks it to decide
 * whether an unconfirmed cast is refused. One answer for both.
 * @param spell The spell's components and its source's foci
 * @param inventory What the character carries
 * @param snapshot Pack content, where item tags live
 * @returns Whether it is covered, and the item that covers it
 */
export const materialCoverage = (
  spell: Pick<CastableSpell, "components" | "focusCategories">,
  inventory: InventoryInstance[],
  snapshot?: RuleSnapshotLookup,
): { covered: boolean; by?: string } => {
  if (!spell.components?.material) return { covered: true };

  for (const instance of inventory) {
    const definition = resolveEquipmentDefinition(instance.itemId, snapshot);
    const tags: string[] = definition?.categoryTags ?? [];
    if (
      tags.includes("category_component_pouch") ||
      spell.focusCategories.some((category) => tags.includes(category))
    ) {
      return { covered: true, by: definition?.name ?? instance.itemId };
    }
  }

  return { covered: false };
};

export type SpellCastRefusal =
  | "slot_required"
  | "slot_too_low"
  | "slot_empty"
  | "materials_required";

/** What the player chose when they pressed Cast. */
export interface SpellCastRequest {
  slotResourceId?: string;
  materialsConfirmed?: boolean;
}

export type SpellCastSettlement =
  | {
      ok: true;
      action: ActionGrant;
      spellCast?: { spellLevel: number; castLevel: number };
    }
  | { ok: false; reason: SpellCastRefusal; offendingId?: string };

/**
 * Everything a spell needs before it is cast, checked before anything is
 * spent: a slot of at least its level with a charge left, when a slot pays for
 * it; then its material, from a pouch, a usable focus or the player's word.
 *
 * A slot is paid by returning the action with `consumesResource` set to the
 * chosen pool, so ActionResolver's settleCosts spends it with every other
 * cost, all or nothing, and refunds it if something later fails. A resource
 * price (Drow Magic) is already on the action.
 * @param input The spell, its resolved action, the player's request, and the
 *   character's pools, charges and inventory
 * @returns The action to execute and the cast level, or why it cannot be cast
 */
export const settleSpellCast = (input: {
  spell: CastableSpell;
  action: ActionGrant;
  request: SpellCastRequest;
  slotPools: SlotPool[];
  charges: Array<{ id: string; currentCharges: number }>;
  inventory: InventoryInstance[];
  snapshot?: RuleSnapshotLookup;
}): SpellCastSettlement => {
  const { spell, request } = input;
  let action = input.action;
  let spellCast: { spellLevel: number; castLevel: number } | undefined;

  if (spell.payment.kind === "slot") {
    const pool =
      typeof request.slotResourceId === "string"
        ? input.slotPools.find((entry) => entry.resourceId === request.slotResourceId)
        : undefined;
    if (!pool) return { ok: false, reason: "slot_required" };
    if (pool.level < spell.level) {
      return { ok: false, reason: "slot_too_low", offendingId: pool.resourceId };
    }
    const charges =
      input.charges.find((entry) => entry.id === pool.resourceId)?.currentCharges ?? 0;
    if (charges < 1) {
      return { ok: false, reason: "slot_empty", offendingId: pool.resourceId };
    }

    action = { ...action, consumesResource: pool.resourceId };
    spellCast = { spellLevel: spell.level, castLevel: pool.level };
  }

  if (
    !materialCoverage(spell, input.inventory, input.snapshot).covered &&
    request.materialsConfirmed !== true
  ) {
    return { ok: false, reason: "materials_required", offendingId: spell.spellId };
  }

  return spellCast === undefined
    ? { ok: true, action }
    : { ok: true, action, spellCast };
};
