export const SOCKET_EVENTS = {
  ROOM_JOIN: "room:join",
  HP_MODIFIED: "character:hp_modified",
  ITEM_EQUIPPED: "character:item_equipped",
  CONDITION_ADDED: "character:condition_added",
} as const;

export interface HpModifiedPayload {
  characterId: string;
  delta: number; // e.g., -5 dmg, +8 healing
  source: string; // e.g., 'Fireball', 'Potion of Healing'
  timestamp: number;
}

export interface ItemEquippedPayload {
  characterId: string;
  inventoryId: string; // operational UUID of item instance
  targetSlot: string; // e.g., 'main_hand', 'backpack'
  timestamp: number;
}

export interface ServerBroadcastPayload<T> {
  actorId: string; // use who triggered event
  data: T;
}
