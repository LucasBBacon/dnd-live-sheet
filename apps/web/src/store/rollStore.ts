import { create } from "zustand";

interface PendingRoll {
  expression: string;
  reason: string;
  resolve: (value: number) => void;
  reject: (reason?: unknown) => void;
}

interface RollStoreState {
  pendingRoll: PendingRoll | null;
  requestRoll: (expression: string, reason: string) => Promise<number>;
  fulfillRoll: (result: number) => void;
  cancelRoll: () => void;
}

export const useRollStore = create<RollStoreState>((set, get) => ({
  pendingRoll: null,

  requestRoll: (expression, reason) => {
    return new Promise((resolve, reject) => {
      // mount interceptor UI and store the promise resolver
      set({ pendingRoll: { expression, reason, resolve, reject } });
    });
  },

  fulfillRoll: (result) => {
    const { pendingRoll } = get();
    if (pendingRoll) {
      pendingRoll.resolve(result); // unblock the calling func
      set({ pendingRoll: null }); // dismount ui
    }
  },

  cancelRoll: () => {
    const { pendingRoll } = get();
    if (pendingRoll) {
      pendingRoll.reject(new Error("Roll cancelled"));
      set({ pendingRoll: null });
    }
  },
}));
