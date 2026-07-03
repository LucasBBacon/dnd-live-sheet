import {
  SOCKET_EVENTS,
  type HpModifiedPayload,
  type ItemConsumedPayload,
  type ItemEquippedPayload,
} from "@project/shared";
import { io, type Socket } from "socket.io-client";

class SocketManager {
  private socket: Socket | null = null;

  public connect(campaignId: string) {
    if (this.socket) return;
    const apiUrl = import.meta.env.VITE_API_URL;

    if (!apiUrl) {
      throw new Error("Missing VITE_API_URL environment variable");
    }

    this.socket = io(apiUrl);

    this.socket.on("connect", () => {
      this.socket?.emit(SOCKET_EVENTS.ROOM_JOIN, campaignId);
    });
  }

  public emitHpModification(payload: HpModifiedPayload) {
    this.socket?.emit(SOCKET_EVENTS.HP_MODIFIED, payload);
  }

  public subscribeToHpUpdates(callback: (payload: HpModifiedPayload) => void) {
    this.socket?.on(SOCKET_EVENTS.HP_MODIFIED, callback);
  }

  public emitInventoryUpdate(payload: ItemEquippedPayload) {
    this.socket?.emit(SOCKET_EVENTS.ITEM_EQUIPPED, payload);
  }

  public subscribeToInventoryUpdates(
    callback: (payload: ItemEquippedPayload) => void,
  ) {
    this.socket?.on(SOCKET_EVENTS.ITEM_EQUIPPED, callback);
  }

  public emitInventoryConsumed(payload: ItemConsumedPayload) {
    this.socket?.emit(SOCKET_EVENTS.ITEM_CONSUMED, payload);
  }

  public subscribeToConsumed(callback: (payload: ItemConsumedPayload) => void) {
    this.socket?.on(SOCKET_EVENTS.ITEM_CONSUMED, callback);
  }

  public disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const socketService = new SocketManager();
