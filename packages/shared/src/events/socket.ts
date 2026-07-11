// #region Socket Events

export const SOCKET_EVENTS = {
  ROOM_JOIN: "room:join",
  HP_MODIFIED: "character:hp_modified",
  ITEM_EQUIPPED: "character:item_equipped",
  ITEM_CONSUMED: "character:item_consumed",
  RESOURCE_CONSUMED: "character:resource_consumed",
  CONDITION_ADDED: "character:condition_added",
  REST_COMPLETED: "character:rest_completed",
} as const;

// #endregion

// #region Socket Event Payloads

export interface RoomJoinPayload {
  campaignId: string;
  characterId?: string;
}

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

export interface ItemConsumedPayload {
  characterId: string;
  inventoryId: string;
  amount: number; // usually 1, but allow for bulk drops
  timestamp: number;
}

export interface ResourceConsumedPayload {
  characterId: string;
  resourceId: string; // e.g., 'trait_action_surge'
  amount: number;
  timestamp: number;
}

export interface ServerBroadcastPayload<T> {
  actorId: string; // use who triggered event
  data: T;
}

// #endregion

// #region Type Exports

export type MaybeServerBroadcastPayload<T> = T | ServerBroadcastPayload<T>;

// #endregion

// #region Type Guards

export const isServerBroadcastPayload = <T>(
  payload: MaybeServerBroadcastPayload<T>,
): payload is ServerBroadcastPayload<T> => {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  return typeof candidate.actorId === "string" && "data" in candidate;
};

export const unwrapServerBroadcastPayload = <T>(
  payload: MaybeServerBroadcastPayload<T>,
): T => {
  if (isServerBroadcastPayload(payload)) {
    return payload.data;
  }

  return payload;
};

// #endregion
