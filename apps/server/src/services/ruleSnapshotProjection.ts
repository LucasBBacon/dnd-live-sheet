import {
  EquipmentDefinitionSchema,
  type EquipmentDefinition,
  type WeaponCapability,
} from "@project/shared";
import { hundredthsToPounds } from "@project/engine";

/** One row of the items table, as the snapshot builder reads it. */
export interface EquipmentRuleRow {
  id: string;
  name: string;
  /** hundredths of a pound - the storage-canonical weight */
  weight: number;
  itemRule: Omit<EquipmentDefinition, "weapon"> | null;
  weaponRule: WeaponCapability | null;
}

export interface RuleSnapshotProjection {
  equipmentById: Record<string, EquipmentDefinition>;
  /**
   * ids whose stored rule payload no longer parses. skipped, not fatal - unless
   * every row failed, in which case projectEquipmentRows throws instead of
   * returning this list
   */
  malformedItemIds: string[];
}

/**
 * Strips id/name off a stored weapon_rule, if present.
 *
 * Before e40188a, corePackProjection.toWeaponRule wrote a whole
 * WeaponDefinition - WeaponCapability's fields plus id and name - into
 * weapon_rule, and this file had a toWeaponCapability adapter that stripped
 * them back out before parsing. e40188a retired WeaponDefinition: the writer
 * now stores bare WeaponCapability, and the adapter was deleted as dead code
 * for the new shape. It was not dead for a row written before that commit -
 * WeaponCapabilitySchema is strict, so a legacy row's id/name now fails as
 * unrecognized_keys and the weapon silently disappears from the snapshot. A
 * re-import fixes the rows that exist today but not a deployment that has not
 * re-imported yet, so the strip stays here too: it costs one destructure per
 * row and means an old row self-heals through this reader instead of hard
 * failing.
 */
const stripLegacyWeaponIdentity = (
  weaponRule: WeaponCapability & { id?: unknown; name?: unknown },
): WeaponCapability => {
  const { id: _id, name: _name, ...capability } = weaponRule;
  return capability;
};

/**
 * Turns stored item rows into the equipment lookup map a rule snapshot
 * exposes.
 *
 * Pure on purpose: the cache owns the query and the memoisation, this owns the
 * shape. That is what lets the round-trip test run without a database, which
 * is the only thing that reliably catches a dropped field.
 *
 * Fields are carried by spreading rather than by naming, so one added to the
 * stored item_rule arrives here automatically. EquipmentDefinitionSchema is
 * strict, so a field it does *not* know about fails loudly instead of being
 * silently dropped - which is exactly how weight, equipSlot, requiresAttunement
 * and ammoTag went missing for as long as they did.
 *
 * A single unparsable row is reported via malformedItemIds and otherwise
 * ignored. If every row in a non-empty set fails, that is treated as a
 * schema/data divergence rather than bad data, and this throws instead of
 * returning an empty snapshot; ruleSnapshotCache does not catch it, so it
 * surfaces to the caller as a request failure.
 */
export const projectEquipmentRows = (
  rows: EquipmentRuleRow[],
): RuleSnapshotProjection => {
  const equipmentById: Record<string, EquipmentDefinition> = {};
  const malformedItemIds: string[] = [];

  for (const row of rows) {
    // a row with no authored rule still has to resolve to something, so it
    // becomes a bare piece of gear rather than vanishing from the snapshot.
    // every EquipmentDefinition field besides id/name/weight is optional or
    // defaulted, so the empty object below is already a valid starting point
    const itemRule = row.itemRule ?? {};

    const parsed = EquipmentDefinitionSchema.safeParse({
      ...itemRule,
      // the row is authoritative for identity for the same reason it is for
      // weight below: the columns are what everything else keys on, and a
      // payload written before a rename still carries the old name
      id: row.id,
      name: row.name,
      // the column is the canonical weight. payloads written before the
      // extractor carried weight hold a stale 0, so reading the column heals
      // them without a re-seed
      weight: hundredthsToPounds(row.weight),
      ...(row.weaponRule
        ? { weapon: stripLegacyWeaponIdentity(row.weaponRule) }
        : {}),
    });

    // one unparsable row must not take the whole snapshot - and with it every
    // request that needs one - down. the id is reported so the caller can log
    // it, and the item resolves to nothing, which InventoryExtractor already
    // surfaces as an unknown id
    if (!parsed.success) {
      malformedItemIds.push(row.id);
      continue;
    }

    equipmentById[row.id] = parsed.data;
  }

  // one unparsable row is bad data, handled above. every row unparsable is a
  // different thing entirely - a schema change that no stored payload
  // satisfies - and skipping them all would hand back a snapshot in which
  // nothing resolves. the empty-catalogue case is excluded because zero of
  // zero failing is not a break, it is an empty table
  if (rows.length > 0 && malformedItemIds.length === rows.length) {
    throw new Error(
      `[ruleSnapshotProjection] every one of ${rows.length} item rows failed to parse against EquipmentDefinition; the stored rule payloads and the schema have diverged`,
    );
  }

  return { equipmentById, malformedItemIds };
};
