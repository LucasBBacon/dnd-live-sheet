import type { InventoryInstance, RuntimeModifier } from "@project/shared";
import { isEquipped } from "../rules/equipSlots.js";
import {
  resolveItemDefinition,
  type RuleSnapshotLookup,
} from "../rules/ruleLookup.js";

/** 5e caps a character at three attuned items at once. */
export const ATTUNEMENT_LIMIT = 3;

export type InactiveReason = "not_attuned" | "over_attunement_limit";

export interface InventoryInstanceReport {
  instanceId: string;
  itemId: string;
  sourceName: string;
  /** Absent when the instance is contributing live math. */
  inactiveReason?: InactiveReason;
}

export interface InventoryExtraction {
  /**
   * Every modifier the equipped items carry. Entries the character has not
   * legally earned are stamped isActive: false rather than dropped, so the UI
   * can still show "+1 AC (requires attunement)" in a stat breakdown. The
   * calculators skip inactive mods on their own.
   */
  modifiers: RuntimeModifier[];
  /** Per-instance verdicts, for inventory-screen badges. */
  report: InventoryInstanceReport[];
  /** Instances currently spending an attunement slot. */
  attunedInstanceIds: string[];
  /** Attuned beyond ATTUNEMENT_LIMIT — a save can drift past the cap. */
  overAttunedInstanceIds: string[];
  /** itemIds with no rule definition, e.g. a dropped homebrew item. */
  unknownItemIds: string[];
}

/**
 * Flattens the static math a character's worn items grant into
 * RuntimeModifiers the calculators can consume, gating each one behind the 5e
 * equip and attunement rules.
 *
 * Deliberately pure: it takes the inventory as an argument rather than reaching
 * into a store, so the engine stays independent of the app hosting it and the
 * rules stay unit-testable. The web layer wires it up in useInventoryModifiers.
 */
export class InventoryExtractor {
  /**
   * The common case: just the modifiers, matching ModifierExtractor's shape so
   * both can be concatenated straight into the calculator input.
   */
  public static extractModifiers(
    items: InventoryInstance[],
    snapshot?: RuleSnapshotLookup,
  ): RuntimeModifier[] {
    return this.extract(items, snapshot).modifiers;
  }

  /**
   * The persistent states a character's worn items put on the sheet.
   *
   * Kept apart from extract() because a state is about what is *worn*, not
   * about what math it contributes: a robe carries no modifiers at all, and a
   * suit of armor whose modifiers have not been authored yet is still armor.
   * Reading the type is the whole point - occupying the body slot is not the
   * same fact as wearing armor, and Unarmored Defense turns on the difference.
   */
  public static extractStates(
    items: InventoryInstance[],
    snapshot?: RuleSnapshotLookup,
  ): string[] {
    const states = new Set<string>();

    for (const instance of items) {
      // body armor only. a shield is worn in a hand and answers a different
      // question, so it deliberately emits nothing here
      if (instance.slot !== "body") continue;

      const definition = resolveItemDefinition(instance.itemId, snapshot);
      if (definition?.type !== "armor") continue;

      states.add("status_wearing_armor");

      // armor whose category has not been authored yet still counts as armor,
      // it just cannot answer a category-gated rule either way
      if (definition.armorCategory) {
        states.add(`status_wearing_${definition.armorCategory}_armor`);
      }
    }

    return Array.from(states);
  }

  /**
   * The same pass, reported rather than reduced, so the inventory screen can
   * explain why a worn item is contributing nothing.
   *
   * @param items Inventory instances in display order. Order is load-bearing:
   *   it decides which items win the attunement slots when a save is over cap.
   */
  public static extract(
    items: InventoryInstance[],
    snapshot?: RuleSnapshotLookup,
  ): InventoryExtraction {
    const modifiers: RuntimeModifier[] = [];
    const report: InventoryInstanceReport[] = [];
    const attunedInstanceIds: string[] = [];
    const overAttunedInstanceIds: string[] = [];
    const unknownItemIds: string[] = [];

    for (const instance of items) {
      const definition = resolveItemDefinition(instance.itemId, snapshot);

      // an id with no rule behind it is skipped rather than thrown on: a save
      // outlives the homebrew pack that authored it
      if (!definition) {
        unknownItemIds.push(instance.itemId);
        continue;
      }

      // 1 - an item in the pack projects nothing, so it never reaches a
      // breakdown. slot is the single source of truth for "is it worn"
      if (!isEquipped(instance.slot)) continue;

      const sourceName = instance.customName || definition.name;

      // 2 - claim an attunement slot before deciding whether the item earns its
      // benefits. the cap is re-checked here and not just at equip time: a
      // loaded save or a remote sync can arrive already over the limit
      let inactiveReason: InactiveReason | undefined;

      if (definition.requiresAttunement) {
        if (!instance.isAttuned) {
          inactiveReason = "not_attuned";
        } else if (attunedInstanceIds.length >= ATTUNEMENT_LIMIT) {
          inactiveReason = "over_attunement_limit";
          overAttunedInstanceIds.push(instance.id);
        } else {
          attunedInstanceIds.push(instance.id);
        }
      }

      report.push({
        instanceId: instance.id,
        itemId: instance.itemId,
        sourceName,
        ...(inactiveReason && { inactiveReason }),
      });

      // 3 - materialize the static modifiers against this instance
      for (const [index, mod] of (definition.modifiers ?? []).entries()) {
        modifiers.push({
          ...mod,
          // the instance id is already unique per stack, so suffixing the index
          // is enough to keep ids unique globally. DerivedStatEngine leans on
          // that to tell competing set_base entries apart when picking an AC
          id: `${instance.id}_${index}`,
          sourceName,
          sourceOrigin: `item:${instance.itemId}`,
          // a stack of five rings is still one worn ring: quantity never scales
          // the math, it only tracks how many are in the pack
          isActive: inactiveReason === undefined,
        });
      }
    }

    return {
      modifiers,
      report,
      attunedInstanceIds,
      overAttunedInstanceIds,
      unknownItemIds,
    };
  }
}
