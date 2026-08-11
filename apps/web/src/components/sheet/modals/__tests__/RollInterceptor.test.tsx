import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RollInterceptor } from "../RollInterceptor";

const storeState = {
  pendingRoll: null as null | {
    expression: string;
    reason: string;
    mode: "dice_expression" | "manual_total";
    targetLabel: string;
    allowDigitalRoll: boolean;
    manualPlaceholder: string;
    submitLabel: string;
  },
  fulfillRoll: vi.fn(),
  cancelRoll: vi.fn(),
};

vi.mock("../../../../store/rollStore", () => ({
  useRollStore: (
    selector?: (state: typeof storeState) => unknown,
  ) => (selector ? selector(storeState) : storeState),
}));

describe("RollInterceptor", () => {
  beforeEach(() => {
    storeState.pendingRoll = null;
    storeState.fulfillRoll.mockReset();
    storeState.cancelRoll.mockReset();
  });

  it("renders a manual-only prompt without the digital roll button", async () => {
    storeState.pendingRoll = {
      expression: "1d20",
      reason: "Enter the enemy attack total after disadvantage.",
      mode: "manual_total",
      targetLabel: "Enemy attack total",
      allowDigitalRoll: false,
      manualPlaceholder: "Attack total...",
      submitLabel: "Record",
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<RollInterceptor />);
    });

    expect(container.textContent).toContain("Enemy attack total");
    expect(container.textContent).not.toContain("Roll Digitally");

    const input = container.querySelector("input");
    expect(input?.getAttribute("placeholder")).toBe("Attack total...");

    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Record",
    );
    expect(button).toBeDefined();

    root.unmount();
    container.remove();
  });
});