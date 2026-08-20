import {
  type ActionIntentPayload,
  type ActionResolvedPayload,
  type InventorySyncPayload,
  type MaybeServerBroadcastPayload,
  type RoomJoinPayload,
  SOCKET_EVENTS,
  type HpModifiedPayload,
  type ItemAttunedPayload,
  type ItemConsumedPayload,
  type ItemEquippedPayload,
  type ResourceConsumedPayload,
  type RollResultsBroadcastPayload,
  type TurnIntentPayload,
  type TurnResolvedPayload,
  type SurpriseDeclaredPayload,
  type SurpriseResolvedPayload,
  unwrapServerBroadcastPayload,
} from "@project/shared";
import { io, type Socket } from "socket.io-client";
import { API_ORIGIN } from "../api/client";

export type SocketActionErrorPayload = {
  event?: string;
  error: string;
  payload?: unknown;
};

class SocketManager {
  private socket: Socket | null = null;

  public connect(campaignId: string, userId: string, characterId?: string) {
    if (this.socket) return;

    this.socket = io(API_ORIGIN, {
      auth: {
        userId,
      },
    });

    this.socket.on("connect", () => {
      const payload: RoomJoinPayload = { campaignId, characterId };
      this.socket?.emit(SOCKET_EVENTS.ROOM_JOIN, payload);
    });
  }

  public emitHpModification(payload: HpModifiedPayload) {
    this.socket?.emit(SOCKET_EVENTS.HP_MODIFIED, payload);
  }

  public subscribeToHpUpdates(callback: (payload: HpModifiedPayload) => void) {
    this.socket?.on(
      SOCKET_EVENTS.HP_MODIFIED,
      (payload: MaybeServerBroadcastPayload<HpModifiedPayload>) => {
        callback(unwrapServerBroadcastPayload(payload));
      },
    );
  }

  public emitInventoryUpdate(payload: ItemEquippedPayload) {
    this.socket?.emit(SOCKET_EVENTS.ITEM_EQUIPPED, payload);
  }

  public subscribeToInventoryUpdates(
    callback: (payload: ItemEquippedPayload) => void,
  ) {
    this.socket?.on(
      SOCKET_EVENTS.ITEM_EQUIPPED,
      (payload: MaybeServerBroadcastPayload<ItemEquippedPayload>) => {
        callback(unwrapServerBroadcastPayload(payload));
      },
    );
  }

  public emitAttunementUpdate(payload: ItemAttunedPayload) {
    this.socket?.emit(SOCKET_EVENTS.ITEM_ATTUNED, payload);
  }

  public subscribeToAttunementUpdates(
    callback: (payload: ItemAttunedPayload) => void,
  ) {
    this.socket?.on(
      SOCKET_EVENTS.ITEM_ATTUNED,
      (payload: MaybeServerBroadcastPayload<ItemAttunedPayload>) => {
        callback(unwrapServerBroadcastPayload(payload));
      },
    );
  }

  public subscribeToInventorySnapshot(
    callback: (payload: InventorySyncPayload) => void,
  ) {
    this.socket?.on(
      SOCKET_EVENTS.INVENTORY_SYNC,
      (payload: MaybeServerBroadcastPayload<InventorySyncPayload>) => {
        callback(unwrapServerBroadcastPayload(payload));
      },
    );
  }

  public emitInventoryConsumed(payload: ItemConsumedPayload) {
    this.socket?.emit(SOCKET_EVENTS.ITEM_CONSUMED, payload);
  }

  public subscribeToItemConsumed(
    callback: (payload: ItemConsumedPayload) => void,
  ) {
    this.socket?.on(
      SOCKET_EVENTS.ITEM_CONSUMED,
      (payload: MaybeServerBroadcastPayload<ItemConsumedPayload>) => {
        callback(unwrapServerBroadcastPayload(payload));
      },
    );
  }

  public emitResourceConsumed(payload: ResourceConsumedPayload) {
    this.socket?.emit(SOCKET_EVENTS.RESOURCE_CONSUMED, payload);
  }

  public subscribeToResourceConsumed(
    callback: (payload: ResourceConsumedPayload) => void,
  ) {
    this.socket?.on(
      SOCKET_EVENTS.RESOURCE_CONSUMED,
      (payload: MaybeServerBroadcastPayload<ResourceConsumedPayload>) => {
        callback(unwrapServerBroadcastPayload(payload));
      },
    );
  }

  public subscribeToActionErrors(
    callback: (payload: SocketActionErrorPayload) => void,
  ) {
    this.socket?.on("action_error", (payload: SocketActionErrorPayload) => {
      callback(payload);
    });
  }

  public emitRollResults(payload: RollResultsBroadcastPayload) {
    this.socket?.emit(SOCKET_EVENTS.ROLL_RESULTS, payload);
  }

  public emitActionIntent(payload: ActionIntentPayload) {
    this.socket?.emit(SOCKET_EVENTS.ACTION_INTENT, payload);
  }

  public emitTurnIntent(
    transition: "started" | "ended",
    payload: TurnIntentPayload,
  ) {
    this.socket?.emit(
      transition === "started"
        ? SOCKET_EVENTS.TURN_STARTED
        : SOCKET_EVENTS.TURN_ENDED,
      payload,
    );
  }

  public subscribeToTurnResolved(
    callback: (payload: TurnResolvedPayload) => void,
  ) {
    this.socket?.on(
      SOCKET_EVENTS.TURN_RESOLVED,
      (payload: MaybeServerBroadcastPayload<TurnResolvedPayload>) => {
        callback(unwrapServerBroadcastPayload(payload));
      },
    );
  }

  public emitSurpriseDeclared(payload: SurpriseDeclaredPayload) {
    this.socket?.emit(SOCKET_EVENTS.SURPRISE_DECLARED, payload);
  }

  public subscribeToSurpriseResolved(
    callback: (payload: SurpriseResolvedPayload) => void,
  ) {
    this.socket?.on(
      SOCKET_EVENTS.SURPRISE_RESOLVED,
      (payload: MaybeServerBroadcastPayload<SurpriseResolvedPayload>) => {
        callback(unwrapServerBroadcastPayload(payload));
      },
    );
  }

  public subscribeToRollResults(
    callback: (payload: RollResultsBroadcastPayload) => void,
  ) {
    this.socket?.on(
      SOCKET_EVENTS.ROLL_RESULTS,
      (payload: MaybeServerBroadcastPayload<RollResultsBroadcastPayload>) => {
        callback(unwrapServerBroadcastPayload(payload));
      },
    );
  }

  public subscribeToActionResolved(
    callback: (payload: ActionResolvedPayload) => void,
  ) {
    this.socket?.on(
      SOCKET_EVENTS.ACTION_RESOLVED,
      (payload: MaybeServerBroadcastPayload<ActionResolvedPayload>) => {
        callback(unwrapServerBroadcastPayload(payload));
      },
    );
  }

  public emitRestCompleted(payload: {
    characterId: string;
    restType: "short" | "long";
    timestamp: number;
  }) {
    this.socket?.emit(SOCKET_EVENTS.REST_COMPLETED, payload);
  }

  public disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const socketService = new SocketManager();
