import { create } from "zustand";

export interface RollRequestOptions {
  mode?: "dice_expression" | "manual_total";
  targetLabel?: string;
  allowDigitalRoll?: boolean;
  manualPlaceholder?: string;
  submitLabel?: string;
}

interface PendingRoll {
  expression: string;
  reason: string;
  mode: "dice_expression" | "manual_total";
  targetLabel: string;
  allowDigitalRoll: boolean;
  manualPlaceholder: string;
  submitLabel: string;
  resolve: (value: number) => void;
  reject: (reason?: unknown) => void;
}

interface RollStoreState {
  pendingRoll: PendingRoll | null;
  requestRoll: (
    expression: string,
    reason: string,
    options?: RollRequestOptions,
  ) => Promise<number>;
  fulfillRoll: (result: number) => void;
  cancelRoll: () => void;
}

export const useRollStore = create<RollStoreState>((set, get) => ({
  pendingRoll: null,

  requestRoll: (expression, reason, options) => {
    return new Promise((resolve, reject) => {
      set({
        pendingRoll: {
          expression,
          reason,
          mode: options?.mode ?? "dice_expression",
          targetLabel: options?.targetLabel ?? expression,
          allowDigitalRoll: options?.allowDigitalRoll ?? true,
          manualPlaceholder: options?.manualPlaceholder ?? "Total...",
          submitLabel: options?.submitLabel ?? "Submit",
          resolve,
          reject,
        },
      });
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
