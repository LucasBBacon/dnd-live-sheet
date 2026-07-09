import {
  type MaybeServerBroadcastPayload,
  type RoomJoinPayload,
  SOCKET_EVENTS,
  type HpModifiedPayload,
  type ItemConsumedPayload,
  type ItemEquippedPayload,
  type ResourceConsumedPayload,
  unwrapServerBroadcastPayload,
} from "@project/shared";
import { io, type Socket } from "socket.io-client";

class SocketManager {
  private socket: Socket | null = null;

  public connect(campaignId: string, userId: string, characterId?: string) {
    if (this.socket) return;
    const apiUrl = import.meta.env.VITE_API_URL;

    if (!apiUrl) {
      throw new Error("Missing VITE_API_URL environment variable");
    }

    this.socket = io(apiUrl, {
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
