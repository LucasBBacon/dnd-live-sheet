import type {
  CharacterSlot,
  EquipSlot,
  EquipmentDefinition,
  ItemDefinition,
} from "@project/shared";

/**
 * Maps a definition's slot *kind* onto the concrete character slots that can
 * hold it. Capacity lives here rather than on the item: a character has one
 * body but two ring fingers, and the ring itself does not know which finger
 * it will end up on.
 */
export const SLOT_INSTANCES: Record<EquipSlot, CharacterSlot[]> = {
  head: ["head"],
  amulet: ["amulet"],
  cloak: ["cloak"],
  body: ["body"],
  main_hand: ["main_hand"],
  off_hand: ["off_hand"],
  gloves: ["gloves"],
  ring: ["ring_1", "ring_2"],
  boots: ["boots"],
};

/** The null slot: carried rather than worn. */
export const CARRIED_SLOT: CharacterSlot = "backpack";

export const isEquipped = (slot: CharacterSlot): boolean =>
  slot !== CARRIED_SLOT;

/** How many of a slot kind the character has, e.g. two for rings. */
export const slotCapacity = (equipSlot: EquipSlot): number =>
  SLOT_INSTANCES[equipSlot].length;

/**
 * Whether an item may be placed in a target slot.
 *
 * Replaces the old type-driven check: slot legality now comes from the item's
 * authored equipSlot, so nothing has to special-case a shield by id or guess
 * an item's kind from its id prefix. An item with no equipSlot cannot be worn
 * at all and can only go back in the pack.
 */
export const canEquipTo = (
  definition: Pick<ItemDefinition, "equipSlot">,
  target: CharacterSlot,
): boolean => {
  if (target === CARRIED_SLOT) return true;
  if (!definition.equipSlot) return false;

  return SLOT_INSTANCES[definition.equipSlot].includes(target);
};

/**
 * Every slot an item actually consumes once placed in `target`.
 *
 * Normally just the target, but a two-handed weapon occupies the off hand as
 * well — otherwise nothing stops a longbow and a shield being worn together.
 */
export const slotsConsumedBy = (
  equipment: Pick<EquipmentDefinition, "weapon">,
  target: CharacterSlot,
): CharacterSlot[] => {
  if (target === CARRIED_SLOT) return [];

  const isTwoHanded = equipment.weapon?.properties.includes("two_handed");

  if (isTwoHanded && (target === "main_hand" || target === "off_hand")) {
    return ["main_hand", "off_hand"];
  }

  return [target];
};

/**
 * The free slot of a kind, if the character has one, preferring the lowest
 * index. Lets the UI offer "wear this ring" without asking which finger until
 * both are actually full.
 */
export const firstFreeSlot = (
  equipSlot: EquipSlot,
  occupied: Iterable<CharacterSlot>,
): CharacterSlot | undefined => {
  const taken = new Set(occupied);

  return SLOT_INSTANCES[equipSlot].find((slot) => !taken.has(slot));
};
